import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const orgId = locals.user!.orgId;
	return {
		org: db.prepare('SELECT * FROM orgs WHERE id = ?').get(orgId) as unknown as Record<string, string | number>,
		projects: db.prepare('SELECT * FROM projects WHERE org_id = ? ORDER BY created_at').all(orgId) as unknown as Record<
			string,
			string | number
		>[],
		webhooks: db.prepare('SELECT * FROM webhooks WHERE org_id = ? ORDER BY created_at').all(orgId) as unknown as Record<
			string,
			string | number
		>[],
		policies: db.prepare('SELECT * FROM data_policies ORDER BY provider').all() as unknown as Record<string, string | number>[],
		logCount: (
			db
				.prepare(
					'SELECT COUNT(*) AS n FROM prompt_logs l JOIN projects p ON p.id = l.project_id WHERE p.org_id = ?'
				)
				.get(orgId) as { n: number }
		).n
	};
};

export const actions: Actions = {
	project: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const logging = form.get('logging') === 'on' ? 1 : 0;
		const zdr = form.get('zdr') === 'on' ? 1 : 0;
		const retention = [7, 30, 90].includes(Number(form.get('retention'))) ? Number(form.get('retention')) : 30;
		const db = getDb();
		const owned = db.prepare('SELECT id FROM projects WHERE id = ? AND org_id = ?').get(id, locals.user!.orgId);
		if (!owned) return fail(404, { error: 'Project tidak ditemukan.' });
		if (zdr === 1 && logging === 1)
			return fail(400, { error: 'ZDR dan logging prompt tidak bisa aktif bersamaan. ZDR mematikan penyimpanan data.' });
		db.prepare('UPDATE projects SET logging_enabled = ?, zdr = ?, retention_days = ? WHERE id = ?').run(logging, zdr, retention, id);
		return { saved: true };
	},
	org: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (name.length < 2) return fail(400, { error: 'Nama workspace minimal 2 karakter.' });
		getDb().prepare('UPDATE orgs SET name = ? WHERE id = ?').run(name, locals.user!.orgId);
		return { saved: true };
	},
	webhook: async ({ request, locals }) => {
		const form = await request.formData();
		const url = String(form.get('url') ?? '').trim();
		const events = form.getAll('events').map(String);
		if (!/^https:\/\//.test(url)) return fail(400, { error: 'URL webhook harus https.' });
		if (events.length === 0) return fail(400, { error: 'Pilih minimal satu event.' });
		getDb()
			.prepare('INSERT INTO webhooks (id, org_id, url, secret, events, active, created_at) VALUES (?,?,?,?,?,1,?)')
			.run(randomUUID(), locals.user!.orgId, url, `whsec_${randomUUID().replace(/-/g, '')}`, events.join(','), new Date().toISOString());
		return { saved: true };
	},
	purge: async ({ locals }) => {
		const db = getDb();
		const result = db
			.prepare(
				`DELETE FROM prompt_logs WHERE id IN (
				 SELECT l.id FROM prompt_logs l JOIN projects p ON p.id = l.project_id WHERE p.org_id = ?
				 AND (l.expires_at < ? OR p.zdr = 1))`
			)
			.run(locals.user!.orgId, new Date().toISOString());
		return { purged: Number(result.changes) };
	}
};
