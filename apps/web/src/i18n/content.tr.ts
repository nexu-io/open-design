import type { PromptTemplateSummary } from '../types';

export const TR_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Retro pixel sunum hareket tasarımı için HyperFrames tabanlı video şablonu.\nKullanıcılar gelişmiş geçişler, etkileşimli önizleme kontrolleri ve render\'a hazır\nvarsayılan stil içeren yüksek kaliteli, çok sahneli bir HTML-to-video kompozisyonu\nistediğinde kullanın.',
    examplePrompt:
      '8-bit retro stilde, gelişmiş geçişler, zengin hareket ve her sayfası 3 saniyenin altında olan 3 sayfalık bir HyperFrames video sunumu oluştur.',
  },
  'ad-creative': {
    description:
      'Başlıklar, açıklamalar ve birincil metin dahil reklam kreatifleri oluştur ve yinele. Ücretli sosyal medya ve arama reklamı yinelemeleri için kullanışlıdır.',
    examplePrompt:
      'Başlıklar, açıklamalar ve birincil metin dahil reklam kreatifleri oluştur ve yinele.',
  },
  'after-hours-editorial-template': {
    description:
      'Üç sayfalık sinematik storyboard\'lar için lüks, koyu editöryel HyperFrames şablonu;\nhaute couture jenerik kartlarından ve dergi bölüm sayfalarından ilham alır. Kullanıcı\npremium moda tarzı hareket sayfaları, atmosferik serif ağırlıklı anlatım ya da\nzengin geçişlere sahip üst düzey koyu sunum estetiği istediğinde kullanın.',
    examplePrompt:
      'Koyu haute-couture stilde üç sayfalık bir HyperFrames editöryel dizisi oluştur: premium serif tipografi, magenta vurgu, zarif bölüm geçişleri ve sinematik grenli doku. Her sayfayı 3 saniyenin altında tut.',
  },
  'agent-browser': {
    description:
      'AI ajanları için tarayıcı otomasyonu CLI\'ı. Kullanıcının tarayıcı davranışını\nincelemesi, test etmesi veya otomatikleştirmesi gerektiğinde kullanın: sayfalarda\ngezinme, form doldurma, düğmelere tıklama, ekran görüntüsü alma, sayfa verisi\nçıkarma, seçili Open Design tarayıcı sekmesi bağlamını okuma, web uygulamalarını\ntest etme, Open Design önizlemelerini dogfooding yapma, QA, hata avı veya uygulama\nkalitesini gözden geçirme. Kullanıcı açıkça harici tarama istemediği sürece yerel\nOpen Design önizleme URL\'lerini tercih edin.',
    examplePrompt:
      'AI ajanları için tarayıcı otomasyonu CLI\'ı.',
  },
  'ai-music-album': {
    description:
      'Tam yaşam döngüsü AI müzik albümü prodüksiyonu — konsept, söz yazımı, parça sıralaması ve dışa aktarma. Bağımsız albüm denemeleri ve marka müzikleri için kullanışlıdır.',
    examplePrompt:
      'Tam yaşam döngüsü AI müzik albümü prodüksiyonu — konsept, söz yazımı, parça sıralaması ve dışa aktarma.',
  },
  'algorithmic-art': {
    description:
      'Her render\'ın yeniden üretilebilir olması için tohum (seed) tabanlı rastgelelik kullanarak p5.js ile jeneratif sanat oluştur. Prosedürel posterler, hareket tarzı sabit görseller ve sanatsal kare çalışmaları için kullanışlıdır.',
    examplePrompt:
      'Her render\'ın yeniden üretilebilir olması için tohum (seed) tabanlı rastgelelik kullanarak p5.js ile jeneratif sanat oluştur.',
  },
  'apple-hig': {
    description:
      'iOS, macOS, visionOS, watchOS ve tvOS için platformları, temelleri, bileşenleri, kalıpları, girdileri ve teknolojileri kapsayan 14 ajan becerisi olarak Apple Human Interface Guidelines.',
    examplePrompt:
      'iOS, macOS, visionOS, watchOS ve tvOS için platformları, temelleri, bileşenleri, kalıpları, girdileri ve teknolojileri kapsayan 14 ajan becerisi olarak Apple Human Interface Guidelines.',
  },
  'article-magazine': {
    description:
      'Markdown\'ı veya notları cilalı, uzun biçimli bir HTML makaleye dönüştürmek için Huashu / huashu-md-html\'den ilham alan dergi makalesi düzeni.',
    examplePrompt:
      'İçeriğimi Huashu / huashu-md-html\'den ilham alan uzun biçimli bir HTML makaleye dönüştürmek için Magazine Article şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'artifacts-builder': {
    description:
      'Modern frontend web teknolojileri (React, Tailwind CSS, shadcn/ui) kullanarak ayrıntılı, çok bileşenli claude.ai HTML artifact\'leri oluşturmak için araç paketi.',
    examplePrompt:
      'Modern frontend web teknolojileri (React, Tailwind CSS, shadcn/ui) kullanarak ayrıntılı, çok bileşenli claude.ai HTML artifact\'leri oluşturmak için araç paketi.',
  },
  'brainstorming': {
    description:
      'Yapılandırılmış sorgulama ve alternatif keşfi yoluyla kaba fikirleri tam olgunlaşmış tasarımlara dönüştür. Konsept çalışmasının erken aşamalarında kullanışlıdır.',
    examplePrompt:
      'Yapılandırılmış sorgulama ve alternatif keşfi yoluyla kaba fikirleri tam olgunlaşmış tasarımlara dönüştür.',
  },
  'brand-guidelines': {
    description:
      'Tutarlı görsel kimlik ve profesyonel tasarım standartları için Anthropic\'in resmi marka renklerini ve tipografisini artifact\'lere uygula. Kendi tasarımını şekillendirmek için bir referans.',
    examplePrompt:
      'Tutarlı görsel kimlik ve profesyonel tasarım standartları için Anthropic\'in resmi marka renklerini ve tipografisini artifact\'lere uygula.',
  },
  'brandkit': {
    description:
      'Üst düzey marka kılavuzu panoları, logo sistemleri, kimlik sunumları ve görsel dünya sunumları oluşturmak için premium marka kiti görsel üretim becerisi. Minimalist, sinematik, editöryel, dark-tech, lüks, kültürel, güvenlik, oyun, geliştirici aracı ve tüketici uygulaması marka sistemleri için eğitilmiştir. Niyetli logo konseptlemesi, rafine kompozisyon, sade tipografi, güçlü sembolik anlam, premium mockup\'lar, sanat yönetmenliği görseller ve esnek grid düzenleri için optimize edilmiştir.',
    examplePrompt:
      'Bu ürün için premium bir marka kiti genel görünüm görseli oluştur: logo yönü, palet, tipografi, uygulamalar ve tutarlı bir görsel dünya.',
  },
  'industrial-brutalist-ui': {
    description:
      'İsviçre tipografik baskısını askeri terminal estetiğiyle birleştiren ham mekanik arayüzler. Katı gridler, aşırı tipografi ölçek kontrastı, faydacı renk, analog bozulma efektleri. Gizliliği kaldırılmış teknik çizimler gibi hissettirmesi gereken veri yoğun panolar, portföyler veya editöryel siteler için.',
    examplePrompt:
      'Katı gridler, taktiksel telemetri motifleri, güçlü tipografi ve mekanik hassasiyetle endüstriyel-brütalist bir arayüz oluştur.',
  },
  'canvas-design': {
    description:
      'Posterler, illüstrasyonlar ve sabit eserler için tasarım felsefesi ve estetik ilkelerini kullanarak PNG ve PDF belgelerinde güzel görsel sanat oluştur.',
    examplePrompt:
      'Posterler, illüstrasyonlar ve sabit eserler için tasarım felsefesi ve estetik ilkelerini kullanarak PNG ve PDF belgelerinde güzel görsel sanat oluştur.',
  },
  'card-twitter': {
    description:
      'Bir gönderiyle eşleştirilmek üzere tasarlanmış Twitter alıntı veya veri kartı.',
    examplePrompt:
      'İçeriğimi bir gönderiyle eşleştirilmek üzere tasarlanmış bir Twitter alıntı veya veri kartına dönüştürmek için Twitter Share Card şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'card-xiaohongshu': {
    description:
      'Kaydırılabilir çok kartlı bir karusel olarak düzenlenmiş Xiaohongshu tarzı bilgi kartları.',
    examplePrompt:
      'İçeriğimi Xiaohongshu tarzı kaydırılabilir bir bilgi kartı karuseline dönüştürmek için Xiaohongshu Card şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'color-expert': {
    description:
      'OKLCH/OKLAB, palet üretimi, erişilebilirlik/kontrast, renk adlandırma, pigment karıştırma ve tarihsel renk teorisini kapsayan 286K kelimelik referans materyaliyle renk bilimi uzmanı becerisi.',
    examplePrompt:
      'OKLCH/OKLAB, palet üretimi, erişilebilirlik/kontrast, renk adlandırma, pigment karıştırma ve tarihsel renk teorisini kapsayan 286K kelimelik referans materyaliyle renk bilimi uzmanı becerisi.',
  },
  'competitive-ads-extractor': {
    description:
      'Yankı uyandıran mesajlaşma ve kreatif yaklaşımları anlamak için reklam kütüphanelerinden rakiplerin reklamlarını çıkar ve analiz et.',
    examplePrompt:
      'Yankı uyandıran mesajlaşma ve kreatif yaklaşımları anlamak için reklam kütüphanelerinden rakiplerin reklamlarını çıkar ve analiz et.',
  },
  'copywriting': {
    description:
      'Açılış sayfaları, ana sayfalar ve reklamlar için pazarlama metni yaz ve yeniden yaz. Lansmanlar sırasında bir metin şefi ortağı olarak kullanışlıdır.',
    examplePrompt:
      'Açılış sayfaları, ana sayfalar ve reklamlar için pazarlama metni yaz ve yeniden yaz.',
  },
  'creative-director': {
    description:
      'Özyinelemeli öz değerlendirmeye sahip AI kreatif direktör: 20\'den fazla metodoloji (SIT, TRIZ, Bisociation, SCAMPER, Synectics), Cannes/D&AD/HumanKind\'a göre kalibre edilmiş 3 eksenli değerlendirme, brief\'ten sunuma 5 aşamalı süreç.',
    examplePrompt:
      'Özyinelemeli öz değerlendirmeye sahip AI kreatif direktör: 20\'den fazla metodoloji (SIT, TRIZ, Bisociation, SCAMPER, Synectics), Cannes/D&AD/HumanKind\'a göre kalibre edilmiş 3 eksenli değerlendirme, brief\'ten sunuma 5 aşamalı süreç.',
  },
  'd3-visualization': {
    description:
      'Ajana D3 grafikleri ve etkileşimli veri görselleştirmeleri üretmeyi öğretir. Çeşitli grafik türleri ve teknikler için örnekler içeren kapsamlı bir D3.js becerisidir; ajana karmaşık, etkileşimli görselleştirmeler oluşturması için uzman düzeyinde bilgi kazandırır. Editöryel panolar, raporlar, veri yoğun prototipler ve açıklayıcı grafikler için kullanışlıdır.',
    examplePrompt:
      'Ajana D3 grafikleri ve etkileşimli veri görselleştirmeleri üretmeyi öğretir.',
  },
  'data-report': {
    description:
      'CSV, Excel veya JSON verilerini şık bir görsel rapor sayfasına dönüştürür.',
    examplePrompt:
      'CSV, Excel veya JSON verilerimi şık bir görsel rapor sayfasına dönüştürmek için Veri Görselleştirme Raporu şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deck-guizang-editorial': {
    description:
      'Editöryel dergi ile e-mürekkebin buluşması: 10 düzen ve 5 palet (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'İçeriğimi 10 düzen ve 5 paletle editöryel dergi x e-mürekkep yatay sunuma dönüştürmek için Guizang Editorial E-Ink Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deck-open-slide-canvas': {
    description:
      'Sabit bir şablona bağlı olmayan, React bileşen düzeyinde serbest kompozisyona sahip, kilitli 1920x1080 tuval sunumu.',
    examplePrompt:
      'İçeriğimi React bileşen düzeyinde düzene sahip, kilitli 1920x1080 serbest kompozisyonlu bir sunuma dönüştürmek için Open-Slide 1920 Canvas Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'deck-swiss-international': {
    description:
      '16 sütunlu ızgara, tek doygun vurgu rengi ve 22 kilitli düzen (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'İçeriğimi tek doygun vurgu rengi ve 22 kilitli düzenle 16 sütunlu ızgara sunumuna dönüştürmek için Swiss International Deck şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'design-brief': {
    description:
      'I-Lang protokol formatında yazılmış yapılandırılmış bir tasarım brifini\nsomut bir tasarım spesifikasyonuna ayrıştır. "Profesyonel yap" gibi belirsiz\nisteklerdeki muğlaklığı, açık boyutlar gerektirerek ortadan kaldırır: palet, tipografi,\ndüzen, atmosfer, yoğunluk ve kısıtlamalar.\nTetikleyici anahtar kelimeler: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'I-Lang protokol formatında yazılmış yapılandırılmış bir tasarım brifini somut bir tasarım spesifikasyonuna ayrıştır.',
  },
  'design-consultation': {
    description:
      'Yaratıcı riskler ve gerçekçi ürün maketleriyle sıfırdan eksiksiz bir tasarım sistemi kur. Başlangıç atölyeleri ve sıfırdan marka çalışmaları için kullanışlıdır.',
    examplePrompt:
      'Yaratıcı riskler ve gerçekçi ürün maketleriyle sıfırdan eksiksiz bir tasarım sistemi kur.',
  },
  'design-md': {
    description:
      'DESIGN.md dosyaları oluştur ve yönet. Tasarım yönelimini, token\'ları ve görsel kuralları tek bir doğruluk kaynağında toplamak için kullanışlıdır.',
    examplePrompt:
      'DESIGN.md dosyaları oluştur ve yönet.',
  },
  'design-review': {
    description:
      'Kod Yazan Tasarımcı: görsel denetim ardından atomik commit\'ler ve öncesi/sonrası ekran görüntüleriyle düzeltmeler. Yayınlanan arayüzü lansmandan önce sıkılaştırmak için kullanışlıdır.',
    examplePrompt:
      'Kod Yazan Tasarımcı: görsel denetim ardından atomik commit\'ler ve öncesi/sonrası ekran görüntüleriyle düzeltmeler.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Siyah / sıcak kağıt / neon-lime kontrastında İsviçre ızgaralı fintech sunum şablonu.\nKullanıcılar sıkı modüler düzene, kalın sayısal kartlara, ölçülü harekete ve\ntek HTML dosyasında klavye/tıklama navigasyonuna sahip premium veri hikayesi slaytları istediğinde kullan.',
    examplePrompt:
      'Modüler veri kartları, lime vurguları ve temiz klavye navigasyonuyla İsviçre ızgaralı bir fintech strateji sunumu oluştur.',
  },
  'doc': {
    description:
      'OpenAI\'nin belge becerisi aracılığıyla biçimlendirme ve düzen sadakatiyle .docx belgelerini oku, oluştur ve düzenle.',
    examplePrompt:
      'OpenAI\'nin belge becerisi aracılığıyla biçimlendirme ve düzen sadakatiyle .docx belgelerini oku, oluştur ve düzenle.',
  },
  'doc-kami-parchment': {
    description:
      'Sıcak parşömen tuvali (#f5f4ed), tek renkli ink-blue vurgu (#1B365D), tek bir serif yazı ailesi ve editöryel düzeyde tipografi.',
    examplePrompt:
      'İçeriğimi tek renkli ink-blue vurgular, tek bir serif yazı ailesi ve editöryel düzeyde tipografiye sahip sıcak bir parşömen belgesine dönüştürmek için Kami Parchment Document şablonunu kullan. Şablonun görsel kimliğini koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'docx': {
    description:
      'Değişiklik izleme, yorumlar ve biçimlendirmeyle Word belgeleri oluştur, düzenle ve analiz et. Tasarım brifleri, metin belgeleri ve incelemeye hazır teslimatlar için kullanışlıdır.',
    examplePrompt:
      'Değişiklik izleme, yorumlar ve biçimlendirmeyle Word belgeleri oluştur, düzenle ve analiz et.',
  },
  'domain-name-brainstormer': {
    description:
      '.com, .io, .dev ve .ai dahil birden fazla TLD\'de yaratıcı alan adı fikirleri üret ve uygunluğu kontrol et.',
    examplePrompt:
      '.com, .io, .dev ve .ai dahil birden fazla TLD\'de yaratıcı alan adı fikirleri üret ve uygunluğu kontrol et.',
  },
  'ecommerce-image-workflow': {
    description:
      'Gerçek ürün referans fotoğraflarından ürüne sadık ana, özellik ve yaşam tarzı\ngörsellerinden oluşan derli toplu bir set üretmeye yönelik referans-ürün\ne-ticaret görsel iş akışı. V1, yüklenmiş ürün görseli gerektirir ve yalnızca brif\ntabanlı konsept üretimini ve platforma özel toplu dışa aktarmaları bilinçli olarak erteler.',
    examplePrompt:
      'Yüklediğim ürün referans fotoğrafını derli toplu bir e-ticaret görsel\nsetine dönüştürmek için Ecommerce Image Workflow\'u kullan: bir ana paket\nçekimi, bir özellik vurgu görseli ve bir yaşam tarzı sahnesi. Ürünün tam\nkimliğini, rengini, malzemesini, logo yerleşimini, yapısını ve oranlarını koru.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Bordo / pudra / mat altın paletinde editöryel stüdyo sunum şablonu.\nKullanıcılar hap etiketleri, büyük tipografik ifadeler, ilke kartları ve\nyönlendirmeli klavye/tıklama navigasyonuna sahip premium manifesto veya kültür slaytları istediğinde kullan.',
    examplePrompt:
      'Bir etiket bulutu slaytı ve sekiz ilkelik bir kart ızgarasıyla bordo ve pudra renklerinde premium bir editöryel sunum oluştur.',
  },
  'emilkowalski-motion': {
    description:
      'Emil Kowalski\'nin animasyon rehberliğinden esinlenen hareket tasarımı takip becerisi. Ürün düzeyinde ölçülülükle zarif mikro etkileşimler, durum geçişleri ve sayfa hareketi eklemek için bir arayüz var olduktan sonra kullan.',
    examplePrompt:
      'Mevcut HTML eserinde emilkowalski-motion\'ı kullan: temel düzeni değiştirmeden ölçülü mikro etkileşimler, durum geçişleri ve azaltılmış hareket yedekleri ekle.',
  },
  'enhance-prompt': {
    description:
      'İstemleri tasarım spesifikasyonları ve UI/UX terminolojisiyle iyileştir. Tasarımdan koda iş akışları ve görsel çıktı isteklerini netleştirmek için kullanışlıdır.',
    examplePrompt:
      'İstemleri tasarım spesifikasyonları ve UI/UX terminolojisiyle iyileştir.',
  },
  'export-download-debugging': {
    description:
      'Tarayıcı, önizleme veya Electron dışa aktarma/indirme hatalarını teşhis et ve düzelt; özellikle Farklı Kaydet, Blob/Data URL\'leri, File System Access API, createWritable hataları ve 0 KB dosyaları içeren görsel dışa aktarma sorunları.',
    examplePrompt:
      'Tarayıcı, önizleme veya Electron dışa aktarma/indirme hatalarını teşhis et ve düzelt; özellikle Farklı Kaydet, Blob/Data URL\'leri, File System Access API, createWritable hataları ve 0 KB dosyaları içeren görsel dışa aktarma sorunları.',
  },
  'fal-3d': {
    description:
      'fal.ai aracılığıyla metinden veya görsellerden 3D modeller üret. Oyun varlıkları, AR önizlemeleri, ürün maketleri ve konsept heykeltıraşlığı için kullanışlıdır.',
    examplePrompt:
      'fal.ai aracılığıyla metinden veya görsellerden 3D modeller üret.',
  },
  'fal-generate': {
    description:
      'fal.ai yapay zeka modelleriyle görseller ve videolar oluşturun. Flux, SDXL, ideogram ve diğer toplulukta barındırılan uç noktaları kapsayan üretim düzeyinde katalog.',
    examplePrompt:
      'fal.ai yapay zeka modelleriyle görseller ve videolar oluşturun.',
  },
  'fal-image-edit': {
    description:
      'fal.ai üzerinde barındırılan modellerle yapay zeka destekli görsel düzenleme: stil aktarımı, arka plan kaldırma, nesne kaldırma ve inpainting.',
    examplePrompt:
      'fal.ai üzerinde barındırılan modellerle yapay zeka destekli görsel düzenleme: stil aktarımı, arka plan kaldırma, nesne kaldırma ve inpainting.',
  },
  'fal-kling-o3': {
    description:
      'Kling O3 ile, Kling\'in en güçlü model ailesiyle, fal.ai üzerinden görseller ve videolar oluşturun.',
    examplePrompt:
      'Kling O3 ile, Kling\'in en güçlü model ailesiyle, fal.ai üzerinden görseller ve videolar oluşturun.',
  },
  'fal-lip-sync': {
    description:
      'fal.ai üzerinden konuşan kafa videoları oluşturun ve sesi videoyla dudak senkronizasyonu yapın. Açıklayıcı avatarlar, çok dilli dublaj önizlemeleri ve sosyal medya kesitleri için kullanışlıdır.',
    examplePrompt:
      'fal.ai üzerinden konuşan kafa videoları oluşturun ve sesi videoyla dudak senkronizasyonu yapın.',
  },
  'fal-realtime': {
    description:
      'fal.ai üzerinden gerçek zamanlı ve akışlı yapay zeka görsel oluşturma. Moodboard keşfi, taslak varyasyonları ve hızlı yaratıcı iterasyon için uygundur.',
    examplePrompt:
      'fal.ai üzerinden gerçek zamanlı ve akışlı yapay zeka görsel oluşturma.',
  },
  'fal-restore': {
    description:
      'Görsel kalitesini geri yükleyin ve düzeltin — fal.ai\'nin barındırılan restorasyon modelleriyle bulanıklığı giderin, gürültüyü azaltın, yüzleri düzeltin ve eski belgeleri restore edin.',
    examplePrompt:
      'Görsel kalitesini geri yükleyin ve düzeltin — fal.ai\'nin barındırılan restorasyon modelleriyle bulanıklığı giderin, gürültüyü azaltın, yüzleri düzeltin ve eski belgeleri restore edin.',
  },
  'fal-train': {
    description:
      'Bir markaya, karaktere veya stile özel kişiselleştirilmiş görsel oluşturma için fal.ai üzerinde özel yapay zeka modelleri (LoRA) eğitin.',
    examplePrompt:
      'Bir markaya, karaktere veya stile özel kişiselleştirilmiş görsel oluşturma için fal.ai üzerinde özel yapay zeka modelleri (LoRA) eğitin.',
  },
  'fal-tryon': {
    description:
      'Sanal deneme — fal.ai\'nin barındırılan deneme modelleriyle kıyafetlerin bir kişinin üzerinde nasıl durduğunu görün. E-ticaret, lookbook\'lar ve stil denemeleri için kullanışlıdır.',
    examplePrompt:
      'Sanal deneme — fal.ai\'nin barındırılan deneme modelleriyle kıyafetlerin bir kişinin üzerinde nasıl durduğunu görün.',
  },
  'fal-upscale': {
    description:
      'fal.ai üzerinde barındırılan yapay zeka süper çözünürlük modellerini kullanarak görsel ve video çözünürlüğünü büyütün ve iyileştirin.',
    examplePrompt:
      'fal.ai üzerinde barındırılan yapay zeka süper çözünürlük modellerini kullanarak görsel ve video çözünürlüğünü büyütün ve iyileştirin.',
  },
  'fal-video-edit': {
    description:
      'Yapay zeka kullanarak mevcut videoları düzenleyin — fal.ai\'nin barındırılan video modelleriyle stili yeniden düzenleyin, çözünürlüğü büyütün, arka planı kaldırın ve ses ekleyin.',
    examplePrompt:
      'Yapay zeka kullanarak mevcut videoları düzenleyin — fal.ai\'nin barındırılan video modelleriyle stili yeniden düzenleyin, çözünürlüğü büyütün, arka planı kaldırın ve ses ekleyin.',
  },
  'fal-vision': {
    description:
      'Görselleri analiz edin — fal.ai görü modelleriyle nesneleri bölütleyin, tespit edin, OCR çalıştırın, betimleyin ve görsel sorulara yanıt verin.',
    examplePrompt:
      'Görselleri analiz edin — fal.ai görü modelleriyle nesneleri bölütleyin, tespit edin, OCR çalıştırın, betimleyin ve görsel sorulara yanıt verin.',
  },
  'faq-page': {
    description:
      'Katlanabilir akordeon bölümleri, arama işlevi ve kategori filtrelemesi olan bir Sıkça Sorulan Sorular (SSS) sayfası.\nBrief "SSS", "yardım merkezi", "sorular" veya "destek sayfası" istediğinde kullanın.',
    examplePrompt:
      'Katlanabilir akordeon bölümleri, arama işlevi ve kategori filtrelemesi olan bir Sıkça Sorulan Sorular (SSS) sayfası.',
  },
  'field-notes-editorial-template': {
    description:
      'Yumuşak kağıt arka planı, serif kahraman tipografisi, yuvarlatılmış pastel içgörü kartları ve bir retention grafik paneli olan editöryel "Field Notes" rapor şablonu.\nKullanıcılar premium dergi tarzı bir iş raporu, yönetim kurulu notu tek sayfası veya zarif veri hikaye anlatımı düzeni istediğinde kullanın.',
    examplePrompt:
      'Üç içgörü kartı, anahtar metrik blokları ve bir retention çizgi grafiği içeren editöryel Field Notes tarzı bir raporu, cilalı tek dosyalık bir HTML sayfasında oluşturun.',
  },
  'figma-code-connect-components': {
    description:
      'Tasarım sistemi güncellemelerinin otomatik olarak kod tabanına akması için Figma tasarım bileşenlerini Code Connect kullanarak kod bileşenlerine bağlayın.',
    examplePrompt:
      'Tasarım sistemi güncellemelerinin otomatik olarak kod tabanına akması için Figma tasarım bileşenlerini Code Connect kullanarak kod bileşenlerine bağlayın.',
  },
  'figma-create-design-system-rules': {
    description:
      'Figma\'dan koda iş akışları için projeye özel tasarım sistemi kuralları oluşturun. Token\'ları, adlandırmayı ve lint kurallarını tek bir kaynakta toplamak için kullanışlıdır.',
    examplePrompt:
      'Figma\'dan koda iş akışları için projeye özel tasarım sistemi kuralları oluşturun.',
  },
  'figma-create-new-file': {
    description:
      'Yeni boş bir Figma Design veya FigJam dosyası oluşturun. Betiklenmiş tasarım sistemi veya atölye iş akışlarında ilk adım olarak kullanışlıdır.',
    examplePrompt:
      'Yeni boş bir Figma Design veya FigJam dosyası oluşturun.',
  },
  'figma-generate-design': {
    description:
      'Tasarım sistemi bileşenlerini kullanarak koddan veya açıklamadan Figma\'da ekranlar oluşturun veya güncelleyin. Uygulama sayfalarını tasarım token\'larını kullanarak Figma\'ya çevirin.',
    examplePrompt:
      'Tasarım sistemi bileşenlerini kullanarak koddan veya açıklamadan Figma\'da ekranlar oluşturun veya güncelleyin.',
  },
  'figma-generate-library': {
    description:
      'Bir kod tabanından Figma\'da profesyonel düzeyde bir tasarım sistemi kütüphanesi oluşturun veya güncelleyin. Figma\'daki referans kaynağını yayınlanmış bileşenlerle senkronize tutmak için kullanışlıdır.',
    examplePrompt:
      'Bir kod tabanından Figma\'da profesyonel düzeyde bir tasarım sistemi kütüphanesi oluşturun veya güncelleyin.',
  },
  'figma-implement-design': {
    description:
      'Figma tasarımlarını 1:1 görsel doğrulukla üretime hazır koda çevirin. Figma çerçevelerini doğrudan bir frontend ajanına devretmek için kullanışlıdır.',
    examplePrompt:
      'Figma tasarımlarını 1:1 görsel doğrulukla üretime hazır koda çevirin.',
  },
  'figma-use': {
    description:
      'Canvas yazma işlemleri, incelemeler, değişkenler ve tasarım sistemi çalışmaları için Figma Plugin API betikleri çalıştırın. Bu katalogtaki diğer tüm Figma yetenekleri için ön koşuldur.',
    examplePrompt:
      'Canvas yazma işlemleri, incelemeler, değişkenler ve tasarım sistemi çalışmaları için Figma Plugin API betikleri çalıştırın.',
  },
  'flutter-animating-apps': {
    description:
      'Flutter uygulamalarında animasyonlu efektler, geçişler ve hareket tasarımı uygulayın. Yerel iOS/Android hareket tasarımı için kullanışlıdır.',
    examplePrompt:
      'Flutter uygulamalarında animasyonlu efektler, geçişler ve hareket tasarımı uygulayın.',
  },
  'frame-data-chart-nyt': {
    description:
      'NYT haber odası tipografisi, kademeli ortaya çıkma animasyonu ve editöryel düzeyde grafikler (çizgi, çubuk veya aralık bandı).',
    examplePrompt:
      'NYT-Style Data Chart Frame şablonunu kullanarak içeriğimi NYT haber odası tipografisi, kademeli ortaya çıkma animasyonu ve editöryel düzeyde grafiklere sahip bir çerçeveye dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-flowchart-sticky': {
    description:
      'SVG eğri bağlayıcıları, yapışkan not düğümleri ve beyaz tahta beyin fırtınası havasında imleç etkileşimi.',
    examplePrompt:
      'Sticky Flowchart Frame şablonunu kullanarak içeriğimi SVG eğri bağlayıcıları, yapışkan not düğümleri ve imleç etkileşimine sahip bir beyaz tahta beyin fırtınası çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-glitch-title': {
    description:
      'Video geçişleri veya cyberpunk hero görselleri için dijital glitch, kromatik kayma ve veri bozulması başlık çerçevesi.',
    examplePrompt:
      'Glitch Title Frame şablonunu kullanarak içeriğimi bir video geçişi veya cyberpunk hero için dijital glitch, kromatik kayma ve veri bozulması başlık çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-light-leak-cinema': {
    description:
      'Sinematik açılışlar veya bölüm kartları için film ışık sızıntıları, grain, 16:9 letterbox ve büyük serif yazı tipi.',
    examplePrompt:
      'Light-Leak Cinematic Frame şablonunu kullanarak içeriğimi film ışık sızıntıları, grain, letterbox çerçeveleme ve büyük serif yazı tipine sahip sinematik bir açılış veya bölüm kartına dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Video girişleri, açılış sayfası hero görselleri veya posterler için uygun, alıntı bindirmeli WebGL tarzı akışkan yer değiştirme arka planı.',
    examplePrompt:
      'Liquid Background Hero şablonunu kullanarak içeriğimi bir video girişi, açılış sayfası hero görseli veya poster için alıntı bindirmeli WebGL tarzı akışkan yer değiştirme arka planına dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-logo-outro': {
    description:
      'Video çıkışları veya marka kapanış çerçeveleri için bölümlü logo birleşimi, parlama bloom efekti ve slogan ortaya çıkışı.',
    examplePrompt:
      'Logo Outro Frame şablonunu kullanarak içeriğimi bölümlü logo birleşimi, parlama bloom efekti ve slogan ortaya çıkışına sahip bir video çıkışı veya marka kapanış çerçevesine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frame-macos-notification': {
    description:
      'Video bindirmeleri veya ürün tanıtımları için uygun, uygulama simgesi, başlık ve gövdeye sahip gerçekçi macOS bildirim afişi.',
    examplePrompt:
      'macOS Notification Banner şablonunu kullanarak içeriğimi bir video bindirmesi veya ürün tanıtımı için gerçekçi bir macOS bildirim afişine dönüştür. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'frontend-design': {
    description:
      'Güçlü görsel yönelim, cilalı tipografi, özenli düzen ve çalışan HTML/CSS/JS veya framework koduyla özgün, üretim düzeyinde frontend arayüzleri oluşturun. Web siteleri, açılış sayfaları, dashboard\'lar, React bileşenleri, uygulama ekranları ve UI güzelleştirme için kullanın.',
    examplePrompt:
      'Bir finans ekibi için gerçek etkileşim durumları, rafine tipografi ve özgün bir görsel yönelime sahip, üretim kalitesinde bir SaaS analiz dashboard\'u tasarla ve geliştir.',
  },
  'frontend-dev': {
    description:
      'Sinematik animasyonlar, MiniMax API üzerinden yapay zeka tarafından üretilen medya ve üretken sanat içeren tam yığın frontend. Hero sayfaları ve vitrin siteleri için kullanışlıdır.',
    examplePrompt:
      'Sinematik animasyonlar, MiniMax API üzerinden yapay zeka tarafından üretilen medya ve üretken sanat içeren tam yığın frontend.',
  },
  'frontend-skill': {
    description:
      'Ölçülü kompozisyonla görsel olarak güçlü açılış sayfaları, web siteleri ve uygulama UI\'ları oluşturun. OpenAI\'nin üretim frontend kılavuzu.',
    examplePrompt:
      'Ölçülü kompozisyonla görsel olarak güçlü açılış sayfaları, web siteleri ve uygulama UI\'ları oluşturun.',
  },
  'frontend-slides': {
    description:
      'Görsel stil önizlemeleri içeren animasyon açısından zengin HTML sunumları oluşturun. Çevrimiçi sunumlar, gömülü konuşmalar ve interaktif brifingler için kullanışlıdır.',
    examplePrompt:
      'Görsel stil önizlemeleri içeren animasyon açısından zengin HTML sunumları oluşturun.',
  },
  'full-page-screenshot': {
    description:
      'Chrome DevTools Protocol aracılığıyla sıfır bağımlılıkla web sayfalarının tam sayfa ekran görüntülerini yakalayın. Portföyler, vaka çalışmaları ve denetim raporları için kullanışlıdır.',
    examplePrompt:
      'Chrome DevTools Protocol aracılığıyla sıfır bağımlılıkla web sayfalarının tam sayfa ekran görüntülerini yakalayın.',
  },
  'gif-sticker-maker': {
    description:
      'MiniMax API aracılığıyla fotoğrafları Funko Pop / Pop Mart tarzında animasyonlu GIF çıkartmalarına dönüştürün. Kişiselleştirilmiş sohbet çıkartmaları ve avatar paketleri için kullanışlıdır.',
    examplePrompt:
      'MiniMax API aracılığıyla fotoğrafları Funko Pop / Pop Mart tarzında animasyonlu GIF çıkartmalarına dönüştürün.',
  },
  'gpt-taste': {
    description:
      'Elit UX/UI ve İleri Düzey GSAP Hareket Mühendisi. Düzen çeşitliliği için Python destekli gerçek rastgeleleştirme, katı AIDA sayfa yapısı, geniş editöryel tipografi (6 satırlık kaydırmaları yasaklar), boşluksuz bento ızgaraları, katı GSAP ScrollTrigger\'lar (sabitleme, yığma, scrubbing), satır içi mikro görseller ve geniş bölüm aralıklarını zorunlu kılar.',
    examplePrompt:
      'gpt-taste ile yüksek çeşitlilikli bir açılış sayfası oluştur: editöryel tipografi, jenerik olmayan düzen, kalibre edilmiş renk ve yığının desteklediği yerlerde zarif GSAP tarzı hareket.',
  },
  'gsap-core': {
    description:
      'Çekirdek API için resmi GSAP becerisi — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (duyarlı, prefers-reduced-motion). Kullanıcı bir JavaScript animasyon kütüphanesi, React/Vue/vanilla\'da animasyon, GSAP tween\'leri, easing, temel animasyon, duyarlı veya azaltılmış hareket animasyonu istediğinde ya da GSAP ile DOM/SVG animasyonu yaparken kullanın. Kullanıcının zaman çizelgelerine, kaydırma tabanlı animasyona veya framework\'ten bağımsız bir kütüphaneye ihtiyacı olduğunda GSAP\'i önerin. GSAP herhangi bir framework\'te veya vanilla JS\'te çalışır; Webflow Interactions\'ı güçlendirir.',
    examplePrompt:
      'Çekirdek API için resmi GSAP becerisi — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (duyarlı, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Vue, Svelte ve diğer React dışı framework\'ler için resmi GSAP becerisi — yaşam döngüsü, kapsam belirleyici seçiciler, unmount\'ta temizleme. Kullanıcı Vue, Nuxt, Svelte, SvelteKit\'te animasyon istediğinde ya da Vue/Svelte ile GSAP, onMounted, onMount, onDestroy hakkında soru sorduğunda kullanın. Başka bir kütüphane belirtilmediği sürece framework animasyonu için GSAP\'i önerin. React için gsap-react kullanın.',
    examplePrompt:
      'Vue, Svelte ve diğer React dışı framework\'ler için resmi GSAP becerisi — yaşam döngüsü, kapsam belirleyici seçiciler, unmount\'ta temizleme.',
  },
  'gsap-performance': {
    description:
      'Performans için resmi GSAP becerisi — transform\'ları tercih edin, layout thrashing\'den kaçının, will-change, batching. GSAP animasyonlarını optimize ederken, jank\'i azaltırken veya kullanıcı animasyon performansı, FPS ya da akıcı 60fps hakkında soru sorduğunda kullanın.',
    examplePrompt:
      'Performans için resmi GSAP becerisi — transform\'ları tercih edin, layout thrashing\'den kaçının, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'GSAP eklentileri için resmi GSAP becerisi — kayıt, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG ve fizik eklentileri, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Kullanıcı bir GSAP eklentisi, scroll-to, flip animasyonları, draggable, SVG çizimi veya eklenti kaydı hakkında soru sorduğunda kullanın.',
    examplePrompt:
      'GSAP eklentileri için resmi GSAP becerisi — kayıt, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, SVG ve fizik eklentileri, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'React için resmi GSAP becerisi — useGSAP hook\'u, refs, gsap.context(), temizleme. Kullanıcı React veya Next.js\'te animasyon istediğinde ya da React ile GSAP, useGSAP veya unmount\'ta temizleme hakkında soru sorduğunda kullanın. Kullanıcı başka bir kütüphane seçmediği sürece React animasyonu için GSAP\'i önerin.',
    examplePrompt:
      'React için resmi GSAP becerisi — useGSAP hook\'u, refs, gsap.context(), temizleme.',
  },
  'gsap-scrolltrigger': {
    description:
      'ScrollTrigger için resmi GSAP becerisi — kaydırmaya bağlı animasyonlar, sabitleme (pinning), scrub, tetikleyiciler. Kaydırma tabanlı animasyon, paralaks, sabitlenmiş bölümler oluştururken veya önerirken ya da kullanıcı ScrollTrigger, kaydırma animasyonları veya sabitleme hakkında soru sorduğunda kullanın. Bir kütüphane belirtilmediğinde kaydırmaya dayalı animasyon için GSAP önerin.',
    examplePrompt:
      'ScrollTrigger için resmi GSAP becerisi — kaydırmaya bağlı animasyonlar, sabitleme (pinning), scrub, tetikleyiciler.',
  },
  'gsap-timeline': {
    description:
      'Zaman çizelgeleri için resmi GSAP becerisi — gsap.timeline(), konum parametresi, iç içe yerleştirme, oynatma. Animasyonları sıralarken, kare dizilerini koreografiye dökerken veya kullanıcı animasyon sıralaması, zaman çizelgeleri ya da animasyon düzeni hakkında soru sorduğunda kullanın (GSAP\'te veya zaman çizelgelerini destekleyen bir kütüphane önerirken).',
    examplePrompt:
      'Zaman çizelgeleri için resmi GSAP becerisi — gsap.timeline(), konum parametresi, iç içe yerleştirme, oynatma.',
  },
  'gsap-utils': {
    description:
      'gsap.utils için resmi GSAP becerisi — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Kullanıcı gsap.utils, clamp, mapRange, random, snap, toArray, wrap veya GSAP\'teki yardımcı araçlar hakkında soru sorduğunda kullanın.',
    examplePrompt:
      'gsap.utils için resmi GSAP becerisi — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Bir komuttan el çizimi Excalidraw diyagramları oluşturun — animasyonlu SVG, barındırılan düzenleme bağlantısı ve PNG dışa aktarımı. Claude Code, Codex, Gemini CLI ve standart beceri yollarını destekleyen her ajanla çalışır.',
    examplePrompt:
      'Bir komuttan el çizimi Excalidraw diyagramları oluşturun — animasyonlu SVG, barındırılan düzenleme bağlantısı ve PNG dışa aktarımı.',
  },
  'hatch-pet': {
    description:
      'Karakter çiziminden, ekran görüntülerinden, üretilen görsellerden veya görsel referanslardan Codex uyumlu animasyonlu evcil hayvan sprite sayfaları oluşturun, onarın, doğrulayın, önizleyin ve paketleyin. Kullanıcı bir Codex evcil hayvanı çıkarmak, özel bir animasyonlu evcil hayvan oluşturmak ya da 8x9 atlas, şeffaf kullanılmayan hücreler, satır satır animasyon komutları, QA iletişim sayfaları, önizleme videoları ve pet.json paketlemesiyle yerleşik bir evcil hayvan varlığı oluşturmak istediğinde kullanın. Bu beceri, görsel üretim için kurulu $imagegen sistem becerisini bir araya getirir ve belirleyici sprite sayfası birleştirme için paketlenmiş betikleri kullanır.',
    examplePrompt:
      'Bana minik bir piksel sanatı shiba evcil hayvanı çıkar — dostça, dik oturan, küçük bir nar aksesuarlı. hatch-pet becerisini baştan sona kullan.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Cesur mavi + turuncu editoryal dilde Retro Çeyreklik Değerlendirme sunum şablonu. Kullanıcılar ağır slab başlıklar, temiz krem kağıt bölümler, yapılandırılmış ızgaralar ve hızlı premium hareket temposu (3 slayt, her biri video modunda 3 saniyenin altında tutulur) içeren yüksek etkili bir çeyreklik değerlendirme / yol haritası destesi istediğinde kullanın.',
    examplePrompt:
      'Cesur mavi + turuncu editoryal dilde Retro Çeyreklik Değerlendirme sunum şablonu.',
  },
  'image-enhancer': {
    description:
      'Profesyonel sunumlar ve dokümantasyon için çözünürlüğü, keskinliği ve netliği artırarak görsel ve ekran görüntüsü kalitesini iyileştirin.',
    examplePrompt:
      'Profesyonel sunumlar ve dokümantasyon için çözünürlüğü, keskinliği ve netliği artırarak görsel ve ekran görüntüsü kalitesini iyileştirin.',
  },
  'image-to-code': {
    description:
      'Codex için seçkin görselden koda web sitesi becerisi. Görsel olarak önemli web görevlerinde, önce tasarım görsel(ler)ini kendisi üretmeli, bunları derinlemesine analiz etmeli, ardından web sitesini bunlara olabildiğince yakın şekilde uygulamalıdır. Codex\'te, küçük sıkıştırılmış panolar yerine büyük, okunabilir, bölüme özgü görselleri tercih etmeli, eski görselleri kırpmak yerine bölümler veya detay görünümleri için sıfırdan bağımsız görseller üretmeli, tembel az üretimden kaçınmalı, kart-içinde-kart-içinde-kart arayüzünden kaçınmalı ve hero bölümünü küçük bir dizüstü bilgisayarda temiz, ferah, okunabilir ve görünür tutmalıdır.',
    examplePrompt:
      'image-to-code\'u kullanın: önce görsel referanslar oluşturun veya analiz edin, ardından referans yönüne yakından uyan duyarlı bir web sitesi yapıtı uygulayın.',
  },
  'imagegen': {
    description:
      'Proje varlıkları için OpenAI\'ın Image API\'sini kullanarak görseller oluşturun ve düzenleyin — arayüz taslakları, simgeler, illüstrasyonlar, sosyal kartlar ve görsel referanslar.',
    examplePrompt:
      'Proje varlıkları için OpenAI\'ın Image API\'sini kullanarak görseller oluşturun ve düzenleyin — arayüz taslakları, simgeler, illüstrasyonlar, sosyal kartlar ve görsel referanslar.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Premium, uygulamaya özgü ekran konseptleri ve akışları oluşturmak için seçkin mobil uygulama görsel üretim becerisi. iOS, Android ve çapraz platform mobil ürünleri için tasarlanmıştır. Temiz hiyerarşi, rahatça okunabilir metin, güçlü çoklu ekran tutarlılığı, kontrollü renk paletleri, sıradan olmayan yaratıcı yön, dokulu yüzeyler, görsel öncülüğünde kompozisyon, zevkli özel ikonografi ve temiz telefon maketi çerçevelemeye öncelik verir. Varsayılan olarak ekranlar, ana odak uygulama içeriğinde kalırken görünür çerçeveli ince ve premium bir iPhone veya benzeri telefon maketi içinde gösterilmelidir. Bu beceri yalnızca görsel üretir. Kod yazmaz.',
    examplePrompt:
      'Bu ürün özeti için premium mobil uygulama konsept kareleri oluştur; okunabilir, uygulamaya özgü hiyerarşi ve ekranlar arasında tutarlı bir görsel sistemle.',
  },
  'imagegen-frontend-web': {
    description:
      'Premium, dönüşüm odaklı web sitesi tasarım referansları üretmek için seçkin ön uç görsel yönlendirme becerisi. KRİTİK ÇIKTI KURALI — HER BÖLÜM İÇİN AYRI BİR yatay görsel üretin. 8 bölümlü bir açılış sayfası 8 görsel üretir. Birden fazla bölümü asla tek bir görsele sıkıştırmayın. Kompozisyon çeşitliliğini (her zaman sol-metin / sağ-görsel değil), arka plan görseli özgürlüğünü, çeşitli CTA\'ları, çeşitli hero ölçeklerini (dev / orta / mini minimalist), anlatı konsept omurgasını, ikinci okuma anlarını ve tüm görseller boyunca tek tutarlı bir paleti zorunlu kılar. Geliştiricilerin veya kodlama modellerinin doğru şekilde yeniden oluşturabileceği açılış sayfaları, pazarlama siteleri ve ürün kompozisyonları için optimize edilmiştir.',
    examplePrompt:
      'Her açılış sayfası bölümü için ayrı premium web sitesi referans görselleri üretin; tutarlı bir palet ve çeşitli kompozisyon koruyarak.',
  },
  'imagen': {
    description:
      'Arayüz taslakları, simgeler, illüstrasyonlar ve görsel varlıklar için Google Gemini\'nin görsel üretim API\'sini kullanarak görseller oluşturun.',
    examplePrompt:
      'Arayüz taslakları, simgeler, illüstrasyonlar ve görsel varlıklar için Google Gemini\'nin görsel üretim API\'sini kullanarak görseller oluşturun.',
  },
  'impeccable-design-polish': {
    description:
      'Impeccable\'dan ilham alan takip eden tasarım rötuş becerisi. Bir web veya HTML yapıtı oluşturulduktan sonra sayfayı denetlemek, eleştirmek, rötuşlamak, canlandırmak, sağlamlaştırmak ve canlı/paylaşım geçişine hazırlamak için kullanın.',
    examplePrompt:
      'Mevcut HTML yapıtında impeccable-design-polish kullanın: görsel hiyerarşiyi denetleyin, yapay zeka izlerini kaldırın, metni sıkılaştırın, ölçülü hareket ekleyin ve duyarlılık/erişilebilirlik sorunlarını sağlamlaştırın.',
  },
  'login-flow': {
    description:
      'Mobil giriş ve kimlik doğrulama akışı ekranları',
    examplePrompt:
      'Mobil giriş ve kimlik doğrulama akışı ekranları',
  },
  'marketing-psychology': {
    description:
      'Metin ve tasarıma psikolojik ilkeleri ve davranış bilimini uygulayın. Kancaları, çerçevelemeyi ve fiyatlandırma sunumunu sıkılaştırmak için kullanışlıdır.',
    examplePrompt:
      'Metin ve tasarıma psikolojik ilkeleri ve davranış bilimini uygulayın.',
  },
  'minimalist-ui': {
    description:
      'Temiz editoryal tarzda arayüzler. Sıcak tek renkli palet, tipografik kontrast, düz bento ızgaraları, soluk pasteller. Gradyan yok, ağır gölge yok.',
    examplePrompt:
      'Sıcak tek renk, net tipografi, düz yapı ve dekoratif fazlalık olmadan minimalist editoryal bir ürün arayüzü tasarlayın.',
  },
  'minimax-docx': {
    description:
      'OpenXML SDK kullanarak profesyonel DOCX belge oluşturma ve düzenleme. Markalı raporlar, cilalı teklifler ve şablon tabanlı yazım için kullanışlıdır.',
    examplePrompt:
      'OpenXML SDK kullanarak profesyonel DOCX belge oluşturma ve düzenleme.',
  },
  'minimax-pdf': {
    description:
      'Token tabanlı bir tasarım sistemi ve 15 kapak stiliyle PDF\'leri oluşturun, doldurun ve yeniden biçimlendirin. Markalı PDF\'ler, e-kılavuzlar ve raporlar için kullanışlıdır.',
    examplePrompt:
      'Token tabanlı bir tasarım sistemi ve 15 kapak stiliyle PDF\'leri oluşturun, doldurun ve yeniden biçimlendirin.',
  },
  'mockup-device-3d': {
    description:
      'Ekranlara gömülü gerçek HTML, cam-mercek kırılması ve 360 derece döner tabla kompozisyonuyla statik iPhone ve MacBook 3D tarzı vitrin.',
    examplePrompt:
      'İçeriğimi, ekranlara gömülü gerçek HTML içeren statik bir iPhone ve MacBook 3D tarzı vitrine dönüştürmek için Device 3D Showcase şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'nanobanana-ppt': {
    description:
      'NanoBanana yığını aracılığıyla belge analizi ve stilize edilmiş görsellerle yapay zeka destekli PPT üretimi. Görsel üretimini yapılandırılmış deste çıktısıyla birleştirir.',
    examplePrompt:
      'NanoBanana yığını aracılığıyla belge analizi ve stilize edilmiş görsellerle yapay zeka destekli PPT üretimi.',
  },
  'full-output-enforcement': {
    description:
      'Varsayılan LLM kısaltma davranışını geçersiz kılar. Eksiksiz kod üretimini zorunlu kılar, yer tutucu kalıpları yasaklar ve token sınırı bölünmelerini temiz bir şekilde ele alır. Kapsamlı, kısaltılmamış çıktı gerektiren her göreve uygulayın.',
    examplePrompt:
      'İstenen yapı için yer tutucu yorumlar olmadan, atlanmış bölümler olmadan ve yalnızca çıktı uzunluğu gerektiriyorsa temiz bölme talimatlarıyla eksiksiz uygulamayı üretin.',
  },
  'paywall-upgrade-cro': {
    description:
      'Yükseltme ekranlarını, ödeme duvarlarını ve ek satış modallarını tasarlayın ve optimize edin. SaaS dönüşüm tasarımı ve fiyatlandırma sayfası denemeleri için faydalıdır.',
    examplePrompt:
      'Yükseltme ekranlarını, ödeme duvarlarını ve ek satış modallarını tasarlayın ve optimize edin.',
  },
  'pdf': {
    description:
      'Metin çıkarın, PDF oluşturun ve formları işleyin. Basın bültenleri, markalı tek sayfalık belgeler ve yazdırılabilir tasarım çıktıları için faydalıdır.',
    examplePrompt:
      'Metin çıkarın, PDF oluşturun ve formları işleyin.',
  },
  'pixelbin-media': {
    description:
      '85+ API portföyü ile görseller ve videolar oluşturun ve düzenleyin, Pixelbin aracılığıyla görsel açıdan çekici web sitesi sayfaları geliştirin.',
    examplePrompt:
      '85+ API portföyü ile görseller ve videolar oluşturun ve düzenleyin, Pixelbin aracılığıyla görsel açıdan çekici web sitesi sayfaları geliştirin.',
  },
  'plan-design-review': {
    description:
      'Kıdemli Tasarımcı incelemesi: her tasarım boyutunu 0-10 arası puanlar, 10 puanlık bir tasarımın nasıl göründüğünü açıklar ve AI Slop sinyallerini işaretler. UI çalışmasını birleştirmeden önce bir kontrol noktası olarak faydalıdır.',
    examplePrompt:
      'Kıdemli Tasarımcı incelemesi: her tasarım boyutunu 0-10 arası puanlar, 10 puanlık bir tasarımın nasıl göründüğünü açıklar ve AI Slop sinyallerini işaretler.',
  },
  'platform-design': {
    description:
      'Çapraz platform uygulamaları için Apple HIG, Material Design 3 ve WCAG 2.2\'den 300+ tasarım kuralı. iOS, Android ve web genelinde tek bir tasarım yayınlarken faydalıdır.',
    examplePrompt:
      'Çapraz platform uygulamaları için Apple HIG, Material Design 3 ve WCAG 2.2\'den 300+ tasarım kuralı.',
  },
  'poster-hero': {
    description:
      'Güçlü görsel etkiye sahip dikey poster veya Moments tarzı paylaşım görseli.',
    examplePrompt:
      'İçeriğimi güçlü görsel etkiye sahip dikey bir postere veya Moments tarzı paylaşım görseline dönüştürmek için Marketing Poster şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'ppt-keynote': {
    description:
      'Apple Keynote kalitesinde slaytlar, her ekranda bir kart, klavyeyle sol/sağ gezinme.',
    examplePrompt:
      'İçeriğimi her ekranda bir kart ve klavyeyle sol/sağ gezinme özelliğine sahip Apple Keynote kalitesinde slaytlara dönüştürmek için Keynote tarzı Slides şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'pptx': {
    description:
      'PowerPoint slaytlarını, düzenlerini ve şablonlarını okuyun, oluşturun ve ayarlayın. Yönetici sunumları, eğitim materyalleri ve ürün incelemeleri için faydalıdır.',
    examplePrompt:
      'PowerPoint slaytlarını, düzenlerini ve şablonlarını okuyun, oluşturun ve ayarlayın.',
  },
  'pptx-generator': {
    description:
      'PptxGenJS ile sıfırdan PowerPoint sunumları oluşturun ve düzenleyin — MiniMax\'in üretimde test edilmiş sunum hattı.',
    examplePrompt:
      'PptxGenJS ile sıfırdan PowerPoint sunumları oluşturun ve düzenleyin — MiniMax\'in üretimde test edilmiş sunum hattı.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Bir python-pptx dışa aktarımını kaynak HTML sunumuyla karşılaştırarak denetleyin, düzen/içerik sapmalarını (alt bilgi taşması, kırpılmış içerik, eksik italik/em, kaybolan stiller, ritimsiz boşluk) belirleyin ve katı alt bilgi şeridi + imleç akışı düzen disiplini ile yeniden dışa aktarın. Kullanıcının bir HTML slayt sunumundan oluşturulmuş bir .pptx dosyası olduğunda ve dışa aktarımı karşılaştırmak/denetlemek/doğrulamak/düzeltmek istediğinde bu beceriyi kullanın — "ppt\'yi html ile karşılaştır", "sadakat denetimi", "pptx\'i düzelt", "ppt kesik", "alt bilgi çakışması", "pptx\'te italik eksik", "sunumu yeniden dışa aktar", "pptx-html-fidelity-audit" gibi ifadeler veya bir python-pptx → HTML gidiş-dönüşünün doğrulanması ya da onarılması gereken her durum dahil. Ayrıca kullanıcı size bir deck.html ve bir deck.pptx dosyasını yan yana gösterip görsel farkları ayıkladığında da tetikleyin.',
    examplePrompt:
      'Bir python-pptx dışa aktarımını kaynak HTML sunumuyla karşılaştırarak denetleyin, düzen/içerik sapmalarını (alt bilgi taşması, kırpılmış içerik, eksik italik/em, kaybolan stiller, ritimsiz boşluk) belirleyin ve katı alt bilgi şeridi + imleç akışı düzen disiplini ile yeniden dışa aktarın.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Pull request geri bildirimlerini güvenle takip edin, inceleme yorumlarını veya birleştirme çakışmalarını çözün, düzeltmeleri doğrulayın ve takip eden değişiklikleri commit\'lemeden veya push\'lamadan önce salt okunur bir çapraz inceleme kullanın.',
    examplePrompt:
      'Pull request geri bildirimlerini güvenle takip edin, inceleme yorumlarını veya birleştirme çakışmalarını çözün, düzeltmeleri doğrulayın ve takip eden değişiklikleri commit\'lemeden veya push\'lamadan önce salt okunur bir çapraz inceleme kullanın.',
  },
  'redesign-existing-projects': {
    description:
      'Mevcut web sitelerini ve uygulamaları premium kaliteye yükseltir. Mevcut tasarımı denetler, jenerik AI kalıplarını belirler ve işlevselliği bozmadan üst düzey tasarım standartlarını uygular. Herhangi bir CSS çerçevesi veya saf CSS ile çalışır.',
    examplePrompt:
      'Önce mevcut UI\'ı denetleyin, ardından işlevselliği bozmadan ve faydalı ürün yapısını koruyarak premium kaliteye yeniden tasarlayın.',
  },
  'reference-design-contract': {
    description:
      'Belirsiz zevkleri, ekran görüntülerini, URL\'leri, ürün notlarını veya "bunun gibi hissettir"\nreferanslarını sağlam bir DESIGN.md ve uygulama devir teslimine dönüştürün. Kullanıcının tek seferlik bir istem yerine\nyeniden kullanılabilir bir görsel yön ihtiyacı olduğunda prototipler, sunumlar, yeniden tasarımlar veya görsel remix çalışmalarından\nönce kullanın.',
    examplePrompt:
      'Bir geliştirici notları uygulaması için referans tasarım sözleşmesi oluşturun. Yön; editöryel, sakin, dokunsal ve ciddi hissettirmeli, ancak belirli bir ürünü kopyalamamalı. DESIGN.md ve bir uygulama devir teslimi üretin.',
  },
  'release-notes-one-pager': {
    description:
      'Öne çıkanlar, Eklenenler, Düzeltilenler, Bozucu değişiklikler,\nBilinen sorunlar ve Yükseltme notu içeren tek sayfalık HTML sürüm notları. Kullanıcı ayrıntı sağlamadığında\nher zaman açık "Yok" tarzında bölümler yazar.',
    examplePrompt:
      'v2.3.1 için Eklenenler, Düzeltilenler, Bozucu değişiklikler, Bilinen sorunlar ve bir Yükseltme notu içeren sürüm notları yazın.',
  },
  'remotion': {
    description:
      'React ile programatik video oluşturma. Markalı açıklayıcı videolar, sosyal medya kesitleri, panodan videoya dönüşüm ve yeniden üretilebilir hareketli grafikler için faydalıdır.',
    examplePrompt:
      'React ile programatik video oluşturma.',
  },
  'replicate': {
    description:
      'Replicate\'in API\'sini kullanarak AI modellerini keşfedin, karşılaştırın ve çalıştırın. Sıkça model değiştiren görsel, ses ve video üretim hatları için çok uygundur.',
    examplePrompt:
      'Replicate\'in API\'sini kullanarak AI modellerini keşfedin, karşılaştırın ve çalıştırın.',
  },
  'research-decision-room': {
    description:
      'Dağınık kullanıcı araştırması notlarını, görüşmeleri, destek taleplerini, anketleri ve ürün\nbağlamını kanıta dayalı bir karar odasına dönüştürün: kanıt defteri,\ntema haritası, güven ısı haritası, fırsat matrisi, karar\nnotu ve deney kuyruğu içeren tek bir HTML yapısı. Ekiplerin niteliksel\nsinyallerden kesinlik uydurmadan ürün veya tasarım kararlarına geçmesi gerektiğinde kullanın.',
    examplePrompt:
      'Bir proje yönetimi uygulamasının bir katılım kontrol listesi mi yoksa bağlamsal satır içi ipuçları mı eklemesi gerektiğine karar vermek için 8 görüşme notunu, 24 destek talebini ve son aktivasyon metriklerini bir araştırma karar odasında sentezleyin.',
  },
  'resume-modern': {
    description:
      'Modern minimal özgeçmiş, tek A4 sayfa, baskıya veya PDF dışa aktarımına hazır.',
    examplePrompt:
      'İçeriğimi baskıya veya PDF dışa aktarımına hazır, modern minimal tek sayfalık A4 özgeçmişe dönüştürmek için Modern Resume şablonunu kullanın. Şablonun görsel imzasını koruyun, gerçek içerik ve veri kullanın, lorem ipsum veya yer tutucu görsellerden kaçının.',
  },
  'screenshot': {
    description:
      'İşletim sistemi platformları genelinde masaüstünü, uygulama pencerelerini veya piksel bölgelerini yakalayın. Pazarlama ekran görüntüleri, tasarım incelemeleri ve hata raporları için faydalıdır.',
    examplePrompt:
      'İşletim sistemi platformları genelinde masaüstünü, uygulama pencerelerini veya piksel bölgelerini yakalayın.',
  },
  'screenshots-marketing': {
    description:
      'Playwright ile pazarlama ekran görüntüleri oluşturun. Açılış sayfası hero görselleri, App Store ekran görüntüleri ve changelog görselleri için kullanışlıdır.',
    examplePrompt:
      'Playwright ile pazarlama ekran görüntüleri oluşturun.',
  },
  'shadcn-ui': {
    description:
      'shadcn/ui ile UI bileşenleri oluşturun. Yapılandırılmış, erişilebilir bileşenleri hızlıca sunmak için Stitch tasarım döngüsüyle birlikte çalışır.',
    examplePrompt:
      'shadcn/ui ile UI bileşenleri oluşturun.',
  },
  'shader-dev': {
    description:
      'Ray marching, akışkan simülasyonu, parçacık sistemleri ve prosedürel üretim için GLSL shader teknikleri. Hero görselleri ve hareket karelerinde kullanışlıdır.',
    examplePrompt:
      'Ray marching, akışkan simülasyonu, parçacık sistemleri ve prosedürel üretim için GLSL shader teknikleri.',
  },
  'slack-gif-creator': {
    description:
      'Boyut kısıtlamaları için doğrulayıcılar ve birleştirilebilir animasyon ilkelerinin bulunduğu, Slack için optimize edilmiş animasyonlu GIF\'ler oluşturun.',
    examplePrompt:
      'Boyut kısıtlamaları için doğrulayıcılar ve birleştirilebilir animasyon ilkelerinin bulunduğu, Slack için optimize edilmiş animasyonlu GIF\'ler oluşturun.',
  },
  'slides': {
    description:
      'PptxGenJS ile .pptx sunum destelerini oluşturun ve düzenleyin. Satış desteleri, kickoff brifingleri ve tasarım sistemi vitrinleri için kullanışlıdır.',
    examplePrompt:
      'PptxGenJS ile .pptx sunum destelerini oluşturun ve düzenleyin.',
  },
  'social-reddit-card': {
    description:
      'Oy çubuğu ve yorum sayısı içeren gerçekçi bir Reddit gönderi kartı; video bindirmeleri veya story paylaşımları için uygundur.',
    examplePrompt:
      'İçeriğimi, video bindirmesi veya story paylaşımı için oy çubuğu ve yorum sayısı içeren gerçekçi bir Reddit gönderi kartına dönüştürmek üzere Reddit Post Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'social-spotify-card': {
    description:
      'Albüm kapağı, ilerleme çubuğu ve oynatma kontrollerine sahip Spotify Now Playing tarzı bir kart; video bindirmeleri veya kişisel ana sayfalar için uygundur.',
    examplePrompt:
      'İçeriğimi, video bindirmesi veya kişisel ana sayfa için albüm kapağı, ilerleme çubuğu ve oynatma kontrolleri içeren Spotify Now Playing tarzı bir karta dönüştürmek üzere Spotify Now-Playing Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'social-x-post-card': {
    description:
      'Etkileşim metrikleri (beğeniler, repostlar, görüntülenmeler) içeren gerçekçi bir X gönderi kartı; video bindirmeleri veya paylaşılabilir görsel kartlar için uygundur.',
    examplePrompt:
      'İçeriğimi, video bindirmesi veya paylaşılabilir görsel kart için etkileşim metrikleri içeren gerçekçi bir X gönderi kartına dönüştürmek üzere X / Twitter Post Card şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'high-end-visual-design': {
    description:
      'Yapay zekâya üst düzey bir ajans gibi tasarım yapmayı öğretir. Bir web sitesini pahalı hissettiren tam fontları, boşlukları, gölgeleri, kart yapılarını ve animasyonları tanımlar. Yapay zekâ tasarımlarını ucuz veya sıradan gösteren tüm yaygın varsayılanları engeller.',
    examplePrompt:
      'İncelikli tipografi, yumuşak kontrast, premium boşluk düzeni, ince derinlik ve ölçülü hareket içeren sakin, üst düzey bir açılış sayfası oluşturun.',
  },
  'sora': {
    description:
      'OpenAI\'nin Sora API\'si aracılığıyla kısa video klipleri oluşturun, yeniden düzenleyin ve yönetin. Sinematik çekimler, b-roll ve hızlı konsept video iterasyonu için kullanışlıdır.',
    examplePrompt:
      'OpenAI\'nin Sora API\'si aracılığıyla kısa video klipleri oluşturun, yeniden düzenleyin ve yönetin.',
  },
  'speech': {
    description:
      'OpenAI\'nin API\'sini ve yerleşik sesleri kullanarak metinden konuşma sesi oluşturun. Anlatımlı açıklayıcı videolar, ders sesleri ve hızlı seslendirme parçaları için kullanışlıdır.',
    examplePrompt:
      'OpenAI\'nin API\'sini ve yerleşik sesleri kullanarak metinden konuşma sesi oluşturun.',
  },
  'stitch-loop': {
    description:
      'İteratif tasarımdan koda geri bildirim döngüsü. Brief ile oluşturulan UI arasındaki görsel doğruluğu sıkılaştırmak için eleştir → ayarla → sun döngüsü.',
    examplePrompt:
      'İteratif tasarımdan koda geri bildirim döngüsü.',
  },
  'stitch-design-taste': {
    description:
      'Google Stitch için Anlamsal Tasarım Sistemi Skill\'i. Premium, sıradanlık karşıtı UI standartlarını dayatan, ajan dostu DESIGN.md dosyaları üretir — katı tipografi, kalibre edilmiş renk, asimetrik düzenler, sürekli mikro hareket ve donanım hızlandırmalı performans.',
    examplePrompt:
      'Bu ürün için premium, sıradanlık karşıtı UI standartları, tipografi, renk, düzen, hareket ve prompt rehberliği içeren ajan dostu bir DESIGN.md oluşturun.',
  },
  'swiftui-design': {
    description:
      'SwiftUI 前端设计 skill\'i — yapay zekâ baştan savmacılığına karşı kurallar, tasarım yönü danışmanı, marka varlığı protokolü ve beş boyutlu inceleme. Claude Code, Cursor, Codex ve OpenCode ile çalışır.',
    examplePrompt:
      'SwiftUI 前端设计 skill\'i — yapay zekâ baştan savmacılığına karşı kurallar, tasarım yönü danışmanı, marka varlığı protokolü ve beş boyutlu inceleme.',
  },
  'swiss-creative-mode-template': {
    description:
      'Tek dosyalık bir HTML artifaktında cesur editöryel\ntipografi, yüksek kontrastlı geometrik kartlar, etkileşimli slayt gezinme,\ntema değiştirme, hotspot bindirmeleri ve palet koreografisi içeren, İsviçre esinli yaratıcı mod sunum şablonu skill\'i. Kullanıcılar premium bir sunum tarzı açılış,\nİsviçre/brütalist deste görünümü veya zengin etkileşimli yaratıcı bir lansman sayfası istediğinde kullanın.',
    examplePrompt:
      'Tek dosyalık bir HTML artifaktında cesur editöryel tipografi, yüksek kontrastlı geometrik kartlar, etkileşimli slayt gezinme, tema değiştirme, hotspot bindirmeleri ve palet koreografisi içeren, İsviçre esinli yaratıcı mod sunum şablonu skill\'i.',
  },
  'swiss-user-research-video-template': {
    description:
      'Sıcak kâğıt editöryel estetiğinde İsviçre tarzı kullanıcı araştırması anlatım şablonu.\nKullanıcılar minimalist tipografi, yüksek netlikli düzen, ince hareket, halka grafik dökümleri\nve tek bir HTML dosyasında slaytlar arası klavye/tıklama gezinmesi içeren premium bir araştırma destesi veya hikâye odaklı canlı artifakt istediğinde kullanın.',
    examplePrompt:
      'Premium minimalist tipografi, sıcak kâğıt tonu, katılımcı halka grafiği dökümü ve ince editöryel etkileşimler içeren İsviçre tarzı bir kullanıcı araştırması sentez destesi oluşturun.',
  },
  'design-taste-frontend': {
    description:
      'Açılış sayfaları, portfolyolar ve yeniden tasarımlar için baştan savmacılık karşıtı frontend skill\'i. Ajan brief\'i okur, doğru tasarım yönünü çıkarır ve şablon gibi görünmeyen arayüzler sunar. Uygun olduğunda gerçek tasarım sistemleri, yeniden tasarımlarda önce denetim, katı uçuş öncesi kontrol.',
    examplePrompt:
      'design-taste-frontend yaklaşımını izleyen premium bir açılış sayfası oluşturun: tasarım okumasını çıkarın, ayarları belirleyin, yapay zekâ baştan savmacılığı kalıplarından kaçının ve cilalı, duyarlı bir HTML artifaktı çıkarın.',
  },
  'design-taste-frontend-v1': {
    description:
      'Tam davranışına bağımlı projeler için korunan orijinal v1 taste-skill\'i. Mevcut varsayılan, kapsamlı bir yeniden yazım olan `design-taste-frontend` (v2 deneysel) sürümüdür. Bu v1 kurulum adını yalnızca tam geriye dönük uyumluluğa ihtiyacınız varsa kullanın.',
    examplePrompt:
      'Güçlü tipografi, boşluk düzeni, hareket ve baştan savmacılık karşıtı koruma önlemleriyle design-taste-frontend-v1 kullanarak cilalı bir pazarlama sayfası oluşturun.',
  },
  'theme-factory': {
    description:
      'Slaytlar, dokümanlar, raporlar ve HTML açılış sayfaları dahil artifaktlara profesyonel font ve renk temaları uygulayın. 10 hazır temayla gelir.',
    examplePrompt:
      'Slaytlar, dokümanlar, raporlar ve HTML açılış sayfaları dahil artifaktlara profesyonel font ve renk temaları uygulayın.',
  },
  'threejs': {
    description:
      'Tarayıcıda 3D öğeler ve etkileşimli deneyimler oluşturmak için Three.js skill\'leri — sahneler, materyaller, kontroller ve son işleme.',
    examplePrompt:
      'Tarayıcıda 3D öğeler ve etkileşimli deneyimler oluşturmak için Three.js skill\'leri — sahneler, materyaller, kontroller ve son işleme.',
  },
  'ui-skills': {
    description:
      'Arayüz oluştururken ajanlara yön vermek için belirli bir görüşe dayalı, sürekli gelişen kısıtlamalar. Birçok küçük UI parçası genelinde tutarlı çıktı sağlamak için kullanışlıdır.',
    examplePrompt:
      'Arayüz oluştururken ajanlara yön vermek için belirli bir görüşe dayalı, sürekli gelişen kısıtlamalar.',
  },
  'ui-ux-pro-max': {
    description:
      'Yalnızca katalog UI/UX Pro Max girişi. Tam kaynak şablonlar, veriler ve arama iş akışı Open Design\'a dahil değildir.',
    examplePrompt:
      'Yalnızca katalog UI/UX Pro Max girişi.',
  },
  'venice-audio-music': {
    description:
      'Venice.ai üzerinden müzik üretimi kuyruğa alma, getirme ve tamamlama uç noktaları. Jingle\'lar, arka plan döngüleri ve prototip müziklendirme için uygundur.',
    examplePrompt:
      'Venice.ai üzerinden müzik üretimi kuyruğa alma, getirme ve tamamlama uç noktaları.',
  },
  'venice-audio-speech': {
    description:
      'Venice.ai üzerinden metinden sese modeller, sesler, formatlar ve akış. Anlatım, seslendirme ve konuşma ajanı sesleri için kullanışlıdır.',
    examplePrompt:
      'Venice.ai üzerinden metinden sese modeller, sesler, formatlar ve akış.',
  },
  'venice-image-edit': {
    description:
      'Venice.ai API üzerinden görüntü düzenleme, yükseltme ve arka plan kaldırma.',
    examplePrompt:
      'Venice.ai API üzerinden görüntü düzenleme, yükseltme ve arka plan kaldırma.',
  },
  'venice-image-generate': {
    description:
      'Venice.ai API üzerinden görüntü üretimi uç noktaları ve kullanılabilir stiller.',
    examplePrompt:
      'Venice.ai API üzerinden görüntü üretimi uç noktaları ve kullanılabilir stiller.',
  },
  'venice-video': {
    description:
      'Venice.ai API üzerinden video üretimi ve transkripsiyon iş akışları.',
    examplePrompt:
      'Venice.ai API üzerinden video üretimi ve transkripsiyon iş akışları.',
  },
  'vfx-text-cursor': {
    description:
      'Video girişlerinde kelime kelime alıntı açılışları için imleç ışık izi, kromatik ışınlar ve yönlü parlamalar.',
    examplePrompt:
      'İçeriğimi imleç ışık izleri, kromatik ışınlar ve yönlü parlamalarla bir video girişi alıntı açılışına dönüştürmek için VFX Text Cursor şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'video-downloader': {
    description:
      'Çeşitli format ve kalite seçeneklerini destekleyerek çevrimdışı izleme, düzenleme veya arşivleme için YouTube ve diğer platformlardan video indirin.',
    examplePrompt:
      'Çeşitli format ve kalite seçeneklerini destekleyerek çevrimdışı izleme, düzenleme veya arşivleme için YouTube ve diğer platformlardan video indirin.',
  },
  'video-hyperframes': {
    description:
      'Otomatik oynatma destekli Hyperframes / Remotion uyumlu sürekli kare animasyonu.',
    examplePrompt:
      'İçeriğimi otomatik oynatma destekli, Hyperframes / Remotion uyumlu sürekli kare animasyonuna dönüştürmek için Hyperframes Video şablonunu kullan. Şablonun görsel imzasını koru, gerçek içerik ve veri kullan, lorem ipsum veya yer tutucu görsellerden kaçın.',
  },
  'web-artifacts-builder': {
    description:
      'React ve Tailwind ile karmaşık claude.ai HTML yapıtları oluşturun. Anthropic\'in zengin, gömülebilir yapıtlar yayınlamak için referans iş akışı.',
    examplePrompt:
      'React ve Tailwind ile karmaşık claude.ai HTML yapıtları oluşturun.',
  },
  'web-design-guidelines': {
    description:
      'Vercel mühendislik ekibi tarafından hazırlanan web tasarım yönergeleri ve standartları. Ürün UI\'ı için düzen, tipografi, renk, hareket ve erişilebilirliği kapsar.',
    examplePrompt:
      'Vercel mühendislik ekibi tarafından hazırlanan web tasarım yönergeleri ve standartları.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Dikey yıllık okuma raporları, kişisel okuma panoları, kitap notu özetleri ve\npaylaşılabilir yıl değerlendirmesi hikayeleri için WeRead\'den ilham alan HyperFrames\nvideo şablonu. Kullanıcılar sıcak kağıt dokusu, editöryel Çince tipografi, kitap\nsayfası metaforları, veri vurguları ve deterministik hareket içeren 9:16 HTML-to-MP4\nokuma raporu istediğinde kullanın.',
    examplePrompt:
      '12 sahneli, sıcak kağıt dokusu, kitap sayfası geçişleri, okuma istatistikleri, notlar, anahtar kelimeler ve son bir okuma kişiliği kartı içeren WeRead tarzı 9:16 HyperFrames yıllık okuma raporu videosu oluşturun.',
  },
  'wpds': {
    description:
      'WordPress Tasarım Sistemi. WordPress\'in resmi tasarım belirteçlerini, tipografisini ve bileşen kalıplarını temalara ve sitelere uygulayın.',
    examplePrompt:
      'WordPress Tasarım Sistemi.',
  },
  'youtube-clipper': {
    description:
      'Otomatik iş akışlarıyla YouTube klibi üretimi ve düzenleme — kaynak videoyu çekin, öne çıkanları kesin, altyazı ekleyin ve dışa aktarın.',
    examplePrompt:
      'Otomatik iş akışlarıyla YouTube klibi üretimi ve düzenleme — kaynak videoyu çekin, öne çıkanları kesin, altyazı ekleyin ve dışa aktarın.',
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
  'Editorial & Print': 'Editöryel ve Baskı',
  'Editorial / Personal / Publication': 'Editöryel / Kişisel / Yayın',
  'Editorial · Studio': 'Editöryel · Stüdyo',
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
  'action': 'aksiyon',
  'ancient-china': 'antik-çin',
  'anime': 'anime',
  'app-showcase': 'uygulama-vitrini',
  'archery': 'okçuluk',
  'arpg': 'arpg',
  'audio-reactive': 'sese-tepkili',
  'boss-fight': 'boss-savaşı',
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
  'infographic': 'infografik',
  'iphone': 'iphone',
  'japanese': 'japon',
  'karaoke': 'karaoke',
  'key-visual': 'anahtar görsel',
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
  'open-world': 'açık dünya',
  'otaku-dance': 'otaku dansı',
  'outro': 'kapanış',
  'overlay': 'katman',
  'particles': 'parçacıklar',
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
  'sequence': 'dizi',
  'shader': 'shader',
  'shatter': 'parçalanma',
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
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const TR_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: '3B Taş Merdiven Evrim İnfografiği',
    summary:
      'Düz bir evrimsel zaman çizelgesini, ayrıntılı organizma render\'ları ve yapılandırılmış yan panellerle gerçekçi bir 3B taş merdiven infografiğine dönüştürür.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Anime Dövüş Sanatları Savaş İllüstrasyonu',
    summary:
      'Geleneksel bir dojoda elemental enerji efektleriyle dövüşen iki kadın karakterin dinamik, yüksek etkili bir anime illüstrasyonunu oluşturur.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'E-ticaret Canlı Yayın Arayüzü Maketi',
    summary:
      'Bir portrenin üzerine yerleştirilen, özelleştirilebilir sohbet mesajları, hediye açılır pencereleri ve ürün satın alma kartı içeren gerçekçi bir sosyal medya canlı yayın arayüzü oluşturur.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Oyun Ekran Görüntüsü - Anime Dövüş Oyunu: Captain Ryuuga vs Kaze Renshin',
    summary:
      'Street Fighter 6 veya Tekken 8 giriş sanatı tarzında oyun içi bir dövüş oyunu ana görseli / dövüş ekran görüntüsü. İki anime tarzı erkek savaşçı, dramatik bir gece Çin tapınağı avlusunun ortasında karşı karşıya gelir — solda sıcak turuncu-kırmızı ateş aurası olan üstü çıplak hasır şapkalı bir korsan, sağda turuncu bir gi giymiş, devasa çatırdayan mavi bir şimşek enerji küresi toplayan dikenli saçlı bir dövüş sanatçısı. Eksiksiz bir dövüş oyunu HUD\'u ile birlikte gelir (çift can çubuğu, raunt sayacı, isimli dövüşçüler ve amblemlerle P1/P2 portre panelleri, taraf başına kombo sayaçları ve maksimum göstergeler). Sıcak turuncu ile soğuk mavi ayrımlı renk derecelendirmesi, türün rakip-dövüşçü geleneğiyle uyumludur. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Guan Yu Yan Liang\'ı Öldürürken',
    summary:
      'Guan Yu\'nun Kızıl Tavşan savaş atına binerek sağanak yağmurlu bir savaş alanından geçip düşman generali Yan Liang\'a doğru saldırdığı ikonik Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, Unreal Engine 5 ile, atlı kahramanın arka-sol tarafından takip eden üçüncü şahıs kamerasıyla render edilmiştir. Eksiksiz boss-savaşı HUD\'u (portre, yoğun düşman noktalarıyla mini harita, bitirici hamle istemiyle yetenek çubuğu, düşman generalin üzerinde yüzen boss HP çubuğu) sahneyi bir AAA ARPG dövüş anına dönüştürür. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Lü Bu\'nun Yuanmen Okçuluğu',
    summary:
      'Lü Bu\'nun bir savaşı durdurmak için kamp kapısındaki uzaktaki bir helebardı vurarak düşürdüğü ünlü Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, Unreal Engine 5 Nanite/Lumen ile, üçüncü şahıs omuz üstü oynanış kamerasıyla render edilmiştir. Eksiksiz oyun içi HUD katmanı (HP + qi çubukları, mini harita, yetenek çubuğu, uzaktaki helebarda mesafe okumalı hedef kilitleme işaretçisi) sahneyi bir ara sahneden ziyade gerçek bir yeni nesil ARPG yakalaması gibi gösterir. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Oyun Ekran Görüntüsü - Üç Krallık ARPG: Zhao Yun\'un Changbanpo\'daki Kucakta Kaçışı',
    summary:
      'Zhao Yun\'un bir kolunda bebek Liu Chan\'ı kucaklarken diğer kolundaki bir mızrakla Changbanpo\'da düşman saflarından savaşarak geçtiği efsanevi Üç Krallık sahnesinin oyun içi bir aksiyon-RPG ekran görüntüsü. Black Myth: Wukong\'un sinematik foto-gerçekçi tarzının Elden Ring ile birleştiği, tam Nanite, Lumen ışın izleme ve hacimsel tanrı ışınlarıyla Unreal Engine 5\'te render edilmiştir. Duygusal çekirdek — bir kol kundaklanmış bebeği korurken, diğer kol hayatta kalmak için savaşırken — bebek için özel bir ESKORT koruma çubuğu, bir kombo sayacı ve savrulan düşmanların üzerinde havada beliren hasar-sayısı açılır göstergeleri içeren eksiksiz bir HUD katmanıyla pekiştirilir. 16:9 oranında gpt-image-2 için ayarlanmıştır.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Oyun Arayüzü - Antik Çin Açık Dünya MMO HUD\'u',
    summary:
      'Black Myth: Wukong\'un sinematik foto-gerçekçi tarzında, bir AAA antik-Çin açık dünya MMO\'su için oyun içi HUD ekran görüntüsü maketi oluşturur. Güzel bir kadın kılıç ustası baş karakter, sisli bir dağ antik-tapınak sahnesinde karenin merkezini sabitler ve eksiksiz bir MMO HUD\'u ile çevrilidir: sol üstte HP/MP/dayanıklılık çubukları ve buff simgeleriyle karakter portresi, alt ortada Çin hat sanatı yetenek simgeleriyle yetenek çubuğu, sağ üstte görev işaretçileriyle mini harita, sağ tarafta görev takip paneli, sol altta kayan sohbet penceresi, dünya uzayında yüzen NPC isim levhaları ve görev ünlem işareti. Gerçekçi bir monitör ekran görüntüsü olarak, 16:9 oranında render edilmiştir; sunum desteleri, gamescom tarzı ana görseller ve Xiaohongshu/bilibili oyun tanıtımları için uygundur.',
  },
  'illustrated-city-food-map': {
    title: 'İllüstre Şehir Yemek Haritası',
    summary:
      'Numaralandırılmış yerel yemek özelliklerini, simgesel yapıları ve bir açıklama bölümünü içeren el çizimi, suluboya tarzında bir turist haritası oluşturur.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'İllüstrasyon - Pastel Boya Çocuk Çizimi Yeniden Düzenlemesi',
    summary:
      'Herhangi bir referans görseli (ürün fotoğrafı, ekran görüntüsü, portre, UI taslağı) 10 yaşında bir çocuğun yaptığı izlenimi veren, el çizimi pastel boya illüstrasyonuna dönüştüren bir stil aktarımı promptu. Orijinal paleti temiz beyaz kağıt üzerinde parlak ve eğlenceli pastel boya renkleriyle değiştirir ve masum masal kitabı havasını güçlendirmek için çocuksu hayaller serpiştirir — şatolar, şekerler, yıldızlar, bulutlar, gökkuşakları. GPT-image-2\'de görselden görsele düzenleme olarak çalışır (promptun yanında bir referans görsel yüklemeyi gerektirir); web sitesi ekran görüntüleri, marka ana görselleri, ürün fotoğrafları ve portreler için çok uygundur.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'İnfografik - Otaku Dansı Koreografi Dökümü (Gokuraku Jodo, 16 Panel)',
    summary:
      '16 bağlı kare panelden oluşan 4×4 ızgara olarak düzenlenmiş tek bir dikey 2:3 poster; ünlü Japon otaku dans şarkısı 極楽浄土 (Gokuraku Jodo) için eksiksiz bir koreografi döküm tablosu oluşturur. Her panel, aynı sevimli yarı gerçekçi anime idol kızını (pembe çift kuyruk, denizci yakalı okul-idol üniforması) dansın imza pozlarından birini tam boy sergilerken, pastel-pembe bir arka planda, altta küçük bir Japonca altyazı şeridi ve sol üstte numaralı bir daireyle gösterir. Açıkça AI video üretimi için bir POZ REFERANSI sayfası olarak tasarlanmıştır — her siluet net ve belirsizlikten uzaktır, hareket çizgisi veya arka plan karmaşası yoktur. gpt-image-2 için ayarlanmıştır, en boy 2:3. Kategori: İnfografik.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Hibrit Tarzda Momotaro Açıklama Slaytı',
    summary:
      'Irasutoya illüstrasyonlarının sade ve sıcak estetiğini, Japon hükümeti slaytlarına özgü yüksek bilgi yoğunluğuyla birleştiren bir prompt.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Notion Tarzı Takım Panosu (Canlı Artifact)',
    summary:
      'Tek ekranlı, Notion\'a özgü takım panosu taslağı — KPI ızgarası, 7 günlük sparkline grafiği, etkinlik akışı ve bağlı veritabanlı görev tablosu. Canlı artifact becerisinin görsel tamamlayıcısıdır; yenilenebilir / bağlayıcı destekli çalıştırmalar için onunla birlikte kullanın veya durağan bir taslak olarak tek başına kullanın.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / Avatar - Anime Kızdan Sinematik Fotoğrafa',
    summary:
      'Bu prompt, bir karakter referans illüstrasyonunu; orijinal kıyafeti, pozu ve kediyi koruyarak gerçekçi, sıcak tonlu, vintage iç mekan portresine dönüştürür.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / Avatar - Günlük Moda Izgara Fotoğraf Çekimi',
    summary:
      'Ayrıntılı özne ve aydınlatma parametreleriyle günlük bir moda fotoğraf çekiminin 4 fotoğraflık kolajı için yapılandırılmış bir JSON promptu.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / Avatar - Akbabalı Sinematik Güney Asyalı Erkek Portresi',
    summary:
      'Akbabalar ve kuzgunlarla çevrili, kasvetli, karanlık bir fantezi ortamında genç bir Güney Asyalı erkeğin ayrıntılı sinematik portresi.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / Avatar - Neon Yüz Yazılı Cyberpunk Anime Portresi',
    summary:
      'Posterler, sosyal medya sanatı veya fütüristik marka görselleri için neon dolu, şık bir anime portresi.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / Avatar - Mor Bahçede Zarif Fantezi Kızı',
    summary:
      'Bu prompt; parlak şekillendirilmiş saçları, süslü mor-siyah kıyafetleri ve çiçeklerle dolu büyülü bir bahçe ortamı olan zarif bir kadının, karakter için ideal, cilalı anime tarzı fantezi portresini üretir',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / Avatar - Ruhani Mavi Saçlı Fantezi Portresi',
    summary:
      'Bu prompt; akışkan saçlar ve düşsel bir bahar atmosferiyle zarif dikey ana görseller veya karakter illüstrasyonları oluşturmak için ideal, yumuşak ve ışıltılı bir anime tarzı fantezi karakter portresi üretir.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / Avatar - Siyahlar İçinde Göz Alıcı Kadın Portresi',
    summary:
      'Bu prompt; moda editöryeli veya güzellik görselleri için ideal, derin dekolteli siyah bir kıyafet giymiş zarif bir kadının foto-gerçekçi lüks tarzı portresini üretir.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / Avatar - Hiper-Gerçekçi Selfie Doku Promptları',
    summary:
      'Görünür gözenekler ve doğal aydınlatmaya odaklanarak gerçekçi cilt dokuları ve özgün telefon selfie kadrajı üretmek için ayrıntılı prompt parçacıkları.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / Avatar - Lavanta Fantezi Büyücü Portresi',
    summary:
      'Bu prompt; parlak sarı saçları, mor çiçekleri ve süslü kristal kıyafetiyle zarif bir büyücü prensesin, karakter sanatı veya büyülü illüstrasyonlar için ideal, cilalı anime tarzı fantezi portresini üretir',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / Avatar - Monokrom Stüdyo Portresi',
    summary:
      'Belirgin bir bölünmüş arka plan ve dramatik stüdyo aydınlatmasıyla monokrom bir portre için üst düzey ticari fotoğrafçılık promptu.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / Avatar - Eski Fotoğraftan DSLR Portresine Restorasyon',
    summary:
      'Bu prompt; fotoğraf onarımı ve iyileştirme için hasarlı, vintage 4 kişilik bir aile fotoğrafını temiz, renklendirilmiş, yüksek çözünürlüklü, gerçekçi bir portreye dönüştürür.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / Avatar - Bahçede Şiirsel Kadın Portresi',
    summary:
      'Bu prompt; güneşli bir bahçede kitap düşkünü genç bir kadının, yaşam tarzı fotoğrafçılığı, edebi markalaşma veya zarif karakter görselleri için ideal, gerçekçi editöryel tarzda portresini üretir.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / Avatar - Profesyonel Kimlik Portre Duvar Kağıdı',
    summary:
      'Kariyerle ilgili etkinlikler ve tipografi eşliğinde profesyonel kıyafet giymiş bir özneyi konu alan yüksek çözünürlüklü, premium bir duvar kağıdı üretir.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / Avatar - Gerçekçi Şekilde Kusurlu AI Selfie',
    summary:
      'Tesadüfi, düşük kaliteli bir akıllı telefon enstantanesi gibi görünen \'başarısız\' bir selfie üretmek için GPT Image 2 ile kullanılan yaratıcı bir prompt.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / Avatar - Shikishi Üzerinde İmzalı Marker Portresi',
    summary:
      'Bu, kare bir shikishi tahtası üzerinde canlı, imzalı marker tarzı bir portre üretir; hayran sanatı imzaları, anma illüstrasyonu paylaşımları ve kişiselleştirilmiş teşekkür görselleri için kullanışlıdır.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / Avatar - Kar Tavşanı İmparatoriçe Portresi',
    summary:
      'Karlı bir dağ tapınağı ortamında duran, süslü kış hanfusu giymiş, tavşan temalı görkemli bir kadın üretmek için gerçekçi bir fantezi portre promptu.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / Avatar - Kar Tavşanı Maskeli Hanfu Portresi',
    summary:
      'Bu istem, tavşan temalı beyaz bir Hanfu giymiş maskeli bir kadının sinematik bir kış fantezi portresini oluşturur; zarif karakter sanatı ve atmosferik AI vitrin görselleri için idealdir.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / Avatar - Karlı Tavşan Hanfu Portresi',
    summary:
      'Bu istem, işlemeli hanfu giymiş tavşan kulaklı bir kadının ultra ayrıntılı bir fantezi güzellik portresini oluşturur; zarif karakter sanatı, kostüm tasarımı veya sinematik AI portre vitrinleri için idealdir.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / Avatar - Karlı Tavşan Ruhu Portresi',
    summary:
      'Bu istem, kışın tavşan kulaklı isimsiz bir kadının sakin bir fantezi portresini oluşturur; atmosferik karakter sanatı ve stilize profil illüstrasyonları için idealdir.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / Avatar - Song Hanedanı Hanfu Portresi',
    summary:
      'Antik bir avluda Song Hanedanı geleneksel Hanfu\'su giymiş bir güzelin ayrıntılı ve gerçekçi bir portresini oluşturmak için optimize edilmiş bir istem.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Sosyal Medya Gönderisi - Anime Pokémon Mağaza Kıyafeti Tanıtım Posteri',
    summary:
      'Bu istem, bir Pokémon mağazasında mavi elbiseli, yüzü bulanık bir kızı konu alan yumuşak pastel bir anime moda duyuru posteri oluşturur; kıyafet tanıtım fragmanları ve karakter promosyon görselleri için idealdir.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Sosyal Medya Gönderisi - Sinematik Asansör Sahnesi',
    summary:
      'Gerçekçi aydınlatma ve yansımalarla metalik bir asansörün içindeki bir kadının atmosferik, sinematik bir sahnesini oluşturmak için bir istem.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Sosyal Medya Gönderisi - Pastel Masada Şaşkın Elf Kız',
    summary:
      'Bu istem, rahat ve sevimli bir çalışma alanında bilgisayarında yazı yazan bir elf kızının yumuşak pastel bir anime illüstrasyonunu oluşturur; sosyal gönderiler, duvar kâğıtları veya yayıncı temalı sanat için idealdir.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Sosyal Medya Gönderisi - Editöryel Moda Fotoğrafçılığı',
    summary:
      'Yumuşak aydınlatma ve sıcak tonlara sahip minimalist bir stüdyo sahnesi için atmosferik, modaya odaklı bir istem.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Sosyal Medya Gönderisi - Moda Editöryel Kolaj',
    summary:
      'Moda editöryel çekimleri için son derece ayrıntılı bir 2x2 fotoğraf kolajı istemi; tutarlı stil, belirli aydınlatma ve referans fotoğraftan alınan yüz hatlarına odaklanır.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Sosyal Medya Gönderisi - PSG Transfer Duyuru Posteri',
    summary:
      'Bir oyuncunun Paris Saint-Germain\'e transferini sosyal medyada veya spor promosyon görsellerinde duyurmak için cesur, profesyonel bir futbol imza posteri.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Sosyal Medya Gönderisi - Sansasyonel Kız Dans Storyboard\'u (8 Kare)',
    summary:
      'Şık bir karakterin tutarlı, kare kare bir dans sekansını oluşturmak için tam bir 8 kareli storyboard istem seti. Ortak global stil token\'ları, yeniden kullanılabilir bir negatif istem ve kare başına sekiz istem (açılış pozu, kalça ritmi, vücut dalgası, beat-drop bel bükmesi, yan kalça sallanışı, saç savurma, güç duruşu, bitiriş pozu) içerir. GPT-Image-2 seviyesindeki modeller için ayarlanmıştır: özlü kelime dağarcığı, hassas ifade yok, kareler arasında tutarlı çerçeveleme ve aydınlatma dili sayesinde kareler tek bir kesintisiz koreografi gibi hissettirir.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Sosyal Medya Gönderisi - Showa Günü Retro Kültür Dergi Kapağı',
    summary:
      'Anime karakter sanatını, nostaljik Showa dönemi sokak görsellerini ve dergi tarzı bilgilendirici düzeni birleştiren, mevsimsel kültürel promosyonlar için sıcak, editöryel tarzda bir Japon tatil sayfası.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Sosyal Medya Gönderisi - Sosyal Medya Moda Kıyafeti Oluşturma',
    summary:
      'Bir karakter profiline dayalı olarak, ürün etiketleri ve fiyatlarıyla birlikte bir haftalık moda blogcusu tarzı kıyafet önerileri oluşturmak için bir istem.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Sosyal Medya Gönderisi - Seyahat Anlık Görüntü Kolajı İstemi',
    summary:
      'Yalnız bir yolculuğu tasvir eden, akıllı telefon tarzı seyahat fotoğraflarından oluşan nostaljik, 12 kareli bir kolaj oluşturmak için ayrıntılı bir istem.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Sosyal Medya Gönderisi - Vintage Tabela Ressamı Eskizi',
    summary:
      'Grafit çizgileri ve mürekkep yayılması gibi gerçekçi ayrıntılarla kâğıt üzerine elle çizilmiş bir keçeli kalem eskizi oluşturur; vintage yazı stilleri için mükemmeldir.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'VR Başlığı Patlamış Görünüm Posteri',
    summary:
      'Ayrıntılı bileşen açıklamaları ve promosyon metniyle bir VR başlığının yüksek teknolojili patlamış görünüm diyagramını oluşturur.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Lego İnşa Eden 3D Animasyon Çocuk',
    summary:
      'Bir odada Lego parçalarını dikkatlice birleştiren bir çocuğu anlatan, hızlandırılmış çekim efektleri içeren, 3D animasyon tarzında çok çekimli bir video istemi.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'On Yıllık Gelişimle Görkemli Dönüşüm',
    summary:
      'Seedance 2.0 için, bir adamın 2016\'daki rahat bir ortamdan 2026\'da lüks bir Dubai yaşam tarzına geçişini karakter tutarlılığını koruyarak gösteren bir dönüşüm istemi.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Antik Koruyucu Ejderha Kurtarışı',
    summary:
      'Yağmurlu bir köyde beliren bir ejderha tarafından kurtarılan bir kız hakkındaki bir hikaye için, VFX ve atmosferik sese odaklanan ayrıntılı, çok çekimli sinematik bir istem.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Antik Hint Krallığı FPV Videosu',
    summary:
      'Tapınaklar ve ormanlarla dolu mistik bir Hint krallığını tasvir eden, hızlı tempolu FPV drone tarzı sinematik bir istem.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Animasyon aktarımı ve kamera takibi istemi',
    summary:
      'Seedance 2.0 için, sabit kamera takibini korurken bir karaktere belirli bir hareket referansı uygulayan teknik bir prompt.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Ritimle Senkronize Kıyafet Dönüşümü Dansı',
    summary:
      'Seedance 2.0 için, ritimle senkronize bir kıyafet değişimi gerçekleştirirken breakdown karelerini takip eden bir karakter dansını koordine eden bir prompt.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Karakter Tanıtım Motion Graphics Dizisi',
    summary:
      'Seedance 2.0 modeli için tasarlanmış, belirli UI katmanları ve geçişlerle bir karakter ekibini tanıtan karmaşık, çok aşamalı bir motion graphics prompt\'u.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Sinematik Doğum Günü Kutlaması Dizisi',
    summary:
      'Karakter tutarlılığına ve duygusal hikâye anlatımına odaklanan, doğum günü dizisi için son derece ayrıntılı, çok çekimli bir video prompt\'u.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Sinematik Ejderha Etkileşimi ve Uçuşu',
    summary:
      'Bir kadının bir ejderhayla duygusal etkileşimini ve ardından sinematik bir uçuş dizisini konu alan bir video için ayrıntılı, storyboard tarzı bir prompt.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Sinematik Doğu Asyalı Kadın El Dansı',
    summary:
      'Stilize bir el dansı için, kamera hareketi ve karakter aksiyonları için zaman kodlu talimatlar içeren, son derece ayrıntılı, çok çekimli sinematik bir video prompt\'u.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Sinematik Duygusal Yüz Yakın Çekimi',
    summary:
      'Gerçekçi cilt dokularına ve bir dizi karmaşık duygusal yüz geçişine odaklanan, Seedance 2.0 için son derece ayrıntılı teknik bir prompt.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Sinematik Deniz Biyoloğu Keşfi',
    summary:
      'Bir mercan resifinde antik bir gemi enkazını keşfeden bir deniz biyoloğunu konu alan su altı sahnesi için ayrıntılı sinematik bir video prompt\'u.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Sinematik Müzik Podcast\'i ve Gitar Tekniği',
    summary:
      'Gitar tekniği, pinch harmonikler ve stüdyo estetiğine özel olarak odaklanan, 4K müzik podcast videosu üretmek için gelişmiş sinematik bir prompt.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Sinematik Rota Navigasyon Rehberi',
    summary:
      'Seedance için tasarlanmış, tekrar eden bir tur rehberi karakteri ve gerçek dünya konumları arasında akıcı geçişler içeren tutarlı bir yürüme navigasyonu videosu oluşturan, yapılandırılmış çok sahneli bir prompt.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Seedance 2 için Sinematik Sokak Yarışı Dizisi',
    summary:
      'Seedance 2 için tasarlanmış, geceleyin sinematik bir sokak yarışı dizisi üretmeye yönelik; yoğun sürücü odaklanmasına, dinamik kamera çalışmasına ve patlayıcı hızlanmaya odaklanan ayrıntılı, çok çekimli bir prompt, yapı',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Sinematik vampir ara sokak dövüş dizisi',
    summary:
      'Neon ışıklı bir ara sokakta dinamik kamera hareketleri ve yüksek hızlı dövüş içeren bir kısa film sahnesi için kapsamlı bir aksiyon prompt\'u.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Crimson Horizon Bilim Kurgu Sinematik Dizisi',
    summary:
      '\'Crimson Horizon\' adlı bir bilim kurgu filmi için, bir roket fırlatmasından Mars\'taki ürkütücü bir uzaylı karşılaşmasına kadar her şeyi ayrıntılandıran kapsamlı, 9 çekimlik sinematik bir video dizisi.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Cyberpunk Oyun Fragmanı Senaryosu',
    summary:
      'Bir cyberpunk oyun fragmanı için, karakter tasarımını, UI animasyonlarını ve beyaz bir boşluktan bir favelaya çevresel geçişleri ayrıntılandıran kapsamlı bir video üretim prompt\'u.',
  },
  'forbidden-city-cat-satire': {
    title: 'Yasak Şehir Kedi Hicvi',
    summary:
      'Seedance 2.0 için, hicivli bir Qing hanedanı ortamında turuncu bir kedi memuru ve bir sırtlan imparatoru konu alan karmaşık bir kara komedi prompt\'u.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Hollywood Haute Couture Fantezi Video Prompt\'u',
    summary:
      'Seedance 2.0 için, bir Hollywood Haute Couture Fantezi filmi oluşturmaya yönelik tasarlanmış ayrıntılı, çok sahneli bir video üretim prompt\'u. Prompt; stili, çözünürlüğü (8K), render motorunu (Unreal Engin) belirtir',
  },
  'hunched-character-animation': {
    title: 'Kambur Karakter Animasyonu',
    summary:
      'Seedance 2 için belirli bir karakter referansına yönelik yerinde yürüme animasyonu oluşturma talimatı.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: 3D iPhone + MacBook Ürün Tanıtımı',
    summary:
      'Gerçek bir GLTF iPhone 15 Pro Max ve MacBook Pro\'nun temiz bir sahnede süzüldüğü, ekranlarında gerçek uygulama UI\'ının drawElementImage aracılığıyla canlı render edildiği 15 saniyelik bir ürün tanıtımı. Şekil değiştiren cam lens parlaması + 360° döner platform. vfx-iphone-device katalog bloğu üzerine inşa edildi.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: Sinematik Metin İmleç Açılışı',
    summary:
      'Siyah bir sahnede imleç parıltısı, kromatik gölge ışınları ve yönlü aydınlatma içeren 8 saniyelik dramatik bir metin açılışı. Canlı shader son işleme altında gerçek DOM tipografisi. vfx-text-cursor katalog bloğu üzerine inşa edildi.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: Cam Kırılma Kapanışı',
    summary:
      '12 saniyelik bir HTML kırılma kapanışı — gerçek bir ürün sayfası veya fiyatlandırma kartı bir an sabit kalır, ardından derinlik bulanıklığı ve kromatik dağılımla birlikte kırılan cam parçalarına patlar. vfx-shatter katalog bloğu üzerine inşa edildi. Daha uzun bir kompozisyondan sonra bir kapanış kartı olarak eşleşir.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: Sıvı Arka Plan Hero',
    summary:
      'Organik bir sıvı yüzeyin üzerinde süzülen HTML içerikli 12 saniyelik bir hero — köşe noktaları yer değiştirmiş bölünmüş düzlem, gerçek zamanlı dalga dinamikleri, yakalanan DOM net ve okunabilir biçimde üstte yer alır. vfx-liquid-background katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Liquid Glass Landing Açılışı',
    summary:
      'Gerçek bir ürün açılış sayfasının 20 saniyelik voronoi liquid-glass açılışı — DOM, drawElementImage ile canlı olarak yakalanır, kırılan cam hücrelerine parçalanır ve ardından temiz bir hero görüntüsüne oturur. vfx-liquid-glass katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Manyetik Alan Görselleştirmesi',
    summary:
      'Canlı bir DOM ısı haritasına veya grafiğe tepki veren 15 saniyelik manyetik alan parçacık görselleştirmesi — parçacıklar yakalanan HTML\'in etrafında bükülen alan çizgilerini izler; ML/veri ürünleri için idealdir. vfx-magnetic katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Portal Açılışlı Gösterge Paneli',
    summary:
      '10 saniyelik boyutsal bir portal, canlı bir veri gösterge paneline açılır — DOM gerçek zamanlı olarak yakalanır, hacimsel ışık taşması, portal kenarı parçacıkları. vfx-portal katalog bloğu üzerine kurulmuştur. Keynote tarzı veri hero görüntüleri için tasarlanmıştır.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: $0 → $10K Para Sayacı Hype (9:16)',
    summary:
      '6 saniyelik dikey 1080×1920 HyperFrames hype klibi — yeşil flaş, para patlaması parçacıkları, banknot destesi ikonu ve vurucu başlıkla Apple tarzı $0 → $10,000 sayacı. HyperFrames `apple-money-count` katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: 12 Saniyelik Uygulama Vitrini — Süzülen Üç Telefon',
    summary:
      '12 saniyelik 16:9 uygulama vitrini kompozisyonu — üç süzülen iPhone ekranı 3B uzayda asılı durur, her biri sırayla dönerek farklı bir özelliği öne çıkarır, ritimle senkronize etiket çağrıları, kapanışta logo kilitlemesi. Doğrudan HyperFrames `app-showcase` katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: 30 Saniyelik Marka Tanıtım Klibi',
    summary:
      '30 saniyelik 16:9 HyperFrames tanıtım klibi — hızlı kesmeler, ritimle senkronize kinetik tipografi, gösterilen kelimelerde sese tepkili ölçeklendirme, beş sahne arasında shader geçişleri, logo parlamasıyla kapanış kartı. Öğrenci kitindeki aisoc-hype arketipi örnek alınmıştır.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: 30 Saniyelik SaaS Ürün Tanıtımı (Linear tarzı)',
    summary:
      'Linear/ClickUp tarzı ürün filmleri örnek alınarak hazırlanmış 30 saniyelik HyperFrames kompozisyonu — UI 3B açılışları, ritimle senkronize kinetik tipografi, animasyonlu UI ekran görüntüleri, logo kapanışlı son kart. HF katalog bloklarından (ui-3d-reveal, app-showcase, logo-outro) ve sahneler arası shader geçişlerinden oluşturulmuştur.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: 4 Saniyelik Sinematik Logo Kapanışı',
    summary:
      '4 saniyelik 16:9 logo kapanışı — parça parça birleşen kelime markası ile parlama, son kilitleme üzerinde ışıltı taraması, yumuşak grain kaplaması, tek satırlık CTA. HyperFrames `logo-outro`, `shimmer-sweep` ve `grain-overlay` blokları üzerine kurulmuştur.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: 5 Saniyelik Minimal Ürün Açılışı',
    summary:
      'Üst düzey bir ürün açılışı için 5 saniyelik HyperFrames kompozisyonu — koyu kanvas, tek sıcak vurgu rengi, yavaş yakınlaşan başlık kartı, kinetik vurucu satır, ölçülü hareket. Ajan, HTML+GSAP\'ten puppeteer aracılığıyla MP4 oluşturur; stok görüntüye gerek yoktur.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: 9:16 Sosyal Yerleşim Yığını (X · Reddit · Spotify · Instagram)',
    summary:
      'Bir yüz-kamera döngüsünün üzerine dört animasyonlu sosyal kart yığan 15 saniyelik dikey 1080×1920 HyperFrames kompozisyonu — bir X gönderisi, bir Reddit tepkisi, bir Spotify şu an çalıyor kartı ve sonunda bir Instagram takip CTA\'sı. Her kart bir HyperFrames katalog bloğudur; asıl değer, koreografidedir.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: 9:16 Karaoke Altyazılı TikTok Konuşan Kafa',
    summary:
      'Dikey 1080×1920 HyperFrames kısa videosu — yüz-kamera döngüsü üzerinde TTS seslendirmeli konuşan kafa, karaoke tarzı kelimelerle senkronize altyazılar, animasyonlu alt şerit ve sonunda bir tiktok-takip yerleşimi. HyperFrames öğrenci kitindeki may-shorts-19 arketipini yansıtır.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Animasyonlu Çubuk Grafik Yarışı (NYT tarzı)',
    summary:
      '12 saniyelik 16:9 veri infografiği — kademeli kategori açılışlı animasyonlu çubuk + çizgi grafik, NYT tarzı serif başlık, dipnot kaynağı, kinetik değer etiketleri. Doğrudan HyperFrames `data-chart` katalog bloğu üzerine kurulmuştur.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Apple Tarzı Uçuş Haritası (Kalkış → Varış)',
    summary:
      '8 saniyelik 16:9 sinematik uçuş rotası haritası — gerçekçi arazi yakınlaşması, eğri bir yol boyunca kalkıştan varışa süzülen animasyonlu uçak, etiketli şehirler, kinetik mesafe sayacı. Doğrudan HyperFrames `nyc-paris-flight` katalog bloğu üzerine kurulmuştur, herhangi bir şehir çifti için yeniden kullanılabilir.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Web Sitesinden Videoya Hattı (15 Saniyelik Pazarlama Kesimi)',
    summary:
      'Canlı bir web sitesini üç farklı görünüm penceresi boyutunda yakalayan ve ardından sahneler arasında kromatik radyal bölünmeyle bunlar arasında animasyon yapan 15 saniyelik 16:9 HyperFrames kompozisyonu. Sitenin kaynak varlık olduğu hyperframes-sizzle öğrenci kiti arketipini yansıtır.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Canlı Çekim Anime Uyarlaması: Su ve Yıldırım Nefesi Düellosu',
    summary:
      '\'Su Nefesi\' (mavi su ejderhası) ile \'Yıldırım Nefesi\'ni (altın şimşek) karşı karşıya getiren, anime tarzı bir düellonun canlı çekim uyarlamasını oluşturmak için son derece ayrıntılı, 15 saniyelik bir istem. P',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Lüks Süper Otomobil Sinematik Anlatısı',
    summary:
      'Şık bir adam, Dobermanlar ve sisli bir dağ ortamında klasik bir süper otomobili içeren, Seedance 2.0 için son derece ayrıntılı çok çekimli sinematik istem.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Sihirli Akademi Storyboard Dizisi',
    summary:
      'Bir akademideki sihirli bir kızı betimleyen sinematik bir dizi için, varışı, gücün keşfini ve sihirli bir düelloyu kapsayan ayrıntılı storyboard tarzı bir istem.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Modern Kırsal Estetik İyileştirici Kısa Film Video İstemi',
    summary:
      'Seedance 2.0\'ın Modern Kırsal Estetik tarzında iyileştirici, sinematik bir kısa film oluşturması için ayrıntılı, üç çekimli bir istem. Stili (Sinematik Reklam, 4K/8K, Aşırı Makro, doğal) belirtir',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Gece Kulübü Broşürü Atmosferik Animasyonu',
    summary:
      'Seedance 2.0\'ın, özneyi sabit tutarken arka plan ve aydınlatma öğelerini canlandırması için ince bir animasyon istemi',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Retro HK Wuxia Film Estetiği',
    summary:
      '80\'ler-90\'lar Hong Kong Wuxia filmlerinin estetiğini yeniden yaratan, stilize çekimlerle bir kediden bir insana karakter dönüşümünü konu alan karmaşık, çok bölümlü bir video komutu.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: 15 Saniyelik Sinematik Japon Romantik Kısa Filmi',
    summary:
      'Seedance 2.0 için sinematik, ultra gerçekçi bir Japon lise saf aşk kısa filmi üretmek üzere tasarlanmış, son derece ayrıntılı, 15 saniyelik, çok sahneli bir komut. Komut, sahne ortamını belirtir (boş',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: 80 Yaşındaki Rapçi MV',
    summary:
      'Seedance 2.0 için 80 yaşında bir kadını konu alan 16:9 yatay sokak rap müzik videosu (MV) üretmeye yönelik ayrıntılı, 15 saniyelik bir komut. Komut, stili belirtir (neon mor/mavi soğuk tonlar, exp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Dövüş Sanatları Videosu için Dizilim ve Hareket Talimatı',
    summary:
      'Seedance 2.0 için, modele bir karakter sayfasına dayalı bir dizilimi canlandırmasını söyleyen, belirli hareketlere ve adımlara odaklanan bir video komutu.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Ruh Değiştiren Ayna Büyüsü Dizilimi',
    summary:
      'Bir aynada gerçekleşen büyülü bir ruh değiştirme olayını anlatan, her bölüm için belirli kamera talimatları ve duygusal ipuçları içeren anlatımsal bir video komutu.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Ekmek Kızartma Makinesi Roketi Korkutması',
    summary:
      'Ekmek kızartma makinesinin ekmeği roket gibi fırlatmasıyla korkutulan yaşlı bir adamın, gerçekçi ev videosu tarzında çekilmiş bir görüntüsü için bir komut.',
  },
  'traditional-dance-performance': {
    title: 'Geleneksel Dans Gösterisi',
    summary:
      'Seedance 2.0 için koreografi ve kimlik referans görsellerine dayalı zarif bir geleneksel dans üretmeye yönelik kapsamlı bir video komutu.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Video - Üç Krallık ARPG - Guan Yu Yan Liang\'ı Öldürüyor (Seedance 2.0)',
    summary:
      'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-guanyu-slaying-yanliang\'i hayata geçiren, yaklaşık 10 saniyelik, motor içi sinematik bir aksiyon dizilimi. Guan Yu (关羽), Kızıl Tavşan atına binerek doğruca düşman savaş hattının içine dalar, Yeşil Ejderha Hilal Bıçağı\'nı kaldırır ve karşı taraftaki general Yan Liang\'a tek, temiz bir kesik indirir. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kararlı darbe, temiz at-ve-bıçak fiziği, fotogerçekçi aydınlatma, ekranda kesinlikle kan yok (darbe, kanla değil, altın bir qi parıltısıyla ima edilir). Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Guan Yu Yan Liang\'ı öldürüyor ekran görüntüsü şablonu.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Video - Üç Krallık ARPG - Lyu Bu Yuanmen Okçuluğu (Seedance 2.0)',
    summary:
      'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-lyubu-yuanmen-archery\'i hayata geçiren, yaklaşık 10 saniyelik, motor içi sinematik bir aksiyon dizilimi. Lyu Bu (吕布), karşı karşıya duran iki ordu arasındaki tozlu bir askeri kampın ortasında durur, kırmızı laklı bir uzun yay çeker, gergin halde bir an tutar, ardından uzaktaki yere saplanmış bir halberde doğru tek bir altın parıltılı, qi yüklü ok salar. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kararlı vuruş, net ve HUD\'a uygun çerçeveleme, temiz yay/ok fiziği, rüzgar + toz + sancak hareketi ve oyun içi ekran görüntüsü renk düzenlemesi. Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Lyu Bu yuanmen okçuluğu ekran görüntüsü şablonu.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Video - Üç Krallık ARPG - Zhao Yun Bebekle Kaçış (Seedance 2.0)',
    summary:
      'Eşlik eden görsel şablonu game-screenshot-three-kingdoms-zhaoyun-cradle-escape\'i hayata geçiren, yaklaşık 12 saniyelik, motor içi sinematik bir aksiyon dizilimi. Zhao Yun (赵云), parçalanmış bir Changban savaş alanında savaş atını sürer, bebek varis A Dou\'yu sol kolunun kıvrımında taşırken sağ elinde mızrağını kullanır, gelen bir darbeyi tek bir KUSURSUZ KAÇIŞLA savuşturur ve yıkılmış bir savaş arabasının üzerinden atlayarak yol açar. Seedance 2.0 için ayarlanmıştır — sıkı kamera disiplini, tek kesintisiz vuruş, inandırıcı tek kollu mızrak kullanımı, temiz at fiziği ve bebeğe kesinlikle görünür hiçbir zarar yok. Eşleşen görsel şablonunun doğrudan video tamamlayıcısı olarak tasarlanmıştır, böylece durağan görüntü ve klip bir çift olarak sunulabilir. Referans görsel: Zhao Yun bebekle kaçış ekran görüntüsü şablonu.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Eski Disney Tarzı Korsan Timsah Animasyonu',
    summary:
      'Bir gemideki korsan timsah ve kuş korsanları konu alan klasik, eski Disney tarzı bir animasyon için çok sahneli anlatımsal bir komut.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Viral K-pop Dans Koreografisi',
    summary:
      'Seedance 2.0 için 16 panelli bir storyboard referansına dayalı dans eden bir karakteri canlandırmaya yönelik ayrıntılı bir komut.',
  },
  'wasteland-factory-chase': {
    title: 'Çorak Toprak Fabrika Kovalamacası',
    summary:
      'Bacaklar üzerinde hareket eden endüstriyel bir fabrikayı ve bir asi motosiklet kovalamacasını konu alan, yüksek hızlı bir çöl çorak toprak sahnesi için sinematik bir komut.',
  },
};
