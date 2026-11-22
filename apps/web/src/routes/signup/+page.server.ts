import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { createSession, sessionCookie } from '$lib/server/auth';
import { hashPassword } from '$lib/server/password';
import { Ledger } from '$lib/server/engine/ledger';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const name = String(form.get('name') ?? '').trim();
		const orgName = String(form.get('org') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email.includes('@') || name.length < 2 || orgName.length < 2)
			return fail(400, { email, name, orgName, error: 'Nama, email, dan nama workspace wajib diisi dengan benar.' });
		if (password.length < 8) return fail(400, { email, name, orgName, error: 'Password minimal 8 karakter.' });

		const db = getDb();
		const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
		if (exists) return fail(409, { email, name, orgName, error: 'Email sudah terdaftar. Coba masuk.' });

		const userId = randomUUID();
		const orgId = randomUUID();
		const projectId = randomUUID();
		const now = new Date().toISOString();
		db.prepare('INSERT INTO users (id, email, name, password_hash, role, totp_enabled, created_at) VALUES (?,?,?,?,?,0,?)').run(
			userId,
			email,
			name,
			hashPassword(password),
			'customer',
			now
		);
		db.prepare('INSERT INTO orgs (id, name, slug, balance_micros, zdr, logging_enabled, retention_days, created_at) VALUES (?,?,?,?,0,0,30,?)').run(
			orgId,
			orgName,
			`${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${userId.slice(0, 6)}`,
			0,
			now
		);
		db.prepare('INSERT INTO members (org_id, user_id, role) VALUES (?,?,?)').run(orgId, userId, 'owner');
		db.prepare('INSERT INTO projects (id, org_id, name, logging_enabled, retention_days, zdr, created_at) VALUES (?,?,?,?,30,0,?)').run(
			projectId,
			orgId,
			'produksi',
			0,
			now
		);
		new Ledger(db).credit(orgId, 25_000 * 1_000_000, 'grant', 'Kredit uji coba pendaftaran', null, 'sistem');
		sessionCookie(cookies, createSession(userId));
		redirect(303, '/dashboard/keys?welcome=1');
	}
};
