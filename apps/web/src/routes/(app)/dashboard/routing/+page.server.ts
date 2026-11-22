import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { listRules } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	return {
		rules: listRules(db, locals.user!.orgId),
		models: db.prepare('SELECT id, label FROM models WHERE enabled = 1 ORDER BY sort').all() as unknown as {
			id: string;
			label: string;
		}[],
		tags: db
			.prepare('SELECT DISTINCT tag FROM usage WHERE org_id = ? AND tag IS NOT NULL ORDER BY tag')
			.all(locals.user!.orgId) as unknown as { tag: string }[]
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '').trim();
		const target = String(form.get('target') ?? '');
		const fallback = String(form.get('fallback') ?? '');
		const note = String(form.get('note') ?? '').trim();
		if (!tag || !target || !fallback) return fail(400, { error: 'Lengkapi tag, model target, dan fallback.' });

		const db = getDb();
		const orgId = locals.user!.orgId;
		const max = db.prepare('SELECT MAX(version) AS v FROM routing_rules WHERE org_id = ? AND tag = ?').get(orgId, tag) as {
			v: number | null;
		};
		db.prepare("UPDATE routing_rules SET status = 'archived' WHERE org_id = ? AND tag = ? AND status = 'active'").run(orgId, tag);
		db.prepare(
			`INSERT INTO routing_rules (id, org_id, tag, target_model, fallback_model, version, status, source, note, created_by, created_at)
			 VALUES (?,?,?,?,?,?,'active','manual',?,?,?)`
		).run(randomUUID(), orgId, tag, target, fallback, (max.v ?? 0) + 1, note || null, locals.user!.email, new Date().toISOString());
		return { ok: true };
	},
	rollback: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const db = getDb();
		const orgId = locals.user!.orgId;
		const rule = db.prepare('SELECT * FROM routing_rules WHERE id = ? AND org_id = ?').get(id, orgId) as
			| { tag: string; target_model: string; fallback_model: string; version: number }
			| undefined;
		if (!rule) return fail(404, { error: 'Aturan tidak ditemukan.' });
		const current = db
			.prepare('SELECT MAX(version) AS v FROM routing_rules WHERE org_id = ? AND tag = ?')
			.get(orgId, rule.tag) as { v: number };
		db.prepare("UPDATE routing_rules SET status = 'archived' WHERE org_id = ? AND tag = ? AND status = 'active'").run(orgId, rule.tag);
		db.prepare(
			`INSERT INTO routing_rules (id, org_id, tag, target_model, fallback_model, version, status, source, note, created_by, created_at)
			 VALUES (?,?,?,?,?,?,'active','rollback',?,?,?)`
		).run(
			randomUUID(),
			orgId,
			rule.tag,
			rule.target_model,
			rule.fallback_model,
			(current.v ?? 0) + 1,
			`Rollback ke v${rule.version}`,
			locals.user!.email,
			new Date().toISOString()
		);
		db.prepare('INSERT INTO audit_log (actor_email, role, action, target, reason, meta, created_at) VALUES (?,?,?,?,?,?,?)').run(
			locals.user!.email,
			locals.user!.orgRole,
			'routing.rule.rollback',
			`${rule.tag} v${rule.version}`,
			'Rollback dari dashboard',
			null,
			new Date().toISOString()
		);
		return { ok: true };
	},
	disable: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const db = getDb();
		db.prepare("UPDATE routing_rules SET status = 'archived' WHERE id = ? AND org_id = ?").run(id, locals.user!.orgId);
		return { ok: true };
	}
};
