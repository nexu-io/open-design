# Sistem desain terinspirasi Webflow

> Category: Desain & Kreatif
> Pembangun web visual. Estetika situs marketing yang halus dengan aksen biru.

## 1. Tema visual & Suasana

Situs web Webflow adalah platform yang kaya visual dan berorientasi pada alat, yang mengkomunikasikan "desain tanpa kode" melalui permukaan putih bersih, biru khas Webflow（`#146ef5`）, dan palet warna sekunder yang kaya（ungu, merah muda, hijau, oranye, kuning, merah）. Font kustom WF Visual Sans Variable menciptakan sistem tipografi yang percaya diri dan presisi dengan bobot 600 untuk display dan 500 untuk isi teks.

**Karakteristik utama：**
- Kanvas putih dengan teks hampir hitam（`#080808`）
- Biru Webflow（`#146ef5`）sebagai warna merek utama dan interaktif
- WF Visual Sans Variable — font variabel kustom dengan bobot 500–600
- Palet sekunder yang kaya：ungu `#7a3dff`, merah muda `#ed52cb`, hijau `#00d722`, oranye `#ff6b00`, kuning `#ffae13`, merah `#ee1d36`
- Radius batas konservatif 4px–8px — tajam, tidak bulat
- Tumpukan bayangan berlapis（5 bayangan bertingkat）
- Label huruf kapital：10px–15px, bobot 500–600, jarak huruf lebar（0,6px–1,5px）
- Animasi translate(6px) saat hover pada tombol

## 2. Palet warna & Peran

### Utama
- **Hampir Hitam**（`#080808`）：Teks utama
- **Biru Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, CTA utama dan tautan
- **Biru 400**（`#3b89ff`）：`--_color---primary--blue-400`, biru interaktif lebih terang
- **Biru 300**（`#006acc`）：`--_color---blue-300`, varian biru lebih gelap
- **Biru hover tombol**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Aksen sekunder
- **Ungu**（`#7a3dff`）：`--_color---secondary--purple`
- **Merah muda**（`#ed52cb`）：`--_color---secondary--pink`
- **Hijau**（`#00d722`）：`--_color---secondary--green`
- **Oranye**（`#ff6b00`）：`--_color---secondary--orange`
- **Kuning**（`#ffae13`）：`--_color---secondary--yellow`
- **Merah**（`#ee1d36`）：`--_color---secondary--red`

### Netral
- **Abu 800**（`#222222`）：Teks sekunder gelap
- **Abu 700**（`#363636`）：Teks tengah
- **Abu 300**（`#ababab`）：Teks redup, placeholder
- **Abu tengah**（`#5a5a5a`）：Teks tautan
- **Abu batas**（`#d8d8d8`）：Batas, pembagi
- **Batas hover**（`#898989`）：Batas saat hover

### Bayangan
- **Bertingkat 5 lapis**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Aturan tipografi

### Font：`WF Visual Sans Variable`, cadangan：`Arial`

| Peran | Ukuran | Bobot | Tinggi baris | Jarak huruf | Catatan |
|------|------|--------|-------------|----------------|-------|
| Hero display | 80px | 600 | 1,04 | -0,8px | |
| Judul bagian | 56px | 600 | 1,04 | normal | |
| Sub-judul | 32px | 500 | 1,30 | normal | |
| Judul fitur | 24px | 500–600 | 1,30 | normal | |
| Isi | 20px | 400–500 | 1,40–1,50 | normal | |
| Isi standar | 16px | 400–500 | 1,60 | -0,16px | |
| Tombol | 16px | 500 | 1,60 | -0,16px | |
| Label huruf kapital | 15px | 500 | 1,30 | 1,5px | uppercase |
| Keterangan | 14px | 400–500 | 1,40–1,60 | normal | |
| Lencana huruf kapital | 12,8px | 550 | 1,20 | normal | uppercase |
| Mikro huruf kapital | 10px | 500–600 | 1,30 | 1px | uppercase |
| Kode：Inconsolata（font monospace pendamping）

## 4. Gaya komponen

### Tombol
- Transparan：teks `#080808`, translate(6px) saat hover
- Lingkaran putih：radius 50%, latar putih
- Lencana biru：latar `#146ef5`, radius 4px, bobot 550

### Kartu：`1px solid #d8d8d8`, radius 4px–8px
### Lencana：latar bernuansa biru 10% opasitas, radius 4px

## 5. Tata letak
- Jarak：skala fraksional（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Radius：2px, 4px, 8px, 50% — konservatif, tajam
- Titik putus：479px, 768px, 992px

## 6. Kedalaman：sistem bayangan bertingkat 5 lapis

## 7. Yang harus dan tidak boleh dilakukan
- Lakukan：Gunakan WF Visual Sans Variable dengan bobot 500–600. Biru（`#146ef5`）untuk CTA. Radius 4px. translate(6px) saat hover.
- Hindari：Membulatkan elemen fungsional lebih dari 8px. Menggunakan warna sekunder pada CTA utama.

## 8. Responsif：479px, 768px, 992px

## 9. Panduan prompt untuk Agent
- Teks：Hampir Hitam（`#080808`）
- CTA：Biru Webflow（`#146ef5`）
- Latar belakang：Putih（`#ffffff`）
- Batas：`#d8d8d8`
- Sekunder：Ungu `#7a3dff`, Merah muda `#ed52cb`, Hijau `#00d722`
