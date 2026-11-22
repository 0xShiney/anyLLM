import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const members = db
		.prepare(
			`SELECT u.id, u.name, u.email, m.role, u.password_hash FROM members m
			 JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY
			 CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'developer' THEN 2 ELSE 3 END`
		)
		.all(locals.user!.orgId) as unknown as { id: string; name: string; email: string; role: string; password_hash: string | null }[];
	const projects = db
		.prepare(
			`SELECT p.*, (SELECT COUNT(*) FROM api_keys k WHERE k.project_id = p.id AND k.status = 'active') AS keys
			 FROM projects p WHERE p.org_id = ? ORDER BY p.created_at`
		)
		.all(locals.user!.orgId) as unknown as Record<string, string | number>[];
	return {
		members: members.map((m) => ({ ...m, pending: !m.password_hash, password_hash: undefined })),
		projects
	};
};

export const actions: Actions = {
	invite: async ({ request, locals }) => {
		if (locals.user!.orgRole !== 'owner' && locals.user!.orgRole !== 'admin')
			return fail(403, { error: 'Hanya owner atau admin yang bisa mengundang anggota.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const role = String(form.get('role') ?? 'developer');
		if (!email.includes('@')) return fail(400, { error: 'Email tidak valid.' });
		if (!['admin', 'developer', 'viewer'].includes(role)) return fail(400, { error: 'Peran tidak dikenal.' });

		const db = getDb();
		const orgId = locals.user!.orgId;
		let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
		if (!user) {
			const id = randomUUID();
			db.prepare('INSERT INTO users (id, email, name, password_hash, role, totp_enabled, created_at) VALUES (?,?,?,NULL,?,0,?)').run(
				id,
				email,
				email.split('@')[0],
				'customer',
				new Date().toISOString()
			);
			user = { id };
		}
		const exists = db.prepare('SELECT 1 FROM members WHERE org_id = ? AND user_id = ?').get(orgId, user.id);
		if (exists) return fail(409, { error: 'Anggota ini sudah ada di workspace.' });
		db.prepare('INSERT INTO members (org_id, user_id, role) VALUES (?,?,?)').run(orgId, user.id, role);
		db.prepare('INSERT INTO audit_log (actor_email, role, action, target, reason, meta, created_at) VALUES (?,?,?,?,?,?,?)').run(
			locals.user!.email,
			locals.user!.orgRole,
			'member.invite',
			email,
			'Undangan anggota workspace',
			JSON.stringify({ role }),
			new Date().toISOString()
		);
		return { invited: email };
	}
};
