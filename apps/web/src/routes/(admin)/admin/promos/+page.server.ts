import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { MICRO } from '$lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		promos: db.prepare('SELECT * FROM promos ORDER BY code').all() as unknown as Record<string, string | number>[],
		redemptions: db
			.prepare(
				`SELECT r.code, r.created_at, o.name AS org_name FROM promo_redemptions r LEFT JOIN orgs o ON o.id = r.org_id
				 ORDER BY r.id DESC LIMIT 15`
			)
			.all() as unknown as Record<string, string | number>[]
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim().toUpperCase();
		const type = String(form.get('type') ?? 'percent');
		const value = Number(form.get('value') ?? 0);
		const minTopup = Number(form.get('min_topup') ?? 0);
		const max = Number(form.get('max') ?? 100);
		const days = Number(form.get('days') ?? 30);
		if (!/^[A-Z0-9-]{3,20}$/.test(code)) return fail(400, { error: 'Kode 3–20 karakter, huruf/angka/tanda hubung.' });
		if (!['percent', 'credit', 'amount'].includes(type)) return fail(400, { error: 'Jenis promo tidak dikenal.' });
		if (value <= 0) return fail(400, { error: 'Nilai promo harus lebih dari 0.' });
		if (type === 'percent' && value > 100) return fail(400, { error: 'Persentase maksimal 100.' });

		const db = getDb();
		const exists = db.prepare('SELECT code FROM promos WHERE code = ?').get(code);
		if (exists) return fail(409, { error: 'Kode promo sudah ada.' });
		db.prepare('INSERT INTO promos (code, type, value, min_topup_micros, max_redemptions, redeemed, expires_at, active) VALUES (?,?,?,?,?,0,?,1)').run(
			code,
			type,
			type === 'credit' ? Math.round(value * MICRO) : value,
			Math.round(minTopup * MICRO),
			max,
			new Date(Date.now() + days * 86_400_000).toISOString()
		);
		audit(db, locals.user!, 'promo.create', code, 'Membuat kode promo', { type, value, minTopup, max, days });
		return { saved: true };
	},
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const code = String(form.get('code') ?? '');
		const db = getDb();
		const row = db.prepare('SELECT active FROM promos WHERE code = ?').get(code) as { active: number } | undefined;
		if (!row) return fail(404, { error: 'Promo tidak ditemukan.' });
		db.prepare('UPDATE promos SET active = ? WHERE code = ?').run(row.active ? 0 : 1, code);
		audit(db, locals.user!, 'promo.toggle', code, 'Perubahan status promo', { to: row.active ? 0 : 1 });
		return { saved: true };
	}
};
