# Sistem Desain Terinspirasi dari Notion

> Category: Produktivitas & SaaS
> Ruang kerja serba lengkap. Minimalisme hangat, judul berserif, permukaan lembut.

## 1. Tema Visual & Atmosfer

Website Notion mewujudkan filosofi dari alat itu sendiri: kanvas kosong yang tidak menghalangi Anda. Sistem desain ini dibangun di atas warna netral hangat, bukan abu-abu dingin, menciptakan minimalisme ramah yang terasa seperti kertas berkualitas daripada kaca steril. Kanvas halaman berwarna putih bersih (`#ffffff`) namun teksnya bukan hitam murni -- melainkan hampir hitam yang hangat (`rgba(0,0,0,0.95)`) yang memperhalus pengalaman membaca secara tak terasa. Skala abu-abu hangat (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) memiliki undertone kuning-cokelat yang halus, memberikan antarmuka kehangatan taktil, hampir analog.

Font NotionInter kustom (Inter yang dimodifikasi) adalah tulang punggung sistem ini. Pada ukuran display (64px), font ini menggunakan letter-spacing negatif yang agresif (-2.125px), menciptakan judul yang terasa terkompresi dan presisi. Rentang berat lebih luas dari sistem biasa: 400 untuk isi, 500 untuk elemen UI, 600 untuk label semi-bold, dan 700 untuk judul display. Fitur OpenType `"lnum"` (angka lining) dan `"locl"` (bentuk terlokalisasi) diaktifkan pada teks yang lebih besar, menambah kecanggihan tipografi yang memberi hadiah bagi pembaca yang cermat.

Yang membuat bahasa visual Notion khas adalah filosofi bordernya. Alih-alih border tebal atau bayangan, Notion menggunakan border ultra-tipis `1px solid rgba(0,0,0,0.1)` -- border yang hadir seperti bisikan, garis pembagi yang hampir tak terasa yang menciptakan struktur tanpa bobot. Sistem bayangan sama-sama menahan diri: tumpukan multi-lapisan dengan opasitas kumulatif yang tidak pernah melebihi 0.05, menciptakan kedalaman yang dirasakan bukan dilihat.

**Karakteristik Utama:**
- NotionInter (Inter yang dimodifikasi) dengan letter-spacing negatif pada ukuran display (-2.125px pada 64px)
- Palet netral hangat: abu-abu memiliki undertone kuning-cokelat (`#f6f5f4` putih hangat, `#31302e` gelap hangat)
- Teks hampir hitam melalui `rgba(0,0,0,0.95)` -- bukan hitam murni, menciptakan kehangatan mikro
- Border ultra-tipis: `1px solid rgba(0,0,0,0.1)` di seluruh -- pembagian berbobot bisikan
- Tumpukan bayangan multi-lapisan dengan opasitas di bawah 0.05 untuk kedalaman yang hampir tak terlihat
- Notion Blue (`#0075de`) sebagai warna aksen tunggal untuk CTA dan elemen interaktif
- Lencana pil (radius 9999px) dengan latar belakang biru bertona untuk indikator status
- Unit spasi dasar 8px dengan skala organik yang tidak kaku

## 2. Palet Warna & Peran

### Primer
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`): Teks utama, judul, isi teks. Opasitas 95% memperhalus hitam murni tanpa mengorbankan keterbacaan.
- **Pure White** (`#ffffff`): Latar belakang halaman, permukaan kartu, teks tombol pada biru.
- **Notion Blue** (`#0075de`): CTA utama, warna tautan, aksen interaktif -- satu-satunya warna jenuh dalam tampilan antarmuka inti.

### Sekunder Merek
- **Deep Navy** (`#213183`): Warna merek sekunder, digunakan jarang untuk penekanan dan bagian fitur gelap.
- **Active Blue** (`#005bab`): Status aktif/ditekan pada tombol -- varian lebih gelap dari Notion Blue.

### Skala Netral Hangat
- **Warm White** (`#f6f5f4`): Tinta permukaan latar belakang, pergantian bagian, isian kartu halus. Undertone kuning adalah kuncinya.
- **Warm Dark** (`#31302e`): Latar belakang permukaan gelap, teks bagian gelap. Lebih hangat dari abu-abu standar.
- **Warm Gray 500** (`#615d59`): Teks sekunder, deskripsi, label redup.
- **Warm Gray 300** (`#a39e98`): Teks placeholder, status dinonaktifkan, teks keterangan.

### Warna Aksen Semantik
- **Teal** (`#2a9d99`): Status sukses, indikator positif.
- **Green** (`#1aae39`): Konfirmasi, lencana penyelesaian.
- **Orange** (`#dd5b00`): Status peringatan, indikator perhatian.
- **Pink** (`#ff64c8`): Aksen dekoratif, sorotan fitur.
- **Purple** (`#391c57`): Fitur premium, aksen dalam.
- **Brown** (`#523410`): Aksen tanah, bagian fitur hangat.

### Interaktif
- **Link Blue** (`#0075de`): Warna tautan utama dengan garis bawah saat diarahkan.
- **Link Light Blue** (`#62aef0`): Varian tautan lebih terang untuk latar belakang gelap.
- **Focus Blue** (`#097fe8`): Cincin fokus pada elemen interaktif.
- **Badge Blue Bg** (`#f2f9ff`): Latar belakang lencana pil, permukaan biru bertona.
- **Badge Blue Text** (`#097fe8`): Teks lencana pil, biru lebih gelap untuk keterbacaan.

### Bayangan & Kedalaman
- **Card Shadow** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Elevasi kartu multi-lapisan.
- **Deep Shadow** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Elevasi dalam lima lapisan untuk modal dan konten unggulan.
- **Whisper Border** (`1px solid rgba(0,0,0,0.1)`): Border pembagi standar -- kartu, pembagi, bagian.

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `NotionInter`, dengan fallback: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Fitur OpenType**: `"lnum"` (angka lining) dan `"locl"` (bentuk terlokalisasi) diaktifkan pada teks display dan judul.

### Hierarki

| Peran | Font | Ukuran | Berat | Tinggi Baris | Jarak Huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (rapat) | -2.125px | Kompresi maksimum, judul papan iklan |
| Display Sekunder | NotionInter | 54px (3.38rem) | 700 | 1.04 (rapat) | -1.875px | Hero sekunder, judul fitur |
| Judul Bagian | NotionInter | 48px (3.00rem) | 700 | 1.00 (rapat) | -1.5px | Judul bagian fitur, dengan `"lnum"` |
| Sub-judul Besar | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Judul kartu, sub-bagian fitur |
| Sub-judul | NotionInter | 26px (1.63rem) | 700 | 1.23 (rapat) | -0.625px | Sub-judul bagian, header konten |
| Judul Kartu | NotionInter | 22px (1.38rem) | 700 | 1.27 (rapat) | -0.25px | Kartu fitur, judul daftar |
| Isi Besar | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Pengantar, deskripsi fitur |
| Isi | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Teks baca standar |
| Isi Medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navigasi, teks UI yang ditekankan |
| Isi Semi-bold | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Label kuat, status aktif |
| Isi Tebal | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Judul pada ukuran isi |
| Nav / Tombol | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Tautan navigasi, teks tombol |
| Keterangan | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadata, label sekunder |
| Keterangan Ringan | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Keterangan isi, deskripsi |
| Lencana | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Lencana pil, tag, label status |
| Label Mikro | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Metadata kecil, cap waktu |

### Prinsip
- **Kompresi pada skala**: NotionInter pada ukuran display menggunakan letter-spacing -2.125px pada 64px, secara bertahap melonggar ke -0.625px pada 26px dan normal pada 16px. Kompresi ini menciptakan kepadatan pada judul sambil mempertahankan keterbacaan pada ukuran isi.
- **Sistem empat berat**: 400 (isi/membaca), 500 (UI/interaktif), 600 (penekanan/navigasi), 700 (judul/display). Rentang berat yang lebih luas dibandingkan sebagian besar sistem memungkinkan hierarki yang lebih bernuansa.
- **Penskalaan hangat**: Tinggi baris mengencang seiring ukuran meningkat -- 1.50 pada isi (16px), 1.23-1.27 pada sub-judul, 1.00-1.04 pada display. Ini menciptakan judul yang lebih padat dan berdampak.
- **Pelacakan mikro lencana**: Teks lencana 12px menggunakan letter-spacing positif (0.125px) -- satu-satunya pelacakan positif dalam sistem, menciptakan teks kecil yang lebih lebar dan terbaca.

## 4. Gaya Komponen

### Tombol

**Biru Primer**
- Latar belakang: `#0075de` (Notion Blue)
- Teks: `#ffffff`
- Padding: 8px 16px
- Radius: 4px (halus)
- Border: `1px solid transparent`
- Hover: latar belakang menggelap menjadi `#005bab`
- Aktif: transformasi scale(0.9)
- Fokus: outline fokus `2px solid`, bayangan `var(--shadow-level-200)`
- Gunakan: CTA utama ("Get Notion free", "Coba sekarang")

**Sekunder / Tersier**
- Latar belakang: `rgba(0,0,0,0.05)` (abu-abu hangat tembus cahaya)
- Teks: `#000000` (hampir hitam)
- Padding: 8px 16px
- Radius: 4px
- Hover: warna teks berubah, scale(1.05)
- Aktif: transformasi scale(0.9)
- Gunakan: Tindakan sekunder, pengiriman formulir

**Ghost / Tombol Tautan**
- Latar belakang: transparan
- Teks: `rgba(0,0,0,0.95)`
- Dekorasi: garis bawah saat diarahkan
- Gunakan: Tindakan tersier, tautan inline

**Tombol Lencana Pil**
- Latar belakang: `#f2f9ff` (biru bertona)
- Teks: `#097fe8`
- Padding: 4px 8px
- Radius: 9999px (pil penuh)
- Font: 12px berat 600
- Gunakan: Lencana status, label fitur, tag "Baru"

### Kartu & Kontainer
- Latar belakang: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.1)` (border bisikan)
- Radius: 12px (kartu standar), 16px (kartu unggulan/hero)
- Bayangan: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: intensifikasi bayangan yang halus
- Kartu gambar: radius atas 12px, gambar mengisi setengah bagian atas

### Input & Formulir
- Latar belakang: `#ffffff`
- Teks: `rgba(0,0,0,0.9)`
- Border: `1px solid #dddddd`
- Padding: 6px
- Radius: 4px
- Fokus: cincin outline biru
- Placeholder: abu-abu hangat `#a39e98`

### Navigasi
- Nav horizontal bersih pada putih, tidak lengket
- Logo merek rata kiri (ikon 33x34px + wordmark)
- Tautan: NotionInter 15px berat 500-600, teks hampir hitam
- Hover: perubahan warna ke `var(--color-link-primary-text-hover)`
- CTA: tombol pil biru ("Get Notion free") rata kanan
- Mobile: runtuhan menu hamburger
- Dropdown produk dengan menu berkategori multi-tingkat

### Perlakuan Gambar
- Tangkapan layar produk dengan border `1px solid rgba(0,0,0,0.1)`
- Gambar dengan radius atas: `12px 12px 0px 0px`
- Tangkapan layar pratinjau dasbor/ruang kerja mendominasi bagian fitur
- Latar belakang gradien hangat di belakang ilustrasi hero (ilustrasi karakter dekoratif)

### Komponen Khas

**Kartu Fitur dengan Ilustrasi**
- Header ilustratif besar (The Great Wave, tangkapan layar UI produk)
- Kartu radius 12px dengan border bisikan
- Judul pada 22px berat 700, deskripsi pada 16px berat 400
- Varian latar belakang putih hangat (`#f6f5f4`) untuk bagian bergantian

**Bar Kepercayaan / Kisi Logo**
- Logo perusahaan (bagian tim terpercaya) dalam warna merek mereka
- Tata letak gulir horizontal atau kisi dengan jumlah tim
- Tampilan metrik: pola angka besar + deskripsi

**Kartu Metrik**
- Tampilan angka besar (mis., "$4,200 ROI")
- NotionInter 40px+ berat 700 untuk metrik
- Deskripsi di bawah dalam teks isi abu-abu hangat
- Kontainer kartu berborder bisikan

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Skala organik tidak kaku dengan nilai pecahan (5.6px, 6.4px) untuk penyesuaian mikro

### Kisi & Kontainer
- Lebar konten maksimum: sekitar 1200px
- Hero: satu kolom terpusat dengan padding atas yang luas (80-120px)
- Bagian fitur: kisi 2-3 kolom untuk kartu
- Latar belakang bagian putih hangat (`#f6f5f4`) lebar penuh untuk pergantian
- Tangkapan layar kode/dasbor sebagai kontainer dengan border bisikan

### Filosofi Ruang Putih
- **Ritme vertikal yang luas**: 64-120px antara bagian utama. Notion membiarkan konten bernapas dengan padding vertikal yang luas.
- **Pergantian hangat**: Bagian putih bergantian dengan bagian putih hangat (`#f6f5f4`), menciptakan ritme visual lembut tanpa peralihan warna yang kasar.
- **Kepadatan konten-pertama**: Blok teks isi bersifat padat (line-height 1.50) namun dikelilingi margin yang cukup, menciptakan pulau-pulau konten yang terbaca dalam lautan ruang putih.

### Skala Radius Border
- Mikro (4px): Tombol, input, elemen interaktif fungsional
- Halus (5px): Tautan, item daftar, item menu
- Standar (8px): Kartu kecil, kontainer, elemen inline
- Nyaman (12px): Kartu standar, kontainer fitur, atas gambar
- Besar (16px): Kartu hero, konten unggulan, blok promosi
- Pil Penuh (9999px): Lencana, pil, indikator status
- Lingkaran (100%): Indikator tab, avatar

## 6. Kedalaman & Elevasi

| Tingkat | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa bayangan, tanpa border | Latar belakang halaman, blok teks |
| Bisikan (Level 1) | `1px solid rgba(0,0,0,0.1)` | Border standar, garis luar kartu, pembagi |
| Kartu Lembut (Level 2) | Tumpukan bayangan 4 lapisan (opasitas maks 0.04) | Kartu konten, blok fitur |
| Kartu Dalam (Level 3) | Tumpukan bayangan 5 lapisan (opasitas maks 0.05, blur 52px) | Modal, panel unggulan, elemen hero |
| Fokus (Aksesibilitas) | Outline `2px solid var(--focus-color)` | Fokus keyboard pada semua elemen interaktif |

**Filosofi Bayangan**: Sistem bayangan Notion menggunakan beberapa lapisan dengan opasitas individual yang sangat rendah (0.01 hingga 0.05) yang terakumulasi menjadi elevasi yang tampak lembut dan alami. Bayangan kartu 4 lapisan membentang dari blur 1.04px hingga 18px, menciptakan gradien kedalaman daripada bayangan keras tunggal. Bayangan dalam 5 lapisan meluas hingga blur 52px pada opasitas 0.05, menghasilkan oklusi ambien yang terasa seperti cahaya alami daripada kedalaman yang dihasilkan komputer. Pendekatan berlapis ini membuat elemen terasa tertanam di halaman daripada melayang di atasnya.

### Kedalaman Dekoratif
- Bagian hero: ilustrasi karakter dekoratif (gaya main-main, gambar tangan)
- Pergantian bagian: perubahan latar belakang dari putih ke putih hangat (`#f6f5f4`)
- Tidak ada border bagian yang keras -- pemisahan berasal dari perubahan warna latar belakang dan spasi

## 7. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Kecil | <400px | Satu kolom rapat, padding minimal |
| Mobile | 400-600px | Mobile standar, tata letak bertumpuk |
| Tablet Kecil | 600-768px | Kisi 2 kolom mulai |
| Tablet | 768-1080px | Kisi kartu penuh, padding diperluas |
| Desktop Kecil | 1080-1200px | Tata letak desktop standar |
| Desktop | 1200-1440px | Tata letak penuh, lebar konten maksimum |
| Desktop Besar | >1440px | Terpusat, margin luas |

### Target Sentuh
- Tombol menggunakan padding nyaman (8px-16px vertikal)
- Tautan navigasi pada 15px dengan spasi yang memadai
- Lencana pil memiliki padding horizontal 8px untuk target ketuk
- Toggle menu mobile menggunakan tombol hamburger standar

### Strategi Runtuhan
- Hero: display 64px -> skala ke 40px -> 26px di mobile, mempertahankan letter-spacing proporsional
- Navigasi: tautan horizontal + CTA biru -> menu hamburger
- Kartu fitur: 3 kolom -> 2 kolom -> satu kolom bertumpuk
- Tangkapan layar produk: pertahankan rasio aspek dengan gambar responsif
- Logo bar kepercayaan: kisi -> gulir horizontal di mobile
- Footer: multi-kolom -> satu kolom bertumpuk
- Spasi bagian: 80px+ -> 48px di mobile

### Perilaku Gambar
- Tangkapan layar ruang kerja mempertahankan border bisikan di semua ukuran
- Ilustrasi hero berskala proporsional
- Tangkapan layar produk menggunakan gambar responsif dengan radius border yang konsisten
- Bagian putih hangat lebar penuh mempertahankan perlakuan tepi ke tepi

## 8. Aksesibilitas & Status

### Sistem Fokus
- Semua elemen interaktif menerima indikator fokus yang terlihat
- Outline fokus: `2px solid` dengan warna fokus + bayangan level 200
- Navigasi tab didukung di semua komponen interaktif
- Teks kontras tinggi: hampir hitam pada putih melampaui WCAG AAA (rasio >14:1)

### Status Interaktif
- **Default**: Tampilan standar dengan border bisikan
- **Hover**: Perubahan warna pada teks, scale(1.05) pada tombol, garis bawah pada tautan
- **Aktif/Ditekan**: Transformasi scale(0.9), varian latar belakang lebih gelap
- **Fokus**: Cincin outline biru dengan penguatan bayangan
- **Dinonaktifkan**: Teks abu-abu hangat (`#a39e98`), opasitas berkurang

### Kontras Warna
- Teks utama (rgba(0,0,0,0.95)) pada putih: rasio ~18:1
- Teks sekunder (#615d59) pada putih: rasio ~5.5:1 (WCAG AA)
- CTA biru (#0075de) pada putih: rasio ~4.6:1 (WCAG AA untuk teks besar)
- Teks lencana (#097fe8) pada latar lencana (#f2f9ff): rasio ~4.5:1 (WCAG AA untuk teks besar)

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- CTA Utama: Notion Blue (`#0075de`)
- Latar Belakang: Pure White (`#ffffff`)
- Latar Belakang Alternatif: Warm White (`#f6f5f4`)
- Teks judul: Near-Black (`rgba(0,0,0,0.95)`)
- Teks isi: Near-Black (`rgba(0,0,0,0.95)`)
- Teks sekunder: Warm Gray 500 (`#615d59`)
- Teks redup: Warm Gray 300 (`#a39e98`)
- Border: `1px solid rgba(0,0,0,0.1)`
- Tautan: Notion Blue (`#0075de`)
- Cincin fokus: Focus Blue (`#097fe8`)

### Contoh Prompt Komponen
- "Buat bagian hero pada latar belakang putih. Judul pada 64px NotionInter berat 700, line-height 1.00, letter-spacing -2.125px, warna rgba(0,0,0,0.95). Subjudul pada 20px berat 600, line-height 1.40, warna #615d59. Tombol CTA biru (#0075de, radius 4px, padding 8px 16px, teks putih) dan tombol ghost (latar transparan, teks hampir hitam, garis bawah saat diarahkan)."
- "Desain kartu: latar belakang putih, border 1px solid rgba(0,0,0,0.1), radius 12px. Gunakan tumpukan bayangan: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Judul pada 22px NotionInter berat 700, letter-spacing -0.25px. Isi pada 16px berat 400, warna #615d59."
- "Bangun lencana pil: latar belakang #f2f9ff, teks #097fe8, radius 9999px, padding 4px 8px, NotionInter 12px berat 600, letter-spacing 0.125px."
- "Buat navigasi: header putih. NotionInter 15px berat 600 untuk tautan, teks hampir hitam. CTA pil biru 'Get Notion free' rata kanan (latar #0075de, teks putih, radius 4px)."
- "Desain tata letak bagian bergantian: bagian putih bergantian dengan bagian putih hangat (#f6f5f4). Setiap bagian memiliki padding vertikal 64-80px, max-width 1200px terpusat. Judul bagian pada 48px berat 700, line-height 1.00, letter-spacing -1.5px."

### Panduan Iterasi
1. Selalu gunakan netral hangat -- abu-abu Notion memiliki undertone kuning-cokelat (#f6f5f4, #31302e, #615d59, #a39e98), tidak pernah abu-abu kebiruan
2. Letter-spacing berskala dengan ukuran font: -2.125px pada 64px, -1.875px pada 54px, -0.625px pada 26px, normal pada 16px
3. Empat berat: 400 (baca), 500 (interaksi), 600 (tekankan), 700 (umumkan)
4. Border adalah bisikan: 1px solid rgba(0,0,0,0.1) -- tidak pernah lebih berat
5. Bayangan menggunakan 4-5 lapisan dengan opasitas individual yang tidak pernah melebihi 0.05
6. Latar belakang bagian putih hangat (#f6f5f4) sangat penting untuk ritme visual
7. Lencana pil (9999px) untuk status/tag, radius 4px untuk tombol dan input
8. Notion Blue (#0075de) adalah satu-satunya warna jenuh dalam antarmuka inti -- gunakan jarang untuk CTA dan tautan
