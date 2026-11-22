import type { DatabaseSync } from 'node:sqlite';

export type LedgerEntry = {
	id: number;
	org_id: string;
	kind: string;
	amount_micros: number;
	balance_after: number;
	memo: string;
	ref: string | null;
	actor: string;
	created_at: string;
};

/**
 * Ledger append-only dengan hold/settle atomik. Saldo tidak boleh negatif walau
 * request paralel: hold dihitung dari saldo dikurangi seluruh hold aktif.
 * shortcut: satu proses, satu koneksi SQLite; pindah ke Postgres/Redis saat multi-instance.
 */
export class Ledger {
	constructor(private db: DatabaseSync) {}

	private tx<T>(fn: () => T): T {
		this.db.exec('BEGIN IMMEDIATE');
		try {
			const out = fn();
			this.db.exec('COMMIT');
			return out;
		} catch (err) {
			this.db.exec('ROLLBACK');
			throw err;
		}
	}

	balance(orgId: string): number {
		const row = this.db.prepare('SELECT balance_micros AS b FROM orgs WHERE id = ?').get(orgId) as { b: number } | undefined;
		return row?.b ?? 0;
	}

	heldMicros(orgId: string): number {
		const row = this.db.prepare('SELECT COALESCE(SUM(amount_micros),0) AS s FROM holds WHERE org_id = ?').get(orgId) as {
			s: number;
		};
		return row.s;
	}

	available(orgId: string): number {
		return this.balance(orgId) - this.heldMicros(orgId);
	}

	/** Menahan saldo. False bila saldo tersedia kurang. */
	hold(orgId: string, requestId: string, amountMicros: number): boolean {
		return this.tx(() => {
			if (amountMicros > this.balance(orgId) - this.heldMicros(orgId)) return false;
			this.db
				.prepare('INSERT OR REPLACE INTO holds (request_id, org_id, amount_micros, created_at) VALUES (?,?,?,?)')
				.run(requestId, orgId, amountMicros, new Date().toISOString());
			return true;
		});
	}

	release(requestId: string): void {
		this.db.prepare('DELETE FROM holds WHERE request_id = ?').run(requestId);
	}

	/** Melepas hold dan menulis satu entri debit. Biaya tidak pernah membuat saldo negatif. */
	settle(orgId: string, requestId: string, chargedMicros: number, memo: string, ref: string, actor = 'gateway'): number {
		return this.tx(() => {
			this.db.prepare('DELETE FROM holds WHERE request_id = ?').run(requestId);
			const balance = this.balance(orgId);
			const charge = Math.min(Math.max(0, chargedMicros), balance);
			const next = balance - charge;
			this.db
				.prepare('INSERT INTO ledger (org_id, kind, amount_micros, balance_after, memo, ref, actor, created_at) VALUES (?,?,?,?,?,?,?,?)')
				.run(orgId, 'charge', -charge, next, memo, ref, actor, new Date().toISOString());
			this.db.prepare('UPDATE orgs SET balance_micros = ? WHERE id = ?').run(next, orgId);
			return next;
		});
	}

	/** Kredit manual (top up, refund, kompensasi). Append-only: tidak pernah mengubah entri lama. */
	credit(
		orgId: string,
		amountMicros: number,
		kind: 'topup' | 'refund' | 'grant' | 'adjust',
		memo: string,
		ref: string | null,
		actor: string
	): number {
		if (amountMicros <= 0) throw new Error('Nominal kredit harus positif');
		return this.tx(() => {
			const next = this.balance(orgId) + amountMicros;
			this.db
				.prepare('INSERT INTO ledger (org_id, kind, amount_micros, balance_after, memo, ref, actor, created_at) VALUES (?,?,?,?,?,?,?,?)')
				.run(orgId, kind, amountMicros, next, memo, ref, actor, new Date().toISOString());
			this.db.prepare('UPDATE orgs SET balance_micros = ? WHERE id = ?').run(next, orgId);
			return next;
		});
	}

	/** Koreksi admin negatif. Tidak pernah membuat saldo di bawah nol; alasan wajib di lapisan pemanggil. */
	debit(orgId: string, amountMicros: number, kind: 'adjust' | 'refund', memo: string, ref: string | null, actor: string): number {
		if (amountMicros <= 0) throw new Error('Nominal debit harus positif');
		return this.tx(() => {
			const balance = this.balance(orgId);
			const charge = Math.min(amountMicros, balance);
			const next = balance - charge;
			this.db
				.prepare('INSERT INTO ledger (org_id, kind, amount_micros, balance_after, memo, ref, actor, created_at) VALUES (?,?,?,?,?,?,?,?)')
				.run(orgId, kind, -charge, next, memo, ref, actor, new Date().toISOString());
			this.db.prepare('UPDATE orgs SET balance_micros = ? WHERE id = ?').run(next, orgId);
			return next;
		});
	}

	entries(orgId: string, limit = 100): LedgerEntry[] {
		return this.db
			.prepare('SELECT * FROM ledger WHERE org_id = ? ORDER BY id DESC LIMIT ?')
			.all(orgId, limit) as unknown as LedgerEntry[];
	}
}
