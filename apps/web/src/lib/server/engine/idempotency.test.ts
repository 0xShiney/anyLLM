import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db';
import { completeChat, type ApiKeyRow, type GatewayAuth } from './gateway';
import { Ledger } from './ledger';
import {
	IN_PROGRESS_LEASE_SECONDS,
	RESPONSE_TTL_SECONDS,
	abortIdempotent,
	beginIdempotent,
	completeIdempotent,
	requestFingerprint,
	type StoredResponse
} from './idempotency';
import type { ChatRequest } from './types';

const ENDPOINT = 'chat.completions';

function fixture(db: ReturnType<typeof openDb>, balance: number) {
	const orgId = randomUUID();
	const projectId = randomUUID();
	const keyId = randomUUID();
	const now = new Date().toISOString();
	db.prepare(
		'INSERT INTO orgs (id, name, slug, balance_micros, zdr, logging_enabled, retention_days, created_at) VALUES (?,?,?,?,0,0,30,?)'
	).run(orgId, 'Org Uji', orgId, balance, now);
	db.prepare('INSERT INTO projects (id, org_id, name, logging_enabled, retention_days, zdr, created_at) VALUES (?,?,?,0,30,0,?)').run(
		projectId,
		orgId,
		'Proyek Uji',
		now
	);
	db.prepare(
		"INSERT INTO api_keys (id, project_id, name, prefix, hash, status, scopes, rpm, created_at) VALUES (?,?,?,?,?, 'active', '', NULL, ?)"
	).run(keyId, projectId, 'kunci uji', 'sk-uji', 'hash', now);
	// input 0, output 1e6 mikro per 1M token: hold = max_tokens (1024) mikro.
	db.prepare(
		'INSERT OR IGNORE INTO models (id, provider, label, context, input_micros, output_micros, cached_micros, markup_pct, enabled, visible, sort) VALUES (?,?,?,?,?,?,?,?,1,1,1)'
	).run('mock/uji', 'mock', 'Mock Uji', 8192, 0, 1_000_000, 0, 10);
	const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId) as unknown as ApiKeyRow;
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as GatewayAuth['project'];
	const org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(orgId) as unknown as GatewayAuth['org'];
	return { auth: { key, project, org } as GatewayAuth, orgId, keyId };
}

const BODY: ChatRequest = { model: 'mock/uji', messages: [{ role: 'user', content: 'ringkas rapat' }], max_tokens: 1024 };
const stored = (requestId: string, body: string): StoredResponse => ({
	status: 200,
	body,
	contentType: 'application/json',
	headers: { 'x-request-id': requestId }
});

/** Meniru alur route: begin → panggil gateway → simpan respons. */
async function guarded(
	db: ReturnType<typeof openDb>,
	auth: GatewayAuth,
	key: string,
	body: ChatRequest,
	requestId: string
): Promise<{ replayed: boolean; response: StoredResponse }> {
	const begin = beginIdempotent(db, auth.key.id, ENDPOINT, key, requestFingerprint(body));
	if (begin.kind === 'replay') return { replayed: true, response: begin.response };
	assert.equal(begin.kind, 'proceed');
	const out = await completeChat(db, auth, body, null, requestId);
	const payload = JSON.stringify({ text: out.result.text, billed: out.billedMicros });
	const response = stored(requestId, payload);
	completeIdempotent(db, auth.key.id, ENDPOINT, key, response);
	return { replayed: false, response };
}

function charges(db: ReturnType<typeof openDb>, orgId: string) {
	return new Ledger(db).entries(orgId).filter((e) => e.kind === 'charge');
}

test('Idempotency-Key sama: respons diputar ulang dan hanya ditagih sekali', async () => {
	const db = openDb();
	const { auth, orgId } = fixture(db, 10_000);
	const key = randomUUID();

	const first = await guarded(db, auth, key, BODY, 'req_pertama');
	const second = await guarded(db, auth, key, BODY, 'req_ulang');

	assert.equal(first.replayed, false);
	assert.equal(second.replayed, true);
	assert.equal(second.response.body, first.response.body, 'body respons harus identik');
	assert.equal(charges(db, orgId).length, 1, 'hanya satu entri debit');
	assert.equal((db.prepare('SELECT COUNT(*) AS n FROM usage WHERE org_id = ?').get(orgId) as { n: number }).n, 1);
	assert.equal(new Ledger(db).balance(orgId), 10_000 - JSON.parse(first.response.body).billed);
});

test('retry paralel dengan key sama: satu dieksekusi, satu ditolak in-progress, total satu tagihan', async () => {
	const db = openDb();
	const { auth, orgId } = fixture(db, 10_000);
	const key = randomUUID();
	const hash = requestFingerprint(BODY);

	const winner = beginIdempotent(db, auth.key.id, ENDPOINT, key, hash);
	assert.equal(winner.kind, 'proceed');
	const loser = beginIdempotent(db, auth.key.id, ENDPOINT, key, hash);
	assert.equal(loser.kind, 'in_progress');

	const out = await completeChat(db, auth, BODY, null, 'req_race');
	completeIdempotent(db, auth.key.id, ENDPOINT, key, stored('req_race', JSON.stringify({ text: out.result.text })));

	const retry = beginIdempotent(db, auth.key.id, ENDPOINT, key, hash);
	assert.equal(retry.kind, 'replay');
	assert.equal(charges(db, orgId).length, 1);
});

test('key sama dengan body berbeda ditolak, bukan dieksekusi ulang', async () => {
	const db = openDb();
	const { auth } = fixture(db, 10_000);
	const key = randomUUID();
	assert.equal(beginIdempotent(db, auth.key.id, ENDPOINT, key, requestFingerprint(BODY)).kind, 'proceed');
	const other: ChatRequest = { ...BODY, messages: [{ role: 'user', content: 'pertanyaan lain' }] };
	const conflict = beginIdempotent(db, auth.key.id, ENDPOINT, key, requestFingerprint(other));
	assert.equal(conflict.kind, 'conflict');
});

test('TTL respons 24 jam dan lease in-progress 60 detik', () => {
	const db = openDb();
	const { auth } = fixture(db, 10_000);
	const key = randomUUID();
	const t0 = Date.now();
	const hash = requestFingerprint(BODY);

	assert.equal(beginIdempotent(db, auth.key.id, ENDPOINT, key, hash, t0).kind, 'proceed');
	assert.equal(beginIdempotent(db, auth.key.id, ENDPOINT, key, hash, t0 + 30_000).kind, 'in_progress');
	// Lease habis: proses yang mati tidak mengunci key selamanya.
	assert.equal(
		beginIdempotent(db, auth.key.id, ENDPOINT, key, hash, t0 + (IN_PROGRESS_LEASE_SECONDS + 1) * 1000).kind,
		'proceed'
	);

	completeIdempotent(db, auth.key.id, ENDPOINT, key, stored('req_ttl', '{}'), t0);
	assert.equal(
		beginIdempotent(db, auth.key.id, ENDPOINT, key, hash, t0 + (RESPONSE_TTL_SECONDS - 10) * 1000).kind,
		'replay'
	);
	assert.equal(
		beginIdempotent(db, auth.key.id, ENDPOINT, key, hash, t0 + (RESPONSE_TTL_SECONDS + 10) * 1000).kind,
		'proceed'
	);
});

test('key terpisah per API key, dan abort melepas key untuk retry', async () => {
	const db = openDb();
	const { auth, keyId } = fixture(db, 10_000);
	const other = fixture(db, 10_000);
	const key = randomUUID();
	const hash = requestFingerprint(BODY);

	assert.equal(beginIdempotent(db, keyId, ENDPOINT, key, hash).kind, 'proceed');
	assert.equal(beginIdempotent(db, other.keyId, ENDPOINT, key, hash).kind, 'proceed', 'key milik API key lain tidak bentrok');
	abortIdempotent(db, keyId, ENDPOINT, key);
	assert.equal(beginIdempotent(db, keyId, ENDPOINT, key, hash).kind, 'proceed');
});

test('format Idempotency-Key tidak valid ditolak', () => {
	const db = openDb();
	const { auth } = fixture(db, 10_000);
	for (const bad of ['', 'ada spasi', 'x'.repeat(256), 'emoji🙂']) {
		assert.equal(beginIdempotent(db, auth.key.id, ENDPOINT, bad, 'hash').kind, 'invalid', bad);
	}
});

test('sidik jari request tidak bergantung urutan field', () => {
	assert.equal(requestFingerprint({ model: 'a', max_tokens: 5 }), requestFingerprint({ max_tokens: 5, model: 'a' }));
	assert.notEqual(requestFingerprint({ model: 'a' }), requestFingerprint({ model: 'b' }));
});

test('balapan billing: hold paralel tidak pernah melebihi saldo', async () => {
	const db = openDb();
	// Saldo cukup untuk satu hold (1024 mikro), tidak untuk dua.
	const { auth, orgId } = fixture(db, 1100);
	const results = await Promise.allSettled(
		Array.from({ length: 6 }, (_, i) => completeChat(db, auth, BODY, null, `req_balapan_${i}`))
	);

	const ok = results.filter((r) => r.status === 'fulfilled');
	const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
	assert.equal(ok.length, 1, 'hanya satu request boleh lolos hold');
	assert.equal(rejected.length, 5);
	for (const r of rejected) assert.equal((r.reason as { code?: string }).code, 'insufficient_balance');

	const book = new Ledger(db);
	const charged = charges(db, orgId);
	assert.equal(charged.length, 1, 'satu request = satu debit');
	const totalDebit = charged.reduce((sum, e) => sum + Math.abs(e.amount_micros), 0);
	const balance = book.balance(orgId);
	assert.ok(balance >= 0, 'saldo tidak boleh negatif');
	assert.equal(balance, 1100 - totalDebit);
	assert.equal(book.available(orgId), balance, 'tidak ada hold yang tertinggal');
	assert.equal((db.prepare('SELECT COUNT(*) AS n FROM usage WHERE org_id = ?').get(orgId) as { n: number }).n, 1);
});
