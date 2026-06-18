# Design System Inspired by Uber

> Category: Media & Konsumen
> Platform mobilitas. Hitam-putih tegas, tipografi ketat, energi urban.

## 1. Tema Visual & Atmosfer

Bahasa desain Uber adalah mahakarya minimalisme yang percaya diri -- sebuah semesta hitam-putih di mana setiap piksel memiliki tujuan dan tidak ada yang menghias tanpa alasan. Seluruh pengalaman dibangun di atas dualitas yang tajam: hitam pekat (`#000000`) dan putih murni (`#ffffff`), nyaris tanpa abu-abu tengah yang mencairkan pesannya. Ini bukan minimalisme steril sebuah startup yang belum selesai mendesain -- ini adalah pengendalian diri yang disengaja dari sebuah merek yang sudah begitu mapan sehingga mampu berbicara dengan bisikan.

Tipografi khasnya, UberMove, adalah sans-serif geometris eksklusif dengan karakter yang terasa kotak dan rekayasa. Headline dengan UberMove Bold di 52px membawa bobot sebuah papan reklame -- otoritatif, langsung, tanpa permohonan maaf. Typeface pendampingnya, UberMoveText, menangani teks isi dan tombol dengan karakter yang sedikit lebih lembut dan mudah dibaca di bobot medium (500). Bersama-sama, keduanya menciptakan sistem tipografi yang terasa seperti peta transit: jelas, efisien, dibangun untuk dibaca sekilas dengan cepat.

Yang membuat desain Uber benar-benar khas adalah penggunaan fotografi dan ilustrasi full-bleed yang dipadukan dengan elemen interaktif berbentuk pil (border-radius 999px). Chip navigasi, tombol CTA, dan pemilih kategori semuanya berbagi bentuk kapsul ini, menciptakan bahasa antarmuka yang taktil dan ramah ibu jari yang tak salah lagi adalah Uber. Ilustrasi-ilustrasinya -- adegan hangat, agak terstilisasi dari pengemudi, penumpang, dan lanskap kota -- menyuntikkan kemanusiaan ke dalam apa yang bisa saja menjadi sistem monokrom yang dingin. Situs ini bergantian antara bagian konten putih dan footer hitam penuh, dengan tata letak berbasis kartu menggunakan bayangan sehalus mungkin (rgba(0,0,0,0.12-0.16)) untuk menciptakan angkat yang halus tanpa merusak estetika datar.

**Karakteristik Utama:**
- Fondasi hitam-putih murni dengan nyaris tanpa abu-abu tengah di chrome UI
- UberMove (headline) + UberMoveText (isi/UI) -- keluarga sans-serif geometris eksklusif
- Berbentuk pil di mana-mana: tombol, chip, item nav semua menggunakan border-radius 999px
- Ilustrasi hangat dan manusiawi yang kontras dengan antarmuka monokrom yang tajam
- Tata letak berbasis kartu dengan bayangan sehalus bisikan (opacity 0.12-0.16)
- Grid spasi 8px dengan tata letak yang kompak dan padat informasi
- Fotografi tegas yang diintegrasikan sebagai latar belakang hero full-bleed
- Footer hitam yang mengangkur halaman dengan lingkungan gelap dan kontras tinggi

## 2. Palet Warna & Peran

### Primer
- **Uber Black** (`#000000`): Warna merek yang mendefinisikan -- digunakan untuk tombol primer, headline, teks navigasi, dan footer. Bukan "hampir hitam" atau "hitam gelap," melainkan hitam sejati yang tidak berkompromi.
- **Pure White** (`#ffffff`): Warna permukaan primer dan teks terbalik. Digunakan untuk latar belakang halaman, permukaan kartu, dan teks pada elemen hitam.

### Status Interaktif & Tombol
- **Hover Gray** (`#e2e2e2`): Status hover tombol putih -- abu-abu terang yang bersih dan sejuk yang memberikan umpan balik jelas tanpa kehangatan.
- **Hover Light** (`#f3f3f3`): Hover halus untuk tombol putih yang terangkat -- abu-abu yang nyaris tak terasa untuk umpan balik interaksi yang lembut.
- **Chip Gray** (`#efefef`): Latar belakang untuk tombol sekunder/filter dan chip navigasi -- abu-abu netral yang sangat terang.

### Teks & Konten
- **Body Gray** (`#4b4b4b`): Teks sekunder dan tautan footer -- abu-abu tengah sejati tanpa bias hangat atau sejuk.
- **Muted Gray** (`#afafaf`): Teks tersier, tautan footer yang dilemahkan, dan konten placeholder.

### Batas & Pemisahan
- **Border Black** (`#000000`): Batas tipis 1px untuk penahanan struktural -- digunakan secara hemat pada pembagi dan wadah formulir.

### Bayangan & Kedalaman
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Elevasi kartu standar -- angkat seringan bulu untuk kartu konten.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Elevasi yang sedikit lebih kuat untuk tombol aksi mengambang dan overlay.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Bayangan inset untuk status aktif/ditekan pada tombol sekunder.

### Status Tautan
- **Default Link Blue** (`#0000ee`): Biru browser standar untuk tautan teks dengan garis bawah -- digunakan dalam konten isi.
- **Link White** (`#ffffff`): Tautan pada permukaan gelap -- digunakan di footer dan bagian gelap.
- **Link Black** (`#000000`): Tautan pada permukaan terang dengan dekorasi garis bawah.

### Sistem Gradien
- Desain Uber **sepenuhnya bebas gradien**. Dualitas hitam/putih dan blok warna datar menciptakan semua hierarki visual. Tidak ada gradien yang muncul di mana pun dalam sistem -- setiap permukaan adalah warna solid, setiap transisi adalah tepi yang tegas atau bayangan.

## 3. Aturan Tipografi

### Font Family
- **Headline / Display**: `UberMove`, dengan fallback: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Body / UI**: `UberMoveText`, dengan fallback: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Catatan: UberMove dan UberMoveText adalah typeface eksklusif. Untuk implementasi eksternal, gunakan `system-ui` atau Inter sebagai pengganti terdekat yang tersedia. Karakter geometris dengan proporsi kotak dari UberMove dapat didekati dengan Inter atau DM Sans.*

### Hierarki

| Peran | Font | Ukuran | Bobot | Tinggi Baris | Catatan |
|------|------|------|--------|-------------|-------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (ketat) | Dampak maksimal, kehadiran papan reklame |
| Heading Bagian | UberMove | 36px (2.25rem) | 700 | 1.22 (ketat) | Jangkar bagian utama |
| Judul Kartu | UberMove | 32px (2rem) | 700 | 1.25 (ketat) | Heading kartu dan fitur |
| Sub-heading | UberMove | 24px (1.5rem) | 700 | 1.33 | Header bagian sekunder |
| Heading Kecil | UberMove | 20px (1.25rem) | 700 | 1.40 | Heading ringkas, judul daftar |
| Nav / UI Besar | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Tautan navigasi, teks UI yang menonjol |
| Body / Tombol | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Teks isi standar, label tombol |
| Caption | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadata, deskripsi, tautan kecil |
| Mikro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (longgar) | Cetak halus, teks hukum |

### Prinsip
- **Headline tebal, isi medium**: Heading UberMove secara eksklusif menggunakan bobot 700 (tebal) -- setiap headline menghantam dengan kekuatan papan reklame. Teks isi dan UI UberMoveText menggunakan 400-500, menciptakan hierarki visual yang jelas melalui kontras bobot.
- **Tinggi baris heading yang ketat**: Semua headline menggunakan tinggi baris antara 1.22-1.40 -- kompak dan bertenaga, dirancang untuk dibaca sekilas daripada dibaca detail.
- **Tipografi fungsional**: Tidak ada perlakuan tipografi dekoratif di mana pun. Tidak ada letter-spacing, tidak ada text-transform, tidak ada ukuran ornamental. Setiap elemen teks melayani tujuan komunikasi langsung.
- **Dua font, peran ketat**: UberMove secara eksklusif untuk heading. UberMoveText secara eksklusif untuk isi, tombol, tautan, dan UI. Batas ini tidak pernah dilanggar.

## 4. Gaya Komponen

### Tombol

**Hitam Primer (CTA)**
- Background: Uber Black (`#000000`)
- Teks: Pure White (`#ffffff`)
- Padding: 10px 12px
- Radius: 999px (pil penuh)
- Outline: none
- Focus: inset ring `rgb(255,255,255) 0px 0px 0px 2px`
- Tombol aksi primer -- tegas, kontras tinggi, tidak terlewatkan

**Putih Sekunder**
- Background: Pure White (`#ffffff`)
- Teks: Uber Black (`#000000`)
- Padding: 10px 12px
- Radius: 999px (pil penuh)
- Hover: background bergeser ke Hover Gray (`#e2e2e2`)
- Focus: background bergeser ke Hover Gray, inset ring muncul
- Digunakan pada permukaan gelap atau sebagai aksi sekunder berdampingan dengan Hitam Primer

**Chip / Filter**
- Background: Chip Gray (`#efefef`)
- Teks: Uber Black (`#000000`)
- Padding: 14px 16px
- Radius: 999px (pil penuh)
- Aktif: inset shadow `rgba(0,0,0,0.08)`
- Chip navigasi, pemilih kategori, toggle filter

**Tombol Aksi Mengambang**
- Background: Pure White (`#ffffff`)
- Teks: Uber Black (`#000000`)
- Padding: 14px
- Radius: 999px (pil penuh)
- Shadow: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` offset kecil
- Hover: background bergeser ke `#f3f3f3`
- Kontrol peta, scroll-to-top, CTA mengambang

### Kartu & Wadah
- Background: Pure White (`#ffffff`) pada halaman putih; tidak ada diferensiasi background kartu yang berbeda
- Border: none secara default -- kartu didefinisikan oleh bayangan, bukan goresan
- Radius: 8px untuk kartu konten standar; 12px untuk kartu unggulan/dipromosikan
- Shadow: `rgba(0,0,0,0.12) 0px 4px 16px 0px` untuk angkat standar
- Kartu padat konten dengan padding internal yang minimal
- Kartu yang dipimpin gambar menggunakan imagery full-bleed dengan overlay teks atau di bawah

### Input & Formulir
- Teks: Uber Black (`#000000`)
- Background: Pure White (`#ffffff`)
- Border: 1px solid Black (`#000000`) -- satu-satunya tempat border yang terlihat menonjol
- Radius: 8px
- Padding: spasi nyaman standar
- Focus: tidak ada custom focus state yang diekstraksi -- mengandalkan focus ring browser standar

### Navigasi
- Navigasi atas yang sticky dengan background putih
- Logo: wordmark/ikon Uber di 24x24px dalam warna hitam
- Tautan: UberMoveText di 14-18px, bobot 500, dalam Uber Black
- Chip nav berbentuk pil dengan background Chip Gray (`#efefef`) untuk navigasi kategori ("Ride", "Drive", "Business", "Uber Eats")
- Toggle menu: tombol melingkar dengan border-radius 50%
- Mobile: pola menu hamburger

### Perlakuan Gambar
- Adegan yang diilustrasikan tangan dengan kehangatan (bukan foto untuk bagian fitur)
- Gaya ilustrasi: orang yang agak terstilisasi, palet warna hangat dalam ilustrasi, nuansa kontemporer
- Bagian hero menggunakan fotografi tegas atau ilustrasi sebagai latar belakang lebar penuh
- Kode QR untuk CTA unduhan aplikasi
- Semua gambar menggunakan border-radius standar 8px atau 12px saat terdapat dalam kartu

### Komponen Khas

**Navigasi Pil Kategori**
- Baris horizontal tombol berbentuk pil untuk navigasi tingkat atas ("Ride", "Drive", "Business", "Uber Eats", "About")
- Setiap pil: background Chip Gray, teks hitam, radius 999px
- Status aktif ditandai dengan background hitam dan teks putih (inversi)

**Hero dengan Aksi Ganda**
- Hero terbagi: teks/CTA di kiri, peta/ilustrasi di kanan
- Dua kolom input berdampingan untuk pickup/tujuan
- Tombol CTA "See prices" dalam pil hitam

**Kartu Plan-Ahead**
- Kartu yang mempromosikan fitur seperti "Uber Reserve" dan perencanaan perjalanan
- Berat ilustrasi dengan imagery yang hangat dan berpusat pada manusia
- Tombol CTA hitam dengan teks putih di bagian bawah

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Padding tombol: 10px 12px (kompak) atau 14px 16px (nyaman)
- Padding internal kartu: sekitar 24-32px
- Spasi vertikal bagian: murah hati namun efisien -- sekitar 64-96px antara bagian utama

### Grid & Wadah
- Lebar wadah maksimal: sekitar 1136px, terpusat
- Hero: tata letak terbagi dengan teks di kiri, visual di kanan
- Bagian fitur: grid kartu 2 kolom atau kolom tunggal lebar penuh
- Footer: grid tautan multi-kolom pada background hitam
- Bagian lebar penuh yang meluas ke tepi viewport

### Filosofi Whitespace
- **Efisien, bukan lapang**: Whitespace Uber bersifat fungsional -- cukup untuk memisahkan, tidak pernah terasa kosong. Ini adalah spasi sistem transit: kompak, jelas, bertujuan.
- **Kartu padat konten**: Kartu mengemas informasi dengan ketat dan spasi internal minimal, mengandalkan bayangan dan radius untuk mendefinisikan batas.
- **Ruang napas bagian**: Bagian utama mendapatkan spasi vertikal yang murah hati, namun di dalam bagian, elemen-elemen dikelompokkan dengan rapat.

### Skala Border Radius
- Tajam (0px): Tidak ada sudut kotak yang digunakan pada elemen interaktif
- Standar (8px): Kartu konten, kolom input, listbox
- Nyaman (12px): Kartu unggulan, wadah lebih besar, kartu tautan
- Pil Penuh (999px): Semua tombol, chip, item navigasi, pil
- Lingkaran (50%): Gambar avatar, wadah ikon, kontrol melingkar

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Datar (Level 0) | Tanpa bayangan, background solid | Background halaman, konten inline, bagian teks |
| Halus (Level 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Kartu konten standar, blok fitur |
| Sedang (Level 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Kartu yang ditinggikan, elemen overlay |
| Mengambang (Level 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Tombol aksi mengambang, kontrol peta |
| Ditekan (Level 4) | `rgba(0,0,0,0.08) inset` (spread 999px) | Status tombol aktif/ditekan |
| Focus Ring | `rgb(255,255,255) 0px 0px 0px 2px inset` | Indikator fokus keyboard |

**Filosofi Bayangan**: Uber menggunakan bayangan murni sebagai alat struktural, tidak pernah secara dekoratif. Bayangan selalu hitam dengan opacity yang sangat rendah (0.08-0.16), menciptakan angkat minimum yang diperlukan untuk memisahkan lapisan konten. Radius blur moderat (8-16px) -- cukup terasa alami namun tidak pernah dramatis. Tidak ada bayangan berwarna, tidak ada tumpukan bayangan berlapis, dan tidak ada efek glow ambient. Kedalaman lebih banyak dikomunikasikan melalui kontras bagian hitam/putih daripada melalui elevasi bayangan.

## 7. Yang Harus dan Tidak Boleh Dilakukan

### Yang Harus Dilakukan
- Gunakan hitam sejati (`#000000`) dan putih murni (`#ffffff`) sebagai palet primer -- kontras yang tajam ITULAH Uber
- Gunakan border-radius 999px untuk semua tombol, chip, dan elemen navigasi berbentuk pil
- Pertahankan semua heading dalam UberMove Bold (700) untuk dampak setingkat papan reklame
- Gunakan bayangan sehalus bisikan (opacity 0.12-0.16) untuk elevasi kartu -- hampir tidak terlihat
- Pertahankan gaya tata letak yang kompak dan padat informasi -- Uber mengutamakan efisiensi daripada kelapangan
- Gunakan ilustrasi yang hangat dan berpusat pada manusia untuk melembutkan antarmuka monokrom
- Terapkan radius 8px untuk kartu konten dan 12px untuk wadah unggulan
- Gunakan UberMoveText di bobot 500 untuk navigasi dan teks UI yang menonjol
- Pasangkan tombol primer hitam dengan tombol sekunder putih untuk tata letak aksi ganda

### Yang Tidak Boleh Dilakukan
- Jangan masukkan warna ke chrome UI -- antarmuka Uber secara ketat hitam, putih, dan abu-abu
- Jangan gunakan sudut membulat kurang dari 999px pada tombol -- bentuk pil penuh adalah elemen identitas inti
- Jangan terapkan bayangan berat atau drop shadow dengan opacity tinggi -- kedalaman harus sehalus bisikan
- Jangan gunakan font serif di mana pun -- tipografi Uber secara eksklusif sans-serif geometris
- Jangan buat tata letak yang lapang dan luas dengan whitespace berlebihan -- kepadatan Uber adalah kesengajaan
- Jangan gunakan gradien atau overlay warna -- setiap permukaan adalah warna datar solid
- Jangan campurkan UberMove ke teks isi atau UberMoveText ke headline -- hierarkinya ketat
- Jangan gunakan border dekoratif -- border bersifat fungsional (input, pembagi) atau tidak ada sama sekali
- Jangan lembutkan kontras hitam/putih dengan off-white atau hampir-hitam -- dualitasnya disengaja

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Small | 320px | Tata letak minimal, kolom tunggal, input bertumpuk, tipografi kompak |
| Mobile | 600px | Mobile standar, tata letak bertumpuk, nav hamburger |
| Tablet Small | 768px | Grid dua kolom mulai, tata letak kartu yang diperluas |
| Tablet | 1119px | Tata letak tablet penuh, konten hero berdampingan |
| Desktop Small | 1120px | Grid desktop diaktifkan, pil nav horizontal |
| Desktop | 1136px | Tata letak desktop penuh, lebar wadah maksimal, hero terbagi |

### Target Sentuhan
- Semua tombol pil: tinggi minimum 44px (padding vertikal 10-14px + tinggi baris)
- Chip navigasi: padding 14px 16px yang murah hati untuk ketukan ibu jari yang nyaman
- Kontrol melingkar (menu, tutup): radius 50% memastikan target yang besar dan mudah ditekan
- Permukaan kartu berfungsi sebagai target sentuhan area penuh di mobile

### Strategi Penyesuaian
- **Navigasi**: Nav pil horizontal mengecil menjadi menu hamburger dengan toggle melingkar
- **Hero**: Tata letak terbagi (teks + peta/visual) bertumpuk menjadi kolom tunggal -- teks di atas, visual di bawah
- **Kolom input**: Input pickup/tujuan berdampingan bertumpuk secara vertikal
- **Kartu fitur**: Grid 2 kolom mengecil menjadi kartu bertumpuk lebar penuh
- **Heading**: Display 52px skala turun melalui 36px, 32px, 24px, 20px
- **Footer**: Grid tautan multi-kolom mengecil menjadi akordeon atau kolom tunggal bertumpuk
- **Pil kategori**: Scroll horizontal dengan overflow pada layar lebih kecil

### Perilaku Gambar
- Ilustrasi skala proporsional dalam wadahnya
- Imagery hero mempertahankan rasio aspek, mungkin terpotong di layar lebih kecil
- Bagian kode QR tersembunyi di mobile (unduhan aplikasi beralih ke tautan toko langsung)
- Imagery kartu mempertahankan border radius 8-12px di semua ukuran

## 9. Panduan Prompt Agent

### Referensi Warna Cepat
- Tombol Primer: "Uber Black (#000000)"
- Background Halaman: "Pure White (#ffffff)"
- Teks Tombol (pada hitam): "Pure White (#ffffff)"
- Teks Tombol (pada putih): "Uber Black (#000000)"
- Teks Sekunder: "Body Gray (#4b4b4b)"
- Teks Tersier: "Muted Gray (#afafaf)"
- Background Chip: "Chip Gray (#efefef)"
- Status Hover: "Hover Gray (#e2e2e2)"
- Bayangan Kartu: "rgba(0,0,0,0.12) 0px 4px 16px"
- Background Footer: "Uber Black (#000000)"

### Contoh Prompt Komponen
- "Buat bagian hero di atas Pure White (#ffffff) dengan headline di 52px UberMove Bold (700), tinggi baris 1.23. Gunakan teks Uber Black (#000000). Tambahkan subtitle dalam Body Gray (#4b4b4b) di 16px UberMoveText bobot 400 dengan tinggi baris 1.50. Tempatkan tombol CTA pil Uber Black (#000000) dengan teks Pure White, radius 999px, padding 10px 12px."
- "Desain bilah navigasi kategori dengan tombol berbentuk pil horizontal. Setiap pil: background Chip Gray (#efefef), teks Uber Black (#000000), padding 14px 16px, border-radius 999px. Pil aktif terbalik menjadi background Uber Black dengan teks Pure White. Gunakan UberMoveText di 14px bobot 500."
- "Bangun kartu fitur di atas Pure White (#ffffff) dengan border-radius 8px dan shadow rgba(0,0,0,0.12) 0px 4px 16px. Judul dalam UberMove di 24px bobot 700, deskripsi dalam Body Gray (#4b4b4b) di 16px UberMoveText. Tambahkan tombol CTA pil hitam di bagian bawah."
- "Buat footer gelap di atas Uber Black (#000000) dengan teks heading Pure White (#ffffff) dalam UberMove di 20px bobot 700. Tautan footer dalam Muted Gray (#afafaf) di 14px UberMoveText. Tautan hover ke Pure White. Tata letak grid multi-kolom."
- "Desain tombol aksi mengambang dengan background Pure White (#ffffff), radius 999px, padding 14px, dan shadow rgba(0,0,0,0.16) 0px 2px 8px. Hover menggeser background ke #f3f3f3. Gunakan untuk scroll-to-top atau kontrol peta."

### Panduan Iterasi
1. Fokus pada SATU komponen dalam satu waktu
2. Referensikan palet hitam/putih yang ketat -- "gunakan Uber Black (#000000)" bukan "buat jadi gelap"
3. Selalu tentukan radius 999px untuk tombol dan pil -- ini tidak bisa dinegosiasikan untuk identitas Uber
4. Deskripsikan font family secara eksplisit -- "UberMove Bold untuk heading, UberMoveText Medium untuk label"
5. Untuk bayangan, gunakan "bayangan bisikan (rgba(0,0,0,0.12) 0px 4px 16px)" -- jangan pernah drop shadow berat
6. Pertahankan tata letak yang kompak dan padat informasi -- Uber itu efisien, bukan lapang
7. Ilustrasi harus hangat dan manusiawi -- deskripsikan "orang terstilisasi dalam nada hangat" bukan bentuk abstrak
8. Pasangkan CTA hitam dengan sekunder putih untuk tata letak aksi ganda yang seimbang
