import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { estimateSavings, runReplay } from '$lib/server/engine/replay';
import { MICRO } from '$lib/format';
import { dispatch } from '$lib/server/webhooks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const orgId = locals.user!.orgId;
	const tags = db
		.prepare(
			`SELECT u.tag, COUNT(*) AS requests, SUM(CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END) AS logged
			 FROM usage u LEFT JOIN prompt_logs l ON l.request_id = u.request_id
			 WHERE u.org_id = ? AND u.tag IS NOT NULL AND u.created_at > ?
			 GROUP BY u.tag ORDER BY requests DESC`
		)
		.all(orgId, new Date(Date.now() - 30 * 86_400_000).toISOString()) as unknown as {
		tag: string;
		requests: number;
		logged: number;
	}[];

	const tag = url.searchParams.get('tag') ?? tags[0]?.tag ?? '';
	const estimate = tag ? estimateSavings(db, orgId, tag) : null;
	const projects = db.prepare('SELECT id, name, logging_enabled, zdr FROM projects WHERE org_id = ?').all(orgId) as unknown as {
		id: string;
		name: string;
		logging_enabled: number;
		zdr: number;
	}[];
	const models = db
		.prepare('SELECT id, label, provider FROM models WHERE enabled = 1 AND visible = 1 ORDER BY sort')
		.all() as unknown as { id: string; label: string; provider: string }[];
	const runs = db
		.prepare('SELECT * FROM replay_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 6')
		.all(orgId) as unknown as { id: string; tag: string; status: string; result: string | null; created_at: string; spent_micros: number }[];

	return {
		tags,
		tag,
		estimate,
		projects,
		models,
		runs: runs.map((r) => ({
			id: r.id,
			tag: r.tag,
			status: r.status,
			created_at: r.created_at,
			spent_micros: r.spent_micros,
			summary: r.result ? JSON.parse(r.result).summary : null
		})),
		rules: db
			.prepare("SELECT tag, target_model, version FROM routing_rules WHERE org_id = ? AND status = 'active'")
			.all(orgId) as unknown as { tag: string; target_model: string; version: number }[],
		budgetDefault: 150 * 1000 // Rp150.000 dalam rupiah, dikonversi di action
	};
};

export const actions: Actions = {
	run: async ({ request, locals }) => {
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '');
		const sampleSize = Number(form.get('sample') ?? 50);
		const budgetIdr = Number(form.get('budget') ?? 150);
		const candidates = form.getAll('candidates').map(String).slice(0, 3);
		if (!tag) return fail(400, { error: 'Pilih tag terlebih dahulu.' });
		if (candidates.length === 0) return fail(400, { error: 'Pilih minimal satu model kandidat.' });

		const db = getDb();
		const orgId = locals.user!.orgId;
		const logging = db
			.prepare('SELECT COUNT(*) AS n FROM projects WHERE org_id = ? AND logging_enabled = 1 AND zdr = 0')
			.get(orgId) as { n: number };
		if (logging.n === 0)
			return fail(400, { error: 'Logging prompt belum aktif pada project mana pun. Aktifkan di Pengaturan.' });

		const budgetMicros = Math.round(Math.max(1000, budgetIdr) * MICRO);
		const id = randomUUID();
		db.prepare(
			'INSERT INTO replay_runs (id, org_id, tag, sample_size, candidates, budget_micros, status, created_at) VALUES (?,?,?,?,?,?,?,?)'
		).run(id, orgId, tag, sampleSize, JSON.stringify(candidates), budgetMicros, 'running', new Date().toISOString());

		try {
			const result = await runReplay(db, { orgId, tag, sampleSize, candidates, budgetMicros });
			db.prepare('UPDATE replay_runs SET status = ?, result = ?, spent_micros = ?, finished_at = ? WHERE id = ?').run(
				'done',
				JSON.stringify(result),
				result.spentMicros,
				new Date().toISOString(),
				id
			);
			db.prepare('INSERT INTO notifications (org_id, kind, body, read, created_at) VALUES (?,?,?,0,?)').run(
				orgId,
				'replay_done',
				`Replay tag ${tag} selesai: ${result.summary.recommended ?? 'tidak ada rekomendasi'}.`,
				new Date().toISOString()
			);
			void dispatch(db, orgId, 'replay.done', { tag, run_id: id, saving_micros: result.summary.monthlySavingMicros });
			return { result, runId: id };
		} catch (err) {
			db.prepare('UPDATE replay_runs SET status = ? WHERE id = ?').run('failed', id);
			return fail(400, { error: (err as Error).message });
		}
	},
	apply: async ({ request, locals }) => {
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '');
		const target = String(form.get('target') ?? '');
		const fallback = String(form.get('fallback') ?? '');
		const note = String(form.get('note') ?? '').trim() || 'Diterapkan dari Replay Lab';
		if (!tag || !target || !fallback) return fail(400, { error: 'Tag, model target, dan fallback wajib diisi.' });

		const db = getDb();
		const orgId = locals.user!.orgId;
		const exists = db.prepare('SELECT id FROM models WHERE id = ? AND enabled = 1').get(target);
		if (!exists) return fail(400, { error: 'Model target tidak aktif.' });

		const current = db
			.prepare('SELECT MAX(version) AS v FROM routing_rules WHERE org_id = ? AND tag = ?')
			.get(orgId, tag) as { v: number | null };
		const version = (current.v ?? 0) + 1;
		db.prepare("UPDATE routing_rules SET status = 'archived' WHERE org_id = ? AND tag = ? AND status = 'active'").run(orgId, tag);
		db.prepare(
			`INSERT INTO routing_rules (id, org_id, tag, target_model, fallback_model, version, status, source, note, created_by, created_at)
			 VALUES (?,?,?,?,?,?,'active','replay',?,?,?)`
		).run(randomUUID(), orgId, tag, target, fallback, version, note, locals.user!.email, new Date().toISOString());
		db.prepare('INSERT INTO audit_log (actor_email, role, action, target, reason, meta, created_at) VALUES (?,?,?,?,?,?,?)').run(
			locals.user!.email,
			locals.user!.orgRole,
			'routing.rule.apply',
			`${tag} -> ${target}`,
			note,
			JSON.stringify({ version }),
			new Date().toISOString()
		);
		return { applied: { tag, target, version } };
	}
};
