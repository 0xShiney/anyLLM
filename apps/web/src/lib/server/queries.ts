import type { DatabaseSync } from 'node:sqlite';

export type Totals = {
	requests: number;
	spend: number;
	tokens: number;
	errors: number;
	avgLatency: number;
	p95Latency: number;
	simulated: number;
};

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export function totals(db: DatabaseSync, orgId: string, days = 30): Totals {
	const rows = db
		.prepare(
			`SELECT COUNT(*) AS requests, COALESCE(SUM(billed_micros),0) AS spend,
			 COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
			 SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors,
			 COALESCE(AVG(latency_ms),0) AS avg_latency,
			 COALESCE(SUM(simulated),0) AS simulated
			 FROM usage WHERE org_id = ? AND created_at > ?`
		)
		.get(orgId, since(days)) as Record<string, number>;
	const latencies = (
		db
			.prepare('SELECT latency_ms FROM usage WHERE org_id = ? AND created_at > ? ORDER BY latency_ms')
			.all(orgId, since(days)) as unknown as { latency_ms: number }[]
	).map((r) => r.latency_ms);
	const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
	return {
		requests: rows.requests ?? 0,
		spend: rows.spend ?? 0,
		tokens: rows.tokens ?? 0,
		errors: rows.errors ?? 0,
		avgLatency: Math.round(rows.avg_latency ?? 0),
		p95Latency: p95,
		simulated: rows.simulated ?? 0
	};
}

export function totalsBetween(db: DatabaseSync, orgId: string, fromIso: string, toIso: string) {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS requests, COALESCE(SUM(billed_micros),0) AS spend,
			 SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors
			 FROM usage WHERE org_id = ? AND created_at >= ? AND created_at < ?`
		)
		.get(orgId, fromIso, toIso) as { requests: number; spend: number; errors: number };
	return row;
}

export function dailySeries(db: DatabaseSync, orgId: string, days = 30) {
	const rows = db
		.prepare(
			`SELECT substr(created_at,1,10) AS day, COALESCE(SUM(billed_micros),0) AS spend, COUNT(*) AS requests,
			 COALESCE(AVG(latency_ms),0) AS latency
			 FROM usage WHERE org_id = ? AND created_at > ? GROUP BY day ORDER BY day`
		)
		.all(orgId, since(days)) as unknown as { day: string; spend: number; requests: number; latency: number }[];
	return rows;
}

export function modelBreakdown(db: DatabaseSync, orgId: string, days = 30) {
	return db
		.prepare(
			`SELECT model, COUNT(*) AS requests, COALESCE(SUM(billed_micros),0) AS spend,
			 COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens, COALESCE(AVG(latency_ms),0) AS latency
			 FROM usage WHERE org_id = ? AND created_at > ? GROUP BY model ORDER BY spend DESC`
		)
		.all(orgId, since(days)) as unknown as {
		model: string;
		requests: number;
		spend: number;
		tokens: number;
		latency: number;
	}[];
}

export function tagBreakdown(db: DatabaseSync, orgId: string, days = 30) {
	return db
		.prepare(
			`SELECT tag, COUNT(*) AS requests, COALESCE(SUM(billed_micros),0) AS spend
			 FROM usage WHERE org_id = ? AND created_at > ? AND tag IS NOT NULL
			 GROUP BY tag ORDER BY spend DESC`
		)
		.all(orgId, since(days)) as unknown as { tag: string; requests: number; spend: number }[];
}

export type LogFilters = { tag?: string; model?: string; status?: string; keyId?: string; limit?: number; offset?: number };

export function logRows(db: DatabaseSync, orgId: string, f: LogFilters = {}) {
	const where = ['u.org_id = ?'];
	const args: (string | number)[] = [orgId];
	if (f.tag) {
		where.push('u.tag = ?');
		args.push(f.tag);
	}
	if (f.model) {
		where.push('u.model = ?');
		args.push(f.model);
	}
	if (f.status) {
		where.push('u.status = ?');
		args.push(f.status);
	}
	if (f.keyId) {
		where.push('u.api_key_id = ?');
		args.push(f.keyId);
	}
	const limit = Math.min(f.limit ?? 50, 200);
	const rows = db
		.prepare(
			`SELECT u.*, k.name AS key_name FROM usage u LEFT JOIN api_keys k ON k.id = u.api_key_id
			 WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
		)
		.all(...args, limit, f.offset ?? 0) as unknown as Record<string, string | number>[];
	const total = (
		db.prepare(`SELECT COUNT(*) AS n FROM usage u WHERE ${where.join(' AND ')}`).get(...args) as { n: number }
	).n;
	return { rows, total };
}

export function listKeys(db: DatabaseSync, orgId: string) {
	return db
		.prepare(
			`SELECT k.*, p.name AS project_name,
			 (SELECT COALESCE(SUM(billed_micros),0) FROM usage u WHERE u.api_key_id = k.id AND u.created_at > ?) AS spend_30d,
			 (SELECT COUNT(*) FROM usage u WHERE u.api_key_id = k.id AND u.created_at > ?) AS requests_30d
			 FROM api_keys k JOIN projects p ON p.id = k.project_id
			 WHERE p.org_id = ? ORDER BY k.created_at`
		)
		.all(since(30), since(30), orgId) as unknown as Record<string, string | number>[];
}

export type ModelListRow = {
	id: string;
	provider: string;
	label: string;
	context: number;
	input_micros: number;
	output_micros: number;
	cached_micros: number;
	markup_pct: number;
	enabled: number;
	visible: number;
	sort: number;
	health: { model: string; requests: number; latency: number; success: number } | null;
};

export function listModels(db: DatabaseSync): ModelListRow[] {
	const rows = db.prepare('SELECT * FROM models ORDER BY sort').all() as unknown as Record<string, string | number>[];
	const stats = new Map(
		(
			db
				.prepare(
					`SELECT model, COUNT(*) AS requests, COALESCE(AVG(latency_ms),0) AS latency,
					 AVG(CASE WHEN status = 'ok' THEN 1.0 ELSE 0 END) AS success
					 FROM usage WHERE created_at > ? GROUP BY model`
				)
				.all(since(7)) as unknown as { model: string; requests: number; latency: number; success: number }[]
		).map((s) => [s.model, s])
	);
	return rows.map((m) => ({ ...m, health: stats.get(String(m.id)) ?? null })) as ModelListRow[];
}

export function listRules(db: DatabaseSync, orgId: string) {
	return db.prepare('SELECT * FROM routing_rules WHERE org_id = ? ORDER BY tag, version DESC').all(orgId) as unknown as Record<
		string,
		string | number
	>[];
}

export function listPresets(db: DatabaseSync, orgId: string) {
	return db.prepare('SELECT * FROM presets WHERE org_id = ? ORDER BY slug, version DESC').all(orgId) as unknown as Record<
		string,
		string | number
	>[];
}

export function listTickets(db: DatabaseSync, orgId?: string) {
	return db
		.prepare(
			`SELECT t.*, o.name AS org_name FROM tickets t LEFT JOIN orgs o ON o.id = t.org_id
			 ${orgId ? 'WHERE t.org_id = ?' : ''} ORDER BY
			 CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, t.created_at DESC`
		)
		.all(...(orgId ? [orgId] : [])) as unknown as Record<string, string | number>[];
}

export function ticketMessages(db: DatabaseSync, ticketId: string, includeInternal: boolean) {
	return db
		.prepare(
			`SELECT * FROM ticket_messages WHERE ticket_id = ? ${includeInternal ? '' : 'AND internal = 0'} ORDER BY id`
		)
		.all(ticketId) as unknown as Record<string, string | number>[];
}

export function listLedger(db: DatabaseSync, orgId: string, limit = 60) {
	return db.prepare('SELECT * FROM ledger WHERE org_id = ? ORDER BY id DESC LIMIT ?').all(orgId, limit) as unknown as Record<
		string,
		string | number
	>[];
}

export function platformMetrics(db: DatabaseSync) {
	const t = totals(db, '', 1);
	const perProvider = db
		.prepare(
			`SELECT provider, COUNT(*) AS requests, COALESCE(AVG(latency_ms),0) AS latency,
			 AVG(CASE WHEN status = 'ok' THEN 1.0 ELSE 0 END) AS success
			 FROM usage WHERE created_at > ? GROUP BY provider`
		)
		.all(since(1)) as unknown as { provider: string; requests: number; latency: number; success: number }[];
	const overall = db
		.prepare(
			`SELECT COUNT(*) AS requests, COALESCE(SUM(billed_micros),0) AS revenue,
			 COALESCE(SUM(cost_micros),0) AS cost,
			 SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors,
			 COALESCE(AVG(latency_ms),0) AS latency
			 FROM usage WHERE created_at > ?`
		)
		.get(since(1)) as Record<string, number>;
	return {
		requests: overall.requests ?? 0,
		revenue: overall.revenue ?? 0,
		cost: overall.cost ?? 0,
		errors: overall.errors ?? 0,
		latency: Math.round(overall.latency ?? 0),
		perProvider,
		unused: t
	};
}

export function customers(db: DatabaseSync) {
	return db
		.prepare(
			`SELECT o.id, o.name, o.slug, o.balance_micros, o.created_at,
			 (SELECT COALESCE(SUM(billed_micros),0) FROM usage u WHERE u.org_id = o.id AND u.created_at > ?) AS spend_30d,
			 (SELECT COUNT(*) FROM usage u WHERE u.org_id = o.id AND u.created_at > ?) AS requests_30d,
			 (SELECT email FROM members m JOIN users x ON x.id = m.user_id WHERE m.org_id = o.id AND m.role = 'owner' LIMIT 1) AS owner_email,
			 (SELECT COUNT(*) FROM api_keys k JOIN projects p ON p.id = k.project_id WHERE p.org_id = o.id) AS keys
			 FROM orgs o ORDER BY spend_30d DESC`
		)
		.all(since(30), since(30)) as unknown as Record<string, string | number>[];
}
