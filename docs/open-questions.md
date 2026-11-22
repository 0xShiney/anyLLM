# Pertanyaan terbuka

Butuh konfirmasi manusia (hukum, akuntansi, vendor). Jangan diasumsikan di kode.

## Hukum dan kepatuhan
1. Apakah setiap provider mengizinkan penjualan ulang akses (reseller) lewat gateway pihak ketiga? Perlu dibaca ToS OpenAI, Anthropic, Google, dan Meta untuk akun komersial.
2. Dasar hukum pemrosesan data pelanggan menurut UU PDP: apakah cukup persetujuan di ToS atau perlu perjanjian pemrosesan data (DPA) terpisah? Perlu template DPA.
3. Kebijakan retensi log setelah akun dihapus: hapus seketika atau tunduk pada kewajiban pembukuan?
4. Kewajiban PPN atas jasa digital asing dan mekanisme pemungutan (PMSE) — perlu konsultan pajak.

## Keuangan
5. Mata uang basis ledger: IDR saja, atau IDR + USD dengan kurs per transaksi? Harga modal provider dalam USD, harga jual dalam IDR.
6. Kebijakan kedaluwarsa kredit (misal 12 bulan) dan perlakuannya terhadap sisa saldo saat akun ditutup.
7. Batas nominal kredit kompensasi per peran support/finance.
8. Apakah biaya top up dikenakan (mis. 1,5%) atau murni markup per model?

## Teknis
9. Spike Bifrost (lisensi Apache-2.0 untuk `core`, fitur enterprise berbayar terpisah) belum bisa dijalankan di lingkungan ini; perlu 1–2 hari di mesin dengan Go untuk memutuskan embed vs adapter sendiri.
10. Provider email transaksional: Resend vs Postmark vs SES. Butuh domain terverifikasi.
11. Region deploy: Singapura (dekat provider) vs Jakarta (dekat pengguna). Perlu pengukuran latency nyata dari Indonesia.
12. Apakah semantic cache layak untuk v2 setelah melihat distribusi tag pelanggan nyata.
