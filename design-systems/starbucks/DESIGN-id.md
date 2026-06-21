# Design System Inspired by Starbucks

> Category: E-Commerce & Retail
> Merek ritel kopi global. Sistem hijau empat tingkat, kanvas krem hangat, tombol full-pill.

## 1. Visual Theme & Atmosphere

Sistem desain Starbucks adalah **flagship ritel yang hangat dan percaya diri** dengan warna hijau celemek toko yang menyelimuti setiap permukaan. Kanvasnya bergantian antara krem netral-hangat (`#f2f0eb`) dan putih keramik (`#edebe9`) — warna yang merujuk pada material toko sesungguhnya: serbet kertas, dinding kafe, dan finishing kayu — sementara **Starbucks Green** (`#006241`) menjadi jangkar momen merek pada hero band, CTA, dan pengalaman Rewards. Hijau hadir dalam empat nuansa terkalibrasi (Starbucks, Accent, House, Uplift) yang masing-masing dipetakan ke peran permukaan tertentu, dan emas (`#cba258`) hanya muncul di sekitar upacara status Rewards — bukan sebagai aksen umum.

Tipografi membawa sebagian besar suara merek. Typeface proprietary **SoDoSans** (kustom untuk Starbucks) hadir di hampir setiap permukaan dengan letter-spacing ketat `-0.16px` — tampilannya percaya diri dan ramah, bukan keras seperti majalah mode. Yang tidak biasa: halaman Rewards beralih ke serif hangat (`"Lander Tall", "Iowan Old Style", Georgia`) untuk momen headline tertentu, secara halus menggemakan nuansa nostalgia papan tulis kafe. Dan halaman Careers menggunakan skrip tulisan tangan (`"Kalam", "Comic Sans MS", cursive`) untuk sentuhan nama di cangkir personal. Tiga typeface, tiga konteks — sistem ini berdisiplin tentang kapan masing-masing muncul.

Permukaan bernapas melalui geometri melengkung. Setiap tombol adalah full-pill 50px. Kartu menggunakan persegi panjang dengan sudut membulat 12px. CTA mengambang "Frap" — tombol pemesanan lingkaran 56px dengan warna Green Accent (`#00754A`) — adalah gerakan kedalaman khas produk: mengambang di kanan bawah dengan tumpukan bayangan berlapis (`0 0 6px rgba(0,0,0,0.24)` dasar + `0 8px 12px rgba(0,0,0,0.14)` ambient) dan menyusut via `scale(0.95)` saat ditekan. Elevasi secara keseluruhan sangat terkendali — bayangan kartu tetap pada alpha bisikan `0.14/0.24`, navigasi global mendapat tumpukan bayangan tiga lapisan yang tenang. Keseluruhan sistem terasa seperti papan penanda kafe yang bersih: mudah dibaca, hangat, dan tidak pernah berteriak.

**Key Characteristics:**
- Sistem merek hijau empat tingkat (Starbucks / Accent / House / Uplift) yang masing-masing dipetakan ke peran permukaan berbeda — bukan "hijau merek" tunggal
- Emas diperuntukkan hanya untuk momen upacara status Rewards; tidak pernah sebagai aksen serba guna
- Kanvas netral-hangat (`#f2f0eb` / `#edebe9`) alih-alih putih dingin — merujuk pada material kafe
- Typeface proprietary kustom (SoDoSans) dengan letter-spacing ketat `-0.16px` sebagai suara universal
- Pergantian jenis huruf sesuai konteks: serif (Lander Tall) untuk Rewards, skrip (Kalam) untuk nama cangkir di Careers
- Tombol full-pill (`50px` radius) universal, `scale(0.95)` saat ditekan aktif adalah micro-interaction khas
- CTA lingkaran mengambang "Frap" (`56px`, warna Green Accent, tumpukan bayangan berlapis) — elemen elevasi khas produk
- Permukaan kartu hadiah dirancang sebagai **produk fisik yang difoto** — setiap kartu adalah foto ilustrasi berbeda, bukan grafis yang dibuat-buat
- Radius kartu 12px + bayangan lembut bisikan menjaga kartu konten tetap datar-plus-sedikit-terangkat
- Skala spasi berbasis rem yang berpusat pada 1.6rem (~16px) = `--space-3`, naik hingga 6.4rem (~64px)

**Ritme halaman color-block:** Hero krem → Bagian konten putih → Pita fitur hijau gelap (`#1E3932`) dengan teks putih → Zona utilitas krem → Footer hijau gelap (`#1E3932`) dengan teks emas/putih — pengantar seperti espresso gelap mengelilingi isi yang cerah.

## 2. Color Palette & Roles

**Halaman sumber yang dianalisis:** beranda, rewards, kartu hadiah, detail produk (Pink Energy Drink), nutrisi produk (Cold Brew).

### Primary

- **Starbucks Green** (`#006241`): Hijau merek bersejarah. Digunakan pada heading h1, header bagian utama di halaman Rewards, dan sebagai sinyal merek utama di mana pun satu warna dominan diperlukan.
- **Green Accent** (`#00754A`): Hijau yang sedikit lebih cerah dan bercahaya. Warna CTA terisi utama ("Explore our afternoon menu", "See the spring menu") dan isian tombol lingkaran Frap mengambang.
- **House Green** (`#1E3932`): Hijau merek hampir hitam yang dalam. Permukaan footer, latar belakang feature-band, permukaan gelap status reward, dan hero band headline "Free coffee is just the beginning" di Rewards.
- **Green Uplift** (`#2b5148`): Hijau sedang-gelap sekunder yang digunakan dengan hemat pada aksen dekoratif dan momen gradien gelap.
- **Green Light** (`#d4e9e2`): Sentuhan mint pucat yang digunakan untuk tint state form-valid dan permukaan utilitas hijau terang.

### Secondary & Accent

- **Gold** (`#cba258`): Dicadangkan hampir eksklusif untuk upacara status Rewards — callout tingkatan Gold, lencana kemitraan (SkyMiles, Bonvoy), dan aksen bernuansa premium. Tidak pernah sebagai warna merek serba guna.
- **Gold Light** (`#dfc49d`): Emas lebih lembut untuk lapisan latar belakang pada bagian tingkatan emas.
- **Gold Lightest** (`#faf6ee`): Lapisan permukaan halaman krem-emas yang digunakan di bawah bagian kemitraan pada halaman Rewards — menghubungkan aksen emas kembali ke sistem netral hangat.

### Surface & Background

- **White** (`#ffffff`): Permukaan kartu dan modal utama. Juga isian kartu pada ubin kartu hadiah.
- **Neutral Cool** (`#f9f9f9`): Permukaan abu-abu dingin halus yang digunakan pada menu dropdown ("Account" dropdown), pembungkus form-card, dan kontainer utilitas tenang.
- **Neutral Warm** (`#f2f0eb`): Krem hangat sebagai **kanvas halaman utama** untuk zona utilitas Rewards dan hero band.
- **Ceramic** (`#edebe9`): Krem yang sedikit lebih hangat/gelap untuk pemisah zona, lapisan lembut bagian halaman, dan pita kemitraan Rewards.
- **Black** (`#000000`): Tinta gelap yang dicadangkan untuk strip CTA di bagian atas halaman ("Join now") dan tombol sign-in navigasi atas kontras tinggi.

### Neutrals & Text

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Warna heading dan teks isi utama pada permukaan terang. Bukan hitam murni — hitam dengan opasitas 87% yang tampak lebih hangat.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Teks sekunder/metadata pada permukaan terang.
- **Text White** (`rgba(255, 255, 255, 1)`): Heading/teks isi utama pada permukaan hijau gelap.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Teks sekunder pada permukaan hijau gelap — deskripsi tautan footer, teks keterangan.
- **Rewards Green** (`#33433d`): Hijau abu-abu kusam khusus yang hanya digunakan pada blok teks halaman Rewards — warna baca yang sedikit lebih "berdebu" dari Text Black yang menandai "permukaan reward" tanpa menggunakan Starbucks Green penuh.

### Semantic & Accent

- **Red** (`#c82014`): Status error dan destruktif (form tidak valid, tindakan destruktif).
- **Yellow** (`#fbbc05`): Status peringatan, sentuhan merek lama.
- **Green Light** (`#d4e9e2` pada opasitas 33% = `hsl(160 32% 87% / 33%)`): Tint latar belakang bidang form yang valid.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Tint bidang tidak valid pada form.

### Black / White Alpha Ladders

Dua skala tembus cahaya paralel untuk overlay dan penggunaan teks sekunder:
- `rgba(0,0,0,0.06)` hingga `rgba(0,0,0,0.90)` dalam langkah 10% — untuk overlay gelap pada permukaan terang
- `rgba(255,255,255,0.10)` hingga `rgba(255,255,255,0.90)` dalam langkah 10% — untuk overlay terang pada permukaan gelap

### Gradient System

Tidak ada token gradien struktural yang ditemukan. Hierarki permukaan menggunakan warna blok solid — sistem mengandalkan palet permukaan krem/hijau lima tingkat daripada gradien.

## 3. Typography Rules

### Font Family

- **Primary:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — typeface korporat proprietary Starbucks, digunakan di hampir setiap permukaan
- **Loading Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — yang dilihat pengguna sebelum SoDoSans termuat
- **Rewards Serif:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — digunakan pada momen headline halaman Rewards tertentu untuk nuansa editorial hangat
- **Careers Script:** `"Kalam", "Comic Sans MS", cursive` — digunakan secara eksklusif untuk sentuhan dekoratif "nama cangkir" di halaman Careers, merujuk pada nama tulisan tangan di cangkir Starbucks

Tidak ada set stylistik OpenType yang diaktifkan secara eksplisit pada `:root`.

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Display Rewards/hero terbesar |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Heading hero sekunder |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Headline bagian landing |
| H1 | 24px | 600 | 36px | -0.16px | Heading utama Starbucks-Green |
| H2 | 24px | 400 | 36px | -0.16px | Judul bagian bobot reguler dalam Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Teks pengantar hero, badan feature-band |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Teks isi default |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Label tombol, metadata, label form |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Status float-label aktif, teks keterangan mikro |
| Button Label | 14–16px | 400–600 | 1.2 | -0.01em | Semua label tombol pill |

**Token letter-spacing:**
- `letterSpacingNormal`: `-0.01em` (default — ketat, khas)
- `letterSpacingLoose`: `0.1em` (huruf kapital yang ditekankan)
- `letterSpacingLooser`: `0.15em` (label gaya huruf kapital, penekanan ekstrem)

**Token line-height:**
- `lineHeightNormal`: `1.5` (isi)
- `lineHeightCompact`: `1.2` (display/tombol)

### Principles

- **Tracking negatif ketat (`-0.01em`)** diterapkan hampir secara universal — seluruh produk terbaca sedikit terkompresi, yang memberikan SoDoSans kehadiran yang percaya diri tanpa terasa sempit.
- **Pergeseran bobot membawa hierarki, bukan pergeseran ukuran.** H1 dan H2 berbagi ukuran 24px/36px yang sama; hanya bobot (600 vs 400) dan warna (Starbucks-Green vs Text Black) yang membedakannya.
- **Token ukuran menggunakan rem, berpusat pada `1rem = 10px`** di situs ini (melalui trik root `font-size: 62.5%`). Jadi `1.6rem` = 16px, `2.4rem` = 24px, dst. Skalanya semantis (textSize-1 hingga textSize-10), bukan nilai piksel sewenang-wenang.
- **Penggantian typeface sesuai konteks** — serif di Rewards, skrip di Careers — bersifat disengaja dan terlokalisasi. Jangan mencampurnya dengan sans utama dalam permukaan yang sama.
- **Teks isi tidak pernah murni hitam** — berada pada `rgba(0,0,0,0.87)` untuk menyesuaikan suhu kanvas netral-hangat.

### Note on Font Substitutes

SoDoSans adalah proprietary Starbucks (berlisensi dari House Industries, tidak tersedia untuk umum). Pengganti open-source yang wajar:
- **Inter** (Google Fonts) — proporsi geometris humanis serupa, rentang bobot lebar
- **Manrope** — sedikit lebih bulat, nuansa percaya diri serupa
- **Nunito Sans** — lebih hangat, baik untuk pengganti merek "kafe"

Jika mengganti, verifikasi bahwa tracking ketat `-0.01em` / `-0.16px` masih terbaca baik; beberapa font open-source memerlukan `-0.005em` sebagai gantinya.

Lander Tall (serif Rewards) adalah kustom — pengganti open-source: **Iowan Old Style** (sudah ada di fallback), **Lora**, atau **Source Serif Pro**. Kalam (skrip Careers) tersedia langsung di Google Fonts.

## 4. Component Stylings

### Buttons

**1. Primary Filled — "Explore our afternoon menu / Sign up for free"**
- Background: `#00754A` (Green Accent)
- Text: `#ffffff`
- Border: `1px solid #00754A`
- Radius: `50px` (full pill)
- Padding: `7px 16px`
- Font: SoDoSans, 16px, weight 600, letter-spacing `-0.01em`
- Active state: `transform: scale(0.95)` via `--buttonActiveScale`
- Transition: `all 0.2s ease`

**2. Primary Outlined — "Give them a try / Start an order"**
- Background: transparent
- Text: `#00754A` (Green Accent)
- Border: `1px solid #00754A`
- Radius/padding/aktif/transisi sama dengan Primary Filled

**3. Black Filled — "Join now"**
- Background: `#000000`
- Text: `#ffffff`
- Border: `1px solid #000000`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600
- Digunakan pada strip join di bagian atas halaman dan momen konversi serupa

**4. Dark Outlined — "Sign in"**
- Background: transparent
- Text: `rgba(0, 0, 0, 0.87)` (Text Black)
- Border: `1px solid rgba(0, 0, 0, 0.87)`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600

**5. Green-on-Green Inverted — "See the spring menu"**
- Background: `#ffffff`
- Text: `#00754A`
- Border: `1px solid #ffffff`
- Digunakan ketika permukaan di belakang tombol adalah pita House Green gelap — tombol putih dengan teks hijau alih-alih pil hijau terisi pada latar hijau

**6. Outlined on Dark — "Learn more / Order now"**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #ffffff`
- Digunakan pada feature band hijau gelap untuk tindakan sekunder yang dipasangkan dengan CTA terisi putih

**7. Consent Agree (varian hijau gelap)**
- Background: `rgb(0, 130, 72)` (varian hijau spesifik yang digunakan dalam modul persetujuan cookie)
- Text: `#ffffff`
- Tidak ada border, radius `50px`, padding `7px 16px`, 14px / weight 400
- Sedikit lebih cerah dari Green Accent — dicadangkan untuk tindakan Agree pada banner persetujuan

**8. Frap — Floating Circular Order Button**
- Background: `#00754A` (Green Accent)
- Icon: `#ffffff`
- Size: `5.6rem / 56px` (standar), `4rem / 40px` (varian mini)
- Radius: `50%` (lingkaran penuh)
- Posisi tetap kanan bawah, offset sentuh `-0.8rem` untuk kenyamanan ketukan ekstra
- Tumpukan bayangan: dasar `0 0 6px rgba(0,0,0,0.24)` + ambient `0 8px 12px rgba(0,0,0,0.14)`
- Active state: bayangan ambient memudar ke `0 8px 12px rgba(0,0,0,0)`
- Ini adalah elemen elevasi khas produk — mengambang di atas setiap permukaan yang digulir

**9. Full-width Feedback Tab — "Provide feedback"**
- Background: `#00754A`
- Text: `#ffffff`
- Radius: `12px 12px 0px 0px` (hanya bagian atas melengkung)
- Padding: `8px 16px`
- Font: 14px, weight 400
- Diposisikan tetap di kanan bawah dalam, menempel pada tepi viewport

### Cards & Containers

**Content Card (default)**
- Background: `#ffffff` (`--cardBackgroundColor`)
- Radius: `12px` (`--cardBorderRadius`)
- Shadow: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Digunakan untuk: kartu fitur, ubin item menu, panel status reward

**Gift Card Tile**
- Background: foto ilustrasi mengisi kartu (tidak ada latar solid)
- Radius: serupa dengan kartu (`~12px`, sudut sedikit lebih ketat)
- Shadow: lebih ringan dari kartu default — ini diperlakukan seperti kartu fisik yang diletakkan di atas kanvas
- Diberi label berdasarkan kategori di atas grid kartu (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Rewards Status Cards (khas halaman Rewards)**
- Grid tiga kolom: Bronze / Gold / Silver-ish — masing-masing panel hijau gelap (`#1E3932`) dengan:
  - Cincin header gradien/warna berwarna
  - Lencana "Level" bernomor
  - Judul status dalam SoDoSans besar weight 600
  - Daftar bintang/manfaat dalam teks putih/putih-tembus
  - Keterangan progresif "As you earn more stars…" di bagian bawah

**Partnership Card (Rewards)**
- Background: `#faf6ee` (Gold Lightest) permukaan krem-hangat
- Konten: logo mitra ("SkyMiles", "Bonvoy") di tengah, dengan teks deskriptif di bawah
- Radius dan bayangan mengikuti spesifikasi kartu default

**Dropdown Menu (dropdown Account, top-nav)**
- Background: `#f9f9f9` (Neutral Cool)
- Item menu pada `24px / weight 400` dalam Text Black
- Tidak ada border — hanya pergeseran permukaan latar terhadap nav putih

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding atas: `8.8rem` (`--modalTopPadding`) — menyisakan ruang untuk tombol tutup / header
- Padding vertikal gabungan: `11.2rem`
- Radius mewarisi dari spesifikasi kartu (`12px`)

### Inputs & Forms

**Floating Label Input**
- Label mengambang di atas border input saat difokus/terisi
- Ukuran font label desktop: default `1.9rem`, beranimasi ke `1.4rem` saat aktif
- Ukuran font label mobile: default `1.6rem`, beranimasi ke `1.3rem` saat aktif
- Offset horizontal label: `12px` dari kiri
- Terjemahan label aktif: naik hingga `-12px` dengan terjemahan Y `-50%`
- Padding bidang: `12px`
- Padding horizontal form: `1.6rem`
- Validasi: bidang valid mendapat tint `rgba(green-light, 0.33)`; bidang tidak valid mendapat tint `rgba(red, 0.05)`
- Transisi: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` pada checked-input

**Option Icon (checkbox/radio)**
- Padding: `3px` dalam
- Menggunakan animasi cubic-bezier checked-input di atas (kurva overshoot `2.32` yang sedikit "pegas")

### Navigation

**Global Nav (bar atas)**
- Posisi tetap dengan tinggi progresif: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Tumpukan bayangan: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — tiga lapisan angkat lembut
- Kiri: logo wordmark Starbucks, digeser `99px` (md) / `131px` (lg) dari tepi kiri
- Tautan utama inline dalam SoDoSans weight 400–600: Menu · Rewards · Gift Cards
- Kanan: tautan Find a store + Sign in (outlined) + Join now (black filled)

**Sub-nav (bar kedua, mis. internal Rewards)**
- Tinggi: `53px` (global subnav) / `48px` (internal subnav)
- Biasanya grup tab horizontal di bawah nav global

**Mobile Nav**
- Menyusut menjadi drawer hamburger di bawah breakpoint tablet
- Tombol mengambang Frap tetap ada di kanan bawah terlepas dari status nav

### Image Treatment

- **Hero photography**: Foto produk (minuman dalam gelas bening dengan latar berwarna — koral, sage, amber hangat) menempati ~40vw dari tata letak hero split; teks menempati 60vw lainnya (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Gift card illustrations**: Setiap kartu adalah foto ilustrasi berbeda (nuansa cat, tampak seperti gambar tangan, palet warna hangat). Tidak pernah menggunakan grafis generik yang dibuat-buat.
- **Rewards ceremony imagery**: Foto layar Starbucks Rewards App yang dipegang di tangan, komposisi miring — foto produk dalam konteks.
- **Menu thumbnails**: Foto produk persegi atau 4:3 dengan latar putih/krem bersih, sedikit bayangan jatuh lembut di sekitar gelas.
- **Image fade-in**: Transisi `opacity 0.3s ease-in` saat gambar dimuat (`--imageFadeTransition`).

### Feature Band (strip hero hijau gelap)

Pita `#1E3932` (House Green) lebar penuh dengan:
- Kiri: headline putih + subhead + baris CTA
- Kanan: foto produk atau ilustrasi
- Rasio split ~40/60 atau 50/50 tergantung bagian
- Teks putih di seluruh bagian dengan `rgba(255,255,255,0.70)` untuk teks sekunder
- CTA mengikuti pasangan Green-on-Green Inverted (terisi putih) + Outlined on Dark (garis putih)

### Expander / Accordion

- Durasi: `300ms` (`--expanderDuration`)
- Kurva timing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — ease-out yang terukur
- Digunakan untuk bagian FAQ di Rewards dan halaman hadiah

### Cookie Consent Module

Kartu modal hijau gelap di bagian atas halaman dengan tombol "Agree" (terisi hijau) dan "Manage preferences" (outlined). Muncul saat kunjungan pertama; dapat ditutup.

### Product Detail Components (kluster khas PDP)

Kluster komponen berulang yang digunakan pada halaman produk menu (mis., `/menu/product/40498/iced` untuk detail minuman, `/menu/product/.../nutrition` untuk fakta nutrisi). Ini memperluas inventaris komponen tanpa mengubah token.

**Size Options Selector**
- Baris horizontal 4 tombol ikon cangkir (Tall / Grande / Venti / Trenta)
- Setiap item: ikon siluet cangkir di atas, nama ukuran di bawah (16/700 dalam Starbucks-Green), keterangan ons cairan (13/400 dalam Text Black Soft)
- Active state: garis luar cincin lingkaran hijau (`2px solid #00754A`) mengelilingi ikon cangkir yang dipilih
- Tidak aktif: tidak ada cincin, tipografi sama
- Baris lebar penuh, jarak yang sama
- Radius kontainer: `12px` atau datar; ikon individual adalah `50%` lingkaran
- Padding: `16px 24px` internal

**Add-in / Milk Select (persegi panjang outlined)**
- Background: `#ffffff`
- Border: `1px solid #d6dbde` (Input Border)
- Radius: `4px`
- Lebar penuh di kolomnya
- Label mengambang di atas border atas: "Add-ins" / "Milk" / "Add-ins" — 13/700 dalam Text Black, huruf kapital, letter-spacing `0.325px`
- Nilai ditampilkan di tengah (mis., "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Ikon chevron-bawah di sisi kanan dalam Text Black Soft
- Fokus: border bergeser ke Green Accent (`#00754A`)

**Numeric Stepper**
- Tertanam di dalam baris Add-in saat diperlukan kuantitas (mis., Strawberry Fruit Inclusions scoop)
- Tombol `−` minus + nomor hitungan + tombol `+` plus, semua inline di kanan label
- Tombol: lingkaran `32×32px` dengan border `1px solid #d6dbde`, ikon abu-abu netral
- Nomor hitungan: 16/700 Text Black di tengah

**Customize Button**
- Background: `#ffffff`
- Text: `#00754A` (Green Accent)
- Border: `1.5px solid #00754A`
- Radius: `50px` (full pill)
- Padding: `14px 40px` (lebih besar dari pil default — ini adalah tindakan primer sekunder)
- Label: "Customize" dengan ikon kerlip emas ✨ disisipkan di kiri
- Digunakan untuk: memasuki alur kustomisasi minuman setelah pemilihan ukuran/susu

**Add to Order Button (PDP)**
- Background: `#00754A` (Green Accent)
- Text: `#ffffff`
- Radius: `50px`
- Padding: `14px 32px`
- Disematkan di kanan atas kartu produk dan/atau disejajarkan ke kanan dalam pita ketersediaan toko
- Perilaku aktif scale(0.95) yang sama seperti CTA primer lainnya

**Rewards Cost Pill — "200★ item"**
- Background: transparent
- Border: `1px solid #cba258` (Gold)
- Text: `#cba258` (Gold)
- Radius: `50px` (full pill)
- Padding: `4px 12px`
- Konten: "200★ item" di mana `★` adalah simbol bintang terisi kecil — menunjukkan Stars Rewards yang diperlukan untuk menukarkan item ini
- Font: Proxima Nova 13/700 dengan letter-spacing `0.5px`
- Hanya digunakan pada produk yang dapat ditukar dengan Rewards

**Product Description Band**
- Pita hijau gelap lebar penuh (`#1E3932` House Green)
- Berisi dari atas ke bawah:
  1. Rewards Cost Pill (emas) jika berlaku
  2. Teks isi deskripsi produk dalam putih (16/400/1.5)
  3. Ringkasan nutrisi inline ("140 calories, 25g sugar, 2.5g fat") dengan tooltip ikon-info — 14/700 putih
  4. Tombol pil outlined-white-on-green "Full nutrition &amp; ingredients list"
- Padding: `32px` vertikal
- Muncul di bawah pita header produk utama

**Ingredients / Nutrition Table**
- Tata letak dua kolom pada halaman Nutrisi
- Kolom kiri: header "Ingredients" + daftar atau blok teks placeholder "Not available for this item" dengan paragraf penjelasan dalam Text Black Soft 14/400
- Kolom kanan: header "Nutrition" + baris label/nilai
- Setiap baris: label nutrisi (Proxima Nova 14/400) di kiri, nilai (mis., "140 calories", "25g", "205 mg**") di kanan, dipisahkan oleh garis rambut `1px solid #e7e7e7` di bawah
- Catatan kaki untuk penanda kafein/asterisk dalam 13/400 Text Black Soft di bagian bawah
- Pola yang dapat digunakan kembali untuk tabel fakta nutrisi yang sesuai regulasi

**Store Availability Selector**
- Muncul pada feature band hijau gelap di atas baris opsi ukuran
- Persegi panjang melengkung lebar penuh dengan interior putih tembus
- Text: "For item availability, choose a store" dalam putih, 14/400
- Sisi kanan: keterjangkauan chevron-bawah + ikon SVG tas belanja bergaris putih
- Radius: `4px`
- Tinggi: ~48px

**PDP Breadcrumb**
- Jalur "Menu / Refreshers / Pink Energy Drink" di atas judul produk
- Pemisah: karakter `/` garis miring dalam Text Black Soft
- Halaman saat ini tidak ditautkan, halaman sebelumnya adalah tautan bergaris bawah hijau-aksen
- Font: 14/400 Proxima Nova
- Muncul di semua halaman PDP

**Back Chevron Link (sub-halaman nutrisi PDP / detail)**
- Tautan teks "← Back" di atas heading bagian pada halaman nutrisi
- Teks dalam Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron kiri `<` dalam warna hijau yang sama
- Alternatif untuk breadcrumb penuh pada sub-halaman yang dalam

## 5. Layout Principles

### Spacing System

Skala semantis berbasis rem (berpusat `1rem = 10px`):

| Token | Rem | Pixels | Typical Use |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Padding inline paling ketat |
| `--space-2` | `0.8rem` | 8px | Jarak kecil, padding vertikal tombol |
| `--space-3` | `1.6rem` | 16px | Default — padding kartu, gutter luar xs |
| `--space-4` | `2.4rem` | 24px | Spasi dalam bagian, gutter luar md |
| `--space-5` | `3.2rem` | 32px | Spasi utama antar bagian |
| `--space-6` | `4rem` | 40px | Jarak besar, gutter luar lg, header crate |
| `--space-7` | `4.8rem` | 48px | Spasi bagian ke bagian |
| `--space-8` | `5.6rem` | 56px | Napas sangat besar — tinggi Frap |
| `--space-9` | `6.4rem` | 64px | Padding bagian terlebar |

**Token gutter:**
- `--outerGutter: 1.6rem` (16px, default / mobile)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Konstanta ritme universal:** `1.6rem` (16px) muncul di setiap halaman sebagai gutter luar default, baseline padding kartu, dan ukuran teks 3 tubuh — unit spasi yang paling sering digunakan dalam sistem.

### Grid & Container

- Skala lebar kolom: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Grid kartu hadiah menggunakan grid responsif 3-5-up dari ubin `~343px`
- Bagian status Rewards: 3 panel hijau gelap pada breakpoint `lg+`
- Hero: split asimetris 40% (gambar) / 60% (konten) via `--headerCrateProportion` / `--contentCrateProportion`

### Whitespace Philosophy

Ruang putih membawa perasaan "banyak ruang di kafe." Padding bagian cenderung boros (40–64px). Blok konten dipisahkan oleh ruang putih, bukan pembagi. Kanvas krem (`#f2f0eb`) sendiri adalah napas visual antara kartu putih dan feature band hijau.

### Border Radius Scale

| Value | Use |
|-------|-----|
| `12px` | Kartu, modal, ubin item menu (`--cardBorderRadius`) |
| `12px 12px 0 0` | Tab umpan balik lebar penuh (hanya bagian atas melengkung) |
| `50px` | Semua tombol — radius full-pill (`--buttonBorderRadius`) |
| `50%` | Ikon lingkaran, tombol mengambang Frap, thumbnail avatar |
| Specialty | `3.3333%/5.298%` elips untuk mockup Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Card | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Kartu konten default — bayangan ganda bisikan lembut |
| Global Nav | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Angkat lembut tiga lapisan pada bar atas tetap |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Halo dasar di sekitar CTA lingkaran mengambang |
| Frap Ambient | `0 8px 12px rgba(0,0,0,0.14)` | Ambient terarah bertumpuk — mengambangkan Frap ke depan |
| Gift Card | Bayangan jatuh ringan di sekitar foto ilustrasi | Nuansa kartu fisik untuk ubin hadiah |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Bayangan jatuh SVG bertumpuk untuk visual Starbucks Card |

**Filosofi bayangan:** Bisikan lembut, berlapis di atas solid — sistem ini tidak pernah menggunakan bayangan jatuh berat tunggal. Sebaliknya, menumpuk 2–3 bayangan alpha rendah dengan offset berbeda untuk mensimulasikan pencahayaan ambient + langsung dunia nyata. Tombol Frap adalah elemen paling tinggi di halaman mana pun.

### Decorative Depth

- **Tidak ada sistem gradien** — permukaan menggunakan warna blok solid
- **Penataan color-block** membawa kedalaman yang dirasakan (pita hijau gelap terbaca sebagai "zona fitur tersembunyi" antara bagian isi krem/putih)
- **Filter shadow SVG** pada visual Starbucks-Card menambahkan sedikit fisikalitas 3D tanpa box-shadow

## 7. Do's and Don'ts

### Do
- Gunakan Neutral Warm (`#f2f0eb`) atau Ceramic (`#edebe9`) sebagai kanvas halaman alih-alih putih murni — krem hangat adalah tanda tangan
- Petakan tingkatan hijau ke peran permukaan yang dimaksud — Starbucks Green untuk heading, Green Accent untuk CTA, House Green untuk pita dalam, Uplift untuk dekoratif
- Pertahankan tracking ketat `-0.01em` / `-0.16px` pada SoDoSans di seluruh sistem
- Gunakan radius full-pill 50px pada setiap tombol tanpa pengecualian
- Terapkan `transform: scale(0.95)` sebagai state aktif tombol universal
- Cadangkan Gold hanya untuk momen upacara status Rewards
- Gunakan SoDoSans untuk hampir segalanya; beralih ke serif Lander Tall hanya untuk headline editorial Rewards; cadangkan skrip Kalam untuk momen "nama cangkir" di Careers
- Tumpuk 2–3 bayangan alpha rendah alih-alih satu bayangan jatuh yang lebih berat untuk elevasi
- Gunakan CTA lingkaran Frap sebagai entri pemesanan mengambang yang persisten di setiap permukaan belanja
- Biarkan kanvas krem bernapas di antara kartu konten — gunakan ruang putih, bukan pembagi

### Don't
- Jangan gunakan putih murni sebagai kanvas halaman — suhu krem hangat adalah elemen penting
- Jangan pilih "satu hijau merek" — sistem empat-hijau adalah disengaja; menggunakan hanya `#006241` di mana-mana akan meratakan merek
- Jangan gunakan Gold sebagai aksen serba guna — itu hanya sinyal Rewards
- Jangan membuat sudut tombol menjadi persegi — pil 50px adalah universal
- Jangan tambahkan isian gradien — sistem menggunakan color-block di seluruhnya
- Jangan bedakan h1 dan h2 dengan kontras bobot berdasarkan ukuran — hierarki berasal dari bobot + warna (600 Starbucks-Green vs 400 Text Black)
- Jangan gunakan hitam murni untuk teks isi — `rgba(0,0,0,0.87)` sesuai dengan suhu kanvas hangat
- Jangan lewatkan umpan balik aktif `scale(0.95)` pada tombol — itu adalah micro-interaction khas
- Jangan tumpuk bayangan berat tunggal; selalu tumpuk 2–3 bayangan alpha rendah
- Jangan tambahkan serif atau skrip ke dalam alur belanja utama — keduanya hanya untuk konteks Rewards dan Careers

## 8. Responsive Behavior

### Breakpoints

Disimpulkan dari token lebar komponen dan tinggi nav yang progresif:

| Name | Width | Key Changes |
|------|-------|-------------|
| xs | < 480px | Nav global 64px; menu hamburger; tata letak satu kolom; tombol pil lebar penuh |
| Mobile | 480–767px | Nav global 72px; grid kartu hadiah 2-up; padding kartu mengetat |
| Tablet | 768–1023px | Nav global 83px; grid kartu hadiah 3-up; split hero mulai muncul |
| Desktop | 1024–1439px | Nav global 99px; grid kartu hadiah 4-up; hero asimetris penuh 40/60 |
| XLarge | 1440px+ | Konten dibatasi pada `--columnWidthXLarge`; grid kartu hadiah 5-up; margin krem ekstra |

### Touch Targets

- Tombol pil dengan padding `7px 16px` mengukur ~32px tinggi — di bawah minimum WCAG AAA 44px untuk permukaan sentuh saja. Pada mobile, padding tombol mungkin diperluas secara visual untuk memenuhi minimum.
- Tombol lingkaran mengambang Frap pada `56px` jauh di atas minimum.
- Frap menggunakan `--frapTouchOffset: calc(-1 * .8rem)` untuk memperluas area ketukan 8px melampaui tepi visual.
- Input float-label form memperbesar ukuran font labelnya di mobile (dasar 1.6rem vs 1.9rem desktop) — lebih mudah diketuk dan dibaca dari jarak jauh.

### Collapsing Strategy

- **Tinggi nav global berskala progresif**: 64 → 72 → 83 → 99px di berbagai breakpoint, bukan nilai tunggal
- **Split hero menyusut**: split asimetris 40/60 → bertumpuk (gambar di atas, konten di bawah) pada mobile
- **Grid kartu hadiah**: 5-up → 4-up → 3-up → 2-up → 1-up di berbagai breakpoint dengan lebar kartu yang disesuaikan
- **Feature band**: Tetap lebar penuh tetapi teks + gambar bertumpuk secara vertikal pada mobile
- **Skala gutter luar**: 16px → 24px → 40px seiring viewport membesar
- **Panel status 3 kolom Rewards**: Bertumpuk ke satu kolom pada mobile

### Image Behavior

- Foto produk hero memotong lebih ketat secara vertikal pada mobile; konten menjadi jangkar visual
- Ilustrasi kartu hadiah mempertahankan rasio aspek; grid kartu mengalir ulang
- Transisi fade-in `opacity 0.3s ease-in` saat gambar dimuat (mencegah pop-in yang mengagetkan)
- Foto aplikasi-dalam-tangan Rewards berskala proporsional; tidak pernah meregang

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: "Green Accent (`#00754A`)"
- Primary CTA text: "White (`#ffffff`)"
- Brand heading: "Starbucks Green (`#006241`)"
- Feature band / footer: "House Green (`#1E3932`)"
- Page canvas: "Neutral Warm (`#f2f0eb`)"
- Card canvas: "White (`#ffffff`)"
- Heading text on light: "Text Black (`rgba(0,0,0,0.87)`)"
- Body text on light: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Body text on dark-green: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Rewards accent: "Gold (`#cba258`)"
- Rewards text: "Rewards Green (`#33433d`)"
- Destructive: "Red (`#c82014`)"

### Example Component Prompts

1. "Create a primary Starbucks CTA pill button with Green Accent (`#00754A`) background, white text 'Explore our afternoon menu', SoDoSans font at 16px weight 600 with `-0.01em` letter-spacing, `50px` border-radius (full pill), `7px 16px` padding. Apply `transform: scale(0.95)` as the active state with a `0.2s ease` transition."

2. "Design a content card with White (`#ffffff`) background at `12px` border-radius, layered shadow `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Pad contents `16–24px` (`--space-3` to `--space-4`). Place on a Neutral Warm (`#f2f0eb`) page canvas with `16px` gap to siblings."

3. "Build the Frap floating circular order button — `56px` diameter, Green Accent (`#00754A`) fill, white shopping-bag icon centered. Layered shadow: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Fixed position bottom-right with `-0.8rem` touch offset. Active state collapses the ambient shadow to `0 8px 12px rgba(0,0,0,0)` with `scale(0.95)`."

4. "Build a dark-green feature band — full-width section with House Green (`#1E3932`) background. Left column: white SoDoSans h2 at 24px weight 600, followed by a Text White Soft (`rgba(255,255,255,0.70)`) body paragraph and a CTA row with two buttons (White-filled with Green Accent text for primary, Outlined-on-Dark white border for secondary). Right column: product photography. Split ratio 40/60, stacked vertically below `768px`."

5. "Create a Rewards status card — House Green (`#1E3932`) panel with `12px` border-radius, colored gradient top stripe (Bronze/Silver/Gold tier). Title in SoDoSans 24px weight 600 in white. Benefits list as white bullets with `rgba(255,255,255,0.70)` secondary captions. Bottom progression text in Text White Soft. Stack 3 panels in a grid at `lg+`, single column on mobile."

6. "Design a gift-card tile — card radius matches `12px`, fills with an illustrated photograph (hand-drawn watercolor-painted feel) as the entire surface. Subtle drop shadow makes it feel like a physical card on the cream canvas. Group under a category label ('Spring', 'Thank You', 'Birthday') in SoDoSans 24px weight 400 above the grid."

7. "Create a Starbucks product-detail header — House Green (`#1E3932`) band with breadcrumb 'Menu / Refreshers / Pink Energy Drink' in 14/400 white above the product title in SoDoSans 32/700 uppercase white. Product photograph centered below title. Below photo: a 4-up size selector row — each cup-icon button shows a vertical cup silhouette, size name ('Tall' / 'Grande' / 'Venti' / 'Trenta') in 16/700 white, and fluid-ounce in 13/400 Text White Soft. Selected size wraps the cup icon in a `2px solid #00754A` circular ring."

8. "Build a Starbucks customize flow — under the size selector, 3 stacked outlined-rectangle input rows (white bg, `1px solid #d6dbde` border, `4px` radius). Each has a floating label ('Add-ins', 'Milk', 'Add-ins') above the top border in 13/700 Text Black uppercase. Value centered (e.g., 'Ice', 'Coconut'). Right side: chevron-down in Text Black Soft. For the scoop row, embed a numeric stepper (`−` `1` `+` with circular `32px` outlined buttons). Below all three fields: outlined green 'Customize' pill with gold sparkle icon, `50px` radius, `14px 40px` padding. Pair with a Green Accent filled 'Add to Order' pill in the same row."

9. "Design a Starbucks product description band — full-width House Green (`#1E3932`) below product header. Top: a gold-outlined '200★ item' Rewards Cost Pill (`50px` radius, `4px 12px` padding, gold `#cba258` border and text). Below: product description in white 16/400/1.5. Nutritional inline summary in white 14/700 ('140 calories, 25g sugar, 2.5g fat') with info-icon tooltip. Outlined-white-on-green pill button 'Full nutrition &amp; ingredients list'. 32px vertical padding."

10. "Create a Starbucks nutrition facts table — two-column layout inside a White card. Left column: 'Ingredients' header (24/400 Text Black), followed by ingredient list or 'Not available for this item' placeholder paragraph in 14/400 Text Black Soft. Right column: 'Nutrition' header, then label/value rows (nutrient name left, value right) separated by `1px solid #e7e7e7` hairlines. Typography: labels in 14/400 Text Black, values in 14/700 Text Black right-aligned. Footnote asterisk markers in 13/400 Text Black Soft at the bottom."

### Iteration Guide

Saat menyempurnakan layar yang sudah ada yang dibuat dengan sistem desain ini:
1. Fokus pada SATU komponen dalam satu waktu
2. Referensikan nama warna dan kode hex spesifik dari dokumen ini
3. Gunakan deskripsi bahasa alami ("kanvas krem hangat", "sistem hijau empat tingkat") bersama nilai yang tepat
4. Pertahankan pil 50px + state aktif `scale(0.95)` secara universal
5. Periksa bahwa hijau dipetakan ke peran yang tepat (Green Accent untuk CTA, Starbucks Green untuk heading, House Green untuk pita)
6. Jangan tambahkan isian gradien — sistem menggunakan color-block
7. Pertahankan tracking SoDoSans pada `-0.01em` / `-0.16px` di seluruh

### Known Gaps

- SoDoSans adalah typeface proprietary yang tidak tersedia di Google Fonts — saat mengimplementasikan secara publik, gunakan Inter atau Manrope sebagai pengganti dan dokumentasikan peralihannya
- Lander Tall (serif Rewards) juga kustom — gantikan dengan Iowan Old Style, Lora, atau Source Serif Pro
- Timing animasi per komponen spesifik di luar beberapa yang terdokumentasi (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) tidak ditangkap untuk setiap permukaan interaktif
- Gaya state error penuh form (bobot border merah, penempatan ikon) terlihat pada token tint tetapi tidak diekstrak secara lengkap
- Komponen spesifik halaman Careers (kartu nama cangkir, grid radio pencarian) dirujuk dalam nama token tetapi tidak dicakup oleh ekstraksi ini
- Spesifikasi mockup detail Starbucks Visa Card / Starbucks-Card (SVC) ditunjukkan oleh token `--svcRoundedCorners` dan `--svcShadowFilter` tetapi tidak sepenuhnya terdokumentasi
