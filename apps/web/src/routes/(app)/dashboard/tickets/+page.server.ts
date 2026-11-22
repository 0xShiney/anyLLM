import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { listTickets, ticketMessages } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const tickets = listTickets(db, locals.user!.orgId);
	const id = url.searchParams.get('id') ?? (tickets[0]?.id as string | undefined);
	const selected = id ? (tickets.find((t) => t.id === id) ?? null) : null;
	return {
		tickets,
		selected,
		messages: selected ? ticketMessages(db, String(selected.id), false) : []
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		if (subject.length < 4 || body.length < 5) return fail(400, { error: 'Subjek dan isi tiket wajib diisi.' });
		const db = getDb();
		const id = randomUUID();
		db.prepare(
			"INSERT INTO tickets (id, org_id, subject, status, priority, sla_due, created_at) VALUES (?,?,?,'open','normal',?,?)"
		).run(id, locals.user!.orgId, subject, new Date(Date.now() + 24 * 3600_000).toISOString(), new Date().toISOString());
		db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,0,?)').run(
			id,
			locals.user!.email,
			body,
			new Date().toISOString()
		);
		return { created: id };
	},
	reply: async ({ request, locals }) => {
		const form = await request.formData();
		const ticketId = String(form.get('ticket_id') ?? '');
		const body = String(form.get('body') ?? '').trim();
		if (body.length < 2) return fail(400, { error: 'Balasan terlalu pendek.' });
		const db = getDb();
		const owned = db.prepare('SELECT id FROM tickets WHERE id = ? AND org_id = ?').get(ticketId, locals.user!.orgId);
		if (!owned) return fail(404, { error: 'Tiket tidak ditemukan.' });
		db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,0,?)').run(
			ticketId,
			locals.user!.email,
			body,
			new Date().toISOString()
		);
		db.prepare("UPDATE tickets SET status = 'open' WHERE id = ?").run(ticketId);
		return { ok: true };
	}
};
