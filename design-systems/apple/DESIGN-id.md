# Sistem Desain Terinspirasi oleh Apple

> Category: Media & Consumer
> Elektronik konsumen. Ruang putih premium, SF Pro, citra sinematik.

## 1. Tema Visual & Atmosfer

Bahasa web Apple adalah sistem editorial presisi yang berganti-ganti antara ketenangan ala galeri dan blok informasi berkepadatan ritel. Nada visualnya tetap terkendali: kanvas netral yang luas, elemen krom yang tenang, dan citra produk yang diberi hampir seluruh bobot ekspresif. Antarmuka dirancang untuk menghilang sehingga perangkat keras, material, dan opsi finishing menjadi latar depan naratif.

Di sepanjang lima halaman yang dianalisis, ritmenya konsisten tetapi tidak monolitik. Permukaan pemasaran (halaman utama dan Environment) menggunakan pembabakan hitam-dan-cahaya sinematik, sementara permukaan komersial (alur Store dan Shop) memperkenalkan spasi yang lebih rapat, lebih banyak kontrol utilitas, dan tumpukan kartu yang lebih padat tanpa merusak tata bahasa merek inti. Hasilnya adalah satu sistem dengan dua gigi: mode showcase dan mode transaksi.

Tipografi adalah penstabilnya. SF Pro Display mengusung hierarki hero dan merchandising dengan tinggi baris yang ringkas dan tracking yang terkendali, sementara SF Pro Text menangani metadata produk, navigasi, filter, dan UI seleksi yang padat. Tipografinya tetap rendah hati, tetapi rentang skalanya cukup luas untuk mendukung baik pesan hero billboard maupun label utilitas mikro.

**Karakteristik Utama:**
- Ritme bagian biner: adegan hitam pekat (`#000000`) berganti-ganti dengan bidang netral pucat (`#f5f5f7`)
- Keluarga aksen biru tunggal untuk semantik aksi dan tautan (`#0071e3`, `#0066cc`, `#2997ff`)
- Dua mode operasi dalam satu sistem: modul showcase sinematik dan konfigurator komersial yang padat
- Ketergantungan besar pada citra dan finishing material; krom UI tetap tipis secara visual
- Metrik headline yang rapat (SF Pro Display, semibold) dipadukan dengan tipografi body/tautan yang ringkas (SF Pro Text)
- Geometri pil dan kapsul sebagai bahasa aksi khas (`18px` hingga `980px` serta kontrol melingkar)
- Kedalaman digunakan secara hemat; kontras dan pemisahan permukaan melakukan sebagian besar pekerjaan layering
- Ritme blok-warna multi-halaman: bab hero hitam -> bidang merchandising netral pucat -> permukaan ritel putih utilitas -> permukaan mikro gelap untuk kontrol

## 2. Palet Warna & Peran

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primer
- **Hitam Absolut** (`#000000`): Kanvas hero imersif, bab produk berdrama tinggi, jangkar UI gelap.
- **Abu-abu Apple Pucat** (`#f5f5f7`): Permukaan terang utama untuk band fitur, blok perbandingan, dan transisi editorial.
- **Tinta Nyaris-Hitam** (`#1d1d1f`): Teks primer dan warna kontrol isian gelap pada kanvas terang.

### Sekunder & Aksen
- **Biru Aksi Apple** (`#0071e3`): Isian aksi primer dan aksen merek penanda fokus.
- **Biru Tautan Body** (`#0066cc`): Warna tautan inline yang dioptimalkan untuk keterbacaan teks panjang.
- **Biru Tautan Berluminansi Tinggi** (`#2997ff`): Perlakuan tautan cerah pada adegan yang lebih gelap di mana diperlukan kontras yang lebih kuat.

### Permukaan & Latar Belakang
- **Kanvas Putih Murni** (`#ffffff`): Latar belakang ritel/daftar produk dan bagian transaksional yang padat.
- **Permukaan Grafit A** (`#272729`): Lapisan konteks kartu gelap dan kontrol media.
- **Permukaan Grafit B** (`#262629`): Lapisan utilitas gelap yang sedikit lebih dalam untuk pengelompokan kontrol.
- **Permukaan Grafit C** (`#28282b`): Permukaan pendukung gelap yang terangkat.
- **Permukaan Grafit D** (`#2a2a2c`): Tingkat terangkat tergelap yang digunakan untuk pemisahan dalam adegan gelap yang lebih kaya.

### Netral & Teks
- **Abu-abu Netral Sekunder** (`#6e6e73`): Salinan sekunder body, deskripsi pembantu, metadata tersier.
- **Abu-abu Border Lembut** (`#d2d2d7`): Pembatas, garis luar halus, dan kontainmen utilitas yang redup.
- **Abu-abu Border Menengah** (`#86868b`): Garis luar bidang yang lebih kuat dalam konteks konfigurasi produk dan filter.
- **Abu-abu Gelap Utilitas** (`#424245`): Persimpangan teks/permukaan gelap-netral dalam konteks store.

### Semantik & Aksen
- **Sinyal Seleksi/Fokus** (`#0071e3`): Sinyal fokus dan keadaan terpilih bersama di seluruh konteks pemasaran dan komersial.
- **Error/Peringatan/Sukses**: Tidak ada palet semantik berbeda yang konsisten terlihat dalam kumpulan permukaan yang diekstrak.

### Sistem Gradien
- Halaman yang diekstrak sangat didominasi oleh permukaan solid. Kekayaan visual berasal dari fotografi dan rendering finishing alih-alih gradien UI yang persisten.

## 3. Aturan Tipografi

### Keluarga Font
- **Keluarga Display:** `SF Pro Display`, fallback `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Keluarga Text:** `SF Pro Text`, fallback `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Pembagian Penggunaan:** Keluarga Display menangani headline hero/produk dan heading merchandising; keluarga Text menangani navigasi, kontrol, label, dan salinan komersial yang padat.

### Hierarki
| Peran | Ukuran | Bobot | Tinggi Baris | Spasi Huruf | Catatan |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Skala hero Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Momen hero halaman utama |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Heading bab utama |
| Product Heading | 40px | 600 | 1.10 | normal | Judul bagian produk dan kampanye |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Callout perangkat dan merchandising |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px hingga 0.352px | Sub-hero tingkat modul |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Penamaan tingkat tile dan salinan kunci |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Header konfigurator dan konten yang dikelompokkan |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Tautan promosi yang lebih besar |
| Subhead | 19px | 600 | 1.21 | 0.228px | Intro bagian yang ringkas |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Body standar dan deskripsi ritel |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Label yang ditekankan dan nilai kunci |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Tombol, label pembantu, teks nav ringkas |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Cetakan halus, label mikro |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Metadata padat dan teks pendukung legal |

### Prinsip
- **Kontinuitas lintas jenis halaman:** DNA tipografi yang sama membentang dari peluncuran sinematik hingga alur pembelian produk, mencegah perpecahan merek antara pemasaran dan komersial.
- **Kompresi pada skala:** Tingkatan Display menggunakan leading yang rapat dan tracking yang terkendali agar terasa terkalibrasi dan mengutamakan produk.
- **Kepadatan yang terbaca pada kedalaman ritel:** SF Pro Text menyeimbangkan keringkasan dengan ritme vertikal yang cukup untuk daftar produk panjang dan matriks opsi.
- **Tangga bobot yang terukur:** 600 adalah bobot penekanan dominan; 700 muncul secara selektif; 300 digunakan secara hemat untuk kontras pada baris yang lebih besar.

### Catatan tentang Substitusi Font
- Substitusi tersedia bebas yang paling mendekati: `Inter` untuk implementasi padat-teks dan metrik `SF Pro Display-like` yang didekati dengan `Inter Tight` untuk heading.
- Saat mengganti, naikkan sedikit tinggi baris (+0.02 hingga +0.06) pada ukuran body dan kurangi intensitas tracking negatif untuk menjaga keterbacaan.

## 4. Penggayaan Komponen

### Tombol
- **Aksi Isian Primer:** latar `#0071e3`, teks `#ffffff`, radius 8px, padding horizontal ringkas (umumnya 8px 15px). Digunakan untuk aksi pembelian/kemajuan yang menentukan.
- **Aksi Isian Gelap:** latar `#1d1d1f`, teks `#ffffff`, radius 8px. Digunakan saat permukaan terang membutuhkan aksi primer berkontras tinggi yang terkendali.
- **Keluarga Aksi Pil/Kapsul:** aksi kapsul besar pada radius `18px`-`56px` dan tautan pil ekstrem pada `980px`. Membangun siluet ajakan bertindak Apple yang lembut namun presisi.
- **Cangkang Filter/Tombol Utilitas:** cangkang terang (`#fafafc` atau putih transparan) dengan border abu-abu halus (`#d2d2d7` / `#86868b`) untuk konteks konfigurasi yang padat.
- **Perilaku Ditekan:** kontrol aktif umumnya mengurangi skala atau menggeser isian sedikit untuk menunjukkan konfirmasi tekan fisik.

### Kartu & Kontainer
- **Kartu Editorial/Produk:** kartu terang pada bidang `#f5f5f7` atau putih dengan framing minimal dan komposisi yang mengutamakan citra.
- **Kartu Utilitas Gelap:** tingkat grafit (`#272729` hingga `#2a2a2c`) digunakan untuk overlay, kontrol media, dan modul konteks gelap.
- **Panel Konfigurator:** kontainer membulat (sering 12px-18px) dengan definisi border yang jelas namun terkendali.
- **Modul Carousel/Spotlight:** cangkang membulat yang lebih besar (`28px`-`36px`) untuk jalur konten unggulan.

### Input & Formulir
- **Bidang Input Ritel:** latar transparan atau putih, teks gelap (`#1d1d1f`), kontainmen yang dipimpin border (`#86868b`).
- **Kontrol Seleksi:** geometri kontrol melingkar/seperti-toggle sering muncul dalam antarmuka seleksi produk.
- **Strategi Kepadatan:** bidang formulir tetap tenang secara visual untuk menjaga citra perangkat dan hierarki harga tetap dominan.

### Navigasi
- **Nav Pemasaran Global:** bilah transparan gelap ringkas dengan tautan berjenis kecil dan ikonografi terkendali.
- **Lapisan Nav Store/Sub-shop:** bilah utilitas tambahan, chip, dan kontrol tersegmentasi untuk penyempitan kategori dan produk.
- **Hierarki Tautan:** biru tautan tetap menjadi sinyal interaktif primer sementara teks netral mendukung set navigasi yang padat.

### Perlakuan Citra
- **Fotografi yang Mengutamakan Objek:** perangkat keras dan aksesori ditempatkan di latar depan pada permukaan solid yang terkendali.
- **Rendering finishing berkesetiaan tinggi:** detail reflektif/material menjadi sentral dalam persuasi visual.
- **Framing campuran:** adegan hero full-bleed hidup berdampingan dengan kartu ritel membulat dan thumbnail merchandising yang dipotong rapat.

### Komponen Khas Lainnya
- **Matriks Konfigurator Produk:** tumpukan opsi dan pemilih yang menggabungkan chip, kontrol bergaya radio, dan blok harga/ringkasan kontekstual.
- **Titik/Panah Kontrol Carousel:** kosakata kontrol melingkar dalam overlay redup untuk kemajuan galeri.
- **Panel Cerita Environment:** bab naratif yang memadukan tipografi editorial dengan visual produk/lingkungan sinematik.

## 5. Prinsip Tata Letak

### Sistem Spasi
- Unit dasarnya secara efektif `8px`, tetapi sistem mendukung langkah-mikro yang padat untuk penyelarasan presisi.
- Nilai spasi yang sering digunakan kembali di seluruh halaman: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Konstanta ritme universal yang terlihat di alur pemasaran maupun ritel: penyangga unit `8px` dengan interval utilitas `14-20px` untuk padding komponen dan spasi daftar.

### Grid & Kontainer
- **Halaman showcase:** kolom pusat besar dengan ruang horizontal yang luas dan bab warna selebar penuh.
- **Halaman komersial:** grid produk dan kontrol multi-kolom yang lebih rapat dengan penumpukan modular yang sering.
- **Perilaku kontainer:** inti terbaca yang dibatasi dengan margin luar yang murah hati pada lebar desktop.

### Filosofi Ruang Putih
- **Pengaturan tempo adegan:** bab visual utama menggunakan ruang atas/bawah yang luas.
- **Pemadatan informasi bila perlu:** halaman ritel sengaja memampatkan spasi untuk menampilkan lebih banyak informasi yang dapat ditindaklanjuti per viewport.
- **Pemisahan yang dipimpin kontras:** transisi bagian lebih bergantung pada perubahan permukaan daripada pemisah dekoratif.

### Skala Radius Border
- **5px:** tautan/tag utilitas mungil dan cangkang kecil minor.
- **8px-12px:** kontrol standar dan bidang ringkas.
- **16px-18px:** kartu, frame modul, dan panel komersial.
- **28px-36px:** kontainer modul dan spotlight yang lebih besar.
- **56px / 100px / 980px:** kapsul, pil besar, dan bentuk CTA memanjang khas.
- **50%:** kontrol media dan seleksi melingkar.

## 6. Kedalaman & Elevasi

| Tingkat | Perlakuan | Penggunaan |
|------|-----------|-----|
| Level 0 | Permukaan netral datar (`#ffffff`, `#f5f5f7`, `#000000`) | Panggung naratif dan produk utama |
| Level 1 | Kontainmen border halus (`#d2d2d7`, `#86868b`) | Filter, bidang input, kartu utilitas |
| Level 2 | Bayangan lembut (`rgba(0,0,0,0.08)` hingga `rgba(0,0,0,0.22)` jika ada) | Kartu yang disorot dan modul merchandise yang terangkat |
| Level 3 | Penjenjangan permukaan gelap (`#272729` -> `#2a2a2c`) | Overlay, kontrol media, klaster utilitas gelap |
| Aksesibilitas | Sinyal fokus biru (`#0071e3`) | Penekanan keyboard dan seleksi |

Kedalaman sengaja dibuat terkendali. Apple lebih menyukai kontras tonal, penjenjangan permukaan, dan hierarki komposisi daripada tumpukan bayangan yang berat.

### Kedalaman Dekoratif
- Kedalaman dekoratif terutama diciptakan oleh realisme fotografis dan rendering material, bukan efek UI sintetis.
- Overlay transparan dan bilah utilitas seperti-kaca memberikan layering atmosferik ringan dalam navigasi dan kontrol.

## 7. Anjuran dan Larangan

### Anjuran
- Gunakan triad netral (`#000000`, `#f5f5f7`, `#ffffff`) sebagai fondasi struktural.
- Sediakan aksen biru hanya untuk semantik aksi dan navigasi yang sesungguhnya.
- Jaga tipografi tetap rapat dan disengaja, terutama pada skala display.
- Pertahankan bahasa geometri kapsul/lingkaran untuk kontrol dan aksi kunci.
- Biarkan citra produk membawa drama visual; jaga krom tetap rendah hati.
- Gunakan kontainmen yang dipimpin border dalam konteks ritel yang padat alih-alih ornamentasi kartu yang berat.
- Pertahankan pemisahan yang jelas antara modul showcase dan modul transaksional sambil menjaga token inti tetap bersama.

### Larangan
- Jangan memperkenalkan palet aksen sekunder yang luas yang bersaing dengan biru Apple.
- Jangan berlebihan menggunakan bayangan, efek glow, atau gradien dekoratif dalam krom UI inti.
- Jangan mencampur keluarga font yang tidak terkait atau melonggarkan tracking tanpa pandang bulu.
- Jangan meratakan semua sudut ke satu radius; Apple menggunakan tingkatan radius yang bertujuan.
- Jangan membebani modul komersial dengan border tebal atau efek visual yang berisik.
- Jangan menghapus kadensi kontras netral antara bab gelap dan terang.
- Jangan memperlakukan alur pemasaran dan pembelian sebagai sistem desain yang terpisah.

## 8. Perilaku Responsif

### Breakpoint
| Nama | Lebar | Perubahan Utama |
|------|-------|-------------|
| Small Mobile | 374px ke bawah | Kontrol ritel yang dirapatkan, tumpukan produk satu kolom |
| Mobile | 375px-640px | Modul satu kolom, baris aksi ringkas, pemilih yang dipadatkan |
| Tablet | 641px-833px | Kartu yang diperluas dan transisi campuran 1-2 kolom |
| Tablet Wide | 834px-1023px | Merchandising multi-kolom yang lebih stabil, blok teks yang lebih besar |
| Desktop | 1024px-1240px | Tata letak ritel penuh dan struktur perbandingan produk |
| Desktop Wide | 1241px-1440px | Ekspansi hero pemasaran dan spasi bagian yang lebih luas |
| Large Desktop | 1441px+ | Ruang bab maksimum dan komposisi editorial yang lebar |

### Target Sentuh
- Aksi primer dan sekunder umumnya disajikan dalam geometri pil/tombol yang ramah-ketuk.
- Kontrol media dan seleksi melingkar selaras dengan niat sentuh minimum dalam konteks seluler.
- UI komersial yang padat menggunakan label ringkas tetapi mempertahankan area sasaran yang jelas melalui padding bentuk di sekelilingnya.

### Strategi Pelipatan
- Tipografi hero pemasaran mengecil dalam tingkatan diskret sambil mempertahankan kontras hierarki.
- Grid produk dan komersial melipat dari multi-kolom menjadi kartu bertumpuk dengan visibilitas pemilih yang persisten.
- Navigasi utilitas memampat menjadi pengelompokan tautan/kontrol yang lebih sederhana sambil mempertahankan aksi kunci.
- Klaster opsi/konfigurasi menjadi terurut secara vertikal untuk menjaga alur pembelian tetap linier di layar kecil.

### Perilaku Citra
- Citra produk mempertahankan rasio aspek dan sentralitas melalui breakpoint.
- Visual hero tetap dominan di seluler, dengan teks yang ditempatkan ulang di sekitar prioritas media.
- Thumbnail ritel tetap terbaca melalui logika pemotongan yang lebih rapat dan penumpukan kartu yang lebih padat.
- Modul yang dipimpin citra terus menjadi jangkar ritme saat kepadatan tata letak meningkat.

## 9. Panduan Prompt Agen

### Referensi Warna Cepat
- Biru aksi primer: **Biru Aksi Apple** (`#0071e3`)
- Biru tautan inline: **Biru Tautan Body** (`#0066cc`)
- Kanvas bab gelap: **Hitam Absolut** (`#000000`)
- Kanvas bab terang: **Abu-abu Apple Pucat** (`#f5f5f7`)
- Teks primer pada terang: **Tinta Nyaris-Hitam** (`#1d1d1f`)
- Teks sekunder: **Abu-abu Netral Sekunder** (`#6e6e73`)
- Border ritel lembut: **Abu-abu Border Lembut** (`#d2d2d7`)
- Border ritel kuat: **Abu-abu Border Menengah** (`#86868b`)

### Contoh Prompt Komponen
- "Rancang hero produk bergaya Apple pada kanvas hitam (`#000000`) dengan headline semibold SF Pro Display (48-56px), salinan pendukung yang ringkas, dan dua CTA kapsul menggunakan `#0071e3` dan `#1d1d1f`."
- "Buat panel konfigurasi komersial pada putih (`#ffffff`) dengan kartu membulat 18px, bidang border `#86868b`, salinan body SF Pro Text 17px, dan pemilih opsi yang ringkas."
- "Bangun grid kartu merchandising yang berganti-ganti permukaan `#f5f5f7` dan putih, dengan kartu yang mengutamakan citra, bayangan yang terkendali, dan metadata SF Pro Text 14-17px."
- "Hasilkan klaster kontrol carousel menggunakan tombol melingkar (radius 50%), overlay abu-abu redup, dan umpan balik aktif yang jelas untuk navigasi galeri."
- "Susun ritme halaman campuran pemasaran + ritel: bab showcase gelap -> bab fitur terang -> modul daftar produk padat sambil menjaga aksen biru hanya untuk aksi dan tautan."

### Panduan Iterasi
1. Kunci fondasi netral terlebih dahulu (`#000000`, `#f5f5f7`, `#ffffff`) sebelum menyetel aksen.
2. Jaga aksen biru tetap langka dan bertujuan; jika semuanya biru, hierarki runtuh.
3. Setel tipografi dalam urutan ini: skala display, keterbacaan body, lalu label mikro.
4. Cocokkan radius berdasarkan kelas komponen (bidang, kartu, kapsul, lingkaran) alih-alih pembulatan satu-untuk-semua.
5. Tingkatkan kepadatan secara bertahap saat berpindah dari bagian showcase ke bagian komersial.
6. Validasi bahwa citra produk tetap menjadi lapisan visual terkuat setelah setiap revisi.

### Kesenjangan yang Diketahui
- Warna status semantik yang berbeda (error/peringatan/sukses) tidak konsisten terlihat dalam kumpulan halaman yang diekstrak.
- Beberapa keadaan-mikro interaksi bervariasi per modul dan tidak direpresentasikan sebagai token sistem universal.
- Beberapa modul ritel memunculkan penggantian tipografi spesifik-konteks yang tidak muncul di kelima halaman.
