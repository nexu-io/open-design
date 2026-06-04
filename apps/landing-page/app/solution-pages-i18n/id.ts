import type { SolutionLocaleCopy } from './types';

export const ID: SolutionLocaleCopy = {
  prototype: {
    title: 'Bangun prototipe interaktif dengan Open Design + Claude Code',
    description:
      'Ubah sebuah prompt menjadi prototipe multi-layar yang bisa diklik tanpa keluar dari terminal Anda. Open Design memberi coding agent Anda keterampilan desain, templat, dan sistem desain untuk menghasilkan prototipe nyata yang bisa Anda buka di browser.',
    breadcrumb: 'Prototipe',
    label: 'Kasus penggunaan · Prototipe',
    heading: 'Buat prototipe secepat sebuah prompt',
    lead: 'Jelaskan alur yang ada di benak Anda dan biarkan agent menyusun prototipe nyata yang bisa diklik — banyak layar, gaya bersama, dan interaksi langsung — dirender langsung ke HTML yang bisa Anda buka, bagikan, dan serahkan ke tim teknik.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah tangan menggambar wireframe yang berubah menjadi prototipe aplikasi multi-layar yang bisa diklik',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design adalah lapisan desain untuk coding agent yang sudah Anda pakai. Untuk pembuatan prototipe, itu berarti beranjak dari ide satu paragraf menjadi prototipe bergaya yang bisa dinavigasi dalam satu sesi — tanpa alat desain, tanpa langkah ekspor, tanpa celah serah terima.',
    stepsTitle: 'Cara kerja pembuatan prototipe dengan Open Design',
    steps: [
      {
        title: 'Jelaskan alurnya',
        body: 'Beri tahu agent apa yang Anda bangun dengan bahasa biasa — “alur onboarding dengan layar sambutan, pemilih paket, dan konfirmasi”. Open Design memuat keterampilan prototipe sehingga agent tahu harus menghasilkan layar, bukan satu halaman.',
        imageAlt:
          'Ilustrasi seseorang mengetikkan deskripsi alur aplikasi dengan bahasa biasa ke dalam terminal',
      },
      {
        title: 'Hasilkan layar bergaya',
        body: 'Agent menerapkan sistem desain dan templat prototipe dari Open Design, sehingga setiap layar berbagi tipografi, jarak, dan komponen alih-alih terlihat seperti draf kasar. Anda mendapatkan satu set layar yang koheren, bukan mockup yang terpisah-pisah.',
        imageAlt:
          'Ilustrasi beberapa layar aplikasi muncul secara berurutan, semuanya berbagi satu gaya visual yang konsisten',
      },
      {
        title: 'Sambungkan interaksinya',
        body: 'Tombol bernavigasi, tab beralih, modal terbuka. Prototipe dirender ke HTML mandiri, sehingga berperilaku seperti produk sungguhan di browser mana pun — tanpa perlu akun alat prototipe untuk melihatnya.',
        imageAlt:
          'Ilustrasi kursor mengeklik layar-layar yang tertaut dengan panah yang menunjukkan navigasi di antaranya',
      },
      {
        title: 'Iterasi dan serahkan',
        body: 'Sempurnakan dengan berbicara kepada agent — “ubah pemilih paket menjadi tata letak tiga kolom”. Karena artefaknya hidup di proyek Anda, desain dan kode akhirnya berbagi satu sumber kebenaran, menutup celah serah terima dari desainer ke insinyur yang biasa terjadi.',
        imageAlt:
          'Ilustrasi sebuah prototipe yang direvisi lalu diserahkan kepada seorang insinyur, dengan desain dan kode menyatu menjadi satu berkas',
      },
    ],
    tableTitle: 'Pembuatan prototipe dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Alat prototipe tradisional',
    tableRows: [
      {
        capability: 'Beranjak dari ide ke layar pertama',
        withOd: 'Satu prompt di agent yang sudah Anda buka',
        without: 'Buka alat terpisah, mulai berkas, seret kotak satu per satu',
      },
      {
        capability: 'Banyak layar yang tertaut',
        withOd: 'Dihasilkan sebagai satu set dengan gaya bersama dan navigasi yang berfungsi',
        without: 'Setiap bingkai digambar dan ditautkan secara manual',
      },
      {
        capability: 'Sistem visual yang konsisten',
        withOd: 'Diambil dari sistem desain yang dapat dipakai ulang dan diterapkan agent',
        without: 'Dibuat ulang per berkas atau dipelihara secara manual',
      },
      {
        capability: 'Hasil yang bisa dibagikan',
        withOd: 'HTML mandiri — terbuka di browser mana pun, tanpa akun',
        without: 'Penonton butuh kursi atau tautan berbagi di alat vendor',
      },
      {
        capability: 'Jalur menuju kode nyata',
        withOd: 'Artefak hidup di repo Anda; desain dan kode berbagi satu sumber',
        without: 'Dibangun ulang dari nol setelah serah terima terpisah',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Langganan per kursi, dihosting vendor, ekspor terbatas',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda prototipekan',
    features: [
      {
        title: 'Aplikasi web multi-layar',
        body: 'Alur lengkap dengan navigasi bersama — onboarding, dashboard, pengaturan — bukan halaman tunggal.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Alur aplikasi seluler',
        body: 'Perjalanan seluler layar demi layar dengan transisi dan keadaan yang terasa native.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Halaman arahan',
        body: 'Halaman pemasaran dan landing SaaS yang bisa Anda klik dan rilis.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Selera visual apa pun',
        body: 'Editorial, lembut, atau brutalis — prototipe membawa gaya yang koheren dari awal sampai akhir.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Daftar tunggu dan harga',
        body: 'Permukaan konversi — daftar tunggu, tabel harga — tersambung dan sesuai merek.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Bergaya gim dan playful',
        body: 'Konsep yang sarat interaksi di mana gerak dan keadaan menjadi bagian dari presentasi.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipe yang dibangun orang dengan Open Design',
    galleryLead:
      'Setiap karya ini dimulai sebagai prompt dan dirender menjadi artefak yang bisa diklik. Pilih templat yang dekat dengan ide Anda, jelaskan variasi Anda, dan agent menyesuaikannya.',
    gallery: [
      { thumb: "example-dating-web", caption: "Aplikasi web kencan — alur multi-layar" },
      { thumb: "example-hr-onboarding", caption: "Alur onboarding HR" },
      { thumb: "example-kami-landing", caption: "Halaman arahan produk" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipe web bergaya lembut" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat prototipe',
    faqTitle: 'FAQ pembuatan prototipe',
    faq: [
      {
        q: 'Apakah saya butuh alat desain seperti Figma untuk membuat prototipe dengan Open Design?',
        a: 'Tidak. Open Design berjalan di dalam coding agent Anda dan merender prototipe ke HTML. Anda menjelaskan alur dengan bahasa; agent menghasilkan layar. Tidak ada alat kanvas terpisah untuk dipelajari atau dibayar.',
      },
      {
        q: 'Apakah prototipenya interaktif atau hanya mockup statis?',
        a: 'Interaktif. Navigasi, tab, dan modal berfungsi karena keluarannya adalah HTML dan CSS nyata. Anda bisa mengekliknya di browser mana pun persis seperti yang dilakukan pengguna.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Open Design bekerja dengan Claude Code, Codex, Cursor Agent, Gemini CLI, dan belasan adapter resmi lainnya. Anda membawa kunci penyedia Anda sendiri; tidak ada yang dihosting untuk Anda.',
      },
      {
        q: 'Bisakah sebuah prototipe menjadi produk nyata?',
        a: 'Itulah intinya. Artefak hidup di proyek Anda, sehingga sistem desain dan komponen yang sama terbawa ke kode produksi alih-alih dibuang setelah serah terima.',
      },
    ],
    ctaTitle: 'Prototipekan ide Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah “bagaimana jika” Anda berikutnya menjadi sesuatu yang bisa Anda klik — di agent yang sudah Anda pakai.',
  },
  dashboard: {
    title: 'Hasilkan dashboard data dengan Open Design + Claude Code',
    description:
      'Jelaskan metrik yang Anda lacak dan biarkan coding agent membangun dashboard bergaya dan responsif — grafik, kartu KPI, dan tabel dirender ke HTML yang bisa Anda hosting di mana saja. Tanpa kursi alat BI, tanpa pembangun seret dan lepas.',
    breadcrumb: 'Dashboard',
    label: 'Kasus penggunaan · Dashboard',
    heading: 'Dashboard dari sebuah deskripsi, bukan pembangun seret dan lepas',
    lead: 'Beri tahu agent apa yang harus ditampilkan dan bagaimana seharusnya terasa. Open Design menyediakan pola grafik, sistem tata letak, dan bahasa visual sehingga Anda mendapatkan dashboard yang koheren dan layak presentasi — bukan tembok widget bergaya bawaan.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang angka mentah di kiri yang mengalir menjadi dashboard rapi berisi grafik dan kartu KPI di kanan',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah spesifikasi metrik Anda dalam bahasa biasa menjadi dashboard bergaya yang dirender agent ke HTML — diversikan di repo Anda, bisa dihosting di mana saja, tanpa langganan BI per kursi.',
    stepsTitle: 'Cara kerja dashboard dengan Open Design',
    steps: [
      {
        title: 'Jelaskan metriknya',
        body: 'Sebutkan apa yang penting — “pengguna aktif mingguan, pendapatan per paket, churn, dan tren 30 hari”. Agent memuat keterampilan dashboard sehingga tahu harus menata kartu KPI, grafik, dan tabel alih-alih satu blok teks.',
        imageAlt: 'Ilustrasi seseorang mendaftar metrik yang mereka pedulikan',
      },
      {
        title: 'Pilih pola grafiknya',
        body: 'Open Design menyertakan templat grafik dan tata letak, sehingga tren menjadi grafik garis, rincian menjadi batang, dan rasio menjadi visual yang tepat — tipografi dan jarak yang konsisten di seluruh bagian alih-alih bawaan yang tak serasi.',
        imageAlt: 'Ilustrasi beberapa jenis grafik yang ditata menjadi kisi yang koheren',
      },
      {
        title: 'Sambungkan data Anda',
        body: 'Arahkan dashboard ke sebuah CSV, endpoint JSON, atau tempel baris contoh. Ia dirender ke HTML mandiri yang diperbarui saat datanya berubah — buka di browser mana pun, taruh di hosting statis mana pun.',
        imageAlt: 'Ilustrasi sebuah berkas data tersambung ke dashboard yang diperbarui langsung',
      },
      {
        title: 'Sempurnakan dan rilis',
        body: 'Sesuaikan dengan berbicara kepada agent — “kelompokkan pendapatan menurut wilayah, pindahkan baris KPI ke atas”. Artefak hidup di proyek Anda, sehingga dashboard bisa ditinjau dan diversikan seperti kode lainnya.',
        imageAlt: 'Ilustrasi sebuah dashboard yang disempurnakan lalu di-deploy',
      },
    ],
    tableTitle: 'Dashboard dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Alat BI / dikode manual',
    tableRows: [
      {
        capability: 'Beranjak dari daftar metrik ke tata letak',
        withOd: 'Satu prompt; agent menata kartu, grafik, dan tabel',
        without: 'Seret widget satu per satu, atau tulis kode grafik dari nol',
      },
      {
        capability: 'Sistem visual yang konsisten',
        withOd: 'Pola grafik dan jarak dari sistem desain yang dapat dipakai ulang',
        without: 'Gaya widget bawaan, atau ditata manual per grafik',
      },
      {
        capability: 'Sambungkan data',
        withOd: 'CSV / JSON / baris yang ditempel, dirender ke HTML langsung',
        without: 'Konektor vendor atau pemipaan data khusus',
      },
      {
        capability: 'Hosting dan berbagi',
        withOd: 'HTML mandiri di hosting statis mana pun, tanpa akun',
        without: 'Penonton butuh kursi di vendor BI',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Hidup di repo Anda; bisa di-diff seperti kode',
        without: 'Terkunci di dalam vendor, tanpa diff sungguhan',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Langganan per kursi, dihosting vendor',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda bangun',
    features: [
      { title: "Analitik produk", body: "Pengguna aktif, funnel, retensi — metrik yang menjadi keseharian tim produk.", thumb: "example-dashboard" },
      { title: "Metrik repo dan dev", body: "Bintang, PR, kesehatan CI — dashboard rekayasa dari data Anda sendiri.", thumb: "example-github-dashboard" },
      { title: "Laporan keuangan", body: "Pendapatan, burn, runway ditata sebagai laporan yang bisa dibagikan.", thumb: "example-finance-report" },
      { title: "Operasi langsung", body: "Metrik real-time yang menyegar saat data dasarnya bergerak.", thumb: "example-live-dashboard" },
      { title: "Sosial dan pemasaran", body: "Kinerja kanal dan pelacakan kampanye dalam satu tampilan.", thumb: "example-social-media-dashboard" },
      { title: "Laporan bidang", body: "Laporan terstruktur untuk bidang apa pun — dari klinis hingga trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboard yang dibangun orang dengan Open Design',
    galleryLead:
      'Dashboard nyata yang dirender dari sebuah prompt dan sumber data. Mulai dari yang dekat dengan milik Anda dan jelaskan metrik yang Anda lacak.',
    gallery: [
      { thumb: "example-data-report", caption: "Laporan data" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard operasi langsung" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard analisis trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafik data bergaya editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat dashboard',
    faqTitle: 'FAQ dashboard',
    faq: [
      {
        q: 'Apakah saya butuh alat BI seperti Tableau atau Looker?',
        a: 'Tidak. Open Design merender dashboard ke HTML di dalam coding agent Anda. Anda menjelaskan metrik dan mengarahkannya ke data Anda; tidak ada platform BI terpisah untuk dilisensikan atau dipelajari.',
      },
      {
        q: 'Dari mana datanya berasal?',
        a: 'Sebuah CSV, endpoint JSON, atau baris yang Anda tempel. Dashboard adalah HTML dan JavaScript murni, sehingga Anda mengendalikan persis dari mana ia membaca — tidak ada yang di-proxy lewat layanan terhosting.',
      },
      {
        q: 'Bisakah rekan non-teknis melihatnya?',
        a: 'Ya. Keluarannya adalah halaman web mandiri. Siapa pun dengan tautan atau berkas bisa membukanya di browser — tanpa akun, tanpa kursi.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan belasan adapter resmi lainnya. Anda membawa kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Bangun dashboard Anda malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah metrik Anda menjadi dashboard yang bisa Anda hosting di mana saja — di agent yang sudah Anda pakai.',
  },
  slides: {
    title: 'Hasilkan dek presentasi dengan Open Design + Claude Code',
    description:
      'Ubah sebuah kerangka menjadi dek slide yang dirancang dan sesuai merek tanpa membuka aplikasi presentasi. Open Design memberi coding agent Anda templat dek dan sistem visual, merender slide ke HTML yang bisa Anda presentasikan, ekspor, atau bagikan.',
    breadcrumb: 'Slide',
    label: 'Kasus penggunaan · Slide',
    heading: 'Dek yang terlihat dirancang, ditulis oleh sebuah prompt',
    lead: 'Serahkan kerangka dan nada kepada agent Anda. Open Design menerapkan templat dek dan sistem visual sehingga setiap slide tertata, terketik, dan sesuai merek — bukan daftar poin pada latar kosong.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah kerangka di kiri yang berubah menjadi rangkaian slide presentasi yang dirancang di kanan',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah kerangka menjadi dek HTML yang dirancang dan dirender agent dalam satu sesi — presentasikan di browser, ekspor ke PDF atau PPTX, dan simpan sumbernya di repo Anda.',
    stepsTitle: 'Cara kerja dek dengan Open Design',
    steps: [
      {
        title: 'Beri kerangkanya',
        body: 'Tempel poin pembicaraan Anda atau struktur kasar. Agent memuat keterampilan dek sehingga menghasilkan rangkaian slide yang tertata, bukan satu dokumen panjang.',
        imageAlt: 'Ilustrasi sebuah kerangka teks yang diserahkan kepada agent',
      },
      {
        title: 'Pilih gaya dek',
        body: 'Open Design menyertakan templat dek — editorial, Swiss-internasional, teknis gelap, dan lainnya. Agent menerapkan salah satunya sehingga tipografi, kisi, dan aksen tetap konsisten di setiap slide.',
        imageAlt: 'Ilustrasi beberapa pilihan gaya dek yang ditata berdampingan',
      },
      {
        title: 'Hasilkan slide-nya',
        body: 'Setiap poin menjadi slide yang dirancang dengan hierarki yang tepat — judul, visual pendukung, sorotan data. Ia dirender ke HTML, sehingga dipresentasikan layar penuh di browser mana pun.',
        imageAlt: 'Ilustrasi rangkaian slide jadi dengan gaya yang konsisten',
      },
      {
        title: 'Presentasikan, ekspor, iterasi',
        body: 'Presentasikan dari browser, atau ekspor ke PDF / PPTX untuk dibagikan. Sempurnakan dengan berbicara kepada agent — “rapatkan slide data, tambahkan ajakan bertindak penutup”. Sumber dek tetap di proyek Anda.',
        imageAlt: 'Ilustrasi sebuah dek yang dipresentasikan dan diekspor ke berbagai format',
      },
    ],
    tableTitle: 'Dek dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'PowerPoint / Keynote / alat slide AI',
    tableRows: [
      {
        capability: 'Beranjak dari kerangka ke slide',
        withOd: 'Satu prompt; agent menata setiap slide',
        without: 'Bangun setiap slide manual, atau bergumul dengan templat',
      },
      {
        capability: 'Desain yang konsisten',
        withOd: 'Templat dek dengan kisi dan sistem tipe yang nyata',
        without: 'Tema yang melenceng, perataan manual, bawaan tak sesuai merek',
      },
      {
        capability: 'Data dan diagram',
        withOd: 'Grafik dan sorotan dirender sebagai bagian dari slide',
        without: 'Tempel gambar statis atau bangun ulang grafik tiap kali',
      },
      {
        capability: 'Format ekspor',
        withOd: 'HTML untuk presentasi, plus ekspor PDF / PPTX',
        without: 'Terkunci pada format satu aplikasi',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Sumber hidup di repo Anda, bisa di-diff',
        without: 'Berkas biner, tanpa diff yang berarti',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Lisensi aplikasi atau add-on AI per kursi',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda presentasikan',
    features: [
      { title: "Pitch deck", body: "Dek investor dan penjualan dengan narasi kuat dan slide data yang bersih.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / editorial", body: "Dek berbasis kisi dan tipografis yang terlihat diarahkan secara artistik.", thumb: "example-deck-swiss-international" },
      { title: "Modul kursus", body: "Dek pengajaran dengan langkah jelas, sorotan, dan tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Dek grafik data", body: "Dek gelap berfokus grafik untuk analitik dan tinjauan.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Mode presenter", body: "Dek bergaya reveal yang dibangun untuk presentasi langsung di browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Cetak biru teknis", body: "Dek arsitektur dan pengetahuan yang memetakan sistem kompleks.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Dek yang dibangun orang dengan Open Design',
    galleryLead:
      'Dek nyata yang dirender dari sebuah kerangka. Pilih gaya yang dekat dengan presentasi Anda dan jelaskan kontennya.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Dek majalah editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote berilustrasi" },
      { thumb: "example-deck-open-slide-canvas", caption: "Dek open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Dek tema gradien" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat dek',
    faqTitle: 'FAQ slide',
    faq: [
      {
        q: 'Apakah saya butuh PowerPoint atau Keynote?',
        a: 'Tidak. Open Design merender dek ke HTML di dalam coding agent Anda dan bisa mengekspor ke PDF atau PPTX. Anda presentasikan dari browser atau serahkan sebuah berkas — tanpa aplikasi presentasi untuk membangunnya.',
      },
      {
        q: 'Apakah ini hanya poin-poin yang dihasilkan AI?',
        a: 'Tidak. Agent menerapkan templat dek nyata dengan kisi, skala tipe, dan hierarki visual, sehingga slide terlihat dirancang alih-alih terisi otomatis.',
      },
      {
        q: 'Bisakah saya ekspor ke PowerPoint untuk klien?',
        a: 'Ya. Dek diekspor ke PPTX dan PDF selain HTML tempat Anda presentasi, sehingga cocok dengan apa pun yang diharapkan audiens.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Bangun dek Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah kerangka Anda menjadi dek yang dirancang — di agent yang sudah Anda pakai.',
  },
  image: {
    title: 'Hasilkan grafik sesuai merek dengan Open Design + Claude Code',
    description:
      'Buat kartu sosial, sampul artikel, dan grafik pemasaran dari sebuah prompt — ditata dengan tipografi nyata dan sistem merek Anda, dirender ke HTML tajam yang bisa Anda ekspor ke PNG. Tanpa aplikasi desain, tanpa langganan templat.',
    breadcrumb: 'Gambar',
    label: 'Kasus penggunaan · Gambar',
    heading: 'Grafik sesuai merek, dihasilkan dan ditata untuk Anda',
    lead: 'Jelaskan kartu atau sampul yang Anda perlukan. Open Design menyusunnya dengan tipe, kisi, dan warna merek Anda yang nyata — lalu merender ke HTML yang bisa Anda ekspor sebagai gambar, alih-alih bergumul dengan aplikasi desain atau templat generik.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah prompt yang berubah menjadi seperangkat kartu sosial dan sampul artikel yang ditata',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah sebuah prompt menjadi grafik yang terketik dan sesuai merek yang dirender agent ke HTML dan diekspor ke PNG — bisa diulang, diversikan, dan bebas dari alat desain per kursi.',
    stepsTitle: 'Cara kerja grafik dengan Open Design',
    steps: [
      {
        title: 'Jelaskan grafiknya',
        body: 'Sebutkan apa itu — “kartu Twitter untuk peluncuran kami dengan judul dan sebuah kutipan”. Agent memuat keterampilan yang tepat sehingga menyusun grafik yang tertata, bukan blok teks biasa.',
        imageAlt: 'Ilustrasi seseorang menjelaskan kartu sosial yang mereka perlukan',
      },
      {
        title: 'Terapkan sistem merek',
        body: 'Open Design menarik warna, tipe, dan jarak Anda dari sistem desain yang dapat dipakai ulang, sehingga setiap kartu cocok dengan sisa merek Anda alih-alih terlihat seperti sekali pakai.',
        imageAlt: 'Ilustrasi warna merek dan tipe yang diterapkan pada tata letak kartu',
      },
      {
        title: 'Render dan ekspor',
        body: 'Grafik dirender ke HTML pada dimensi persis yang Anda butuhkan — kartu sosial, sampul, banner — lalu diekspor ke PNG. Teks tajam, tata letak nyata, tanpa penggeseran manual.',
        imageAlt: 'Ilustrasi sebuah grafik yang dirender dan diekspor ke berkas gambar',
      },
      {
        title: 'Pakai ulang resepnya',
        body: 'Karena ini sebuah templat, grafik berikutnya hanya berjarak satu prompt — ganti judul, pertahankan tata letak. Rangkaian kartu tetap konsisten sempurna.',
        imageAlt: 'Ilustrasi satu templat kartu yang menghasilkan rangkaian grafik yang konsisten',
      },
    ],
    tableTitle: 'Grafik dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Aplikasi desain / templat generik',
    tableRows: [
      {
        capability: 'Beranjak dari ide ke grafik yang ditata',
        withOd: 'Satu prompt; agent menyusun tipe dan tata letak',
        without: 'Buka aplikasi, tempatkan setiap elemen manual',
      },
      {
        capability: 'Tetap sesuai merek',
        withOd: 'Warna dan tipe dari sistem desain yang dapat dipakai ulang',
        without: 'Pilih ulang gaya merek per berkas, atau melenceng dari merek',
      },
      {
        capability: 'Rangkaian yang konsisten',
        withOd: 'Templat sama, salinan baru — set yang selaras sempurna',
        without: 'Selaraskan setiap varian secara manual',
      },
      {
        capability: 'Ekspor',
        withOd: 'HTML pada dimensi persis, diekspor ke PNG',
        without: 'Pengaturan ukuran kanvas dan ekspor manual',
      },
      {
        capability: 'Bisa diulang',
        withOd: 'Resep yang digerakkan prompt di repo Anda',
        without: 'Berkas sekali pakai yang Anda buat ulang tiap kali',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Alat desain per kursi atau marketplace templat',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda buat',
    features: [
      { title: "Kartu sosial", body: "Kartu X / Twitter disusun dengan judul dan merek Anda.", thumb: "example-card-twitter" },
      { title: "Sampul artikel", body: "Sampul editorial bergaya majalah untuk posting dan newsletter.", thumb: "example-article-magazine" },
      { title: "Kartu Xiaohongshu", body: "Kartu bergaya RedNote yang disetel untuk feed tersebut.", thumb: "example-card-xiaohongshu" },
      { title: "Grafik hero", body: "Visual hero cair bergradien untuk situs dan peluncuran.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Korsel", body: "Korsel sosial multi-slide yang tetap konsisten antar bingkai.", thumb: "example-social-carousel" },
      { title: "Bingkai mockup UI", body: "Bingkai notifikasi dan perangkat untuk bercerita tentang produk.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafik yang dibangun orang dengan Open Design',
    galleryLead:
      'Kartu dan sampul nyata yang dirender dari sebuah prompt. Pilih satu yang dekat dengan kebutuhan Anda dan tukar dengan salinan Anda.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Kartu sosial pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster editorial tiga nada" },
      { thumb: "example-magazine-poster", caption: "Poster bergaya majalah" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Sampul editorial yang tegas" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat grafik',
    faqTitle: 'FAQ gambar',
    faq: [
      {
        q: 'Apakah ini generator gambar AI seperti Midjourney?',
        a: 'Tidak. Open Design menyusun grafik dengan tata letak dan tipografi nyata — judul Anda, merek Anda, dimensi persis — dan merender ke HTML yang Anda ekspor sebagai PNG. Ini komposisi desain, bukan pembuatan piksel.',
      },
      {
        q: 'Bisakah saya membuat rangkaian kartu yang konsisten?',
        a: 'Ya. Karena setiap grafik adalah templat, Anda mempertahankan tata letak dan mengganti salinan, sehingga seluruh rangkaian tetap selaras sempurna dan sesuai merek.',
      },
      {
        q: 'Ukuran apa saja yang bisa dihasilkannya?',
        a: 'Apa saja — grafik dirender pada dimensi persis yang Anda tentukan, dari kartu sosial persegi hingga banner lebar, lalu diekspor ke PNG.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Buat grafik Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah sebuah prompt menjadi grafik sesuai merek — di agent yang sudah Anda pakai.',
  },
  video: {
    title: 'Hasilkan grafik gerak dan video pendek dengan Open Design + Claude Code',
    description:
      'Ubah sebuah naskah menjadi bingkai beranimasi dan video format pendek — kartu judul, latar bergerak, dan outro disusun dengan sistem merek Anda dan dirender dari HTML. Tanpa suite grafik gerak, tanpa menggeser linimasa.',
    breadcrumb: 'Video',
    label: 'Kasus penggunaan · Video',
    heading: 'Grafik gerak dari sebuah naskah, bukan dari linimasa',
    lead: 'Jelaskan momen yang Anda inginkan — sebuah penyingkapan judul, animasi data, outro logo. Open Design menyusun bingkai beranimasi dengan sistem merek Anda dan merendernya ke video, tanpa perlu suite grafik gerak.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah naskah yang berubah menjadi rangkaian bingkai video beranimasi',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah sebuah naskah menjadi bingkai beranimasi yang sesuai merek yang dirender agent ke video format pendek — disusun dari HTML, diversikan di repo Anda, tanpa editor linimasa untuk dipelajari.',
    stepsTitle: 'Cara kerja gerak dengan Open Design',
    steps: [
      {
        title: 'Jelaskan momennya',
        body: 'Sebutkan apa yang harus terjadi — “judul glitch yang berubah menjadi logo kami, lalu kartu penutup”. Agent memuat keterampilan gerak sehingga menghasilkan bingkai beranimasi, bukan gambar statis.',
        imageAlt: 'Ilustrasi seseorang menjelaskan sebuah rangkaian gerak',
      },
      {
        title: 'Terapkan gaya merek dan gerak',
        body: 'Open Design menyediakan templat bingkai — light leak sinematik, judul glitch, outro logo — dan menerapkan warna serta tipe Anda, sehingga geraknya terlihat disengaja dan sesuai merek.',
        imageAlt: 'Ilustrasi gaya merek yang diterapkan pada bingkai beranimasi',
      },
      {
        title: 'Render bingkainya ke video',
        body: 'Bingkai disusun dalam HTML dan dirender ke video, sehingga waktu dan tata letaknya presisi dan dapat diulang — tanpa penyetelan keyframe manual di linimasa.',
        imageAlt: 'Ilustrasi bingkai HTML yang dirender menjadi klip video',
      },
      {
        title: 'Iterasi dan ekspor',
        body: 'Sempurnakan dengan berbicara kepada agent — “perlambat penyingkapan judul, tambahkan teks”. Ekspor klip format pendek untuk sosial atau produk. Sumbernya tetap di proyek Anda.',
        imageAlt: 'Ilustrasi klip video yang disempurnakan dan diekspor untuk sosial',
      },
    ],
    tableTitle: 'Gerak dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'After Effects / suite gerak',
    tableRows: [
      {
        capability: 'Beranjak dari naskah ke bingkai beranimasi',
        withOd: 'Satu prompt; agent menyusun rangkaiannya',
        without: 'Setel keyframe setiap elemen di linimasa secara manual',
      },
      {
        capability: 'Tetap sesuai merek',
        withOd: 'Templat bingkai + warna dan tipe Anda',
        without: 'Bangun ulang gaya merek per proyek',
      },
      {
        capability: 'Waktu presisi dan dapat diulang',
        withOd: 'Disusun dalam HTML, dirender secara deterministik',
        without: 'Penggeseran manual, sulit direproduksi',
      },
      {
        capability: 'Ekspor untuk sosial',
        withOd: 'Klip format pendek dirender ke video',
        without: 'Preset ekspor dan urusan kodek',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Sumber bingkai hidup di repo Anda, bisa di-diff',
        without: 'Berkas proyek biner, tanpa diff sungguhan',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Suite mahal, kurva belajar curam',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda animasikan',
    features: [
      { title: "Hyperframes", body: "Rangkaian gerak bingkai demi bingkai yang disusun dari HTML.", thumb: "example-video-hyperframes" },
      { title: "Format pendek sosial", body: "Klip vertikal yang dibangun untuk feed sosial.", thumb: "example-video-shortform" },
      { title: "Set bingkai gerak", body: "Bingkai beranimasi yang dapat dipakai ulang yang Anda susun menjadi klip.", thumb: "example-motion-frames" },
      { title: "Light leak sinematik", body: "Transisi sinematik dan latar atmosferik.", thumb: "example-frame-light-leak-cinema" },
      { title: "Judul glitch", body: "Penyingkapan judul dengan gerak dan tekstur.", thumb: "example-frame-glitch-title" },
      { title: "Outro logo", body: "Animasi penutup bermerek untuk klip apa pun.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Gerak yang dibangun orang dengan Open Design',
    galleryLead:
      'Bingkai dan klip beranimasi nyata yang dirender dari sebuah prompt. Pilih satu yang dekat dengan ide Anda dan jelaskan geraknya.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Rangkaian hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Latar gerak cair" },
      { thumb: "example-frame-macos-notification", caption: "Bingkai UI beranimasi" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafik data beranimasi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat gerak',
    faqTitle: 'FAQ video',
    faq: [
      {
        q: 'Apakah saya butuh After Effects atau suite grafik gerak?',
        a: 'Tidak. Open Design menyusun bingkai beranimasi dalam HTML dan merendernya ke video di dalam coding agent Anda. Tidak ada editor linimasa untuk dipelajari atau dilisensikan.',
      },
      {
        q: 'Untuk jenis video apa ini cocok?',
        a: 'Gerak format pendek — kartu judul, animasi data, outro logo, klip sosial. Ia dibangun untuk gerak merek dan produk, bukan penyuntingan berdurasi panjang.',
      },
      {
        q: 'Apakah waktunya dapat direproduksi?',
        a: 'Ya. Karena bingkai disusun dalam kode dan dirender secara deterministik, Anda mendapatkan hasil yang sama setiap kali dan bisa menyetelnya dengan presisi lewat sebuah prompt.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Animasikan ide Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah sebuah naskah menjadi gerak — di agent yang sudah Anda pakai.',
  },
  designSystem: {
    title: 'Bangun dan terapkan sistem desain dengan Open Design + Claude Code',
    description:
      'Tangkap merek Anda sebagai sistem desain yang dapat dipakai ulang yang diterapkan coding agent Anda ke setiap artefak — warna, tipe, komponen, dan nada dalam satu DESIGN.md. Definisikan sekali; setiap prototipe, dek, dan dashboard tetap sesuai merek.',
    breadcrumb: 'Sistem Desain',
    label: 'Kasus penggunaan · Sistem Desain',
    heading: 'Satu sistem desain, diterapkan ke semua yang dibuat agent Anda',
    lead: 'Definisikan merek Anda sekali dan Open Design membawanya ke setiap keluaran — prototipe, dek, dashboard, grafik. Sistem hidup di repo Anda sebagai DESIGN.md yang dibaca agent, sehingga konsistensi bersifat otomatis, bukan manual.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah sistem desain tunggal yang memancar menjadi banyak artefak sesuai merek',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design menangkap merek Anda sebagai sistem desain portabel yang diterapkan agent ke setiap artefak — didefinisikan sekali di repo Anda, ditegakkan di mana-mana, tanpa alat desain pusat yang menjaganya.',
    stepsTitle: 'Cara kerja sistem desain dengan Open Design',
    steps: [
      {
        title: 'Tangkap sistemnya',
        body: 'Jelaskan merek Anda — warna, tipe, jarak, suara — atau arahkan agent ke situs yang ada untuk mengekstraknya. Open Design menuliskannya ke dalam DESIGN.md yang hidup di proyek Anda.',
        imageAlt: 'Ilustrasi sebuah merek yang ditangkap ke dalam satu berkas sistem desain',
      },
      {
        title: 'Mulai dari basis yang terbukti',
        body: 'Open Design menyertakan 140+ sistem desain referensi — dari Apple dan Linear hingga editorial dan brutalis. Fork salah satu yang dekat dengan merek Anda alih-alih mulai dari halaman kosong.',
        imageAlt: 'Ilustrasi sebuah galeri sistem desain referensi yang sedang dijelajahi',
      },
      {
        title: 'Terapkan di mana-mana',
        body: 'Setiap keterampilan lain membaca sistem yang sama, sehingga prototipe, dek, dan dashboard semuanya berbagi satu bahasa visual — tanpa Anda menentukannya ulang setiap kali.',
        imageAlt: 'Ilustrasi satu sistem yang diterapkan secara konsisten di banyak jenis artefak',
      },
      {
        title: 'Kembangkan di satu tempat',
        body: 'Ubah sistem dan render berikutnya mencerminkannya di mana-mana. Karena ini berkas di repo Anda, keputusan desain ditinjau dan diversikan seperti kode.',
        imageAlt: 'Ilustrasi sebuah sistem desain yang diperbarui dan menyebar ke semua keluaran',
      },
    ],
    tableTitle: 'Sistem desain dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Pustaka alat desain / panduan gaya',
    tableRows: [
      {
        capability: 'Mendefinisikan sistem',
        withOd: 'DESIGN.md yang dibaca agent, di-fork dari 140+ referensi',
        without: 'Panduan gaya statis atau pustaka yang terikat alat',
      },
      {
        capability: 'Menerapkan lintas jenis artefak',
        withOd: 'Sistem sama memberi makan prototipe, dek, dashboard, grafik',
        without: 'Diimplementasikan ulang per alat dan per berkas',
      },
      {
        capability: 'Menjaga semuanya konsisten',
        withOd: 'Otomatis — setiap keterampilan membaca satu sumber',
        without: 'Disiplin manual; melenceng seiring waktu',
      },
      {
        capability: 'Mengembangkan merek',
        withOd: 'Sunting sekali; render berikutnya diperbarui di mana-mana',
        without: 'Cari dan ganti lintas berkas dan alat',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Hidup di repo Anda, bisa di-diff seperti kode',
        without: 'Terkubur dalam alat desain, sulit diaudit',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, portabel, berjalan lokal',
        without: 'Terkunci pada langganan alat desain',
      },
    ],
    featuresTitle: 'Sistem yang bisa Anda jadikan titik awal',
    features: [
      { title: "Apple", body: "Estetika bersih, terkendali, dengan font sistem.", thumb: "design-system-apple" },
      { title: "Linear", body: "Tampilan alat produk yang tajam dengan jarak rapat.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Lembut, mengutamakan dokumen, mudah didekati.", thumb: "design-system-notion" },
      { title: "Figma", body: "Playful, penuh warna, energi alat kreatif.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, netral, kelas riset.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Padat, teknis, native bagi developer.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistem desain di Open Design',
    galleryLead:
      'Beberapa dari 140+ sistem referensi yang bisa Anda fork sebagai titik awal. Pilih satu yang dekat dengan merek Anda dan sesuaikan.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistem bergaya Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistem bergaya Vercel" },
      { thumb: "design-system-stripe", caption: "Sistem bergaya Stripe" },
      { thumb: "design-system-spotify", caption: "Sistem bergaya Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Jelajahi sistem desain',
    faqTitle: 'FAQ Sistem Desain',
    faq: [
      {
        q: 'Apa sebenarnya sistem desain di sini?',
        a: 'Sebuah berkas DESIGN.md di repo Anda yang menangkap warna, tipe, jarak, komponen, dan suara. Setiap keterampilan Open Design membacanya, sehingga merek Anda diterapkan otomatis ke apa pun yang dihasilkan agent.',
      },
      {
        q: 'Apakah saya harus mulai dari nol?',
        a: 'Tidak. Open Design menyertakan 140+ sistem desain referensi yang bisa Anda fork — dari Apple dan Linear hingga editorial dan brutalis — lalu sesuaikan dengan merek Anda.',
      },
      {
        q: 'Bagaimana ia tetap konsisten lintas dek, dashboard, dan prototipe?',
        a: 'Karena semua keterampilan itu membaca DESIGN.md yang sama. Definisikan sistem sekali dan konsistensi bersifat otomatis alih-alih sesuatu yang Anda awasi manual.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Definisikan sistem desain Anda malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan beri agent Anda satu merek untuk diterapkan di mana-mana — di agent yang sudah Anda pakai.',
  },
  roleSoloBuilder: {
    title: 'Open Design untuk solo builder & indie hacker',
    description:
      'Rilis layaknya satu tim, padahal seorang diri. Open Design mengubah coding agent Anda menjadi separuh sisi desain dari startup Anda — prototipe, halaman arahan, dasbor, dan visual merek, semuanya dari satu prompt, semuanya sesuai merek, semuanya di dalam repo Anda.',
    breadcrumb: 'Solo Builder',
    label: 'Untuk · Solo Builder',
    heading: 'Tim desain Anda adalah agent yang sudah Anda jalankan',
    lead: 'Tanpa desainer, tanpa anggaran, tanpa serah terima. Jelaskan apa yang Anda butuhkan dan agent Anda merendernya — halaman arahan pagi ini, dasbor siang ini, kartu sosial sebelum Anda rilis — semuanya berbagi satu sistem desain yang Anda definisikan sekali.',
    heroImageAlt:
      'Ilustrasi gaya editorial seseorang di meja kerja dikelilingi halaman arahan, sebuah aplikasi, sebuah dasbor, dan kartu sosial, semuanya dalam satu gaya yang konsisten',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design adalah departemen desain yang tidak pernah dimiliki seorang founder tunggal: dari prompt menjadi artefak di setiap permukaan yang dibutuhkan produk Anda, dalam satu merek, tanpa serah terima dan tanpa alat tambahan.',
    stepsTitle: 'Cara solo builder memakai Open Design',
    steps: [
      {
        title: 'Definisikan merek Anda sekali',
        body: 'Tangkap warna, tipografi, dan suara dalam sebuah DESIGN.md (atau fork salah satu dari 140+ sistem rujukan). Setiap artefak yang Anda hasilkan setelahnya otomatis sesuai merek.',
        imageAlt: 'Ilustrasi sebuah berkas definisi merek tunggal',
      },
      {
        title: 'Hasilkan apa pun yang Anda butuhkan berikutnya',
        body: 'Prototipe, halaman arahan, dasbor, dek presentasi, kartu sosial — agent yang sama, merek yang sama, masing-masing satu prompt. Tanpa berganti alat atau membeli kursi tambahan.',
        imageAlt: 'Ilustrasi banyak jenis artefak yang lahir dari satu prompt',
      },
      {
        title: 'Rilis saja — ini sudah nyata',
        body: 'Semuanya dirender menjadi HTML / kode di dalam repo Anda, jadi prototipe menjadi produk dan halaman arahan tayang. Tanpa mockup sekali pakai.',
        imageAlt: 'Ilustrasi sebuah artefak melaju langsung dari prompt ke versi tayang',
      },
    ],
    tableTitle: 'Membangun seorang diri dengan Open Design vs cara yang berat',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Berjuang sendiri saat ini',
    tableRows: [
      { capability: 'Cakup setiap permukaan desain', withOd: 'Satu agent mengerjakan prototipe, halaman arahan, dasbor, merek', without: 'Menjahit lima alat SaaS dan tutorial menjadi satu' },
      { capability: 'Tetap sesuai merek', withOd: 'Satu DESIGN.md diterapkan di mana-mana secara otomatis', without: 'Membuat ulang tampilan di tiap alat, melenceng seiring waktu' },
      { capability: 'Bergerak secepat solo', withOd: 'Dari ide ke artefak dalam satu prompt', without: 'Mempelajari alat desain yang Anda tak punya waktu untuknya' },
      { capability: 'Rilis, bukan mockup', withOd: 'HTML / kode di repo Anda, siap dideploy', without: 'Mockup yang tetap harus dibangun seseorang' },
      { capability: 'Biaya', withOd: 'Sumber terbuka, pakai kunci Anda sendiri, jalan lokal', without: 'Setumpuk langganan per kursi' },
    ],
    featuresTitle: 'Apa yang bisa dirilis seorang solo builder',
    features: [
      { title: 'Halaman arahan', body: 'Halaman arahan pemasaran dan SaaS, dapat diklik dan tayang.', thumb: 'example-saas-landing' },
      { title: 'Prototipe produk', body: 'Aplikasi web multilayar untuk memvalidasi ide.', thumb: 'example-web-prototype' },
      { title: 'Dasbor', body: 'Tampilan metrik dan admin untuk produk Anda.', thumb: 'example-dashboard' },
      { title: 'Grafis merek', body: 'Sampul dan poster yang selaras dengan merek Anda.', thumb: 'example-magazine-poster' },
      { title: 'Alur seluler', body: 'Layar aplikasi saat Anda melangkah di luar web.', thumb: 'example-mobile-app' },
      { title: 'Kartu sosial', body: 'Kartu peluncuran dan pembaruan untuk setiap kanal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Dibangun seorang diri dengan Open Design',
    galleryLead:
      'Setiap permukaan yang dibutuhkan startup satu orang, dari sebuah prompt. Pilih satu yang dekat dengan langkah Anda berikutnya dan jelaskan.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Halaman arahan SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototipe produk' },
      { thumb: 'example-dashboard', caption: 'Dasbor produk' },
      { thumb: 'example-card-twitter', caption: 'Kartu sosial peluncuran' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat',
    faqTitle: 'FAQ solo builder',
    faq: [
      { q: 'Saya bukan desainer — apakah saya benar-benar bisa memakainya?', a: 'Ya. Anda menjelaskan keinginan Anda dengan bahasa sehari-hari; agent menerapkan sistem desain dan merendernya. Keahliannya adalah menulis prompt, bukan menggeser piksel.' },
      { q: 'Apakah mencakup segalanya, atau cuma satu hal?', a: 'Segala yang dibutuhkan produk kecil — prototipe, halaman arahan, dasbor, dek, grafis — dari agent yang sama dan merek yang sama.' },
      { q: 'Keluarannya menjadi apa?', a: 'HTML / kode nyata di repo Anda, jadi prototipe bisa menjadi produk dan halaman arahan bisa tayang, alih-alih mockup yang Anda buang.' },
      { q: 'Agent apa saja yang bisa saya pakai?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.' },
    ],
    ctaTitle: 'Bangun seluruh proyek Anda malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan biarkan satu agent menjadi tim desain Anda — di dalam agent yang sudah Anda pakai.',
  },
  roleDesigner: {
    title: 'Open Design untuk desainer',
    description:
      'Habiskan waktu Anda untuk selera, bukan kerja melelahkan. Open Design membiarkan agent Anda menangani pekerjaan produksi berulang — varian, status, sistem desain lengkap — sementara Anda mengarahkan tampilan dan memegang keputusan akhir.',
    breadcrumb: 'Desainer',
    label: 'Untuk · Desainer',
    heading: 'Arahkan desainnya — biarkan agent yang memproduksi',
    lead: 'Anda menetapkan sistem dan standarnya; agent merender layar, status, varian, komposisi berfidelitas tinggi. Lebih sedikit menggeser persegi, lebih banyak menentukan seperti apa yang bagus itu.',
    heroImageAlt:
      'Ilustrasi gaya editorial seorang desainer yang mengarahkan sementara sebuah agent mengisi layar, varian, dan sebuah sistem desain',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design adalah asisten produksi yang tak pernah lelah: Anda mendefinisikan sistem desain dan menentukan seleranya; agent menghasilkan sisanya, sesuai sistem, di dalam repo Anda.',
    stepsTitle: 'Cara desainer memakai Open Design',
    steps: [
      {
        title: 'Kodekan sistem Anda',
        body: 'Ubah merek Anda menjadi sebuah DESIGN.md — skala tipografi, warna, jarak, komponen, suara. Inilah sumber kebenaran yang dipatuhi agent.',
        imageAlt: 'Ilustrasi sebuah sistem desain yang ditangkap sebagai berkas',
      },
      {
        title: 'Hasilkan ekor panjangnya',
        body: 'Setiap layar, status, dan varian yang biasanya Anda bangun manual — agent merendernya sesuai sistem, jadi 80% bagian membosankan selesai dalam hitungan menit.',
        imageAlt: 'Ilustrasi banyak layar sesuai sistem yang dihasilkan sekaligus',
      },
      {
        title: 'Arahkan dan sempurnakan',
        body: 'Kritik dengan bahasa — “rapatkan jaraknya, buat status kosong terasa lebih hangat.” Anda memegang keputusan akhir; agent menjalankan iterasinya.',
        imageAlt: 'Ilustrasi seorang desainer memberi arahan dan desain ikut diperbarui',
      },
    ],
    tableTitle: 'Mendesain dengan Open Design vs cara manual',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Perkakas desain manual',
    tableRows: [
      { capability: 'Membangun sistem desain', withOd: 'Sebuah DESIGN.md yang diterapkan agent di mana-mana', without: 'Pustaka yang Anda rawat manual di tiap alat' },
      { capability: 'Memproduksi varian & status', withOd: 'Dihasilkan sesuai sistem dari sebuah prompt', without: 'Menggandakan frame dan mengutak-atik satu per satu' },
      { capability: 'Komposisi berfidelitas tinggi', withOd: 'Dirender menjadi HTML nyata, bukan mockup datar', without: 'Kerja piksel yang tetap dibangun ulang oleh teknik' },
      { capability: 'Tetap konsisten', withOd: 'Satu sistem, ditegakkan otomatis', without: 'Disiplin manual; melenceng seiring waktu' },
      { capability: 'Serah terima', withOd: 'Artefaknya adalah kode — tanpa jurang penerjemahan', without: 'Dokumen spesifikasi dan anotasi koreksi' },
    ],
    featuresTitle: 'Apa yang bisa diarahkan seorang desainer',
    features: [
      { title: 'Tata letak editorial', body: 'Komposisi berbasis grid dengan arahan seni.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Sampul artikel', body: 'Sampul dan fitur bergaya majalah.', thumb: 'example-article-magazine' },
      { title: 'Poster', body: 'Poster tipografi berani yang sesuai merek.', thumb: 'example-magazine-poster' },
      { title: 'Set sosial', body: 'Korsel multibingkai yang konsisten.', thumb: 'example-social-carousel' },
      { title: 'Layar aplikasi', body: 'Layar seluler dan web berfidelitas tinggi.', thumb: 'example-mobile-app' },
      { title: 'Dasbor', body: 'Antarmuka data yang menghormati sistem Anda.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Diarahkan dengan Open Design',
    galleryLead:
      'Karya berfidelitas tinggi, sesuai sistem, yang dihasilkan agent dari arahan. Pilih satu yang dekat dengan gaya Anda dan sempurnakan.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Tata letak editorial' },
      { thumb: 'example-article-magazine', caption: 'Sampul majalah' },
      { thumb: 'example-social-carousel', caption: 'Korsel sosial' },
      { thumb: 'example-magazine-poster', caption: 'Poster tipografi' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat',
    faqTitle: 'FAQ desainer',
    faq: [
      { q: 'Apakah ini menggantikan saya?', a: 'Tidak — ini menggantikan kerja melelahkan. Anda menetapkan sistem dan seleranya; agent mengerjakan produksi berulang sehingga Anda menghabiskan waktu untuk keputusan yang hanya bisa Anda buat.' },
      { q: 'Bagaimana saya menjaga kendali atas tampilan?', a: 'DESIGN.md Anda adalah kontraknya. Agent merender di dalamnya, dan Anda mengkritik dengan bahasa hingga tepat.' },
      { q: 'Apakah keluarannya bisa diedit / nyata?', a: 'Ini HTML/CSS nyata, bukan ekspor datar — jadi langsung dibawa ke produksi alih-alih dibangun ulang.' },
      { q: 'Agent apa saja yang bisa saya pakai?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.' },
    ],
    ctaTitle: 'Arahkan desain Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan biarkan agent menangani produksi sementara Anda menentukan seleranya — di dalam agent yang sudah Anda pakai.',
  },
  roleEngineering: {
    title: 'Open Design untuk engineer',
    description:
      'Lewati serah terima desain. Open Design mengubah sebuah DESIGN.md menjadi front-end nyata yang ditulis langsung oleh coding agent Anda — UI sesuai sistem, prototipe, dan dasbor, di dalam repo, tanpa bolak-balik ke Figma.',
    breadcrumb: 'Teknik',
    label: 'Untuk · Teknik',
    heading: 'Dari spesifikasi ke front-end, tanpa serah terima di antaranya',
    lead: 'Arahkan agent Anda ke sebuah DESIGN.md dan sebuah deskripsi; ia menulis kode front-end nyata yang sesuai sistem — komponen, layar, dasbor — langsung di proyek Anda. Tanpa anotasi koreksi, tanpa “menunggu desain.”',
    heroImageAlt:
      'Ilustrasi gaya editorial sebuah DESIGN.md yang mengalir langsung ke kode front-end dan UI yang dirender, melewati langkah serah terima',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design menutup jurang dari desainer ke engineer dengan membuat sistem desain dapat dibaca mesin: agent yang sama yang menulis kode Anda menerapkan sistem dan merender UI nyata.',
    stepsTitle: 'Cara engineer memakai Open Design',
    steps: [
      {
        title: 'Baca sistemnya, bukan anotasi koreksi',
        body: 'DESIGN.md hidup di dalam repo. Agent Anda membacanya sebagaimana ia membaca sisa basis kode — tanpa spesifikasi ekspor untuk ditafsirkan.',
        imageAlt: 'Ilustrasi sebuah agent membaca sebuah DESIGN.md bersanding dengan kode',
      },
      {
        title: 'Hasilkan UI sesuai sistem',
        body: 'Jelaskan layar atau komponennya; agent menulis front-end yang sudah cocok dengan sistem. Prototipe, dasbor admin, alat internal — dalam hitungan menit.',
        imageAlt: 'Ilustrasi kode UI yang dihasilkan agar cocok dengan sebuah sistem desain',
      },
      {
        title: 'Ini sudah kode Anda',
        body: 'Keluarannya adalah HTML / kode framework di repo Anda, dapat ditinjau dalam sebuah PR. Tanpa langkah penerjemahan antara “desain” dan “build.”',
        imageAlt: 'Ilustrasi UI yang dihasilkan mendarat sebagai sebuah PR yang dapat ditinjau',
      },
    ],
    tableTitle: 'Front-end dengan Open Design vs cara serah terima',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Serah terima desain-ke-dev',
    tableRows: [
      { capability: 'Dapatkan desain untuk dibangun', withOd: 'Sebuah DESIGN.md yang dibaca agent Anda langsung', without: 'Berkas Figma yang Anda tafsirkan ulang manual' },
      { capability: 'Cocokkan dengan sistem', withOd: 'Ditegakkan otomatis saat pembuatan', without: 'Mengira-ngira dengan mata terhadap spesifikasi, melenceng menyusup' },
      { capability: 'Bangun alat internal / dasbor', withOd: 'Prompt → front-end sesuai sistem di dalam repo', without: 'Menunggu desainer, lalu membangunnya dua kali' },
      { capability: 'Tinjau', withOd: 'Ini kode — bandingkan diff-nya dalam sebuah PR', without: 'Membandingkan piksel terhadap mockup' },
      { capability: 'Biaya & ketergantungan', withOd: 'Sumber terbuka, di repo Anda, jalan lokal', without: 'Alat desain yang seluruh tim harus melisensikannya' },
    ],
    featuresTitle: 'Apa yang bisa dihasilkan seorang engineer',
    features: [
      { title: 'UI aplikasi web', body: 'Front-end multilayar dari sebuah deskripsi.', thumb: 'example-web-prototype' },
      { title: 'Dasbor dev', body: 'Dasbor repo, CI, dan metrik.', thumb: 'example-github-dashboard' },
      { title: 'Laporan data', body: 'Laporan terstruktur dari data Anda.', thumb: 'example-data-report' },
      { title: 'Dasbor admin', body: 'Alat internal dan tampilan admin.', thumb: 'example-dashboard' },
      { title: 'Halaman arahan', body: 'Halaman pemasaran tanpa menunggu desain.', thumb: 'example-saas-landing' },
      { title: 'Kanban / papan', body: 'Antarmuka alur kerja internal.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Dibangun oleh engineer dengan Open Design',
    galleryLead:
      'Front-end nyata, sesuai sistem, yang dihasilkan langsung di dalam repo. Pilih satu yang dekat dengan yang Anda bangun dan jelaskan.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'UI aplikasi web' },
      { thumb: 'example-github-dashboard', caption: 'Dasbor dev' },
      { thumb: 'example-data-report', caption: 'Laporan data' },
      { thumb: 'example-kanban-board', caption: 'UI papan internal' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat',
    faqTitle: 'FAQ teknik',
    faq: [
      { q: 'Apakah saya masih butuh desainer?', a: 'Untuk merek dan arah, ya. Tapi untuk membangun UI sesuai sistem dan alat internal, agent membaca DESIGN.md dan menulis front-end — tanpa bolak-balik serah terima.' },
      { q: 'Apa keluarannya?', a: 'HTML / kode framework nyata di repo Anda, dapat ditinjau dalam sebuah PR — bukan mockup yang Anda implementasikan ulang.' },
      { q: 'Bagaimana ia tetap sesuai sistem?', a: 'DESIGN.md adalah sumber kebenaran; agent menerapkannya saat pembuatan, jadi keluarannya cocok tanpa pengecekan piksel manual.' },
      { q: 'Agent apa saja yang bisa saya pakai?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.' },
    ],
    ctaTitle: 'Hasilkan UI Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah sebuah DESIGN.md menjadi front-end — di dalam agent yang sudah Anda pakai.',
  },
  roleProductManagers: {
    title: 'Open Design untuk product manager',
    description:
      'Berhenti menunggu kapasitas desain untuk mengomunikasikan sebuah ide. Open Design memungkinkan seorang PM mengubah sebuah prompt menjadi prototipe yang dapat diklik atau wireframe — untuk menyelaraskan pemangku kepentingan dan memberi brief ke tim, tanpa tiket desain.',
    breadcrumb: 'Product Manager',
    label: 'Untuk · Product Manager',
    heading: 'Jadikan idenya dapat diklik sebelum kickoff',
    lead: 'Jelaskan alurnya dan agent Anda merender sebuah prototipe nyata yang dapat diklik, yang bisa Anda taruh di hadapan pemangku kepentingan hari ini — sehingga rapat membahas hal yang sebenarnya, bukan satu paragraf dalam dokumen.',
    heroImageAlt:
      'Ilustrasi gaya editorial seorang PM mengubah ide tertulis menjadi prototipe yang dapat diklik yang ditunjukkan ke pemangku kepentingan',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design memberi PM cara tanpa desain untuk membuat ide menjadi nyata: dari prompt ke prototipe untuk penyelarasan dan brief, tanpa menghabiskan anggaran desain tim.',
    stepsTitle: 'Cara seorang PM memakai Open Design',
    steps: [
      {
        title: 'Jelaskan alurnya',
        body: 'Tuliskan perjalanan pengguna dengan bahasa sehari-hari — layar, status, jalur idealnya. Tanpa alat wireframe.',
        imageAlt: 'Ilustrasi seorang PM menjelaskan sebuah alur pengguna',
      },
      {
        title: 'Dapatkan prototipe yang dapat diklik',
        body: 'Agent merender layar yang dapat dinavigasi yang benar-benar bisa Anda klik — jauh lebih jelas daripada slide atau dokumen untuk tinjauan pemangku kepentingan.',
        imageAlt: 'Ilustrasi sebuah prototipe yang dapat diklik dihasilkan dari sebuah deskripsi',
      },
      {
        title: 'Selaraskan dan serahkan',
        body: 'Bagikan tautannya, kumpulkan masukan pada hal yang sebenarnya, lalu serahkan prototipe ke desain/teknik sebagai titik awal yang presisi dan bersama.',
        imageAlt: 'Ilustrasi sebuah prototipe dibagikan untuk penyelarasan lalu diserahkan ke tim',
      },
    ],
    tableTitle: 'Kerja PM dengan Open Design vs menunggu desain',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Tanpa itu saat ini',
    tableRows: [
      { capability: 'Membuat ide menjadi nyata', withOd: 'Prompt → prototipe yang dapat diklik Anda sendiri', without: 'Mengajukan tiket desain dan menunggu kapasitas' },
      { capability: 'Menyelaraskan pemangku kepentingan', withOd: 'Mereka mengklik alur yang sebenarnya', without: 'Mereka membaca dokumen dan membayangkannya berbeda-beda' },
      { capability: 'Memberi brief ke tim', withOd: 'Sebuah prototipe konkret sebagai spesifikasi', without: 'Tembok teks dan bolak-balik' },
      { capability: 'Iterasi sebelum membangun', withOd: 'Ubah dalam sebuah prompt, bagikan ulang', without: 'Satu ronde lagi di antrean desain' },
      { capability: 'Biaya', withOd: 'Sumber terbuka, di agent yang sudah Anda pakai', without: 'Jam desain dihabiskan untuk konsep sekali pakai' },
    ],
    featuresTitle: 'Apa yang bisa ditaruh seorang PM di hadapan orang',
    features: [
      { title: 'Alur seluler', body: 'Perjalanan aplikasi menyeluruh, dapat diklik.', thumb: 'example-mobile-app' },
      { title: 'Alur onboarding', body: 'Sambutan → penyiapan → jalan pertama.', thumb: 'example-mobile-onboarding' },
      { title: 'Papan & alur kerja', body: 'Antarmuka Kanban dan proses untuk spesifikasi.', thumb: 'example-kanban-board' },
      { title: 'Dasbor', body: 'Tampilan metrik untuk membingkai masalah.', thumb: 'example-dashboard' },
      { title: 'Prototipe web', body: 'Alur web multilayar untuk ditinjau.', thumb: 'example-web-prototype' },
      { title: 'Tampilan tren', body: 'Cuplikan 30 hari dan tren untuk konteks.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Diprototipekan oleh PM dengan Open Design',
    galleryLead:
      'Alur yang dapat diklik dirender dari sebuah deskripsi, siap untuk tinjauan pemangku kepentingan. Pilih satu yang dekat dengan ide Anda dan jelaskan.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Alur seluler' },
      { thumb: 'example-mobile-onboarding', caption: 'Alur onboarding' },
      { thumb: 'example-kanban-board', caption: 'Papan alur kerja' },
      { thumb: 'example-web-prototype', caption: 'Prototipe web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat',
    faqTitle: 'FAQ product manager',
    faq: [
      { q: 'Saya tidak bisa mendesain — apakah ini untuk saya?', a: 'Ya. Anda menjelaskan alurnya dengan kata-kata; agent membuatnya dapat diklik. Ini untuk berkomunikasi dan menyelaraskan, tanpa alat desain.' },
      { q: 'Apakah ini prototipe nyata atau mockup?', a: 'Nyata dan dapat diklik — navigasi dan status berfungsi, jadi pemangku kepentingan bereaksi terhadap pengalaman yang sebenarnya.' },
      { q: 'Apakah ini menggantikan desain?', a: 'Tidak — ini memberi desain dan teknik titik awal yang presisi dan bersama alih-alih spesifikasi teks, dan menyimpan kapasitas desain untuk pekerjaan yang memang membutuhkannya.' },
      { q: 'Agent apa saja yang bisa saya pakai?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.' },
    ],
    ctaTitle: 'Jadikan ide Anda dapat diklik malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah spesifikasi Anda berikutnya menjadi sesuatu yang bisa diklik orang — di dalam agent yang sudah Anda pakai.',
  },
  roleMarketing: {
    title: 'Open Design untuk tim pemasaran',
    description:
      'Rilis kampanye secepat konten. Open Design memungkinkan agent Anda menghasilkan halaman arahan, kartu sosial, dan visual kampanye dari sebuah prompt — sesuai merek, sesuai permintaan, tanpa mengantre desain.',
    breadcrumb: 'Pemasaran',
    label: 'Untuk · Pemasaran',
    heading: 'Visual kampanye secepat sebuah prompt',
    lead: 'Halaman arahan, kartu sosial, sampul, grafis pengumuman — dijelaskan dengan bahasa, dirender sesuai merek, dirilis pada hari yang sama. Tanpa tiket desain, tanpa repot mengutak-atik templat.',
    heroImageAlt:
      'Ilustrasi gaya editorial seorang pemasar mengubah sebuah brief menjadi halaman arahan dan satu set kartu sosial yang sesuai merek',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design adalah sumber daya desain yang selalu siap untuk pemasaran: dari prompt ke aset untuk halaman arahan dan media sosial, sesuai merek, sehingga kampanye dirilis secepat Anda menulis naskah.',
    stepsTitle: 'Cara tim pemasaran memakai Open Design',
    steps: [
      {
        title: 'Kunci mereknya',
        body: 'DESIGN.md Anda menyimpan warna, tipografi, dan suara. Setiap aset yang dibuat agent otomatis sesuai merek — tanpa menata ulang gaya per aset.',
        imageAlt: 'Ilustrasi sebuah sistem merek diterapkan pada aset pemasaran',
      },
      {
        title: 'Hasilkan kampanyenya',
        body: 'Halaman arahan, kartu sosial, sampul, grafis pengumuman — masing-masing satu prompt, satu set yang konsisten di setiap kanal.',
        imageAlt: 'Ilustrasi satu set kampanye lengkap dihasilkan dari prompt',
      },
      {
        title: 'Rilis dan iterasi',
        body: 'Halaman arahan dirender menjadi HTML yang bisa Anda deploy; grafis diekspor ke PNG. Ubah judulnya, render ulang setnya — tanpa menunggu antrean.',
        imageAlt: 'Ilustrasi aset kampanye dirilis dan diiterasi dengan cepat',
      },
    ],
    tableTitle: 'Pemasaran dengan Open Design vs kalang kabut seperti biasa',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Tanpa itu saat ini',
    tableRows: [
      { capability: 'Luncurkan halaman arahan', withOd: 'Prompt → halaman sesuai merek, dapat dideploy', without: 'Memberi brief desain atau bergulat dengan pembuat situs' },
      { capability: 'Set sosial yang konsisten', withOd: 'Templat sama, naskah baru, selaras sempurna', without: 'Menyelaraskan tiap kartu manual' },
      { capability: 'Tetap sesuai merek', withOd: 'Satu DESIGN.md diterapkan ke setiap aset', without: 'Berharap tiap aset cocok dengan pedoman' },
      { capability: 'Bergerak secepat kampanye', withOd: 'Aset dalam sebuah prompt, hari yang sama', without: 'Mengantre di belakang tumpukan kerja desain' },
      { capability: 'Biaya', withOd: 'Sumber terbuka, tanpa alat desain per kursi', without: 'Langganan ditambah jam desain' },
    ],
    featuresTitle: 'Apa yang bisa dirilis tim pemasaran',
    features: [
      { title: 'Halaman arahan', body: 'Halaman arahan kampanye dan produk, dapat dideploy.', thumb: 'example-saas-landing' },
      { title: 'Kartu sosial', body: 'Kartu X / Twitter sesuai merek.', thumb: 'example-card-twitter' },
      { title: 'Korsel', body: 'Set sosial multislide, konsisten.', thumb: 'example-social-carousel' },
      { title: 'Poster', body: 'Poster pengumuman dan acara.', thumb: 'example-magazine-poster' },
      { title: 'Sampul artikel', body: 'Sampul blog dan buletin.', thumb: 'example-article-magazine' },
      { title: 'Halaman web', body: 'Microsite dan halaman kampanye.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Dirilis oleh pemasaran dengan Open Design',
    galleryLead:
      'Aset kampanye sesuai merek yang dirender dari sebuah prompt. Pilih satu yang dekat dengan kampanye Anda dan ganti dengan naskah Anda.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Halaman arahan kampanye' },
      { thumb: 'example-card-twitter', caption: 'Kartu sosial' },
      { thumb: 'example-social-carousel', caption: 'Korsel sosial' },
      { thumb: 'example-magazine-poster', caption: 'Poster pengumuman' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat',
    faqTitle: 'FAQ pemasaran',
    faq: [
      { q: 'Apakah kami butuh desainer untuk setiap aset?', a: 'Tidak. Agent merender halaman arahan dan aset sosial yang sesuai merek dari sebuah prompt, sehingga tim merilis kerja kampanye rutin tanpa mengantre desain.' },
      { q: 'Bagaimana aset tetap sesuai merek?', a: 'DESIGN.md Anda diterapkan ke semuanya secara otomatis — warna, tipografi, dan suara terbawa ke setiap aset.' },
      { q: 'Apakah halaman arahannya benar-benar bisa tayang?', a: 'Ya — halamannya dirender menjadi HTML yang bisa Anda deploy, dan grafis diekspor ke PNG. Ini aset yang siap dirilis, bukan mockup.' },
      { q: 'Agent apa saja yang bisa saya pakai?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.' },
    ],
    ctaTitle: 'Rilis kampanye Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah brief menjadi aset yang sesuai merek — di dalam agent yang sudah Anda pakai.',
  },
};
