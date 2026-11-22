import type { PriceRow, Usage } from './types';

/** Token cache dibaca dengan harga cached; sisanya harga input. */
export function computeCost(price: Pick<PriceRow, 'input_micros' | 'output_micros' | 'cached_micros'>, usage: Usage) {
	const cached = Math.min(usage.cached_tokens ?? 0, usage.prompt_tokens);
	const freshInput = Math.max(0, usage.prompt_tokens - cached);
	const costMicros = Math.round(
		(freshInput * price.input_micros + cached * (price.cached_micros || price.input_micros) + usage.completion_tokens * price.output_micros) /
			1_000_000
	);
	return { costMicros };
}

export function billedMicros(costMicros: number, markupPct: number): number {
	return Math.round(costMicros * (1 + markupPct / 100));
}

/** Estimasi biaya maksimum untuk hold: input aktual + max_tokens keluaran. */
export function estimateMaxCost(price: PriceRow, promptTokens: number, maxTokens: number): number {
	return Math.ceil(
		(promptTokens * price.input_micros + maxTokens * price.output_micros) / 1_000_000
	);
}

/** Estimasi token kasar (dipakai hanya bila provider tidak mengirim usage). */
export function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}
