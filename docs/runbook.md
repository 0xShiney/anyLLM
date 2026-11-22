# Runbook

## Provider down / error rate tinggi
1. Buka `/admin/ops`. Cek `error rate` per provider dan status circuit breaker.
2. Jika satu provider > 20% error dalam 5 menit, aktifkan kill switch provider di `/admin/models` (tombol `Nonaktifkan`). Router otomatis melewati provider nonaktif dan memakai fallback berikutnya.
3. Jika semua provider OpenAI-compatible down, arahkan alias `auto-murah`/`auto-cepat` ke model Anthropic lewat `/admin/models`.
4. Setelah pulih, matikan kill switch dan pantau p95 selama 15 menit.

## Kunci provider bocor
1. Rotasi key di dashboard provider.
2. Perbarui env `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` lalu restart proses gateway.
3. Set `status = 'revoked'` untuk key yang terdampak di tabel `provider_keys`.
4. Periksa `usage` 48 jam terakhir untuk lonjakan biaya, lalu rekonsiliasi dengan tagihan provider.

## Refund massal
1. Filter `usage` dengan `status = 'provider_error'` pada rentang waktu insiden.
2. `/admin/finance` → `Koreksi saldo` → pilih `kredit kompensasi`, isi alasan, lampirkan rentang waktu.
3. Setiap koreksi menulis entri ledger baru; entri lama tidak pernah diubah.
4. Ekspor CSV dari halaman ledger sebagai lampiran tiket.

## Saldo provider hampir habis
Alert muncul di `/admin/ops` bila saldo key platform < 20%. Isi ulang di dashboard provider, perbarui `provider_keys.balance_note` dan tanggal verifikasi.

## Stream terputus di tengah
Gateway sudah menagih token yang terkirim dan menandai baris `usage` dengan `truncated = 1`. Tidak ada aksi manual; klien bisa memakai `X-Request-Id` untuk komplain dan support bisa memberi kredit kompensasi.

## Restore database
`sqlite3 data/anyllm.db ".backup data/backup-$(date +%F).db"` setiap 6 jam (cron). Uji restore bulanan ke direktori sementara, jalankan `node --test` pada salinan.
