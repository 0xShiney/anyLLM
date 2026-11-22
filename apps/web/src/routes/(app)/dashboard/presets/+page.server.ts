import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { listPresets } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	return {
		presets: listPresets(db, locals.user!.orgId),
		models: db.prepare('SELECT id, label FROM models WHERE enabled = 1 ORDER BY sort').all() as unknown as {
			id: string;
			label: string;
		}[]
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const slug = String(form.get('slug') ?? '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '-');
		const models = form.getAll('models').map(String).filter(Boolean);
		const temperature = Number(form.get('temperature') ?? 0.3);
		const systemPrompt = String(form.get('system_prompt') ?? '').trim();
		if (!slug) return fail(400, { error: 'Slug preset wajib diisi.' });
		if (models.length === 0) return fail(400, { error: 'Pilih minimal satu model.' });

		const db = getDb();
		const orgId = locals.user!.orgId;
		const max = db.prepare('SELECT MAX(version) AS v FROM presets WHERE org_id = ? AND slug = ?').get(orgId, slug) as {
			v: number | null;
		};
		db.prepare('INSERT INTO presets (id, org_id, slug, version, config, created_at) VALUES (?,?,?,?,?,?)').run(
			randomUUID(),
			orgId,
			slug,
			(max.v ?? 0) + 1,
			JSON.stringify({
				models,
				params: { temperature },
				system_prompt: systemPrompt || null,
				provider: { sort: 'price', allow_fallbacks: true },
				cache: { enabled: true, ttl_seconds: 3600 }
			}),
			new Date().toISOString()
		);
		return { ok: true };
	}
};
