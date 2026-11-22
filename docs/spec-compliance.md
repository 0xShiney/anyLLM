# Status implementasi terhadap spesifikasi

Diperbarui 22 November 2026. Audit ini memeriksa ulang kode, bukan hanya catatan: setiap baris "ada" merujuk pada berkas yang menjalankannya.

Catatan: dokumen spesifikasi asli tidak tersimpan di repo. Daftar kebutuhan di bawah adalah inventaris yang dipakai saat implementasi (tercatat di `README.md` dan `docs/decisions.md`); nomor bagian spesifikasi tidak dikutip ulang. Bila dokumen asli dilampirkan lagi, audit bisa dicocokkan baris per baris.

## Terimplementasi dan berjalan

| Kebutuhan | Bukti |
| --- | --- |
| Gateway kompatibel OpenAI: `POST /v1/chat/completions` (non-stream + SSE), `POST /v1/embeddings`, `GET /v1/models` | `apps/web/src/routes/v1/**` |
| Saldo prabayar bilangan bulat mikro-IDR, hold → settle, ledger append-only, saldo tidak pernah negatif | `engine/ledger.ts`, tes `hold mencegah saldo negatif` + `settle tidak pernah membuat saldo negatif` |
| Hold aman untuk request paralel (balapan billing) | `engine/idempotency.test.ts` → `balapan billing: hold paralel tidak pernah melebihi saldo` (6 request paralel, saldo cukup untuk 1 hold → 1 sukses, 5 ditolak 402, 1 debit, saldo ≥ 0) |
| `Idempotency-Key` pada kedua endpoint tulis: per API key, TTL 24 jam, retry dibalas tanpa tagihan kedua, 409 untuk body berbeda / request yang masih berjalan | `engine/idempotency.ts`, `routes/v1/chat/completions/+server.ts`, `routes/v1/embeddings/+server.ts`, 8 tes idempotensi |
| Routing: alias `auto-murah`/`auto-cepat`, model eksplisit, preset, aturan per `X-Tag`, fallback, circuit breaker, preferensi provider (`sort`, `max_price`, `only`, `ignore`, `allow_fallbacks`) | `engine/router.ts`, tes router |
| Metering per request: token, biaya, markup, latency, status, `simulated`, tag, header biaya | `engine/gateway.ts`, `engine/pricing.ts` |
| Budget harian/bulanan per key, rate limit RPM, 429 + `Retry-After`, 402 saldo kurang | `gateway.ts` (`budgetExceeded`), `engine/limiter.ts`, route |
| Retry/fallback hanya menagih percobaan yang menghasilkan output | `gateway.ts` (settle di percobaan sukses; `release` bila semua gagal), stream finalize di `finally` |
| Logging prompt opt-in, terenkripsi AES-256-GCM + HKDF per project, retensi + purge, ZDR mematikan log/cache/Replay | `engine/crypto.ts`, `gateway.ts`, `queries.ts` (`purgeExpiredLogs`), pengaturan project |
| Replay Lab: estimator tanpa panggilan provider, replay dengan budget keras + konkurensi, perbandingan biaya/latency, skor kualitas + Wilson, diff, terapkan sebagai aturan routing berversi + rollback | `engine/replay.ts`, `routes/(app)/dashboard/replay/**`, `routing/**` |
| Dashboard pelanggan: ringkasan, API keys, katalog model, log + ekspor CSV, Replay Lab, routing, preset, playground, billing (top up, promo, ledger, invoice), tim, pengaturan + ekspor JSON, tiket | `apps/web/src/routes/(app)/**` |
| Admin platform: ops, katalog & harga + riwayat + kill switch, customer (koreksi saldo, blokir key, lihat sebagai), finance (refund, margin), promo, tiket + catatan internal, audit read-only | `apps/web/src/routes/(admin)/**` |
| RBAC staf, sesi HttpOnly + scrypt, audit log append-only | `server/auth.ts`, `server/password.ts`, `server/audit.ts`, `hooks.server.ts` |
| Pembayaran simulasi di balik antarmuka `PaymentProvider` + invoice idempoten | `server/payments.ts`, `dashboard/billing/+page.server.ts` |
| Webhook keluar bertanda tangan HMAC-SHA256 + notifikasi in-app | `server/webhooks.ts`, `server/queries.ts` |
| Skema target PostgreSQL (uang `bigint`, `usage` terpartisi, `jsonb`) termasuk tabel idempotensi | `db/migrations/0001_init.sql`, `apps/web/src/lib/server/db/schema.ts` |
| Sistem visual DESIGN.md: tanpa gradien/emoji, aksen tunggal, serif display, angka mono, radius 3px | `DESIGN.md`, `apps/web/src/app.css`, komponen |
| Keputusan, celah desain, pertanyaan terbuka dicatat | `docs/decisions.md`, `docs/design-gaps.md`, `docs/open-questions.md` |

## Terimplementasi dengan batas yang disengaja

| Kebutuhan | Status | Alasan / batas |
| --- | --- | --- |
| Gateway Go + `pgx` + Bifrost | Diganti TypeScript di server SvelteKit | Tidak ada toolchain Go/Postgres/Docker di lingkungan build; batas modul sama (`ProviderAdapter`, `Ledger`, `Router`, `RateLimiter`, `ReplayEngine`). D1 |
| Postgres sebagai runtime | SQLite `node:sqlite`; skema Postgres siap | Belum ada adapter `pg`; satu instance. D2 |
| Rate limit / cache / idempotensi terdistribusi | In-memory + SQLite proses ini | Multi-instance butuh Redis/Postgres; antarmuka dan skema sudah disiapkan. D7, D14 |
| Penilai kualitas Replay Lab oleh LLM | Heuristik cakupan istilah + Wilson | Butuh kunci provider berbayar untuk model juri. D12 |
| Harga model resmi | Data demo `source='demo'` | Spesifikasi melarang harga dari ingatan; sinkronisasi hanya mengusulkan ke `price_history`. D5 |
| Provider nyata | Adapter siap; mode mock deterministik tanpa env | Respons mock selalu ditandai `simulated`/`x-anyllm-simulated`. D6 |
| Pembayaran Xendit/Midtrans | `SimulatedProvider` dengan bentuk API yang sama | Tidak ada akun/kunci. D4 |
| Email transaksional | Ditunda; notifikasi + webhook | Provider belum dipilih, domain belum terverifikasi. D9 |

## Belum diimplementasikan

- Better Auth / Google OAuth / JWKS dan 2FA (D3).
- Endpoint masuk Anthropic Messages API dan OpenAI Responses API; tool calling penuh, structured output, input gambar/PDF/audio.
- Halaman legal (ToS, Privasi, AUP, DPA), invoice PDF/PPN.
- i18n dua bahasa, semantic cache, cache per parameter, alert eksternal (Sentry/Prometheus), webhook retry.
- Sinkronisasi harga otomatis dari dokumentasi provider dan pengisian `verified_at` produksi.

## Cara memverifikasi ulang

```bash
cd apps/web
npm test        # 20 tes: pricing, ledger, limiter, router, SSE, replay, idempotensi, balapan billing
npm run check   # svelte-check
npm run build   # build adapter-node
```

Bukti HTTP untuk idempotensi (server pada port 3000, database demo):

```bash
KEY=sk-any-7f3a9c21e4b8
BODY='{"model":"auto-murah","messages":[{"role":"user","content":"halo"}],"max_tokens":32}'
curl -s -o /tmp/a -D /tmp/ha -X POST localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -H 'Idempotency-Key: uji-1' -d "$BODY"
curl -s -o /tmp/b -D /tmp/hb -X POST localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -H 'Idempotency-Key: uji-1' -d "$BODY"
cmp /tmp/a /tmp/b && grep -i '^idempotency-replayed: true' /tmp/hb
```
