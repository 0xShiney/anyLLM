import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { Ledger } from '$lib/server/engine/ledger';
import { listLedger } from '$lib/server/queries';
import { MAX_TOPUP_IDR, MIN_TOPUP_IDR, payments } from '$lib/server/payments';
import { MICRO } from '$lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const db = getDb();
	const orgId = locals.user!.orgId;
	const org = db.prepare('SELECT balance_micros, name FROM orgs WHERE id = ?').get(orgId) as {
		balance_micros: number;
		name: string;
	};
	return {
		balance: org.balance_micros,
		ledger: listLedger(db, orgId, 40),
		invoices: db.prepare('SELECT * FROM invoices WHERE org_id = ? ORDER BY created_at DESC LIMIT 10').all(orgId) as unknown as Record<
			string,
			string | number
		>[],
		promos: db.prepare('SELECT * FROM promos WHERE active = 1 ORDER BY code').all() as unknown as Record<string, string | number>[],
		idempotency: randomUUID(),
		minTopup: MIN_TOPUP_IDR,
		maxTopup: MAX_TOPUP_IDR,
		provider: payments.id
	};
};

export const actions: Actions = {
	topup: async ({ request, locals }) => {
		const form = await request.formData();
		const amountIdr = Number(form.get('amount') ?? 0);
		const promoCode = String(form.get('promo') ?? '').trim().toUpperCase();
		if (!Number.isFinite(amountIdr) || amountIdr < MIN_TOPUP_IDR || amountIdr > MAX_TOPUP_IDR)
			return fail(400, { error: `Nominal top up antara Rp${MIN_TOPUP_IDR.toLocaleString('id-ID')} dan Rp${MAX_TOPUP_IDR.toLocaleString('id-ID')}.` });

		const db = getDb();
		const orgId = locals.user!.orgId;
		const amountMicros = Math.round(amountIdr * MICRO);
		const idempotencyKey = String(form.get('idempotency') ?? randomUUID());

		let promo: { code: string; type: string; value: number; min_topup_micros: number; max_redemptions: number; redeemed: number; expires_at: string | null } | undefined;
		if (promoCode) {
			promo = db.prepare('SELECT * FROM promos WHERE code = ? AND active = 1').get(promoCode) as typeof promo;
			if (!promo) return fail(400, { error: 'Kode promo tidak dikenal.' });
			if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now())
				return fail(400, { error: 'Kode promo sudah kedaluwarsa.' });
			if (promo.redeemed >= promo.max_redemptions) return fail(400, { error: 'Kuota kode promo habis.' });
			if (amountMicros < promo.min_topup_micros)
				return fail(400, { error: `Minimal top up untuk promo ini Rp${(promo.min_topup_micros / MICRO).toLocaleString('id-ID')}.` });
			const used = db.prepare('SELECT id FROM promo_redemptions WHERE code = ? AND org_id = ?').get(promoCode, orgId);
			if (used) return fail(400, { error: 'Kode promo sudah dipakai akun ini.' });
		}

		const prior = db.prepare('SELECT provider_ref, amount_micros FROM invoices WHERE idempotency_key = ?').get(idempotencyKey) as
			| { provider_ref: string; amount_micros: number }
			| undefined;
		if (prior)
			return { paid: { ref: prior.provider_ref, bonus: 0, amountMicros: prior.amount_micros } };

		const charge = await payments.createCharge({ orgId, amountMicros, idempotencyKey });
		db.prepare(
			`INSERT INTO invoices (id, org_id, provider, provider_ref, amount_micros, fee_micros, status, idempotency_key, paid_at, created_at)
			 VALUES (?,?,?,?,?,0,?,?,?,?)`
		).run(randomUUID(), orgId, payments.id, charge.providerRef, amountMicros, charge.status, idempotencyKey, charge.paidAt, new Date().toISOString());

		const book = new Ledger(db);
		book.credit(orgId, amountMicros, 'topup', `Top up via ${charge.method.toUpperCase()} (${charge.providerRef})`, charge.providerRef, locals.user!.email);

		let bonus = 0;
		if (promo) {
			bonus = promo.type === 'percent' ? Math.round((amountMicros * promo.value) / 100) : promo.value;
			if (bonus > 0) book.credit(orgId, bonus, 'grant', `Bonus promo ${promo.code}`, promo.code, 'sistem');
			db.prepare('INSERT INTO promo_redemptions (code, org_id, created_at) VALUES (?,?,?)').run(promo.code, orgId, new Date().toISOString());
			db.prepare('UPDATE promos SET redeemed = redeemed + 1 WHERE code = ?').run(promo.code);
		}
		db.prepare('INSERT INTO notifications (org_id, kind, body, read, created_at) VALUES (?,?,?,0,?)').run(
			orgId,
			'topup',
			`Top up ${charge.providerRef} berhasil.${bonus ? ` Bonus promo ${promo?.code}: Rp${(bonus / MICRO).toLocaleString('id-ID')}.` : ''}`,
			new Date().toISOString()
		);
		return { paid: { ref: charge.providerRef, bonus, amountMicros } };
	}
};
