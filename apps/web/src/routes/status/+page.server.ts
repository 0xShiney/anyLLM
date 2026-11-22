import { getDb } from '$lib/server/db';

export function load() {
	const db = getDb();
	const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
	const providers = db
		.prepare(
			`SELECT provider, COUNT(*) AS requests,
			 AVG(CASE WHEN status = 'ok' THEN 1.0 ELSE 0 END) AS success,
			 COALESCE(AVG(latency_ms),0) AS latency
			 FROM usage WHERE created_at > ? GROUP BY provider ORDER BY requests DESC`
		)
		.all(since) as unknown as { provider: string; requests: number; success: number; latency: number }[];
	const policies = db.prepare('SELECT * FROM data_policies ORDER BY provider').all() as unknown as Record<string, string | number>[];
	const models = db
		.prepare('SELECT id, label, provider, enabled FROM models ORDER BY sort')
		.all() as unknown as { id: string; label: string; provider: string; enabled: number }[];
	const incidents = db
		.prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY id DESC LIMIT 3")
		.all() as unknown as { body: string; created_at: string }[];

	return { providers, policies, models, incidents };
}
