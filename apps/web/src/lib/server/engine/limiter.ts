/** Token bucket per API key. In-memory: cukup untuk satu instance. */
export class RateLimiter {
	private buckets = new Map<string, { tokens: number; last: number }>();

	take(keyId: string, rpm: number | null, now = Date.now()): { ok: boolean; retryAfter: number } {
		const capacity = Math.max(1, rpm ?? 600);
		const refillPerMs = capacity / 60_000;
		const bucket = this.buckets.get(keyId) ?? { tokens: capacity, last: now };
		const tokens = Math.min(capacity, bucket.tokens + (now - bucket.last) * refillPerMs);
		if (tokens < 1) {
			this.buckets.set(keyId, { tokens, last: now });
			return { ok: false, retryAfter: Math.ceil((1 - tokens) / refillPerMs / 1000) };
		}
		this.buckets.set(keyId, { tokens: tokens - 1, last: now });
		return { ok: true, retryAfter: 0 };
	}

	/** Dipakai test agar state tidak bocor antar kasus. */
	reset(): void {
		this.buckets.clear();
	}
}

import { createHash } from 'node:crypto';

/** Cache exact-match per API key. Tidak menyimpan apa pun bila ZDR aktif. */
export class ResponseCache {
	private store = new Map<string, { value: string; expires: number }>();

	constructor(private maxEntries = 500) {}

	key(apiKeyId: string, model: string, body: unknown): string {
		return createHash('sha256').update(`${apiKeyId}:${model}:${JSON.stringify(body)}`).digest('hex');
	}

	get(key: string, now = Date.now()): string | null {
		const hit = this.store.get(key);
		if (!hit) return null;
		if (hit.expires < now) {
			this.store.delete(key);
			return null;
		}
		return hit.value;
	}

	set(key: string, value: string, ttlSeconds: number): void {
		if (this.store.size >= this.maxEntries) {
			const oldest = this.store.keys().next().value;
			if (oldest) this.store.delete(oldest);
		}
		this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
	}

	clear(): void {
		this.store.clear();
	}
}
