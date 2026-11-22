import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { Ledger } from '$lib/server/engine/ledger';
import { customers } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		orgs: customers(db),
		ledger: db
			.prepare(
				`SELECT l.*, o.name AS org_name FROM ledger l JOIN orgs o ON o.id = l.org_id ORDER BY l.id DESC LIMIT 40`
			)
			.all() as unknown as Record<string, string | number>[],
		candidates: db
			.prepare(
				`SELECT u.request_id, u.org_id, o.name AS org_name, u.model, u.billed_micros, u.created_at, u.status
				 FROM usage u JOIN orgs o ON o.id = u.org_id
				 WHERE u.billed_micros > 0 AND u.status != 'ok'
				 ORDER BY u.created_at DESC LIMIT 12`
			)
			.all() as unknown as Record<string, string | number>[],
		marginByModel: db
			.prepare(
				`SELECT model, SUM(billed_micros) AS revenue, SUM(cost_micros) AS cost, COUNT(*) AS requests
				 FROM usage WHERE status = 'ok' GROUP BY model ORDER BY revenue DESC`
			)
			.all() as unknown as { model: string; revenue: number; cost: number; requests: number }[],
		invoices: db
			.prepare(
				`SELECT i.*, o.name AS org_name FROM invoices i JOIN orgs o ON o.id = i.org_id ORDER BY i.created_at DESC LIMIT 10`
			)
			.all() as unknown as Record<string, string | number>[]
	};
};

export const actions: Actions = {
	refund: async ({ request, locals }) => {
		const form = await request.formData();
		const requestId = String(form.get('request_id') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Alasan refund wajib diisi.' });
		const db = getDb();
		const row = db
			.prepare('SELECT org_id, billed_micros, model FROM usage WHERE request_id = ?')
			.get(requestId) as { org_id: string; billed_micros: number; model: string } | undefined;
		if (!row) return fail(404, { error: 'Request tidak ditemukan.' });
		const existing = db.prepare("SELECT id FROM ledger WHERE ref = ? AND kind = 'refund'").get(`refund:${requestId}`);
		if (existing) return fail(409, { error: 'Request ini sudah direfund.' });
		if (row.billed_micros <= 0) return fail(400, { error: 'Request ini tidak ditagih, tidak ada yang perlu direfund.' });

		new Ledger(db).credit(row.org_id, row.billed_micros, 'refund', `Refund ${row.model} (${requestId})`, `refund:${requestId}`, locals.user!.email);
		audit(db, locals.user!, 'billing.refund', requestId, reason, { amount: row.billed_micros, model: row.model });
		return { refunded: requestId };
	}
};
