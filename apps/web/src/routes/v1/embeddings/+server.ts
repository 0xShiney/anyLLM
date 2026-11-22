import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { authenticate, limiter, recordUsage } from '$lib/server/engine/gateway';
import {
	abortIdempotent,
	beginIdempotent,
	completeIdempotent,
	requestFingerprint,
	replayResponse
} from '$lib/server/engine/idempotency';
import { adapterFor } from '$lib/server/engine/adapters';
import { computeCost } from '$lib/server/engine/pricing';
import { Ledger } from '$lib/server/engine/ledger';

const ENDPOINT = 'embeddings';

export const POST: RequestHandler = async ({ request }) => {
	const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
	const raw = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
	const db = getDb();
	const auth = raw ? authenticate(db, raw) : null;
	if (!auth)
		return json({ error: { type: 'invalid_api_key', message: 'Kunci API tidak valid.', request_id: requestId } }, { status: 401 });

	const body = (await request.json().catch(() => null)) as { model?: string; input?: string | string[] } | null;
	if (!body?.model || !body.input)
		return json({ error: { type: 'invalid_request_error', message: 'model dan input wajib diisi.', request_id: requestId } }, { status: 400 });

	const price = db.prepare('SELECT * FROM models WHERE id = ? AND enabled = 1').get(body.model) as
		| { provider: string; input_micros: number; output_micros: number; cached_micros: number; markup_pct: number }
		| undefined;
	if (!price)
		return json({ error: { type: 'model_not_found', message: `Model ${body.model} tidak aktif.`, request_id: requestId } }, { status: 404 });

	const adapter = adapterFor(price.provider, body.model);
	if (!adapter.embeddings)
		return json({ error: { type: 'invalid_request_error', message: 'Model ini tidak mendukung embeddings.', request_id: requestId } }, { status: 400 });

	// Idempotency-Key: respons tersimpan diputar ulang tanpa hold dan tanpa debit kedua.
	const idempotencyKey = request.headers.get('idempotency-key');
	let guardKey: string | null = null;
	if (idempotencyKey !== null) {
		const begin = beginIdempotent(db, auth.key.id, ENDPOINT, idempotencyKey, requestFingerprint(body));
		if (begin.kind === 'invalid')
			return json(
				{ error: { type: 'invalid_request_error', code: 'invalid_idempotency_key', message: begin.message, request_id: requestId } },
				{ status: 400, headers: { 'x-request-id': requestId } }
			);
		if (begin.kind === 'conflict')
			return json(
				{ error: { type: 'idempotency_error', code: 'idempotency_key_reuse', message: begin.message, request_id: requestId } },
				{ status: 409, headers: { 'x-request-id': requestId } }
			);
		if (begin.kind === 'in_progress')
			return json(
				{
					error: {
						type: 'idempotency_error',
						code: 'idempotency_in_progress',
						message: 'Request dengan Idempotency-Key ini masih diproses. Coba lagi.',
						request_id: requestId
					}
				},
				{ status: 409, headers: { 'x-request-id': requestId, 'retry-after': String(begin.retryAfter) } }
			);
		if (begin.kind === 'replay') return replayResponse(begin.response);
		guardKey = idempotencyKey;
	}

	const release = () => {
		if (guardKey) abortIdempotent(db, auth.key.id, ENDPOINT, guardKey);
	};

	const gate = limiter.take(auth.key.id, auth.key.rpm);
	if (!gate.ok) {
		release();
		return json(
			{ error: { type: 'rate_limit_exceeded', message: 'Batas RPM terlampaui.', request_id: requestId } },
			{ status: 429, headers: { 'retry-after': String(gate.retryAfter) } }
		);
	}

	const inputs = Array.isArray(body.input) ? body.input : [body.input];
	const ledger = new Ledger(db);
	const hold = Math.max(1, Math.ceil(((inputs.join('').length / 4) * price.input_micros) / 1_000_000));
	if (!ledger.hold(auth.org.id, requestId, hold)) {
		release();
		return json(
			{ error: { type: 'insufficient_quota', message: 'Saldo tidak cukup.', request_id: requestId } },
			{ status: 402, headers: { 'x-request-id': requestId } }
		);
	}

	try {
		const out = await adapter.embeddings(body.model, inputs);
		const cost = computeCost(price, out.usage).costMicros;
		const billed = Math.round(cost * (1 + price.markup_pct / 100));
		ledger.settle(auth.org.id, requestId, billed, `Embeddings ${body.model}`, requestId);
		recordUsage(db, {
			requestId,
			auth,
			tag: request.headers.get('x-tag'),
			model: body.model,
			provider: price.provider,
			usage: out.usage,
			costMicros: cost,
			billedMicros: billed,
			latencyMs: 1,
			status: 'ok',
			stream: false,
			estimated: false,
			simulated: !adapter.live
		});
		const payload = {
			object: 'list',
			data: out.vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })),
			model: body.model,
			usage: { prompt_tokens: out.usage.prompt_tokens, total_tokens: out.usage.prompt_tokens }
		};
		const responseHeaders = {
			'x-request-id': requestId,
			'x-anyllm-cost-micros': String(cost),
			'x-anyllm-simulated': String(!adapter.live)
		};
		if (guardKey)
			completeIdempotent(db, auth.key.id, ENDPOINT, guardKey, {
				status: 200,
				body: JSON.stringify(payload),
				contentType: 'application/json',
				headers: responseHeaders
			});
		return json(payload, { headers: responseHeaders });
	} catch (err) {
		ledger.release(requestId);
		release();
		return json(
			{ error: { type: 'upstream_error', message: (err as Error).message, request_id: requestId } },
			{ status: 502, headers: { 'x-request-id': requestId } }
		);
	}
};
