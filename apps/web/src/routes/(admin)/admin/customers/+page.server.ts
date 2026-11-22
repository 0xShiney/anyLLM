import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { Ledger } from '$lib/server/engine/ledger';
import { customers, listLedger, listTickets, totals } from '$lib/server/queries';
import { MICRO } from '$lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const db = getDb();
	const list = customers(db);
	const id = url.searchParams.get('id') ?? String(list[0]?.id ?? '');
	const org = id ? (db.prepare('SELECT * FROM orgs WHERE id = ?').get(id) as unknown as Record<string, string | number> | undefined) : undefined;
	return {
		list,
		org: org ?? null,
		members: org
			? (db
					.prepare('SELECT u.name, u.email, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?')
					.all(id) as unknown as Record<string, string | number>[])
			: [],
		keys: org
			? (db
					.prepare(
						`SELECT k.name, k.prefix, k.status, k.rpm, k.last_used_at FROM api_keys k
						 JOIN projects p ON p.id = k.project_id WHERE p.org_id = ? ORDER BY k.created_at`
					)
					.all(id) as unknown as Record<string, string | number>[])
			: [],
		usage: org ? totals(db, id, 30) : null,
		ledger: org ? listLedger(db, id, 8) : [],
		tickets: org ? listTickets(db, id) : []
	};
};

export const actions: Actions = {
	credit: async ({ request, locals }) => {
		const form = await request.formData();
		const orgId = String(form.get('org_id') ?? '');
		const amount = Number(form.get('amount') ?? 0);
		const reason = String(form.get('reason') ?? '').trim();
		const kind = String(form.get('kind') ?? 'adjust');
		if (!reason) return fail(400, { error: 'Alasan wajib diisi untuk koreksi saldo.' });
		if (!Number.isFinite(amount) || amount === 0) return fail(400, { error: 'Nominal tidak valid.' });
		if (Math.abs(amount) > 5_000_000 && locals.user!.role !== 'finance')
			return fail(403, { error: 'Koreksi di atas Rp5.000.000 hanya untuk peran finance.' });

		const db = getDb();
		const org = db.prepare('SELECT name FROM orgs WHERE id = ?').get(orgId) as { name: string } | undefined;
		if (!org) return fail(404, { error: 'Customer tidak ditemukan.' });
		const book = new Ledger(db);
		const micros = Math.round(Math.abs(amount) * MICRO);
		if (amount > 0) book.credit(orgId, micros, kind === 'grant' ? 'grant' : 'adjust', reason, null, locals.user!.email);
		else book.debit(orgId, micros, 'adjust', reason, null, locals.user!.email);
		audit(db, locals.user!, 'balance.adjust', org.name, reason, { amount, kind });
		return { saved: true };
	},
	blockKey: async ({ request, locals }) => {
		const form = await request.formData();
		const prefix = String(form.get('prefix') ?? '');
		const reason = String(form.get('reason') ?? '').trim() || 'Pemblokiran dari panel admin';
		const db = getDb();
		const row = db.prepare('SELECT id, name FROM api_keys WHERE prefix = ?').get(prefix) as { id: string; name: string } | undefined;
		if (!row) return fail(404, { error: 'Kunci tidak ditemukan.' });
		db.prepare("UPDATE api_keys SET status = 'blocked' WHERE id = ?").run(row.id);
		audit(db, locals.user!, 'key.block', row.name, reason, { prefix });
		return { saved: true };
	},
	viewAs: async ({ request, locals }) => {
		const form = await request.formData();
		const orgId = String(form.get('org_id') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (reason.length < 5) return fail(400, { error: 'Isi alasan minimal 5 karakter sebelum melihat sebagai pengguna.' });
		const db = getDb();
		audit(db, locals.user!, 'customer.impersonate', orgId, reason, { mode: 'read-only' });
		return { viewing: orgId };
	}
};
