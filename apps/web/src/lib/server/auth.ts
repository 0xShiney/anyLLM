import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { verifyPassword } from './password';

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: 'customer' | 'admin' | 'finance' | 'support';
	orgId: string;
	orgName: string;
	orgRole: 'owner' | 'admin' | 'developer' | 'viewer';
};

const COOKIE = 'anyllm_session';

export function login(email: string, password: string): SessionUser | null {
	const db = getDb();
	const row = db
		.prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = ?')
		.get(email.trim().toLowerCase()) as
		| { id: string; email: string; name: string; role: string; password_hash: string | null }
		| undefined;
	if (!row || !verifyPassword(password, row.password_hash)) return null;
	return row.role === 'customer' ? withOrg(row.id, row.email, row.name, row.role) : withOrg(row.id, row.email, row.name, row.role);
}

function withOrg(id: string, email: string, name: string, role: string): SessionUser {
	const db = getDb();
	const member = db
		.prepare(
			`SELECT m.role AS org_role, o.id AS org_id, o.name AS org_name FROM members m
			 JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? LIMIT 1`
		)
		.get(id) as { org_role: string; org_id: string; org_name: string } | undefined;
	return {
		id,
		email,
		name,
		role: role as SessionUser['role'],
		orgId: member?.org_id ?? '',
		orgName: member?.org_name ?? 'anyLLM',
		orgRole: (member?.org_role ?? 'viewer') as SessionUser['orgRole']
	};
}

export function createSession(userId: string): string {
	const db = getDb();
	const id = randomUUID();
	db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(
		id,
		userId,
		new Date(Date.now() + 14 * 86_400_000).toISOString(),
		new Date().toISOString()
	);
	return id;
}

export function sessionCookie(cookies: Cookies, id: string) {
	cookies.set(COOKIE, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 14 * 86_400
	});
}

export function clearSession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}

export function userFromCookies(cookies: Cookies): SessionUser | null {
	const id = cookies.get(COOKIE);
	if (!id) return null;
	const db = getDb();
	const row = db
		.prepare(
			`SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.id = ? AND s.expires_at > ?`
		)
		.get(id, new Date().toISOString()) as { id: string; email: string; name: string; role: string } | undefined;
	if (!row) return null;
	return withOrg(row.id, row.email, row.name, row.role);
}

export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
	return locals.user;
}

export function isStaff(user: SessionUser): boolean {
	return user.role === 'admin' || user.role === 'finance' || user.role === 'support';
}
