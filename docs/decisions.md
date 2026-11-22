# Keputusan

Satu paragraf per keputusan. Ditulis saat keputusan diambil, bukan setelah.

## D1 — Gateway ditulis di TypeScript, bukan Go, untuk v1

Spesifikasi meminta gateway Go + `pgx` + Postgres + Bifrost. Lingkungan build ini tidak punya toolchain Go, tidak punya Postgres, dan Docker daemon tidak bisa dipakai, sehingga gateway Go tidak bisa dijalankan, dites, atau ditampilkan sama sekali. Supaya hasilnya bisa diverifikasi, seluruh jalur gateway (`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`) dijalankan di dalam server Node SvelteKit dengan batas modul yang sama seperti rencana Go: `ProviderAdapter`, `Ledger`, `Router`, `RateLimiter`, `ReplayEngine`. Semua I/O lewat `Repo` sehingga pindah ke Go/Postgres adalah penggantian implementasi, bukan penulisan ulang domain. Yang hilang dibanding Go: isolasi proses, streaming tanpa backpressure Node, dan Bifrost. Bifrost tetap rencana untuk v2 karena spike-nya mustahil diverifikasi di sini (keputusan sadar, tercatat di `docs/open-questions.md`).

## D2 — Penyimpanan SQLite (`node:sqlite`), skema disiapkan untuk Postgres

Runtime memakai `node:sqlite` bawaan Node 26 supaya aplikasi bisa jalan tanpa layanan eksternal. Skema ditulis di `db/migrations/0001_init.sql` dalam dialek Postgres (partisi bulanan untuk `usage`, `bigint` untuk uang, `jsonb` untuk metadata) sebagai target produksi, dengan padanan SQLite di `apps/web/src/lib/server/db/schema.ts`. Uang selalu bilangan bulat mikro-IDR, tidak pernah float. Semua akses data lewat `Repo`, jadi VPS produksi cukup mengganti implementasi `Repo` dengan `pg`.

## D3 — Auth sesi sendiri, bukan Better Auth

Better Auth butuh Postgres dan kredensial Google OAuth yang tidak tersedia di sini, sehingga integrasinya tidak bisa diverifikasi dan justru berisiko setengah jalan. v1 memakai sesi cookie HttpOnly bertanda tangan + hash password `scrypt`, dengan tabel `users`, `sessions`, `members` yang sengaja dibuat kompatibel dengan skema Better Auth (email unik, verifikasi email, peran organisasi). Batasnya jelas: satu modul `src/lib/server/auth.ts`, sehingga penggantian ke Better Auth menyentuh satu file. Endpoint JWKS dan verifikasi JWT belum ada karena tidak ada konsumen lintas proses di v1.

## D4 — Pembayaran disimulasikan lewat antarmuka `PaymentProvider`

Xendit/Midtrans butuh akun dan kunci yang tidak ada. Top up memakai `SimulatedProvider` yang membuat entri ledger bertanda `topup` dan invoice, dengan antarmuka `createCharge`/`handleWebhook` (idempoten lewat `idempotency_key`) yang sudah menjadi bentuk yang dipakai Xendit QRIS. Nomor VA/QR palsu ditandai jelas di UI sebagai simulasi. Stripe tidak diimplementasikan.

## D5 — Harga model adalah data demo, bukan klaim harga resmi

Spesifikasi melarang menulis harga dari ingatan. Tabel `models` diisi harga contoh yang ditandai `source = 'demo'` dan UI menampilkan label "harga demo" pada katalog. Sinkronisasi harga (`syncModelPrices`) hanya menulis ke `price_history` sebagai usulan dan tidak menerapkan otomatis, sesuai aturan bagian 6. Harga produksi harus diisi admin dari dokumentasi provider dan tanggal verifikasi dicatat di kolom `verified_at`.

## D6 — Provider nyata opsional, mode mock selalu tersedia

Adapter OpenAI, Anthropic, Gemini, dan generik kompatibel-OpenAI membaca env (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GENERIC_BASE_URL`). Tanpa env, adapter mock menghasilkan respons deterministik dengan usage sintetis dan latensi simulasi, supaya gateway bisa didemokan dan dites tanpa biaya. Mock tidak pernah dipakai diam-diam: respons membawa header `X-Anyllm-Provider: mock` dan log mencatat `simulated = 1`.

## D7 — Rate limit, cache, dan hold saldo di memori proses

Sesuai bagian 3, v1 memakai token bucket in-memory dan saldo di SQLite dengan transaksi `BEGIN IMMEDIATE`. Ini aman untuk satu instance. `Limiter` dan `Cache` adalah antarmuka dengan satu implementasi; saat instance lebih dari satu, ganti dengan Redis tanpa menyentuh router. Batasan ini ditandai `shortcut:` di kode.

## D8 — Chart digambar dengan SVG sendiri

LayerChart/uPlot menambah dependensi dan gaya default yang harus dilawan agar sesuai DESIGN.md. Tiga bentuk chart yang dibutuhkan (garis waktu, batang per model, sparkline) ditulis sebagai komponen SVG ±120 baris total, memakai token warna langsung.

## D9 — Email transaksional ditunda, webhook dipakai sebagai gantinya

Satu provider email (Resend) butuh domain terverifikasi dan kunci API. v1 menulis notifikasi ke tabel `notifications` dan mengirim webhook keluar bertanda tangan HMAC-SHA256. Pemilihan provider email final dicatat sebagai pertanyaan terbuka.

## D10 — Dua bahasa ditunda ke v2

Struktur copy dipusatkan di `src/lib/copy.ts` agar bisa dijadikan kamus i18n, tetapi v1 hanya berbahasa Indonesia. Menerjemahkan seluruh UI tanpa penutur asli untuk memeriksa hasilnya menghasilkan copy yang lebih buruk daripada satu bahasa yang rapi.

## D11 — Logging prompt opt-in, enkripsi per project

Isi prompt/respons hanya disimpan bila `projects.logging_enabled = 1` (default 0). Penyimpanan memakai AES-256-GCM dengan kunci diturunkan dari `LOG_ENCRYPTION_KEY` + id project (HKDF-SHA256), nonce acak per baris, dan AAD berisi id project. Retensi 7/30/90 hari dihapus oleh job `purgeExpiredLogs`. ZDR mematikan logging, cache, dan Replay Lab untuk project tersebut.

## D13 — Data demo disemai saat database kosong

Seed berisi 30 hari usage (1.371 request, 4 tag, 8 model), ledger yang konsisten dengan total tagihan, 60 log prompt terenkripsi, 3 aturan routing, 1 replay selesai, 2 tiket, promo, dan audit log. Semua baris usage ditandai `simulated = 1` dan dashboard menampilkan banner bahwa angkanya simulasi. Hapus `apps/web/data/anyllm.db` untuk mengembalikan keadaan awal. Harga katalog ditandai `source = 'demo'` (D5).

## D12 — Replay Lab memakai sampel berbiaya keras

Replay dibatasi tiga lapis: jumlah sampel (maks 50), budget keras dalam mikro-IDR (dicek sebelum setiap request), dan konkurensi 4. Estimator tidak memanggil provider sama sekali; ia mengalikan token historis dengan harga kandidat saat ini. Skor kualitas memakai cek otomatis + penilai pairwise dengan urutan A/B diacak, dan hasil selalu menyertakan interval kepercayaan kasar (Wilson) serta label "sampel kecil" di bawah 30 pasangan.

## D14 — Idempotency-Key disimpan per API key dengan TTL 24 jam

Kedua endpoint tulis (`POST /v1/chat/completions` dan `POST /v1/embeddings`) menerima header `Idempotency-Key`. Baris disimpan di tabel `idempotency_keys` dengan kunci `(api_key_id, endpoint, idem_key)` dan sidik jari SHA-256 dari body JSON kanonik, jadi urutan field tidak mengubah hasil. Request dengan key dan body yang sama mengembalikan respons tersimpan apa adanya (`Idempotency-Replayed: true`) tanpa hold, debit, panggilan provider, atau konsumsi rate limit. Key yang sama dengan body berbeda ditolak 409 `idempotency_key_reuse`; request yang masih berjalan ditolak 409 `idempotency_in_progress` dengan `Retry-After`. Respons sukses disimpan 24 jam; baris `in_progress` memakai lease 60 detik supaya proses yang mati di tengah tidak mengunci key selamanya. Respons error tidak disimpan — key dilepas agar klien boleh mencoba lagi. Stream yang sudah mengirim token disimpan parsial karena token itu sudah ditagih; stream yang berhenti sebelum token pertama melepas key dan retry dianggap generasi baru. Penyimpanan masih di SQLite proses ini (D2, D7); skema Postgres dan kunci primernya sudah ada, pindah ke Redis/Postgres dilakukan bersama adapter multi-instance.
