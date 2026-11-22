import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const db = getDb();
	const rows = db
		.prepare('SELECT * FROM models WHERE visible = 1 AND enabled = 1 ORDER BY sort')
		.all() as unknown as {
		id: string;
		provider: string;
		label: string;
		context: number;
		input_micros: number;
		output_micros: number;
		cached_micros: number;
		markup_pct: number;
	}[];

	const models = rows.map((m) => ({
		id: m.id,
		provider: m.provider,
		label: m.label,
		context: m.context,
		input: Math.round(m.input_micros * (1 + m.markup_pct / 100)),
		output: Math.round(m.output_micros * (1 + m.markup_pct / 100)),
		cached: Math.round(m.cached_micros * (1 + m.markup_pct / 100)),
		markup: m.markup_pct
	}));

	const modelId = url.searchParams.get('model') ?? models[0]?.id ?? '';
	const chosen = models.find((m) => m.id === modelId) ?? models[0];
	const perDay = Math.max(0, Number(url.searchParams.get('requests') ?? 200));
	const tokensIn = Math.max(0, Number(url.searchParams.get('in') ?? 900));
	const tokensOut = Math.max(0, Number(url.searchParams.get('out') ?? 300));

	const monthlyMicros = chosen
		? Math.round(perDay * 30 * ((tokensIn * chosen.input + tokensOut * chosen.output) / 1_000_000))
		: 0;

	const cheapest = [...models].sort((a, b) => a.input + a.output - (b.input + b.output))[0] ?? null;
	const cheapestMicros = cheapest
		? Math.round(perDay * 30 * ((tokensIn * cheapest.input + tokensOut * cheapest.output) / 1_000_000))
		: 0;

	return {
		models,
		calc: { modelId, perDay, tokensIn, tokensOut, monthlyMicros, cheapest: cheapest?.id ?? null, cheapestMicros }
	};
};
