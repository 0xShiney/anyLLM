import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { listModels } from '$lib/server/queries';
import { MICRO } from '$lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		models: listModels(db),
		history: db.prepare('SELECT * FROM price_history ORDER BY id DESC LIMIT 15').all() as unknown as Record<string, string | number>[],
		policies: db.prepare('SELECT * FROM provider_keys ORDER BY provider').all() as unknown as Record<string, string | number>[]
	};
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const inputIdr = Number(form.get('input') ?? 0);
		const outputIdr = Number(form.get('output') ?? 0);
		const markup = Number(form.get('markup') ?? 15);
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Alasan perubahan harga wajib diisi.' });
		if (inputIdr < 0 || outputIdr < 0 || markup < 0 || markup > 200) return fail(400, { error: 'Nilai harga tidak valid.' });

		const db = getDb();
		const before = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as
			| { input_micros: number; output_micros: number }
			| undefined;
		if (!before) return fail(404, { error: 'Model tidak ditemukan.' });
		db.prepare('UPDATE models SET input_micros = ?, output_micros = ?, markup_pct = ? WHERE id = ?').run(
			Math.round(inputIdr * MICRO),
			Math.round(outputIdr * MICRO),
			markup,
			id
		);
		const ins = db.prepare('INSERT INTO price_history (model, field, old_value, new_value, actor, reason, created_at) VALUES (?,?,?,?,?,?,?)');
		const now = new Date().toISOString();
		if (before.input_micros !== Math.round(inputIdr * MICRO))
			ins.run(id, 'input_micros', before.input_micros, Math.round(inputIdr * MICRO), locals.user!.email, reason, now);
		if (before.output_micros !== Math.round(outputIdr * MICRO))
			ins.run(id, 'output_micros', before.output_micros, Math.round(outputIdr * MICRO), locals.user!.email, reason, now);
		audit(db, locals.user!, 'price.update', id, reason, { input: inputIdr, output: outputIdr, markup });
		return { saved: true };
	},
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const field = String(form.get('field') ?? '');
		const reason = String(form.get('reason') ?? '').trim() || 'Perubahan status dari panel admin';
		if (!['enabled', 'visible'].includes(field)) return fail(400, { error: 'Field tidak dikenal.' });
		const db = getDb();
		const row = db.prepare(`SELECT ${field} AS v FROM models WHERE id = ?`).get(id) as { v: number } | undefined;
		if (!row) return fail(404, { error: 'Model tidak ditemukan.' });
		db.prepare(`UPDATE models SET ${field} = ? WHERE id = ?`).run(row.v ? 0 : 1, id);
		audit(db, locals.user!, field === 'enabled' ? 'model.killswitch' : 'model.visibility', id, reason, { to: row.v ? 0 : 1 });
		return { saved: true };
	},
	sync: async ({ locals }) => {
		const url = process.env.PRICE_SYNC_URL;
		if (!url)
			return fail(400, {
				error: 'PRICE_SYNC_URL belum diatur. Job sinkronisasi harga hanya berjalan bila sumber resmi dikonfigurasi.'
			});
		try {
			const res = await fetch(url, { headers: { accept: 'application/json' } });
			if (!res.ok) return fail(502, { error: `Sumber harga menolak: HTTP ${res.status}` });
			const payload = (await res.json()) as { proposals?: { model: string; input: number; output: number }[] };
			const db = getDb();
			const ins = db.prepare('INSERT INTO price_history (model, field, old_value, new_value, actor, reason, created_at) VALUES (?,?,?,?,?,?,?)');
			let count = 0;
			for (const p of payload.proposals ?? []) {
				const row = db.prepare('SELECT input_micros, output_micros FROM models WHERE id = ?').get(p.model) as
					| { input_micros: number; output_micros: number }
					| undefined;
				if (!row) continue;
				ins.run(p.model, 'input_micros', row.input_micros, Math.round(p.input * MICRO), 'sinkronisasi', 'Usulan, belum diterapkan', new Date().toISOString());
				ins.run(p.model, 'output_micros', row.output_micros, Math.round(p.output * MICRO), 'sinkronisasi', 'Usulan, belum diterapkan', new Date().toISOString());
				count += 2;
			}
			audit(db, locals.user!, 'price.sync', 'katalog', 'Menarik usulan harga dari sumber resmi', { proposals: count });
			return { synced: count };
		} catch (err) {
			return fail(502, { error: `Gagal menarik harga: ${(err as Error).message}` });
		}
	}
};
