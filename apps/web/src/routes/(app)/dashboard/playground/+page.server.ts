import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { completeChat, type GatewayAuth } from '$lib/server/engine/gateway';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const models = db
		.prepare('SELECT id, label FROM models WHERE enabled = 1 AND visible = 1 ORDER BY sort')
		.all() as unknown as { id: string; label: string }[];
	const balance = db.prepare('SELECT balance_micros FROM orgs WHERE id = ?').get(locals.user!.orgId) as { balance_micros: number };
	return { models, balance: balance.balance_micros };
};

function authFor(orgId: string): GatewayAuth | null {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT k.*, p.org_id, p.logging_enabled, p.retention_days, p.zdr, o.balance_micros, o.name AS org_name
			 FROM api_keys k JOIN projects p ON p.id = k.project_id JOIN orgs o ON o.id = p.org_id
			 WHERE p.org_id = ? AND k.status = 'active' ORDER BY k.created_at LIMIT 1`
		)
		.get(orgId) as
		| (Record<string, string | number> & { org_id: string; logging_enabled: number; retention_days: number; zdr: number })
		| undefined;
	if (!row) return null;
	return {
		key: {
			id: String(row.id),
			project_id: String(row.project_id),
			name: String(row.name),
			prefix: String(row.prefix),
			status: String(row.status),
			scopes: '',
			rpm: Number(row.rpm ?? 600),
			daily_budget_micros: row.daily_budget_micros ? Number(row.daily_budget_micros) : null,
			monthly_budget_micros: row.monthly_budget_micros ? Number(row.monthly_budget_micros) : null,
			expires_at: null
		},
		project: {
			id: String(row.project_id),
			org_id: row.org_id,
			name: 'playground',
			logging_enabled: 0,
			retention_days: row.retention_days,
			zdr: row.zdr
		},
		org: {
			id: row.org_id,
			name: String(row.org_name),
			balance_micros: Number(row.balance_micros),
			zdr: row.zdr,
			logging_enabled: 0
		}
	};
}

export const actions: Actions = {
	run: async ({ request, locals }) => {
		const form = await request.formData();
		const prompt = String(form.get('prompt') ?? '').trim();
		const models = form.getAll('models').map(String).slice(0, 3);
		if (prompt.length < 3) return fail(400, { error: 'Tulis prompt minimal 3 karakter.' });
		if (models.length === 0) return fail(400, { error: 'Pilih minimal satu model.' });

		const auth = authFor(locals.user!.orgId);
		if (!auth) return fail(400, { error: 'Buat API key terlebih dahulu untuk memakai playground.' });
		const db = getDb();

		const results = await Promise.all(
			models.map(async (model) => {
				const started = Date.now();
				try {
					const out = await completeChat(
						db,
						auth,
						{ model, messages: [{ role: 'user', content: prompt }], max_tokens: 400 },
						'playground',
						`req_pg_${randomUUID().slice(0, 8)}`
					);
					return {
						model,
						ok: true,
						text: out.result.text,
						billed: out.billedMicros,
						latency: Date.now() - started,
						promptTokens: out.result.usage.prompt_tokens,
						completionTokens: out.result.usage.completion_tokens,
						simulated: out.simulated
					};
				} catch (err) {
					return { model, ok: false, text: (err as Error).message, billed: 0, latency: 0, promptTokens: 0, completionTokens: 0, simulated: false };
				}
			})
		);
		return { results, prompt };
	}
};
