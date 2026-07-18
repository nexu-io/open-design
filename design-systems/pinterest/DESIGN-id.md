# Sistem Desain Terinspirasi dari Pinterest

> Category: Media & Consumer
> Penemuan visual. Aksen merah, grid masonry, gambar sebagai prioritas utama.

## 1. Tema Visual & Atmosfer

Situs web Pinterest adalah kanvas yang hangat dan menginspirasi, memperlakukan penemuan visual seperti majalah gaya hidup. Desain ini beroperasi dengan latar belakang putih yang lembut dan sedikit hangat, dengan Pinterest Red (`#e60023`) sebagai aksen merek tunggal yang berani. Berbeda dengan biru dingin sebagian besar platform teknologi, skala netral Pinterest memiliki nada hangat yang jelas — abu-abu condong ke arah zaitun/pasir (`#91918c`, `#62625b`, `#e5e5e0`) daripada baja dingin, menciptakan suasana nyaman dan kerajinan tangan yang mengundang untuk dijelajahi.

Tipografi menggunakan Pin Sans — font proprietary khusus dengan tumpukan fallback yang luas termasuk font Jepang, mencerminkan jangkauan global Pinterest. Pada skala tampilan (70px, berat 600), Pin Sans menciptakan judul besar yang mengundang. Pada ukuran lebih kecil, sistemnya kompak: tombol 12px, keterangan 12–14px. Sistem penamaan variabel CSS (`--comp-*`, `--sema-*`, `--base-*`) mengungkapkan arsitektur token desain tiga tingkat yang canggih: token tingkat komponen, semantik, dan dasar.

Yang membedakan Pinterest adalah sistem border-radius yang dermawan (12px–40px, ditambah 50% untuk lingkaran) dan latar belakang tombol bernada hangat. Tombol sekunder (`#e5e5e0`) memiliki nada pasir yang hangat, bukan abu-abu dingin. Tombol merah utama menggunakan radius 16px — melengkung tetapi tidak berbentuk pil. Dikombinasikan dengan latar belakang lencana hangat (`hsla(60,20%,98%,.5)` — lapisan kekuningan yang halus) dan tata letak yang didominasi fotografi, hasilnya adalah desain yang terasa buatan tangan dan personal, bukan korporat dan steril.

**Karakteristik Utama:**
- Kanvas putih hangat dengan netral bernada zaitun/pasir — nyaman, bukan klinis
- Pinterest Red (`#e60023`) sebagai aksen berani tunggal — tidak pernah halus, selalu percaya diri
- Font khusus Pin Sans dengan tumpukan fallback global (termasuk CJK)
- Arsitektur token tiga tingkat: `--comp-*` / `--sema-*` / `--base-*`
- Permukaan sekunder hangat: abu-abu pasir (`#e5e5e0`), lencana hangat (`hsla(60,20%,98%,.5)`)
- Border-radius dermawan: 16px standar, hingga 40px untuk kontainer besar
- Konten fotografi sebagai prioritas — pin/gambar adalah elemen visual utama
- Teks ungu gelap (`#211922`) — hangat, dengan sentuhan plum

## 2. Palet Warna & Peran

### Merek Utama
- **Pinterest Red** (`#e60023`): CTA utama, aksen merek — merah berani dan percaya diri
- **Green 700** (`#103c25`): `--base-color-green-700`, aksen sukses/alam
- **Green 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, hijau ditekan

### Teks
- **Hitam Plum** (`#211922`): Teks utama — hampir hitam hangat dengan nada plum
- **Hitam** (`#000000`): Teks sekunder, teks tombol
- **Abu Zaitun** (`#62625b`): Deskripsi sekunder, teks redup
- **Perak Hangat** (`#91918c`): `--comp-button-color-text-transparent-disabled`, teks dinonaktifkan, batas input
- **Putih** (`#ffffff`): Teks pada permukaan gelap/berwarna

### Interaktif
- **Biru Fokus** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, cincin fokus
- **Ungu Performa** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, fitur performa
- **Ungu Rekomendasi** (`#7e238b`): `--sema-color-hover-text-recommendation`, rekomendasi AI
- **Biru Tautan** (`#2b48d4`): Warna teks tautan
- **Biru Facebook** (`#0866ff`): `--facebook-background-color`, login sosial
- **Biru Ditekan** (`#617bff`): `--base-color-pressed-blue-200`, status ditekan

### Permukaan & Batas
- **Abu Pasir** (`#e5e5e0`): Latar belakang tombol sekunder — hangat, seperti kerajinan
- **Cahaya Hangat** (`#e0e0d9`): Latar belakang tombol melingkar, lencana
- **Lapisan Hangat** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, latar lencana hangat halus
- **Kabut** (`#f6f6f3`): Permukaan terang (pada opasitas 50%)
- **Batas Dinonaktifkan** (`#c8c8c1`): `--sema-color-border-disabled`, batas dinonaktifkan
- **Abu Hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, batas hover
- **Permukaan Gelap** (`#33332e`): Latar belakang bagian gelap

### Semantik
- **Merah Error** (`#9e0a0a`): Status error kotak centang/formulir

## 3. Aturan Tipografi

### Keluarga Font
- **Utama**: `Pin Sans`, fallback: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hierarki

| Peran | Font | Ukuran | Berat | Tinggi Baris | Spasi Huruf | Catatan |
|-------|------|--------|-------|--------------|-------------|---------|
| Hero Tampilan | Pin Sans | 70px (4.38rem) | 600 | normal | normal | Dampak maksimum |
| Judul Bagian | Pin Sans | 28px (1.75rem) | 700 | normal | -1.2px | Pelacakan negatif |
| Isi | Pin Sans | 16px (1.00rem) | 400 | 1.40 | normal | Bacaan standar |
| Keterangan Tebal | Pin Sans | 14px (0.88rem) | 700 | normal | normal | Metadata kuat |
| Keterangan | Pin Sans | 12px (0.75rem) | 400–500 | 1.50 | normal | Teks kecil, tag |
| Tombol | Pin Sans | 12px (0.75rem) | 400 | normal | normal | Label tombol |

### Prinsip
- **Skala tipe kompak**: Rentangnya 12px–70px dengan lompatan dramatis — sebagian besar teks fungsional adalah 12–16px, menciptakan hierarki informasi yang padat dan mirip aplikasi.
- **Distribusi berat hangat**: 600–700 untuk judul, 400–500 untuk isi. Tidak ada berat ultra-ringan — tipografi selalu terasa substansial.
- **Pelacakan negatif pada judul**: -1.2px pada judul 28px menciptakan judul bagian yang nyaman dan intim.
- **Keluarga font tunggal**: Pin Sans menangani segalanya — tidak ada font tampilan sekunder atau monospace yang terdeteksi.

## 4. Gaya Komponen

### Tombol

**Merah Utama**
- Latar belakang: `#e60023` (Pinterest Red)
- Teks: `#000000` (hitam — pilihan tidak biasa untuk kontras pada merah)
- Padding: 6px 14px
- Radius: 16px (melengkung dermawan, bukan pil)
- Batas: `2px solid rgba(255, 255, 255, 0)` (transparan)
- Fokus: batas semantik + outline via variabel CSS

**Pasir Sekunder**
- Latar belakang: `#e5e5e0` (abu pasir hangat)
- Teks: `#000000`
- Padding: 6px 14px
- Radius: 16px
- Fokus: sistem batas semantik yang sama

**Aksi Melingkar**
- Latar belakang: `#e0e0d9` (cahaya hangat)
- Teks: `#211922` (hitam plum)
- Radius: 50% (lingkaran)
- Penggunaan: Aksi pin, kontrol navigasi

**Ghost / Transparan**
- Latar belakang: transparan
- Teks: `#000000`
- Tidak ada batas
- Penggunaan: Aksi tersier

### Kartu & Kontainer
- Kartu pin dengan fotografi sebagai prioritas dan radius dermawan (12px–20px)
- Tidak ada box-shadow tradisional pada sebagian besar kartu
- Latar belakang putih atau kabut hangat
- Batas putih tebal 8px pada beberapa kontainer gambar

### Input
- Input email: latar belakang putih, batas `1px solid #91918c`, radius 16px, padding 11px 15px
- Fokus: sistem batas semantik + outline via variabel CSS

### Navigasi
- Header bersih pada latar putih atau hangat
- Logo Pinterest + bilah pencarian terpusat
- Pin Sans 16px untuk tautan navigasi
- Aksen Pinterest Red untuk status aktif

### Perlakuan Gambar
- Grid masonry gaya pin (tata letak khas Pinterest)
- Sudut membulat: 12px–20px pada gambar
- Fotografi sebagai konten utama — setiap pin adalah gambar
- Batas putih tebal (8px) pada kontainer gambar unggulan

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasar: 8px
- Skala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Lompatan besar: 32px → 80px → 100px untuk spasi bagian

### Grid & Kontainer
- Grid masonry untuk konten pin (tata letak khas)
- Bagian konten terpusat dengan lebar maksimum yang dermawan
- Footer gelap lebar penuh
- Bilah pencarian sebagai elemen navigasi utama

### Filosofi Ruang Putih
- **Kepadatan inspirasi**: Grid masonry mengemas pin dengan rapat — kepadatan konten ADALAH proposisi nilai. Ruang putih ada di antara bagian, bukan di dalam grid.
- **Napas di atas, kepadatan di bawah**: Bagian hero/fitur mendapat padding dermawan; grid pin kompak dan imersif.

### Skala Border Radius
- Standar (12px): Kartu kecil, tautan
- Tombol (16px): Tombol, input, kartu sedang
- Nyaman (20px): Kartu fitur
- Besar (28px): Kontainer besar
- Bagian (32px): Elemen tab, panel besar
- Hero (40px): Kontainer hero, blok fitur besar
- Lingkaran (50%): Tombol aksi, indikator tab

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|-------|-----------|------------|
| Datar (Level 0) | Tidak ada bayangan | Default — pin mengandalkan konten, bukan bayangan |
| Halus (Level 1) | Bayangan minimal (dari token) | Overlay terangkat, dropdown |
| Fokus (Aksesibilitas) | Cincin `--sema-color-border-focus-outer-default` | Status fokus |

**Filosofi Bayangan**: Pinterest menggunakan bayangan minimal. Grid masonry mengandalkan konten (fotografi) untuk menciptakan minat visual daripada efek elevasi. Kedalaman berasal dari kehangatan warna permukaan dan pembulatan kontainer yang dermawan.

## 7. Yang Boleh dan Tidak Boleh Dilakukan

### Boleh
- Gunakan netral hangat (`#e5e5e0`, `#e0e0d9`, `#91918c`) — nada zaitun/pasir hangat adalah identitas
- Terapkan Pinterest Red (`#e60023`) hanya untuk CTA utama — berani dan tunggal
- Gunakan Pin Sans secara eksklusif — satu font untuk segalanya
- Terapkan border-radius dermawan: 16px untuk tombol/input, 20px+ untuk kartu
- Jaga kepadatan grid masonry — kepadatan konten adalah nilainya
- Gunakan latar lencana hangat (`hsla(60,20%,98%,.5)`) untuk lapisan hangat yang halus
- Gunakan `#211922` (hitam plum) untuk teks utama — lebih hangat dari hitam murni

### Tidak Boleh
- Jangan gunakan netral abu-abu dingin — selalu bernada hangat/zaitun
- Jangan gunakan hitam murni (`#000000`) sebagai teks utama — gunakan hitam plum (`#211922`)
- Jangan gunakan tombol berbentuk pil — radius 16px melengkung tetapi bukan pil
- Jangan tambahkan bayangan berat — Pinterest datar berdasarkan desain, kedalaman dari konten
- Jangan gunakan border-radius kecil (<12px) pada kartu — pembulatan dermawan adalah inti
- Jangan perkenalkan warna merek tambahan — merah + netral hangat adalah palet lengkap
- Jangan gunakan berat font tipis — Pin Sans minimum 400

## 8. Perilaku Responsif

### Titik Henti
| Nama | Lebar | Perubahan Utama |
|------|-------|-----------------|
| Mobile | <576px | Satu kolom, tata letak kompak |
| Mobile Besar | 576–768px | Grid pin 2 kolom |
| Tablet | 768–890px | Grid yang diperluas |
| Desktop Kecil | 890–1312px | Grid masonry standar |
| Desktop | 1312–1440px | Tata letak penuh |
| Desktop Besar | 1440–1680px | Kolom grid yang diperluas |
| Ultra-lebar | >1680px | Kepadatan grid maksimum |

### Strategi Pemadatan
- Grid pin: 5+ kolom → 3 → 2 → 1
- Navigasi: bilah pencarian + ikon → navigasi mobile disederhanakan
- Bagian fitur: berdampingan → ditumpuk
- Hero: 70px → menyusut secara proporsional
- Footer: multi-kolom gelap → ditumpuk

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- Merek: Pinterest Red (`#e60023`)
- Latar belakang: Putih (`#ffffff`)
- Teks: Hitam Plum (`#211922`)
- Teks sekunder: Abu Zaitun (`#62625b`)
- Permukaan tombol: Abu Pasir (`#e5e5e0`)
- Batas: Perak Hangat (`#91918c`)
- Fokus: Biru Fokus (`#435ee5`)

### Contoh Prompt Komponen
- "Buat hero: latar belakang putih. Judul 70px Pin Sans berat 600, hitam plum (#211922). Tombol CTA merah (#e60023, radius 16px, padding 6px 14px). Tombol pasir sekunder (#e5e5e0, radius 16px)."
- "Desain kartu pin: latar belakang putih, radius 16px, tanpa bayangan. Fotografi mengisi bagian atas, deskripsi Pin Sans 16px berat 400 di bawah dalam #62625b."
- "Bangun tombol aksi melingkar: latar belakang #e0e0d9, radius 50%, ikon #211922."
- "Buat field input: latar belakang putih, 1px solid #91918c, radius 16px, padding 11px 15px. Fokus: outline biru via token semantik."
- "Desain footer gelap: latar belakang #33332e. Logo skrip Pinterest dalam putih. Tautan 12px Pin Sans dalam #91918c."

### Panduan Iterasi
1. Netral hangat di mana-mana — abu-abu zaitun/pasir, tidak pernah baja dingin
2. Pinterest Red hanya untuk CTA — berani dan tunggal
3. Radius 16px pada tombol/input, 20px+ pada kartu — dermawan tetapi bukan pil
4. Pin Sans adalah satu-satunya font — kompak 12px untuk UI, 70px untuk tampilan
5. Fotografi membawa desain — UI tetap hangat dan minimal
6. Hitam plum (#211922) untuk teks — lebih hangat dari hitam murni
