import { getDb } from '$lib/server/db';
import { customers, platformMetrics } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const metrics = platformMetrics(db);
	const providerKeys = db.prepare('SELECT * FROM provider_keys ORDER BY provider').all() as unknown as Record<string, string | number>[];
	const replayQueue = db
		.prepare('SELECT status, COUNT(*) AS n FROM replay_runs GROUP BY status')
		.all() as unknown as { status: string; n: number }[];
	const recentAudit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 6').all() as unknown as Record<string, string | number>[];
	const flagged = db
		.prepare(
			`SELECT o.id, o.name, COALESCE(SUM(u.billed_micros),0) AS spend FROM orgs o
			 LEFT JOIN usage u ON u.org_id = o.id AND u.created_at > ?
			 GROUP BY o.id ORDER BY spend DESC LIMIT 4`
		)
		.all(new Date(Date.now() - 7 * 86_400_000).toISOString()) as unknown as { id: string; name: string; spend: number }[];
	return {
		metrics,
		providerKeys,
		replayQueue,
		recentAudit,
		customers: customers(db).slice(0, 4),
		flagged
	};
};
