import { getDb } from '$lib/server/db';
import { dailySeries, logRows, modelBreakdown, tagBreakdown, totals, totalsBetween } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const orgId = locals.user!.orgId;
	const now = Date.now();
	const prev = totalsBetween(
		db,
		orgId,
		new Date(now - 60 * 86_400_000).toISOString(),
		new Date(now - 30 * 86_400_000).toISOString()
	);
	const current = totals(db, orgId, 30);
	const savings = (
		db
			.prepare(
				`SELECT COALESCE(SUM(billed_micros),0) AS s FROM usage WHERE org_id = ? AND tag IN
				 (SELECT tag FROM routing_rules WHERE org_id = ? AND status = 'active') AND created_at > ?`
			)
			.get(orgId, orgId, new Date(now - 30 * 86_400_000).toISOString()) as { s: number }
	).s;

	const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
	const series = dailySeries(db, orgId, 30);
	const org = db.prepare('SELECT balance_micros FROM orgs WHERE id = ?').get(orgId) as { balance_micros: number };
	const rules = db
		.prepare("SELECT COUNT(*) AS n FROM routing_rules WHERE org_id = ? AND status = 'active'")
		.get(orgId) as { n: number };
	const replayCount = db.prepare('SELECT COUNT(*) AS n FROM replay_runs WHERE org_id = ?').get(orgId) as { n: number };

	return {
		current,
		prev,
					deltas: {
				// Periode pembanding kosong berarti belum ada data historis, bukan turun 100%.
				spend: prev.spend > 0 ? delta(current.spend, prev.spend) : null,
				requests: prev.requests > 0 ? delta(current.requests, prev.requests) : null,
				errors: prev.requests > 0 ? delta(current.errors, prev.errors) : null
			},
		series: series.map((s) => ({ label: s.day.slice(5).replace('-', '/'), value: s.spend })),
		models: modelBreakdown(db, orgId, 30),
		tags: tagBreakdown(db, orgId, 30),
		recent: logRows(db, orgId, { limit: 8 }).rows,
		balance: org.balance_micros,
		routedSpend: savings,
		activeRules: rules.n,
		replayCount: replayCount.n,
		simulated: current.simulated
	};
};
