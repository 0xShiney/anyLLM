import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { authenticate, completeChat, limiter, streamChat } from '$lib/server/engine/gateway';
import {
	abortIdempotent,
	beginIdempotent,
	completeIdempotent,
	requestFingerprint,
	replayResponse
} from '$lib/server/engine/idempotency';
import type { ChatRequest } from '$lib/server/engine/types';

const MAX_BODY_BYTES = 1_000_000;
const ERRORS: Record<string, { status: number; type: string }> = {
	invalid_api_key: { status: 401, type: 'invalid_api_key' },
	invalid_request: { status: 400, type: 'invalid_request_error' },
	invalid_json: { status: 400, type: 'invalid_request_error' },
	payload_too_large: { status: 413, type: 'invalid_request_error' },
	rate_limited: { status: 429, type: 'rate_limit_exceeded' },
	insufficient_balance: { status: 402, type: 'insufficient_quota' },
	budget_exceeded: { status: 429, type: 'rate_limit_exceeded' },
	provider_error: { status: 502, type: 'upstream_error' },
	no_model: { status: 404, type: 'model_not_found' },
	preset_not_found: { status: 404, type: 'preset_not_found' },
	invalid_idempotency_key: { status: 400, type: 'invalid_request_error' },
	idempotency_key_reuse: { status: 409, type: 'idempotency_error' },
	idempotency_in_progress: { status: 409, type: 'idempotency_error' }
};

const ENDPOINT = 'chat.completions';

function fail(requestId: string, code: string, message: string, headers: Record<string, string> = {}) {
	const mapped = ERRORS[code] ?? { status: 400, type: 'invalid_request_error' };
	return json(
		{ error: { type: mapped.type, code, message, request_id: requestId } },
		{ status: mapped.status, headers: { 'x-request-id': requestId, ...headers } }
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
	const authHeader = request.headers.get('authorization') ?? '';
	const raw = authHeader.replace(/^Bearer\s+/i, '').trim();
	if (!raw) return fail(requestId, 'invalid_api_key', 'Header Authorization Bearer wajib diisi.');

	const db = getDb();
	const auth = authenticate(db, raw);
	if (!auth) return fail(requestId, 'invalid_api_key', 'Kunci API tidak valid, kedaluwarsa, atau diblokir.');

	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_BODY_BYTES) return fail(requestId, 'payload_too_large', 'Ukuran body melebihi 1 MB.');

	let body: ChatRequest;
	try {
		body = (await request.json()) as ChatRequest;
	} catch {
		return fail(requestId, 'invalid_json', 'Body bukan JSON yang valid.');
	}
	if (!body?.model || !Array.isArray(body.messages) || body.messages.length === 0)
		return fail(requestId, 'invalid_request', 'Field model dan messages wajib diisi.');

	// Idempotency-Key: permintaan ulang menerima respons tersimpan, tanpa tagihan kedua.
	const idempotencyKey = request.headers.get('idempotency-key');
	let guardKey: string | null = null;
	if (idempotencyKey !== null) {
		const begin = beginIdempotent(db, auth.key.id, ENDPOINT, idempotencyKey, requestFingerprint(body));
		if (begin.kind === 'invalid') return fail(requestId, 'invalid_idempotency_key', begin.message);
		if (begin.kind === 'conflict') return fail(requestId, 'idempotency_key_reuse', begin.message);
		if (begin.kind === 'in_progress')
			return fail(requestId, 'idempotency_in_progress', 'Request dengan Idempotency-Key ini masih diproses. Coba lagi.', {
				'retry-after': String(begin.retryAfter)
			});
		if (begin.kind === 'replay') return replayResponse(begin.response);
		guardKey = idempotencyKey;
	}

	const gate = limiter.take(auth.key.id, auth.key.rpm);
	if (!gate.ok)
		return fail(requestId, 'rate_limited', 'Batas request per menit untuk kunci ini terlampaui.', {
			'retry-after': String(gate.retryAfter)
		});

	const tag = request.headers.get('x-tag')?.slice(0, 60) ?? null;
	const headers = {
		'x-request-id': requestId,
		'x-anyllm-project': auth.project.name,
		'cache-control': 'no-store'
	};

	if (body.stream) {
		let session: Awaited<ReturnType<typeof streamChat>>;
		try {
			session = await streamChat(db, auth, body, tag, requestId);
		} catch (err) {
			const code = (err as { code?: string }).code ?? 'provider_error';
			return fail(requestId, code, (err as Error).message);
		}
		const created = Math.floor(Date.now() / 1000);
		const chunks: string[] = [];
		let frames = 0;
		let stored = false;
		const storeStream = () => {
			if (!guardKey || stored) return;
			stored = true;
			completeIdempotent(db, auth.key.id, ENDPOINT, guardKey, {
				status: 200,
				body: chunks.join(''),
				contentType: 'text/event-stream; charset=utf-8',
				headers
			});
		};
		const releaseKey = () => {
			if (guardKey) abortIdempotent(db, auth.key.id, ENDPOINT, guardKey);
		};
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const encoder = new TextEncoder();
				const send = (obj: unknown) => {
					const frame = `data: ${JSON.stringify(obj)}\n\n`;
					chunks.push(frame);
					controller.enqueue(encoder.encode(frame));
				};
				try {
					for await (const event of session.events) {
						if (event.delta) {
							send({
								id: requestId,
								object: 'chat.completion.chunk',
								created,
								model: event.model,
								choices: [{ index: 0, delta: { content: event.delta }, finish_reason: null }]
							});
							frames += 1;
						}
						if (event.finish_reason) {
							send({
								id: requestId,
								object: 'chat.completion.chunk',
								created,
								model: event.model,
								choices: [{ index: 0, delta: {}, finish_reason: event.finish_reason }],
								usage: event.usage
									? {
											prompt_tokens: event.usage.prompt_tokens,
											completion_tokens: event.usage.completion_tokens,
											total_tokens: event.usage.prompt_tokens + event.usage.completion_tokens
										}
									: undefined
							});
						}
					}
					chunks.push('data: [DONE]\n\n');
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					storeStream();
					controller.close();
				} catch (err) {
					send({ error: { type: 'upstream_error', message: (err as Error).message, request_id: requestId } });
					// Token yang sudah terkirim tetap ditagih, jadi respons parsial disimpan agar retry tidak menagih dua kali.
					if (frames > 0) storeStream();
					else releaseKey();
					controller.close();
				}
			},
			cancel() {
				// Klien memutus stream: generator diberhentikan agar token terkirim tetap ditagih.
				void session.events.return(undefined as never);
				if (frames > 0) storeStream();
				else releaseKey();
			}
		});
		const outcome = session.outcome;
		return new Response(stream, {
			headers: {
				...headers,
				'content-type': 'text/event-stream; charset=utf-8',
				'x-anyllm-cost-micros': String(outcome()?.costMicros ?? 0),
				'x-anyllm-simulated': String(outcome()?.simulated ?? false)
			}
		});
	}

	try {
		const out = await completeChat(db, auth, body, tag, requestId);
		const responseHeaders = {
			...headers,
			'x-anyllm-model': out.model,
			'x-anyllm-provider': out.provider,
			'x-anyllm-cost-micros': String(out.costMicros),
			'x-anyllm-billed-micros': String(out.billedMicros),
			'x-anyllm-simulated': String(out.simulated),
			'x-anyllm-fallback': out.attempts.length > 1 ? 'true' : 'false'
		};
		const payload = {
			id: requestId,
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: out.model,
			choices: [{ index: 0, message: { role: 'assistant', content: out.result.text }, finish_reason: out.result.finish_reason }],
			usage: {
				prompt_tokens: out.result.usage.prompt_tokens,
				completion_tokens: out.result.usage.completion_tokens,
				total_tokens: out.result.usage.prompt_tokens + out.result.usage.completion_tokens,
				cached_tokens: out.result.usage.cached_tokens ?? 0
			},
			cost: { micros: out.billedMicros, currency: 'IDR', cache_hit: out.cacheHit }
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
		if (guardKey) abortIdempotent(db, auth.key.id, ENDPOINT, guardKey);
		const code = (err as { code?: string }).code ?? 'provider_error';
		return fail(requestId, code, (err as Error).message);
	}
};
