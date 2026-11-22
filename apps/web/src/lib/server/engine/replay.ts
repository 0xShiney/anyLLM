import type { DatabaseSync } from 'node:sqlite';
import { decryptFor } from './crypto';
import { computeCost } from './pricing';
import { adapterFor } from './adapters';

export type CandidateStats = {
	model: string;
	samples: number;
	avgCostMicros: number;
	avgLatencyMs: number;
	avgOutputTokens: number;
	autoPass: number;
	judgeScore: number;
	winRate: number;
	winRateLower: number;
};

export type ReplayPair = {
	requestId: string;
	prompt: string;
	originalModel: string;
	original: string;
	candidateModel: string;
	candidate: string;
};

export type ReplayResult = {
	tag: string;
	sampleSize: number;
	baseline: { model: string; avgCostMicros: number; avgLatencyMs: number; samples: number };
	candidates: CandidateStats[];
	summary: {
		monthlySavingMicros: number;
		savingPct: number;
		qualityDelta: number;
		lowSample: boolean;
		recommended: string | null;
	};
	pairs: ReplayPair[];
	budgetMicros: number;
	spentMicros: number;
	simulated: boolean;
};

type ModelPrice = { id: string; provider: string; input_micros: number; output_micros: number; cached_micros: number; markup_pct: number };

function prices(db: DatabaseSync): Map<string, ModelPrice> {
	const rows = db.prepare('SELECT * FROM models').all() as unknown as ModelPrice[];
	return new Map(rows.map((r) => [r.id, r]));
}

/** Estimator tanpa memanggil provider: token historis x harga kandidat saat ini. */
export function estimateSavings(db: DatabaseSync, orgId: string, tag: string, days = 30) {
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const rows = db
		.prepare(
			`SELECT model, COUNT(*) AS n, SUM(prompt_tokens) AS pt, SUM(completion_tokens) AS ct, SUM(billed_micros) AS billed
			 FROM usage WHERE org_id = ? AND tag = ? AND status = 'ok' AND created_at > ? GROUP BY model ORDER BY n DESC`
		)
		.all(orgId, tag, since) as unknown as { model: string; n: number; pt: number; ct: number; billed: number }[];

	const p = prices(db);
	const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
	const totalPt = rows.reduce((s, r) => s + r.pt, 0);
	const totalCt = rows.reduce((s, r) => s + r.ct, 0);
	const requests = rows.reduce((s, r) => s + r.n, 0);

	const candidates = [...p.values()]
		.filter((m) => m.id !== rows[0]?.model)
		.map((m) => {
			const cost = computeCost(m, { prompt_tokens: totalPt, completion_tokens: totalCt });
			return {
				model: m.id,
				label: m.id,
				monthlyCostMicros: cost.costMicros,
				savingMicros: Math.max(0, totalBilled - cost.costMicros),
				savingPct: totalBilled > 0 ? ((totalBilled - cost.costMicros) / totalBilled) * 100 : 0
			};
		})
		.sort((a, b) => a.monthlyCostMicros - b.monthlyCostMicros);

	return {
		tag,
		requests,
		days,
		currentCostMicros: totalBilled,
		currentModels: rows.map((r) => ({ model: r.model, requests: r.n, billedMicros: r.billed })),
		candidates
	};
}

/** Batas bawah Wilson 95% untuk proporsi kecil; dipakai agar sampel kecil tidak dilebih-lebihkan. */
export function wilsonLower(wins: number, n: number, z = 1.96): number {
	if (n === 0) return 0;
	const p = wins / n;
	const denom = 1 + (z * z) / n;
	const centre = p + (z * z) / (2 * n);
	const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
	return Math.max(0, (centre - margin) / denom);
}

function words(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length > 3)
	);
}

/** Skor otomatis: format, panjang, dan cakupan istilah dari prompt. */
function autoChecks(prompt: string, original: string, candidate: string) {
	const problems: string[] = [];
	if (!candidate.trim()) problems.push('kosong');
	const wantsJson = /json/i.test(prompt);
	if (wantsJson) {
		try {
			JSON.parse(candidate);
		} catch {
			problems.push('json tidak valid');
		}
	}
	const ratio = candidate.length / Math.max(1, original.length);
	if (ratio < 0.35) problems.push('terlalu pendek');
	if (ratio > 2.2) problems.push('terlalu panjang');
	if (/^(maaf|sorry|saya tidak bisa)/i.test(candidate.trim())) problems.push('menolak');
	return { pass: problems.length === 0, problems, ratio };
}

/** Penilai pairwise dengan urutan A/B diacak. Heuristik cakupan istilah, bukan penilai LLM. */
function judgePair(prompt: string, original: string, candidate: string, flipped: boolean): 'candidate' | 'original' | 'tie' {
	const key = words(prompt);
	const score = (t: string) => {
		const w = words(t);
		let hit = 0;
		for (const k of key) if (w.has(k)) hit++;
		const coverage = key.size ? hit / key.size : 0;
		const brevity = 1 - Math.min(1, Math.abs(t.length - original.length) / Math.max(original.length, 1));
		return coverage * 0.7 + brevity * 0.3;
	};
	const aIsCandidate = flipped;
	const a = flipped ? candidate : original;
	const b = flipped ? original : candidate;
	const diff = score(b) - score(a);
	if (Math.abs(diff) < 0.01) return 'tie';
	const bWins = diff > 0;
	if (aIsCandidate === bWins) return 'original';
	return 'candidate';
}

export async function runReplay(
	db: DatabaseSync,
	opts: {
		orgId: string;
		tag: string;
		sampleSize: number;
		candidates: string[];
		budgetMicros: number;
		concurrency?: number;
	}
): Promise<ReplayResult> {
	const budget = Math.min(50, Math.max(1, opts.sampleSize));
	const p = prices(db);
	const logs = db
		.prepare(
			`SELECT l.* FROM prompt_logs l JOIN projects pr ON pr.id = l.project_id
			 WHERE pr.org_id = ? AND l.tag = ?
			 ORDER BY l.created_at DESC LIMIT ?`
		)
		.all(opts.orgId, opts.tag, budget) as unknown as { project_id: string; request_id: string; model: string; payload_enc: string }[];

	if (logs.length === 0)
		throw Object.assign(new Error(`Belum ada log untuk tag "${opts.tag}". Aktifkan logging di Pengaturan.`), {
			code: 'no_logs'
		});

	const samples = logs.map((l) => {
		const payload = JSON.parse(decryptFor(l.project_id, l.payload_enc)) as { prompt: string; response: string };
		return { requestId: l.request_id, model: l.model, prompt: payload.prompt, original: payload.response };
	});

	let spent = 0;
	const pairs: ReplayPair[] = [];
	const perCandidate = new Map<
		string,
		{ costs: number[]; latencies: number[]; outs: number[]; autoPass: number; wins: number; scored: number }
	>();
	for (const c of opts.candidates) perCandidate.set(c, { costs: [], latencies: [], outs: [], autoPass: 0, wins: 0, scored: 0 });

	const tasks: { candidate: string; sample: (typeof samples)[number]; index: number }[] = [];
	opts.candidates.forEach((c) => samples.forEach((s, i) => tasks.push({ candidate: c, sample: s, index: i })));

	const concurrency = opts.concurrency ?? 4;
	const runTask = async (t: (typeof tasks)[number]) => {
		const price = p.get(t.candidate);
		if (!price) return;
		const estimated = computeCost(price, { prompt_tokens: Math.ceil(t.sample.prompt.length / 4), completion_tokens: 512 });
		if (spent + estimated.costMicros > opts.budgetMicros) return;
		const started = Date.now();
		try {
			const adapter = adapterFor(price.provider, t.candidate);
			const res = await adapter.complete(t.candidate, {
				model: t.candidate,
				messages: [{ role: 'user', content: t.sample.prompt }],
				max_tokens: 512
			});
			const latency = Date.now() - started;
			const cost = computeCost(price, res.usage).costMicros;
			spent += cost;
			const stats = perCandidate.get(t.candidate)!;
			stats.costs.push(cost);
			stats.latencies.push(latency);
			stats.outs.push(res.usage.completion_tokens);
			const check = autoChecks(t.sample.prompt, t.sample.original, res.text);
			if (check.pass) stats.autoPass += 1;
			const verdict = judgePair(t.sample.prompt, t.sample.original, res.text, t.index % 2 === 0);
			stats.scored += 1;
			if (verdict === 'candidate') stats.wins += 1;
			else if (verdict === 'tie') stats.wins += 0.5;
			if (pairs.length < 8 && t.index < 8) {
				pairs.push({
					requestId: t.sample.requestId,
					prompt: t.sample.prompt,
					originalModel: t.sample.model,
					original: t.sample.original,
					candidateModel: t.candidate,
					candidate: res.text
				});
			}
		} catch {
			// Kegagalan satu sampel tidak membatalkan run; dihitung lewat jumlah samples.
		}
	};

	for (let i = 0; i < tasks.length; i += concurrency) {
		await Promise.all(tasks.slice(i, i + concurrency).map(runTask));
	}

	const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	const baselineTokens = samples.reduce((s, x) => s + Math.ceil(x.original.length / 4), 0);
	const baselineLatency = (
		db
			.prepare(
				`SELECT AVG(latency_ms) AS a FROM usage WHERE org_id = ? AND model = ? AND status = 'ok' AND created_at > ?`
			)
			.get(opts.orgId, samples[0].model, new Date(Date.now() - 30 * 86_400_000).toISOString()) as { a: number | null }
	).a ?? 0;
	const monthlyRequests = (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM usage WHERE org_id = ? AND tag = ? AND status = 'ok' AND created_at > ?`
			)
			.get(opts.orgId, opts.tag, new Date(Date.now() - 30 * 86_400_000).toISOString()) as { n: number }
	).n;

	const candidates: CandidateStats[] = [];
	for (const [model, s] of perCandidate) {
		const price = p.get(model);
		if (!price || s.costs.length === 0) continue;
		const avgCostMicros = Math.round(avg(s.costs));
		const winRate = s.scored ? s.wins / s.scored : 0;
		candidates.push({
			model,
			samples: s.costs.length,
			avgCostMicros,
			avgLatencyMs: Math.round(avg(s.latencies)),
			avgOutputTokens: Math.round(avg(s.outs)),
			autoPass: s.scored ? s.autoPass / s.scored : 0,
			judgeScore: winRate,
			winRate,
			winRateLower: wilsonLower(s.wins, s.scored)
		});
	}

	const baselinePrice = p.get(samples[0].model);
	const baselineAvgCost = baselinePrice
		? computeCost(baselinePrice, { prompt_tokens: Math.ceil(baselineTokens / samples.length), completion_tokens: 300 }).costMicros
		: 0;

	candidates.sort((a, b) => a.avgCostMicros - b.avgCostMicros);
	const best = candidates.find((c) => c.winRateLower >= 0.4) ?? candidates[0] ?? null;
	const savingPerReq = best ? Math.max(0, baselineAvgCost - best.avgCostMicros) : 0;

	const result: ReplayResult = {
		tag: opts.tag,
		sampleSize: samples.length,
		baseline: {
			model: samples[0].model,
			avgCostMicros: baselineAvgCost,
			avgLatencyMs: Math.round(baselineLatency),
			samples: samples.length
		},
		candidates,
		summary: {
			monthlySavingMicros: savingPerReq * monthlyRequests,
			savingPct: baselineAvgCost ? (savingPerReq / baselineAvgCost) * 100 : 0,
			qualityDelta: best ? best.winRate - 0.5 : 0,
			lowSample: samples.length < 30,
			recommended: best?.model ?? null
		},
		pairs,
		budgetMicros: opts.budgetMicros,
		spentMicros: spent,
		simulated: !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY
	};
	return result;
}
