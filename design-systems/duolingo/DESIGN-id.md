# Sistem desain terinspirasi Duolingo

> Category: Produktivitas & SaaS
> Platform pembelajaran bahasa. Hijau burung hantu cerah, bayangan tebal, kegembiraan gamifikasi.

## 1. Tema visual dan atmosfer

Duolingo adalah gamifikasi yang diwujudkan sebagai bahasa visual. Antarmuka ini dengan berani cerah, dengan **hijau burung hantu** (`#58cc02`) sebagai warna utama merek dan bayangan bawah 4px yang tebal pada setiap elemen interaktif yang terlihat seperti tombol 3D menunggu ditekan. Halaman berwarna putih (`#ffffff`) dengan border tebal 2–3px berwarna abu-abu gelap (`#e5e5e5`), dan seluruh sistem terasa seperti aplikasi iOS tahun 2015 yang terlahir kembali dengan hierarki yang lebih baik.

Tipografi menggunakan **Feather Bold** (sans-serif bulat kustom) untuk chrome dan **Mona Sans** (atau Inter) untuk teks isi. Ukuran tampilan besar dan percaya diri — Duolingo tidak pernah berbisik. Judul sering membawa coretan garis bawah hijau atau duduk di atas pil hijau, dan maskot Duo (burung hantu hijau) muncul sebagai karakter ilustrasi aktif, bukan logo statis.

Bahasa bentuk ramah: radius 16–20px pada kartu, 12px pada tombol, 9999px pada chip dan progress bar. Ikonografi terisi, dibulatkan, dan dikodekan warna berdasarkan keterampilan — setiap permukaan pelajaran memiliki pasangan warna yang langsung dapat diidentifikasi.

**Karakteristik utama:**
- Hijau burung hantu (`#58cc02`) sebagai warna merek dominan, digunakan pada lebih dari 30% permukaan
- Bayangan bawah tebal 4px pada setiap tombol (affordansi "tekanan taktil")
- Border solid 2–3px, tidak pernah garis tipis
- Feather Bold (tampilan bulat) + Mona Sans (isi)
- Teks besar percaya diri — ukuran tampilan mulai dari 48px dan naik
- Maskot sebagai karakter: burung hantu Duo muncul di onboarding, kesalahan, streak
- Oranye streak (`#ff9600`) dan merah muda permata (`#ce82ff`) sebagai warna merek sekunder

## 2. Palet warna & peran

### Primer
- **Hijau burung hantu** (`#58cc02`): Primer merek, CTA utama, jawaban benar.
- **Hijau burung hantu dalam** (`#58a700`): Warna tekan/bayangan untuk tombol hijau.
- **Hijau burung hantu terang** (`#89e219`): Hover, isian lembut.
- **Hijau burung hantu pucat** (`#dbf8c5`): Permukaan lembut, spanduk sukses.

### Aksen sekunder
- **Oranye streak** (`#ff9600`): Penghitung streak, ikon api, energi premium.
- **Oranye streak dalam** (`#cc7a00`): Oranye ditekan.
- **Merah muda permata** (`#ce82ff`): Mata uang permata, Super Duolingo.
- **Biru belut** (`#1cb0f6`): Tombol petunjuk, tautan info.
- **Merah kardinal** (`#ff4b4b`): Jawaban salah, nyawa hilang.
- **Kuning lebah** (`#ffc800`): Lencana pro, pencapaian.

### Permukaan
- **Salju** (`#ffffff`): Latar belakang utama.
- **Belut** (`#f7f7f7`): Pemisah bagian, permukaan sekunder.
- **Angsa** (`#e5e5e5`): Latar belakang dinonaktifkan, blok tersemat.
- **Serigala** (`#777777`): Pembagi gelap, teks sekunder.

### Tinta & teks
- **Hitam belut** (`#3c3c3c`): Teks utama.
- **Serigala** (`#777777`): Teks sekunder, keterangan.
- **Kelinci** (`#afafaf`): Dinonaktifkan, placeholder.

### Border
- **Angsa** (`#e5e5e5`): Border standar 2px.
- **Kelinci** (`#afafaf`): Border ditekankan saat hover.

## 3. Aturan tipografi

### Keluarga font
- **Tampilan / UI / Judul**: `Feather Bold`, dengan fallback: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Isi / Teks panjang**: `Mona Sans`, dengan fallback: `'Helvetica Neue', system-ui, sans-serif`
- **Kode (jarang, sekolah/admin)**: `JetBrains Mono`, dengan fallback: `ui-monospace, Menlo, monospace`

### Hierarki

| Peran | Font | Ukuran | Berat | Tinggi baris | Jarak huruf | Catatan |
|------|------|------|--------|-------------|----------------|-------|
| Tampilan | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Hero onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Judul halaman |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Judul bagian |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Judul kartu, baris pelajaran |
| Isi besar | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Prompt pelajaran, instruksi |
| Isi | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Prosa standar |
| Keterangan | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Penghitung XP, metadata |
| Tombol | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Label tombol standar |
| Streak | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Nomor streak, di atas api |

### Prinsip
- **800 adalah default**: Feather Bold berjalan di 800 pada judul dan tombol. 700 terasa lemah dalam sistem ini.
- **Teks besar**: ukuran judul 25–40% lebih besar dari merek produk tipikal — kepercayaan diri sebagai identitas.
- **Bentuk huruf bulat**: setiap glif memiliki terminal yang lembut; serif tajam akan merusak kontrak keramahan.

## 4. Styling komponen

### Tombol

**Primer (Hijau burung hantu)**
- Latar belakang: `#58cc02`
- Teks: `#ffffff`
- Padding: 14px 24px
- Radius: 16px
- Border-bottom: 4px solid `#58a700` (bayangan tebal)
- Hover: latar belakang `#89e219`
- Aktif: translate-y 4px, border-bottom 0 (tombol "ditekan")
- Penggunaan: "Lanjutkan", "Periksa", CTA utama.

**Sekunder (Putih dengan bayangan bawah)**
- Latar belakang: `#ffffff`
- Teks: `#777777`
- Border: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Padding: 14px 24px
- Hover: teks `#3c3c3c`, border `#afafaf`

**Oranye streak**
- Latar belakang: `#ff9600`
- Teks: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Penggunaan: target streak, "Mulai streak"

**Kesalahan (Merah kardinal)**
- Latar belakang: `#ff4b4b`
- Teks: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Penggunaan: umpan balik jawaban salah.

### Kartu / Ubin pelajaran
- Latar belakang: `#ffffff`
- Border: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Padding: 16px
- Hover: angkat 2px, bayangan `0 4px 0 #d7d7d7`

### Node pohon keterampilan (Gelembung pelajaran)
- Ukuran: 80×72px
- Latar belakang: warna keterampilan tint (hijau untuk aktif, abu-abu untuk terkunci)
- Border-bottom: 6px solid varian lebih gelap
- Radius: 50% (lingkaran)
- Aktif: berdenyut 1.0 → 1.05 setiap 1.6s

### Input
- Latar belakang: `#ffffff`
- Border: 2px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 16px
- Fokus: border `#1cb0f6` (biru belut), cincin `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Progress bar
- Jalur: `#e5e5e5`
- Isian: `#58cc02` (atau `#ff9600` untuk streak)
- Radius: 9999px
- Tinggi: 16px
- Isian animasi: 320ms ease-out saat bertambah.

## 5. Jarak & Tata letak

- **Unit dasar**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Kontainer**: maks. 1080px, gutter 24px.
- **Kolom pohon pelajaran**: lebar 320px; dipusatkan di desktop.

## 6. Gerakan

- **Durasi**: 180ms untuk tekanan tombol; 320ms untuk membuka kunci node keterampilan; 1.6s untuk denyut node aktif.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, sedikit lewat) untuk membuka kunci.
- **Maskot**: Duo berkedip setiap 4–6s, melompat pada tonggak streak (480ms ease-out pegas).

## 7. Panduan penggunaan

- Pertahankan hijau burung hantu saturasi tinggi, bayangan bawah tebal, dan geometri pelajaran bulat secara bersamaan; tombol hijau datar saja tidak terbaca sebagai Duolingo.
- Simpan teks tebal berukuran besar untuk momen pelajaran, streak, dan kemajuan di mana produk membutuhkan dorongan atau umpan balik.
- Gunakan gerakan ceria dengan hemat di sekitar perubahan status kemajuan, hindari animasi memantul generik pada setiap kontrol.
