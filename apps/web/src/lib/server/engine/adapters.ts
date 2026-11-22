import type { ChatRequest, ChatResult, ProviderAdapter, StreamDelta } from './types';
import { estimateTokens } from './pricing';

type OpenedStream = { text: string; usage?: { prompt_tokens: number; completion_tokens: number; cached_tokens?: number } };

function flatten(messages: ChatRequest['messages']): string {
	return messages
		.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join('')))
		.join('\n');
}

/** Membaca SSE dari fetch Response dan mengembalikan tiap blok `data:`. */
export async function* sseEvents(res: Response): AsyncGenerator<string> {
	if (!res.body) return;
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let idx: number;
		while ((idx = buffer.indexOf('\n\n')) !== -1) {
			const block = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			for (const line of block.split('\n')) {
				if (line.startsWith('data:')) yield line.slice(5).trim();
			}
		}
	}
}

async function raise(res: Response, provider: string): Promise<never> {
	const body = await res.text().catch(() => '');
	const err = new Error(`${provider} HTTP ${res.status}: ${body.slice(0, 300)}`) as Error & { status?: number };
	err.status = res.status;
	throw err;
}

function maxTokens(req: ChatRequest): number {
	return Math.min(req.max_tokens ?? 1024, 8192);
}

function usageOf(parsed: unknown, fallbackPrompt: number, text: string) {
	const u = (parsed as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } })
		?.usage;
	return {
		prompt_tokens: u?.prompt_tokens ?? fallbackPrompt,
		completion_tokens: u?.completion_tokens ?? estimateTokens(text),
		cached_tokens: u?.prompt_tokens_details?.cached_tokens ?? 0
	};
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
	readonly live = true;
	constructor(
		readonly id: string,
		private baseUrl: string,
		private apiKey: string
	) {}

	private headers() {
		return { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` };
	}

	async complete(model: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
		const res = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ ...req, model, stream: false, max_tokens: maxTokens(req) }),
			signal
		});
		if (!res.ok) await raise(res, this.id);
		const json = (await res.json()) as {
			choices?: { message?: { content?: string }; finish_reason?: string }[];
			usage?: unknown;
			id?: string;
			model?: string;
		};
		const text = json.choices?.[0]?.message?.content ?? '';
		return {
			text,
			usage: usageOf(json, estimateTokens(flatten(req.messages)), text),
			finish_reason: json.choices?.[0]?.finish_reason ?? 'stop',
			provider_request_id: json.id
		};
	}

	async *stream(model: string, req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamDelta> {
		const res = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ ...req, model, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens(req) }),
			signal
		});
		if (!res.ok) await raise(res, this.id);
		for await (const data of sseEvents(res)) {
			if (data === '[DONE]') return;
			let parsed: { choices?: { delta?: { content?: string }; finish_reason?: string }[]; usage?: unknown };
			try {
				parsed = JSON.parse(data);
			} catch {
				continue;
			}
			const delta = parsed.choices?.[0]?.delta?.content ?? '';
			yield {
				delta,
				usage: parsed.usage ? usageOf(parsed, 0, '') : undefined,
				finish_reason: parsed.choices?.[0]?.finish_reason ?? undefined
			};
		}
	}

	async embeddings(model: string, input: string[]) {
		const res = await fetch(`${this.baseUrl}/embeddings`, {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ model, input })
		});
		if (!res.ok) await raise(res, this.id);
		const json = (await res.json()) as { data: { embedding: number[] }[]; usage?: { prompt_tokens: number } };
		return {
			vectors: json.data.map((d) => d.embedding),
			usage: { prompt_tokens: json.usage?.prompt_tokens ?? estimateTokens(input.join(' ')), completion_tokens: 0 }
		};
	}
}

export class AnthropicAdapter implements ProviderAdapter {
	readonly id = 'anthropic';
	readonly live = true;
	constructor(private apiKey: string) {}

	async complete(model: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
		const system = req.messages
			.filter((m) => m.role === 'system')
			.map((m) => (typeof m.content === 'string' ? m.content : ''))
			.join('\n');
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens(req),
				system: system || undefined,
				messages: req.messages
					.filter((m) => m.role !== 'system')
					.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
			}),
			signal
		});
		if (!res.ok) await raise(res, 'anthropic');
		const json = (await res.json()) as {
			content?: { text?: string }[];
			usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
			stop_reason?: string;
			id?: string;
		};
		const text = (json.content ?? []).map((c) => c.text ?? '').join('');
		return {
			text,
			usage: {
				prompt_tokens: json.usage?.input_tokens ?? estimateTokens(flatten(req.messages)),
				completion_tokens: json.usage?.output_tokens ?? estimateTokens(text),
				cached_tokens: json.usage?.cache_read_input_tokens ?? 0
			},
			finish_reason: json.stop_reason ?? 'stop',
			provider_request_id: json.id
		};
	}
}

export class GeminiAdapter implements ProviderAdapter {
	readonly id = 'google';
	readonly live = true;
	constructor(private apiKey: string) {}

	async complete(model: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents: req.messages
						.filter((m) => m.role !== 'system')
						.map((m) => ({
							role: m.role === 'assistant' ? 'model' : 'user',
							parts: [{ text: typeof m.content === 'string' ? m.content : flatten([m]) }]
						})),
					generationConfig: { maxOutputTokens: maxTokens(req), temperature: req.temperature }
				}),
				signal
			}
		);
		if (!res.ok) await raise(res, 'google');
		const json = (await res.json()) as {
			candidates?: { content?: { parts?: { text?: string }[] } }[];
			usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
		};
		const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
		return {
			text,
			usage: {
				prompt_tokens: json.usageMetadata?.promptTokenCount ?? estimateTokens(flatten(req.messages)),
				completion_tokens: json.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
				cached_tokens: json.usageMetadata?.cachedContentTokenCount ?? 0
			},
			finish_reason: 'stop'
		};
	}
}

/**
 * Mock deterministik: dipakai saat tidak ada kunci provider. Latency dan token
 * disimulasikan, tidak pernah mengklaim sebagai respons nyata.
 */
export class MockAdapter implements ProviderAdapter {
	readonly live = false;
	constructor(
		readonly id = 'mock',
		private latencyMs = 240
	) {}

	private respond(model: string, req: ChatRequest): string {
		const prompt = flatten(req.messages);
		const lower = prompt.toLowerCase();
		if (/json|ekstrak/.test(lower))
			return '{"vendor":"PT Sinar Data","invoice":"INV-2026-0412","total":18750000}';
		if (/kategori|klasifikasi|classify/.test(lower)) return 'billing';
		if (/ringkas|summary|ringkasan/.test(lower))
			return `Ringkasan (${model}):\n- Anggaran Q4 disetujui, batas 1,2 miliar.\n- Migrasi database 3 Desember.\n- Vendor observabilitas dipilih bulan ini.\n\nAction item: kontrak vendor (Dita), migrasi (Arif).`;
		return `Balasan simulasi dari ${model}. Request diterima gateway dan dicatat untuk metering. Isi ini dihasilkan mode mock karena kunci provider belum diisi.`;
	}

	async complete(model: string, req: ChatRequest): Promise<ChatResult> {
		await new Promise((r) => setTimeout(r, this.latencyMs + (model.length % 7) * 30));
		const text = this.respond(model, req);
		return {
			text,
			usage: {
				prompt_tokens: estimateTokens(flatten(req.messages)),
				completion_tokens: estimateTokens(text)
			},
			finish_reason: 'stop'
		};
	}

	async *stream(model: string, req: ChatRequest): AsyncGenerator<StreamDelta> {
		const text = this.respond(model, req);
		const parts = text.match(/[^\s]+\s*/g) ?? [text];
		await new Promise((r) => setTimeout(r, this.latencyMs / 2));
		for (const p of parts) {
			await new Promise((r) => setTimeout(r, 12));
			yield { delta: p };
		}
		yield {
			usage: {
				prompt_tokens: estimateTokens(flatten(req.messages)),
				completion_tokens: estimateTokens(text)
			},
			finish_reason: 'stop'
		};
	}

	async embeddings(_model: string, input: string[]) {
		return {
			vectors: input.map((t) => Array.from({ length: 8 }, (_, i) => Math.sin(estimateTokens(t) + i) / 2)),
			usage: { prompt_tokens: estimateTokens(input.join(' ')), completion_tokens: 0 }
		};
	}
}

/** Pilih adapter berdasarkan provider model dan env yang tersedia. */
export function adapterFor(provider: string, model: string): ProviderAdapter {
	const genericBase = process.env.GENERIC_BASE_URL;
	const genericKey = process.env.GENERIC_API_KEY;
	if (provider === 'openai' && process.env.OPENAI_API_KEY)
		return new OpenAICompatibleAdapter('openai', 'https://api.openai.com/v1', process.env.OPENAI_API_KEY);
	if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return new AnthropicAdapter(process.env.ANTHROPIC_API_KEY);
	if (provider === 'google' && process.env.GEMINI_API_KEY)
		return new GeminiAdapter(process.env.GEMINI_API_KEY);
	if (provider === 'generic' && genericBase && genericKey)
		return new OpenAICompatibleAdapter('generic', genericBase.replace(/\/$/, ''), genericKey);
	return new MockAdapter('mock', model.includes('sonnet') ? 420 : 240);
}
