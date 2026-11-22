import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

/**
 * Idempotency-Key untuk endpoint tulis gateway.
 *
 * Cakupan: per API key + endpoint + nilai header, jadi dua key berbeda tidak
 * pernah saling menimpa. Respons sukses disimpan apa adanya selama TTL, dan
 * permintaan ulang mengembalikan respons tersimpan tanpa memanggil provider —
 * artinya tanpa hold maupun debit kedua.
 *
 * TTL 24 jam mengikuti kebiasaan API pembayaran/gateway. Baris `in_progress`
 * memakai lease pendek (60 detik) supaya proses yang mati di tengah tidak
 * mengunci key selamanya.
 *
 * shortcut: penyimpanan di SQLite proses ini. Pindah ke Redis/Postgres bersama
 * adapter `pg` saat gateway berjalan lebih dari satu instance.
 */
export const RESPONSE_TTL_SECONDS = 24 * 60 * 60;
export const IN_PROGRESS_LEASE_SECONDS = 60;
const MAX_KEY_LENGTH = 255;
const KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export type StoredResponse = {
	status: number;
	body: string;
	contentType: string;
	headers: Record<string, string>;
};

export type BeginResult =
	| { kind: 'proceed' }
	| { kind: 'replay'; response: StoredResponse }
	| { kind: 'conflict'; message: string }
	| { kind: 'in_progress'; retryAfter: number }
	| { kind: 'invalid'; message: string };

type IdempotencyRow = {
	request_hash: string;
	status: string;
	response_status: number | null;
	response_body: string | null;
	response_content_type: string | null;
	response_headers: string | null;
	expires_at: string;
};

function iso(ms: number): string {
	return new Date(ms).toISOString();
}

/** JSON kanonik: urutan field tidak mengubah sidik jari request. */
function canonical(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const obj = value as Record<string, unknown>;
	return `{${Object.keys(obj)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
		.join(',')}}`;
}

export function requestFingerprint(body: unknown): string {
	return createHash('sha256').update(canonical(body)).digest('hex');
}

export function purgeExpiredIdempotency(db: DatabaseSync, now = Date.now()): number {
	return Number(db.prepare('DELETE FROM idempotency_keys WHERE expires_at <= ?').run(iso(now)).changes);
}

export function beginIdempotent(
	db: DatabaseSync,
	apiKeyId: string,
	endpoint: string,
	key: string,
	requestHash: string,
	now = Date.now()
): BeginResult {
	const trimmed = key.trim();
	if (!trimmed || trimmed.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(trimmed))
		return {
			kind: 'invalid',
			message: 'Idempotency-Key harus 1–255 karakter dari huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.'
		};

	purgeExpiredIdempotency(db, now);

	const existing = db
		.prepare('SELECT * FROM idempotency_keys WHERE api_key_id = ? AND endpoint = ? AND idem_key = ?')
		.get(apiKeyId, endpoint, trimmed) as IdempotencyRow | undefined;

	if (existing) {
		if (existing.request_hash !== requestHash)
			return {
				kind: 'conflict',
				message: 'Idempotency-Key ini sudah dipakai untuk body yang berbeda. Pakai key baru untuk request baru.'
			};
		if (existing.status === 'completed' && existing.response_status !== null && existing.response_body !== null) {
			let headers: Record<string, string> = {};
			try {
				headers = existing.response_headers ? (JSON.parse(existing.response_headers) as Record<string, string>) : {};
			} catch {
				headers = {};
			}
			return {
				kind: 'replay',
				response: {
					status: existing.response_status,
					body: existing.response_body,
					contentType: existing.response_content_type ?? 'application/json',
					headers
				}
			};
		}
		return { kind: 'in_progress', retryAfter: 1 };
	}

	const inserted = db
		.prepare(
			`INSERT OR IGNORE INTO idempotency_keys
			 (api_key_id, endpoint, idem_key, request_hash, status, created_at, expires_at)
			 VALUES (?,?,?,?, 'in_progress', ?, ?)`
		)
		.run(apiKeyId, endpoint, trimmed, requestHash, iso(now), iso(now + IN_PROGRESS_LEASE_SECONDS * 1000));

	// Proses lain memenangkan balapan INSERT: perilakunya sama dengan in-progress.
	if (!inserted.changes) return { kind: 'in_progress', retryAfter: 1 };
	return { kind: 'proceed' };
}

export function completeIdempotent(
	db: DatabaseSync,
	apiKeyId: string,
	endpoint: string,
	key: string,
	response: StoredResponse,
	now = Date.now()
): void {
	db.prepare(
		`UPDATE idempotency_keys
		 SET status = 'completed', response_status = ?, response_content_type = ?, response_body = ?, response_headers = ?, expires_at = ?
		 WHERE api_key_id = ? AND endpoint = ? AND idem_key = ?`
	).run(
		response.status,
		response.contentType,
		response.body,
		JSON.stringify(response.headers),
		iso(now + RESPONSE_TTL_SECONDS * 1000),
		apiKeyId,
		endpoint,
		key.trim()
	);
}

/** Lepas key yang gagal sebelum menghasilkan respons, agar klien boleh mencoba lagi. */
export function abortIdempotent(db: DatabaseSync, apiKeyId: string, endpoint: string, key: string): void {
	db.prepare("DELETE FROM idempotency_keys WHERE api_key_id = ? AND endpoint = ? AND idem_key = ? AND status = 'in_progress'").run(
		apiKeyId,
		endpoint,
		key.trim()
	);
}

/** Respons tersimpan diputar ulang apa adanya, dengan penanda eksplisit. */
export function replayResponse(response: StoredResponse): Response {
	return new Response(response.body, {
		status: response.status,
		headers: {
			...response.headers,
			'content-type': response.contentType,
			'idempotency-replayed': 'true'
		}
	});
}
