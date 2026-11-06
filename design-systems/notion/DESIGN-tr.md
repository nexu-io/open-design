# Notion'dan Esinlenen Tasarım Sistemi

> Category: Üretkenlik ve SaaS
> Hepsi bir arada çalışma alanı. Sıcak minimalizm, serifli başlıklar, yumuşak yüzeyler.

## 1. Görsel Tema ve Atmosfer

Notion'ın web sitesi, aracın kendi felsefesini somutlaştırır: yolunuzdan çekilen boş bir tuval. Tasarım sistemi soğuk grilerden ziyade sıcak nötr tonlar üzerine kuruludur ve steril cam yerine kaliteli kâğıt hissi veren, belirgin biçimde yaklaşılabilir bir minimalizm yaratır. Sayfa tuvali saf beyazdır (`#ffffff`), ancak metin saf siyah değildir -- okuma deneyimini fark edilmez biçimde yumuşatan, sıcak ve neredeyse siyaha yakın bir tondur (`rgba(0,0,0,0.95)`). Sıcak gri ölçeği (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) hafif sarı-kahverengi alt tonlar taşır ve arayüze dokunsal, neredeyse analog bir sıcaklık kazandırır.

Özel NotionInter fontu (değiştirilmiş bir Inter) sistemin omurgasıdır. Görüntü boyutlarında (64px), agresif negatif harf aralığı (-2.125px) kullanır ve sıkıştırılmış, kesin hissi veren başlıklar oluşturur. Ağırlık aralığı tipik sistemlerden daha geniştir: gövde için 400, UI öğeleri için 500, yarı kalın etiketler için 600 ve görüntü başlıkları için 700. OpenType özellikleri `"lnum"` (astar rakamlar) ve `"locl"` (yerelleştirilmiş biçimler) daha büyük metinlerde etkinleştirilir ve dikkatli okumayı ödüllendiren tipografik incelik ekler.

Notion'ın görsel dilini ayırt edici kılan şey, kenarlık felsefesidir. Ağır kenarlıklar veya gölgeler yerine Notion, ultra ince `1px solid rgba(0,0,0,0.1)` kenarlıklar kullanır -- fısıltı gibi var olan, ağırlık olmadan yapı oluşturan, zar zor algılanabilen bölme çizgileri. Gölge sistemi de aynı derecede ölçülüdür: kümülatif opaklığı asla 0.05'i aşmayan çok katmanlı yığınlar, görülmekten çok hissedilen bir derinlik yaratır.

**Temel Özellikler:**
- Görüntü boyutlarında negatif harf aralığına sahip NotionInter (değiştirilmiş Inter) (64px'de -2.125px)
- Sıcak nötr palet: griler sarı-kahverengi alt tonlar taşır (`#f6f5f4` sıcak beyaz, `#31302e` sıcak koyu)
- `rgba(0,0,0,0.95)` ile siyaha yakın metin -- saf siyah değil, mikro sıcaklık yaratır
- Ultra ince kenarlıklar: baştan sona `1px solid rgba(0,0,0,0.1)` -- fısıltı ağırlığında bölme
- Zar zor var olan derinlik için 0.05 altı opaklığa sahip çok katmanlı gölge yığınları
- CTA'lar ve etkileşimli öğeler için tekil vurgu rengi olarak Notion Blue (`#0075de`)
- Durum göstergeleri için tonlu mavi arka planlı hap rozetleri (9999px yarıçap)
- Organik, katı olmayan ölçeğe sahip 8px temel boşluk birimi

## 2. Renk Paleti ve Roller

### Birincil
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`): Birincil metin, başlıklar, gövde metni. %95 opaklık, okunabilirlikten ödün vermeden saf siyahı yumuşatır.
- **Pure White** (`#ffffff`): Sayfa arka planı, kart yüzeyleri, mavi üzerindeki düğme metni.
- **Notion Blue** (`#0075de`): Birincil CTA, bağlantı rengi, etkileşimli vurgu -- temel UI çerçevesindeki tek doygun renk.

### Marka İkincil
- **Deep Navy** (`#213183`): İkincil marka rengi, vurgu ve koyu özellik bölümleri için ölçülü kullanılır.
- **Active Blue** (`#005bab`): Düğme aktif/basılı durumu -- Notion Blue'nun daha koyu varyantı.

### Sıcak Nötr Ölçeği
- **Warm White** (`#f6f5f4`): Arka plan yüzey tonu, bölüm değişimi, ince kart dolgusu. Sarı alt ton anahtardır.
- **Warm Dark** (`#31302e`): Koyu yüzey arka planı, koyu bölüm metni. Standart grilerden daha sıcak.
- **Warm Gray 500** (`#615d59`): İkincil metin, açıklamalar, soluk etiketler.
- **Warm Gray 300** (`#a39e98`): Yer tutucu metin, devre dışı durumlar, altyazı metni.

### Anlamsal Vurgu Renkleri
- **Teal** (`#2a9d99`): Başarı durumları, olumlu göstergeler.
- **Green** (`#1aae39`): Onay, tamamlama rozetleri.
- **Orange** (`#dd5b00`): Uyarı durumları, dikkat göstergeleri.
- **Pink** (`#ff64c8`): Dekoratif vurgu, özellik öne çıkanları.
- **Purple** (`#391c57`): Premium özellikler, derin vurgular.
- **Brown** (`#523410`): Toprak tonu vurgu, sıcak özellik bölümleri.

### Etkileşimli
- **Link Blue** (`#0075de`): Üzerine gelindiğinde altı çizili birincil bağlantı rengi.
- **Link Light Blue** (`#62aef0`): Koyu arka planlar için daha açık bağlantı varyantı.
- **Focus Blue** (`#097fe8`): Etkileşimli öğelerde odak halkası.
- **Badge Blue Bg** (`#f2f9ff`): Hap rozeti arka planı, tonlu mavi yüzey.
- **Badge Blue Text** (`#097fe8`): Hap rozeti metni, okunabilirlik için daha koyu mavi.

### Gölgeler ve Derinlik
- **Card Shadow** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Çok katmanlı kart yüksekliği.
- **Deep Shadow** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Modaller ve öne çıkan içerik için beş katmanlı derin yükseklik.
- **Whisper Border** (`1px solid rgba(0,0,0,0.1)`): Standart bölme kenarlığı -- kartlar, ayırıcılar, bölümler.

## 3. Tipografi Kuralları

### Font Ailesi
- **Birincil**: `NotionInter`, yedeklerle: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **OpenType Özellikleri**: `"lnum"` (astar rakamlar) ve `"locl"` (yerelleştirilmiş biçimler) görüntü ve başlık metninde etkinleştirilir.

### Hiyerarşi

| Rol | Font | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (sıkı) | -2.125px | Maksimum sıkıştırma, billboard başlıkları |
| Display Secondary | NotionInter | 54px (3.38rem) | 700 | 1.04 (sıkı) | -1.875px | İkincil hero, özellik başlıkları |
| Section Heading | NotionInter | 48px (3.00rem) | 700 | 1.00 (sıkı) | -1.5px | Özellik bölümü başlıkları, `"lnum"` ile |
| Sub-heading Large | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Kart başlıkları, özellik alt bölümleri |
| Sub-heading | NotionInter | 26px (1.63rem) | 700 | 1.23 (sıkı) | -0.625px | Bölüm alt başlıkları, içerik başlıkları |
| Card Title | NotionInter | 22px (1.38rem) | 700 | 1.27 (sıkı) | -0.25px | Özellik kartları, liste başlıkları |
| Body Large | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Girişler, özellik açıklamaları |
| Body | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Standart okuma metni |
| Body Medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Gezinme, vurgulanan UI metni |
| Body Semibold | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Güçlü etiketler, aktif durumlar |
| Body Bold | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Gövde boyutunda başlıklar |
| Nav / Button | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Gezinme bağlantıları, düğme metni |
| Caption | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Meta veriler, ikincil etiketler |
| Caption Light | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Gövde altyazıları, açıklamalar |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Hap rozetleri, etiketler, durum etiketleri |
| Micro Label | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Küçük meta veriler, zaman damgaları |

### İlkeler
- **Ölçekte sıkıştırma**: NotionInter görüntü boyutlarında 64px'de -2.125px harf aralığı kullanır, kademeli olarak 26px'de -0.625px'e ve 16px'de normale gevşer. Sıkıştırma, gövde boyutlarında okunabilirliği korurken başlıklarda yoğunluk yaratır.
- **Dört ağırlık sistemi**: 400 (gövde/okuma), 500 (UI/etkileşimli), 600 (vurgu/gezinme), 700 (başlıklar/görüntü). Çoğu sisteme kıyasla daha geniş ağırlık aralığı, nüanslı hiyerarşiye olanak tanır.
- **Sıcak ölçeklendirme**: Satır yüksekliği boyut arttıkça sıkılaşır -- gövdede (16px) 1.50, alt başlıklarda 1.23-1.27, görüntüde 1.00-1.04. Bu, daha yoğun, daha etkili başlıklar yaratır.
- **Rozet mikro izleme**: 12px rozet metni pozitif harf aralığı (0.125px) kullanır -- sistemdeki tek pozitif izleme, daha geniş, daha okunabilir küçük metin yaratır.

## 4. Bileşen Stilleri

### Düğmeler

**Primary Blue**
- Arka plan: `#0075de` (Notion Blue)
- Metin: `#ffffff`
- Dolgu: 8px 16px
- Yarıçap: 4px (ince)
- Kenarlık: `1px solid transparent`
- Üzerine gelme: arka plan `#005bab`'a koyulaşır
- Aktif: scale(0.9) dönüşümü
- Odak: `2px solid` odak ana hattı, `var(--shadow-level-200)` gölge
- Kullanım: Birincil CTA ("Get Notion free", "Try it")

**Secondary / Tertiary**
- Arka plan: `rgba(0,0,0,0.05)` (yarı saydam sıcak gri)
- Metin: `#000000` (siyaha yakın)
- Dolgu: 8px 16px
- Yarıçap: 4px
- Üzerine gelme: metin rengi değişir, scale(1.05)
- Aktif: scale(0.9) dönüşümü
- Kullanım: İkincil eylemler, form gönderimleri

**Ghost / Link Button**
- Arka plan: saydam
- Metin: `rgba(0,0,0,0.95)`
- Dekorasyon: üzerine gelindiğinde altı çizili
- Kullanım: Üçüncül eylemler, satır içi bağlantılar

**Pill Badge Button**
- Arka plan: `#f2f9ff` (tonlu mavi)
- Metin: `#097fe8`
- Dolgu: 4px 8px
- Yarıçap: 9999px (tam hap)
- Font: 12px ağırlık 600
- Kullanım: Durum rozetleri, özellik etiketleri, "New" etiketleri

### Kartlar ve Konteynerler
- Arka plan: `#ffffff`
- Kenarlık: `1px solid rgba(0,0,0,0.1)` (fısıltı kenarlığı)
- Yarıçap: 12px (standart kartlar), 16px (öne çıkan/hero kartlar)
- Gölge: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Üzerine gelme: ince gölge yoğunlaşması
- Görsel kartları: 12px üst yarıçap, görsel üst yarıyı doldurur

### Girdiler ve Formlar
- Arka plan: `#ffffff`
- Metin: `rgba(0,0,0,0.9)`
- Kenarlık: `1px solid #dddddd`
- Dolgu: 6px
- Yarıçap: 4px
- Odak: mavi ana hat halkası
- Yer tutucu: sıcak gri `#a39e98`

### Gezinme
- Beyaz üzerinde temiz yatay gezinme, yapışkan değil
- Marka logosu sola hizalı (33x34px simge + kelime markası)
- Bağlantılar: NotionInter 15px ağırlık 500-600, siyaha yakın metin
- Üzerine gelme: renk `var(--color-link-primary-text-hover)`'a kayar
- CTA: mavi hap düğmesi ("Get Notion free") sağa hizalı
- Mobil: hamburger menü daraltma
- Çok seviyeli kategorize edilmiş menülerle ürün açılır menüleri

### Görsel İşleme
- `1px solid rgba(0,0,0,0.1)` kenarlıklı ürün ekran görüntüleri
- Üstü yuvarlatılmış görseller: `12px 12px 0px 0px` yarıçap
- Pano/çalışma alanı önizleme ekran görüntüleri özellik bölümlerine hakimdir
- Hero illüstrasyonlarının arkasında sıcak gradyan arka planlar (dekoratif karakter illüstrasyonları)

### Ayırt Edici Bileşenler

**İllüstrasyonlu Özellik Kartları**
- Büyük illüstratif başlıklar (Büyük Dalga, ürün UI ekran görüntüleri)
- Fısıltı kenarlıklı 12px yarıçaplı kart
- Başlık 22px ağırlık 700, açıklama 16px ağırlık 400
- Değişen bölümler için sıcak beyaz (`#f6f5f4`) arka plan varyantı

**Güven Çubuğu / Logo Izgarası**
- Şirket logoları (güvenilen ekipler bölümü) kendi marka renklerinde
- Ekip sayılarıyla yatay kaydırma veya ızgara düzeni
- Metrik gösterimi: büyük sayı + açıklama deseni

**Metrik Kartları**
- Büyük sayı gösterimi (örneğin "$4,200 ROI")
- Metrik için NotionInter 40px+ ağırlık 700
- Aşağıda sıcak gri gövde metninde açıklama
- Fısıltı kenarlıklı kart konteyneri

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Ölçek: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Mikro ayarlamalar için kesirli değerlerle (5.6px, 6.4px) katı olmayan organik ölçek

### Izgara ve Konteyner
- Maksimum içerik genişliği: yaklaşık 1200px
- Hero: cömert üst dolgulu (80-120px) ortalanmış tek sütun
- Özellik bölümleri: kartlar için 2-3 sütunlu ızgaralar
- Değişim için tam genişlikte sıcak beyaz (`#f6f5f4`) bölüm arka planları
- Fısıltı kenarlıklı sınırlandırılmış kod/pano ekran görüntüleri

### Beyaz Boşluk Felsefesi
- **Cömert dikey ritim**: Ana bölümler arasında 64-120px. Notion, geniş dikey dolgu ile içeriğin nefes almasına izin verir.
- **Sıcak değişim**: Beyaz bölümler sıcak beyaz (`#f6f5f4`) bölümlerle değişir ve sert renk kesintileri olmadan nazik bir görsel ritim yaratır.
- **İçerik öncelikli yoğunluk**: Gövde metin blokları kompakttır (satır yüksekliği 1.50) ancak bol marjla çevrilidir ve beyaz boşluk denizinde okunabilir içerik adaları yaratır.

### Kenarlık Yarıçapı Ölçeği
- Mikro (4px): Düğmeler, girdiler, işlevsel etkileşimli öğeler
- İnce (5px): Bağlantılar, liste öğeleri, menü öğeleri
- Standart (8px): Küçük kartlar, konteynerler, satır içi öğeler
- Rahat (12px): Standart kartlar, özellik konteynerleri, görsel üstleri
- Büyük (16px): Hero kartları, öne çıkan içerik, promosyon blokları
- Tam Hap (9999px): Rozetler, haplar, durum göstergeleri
- Daire (100%): Sekme göstergeleri, avatarlar

## 6. Derinlik ve Yükseklik

| Seviye | İşleme | Kullanım |
|-------|-----------|-----|
| Düz (Level 0) | Gölge yok, kenarlık yok | Sayfa arka planı, metin blokları |
| Fısıltı (Level 1) | `1px solid rgba(0,0,0,0.1)` | Standart kenarlıklar, kart ana hatları, ayırıcılar |
| Yumuşak Kart (Level 2) | 4 katmanlı gölge yığını (maks. opaklık 0.04) | İçerik kartları, özellik blokları |
| Derin Kart (Level 3) | 5 katmanlı gölge yığını (maks. opaklık 0.05, 52px bulanıklık) | Modaller, öne çıkan paneller, hero öğeleri |
| Odak (Erişilebilirlik) | `2px solid var(--focus-color)` ana hat | Tüm etkileşimli öğelerde klavye odağı |

**Gölge Felsefesi**: Notion'ın gölge sistemi, son derece düşük bireysel opaklığa (0.01 ila 0.05) sahip birden fazla katman kullanır ve bunlar yumuşak, doğal görünümlü bir yüksekliğe birikir. 4 katmanlı kart gölgesi 1.04px'den 18px bulanıklığa uzanır ve tek bir sert gölge yerine bir derinlik gradyanı oluşturur. 5 katmanlı derin gölge 0.05 opaklıkta 52px bulanıklığa uzanır ve bilgisayar tarafından üretilmiş bir derinlikten çok doğal ışık gibi hissettiren bir ortam oklüzyonu üretir. Bu katmanlı yaklaşım, öğelerin sayfanın üzerinde yüzmek yerine sayfaya gömülü hissetmesini sağlar.

### Dekoratif Derinlik
- Hero bölümü: dekoratif karakter illüstrasyonları (eğlenceli, elle çizilmiş stil)
- Bölüm değişimi: beyazdan sıcak beyaza (`#f6f5f4`) arka plan kaymaları
- Sert bölüm kenarlığı yok -- ayrım arka plan renk değişikliklerinden ve boşluktan gelir

## 7. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Mobile Small | <400px | Sıkı tek sütun, minimal dolgu |
| Mobile | 400-600px | Standart mobil, yığılmış düzen |
| Tablet Small | 600-768px | 2 sütunlu ızgaralar başlar |
| Tablet | 768-1080px | Tam kart ızgaraları, genişletilmiş dolgu |
| Desktop Small | 1080-1200px | Standart masaüstü düzeni |
| Desktop | 1200-1440px | Tam düzen, maksimum içerik genişliği |
| Large Desktop | >1440px | Ortalanmış, cömert marjlar |

### Dokunma Hedefleri
- Düğmeler rahat dolgu kullanır (dikey 8px-16px)
- Yeterli boşlukla 15px'de gezinme bağlantıları
- Hap rozetleri dokunma hedefleri için 8px yatay dolguya sahiptir
- Mobil menü geçişi standart hamburger düğmesi kullanır

### Daraltma Stratejisi
- Hero: 64px görüntü -> 40px'e ölçeklenir -> mobilde 26px, orantılı harf aralığını korur
- Gezinme: yatay bağlantılar + mavi CTA -> hamburger menü
- Özellik kartları: 3 sütunlu -> 2 sütunlu -> tek sütun yığılmış
- Ürün ekran görüntüleri: duyarlı görsellerle en boy oranını korur
- Güven çubuğu logoları: ızgara -> mobilde yatay kaydırma
- Alt bilgi: çok sütunlu -> yığılmış tek sütun
- Bölüm boşluğu: 80px+ -> mobilde 48px

### Görsel Davranışı
- Çalışma alanı ekran görüntüleri tüm boyutlarda fısıltı kenarlığını korur
- Hero illüstrasyonları orantılı olarak ölçeklenir
- Ürün ekran görüntüleri tutarlı kenarlık yarıçapıyla duyarlı görseller kullanır
- Tam genişlikte sıcak beyaz bölümler kenardan kenara işlemeyi korur

## 8. Erişilebilirlik ve Durumlar

### Odak Sistemi
- Tüm etkileşimli öğeler görünür odak göstergeleri alır
- Odak ana hattı: odak rengi + gölge seviye 200 ile `2px solid`
- Tüm etkileşimli bileşenlerde Tab gezinmesi desteklenir
- Yüksek kontrastlı metin: beyaz üzerinde siyaha yakın WCAG AAA'yı aşar (>14:1 oran)

### Etkileşimli Durumlar
- **Varsayılan**: Fısıltı kenarlıklı standart görünüm
- **Üzerine gelme**: Metinde renk kayması, düğmelerde scale(1.05), bağlantılarda altı çizili
- **Aktif/Basılı**: scale(0.9) dönüşümü, daha koyu arka plan varyantı
- **Odak**: Gölge takviyeli mavi ana hat halkası
- **Devre dışı**: Sıcak gri (`#a39e98`) metin, azaltılmış opaklık

### Renk Kontrastı
- Beyaz üzerinde birincil metin (rgba(0,0,0,0.95)): ~18:1 oran
- Beyaz üzerinde ikincil metin (#615d59): ~5.5:1 oran (WCAG AA)
- Beyaz üzerinde mavi CTA (#0075de): ~4.6:1 oran (büyük metin için WCAG AA)
- Rozet arka planında (#f2f9ff) rozet metni (#097fe8): ~4.5:1 oran (büyük metin için WCAG AA)

## 9. Agent İstem Kılavuzu

### Hızlı Renk Referansı
- Birincil CTA: Notion Blue (`#0075de`)
- Arka plan: Pure White (`#ffffff`)
- Alternatif Arka plan: Warm White (`#f6f5f4`)
- Başlık metni: Siyaha yakın (`rgba(0,0,0,0.95)`)
- Gövde metni: Siyaha yakın (`rgba(0,0,0,0.95)`)
- İkincil metin: Warm Gray 500 (`#615d59`)
- Soluk metin: Warm Gray 300 (`#a39e98`)
- Kenarlık: `1px solid rgba(0,0,0,0.1)`
- Bağlantı: Notion Blue (`#0075de`)
- Odak halkası: Focus Blue (`#097fe8`)

### Örnek Bileşen İstemleri
- "Beyaz arka planda bir hero bölümü oluştur. Başlık 64px NotionInter ağırlık 700, satır yüksekliği 1.00, harf aralığı -2.125px, renk rgba(0,0,0,0.95). Alt başlık 20px ağırlık 600, satır yüksekliği 1.40, renk #615d59. Mavi CTA düğmesi (#0075de, 4px yarıçap, 8px 16px dolgu, beyaz metin) ve ghost düğme (saydam arka plan, siyaha yakın metin, üzerine gelindiğinde altı çizili)."
- "Bir kart tasarla: beyaz arka plan, 1px solid rgba(0,0,0,0.1) kenarlık, 12px yarıçap. Gölge yığını kullan: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Başlık 22px NotionInter ağırlık 700, harf aralığı -0.25px. Gövde 16px ağırlık 400, renk #615d59."
- "Bir hap rozeti oluştur: #f2f9ff arka plan, #097fe8 metin, 9999px yarıçap, 4px 8px dolgu, 12px NotionInter ağırlık 600, harf aralığı 0.125px."
- "Gezinme oluştur: beyaz başlık. Bağlantılar için NotionInter 15px ağırlık 600, siyaha yakın metin. Sağa hizalı mavi hap CTA 'Get Notion free' (#0075de arka plan, beyaz metin, 4px yarıçap)."
- "Değişen bölüm düzeni tasarla: beyaz bölümler sıcak beyaz (#f6f5f4) bölümlerle değişir. Her bölümde 64-80px dikey dolgu, max-width 1200px ortalanmış. Bölüm başlığı 48px ağırlık 700, satır yüksekliği 1.00, harf aralığı -1.5px."

### İterasyon Kılavuzu
1. Her zaman sıcak nötr tonlar kullan -- Notion'ın grileri sarı-kahverengi alt tonlara sahiptir (#f6f5f4, #31302e, #615d59, #a39e98), asla mavi-gri
2. Harf aralığı font boyutuyla ölçeklenir: 64px'de -2.125px, 54px'de -1.875px, 26px'de -0.625px, 16px'de normal
3. Dört ağırlık: 400 (okuma), 500 (etkileşim), 600 (vurgu), 700 (duyuru)
4. Kenarlıklar fısıltıdır: 1px solid rgba(0,0,0,0.1) -- asla daha ağır değil
5. Gölgeler bireysel opaklığı asla 0.05'i aşmayan 4-5 katman kullanır
6. Sıcak beyaz (#f6f5f4) bölüm arka planı görsel ritim için gereklidir
7. Durum/etiketler için hap rozetleri (9999px), düğmeler ve girdiler için 4px yarıçap
8. Notion Blue (#0075de) temel UI'daki tek doygun renktir -- CTA'lar ve bağlantılar için ölçülü kullan
