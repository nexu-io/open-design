# Design System Terinspirasi dari NVIDIA

> Category: Media & Konsumen
> Komputasi GPU. Energi hijau-hitam, estetika kekuatan teknis.

## 1. Tema Visual & Atmosfer

Situs web NVIDIA adalah pengalaman teknologi dengan kontras tinggi yang mengomunikasikan kekuatan komputasi mentah melalui restraint desain. Halaman ini dibangun di atas fondasi hitam pekat (`#000000`) dan putih (`#ffffff`), diperkuat oleh hijau khas NVIDIA (`#76b900`) -- sebuah warna yang begitu spesifik sehingga berfungsi sebagai sidik jari merek. Ini bukan hijau alam yang rimbun; ini adalah hijau elektrik berbias lime dari cahaya yang dirender GPU, sebuah warna yang berada di antara chartreuse dan kelly green yang langsung mengisyaratkan "NVIDIA" bagi siapa pun di dunia teknologi.

Keluarga font kustom NVIDIA-EMEA (dengan fallback Arial dan Helvetica) menciptakan suara tipografi yang bersih dan industrial. Heading berukuran 36px bold dengan line-height ketat 1.25 menghasilkan blok teks yang padat dan berwibawa. Font ini tidak memiliki kegembiraan geometris khas sans-serif Silicon Valley -- ia bersifat Eropa, pragmatis, dan berorientasi rekayasa. Teks isi berjalan pada 15-16px, nyaman dibaca namun tidak berlebihan, menjaga kesan bahwa ruang layar dioptimalkan seperti memori GPU.

Yang membedakan desain NVIDIA dari situs teknologi berlatar gelap lainnya adalah penggunaan aksen hijau yang disiplin. Warna `#76b900` muncul pada border (`2px solid #76b900`), garis bawah tautan (`underline 2px rgb(118, 185, 0)`), dan CTA -- tetapi tidak pernah sebagai latar belakang atau area permukaan besar pada konten utama. Hijau adalah sinyal, bukan permukaan. Dikombinasikan dengan sistem bayangan dalam (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) dan border radius minimal (1-2px), efek keseluruhan adalah presisi rekayasa perangkat keras yang dirender dalam piksel.

**Karakteristik Utama:**
- NVIDIA Green (`#76b900`) sebagai aksen murni -- hanya untuk border, garis bawah, dan sorotan interaktif
- Hitam (`#000000`) sebagai latar belakang dominan dengan teks putih (`#ffffff`) pada bagian gelap
- Font kustom NVIDIA-EMEA dengan fallback Arial/Helvetica -- industrial, Eropa, bersih
- Line-height ketat (1.25 untuk heading) menciptakan blok teks yang padat dan berwibawa
- Border radius minimal (1-2px) -- sudut tajam dan terstruktur di seluruh antarmuka
- Tombol berborder hijau (`2px solid #76b900`) sebagai pola interaktif utama
- Sistem ikon Font Awesome 6 Pro/Sharp dengan weight 900 untuk ikonografi yang tajam
- Arsitektur multi-framework (PrimeReact, Fluent UI, Element Plus) yang memungkinkan komponen interaktif yang kaya

## 2. Palet Warna & Perannya

### Merek Primer
- **NVIDIA Green** (`#76b900`): Tanda tangan -- border, garis bawah tautan, outline CTA, indikator aktif. Tidak pernah digunakan sebagai isian area permukaan besar.
- **Hitam Pekat** (`#000000`): Latar belakang halaman utama, teks pada permukaan terang, nada dominan.
- **Putih Murni** (`#ffffff`): Teks pada latar gelap, latar belakang bagian terang, permukaan kartu.

### Palet Merek Diperluas
- **NVIDIA Green Light** (`#bff230`): Aksen lime cerah untuk sorotan dan state hover.
- **Orange 400** (`#df6500`): Aksen hangat untuk peringatan, lencana unggulan, atau konteks terkait energi.
- **Yellow 300** (`#ef9100`): Aksen hangat sekunder, sorotan kategori produk.
- **Yellow 050** (`#feeeb2`): Permukaan hangat terang untuk latar belakang callout.

### Status & Semantik
- **Red 500** (`#e52020`): State error, aksi destruktif, peringatan kritis.
- **Red 800** (`#650b0b`): Merah dalam untuk latar belakang peringatan parah.
- **Green 500** (`#3f8500`): State sukses, indikator positif (lebih gelap dari hijau merek).
- **Blue 700** (`#0046a4`): Aksen informasional, alternatif hover tautan.

### Dekoratif
- **Purple 800** (`#4d1368`): Ungu dalam untuk ujung gradien, konteks premium/AI.
- **Purple 100** (`#f9d4ff`): Tint permukaan ungu terang.
- **Fuchsia 700** (`#8c1c55`): Aksen kaya untuk promosi khusus atau konten unggulan.

### Skala Netral
- **Gray 300** (`#a7a7a7`): Teks redup, label nonaktif.
- **Gray 400** (`#898989`): Teks sekunder, metadata.
- **Gray 500** (`#757575`): Teks tersier, placeholder, footer.
- **Gray Border** (`#5e5e5e`): Border halus, garis pembagi.
- **Near Black** (`#1a1a1a`): Permukaan gelap, latar belakang kartu pada halaman hitam.

### State Interaktif
- **Link Default (latar gelap)** (`#ffffff`): Tautan putih pada latar belakang gelap.
- **Link Default (latar terang)** (`#000000`): Tautan hitam dengan garis bawah hijau pada latar belakang terang.
- **Link Hover** (`#3860be`): Pergeseran biru saat hover pada semua varian tautan.
- **Button Hover** (`#1eaedb`): Sorotan teal untuk state hover tombol.
- **Button Active** (`#007fff`): Biru cerah untuk state tombol aktif/ditekan.
- **Focus Ring** (`#000000 solid 2px`): Outline hitam untuk fokus keyboard.

### Bayangan & Kedalaman
- **Card Shadow** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Bayangan ambient halus untuk kartu yang ditinggikan.

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `NVIDIA-EMEA`, dengan fallback: `Arial, Helvetica, sans-serif`
- **Font Ikon**: `Font Awesome 6 Pro` (weight 900 untuk ikon solid, 700 untuk regular)
- **Icon Sharp**: `Font Awesome 6 Sharp` (weight 300 untuk ikon light, 400 untuk regular)

### Hierarki

| Peran | Font | Ukuran | Weight | Line Height | Letter Spacing | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (ketat) | normal | Headline dengan dampak maksimum |
| Section Heading | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (ketat) | normal | Judul bagian, heading kartu |
| Sub-heading | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (longgar) | normal | Deskripsi fitur, subjudul |
| Card Title | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (ketat) | normal | Heading kartu dan modul |
| Body Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (longgar) | normal | Isi yang ditekankan, paragraf utama |
| Body | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Teks baca standar |
| Body Bold | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Label kuat, item navigasi |
| Body Small | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (longgar) | normal | Konten sekunder, deskripsi |
| Body Small Bold | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Konten sekunder yang ditekankan |
| Button Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (ketat) | normal | Tombol CTA utama |
| Button | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (ketat) | normal | Tombol standar |
| Button Compact | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (ketat) | 0.144px | Tombol kecil/ringkas |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Tautan navigasi |
| Link Uppercase | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, label navigasi |
| Caption | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadata, stempel waktu |
| Caption Small | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (ketat) | normal | Teks kecil, legal |
| Micro Label | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, lencana mungil |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (ketat) | normal | Teks UI terkecil |

### Prinsip
- **Bold sebagai suara default**: NVIDIA sangat mengandalkan weight 700 untuk heading, tombol, tautan, dan label. Weight 400 dicadangkan untuk teks isi dan deskripsi -- semua hal lain menggunakan bold, memancarkan kepercayaan diri dan otoritas.
- **Heading ketat, isi longgar**: Line-height heading secara konsisten adalah 1.25 (ketat), sementara teks isi dilonggarkan menjadi 1.50-1.67. Kontras ini menciptakan kepadatan visual di bagian atas blok konten dan keterbacaan yang nyaman dalam paragraf.
- **Uppercase untuk navigasi**: Label tautan menggunakan `text-transform: uppercase` dengan weight 700, menciptakan suara navigasi yang terbaca seperti label spesifikasi perangkat keras.
- **Tanpa tracking dekoratif**: Letter-spacing normal di seluruh antarmuka, kecuali untuk tombol ringkas (0.144px). Font itu sendiri membawa karakter industrial tanpa manipulasi tambahan.

## 4. Gaya Komponen

### Tombol

**Primer (Border Hijau)**
- Background: `transparent`
- Teks: `#000000`
- Padding: 11px 13px
- Border: `2px solid #76b900`
- Radius: 2px
- Font: 16px weight 700
- Hover: background `#1eaedb`, teks `#ffffff`
- Active: background `#007fff`, teks `#ffffff`, border `1px solid #003eff`, scale(1)
- Focus: background `#1eaedb`, teks `#ffffff`, outline `#000000 solid 2px`, opacity 0.9
- Penggunaan: CTA utama ("Learn More", "Explore Solutions")

**Sekunder (Border Hijau Tipis)**
- Background: transparent
- Border: `1px solid #76b900`
- Radius: 2px
- Penggunaan: Aksi sekunder, CTA alternatif

**Ringkas / Inline**
- Font: 14.4px weight 700
- Letter-spacing: 0.144px
- Line-height: 1.00
- Penggunaan: CTA inline, navigasi ringkas

### Kartu & Kontainer
- Background: `#ffffff` (terang) atau `#1a1a1a` (bagian gelap)
- Border: none (tepi bersih) atau `1px solid #5e5e5e`
- Radius: 2px
- Bayangan: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` untuk kartu yang ditinggikan
- Hover: intensifikasi bayangan
- Padding: 16-24px internal

### Tautan
- **Pada Latar Gelap**: `#ffffff`, tanpa garis bawah, hover beralih ke `#3860be`
- **Pada Latar Terang**: `#000000` atau `#1a1a1a`, garis bawah `2px solid #76b900`, hover beralih ke `#3860be`, garis bawah dihapus
- **Tautan Hijau**: `#76b900`, hover beralih ke `#3860be`
- **Tautan Redup**: `#666666`, hover beralih ke `#3860be`

### Navigasi
- Latar belakang hitam pekat (`#000000`)
- Logo rata kiri, wordmark NVIDIA yang menonjol
- Tautan: NVIDIA-EMEA 14px weight 700 uppercase, `#ffffff`
- Hover: pergeseran warna, tanpa perubahan garis bawah
- Dropdown mega-menu untuk kategori produk
- Sticky saat di-scroll dengan backdrop

### Perlakuan Gambar
- Render produk/GPU sebagai gambar hero, sering full-width
- Gambar screenshot dengan bayangan halus untuk kedalaman
- Overlay gradien hijau pada bagian hero gelap
- Kontainer avatar melingkar dengan radius 50%

### Komponen Khas

**Kartu Produk**
- Kartu putih bersih atau gelap dengan radius minimal (2px)
- Border aksen hijau atau garis bawah pada judul
- Pola heading bold + deskripsi lebih ringan
- CTA dengan border hijau di bagian bawah

**Tabel Spesifikasi Teknis**
- Tata letak grid industrial
- Latar belakang baris bergantian (pergeseran abu-abu halus)
- Label bold, nilai regular
- Sorotan hijau untuk metrik utama

**Banner Cookie/Persetujuan**
- Posisi tetap di bagian bawah
- Tombol bulat (radius 2px)
- Perlakuan border abu-abu

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Nilai padding utama: 8px, 11px, 13px, 16px, 24px, 32px
- Spasi antar bagian: padding vertikal 48-80px

### Grid & Kontainer
- Lebar konten maksimum: sekitar 1200px (terkontainer)
- Bagian hero full-width dengan teks terkontainer
- Bagian fitur: grid 2-3 kolom untuk kartu produk
- Satu kolom untuk konten artikel/blog
- Tata letak sidebar untuk dokumentasi

### Filosofi Ruang Kosong
- **Kepadatan yang bertujuan**: NVIDIA menggunakan spasi yang lebih ketat dari situs SaaS pada umumnya, mencerminkan kepadatan konten teknis. Ruang kosong ada untuk memisahkan konsep, bukan menciptakan kekosongan yang mewah.
- **Ritme bagian**: Bagian gelap berselang-seling dengan bagian putih, menggunakan warna latar belakang (bukan hanya spasi) untuk memisahkan blok konten.
- **Kepadatan kartu**: Kartu produk berdekatan satu sama lain dengan jarak 16-20px, menciptakan kesan katalog bukan galeri.

### Skala Border Radius
- Mikro (1px): Span inline, elemen mungil
- Standar (2px): Tombol, kartu, kontainer, input -- default untuk hampir semua elemen
- Lingkaran (50%): Gambar avatar, indikator tab melingkar

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa bayangan | Latar halaman, teks inline |
| Halus (Level 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Kartu standar, modal |
| Border (Level 1b) | `1px solid #5e5e5e` | Pembagi konten, border bagian |
| Aksen hijau (Level 2) | `2px solid #76b900` | Elemen aktif, CTA, item terpilih |
| Fokus (Aksesibilitas) | outline `2px solid #000000` | Cincin fokus keyboard |

**Filosofi Bayangan**: Sistem kedalaman NVIDIA minimal dan utilitarian. Pada dasarnya hanya ada satu nilai bayangan -- blur ambient 5px pada opasitas 30% -- yang digunakan secara hemat untuk kartu dan modal. Sinyal kedalaman utama bukan bayangan, melainkan _kontras warna_: latar hitam bersebelahan dengan bagian putih, border hijau pada permukaan hitam. Ini menciptakan lapisan visual seperti perangkat keras di mana kedalaman berasal dari perbedaan material, bukan cahaya yang disimulasikan.

### Kedalaman Dekoratif
- Sapuan gradien hijau di belakang konten hero
- Gradien gelap-ke-lebih-gelap (hitam ke near-black) untuk transisi bagian
- Tanpa efek glassmorphism atau blur -- kejernihan lebih diutamakan daripada atmosfer

## 7. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Small | <375px | Satu kolom ringkas, padding dikurangi |
| Mobile | 375-425px | Tata letak mobile standar |
| Mobile Large | 425-600px | Mobile lebih lebar, sedikit petunjuk 2 kolom |
| Tablet Small | 600-768px | Grid 2 kolom mulai muncul |
| Tablet | 768-1024px | Grid kartu penuh, navigasi diperluas |
| Desktop | 1024-1350px | Tata letak desktop standar |
| Large Desktop | >1350px | Lebar konten maksimum, margin luas |

### Target Sentuh
- Tombol menggunakan padding 11px 13px untuk target ketuk yang nyaman
- Tautan navigasi berukuran 14px uppercase dengan spasi yang memadai
- Tombol berborder hijau memberikan target sentuh berkontras tinggi pada latar gelap
- Mobile: navigasi hamburger mengkerut dengan overlay layar penuh

### Strategi Pengkerutan
- Hero: heading 36px mengecil secara proporsional
- Navigasi: navigasi horizontal penuh mengkerut menjadi menu hamburger pada ~1024px
- Kartu produk: 3 kolom ke 2 kolom ke satu kolom bertumpuk
- Footer: grid multi-kolom mengkerut menjadi satu kolom bertumpuk
- Spasi bagian: 64-80px berkurang menjadi 32-48px di mobile
- Gambar: pertahankan rasio aspek, skalakan ke lebar kontainer

### Perilaku Gambar
- Render GPU/produk mempertahankan resolusi tinggi di semua ukuran
- Gambar hero skalakan secara proporsional dengan viewport
- Gambar kartu menggunakan rasio aspek yang konsisten
- Bagian gelap full-bleed mempertahankan perlakuan tepi ke tepi

## 8. Perilaku Responsif (Diperluas)

### Penskalaan Tipografi
- Display 36px mengecil menjadi ~24px di mobile
- Section heading 24px mengecil menjadi ~20px di mobile
- Teks isi mempertahankan 15-16px di semua breakpoint
- Teks tombol mempertahankan 16px untuk target ketuk yang konsisten

### Strategi Bagian Gelap/Terang
- Bagian gelap (latar hitam, teks putih) berselang-seling dengan bagian terang (latar putih, teks hitam)
- Aksen hijau tetap konsisten di kedua jenis permukaan
- Pada gelap: tautan berwarna putih, garis bawah berwarna hijau
- Pada terang: tautan berwarna hitam, garis bawah berwarna hijau
- Pergantian ini menciptakan ritme scroll alami dan pengelompokan konten

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- Aksen utama: NVIDIA Green (`#76b900`)
- Latar gelap: True Black (`#000000`)
- Latar terang: Pure White (`#ffffff`)
- Teks heading (latar gelap): Putih (`#ffffff`)
- Teks heading (latar terang): Hitam (`#000000`)
- Teks isi (latar terang): Hitam (`#000000`) atau Near Black (`#1a1a1a`)
- Teks isi (latar gelap): Putih (`#ffffff`) atau Gray 300 (`#a7a7a7`)
- Hover tautan: Biru (`#3860be`)
- Aksen border: `2px solid #76b900`
- Hover tombol: Teal (`#1eaedb`)

### Contoh Prompt Komponen
- "Buat bagian hero pada latar hitam. Headline berukuran 36px NVIDIA-EMEA weight 700, line-height 1.25, warna #ffffff. Subjudul berukuran 18px weight 400, line-height 1.67, warna #a7a7a7. Tombol CTA dengan background transparent, border 2px solid #76b900, radius 2px, padding 11px 13px, teks #ffffff. Hover: background #1eaedb, teks putih."
- "Desain kartu produk: background putih, border-radius 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Judul berukuran 20px NVIDIA-EMEA weight 700, line-height 1.25, warna #000000. Isi berukuran 15px weight 400, line-height 1.67, warna #757575. Aksen garis bawah hijau pada judul: border-bottom 2px solid #76b900."
- "Bangun navigation bar: background #000000, sticky top. Logo NVIDIA rata kiri. Tautan berukuran 14px NVIDIA-EMEA weight 700 uppercase, warna #ffffff. Hover: warna #3860be. Tombol CTA berborder hijau rata kanan."
- "Buat bagian fitur gelap: background #000000. Label bagian berukuran 14px weight 700 uppercase, warna #76b900. Heading berukuran 24px weight 700, warna #ffffff. Deskripsi berukuran 16px weight 400, warna #a7a7a7. Tiga kartu produk dalam satu baris dengan jarak 20px."
- "Desain footer: background #000000. Tata letak multi-kolom dengan grup tautan. Tautan berukuran 14px weight 400, warna #a7a7a7. Hover: warna #76b900. Bar bawah dengan teks legal berukuran 12px, warna #757575."

### Panduan Iterasi
1. Selalu gunakan `#76b900` sebagai aksen, jangan pernah sebagai isian latar belakang -- ini adalah warna sinyal untuk border, garis bawah, dan sorotan
2. Tombol secara default transparan dengan border hijau -- latar belakang terisi hanya muncul pada state hover/active
3. Weight 700 adalah suara dominan untuk semua elemen interaktif dan heading; 400 hanya untuk paragraf isi
4. Border radius adalah 2px untuk semua elemen -- pembulatan minimal yang tajam ini adalah inti dari estetika industrial
5. Bagian gelap menggunakan teks putih; bagian terang menggunakan teks hitam -- aksen hijau bekerja identik pada keduanya
6. Hover tautan selalu `#3860be` (biru) terlepas dari warna default tautan
7. Line-height 1.25 untuk heading, 1.50-1.67 untuk teks isi -- pertahankan kontras ini untuk hierarki visual
8. Navigasi menggunakan uppercase 14px bold -- tipografi berlabel perangkat keras ini adalah bagian dari suara merek
