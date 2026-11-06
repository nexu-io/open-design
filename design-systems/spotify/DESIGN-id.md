# Design System Terinspirasi dari Spotify

> Category: Media & Konsumen
> Streaming musik. Hijau cerah di atas gelap, tipografi tebal, didominasi seni album.

## 1. Tema Visual & Atmosfer

Antarmuka web Spotify adalah pemutar musik gelap yang imersif, membungkus pendengar dalam kepompong hampir hitam (`#121212`, `#181818`, `#1f1f1f`) di mana seni album dan konten menjadi sumber warna utama. Filosofi desainnya adalah "kegelapan yang mengutamakan konten" — UI menyurut ke dalam bayangan agar musik, podcast, dan playlist dapat bersinar. Setiap permukaan adalah variasi warna arang, menciptakan lingkungan seperti bioskop di mana satu-satunya warna sejati berasal dari Spotify Green yang ikonik (`#1ed760`) dan karya seni album itu sendiri.

Tipografi menggunakan SpotifyMixUI dan SpotifyMixUITitle — font eksklusif dari keluarga CircularSp (Circular by Lineto, dikustomisasi untuk Spotify) dengan tumpukan fallback yang ekstensif mencakup font Arab, Ibrani, Sirilik, Yunani, Devanagari, dan CJK, yang mencerminkan jangkauan global Spotify. Sistem tipografi bersifat kompak dan fungsional: 700 (bold) untuk penekanan dan navigasi, 600 (semibold) untuk penekanan sekunder, dan 400 (regular) untuk bodi. Tombol menggunakan huruf kapital dengan letter-spacing positif (1.4px–2px) untuk kualitas sistematis seperti label.

Yang membedakan Spotify adalah geometri pill-dan-lingkaran. Tombol primer menggunakan radius 500px–9999px (pill penuh), tombol putar melingkar menggunakan radius 50%, dan input pencarian berbentuk pill 500px. Dikombinasikan dengan bayangan tebal (`rgba(0,0,0,0.5) 0px 8px 24px`) pada elemen yang terangkat dan kombinasi unik inset border-shadow (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), hasilnya adalah antarmuka yang terasa seperti perangkat audio premium — taktil, melengkung, dan dirancang untuk sentuhan.

**Karakteristik Utama:**
- Tema gelap imersif hampir hitam (`#121212`–`#1f1f1f`) — UI menghilang di balik konten
- Spotify Green (`#1ed760`) sebagai aksen merek tunggal — tidak dekoratif, selalu fungsional
- Keluarga font SpotifyMixUI/CircularSp dengan dukungan skrip global
- Tombol pill (500px–9999px) dan kontrol melingkar (50%) — membulat, dioptimalkan untuk sentuhan
- Label tombol huruf kapital dengan letter-spacing lebar (1.4px–2px)
- Bayangan tebal pada elemen terangkat (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Warna semantik: merah negatif (`#f3727f`), oranye peringatan (`#ffa42b`), biru pengumuman (`#539df5`)
- Seni album sebagai sumber warna utama — UI itu sendiri akromatik secara desain

## 2. Palet Warna & Perannya

### Merek Utama
- **Spotify Green** (`#1ed760`): Aksen merek utama — tombol putar, status aktif, CTA
- **Near Black** (`#121212`): Permukaan latar belakang terdalam
- **Dark Surface** (`#181818`): Kartu, kontainer, permukaan terangkat
- **Mid Dark** (`#1f1f1f`): Latar belakang tombol, permukaan interaktif

### Teks
- **White** (`#ffffff`): `--text-base`, teks primer
- **Silver** (`#b3b3b3`): Teks sekunder, label redup, nav tidak aktif
- **Near White** (`#cbcbcb`): Teks sekunder sedikit lebih terang
- **Light** (`#fdfdfd`): Hampir putih murni untuk penekanan maksimum

### Semantik
- **Negative Red** (`#f3727f`): `--text-negative`, status error
- **Warning Orange** (`#ffa42b`): `--text-warning`, status peringatan
- **Announcement Blue** (`#539df5`): `--text-announcement`, status informasi

### Permukaan & Batas
- **Dark Card** (`#252525`): Permukaan kartu terangkat
- **Mid Card** (`#272727`): Permukaan kartu alternatif
- **Border Gray** (`#4d4d4d`): Batas tombol pada latar gelap
- **Light Border** (`#7c7c7c`): Batas tombol outlined, tautan redup
- **Separator** (`#b3b3b3`): Garis pemisah
- **Light Surface** (`#eeeeee`): Tombol mode terang (jarang)
- **Spotify Green Border** (`#1db954`): Varian batas aksen hijau

### Bayangan
- **Heavy** (`rgba(0,0,0,0.5) 0px 8px 24px`): Dialog, menu, panel terangkat
- **Medium** (`rgba(0,0,0,0.3) 0px 8px 8px`): Kartu, dropdown
- **Inset Border** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Kombinasi border-shadow input

## 3. Aturan Tipografi

### Keluarga Font
- **Title**: `SpotifyMixUITitle`, fallback: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Body**: `SpotifyMixUI`, tumpukan fallback yang sama

### Hierarki

| Peran | Font | Ukuran | Bobot | Line Height | Letter Spacing | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Section Title | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Bobot judul bold |
| Feature Heading | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (tight) | normal | Kepala seksi semibold |
| Body Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Teks yang ditekankan |
| Body | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Bodi standar |
| Button Uppercase | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (tight) | 1.4px–2px | `text-transform: uppercase` |
| Button | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Tombol standar |
| Nav Link Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigasi |
| Nav Link | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Nav tidak aktif |
| Caption Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Metadata bold |
| Caption | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadata |
| Small Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Tag, jumlah |
| Small | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Teks kecil |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Teks terkecil |

### Prinsip
- **Biner bold/regular**: Sebagian besar teks adalah 700 (bold) atau 400 (regular), dengan 600 digunakan secara hemat. Ini menciptakan hierarki visual yang jelas melalui kontras bobot, bukan variasi ukuran.
- **Tombol huruf kapital sebagai sistem**: Label tombol menggunakan huruf kapital + letter-spacing lebar (1.4px–2px), menciptakan "suara label" sistematis yang berbeda dari teks konten.
- **Ukuran kompak**: Rentangnya 10px–24px — lebih sempit dari kebanyakan sistem. Tipografi Spotify kompak dan fungsional, dirancang untuk memindai playlist, bukan membaca artikel.
- **Dukungan skrip global**: Tumpukan fallback yang ekstensif (Arab, Ibrani, Sirilik, Yunani, Devanagari, CJK) mencerminkan jangkauan Spotify di 180+ pasar.

## 4. Gaya Komponen

### Tombol

**Dark Pill**
- Background: `#1f1f1f`
- Teks: `#ffffff` atau `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (pill penuh)
- Penggunaan: Pill navigasi, aksi sekunder

**Dark Large Pill**
- Background: `#181818`
- Teks: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Penggunaan: Tombol navigasi aplikasi utama

**Light Pill**
- Background: `#eeeeee`
- Teks: `#181818`
- Radius: 500px
- Penggunaan: CTA mode terang (persetujuan cookie, pemasaran)

**Outlined Pill**
- Background: transparent
- Teks: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (asimetris untuk ikon)
- Radius: 9999px
- Penggunaan: Tombol ikuti, aksi sekunder

**Circular Play**
- Background: `#1f1f1f`
- Teks: `#ffffff`
- Padding: 12px
- Radius: 50% (lingkaran)
- Penggunaan: Kontrol putar/jeda

### Kartu & Kontainer
- Background: `#181818` atau `#1f1f1f`
- Radius: 6px–8px
- Tidak ada batas terlihat pada sebagian besar kartu
- Hover: sedikit pencerahan background
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px` pada yang terangkat

### Input
- Input pencarian: background `#1f1f1f`, teks `#ffffff`
- Radius: 500px (pill)
- Padding: 12px 96px 12px 48px (dengan kesadaran ikon)
- Focus: batas menjadi `#000000`, outline `1px solid`

### Navigasi
- Sidebar gelap dengan SpotifyMixUI 14px bobot 700 untuk aktif, 400 untuk tidak aktif
- Warna redup `#b3b3b3` untuk item tidak aktif, `#ffffff` untuk aktif
- Tombol ikon melingkar (radius 50%)
- Logo Spotify kiri atas berwarna hijau

## 5. Prinsip Tata Letak

### Sistem Jarak
- Unit dasar: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Grid & Kontainer
- Sidebar (tetap) + area konten utama
- Kartu album/playlist berbasis grid
- Bar sekarang-diputar lebar penuh di bagian bawah
- Area konten responsif mengisi ruang yang tersisa

### Filosofi Ruang Putih
- **Kompresi gelap**: Spotify mengemas konten secara padat — grid playlist, daftar lagu, dan navigasi semuanya berspasi rapat. Latar belakang gelap memberikan istirahat visual antar elemen tanpa memerlukan jarak yang besar.
- **Kepadatan konten daripada ruang bernapas**: Ini adalah aplikasi, bukan situs pemasaran. Setiap piksel melayani pengalaman mendengarkan.

### Skala Border Radius
- Minimal (2px): Lencana, tag eksplisit
- Halus (4px): Input, elemen kecil
- Standar (6px): Kontainer seni album, kartu
- Nyaman (8px): Seksi, dialog
- Sedang (10px–20px): Panel, elemen overlay
- Besar (100px): Tombol pill besar
- Pill (500px): Tombol primer, input pencarian
- Pill Penuh (9999px): Pill navigasi, pencarian
- Lingkaran (50%): Tombol putar, avatar, ikon

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|-----|
| Base (Level 0) | Background `#121212` | Lapisan terdalam, latar belakang halaman |
| Surface (Level 1) | `#181818` atau `#1f1f1f` | Kartu, sidebar, kontainer |
| Elevated (Level 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menu dropdown, kartu hover |
| Dialog (Level 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modal, overlay, menu |
| Inset (Border) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Batas input |

**Filosofi Bayangan**: Spotify menggunakan bayangan yang tergolong berat untuk aplikasi bertemakan gelap. Bayangan dengan opasitas 0.5 dan blur 24px menciptakan efek dramatis "melayang dalam kegelapan" untuk dialog dan menu, sementara opasitas 0.3 dengan blur 8px memberikan angkatan kartu yang lebih halus. Kombinasi unik inset border-shadow pada input menciptakan kualitas taktil yang seperti terbenam.

## 7. Yang Harus dan Tidak Boleh Dilakukan

### Yang Harus Dilakukan
- Gunakan background hampir hitam (`#121212`–`#1f1f1f`) — kedalaman melalui variasi warna bayangan
- Terapkan Spotify Green (`#1ed760`) hanya untuk kontrol putar, status aktif, dan CTA primer
- Gunakan bentuk pill (500px–9999px) untuk semua tombol — melingkar (50%) untuk kontrol putar
- Terapkan huruf kapital + letter-spacing lebar (1.4px–2px) pada label tombol
- Jaga tipografi tetap kompak (rentang 10px–24px) — ini adalah aplikasi, bukan majalah
- Gunakan bayangan tebal (opasitas `0.3–0.5`) untuk elemen terangkat pada latar belakang gelap
- Biarkan seni album menyediakan warna — UI itu sendiri akromatik

### Yang Tidak Boleh Dilakukan
- Jangan gunakan Spotify Green secara dekoratif atau pada latar belakang — fungsinya hanya fungsional
- Jangan gunakan latar belakang terang untuk permukaan utama — imersi gelap adalah intinya
- Jangan lewati geometri pill/lingkaran pada tombol — tombol persegi merusak identitas
- Jangan gunakan bayangan tipis/halus — pada latar belakang gelap, bayangan harus tebal agar terlihat
- Jangan tambahkan warna merek tambahan — hijau + abu-abu akromatik adalah palet yang lengkap
- Jangan gunakan line-height yang longgar — tipografi Spotify kompak dan padat
- Jangan ekspos batas abu-abu mentah — gunakan batas berbasis bayangan atau inset

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Mobile Small | <425px | Tata letak mobile kompak |
| Mobile | 425–576px | Mobile standar |
| Tablet | 576–768px | Grid 2 kolom |
| Tablet Large | 768–896px | Tata letak diperluas |
| Desktop Small | 896–1024px | Sidebar terlihat |
| Desktop | 1024–1280px | Tata letak desktop penuh |
| Large Desktop | >1280px | Grid diperluas |

### Strategi Penciutan
- Sidebar: penuh → diciutkan → disembunyikan
- Grid album: 5 kolom → 3 → 2 → 1
- Bar sekarang-diputar: dipertahankan di semua ukuran
- Pencarian: input pill dipertahankan, lebar menyesuaikan
- Navigasi: sidebar → bar bawah di mobile

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- Background: Near Black (`#121212`)
- Permukaan: Dark Card (`#181818`)
- Teks: White (`#ffffff`)
- Teks sekunder: Silver (`#b3b3b3`)
- Aksen: Spotify Green (`#1ed760`)
- Batas: `#4d4d4d`
- Error: Negative Red (`#f3727f`)

### Contoh Prompt Komponen
- "Buat kartu gelap: background `#181818`, radius 8px. Judul 16px SpotifyMixUI bobot 700, teks putih. Subjudul 14px bobot 400, `#b3b3b3`. Shadow rgba(0,0,0,0.3) 0px 8px 8px saat hover."
- "Desain tombol pill: background `#1f1f1f`, teks putih, radius 9999px, padding 8px 16px. 14px SpotifyMixUI bobot 700, huruf kapital, letter-spacing 1.4px."
- "Buat tombol putar melingkar: background Spotify Green (`#1ed760`), ikon `#000000`, radius 50%, padding 12px."
- "Buat input pencarian: background `#1f1f1f`, teks putih, radius 500px, padding 12px 48px. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Desain sidebar navigasi: background `#121212`. Item aktif: 14px bobot 700, putih. Tidak aktif: 14px bobot 400, `#b3b3b3`."

### Panduan Iterasi
1. Mulai dengan `#121212` — segalanya hidup dalam kegelapan hampir hitam
2. Spotify Green hanya untuk sorotan fungsional (putar, aktif, CTA)
3. Pill segalanya — 500px untuk besar, 9999px untuk kecil, 50% untuk melingkar
4. Huruf kapital + tracking lebar pada tombol — suara label yang sistematis
5. Bayangan tebal (opasitas 0.3–0.5) untuk elevasi — bayangan tipis tidak terlihat di latar gelap
6. Seni album menyediakan semua warna — UI tetap akromatik
