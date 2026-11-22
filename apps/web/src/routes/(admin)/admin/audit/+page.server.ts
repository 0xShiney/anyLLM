import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const db = getDb();
	const action = url.searchParams.get('action') ?? '';
	const rows = db
		.prepare(
			`SELECT * FROM audit_log ${action ? 'WHERE action LIKE ?' : ''} ORDER BY id DESC LIMIT 100`
		)
		.all(...(action ? [`%${action}%`] : [])) as unknown as Record<string, string | number>[];
	const actions = db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all() as unknown as { action: string }[];
	return { rows, actions, action };
};
