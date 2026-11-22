import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { computeCost, estimateMaxCost, estimateTokens } from './pricing';
import { CircuitBreaker, resolvePreset, resolveRoute } from './router';
import { Ledger } from './ledger';
import { ResponseCache, RateLimiter } from './limiter';
import { adapterFor } from './adapters';
import { encryptFor } from './crypto';
import type { ChatRequest, ChatResult, StreamDelta, Usage } from './types';

export const limiter = new RateLimiter();
export const cache = new ResponseCache();
export const breaker = new CircuitBreaker();

export type ApiKeyRow = {
	id: string;
	project_id: string;
	name: string;
	prefix: string;
	status: string;
	scopes: string;
	rpm: number | null;
	daily_budget_micros: number | null;
	monthly_budget_micros: number | null;
	expires_at: string | null;
};
type ProjectRow = { id: string; org_id: string; name: string; logging_enabled: number; retention_days: number; zdr: number };
type OrgRow = { id: string; name: string; balance_micros: number; zdr: number; logging_enabled: number };

export type GatewayAuth = { key: ApiKeyRow; project: ProjectRow; org: OrgRow };

export function authenticate(db: DatabaseSync, rawKey: string): GatewayAuth | null {
	const hash = createHash('sha256').update(rawKey).digest('hex');
	const key = db.prepare('SELECT * FROM api_keys WHERE hash = ?').get(hash) as unknown as ApiKeyRow | undefined;
	if (!key || key.status !== 'active') return null;
	if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return null;
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(key.project_id) as unknown as ProjectRow | undefined;
	if (!project) return null;
	const org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(project.org_id) as unknown as OrgRow | undefined;
	if (!org) return null;
	db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), key.id);
	return { key, project, org };
}

export function budgetExceeded(db: DatabaseSync, auth: GatewayAuth): { exceeded: boolean; scope?: string } {
	const now = new Date();
	const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
	const spent = (since: string) =>
		(db
			.prepare('SELECT COALESCE(SUM(billed_micros),0) AS s FROM usage WHERE api_key_id = ? AND created_at >= ?')
			.get(auth.key.id, since) as { s: number }).s;
	if (auth.key.daily_budget_micros && spent(dayStart) >= auth.key.daily_budget_micros) return { exceeded: true, scope: 'harian' };
	if (auth.key.monthly_budget_micros && spent(monthStart) >= auth.key.monthly_budget_micros)
		return { exceeded: true, scope: 'bulanan' };
	return { exceeded: false };
}

export type UsageRecord = {
	requestId: string;
	auth: GatewayAuth;
	tag: string | null;
	model: string;
	provider: string;
	usage: Usage;
	costMicros: number;
	billedMicros: number;
	latencyMs: number;
	status: string;
	stream: boolean;
	estimated: boolean;
	simulated: boolean;
	truncated?: boolean;
};

export function recordUsage(db: DatabaseSync, r: UsageRecord): void {
	db.prepare(
		`INSERT INTO usage (request_id, org_id, project_id, api_key_id, tag, model, provider, prompt_tokens, completion_tokens, cached_tokens, cost_micros, billed_micros, latency_ms, status, stream, estimated, simulated, truncated, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
	).run(
		r.requestId,
		r.auth.org.id,
		r.auth.project.id,
		r.auth.key.id,
		r.tag,
		r.model,
		r.provider,
		r.usage.prompt_tokens,
		r.usage.completion_tokens,
		r.usage.cached_tokens ?? 0,
		r.costMicros,
		r.billedMicros,
		r.latencyMs,
		r.status,
		r.stream ? 1 : 0,
		r.estimated ? 1 : 0,
		r.simulated ? 1 : 0,
		r.truncated ? 1 : 0,
		new Date().toISOString()
	);
}

function maybeLogPrompt(db: DatabaseSync, auth: GatewayAuth, requestId: string, tag: string | null, model: string, req: ChatRequest, text: string) {
	if (!auth.project.logging_enabled || auth.project.zdr) return;
	const payload = JSON.stringify({
		prompt: req.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'),
		response: text
	});
	db.prepare(
		'INSERT INTO prompt_logs (project_id, request_id, tag, model, payload_enc, expires_at, created_at) VALUES (?,?,?,?,?,?,?)'
	).run(
		auth.project.id,
		requestId,
		tag,
		model,
		encryptFor(auth.project.id, payload),
		new Date(Date.now() + auth.project.retention_days * 86_400_000).toISOString(),
		new Date().toISOString()
	);
}

export type Outcome = {
	model: string;
	provider: string;
	billedMicros: number;
	costMicros: number;
	cacheHit: boolean;
	simulated: boolean;
	estimated: boolean;
	attempts: string[];
	finish_reason: string;
};

type Plan = {
	chain: ReturnType<typeof resolveRoute>['chain'];
	reason: string;
	promptTokens: number;
	maxTokens: number;
	holdMicros: number;
	cacheKey: string | null;
};

export function planRequest(db: DatabaseSync, auth: GatewayAuth, req: ChatRequest, tag: string | null): Plan {
	const preset = req.model.startsWith('@preset/') ? resolvePreset(db, auth.org.id, req.model.slice(8)) : null;
	if (req.model.startsWith('@preset/') && !preset)
		throw Object.assign(new Error(`Preset ${req.model} tidak ditemukan`), { code: 'preset_not_found' });

	const route = resolveRoute(db, auth.org.id, preset ? { ...req, model: preset.models[0] } : req, {
		tag: tag ?? undefined,
		presetModels: preset?.models,
		skipRules: !!req.models?.length
	});

	const promptText = req.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
	const promptTokens = estimateTokens(promptText);
	const maxTokens = req.max_tokens ?? 1024;
	const holdMicros = estimateMaxCost(route.chain[0].price, promptTokens, maxTokens);

	return {
		chain: route.chain,
		reason: route.reason,
		promptTokens,
		maxTokens,
		holdMicros,
		cacheKey: auth.project.zdr ? null : cache.key(auth.key.id, req.model, req.messages)
	};
}

export type ChatOutcome = Outcome & { result: ChatResult };

export async function completeChat(
	db: DatabaseSync,
	auth: GatewayAuth,
	req: ChatRequest,
	tag: string | null,
	requestId: string
): Promise<ChatOutcome> {
	const over = budgetExceeded(db, auth);
	if (over.exceeded)
		throw Object.assign(new Error(`Budget ${over.scope} key ini sudah habis.`), { code: 'budget_exceeded' });
	const plan = planRequest(db, auth, req, tag);
	const book = new Ledger(db);
	const attempts: string[] = [];

	// Cache exact-match: tidak menagih saat hit.
	if (plan.cacheKey) {
		const hit = cache.get(plan.cacheKey);
		if (hit) {
			const parsed = JSON.parse(hit) as ChatResult;
			return {
				result: parsed,
				model: plan.chain[0].model,
				provider: plan.chain[0].provider,
				billedMicros: 0,
				costMicros: 0,
				cacheHit: true,
				simulated: false,
				estimated: false,
				attempts: ['cache'],
				finish_reason: parsed.finish_reason
			};
		}
	}

	if (!book.hold(auth.org.id, requestId, plan.holdMicros)) {
		throw Object.assign(new Error('Saldo tidak cukup untuk request ini.'), { code: 'insufficient_balance' });
	}

	const started = Date.now();
	let lastErr: unknown = null;
	for (let i = 0; i < plan.chain.length; i++) {
		const target = plan.chain[i];
		if (breaker.isOpen(target.provider)) {
			attempts.push(`${target.model}: circuit open`);
			continue;
		}
		const adapter = adapterFor(target.provider, target.model);
		try {
			const result = await adapter.complete(target.model, { ...req, messages: req.messages, max_tokens: plan.maxTokens });
			breaker.recordSuccess(target.provider);
			const cost = computeCost(target.price, result.usage);
			const billed = Math.round(cost.costMicros * (1 + target.price.markup_pct / 100));
			book.settle(auth.org.id, requestId, billed, `Pemakaian ${target.model}`, requestId);
			attempts.push(`${target.model}: ok`);
			recordUsage(db, {
				requestId,
				auth,
				tag,
				model: target.model,
				provider: target.provider,
				usage: result.usage,
				costMicros: cost.costMicros,
				billedMicros: billed,
				latencyMs: Date.now() - started,
				status: 'ok',
				stream: false,
				estimated: false,
				simulated: !adapter.live
			});
			maybeLogPrompt(db, auth, requestId, tag, target.model, req, result.text);
			if (plan.cacheKey) cache.set(plan.cacheKey, JSON.stringify(result), 3600);
			return {
				result,
				model: target.model,
				provider: target.provider,
				billedMicros: billed,
				costMicros: cost.costMicros,
				cacheHit: false,
				simulated: !adapter.live,
				estimated: false,
				attempts,
				finish_reason: result.finish_reason
			};
		} catch (err) {
			lastErr = err;
			breaker.recordFailure(target.provider);
			attempts.push(`${target.model}: ${(err as Error).message.slice(0, 80)}`);
		}
	}

	book.release(requestId);
	recordUsage(db, {
		requestId,
		auth,
		tag,
		model: plan.chain[0].model,
		provider: plan.chain[0].provider,
		usage: { prompt_tokens: plan.promptTokens, completion_tokens: 0 },
		costMicros: 0,
		billedMicros: 0,
		latencyMs: Date.now() - started,
		status: 'provider_error',
		stream: false,
		estimated: false,
		simulated: true
	});
	throw Object.assign(new Error(`Provider gagal: ${(lastErr as Error)?.message ?? 'tidak diketahui'}`), {
		code: 'provider_error',
		attempts
	});
}

/** Streaming: menagih token yang benar-benar terkirim, termasuk saat klien memutus di tengah. */
export async function streamChat(
	db: DatabaseSync,
	auth: GatewayAuth,
	req: ChatRequest,
	tag: string | null,
	requestId: string
): Promise<{ events: AsyncGenerator<StreamDelta & { model: string }>; outcome: () => Outcome | null }> {
	const over = budgetExceeded(db, auth);
	if (over.exceeded)
		throw Object.assign(new Error(`Budget ${over.scope} key ini sudah habis.`), { code: 'budget_exceeded' });
	const plan = planRequest(db, auth, req, tag);
	const book = new Ledger(db);
	if (!book.hold(auth.org.id, requestId, plan.holdMicros)) {
		throw Object.assign(new Error('Saldo tidak cukup untuk request ini.'), { code: 'insufficient_balance' });
	}

	let final: Outcome | null = null;
	const started = Date.now();

	async function* generate(): AsyncGenerator<StreamDelta & { model: string }> {
		let text = '';
		let usage: Usage | null = null;
		let simulated = true;
		let target: (typeof plan.chain)[number] | null = null;
		let adapter: ReturnType<typeof adapterFor> | null = null;
		const attempts: string[] = [];

		try {
			for (const candidate of plan.chain) {
				if (breaker.isOpen(candidate.provider)) continue;
				const a = adapterFor(candidate.provider, candidate.model);
				try {
					if (a.stream) {
						for await (const d of a.stream(candidate.model, { ...req, max_tokens: plan.maxTokens })) {
							if (d.delta) {
								text += d.delta;
								yield { ...d, model: candidate.model };
							}
							if (d.usage) usage = d.usage;
						}
					} else {
						const res = await a.complete(candidate.model, { ...req, max_tokens: plan.maxTokens });
						text = res.text;
						usage = res.usage;
						yield { delta: res.text, model: candidate.model };
					}
					target = candidate;
					adapter = a;
					attempts.push(`${candidate.model}: ok`);
					breaker.recordSuccess(candidate.provider);
					break;
				} catch (err) {
					breaker.recordFailure(candidate.provider);
					attempts.push(`${candidate.model}: ${(err as Error).message.slice(0, 80)}`);
				}
			}

			if (!target || !adapter) throw new Error('Semua provider gagal');

			const finalUsage: Usage = usage ?? {
				prompt_tokens: estimateTokens(req.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n')),
				completion_tokens: estimateTokens(text)
			};
			const cost = computeCost(target.price, finalUsage);
			const billed = Math.round(cost.costMicros * (1 + target.price.markup_pct / 100));
			book.settle(auth.org.id, requestId, billed, `Pemakaian ${target.model} (stream)`, requestId);
			recordUsage(db, {
				requestId,
				auth,
				tag,
				model: target.model,
				provider: target.provider,
				usage: finalUsage,
				costMicros: cost.costMicros,
				billedMicros: billed,
				latencyMs: Date.now() - started,
				status: 'ok',
				stream: true,
				estimated: !usage,
				simulated: !adapter.live
			});
			maybeLogPrompt(db, auth, requestId, tag, target.model, req, text);
			final = {
				model: target.model,
				provider: target.provider,
				billedMicros: billed,
				costMicros: cost.costMicros,
				cacheHit: false,
				simulated: !adapter.live,
				estimated: !usage,
				attempts,
				finish_reason: 'stop'
			};
			yield { usage: finalUsage, finish_reason: 'stop', model: target.model };
		} finally {
			// Klien memutus stream: tetap tagih token yang sudah dikirim.
			if (!final) {
				const fallbackUsage: Usage = usage ?? {
					prompt_tokens: plan.promptTokens,
					completion_tokens: estimateTokens(text)
				};
				const price = plan.chain[0].price;
				const cost = computeCost(price, fallbackUsage);
				const billed = Math.round(cost.costMicros * (1 + price.markup_pct / 100));
				book.settle(auth.org.id, requestId, billed, 'Pemakaian stream terputus', requestId);
				recordUsage(db, {
					requestId,
					auth,
					tag,
					model: plan.chain[0].model,
					provider: plan.chain[0].provider,
					usage: fallbackUsage,
					costMicros: cost.costMicros,
					billedMicros: billed,
					latencyMs: Date.now() - started,
					status: text ? 'ok' : 'client_aborted',
					stream: true,
					estimated: true,
					simulated: true,
					truncated: true
				});
				final = {
					model: plan.chain[0].model,
					provider: plan.chain[0].provider,
					billedMicros: billed,
					costMicros: cost.costMicros,
					cacheHit: false,
					simulated: true,
					estimated: true,
					attempts: ['client aborted'],
					finish_reason: 'aborted'
				};
			}
		}
	}

	return { events: generate(), outcome: () => final };
}
