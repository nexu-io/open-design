# Sistem Desain Terinspirasi dari GitHub

> Category: Alat Pengembang
> Platform berorientasi kode. Kepadatan fungsional, presisi biru-di-atas-putih, fondasi Primer.

## 1. Tema Visual & Atmosfer

Tampilan GitHub dirancang secara teknis, bukan sekadar dekoratif. Setiap piksel menegaskan sebuah sikap: ini adalah alat bagi orang-orang yang peduli pada diff, build, dan pull request. Latar belakang halaman adalah `#ffffff` yang bersih (mode terang) atau `#0d1117` (mode gelap), dengan konten yang tersusun pada panel persegi padat yang dipisahkan oleh garis batas tipis alih-alih ruang kosong. Kepadatan informasi adalah mereknya — baris daftar, baris kode, header repositori, dan kartu notifikasi semuanya tersusun rapat sehingga pengguna mahir dapat memindai ratusan item tanpa menggulir.

Aksen khas adalah **biru Primer** (`#0969da`) untuk tautan dan aksi utama, serta **hijau GitHub** (`#1a7f37`) untuk status merged, keberhasilan, dan tombol merge itu sendiri. Keduanya terasa sedikit redup dibandingkan biru dan hijau produk konsumen — cukup jenuh untuk terbaca di atas teks abu-abu yang padat, namun cukup tenang untuk menyatu dengan latar belakang ketika beberapa warna muncul dalam satu viewport.

Tipografi menggunakan tumpukan **system-ui** di seluruh produk sehingga teks dirender dengan tajam di setiap sistem operasi, dipasangkan dengan **SFMono / Menlo / Consolas** untuk kode. Tidak ada font display editorial; suara GitHub adalah suara sistem yang sudah Anda gunakan.

**Karakteristik Utama:**
- Kanvas putih murni (`#ffffff`) atau hitam biru tua (`#0d1117`) — tanpa kehangatan, tanpa warna tint
- Garis batas abu-abu tipis (`#d0d7de`) mendefinisikan setiap panel dan bagian
- Biru Primer (`#0969da`) untuk tautan/aksi utama; hijau GitHub (`#1a7f37`) untuk keberhasilan/merge
- system-ui untuk prosa; SFMono untuk kode — tanpa typeface kustom
- Baris daftar padat dengan padding minimal; ruang putih jarang digunakan
- Ikonografi Octicon pada 16px / 24px — goresan tunggal, geometris, konsisten
- Lencana status berbentuk pil dengan semantik warna yang kuat

## 2. Palet Warna & Perannya

### Utama
- **Canvas Default** (`#ffffff`): Latar belakang halaman utama, tema terang.
- **Canvas Subtle** (`#f6f8fa`): Permukaan sekunder, sidebar, latar belakang input, strip header.
- **Canvas Inset** (`#eaeef2`): Latar belakang blok kode, permukaan terbenam.
- **Fg Default** (`#1f2328`): Teks utama, judul, tinta.
- **Fg Muted** (`#656d76`): Teks sekunder, keterangan, jalur file.

### Aksen Merek
- **Primer Blue** (`#0969da`): Tautan, CTA utama, dasar cincin fokus — warna interaktif universal.
- **Primer Blue Hover** (`#0550ae`): Hover/ditekan untuk biru utama.
- **Accent Subtle** (`#ddf4ff`): Permukaan biru lembut untuk callout, spanduk info.

### Semantik
- **Success / Merge Green** (`#1a7f37`): PR yang di-merge, lencana keberhasilan, tombol merge.
- **Success Subtle** (`#dafbe1`): Tint permukaan keberhasilan.
- **Open Green** (`#1a7f37`): Status issue/PR "Terbuka".
- **Closed / Danger Red** (`#cf222e`): PR tertutup, aksi destruktif, kesalahan validasi.
- **Danger Subtle** (`#ffebe9`): Permukaan spanduk kesalahan.
- **Attention / Warning Yellow** (`#9a6700`): Teks peringatan di atas permukaan amber.
- **Attention Subtle** (`#fff8c5`): Permukaan spanduk peringatan.
- **Done Purple** (`#8250df`): Merged-dan-diarsipkan, status "selesai", lencana premium.
- **Sponsor Pink** (`#bf3989`): Ikon hati sponsor, merek GitHub Sponsors.

### Border & Pemisah
- **Border Default** (`#d0d7de`): Garis batas tipis standar, garis luar panel.
- **Border Muted** (`#d8dee4`): Pemisah dalam di dalam panel.
- **Border Subtle** (`#eaeef2`): Pemisah baris tabel yang samar.

### Tema Gelap
- **Dark Canvas** (`#0d1117`): Latar belakang halaman gelap.
- **Dark Surface** (`#161b22`): Sidebar, header, permukaan sekunder.
- **Dark Border** (`#30363d`): Garis batas mode gelap standar.
- **Dark Fg** (`#e6edf3`): Teks utama di atas latar gelap.

## 3. Aturan Tipografi

### Keluarga Font
- **Body / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hierarki

| Peran | Font | Ukuran | Ketebalan | Tinggi Baris | Spasi Huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Header repo, hero pemasaran |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Judul halaman |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Judul bagian |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Sub-bagian, header panel |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Ukuran teks default — bukan 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Keterangan, metadata file |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Blok kode, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Span `code` inline |

### Prinsip
- **Body 14px, bukan 16px**: Kepadatan prosa GitHub adalah identitasnya. Produk dibaca pada 14px untuk muat lebih banyak baris dalam satu viewport.
- **Ketebalan biner**: 400 untuk segalanya secara default; 600 untuk judul dan penekanan. Tidak ada 500, tidak ada 700.
- **Font sistem selalu**: jangan muat webfont untuk antarmuka — teks harus dirender seketika pada koneksi lambat.

## 4. Gaya Komponen

### Tombol

**Utama (Hijau)**
- Background: `#1f883d`
- Teks: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- Penggunaan: "Buat repositori", "Merge pull request"

**Default**
- Background: `#f6f8fa`
- Teks: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, border `#d0d7de`

**Outline (Gaya Tautan Biru)**
- Background: `#ffffff`
- Teks: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`, teks `#ffffff`

**Bahaya**
- Background: `#ffffff`
- Teks: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`, teks `#ffffff`, border `#a40e26`

### Kartu / Kotak
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (header) + 16px (body)
- Header memiliki strip `#f6f8fa` dengan border bawah.

### Input
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Fokus: border `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### Pil Status (Issue / PR)
- **Terbuka**: background `#1a7f37`, teks putih, padding 4px 10px, radius 9999px.
- **Tertutup**: background `#cf222e`, teks putih.
- **Merged**: background `#8250df`, teks putih.
- **Draf**: background `#6e7781`, teks putih.

### Label (Tag pada Issue/PR)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- Background dan teks bersifat programatik (warna label → teks dihitung untuk kontras).

## 5. Spasi & Tata Letak

- **Unit dasar**: 4px. Skala spasi: 4, 8, 12, 16, 24, 32, 40, 48.
- **Lebar maksimum halaman**: 1280px (`Container-xl`).
- **Sidebar**: 296px di desktop, mengecil di bawah 1012px.
- **Padding baris**: 16px horizontal, 12px vertikal (daftar padat berdasarkan desain).

## 6. Gerakan

- **Durasi**: 80ms untuk hover; 200ms untuk membuka menu/popover.
- **Easing**: `ease-out` untuk membuka, `ease-in` untuk menutup.
- **Dihindari**: animasi saat halaman dimuat, parallax, micro-interaksi persisten. Elemen muncul; tidak tampil berlebihan.

## 7. Batasan Penggunaan

- Pertahankan daftar padat, kotak berbatas, dan tipografi sistem secara bersamaan; tombol hijau yang berdiri sendiri tidak cukup untuk menciptakan tampilan produk seperti GitHub.
- Gunakan hijau untuk aksi repositori yang konstruktif, biru untuk tautan dan fokus, serta merah/ungu/abu-abu hanya untuk status issue, PR, dan workflow.
- Utamakan antarmuka yang tenang, border yang eksplisit, dan spasi yang kompak dibandingkan bayangan dekoratif atau kartu bergaya pemasaran yang besar.
