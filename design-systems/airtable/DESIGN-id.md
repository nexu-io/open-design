# Sistem Desain Terinspirasi dari Airtable

> Category: Desain & Kreatif
> Hibrida spreadsheet-database. Estetika data terstruktur yang berwarna-warni dan ramah.

## 1. Tema Visual & Atmosfer

Situs web Airtable adalah platform bersih yang ramah untuk perusahaan, yang menyampaikan "kesederhanaan yang canggih" melalui kanvas putih dengan teks biru navy dalam (`#181d26`) dan Airtable Blue (`#1b61c9`) sebagai aksen interaktif utama. Keluarga font Haas (varian display + text) menciptakan sistem tipografi presisi Swiss dengan jarak huruf positif di seluruh halaman.

**Karakteristik Utama:**
- Kanvas putih dengan teks biru navy dalam (`#181d26`)
- Airtable Blue (`#1b61c9`) sebagai warna CTA dan tautan utama
- Sistem font ganda Haas + Haas Groot Disp
- Jarak huruf positif pada teks isi (0.08px–0.28px)
- Radius tombol 12px, kartu 16px–32px
- Bayangan multi-lapis bernada biru: `rgba(45,127,249,0.28) 0px 1px 3px`
- Token tema semantis: penamaan variabel CSS `--theme_*`

## 2. Palet Warna & Peran

### Primer
- **Biru Navy Dalam** (`#181d26`): Teks utama
- **Airtable Blue** (`#1b61c9`): Tombol CTA, tautan
- **Putih** (`#ffffff`): Permukaan utama
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semantis
- **Hijau Sukses** (`#006400`): `--theme_success-text`
- **Teks Lemah** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Sekunder Aktif** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Netral
- **Abu-abu Gelap** (`#333333`): Teks sekunder
- **Biru Tengah** (`#254fad`): Varian biru tautan/aksen
- **Batas** (`#e0e2e6`): Batas kartu
- **Permukaan Terang** (`#f8fafc`): Permukaan halus

### Bayangan
- **Bernada Biru** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Lembut** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Aturan Tipografi

### Keluarga Font
- **Primer**: `Haas`, fallback: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, fallback: `Haas`

### Hierarki

| Peran | Font | Ukuran | Ketebalan | Tinggi Baris | Jarak Huruf |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Tebal | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Judul Bagian | Haas | 40px | 400 | 1.25 | normal |
| Sub-judul | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Judul Kartu | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Fitur | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Isi | Haas | 18px | 400 | 1.35 | 0.18px |
| Isi Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Tombol | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Keterangan | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Gaya Komponen

### Tombol
- **Biru Primer**: `#1b61c9`, teks putih, padding 16px 24px, radius 12px
- **Putih**: latar belakang putih, teks `#181d26`, radius 12px, batas putih 1px
- **Persetujuan Cookie**: latar belakang `#1b61c9`, radius 2px (tajam)

### Kartu: `1px solid #e0e2e6`, radius 16px–24px
### Input: Gaya Haas standar

## 5. Tata Letak
- Spasi: 1–48px (basis 8px)
- Radius: 2px (kecil), 12px (tombol), 16px (kartu), 24px (bagian), 32px (besar), 50% (lingkaran)

## 6. Kedalaman
- Sistem bayangan multi-lapis bernada biru
- Ambien lembut: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Yang Harus dan Tidak Harus Dilakukan
### Lakukan: Gunakan Airtable Blue untuk CTA, Haas dengan tracking positif, tombol radius 12px
### Jangan: Lewatkan jarak huruf positif, gunakan bayangan berat

## 8. Perilaku Responsif
Breakpoint: 425–1664px (23 breakpoint)

## 9. Panduan Prompt untuk Agent
- Teks: Biru Navy Dalam (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Latar Belakang: Putih (`#ffffff`)
- Batas: `#e0e2e6`
