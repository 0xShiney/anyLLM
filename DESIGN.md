# DESIGN.md

Dokumen ini adalah sumber kebenaran visual untuk anyLLM. Jangan ubah tanpa alasan kuat; kalau ada celah, catat di `docs/design-gaps.md`.

## Prinsip

1. **Alat kerja, bukan poster.** Kepadatan informasi tinggi, hiasan minimal. Setiap piksel yang tidak membawa informasi dihapus.
2. **Angka adalah bintangnya.** Biaya, token, latency, dan selisih selalu memakai angka tabular monospace agar bisa dibandingkan sekilas.
3. **Satu aksen.** Warna hanya dipakai untuk status dan aksi utama. Tidak ada gradient, tidak ada bayangan berlapis, tidak ada glassmorphism.
4. **Tenang.** Latar kertas hangat, garis tipis, ruang napas lewat spasi bukan dekorasi.
5. **Jujur.** Estimasi diberi label estimasi. Sampel kecil diberi tingkat ketidakpastian. Tidak ada klaim berlebihan.

## Token

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `--paper` | `#f6f4ef` | latar halaman |
| `--surface` | `#fdfcfa` | kartu, panel, tabel |
| `--surface-sunken` | `#efece4` | area sekunder, header tabel |
| `--ink` | `#1a1a18` | teks utama |
| `--ink-soft` | `#55534c` | teks sekunder |
| `--ink-faint` | `#8a877e` | label, metadata |
| `--line` | `#dfdbd2` | garis 1px |
| `--line-strong` | `#c6c0b3` | garis fokus/aktif |
| `--accent` | `#145e4a` | aksi utama, tautan, seri data utama |
| `--accent-soft` | `#e2ece6` | latar status positif |
| `--warn` | `#8a5a12` | peringatan, estimasi |
| `--warn-soft` | `#f7eeda` | latar peringatan |
| `--danger` | `#9d2f2f` | error, penurunan kualitas |
| `--danger-soft` | `#f6e6e3` | latar error |

Radius: `3px` untuk kontrol, `4px` untuk kartu. Tidak ada radius besar.
Border: selalu `1px solid var(--line)`.
Shadow: hanya `0 1px 0 rgba(26,26,24,0.04)` pada elemen yang menempel di atas konten.

## Tipografi

- **Display** (h1, angka besar): serif sistem — `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. Tracking `-0.02em`, berat 400. Judul tidak pernah bold.
- **Body/UI**: sans sistem — `ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. 14px dasar, line-height 1.5.
- **Data**: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace` dengan `font-variant-numeric: tabular-nums`.
- Label kecil: 11px, uppercase, tracking `0.09em`, warna `--ink-faint`.
- Skala: 11 / 12 / 14 / 16 / 20 / 28 / 40 / 56. Tidak ada ukuran lain.

## Komponen

- **Tombol**: tinggi 34px, padding 12px, radius 3px, border 1px. Primer = latar `--accent`, teks putih. Sekunder = latar `--surface`, border `--line-strong`. Hantu = tanpa border, hover `--surface-sunken`. Ikon 14px, jarak 8px, tidak pernah sendirian tanpa teks kecuali di header tabel.
- **Kartu**: `--surface`, border 1px, radius 4px, padding 20px. Judul kartu 14px sans medium + label kecil di atas bila perlu.
- **Tabel**: header `--surface-sunken`, teks 11px uppercase tracking, baris 40px, hover `--paper`, angka rata kanan monospace. Garis horizontal saja.
- **Badge**: 11px, uppercase, tracking 0.06em, padding 2px 6px, border 1px, radius 2px. Warna mengikuti status, bukan dekorasi.
- **Input**: tinggi 34px, border 1px `--line`, latar `--surface`, fokus ring 2px `--accent` dengan offset 0. Pesan error 12px `--danger`.
- **State kosong**: judul 14px, satu kalimat penjelas `--ink-soft`, satu aksi. Tanpa ilustrasi besar.
- **Chart**: SVG 1px garis, seri utama `--accent`, seri pembanding `--ink-faint`, grid `--line` putus-putus. Tanpa legend box; label langsung.

## Nada bahasa

- Bahasa Indonesia sebagai default, istilah teknis tetap Inggris (request, token, latency, fallback).
- Kalimat pendek, aktif, tanpa seru. "Saldo tidak cukup untuk request ini." bukan "Ups! Sepertinya saldomu habis 😅".
- Angka uang: `Rp1.234.567` (tanpa spasi), desimal hanya bila perlu (`Rp12,4 jt` untuk ringkasan).
- Tidak ada emoji. Tidak ada "revolusioner", "supercharged", "seamless".

## Layout

- Sidebar 224px, latar `--paper` dengan garis kanan. Konten maksimal 1120px, padding 32px.
- Header halaman: judul serif 28px, satu baris deskripsi 14px `--ink-soft`, aksi di kanan.
- Grid 4 kolom metrik di desktop, 2 di tablet, 1 di ponsel. Jarak antar blok 20px.
