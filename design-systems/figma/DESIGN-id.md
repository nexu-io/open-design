# Sistem Desain Terinspirasi dari Figma

> Category: Desain & Kreatif
> Alat desain kolaboratif. Warna-warni cerah, playful namun profesional.

## 1. Tema Visual & Atmosfer

Antarmuka Figma adalah alat desain yang mendesain dirinya sendiri — sebuah mahakarya kecanggihan tipografi di mana font variabel kustom (figmaSans) bermodulasi antara sangat tipis (weight 320) hingga tebal (weight 700) dengan titik-titik intermediat yang tidak biasa (330, 340, 450, 480, 540) yang jarang dijelajahi oleh kebanyakan sistem tipe. Kontrol weight yang granular ini memberikan setiap elemen teks visual weight yang dikalibrasi secara presisi, menciptakan hierarki melalui perbedaan mikro alih-alih instrumen tumpul berupa "regular vs bold."

Halaman ini menghadirkan dualitas yang menarik: chrome antarmuka sepenuhnya hitam-putih (hanya `#000000` dan `#ffffff` yang terdeteksi sebagai warna), sementara bagian hero dan tampilan produk meledak dengan gradien multi-warna yang semarak — hijau elektrik, kuning cerah, ungu tua, merah muda menyala. Pemisahan ini berarti sistem desain itu sendiri tidak berwarna, menjadikan output produk yang berwarna sebagai konten utama. Halaman pemasaran Figma pada dasarnya adalah dinding galeri putih yang memajang karya seni berwarna.

Yang membuat Figma berbeda selain font variabel adalah geometri lingkaran dan pill-nya. Tombol menggunakan radius 50px (pill) atau 50% (lingkaran sempurna untuk tombol ikon), menciptakan nuansa organik seperti palet alat. Indikator fokus bergaris putus-putus (`dashed 2px`) adalah pilihan desain yang disengaja yang menggemakan handle seleksi di editor Figma — bahasa UI website merepresentasikan bahasa UI produk.

**Karakteristik Utama:**
- Font variabel kustom (figmaSans) dengan titik weight yang tidak biasa: 320, 330, 340, 450, 480, 540, 700
- Chrome antarmuka hitam-putih secara ketat — warna hanya ada dalam konten produk
- figmaMono untuk label teknis huruf besar dengan letter-spacing lebar
- Geometri tombol pill (50px) dan lingkaran (50%)
- Garis fokus putus-putus menggemakan handle seleksi editor Figma
- Gradien hero multi-warna yang semarak (hijau, kuning, ungu, merah muda)
- Fitur OpenType `"kern"` diaktifkan secara global
- Letter-spacing negatif di seluruh halaman — bahkan teks isi pada -0.14px hingga -0.26px

## 2. Palet Warna & Peran

### Primer
- **Hitam Murni** (`#000000`): Semua teks, semua tombol solid, semua border. Satu-satunya "warna" antarmuka.
- **Putih Murni** (`#ffffff`): Semua latar belakang, tombol putih, teks di permukaan gelap. Separuh lainnya dari pasangan biner ini.

*Catatan: Situs pemasaran Figma HANYA menggunakan kedua warna ini untuk lapisan antarmukanya. Semua warna cerah muncul secara eksklusif di screenshot produk, gradien hero, dan konten yang disematkan.*

### Permukaan & Latar Belakang
- **Putih Murni** (`#ffffff`): Latar belakang halaman utama dan permukaan kartu.
- **Hitam Kaca** (`rgba(0, 0, 0, 0.08)`): Overlay gelap halus untuk tombol lingkaran sekunder dan efek kaca.
- **Putih Kaca** (`rgba(255, 255, 255, 0.16)`): Overlay kaca buram untuk tombol di permukaan gelap/berwarna.

### Sistem Gradien
- **Gradien Hero**: Gradien multi-titik yang semarak menggunakan hijau elektrik, kuning cerah, ungu tua, dan merah muda menyala. Gradien ini adalah tanda visual khas bagian hero — mewakili kemungkinan kreatif dari alat tersebut.
- **Gradien Bagian Produk**: Area produk individual (Design, Dev Mode, Prototyping) dapat menggunakan tema warna yang berbeda dalam tampilannya.

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `figmaSans`, dengan fallback: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Label**: `figmaMono`, dengan fallback: `figmaMono Fallback, SF Mono, menlo`

### Hierarki

| Peran | Font | Ukuran | Weight | Tinggi Baris | Letter Spacing | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (ketat) | -1.72px | Dampak maksimum, tracking ekstrem |
| Judul Bagian | figmaSans | 64px (4rem) | 400 | 1.10 (ketat) | -0.96px | Judul bagian fitur |
| Sub-judul | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Teks bagian yang ditekankan |
| Sub-judul Ringan | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Teks bagian berbobot ringan |
| Judul Fitur | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Judul kartu tebal |
| Isi Besar | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px to -0.14px | Deskripsi, intro |
| Isi / Tombol | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px to normal | Isi standar, nav, tombol |
| Isi Ringan | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px to normal | Teks isi berbobot ringan |
| Label Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (ketat) | 0.54px | Label bagian huruf besar |
| Mono Kecil | figmaMono | 12px (0.75rem) | 400 | 1.00 (ketat) | 0.6px | Tag kecil huruf besar |

### Prinsip
- **Presisi font variabel**: figmaSans menggunakan weight yang jarang disentuh oleh kebanyakan sistem — 320, 330, 340, 450, 480, 540. Ini menciptakan hierarki melalui perbedaan weight yang halus, bukan lompatan dramatis. Perbedaan antara 330 dan 340 hampir tidak terlihat tetapi signifikan secara struktural.
- **Ringan sebagai dasar**: Sebagian besar teks isi menggunakan 320–340 (lebih ringan dari 400 "regular" yang biasa), menciptakan pengalaman membaca yang etherial dan lapang yang sesuai dengan estetika alat desain.
- **Kern di mana-mana**: Setiap elemen teks mengaktifkan fitur OpenType `"kern"` — kerning bukan pilihan, melainkan struktural.
- **Tracking negatif secara default**: Bahkan teks isi menggunakan -0.1px hingga -0.26px letter-spacing, menciptakan teks yang seragam ketat. Teks display semakin dikompresi hingga -0.96px dan -1.72px.
- **Mono untuk struktur**: figmaMono dalam huruf besar dengan letter-spacing positif (0.54px–0.6px) menciptakan label penanda teknis.

## 4. Gaya Komponen

### Tombol

**Solid Hitam (Pill)**
- Latar belakang: Hitam Murni (`#000000`)
- Teks: Putih Murni (`#ffffff`)
- Radius: lingkaran (50%) untuk tombol ikon
- Fokus: garis putus-putus 2px
- Penekanan maksimum

**Pill Putih**
- Latar belakang: Putih Murni (`#ffffff`)
- Teks: Hitam Murni (`#000000`)
- Padding: 8px 18px 10px (vertikal asimetris)
- Radius: pill (50px)
- Fokus: garis putus-putus 2px
- CTA standar di permukaan gelap/berwarna

**Kaca Gelap**
- Latar belakang: `rgba(0, 0, 0, 0.08)` (overlay gelap halus)
- Teks: Hitam Murni
- Radius: lingkaran (50%)
- Fokus: garis putus-putus 2px
- Aksi sekunder di permukaan terang

**Kaca Terang**
- Latar belakang: `rgba(255, 255, 255, 0.16)` (kaca buram)
- Teks: Putih Murni
- Radius: lingkaran (50%)
- Fokus: garis putus-putus 2px
- Aksi sekunder di permukaan gelap/berwarna

### Kartu & Kontainer
- Latar belakang: Putih Murni
- Border: tidak ada atau minimal
- Radius: 6px (kontainer kecil), 8px (gambar, kartu, dialog)
- Shadow: efek elevasi halus hingga sedang
- Screenshot produk sebagai konten kartu

### Navigasi
- Nav horizontal bersih di atas putih
- Logo: wordmark Figma dalam hitam
- Tab produk: navigasi tab berbentuk pill (50px)
- Tautan: teks hitam, dekorasi garis bawah 1px
- CTA: Tombol pill hitam
- Hover: warna teks melalui variabel CSS

### Komponen Khas

**Bilah Tab Produk**
- Tab berbentuk pill horizontal (radius 50px)
- Setiap tab mewakili area produk Figma (Design, Dev Mode, Prototyping, dll.)
- Tab aktif disorot

**Bagian Gradien Hero**
- Latar belakang gradien multi-warna penuh lebar yang semarak
- Overlay teks putih dengan judul display 86px
- Screenshot produk melayang di dalam gradien

**Indikator Fokus Putus-putus**
- Semua elemen interaktif menggunakan garis `dashed 2px` pada fokus
- Merepresentasikan handle seleksi di editor Figma
- Pilihan meta-desain yang menghubungkan website dan produk

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Grid & Kontainer
- Lebar kontainer maksimum: hingga 1920px
- Hero: gradien penuh lebar dengan konten di tengah
- Bagian produk: tampilan bergantian
- Footer: bagian penuh lebar gelap
- Responsif dari 559px hingga 1920px

### Filosofi Whitespace
- **Ritme seperti galeri**: Spasi yang lebar membiarkan setiap bagian produk bernafas sebagai pamerannya sendiri.
- **Bagian warna sebagai nafas visual**: Gradien hero dan tampilan produk memberikan relief kromatik di antara bagian antarmuka monokrom.

### Skala Border Radius
- Minimal (2px): Elemen tautan kecil
- Halus (6px): Kontainer kecil, pemisah
- Nyaman (8px): Kartu, gambar, dialog
- Pill (50px): Tombol tab, CTA
- Lingkaran (50%): Tombol ikon, elemen melingkar

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa shadow | Latar belakang halaman, sebagian besar teks |
| Permukaan (Level 1) | Kartu putih di atas bagian gradien/gelap | Kartu, tampilan produk |
| Ditinggikan (Level 2) | Shadow halus | Kartu melayang, status hover |

**Filosofi Shadow**: Figma menggunakan shadow secara hemat. Mekanisme kedalaman utama adalah **kontras latar belakang** (konten putih di bagian berwarna/gelap) dan dimensionalitas inheren dari screenshot produk itu sendiri.

## 7. Yang Boleh dan Tidak Boleh Dilakukan

### Boleh Dilakukan
- Gunakan figmaSans dengan weight variabel yang presisi (320–540) — kontrol weight granular ADALAH desainnya
- Pertahankan antarmuka sepenuhnya hitam-putih — warna berasal hanya dari konten produk
- Gunakan geometri pill (50px) dan lingkaran (50%) untuk semua elemen interaktif
- Terapkan garis fokus putus-putus 2px — pola aksesibilitas khas
- Aktifkan fitur `"kern"` pada semua teks
- Gunakan figmaMono dalam huruf besar dengan letter-spacing positif untuk label
- Terapkan letter-spacing negatif di seluruh halaman (-0.1px hingga -1.72px)

### Tidak Boleh Dilakukan
- Jangan tambahkan warna antarmuka — palet monokrom bersifat mutlak
- Jangan gunakan weight font standar (400, 500, 600, 700) — gunakan titik unik font variabel (320, 330, 340, 450, 480, 540)
- Jangan gunakan sudut tajam pada tombol — hanya geometri pill dan lingkaran
- Jangan gunakan garis fokus solid — putus-putus adalah tanda khasnya
- Jangan tingkatkan weight font isi di atas 450 — estetika berbobot ringan adalah intinya
- Jangan gunakan letter-spacing positif pada teks isi — selalu negatif

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Kecil | <560px | Tata letak kompak, tersusun |
| Tablet | 560–768px | Penyesuaian minor |
| Desktop Kecil | 768–960px | Tata letak 2 kolom |
| Desktop | 960–1280px | Tata letak standar |
| Desktop Besar | 1280–1440px | Diperluas |
| Ultra-lebar | 1440–1920px | Lebar maksimum |

### Strategi Collapsing
- Teks hero: 86px → 64px → 48px
- Tab produk: gulir horizontal di mobile
- Bagian fitur: kolom tunggal tersusun
- Footer: multi-kolom → tersusun

## 9. Panduan Prompt untuk Agen

### Referensi Warna Cepat
- Segalanya: "Pure Black (#000000)" dan "Pure White (#ffffff)"
- Kaca Gelap: "rgba(0, 0, 0, 0.08)"
- Kaca Terang: "rgba(255, 255, 255, 0.16)"

### Contoh Prompt Komponen
- "Buat hero di atas gradien multi-warna yang semarak (hijau, kuning, ungu, merah muda). Judul pada 86px figmaSans weight 400, line-height 1.0, letter-spacing -1.72px. Teks putih. Tombol CTA pill putih (radius 50px, padding 8px 18px)."
- "Desain bilah tab produk dengan tombol berbentuk pill (radius 50px). Aktif: latar belakang hitam, teks putih. Tidak aktif: transparan, teks hitam. figmaSans pada 20px weight 480."
- "Buat label bagian: figmaMono 18px, huruf besar, letter-spacing 0.54px, teks hitam. Kern diaktifkan."
- "Buat teks isi pada 20px figmaSans weight 330, line-height 1.40, letter-spacing -0.14px. Hitam Murni di atas putih."

### Panduan Iterasi
1. Gunakan titik weight font variabel secara presisi: 320, 330, 340, 450, 480, 540, 700
2. Antarmuka selalu hitam + putih — jangan pernah tambahkan warna pada chrome
3. Garis fokus putus-putus, bukan solid
4. Letter-spacing selalu negatif pada isi, selalu positif pada label mono
5. Pill (50px) untuk tombol/tab, lingkaran (50%) untuk tombol ikon
