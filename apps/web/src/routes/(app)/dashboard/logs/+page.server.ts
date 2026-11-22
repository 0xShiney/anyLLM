import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { logRows } from '$lib/server/queries';
import { decryptFor } from '$lib/server/engine/crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const orgId = locals.user!.orgId;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const filters = {
		tag: url.searchParams.get('tag') ?? undefined,
		model: url.searchParams.get('model') ?? undefined,
		status: url.searchParams.get('status') ?? undefined,
		limit: 40,
		offset: (page - 1) * 40
	};
	const { rows, total } = logRows(db, orgId, filters);
	const requestId = url.searchParams.get('request');
	const selected = requestId
		? (db
				.prepare('SELECT * FROM usage WHERE request_id = ? AND org_id = ?')
				.get(requestId, orgId) as unknown as Record<string, string | number> | undefined)
		: undefined;

	let prompt: { prompt: string; response: string } | null = null;
	if (selected) {
		const log = db
			.prepare(
				`SELECT l.*, p.id AS project_id FROM prompt_logs l JOIN projects p ON p.id = l.project_id
				 WHERE l.request_id = ? AND p.org_id = ?`
			)
			.get(requestId, orgId) as { project_id: string; payload_enc: string } | undefined;
		if (log) {
			try {
				prompt = JSON.parse(decryptFor(log.project_id, log.payload_enc));
			} catch {
				prompt = null;
			}
		}
	}

	const tags = db
		.prepare('SELECT DISTINCT tag FROM usage WHERE org_id = ? AND tag IS NOT NULL ORDER BY tag')
		.all(orgId) as unknown as { tag: string }[];
	const models = db.prepare('SELECT DISTINCT model FROM usage WHERE org_id = ? ORDER BY model').all(orgId) as unknown as {
		model: string;
	}[];

	return { rows, total, page, filters, selected: selected ?? null, prompt, tags, models, requestId };
};

export const actions: Actions = {
	report: async ({ request, locals }) => {
		const form = await request.formData();
		const requestId = String(form.get('request_id') ?? '');
		const body = String(form.get('body') ?? '').trim();
		if (!requestId || body.length < 5) return fail(400, { error: 'Tuliskan keluhan minimal 5 karakter.' });
		const db = getDb();
		const row = db
			.prepare('SELECT request_id FROM usage WHERE request_id = ? AND org_id = ?')
			.get(requestId, locals.user!.orgId);
		if (!row) return fail(404, { error: 'Request tidak ditemukan.' });
		const id = randomUUID();
		db.prepare(
			'INSERT INTO tickets (id, org_id, subject, status, priority, sla_due, request_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
		).run(
			id,
			locals.user!.orgId,
			`Masalah pada request ${requestId}`,
			'open',
			'normal',
			new Date(Date.now() + 24 * 3600_000).toISOString(),
			requestId,
			new Date().toISOString()
		);
		db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,0,?)').run(
			id,
			locals.user!.email,
			body,
			new Date().toISOString()
		);
		return { reported: id };
	}
};
