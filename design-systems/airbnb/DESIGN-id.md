# Design System Inspired by Airbnb

> Category: E-Commerce & Ritel
> Marketplace perjalanan. Aksen koral hangat, berbasis fotografi, antarmuka membulat.

## 1. Tema Visual & Atmosfer

Desain Airbnb tahun 2026 terasa seperti majalah perjalanan yang kebetulan menjadi aplikasi — kanvas putih bersih memberi jalan pada fotografi penuh layar, dan antarmuka itu sendiri menghilang agar listing dapat bernapas. Koral-merah muda Rausch yang khas (`#ff385c`) digunakan dengan hemat namun tak salah kenal: CTA pencarian, indikator tab aktif, tombol aksi utama, dan sesekali harga atau ikon hati wishlist. Semua yang lain adalah skala abu-abu yang disiplin, dengan `#222222` membawa hampir setiap baris teks.

Yang membuat sistem ini tak terbantahkan sebagai Airbnb adalah betapa besar *kepercayaan* yang ditempatkan pada konten. Foto properti ditampilkan dalam skala hero, 4:3 dengan perlakuan radius tepi-ke-tepi. Pergantian kategori terjadi melalui pemilih tri-tab (Rumah / Pengalaman / Layanan) yang menggunakan ikon bergambar render 3D (rumah dengan atap miring, balon udara panas, bel layanan) — fisik, taktil, hampir seperti mainan — dipasangkan dengan label `Airbnb Cereal VF` yang tajam. Ini adalah produk konsumen langka di mana render 3D dan antarmuka tipografi murni hadir berdampingan tanpa ketegangan.

Permukaan terbaru adalah lini produk **Pengalaman** — krom yang sama, namun kepadatan kartu yang lebih kaya, lebih banyak fotografi, dan panel pemesanan yang ditambatkan di tengah dengan harga rel-kanan yang menempel. Halaman detail listing (baik kamar maupun pengalaman) mengikuti template yang ketat: kisi gambar hero penuh layar → kartu pemesanan membulat yang tumpang tindih (menempel saat digulir) → fasilitas → ulasan (penghargaan Favorit Tamu menggunakan peringkat `4.81` besar di tengah dengan lockup lingkaran karangan bunga) → peta → profil tuan rumah → pengungkapan. Ritme ini konsisten baik saat memesan kamar maupun tur yacht.

**Karakteristik Utama:**
- Koral-merah muda Rausch (`#ff385c`) sebagai warna merek aksen tunggal, hanya digunakan untuk CTA utama dan tombol pencarian
- Fotografi penuh layar dalam format 4:3 / 16:9 dengan pembulatan sudut halus (14–20 px) sebagai kosakata visual utama
- Ikon kategori render 3D dipasangkan dengan tab tipografi — satu-satunya tempat sistem ini memperbolehkan ilustrasi
- Tombol ikon bulat `50%` (panah kembali, bagikan, favorit, panah karusel) tersebar di seluruh antarmuka
- `Airbnb Cereal VF` membawa setiap label, dari catatan hukum 8 px hingga heading seksi 28 px — sistem satu keluarga
- Pengkodean warna tingkat produk: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (ungu gelap `#460479`), Airbnb (koral Rausch)
- Lockup penghargaan Favorit Tamu — angka peringkat raksasa terpusat di antara dua karangan bunga laurel, salah satu momen paling dikenali dalam sistem
- Panel pemesanan menempel dengan tumpukan harga → tanggal → tamu, disematkan di rel kanan pada desktop, berubah menjadi bilah "Pesan" yang ditambatkan di bawah pada mobile
- Navigasi bawah mobile yang menempel (Jelajahi / Daftar Keinginan / Masuk) dengan tint Rausch status aktif

## 2. Palet Warna & Peran

### Primer
- **Rausch** (`#ff385c`): Koral-merah muda khas merek. Variabel CSS `--palette-bg-primary-core`. Digunakan untuk: tombol utama "Pesan", tombol kirim pencarian, garis bawah tab aktif, isian hati wishlist, penekanan harga. Warna dengan visibilitas tertinggi tunggal di setiap halaman.

### Sekunder & Aksen
- **Deep Rausch** (`#e00b41`): Varian yang lebih jenuh. Variabel CSS `--palette-bg-tertiary-core`. Digunakan untuk status tombol ditekan/aktif dan titik akhir gradien.
- **Plus Magenta** (`#92174d`): Variabel CSS `--palette-bg-primary-plus`. Warna merek untuk tingkat produk Airbnb Plus — penawaran listing yang dikurasi kelas atas.
- **Luxe Purple** (`#460479`): Variabel CSS `--palette-bg-primary-luxe`. Warna merek untuk tingkat produk Airbnb Luxe — sewa villa/perkebunan.
- **Info Blue** (`#428bff`): Variabel CSS `--palette-text-legal`. Digunakan untuk tautan hukum/informatif (syarat, privasi, pengungkapan) — satu-satunya warna tautan non-monokrom dalam sistem.

### Permukaan & Latar Belakang
- **Canvas White** (`#ffffff`): Latar belakang halaman default. Setiap kartu, setiap kontainer, setiap halaman detail dimulai di sini.
- **Soft Cloud** (`#f7f7f7`): Tint sub-permukaan halus yang digunakan pada latar belakang footer, pembungkus tampilan peta, dan bagian "segalanya" yang ingin mundur dari putih primer.
- **Hairline Gray** (`#dddddd`): Warna border 1 px yang ada di mana-mana — memisahkan kartu, baris fasilitas, panel ulasan, kolom footer. Kuda pekerja sistem tata letak.

### Netral & Teks
- **Ink Black** (`#222222`): Variabel CSS `--palette-text-primary`. Hampir-hitam sistem. Setiap heading, setiap paragraf teks, setiap label navigasi, setiap harga. Digunakan untuk ~90% dari semua teks di halaman.
- **Charcoal** (`#3f3f3f`): Variabel CSS `--palette-text-focused`. Digunakan dalam teks input yang difokuskan dan salinan penekanan satu langkah di bawah.
- **Ash Gray** (`#6a6a6a`): Variabel CSS `--palette-bg-tertiary-hover`. Label sekunder, salinan gaya subtitle "Sewa cottage" di bawah nama kota, tautan footer yang diredam.
- **Mute Gray** (`#929292`): Variabel CSS `--palette-text-link-disabled`. Tombol dinonaktifkan dan metadata prioritas rendah.
- **Stone Gray** (`#c1c1c1`): Pembagi tersier, goresan ikon, avatar placeholder.

### Semantik & Aksen
- **Error Red** (`#c13515`): Variabel CSS `--palette-text-primary-error`. Kesalahan validasi formulir, peringatan aksi destruktif.
- **Deep Error** (`#b32505`): Variabel CSS `--palette-text-secondary-error-hover`. Varian ditekan/aktif dari status kesalahan.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Variabel CSS `--palette-text-material-disabled`. Label bergaya material yang dinonaktifkan.

### Sistem Gradien
Gradien merek Airbnb muncul dengan hemat, biasanya hanya pada wordmark dan momen tombol pencarian bermerek:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Sapuan koral → magenta ini adalah "momen bermerek" — tidak pernah digunakan sebagai permukaan penuh, hanya sebagai isian pil sempit atau perlakuan logo.

## 3. Aturan Tipografi

### Keluarga Font
- **Airbnb Cereal VF** (primer dan satu-satunya): Sans-serif berbobot variabel yang membawa seluruh sistem. Fallback (secara berurutan): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Bobot yang diamati dalam token yang diekstrak: 500, 600, 700. Tidak ada 400-reguler — bobot "tubuh" sistem adalah 500, yang memberikan setiap blok teks kepadatan ekstra halus yang terbaca sebagai percaya diri dan disengaja.

Fitur OpenType: `salt` (alternatif stilistik) digunakan pada label 11 px dan 14 px berbobot 600 yang kompak — kemungkinan untuk angka yang lebih ketat dan pembentukan karakter khusus. Tidak ada fitur ligatur atau angka pecahan yang diamati.

### Hierarki

| Peran | Ukuran | Bobot | Tinggi Baris | Spasi Huruf | Catatan |
|------|------|--------|-------------|----------------|-------|
| Heading Seksi | 28 px / 1,75 rem | 700 | 1,43 | 0 | "Inspirasi untuk perjalanan masa depan" — heading tingkat halaman |
| Heading Sub-seksi | 22 px / 1,38 rem | 500 | 1,18 | -0,44 px | "Yang ditawarkan tempat ini", "Temui tuan rumah" — pembagi konten |
| Judul Kartu | 21 px / 1,31 rem | 700 | 1,43 | 0 | Heading panel ulasan, judul utama kartu |
| Judul Listing | 20 px / 1,25 rem | 600 | 1,20 | -0,18 px | "Tur Yacht Kelompok Kecil, Anggur & Buah Tak Terbatas" — headline listing di halaman detail |
| Subjudul Tebal | 16 px / 1,00 rem | 600 | 1,25 | 0 | Nama tuan rumah, nama kota |
| Teks Medium | 16 px / 1,00 rem | 500 | 1,25 | 0 | Teks tubuh utama di halaman detail |
| Tombol Besar | 16 px / 1,00 rem | 500 | 1,25 | 0 | "Pesan", "Jadi tuan rumah" |
| Tombol Default | 14 px / 0,88 rem | 500 | 1,29 | 0 | Label tombol standar |
| Tautan | 14 px / 0,88 rem | 500 | 1,43 | 0 | Tautan nav, tautan footer |
| Keterangan Medium | 14 px / 0,88 rem | 500 | 1,29 | 0 | Metadata, baris subtitle ("Sewa cottage", "Sewa villa") |
| Keterangan Tebal | 14 px / 0,88 rem | 600 | 1,43 | 0 | Fitur `salt` diaktifkan — statistik numerik, penekanan teks kecil |
| Keterangan Kecil | 13 px / 0,81 rem | 400 | 1,23 | 0 | Tanggal ulasan, micro-metadata |
| Mikro Default | 12 px / 0,75 rem | 400 | 1,33 | 0 | Disclaimer footer, micro-copy hukum |
| Mikro Tebal | 12 px / 0,75 rem | 700 | 1,33 | 0 | Label pil "BARU" |
| Badge Huruf Kapital | 11 px / 0,69 rem | 600 | 1,18 | 0 | Fitur `salt` — badge kategori/status kompak |
| Superskrip | 8 px / 0,50 rem | 700 | 1,25 | 0,32 px | Huruf kapital — catatan kaki harga, ekor desimal |

### Prinsip
- **Satu keluarga, banyak bobot.** Airbnb Cereal VF menangani segalanya dari teks hukum 8 px hingga heading halaman 28 px — identitas visual berasal dari keluarga itu sendiri, bukan dari pencampuran tipografi.
- **500 adalah 400 yang baru.** Bobot "reguler" sistem adalah 500, memberikan setiap paragraf tekstur yang sedikit lebih percaya diri dari default web.
- **Tracking negatif hanya pada tipe display.** Heading 20 px ke atas mengompresi tracking sebesar -0,18 hingga -0,44 px untuk terasa terpahat; ukuran tubuh tetap pada 0 tracking untuk keterbacaan.
- **Tinggi baris ketat untuk headline, longgar untuk tubuh.** Tipe display berjalan pada 1,18–1,25 (ketat); tubuh dan keterangan membuka diri ke 1,43 untuk kenyamanan bentuk panjang.
- **Tidak ada huruf kapital semua kecuali pada 8 px.** Satu-satunya transformasi huruf kapital dalam sistem adalah superskrip 8 px — di tempat lain, huruf kalimat dengan pergeseran bobot halus melakukan pekerjaan.

### Catatan tentang Pengganti Font
Airbnb Cereal VF adalah milik perusahaan. Pengganti open-source terdekat adalah **Circular Std** (masih komersial) atau **Inter** (gratis, Google Fonts) dengan spasi huruf dikurangi sebesar -0,01 em pada ukuran display. Untuk kesetiaan merek yang ketat, rantai fallback yang didokumentasikan (`Circular, -apple-system, system-ui`) merender dengan layak pada macOS/iOS di mana `system-ui` diselesaikan ke San Francisco, yang memiliki proporsi serupa.

## 4. Penataan Gaya Komponen

### Tombol

**CTA Utama** ("Pesan", "Cari", "Tambah tanggal")
- Latar belakang: Rausch `#ff385c`
- Teks: Canvas White `#ffffff`, Airbnb Cereal 500, 16 px
- Padding: ~14 px vertikal, 24 px horizontal
- Radius: 8 px (persegi panjang) atau 50% (varian ikon bulat)
- Border: tidak ada
- Aktif/ditekan: `transform: scale(0.92)` ditambah cincin fokus 2 px `#222222` pada `0 0 0 2px`

**Tombol Sekunder** ("Jadi tuan rumah", aksi tersier dengan garis tepi)
- Latar belakang: `#ffffff`
- Teks: Ink Black `#222222`, Airbnb Cereal 500, 14–16 px
- Padding: 10 px 16 px
- Radius: 20 px (pil) atau 8 px (persegi panjang)
- Border: 1 px solid Hairline Gray `#dddddd`

**Tombol Hanya Ikon Bulat** (panah kembali, bagikan, favorit, kontrol karusel)
- Latar belakang: `#f2f2f2` (putih sedikit mati) atau putih dengan border hitam transparan 1 px
- Ikon: goresan garis `#222222`, 16–20 px
- Ukuran: diameter 32–44 px
- Radius: 50%
- Aktif/ditekan: `transform: scale(0.92)`; cincin putih halus 4 px `0 0 0 4px rgb(255,255,255)` untuk memisahkan dari latar belakang fotografi berwarna

**Tombol Dinonaktifkan**
- Latar belakang: `#f2f2f2`
- Teks: Stone Gray `#c1c1c1`
- Opasitas: 0,5

**Tombol Tab Pil** (pemilih kategori "Rumah / Pengalaman / Layanan")
- Latar belakang: transparan
- Teks: Ink Black `#222222`, Airbnb Cereal 500, 16 px
- Padding: 8 px 14 px
- Status aktif: garis bawah Ink Black 2 px di bawah label
- Dipasangkan dengan ikon bergambar render 3D 36–48 px di atas label

### Kartu & Kontainer

**Kartu Listing** (kisi beranda, hasil pencarian)
- Latar belakang: `#ffffff`
- Radius: 14 px pada gambar, teks duduk langsung di bawah pada latar belakang transparan
- Gambar: rasio 4:3, penuh layar, dibulatkan dengan radius 14 px yang sama
- Padding: tidak ada pada kontainer luar; 12 px jarak antara gambar dan baris metadata
- Bayangan: tidak ada — pemisahan berasal dari ruang putih dan radius intrinsik foto
- Pola metadata: Kota/wilayah di baris 1 (16 px 600), jarak/durasi di baris 2 (14 px 500 Ash Gray), rentang tanggal di baris 3, baris harga dengan "per malam" di bagian bawah

**Panel Pemesanan Halaman Detail** (rel kanan yang menempel di halaman kamar/pengalaman)
- Latar belakang: `#ffffff`
- Radius: 14–20 px
- Border: 1 px solid Hairline Gray `#dddddd`
- Bayangan: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — elevasi halus tiga lapis yang ditumpuk
- Padding: 24 px
- Lebar: ~370 px, disematkan 120–140 px di bawah bagian atas viewport
- Konten: headline harga → pemilih tanggal → dropdown tamu → CTA utama → catatan kaki "Anda belum akan ditagih"

**Kartu Kisi Fasilitas** (di halaman detail listing)
- Latar belakang: `#ffffff`
- Border: 1 px solid Hairline Gray `#dddddd` pada tingkat baris (bukan per item)
- Padding: 16 px vertikal per baris fasilitas
- Pola ikon + label: ikon garis 24 px di sebelah kiri, label berbobot 500 16 px di sebelah kanan

**Kartu Ulasan** (ulasan individual di halaman detail)
- Latar belakang: `#ffffff`, tidak ada border
- Padding: 0 (mengandalkan celah kisi)
- Konten: avatar bulat 40 px + nama berbobot 600 16 px + tanggal Ash Gray 400 14 px dalam satu baris, kemudian paragraf tubuh berbobot 500 14 px di bawah

### Input & Formulir

**Bilah Pencarian** (beranda utama)
- Latar belakang: `#ffffff`
- Border: 1 px solid Hairline Gray `#dddddd` membungkus ketiga segmen (Di mana / Kapan / Siapa)
- Radius: 32 px (pil penuh)
- Bayangan: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — rasa mengambang yang halus
- Struktur: tiga segmen dibagi oleh pembagi vertikal tipis, setiap segmen memiliki label berbobot 500 12 px di atas placeholder berbobot 500 14 px
- Kirim: tombol ikon bulat Rausch di tepi kanan, diameter 48 px

**Input Teks** (formulir generik)
- Latar belakang: `#ffffff`
- Border: 1 px solid Hairline Gray `#dddddd`
- Radius: 8 px
- Padding: 14 px 16 px
- Fokus: border beralih ke Ink Black, menambahkan cincin luar hitam `0 0 0 2px`
- Kesalahan: border beralih ke `#c13515` (Error Red), teks pembantu menggunakan warna yang sama

**Pemilih Tanggal**
- Kisi kalender: tata letak 7 kolom, sel hari bulat `50%` lebar 40–44 px
- Rentang yang dipilih: latar belakang Ink Black `#222222` dengan angka putih
- Jangkar awal/akhir: lingkaran terisi yang lebih besar; tanggal tengah menggunakan tint Soft Cloud `#f7f7f7`

### Navigasi

**Nav Atas (Desktop)**
- Tinggi: ~80 px
- Latar belakang: `#ffffff`
- Kiri: lockup wordmark+logo Airbnb dalam Rausch (102×32 px)
- Tengah: pemilih kategori tri-tab (Rumah / Pengalaman / Layanan) dengan ikon 3D 36–48 px ditumpuk di atas label berbobot 500 16 px; tab aktif memiliki garis bawah Ink Black 2 px
- Kanan: tautan teks "Jadi tuan rumah", kemudian globe bulat 32 px (bahasa), kemudian menu avatar hamburger 36 px
- Border bawah: 1 px solid Hairline Gray `#dddddd`

**Nav Atas (Mobile)**
- Pil pencarian satu baris menempati lebar penuh: placeholder "Mulai pencarian Anda" dengan ikon kaca pembesar kecil
- Di bawah: pemilih kategori tri-tab bertahan (Rumah / Pengalaman / Layanan) — ikon bergambar menyusut ke ~28 px
- Bilah tab yang disematkan di bawah: Jelajahi (status aktif Rausch) / Daftar Keinginan / Masuk — ikon 24 px di atas label 12 px

**Nav Sekunder Halaman Detail Listing**
- Guliran horizontal yang menempel dari tautan jangkar (Foto · Fasilitas · Ulasan · Lokasi · Tuan Rumah) muncul saat menggulir melewati gambar hero
- Tinggi: 56 px
- Border bawah: 1 px solid Hairline Gray

### Perlakuan Gambar

- **Rasio aspek utama**: 4:3 untuk kisi listing beranda, 16:9 untuk fotografi hero pengalaman, 1:1 untuk avatar
- **Radius**: 14 px pada gambar kisi listing, 20 px pada bingkai foto hero halaman detail, `50%` pada avatar
- **Kisi gambar di halaman detail**: kisi lima foto dengan satu gambar besar di sebelah kiri (lebar 50%) dan empat foto lebih kecil dalam kisi 2×2 di sebelah kanan, semua berbagi kontainer membulat luar 20 px
- **Lazy loading**: penggunaan intensif `loading="lazy"` dengan pratinjau placeholder yang dikaburkan
- **Karusel**: tombol panah bulat 32 px melapisi gambar, dipusatkan secara vertikal; indikator titik duduk 12 px di atas tepi bawah

### Komponen Khas

**Lockup Penghargaan Favorit Tamu** (ditampilkan secara menonjol di halaman detail listing dengan peringkat tinggi)
- Angka peringkat terpusat dirender pada 44–56 px berbobot 700
- Dua ilustrasi SVG karangan bunga laurel yang digambar tangan mengapit kiri dan kanan pada ~48 px tinggi
- Di bawah: label "Favorit Tamu" pada 12 px 700 huruf kapital dengan tracking `0,32 px`, dan sub-label pendek pada 14 px 500 Ash Gray
- Blok lebar penuh, tidak ada border kontainer — duduk langsung di atas kanvas putih

**Pemilih Kategori Tri-Tab** (muncul di bagian atas setiap permukaan penelusuran)
- Tiga tab: Rumah / Pengalaman / Layanan
- Setiap tab: ikon bergambar render 3D (~48 px tinggi) di atas label berbobot 500 16 px
- Pengalaman dan Layanan saat ini membawa pil "BARU" biru navy kecil (teks putih 12 px 700 pada latar belakang biru gelap) yang mengambang di kanan atas ikon
- Tab aktif: garis bawah Ink Black 2 px di bawah label

**Kisi Kota Inspirasi** (beranda "Inspirasi untuk perjalanan masa depan")
- Kisi 6 kolom tautan destinasi di desktop, 2 kolom di mobile
- Setiap sel: nama kota 16 px 600 di baris 1, subtitle tipe sewa Ash Gray 500 14 px di baris 2 ("Sewa cottage", "Sewa villa")
- Tidak ada gambar — kisi hanya teks
- Dengan tab di atas berdasarkan kategori (Populer / Seni & budaya / Pantai / Pegunungan / Alam terbuka / Hal yang bisa dilakukan / Tips perjalanan & inspirasi / Apartemen ramah Airbnb) — tab aktif memiliki garis bawah 2 px dan pergeseran bobot

**Kartu Pesan Tetap** (halaman detail listing)
- Tetap tersemat 120 px di bawah bagian atas viewport di desktop saat pengguna menggulir melewati hero
- Mengempis menjadi bilah bawah lebar penuh di mobile dengan label "Dari $X / malam" dan pil Rausch "Pesan"
- Selalu menampilkan: headline harga → tampilan tanggal → pemilih tamu → CTA Rausch → disclaimer "Anda belum akan ditagih"

**Kartu Tuan Rumah Pengalaman** (halaman detail pengalaman)
- Kontainer membulat lebar penuh dengan foto sampul 3:2 di atas
- Avatar tuan rumah (bulat, 56 px) tumpang tindih tepi bawah sampul sebesar 50%
- Di bawah tumpang tindih: nama tuan rumah pada 16 px 700, lama tuan rumah pada 14 px 500 Ash Gray, tombol pil Rausch kecil "Hubungi tuan rumah"
- Digunakan sebagai transisi antara ulasan dan blok fasilitas/lokasi

**Strip "Hal yang perlu diketahui"** (halaman detail listing)
- Kisi 3 kolom blok aturan/kebijakan (Aturan rumah, Keamanan & properti, Kebijakan pembatalan)
- Setiap kolom: ikon di atas, heading 16 px 600, tubuh Ash Gray 14 px 500, tautan "Tampilkan lebih banyak" dalam garis bawah Ink Black
- Pemisah: border atas dan bawah Hairline Gray 1 px pada seluruh strip

## 5. Prinsip Tata Letak

### Sistem Spasi
- **Unit dasar**: 8 px
- **Skala yang diekstrak**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32 px — granular dengan segelintir nilai di luar kisi yang digunakan untuk penyelarasan ikon yang sempurna piksel
- **Padding seksi**: ~48–64 px atas/bawah di desktop, 24–32 px di mobile
- **Padding internal kartu**: 24 px pada panel pemesanan dan kartu besar, 16 px pada baris fasilitas, 12 px pada metadata kartu listing
- **Celah antar kartu listing**: 24 px desktop, 16 px mobile
- **Antara baris teks bertumpuk**: 4–8 px (sangat ketat — memperkuat rasa "informasi padat" dari listing perjalanan)

### Kisi & Kontainer
- **Lebar konten maksimum**: 1760–1920 px pada ultra-wide (Airbnb membiarkan kisi bernafas lebih jauh dari kebanyakan situs); 1280 px di sebagian besar halaman detail
- **Kisi listing beranda**: 6 kolom pada ≥1760 px, 5 pada ≥1440 px, 4 pada ≥1128 px, 3 pada ≥800 px, 2 pada ≥550 px, 1 di bawahnya
- **Halaman detail**: 2 kolom asimetris — konten utama ~58%, panel pemesanan tetap ~36% di sebelah kanan, ~6% celah
- **Footer**: 3 kolom Dukungan / Hosting / Airbnb

### Filosofi Ruang Putih
Airbnb sangat informatif namun tidak pernah sempit. Ruang putih digunakan untuk *mengelompokkan* — kartu listing memiliki 24 px celah sehingga setiap foto terbaca sebagai objek yang berbeda, tetapi metadata di bawah setiap kartu menggunakan celah 4–8 px sehingga harga/kota/tanggal terasa seperti satu unit. Panel pemesanan halaman detail memiliki padding internal 24 px, tetapi baris di dalamnya (pemilih tanggal, pemilih tamu, CTA) ditumpuk pada 12 px — batas antara kartu dan halaman melakukan lebih banyak pekerjaan pemisahan daripada konten di dalamnya.

### Skala Radius Border
| Radius | Penggunaan |
|--------|-----|
| 4 px | Tag jangkar inline, chip tag |
| 8 px | Tombol teks, dropdown, tombol utilitas kecil |
| 14 px | Fotografi kartu listing, kontainer konten generik, badge |
| 20 px | Tombol membulat utama (bentuk pil), gambar besar, panel pemesanan |
| 32 px | Pil bilah pencarian, kontainer ekstra besar |
| 50% | Semua tombol ikon bulat, semua avatar, hati wishlist — geometri bulat khas sistem |

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| 0 | Tanpa bayangan | Kartu listing, konten tubuh, bagian hanya teks |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Tombol ikon aktif/ditekan (mis. kembali, bagikan, favorit) — angkatan halus untuk menunjukkan interaksi |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Kartu panel pemesanan tetap, modal, menu dropdown — elevasi tiga lapis khas sistem |
| Cincin Fokus | `0 0 0 2px #222222` | Tombol status aktif, input pencarian yang difokuskan |
| Cincin Pemisah Putih | `rgb(255, 255, 255) 0 0 0 4px` | Tombol bulat yang dilapisi pada foto — cincin putih 4 px dengan bersih memisahkan tombol dari latar belakang gambar berwarna |

Filosofi bayangan: Airbnb menggunakan **bayangan berlapis bertumpuk** daripada satu bayangan tunggal. Bayangan tiga lapis panel pemesanan terbaca sebagai satu angkatan yang kohesif tetapi sebenarnya adalah tiga bayangan terpisah pada nilai opasitas/keburaman yang berbeda — menciptakan anti-aliasing halus di perimeter bayangan yang terasa premium tanpa menjadi berat.

### Kedalaman Dekoratif
- **Fotografi sebagai kedalaman**: sistem sangat mengandalkan fotografi penuh layar untuk menciptakan kedalaman visual; bayangan dan gradien digunakan dengan hemat sehingga foto melakukan pekerjaan berat
- **Lockup karangan bunga laurel**: penghargaan Favorit Tamu menggunakan dua ilustrasi SVG laurel yang memberikan angka peringkat yang sebaliknya datar sebuah kehadiran seremonial, seperti piala
- **Ikon kategori render 3D**: ikon Rumah/Pengalaman/Layanan memiliki pencahayaan internal lembut mereka sendiri dan bayangan lempar halus yang dipanggang dalam karya seni — satu-satunya tempat merek memperbolehkan ilustrasi "dimensional"

## 7. Yang Boleh dan Tidak Boleh

### Yang Boleh
- Cadangkan Rausch `#ff385c` untuk aksi utama dan indikator tab aktif — jangan pernah mengencerkannya dengan penggunaan dekoratif.
- Biarkan fotografi bernafas — potongan 4:3 dengan sudut membulat 14–20 px, tidak ada teks yang dilapisi, tidak ada penutup gradien.
- Gunakan Ink Black `#222222` untuk setiap lapisan teks di bawah Rausch — ini adalah hampir-hitam sistem, tidak pernah `#000000` yang sesungguhnya.
- Pasangkan ikon bergambar 3D pemilih kategori tri-tab dengan tipografi datar — jangan mencampur gaya ilustrasi dalam satu permukaan.
- Tumpuk tiga bayangan buram rendah (~2%, 4%, 10%) untuk menciptakan elevasi panel pemesanan yang khas.
- Gunakan border Hairline Gray `#dddddd` 1 px untuk setiap pembagi kartu-ke-kartu dan baris-ke-baris.
- Perlakukan panel pemesanan sebagai tetap di desktop, mengempis menjadi bilah pesan yang ditambatkan di bawah di mobile.
- Gunakan spasi 4–8 px dalam grup metadata dan 24 px antar kartu — kepadatan informasi adalah disengaja.

### Yang Tidak Boleh
- Jangan memperkenalkan warna aksen sekunder di luar palet tingkat produk Rausch / Plus Magenta / Luxe Purple.
- Jangan menempatkan teks di dalam foto — keterangan selalu duduk di bawah gambar, tidak pernah dilapisi.
- Jangan menggunakan label huruf kapital semua kecuali untuk peran superskrip 8 px tunggal.
- Jangan membulatkan tombol ikon ke apapun selain 50% — bulat adalah geometri khas sistem.
- Jangan menambahkan bayangan ke kartu listing — mereka duduk di atas kanvas putih tanpa elevasi.
- Jangan menggunakan latar belakang gradien — satu-satunya gradien dalam sistem adalah sapuan Rausch → magenta yang sempit pada wordmark.
- Jangan menggunakan bobot font 400-regular — bobot tubuh Airbnb Cereal adalah 500.
- Jangan mengganti Airbnb Cereal VF dengan typeface display yang berbeda — sistem ini sengaja satu keluarga.

## 8. Perilaku Responsif

### Breakpoint

Airbnb mendeklarasikan ~60 breakpoint (artefak waktu desain dari pustaka komponen mereka), tetapi pergeseran tata letak yang berarti terjadi pada kumpulan yang jauh lebih kecil:

| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Ultra-wide | ≥1760 px | Kisi listing 6 kolom, lebar konten maksimum 1760–1920 px |
| Desktop XL | 1440–1759 px | Kisi 5 kolom, nav penuh terlihat, panel pemesanan tetap di rel kanan |
| Desktop | 1128–1439 px | Kisi 4 kolom, panel pemesanan tetap bertahan |
| Laptop | 1024–1127 px | Kisi 3–4 kolom, nav kategori tetap horizontal |
| Tablet | 800–1023 px | Kisi 3 kolom, pencarian global dapat mengempis menjadi pil satu baris |
| Tablet kecil | 550–799 px | Kisi 2 kolom, panel pemesanan turun ke blok inline lebar penuh |
| Mobile | 375–549 px | Tata letak bertumpuk 1 kolom, bilah tab yang disematkan di bawah muncul (Jelajahi / Daftar Keinginan / Masuk) |
| Mobile kecil | <375 px | Padding tepi mengencang ke 16 px; ikon pemilih kategori menyusut ke ~28 px |

### Target Sentuh
Semua elemen interaktif memenuhi atau melebihi 44×44 px. Keluarga tombol ikon bulat secara khusus berukuran 32–44 px dengan padding area hit yang diperluas 8–12 px. Tombol Pesan Rausch utama adalah ~48 px tinggi. Area hit pemilih kategori tri-tab adalah seluruh persegi panjang label-plus-ikon (biasanya ~64×80 px per tab).

### Strategi Mengempis
- **Nav**: Nav atas mempertahankan wordmark Airbnb + pemilih tri-tab di tablet dan lebih besar; di mobile pemilih meluncur tepat di bawah pil pencarian, dan kontrol globe/avatar berpindah ke bilah tab yang ditambatkan di bawah.
- **Bilah pencarian**: Pil tiga segmen (Di mana / Kapan / Siapa) dengan tombol kirim bulat Rausch di desktop; mengempis menjadi pil "Mulai pencarian Anda" satu baris di mobile, mengetuknya membuka lembar pencarian layar penuh.
- **Panel pemesanan**: Rel kanan tetap pada ≥1128 px; inline dalam kolom konten utama antara 800–1127 px; pil "Pesan" yang disematkan di bawah pada <800 px.
- **Kisi listing**: Mengalir 6 → 5 → 4 → 3 → 2 → 1 kolom di seluruh breakpoint.
- **Kisi gambar halaman detail**: Tata letak lima gambar (1 besar + 4 kecil) di desktop; menjadi karusel penuh layar yang dapat digesek di mobile dengan indikator titik halaman.
- **Footer**: Tata letak 3 kolom mengempis menjadi satu kolom bertumpuk pada <800 px.

### Perilaku Gambar
- `loading="lazy"` universal, dengan thumbnail pratinjau `im_w=` yang diparameter URL yang dikaburkan disajikan terlebih dahulu
- Gambar responsif menggunakan CDN `muscache.com` Airbnb dengan parameter kueri `im_w` untuk pengiriman berbasis lebar (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Tidak ada pemotongan art-direction — gambar yang sama diskalakan naik/turun di seluruh breakpoint
- Karusel secara otomatis menyesuaikan tinggi foto untuk mempertahankan rasio 4:3 yang konsisten terlepas dari aspek sumber

## 9. Panduan Prompt untuk Agen

### Referensi Warna Cepat
- CTA utama: "Rausch (#ff385c)"
- Latar belakang halaman: "Canvas White (#ffffff)"
- Sub-permukaan: "Soft Cloud (#f7f7f7)"
- Teks heading/tubuh: "Ink Black (#222222)"
- Teks sekunder: "Ash Gray (#6a6a6a)"
- Border/pembagi: "Hairline Gray (#dddddd)"
- Kesalahan: "Error Red (#c13515)"
- Tautan info: "Info Blue (#428bff)"
- Aksen tingkat Luxe: "Luxe Purple (#460479)"
- Aksen tingkat Plus: "Plus Magenta (#92174d)"

### Contoh Prompt Komponen
- "Buat tombol Pesan utama: latar belakang Rausch (`#ff385c`), label putih Airbnb Cereal berbobot 500 pada 16 px, padding 14 px × 24 px, border-radius 8 px, tanpa bayangan. Pada aktif/ditekan tambahkan `transform: scale(0.92)` dengan cincin fokus Ink Black 2 px (`0 0 0 2px #222222`)."
- "Buat kartu listing dengan foto penuh layar 4:3 pada border-radius 14 px, tanpa bayangan kontainer; di bawah gambar tumpuk tiga baris teks dengan celah 4 px: nama kota pada 16 px 600 Ink Black, tipe sewa pada 14 px 500 Ash Gray (`#6a6a6a`), dan rentang harga dalam 16 px 500 Ink Black dengan sufiks `per malam` 14 px."
- "Rancang panel pemesanan tetap: latar belakang putih, border-radius 14 px, border Hairline Gray (`#dddddd`) 1 px, bayangan elevasi 3 lapis (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), padding 24 px, lebar 370 px, disematkan 120 px di bawah bagian atas viewport di desktop. Konten: headline harga, pemilih tanggal, dropdown tamu, CTA utama Rausch, dan disclaimer Ash Gray 12 px `Anda belum akan ditagih`."
- "Buat pemilih kategori tri-tab: tiga tab dengan lebar yang sama berlabel Rumah, Pengalaman, Layanan; setiap tab memiliki ikon bergambar render 3D ~48 px (rumah, balon, bel) di atas label Ink Black berbobot 500 16 px; tab aktif mendapat garis bawah Ink Black 2 px; tambahkan pil `BARU` putih kecil 12 px 700 pada latar belakang biru navy gelap di kanan atas ikon Pengalaman dan Layanan."
- "Render lockup penghargaan Favorit Tamu: angka peringkat terpusat pada 52 px berbobot 700 Ink Black, diapit kiri dan kanan oleh karangan bunga SVG laurel yang digambar tangan pada ~48 px tinggi; di bawah, label huruf kapital `FAVORIT TAMU` 12 px 700 dengan tracking 0,32 px; sub-label pada 14 px 500 Ash Gray; blok lebar penuh duduk langsung di atas kanvas putih tanpa border kontainer."

### Panduan Iterasi
Saat menyempurnakan layar yang ada yang dibuat dengan sistem desain ini:
1. Fokus pada SATU komponen sekaligus.
2. Rujuk nama warna spesifik dan kode hex dari dokumen ini (mis. "Ink Black #222222", bukan "abu-abu gelap").
3. Gunakan deskripsi bahasa alami di samping pengukuran ("elevasi tiga lapis halus" daripada string bayangan panjang).
4. Deskripsikan "rasa" yang diinginkan ("seperti majalah, fotografi-pertama" vs "utilitas padat").
5. Selalu default ke Airbnb Cereal VF berbobot 500 untuk tubuh dan 600–700 untuk penekanan — tidak pernah 400.
6. Jaga merah muda Rausch tetap langka — jika lebih dari satu elemen berwarna Rausch muncul per viewport, pertimbangkan apakah salah satunya harus dinetralisasi.

### Celah yang Diketahui
- **Kartu kisi listing beranda**: kisi kartu properti utama (permukaan visual utama airbnb.com) tidak sepenuhnya ditangkap dalam screenshot beranda yang diekstrak — konten hanya dimuat sebagian. Spesifikasi Kartu Listing di atas disimpulkan dari struktur kisi Inspirasi dan konvensi Airbnb yang lebih luas; konfirmasikan rasio aspek yang tepat dan hierarki metadata terhadap situs langsung sebelum digunakan dalam produksi.
- **Ikon kategori Pengalaman**: ikon bergambar 3D untuk Rumah / Pengalaman / Layanan disajikan sebagai aset raster; spesifikasi file sumber yang tepat (SVG vs PNG, dimensi piksel yang dirender) tidak didokumentasikan di sini.
- **Timing animasi dan transisi**: tidak ditangkap — ruang lingkup ekstraksi statis.
- **Mode gelap**: Airbnb tidak mengirimkan mode gelap asli dalam permukaan produk yang diekstrak; dokumen ini hanya mendeskripsikan tema mode terang tunggal.
