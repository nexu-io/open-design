# Sistem Desain Terinspirasi dari PlayStation

> Category: Media & Konsumen
> Ritel konsol game. Tata letak saluran tiga permukaan, tipe tampilan berkewenangan-tenang, skala hover cyan.

## 1. Tema Visual & Atmosfer

PlayStation.com hadir layaknya divisi pemasaran merek elektronik konsumen premium yang kebetulan menjual hiburan. Halaman ini diorganisasikan sebagai **saluran vertikal permukaan yang berselang-seling**: masthead dan hero hampir-hitam, rangkaian panel editorial putih kertas di tengah, dan footer biru kobalt dalam yang menjangkarkan seluruh pengalaman. Di antara mode permukaan tersebut, situs ini sangat mengandalkan fotografi dan render produk 3D — konsol PS5, seni sampul game, kontroler DualSense — membiarkan perangkat keras yang melakukan kerja emosional sementara tampilan chrome tetap terkendali.

Gerak tipografis khasnya adalah **SST Light (bobot 300) pada ukuran besar**. Keluarga SST kustom Sony digunakan dari 22px hingga 54px dalam bobot 300, memberikan headline tampilan kualitas bisikan yang elegan — terasa lebih dekat dengan iklan jam tangan mewah daripada toko game. "Kewenangan tenang" itu adalah kebalikan persis dari teriakan Manuka milik The Verge atau kepadatan kios koran Wired — PlayStation ingin tipe untuk mundur dan produk yang memimpin. Teks isi dan UI mengandalkan bobot 500–700, tetapi suara *tampilan* secara konsisten tipis dan tenang.

Satu tempat di mana keterbatasan tersebut pecah adalah **interaksi**. Setiap tombol utama memiliki gerakan hover yang sama: isian beralih ke cyan elektrik `#1eaedb`, border putih 2px muncul, cincin luar biru-PlayStation 2px mekar di belakangnya, dan seluruh tombol **menskalakan hingga 1.2×**. Kombinasi warna pop, border, cincin, dan lift-scale adalah gerakan khas unik bagi Sony di antara merek-merek besar — animasi "power-on" miniatur yang diulang situs ini ratusan kali dalam satu halaman.

**Karakteristik Utama:**
- Tata letak saluran tiga permukaan: hero hampir-hitam, konten putih kertas, footer biru kobalt — berselang-seling, tidak pernah bercampur
- SST bobot 300 pada 22–54px untuk tampilan — headline "kewenangan tenang" yang membiarkan fotografi produk memimpin
- PlayStation Blue `#0070cc` sebagai jangkar merek; cyan `#1eaedb` direservasi secara eksklusif untuk status hover/fokus
- Setiap elemen interaktif menskalakan 1.2× saat hover — sebuah "power-on" khas lift unik bagi PlayStation
- Tombol pill pada radius penuh 999px; seni kartu dalam persegi panjang membulat 12–24px
- Commerce-orange `#d53b00` digunakan secara eksklusif untuk CTA PlayStation Store / status beli
- Cakupan breakpoint luas hingga 2120px — situs ini menskalakan hingga konteks penjelajahan TV 4K

## 2. Palet Warna & Perannya

### Primer (Jangkar Merek)
- **PlayStation Blue** (`#0070cc`): Warna jangkar merek. Digunakan pada footer utama, tautan inline, isian tombol utama di permukaan gelap, dan setiap penanda "resmi". Perlakukan ini sebagai tidak berubah — ini adalah warna yang paling diasosiasikan merek dalam ingatan konsumen.
- **Console Black** (`#000000`): Hitam murni untuk masthead, latar belakang hero, dan zona presentasi produk. PlayStation menggunakan hitam untuk membingkai perangkat keras seperti museum menggunakan hitam untuk membingkai patung.

### Sekunder & Aksen
- **PlayStation Cyan** (`#1eaedb`): Warna interaksi. Diterapkan HANYA pada status hover, fokus, dan aktif dari tombol dan tautan. Tidak pernah muncul sebagai latar belakang default atau warna teks saat istirahat. Pasangkan dengan border `#ffffff` 2px dan cincin luar `#0070cc` 2px saat hover untuk perlakuan khas penuh.
- **Link Hover Blue** (`#1883fd`): Varian lebih terang yang digunakan pada hover tautan teks inline. Berbeda dari Cyan — ini adalah warna tautan, Cyan adalah warna tombol.
- **Dark Link Blue** (`#0068bd`): Warna tautan saat istirahat di permukaan terang — sepupu sedikit lebih jenuh dari biru merek.

### Permukaan & Latar Belakang
- **Paper White** (`#ffffff`): Kanvas konten utama untuk panel editorial di antara masthead dan footer.
- **Ice Mist** (`#f5f7fa`): Titik akhir atmosferik dari gradien bagian terang. Digunakan secara halus di belakang panel tertentu untuk mengangkatnya dari putih murni.
- **Divider Tint** (`#f3f3f3`): Warna garis pemisah horizontal yang tenang di antara baris konten.
- **Masthead Black** (`#000000`): Nav atas dan kanvas hero — dipesan untuk zona yang mengutamakan produk.
- **Shadow Black** (`#121314`): Jangkar awal dari gradien bagian gelap ketika panel membutuhkan kedalaman atmosferik.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Latar belakang tembus cahaya yang digunakan di belakang bilah filter lengket — satu-satunya momen "glassmorfisme" di situs ini.

### Netral & Teks
- **Display Ink** (`#000000`): Headline tampilan utama di permukaan putih.
- **Deep Charcoal** (`#1f1f1f`): Headline isi dan warna tautan saat istirahat — sedikit lebih lembut dari hitam murni untuk mengurangi cincin visual pada blok besar.
- **Body Gray** (`#6b6b6b`): Teks isi sekunder dan metadata.
- **Mute Gray** (`#cccccc`): Label tersier, status dinonaktifkan.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Teks placeholder formulir — 60% hitam, bukan nilai abu-abu terpisah.
- **Inverse White** (`#ffffff`): Teks utama di permukaan gelap dan biru.
- **Dark-Link Blue** (`#53b1ff`): Warna tautan saat istirahat di permukaan gelap/hitam — varian airborne lebih terang dari PlayStation Blue untuk keterbacaan di atas hitam.

### Semantik & Niaga
- **Commerce Orange** (`#d53b00`): Dipesan untuk CTA status beli PlayStation Store, callout harga, dan lencana "sedang diskon". Satu-satunya warna hangat di situs ini — gunakan dengan hemat dan tidak pernah di luar konteks niaga.
- **Commerce Orange Active** (`#aa2f00`): Status ditekan/aktif dari tombol niaga.
- **Warning Red** (`#c81b3a`): Kesalahan formulir dan peringatan tindakan destruktif.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Scrim dramatis yang digunakan di belakang teks hero pada fotografi produk.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Cincin elevasi bobot rendah pada kartu.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Elevasi kartu bulu — hampir tidak terlihat tetapi memisahkan panel putih dari latar belakang putih.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): Bayangan paling ringan dalam sistem.

### Sistem Gradien
PlayStation menggunakan **dua gradien bagian** dan tidak ada yang lain:
- **Gradien Bagian Terang**: dari `#ffffff` → `#f5f7fa` — sapuan hampir-tak-terlihat yang secara diam-diam mengangkat panel dari kanvas.
- **Gradien Bagian Gelap**: dari `#121314` → `#000000` — sapuan vertikal pendek yang memberikan panel hero vignette halus tanpa memperkenalkan pergeseran rona.

Kedua gradien digunakan **hanya sebagai latar belakang bagian**, tidak pernah di dalam komponen. Tidak ada tombol gradien, tidak ada teks gradien, tidak ada halo bercahaya. Mereknya biru — bukan biru-ke-ungu, bukan biru-ke-cyan.

## 3. Aturan Tipografi

### Keluarga Font
- **SST** / **Playstation SST** (Sony, proprietary) — fallback: `Arial`, `Helvetica`. Huruf global kustom Sony, dirancang oleh Toshi Omagari dan Akira Kobayashi. Mencakup bobot 300 / 500 / 600 / 700 di seluruh halaman utama. Bobot **300 pada 22–54px** adalah tanda tangan tipografis PlayStation.
- **SST (condensed / alternate)** — fallback: `helvetica`, `arial`. Varian terkompresi yang digunakan di beberapa modul UI di mana lebar menjadi penting.
- **Arial** — fallback utilitas untuk varian tombol langka yang dirender dalam sans sistem.

### Hierarki

| Peran | Font | Ukuran | Bobot | Tinggi Baris | Spasi Huruf | Catatan |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Momen SST terbesar di halaman — headline mewah berbobot tenang |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Headline hero sekunder |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Headline panel fitur |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Judul bagian |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Judul modul — masih dalam bobot ringan 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Sub-judul promosi |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Judul UI ketat |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Label tombol utama |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTA penekanan lebih tinggi (beli, berlangganan) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Label tombol sekunder |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Isi bacaan standar |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Teks tautan inline |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | CTA mini dalam kartu |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Keterangan, label tag |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Metadata standar |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Keterangan berpenekanan |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Keterangan semi-tebal |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Tombol UI dengan leading ketat |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Label tab/pill |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Keterangan UI terkecil |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Mikrokopi footer, teks hukum |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Teks mikro berpenekanan |

### Prinsip
- **Bobot 300 pada ukuran besar adalah suara.** PlayStation adalah satu-satunya merek konsol besar yang menggunakan tampilan bobot ringan untuk headline heronya. Tahan dorongan untuk "meningkatkan" tipe tampilan ke 500 atau 700 — ketenangannya adalah kepribadiannya.
- **Loncatan bobot di lapisan UI.** Di bawah 18px sistem beralih ke 500–700 untuk keterbacaan. Gradien bobot dari 300 (tampilan) → 400 (isi) → 500 (keterangan) → 700 (tombol) adalah hierarkinya.
- **Spasi huruf hampir tidak ada.** Sebagian besar nilai adalah 0.1–0.45px, baik positif maupun sedikit negatif. `-0.1px` pada hero 54px memperketat tipe tampilan cukup untuk terbaca sebagai "dirancang" tanpa menjadi pernyataan tipografis.
- **Dua casing SST.** "SST" dan "Playstation SST" secara fungsional adalah keluarga yang sama dengan set metrik yang sedikit berbeda (Playstation SST lebih ketat pada ukuran kecil). Perlakukan keduanya sebagai dapat dipertukarkan untuk tujuan di luar lisensi internal Sony.
- **Tidak ada huruf kapital semua.** Tidak seperti The Verge atau Wired, PlayStation jarang menggunakan label HURUF KAPITAL. Kicker dan tag tetap dalam kapitalisasi judul atau kalimat — gerakan "kewenangan tenang" lainnya.
- **Tidak ada serif di mana pun.** Seluruh sistem adalah sans. Tidak ada penyeimbang suara cetak.

## 4. Gaya Komponen

### Tombol

**Utama — Pill PlayStation Blue**
- Latar belakang: `#0070cc` (PlayStation Blue)
- Teks: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Border: tidak ada saat istirahat
- Border radius: `999px` — pill penuh
- Padding: ~`12px 24px` (bervariasi berdasarkan kelas ukuran)
- Outline: `rgb(255, 255, 255) none 0px` saat istirahat
- **Hover (gerakan khas)**:
  - Latar belakang berubah ke `#1eaedb` (PlayStation Cyan)
  - Teks tetap `#ffffff`
  - Border `#ffffff` 2px muncul
  - Bayangan cincin luar `#0070cc` 2px mekar (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — tombol sebenarnya tumbuh 20%
- Aktif: `opacity: 0.6` — redupan cepat untuk menandai tekan
- Fokus: Sama seperti hover, tetapi cincin berubah menjadi bayangan fokus `rgb(0, 114, 206) 0px 0px 0px 2px`
- Transisi: ~180ms ease pada latar belakang, transform, dan bayangan

**Sekunder — White Outline di Atas Gelap**
- Latar belakang: `#ffffff`
- Teks: `#0172ce` (varian PlayStation Blue)
- Border: `2px outset #000000` — border `outset` yang asli, sangat jarang dalam CSS modern
- Radius: bervariasi (sering `999px` atau `36px`)
- Padding: `16px 20px`
- Hover: perlakuan isian cyan khas yang sama + scale(1.2) + cincin
- Fokus: perlakuan cincin yang sama

**Commerce Orange**
- Latar belakang: `#d53b00` (Commerce Orange)
- Teks: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Border radius: `999px` — pill
- Hanya digunakan pada CTA PS Store / Beli / Subscribe Plus
- Aktif: latar belakang menggelap ke `#aa2f00`
- Hover: mengikuti aturan pembalikan cyan seperti semua tombol lainnya (BUKAN hover spesifik oranye)

**Transparent Ghost**
- Latar belakang: transparan
- Teks: `#1f1f1f` (Deep Charcoal)
- Border: `1px solid #dedede`
- Padding: `0 10px` (ketat, dioptimalkan untuk nav)
- Hover: isian cyan, teks putih, border putih 2px, scale(1.2)
- Aktif: teks bergeser ke `#0072ce`, opacity 0.6

**Icon Circle**
- Latar belakang: `rgba(0, 0, 0, 0.2)` di atas fotografi; `#ffffff` di permukaan terang
- Border radius: `100%` — lingkaran sempurna
- Digunakan untuk panah prev/next carousel dan tombol berbagi
- Hover: mencerahkan ke `var(--color-role-backgrounds-primary-link-hover)` (sekitar `#e5e5e5` di terang)

**Mini CTA (Dalam Kartu)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Radius: `999px`
- Digunakan di dalam kartu game untuk mini CTA "Beli Sekarang" / "Tambah ke Keranjang"

### Kartu & Kontainer

**Hero Card (Fitur Game)**
- Latar belakang: fotografi/render — biasanya berlabuh hitam
- Border radius: `24px` atau `19px` untuk kartu fitur
- Padding: 32–48px interior
- Bayangan: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — drop-shadow dramatis yang hanya digunakan ketika kartu bertumpang tindih dengan fotografi hero
- Hover: transformasi skala halus, outline cyan muncul pada CTA utama

**Game Cover Tile**
- Latar belakang: seni sampul game, tidak dipadding
- Border radius: `12px` atau `13px` (gambar) / `19px` (bingkai kartu)
- Bayangan: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — elevasi bulu-ringan
- Hover: CTA utama kartu menyala cyan, kartu itu sendiri dapat menskalakan 1.02×
- Transisi: 200ms ease pada transform

**Panel Konten (Putih)**
- Latar belakang: `#ffffff` atau gradien bagian terang `#ffffff → #f5f7fa`
- Border: biasanya tidak ada; dipisahkan dari tetangga dengan spasi dan bayangan halus
- Radius: `12px`–`24px` tergantung hierarki panel
- Bayangan: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — paling ringan dalam sistem

**Kartu Gelap di Atas Gelap**
- Latar belakang: `rgba(0, 0, 0, 0.2)` di atas fotografi
- Border radius: `6px` (kompak) atau `24px` (fitur)
- Digunakan untuk inlay "kit pers" atau "blok statistik" di atas video hero

### Input & Formulir
- **Default**: latar belakang `#ffffff`, border `1px solid #cccccc`, border radius `3px` (lebih ketat dari sisa sistem — input adalah satu tempat di mana PlayStation benar-benar kompak), teks SST 16px dalam `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Fokus**: cincin fokus `#0070cc` 2px melalui `box-shadow: 0 0 0 2px #0070cc`. Tidak ada perubahan warna border — cincin yang melakukan pekerjaan.
- **Kesalahan**: border dan teks bergeser ke `#c81b3a` (Warning Red), teks kesalahan inline di bawah dalam merah yang sama.
- **Transisi**: ~180ms ease pada border dan bayangan.

### Navigasi

- **Nav atas**: strip `#000000` full-bleed dengan logo PlayStation (putih) rata kiri, tautan kategori di tengah dalam SST 14–16px / 500, dan CTA "Masuk" kecil rata kanan.
- **Hover pada tautan nav**: warna beralih dari `#ffffff` ke `#1883fd` (Link Hover Blue), tanpa garis bawah.
- **Bagian aktif**: ditandai dengan garis bawah halus 2px dalam `#0070cc`.
- **Mobile**: nav menciut ke laci hamburger. Di dalam laci, tautan ditumpuk secara vertikal dengan jarak 16px dan padding horizontal 20px.
- **Perilaku lengket**: nav tetap terpin di atas saat scroll; ketika memasuki zona permukaan terang **tidak berbalik** — tetap berlatar hitam sepanjang waktu.

### Perlakuan Gambar

- **Rasio aspek**: 16:9 video/fotografi hero, 1:1 render konsol, 3:4 seni sampul game, 4:3 citra gaya hidup.
- **Sudut**: dibulatkan ke `12px`, `13px`, atau `24px` tergantung konteks kartu. Sampul game mendapat `6–12px`, gambar hero mendapat `24px`.
- **Full-bleed**: hanya di masthead hero dan spanduk promosi footer. Semua yang lain berada di dalam kolom konten yang dipadding.
- **Bayangan**: drop dramatis `rgba(0, 0, 0, 0.8) 0 5px 9px 0` pada hero, bulu `rgba(0, 0, 0, 0.06) 0 5px 9px 0` pada ubin grid.
- **Hover**: gambar tetap statis, bingkai kartu dan CTA utama merespons.
- **Lazy loading**: `loading="lazy"` pada semua yang ada di bawah fold, `eager` pada masthead hero.

### Game Store Pill (Khas)
- Latar belakang: `#ffffff`
- Teks: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — pill penuh
- Tag pill netral yang duduk di samping sampul game untuk melabeli platform ("PS5", "PS4", "PSVR2"). Kontras putih-di-atas-gelap.

## 5. Prinsip Tata Letak

### Sistem Spasi
- **Unit dasar**: 8px.
- **Skala**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Padding bagian**: 48–96px vertikal di antara panel utama. Transisi hero-ke-konten menggunakan ujung yang lebih besar.
- **Padding kartu**: 20–32px interior. Kartu hero fitur dapat diperluas hingga 48px.
- **Spasi inline**: 8–12px antara headline dan deck, 12–16px antara deck dan CTA.
- **Skala mikro**: Nilai 1/2/3/4.5/5/9/10/12 digunakan untuk padding pill, spasi keterangan, dan offset border — bukan untuk ritme editorial.

### Grid & Kontainer
- **Lebar maksimum**: ~1920px (breakpoint yang terdeteksi dembrandt hingga 2120px). Batas kontainer biasanya sekitar `1280–1920px` tergantung panel.
- **Pola kolom**: grid responsif 12-kolom yang menjadi baris ubin game 3/4/6-kolom tergantung hierarki. Zona hero sering mencakup 12 kolom; ubin unggulan berada dalam konfigurasi 6+3+3 atau 4+4+4.
- **Padding luar**: 16px mobile → 48px tablet → 64–96px desktop.
- **Gutter**: 16–24px antara kolom, lebih ketat (8–12px) di dalam kluster ubin.

### Filosofi Ruang Putih
PlayStation memperlakukan ruang putih seperti merek mewah memperlakukan pencahayaan toko — sebagai sinyal premium. Ada ruang napas vertikal yang jauh lebih terlihat di antara modul daripada di situs ritel besar lainnya, dan panel editorial putih sering hanya memegang satu headline + satu gambar + satu CTA pada padding skala hero. Efeknya adalah "kecepatan galeri" di mana setiap produk mendapatkan ruangnya sendiri daripada bersaing dalam grid thumbnail.

### Skala Border Radius
- **2px** — tombol spanduk cookie dan UI admin kecil
- **3px** — input formulir, panel tab (lebih ketat dari segalanya — isyarat "UI fungsional" yang disengaja)
- **6px** — tombol kompak dan gambar inline
- **12px** — gambar sampul game standar dan gambar konten
- **13px** — pembungkus figure tertentu (offset 1px dari 12px untuk nesting)
- **19px** — kartu fitur
- **20px** — rentang tag inline
- **24px** — kartu hero, bingkai fitur utama
- **36px** — nav full-pill dan varian tombol sekunder
- **48px** — tombol fitur besar
- **999px / 100%** — tombol utama full pill dan tombol ikon melingkar

Sebelas nilai radius diskrit — salah satu sistem radius terkaya dari situs mana pun dalam katalog ini. Rentang ini ada karena PlayStation dengan sengaja menggunakan radius berbeda untuk *hierarki* yang berbeda: 3px untuk utilitas, 12px untuk media, 24px untuk fitur, 999px untuk CTA.

## 6. Kedalaman & Elevasi

| Level | Perlakuan | Penggunaan |
|---|---|---|
| 0 | Tidak ada bayangan | Konten default di `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Pengangkat panel editorial bulu-ringan |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Elevasi ubin grid standar |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Kartu berpenekanan (hover atau aktif) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Bayangan overlay hero — drop dramatis yang digunakan di atas fotografi |
| 5 | `0 0 0 2px #0070cc` (cincin fokus) | Status fokus tombol utama |
| 6 | `0 0 0 2px #000000` (cincin hover) | Cincin hover tombol sekunder |
| 7 | Gradien bagian `#121314 → #000000` | Kedalaman atmosferik pada panel hero gelap |

Filosofi kedalaman PlayStation adalah **berlapis tetapi terkendali**. Skala bayangan berjalan dari 0.06 hingga 0.16 untuk status normal, kemudian melompat ke 0.8 untuk drop hero — tidak ada rentang tengah 0.2, 0.3, 0.4. Efeknya adalah sebagian besar halaman duduk hampir rata, tetapi ketika kartu hero perlu melayang di atas fotografi, ia benar-benar *melayang*. Elevasi baik dibisikkan atau diteriakkan, tidak pernah diucapkan pelan.

### Kedalaman Dekoratif
- **Gradien bagian** (gelap dan terang, keduanya dijelaskan di atas) — hanya digunakan sebagai latar belakang bagian
- **Cincin fokus/hover** pada 2px, selalu biru atau cyan tergantung status
- **Tidak ada glow, blur, atau efek atmosferik** selain dua gradien bagian
- **Tidak ada tombol atau teks gradien** — sistem visual adalah blok warna solid di mana-mana kecuali transisi bagian

## 7. Yang Boleh dan Tidak Boleh

### Yang Boleh
- **Boleh** menggunakan PlayStation Blue (`#0070cc`) sebagai isian CTA utama dan jangkar footer. Ini adalah warna jangkar merek.
- **Boleh** menggunakan SST bobot 300 untuk setiap headline tampilan 22px ke atas. Headline berbobot tenang adalah suaranya.
- **Boleh** menerapkan tanda tangan hover penuh ke setiap tombol utama: isian cyan + border putih 2px + cincin luar biru 2px + `scale(1.2)`.
- **Boleh** menggunakan radius full-pill (`999px`) pada tombol utama dan niaga.
- **Boleh** mereservasi PlayStation Cyan (`#1eaedb`) secara eksklusif untuk status hover, fokus, dan aktif — tidak pernah sebagai latar belakang istirahat.
- **Boleh** menggunakan Commerce Orange (`#d53b00`) hanya pada CTA PlayStation Store / pembelian dan callout harga.
- **Boleh** bergantian panel hero gelap dengan panel konten putih dan berlabuh dengan footer biru dalam — tata letak saluran tiga permukaan adalah ritme halaman.
- **Boleh** menggunakan bayangan drop hero `rgba(0, 0, 0, 0.8)` dramatis ketika kartu bertumpang tindih dengan fotografi produk.
- **Boleh** menjaga nav atas tetap hitam di setiap posisi scroll — tidak berbalik ke putih di atas panel terang.

### Yang Tidak Boleh
- **Jangan** menebalkan headline tampilan. Bobot 300 pada 22–54px adalah suara PlayStation. Tipe tampilan bobot 700 terbaca sebagai "pengecer game biasa".
- **Jangan** menggunakan label atau kicker SEMUA-HURUF-KAPITAL. PlayStation jarang menggunakan huruf kapital — ini adalah merek berkewenangan-tenang, bukan merek hazard-tape.
- **Jangan** menggunakan tombol, teks, atau latar belakang gradien di luar dua gradien bagian yang dinyatakan.
- **Jangan** memperkenalkan warna hangat di luar Commerce Orange. Tidak ada CTA merah, tidak ada sorotan kuning, tidak ada pil sukses hijau.
- **Jangan** menggunakan sudut persegi pada tombol atau media. Sistem memiliki sebelas radius — pilih salah satu, tetapi tidak pernah `0`.
- **Jangan** melewatkan gerakan hover `scale(1.2)` pada tombol utama. Lift-scale adalah tanda tangan interaksi merek.
- **Jangan** menggunakan tipe serif. Sistem adalah 100% SST sans.
- **Jangan** membiarkan cyan `#1eaedb` muncul sebagai warna teks atau latar belakang saat istirahat. Ia hanya ada dalam gerakan.
- **Jangan** merancang panel yang bersaing untuk mendapatkan perhatian. Ritme ruang putih PlayStation memberikan setiap modul "ruang galeri" miliknya sendiri.

## 8. Perilaku Responsif

### Breakpoint

| Nama | Lebar | Perubahan Kunci |
|---|---|---|
| Small Mobile | <400px | Kolom tunggal, nav menciut ke hamburger, hero SST menskalakan hingga ~28px |
| Mobile | 400–599px | Kolom tunggal, ubin ditumpuk full-width, padding terbuka hingga 16px |
| Large Mobile | 600–767px | Masih kolom tunggal tetapi opsi ubin 2-kolom pada modul tertentu |
| Tablet Portrait | 768–1023px | Grid game 2-kolom, nav masih dikondensasi |
| Tablet Landscape | 1024–1279px | Grid 3–4 kolom, nav penuh dipulihkan |
| Desktop | 1280–1599px | Grid editorial penuh, skala tampilan hero maksimum (44–54px) |
| Large Desktop | 1600–1919px | Kontainer dibatasi pada 1600px, margin melebar |
| 4K / Big-Screen | ≥1920px | Kontainer melebar hingga maksimum 1920px, konten hero menskalakan naik untuk menyesuaikan jarak pandang TV |
| Ultra-Wide | ≥2120px | Breakpoint ekstrem — halaman tetap berlabuh, margin luar menyerap lebar ekstra |

Sapuan dembrandt mendeteksi 30 breakpoint antara 320px dan 2120px — rentang responsif yang sangat lebar. PlayStation menyetel secara khusus untuk **konteks layar besar** (1920–2120px) karena pemilik PS5 sering menjelajahi situs di TV melalui browser konsol atau melalui cast-to-TV dari ponsel. Sebagian besar situs ritel berhenti menyetel pada 1440px; PlayStation terus menyetel hingga 4K.

### Target Sentuh
- Tombol pill utama berketinggian ~48–56px (teks SST 18px + ~12–16px padding vertikal) — nyaman WCAG AAA.
- Tautan nav lebih kecil (~32–40px tinggi) di desktop; di mobile mereka dipadding hingga 48px+ di dalam laci.
- Tombol lingkaran ikon adalah 40–48px — ramah sentuh.

### Strategi Lipatan
- **Nav**: nav penuh → dikondensasi → laci hamburger seiring viewport menyempit. Logo tetap terpin kiri; CTA tetap terpin kanan.
- **Grid**: 6-kolom → 4-kolom → 3-kolom → 2-kolom → 1-kolom. Kartu ubin game mengalir ulang tanpa memotong seni sampul.
- **Spasi**: padding bagian mengencang dari 96px → 64px → 48px → 32px → 24px seiring viewport menyempit.
- **Tipe**: hero SST menskalakan dari 54px → 44px → 35px → 28px → 22px. Bobot ringan 300 dipertahankan di setiap ukuran.
- **Fotografi hero**: pertukaran art-direction — desktop menggunakan crop 16:9 lebar, mobile menggunakan crop 4:3 atau 1:1 dengan produk di tengah.

### Perilaku Gambar
- Raster responsif (`srcset` + `<picture>` dengan art-direction), rasio aspek dipertahankan per breakpoint.
- Siap 4K: situs menyajikan gambar kepadatan tinggi pada 1920px+ untuk menghindari upscaling saat menjelajah dari TV.
- `loading="lazy"` pada semua yang ada di bawah fold; hero adalah `eager` dengan petunjuk preload.

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- **CTA Utama**: "PlayStation Blue (`#0070cc`)"
- **Aksen Hover / Fokus**: "PlayStation Cyan (`#1eaedb`)"
- **Latar Belakang (Permukaan Putih)**: "Paper White (`#ffffff`)"
- **Latar Belakang (Permukaan Gelap)**: "Console Black (`#000000`)"
- **Teks Heading di Putih**: "Display Ink (`#000000`)"
- **Teks Isi di Putih**: "Deep Charcoal (`#1f1f1f`)"
- **Teks Isi di Hitam**: "Inverse White (`#ffffff`)"
- **Aksen Niaga / Beli**: "Commerce Orange (`#d53b00`)"
- **Jangkar Footer**: "PlayStation Blue (`#0070cc`)"

### Contoh Prompt Komponen
1. *"Buat tombol CTA utama dengan isian PlayStation Blue `#0070cc`, teks putih dalam SST 18px / 500 / 0.4px tracking, border radius 999px, padding 12px × 24px. Saat hover, latar belakang beralih ke PlayStation Cyan `#1eaedb`, border `#ffffff` 2px muncul, cincin luar `#0070cc` 2px mekar melalui box-shadow, dan seluruh tombol menskalakan 1.2× — semua dalam transisi ease 180ms."*
2. *"Rancang panel hero di atas kanvas Console Black `#000000` dengan headline SST bobot 300 54px dalam `#ffffff` dengan letter-spacing -0.1px dan line-height 1.25. Tempatkan satu CTA utama di bawah dengan perlakuan hover PlayStation standar. Tidak ada label HURUF KAPITAL di mana pun."*
3. *"Buat ubin sampul game: gambar rasio aspek 3:4 dengan border radius 12px, drop shadow bulu-ringan `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, judul SST 700 14px di bawah, tag platform SST 500 12px, dan mini CTA utama 14px / 700 / 0.324px tracking dalam PlayStation Blue."*
4. *"Buat tombol pill niaga untuk pembelian PlayStation Store: isian Commerce Orange `#d53b00`, teks `#ffffff` dalam SST 18px / 700 / 0.45px tracking, radius 999px, padding 12px × 28px. Status aktif menggelap ke `#aa2f00`. Hover mengikuti pembalikan cyan standar dengan skala 1.2×."*
5. *"Rancang panel konten putih di antara bagian hero gelap: latar belakang `#ffffff` dengan gradien bagian terang halus `#ffffff → #f5f7fa`, border radius 24px, padding interior 48px, elevasi bulu-ringan `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, headline SST 300 35px, paragraf isi 18px, dan satu CTA utama."*

### Panduan Iterasi
Saat menyempurnakan layar yang ada yang dibuat dengan sistem desain ini:
1. **Audit bobot tampilan.** Setiap headline 22px ke atas harus berbobot SST 300. Jika Anda melihat bobot 500 atau 700 pada skala hero, Anda telah kehilangan suara PlayStation.
2. **Audit perlakuan hover.** Setiap tombol utama harus menskalakan 1.2× saat hover dengan kombinasi isian-cyan + border-putih + cincin-biru. Lewatkan salah satu dari keempat itu dan tanda tangan interaksi rusak.
3. **Audit sudut.** Setiap kontainer dan tombol harus mendarat pada 2, 3, 6, 12, 13, 19, 20, 24, 36, 48, atau 999px / 100%. Sudut persegi merusak suara.
4. **Audit persebaran warna.** Hanya PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`), dan abu-abu/hitam/putih yang dinyatakan yang harus muncul dalam chrome. Jika Anda melihat rona lain, koreksi.
5. **Audit pergantian permukaan.** Halaman harus bergantian hero gelap → konten putih → hero gelap → konten putih → footer biru. Jika dua panel permukaan yang sama berdekatan, sisipkan transisi.
6. **Audit casing.** Hanya huruf kalimat dan huruf judul. Tidak ada label, tombol, atau kicker HURUF KAPITAL. Jika Anda melihat huruf kapital, ubah.
7. **Audit bobot bayangan.** Opasitas bayangan harus mendarat pada 0.06 / 0.08 / 0.16 / 0.8 — tidak ada di antaranya. Jika Anda melihat drop shadow 0.1, 0.2, 0.3, 0.5, koreksi ke tingkat yang dinyatakan terdekat.
8. **Audit ruang putih.** Jika dua modul terasa "kompetitif" (bersaing untuk mendapatkan perhatian), tambahkan ruang napas vertikal 48–96px. Ritme kecepatan galeri PlayStation tidak dapat dinegosiasikan.
