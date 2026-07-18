# Design System Inspired by Vercel

> Category: Alat Developer
> Penerapan frontend. Presisi hitam putih, font Geist.

## 1. Tema Visual & Atmosfer

Website Vercel adalah tesis visual dari infrastruktur developer yang dibuat tak terlihat — sebuah sistem desain yang sangat menahan diri hingga mendekati filosofis. Halaman ini didominasi warna putih (`#ffffff`) dengan teks hampir hitam (`#171717`), menciptakan kekosongan ala galeri di mana setiap elemen harus layak mendapatkan pikselnya. Ini bukan minimalis sebagai dekorasi; ini minimalis sebagai prinsip rekayasa. Sistem desain Geist memperlakukan antarmuka seperti kompilator memperlakukan kode — setiap token yang tidak perlu dihapus hingga hanya struktur yang tersisa.

Keluarga font Geist kustom adalah mahkota perhiasannya. Geist Sans menggunakan jarak antar huruf negatif yang agresif (-2.4px hingga -2.88px pada ukuran display), menciptakan tajuk yang terasa terkompresi, mendesak, dan terenginyir — seperti kode yang telah diminifikasi untuk produksi. Pada ukuran body, jarak antar huruf melonggar namun presisi geometrisnya tetap ada. Geist Mono melengkapi sistem sebagai pasangan monospace untuk kode, output terminal, dan label teknis. Kedua font mengaktifkan OpenType `"liga"` (ligatur) secara global, menambahkan lapisan kecanggihan tipografi yang memberikan imbalan bagi pembaca yang teliti.

Yang membedakan Vercel dari sistem desain monokrom lainnya adalah filosofi shadow-as-border-nya. Alih-alih border CSS tradisional, Vercel menggunakan `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — shadow zero-offset, zero-blur, spread 1px yang menciptakan garis mirip border tanpa implikasi box model. Teknik ini memungkinkan border berada di lapisan shadow, memungkinkan transisi yang lebih halus, sudut membulat tanpa kliping, dan bobot visual yang lebih lembut daripada border tradisional. Seluruh sistem kedalaman dibangun di atas tumpukan shadow berlapis dengan banyak nilai di mana setiap lapisan melayani tujuan tertentu: satu untuk border, satu untuk elevasi lembut, satu untuk kedalaman ambient.

**Karakteristik Utama:**
- Geist Sans dengan jarak antar huruf negatif ekstrem (-2.4px hingga -2.88px pada display) — teks sebagai infrastruktur terkompresi
- Geist Mono untuk kode dan label teknis dengan OpenType `"liga"` secara global
- Teknik shadow-as-border: `box-shadow 0px 0px 0px 1px` menggantikan border tradisional di seluruh tampilan
- Tumpukan shadow berlapis untuk kedalaman yang bernuansa (border + elevasi + ambient dalam satu deklarasi)
- Kanvas hampir putih murni dengan teks `#171717` — tidak benar-benar hitam, menciptakan kelembutan kontras mikro
- Warna aksen spesifik alur kerja: Ship Red (`#ff5b4f`), Preview Pink (`#de1d8d`), Develop Blue (`#0a72ef`)
- Sistem focus ring menggunakan `hsla(212, 100%, 48%, 1)` — biru jenuh untuk aksesibilitas
- Pill badge (9999px) dengan latar belakang bertona untuk indikator status

## 2. Palet Warna & Peran

### Primer
- **Vercel Black** (`#171717`): Teks primer, tajuk, latar belakang permukaan gelap. Bukan hitam murni — kehangatan sedikit mencegah kekerasan.
- **Pure White** (`#ffffff`): Latar belakang halaman, permukaan kartu, teks tombol pada gelap.
- **True Black** (`#000000`): Penggunaan sekunder, `--geist-console-text-color-default`, digunakan dalam konteks konsol/kode tertentu.

### Warna Aksen Alur Kerja
- **Ship Red** (`#ff5b4f`): `--ship-text`, langkah alur kerja "ship to production" — merah koral hangat dan mendesak.
- **Preview Pink** (`#de1d8d`): `--preview-text`, alur kerja penerapan pratinjau — merah muda magenta yang mencolok.
- **Develop Blue** (`#0a72ef`): `--develop-text`, alur kerja pengembangan — biru terang dan terfokus.

### Warna Konsol / Kode
- **Console Blue** (`#0070f3`): `--geist-console-text-color-blue`, biru penyorotan sintaks.
- **Console Purple** (`#7928ca`): `--geist-console-text-color-purple`, ungu penyorotan sintaks.
- **Console Pink** (`#eb367f`): `--geist-console-text-color-pink`, merah muda penyorotan sintaks.

### Interaktif
- **Link Blue** (`#0072f5`): Warna tautan primer dengan dekorasi garis bawah.
- **Focus Blue** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, focus ring pada elemen interaktif.
- **Ring Blue** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, utilitas ring Tailwind.

### Skala Netral
- **Gray 900** (`#171717`): Teks primer, tajuk, teks navigasi.
- **Gray 600** (`#4d4d4d`): Teks sekunder, teks deskripsi.
- **Gray 500** (`#666666`): Teks tersier, tautan redup.
- **Gray 400** (`#808080`): Teks placeholder, status dinonaktifkan.
- **Gray 100** (`#ebebeb`): Border, garis kartu, pemisah.
- **Gray 50** (`#fafafa`): Tona permukaan halus, sorotan shadow dalam.

### Permukaan & Overlay
- **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, latar modal/dialog.
- **Selection Text** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, sorotan seleksi teks.
- **Badge Blue Bg** (`#ebf5ff`): Latar belakang pill badge, permukaan biru bertona.
- **Badge Blue Text** (`#0068d6`): Teks pill badge, biru lebih gelap untuk keterbacaan.

### Shadow & Kedalaman
- **Border Shadow** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): Tanda tangan — menggantikan border tradisional.
- **Subtle Elevation** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Angkat minimal untuk kartu.
- **Card Stack** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Shadow kartu berlapis penuh.
- **Ring Border** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Ring-border abu-abu terang untuk tab dan gambar.

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `Geist`, dengan fallback: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace**: `Geist Mono`, dengan fallback: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Fitur OpenType**: `"liga"` diaktifkan secara global pada semua teks Geist; `"tnum"` untuk angka tabular pada keterangan tertentu.

### Hierarki

| Peran | Font | Ukuran | Bobot | Tinggi Baris | Jarak Huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (ketat) | -2.4px hingga -2.88px | Kompresi maksimum, dampak billboard |
| Section Heading | Geist | 40px (2.50rem) | 600 | 1.20 (ketat) | -2.4px | Judul bagian fitur |
| Sub-heading Large | Geist | 32px (2.00rem) | 600 | 1.25 (ketat) | -1.28px | Tajuk kartu, sub-bagian |
| Sub-heading | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Sub-tajuk lebih ringan |
| Card Title | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Kartu fitur |
| Card Title Light | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Tajuk kartu sekunder |
| Body Large | Geist | 20px (1.25rem) | 400 | 1.80 (santai) | normal | Pengantar, deskripsi fitur |
| Body | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Teks bacaan standar |
| Body Small | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Teks UI standar |
| Body Medium | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Navigasi, teks ditekankan |
| Body Semibold | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Label kuat, status aktif |
| Button / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Tombol, tautan, keterangan |
| Button Small | Geist | 14px (0.88rem) | 400 | 1.00 (ketat) | normal | Tombol kompak |
| Caption | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadata, tag |
| Mono Body | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Blok kode |
| Mono Caption | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Label kode |
| Mono Small | Geist Mono | 12px (0.75rem) | 500 | 1.00 (ketat) | normal | `text-transform: uppercase`, label teknis |
| Micro Badge | Geist | 7px (0.44rem) | 700 | 1.00 (ketat) | normal | `text-transform: uppercase`, badge sangat kecil |

### Prinsip
- **Kompresi sebagai identitas**: Geist Sans pada ukuran display menggunakan jarak antar huruf -2.4px hingga -2.88px — jarak negatif paling agresif dari sistem desain besar mana pun. Ini menciptakan teks yang terasa _diminifikasi_, seperti kode yang dioptimalkan untuk produksi. Jarak secara progresif melonggar seiring penurunan ukuran: -1.28px pada 32px, -0.96px pada 24px, -0.32px pada 16px, dan normal pada 14px.
- **Ligatur di mana-mana**: Setiap elemen teks Geist mengaktifkan OpenType `"liga"`. Ligatur bukan dekoratif — melainkan struktural, menciptakan kombinasi glyph yang lebih rapat dan efisien.
- **Tiga bobot, peran ketat**: 400 (body/membaca), 500 (UI/interaktif), 600 (tajuk/penekanan). Tidak ada bold (700) kecuali untuk micro-badge sangat kecil. Rentang bobot yang sempit ini menciptakan hierarki melalui ukuran dan jarak, bukan bobot.
- **Mono untuk identitas**: Geist Mono dalam huruf besar dengan `"tnum"` atau `"liga"` berfungsi sebagai suara "konsol developer" — label teknis kompak yang menghubungkan situs pemasaran ke produk.

## 4. Gaya Komponen

### Tombol

**Primer Putih (Shadow-bordered)**
- Latar belakang: `#ffffff`
- Teks: `#171717`
- Padding: 0px 6px (minimal — lebar didorong konten)
- Radius: 6px (sedikit membulat)
- Shadow: `rgb(235, 235, 235) 0px 0px 0px 1px` (ring-border)
- Hover: latar belakang beralih ke `var(--ds-gray-1000)` (gelap)
- Fokus: outline `2px solid var(--ds-focus-color)` + shadow `var(--ds-focus-ring)`
- Kegunaan: Tombol sekunder standar

**Primer Gelap (Disimpulkan dari sistem Geist)**
- Latar belakang: `#171717`
- Teks: `#ffffff`
- Padding: 8px 16px
- Radius: 6px
- Kegunaan: CTA primer ("Start Deploying", "Get Started")

**Tombol Pill / Badge**
- Latar belakang: `#ebf5ff` (biru bertona)
- Teks: `#0068d6`
- Padding: 0px 10px
- Radius: 9999px (pill penuh)
- Font: 12px bobot 500
- Kegunaan: Badge status, tag, label fitur

**Pill Besar (Navigasi)**
- Latar belakang: transparan atau `#171717`
- Radius: 64px–100px
- Kegunaan: Navigasi tab, pemilih bagian

### Kartu & Kontainer
- Latar belakang: `#ffffff`
- Border: via shadow — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Radius: 8px (standar), 12px (kartu unggulan/gambar)
- Tumpukan shadow: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Kartu gambar: `1px solid #ebebeb` dengan radius atas 12px
- Hover: intensifikasi shadow halus

### Input & Formulir
- Radio: gaya standar dengan fokus latar belakang `var(--ds-gray-200)`
- Shadow fokus: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Outline fokus: `2px solid var(--ds-focus-color)` — focus ring biru konsisten
- Border: via teknik shadow, bukan border tradisional

### Navigasi
- Nav horizontal bersih pada putih, sticky
- Logotype Vercel rata kiri, 262x52px
- Tautan: Geist 14px bobot 500, teks `#171717`
- Aktif: bobot 600 atau garis bawah
- CTA: tombol pill gelap ("Start Deploying", "Contact Sales")
- Mobile: menu hamburger runtuh
- Dropdown produk dengan menu bertingkat

### Perlakuan Gambar
- Screenshot produk dengan border `1px solid #ebebeb`
- Gambar radius atas: `12px 12px 0px 0px`
- Screenshot dasbor/pratinjau kode mendominasi bagian fitur
- Latar belakang gradien lembut di belakang gambar hero (multi-warna pastel)

### Komponen Khas

**Pipeline Alur Kerja**
- Pipeline horizontal tiga langkah: Develop → Preview → Ship
- Setiap langkah memiliki warna aksennya sendiri: Biru → Merah Muda → Merah
- Dihubungkan dengan garis/panah
- Metafora visual untuk proposisi nilai inti Vercel

**Trust Bar / Grid Logo**
- Logo perusahaan (Perplexity, ChatGPT, Cursor, dll.) dalam skala abu-abu
- Scroll horizontal atau tata letak grid
- Pemisah border `#ebebeb` halus

**Kartu Metrik**
- Tampilan angka besar (misalnya, "10x lebih cepat")
- Geist 48px bobot 600 untuk metrik
- Deskripsi di bawah dalam teks body abu-abu
- Kontainer kartu shadow-bordered

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Jarak yang perlu diperhatikan: melompat dari 16px ke 32px — tidak ada 20px atau 24px dalam skala primer

### Grid & Kontainer
- Lebar konten maksimum: sekitar 1200px
- Hero: kolom tunggal terpusat dengan padding atas yang generous
- Bagian fitur: grid 2–3 kolom untuk kartu
- Pemisah lebar penuh menggunakan `border-bottom: 1px solid #171717`
- Screenshot kode/dasbor sebagai lebar penuh atau terkandung dengan border

### Filosofi Ruang Kosong
- **Kekosongan ala galeri**: Padding vertikal masif antar bagian (80px–120px+). Ruang putih ADALAH desainnya — mengkomunikasikan bahwa Vercel tidak perlu membuktikan apa pun dan tidak ada yang disembunyikan.
- **Teks terkompresi, ruang meluas**: Jarak antar huruf negatif yang agresif pada tajuk diimbangi dengan ruang putih yang generous di sekitarnya. Teksnya padat; ruang di sekitarnya sangat luas.
- **Ritme bagian**: Bagian putih bergantian dengan bagian putih — tidak ada variasi warna antar bagian. Pemisahan berasal dari border (shadow-border) dan spasi saja.

### Skala Border Radius
- Mikro (2px): Cuplikan kode inline, span kecil
- Halus (4px): Kontainer kecil
- Standar (6px): Tombol, tautan, elemen fungsional
- Nyaman (8px): Kartu, item daftar
- Gambar (12px): Kartu unggulan, kontainer gambar (radius atas)
- Besar (64px): Pill navigasi tab
- XL (100px): Tautan navigasi besar
- Pill Penuh (9999px): Badge, pill status, tag
- Lingkaran (50%): Toggle menu, kontainer avatar

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Kegunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa shadow | Latar belakang halaman, blok teks |
| Ring (Level 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Shadow-as-border untuk sebagian besar elemen |
| Ring Terang (Level 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Ring lebih terang untuk tab, gambar |
| Kartu Halus (Level 2) | Ring + `rgba(0,0,0,0.04) 0px 2px 2px` | Kartu standar dengan angkat minimal |
| Kartu Penuh (Level 3) | Ring + Halus + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + ring dalam `#fafafa` | Kartu unggulan, panel yang disorot |
| Fokus (Aksesibilitas) | Outline `2px solid hsla(212, 100%, 48%, 1)` | Fokus keyboard pada semua elemen interaktif |

**Filosofi Shadow**: Vercel memiliki sistem shadow yang boleh dikatakan paling canggih dalam desain web modern. Alih-alih menggunakan shadow untuk elevasi dalam arti Material Design tradisional, Vercel menggunakan tumpukan shadow multi-nilai di mana setiap lapisan memiliki tujuan arsitektural yang berbeda: satu menciptakan "border" (spread 0px, 1px), satu lagi menambahkan kelembutan ambient (blur 2px), satu lagi menangani kedalaman dari kejauhan (blur 8px dengan spread negatif), dan ring dalam (`#fafafa`) menciptakan sorotan halus yang membuat kartu "bersinar" dari dalam. Pendekatan berlapis ini berarti kartu terasa dibangun, bukan melayang.

### Kedalaman Dekoratif
- Gradien hero: pencucian gradien multi-warna pastel lembut di belakang konten hero (hampir tidak terlihat, atmosferik)
- Border bagian: `1px solid #171717` (garis gelap penuh) antar bagian utama
- Tidak ada variasi warna latar belakang — kedalaman berasal sepenuhnya dari lapisan shadow dan kontras border

## 7. Yang Harus dan Tidak Boleh Dilakukan

### Yang Harus Dilakukan
- Gunakan Geist Sans dengan jarak antar huruf negatif yang agresif pada ukuran display (-2.4px hingga -2.88px pada 48px)
- Gunakan shadow-as-border (`0px 0px 0px 1px rgba(0,0,0,0.08)`) alih-alih border CSS tradisional
- Aktifkan `"liga"` pada semua teks Geist — ligatur bersifat struktural, bukan opsional
- Gunakan sistem tiga bobot: 400 (body), 500 (UI), 600 (tajuk)
- Terapkan warna aksen alur kerja (Merah/Merah Muda/Biru) hanya dalam konteks alur kerja mereka
- Gunakan tumpukan shadow berlapis untuk kartu (border + elevasi + ambient + sorotan dalam)
- Pertahankan palet warna akromatik — abu-abu dari `#171717` hingga `#ffffff` adalah sistemnya
- Gunakan `#171717` alih-alih `#000000` untuk teks primer — kehangatan mikro itu penting

### Yang Tidak Boleh Dilakukan
- Jangan gunakan jarak antar huruf positif pada Geist Sans — selalu negatif atau nol
- Jangan gunakan bobot 700 (bold) pada teks body — 600 adalah maksimum, digunakan hanya untuk tajuk
- Jangan gunakan CSS `border` tradisional pada kartu — gunakan teknik shadow-border
- Jangan masukkan warna hangat (oranye, kuning, hijau) ke dalam chrome UI
- Jangan terapkan warna aksen alur kerja (Ship Red, Preview Pink, Develop Blue) secara dekoratif
- Jangan gunakan shadow berat (> 0.1 opacity) — sistem shadow berada pada level bisik
- Jangan tingkatkan jarak antar huruf teks body — Geist dirancang untuk berjalan ketat
- Jangan gunakan radius pill (9999px) pada tombol aksi primer — pill hanya untuk badge/tag
- Jangan lewatkan ring dalam `#fafafa` dalam shadow kartu — itulah cahaya yang membuat sistem bekerja

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Kecil | <400px | Kolom tunggal ketat, padding minimal |
| Mobile | 400–600px | Mobile standar, tata letak bertumpuk |
| Tablet Kecil | 600–768px | Grid 2 kolom mulai |
| Tablet | 768–1024px | Grid kartu penuh, padding diperluas |
| Desktop Kecil | 1024–1200px | Tata letak desktop standar |
| Desktop | 1200–1400px | Tata letak penuh, lebar konten maksimum |
| Desktop Besar | >1400px | Terpusat, margin generous |

### Target Sentuh
- Tombol menggunakan padding yang nyaman (8px–16px vertikal)
- Tautan navigasi 14px dengan spasi yang memadai
- Pill badge memiliki padding horizontal 10px untuk target ketuk
- Toggle menu mobile menggunakan tombol melingkar radius 50%

### Strategi Keruntuhan
- Hero: display 48px → menyusut, mempertahankan jarak negatif secara proporsional
- Navigasi: tautan horizontal + CTA → menu hamburger
- Kartu fitur: 3 kolom → 2 kolom → kolom tunggal bertumpuk
- Screenshot kode: pertahankan rasio aspek, mungkin scroll horizontal
- Logo trust bar: grid → scroll horizontal
- Footer: multi-kolom → kolom tunggal bertumpuk
- Spasi bagian: 80px+ → 48px pada mobile

### Perilaku Gambar
- Screenshot dasbor mempertahankan perlakuan border di semua ukuran
- Gradien hero menyederhanakan/melunak pada mobile
- Screenshot produk menggunakan gambar responsif dengan border radius konsisten
- Bagian lebar penuh mempertahankan perlakuan tepi ke tepi

## 9. Panduan Prompt Agent

### Referensi Warna Cepat
- CTA primer: Vercel Black (`#171717`)
- Latar belakang: Pure White (`#ffffff`)
- Teks tajuk: Vercel Black (`#171717`)
- Teks body: Gray 600 (`#4d4d4d`)
- Border (shadow): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Tautan: Link Blue (`#0072f5`)
- Focus ring: Focus Blue (`hsla(212, 100%, 48%, 1)`)

### Contoh Prompt Komponen
- "Buat bagian hero pada latar belakang putih. Tajuk pada 48px Geist bobot 600, line-height 1.00, letter-spacing -2.4px, warna #171717. Subjudul pada 20px Geist bobot 400, line-height 1.80, warna #4d4d4d. Tombol CTA gelap (#171717, radius 6px, padding 8px 16px) dan tombol ghost (putih, shadow-border rgba(0,0,0,0.08) 0px 0px 0px 1px, radius 6px)."
- "Desain kartu: latar belakang putih, tanpa border CSS. Gunakan tumpukan shadow: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radius 8px. Judul pada 24px Geist bobot 600, letter-spacing -0.96px. Body pada 16px bobot 400, #4d4d4d."
- "Buat pill badge: latar belakang #ebf5ff, teks #0068d6, radius 9999px, padding 0px 10px, 12px Geist bobot 500."
- "Buat navigasi: header putih sticky. Geist 14px bobot 500 untuk tautan, teks #171717. CTA pill gelap 'Start Deploying' rata kanan. Shadow-border di bawah: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Desain bagian alur kerja yang menampilkan tiga langkah: Develop (warna teks #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Setiap langkah: label 14px Geist Mono huruf besar + judul 24px Geist bobot 600 + deskripsi 16px bobot 400 dalam #4d4d4d."

### Panduan Iterasi
1. Selalu gunakan shadow-as-border alih-alih border CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` adalah fondasinya
2. Jarak antar huruf berskala dengan ukuran font: -2.4px pada 48px, -1.28px pada 32px, -0.96px pada 24px, normal pada 14px
3. Hanya tiga bobot: 400 (baca), 500 (interaksi), 600 (umumkan)
4. Warna bersifat fungsional, bukan dekoratif — warna alur kerja (Merah/Merah Muda/Biru) hanya menandai tahap pipeline
5. Ring dalam `#fafafa` dalam shadow kartu adalah yang memberikan cahaya dalam halus khas kartu Vercel
6. Geist Mono huruf besar untuk label teknis, Geist Sans untuk semua yang lain
