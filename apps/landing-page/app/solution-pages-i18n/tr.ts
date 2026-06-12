import type { SolutionLocaleCopy } from './types';

export const TR: SolutionLocaleCopy = {
  prototype: {
    title: 'Open Design + Claude Code ile etkileşimli prototipler oluşturun',
    description:
      'Bir komutu, terminalden çıkmadan tıklanabilir, çok ekranlı bir prototipe dönüştürün. Open Design, kodlama ajanınıza tasarım becerilerini, şablonları ve tasarım sistemini vererek tarayıcıda açabileceğiniz gerçek prototipler üretmesini sağlar.',
    breadcrumb: 'Prototip',
    label: 'Kullanım örneği · Prototip',
    heading: 'Bir komut hızında prototip oluşturun',
    lead: 'Aklınızdaki akışı tarif edin, ajanınız gerçek, tıklanabilir bir prototip kursun — birden çok ekran, ortak stiller ve canlı etkileşimler — açabileceğiniz, paylaşabileceğiniz ve mühendisliğe teslim edebileceğiniz HTML olarak doğrudan işlensin.',
    heroImageAlt:
      'Bir elin çizdiği tel kafesin tıklanabilir, çok ekranlı bir uygulama prototipine dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, zaten kullandığınız kodlama ajanının tasarım katmanıdır. Prototipleme için bu, tek bir paragraflık bir fikirden tek bir oturumda gezilebilir, stillendirilmiş bir prototipe geçmek demektir — tasarım aracı yok, dışa aktarma adımı yok, teslim boşluğu yok.',
    stepsTitle: 'Open Design ile prototipleme nasıl çalışır',
    steps: [
      {
        title: 'Akışı tarif edin',
        body: 'Ajanınıza ne kurduğunuzu sade bir dille anlatın — “bir karşılama ekranı, bir plan seçici ve bir onay ekranı içeren bir katılım akışı.” Open Design prototip becerisini yükler, böylece ajan tek bir sayfa değil ekranlar üretmesi gerektiğini bilir.',
        imageAlt:
          'Bir kişinin terminale bir uygulama akışının sade dildeki tarifini yazdığını gösteren illüstrasyon',
      },
      {
        title: 'Stillendirilmiş ekranlar üretin',
        body: 'Ajan, Open Design’dan bir tasarım sistemi ve prototip şablonları uygular, böylece her ekran taslak gibi görünmek yerine tipografiyi, boşlukları ve bileşenleri paylaşır. Kopuk maketler değil, tutarlı bir ekran kümesi elde edersiniz.',
        imageAlt:
          'Hepsi tek bir tutarlı görsel stili paylaşan birkaç uygulama ekranının sırayla belirdiğini gösteren illüstrasyon',
      },
      {
        title: 'Etkileşimleri bağlayın',
        body: 'Düğmeler gezinir, sekmeler geçiş yapar, kalıcı pencereler açılır. Prototip kendi kendine yeten HTML olarak işlenir, böylece herhangi bir tarayıcıda gerçeği gibi davranır — görüntülemek için herhangi bir prototipleme aracı hesabı gerekmez.',
        imageAlt:
          'Bir imlecin birbirine bağlı ekranlar arasında tıkladığını ve oklarla aralarındaki gezinmeyi gösteren illüstrasyon',
      },
      {
        title: 'Yineleyin ve teslim edin',
        body: 'Ajanla konuşarak iyileştirin — “plan seçiciyi üç sütunlu bir düzene çevir.” Çıktı projenizin içinde yaşadığından, tasarım ile nihai kod tek bir doğruluk kaynağını paylaşır ve tasarımcıdan mühendise olağan teslim boşluğu kapanır.',
        imageAlt:
          'Bir prototipin gözden geçirilip bir mühendise aktarıldığını, tasarım ile kodun tek bir dosyada birleştiğini gösteren illüstrasyon',
      },
    ],
    tableTitle: 'Open Design ile prototipleme, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Geleneksel prototipleme araçları',
    tableRows: [
      {
        capability: 'Fikirden ilk ekrana geçmek',
        withOd: 'Zaten açık olan ajanınızda tek bir komut',
        without: 'Ayrı bir araç açmak, dosya başlatmak, kutuları elle sürüklemek',
      },
      {
        capability: 'Birbirine bağlı birden çok ekran',
        withOd: 'Ortak stiller ve çalışan gezinmeyle bir küme olarak üretilir',
        without: 'Her çerçeve elle çizilir ve elle bağlanır',
      },
      {
        capability: 'Tutarlı görsel sistem',
        withOd: 'Ajanın uyguladığı yeniden kullanılabilir bir tasarım sisteminden alınır',
        without: 'Her dosyada yeniden oluşturulur ya da elle sürdürülür',
      },
      {
        capability: 'Paylaşılabilir sonuç',
        withOd: 'Kendi kendine yeten HTML — her tarayıcıda açılır, hesap gerekmez',
        without: 'Görüntüleyenin bir koltuğa ya da satıcı aracında bir paylaşım bağlantısına ihtiyacı var',
      },
      {
        capability: 'Gerçek koda giden yol',
        withOd: 'Çıktı deponuzda yaşar; tasarım ve kod tek kaynağı paylaşır',
        without: 'Ayrı bir teslimden sonra sıfırdan yeniden kurulur',
      },
      {
        capability: 'Maliyet ve bağımlılık',
        withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır',
        without: 'Koltuk başı abonelik, satıcı barındırmalı, dışa aktarma kısıtlı',
      },
    ],
    featuresTitle: 'Neyin prototipini oluşturabilirsiniz',
    features: [
      {
        title: 'Çok ekranlı web uygulamaları',
        body: 'Ortak gezinmeli tam akışlar — katılım, panolar, ayarlar — tek sayfalar değil.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobil uygulama akışları',
        body: 'Yerel hissi veren geçiş ve durumlarla ekran ekran mobil yolculuklar.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Açılış sayfaları',
        body: 'Tıklayarak gezebileceğiniz ve yayına alabileceğiniz pazarlama sayfaları ve SaaS açılışları.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Her görsel zevk',
        body: 'Editöryel, yumuşak ya da brütalist — prototip baştan sona tutarlı bir stil taşır.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Bekleme listesi ve fiyatlandırma',
        body: 'Dönüşüm yüzeyleri — bekleme listeleri, fiyat tabloları — bağlanmış ve markaya uygun.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Oyunlaştırılmış ve eğlenceli',
        body: 'Hareketin ve durumun sunumun parçası olduğu etkileşim yoğun kavramlar.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu prototipler',
    galleryLead:
      'Bunların her biri bir komut olarak başladı ve tıklanabilir bir çıktıya dönüştü. Fikrinize yakın bir şablon seçin, varyasyonunuzu tarif edin, ajan onu uyarlasın.',
    gallery: [
      { thumb: "example-dating-web", caption: "Flört web uygulaması — çok ekranlı akış" },
      { thumb: "example-hr-onboarding", caption: "İK katılım akışı" },
      { thumb: "example-kami-landing", caption: "Ürün açılış sayfası" },
      { thumb: "example-web-prototype-taste-soft", caption: "Yumuşak stilde web prototipi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Prototip şablonlarına göz atın',
    faqTitle: 'Prototipleme SSS',
    faq: [
      {
        q: 'Open Design ile prototip yapmak için Figma gibi bir tasarım aracına ihtiyacım var mı?',
        a: 'Hayır. Open Design kodlama ajanınızın içinde çalışır ve prototipleri HTML olarak işler. Akışı dille tarif edersiniz; ajan ekranları üretir. Öğrenilecek ya da ücreti ödenecek ayrı bir tuval aracı yoktur.',
      },
      {
        q: 'Prototipler etkileşimli mi yoksa yalnızca statik maketler mi?',
        a: 'Etkileşimli. Gezinme, sekmeler ve kalıcı pencereler çalışır çünkü çıktı gerçek HTML ve CSS’tir. Tıpkı bir kullanıcının yapacağı gibi herhangi bir tarayıcıda tıklayarak gezebilirsiniz.',
      },
      {
        q: 'Hangi ajanları kullanabilirim?',
        a: 'Open Design; Claude Code, Codex, Cursor Agent, Gemini CLI ve bir düzineden fazla birinci taraf bağdaştırıcıyla çalışır. Kendi sağlayıcı anahtarlarınızı getirirsiniz; hiçbir şey sizin için barındırılmaz.',
      },
      {
        q: 'Bir prototip gerçek ürüne dönüşebilir mi?',
        a: 'Mesele tam da bu. Çıktı projenizde yaşar, böylece aynı tasarım sistemi ve bileşenler bir teslimden sonra çöpe atılmak yerine üretim koduna taşınır.',
      },
    ],
    ctaTitle: 'Bir sonraki fikrinizin prototipini bu gece oluşturun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir sonraki “ya şöyle olsaydı”yı tıklayabileceğiniz bir şeye dönüştürün — zaten kullandığınız ajanda.',
  },
  dashboard: {
    title: 'Open Design + Claude Code ile veri panoları oluşturun',
    description:
      'İzlediğiniz metrikleri tarif edin, kodlama ajanınız stillendirilmiş, duyarlı bir pano kursun — her yere barındırabileceğiniz HTML olarak işlenen grafikler, KPI kartları ve tablolar. BI aracı koltuğu yok, sürükle bırak oluşturucu yok.',
    breadcrumb: 'Pano',
    label: 'Kullanım örneği · Pano',
    heading: 'Panolar bir tariften gelir, sürükle bırak oluşturucudan değil',
    lead: 'Ajanınıza neyi göstereceğini ve nasıl hissettirmesi gerektiğini söyleyin. Open Design grafik desenlerini, düzen sistemini ve görsel dili sağlar, böylece varsayılan stilli bir bileşen yığını değil, tutarlı ve sunulabilir bir pano elde edersiniz.',
    heroImageAlt:
      'Soldaki ham sayıların sağda temiz bir grafik ve KPI kartı panosuna aktığını gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, metriklerinizin sade dildeki bir tanımını ajanınızın HTML olarak işlediği stillendirilmiş bir panoya dönüştürür — deponuzda sürümlenir, her yere barındırılabilir, koltuk başı BI aboneliği olmadan.',
    stepsTitle: 'Open Design ile panolar nasıl çalışır',
    steps: [
      {
        title: 'Metrikleri tarif edin',
        body: 'Önemli olanları sıralayın — “haftalık etkin kullanıcılar, plana göre gelir, kayıp oranı ve 30 günlük bir trend.” Ajan pano becerisini yükler, böylece tek bir metin bloğu yerine KPI kartlarını, grafikleri ve bir tabloyu yerleştirmesi gerektiğini bilir.',
        imageAlt: 'Bir kişinin önemsediği metrikleri sıraladığını gösteren illüstrasyon',
      },
      {
        title: 'Grafik desenlerini seçin',
        body: 'Open Design grafik ve düzen şablonları sunar, böylece trendler çizgi grafiğe, dökümler çubuklara ve oranlar doğru görsele dönüşür — uyumsuz varsayılanlar yerine baştan sona tutarlı tipografi ve boşluk.',
        imageAlt: 'Birkaç grafik türünün tutarlı bir ızgaraya dizildiğini gösteren illüstrasyon',
      },
      {
        title: 'Verinizi bağlayın',
        body: 'Panoyu bir CSV’ye, bir JSON uç noktasına yönlendirin ya da örnek satırlar yapıştırın. Veri değiştiğinde güncellenen, kendi kendine yeten HTML olarak işlenir — herhangi bir tarayıcıda açın, herhangi bir statik barındırıcıya bırakın.',
        imageAlt: 'Bir veri dosyasının canlı güncellenen bir panoya bağlandığını gösteren illüstrasyon',
      },
      {
        title: 'İyileştirin ve yayına alın',
        body: 'Ajanla konuşarak ayarlayın — “geliri bölgeye göre grupla, KPI satırını en üste taşı.” Çıktı projenizde yaşar, böylece pano her kod gibi gözden geçirilebilir ve sürümlenebilir.',
        imageAlt: 'Bir panonun iyileştirilip dağıtıldığını gösteren illüstrasyon',
      },
    ],
    tableTitle: 'Open Design ile panolar, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'BI araçları / elle kodlanmış',
    tableRows: [
      { capability: 'Metrik listesinden düzene geçmek', withOd: 'Tek komut; ajan kartları, grafikleri ve tabloları yerleştirir', without: 'Bileşenleri tek tek sürükleyin ya da grafik kodunu sıfırdan yazın' },
      { capability: 'Tutarlı görsel sistem', withOd: 'Yeniden kullanılabilir bir tasarım sisteminden grafik desenleri ve boşluk', without: 'Varsayılan bileşen stilleri ya da her grafik elle stillendirilir' },
      { capability: 'Veri bağlama', withOd: 'CSV / JSON / yapıştırılan satırlar, canlı HTML olarak işlenir', without: 'Satıcı bağlayıcıları ya da özel veri tesisatı' },
      { capability: 'Barındırma ve paylaşım', withOd: 'Herhangi bir statik barındırıcıda kendi kendine yeten HTML, hesap gerekmez', without: 'Görüntüleyenin BI satıcısında bir koltuğa ihtiyacı var' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Deponuzda yaşar; kod gibi karşılaştırılabilir', without: 'Satıcıya kilitli, gerçek bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Koltuk başı abonelik, satıcı barındırmalı' },
    ],
    featuresTitle: 'Neyi kurabilirsiniz',
    features: [
      { title: "Ürün analitiği", body: "Etkin kullanıcılar, hunidiler, elde tutma — bir ürün ekibinin içinde yaşadığı metrikler.", thumb: "example-dashboard" },
      { title: "Depo ve geliştirici metrikleri", body: "Yıldızlar, PR’lar, CI sağlığı — kendi verinizden mühendislik panoları.", thumb: "example-github-dashboard" },
      { title: "Finans raporları", body: "Gelir, harcama, pist; paylaşılabilir bir rapor olarak yerleştirilir.", thumb: "example-finance-report" },
      { title: "Canlı operasyonlar", body: "Altta yatan veri hareket ettikçe yenilenen gerçek zamanlı metrikler.", thumb: "example-live-dashboard" },
      { title: "Sosyal ve pazarlama", body: "Kanal performansı ve kampanya takibi tek bir görünümde.", thumb: "example-social-media-dashboard" },
      { title: "Alan raporları", body: "Her alan için yapılandırılmış raporlar — klinikten alım satıma.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu panolar',
    galleryLead:
      'Bir komut ve bir veri kaynağından işlenmiş gerçek panolar. Sizinkine yakın olan birinden başlayın ve izlediğiniz metrikleri tarif edin.',
    gallery: [
      { thumb: "example-data-report", caption: "Veri raporu" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Canlı operasyon panosu" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Alım satım analiz panosu" },
      { thumb: "example-frame-data-chart-nyt", caption: "Editöryel veri grafiği" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Pano şablonlarına göz atın',
    faqTitle: 'Pano SSS',
    faq: [
      { q: 'Tableau veya Looker gibi bir BI aracına ihtiyacım var mı?', a: 'Hayır. Open Design panoları kodlama ajanınızın içinde HTML olarak işler. Metrikleri tarif eder ve verinize yönlendirirsiniz; lisanslanacak ya da öğrenilecek ayrı bir BI platformu yoktur.' },
      { q: 'Veri nereden gelir?', a: 'Bir CSV’den, bir JSON uç noktasından ya da yapıştırdığınız satırlardan. Pano saf HTML ve JavaScript’tir, böylece nereden okuduğunu tamamen siz denetlersiniz — hiçbir şey barındırılan bir hizmet üzerinden geçmez.' },
      { q: 'Teknik olmayan ekip arkadaşları görüntüleyebilir mi?', a: 'Evet. Çıktı kendi kendine yeten bir web sayfasıdır. Bağlantısı ya da dosyası olan herkes onu bir tarayıcıda açabilir — hesap yok, koltuk yok.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve bir düzineden fazla birinci taraf bağdaştırıcı. Kendi sağlayıcı anahtarlarınızı getirirsiniz.' },
    ],
    ctaTitle: 'Panonuzu bu gece kurun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve metriklerinizi her yere barındırabileceğiniz bir panoya dönüştürün — zaten kullandığınız ajanda.',
  },
  slides: {
    title: 'Open Design + Claude Code ile sunum desteleri oluşturun',
    description:
      'Bir taslağı, herhangi bir sunum uygulaması açmadan tasarlanmış, markaya uygun bir slayt destesine dönüştürün. Open Design kodlama ajanınıza deste şablonları ve bir görsel sistem verir, slaytları sunabileceğiniz, dışa aktarabileceğiniz veya paylaşabileceğiniz HTML olarak işler.',
    breadcrumb: 'Slaytlar',
    label: 'Kullanım örneği · Slaytlar',
    heading: 'Tasarlanmış görünen desteler, bir komutla yazılır',
    lead: 'Ajanınıza bir taslak ve bir ton verin. Open Design bir deste şablonu ve görsel sistem uygular, böylece her slayt yerleştirilir, dizilir ve markaya uygundur — boş bir arka plandaki madde listesi değil.',
    heroImageAlt:
      'Soldaki bir taslağın sağda bir dizi tasarlanmış sunum slaytına dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir taslağı ajanınızın tek bir oturumda işlediği tasarlanmış bir HTML destesine dönüştürür — tarayıcıda sunun, PDF veya PPTX olarak dışa aktarın ve kaynağı deponuzda tutun.',
    stepsTitle: 'Open Design ile desteler nasıl çalışır',
    steps: [
      { title: 'Taslağı verin', body: 'Konuşma noktalarınızı ya da kaba bir yapıyı yapıştırın. Ajan deste becerisini yükler, böylece uzun tek bir belge değil, yerleştirilmiş bir slayt dizisi üretir.', imageAlt: 'Bir metin taslağının bir ajana verildiğini gösteren illüstrasyon' },
      { title: 'Bir deste stili seçin', body: 'Open Design deste şablonları sunar — editöryel, İsviçre-uluslararası, koyu teknik ve daha fazlası. Ajan birini uygular, böylece tipografi, ızgara ve vurgular her slayt boyunca tutarlı kalır.', imageAlt: 'Birkaç deste stili seçeneğinin yan yana dizildiğini gösteren illüstrasyon' },
      { title: 'Slaytları üretin', body: 'Her nokta doğru hiyerarşiye sahip tasarlanmış bir slayda dönüşür — başlıklar, destekleyici görseller, veri vurguları. HTML olarak işlenir, böylece herhangi bir tarayıcıda tam ekran sunulur.', imageAlt: 'Tutarlı stile sahip tamamlanmış bir slayt dizisini gösteren illüstrasyon' },
      { title: 'Sunun, dışa aktarın, yineleyin', body: 'Tarayıcıdan sunun ya da paylaşım için PDF / PPTX olarak dışa aktarın. Ajanla konuşarak iyileştirin — “veri slaydını sıkılaştır, bir kapanış eylem çağrısı ekle.” Deste kaynağı projenizde kalır.', imageAlt: 'Bir destenin sunulup birden çok biçime dışa aktarıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile desteler, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'PowerPoint / Keynote / yapay zekâ slayt araçları',
    tableRows: [
      { capability: 'Taslaktan slaytlara geçmek', withOd: 'Tek komut; ajan her slaydı yerleştirir', without: 'Her slaydı elle kurun ya da bir şablonla boğuşun' },
      { capability: 'Tutarlı tasarım', withOd: 'Gerçek bir ızgara ve yazı sistemi olan deste şablonları', without: 'Tema kayması, elle hizalama, markaya aykırı varsayılanlar' },
      { capability: 'Veri ve diyagramlar', withOd: 'Slaydın parçası olarak işlenen grafikler ve vurgular', without: 'Statik görseller yapıştırın ya da grafikleri her seferinde yeniden kurun' },
      { capability: 'Dışa aktarma biçimleri', withOd: 'Sunmak için HTML, ayrıca PDF / PPTX dışa aktarımı', without: 'Tek bir uygulamanın biçimine kilitli' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Kaynak deponuzda yaşar, karşılaştırılabilir', without: 'İkili dosya, anlamlı bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Uygulama lisansı ya da koltuk başı yapay zekâ eklentisi' },
    ],
    featuresTitle: 'Neyi sunabilirsiniz',
    features: [
      { title: "Yatırım desteleri", body: "Güçlü bir anlatı ve temiz veri slaytlarına sahip yatırımcı ve satış desteleri.", thumb: "example-html-ppt-pitch-deck" },
      { title: "İsviçre / editöryel", body: "Sanatla yönetilmiş görünen, ızgara odaklı, tipografik desteler.", thumb: "example-deck-swiss-international" },
      { title: "Kurs modülleri", body: "Açık adımlar, vurgular ve tempoya sahip öğretim desteleri.", thumb: "example-html-ppt-course-module" },
      { title: "Veri grafiği desteleri", body: "Analiz ve incelemeler için koyu, grafik öne çıkan desteler.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Sunucu modu", body: "Tarayıcıda canlı sunmak için kurulmuş reveal tarzı desteler.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Teknik planlar", body: "Karmaşık sistemleri haritalayan mimari ve bilgi desteleri.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu desteler',
    galleryLead:
      'Bir taslaktan işlenmiş gerçek desteler. Konuşmanıza yakın bir stil seçin ve içeriği tarif edin.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Editöryel dergi destesi" },
      { thumb: "example-guizang-ppt", caption: "İllüstrasyonlu açılış sunumu" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas destesi" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Geçişli tema destesi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Deste şablonlarına göz atın',
    faqTitle: 'Slaytlar SSS',
    faq: [
      { q: 'PowerPoint ya da Keynote’a ihtiyacım var mı?', a: 'Hayır. Open Design desteleri kodlama ajanınızın içinde HTML olarak işler ve PDF veya PPTX olarak dışa aktarabilir. Tarayıcıdan sunarsınız ya da bir dosya teslim edersiniz — kurmak için herhangi bir sunum uygulaması gerekmez.' },
      { q: 'Bunlar yalnızca yapay zekâ üretimi madde işaretleri mi?', a: 'Hayır. Ajan ızgaraya, yazı ölçeğine ve görsel hiyerarşiye sahip gerçek bir deste şablonu uygular, böylece slaytlar otomatik doldurulmuş değil, tasarlanmış görünür.' },
      { q: 'Bir müşteri için PowerPoint’a dışa aktarabilir miyim?', a: 'Evet. Desteler, sunduğunuz HTML’nin yanı sıra PPTX ve PDF olarak da dışa aktarılır, böylece izleyicinin beklediği biçime uyar.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki destenizi bu gece kurun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve taslağınızı tasarlanmış bir desteye dönüştürün — zaten kullandığınız ajanda.',
  },
  image: {
    title: 'Open Design + Claude Code ile markaya uygun grafikler oluşturun',
    description:
      'Sosyal kartları, makale kapaklarını ve pazarlama grafiklerini bir komuttan üretin — gerçek tipografi ve marka sisteminizle yerleştirilmiş, PNG’ye dışa aktarabileceğiniz net HTML olarak işlenmiş. Tasarım uygulaması yok, şablon aboneliği yok.',
    breadcrumb: 'Görsel',
    label: 'Kullanım örneği · Görsel',
    heading: 'Markaya uygun grafikler, sizin için üretilir ve yerleştirilir',
    lead: 'İhtiyacınız olan kartı ya da kapağı tarif edin. Open Design onu gerçek yazı, ızgara ve marka renklerinizle düzenler — sonra bir tasarım uygulamasıyla ya da genel bir şablonla boğuşmak yerine, görsel olarak dışa aktarabileceğiniz HTML olarak işler.',
    heroImageAlt:
      'Bir komutun bir dizi yerleştirilmiş sosyal kart ve makale kapağına dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir komutu, ajanınızın HTML olarak işleyip PNG’ye dışa aktardığı dizilmiş, markaya uygun bir grafiğe dönüştürür — yinelenebilir, sürümlenebilir ve koltuk başı tasarım araçlarından arınmış.',
    stepsTitle: 'Open Design ile grafikler nasıl çalışır',
    steps: [
      { title: 'Grafiği tarif edin', body: 'Ne olduğunu söyleyin — “başlık ve bir alıntı içeren, lansmanımız için bir Twitter kartı.” Ajan doğru beceriyi yükler, böylece düz bir metin bloğu değil, yerleştirilmiş bir grafik düzenler.', imageAlt: 'Bir kişinin ihtiyaç duyduğu bir sosyal kartı tarif ettiğini gösteren illüstrasyon' },
      { title: 'Marka sistemini uygulayın', body: 'Open Design renklerinizi, yazınızı ve boşluklarınızı yeniden kullanılabilir bir tasarım sisteminden çeker, böylece her kart tek seferlik görünmek yerine markanızın geri kalanıyla eşleşir.', imageAlt: 'Marka renkleri ve yazının bir kart düzenine uygulandığını gösteren illüstrasyon' },
      { title: 'İşleyin ve dışa aktarın', body: 'Grafik tam ihtiyacınız olan boyutlarda HTML olarak işlenir — sosyal kart, kapak, afiş — sonra PNG’ye dışa aktarılır. Net metin, gerçek düzen, elle ince ayar yok.', imageAlt: 'Bir grafiğin işlenip bir görsel dosyasına dışa aktarıldığını gösteren illüstrasyon' },
      { title: 'Tarifi yeniden kullanın', body: 'Bir şablon olduğundan, bir sonraki grafik tek bir komut uzaklıkta — başlığı değiştirin, düzeni koruyun. Kart serileri kusursuz biçimde tutarlı kalır.', imageAlt: 'Bir kart şablonunun tutarlı bir grafik serisi ürettiğini gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile grafikler, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Tasarım uygulamaları / genel şablonlar',
    tableRows: [
      { capability: 'Fikirden yerleştirilmiş grafiğe geçmek', withOd: 'Tek komut; ajan yazıyı ve düzeni düzenler', without: 'Bir uygulama açın, her öğeyi elle yerleştirin' },
      { capability: 'Markaya uygun kalmak', withOd: 'Yeniden kullanılabilir bir tasarım sisteminden renkler ve yazı', without: 'Her dosyada marka stillerini yeniden seçin ya da markadan sapın' },
      { capability: 'Tutarlı seri', withOd: 'Aynı şablon, yeni metin — kusursuz hizalı bir küme', without: 'Her varyantı elle hizalayın' },
      { capability: 'Dışa aktarma', withOd: 'Tam boyutlarda HTML, PNG’ye dışa aktarılır', without: 'Elle tuval boyutlandırma ve dışa aktarma ayarları' },
      { capability: 'Yinelenebilir', withOd: 'Deponuzda komut güdümlü bir tarif', without: 'Her seferinde yeniden oluşturduğunuz tek seferlik bir dosya' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Koltuk başı tasarım aracı ya da şablon pazarı' },
    ],
    featuresTitle: 'Neyi yapabilirsiniz',
    features: [
      { title: "Sosyal kartlar", body: "Başlığınız ve markanızla düzenlenmiş X / Twitter kartları.", thumb: "example-card-twitter" },
      { title: "Makale kapakları", body: "Yazılar ve bültenler için editöryel, dergi tarzı kapaklar.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu kartları", body: "O akış için ayarlanmış RedNote tarzı kartlar.", thumb: "example-card-xiaohongshu" },
      { title: "Hero grafikleri", body: "Siteler ve lansmanlar için akışkan, geçişli hero görselleri.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karuseller", body: "Kareler boyunca tutarlı kalan çok slaytlı sosyal karuseller.", thumb: "example-social-carousel" },
      { title: "Arayüz maket çerçeveleri", body: "Ürün anlatımı için bildirim ve cihaz çerçeveleri.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu grafikler',
    galleryLead:
      'Bir komuttan işlenmiş gerçek kartlar ve kapaklar. İhtiyacınıza yakın olan birini seçin ve metninizi yerleştirin.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel sosyal kart" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Editöryel üç tonlu afiş" },
      { thumb: "example-magazine-poster", caption: "Dergi tarzı afiş" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Cesur editöryel kapak" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Grafik şablonlarına göz atın',
    faqTitle: 'Görsel SSS',
    faq: [
      { q: 'Bu, Midjourney gibi bir yapay zekâ görsel üreticisi mi?', a: 'Hayır. Open Design grafikleri gerçek düzen ve tipografiyle düzenler — başlığınız, markanız, tam boyutlar — ve PNG olarak dışa aktardığınız HTML olarak işler. Bu, piksel üretimi değil, tasarım düzenlemesidir.' },
      { q: 'Tutarlı bir kart serisi yapabilir miyim?', a: 'Evet. Her grafik bir şablon olduğundan, düzeni korur ve metni değiştirirsiniz, böylece tüm bir seri kusursuz hizalı ve markaya uygun kalır.' },
      { q: 'Hangi boyutları üretebilir?', a: 'Her boyutu — grafik, belirttiğiniz tam boyutlarda işlenir, kare bir sosyal karttan geniş bir afişe kadar, sonra PNG’ye dışa aktarılır.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki grafiğinizi bu gece yapın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir komutu markaya uygun bir grafiğe dönüştürün — zaten kullandığınız ajanda.',
  },
  video: {
    title: 'Open Design + Claude Code ile hareketli grafikler ve kısa video oluşturun',
    description:
      'Bir senaryoyu hareketli karelere ve kısa biçimli videoya dönüştürün — marka sisteminizle düzenlenmiş ve HTML’den işlenmiş başlık kartları, hareketli arka planlar ve kapanışlar. Hareketli grafik paketi yok, zaman çizelgesinde sürtme yok.',
    breadcrumb: 'Video',
    label: 'Kullanım örneği · Video',
    heading: 'Hareketli grafikler bir senaryodan gelir, zaman çizelgesinden değil',
    lead: 'İstediğiniz anı tarif edin — bir başlık açılışı, bir veri animasyonu, bir logo kapanışı. Open Design hareketli kareleri marka sisteminizle düzenler ve videoya işler, hareketli grafik paketi gerekmez.',
    heroImageAlt:
      'Bir senaryonun bir dizi hareketli video karesine dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir senaryoyu, ajanınızın kısa biçimli videoya işlediği hareketli, markaya uygun karelere dönüştürür — HTML’den düzenlenir, deponuzda sürümlenir, öğrenilecek bir zaman çizelgesi düzenleyicisi olmadan.',
    stepsTitle: 'Open Design ile hareket nasıl çalışır',
    steps: [
      { title: 'Anı tarif edin', body: 'Ne olması gerektiğini söyleyin — “logomuza çözülen bir glitch başlık, ardından bir kapanış kartı.” Ajan hareket becerisini yükler, böylece statik bir görsel değil, hareketli kareler üretir.', imageAlt: 'Bir kişinin bir hareket dizisini tarif ettiğini gösteren illüstrasyon' },
      { title: 'Marka ve hareket stilini uygulayın', body: 'Open Design kare şablonları sunar — sinematik ışık sızıntıları, glitch başlıklar, logo kapanışları — ve renklerinizi ve yazınızı uygular, böylece hareket kasıtlı ve markaya uygun görünür.', imageAlt: 'Marka stilinin hareketli karelere uygulandığını gösteren illüstrasyon' },
      { title: 'Kareleri videoya işleyin', body: 'Kareler HTML’de düzenlenir ve videoya işlenir, böylece zamanlama ve düzen kesin ve yinelenebilirdir — bir zaman çizelgesinde elle anahtar kare yok.', imageAlt: 'HTML karelerinin bir video klibine işlendiğini gösteren illüstrasyon' },
      { title: 'Yineleyin ve dışa aktarın', body: 'Ajanla konuşarak iyileştirin — “başlık açılışını yavaşlat, bir altyazı ekle.” Sosyal ya da ürün için kısa klipler dışa aktarın. Kaynak projenizde kalır.', imageAlt: 'Bir video klibinin iyileştirilip sosyal için dışa aktarıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile hareket, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'After Effects / hareket paketleri',
    tableRows: [
      { capability: 'Senaryodan hareketli karelere geçmek', withOd: 'Tek komut; ajan diziyi düzenler', without: 'Her öğeyi bir zaman çizelgesinde elle anahtar kareleyin' },
      { capability: 'Markaya uygun kalmak', withOd: 'Kare şablonları + renkleriniz ve yazınız', without: 'Her projede marka stilini yeniden kurun' },
      { capability: 'Kesin, yinelenebilir zamanlama', withOd: 'HTML’de düzenlenir, belirlenimci biçimde işlenir', without: 'Elle sürtme, yeniden üretmesi zor' },
      { capability: 'Sosyal için dışa aktarma', withOd: 'Videoya işlenen kısa klipler', without: 'Dışa aktarma ön ayarları ve codec boğuşması' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Kare kaynağı deponuzda yaşar, karşılaştırılabilir', without: 'İkili proje dosyası, gerçek bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Pahalı paket, dik öğrenme eğrisi' },
    ],
    featuresTitle: 'Neyi hareketlendirebilirsiniz',
    features: [
      { title: "Hyperframes", body: "HTML’den düzenlenmiş kare kare hareket dizileri.", thumb: "example-video-hyperframes" },
      { title: "Kısa biçimli sosyal", body: "Sosyal akışlar için kurulmuş dikey klipler.", thumb: "example-video-shortform" },
      { title: "Hareket kare kümeleri", body: "Bir klibe düzenlediğiniz yeniden kullanılabilir hareketli kareler.", thumb: "example-motion-frames" },
      { title: "Sinematik ışık sızıntıları", body: "Filmsel geçişler ve atmosferik arka planlar.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch başlıklar", body: "Hareket ve dokulu başlık açılışları.", thumb: "example-frame-glitch-title" },
      { title: "Logo kapanışları", body: "Herhangi bir klip için markalı kapanış animasyonları.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu hareket',
    galleryLead:
      'Bir komuttan işlenmiş gerçek hareketli kareler ve klipler. Fikrinize yakın olan birini seçin ve hareketi tarif edin.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes dizisi" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Akışkan hareket arka planı" },
      { thumb: "example-frame-macos-notification", caption: "Hareketli arayüz karesi" },
      { thumb: "example-frame-data-chart-nyt", caption: "Hareketli veri grafiği" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Hareket şablonlarına göz atın',
    faqTitle: 'Video SSS',
    faq: [
      { q: 'After Effects ya da bir hareketli grafik paketine ihtiyacım var mı?', a: 'Hayır. Open Design hareketli kareleri HTML’de düzenler ve kodlama ajanınızın içinde videoya işler. Öğrenilecek ya da lisanslanacak bir zaman çizelgesi düzenleyicisi yoktur.' },
      { q: 'Bu ne tür videolar için iyidir?', a: 'Kısa biçimli hareket — başlık kartları, veri animasyonları, logo kapanışları, sosyal klipler. Uzun metrajlı düzenleme için değil, marka ve ürün hareketi için kurulmuştur.' },
      { q: 'Zamanlama yeniden üretilebilir mi?', a: 'Evet. Kareler kodla düzenlenip belirlenimci biçimde işlendiğinden, her seferinde aynı sonucu alırsınız ve bir komutla kesin biçimde ince ayar yapabilirsiniz.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki fikrinizi bu gece hareketlendirin',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir senaryoyu harekete dönüştürün — zaten kullandığınız ajanda.',
  },
  designSystem: {
    title: 'Open Design + Claude Code ile bir tasarım sistemi kurun ve uygulayın',
    description:
      'Markanızı, kodlama ajanınızın her çıktıya uyguladığı yeniden kullanılabilir bir tasarım sistemi olarak yakalayın — renkler, yazı, bileşenler ve ton, tek bir DESIGN.md içinde. Bir kez tanımlayın; her prototip, deste ve pano markaya uygun kalsın.',
    breadcrumb: 'Tasarım Sistemi',
    label: 'Kullanım örneği · Tasarım Sistemi',
    heading: 'Tek bir tasarım sistemi, ajanınızın yaptığı her şeye uygulanır',
    lead: 'Markanızı bir kez tanımlayın, Open Design onu her çıktıya taşısın — prototipler, desteler, panolar, grafikler. Sistem, deponuzda ajanın okuduğu bir DESIGN.md olarak yaşar, böylece tutarlılık elle değil, otomatiktir.',
    heroImageAlt:
      'Tek bir tasarım sisteminin markaya uygun birçok çıktıya ışıdığını gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design markanızı, ajanınızın her çıktıya uyguladığı taşınabilir bir tasarım sistemi olarak yakalar — deponuzda bir kez tanımlanır, her yerde uygulanır, onu denetleyen merkezi bir tasarım aracı olmadan.',
    stepsTitle: 'Open Design ile tasarım sistemleri nasıl çalışır',
    steps: [
      { title: 'Sistemi yakalayın', body: 'Markanızı tarif edin — renkler, yazı, boşluk, ses — ya da çıkarması için ajanı mevcut bir siteye yönlendirin. Open Design bunu projenizde yaşayan bir DESIGN.md içine yazar.', imageAlt: 'Bir markanın tek bir tasarım sistemi dosyasına yakalandığını gösteren illüstrasyon' },
      { title: 'Kanıtlanmış bir temelden başlayın', body: 'Open Design 140’tan fazla referans tasarım sistemi sunar — Apple ve Linear’dan editöryel ve brütaliste. Boş bir sayfadan başlamak yerine markanıza yakın olan birini çatallayın.', imageAlt: 'Bir referans tasarım sistemleri galerisinin gezildiğini gösteren illüstrasyon' },
      { title: 'Her yerde uygulayın', body: 'Diğer her beceri aynı sistemi okur, böylece bir prototip, bir deste ve bir pano tek bir görsel dili paylaşır — onu her seferinde yeniden belirtmeniz gerekmeden.', imageAlt: 'Tek bir sistemin birçok çıktı türüne tutarlı biçimde uygulandığını gösteren illüstrasyon' },
      { title: 'Tek bir yerde geliştirin', body: 'Sistemi değiştirin, bir sonraki işleme bunu her yerde yansıtsın. Deponuzda bir dosya olduğundan, tasarım kararları kod gibi gözden geçirilir ve sürümlenir.', imageAlt: 'Bir tasarım sisteminin güncellenip tüm çıktılara yayıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile tasarım sistemleri, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Tasarım aracı kitaplıkları / stil kılavuzları',
    tableRows: [
      { capability: 'Sistemi tanımlamak', withOd: 'Ajanın okuduğu, 140’tan fazla referanstan çatallanan bir DESIGN.md', without: 'Statik bir stil kılavuzu ya da araca bağlı bir kitaplık' },
      { capability: 'Çıktı türleri boyunca uygulamak', withOd: 'Aynı sistem prototipleri, desteleri, panoları, grafikleri besler', without: 'Her araç ve her dosya için yeniden uygulanır' },
      { capability: 'Her şeyi tutarlı tutmak', withOd: 'Otomatik — her beceri tek bir kaynağı okur', without: 'Elle disiplin; zamanla sapar' },
      { capability: 'Markayı geliştirmek', withOd: 'Bir kez düzenleyin; bir sonraki işleme her yerde güncellenir', without: 'Dosyalar ve araçlar boyunca bul-değiştir' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Deponuzda yaşar, kod gibi karşılaştırılabilir', without: 'Bir tasarım aracında gömülü, denetlemesi zor' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, taşınabilir, yerelde çalışır', without: 'Bir tasarım aracı aboneliğine kilitli' },
    ],
    featuresTitle: 'Başlayabileceğiniz sistemler',
    features: [
      { title: "Apple", body: "Temiz, ölçülü, sistem yazı tipi estetiği.", thumb: "design-system-apple" },
      { title: "Linear", body: "Sıkı boşlukla net ürün aracı görünümü.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Yumuşak, belge öncelikli, ulaşılabilir.", thumb: "design-system-notion" },
      { title: "Figma", body: "Eğlenceli, renkli, yaratıcı araç enerjisi.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, nötr, araştırma düzeyinde.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Yoğun, teknik, geliştirici yerlisi.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design’daki tasarım sistemleri',
    galleryLead:
      'Başlangıç noktası olarak çatallayabileceğiniz 140’tan fazla referans sistemden birkaçı. Markanıza yakın olan birini seçin ve uyarlayın.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb tarzı sistem" },
      { thumb: "design-system-vercel", caption: "Vercel tarzı sistem" },
      { thumb: "design-system-stripe", caption: "Stripe tarzı sistem" },
      { thumb: "design-system-spotify", caption: "Spotify tarzı sistem" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Tasarım sistemlerine göz atın',
    faqTitle: 'Tasarım Sistemi SSS',
    faq: [
      { q: 'Buradaki tasarım sistemi tam olarak nedir?', a: 'Deponuzda renkleri, yazıyı, boşluğu, bileşenleri ve sesi yakalayan bir DESIGN.md dosyası. Her Open Design becerisi onu okur, böylece markanız ajanın ürettiği her şeye otomatik olarak uygulanır.' },
      { q: 'Sıfırdan başlamak zorunda mıyım?', a: 'Hayır. Open Design çatallayabileceğiniz 140’tan fazla referans tasarım sistemi sunar — Apple ve Linear’dan editöryel ve brütaliste — sonra markanıza uyarlarsınız.' },
      { q: 'Desteler, panolar ve prototipler arasında nasıl tutarlı kalır?', a: 'Çünkü tüm bu beceriler aynı DESIGN.md’yi okur. Sistemi bir kez tanımlayın, tutarlılık elle kovaladığınız bir şey değil, otomatik olsun.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Tasarım sisteminizi bu gece tanımlayın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve ajanınıza her yerde uygulayacağı tek bir marka verin — zaten kullandığınız ajanda.',
  },
  roleSoloBuilder: {
    title: 'Tek kişilik geliştiriciler ve bağımsız hackerlar için Open Design',
    description:
      'Tek kişilik bir ekip gibi ürün çıkarın. Open Design, kodlama agent’ınızı girişiminizin tasarım yarısına dönüştürür — prototipler, açılış sayfaları, panolar ve marka görselleri, hepsi tek bir komutla, hepsi markaya uygun, hepsi deponuzda.',
    breadcrumb: 'Tek Kişilik Geliştirici',
    label: 'İçin · Tek Kişilik Geliştiriciler',
    heading: 'Tasarım ekibiniz, zaten çalıştırdığınız agent’tır',
    lead: 'Tasarımcı yok, bütçe yok, devir teslim yok. Neye ihtiyacınız olduğunu anlatın, agent onu işlesin — bu sabah bir açılış sayfası, öğleden sonra bir pano, yayına almadan önce sosyal kartlar — hepsi bir kez tanımladığınız tek bir tasarım sistemini paylaşır.',
    heroImageAlt:
      'Masasında oturan bir kişinin etrafını aynı tutarlı stilde bir açılış sayfası, bir uygulama, bir pano ve sosyal kartların sardığı editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, tek kişilik bir kurucunun hiç sahip olmadığı tasarım departmanıdır: ürününüzün ihtiyaç duyduğu her yüzeyde komuttan ürüne, tek bir markayla, sıfır devir teslimle ve ek araç olmadan.',
    stepsTitle: 'Tek kişilik bir geliştirici Open Design’ı nasıl kullanır',
    steps: [
      {
        title: 'Markanızı bir kez tanımlayın',
        body: 'Renkleri, yazı tipini ve tonu bir DESIGN.md dosyasında toplayın (ya da 140’tan fazla referans sistemden birini fork’layın). Bundan sonra ürettiğiniz her şey otomatik olarak markaya uygundur.',
        imageAlt: 'Tek bir marka tanımı dosyasının illüstrasyonu',
      },
      {
        title: 'Sırada neye ihtiyacınız varsa üretin',
        body: 'Prototip, açılış sayfası, pano, sunum destesi, sosyal kart — aynı agent, aynı marka, her biri için tek komut. Araç değiştirmek ya da yeniden koltuk satın almak yok.',
        imageAlt: 'Tek bir komuttan gelen birçok ürün türünün illüstrasyonu',
      },
      {
        title: 'Yayına alın — zaten gerçek',
        body: 'Her şey deponuzdaki HTML / koda işlenir, böylece prototip ürüne, açılış sayfası da canlıya dönüşür. Çöpe atılan taslaklar yok.',
        imageAlt: 'Bir ürünün komuttan doğrudan canlıya geçişinin illüstrasyonu',
      },
    ],
    tableTitle: 'Open Design ile tek başına inşa etmek vs. zor yoldan yapmak',
    tableColCapability: 'Neye ihtiyacınız var',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Bugün tek başınıza',
    tableRows: [
      { capability: 'Her tasarım yüzeyini kapsayın', withOd: 'Tek agent prototipi, açılışı, panoyu, markayı yapar', without: 'Beş SaaS aracını ve eğitimi bir araya dikmek' },
      { capability: 'Markaya uygun kalın', withOd: 'Her yerde otomatik uygulanan tek bir DESIGN.md', without: 'Görünümü her araçta yeniden kurmak, zamanla sapmak' },
      { capability: 'Tek kişilik hızda ilerleyin', withOd: 'Fikirden ürüne tek komutla', without: 'Vaktiniz olmayan bir tasarım aracını öğrenmek' },
      { capability: 'Taslak değil, yayın', withOd: 'Deponuzda HTML / kod, dağıtıma hazır', without: 'Birinin hâlâ inşa etmesi gereken bir taslak' },
      { capability: 'Maliyet', withOd: 'Açık kaynak, kendi anahtarlarınız, yerelde çalışır', without: 'Koltuk başına bir yığın abonelik' },
    ],
    featuresTitle: 'Tek kişilik bir geliştirici neler çıkarabilir',
    features: [
      { title: 'Açılış sayfaları', body: 'Pazarlama ve SaaS açılışları, tıklanabilir ve canlı.', thumb: 'example-saas-landing' },
      { title: 'Ürün prototipleri', body: 'Fikri doğrulamak için çok ekranlı web uygulamaları.', thumb: 'example-web-prototype' },
      { title: 'Panolar', body: 'Ürününüz için metrik ve yönetim görünümleri.', thumb: 'example-dashboard' },
      { title: 'Marka grafikleri', body: 'Markanıza uyan kapaklar ve posterler.', thumb: 'example-magazine-poster' },
      { title: 'Mobil akışlar', body: 'Web’in ötesine geçtiğinizde uygulama ekranları.', thumb: 'example-mobile-app' },
      { title: 'Sosyal kartlar', body: 'Her kanal için lansman ve güncelleme kartları.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Open Design ile tek başına inşa edildi',
    galleryLead:
      'Tek kişilik bir girişimin ihtiyaç duyduğu her yüzey, tek bir komuttan. Bir sonraki adımınıza yakın olanı seçin ve anlatın.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'SaaS açılış sayfası' },
      { thumb: 'example-web-prototype', caption: 'Ürün prototipi' },
      { thumb: 'example-dashboard', caption: 'Ürün panosu' },
      { thumb: 'example-card-twitter', caption: 'Lansman sosyal kartı' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Şablonlara göz atın',
    faqTitle: 'Tek kişilik geliştirici SSS',
    faq: [
      { q: 'Tasarımcı değilim — bunu gerçekten kullanabilir miyim?', a: 'Evet. Ne istediğinizi sade bir dille anlatırsınız; agent bir tasarım sistemi uygular ve işler. Beceri, piksel itmekte değil komutu yazmaktadır.' },
      { q: 'Her şeyi mi kapsar yoksa tek bir şeyi mi?', a: 'Küçük bir ürünün ihtiyaç duyduğu her şeyi — prototipler, açılış sayfaları, panolar, desteler, grafikler — aynı agent’tan ve aynı markadan.' },
      { q: 'Çıktılar neye dönüşür?', a: 'Deponuzda gerçek HTML / kod, böylece prototip ürüne, açılış sayfası canlıya dönüşebilir; çöpe attığınız bir taslak yerine.' },
      { q: 'Hangi agent’ları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf adaptörü, kendi sağlayıcı anahtarlarınızla.' },
    ],
    ctaTitle: 'Tüm projenizi bu gece inşa edin',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve tek bir agent’ın tasarım ekibiniz olmasına izin verin — zaten kullandığınız agent’ta.',
  },
  roleDesigner: {
    title: 'Tasarımcılar için Open Design',
    description:
      'Zamanınızı zahmete değil, zevke harcayın. Open Design, agent’ınızın tekrar eden üretim işini — varyantlar, durumlar, tam tasarım sistemleri — üstlenmesini sağlar; siz görünümü yönetir ve son sözü söylersiniz.',
    breadcrumb: 'Tasarımcı',
    label: 'İçin · Tasarımcılar',
    heading: 'Tasarımı yönetin — üretimi agent yapsın',
    lead: 'Sistemi ve standardı siz belirlersiniz; agent ekranları, durumları, varyantları, yüksek çözünürlüklü kompozisyonları işler. Daha az dikdörtgen itmek, neyin iyi göründüğüne daha çok karar vermek.',
    heroImageAlt:
      'Bir tasarımcının yönlendirdiği, bir agent’ın ise ekranları, varyantları ve bir tasarım sistemini doldurduğu editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, hiç yorulmayan üretim asistanıdır: tasarım sistemini siz tanımlar ve zevki siz belirlersiniz; agent gerisini üretir, sisteme uygun, deponuzun içinde.',
    stepsTitle: 'Bir tasarımcı Open Design’ı nasıl kullanır',
    steps: [
      {
        title: 'Sisteminizi kodlayın',
        body: 'Markanızı bir DESIGN.md’ye dönüştürün — yazı tipi ölçeği, renk, boşluk, bileşenler, ton. Bu, agent’ın uyduğu doğruluk kaynağıdır.',
        imageAlt: 'Bir dosya olarak yakalanmış tasarım sisteminin illüstrasyonu',
      },
      {
        title: 'Uzun kuyruğu üretin',
        body: 'Aksi halde elle inşa edeceğiniz her ekran, durum ve varyant — agent bunları sisteme uygun işler, böylece sıkıcı %80 dakikalar içinde biter.',
        imageAlt: 'Sisteme uygun birçok ekranın aynı anda üretilmesinin illüstrasyonu',
      },
      {
        title: 'Yönetin ve rafine edin',
        body: 'Dille eleştirin — “boşluğu sıkılaştır, boş durumu daha sıcak yap.” Son söz sizde kalır; iterasyonları agent yapar.',
        imageAlt: 'Bir tasarımcının yön verdiği ve tasarımın güncellendiği illüstrasyon',
      },
    ],
    tableTitle: 'Open Design ile tasarlamak vs. el yordamı',
    tableColCapability: 'Neye ihtiyacınız var',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Elle tasarım araçları',
    tableRows: [
      { capability: 'Bir tasarım sistemi kurun', withOd: 'Agent’ın her yere uyguladığı bir DESIGN.md', without: 'Her araçta elle bakımını yaptığınız bir kütüphane' },
      { capability: 'Varyant ve durum üretin', withOd: 'Bir komuttan sisteme uygun üretilir', without: 'Çerçeveleri çoğaltıp her birini ayarlamak' },
      { capability: 'Yüksek çözünürlüklü kompozisyonlar', withOd: 'Düz bir taslak değil, gerçek HTML’e işlenir', without: 'Mühendisliğin zaten yeniden inşa ettiği piksel işi' },
      { capability: 'Tutarlı kalın', withOd: 'Tek sistem, otomatik dayatılır', without: 'Elle disiplin; zamanla sapar' },
      { capability: 'Devir teslim', withOd: 'Ürün koddur — çeviri boşluğu yok', without: 'Spesifikasyon belgeleri ve işaretlemeler' },
    ],
    featuresTitle: 'Bir tasarımcı neleri yönetebilir',
    features: [
      { title: 'Editöryel düzenler', body: 'Sanat yönetimli, ızgara odaklı kompozisyonlar.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Makale kapakları', body: 'Dergi tarzı kapaklar ve dosyalar.', thumb: 'example-article-magazine' },
      { title: 'Posterler', body: 'Markaya uygun, cesur tipografik posterler.', thumb: 'example-magazine-poster' },
      { title: 'Sosyal setler', body: 'Tutarlı çok kareli galeriler.', thumb: 'example-social-carousel' },
      { title: 'Uygulama ekranları', body: 'Yüksek çözünürlüklü mobil ve web ekranları.', thumb: 'example-mobile-app' },
      { title: 'Panolar', body: 'Sisteminize saygılı veri arayüzü.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Open Design ile yönetildi',
    galleryLead:
      'Agent’ın yönlendirmeyle ürettiği, sisteme uygun, yüksek çözünürlüklü işler. Stilinize yakın olanı seçin ve rafine edin.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Editöryel düzen' },
      { thumb: 'example-article-magazine', caption: 'Dergi kapağı' },
      { thumb: 'example-social-carousel', caption: 'Sosyal galeri' },
      { thumb: 'example-magazine-poster', caption: 'Tipografik poster' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Şablonlara göz atın',
    faqTitle: 'Tasarımcı SSS',
    faq: [
      { q: 'Bu beni yerimden eder mi?', a: 'Hayır — zahmeti yerinden eder. Sistemi ve zevki siz belirlersiniz; tekrar eden üretimi agent yapar, böylece vaktinizi yalnızca sizin verebileceğiniz kararlara ayırırsınız.' },
      { q: 'Görünümün kontrolünü nasıl elimde tutarım?', a: 'DESIGN.md’niz sözleşmedir. Agent onun içinde işler, siz de doğru olana dek dille eleştirirsiniz.' },
      { q: 'Çıktı düzenlenebilir / gerçek mi?', a: 'Düz bir dışa aktarım değil, gerçek HTML/CSS’tir — bu yüzden yeniden inşa edilmek yerine doğrudan üretime taşınır.' },
      { q: 'Hangi agent’ları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf adaptörü, kendi sağlayıcı anahtarlarınızla.' },
    ],
    ctaTitle: 'Bir sonraki tasarımınızı bu gece yönetin',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve siz zevki belirlerken üretimi agent yapsın — zaten kullandığınız agent’ta.',
  },
  roleEngineering: {
    title: 'Mühendisler için Open Design',
    description:
      'Tasarım devir teslimini atlayın. Open Design, bir DESIGN.md’yi kodlama agent’ınızın doğrudan yazdığı gerçek bir ön uca dönüştürür — sisteme uygun arayüz, prototipler ve panolar, depoda, Figma gidiş dönüşü olmadan.',
    breadcrumb: 'Mühendislik',
    label: 'İçin · Mühendislik',
    heading: 'Spesifikasyondan ön uca, arada devir teslim yok',
    lead: 'Agent’ınızı bir DESIGN.md’ye ve bir açıklamaya yönlendirin; sisteme uygun, gerçek ön uç kodu yazsın — bileşenler, ekranlar, panolar — doğrudan projenizde. İşaretleme yok, “tasarımı bekliyoruz” yok.',
    heroImageAlt:
      'Bir DESIGN.md’nin devir teslim adımını atlayarak doğrudan ön uç koduna ve işlenmiş arayüze aktığı editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, tasarım sistemini makine tarafından okunabilir kılarak tasarımcı-mühendis boşluğunu kapatır: kodunuzu yazan aynı agent sistemi uygular ve gerçek arayüzü işler.',
    stepsTitle: 'Bir mühendis Open Design’ı nasıl kullanır',
    steps: [
      {
        title: 'İşaretleme değil, sistemi okuyun',
        body: 'DESIGN.md depoda yaşar. Agent’ınız onu, kod tabanının geri kalanını okuduğu gibi okur — yorumlanacak dışa aktarılmış spesifikasyon yok.',
        imageAlt: 'Bir agent’ın kodun yanında bir DESIGN.md okumasının illüstrasyonu',
      },
      {
        title: 'Sisteme uygun arayüz üretin',
        body: 'Ekranı ya da bileşeni anlatın; agent sistemle zaten uyumlu ön uç yazsın. Prototipler, yönetim panoları, dahili araçlar — dakikalar içinde.',
        imageAlt: 'Bir tasarım sistemine uyacak şekilde üretilmiş arayüz kodunun illüstrasyonu',
      },
      {
        title: 'Zaten sizin kodunuz',
        body: 'Çıktı, deponuzdaki HTML / çerçeve kodudur, bir PR’de gözden geçirilebilir. “tasarım” ile “yapım” arasında çeviri adımı yok.',
        imageAlt: 'Üretilen arayüzün gözden geçirilebilir bir PR olarak indiğinin illüstrasyonu',
      },
    ],
    tableTitle: 'Open Design ile ön uç vs. devir teslim yolu',
    tableColCapability: 'Neye ihtiyacınız var',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Tasarımdan geliştirmeye devir teslim',
    tableRows: [
      { capability: 'İnşa edilecek bir tasarım edinin', withOd: 'Agent’ınızın doğrudan okuduğu bir DESIGN.md', without: 'Elle yeniden yorumladığınız bir Figma dosyası' },
      { capability: 'Sistemi eşleştirin', withOd: 'Üretim anında otomatik dayatılır', without: 'Bir spesifikasyona göz kararı bakmak, sapma sızar' },
      { capability: 'Dahili araçlar / panolar yapın', withOd: 'Komut → depoda sisteme uygun ön uç', without: 'Bir tasarımcıyı beklemek, sonra iki kez yapmak' },
      { capability: 'Gözden geçirme', withOd: 'Koddur — bir PR’de diff’leyin', without: 'Bir taslağa karşı piksel kıyaslaması' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, deponuzda, yerelde çalışır', without: 'Tüm ekibin lisanslaması gereken bir tasarım aracı' },
    ],
    featuresTitle: 'Bir mühendis neler üretebilir',
    features: [
      { title: 'Web uygulaması arayüzü', body: 'Bir açıklamadan çok ekranlı ön uçlar.', thumb: 'example-web-prototype' },
      { title: 'Geliştirici panoları', body: 'Depo, CI ve metrik panoları.', thumb: 'example-github-dashboard' },
      { title: 'Veri raporları', body: 'Verinizden yapılandırılmış raporlar.', thumb: 'example-data-report' },
      { title: 'Yönetim panoları', body: 'Dahili araçlar ve yönetim görünümleri.', thumb: 'example-dashboard' },
      { title: 'Açılış sayfaları', body: 'Tasarımı beklemeden pazarlama sayfaları.', thumb: 'example-saas-landing' },
      { title: 'Kanban / panolar', body: 'Dahili iş akışı arayüzleri.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Mühendisler tarafından Open Design ile inşa edildi',
    galleryLead:
      'Doğrudan depoda üretilen gerçek, sisteme uygun ön uç. İnşa ettiğinize yakın olanı seçin ve anlatın.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Web uygulaması arayüzü' },
      { thumb: 'example-github-dashboard', caption: 'Geliştirici panosu' },
      { thumb: 'example-data-report', caption: 'Veri raporu' },
      { thumb: 'example-kanban-board', caption: 'Dahili pano arayüzü' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Şablonlara göz atın',
    faqTitle: 'Mühendislik SSS',
    faq: [
      { q: 'Hâlâ bir tasarımcıya ihtiyacım var mı?', a: 'Marka ve yön için evet. Ama sisteme uygun arayüz ve dahili araçlar yapmak için agent DESIGN.md’yi okur ve ön ucu yazar — devir teslim gidiş dönüşü yok.' },
      { q: 'Ne çıktı verir?', a: 'Deponuzda gerçek HTML / çerçeve kodu, bir PR’de gözden geçirilebilir — yeniden uyguladığınız bir taslak değil.' },
      { q: 'Sisteme uygun nasıl kalır?', a: 'DESIGN.md doğruluk kaynağıdır; agent onu üretim anında uygular, böylece çıktı elle piksel kontrolü olmadan eşleşir.' },
      { q: 'Hangi agent’ları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf adaptörü, kendi sağlayıcı anahtarlarınızla.' },
    ],
    ctaTitle: 'Bir sonraki arayüzünüzü bu gece üretin',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir DESIGN.md’yi ön uca dönüştürün — zaten kullandığınız agent’ta.',
  },
  roleProductManagers: {
    title: 'Ürün yöneticileri için Open Design',
    description:
      'Bir fikri iletmek için tasarım kapasitesini beklemeyi bırakın. Open Design, bir ürün yöneticisinin bir komutu tıklanabilir bir prototipe ya da tel çerçeveye dönüştürmesini sağlar — paydaşları hizalamak ve ekibi bilgilendirmek için, tasarım talebi açmadan.',
    breadcrumb: 'Ürün Yöneticileri',
    label: 'İçin · Ürün Yöneticileri',
    heading: 'Fikri başlangıç toplantısından önce tıklanabilir kılın',
    lead: 'Akışı anlatın, agent bugün paydaşların önüne koyabileceğiniz gerçek, tıklanabilir bir prototip işlesin — böylece incelemeler bir belgedeki paragrafı değil, gerçek şeyi tartışsın.',
    heroImageAlt:
      'Bir ürün yöneticisinin yazılı bir fikri paydaşlara gösterilen tıklanabilir bir prototipe dönüştürmesinin editöryel illüstrasyonu',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, bir ürün yöneticisine fikirleri somutlaştırmanın tasarımsız bir yolunu sunar: hizalama ve bilgilendirme için komuttan prototipe, ekibin tasarım bütçesini harcamadan.',
    stepsTitle: 'Bir ürün yöneticisi Open Design’ı nasıl kullanır',
    steps: [
      {
        title: 'Akışı anlatın',
        body: 'Kullanıcı yolculuğunu sade bir dille yazın — ekranlar, durumlar, mutlu yol. Tel çerçeve aracı gerekmez.',
        imageAlt: 'Bir ürün yöneticisinin bir kullanıcı akışını anlatmasının illüstrasyonu',
      },
      {
        title: 'Tıklanabilir bir prototip alın',
        body: 'Agent, gerçekten tıklayıp gezebileceğiniz ekranlar işler — bir paydaş incelemesi için bir slayttan ya da belgeden çok daha net.',
        imageAlt: 'Bir açıklamadan üretilen tıklanabilir bir prototipin illüstrasyonu',
      },
      {
        title: 'Hizalayın ve devredin',
        body: 'Bağlantıyı paylaşın, gerçek şey üzerinde geri bildirim toplayın, sonra prototipi tasarıma/mühendisliğe kesin, paylaşılan bir başlangıç noktası olarak verin.',
        imageAlt: 'Bir prototipin hizalama için paylaşılıp sonra ekibe verilmesinin illüstrasyonu',
      },
    ],
    tableTitle: 'Open Design ile ürün yöneticiliği vs. tasarımı beklemek',
    tableColCapability: 'Neye ihtiyacınız var',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Bugün onsuz',
    tableRows: [
      { capability: 'Bir fikri somutlaştırın', withOd: 'Komut → tıklanabilir prototipi kendiniz', without: 'Bir tasarım talebi açıp kapasiteyi beklemek' },
      { capability: 'Paydaşları hizalayın', withOd: 'Gerçek akışı tıklarlar', without: 'Bir belge okuyup her biri farklı hayal eder' },
      { capability: 'Ekibi bilgilendirin', withOd: 'Spesifikasyon olarak somut bir prototip', without: 'Bir metin duvarı ve gidip gelmeler' },
      { capability: 'Yapımdan önce iterasyon', withOd: 'Bir komutla değiştirin, yeniden paylaşın', without: 'Tasarım kuyruğunda bir tur daha' },
      { capability: 'Maliyet', withOd: 'Açık kaynak, zaten kullandığınız agent’ta', without: 'Çöpe atılan konseptlere harcanan tasarım saatleri' },
    ],
    featuresTitle: 'Bir ürün yöneticisi insanların önüne neler koyabilir',
    features: [
      { title: 'Mobil akışlar', body: 'Uçtan uca uygulama yolculukları, tıklanabilir.', thumb: 'example-mobile-app' },
      { title: 'İlk kurulum akışları', body: 'Karşılama → kurulum → ilk çalıştırma.', thumb: 'example-mobile-onboarding' },
      { title: 'Panolar ve iş akışları', body: 'Spesifikasyonlar için Kanban ve süreç arayüzleri.', thumb: 'example-kanban-board' },
      { title: 'Panolar', body: 'Sorunu çerçevelemek için metrik görünümleri.', thumb: 'example-dashboard' },
      { title: 'Web prototipleri', body: 'İncelenecek çok ekranlı web akışları.', thumb: 'example-web-prototype' },
      { title: 'Trend görünümleri', body: 'Bağlam için 30 günlük ve trend anlık görüntüleri.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Ürün yöneticileri tarafından Open Design ile prototiplendi',
    galleryLead:
      'Bir açıklamadan işlenmiş, bir paydaş incelemesine hazır tıklanabilir akışlar. Fikrinize yakın olanı seçin ve anlatın.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Mobil akış' },
      { thumb: 'example-mobile-onboarding', caption: 'İlk kurulum akışı' },
      { thumb: 'example-kanban-board', caption: 'İş akışı panosu' },
      { thumb: 'example-web-prototype', caption: 'Web prototipi' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Şablonlara göz atın',
    faqTitle: 'Ürün yöneticisi SSS',
    faq: [
      { q: 'Tasarım yapamıyorum — bu bana göre mi?', a: 'Evet. Akışı kelimelerle anlatırsınız; agent onu tıklanabilir kılar. İletişim ve hizalama içindir, tasarım aracı gerekmez.' },
      { q: 'Gerçek bir prototip mi yoksa taslak mı?', a: 'Gerçek ve tıklanabilir — gezinme ve durumlar çalışır, böylece paydaşlar gerçek deneyime tepki verir.' },
      { q: 'Tasarımın yerini alır mı?', a: 'Hayır — tasarıma ve mühendisliğe bir metin spesifikasyonu yerine kesin, paylaşılan bir başlangıç noktası verir ve tasarım kapasitesini gerçekten gerektiren işe saklar.' },
      { q: 'Hangi agent’ları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf adaptörü, kendi sağlayıcı anahtarlarınızla.' },
    ],
    ctaTitle: 'Fikrinizi bu gece tıklanabilir kılın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir sonraki spesifikasyonunuzu insanların tıklayabileceği bir şeye dönüştürün — zaten kullandığınız agent’ta.',
  },
  roleMarketing: {
    title: 'Pazarlama ekipleri için Open Design',
    description:
      'Kampanyaları içerik hızında çıkarın. Open Design, agent’ınızın bir komuttan açılış sayfaları, sosyal kartlar ve kampanya görselleri üretmesini sağlar — markaya uygun, talep üzerine, tasarım kuyruğuna girmeden.',
    breadcrumb: 'Pazarlama',
    label: 'İçin · Pazarlama',
    heading: 'Bir komut hızında kampanya görselleri',
    lead: 'Açılış sayfaları, sosyal kartlar, kapaklar, duyuru grafikleri — dille anlatılır, markaya uygun işlenir, aynı gün yayına alınır. Tasarım talebi yok, şablonlarla boğuşmak yok.',
    heroImageAlt:
      'Bir pazarlamacının bir brief’i bir açılış sayfasına ve bir dizi markaya uygun sosyal karta dönüştürmesinin editöryel illüstrasyonu',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, pazarlama için her zaman açık tasarım kaynağıdır: açılış sayfaları ve sosyal için komuttan içeriğe, markaya uygun, böylece kampanyalar metin yazdığınız hızda yayına alınır.',
    stepsTitle: 'Bir pazarlama ekibi Open Design’ı nasıl kullanır',
    steps: [
      {
        title: 'Markayı sabitleyin',
        body: 'DESIGN.md’niz renkleri, yazı tipini ve tonu tutar. Agent’ın yaptığı her içerik otomatik olarak markaya uygundur — içerik başına yeniden biçimlendirme yok.',
        imageAlt: 'Pazarlama içeriklerine uygulanan bir marka sisteminin illüstrasyonu',
      },
      {
        title: 'Kampanyayı üretin',
        body: 'Açılış sayfası, sosyal kartlar, kapaklar, duyuru grafikleri — her biri için tek komut, her kanalda tutarlı bir set.',
        imageAlt: 'Komutlardan üretilen eksiksiz bir kampanya setinin illüstrasyonu',
      },
      {
        title: 'Yayına alın ve iterasyona girin',
        body: 'Açılış sayfaları dağıtabileceğiniz HTML’e işlenir; grafikler PNG’ye aktarılır. Başlığı değiştirin, seti yeniden işleyin — kuyruğu beklemeden.',
        imageAlt: 'Kampanya içeriklerinin hızla yayına alınıp iterasyona girmesinin illüstrasyonu',
      },
    ],
    tableTitle: 'Open Design ile pazarlama vs. her zamanki telaş',
    tableColCapability: 'Neye ihtiyacınız var',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Bugün onsuz',
    tableRows: [
      { capability: 'Bir açılış sayfası yayınlayın', withOd: 'Komut → markaya uygun, dağıtılabilir sayfa', without: 'Tasarıma brief vermek ya da bir site kurucuyla boğuşmak' },
      { capability: 'Tutarlı bir sosyal set', withOd: 'Aynı şablon, yeni metin, kusursuz hizalı', without: 'Her kartı elle hizalamak' },
      { capability: 'Markaya uygun kalın', withOd: 'Her içeriğe uygulanan tek bir DESIGN.md', without: 'Her içeriğin yönergelere uymasını ummak' },
      { capability: 'Kampanya hızında ilerleyin', withOd: 'Bir komutla içerik, aynı gün', without: 'Tasarım birikiminin arkasında kuyrukta beklemek' },
      { capability: 'Maliyet', withOd: 'Açık kaynak, koltuk başına tasarım aracı yok', without: 'Abonelikler artı tasarım saatleri' },
    ],
    featuresTitle: 'Bir pazarlama ekibi neler çıkarabilir',
    features: [
      { title: 'Açılış sayfaları', body: 'Kampanya ve ürün açılışları, dağıtılabilir.', thumb: 'example-saas-landing' },
      { title: 'Sosyal kartlar', body: 'Markaya uygun X / Twitter kartları.', thumb: 'example-card-twitter' },
      { title: 'Galeriler', body: 'Tutarlı, çok slaytlı sosyal setler.', thumb: 'example-social-carousel' },
      { title: 'Posterler', body: 'Duyuru ve etkinlik posterleri.', thumb: 'example-magazine-poster' },
      { title: 'Makale kapakları', body: 'Blog ve bülten kapakları.', thumb: 'example-article-magazine' },
      { title: 'Web sayfaları', body: 'Mikro siteler ve kampanya sayfaları.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Pazarlama tarafından Open Design ile yayına alındı',
    galleryLead:
      'Bir komuttan işlenmiş, markaya uygun kampanya içerikleri. Kampanyanıza yakın olanı seçin ve metninizi yerleştirin.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Kampanya açılış sayfası' },
      { thumb: 'example-card-twitter', caption: 'Sosyal kart' },
      { thumb: 'example-social-carousel', caption: 'Sosyal galeri' },
      { thumb: 'example-magazine-poster', caption: 'Duyuru posteri' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Şablonlara göz atın',
    faqTitle: 'Pazarlama SSS',
    faq: [
      { q: 'Her içerik için bir tasarımcıya ihtiyacımız var mı?', a: 'Hayır. Agent bir komuttan markaya uygun açılış sayfaları ve sosyal içerikler işler, böylece ekip rutin kampanya işini tasarım kuyruğuna girmeden çıkarır.' },
      { q: 'İçerikler markaya nasıl uygun kalır?', a: 'DESIGN.md’niz her şeye otomatik uygulanır — renkler, yazı tipi ve ton her içerikte taşınır.' },
      { q: 'Açılış sayfaları gerçekten yayına alınabilir mi?', a: 'Evet — dağıtabileceğiniz HTML’e işlenir ve grafikler PNG’ye aktarılır. Bunlar yayına alınabilir içeriklerdir, taslak değil.' },
      { q: 'Hangi agent’ları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf adaptörü, kendi sağlayıcı anahtarlarınızla.' },
    ],
    ctaTitle: 'Bir sonraki kampanyanızı bu gece yayına alın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve brief’leri markaya uygun içeriklere dönüştürün — zaten kullandığınız agent’ta.',
  },
};
