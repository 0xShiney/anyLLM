# Celah desain

DESIGN.md tidak membahas hal-hal berikut. Keputusan yang diambil dicatat di sini.

1. **Tabel dengan > 8 kolom.** DESIGN.md hanya mengatur tabel padat. Untuk tabel log dipakai kolom prioritas (waktu, model, tag, token, biaya, status) dan sisanya masuk panel detail baris. Tidak ada horizontal scroll di desktop.
2. **Diff berdampingan.** DESIGN.md belum mengatur tampilan diff. Dipakai dua kolom teks monospace dengan latar `--surface-sunken`, penanda baris hanya warna latar tipis, tanpa warna merah/hijau terang agar tetap tenang.
3. **Warna seri chart ketiga.** Token hanya menyediakan satu aksen. Seri ketiga memakai `--warn` dan hanya muncul di perbandingan tiga model.
4. **Fokus keyboard pada baris tabel yang bisa diklik.** Diputuskan baris memakai `tabindex="0"` dan `outline` 2px `--accent` agar bisa dioperasikan tanpa mouse.
5. **Banner pengumuman.** Tidak diatur. Dipakai strip tipis di atas konten dengan latar `--warn-soft`, satu baris, bisa ditutup; tidak muncul di halaman publik.
6. **Mode cetak / invoice.** Belum diatur. Invoice di v1 hanya halaman HTML sederhana tanpa CSS cetak khusus.
7. **Dark mode.** Sengaja tidak ada; DESIGN.md tidak menyediakannya dan menambah token berarti menggandakan permukaan uji.
