// Turkish (tr) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const tr: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — Codex içindeki açık kaynak yapay zekâ slayt stüdyosu",
  description:
    "Codex Slides, Codex içinde çalışan açık kaynaklı bir yapay zekâ slayt stüdyosudur. Bir sunum anlat ya da onu bir depoya, bir PDF'e veya bir tabloya yönlendir; yerel Codex'in araştırsın, taslağı çıkarsın, stili belirlesin, render alsın ve gerçek bir PPTX ile baskıya hazır bir PDF dışa aktarsın. Her slayt eksiksiz bir görsel tuvaldir. 45 sunum şablonu, 73 topluluk stili, 24 rehberli senaryo; Fast mode 10'dan fazla slaydı yaklaşık 4–5 dakikada render eder. Browser-first, MIT lisanslı, mevcut codex login'inle çalışır ve ek bir API anahtarı istemez.",
  label: "Kardeş proje",
  heading: "Kodlama ajanının içindeki yapay zekâ slayt stüdyosu",
  lead:
    "Çoğu yapay zekâ slayt üreticisi tüm işi tek bir istemin arkasına saklar ve sana yalnızca bir dosya verir. Codex Slides ise zincirin tamamını Codex içinde canlı tutar — araştırma, taslak, görsel yön, render, düzenleme, sunum, dışa aktarma — ve her sunum kendi diskinde kalıcı bir proje olarak kalır. Image-native yaklaşım sayesinde her slayt, metni değiştirilmiş bir şablon değil, eksiksiz bir görsel tuvaldir.",
  downloadCta: "Open Design'ı indir",
  heroAlt:
    "Codex Slides — solda tarayıcıdaki slayt stüdyosunu yöneten Codex, sağda render edilmiş bir pazar raporu slaydı",

  glanceAria: "Bir bakışta",
  glance: {
    stars: "GitHub yıldızı",
    templates: "Sunum şablonu",
    styles: "Topluluk stili",
    scenarios: "Rehberli senaryo",
    license: "Lisans",
  },

  whyTitle: "Bu neden var",
  whyLead:
    "Bir sunum, tek seferde üretilecek bir problem değildir. Bir dizi karardır — ne söyleneceği, hangi sırayla, hangi görsel dille — ve bunların her birini düzeltmek render öncesinde render sonrasına göre çok daha ucuzdur.",
  ideas: [
    {
      headline: "Bir dosyayı beklemek yerine olup biteni izlersin.",
      body: "Codex, stüdyoyu kendi Browser'ında açar ve görünür tutar. Tek bir sayfa render edilmeden önce brief'i onaylar, taslağı düzenler ve görsel yönü kabul edersin — böylece pahalı hatalar hâlâ ucuzken yakalanır.",
    },
    {
      headline: "Her sunum bir indirme değil, kalıcı bir projedir.",
      body: "Konuşma, kaynaklar, taslak, marka kuralları, kontrol noktaları ve render edilmiş sayfalar diskte kalır. Yarın geri dön ve aynı projeyi düzenlemeye devam et; her yapay zekâ komutu ve her elle düzenleme, inceleyebileceğin, geri yükleyebileceğin veya dışa aktarabileceğin değişmez bir kontrol noktası bırakır.",
    },
    {
      headline: "Image-native — slaydın kendisi tuvaldir.",
      body: "Her sayfa, bir temanın üstüne bırakılmış metin kutusu olarak değil, tek parça eksiksiz bir görsel tuval olarak kurgulanır; çıktının elle tasarlanmış sunumların yanında durabilmesinin sebebi budur. Bir slaydın üzerine doğrudan işaret koy ve yalnızca o sayfayı notlarından yeniden ürettir.",
    },
  ],

  flowTitle: "Nasıl çalışır",
  flowLead:
    "Tek bir istem girer, sunuma hazır bir deste çıkar — ve senin yargının bir model çağrısından daha değerli olduğu her adımda bir kontrol noktası vardır.",
  flow: [
    { step: '01', headline: "Brief'i netleştir", body: "Sana özel hazırlanan soru formu; hedef kitleyi, sayfa sayısını, en boy oranını, dili, çözünürlüğü ve görsel niyeti daha yazım başlamadan onaylar." },
    { step: '02', headline: "Bilgileri araştır", body: "İsteğe bağlı çok turlu web araştırması, Design Files içinde incelenebilir ve düzenlenebilir kalan, kaynaklara dayalı bir Markdown brief üretir." },
    { step: '03', headline: "Taslağı biçimlendir", body: "Her başlığı ve konuşma noktasını düzenle, slayt ekle veya çıkar, anlatının sırasını değiştir ya da ajandan yeniden kurgulamasını iste — hem de görseller daha ortada yokken." },
    { step: '04', headline: "Görsel yönü sabitle", body: "Codex Slides, stil kütüphanesini konuna ve taslağına göre sıralar. Birini seç, tüm kataloğu ara ya da varsayılanla devam et." },
    { step: '05', headline: "Paralel render al", body: "Fast mode sayfaları tek tek değil hepsini aynı anda açar; böylece 10'dan fazla slaytlık bir deste, görsel yön sabit kalırken yaklaşık dört beş dakikada hazır olur." },
    { step: '06', headline: "Yerinde düzenle", body: "Yeniden yazım iste, bir bölgeyi oklar ve yorumlarla işaretle, görsel değiştir, sayfaları yeniden sırala, geçişleri ayarla ve konuşmacı notlarını yaz." },
    { step: '07', headline: "Sun ve dışa aktar", body: "Senkron izleyici penceresi ve zamanlayıcıyla Presenter Mode'u çalıştır, ardından notları korunmuş gerçek bir PPTX ile baskıya hazır bir PDF indir." },
  ],

  showcaseTitle: "Sunumlar nasıl görünüyor",
  showcaseLead:
    "Her kart, Codex Slides ile birlikte gelen bir görsel sistemdir — başlangıç noktası olarak kullanabileceğin bitmiş bir yön; sonra kendi konunu, kitleni veya dosyalarını içine koyarsın.",
  showcase: [
    { alt: "Grafikler ve öne çıkan KPI'larla iş ve pazar raporu sunumu", tag: "Pazar raporu · grafikler ve KPI'lar" },
    { alt: "Dünya haritası, halka grafik ve metrik kutularıyla veri panosu sunumu", tag: "Veri anlatısı · pano" },
    { alt: "Yüksek kontrastlı bir başlık anıyla sinematik ürün keynote slaydı", tag: "Keynote · sinematik" },
    { alt: "Serif başlıklar ve baskı ızgarasıyla editoryal dergi tarzı sunum", tag: "Editoryal · baskı ızgarası" },
    { alt: "Yumuşak 3B diyagram düğümleri ve tek bir çivit vurgusu olan aydınlık, ferah ürün sunumu slaydı", tag: "Sunum · temiz gün ışığı" },
    { alt: "Bir sistemi kesit olarak yeniden kuran, etiketli teknik kesit görünümü slaydı", tag: "Teknik · etiketli kesit" },
  ],

  insideTitle: "Gerçek ürün",
  insideLead:
    "Bunlar Codex'in kendi Browser'ında kullandığı gerçek ekranlar; elle çalışırken kullanacağın ekranların aynısı, yani istediğin anda araya girip kontrolü devralabilirsin.",
  inside: [
    { alt: "İstem düzenleyici, senaryo kısayolları ve topluluk stilleriyle Codex Slides ana ekranı", tag: "Ana ekran · sunumunu anlat" },
    { alt: "Önceden yapılandırılmış sunum akışlarıyla senaryo kitaplığı", tag: "Senaryolar · akış seç" },
    { alt: "Başlıklar ve konuşma noktalarıyla düzenlenebilir sunum taslağı", tag: "Taslak · hikâyeyi biçimlendir" },
    { alt: "Tuvalin tamamı görünür haldeyken araç çubuğu, konuşmacı notları ve küçük resimlerle slayt düzenleyici", tag: "Düzenleyici · tam tuval" },
  ],

  scenariosTitle: "Altı akış grubu",
  scenariosLead:
    "Altı akış grubunda toplanmış yirmi dört rehberli senaryo. Her grup kendi sorularını, kaynak alanlarını ve görsel dilbilgisini getirir. Birinden başla ya da sadece neye ihtiyacın olduğunu anlat.",
  scenarios: [
    { name: "Sıfırdan oluştur", blurb: "Tek bir brief'ten iş raporları, yatırımcı sunumları ve proje teklifleri." },
    { name: "Bir kaynağı dönüştür", blurb: "Mevcut bir PPTX, HTML veya PDF'i güzelleştir; belgeleri, notları ya da bir beyaz tahta fotoğrafını slayda çevir." },
    { name: "Veri ve içgörüler", blurb: "Panolar, düzenli performans raporları, finansal sonuçlar ve anket okumaları." },
    { name: "Araştırma ve kararlar", blurb: "Derin araştırma sunumları, pazar çalışmaları, rekabet analizleri, literatür taramaları." },
    { name: "Bir sunumu iyileştir", blurb: "Marka sistemi uygula, referans bir stili yeniden kur, çevir ve yerelleştir, kısalt ya da genişlet." },
    { name: "Özel çıktılar", blurb: "Eğitim materyalleri, lansman keynote'ları, portfolyolar ve vaka çalışmaları, şablona dayalı toplu üretim." },
  ],

  formatsTitle: "Devredebileceğin gerçek dosyalar",
  formatsLead:
    "Sunum tam istediğin gibi göründüğünde, ikisi de konuşmacı notlarını koruyan gerçek bir PowerPoint (.pptx) ile baskıya hazır bir PDF dışa aktar. Salona ya da akışa uyan render kalitesini ve oranı seç:",
  formatsRows: [
    { label: "Dışa aktarma formatları", values: "PowerPoint (.pptx) · PDF · konuşmacı notları korunur" },
    { label: "Render kalitesi", values: "1K · 2K · 4K" },
    { label: "En boy oranları", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "Hızlı ve zahmetsiz",
  fastTitle: "Fast mode",
  fastLead:
    "Sayfalar arka arkaya değil paralel render edilir — aynı anda dörde kadar, kalanlar sırada — ve bu sırada onaylanmış taslak ile görsel yön sabit kalır. On slaytlık bir deste genellikle dört beş dakikada hazır olur; yarıda kesilen bir çalışma da baştan başlamak yerine projenin kaydedilmiş durumundan devam eder.",
  installTitle: "Codex'e kur",
  installLead:
    "Depoyu bir eklenti pazarı olarak ekle, eklentiyi kur, Codex'i yeniden başlat ve yeni bir görev aç. Eklenti desteği olan Codex, Node.js 20 veya üzeri ve tek bir `codex login` yeterli — varsayılan akış için ayrı bir OpenAI anahtarı ya da `.env` dosyası gerekmez.",

  finalEyebrow: "Sonraki adım",
  tiebackTitle: "Open Design ailesinden",
  tiebackBody:
    "Open Design, hâlihazırda kullandığın kodlama ajanının dışında duran açık ve local-first tasarım çalışma alanıdır. Codex Slides ise aynı fikrin sunumlara çevrilmiş hali: ajanın işi açıkta yapar, proje senin makinende kalır ve hiçbir şey bir aboneliğin arkasına kilitlenmez. Slaytların ötesindeki tam tasarım araç seti için Open Design uygulamasını edin.",

  schemaAlternateName: "Codex içindeki açık kaynak yapay zekâ slayt stüdyosu",
  schemaWhatQuestion: "Codex Slides nedir?",
  schemaWhatAnswer:
    "Codex Slides, Codex içinde eklenti olarak çalışan, MIT lisanslı açık kaynaklı bir yapay zekâ slayt stüdyosudur. Bir istemi, bir depoyu ya da bir dosya kümesini görünür bir akış üzerinden sunuma hazır bir desteye dönüştürür — netleştirme, isteğe bağlı araştırma, taslak, görsel yön, paralel render, düzenleme, sunum ve PPTX/PDF dışa aktarma — ve her sunumu kendi diskinde kalıcı bir proje olarak saklar.",
  schemaKeyQuestion: "Codex Slides ayrı bir API anahtarı gerektirir mi?",
  schemaKeyAnswer:
    "Hayır. `codex login` ile zaten doğruladığın ChatGPT hesabıyla çalışır. Varsayılan akış için ayrı bir OpenAI API anahtarına ya da `.env` dosyasına gerek yoktur; eklenti desteği olan Codex, Node.js 20 veya üzeri ve Git gerekir.",
  schemaExportQuestion: "Codex Slides gerçek PowerPoint dosyaları dışa aktarabilir mi?",
  schemaExportAnswer:
    "Evet. Codex Slides, ikisi de projenin konuşmacı notlarını koruyan gerçek bir PPTX ve baskıya hazır bir PDF dışa aktarır; render kalitesi 1K/2K/4K ve beş en boy oranı desteklenir (16:9, 4:3, 1:1, 9:16, 3:4). Image-native olduğu için dışa aktarılan PPTX slaytları, tek tek düzenlenebilir PowerPoint şekilleri yerine tam sayfa görseller içerir; düzenlenebilir şekilli dışa aktarma yol haritasındadır.",
  schemaRelationQuestion: "Codex Slides, Open Design ile ilişkili mi?",
  schemaRelationAnswer:
    "Evet. Codex Slides, Open Design'ın arkasındaki ekibin kardeş projesidir — aynı açık, local-first ve agent-native yaklaşımın tasarım dosyaları yerine sunumlara uygulanmış hali.",
};

export default tr;
