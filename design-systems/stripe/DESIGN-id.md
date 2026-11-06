# Design System Inspired by Stripe

> Category: Fintech & Kripto
> Infrastruktur pembayaran. Gradien ungu khas, keanggunan weight-300.

## 1. Visual Theme & Atmosphere

Website Stripe adalah standar emas desain fintech — sebuah sistem yang berhasil terasa teknikal sekaligus mewah, presisi sekaligus hangat. Halaman dibuka dengan kanvas putih bersih (`#ffffff`), heading navy gelap (`#061b31`), dan ungu khas (`#533afd`) yang berfungsi sebagai jangkar merek sekaligus aksen interaktif. Ini bukan ungu dingin dan klinis khas perangkat lunak enterprise; melainkan violet kaya dan jenuh yang terbaca sebagai percaya diri dan premium. Kesan keseluruhannya adalah lembaga keuangan yang dirancang ulang oleh foundry tipografi kelas dunia.

Font variabel `sohne-var` adalah elemen penentu identitas visual Stripe. Setiap elemen teks mengaktifkan stylistic set OpenType `"ss01"`, yang memodifikasi bentuk karakter untuk tampilan geometris dan modern yang khas. Pada ukuran display (48px–56px), sohne-var berjalan di weight 300 — bobot yang luar biasa ringan untuk headline yang menciptakan otoritas halus, seolah berbisik. Ini kebalikan dari konvensi "headline hero tebal"; headline Stripe terasa tidak perlu berteriak. Negative letter-spacing (-1.4px pada 56px, -0.96px pada 48px) memadatkan teks menjadi blok yang rapat dan terasa terancang. Pada ukuran lebih kecil, sistem ini juga menggunakan weight 300 dengan tracking yang dikurangi secara proporsional, serta angka tabular via `"tnum"` untuk tampilan data keuangan.

Yang benar-benar membedakan Stripe adalah sistem bayangannya. Alih-alih pendekatan datar atau berlapis tunggal seperti kebanyakan situs, Stripe menggunakan bayangan berlapis biru: `rgba(50,50,93,0.25)` khas dikombinasikan dengan `rgba(0,0,0,0.1)` menciptakan bayangan dengan kedalaman atmosferik yang sejuk — seolah elemen melayang di langit senja. Nuansa biru-abu dari warna bayangan utama (50,50,93) terhubung langsung ke palet merek navy-ungu, sehingga bahkan elevasi pun terasa sesuai merek.

**Karakteristik Utama:**
- sohne-var dengan OpenType `"ss01"` pada semua teks — stylistic set kustom yang mendefinisikan letterform merek
- Weight 300 sebagai bobot headline khas — ringan, percaya diri, menentang konvensi
- Negative letter-spacing pada ukuran display (-1.4px pada 56px, pelonggaran progresif ke bawah)
- Bayangan berlapis biru menggunakan `rgba(50,50,93,0.25)` — elevasi yang terasa berwarna merek
- Heading navy gelap (`#061b31`) bukan hitam — hangat, premium, berkelas finansial
- Border-radius konservatif (4px–8px) — tidak ada bentuk pil, tidak ada yang keras
- Aksen ruby (`#ea2261`) dan magenta (`#f96bee`) untuk gradien dan elemen dekoratif
- `SourceCodePro` sebagai pendamping monospace untuk kode dan label teknis

## 2. Color Palette & Roles

### Primary
- **Stripe Purple** (`#533afd`): Warna merek utama, latar belakang CTA, teks tautan, sorotan interaktif. Biru-violet jenuh yang menjangkar seluruh sistem.
- **Deep Navy** (`#061b31`): `--hds-color-heading-solid`. Warna heading utama. Bukan hitam, bukan abu-abu — biru sangat gelap yang menambah kehangatan dan kedalaman pada teks.
- **Pure White** (`#ffffff`): Latar belakang halaman, permukaan kartu, teks tombol pada latar gelap.

### Brand & Dark
- **Brand Dark** (`#1c1e54`): `--hds-color-util-brand-900`. Indigo gelap untuk bagian gelap, latar belakang footer, dan momen merek yang imersif.
- **Dark Navy** (`#0d253d`): `--hds-color-core-neutral-975`. Netral paling gelap — hampir hitam dengan nuansa biru untuk kedalaman maksimal tanpa kekerasan.

### Accent Colors
- **Ruby** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Merah-merah muda hangat untuk ikon, peringatan, dan elemen aksen.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Merah muda-ungu cerah untuk gradien dan sorotan dekoratif.
- **Magenta Light** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Permukaan bertona untuk kartu dan lencana bertema magenta.

### Interactive
- **Primary Purple** (`#533afd`): Warna tautan utama, status aktif, elemen terpilih.
- **Purple Hover** (`#4434d4`): Ungu lebih gelap untuk status hover pada elemen utama.
- **Purple Deep** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Ungu gelap untuk status hover ikon.
- **Purple Light** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Lavender lembut untuk latar hover yang diredam.
- **Purple Mid** (`#665efd`): `--hds-color-input-selector-text-range`. Warna sorotan pemilih rentang dan input.

### Neutral Scale
- **Heading** (`#061b31`): Heading utama, teks navigasi, label kuat.
- **Label** (`#273951`): `--hds-color-input-text-label`. Label formulir, heading sekunder.
- **Body** (`#64748d`): Teks sekunder, deskripsi, keterangan.
- **Success Green** (`#15be53`): Lencana status, indikator sukses (dengan alpha 0.2–0.4 untuk latar/border).
- **Success Text** (`#108c3d`): Warna teks lencana sukses.
- **Lemon** (`#9b6829`): `--hds-color-core-lemon-500`. Aksen peringatan dan sorotan.

### Surface & Borders
- **Border Default** (`#e5edf5`): Warna border standar untuk kartu, pemisah, dan kontainer.
- **Border Purple** (`#b9b9f9`): Border status aktif/terpilih pada tombol dan input.
- **Border Soft Purple** (`#d6d9fc`): Border bertona ungu halus untuk elemen sekunder.
- **Border Magenta** (`#ffd7ef`): Border bertona merah muda untuk elemen bertema magenta.
- **Border Dashed** (`#362baa`): Border putus-putus untuk drop zone dan elemen placeholder.

### Shadow Colors
- **Shadow Blue** (`rgba(50,50,93,0.25)`): Warna bayangan utama bertona biru — ciri khas Stripe.
- **Shadow Dark Blue** (`rgba(3,3,39,0.25)`): Bayangan biru lebih dalam untuk elemen yang ditinggikan.
- **Shadow Black** (`rgba(0,0,0,0.1)`): Lapisan bayangan sekunder untuk memperkuat kedalaman.
- **Shadow Ambient** (`rgba(23,23,23,0.08)`): Bayangan ambient lembut untuk elevasi halus.
- **Shadow Soft** (`rgba(23,23,23,0.06)`): Bayangan ambient minimal untuk pengangkatan ringan.

## 3. Typography Rules

### Font Family
- **Primary**: `sohne-var`, dengan fallback: `SF Pro Display`
- **Monospace**: `SourceCodePro`, dengan fallback: `SFMono-Regular`
- **OpenType Features**: `"ss01"` diaktifkan secara global pada semua teks sohne-var; `"tnum"` untuk angka tabular pada data keuangan dan keterangan.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Features | Notes |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (rapat) | -1.4px | ss01 | Ukuran maksimal, otoritas bobot bisik |
| Display Large | sohne-var | 48px (3.00rem) | 300 | 1.15 (rapat) | -0.96px | ss01 | Headline hero sekunder |
| Section Heading | sohne-var | 32px (2.00rem) | 300 | 1.10 (rapat) | -0.64px | ss01 | Judul bagian fitur |
| Sub-heading Large | sohne-var | 26px (1.63rem) | 300 | 1.12 (rapat) | -0.26px | ss01 | Heading kartu, sub-bagian |
| Sub-heading | sohne-var | 22px (1.38rem) | 300 | 1.10 (rapat) | -0.22px | ss01 | Kepala bagian yang lebih kecil |
| Body Large | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Deskripsi fitur, teks intro |
| Body | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Teks baca standar |
| Button | sohne-var | 16px (1.00rem) | 400 | 1.00 (rapat) | normal | ss01 | Teks tombol utama |
| Button Small | sohne-var | 14px (0.88rem) | 400 | 1.00 (rapat) | normal | ss01 | Tombol sekunder/kompak |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (rapat) | normal | ss01 | Tautan navigasi |
| Caption | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Label kecil, metadata |
| Caption Small | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Cetakan halus, stempel waktu |
| Caption Tabular | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Data keuangan, angka |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (rapat) | 0.1px | ss01 | Label sangat kecil, penanda sumbu |
| Micro Tabular | sohne-var | 10px (0.63rem) | 300 | 1.15 (rapat) | -0.3px | tnum | Data grafik, angka kecil |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (rapat) | normal | ss01 | Label terkecil |
| Code Body | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (longgar) | normal | -- | Blok kode, sintaks |
| Code Bold | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (longgar) | normal | -- | Kode tebal, kata kunci |
| Code Label | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (longgar) | normal | uppercase | Label teknis |
| Code Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (rapat) | normal | ss01 | Anotasi kode sangat kecil |

### Principles
- **Bobot ringan sebagai ciri khas**: Weight 300 pada ukuran display adalah pilihan tipografi Stripe yang paling khas. Di mana yang lain menggunakan 600–700 untuk menarik perhatian, Stripe menggunakan keringanan sebagai kemewahan — teksnya sangat percaya diri sehingga tidak membutuhkan bobot untuk berwibawa.
- **ss01 di mana-mana**: Stylistic set `"ss01"` tidak bisa ditawar. Ini memodifikasi glyph tertentu (kemungkinan bentuk alternatif `a`, `g`, `l`) untuk menciptakan tampilan yang lebih geometris dan kontemporer di seluruh teks sohne-var.
- **Dua mode OpenType**: `"ss01"` untuk teks display/body, `"tnum"` untuk angka tabular dalam data keuangan. Keduanya tidak pernah tumpang tindih — angka dalam paragraf menggunakan ss01, angka dalam tabel data menggunakan tnum.
- **Tracking progresif**: Letter-spacing semakin rapat secara proporsional seiring ukuran: -1.4px pada 56px, -0.96px pada 48px, -0.64px pada 32px, -0.26px pada 26px, normal pada 16px ke bawah.
- **Kesederhanaan dua bobot**: Utamanya 300 (body dan heading) dan 400 (UI/tombol). Tidak ada tebal (700) pada font utama — SourceCodePro menggunakan 500/700 untuk kontras kode.

## 4. Component Stylings

### Buttons

**Primary Purple**
- Background: `#533afd`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Font: 16px sohne-var weight 400, `"ss01"`
- Hover: background `#4434d4`
- Penggunaan: CTA utama ("Start now", "Contact sales")

**Ghost / Outlined**
- Background: transparent
- Text: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Border: `1px solid #b9b9f9`
- Font: 16px sohne-var weight 400, `"ss01"`
- Hover: background bergeser ke `rgba(83,58,253,0.05)`
- Penggunaan: Aksi sekunder

**Transparent Info**
- Background: transparent
- Text: `#2874ad`
- Padding: 8px 16px
- Radius: 4px
- Border: `1px solid rgba(43,145,223,0.2)`
- Penggunaan: Aksi tersier/tingkat-info

**Neutral Ghost**
- Background: transparent (`rgba(255,255,255,0)`)
- Text: `rgba(16,16,16,0.3)`
- Padding: 8px 16px
- Radius: 4px
- Outline: `1px solid rgb(212,222,233)`
- Penggunaan: Aksi dinonaktifkan atau dilemahkan

### Cards & Containers
- Background: `#ffffff`
- Border: `1px solid #e5edf5` (standar) atau `1px solid #061b31` (aksen gelap)
- Radius: 4px (rapat), 5px (standar), 6px (nyaman), 8px (unggulan)
- Shadow (standar): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Shadow (ambient): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: bayangan menguat, sering menambahkan lapisan bertona biru

### Badges / Tags / Pills
**Neutral Pill**
- Background: `#ffffff`
- Text: `#000000`
- Padding: 0px 6px
- Radius: 4px
- Border: `1px solid #f6f9fc`
- Font: 11px weight 400

**Success Badge**
- Background: `rgba(21,190,83,0.2)`
- Text: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Border: `1px solid rgba(21,190,83,0.4)`
- Font: 10px weight 300

### Inputs & Forms
- Border: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd` atau ring ungu
- Label: `#273951`, 14px sohne-var
- Text: `#061b31`
- Placeholder: `#64748d`

### Navigation
- Nav horizontal bersih di atas putih, sticky dengan backdrop blur
- Logotipe merek rata kiri
- Tautan: sohne-var 14px weight 400, teks `#061b31` dengan `"ss01"`
- Radius: 6px pada kontainer nav
- CTA: tombol ungu rata kanan ("Sign in", "Start now")
- Mobile: toggle hamburger dengan radius 6px

### Decorative Elements
**Dashed Borders**
- `1px dashed #362baa` (ungu) untuk placeholder/drop zone
- `1px dashed #ffd7ef` (magenta) untuk border dekoratif bertema magenta

**Gradient Accents**
- Gradien ruby ke magenta (`#ea2261` ke `#f96bee`) untuk dekorasi hero
- Bagian gelap merek menggunakan latar `#1c1e54` dengan teks putih

## 5. Layout Principles

### Spacing System
- Unit dasar: 8px
- Skala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Catatan: Skala rapat di ujung kecil (setiap 2px dari 4–12), mencerminkan UI Stripe yang presisi untuk data keuangan

### Grid & Container
- Lebar konten maksimal: sekitar 1080px
- Hero: satu kolom terpusat dengan padding lebar, headline ringan
- Bagian fitur: grid 2–3 kolom untuk kartu fitur
- Bagian gelap lebar penuh dengan latar `#1c1e54` untuk imersi merek
- Pratinjau kode/dashboard sebagai kartu terkandung dengan bayangan bertona biru

### Whitespace Philosophy
- **Jarak presisi**: Berbeda dengan kekosongan luas sistem minimalis, Stripe menggunakan whitespace yang terukur dan bertujuan. Setiap celah adalah pilihan tipografi yang disengaja.
- **Data padat, chrome lega**: Tampilan data keuangan (tabel, grafik) dikemas rapat, tetapi chrome UI di sekitarnya berjarak lega. Ini menciptakan rasa kepadatan terkontrol — seperti spreadsheet terorganisir dalam bingkai indah.
- **Ritme bagian**: Bagian putih bergantian dengan bagian merek gelap (`#1c1e54`), menciptakan kadens terang/gelap yang dramatis untuk mencegah monoton tanpa menghadirkan warna sembarangan.

### Border Radius Scale
- Micro (1px): Elemen berbutir halus, pembulatan subtle
- Standard (4px): Tombol, input, lencana, kartu — yang paling sering digunakan
- Comfortable (5px): Kontainer kartu standar
- Relaxed (6px): Navigasi, elemen interaktif lebih besar
- Large (8px): Kartu unggulan, elemen hero
- Compound: `0px 0px 6px 6px` untuk kontainer berujung bawah membulat (panel tab, footer dropdown)

## 6. Depth & Elevation

| Level | Treatment | Penggunaan |
|-------|-----------|------------|
| Flat (Level 0) | Tidak ada bayangan | Latar halaman, teks inline |
| Ambient (Level 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Pengangkatan kartu halus, petunjuk hover |
| Standard (Level 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Kartu standar, panel konten |
| Elevated (Level 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Kartu unggulan, dropdown, popover |
| Deep (Level 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modal, panel mengambang |
| Ring (Accessibility) | `2px solid #533afd` outline | Ring fokus keyboard |

**Filosofi Bayangan**: Sistem bayangan Stripe dibangun di atas prinsip kedalaman kromatik. Di mana sebagian besar sistem desain menggunakan bayangan abu-abu netral atau hitam, warna bayangan utama Stripe (`rgba(50,50,93,0.25)`) adalah abu-abu biru gelap yang menggema palet navy merek. Ini menciptakan bayangan yang tidak hanya menambah kedalaman — tetapi juga menambah atmosfer merek. Pendekatan berlapis memasangkan bayangan bertona biru ini dengan lapisan sekunder hitam murni (`rgba(0,0,0,0.1)`) pada offset berbeda, menciptakan kedalaman seperti paralaks di mana bayangan bermerek berada lebih jauh dari elemen dan bayangan netral berada lebih dekat. Nilai spread negatif (-30px, -18px) memastikan bayangan tidak melebar melampaui tapak horizontal elemen, menjaga elevasi tetap vertikal dan terkendali.

### Decorative Depth
- Bagian merek gelap (`#1c1e54`) menciptakan kedalaman imersif melalui kontras warna latar
- Overlay gradien dengan transisi ruby ke magenta untuk dekorasi hero
- Warna bayangan `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) untuk bayangan tepi atas pada elemen sticky

## 7. Do's and Don'ts

### Do
- Gunakan sohne-var dengan `"ss01"` pada setiap elemen teks — stylistic set ADALAH mereknya
- Gunakan weight 300 untuk semua headline dan teks body — keringanan adalah ciri khasnya
- Terapkan bayangan bertona biru (`rgba(50,50,93,0.25)`) untuk semua elemen yang ditinggikan
- Gunakan `#061b31` (navy gelap) untuk heading bukan `#000000` — kehangatan itu penting
- Pertahankan border-radius antara 4px–8px — pembulatan konservatif adalah kesengajaan
- Gunakan `"tnum"` untuk tampilan angka tabular/keuangan apa pun
- Lapis bayangan: biru bertona jauh + netral dekat untuk paralaks kedalaman
- Gunakan ungu `#533afd` sebagai warna interaktif/CTA utama

### Don't
- Jangan gunakan weight 600–700 untuk headline sohne-var — weight 300 adalah suara merek
- Jangan gunakan border-radius besar (12px+, bentuk pil) pada kartu atau tombol — Stripe bersifat konservatif
- Jangan gunakan bayangan abu-abu netral — selalu beri tona biru (`rgba(50,50,93,...)`)
- Jangan lewatkan `"ss01"` pada teks sohne-var mana pun — glyph alternatif mendefinisikan kepribadiannya
- Jangan gunakan hitam murni (`#000000`) untuk heading — selalu gunakan `#061b31` navy gelap
- Jangan gunakan warna aksen hangat (oranye, kuning) untuk elemen interaktif — ungu adalah yang utama
- Jangan terapkan positive letter-spacing pada ukuran display — Stripe melacak rapat
- Jangan gunakan aksen magenta/ruby untuk tombol atau tautan — keduanya hanya dekoratif/gradien

## 8. Responsive Behavior

### Breakpoints
| Nama | Lebar | Perubahan Utama |
|------|-------|-----------------|
| Mobile | <640px | Satu kolom, ukuran heading dikurangi, kartu ditumpuk |
| Tablet | 640-1024px | Grid 2 kolom, padding sedang |
| Desktop | 1024-1280px | Tata letak penuh, grid fitur 3 kolom |
| Large Desktop | >1280px | Konten terpusat dengan margin lebar |

### Touch Targets
- Tombol menggunakan padding nyaman (8px–16px vertikal)
- Tautan navigasi 14px dengan jarak memadai
- Lencana memiliki padding horizontal 6px minimum untuk target ketuk
- Toggle nav mobile dengan tombol radius 6px

### Collapsing Strategy
- Hero: display 56px -> 32px di mobile, weight 300 dipertahankan
- Navigasi: tautan horizontal + CTA -> toggle hamburger
- Kartu fitur: 3 kolom -> 2 kolom -> satu kolom ditumpuk
- Bagian merek gelap: pertahankan perlakuan lebar penuh, kurangi padding internal
- Tabel data keuangan: scroll horizontal di mobile
- Jarak bagian: 64px+ -> 40px di mobile
- Skala tipografi dipadatkan: ukuran hero 56px -> 48px -> 32px di seluruh breakpoint

### Image Behavior
- Tangkapan layar dashboard/produk mempertahankan bayangan bertona biru di semua ukuran
- Dekorasi gradien hero disederhanakan di mobile
- Blok kode mempertahankan perlakuan `SourceCodePro`, mungkin scroll horizontal
- Gambar kartu mempertahankan border-radius konsisten 4px–6px

## 9. Agent Prompt Guide

### Quick Color Reference
- CTA Utama: Stripe Purple (`#533afd`)
- CTA Hover: Purple Dark (`#4434d4`)
- Background: Pure White (`#ffffff`)
- Teks heading: Deep Navy (`#061b31`)
- Teks body: Slate (`#64748d`)
- Teks label: Dark Slate (`#273951`)
- Border: Soft Blue (`#e5edf5`)
- Tautan: Stripe Purple (`#533afd`)
- Bagian gelap: Brand Dark (`#1c1e54`)
- Sukses: Green (`#15be53`)
- Aksen dekoratif: Ruby (`#ea2261`), Magenta (`#f96bee`)

### Example Component Prompts
- "Buat bagian hero di latar putih. Headline 48px sohne-var weight 300, line-height 1.15, letter-spacing -0.96px, color #061b31, font-feature-settings 'ss01'. Subtitle 18px weight 300, line-height 1.40, color #64748d. Tombol CTA ungu (#533afd, radius 4px, padding 8px 16px, teks putih) dan tombol ghost (transparent, 1px solid #b9b9f9, teks #533afd, radius 4px)."
- "Rancang kartu: latar putih, border 1px solid #e5edf5, radius 6px. Shadow: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Judul 22px sohne-var weight 300, letter-spacing -0.22px, color #061b31, 'ss01'. Body 16px weight 300, #64748d."
- "Buat lencana sukses: latar rgba(21,190,83,0.2), teks #108c3d, radius 4px, padding 1px 6px, 10px sohne-var weight 300, border 1px solid rgba(21,190,83,0.4)."
- "Buat navigasi: header sticky putih dengan backdrop-filter blur(12px). sohne-var 14px weight 400 untuk tautan, teks #061b31, 'ss01'. CTA ungu 'Start now' rata kanan (bg #533afd, teks putih, radius 4px). Kontainer nav radius 6px."
- "Rancang bagian merek gelap: latar #1c1e54, teks putih. Headline 32px sohne-var weight 300, letter-spacing -0.64px, 'ss01'. Body 16px weight 300, rgba(255,255,255,0.7). Kartu di dalamnya menggunakan border rgba(255,255,255,0.1) dengan radius 6px."

### Iteration Guide
1. Selalu aktifkan `font-feature-settings: "ss01"` pada teks sohne-var — ini adalah DNA tipografi merek
2. Weight 300 adalah default; gunakan 400 hanya untuk tombol/tautan/navigasi
3. Formula bayangan: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` di mana Y1/B1 lebih besar (bayangan jauh) dan Y2/B2 lebih kecil (bayangan dekat)
4. Warna heading adalah `#061b31` (navy gelap), body adalah `#64748d` (slate), label adalah `#273951` (dark slate)
5. Border-radius tetap dalam rentang 4px–8px — jangan pernah gunakan bentuk pil atau pembulatan besar
6. Gunakan `"tnum"` untuk angka apa pun dalam tabel, grafik, atau tampilan keuangan
7. Bagian gelap menggunakan `#1c1e54` — bukan hitam, bukan abu-abu, melainkan indigo bermerek dalam
8. SourceCodePro untuk kode pada 12px/500 dengan line-height 2.00 (sangat lega untuk keterbacaan)
