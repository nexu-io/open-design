import type { PromptTemplateSummary } from '../types';

export const TR_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '3d-creator-portfolio': {
    description: 'Kullanıcı karanlık, birinci sınıf bir 3D oluşturucu / tasarımcı portföy açılış sayfası istediğinde bu eklentiyi kullanın: degrade metin başlığına ve fareyi takip eden manyetik 3D portreye sahip tam görüntü alanı kahramanı, kaydırmayla yönlendirilen yatay görüntü çerçevesi, köşe 3D dekorasyonları ve karakter bazında kaydırma ortaya çıkaran metin içeren bir Hakkında bölümü, beyaz bir Hizmetler listesi ve yapışkan istifleme proje kartları. \'3D yaratıcı portföyü\', \'tasarımcı açılış sayfası\', \'manyetik kahramanlı yaratıcı portföy\' veya kullanıcı Jack 3D Creator şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı karanlık, birinci sınıf bir 3D oluşturucu / tasarımcı portföy açılış sayfası istediğinde bu eklentiyi kullanın: degrade metin başlığına ve fareyi takip eden manyetik 3D portreye sahip tam görüntü alanı kahramanı, kaydırmayla yönlendirilen yatay görüntü çerçevesi, köşe 3D dekorasyonları ve karakter bazında kaydırma ortaya çıkaran metin içeren bir Hakkında bölümü, beyaz bir Hizmetler listesi ve yapışkan istifleme proje kartları. \'3D yaratıcı portföyü\', \'tasarımcı açılış sayfası\', \'manyetik kahramanlı yaratıcı portföy\' veya kullanıcı Jack 3D Creator şablonuna başvurduğunda çağrı yapın.',
  },
  '8-bit-orbit-video-template': {
    description: 'Retro pixel sunum hareket tasarımı için HyperFrames tabanlı video şablonu.\nKullanıcılar gelişmiş geçişler, etkileşimli önizleme kontrolleri ve render\'a hazır\nvarsayılan stil içeren yüksek kaliteli, çok sahneli bir HTML-to-video kompozisyonu\nistediğinde kullanın.',
    examplePrompt: '8-bit retro stilde, gelişmiş geçişler, zengin hareket ve her sayfası 3 saniyenin altında olan 3 sayfalık bir HyperFrames video sunumu oluştur.',
  },
  'acreage-farming': {
    description: 'Kullanıcı birinci sınıf bir hassas tarım / tarım teknolojisi açılış sayfası istediğinde bu eklentiyi kullanın: alternatif karanlık/açık bölümler, tam ekran bir kahraman video arka planı, animasyonlu bir istatistik tablosu, sonsuz bir logo çerçevesi ve resim destekli servis kartları. \'Tarım açılış sayfası\', \'tarım teknolojisi pazarlama sitesi\', \'hassas tarım sitesi\' için veya kullanıcı Ek Alan Tarımı şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı birinci sınıf bir hassas tarım / tarım teknolojisi açılış sayfası istediğinde bu eklentiyi kullanın: alternatif karanlık/açık bölümler, tam ekran bir kahraman video arka planı, animasyonlu bir istatistik tablosu, sonsuz bir logo çerçevesi ve resim destekli servis kartları. \'Tarım açılış sayfası\', \'tarım teknolojisi pazarlama sitesi\', \'hassas tarım sitesi\' için veya kullanıcı Ek Alan Tarımı şablonuna başvurduğunda çağrı yapın.',
  },
  'ad-creative': {
    description: 'Başlıklar, açıklamalar ve birincil metin dahil reklam kreatifleri oluştur ve yinele. Ücretli sosyal medya ve arama reklamı yinelemeleri için kullanışlıdır.',
    examplePrompt: 'Başlıklar, açıklamalar ve birincil metin dahil reklam kreatifleri oluştur ve yinele.',
  },
  'aerocore': {
    description: 'Kullanıcı birinci sınıf bir karanlıktan aydınlığa havacılık / itici güç pazarlama sitesi istediğinde bu eklentiyi kullanın: paralaks kelime işareti ve bir motor sabitleyicisi içeren kaydırmalı bir degrade kahraman, görev küçük resminden tam ekran yapışkan bir videoya dönüşen bir film kartı, sabitlenmiş sekmeli bir vitrin, döngüsel video kartları ve bir araç çerçevesi içeren bir bento yetenekleri ızgarası, kategori sekmeleri içeren animasyonlu bir karanlık istatistik tablosu, yatay bir video hikayesi rayı ve bir yıldız alanı altbilgisi. \'Havacılık iniş\', \'motor / itiş sitesi\', \'EngineTech\', \'kaydırma sinematik kahraman\' için veya kullanıcı AeroCore şablonuna başvurduğunda çağırın.',
    examplePrompt: 'Kullanıcı birinci sınıf bir karanlıktan aydınlığa havacılık / itici güç pazarlama sitesi istediğinde bu eklentiyi kullanın: paralaks kelime işareti ve bir motor sabitleyicisi içeren kaydırmalı bir degrade kahraman, görev küçük resminden tam ekran yapışkan bir videoya dönüşen bir film kartı, sabitlenmiş sekmeli bir vitrin, döngüsel video kartları ve bir araç çerçevesi içeren bir bento yetenekleri ızgarası, kategori sekmeleri içeren animasyonlu bir karanlık istatistik tablosu, yatay bir video hikayesi rayı ve bir yıldız alanı altbilgisi. \'Havacılık iniş\', \'motor / itiş sitesi\', \'EngineTech\', \'kaydırma sinematik kahraman\' için veya kullanıcı AeroCore şablonuna başvurduğunda çağırın.',
  },
  'after-hours-editorial-template': {
    description: 'Üç sayfalık sinematik storyboard\'lar için lüks, koyu editöryel HyperFrames şablonu;\nhaute couture jenerik kartlarından ve dergi bölüm sayfalarından ilham alır. Kullanıcı\npremium moda tarzı hareket sayfaları, atmosferik serif ağırlıklı anlatım ya da\nzengin geçişlere sahip üst düzey koyu sunum estetiği istediğinde kullanın.',
    examplePrompt: 'Koyu haute-couture stilde üç sayfalık bir HyperFrames editöryel dizisi oluştur: premium serif tipografi, magenta vurgu, zarif bölüm geçişleri ve sinematik grenli doku. Her sayfayı 3 saniyenin altında tut.',
  },
  'agent-browser': {
    description: 'AI ajanları için tarayıcı otomasyonu CLI\'ı. Kullanıcının tarayıcı davranışını\nincelemesi, test etmesi veya otomatikleştirmesi gerektiğinde kullanın: sayfalarda\ngezinme, form doldurma, düğmelere tıklama, ekran görüntüsü alma, sayfa verisi\nçıkarma, seçili Open Design tarayıcı sekmesi bağlamını okuma, web uygulamalarını\ntest etme, Open Design önizlemelerini dogfooding yapma, QA, hata avı veya uygulama\nkalitesini gözden geçirme. Kullanıcı açıkça harici tarama istemediği sürece yerel\nOpen Design önizleme URL\'lerini tercih edin.',
    examplePrompt: 'AI ajanları için tarayıcı otomasyonu CLI\'ı.',
  },
  'ai-designer-portfolio': {
    description: 'Kullanıcı, beyaz bir arka plan üzerinde birinci sınıf tek sayfalık bir yaratıcı stüdyo / tasarımcı portföyü açılış sayfası istediğinde bu eklentiyi kullanın: serif vurgulu kahraman, sonsuz bir GIF çerçevesi, paralaks referansı, iki kartlı fiyatlandırma, otomatik kayan referans karuseli, dikey proje vitrini, fare izi ortağı CTA ve sabit kayan alt gezinme. \'Tasarımcı portföyü\', \'yaratıcı stüdyo açılış sayfası\', \'ajans tek çağrı cihazı\' için veya kullanıcı Viktor Oddy / AI Tasarımcı Portföyü şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, beyaz bir arka plan üzerinde birinci sınıf tek sayfalık bir yaratıcı stüdyo / tasarımcı portföyü açılış sayfası istediğinde bu eklentiyi kullanın: serif vurgulu kahraman, sonsuz bir GIF çerçevesi, paralaks referansı, iki kartlı fiyatlandırma, otomatik kayan referans karuseli, dikey proje vitrini, fare izi ortağı CTA ve sabit kayan alt gezinme. \'Tasarımcı portföyü\', \'yaratıcı stüdyo açılış sayfası\', \'ajans tek çağrı cihazı\' için veya kullanıcı Viktor Oddy / AI Tasarımcı Portföyü şablonuna başvurduğunda çağrı yapın.',
  },
  'ai-music-album': {
    description: 'Tam yaşam döngüsü AI müzik albümü prodüksiyonu — konsept, söz yazımı, parça sıralaması ve dışa aktarma. Bağımsız albüm denemeleri ve marka müzikleri için kullanışlıdır.',
    examplePrompt: 'Tam yaşam döngüsü AI müzik albümü prodüksiyonu — konsept, söz yazımı, parça sıralaması ve dışa aktarma.',
  },
  'algorithmic-art': {
    description: 'Her render\'ın yeniden üretilebilir olması için tohum (seed) tabanlı rastgelelik kullanarak p5.js ile jeneratif sanat oluştur. Prosedürel posterler, hareket tarzı sabit görseller ve sanatsal kare çalışmaları için kullanışlıdır.',
    examplePrompt: 'Her render\'ın yeniden üretilebilir olması için tohum (seed) tabanlı rastgelelik kullanarak p5.js ile jeneratif sanat oluştur.',
  },
  'apple-hig': {
    description: 'iOS, macOS, visionOS, watchOS ve tvOS için platformları, temelleri, bileşenleri, kalıpları, girdileri ve teknolojileri kapsayan 14 ajan becerisi olarak Apple Human Interface Guidelines.',
    examplePrompt: 'iOS, macOS, visionOS, watchOS ve tvOS için platformları, temelleri, bileşenleri, kalıpları, girdileri ve teknolojileri kapsayan 14 ajan becerisi olarak Apple Human Interface Guidelines.',
  },
  'article-magazine': {
    description: 'Markdown\'ı veya notları cilalı, uzun biçimli bir HTML makaleye dönüştürmek için Huashu / huashu-md-html\'den ilham alan dergi makalesi düzeni.',
    examplePrompt: 'İçeriğimi Huashu / huashu-md-html\'den ilham alan uzun biçimli bir HTML makaleye dönüştürmek için Magazine Article şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'artifacts-builder': {
    description: 'Modern frontend web teknolojileri (React, Tailwind CSS, shadcn/ui) kullanarak ayrıntılı, çok bileşenli claude.ai HTML artifact\'leri oluşturmak için araç paketi.',
    examplePrompt: 'Modern frontend web teknolojileri (React, Tailwind CSS, shadcn/ui) kullanarak ayrıntılı, çok bileşenli claude.ai HTML artifact\'leri oluşturmak için araç paketi.',
  },
  'audio-jingle': {
    description: 'Ses oluşturma becerisi - jingle\'lar, yataklar, seslendirme ve ses efektleri.\r\nMüzik isteklerini Suno V5 / Udio / Lyria\'ya, konuşmayı MiniMax\'a yönlendirir\r\nTTS / FishAudio / ElevenLabs V3 ve SFX\'ten ElevenLabs SFX\'e veya\r\nAudioCraft. Çıktı, proje klasörüne kaydedilen bir MP3/WAV dosyasıdır.',
    examplePrompt: 'Ses oluşturma becerisi - jingle\'lar, yataklar, seslendirme ve ses efektleri.\r\nMüzik isteklerini Suno V5 / Udio / Lyria\'ya, konuşmayı MiniMax\'a yönlendirir\r\nTTS / FishAudio / ElevenLabs V3 ve SFX\'ten ElevenLabs SFX\'e veya\r\nAudioCraft. Çıktı, proje klasörüne kaydedilen bir MP3/WAV dosyasıdır.',
  },
  'blog-post': {
    description: 'Uzun biçimli bir makale / blog yazısı - künye, kahraman görseli yer tutucusu,\r\nŞekiller ve alıntılar içeren makale gövdesi, yazarın künyesi, ilgili yazılar.\r\nÖzette "blog", "makale", "gönderi", "deneme" veya "deneme" sorulduğunda kullanın.\r\n"vaka çalışması".',
    examplePrompt: 'Uzun biçimli bir makale / blog yazısı - künye, kahraman görseli yer tutucusu,\r\nŞekiller ve alıntılar içeren makale gövdesi, yazarın künyesi, ilgili yazılar.\r\nÖzette "blog", "makale", "gönderi", "deneme" veya "deneme" sorulduğunda kullanın.\r\n"vaka çalışması".',
  },
  'brainstorming': {
    description: 'Yapılandırılmış sorgulama ve alternatif keşfi yoluyla kaba fikirleri tam olgunlaşmış tasarımlara dönüştür. Konsept çalışmasının erken aşamalarında kullanışlıdır.',
    examplePrompt: 'Yapılandırılmış sorgulama ve alternatif keşfi yoluyla kaba fikirleri tam olgunlaşmış tasarımlara dönüştür.',
  },
  'brand-guidelines': {
    description: 'Tutarlı görsel kimlik ve profesyonel tasarım standartları için Anthropic\'in resmi marka renklerini ve tipografisini artifact\'lere uygula. Kendi tasarımını şekillendirmek için bir referans.',
    examplePrompt: 'Tutarlı görsel kimlik ve profesyonel tasarım standartları için Anthropic\'in resmi marka renklerini ve tipografisini artifact\'lere uygula.',
  },
  'brandkit': {
    description: 'Üst düzey marka kılavuzu panoları, logo sistemleri, kimlik sunumları ve görsel dünya sunumları oluşturmak için premium marka kiti görsel üretim becerisi. Minimalist, sinematik, editöryel, dark-tech, lüks, kültürel, güvenlik, oyun, geliştirici aracı ve tüketici uygulaması marka sistemleri için eğitilmiştir. Niyetli logo konseptlemesi, rafine kompozisyon, sade tipografi, güçlü sembolik anlam, premium mockup\'lar, sanat yönetmenliği görseller ve esnek grid düzenleri için optimize edilmiştir.',
    examplePrompt: 'Bu ürün için premium bir marka kiti genel görünüm görseli oluştur: logo yönü, palet, tipografi, uygulamalar ve tutarlı bir görsel dünya.',
  },
  'build-test': {
    description: 'Projenin build / typecheck / lint / test komutlarını çalıştırın ve build.passing + testler.passing devloop convergence\'ın okuduğu sinyalleri yayınlayın.',
    examplePrompt: 'Projenin build / typecheck / lint / test komutlarını çalıştırın ve build.passing + testler.passing devloop convergence\'ın okuduğu sinyalleri yayınlayın.',
  },
  'canvas-design': {
    description: 'Posterler, illüstrasyonlar ve sabit eserler için tasarım felsefesi ve estetik ilkelerini kullanarak PNG ve PDF belgelerinde güzel görsel sanat oluştur.',
    examplePrompt: 'Posterler, illüstrasyonlar ve sabit eserler için tasarım felsefesi ve estetik ilkelerini kullanarak PNG ve PDF belgelerinde güzel görsel sanat oluştur.',
  },
  'card-twitter': {
    description: 'Bir gönderiyle eşleştirilmek üzere tasarlanmış Twitter alıntı veya veri kartı.',
    examplePrompt: 'İçeriğimi bir gönderiyle eşleştirilmek üzere tasarlanmış bir Twitter alıntı veya veri kartına dönüştürmek için Twitter Share Card şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'card-xiaohongshu': {
    description: 'Kaydırılabilir çok kartlı bir karusel olarak düzenlenmiş Xiaohongshu tarzı bilgi kartları.',
    examplePrompt: 'İçeriğimi Xiaohongshu tarzı kaydırılabilir bir bilgi kartı karuseline dönüştürmek için Xiaohongshu Card şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'cinematic-landing-page': {
    description: 'Kullanıcı birinci sınıf, GSAP odaklı sinematik bir B2B açılış sayfası istediğinde bu eklentiyi kullanın: klip yollu elips geçişlerine sahip kaydırma odaklı tam ekran video kaydırıcı kahramanı, SplitText karakter açığa çıkaran başlıklar, duvarcılık ürün galerisi, metin hakkında kaydırmalı açıklama, ortak çerçeve, Lottie tarzı özellik kartları ve çoklu ofis altbilgisi. \'Sinematik açılış sayfası\', \'video kahramanı açılışı\', \'fırın/yemek servisi açılışı\', \'GSAP kaydırma sitesi\' veya kullanıcı Sinematik Açılış Sayfası şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı birinci sınıf, GSAP odaklı sinematik bir B2B açılış sayfası istediğinde bu eklentiyi kullanın: klip yollu elips geçişlerine sahip kaydırma odaklı tam ekran video kaydırıcı kahramanı, SplitText karakter açığa çıkaran başlıklar, duvarcılık ürün galerisi, metin hakkında kaydırmalı açıklama, ortak çerçeve, Lottie tarzı özellik kartları ve çoklu ofis altbilgisi. \'Sinematik açılış sayfası\', \'video kahramanı açılışı\', \'fırın/yemek servisi açılışı\', \'GSAP kaydırma sitesi\' veya kullanıcı Sinematik Açılış Sayfası şablonuna başvurduğunda çağrı yapın.',
  },
  'clinical-case-report': {
    description: 'Klinik turlar, konferanslar için yapılandırılmış tıbbi vaka sunumu,\r\nve belgeler. SOAP formatında veya anlatısal vaka raporları oluşturur\r\nfizyolojik olarak doğru hayati değerler, laboratuvarlar ve kanıta dayalı planlarla.\r\nÖzette "vaka raporu", "vaka sunumu", "SOAP notu" ifadeleri yer aldığında kullanın.\r\n"klinik vaka", "koğuş ziyaretleri", "vaka özeti" veya "hasta sunumu".',
    examplePrompt: 'Klinik turlar, konferanslar için yapılandırılmış tıbbi vaka sunumu,\r\nve belgeler. SOAP formatında veya anlatısal vaka raporları oluşturur\r\nfizyolojik olarak doğru hayati değerler, laboratuvarlar ve kanıta dayalı planlarla.\r\nÖzette "vaka raporu", "vaka sunumu", "SOAP notu" ifadeleri yer aldığında kullanın.\r\n"klinik vaka", "koğuş ziyaretleri", "vaka özeti" veya "hasta sunumu".',
  },
  'code-import': {
    description: 'Mevcut bir havuzun yapısını proje cwd\'sine, aracının her fırsatta ağaçta yeniden yürümesine gerek kalmadan analiz edebileceği normalleştirilmiş bir anlık görüntü olarak okuyun.',
    examplePrompt: 'Mevcut bir havuzun yapısını proje cwd\'sine, aracının her fırsatta ağaçta yeniden yürümesine gerek kalmadan analiz edebileceği normalleştirilmiş bir anlık görüntü olarak okuyun.',
  },
  'codenest-coding-platform': {
    description: 'Kullanıcı, kodlama eğitimi / eğitim kampı açılış sayfası (CodeNest) için üst düzey, karanlık bir sinematik kahraman bölümü istediğinde bu eklentiyi kullanın: tam ekran HLS arka plan videosu, sıvı cam kart, yeşil vurgulu tipografi ve çalışan bir mobil hamburger menüsü. \'Kodlama eğitim kampı kahramanı\', \'geliştirme kursu açılış sayfası\', \'sıvı cam kahramanı\', \'video arka plan kahramanı\' için veya kullanıcı CodeNest şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, kodlama eğitimi / eğitim kampı açılış sayfası (CodeNest) için üst düzey, karanlık bir sinematik kahraman bölümü istediğinde bu eklentiyi kullanın: tam ekran HLS arka plan videosu, sıvı cam kart, yeşil vurgulu tipografi ve çalışan bir mobil hamburger menüsü. \'Kodlama eğitim kampı kahramanı\', \'geliştirme kursu açılış sayfası\', \'sıvı cam kahramanı\', \'video arka plan kahramanı\' için veya kullanıcı CodeNest şablonuna başvurduğunda çağrı yapın.',
  },
  'codex-interactive-capability-map': {
    description: 'Uzun biçimli bir makaleyi, ileti dizisini, notu veya ürün anlatımını iş akışı döngüsü, kullanım senaryosu matrisi ve duyarlı ayrıntı paneliyle kompakt, tıklanabilir bir yetenek haritasına dönüştürün.',
    examplePrompt: 'Uzun biçimli bir makaleyi, ileti dizisini, notu veya ürün anlatımını iş akışı döngüsü, kullanım senaryosu matrisi ve duyarlı ayrıntı paneliyle kompakt, tıklanabilir bir yetenek haritasına dönüştürün.',
  },
  'color-expert': {
    description: 'OKLCH/OKLAB, palet üretimi, erişilebilirlik/kontrast, renk adlandırma, pigment karıştırma ve tarihsel renk teorisini kapsayan 286K kelimelik referans materyaliyle renk bilimi uzmanı becerisi.',
    examplePrompt: 'OKLCH/OKLAB, palet üretimi, erişilebilirlik/kontrast, renk adlandırma, pigment karıştırma ve tarihsel renk teorisini kapsayan 286K kelimelik referans materyaliyle renk bilimi uzmanı becerisi.',
  },
  'community-import-smoke-test': {
    description: 'Açık Tasarım eklentisi içe aktarma akışlarını doğrulamak için taşınabilir bir topluluk eklentisi.',
    examplePrompt: 'Açık Tasarım eklentisi içe aktarma akışlarını doğrulamak için taşınabilir bir topluluk eklentisi.',
  },
  'community-registry-starter': {
    description: 'Açık Tasarım pazar yeri yükleme akışlarını doğrulamak için kullanılan küçük bir topluluk kayıt defteri başlangıç ​​eklentisi.',
    examplePrompt: 'Açık Tasarım pazar yeri yükleme akışlarını doğrulamak için kullanılan küçük bir topluluk kayıt defteri başlangıç ​​eklentisi.',
  },
  'competitive-ads-extractor': {
    description: 'Yankı uyandıran mesajlaşma ve kreatif yaklaşımları anlamak için reklam kütüphanelerinden rakiplerin reklamlarını çıkar ve analiz et.',
    examplePrompt: 'Yankı uyandıran mesajlaşma ve kreatif yaklaşımları anlamak için reklam kütüphanelerinden rakiplerin reklamlarını çıkar ve analiz et.',
  },
  'contact-widget': {
    description: 'Karşılama ekranı, sosyal bağlantılar, toplantı düğmesi ve mesaj girişi içeren bağımsız kayan sohbet widget\'ı. Tek HTML dosyası, sıfır bağımlılık.',
    examplePrompt: 'Karşılama ekranı, sosyal bağlantılar, toplantı düğmesi ve mesaj girişi içeren bağımsız kayan sohbet widget\'ı. Tek HTML dosyası, sıfır bağımlılık.',
  },
  'copywriting': {
    description: 'Açılış sayfaları, ana sayfalar ve reklamlar için pazarlama metni yaz ve yeniden yaz. Lansmanlar sırasında bir metin şefi ortağı olarak kullanışlıdır.',
    examplePrompt: 'Açılış sayfaları, ana sayfalar ve reklamlar için pazarlama metni yaz ve yeniden yaz.',
  },
  'create-hyperframes-launch': {
    description: 'Kullanıcı, HyperFrames\'e hazır HTML hareket kompozisyonu, başlatma animasyonu, kinetik tipografi klibi, ürün gösterimi veya koddan yapılmış sosyal video istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, HyperFrames\'e hazır HTML hareket kompozisyonu, başlatma animasyonu, kinetik tipografi klibi, ürün gösterimi veya koddan yapılmış sosyal video istediğinde bu eklentiyi kullanın.',
  },
  'create-image-campaign': {
    description: 'Kullanıcı, yaratıcı brifingden görsel öğeleri, posterler, sosyal görseller, reklam konseptleri veya küçük bir kampanya görsel sistemi istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, yaratıcı brifingden görsel öğeleri, posterler, sosyal görseller, reklam konseptleri veya küçük bir kampanya görsel sistemi istediğinde bu eklentiyi kullanın.',
  },
  'create-live-artifact-ops': {
    description: 'Müşteri başarısı ve desteği için yenilenebilir bir canlı operasyon yapısı oluşturun veya inceleme iş akışlarını başlatın.',
    examplePrompt: 'Müşteri başarısı ve desteği için yenilenebilir bir canlı operasyon yapısı oluşturun veya inceleme iş akışlarını başlatın.',
  },
  'create-prototype-dashboard': {
    description: 'Yoğun KPI\'lar, durum tabloları ve odaklanmış bir komuta merkezi düzeniyle gösterişli bir operasyon kontrol paneli prototipi oluşturun.',
    examplePrompt: 'Yoğun KPI\'lar, durum tabloları ve odaklanmış bir komuta merkezi düzeniyle gösterişli bir operasyon kontrol paneli prototipi oluşturun.',
  },
  'create-slides-pitch': {
    description: 'Güçlü bir anlatıma ve finansa hazır slayt yapısına sahip, erken aşamadaki bir ürün için kısa ve öz bir HTML sunum sunumu oluşturun.',
    examplePrompt: 'Güçlü bir anlatıma ve finansa hazır slayt yapısına sahip, erken aşamadaki bir ürün için kısa ve öz bir HTML sunum sunumu oluşturun.',
  },
  'create-video-storyboard': {
    description: 'Kullanıcı bir ürün, kampanya veya açıklayıcı için video konsepti, storyboard, çekim listesi, bilgi paketi veya görüntülenmeye hazır hareket özeti istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı bir ürün, kampanya veya açıklayıcı için video konsepti, storyboard, çekim listesi, bilgi paketi veya görüntülenmeye hazır hareket özeti istediğinde bu eklentiyi kullanın.',
  },
  'creative-director': {
    description: 'Özyinelemeli öz değerlendirmeye sahip AI kreatif direktör: 20\'den fazla metodoloji (SIT, TRIZ, Bisociation, SCAMPER, Synectics), Cannes/D&AD/HumanKind\'a göre kalibre edilmiş 3 eksenli değerlendirme, brief\'ten sunuma 5 aşamalı süreç.',
    examplePrompt: 'Özyinelemeli öz değerlendirmeye sahip AI kreatif direktör: 20\'den fazla metodoloji (SIT, TRIZ, Bisociation, SCAMPER, Synectics), Cannes/D&AD/HumanKind\'a göre kalibre edilmiş 3 eksenli değerlendirme, brief\'ten sunuma 5 aşamalı süreç.',
  },
  'critique': {
    description: 'Herhangi bir HTML yapısı üzerinde 5 boyutlu bir uzman tasarım incelemesi çalıştırın.\r\nproje — Felsefe / Görsel hiyerarşi / Detay / İşlevsellik /\r\nYenilik, her biri 0-10 arasında puan aldı. Tek bir bağımsız HTML çıktısı alır\r\nradar grafiği, kanıta dayalı puanlar ve üç liste içeren rapor:\r\nTut / Düzelt / Hızlı Kazan. Özette bir "tasarım" istendiğinde kullanın\r\ninceleme", "tasarım eleştirisi", "5 belge", "tasarım denetimi" veya "nedir?\r\ntasarımımda yanlış".',
    examplePrompt: 'Herhangi bir HTML yapısı üzerinde 5 boyutlu bir uzman tasarım incelemesi çalıştırın.\r\nproje — Felsefe / Görsel hiyerarşi / Detay / İşlevsellik /\r\nYenilik, her biri 0-10 arasında puan aldı. Tek bir bağımsız HTML çıktısı alır\r\nradar grafiği, kanıta dayalı puanlar ve üç liste içeren rapor:\r\nTut / Düzelt / Hızlı Kazan. Özette bir "tasarım" istendiğinde kullanın\r\ninceleme", "tasarım eleştirisi", "5 belge", "tasarım denetimi" veya "nedir?\r\ntasarımımda yanlış".',
  },
  'critique-theater': {
    description: '5 boyutlu eleştiri paneli; devloop yakınsamasını yönlendiren critique.score sinyalini yayar.',
    examplePrompt: '5 boyutlu eleştiri paneli; devloop yakınsamasını yönlendiren critique.score sinyalini yayar.',
  },
  'd3-visualization': {
    description: 'Ajana D3 grafikleri ve etkileşimli veri görselleştirmeleri üretmeyi öğretir. Çeşitli grafik türleri ve teknikler için örnekler içeren kapsamlı bir D3.js becerisidir; ajana karmaşık, etkileşimli görselleştirmeler oluşturması için uzman düzeyinde bilgi kazandırır. Editöryel panolar, raporlar, veri yoğun prototipler ve açıklayıcı grafikler için kullanışlıdır.',
    examplePrompt: 'Ajana D3 grafikleri ve etkileşimli veri görselleştirmeleri üretmeyi öğretir.',
  },
  'dashboard': {
    description: 'Tek bir HTML dosyasında yönetici / analiz panosu. Sabit sol kenar çubuğu,\r\nKullanıcı/arama içeren üst çubuk, KPI kartlarının ana tablosu ve bir veya iki grafik.\r\nÖzette bir "kontrol paneli", "yönetici", "analiz" veya "analiz" istendiğinde kullanın.\r\n"kontrol paneli" ekranı.',
    examplePrompt: 'Tek bir HTML dosyasında yönetici / analiz panosu. Sabit sol kenar çubuğu,\r\nKullanıcı/arama içeren üst çubuk, KPI kartlarının ana tablosu ve bir veya iki grafik.\r\nÖzette bir "kontrol paneli", "yönetici", "analiz" veya "analiz" istendiğinde kullanın.\r\n"kontrol paneli" ekranı.',
  },
  'dashboard-ui-glass': {
    description: 'Kullanıcı birinci sınıf bir sıvı cammorfizm konferans / toplantı panosu istediğinde bu eklentiyi kullanın: temaya göre değiştirilen çift tam ekran arka plan videoları, 4x2 cam/katı kart ızgarası, animasyonlu ses dalgası katılımcı göstergeleri ve kayan bir kontrol çubuğu. \'Cam kontrol paneli\', \'konferans kontrol paneli\', \'toplantı odası kullanıcı arayüzü\' veya kullanıcı Kontrol Paneli Kullanıcı Arayüzü sıvı cam şablonuna başvurduğunda bunu çağırın.',
    examplePrompt: 'Kullanıcı birinci sınıf bir sıvı cammorfizm konferans / toplantı panosu istediğinde bu eklentiyi kullanın: temaya göre değiştirilen çift tam ekran arka plan videoları, 4x2 cam/katı kart ızgarası, animasyonlu ses dalgası katılımcı göstergeleri ve kayan bir kontrol çubuğu. \'Cam kontrol paneli\', \'konferans kontrol paneli\', \'toplantı odası kullanıcı arayüzü\' veya kullanıcı Kontrol Paneli Kullanıcı Arayüzü sıvı cam şablonuna başvurduğunda bunu çağırın.',
  },
  'data-report': {
    description: 'CSV, Excel veya JSON verilerini şık bir görsel rapor sayfasına dönüştürür.',
    examplePrompt: 'CSV, Excel veya JSON verilerimi şık bir görsel rapor sayfasına dönüştürmek için Veri Görselleştirme Raporu şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'dating-web': {
    description: 'Tüketici hissi veren bir flört / çöpçatanlık kontrol paneli - sol ray navigasyonu,\r\nTopluluk sinyallerinin şerit çubuğu, başlık KPI\'ları, 30 günlük karşılıklı eşleşmeler\r\nçubuk grafik ve eşleşme oranı trend bloğu. Editoryal tipografi, ölçülü\r\naksan. Özette bir "arkadaşlık sitesi", "çöpçatanlık" istendiğinde kullanın.\r\n"topluluk kontrol paneli", "sosyal ağ kontrol paneli" veya herhangi bir tüketici\r\nVerilerin hikaye olduğu ürün.',
    examplePrompt: 'Tüketici hissi veren bir flört / çöpçatanlık kontrol paneli - sol ray navigasyonu,\r\nTopluluk sinyallerinin şerit çubuğu, başlık KPI\'ları, 30 günlük karşılıklı eşleşmeler\r\nçubuk grafik ve eşleşme oranı trend bloğu. Editoryal tipografi, ölçülü\r\naksan. Özette bir "arkadaşlık sitesi", "çöpçatanlık" istendiğinde kullanın.\r\n"topluluk kontrol paneli", "sosyal ağ kontrol paneli" veya herhangi bir tüketici\r\nVerilerin hikaye olduğu ürün.',
  },
  'dcf-valuation': {
    description: 'Kamu için indirimli nakit akışı değerlemesi ve içsel değer analizi\r\nşirketler. Özette DCF, gerçeğe uygun değer, gerçek değer sorulduğunda kullanın.\r\nfiyat hedefi, düşük veya aşırı değerli analizler veya "bu şirket nedir?"\r\ndeğer mi?"',
    examplePrompt: 'Kamu için indirimli nakit akışı değerlemesi ve içsel değer analizi\r\nşirketler. Özette DCF, gerçeğe uygun değer, gerçek değer sorulduğunda kullanın.\r\nfiyat hedefi, düşük veya aşırı değerli analizler veya "bu şirket nedir?"\r\ndeğer mi?"',
  },
  'deck-guizang-editorial': {
    description: 'Editöryel dergi ile e-mürekkebin buluşması: 10 düzen ve 5 palet (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt: 'İçeriğimi 10 düzen ve 5 paletle editöryel dergi x e-mürekkep yatay sunuma dönüştürmek için Guizang Editorial E-Ink Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deck-open-slide-canvas': {
    description: 'Sabit bir şablona bağlı olmayan, React bileşen düzeyinde serbest kompozisyona sahip, kilitli 1920x1080 tuval sunumu.',
    examplePrompt: 'İçeriğimi React bileşen düzeyinde düzene sahip, kilitli 1920x1080 serbest kompozisyonlu bir sunuma dönüştürmek için Open-Slide 1920 Canvas Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deck-swiss-international': {
    description: '16 sütunlu ızgara, tek doygun vurgu rengi ve 22 kilitli düzen (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt: 'İçeriğimi tek doygun vurgu rengi ve 22 kilitli düzenle 16 sütunlu ızgara sunumuna dönüştürmek için Swiss International Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deep-think-maximum-cognitive-effort-protocol-mq8kvw92': {
    description: 'Kullanıcı karmaşık, yüksek riskli veya belirsiz bir görev için maksimum eforlu akıl yürütme iş akışı istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı karmaşık, yüksek riskli veya belirsiz bir görev için maksimum eforlu akıl yürütme iş akışı istediğinde bu eklentiyi kullanın.',
  },
  'deploy-vercel-static': {
    description: 'Kullanıcı, kabul edilen bir statik web yapıtını Vercel\'e dağıtmak veya önizleme ve üretim URL\'leriyle eşdeğer bir dağıtım aktarımı hazırlamak istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, kabul edilen bir statik web yapıtını Vercel\'e dağıtmak veya önizleme ve üretim URL\'leriyle eşdeğer bir dağıtım aktarımı hazırlamak istediğinde bu eklentiyi kullanın.',
  },
  'design-brief': {
    description: 'I-Lang protokol formatında yazılmış yapılandırılmış bir tasarım brifini\nsomut bir tasarım spesifikasyonuna ayrıştır. "Profesyonel yap" gibi belirsiz\nisteklerdeki muğlaklığı, açık boyutlar gerektirerek ortadan kaldırır: palet, tipografi,\ndüzen, atmosfer, yoğunluk ve kısıtlamalar.\nTetikleyici anahtar kelimeler: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt: 'I-Lang protokol formatında yazılmış yapılandırılmış bir tasarım brifini somut bir tasarım spesifikasyonuna ayrıştır.',
  },
  'design-consultation': {
    description: 'Yaratıcı riskler ve gerçekçi ürün maketleriyle sıfırdan eksiksiz bir tasarım sistemi kur. Başlangıç atölyeleri ve sıfırdan marka çalışmaları için kullanışlıdır.',
    examplePrompt: 'Yaratıcı riskler ve gerçekçi ürün maketleriyle sıfırdan eksiksiz bir tasarım sistemi kur.',
  },
  'design-extract': {
    description: 'İçe aktarılan kaynak kodundan, ekran görüntülerinden veya Figma dışa aktarmalarından tasarım belirteçlerini (renk / tipografi / aralık) belirteç haritasının tükettiği kanonik belirteç çantasına çıkarın.',
    examplePrompt: 'İçe aktarılan kaynak kodundan, ekran görüntülerinden veya Figma dışa aktarmalarından tasarım belirteçlerini (renk / tipografi / aralık) belirteç haritasının tükettiği kanonik belirteç çantasına çıkarın.',
  },
  'design-md': {
    description: 'DESIGN.md dosyaları oluştur ve yönet. Tasarım yönelimini, token\'ları ve görsel kuralları tek bir doğruluk kaynağında toplamak için kullanışlıdır.',
    examplePrompt: 'DESIGN.md dosyaları oluştur ve yönet.',
  },
  'design-review': {
    description: 'Kod Yazan Tasarımcı: görsel denetim ardından atomik commit\'ler ve öncesi/sonrası ekran görüntüleriyle düzeltmeler. Yayınlanan arayüzü lansmandan önce sıkılaştırmak için kullanışlıdır.',
    examplePrompt: 'Kod Yazan Tasarımcı: görsel denetim ardından atomik commit\'ler ve öncesi/sonrası ekran görüntüleriyle düzeltmeler.',
  },
  'design-taste-frontend': {
    description: 'Açılış sayfaları, portfolyolar ve yeniden tasarımlar için baştan savmacılık karşıtı frontend skill\'i. Ajan brief\'i okur, doğru tasarım yönünü çıkarır ve şablon gibi görünmeyen arayüzler sunar. Uygun olduğunda gerçek tasarım sistemleri, yeniden tasarımlarda önce denetim, katı uçuş öncesi kontrol.',
    examplePrompt: 'design-taste-frontend yaklaşımını izleyen premium bir açılış sayfası oluşturun: tasarım okumasını çıkarın, ayarları belirleyin, yapay zekâ baştan savmacılığı kalıplarından kaçının ve cilalı, duyarlı bir HTML artifaktı çıkarın.',
  },
  'design-taste-frontend-v1': {
    description: 'Tam davranışına bağımlı projeler için korunan orijinal v1 taste-skill\'i. Mevcut varsayılan, kapsamlı bir yeniden yazım olan `design-taste-frontend` (v2 deneysel) sürümüdür. Bu v1 kurulum adını yalnızca tam geriye dönük uyumluluğa ihtiyacınız varsa kullanın.',
    examplePrompt: 'Güçlü tipografi, boşluk düzeni, hareket ve baştan savmacılık karşıtı koruma önlemleriyle design-taste-frontend-v1 kullanarak cilalı bir pazarlama sayfası oluşturun.',
  },
  'diff-review': {
    description: 'Yama düzenleme çalışmasının birikmiş değişikliklerini incelenebilir bir fark olarak işleyin, bunu bir GenUI seçim yüzeyi aracılığıyla yüzeye çıkarın ve kullanıcının kabul etme/ret etme kararını yapı bildiriminde kalıcı hale getirin.',
    examplePrompt: 'Yama düzenleme çalışmasının birikmiş değişikliklerini incelenebilir bir fark olarak işleyin, bunu bir GenUI seçim yüzeyi aracılığıyla yüzeye çıkarın ve kullanıcının kabul etme/ret etme kararını yapı bildiriminde kalıcı hale getirin.',
  },
  'digital-eguide': {
    description: 'İki yönlü dijital e-kılavuz önizlemesi — sayfa 1 bir kapaktır (görüntü başlığı,\r\nyazar, "İçeride ne var" istatistikleri, içindekiler teaserı); sayfa 2 bir\r\nyayılmış (alıntı ve adım listesi içeren ders gövdesi). Yaşam tarzı / yaratıcı\r\nmarka tonu. Özette bir "e-rehber", "dijital rehber" istendiğinde kullanın.\r\n"lookbook", "kurşun mıknatıs", "yaratıcı kılavuzu", "başucu kitabı", "PDF kılavuzu",\r\nveya "电子指南".',
    examplePrompt: 'İki yönlü dijital e-kılavuz önizlemesi — sayfa 1 bir kapaktır (görüntü başlığı,\r\nyazar, "İçeride ne var" istatistikleri, içindekiler teaserı); sayfa 2 bir\r\nyayılmış (alıntı ve adım listesi içeren ders gövdesi). Yaşam tarzı / yaratıcı\r\nmarka tonu. Özette bir "e-rehber", "dijital rehber" istendiğinde kullanın.\r\n"lookbook", "kurşun mıknatıs", "yaratıcı kılavuzu", "başucu kitabı", "PDF kılavuzu",\r\nveya "电子指南".',
  },
  'digits-fintech-swiss-template': {
    description: 'Siyah / sıcak kağıt / neon-lime kontrastında İsviçre ızgaralı fintech sunum şablonu.\nKullanıcılar sıkı modüler düzene, kalın sayısal kartlara, ölçülü harekete ve\ntek HTML dosyasında klavye/tıklama navigasyonuna sahip premium veri hikayesi slaytları istediğinde kullan.',
    examplePrompt: 'Modüler veri kartları, lime vurguları ve temiz klavye navigasyonuyla İsviçre ızgaralı bir fintech strateji sunumu oluştur.',
  },
  'direction-picker': {
    description: 'Kullanıcının son nesilden önce seçim yapmasına olanak tanıyan 3-5 yön seçici.',
    examplePrompt: 'Kullanıcının son nesilden önce seçim yapmasına olanak tanıyan 3-5 yön seçici.',
  },
  'discovery-question-form': {
    description: 'Belirsiz özetler için 1. Turne keşif soru formu.',
    examplePrompt: 'Belirsiz özetler için 1. Turne keşif soru formu.',
  },
  'doc': {
    description: 'OpenAI\'nin belge becerisi aracılığıyla biçimlendirme ve düzen sadakatiyle .docx belgelerini oku, oluştur ve düzenle.',
    examplePrompt: 'OpenAI\'nin belge becerisi aracılığıyla biçimlendirme ve düzen sadakatiyle .docx belgelerini oku, oluştur ve düzenle.',
  },
  'doc-kami-parchment': {
    description: 'Sıcak parşömen tuvali (#f5f4ed), tek renkli ink-blue vurgu (#1B365D), tek bir serif yazı ailesi ve editöryel düzeyde tipografi.',
    examplePrompt: 'İçeriğimi tek renkli ink-blue vurgular, tek bir serif yazı ailesi ve editöryel düzeyde tipografiye sahip sıcak bir parşömen belgesine dönüştürmek için Kami Parchment Document şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'docs-page': {
    description: 'Bir dokümantasyon sayfası — satır içi başlangıç gezinmesi, kaydırılabilir makale gövdesi,\r\nsatır içi uç içindekiler tablosu. Özette "belgeler" den bahsedildiğinde kullanın,\r\n"belgeler", "rehber", "API referansı" veya "öğretici".',
    examplePrompt: 'Bir dokümantasyon sayfası — satır içi başlangıç gezinmesi, kaydırılabilir makale gövdesi,\r\nsatır içi uç içindekiler tablosu. Özette "belgeler" den bahsedildiğinde kullanın,\r\n"belgeler", "rehber", "API referansı" veya "öğretici".',
  },
  'docx': {
    description: 'Değişiklik izleme, yorumlar ve biçimlendirmeyle Word belgeleri oluştur, düzenle ve analiz et. Tasarım brifleri, metin belgeleri ve incelemeye hazır teslimatlar için kullanışlıdır.',
    examplePrompt: 'Değişiklik izleme, yorumlar ve biçimlendirmeyle Word belgeleri oluştur, düzenle ve analiz et.',
  },
  'domain-name-brainstormer': {
    description: '.com, .io, .dev ve .ai dahil birden fazla TLD\'de yaratıcı alan adı fikirleri üret ve uygunluğu kontrol et.',
    examplePrompt: '.com, .io, .dev ve .ai dahil birden fazla TLD\'de yaratıcı alan adı fikirleri üret ve uygunluğu kontrol et.',
  },
  'dreamcore-landing': {
    description: 'Kullanıcı, kaydırmayla yönlendirilen bir portal/perde girişi ve kavisli bir yay kartı kaydırıcısı olan tek sayfalık sürükleyici bir paralaks açılış sayfası istediğinde bu eklentiyi kullanın; kullanıcı ikinci bir rüya dünyası sahnesine geçerken portal görüntüsünü izleyiciye doğru ölçekleyen bir \'dreamcore\' / \'hayal\' kahramanı. \'Parlaks iniş\', \'sinema kahramanını kaydırma\', \'portal yakınlaştırma iniş\', \'yay kartı kaydırıcı\' veya kullanıcı Dreamcore Landing şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, kaydırmayla yönlendirilen bir portal/perde girişi ve kavisli bir yay kartı kaydırıcısı olan tek sayfalık sürükleyici bir paralaks açılış sayfası istediğinde bu eklentiyi kullanın; kullanıcı ikinci bir rüya dünyası sahnesine geçerken portal görüntüsünü izleyiciye doğru ölçekleyen bir \'dreamcore\' / \'hayal\' kahramanı. \'Parlaks iniş\', \'sinema kahramanını kaydırma\', \'portal yakınlaştırma iniş\', \'yay kartı kaydırıcı\' veya kullanıcı Dreamcore Landing şablonuna başvurduğunda çağrı yapın.',
  },
  'ecommerce-image-workflow': {
    description: 'Gerçek ürün referans fotoğraflarından ürüne sadık ana, özellik ve yaşam tarzı\ngörsellerinden oluşan derli toplu bir set üretmeye yönelik referans-ürün\ne-ticaret görsel iş akışı. V1, yüklenmiş ürün görseli gerektirir ve yalnızca brif\ntabanlı konsept üretimini ve platforma özel toplu dışa aktarmaları bilinçli olarak erteler.',
    examplePrompt: 'Yüklediğim ürün referans fotoğrafını derli toplu bir e-ticaret görsel\nsetine dönüştürmek için Ecommerce Image Workflow\'u kullan: bir ana paket\nçekimi, bir özellik vurgu görseli ve bir yaşam tarzı sahnesi. Ürünün tam\nkimliğini, rengini, malzemesini, logo yerleşimini, yapısını ve oranlarını koru.',
  },
  'editorial-burgundy-principles-template': {
    description: 'Bordo / pudra / mat altın paletinde editöryel stüdyo sunum şablonu.\nKullanıcılar hap etiketleri, büyük tipografik ifadeler, ilke kartları ve\nyönlendirmeli klavye/tıklama navigasyonuna sahip premium manifesto veya kültür slaytları istediğinde kullan.',
    examplePrompt: 'Bir etiket bulutu slaytı ve sekiz ilkelik bir kart ızgarasıyla bordo ve pudra renklerinde premium bir editöryel sunum oluştur.',
  },
  'email-marketing': {
    description: 'Bir marka ürün lansmanı e-postası - kelime işaretini içeren künye, ana resim bloğu,\r\nÇarpık italik vurgulu başlık kilitleme, gövde metni, birincil CTA ve\r\nözellikler ızgarası. Saf HTML e-posta düzeni (ortalanmış tek sütun, tablo\r\ngeri dönüş). Özette "e-posta", "bülten patlaması" istendiğinde kullanın.\r\n"MJML", "ürün lansmanı e-postası" veya "e-posta şablonu".',
    examplePrompt: 'Bir marka ürün lansmanı e-postası - kelime işaretini içeren künye, ana resim bloğu,\r\nÇarpık italik vurgulu başlık kilitleme, gövde metni, birincil CTA ve\r\nözellikler ızgarası. Saf HTML e-posta düzeni (ortalanmış tek sütun, tablo\r\ngeri dönüş). Özette "e-posta", "bülten patlaması" istendiğinde kullanın.\r\n"MJML", "ürün lansmanı e-postası" veya "e-posta şablonu".',
  },
  'emilkowalski-motion': {
    description: 'Emil Kowalski\'nin animasyon rehberliğinden esinlenen hareket tasarımı takip becerisi. Ürün düzeyinde ölçülülükle zarif mikro etkileşimler, durum geçişleri ve sayfa hareketi eklemek için bir arayüz var olduktan sonra kullan.',
    examplePrompt: 'Mevcut HTML eserinde emilkowalski-motion\'ı kullan: temel düzeni değiştirmeden ölçülü mikro etkileşimler, durum geçişleri ve azaltılmış hareket yedekleri ekle.',
  },
  'eng-runbook': {
    description: 'Bir mühendislik runbook\'u — hizmete genel bakış, uyarı tablosu, panolar\r\nbağlantılar, kopyalanıp yapıştırılabilir komutlarla ortak prosedürler, çağrı sırasında rotasyon,\r\nve bir olay-müdahale kontrol listesi. Kısa bahsedildiğinde kullanın\r\n"runbook", "operasyon belgesi", "çağrı üzerine kılavuz", "SRE belgesi" veya "运维手册".',
    examplePrompt: 'Bir mühendislik runbook\'u — hizmete genel bakış, uyarı tablosu, panolar\r\nbağlantılar, kopyalanıp yapıştırılabilir komutlarla ortak prosedürler, çağrı sırasında rotasyon,\r\nve bir olay-müdahale kontrol listesi. Kısa bahsedildiğinde kullanın\r\n"runbook", "operasyon belgesi", "çağrı üzerine kılavuz", "SRE belgesi" veya "运维手册".',
  },
  'enhance-prompt': {
    description: 'İstemleri tasarım spesifikasyonları ve UI/UX terminolojisiyle iyileştir. Tasarımdan koda iş akışları ve görsel çıktı isteklerini netleştirmek için kullanışlıdır.',
    examplePrompt: 'İstemleri tasarım spesifikasyonları ve UI/UX terminolojisiyle iyileştir.',
  },
  'evergreen-finance': {
    description: 'Kullanıcı birinci sınıf bir \'Kova\' fintech / bankacılık açılış sayfası istediğinde bu eklentiyi kullanın: bumerang (ileri/geri) video arka planına sahip tam ekran bir kahraman, animasyonlu FadeUp gösterimleri, değişken kontrol paneli kartları (tasarruf çizgi grafiği, harcama çubuğu grafikleri), kare otomatik oynatma videosu içeren bölünmüş bir referans bölümü ve resim kartları ve halka harcama grafiği içeren 4\'lü özellikler ızgarası. \'Fintech iniş\', \'bankacılık uygulaması açılış\', \'Kova\', \'videolu finans kahramanı\' veya kullanıcı Evergreen Finans şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı birinci sınıf bir \'Kova\' fintech / bankacılık açılış sayfası istediğinde bu eklentiyi kullanın: bumerang (ileri/geri) video arka planına sahip tam ekran bir kahraman, animasyonlu FadeUp gösterimleri, değişken kontrol paneli kartları (tasarruf çizgi grafiği, harcama çubuğu grafikleri), kare otomatik oynatma videosu içeren bölünmüş bir referans bölümü ve resim kartları ve halka harcama grafiği içeren 4\'lü özellikler ızgarası. \'Fintech iniş\', \'bankacılık uygulaması açılış\', \'Kova\', \'videolu finans kahramanı\' veya kullanıcı Evergreen Finans şablonuna başvurduğunda çağrı yapın.',
  },
  'export-download-debugging': {
    description: 'Tarayıcı, önizleme veya Electron dışa aktarma/indirme hatalarını teşhis et ve düzelt; özellikle Farklı Kaydet, Blob/Data URL\'leri, File System Access API, createWritable hataları ve 0 KB dosyaları içeren görsel dışa aktarma sorunları.',
    examplePrompt: 'Tarayıcı, önizleme veya Electron dışa aktarma/indirme hatalarını teşhis et ve düzelt; özellikle Farklı Kaydet, Blob/Data URL\'leri, File System Access API, createWritable hataları ve 0 KB dosyaları içeren görsel dışa aktarma sorunları.',
  },
  'export-nextjs-handoff': {
    description: 'Kullanıcı, kabul edilen bir Açık Tasarım yapısının temiz bileşenler, stiller, varlıklar ve uygulama notları içeren bir Next.js Uygulama Yönlendiricisi aktarımına dönüştürülmesini istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, kabul edilen bir Açık Tasarım yapısının temiz bileşenler, stiller, varlıklar ve uygulama notları içeren bir Next.js Uygulama Yönlendiricisi aktarımına dönüştürülmesini istediğinde bu eklentiyi kullanın.',
  },
  'extend-plugin-author': {
    description: 'Kullanıcı, eklenti özelliklerini, örnekleri ve PR iş akışını kullanarak bir Açık Tasarım eklentisi oluşturmak, geliştirmek, doğrulamak, yayınlamak veya göndermek istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, eklenti özelliklerini, örnekleri ve PR iş akışını kullanarak bir Açık Tasarım eklentisi oluşturmak, geliştirmek, doğrulamak, yayınlamak veya göndermek istediğinde bu eklentiyi kullanın.',
  },
  'fal-3d': {
    description: 'fal.ai aracılığıyla metinden veya görsellerden 3D modeller üret. Oyun varlıkları, AR önizlemeleri, ürün maketleri ve konsept heykeltıraşlığı için kullanışlıdır.',
    examplePrompt: 'fal.ai aracılığıyla metinden veya görsellerden 3D modeller üret.',
  },
  'fal-generate': {
    description: 'fal.ai yapay zeka modelleriyle görseller ve videolar oluşturun. Flux, SDXL, ideogram ve diğer toplulukta barındırılan uç noktaları kapsayan üretim düzeyinde katalog.',
    examplePrompt: 'fal.ai yapay zeka modelleriyle görseller ve videolar oluşturun.',
  },
  'fal-image-edit': {
    description: 'fal.ai üzerinde barındırılan modellerle yapay zeka destekli görsel düzenleme: stil aktarımı, arka plan kaldırma, nesne kaldırma ve inpainting.',
    examplePrompt: 'fal.ai üzerinde barındırılan modellerle yapay zeka destekli görsel düzenleme: stil aktarımı, arka plan kaldırma, nesne kaldırma ve inpainting.',
  },
  'fal-kling-o3': {
    description: 'Kling O3 ile, Kling\'in en güçlü model ailesiyle, fal.ai üzerinden görseller ve videolar oluşturun.',
    examplePrompt: 'Kling O3 ile, Kling\'in en güçlü model ailesiyle, fal.ai üzerinden görseller ve videolar oluşturun.',
  },
  'fal-lip-sync': {
    description: 'fal.ai üzerinden konuşan kafa videoları oluşturun ve sesi videoyla dudak senkronizasyonu yapın. Açıklayıcı avatarlar, çok dilli dublaj önizlemeleri ve sosyal medya kesitleri için kullanışlıdır.',
    examplePrompt: 'fal.ai üzerinden konuşan kafa videoları oluşturun ve sesi videoyla dudak senkronizasyonu yapın.',
  },
  'fal-realtime': {
    description: 'fal.ai üzerinden gerçek zamanlı ve akışlı yapay zeka görsel oluşturma. Moodboard keşfi, taslak varyasyonları ve hızlı yaratıcı iterasyon için uygundur.',
    examplePrompt: 'fal.ai üzerinden gerçek zamanlı ve akışlı yapay zeka görsel oluşturma.',
  },
  'fal-restore': {
    description: 'Görsel kalitesini geri yükleyin ve düzeltin — fal.ai\'nin barındırılan restorasyon modelleriyle bulanıklığı giderin, gürültüyü azaltın, yüzleri düzeltin ve eski belgeleri restore edin.',
    examplePrompt: 'Görsel kalitesini geri yükleyin ve düzeltin — fal.ai\'nin barındırılan restorasyon modelleriyle bulanıklığı giderin, gürültüyü azaltın, yüzleri düzeltin ve eski belgeleri restore edin.',
  },
  'fal-train': {
    description: 'Bir markaya, karaktere veya stile özel kişiselleştirilmiş görsel oluşturma için fal.ai üzerinde özel yapay zeka modelleri (LoRA) eğitin.',
    examplePrompt: 'Bir markaya, karaktere veya stile özel kişiselleştirilmiş görsel oluşturma için fal.ai üzerinde özel yapay zeka modelleri (LoRA) eğitin.',
  },
  'fal-tryon': {
    description: 'Sanal deneme — fal.ai\'nin barındırılan deneme modelleriyle kıyafetlerin bir kişinin üzerinde nasıl durduğunu görün. E-ticaret, lookbook\'lar ve stil denemeleri için kullanışlıdır.',
    examplePrompt: 'Sanal deneme — fal.ai\'nin barındırılan deneme modelleriyle kıyafetlerin bir kişinin üzerinde nasıl durduğunu görün.',
  },
  'fal-upscale': {
    description: 'fal.ai üzerinde barındırılan yapay zeka süper çözünürlük modellerini kullanarak görsel ve video çözünürlüğünü büyütün ve iyileştirin.',
    examplePrompt: 'fal.ai üzerinde barındırılan yapay zeka süper çözünürlük modellerini kullanarak görsel ve video çözünürlüğünü büyütün ve iyileştirin.',
  },
  'fal-video-edit': {
    description: 'Yapay zeka kullanarak mevcut videoları düzenleyin — fal.ai\'nin barındırılan video modelleriyle stili yeniden düzenleyin, çözünürlüğü büyütün, arka planı kaldırın ve ses ekleyin.',
    examplePrompt: 'Yapay zeka kullanarak mevcut videoları düzenleyin — fal.ai\'nin barındırılan video modelleriyle stili yeniden düzenleyin, çözünürlüğü büyütün, arka planı kaldırın ve ses ekleyin.',
  },
  'fal-vision': {
    description: 'Görselleri analiz edin — fal.ai görü modelleriyle nesneleri bölütleyin, tespit edin, OCR çalıştırın, betimleyin ve görsel sorulara yanıt verin.',
    examplePrompt: 'Görselleri analiz edin — fal.ai görü modelleriyle nesneleri bölütleyin, tespit edin, OCR çalıştırın, betimleyin ve görsel sorulara yanıt verin.',
  },
  'faq-page': {
    description: 'Katlanabilir akordeon bölümleri, arama işlevi ve kategori filtrelemesi olan bir Sıkça Sorulan Sorular (SSS) sayfası.\nBrief "SSS", "yardım merkezi", "sorular" veya "destek sayfası" istediğinde kullanın.',
    examplePrompt: 'Katlanabilir akordeon bölümleri, arama işlevi ve kategori filtrelemesi olan bir Sıkça Sorulan Sorular (SSS) sayfası.',
  },
  'field-notes-editorial-template': {
    description: 'Yumuşak kağıt arka planı, serif kahraman tipografisi, yuvarlatılmış pastel içgörü kartları ve bir retention grafik paneli olan editöryel "Field Notes" rapor şablonu.\nKullanıcılar premium dergi tarzı bir iş raporu, yönetim kurulu notu tek sayfası veya zarif veri hikaye anlatımı düzeni istediğinde kullanın.',
    examplePrompt: 'Üç içgörü kartı, anahtar metrik blokları ve bir retention çizgi grafiği içeren editöryel Field Notes tarzı bir raporu, cilalı tek dosyalık bir HTML sayfasında oluşturun.',
  },
  'figma-code-connect-components': {
    description: 'Tasarım sistemi güncellemelerinin otomatik olarak kod tabanına akması için Figma tasarım bileşenlerini Code Connect kullanarak kod bileşenlerine bağlayın.',
    examplePrompt: 'Tasarım sistemi güncellemelerinin otomatik olarak kod tabanına akması için Figma tasarım bileşenlerini Code Connect kullanarak kod bileşenlerine bağlayın.',
  },
  'figma-create-design-system-rules': {
    description: 'Figma\'dan koda iş akışları için projeye özel tasarım sistemi kuralları oluşturun. Token\'ları, adlandırmayı ve lint kurallarını tek bir kaynakta toplamak için kullanışlıdır.',
    examplePrompt: 'Figma\'dan koda iş akışları için projeye özel tasarım sistemi kuralları oluşturun.',
  },
  'figma-create-new-file': {
    description: 'Yeni boş bir Figma Design veya FigJam dosyası oluşturun. Betiklenmiş tasarım sistemi veya atölye iş akışlarında ilk adım olarak kullanışlıdır.',
    examplePrompt: 'Yeni boş bir Figma Design veya FigJam dosyası oluşturun.',
  },
  'figma-extract': {
    description: 'Bir Figma dosyasının düğüm ağacını, tasarım belirteçlerini ve gömülü varlıkları yapılandırılmış bir anlık görüntü olarak proje cwd\'sine çekin.',
    examplePrompt: 'Bir Figma dosyasının düğüm ağacını, tasarım belirteçlerini ve gömülü varlıkları yapılandırılmış bir anlık görüntü olarak proje cwd\'sine çekin.',
  },
  'figma-generate-design': {
    description: 'Tasarım sistemi bileşenlerini kullanarak koddan veya açıklamadan Figma\'da ekranlar oluşturun veya güncelleyin. Uygulama sayfalarını tasarım token\'larını kullanarak Figma\'ya çevirin.',
    examplePrompt: 'Tasarım sistemi bileşenlerini kullanarak koddan veya açıklamadan Figma\'da ekranlar oluşturun veya güncelleyin.',
  },
  'figma-generate-library': {
    description: 'Bir kod tabanından Figma\'da profesyonel düzeyde bir tasarım sistemi kütüphanesi oluşturun veya güncelleyin. Figma\'daki referans kaynağını yayınlanmış bileşenlerle senkronize tutmak için kullanışlıdır.',
    examplePrompt: 'Bir kod tabanından Figma\'da profesyonel düzeyde bir tasarım sistemi kütüphanesi oluşturun veya güncelleyin.',
  },
  'figma-implement-design': {
    description: 'Figma tasarımlarını 1:1 görsel doğrulukla üretime hazır koda çevirin. Figma çerçevelerini doğrudan bir frontend ajanına devretmek için kullanışlıdır.',
    examplePrompt: 'Figma tasarımlarını 1:1 görsel doğrulukla üretime hazır koda çevirin.',
  },
  'figma-use': {
    description: 'Canvas yazma işlemleri, incelemeler, değişkenler ve tasarım sistemi çalışmaları için Figma Plugin API betikleri çalıştırın. Bu katalogtaki diğer tüm Figma yetenekleri için ön koşuldur.',
    examplePrompt: 'Canvas yazma işlemleri, incelemeler, değişkenler ve tasarım sistemi çalışmaları için Figma Plugin API betikleri çalıştırın.',
  },
  'finance-report': {
    description: 'Üç aylık/aylık mali rapor — KPI\'ları, geliri ve verileri içeren künye\r\nyazma grafikleri, P&L özet tablosu, öne çıkan önemli noktalar ve bir görünüm\r\nparagraf. Özette "mali rapor", "3. çeyrek raporu" ifadeleri yer aldığında kullanın.\r\n"MRR incelemesi", "P&L" veya "财报".',
    examplePrompt: 'Üç aylık/aylık mali rapor — KPI\'ları, geliri ve verileri içeren künye\r\nyazma grafikleri, P&L özet tablosu, öne çıkan önemli noktalar ve bir görünüm\r\nparagraf. Özette "mali rapor", "3. çeyrek raporu" ifadeleri yer aldığında kullanın.\r\n"MRR incelemesi", "P&L" veya "财报".',
  },
  'flowai-live-dashboard-template': {
    description: 'FlowAI estetiğinde ekip yönetimi kontrol paneli becerisi — üç sekme\r\n(Ekip Üyeleri, Ekip Ayrıntıları, Etkinlik Günlüğü), KPI istatistik satırı, üye tablosu,\r\nrol dağılımı çubuk grafiği, çevrimiçi varlık ve etkinlik özet çizgileri,\r\nve en çok katkıda bulunanlar paneli, tamamı tek bir bağımsız HTML dosyasında\r\naçık/koyu temalı, üzerine gelinebilen grafik araç ipuçları, yakınlaştırmak için tıklatılabilen paneller,\r\nve CSV dışa aktarımı. Özette bir ekip/çalışma alanı yöneticisi istendiğinde kullanın\r\nkontrol paneli, grafikler veya FlowAI adlarıyla etkileşimli bir yönetici kontrol paneli.',
    examplePrompt: 'FlowAI estetiğinde ekip yönetimi kontrol paneli becerisi — üç sekme\r\n(Ekip Üyeleri, Ekip Ayrıntıları, Etkinlik Günlüğü), KPI istatistik satırı, üye tablosu,\r\nrol dağılımı çubuk grafiği, çevrimiçi varlık ve etkinlik özet çizgileri,\r\nve en çok katkıda bulunanlar paneli, tamamı tek bir bağımsız HTML dosyasında\r\naçık/koyu temalı, üzerine gelinebilen grafik araç ipuçları, yakınlaştırmak için tıklatılabilen paneller,\r\nve CSV dışa aktarımı. Özette bir ekip/çalışma alanı yöneticisi istendiğinde kullanın\r\nkontrol paneli, grafikler veya FlowAI adlarıyla etkileşimli bir yönetici kontrol paneli.',
  },
  'flutter-animating-apps': {
    description: 'Flutter uygulamalarında animasyonlu efektler, geçişler ve hareket tasarımı uygulayın. Yerel iOS/Android hareket tasarımı için kullanışlıdır.',
    examplePrompt: 'Flutter uygulamalarında animasyonlu efektler, geçişler ve hareket tasarımı uygulayın.',
  },
  'frame-data-chart-nyt': {
    description: 'NYT haber odası tipografisi, kademeli ortaya çıkma animasyonu ve editöryel düzeyde grafikler (çizgi, çubuk veya aralık bandı).',
    examplePrompt: 'NYT-Style Data Chart Frame şablonunu kullanarak içeriğimi NYT haber odası tipografisi, kademeli ortaya çıkma animasyonu ve editöryel düzeyde grafiklere sahip bir çerçeveye dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-flowchart-sticky': {
    description: 'SVG eğri bağlayıcıları, yapışkan not düğümleri ve beyaz tahta beyin fırtınası havasında imleç etkileşimi.',
    examplePrompt: 'Sticky Flowchart Frame şablonunu kullanarak içeriğimi SVG eğri bağlayıcıları, yapışkan not düğümleri ve imleç etkileşimine sahip bir beyaz tahta beyin fırtınası çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-glitch-title': {
    description: 'Video geçişleri veya cyberpunk hero görselleri için dijital glitch, kromatik kayma ve veri bozulması başlık çerçevesi.',
    examplePrompt: 'Glitch Title Frame şablonunu kullanarak içeriğimi bir video geçişi veya cyberpunk hero için dijital glitch, kromatik kayma ve veri bozulması başlık çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-light-leak-cinema': {
    description: 'Sinematik açılışlar veya bölüm kartları için film ışık sızıntıları, grain, 16:9 letterbox ve büyük serif yazı tipi.',
    examplePrompt: 'Light-Leak Cinematic Frame şablonunu kullanarak içeriğimi film ışık sızıntıları, grain, letterbox çerçeveleme ve büyük serif yazı tipine sahip sinematik bir açılış veya bölüm kartına dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-liquid-bg-hero': {
    description: 'Video girişleri, açılış sayfası hero görselleri veya posterler için uygun, alıntı bindirmeli WebGL tarzı akışkan yer değiştirme arka planı.',
    examplePrompt: 'Liquid Background Hero şablonunu kullanarak içeriğimi bir video girişi, açılış sayfası hero görseli veya poster için alıntı bindirmeli WebGL tarzı akışkan yer değiştirme arka planına dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-logo-outro': {
    description: 'Video çıkışları veya marka kapanış çerçeveleri için bölümlü logo birleşimi, parlama bloom efekti ve slogan ortaya çıkışı.',
    examplePrompt: 'Logo Outro Frame şablonunu kullanarak içeriğimi bölümlü logo birleşimi, parlama bloom efekti ve slogan ortaya çıkışına sahip bir video çıkışı veya marka kapanış çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-macos-notification': {
    description: 'Video bindirmeleri veya ürün tanıtımları için uygun, uygulama simgesi, başlık ve gövdeye sahip gerçekçi macOS bildirim afişi.',
    examplePrompt: 'macOS Notification Banner şablonunu kullanarak içeriğimi bir video bindirmesi veya ürün tanıtımı için gerçekçi bir macOS bildirim afişine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frontend-design': {
    description: 'Güçlü görsel yönelim, cilalı tipografi, özenli düzen ve çalışan HTML/CSS/JS veya framework koduyla özgün, üretim düzeyinde frontend arayüzleri oluşturun. Web siteleri, açılış sayfaları, dashboard\'lar, React bileşenleri, uygulama ekranları ve UI güzelleştirme için kullanın.',
    examplePrompt: 'Bir finans ekibi için gerçek etkileşim durumları, rafine tipografi ve özgün bir görsel yönelime sahip, üretim kalitesinde bir SaaS analiz dashboard\'u tasarla ve geliştir.',
  },
  'frontend-dev': {
    description: 'Sinematik animasyonlar, MiniMax API üzerinden yapay zeka tarafından üretilen medya ve üretken sanat içeren tam yığın frontend. Hero sayfaları ve vitrin siteleri için kullanışlıdır.',
    examplePrompt: 'Sinematik animasyonlar, MiniMax API üzerinden yapay zeka tarafından üretilen medya ve üretken sanat içeren tam yığın frontend.',
  },
  'frontend-skill': {
    description: 'Ölçülü kompozisyonla görsel olarak güçlü açılış sayfaları, web siteleri ve uygulama UI\'ları oluşturun. OpenAI\'nin üretim frontend kılavuzu.',
    examplePrompt: 'Ölçülü kompozisyonla görsel olarak güçlü açılış sayfaları, web siteleri ve uygulama UI\'ları oluşturun.',
  },
  'frontend-slides': {
    description: 'Görsel stil önizlemeleri içeren animasyon açısından zengin HTML sunumları oluşturun. Çevrimiçi sunumlar, gömülü konuşmalar ve interaktif brifingler için kullanışlıdır.',
    examplePrompt: 'Görsel stil önizlemeleri içeren animasyon açısından zengin HTML sunumları oluşturun.',
  },
  'fs-creative-voltage': {
    description: 'Yaratıcı Gerilim desteleri: Retro-modern elektrik mavisi × koyu lacivert bölmeli paneller, neon sarı rozetler, yarı tonlu nokta dokuları ve herhangi bir görüntü alanına ölçeklenebilen sabit 1920×1080 sahne üzerinde güzelleşen yazılar. Syne + Space Mono + Sarıkuyruk. Tek dosyalı, sıfır bağımlılıklı HTML.',
    examplePrompt: 'Yaratıcı Gerilim desteleri: Retro-modern elektrik mavisi × koyu lacivert bölmeli paneller, neon sarı rozetler, yarı tonlu nokta dokuları ve herhangi bir görüntü alanına ölçeklenebilen sabit 1920×1080 sahne üzerinde güzelleşen yazılar. Syne + Space Mono + Sarıkuyruk. Tek dosyalı, sıfır bağımlılıklı HTML.',
  },
  'fs-editorial-forest': {
    description: 'Editoryal Orman — sessiz, edebi bir HTML destesi teması: derin orman yeşili #2e4a2a, tozlu pembe #e89cb1 ve JetBrains Mono vuruşlarıyla Source Serif 4\'te sıcak krem ​​#efe7d4 kağıt seti. Karışık açık/koyu düzeni, 8 slaytlı üç aylık inceleme ritmi, herhangi bir görüntü alanına ölçeklendirilmiş sabit 1920×1080 sahne.',
    examplePrompt: 'Editoryal Orman — sessiz, edebi bir HTML destesi teması: derin orman yeşili #2e4a2a, tozlu pembe #e89cb1 ve JetBrains Mono vuruşlarıyla Source Serif 4\'te sıcak krem ​​#efe7d4 kağıt seti. Karışık açık/koyu düzeni, 8 slaytlı üç aylık inceleme ritmi, herhangi bir görüntü alanına ölçeklendirilmiş sabit 1920×1080 sahne.',
  },
  'fs-electric-studio': {
    description: 'Electric Studio (钴蓝工作室) HTML desteleri: cesur, temiz dikey bölünmüş paneller - kobalt #4361ee üzerine beyaz - köşe marka işaretleri, panel dikişinde koyu vurgu çubuğu, ana öğe olarak alıntı tipografisi, tamamı Manrope 800/400 ve kendine güvenen kısıtlı aralıklar. Herhangi bir görüntü alanına ölçeklendirilmiş sabit 1920×1080 sahne alanı, sıfır bağımlılık.',
    examplePrompt: 'Electric Studio (钴蓝工作室) HTML desteleri: cesur, temiz dikey bölünmüş paneller - kobalt #4361ee üzerine beyaz - köşe marka işaretleri, panel dikişinde koyu vurgu çubuğu, ana öğe olarak alıntı tipografisi, tamamı Manrope 800/400 ve kendine güvenen kısıtlı aralıklar. Herhangi bir görüntü alanına ölçeklendirilmiş sabit 1920×1080 sahne alanı, sıfır bağımlılık.',
  },
  'fs-emerald-editorial': {
    description: 'Emerald Editoryal - dergi kapağı iş desteleri: doymuş zümrüt #3CD896 tuval, koyu lacivert #0F1A5C mürekkep, sıcak kağıt #F1E9D6 döşemeler, çift kurallı masthead süsleri, Bodoni Moda 900 ekran serif, tek tip görüntü alanı ölçeklendirmesine sahip sabit 1920x1080 sahne. Karışık şema, 8 ana slayt.',
    examplePrompt: 'Emerald Editoryal - dergi kapağı iş desteleri: doymuş zümrüt #3CD896 tuval, koyu lacivert #0F1A5C mürekkep, sıcak kağıt #F1E9D6 döşemeler, çift kurallı masthead süsleri, Bodoni Moda 900 ekran serif, tek tip görüntü alanı ölçeklendirmesine sahip sabit 1920x1080 sahne. Karışık şema, 8 ana slayt.',
  },
  'fs-notebook-tabs': {
    description: 'Editoryal \'fiziksel not defteri\' HTML desteleri oluşturun: karanlık bir zemin üzerinde yüzen krem ​​kağıttan bir kart, sağ kenarda nane/lavanta/pembe/gökyüzü indeks sekmeleri, solda dosya delikleri, Bodoni Moda ekranı + DM Sans gövdesi. Herhangi bir görüntü alanına ölçeklendirilen sabit 1920×1080 sahne. Kilitli tema — yalnızca içerik değişir.',
    examplePrompt: 'Editoryal \'fiziksel not defteri\' HTML desteleri oluşturun: karanlık bir zemin üzerinde yüzen krem ​​kağıttan bir kart, sağ kenarda nane/lavanta/pembe/gökyüzü indeks sekmeleri, solda dosya delikleri, Bodoni Moda ekranı + DM Sans gövdesi. Herhangi bir görüntü alanına ölçeklendirilen sabit 1920×1080 sahne. Kilitli tema — yalnızca içerik değişir.',
  },
  'full-output-enforcement': {
    description: 'Varsayılan LLM kısaltma davranışını geçersiz kılar. Eksiksiz kod üretimini zorunlu kılar, yer tutucu kalıpları yasaklar ve token sınırı bölünmelerini temiz bir şekilde ele alır. Kapsamlı, kısaltılmamış çıktı gerektiren her göreve uygulayın.',
    examplePrompt: 'İstenen yapı için yer tutucu yorumlar olmadan, atlanmış bölümler olmadan ve yalnızca çıktı uzunluğu gerektiriyorsa temiz bölme talimatlarıyla eksiksiz uygulamayı üretin.',
  },
  'full-page-screenshot': {
    description: 'Chrome DevTools Protocol aracılığıyla sıfır bağımlılıkla web sayfalarının tam sayfa ekran görüntülerini yakalayın. Portföyler, vaka çalışmaları ve denetim raporları için kullanışlıdır.',
    examplePrompt: 'Chrome DevTools Protocol aracılığıyla sıfır bağımlılıkla web sayfalarının tam sayfa ekran görüntülerini yakalayın.',
  },
  'gamified-app': {
    description: 'Çok çerçeveli, oyunlaştırılmış bir mobil uygulama prototipi - karanlık bir zemin üzerinde üç telefon çerçevesi\r\nvitrin sahnesi. Çerçeve 1: kapak / poster, Çerçeve 2: XP ile günümüzün görevleri\r\nşeritler ve seviye çubuğu, Çerçeve 3: görev detayı. Canlı görev kareleri, seviye\r\nşerit, alt sekme çubuğu. Özette "oyunlaştırılmış bir uygulama" istendiğinde kullanın,\r\n"alışkanlık izleyici", "RPG tarzı yaşam uygulaması", "seviye atlama uygulaması", "günlük görevler",\r\n"XP/stripe uygulaması" veya "ELI5 tarzı açıklayıcı uygulama".',
    examplePrompt: 'Çok çerçeveli, oyunlaştırılmış bir mobil uygulama prototipi - karanlık bir zemin üzerinde üç telefon çerçevesi\r\nvitrin sahnesi. Çerçeve 1: kapak / poster, Çerçeve 2: XP ile günümüzün görevleri\r\nşeritler ve seviye çubuğu, Çerçeve 3: görev detayı. Canlı görev kareleri, seviye\r\nşerit, alt sekme çubuğu. Özette "oyunlaştırılmış bir uygulama" istendiğinde kullanın,\r\n"alışkanlık izleyici", "RPG tarzı yaşam uygulaması", "seviye atlama uygulaması", "günlük görevler",\r\n"XP/stripe uygulaması" veya "ELI5 tarzı açıklayıcı uygulama".',
  },
  'gif-sticker-maker': {
    description: 'MiniMax API aracılığıyla fotoğrafları Funko Pop / Pop Mart tarzında animasyonlu GIF çıkartmalarına dönüştürün. Kişiselleştirilmiş sohbet çıkartmaları ve avatar paketleri için kullanışlıdır.',
    examplePrompt: 'MiniMax API aracılığıyla fotoğrafları Funko Pop / Pop Mart tarzında animasyonlu GIF çıkartmalarına dönüştürün.',
  },
  'github-dashboard': {
    description: 'GitHub veri havuzu analiz panosu — yıldızlar, çatallar, katkıda bulunanlar,\r\nsorunlar, çekme istekleri, son etkinlikler ve en çok katkıda bulunanlar. Ne zaman kullan\r\nözette GitHub repo kontrol paneli ve açık kaynak büyüme raporu isteniyor,\r\nveri havuzu sağlık sayfası veya GitHub analiz görünümü.',
    examplePrompt: 'GitHub veri havuzu analiz panosu — yıldızlar, çatallar, katkıda bulunanlar,\r\nsorunlar, çekme istekleri, son etkinlikler ve en çok katkıda bulunanlar. Ne zaman kullan\r\nözette GitHub repo kontrol paneli ve açık kaynak büyüme raporu isteniyor,\r\nveri havuzu sağlık sayfası veya GitHub analiz görünümü.',
  },
  'gpt-taste': {
    description: 'Elit UX/UI ve İleri Düzey GSAP Hareket Mühendisi. Düzen çeşitliliği için Python destekli gerçek rastgeleleştirme, katı AIDA sayfa yapısı, geniş editöryel tipografi (6 satırlık kaydırmaları yasaklar), boşluksuz bento ızgaraları, katı GSAP ScrollTrigger\'lar (sabitleme, yığma, scrubbing), satır içi mikro görseller ve geniş bölüm aralıklarını zorunlu kılar.',
    examplePrompt: 'gpt-taste ile yüksek çeşitlilikli bir açılış sayfası oluştur: editöryel tipografi, jenerik olmayan düzen, kalibre edilmiş renk ve yığının desteklediği yerlerde zarif GSAP tarzı hareket.',
  },
  'gsap-core': {
    description: 'Çekirdek API için resmi GSAP becerisi — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (duyarlı, prefers-reduced-motion). Kullanıcı bir JavaScript animasyon kütüphanesi, React/Vue/vanilla\'da animasyon, GSAP tween\'leri, easing, temel animasyon, duyarlı veya azaltılmış hareket animasyonu istediğinde ya da GSAP ile DOM/SVG animasyonu yaparken kullanın. Kullanıcının zaman çizelgelerine, kaydırma tabanlı animasyona veya framework\'ten bağımsız bir kütüphaneye ihtiyacı olduğunda GSAP\'i önerin. GSAP herhangi bir framework\'te veya vanilla JS\'te çalışır; Webflow Interactions\'ı güçlendirir.',
    examplePrompt: 'Çekirdek API için resmi GSAP becerisi — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (duyarlı, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description: 'Vue, Svelte ve diğer React dışı framework\'ler için resmi GSAP becerisi — yaşam döngüsü, kapsam belirleyici seçiciler, unmount\'ta temizleme. Kullanıcı Vue, Nuxt, Svelte, SvelteKit\'te animasyon istediğinde ya da Vue/Svelte ile GSAP, onMounted, onMount, onDestroy hakkında soru sorduğunda kullanın. Başka bir kütüphane belirtilmediği sürece framework animasyonu için GSAP\'i önerin. React için gsap-react kullanın.',
    examplePrompt: 'Vue, Svelte ve diğer React dışı framework\'ler için resmi GSAP becerisi — yaşam döngüsü, kapsam belirleyici seçiciler, unmount\'ta temizleme.',
  },
  'gsap-performance': {
    description: 'Performans için resmi GSAP becerisi — transform\'ları tercih edin, layout thrashing\'den kaçının, will-change, batching. GSAP animasyonlarını optimize ederken, jank\'i azaltırken veya kullanıcı animasyon performansı, FPS ya da akıcı 60fps hakkında soru sorduğunda kullanın.',
    examplePrompt: 'Performans için resmi GSAP becerisi — transform\'ları tercih edin, layout thrashing\'den kaçının, will-change, batching.',
  },
  'gsap-plugins': {
    description: 'GSAP eklentileri için resmi GSAP becerisi — kayıt, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG ve fizik eklentileri, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Kullanıcı bir GSAP eklentisi, scroll-to, flip animasyonları, draggable, SVG çizimi veya eklenti kaydı hakkında soru sorduğunda kullanın.',
    examplePrompt: 'GSAP eklentileri için resmi GSAP becerisi — kayıt, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG ve fizik eklentileri, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description: 'React için resmi GSAP becerisi — useGSAP hook\'u, refs, gsap.context(), temizleme. Kullanıcı React veya Next.js\'te animasyon istediğinde ya da React ile GSAP, useGSAP veya unmount\'ta temizleme hakkında soru sorduğunda kullanın. Kullanıcı başka bir kütüphane seçmediği sürece React animasyonu için GSAP\'i önerin.',
    examplePrompt: 'React için resmi GSAP becerisi — useGSAP hook\'u, refs, gsap.context(), temizleme.',
  },
  'gsap-scrolltrigger': {
    description: 'ScrollTrigger için resmi GSAP becerisi — kaydırmaya bağlı animasyonlar, sabitleme (pinning), scrub, tetikleyiciler. Kaydırma tabanlı animasyon, paralaks, sabitlenmiş bölümler oluştururken veya önerirken ya da kullanıcı ScrollTrigger, kaydırma animasyonları veya sabitleme hakkında soru sorduğunda kullanın. Bir kütüphane belirtilmediğinde kaydırmaya dayalı animasyon için GSAP önerin.',
    examplePrompt: 'ScrollTrigger için resmi GSAP becerisi — kaydırmaya bağlı animasyonlar, sabitleme (pinning), scrub, tetikleyiciler.',
  },
  'gsap-timeline': {
    description: 'Zaman çizelgeleri için resmi GSAP becerisi — gsap.timeline(), konum parametresi, iç içe yerleştirme, oynatma. Animasyonları sıralarken, kare dizilerini koreografiye dökerken veya kullanıcı animasyon sıralaması, zaman çizelgeleri ya da animasyon düzeni hakkında soru sorduğunda kullanın (GSAP\'te veya zaman çizelgelerini destekleyen bir kütüphane önerirken).',
    examplePrompt: 'Zaman çizelgeleri için resmi GSAP becerisi — gsap.timeline(), konum parametresi, iç içe yerleştirme, oynatma.',
  },
  'gsap-utils': {
    description: 'gsap.utils için resmi GSAP becerisi — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Kullanıcı gsap.utils, clamp, mapRange, random, snap, toArray, wrap veya GSAP\'teki yardımcı araçlar hakkında soru sorduğunda kullanın.',
    examplePrompt: 'gsap.utils için resmi GSAP becerisi — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hallmark': {
    description: 'Sıfırdan sayfalar, denetimler, yeniden tasarımlar ve URL\'lerden veya ekran görüntülerinden tasarım çıkarma için AI-slop tasarım becerisi. Kullanıcı yeni bir uygulama veya açılış sayfası oluşturmak istediğinde, bir şeyi yeniden tasarlamak istediğinde, Hallmark\'ı adıyla çağırdığında veya denetim/yeniden tasarım/çalışma kullandığında kullanın.',
    examplePrompt: 'Sıfırdan sayfalar, denetimler, yeniden tasarımlar ve URL\'lerden veya ekran görüntülerinden tasarım çıkarma için AI-slop tasarım becerisi. Kullanıcı yeni bir uygulama veya açılış sayfası oluşturmak istediğinde, bir şeyi yeniden tasarlamak istediğinde, Hallmark\'ı adıyla çağırdığında veya denetim/yeniden tasarım/çalışma kullandığında kullanın.',
  },
  'hand-drawn-diagrams': {
    description: 'Bir komuttan el çizimi Excalidraw diyagramları oluşturun — animasyonlu SVG, barındırılan düzenleme bağlantısı ve PNG dışa aktarımı. Claude Code, Codex, Gemini CLI ve standart beceri yollarını destekleyen her ajanla çalışır.',
    examplePrompt: 'Bir komuttan el çizimi Excalidraw diyagramları oluşturun — animasyonlu SVG, barındırılan düzenleme bağlantısı ve PNG dışa aktarımı.',
  },
  'handoff': {
    description: 'Çalıştırmanın kabul edilen yapıtını aşağı akışlı bir işbirliği yüzeyine (cli, diğer kod aracıları, bulut, masaüstü) itin ve yapı bildirimini dışarı aktarma hedefiyle damgalayın.',
    examplePrompt: 'Çalıştırmanın kabul edilen yapıtını aşağı akışlı bir işbirliği yüzeyine (cli, diğer kod aracıları, bulut, masaüstü) itin ve yapı bildirimini dışarı aktarma hedefiyle damgalayın.',
  },
  'hatch-pet': {
    description: 'Karakter çiziminden, ekran görüntülerinden, üretilen görsellerden veya görsel referanslardan Codex uyumlu animasyonlu evcil hayvan sprite sayfaları oluşturun, onarın, doğrulayın, önizleyin ve paketleyin. Kullanıcı bir Codex evcil hayvanı çıkarmak, özel bir animasyonlu evcil hayvan oluşturmak ya da 8x9 atlas, şeffaf kullanılmayan hücreler, satır satır animasyon komutları, QA iletişim sayfaları, önizleme videoları ve pet.json paketlemesiyle yerleşik bir evcil hayvan varlığı oluşturmak istediğinde kullanın. Bu beceri, görsel üretim için kurulu $imagegen sistem becerisini bir araya getirir ve belirleyici sprite sayfası birleştirme için paketlenmiş betikleri kullanır.',
    examplePrompt: 'Bana minik bir piksel sanatı shiba evcil hayvanı çıkar — dostça, dik oturan, küçük bir nar aksesuarlı. hatch-pet becerisini baştan sona kullan.',
  },
  'high-end-visual-design': {
    description: 'Yapay zekâya üst düzey bir ajans gibi tasarım yapmayı öğretir. Bir web sitesini pahalı hissettiren tam fontları, boşlukları, gölgeleri, kart yapılarını ve animasyonları tanımlar. Yapay zekâ tasarımlarını ucuz veya sıradan gösteren tüm yaygın varsayılanları engeller.',
    examplePrompt: 'İncelikli tipografi, yumuşak kontrast, premium boşluk düzeni, ince derinlik ve ölçülü hareket içeren sakin, üst düzey bir açılış sayfası oluşturun.',
  },
  'hps-academic-paper': {
    description: 'Akademik Makale destesi teması: Beyaz kağıt üzerinde LaTeX kağıt hissi #fdfcf8 — tamamı serif türü (Latin Modern Roman → Playfair Display geri dönüşü), mürekkep siyahı gövde, bağlantı mavisi #1a3a7a altı çizili bağlantı noktaları, italik işaretler, sıfır yarıçap, sıfıra yakın gölge, ince çizgi kitap sekmesi kuralları. Konferans konuşmaları, tez savunmaları, araştırma incelemeleri ve dergi kulübü sunumları için tek dosyalı HTML desteği.',
    examplePrompt: 'Akademik Makale destesi teması: Beyaz kağıt üzerinde LaTeX kağıt hissi #fdfcf8 — tamamı serif türü (Latin Modern Roman → Playfair Display geri dönüşü), mürekkep siyahı gövde, bağlantı mavisi #1a3a7a altı çizili bağlantı noktaları, italik işaretler, sıfır yarıçap, sıfıra yakın gölge, ince çizgi kitap sekmesi kuralları. Konferans konuşmaları, tez savunmaları, araştırma incelemeleri ve dergi kulübü sunumları için tek dosyalı HTML desteği.',
  },
  'hps-bauhaus': {
    description: 'Bauhaus Birincil - lewislulu/html-ppt-skill bauhaus temasından tasarım geçmişi geometrik güverte stili. Eskitilmiş tuval #f4efe3, kırmızı/sarı/mavi ana renkler, sert üç bantlı degrade, sıfır yarıçap, 2 piksel mürekkep vuruşları, sert ofset gölgeler, Archivo Black + Space Grotesk. Kullanıcı Bauhaus, geometrik-modernist, ana renk veya tasarım tarihi posteri görünümünde bir sunum istediğinde kullanın.',
    examplePrompt: 'Bauhaus Birincil - lewislulu/html-ppt-skill bauhaus temasından tasarım geçmişi geometrik güverte stili. Eskitilmiş tuval #f4efe3, kırmızı/sarı/mavi ana renkler, sert üç bantlı degrade, sıfır yarıçap, 2 piksel mürekkep vuruşları, sert ofset gölgeler, Archivo Black + Space Grotesk. Kullanıcı Bauhaus, geometrik-modernist, ana renk veya tasarım tarihi posteri görünümünde bir sunum istediğinde kullanın.',
  },
  'hps-memphis-pop': {
    description: 'Memphis Pop destesi — Kilitli tek temalı HTML destesi olarak 80\'lerin Memphis tasarımı. Pembe/turuncu/sarı konfeti nokta desenli uçtan uca döşenmiş sıcak krem ​​rengi kanvas, sert gölgeli 2,5 piksel siyah çerçeveli kartlar, sıcak pembe #ff3d8b kurşun vurgusu, Archivo Siyah ekran tipi. Lewislulu/html-ppt-skill\'deki memphis-pop temasına dayanmaktadır. Kullanıcı eğlenceli, gürültülü, retro 80\'lerden kalma bir sunum, ürün lansmanı, yaratıcı sunum veya topluluk konuşması istediğinde kullanın.',
    examplePrompt: 'Memphis Pop destesi — Kilitli tek temalı HTML destesi olarak 80\'lerin Memphis tasarımı. Pembe/turuncu/sarı konfeti nokta desenli uçtan uca döşenmiş sıcak krem ​​rengi kanvas, sert gölgeli 2,5 piksel siyah çerçeveli kartlar, sıcak pembe #ff3d8b kurşun vurgusu, Archivo Siyah ekran tipi. Lewislulu/html-ppt-skill\'deki memphis-pop temasına dayanmaktadır. Kullanıcı eğlenceli, gürültülü, retro 80\'lerden kalma bir sunum, ürün lansmanı, yaratıcı sunum veya topluluk konuşması istediğinde kullanın.',
  },
  'hps-retro-tv': {
    description: 'Retro TV destesi — Kilitli tek temalı HTML destesi olarak 80\'ler/90\'ların resim tüpü nostaljisi. Her slaytta CRT tarama çizgileri bulunan sıcak krem ​​rengi kanvas, kavisli cam tüp skeç, kehribar #e67e14 / tuğla kırmızısı #c73a1f vurgular, yoğun gölgeli Playfair Display başlıkları, test kartı renk çubukları ve anten/kadran SVG dekoru. Lewislulu/html-ppt-skill\'in retro-tv temasına dayanmaktadır. Kullanıcı sıcak, nostaljik, yayın dönemi sunumu, medya sunumu, retro ürün lansmanı veya yıllık inceleme sunumu istediğinde kullanın.',
    examplePrompt: 'Retro TV destesi — Kilitli tek temalı HTML destesi olarak 80\'ler/90\'ların resim tüpü nostaljisi. Her slaytta CRT tarama çizgileri bulunan sıcak krem ​​rengi kanvas, kavisli cam tüp skeç, kehribar #e67e14 / tuğla kırmızısı #c73a1f vurgular, yoğun gölgeli Playfair Display başlıkları, test kartı renk çubukları ve anten/kadran SVG dekoru. Lewislulu/html-ppt-skill\'in retro-tv temasına dayanmaktadır. Kullanıcı sıcak, nostaljik, yayın dönemi sunumu, medya sunumu, retro ürün lansmanı veya yıllık inceleme sunumu istediğinde kullanın.',
  },
  'hps-true-blueprint': {
    description: 'Gerçek Blueprint destesi teması — 40 piksellik beyaz çizim ızgarasının altında plan mavisi #0b3a6f alanı, kesikli kenarlı yarı saydam kartlar, amber açıklamalı beyaz/buz mavisi mürekkep, tamamı JetBrains Mono, 2 piksel köşeler, sıfır gölge. Çizim sayfası kromu (başlık bloğu, sayfa dizini, inşaat çizgisi numaraları, taranmış çubuklar, SVG şemaları). Sistem mimarisi desteleri, altyapı geçiş incelemeleri, mühendislik tasarım belgeleri veya çalışma çizimi gibi okunması gereken herhangi bir sunum için kullanın. Lewislulu/html-ppt-skill\'deki plan temasına dayanmaktadır.',
    examplePrompt: 'Gerçek Blueprint destesi teması — 40 piksellik beyaz çizim ızgarasının altında plan mavisi #0b3a6f alanı, kesikli kenarlı yarı saydam kartlar, amber açıklamalı beyaz/buz mavisi mürekkep, tamamı JetBrains Mono, 2 piksel köşeler, sıfır gölge. Çizim sayfası kromu (başlık bloğu, sayfa dizini, inşaat çizgisi numaraları, taranmış çubuklar, SVG şemaları). Sistem mimarisi desteleri, altyapı geçiş incelemeleri, mühendislik tasarım belgeleri veya çalışma çizimi gibi okunması gereken herhangi bir sunum için kullanın. Lewislulu/html-ppt-skill\'deki plan temasına dayanmaktadır.',
  },
  'hps-y2k-chrome': {
    description: 'Y2K Krom deste teması — lewislulu/html-ppt-skill y2k-chrome\'dan kilitlenmiş Space Grotesk\'te tam ekran 5 kademeli gümüş metal degrade kanvas, krom kaplı başlıklar, ek üst vurgulara sahip %72 beyaz buzlu cam kartlar, mega yarıçaplı köşeler ve şeker moru/deniz mavisi/pembe vurgular. Kullanıcı, milenyum dönemi metalik krom parlaklığına sahip bir sunum, PPT, slayt veya deste istediğinde kullanın.',
    examplePrompt: 'Y2K Krom deste teması — lewislulu/html-ppt-skill y2k-chrome\'dan kilitlenmiş Space Grotesk\'te tam ekran 5 kademeli gümüş metal degrade kanvas, krom kaplı başlıklar, ek üst vurgulara sahip %72 beyaz buzlu cam kartlar, mega yarıçaplı köşeler ve şeker moru/deniz mavisi/pembe vurgular. Kullanıcı, milenyum dönemi metalik krom parlaklığına sahip bir sunum, PPT, slayt veya deste istediğinde kullanın.',
  },
  'hr-onboarding': {
    description: 'Tek sayfa halinde yeni işe alınan işe alım planı - ilk hafta programı,\r\narkadaş + yönetici tanıtımı, öğrenme yolu, ekipman kontrol listesi ve "sen\r\nne zaman ayarla...” sonuçları. Özette "ilk katılım"dan bahsedildiğinde kullanın,\r\n"yeni işe alım", "ilk hafta planı" veya "işe alım".',
    examplePrompt: 'Tek sayfa halinde yeni işe alınan işe alım planı - ilk hafta programı,\r\narkadaş + yönetici tanıtımı, öğrenme yolu, ekipman kontrol listesi ve "sen\r\nne zaman ayarla...” sonuçları. Özette "ilk katılım"dan bahsedildiğinde kullanın,\r\n"yeni işe alım", "ilk hafta planı" veya "işe alım".',
  },
  'html-ppt': {
    description: 'HTML PPT Studio — tümü şablonlarla desteklenen birçok stilde, düzende ve animasyonda profesyonel statik HTML sunumları yazın. Kullanıcı bir sunum, PPT, slaytlar, açılış konuşması, deste, slayt gösterisi, "幻灯片", "演讲稿", "做一份 PPT", "做一份 slaytlar", açıklama tarzı bir HTML destesi, bir sunum veya herhangi bir tür çok slaytlı sunum/rapor/paylaşım istediğinde kullanın Zevkli görünmesi ve klavyeyle gezinmeyle kullanılması gereken belge. Tetikleyiciler arasında "sunum", "ppt", "slaytlar", "sunum", "açılış konuşması", "açıklama", "slayt gösterisi", "görüntüleme", "görüntü", "görüntüleme", "görüşme slaytları", "sunum sunumu", "teknoloji" gibi anahtar kelimeler bulunur paylaşım", "teknik sunum".',
    examplePrompt: 'HTML PPT Studio — tümü şablonlarla desteklenen birçok stilde, düzende ve animasyonda profesyonel statik HTML sunumları yazın. Kullanıcı bir sunum, PPT, slaytlar, açılış konuşması, deste, slayt gösterisi, "幻灯片", "演讲稿", "做一份 PPT", "做一份 slaytlar", açıklama tarzı bir HTML destesi, bir sunum veya herhangi bir tür çok slaytlı sunum/rapor/paylaşım istediğinde kullanın Zevkli görünmesi ve klavyeyle gezinmeyle kullanılması gereken belge. Tetikleyiciler arasında "sunum", "ppt", "slaytlar", "sunum", "açılış konuşması", "açıklama", "slayt gösterisi", "görüntüleme", "görüntü", "görüntüleme", "görüşme slaytları", "sunum sunumu", "teknoloji" gibi anahtar kelimeler bulunur paylaşım", "teknik sunum".',
  },
  'html-ppt-course-module': {
    description: 'Çevrimiçi kurs / atölye modülü destesi — sıcak kağıt arka planı + Playfair serif, öğrenim hedeflerinin kalıcı sol kenar çubuğu, MCQ kendi kendini kontrol sayfası. Öğretim modülleri, eğitim materyalleri, atölye slaytları için kullanın.',
    examplePrompt: 'Çevrimiçi kurs / atölye modülü destesi — sıcak kağıt arka planı + Playfair serif, öğrenim hedeflerinin kalıcı sol kenar çubuğu, MCQ kendi kendini kontrol sayfası. Öğretim modülleri, eğitim materyalleri, atölye slaytları için kullanın.',
  },
  'html-ppt-graphify-dark-graph': {
    description: '暗底知识图谱 deck — #06060c→#0e1020 深夜渐变 + 漂浮 küreleri bulanıklaştırma, SVG JetBrains Mono\'nun kullanımı, cam-morfizmi, dev-tool / CLI / CLI /数据可视化的发布会，"yerel yapay zeka + 科幻 + 暖色" 调子。',
    examplePrompt: '暗底知识图谱 deck — #06060c→#0e1020 深夜渐变 + 漂浮 küreleri bulanıklaştırma, SVG JetBrains Mono\'nun kullanımı, cam-morfizmi, dev-tool / CLI / CLI /数据可视化的发布会，"yerel yapay zeka + 科幻 + 暖色" 调子。',
  },
  'html-ppt-hermes-cyber-terminal': {
    description: '暗终端 dürüst inceleme destesi — #0a0c10 黑底 + 56px 赛博网格 + CRT 暗角 + 扫描线、窗口红绿灯 chrome,\'$ istemi\' #7ed3a4, JetBrains Mono, yalnızca vuruş için, yanıp sönüyor etiketi, CLI / aracı / geliştirme aracının izlenmesi, fark, kıyaslama) etiketidir.',
    examplePrompt: '暗终端 dürüst inceleme destesi — #0a0c10 黑底 + 56px 赛博网格 + CRT 暗角 + 扫描线、窗口红绿灯 chrome,\'$ istemi\' #7ed3a4, JetBrains Mono, yalnızca vuruş için, yanıp sönüyor etiketi, CLI / aracı / geliştirme aracının izlenmesi, fark, kıyaslama) etiketidir.',
  },
  'html-ppt-knowledge-arch-blueprint': {
    description: '奶油蓝图架构 güverte — 奶油纸 #F0EAE0 底色 + 单一锈红 #B5392A 高亮、48px 蓝图网格 maskesi,2px黑边硬卡片、pipeline 步骤盒（其中一个抬高）、右侧锈红 içgörü açıklamaları, Playfair 衬线大字,SVG虚线反馈环。零渐变零软阴影,认真且印刷友好。',
    examplePrompt: '奶油蓝图架构 güverte — 奶油纸 #F0EAE0 底色 + 单一锈红 #B5392A 高亮、48px 蓝图网格 maskesi,2px黑边硬卡片、pipeline 步骤盒（其中一个抬高）、右侧锈红 içgörü açıklamaları, Playfair 衬线大字,SVG虚线反馈环。零渐变零软阴影,认真且印刷友好。',
  },
  'html-ppt-obsidian-claude-gradient': {
    description: 'GitHub 暗紫渐变 destesi — GitHub-dark #0d1117 + 紫蓝 radyal 环境光 + 60px 网格 maskesi、居中布局、紫色 hap GitHub\'a bakın(#a855f7→#60a5fa→#34d399) palet、紫色左边框高亮块。适合开发者工作流 / MCP / Agent / dev tool 教程，类似 GitHub Blog / Doğrusal Değişiklik Günlüğü。',
    examplePrompt: 'GitHub 暗紫渐变 destesi — GitHub-dark #0d1117 + 紫蓝 radyal 环境光 + 60px 网格 maskesi、居中布局、紫色 hap GitHub\'a bakın(#a855f7→#60a5fa→#34d399) palet、紫色左边框高亮块。适合开发者工作流 / MCP / Agent / dev tool 教程，类似 GitHub Blog / Doğrusal Değişiklik Günlüğü。',
  },
  'html-ppt-pitch-deck': {
    description: 'Yatırımcıya hazır 10 slaytlı HTML sunum sunumu — beyaz + mavi → mor degrade kahraman, büyük sayılar, çekiş çubuğu grafiği, 4,5 milyon ABD doları tutarındaki teklif sayfası. Kullanıcı bağış toplama platformu, tohum turu sunumu veya VC toplantı slaytları istediğinde kullanın.',
    examplePrompt: 'Yatırımcıya hazır 10 slaytlı HTML sunum sunumu — beyaz + mavi → mor degrade kahraman, büyük sayılar, çekiş çubuğu grafiği, 4,5 milyon ABD doları tutarındaki teklif sayfası. Kullanıcı bağış toplama platformu, tohum turu sunumu veya VC toplantı slaytları istediğinde kullanın.',
  },
  'html-ppt-presenter-mode': {
    description: '演讲者模式专用 güverte — tokyo-gece 默认主题，5 套主题 T 键切换，每页带 150-300 字逐字稿示例（<kenarda class="notes">），按 S 打开 açılır penceresi（CURRENT / NEXT / SCRIPT / TIMER四张磁吸卡片）。用于技术分享,公开演讲、课程讲解,怕忘词或要提词器的场景。',
    examplePrompt: '演讲者模式专用 güverte — tokyo-gece 默认主题，5 套主题 T 键切换，每页带 150-300 字逐字稿示例（<kenarda class="notes">），按 S 打开 açılır penceresi（CURRENT / NEXT / SCRIPT / TIMER四张磁吸卡片）。用于技术分享,公开演讲、课程讲解,怕忘词或要提词器的场景。',
  },
  'html-ppt-product-launch': {
    description: 'Açılış konuşmasını başlatın — karanlık kahraman + hafif içerik, sıcak turuncu→şeftali vurgusu, özellik kartları, fiyatlandırma katmanları, CTA. Bir ürünü duyururken, bir özelliği piyasaya sürerken veya açılış konuşması tarzında bir açıklama yaparken kullanın.',
    examplePrompt: 'Açılış konuşmasını başlatın — karanlık kahraman + hafif içerik, sıcak turuncu→şeftali vurgusu, özellik kartları, fiyatlandırma katmanları, CTA. Bir ürünü duyururken, bir özelliği piyasaya sürerken veya açılış konuşması tarzında bir açıklama yaparken kullanın.',
  },
  'html-ppt-retro-quarterly-review': {
    description: 'Cesur mavi + turuncu editoryal dilde Retro Çeyreklik Değerlendirme sunum şablonu. Kullanıcılar ağır slab başlıklar, temiz krem kağıt bölümler, yapılandırılmış ızgaralar ve hızlı premium hareket temposu (3 slayt, her biri video modunda 3 saniyenin altında tutulur) içeren yüksek etkili bir çeyreklik değerlendirme / yol haritası destesi istediğinde kullanın.',
    examplePrompt: 'Cesur mavi + turuncu editoryal dilde Retro Çeyreklik Değerlendirme sunum şablonu.',
  },
  'html-ppt-taste-brutalist': {
    description: 'Taktik telemetri / CRT terminal tadında 16:9 HTML desteği. Devre dışı bırakılmış CRT kömür slaytları, beyaz fosfor tek boşluk, tehlike kırmızısı vurgu, tarama çizgisi kaplaması, ASCII sözdizimi, dekorasyon üzerinde yoğunluk. Leonxlnx/taste-skill `brutalist-skill\'den (Taktik Telemetri modu) damıtılmıştır.',
    examplePrompt: 'Taktik telemetri / CRT terminal tadında 16:9 HTML desteği. Devre dışı bırakılmış CRT kömür slaytları, beyaz fosfor tek boşluk, tehlike kırmızısı vurgu, tarama çizgisi kaplaması, ASCII sözdizimi, dekorasyon üzerinde yoğunluk. Leonxlnx/taste-skill `brutalist-skill\'den (Taktik Telemetri modu) damıtılmıştır.',
  },
  'html-ppt-taste-editorial': {
    description: 'Editoryal-minimalist zevke sahip 16:9 HTML destesi. Sıcak krem ​​rengi slaytlar, serif ekran + grotesk gövde, ince çizgi kuralları, tek aralıklı meta, cömert makro boşluk, tek vurgu. Leonxlnx/taste-skill `minimalist-skill\'den damıtılmıştır.',
    examplePrompt: 'Editoryal-minimalist zevke sahip 16:9 HTML destesi. Sıcak krem ​​rengi slaytlar, serif ekran + grotesk gövde, ince çizgi kuralları, tek aralıklı meta, cömert makro boşluk, tek vurgu. Leonxlnx/taste-skill `minimalist-skill\'den damıtılmıştır.',
  },
  'html-ppt-tech-sharing': {
    description: 'Konferans / dahili teknik konuşma bölümü — GitHub-dark, JetBrains Mono, terminal kod blokları, gündem + Soru-Cevap sayfaları. Mühendislik sunumları, dahili paylaşım oturumları, konferans konuşmaları ve kod ağırlıklı açıklamalar için kullanın.',
    examplePrompt: 'Konferans / dahili teknik konuşma bölümü — GitHub-dark, JetBrains Mono, terminal kod blokları, gündem + Soru-Cevap sayfaları. Mühendislik sunumları, dahili paylaşım oturumları, konferans konuşmaları ve kod ağırlıklı açıklamalar için kullanın.',
  },
  'html-ppt-testing-safety-alert': {
    description: '红琥珀警示 güverte — 顶/底 45° 红黑 tehlike 条纹、红色删除线否定标题、L1/L2/L3 绿/琥珀/红 katmanı卡片、圆点状态 uyarı kutusu, politika-yaml 代码块（红左边框 + kötü 关键词高亮）,红绿 kontrol listesi,Q1事故堆叠柱状图。适合安全 / 风险 / 事故复盘 / 红队 / 上线前 AI 评审 / kod olarak politika',
    examplePrompt: '红琥珀警示 güverte — 顶/底 45° 红黑 tehlike 条纹、红色删除线否定标题、L1/L2/L3 绿/琥珀/红 katmanı卡片、圆点状态 uyarı kutusu, politika-yaml 代码块（红左边框 + kötü 关键词高亮）,红绿 kontrol listesi,Q1事故堆叠柱状图。适合安全 / 风险 / 事故复盘 / 红队 / 上线前 AI 评审 / kod olarak politika',
  },
  'html-ppt-weekly-report': {
    description: 'Haftalık ekip / durum güncelleme sunumu — kurumsal netlik, 8 hücreli KPI tablosu, gönderilen liste, 8 haftalık çubuk grafik, gelecek hafta tablosu. İş değerlendirmeleri, iş incelemeleri, ekip durumu güncellemeleri ve yönetici kontrol panelleri için kullanın.',
    examplePrompt: 'Haftalık ekip / durum güncelleme sunumu — kurumsal netlik, 8 hücreli KPI tablosu, gönderilen liste, 8 haftalık çubuk grafik, gelecek hafta tablosu. İş değerlendirmeleri, iş incelemeleri, ekip durumu güncellemeleri ve yönetici kontrol panelleri için kullanın.',
  },
  'html-ppt-xhs-pastel-card': {
    description: '柔和马卡龙慢生活 destesi — 奶油 #fef8f1 底 + 三个柔光 blob、Playfair 斜体衬线 ekranı 标题混 sans 正文、圆角马卡龙卡片（桃 / 薄荷 / 天 / 紫 / 柠 / 玫）、Playfair 01-04 序号、SVG donut 图、chip+page顶栏。适合生活方式 / 个人成长 / 慢生活 / 情绪类内容，"杂志、手作、不太科技"的感觉。',
    examplePrompt: '柔和马卡龙慢生活 destesi — 奶油 #fef8f1 底 + 三个柔光 blob、Playfair 斜体衬线 ekranı 标题混 sans 正文、圆角马卡龙卡片（桃 / 薄荷 / 天 / 紫 / 柠 / 玫）、Playfair 01-04 序号、SVG donut 图、chip+page顶栏。适合生活方式 / 个人成长 / 慢生活 / 情绪类内容，"杂志、手作、不太科技"的感觉。',
  },
  'html-ppt-xhs-white-editorial': {
    description: '白底杂志风 güverte — 纯白背景 + 10 inç çubuk, 80-110 piksel ekran标题、紫→蓝→绿→橙→粉渐变文字、马卡龙软卡片组（粉/紫/蓝/绿/橙）、黑底白字 .focus hap, bir hap olarak kabul edilir ve PPT\'yi kullanır.',
    examplePrompt: '白底杂志风 güverte — 纯白背景 + 10 inç çubuk, 80-110 piksel ekran标题、紫→蓝→绿→橙→粉渐变文字、马卡龙软卡片组（粉/紫/蓝/绿/橙）、黑底白字 .focus hap, bir hap olarak kabul edilir ve PPT\'yi kullanır.',
  },
  'html-ppt-zhangzara-8-bit-orbit': {
    description: '8-Bit Orbit — Derin lacivert bir boşlukta piksel sanatlı neon arcade estetiği. Gece 2\'de CRT ekranı gibi hissetmesi gereken her şey: siberpunk, oyun, web3, bağımsız geliştirme araçları, hackathon demoları.',
    examplePrompt: '8-Bit Orbit — Derin lacivert bir boşlukta piksel sanatlı neon arcade estetiği. Gece 2\'de CRT ekranı gibi hissetmesi gereken her şey: siberpunk, oyun, web3, bağımsız geliştirme araçları, hackathon demoları.',
  },
  'html-ppt-zhangzara-biennale-yellow': {
    description: 'Bienal Sarısı — Derin çivit mavisi serif ve atmosferik güneş ışığı geçişleriyle sıcak parşömen üzerine güneş sarısı. Bir sanat bienali posteri ya da müzenin yıllık programı gibi hissettirmesi gereken her şey: sergi panoları, sanat kurumu duyuruları, tasarım konferansı broşürleri, küratöryel sunumlar, edebiyat yayınları, stüdyo retrospektifleri.',
    examplePrompt: 'Bienal Sarısı — Derin çivit mavisi serif ve atmosferik güneş ışığı geçişleriyle sıcak parşömen üzerine güneş sarısı. Bir sanat bienali posteri ya da müzenin yıllık programı gibi hissettirmesi gereken her şey: sergi panoları, sanat kurumu duyuruları, tasarım konferansı broşürleri, küratöryel sunumlar, edebiyat yayınları, stüdyo retrospektifleri.',
  },
  'html-ppt-zhangzara-block-frame': {
    description: 'BlockFrame — Pastel-neon renkli bloklara ve kalın siyah çerçevelere sahip neobrutalist deste. Pop-grafik ve tasarım odaklı hissettirmesi gereken her şey: bağımsız SaaS lansmanları, ajans kimlik bilgileri, yaratıcı incelemeler, marka yeniden tasarımları.',
    examplePrompt: 'BlockFrame — Pastel-neon renkli bloklara ve kalın siyah çerçevelere sahip neobrutalist deste. Pop-grafik ve tasarım odaklı hissettirmesi gereken her şey: bağımsız SaaS lansmanları, ajans kimlik bilgileri, yaratıcı incelemeler, marka yeniden tasarımları.',
  },
  'html-ppt-zhangzara-blue-professional': {
    description: 'Blue Professional — Elektrik kobalt mavisi desenli krem ​​renkli kağıt arka plan; temiz modern profesyonel. Modern düşünülmüş ve biraz yetkili hissettirmesi gereken her şey: B2B SaaS sunumları, danışmanlık hizmetleri, tavsiye niteliğindeki güncellemeler, yatırımcı raporları.',
    examplePrompt: 'Blue Professional — Elektrik kobalt mavisi desenli krem ​​renkli kağıt arka plan; temiz modern profesyonel. Modern düşünülmüş ve biraz yetkili hissettirmesi gereken her şey: B2B SaaS sunumları, danışmanlık hizmetleri, tavsiye niteliğindeki güncellemeler, yatırımcı raporları.',
  },
  'html-ppt-zhangzara-bold-poster': {
    description: 'Cesur Poster — Devasa Shrikhand ekranı ve tek bir itfaiye aracı kırmızısı vurgusu ile editoryal poster estetiği. Dergi kapağı gibi görünmesi gereken her şey: marka manifestoları, kurucu vizyon sunumları, editoryal/kültürel sunumlar, yaratıcı incelemeler.',
    examplePrompt: 'Cesur Poster — Devasa Shrikhand ekranı ve tek bir itfaiye aracı kırmızısı vurgusu ile editoryal poster estetiği. Dergi kapağı gibi görünmesi gereken her şey: marka manifestoları, kurucu vizyon sunumları, editoryal/kültürel sunumlar, yaratıcı incelemeler.',
  },
  'html-ppt-zhangzara-broadside': {
    description: 'Broadside — Tek bir ateş turuncusu vurguya ve iki dilli Latince/Çince tipi yığına sahip koyu editoryal tuval. Geniş bir gazete manşeti gibi yer alması gereken her şey: marka manifestoları, dergi ve kültürel sunumlar, tasarım konuşmaları, iki dilli EN/CN desteleri, kurucu vizyon beyanları.',
    examplePrompt: 'Broadside — Tek bir ateş turuncusu vurguya ve iki dilli Latince/Çince tipi yığına sahip koyu editoryal tuval. Geniş bir gazete manşeti gibi yer alması gereken her şey: marka manifestoları, dergi ve kültürel sunumlar, tasarım konuşmaları, iki dilli EN/CN desteleri, kurucu vizyon beyanları.',
  },
  'html-ppt-zhangzara-capsule': {
    description: 'Kapsül — Tam bir pastel pop paletine sahip, sıcak kemik üzerine modüler hap şeklindeki kartlar. Modüler, modern ve biraz Y2K hissi vermesi gereken her şey: yaşam tarzı markaları, içerik oluşturucu portföyleri, DTC lansmanları, güzellik/sağlık, ajans kimlik bilgileri.',
    examplePrompt: 'Kapsül — Tam bir pastel pop paletine sahip, sıcak kemik üzerine modüler hap şeklindeki kartlar. Modüler, modern ve biraz Y2K hissi vermesi gereken her şey: yaşam tarzı markaları, içerik oluşturucu portföyleri, DTC lansmanları, güzellik/sağlık, ajans kimlik bilgileri.',
  },
  'html-ppt-zhangzara-cartesian': {
    description: 'Kartezyen — Klasik Playfair seriflerine sahip sessiz, sıcak-nötr palet; zevkli ve telaşsız. Sessiz, düşünülmüş ve yetişkin hissetmesi gereken her şey: yatırım tezleri, teknik incelemeler, danışmanlık çalışmaları, uzun süreli araştırmalar, galeri / kültürel desteler.',
    examplePrompt: 'Kartezyen — Klasik Playfair seriflerine sahip sessiz, sıcak-nötr palet; zevkli ve telaşsız. Sessiz, düşünülmüş ve yetişkin hissetmesi gereken her şey: yatırım tezleri, teknik incelemeler, danışmanlık çalışmaları, uzun süreli araştırmalar, galeri / kültürel desteler.',
  },
  'html-ppt-zhangzara-cobalt-grid': {
    description: 'Kobalt Izgarası — Merdiven basamaklı piksel aksaklık dekorasyonları ve ince ince çizgi kurallarıyla sabitlenmiş, grafik kağıdı tuvali üzerindeki elektrikli kobalt italik serifler. Oldukça ciddi bir tasarım / araştırma bülteni, sanat yayını veya seçilmiş trend raporu gibi hissetmesi gereken herhangi bir şey.',
    examplePrompt: 'Kobalt Izgarası — Merdiven basamaklı piksel aksaklık dekorasyonları ve ince ince çizgi kurallarıyla sabitlenmiş, grafik kağıdı tuvali üzerindeki elektrikli kobalt italik serifler. Oldukça ciddi bir tasarım / araştırma bülteni, sanat yayını veya seçilmiş trend raporu gibi hissetmesi gereken herhangi bir şey.',
  },
  'html-ppt-zhangzara-coral': {
    description: 'Mercan — Büyük boy Bebas Neue\'de yer alan, siyaha yakın krem ​​ve mercan. Sıcak grafik ve editoryal hissettirmesi gereken her şey: moda, güzellik, fitness, F&B, yaşam tarzı markaları, ajans bilgileri.',
    examplePrompt: 'Mercan — Büyük boy Bebas Neue\'de yer alan, siyaha yakın krem ​​ve mercan. Sıcak grafik ve editoryal hissettirmesi gereken her şey: moda, güzellik, fitness, F&B, yaşam tarzı markaları, ajans bilgileri.',
  },
  'html-ppt-zhangzara-creative-mode': {
    description: 'Yaratıcı Mod — Kendine güvenen çok renkli (yeşil, pembe, turuncu, sarı) vurgulara ve Archivo Black ekrana sahip krem ​​​​kağıt tuval. Tasarım odaklı ve kendinden emin hissettirmesi gereken her şey: yaratıcı ajans sunumları, tasarım stüdyosu sunumları, reklam mağazası kimlik bilgileri, marka yaratıcı incelemeleri, sanat yönetimi incelemeleri.',
    examplePrompt: 'Yaratıcı Mod — Kendine güvenen çok renkli (yeşil, pembe, turuncu, sarı) vurgulara ve Archivo Black ekrana sahip krem ​​​​kağıt tuval. Tasarım odaklı ve kendinden emin hissettirmesi gereken her şey: yaratıcı ajans sunumları, tasarım stüdyosu sunumları, reklam mağazası kimlik bilgileri, marka yaratıcı incelemeleri, sanat yönetimi incelemeleri.',
  },
  'html-ppt-zhangzara-daisy-days': {
    description: 'Papatya Günleri — Elle çizilmiş papatyalar, yıldızlar ve gökkuşaklarıyla neşeli pastel deste. Dost canlısı, yumuşak ve sıcak. Samimi, yumuşak ve neşeli hissettirmesi gereken her şey: eğitici içerik, çocuklar ve aile, sağlıklı yaşam programları, topluluk atölyeleri, el işi/illüstrasyona yönelik içerik oluşturucu portföyleri.',
    examplePrompt: 'Papatya Günleri — Elle çizilmiş papatyalar, yıldızlar ve gökkuşaklarıyla neşeli pastel deste. Dost canlısı, yumuşak ve sıcak. Samimi, yumuşak ve neşeli hissettirmesi gereken her şey: eğitici içerik, çocuklar ve aile, sağlıklı yaşam programları, topluluk atölyeleri, el işi/illüstrasyona yönelik içerik oluşturucu portföyleri.',
  },
  'html-ppt-zhangzara-editorial-tri-tone': {
    description: 'Editoryal Üç Tonlu — Üç renkli editoryal sistem: tozlu pembe, hardal kreması ve koyu bordo, Bricolage + Instrument Serif\'te ayarlanmıştır. Bir moda dergisi yayını gibi hissettirmesi gereken her şey: editoryal konuşmalar, moda markası desteleri, yaşam tarzı medyası, sanat yönetmenliği incelemeleri.',
    examplePrompt: 'Editoryal Üç Tonlu — Üç renkli editoryal sistem: tozlu pembe, hardal kreması ve koyu bordo, Bricolage + Instrument Serif\'te ayarlanmıştır. Bir moda dergisi yayını gibi hissettirmesi gereken her şey: editoryal konuşmalar, moda markası desteleri, yaşam tarzı medyası, sanat yönetmenliği incelemeleri.',
  },
  'html-ppt-zhangzara-grove': {
    description: 'Grove — Krem rengi, klasik Playfair serifleri ve tek pas vurgulu orman yeşili tuval. Organik, düşünülmüş ve olgun hissettirmesi gereken her şey: sürdürülebilirlik ve sağlıklı yaşam markaları, açık hava/doğa ürünleri, şarap imalathaneleri ve restoranlar, edebiyat veya sanat desteleri, tavsiye niteliğindeki çıktılar, iki dilli EN/CN raporları.',
    examplePrompt: 'Grove — Krem rengi, klasik Playfair serifleri ve tek pas vurgulu orman yeşili tuval. Organik, düşünülmüş ve olgun hissettirmesi gereken her şey: sürdürülebilirlik ve sağlıklı yaşam markaları, açık hava/doğa ürünleri, şarap imalathaneleri ve restoranlar, edebiyat veya sanat desteleri, tavsiye niteliğindeki çıktılar, iki dilli EN/CN raporları.',
  },
  'html-ppt-zhangzara-long-table': {
    description: 'Uzun Masa - Cesur, büyük harfli grotesk başlıklar, italik Fraunces ve hap şeklinde özetlenen düğmelerle sıcak krem ​​​​ve pas kırmızısı akşam yemeği kulübü estetiği. Sıcak, samimi, modern bir konukseverlik / topluluk markası gibi hissetmesi gereken her şey: akşam yemeği kulüpleri, akşam yemeği serileri, küçük restoranlar, yaratıcı stüdyo etkinlikleri, üyelik sunumları, yaşam tarzı ve şarap markaları.',
    examplePrompt: 'Uzun Masa - Cesur, büyük harfli grotesk başlıklar, italik Fraunces ve hap şeklinde özetlenen düğmelerle sıcak krem ​​​​ve pas kırmızısı akşam yemeği kulübü estetiği. Sıcak, samimi, modern bir konukseverlik / topluluk markası gibi hissetmesi gereken her şey: akşam yemeği kulüpleri, akşam yemeği serileri, küçük restoranlar, yaratıcı stüdyo etkinlikleri, üyelik sunumları, yaşam tarzı ve şarap markaları.',
  },
  'html-ppt-zhangzara-mat': {
    description: 'Mat - Kemik kağıdı ve yanık turuncu vurgulu koyu adaçayı tuvali; ahşap alt tonlarıyla yüzyıl ortası modernliği. Yüzyılın ortası, dokunsal ve kasıtlı hissettirmesi gereken her şey: tasarım stüdyosu kimlik bilgileri, mimari / iç mekan markaları, seramik / el sanatları / mobilya, danışma desteleri.',
    examplePrompt: 'Mat - Kemik kağıdı ve yanık turuncu vurgulu koyu adaçayı tuvali; ahşap alt tonlarıyla yüzyıl ortası modernliği. Yüzyılın ortası, dokunsal ve kasıtlı hissettirmesi gereken her şey: tasarım stüdyosu kimlik bilgileri, mimari / iç mekan markaları, seramik / el sanatları / mobilya, danışma desteleri.',
  },
  'html-ppt-zhangzara-monochrome': {
    description: 'Tek renkli — Tamamen siyah tipte, fildişi defter kağıdı; Lora serif manşetler, Jost gövdesi, hiç renk yok. Elle yazılmış bir defter gibi hissettirmesi gereken her şey: kullanıcı araştırması sentezi, teknik incelemeler, uzun biçimli raporlar, akademik ve politika özetleri, tavsiye niteliğindeki çıktılar, iki dilli EN/CN raporları.',
    examplePrompt: 'Tek renkli — Tamamen siyah tipte, fildişi defter kağıdı; Lora serif manşetler, Jost gövdesi, hiç renk yok. Elle yazılmış bir defter gibi hissettirmesi gereken her şey: kullanıcı araştırması sentezi, teknik incelemeler, uzun biçimli raporlar, akademik ve politika özetleri, tavsiye niteliğindeki çıktılar, iki dilli EN/CN raporları.',
  },
  'html-ppt-zhangzara-neo-grid-bold': {
    description: 'Neo-Grid Bold — Kirli beyaz kağıt üzerinde tek bir neon sarı vurgulu editoryal neo-vahşilik. Kendinden emin ve editoryal grafik hissi vermesi gereken her şey: tasarım odaklı sunumlar, marka çalışması, kurucu konuşmaları, konferans açılış konuşmaları.',
    examplePrompt: 'Neo-Grid Bold — Kirli beyaz kağıt üzerinde tek bir neon sarı vurgulu editoryal neo-vahşilik. Kendinden emin ve editoryal grafik hissi vermesi gereken her şey: tasarım odaklı sunumlar, marka çalışması, kurucu konuşmaları, konferans açılış konuşmaları.',
  },
  'html-ppt-zhangzara-peoples-platform': {
    description: 'Halk Platformu (Blok ve Kalın) — Aktivist poster enerjisi: krem ​​üzerine mavi, turuncu, kırmızı, Alfa Slab + Uyarı Fırçası ile. Dürüst, sesli ve çarpıcı olması gereken her şey: kültürel yorumlar, manifestolar, sivil ve topluluk sunumları, tasarım konuşmaları, kampanya sunumları.',
    examplePrompt: 'Halk Platformu (Blok ve Kalın) — Aktivist poster enerjisi: krem ​​üzerine mavi, turuncu, kırmızı, Alfa Slab + Uyarı Fırçası ile. Dürüst, sesli ve çarpıcı olması gereken her şey: kültürel yorumlar, manifestolar, sivil ve topluluk sunumları, tasarım konuşmaları, kampanya sunumları.',
  },
  'html-ppt-zhangzara-pin-and-paper': {
    description: 'Pim ve Kağıt — Çengelli iğne resimli sarı kağıt, mürekkep mavisi el yazısıyla yazılmış Uyarı, kağıt damarlı doku. El yapımı, sıcak ve edebi hissettirmesi gereken her şey: Niteliksel araştırma bulguları, kurucuların düşünceleri, uzun biçimli marka hikayeleri, atölye çalışmaları.',
    examplePrompt: 'Pim ve Kağıt — Çengelli iğne resimli sarı kağıt, mürekkep mavisi el yazısıyla yazılmış Uyarı, kağıt damarlı doku. El yapımı, sıcak ve edebi hissettirmesi gereken her şey: Niteliksel araştırma bulguları, kurucuların düşünceleri, uzun biçimli marka hikayeleri, atölye çalışmaları.',
  },
  'html-ppt-zhangzara-pink-script': {
    description: 'Pembe Yazı - After Hours - Siyah tuval, sıcak pembe vurgu, inci kremalı kağıt, Instrument Serif manşetleri: gece geç saatlerde editoryal lüks. Geceye özgü, kasıtlı ve biraz lüks hissettirmesi gereken her şey: moda marka desteleri, yaratıcıların kişisel markaları, mesai sonrası / gece hayatı / alkollü içki lansmanları, lüks ürün tanıtımları, editoryal özellikler.',
    examplePrompt: 'Pembe Yazı - After Hours - Siyah tuval, sıcak pembe vurgu, inci kremalı kağıt, Instrument Serif manşetleri: gece geç saatlerde editoryal lüks. Geceye özgü, kasıtlı ve biraz lüks hissettirmesi gereken her şey: moda marka desteleri, yaratıcıların kişisel markaları, mesai sonrası / gece hayatı / alkollü içki lansmanları, lüks ürün tanıtımları, editoryal özellikler.',
  },
  'html-ppt-zhangzara-playful': {
    description: 'Eğlenceli — Syne ekranlı, güneş sıcaklığında şeftali rengi arka plan: samimi bir indie fırlatma güvertesi. Sıcak, bağımsız ve yaklaşılabilir hissettirmesi gereken her şey: içerik oluşturucu portföyleri, bağımsız ürün lansmanları, yaşam tarzı markaları, küçük işletme sunumları, haber bülteni / topluluk desteleri.',
    examplePrompt: 'Eğlenceli — Syne ekranlı, güneş sıcaklığında şeftali rengi arka plan: samimi bir indie fırlatma güvertesi. Sıcak, bağımsız ve yaklaşılabilir hissettirmesi gereken her şey: içerik oluşturucu portföyleri, bağımsız ürün lansmanları, yaşam tarzı markaları, küçük işletme sunumları, haber bülteni / topluluk desteleri.',
  },
  'html-ppt-zhangzara-raw-grid': {
    description: 'Raw Grid — Kalın çerçeveli, ofset gölgeli ve pembe/adaçayı/mürekkep paletli neo-brutalist deste. Doğrudan ve görsel açıdan kendinden emin hissettirmesi gereken her şey: kurucu sunumları, hızlandırıcı demoları, marka desteleri, bağımsız lansmanlar, içerik oluşturucu portföyleri.',
    examplePrompt: 'Raw Grid — Kalın çerçeveli, ofset gölgeli ve pembe/adaçayı/mürekkep paletli neo-brutalist deste. Doğrudan ve görsel açıdan kendinden emin hissettirmesi gereken her şey: kurucu sunumları, hızlandırıcı demoları, marka desteleri, bağımsız lansmanlar, içerik oluşturucu portföyleri.',
  },
  'html-ppt-zhangzara-retro-windows': {
    description: 'Retro Windows — Windows 95 kromu: gri başlık çubukları, MS Sans Serif, piksel tipografi, tam nostalji. Bilinen nostaljik hissettirmesi gereken her şey: retro oyunlar, Y2K estetiğine sahip markalar, 90\'lar havasını taşıyan içerik oluşturucu portföyleri, teknoloji tarihi konuşmaları, kasıtlı olarak şakacı desteler.',
    examplePrompt: 'Retro Windows — Windows 95 kromu: gri başlık çubukları, MS Sans Serif, piksel tipografi, tam nostalji. Bilinen nostaljik hissettirmesi gereken her şey: retro oyunlar, Y2K estetiğine sahip markalar, 90\'lar havasını taşıyan içerik oluşturucu portföyleri, teknoloji tarihi konuşmaları, kasıtlı olarak şakacı desteler.',
  },
  'html-ppt-zhangzara-retro-zine': {
    description: 'Retro Zine — Yeşil vurgulu bej kağıt ve Bebas Neue + Caveat: HTML biçiminde riso baskılı bir zine. Basılı, lo-fi ve el yapımı hissi vermesi gereken her şey: bağımsız dergiler ve yayınlar, müzik/sanat markaları, yaratıcı portföyleri, küçük partili el sanatları lansmanları, topluluk desteleri.',
    examplePrompt: 'Retro Zine — Yeşil vurgulu bej kağıt ve Bebas Neue + Caveat: HTML biçiminde riso baskılı bir zine. Basılı, lo-fi ve el yapımı hissi vermesi gereken her şey: bağımsız dergiler ve yayınlar, müzik/sanat markaları, yaratıcı portföyleri, küçük partili el sanatları lansmanları, topluluk desteleri.',
  },
  'html-ppt-zhangzara-sakura-chroma': {
    description: 'Sakura Chroma - Vintage Japon kaset paketi estetiği: krem ​​​​kağıt, çapraz gökkuşağı şeritler, yoğunlaştırılmış kalın tip, JIS tarzı spesifikasyon onay kutuları. Eski bir Japon kaset paketi veya TDK / Sony / Sakura Color ürün kataloğu gibi hissetmesi gereken her şey: bağımsız donanım markası desteleri, müzik şirketi yayın programları, analog stüdyo retrospektifleri, dergi ve dergi sunumları, kawaii teknoloji ürün lansmanları, yaratıcı stüdyo yıllık raporları.',
    examplePrompt: 'Sakura Chroma - Vintage Japon kaset paketi estetiği: krem ​​​​kağıt, çapraz gökkuşağı şeritler, yoğunlaştırılmış kalın tip, JIS tarzı spesifikasyon onay kutuları. Eski bir Japon kaset paketi veya TDK / Sony / Sakura Color ürün kataloğu gibi hissetmesi gereken her şey: bağımsız donanım markası desteleri, müzik şirketi yayın programları, analog stüdyo retrospektifleri, dergi ve dergi sunumları, kawaii teknoloji ürün lansmanları, yaratıcı stüdyo yıllık raporları.',
  },
  'html-ppt-zhangzara-scatterbrain': {
    description: 'Scatterbrain — Post-it\'ten ilham alındı: pastel yapışkan notlar, Caveat el yazısı, Shrikhand ve Zilla Slab tipi yığın. Bir tasarımcının beyaz tahtasına benzemesi gereken her şey: beyin fırtınaları, atölye çalışmaları, yaratıcı ajans kimlik bilgileri, tasarım odaklı düşünme oturumları, fikir geliştirme sunumları, sanat yönetimi incelemeleri.',
    examplePrompt: 'Scatterbrain — Post-it\'ten ilham alındı: pastel yapışkan notlar, Caveat el yazısı, Shrikhand ve Zilla Slab tipi yığın. Bir tasarımcının beyaz tahtasına benzemesi gereken her şey: beyin fırtınaları, atölye çalışmaları, yaratıcı ajans kimlik bilgileri, tasarım odaklı düşünme oturumları, fikir geliştirme sunumları, sanat yönetimi incelemeleri.',
  },
  'html-ppt-zhangzara-signal': {
    description: 'Signal — Kemik kağıtlı ve tek bir yumuşak altın vurgulu derin lacivert tuval; sessiz ağırlığıyla kurumsal. Ağır, düşünülmüş ve güvenilir bir şekilde kurumsal hissettirmesi gereken her şey: yatırımcı sunumları, yönetim kurulu sunumları, danışmanlık çıktıları, hukuki / politika özetleri, danışma sunumları.',
    examplePrompt: 'Signal — Kemik kağıtlı ve tek bir yumuşak altın vurgulu derin lacivert tuval; sessiz ağırlığıyla kurumsal. Ağır, düşünülmüş ve güvenilir bir şekilde kurumsal hissettirmesi gereken her şey: yatırımcı sunumları, yönetim kurulu sunumları, danışmanlık çıktıları, hukuki / politika özetleri, danışma sunumları.',
  },
  'html-ppt-zhangzara-soft-editorial': {
    description: 'Yumuşak Editoryal — Adaçayı, allık ve limon vurgularıyla sıcak kağıt üzerine Karabatak Garamond serif. Edebi, zarif ve telaşsız hissettirmesi gereken her şey: editoryal özellikler, uzun biçimli marka hikayeleri, galeri / müze desteleri, tavsiye niteliğindeki çıktılar, düğün / yaşam tarzı medyası, kurucu makaleleri.',
    examplePrompt: 'Yumuşak Editoryal — Adaçayı, allık ve limon vurgularıyla sıcak kağıt üzerine Karabatak Garamond serif. Edebi, zarif ve telaşsız hissettirmesi gereken her şey: editoryal özellikler, uzun biçimli marka hikayeleri, galeri / müze desteleri, tavsiye niteliğindeki çıktılar, düğün / yaşam tarzı medyası, kurucu makaleleri.',
  },
  'html-ppt-zhangzara-stencil-tablet': {
    description: 'Şablon ve Tablet — Şablonla kesilmiş başlıklara ve altı renkli toprak paletine sahip kemik kağıt: arkeoloji markayla buluşuyor. Arşivsel, dokunsal ve ağırlıklı grafik hissi vermesi gereken her şey: müze ve kültür kurumu desteleri, sanat/mimarlık markaları, uzun süreli araştırma, miras ve zanaat markaları, manifestolar.',
    examplePrompt: 'Şablon ve Tablet — Şablonla kesilmiş başlıklara ve altı renkli toprak paletine sahip kemik kağıt: arkeoloji markayla buluşuyor. Arşivsel, dokunsal ve ağırlıklı grafik hissi vermesi gereken her şey: müze ve kültür kurumu desteleri, sanat/mimarlık markaları, uzun süreli araştırma, miras ve zanaat markaları, manifestolar.',
  },
  'html-ppt-zhangzara-studio': {
    description: 'Stüdyo - Elektrik sarısı tipinde siyah tuval; yüksek gerilim tasarım stüdyosu estetiği. Heyecan verici ve tasarım odaklı hissettirmesi gereken her şey: stüdyo referansları, yaratıcı ajans sunumları, marka vitrinleri, sanat yönetimi incelemeleri, moda/spor ayakkabı marka çalışmaları.',
    examplePrompt: 'Stüdyo - Elektrik sarısı tipinde siyah tuval; yüksek gerilim tasarım stüdyosu estetiği. Heyecan verici ve tasarım odaklı hissettirmesi gereken her şey: stüdyo referansları, yaratıcı ajans sunumları, marka vitrinleri, sanat yönetimi incelemeleri, moda/spor ayakkabı marka çalışmaları.',
  },
  'html-ppt-zhangzara-vellum': {
    description: 'Parşömen — Sıcak sarı italik Karabatak serifleri ve tek bir tozlu deniz mavisi vurgusu olan koyu lacivert kanvas. Sessiz, bilimsel bir estetik. Akademik, edebi ve oldukça zekice hissettirmesi gereken her şey: araştırma sentezi, teknik incelemeler, akademik ve politika özetleri, tavsiye niteliğindeki çıktılar, uzun biçimli editoryal yazılar, kurucunun düşünceleri.',
    examplePrompt: 'Parşömen — Sıcak sarı italik Karabatak serifleri ve tek bir tozlu deniz mavisi vurgusu olan koyu lacivert kanvas. Sessiz, bilimsel bir estetik. Akademik, edebi ve oldukça zekice hissettirmesi gereken her şey: araştırma sentezi, teknik incelemeler, akademik ve politika özetleri, tavsiye niteliğindeki çıktılar, uzun biçimli editoryal yazılar, kurucunun düşünceleri.',
  },
  'huashu-annual-letter': {
    description: 'Yıllık Mektup · 年度信笺 — Şeritli yıllık mektup stili tek dosyalı HTML desteleri\r\n花叔 (alchaincyf)\'in huashu tasarım becerisinin editoryal uzun biçim çizgisinden.\r\nKrem #FBFAF8 kağıt, bir Şerit-mor #635BFF vurgusu, 65 kanalda serif düzyazı\r\nyayın ölçüsü, çalışan metnin içindeki satır içi veri kartları ve dev\r\ntablo şeklinde ekran numarası bağlantı sayfaları. Kullanıcı yıllık istediğinde kullanın\r\nmektup, hissedar mektubu, kurucu notu, 年度信, 股东信 veya uzun biçim\r\nmektup tarzı güverte.',
    examplePrompt: 'Yıllık Mektup · 年度信笺 — Şeritli yıllık mektup stili tek dosyalı HTML desteleri\r\n花叔 (alchaincyf)\'in huashu tasarım becerisinin editoryal uzun biçim çizgisinden.\r\nKrem #FBFAF8 kağıt, bir Şerit-mor #635BFF vurgusu, 65 kanalda serif düzyazı\r\nyayın ölçüsü, çalışan metnin içindeki satır içi veri kartları ve dev\r\ntablo şeklinde ekran numarası bağlantı sayfaları. Kullanıcı yıllık istediğinde kullanın\r\nmektup, hissedar mektubu, kurucu notu, 年度信, 股东信 veya uzun biçim\r\nmektup tarzı güverte.',
  },
  'huashu-bento-insight': {
    description: 'Bento Insight Grid (便当格洞见) — Apple Keynote / QBR okulu bento desteleri\r\n「Bento便当格模块网格 / Bento Grid」 spesifikasyonundan oluşturulmuştur (nötr okul\r\n花叔 (alchaincyf)\'in huashu-design design-styles.md\'sinde 1 numara, %95 doğruluk).\r\nAçık gri #F5F5F7 / krem sayfalar, eşit olmayan yükseklikte 1 piksellik yuvarlak kartlar\r\nince çizgiler ve mikro gölgeler, kart başına bir bilgi (büyük tablo rakamı /\r\ndoğrusal satır içi SVG simgesi / SVG mini grafiği), büyük boyutlu ekran başlıkları\r\nsert ağırlık kontrastı, Inter/Geist + Geist Mono. Kullanıcı istediği zaman kullanın\r\nQBR, iş incelemesi, ürün özelliği özeti, satış sonuçları listesi, şehir\r\nsalon ölçümleri destesi, 季度汇报, 业务回顾, 数据汇报 veya bir Apple açılış konuşması /\r\nbento-grid tarzı sunum.',
    examplePrompt: 'Bento Insight Grid (便当格洞见) — Apple Keynote / QBR okulu bento desteleri\r\n「Bento便当格模块网格 / Bento Grid」 spesifikasyonundan oluşturulmuştur (nötr okul\r\n花叔 (alchaincyf)\'in huashu-design design-styles.md\'sinde 1 numara, %95 doğruluk).\r\nAçık gri #F5F5F7 / krem sayfalar, eşit olmayan yükseklikte 1 piksellik yuvarlak kartlar\r\nince çizgiler ve mikro gölgeler, kart başına bir bilgi (büyük tablo rakamı /\r\ndoğrusal satır içi SVG simgesi / SVG mini grafiği), büyük boyutlu ekran başlıkları\r\nsert ağırlık kontrastı, Inter/Geist + Geist Mono. Kullanıcı istediği zaman kullanın\r\nQBR, iş incelemesi, ürün özelliği özeti, satış sonuçları listesi, şehir\r\nsalon ölçümleri destesi, 季度汇报, 业务回顾, 数据汇报 veya bir Apple açılış konuşması /\r\nbento-grid tarzı sunum.',
  },
  'huashu-golden-circle': {
    description: 'Altın Çember Diyagramı (黄金圆环图解) — Sinek/TED-okul diyagramatiği\r\nMinimalizm, Minimalizm\'den türetilmiştir. / Diagrammatic\r\n花叔 (alchaincyf)\'in huashu tasarımının minimalizm özelliği. Sıcak beyaz kağıt,\r\nmürekkep ve tam olarak bir altın vurgu (#E8860C); tek iç içe eşmerkezli\r\nNEDEN/NASIL/NE çemberi - saf sınır yarıçaplı div\'ler - her sayfayı taşır\r\ndoldurma / vurgulama / gri / anahat modları; büyük harfli Jost etiketleri gömülü\r\nşekil, Manrope manşetleri, sıfır grafikler ve sıfır görseller. Şu durumlarda kullanın:\r\nkullanıcı bir metodoloji destesi, çerçeve açıklayıcı, TED tarzı konuşma istiyor,\r\nmanifesto, 方法论 PPT, 理论框架讲解, 黄金圆环 veya tek diyagramlı bir kavram\r\naçılış konuşması.',
    examplePrompt: 'Altın Çember Diyagramı (黄金圆环图解) — Sinek/TED-okul diyagramatiği\r\nMinimalizm, Minimalizm\'den türetilmiştir. / Diagrammatic\r\n花叔 (alchaincyf)\'in huashu tasarımının minimalizm özelliği. Sıcak beyaz kağıt,\r\nmürekkep ve tam olarak bir altın vurgu (#E8860C); tek iç içe eşmerkezli\r\nNEDEN/NASIL/NE çemberi - saf sınır yarıçaplı div\'ler - her sayfayı taşır\r\ndoldurma / vurgulama / gri / anahat modları; büyük harfli Jost etiketleri gömülü\r\nşekil, Manrope manşetleri, sıfır grafikler ve sıfır görseller. Şu durumlarda kullanın:\r\nkullanıcı bir metodoloji destesi, çerçeve açıklayıcı, TED tarzı konuşma istiyor,\r\nmanifesto, 方法论 PPT, 理论框架讲解, 黄金圆环 veya tek diyagramlı bir kavram\r\naçılış konuşması.',
  },
  'huashu-keynote-black': {
    description: 'Keynote Black (黑场大数字) — Jobs-2007 / Lei-Haziran-lansman-etkinliği siyah sahne\r\nAçılış desteleri,「黑底巨型数字剧场 / Black Big-Number\'dan oluşturulmuştur\r\n花叔 (alchaincyf)\'in huashu tasarımı tasarım stilleri kitaplığında sahne özellikleri.\r\nSaf siyah #000000 sahne, saf beyaz tip, tek kelime veya dev\r\nEkran başına tablo halinde rakamlar, bütün için tam olarak tek bir marka vurgusu\r\ngüverte (Mi turuncu #FF6900 / Spotify yeşil #1ED760 / Elma mavisi #2997FF),\r\ndevasa negatif alan, vurgulu ve gri özellik karşılaştırma çubukları ve\r\nfiyat açıklamasının doruk noktası. Kullanıcı bir ürün lansmanı açılış konuşması istediğinde kullanın,\r\n发布会 PPT, 主题演讲, belediye binası, yıllık inceleme, İş tarzı veya\r\nBir sunum veya slayt başına tek kelimelik siyah deste.',
    examplePrompt: 'Keynote Black (黑场大数字) — Jobs-2007 / Lei-Haziran-lansman-etkinliği siyah sahne\r\nAçılış desteleri,「黑底巨型数字剧场 / Black Big-Number\'dan oluşturulmuştur\r\n花叔 (alchaincyf)\'in huashu tasarımı tasarım stilleri kitaplığında sahne özellikleri.\r\nSaf siyah #000000 sahne, saf beyaz tip, tek kelime veya dev\r\nEkran başına tablo halinde rakamlar, bütün için tam olarak tek bir marka vurgusu\r\ngüverte (Mi turuncu #FF6900 / Spotify yeşil #1ED760 / Elma mavisi #2997FF),\r\ndevasa negatif alan, vurgulu ve gri özellik karşılaştırma çubukları ve\r\nfiyat açıklamasının doruk noktası. Kullanıcı bir ürün lansmanı açılış konuşması istediğinde kullanın,\r\n发布会 PPT, 主题演讲, belediye binası, yıllık inceleme, İş tarzı veya\r\nBir sunum veya slayt başına tek kelimelik siyah deste.',
  },
  'huashu-luxe-whitespace': {
    description: 'Luxe Whitespace (奢华留白) — sessiz-lüks sunum desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-build vitrini. %70+ boşluk\r\nsıcak kirli beyaz #FAFAF8 tuval üzerinde, Inter 200–600 ultra ince hiyerarşi,\r\n120 piksel ağırlık-200 kayan rakam, altın ondalık noktalı, bir sıcak altın\r\n(#D4A574) ince çizgilere harcandı ve karşılaştırma çubukları kazandı, degrade ince çizgi\r\nayırıcılar (#E0DCD6). Kullanıcı premium marka raporu istediğinde kullanın,\r\nüst düzey ürün sunumu, sessiz lüks açılış konuşması, 品牌年度报告, 高端发布会,\r\n奢侈品风格 veya abartısız, ince tipte bir sunum.',
    examplePrompt: 'Luxe Whitespace (奢华留白) — sessiz-lüks sunum desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-build vitrini. %70+ boşluk\r\nsıcak kirli beyaz #FAFAF8 tuval üzerinde, Inter 200–600 ultra ince hiyerarşi,\r\n120 piksel ağırlık-200 kayan rakam, altın ondalık noktalı, bir sıcak altın\r\n(#D4A574) ince çizgilere harcandı ve karşılaştırma çubukları kazandı, degrade ince çizgi\r\nayırıcılar (#E0DCD6). Kullanıcı premium marka raporu istediğinde kullanın,\r\nüst düzey ürün sunumu, sessiz lüks açılış konuşması, 品牌年度报告, 高端发布会,\r\n奢侈品风格 veya abartısız, ince tipte bir sunum.',
  },
  'huashu-pentagram-grid': {
    description: 'Pentagram Bilgi Mimarisi (信息建筑·红) - rasyonel İsviçre şebekesi veri desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-pentagram gösteriminden uyarlanmıştır.\r\n1920×1080 tuval üzerine siyah beyaz kısıtlama, Helvetica Neue hiyerarşisi,\r\nbir kırmızı (#E63946), 64 piksel siyah krom çubuklar, %5 opaklık ızgara çizgileri, dev\r\nKırmızı/koyu/gri karşılaştırma çubuk grafiklerini gösteren 900 ağırlıklı rakamlar. Ne zaman kullan\r\nkullanıcı bir veri raporu, kıyaslama listesi, yıllık rapor, KPI incelemesi,\r\n数据报告, 基准对比 veya İsviçre ızgarası / Pentagram tarzı bir sunum.',
    examplePrompt: 'Pentagram Bilgi Mimarisi (信息建筑·红) - rasyonel İsviçre şebekesi veri desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-pentagram gösteriminden uyarlanmıştır.\r\n1920×1080 tuval üzerine siyah beyaz kısıtlama, Helvetica Neue hiyerarşisi,\r\nbir kırmızı (#E63946), 64 piksel siyah krom çubuklar, %5 opaklık ızgara çizgileri, dev\r\nKırmızı/koyu/gri karşılaştırma çubuk grafiklerini gösteren 900 ağırlıklı rakamlar. Ne zaman kullan\r\nkullanıcı bir veri raporu, kıyaslama listesi, yıllık rapor, KPI incelemesi,\r\n数据报告, 基准对比 veya İsviçre ızgarası / Pentagram tarzı bir sunum.',
  },
  'huashu-slides': {
    description: 'Huashu Slaytları — yayın düzeyinde tek dosyalı HTML desteleri,\r\n花叔 (alchaincyf)\'in huashu tasarımı becerisinin iş akışını kaydırır. Editoryal dilbilgisi\r\n(masthead / kicker / dev serif H1 / altbilgi), sabit bir 1920×1080 tuval\r\notomatik sığdırma ölçeklendirme, klavyede gezinme ve karma yönlendirme, katı yapay zeka eğimi önleme\r\nkurallar ve isteğe bağlı düzenlenebilir PPTX dışa aktarma yolu. Kullanıcı istediği zaman kullanın\r\nsunum, slaytlar, PPT, deste, sunum veya fotoğraf.',
    examplePrompt: 'Huashu Slaytları — yayın düzeyinde tek dosyalı HTML desteleri,\r\n花叔 (alchaincyf)\'in huashu tasarımı becerisinin iş akışını kaydırır. Editoryal dilbilgisi\r\n(masthead / kicker / dev serif H1 / altbilgi), sabit bir 1920×1080 tuval\r\notomatik sığdırma ölçeklendirme, klavyede gezinme ve karma yönlendirme, katı yapay zeka eğimi önleme\r\nkurallar ve isteğe bağlı düzenlenebilir PPTX dışa aktarma yolu. Kullanıcı istediği zaman kullanın\r\nsunum, slaytlar, PPT, deste, sunum veya fotoğraf.',
  },
  'huashu-sparkline-arc': {
    description: 'Anlatı Sparkline (叙事波形) — Duarte tarzı anlatı desteleri\r\n花叔 (alchaincyf)\'deki Sparkline叙事波形 spesifikasyonu (中性派,还原%91)\r\nhuashu-design referansları/design-styles.md. Bir salınımlı SVG bezier\r\ndalga biçimi her sayfada 1920×1080 tuvalin tamamını kaplar; marka turuncu\r\n(#FF6B2C) yalnızca dönüm noktalarını işaret eder, gri gölgeli çizgiler dönüm noktalarını taşır.\r\nkarşılaştırma ve kontur-çizgi uzaklığı her segmenti aşamalı olarak çizer. Ne zaman kullan\r\nkullanıcı öncesi/sonrası bir değişim anlatımı, dönüşüm hikayesi istiyor\r\nkontrast, veri hikayesi akışı, konuşma yapısı desteği, 变革叙事, 数据故事,\r\nveya Duarte / mini grafik tarzı bir sunum.',
    examplePrompt: 'Anlatı Sparkline (叙事波形) — Duarte tarzı anlatı desteleri\r\n花叔 (alchaincyf)\'deki Sparkline叙事波形 spesifikasyonu (中性派,还原%91)\r\nhuashu-design referansları/design-styles.md. Bir salınımlı SVG bezier\r\ndalga biçimi her sayfada 1920×1080 tuvalin tamamını kaplar; marka turuncu\r\n(#FF6B2C) yalnızca dönüm noktalarını işaret eder, gri gölgeli çizgiler dönüm noktalarını taşır.\r\nkarşılaştırma ve kontur-çizgi uzaklığı her segmenti aşamalı olarak çizer. Ne zaman kullan\r\nkullanıcı öncesi/sonrası bir değişim anlatımı, dönüşüm hikayesi istiyor\r\nkontrast, veri hikayesi akışı, konuşma yapısı desteği, 变革叙事, 数据故事,\r\nveya Duarte / mini grafik tarzı bir sunum.',
  },
  'huashu-takram-soft-tech': {
    description: 'Takram Soft Tech (东方柔光科技) - yumuşak, Doğu felsefesi teknoloji desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-takram vitrininden uyarlanmıştır.\r\nSıcak pirinç kağıdı tuval (#F5F0EB), adaçayı yeşili + sıcak gri + bir altın,\r\nNoto Serif SC ekran başlıkları Inter etiketleriyle karıştırılmış, yuvarlak yarı saydam\r\nveri kartları ve imza cihazı: SVG veri görselleştirmesi\r\nsanat eseri - elle çizilmiş kesikli ızgaralar üzerine yerleştirilmiş çok serili radar grafikleri\r\n"Şek. NN" plaka açıklamaları ile. Kullanıcı nazik bir şekilde istediğinde kullanın,\r\ndoğal tonlarda teknik sunum, ürün brifingi, kıyaslama raporu,\r\n自然色系 PPT veya "数据可视化当艺术品" sunumları.',
    examplePrompt: 'Takram Soft Tech (东方柔光科技) - yumuşak, Doğu felsefesi teknoloji desteleri\r\n花叔 (alchaincyf)\'in huashu tasarımının ppt-takram vitrininden uyarlanmıştır.\r\nSıcak pirinç kağıdı tuval (#F5F0EB), adaçayı yeşili + sıcak gri + bir altın,\r\nNoto Serif SC ekran başlıkları Inter etiketleriyle karıştırılmış, yuvarlak yarı saydam\r\nveri kartları ve imza cihazı: SVG veri görselleştirmesi\r\nsanat eseri - elle çizilmiş kesikli ızgaralar üzerine yerleştirilmiş çok serili radar grafikleri\r\n"Şek. NN" plaka açıklamaları ile. Kullanıcı nazik bir şekilde istediğinde kullanın,\r\ndoğal tonlarda teknik sunum, ürün brifingi, kıyaslama raporu,\r\n自然色系 PPT veya "数据可视化当艺术品" sunumları.',
  },
  'hyperframes': {
    description: 'HyperFrames HTML\'de video kompozisyonları, animasyonlar, başlık kartları, katmanlar, altyazılar, seslendirmeler, sese duyarlı görseller ve sahne geçişleri oluşturun. Herhangi bir HTML tabanlı video içeriği oluşturmanız, ses ile senkronize edilmiş resim yazıları veya alt yazılar eklemeniz, metinden konuşmaya anlatım oluşturmanız, sese duyarlı animasyon oluşturmanız (ritim senkronizasyonu, parlama, müzikle yönlendirilen darbe), animasyonlu metin vurgulama eklemeniz (işaretleyici taramalar, elle çizilmiş daireler, patlama çizgileri, karalama, eskiz) veya sahneler arasında geçişler eklemeniz (çapraz geçişler, silmeler, göstermeler, gölgelendirici geçişler) istendiğinde kullanın. Kompozisyon yazma, zamanlama, medya ve video prodüksiyon iş akışının tamamını kapsar. CLI komutları için (init, lint, önizleme, render, transscribe, tts) hyperframes-cli becerisine bakın.',
    examplePrompt: 'HyperFrames HTML\'de video kompozisyonları, animasyonlar, başlık kartları, katmanlar, altyazılar, seslendirmeler, sese duyarlı görseller ve sahne geçişleri oluşturun. Herhangi bir HTML tabanlı video içeriği oluşturmanız, ses ile senkronize edilmiş resim yazıları veya alt yazılar eklemeniz, metinden konuşmaya anlatım oluşturmanız, sese duyarlı animasyon oluşturmanız (ritim senkronizasyonu, parlama, müzikle yönlendirilen darbe), animasyonlu metin vurgulama eklemeniz (işaretleyici taramalar, elle çizilmiş daireler, patlama çizgileri, karalama, eskiz) veya sahneler arasında geçişler eklemeniz (çapraz geçişler, silmeler, göstermeler, gölgelendirici geçişler) istendiğinde kullanın. Kompozisyon yazma, zamanlama, medya ve video prodüksiyon iş akışının tamamını kapsar. CLI komutları için (init, lint, önizleme, render, transscribe, tts) hyperframes-cli becerisine bakın.',
  },
  'ib-pitch-book': {
    description: 'Stratejik alternatifler için yatırım bankacılığı sunum kitabı - ticaret kompozisyonları,\r\nemsal işlemler, futbol sahası değerlemesi, DCF duyarlılığı,\r\nstratejik seçenekler matrisi, süreç tavsiyesi. Uyarlanarak oluşturuldu\r\n`assets/template.html` yani IB\'ye özgü krom, açıklama bantları ve kaynak\r\nEtiketler korunur. Kurul / satış tarafı tartışma materyalleri için kullanın. değil\r\nVC bağış toplama destesi (bkz. html-ppt-pitch-deck). İş akışı uyarlandı\r\nAntropik finansal hizmetler Pitch Agent (Apache-2.0).',
    examplePrompt: 'Stratejik alternatifler için yatırım bankacılığı sunum kitabı - ticaret kompozisyonları,\r\nemsal işlemler, futbol sahası değerlemesi, DCF duyarlılığı,\r\nstratejik seçenekler matrisi, süreç tavsiyesi. Uyarlanarak oluşturuldu\r\n`assets/template.html` yani IB\'ye özgü krom, açıklama bantları ve kaynak\r\nEtiketler korunur. Kurul / satış tarafı tartışma materyalleri için kullanın. değil\r\nVC bağış toplama destesi (bkz. html-ppt-pitch-deck). İş akışı uyarlandı\r\nAntropik finansal hizmetler Pitch Agent (Apache-2.0).',
  },
  'image-enhancer': {
    description: 'Profesyonel sunumlar ve dokümantasyon için çözünürlüğü, keskinliği ve netliği artırarak görsel ve ekran görüntüsü kalitesini iyileştirin.',
    examplePrompt: 'Profesyonel sunumlar ve dokümantasyon için çözünürlüğü, keskinliği ve netliği artırarak görsel ve ekran görüntüsü kalitesini iyileştirin.',
  },
  'image-poster': {
    description: 'Posterler, önemli görseller ve editoryal çalışmalar için tek görsel oluşturma becerisi\r\nillüstrasyonlar. Varsayılan olarak gpt-image-2\'dir ancak sağlayıcıdan bağımsızdır —\r\naynı iş akışı, aktif aracılığıyla Flux, Imagen veya Midjourney\'i çalıştırır\r\nyukarı akış takımları. Çıktı, dosyaya kaydedilen bir veya daha fazla PNG/JPEG dosyasıdır.\r\nproje klasörü.',
    examplePrompt: 'Posterler, önemli görseller ve editoryal çalışmalar için tek görsel oluşturma becerisi\r\nillüstrasyonlar. Varsayılan olarak gpt-image-2\'dir ancak sağlayıcıdan bağımsızdır —\r\naynı iş akışı, aktif aracılığıyla Flux, Imagen veya Midjourney\'i çalıştırır\r\nyukarı akış takımları. Çıktı, dosyaya kaydedilen bir veya daha fazla PNG/JPEG dosyasıdır.\r\nproje klasörü.',
  },
  'image-to-code': {
    description: 'Codex için seçkin görselden koda web sitesi becerisi. Görsel olarak önemli web görevlerinde, önce tasarım görsel(ler)ini kendisi üretmeli, bunları derinlemesine analiz etmeli, ardından web sitesini bunlara olabildiğince yakın şekilde uygulamalıdır. Codex\'te, küçük sıkıştırılmış panolar yerine büyük, okunabilir, bölüme özgü görselleri tercih etmeli, eski görselleri kırpmak yerine bölümler veya detay görünümleri için sıfırdan bağımsız görseller üretmeli, tembel az üretimden kaçınmalı, kart-içinde-kart-içinde-kart arayüzünden kaçınmalı ve hero bölümünü küçük bir dizüstü bilgisayarda temiz, ferah, okunabilir ve görünür tutmalıdır.',
    examplePrompt: 'image-to-code\'u kullanın: önce görsel referanslar oluşturun veya analiz edin, ardından referans yönüne yakından uyan duyarlı bir web sitesi yapıtı uygulayın.',
  },
  'imagegen': {
    description: 'Proje varlıkları için OpenAI\'ın Image API\'sini kullanarak görseller oluşturun ve düzenleyin — arayüz taslakları, simgeler, illüstrasyonlar, sosyal kartlar ve görsel referanslar.',
    examplePrompt: 'Proje varlıkları için OpenAI\'ın Image API\'sini kullanarak görseller oluşturun ve düzenleyin — arayüz taslakları, simgeler, illüstrasyonlar, sosyal kartlar ve görsel referanslar.',
  },
  'imagegen-frontend-mobile': {
    description: 'Premium, uygulamaya özgü ekran konseptleri ve akışları oluşturmak için seçkin mobil uygulama görsel üretim becerisi. iOS, Android ve çapraz platform mobil ürünleri için tasarlanmıştır. Temiz hiyerarşi, rahatça okunabilir metin, güçlü çoklu ekran tutarlılığı, kontrollü renk paletleri, sıradan olmayan yaratıcı yön, dokulu yüzeyler, görsel öncülüğünde kompozisyon, zevkli özel ikonografi ve temiz telefon maketi çerçevelemeye öncelik verir. Varsayılan olarak ekranlar, ana odak uygulama içeriğinde kalırken görünür çerçeveli ince ve premium bir iPhone veya benzeri telefon maketi içinde gösterilmelidir. Bu beceri yalnızca görsel üretir. Kod yazmaz.',
    examplePrompt: 'Bu ürün özeti için premium mobil uygulama konsept kareleri oluştur; okunabilir, uygulamaya özgü hiyerarşi ve ekranlar arasında tutarlı bir görsel sistemle.',
  },
  'imagegen-frontend-web': {
    description: 'Premium, dönüşüm odaklı web sitesi tasarım referansları üretmek için seçkin ön uç görsel yönlendirme becerisi. KRİTİK ÇIKTI KURALI — HER BÖLÜM İÇİN AYRI BİR yatay görsel üretin. 8 bölümlü bir açılış sayfası 8 görsel üretir. Birden fazla bölümü asla tek bir görsele sıkıştırmayın. Kompozisyon çeşitliliğini (her zaman sol-metin / sağ-görsel değil), arka plan görseli özgürlüğünü, çeşitli CTA\'ları, çeşitli hero ölçeklerini (dev / orta / mini minimalist), anlatı konsept omurgasını, ikinci okuma anlarını ve tüm görseller boyunca tek tutarlı bir paleti zorunlu kılar. Geliştiricilerin veya kodlama modellerinin doğru şekilde yeniden oluşturabileceği açılış sayfaları, pazarlama siteleri ve ürün kompozisyonları için optimize edilmiştir.',
    examplePrompt: 'Her açılış sayfası bölümü için ayrı premium web sitesi referans görselleri üretin; tutarlı bir palet ve çeşitli kompozisyon koruyarak.',
  },
  'imagen': {
    description: 'Arayüz taslakları, simgeler, illüstrasyonlar ve görsel varlıklar için Google Gemini\'nin görsel üretim API\'sini kullanarak görseller oluşturun.',
    examplePrompt: 'Arayüz taslakları, simgeler, illüstrasyonlar ve görsel varlıklar için Google Gemini\'nin görsel üretim API\'sini kullanarak görseller oluşturun.',
  },
  'impeccable-design-polish': {
    description: 'Impeccable\'dan ilham alan takip eden tasarım rötuş becerisi. Bir web veya HTML yapıtı oluşturulduktan sonra sayfayı denetlemek, eleştirmek, rötuşlamak, canlandırmak, sağlamlaştırmak ve canlı/paylaşım geçişine hazırlamak için kullanın.',
    examplePrompt: 'Mevcut HTML yapıtında impeccable-design-polish kullanın: görsel hiyerarşiyi denetleyin, yapay zeka izlerini kaldırın, metni sıkılaştırın, ölçülü hareket ekleyin ve duyarlılık/erişilebilirlik sorunlarını sağlamlaştırın.',
  },
  'import-screenshot-to-prototype': {
    description: 'Kullanıcı bir ekran görüntüsü veya görsel referansı sağladığında ve bunun mantıklı bileşenler, düzen ve duyarlı davranışla düzenlenebilir bir Açık Tasarım prototipi olarak yeniden yapılandırılmasını istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı bir ekran görüntüsü veya görsel referansı sağladığında ve bunun mantıklı bileşenler, düzen ve duyarlı davranışla düzenlenebilir bir Açık Tasarım prototipi olarak yeniden yapılandırılmasını istediğinde bu eklentiyi kullanın.',
  },
  'industrial-brutalist-ui': {
    description: 'İsviçre tipografik baskısını askeri terminal estetiğiyle birleştiren ham mekanik arayüzler. Katı gridler, aşırı tipografi ölçek kontrastı, faydacı renk, analog bozulma efektleri. Gizliliği kaldırılmış teknik çizimler gibi hissettirmesi gereken veri yoğun panolar, portföyler veya editöryel siteler için.',
    examplePrompt: 'Katı gridler, taktiksel telemetri motifleri, güçlü tipografi ve mekanik hassasiyetle endüstriyel-brütalist bir arayüz oluştur.',
  },
  'innovation': {
    description: 'Kullanıcı, Instrument-Serif başlığı, sıvı cam gezinme/kartlar, çapraz geçişli tam ekran kahraman videosu ve kaydırmayla ortaya çıkan hakkında / öne çıkan video / felsefe / hizmetler bölümleri içeren birinci sınıf, koyu bir editoryal açılış sayfası istediğinde bu eklentiyi kullanın. \'İnovasyon açılış sayfası\', \'ajans açılış sayfası\', \'camlı koyu serif kahraman\', \'Asme şablonu\' veya kullanıcı İnovasyon / motionsites İnovasyon şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, Instrument-Serif başlığı, sıvı cam gezinme/kartlar, çapraz geçişli tam ekran kahraman videosu ve kaydırmayla ortaya çıkan hakkında / öne çıkan video / felsefe / hizmetler bölümleri içeren birinci sınıf, koyu bir editoryal açılış sayfası istediğinde bu eklentiyi kullanın. \'İnovasyon açılış sayfası\', \'ajans açılış sayfası\', \'camlı koyu serif kahraman\', \'Asme şablonu\' veya kullanıcı İnovasyon / motionsites İnovasyon şablonuna başvurduğunda çağrı yapın.',
  },
  'invoice': {
    description: 'Yazdırılabilir bir fatura sayfası — gönderen + alıcı bloğu, satır öğeleri tablosu,\r\nvergi dökümü, toplamlar ve ödeme talimatları. Özet olduğunda kullanın\r\n"fatura", "fatura", "fatura beyanı" veya "发票" ifadesinden bahsediyor.',
    examplePrompt: 'Yazdırılabilir bir fatura sayfası — gönderen + alıcı bloğu, satır öğeleri tablosu,\r\nvergi dökümü, toplamlar ve ödeme talimatları. Özet olduğunda kullanın\r\n"fatura", "fatura", "fatura beyanı" veya "发票" ifadesinden bahsediyor.',
  },
  'kami-deck': {
    description: '>\nKami (紙 / 纸) tasarım sisteminde baskı kalitesinde bir slayt destesi oluşturun —\r\nsıcak parşömen arka planı (veya kapak / bölüm slaytları için mürekkep mavisi),\r\ntek ağırlıkta serif, mürekkep mavisi vurgulu slayt başına ≤ %5, italik yok.\r\nYatay dergi kaydırma sayfalandırması (←/→ · tekerlek · kaydırma · ESC\r\ngenel bakış). Bağımsız bir HTML dosyası, ötesinde sıfır bağımlılık\r\nGoogle Yazı Tipleri.',
    examplePrompt: '>\nKami (紙 / 纸) tasarım sisteminde baskı kalitesinde bir slayt destesi oluşturun —\r\nsıcak parşömen arka planı (veya kapak / bölüm slaytları için mürekkep mavisi),\r\ntek ağırlıkta serif, mürekkep mavisi vurgulu slayt başına ≤ %5, italik yok.\r\nYatay dergi kaydırma sayfalandırması (←/→ · tekerlek · kaydırma · ESC\r\ngenel bakış). Bağımsız bir HTML dosyası, ötesinde sıfır bağımlılık\r\nGoogle Yazı Tipleri.',
  },
  'kami-landing': {
    description: '>\nBaskı kalitesinde tek sayfalık bir kami (紙 / 纸) belgesi üretin — sıcak\r\nparşömen kanvas, mürekkep mavisi vurgulu, tek ağırlıkta serif, italik yok,\r\nsoğuk griler yok. Çıktı profesyonel bir teknik inceleme gibi okunur veya\r\nstüdyo tek çağrı cihazı, bir uygulama kullanıcı arayüzü değil. Tasarım gereği çok dilli (TR ·\r\nzh-CN · ja). Bağımsız bir HTML dosyası, sıfır bağımlılık.',
    examplePrompt: '>\nBaskı kalitesinde tek sayfalık bir kami (紙 / 纸) belgesi üretin — sıcak\r\nparşömen kanvas, mürekkep mavisi vurgulu, tek ağırlıkta serif, italik yok,\r\nsoğuk griler yok. Çıktı profesyonel bir teknik inceleme gibi okunur veya\r\nstüdyo tek çağrı cihazı, bir uygulama kullanıcı arayüzü değil. Tasarım gereği çok dilli (TR ·\r\nzh-CN · ja). Bağımsız bir HTML dosyası, sıfır bağımlılık.',
  },
  'kanban-board': {
    description: 'Kanban / sütunlu görev panosu (Yapılacak / Devam Ediyor / İnceleniyor / Bitti),\r\nsürüklenebilir görünümlü kartlar, atanan avatarlar, kulvarlar ve üst filtre\r\nbar. Özette "kanban", "görev panosu", "sprint panosu" geçtiğinde kullanın.\r\n"trello", "看板".',
    examplePrompt: 'Kanban / sütunlu görev panosu (Yapılacak / Devam Ediyor / İnceleniyor / Bitti),\r\nsürüklenebilir görünümlü kartlar, atanan avatarlar, kulvarlar ve üst filtre\r\nbar. Özette "kanban", "görev panosu", "sprint panosu" geçtiğinde kullanın.\r\n"trello", "看板".',
  },
  'last30days': {
    description: 'Son 30 gündeki güncel topluluk ve sosyal trend araştırmaları. Ne zaman kullan\r\nÖzette insanların şu anda ne söylediği, son zamanlardaki görüşler ve topluluk sorgulanıyor\r\ntepkiler, sosyal kanıt, lansman tepkisi, trend taraması veya son 30 günün bağlamı.',
    examplePrompt: 'Son 30 gündeki güncel topluluk ve sosyal trend araştırmaları. Ne zaman kullan\r\nÖzette insanların şu anda ne söylediği, son zamanlardaki görüşler ve topluluk sorgulanıyor\r\ntepkiler, sosyal kanıt, lansman tepkisi, trend taraması veya son 30 günün bağlamı.',
  },
  'layered-depth': {
    description: 'Kullanıcı sinematik, katmanlı paralaks mimari stüdyo açılış sayfası (marka \'Qelora\') istediğinde bu eklentiyi kullanın: tam ekran arka plan videosu, paralaks heykel levhasının arkasında dev bir merkez marka markası, animasyonlu bir kuş video durumu makinesi, buzlu cam navigasyon hapları ve alt bilgi panelleri ve ortalanmış bir editoryal başlığa sahip ikinci bir tam görüntü alanı video bölümü. \'Katmanlı derinlik\', \'mimari stüdyo girişi\', \'videolu paralaks kahraman\', \'Qelora\' veya kullanıcı Katmanlı Derinlik hareket siteleri şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı sinematik, katmanlı paralaks mimari stüdyo açılış sayfası (marka \'Qelora\') istediğinde bu eklentiyi kullanın: tam ekran arka plan videosu, paralaks heykel levhasının arkasında dev bir merkez marka markası, animasyonlu bir kuş video durumu makinesi, buzlu cam navigasyon hapları ve alt bilgi panelleri ve ortalanmış bir editoryal başlığa sahip ikinci bir tam görüntü alanı video bölümü. \'Katmanlı derinlik\', \'mimari stüdyo girişi\', \'videolu paralaks kahraman\', \'Qelora\' veya kullanıcı Katmanlı Derinlik hareket siteleri şablonuna başvurduğunda çağrı yapın.',
  },
  'liquid-glass-agency': {
    description: 'Kullanıcı bir AI web tasarım ajansı için karanlık, lüks tek sayfalık bir açılış istediğinde bu eklentiyi kullanın: sinematik video arka planları, editoryal Instrument Serif italik başlıkları, sıvı cam (cammorfizm) kartları ve CTA\'lar, BlurText kelime kelime gösterimleri ve bölüm bölüm hikaye anlatımı. \'Sıvı cam ajansı\', \'cam açılış sayfası\', \'AI ajansı sitesi\' için veya kullanıcı Liquid Glass Agency şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı bir AI web tasarım ajansı için karanlık, lüks tek sayfalık bir açılış istediğinde bu eklentiyi kullanın: sinematik video arka planları, editoryal Instrument Serif italik başlıkları, sıvı cam (cammorfizm) kartları ve CTA\'lar, BlurText kelime kelime gösterimleri ve bölüm bölüm hikaye anlatımı. \'Sıvı cam ajansı\', \'cam açılış sayfası\', \'AI ajansı sitesi\' için veya kullanıcı Liquid Glass Agency şablonuna başvurduğunda çağrı yapın.',
  },
  'live-artifact': {
    description: 'Bağlayıcı veya yerel verilerle sağlanır, bağlanır ve denetlenebilir Açık Tasarım yapıları oluşturulur.\r\nKullanıcının canlı panoları, güncelleme raporları, ayrıntılı görünümler veya yeniden kullanılabilir veri destekli yapılar istenilende tetiklenir.',
    examplePrompt: 'Bağlayıcı veya yerel verilerle sağlanır, bağlanır ve denetlenebilir Açık Tasarım yapıları oluşturulur.\r\nKullanıcının canlı panoları, güncelleme raporları, ayrıntılı görünümler veya yeniden kullanılabilir veri destekli yapılar istenilende tetiklenir.',
  },
  'live-dashboard': {
    description: 'Canlı Yapı olarak işlenen Notion tarzı ekip kontrol paneli. Tek sayfalık,\r\nKPI\'lar, 7 günlük mini grafik, gerçek zamanlı\r\netkinlik akışı ve bağlantılı veritabanı görev tablosu - Notion\'a kablolu olarak bağlanır\r\nComposio bağlayıcı kataloğu. Talep üzerine ve yapıt ne zaman yenilenir\r\naçıldı. Hiçbir bağlayıcı bağlı olmadığında tohumlanmış sahte verilere geri döner,\r\nbu nedenle çevrimdışı / ekran görüntülerinde / seçici önizlemesinde çalışır.',
    examplePrompt: 'Canlı Yapı olarak işlenen Notion tarzı ekip kontrol paneli. Tek sayfalık,\r\nKPI\'lar, 7 günlük mini grafik, gerçek zamanlı\r\netkinlik akışı ve bağlantılı veritabanı görev tablosu - Notion\'a kablolu olarak bağlanır\r\nComposio bağlayıcı kataloğu. Talep üzerine ve yapıt ne zaman yenilenir\r\naçıldı. Hiçbir bağlayıcı bağlı olmadığında tohumlanmış sahte verilere geri döner,\r\nbu nedenle çevrimdışı / ekran görüntülerinde / seçici önizlemesinde çalışır.',
  },
  'login-flow': {
    description: 'Mobil giriş ve kimlik doğrulama akışı ekranları',
    examplePrompt: 'Mobil giriş ve kimlik doğrulama akışı ekranları',
  },
  'luxury-botanical': {
    description: 'Kullanıcı sinematik bir lüks koku / botanik açılış sayfası istediğinde bu eklentiyi kullanın: tam ekran bir video kahramanı, kaydırmayla yönlendirilen eliptik bir klip yolu gösterimi, bir odak noktasında büyüyen parfüm şişelerinden oluşan yörüngeli bir atlıkarınca, artı bir \'Koleksiyonda kalın\' haber bülteni bölümü ve sıcak bir parşömen altbilgisi. \'Lüks botanik\', \'parfüm açılış sayfası\', \'koku kahramanı\', \'yörünge atlıkarıncaya\' veya kullanıcı Bentley — Beyond The Collection şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı sinematik bir lüks koku / botanik açılış sayfası istediğinde bu eklentiyi kullanın: tam ekran bir video kahramanı, kaydırmayla yönlendirilen eliptik bir klip yolu gösterimi, bir odak noktasında büyüyen parfüm şişelerinden oluşan yörüngeli bir atlıkarınca, artı bir \'Koleksiyonda kalın\' haber bülteni bölümü ve sıcak bir parşömen altbilgisi. \'Lüks botanik\', \'parfüm açılış sayfası\', \'koku kahramanı\', \'yörünge atlıkarıncaya\' veya kullanıcı Bentley — Beyond The Collection şablonuna başvurduğunda çağrı yapın.',
  },
  'magazine-poster': {
    description: 'Editoryal tarzda bir poster — gazete kağıdı, tarih çizgisi, büyük boy serif\r\nÜzeri çizili kelime ve italik vurgulu, 2 sütunlu gövdeli başlık\r\nblok ve açıklamalı alıntı başlıkları içeren 6 numaralı bölüm.\r\nPazar günü yayınlanan tam sayfa bir makale veya düşünceli bir lansman posteri gibi okunur.\r\nÖzette "dergi posteri", "editör posteri" sorulduğunda kullanın.\r\n"gazete kağıdı", "makale düzeni" veya "manifesto".',
    examplePrompt: 'Editoryal tarzda bir poster — gazete kağıdı, tarih çizgisi, büyük boy serif\r\nÜzeri çizili kelime ve italik vurgulu, 2 sütunlu gövdeli başlık\r\nblok ve açıklamalı alıntı başlıkları içeren 6 numaralı bölüm.\r\nPazar günü yayınlanan tam sayfa bir makale veya düşünceli bir lansman posteri gibi okunur.\r\nÖzette "dergi posteri", "editör posteri" sorulduğunda kullanın.\r\n"gazete kağıdı", "makale düzeni" veya "manifesto".',
  },
  'magazine-web-ppt': {
    description: 'WebGL akıcı arka planı, serif başlıkları + sans-serif gövdesi, hareket bölücüleri, büyük rakamlı veri sayfaları, görüntü ızgaraları ve daha fazla şablonla "editör dergisi × elektronik mürekkep" tarzı yatay kaydırmalı web desteği (tek bir HTML dosyası) oluşturur. Kullanıcı konuşma / paylaşma / başlatma tarzı bir web sunumu yapmak istediğinde veya "dergi tarzı PPT", "yatay kaydırmalı sunum", "editör dergisi" veya "e-mürekkep sunumu"ndan bahsettiğinde kullanın.',
    examplePrompt: 'WebGL akıcı arka planı, serif başlıkları + sans-serif gövdesi, hareket bölücüleri, büyük rakamlı veri sayfaları, görüntü ızgaraları ve daha fazla şablonla "editör dergisi × elektronik mürekkep" tarzı yatay kaydırmalı web desteği (tek bir HTML dosyası) oluşturur. Kullanıcı konuşma / paylaşma / başlatma tarzı bir web sunumu yapmak istediğinde veya "dergi tarzı PPT", "yatay kaydırmalı sunum", "editör dergisi" veya "e-mürekkep sunumu"ndan bahsettiğinde kullanın.',
  },
  'marketing-psychology': {
    description: 'Metin ve tasarıma psikolojik ilkeleri ve davranış bilimini uygulayın. Kancaları, çerçevelemeyi ve fiyatlandırma sunumunu sıkılaştırmak için kullanışlıdır.',
    examplePrompt: 'Metin ve tasarıma psikolojik ilkeleri ve davranış bilimini uygulayın.',
  },
  'meeting-notes': {
    description: 'Toplantı notları sayfası — katılımcıların yer aldığı başlık çubuğu, gündem kontrol listesi, kararlar\r\nblok, sahipleri + tarihleri içeren işlem öğeleri tablosu ve bir "sonraki toplantı" altbilgisi.\r\nÖzette "toplantı notları", "tutanaklar", "1:1 notlar" ifadeleri yer aldığında kullanın.\r\n"tüm ellerin özeti" veya "会议纪要".',
    examplePrompt: 'Toplantı notları sayfası — katılımcıların yer aldığı başlık çubuğu, gündem kontrol listesi, kararlar\r\nblok, sahipleri + tarihleri içeren işlem öğeleri tablosu ve bir "sonraki toplantı" altbilgisi.\r\nÖzette "toplantı notları", "tutanaklar", "1:1 notlar" ifadeleri yer aldığında kullanın.\r\n"tüm ellerin özeti" veya "会议纪要".',
  },
  'mindloop-landing': {
    description: 'Kullanıcı karanlık, saf monokrom bir haber bülteni / içerik platformu açılış sayfası (Mindloop) istediğinde bu eklentiyi kullanın: tam ekran video kahramanı, Instrument-Serif italik vurgu sözcükleri, sıvı cam kontroller, kaydırmayla yönlendirilen kelime kelime görev gösterimi ve bir HLS video CTA. \'Mindloop açılış sayfası\', \'siyah monokrom haber bülteni açılış sayfası\', \'video kahramanı içerik platformu\' veya kullanıcı Mindloop şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı karanlık, saf monokrom bir haber bülteni / içerik platformu açılış sayfası (Mindloop) istediğinde bu eklentiyi kullanın: tam ekran video kahramanı, Instrument-Serif italik vurgu sözcükleri, sıvı cam kontroller, kaydırmayla yönlendirilen kelime kelime görev gösterimi ve bir HLS video CTA. \'Mindloop açılış sayfası\', \'siyah monokrom haber bülteni açılış sayfası\', \'video kahramanı içerik platformu\' veya kullanıcı Mindloop şablonuna başvurduğunda çağrı yapın.',
  },
  'minimalist-ui': {
    description: 'Temiz editoryal tarzda arayüzler. Sıcak tek renkli palet, tipografik kontrast, düz bento ızgaraları, soluk pasteller. Gradyan yok, ağır gölge yok.',
    examplePrompt: 'Sıcak tek renk, net tipografi, düz yapı ve dekoratif fazlalık olmadan minimalist editoryal bir ürün arayüzü tasarlayın.',
  },
  'minimax-docx': {
    description: 'OpenXML SDK kullanarak profesyonel DOCX belge oluşturma ve düzenleme. Markalı raporlar, cilalı teklifler ve şablon tabanlı yazım için kullanışlıdır.',
    examplePrompt: 'OpenXML SDK kullanarak profesyonel DOCX belge oluşturma ve düzenleme.',
  },
  'minimax-pdf': {
    description: 'Token tabanlı bir tasarım sistemi ve 15 kapak stiliyle PDF\'leri oluşturun, doldurun ve yeniden biçimlendirin. Markalı PDF\'ler, e-kılavuzlar ve raporlar için kullanışlıdır.',
    examplePrompt: 'Token tabanlı bir tasarım sistemi ve 15 kapak stiliyle PDF\'leri oluşturun, doldurun ve yeniden biçimlendirin.',
  },
  'mobile-app': {
    description: 'Piksel doğruluğunda bir iPhone 15 Pro çerçevesi içinde oluşturulan bir mobil uygulama ekranı\r\nsayfada. \'assets/template.html\' tohumunu kopyalayıp yapıştırarak oluşturulmuştur\r\n\'references/layouts.md\'den bir ekran modeli. Özet sorulduğunda kullanın\r\n"mobil uygulama", "iOS uygulaması", "Android uygulaması", "telefon ekranı" veya "uygulama kullanıcı arayüzü" için.',
    examplePrompt: 'Piksel doğruluğunda bir iPhone 15 Pro çerçevesi içinde oluşturulan bir mobil uygulama ekranı\r\nsayfada. \'assets/template.html\' tohumunu kopyalayıp yapıştırarak oluşturulmuştur\r\n\'references/layouts.md\'den bir ekran modeli. Özet sorulduğunda kullanın\r\n"mobil uygulama", "iOS uygulaması", "Android uygulaması", "telefon ekranı" veya "uygulama kullanıcı arayüzü" için.',
  },
  'mobile-onboarding': {
    description: 'Üç telefon çerçevesi olarak işlenen çok ekranlı mobil katılım akışı\r\nyan yana - sıçrama, değer desteği, oturum açma. Durum çubuğu, noktaları hızlıca kaydırın,\r\nbirincil CTA. Özette "mobil katılım", "iOS" ifadeleri geçtiğinde kullanın\r\nilk katılım", "telefon kaydı" veya "移动端引导".',
    examplePrompt: 'Üç telefon çerçevesi olarak işlenen çok ekranlı mobil katılım akışı\r\nyan yana - sıçrama, değer desteği, oturum açma. Durum çubuğu, noktaları hızlıca kaydırın,\r\nbirincil CTA. Özette "mobil katılım", "iOS" ifadeleri geçtiğinde kullanın\r\nilk katılım", "telefon kaydı" veya "移动端引导".',
  },
  'mockup-device-3d': {
    description: 'Ekranlara gömülü gerçek HTML, cam-mercek kırılması ve 360 derece döner tabla kompozisyonuyla statik iPhone ve MacBook 3D tarzı vitrin.',
    examplePrompt: 'İçeriğimi, ekranlara gömülü gerçek HTML içeren statik bir iPhone ve MacBook 3D tarzı vitrine dönüştürmek için Device 3D Showcase şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'motion-frames': {
    description: 'Döngüsel CSS animasyonlarına sahip tek kareli bir hareket tasarımı kompozisyonu —\r\ndönen tip halka, hareketli küre, zamanlayıcı, paralaks etiketleri.\r\nDoğrudan HyperFrames\'e verebileceğiniz bir kahraman video posteri olarak işlenir veya\r\nherhangi bir anahtar kare tabanlı dışa aktarıcı. Özette "hareket tasarımı" istendiğinde kullanın,\r\n"animasyonlu kahraman", "döngü", "video posteri", "başlık kartı" veya çiftler Açık\r\nKinetik dışa aktarma için HyperFrames\'li Claude Design.',
    examplePrompt: 'Döngüsel CSS animasyonlarına sahip tek kareli bir hareket tasarımı kompozisyonu —\r\ndönen tip halka, hareketli küre, zamanlayıcı, paralaks etiketleri.\r\nDoğrudan HyperFrames\'e verebileceğiniz bir kahraman video posteri olarak işlenir veya\r\nherhangi bir anahtar kare tabanlı dışa aktarıcı. Özette "hareket tasarımı" istendiğinde kullanın,\r\n"animasyonlu kahraman", "döngü", "video posteri", "başlık kartı" veya çiftler Açık\r\nKinetik dışa aktarma için HyperFrames\'li Claude Design.',
  },
  'mythic-naturecore': {
    description: 'Kullanıcı sinematik mitik-doğal bir açılış sayfası istediğinde bu eklentiyi kullanın - \'Reverie\' şablonu: aynalı açılış perdeleri, katmanlı bir dünya arka planı, fare paralaks 3D derinliği ve zarif bir Viaoda-Libre/Imprima serif+sans eşleştirmesi ile kaydırma bağlantılı bir portal üzerinden yakınlaştırma kahramanı. \'Naturecore iniş\', \'portal kaydırma sayfası\', \'Reverie\', \'sinematik paralaks kahramanı\' için veya kullanıcı Mythic Naturecore şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı sinematik mitik-doğal bir açılış sayfası istediğinde bu eklentiyi kullanın - \'Reverie\' şablonu: aynalı açılış perdeleri, katmanlı bir dünya arka planı, fare paralaks 3D derinliği ve zarif bir Viaoda-Libre/Imprima serif+sans eşleştirmesi ile kaydırma bağlantılı bir portal üzerinden yakınlaştırma kahramanı. \'Naturecore iniş\', \'portal kaydırma sayfası\', \'Reverie\', \'sinematik paralaks kahramanı\' için veya kullanıcı Mythic Naturecore şablonuna başvurduğunda çağrı yapın.',
  },
  'nanobanana-ppt': {
    description: 'NanoBanana yığını aracılığıyla belge analizi ve stilize edilmiş görsellerle yapay zeka destekli PPT üretimi. Görsel üretimini yapılandırılmış deste çıktısıyla birleştirir.',
    examplePrompt: 'NanoBanana yığını aracılığıyla belge analizi ve stilize edilmiş görsellerle yapay zeka destekli PPT üretimi.',
  },
  'nimbus-grid': {
    description: 'Kullanıcı, güvenli bir bulut depolama kapasiteli ürün için premium, koyu, sıcak altın tek sayfalı bir pazarlama sitesi istediğinde bu eklentiyi kullanın: canlı konsol kartı ve daktiloya sahip tam görüntü alanlı bir gölgelendirici kahramanı, kaydırmayla çalışan yapışkan bir platform akordeonu, kaydırmalı geçişli fiyatlandırma çubuğu alanı, API pencereli güvenlik kartları + ikili harita, 3 boyutlu eğilebilir konsol vitrini ve tıklatarak patlatılabilen işlem küpü. \'Nimbus Grid\', \'bulut depolama açılış sayfası\', \'gölgelendirici kahraman pazarlama sitesi\', \'kaydırma akordeon girişi\' veya kullanıcı Nimbus Grid şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, güvenli bir bulut depolama kapasiteli ürün için premium, koyu, sıcak altın tek sayfalı bir pazarlama sitesi istediğinde bu eklentiyi kullanın: canlı konsol kartı ve daktiloya sahip tam görüntü alanlı bir gölgelendirici kahramanı, kaydırmayla çalışan yapışkan bir platform akordeonu, kaydırmalı geçişli fiyatlandırma çubuğu alanı, API pencereli güvenlik kartları + ikili harita, 3 boyutlu eğilebilir konsol vitrini ve tıklatarak patlatılabilen işlem küpü. \'Nimbus Grid\', \'bulut depolama açılış sayfası\', \'gölgelendirici kahraman pazarlama sitesi\', \'kaydırma akordeon girişi\' veya kullanıcı Nimbus Grid şablonuna başvurduğunda çağrı yapın.',
  },
  'od-code-migration': {
    description: 'Kod taşıma görevi için varsayılan referans ardışık düzeniKind — kod içe aktarma → tasarım-çıkarma → belirteç haritası → yeniden yazma planı → yama düzenleme ↔ derleme-test geliştirme → fark-inceleme → aktarma.',
    examplePrompt: 'Kod taşıma görevi için varsayılan referans ardışık düzeniKind — kod içe aktarma → tasarım-çıkarma → belirteç haritası → yeniden yazma planı → yama düzenleme ↔ derleme-test geliştirme → fark-inceleme → aktarma.',
  },
  'od-contribute': {
    description: 'Açık Tasarım (nexu-io/open-design) için tek tıklamayla katkı akışı — kodlayıcı olmayanlar için bile. Dört karttan birini seçin (OD ile oluşturduğunuz bir Beceri veya Tasarım Sistemini gönderin; belgeleri çevirin; bir yazım hatasını düzeltin / bir blog yazın; bir hatayı bildirin), temsilci doğrular ve sizin için bir Halkla İlişkiler (veya sorun) açar. Tetikleyici kelimeler açık tasarıma katkıda bulunur, OD becerilerimi sunar, OD tasarım sistemimi gönderir, OD belgelerini tercüme eder, bir OD hatasını bildirir, od-katkıda bulunur.\n- Bash\r\n- Oku\r\n- Yaz\r\n- Düzenle\r\n- Kullanıcı Sorusunu Sor\r\n- Görev Oluşturma\r\n- Görev Güncelleme\r\n- WebFetch',
    examplePrompt: 'Açık Tasarım (nexu-io/open-design) için tek tıklamayla katkı akışı — kodlayıcı olmayanlar için bile. Dört karttan birini seçin (OD ile oluşturduğunuz bir Beceri veya Tasarım Sistemini gönderin; belgeleri çevirin; bir yazım hatasını düzeltin / bir blog yazın; bir hatayı bildirin), temsilci doğrular ve sizin için bir Halkla İlişkiler (veya sorun) açar. Tetikleyici kelimeler açık tasarıma katkıda bulunur, OD becerilerimi sunar, OD tasarım sistemimi gönderir, OD belgelerini tercüme eder, bir OD hatasını bildirir, od-katkıda bulunur.\n- Bash\r\n- Oku\r\n- Yaz\r\n- Düzenle\r\n- Kullanıcı Sorusunu Sor\r\n- Görev Oluşturma\r\n- Görev Güncelleme\r\n- WebFetch',
  },
  'od-default': {
    description: 'Serbest biçimli Giriş istemleri için gizli geri dönüş senaryosu. Önce görev türünü sorun, ardından eşleşen Açık Tasarım akışına devam edin.',
    examplePrompt: 'Serbest biçimli Giriş istemleri için gizli geri dönüş senaryosu. Önce görev türünü sorun, ardından eşleşen Açık Tasarım akışına devam edin.',
  },
  'od-figma-migration': {
    description: 'Figma-migration göreviKind için varsayılan referans ardışık düzeni — figma-extract → token-map → created → critique.',
    examplePrompt: 'Figma-migration göreviKind için varsayılan referans ardışık düzeni — figma-extract → token-map → created → critique.',
  },
  'od-media-generation': {
    description: 'Görüntü, video ve ses projeleri için varsayılan referans hattı - proje türüne bağlı olarak medya-görüntü / medya-video / medya-ses atomları boyunca yönlendirir, çıktıyı canlı bir yapıt içinde sarar ve puan birleşene kadar eleştiri tiyatrosunda geliştirilir.',
    examplePrompt: 'Görüntü, video ve ses projeleri için varsayılan referans hattı - proje türüne bağlı olarak medya-görüntü / medya-video / medya-ses atomları boyunca yönlendirir, çıktıyı canlı bir yapıt içinde sarar ve puan birleşene kadar eleştiri tiyatrosunda geliştirilir.',
  },
  'od-new-generation': {
    description: 'Yeni nesil görev türü için varsayılan referans hattı — keşif → planla → oluştur → eleştiri tiyatrosu geliştiricisiyle eleştiri.',
    examplePrompt: 'Yeni nesil görev türü için varsayılan referans hattı — keşif → planla → oluştur → eleştiri tiyatrosu geliştiricisiyle eleştiri.',
  },
  'od-plugin-authoring': {
    description: 'Eklentilerim\'e yüklenebilecek bir Açık Tasarım eklenti klasörü oluşturmaya yönelik kılavuzlu senaryo.',
    examplePrompt: 'Eklentilerim\'e yüklenebilecek bir Açık Tasarım eklenti klasörü oluşturmaya yönelik kılavuzlu senaryo.',
  },
  'od-plugin-contribute-open-design': {
    description: 'gh CLI\'yi kullanarak Açık Tasarım topluluk kataloğuna yerel bir Açık Tasarım eklentisi ekleyerek bir çekme isteği açın.',
    examplePrompt: 'gh CLI\'yi kullanarak Açık Tasarım topluluk kataloğuna yerel bir Açık Tasarım eklentisi ekleyerek bir çekme isteği açın.',
  },
  'od-plugin-publish-github': {
    description: 'gh CLI\'yi kullanarak yeni bir genel GitHub deposunda yerel bir Açık Tasarım eklentisi yayınlayın.',
    examplePrompt: 'gh CLI\'yi kullanarak yeni bir genel GitHub deposunda yerel bir Açık Tasarım eklentisi yayınlayın.',
  },
  'od-share-to-community': {
    description: 'Kullanıcının yeni bitirdiği çalışmayı, proje dosyalarının zaten yanıtladığı alanları sormadan bir Açık Tasarım eklentisi olarak paketleyin, ardından mevcut Eklentilerime Ekle / Açık Tasarım-PR düğmelerini yüzeye çıkarın.',
    examplePrompt: 'Kullanıcının yeni bitirdiği çalışmayı, proje dosyalarının zaten yanıtladığı alanları sormadan bir Açık Tasarım eklentisi olarak paketleyin, ardından mevcut Eklentilerime Ekle / Açık Tasarım-PR düğmelerini yüzeye çıkarın.',
  },
  'od-tune-collab': {
    description: 'Ayarlama-ortaklaştırma görevi Tür için varsayılan referans ardışık düzeni — bir yön seçin, mevcut yapıtı yamalayın, eleştirin ve devredin.',
    examplePrompt: 'Ayarlama-ortaklaştırma görevi Tür için varsayılan referans ardışık düzeni — bir yön seçin, mevcut yapıtı yamalayın, eleştirin ve devredin.',
  },
  'open-design-landing': {
    description: '>\nBirinci sınıf, tek sayfalık bir editoryal açılış sitesi oluşturun\r\nAtelier Zero görsel dili (Monocle / Apartamento / Études editoryal)\r\nkolaj) — Open Design\'ın kendi pazarlaması için kullandığı estetiğin aynısı\r\nyüzey. Temsilci, bir marka özetinden yazılan bir "inputs.json" dosyasını doldurur,\r\nisteğe bağlı olarak gpt-image-2 yoluyla 16 kolaj varlığı oluşturur ve ardından\r\nkendi kendine yeten bir HTML dosyası yayan saf işlevli besteci; bir\r\nayrı bir yol, Astro pazarlama sitesini \'uygulamalar/açılış sayfası/\' içinde yansıtabilir.\r\nAçılan kaydırma-ortaya çıkarma hareketi ve\r\nBoşluk payı tarzı yapışkan navigasyon otomatik olarak bağlanır.',
    examplePrompt: '>\nBirinci sınıf, tek sayfalık bir editoryal açılış sitesi oluşturun\r\nAtelier Zero görsel dili (Monocle / Apartamento / Études editoryal)\r\nkolaj) — Open Design\'ın kendi pazarlaması için kullandığı estetiğin aynısı\r\nyüzey. Temsilci, bir marka özetinden yazılan bir "inputs.json" dosyasını doldurur,\r\nisteğe bağlı olarak gpt-image-2 yoluyla 16 kolaj varlığı oluşturur ve ardından\r\nkendi kendine yeten bir HTML dosyası yayan saf işlevli besteci; bir\r\nayrı bir yol, Astro pazarlama sitesini \'uygulamalar/açılış sayfası/\' içinde yansıtabilir.\r\nAçılan kaydırma-ortaya çıkarma hareketi ve\r\nBoşluk payı tarzı yapışkan navigasyon otomatik olarak bağlanır.',
  },
  'open-design-landing-deck': {
    description: '>\nAtelier Zero görsel dilinde tek dosyalı bir slayt destesi oluşturun\r\n(sıcak kağıt arka planı, italik serif vurgu aralıkları, mercan sonlandırma\r\nnoktalar, gerçeküstü kolaj plakaları) — Open Design\'ın marka deste tarifi.\r\nDestede **yatay dergi stili kaydırmalı sayfalandırma** (←/→,\r\ntekerlek, kaydırma), marka işaretli ve slaytlı her slaytta krom şerit\r\nsayacı, bir ESC genel bakış kılavuzu, bir mercan ilerleme çubuğu ve miras\r\nkardeşten standart stil sayfası + 16 yuvalı resim kitaplığı\r\n\'açık tasarım iniş\' becerisi.',
    examplePrompt: '>\nAtelier Zero görsel dilinde tek dosyalı bir slayt destesi oluşturun\r\n(sıcak kağıt arka planı, italik serif vurgu aralıkları, mercan sonlandırma\r\nnoktalar, gerçeküstü kolaj plakaları) — Open Design\'ın marka deste tarifi.\r\nDestede **yatay dergi stili kaydırmalı sayfalandırma** (←/→,\r\ntekerlek, kaydırma), marka işaretli ve slaytlı her slaytta krom şerit\r\nsayacı, bir ESC genel bakış kılavuzu, bir mercan ilerleme çubuğu ve miras\r\nkardeşten standart stil sayfası + 16 yuvalı resim kitaplığı\r\n\'açık tasarım iniş\' becerisi.',
  },
  'orbis-nft': {
    description: 'Kullanıcı, tam ekran CloudFront video arka planlarına, sıvı cam kullanıcı arayüzüne, Anton + Condiment yazı tiplerine ve neon yeşili vurguya sahip karanlık, uzay temalı bir NFT koleksiyonu açılış sayfası ("Orbis.Nft\\") istediğinde bu eklentiyi kullanın. \'NFT açılış sayfası\', \'uzay NFT sitesi\', \'kripto toplama sayfası\' veya kullanıcı Orbis NFT şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, tam ekran CloudFront video arka planlarına, sıvı cam kullanıcı arayüzüne, Anton + Condiment yazı tiplerine ve neon yeşili vurguya sahip karanlık, uzay temalı bir NFT koleksiyonu açılış sayfası ("Orbis.Nft\\") istediğinde bu eklentiyi kullanın. \'NFT açılış sayfası\', \'uzay NFT sitesi\', \'kripto toplama sayfası\' veya kullanıcı Orbis NFT şablonuna başvurduğunda çağrı yapın.',
  },
  'orbit-general': {
    description: 'Open Orbit brifing becerisi — Kullanıcının iki veya daha fazla bağlı bağlayıcılığı olduğunda Orbit boru hattı\'ı tarafından seçilir. Kimliği doğrulanmış her bağlayıcıdan (GitHub, Linear, Notion, Slack, 飞书, Takvim, Gmail, Drive, Sentry, Vercel, …) son 24 saatlik aktivite çeker ve "Tasarımlarım"ın üstünde tek bir uyarlanabilir bento-ızgara paneli oluşturulur. Her düzenleyici modülü, döndürme veri yapısına bağlı olarak kendi kullanıcı birimi listesi (liste, avatar yığını, durum bütünlüğü, ısı haritaları, dosya bileşeni, uyarı kartı,…) seçilir, böylece Orbit\'in çıkarılabilir ekosistemi büyütülerek büyütülür. Bu beceri manuel olarak tetiklenmeli — geliştiricinin canlı uyarlama sistemlerine karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
    examplePrompt: 'Open Orbit brifing becerisi — Kullanıcının iki veya daha fazla bağlı bağlayıcılığı olduğunda Orbit boru hattı\'ı tarafından seçilir. Kimliği doğrulanmış her bağlayıcıdan (GitHub, Linear, Notion, Slack, 飞书, Takvim, Gmail, Drive, Sentry, Vercel, …) son 24 saatlik aktivite çeker ve "Tasarımlarım"ın üstünde tek bir uyarlanabilir bento-ızgara paneli oluşturulur. Her düzenleyici modülü, döndürme veri yapısına bağlı olarak kendi kullanıcı birimi listesi (liste, avatar yığını, durum bütünlüğü, ısı haritaları, dosya bileşeni, uyarı kartı,…) seçilir, böylece Orbit\'in çıkarılabilir ekosistemi büyütülerek büyütülür. Bu beceri manuel olarak tetiklenmeli — geliştiricinin canlı uyarlama sistemlerine karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
  },
  'orbit-github': {
    description: 'Open Orbit brifing becerisi — GitHub kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe GitHub ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış GitHub bağlantısından son 24 saatlik PR\'leri, inceleme aralıkları, sorunları, CI geliştirme ve kopmaları çeker ve bunları GitHub\'ın yerel Bildirimleri + PR farkı görsel dilini gösteren bir düzende sunar. Bu beceri manuel olarak tetiklenmeli — canlı GitHub sistemleri, Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
    examplePrompt: 'Open Orbit brifing becerisi — GitHub kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe GitHub ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış GitHub bağlantısından son 24 saatlik PR\'leri, inceleme aralıkları, sorunları, CI geliştirme ve kopmaları çeker ve bunları GitHub\'ın yerel Bildirimleri + PR farkı görsel dilini gösteren bir düzende sunar. Bu beceri manuel olarak tetiklenmeli — canlı GitHub sistemleri, Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
  },
  'orbit-gmail': {
    description: 'Open Orbit brifing becerisi — Gmail kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Gmail ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Gmail bağlantısından son 24 saatlik gelen kutuda (yani beklenenler, bahsetmeler, cc, otomatik olarak kategorilere ayrılmış toplu e-postalar) çekilir ve özet Gmail\'in okuma görünümünde yer alan bir Orbit Günlük Özeti e-postası olarak sunulur. Bu beceri manuel olarak tetiklenmeli — canlı Gmail sistemlerine karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
    examplePrompt: 'Open Orbit brifing becerisi — Gmail kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Gmail ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Gmail bağlantısından son 24 saatlik gelen kutuda (yani beklenenler, bahsetmeler, cc, otomatik olarak kategorilere ayrılmış toplu e-postalar) çekilir ve özet Gmail\'in okuma görünümünde yer alan bir Orbit Günlük Özeti e-postası olarak sunulur. Bu beceri manuel olarak tetiklenmeli — canlı Gmail sistemlerine karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
  },
  'orbit-linear': {
    description: 'Open Orbit brifing becerisi — Linear kullanıcının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Linear ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Linear bağlantısından son 24 saatlik sorun hareketlerini, durum çalışmalarını, atamaları ve döngü ilerlemelerini çeker ve özet Linear\'ın yerel Gelen Kutusu + geçiş ilerlemesini görsel olarak sunar. Bu beceri manuel olarak tetiklenmeli — canlı Linear sistemlere karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
    examplePrompt: 'Open Orbit brifing becerisi — Linear kullanıcının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Linear ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Linear bağlantısından son 24 saatlik sorun hareketlerini, durum çalışmalarını, atamaları ve döngü ilerlemelerini çeker ve özet Linear\'ın yerel Gelen Kutusu + geçiş ilerlemesini görsel olarak sunar. Bu beceri manuel olarak tetiklenmeli — canlı Linear sistemlere karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
  },
  'orbit-notion': {
    description: 'Open Orbit brifing becerisi — Notion kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Notion ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Notion bağlantısından son 24 saatlik belge düzenlemelerini, yorumları, konuşmaları ve veri tabanı satır verilerini çeker ve özet yerel bir Notion sayfası (açıklama kutusu / açılan kutu / veri tabanı tabloları temel sistemleri) olarak sunar. Bu beceri manuel olarak tetiklenmeli — canlı Notion sistemleri karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
    examplePrompt: 'Open Orbit brifing becerisi — Notion kullanıcısının tek bağlı koruyucusu olduğunda veya kullanıcı günlük özeti basitçe Notion ile sınırlandırıldığında Orbit Pipeline\'ı tarafından seçilir. Kimliği doğrulanmış Notion bağlantısından son 24 saatlik belge düzenlemelerini, yorumları, konuşmaları ve veri tabanı satır verilerini çeker ve özet yerel bir Notion sayfası (açıklama kutusu / açılan kutu / veri tabanı tabloları temel sistemleri) olarak sunar. Bu beceri manuel olarak tetiklenmeli — canlı Notion sistemleri karşı Orbit\'in günlük özet zamanlayıcısı tarafından çağrılır.',
  },
  'patch-edit': {
    description: 'İncelenebilir küçük dosya düzenlemeleri olarak her seferinde bir yeniden yazma planı adımı uygulayın; yerelleştirilmiş bir değişiklik yeterli olduğunda hiçbir zaman dosyaların tamamını yeniden yazmayın.',
    examplePrompt: 'İncelenebilir küçük dosya düzenlemeleri olarak her seferinde bir yeniden yazma planı adımı uygulayın; yerelleştirilmiş bir değişiklik yeterli olduğunda hiçbir zaman dosyaların tamamını yeniden yazmayın.',
  },
  'paywall-upgrade-cro': {
    description: 'Yükseltme ekranlarını, ödeme duvarlarını ve ek satış modallarını tasarlayın ve optimize edin. SaaS dönüşüm tasarımı ve fiyatlandırma sayfası denemeleri için faydalıdır.',
    examplePrompt: 'Yükseltme ekranlarını, ödeme duvarlarını ve ek satış modallarını tasarlayın ve optimize edin.',
  },
  'pdf': {
    description: 'Metin çıkarın, PDF oluşturun ve formları işleyin. Basın bültenleri, markalı tek sayfalık belgeler ve yazdırılabilir tasarım çıktıları için faydalıdır.',
    examplePrompt: 'Metin çıkarın, PDF oluşturun ve formları işleyin.',
  },
  'pixelbin-media': {
    description: '85+ API portföyü ile görseller ve videolar oluşturun ve düzenleyin, Pixelbin aracılığıyla görsel açıdan çekici web sitesi sayfaları geliştirin.',
    examplePrompt: '85+ API portföyü ile görseller ve videolar oluşturun ve düzenleyin, Pixelbin aracılığıyla görsel açıdan çekici web sitesi sayfaları geliştirin.',
  },
  'plan-design-review': {
    description: 'Kıdemli Tasarımcı incelemesi: her tasarım boyutunu 0-10 arası puanlar, 10 puanlık bir tasarımın nasıl göründüğünü açıklar ve AI Slop sinyallerini işaretler. UI çalışmasını birleştirmeden önce bir kontrol noktası olarak faydalıdır.',
    examplePrompt: 'Kıdemli Tasarımcı incelemesi: her tasarım boyutunu 0-10 arası puanlar, 10 puanlık bir tasarımın nasıl göründüğünü açıklar ve AI Slop sinyallerini işaretler.',
  },
  'platform-design': {
    description: 'Çapraz platform uygulamaları için Apple HIG, Material Design 3 ve WCAG 2.2\'den 300+ tasarım kuralı. iOS, Android ve web genelinde tek bir tasarım yayınlarken faydalıdır.',
    examplePrompt: 'Çapraz platform uygulamaları için Apple HIG, Material Design 3 ve WCAG 2.2\'den 300+ tasarım kuralı.',
  },
  'pm-spec': {
    description: 'Tek sayfa olarak ürün spesifikasyonu / PRD - sorun, başarı ölçümleri, kapsam,\r\nkullanıcı hikayeleri, tasarım notları, kullanıma sunma planı, açık sorular. Şu durumlarda kullanın:\r\nkısaca "PRD", "özellik", "ürün özelliği", "özellik özeti" veya "需求文档" ifadelerinden bahseder.',
    examplePrompt: 'Tek sayfa olarak ürün spesifikasyonu / PRD - sorun, başarı ölçümleri, kapsam,\r\nkullanıcı hikayeleri, tasarım notları, kullanıma sunma planı, açık sorular. Şu durumlarda kullanın:\r\nkısaca "PRD", "özellik", "ürün özelliği", "özellik özeti" veya "需求文档" ifadelerinden bahseder.',
  },
  'portfolio-cosmic': {
    description: 'Kullanıcı birinci sınıf, karanlık, tek sayfalık bir portföy girişi istediğinde bu eklentiyi kullanın: sinematik HLS kahraman videosu, Enstrüman-Serif italik ekran tipi, bir yükleme ekranı sayacı, bir bento çalışma ızgarası, kaydırmayla sabitlenmiş bir paralaks keşif galerisi ve bir kayan yazı iletişim altbilgisi. \'Kozmik portföy\', \'karanlık portföy girişi\', \'video kahramanı içeren tasarımcı portföyü\' için veya kullanıcı Kozmik Portföy şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı birinci sınıf, karanlık, tek sayfalık bir portföy girişi istediğinde bu eklentiyi kullanın: sinematik HLS kahraman videosu, Enstrüman-Serif italik ekran tipi, bir yükleme ekranı sayacı, bir bento çalışma ızgarası, kaydırmayla sabitlenmiş bir paralaks keşif galerisi ve bir kayan yazı iletişim altbilgisi. \'Kozmik portföy\', \'karanlık portföy girişi\', \'video kahramanı içeren tasarımcı portföyü\' için veya kullanıcı Kozmik Portföy şablonuna başvurduğunda çağrı yapın.',
  },
  'poster-hero': {
    description: 'Güçlü görsel etkiye sahip dikey poster veya Moments tarzı paylaşım görseli.',
    examplePrompt: 'İçeriğimi güçlü görsel etkiye sahip dikey bir postere veya Moments tarzı paylaşım görseline dönüştürmek için Marketing Poster şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'ppt-keynote': {
    description: 'Apple Keynote kalitesinde slaytlar, her ekranda bir kart, klavyeyle sol/sağ gezinme.',
    examplePrompt: 'İçeriğimi her ekranda bir kart ve klavyeyle sol/sağ gezinme özelliğine sahip Apple Keynote kalitesinde slaytlara dönüştürmek için Keynote tarzı Slides şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'pptx': {
    description: 'PowerPoint slaytlarını, düzenlerini ve şablonlarını okuyun, oluşturun ve ayarlayın. Yönetici sunumları, eğitim materyalleri ve ürün incelemeleri için faydalıdır.',
    examplePrompt: 'PowerPoint slaytlarını, düzenlerini ve şablonlarını okuyun, oluşturun ve ayarlayın.',
  },
  'pptx-generator': {
    description: 'PptxGenJS ile sıfırdan PowerPoint sunumları oluşturun ve düzenleyin — MiniMax\'in üretimde test edilmiş sunum hattı.',
    examplePrompt: 'PptxGenJS ile sıfırdan PowerPoint sunumları oluşturun ve düzenleyin — MiniMax\'in üretimde test edilmiş sunum hattı.',
  },
  'pptx-html-fidelity-audit': {
    description: 'Bir python-pptx dışa aktarımını kaynak HTML sunumuyla karşılaştırarak denetleyin, düzen/içerik sapmalarını (alt bilgi taşması, kırpılmış içerik, eksik italik/em, kaybolan stiller, ritimsiz boşluk) belirleyin ve katı alt bilgi şeridi + imleç akışı düzen disiplini ile yeniden dışa aktarın. Kullanıcının bir HTML slayt sunumundan oluşturulmuş bir .pptx dosyası olduğunda ve dışa aktarımı karşılaştırmak/denetlemek/doğrulamak/düzeltmek istediğinde bu beceriyi kullanın — "ppt\'yi html ile karşılaştır", "sadakat denetimi", "pptx\'i düzelt", "ppt kesik", "alt bilgi çakışması", "pptx\'te italik eksik", "sunumu yeniden dışa aktar", "pptx-html-fidelity-audit" gibi ifadeler veya bir python-pptx → HTML gidiş-dönüşünün doğrulanması ya da onarılması gereken her durum dahil. Ayrıca kullanıcı size bir deck.html ve bir deck.pptx dosyasını yan yana gösterip görsel farkları ayıkladığında da tetikleyin.',
    examplePrompt: 'Bir python-pptx dışa aktarımını kaynak HTML sunumuyla karşılaştırarak denetleyin, düzen/içerik sapmalarını (alt bilgi taşması, kırpılmış içerik, eksik italik/em, kaybolan stiller, ritimsiz boşluk) belirleyin ve katı alt bilgi şeridi + imleç akışı düzen disiplini ile yeniden dışa aktarın.',
  },
  'pr-feedback-quality-gate': {
    description: 'Pull request geri bildirimlerini güvenle takip edin, inceleme yorumlarını veya birleştirme çakışmalarını çözün, düzeltmeleri doğrulayın ve takip eden değişiklikleri commit\'lemeden veya push\'lamadan önce salt okunur bir çapraz inceleme kullanın.',
    examplePrompt: 'Pull request geri bildirimlerini güvenle takip edin, inceleme yorumlarını veya birleştirme çakışmalarını çözün, düzeltmeleri doğrulayın ve takip eden değişiklikleri commit\'lemeden veya push\'lamadan önce salt okunur bir çapraz inceleme kullanın.',
  },
  'pricing-page': {
    description: 'Bağımsız bir fiyatlandırma sayfası — başlık, plan katmanları, özellik karşılaştırma tablosu,\r\nve bir SSS. Özette "fiyatlandırma", "planlar" sorulduğunda kullanın.\r\n"abonelik katmanları" veya "planları karşılaştır" sayfası.',
    examplePrompt: 'Bağımsız bir fiyatlandırma sayfası — başlık, plan katmanları, özellik karşılaştırma tablosu,\r\nve bir SSS. Özette "fiyatlandırma", "planlar" sorulduğunda kullanın.\r\n"abonelik katmanları" veya "planları karşılaştır" sayfası.',
  },
  'redesign-existing-projects': {
    description: 'Mevcut web sitelerini ve uygulamaları premium kaliteye yükseltir. Mevcut tasarımı denetler, jenerik AI kalıplarını belirler ve işlevselliği bozmadan üst düzey tasarım standartlarını uygular. Herhangi bir CSS çerçevesi veya saf CSS ile çalışır.',
    examplePrompt: 'Önce mevcut UI\'ı denetleyin, ardından işlevselliği bozmadan ve faydalı ürün yapısını koruyarak premium kaliteye yeniden tasarlayın.',
  },
  'reference-design-contract': {
    description: 'Belirsiz zevkleri, ekran görüntülerini, URL\'leri, ürün notlarını veya "bunun gibi hissettir"\nreferanslarını sağlam bir DESIGN.md ve uygulama devir teslimine dönüştürün. Kullanıcının tek seferlik bir istem yerine\nyeniden kullanılabilir bir görsel yön ihtiyacı olduğunda prototipler, sunumlar, yeniden tasarımlar veya görsel remix çalışmalarından\nönce kullanın.',
    examplePrompt: 'Bir geliştirici notları uygulaması için referans tasarım sözleşmesi oluşturun. Yön; editöryel, sakin, dokunsal ve ciddi hissettirmeli, ancak belirli bir ürünü kopyalamamalı. DESIGN.md ve bir uygulama devir teslimi üretin.',
  },
  'refine-critique-loop': {
    description: 'Kullanıcı mevcut bir Açık Tasarım eserine sahip olduğunda ve baştan başlamadan hedefli eleştiri, yama uygulama, marka sıkılaştırma, duyarlı düzeltmeler veya kalite iyileştirme istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı mevcut bir Açık Tasarım eserine sahip olduğunda ve baştan başlamadan hedefli eleştiri, yama uygulama, marka sıkılaştırma, duyarlı düzeltmeler veya kalite iyileştirme istediğinde bu eklentiyi kullanın.',
  },
  'release-notes-one-pager': {
    description: 'Öne çıkanlar, Eklenenler, Düzeltilenler, Bozucu değişiklikler,\nBilinen sorunlar ve Yükseltme notu içeren tek sayfalık HTML sürüm notları. Kullanıcı ayrıntı sağlamadığında\nher zaman açık "Yok" tarzında bölümler yazar.',
    examplePrompt: 'v2.3.1 için Eklenenler, Düzeltilenler, Bozucu değişiklikler, Bilinen sorunlar ve bir Yükseltme notu içeren sürüm notları yazın.',
  },
  'remotion': {
    description: 'React ile programatik video oluşturma. Markalı açıklayıcı videolar, sosyal medya kesitleri, panodan videoya dönüşüm ve yeniden üretilebilir hareketli grafikler için faydalıdır.',
    examplePrompt: 'React ile programatik video oluşturma.',
  },
  'replicate': {
    description: 'Replicate\'in API\'sini kullanarak AI modellerini keşfedin, karşılaştırın ve çalıştırın. Sıkça model değiştiren görsel, ses ve video üretim hatları için çok uygundur.',
    examplePrompt: 'Replicate\'in API\'sini kullanarak AI modellerini keşfedin, karşılaştırın ve çalıştırın.',
  },
  'replit-deck': {
    description: 'Replit Slaytlar tarzında tek dosyalı, yatay kaydırmalı HTML desteği\r\naçılış sayfası şablon galerisi. Sekiz farklı tema (helix, holm, vance,\r\nbevel, world-dark, world-mint, atlas, bluehouse) — her biri tam bir görsel\r\nreplit.com/slides adresinden alınan sistem (palet + tür + vurgu). Birini seç\r\ntema, karıştırmayın. Sunum sunumları, yönetim kurulu raporları, marka notları, kampanya için\r\nortaya çıkar - kullanıcı açıkça "Slaytları Tekrarlama stili" istediğinde.',
    examplePrompt: 'Replit Slaytlar tarzında tek dosyalı, yatay kaydırmalı HTML desteği\r\naçılış sayfası şablon galerisi. Sekiz farklı tema (helix, holm, vance,\r\nbevel, world-dark, world-mint, atlas, bluehouse) — her biri tam bir görsel\r\nreplit.com/slides adresinden alınan sistem (palet + tür + vurgu). Birini seç\r\ntema, karıştırmayın. Sunum sunumları, yönetim kurulu raporları, marka notları, kampanya için\r\nortaya çıkar - kullanıcı açıkça "Slaytları Tekrarlama stili" istediğinde.',
  },
  'research-decision-room': {
    description: 'Dağınık kullanıcı araştırması notlarını, görüşmeleri, destek taleplerini, anketleri ve ürün\nbağlamını kanıta dayalı bir karar odasına dönüştürün: kanıt defteri,\ntema haritası, güven ısı haritası, fırsat matrisi, karar\nnotu ve deney kuyruğu içeren tek bir HTML yapısı. Ekiplerin niteliksel\nsinyallerden kesinlik uydurmadan ürün veya tasarım kararlarına geçmesi gerektiğinde kullanın.',
    examplePrompt: 'Bir proje yönetimi uygulamasının bir katılım kontrol listesi mi yoksa bağlamsal satır içi ipuçları mı eklemesi gerektiğine karar vermek için 8 görüşme notunu, 24 destek talebini ve son aktivasyon metriklerini bir araştırma karar odasında sentezleyin.',
  },
  'resume-modern': {
    description: 'Modern minimal özgeçmiş, tek A4 sayfa, baskıya veya PDF dışa aktarımına hazır.',
    examplePrompt: 'İçeriğimi baskıya veya PDF dışa aktarımına hazır, modern minimal tek sayfalık A4 özgeçmişe dönüştürmek için Modern Resume şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'rewrite-plan': {
    description: 'Açık sahiplik sınırları ve yama güvenliği garantileriyle sonraki yama düzenleme + fark-inceleme + derleme-test aşamalarının yürüteceği, uzun süredir devam eden, çok dosyalı bir yeniden yazma planı yazın.',
    examplePrompt: 'Açık sahiplik sınırları ve yama güvenliği garantileriyle sonraki yama düzenleme + fark-inceleme + derleme-test aşamalarının yürüteceği, uzun süredir devam eden, çok dosyalı bir yeniden yazma planı yazın.',
  },
  'saas-landing': {
    description: 'Kahraman, özellikler, sosyal kanıt, fiyatlandırma ve CTA içeren tek sayfalı SaaS girişi.\r\nAktif DESIGN.md renk/tipografi/düzen belirteçlerine saygı duyar.\r\nTetikleyici anahtar kelimeler: "saas açılış", "pazarlama sayfası", "ürün açılış".',
    examplePrompt: 'Kahraman, özellikler, sosyal kanıt, fiyatlandırma ve CTA içeren tek sayfalı SaaS girişi.\r\nAktif DESIGN.md renk/tipografi/düzen belirteçlerine saygı duyar.\r\nTetikleyici anahtar kelimeler: "saas açılış", "pazarlama sayfası", "ürün açılış".',
  },
  'sample-plugin': {
    description: 'Geriye dönük uyumluluk testleri için bir SKILL.md ön maddesini sentezleyen Aşama 1 örnek eklentisi.',
    examplePrompt: 'Geriye dönük uyumluluk testleri için bir SKILL.md ön maddesini sentezleyen Aşama 1 örnek eklentisi.',
  },
  'screenshot': {
    description: 'İşletim sistemi platformları genelinde masaüstünü, uygulama pencerelerini veya piksel bölgelerini yakalayın. Pazarlama ekran görüntüleri, tasarım incelemeleri ve hata raporları için faydalıdır.',
    examplePrompt: 'İşletim sistemi platformları genelinde masaüstünü, uygulama pencerelerini veya piksel bölgelerini yakalayın.',
  },
  'screenshots-marketing': {
    description: 'Playwright ile pazarlama ekran görüntüleri oluşturun. Açılış sayfası hero görselleri, App Store ekran görüntüleri ve changelog görselleri için kullanışlıdır.',
    examplePrompt: 'Playwright ile pazarlama ekran görüntüleri oluşturun.',
  },
  'shadcn-ui': {
    description: 'shadcn/ui ile UI bileşenleri oluşturun. Yapılandırılmış, erişilebilir bileşenleri hızlıca sunmak için Stitch tasarım döngüsüyle birlikte çalışır.',
    examplePrompt: 'shadcn/ui ile UI bileşenleri oluşturun.',
  },
  'shader-dev': {
    description: 'Ray marching, akışkan simülasyonu, parçacık sistemleri ve prosedürel üretim için GLSL shader teknikleri. Hero görselleri ve hareket karelerinde kullanışlıdır.',
    examplePrompt: 'Ray marching, akışkan simülasyonu, parçacık sistemleri ve prosedürel üretim için GLSL shader teknikleri.',
  },
  'share-github-pr': {
    description: 'Kullanıcı, kabul edilen bir eklentiyi veya yapıtı Açık Tasarım veya başka bir hedef depo için GitHub çekme isteği olarak paketlemek istediğinde bu eklentiyi kullanın.',
    examplePrompt: 'Kullanıcı, kabul edilen bir eklentiyi veya yapıtı Açık Tasarım veya başka bir hedef depo için GitHub çekme isteği olarak paketlemek istediğinde bu eklentiyi kullanın.',
  },
  'simple-deck': {
    description: 'Tek dosyalı yatay kaydırmalı HTML desteği. Tohumun kopyalanmasıyla oluşturuldu\r\n`assets/template.html` (kanıtlanmış 5 kurallı iframe gezinme komut dosyasını taşır)\r\nve slayt düzenlerini \'references/layouts.md\'den yapıştırmak. Saha güverteleri,\r\nürünlere genel bakış, çalışma materyali — dergiye ihtiyacınız olmadığında\r\n\'dergi-web-ppt\' estetiği.',
    examplePrompt: 'Tek dosyalı yatay kaydırmalı HTML desteği. Tohumun kopyalanmasıyla oluşturuldu\r\n`assets/template.html` (kanıtlanmış 5 kurallı iframe gezinme komut dosyasını taşır)\r\nve slayt düzenlerini \'references/layouts.md\'den yapıştırmak. Saha güverteleri,\r\nürünlere genel bakış, çalışma materyali — dergiye ihtiyacınız olmadığında\r\n\'dergi-web-ppt\' estetiği.',
  },
  'skyelite-private-jets': {
    description: 'Kullanıcı birinci sınıf bir özel jet açılış sayfası kahramanı istediğinde bu eklentiyi kullanın: tam ekran otomatik oynatılan CloudFront video arka planı, Lucide hamburger mobil açılır menüsüyle maksimum w-7xl gezinme ve Keşfet + Şimdi Rezervasyon Yap hap CTA\'ları ile ortalanmış, örtüşen iki satırlı başlık (Premium. / Erişilebilir.). \'Özel jet inişi\', \'havacılık kahramanı\', \'lüks seyahat kahramanı\' veya kullanıcı SkyElite şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı birinci sınıf bir özel jet açılış sayfası kahramanı istediğinde bu eklentiyi kullanın: tam ekran otomatik oynatılan CloudFront video arka planı, Lucide hamburger mobil açılır menüsüyle maksimum w-7xl gezinme ve Keşfet + Şimdi Rezervasyon Yap hap CTA\'ları ile ortalanmış, örtüşen iki satırlı başlık (Premium. / Erişilebilir.). \'Özel jet inişi\', \'havacılık kahramanı\', \'lüks seyahat kahramanı\' veya kullanıcı SkyElite şablonuna başvurduğunda çağrı yapın.',
  },
  'slack-gif-creator': {
    description: 'Boyut kısıtlamaları için doğrulayıcılar ve birleştirilebilir animasyon ilkelerinin bulunduğu, Slack için optimize edilmiş animasyonlu GIF\'ler oluşturun.',
    examplePrompt: 'Boyut kısıtlamaları için doğrulayıcılar ve birleştirilebilir animasyon ilkelerinin bulunduğu, Slack için optimize edilmiş animasyonlu GIF\'ler oluşturun.',
  },
  'slides': {
    description: 'PptxGenJS ile .pptx sunum destelerini oluşturun ve düzenleyin. Satış desteleri, kickoff brifingleri ve tasarım sistemi vitrinleri için kullanışlıdır.',
    examplePrompt: 'PptxGenJS ile .pptx sunum destelerini oluşturun ve düzenleyin.',
  },
  'social-carousel': {
    description: '1080×1080 kareler halinde düzenlenmiş üç kartlı bir sosyal medya atlıkarıncası —\r\nbirbirine bağlanan ekran başlıklarına sahip üç sinematik, markaya özel panel\r\nseri boyunca ("ileriye." → "bir sonrakine." → "ileriye bakmak.").\r\nHer kartta bir marka işareti, bir sayı/toplam, bir başlık ve bir "döngü" bulunur\r\nkarşılanabilirlik. Özette "atlıkarınca gönderisi", "sosyal paylaşım" istendiğinde kullanın\r\natlıkarınca", "Instagram atlıkarınca", "LinkedIn serisi", "X iplik kartları",\r\nveya "三连发".',
    examplePrompt: '1080×1080 kareler halinde düzenlenmiş üç kartlı bir sosyal medya atlıkarıncası —\r\nbirbirine bağlanan ekran başlıklarına sahip üç sinematik, markaya özel panel\r\nseri boyunca ("ileriye." → "bir sonrakine." → "ileriye bakmak.").\r\nHer kartta bir marka işareti, bir sayı/toplam, bir başlık ve bir "döngü" bulunur\r\nkarşılanabilirlik. Özette "atlıkarınca gönderisi", "sosyal paylaşım" istendiğinde kullanın\r\natlıkarınca", "Instagram atlıkarınca", "LinkedIn serisi", "X iplik kartları",\r\nveya "三连发".',
  },
  'social-media-dashboard': {
    description: 'Tek bir HTML dosyasında içerik oluşturucuya yönelik sosyal medya analiz panosu.\r\nBir platform değiştirici (X / LinkedIn / YouTube / Instagram), bir dizi KPI\r\nkartlar (takipçiler, etkileşim oranı, beğeniler, yeniden paylaşımlar), takipçi büyümesi\r\ngrafiği, "bu haftanın en çok okunan gönderisi" önizlemesi ve trend olan konular / en iyiler\r\nyorumlar yan paneli. Özette "sosyal medya"dan bahsedildiğinde kullanın\r\nkontrol paneli", "yaratıcı analizleri", "sosyal analizler" veya belirli adlar\r\nplatformlar (X, Twitter, LinkedIn, YouTube, Instagram, TikTok) birlikte\r\ntakipçiler, etkileşimler, beğeniler, paylaşımlar gibi metriklerle.',
    examplePrompt: 'Tek bir HTML dosyasında içerik oluşturucuya yönelik sosyal medya analiz panosu.\r\nBir platform değiştirici (X / LinkedIn / YouTube / Instagram), bir dizi KPI\r\nkartlar (takipçiler, etkileşim oranı, beğeniler, yeniden paylaşımlar), takipçi büyümesi\r\ngrafiği, "bu haftanın en çok okunan gönderisi" önizlemesi ve trend olan konular / en iyiler\r\nyorumlar yan paneli. Özette "sosyal medya"dan bahsedildiğinde kullanın\r\nkontrol paneli", "yaratıcı analizleri", "sosyal analizler" veya belirli adlar\r\nplatformlar (X, Twitter, LinkedIn, YouTube, Instagram, TikTok) birlikte\r\ntakipçiler, etkileşimler, beğeniler, paylaşımlar gibi metriklerle.',
  },
  'social-media-matrix-tracker-template': {
    description: '社媒矩阵数据追踪面板模板(Sosyal Medya Matris Takipçisi)。\r\nKullanıcılar sinematik, veri yoğun bir sosyal medya analiz panosu istediğinde kullanın\r\nçoklu platform ölçümleri, etkileşimli grafikler, fareyle üzerine gelme öngörüleri, aralık karşılaştırması,\r\nve tek bir HTML yapıtında koyu/açık tema geçişi.',
    examplePrompt: '社媒矩阵数据追踪面板模板(Sosyal Medya Matris Takipçisi)。\r\nKullanıcılar sinematik, veri yoğun bir sosyal medya analiz panosu istediğinde kullanın\r\nçoklu platform ölçümleri, etkileşimli grafikler, fareyle üzerine gelme öngörüleri, aralık karşılaştırması,\r\nve tek bir HTML yapıtında koyu/açık tema geçişi.',
  },
  'social-reddit-card': {
    description: 'Oy çubuğu ve yorum sayısı içeren gerçekçi bir Reddit gönderi kartı; video bindirmeleri veya story paylaşımları için uygundur.',
    examplePrompt: 'İçeriğimi, video bindirmesi veya story paylaşımı için oy çubuğu ve yorum sayısı içeren gerçekçi bir Reddit gönderi kartına dönüştürmek üzere Reddit Post Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'social-spotify-card': {
    description: 'Albüm kapağı, ilerleme çubuğu ve oynatma kontrollerine sahip Spotify Now Playing tarzı bir kart; video bindirmeleri veya kişisel ana sayfalar için uygundur.',
    examplePrompt: 'İçeriğimi, video bindirmesi veya kişisel ana sayfa için albüm kapağı, ilerleme çubuğu ve oynatma kontrolleri içeren Spotify Now Playing tarzı bir karta dönüştürmek üzere Spotify Now-Playing Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'social-x-post-card': {
    description: 'Etkileşim metrikleri (beğeniler, repostlar, görüntülenmeler) içeren gerçekçi bir X gönderi kartı; video bindirmeleri veya paylaşılabilir görsel kartlar için uygundur.',
    examplePrompt: 'İçeriğimi, video bindirmesi veya paylaşılabilir görsel kart için etkileşim metrikleri içeren gerçekçi bir X gönderi kartına dönüştürmek üzere X / Twitter Post Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'sora': {
    description: 'OpenAI\'nin Sora API\'si aracılığıyla kısa video klipleri oluşturun, yeniden düzenleyin ve yönetin. Sinematik çekimler, b-roll ve hızlı konsept video iterasyonu için kullanışlıdır.',
    examplePrompt: 'OpenAI\'nin Sora API\'si aracılığıyla kısa video klipleri oluşturun, yeniden düzenleyin ve yönetin.',
  },
  'speech': {
    description: 'OpenAI\'nin API\'sini ve yerleşik sesleri kullanarak metinden konuşma sesi oluşturun. Anlatımlı açıklayıcı videolar, ders sesleri ve hızlı seslendirme parçaları için kullanışlıdır.',
    examplePrompt: 'OpenAI\'nin API\'sini ve yerleşik sesleri kullanarak metinden konuşma sesi oluşturun.',
  },
  'sprite-animation': {
    description: 'Piksel/sprite tarzı animasyonlu açıklayıcı slayt — tam ekran krema aşaması,\r\nkalın ekran yılı, animasyonlu piksel sanatı maskotu (ör. Hanafuda kartı, mantar,\r\nveya 8 bitlik konsol), kinetik Japonca ekran türü, zaman çizelgesi şeridinin işaretlenmesi.\r\nEğitici bir hareketli videonun tek bir karesi gibi okunur - döngüsel CSS\r\nana kareler, JS yok, dikey bir videoya ekran olarak kaydedilmeye hazır.\r\nÖzette bir "hareketli animasyon", "piksel sanatlı video" istendiğinde kullanın.\r\n"8 bitlik açıklayıcı", "X açıklayıcısının geçmişi", "kinetik tipografi geçmişi",\r\n"Nintendo tarzı", "精灵图动画", "像素动画" veya "复古动画".',
    examplePrompt: 'Piksel/sprite tarzı animasyonlu açıklayıcı slayt — tam ekran krema aşaması,\r\nkalın ekran yılı, animasyonlu piksel sanatı maskotu (ör. Hanafuda kartı, mantar,\r\nveya 8 bitlik konsol), kinetik Japonca ekran türü, zaman çizelgesi şeridinin işaretlenmesi.\r\nEğitici bir hareketli videonun tek bir karesi gibi okunur - döngüsel CSS\r\nana kareler, JS yok, dikey bir videoya ekran olarak kaydedilmeye hazır.\r\nÖzette bir "hareketli animasyon", "piksel sanatlı video" istendiğinde kullanın.\r\n"8 bitlik açıklayıcı", "X açıklayıcısının geçmişi", "kinetik tipografi geçmişi",\r\n"Nintendo tarzı", "精灵图动画", "像素动画" veya "复古动画".',
  },
  'stellar-launch': {
    description: 'Kullanıcı, Launchex Ödülleri tarzında bir premium ödül / girişim ödülü açılış sayfası istediğinde bu eklentiyi kullanın: yuvarlatılmış köşeleri olan ek bir beyaz kart kabuğu, oluklu (klip yolu) CTA\'lı tam ekran bir video kahramanı, kare bir videonun yanında köşeli aday kartlarının bulunduğu üç sütunlu gönderim bölümü ve artı daha koyu görüntü kartlarıyla kurucular hakkında bir istatistik tablosu. \'Ödül açılış sayfası\', \'lansman / ödül iniş\', \'Stellar Lansmanı\', \'Launchex ödülleri\' veya herhangi bir geometrik köşeli köşeli editoryal kahraman için çağrı yapın.',
    examplePrompt: 'Kullanıcı, Launchex Ödülleri tarzında bir premium ödül / girişim ödülü açılış sayfası istediğinde bu eklentiyi kullanın: yuvarlatılmış köşeleri olan ek bir beyaz kart kabuğu, oluklu (klip yolu) CTA\'lı tam ekran bir video kahramanı, kare bir videonun yanında köşeli aday kartlarının bulunduğu üç sütunlu gönderim bölümü ve artı daha koyu görüntü kartlarıyla kurucular hakkında bir istatistik tablosu. \'Ödül açılış sayfası\', \'lansman / ödül iniş\', \'Stellar Lansmanı\', \'Launchex ödülleri\' veya herhangi bir geometrik köşeli köşeli editoryal kahraman için çağrı yapın.',
  },
  'stitch-design-taste': {
    description: 'Google Stitch için Anlamsal Tasarım Sistemi Skill\'i. Premium, sıradanlık karşıtı UI standartlarını dayatan, ajan dostu DESIGN.md dosyaları üretir — katı tipografi, kalibre edilmiş renk, asimetrik düzenler, sürekli mikro hareket ve donanım hızlandırmalı performans.',
    examplePrompt: 'Bu ürün için premium, sıradanlık karşıtı UI standartları, tipografi, renk, düzen, hareket ve prompt rehberliği içeren ajan dostu bir DESIGN.md oluşturun.',
  },
  'stitch-loop': {
    description: 'İteratif tasarımdan koda geri bildirim döngüsü. Brief ile oluşturulan UI arasındaki görsel doğruluğu sıkılaştırmak için eleştir → ayarla → sun döngüsü.',
    examplePrompt: 'İteratif tasarımdan koda geri bildirim döngüsü.',
  },
  'swiftui-design': {
    description: 'SwiftUI 前端设计 skill\'i — yapay zekâ baştan savmacılığına karşı kurallar, tasarım yönü danışmanı, marka varlığı protokolü ve beş boyutlu inceleme. Claude Code, Cursor, Codex ve OpenCode ile çalışır.',
    examplePrompt: 'SwiftUI 前端设计 skill\'i — yapay zekâ baştan savmacılığına karşı kurallar, tasarım yönü danışmanı, marka varlığı protokolü ve beş boyutlu inceleme.',
  },
  'swiss-creative-mode-template': {
    description: 'Tek dosyalık bir HTML artifaktında cesur editöryel\ntipografi, yüksek kontrastlı geometrik kartlar, etkileşimli slayt gezinme,\ntema değiştirme, hotspot bindirmeleri ve palet koreografisi içeren, İsviçre esinli yaratıcı mod sunum şablonu skill\'i. Kullanıcılar premium bir sunum tarzı açılış,\nİsviçre/brütalist deste görünümü veya zengin etkileşimli yaratıcı bir lansman sayfası istediğinde kullanın.',
    examplePrompt: 'Tek dosyalık bir HTML artifaktında cesur editöryel tipografi, yüksek kontrastlı geometrik kartlar, etkileşimli slayt gezinme, tema değiştirme, hotspot bindirmeleri ve palet koreografisi içeren, İsviçre esinli yaratıcı mod sunum şablonu skill\'i.',
  },
  'swiss-user-research-video-template': {
    description: 'Sıcak kâğıt editöryel estetiğinde İsviçre tarzı kullanıcı araştırması anlatım şablonu.\nKullanıcılar minimalist tipografi, yüksek netlikli düzen, ince hareket, halka grafik dökümleri\nve tek bir HTML dosyasında slaytlar arası klavye/tıklama gezinmesi içeren premium bir araştırma destesi veya hikâye odaklı canlı artifakt istediğinde kullanın.',
    examplePrompt: 'Premium minimalist tipografi, sıcak kâğıt tonu, katılımcı halka grafiği dökümü ve ince editöryel etkileşimler içeren İsviçre tarzı bir kullanıcı araştırması sentez destesi oluşturun.',
  },
  'team-okrs': {
    description: 'OKR takip sayfası — çeyrek banner, anahtarlarıyla birlikte üç hedef\r\nilerleme çubukları, sahip avatarları, durum hapları ve "bu\r\nbir bakışta çeyrek" kenar çubuğu. Özette "OKR\'ler" denildiğinde kullanın,\r\n"temel sonuçlar", "hedefler" veya "belirtilenler".',
    examplePrompt: 'OKR takip sayfası — çeyrek banner, anahtarlarıyla birlikte üç hedef\r\nilerleme çubukları, sahip avatarları, durum hapları ve "bu\r\nbir bakışta çeyrek" kenar çubuğu. Özette "OKR\'ler" denildiğinde kullanın,\r\n"temel sonuçlar", "hedefler" veya "belirtilenler".',
  },
  'theme-factory': {
    description: 'Slaytlar, dokümanlar, raporlar ve HTML açılış sayfaları dahil artifaktlara profesyonel font ve renk temaları uygulayın. 10 hazır temayla gelir.',
    examplePrompt: 'Slaytlar, dokümanlar, raporlar ve HTML açılış sayfaları dahil artifaktlara profesyonel font ve renk temaları uygulayın.',
  },
  'threejs': {
    description: 'Tarayıcıda 3D öğeler ve etkileşimli deneyimler oluşturmak için Three.js skill\'leri — sahneler, materyaller, kontroller ve son işleme.',
    examplePrompt: 'Tarayıcıda 3D öğeler ve etkileşimli deneyimler oluşturmak için Three.js skill\'leri — sahneler, materyaller, kontroller ve son işleme.',
  },
  'todo-write': {
    description: 'Aracının oluşturmadan önce taahhüt ettiği TodoWrite odaklı plan.',
    examplePrompt: 'Aracının oluşturmadan önce taahhüt ettiği TodoWrite odaklı plan.',
  },
  'token-map': {
    description: 'Çıkarılan bir Figma / kaynak kodu jeton çantasını aktif OD tasarım sistemine eşleyin ve oluşturma aşamasının tüketebileceği deterministik bir haritalama oluşturun.',
    examplePrompt: 'Çıkarılan bir Figma / kaynak kodu jeton çantasını aktif OD tasarım sistemine eşleyin ve oluşturma aşamasının tüketebileceği deterministik bir haritalama oluşturun.',
  },
  'trading-analysis-dashboard-template': {
    description: 'Profesyonel ticaret analizi kontrol paneli şablonu (tek dosyalı HTML)\r\naçık/koyu tema geçişi, yoğun pazar panelleri, grafik etkileşimleri, demo/canlı\r\noynatma ve komut paleti davranışı.\r\nKullanıcılar Wall-Street tarzı bir analiz terminali, ticaret kokpiti istediğinde kullanın.\r\nveya gerçekçi veri düzenine sahip yüksek teknolojili finansal gösterge tablosu şablonu.',
    examplePrompt: 'Profesyonel ticaret analizi kontrol paneli şablonu (tek dosyalı HTML)\r\naçık/koyu tema geçişi, yoğun pazar panelleri, grafik etkileşimleri, demo/canlı\r\noynatma ve komut paleti davranışı.\r\nKullanıcılar Wall-Street tarzı bir analiz terminali, ticaret kokpiti istediğinde kullanın.\r\nveya gerçekçi veri düzenine sahip yüksek teknolojili finansal gösterge tablosu şablonu.',
  },
  'tweaks': {
    description: 'Herhangi bir HTML eserini canlı, parametreli bir yan panelle sarın\r\nkontroller (vurgu rengi, yazı ölçeği, yoğunluk, hareket, tema)\r\nCSS özel özelliklerini gerçek zamanlı olarak yeniden yazın ve devam edin\r\nlocalStorage. Kullanıcının bir tasarımın çeşitlerini\r\nacenteyi yeniden uyarıyorum. Özette "çeşitleri" sorulduğunda kullanın,\r\n"yan yana seçenekler", "bunda ince ayar yap", "ayarlamama izin ver", "canlı\r\ndüğmeler" veya "实时调参".',
    examplePrompt: 'Herhangi bir HTML eserini canlı, parametreli bir yan panelle sarın\r\nkontroller (vurgu rengi, yazı ölçeği, yoğunluk, hareket, tema)\r\nCSS özel özelliklerini gerçek zamanlı olarak yeniden yazın ve devam edin\r\nlocalStorage. Kullanıcının bir tasarımın çeşitlerini\r\nacenteyi yeniden uyarıyorum. Özette "çeşitleri" sorulduğunda kullanın,\r\n"yan yana seçenekler", "bunda ince ayar yap", "ayarlamama izin ver", "canlı\r\ndüğmeler" veya "实时调参".',
  },
  'ui-skills': {
    description: 'Arayüz oluştururken ajanlara yön vermek için belirli bir görüşe dayalı, sürekli gelişen kısıtlamalar. Birçok küçük UI parçası genelinde tutarlı çıktı sağlamak için kullanışlıdır.',
    examplePrompt: 'Arayüz oluştururken ajanlara yön vermek için belirli bir görüşe dayalı, sürekli gelişen kısıtlamalar.',
  },
  'ui-ux-pro-max': {
    description: 'Yalnızca katalog UI/UX Pro Max girişi. Tam kaynak şablonlar, veriler ve arama iş akışı Open Design\'a dahil değildir.',
    examplePrompt: 'Yalnızca katalog UI/UX Pro Max girişi.',
  },
  've-midnight-editorial': {
    description: 'Geceyarısı Editoryal destesi — sinematik editoryal karanlık tema: sıcak altın #d4a73a vurgulu koyu lacivert #0f1729 sayfalar, doğrudan 14 piksele düşen Instrument Serif 120 piksel dramatik ekran JetBrains Mono etiketleri, slayt başına altın radyal vurgulu parıltı, altın SVG köşe işaretleri, hayalet bölüm rakamları, kademeli sinematik gösterim geçişleri ve SlideEngine (T tuşu) tarafından değiştirilen kilitli krem/altın ışık modu. Nicobailon/visual-explaner\'ın "gece yarısı editoryal" slayt destesi ön ayarı, tek estetik deste eklentisi olarak kilitlendi. Kullanıcı dramatik, dergi düzeyinde karanlık bir sunum istediğinde kullanın - mühendislik incelemeleri, ürün açılış notları, editoryal lansmanlar, ciddi bir derginin gece yarısı sayısı gibi hissettirmesi gereken her şey.',
    examplePrompt: 'Geceyarısı Editoryal destesi — sinematik editoryal karanlık tema: sıcak altın #d4a73a vurgulu koyu lacivert #0f1729 sayfalar, doğrudan 14 piksele düşen Instrument Serif 120 piksel dramatik ekran JetBrains Mono etiketleri, slayt başına altın radyal vurgulu parıltı, altın SVG köşe işaretleri, hayalet bölüm rakamları, kademeli sinematik gösterim geçişleri ve SlideEngine (T tuşu) tarafından değiştirilen kilitli krem/altın ışık modu. Nicobailon/visual-explaner\'ın "gece yarısı editoryal" slayt destesi ön ayarı, tek estetik deste eklentisi olarak kilitlendi. Kullanıcı dramatik, dergi düzeyinde karanlık bir sunum istediğinde kullanın - mühendislik incelemeleri, ürün açılış notları, editoryal lansmanlar, ciddi bir derginin gece yarısı sayısı gibi hissettirmesi gereken her şey.',
  },
  've-terminal-mono': {
    description: 'Terminal Mono deste teması: geliştiriciye özgü siyaha yakın #0a0e14 zemin, her yerde Geist Mono (büyük ağırlık-400 mono başlık, hiçbir zaman kalın ekran), Drakula yeşili #50fa7b vurgusu, soluk nokta ızgarası, düşük opaklıkta yeşil ince çizgiler. Sıfır skeuomorfizm. Tercihler-renk şeması aracılığıyla ikili tema. SlideEngine navigasyonuna sahip tek dosyalı kaydırmalı HTML desteği.',
    examplePrompt: 'Terminal Mono deste teması: geliştiriciye özgü siyaha yakın #0a0e14 zemin, her yerde Geist Mono (büyük ağırlık-400 mono başlık, hiçbir zaman kalın ekran), Drakula yeşili #50fa7b vurgusu, soluk nokta ızgarası, düşük opaklıkta yeşil ince çizgiler. Sıfır skeuomorfizm. Tercihler-renk şeması aracılığıyla ikili tema. SlideEngine navigasyonuna sahip tek dosyalı kaydırmalı HTML desteği.',
  },
  'velar-luxury-real-estate': {
    description: 'Kullanıcı, sinematik kaydırma koreografisine sahip, üst düzey lüks bir emlak / mimari açılış sayfası istediğinde bu eklentiyi kullanın: kaldırılan bir daktilo ön yükleyicisi, aşağıdan yükselen ve karanlık bir ifade bölümüne sabitlenirken ölçeklenen, kaydırmayla çalıştırılan bir ev görüntüsü, artan sayılarla yapışkan bir karanlık istatistik bandı ve karanlık bölümün üzerinde yukarı kayan, fareyle üzerine gelindiğinde genişletilen bir video galerisi. \'Lüks emlak açılış sayfası\', \'mimari marka sitesi\', \'yükselen binaya sahip kaydırmalı kahraman\' veya kullanıcı Velar şablonuna başvurduğunda çağrı yapın.',
    examplePrompt: 'Kullanıcı, sinematik kaydırma koreografisine sahip, üst düzey lüks bir emlak / mimari açılış sayfası istediğinde bu eklentiyi kullanın: kaldırılan bir daktilo ön yükleyicisi, aşağıdan yükselen ve karanlık bir ifade bölümüne sabitlenirken ölçeklenen, kaydırmayla çalıştırılan bir ev görüntüsü, artan sayılarla yapışkan bir karanlık istatistik bandı ve karanlık bölümün üzerinde yukarı kayan, fareyle üzerine gelindiğinde genişletilen bir video galerisi. \'Lüks emlak açılış sayfası\', \'mimari marka sitesi\', \'yükselen binaya sahip kaydırmalı kahraman\' veya kullanıcı Velar şablonuna başvurduğunda çağrı yapın.',
  },
  'venice-audio-music': {
    description: 'Venice.ai üzerinden müzik üretimi kuyruğa alma, getirme ve tamamlama uç noktaları. Jingle\'lar, arka plan döngüleri ve prototip müziklendirme için uygundur.',
    examplePrompt: 'Venice.ai üzerinden müzik üretimi kuyruğa alma, getirme ve tamamlama uç noktaları.',
  },
  'venice-audio-speech': {
    description: 'Venice.ai üzerinden metinden sese modeller, sesler, formatlar ve akış. Anlatım, seslendirme ve konuşma ajanı sesleri için kullanışlıdır.',
    examplePrompt: 'Venice.ai üzerinden metinden sese modeller, sesler, formatlar ve akış.',
  },
  'venice-image-edit': {
    description: 'Venice.ai API üzerinden görüntü düzenleme, yükseltme ve arka plan kaldırma.',
    examplePrompt: 'Venice.ai API üzerinden görüntü düzenleme, yükseltme ve arka plan kaldırma.',
  },
  'venice-image-generate': {
    description: 'Venice.ai API üzerinden görüntü üretimi uç noktaları ve kullanılabilir stiller.',
    examplePrompt: 'Venice.ai API üzerinden görüntü üretimi uç noktaları ve kullanılabilir stiller.',
  },
  'venice-video': {
    description: 'Venice.ai API üzerinden video üretimi ve transkripsiyon iş akışları.',
    examplePrompt: 'Venice.ai API üzerinden video üretimi ve transkripsiyon iş akışları.',
  },
  'vfx-text-cursor': {
    description: 'Video girişlerinde kelime kelime alıntı açılışları için imleç ışık izi, kromatik ışınlar ve yönlü parlamalar.',
    examplePrompt: 'İçeriğimi imleç ışık izleri, kromatik ışınlar ve yönlü parlamalarla bir video girişi alıntı açılışına dönüştürmek için VFX Text Cursor şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'video-downloader': {
    description: 'Çeşitli format ve kalite seçeneklerini destekleyerek çevrimdışı izleme, düzenleme veya arşivleme için YouTube ve diğer platformlardan video indirin.',
    examplePrompt: 'Çeşitli format ve kalite seçeneklerini destekleyerek çevrimdışı izleme, düzenleme veya arşivleme için YouTube ve diğer platformlardan video indirin.',
  },
  'video-hyperframes': {
    description: 'Otomatik oynatma destekli Hyperframes / Remotion uyumlu sürekli kare animasyonu.',
    examplePrompt: 'İçeriğimi otomatik oynatma destekli, Hyperframes / Remotion uyumlu sürekli kare animasyonuna dönüştürmek için Hyperframes Video şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'video-shortform': {
    description: 'Kısa biçimli video oluşturma becerisi — ürün için 3-10 saniyelik klipler\r\ngösterimler, hareket tanıtımları, ortam döngüleri. Varsayılan olarak Sedance 2\'dir ancak\r\nKling 3/4, Veo 3 veya Sora 2 ile aynı şekilde çalışır. Çıkış bir MP4\'tür\r\nproje klasörüne kaydedilir. Çalışma alanı da bir ileti gönderdiğinde\r\netkileşimli video / hiper çerçeve becerisi, birkaç kısa kompozisyon oluşturmayı tercih ediyor\r\nçekimleri tek bir uzun yekpare klip yerine tek bir zaman çizelgesine sığdırın.',
    examplePrompt: 'Kısa biçimli video oluşturma becerisi — ürün için 3-10 saniyelik klipler\r\ngösterimler, hareket tanıtımları, ortam döngüleri. Varsayılan olarak Sedance 2\'dir ancak\r\nKling 3/4, Veo 3 veya Sora 2 ile aynı şekilde çalışır. Çıkış bir MP4\'tür\r\nproje klasörüne kaydedilir. Çalışma alanı da bir ileti gönderdiğinde\r\netkileşimli video / hiper çerçeve becerisi, birkaç kısa kompozisyon oluşturmayı tercih ediyor\r\nçekimleri tek bir uzun yekpare klip yerine tek bir zaman çizelgesine sığdırın.',
  },
  'video-template-frame-bold-poster': {
    description: 'Kullanıcı "Kalın Poster Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Hareketli bir 1970\'ler Avrupa editoryal posteri - karşıdan karşıya kırmızı bir kural çizilir, dev bir eğimli figür içeri girer, üç satırlı bir başlık satır satır yükselir, önce italik serifli bir stand kaybolur.',
    examplePrompt: 'Kullanıcı "Kalın Poster Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Hareketli bir 1970\'ler Avrupa editoryal posteri - karşıdan karşıya kırmızı bir kural çizilir, dev bir eğimli figür içeri girer, üç satırlı bir başlık satır satır yükselir, önce italik serifli bir stand kaybolur.',
  },
  'video-template-frame-bold-signal': {
    description: 'Kullanıcı "Kalın Sinyal Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Koyu bir degrade üzerinde kalın renkli kart - büyük bölüm numarası, gezinme kırıntısı, içeri kayan turuncu kart, yükselen başlık.',
    examplePrompt: 'Kullanıcı "Kalın Sinyal Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Koyu bir degrade üzerinde kalın renkli kart - büyük bölüm numarası, gezinme kırıntısı, içeri kayan turuncu kart, yükselen başlık.',
  },
  'video-template-frame-build-minimal': {
    description: 'Kullanıcı "Minimal Çerçeve Oluştur" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Lüks-minimum boşluk kahramanı - tek kelimeyle harf harf, sıcak altın saç çizgisi, nefes alma göstergeleri ortaya çıkar.',
    examplePrompt: 'Kullanıcı "Minimal Çerçeve Oluştur" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Lüks-minimum boşluk kahramanı - tek kelimeyle harf harf, sıcak altın saç çizgisi, nefes alma göstergeleri ortaya çıkar.',
  },
  'video-template-frame-creative-voltage': {
    description: 'Kullanıcı bir "Yaratıcı Gerilim Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Elle çizilmiş metinle elektrikli bölme - ofset paneller içeri kayar, ekran başlığı ana hatlarıyla belirtilen bir kelimeyle yükselir, komut dosyası kendi kendine içeri girer.',
    examplePrompt: 'Kullanıcı bir "Yaratıcı Gerilim Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Elle çizilmiş metinle elektrikli bölme - ofset paneller içeri kayar, ekran başlığı ana hatlarıyla belirtilen bir kelimeyle yükselir, komut dosyası kendi kendine içeri girer.',
  },
  'video-template-frame-data-chart-nyt': {
    description: 'Kullanıcı "NYT Tarzı Veri Tablosu Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - NYT haber odası tipografisi, kademeli gösterim animasyonu ve editoryal düzeyde grafikler (çizgi, çubuk veya aralık bandı).',
    examplePrompt: 'Kullanıcı "NYT Tarzı Veri Tablosu Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - NYT haber odası tipografisi, kademeli gösterim animasyonu ve editoryal düzeyde grafikler (çizgi, çubuk veya aralık bandı).',
  },
  'video-template-frame-data-rollup': {
    description: 'Kullanıcı bir "Veri Toplama Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Yerel bir Remotion veri çerçevesi - rakamlar senkronize olarak 0 → hedef dönerken çubuklar bahar fiziği yoluyla gerçek verilerle sıfırdan büyür.',
    examplePrompt: 'Kullanıcı bir "Veri Toplama Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Yerel bir Remotion veri çerçevesi - rakamlar senkronize olarak 0 → hedef dönerken çubuklar bahar fiziği yoluyla gerçek verilerle sıfırdan büyür.',
  },
  'video-template-frame-decision-tree': {
    description: 'Kullanıcı bir "Karar Ağacı" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Dallanma yollarına sahip animasyonlu akış şeması',
    examplePrompt: 'Kullanıcı bir "Karar Ağacı" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Dallanma yollarına sahip animasyonlu akış şeması',
  },
  'video-template-frame-electric-studio': {
    description: 'Kullanıcı bir "Electric Studio Frame" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Kahraman olarak alıntıyla iki panele bölünmüş — beyaz/mavi paneller merkezden açılır, vurgu çubuğu büyür, alıntı satır satır ortaya çıkar.',
    examplePrompt: 'Kullanıcı bir "Electric Studio Frame" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Kahraman olarak alıntıyla iki panele bölünmüş — beyaz/mavi paneller merkezden açılır, vurgu çubuğu büyür, alıntı satır satır ortaya çıkar.',
  },
  'video-template-frame-glitch-title': {
    description: 'Kullanıcı bir "Glitch Başlık Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Video geçişleri veya siberpunk kahramanlar için dijital aksaklık, kromatik kayma ve veri bozulması başlık çerçevesi.',
    examplePrompt: 'Kullanıcı bir "Glitch Başlık Çerçevesi" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Video geçişleri veya siberpunk kahramanlar için dijital aksaklık, kromatik kayma ve veri bozulması başlık çerçevesi.',
  },
  'video-template-frame-kinetic-type': {
    description: 'Kullanıcı "Kinetik Tip" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Kalın kinetik tipografi tanıtımı',
    examplePrompt: 'Kullanıcı "Kinetik Tip" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Kalın kinetik tipografi tanıtımı',
  },
  'video-template-frame-light-leak-cinema': {
    description: 'Kullanıcı "Işık Sızdıran Sinematik Çerçeve" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Sinematik açılışlar veya bölüm kartları için ışık sızıntılarını, greni, 16:9 posta kutusunu ve büyük serif türünü filme alın.',
    examplePrompt: 'Kullanıcı "Işık Sızdıran Sinematik Çerçeve" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Sinematik açılışlar veya bölüm kartları için ışık sızıntılarını, greni, 16:9 posta kutusunu ve büyük serif türünü filme alın.',
  },
  'video-template-frame-liquid-bg-hero': {
    description: 'Kullanıcı bir "Sıvı Arka Plan Kahramanı" HyperFrames hareketli video istediğinde bu eklentiyi kullanın; video tanıtımlarına, açılış kahramanlarına veya posterlere uygun, alıntı katmanı içeren WebGL tarzı akışkan yer değiştirme arka planı.',
    examplePrompt: 'Kullanıcı bir "Sıvı Arka Plan Kahramanı" HyperFrames hareketli video istediğinde bu eklentiyi kullanın; video tanıtımlarına, açılış kahramanlarına veya posterlere uygun, alıntı katmanı içeren WebGL tarzı akışkan yer değiştirme arka planı.',
  },
  'video-template-frame-logo-outro': {
    description: 'Kullanıcı bir "Logo Outro Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Video çıkışları veya marka kapanış çerçeveleri için bölümlere ayrılmış logo montajı, parıltılı çiçeklenme ve slogan gösterimi.',
    examplePrompt: 'Kullanıcı bir "Logo Outro Çerçevesi" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Video çıkışları veya marka kapanış çerçeveleri için bölümlere ayrılmış logo montajı, parıltılı çiçeklenme ve slogan gösterimi.',
  },
  'video-template-frame-nyt-graph': {
    description: 'Kullanıcı bir "NYT Graph" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Basılı editoryal tarzda animasyonlu veri grafiği',
    examplePrompt: 'Kullanıcı bir "NYT Graph" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Basılı editoryal tarzda animasyonlu veri grafiği',
  },
  'video-template-frame-pentagram-stat': {
    description: 'Kullanıcı bir "Pentagram Stat Frame" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - İsviçre ızgara istatistik çapası - dev sayı, kırmızı vurgu, büyüyen çubuklar, siyah veri çubuğu. Rasyonel ve editoryal.',
    examplePrompt: 'Kullanıcı bir "Pentagram Stat Frame" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - İsviçre ızgara istatistik çapası - dev sayı, kırmızı vurgu, büyüyen çubuklar, siyah veri çubuğu. Rasyonel ve editoryal.',
  },
  'video-template-frame-play-mode': {
    description: 'Kullanıcı "Oynatma Modu" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Eğlenceli elastik animasyonlar',
    examplePrompt: 'Kullanıcı "Oynatma Modu" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Eğlenceli elastik animasyonlar',
  },
  'video-template-frame-product-promo': {
    description: 'Kullanıcı bir "Ürün Tanıtımı" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — SVG varlıkları içeren çok sahneli ürün vitrini',
    examplePrompt: 'Kullanıcı bir "Ürün Tanıtımı" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — SVG varlıkları içeren çok sahneli ürün vitrini',
  },
  'video-template-frame-product-promo-30s': {
    description: 'Kullanıcı bir "Ürün Promosyonu · 30\'lar" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Çok sahneli 30 saniyelik ürün tanıtımı: sorun türü tanıtımı, marka açıklaması, fayda akış şeması, ürün yüzeyleri, değer sütunları, temel, CTA çıkışı. Nate Herk\'ün hiper çerçeveleri öğrenci setinden (doğrusal promosyon 30\'lar) çatallanmıştır; markaya özgü kopya + varlıklar, genel yer tutucularla değiştirildi.',
    examplePrompt: 'Kullanıcı bir "Ürün Promosyonu · 30\'lar" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Çok sahneli 30 saniyelik ürün tanıtımı: sorun türü tanıtımı, marka açıklaması, fayda akış şeması, ürün yüzeyleri, değer sütunları, temel, CTA çıkışı. Nate Herk\'ün hiper çerçeveleri öğrenci setinden (doğrusal promosyon 30\'lar) çatallanmıştır; markaya özgü kopya + varlıklar, genel yer tutucularla değiştirildi.',
  },
  'video-template-frame-swiss-grid': {
    description: 'Kullanıcı "İsviçre Izgarası" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Yapılandırılmış ızgara düzeni',
    examplePrompt: 'Kullanıcı "İsviçre Izgarası" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın — Yapılandırılmış ızgara düzeni',
  },
  'video-template-frame-takram-organic': {
    description: 'Kullanıcı bir "Takram Organik Çerçeve" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Sanat eseri olarak yumuşak teknolojili radyal düğüm grafiği - buzlu yuvarlak kart, içeri doğru çekilen kavisli bağlantılar, dışarı doğru fırlayan düğümler, hafifçe süzülme.',
    examplePrompt: 'Kullanıcı bir "Takram Organik Çerçeve" HyperFrames hareketli videosu istediğinde bu eklentiyi kullanın - Sanat eseri olarak yumuşak teknolojili radyal düğüm grafiği - buzlu yuvarlak kart, içeri doğru çekilen kavisli bağlantılar, dışarı doğru fırlayan düğümler, hafifçe süzülme.',
  },
  'video-template-frame-vignelli': {
    description: 'Kullanıcı "Vignelli" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Kırmızı vurgulu kalın tipografi',
    examplePrompt: 'Kullanıcı "Vignelli" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Kırmızı vurgulu kalın tipografi',
  },
  'video-template-frame-warm-grain': {
    description: 'Kullanıcı "Sıcak Tahıl" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Tahıl dokulu krem ​​rengi estetik',
    examplePrompt: 'Kullanıcı "Sıcak Tahıl" HyperFrames hareketli video istediğinde bu eklentiyi kullanın — Tahıl dokulu krem ​​rengi estetik',
  },
  'video-template-vfx-text-cursor': {
    description: 'Kullanıcı bir "VFX Metin İmleci" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Video tanıtımlarında kelime kelime alıntıların gösterilmesi için imleç ışık izi, kromatik ışınlar ve yönlü işaret fişekleri.',
    examplePrompt: 'Kullanıcı bir "VFX Metin İmleci" HyperFrames hareketli video istediğinde bu eklentiyi kullanın - Video tanıtımlarında kelime kelime alıntıların gösterilmesi için imleç ışık izi, kromatik ışınlar ve yönlü işaret fişekleri.',
  },
  'waitlist-page': {
    description: 'E-posta yakalama, marka logosu ve isteğe bağlı dekoratif katmanla minimum lansman öncesi açılış.\r\nRenkler, tipografi ve düzen kuralları için DESIGN.md dosyasını okur.\r\nEn iyisi: ürün lansmanları, beta kayıtları, erken erişim programları, bağımsız projeler.',
    examplePrompt: 'E-posta yakalama, marka logosu ve isteğe bağlı dekoratif katmanla minimum lansman öncesi açılış.\r\nRenkler, tipografi ve düzen kuralları için DESIGN.md dosyasını okur.\r\nEn iyisi: ürün lansmanları, beta kayıtları, erken erişim programları, bağımsız projeler.',
  },
  'web-artifacts-builder': {
    description: 'React ve Tailwind ile karmaşık claude.ai HTML yapıtları oluşturun. Anthropic\'in zengin, gömülebilir yapıtlar yayınlamak için referans iş akışı.',
    examplePrompt: 'React ve Tailwind ile karmaşık claude.ai HTML yapıtları oluşturun.',
  },
  'web-design-guidelines': {
    description: 'Vercel mühendislik ekibi tarafından hazırlanan web tasarım yönergeleri ve standartları. Ürün UI\'ı için düzen, tipografi, renk, hareket ve erişilebilirliği kapsar.',
    examplePrompt: 'Vercel mühendislik ekibi tarafından hazırlanan web tasarım yönergeleri ve standartları.',
  },
  'web-prototype': {
    description: 'Genel amaçlı masaüstü web prototipi. Tek bağımsız HTML dosyası oluşturuldu\r\n`assets/template.html` tohumunu kopyalayıp bölüm düzenlerini şuradan yapıştırarak\r\n\'referanslar/layouts.md\'. Herhangi bir açılış/pazarlama/belgeler/SaaS için varsayılan\r\nArtık belirli bir beceri eşleşmesi olmadığında sayfa.',
    examplePrompt: 'Genel amaçlı masaüstü web prototipi. Tek bağımsız HTML dosyası oluşturuldu\r\n`assets/template.html` tohumunu kopyalayıp bölüm düzenlerini şuradan yapıştırarak\r\n\'referanslar/layouts.md\'. Herhangi bir açılış/pazarlama/belgeler/SaaS için varsayılan\r\nArtık belirli bir beceri eşleşmesi olmadığında sayfa.',
  },
  'web-prototype-taste-brutalist': {
    description: 'İsviçre endüstriyel baskı web prototipi. Gazete kağıdı tuvali, yekpare siyah grotesk, görüntü alanı taşan rakamlar, ince çizgili ızgara bölücüler, tehlike kırmızısı vurgu, ASCII sözdizimi dekorasyonu. Leonxlnx/taste-skill `brutalist-skill\'den (İsviçre Endüstriyel Baskı modu) damıtılmıştır.',
    examplePrompt: 'İsviçre endüstriyel baskı web prototipi. Gazete kağıdı tuvali, yekpare siyah grotesk, görüntü alanı taşan rakamlar, ince çizgili ızgara bölücüler, tehlike kırmızısı vurgu, ASCII sözdizimi dekorasyonu. Leonxlnx/taste-skill `brutalist-skill\'den (İsviçre Endüstriyel Baskı modu) damıtılmıştır.',
  },
  'web-prototype-taste-editorial': {
    description: 'Editoryal-minimalist web prototipi. Sıcak monokrom tuval, serif ekran + grotesk gövde, 1 piksel ince çizgili kenarlıklar, yumuşak pastel parçalar, cömert makro boşluk, ortamdaki mikro hareket. Leonxlnx/taste-skill `minimalist-skill\'den damıtılmıştır.',
    examplePrompt: 'Editoryal-minimalist web prototipi. Sıcak monokrom tuval, serif ekran + grotesk gövde, 1 piksel ince çizgili kenarlıklar, yumuşak pastel parçalar, cömert makro boşluk, ortamdaki mikro hareket. Leonxlnx/taste-skill `minimalist-skill\'den damıtılmıştır.',
  },
  'web-prototype-taste-soft': {
    description: 'Apple düzeyinde yumuşak web prototipi. Gümüş/krem kanvas, çift çerçeveli kartlar, düğmeli CTA\'lar, cömert sincap yarıçapları, yay hareketi, ortam ağı. Leonxlnx/taste-skill "soft-skill" + "taste-skill"in 4-8. bölümlerinden damıtılmıştır.',
    examplePrompt: 'Apple düzeyinde yumuşak web prototipi. Gümüş/krem kanvas, çift çerçeveli kartlar, düğmeli CTA\'lar, cömert sincap yarıçapları, yay hareketi, ortam ağı. Leonxlnx/taste-skill "soft-skill" + "taste-skill"in 4-8. bölümlerinden damıtılmıştır.',
  },
  'weekly-update': {
    description: 'Haftalık ekip güncellemesi için tek dosyalı, yatay kaydırmalı slayt destesi —\r\nsevk edildi, uçuşta, engellendi, ölçümler, sorar. 6-8 slayt. Şu durumlarda kullanın:\r\n"haftalık güncelleme", "ekip güncelleme slaytları", "haftalık durum" gibi kısa bilgiler,\r\n"周报演示".',
    examplePrompt: 'Haftalık ekip güncellemesi için tek dosyalı, yatay kaydırmalı slayt destesi —\r\nsevk edildi, uçuşta, engellendi, ölçümler, sorar. 6-8 slayt. Şu durumlarda kullanın:\r\n"haftalık güncelleme", "ekip güncelleme slaytları", "haftalık durum" gibi kısa bilgiler,\r\n"周报演示".',
  },
  'weread-year-in-review-video-template': {
    description: 'Dikey yıllık okuma raporları, kişisel okuma panoları, kitap notu özetleri ve\npaylaşılabilir yıl değerlendirmesi hikayeleri için WeRead\'den ilham alan HyperFrames\nvideo şablonu. Kullanıcılar sıcak kağıt dokusu, editöryel Çince tipografi, kitap\nsayfası metaforları, veri vurguları ve deterministik hareket içeren 9:16 HTML-to-MP4\nokuma raporu istediğinde kullanın.',
    examplePrompt: '12 sahneli, sıcak kağıt dokusu, kitap sayfası geçişleri, okuma istatistikleri, notlar, anahtar kelimeler ve son bir okuma kişiliği kartı içeren WeRead tarzı 9:16 HyperFrames yıllık okuma raporu videosu oluşturun.',
  },
  'wireframe-sketch': {
    description: 'Elle çizilmiş bir tel çerçeve araştırması — grafik kağıdı arka planı, işaretleyici /\r\nkalem tonu, çeşitler için çoklu sekme etiketleri, yapışkan not açıklamaları,\r\nkaralanmış grafik yer tutucuları, taranmış dolgular. Bir tasarımcınınki gibi okunur\r\nherhangi bir piksel kaydedilmeden önce beyaz tahta. Özet şunu istediğinde kullanın\r\n"tel kafes", "taslak tel kafes", "elle çizilmiş", "lo-fi", "beyaz tahta",\r\n"草稿" veya "手绘原型".',
    examplePrompt: 'Elle çizilmiş bir tel çerçeve araştırması — grafik kağıdı arka planı, işaretleyici /\r\nkalem tonu, çeşitler için çoklu sekme etiketleri, yapışkan not açıklamaları,\r\nkaralanmış grafik yer tutucuları, taranmış dolgular. Bir tasarımcınınki gibi okunur\r\nherhangi bir piksel kaydedilmeden önce beyaz tahta. Özet şunu istediğinde kullanın\r\n"tel kafes", "taslak tel kafes", "elle çizilmiş", "lo-fi", "beyaz tahta",\r\n"草稿" veya "手绘原型".',
  },
  'wpds': {
    description: 'WordPress Tasarım Sistemi. WordPress\'in resmi tasarım belirteçlerini, tipografisini ve bileşen kalıplarını temalara ve sitelere uygulayın.',
    examplePrompt: 'WordPress Tasarım Sistemi.',
  },
  'x-research': {
    description: 'X/Twitter\'ın güncel pazar, şirket, ürün veya\r\ntopluluk söylemi. Özette insanların X hakkında ne söylediklerini sorduğunda kullanın,\r\nTwitter duyarlılığı, CT duyarlılığı, kamuoyu, uzman gönderileri veya sosyal\r\nbir hisse senedi, sektör, şirket, ürün veya pazar olayı etrafındaki tepki.',
    examplePrompt: 'X/Twitter\'ın güncel pazar, şirket, ürün veya\r\ntopluluk söylemi. Özette insanların X hakkında ne söylediklerini sorduğunda kullanın,\r\nTwitter duyarlılığı, CT duyarlılığı, kamuoyu, uzman gönderileri veya sosyal\r\nbir hisse senedi, sektör, şirket, ürün veya pazar olayı etrafındaki tepki.',
  },
  'youtube-clipper': {
    description: 'Otomatik iş akışlarıyla YouTube klibi üretimi ve düzenleme — kaynak videoyu çekin, öne çıkanları kesin, altyazı ekleyin ve dışa aktarın.',
    examplePrompt: 'Otomatik iş akışlarıyla YouTube klibi üretimi ve düzenleme — kaynak videoyu çekin, öne çıkanları kesin, altyazı ekleyin ve dışa aktarın.',
  },
};

export const TR_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Minimum denetimler, net sonuçlar ve ajanik iş akışları için devredilmiş görev akışları içeren, konuşma odaklı yapay zekâ öncelikli arayüz.',
  'airbnb': 'Seyahat pazaryeri. Sıcak mercan vurgu, fotoğraf odaklı, yuvarlatılmış UI.',
  'airtable': 'Elektronik tablo-veritabanı melezi. Renkli, samimi, yapılandırılmış veri estetiği.',
  'ant': 'Veri yoğun web uygulamaları için netliği, tutarlılığı ve verimliliği öne çıkaran, yapılandırılmış, kurumsal odaklı tasarım sistemi.',
  'apple': 'Tüketici elektroniği. Premium beyaz alan, SF Pro, sinematik görseller.',
  'application': 'Mor temalı estetik, üst çubuk navigasyonu, kart tabanlı düzenler ve geliştirici öncelikli iş akışları içeren uygulama panosu.',
  'arc': '"Sizin yerinize gezinen tarayıcı." Yarı saydam yüzeyler, gradyan sıcaklığı, kenar çubuğu öncelikli düzen.',
  'artistic': 'Görsel olarak çarpıcı arayüzler için yaratıcı tipografi ve cesur renk seçimleriyle yüksek kontrastlı, etkileyici stil.',
  'atelier-zero': 'Dergi kalitesinde, kolaj odaklı bir görsel sistem: sıcak kağıt tuvali, gerçeküstü\nalçı-ve-mimari görseller, aşırı büyük teşhir yazı tipi, ince çizgi kuralları,\nRoma rakamı bölüm işaretleri ve minik editöryel ek açıklamalar.\nProdüksiyon v\'den ilham alınmıştır',
  'bento': 'Düzenli, taranabilir arayüzler için kart benzeri bloklar, net hiyerarşi, yumuşak aralık ve ince görsel kontrast içeren modüler ızgara düzeni.',
  'binance': 'Kripto borsası. Tek renkli zemin üzerinde cesur sarı vurgu, işlem salonu aciliyeti.',
  'bmw': 'Lüks otomotiv. Koyu, premium yüzeyler, hassas Alman mühendisliği estetiği.',
  'bmw-m': 'Motor sporları performans alt markası. Neredeyse siyah kokpit yüzeyleri, BMW M üç renkli vurguları, keskin mühendislik geometrisi.',
  'bold': 'Ağır siklet tipografi, yüksek kontrastlı renkler ve etkileyici düzenlerle güçlü görsel varlık.',
  'brutalism': 'Süslemesiz öğeler, sarsıcı düzenler ve işlevsel minimalizmle, beton mimarisinden ilham alan ham, anti-tasarım estetiği.',
  'bugatti': 'Hiper otomobil markası. Sinema siyahı tuval, tek renkli sadelik, anıtsal başlık tipografisi.',
  'cafe': 'Sıcak tonlar, yumuşak tipografi ve sade düzenlerle rahat bir gezinme deneyimi sunan, samimi kafelerden ilham alan arayüz.',
  'cal': 'Açık kaynaklı planlama. Temiz, nötr arayüz, geliştirici odaklı sadelik.',
  'canva': 'Görsel oluşturma platformu. Canlı mor-mavi degrade, bol boşluk, dostça geometri.',
  'cisco': 'Kurumsal altyapı markası. Koyu, güven veren yüzeyler, Cisco Blue sinyali, teknik berraklık.',
  'claude': 'Anthropic\'in yapay zeka asistanı. Sıcak terrakota vurgusu, temiz editöryal düzen.',
  'clay': 'Yaratıcı ajans. Organik şekiller, yumuşak degradeler, sanat yönetimli düzen.',
  'claymorphism': 'Eğlenceli, kabarık öğeler ve renkli yüzeylerle, şekillendirilebilir kili andıran yumuşak, yuvarlatılmış 3D benzeri şekiller.',
  'clean': 'Görsel karmaşayı azaltmak için bol beyaz alan, okunaklı tipografi ve sınırlı renk paletiyle sadelik odaklı tasarım.',
  'clickhouse': 'Hızlı analitik veritabanı. Sarı vurgulu, teknik dokümantasyon tarzı.',
  'cohere': 'Kurumsal yapay zeka platformu. Canlı degradeler, veri zengini gösterge paneli estetiği.',
  'coinbase': 'Kripto borsası. Temiz mavi kimlik, güven odaklı, kurumsal his.',
  'colorful': 'İlgi çekici, akılda kalıcı ve modern kullanıcı deneyimleri için canlı, yüksek kontrastlı paletler ve degradeler.',
  'composio': 'Araç entegrasyon platformu. Renkli entegrasyon simgeleriyle modern koyu tema.',
  'contemporary': 'Bento ızgaraları, koyu mod desteği ve yüksek performanslı, erişilebilir düzenlerle güncel dönem minimalist tasarımı.',
  'corporate': 'Yapılandırılmış ızgaralar, minimalist düzenler ve tutarlı kurumsal kalıplarla profesyonel, markaya uygun tasarım.',
  'cosmic': 'Koyu temalar, canlı neon vurgular ve sürükleyici uzamsal öğelerle fütüristik bilim kurgu estetiği.',
  'creative': 'Açılış sayfaları ve yaratıcı projeler için anlatımcı tipografi ve cesur grafiklerle eğlenceli, karakter odaklı tasarım.',
  'cursor': 'Yapay zeka öncelikli kod editörü. Şık koyu arayüz, degrade vurgular.',
  'dashboard': 'Verimlilik gösterge panelleri için modüler ızgaralar, cam benzeri paneller ve güçlü veri hiyerarşisiyle koyu temalı bulut platformu estetiği.',
  'default': 'B2B araçları, gösterge panelleri ve yardımcı program sayfaları için temiz, ürün odaklı bir varsayılan.',
  'discord': 'Sesli / sohbet platformu. Derin mor-mavi, koyu öncelikli yüzeyler, eğlenceli vurgu anları.',
  'dithered': 'Nostaljik, retro, yüksek kontrastlı görseller için sınırlı bir paletle tonları taklit eden nokta desenli işleme tekniği.',
  'doodle': 'Karalamalar, el yazısı fontlar ve kusurlu çizgilerle eğlenceli, gayriresmi bir his veren el çizimi, eskiz benzeri stil.',
  'dramatic': 'Cesur düzenler, sürükleyici görseller ve dikkat çeken sıra dışı kompozisyonlarla yüksek kontrastlı, teatral tasarım.',
  'duolingo': 'Dil öğrenme platformu. Parlak baykuş yeşili, kalın gölgeler, oyunlaştırılmış neşe.',
  'editorial': 'Rafine serif tipografi, yapılandırılmış ızgaralar ve zarif okuma deneyimleriyle dergiden ilham alan editöryal düzen.',
  'elegant': 'Zarif tipografi, sade paletler ve incelik yayan cilalı düzenlerle nazik, rafine estetik.',
  'elevenlabs': 'Yapay zeka ses platformu. Koyu sinematik arayüz, ses dalga formu estetiği.',
  'energetic': 'Kalın kenarlıklar, geometrik şekiller, yüksek kontrastlı renkler ve hareket ile canlılık aktaran anlatımcı tipografiyle dinamik, canlı stil.',
  'enterprise': 'Sezgisel sürükle-bırak kalıpları ve yapılandırılmış düzenlerle veri odaklı iş akışları için temiz, yüksek kontrastlı kurumsal tasarım.',
  'expo': 'React Native platformu. Koyu tema, dar harf aralığı, kod odaklı.',
  'expressive': 'Cesur renkler, eğlenceli grafikler ve yaratıcılığı yapıyla dengeleyen dinamik düzenlerle canlı, kişilik odaklı tasarım.',
  'fantasy': 'Cesur, premium görseller, zengin renk paletleri ve sürükleyici tematik öğelerle oyundan ilham alan fantastik estetik.',
  'ferrari': 'Lüks otomotiv. Chiaroscuro editöryal, Ferrari Red vurguları, sinematik siyah.',
  'figma': 'İşbirlikçi tasarım aracı. Canlı çok renkli, eğlenceli ama profesyonel.',
  'flat': 'Canlı renkler, sade tipografi ve 3D efekti olmayan, hızlı ve kullanıcı dostu arayüzler için iki boyutlu minimalist stil.',
  'framer': 'Web sitesi oluşturucu. Cesur siyah ve mavi, hareket öncelikli, tasarım odaklı.',
  'friendly': 'Yuvarlatılmış öğeler, bol boşluk ve yumuşak pastel renk paletleriyle ulaşılabilir, sezgisel tasarım.',
  'futuristic': 'Teknolojiden ilham alan tipografi, modern düzenler ve şık, yenilik odaklı bir estetiğe sahip ileri görüşlü tasarım.',
  'github': 'Kod öncelikli platform. İşlevsel yoğunluk, beyaz üzerine mavi hassasiyet, Primer temelleri.',
  'glassmorphism': 'Derinlik ve modern zarafet için yarı saydam katmanlar, ince bulanıklık ve parlak kenarlarla buzlu cam efekti.',
  'gradient': 'Görsel derinliğe sahip modern, eğlenceli arayüzler için pürüzsüz renk geçişleri ve gradyan açısından zengin yüzeyler.',
  'hashicorp': 'Altyapı otomasyonu. Kurumsal sadelikte, siyah beyaz.',
  'hud': 'Savaş uçağı / helikopter baş üstü göstergesi. Neredeyse siyah üzerine fosfor yeşili, tümü büyük harf veri katmanları, açısal geometri. Hız ve irtifada sıfır belirsizlik.',
  'huggingface': 'ML topluluk merkezi. Güneşli sarı vurgu, monospace kimlik, neşeli ve yoğun.',
  'ibm': 'Kurumsal teknoloji. Carbon tasarım sistemi, yapılandırılmış mavi palet.',
  'intercom': 'Müşteri mesajlaşması. Dostça mavi palet, sohbet tarzı arayüz desenleri.',
  'kami': 'Editöryel kağıt sistemi: sıcak parşömen tuval, mürekkep mavisi vurgu, serif öncelikli hiyerarşi. Özgeçmişler, tek sayfalıklar, beyaz bültenler, portföyler, sunum desteleri için tasarlanmış — arayüzden çok kaliteli baskı hissi vermesi gereken her şey. Varsayılan olarak çok dilli.',
  'kraken': 'Kripto ticareti. Mor vurgulu koyu arayüz, veri yoğun panolar.',
  'lamborghini': 'Süper araba markası. Gerçek siyah yüzeyler, altın vurgular, çarpıcı büyük harf tipografi.',
  'levels': 'Sürtünmeyi ortadan kaldıran ve netlik, güven ve hızla kullanıcıları eyleme yönlendiren dönüşüm odaklı tasarım.',
  'linear-app': 'Proje yönetimi. Ultra minimal, hassas, mor vurgu.',
  'lingo': 'Ulaşılabilir arayüzler için parlak renkler, yuvarlatılmış şekiller, dokunsal 3D kenarlar ve dostça illüstrasyonlarla eğlenceli, minimal tasarım.',
  'loom': 'Loom asenkron video. Mor ana renk, dostça yüzeyler, video öncelikli düzen. Kurumsal olmadan temiz ve profesyonel.',
  'lovable': 'AI full-stack oluşturucu. Eğlenceli gradyanlar, dostça geliştirici estetiği.',
  'luxury': 'Lüks marka deneyimleri için cesur başlıklar, monokromatik palet ve premium his veren üst düzey koyu estetik.',
  'mastercard': 'Küresel ödeme ağı. Sıcak krem tuval, yörüngesel hap şekilleri, editöryel sıcaklık.',
  'material': 'Google\'ın Material Design\'ı: katmanlı yüzeyler, dinamik temalandırma, yerleşik hareket ve duyarlı çapraz platform desenleri.',
  'meta': 'Teknoloji perakende mağazası. Fotoğraf öncelikli, ikili açık/koyu yüzeyler, Meta Blue CTA\'lar.',
  'minimal': 'Maksimum netlik ve odak için boşluğu, sade tipografiyi ve ölçülü rengi öne çıkaran sade tasarım.',
  'minimax': 'AI model sağlayıcısı. Neon vurgulu cesur koyu arayüz.',
  'mintlify': 'Dokümantasyon platformu. Temiz, yeşil vurgulu, okumaya optimize edilmiş.',
  'miro': 'Görsel işbirliği. Parlak sarı vurgu, sonsuz tuval estetiği.',
  'mission-control': 'Uzay/havacılık görev izleme. Koyu komuta merkezi, kehribar telemetri, monospace hassasiyet. Her şeyin üstünde işlevsel netlik.',
  'mistral-ai': 'Açık ağırlıklı LLM sağlayıcısı. Fransız mühendisliği minimalizmi, mor tonlu.',
  'modern': 'Cilalı dijital ürünler için serif tipografi, minimal paletler ve temiz düzenlere sahip çağdaş editöryel stil.',
  'mongodb': 'Belge veritabanı. Yeşil yaprak markası, geliştirici dokümantasyonu odaklı.',
  'mono': 'Yüksek kontrastlı öğeler, kompakt yoğunluk ve hacker-chic estetiğiyle monospace odaklı, matrixten ilham alan tasarım.',
  'neobrutalism': 'Cesur kenarlar, canlı vurgu renkleri ve sıcak yüzeyler üzerinde ham, yüksek kontrastlı düzenlerle brütalizme modern bir bakış.',
  'neon': 'Cesur, dikkat çekici arayüzler için yüksek kontrastlı renk eşleşmeleriyle elektrik neon parıltı efektleri.',
  'neumorphism': 'Dokunsal, gömülü bir görünüm için monokromatik yüzeylerde iç ve dış gölgeli yumuşak, kabartmalı arayüz öğeleri.',
  'nike': 'Spor perakende. Monokrom arayüz, devasa büyük harf yazı tipi, tam kanama fotoğrafçılık.',
  'notion': 'Hepsi bir arada çalışma alanı. Sıcak minimalizm, serif başlıklar, yumuşak yüzeyler.',
  'nvidia': 'GPU bilişim. Yeşil-siyah enerji, teknik güç estetiği.',
  'ollama': 'LLM\'leri yerel olarak çalıştırın. Terminal öncelikli, monokrom sadelik.',
  'openai': 'Derin teal-siyaha dayanan, bol beyaz alan ve editöryal tipografiyle sakin, monokroma yakın bir sistem.',
  'opencode-ai': 'Yapay zeka kodlama platformu. Geliştirici odaklı koyu tema.',
  'pacman': 'Piksel fontlar, noktalı kenarlıklar, eğlenceli yüksek kontrastlı renkler ve 8-bit oyun estetiğiyle retro arcade esinli tasarım.',
  'paper': 'Minimal renkler, temiz serif/sans tipografi ve dokunsal yüzey nitelikleriyle kağıt dokulu, baskı esinli tasarım.',
  'perplexity': 'Konuşma temelli yapay zeka arama motoru. Derin koyu tuval, keskin tipografi, tek mor vurgu, yoğun bilgi hiyerarşisi.',
  'perspective': 'İzometrik görünümler, kaçış noktaları ve dikkati 3B benzeri gerçekçilikle yönlendiren katmanlı öğelerle mekansal derinlik tasarımı.',
  'pinterest': 'Görsel keşif. Kırmızı vurgu, masonry ızgara, görsel öncelikli.',
  'playstation': 'Oyun konsolu perakendesi. Üç yüzeyli kanal düzeni, sakin-otorite gösterim tipografisi, cyan hover-ölçeklendirme.',
  'posthog': 'Ürün analitiği. Eğlenceli kirpi markalaması, geliştirici dostu koyu arayüz.',
  'premium': 'Hassas boşluklar, modern tipografi ve rafine, cilalı bir görsel dille Apple esinli premium estetik.',
  'professional': 'Modern tipografi, yapılandırılmış düzenler ve güven veren bir görsel kimlikle cilalı, işe hazır tasarım.',
  'publication': 'Editöryal ızgaralar ve etkileyici tipografiyle kitaplar, dergiler ve raporlar için baskı esinli görsel dil.',
  'raycast': 'Verimlilik başlatıcısı. Şık koyu krom, canlı gradyan vurgular.',
  'refined': 'Zarif serif tipografi ve sade, sofistike paletlerle özenle seçilmiş, modern minimal stil.',
  'renault': 'Fransız otomotiv. Canlı aurora gradyanları, NouvelR tipografisi, cesur enerji.',
  'replicate': 'API üzerinden ML modelleri çalıştırın. Temiz beyaz tuval, kod öncelikli.',
  'resend': 'E-posta API\'si. Minimal koyu tema, monospace vurgular.',
  'retro': 'Vintage esinli tipografi, yüksek kontrastlı retro paletler ve nostaljik görsel öğelerle geçmişe dönük tasarım.',
  'revolut': 'Dijital bankacılık. Şık koyu arayüz, gradyan kartlar, fintech hassasiyeti.',
  'runwayml': 'Yapay zeka video üretimi. Sinematik koyu arayüz, medya zengini düzen.',
  'sanity': 'Headless CMS. Kırmızı vurgu, içerik öncelikli editöryal düzen.',
  'sentry': 'Hata izleme. Koyu gösterge paneli, veri yoğun, pembe-mor vurgu.',
  'shadcn': 'Minimal, temiz bileşenler, monokrom palet ve utility-first kalıplarla Shadcn/ui esinli tasarım.',
  'shopify': 'E-ticaret platformu. Koyu öncelikli sinematik, neon yeşil vurgu, ultra-hafif tipografi.',
  'simple': 'Temiz tipografi, nötr renkler ve önünüzde durmayan sezgisel düzenlerle dolaysız, gösterişsiz tasarım.',
  'skeumorphism': 'Dokulu yüzeyler, 3B efektler ve sezgisel dijital arayüzler için tanıdık fiziksel metaforlarla gerçek dünya taklidi.',
  'slack': 'İş yeri iletişim platformu. Patlıcan-birincil, çok vurgulu logo paleti, koyu kenar çubuğuyla açık yüzeyler, sıcak ve davetkar.',
  'sleek': 'Temiz çizgiler, kasıtlı renk paleti, ince etkileşimler ve tutarlı boşluklarla modern minimalist estetik.',
  'spacex': 'Uzay teknolojisi. Çarpıcı siyah-beyaz, tam taşan görseller, fütüristik.',
  'spacious': 'Temiz, okunabilir ve nefes alan arayüzler için bol beyaz alan, tutarlı dolgu ve ızgara temelli düzenler.',
  'spotify': 'Müzik akışı. Koyu üzerine canlı yeşil, cesur tipografi, albüm kapağı odaklı.',
  'starbucks': 'Küresel kahve perakende markası. Dört katmanlı yeşil sistem, sıcak krem tuval, tam-hap düğmeler.',
  'storytelling': 'Kullanıcıları çekici, duygusal olarak yankı uyandıran yolculuklar boyunca yönlendirmek için görseller, metin ve etkileşim kullanan anlatı odaklı tasarım.',
  'stripe': 'Ödeme altyapısı. İmza niteliğindeki mor gradyanlar, weight-300 zarafeti.',
  'supabase': 'Açık kaynaklı Firebase alternatifi. Koyu zümrüt tema, kod öncelikli.',
  'superhuman': 'Hızlı e-posta istemcisi. Premium koyu arayüz, klavye öncelikli, mor parıltı.',
  'tesla': 'Elektrikli otomotiv. Radikal çıkarma, tam görüntü alanı fotoğrafçılığı, neredeyse sıfır arayüz.',
  'tetris': 'Eğlenceli renkler, cesur gösterim fontları ve kompakt, yüksek enerjili düzenlerle klasik blok-oyun esinli tasarım.',
  'theverge': 'Teknoloji editöryal medyası. Asit-nane ve ultraviyole vurgular, Manuka gösterim tipografisi, rave-broşürü hikaye karoları.',
  'together-ai': 'Açık kaynaklı yapay zeka altyapısı. Teknik, taslak tarzı tasarım.',
  'totality-festival': 'Bir güneş tutulmasının içten gelen huşusunu yakalayan kozmik-premium, glassmorphic karanlık sistem — obsidyen yüzeyler, kehribar "korona" vurguları ve camgöbeği atmosferik aksanlar.',
  'trading-terminal': 'Bloomberg tarzı finansal işlem terminali. Yalnızca karanlık, veri yoğun, camgöbeği/mercan al/sat sinyalleri. Her şey iki metre öteden bir bakışta okunabilir.',
  'uber': 'Mobilite platformu. Çarpıcı siyah beyaz, sıkı tipografi, kentsel enerji.',
  'urdu': 'Yerel RTL desteği, Nastaliq tipografisi ve iki dilli uyumla Urduca öncelikli dijital deneyimler.',
  'vercel': 'Frontend dağıtımı. Siyah beyaz hassasiyet, Geist yazı tipi.',
  'vibrant': 'Çarpıcı ve eğlenceli tipografi, sıcak aksanlar ve dinamik görsel enerjiyle canlı, renkli tasarım.',
  'vintage': 'Skeuomorphic dokunuşlar, taneli dokular, retro renk paletleri ve piksel tarzı tipografiyle 1950\'ler-1990\'lar nostaljisi.',
  'vodafone': 'Küresel telekom markası. Anıtsal büyük harf gösterimi, Vodafone Red bölüm bantları.',
  'voltagent': 'AI agent çerçevesi. Boşluk karası tuval, zümrüt aksan, terminal yerel.',
  'warm-editorial': 'Serif öncelikli bir dergi estetiği. Sıcak kırık beyaz kağıt üzerinde terracotta aksan —\nuzun biçimli, editöryel ve marka odaklı pazarlama sayfaları için ideal.',
  'warp': 'Modern terminal. Karanlık IDE benzeri arayüz, blok tabanlı komut arayüzü.',
  'webex': 'İşbirliği platformu. Momentum tipografisi, mavi eylem sistemi, çok kullanıcılı aksan spektrumu.',
  'webflow': 'Görsel web oluşturucu. Mavi aksanlı, cilalı pazarlama sitesi estetiği.',
  'wechat': 'WeChat Mini Programları, resmi hesaplar ve açık ekosistem uzantıları için marka görsel dili.',
  'wired': 'Teknoloji dergisi. Kağıt beyazı gazete yoğunluğu, özel serif gösterim, mono üst başlıklar, mürekkep mavisi bağlantılar.',
  'wise': 'Para transferi. Parlak yeşil aksan, samimi ve net.',
  'x-ai': 'Elon Musk\'ın yapay zeka laboratuvarı. Sade tek renk, fütüristik minimalizm.',
  'xiaohongshu': 'Yaşam tarzı UGC sosyal platformu. Tekil marka kırmızısı, cömert köşe yarıçapı, içerik öncelikli.',
  'zapier': 'Otomasyon platformu. Sıcak turuncu, samimi illüstrasyon odaklı.',
};

export const TR_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'AI ve LLM',
  'Automotive': 'Otomotiv',
  'Backend & Data': 'Backend ve Veri',
  'Bold & Expressive': 'Çarpıcı ve İfade Dolu',
  'Creative & Artistic': 'Yaratıcı ve Sanatsal',
  'Design & Creative': 'Tasarım ve Yaratıcılık',
  'Developer Tools': 'Geliştirici Araçları',
  'E-Commerce & Retail': 'E-Ticaret ve Perakende',
  'Editorial · Studio': 'Editöryel · Stüdyo',
  'Editorial / Personal / Publication': 'Editöryel / Kişisel / Yayın',
  'Editorial & Print': 'Editöryel ve Baskı',
  'Fintech & Crypto': 'Fintech ve Kripto',
  'Layout & Structure': 'Düzen ve Yapı',
  'Media & Consumer': 'Medya ve Tüketici',
  'Modern & Minimal': 'Modern ve Minimal',
  'Morphism & Effects': 'Morfizm ve Efektler',
  'Productivity & SaaS': 'Üretkenlik ve SaaS',
  'Professional & Corporate': 'Profesyonel ve Kurumsal',
  'Retro & Nostalgic': 'Retro ve Nostaljik',
  'Social & Messaging': 'Sosyal ve Mesajlaşma',
  'Starter': 'Başlangıç',
  'Themed & Unique': 'Temalı ve Özgün',
};

export const TR_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Reklamcılık',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'Uygulama / Web Tasarımı',
  'Branding': 'Marka Kimliği',
  'Cinematic': 'Sinematik',
  'Data': 'Veri',
  'Game UI': 'Oyun Arayüzü',
  'General': 'Genel',
  'Illustration': 'İllüstrasyon',
  'Infographic': 'İnfografik',
  'Live Artifact': 'Canlı Yapıt',
  'Marketing': 'Pazarlama',
  'Motion Graphics': 'Hareketli Grafikler',
  'Product': 'Ürün',
  'Profile / Avatar': 'Profil / Avatar',
  'Short Form': 'Kısa Form',
  'Social / Meme': 'Sosyal / Mizah',
  'Social Media Post': 'Sosyal Medya Gönderisi',
  'Travel': 'Seyahat',
  'VFX / Fantasy': 'VFX / Fantastik',
  'VFX / HTML-in-Canvas': 'VFX / HTML-in-Canvas',
};

export const TR_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3b',
  '3d-render': '3b-render',
  '9:16': '9:16',
  'action': 'aksiyon',
  'ancient-china': 'antik-çin',
  'anime': 'anime',
  'app-showcase': 'uygulama-vitrini',
  'ar': 'ar',
  'archery': 'okçuluk',
  'arpg': 'arpg',
  'audio-reactive': 'sese-tepkili',
  'boss-fight': 'boss-savaşı',
  'botw': 'her ikisi de',
  'brand': 'marka',
  'branding': 'marka-kimliği',
  'captions': 'altyazılar',
  'cavalry': 'süvari',
  'chart': 'grafik',
  'childlike': 'çocuksu',
  'choreography': 'koreografi',
  'cinematic': 'sinematik',
  'cinematic-romance': 'sinematik-romantik',
  'combat': 'dövüş',
  'combo': 'kombo',
  'companion-to-image': 'eşlikçiden-görsele',
  'counter': 'sayaç',
  'crayon': 'pastel boya',
  'cyberpunk': 'cyberpunk',
  'dance': 'dans',
  'dashboard': 'gösterge paneli',
  'data': 'veri',
  'data-viz': 'veri-görselleştirme',
  'desk-hologram': 'masa hologramı',
  'destruction': 'yıkım',
  'displacement': 'yer değiştirme',
  'editorial': 'editoryal',
  'elden-ring': 'elden-ring',
  'endcard': 'kapanış kartı',
  'escort': 'refakat',
  'escort-mission': 'refakat-görevi',
  'fantasy': 'fantastik',
  'fashion': 'moda',
  'fighting-game': 'dövüş-oyunu',
  'food': 'yemek',
  'forbidden-city': 'yasak şehir',
  'game-cinematic': 'oyun-sinematik',
  'game-ui': 'oyun-arayüzü',
  'grid-sheet': 'ızgara-sayfa',
  'guanyu': 'guanyu',
  'hand-drawn': 'el-çizimi',
  'hero': 'kahraman',
  'html-in-canvas': 'canvas-içinde-html',
  'hud': 'hud',
  'hud-safe': 'hud-güvenli',
  'hype': 'heyecan',
  'hyperframes': 'hyperframes',
  'idol': 'idol',
  'illustration': 'illüstrasyon',
  'image-to-image': 'görselden-görsele',
  'image-to-video': 'görüntüden videoya',
  'infographic': 'infografik',
  'iphone': 'iphone',
  'japanese': 'japon',
  'karaoke': 'karaoke',
  'key-visual': 'anahtar görsel',
  'keyframe': 'ana kare',
  'keynote': 'sunum',
  'kinetic-typography': 'kinetik tipografi',
  'linear-style': 'linear tarzı',
  'liquid': 'sıvı',
  'liquid-glass': 'sıvı cam',
  'live-artifact': 'canlı artefakt',
  'logo': 'logo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'manyetik',
  'map': 'harita',
  'marketing': 'pazarlama',
  'minimal': 'minimal',
  'mmo': 'mmo',
  'mobile': 'mobil',
  'money': 'para',
  'mounted-combat': 'atlı savaş',
  'nature': 'doğa',
  'open-design': 'açık tasarım',
  'open-world': 'açık dünya',
  'otaku-dance': 'otaku dansı',
  'outro': 'kapanış',
  'overlay': 'katman',
  'particles': 'parçacıklar',
  'photoreal': 'fotogerçek',
  'pipeline': 'akış hattı',
  'portal': 'portal',
  'portrait': 'portre',
  'pose-reference': 'poz referansı',
  'product': 'ürün',
  'product-demo': 'ürün demosu',
  'product-promo': 'ürün tanıtımı',
  'rework': 'yeniden işleme',
  'route': 'rota',
  'saas': 'saas',
  'seedance-2.0': 'Sedance-2.0',
  'sequence': 'dizi',
  'shader': 'shader',
  'shatter': 'parçalanma',
  'short-form': 'kısa biçim',
  'sizzle': 'tanıtım klibi',
  'social': 'sosyal',
  'storyboard': 'storyboard',
  'street-fighter': 'street-fighter',
  'style-transfer': 'stil-aktarımı',
  'tekken': 'tekken',
  'text': 'metin',
  'three-kingdoms': 'üç-krallık',
  'tiktok': 'tiktok',
  'title-card': 'başlık-kartı',
  'totk': 'totk',
  'transform': 'dönüştür',
  'travel': 'seyahat',
  'tts': 'tts',
  'typography': 'tipografi',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'dikey',
  'video-reference': 'video-referansı',
  'vs-screen': 'vs-ekranı',
  'webgl': 'webgl',
  'website-to-video': 'web-sitesinden-videoya',
  'workspace': 'çalışma alanı',
  'wuxia': 'wuxia',
  'zelda-style': 'zelda tarzı',
  'zhaoyun': 'zhaoyun',
};

export const TR_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-animated-boy-building-lego': {
    summary: 'Bir odada Lego parçalarını dikkatlice birleştiren bir çocuğu anlatan, hızlandırılmış çekim efektleri içeren, 3D animasyon tarzında çok çekimli bir video istemi.',
    title: 'Lego İnşa Eden 3D Animasyon Çocuk',
  },
  '3d-stone-staircase-evolution-infographic': {
    summary: 'Düz bir evrimsel zaman çizelgesini, ayrıntılı organizma render\'ları ve yapılandırılmış yan panellerle gerçekçi bir 3B taş merdiven infografiğine dönüştürür.',
    title: '3B Taş Merdiven Evrim İnfografiği',
  },
  'a-decade-of-refinement-glow-up': {
    summary: 'Seedance 2.0 için, bir adamın 2016\'daki rahat bir ortamdan 2026\'da lüks bir Dubai yaşam tarzına geçişini karakter tutarlılığını koruyarak gösteren bir dönüşüm istemi.',
    title: 'On Yıllık Gelişimle Görkemli Dönüşüm',
  },
  'ancient-guardian-dragon-rescue': {
    summary: 'Yağmurlu bir köyde beliren bir ejderha tarafından kurtarılan bir kız hakkındaki bir hikaye için, VFX ve atmosferik sese odaklanan ayrıntılı, çok çekimli sinematik bir istem.',
    title: 'Antik Koruyucu Ejderha Kurtarışı',
  },
  'ancient-indian-kingdom-fpv-video': {
    summary: 'Tapınaklar ve ormanlarla dolu mistik bir Hint krallığını tasvir eden, hızlı tempolu FPV drone tarzı sinematik bir istem.',
    title: 'Antik Hint Krallığı FPV Videosu',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    summary: 'Seedance 2.0 için, sabit kamera takibini korurken bir karaktere belirli bir hareket referansı uygulayan teknik bir prompt.',
    title: 'Animasyon aktarımı ve kamera takibi istemi',
  },
  'anime-martial-arts-battle-illustration': {
    summary: 'Geleneksel bir dojoda elemental enerji efektleriyle dövüşen iki kadın karakterin dinamik, yüksek etkili bir anime illüstrasyonunu oluşturur.',
    title: 'Anime Dövüş Sanatları Savaş İllüstrasyonu',
  },
  'beat-synced-outfit-transformation-dance': {
    summary: 'Seedance 2.0 için, ritimle senkronize bir kıyafet değişimi gerçekleştirirken breakdown karelerini takip eden bir karakter dansını koordine eden bir prompt.',
    title: 'Ritimle Senkronize Kıyafet Dönüşümü Dansı',
  },
  'character-intro-motion-graphics-sequence': {
    summary: 'Seedance 2.0 modeli için tasarlanmış, belirli UI katmanları ve geçişlerle bir karakter ekibini tanıtan karmaşık, çok aşamalı bir motion graphics prompt\'u.',
    title: 'Karakter Tanıtım Motion Graphics Dizisi',
  },
  'cinematic-birthday-celebration-sequence': {
    summary: 'Karakter tutarlılığına ve duygusal hikâye anlatımına odaklanan, doğum günü dizisi için son derece ayrıntılı, çok çekimli bir video prompt\'u.',
    title: 'Sinematik Doğum Günü Kutlaması Dizisi',
  },
  'cinematic-dragon-interaction-flight': {
    summary: 'Bir kadının bir ejderhayla duygusal etkileşimini ve ardından sinematik bir uçuş dizisini konu alan bir video için ayrıntılı, storyboard tarzı bir prompt.',
    title: 'Sinematik Ejderha Etkileşimi ve Uçuşu',
  },
  'cinematic-east-asian-woman-hand-dance': {
    summary: 'Stilize bir el dansı için, kamera hareketi ve karakter aksiyonları için zaman kodlu talimatlar içeren, son derece ayrıntılı, çok çekimli sinematik bir video prompt\'u.',
    title: 'Sinematik Doğu Asyalı Kadın El Dansı',
  },
  'cinematic-emotional-face-close-up': {
    summary: 'Gerçekçi cilt dokularına ve bir dizi karmaşık duygusal yüz geçişine odaklanan, Seedance 2.0 için son derece ayrıntılı teknik bir prompt.',
    title: 'Sinematik Duygusal Yüz Yakın Çekimi',
  },
  'cinematic-marine-biologist-exploration': {
    summary: 'Bir mercan resifinde antik bir gemi enkazını keşfeden bir deniz biyoloğunu konu alan su altı sahnesi için ayrıntılı sinematik bir video prompt\'u.',
    title: 'Sinematik Deniz Biyoloğu Keşfi',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    summary: 'Gitar tekniği, pinch harmonikler ve stüdyo estetiğine özel olarak odaklanan, 4K müzik podcast videosu üretmek için gelişmiş sinematik bir prompt.',
    title: 'Sinematik Müzik Podcast\'i ve Gitar Tekniği',
  },
  'cinematic-route-navigation-guide': {
    summary: 'Seedance için tasarlanmış, tekrar eden bir tur rehberi karakteri ve gerçek dünya konumları arasında akıcı geçişler içeren tutarlı bir yürüme navigasyonu videosu oluşturan, yapılandırılmış çok sahneli bir prompt.',
    title: 'Sinematik Rota Navigasyon Rehberi',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    summary: 'Seedance 2 için tasarlanmış, geceleyin sinematik bir sokak yarışı dizisi üretmeye yönelik; yoğun sürücü odaklanmasına, dinamik kamera çalışmasına ve patlayıcı hızlanmaya odaklanan ayrıntılı, çok çekimli bir prompt, yapı',
    title: 'Seedance 2 için Sinematik Sokak Yarışı Dizisi',
  },
  'cinematic-vampire-alley-fight-sequence': {
    summary: 'Neon ışıklı bir ara sokakta dinamik kamera hareketleri ve yüksek hızlı dövüş içeren bir kısa film sahnesi için kapsamlı bir aksiyon prompt\'u.',
    title: 'Sinematik vampir ara sokak dövüş dizisi',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    summary: '\'Crimson Horizon\' adlı bir bilim kurgu filmi için, bir roket fırlatmasından Mars\'taki ürkütücü bir uzaylı karşılaşmasına kadar her şeyi ayrıntılandıran kapsamlı, 9 çekimlik sinematik bir video dizisi.',
    title: 'Crimson Horizon Bilim Kurgu Sinematik Dizisi',
  },
  'cyberpunk-game-trailer-script': {
    summary: 'Bir cyberpunk oyun fragmanı için, karakter tasarımını, UI animasyonlarını ve beyaz bir boşluktan bir favelaya çevresel geçişleri ayrıntılandıran kapsamlı bir video üretim prompt\'u.',
    title: 'Cyberpunk Oyun Fragmanı Senaryosu',
  },
  'e-commerce-live-stream-ui-mockup': {
    summary: 'Bir portrenin üzerine yerleştirilen, özelleştirilebilir sohbet mesajları, hediye açılır pencereleri ve ürün satın alma kartı içeren gerçekçi bir sosyal medya canlı yayın arayüzü oluşturur.',
    title: 'E-ticaret Canlı Yayın Arayüzü Maketi',
  },
  'forbidden-city-cat-satire': {
    summary: 'Seedance 2.0 için, hicivli bir Qing hanedanı ortamında turuncu bir kedi memuru ve bir sırtlan imparatoru konu alan karmaşık bir kara komedi prompt\'u.',
    title: 'Yasak Şehir Kedi Hicvi',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    summary: 'Street Fighter 6 veya Tekken 8 giriş sanatı tarzında oyun içi bir dövüş oyunu ana görseli / dövüş ekran görüntüsü. İki anime tarzı erkek savaşçı, dramatik bir gece Çin tapınağı avlusunun ortasında karşı karşıya gelir — solda sıcak turuncu-kırmızı ateş aurası olan üstü çıplak hasır şapkalı bir korsan, sağda turuncu bir gi giymiş, devasa çatırdayan mavi bir şimşek enerji küresi toplayan dikenli saçlı bir dövüş sanatçısı. Eksiksiz bir dövüş oyunu HUD\'u ile birlikte gelir (çift can çubuğu, raunt sayacı, isimli dövüşçüler ve amblemlerle P1/P2 portre panelleri, taraf başına kombo sayaçları ve maksimum göstergeler). Sıcak turuncu ile soğuk mavi ayrımlı renk derecelendirmesi, türün rakip-dövüşçü geleneğiyle uyumludur. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
    title: 'Oyun Ekran Görüntüsü - Anime Dövüş Oyunu: Captain Ryuuga vs Kaze Renshin',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    summary: 'Guan Yu\'nun Kızıl Tavşan savaş atına binerek sağanak yağmurlu bir savaş alanından geçip düşman generali Yan Liang\'a doğru saldırdığı ikonik Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, Unreal Engine 5 ile, atlı kahramanın arka-sol tarafından takip eden üçüncü şahıs kamerasıyla render edilmiştir. Eksiksiz boss-savaşı HUD\'u (portre, yoğun düşman noktalarıyla mini harita, bitirici hamle istemiyle yetenek çubuğu, düşman generalin üzerinde yüzen boss HP çubuğu) sahneyi bir AAA ARPG dövüş anına dönüştürür. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Guan Yu Yan Liang\'ı Öldürürken',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    summary: 'Lü Bu\'nun bir savaşı durdurmak için kamp kapısındaki uzaktaki bir helebardı vurarak düşürdüğü ünlü Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, Unreal Engine 5 Nanite/Lumen ile, üçüncü şahıs omuz üstü oynanış kamerasıyla render edilmiştir. Eksiksiz oyun içi HUD katmanı (HP + qi çubukları, mini harita, yetenek çubuğu, uzaktaki helebarda mesafe okumalı hedef kilitleme işaretçisi) sahneyi bir ara sahneden ziyade gerçek bir yeni nesil ARPG yakalaması gibi gösterir. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Lü Bu\'nun Yuanmen Okçuluğu',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    summary: 'Zhao Yun\'un bir kolunda bebek Liu Chan\'ı kucaklarken diğer kolundaki bir mızrakla Changbanpo\'da düşman saflarından savaşarak geçtiği efsanevi Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzının Elden Ring ile birleştiği, tam Nanite, Lumen ışın izleme ve hacimsel tanrı ışınlarıyla Unreal Engine 5\'te render edilmiştir. Duygusal çekirdek — bir kol kundaklanmış bebeği korurken, diğer kol hayatta kalmak için savaşırken — bebek için özel bir ESKORT koruma çubuğu, bir kombo sayacı ve savrulan düşmanların üzerinde havada beliren hasar-sayısı açılır göstergeleri içeren eksiksiz bir HUD katmanıyla pekiştirilir. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Zhao Yun\'un Changbanpo\'daki Kucakta Kaçışı',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    summary: 'Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, bir AAA antik-Çin açık dünya MMO\'su için oyun içi HUD ekran görüntüsü maketi oluşturur. Güzel bir kadın kılıç ustası baş karakter, sisli bir dağ antik-tapınak sahnesinde karenin merkezini sabitler ve eksiksiz bir MMO HUD\'u ile çevrilidir: sol üstte HP/MP/dayanıklılık çubukları ve buff simgeleriyle karakter portresi, alt ortada Çin hat sanatı yetenek simgeleriyle yetenek çubuğu, sağ üstte görev işaretçileriyle mini harita, sağ tarafta görev takip paneli, sol altta kayan sohbet penceresi, dünya uzayında yüzen NPC isim levhaları ve görev ünlem işareti. Gerçekçi bir monitör ekran görüntüsü olarak, 16:9 oranında render edilmiştir; sunum desteleri, gamescom tarzı ana görseller ve Xiaohongshu/bilibili oyun tanıtımları için uygundur.',
    title: 'Oyun Arayüzü - Antik Çin Açık Dünya MMO HUD\'u',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    summary: 'Seedance 2.0 için, bir Hollywood Haute Couture Fantezi filmi oluşturmaya yönelik tasarlanmış ayrıntılı, çok sahneli bir video üretim prompt\'u. Prompt; stili, çözünürlüğü (8K), render motorunu (Unreal Engin) belirtir',
    title: 'Hollywood Haute Couture Fantezi Video Prompt\'u',
  },
  'hunched-character-animation': {
    summary: 'Seedance 2 için belirli bir karakter referansına yönelik yerinde yürüme animasyonu oluşturma talimatı.',
    title: 'Kambur Karakter Animasyonu',
  },
  'hyperframes-app-showcase-three-phones': {
    summary: '12 saniyelik 16:9 uygulama vitrini kompozisyonu — üç süzülen iPhone ekranı 3B uzayda asılı durur, her biri sırayla dönerek farklı bir özelliği öne çıkarır, ritimle senkronize etiket çağrıları, kapanışta logo kilitlemesi. Doğrudan HyperFrames `app-showcase` katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames: 12 Saniyelik Uygulama Vitrini — Süzülen Üç Telefon',
  },
  'hyperframes-brand-sizzle-reel': {
    summary: '30 saniyelik 16:9 HyperFrames tanıtım klibi — hızlı kesmeler, ritimle senkronize kinetik tipografi, gösterilen kelimelerde sese tepkili ölçeklendirme, beş sahne arasında shader geçişleri, logo parlamasıyla kapanış kartı. Öğrenci kitindeki aisoc-hype arketipi örnek alınmıştır.',
    title: 'HyperFrames: 30 Saniyelik Marka Tanıtım Klibi',
  },
  'hyperframes-data-bar-chart-race': {
    summary: '12 saniyelik 16:9 veri infografiği — kademeli kategori açılışlı animasyonlu çubuk + çizgi grafik, NYT tarzı serif başlık, dipnot kaynağı, kinetik değer etiketleri. Doğrudan HyperFrames `data-chart` katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames: Animasyonlu Çubuk Grafik Yarışı (NYT tarzı)',
  },
  'hyperframes-flight-map-route': {
    summary: '8 saniyelik 16:9 sinematik uçuş rotası haritası — gerçekçi arazi yakınlaşması, eğri bir yol boyunca kalkıştan varışa süzülen animasyonlu uçak, etiketli şehirler, kinetik mesafe sayacı. Doğrudan HyperFrames `nyc-paris-flight` katalog bloğu üzerine kurulmuştur, herhangi bir şehir çifti için yeniden kullanılabilir.',
    title: 'HyperFrames: Apple Tarzı Uçuş Haritası (Kalkış → Varış)',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    summary: 'Gerçek bir GLTF iPhone 15 Pro Max ve MacBook Pro\'nun temiz bir sahnede süzüldüğü, ekranlarında gerçek uygulama UI\'ının drawElementImage aracılığıyla canlı render edildiği 15 saniyelik bir ürün tanıtımı. Şekil değiştiren cam lens parlaması + 360° döner platform. vfx-iphone-device katalog bloğu üzerine inşa edildi.',
    title: 'HyperFrames HTML-in-Canvas: 3D iPhone + MacBook Ürün Tanıtımı',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    summary: 'Organik bir sıvı yüzeyin üzerinde süzülen HTML içerikli 12 saniyelik bir hero — köşe noktaları yer değiştirmiş bölünmüş düzlem, gerçek zamanlı dalga dinamikleri, yakalanan DOM net ve okunabilir biçimde üstte yer alır. vfx-liquid-background katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames HTML-in-Canvas: Sıvı Arka Plan Hero',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    summary: 'Gerçek bir ürün açılış sayfasının 20 saniyelik voronoi liquid-glass açılışı — DOM, drawElementImage ile canlı olarak yakalanır, kırılan cam hücrelerine parçalanır ve ardından temiz bir hero görüntüsüne oturur. vfx-liquid-glass katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames HTML-in-Canvas: Liquid Glass Landing Açılışı',
  },
  'hyperframes-html-in-canvas-magnetic': {
    summary: 'Canlı bir DOM ısı haritasına veya grafiğe tepki veren 15 saniyelik manyetik alan parçacık görselleştirmesi — parçacıklar yakalanan HTML\'in etrafında bükülen alan çizgilerini izler; ML/veri ürünleri için idealdir. vfx-magnetic katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames HTML-in-Canvas: Manyetik Alan Görselleştirmesi',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    summary: '10 saniyelik boyutsal bir portal, canlı bir veri gösterge paneline açılır — DOM gerçek zamanlı olarak yakalanır, hacimsel ışık taşması, portal kenarı parçacıkları. vfx-portal katalog bloğu üzerine kurulmuştur. Keynote tarzı veri hero görüntüleri için tasarlanmıştır.',
    title: 'HyperFrames HTML-in-Canvas: Portal Açılışlı Gösterge Paneli',
  },
  'hyperframes-html-in-canvas-shatter': {
    summary: '12 saniyelik bir HTML kırılma kapanışı — gerçek bir ürün sayfası veya fiyatlandırma kartı bir an sabit kalır, ardından derinlik bulanıklığı ve kromatik dağılımla birlikte kırılan cam parçalarına patlar. vfx-shatter katalog bloğu üzerine inşa edildi. Daha uzun bir kompozisyondan sonra bir kapanış kartı olarak eşleşir.',
    title: 'HyperFrames HTML-in-Canvas: Cam Kırılma Kapanışı',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    summary: 'Siyah bir sahnede imleç parıltısı, kromatik gölge ışınları ve yönlü aydınlatma içeren 8 saniyelik dramatik bir metin açılışı. Canlı shader son işleme altında gerçek DOM tipografisi. vfx-text-cursor katalog bloğu üzerine inşa edildi.',
    title: 'HyperFrames HTML-in-Canvas: Sinematik Metin İmleç Açılışı',
  },
  'hyperframes-logo-outro-cinematic': {
    summary: '4 saniyelik 16:9 logo kapanışı — parça parça birleşen kelime markası ile parlama, son kilitleme üzerinde ışıltı taraması, yumuşak grain kaplaması, tek satırlık CTA. HyperFrames `logo-outro`, `shimmer-sweep` ve `grain-overlay` blokları üzerine kurulmuştur.',
    title: 'HyperFrames: 4 Saniyelik Sinematik Logo Kapanışı',
  },
  'hyperframes-money-counter-hype': {
    summary: '6 saniyelik dikey 1080×1920 HyperFrames hype klibi — yeşil flaş, para patlaması parçacıkları, banknot destesi ikonu ve vurucu başlıkla Apple tarzı $0 → $10,000 sayacı. HyperFrames `apple-money-count` katalog bloğu üzerine kurulmuştur.',
    title: 'HyperFrames: $0 → $10K Para Sayacı Hype (9:16)',
  },
  'hyperframes-product-reveal-minimal': {
    summary: 'Üst düzey bir ürün açılışı için 5 saniyelik HyperFrames kompozisyonu — koyu kanvas, tek sıcak vurgu rengi, yavaş yakınlaşan başlık kartı, kinetik vurucu satır, ölçülü hareket. Ajan, HTML+GSAP\'ten puppeteer aracılığıyla MP4 oluşturur; stok görüntüye gerek yoktur.',
    title: 'HyperFrames: 5 Saniyelik Minimal Ürün Açılışı',
  },
  'hyperframes-saas-product-promo-30s': {
    summary: 'Linear/ClickUp tarzı ürün filmleri örnek alınarak hazırlanmış 30 saniyelik HyperFrames kompozisyonu — UI 3B açılışları, ritimle senkronize kinetik tipografi, animasyonlu UI ekran görüntüleri, logo kapanışlı son kart. HF katalog bloklarından (ui-3d-reveal, app-showcase, logo-outro) ve sahneler arası shader geçişlerinden oluşturulmuştur.',
    title: 'HyperFrames: 30 Saniyelik SaaS Ürün Tanıtımı (Linear tarzı)',
  },
  'hyperframes-social-overlay-stack': {
    summary: 'Bir yüz-kamera döngüsünün üzerine dört animasyonlu sosyal kart yığan 15 saniyelik dikey 1080×1920 HyperFrames kompozisyonu — bir X gönderisi, bir Reddit tepkisi, bir Spotify şu an çalıyor kartı ve sonunda bir Instagram takip CTA\'sı. Her kart bir HyperFrames katalog bloğudur; asıl değer, koreografidedir.',
    title: 'HyperFrames: 9:16 Sosyal Yerleşim Yığını (X · Reddit · Spotify · Instagram)',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    summary: 'Dikey 1080×1920 HyperFrames kısa videosu — yüz-kamera döngüsü üzerinde TTS seslendirmeli konuşan kafa, karaoke tarzı kelimelerle senkronize altyazılar, animasyonlu alt şerit ve sonunda bir tiktok-takip yerleşimi. HyperFrames öğrenci kitindeki may-shorts-19 arketipini yansıtır.',
    title: 'HyperFrames: 9:16 Karaoke Altyazılı TikTok Konuşan Kafa',
  },
  'hyperframes-website-to-video-promo': {
    summary: 'Canlı bir web sitesini üç farklı görünüm penceresi boyutunda yakalayan ve ardından sahneler arasında kromatik radyal bölünmeyle bunlar arasında animasyon yapan 15 saniyelik 16:9 HyperFrames kompozisyonu. Sitenin kaynak varlık olduğu hyperframes-sizzle öğrenci kiti arketipini yansıtır.',
    title: 'HyperFrames: Web Sitesinden Videoya Hattı (15 Saniyelik Pazarlama Kesimi)',
  },
  'illustrated-city-food-map': {
    summary: 'Numaralandırılmış yerel yemek özelliklerini, simgesel yapıları ve bir açıklama bölümünü içeren el çizimi, suluboya tarzında bir turist haritası oluşturur.',
    title: 'İllüstre Şehir Yemek Haritası',
  },
  'illustration-crayon-kid-drawing-rework': {
    summary: 'Herhangi bir referans görseli (ürün fotoğrafı, ekran görüntüsü, portre, UI taslağı) 10 yaşında bir çocuğun yaptığı izlenimi veren, el çizimi pastel boya illüstrasyonuna dönüştüren bir stil aktarımı promptu. Orijinal paleti temiz beyaz kağıt üzerinde parlak ve eğlenceli pastel boya renkleriyle değiştirir ve masum masal kitabı havasını güçlendirmek için çocuksu hayaller serpiştirir — şatolar, şekerler, yıldızlar, bulutlar, gökkuşakları. GPT-image-2\'de görselden görsele düzenleme olarak çalışır (promptun yanında bir referans görsel yüklemeyi gerektirir); web sitesi ekran görüntüleri, marka ana görselleri, ürün fotoğrafları ve portreler için çok uygundur.',
    title: 'İllüstrasyon - Pastel Boya Çocuk Çizimi Yeniden Düzenlemesi',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    summary: '16 bağlı kare panelden oluşan 4×4 ızgara olarak düzenlenmiş tek bir dikey 2:3 poster; ünlü Japon otaku dans şarkısı 極楽浄土 (Gokuraku Jodo) için eksiksiz bir koreografi döküm tablosu oluşturur. Her panel, aynı sevimli yarı gerçekçi anime idol kızını (pembe çift kuyruk, denizci yakalı okul-idol üniforması) dansın imza pozlarından birini tam boy sergilerken, pastel-pembe bir arka planda, altta küçük bir Japonca altyazı şeridi ve sol üstte numaralı bir daireyle gösterir. Açıkça AI video üretimi için bir POZ REFERANSI sayfası olarak tasarlanmıştır — her siluet net ve belirsizlikten uzaktır, hareket çizgisi veya arka plan karmaşası yoktur. gpt-image-2 için ayarlanmıştır, en boy 2:3. Kategori: İnfografik.',
    title: 'İnfografik - Otaku Dansı Koreografi Dökümü (Gokuraku Jodo, 16 Panel)',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    summary: '\'Su Nefesi\' (mavi su ejderhası) ile \'Yıldırım Nefesi\'ni (altın şimşek) karşı karşıya getiren, anime tarzı bir düellonun canlı çekim uyarlamasını oluşturmak için son derece ayrıntılı, 15 saniyelik bir istem. P',
    title: 'Canlı Çekim Anime Uyarlaması: Su ve Yıldırım Nefesi Düellosu',
  },
  'luxury-supercar-cinematic-narrative': {
    summary: 'Şık bir adam, Dobermanlar ve sisli bir dağ ortamında klasik bir süper otomobili içeren, Seedance 2.0 için son derece ayrıntılı çok çekimli sinematik istem.',
    title: 'Lüks Süper Otomobil Sinematik Anlatısı',
  },
  'magical-academy-storyboard-sequence': {
    summary: 'Bir akademideki sihirli bir kızı betimleyen sinematik bir dizi için, varışı, gücün keşfini ve sihirli bir düelloyu kapsayan ayrıntılı storyboard tarzı bir istem.',
    title: 'Sihirli Akademi Storyboard Dizisi',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    summary: 'Seedance 2.0\'ın Modern Kırsal Estetik tarzında iyileştirici, sinematik bir kısa film oluşturması için ayrıntılı, üç çekimli bir istem. Stili (Sinematik Reklam, 4K/8K, Aşırı Makro, doğal) belirtir',
    title: 'Modern Kırsal Estetik İyileştirici Kısa Film Video İstemi',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    summary: 'Irasutoya illüstrasyonlarının sade ve sıcak estetiğini, Japon hükümeti slaytlarına özgü yüksek bilgi yoğunluğuyla birleştiren bir prompt.',
    title: 'Hibrit Tarzda Momotaro Açıklama Slaytı',
  },
  'nightclub-flyer-atmospheric-animation': {
    summary: 'Seedance 2.0\'ın, özneyi sabit tutarken arka plan ve aydınlatma öğelerini canlandırması için ince bir animasyon istemi',
    title: 'Gece Kulübü Broşürü Atmosferik Animasyonu',
  },
  'notion-team-dashboard-live-artifact': {
    summary: 'Tek ekranlı, Notion\'a özgü takım panosu taslağı — KPI ızgarası, 7 günlük sparkline grafiği, etkinlik akışı ve bağlı veritabanlı görev tablosu. Canlı artifact becerisinin görsel tamamlayıcısıdır; yenilenebilir / bağlayıcı destekli çalıştırmalar için onunla birlikte kullanın veya durağan bir taslak olarak tek başına kullanın.',
    title: 'Notion Tarzı Takım Panosu (Canlı Artifact)',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    summary: 'Bu prompt, bir karakter referans illüstrasyonunu; orijinal kıyafeti, pozu ve kediyi koruyarak gerçekçi, sıcak tonlu, vintage iç mekan portresine dönüştürür.',
    title: 'Profil / Avatar - Anime Kızdan Sinematik Fotoğrafa',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    summary: 'Ayrıntılı özne ve aydınlatma parametreleriyle günlük bir moda fotoğraf çekiminin 4 fotoğraflık kolajı için yapılandırılmış bir JSON promptu.',
    title: 'Profil / Avatar - Günlük Moda Izgara Fotoğraf Çekimi',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    summary: 'Akbabalar ve kuzgunlarla çevrili, kasvetli, karanlık bir fantezi ortamında genç bir Güney Asyalı erkeğin ayrıntılı sinematik portresi.',
    title: 'Profil / Avatar - Akbabalı Sinematik Güney Asyalı Erkek Portresi',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    summary: 'Posterler, sosyal medya sanatı veya fütüristik marka görselleri için neon dolu, şık bir anime portresi.',
    title: 'Profil / Avatar - Neon Yüz Yazılı Cyberpunk Anime Portresi',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    summary: 'Bu prompt; parlak şekillendirilmiş saçları, süslü mor-siyah kıyafetleri ve çiçeklerle dolu büyülü bir bahçe ortamı olan zarif bir kadının, karakter için ideal, cilalı anime tarzı fantezi portresini üretir',
    title: 'Profil / Avatar - Mor Bahçede Zarif Fantezi Kızı',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    summary: 'Bu prompt; akışkan saçlar ve düşsel bir bahar atmosferiyle zarif dikey ana görseller veya karakter illüstrasyonları oluşturmak için ideal, yumuşak ve ışıltılı bir anime tarzı fantezi karakter portresi üretir.',
    title: 'Profil / Avatar - Ruhani Mavi Saçlı Fantezi Portresi',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    summary: 'Bu prompt; moda editöryeli veya güzellik görselleri için ideal, derin dekolteli siyah bir kıyafet giymiş zarif bir kadının foto-gerçekçi lüks tarzı portresini üretir.',
    title: 'Profil / Avatar - Siyahlar İçinde Göz Alıcı Kadın Portresi',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    summary: 'Görünür gözenekler ve doğal aydınlatmaya odaklanarak gerçekçi cilt dokuları ve özgün telefon selfie kadrajı üretmek için ayrıntılı prompt parçacıkları.',
    title: 'Profil / Avatar - Hiper-Gerçekçi Selfie Doku Promptları',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    summary: 'Bu prompt; parlak sarı saçları, mor çiçekleri ve süslü kristal kıyafetiyle zarif bir büyücü prensesin, karakter sanatı veya büyülü illüstrasyonlar için ideal, cilalı anime tarzı fantezi portresini üretir',
    title: 'Profil / Avatar - Lavanta Fantezi Büyücü Portresi',
  },
  'profile-avatar-monochrome-studio-portrait': {
    summary: 'Belirgin bir bölünmüş arka plan ve dramatik stüdyo aydınlatmasıyla monokrom bir portre için üst düzey ticari fotoğrafçılık promptu.',
    title: 'Profil / Avatar - Monokrom Stüdyo Portresi',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    summary: 'Bu prompt; fotoğraf onarımı ve iyileştirme için hasarlı, vintage 4 kişilik bir aile fotoğrafını temiz, renklendirilmiş, yüksek çözünürlüklü, gerçekçi bir portreye dönüştürür.',
    title: 'Profil / Avatar - Eski Fotoğraftan DSLR Portresine Restorasyon',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    summary: 'Bu prompt; güneşli bir bahçede kitap düşkünü genç bir kadının, yaşam tarzı fotoğrafçılığı, edebi markalaşma veya zarif karakter görselleri için ideal, gerçekçi editöryel tarzda portresini üretir.',
    title: 'Profil / Avatar - Bahçede Şiirsel Kadın Portresi',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    summary: 'Kariyerle ilgili etkinlikler ve tipografi eşliğinde profesyonel kıyafet giymiş bir özneyi konu alan yüksek çözünürlüklü, premium bir duvar kağıdı üretir.',
    title: 'Profil / Avatar - Profesyonel Kimlik Portre Duvar Kağıdı',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    summary: 'Tesadüfi, düşük kaliteli bir akıllı telefon enstantanesi gibi görünen \'başarısız\' bir selfie üretmek için GPT Image 2 ile kullanılan yaratıcı bir prompt.',
    title: 'Profil / Avatar - Gerçekçi Şekilde Kusurlu AI Selfie',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    summary: 'Bu, kare bir shikishi tahtası üzerinde canlı, imzalı marker tarzı bir portre üretir; hayran sanatı imzaları, anma illüstrasyonu paylaşımları ve kişiselleştirilmiş teşekkür görselleri için kullanışlıdır.',
    title: 'Profil / Avatar - Shikishi Üzerinde İmzalı Marker Portresi',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    summary: 'Karlı bir dağ tapınağı ortamında duran, süslü kış hanfusu giymiş, tavşan temalı görkemli bir kadın üretmek için gerçekçi bir fantezi portre promptu.',
    title: 'Profil / Avatar - Kar Tavşanı İmparatoriçe Portresi',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    summary: 'Bu istem, tavşan temalı beyaz bir Hanfu giymiş maskeli bir kadının sinematik bir kış fantezi portresini oluşturur; zarif karakter sanatı ve atmosferik AI vitrin görselleri için idealdir.',
    title: 'Profil / Avatar - Kar Tavşanı Maskeli Hanfu Portresi',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    summary: 'Bu istem, işlemeli hanfu giymiş tavşan kulaklı bir kadının ultra ayrıntılı bir fantezi güzellik portresini oluşturur; zarif karakter sanatı, kostüm tasarımı veya sinematik AI portre vitrinleri için idealdir.',
    title: 'Profil / Avatar - Karlı Tavşan Hanfu Portresi',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    summary: 'Bu istem, kışın tavşan kulaklı isimsiz bir kadının sakin bir fantezi portresini oluşturur; atmosferik karakter sanatı ve stilize profil illüstrasyonları için idealdir.',
    title: 'Profil / Avatar - Karlı Tavşan Ruhu Portresi',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    summary: 'Antik bir avluda Song Hanedanı geleneksel Hanfu\'su giymiş bir güzelin ayrıntılı ve gerçekçi bir portresini oluşturmak için optimize edilmiş bir istem.',
    title: 'Profil / Avatar - Song Hanedanı Hanfu Portresi',
  },
  'retro-hk-wuxia-film-aesthetic': {
    summary: '80\'ler-90\'lar Hong Kong Wuxia filmlerinin estetiğini yeniden yaratan, stilize çekimlerle bir kediden bir insana karakter dönüşümünü konu alan karmaşık, çok bölümlü bir video komutu.',
    title: 'Retro HK Wuxia Film Estetiği',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    summary: 'Seedance 2.0 için sinematik, ultra gerçekçi bir Japon lise saf aşk kısa filmi üretmek üzere tasarlanmış, son derece ayrıntılı, 15 saniyelik, çok sahneli bir komut. Komut, sahne ortamını belirtir (boş',
    title: 'Seedance 2.0: 15 Saniyelik Sinematik Japon Romantik Kısa Filmi',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    summary: 'Seedance 2.0 için 80 yaşında bir kadını konu alan 16:9 yatay sokak rap müzik videosu (MV) üretmeye yönelik ayrıntılı, 15 saniyelik bir komut. Komut, stili belirtir (neon mor/mavi soğuk tonlar, exp',
    title: 'Seedance 2.0: 80 Yaşındaki Rapçi MV',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    summary: 'Seedance 2.0 için, modele bir karakter sayfasına dayalı bir dizilimi canlandırmasını söyleyen, belirli hareketlere ve adımlara odaklanan bir video komutu.',
    title: 'Dövüş Sanatları Videosu için Dizilim ve Hareket Talimatı',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    summary: 'Bu istem, bir Pokémon mağazasında mavi elbiseli, yüzü bulanık bir kızı konu alan yumuşak pastel bir anime moda duyuru posteri oluşturur; kıyafet tanıtım fragmanları ve karakter promosyon görselleri için idealdir.',
    title: 'Sosyal Medya Gönderisi - Anime Pokémon Mağaza Kıyafeti Tanıtım Posteri',
  },
  'social-media-post-cinematic-elevator-scene': {
    summary: 'Gerçekçi aydınlatma ve yansımalarla metalik bir asansörün içindeki bir kadının atmosferik, sinematik bir sahnesini oluşturmak için bir istem.',
    title: 'Sosyal Medya Gönderisi - Sinematik Asansör Sahnesi',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    summary: 'Bu istem, rahat ve sevimli bir çalışma alanında bilgisayarında yazı yazan bir elf kızının yumuşak pastel bir anime illüstrasyonunu oluşturur; sosyal gönderiler, duvar kâğıtları veya yayıncı temalı sanat için idealdir.',
    title: 'Sosyal Medya Gönderisi - Pastel Masada Şaşkın Elf Kız',
  },
  'social-media-post-editorial-fashion-photography': {
    summary: 'Yumuşak aydınlatma ve sıcak tonlara sahip minimalist bir stüdyo sahnesi için atmosferik, modaya odaklı bir istem.',
    title: 'Sosyal Medya Gönderisi - Editöryel Moda Fotoğrafçılığı',
  },
  'social-media-post-fashion-editorial-collage': {
    summary: 'Moda editöryel çekimleri için son derece ayrıntılı bir 2x2 fotoğraf kolajı istemi; tutarlı stil, belirli aydınlatma ve referans fotoğraftan alınan yüz hatlarına odaklanır.',
    title: 'Sosyal Medya Gönderisi - Moda Editöryel Kolaj',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    summary: 'Bir oyuncunun Paris Saint-Germain\'e transferini sosyal medyada veya spor promosyon görsellerinde duyurmak için cesur, profesyonel bir futbol imza posteri.',
    title: 'Sosyal Medya Gönderisi - PSG Transfer Duyuru Posteri',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    summary: 'Şık bir karakterin tutarlı, kare kare bir dans sekansını oluşturmak için tam bir 8 kareli storyboard istem seti. Ortak global stil token\'ları, yeniden kullanılabilir bir negatif istem ve kare başına sekiz istem (açılış pozu, kalça ritmi, vücut dalgası, beat-drop bel bükmesi, yan kalça sallanışı, saç savurma, güç duruşu, bitiriş pozu) içerir. GPT-Image-2 seviyesindeki modeller için ayarlanmıştır: özlü kelime dağarcığı, hassas ifade yok, kareler arasında tutarlı çerçeveleme ve aydınlatma dili sayesinde kareler tek bir kesintisiz koreografi gibi hissettirir.',
    title: 'Sosyal Medya Gönderisi - Sansasyonel Kız Dans Storyboard\'u (8 Kare)',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    summary: 'Anime karakter sanatını, nostaljik Showa dönemi sokak görsellerini ve dergi tarzı bilgilendirici düzeni birleştiren, mevsimsel kültürel promosyonlar için sıcak, editöryel tarzda bir Japon tatil sayfası.',
    title: 'Sosyal Medya Gönderisi - Showa Günü Retro Kültür Dergi Kapağı',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    summary: 'Bir karakter profiline dayalı olarak, ürün etiketleri ve fiyatlarıyla birlikte bir haftalık moda blogcusu tarzı kıyafet önerileri oluşturmak için bir istem.',
    title: 'Sosyal Medya Gönderisi - Sosyal Medya Moda Kıyafeti Oluşturma',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    summary: 'Yalnız bir yolculuğu tasvir eden, akıllı telefon tarzı seyahat fotoğraflarından oluşan nostaljik, 12 kareli bir kolaj oluşturmak için ayrıntılı bir istem.',
    title: 'Sosyal Medya Gönderisi - Seyahat Anlık Görüntü Kolajı İstemi',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    summary: 'Grafit çizgileri ve mürekkep yayılması gibi gerçekçi ayrıntılarla kâğıt üzerine elle çizilmiş bir keçeli kalem eskizi oluşturur; vintage yazı stilleri için mükemmeldir.',
    title: 'Sosyal Medya Gönderisi - Vintage Tabela Ressamı Eskizi',
  },
  'soul-switching-mirror-magic-sequence': {
    summary: 'Bir aynada gerçekleşen büyülü bir ruh değiştirme olayını anlatan, her bölüm için belirli kamera talimatları ve duygusal ipuçları içeren anlatımsal bir video komutu.',
    title: 'Ruh Değiştiren Ayna Büyüsü Dizilimi',
  },
  'toaster-rocket-jumpscare': {
    summary: 'Ekmek kızartma makinesinin ekmeği roket gibi fırlatmasıyla korkutulan yaşlı bir adamın, gerçekçi ev videosu tarzında çekilmiş bir görüntüsü için bir komut.',
    title: 'Ekmek Kızartma Makinesi Roketi Korkutması',
  },
  'traditional-dance-performance': {
    summary: 'Seedance 2.0 için koreografi ve kimlik referans görsellerine dayalı zarif bir geleneksel dans üretmeye yönelik kapsamlı bir video komutu.',
    title: 'Geleneksel Dans Gösterisi',
  },
  'video-seedance-desk-hologram-ar-realdesk': {
    summary: 'Viral masa hologram formatı için iki aşamalı Sedance 2.0 iş akışı: önce gerçek bir geliştirici masasına fotogerçekçi bir ana kareyi kilitleyin (monitörde Açık Tasarım Kullanıcı Arayüzü, klavyede duran kobalt mavisi dünya dışı bir avcı), ardından bunu yaklaşık 15 saniyelik bir 9:16 görüntüden video klibine hareketlendirin. İnandırıcı AR geçişi için ayarlandı - orta güçte VFX, gerçek masa karmaşası, karakterin üzerine monitör parıltısı yayılması ve hafif fiziksel etkileşimler (açık kupa, klavye adımı, fiyonk çekme). Masa hologramı Sedance 2.0 trendinden ilham alan; istemde telif hakkıyla korunan karakter adı yok.',
    title: 'Video - Gerçek Çalışma Alanında Masa Hologramı AR (Seedance 2.0)',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    summary: 'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-guanyu-slaying-yanliang\'i hayata geçiren, yaklaşık 10 saniyelik, motor içi sinematik bir aksiyon dizilimi. Guan Yu (关羽), Kızıl Tavşan atına binerek doğruca düşman savaş hattının içine dalar, Yeşil Ejderha Hilal Bıçağı\'nı kaldırır ve karşı taraftaki general Yan Liang\'a tek, temiz bir kesik indirir. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kararlı darbe, temiz at-ve-bıçak fiziği, fotogerçekçi aydınlatma, ekranda kesinlikle kan yok (darbe, kanla değil, altın bir qi parıltısıyla ima edilir). Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Guan Yu Yan Liang\'ı öldürüyor ekran görüntüsü şablonu.',
    title: 'Video - Üç Krallık ARPG - Guan Yu Yan Liang\'ı Öldürüyor (Seedance 2.0)',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    summary: 'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-lyubu-yuanmen-archery\'i hayata geçiren, yaklaşık 10 saniyelik, motor içi sinematik bir aksiyon dizilimi. Lyu Bu (吕布), karşı karşıya duran iki ordu arasındaki tozlu bir askeri kampın ortasında durur, kırmızı laklı bir uzun yay çeker, gergin halde bir an tutar, ardından uzaktaki yere saplanmış bir halberde doğru tek bir altın parıltılı, qi yüklü ok salar. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kararlı vuruş, net ve HUD\'a uygun çerçeveleme, temiz yay/ok fiziği, rüzgar + toz + sancak hareketi ve oyun içi ekran görüntüsü renk düzenlemesi. Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Lyu Bu yuanmen okçuluğu ekran görüntüsü şablonu.',
    title: 'Video - Üç Krallık ARPG - Lyu Bu Yuanmen Okçuluğu (Seedance 2.0)',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    summary: 'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-zhaoyun-cradle-escape\'i hayata geçiren, yaklaşık 12 saniyelik, motor içi sinematik bir aksiyon dizilimi. Zhao Yun (赵云), parçalanmış bir Changban savaş alanında savaş atını sürer, bebek varis A Dou\'yu sol kolunun kıvrımında taşırken sağ elinde mızrağını kullanır, gelen bir darbeyi tek bir KUSURSUZ KAÇIŞLA savuşturur ve yıkılmış bir savaş arabasının üzerinden atlayarak yol açar. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kesintisiz vuruş, inandırıcı tek kollu mızrak kullanımı, temiz at fiziği ve bebeğe kesinlikle görünür hiçbir zarar yok. Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Zhao Yun bebekle kaçış ekran görüntüsü şablonu.',
    title: 'Video - Üç Krallık ARPG - Zhao Yun Bebekle Kaçış (Seedance 2.0)',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    summary: 'Bir gemideki korsan timsah ve kuş korsanları konu alan klasik, eski Disney tarzı bir animasyon için çok sahneli anlatımsal bir komut.',
    title: 'Eski Disney Tarzı Korsan Timsah Animasyonu',
  },
  'viral-k-pop-dance-choreography': {
    summary: 'Seedance 2.0 için 16 panelli bir storyboard referansına dayalı dans eden bir karakteri canlandırmaya yönelik ayrıntılı bir komut.',
    title: 'Viral K-pop Dans Koreografisi',
  },
  'vr-headset-exploded-view-poster': {
    summary: 'Ayrıntılı bileşen açıklamaları ve promosyon metniyle bir VR başlığının yüksek teknolojili patlamış görünüm diyagramını oluşturur.',
    title: 'VR Başlığı Patlamış Görünüm Posteri',
  },
  'wasteland-factory-chase': {
    summary: 'Bacaklar üzerinde hareket eden endüstriyel bir fabrikayı ve bir asi motosiklet kovalamacasını konu alan, yüksek hızlı bir çöl çorak toprak sahnesi için sinematik bir komut.',
    title: 'Çorak Toprak Fabrika Kovalamacası',
  },
  'zelda-style-forbidden-city-game-screenshot': {
    summary: 'The Legend of Zelda: Breath of the Wild / Tears of the Kingdom\'dan ilham alan, Link ve Zelda\'nın Pekin\'in Yasak Şehir\'i gibi gerçek dünyadan önemli bir yeri keşfettiği 16:9 orijinal oynanış ekran görüntüsü tarzı bir görüntü istemi oluşturur. Şablon, istemi kısa ve öz tutar, Nintendo Switch\'in oyun içi görünümünü sabitler, doğal BOTW/TOTK tarzı HUD ipuçları ekler ve okunabilir tüm kullanıcı arayüzü metinlerini Çince olarak yerelleştirir.',
    title: 'Zelda Tarzı Yasak Şehir Oyunu Ekran Görüntüsü',
  },
};
