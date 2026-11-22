import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Ekspor data pribadi (UU PDP): semua data workspace milik pengguna dalam JSON. */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const db = getDb();
	const orgId = locals.user.orgId;
	const pick = (sql: string) => db.prepare(sql).all(orgId) as unknown as Record<string, unknown>[];

	const payload = {
		exported_at: new Date().toISOString(),
		user: { email: locals.user.email, name: locals.user.name, role: locals.user.role },
		org: db.prepare('SELECT name, slug, balance_micros, created_at FROM orgs WHERE id = ?').get(orgId),
		projects: pick('SELECT name, logging_enabled, retention_days, zdr FROM projects WHERE org_id = ?'),
		keys: pick('SELECT name, prefix, status, rpm, created_at FROM api_keys k JOIN projects p ON p.id = k.project_id WHERE p.org_id = ?'),
		usage: pick('SELECT request_id, created_at, model, tag, prompt_tokens, completion_tokens, billed_micros, status FROM usage WHERE org_id = ?'),
		ledger: pick('SELECT created_at, kind, amount_micros, balance_after, memo FROM ledger WHERE org_id = ?'),
		tickets: pick('SELECT subject, status, created_at FROM tickets WHERE org_id = ?'),
		prompt_logs_note: 'Isi prompt tidak diekspor di sini karena terenkripsi per project. Hapus lewat Pengaturan.'
	};

	return new Response(JSON.stringify(payload, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': 'attachment; filename="anyllm-export.json"'
		}
	});
};
