# Design System Terinspirasi dari IBM

> Category: Media & Consumer
> Teknologi enterprise. Sistem desain Carbon, palet biru terstruktur.

## 1. Tema Visual & Atmosfer

Situs web IBM adalah perwujudan digital otoritas enterprise yang dibangun di atas Carbon Design System — sebuah bahasa desain yang begitu metodis dan terstruktur sehingga terbaca seperti spesifikasi rekayasa yang dirender menjadi halaman web. Halaman ini beroperasi pada dualitas yang tegas: kanvas putih cerah (`#ffffff`) dengan teks hampir hitam (`#161616`), diselingi satu aksen tunggal yang tak tergoyahkan — IBM Blue 60 (`#0f62fe`). Ini bukan minimalisme startup teknologi yang playful; ini adalah presisi korporat yang disuling menjadi piksel. Setiap elemen berada dalam grid 2x Carbon yang kaku, setiap warna dipetakan ke token semantik, setiap nilai spasi mengunci pada unit dasar 8px.

Keluarga tipe IBM Plex adalah tulang punggung sistem ini. IBM Plex Sans dengan bobot ringan (300) untuk judul tampilan menciptakan kualitas yang mengejutkan — nyaris seperti udara, hampir halus pada ukuran besar — sebuah kontrapoin yang disengaja terhadap bobot korporat IBM. Pada ukuran teks isi, bobot reguler (400) dengan letter-spacing 0.16px pada keterangan 14px menghadirkan micro-tracking yang teliti sehingga teks Carbon terasa lebih terancang secara rekayasa daripada sekadar didesain. IBM Plex Mono melayani kode, data, dan label teknis, melengkapi trinitas keluarga bersama IBM Plex Serif yang jarang muncul.

Yang mendefinisikan identitas visual IBM di luar monokrom-plus-biru adalah ketergantungan pada sistem token komponen Carbon. Setiap status interaktif dipetakan ke properti kustom CSS yang diawali dengan `--cds-` (Carbon Design System). Tombol tidak memiliki warna yang dikodekan keras; mereka mereferensikan `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Arsitektur bertokenisasi ini berarti seluruh lapisan visual adalah lapisan tipis di atas fondasi yang sangat sistematis — setara desain dari API yang diketik dengan baik.

**Karakteristik Utama:**
- IBM Plex Sans dengan bobot 300 (Light) untuk tampilan — gravitas korporat melalui restraint tipografis
- IBM Plex Mono untuk kode dan konten teknis dengan letter-spacing konsisten 0.16px pada ukuran kecil
- Satu warna aksen: IBM Blue 60 (`#0f62fe`) — setiap elemen interaktif, setiap CTA, setiap tautan
- Sistem token Carbon (`--cds-*`) yang menggerakkan semua warna semantik, memungkinkan pergantian tema di tingkat variabel
- Grid spasi 8px dengan kepatuhan ketat — tidak ada nilai sembarang, semuanya selaras
- Kartu datar tanpa border pada permukaan Gray 10 `#f4f4f4` — kedalaman melalui layering background-color, bukan bayangan
- Input dengan border bawah (bukan kotak) — pola formulir Carbon yang khas
- Border-radius 0px pada tombol utama — persegi panjang tanpa kompromi, tanpa pelunakan

## 2. Palet Warna & Peran

### Primer
- **IBM Blue 60** (`#0f62fe`): Satu-satunya warna interaktif. Tombol utama, tautan, status fokus, indikator aktif. Ini adalah satu-satunya warna kromatik dalam palet UI inti.
- **White** (`#ffffff`): Latar halaman, permukaan kartu, teks tombol pada biru, `--cds-background`.
- **Gray 100** (`#161616`): Teks utama, judul, latar permukaan gelap, nav bar, footer. `--cds-text-primary`.

### Skala Netral (Keluarga Gray)
- **Gray 100** (`#161616`): Teks utama, judul, chrome UI gelap, latar footer.
- **Gray 90** (`#262626`): Permukaan gelap sekunder, status hover pada latar gelap.
- **Gray 80** (`#393939`): Gelap tersier, status aktif.
- **Gray 70** (`#525252`): Teks sekunder, teks pembantu, deskripsi. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Teks placeholder, teks dinonaktifkan.
- **Gray 50** (`#8d8d8d`): Ikon dinonaktifkan, label redup.
- **Gray 30** (`#c6c6c6`): Border, garis pemisah, border bawah input. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Border halus, garis luar kartu.
- **Gray 10** (`#f4f4f4`): Latar permukaan sekunder, isi kartu, baris bergantian. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Status hover untuk permukaan Gray 10.

### Interaktif
- **Blue 60** (`#0f62fe`): Interaktif utama — tombol, tautan, fokus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Status hover tautan. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Status aktif/ditekan untuk elemen biru.
- **Blue 10** (`#edf5ff`): Permukaan warna biru tipis, latar baris yang dipilih.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — border inset 2px pada elemen terfokus.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — cincin dalam putih untuk fokus pada latar gelap.

### Dukungan & Status
- **Red 60** (`#da1e28`): Error, bahaya. `--cds-support-error`.
- **Green 50** (`#24a148`): Sukses. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Peringatan. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informasional. `--cds-support-info`.

### Tema Gelap (Tema Gray 100)
- **Background**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Permukaan kartu dan wadah.
- **Layer 02**: Gray 80 (`#393939`). Permukaan yang ditinggikan.
- **Text Primary**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Text Secondary**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Border Subtle**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactive**: Blue 40 (`#78a9ff`). Tautan dan elemen interaktif bergeser lebih terang untuk kontras.

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `IBM Plex Sans`, dengan fallback: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, dengan fallback: `Menlo, Courier, monospace`
- **Serif** (penggunaan terbatas): `IBM Plex Serif`, untuk konteks editorial/ekspresif
- **Icon Font**: `ibm_icons` — glyph ikon proprietary pada 20px

### Hierarki

| Peran | Font | Ukuran | Bobot | Line Height | Letter Spacing | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Dampak maksimal, bobot ringan untuk keeleganan |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Hero sekunder, fallback responsif |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Judul ekspresif |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Judul bagian |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Judul sub-bagian |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Judul kartu, header fitur |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Judul kartu yang lebih ringan |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Teks bacaan standar |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Isi yang ditekankan, label |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Isi kompak, keterangan |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Keterangan tebal, item nav |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadata, stempel waktu |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Kode inline, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Blok kode |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Dekoratif mono hero |

### Prinsip
- **Bobot ringan pada ukuran tampilan**: Set tipe ekspresif Carbon menggunakan bobot 300 (Light) pada 42px ke atas. Ini menciptakan ketegangan yang khas — konten berbicara dengan otoritas korporat sementara letterform berbisik dengan keringanan tipografis.
- **Micro-tracking pada ukuran kecil**: Letter-spacing 0.16px pada 14px dan 0.32px pada 12px. Nilai-nilai yang tampaknya sepele ini adalah senjata rahasia Carbon untuk keterbacaan pada ukuran kompak — mereka membuka letterform IBM Plex yang rapat cukup saja.
- **Tiga bobot fungsional**: 300 (tampilan/ekspresif), 400 (isi/bacaan), 600 (penekanan/label UI). Bobot 700 sengaja tidak ada dalam skala tipe produksi.
- **Produktif vs. Ekspresif**: Set produktif menggunakan line-height yang lebih rapat (1.29) untuk UI yang padat. Set ekspresif lebih bernapas (1.40-1.50) untuk konten pemasaran dan editorial.

## 4. Gaya Komponen

### Tombol

**Tombol Utama (Biru)**
- Background: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Teks: `#ffffff` (White)
- Padding: 14px 63px 14px 15px (asimetris — ruang untuk ikon trailing)
- Border: 1px solid transparent
- Border-radius: 0px (persegi panjang tajam — tanda tangan Carbon)
- Tinggi: 48px (default), 40px (kompak), 64px (ekspresif)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Aktif: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Fokus: `2px solid #0f62fe` inset + `1px solid #ffffff` dalam

**Tombol Sekunder (Gray)**
- Background: `#393939` (Gray 80)
- Teks: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Aktif: `#6f6f6f` (Gray 60)
- Padding/radius sama dengan utama

**Tombol Tersier (Ghost Biru)**
- Background: transparent
- Teks: `#0f62fe` (Blue 60)
- Border: 1px solid `#0f62fe`
- Hover: teks `#0353e9` + warna biru tipis Blue 10 di background
- Border-radius: 0px

**Tombol Ghost**
- Background: transparent
- Teks: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Border: none
- Hover: warna biru tipis `#e8e8e8` di background

**Tombol Bahaya**
- Background: `#da1e28` (Red 60)
- Teks: `#ffffff`
- Hover: `#b81921` (Red 70)

### Kartu & Wadah
- Background: `#ffffff` pada tema putih, `#f4f4f4` (Gray 10) untuk kartu yang ditinggikan
- Border: none (desain datar — tanpa border atau bayangan pada sebagian besar kartu)
- Border-radius: 0px (sesuai estetika tombol persegi panjang)
- Hover: background bergeser ke `#e8e8e8` (Gray 10 Hover) untuk kartu yang dapat diklik
- Padding konten: 16px
- Pemisahan: layering background-color (putih → gray 10 → putih) daripada bayangan

### Input & Formulir
- Background: `#f4f4f4` (Gray 10) — `--cds-field`
- Teks: `#161616` (Gray 100)
- Padding: 0px 16px (hanya horizontal)
- Tinggi: 40px (default), 48px (besar)
- Border: none pada sisi/atas — `2px solid transparent` bawah
- Border bawah aktif: `2px solid #161616` (Gray 100)
- Fokus: `2px solid #0f62fe` (Blue 60) border bawah — `--cds-focus`
- Error: `2px solid #da1e28` (Red 60) border bawah
- Label: 12px IBM Plex Sans, letter-spacing 0.32px, Gray 70
- Teks pembantu: 12px, Gray 60
- Placeholder: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (atas) — input bersudut tajam

### Navigasi
- Background: `#161616` (Gray 100) — masthead gelap lebar penuh
- Tinggi: 48px
- Logo: logo IBM 8-bar, putih pada gelap, rata kiri
- Tautan: 14px IBM Plex Sans, bobot 400, `#c6c6c6` (Gray 30) default
- Hover tautan: teks `#ffffff`
- Tautan aktif: `#ffffff` dengan indikator border bawah
- Pengalih platform: tab horizontal rata kiri
- Pencarian: field pencarian yang tergeser keluar dipicu ikon
- Mobile: hamburger dengan panel yang bergeser dari kiri

### Tautan
- Default: `#0f62fe` (Blue 60) tanpa garis bawah
- Hover: `#0043ce` (Blue 70) dengan garis bawah
- Dikunjungi: tetap Blue 60 (tidak ada perubahan status dikunjungi)
- Tautan inline: bergaris bawah secara default dalam teks isi

### Komponen Khas

**Content Block (Hero/Fitur)**
- Pita background putih/gray-10 yang bergantian lebar penuh
- Judul rata kiri dengan tipe tampilan 60px atau 48px
- CTA sebagai tombol utama biru dengan ikon panah
- Gambar/ilustrasi rata kanan atau di bawah pada mobile

**Tile (Kartu yang Dapat Diklik)**
- Background: `#f4f4f4` atau `#ffffff`
- Border bawah lebar penuh atau pergeseran background saat hover
- Ikon panah kanan bawah saat hover
- Tanpa bayangan — kerataan adalah identitasnya

**Tag / Label**
- Background: warna kontekstual pada opasitas 10% (mis., Blue 10, Red 10)
- Teks: warna kelas 60 yang sesuai
- Padding: 4px 8px
- Border-radius: 24px (pill — pengecualian terhadap aturan 0px)
- Font: 12px bobot 400

**Spanduk Notifikasi**
- Bar lebar penuh, biasanya background Blue 60 atau Gray 100
- Teks putih, 14px
- Ikon tutup/hapus rata kanan

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px (grid 2x Carbon)
- Skala spasi komponen: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Skala spasi tata letak: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Unit mini: 8px (spasi terkecil yang dapat digunakan)
- Padding dalam komponen: biasanya 16px
- Gap antar kartu/tile: 1px (hairline) atau 16px (standar)

### Grid & Wadah
- Grid 16 kolom (sistem grid 2x Carbon)
- Lebar konten maksimal: 1584px (breakpoint maks)
- Gutter kolom: 32px (16px pada mobile)
- Margin: 16px (mobile), 32px (tablet ke atas)
- Konten biasanya mencakup 8-12 kolom untuk panjang baris yang dapat dibaca
- Bagian full-bleed bergantian dengan konten yang terkandung

### Filosofi Whitespace
- **Kepadatan fungsional**: Carbon lebih menyukai kepadatan produktif daripada whitespace yang luas. Bagian-bagian tersusun lebih rapat dibandingkan sistem desain konsumen — ini mencerminkan DNA enterprise IBM.
- **Zonasi background-color**: Alih-alih padding besar antar bagian, IBM menggunakan warna background yang bergantian (putih → gray 10 → putih) untuk menciptakan pemisahan visual dengan ruang vertikal minimal.
- **Ritme 48px yang konsisten**: Transisi bagian utama menggunakan spasi vertikal 48px. Bagian hero dapat menggunakan 80px–96px.

### Skala Border Radius
- **0px**: Tombol utama, input, tile, kartu — perlakuan yang dominan. Carbon pada dasarnya berbentuk persegi panjang.
- **2px**: Kadang-kadang pada elemen interaktif kecil (tag)
- **24px**: Tag/label (bentuk pill — satu-satunya pengecualian yang dibulatkan)
- **50%**: Lingkaran avatar, wadah ikon

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Flat (Level 0) | Tanpa bayangan, background `#ffffff` | Permukaan halaman default |
| Layer 01 | Tanpa bayangan, background `#f4f4f4` | Kartu, tile, bagian bergantian |
| Layer 02 | Tanpa bayangan, background `#e0e0e0` | Panel yang ditinggikan dalam Layer 01 |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Dropdown, tooltip, menu overflow |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + scrim gelap | Dialog modal, panel sisi |
| Focus | `2px solid #0f62fe` inset + `1px solid #ffffff` | Cincin fokus keyboard |
| Bottom-border | `2px solid #161616` pada tepi bawah | Input aktif, indikator tab aktif |

**Filosofi Bayangan**: Carbon secara sengaja menghindari bayangan. IBM mencapai kedalaman terutama melalui layering background-color — menumpuk permukaan dari abu-abu yang semakin gelap daripada menambahkan box-shadow. Ini menciptakan estetika datar yang terinspirasi cetak di mana hierarki dikomunikasikan melalui nilai warna, bukan cahaya yang disimulasikan. Bayangan dicadangkan secara eksklusif untuk elemen mengambang (dropdown, tooltip, modal) di mana elemen tersebut benar-benar tumpang tindih dengan konten. Restraint ini memberikan dampak bermakna pada bayangan yang jarang muncul — ketika sesuatu mengambang di Carbon, itu berarti sesuatu.

## 7. Hal yang Harus dan Tidak Boleh Dilakukan

### Harus Dilakukan
- Gunakan IBM Plex Sans dengan bobot 300 untuk ukuran tampilan (42px ke atas) — keringanannya adalah disengaja
- Terapkan letter-spacing 0.16px pada teks isi 14px dan 0.32px pada keterangan 12px
- Gunakan border-radius 0px pada tombol, input, kartu, dan tile — persegi panjang adalah sistemnya
- Referensikan nama token `--cds-*` saat mengimplementasikan (mis., `--cds-button-primary`, `--cds-text-primary`)
- Gunakan layering background-color (putih → gray 10 → gray 20) untuk kedalaman alih-alih bayangan
- Gunakan border bawah (bukan kotak) untuk indikator field input
- Pertahankan tinggi tombol default 48px dan padding asimetris untuk akomodasi ikon
- Terapkan Blue 60 (`#0f62fe`) sebagai satu-satunya aksen — satu biru untuk semuanya

### Tidak Boleh Dilakukan
- Jangan membulatkan sudut tombol — radius 0px adalah identitas Carbon
- Jangan gunakan bayangan pada kartu atau tile — kerataan adalah tujuannya
- Jangan tambahkan warna aksen tambahan — sistem IBM adalah monokromatik + biru
- Jangan gunakan bobot 700 (Bold) — skala berhenti pada 600 (Semibold)
- Jangan tambahkan letter-spacing pada teks berukuran tampilan — tracking hanya untuk 14px ke bawah
- Jangan membingkai input dengan border penuh — input Carbon hanya menggunakan border bawah
- Jangan gunakan background gradien — permukaan IBM adalah warna datar dan solid
- Jangan menyimpang dari grid spasi 8px — setiap nilai harus dapat dibagi dengan 8 (dengan 2px dan 4px untuk mikro-penyesuaian)

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Small (sm) | 320px | Kolom tunggal, nav hamburger, margin 16px |
| Medium (md) | 672px | Grid 2-kolom dimulai, konten diperluas |
| Large (lg) | 1056px | Navigasi penuh terlihat, grid 3-4 kolom |
| X-Large (xlg) | 1312px | Kepadatan konten maksimal, tata letak lebar |
| Max | 1584px | Lebar konten maksimal, dipusatkan dengan margin |

### Target Sentuh
- Tinggi tombol: 48px default, minimum 40px (kompak)
- Tautan navigasi: tinggi baris 48px untuk sentuh
- Tinggi input: 40px default, 48px besar
- Tombol ikon: target sentuh persegi 48px
- Item menu mobile: baris 48px lebar penuh

### Strategi Pengerutan
- Hero: tampilan 60px → 42px → judul 32px saat viewport menyempit
- Navigasi: masthead horizontal penuh → hamburger dengan panel yang bergeser keluar
- Grid: 4-kolom → 2-kolom → kolom tunggal
- Tile/kartu: grid horizontal → tumpukan vertikal
- Gambar: pertahankan rasio aspek, max-width 100%
- Footer: grup tautan multi-kolom → kolom tunggal bertumpuk
- Padding bagian: 48px → 32px → 16px

### Perilaku Gambar
- Gambar responsif dengan `max-width: 100%`
- Ilustrasi produk diskalakan secara proporsional
- Gambar hero dapat bergeser dari berdampingan menjadi ditumpuk di bawah
- Visualisasi data mempertahankan rasio aspek dengan gulir horizontal pada mobile

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- CTA utama: IBM Blue 60 (`#0f62fe`)
- Background: White (`#ffffff`)
- Teks judul: Gray 100 (`#161616`)
- Teks isi: Gray 100 (`#161616`)
- Teks sekunder: Gray 70 (`#525252`)
- Permukaan/Kartu: Gray 10 (`#f4f4f4`)
- Border: Gray 30 (`#c6c6c6`)
- Tautan: Blue 60 (`#0f62fe`)
- Hover tautan: Blue 70 (`#0043ce`)
- Cincin fokus: Blue 60 (`#0f62fe`)
- Error: Red 60 (`#da1e28`)
- Sukses: Green 50 (`#24a148`)

### Contoh Prompt Komponen
- "Buat bagian hero pada background putih. Judul pada 60px IBM Plex Sans bobot 300, line-height 1.17, warna #161616. Subjudul pada 16px bobot 400, line-height 1.50, warna #525252, max-width 640px. Tombol CTA biru (background #0f62fe, teks #ffffff, border-radius 0px, tinggi 48px, padding 14px 63px 14px 15px)."
- "Desain tile kartu: background #f4f4f4, border-radius 0px, padding 16px. Judul pada 20px IBM Plex Sans bobot 600, line-height 1.40, warna #161616. Isi pada 14px bobot 400, letter-spacing 0.16px, line-height 1.29, warna #525252. Hover: background bergeser ke #e8e8e8."
- "Bangun field formulir: background #f4f4f4, border-radius 0px, tinggi 40px, padding horizontal 16px. Label di atas pada 12px bobot 400, letter-spacing 0.32px, warna #525252. Border bawah: 2px solid transparent default, 2px solid #0f62fe saat fokus. Placeholder: #6f6f6f."
- "Buat navigation bar gelap: background #161616, tinggi 48px. Logo IBM putih rata kiri. Tautan pada 14px IBM Plex Sans bobot 400, warna #c6c6c6. Hover: teks #ffffff. Aktif: #ffffff dengan border bawah 2px."
- "Bangun komponen tag: background Blue 10 (#edf5ff), teks Blue 60 (#0f62fe), padding 4px 8px, border-radius 24px, 12px IBM Plex Sans bobot 400."

### Panduan Iterasi
1. Selalu gunakan border-radius 0px pada tombol, input, dan kartu — ini tidak dapat dinegosiasikan dalam Carbon
2. Letter-spacing hanya pada ukuran kecil: 0.16px pada 14px, 0.32px pada 12px — jangan pernah pada teks tampilan
3. Tiga bobot: 300 (tampilan), 400 (isi), 600 (penekanan) — tanpa bold
4. Blue 60 adalah satu-satunya warna aksen — jangan tambahkan warna aksen sekunder
5. Kedalaman berasal dari layering background-color (putih → #f4f4f4 → #e0e0e0), bukan bayangan
6. Input hanya memiliki border bawah, tidak pernah dikotakkan sepenuhnya
7. Gunakan awalan `--cds-` untuk penamaan token agar tetap kompatibel dengan Carbon
8. 48px adalah tinggi elemen interaktif universal
