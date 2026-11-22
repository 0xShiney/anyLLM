import type { DatabaseSync } from 'node:sqlite';
import type { SessionUser } from './auth';

/** Setiap aksi admin wajib punya alasan; tabel audit_log hanya bisa ditambah. */
export function audit(
	db: DatabaseSync,
	user: Pick<SessionUser, 'email' | 'role' | 'orgRole'>,
	action: string,
	target: string,
	reason: string,
	meta?: unknown
): void {
	if (!reason.trim()) throw new Error('Aksi admin membutuhkan alasan');
	db.prepare('INSERT INTO audit_log (actor_email, role, action, target, reason, meta, created_at) VALUES (?,?,?,?,?,?,?)').run(
		user.email,
		user.role === 'customer' ? user.orgRole : user.role,
		action,
		target,
		reason,
		meta ? JSON.stringify(meta) : null,
		new Date().toISOString()
	);
}
