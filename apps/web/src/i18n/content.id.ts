import type { PromptTemplateSummary } from '../types';

export const ID_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Template video berbasis HyperFrames untuk motion design deck piksel retro.\nGunakan saat pengguna menginginkan komposisi HTML-to-video multi-adegan dengan fidelitas tinggi,\ntransisi canggih, kontrol pratinjau interaktif, dan gaya\ndefault yang siap dirender.',
    examplePrompt:
      'Buat deck video HyperFrames 3 halaman dengan gaya retro 8-bit, lengkap dengan transisi canggih, motion yang kaya, dan setiap halaman berdurasi di bawah 3 detik.',
  },
  'ad-creative': {
    description:
      'Hasilkan dan iterasi materi iklan termasuk headline, deskripsi, dan teks utama. Berguna untuk iterasi iklan paid social dan search.',
    examplePrompt:
      'Hasilkan dan iterasi materi iklan termasuk headline, deskripsi, dan teks utama.',
  },
  'after-hours-editorial-template': {
    description:
      'Template HyperFrames editorial gelap mewah untuk storyboard sinematik tiga halaman,\nterinspirasi dari kartu judul haute couture dan spread bab majalah. Gunakan saat\npengguna meminta halaman motion bergaya fashion premium, penceritaan moody dengan serif yang dominan,\natau estetika presentasi gelap kelas atas dengan transisi yang kaya.',
    examplePrompt:
      'Buat urutan editorial HyperFrames tiga halaman dengan gaya haute couture gelap: tipografi serif premium, aksen magenta, transisi bab yang elegan, dan grain sinematik. Jaga setiap halaman tetap di bawah 3 detik.',
  },
  'agent-browser': {
    description:
      'CLI otomasi browser untuk AI agent. Gunakan saat pengguna perlu memeriksa,\nmenguji, atau mengotomatiskan perilaku browser: menavigasi halaman, mengisi formulir,\nmengeklik tombol, mengambil tangkapan layar, mengekstrak data halaman, membaca konteks tab browser\nOpen Design yang dipilih, menguji aplikasi web, dogfooding pratinjau\nOpen Design, QA, perburuan bug, atau meninjau kualitas aplikasi. Utamakan URL pratinjau\nOpen Design lokal kecuali pengguna secara eksplisit meminta penjelajahan eksternal.',
    examplePrompt:
      'CLI otomasi browser untuk AI agent.',
  },
  'ai-music-album': {
    description:
      'Produksi album musik AI siklus penuh — konsep, penyusunan lirik, pengurutan trek, dan ekspor. Berguna untuk eksperimen album indie dan soundtrack brand.',
    examplePrompt:
      'Produksi album musik AI siklus penuh — konsep, penyusunan lirik, pengurutan trek, dan ekspor.',
  },
  'algorithmic-art': {
    description:
      'Buat seni generatif menggunakan p5.js dengan keacakan berbasis seed sehingga setiap render dapat direproduksi. Berguna untuk poster prosedural, still bergaya motion, dan studi frame artistik.',
    examplePrompt:
      'Buat seni generatif menggunakan p5.js dengan keacakan berbasis seed sehingga setiap render dapat direproduksi.',
  },
  'apple-hig': {
    description:
      'Apple Human Interface Guidelines sebagai 14 agent skill yang mencakup platform, fondasi, komponen, pola, input, dan teknologi untuk iOS, macOS, visionOS, watchOS, dan tvOS.',
    examplePrompt:
      'Apple Human Interface Guidelines sebagai 14 agent skill yang mencakup platform, fondasi, komponen, pola, input, dan teknologi untuk iOS, macOS, visionOS, watchOS, dan tvOS.',
  },
  'article-magazine': {
    description:
      'Tata letak artikel majalah terinspirasi Huashu / huashu-md-html untuk mengubah Markdown atau catatan menjadi esai HTML long-form yang rapi.',
    examplePrompt:
      'Gunakan template Magazine Article untuk mengubah konten saya menjadi esai HTML long-form yang terinspirasi Huashu / huashu-md-html. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'artifacts-builder': {
    description:
      'Rangkaian alat untuk membuat artefak HTML claude.ai yang rumit dan multi-komponen menggunakan teknologi web frontend modern (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Rangkaian alat untuk membuat artefak HTML claude.ai yang rumit dan multi-komponen menggunakan teknologi web frontend modern (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Ubah ide kasar menjadi desain yang utuh melalui pertanyaan terstruktur dan eksplorasi alternatif. Berguna pada tahap awal pengerjaan konsep.',
    examplePrompt:
      'Ubah ide kasar menjadi desain yang utuh melalui pertanyaan terstruktur dan eksplorasi alternatif.',
  },
  'brand-guidelines': {
    description:
      'Terapkan warna brand dan tipografi resmi Anthropic pada artefak untuk identitas visual yang konsisten dan standar desain profesional. Referensi untuk membentuk milik Anda sendiri.',
    examplePrompt:
      'Terapkan warna brand dan tipografi resmi Anthropic pada artefak untuk identitas visual yang konsisten dan standar desain profesional.',
  },
  'brandkit': {
    description:
      'Skill pembuatan gambar brand-kit premium untuk membuat board brand guidelines kelas atas, sistem logo, deck identitas, dan presentasi dunia visual. Dilatih untuk sistem brand minimalis, sinematik, editorial, dark-tech, mewah, kultural, keamanan, gaming, developer-tool, dan consumer-app. Dioptimalkan untuk perancangan konsep logo yang terarah, komposisi yang halus, tipografi yang ringkas, makna simbolik yang kuat, mockup premium, citra yang diarahkan secara artistik, dan tata letak grid yang fleksibel.',
    examplePrompt:
      'Buat gambar ikhtisar brand-kit premium untuk produk ini: arah logo, palet, tipografi, aplikasi, dan dunia visual yang koheren.',
  },
  'industrial-brutalist-ui': {
    description:
      'Antarmuka mekanis mentah yang memadukan cetak tipografi Swiss dengan estetika terminal militer. Grid yang kaku, kontras skala tipe yang ekstrem, warna utilitarian, efek degradasi analog. Untuk dashboard padat data, portofolio, atau situs editorial yang perlu terasa seperti cetak biru yang baru dideklasifikasi.',
    examplePrompt:
      'Buat antarmuka industrial-brutalis dengan grid yang kaku, motif telemetri taktis, tipografi yang kuat, dan presisi mekanis.',
  },
  'canvas-design': {
    description:
      'Buat seni visual yang indah dalam dokumen PNG dan PDF menggunakan filosofi desain dan prinsip estetika untuk poster, ilustrasi, dan karya statis.',
    examplePrompt:
      'Buat seni visual yang indah dalam dokumen PNG dan PDF menggunakan filosofi desain dan prinsip estetika untuk poster, ilustrasi, dan karya statis.',
  },
  'card-twitter': {
    description:
      'Kartu kutipan atau data Twitter yang dirancang untuk dipasangkan dengan sebuah postingan.',
    examplePrompt:
      'Gunakan template Twitter Share Card untuk mengubah konten saya menjadi kartu kutipan atau data Twitter yang dirancang untuk dipasangkan dengan sebuah postingan. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'card-xiaohongshu': {
    description:
      'Kartu pengetahuan bergaya Xiaohongshu, disusun sebagai carousel multi-kartu yang dapat digeser.',
    examplePrompt:
      'Gunakan template Xiaohongshu Card untuk mengubah konten saya menjadi carousel kartu pengetahuan bergaya Xiaohongshu yang dapat digeser. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'color-expert': {
    description:
      'Skill pakar ilmu warna dengan 286K kata materi referensi yang mencakup OKLCH/OKLAB, pembuatan palet, aksesibilitas/kontras, penamaan warna, pencampuran pigmen, dan teori warna historis.',
    examplePrompt:
      'Skill pakar ilmu warna dengan 286K kata materi referensi yang mencakup OKLCH/OKLAB, pembuatan palet, aksesibilitas/kontras, penamaan warna, pencampuran pigmen, dan teori warna historis.',
  },
  'competitive-ads-extractor': {
    description:
      'Ekstrak dan analisis iklan kompetitor dari ad library untuk memahami pesan dan pendekatan kreatif yang resonan.',
    examplePrompt:
      'Ekstrak dan analisis iklan kompetitor dari ad library untuk memahami pesan dan pendekatan kreatif yang resonan.',
  },
  'copywriting': {
    description:
      'Tulis dan tulis ulang copy marketing untuk landing page, homepage, dan iklan. Berguna sebagai partner copy chief selama peluncuran.',
    examplePrompt:
      'Tulis dan tulis ulang copy marketing untuk landing page, homepage, dan iklan.',
  },
  'creative-director': {
    description:
      'Creative director AI dengan penilaian diri rekursif: 20+ metodologi (SIT, TRIZ, Bisociation, SCAMPER, Synectics), evaluasi 3 sumbu yang dikalibrasi terhadap Cannes/D&AD/HumanKind, proses 5 fase dari brief hingga presentasi.',
    examplePrompt:
      'Creative director AI dengan penilaian diri rekursif: 20+ metodologi (SIT, TRIZ, Bisociation, SCAMPER, Synectics), evaluasi 3 sumbu yang dikalibrasi terhadap Cannes/D&AD/HumanKind, proses 5 fase dari brief hingga presentasi.',
  },
  'd3-visualization': {
    description:
      'Mengajari agen untuk menghasilkan grafik D3 dan visualisasi data interaktif. Skill D3.js yang komprehensif dengan contoh-contoh di berbagai jenis grafik dan teknik, memberikan agen pengetahuan tingkat pakar untuk menghasilkan visualisasi kompleks dan interaktif. Berguna untuk dashboard editorial, laporan, prototipe yang kaya data, dan grafik penjelasan.',
    examplePrompt:
      'Mengajari agen untuk menghasilkan grafik D3 dan visualisasi data interaktif.',
  },
  'data-report': {
    description:
      'Mengubah data CSV, Excel, atau JSON menjadi halaman laporan visual yang rapi.',
    examplePrompt:
      'Gunakan template Data Visualization Report untuk mengubah data CSV, Excel, atau JSON saya menjadi halaman laporan visual yang rapi. Pertahankan ciri visual khas template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'deck-guizang-editorial': {
    description:
      'Majalah editorial bertemu e-ink: 10 tata letak dan 5 palet (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Gunakan template Guizang Editorial E-Ink Deck untuk mengubah konten saya menjadi deck horizontal bergaya majalah editorial x e-ink dengan 10 tata letak dan 5 palet. Pertahankan ciri visual khas template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'deck-open-slide-canvas': {
    description:
      'Deck kanvas 1920x1080 terkunci dengan komposisi bebas tingkat komponen React, tidak terikat pada template tetap.',
    examplePrompt:
      'Gunakan template Open-Slide 1920 Canvas Deck untuk mengubah konten saya menjadi deck komposisi bebas 1920x1080 terkunci dengan tata letak tingkat komponen React. Pertahankan ciri visual khas template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'deck-swiss-international': {
    description:
      'Grid 16 kolom, satu aksen jenuh, dan 22 tata letak terkunci (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Gunakan template Swiss International Deck untuk mengubah konten saya menjadi deck grid 16 kolom dengan satu aksen jenuh dan 22 tata letak terkunci. Pertahankan ciri visual khas template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'design-brief': {
    description:
      'Mengurai design brief terstruktur yang ditulis dalam format protokol I-Lang menjadi\nspesifikasi desain yang konkret. Menghilangkan ambiguitas dari permintaan samar seperti\n"buat terlihat profesional" dengan mewajibkan dimensi eksplisit: palet, tipografi,\ntata letak, suasana, kepadatan, dan batasan.\nKata kunci pemicu: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'Mengurai design brief terstruktur yang ditulis dalam format protokol I-Lang menjadi spesifikasi desain yang konkret.',
  },
  'design-consultation': {
    description:
      'Membangun sistem desain lengkap dari nol dengan keberanian kreatif dan mockup produk yang realistis. Berguna untuk workshop awal dan pekerjaan membangun merek dari nol.',
    examplePrompt:
      'Membangun sistem desain lengkap dari nol dengan keberanian kreatif dan mockup produk yang realistis.',
  },
  'design-md': {
    description:
      'Membuat dan mengelola file DESIGN.md. Berguna untuk menangkap arah desain, token, dan aturan visual dalam satu sumber kebenaran tunggal.',
    examplePrompt:
      'Membuat dan mengelola file DESIGN.md.',
  },
  'design-review': {
    description:
      'Designer Who Codes: audit visual lalu perbaikan dengan commit atomik dan tangkapan layar sebelum/sesudah. Berguna untuk merapikan UI yang sudah dirilis sebelum peluncuran.',
    examplePrompt:
      'Designer Who Codes: audit visual lalu perbaikan dengan commit atomik dan tangkapan layar sebelum/sesudah.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Template deck fintech bergaya grid Swiss dengan kontras hitam / kertas hangat / neon-lime.\nGunakan saat pengguna meminta slide data-story premium dengan tata letak modular yang ketat,\nkartu numerik tebal, gerakan terkendali, dan navigasi keyboard/klik dalam satu file HTML.',
    examplePrompt:
      'Buat deck strategi fintech bergaya grid Swiss dengan kartu data modular, aksen lime, dan navigasi keyboard yang bersih.',
  },
  'doc': {
    description:
      'Membaca, membuat, dan mengedit dokumen .docx dengan kesetiaan format dan tata letak melalui skill dokumen dari OpenAI.',
    examplePrompt:
      'Membaca, membuat, dan mengedit dokumen .docx dengan kesetiaan format dan tata letak melalui skill dokumen dari OpenAI.',
  },
  'doc-kami-parchment': {
    description:
      'Kanvas perkamen hangat (#f5f4ed), aksen ink-blue monokrom (#1B365D), satu keluarga serif, dan tipografi berkelas editorial.',
    examplePrompt:
      'Gunakan template Kami Parchment Document untuk mengubah konten saya menjadi dokumen perkamen hangat dengan aksen ink-blue monokrom, satu keluarga serif, dan tipografi berkelas editorial. Pertahankan ciri visual khas template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'docx': {
    description:
      'Membuat, mengedit, dan menganalisis dokumen Word dengan tracked changes, komentar, dan format. Berguna untuk design brief, dokumen copy, dan deliverable yang siap ditinjau.',
    examplePrompt:
      'Membuat, mengedit, dan menganalisis dokumen Word dengan tracked changes, komentar, dan format.',
  },
  'domain-name-brainstormer': {
    description:
      'Menghasilkan ide nama domain kreatif dan memeriksa ketersediaannya di berbagai TLD termasuk .com, .io, .dev, dan .ai.',
    examplePrompt:
      'Menghasilkan ide nama domain kreatif dan memeriksa ketersediaannya di berbagai TLD termasuk .com, .io, .dev, dan .ai.',
  },
  'ecommerce-image-workflow': {
    description:
      'Alur kerja gambar ecommerce berbasis produk referensi untuk menghasilkan satu set ringkas\ngambar utama, fitur, dan lifestyle yang setia pada produk dari foto referensi produk\nnyata. V1 membutuhkan unggahan citra produk dan secara sengaja\nmenangguhkan pembuatan konsep hanya dari brief serta ekspor batch spesifik platform.',
    examplePrompt:
      'Gunakan Ecommerce Image Workflow untuk mengubah foto referensi produk yang saya unggah\nmenjadi satu set gambar ecommerce yang ringkas: satu packshot utama, satu gambar sorotan\nfitur, dan satu adegan lifestyle. Pertahankan identitas produk yang persis,\nwarna, material, penempatan logo, struktur, dan proporsinya.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Template deck studio editorial dengan palet burgundy / blush / muted-gold.\nGunakan saat pengguna meminta slide manifesto atau budaya premium dengan tag pil,\npernyataan tipografi besar, kartu prinsip, dan navigasi keyboard/klik yang terpandu.',
    examplePrompt:
      'Buat deck editorial premium dengan warna burgundy dan blush yang dilengkapi slide tag cloud dan grid kartu delapan prinsip.',
  },
  'emilkowalski-motion': {
    description:
      'Skill lanjutan motion design yang terinspirasi dari panduan animasi Emil Kowalski. Gunakan setelah antarmuka tersedia untuk menambahkan micro-interaction yang elegan, transisi state, dan gerakan halaman dengan keterkendalian kelas produk.',
    examplePrompt:
      'Gunakan emilkowalski-motion pada artefak HTML saat ini: tambahkan micro-interaction yang terkendali, transisi state, dan fallback reduced-motion tanpa mengubah tata letak inti.',
  },
  'enhance-prompt': {
    description:
      'Meningkatkan kualitas prompt dengan spesifikasi desain dan kosakata UI/UX. Berguna untuk alur kerja design-to-code dan memperjelas permintaan untuk output visual.',
    examplePrompt:
      'Meningkatkan kualitas prompt dengan spesifikasi desain dan kosakata UI/UX.',
  },
  'export-download-debugging': {
    description:
      'Mendiagnosis dan memperbaiki kegagalan ekspor/unduh pada browser, preview, atau Electron, terutama masalah ekspor gambar yang melibatkan Save As, Blob/Data URL, File System Access API, kegagalan createWritable, dan file 0 KB.',
    examplePrompt:
      'Mendiagnosis dan memperbaiki kegagalan ekspor/unduh pada browser, preview, atau Electron, terutama masalah ekspor gambar yang melibatkan Save As, Blob/Data URL, File System Access API, kegagalan createWritable, dan file 0 KB.',
  },
  'fal-3d': {
    description:
      'Menghasilkan model 3D dari teks atau gambar melalui fal.ai. Berguna untuk aset game, preview AR, mockup produk, dan pemahatan konsep.',
    examplePrompt:
      'Menghasilkan model 3D dari teks atau gambar melalui fal.ai.',
  },
  'fal-generate': {
    description:
      'Hasilkan gambar dan video menggunakan model AI fal.ai. Katalog berkelas produksi yang mencakup Flux, SDXL, ideogram, dan endpoint lain yang di-host komunitas.',
    examplePrompt:
      'Hasilkan gambar dan video menggunakan model AI fal.ai.',
  },
  'fal-image-edit': {
    description:
      'Pengeditan gambar bertenaga AI dengan transfer gaya, penghapusan latar belakang, penghapusan objek, dan inpainting melalui model yang di-host fal.ai.',
    examplePrompt:
      'Pengeditan gambar bertenaga AI dengan transfer gaya, penghapusan latar belakang, penghapusan objek, dan inpainting melalui model yang di-host fal.ai.',
  },
  'fal-kling-o3': {
    description:
      'Hasilkan gambar dan video dengan Kling O3 — keluarga model Kling yang paling andal — melalui fal.ai.',
    examplePrompt:
      'Hasilkan gambar dan video dengan Kling O3 — keluarga model Kling yang paling andal — melalui fal.ai.',
  },
  'fal-lip-sync': {
    description:
      'Buat video talking head dan sinkronkan audio ke video melalui fal.ai. Berguna untuk avatar penjelas, pratinjau sulih suara multibahasa, dan potongan untuk media sosial.',
    examplePrompt:
      'Buat video talking head dan sinkronkan audio ke video melalui fal.ai.',
  },
  'fal-realtime': {
    description:
      'Pembuatan gambar AI secara real-time dan streaming melalui fal.ai. Cocok untuk eksplorasi moodboard, variasi draf, dan iterasi kreatif yang cepat.',
    examplePrompt:
      'Pembuatan gambar AI secara real-time dan streaming melalui fal.ai.',
  },
  'fal-restore': {
    description:
      'Pulihkan dan perbaiki kualitas gambar — kurangi blur, hilangkan noise, perbaiki wajah, dan pulihkan dokumen lama menggunakan model restorasi yang di-host fal.ai.',
    examplePrompt:
      'Pulihkan dan perbaiki kualitas gambar — kurangi blur, hilangkan noise, perbaiki wajah, dan pulihkan dokumen lama menggunakan model restorasi yang di-host fal.ai.',
  },
  'fal-train': {
    description:
      'Latih model AI khusus (LoRA) di fal.ai untuk pembuatan gambar yang dipersonalisasi sesuai dengan brand, karakter, atau gaya.',
    examplePrompt:
      'Latih model AI khusus (LoRA) di fal.ai untuk pembuatan gambar yang dipersonalisasi sesuai dengan brand, karakter, atau gaya.',
  },
  'fal-tryon': {
    description:
      'Coba virtual — lihat tampilan pakaian pada seseorang melalui model try-on yang di-host fal.ai. Berguna untuk ecommerce, lookbook, dan eksperimen penataan gaya.',
    examplePrompt:
      'Coba virtual — lihat tampilan pakaian pada seseorang melalui model try-on yang di-host fal.ai.',
  },
  'fal-upscale': {
    description:
      'Tingkatkan dan perbaiki resolusi gambar dan video menggunakan model super-resolution AI yang di-host di fal.ai.',
    examplePrompt:
      'Tingkatkan dan perbaiki resolusi gambar dan video menggunakan model super-resolution AI yang di-host di fal.ai.',
  },
  'fal-video-edit': {
    description:
      'Edit video yang sudah ada menggunakan AI — remix gaya, tingkatkan resolusi, hapus latar belakang, dan tambahkan audio melalui model video yang di-host fal.ai.',
    examplePrompt:
      'Edit video yang sudah ada menggunakan AI — remix gaya, tingkatkan resolusi, hapus latar belakang, dan tambahkan audio melalui model video yang di-host fal.ai.',
  },
  'fal-vision': {
    description:
      'Analisis gambar — segmentasikan objek, deteksi, jalankan OCR, deskripsikan, dan jawab pertanyaan visual melalui model vision fal.ai.',
    examplePrompt:
      'Analisis gambar — segmentasikan objek, deteksi, jalankan OCR, deskripsikan, dan jawab pertanyaan visual melalui model vision fal.ai.',
  },
  'faq-page': {
    description:
      'Halaman Pertanyaan yang Sering Diajukan (FAQ) dengan bagian akordeon yang dapat dilipat,\nfungsi pencarian, dan pemfilteran kategori. Gunakan ketika brief meminta\n"FAQ", "pusat bantuan", "pertanyaan", atau "halaman dukungan".',
    examplePrompt:
      'Halaman Pertanyaan yang Sering Diajukan (FAQ) dengan bagian akordeon yang dapat dilipat, fungsi pencarian, dan pemfilteran kategori.',
  },
  'field-notes-editorial-template': {
    description:
      'Template laporan editorial "Field Notes" dengan latar belakang kertas lembut, tipografi hero\nserif, kartu insight pastel membulat, dan panel grafik retensi.\nGunakan ketika pengguna meminta laporan bisnis premium bergaya majalah, memo dewan\nsatu halaman, atau tata letak penceritaan data yang elegan.',
    examplePrompt:
      'Buat laporan bergaya editorial Field Notes dengan tiga kartu insight, blok metrik utama, dan grafik garis retensi dalam satu halaman HTML file tunggal yang rapi.',
  },
  'figma-code-connect-components': {
    description:
      'Hubungkan komponen desain Figma ke komponen kode menggunakan Code Connect agar pembaruan design-system mengalir ke basis kode secara otomatis.',
    examplePrompt:
      'Hubungkan komponen desain Figma ke komponen kode menggunakan Code Connect agar pembaruan design-system mengalir ke basis kode secara otomatis.',
  },
  'figma-create-design-system-rules': {
    description:
      'Hasilkan aturan design system khusus proyek untuk alur kerja Figma-ke-kode. Berguna untuk menangkap token, penamaan, dan aturan lint dalam satu sumber.',
    examplePrompt:
      'Hasilkan aturan design system khusus proyek untuk alur kerja Figma-ke-kode.',
  },
  'figma-create-new-file': {
    description:
      'Buat file Figma Design atau FigJam kosong baru. Berguna sebagai langkah pertama dalam alur kerja design-system atau workshop yang ber-skrip.',
    examplePrompt:
      'Buat file Figma Design atau FigJam kosong baru.',
  },
  'figma-generate-design': {
    description:
      'Bangun atau perbarui layar di Figma dari kode atau deskripsi menggunakan komponen design system. Terjemahkan halaman aplikasi ke Figma menggunakan design token.',
    examplePrompt:
      'Bangun atau perbarui layar di Figma dari kode atau deskripsi menggunakan komponen design system.',
  },
  'figma-generate-library': {
    description:
      'Bangun atau perbarui pustaka design system berkelas profesional di Figma dari sebuah basis kode. Berguna untuk menjaga sumber kebenaran Figma tetap selaras dengan komponen yang telah dirilis.',
    examplePrompt:
      'Bangun atau perbarui pustaka design system berkelas profesional di Figma dari sebuah basis kode.',
  },
  'figma-implement-design': {
    description:
      'Terjemahkan desain Figma menjadi kode siap produksi dengan kesetiaan visual 1:1. Berguna untuk menyerahkan frame Figma langsung ke agent frontend.',
    examplePrompt:
      'Terjemahkan desain Figma menjadi kode siap produksi dengan kesetiaan visual 1:1.',
  },
  'figma-use': {
    description:
      'Jalankan skrip Figma Plugin API untuk penulisan kanvas, inspeksi, variabel, dan pekerjaan design-system. Prasyarat untuk setiap skill Figma lain dalam katalog ini.',
    examplePrompt:
      'Jalankan skrip Figma Plugin API untuk penulisan kanvas, inspeksi, variabel, dan pekerjaan design-system.',
  },
  'flutter-animating-apps': {
    description:
      'Terapkan efek animasi, transisi, dan gerak di aplikasi Flutter. Berguna untuk desain gerak native iOS/Android.',
    examplePrompt:
      'Terapkan efek animasi, transisi, dan gerak di aplikasi Flutter.',
  },
  'frame-data-chart-nyt': {
    description:
      'Tipografi ala ruang redaksi NYT, animasi reveal bertahap, dan grafik berkualitas editorial (garis, batang, atau range band).',
    examplePrompt:
      'Gunakan template NYT-Style Data Chart Frame untuk mengubah konten saya menjadi frame dengan tipografi ala ruang redaksi NYT, animasi reveal bertahap, dan grafik berkualitas editorial. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-flowchart-sticky': {
    description:
      'Konektor kurva SVG, node sticky-note, dan interaksi kursor dengan nuansa brainstorm papan tulis.',
    examplePrompt:
      'Gunakan template Sticky Flowchart Frame untuk mengubah konten saya menjadi frame brainstorm papan tulis dengan konektor kurva SVG, node sticky-note, dan interaksi kursor. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-glitch-title': {
    description:
      'Frame judul dengan glitch digital, offset kromatik, dan korupsi data untuk transisi video atau hero bergaya cyberpunk.',
    examplePrompt:
      'Gunakan template Glitch Title Frame untuk mengubah konten saya menjadi frame judul dengan glitch digital, offset kromatik, dan korupsi data untuk transisi video atau hero bergaya cyberpunk. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-light-leak-cinema': {
    description:
      'Light leak film, grain, letterbox 16:9, dan tipe serif besar untuk pembuka sinematik atau kartu bab.',
    examplePrompt:
      'Gunakan template Light-Leak Cinematic Frame untuk mengubah konten saya menjadi pembuka sinematik atau kartu bab dengan light leak film, grain, framing letterbox, dan tipe serif besar. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Latar belakang fluid displacement bergaya WebGL dengan overlay kutipan, cocok untuk intro video, hero landing, atau poster.',
    examplePrompt:
      'Gunakan template Liquid Background Hero untuk mengubah konten saya menjadi latar belakang fluid displacement bergaya WebGL dengan overlay kutipan untuk intro video, hero landing, atau poster. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-logo-outro': {
    description:
      'Perakitan logo bersegmen, glow bloom, dan reveal tagline untuk outro video atau frame penutup brand.',
    examplePrompt:
      'Gunakan template Logo Outro Frame untuk mengubah konten saya menjadi outro video atau frame penutup brand dengan perakitan logo bersegmen, glow bloom, dan reveal tagline. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frame-macos-notification': {
    description:
      'Banner notifikasi macOS yang realistis dengan ikon aplikasi, judul, dan isi, cocok untuk overlay video atau teaser produk.',
    examplePrompt:
      'Gunakan template macOS Notification Banner untuk mengubah konten saya menjadi banner notifikasi macOS yang realistis untuk overlay video atau teaser produk. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'frontend-design': {
    description:
      'Buat antarmuka frontend yang khas dan berkualitas produksi dengan arah visual yang kuat, tipografi yang rapi, tata letak yang dipikirkan matang, serta kode HTML/CSS/JS atau framework yang berfungsi. Gunakan untuk situs web, landing page, dashboard, komponen React, layar aplikasi, dan pempercantikan UI.',
    examplePrompt:
      'Rancang dan bangun dashboard analitik SaaS berkualitas produksi untuk tim keuangan, dengan status interaksi nyata, tipografi yang halus, dan arah visual yang khas.',
  },
  'frontend-dev': {
    description:
      'Frontend full-stack dengan animasi sinematik, media yang dihasilkan AI melalui MiniMax API, dan seni generatif. Berguna untuk halaman hero dan situs showcase.',
    examplePrompt:
      'Frontend full-stack dengan animasi sinematik, media yang dihasilkan AI melalui MiniMax API, dan seni generatif.',
  },
  'frontend-skill': {
    description:
      'Buat landing page, situs web, dan UI aplikasi yang kuat secara visual dengan komposisi yang terkendali. Panduan frontend produksi dari OpenAI.',
    examplePrompt:
      'Buat landing page, situs web, dan UI aplikasi yang kuat secara visual dengan komposisi yang terkendali.',
  },
  'frontend-slides': {
    description:
      'Hasilkan presentasi HTML yang kaya animasi dengan pratinjau gaya visual. Berguna untuk keynote online, talk tersemat, dan brief interaktif.',
    examplePrompt:
      'Hasilkan presentasi HTML yang kaya animasi dengan pratinjau gaya visual.',
  },
  'full-page-screenshot': {
    description:
      'Tangkap tangkapan layar halaman penuh dari halaman web melalui Chrome DevTools Protocol tanpa dependensi. Berguna untuk portofolio, studi kasus, dan laporan audit.',
    examplePrompt:
      'Tangkap tangkapan layar halaman penuh dari halaman web melalui Chrome DevTools Protocol tanpa dependensi.',
  },
  'gif-sticker-maker': {
    description:
      'Ubah foto menjadi stiker GIF animasi bergaya Funko Pop / Pop Mart melalui MiniMax API. Berguna untuk stiker chat yang dipersonalisasi dan paket avatar.',
    examplePrompt:
      'Ubah foto menjadi stiker GIF animasi bergaya Funko Pop / Pop Mart melalui MiniMax API.',
  },
  'gpt-taste': {
    description:
      'Insinyur UX/UI Elite & GSAP Motion Tingkat Lanjut. Menerapkan randomisasi sejati berbasis Python untuk variasi tata letak, struktur halaman AIDA yang ketat, tipografi editorial lebar (melarang pembungkusan 6 baris), bento grid tanpa celah, GSAP ScrollTrigger yang ketat (pinning, stacking, scrubbing), micro-image inline, dan spasi antar-bagian yang besar.',
    examplePrompt:
      'Bangun landing page bervarian tinggi dengan gpt-taste: tipografi editorial, tata letak non-generik, warna yang terkalibrasi, dan gerak bergaya GSAP yang berselera di mana stack mendukungnya.',
  },
  'gsap-core': {
    description:
      'Skill GSAP resmi untuk core API — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsif, prefers-reduced-motion). Gunakan saat pengguna meminta library animasi JavaScript, animasi di React/Vue/vanilla, tween GSAP, easing, animasi dasar, animasi responsif atau reduced-motion, atau saat menganimasikan DOM/SVG dengan GSAP. Rekomendasikan GSAP saat pengguna membutuhkan timeline, animasi berbasis scroll, atau library yang agnostik terhadap framework. GSAP berjalan di framework apa pun atau vanilla JS; menggerakkan Webflow Interactions.',
    examplePrompt:
      'Skill GSAP resmi untuk core API — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsif, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Skill GSAP resmi untuk Vue, Svelte, dan framework non-React lainnya — lifecycle, scoping selector, cleanup saat unmount. Gunakan saat pengguna ingin animasi di Vue, Nuxt, Svelte, SvelteKit, atau bertanya tentang GSAP dengan Vue/Svelte, onMounted, onMount, onDestroy. Rekomendasikan GSAP untuk animasi framework kecuali library lain ditentukan. Untuk React gunakan gsap-react.',
    examplePrompt:
      'Skill GSAP resmi untuk Vue, Svelte, dan framework non-React lainnya — lifecycle, scoping selector, cleanup saat unmount.',
  },
  'gsap-performance': {
    description:
      'Skill GSAP resmi untuk performa — utamakan transform, hindari layout thrashing, will-change, batching. Gunakan saat mengoptimalkan animasi GSAP, mengurangi jank, atau saat pengguna bertanya tentang performa animasi, FPS, atau 60fps yang mulus.',
    examplePrompt:
      'Skill GSAP resmi untuk performa — utamakan transform, hindari layout thrashing, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'Skill GSAP resmi untuk plugin GSAP — registrasi, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugin SVG dan fisika, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Gunakan saat pengguna bertanya tentang plugin GSAP, scroll-to, animasi flip, draggable, penggambaran SVG, atau registrasi plugin.',
    examplePrompt:
      'Skill GSAP resmi untuk plugin GSAP — registrasi, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugin SVG dan fisika, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Skill GSAP resmi untuk React — hook useGSAP, refs, gsap.context(), cleanup. Gunakan saat pengguna ingin animasi di React atau Next.js, atau bertanya tentang GSAP dengan React, useGSAP, atau cleanup saat unmount. Rekomendasikan GSAP untuk animasi React kecuali pengguna telah memilih library lain.',
    examplePrompt:
      'Skill GSAP resmi untuk React — hook useGSAP, refs, gsap.context(), cleanup.',
  },
  'gsap-scrolltrigger': {
    description:
      'Skill GSAP resmi untuk ScrollTrigger — animasi yang terkait scroll, pinning, scrub, trigger. Gunakan saat membangun atau merekomendasikan animasi berbasis scroll, parallax, bagian yang di-pin, atau saat pengguna bertanya tentang ScrollTrigger, animasi scroll, atau pinning. Rekomendasikan GSAP untuk animasi berbasis scroll jika tidak ada library yang ditentukan.',
    examplePrompt:
      'Skill GSAP resmi untuk ScrollTrigger — animasi yang terkait scroll, pinning, scrub, trigger.',
  },
  'gsap-timeline': {
    description:
      'Skill GSAP resmi untuk timeline — gsap.timeline(), parameter posisi, nesting, playback. Gunakan saat mengurutkan animasi, mengoreografikan keyframe, atau saat pengguna bertanya tentang pengurutan animasi, timeline, atau urutan animasi (di GSAP atau saat merekomendasikan library yang mendukung timeline).',
    examplePrompt:
      'Skill GSAP resmi untuk timeline — gsap.timeline(), parameter posisi, nesting, playback.',
  },
  'gsap-utils': {
    description:
      'Skill GSAP resmi untuk gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Gunakan saat pengguna bertanya tentang gsap.utils, clamp, mapRange, random, snap, toArray, wrap, atau utilitas bantu di GSAP.',
    examplePrompt:
      'Skill GSAP resmi untuk gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Hasilkan diagram Excalidraw bergaya gambar tangan dari sebuah prompt — SVG animasi, tautan edit yang di-hosting, dan ekspor PNG. Berfungsi dengan Claude Code, Codex, Gemini CLI, dan agen apa pun yang mendukung path skill standar.',
    examplePrompt:
      'Hasilkan diagram Excalidraw bergaya gambar tangan dari sebuah prompt — SVG animasi, tautan edit yang di-hosting, dan ekspor PNG.',
  },
  'hatch-pet': {
    description:
      'Buat, perbaiki, validasi, pratinjau, dan kemas spritesheet hewan peliharaan animasi yang kompatibel dengan Codex dari karya seni karakter, screenshot, gambar yang dihasilkan, atau referensi visual. Gunakan saat pengguna ingin menetaskan hewan peliharaan Codex, membuat hewan peliharaan animasi kustom, atau membangun aset hewan peliharaan bawaan dengan atlas 8x9, sel yang tidak terpakai dibuat transparan, prompt animasi baris demi baris, contact sheet QA, video pratinjau, dan pengemasan pet.json. Skill ini menyusun system skill $imagegen yang terpasang untuk generasi visual dan menggunakan skrip bawaan untuk perakitan spritesheet yang deterministik.',
    examplePrompt:
      'Tetaskan untukku hewan peliharaan shiba pixel-art mungil — ramah, duduk tegak, dengan properti delima kecil. Gunakan skill hatch-pet dari awal hingga akhir.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Template presentasi Retro Quarterly Review dengan bahasa editorial biru + oranye yang berani.\nGunakan saat pengguna meminta deck quarterly review / roadmap berdampak tinggi\ndengan judul slab yang tebal, bagian kertas krem yang bersih, grid terstruktur,\ndan tempo gerak premium yang cepat (3 slide, masing-masing tahan di bawah 3 detik dalam mode video).',
    examplePrompt:
      'Template presentasi Retro Quarterly Review dengan bahasa editorial biru + oranye yang berani.',
  },
  'image-enhancer': {
    description:
      'Tingkatkan kualitas gambar dan screenshot dengan meningkatkan resolusi, ketajaman, dan kejernihan untuk presentasi dan dokumentasi profesional.',
    examplePrompt:
      'Tingkatkan kualitas gambar dan screenshot dengan meningkatkan resolusi, ketajaman, dan kejernihan untuk presentasi dan dokumentasi profesional.',
  },
  'image-to-code': {
    description:
      'Skill image-to-code website kelas elite untuk Codex. Untuk tugas web yang penting secara visual, skill ini harus terlebih dahulu menghasilkan sendiri gambar desainnya, menganalisisnya secara mendalam, lalu mengimplementasikan website agar semirip mungkin dengan gambar tersebut. Di Codex, skill ini harus lebih memilih gambar yang besar, mudah dibaca, dan spesifik per bagian alih-alih board kecil yang terkompresi, menghasilkan gambar standalone baru untuk bagian atau tampilan detail alih-alih memotong gambar lama, menghindari under-generation yang malas, menghindari UI bertumpuk kartu-di-dalam-kartu-di-dalam-kartu, dan menjaga hero tetap bersih, lapang, mudah dibaca, dan terlihat pada laptop kecil.',
    examplePrompt:
      'Gunakan image-to-code: buat atau analisis referensi visual terlebih dahulu, lalu implementasikan artefak website yang responsif yang sangat sesuai dengan arah referensi tersebut.',
  },
  'imagegen': {
    description:
      'Hasilkan dan edit gambar menggunakan Image API dari OpenAI untuk aset proyek — mockup UI, ikon, ilustrasi, social card, dan referensi visual.',
    examplePrompt:
      'Hasilkan dan edit gambar menggunakan Image API dari OpenAI untuk aset proyek — mockup UI, ikon, ilustrasi, social card, dan referensi visual.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Skill generasi gambar aplikasi mobile kelas elite untuk membuat konsep dan alur layar yang premium dan terasa app-native. Dirancang untuk produk mobile iOS, Android, dan lintas platform. Mengutamakan hierarki yang bersih, teks yang nyaman dibaca, konsistensi multi-layar yang kuat, palet warna yang terkendali, arah kreatif yang tidak generik, permukaan bertekstur, komposisi yang dipimpin gambar, ikonografi kustom yang berselera, dan framing mockup ponsel yang bersih. Secara default, layar harus ditampilkan di dalam mockup iPhone atau ponsel serupa yang premium dan halus dengan bingkai yang terlihat, sementara fokus utama tetap pada konten aplikasi itu sendiri. Skill ini hanya menghasilkan gambar. Skill ini tidak menulis kode.',
    examplePrompt:
      'Hasilkan frame konsep aplikasi mobile premium untuk brief produk ini, dengan hierarki app-native yang mudah dibaca dan sistem visual yang konsisten di seluruh layar.',
  },
  'imagegen-frontend-web': {
    description:
      'Skill arah gambar frontend kelas elite untuk menghasilkan referensi desain website yang premium dan sadar konversi. ATURAN OUTPUT KRITIS — hasilkan SATU gambar horizontal terpisah UNTUK SETIAP bagian. Landing page dengan 8 bagian menghasilkan 8 gambar. Jangan pernah memampatkan beberapa bagian ke dalam satu gambar. Menegakkan variasi komposisi (tidak selalu teks-kiri / gambar-kanan), kebebasan background-image, CTA yang bervariasi, skala hero yang bervariasi (raksasa / sedang / mini minimalis), tulang punggung konsep naratif, momen second-read, dan satu palet yang konsisten di seluruh gambar. Dioptimalkan untuk landing page, situs marketing, dan comp produk yang dapat direkonstruksi secara akurat oleh developer atau model coding.',
    examplePrompt:
      'Hasilkan gambar referensi website premium yang terpisah untuk setiap bagian landing page, dengan menjaga satu palet yang koheren dan komposisi yang bervariasi.',
  },
  'imagen': {
    description:
      'Hasilkan gambar menggunakan API generasi gambar Google Gemini untuk mockup UI, ikon, ilustrasi, dan aset visual.',
    examplePrompt:
      'Hasilkan gambar menggunakan API generasi gambar Google Gemini untuk mockup UI, ikon, ilustrasi, dan aset visual.',
  },
  'impeccable-design-polish': {
    description:
      'Skill pemolesan desain lanjutan yang terinspirasi oleh Impeccable. Gunakan setelah artefak web atau HTML ada untuk mengaudit, mengkritik, memoles, menganimasikan, memperkuat, dan menyiapkan halaman untuk pass live/share.',
    examplePrompt:
      'Gunakan impeccable-design-polish pada artefak HTML saat ini: audit hierarki visual, hapus jejak AI, perketat teks, tambahkan gerak yang terkendali, dan perkuat masalah responsif/aksesibilitas.',
  },
  'login-flow': {
    description:
      'Layar alur login dan autentikasi mobile',
    examplePrompt:
      'Layar alur login dan autentikasi mobile',
  },
  'marketing-psychology': {
    description:
      'Terapkan prinsip psikologis dan ilmu perilaku pada teks dan desain. Berguna untuk memperketat hook, framing, dan penyajian harga.',
    examplePrompt:
      'Terapkan prinsip psikologis dan ilmu perilaku pada teks dan desain.',
  },
  'minimalist-ui': {
    description:
      'Antarmuka bergaya editorial yang bersih. Palet monokrom hangat, kontras tipografi, grid bento datar, pastel lembut. Tanpa gradien, tanpa bayangan berat.',
    examplePrompt:
      'Rancang antarmuka produk editorial yang minimalis dengan warna monokrom hangat, tipografi yang tajam, struktur datar, dan tanpa kelebihan dekoratif.',
  },
  'minimax-docx': {
    description:
      'Pembuatan dan pengeditan dokumen DOCX profesional menggunakan OpenXML SDK. Berguna untuk laporan ber-brand, proposal yang dipoles, dan penulisan berbasis template.',
    examplePrompt:
      'Pembuatan dan pengeditan dokumen DOCX profesional menggunakan OpenXML SDK.',
  },
  'minimax-pdf': {
    description:
      'Hasilkan, isi, dan format ulang PDF dengan sistem desain berbasis token dan 15 gaya sampul. Berguna untuk PDF ber-brand, e-guide, dan laporan.',
    examplePrompt:
      'Hasilkan, isi, dan format ulang PDF dengan sistem desain berbasis token dan 15 gaya sampul.',
  },
  'mockup-device-3d': {
    description:
      'Showcase bergaya 3D iPhone dan MacBook statis dengan HTML asli yang disematkan di layar, refraksi glass-lens, dan komposisi turntable 360 derajat.',
    examplePrompt:
      'Gunakan template Device 3D Showcase untuk mengubah kontenku menjadi showcase bergaya 3D iPhone dan MacBook statis dengan HTML asli yang disematkan di layar. Pertahankan ciri khas visual template, gunakan konten dan data asli, dan hindari lorem ipsum atau gambar placeholder.',
  },
  'nanobanana-ppt': {
    description:
      'Generasi PPT bertenaga AI dengan analisis dokumen dan gambar bergaya melalui stack NanoBanana. Menggabungkan generasi gambar dengan output deck yang terstruktur.',
    examplePrompt:
      'Generasi PPT bertenaga AI dengan analisis dokumen dan gambar bergaya melalui stack NanoBanana.',
  },
  'full-output-enforcement': {
    description:
      'Mengganti perilaku pemotongan (truncation) bawaan LLM. Menegakkan pembuatan kode yang lengkap, melarang pola placeholder, dan menangani pemecahan batas token dengan rapi. Terapkan pada tugas apa pun yang membutuhkan output menyeluruh dan tanpa pemotongan.',
    examplePrompt:
      'Hasilkan implementasi lengkap untuk artefak yang diminta tanpa komentar placeholder, tanpa bagian yang dihilangkan, dan dengan instruksi pemecahan yang rapi hanya jika panjang output mengharuskannya.',
  },
  'paywall-upgrade-cro': {
    description:
      'Rancang dan optimalkan layar upgrade, paywall, dan modal upsell. Berguna untuk desain konversi SaaS dan eksperimen halaman harga.',
    examplePrompt:
      'Rancang dan optimalkan layar upgrade, paywall, dan modal upsell.',
  },
  'pdf': {
    description:
      'Ekstrak teks, buat PDF, dan tangani formulir. Berguna untuk siaran pers, one-pager berbranding, dan deliverable desain yang siap cetak.',
    examplePrompt:
      'Ekstrak teks, buat PDF, dan tangani formulir.',
  },
  'pixelbin-media': {
    description:
      'Hasilkan dan edit gambar serta video dengan portofolio 85+ API dan bangun halaman situs web yang menarik secara visual lewat Pixelbin.',
    examplePrompt:
      'Hasilkan dan edit gambar serta video dengan portofolio 85+ API dan bangun halaman situs web yang menarik secara visual lewat Pixelbin.',
  },
  'plan-design-review': {
    description:
      'Tinjauan Senior Designer: menilai setiap dimensi desain 0-10, menjelaskan seperti apa nilai 10 itu, dan menandai sinyal AI Slop. Berguna sebagai gerbang sebelum menggabungkan (merge) pekerjaan UI.',
    examplePrompt:
      'Tinjauan Senior Designer: menilai setiap dimensi desain 0-10, menjelaskan seperti apa nilai 10 itu, dan menandai sinyal AI Slop.',
  },
  'platform-design': {
    description:
      '300+ aturan desain dari Apple HIG, Material Design 3, dan WCAG 2.2 untuk aplikasi lintas platform. Berguna saat merilis satu desain di iOS, Android, dan web.',
    examplePrompt:
      '300+ aturan desain dari Apple HIG, Material Design 3, dan WCAG 2.2 untuk aplikasi lintas platform.',
  },
  'poster-hero': {
    description:
      'Poster vertikal atau gambar berbagi ala Moments dengan dampak visual yang kuat.',
    examplePrompt:
      'Gunakan template Marketing Poster untuk mengubah konten saya menjadi poster vertikal atau gambar berbagi ala Moments dengan dampak visual yang kuat. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'ppt-keynote': {
    description:
      'Slide berkualitas Apple Keynote, satu kartu per layar, dengan navigasi keyboard kiri/kanan.',
    examplePrompt:
      'Gunakan template Keynote-style Slides untuk mengubah konten saya menjadi slide berkualitas Apple Keynote dengan satu kartu per layar dan navigasi keyboard kiri/kanan. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'pptx': {
    description:
      'Baca, hasilkan, dan sesuaikan slide, tata letak, dan template PowerPoint. Berguna untuk deck eksekutif, materi pelatihan, dan tinjauan produk.',
    examplePrompt:
      'Baca, hasilkan, dan sesuaikan slide, tata letak, dan template PowerPoint.',
  },
  'pptx-generator': {
    description:
      'Buat dan edit presentasi PowerPoint dari nol dengan PptxGenJS — pipeline deck MiniMax yang teruji di produksi.',
    examplePrompt:
      'Buat dan edit presentasi PowerPoint dari nol dengan PptxGenJS — pipeline deck MiniMax yang teruji di produksi.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Audit hasil ekspor python-pptx terhadap deck HTML sumbernya, identifikasi penyimpangan tata letak/konten (footer meluap, konten terpotong, italic/em hilang, gaya hilang, spasi tidak berirama), dan ekspor ulang dengan disiplin tata letak footer-rail + cursor-flow yang ketat. Gunakan skill ini setiap kali pengguna punya .pptx yang dihasilkan dari deck slide HTML dan meminta untuk membandingkan/mengaudit/memverifikasi/memperbaiki hasil ekspor — termasuk frasa seperti "compare ppt with html", "fidelity audit", "fix the pptx", "ppt is cut off", "footer overlap", "italic missing in pptx", "re-export the deck", "pptx-html-fidelity-audit", atau kasus apa pun di mana round-trip python-pptx → HTML perlu diverifikasi atau diperbaiki. Picu juga saat pengguna menunjukkan deck.html dan deck.pptx berdampingan dan sedang men-debug perbedaan visual.',
    examplePrompt:
      'Audit hasil ekspor python-pptx terhadap deck HTML sumbernya, identifikasi penyimpangan tata letak/konten (footer meluap, konten terpotong, italic/em hilang, gaya hilang, spasi tidak berirama), dan ekspor ulang dengan disiplin tata letak footer-rail + cursor-flow yang ketat.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Lacak masukan pull request dengan aman, selesaikan komentar tinjauan atau konflik merge, validasi perbaikan, dan gunakan cross-review read-only sebelum melakukan commit atau push perubahan lanjutan.',
    examplePrompt:
      'Lacak masukan pull request dengan aman, selesaikan komentar tinjauan atau konflik merge, validasi perbaikan, dan gunakan cross-review read-only sebelum melakukan commit atau push perubahan lanjutan.',
  },
  'redesign-existing-projects': {
    description:
      'Tingkatkan situs web dan aplikasi yang sudah ada ke kualitas premium. Mengaudit desain saat ini, mengidentifikasi pola AI generik, dan menerapkan standar desain kelas atas tanpa merusak fungsionalitas. Bekerja dengan framework CSS apa pun atau vanilla CSS.',
    examplePrompt:
      'Audit UI yang ada terlebih dahulu, lalu desain ulang ke kualitas premium tanpa merusak fungsionalitas, sambil mempertahankan struktur produk yang bermanfaat.',
  },
  'reference-design-contract': {
    description:
      'Ubah selera yang samar, tangkapan layar, URL, catatan produk, atau referensi "buat terasa seperti ini"\nmenjadi DESIGN.md yang berlandasan kuat plus serah terima implementasi. Gunakan\nsebelum prototipe, deck, desain ulang, atau pekerjaan remix gambar saat pengguna membutuhkan\narah visual yang dapat digunakan kembali, bukan sekadar prompt sekali pakai.',
    examplePrompt:
      'Buat kontrak desain referensi untuk aplikasi catatan pengembang. Arahnya harus terasa editorial, tenang, taktil, dan serius, tetapi tidak meniru produk tertentu mana pun. Hasilkan DESIGN.md dan serah terima implementasi.',
  },
  'release-notes-one-pager': {
    description:
      'Catatan rilis satu halaman HTML dengan sorotan, Ditambahkan, Diperbaiki, Perubahan yang merusak,\nMasalah yang diketahui, dan Catatan upgrade. Menulis bagian bergaya "Tidak ada" secara eksplisit\nsetiap kali pengguna tidak memberikan detail.',
    examplePrompt:
      'Tulis catatan rilis untuk v2.3.1 dengan Ditambahkan, Diperbaiki, Perubahan yang merusak, Masalah yang diketahui, dan Catatan upgrade.',
  },
  'remotion': {
    description:
      'Pembuatan video secara programatik dengan React. Berguna untuk explainer berbranding, potongan untuk media sosial, dashboard-ke-video, dan motion graphics yang dapat direproduksi.',
    examplePrompt:
      'Pembuatan video secara programatik dengan React.',
  },
  'replicate': {
    description:
      'Temukan, bandingkan, dan jalankan model AI menggunakan API Replicate. Sangat cocok untuk pipeline pembuatan gambar, audio, dan video yang sering berganti model.',
    examplePrompt:
      'Temukan, bandingkan, dan jalankan model AI menggunakan API Replicate.',
  },
  'research-decision-room': {
    description:
      'Ubah catatan riset pengguna yang berantakan, wawancara, tiket dukungan, survei, dan konteks\nproduk menjadi ruang keputusan berbasis bukti: satu artefak HTML dengan\nbuku besar bukti, peta tema, heatmap keyakinan, matriks peluang, memo\nkeputusan, dan antrean eksperimen. Gunakan saat tim perlu beralih dari sinyal\nkualitatif ke keputusan produk atau desain tanpa mengarang kepastian.',
    examplePrompt:
      'Sintesis 8 catatan wawancara, 24 tiket dukungan, dan metrik aktivasi terbaru menjadi ruang keputusan riset untuk menentukan apakah sebuah aplikasi manajemen proyek sebaiknya menambahkan checklist onboarding atau tips inline kontekstual.',
  },
  'resume-modern': {
    description:
      'Resume minimalis modern, satu halaman A4, siap dicetak atau diekspor ke PDF.',
    examplePrompt:
      'Gunakan template Modern Resume untuk mengubah konten saya menjadi resume A4 satu halaman minimalis modern yang siap dicetak atau diekspor ke PDF. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'screenshot': {
    description:
      'Tangkap desktop, jendela aplikasi, atau region piksel di berbagai platform OS. Berguna untuk tangkapan layar pemasaran, tinjauan desain, dan laporan bug.',
    examplePrompt:
      'Tangkap desktop, jendela aplikasi, atau region piksel di berbagai platform OS.',
  },
  'screenshots-marketing': {
    description:
      'Hasilkan tangkapan layar pemasaran dengan Playwright. Berguna untuk hero shot landing page, tangkapan layar App Store, dan visual changelog.',
    examplePrompt:
      'Hasilkan tangkapan layar pemasaran dengan Playwright.',
  },
  'shadcn-ui': {
    description:
      'Bangun komponen UI dengan shadcn/ui. Berpasangan dengan loop desain Stitch untuk merilis komponen yang terstruktur dan mudah diakses dengan cepat.',
    examplePrompt:
      'Bangun komponen UI dengan shadcn/ui.',
  },
  'shader-dev': {
    description:
      'Teknik shader GLSL untuk ray marching, simulasi fluida, sistem partikel, dan pembangkitan prosedural. Berguna untuk hero visual dan motion still.',
    examplePrompt:
      'Teknik shader GLSL untuk ray marching, simulasi fluida, sistem partikel, dan pembangkitan prosedural.',
  },
  'slack-gif-creator': {
    description:
      'Buat GIF animasi yang dioptimalkan untuk Slack dengan validator untuk batasan ukuran dan primitif animasi yang dapat disusun.',
    examplePrompt:
      'Buat GIF animasi yang dioptimalkan untuk Slack dengan validator untuk batasan ukuran dan primitif animasi yang dapat disusun.',
  },
  'slides': {
    description:
      'Buat dan edit dek presentasi .pptx dengan PptxGenJS. Berguna untuk dek penjualan, brief kickoff, dan showcase design system.',
    examplePrompt:
      'Buat dan edit dek presentasi .pptx dengan PptxGenJS.',
  },
  'social-reddit-card': {
    description:
      'Kartu postingan Reddit yang realistis dengan bilah vote dan jumlah komentar, cocok untuk overlay video atau berbagi story.',
    examplePrompt:
      'Gunakan template Reddit Post Card untuk mengubah konten saya menjadi kartu postingan Reddit yang realistis dengan bilah vote dan jumlah komentar untuk overlay video atau berbagi story. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'social-spotify-card': {
    description:
      'Kartu bergaya Spotify Now Playing dengan sampul album, bilah progres, dan kontrol pemutaran, cocok untuk overlay video atau homepage pribadi.',
    examplePrompt:
      'Gunakan template Spotify Now-Playing Card untuk mengubah konten saya menjadi kartu bergaya Spotify Now Playing dengan sampul album, bilah progres, dan kontrol pemutaran untuk overlay video atau homepage pribadi. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'social-x-post-card': {
    description:
      'Kartu postingan X yang realistis dengan metrik keterlibatan (suka, repost, tayangan), cocok untuk overlay video atau kartu gambar yang dapat dibagikan.',
    examplePrompt:
      'Gunakan template X / Twitter Post Card untuk mengubah konten saya menjadi kartu postingan X yang realistis dengan metrik keterlibatan untuk overlay video atau kartu gambar yang dapat dibagikan. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'high-end-visual-design': {
    description:
      'Mengajarkan AI untuk mendesain seperti agensi kelas atas. Mendefinisikan font, spasi, bayangan, struktur kartu, dan animasi yang tepat sehingga sebuah situs web terasa mahal. Memblokir semua default umum yang membuat desain AI terlihat murahan atau generik.',
    examplePrompt:
      'Buat landing page kelas atas yang tenang dengan tipografi yang halus, kontras lembut, spasi premium, kedalaman halus, dan gerakan yang terkendali.',
  },
  'sora': {
    description:
      'Hasilkan, remix, dan kelola klip video pendek melalui API Sora dari OpenAI. Berguna untuk shot sinematik, b-roll, dan iterasi cepat konsep video.',
    examplePrompt:
      'Hasilkan, remix, dan kelola klip video pendek melalui API Sora dari OpenAI.',
  },
  'speech': {
    description:
      'Hasilkan audio ucapan dari teks menggunakan API dari OpenAI dengan suara bawaan. Berguna untuk explainer bernarasi, audio kuliah, dan trek voiceover cepat.',
    examplePrompt:
      'Hasilkan audio ucapan dari teks menggunakan API dari OpenAI dengan suara bawaan.',
  },
  'stitch-loop': {
    description:
      'Loop umpan balik desain-ke-kode yang iteratif. Siklus kritik → sesuaikan → rilis untuk mempererat fidelitas visual antara brief dan UI yang dibangun.',
    examplePrompt:
      'Loop umpan balik desain-ke-kode yang iteratif.',
  },
  'stitch-design-taste': {
    description:
      'Skill Semantic Design System untuk Google Stitch. Menghasilkan file DESIGN.md yang ramah agen yang menerapkan standar UI premium dan anti-generik — tipografi ketat, warna terkalibrasi, tata letak asimetris, mikro-gerakan berkelanjutan, dan performa berakselerasi perangkat keras.',
    examplePrompt:
      'Hasilkan DESIGN.md yang ramah agen untuk produk ini dengan standar UI premium anti-generik, tipografi, warna, tata letak, gerakan, dan panduan prompt.',
  },
  'swiftui-design': {
    description:
      'Skill 前端设计 SwiftUI — aturan anti AI-slop, penasihat arah desain, protokol aset merek, dan tinjauan lima dimensi. Bekerja dengan Claude Code, Cursor, Codex, dan OpenCode.',
    examplePrompt:
      'Skill 前端设计 SwiftUI — aturan anti AI-slop, penasihat arah desain, protokol aset merek, dan tinjauan lima dimensi.',
  },
  'swiss-creative-mode-template': {
    description:
      'Skill template presentasi mode kreatif terinspirasi Swiss dengan tipografi\neditorial yang berani, kartu geometris kontras tinggi, navigasi slide interaktif,\npergantian tema, overlay hotspot, dan koreografi palet dalam satu artefak\nHTML berkas tunggal. Gunakan saat pengguna meminta landing bergaya presentasi premium,\ntampilan dek Swiss/brutalis, atau halaman peluncuran kreatif dengan interaksi kaya.',
    examplePrompt:
      'Skill template presentasi mode kreatif terinspirasi Swiss dengan tipografi editorial yang berani, kartu geometris kontras tinggi, navigasi slide interaktif, pergantian tema, overlay hotspot, dan koreografi palet dalam satu artefak HTML berkas tunggal.',
  },
  'swiss-user-research-video-template': {
    description:
      'Template narasi riset pengguna bergaya Swiss dengan estetika editorial warm-paper.\nGunakan saat pengguna meminta dek riset premium atau artefak live yang mengutamakan cerita dengan\ntipografi minimalis, tata letak berkejelasan tinggi, gerakan halus, rincian donut,\ndan navigasi keyboard/klik antar slide dalam satu file HTML.',
    examplePrompt:
      'Buat dek sintesis riset pengguna bergaya Swiss dengan tipografi minimalis premium, nuansa warm paper, rincian donut partisipan, dan interaksi editorial yang halus.',
  },
  'design-taste-frontend': {
    description:
      'Skill frontend anti-slop untuk landing page, portofolio, dan desain ulang. Agen membaca brief, menyimpulkan arah desain yang tepat, dan merilis antarmuka yang tidak terlihat seperti template. Design system nyata bila relevan, mengaudit lebih dulu pada desain ulang, pemeriksaan pra-terbang yang ketat.',
    examplePrompt:
      'Buat landing page premium yang mengikuti design-taste-frontend: simpulkan pembacaan desain, atur parameternya, hindari pola AI-slop, dan keluarkan artefak HTML responsif yang rapi.',
  },
  'design-taste-frontend-v1': {
    description:
      'Skill rasa v1 orisinal, dipertahankan untuk proyek yang bergantung pada perilaku persisnya. Default saat ini adalah `design-taste-frontend` (v2 eksperimental), yang merupakan penulisan ulang substansial. Gunakan nama instalasi v1 ini hanya jika Anda memerlukan kompatibilitas mundur yang persis.',
    examplePrompt:
      'Buat halaman pemasaran yang rapi menggunakan design-taste-frontend-v1 dengan tipografi, spasi, gerakan yang kuat, dan pengaman anti-slop.',
  },
  'theme-factory': {
    description:
      'Terapkan tema font dan warna profesional pada artefak termasuk slide, dokumen, laporan, dan landing page HTML. Menyediakan 10 tema preset.',
    examplePrompt:
      'Terapkan tema font dan warna profesional pada artefak termasuk slide, dokumen, laporan, dan landing page HTML.',
  },
  'threejs': {
    description:
      'Skill Three.js untuk membuat elemen 3D dan pengalaman interaktif di browser — scene, material, kontrol, dan post-processing.',
    examplePrompt:
      'Skill Three.js untuk membuat elemen 3D dan pengalaman interaktif di browser — scene, material, kontrol, dan post-processing.',
  },
  'ui-skills': {
    description:
      'Batasan yang opinionated dan terus berkembang untuk memandu agen saat membangun antarmuka. Berguna untuk menjaga keluaran tetap koheren di banyak bagian UI kecil.',
    examplePrompt:
      'Batasan yang opinionated dan terus berkembang untuk memandu agen saat membangun antarmuka.',
  },
  'ui-ux-pro-max': {
    description:
      'Entri UI/UX Pro Max khusus katalog. Template, data, dan alur kerja pencarian upstream lengkap tidak disertakan dalam Open Design.',
    examplePrompt:
      'Entri UI/UX Pro Max khusus katalog.',
  },
  'venice-audio-music': {
    description:
      'Endpoint antrean, pengambilan, dan penyelesaian pembuatan musik melalui Venice.ai. Cocok untuk jingle, loop latar, dan scoring prototipe.',
    examplePrompt:
      'Endpoint antrean, pengambilan, dan penyelesaian pembuatan musik melalui Venice.ai.',
  },
  'venice-audio-speech': {
    description:
      'Model text-to-speech, suara, format, dan streaming melalui Venice.ai. Berguna untuk narasi, voiceover, dan suara agen percakapan.',
    examplePrompt:
      'Model text-to-speech, suara, format, dan streaming melalui Venice.ai.',
  },
  'venice-image-edit': {
    description:
      'Pengeditan gambar, upscaling, dan penghapusan latar belakang melalui API Venice.ai.',
    examplePrompt:
      'Pengeditan gambar, upscaling, dan penghapusan latar belakang melalui API Venice.ai.',
  },
  'venice-image-generate': {
    description:
      'Endpoint pembuatan gambar dan gaya yang tersedia melalui API Venice.ai.',
    examplePrompt:
      'Endpoint pembuatan gambar dan gaya yang tersedia melalui API Venice.ai.',
  },
  'venice-video': {
    description:
      'Alur kerja pembuatan video dan transkripsi melalui API Venice.ai.',
    examplePrompt:
      'Alur kerja pembuatan video dan transkripsi melalui API Venice.ai.',
  },
  'vfx-text-cursor': {
    description:
      'Jejak cahaya kursor, sinar kromatik, dan flare terarah untuk pemunculan kutipan kata demi kata pada intro video.',
    examplePrompt:
      'Gunakan template VFX Text Cursor untuk mengubah konten saya menjadi pemunculan kutipan intro video dengan jejak cahaya kursor, sinar kromatik, dan flare terarah. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'video-downloader': {
    description:
      'Unduh video dari YouTube dan platform lain untuk ditonton offline, diedit, atau diarsipkan dengan dukungan berbagai format dan opsi kualitas.',
    examplePrompt:
      'Unduh video dari YouTube dan platform lain untuk ditonton offline, diedit, atau diarsipkan dengan dukungan berbagai format dan opsi kualitas.',
  },
  'video-hyperframes': {
    description:
      'Animasi frame berkelanjutan yang kompatibel dengan HyperFrames / Remotion dengan dukungan autoplay.',
    examplePrompt:
      'Gunakan template HyperFrames Video untuk mengubah konten saya menjadi animasi frame berkelanjutan yang kompatibel dengan HyperFrames / Remotion dengan dukungan autoplay. Pertahankan ciri visual template, gunakan konten dan data nyata, serta hindari lorem ipsum atau gambar placeholder.',
  },
  'web-artifacts-builder': {
    description:
      'Bangun artifact HTML claude.ai yang kompleks dengan React dan Tailwind. Alur kerja rujukan Anthropic untuk merilis artifact yang kaya dan dapat disematkan.',
    examplePrompt:
      'Bangun artifact HTML claude.ai yang kompleks dengan React dan Tailwind.',
  },
  'web-design-guidelines': {
    description:
      'Pedoman dan standar desain web oleh tim engineering Vercel. Mencakup tata letak, tipografi, warna, motion, dan aksesibilitas untuk UI produk.',
    examplePrompt:
      'Pedoman dan standar desain web oleh tim engineering Vercel.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Template video HyperFrames terinspirasi WeRead untuk laporan membaca tahunan vertikal,\ndashboard membaca pribadi, ringkasan catatan buku, dan cerita year-in-review\nyang dapat dibagikan. Gunakan saat pengguna menginginkan laporan membaca HTML-ke-MP4 9:16 dengan tekstur kertas\nhangat, tipografi Tionghoa editorial, metafora halaman buku, sorotan data,\ndan motion deterministik.',
    examplePrompt:
      'Buat video laporan membaca tahunan HyperFrames 9:16 bergaya WeRead dengan 12 scene, tekstur kertas hangat, transisi halaman buku, statistik membaca, catatan, kata kunci, dan kartu persona membaca di akhir.',
  },
  'wpds': {
    description:
      'WordPress Design System. Terapkan token desain, tipografi, dan pola komponen resmi WordPress pada tema dan situs.',
    examplePrompt:
      'WordPress Design System.',
  },
  'youtube-clipper': {
    description:
      'Pembuatan dan pengeditan klip YouTube dengan alur kerja otomatis — ambil video sumber, potong sorotan, tambahkan caption, dan ekspor.',
    examplePrompt:
      'Pembuatan dan pengeditan klip YouTube dengan alur kerja otomatis — ambil video sumber, potong sorotan, tambahkan caption, dan ekspor.',
  },
};

export const ID_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Antarmuka yang mengutamakan AI percakapan dengan kontrol minimal, hasil yang jelas, dan alur tugas terdelegasi untuk alur kerja agentic.',
  'airbnb': 'Marketplace perjalanan. Aksen coral hangat, berbasis fotografi, UI membulat.',
  'airtable': 'Hibrida spreadsheet-database. Estetika data yang berwarna, ramah, dan terstruktur.',
  'ant': 'Sistem desain terstruktur yang berfokus pada enterprise dengan menekankan kejelasan, konsistensi, dan efisiensi untuk aplikasi web yang padat data.',
  'apple': 'Elektronik konsumen. White space premium, SF Pro, citra sinematik.',
  'application': 'Dashboard aplikasi dengan estetika bertema ungu, navigasi top-bar, tata letak berbasis kartu, dan alur kerja yang mengutamakan developer.',
  'arc': '"Peramban yang menjelajah untuk Anda." Permukaan tembus pandang, kehangatan gradien, tata letak yang mengutamakan sidebar.',
  'artistic': 'Gaya berkontras tinggi dan ekspresif dengan tipografi kreatif dan pilihan warna berani untuk antarmuka yang memukau secara visual.',
  'atelier-zero': 'Sistem visual berkualitas majalah berbasis kolase: kanvas kertas hangat, citra\nplester-dan-arsitektur surealis, tipe display berukuran besar, garis tipis,\npenanda bagian angka Romawi, dan anotasi editorial kecil.\nTerinspirasi oleh produksi v',
  'bento': 'Tata letak grid modular dengan blok mirip kartu, hierarki yang jelas, spasi lembut, dan kontras visual halus untuk antarmuka yang teratur dan mudah dipindai.',
  'binance': 'Bursa kripto. Aksen kuning tebal di atas monokrom, urgensi lantai perdagangan.',
  'bmw': 'Otomotif mewah. Permukaan premium gelap, estetika rekayasa Jerman yang presisi.',
  'bmw-m': 'Sub-merek performa motorsport. Permukaan kokpit nyaris hitam, aksen tiga warna BMW M, geometri rekayasa yang tajam.',
  'bold': 'Kehadiran visual yang kuat dengan tipografi berbobot, warna kontras tinggi, dan tata letak yang berwibawa.',
  'brutalism': 'Estetika mentah, anti-desain yang terinspirasi arsitektur beton dengan elemen tanpa hiasan, tata letak yang mengejutkan, dan minimalisme fungsional.',
  'bugatti': 'Merek hypercar. Kanvas hitam sinematik, kesederhanaan monokrom, tipe display yang monumental.',
  'cafe': 'Antarmuka bernuansa kafe yang nyaman dengan nada hangat, tipografi lembut, dan tata letak bersih untuk pengalaman menjelajah yang santai.',
  'cal': 'Penjadwalan open-source. UI netral yang bersih, kesederhanaan berorientasi pengembang.',
  'canva': 'Platform kreasi visual. Gradien ungu-biru yang cerah, spasi yang lega, geometri yang ramah.',
  'cisco': 'Merek infrastruktur enterprise. Permukaan gelap yang menumbuhkan kepercayaan, sinyal Cisco Blue, kejelasan teknis.',
  'claude': 'Asisten AI dari Anthropic. Aksen terakota hangat, tata letak editorial yang bersih.',
  'clay': 'Agensi kreatif. Bentuk organik, gradien lembut, tata letak yang diarahkan secara artistik.',
  'claymorphism': 'Bentuk 3D lembut dan membulat yang menyerupai tanah liat lentur dengan elemen ceria menggembung dan permukaan penuh warna.',
  'clean': 'Desain yang berfokus pada kesederhanaan dengan ruang kosong yang luas, tipografi yang mudah dibaca, dan palet warna terbatas untuk mengurangi kekacauan visual.',
  'clickhouse': 'Basis data analitik cepat. Bergaya dokumentasi teknis dengan aksen kuning.',
  'cohere': 'Platform AI enterprise. Gradien yang hidup, estetika dasbor yang kaya data.',
  'coinbase': 'Bursa kripto. Identitas biru yang bersih, berfokus pada kepercayaan, bernuansa institusional.',
  'colorful': 'Palet dan gradien yang hidup serta kontras tinggi untuk pengalaman pengguna yang menarik, berkesan, dan modern.',
  'composio': 'Platform integrasi alat. Gelap modern dengan ikon integrasi yang penuh warna.',
  'contemporary': 'Desain minimalis era kini dengan grid bento, dukungan mode gelap, dan tata letak yang aksesibel dan berkinerja tinggi.',
  'corporate': 'Desain profesional yang selaras dengan merek, menggunakan grid terstruktur, tata letak minimalis, dan pola enterprise yang konsisten.',
  'cosmic': 'Estetika sci-fi futuristik dengan tema gelap, aksen neon yang hidup, dan elemen spasial yang imersif.',
  'creative': 'Desain ceria yang berpusat pada karakter dengan tipografi ekspresif dan grafis berani untuk halaman landing dan proyek kreatif.',
  'cursor': 'Editor kode yang mengutamakan AI. Antarmuka gelap yang ramping, aksen gradien.',
  'dashboard': 'Estetika platform cloud bertema gelap dengan grid modular, panel bergaya kaca, dan hierarki data yang kuat untuk dasbor produktivitas.',
  'default': 'Default yang bersih dan berorientasi produk untuk alat B2B, dasbor, dan halaman utilitas.',
  'discord': 'Platform suara / obrolan. Blurple yang dalam, permukaan yang mengutamakan gelap, momen aksen yang ceria.',
  'dithered': 'Teknik render pola titik yang mensimulasikan gradasi dengan palet terbatas untuk visual nostalgik, retro, dan kontras tinggi.',
  'doodle': 'Gaya seperti sketsa gambar tangan dengan coretan, font tulisan tangan, dan garis tidak sempurna untuk kesan ceria dan informal.',
  'dramatic': 'Desain teatrikal kontras tinggi dengan tata letak berani, visual imersif, dan komposisi tak lazim yang menarik perhatian.',
  'duolingo': 'Platform pembelajaran bahasa. Hijau burung hantu yang cerah, bayangan tebal, kegembiraan ala game.',
  'editorial': 'Tata letak editorial bernuansa majalah dengan tipografi serif yang halus, grid terstruktur, dan pengalaman membaca yang elegan.',
  'elegant': 'Estetika anggun dan halus dengan tipografi yang lembut, palet minimal, dan tata letak yang rapi memancarkan kecanggihan.',
  'elevenlabs': 'Platform suara AI. UI sinematik gelap, estetika gelombang audio.',
  'energetic': 'Gaya dinamis dan hidup dengan border tebal, bentuk geometris, warna kontras tinggi, dan tipografi ekspresif yang menyampaikan gerak dan vitalitas.',
  'enterprise': 'Desain enterprise yang bersih dan kontras tinggi untuk alur kerja berbasis data dengan pola drag-and-drop yang intuitif dan tata letak terstruktur.',
  'expo': 'Platform React Native. Tema gelap, jarak antarhuruf yang rapat, berpusat pada kode.',
  'expressive': 'Desain hidup yang berkarakter dengan warna berani, grafis ceria, dan tata letak dinamis yang menyeimbangkan kreativitas dengan struktur.',
  'fantasy': 'Estetika fantasi bernuansa game dengan visual berani dan premium, palet warna yang kaya, dan elemen tematik yang imersif.',
  'ferrari': 'Otomotif mewah. Editorial chiaroscuro, aksen Ferrari Red, hitam sinematik.',
  'figma': 'Alat desain kolaboratif. Multi-warna yang cerah, menyenangkan namun profesional.',
  'flat': 'Gaya minimalis dua dimensi dengan warna cerah, tipografi bersih, dan tanpa efek 3D untuk antarmuka yang cepat dan ramah pengguna.',
  'framer': 'Pembuat situs web. Hitam dan biru yang berani, mengutamakan gerakan, berorientasi desain.',
  'friendly': 'Desain yang mudah didekati dan intuitif dengan elemen membulat, ruang kosong yang luas, dan palet warna pastel yang lembut.',
  'futuristic': 'Desain berwawasan ke depan dengan tipografi bernuansa teknologi, tata letak modern, dan estetika ramping yang digerakkan oleh inovasi.',
  'github': 'Platform yang mengutamakan kode. Kepadatan fungsional, presisi biru di atas putih, fondasi Primer.',
  'glassmorphism': 'Efek kaca buram dengan lapisan tembus pandang, blur halus, dan tepi bercahaya untuk kedalaman dan keanggunan modern.',
  'gradient': 'Transisi warna yang mulus dan permukaan kaya gradien untuk antarmuka modern dan menyenangkan dengan kedalaman visual.',
  'hashicorp': 'Otomatisasi infrastruktur. Bersih khas enterprise, hitam dan putih.',
  'hud': 'Tampilan head-up display jet tempur / helikopter. Hijau fosfor di atas nyaris hitam, hamparan data huruf kapital semua, geometri bersudut. Tanpa ambiguitas pada kecepatan dan ketinggian.',
  'huggingface': 'Pusat komunitas ML. Aksen kuning cerah, identitas monospace, ceria dan padat.',
  'ibm': 'Teknologi enterprise. Carbon design system, palet biru yang terstruktur.',
  'intercom': 'Perpesanan pelanggan. Palet biru yang ramah, pola UI percakapan.',
  'kami': 'Sistem kertas editorial: kanvas perkamen hangat, aksen biru tinta, hierarki yang dipimpin serif. Dibuat untuk resume, one-pager, white paper, portofolio, dek slide — apa pun yang seharusnya terasa seperti cetakan berkualitas tinggi alih-alih UI. Multibahasa secara de',
  'kraken': 'Trading kripto. UI gelap beraksen ungu, dasbor padat data.',
  'lamborghini': 'Merek supercar. Permukaan hitam sejati, aksen emas, tipografi huruf kapital yang dramatis.',
  'levels': 'Desain yang berfokus pada konversi yang menghilangkan hambatan dan mengarahkan pengguna menuju aksi melalui kejelasan, kepercayaan, dan kecepatan.',
  'linear-app': 'Manajemen proyek. Ultra-minimal, presisi, aksen ungu.',
  'lingo': 'Desain yang menyenangkan dan minimal dengan warna cerah, bentuk membulat, tepi 3D yang taktil, dan ilustrasi ramah untuk antarmuka yang mudah didekati.',
  'loom': 'Video asinkron Loom. Ungu sebagai warna utama, permukaan ramah, tata letak yang mengutamakan video. Bersih dan profesional tanpa terkesan korporat.',
  'lovable': 'Pembuat full-stack AI. Gradien yang menyenangkan, estetika dev yang ramah.',
  'luxury': 'Estetika gelap kelas atas dengan judul yang berani, palet monokromatik, dan nuansa premium untuk pengalaman merek mewah.',
  'mastercard': 'Jaringan pembayaran global. Kanvas krem hangat, bentuk pil orbital, kehangatan editorial.',
  'material': 'Material Design dari Google dengan permukaan berlapis, tema dinamis, gerakan bawaan, dan pola responsif lintas platform.',
  'meta': 'Toko ritel teknologi. Mengutamakan fotografi, permukaan terang/gelap biner, CTA Meta Blue.',
  'minimal': 'Desain yang disederhanakan menekankan ruang kosong, tipografi bersih, dan warna yang terkendali untuk kejelasan dan fokus maksimal.',
  'minimax': 'Penyedia model AI. Antarmuka gelap yang berani dengan aksen neon.',
  'mintlify': 'Platform dokumentasi. Bersih, beraksen hijau, dioptimalkan untuk membaca.',
  'miro': 'Kolaborasi visual. Aksen kuning cerah, estetika kanvas tak terbatas.',
  'mission-control': 'Pemantauan misi luar angkasa/aerospace. Pusat komando gelap, telemetri ambar, presisi monospace. Kejelasan fungsional di atas segalanya.',
  'mistral-ai': 'Penyedia LLM open-weight. Minimalisme rekayasa Prancis, bernuansa ungu.',
  'modern': 'Gaya editorial kontemporer dengan tipografi serif, palet minimal, dan tata letak bersih untuk produk digital yang berkilau.',
  'mongodb': 'Basis data dokumen. Branding daun hijau, fokus pada dokumentasi developer.',
  'mono': 'Desain bernuansa matrix yang digerakkan monospace dengan elemen kontras tinggi, kepadatan ringkas, dan estetika hacker-chic.',
  'neobrutalism': 'Tafsir modern atas brutalisme dengan tepi yang berani, warna aksen yang hidup, dan tata letak mentah berkontras tinggi pada permukaan hangat.',
  'neon': 'Efek cahaya neon elektrik dengan pasangan warna kontras tinggi untuk antarmuka yang berani dan menarik perhatian.',
  'neumorphism': 'Elemen UI yang lembut dan menonjol dengan bayangan dalam dan luar pada permukaan monokromatik untuk tampilan taktil yang menyatu.',
  'nike': 'Ritel atletik. UI monokrom, huruf kapital besar, fotografi full-bleed.',
  'notion': 'Ruang kerja serba bisa. Minimalisme hangat, judul serif, permukaan lembut.',
  'nvidia': 'Komputasi GPU. Energi hijau-hitam, estetika kekuatan teknis.',
  'ollama': 'Jalankan LLM secara lokal. Mengutamakan terminal, kesederhanaan monokrom.',
  'openai': 'Sistem tenang nyaris monokrom yang berlandaskan teal-hitam pekat dengan ruang putih yang lapang dan tipografi editorial.',
  'opencode-ai': 'Platform coding AI. Tema gelap yang berpusat pada developer.',
  'pacman': 'Desain bergaya arcade retro dengan font piksel, garis tepi titik-titik, warna kontras tinggi yang playful, dan estetika game 8-bit.',
  'paper': 'Desain bertekstur kertas bergaya cetak dengan warna minimal, tipografi serif/sans yang bersih, dan kualitas permukaan yang taktil.',
  'perplexity': 'Mesin pencari AI percakapan. Kanvas gelap pekat, tipografi tajam, satu aksen violet, hierarki informasi yang padat.',
  'perspective': 'Desain kedalaman spasial dengan tampilan isometrik, titik hilang, dan elemen berlapis yang mengarahkan perhatian melalui realisme menyerupai 3D.',
  'pinterest': 'Penemuan visual. Aksen merah, grid masonry, mengutamakan gambar.',
  'playstation': 'Ritel konsol game. Tata letak kanal tiga permukaan, jenis huruf display berwibawa tenang, hover-scale cyan.',
  'posthog': 'Analitik produk. Branding landak yang playful, UI gelap yang ramah developer.',
  'premium': 'Estetika premium bergaya Apple dengan spasi presisi, tipografi modern, dan bahasa visual yang halus dan terpoles.',
  'professional': 'Desain terpoles dan siap bisnis dengan tipografi modern, tata letak terstruktur, dan identitas visual yang terpercaya.',
  'publication': 'Bahasa visual bergaya cetak untuk buku, majalah, dan laporan dengan grid editorial dan tipografi ekspresif.',
  'raycast': 'Launcher produktivitas. Chrome gelap yang ramping, aksen gradien yang cerah.',
  'refined': 'Gaya minimal modern yang dikurasi dengan cermat dengan tipografi serif yang elegan serta palet yang halus dan canggih.',
  'renault': 'Otomotif Prancis. Gradien aurora yang cerah, tipografi NouvelR, energi yang berani.',
  'replicate': 'Jalankan model ML melalui API. Kanvas putih yang bersih, mengutamakan kode.',
  'resend': 'API email. Tema gelap minimal, aksen monospace.',
  'retro': 'Desain nostalgia dengan tipografi bergaya vintage, palet retro kontras tinggi, dan elemen visual yang membangkitkan kenangan.',
  'revolut': 'Perbankan digital. Antarmuka gelap yang ramping, kartu gradien, presisi fintech.',
  'runwayml': 'Pembuatan video AI. UI gelap sinematik, tata letak kaya media.',
  'sanity': 'CMS headless. Aksen merah, tata letak editorial yang mengutamakan konten.',
  'sentry': 'Pemantauan eror. Dashboard gelap, padat data, aksen pink-ungu.',
  'shadcn': 'Desain bergaya Shadcn/ui dengan komponen minimal yang bersih, palet monokrom, dan pola utility-first.',
  'shopify': 'Platform e-commerce. Sinematik mengutamakan gelap, aksen hijau neon, jenis huruf ultra-tipis.',
  'simple': 'Desain lugas tanpa hiasan dengan tipografi yang bersih, warna netral, dan tata letak intuitif yang tidak mengganggu.',
  'skeumorphism': 'Tiruan dunia nyata dengan permukaan bertekstur, efek 3D, dan metafora fisik yang familiar untuk antarmuka digital yang intuitif.',
  'slack': 'Platform komunikasi kerja. Aubergine sebagai warna utama, palet logo multi-aksen, permukaan terang dengan sidebar gelap, hangat dan mudah didekati.',
  'sleek': 'Estetika minimalis modern dengan garis bersih, palet warna yang disengaja, interaksi halus, dan spasi yang konsisten.',
  'spacex': 'Teknologi luar angkasa. Hitam dan putih yang tegas, citra full-bleed, futuristik.',
  'spacious': 'Ruang putih yang lapang, padding yang konsisten, dan tata letak berbasis grid untuk antarmuka yang bersih, terbaca, dan lega.',
  'spotify': 'Streaming musik. Hijau cerah di atas gelap, jenis huruf yang berani, digerakkan oleh sampul album.',
  'starbucks': 'Merek ritel kopi global. Sistem hijau empat tingkat, kanvas krem hangat, tombol full-pill.',
  'storytelling': 'Desain berbasis narasi yang menggunakan visual, teks, dan interaksi untuk memandu pengguna melalui perjalanan yang menarik dan beresonansi secara emosional.',
  'stripe': 'Infrastruktur pembayaran. Gradien ungu khas, keanggunan weight-300.',
  'supabase': 'Alternatif Firebase open-source. Tema emerald gelap, mengutamakan kode.',
  'superhuman': 'Klien email cepat. UI gelap premium, mengutamakan keyboard, glow ungu.',
  'tesla': 'Otomotif listrik. Pengurangan radikal, fotografi full-viewport, UI nyaris nihil.',
  'tetris': 'Desain bergaya game balok klasik dengan warna playful, font display yang berani, dan tata letak ringkas berenergi tinggi.',
  'theverge': 'Media editorial teknologi. Aksen acid-mint dan ultraviolet, display Manuka, tile cerita bergaya flyer rave.',
  'together-ai': 'Infrastruktur AI sumber terbuka. Desain teknis bergaya cetak biru.',
  'totality-festival': 'Sistem gelap glassmorphic yang kosmik-premium, menangkap keajaiban mendalam dari gerhana matahari — permukaan obsidian, sorotan "corona" amber, dan aksen atmosferik cyan.',
  'trading-terminal': 'Terminal perdagangan finansial bergaya Bloomberg. Hanya gelap, padat data, sinyal beli/jual cyan/coral. Semuanya terbaca sekilas dari jarak dua meter.',
  'uber': 'Platform mobilitas. Hitam putih tegas, tipografi rapat, energi urban.',
  'urdu': 'Pengalaman digital yang mengutamakan bahasa Urdu dengan dukungan RTL native, tipografi Nastaliq, dan keselarasan dwibahasa.',
  'vercel': 'Deployment frontend. Presisi hitam putih, font Geist.',
  'vibrant': 'Desain yang hidup dan berwarna dengan tipografi yang tegas dan ceria, aksen hangat, serta energi visual yang dinamis.',
  'vintage': 'Nostalgia era 1950-an hingga 1990-an dengan sentuhan skeuomorfik, tekstur berbutir, palet warna retro, dan tipografi bergaya piksel.',
  'vodafone': 'Merek telekomunikasi global. Tampilan huruf kapital monumental, pita bab Vodafone Red.',
  'voltagent': 'Framework AI agent. Kanvas hitam pekat, aksen emerald, native terminal.',
  'warm-editorial': 'Estetika majalah yang dipimpin serif. Aksen terracotta di atas kertas off-white hangat —\ncocok untuk konten panjang, editorial, dan halaman pemasaran yang dipimpin merek.',
  'warp': 'Terminal modern. Antarmuka mirip IDE gelap, UI perintah berbasis blok.',
  'webex': 'Platform kolaborasi. Tipografi Momentum, sistem aksi biru, spektrum aksen multi-pengguna.',
  'webflow': 'Pembangun web visual. Beraksen biru, estetika situs pemasaran yang halus.',
  'wechat': 'Bahasa visual merek untuk WeChat Mini Programs, akun resmi, dan ekstensi ekosistem terbuka.',
  'wired': 'Majalah teknologi. Kepadatan broadsheet putih kertas, tampilan serif kustom, kicker mono, tautan ink-blue.',
  'wise': 'Transfer uang. Aksen hijau cerah, ramah dan jelas.',
  'x-ai': 'Lab AI milik Elon Musk. Monokrom tegas, minimalisme futuristik.',
  'xiaohongshu': 'Platform sosial UGC gaya hidup. Merah merek tunggal, radius longgar, mengutamakan konten.',
  'zapier': 'Platform otomatisasi. Oranye hangat, ramah dan digerakkan ilustrasi.',
};

export const ID_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI & LLM',
  'Automotive': 'Otomotif',
  'Backend & Data': 'Backend & Data',
  'Bold & Expressive': 'Tegas & Ekspresif',
  'Creative & Artistic': 'Kreatif & Artistik',
  'Design & Creative': 'Desain & Kreatif',
  'Developer Tools': 'Alat Pengembang',
  'E-Commerce & Retail': 'E-Commerce & Ritel',
  'Editorial & Print': 'Editorial & Cetak',
  'Editorial / Personal / Publication': 'Editorial / Personal / Publikasi',
  'Editorial · Studio': 'Editorial · Studio',
  'Fintech & Crypto': 'Fintech & Crypto',
  'Layout & Structure': 'Tata Letak & Struktur',
  'Media & Consumer': 'Media & Konsumen',
  'Modern & Minimal': 'Modern & Minimal',
  'Morphism & Effects': 'Morfisme & Efek',
  'Productivity & SaaS': 'Produktivitas & SaaS',
  'Professional & Corporate': 'Profesional & Korporat',
  'Retro & Nostalgic': 'Retro & Nostalgia',
  'Social & Messaging': 'Sosial & Perpesanan',
  'Starter': 'Pemula',
  'Themed & Unique': 'Bertema & Unik',
};

export const ID_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Periklanan',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'Desain Aplikasi / Web',
  'Branding': 'Branding',
  'Cinematic': 'Sinematik',
  'Data': 'Data',
  'Game UI': 'UI Game',
  'General': 'Umum',
  'Illustration': 'Ilustrasi',
  'Infographic': 'Infografis',
  'Live Artifact': 'Live Artifact',
  'Marketing': 'Pemasaran',
  'Motion Graphics': 'Motion Graphics',
  'Product': 'Produk',
  'Profile / Avatar': 'Profil / Avatar',
  'Short Form': 'Bentuk Pendek',
  'Social / Meme': 'Sosial / Meme',
  'Social Media Post': 'Postingan Media Sosial',
  'Travel': 'Perjalanan',
  'VFX / Fantasy': 'VFX / Fantasi',
  'VFX / HTML-in-Canvas': 'VFX / HTML-in-Canvas',
};

export const ID_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': '3d-render',
  'action': 'action',
  'ancient-china': 'ancient-china',
  'anime': 'anime',
  'app-showcase': 'app-showcase',
  'archery': 'archery',
  'arpg': 'arpg',
  'audio-reactive': 'audio-reactive',
  'boss-fight': 'boss-fight',
  'brand': 'brand',
  'branding': 'branding',
  'captions': 'captions',
  'cavalry': 'cavalry',
  'chart': 'chart',
  'childlike': 'childlike',
  'choreography': 'koreografi',
  'cinematic': 'sinematik',
  'cinematic-romance': 'romansa-sinematik',
  'combat': 'pertempuran',
  'combo': 'kombo',
  'companion-to-image': 'pendamping-ke-gambar',
  'counter': 'penghitung',
  'crayon': 'krayon',
  'cyberpunk': 'cyberpunk',
  'dance': 'tarian',
  'dashboard': 'dasbor',
  'data': 'data',
  'data-viz': 'visualisasi-data',
  'destruction': 'penghancuran',
  'displacement': 'perpindahan',
  'editorial': 'editorial',
  'elden-ring': 'elden-ring',
  'endcard': 'kartu-penutup',
  'escort': 'pengawalan',
  'escort-mission': 'misi-pengawalan',
  'fantasy': 'fantasi',
  'fashion': 'mode',
  'fighting-game': 'game-pertarungan',
  'food': 'makanan',
  'game-cinematic': 'sinematik-game',
  'game-ui': 'ui-game',
  'grid-sheet': 'lembar-grid',
  'guanyu': 'guanyu',
  'hand-drawn': 'gambar-tangan',
  'hero': 'hero',
  'html-in-canvas': 'html-dalam-canvas',
  'hud': 'hud',
  'hud-safe': 'aman-hud',
  'hype': 'hype',
  'hyperframes': 'hyperframes',
  'idol': 'idola',
  'illustration': 'ilustrasi',
  'image-to-image': 'gambar-ke-gambar',
  'infographic': 'infografik',
  'iphone': 'iphone',
  'japanese': 'jepang',
  'karaoke': 'karaoke',
  'key-visual': 'visual-utama',
  'keynote': 'keynote',
  'kinetic-typography': 'tipografi-kinetik',
  'linear-style': 'gaya-linear',
  'liquid': 'cair',
  'liquid-glass': 'kaca-cair',
  'live-artifact': 'artefak-langsung',
  'logo': 'logo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'magnetik',
  'map': 'peta',
  'marketing': 'pemasaran',
  'minimal': 'minimal',
  'mmo': 'mmo',
  'mobile': 'seluler',
  'money': 'uang',
  'mounted-combat': 'pertarungan-berkuda',
  'nature': 'alam',
  'open-world': 'dunia-terbuka',
  'otaku-dance': 'tarian-otaku',
  'outro': 'penutup',
  'overlay': 'hamparan',
  'particles': 'partikel',
  'pipeline': 'alur-kerja',
  'portal': 'portal',
  'portrait': 'potret',
  'pose-reference': 'referensi-pose',
  'product': 'produk',
  'product-demo': 'demo-produk',
  'product-promo': 'promo-produk',
  'rework': 'olah-ulang',
  'route': 'rute',
  'saas': 'saas',
  'sequence': 'sekuens',
  'shader': 'shader',
  'shatter': 'pecah',
  'sizzle': 'sizzle',
  'social': 'sosial',
  'storyboard': 'storyboard',
  'street-fighter': 'street-fighter',
  'style-transfer': 'style-transfer',
  'tekken': 'tekken',
  'text': 'teks',
  'three-kingdoms': 'three-kingdoms',
  'tiktok': 'tiktok',
  'title-card': 'title-card',
  'transform': 'transformasi',
  'travel': 'perjalanan',
  'tts': 'tts',
  'typography': 'tipografi',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'vertikal',
  'video-reference': 'video-reference',
  'vs-screen': 'vs-screen',
  'webgl': 'webgl',
  'website-to-video': 'website-to-video',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const ID_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infografis Evolusi Tangga Batu 3D',
    summary:
      'Mengubah lini masa evolusi yang datar menjadi infografis tangga batu 3D yang realistis dengan render organisme yang detail dan panel samping yang terstruktur.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Ilustrasi Pertarungan Bela Diri Anime',
    summary:
      'Menghasilkan ilustrasi anime yang dinamis dan berdampak tinggi tentang dua karakter perempuan yang bertarung di dojo tradisional dengan efek energi elemental.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Mockup UI Live Stream E-commerce',
    summary:
      'Menghasilkan antarmuka live stream media sosial realistis yang menumpang di atas potret, menampilkan pesan obrolan yang dapat disesuaikan, popup hadiah, dan kartu pembelian produk.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Game Screenshot - Anime Fighting Game: Captain Ryuuga vs Kaze Renshin',
    summary:
      'Key visual / screenshot pertarungan dalam game dengan gaya seni intro Street Fighter 6 atau Tekken 8. Dua petarung pria bergaya anime berhadapan di tengah halaman kuil Tiongkok yang dramatis pada malam hari — seorang bajak laut bertopi jerami tanpa baju dengan aura api oranye-merah hangat di kiri, dan seorang petarung bela diri berambut runcing dengan gi oranye yang mengisi bola energi petir biru raksasa yang berderak di kanan. Dilengkapi dengan HUD fighting-game lengkap (bilah kesehatan ganda, penghitung waktu ronde, panel potret P1/P2 dengan nama petarung dan lambang, penghitung combo per sisi dan max gauge). Gradasi warna terbelah oranye-hangat vs biru-sejuk sesuai dengan konvensi petarung-rival pada genre ini. Disetel untuk gpt-image-2 pada rasio 16:9.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Game Screenshot - Three Kingdoms ARPG: Guan Yu Membunuh Yan Liang',
    summary:
      'Screenshot action-RPG dalam game dari adegan ikonik Three Kingdoms di mana Guan Yu mengendarai kuda perang Red Hare-nya menembus medan perang yang diguyur hujan deras dan menyerbu ke arah jenderal musuh Yan Liang. Dirender dalam gaya fotorealistis sinematik Black Myth: Wukong, Unreal Engine 5, kamera tracking orang ketiga dari belakang-kiri sang pahlawan yang menunggang kuda. HUD pertarungan bos lengkap (potret, minimap dengan titik musuh yang padat, hotbar skill dengan prompt finisher, bilah HP bos yang mengambang di atas jenderal musuh) mengubah adegan ini menjadi momen pertarungan ARPG AAA. Disetel untuk gpt-image-2 pada rasio 16:9.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Game Screenshot - Three Kingdoms ARPG: Panahan Yuanmen Lü Bu',
    summary:
      'Screenshot action-RPG dalam game dari adegan terkenal Three Kingdoms di mana Lü Bu memanah jatuh sebuah tombak halberd yang jauh di gerbang kamp untuk menghentikan pertempuran. Dirender dalam gaya fotorealistis sinematik Black Myth: Wukong, Unreal Engine 5 Nanite/Lumen, kamera gameplay orang ketiga over-the-shoulder. Overlay HUD dalam game lengkap (bilah HP + qi, minimap, hotbar skill, penanda target lock-on dengan pembacaan jarak ke halberd yang jauh) membuatnya terbaca sebagai tangkapan ARPG next-gen yang nyata, bukan cutscene. Disetel untuk gpt-image-2 pada rasio 16:9.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Game Screenshot - Three Kingdoms ARPG: Pelarian Zhao Yun Membawa Bayi di Changbanpo',
    summary:
      'Screenshot action-RPG dalam game dari adegan legendaris Three Kingdoms di mana Zhao Yun mendekap bayi Liu Chan di satu lengan dan bertarung menembus barisan musuh dengan tombak di lengan lainnya di Changbanpo. Dirender dalam gaya fotorealistis sinematik Black Myth: Wukong yang dipadukan dengan Elden Ring, Unreal Engine 5 dengan Nanite penuh, ray-tracing Lumen, dan god-ray volumetrik. Inti emosional — satu lengan melindungi bayi yang dibedong, satu lengan bertarung demi nyawa — diperkuat oleh overlay HUD lengkap termasuk bilah perlindungan ESCORT khusus untuk sang bayi, penghitung combo, dan popup angka-kerusakan di udara pada musuh yang terlempar. Disetel untuk gpt-image-2 pada rasio 16:9.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Game UI - HUD MMO Open-World Tiongkok Kuno',
    summary:
      'Menghasilkan mockup screenshot HUD dalam game untuk MMO open-world Tiongkok kuno AAA, dalam gaya fotorealistis sinematik Black Myth: Wukong. Seorang protagonis pendekar pedang wanita yang cantik menjadi jangkar di tengah bingkai dalam adegan kuil kuno pegunungan berkabut, dikelilingi HUD MMO lengkap: potret karakter di kiri-atas dengan bilah HP/MP/stamina dan ikon buff, hotbar skill di tengah-bawah dengan ikon skill kaligrafi Tiongkok, minimap di kanan-atas dengan penanda misi, panel pelacak misi di sisi kanan, jendela obrolan bergulir di kiri-bawah, nameplate NPC dalam ruang dunia yang mengambang dan tanda seru misi. Dirender sebagai screenshot monitor yang realistis, 16:9, cocok untuk pitch deck, key art bergaya gamescom, dan teaser game Xiaohongshu/bilibili.',
  },
  'illustrated-city-food-map': {
    title: 'Peta Kuliner Kota Berilustrasi',
    summary:
      'Menghasilkan peta wisata bergaya cat air yang digambar tangan, menampilkan kuliner khas lokal bernomor, landmark, dan legenda.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Ilustrasi - Penggarapan Ulang Gambar Anak dengan Krayon',
    summary:
      'Prompt style-transfer yang mengubah gambar referensi apa pun (foto produk, screenshot, potret, mockup UI) menjadi ilustrasi krayon gambar tangan yang terasa seperti dibuat oleh anak berusia 10 tahun. Mengganti palet aslinya dengan warna krayon cerah dan jenaka di atas kertas putih bersih, serta menaburkan keluguan kekanak-kanakan — istana, permen, bintang, awan, pelangi — untuk memperkuat nuansa buku cerita yang polos. Berfungsi sebagai edit image-to-image di GPT-image-2 (memerlukan unggahan gambar referensi bersama prompt); sangat cocok untuk screenshot situs web, key art merek, foto produk, dan potret.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infografis - Penjabaran Koreografi Tarian Otaku (Gokuraku Jodo, 16 Panel)',
    summary:
      'Sebuah poster vertikal tunggal 2:3 yang disusun sebagai grid 4×4 dari 16 panel persegi yang saling terhubung, membentuk bagan penjabaran koreografi lengkap untuk lagu tarian otaku Jepang terkenal 極楽浄土 (Gokuraku Jodo). Setiap panel menampilkan gadis idol anime setengah realistis yang imut dan sama (twin-tail merah muda, seragam school-idol berkerah pelaut) yang memperagakan satu pose khas dari tarian itu, seluruh tubuh, dengan latar belakang merah muda pastel, strip keterangan Jepang kecil di bagian bawah, dan lingkaran bernomor di kiri atas. Secara eksplisit dirancang sebagai lembar REFERENSI POSE untuk pembuatan video AI — setiap siluet tajam dan tidak ambigu, tanpa garis gerak atau kekacauan latar belakang. Disetel untuk gpt-image-2, rasio 2:3. Kategori: Infografis.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Slide Penjelasan Momotaro dengan Gaya Hibrida',
    summary:
      'Sebuah prompt yang memadukan estetika sederhana dan hangat dari ilustrasi Irasutoya dengan kepadatan informasi tinggi yang menjadi ciri khas slide pemerintah Jepang.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Dashboard Tim Bergaya Notion (Live Artifact)',
    summary:
      'Mockup dashboard tim layar tunggal yang native ala Notion — grid KPI, sparkline 7 hari, feed aktivitas, dan tabel tugas berbasis database tertaut. Pendamping visual untuk skill live-artifact; padukan dengannya untuk run yang dapat di-refresh / didukung konektor, atau gunakan secara mandiri sebagai mockup statis.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / Avatar - Gadis Anime ke Foto Sinematik',
    summary:
      'Prompt ini mengubah ilustrasi referensi karakter menjadi potret interior vintage yang realistis dengan nuansa hangat, sambil mempertahankan busana, pose, dan kucing aslinya.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / Avatar - Pemotretan Grid Fashion Kasual',
    summary:
      'Sebuah prompt JSON terstruktur untuk kolase 4 foto pemotretan fashion kasual dengan parameter subjek dan pencahayaan yang terperinci.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / Avatar - Potret Sinematik Pria Asia Selatan dengan Burung Nasar',
    summary:
      'Potret sinematik terperinci seorang pria muda Asia Selatan dalam latar fantasi gelap yang murung, dikelilingi burung nasar dan burung gagak.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / Avatar - Potret Anime Cyberpunk dengan Teks Neon di Wajah',
    summary:
      'Potret anime bergaya yang dibanjiri neon untuk poster, karya seni media sosial, atau visual branding futuristik.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / Avatar - Gadis Fantasi Elegan di Taman Ungu',
    summary:
      'Prompt ini menghasilkan potret fantasi bergaya anime yang halus dengan seorang wanita elegan berambut tertata mengilap, pakaian ungu-hitam yang ornamental, dan latar taman ajaib penuh bunga, ideal untuk karakter',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / Avatar - Potret Fantasi Eteris Berambut Biru',
    summary:
      'Prompt ini menghasilkan potret karakter fantasi bergaya anime yang lembut dan bercahaya, ideal untuk membuat key art vertikal yang elegan atau ilustrasi karakter dengan rambut terurai dan atmosfer musim semi yang seperti mimpi.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / Avatar - Potret Wanita Memukau Berbusana Hitam',
    summary:
      'Prompt ini menghasilkan potret bergaya mewah yang fotorealistis dari seorang wanita elegan dalam busana hitam berbelahan rendah, ideal untuk editorial fashion atau citra kecantikan.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / Avatar - Prompt Tekstur Selfie Hiper-Realistis',
    summary:
      'Potongan prompt terperinci untuk menghasilkan tekstur kulit yang realistis dan framing selfie ponsel yang autentik, dengan fokus pada pori-pori yang terlihat dan pencahayaan alami.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / Avatar - Potret Penyihir Fantasi Lavender',
    summary:
      'Prompt ini menghasilkan potret fantasi bergaya anime yang halus dari seorang putri penyihir elegan dengan rambut pirang mengilap, bunga ungu, dan busana kristal yang ornamental, ideal untuk karya seni karakter atau ilustrasi ajaib',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / Avatar - Potret Studio Monokrom',
    summary:
      'Sebuah prompt fotografi komersial kelas atas untuk potret monokrom dengan latar belakang terbelah yang khas dan pencahayaan studio yang dramatis.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / Avatar - Restorasi Foto Lama menjadi Potret DSLR',
    summary:
      'Prompt ini merestorasi foto keluarga vintage 4 orang yang rusak menjadi potret realistis yang bersih, berwarna, dan beresolusi tinggi untuk perbaikan serta peningkatan foto.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / Avatar - Potret Wanita Puitis di Taman',
    summary:
      'Prompt ini menghasilkan potret bergaya editorial yang realistis dari seorang wanita muda kutu buku di taman yang disinari matahari, ideal untuk fotografi gaya hidup, branding literer, atau citra karakter yang elegan.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / Avatar - Wallpaper Potret Identitas Profesional',
    summary:
      'Menghasilkan wallpaper premium beresolusi tinggi yang menampilkan subjek berbusana profesional dengan aktivitas terkait karier dan tipografi.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / Avatar - Selfie AI yang Realistis Tak Sempurna',
    summary:
      'Sebuah prompt kreatif yang digunakan dengan GPT Image 2 untuk menghasilkan selfie \'gagal\' yang terlihat seperti jepretan smartphone tak sengaja berkualitas rendah.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / Avatar - Potret Marker Bertanda Tangan di Shikishi',
    summary:
      'Ini menghasilkan potret bergaya marker bertanda tangan yang hidup di atas papan shikishi persegi, berguna untuk tanda tangan fan-art, postingan ilustrasi peringatan, dan visual ucapan terima kasih yang dipersonalisasi.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / Avatar - Potret Permaisuri Kelinci Salju',
    summary:
      'Sebuah prompt potret fantasi realistis untuk menghasilkan seorang wanita bertema kelinci yang anggun dalam hanfu musim dingin yang ornamental, berdiri di latar kuil pegunungan bersalju.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / Avatar - Potret Hanfu Topeng Kelinci Salju',
    summary:
      'Prompt ini menghasilkan potret fantasi musim dingin yang sinematik dari seorang wanita bertopeng dengan Hanfu putih bertema kelinci, ideal untuk seni karakter elegan dan citra showcase AI yang penuh atmosfer.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / Avatar - Potret Hanfu Kelinci Bersalju',
    summary:
      'Prompt ini menghasilkan potret kecantikan fantasi yang sangat detail dari seorang wanita bertelinga kelinci dengan hanfu bersulam, ideal untuk seni karakter elegan, desain kostum, atau showcase potret AI yang sinematik.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / Avatar - Potret Roh Kelinci Bersalju',
    summary:
      'Prompt ini menghasilkan potret fantasi yang tenang dari seorang wanita anonim bertelinga kelinci di musim dingin, ideal untuk seni karakter penuh atmosfer dan ilustrasi profil bergaya.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / Avatar - Potret Hanfu Dinasti Song',
    summary:
      'Prompt yang dioptimalkan untuk menghasilkan potret yang detail dan realistis dari seorang wanita cantik dengan Hanfu tradisional Dinasti Song di dalam halaman kuno.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Postingan Media Sosial - Poster Teaser Pakaian Toko Pokémon Bergaya Anime',
    summary:
      'Prompt ini menghasilkan poster pengumuman fashion anime dengan pastel lembut yang menampilkan seorang gadis berwajah buram dalam gaun biru di dalam toko Pokémon, ideal untuk teaser peluncuran pakaian dan visual promo karakter.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Postingan Media Sosial - Adegan Lift Sinematik',
    summary:
      'Prompt untuk menghasilkan adegan sinematik yang penuh suasana dari seorang wanita di dalam lift metalik dengan pencahayaan dan pantulan yang realistis.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Postingan Media Sosial - Gadis Elf Kebingungan di Meja Pastel',
    summary:
      'Prompt ini menghasilkan ilustrasi anime pastel lembut dari seorang gadis elf yang mengetik di komputernya di ruang kerja kawaii yang nyaman, ideal untuk postingan sosial, wallpaper, atau seni bertema streamer.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Postingan Media Sosial - Fotografi Fashion Editorial',
    summary:
      'Prompt berfokus pada fashion yang penuh suasana untuk adegan studio minimalis dengan pencahayaan lembut dan nada hangat.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Postingan Media Sosial - Kolase Editorial Fashion',
    summary:
      'Prompt kolase foto 2x2 yang sangat detail untuk bidikan editorial fashion, berfokus pada penataan yang konsisten, pencahayaan spesifik, dan fitur wajah dari foto referensi.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Postingan Media Sosial - Poster Pengumuman Transfer PSG',
    summary:
      'Poster penandatanganan sepak bola yang tegas dan profesional untuk mengumumkan kepindahan seorang pemain ke Paris Saint-Germain di media sosial atau grafik promo olahraga.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Postingan Media Sosial - Storyboard Tarian Gadis Sensasional (8 Bidikan)',
    summary:
      'Satu set prompt storyboard lengkap 8 bidikan untuk menghasilkan urutan tarian frame demi frame yang koheren dari karakter yang stylish. Mencakup token gaya global bersama, prompt negatif yang dapat digunakan ulang, dan delapan prompt per bidikan (pose pembuka, gerakan pinggul, gelombang tubuh, putaran pinggang saat beat-drop, ayunan pinggul ke samping, lemparan rambut, pose kuat, pose penutup). Disetel untuk model tingkat GPT-Image-2: kosakata ringkas, tanpa frasa sensitif, bahasa pembingkaian dan pencahayaan yang konsisten di seluruh bidikan sehingga frame terasa seperti satu koreografi yang berkesinambungan.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Postingan Media Sosial - Sampul Majalah Budaya Retro Hari Showa',
    summary:
      'Halaman fitur liburan Jepang bergaya editorial yang hangat yang memadukan seni karakter anime, citra jalanan nostalgia era Showa, dan tata letak informasi bergaya majalah untuk promosi budaya musiman.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Postingan Media Sosial - Pembuatan Pakaian Fashion Media Sosial',
    summary:
      'Prompt untuk menghasilkan rekomendasi pakaian bergaya fashion blogger selama seminggu berdasarkan profil karakter, lengkap dengan label item dan harga.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Postingan Media Sosial - Prompt Kolase Cuplikan Perjalanan',
    summary:
      'Prompt detail untuk membuat kolase nostalgia 12 frame dari foto perjalanan bergaya smartphone yang menggambarkan perjalanan solo.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Postingan Media Sosial - Sketsa Pelukis Papan Nama Vintage',
    summary:
      'Menghasilkan sketsa marker gambar tangan di atas kertas dengan detail realistis seperti garis grafit dan rembesan tinta, sempurna untuk gaya lettering vintage.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Poster Tampilan Terurai Headset VR',
    summary:
      'Menghasilkan diagram tampilan terurai berteknologi tinggi dari headset VR dengan keterangan komponen yang detail dan teks promosi.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Anak Laki-laki Animasi 3D Merakit Lego',
    summary:
      'Prompt video multi-bidikan bergaya animasi 3D yang menggambarkan seorang anak laki-laki dengan hati-hati merakit potongan Lego di sebuah ruangan, menampilkan efek time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Glow-Up Penyempurnaan Satu Dekade',
    summary:
      'Prompt transformasi untuk Seedance 2.0 yang menampilkan transisi seorang pria dari suasana kasual 2016 ke gaya hidup mewah Dubai 2026 sambil mempertahankan konsistensi karakter.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Penyelamatan Naga Penjaga Kuno',
    summary:
      'Prompt sinematik multi-bidikan yang detail untuk cerita tentang seorang gadis di desa yang diguyur hujan yang diselamatkan oleh naga yang muncul, berfokus pada VFX dan suara atmosferik.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Video FPV Kerajaan India Kuno',
    summary:
      'Prompt sinematik bergaya drone FPV yang bertempo cepat yang menggambarkan kerajaan India mistis dengan kuil-kuil dan hutan.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt transfer animasi dan pelacakan kamera',
    summary:
      'Prompt teknis untuk Seedance 2.0 yang menerapkan referensi gerakan tertentu pada karakter sambil mempertahankan pelacakan kamera yang tetap.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Tarian Transformasi Pakaian Tersinkron dengan Beat',
    summary:
      'Prompt untuk Seedance 2.0 yang mengoordinasikan tarian karakter mengikuti breakdown frame sambil melakukan pergantian pakaian yang tersinkron dengan beat.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Sekuens Motion Graphics Perkenalan Karakter',
    summary:
      'Prompt motion graphics yang kompleks dan bertahap untuk memperkenalkan tim karakter dengan overlay UI dan transisi tertentu, dirancang untuk model Seedance 2.0.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Sekuens Perayaan Ulang Tahun Sinematik',
    summary:
      'Prompt video multi-shot yang sangat detail untuk sekuens ulang tahun, berfokus pada konsistensi karakter dan penceritaan emosional.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Interaksi & Penerbangan Naga Sinematik',
    summary:
      'Prompt bergaya storyboard yang detail untuk video menampilkan interaksi emosional seorang wanita dengan naga, diikuti sekuens penerbangan sinematik.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Tarian Tangan Wanita Asia Timur Sinematik',
    summary:
      'Prompt video sinematik multi-shot yang sangat detail untuk tarian tangan bergaya, menampilkan instruksi berkode waktu untuk pergerakan kamera dan aksi karakter.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Close-up Wajah Emosional Sinematik',
    summary:
      'Prompt teknis yang sangat detail untuk Seedance 2.0 yang berfokus pada tekstur kulit realistis dan serangkaian transisi ekspresi wajah emosional yang kompleks.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Eksplorasi Ahli Biologi Kelautan Sinematik',
    summary:
      'Prompt video sinematik yang detail untuk adegan bawah air menampilkan seorang ahli biologi kelautan menemukan bangkai kapal kuno di terumbu karang.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Podcast Musik dan Teknik Gitar Sinematik',
    summary:
      'Prompt sinematik tingkat lanjut untuk menghasilkan video podcast musik 4K, dengan fokus khusus pada teknik gitar, pinch harmonic, dan estetika studio.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Panduan Navigasi Rute Sinematik',
    summary:
      'Prompt multi-adegan terstruktur yang dirancang untuk Seedance guna membuat video navigasi berjalan yang konsisten, menampilkan karakter pemandu wisata yang berulang dan transisi mulus antar lokasi dunia nyata.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Sekuens Balap Jalanan Sinematik untuk Seedance 2',
    summary:
      'Prompt multi-shot yang detail dirancang untuk Seedance 2 guna menghasilkan sekuens balap jalanan sinematik di malam hari, berfokus pada konsentrasi intens pengemudi, kerja kamera dinamis, dan akselerasi eksplosif, terstruktur',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Sekuens pertarungan vampir di gang sinematik',
    summary:
      'Prompt aksi komprehensif untuk adegan film pendek yang melibatkan pergerakan kamera dinamis dan pertarungan berkecepatan tinggi di gang berlampu neon.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Sekuens Sinematik Fiksi Ilmiah Crimson Horizon',
    summary:
      'Sekuens video sinematik 9-shot yang komprehensif untuk film fiksi ilmiah berjudul \'Crimson Horizon\', merinci segalanya mulai dari peluncuran roket hingga perjumpaan alien yang menyeramkan di Mars.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Naskah Trailer Game Cyberpunk',
    summary:
      'Prompt pembuatan video yang ekstensif untuk trailer game cyberpunk, merinci desain karakter, animasi UI, dan transisi lingkungan dari ruang kosong putih ke favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Satire Kucing Kota Terlarang',
    summary:
      'Prompt komedi gelap yang kompleks untuk Seedance 2.0 menampilkan seekor kucing oranye pejabat dan seekor hyena kaisar dalam latar dinasti Qing yang satiris.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt Video Fantasi Haute Couture Hollywood',
    summary:
      'Prompt pembuatan video multi-adegan yang detail untuk Seedance 2.0, dirancang untuk membuat film Fantasi Haute Couture Hollywood. Prompt ini menentukan gaya, resolusi (8K), engine rendering (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Animasi Karakter Membungkuk',
    summary:
      'Instruksi untuk Seedance 2 guna membuat animasi berjalan di tempat untuk referensi karakter tertentu.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: Demo Produk 3D iPhone + MacBook',
    summary:
      'Demo produk 15 detik di mana iPhone 15 Pro Max dan MacBook Pro GLTF asli melayang di panggung bersih dengan UI aplikasi sungguhan yang dirender langsung di layarnya melalui drawElementImage. Lens flare kaca yang bermorf + turntable 360°. Dibangun di atas catalog block vfx-iphone-device.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: Reveal Teks Kursor Sinematik',
    summary:
      'Reveal teks dramatis 8 detik dengan cahaya kursor, sinar bayangan kromatik, dan pencahayaan terarah di panggung hitam. Tipografi DOM asli di bawah post-processing shader langsung. Dibangun di atas catalog block vfx-text-cursor.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: Outro Pecahan Kaca',
    summary:
      'Outro pecahan HTML 12 detik — halaman produk atau kartu harga asli menahan sejenak, lalu meledak menjadi pecahan kaca yang membiaskan cahaya dengan depth blur dan dispersi kromatik. Dibangun di atas catalog block vfx-shatter. Cocok sebagai end-card setelah komposisi yang lebih panjang.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: Hero Latar Cair',
    summary:
      'Hero berdurasi 12 detik dengan konten HTML mengambang di atas permukaan cairan organik — bidang tersubdivisi dengan perpindahan verteks, dinamika gelombang real-time, DOM yang ditangkap melayang di atasnya dengan tajam dan mudah dibaca. Dibuat dari blok katalog vfx-liquid-background.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Reveal Landing Liquid Glass',
    summary:
      'Reveal liquid-glass voronoi berdurasi 20 detik dari halaman landing produk nyata — DOM ditangkap secara langsung via drawElementImage, dipecah menjadi sel-sel kaca yang membiaskan cahaya, lalu mengendap menjadi hero shot yang bersih. Dibuat dari blok katalog vfx-liquid-glass.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Visualisasi Medan Magnet',
    summary:
      'Visualisasi partikel medan magnet berdurasi 15 detik yang bereaksi terhadap heatmap atau grafik DOM secara langsung — partikel menelusuri garis medan yang membelok di sekitar HTML yang ditangkap, ideal untuk produk ML/data. Dibuat dari blok katalog vfx-magnetic.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Dashboard Reveal Portal',
    summary:
      'Portal dimensional berdurasi 10 detik terbuka ke arah dashboard data langsung — DOM ditangkap secara real-time, limpahan cahaya volumetrik, partikel di tepi portal. Dibuat dari blok katalog vfx-portal. Dirancang untuk hero shot data bergaya keynote.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: Hype Penghitung Uang $0 → $10K (9:16)',
    summary:
      'Klip hype HyperFrames vertikal 1080×1920 berdurasi 6 detik — penghitung bergaya Apple $0 → $10.000 dengan kilatan hijau, ledakan partikel uang, ikon tumpukan uang, judul kicker. Dibuat dari blok katalog HyperFrames `apple-money-count`.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: Showcase Aplikasi 12 Detik — Tiga Ponsel Mengambang',
    summary:
      'Komposisi showcase aplikasi 16:9 berdurasi 12 detik — tiga layar iPhone mengambang melayang di ruang 3D, masing-masing berputar bergiliran untuk menampilkan fitur berbeda, callout label yang tersinkron dengan beat, lockup logo di akhir. Dibuat langsung dari blok katalog HyperFrames `app-showcase`.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: Sizzle Reel Brand 30 Detik',
    summary:
      'Sizzle reel HyperFrames 16:9 berdurasi 30 detik — potongan cepat, tipografi kinetik tersinkron beat, skala reaktif audio pada kata-kata display, transisi shader antara lima adegan, end-card dengan bloom logo. Dimodelkan dari arketipe aisoc-hype dari student kit.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: Promo Produk SaaS 30 Detik (gaya Linear)',
    summary:
      'Komposisi HyperFrames berdurasi 30 detik yang dimodelkan dari film produk bergaya Linear/ClickUp — reveal UI 3D, tipografi kinetik tersinkron beat, screenshot UI beranimasi, end-card dengan outro logo. Dibuat dari blok katalog HF (ui-3d-reveal, app-showcase, logo-outro) ditambah transisi shader antar adegan.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: Outro Logo Sinematik 4 Detik',
    summary:
      'Outro logo 16:9 berdurasi 4 detik — perakitan wordmark sepotong demi sepotong dengan bloom, sapuan shimmer melintasi lockup akhir, overlay grain lembut, CTA satu baris. Dibuat dari blok HyperFrames `logo-outro`, `shimmer-sweep`, dan `grain-overlay`.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: Reveal Produk Minimal 5 Detik',
    summary:
      'Komposisi HyperFrames berdurasi 5 detik untuk reveal produk kelas atas — kanvas gelap, satu aksen hangat tunggal, title card dengan push-in lambat, baris kicker kinetik, gerakan yang terkendali. Agen merender MP4 dari HTML+GSAP via puppeteer; tidak perlu stock footage.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: Tumpukan Overlay Sosial 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      'Komposisi HyperFrames vertikal 1080×1920 berdurasi 15 detik yang menumpuk empat kartu sosial beranimasi di atas loop face-cam — sebuah postingan X, reaksi Reddit, kartu now-playing Spotify, dan CTA follow Instagram di akhir. Setiap kartu adalah blok katalog HyperFrames; koreografinya adalah nilai tambahnya.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: Talking-Head TikTok 9:16 dengan Caption Karaoke',
    summary:
      'Short HyperFrames vertikal 1080×1920 — talking-head bernarasi TTS di atas loop face-cam, dengan caption bergaya karaoke yang tersinkron per kata, lower third beranimasi, dan overlay follow tiktok di akhir. Mencerminkan arketipe may-shorts-19 dari student kit HyperFrames.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Bar-Chart Race Beranimasi (gaya NYT)',
    summary:
      'Infografik data 16:9 berdurasi 12 detik — grafik batang + garis beranimasi dengan reveal kategori bertahap, judul serif bergaya NYT, sumber catatan kaki, label nilai kinetik. Dibuat langsung dari blok katalog HyperFrames `data-chart`.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Peta Penerbangan Bergaya Apple (Asal → Tujuan)',
    summary:
      'Peta rute penerbangan sinematik 16:9 berdurasi 8 detik — zoom medan realistis, pesawat beranimasi meluncur dari asal ke tujuan sepanjang jalur melengkung, kota-kota berlabel, penghitung jarak kinetik. Dibuat langsung dari blok katalog HyperFrames `nyc-paris-flight`, dapat dipakai ulang untuk pasangan kota mana pun.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Pipeline Website-ke-Video (Potongan Marketing 15 Detik)',
    summary:
      'Komposisi HyperFrames 16:9 berdurasi 15 detik yang menangkap website langsung pada tiga ukuran viewport, lalu menganimasikan perpindahan di antaranya dengan pembelahan radial kromatik antar adegan. Mencerminkan arketipe student-kit hyperframes-sizzle di mana situs adalah aset sumbernya.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Adaptasi Live-Action Anime: Duel Pernapasan Air vs. Petir',
    summary:
      'Prompt yang sangat detail berdurasi 15 detik untuk menghasilkan adaptasi live-action dari duel bergaya anime, menampilkan \'Pernapasan Air\' (naga air biru) melawan \'Pernapasan Petir\' (kilat emas). The p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Narasi Sinematik Supercar Mewah',
    summary:
      'Prompt sinematik multi-shot yang sangat detail untuk Seedance 2.0 yang melibatkan seorang pria bergaya, anjing Doberman, dan supercar vintage dalam latar pegunungan berkabut.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Sekuens Storyboard Akademi Sihir',
    summary:
      'Prompt detail bergaya storyboard untuk sekuens sinematik yang menggambarkan seorang gadis ajaib di sebuah akademi, mencakup kedatangan, penemuan kekuatan, dan duel sihir.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Prompt Video Film Pendek Penyembuhan Estetika Pedesaan Modern',
    summary:
      'Prompt detail tiga-shot untuk Seedance 2.0 guna menghasilkan film pendek sinematik yang menyembuhkan dalam gaya Estetika Pedesaan Modern. Prompt ini menentukan gaya (Iklan Sinematik, 4K/8K, Makro Ekstrem, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Animasi Atmosferik Flyer Klub Malam',
    summary:
      'Prompt animasi halus untuk Seedance 2.0 untuk menghidupkan elemen latar dan pencahayaan sambil menjaga subjek tetap terkunci',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Estetika Film Wuxia HK Retro',
    summary:
      'Prompt video multi-bagian yang kompleks untuk menciptakan kembali estetika film Wuxia Hong Kong era 80-90an, menampilkan transformasi karakter dari kucing menjadi manusia dengan bidikan bergaya.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: Film Pendek Romansa Jepang Sinematik 15 Detik',
    summary:
      'Prompt multi-adegan 15 detik yang sangat detail untuk Seedance 2.0, dirancang untuk menghasilkan film pendek cinta murni anak SMA Jepang yang sinematik dan ultra-realistis. Prompt ini menentukan latar adegan (kosong',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: MV Rapper Berusia 80 Tahun',
    summary:
      'Prompt 15 detik yang detail untuk Seedance 2.0 untuk menghasilkan video musik (MV) rap jalanan horizontal 16:9 yang menampilkan seorang wanita berusia 80 tahun. Prompt ini menentukan gaya (nada dingin ungu/biru neon, exp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Instruksi Urutan dan Gerakan untuk Video Seni Bela Diri',
    summary:
      'Prompt video untuk Seedance 2.0 yang menginstruksikan model untuk menganimasikan sebuah urutan berdasarkan lembar karakter, dengan fokus pada gerakan dan langkah tertentu.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Urutan Sihir Cermin Penukar Jiwa',
    summary:
      'Prompt video naratif yang menggambarkan peristiwa pertukaran jiwa ajaib di sebuah cermin, dengan instruksi kamera spesifik dan isyarat emosional untuk setiap segmen.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Jumpscare Roket Pemanggang Roti',
    summary:
      'Prompt untuk bidikan bergaya video rumahan realistis tentang seorang pria tua yang dikejutkan oleh pemanggang roti yang meluncurkan roti seperti roket.',
  },
  'traditional-dance-performance': {
    title: 'Pertunjukan Tari Tradisional',
    summary:
      'Prompt video komprehensif untuk Seedance 2.0 untuk menghasilkan tarian tradisional yang anggun berdasarkan koreografi dan gambar referensi identitas.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Video - Three Kingdoms ARPG - Guan Yu Membunuh Yan Liang (Seedance 2.0)',
    summary:
      'Urutan aksi sinematik in-engine ~10 detik yang menghidupkan template gambar pendamping game-screenshot-three-kingdoms-guanyu-slaying-yanliang. Guan Yu (关羽) menunggang kuda Red Hare-nya langsung menerjang barisan pertempuran musuh, mengangkat Green Dragon Crescent Blade, dan melakukan satu tebasan bersih terhadap jenderal lawan Yan Liang. Disesuaikan untuk Seedance 2.0 — disiplin kamera yang ketat, satu pukulan menentukan, fisika kuda-dan-bilah yang bersih, pencahayaan fotorealistis, sama sekali tanpa darah di layar (pukulan disiratkan oleh kilatan qi emas, bukan oleh darah apa pun). Dirancang sebagai pendamping video langsung untuk template gambar yang cocok sehingga gambar diam dan klip dapat disajikan berpasangan. Gambar referensi: template screenshot Guan Yu membunuh Yan Liang.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Video - Three Kingdoms ARPG - Panahan Yuanmen Lyu Bu (Seedance 2.0)',
    summary:
      'Urutan aksi sinematik in-engine ~10 detik yang menghidupkan template gambar pendamping game-screenshot-three-kingdoms-lyubu-yuanmen-archery. Lyu Bu (吕布) berdiri di tengah perkemahan militer berdebu di antara dua pasukan yang berhadapan, menarik busur panjang berpernis merah, menahan tarikan, lalu melepaskan satu anak panah berisi qi yang bercahaya emas menyusuri lintasan menuju tombak halberd jauh yang tertancap di tanah. Disesuaikan untuk Seedance 2.0 — disiplin kamera yang ketat, satu ketukan menentukan, pembingkaian aman HUD yang tajam, fisika busur/panah yang bersih, gerakan angin + debu + panji, dan gradasi warna in-game-screenshot. Dirancang sebagai pendamping video langsung untuk template gambar yang cocok sehingga gambar diam dan klip dapat disajikan berpasangan. Gambar referensi: template screenshot panahan yuanmen Lyu Bu.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Video - Three Kingdoms ARPG - Pelarian Zhao Yun Membawa Bayi (Seedance 2.0)',
    summary:
      'Urutan aksi sinematik in-engine ~12 detik yang menghidupkan template gambar pendamping game-screenshot-three-kingdoms-zhaoyun-cradle-escape. Zhao Yun (赵云) menunggang kuda perangnya melintasi medan perang Changban yang hancur, menggendong pewaris bayi A Dou di lipatan lengan kirinya dan memegang tombaknya di tangan kanan, menangkis serangan yang datang dengan satu PERFECT DODGE dan melompati kereta perang yang jatuh untuk membuka jalan. Disesuaikan untuk Seedance 2.0 — disiplin kamera yang ketat, satu ketukan berkelanjutan, permainan tombak satu tangan yang meyakinkan, fisika kuda yang bersih, dan sama sekali tanpa bahaya yang terlihat pada bayi. Dirancang sebagai pendamping video langsung untuk template gambar yang cocok sehingga gambar diam dan klip dapat disajikan berpasangan. Gambar referensi: template screenshot pelarian Zhao Yun membawa bayi.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animasi Buaya Bajak Laut Gaya Disney Antik',
    summary:
      'Prompt naratif multi-adegan untuk animasi gaya Disney antik klasik yang menampilkan seekor buaya bajak laut dan burung-burung bajak laut di sebuah kapal.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Koreografi Tari K-pop Viral',
    summary:
      'Prompt detail untuk Seedance 2.0 untuk menganimasikan karakter yang menampilkan tarian berdasarkan referensi storyboard 16 panel.',
  },
  'wasteland-factory-chase': {
    title: 'Pengejaran Pabrik Tanah Tandus',
    summary:
      'Prompt sinematik untuk adegan tanah tandus gurun berkecepatan tinggi yang menampilkan pabrik industri bergerak berkaki dan pengejaran motor pemberontak.',
  },
};
