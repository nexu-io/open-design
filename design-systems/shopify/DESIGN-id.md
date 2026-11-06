# Sistem Desain Terinspirasi Shopify

> Category: E-Commerce & Ritel
> Platform e-commerce. Sinematik dark-first, aksen hijau neon, tipografi ultraringan.

## 1. Tema Visual & Atmosfer

Shopify.com adalah teater digital yang mengutamakan gelap — sebuah situs yang menampilkan platform commerce-nya seperti premiere sinematik. Seluruh pengalaman terbentang di atas hamparan permukaan near-black yang membawa bisikan paling samar dari hijau hutan yang dalam (`#02090A`, `#061A1C`, `#102620`), menciptakan atmosfer nokturnal yang terasa lebih seperti peluncuran produk eksklusif di keynote teknologi daripada halaman pemasaran SaaS biasa. Kegelapan ini tidak dingin atau korporat — ini adalah kegelapan hangat dan menyelimuti dari pengalaman mewah, seperti duduk di baris terdepan auditorium yang remang.

Tipografinya adalah bintang yang tak terbantahkan. NeueHaasGrotesk — keturunan Helvetica yang telah disempurnakan — muncul dalam skala monumental (96px) dengan bobot yang terasa mustahil ringannya (330-400), menciptakan headline yang terasa terukir dalam cahaya daripada dicetak dengan tinta. Fitur OpenType `ss03` memberikan karakter khas pada bentuk huruf yang membedakan tipografi Shopify dari penggunaan Helvetica generik. Di bawah lapisan display, Inter Variable menangani teks body dengan presisi bedah, menggunakan bobot variabel yang sama-sama tidak biasa (420, 450, 550) yang berada di antara perhentian bobot tradisional. Presisi ini menandakan perusahaan yang memperhatikan setiap detail.

Warna digunakan dengan pengendalian diri yang ekstrem. Aksen utama adalah Hijau Neon Shopify (`#36F4A4`) — mint elektrik yang muncul secara eksklusif pada focus ring dan sorotan aksen, berdenyut seperti sinyal bioluminesen di atas kanvas gelap. Tint hijau yang lebih lembut (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) memberikan nuansa atmosferik. Putih adalah satu-satunya warna teks yang penting pada permukaan gelap, sementara skala netral berbasis seng (`#A1A1AA` hingga `#3F3F46`) menangani hierarki informasi yang tenang. Hasilnya adalah desain yang membuat teknologi commerce terasa seolah milik masa depan fiksi ilmiah.

**Karakteristik Utama:**
- Desain dark-first dengan undertone hutan-teal yang dalam (bukan hitam murni)
- Tipografi display ultraringan (bobot 330) dalam skala monumental (96px) menciptakan kehadiran yang ethereal
- Hijau Neon (`#36F4A4`) sebagai aksen berenergi tinggi tunggal di atas kegelapan
- Tombol full-pill (radius 9999px) sebagai bentuk interaktif utama
- Box shadow berlapis dan multi-tahap menciptakan kedalaman fotografis
- Screenshot produk yang tertanam dalam konteks UI gelap, mencocokkan kegelapan sekitarnya
- Skala netral berbasis seng untuk hierarki teks — seimbang antara hangat dan dingin

## 2. Palet Warna & Peran

### Utama

- **Shopify White** (`#FFFFFF`): Teks utama pada permukaan gelap, isi tombol, elemen kontras tinggi
- **Shopify Black** (`#000000`): Latar belakang body, teks tombol pada putih, basis kontras maksimum (--color-shade-100)

### Sekunder & Aksen

- **Hijau Neon** (`#36F4A4`): Aksen khas — focus ring, sorotan interaktif, indikator status aktif. Elektrik dan bioluminesen
- **Aloe** (`#C1FBD4`): Nuansa hijau lembut untuk latar belakang dekoratif, kartu atmosferik (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): Tint hijau paling terang untuk diferensiasi permukaan yang halus (--color-pistachio-10)

### Permukaan & Latar Belakang

- **Void** (`#000000`): Latar belakang halaman root — hitam sejati untuk kedalaman maksimum
- **Deep Teal** (`#02090A`): Permukaan kartu, container konten — near-black dengan undertone hijau
- **Dark Forest** (`#061A1C`): Latar belakang seksi dengan karakter hijau yang terlihat
- **Forest** (`#102620`): Permukaan gelap yang terangkat, latar belakang header — bayangan gelap yang paling hangat
- **Dark Card Border** (`#1E2C31`): Border kartu pada permukaan gelap, definisi batas yang halus

### Netral & Teks (Skala Seng)

- **Shade-30** (`#D4D4D8`): Netral paling terang, border yang hampir tak terlihat pada gelap (--color-shade-30)
- **Teks Diredam** (`#A1A1AA`): Teks sekunder, metadata, deskripsi — suara yang tenang
- **Shade-50** (`#71717A`): Teks tersier, cap waktu, info paling tidak penting (--color-shade-50)
- **Shade-60** (`#52525B`): Teks dinonaktifkan, netral dekoratif (--color-shade-60)
- **Shade-70** (`#3F3F46`): Pembagi halus, batas UI yang hampir tak terlihat (--color-shade-70)
- **Light Border** (`#E4E4E7`): Border pada permukaan terang (jarang — hanya di modal mode terang)

### Semantik & Aksen

- **Link Diredam** (`#9797A2`): Teks link diredam dengan dekorasi garis bawah
- **Link Sage** (`#9DABAD`): Link diredam bertint teal
- **Link Lavender** (`#BDBDCA`): Varian link yang lebih terang
- **Link Mint** (`#99B3AD`): Varian link bertint hijau untuk seksi bertema

### Sistem Gradien

- **Dark Teal Wash**: Gradien radial dari pusat `#102620` ke tepi `#02090A` — digunakan di belakang tampilan produk
- **Green Atmospheric**: Gradien ambient bertint hijau halus di belakang seksi hero, menciptakan kedalaman tanpa warna solid
- **Spotlight**: Area terang terfokus yang memudar ke hitam — menciptakan pencahayaan presentasi gaya keynote

## 3. Aturan Tipografi

### Keluarga Font

**Display:** NeueHaasGrotesk (keturunan Helvetica yang telah disempurnakan, variable font)
- Fallback: Helvetica, Arial, sans-serif
- Fitur OpenType: `ss03` (stylistic set 3 — alternatif bentuk huruf yang khas)
- Bobot tersedia: 330, 360, 400, 500, 750 (variable)
- Digunakan untuk semua heading, teks hero, dan elemen display besar

**Body:** Inter-Variable
- Fallback: Helvetica, Arial, sans-serif
- Fitur OpenType: `ss03`
- Bobot tersedia: 400, 420, 450, 500, 550 (variable)
- Digunakan untuk teks body, link, tombol, elemen UI

**Mono:** ui-monospace
- Fallback: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Digunakan untuk potongan kode, label data, konten teknis

### Hierarki

| Peran | Ukuran | Bobot | Tinggi Baris | Spasi Huruf | Catatan |
|-------|--------|-------|--------------|-------------|---------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, headline hero, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, display penekanan |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, display berspasi |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, display ethereal |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, judul seksi |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, subseksi |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, judul fitur |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, heading kartu |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, heading kecil |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, heading minor |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, paragraf utama |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, body standar |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, body ditekankan |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, body kompak |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, sedikit ditekankan |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, teks CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, item navigasi |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadata |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, caption ditekankan |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, label berspasi lebar |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, teks kecil berspasi rapat |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, label huruf kapital |
| Code | 16px | 400 | 1.50 | — | ui-monospace, huruf kapital, blok kode |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, huruf kapital, kode inline |

### Prinsip

Tipografi Shopify adalah kelas master dalam presisi variable font. Lapisan display hidup hampir secara eksklusif pada bobot 330-400 — teks ringan seperti bulu yang tampak melayang di atas latar belakang gelap seperti cahaya yang diproyeksikan. Ini adalah kebalikan dari pendekatan tebal dan berat yang diambil sebagian besar situs SaaS: di mana yang lain berteriak, Shopify berbisik dalam skala. Headline 96px pada bobot 330 menciptakan paradoks ukuran yang luar biasa dan goresan yang halus yang terasa sekaligus monumental dan rapuh. Fitur OpenType `ss03` mengaktifkan stylistic set yang memberikan karakter yang lebih halus pada karakter tertentu (kemungkinan 'a', 'g', dan beberapa angka), membedakan tipografi Shopify dari penggunaan Helvetica Neue standar. Inter Variable menangani lapisan body dengan presisi bedah, menggunakan bobot seperti 420 dan 550 yang ada di antara perhentian tradisional — setiap teks memiliki bobot visual yang tepat yang dibutuhkannya.

## 4. Gaya Komponen

### Tombol

**Utama (Isi Putih)**
- Latar belakang: Putih (`#FFFFFF`)
- Teks: Hitam (`#000000`)
- Border: 2px solid transparent
- Border radius: full pill (9999px)
- Padding: 12px 26px 12px 16px (asimetris — padding kanan lebih besar untuk keseimbangan visual)
- Hover: penurunan opasitas ringan atau pergeseran latar belakang
- Fokus: 2px `#36F4A4` (Hijau Neon) outline ring
- Transisi: all 200ms ease

**Sekunder (Ghost/Outlined)**
- Latar belakang: transparent
- Teks: Putih (`#FFFFFF`)
- Border: 2px solid Putih (`#FFFFFF`)
- Border radius: full pill (9999px)
- Padding: 12px 26px 12px 16px
- Hover: mengisi dengan latar belakang putih dan teks hitam
- Fokus: 2px `#36F4A4` outline

**Badge/Tag (Netral Terisi)**
- Latar belakang: `rgba(255, 255, 255, 0.2)` (frosted glass)
- Teks: Putih (`#FFFFFF`)
- Border: tidak ada
- Border radius: sedikit membulat (4px)
- Padding: 12px 16px
- Font: 16px regular

### Kartu & Container

- Latar belakang: Deep Teal (`#02090A`) pada halaman gelap
- Border: 1px solid `#1E2C31` (Dark Card Border) — batas yang hampir tak terlihat
- Border radius: 8px untuk kartu standar, 12px untuk kartu unggulan, 20px 20px 0 0 untuk kartu membulat di atas
- Bayangan: Sistem berlapis:
  - Istirahat: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - Sorotan putih inset menciptakan cahaya tepi atas yang halus
- Hover: bayangan meluas, kartu mungkin sedikit lebih cerah
- Transisi: box-shadow 300ms ease, transform 200ms ease

### Input & Formulir

- Latar belakang: transparent atau Dark Forest (`#061A1C`)
- Teks: Putih (`#FFFFFF`)
- Border: 1px solid `#3F3F46` (Shade-70)
- Border radius: 8px
- Padding: 12px 16px
- Fokus: 2px solid `#36F4A4` (focus ring Hijau Neon)
- Placeholder: Shade-50 (`#71717A`)
- Transisi: border-color 200ms ease

### Navigasi

- Latar belakang: transparent (melapisi hero gelap), menjadi Forest (`#102620`) saat scroll
- Tinggi: ~64px
- Kiri: logo wordmark Shopify (SVG, putih pada gelap)
- Tengah/Kanan: link nav dalam 18px/500 NeueHaasGrotesk, putih, letter-spacing 0.72px
- CTA: Tombol pill putih "Mulai gratis" (kanan)
- CTA Sekunder: Tombol ghost dengan border putih
- Hover: link bergeser ke Teks Diredam (`#A1A1AA`) atau mendapat garis bawah
- Seluler: menu hamburger, overlay gelap layar penuh
- Transisi: background 300ms ease saat scroll

### Perlakuan Gambar

- Screenshot produk: tertanam dalam konteks UI gelap, mencocokkan kegelapan sekitarnya
- Pratinjau antarmuka admin: ditampilkan pada latar belakang gelap dengan border kartu halus
- Rasio aspek: bervariasi — gambar hero lebar (sekitar 16:9), foto fitur fleksibel
- Semua gambar duduk mulus dalam container gelap — tanpa border atau bingkai cerah
- Lazy loading dengan permukaan placeholder gelap

### Indikator Kepercayaan

- Statistik ditampilkan secara menonjol: "15+" (tahun), "150M+" (pembeli)
- Angka dalam skala display di NeueHaasGrotesk
- Seksi pemanggilan ekosistem mitra/pengembang
- Testimoni bertema gelap yang terintegrasi dalam alur halaman

## 5. Prinsip Tata Letak

### Sistem Spasi

Unit dasar: 8px

| Token | Nilai | Penggunaan |
|-------|-------|-----------|
| space-1 | 4px | Celah inline yang rapat |
| space-2 | 8px | Unit dasar, celah ikon |
| space-3 | 12px | Padding kartu, margin rapat |
| space-4 | 16px | Padding elemen standar |
| space-5 | 24px | Celah kartu, padding seksi |
| space-6 | 28px | Spasi seksi sedang |
| space-7 | 32px | Pemisah seksi |
| space-8 | 36px | Padding besar |
| space-9 | 40px | Padding seksi utama |
| space-10 | 64px | Padding seksi hero, celah besar |

### Grid & Container

- Lebar container maksimum: ~1280px (terpusat)
- Hero: full-width, latar belakang gelap dari tepi ke tepi dengan teks terpusat
- Seksi fitur: tata letak 2 kolom dengan teks dan screenshot produk
- Seksi statistik: tata letak horizontal dengan angka besar
- Padding horizontal: 64px desktop, 32px tablet, 16px seluler
- Celah grid: 24-32px antara blok konten utama

### Filosofi Ruang Kosong

Strategi ruang kosong Shopify bersifat teatrikal. Seksi dipisahkan oleh hamparan luas ruang gelap — 80px hingga 120px ruang hitam murni untuk bernafas — yang menciptakan tempo sebuah presentasi, bukan halaman web. Setiap blok konten adalah "slide" tersendiri dalam guliran gaya keynote. Di dalam seksi, spasi lebih rapat dan lebih disengaja, menciptakan kepadatan fokus di atas kehampaan yang luas. Kontras antara kekosongan tingkat makro dan presisi tingkat mikro itulah yang memberikan irama sinematik pada situs ini.

### Skala Border Radius

| Nilai | Konteks |
|-------|---------|
| 4px | Tag, badge, mikro-elemen |
| 8px | Kartu standar, input, container video |
| 12px | Kartu unggulan, container gambar, tombol (bukan pill) |
| 20px | Kartu membulat di atas (20px 20px 0 0), header modal |
| 340px | Elemen dekoratif membulat besar |
| 9999px | Tombol pill, badge pill, elemen nav |

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----------|
| Dasar | Tanpa bayangan, permukaan gelap | Latar belakang halaman default |
| Halus | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + cahaya putih inset | Kartu istirahat |
| Sedang | Multi-layer: ring 1px + bayangan 2px + 4px + 8px | Kartu terangkat, seksi unggulan |
| Tinggi | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modal, dropdown, overlay |
| Fokus | `0px 0px 0px 2px #36F4A4` | Focus ring keyboard (Hijau Neon) |

Sistem bayangan Shopify sangat canggih. Alih-alih bayangan bernilai tunggal, kartu menggunakan pendekatan bertumpuk multi-layer: ring 1px untuk definisi batas, blur progresif 2px/4px/8px untuk penurunan cahaya alami, dan cahaya putih inset yang halus (`rgba(255,255,255,0.03)`) yang mensimulasikan permukaan kaca yang diterangi dari atas. Pada latar belakang gelap, bayangan menggelapkan permukaan yang sudah gelap, sehingga bayangan lebih berfungsi sebagai "ambient occlusion" daripada elevasi tradisional — kartu tampak sedikit tenggelam ke dalam permukaan daripada melayang di atasnya.

### Kedalaman Dekoratif

- **Gradien teal gelap**: Nuansa radial ambient di belakang seksi hero dan tampilan produk
- **Efek spotlight**: Area terang yang terfokus memudar ke hitam, menciptakan pencahayaan teatrikal gaya keynote
- **Cahaya tepi**: Tepi berwarna terang halus pada kartu gelap melalui box-shadow inset
- **Halo atmosferik hijau**: Tint hijau samar dalam gradien latar belakang, menggaungkan aksen merek

## 7. Yang Harus dan Yang Tidak Boleh

### Yang Harus

- Gunakan hierarki permukaan teal-hitam gelap (Void → Deep Teal → Dark Forest → Forest) untuk kedalaman
- Pertahankan tipografi display pada bobot 330-400 — keringanan ethereal adalah ciri khas desain
- Gunakan Hijau Neon (`#36F4A4`) secara eksklusif untuk status fokus dan sorotan aksen kritis
- Terapkan radius 9999px pada semua tombol CTA utama — pill penuh tidak dapat ditawar
- Gunakan sistem bayangan multi-layer untuk elevasi kartu — bayangan tunggal terlihat datar
- Pertahankan fitur OpenType `ss03` di seluruh teks — ini adalah bagian dari identitas tipografis
- Gunakan Inter Variable untuk teks body dan NeueHaasGrotesk untuk heading — jangan pernah mencampur perannya
- Buat spasi teatrikal antara seksi (80px+) untuk tempo sinematik

### Yang Tidak Boleh

- Jangan gunakan hitam murni (#000000) untuk teks pada latar belakang gelap — gunakan putih (#FFFFFF) saja
- Jangan perkenalkan warna hangat (oranye, merah, kuning) — palet sepenuhnya dingin (hijau, teal, netral)
- Jangan gunakan bobot font di atas 500 untuk teks body NeueHaasGrotesk — bobot berat merusak nuansa ethereal
- Jangan terapkan aksen hijau pada permukaan besar — Hijau Neon hanya untuk sorotan kecil dan tepat
- Jangan gunakan sudut tajam (radius 0px) pada elemen interaktif — semua harus membulat
- Jangan tambahkan latar belakang cerah — tema gelap adalah fundamental, bukan opsional
- Jangan gunakan box shadow berlapis tunggal — pendekatan bertumpuk adalah sistemnya
- Jangan atur line-height di atas 1.56 untuk teks body — teks Shopify relatif kompak
- Jangan campur NeueHaasGrotesk dan Inter pada ukuran/peran yang sama — skala bobot mereka berbeda
- Jangan gunakan letter-spacing di bawah 0 untuk heading — heading Shopify melacak netral atau positif

## 8. Perilaku Responsif

### Breakpoint

| Nama | Lebar | Perubahan Utama |
|------|-------|----------------|
| Seluler | <640px | Satu kolom, nav hamburger, teks display mengecil ke 48px, padding 16px |
| Tablet | 640-1024px | Grid 2 kolom mulai, teks display 70px, padding 32px |
| Desktop | 1024-1440px | Tata letak penuh, nav diperluas, display 96px, padding 64px |
| Desktop Besar | >1440px | Container max-width terpusat, spasi seksi meningkat |

### Target Sentuh

- Target sentuh minimum: 44x44px (WCAG AAA)
- Tombol pill: tinggi minimum 48px dengan padding horizontal yang cukup
- Link nav: area sentuh 44px
- Permukaan kartu: seluruh kartu dapat diketuk jika ditautkan

### Strategi Penggulungan

- **Navigasi**: Link horizontal penuh → menu hamburger di bawah 1024px; logo dan tombol CTA tetap terlihat
- **Seksi hero**: display 96px → 70px pada tablet → 48px pada seluler; mempertahankan alignment terpusat satu kolom
- **Seksi fitur**: teks+gambar 2 kolom → ditumpuk satu kolom di bawah 768px
- **Statistik**: Baris horizontal → ditumpuk vertikal pada seluler
- **Padding seksi**: 64px → 40px → 24px → 16px seiring menyempitnya viewport
- **Kartu**: Grid → tumpukan, mempertahankan full-width pada seluler

### Perilaku Gambar

- Screenshot produk: responsif dalam container gelap, mempertahankan rasio aspek
- Gambar hero: full-width pada semua breakpoint, lazy loaded dengan placeholder gelap
- Pratinjau UI admin: diskalakan proporsional, mungkin terpotong pada seluler
- Semua gambar menggunakan CDN (`cdn.shopify.com`) dengan srcset responsif

## 9. Panduan Prompt Agen

### Referensi Warna Cepat

- CTA Utama: Shopify White (`#FFFFFF`)
- Latar belakang halaman: Void Black (`#000000`)
- Permukaan kartu: Deep Teal (`#02090A`)
- Latar belakang seksi: Dark Forest (`#061A1C`)
- Latar belakang terangkat: Forest (`#102620`)
- Aksen: Neon Green (`#36F4A4`)
- Teks body: White (`#FFFFFF`)
- Teks diredam: Muted (`#A1A1AA`)
- Border gelap: Dark Card Border (`#1E2C31`)

### Contoh Prompt Komponen

- "Buat seksi hero pada latar belakang hitam sejati (#000000) dengan headline 96px/330 NeueHaasGrotesk berwarna putih, subjudul 20px/500 dalam #A1A1AA, dan dua tombol pill: putih terisi (radius 9999px) dan ghost dengan border putih 2px"
- "Desain kartu fitur pada Deep Teal (#02090A) dengan border 1px #1E2C31, radius 12px, bayangan multi-layer (ring 1px + blur 2px/4px/8px pada 10% hitam), berisi heading putih 32px/360 dan teks body 18px/400 #A1A1AA"
- "Buat seksi statistik pada Dark Forest (#061A1C) dengan angka putih 96px/750 (NeueHaasGrotesk), label deskriptif 16px/400 #A1A1AA, dan spasi 64px yang murah hati antara blok statistik"
- "Buat nav sticky dengan latar belakang transparan (menjadi #102620 saat scroll), logo Shopify putih di kiri, link nav putih 18px/500 dengan letter-spacing 0.72px, dan tombol pill putih 'Mulai gratis' di kanan"
- "Desain tag/badge dengan latar belakang frosted glass rgba(255,255,255,0.2), radius 4px, padding 12px 16px, teks putih 16px — melayang di atas permukaan kartu gelap"

### Panduan Iterasi

Saat menyempurnakan layar yang sudah ada yang dibuat dengan sistem desain ini:
1. Fokus pada SATU komponen sekaligus
2. Referensikan nama warna dan kode hex spesifik dari dokumen ini
3. Ingat: ini adalah desain DARK-FIRST — permukaan terang adalah pengecualian, bukan aturan
4. Teks display harus selalu terasa ringan seperti bulu (bobot 330-400) — jika terlihat berat, kurangi bobotnya
5. Hijau Neon (#36F4A4) berharga — gunakan secara hemat hanya untuk fokus dan aksen
6. Hierarki permukaan gelap (hitam → deep teal → dark forest → forest) menciptakan kedalaman yang halus
7. Bayangan berlapis — nilai `box-shadow` tunggal tidak akan menangkap nuansa kartu Shopify
8. Fitur OpenType `ss03` harus aktif pada semua teks untuk konsistensi tipografis
