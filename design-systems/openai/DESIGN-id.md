# Sistem Desain Terinspirasi dari OpenAI

> Category: AI & LLM
> Sistem tenang dan hampir-monokrom yang berjangkar pada teal-hitam pekat dengan ruang putih yang luas serta tipografi editorial.

## 1. Tema Visual & Atmosfer

Permukaan produk OpenAI tampak seperti laboratorium riset yang bersolek untuk publik — klinis, tertahan, dan sengaja senyap. Latar belakang halaman adalah putih murni (`#ffffff`) yang dilapisi tinta hampir-hitam (`#0d0d0d`) dengan nuansa teal halus, sehingga bahkan teks pun terasa sedikit dingin alih-alih gelap secara agresif. Hasilnya adalah netralitas kromatik yang menempatkan keluaran model, kode, dan prosa sebagai pusat perhatian — bukan bingkai di sekelilingnya.

Ciri khas desain ini adalah penggunaan **Söhne** (atau pengganti sistemnya `inter`) dengan bobot yang tertahan — 400 untuk isi, 500 untuk nav dan label, 600 untuk penekanan — dipasangkan dengan **Signifier**, serif kontemporer yang digunakan untuk display editorial. Di saat sebagian besar merek AI condong ke arah futuristik, tajuk serif OpenAI justru memberikan nada literer yang halus, seolah setiap pengumuman adalah sebuah esai.

Sistem bentuk seragam dan lembut: radius 8px–12px, pill 9999px untuk tag dan chip, tanpa sudut tajam di mana pun. Transisi antarseksi ditandai dengan ruang putih, bukan pembagi; ketika border muncul, berupa garis rambut `#e5e5e5` yang terbaca sebagai ketiadaan warna, bukan kehadirannya.

**Karakteristik Utama:**
- Kanvas putih murni (`#ffffff`) dengan tinta teal-hitam pekat (`#0d0d0d`)
- Söhne / Inter dengan bobot sederhana (400, 500, 600) — penahan diri atas pernyataan
- Signifier serif untuk tajuk display editorial
- Radius lembut 8–12px di mana saja; pill 9999px untuk chip
- Border garis rambut (`#e5e5e5`) digunakan seperlunya; ruang putih sebagai pemisah utama
- Ilustrasi satu warna dalam teal pekat — tanpa gradien pada tanda
- Line-height yang lapang (1.55–1.65) dan tracking mendekati nol

## 2. Palet Warna & Peran

### Primer
- **Putih Murni** (`#ffffff`): Latar belakang utama, permukaan kartu, latar tombol.
- **Hitam Tinta** (`#0d0d0d`): Teks utama, tanda merek, CTA primer.
- **Hitam Lembut** (`#1a1a1a`): Heading sekunder, tinta alternatif untuk teks non-kritis.

### Permukaan & Latar Belakang
- **Kabut** (`#fafafa`): Latar pemisah seksi, permukaan footer.
- **Mutiara** (`#f5f5f5`): Permukaan kartu, panel yang ditinggikan.
- **Awan** (`#ececec`): Latar nonaktif, tint pembagi.

### Aksen Merek
- **OpenAI Teal** (`#10a37f`): Merek primer, tautan, lencana sorot — satu-satunya warna dalam sistem yang serba netral.
- **Teal Pekat** (`#0a7a5e`): Status hover dan pressed untuk warna merek.
- **Teal Lembut** (`#e8f5f0`): Tint permukaan untuk lencana sukses, callout sorot.

### Netral & Teks
- **Grafit** (`#3c3c3c`): Teks isi, warna bacaan default.
- **Slate** (`#6e6e6e`): Teks sekunder, keterangan, metadata.
- **Abu** (`#9b9b9b`): Teks tersier, placeholder, label nonaktif.
- **Batu** (`#c4c4c4`): Pembagi dekoratif, ikon samar.

### Semantik & Border
- **Border Garis Rambut** (`#e5e5e5`): Pemisah garis rambut standar.
- **Border Lembut** (`#ededed`): Garis luar kartu di permukaan putih.
- **Kesalahan** (`#ef4146`): Validasi, aksi destruktif.
- **Peringatan** (`#f5a623`): Amber lembut untuk status penasihat.
- **Info** (`#2563eb`): Nada tautan informasional (digunakan seperlunya; teal tetap unggul).

## 3. Aturan Tipografi

### Font Family
- **Display / Editorial**: `Signifier`, dengan fallback: `'Source Serif Pro', Georgia, serif`
- **Body / UI**: `Söhne`, dengan fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, dengan fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarki

| Peran | Font | Ukuran | Bobot | Line Height | Letter Spacing | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Hero editorial, judul pengumuman |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Heading halaman |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Heading seksi |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Sub-seksi |
| Body Large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Paragraf lede |
| Body | Söhne | 16px (1rem) | 400 | 1.65 | normal | Teks bacaan standar |
| Body Small | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Isi kartu, UI padat |
| Caption | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadata, lencana |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, tautan nav huruf kapital |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Blok kode, keluaran terminal |

### Prinsip
- **Penahan diri sebagai identitas**: bobot maksimal 600; 700+ terasa di luar merek. Hierarki berasal dari ukuran dan warna, bukan bobot.
- **Serif untuk jiwa, sans untuk sistem**: Signifier hanya muncul pada momen display editorial. UI produk sepenuhnya sans.
- **Tracking negatif pada display**: -0.02em pada ukuran display; tracking kembali ke nol pada 16px.

## 4. Gaya Komponen

### Tombol

**Primer**
- Latar belakang: `#0d0d0d`
- Teks: `#ffffff`
- Padding: 10px 18px
- Radius: 9999px (full pill) pada chip, 12px pada CTA persegi panjang
- Hover: latar belakang `#1a1a1a`
- Kegunaan: CTA primer, "Try ChatGPT", "Sign in"

**Sekunder**
- Latar belakang: `#ffffff`
- Teks: `#0d0d0d`
- Border: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Radius: 12px
- Hover: latar belakang `#fafafa`, border `#d4d4d4`

**Aksen Merek**
- Latar belakang: `#10a37f`
- Teks: `#ffffff`
- Padding: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Kegunaan: CTA peningkatan yang disorot, jalur sukses

### Kartu
- Latar belakang: `#ffffff`
- Border: 1px solid `#ededed`
- Radius: 16px
- Padding: 24px–32px
- Shadow: tidak ada secara default; saat hover `0 4px 16px rgba(13,13,13,0.06)`

### Input
- Latar belakang: `#ffffff`
- Border: 1px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 14px
- Fokus: border `#10a37f`, ring `0 0 0 3px rgba(16,163,127,0.12)`

### Pill & Tag
- Latar belakang: `#f5f5f5`
- Teks: `#3c3c3c`
- Padding: 4px 10px
- Radius: 9999px
- Font: 12px / 500

## 5. Spasi & Tata Letak

- **Unit dasar**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Kontainer**: max-width 1200px, gutter 24px pada mobile, 48px pada desktop.
- **Ritme seksi**: 96–128px vertikal antarseksi utama; 64px pada mobile.
- **Grid**: 12 kolom desktop, 4 kolom mobile, gap 24px.

## 6. Gerak

- **Durasi**: 150–220ms untuk hover; 280–360ms untuk transisi tata letak.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth out) untuk kemunculan.
- **Penahan diri**: tanpa paralaks, tanpa scroll-jacking. Hanya fade dan translate yang halus.

## 7. Panduan Penggunaan

- Pertahankan penahan diri editorial yang netral, radius lembut, dan penggunaan aksen yang jarang secara bersamaan; aksen hijau saja tidak menciptakan permukaan bergaya OpenAI.
- Gunakan momen display bergaya Signifier hanya untuk hierarki editorial atau pengumuman, menjaga kontrol produk tetap dalam sistem sans.
- Hindari gerak ornamental, shadow berat, dan kartu dekoratif berukuran besar; sistem harus terasa tenang, mudah dibaca, dan disengaja.
