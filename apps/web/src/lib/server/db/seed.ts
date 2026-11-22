import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { hashPassword } from '../password';
import { encryptFor } from '../engine/crypto';

const MICRO = 1_000_000;

// Harga contoh (IDR per 1 juta token). Ditandai source='demo'; bukan klaim harga resmi.
const MODELS: [string, string, string, number, number, number, number, number, number][] = [
	// id, provider, label, context, input, output, cached, markup, sort
	['openai/gpt-4o-mini', 'openai', 'GPT-4o mini', 128_000, 2_450, 9_800, 1_225, 15, 10],
	['openai/gpt-4o', 'openai', 'GPT-4o', 128_000, 40_750, 163_000, 20_375, 12, 20],
	['anthropic/claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', 200_000, 16_300, 81_500, 1_630, 15, 30],
	['anthropic/claude-sonnet-4-5', 'anthropic', 'Claude Sonnet 4.5', 200_000, 48_900, 244_500, 4_890, 12, 40],
	['google/gemini-2.5-flash', 'google', 'Gemini 2.5 Flash', 1_000_000, 4_890, 40_750, 1_220, 15, 50],
	['google/gemini-2.5-pro', 'google', 'Gemini 2.5 Pro', 1_000_000, 20_375, 163_000, 5_090, 15, 60],
	['meta/llama-4-scout', 'generic', 'Llama 4 Scout', 320_000, 1_790, 5_540, 0, 18, 70],
	['deepseek/deepseek-chat', 'generic', 'DeepSeek Chat', 128_000, 4_400, 17_900, 1_100, 18, 80]
];

const TAG_MODEL: Record<string, string> = {
	ringkasan: 'openai/gpt-4o',
	klasifikasi: 'openai/gpt-4o-mini',
	'chat-support': 'anthropic/claude-sonnet-4-5',
	ekstraksi: 'google/gemini-2.5-pro'
};

const TAGS: [string, number][] = [
	['klasifikasi', 0.35],
	['ringkasan', 0.3],
	['chat-support', 0.2],
	['ekstraksi', 0.15]
];

const LATENCY: Record<string, number> = {
	'openai/gpt-4o': 2100,
	'openai/gpt-4o-mini': 900,
	'anthropic/claude-sonnet-4-5': 1600,
	'anthropic/claude-haiku-4-5': 760,
	'google/gemini-2.5-flash': 980,
	'google/gemini-2.5-pro': 2400,
	'meta/llama-4-scout': 620,
	'deepseek/deepseek-chat': 1400
};

const PROMPTS: Record<string, string> = {
	ringkasan:
		'Ringkas transkrip rapat berikut menjadi 5 poin keputusan dan daftar action item dengan pemiliknya.',
	klasifikasi: 'Tentukan kategori tiket berikut: billing, teknis, atau akun. Jawab satu kata.',
	'chat-support':
		'Pelanggan bertanya kenapa saldo terpotong dua kali. Tulis balasan yang menenangkan dan minta request ID.',
	ekstraksi: 'Ambil nama vendor, nomor invoice, dan total dari teks berikut dalam JSON.'
};

const RESPONSES: Record<string, string> = {
	ringkasan:
		'1. Anggaran Q4 disetujui dengan batas 1,2 miliar.\n2. Migrasi database dijadwalkan 3 Desember.\n3. Vendor observabilitas dipilih bulan ini.\n4. Rekrutmen dua engineer dibuka.\n5. Laporan margin dikirim tiap Senin.\n\nAction item: Dita — finalisasi kontrak vendor; Arif — jadwal migrasi; Sari — template laporan.',
	klasifikasi: 'billing',
	'chat-support':
		'Halo, terima kasih sudah melapor. Potongan ganda biasanya berasal dari retry otomatis saat koneksi terputus. Boleh kirimkan request ID dari header X-Request-Id? Kami akan cek dan mengembalikan selisihnya hari ini.',
	ekstraksi: '{"vendor":"PT Sinar Data","invoice":"INV-2026-0412","total":18750000}'
};

const CANDIDATE_TEXT: Record<string, string> = {
	ringkasan:
		'Ringkasan rapat:\n- Anggaran Q4 disetujui, batas 1,2 miliar.\n- Migrasi database 3 Desember.\n- Vendor observabilitas dipilih bulan ini.\n- Dua engineer direkrut.\n- Laporan margin tiap Senin.\n\nAction item: kontrak vendor (Dita), migrasi (Arif), laporan (Sari).',
	klasifikasi: 'billing',
	'chat-support':
		'Halo, maaf atas ketidaknyamanannya. Potongan ganda umumnya terjadi karena retry otomatis. Mohon kirim request ID (header X-Request-Id) agar kami cek dan kembalikan selisihnya hari ini.',
	ekstraksi: '{"vendor":"PT Sinar Data","invoice":"INV-2026-0412","total":18750000}'
};

function mulberry32(seedValue: number) {
	return () => {
		seedValue |= 0;
		seedValue = (seedValue + 0x6d2b79f5) | 0;
		let t = Math.imul(seedValue ^ (seedValue >>> 15), 1 | seedValue);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pickTag(rand: () => number): string {
	const r = rand();
	let acc = 0;
	for (const [tag, w] of TAGS) {
		acc += w;
		if (r <= acc) return tag;
	}
	return 'klasifikasi';
}

function costMicros(model: string, promptTokens: number, completionTokens: number): number {
	const m = MODELS.find((x) => x[0] === model);
	if (!m) return 0;
	return Math.round((promptTokens * m[4] * MICRO + completionTokens * m[5] * MICRO) / 1_000_000);
}

export function seed(db: DatabaseSync): void {
	const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
	if (existing.n > 0) return;

	const rand = mulberry32(20261122);
	const now = Date.now();
	const iso = (daysAgo: number, hour = 9, minute = 0) =>
		new Date(now - daysAgo * 86_400_000).toISOString().replace(/T\d{2}:\d{2}/, `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
	const dayIso = (daysAgo: number) => iso(daysAgo);

	const orgId = randomUUID();
	const projectId = randomUUID();
	const stagingId = randomUUID();
	const userId = randomUUID();
	const adminId = randomUUID();
	const arifId = randomUUID();
	const sariId = randomUUID();
	const financeId = randomUUID();
	const pwd = hashPassword('demo1234');

	const insUser = db.prepare(
		'INSERT INTO users (id, email, name, password_hash, role, totp_enabled, created_at) VALUES (?,?,?,?,?,?,?)'
	);
	insUser.run(userId, 'dita@kanaya.studio', 'Dita Anggraini', pwd, 'customer', 0, iso(64));
	insUser.run(arifId, 'arif@kanaya.studio', 'Arif Nugroho', pwd, 'customer', 0, iso(52));
	insUser.run(sariId, 'sari@kanaya.studio', 'Sari Wulandari', pwd, 'customer', 0, iso(30));
	insUser.run(adminId, 'admin@anyllm.id', 'Rani Prameswari', pwd, 'admin', 1, iso(120));
	insUser.run(financeId, 'finance@anyllm.id', 'Bagas Prasetyo', pwd, 'finance', 1, iso(110));

	db.prepare('INSERT INTO orgs (id, name, slug, balance_micros, zdr, logging_enabled, retention_days, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
		orgId,
		'Kanaya Studio',
		'kanaya',
		0,
		0,
		1,
		30,
		iso(64)
	);
	const insMember = db.prepare('INSERT INTO members (org_id, user_id, role) VALUES (?,?,?)');
	insMember.run(orgId, userId, 'owner');
	insMember.run(orgId, arifId, 'developer');
	insMember.run(orgId, sariId, 'viewer');

	db.prepare('INSERT INTO projects (id, org_id, name, logging_enabled, retention_days, zdr, created_at) VALUES (?,?,?,?,?,?,?)').run(
		projectId,
		orgId,
		'produksi',
		1,
		30,
		0,
		iso(64)
	);
	db.prepare('INSERT INTO projects (id, org_id, name, logging_enabled, retention_days, zdr, created_at) VALUES (?,?,?,?,?,?,?)').run(
		stagingId,
		orgId,
		'staging',
		0,
		7,
		1,
		iso(40)
	);

	const insModel = db.prepare(
		'INSERT INTO models (id, provider, label, context, input_micros, output_micros, cached_micros, markup_pct, enabled, visible, sort, verified_at, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
	);
	for (const [id, provider, label, ctx, inp, out, cached, markup, sort] of MODELS) {
		insModel.run(id, provider, label, ctx, inp * MICRO, out * MICRO, cached * MICRO, markup, 1, 1, sort, null, 'demo');
	}

	const insKey = db.prepare(
		'INSERT INTO api_keys (id, project_id, name, prefix, hash, status, scopes, rpm, daily_budget_micros, monthly_budget_micros, last_used_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
	);
	const keyRows = [
		{ name: 'Produksi', project: projectId, prefix: 'sk-any-7f3a', full: 'sk-any-7f3a9c21e4b8', budget: 2_500_000 * MICRO, rpm: 600 },
		{ name: 'Staging', project: stagingId, prefix: 'sk-any-b21c', full: 'sk-any-b21c4d90aa17', budget: 300_000 * MICRO, rpm: 120 },
		{ name: 'Playground', project: projectId, prefix: 'sk-any-9de0', full: 'sk-any-9de05b18ff42', budget: null, rpm: 60 }
	];
	for (const k of keyRows) {
		insKey.run(
			randomUUID(),
			k.project,
			k.name,
			k.prefix,
			createHash('sha256').update(k.full).digest('hex'),
			'active',
			'',
			k.rpm,
			k.budget,
			k.budget ? k.budget * 30 : null,
			iso(rand() * 3),
			iso(60)
		);
	}

	// Usage 30 hari.
	const insUsage = db.prepare(
		`INSERT INTO usage (request_id, org_id, project_id, api_key_id, tag, model, provider, prompt_tokens, completion_tokens, cached_tokens, cost_micros, billed_micros, latency_ms, status, stream, estimated, simulated, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
	);
	const usageIds: { request_id: string; tag: string; model: string; created_at: string; billed: number }[] = [];
	let dailyCharge = new Map<string, number>();
	let failedRequestId = '';

	for (let d = 29; d >= 0; d--) {
		const count = 38 + Math.floor(rand() * 16);
		for (let i = 0; i < count; i++) {
			const tag = pickTag(rand);
			let model = TAG_MODEL[tag];
			// aturan routing yang sudah aktif menggeser sebagian trafik
			if (tag === 'klasifikasi' && rand() < 0.55) model = 'google/gemini-2.5-flash';
			if (tag === 'ringkasan' && d < 8) model = 'google/gemini-2.5-flash';

			const pt =
				tag === 'ringkasan'
					? 1200 + Math.floor(rand() * 1400)
					: tag === 'klasifikasi'
						? 250 + Math.floor(rand() * 450)
						: tag === 'chat-support'
							? 700 + Math.floor(rand() * 1100)
							: 900 + Math.floor(rand() * 600);
			const ct =
				tag === 'ringkasan'
					? 250 + Math.floor(rand() * 200)
					: tag === 'klasifikasi'
						? 20 + Math.floor(rand() * 40)
						: tag === 'chat-support'
							? 200 + Math.floor(rand() * 300)
							: 120 + Math.floor(rand() * 140);

			const roll = rand();
			const status = roll > 0.985 ? 'provider_error' : roll > 0.975 ? 'rate_limited' : 'ok';
			const cost = costMicros(model, pt, ct);
			const markup = MODELS.find((m) => m[0] === model)?.[7] ?? 15;
			const billed = status === 'ok' ? Math.round(cost * (1 + markup / 100)) : 0;
			const created = iso(d, 0, 1 + Math.floor(rand() * 1439) % 24);
			const requestId = `req_${Math.random().toString(36).slice(2, 12)}`;
			const latency = Math.round((LATENCY[model] ?? 1200) * (0.6 + rand()));

			insUsage.run(
				requestId,
				orgId,
				stagingId,
				null,
				tag,
				model,
				MODELS.find((m) => m[0] === model)?.[1] ?? 'openai',
				pt,
				status === 'ok' ? ct : Math.floor(ct / 3),
				0,
				cost,
				billed,
				latency,
				status,
				rand() < 0.7 ? 1 : 0,
				0,
				1,
				created
			);
			usageIds.push({ request_id: requestId, tag, model, created_at: created, billed });
			if (status === 'provider_error' && !failedRequestId) failedRequestId = requestId;
			dailyCharge.set(created.slice(0, 10), (dailyCharge.get(created.slice(0, 10)) ?? 0) + billed);
		}
	}

	// Ledger konsisten dengan usage: topup lalu tagihan harian.
	const insLedger = db.prepare(
		'INSERT INTO ledger (org_id, kind, amount_micros, balance_after, memo, ref, actor, created_at) VALUES (?,?,?,?,?,?,?,?)'
	);
	let balance = 0;
	const topups = new Map<string, number>([
		[dayIso(31).slice(0, 10), 1_500_000 * MICRO],
		[dayIso(16).slice(0, 10), 1_000_000 * MICRO]
	]);
	const insInvoice = db.prepare(
		'INSERT INTO invoices (id, org_id, provider, provider_ref, amount_micros, fee_micros, status, idempotency_key, paid_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
	);
	const days = [...new Set([...dailyCharge.keys(), ...topups.keys()])].sort();
	for (const day of days) {
		const topup = topups.get(day);
		if (topup) {
			balance += topup;
			insLedger.run(orgId, 'topup', topup, balance, 'Top up saldo via QRIS', `topup_${day}`, 'dita@kanaya.studio', `${day}T08:12:00.000Z`);
			insInvoice.run(
				randomUUID(),
				orgId,
				'simulated',
				`QRIS-${day.replace(/-/g, '')}`,
				topup,
				0,
				'paid',
				`idem-${day}`,
				`${day}T08:12:00.000Z`,
				`${day}T08:11:20.000Z`
			);
		}
		const charge = dailyCharge.get(day) ?? 0;
		if (charge > 0) {
			balance -= charge;
			insLedger.run(orgId, 'charge', -charge, balance, 'Pemakaian harian gateway', `usage_${day}`, 'sistem', `${day}T23:59:00.000Z`);
		}
	}
	db.prepare('UPDATE orgs SET balance_micros = ? WHERE id = ?').run(balance, orgId);

	// Log prompt opt-in untuk Replay Lab.
	const insLog = db.prepare(
		'INSERT INTO prompt_logs (project_id, request_id, tag, model, payload_enc, expires_at, created_at) VALUES (?,?,?,?,?,?,?)'
	);
	const logSeeds = usageIds.filter((u) => u.tag === 'ringkasan').slice(0, 60);
	for (const l of logSeeds) {
		insLog.run(
			projectId,
			l.request_id,
			l.tag,
			l.model,
			encryptFor(projectId, JSON.stringify({ prompt: PROMPTS.ringkasan, response: RESPONSES.ringkasan })),
			new Date(now + 30 * 86_400_000).toISOString(),
			l.created_at
		);
	}

	const insRule = db.prepare(
		'INSERT INTO routing_rules (id, org_id, tag, target_model, fallback_model, version, status, source, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
	);
	insRule.run(randomUUID(), orgId, 'klasifikasi', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 'archived', 'replay', 'Hasil replay 8 Nov: hemat 74%, kualitas setara.', 'dita@kanaya.studio', dayIso(14));
	insRule.run(randomUUID(), orgId, 'klasifikasi', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 2, 'active', 'replay', 'Perpanjang masa uji 14 hari.', 'dita@kanaya.studio', dayIso(9));
	insRule.run(randomUUID(), orgId, 'ringkasan', 'google/gemini-2.5-flash', 'openai/gpt-4o', 1, 'active', 'replay', 'Hemat 71%, ringkasan lebih pendek 12%.', 'dita@kanaya.studio', dayIso(4));

	const presetConfig = (models: string[]) =>
		JSON.stringify({
			models,
			provider: { sort: 'price', allow_fallbacks: true, data_collection: 'deny' },
			params: { temperature: 0.3 },
			system_prompt: null,
			cache: { enabled: true, ttl_seconds: 3600 }
		});
	db.prepare('INSERT INTO presets (id, org_id, slug, version, config, created_at) VALUES (?,?,?,?,?,?)').run(
		randomUUID(),
		orgId,
		'murah-cepat',
		2,
		presetConfig(['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'meta/llama-4-scout']),
		dayIso(5)
	);
	db.prepare('INSERT INTO presets (id, org_id, slug, version, config, created_at) VALUES (?,?,?,?,?,?)').run(
		randomUUID(),
		orgId,
		'murah-cepat',
		1,
		presetConfig(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']),
		dayIso(12)
	);

	// Replay selesai: dipakai halaman Replay Lab sebagai riwayat.
	const ringkasanCount = usageIds.filter((u) => u.tag === 'ringkasan').length;
	const result = {
		tag: 'ringkasan',
		sampleSize: 50,
		baseline: { model: 'openai/gpt-4o', avgCostMicros: 118_400, avgLatencyMs: 2_140, samples: 50 },
		candidates: [
			{
				model: 'google/gemini-2.5-flash',
				samples: 50,
				avgCostMicros: 24_600,
				avgLatencyMs: 960,
				avgOutputTokens: 268,
				autoPass: 1,
				judgeScore: 0.47,
				winRate: 0.44
			},
			{
				model: 'anthropic/claude-haiku-4-5',
				samples: 50,
				avgCostMicros: 61_200,
				avgLatencyMs: 740,
				avgOutputTokens: 302,
				autoPass: 0.98,
				judgeScore: 0.53,
				winRate: 0.56
			}
		],
		summary: {
			monthlySavingMicros: Math.round((118_400 - 24_600) * ringkasanCount),
			savingPct: 79.2,
			qualityDelta: -0.03,
			lowSample: false,
			recommended: 'google/gemini-2.5-flash'
		},
		pairs: [
			{
				requestId: logSeeds[0]?.request_id ?? 'req_demo1',
				prompt: PROMPTS.ringkasan,
				originalModel: 'openai/gpt-4o',
				original: RESPONSES.ringkasan,
				candidateModel: 'google/gemini-2.5-flash',
				candidate: CANDIDATE_TEXT.ringkasan
			},
			{
				requestId: logSeeds[1]?.request_id ?? 'req_demo2',
				prompt: 'Ringkas thread email negosiasi vendor menjadi 3 poin.',
				originalModel: 'openai/gpt-4o',
				original: '1. Harga disepakati 187,5 juta termasuk PPN.\n2. Pembayaran 40% di muka, sisanya 30 hari.\n3. Kontrak dikirim Senin depan.',
				candidateModel: 'google/gemini-2.5-flash',
				candidate: 'Harga final 187,5 juta (termasuk PPN). DP 40%, pelunasan 30 hari. Kontrak dikirim Senin.'
			},
			{
				requestId: logSeeds[2]?.request_id ?? 'req_demo3',
				prompt: 'Ringkas laporan insiden 14 November untuk manajemen.',
				originalModel: 'openai/gpt-4o',
				original: 'Gateway gagal 22 menit karena key provider mencapai rate limit. Fallback mengalihkan 84% trafik ke provider kedua. Tidak ada data hilang. Tindakan: tambah key dan alert pada 80% kuota.',
				candidateModel: 'google/gemini-2.5-flash',
				candidate: 'Insiden 22 menit akibat rate limit key provider. 84% trafik dialihkan via fallback, tanpa kehilangan data. Tindakan: tambah key, alert 80% kuota.'
			}
		]
	};
	db.prepare(
		'INSERT INTO replay_runs (id, org_id, tag, sample_size, candidates, budget_micros, spent_micros, status, result, created_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
	).run(
		randomUUID(),
		orgId,
		'ringkasan',
		50,
		JSON.stringify(['google/gemini-2.5-flash', 'anthropic/claude-haiku-4-5']),
		150_000 * MICRO,
		1_900 * MICRO,
		'done',
		JSON.stringify(result),
		dayIso(4),
		dayIso(4)
	);

	const ticketId = randomUUID();
	db.prepare('INSERT INTO tickets (id, org_id, subject, status, priority, assignee, sla_due, request_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
		ticketId,
		orgId,
		'Timeout berulang di model claude-sonnet-4-5',
		'open',
		'high',
		'support@anyllm.id',
		new Date(now + 6 * 3600_000).toISOString(),
		failedRequestId || null,
		dayIso(1)
	);
	db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,?,?)').run(
		ticketId,
		'dita@kanaya.studio',
		'Sejak kemarin sekitar 2% request chat-support gagal timeout. Saldo tetap terpotong untuk sebagian request. Mohon dicek.',
		0,
		dayIso(1)
	);
	db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,?,?)').run(
		ticketId,
		'support@anyllm.id',
		'Kami menemukan retry yang tidak selesai di sisi provider. Kredit kompensasi Rp12.000 sudah dikirim. Pantau 24 jam ke depan.',
		0,
		iso(0, 2)
	);

	const ticket2 = randomUUID();
	db.prepare('INSERT INTO tickets (id, org_id, subject, status, priority, assignee, sla_due, request_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
		ticket2,
		orgId,
		'Invoice top up belum masuk ke email',
		'resolved',
		'normal',
		'finance@anyllm.id',
		dayIso(2),
		null,
		dayIso(3)
	);
	db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,?,?)').run(
		ticket2,
		'dita@kanaya.studio',
		'Top up Rp1.000.000 tanggal 6 sudah masuk saldo, tapi invoice belum diterima.',
		0,
		dayIso(3)
	);
	db.prepare('INSERT INTO ticket_messages (ticket_id, author, body, internal, created_at) VALUES (?,?,?,?,?)').run(
		ticket2,
		'finance@anyllm.id',
		'Invoice INV-2026-0412 sudah dikirim ulang. Ternyata domain email perusahaan menolak lampiran.',
		0,
		dayIso(2)
	);

	const insAudit = db.prepare('INSERT INTO audit_log (actor_email, role, action, target, reason, meta, created_at) VALUES (?,?,?,?,?,?,?)');
	insAudit.run('admin@anyllm.id', 'admin', 'price.update', 'openai/gpt-4o', 'Sinkronisasi harga provider November', '{"input":40750000000,"output":163000000000}', dayIso(11));
	insAudit.run('finance@anyllm.id', 'finance', 'balance.adjust', 'kanaya', 'Kompensasi timeout provider (tiket klaim)', '{"amount_micros":12000000000}', dayIso(1));
	insAudit.run('admin@anyllm.id', 'admin', 'model.disable', 'deepseek/deepseek-chat', 'Uji kill switch provider generik', null, dayIso(6));

	db.prepare('INSERT INTO price_history (model, field, old_value, new_value, actor, reason, created_at) VALUES (?,?,?,?,?,?,?)').run(
		'openai/gpt-4o',
		'input_micros',
		39_000 * MICRO,
		40_750 * MICRO,
		'admin@anyllm.id',
		'Penyesuaian kurs USD/IDR',
		dayIso(11)
	);

	db.prepare('INSERT INTO promos (code, type, value, min_topup_micros, max_redemptions, redeemed, expires_at, active) VALUES (?,?,?,?,?,?,?,?)').run(
		'HEMAT20',
		'percent',
		20,
		100_000 * MICRO,
		200,
		14,
		new Date(now + 20 * 86_400_000).toISOString(),
		1
	);
	db.prepare('INSERT INTO promos (code, type, value, min_topup_micros, max_redemptions, redeemed, expires_at, active) VALUES (?,?,?,?,?,?,?,?)').run(
		'BONUS50K',
		'credit',
		50_000 * MICRO,
		250_000 * MICRO,
		100,
		38,
		new Date(now + 45 * 86_400_000).toISOString(),
		1
	);

	const insPk = db.prepare('INSERT INTO provider_keys (id, provider, label, status, balance_note, verified_at, created_at) VALUES (?,?,?,?,?,?,?)');
	insPk.run(randomUUID(), 'openai', 'platform-1', 'active', 'Saldo diperkirakan $180', dayIso(2), iso(90));
	insPk.run(randomUUID(), 'anthropic', 'platform-1', 'active', 'Saldo diperkirakan $95', dayIso(2), iso(90));
	insPk.run(randomUUID(), 'google', 'platform-1', 'degraded', 'Kuota 78% terpakai', dayIso(7), iso(60));

	db.prepare('INSERT INTO data_policies (provider, retention, trains_on_data, zdr_available, verified_at) VALUES (?,?,?,?,?)').run('openai', '30 hari lalu dihapus', 0, 1, dayIso(20));
	db.prepare('INSERT INTO data_policies (provider, retention, trains_on_data, zdr_available, verified_at) VALUES (?,?,?,?,?)').run('anthropic', '30 hari lalu dihapus', 0, 1, dayIso(20));
	db.prepare('INSERT INTO data_policies (provider, retention, trains_on_data, zdr_available, verified_at) VALUES (?,?,?,?,?)').run('google', 'belum diverifikasi', 0, 0, null);

	db.prepare('INSERT INTO announcements (body, level, active, created_at) VALUES (?,?,?,?)').run(
		'Katalog harga disinkronkan setiap Senin 06.00 WIB. Perubahan harga modal di atas 5% menunggu persetujuan admin.',
		'info',
		1,
		dayIso(6)
	);
	db.prepare('INSERT INTO notifications (org_id, kind, body, read, created_at) VALUES (?,?,?,?,?)').run(
		orgId,
		'replay_done',
		'Replay tag ringkasan selesai: hemat 79% dengan Gemini 2.5 Flash.',
		0,
		dayIso(4)
	);
	db.prepare('INSERT INTO webhooks (id, org_id, url, secret, events, active, created_at) VALUES (?,?,?,?,?,?,?)').run(
		randomUUID(),
		orgId,
		'https://kanaya.studio/hooks/anyllm',
		'whsec_demo_secret',
		'balance.low,replay.done,key.blocked',
		1,
		dayIso(20)
	);
}
