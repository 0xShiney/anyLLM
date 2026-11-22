import { fail } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { listKeys } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const projects = db
		.prepare('SELECT id, name FROM projects WHERE org_id = ? ORDER BY created_at')
		.all(locals.user!.orgId) as unknown as { id: string; name: string }[];
	return {
		keys: listKeys(db, locals.user!.orgId),
		projects,
		welcome: url.searchParams.get('welcome') === '1'
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const projectId = String(form.get('project') ?? '');
		const rpm = Number(form.get('rpm') ?? 600);
		const budgetIdr = Number(form.get('budget') ?? 0);
		if (name.length < 2) return fail(400, { error: 'Nama kunci minimal 2 karakter.' });

		const db = getDb();
		const project = db
			.prepare('SELECT id FROM projects WHERE id = ? AND org_id = ?')
			.get(projectId, locals.user!.orgId) as { id: string } | undefined;
		if (!project) return fail(400, { error: 'Project tidak ditemukan.' });

		const secret = randomBytes(16).toString('hex');
		const plain = `sk-any-${secret}`;
		db.prepare(
			`INSERT INTO api_keys (id, project_id, name, prefix, hash, status, scopes, rpm, daily_budget_micros, monthly_budget_micros, created_at)
			 VALUES (?,?,?,?,?,'active','',?,?,?,?)`
		).run(
			crypto.randomUUID(),
			project.id,
			name,
			plain.slice(0, 12),
			createHash('sha256').update(plain).digest('hex'),
			Number.isFinite(rpm) ? rpm : 600,
			budgetIdr > 0 ? Math.round((budgetIdr / 30) * 1_000_000) : null,
			budgetIdr > 0 ? Math.round(budgetIdr * 1_000_000) : null,
			new Date().toISOString()
		);
		return { createdKey: plain, name };
	},
	revoke: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const db = getDb();
		const owned = db
			.prepare(
				`SELECT k.id FROM api_keys k JOIN projects p ON p.id = k.project_id WHERE k.id = ? AND p.org_id = ?`
			)
			.get(id, locals.user!.orgId);
		if (!owned) return fail(404, { error: 'Kunci tidak ditemukan.' });
		db.prepare("UPDATE api_keys SET status = 'revoked' WHERE id = ?").run(id);
		return { revoked: true };
	}
};
