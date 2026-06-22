# Sistem Desain Terinspirasi oleh Nike

> Category: E-Commerce & Retail
> Ritel olahraga. UI monokrom, tipografi uppercase masif, fotografi full-bleed.

## 1. Tema Visual & Atmosfer

Nike.com adalah katedral ritel yang penuh energi gerak — sebuah situs yang menyalurkan energi eksplosif olahraga ke dalam pengalaman belanja digital. Desainnya beroperasi berdasarkan prinsip kesederhanaan radikal: sederhanakan segalanya menjadi hitam, putih, dan abu-abu agar fotografi atletik dan warna produk dapat mendominasi tanpa persaingan. Hasilnya terasa bukan seperti situs web biasa, melainkan seperti editorial olahraga yang ditata dengan presisi majalah mewah. Setiap piksel ruang layar digunakan untuk menjual produk atau mengarahkan menuju produk.

"Podium CDS" (Core Design System internal Nike) membangun fondasi yang agresif dan monokromatik. UI menghilang ke dalam teks hitam (`#111111`) dan permukaan putih, membiarkan fotografi hero — atlet yang berkeringat, sepatu di udara, energi stadion — menanggung bobot emosional. Ketika warna muncul dalam UI, hampir sepenuhnya bersifat fungsional: merah untuk kesalahan, biru untuk tautan, hijau untuk keberhasilan. Produk itu sendiri adalah cerita warnanya. Pengendalian ini menciptakan paradoks visual: halaman-halaman paling berwarna di internet justru terasa paling minimalis, karena semua kecerahan berasal dari merchandise, bukan antarmuka.

Sistem tipografi adalah separuh lainnya dari identitas visual Nike. Headline uppercase masif dalam Nike Futura ND — varian Futura kondensasi kustom dengan line-height yang sangat ketat (0.90) — menembus fotografi hero seperti gelombang kejut tipografis. Di bawah headline, keluarga Helvetica Now yang tangguh menangani segalanya mulai dari navigasi hingga deskripsi produk dengan kejelasan presisi Swiss. Pemisahan antara tipe display ekspresif dan tipe body fungsional ini mencerminkan dualitas merek Nike: inspirasi bertemu eksekusi.

**Key Characteristics:**
- UI monokromatik (hitam/putih/abu-abu) yang membiarkan fotografi produk menjadi satu-satunya sumber warna
- Tipografi display uppercase masif (96px, line-height 0.90) yang menembus gambar hero
- Fotografi full-bleed tanpa border radius — gambar memenuhi setiap sisi yang tersedia
- Tombol berbentuk pil (radius 30px) sebagai elemen interaktif utama
- Grid spasi 8px dengan disiplin atletik — setiap pengukuran mengikuti sistem
- Arsitektur belanja berbasis kategori dengan kartu gambar navigasi berukuran besar
- Model elevasi tanpa bayangan dan minim border — diferensiasi permukaan hanya melalui pergeseran abu-abu

## 2. Palet Warna & Perannya

### Primer

- **Nike Black** (`#111111`): Fondasi — teks utama, latar belakang tombol, teks nav, overlay hero. Sengaja bukan hitam murni (#000000), menciptakan pengalaman baca yang sedikit lebih lembut
- **Nike White** (`#FFFFFF`): Kanvas halaman utama, teks tombol di atas latar gelap, permukaan kartu, latar belakang nav bar

### Permukaan & Latar Belakang

- **Snow** (`#FAFAFA`): Permukaan paling terang, diferensiasi halus mendekati putih (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Latar belakang sekunder, isian input pencarian, placeholder gambar, skeleton loading (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Latar belakang status hover, isian tombol disabled (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Latar belakang utama pada bagian gelap/terbalik (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Latar belakang primer invers, permukaan non-hitam paling gelap (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Status hover pada latar belakang gelap (--podium-cds-color-grey-700)

### Netral & Teks

- **Primary Text** (`#111111`): Teks body utama, heading, tautan nav (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Teks deskriptif, metadata, timestamp, label harga (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Elemen tidak aktif, opsi tidak tersedia (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Teks disabled pada latar belakang gelap (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Warna border standar, sesuai dengan teks sekunder
- **Border Secondary** (`#CACACB`): Border halus, border input, garis pemisah (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Status border tidak aktif
- **Border Active** (`#111111`): Border aktif/terfokus, sesuai dengan teks utama

### Semantik & Aksen

- **Nike Red** (`#D30005`): Kesalahan kritis, lencana diskon, notifikasi mendesak (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, merah sedikit lebih terang untuk penekanan
- **Nike Orange Badge** (`#D33918`): Teks lencana, callout promosi (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Aksen oranye ekspresif (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Konfirmasi, ketersediaan, status positif (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Keberhasilan pada latar belakang gelap (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Tautan teks, sorotan informasional (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Tautan pada latar belakang gelap (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Latar belakang peringatan, spanduk perhatian (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Cincin indikator fokus keyboard

### Spektrum Warna Diperluas (Podium CDS)

Setiap ramp warna berjalan dari 50 hingga 900 untuk penggunaan ekspresif dalam kampanye dan halaman produk:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Sistem Gradien

Nike menghindari gradien UI. Ketika gradien muncul, sifatnya fotografis — diterapkan pada latar belakang hero produk (misalnya, sepatu merah di atas gradien merah-ke-merah-lebih-gelap). Sistem desain itu sendiri hanya menggunakan warna solid.

## 3. Aturan Tipografi

### Font Family

**Display:** Nike Futura ND (varian Futura kondensasi kustom eksklusif untuk Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Digunakan secara eksklusif untuk headline display uppercase berukuran besar
- Line-height yang sangat ketat (0.90) dan transformasi uppercase sebagai cirinya

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Digunakan untuk heading seksi dan judul produk pada 24–32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Digunakan untuk tautan, tombol, keterangan, teks body yang ditekankan

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Digunakan untuk teks body standar, deskripsi, metadata

**Arabic:** Neue Frutiger Arabic — alternatif khusus lokal

### Hierarki

| Peran | Ukuran | Weight | Line Height | Letter Spacing | Catatan |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, uppercase, headline hero |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, judul seksi |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, sub-seksi |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, judul kartu |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, deskripsi produk |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, teks yang ditekankan |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, tautan navigasi |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, tautan footer/utilitas |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, teks CTA |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, tombol sekunder |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, label harga |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, timestamp |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, teks legal |

### Prinsip

Tipografi Nike adalah studi tentang ketegangan. Layer display — Nike Futura ND pada 96px dengan line-height 0.90 yang memukau — dirancang agar terasa seperti papan skor stadion: masif, kondensasi, uppercase, tidak bisa diabaikan. Ia mengubah headline menjadi seruan perang. Di bawah layer display, Helvetica Now memberikan keseimbangan yang klinis: keterbacaan presisi Swiss dengan line-height 1.75 yang lega untuk kenyamanan browsing produk. Weight 500 (Medium) mendominasi di seluruh teks body, memberikan prosa Nike ketegasan ringan tanpa berat bold — setiap kalimat terasa seperti rekomendasi yang percaya diri, bukan teriakan.

## 4. Gaya Komponen

### Tombol

**Primer**
- Background: Nike Black (`#111111`)
- Teks: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: none
- Border radius: pil penuh yang membulat (30px)
- Padding: ~12px 24px
- Hover: background bergeser ke Grey-500 (`#707072`), warna teks hover
- Active: efek ripple scale(0) dengan opacity 0.5
- Focus: box-shadow ring 2px dalam `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Primer di Atas Latar Gelap**
- Background: White (`#FFFFFF`)
- Teks: Black (`#111111`)
- Hover: background bergeser ke Grey-300 (`#CACACB`)

**Sekunder (Outlined)**
- Background: transparent
- Teks: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: border menggelap ke `#707072`, background ke grey-200

**Disabled**
- Background: Grey-200 (`#E5E5E5`)
- Teks: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Tombol Ikon**
- Background: Grey-100 (`#F5F5F5`)
- Bentuk: radius 30px (atau 50% untuk melingkar)
- Padding: 6px
- Hover: background Grey-500

### Kartu & Kontainer

- Background: White (`#FFFFFF`) — tidak ada batas kartu yang terlihat dalam kebanyakan kasus
- Border radius: 0px untuk kartu gambar produk (gambar tepi-ke-tepi), 20px untuk kontainer interaktif
- Shadow: none — Nike sama sekali tidak menggunakan bayangan kartu
- Hover: tidak ada efek angkat pada kartu produk; garis bawah pada tautan teks dalam kartu
- Kartu produk: gambar di atas (tanpa radius), metadata teks di bawah dengan jarak 12px
- Kartu kategori: fotografi full-bleed dengan overlay teks pada gradien gelap
- Transition: opacity 200ms ease untuk pergantian gambar saat hover

### Input & Formulir

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` bila terlihat, atau tanpa border pada pencarian
- Border radius: 24px (input pencarian), 8px (input formulir)
- Font: Helvetica Now Text, 16px
- Focus: border bergeser ke `#111111` (border-active), focus ring 2px dalam `rgba(39, 93, 197, 1)`
- Error: border `#D30005` (kritis)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Navigasi

- Background: White (`#FFFFFF`), sticky
- Tinggi: ~60px desktop
- Kiri: Logo Nike Swoosh (SVG 24x24px)
- Tengah: Tautan kategori (New & Featured, Men, Women, Kids, Sale) dalam 16px/500 Helvetica Now Text Medium
- Kanan: Ikon pencarian (input radius 24px), Favorit, Keranjang
- Hover: warna teks bergeser ke Grey-500 (`#707072`)
- Mobile: menu hamburger, overlay layar penuh
- Banner atas: bar pesan promosi dengan latar belakang gelap (#111111) dan teks putih

### Perlakuan Gambar

- Gambar hero: full-bleed, tanpa border radius, tepi-ke-tepi
- Grid produk: rasio aspek persegi (1:1) atau 4:3, tanpa border radius
- Kartu kategori: 16:9 atau 4:3, full-bleed dengan overlay teks
- Placeholder gambar: latar belakang solid Grey-100 (`#F5F5F5`)
- Lazy loading: native loading="lazy", skeleton menggunakan bg #F5F5F5
- Hover produk: pergantian gambar sekunder (tampak depan → tampak samping)

### Spanduk Promosi

- Latar belakang gelap full-width (`#111111`) dengan teks putih
- Padding ketat (8-12px vertikal)
- Teks terpusat, 12px/500 Helvetica Now Text Medium
- Digunakan untuk promosi pengiriman, manfaat member, pengumuman penjualan

## 5. Prinsip Tata Letak

### Sistem Spasi

Unit dasar: 4px (grid utama adalah kelipatan 8px)

| Token | Nilai | Penggunaan |
|-------|-------|-----|
| space-1 | 4px | Jarak ikon ketat, spasi inline |
| space-2 | 8px | Unit dasar, jarak ikon tombol |
| space-3 | 12px | Padding internal kartu, margin ketat |
| space-4 | 16px | Padding standar, spasi nav |
| space-5 | 20px | Jarak antar kartu produk |
| space-6 | 24px | Padding internal seksi, jarak grid |
| space-7 | 32px | Pemisah seksi |
| space-8 | 48px | Padding seksi utama |
| space-9 | 64px | Padding seksi hero |
| space-10 | 80px | Spasi seksi besar |

### Grid & Kontainer

- Lebar kontainer maksimum: 1920px
- Lebar konten standar: ~1440px dengan padding horizontal
- Grid produk: 3 kolom di desktop, 2 kolom di tablet, 1 kolom di mobile
- Grid kategori: 3 kolom dengan gambar full-bleed
- Jarak grid: 4-12px di antara kartu produk (sengaja ketat)
- Padding horizontal: 48px desktop, 24px tablet, 16px mobile

### Filosofi Ruang Kosong

Strategi ruang kosong Nike sengaja bersifat agresif — bukan dengan cara mewah dan longgar seperti merek fashion, melainkan dengan cara yang kompak dan padat yang mengisi setiap piksel dengan konten atau ketiadaan yang disengaja. Grid produk menggunakan jarak minimal (4-12px) untuk menciptakan rasa kelimpahan dan pilihan. Pemisah seksi dibuat lega (48-80px) untuk memisahkan konteks belanja. Efek keseluruhannya adalah sebuah toko yang terasa penuh dengan produk namun tetap mudah dinavigasi — seperti superstore olahraga yang terorganisir dengan baik.

### Skala Border Radius

| Nilai | Konteks |
|-------|---------|
| 0px | Gambar produk, fotografi hero (tepi tajam) |
| 8px | Input formulir (bukan pencarian) |
| 18px | Elemen interaktif kecil |
| 20px | Kontainer, kartu dengan konten UI |
| 24px | Input pencarian, pil medium |
| 30px | Tombol, tag, filter (pil penuh) |
| 50% | Tombol ikon melingkar, placeholder avatar |

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Flat | Tanpa bayangan, tanpa border | Status default untuk semua elemen |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Garis inset halus antar seksi |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Cincin fokus keyboard |
| Overlay | Scrim gelap di atas fotografi | Keterbacaan teks di atas gambar |

Filosofi elevasi Nike secara radikal bersifat datar. Tidak ada bayangan kartu, tidak ada efek angkat saat hover, tidak ada elemen melayang. Kedalaman dikomunikasikan semata-mata melalui warna — seksi gelap terlihat jauh, seksi terang terlihat dekat, pergeseran abu-abu menunjukkan perubahan status. Kerataan ini memperkuat kepribadian merek yang atletis dan langsung: tidak ada hiasan visual, hanya komunikasi langsung. Satu-satunya "bayangan" dalam keseluruhan sistem adalah garis pemisah inset 1px dan cincin fokus yang diperlukan untuk aksesibilitas.

### Kedalaman Dekoratif

- **Overlay fotografi hero**: Scrim gradien gelap di atas fotografi full-bleed untuk keterbacaan teks
- **Gradien latar belakang produk**: Latar belakang berwarna di belakang foto produk hero (misalnya, sepatu merah di atas gradien merah)
- **Bar spanduk**: Strip promosi solid gelap (#111111) di bagian atas halaman

## 7. Yang Harus dan Tidak Boleh Dilakukan

### Lakukan

- Gunakan Nike Black (#111111) untuk semua teks utama — jangan gunakan #000000 murni
- Pertahankan tombol berbentuk pil (radius 30px) dan batasi pada varian primer/sekunder
- Gunakan fotografi full-bleed tepi-ke-tepi untuk seksi hero — tanpa border radius pada gambar
- Biarkan fotografi produk memberikan semua kecerahan warna; pertahankan UI monokromatik
- Gunakan Nike Futura ND uppercase HANYA untuk headline display (96px ke atas)
- Pertahankan jarak grid produk yang ketat (4-12px) untuk kesan padat dan berlimpah
- Gunakan Grey-100 (#F5F5F5) untuk semua latar belakang input dan placeholder
- Cadangkan warna secara eksklusif untuk makna semantik (merah=kesalahan, hijau=berhasil, biru=tautan)
- Gunakan weight 500 (Medium) untuk semua elemen teks interaktif

### Jangan

- Jangan tambahkan bayangan pada kartu — model elevasi Nike sepenuhnya datar
- Jangan gunakan border radius pada gambar produk — hanya elemen UI yang mendapat sudut membulat
- Jangan perkenalkan warna merek di luar skala abu-abu untuk elemen UI
- Jangan gunakan Nike Futura ND di bawah 24px — ini eksklusif sebagai wajah display
- Jangan tambahkan efek angkat saat hover — kartu Nike tidak beranimasi saat hover
- Jangan gunakan weight reguler (400) untuk tombol atau tautan — selalu gunakan 500
- Jangan tempatkan latar belakang berwarna di belakang elemen UI — warna dicadangkan untuk konteks produk
- Jangan gunakan lebih dari dua level hierarki teks per kartu (judul + body)
- Jangan tambahkan pemisah dekoratif — inset 1px adalah satu-satunya pola pemisah
- Jangan perlemah kontrasnya — desain Nike sengaja mendorong hitam-di-atas-putih ke batas maksimum

## 8. Perilaku Responsif

### Breakpoint

| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile | <640px | Satu kolom, nav hamburger, teks display mengecil, padding ketat 16px |
| Small Tablet | 640-768px | Grid produk 2 kolom dimulai, nav masih tersembunyi |
| Tablet | 768-960px | Grid 2 kolom, kartu kategori menyesuaikan, padding horizontal 24px |
| Small Desktop | 960-1024px | Nav melebar ke horizontal penuh, grid produk 3 kolom |
| Desktop | 1024-1440px | Tata letak penuh, nav melebar, grid 3 kolom, padding 48px |
| Large Desktop | >1440px | Kontainer max-width terpusat, margin meningkat, gambar hero full-bleed |

### Target Sentuh

- Target sentuh minimum: 44x44px (WCAG AAA)
- Ikon nav mobile: area sentuh 48x48px
- Kartu produk: seluruh permukaan dapat diketuk
- Pil filter: tinggi minimum 36px dengan padding 12px

### Strategi Penciutan

- **Navigasi**: Tautan kategori penuh → menu hamburger di bawah 960px; ikon pencarian, favorit, keranjang tetap terlihat
- **Grid produk**: 3 kol → 2 kol pada 960px → 1 kol pada 640px
- **Seksi hero**: Teks display mengecil dari 96px → 64px → 48px; gambar hero tetap full-bleed di semua ukuran
- **Kartu kategori**: 3 kol → 2 kol → 1 kol dengan gambar full-bleed yang dipertahankan
- **Padding seksi**: 80px → 48px → 32px → 24px seiring viewport menyempit
- **Spanduk promosi**: teks terlipat atau terpotong, mempertahankan latar belakang gelap

### Perilaku Gambar

- Gambar responsif melalui Nike CDN (`c.static-nike.com`) dengan parameter lebar
- Gambar produk: srcset dengan berbagai resolusi (w_320, w_640, w_960, w_1920)
- Gambar hero: full-bleed di semua breakpoint, rasio aspek berubah (16:9 desktop → 4:3 mobile)
- Lazy loading: native loading="lazy", placeholder grey-100 saat memuat
- Art direction: pemotongan hero berubah antara komposisi desktop dan mobile

## 9. Panduan Prompt untuk Agen

### Referensi Warna Cepat

- CTA utama: Nike Black (`#111111`)
- Latar belakang: White (`#FFFFFF`)
- Permukaan sekunder: Light Gray (`#F5F5F5`)
- Teks heading: Nike Black (`#111111`)
- Teks body / hover: Secondary Text (`#707072`)
- Border: Border Secondary (`#CACACB`)
- Error: Nike Red (`#D30005`)
- Tautan: Link Blue (`#1151FF`)

### Contoh Prompt Komponen

- "Buat seksi hero produk dengan fotografi full-bleed tepi-ke-tepi, tanpa border radius, overlay gradien gelap untuk teks, dan headline uppercase 96px/500 masif bergaya Nike Futura dengan line-height 0.90 dan tombol pil Nike Black (#111111) (radius 30px)"
- "Rancang grid kartu produk 3 kolom dengan gambar persegi (tanpa border radius), jarak 4px antar kartu, nama produk dalam 16px/500 Nike Black (#111111), harga dalam 14px/500, dan teks sekunder dalam Grey-500 (#707072)"
- "Bangun navigation bar putih sticky dengan logo rata kiri, tautan kategori terpusat dalam 16px/500 (#111111) dengan warna hover #707072, dan ikon pencarian rata kanan (radius 24px, background #F5F5F5), favorit, dan keranjang"
- "Buat strip spanduk promosi dengan background #111111, teks putih 12px/500 terpusat, dan padding vertikal 8px — lebar penuh, tanpa border radius"
- "Rancang tombol outlined sekunder dengan background transparan, border #CACACB 1.5px, radius pil 30px, teks #111111 16px/500, border hover menggelap ke #707072"

### Panduan Iterasi

Saat menyempurnakan layar yang sudah ada yang dibuat dengan sistem desain ini:
1. Fokus pada SATU komponen sekaligus
2. Referensikan nama warna spesifik dan kode hex dari dokumen ini
3. Ingat: fotografi produk adalah warnanya — UI tetap monokromatik
4. Gunakan skala abu-abu untuk perubahan status: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Jika sesuatu terasa terlalu berwarna di UI, kemungkinan besar memang begitu — Nike mempertahankan UI dalam skala abu-abu
6. Tipe display (Nike Futura) HARUS SELALU uppercase dan tidak pernah di bawah 24px
7. Tipe body (Helvetica Now) hampir selalu harus berweight 500 untuk elemen interaktif
