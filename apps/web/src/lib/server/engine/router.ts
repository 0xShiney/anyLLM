import type { DatabaseSync } from 'node:sqlite';
import type { ChatRequest, ModelTarget, PriceRow } from './types';

/** Circuit breaker per provider: 3 kegagalan dalam 60 detik membuka sirkuit 30 detik. */
export class CircuitBreaker {
	private state = new Map<string, { failures: number; openedAt: number | null }>();
	constructor(
		private threshold = 3,
		private cooldownMs = 30_000
	) {}

	isOpen(provider: string, now = Date.now()): boolean {
		const s = this.state.get(provider);
		if (!s?.openedAt) return false;
		if (now - s.openedAt > this.cooldownMs) {
			this.state.delete(provider);
			return false;
		}
		return true;
	}

	recordFailure(provider: string, now = Date.now()): void {
		const s = this.state.get(provider) ?? { failures: 0, openedAt: null };
		s.failures += 1;
		if (s.failures >= this.threshold) s.openedAt = now;
		this.state.set(provider, s);
	}

	recordSuccess(provider: string): void {
		this.state.delete(provider);
	}

	status(): { provider: string; open: boolean }[] {
		return [...this.state.keys()].map((provider) => ({ provider, open: this.isOpen(provider) }));
	}
}

type ModelRow = PriceRow & { sort: number };

function loadModels(db: DatabaseSync): ModelRow[] {
	return db.prepare('SELECT * FROM models WHERE enabled = 1 AND visible = 1').all() as unknown as ModelRow[];
}

function recentLatency(db: DatabaseSync): Map<string, number> {
	const rows = db
		.prepare(
			`SELECT model, AVG(latency_ms) AS avg FROM usage
			 WHERE status = 'ok' AND created_at > ? GROUP BY model`
		)
		.all(new Date(Date.now() - 7 * 86_400_000).toISOString()) as unknown as { model: string; avg: number }[];
	return new Map(rows.map((r) => [r.model, r.avg]));
}

export type RouterOptions = {
	tag?: string;
	presetModels?: string[];
	/** Saat true, aturan tag tidak dipakai karena pemanggil minta model eksplisit. */
	skipRules?: boolean;
};

export type Route = {
	chain: ModelTarget[];
	reason: string;
	/** true bila ada aturan Replay Lab yang dipakai. */
	ruleApplied: boolean;
};

export function resolveRoute(db: DatabaseSync, orgId: string, req: ChatRequest, opts: RouterOptions = {}): Route {
	const models = loadModels(db);
	if (models.length === 0) throw Object.assign(new Error('Katalog model kosong'), { code: 'no_model' });
	const byId = new Map(models.map((m) => [m.id, m]));
	const latency = recentLatency(db);

	const wants = (id: string): ModelTarget | null => {
		const m = byId.get(id);
		return m ? { model: m.id, provider: m.provider, price: m, reason: 'explicit' } : null;
	};

	const applyFilters = (list: ModelTarget[]): ModelTarget[] => {
		const p = req.provider ?? {};
		return list.filter((t) => {
			if (p.only?.length && !p.only.includes(t.provider)) return false;
			if (p.ignore?.includes(t.provider)) return false;
			if (p.max_price && t.price.output_micros / 1_000_000 > p.max_price) return false;
			return true;
		});
	};

	const sortBy = (list: ModelRow[], mode: 'price' | 'latency' | 'throughput') => {
		const copy = [...list];
		if (mode === 'latency') return copy.sort((a, b) => (latency.get(a.id) ?? 9e9) - (latency.get(b.id) ?? 9e9));
		if (mode === 'throughput') return copy.sort((a, b) => (latency.get(a.id) ?? 9e9) / (a.output_micros || 1) - (latency.get(b.id) ?? 9e9) / (b.output_micros || 1));
		return copy.sort((a, b) => a.input_micros + a.output_micros - (b.input_micros + b.output_micros));
	};

	let chain: ModelTarget[] = [];
	let reason = 'default';
	let ruleApplied = false;

	// 1. Preferensi eksplisit di request menang atas preset dan aturan.
	if (req.models?.length) {
		chain = req.models.map(wants).filter((x): x is ModelTarget => !!x);
		reason = 'preferensi request (models)';
	} else if (opts.presetModels?.length) {
		chain = opts.presetModels.map(wants).filter((x): x is ModelTarget => !!x);
		reason = 'preset';
		if (!chain.length) throw Object.assign(new Error('Preset merujuk model yang tidak aktif'), { code: 'no_model' });
	} else if (req.model === 'auto-murah' || req.model === 'auto-cepat') {
		const mode = req.model === 'auto-murah' ? 'price' : 'latency';
		const allowed = sortBy(models, req.provider?.sort ?? mode);
		chain = allowed.slice(0, 3).map((m) => ({ model: m.id, provider: m.provider, price: m, reason: 'alias' as const }));
		reason = `alias ${req.model}`;
	} else {
		const direct = wants(req.model);
		if (direct) {
			chain = [direct];
			reason = 'model eksplisit';
		}
	}

	// 2. Aturan Replay Lab per tag menang atas alias/default, kalah dari model eksplisit.
	const explicitChoice = !!req.models?.length || !!opts.presetModels?.length || reason === 'model eksplisit';
	if (!opts.skipRules && opts.tag && !explicitChoice) {
		const rule = db
			.prepare(
				`SELECT * FROM routing_rules WHERE org_id = ? AND tag = ? AND status = 'active'
				 ORDER BY version DESC LIMIT 1`
			)
			.get(orgId, opts.tag) as { target_model: string; fallback_model: string; version: number } | undefined;
		if (rule) {
			const target = wants(rule.target_model);
			if (target) {
				const fallback = wants(rule.fallback_model);
				const rest = chain.filter((c) => c.model !== target.model && c.model !== rule.fallback_model);
				chain = [target, ...(fallback ? [fallback] : []), ...rest];
				reason = `aturan Replay Lab untuk tag "${opts.tag}" v${rule.version}`;
				ruleApplied = true;
			}
		}
	}

	if (!chain.length) {
		chain = sortBy(models, req.provider?.sort ?? 'price')
			.slice(0, 3)
			.map((m) => ({ model: m.id, provider: m.provider, price: m, reason: 'default' as const }));
		reason = 'fallback otomatis (model tidak dikenal)';
	}

	chain = applyFilters(chain);
	if (!chain.length) throw Object.assign(new Error('Tidak ada model yang cocok dengan preferensi provider'), { code: 'no_model' });

	// 3. Fallback otomatis bila diizinkan.
	if (req.provider?.allow_fallbacks !== false) {
		const extra = sortBy(models, 'price')
			.filter((m) => !chain.some((c) => c.model === m.id))
			.slice(0, 2)
			.map((m) => ({ model: m.id, provider: m.provider, price: m, reason: 'fallback' as const }));
		chain = [...chain, ...extra];
	}

	return { chain, reason, ruleApplied };
}

export function resolvePreset(db: DatabaseSync, orgId: string, slug: string, version?: number) {
	const row = db
		.prepare(
			`SELECT config FROM presets WHERE org_id = ? AND slug = ? ${version ? 'AND version = ?' : ''}
			 ORDER BY version DESC LIMIT 1`
		)
		.get(...(version ? [orgId, slug, version] : [orgId, slug])) as { config: string } | undefined;
	return row ? (JSON.parse(row.config) as { models: string[]; params?: Record<string, unknown> }) : null;
}
