import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { Ledger } from '$lib/server/engine/ledger';
import { listTickets, ticketMessages } from '$lib/server/queries';
import { MICRO } from '$lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const db = getDb();
	const tickets = listTickets(db);
	const id = url.searchParams.get('id') ?? String(tickets[0]?.id ?? '');
	const selected = tickets.find((t) => t.id === id) ?? null;
	const usage = selected?.request_id
		? (db
				.prepare('SELECT * FROM usage WHERE request_id = ?')
				.get(String(selected.request_id)) as unknown as Record<string, string | number> | undefined)
		: undefined;
	return {
		tickets,
		selected,
		messages: selected ? ticketMessages(db, String(selected.id), true) : [],
		request: usage ?? null,
		org: selected
			? (db.prepare('SELECT balance_micros FROM orgs WHERE id = ?').get(String(selected.org_id)) as { balance_micros: number } | undefined)
			: undefined
	};
};

export const actions: Actions = {
	reply: async ({ request, locals }) => {
		const form = await request.formData();
		const ticketId = String(form.get('ticket_id') ?? '');
		const body = String(form.get('body') ?? '').trim();
		const internal = form.get('internal') === 'on';
		if (body.length < 2) return fail(400, { error: 'Balasan terlalu pendek.' });
		const db = getDb();
		db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,?,?)').run(
			ticketId,
			locals.user!.email,
			body,
			internal ? 1 : 0,
			new Date().toISOString()
		);
		db.prepare("UPDATE tickets SET status = 'pending' WHERE id = ? AND status = 'open'").run(ticketId);
		return { saved: true };
	},
	status: async ({ request, locals }) => {
		const form = await request.formData();
		const ticketId = String(form.get('ticket_id') ?? '');
		const status = String(form.get('status') ?? '');
		const assignee = String(form.get('assignee') ?? '').trim();
		if (!['open', 'pending', 'resolved'].includes(status)) return fail(400, { error: 'Status tidak dikenal.' });
		const db = getDb();
		db.prepare('UPDATE tickets SET status = ?, assignee = COALESCE(NULLIF(?, \'\'), assignee) WHERE id = ?').run(status, assignee, ticketId);
		audit(db, locals.user!, 'ticket.status', ticketId, `Status diubah ke ${status}`, { assignee: assignee || null });
		return { saved: true };
	},
	compensate: async ({ request, locals }) => {
		const form = await request.formData();
		const ticketId = String(form.get('ticket_id') ?? '');
		const amount = Number(form.get('amount') ?? 0);
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Alasan kompensasi wajib diisi.' });
		const limit = locals.user!.role === 'support' ? 500_000 : 5_000_000;
		if (amount <= 0 || amount > limit) return fail(400, { error: `Nominal harus antara Rp1 dan Rp${limit.toLocaleString('id-ID')}.` });
		const db = getDb();
		const ticket = db.prepare('SELECT org_id FROM tickets WHERE id = ?').get(ticketId) as { org_id: string } | undefined;
		if (!ticket) return fail(404, { error: 'Tiket tidak ditemukan.' });
		new Ledger(db).credit(ticket.org_id, Math.round(amount * MICRO), 'grant', `Kompensasi tiket ${ticketId.slice(0, 8)}`, ticketId, locals.user!.email);
		audit(db, locals.user!, 'billing.compensate', ticketId, reason, { amount });
		db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,0,?)').run(
			ticketId,
			'sistem',
			`Kredit kompensasi Rp${amount.toLocaleString('id-ID')} ditambahkan ke saldo.`,
			new Date().toISOString()
		);
		return { saved: true };
	}
};
