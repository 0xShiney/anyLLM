import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db';
import { Ledger } from './ledger';
import { computeCost, billedMicros, estimateMaxCost } from './pricing';
import { RateLimiter, ResponseCache } from './limiter';
import { CircuitBreaker, resolveRoute } from './router';
import { wilsonLower } from './replay';
import { sseEvents } from './adapters';
import { randomUUID } from 'node:crypto';

function seedOrg(db: ReturnType<typeof openDb>, balance: number) {
	const orgId = randomUUID();
	db.prepare('INSERT INTO orgs (id, name, slug, balance_micros, zdr, logging_enabled, retention_days, created_at) VALUES (?,?,?,?,0,0,30,?)').run(
		orgId,
		'A',
		orgId,
		balance,
		new Date().toISOString()
	);
	return orgId;
}

function seedModel(db: ReturnType<typeof openDb>, id: string, input: number, output: number) {
	db.prepare(
		'INSERT INTO models (id, provider, label, context, input_micros, output_micros, cached_micros, markup_pct, enabled, visible, sort) VALUES (?,?,?,?,?,?,?,?,1,1,1)'
	).run(id, id.split('/')[0], id, 1000, input, output, 0, 10);
}

test('cache hit memakai harga cached dan sisanya harga input', () => {
	const price = { input_micros: 1_000_000, output_micros: 2_000_000, cached_micros: 100_000 };
	// 1000 token prompt (400 cached) + 500 output
	const { costMicros } = computeCost(price, { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: 400 });
	assert.equal(costMicros, Math.round((600 * 1_000_000 + 400 * 100_000 + 500 * 2_000_000) / 1_000_000));
	assert.equal(billedMicros(1000, 15), 1150);
	assert.equal(estimateMaxCost({ ...price, id: 'x', provider: 'x', markup_pct: 15, enabled: 1, visible: 1, context: 1 }, 1000, 500), 2000);
});

test('hold mencegah saldo negatif saat request paralel', () => {
	const db = openDb();
	const orgId = seedOrg(db, 100);
	const book = new Ledger(db);
	assert.equal(book.hold(orgId, 'r1', 60), true);
	assert.equal(book.hold(orgId, 'r2', 60), false, 'hold kedua harus ditolak karena saldo tersedia tinggal 40');
	assert.equal(book.available(orgId), 40);
	book.settle(orgId, 'r1', 55, 'x', 'r1');
	assert.equal(book.balance(orgId), 45);
	assert.equal(book.available(orgId), 45);
});

test('settle tidak pernah membuat saldo negatif', () => {
	const db = openDb();
	const orgId = seedOrg(db, 10);
	const book = new Ledger(db);
	book.hold(orgId, 'r1', 10);
	book.settle(orgId, 'r1', 999, 'x', 'r1');
	assert.equal(book.balance(orgId), 0);
	assert.equal(book.entries(orgId)[0].amount_micros, -10);
});

test('ledger append-only: kredit menambah entri, bukan mengubah entri lama', () => {
	const db = openDb();
	const orgId = seedOrg(db, 0);
	const book = new Ledger(db);
	book.credit(orgId, 500, 'topup', 'topup', 'inv1', 'admin@x');
	book.credit(orgId, 250, 'refund', 'refund', 'inv2', 'admin@x');
	const entries = book.entries(orgId);
	assert.equal(entries.length, 2);
	assert.equal(entries[0].balance_after, 750);
	assert.equal(book.balance(orgId), 750);
});

test('rate limiter token bucket dan retry-after', () => {
	const rl = new RateLimiter();
	const t0 = 1_000_000;
	for (let i = 0; i < 3; i++) assert.equal(rl.take('k', 3, t0).ok, true);
	const blocked = rl.take('k', 3, t0);
	assert.equal(blocked.ok, false);
	assert.ok(blocked.retryAfter >= 1);
	assert.equal(rl.take('k', 3, t0 + 21_000).ok, true);
});

test('cache kedaluwarsa sesuai TTL', () => {
	const cache = new ResponseCache(2);
	cache.set('a', 'v', 1);
	assert.equal(cache.get('a', Date.now()), 'v');
	assert.equal(cache.get('a', Date.now() + 1001), null);
});

test('router: alias auto-murah memilih model termurah dan fallback ditambahkan', () => {
	const db = openDb();
	seedModel(db, 'openai/mahal', 500_000_000, 500_000_000);
	seedModel(db, 'google/murah', 1_000_000, 1_000_000);
	seedModel(db, 'anthropic/sedang', 100_000_000, 100_000_000);
	const route = resolveRoute(db, 'org', { model: 'auto-murah', messages: [] });
	assert.equal(route.chain[0].model, 'google/murah');
	assert.ok(route.chain.length >= 2);
});

test('router: aturan tag Replay Lab menang atas default', () => {
	const db = openDb();
	seedModel(db, 'openai/asli', 10_000_000, 10_000_000);
	seedModel(db, 'google/kandidat', 1_000_000, 1_000_000);
	const orgId = seedOrg(db, 0);
	db.prepare(
		'INSERT INTO routing_rules (id, org_id, tag, target_model, fallback_model, version, status, source, created_by, created_at) VALUES (?,?,?,?,?,1,?,?,?,?)'
	).run(randomUUID(), orgId, 'ringkasan', 'google/kandidat', 'openai/asli', 'active', 'replay', 'test', new Date().toISOString());
	const route = resolveRoute(db, orgId, { model: 'auto-murah', messages: [] }, { tag: 'ringkasan' });
	assert.equal(route.chain[0].model, 'google/kandidat');
	assert.equal(route.ruleApplied, true);
});

test('router: kill switch model nonaktif tidak dipakai', () => {
	const db = openDb();
	seedModel(db, 'openai/a', 1_000_000, 1_000_000);
	seedModel(db, 'openai/b', 2_000_000, 2_000_000);
	db.prepare("UPDATE models SET enabled = 0 WHERE id = 'openai/a'").run();
	const route = resolveRoute(db, 'org', { model: 'openai/a', messages: [] });
	assert.equal(route.chain[0].model, 'openai/b');
});

test('circuit breaker membuka dan menutup sesuai cooldown', () => {
	const cb = new CircuitBreaker(2, 1000);
	cb.recordFailure('openai', 0);
	assert.equal(cb.isOpen('openai', 1), false);
	cb.recordFailure('openai', 1);
	assert.equal(cb.isOpen('openai', 2), true);
	assert.equal(cb.isOpen('openai', 2000), false);
});

test('wilson lower bound lebih kecil dari proporsi mentah', () => {
	const lower = wilsonLower(5, 5);
	assert.ok(lower < 1 && lower > 0.5);
	assert.equal(wilsonLower(0, 0), 0);
});

test('parser SSE memecah blok data dan mengabaikan komentar', async () => {
	const body = 'data: {"a":1}\n\ndata: [DONE]\n\n: keepalive\n\n';
	const res = new Response(body, { headers: { 'content-type': 'text/event-stream' } });
	const got: string[] = [];
	for await (const ev of sseEvents(res)) got.push(ev);
	assert.deepEqual(got, ['{"a":1}', '[DONE]']);
});
