# Sistem Desain Terinspirasi dari Cohere

> Kategori: AI & LLM
> Platform AI enterprise. Gradien vibran, estetika dasbor kaya data.

## 1. Tema Visual & Atmosfer

Antarmuka Cohere adalah dasbor perintah enterprise yang disempurnakan — percaya diri, bersih, dan dirancang untuk membuat AI terasa seperti infrastruktur serius, bukan mainan konsumen. Pengalamannya bertumpu pada kanvas putih cerah di mana konten diatur dalam kartu-kartu bertepi melengkung (radius 22px) yang menciptakan bahasa wadah organik menyerupai awan. Ini adalah situs yang berbicara kepada CTO dan arsitek enterprise: profesional tanpa terasa dingin, canggih tanpa terasa mengintimidasi.

Bahasa desainnya menjembatani dua dunia dengan sistem dua jenis huruf: CohereText, serif display kustom dengan tracking ketat, memberikan judul bobot sebuah manifesto teknologi, sementara Unica77 Cohere Web menangani semua teks isi dan UI dengan presisi Swiss geometrik. Pasangan serif/sans ini menciptakan kepribadian "otoritas percaya diri bertemu kejelasan rekayasa" yang sempurna mencerminkan platform AI enterprise.

Warna digunakan dengan sangat hemat — antarmukanya hampir seluruhnya hitam-putih dengan border abu-abu sejuk (`#d9d9dd`, `#e5e7eb`). Ungu-violet hanya muncul di band hero fotografi, seksi gradien, dan biru interaktif (`#1863dc`) yang menandai status hover dan fokus. Penghematan kromatik ini berarti ketika warna MEMANG muncul — dalam tangkapan layar produk, fotografi enterprise, dan seksi ungu gelap — warna tersebut membawa bobot visual maksimal.

**Karakteristik Utama:**
- Kanvas putih cerah dengan border penahanan abu-abu sejuk
- Radius border 22px khas — kekhasan "kartu Cohere" yang membulat
- Dua jenis huruf kustom: CohereText (serif display) + Unica77 (sans isi)
- Penghematan kromatik berkelas enterprise: hitam, putih, abu-abu sejuk, aksen ungu-biru minimal
- Seksi hero ungu/violet gelap yang memberikan kontras dramatis
- Tombol ghost/transparan yang berubah ke biru saat hover
- Fotografi enterprise menampilkan beragam aplikasi dunia nyata
- CohereMono untuk kode dan label teknis dengan transformasi huruf kapital

## 2. Palet Warna & Peran

### Primer
- **Cohere Black** (`#000000`): Teks judul primer dan elemen penekanan maksimal.
- **Near Black** (`#212121`): Warna tautan isi standar — sedikit lebih lembut dari hitam murni.
- **Deep Dark** (`#17171c`): Hampir-hitam bernuansa biru untuk navigasi dan teks seksi gelap.

### Sekunder & Aksen
- **Interaction Blue** (`#1863dc`): Aksen interaktif primer — muncul pada hover tombol, status fokus, dan tautan aktif. Satu-satunya warna aksi kromatik.
- **Ring Blue** (`#4c6ee6` pada 50%): Warna ring Tailwind untuk indikator fokus keyboard.
- **Focus Purple** (`#9b60aa`): Warna border fokus input — violet yang diredam.

### Permukaan & Latar Belakang
- **Pure White** (`#ffffff`): Latar belakang halaman primer dan permukaan kartu.
- **Snow** (`#fafafa`): Permukaan yang sedikit lebih tinggi dan latar belakang seksi terang.
- **Lightest Gray** (`#f2f2f2`): Border kartu dan garis penahanan paling lembut.

### Netral & Teks
- **Muted Slate** (`#93939f`): Tautan footer yang dilemahkan dan teks tersier — abu-abu bernada sejuk dengan sedikit rona biru-violet.
- **Border Cool** (`#d9d9dd`): Border seksi dan item daftar standar — abu-abu sejuk, sedikit bernuansa ungu.
- **Border Light** (`#e5e7eb`): Varian border lebih terang — gray-200 standar Tailwind.

### Sistem Gradien
- **Band Hero Ungu-Violet**: Seksi gradien ungu gelap yang menciptakan kontras dramatis terhadap kanvas putih. Muncul sebagai band lebar penuh yang menampung tangkapan layar produk dan pesan utama.
- **Gradien Footer Gelap**: Halaman beralih melalui ungu gelap/arang menuju footer hitam, menciptakan efek "senja".

## 3. Aturan Tipografi

### Keluarga Font
- **Display**: `CohereText`, dengan fallback: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Isi / UI**: `Unica77 Cohere Web`, dengan fallback: `Inter, Arial, ui-sans-serif, system-ui`
- **Kode**: `CohereMono`, dengan fallback: `Arial, ui-sans-serif, system-ui`
- **Ikon**: `CohereIconDefault` (font ikon kustom)

### Hierarki

| Peran | Font | Ukuran | Ketebalan | Tinggi Baris | Spasi Huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (ketat) | -1.44px | Dampak maksimal, otoritas serif |
| Display Sekunder | CohereText | 60px (3.75rem) | 400 | 1.00 (ketat) | -1.2px | Judul seksi besar |
| Judul Seksi | Unica77 | 48px (3rem) | 400 | 1.20 (ketat) | -0.48px | Judul seksi fitur |
| Sub-judul | Unica77 | 32px (2rem) | 400 | 1.20 (ketat) | -0.32px | Judul kartu, nama fitur |
| Judul Fitur | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Judul seksi lebih kecil |
| Isi Besar | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Paragraf pengantar |
| Isi / Tombol | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Isi standar, teks tombol |
| Tombol Medium | Unica77 | 14px (0.88rem) | 500 | 1.71 (longgar) | normal | Tombol lebih kecil, label ditekankan |
| Keterangan | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadata, deskripsi |
| Label Kapital | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Label seksi huruf kapital |
| Kecil | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Teks terkecil, tautan footer |
| Kode Mikro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Label kode kapital sangat kecil |

### Prinsip
- **Serif untuk deklarasi, sans untuk utilitas**: CohereText membawa suara merek di skala display — terminal serifnya memberikan judul otoritas publikasi penelitian. Unica77 menangani semua yang fungsional dengan netralitas Swiss-geometrik.
- **Tracking negatif pada skala besar**: CohereText menggunakan spasi huruf -1.2px hingga -1.44px pada 60–72px, menciptakan blok teks yang padat dan berdampak.
- **Satu ketebalan isi**: Hampir semua penggunaan Unica77 berada pada ketebalan 400. Ketebalan 500 hanya muncul untuk penekanan tombol kecil. Sistem mengandalkan ukuran dan spasi, bukan kontras ketebalan.
- **Label kode huruf kapital**: CohereMono menggunakan huruf kapital dengan spasi huruf positif (0.16–0.28px) untuk tag teknis dan penanda seksi.

## 4. Gaya Komponen

### Tombol

**Ghost / Transparan**
- Latar belakang: transparan (`rgba(255, 255, 255, 0)`)
- Teks: Cohere Black (`#000000`)
- Tidak ada border yang terlihat
- Hover: teks bergeser ke Interaction Blue (`#1863dc`), opacity 0.8
- Fokus: outline solid 2px dalam Interaction Blue
- Gaya tombol primer — tidak terlihat hingga diinteraksikan

**Dark Solid**
- Latar belakang: gelap/hitam
- Teks: Pure White
- Untuk CTA pada permukaan terang
- Berbentuk pil atau radius standar

**Outlined**
- Penahanan berbasis border
- Digunakan dalam aksi sekunder

### Kartu & Kontainer
- Latar belakang: Pure White (`#ffffff`)
- Border: solid tipis Lightest Gray (`1px solid #f2f2f2`) untuk kartu halus; Cool Border (`#d9d9dd`) untuk yang ditekankan
- Radius: **22px** — radius khas Cohere untuk kartu primer, gambar, dan kontainer dialog. Juga 4px, 8px, 16px, 20px untuk elemen lebih kecil
- Bayangan: minimal — Cohere mengandalkan warna latar belakang dan border daripada bayangan
- Khusus: radius `0px 0px 22px 22px` (pembulatan hanya bawah) untuk kontainer seksi
- Dialog: radius 8px untuk kotak modal/dialog

### Input & Formulir
- Teks: putih pada input gelap, hitam pada terang
- Border fokus: Focus Purple (`#9b60aa`) dengan `1px solid`
- Bayangan fokus: ring merah (`rgb(179, 0, 0) 0px 0px 0px 2px`) — kemungkinan untuk indikasi status error
- Outline fokus: Interaction Blue solid 2px

### Navigasi
- Nav horizontal bersih pada latar belakang putih atau gelap
- Logo: wordmark Cohere (SVG kustom)
- Tautan: teks gelap pada 16px Unica77
- CTA: tombol solid gelap
- Mobile: collapse hamburger

### Perlakuan Gambar
- Fotografi enterprise dengan subjek dan lingkungan yang beragam
- Fotografi hero bernuansa ungu untuk seksi dramatis
- Tangkapan layar UI produk pada permukaan gelap
- Gambar dengan radius 22px mengikuti sistem kartu
- Seksi gradien ungu lebar penuh

### Komponen Khas

**Sistem Kartu 22px**
- Radius border 22px adalah tanda tangan visual Cohere
- Semua kartu primer, gambar, dan kontainer menggunakan radius ini
- Menciptakan kelembutan organik menyerupai awan yang khas dibanding tipikal 8–12px

**Bilah Kepercayaan Enterprise**
- Logo perusahaan ditampilkan dalam strip horizontal
- Menunjukkan adopsi enterprise
- Perlakuan logo bersih dan monokrom

**Band Hero Ungu**
- Seksi ungu gelap lebar penuh yang menampung showcase produk
- Menciptakan jeda visual dramatis dalam aliran halaman putih
- Tangkapan layar produk mengapung dalam lingkungan ungu

**Tag Kode Huruf Kapital**
- CohereMono dalam huruf kapital dengan spasi huruf
- Digunakan sebagai penanda seksi dan label kategorisasi
- Menciptakan hierarki informasi teknis yang terstruktur

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Padding tombol bervariasi per varian
- Padding internal kartu: sekitar 24–32px
- Spasi vertikal seksi: luas (56–60px antar seksi)

### Grid & Kontainer
- Lebar kontainer maksimal: hingga 2560px (sangat lebar) dengan skala responsif
- Hero: terpusat dengan tipografi dramatis
- Seksi fitur: grid kartu multi-kolom
- Seksi enterprise: band ungu lebar penuh
- 26 breakpoint terdeteksi — sistem responsif yang sangat granular

### Filosofi Whitespace
- **Kejelasan enterprise**: Setiap seksi menyajikan satu proposisi yang jelas dengan ruang napas di antara seksi.
- **Fotografi sebagai hero**: Seksi fotografi besar memberikan daya tarik visual tanpa memerlukan elemen desain dekoratif.
- **Pengelompokan kartu**: Konten terkait dikelompokkan dalam kartu bertepi melengkung 22px, menciptakan kluster informasi yang alami.

### Skala Radius Border
- Tajam (4px): Elemen navigasi, tag kecil, paginasi
- Nyaman (8px): Kotak dialog, kontainer sekunder, kartu kecil
- Luas (16px): Kontainer unggulan, kartu medium
- Besar (20px): Kartu fitur besar
- Khas (22px): Kartu primer, gambar hero, kontainer utama — radius Cohere yang SESUNGGUHNYA
- Pil (9999px): Tombol, tag, indikator status

## 6. Kedalaman & Elevasi

| Tingkat | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa bayangan, tanpa border | Latar belakang halaman, blok teks |
| Berborder (Level 1) | `1px solid #f2f2f2` atau `#d9d9dd` | Kartu standar, pemisah daftar |
| Band Ungu (Level 2) | Latar belakang ungu gelap lebar penuh | Seksi hero, showcase fitur |

**Filosofi Bayangan**: Cohere hampir bebas bayangan. Kedalaman dikomunikasikan melalui **kontras warna latar belakang** (kartu putih di atas band ungu, permukaan putih di atas snow), **penahanan border** (border abu-abu sejuk), dan **pergantian seksi terang-ke-gelap** yang dramatis. Ketika elemen memerlukan elevasi, hal tersebut dicapai dengan menempatkannya putih-di-atas-gelap daripada melalui proyeksi bayangan.

## 7. Yang Boleh dan Tidak Boleh

### Yang Boleh
- Gunakan radius border 22px pada semua kartu dan kontainer primer — itulah tanda tangan visual
- Gunakan CohereText untuk judul display (72px, 60px) dengan spasi huruf negatif
- Gunakan Unica77 untuk semua teks isi dan UI pada ketebalan 400
- Pertahankan palet hitam-putih dengan border abu-abu sejuk
- Gunakan Interaction Blue (#1863dc) hanya untuk status interaktif hover/fokus
- Gunakan seksi ungu gelap untuk jeda visual dramatis dan showcase produk
- Terapkan huruf kapital + spasi huruf pada CohereMono untuk label seksi
- Pertahankan fotografi berkelas enterprise dengan subjek yang beragam

### Yang Tidak Boleh
- Jangan gunakan radius border selain 22px pada kartu primer — radius khas ini penting
- Jangan perkenalkan warna hangat — palet secara ketat bernada sejuk
- Jangan gunakan bayangan berat — kedalaman berasal dari kontras warna dan border
- Jangan gunakan ketebalan tebal (700+) pada teks isi — rentang yang benar adalah 400–500
- Jangan lewatkan hierarki serif/sans — CohereText untuk judul, Unica77 untuk isi
- Jangan gunakan ungu sebagai warna permukaan kartu — ungu dikhususkan untuk seksi lebar penuh
- Jangan kurangi spasi seksi di bawah 40px — tata letak enterprise membutuhkan ruang napas
- Jangan tambahkan dekorasi pada tombol secara default — ghost/transparan adalah keadaan dasar

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Kecil | <425px | Tata letak kompak, spasi minimal |
| Mobile | 425–640px | Satu kolom, kartu bertumpuk |
| Mobile Besar | 640–768px | Penyesuaian spasi minor |
| Tablet | 768–1024px | Grid 2 kolom mulai |
| Desktop | 1024–1440px | Tata letak multi-kolom penuh |
| Desktop Besar | 1440–2560px | Lebar kontainer maksimal |

*26 breakpoint terdeteksi — salah satu situs paling granular responsifnya dalam dataset.*

### Target Sentuh
- Tombol berukuran cukup untuk interaksi sentuh
- Tautan navigasi dengan spasi yang nyaman
- Permukaan kartu sebagai target sentuh

### Strategi Pengecilan
- **Navigasi**: Nav penuh mengecil menjadi hamburger
- **Grid fitur**: Multi-kolom → 2 kolom → satu kolom
- **Teks hero**: 72px → 48px → 32px skala progresif
- **Seksi ungu**: Pertahankan lebar penuh, konten bertumpuk
- **Grid kartu**: 3 → 2 → 1 kolom

### Perilaku Gambar
- Fotografi diskalakan proporsional dalam kontainer berradius 22px
- Tangkapan layar produk mempertahankan rasio aspek
- Seksi ungu menskalakan latar belakang secara proporsional

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- Teks Primer: "Cohere Black (#000000)"
- Latar Belakang Halaman: "Pure White (#ffffff)"
- Teks Sekunder: "Near Black (#212121)"
- Aksen Hover: "Interaction Blue (#1863dc)"
- Teks Diredam: "Muted Slate (#93939f)"
- Border Kartu: "Lightest Gray (#f2f2f2)"
- Border Seksi: "Border Cool (#d9d9dd)"

### Contoh Prompt Komponen
- "Buat seksi hero di atas Pure White (#ffffff) dengan CohereText pada 72px ketebalan 400, line-height 1.0, letter-spacing -1.44px. Teks Cohere Black. Subjudul dalam Unica77 pada 18px ketebalan 400, line-height 1.4."
- "Rancang kartu fitur dengan radius border 22px, border 1px solid Lightest Gray (#f2f2f2) di atas putih. Judul dalam Unica77 pada 32px, letter-spacing -0.32px. Isi dalam Unica77 pada 16px, Muted Slate (#93939f)."
- "Buat tombol ghost: latar belakang transparan, teks Cohere Black dalam Unica77 pada 16px. Saat hover, teks bergeser ke Interaction Blue (#1863dc) dengan opacity 0.8. Fokus: outline Interaction Blue solid 2px."
- "Buat seksi ungu gelap lebar penuh dengan teks putih. CohereText pada 60px untuk judulnya. Tangkapan layar produk mengapung di dalamnya menggunakan radius border 22px."
- "Rancang label seksi menggunakan CohereMono pada 14px, huruf kapital, letter-spacing 0.28px. Teks Muted Slate (#93939f)."

### Panduan Iterasi
1. Fokus pada SATU komponen dalam satu waktu
2. Selalu gunakan radius 22px untuk kartu primer — "kekhasan kartu Cohere"
3. Tentukan jenis huruf — CohereText untuk judul, Unica77 untuk isi, CohereMono untuk label
4. Elemen interaktif menggunakan Interaction Blue (#1863dc) hanya saat hover
5. Pertahankan permukaan putih dengan border abu-abu sejuk — tanpa nada hangat
6. Ungu diperuntukkan bagi seksi lebar penuh, bukan latar belakang kartu
