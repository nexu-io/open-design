/*
 * Türkçe copy for the DeepSeek Harness design collection.
 * Translated from the English baseline.
 */
import type { DeepseekCopyOverride } from './index';

export const tr: DeepseekCopyOverride = {
  collectionEyebrow: 'Küratörlü koleksiyon',
  collectionHeading: 'Tasarım için DeepSeek Harness eklentileri',
  collectionLede:
    'Tasarım işi için seçilmiş dsh eklentileri: ekran görüntülerini okuyan görü köprüleri, ajanın üzerine çizebileceği tuvaller ve üretken arayüzler, tasarım inceleme araçları ve hepsini önizleyen çalışma tezgâhları. DeepSeek Harness, Claude Code ve Codex ile aynı SKILL.md biçimini okur; tasarım skill kitaplığın olduğu gibi taşınır.',
  collectionStats: [
    { value: '19', label: 'seçilmiş dsh eklentisi' },
    { value: '19', label: 'kaynak repo' },
    { value: 'SKILL.md', label: 'Claude Code & Codex ile ortak' },
  ],
  collectionIntro:
    'Aşağıdaki her dsh eklentisi gerçek, DeepSeek Harness’e özgü, GitHub’daki dsh-plugin topic’i üzerinden keşfedilebilir ve kaynağına bağlantı veriyor. Dört işi görüyorlar: yalnızca metin çalışan harness’e görüş kazandırmak, ona üzerine çizeceği tasarım yüzeyleri vermek, tasarım incelemesini döngüye bağlamak ve web arayüzünü bir tasarım çalışma alanına dönüştürmek.',
  collectionCategoryBlurbs: [
    'Ekran görüntülerini, mockup’ları ve grafikleri, yalnızca metin çalışan bir modelin üzerinde işlem yapabileceği yapılandırılmış kanıta dönüştürün.',
    'Ajana üzerine çizeceği yüzeyler verin: düzenlenebilir vektör canvas’ları, canlı arayüz kartları, slaytlar.',
    'Döngüyü kapatın: gerçek sayfaları notlayın, hareket varlıkları derleyin, skill kitaplığınızı yanınızda taşıyın.',
    'Harness’in kendisini bir tasarım çalışma alanı yapın: sohbetin yanında önizleme panelleri, çalışma tezgâhları ve panolar.',
  ],
  collectionCloserHeading: 'Kurulumu atlayın: DeepSeek Harness ile OpenDesign içinde tasarlayın',
  filterAll: 'Tümü',
  collectionCloserBody:
    'OpenDesign, DeepSeek Harness’in etrafında çalışan açık kaynaklı, agent-native tasarım çalışma alanıdır. Sistemlerinizi, skill’lerinizi ve şablonlarınızı tutarlı tutar; ajan da sahibi olduğunuz işi çıkarır.',

  categoryVision: 'Görüş & Girdi',
  categoryCanvas: 'Canvas & Üretken Arayüz',
  categoryWorkflow: 'Tasarım İş Akışı',
  categoryWorkspace: 'Çalışma Alanı & Önizleme',

  ctaDownload: 'OpenDesign’ı indir',
  ctaStarList: 'DeepSeek Harness’e yıldız ver',
  ctaGuide: 'DeepSeek Harness ile tasarım nasıl yapılır',
  ctaBrowseAll: 'Tüm eklentilere göz at',
  ctaViewSource: 'Kaynağı gör',
  ctaOurRepo: 'GitHub’da deepseek-harness',
  cardKind: 'Eklenti',
  cardWhatItDoes: 'Ne yapar',
  cardCta: 'Eklentiyi gör',

  detailWhatIsIt: 'Nedir',
  detailWhyForDesign: 'Tasarım için neden önemli',
  detailHowWithAgent: 'DeepSeek Harness ile nasıl çalıştırılır',
  detailExampleTag: 'Ne zaman başvurmalı',
  detailSource: 'Kaynak',
  detailCategory: 'Kategori',
  detailMaintainer: 'Yazar',
  detailTags: 'Etiketler',
  detailLicense: 'Lisans',
  detailCovers: 'Neleri kapsıyor',
  detailUpstream: 'Kaynak README’den',
  detailAgentNote: 'DeepSeek Harness ile çalışır',
  detailTraction: 'İlgi',
  detailRepo: 'Kaynak depo',
  detailStars: 'Yıldız',

  installHeading: 'Nasıl kurulur',
  installRunInAgent: 'Bunu bir terminalde çalıştırın.',
  installRestart: 'Eklentiyi alması için dsh web’i yeniden başlatın.',
  installClone: 'Depoyu klonlayın.',
  installPoint: 'DeepSeek Harness’i skill dosyasına yönlendirin.',
  installThenUse: 'Sonra istediğiniz tasarımı anlatın. Harness, eklentinin araçlarını devralır.',

  installNote:
    'Buradaki her eklenti ücretsiz kurulur ve gerçek üst kaynağına bağlantı veriyor.',
  installNoteCta: 'Koleksiyonun tamamına göz atın',
  detailMoreOnList: 'DeepSeek Harness deposunda dahası',
  detailRelated: 'Diğer DeepSeek Harness tasarım eklentileri',
  finalEyebrow: 'Sonraki adım',
  detailCloserHeading: 'Kurulum derdi olmadan OpenDesign ile tasarlayın',
  detailCloserBody:
    'Bu eklentiyi kendiniz kurun ya da OpenDesign ile DeepSeek Harness’in etrafına baştan sona küratörlü bir tasarım katmanı geçirin. Kendi anahtarınızı getirin, çıktınızın sahibi olun.',

  skills: {
    modlens: {
      tagline:
        'Yalnızca metin çalışan DeepSeek modellerine takılabilir görüş kazandırır: bir ekran görüntüsü yapıştırın, yapılandırılmış kanıt alın.',
      whatIsIt:
        'Yalnızca metin çalışan kodlama ajanları için bir görüş köprüsü. Sohbete bir görsel yapıştırın; modlens onu bir modelin tahmini yerine yapılandırılmış JSON kanıtına dönüştürür — tam transkripsiyon, okuma sırasına göre düzen bölgeleri, varlıklar ve ilişkiler.',
      whyForDesign: [
        'Arayüz ekran görüntüleri, ajanın üzerinde işlem yapabileceği öğe öğe gezintilere dönüşür.',
        'Yoğun grafikler ve veri görselleştirmeleri eksiksiz okunur: eksenler, ölçekler, paletler, vurgulanan bölgeler.',
        'Aynı anda birkaç referans yapıştırın; her birini tarif etmeden önce ortak görsel aileyi belirler.',
      ],
      howWithAgent: [
        'Eklentiyi kurun; model seçici, modlens görüşlü DeepSeek-V4 varyantları kazanır.',
        'Bir ekran görüntüsünü, mockup’ı ya da grafiği doğrudan konuşmaya yapıştırın.',
        'Görseli yeniden tarif etmek yerine yapılandırılmış kanıta karşı tasarım soruları sorun.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline:
        'Arayüz restorasyonu, grounding ve piksel farkı doğrulaması için on görüş aracı.',
      whatIsIt:
        'DeepSeek Harness’e özgü on görüş aracından oluşan bir paket: görsel soru-cevap, piksel koordinatlarıyla grounding ve nesne tespiti, uzun ekran görüntüsü OCR’ı, kırpma, renk çıkarma, HTML ekran görüntüleri ve piksel farkı. Araçlar bir vision-tools skill’i üzerinden kademeli olarak devreye girer.',
      whyForDesign: [
        'Arayüz restorasyonu döngüyü sayılarla kapatır: depoya eklenmiş bir iş akışı, bir yeniden yapımı %6,04 piksel farkından %0’a kadar yineler.',
        'Grounding ve tespit, orijinal görüntünün piksel kutularını döndürür; ajan düzyazı ayrıştırmak yerine koordinatlar üzerinde çalışır.',
        'İnfografikler ve elle çizilmiş eskizler, düzenlenebilir HTML/CSS arayüzlerine dönüşür.',
      ],
      howWithAgent: [
        'Eklentiyi web ya da headless profilinize ekleyin ve uzak araçlar için bir görüş kimlik bilgisi tanımlayın.',
        'Araç setini etkinleştirin; vision-tools skill’i on aracın tüm şemalarını devreye alır.',
        'Bir referansı yeniden kurun, sonra vision_html_screenshot ve vision_pixel_diff ile doğrulayın.',
      ],
    },
    'dsh-ui-spec': {
      tagline:
        'Arayüz ekran görüntülerini uygulama düzeyinde spesifikasyonlara çevirir: token’lar, boşluk ölçeği, düzen ızgarası.',
      whatIsIt:
        'Bir ekran görüntüsünü ya da mockup’ı yapılandırılmış bir frontend spesifikasyonuna dönüştüren tek bir analyze_ui_image aracı. Deterministik bir geometri katmanı tam boyutları, paleti, önerilen tasarım token’larını, düzen ızgarasını ve boşluk ölçeğini ölçer; isteğe bağlı bir görüş modeli üzerine semantik ekler.',
      whyForDesign: [
        'Piksel koordinatları, boşluk ölçekleri ve token paletleri bir görüş modelinin tahminiyle değil, deterministik olarak hesaplanır.',
        'Spesifikasyon alanları doğrudan uygulamaya eşlenir: önerilen token’lar tasarım token’larına, boşluk ölçeği CSS’e.',
        'Semantik roller niyeti, geometri ise yerleşimi sağlar; ikisi tek bir JSON + Markdown spesifikasyonunda birleşir.',
      ],
      howWithAgent: [
        'Eklentiyi ekleyin; geometri katmanı sıfır yapılandırmayla çevrimdışı çalışır.',
        'İsterseniz semantik katmanı OpenAI uyumlu herhangi bir görüş uç noktasına yönlendirin.',
        'Ajana bir ekran görüntüsü verin ve görselden değil, dönen spesifikasyondan kurun.',
      ],
    },
    'dsh-media-skills': {
      tagline:
        'Ücretsiz gözler ve ücretsiz bir fırça: yapıştırılan görselleri okuma artı filigransız görsel üretimi.',
      whatIsIt:
        'Harness için iki SKILL.md skill’i ve ücretsiz bir görüş modeli rotası: vision-review ekran görüntülerini okur ve görsel hataları yakalar, media-tools illüstrasyonlar, avatarlar, arka planlar ve banner’lar üretir — ikisi de ücretsiz katman modellerinde çalışır.',
      whyForDesign: [
        'Metin ajanının göremediği arayüz görsel hatalarını yakalar: üst üste binme, taşma, hizasızlık.',
        'Tasarım varlıklarını ücretsiz katmanda filigransız üretir; keşif hiçbir şeye mal olmaz.',
        'Yalnızca metin oturumlarına bir ‘Add image’ düğmesi ekler; yapıştırılan görseller mevcut modele tarif edilir.',
      ],
      howWithAgent: [
        'Eklentiyi ekleyin ve ücretsiz API anahtarlarını harness kimlik bilgisi deposuna bırakın.',
        'dsh web’i yeniden başlatın; model seçici ücretsiz bir görüş rotası kazanır.',
        'Bir ekran görüntüsünün incelemesini ya da yeni bir varlığı sade bir dille isteyin.',
      ],
    },
    'dsh-openpencil': {
      tagline:
        'Ajan, statik görseller döndürmek yerine gerçek, düzenlenebilir bir vektör canvas’ında tasarlar.',
      whatIsIt:
        'Harness’i, açık kaynaklı AI-native vektör tasarım aracı OpenPencil’a bağlar. Beş araç; ajanın kod-olarak-tasarım .op belgelerini işlemsel batch’lerle oluşturmasına, düzenlemesine, render etmesine ve incelemesine izin verir — çok kareli önizlemeler ve insan devralması için yönetilen bir editörle birlikte.',
      whyForDesign: [
        'Gereksinimden canvas’a tek döngü: ajan gerçek belgeyi düzenler ve önizlemeler tasarıma sadık kareler render eder.',
        'İşlemsel batch’ler yalnızca başarıda yayınlanır ve dış düzenlemelerin asla üzerine yazmaz — çakışmalar gizlenmek yerine yüzeye çıkar.',
        'Seçim, katmanlar, özellikler ve geri alma içeren yönetilen bir editör, insanın ajanın çıktısını her an devralmasına izin verir.',
      ],
      howWithAgent: [
        'OpenPencil’ı kurun, sonra eklentiyi web profilinize ekleyin.',
        'Tasarımı anlatın; ajan openpencil_create ve openpencil_edit’i batch’ler hâlinde sürer.',
        'Render edilen önizlemeyi ya da yönetilen editörü açın ve yerinde yinelemeye devam edin.',
      ],
    },
    'dsh-visualize': {
      tagline:
        'Model, etkileşimli HTML kartlarını doğrudan konuşma akışının içine çizer.',
      whatIsIt:
        'Bir visualize aracı artı eşlik eden bir skill: model bir HTML parçası yazar ve onu sohbetin içinde sandbox’lanmış etkileşimli bir kart olarak monte eder — simülatörler, grafikler, karşılaştırma panelleri ve arayüz mockup’ları; akış hâlinde önizleme ve temayla uyumlu stille birlikte.',
      whyForDesign: [
        'Arayüz mockup’ları konuşmanın içinde yaşar ve yalnızca tarif edilmekle kalmaz, tıklanabilir.',
        'Kartlar, ev sahibinin açık/koyu temasını ve paletini izler; önizlemeler yerli görünür.',
        'Her kart, katı bir CSP ile sandbox’lanmış bir iframe’de çalışır — bozuk bir parça oturumu bozamaz.',
      ],
      howWithAgent: [
        'Eklentiyi ekleyin ve dsh web’i yeniden başlatın.',
        'Bir mockup ya da karşılaştırma isteyin; model kendi HTML’iyle visualize’ı çağırır.',
        'Oturumu daha sonra yeniden oynatın — kartlar kalıcı araç sonucundan geri yüklenir.',
      ],
    },
    'dsh-genui': {
      tagline:
        'Yanıtların içinde satır içi render edilen otuzdan fazla etkileşimli bileşen, modele dönen bir eylem döngüsüyle.',
      whatIsIt:
        'Model bir arayüzü dsh-ui fence içinde JSON olarak tarif eder; tarayıcı tarafındaki bir renderer onu yanıtın içinde canlı bileşenlere dönüştürür — kartlar, tablolar, grafikler, formlar, sekmeler, zaman çizelgeleri, diff’ler, mermaid, 3D sahneler — yanıt akarken belirirler.',
      whyForDesign: [
        'Yanıtlar arayüze dönüşür: veri panelleri, grafikler ve formlar, açıklamanın olduğu yerde render edilir.',
        'Etkileşimli bileşenler modele eylem gönderir; model de arayüzü buna göre günceller.',
        'Bileşen beyaz listesi ve spesifikasyon koruması, bozuk bir grafiğin asla ekrana ulaşmaması demektir.',
      ],
      howWithAgent: [
        'Eklentiyi GitHub’dan ekleyin ve dsh web’i yeniden başlatın.',
        'Bir dashboard, quiz ya da form isteyin; dsh-ui fence’i modelin kendisi yazar.',
        'Sonuçla etkileşin — yerel eylemler anında yanıt verir, model eylemleri döngüye geri döner.',
      ],
    },
    'dsh-openmaic': {
      tagline:
        'Ajanın yazdığı JSON’dan render edilen slaytlar, etkileşimli widget’lar ve baştan sona oynatılabilir dersler.',
      whatIsIt:
        'THU-MAIC grubundan dört araç ve Sokratik bir öğretim skill’i: ajan, resmî OpenMAIC renderer’ının render ettiği PPTist tarzı slayt JSON’u yazar, etkileşimli widget’ları sandbox’lanmış kartlar olarak akıtır ve tek satırlık bir isteği oynatılabilir bir sınıf olarak geri alabilir.',
      whyForDesign: [
        'Metin, şekil, görsel, tablo, grafik, formül ve kod içeren slayt desteleri — konuşmanın içinde JSON olarak yazılır.',
        'Etkileşimli simülasyonlar ve oyunlar, sandbox’lanmış kartlar olarak yerinde render edilir.',
        'Görsel içerikli eksiksiz bir ders tek istek uzaklıktadır; oynatılabilir bir bağlantı olarak döner.',
      ],
      howWithAgent: [
        'Eklentiyi GitHub’dan ekleyin; derlenmiş olarak gelir, build adımı gerektirmez.',
        'dsh web’i yeniden başlatın ve bir deste ya da widget isteyin.',
        'Bütün dersler için openmaic_generate, OpenMAIC servisini yoklar ve sınıf bağlantısını döndürür.',
      ],
    },
    'dsh-web-review': {
      tagline:
        'Canlı bir sayfadaki öğeleri işaret edin, görsel olarak not düşün; ajan kaynağı düzenler.',
      whatIsIt:
        'Harness web arayüzü için yerleşik bir tarayıcı: öğeleri bir tasarım aracındaki gibi üzerine gelerek vurgulayıp seçin, notlar iliştirin ve canlı görsel ayarlamalar deneyin — metin, renk, tipografi, boyut, boşluk, kenarlıklar, efektler. Notlar seçicileri ve kaynak ipuçlarını taşır; ajan böylece kodu bulup düzeltebilir.',
      whyForDesign: [
        'Görsel işaretle-ve-not-düş, arayüz sorunlarını kelimelerle tarif etmenin yerini alır.',
        'Canlı ayarlamalar, koda dokunulmadan önce değişikliği sayfada önizler.',
        'better-typography’den interface-review’a, not editöründen kullanılabilen sekiz hazır tasarım skill’iyle gelir.',
      ],
      howWithAgent: [
        'Eklentiyi ekleyin ve dsh web’i başlatın.',
        'Çalışan uygulamanızı Web Preview sekmesinde açın ve değişmesi gerekeni notlayın.',
        'Gönderin — ajan seçicileri, notları ve denenen değerleri alır ve çalışma alanı kaynağını düzenler.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline:
        'SVG path’lerini ve keyframe’leri, konuşmanın içinden kendi kendine yeten Lottie animasyonlarına derler.',
      whatIsIt:
        'Tasarım verisini hareket varlıklarına çeviren iki araç: lottie_compile_shape bir SVG path’ini Lottie şekil değerlerine dönüştürür, lottie_compile ise kompakt bir katman spesifikasyonundan eksiksiz bir Lottie JSON’u kurar — dikdörtgenler, degradeler, path’ler, gömülü görseller ve metin, katman başına keyframe animasyonuyla.',
      whyForDesign: [
        'Bir yükleme animasyonunu sade bir dille tarif edin; iOS, Android ve web’de çalışan bir .lottie.json alın.',
        'Bezier giriş/çıkış tanjantları ve keyframe easing’i elle yazılmaz, derlenir.',
        'Sıfır build adımı ve saf ESM: yayınlanan şey, tam olarak çalışan şeydir.',
      ],
      howWithAgent: [
        'Eklentiyi npm’den ekleyin ya da GitHub’dan bir commit sabitleyin.',
        'Hareketi tarif edin: katmanlar, zamanlama, easing, kademelenme.',
        'Derlenen .lottie.json’u LottieWeb, lottie-ios ya da lottie-android’e bırakın.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline:
        'Claude Code skill’leriniz, hafızanız ve global talimatlarınız, sıfır taşımayla harness’te kullanılabilir.',
      whatIsIt:
        'Claude Code’un standart dosya konumlarını doğrudan okur — taşıma betiği yok, kopyalama yok, symlink yok. ~/.claude/skills içindeki skill’ler harness skill kataloğuna katılır, proje hafızası her istekte bağlam olarak enjekte edilir ve CLAUDE.md global talimatları olduğu gibi taşınır.',
      whyForDesign: [
        'Claude Code’da zaten çalıştırdığınız tasarım skill’leri, tek bir dosya taşımadan burada çalışır.',
        'Proje hafızası her istekte yeniden okunur; yeni notlar anında etkili olur.',
        'Global talimatlar ve iş birliği tercihleri ajanlar arasında korunur.',
      ],
      howWithAgent: [
        'Eklentiyi profilinize ekleyin; sıfır yapılandırmayla çalışır.',
        'İsterseniz onu ~/.agents/skills gibi ek skill dizinlerine yönlendirin.',
        'Var olan skill’lerinizi, Claude Code’da yapacağınız gibi adlarıyla çağırın.',
      ],
    },
    'dsh-web-ui': {
      tagline:
        'Ekosistemin en büyük arayüz kiti: görev panosu, önizleme paneli, Git grafiği ve bir tema merkezi.',
      whatIsIt:
        'Harness web arayüzü için bir eklenti ve tema koleksiyonu: kartları gerçek ajan oturumları çalıştıran beş sütunlu bir görev panosu, dosya ağacı ve çok sekmeli önizlemeler içeren bir sağ taraf paneli, bir Git grafiği, mobil uzaktan kumanda ve uygulamadan önce deneyebileceğiniz bir tema merkezi.',
      whyForDesign: [
        'Sağ taraf paneli; Markdown, HTML, diff’leri, CSV, PDF, Office dosyalarını ve görselleri konuşmanın yanında önizler.',
        'Görev panosu, tasarım yapılacaklarını gerçek bir dsh ajan oturumunun yürütüp geri rapor verdiği kartlara dönüştürür.',
        'Panel genişliği sürüklenebilir ve proje başına kalıcıdır; çalışma alanı düzenlediğiniz gibi kalır.',
      ],
      howWithAgent: [
        'Her şeyi tek seferde kurmak için toplu paketi web profilinize ekleyin.',
        'Sağ taraf panelini açın ve üzerinde çalıştığınız dosyaları ve önizlemeleri sabitleyin.',
        'Tasarım görevlerini panoya bırakın ve kartların gerçek ajan oturumlarında yürütülmesine izin verin.',
      ],
    },
    'dsh-better-sidebar': {
      tagline:
        'Kenar çubuğunda eksiksiz bir çalışma tezgâhı: dosya gezgini, zengin önizlemeler, terminal, Git ve bir tarayıcı.',
      whatIsIt:
        'Harness web arayüzü için çift panelli bir çalışma tezgâhı: CodeMirror düzenlemeli tembel yüklenen bir dosya gezgini; görseller, Markdown, HTML, PDF ve Office dosyaları için satır içi önizlemeler; gerçek bir terminal; VS Code tarzı diff’ler içeren bir Git paneli; gömülü sandbox’lanmış bir tarayıcı ve sürüklenebilir bölünmüş panel sekmeleri.',
      whyForDesign: [
        'Ajanın ürettiği HTML’i, görselleri ve belgeleri konuşmadan ayrılmadan önizleyin.',
        'Gömülü sandbox’lanmış tarayıcı, çalışan prototipinizi sohbetin yanındaki bir sekmede açar.',
        'Üçüncü taraf eklentiler, servis API’si üzerinden kendi sekmelerini ve dosya önizleyicilerini kaydedebilir.',
      ],
      howWithAgent: [
        'Tek satırlık betikle kurun ya da npm paketini web profilinize ekleyin.',
        'Çalışma tezgâhını açın ve sekmeleri sağ kenar çubuğu ile alt panel arasında düzenleyin.',
        'Ajanın kurduğunu yerinde inceleyin: önizlemeler, diff’ler, terminal ve tarayıcı sekmeleri.',
      ],
    },
    'dsh-vision-router': {
      tagline:
        'Yalnızca metin çalışan ajanlara ücretsiz, anahtarsız gözler: yerleşik bir görüş zinciri artı on bir piksel düzeyinde araç.',
      whatIsIt:
        'Orijinal pikselleri görüş modelinin tarafında, akıl yürütmeyi DeepSeek tarafında tutan bir görüş yönlendiricisi. “+ Auto Vision” işaretli bir model grubu seçin, bir görsel yapıştırın; ajan on bir piksel düzeyinde aracı — grounding, kırpma, piksel farkı, palet, OCR, SVG vektörizasyonu, arka plan ayıklama, HTML ekran görüntüleri — hesap ve anahtar gerektirmeyen ücretsiz, anonim bir görüş yedek zinciri üzerinden sürer.',
      whyForDesign: [
        'Arayüz restorasyonu için doğrulanabilir bir piksel döngüsü: referans → ekran görüntüsü → kırmızı ısı haritalı piksel farkı → düzeltme → uyuşmazlık yakınsayana kadar tekrar.',
        'Grounding ve tespit, orijinal görüntünün piksel kutularını döndürür; README’si %2,54 nihai farka kadar doğrulanmış bir yeniden yapımı belgeler.',
        'Palet çıkarma, ikonların SVG vektörizasyonu ve arka plan ayıklama, bir yeniden yapımın etrafındaki küçük tasarım işlerini karşılar.',
      ],
      howWithAgent: [
        'Eklentiyi web profilinize ekleyin; composition patch’i her şeyi elle tek dosya düzenlemeden bağlar.',
        'Görsel göndermeden önce model seçiciyi açın ve “+ Auto Vision” işaretli bir grup seçin.',
        'Bir ekran görüntüsü yapıştırın ve ajanın vision_ground, vision_crop, vision_describe ve vision_pixel_diff’i zincirlemesine izin verin.',
      ],
    },
    'dsh-diagram': {
      tagline:
        'Oturumdaki herhangi bir makaleyi tek kullanımlık bir görsel yerine düzenlenebilir bir Excalidraw canvas’ına dönüştürür.',
      whatIsIt:
        'Harness’in içinde bir Excalidraw canvas’ı: ajan, kompakt bir semantik spesifikasyondan akış şeması, mimari diyagram, zaman çizelgesi, hiyerarşi ya da karşılaştırma kurmak için diagram_create’i çağırır; bir Canvas sekmesi tam editörü açar, metni, düğümleri ve bağlantıları doğrudan oturumun içinde inceltirsiniz.',
      whyForDesign: [
        'Tek kullanımlık değil, düzenlenebilir: statik üretilmiş bir görseli kabul etmek yerine gerçek bir vektör canvas’ında çalışmaya devam edin.',
        'Revizyon tabanlı compare-and-set otomatik kaydetme, bayat bir editörün daha yeni işin üzerine sessizce yazmasını önler.',
        '.excalidraw, SVG ya da PNG dışa aktarır; elle yapılan düzenlemeler ajana yalnızca diagram_read’i çağırmasını istediğinizde ulaşır.',
      ],
      howWithAgent: [
        'Eklentiyi web profilinize ekleyin ve dsh web’i yeniden başlatın.',
        'Oturumdaki makalenin tek ve net bir diyagramını isteyin; ajan diagram_create’i çağırır.',
        'Canvas sekmesini açın, doğrudan düzenleyin, sonra dışa aktarın ya da ajanın değişikliklerinizi geri okumasına izin verin.',
      ],
    },
    'deepseek-harness-genui': {
      tagline:
        'Görev, odaklı bir React arayüzü büyütür — içinde seçtikleriniz ajana geri akar.',
      whatIsIt:
        'Ajan görevleri için bir çalışma zamanı arayüz katmanı: metin işi zorlaştırdığında ajan küçük bir React + TypeScript uygulaması yazar — satır içi, Canvas’ta, tam ekran ya da localhost’ta gösterilir — zor bir ilişkiyi açıklamak, karmaşık bir kararı toplamak ya da göreve özel onay sonrasında bağlı bir aracı çalıştırmak için.',
      whyForDesign: [
        'Arayüzler önce kod gelen React’tir; düzenler, kontroller ve diyagramlar ekran görüntüsü değil, gerçek bileşenlerdir.',
        'Kaydedilen seçimler, girdiler ve taslaklar göreve geri döner; sonraki ajan turları bunları okur.',
        'Dört görsel profilli bir DESIGN.md sistemi, üretilen uygulamaları tek bir tasarım dilinde tutar.',
      ],
      howWithAgent: [
        'Kurulum komutunu çalıştırın — eklentiyi ekler, ardından Playwright için gereken Chromium’u kurar.',
        'Etkileşimin işe yaradığı yerde bir arayüz isteyin: bir seçici, keşfedilebilir bir model, bir kod yolu gezgini.',
        'Etkileşin, sonra devam edin — ajan tekrarlamanızı istemek yerine seçtiklerinizi okur.',
      ],
    },
    'dsh-annotate': {
      tagline:
        'Tarayıcı öğelerini işaret edin ve ajana belirsiz tarifler değil, yapılandırılmış gerçekler gönderin.',
      whatIsIt:
        'Eşlik eden bir Chrome uzantısı üzerinden görsel tarayıcı geri bildirimi: /annotate seçim moduna girer; tıkladığınız her öğe, bir seçiciyi, DOM gerçeklerini, hesaplanmış stil vurgularını, erişilebilirlik verisini, yorumunuzu ve isteğe bağlı bir viewport ekran görüntüsünü ajanın bir sonraki turuna katar.',
      whyForDesign: [
        'Görsel geri bildirim, belirsiz bir tarife ya da yapıştırılmış bir ekran görüntüsüne dönüşmek yerine sayfadaki öğeye bağlı kalır.',
        'Hesaplanmış stiller ve erişilebilirlik verisi, ajanın doğrudan üzerinde işlem yapabileceği yapılandırılmış gerçekler olarak gelir.',
        'Host, origin ve uzantı kimliğiyle sınırlanan bir loopback WebSocket köprüsü kanalı yerel tutar.',
      ],
      howWithAgent: [
        'Depoyu klonlayıp projeyi bir harness profiline ekleyin, ardından browser-extension klasörünü chrome://extensions üzerinden paketlenmemiş uzantı olarak yükleyin.',
        '/annotate’i çalıştırın, sayfadaki öğelere tıklayın ve her birine bir yorum iliştirin.',
        'Gönderin — yakalanan gerçekler ve viewport ekran görüntüsü ajanın bir sonraki turuna düşer.',
      ],
    },
    'dsh-hyperframes': {
      tagline:
        'HeyGen’in HyperFrames’i, taşınmış hâliyle: HTML’i bitmiş videoya dönüştüren beş resmî skill.',
      whatIsIt:
        'Tek kurulum, beş resmî HyperFrames by HeyGen skill’ini harness’e kaydeder: görsel stiller, paletler, altyazılar ve sese tepkili geçişlerle HTML video kompozisyonu, hyperframes CLI’ı, bileşen kayıt defteri, web sitesinden videoya bir boru hattı ve bir GSAP animasyon referansı.',
      whyForDesign: [
        'Zaten içinde çalıştığınız ortamda hareket tasarımı: HTML ve CSS, render edilmiş videoya dönüşür.',
        'Yedi adımlı web sitesinden videoya boru hattı, bir URL’yi üretilmiş bir klibe çevirir.',
        'Skill’ler açık SKILL.md biçimini kullanır; aynı set Claude Code, Cursor ve Codex’e taşınır.',
      ],
      howWithAgent: [
        'Eklentiyi web profilinize ekleyin ve yeniden başlatın.',
        'Boru hattını tetiklemek için “bu URL’yi bir HyperFrames videosuna dönüştür” deyin.',
        'hyperframes CLI ile render edin; tek bağımlılıklar Node 22+ ve FFmpeg.',
      ],
    },
    'dsh-web-preview': {
      tagline:
        'Çalışma alanını önizleyen, projeyi çalıştıran ve öğeleri notlayan cam görünümlü bir yan panel.',
      whatIsIt:
        'Harness web arayüzü için bir yan web önizleme paneli: çalışma alanı dosyaları önizleme için sunulur — Markdown render edilmiş, kod satır numaralı, görseller ve HTML olduğu gibi — projeler türünü otomatik algılar (Cargo, package.json, go.mod, Python) ve canlı loglarla çalışır; bir işaretleme modu, öğe notlarını konuşmaya geri yakalar.',
      whyForDesign: [
        'Ajanın az önce yazdığı prototip sohbetin yanında açılır; adres çubuğu eşitlenir, panel genişliği sürüklenebilir.',
        'İşaretleme modu, öğeleri üzerine gelerek vurgular, bir seçici ve HTML anlık görüntüsü yakalar ve notunuzu konuşmaya gönderir.',
        'Bağlantılar, dosya yolları ve bırakılan dosyaların tümü panelde açılır; inceleme oturumdan hiç ayrılmaz.',
      ],
      howWithAgent: [
        'Paketi web profil dizininize kurun, ardından o profilin cordis.patch.yml dosyasına dsh-web-preview-panel adlı bir insert girdisi ekleyerek monte edin.',
        'dsh web’i yeniden başlatın ve konuşmanın sağ üstündeki ▶ önizleme düğmesini açın.',
        'Projeyi panelden çalıştırın, öğeleri notlayın ve logları ya da notları doğrudan ajana gönderin.',
      ],
    },
  },
};
