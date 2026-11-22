export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type Message = {
	role: Role;
	content: string | Array<{ type: string; text?: string; [k: string]: unknown }>;
	name?: string;
	tool_call_id?: string;
};

export type ChatRequest = {
	model: string;
	messages: Message[];
	stream?: boolean;
	max_tokens?: number;
	temperature?: number;
	tools?: unknown[];
	tool_choice?: unknown;
	response_format?: unknown;
	user?: string;
	/** Preferensi routing per request (bagian 7). */
	models?: string[];
	provider?: {
		sort?: 'price' | 'latency' | 'throughput';
		max_price?: number;
		allow_fallbacks?: boolean;
		only?: string[];
		ignore?: string[];
		zdr?: boolean;
		data_collection?: 'allow' | 'deny';
	};
};

export type Usage = {
	prompt_tokens: number;
	completion_tokens: number;
	cached_tokens?: number;
};

export type ChatResult = {
	text: string;
	usage: Usage;
	finish_reason: string;
	tool_calls?: unknown[];
	provider_request_id?: string;
};

export type StreamDelta = {
	delta?: string;
	usage?: Usage;
	finish_reason?: string;
};

export interface ProviderAdapter {
	id: string;
	/** true bila memanggil provider sungguhan; false untuk mock. */
	live: boolean;
	complete(model: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
	stream?(model: string, req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamDelta>;
	embeddings?(model: string, input: string[]): Promise<{ vectors: number[][]; usage: Usage }>;
}

export type PriceRow = {
	id: string;
	provider: string;
	input_micros: number;
	output_micros: number;
	cached_micros: number;
	markup_pct: number;
	enabled: number;
	visible: number;
	context: number;
};

export type ModelTarget = {
	model: string;
	provider: string;
	price: PriceRow;
	reason: 'explicit' | 'alias' | 'rule' | 'preset' | 'fallback' | 'default';
};
