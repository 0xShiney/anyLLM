# anyLLM

Gateway LLM terpadu: satu endpoint kompatibel OpenAI untuk banyak provider, saldo prabayar dalam rupiah, dashboard biaya, dan **Replay Lab** — menjalankan ulang request yang sudah tercatat pada model kandidat untuk mengukur hemat, latency, dan kualitas sebelum trafik dipindahkan.

Spesifikasi produk lengkap: lihat `DESIGN.md` (sistem visual) dan `docs/`.

## Menjalankan

```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000
```

Database SQLite dibuat otomatis di `apps/web/data/anyllm.db` dan diisi data demo (30 hari usage, 1.371 request, tag, aturan routing, tiket, ledger).

Akun demo (password `demo1234`):

| Email | Peran |
| --- | --- |
| `dita@kanaya.studio` | owner workspace (dashboard pelanggan) |
| `arif@kanaya.studio` | developer |
| `admin@anyllm.id` | admin platform (`/admin`) |
| `finance@anyllm.id` | finance platform |
| `support@anyllm.id` | support platform |

Kunci API demo untuk gateway: `sk-any-7f3a9c21e4b8` (prefix `sk-any-7f3a`).

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-any-7f3a9c21e4b8" \
  -H "Content-Type: application/json" \
  -H "X-Tag: ringkasan" \
  -d '{"model":"auto-murah","messages":[{"role":"user","content":"Halo"}]}'
```

Tanpa kunci provider di env, gateway memakai adapter mock: respons deterministik, usage sintetis, dan header `x-anyllm-simulated: true`. Isi `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, atau `GEMINI_API_KEY` untuk memakai provider sungguhan.

## Perintah

```bash
npm run build     # build produksi (adapter-node)
npm start         # jalankan hasil build
npm run check     # svelte-check (0 error)
npm test          # 20 test engine: pricing, ledger, limiter, router, SSE, replay, idempotency
```

## Arsitektur

```
apps/web                     SvelteKit 5 (runes) + Tailwind 4 + adapter-node
  src/routes/v1/*            gateway kompatibel OpenAI (chat, embeddings, models)
  src/routes/(app)/*         dashboard pelanggan
  src/routes/(admin)/*       panel admin (RBAC staf)
  src/lib/server/engine/*    domain gateway, tanpa dependensi UI
    adapters.ts              OpenAI / Anthropic / Gemini / generik / mock
    router.ts                alias, aturan tag, fallback, circuit breaker
    ledger.ts                hold & settle atomik, ledger append-only
    pricing.ts               biaya dari tabel harga, bilangan bulat mikro-IDR
    limiter.ts               token bucket + response cache exact-match
    replay.ts                estimator, runner replay, penilai pairwise
    idempotency.ts           Idempotency-Key per API key: simpan & putar ulang respons
    gateway.ts               orkestrasi autentikasi, budget, metering, streaming
  src/lib/server/db/*        skema SQLite + seed demo
db/migrations/0001_init.sql  skema target PostgreSQL (partisi bulanan usage)
DESIGN.md                    token, tipografi, komponen, nada bahasa
docs/                        decisions, open-questions, design-gaps, runbook
```

Uang disimpan sebagai bilangan bulat mikro-IDR (1 IDR = 1.000.000). Biaya request memakai harga yang berlaku saat request; hold dihitung dari `max_tokens` dan dilepas saat settle, sehingga saldo tidak pernah negatif walau request paralel.

## Fitur yang berjalan

- Gateway: `POST /v1/chat/completions` (streaming SSE + non-streaming), `POST /v1/embeddings`, `GET /v1/models`, `X-Tag`, `X-Request-Id`, `Idempotency-Key` (TTL 24 jam; retry dibalas ulang dan hanya ditagih sekali), usage per request, fallback + circuit breaker, rate limit per key, budget harian/bulanan, cache exact-match, saldo hold/settle, log opt-in terenkripsi AES-GCM.
- Dashboard: ringkasan biaya & latency, API keys (buat/blokir, budget, RPM), katalog model, log dengan filter + detail + laporan tiket, **Replay Lab** (estimator → replay dengan budget keras → perbandingan + diff → terapkan sebagai aturan), routing rules dengan versi & rollback, presets, playground 2–3 model, billing (top up, promo, ledger, invoice), workspace & undangan, tiket, pengaturan privasi/ZDR/webhook/ekspor data.
- Admin: ops (error rate, latency, kesehatan provider, kunci platform), katalog & harga dengan riwayat + kill switch, customer (koreksi saldo, blokir key, lihat sebagai dengan alasan), finance (refund kandidat, margin per model, ledger platform), promo, tiket dengan catatan internal dan kredit kompensasi, audit log read-only.

## Yang belum dikerjakan (jujur)

- **Gateway Go + Bifrost** belum ada; v1 berjalan di Node. Alasan dan batasnya: `docs/decisions.md` D1.
- **Postgres**: runtime memakai `node:sqlite`; skema Postgres tersedia tapi belum ada adapter `pg`. Multi-instance belum aman (rate limit & cache di memori).
- **Better Auth / Google OAuth / JWKS** diganti sesi + scrypt milik sendiri (D3). 2FA belum diimplementasikan.
- **Pembayaran nyata** (Xendit/Midtrans/Stripe) belum: hanya `SimulatedProvider` dengan antarmuka yang sama (D4).
- **Email transaksional** belum ada; notifikasi masuk tabel `notifications` dan webhook HMAC (D9). Webhook hanya satu percobaan tanpa retry.
- **Penilai LLM** pada Replay Lab memakai heuristik cakupan istilah, bukan model juri, karena butuh kunci provider nyata.
- Respons API: Anthropic Messages API, Responses API, tool calling penuh, structured output, input gambar/PDF/audio.
- Halaman legal (ToS, Privasi, AUP, DPA), invoice PDF/PPN, 2FA, i18n dua bahasa, semantic cache, request cache per parameter, alert eksternal (Sentry/Prometheus).

Rincian keputusan: `docs/decisions.md`. Pertanyaan yang butuh konfirmasi manusia: `docs/open-questions.md`.
