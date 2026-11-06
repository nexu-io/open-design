# Sistem Desain Terinspirasi dari Discord

> Category: Produktivitas & SaaS
> Platform suara / obrolan. Ungu biru yang dalam, permukaan dark-first, momen aksen yang menyenangkan.

## 1. Tema Visual & Atmosfer

Produk Discord dirancang untuk malam hari, sesi raid, dan percakapan suara berkelompok — sehingga seluruh tampilan mengutamakan mode gelap. Kanvas default adalah `Background Primary` yang dalam (`#313338` tema terang, `#1e1f22` tema gelap), dengan kolom obrolan yang berlapis di atas warna yang sedikit lebih terang atau lebih gelap untuk menandakan saluran, utas, dan panel samping. **Blurple** (`#5865f2`) yang khas dikhususkan untuk merek, CTA utama, sebutan, dan affordance "Anda" — digunakan secara hemat agar menonjol di antara warna netral yang redup.

Tipografi menggunakan **gg sans** (pengganti Whitney kustom Discord) untuk teks dan antarmuka, dengan bentuk geometris membulat yang terasa ramah namun tetap terbaca pada ukuran kecil yang dibutuhkan klien obrolan. Heading meningkat secara bertahap; baris obrolan dibuat rapat (4–8px di antara grup pesan) agar guliran berjam-jam tetap mudah dipindai.

Bahasa bentuk terasa membulat namun tidak terlalu lunak: radius 8px pada kartu, 4px pada input, pil penuh pada lencana status dan tag. Server menggunakan avatar kotak membulat berukuran 48px yang berubah menjadi lingkaran saat hover — sebuah gerakan kecil yang telah menjadi bagian dari identitas merek.

**Karakteristik Utama:**
- Permukaan dark-first: `#1e1f22` / `#2b2d31` / `#313338` (kedalaman 3 langkah)
- Blurple `#5865f2` sebagai satu-satunya aksen jenuh di permukaan obrolan
- gg sans (gaya Whitney) untuk semua teks — ramah, geometris, netral
- Avatar server kotak membulat (radius 16px) yang berubah menjadi lingkaran saat hover
- Spasi baris obrolan yang rapat, padding panel samping yang lega
- Titik status: hijau online, kuning idle, merah dnd, abu-abu offline
- Pemisah 1px yang sejajar piksel dalam warna putih redup dengan alpha rendah

## 2. Palet Warna & Perannya

### Primer
- **Blurple** (`#5865f2`): Merek utama, CTA utama, sorotan sebutan.
- **Blurple Hover** (`#4752c4`): Hover/aktif untuk blurple.
- **Blurple Soft** (`#7289da`): Blurple warisan, aksen sekunder dalam pemasaran.

### Permukaan (Tema Gelap — default)
- **Background Tertiary** (`#1e1f22`): Rel daftar server, latar belakang paling dalam.
- **Background Secondary** (`#2b2d31`): Bilah sisi saluran, bilah sisi pengaturan.
- **Background Primary** (`#313338`): Permukaan obrolan, kolom pesan.
- **Background Floating** (`#111214`): Popover mengambang, tooltip, pelengkapan otomatis.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Lapisan hover pada baris.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Baris aktif.

### Permukaan (Tema Terang)
- **Light Bg Primary** (`#ffffff`): Permukaan obrolan dalam tema terang.
- **Light Bg Secondary** (`#f2f3f5`): Bilah sisi dalam tema terang.
- **Light Bg Tertiary** (`#e3e5e8`): Permukaan terang paling dalam.

### Teks
- **Header Primary** (`#f2f3f5`): Header saluran, judul modal dalam tema gelap.
- **Header Secondary** (`#b5bac1`): Header yang diredam.
- **Text Normal** (`#dbdee1`): Teks isi dalam tema gelap — sedikit lebih dingin dari putih murni.
- **Text Muted** (`#949ba4`): Cap waktu, nama server, metadata sekunder.
- **Text Link** (`#00a8fc`): Hyperlink dalam pesan — biru langit, berbeda dari blurple.
- **Channels Default** (`#80848e`): Nama saluran tidak aktif di bilah sisi.

### Status & Semantik
- **Status Online** (`#23a55a`): Titik online, status sukses.
- **Status Idle** (`#f0b232`): Titik idle, tidak di tempat.
- **Status DND** (`#f23f43`): Jangan ganggu, juga berfungsi sebagai merah destruktif.
- **Status Streaming** (`#593695`): Ungu "Streaming".
- **Status Offline** (`#80848e`): Abu-abu offline.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Lapisan blurple lembut pada baris @sebutan.

### Batas & Pemisah
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Pemisah standar dalam mode gelap.
- **Border Subtle** (`#3f4147`): Pemisah solid untuk kartu.

## 3. Aturan Tipografi

### Keluarga Font
- **Isi / UI / Heading**: `gg sans`, dengan fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (warisan / Whitney)**: `Whitney`, dengan fallback: `gg sans`
- **Kode / Mono**: `"gg mono"`, dengan fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarki

| Peran | Font | Ukuran | Bobot | Tinggi Baris | Jarak Huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero pemasaran |
| Heading Halaman | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Judul pengaturan/profil |
| Nama Saluran | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, header saluran |
| Isi Pesan | gg sans | 16px (1rem) | 400 | 1.375 | normal | Teks obrolan standar |
| Nama Pengguna | gg sans | 16px (1rem) | 500 | 1.25 | normal | Penulis pesan |
| Cap Waktu | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Hari ini pukul 4:32 PM" |
| Saluran Bilah Sisi | gg sans | 16px (1rem) | 500 | 1.25 | normal | Baris daftar saluran |
| Nama Server | gg sans | 16px (1rem) | 600 | 1.25 | normal | Header server |
| Keterangan / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Teks status, tag yang telah diedit |
| Kode Inline | gg mono | 0.875em | 400 | inherit | normal | `code` inline |
| Blok Kode | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Blok ```tiga-pagar``` |

### Prinsip
- **Geometri yang ramah**: gg sans menggantikan Whitney dengan terminal membulat pada a/g/s — merek menginginkan kehangatan tanpa mengorbankan keterbacaan.
- **Kontras bobot daripada kontras warna**: hierarki berasal dari langkah bobot 400→500→600→700→800; permukaan tetap netral.
- **Isi 16px**: pesan obrolan tidak menyusut di bawah 16px. Kepadatan berasal dari tinggi baris (1.375), bukan ukuran font.

## 4. Gaya Komponen

### Tombol

**Primer**
- Latar belakang: `#5865f2`
- Teks: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- Gunakan untuk: CTA utama, "Lanjutkan", "Bergabung ke Server"

**Sekunder**
- Latar belakang: `#4e5058`
- Teks: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tersier / Halus (Gaya tautan)**
- Latar belakang: transparan
- Teks: `#dbdee1`
- Hover: teks bergaris bawah, tidak ada perubahan latar belakang

**Bahaya**
- Latar belakang: `#da373c`
- Teks: `#ffffff`
- Hover: `#a12d2f`

### Input
- Latar belakang: `#1e1f22`
- Teks: `#dbdee1`
- Batas: 1px solid `#1e1f22`
- Radius: 4px
- Padding: 10px 12px
- Fokus: batas `#5865f2`

### Avatar Server
- Ukuran: 48×48px
- Radius: 16px (kotak membulat) secara default; bertransisi ke 50% saat hover dan aktif.
- Status aktif: pil putih 4px di tepi kiri kolom ikon.

### Titik Status
- Ukuran: 10×10px
- Batas: 3px solid background-tertiary (menciptakan efek "takik")
- Posisi: kanan bawah avatar.

### Kartu / Sematan
- Latar belakang: `#2b2d31` (gelap) atau `#f2f3f5` (terang)
- Batas kiri: 4px solid warna aksen sematan.
- Radius: 4px
- Padding: 8px 16px

### Pil Sebutan
- Latar belakang: `rgba(88, 101, 242, 0.3)`
- Teks: `#c9cdfb`
- Padding: 0 2px
- Radius: 3px

## 5. Spasi & Tata Letak

- **Unit dasar**: 4px. Skala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Rel server**: lebar 72px, tetap.
- **Bilah sisi saluran**: lebar 240px.
- **Daftar anggota**: lebar 240px di desktop.
- **Kolom obrolan**: fluid, minimal 380px.

## 6. Gerak

- **Durasi**: 200ms untuk hover; 350ms untuk morph lingkaran avatar; 80ms untuk fade tooltip.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` untuk morph avatar (cepat lalu menetap).
- **Denyut notifikasi**: 1.4s ease-in-out infinite pada indikator sebutan belum dibaca.

## 7. Panduan Penggunaan

- Pertahankan tampilan gelap, kepadatan kompak, dan hierarki aksi blurple secara bersamaan; menggunakan blurple pada tata letak pemasaran bergaya terang akan merusak nuansa produk Discord.
- Jaga permukaan yang banyak navigasi tetap terstruktur di sekitar rel, bilah sisi, dan kolom obrolan daripada kartu dekoratif yang terisolasi.
- Gunakan bahasa avatar kotak membulat dan titik status saat merepresentasikan orang, server, atau kehadiran aktif.
