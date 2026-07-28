/*
 * Küratörlü Codex tasarım koleksiyonunun Türkçe metinleri.
 * `../codex-i18n.ts` içindeki İngilizce temel sürümden çevrilmiştir.
 */
import type { CodexCopyOverride } from './index';

export const tr: CodexCopyOverride = {
  collectionEyebrow: 'Küratörlü koleksiyon',
  collectionHeading: 'Codex’e gerçek arayüz çıkarttıran tasarım eklentileri',
  collectionLede:
    'OpenAI Codex çalışan kod yazar. Kendi haline bırakılırsa güvenli fontlara, ortalama boşluklara ve ortalanmış Helvetica’ya kaçar. Ona zevk kazandıran eklentiler bunlar: estetik skill’ler ve tasarım sistemi kuralları. Birini kurun ya da hepsini Open Design içinde çalıştırın.',
  collectionStats: [
    { value: '50', label: 'seçilmiş eklenti' },
    { value: '13', label: 'kaynak repo' },
    { value: 'Açık', label: 'kaynak & doğrulanmış' },
  ],
  collectionIntro:
    'Aşağıdaki her eklenti gerçek ve kaynağına bağlantı veriyor. İki işi görüyorlar: kod yazılmadan önce estetik zevki belirlemek ve tasarım sisteminizi ajanın uyduğu kurallara dönüştürmek.',
  collectionCategoryBlurbs: [
    'Tek satır kod yazılmadan önce Codex’in varsayılan estetik kararlarını geçersiz kılın.',
    'Token’larınızı ve bileşenlerinizi, Codex’in uydurmak yerine uyduğu kurallara dönüştürün.',
  ],
  collectionCloserHeading: 'Kurulumu atlayın: Codex ile Open Design içinde tasarlayın',
  filterAll: 'Tümü',
  collectionCloserBody:
    'Open Design, Codex’in etrafında çalışan açık kaynaklı, agent-native tasarım çalışma alanıdır. Sistemlerinizi, skill’lerinizi ve şablonlarınızı tutarlı tutar; ajan da sahibi olduğunuz işi çıkarır.',
  categoryFrontend: 'Frontend & Arayüz',
  categoryDesignSystems: 'Tasarım Sistemleri',
  ctaDownload: 'Open Design’ı indir',
  ctaStarList: 'Listeye yıldız ver',
  ctaBrowseAll: 'Tüm eklentilere göz at',
  ctaViewSource: 'Kaynağı gör',
  ctaOurRepo: 'GitHub’da codex-design',
  cardKind: 'Eklenti',
  cardWhatItDoes: 'Ne yapar',
  cardCta: 'Eklentiyi gör',
  detailWhatIsIt: 'Nedir',
  detailWhyForDesign: 'Tasarım için neden önemli',
  detailHowWithCodex: 'Codex ile nasıl çalıştırılır',
  detailExampleTag: 'Ne zaman başvurmalı',
  detailSource: 'Kaynak',
  detailCategory: 'Kategori',
  detailMaintainer: 'Yazar',
  detailTags: 'Etiketler',
  detailLicense: 'Lisans',
  detailCovers: 'Neleri kapsıyor',
  detailUpstream: 'Kaynak SKILL.md’den',
  detailCodexNote: 'Codex ile çalışır',
  detailTraction: 'İlgi',
  detailRepo: 'Kaynak depo',
  detailStars: 'Yıldız',
  installHeading: 'Nasıl kurulur',
  installRunInCodex: 'Bunu Codex içinde çalıştırın.',
  installRestart: 'Yeni skill’i alması için Codex’i yeniden başlatın.',
  installClone: 'Depoyu klonlayın.',
  installPoint: 'Codex’i skill dosyasına yönlendirin.',
  installThenUse: 'Sonra istediğiniz arayüzü anlatın. Codex skill’e uyar.',
  installNote:
    'Buradaki her eklenti ücretsiz, açık kaynak ve gerçek üst kaynağına bağlantı veriyor.',
  installNoteCta: 'Koleksiyonun tamamına göz atın',
  detailMoreOnList: 'codex-design listesinde dahası',
  detailRelated: 'Diğer Codex tasarım eklentileri',
  finalEyebrow: 'Sonraki adım',
  detailCloserHeading: 'Kurulum derdi olmadan Open Design ile tasarlayın',
  detailCloserBody:
    'Bu eklentiyi kendiniz kurun ya da Open Design ile Codex’in etrafına baştan sona küratörlü bir tasarım katmanı geçirin. Kendi anahtarınızı getirin, çıktınızın sahibi olun.',
  skills: {
    'gpt-taste': {
      tagline:
        'GSAP scroll hareketi ve boşluksuz bento ızgaralarıyla ödüllük tarzda landing page’ler kurar.',
      whatIsIt:
        'Hero, tipografi, bileşen ve GSAP paradigmalarını simüle edilmiş rastgele seçimle zorunlu kılan bir frontend direktifi. Ayrıca AIDA sayfa yapısını ve geniş bölüm boşluklarını dayatır.',
      whyForDesign: [
        'Hero başlıkları iki ya da üç satırda kalır; çünkü kapsayıcılar duvara toslamak yerine genişler.',
        'Bento ızgaraları grid-flow-dense kullanır; hiçbir hücre boş ya da bozuk kalmaz.',
        'Ucuz meta-etiketler yasaktır ve çıktı öncesi buton metni kontrastı doğrulanır.',
      ],
      howWithCodex: [
        'Bir sayfa isteyin; herhangi bir arayüz kodundan önce skill bir design_plan bloğu üretir.',
        'Rastgele seçimlerini gözden geçirin: hero düzeni, font seti, bileşenler, GSAP paradigmaları.',
        'Kalkış öncesi kontrol listesini denetleyin: hero genişlik hesabı, ızgara yoğunluğu, etiket taraması, kontrast.',
      ],
    },
    'stitch-design-taste': {
      tagline: 'Google Stitch’i sıradan olmayan ekranlara yönlendiren bir DESIGN.md yazar.',
      whatIsIt:
        'Google Stitch ekran üretimi için optimize edilmiş bir DESIGN.md dosyası oluşturur. Atmosferi, rengi, tipografiyi, bileşenleri, düzeni, hareketi ve açık bir yasaklı desen listesini kodlar.',
      whyForDesign: [
        'Stitch ekranları neon mor degradeler yerine %80 doygunluğun altında tek bir vurgu rengi devralır.',
        'Ortalanmış hero’lar ve üç eşit kart sırası, belirlenen varyans eşiğinin üzerinde yasaktır.',
        'Yükleme ve boş durumlar, jenerik döngü ikonları yerine iskelet ve kurgulanmış hale gelir.',
      ],
      howWithCodex: [
        'Projenin havasını tarif edin; skill yoğunluk, varyans ve hareket puanlarını belirler.',
        'Onaltılık kodlar ve işlevsel renk rolleriyle yedi bölümlük bir DESIGN.md üretir.',
        'Bu dosyayı doğrudan Stitch’e, ya da Stitch MCP sunucusu üzerinden verin.',
      ],
    },
    'image-to-code': {
      tagline:
        'Önce tasarım görselleri üretir, onları analiz eder, sonra eşleşen frontend kodunu kurar.',
      whatIsIt:
        'Görsel web işleri için görsel-önce bir iş akışı. Ajan bölüm referans görselleri üretir, bunlardan tipografi, boşluk, renk ve bileşenleri çıkarır, sonra siteyi bunlara uyacak şekilde kodlar.',
      whyForDesign: [
        'Kod gerçek bir görsel referansı izler; bu yüzden uygulama jenerik düzenlere kaymaz.',
        'Her bölüm kendi büyük görselini alır; metin ve boşluk böylece incelenebilir kalır.',
        'Hero’lar üç başlık satırının altında kalır ve iç içe kapsayıcı yığınlarından arınır.',
      ],
      howWithCodex: [
        'Bölüm sayısını belirtin; Codex içinde skill her bölüm için bir görsel üretir.',
        'Buton ya da yazı detayı okunaksız kaldığında daha yakın bir detay render isteyin.',
        'Herhangi bir uygulama dosyası yazmadan önce netlik kontrolünü çalıştırtın.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Premium mobil uygulama ekran akışlarını kod değil, görsel olarak üretir.',
      whatIsIt:
        'iOS, Android ve çapraz platform ürünler için ekran konsepti ve akışı üreten yalnızca görsel bir skill. Ekranları sade telefon mockup’ları içinde sunar ve asla kod yazmaz.',
      whyForDesign: [
        'Ekranlar, telefonda web sitesi gibi durmak yerine güvenli alanlara ve sistem bölgelerine saygı gösterir.',
        'Sabitlenmiş bir tasarım kılavuzu; paleti, yazı tipini ve ikonları her ekranda tutarlı tutar.',
        'Çok ekranlı setler, birbiriyle ilgisiz tek seferlik mockup’lar değil, inandırıcı bir akış oluşturur.',
      ],
      howWithCodex: [
        'Uygulama kategorisini ve ekran sayısını belirtin; her ekran kendi görseline dönüşür.',
        'Skill önce bir platform modu seçer: iOS, Android ya da çapraz platform nötr.',
        'Metni küçük ya da çerçevesi düzensiz kalan her ekranı yeniden ürettirin.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Landing page’in her bölümü için ayrı bir yatay referans görsel üretir.',
      whatIsIt:
        'Web sitesi tasarım referansları için bir görsel yönetmenlik skill’i. Her bölüm için tek bir kilitli palet ve set boyunca çeşitlenen hero kompozisyonuyla ayrı bir yatay görsel üretir.',
      whyForDesign: [
        'Sekiz bölümlük bir landing page, tek bir sıkışık pano yerine sekiz okunabilir kompozisyon verir.',
        'Hero kompozisyonu, aşırı kullanılan sol metin, sağ görsel varsayılanının ötesine çeşitlenir.',
        'Tek bir palet, yazı ölçeği ve CTA ailesi, üretilen her karede korunur.',
      ],
      howWithCodex: [
        'Kaç bölüm istediğinizi söyleyin; belirtilmezse landing page varsayılan olarak altı bölüme kurulur.',
        'Skill önce sayıyı bildirir, sonra her çıktıyı bölüm numarasıyla etiketler.',
        'Hero ölçeğini ve arka planı yönlendirmek için editoryal ya da sinematik gibi hava kelimeleri verin.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Düz bento ızgaralarıyla sıcak monokrom editoryal arayüzler kurar.',
      whatIsIt:
        'Belge tarzı minimal arayüzler için bir frontend protokolü. Sıcak bir monokrom palet, serif ve mono tipografik hiyerarşi, 1px kenarlıklı bento kartları ve soluk pastel vurguları sabitler.',
      whyForDesign: [
        'Her kart ve ayırıcı, keskin bir radius’la tek bir 1px açık gri kenarlık kullanır.',
        'Vurgular yalnızca etiketler ve satır içi kod için ayrılmış dört soluk pastelden gelir.',
        'Bölümler, düz boş arka planlar yerine düşük opaklıklı görsellerden derinlik kazanır.',
      ],
      howWithCodex: [
        'Bir sayfa isteyin; skill önce py-24 ya da py-32 makro boşluğunu kurar.',
        'Yazı genişliğini max-w-4xl’le sınırlar ve monokrom değişkenleri hemen uygular.',
        'Scroll’la beliren solmalar yalnızca transform ve opacity üzerinde IntersectionObserver’la çalışır.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Brief’i okur, bir yön seçer, şablonvari olmayan arayüzler çıkarır.',
      whatIsIt:
        'Landing page’ler, portfolyolar ve yeniden tasarımlar için özensizlik karşıtı bir frontend skill’i. Bir tasarım okuması belirtir, varyans, hareket ve yoğunluk düğmelerini ayarlar, sonra uzun bir kalkış öncesi kontrol çalıştırır.',
      whyForDesign: [
        'Kurumsal brief’ler, elle yazılmış taklit CSS yerine resmi tasarım sistemi paketini alır.',
        'Kalkış öncesi kontrol; uzun tireyi, bölüm numaralı eyebrow’ları, scroll ipuçlarını ve tekrarlayan CTA niyetini yasaklar.',
        'Düzen tekrarı sınırlandırılır; sekiz bölüm en az dört farklı aileden kurulur.',
      ],
      howWithCodex: [
        'Ajan, herhangi bir kod yazmadan önce tek satırlık bir tasarım okuması belirtir.',
        'Üç düğmeyi ayarlar: tasarım varyansı, hareket yoğunluğu, görsel yoğunluk.',
        'Kalkış öncesi listedeki her madde geçmeli; yoksa sayfa bitmiş sayılmaz.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Analog tane dokusuyla katı İsviçre baskısı ya da CRT terminal arayüzleri kurar.',
      whatIsIt:
        'İsviçre tipografik baskısını askeri terminal estetiğiyle birleştiren bir arayüz tasarım sistemi. Katı ızgaralar, uç yazı ölçeği kontrastı, tek bir tehlike kırmızısı vurgu ve simüle edilmiş analog bozulma tanımlar.',
      whyForDesign: [
        'Proje başına tek bir zemin seçilir; açık ve koyu asla karışmaz.',
        'border-radius tamamen reddedilir; her köşe doksan derecede kalır.',
        'Halftone, tarama çizgisi ve gürültü filtreleri, yüzeylerin düz vektör gibi durmasını engeller.',
      ],
      howWithCodex: [
        'Tek bir arketip seçin: İsviçre endüstriyel baskı ya da taktik telemetri CRT terminali.',
        'Makro başlıklar negatif izlemeyle clamp kullanır; meta veriler küçük büyük harf monospace kullanır.',
        'Zıt arka planlı 1px ızgara boşlukları, jilet inceliğinde ayırıcı çizgiler üretir.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Var olan bir siteyi denetler ve işlevselliği bozmadan yükseltir.',
      whatIsIt:
        'Var olan projeler için bir tarama, teşhis ve düzeltme iş akışı. Tipografiyi, rengi, düzeni, durumları, içeriği, ikonları ve kod kalitesini denetler, sonra mevcut stack içinde hedefli yükseltmeler uygular.',
      whyForDesign: [
        'Mor-mavi AI degradeleri ve üç eşit kart sırası, düşünülmüş alternatiflerle değiştirilir.',
        'Kart gruplarındaki butonlar, farklı içeriklere rağmen tek bir alt çizgiye hizalanır.',
        'Eksik hover, focus, yükleme, boş ve hata durumları tamamlanır.',
      ],
      howWithCodex: [
        'Önce framework ve stil yöntemini belirlemek için kod tabanını tarar.',
        'Herhangi bir şeyi değiştirmeden önce her jenerik deseni ve zayıf noktayı listeler.',
        'Düzeltmeler önceliğe göre gelir: fontlar, renk, durumlar, düzen, bileşenler, tipografi cilası.',
      ],
    },
    'brandkit': {
      tagline: 'Marka kılavuzu panoları, logo sistemleri ve kimlik sunumlarını görsel olarak üretir.',
      whatIsIt:
        'Marka kiti panoları için bir görsel üretim skill’i. Logo sistemleri, renk ve yazı panellerini, mockup’ları ve atmosfer görsellerini ızgara tabanlı bir sunum panosunda düzenler.',
      whyForDesign: [
        'Varsayılan 3x3 panel sistemi; logoyu, kuruluşunu, rengi, yazıyı ve uygulamaları kapsar.',
        'Logo konseptleri; monogram, metafor füzyonu ya da negatif alan gibi belirtilen bir yöntemi izler.',
        'Panolar ritim taşır: tekdüze yükseklik yerine sessiz, işlevsel, duygusal ve teknik paneller.',
      ],
      howWithCodex: [
        'Markayı ve kategoriyi verin; skill önce bir görsel mod seçer.',
        'Varsayılan olarak 3x3 bir panoya, ya da 2x3 referans tarzı mini bir sunuma döner.',
        'Metni az tutun: marka adı, tek bir tagline, tek bir komut, birkaç etiket.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Scroll ile anlatan sayfalar: Lenis, ScrollTrigger, yapışkan kart yığınları.',
      whatIsIt:
        'Lenis akıcı scroll, GSAP ScrollTrigger, kademeli belirmeler, yapışkan kart yığınları, parallax ve scroll’a bağlı geçişleri kapsayan bir scroll koreografisi skill’i.',
      whyForDesign: [
        'Scroll koreografisi, ajan sayfası ile stüdyo sayfası arasındaki en büyük farktır.',
        'Rastgele animasyon değerleri yerine adlandırılmış hareket token’ları verir.',
        'Bir sayfa anatomisi tanımlar; bölümler bilinçli bir sırayla gelir.',
      ],
      howWithCodex: [
        'Depoyu klonlayın ve Codex’i bu skill dosyasına yönlendirin.',
        'Sayfanın scroll boyunca anlatması gereken hikâyeyi tarif edin.',
        'Hareket token’larını ayarlayın; skill’in kurduğu yığını ve anatomiyi koruyun.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'CSS transform numarası değil, gerçekten ışıklandırılmış bir 3D hero nesnesi.',
      whatIsIt:
        'Geometrik mesh derinliği, fizik tabanlı malzeme, yönlü ve ortam ışığı, perspektif kamera ve süzülen hareketle gerçek bir 3D WebGL nesnesi.',
      whyForDesign: [
        'Ajanlar CSS transform’a kaçıp düz bir taklit üretir; bu skill gerçek ışık verir.',
        'Malzeme ve ışık varsayılanları sayesinde nesne oyuncak değil, ürün gibi durur.',
        'Hareket varsayılan olarak incedir; nesne hero’yu çalmaz, sabitler.',
      ],
      howWithCodex: [
        'Depoyu klonlayın ve Codex’i bu skill dosyasına yönlendirin.',
        '3D bir hero nesnesi isteyin ve istediğiniz malzemeyi tarif edin.',
        'Malzeme ve ışık varsayılanlarını ayarlayın; kamera reçetesini koruyun.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Kartlar, paneller ve navigasyon çubukları için rafine degrade kenarlar.',
      whatIsIt:
        'Bir yüzey detayı skill’i: kartlar, fiyat panelleri, navigasyon çubukları, modal’lar, butonlar ve hero yüzeyleri için gürültüsüz, ince degrade kenar işlemeleri.',
      whyForDesign: [
        'Sıradan çerçeveli bir kutuyu sofistike bir yüzeyden ayıran şey kenar işlemesidir.',
        'Zevk kurallarını kodlar; efekt neona kaymadan ince kalır.',
        'Tailwind kısayoluyla gelir; mevcut stack’e olduğu gibi düşer.',
      ],
      howWithCodex: [
        'Depoyu klonlayın ve Codex’i bu skill dosyasına yönlendirin.',
        'Bileşeni isteyin; kenar işlemesini skill sağlar.',
        'Yüzeye göre basit ya da maskeli deseni seçin.',
      ],
    },
    'high-end-visual-design': {
      tagline: 'Jenerik AI varsayılanlarını engeller, ajans düzeyinde düzen ve hareketi dayatır.',
      whatIsIt: 'Yaygın AI tasarım varsayılanlarını yasaklayan, sonra herhangi bir arayüz kodu yazılmadan önce ajanı tek bir hava arketipi ve tek bir düzen arketipi seçmeye zorlayan bir direktif skill’i.',
      whyForDesign: [
        'Inter, Roboto ve kalın Lucide ikonları yasaktır; böylece çıktı şablonvari görünmeyi bırakır.',
        'Kartlar iç içe dış kabuk ve iç çekirdek alır; kapsayıcılara gerçek işlenmiş bir derinlik kazandırır.',
        'Bölüm dolgusu py-24’ten başlar; böylece düzenler sıkışmak yerine nefes alır.',
      ],
      howWithCodex: [
        'Codex’ten bir sayfa isteyin; önce sessizce varyans motorunu çevirir.',
        'Arka plan dokusunu ve yazı ölçeğini iskeletler, sonra çift çerçeveli kapsayıcılar kurar.',
        'Özel cubic-bezier hareket enjekte eder, sonra çıktı öncesi kontrol listesini çalıştırır.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Bir frontend işini tek bir küratörlü, iddialı kitaplık seçimiyle eşleştirir.',
      whatIsIt: 'Açıkça çağrılan bir arama skill’i. Belirtilen bir işi; primitive’leri, hareketi, grafikleri, sanallaştırmayı, state ve stili kapsayan küratörlü bir tablodan tek bir önerilen kitaplığa eşler.',
      whyForDesign: [
        'İş başına tek bir öneri; üzerinde tartışılacak seçenek menüsü yok.',
        'Önce package.json’a bakar; böylece projede zaten olanı yeniden kullanır.',
        'Elle yazılmış dropdown ve toast’ları yakalar, onları erişilebilir primitive’lerle değiştirir.',
      ],
      howWithCodex: [
        'Açıkça çağırın; kendi başına asla tetiklenmez.',
        'Kitaplık adını değil, işi belirtin, örneğin ‘toast lazım’ gibi.',
        'Tek bir kitaplık söyler, kullanımını açıklar, sonra onu bağlar.',
      ],
    },
    'apple-design': {
      tagline: 'Apple’ın akıcı arayüz ilkeleri, web yayları ve jestlerine çevrilmiş.',
      whatIsIt: 'Apple WWDC tasarım konuşmalarından, başta Designing Fluid Interfaces’ten süzülen ve CSS, Pointer Events ile yay kitaplıklarına eşlenen bilgi. Yanıt, kesilebilirlik, momentum, malzemeler, tipografi ve erişilebilirliği kapsar.',
      whyForDesign: [
        'Geri bildirim pointer-down anında tetiklenir; basılan öğeler ölü hissettirmeyi bırakır.',
        'Animasyonlar ekrandaki canlı değerden başlar; kesintide görünen sıçramaları ortadan kaldırır.',
        'Fiskeler bir iniş noktası öngörür; savurmalar jestin hedeflediği yere iner.',
      ],
      howWithCodex: [
        'Codex’ten bir sheet, drawer ya da sürükleme etkileşimi kurmasını isteyin.',
        'Pointer capture ile 1:1 takip eder ve hız geçmişini kaydeder.',
        'Bırakıldığında hızı, verilen sönümleme değerleriyle bir yaya devreder.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Muğlak bir hareket tarifini tam teknik terimine çevirir.',
      whatIsIt: 'Ters arama sözlüğü. Kullanıcı bir hareket efektini gevşekçe tarif eder; skill kesin terimi birebir alıntılayarak, birkaçı uyabildiğinde yakın alternatiflerle döner.',
      whyForDesign: [
        'Tasarımcıya, bir ajanı yönlendirecek doğru kelimeyi verir.',
        'clip-path’e karşı mask, pop in’e karşı bounce gibi yakın çiftleri ayırt eder.',
        'Terim uydurmayı reddeder; böylece adlandırma güvenilir kalır.',
      ],
      howWithCodex: [
        'Gördüğünüzü tarif edin, örneğin ‘iOS lastik bant scroll’ hareketi gibi.',
        'Kalınlaştırılmış terimi ve tek satırlık bir sözlük tanımını döndürür.',
        'İki terim de makul biçimde uyabildiğinde alternatifleri isteyin.',
      ],
    },
    'emil-design-eng': {
      tagline: 'Emil Kowalski’nin animasyon zamanlaması, easing ve bileşen cilası kuralları.',
      whatIsIt: 'Bir tasarım mühendisliği felsefesini kodlar: animasyon karar çerçevesi, yay rehberi, bileşen ilkeleri, clip-path teknikleri, jest yönetimi, performans kuralları ve bir inceleme kontrol listesi.',
      whyForDesign: [
        'Sık yapılan eylemler animasyonlarını tümüyle yitirir; böylece komut paletleri anlık kalır.',
        'Girişler scale(0.95)’ten başlar, asla scale(0)’dan değil; böylece hiçbir şey yoktan belirmez.',
        'Popover’lar merkezleri yerine tetikleyicilerinden ölçeklenir; mekânsal bağı korur.',
      ],
      howWithCodex: [
        'Codex’ten arayüz kodunu incelemesini isteyin; bir Before, After, Why tablosu döndürür.',
        'Yeni hareket için şunları yanıtlar: bu animasyonlanmalı mı, neden, hangi easing, ne kadar hızlı.',
        'Kontrol listesini uygular; transition: all kullanımını ve 300ms üzeri süreleri işaretler.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Logo, kimlik, slayt, banner ve ikon işlerini yönlendiren tek bir giriş noktası.',
      whatIsIt: 'İşleri alt skill’lere ya da yerleşik modüllere yönlendiren birleşik bir tasarım skill’i. Yerleşikler; Gemini betikleriyle logo üretimi, kurumsal kimlik mockup’ları, HTML slaytlar, banner’lar, sosyal fotoğraflar ve SVG ikonları kapsar.',
      whyForDesign: [
        'Logo, kimlik mockup’ları ve sunum, hepsi tek bir marka girdisinden gelir.',
        'İkonlar SVG metni olarak üretilir; böylece raster değil, düzenlenebilir kalır.',
        'Banner kuralları güvenli alanları, en fazla iki fontu ve tek bir CTA’yı zorunlu kılar.',
      ],
      howWithCodex: [
        'Önce GEMINI_API_KEY’i export edin ve google-genai ile pillow’u kurun.',
        'Bir tasarım brief’i için scripts/logo/search.py, sonra görseller için generate.py çalıştırın.',
        'Teslim edilebilir mockup’lar üretmek için logoyu scripts/cip/generate.py’ye verin.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Banner’ları HTML’de ölçüsüne göre tasarlar, sonra PNG olarak dışa aktarır.',
      whatIsIt: 'Beş adımlı bir banner iş akışı: gereksinimleri topla, sanat yönetimini araştır, banner’ı HTML ve CSS’te üretilen görsellerle kur, tam platform piksellerine göre ekran görüntüsü al, sonra yineleme için seçenekleri sun.',
      whyForDesign: [
        'Her banner tam platform piksellerinde dışa aktarılır; hiçbir şey kırpılmaz ya da yeniden boyutlanmaz.',
        'Üretilen görseller metinsiz render edilir; böylece başlıklar keskin HTML kalır.',
        'İstek başına üç sanat yönü; böylece karar öncesi karşılaştırma yapılır.',
      ],
      howWithCodex: [
        'Amaç, platform, içerik, marka, stil ve adet sorularını yanıtlayın.',
        'Güvenli alanlar uygulanmış olarak sanat yönü başına bir HTML banner kurar.',
        'Her birini belirlenen genişlik ve yükseklikte ekran görüntüsüne alır, sınırı aşan dosyaları sıkıştırır.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'shadcn bileşenleri ve Tailwind yardımcılarıyla erişilebilir arayüzler kurar.',
      whatIsIt: 'Radix primitive’leri üzerinde bir shadcn bileşen katmanını, bir Tailwind yardımcı stil katmanını ve bir canvas görsel tasarım katmanını birleştirir. Temalandırma, erişilebilirlik, responsive kurallar ve özelleştirme için referans dosyaları içerir.',
      whyForDesign: [
        'Dialog’lar ve menüler Radix focus yönetimini devralır; böylece erişilebilirlik sonradan eklenmez.',
        'Tema renkleri CSS değişkenlerinde yaşar; böylece dark mode tutarlı kalır.',
        'Mobile-first breakpoint’ler, düzenlerin küçük başlayıp yukarı doğru katmanlandığı anlamına gelir.',
      ],
      howWithCodex: [
        'Framework ve temayı yapılandırmak için npx shadcn@latest init çalıştırın.',
        'Bileşenleri npx shadcn@latest add button card dialog form ile ekleyin.',
        'Özel token’lı bir config üretmek için scripts/tailwind_config_gen.py çalıştırın.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Marka kılavuzlarını, tasarım token’larını ve varlıkları senkron tutar.',
      whatIsIt: 'Marka bağlamını prompt’lara enjekte eden, varlıkları doğrulayan, renkleri çıkaran ve brand-guidelines.md’yi tasarım token JSON’una ve CSS değişkenlerine senkronlayan betikler etrafında kurulu bir marka kimliği skill’i.',
      whyForDesign: [
        'Token’lar ve CSS için tek bir markdown dosyası tek doğruluk kaynağıdır.',
        'Çıkarılan renkler palete karşı karşılaştırılır; savrulmayı erken yakalar.',
        'Varlıklar onaydan önce adlandırma, boyut ve format açısından denetlenir.',
      ],
      howWithCodex: [
        'docs/brand-guidelines.md’yi düzenleyin, sonra scripts/sync-brand-to-tokens.cjs çalıştırın.',
        'scripts/inject-brand-context.cjs --json ile doğrulayın.',
        'Herhangi bir yeni dosyayı göndermeden önce scripts/validate-asset.cjs ile kontrol edin.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Chart.js ve düzen desenleriyle HTML sunum destelleri kurar.',
      whatIsIt: 'Stratejik HTML sunumları için küçük bir yönlendirme skill’i. Bir alt komutu ayrıştırır, sonra düzen desenlerini, bir HTML şablonunu, metin yazarlığı formüllerini ve slayt stratejilerini kapsayan referans dosyalarını yükler.',
      whyForDesign: [
        'Slaytlar HTML’dir; böylece yazı ve boşluk gerçek tasarım token’larını izler.',
        'Chart.js veri slaytlarını yönetir; böylece sayılar yapıştırılmış görsel yerine canlı kalır.',
        'Düzen desenleri bir setten seçilir; desteyi görsel olarak tutarlı tutar.',
      ],
      howWithCodex: [
        'Onu create alt komutu artı bir konu ve slayt sayısıyla çağırın.',
        'references/create.md’yi yükler ve o oluşturma iş akışını izler.',
        'Düzen desenlerini ve metin yazarlığı formüllerini referans dosyalarından çeker.',
      ],
    },
    'design-system-tokens': {
      tagline: 'Üç katmanlı tasarım token’ları, bileşen spesifikasyonları ve token uyumlu slayt üretimi.',
      whatIsIt: 'Primitive, semantic ve bileşen token katmanlarını CSS değişkenleri olarak kapsayan; ayrıca bileşen durum spesifikasyonları ve aynı token’lardan desteler kuran bir slayt üreticisi içeren bir tasarım sistemi skill’i.',
      whyForDesign: [
        'Semantic token katmanı, açık ve koyu tema geçişini yeniden yazım değil, bir config değişikliği hâline getirir.',
        'Bileşen spesifikasyonları default, hover, active ve disabled durumlarını tablolar; böylece devir teslim hiçbir şeyi muğlak bırakmaz.',
        'Bir doğrulayıcı sabit kodlanmış hex değerlerini işaretler; bileşenleri ve slaytları token sisteminde tutar.',
      ],
      howWithCodex: [
        'CSS değişken dosyanızı üretmek için bir JSON token config üzerinde generate-tokens.cjs çalıştırın.',
        'Codex’ten bileşen spesifikasyonları isteyin, sonra ham değerleri yakalamak için src/ üzerinde validate-tokens.cjs çalıştırın.',
        'Bir deste için düzenleri seçmek üzere search-slides.py’yi position ve context bayraklarıyla kullanın.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Katı bir 8pt ızgarada Gelasio serif ile dergi düzeni.',
      whatIsIt: 'Modern bir editoryal görünüm için bir tasarım sistemi kılavuz skill’i: hem gövde hem başlık için Gelasio serif, Ubuntu Mono, beyaz yüzeylerde neredeyse siyah #111111 ve bir 8pt taban ızgarası.',
      whyForDesign: [
        'Tek bir aileden serif başlık ve gövde, uzun okuma bölümlerini tipografik olarak tutarlı tutar.',
        'Bir 8pt taban ızgarası; başlıklar, gövde metni ve boşluk boyunca dikey ritmi zorunlu kılar.',
        'Erişilebilirlik çıtası; reduced-motion desteğini, 44px dokunma hedeflerini ve yüksek kontrast yönetimini içerir.',
      ],
      howWithCodex: [
        'Codex’ten tasarım niyetini yeniden ifade etmesini, sonra bileşenlere dokunmadan önce token’ları tanımlamasını isteyin.',
        'Anatomiyi, varyantları, durumları ve responsive davranışı kapsayan bileşen kuralları isteyin.',
        'Bir kod incelemecisinin çıktıyı doğrulayabilmesi için QA kontrol listesiyle kapatın.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Krem üzerine kil vurgusu, DM Serif Display başlıklar, uzun biçimli okuma.',
      whatIsIt: 'Güneşte pişmiş bir editoryal arayüz için bir kılavuz skill’i: krem #F3E9D8 yüzeyler, tek bir terracotta #C56A3C vurgu, DM Serif Display başlıklar, JetBrains Mono. Bloglar ve hikâye anlatımı için ayarlanmış.',
      whyForDesign: [
        'Yalnızca tek bir vurgu rengi; böylece vurgu az kalır ve hiyerarşiyi başlıklar taşır.',
        'Sıcak krem yüzeyler, saf beyaz sayfalara kıyasla uzun makalelerde parlamayı azaltır.',
        'Mürekkep kahvesi gövde metni üzerindeki serif başlıklar, net bir editoryal ritim kurar.',
      ],
      howWithCodex: [
        'Herhangi bir bileşen yazmadan önce Codex’i terracotta ve krem token’larına yönlendirin.',
        'Bileşen başına anatomi, varyantlar ve durumları, boşluk token’ları açıkça adlandırılmış olarak isteyin.',
        'Var olan tutarsız arayüzü yenilerken anti-desenleri ve geçiş notlarını isteyin.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Retro, yüksek kontrastlı ekranlar için nokta desenli gölgeleme ve sınırlı palet.',
      whatIsIt: 'Sınırlı bir paletten tonları simüle etmek için nokta desenleri kullanan dither arayüzler için bir kılavuz skill’i. Open Sans gövde, Space Grotesk başlık, IBM Plex Mono, mavi ve mor vurgular.',
      whyForDesign: [
        'Nokta desenleri degradelerin yerini alır; böylece gölgeleme, bilinçli olarak kısıtlanmış bir renk setinde ayakta kalır.',
        'Yüksek kontrastlı render, yüzeyler yoğun desen dokusu taşısa bile metni okunur tutar.',
        'Kurallar dekoratif hareketi yasaklar; retro işlemin görsel gürültüye dönüşmesini durdurur.',
      ],
      howWithCodex: [
        'Önce Codex’e palet sınırını söyleyin, sonra desen tabanlı gölgeleme kurallarını türetmesine izin verin.',
        'Desenli yüzeylerin okunur kalması için empty, loading ve error durumlarını isteyin.',
        'Bu skill’in açıkça belirttiği tıklama alanlarını ve focus durumlarını doğrulayın.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Space Mono yazıyla taş grisinde yumuşak kabartmalı yüzeyler.',
      whatIsIt: 'Neumorphic arayüz için bir kılavuz skill’i: monokrom taş #E7E5E4 yüzeyde iç ve dış gölgeler, teal #006666 vurgu, başlık ve gövde için Space Mono, kompakt yoğunlukta boşluk.',
      whyForDesign: [
        'Monokrom yüzeyler, derinliğin renk kontrastından değil gölgeden geldiği anlamına gelir.',
        'Kompakt yoğunlukta boşluk, dashboard ve ayar ekranları gibi kontrol yoğun panellere uygundur.',
        'Kurallar görsel metaforları karıştırmayı yasaklar; böylece yumuşak kabartma tek derinlik dili olarak kalır.',
      ],
      howWithCodex: [
        'Herhangi bir tekil kontrolü stillemeden önce Codex’e yüzey ve gölge token’larını belirlettirin.',
        'Yumuşak gölgeler tek başına klavye kullanıcılarını yüzüstü bıraktığından, görünür focus durumları isteyin.',
        'Bu skill’in belirttiği gibi, ARIA’dan önce semantic HTML’i zorunlu kılın.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Krem üzerinde çeşitli bloklardan ızgara, Inter yazı, kompakt ölçek.',
      whatIsIt: 'İçeriği değişen boyutlarda ızgara blokları olarak sunan bento box düzenleri için bir kılavuz skill’i. Baştan sona Inter, kompakt 12 ile 32 arası yazı ölçeği, krem üzerinde şeftali ve mavi vurgular.',
      whyForDesign: [
        'Değişen blok boyutları hiyerarşiyi taşır; böylece sıralamayı ızgaranın kendisi yapar.',
        'Kompakt 12 ile 32 arası yazı ölçeği, yoğun metni küçük döşemelere sığdırır.',
        'Krem #FFF5E6 yüzey, blok kenarlarını ağır kenarlıklar olmadan okunur tutar.',
      ],
      howWithCodex: [
        'Codex’ten her bloğa içerik önceliğine göre bir boyut atamasını isteyin.',
        'Döşemeleri yerleştirmeden önce boşluk token’larını 4 ile 32 arası ölçekte tanımlayın.',
        'Bu skill’in uç durum olarak listelediği taşma ve uzun etiket yönetimini isteyin.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Kabarık yuvarlak 3D şekiller, Poppins başlıklar, beyaz üzerine mavi.',
      whatIsIt: 'Claymorphic arayüz için bir kılavuz skill’i: yoğrulabilir kili taklit eden yumuşak, yuvarlak, kabarık şekiller. Poppins başlık, Montserrat gövde, mavi #3B82F6 vurgu ve beyaz üzerine koyu mavi metin.',
      whyForDesign: [
        'Kabarık yuvarlak biçimler, butonlara ek etiket olmadan bariz bir basılabilirlik hissi verir.',
        'Beyaz üzerine koyu mavi metin #1C398E, palet oyuncul kalırken kontrastı korur.',
        'Kurallar metafor karıştırmayı yasaklar; böylece kil derinliği asla cam ya da düz ile birleşmez.',
      ],
      howWithCodex: [
        'Kil görünümünü tanımladıkları için önce Codex’ten radius ve gölge token’ları isteyin.',
        'Belirtildiği gibi Poppins başlığı Montserrat gövdeyle eşleştirin, iki benzer sans yüzüyle değil.',
        'focus-visible ve disabled durumlarının yumuşak şekil işlemesinden sağ çıktığını kontrol edin.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Ham betondan esinli düzenler, Darker Grotesque başlık, kırmızı ve okra.',
      whatIsIt: '1950’lerin ham beton mimarisinden alınan brutalist arayüz için bir kılavuz skill’i: süssüz, işlevsel, bilinçli olarak rahatsız edici. Darker Grotesque başlık yazısı, beyaz üzerine #DD614C kırmızı ve #DAA144 okra.',
      whyForDesign: [
        'Kalın süssüz öğeler dekorasyonu bırakır; böylece ağırlığı yapı ve metin taşır.',
        'İki güçlü vurgu, kırmızı ve okra, degradelerin ve gölgelerin yerini tümüyle alır.',
        'Erişilebilirlik tabanı yine de geçerlidir; böylece rahatsız edici düzenler kontrastı ve görünür focus’u korur.',
      ],
      howWithCodex: [
        'Codex bileşenleri seçmeden önce ona tonun kalın ve süssüz olduğunu söyleyin.',
        'Kalite kapılarının gerektirdiği gibi her kuralı bir token’a ya da eşiğe bağlayın.',
        'Çıktıyı incelerken her yap kuralını somut bir yapma örneğiyle eşleştirin.',
      ],
    },
    'hallmark-design-skill': {
      tagline: '58 kapı ve zorunlu yapısal çeşitlilikle özensizlik karşıtı bir tasarım akışı.',
      whatIsIt: 'AI kod asistanları için tek bir varsayılan kurma akışı ve üç fiili olan bir tasarım skill’i: audit, redesign ve study. Yapısal çeşitliliği zorlar; böylece iki yapım tek bir sayfa ritmini paylaşmaz.',
      whyForDesign: [
        'Çeşitlendirme kuralları, ardışık yapımlar boyunca farklı makro yapılar, navigasyonlar ve footer’lar dayatır.',
        'Kilitli token’lar, token bloğunu atlayan satır içi hex ya da font-family değerlerini yasaklar.',
        'Her çıktı 320, 375, 414 ve 768 piksel genişliklerinde doğrulanır.',
      ],
      howWithCodex: [
        'Önce kalkış öncesi taramanın mevcut fontları, paleti ve hareket kitaplıklarını okumasına izin verin.',
        'Kitle, kullanım senaryosu ve ton kapısını yanıtlayın ya da devam edin deyin.',
        'Düzenleme yapmadan sıralı bir yapılacaklar listesi için bir sayfada hallmark audit çalıştırın.',
      ],
    },
    'impeccable': {
      tagline: 'Frontend arayüzleri kurmak, eleştirmek ve inceltmek için yirmi dört komut.',
      whatIsIt: 'Komutları build, evaluate, refine, enhance, fix ve iterate olarak gruplanmış bir frontend tasarım skill’i. Proje bağlamını ve bir register referansını okur, sonra üretim kalitesinde kod yazar.',
      whyForDesign: [
        'Register ayrımı, pazarlama sayfalarını ve ürün arayüzünü farklı tasarım kurallarına gönderir.',
        'Mutlak yasaklar; degrade metni, yan şeritli kenarlıkları ve her bölümün üstündeki eyebrow etiketlerini reddeder.',
        'Kontrast tabanları açıktır: gövde metni için 4.5:1, büyük metin için 3:1.',
      ],
      howWithCodex: [
        'Skill’in PRODUCT.md ve DESIGN.md’yi yüklemesi için oturum başına bir kez context.mjs çalıştırın.',
        'Bir hedef dosyayla critique, polish ya da animate gibi bir komut çağırın.',
        'Tarayıcı içi varyantlar üretmek için çalışan bir dev sunucusuyla live mode kullanın.',
      ],
    },
    'design-dna': {
      tagline: 'Bir referans tasarımını yapılandırılmış JSON’a çıkarın, sonra ondan üretin.',
      whatIsIt: 'Tasarım kimliğini ölçülebilir token’lar, niteliksel stil ve görsel efektler boyunca yakalayan üç aşamalı bir iş akışı. Eksiksiz bir Design DNA JSON’u üretir, sonra o JSON’u yeni içeriğe uygular.',
      whyForDesign: [
        'Bir ekran görüntüsünü ya da URL’yi adlandırılmış renk, yazı ve boşluk değerlerine çevirir.',
        'Yalnızca ölçülebilir token’ları değil, ruh halini, kompozisyonu ve marka sesini de kaydeder.',
        'Düz CSS’in ifade edemediği Canvas, WebGL, shader ve scroll efektlerini yakalar.',
      ],
      howWithCodex: [
        'Herhangi bir şeyi analiz etmeden önce üç boyutu da görmek için şemayı isteyin.',
        'Codex’e referans görselleri ya da URL’ler verin ve doldurulmuş bir DNA JSON’u isteyin.',
        'Kendi kendine yeten bir HTML sayfası üretmek için JSON’u ve içeriğinizi geçirin.',
      ],
    },
    'material-3': {
      tagline: 'Google’ın Material Design 3’ünü Compose, Flutter ve web’de uygulayın.',
      whatIsIt: 'md.sys token ad alanını, 30’dan fazla bileşeni, uyarlanabilir düzeni, temalandırmayı ve M3 Expressive’i kapsayan bir Material Design 3 rehberi. Jetpack Compose birincil hedeftir; Flutter ve @material/web ikincildir.',
      whyForDesign: [
        'Renk, yazı, şekil ve yükseklik token’ları, sabit kodlanmış hex ve radius değerlerinin yerini alır.',
        'Tonal yüzeyler, güncel MD3 spesifikasyonuyla uyumlu biçimde gölgeler yerine derinlik taşır.',
        'Puanlı bir denetim on kategoriyi değerlendirir ve düzeltmeleri öncelik sırasına göre listeler.',
      ],
      howWithCodex: [
        'Codex’in Compose, Flutter ya da CSS custom property’leri seçmesi için platformu belirtin.',
        'Bir bileşen isteyin ve doğru varyantı artı token bağlantısını alın.',
        'Bir uyumluluk raporu için denetimi bir URL’ye ya da kaynak dosyalara karşı çalıştırın.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Bir inceleme kontrol listesiyle on altı somut arayüz cilası kuralı.',
      whatIsIt: 'Arayüz cilası için bir dizi tasarım mühendisliği ilkesi: eşmerkezli radius’lar, optik hizalama, katmanlı gölgeler, kademeli giriş animasyonları, tablo rakamları, tıklama alanları ve transition özgüllüğü.',
      whyForDesign: [
        'Kesin değerleri adlandırır; böylece basıştaki ölçek her zaman 0.96’dır, asla tahmin değil.',
        'Çoğu bileşenin bozuk görünmesine yol açan iç içe radius uyumsuzluğunu düzeltir.',
        'Değişen sayılardan kaynaklanan düzen kaymasını, kullanıcılara ulaşmadan önce yakalar.',
      ],
      howWithCodex: [
        'Codex’i bir bileşene yönlendirin ve ilkeleri uygulamasını isteyin.',
        'Bir inceleme isteyin; bulgular Before ve After tabloları olarak döner.',
        'Herhangi bir frontend değişikliğini merge etmeden önce on dört maddelik kontrol listesini çalıştırın.',
      ],
    },
    'visual-plan': {
      tagline: 'Metin planlarını wireframe ve prototiplerle incelenebilir belgelere çevirin.',
      whatIsIt: 'Kod ajanları için yapılandırılmış bir planlama modu. Planlar; satır içi diyagramlar, kod, veri modelleri, açık sorular ve isteğe bağlı bir üst canvas ya da canlı prototiple taranabilir belgeler hâline gelir.',
      whyForDesign: [
        'Arayüz planları, kullanıcıya görünen her durum için bir tane olmak üzere wireframe artboard’larıyla açılır.',
        'İncelemeciler sohbette tartışmak yerine sabitlenmiş öğeler üzerine yorum yapar.',
        'Çok adımlı akışlar, statik mockup’ların yanında çalıştırılabilir bir prototip alır.',
      ],
      howWithCodex: [
        'Agent-Native CLI ile kurun, sonra /visual-plan komutunu çalıştırın.',
        'Kaynak olarak kullanmak için var olan bir Codex ya da Markdown planını yapıştırın.',
        'Geri bildirimi okuyun, planı yamalayın ve kalıcı sonucu doğrulayın.',
      ],
    },
    'kami': {
      tagline: 'Özgeçmişleri, teknik raporları, desteleri ve landing page’leri tek bir tasarım dilinde dizin.',
      whatIsIt: 'Profesyonel belgeler ve ürün landing page’leri için bir şablon sistemi. Sıcak parşömen zemin, mürekkep mavisi vurgu, serif öncülüğünde hiyerarşi; dokuz belge türü için şablonlar artı on beş diyagram primitive’i.',
      whyForDesign: [
        'Tek bir vurgu rengi ve tek bir serif ailesi, her teslimatı görsel olarak tutarlı tutar.',
        'Bir yoğunluk sözleşmesi, yarısından az dolu render olan gövde sayfalarını işaretler.',
        'Diyagram primitive’leri; mimariyi, akış şemalarını, dörtlü matrisleri, zaman çizelgelerini ve grafikleri kapsar.',
      ],
      howWithCodex: [
        'İhtiyacınızı söyleyin; karar ağacı eşleşen şablonu seçer.',
        'Önce Codex’in ham içeriğinizi doğrulanmış bir content.json’a süzmesine izin verin.',
        'HTML, PDF ve doğrulama raporları üretmek için kurma betiğini çalıştırın.',
      ],
    },
    'masked-reveal': {
      tagline: 'Başlıkları scroll sırasında bir overflow maskesiyle kelime kelime açığa çıkarın.',
      whatIsIt: 'Bir başlığı maskeli kelime span’lerine bölen ve metin viewport’a girerken onları yukarı doğru kademelendiren bir GSAP ScrollTrigger deseni. Bir React temizleme deseni içerir.',
      whyForDesign: [
        'Kelime düzeyinde kademelenme, harf düzeyinde animasyondan daha sakin ve daha editoryal okunur.',
        'Ekran okuyucular yine de tam metni bir aria-label üzerinden alır.',
        'reduced-motion kullanıcıları, hiçbir transform uygulanmamış statik metin görür.',
      ],
      howWithCodex: [
        'Bir başlığı data-masked-reveal ile işaretleyin ve CSS mask kurallarını ekleyin.',
        'Ücretli SplitText eklentisinden kaçınan split yardımcısını çağırın.',
        'ScrollTrigger’ın rota değişiminde temizlenmesi için React’te bir GSAP context’ine sarın.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'İnce çerçeveler ve köşe ayraçlarıyla hassas editoryal düzenler kurun.',
      whatIsIt: 'Her bölümün 1px çerçeveli kutular içinde paylaşılan sütunlara oturduğu on iki sütunlu bir ızgara deseni. L biçimli köşe ayraçları, düşük opaklıklı çapraz bir doku üzerine arka plan katmanları olarak çizilir.',
      whyForDesign: [
        'Her bölüm tek bir kenarlık rengi, tek bir ayraç boyutu, tek bir boşluk ölçeği paylaşır.',
        'Köşe ayraçları ek işaretleme gerektirmez; böylece yapı CSS’te kalır.',
        'Doku katmanı kaldırılsa bile düzen yine net okunur.',
      ],
      howWithCodex: [
        'Teknik ya da editoryal bir sayfa isteyin ve önce ana ızgarayı alın.',
        'Gelişigüzel bölüm genişlikleri yerine açık span sınıfları atayın.',
        'Çerçeve kenarlarının her iki breakpoint’te dikey ve yatay olarak hizalandığını doğrulayın.',
      ],
    },
    'container-lines': {
      tagline: 'İçerik kapsayıcınızın kenarlarına sessiz dikey kılavuz çizgileri çizin.',
      whatIsIt: 'İçerik kapsayıcısının her iki kenarına 1px dikey çizgiler, artı isteğe bağlı mini köşe kareleri ekleyen bir CSS deseni. Kılavuzlar içeriğin arkasında durur ve pointer olaylarını yok sayar.',
      whyForDesign: [
        'Kapsayıcı genişliğini açığa çıkarır; böylece gevşek hero bölümleri yapısal gerilim kazanır.',
        'Kılavuzlar kapsayıcının max-width ve padding’ini paylaşır; böylece asla savrulmaz.',
        'Pointer olayları devre dışıdır; böylece çizgiler asla tıklamayı ya da seçimi engellemez.',
      ],
      howWithCodex: [
        'container-lines sınıfını düzen kabuğuna ekleyin.',
        'Köşe karelerini yalnızca gerçek kapsayıcı ya da bölüm köşelerine yerleştirin.',
        'Çizgilerin hem açık hem koyu arka planlarda ince kaldığını kontrol edin.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Butonlara ve panellere katmanlı degradeler ve gölgelerle dokunsal derinlik verin.',
      whatIsIt: 'Dokunsal web arayüzü için bir yüzey reçetesi: dikey degrade dolgular, 1px yansıtıcı degrade kenarlık, üst üste dış ve iç gölgeler. Kabartma metin, ikonlar ve mikro doku isteğe bağlıdır.',
      whyForDesign: [
        'Kabarık ve basılı durumlar derinliği tersine çevirir; böylece kontroller fiziksel okunur.',
        'Derinlik yönlü kalır; ışık üstten, gölge alttan gelir.',
        'Tek bir bileşende glassmorphism, neumorphism ve skeuomorphism’i karıştırmaya karşı uyarır.',
      ],
      howWithCodex: [
        'Temel token’ları bir kez belirleyin, sonra onları marka ve temaya göre ayarlayın.',
        'Kabarık yüzeyi kartlara, butonlara, sekmelere ve kontrol yuvalarına uygulayın.',
        'Basılı varyantı yalnızca aktif toggle’lar ve seçili sekmeler için ekleyin.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Nötr katmanlı yükseklik için üç hazır Tailwind gölge yardımcısı.',
      whatIsIt: 'Üç güçte kesin Tailwind serbest gölge sınıflarından oluşan bir set. Her biri, Tailwind’in varsayılan gölge ölçeği yerine birkaç düşük opaklıklı nötr katmanı üst üste yığar.',
      whyForDesign: [
        'Yükseklik nötr kalır; alttaki yüzeyi renklendiren renkli bir parıltı olmaz.',
        'Üç sabit güç sırasıyla kontrollere, kartlara ve hero medyasına eşlenir.',
        'Üst üste yığılmış düşük opaklıklı katmanlar, tek bir künt gölge yerine gerçek derinlik olarak okunur.',
      ],
      howWithCodex: [
        'Codex’ten md yardımcısını kartlara, panellere ve popover’lara uygulamasını isteyin.',
        'lg yardımcısını hero medyası ve modal benzeri kapsayıcılar için ayırın.',
        'Her gölgeyi temiz bir yüzey dolgusu ve tutarlı bir radius ile eşleştirin.',
      ],
    },
    'dither-background': {
      tagline: 'Görünür 4x4 Bayer dithering’i ve kare piksellerle canvas arka planı.',
      whatIsIt: 'Value noise, FBM ve 4x4 Bayer eşiğinden, büyütülmüş kare hücreler olarak çizilen neredeyse siyah prosedürel bir alanı render eden bir canvas reçetesi.',
      whyForDesign: [
        'Büyütülmüş hücreler, dither matrisini film tanesine çökmek yerine okunur tutar.',
        'Altı adımlı monokrom palet, ağır bir overlay olmadan ön plandaki yazıyı okunur tutar.',
        'Vignette ve eksen dışı kütle, eşit parlaklık değil, tek bir parlak odak alanı verir.',
      ],
      howWithCodex: [
        'Sabit canvas’ı içeriğin arkasına bırakın ve pointer-events’i none yapın.',
        'Matris okunurluğu için cellSize’ı 5px ile 10px arasında ayarlayın.',
        'Kütleyi biçimlendirmek için wave, cloud, ridge ve vignette değerlerini ayarlayın.',
      ],
    },
    'webgl-laser': {
      tagline: 'Ak sıcak çekirdek ve marka tonlu sisle tam ekran shader ışını.',
      whatIsIt: 'Tam ekran bir quad üzerine ince dikey bir lazer çizen ham bir WebGL fragment shader’ı. Çekirdek neredeyse beyaz kalır; hale ve FBM duman vurgu renginizi izler.',
      whyForDesign: [
        'Hale ve duman, sabit kodlanmış bir mavi yerine marka vurgu renginizden okunur.',
        'Ayrı çekirdek ve parıltı genişlikleri, ışını bir çubuk değil, bir bıçak tutar.',
        'Duman ışının yakınında yoğunlaşır ve dışa doğru dağılır; metin kontrastını korur.',
      ],
      howWithCodex: [
        'Shader’ın RGB’ye çevirdiği bir --brand-accent custom property’si belirleyin.',
        'Sabit canvas’ı pointer-events none ile içeriğin arkasına yerleştirin.',
        'Işını konumlandırmak için coreWidth, glowWidth, smokeDensity ve xOffset’i ayarlayın.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Hero kabuğu içinde bir mesh alanı olan neredeyse siyah lacivert sistem.',
      whatIsIt: 'CSS renk token’ları, border-gradient bir hero kabuğu, canvas mesh alanı, cam navigasyon hapı, yüzen düğümler, raylar ve eşli CTA’larla koyu mavi bir yön.',
      whyForDesign: [
        'Mesh hero kabuğunun içinde durur; böylece kompozisyonu süslemek yerine yönetir.',
        'Adlandırılmış token’lar; arka plan, kabuk, çizgi, metin ve vurgu değerlerini sayfa boyunca sabitler.',
        'Raylar, köşe kareleri ve düğüm hapları, minimal kabuğa teknik bir yapı kazandırır.',
      ],
      howWithCodex: [
        'Token bloğunu yapıştırın, sonra sayfa temelini ve hero kabuğunu kurun.',
        'Mesh canvas’ı kabuğun içine, kabuk içeriğinin arkasına ekleyin.',
        'Birkaç düğüm, ray ve işaretçi yerleştirin, sonra sürüklenme döngülerini yavaş tutun.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Aşırı büyük başlıklar ve minik büyük harf etiketlerle editoryal çok sütunlu ızgara.',
      whatIsIt: 'Ajans siteleri için bir düzen yönü: geniş ızgara kabukları, aşırı büyük başlıklar, komşu sütunlarda küçük büyük harf meta veri ve mimari görsel blokları.',
      whyForDesign: [
        'Katı sütun yerleşimi, her öğe konumunun bilinçli okunmasını sağlar.',
        'Büyük başlıklar ile minik meta veri arasındaki ölçek kontrastı hiyerarşiyi taşır.',
        'Negatif alan doldurulmak yerine korunur; sayfayı editoryal tutar.',
      ],
      howWithCodex: [
        'Önce görünür sütun bölmeleri olan geniş bir max-width kabuğu kurun.',
        'Bir hero başlığını çoğu sütuna sabitleyin, destek metnini bir yan sütuna koyun.',
        'Hizmet satırlarını minik meta veri etiketleriyle çok sütunlu listeler olarak kurun.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Dairesel bir kalibrasyon kadranı etrafında kurulu koyu buzlu yüzeyler.',
      whatIsIt: 'Saat benzeri bir kadran üzerine merkezlenmiş koyu cam bir yön: ışın ızgaralı neredeyse siyah bir taban, buzlu navigasyon kapsülleri ve katmanlı bir halka ile tik merkez parçası.',
      whyForDesign: [
        'Baskın bir kadran, dekoratif bir widget olarak durmak yerine düzeni sabitler.',
        'Işın çizgileri ve artı işaretleri kadrana hizalanır; kalibrasyon mantığını pekiştirir.',
        'Monokrom palet, parlaklığın doygun vurgulardan değil, cam vurgularından geldiği anlamına gelir.',
      ],
      howWithCodex: [
        'Neredeyse siyah bir taban artı soluk ızgara ve ışın kılavuzlarıyla başlayın.',
        'Navigasyonu, hapları ve butonları 1px vurgu sarmalayıcılı koyu cam kapsüller olarak kurun.',
        'Kadranı katmanlayın: dış halka, tikler, dönen etiketler, merkez amblem.',
      ],
    },
    'gsap-skills': {
      tagline: 'Çekirdek tween’lerden ScrollTrigger ve React’e resmi GSAP animasyon seti.',
      whatIsIt: 'GSAP ile web animasyonu kurmak için GreenSock’ın resmi skill seti. Sekiz modül; çekirdek API’yi, timeline’ları, ScrollTrigger’ı, eklentileri, React’i, diğer framework’leri, performansı ve yardımcıları kapsar.',
      whyForDesign: [
        'Hareket, ajanın sözdizimini tahmin etmesi yerine GSAP’in gerçek API’sini izler.',
        'ScrollTrigger ve timeline’lar gelişigüzel yığılmak yerine düzgün sıralanır.',
        'Performans kuralları, animasyonu scroll’da takılmak yerine akıcı tutar.',
      ],
      howWithCodex: [
        'Codex’in ilgili modülü yükleyebilmesi için GSAP skill setini kurun.',
        'İstediğiniz hareketi isteyin; doğru modül API’yi yönetir.',
        'Bir bileşen ağacı içinde React ya da framework’ler modülüne başvurun.',
      ],
    },
    'animation-review': {
      tagline: 'Kıdemli bir zanaat çıtasına karşı hareketi bulun, iyileştirin ve inceleyin.',
      whatIsIt: 'Emil Kowalski’nin üç hareket skill’i tek bir döngü olarak çalışıyor: animasyonlanması gereken yerleri bul, mevcut hareketi iyileştir ve animasyon kodunu yüksek bir zanaat çıtasına karşı incele.',
      whyForDesign: [
        'Hareket etmesi gereken ama etmeyen arayüzü ortaya çıkarır ve olmaması gereken hareketi reddeder.',
        'Muğlak ‘daha hoş hissettir’ isteğini öncelikli bir hareket denetimine çevirir.',
        'Animasyonu kişisel zevke değil, adlandırılmış bir zanaat çıtasına tutar.',
      ],
      howWithCodex: [
        'Arayüzünüzdeki hareket fırsatlarını bulmak için find geçişini çalıştırın.',
        'Mevcut animasyon kodunu yeniden işlemek için improve geçişini uygulayın.',
        'Düşük zanaatlı hareketi yakalamak için göndermeden önce review geçişini çalıştırın.',
      ],
    },
  },
};
