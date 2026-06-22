# Apple'dan İlham Alan Tasarım Sistemi

> Category: Medya ve Tüketici
> Tüketici elektroniği. Birinci sınıf beyaz alan, SF Pro, sinematik görseller.

## 1. Görsel Tema ve Atmosfer

Apple'ın web dili, galeri benzeri sakinlik ile perakende yoğunluğundaki bilgi blokları arasında gidip gelen, hassas bir editöryel sistemdir. Görsel ton ölçülü kalır: geniş nötr tuvaller, sessiz krom yüzeyler ve neredeyse tüm ifade ağırlığının verildiği ürün görselleri. Arayüz, donanım, malzemeler ve kaplama seçenekleri anlatının ön planına geçsin diye gözden kaybolacak şekilde tasarlanmıştır.

Analiz edilen beş sayfanın genelinde ritim tutarlıdır ancak tek tip değildir. Pazarlama yüzeyleri (ana sayfa ve Environment) sinematik siyah-ışık bölümlemesi kullanırken, ticaret yüzeyleri (Store ve Shop akışları) çekirdek marka gramerini bozmadan daha sıkı boşluklar, daha fazla yardımcı kontrol ve daha yoğun kart yığınları getirir. Sonuç, iki vitesli tek bir sistemdir: vitrin modu ve işlem modu.

Tipografi dengeleyici unsurdur. SF Pro Display, kompakt satır yükseklikleri ve kontrollü harf aralıklarıyla kahraman ve ürün sunum hiyerarşisini taşırken, SF Pro Text ürün meta verilerini, gezinmeyi, filtreleri ve yoğun seçim arayüzünü idare eder. Tipografi gösterişsiz kalır, ancak ölçek aralığı hem reklam panosu kahraman mesajlarını hem de mikro yardımcı etiketleri destekleyecek kadar geniştir.

**Temel Özellikler:**
- İkili bölüm ritmi: derin siyah sahneler (`#000000`) ile soluk nötr alanların (`#f5f5f7`) dönüşümlü kullanımı
- Eylem ve bağlantı anlamları için tek bir mavi vurgu ailesi (`#0071e3`, `#0066cc`, `#2997ff`)
- Tek sistemde çift çalışma modu: sinematik vitrin modülleri ve yoğun ticaret yapılandırıcıları
- Görsellere ve malzeme kaplamalarına yoğun bağımlılık; arayüz kromu görsel olarak ince kalır
- Sıkı başlık metrikleri (SF Pro Display, semibold) ile kompakt gövde/bağlantı tipografisinin (SF Pro Text) eşleştirilmesi
- İmza eylem dili olarak hap ve kapsül geometrisi (`18px` ile `980px` arası ve dairesel kontroller)
- Derinlik az kullanılır; katmanlama işinin çoğunu kontrast ve yüzey ayrımı yapar
- Çok sayfalı renk bloğu ritmi: siyah kahraman bölümleri -> soluk nötr ürün sunum alanları -> yardımcı beyaz perakende yüzeyleri -> kontroller için koyu mikro yüzeyler

## 2. Renk Paleti ve Roller

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Birincil
- **Mutlak Siyah** (`#000000`): Sürükleyici kahraman tuvalleri, yüksek dramatik etkili ürün bölümleri, derin arayüz çapaları.
- **Soluk Apple Grisi** (`#f5f5f7`): Özellik şeritleri, karşılaştırma blokları ve editöryel geçişler için ana açık yüzey.
- **Siyaha Yakın Mürekkep** (`#1d1d1f`): Açık tuvallerde birincil metin ve koyu dolgu kontrol rengi.

### İkincil ve Vurgu
- **Apple Eylem Mavisi** (`#0071e3`): Birincil eylem dolgusu ve odak sinyali veren marka vurgusu.
- **Gövde Bağlantı Mavisi** (`#0066cc`): Uzun metin okunabilirliği için optimize edilmiş satır içi bağlantı rengi.
- **Yüksek Parlaklıklı Bağlantı Mavisi** (`#2997ff`): Daha güçlü kontrast gereken koyu sahnelerde parlak bağlantı işlemi.

### Yüzey ve Arka Plan
- **Saf Beyaz Tuval** (`#ffffff`): Perakende/ürün listesi arka planları ve yoğun işlemsel bölümler.
- **Grafit Yüzey A** (`#272729`): Koyu kart ve medya kontrolü bağlam katmanı.
- **Grafit Yüzey B** (`#262629`): Kontrol gruplamaları için biraz daha derin koyu yardımcı katman.
- **Grafit Yüzey C** (`#28282b`): Yükseltilmiş koyu destek yüzeyleri.
- **Grafit Yüzey D** (`#2a2a2c`): Daha zengin koyu sahnelerde ayrım için kullanılan en koyu yükseltilmiş kademe.

### Nötrler ve Metin
- **İkincil Nötr Gri** (`#6e6e73`): Gövde ikincil metni, yardımcı açıklamalar, üçüncül meta veriler.
- **Yumuşak Kenarlık Grisi** (`#d2d2d7`): Ayırıcılar, ince ana hatlar ve sessiz yardımcı çevreleme.
- **Orta Kenarlık Grisi** (`#86868b`): Ürün yapılandırma ve filtre bağlamlarında daha güçlü alan ana hatları.
- **Yardımcı Koyu Gri** (`#424245`): Mağaza bağlamlarında koyu-nötr metin/yüzey geçişi.

### Anlamsal ve Vurgu
- **Seçim/Odak Sinyali** (`#0071e3`): Pazarlama ve ticaret bağlamları arasında paylaşılan odak ve seçili durum sinyali.
- **Hata/Uyarı/Başarı**: Çıkarılan yüzey kümesinde tutarlı şekilde görünen belirgin bir anlamsal palet bulunmadı.

### Gradyan Sistemi
- Çıkarılan sayfalar ağırlıklı olarak düz yüzey odaklıdır. Görsel zenginlik, kalıcı arayüz gradyanlarından ziyade fotoğraftan ve kaplama işlemesinden gelir.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Görüntü Ailesi:** `SF Pro Display`, yedekler `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Metin Ailesi:** `SF Pro Text`, yedekler `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Kullanım Ayrımı:** Görüntü ailesi kahraman/ürün başlıklarını ve ürün sunum başlıklarını idare eder; Metin ailesi gezinmeyi, kontrolleri, etiketleri ve yoğun ticaret metnini idare eder.

### Hiyerarşi
| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Kahraman Görüntü XL | 80px | 600 | 1.00-1.05 | -1.2px | Environment/store kahraman ölçeği |
| Kahraman Görüntü L | 56px | 600 | 1.07 | -0.28px | Ana sayfa kahraman anları |
| Bölüm Görüntü | 48px | 500-600 | 1.08 | -0.144px | Ana bölüm başlıkları |
| Ürün Başlığı | 40px | 600 | 1.10 | normal | Ürün ve kampanya bölüm başlıkları |
| Özellik Görüntü | 38px | 600 | 1.21 | 0.152px | Cihaz ve ürün sunum vurguları |
| Promosyon Görüntü | 32px | 300-600 | 1.09-1.13 | 0.128px ile 0.352px | Modül düzeyi alt kahramanlar |
| Kart/Ürün Başlığı | 28px | 600 | 1.14 | 0.196px | Karo düzeyi adlandırma ve anahtar metin |
| Yardımcı Başlık | 24px | 600 | 1.17 | 0.216px / -0.2px | Yapılandırıcı ve gruplandırılmış içerik başlıkları |
| Bağlantı/Eylem Başlığı | 21px | 600 | 1.14-1.38 | 0.231px | Daha büyük promosyon bağlantıları |
| Alt Başlık | 19px | 600 | 1.21 | 0.228px | Kompakt bölüm girişleri |
| Birincil Gövde | 17px | 400 | 1.47 | -0.374px | Standart gövde ve perakende açıklamaları |
| Vurgulu Gövde | 17px | 600 | 1.24 | -0.374px | Vurgulanmış etiketler ve anahtar değerler |
| Kontrol Etiketi | 14px | 400-600 | 1.29-1.47 | -0.224px | Düğmeler, yardımcı etiketler, kompakt gezinme metni |
| Mikro Arayüz | 12px | 400-600 | 1.00-1.33 | -0.12px | Küçük yazı, mikro etiketler |
| Yasal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Yoğun meta veri ve yasal destek metni |

### İlkeler
- **Sayfa türleri arası süreklilik:** Aynı tipografik DNA, sinematik lansmanları ve ürün satın alma akışlarını kapsayarak pazarlama ile ticaret arasında bir marka ayrışmasını önler.
- **Ölçekte sıkıştırma:** Görüntü kademeleri, makine işi ve ürün öncelikli bir his vermek için sıkı satır aralığı ve kontrollü harf aralığı kullanır.
- **Perakende derinliğinde okunabilir yoğunluk:** SF Pro Text, kompaktlığı uzun ürün listeleri ve seçenek matrisleri için yeterli dikey ritimle dengeler.
- **Ölçülü ağırlık merdiveni:** 600 baskın vurgu ağırlığıdır; 700 seçici olarak görünür; 300 daha büyük satırlarda kontrast için az kullanılır.

### Yazı Tipi İkameleri Üzerine Not
- En yakın ücretsiz kullanılabilir ikameler: metin ağırlıklı uygulama için `Inter` ve başlıklar için `Inter Tight` ile yaklaşık olarak benzetilen `SF Pro Display-like` metrikler.
- İkame yaparken, gövde boyutlarında satır yüksekliğini hafifçe artırın (+0.02 ile +0.06) ve okunabilirliği korumak için negatif harf aralığı yoğunluğunu azaltın.

## 4. Bileşen Stilleri

### Düğmeler
- **Birincil Dolgu Eylemi:** `#0071e3` arka plan, `#ffffff` metin, 8px yarıçap, kompakt yatay dolgu (genellikle 8px 15px). Kesin satın alma/ilerleme eylemleri için kullanılır.
- **Koyu Dolgu Eylemi:** `#1d1d1f` arka plan, `#ffffff` metin, 8px yarıçap. Açık yüzeylerin ölçülü, yüksek kontrastlı bir birincil eyleme ihtiyaç duyduğunda kullanılır.
- **Hap/Kapsül Eylem Ailesi:** `18px`-`56px` yarıçaplarda büyük kapsül eylemleri ve `980px`'de aşırı hap bağlantıları. Apple'ın yumuşak ama hassas eylem çağrısı silüetini oluşturur.
- **Yardımcı Filtre/Düğme Kabukları:** yoğun yapılandırma bağlamları için ince gri kenarlıklı (`#d2d2d7` / `#86868b`) açık kabuklar (`#fafafc` veya yarı saydam beyaz).
- **Basılı Davranış:** etkin kontroller, fiziksel basma onayını göstermek için genellikle ölçeği küçültür veya dolguyu hafifçe kaydırır.

### Kartlar ve Kapsayıcılar
- **Editöryel/Ürün Kartları:** minimal çerçeveleme ve görsel öncelikli kompozisyonla `#f5f5f7` veya beyaz alanlardaki açık kartlar.
- **Koyu Yardımcı Kartlar:** kaplamalar, medya kontrolleri ve koyu bağlam modülleri için kullanılan grafit kademeler (`#272729` ile `#2a2a2c`).
- **Yapılandırıcı Panelleri:** net ama ölçülü kenarlık tanımına sahip yuvarlatılmış kapsayıcılar (genellikle 12px-18px).
- **Karusel/Spotlight Modülleri:** öne çıkan içerik şeritleri için daha büyük yuvarlatılmış kabuklar (`28px`-`36px`).

### Girdiler ve Formlar
- **Perakende Girdi Alanları:** yarı saydam veya beyaz arka planlar, koyu metin (`#1d1d1f`), kenarlık öncülüğünde çevreleme (`#86868b`).
- **Seçim Kontrolleri:** ürün seçim arayüzlerinde dairesel/anahtar benzeri kontrol geometrisi sıkça görünür.
- **Yoğunluk Stratejisi:** cihaz görselleri ve fiyat hiyerarşisinin baskın kalmasını sağlamak için form alanları görsel olarak sessiz kalır.

### Gezinme
- **Küresel Pazarlama Gezinmesi:** küçük tipli bağlantılar ve ölçülü ikonografiyle kompakt koyu yarı saydam çubuk.
- **Store/Alt Mağaza Gezinme Katmanları:** kategori ve ürün daraltma için ek yardımcı çubuklar, çipler ve segmentli kontroller.
- **Bağlantı Hiyerarşisi:** bağlantı mavileri birincil etkileşim sinyali olarak kalırken nötr metin yoğun gezinme kümelerini destekler.

### Görsel İşleme
- **Nesne Öncelikli Fotoğrafçılık:** donanım ve aksesuarlar kontrollü düz yüzeyler üzerinde ön plana çıkarılır.
- **Yüksek doğrulukta kaplama işleme:** yansıtıcı/malzeme ayrıntıları görsel iknanın merkezindedir.
- **Karışık çerçeveleme:** tam ekran kahraman sahneleri, yuvarlatılmış perakende kartları ve sıkıca kırpılmış ürün sunum küçük resimleriyle bir arada bulunur.

### Diğer Ayırt Edici Bileşenler
- **Ürün Yapılandırıcı Matrisi:** çipleri, radyo tarzı kontrolleri ve bağlamsal fiyatlandırma/özet bloklarını birleştiren seçenek yığınları ve seçiciler.
- **Karusel Kontrol Noktaları/Okları:** galeri ilerlemesi için sessiz kaplamalarda dairesel kontrol sözlüğü.
- **Environment Hikaye Panelleri:** editöryel tipografiyi sinematik ürün/çevre görselleriyle harmanlayan anlatı bölümleri.

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim fiilen `8px`'dir, ancak sistem hassas hizalama için yoğun mikro kademeleri destekler.
- Sayfalar arasında sıkça yeniden kullanılan boşluk değerleri: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Hem pazarlama hem perakende akışlarında görünen evrensel ritim sabitleri: bileşen dolgusu ve liste boşluğu için `14-20px` yardımcı aralıklarla `8px` birim iskelesi.

### Izgara ve Kapsayıcı
- **Vitrin sayfaları:** geniş yatay nefes alanı ve tam genişlikte renk bölümleriyle büyük merkezi sütunlar.
- **Ticaret sayfaları:** sık modüler yığınlamayla daha sıkı çok sütunlu ürün ve kontrol ızgaraları.
- **Kapsayıcı davranışı:** masaüstü genişliklerinde cömert dış kenar boşluklarıyla kısıtlı okunabilir çekirdek.

### Boşluk Felsefesi
- **Sahne hızı:** ana görsel bölümler geniş üst/alt nefes alanı kullanır.
- **Gerektiğinde bilgi sıkıştırma:** perakende sayfaları, görünüm penceresi başına daha fazla eyleme geçirilebilir bilgi göstermek için boşluğu kasıtlı olarak sıkıştırır.
- **Kontrast öncülüğünde ayrım:** bölüm geçişleri dekoratif ayırıcılardan çok yüzey değişikliklerine dayanır.

### Kenarlık Yarıçapı Ölçeği
- **5px:** küçük yardımcı bağlantılar/etiketler ve küçük kabuklar.
- **8px-12px:** standart kontroller ve kompakt alanlar.
- **16px-18px:** kartlar, modül çerçeveleri ve ticaret panelleri.
- **28px-36px:** daha büyük modül ve spotlight kapsayıcıları.
- **56px / 100px / 980px:** kapsüller, büyük haplar ve imza uzatılmış CTA formları.
- **50%:** dairesel medya ve seçim kontrolleri.

## 6. Derinlik ve Yükseklik

| Düzey | İşlem | Kullanım |
|------|-----------|-----|
| Düzey 0 | Düz nötr yüzeyler (`#ffffff`, `#f5f5f7`, `#000000`) | Ana anlatı ve ürün sahneleri |
| Düzey 1 | İnce kenarlık çevreleme (`#d2d2d7`, `#86868b`) | Filtreler, girdi alanları, yardımcı kartlar |
| Düzey 2 | Yumuşak gölge (varsa `rgba(0,0,0,0.08)` ile `rgba(0,0,0,0.22)` arası) | Vurgulanan kartlar ve yükseltilmiş ürün modülleri |
| Düzey 3 | Koyu yüzey kademelemesi (`#272729` -> `#2a2a2c`) | Kaplamalar, medya kontrolleri, koyu yardımcı kümeler |
| Erişilebilirlik | Mavi odak sinyali (`#0071e3`) | Klavye ve seçim vurgusu |

Derinlik kasıtlı olarak ölçülüdür. Apple, ağır gölge yığınları yerine tonal kontrastı, yüzey kademelemesini ve kompozisyon hiyerarşisini tercih eder.

### Dekoratif Derinlik
- Dekoratif derinlik öncelikle sentetik arayüz efektlerinden ziyade fotoğrafik gerçekçilik ve malzeme işlemesiyle oluşturulur.
- Yarı saydam kaplamalar ve cam benzeri yardımcı çubuklar, gezinme ve kontrollerde hafif bir atmosferik katmanlama sağlar.

## 7. Yapılması ve Yapılmaması Gerekenler

### Yapın
- Nötr üçlüyü (`#000000`, `#f5f5f7`, `#ffffff`) yapısal temel olarak kullanın.
- Mavi vurguları gerçek eylem ve gezinme anlamlarına ayırın.
- Tipografiyi sıkı ve bilinçli tutun, özellikle görüntü ölçeklerinde.
- Kontroller ve anahtar eylemler için kapsül/daire geometrisi dilini koruyun.
- Görsel dramayı ürün görsellerinin taşımasına izin verin; kromu gösterişsiz tutun.
- Yoğun perakende bağlamlarında ağır kart süslemesi yerine kenarlık öncülüğünde çevrelemeyi kullanın.
- Çekirdek belirteçleri paylaşımlı tutarken vitrin modülleri ile işlemsel modüller arasında net bir ayrım koruyun.

### Yapmayın
- Apple mavisiyle rekabet eden geniş ikincil vurgu paletleri getirmeyin.
- Çekirdek arayüz kromunda gölgeleri, parıltı efektlerini veya dekoratif gradyanları aşırı kullanmayın.
- İlgisiz yazı tipi ailelerini karıştırmayın veya harf aralığını ayrım gözetmeden gevşetmeyin.
- Tüm köşeleri tek bir yarıçapa düzleştirmeyin; Apple amaçlı yarıçap kademeleri kullanır.
- Ticaret modüllerini kalın kenarlıklar veya gürültülü görsel efektlerle aşırı yüklemeyin.
- Koyu ve açık bölümler arasındaki nötr kontrast kadansını kaldırmayın.
- Pazarlama ve satın alma akışlarını ayrı tasarım sistemleri olarak ele almayın.

## 8. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Anahtar Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | 374px ve altı | Sıkılaştırılmış perakende kontrolleri, tek sütunlu ürün yığınları |
| Mobil | 375px-640px | Tek sütunlu modüller, kompakt eylem satırları, yoğunlaştırılmış seçiciler |
| Tablet | 641px-833px | Genişletilmiş kartlar ve karışık 1-2 sütunlu geçişler |
| Geniş Tablet | 834px-1023px | Daha kararlı çok sütunlu ürün sunumu, daha büyük metin blokları |
| Masaüstü | 1024px-1240px | Tam perakende düzenleri ve ürün karşılaştırma yapıları |
| Geniş Masaüstü | 1241px-1440px | Pazarlama kahraman genişlemesi ve daha geniş bölüm boşluğu |
| Büyük Masaüstü | 1441px+ | Maksimum bölüm nefes alanı ve geniş editöryel kompozisyon |

### Dokunma Hedefleri
- Birincil ve ikincil eylemler genellikle dokunmaya uygun hap/düğme geometrilerinde sunulur.
- Dairesel medya ve seçim kontrolleri, mobil bağlamlarda minimum dokunulabilir niyetle hizalanır.
- Yoğun ticaret arayüzü kompakt etiketler kullanır ancak çevreleyen şekil dolgusu aracılığıyla net vuruş bölgeleri korur.

### Daraltma Stratejisi
- Pazarlama kahraman tipografisi, hiyerarşi kontrastını korurken ayrık kademelerde küçülür.
- Ürün ve ticaret ızgaraları, kalıcı seçici görünürlüğüyle çok sütunludan yığınlanmış kartlara daralır.
- Yardımcı gezinme, anahtar eylemleri korurken daha basit bağlantı/kontrol gruplamalarına sıkışır.
- Seçenek/yapılandırma kümeleri, küçük ekranlarda satın alma akışını doğrusal tutmak için dikey olarak sıralanır.

### Görsel Davranışı
- Ürün görselleri kırılma noktaları boyunca en boy oranını ve merkeziliğini korur.
- Kahraman görselleri mobilde baskın kalır ve metin medya önceliği etrafında yeniden konumlandırılır.
- Perakende küçük resimleri daha sıkı kırpma mantığı ve daha yoğun kart yığınlamasıyla okunabilir kalır.
- Görsel öncülüğündeki modüller, düzen yoğunluğu arttıkça ritmi sabitlemeye devam eder.

## 9. Aracı İstem Kılavuzu

### Hızlı Renk Referansı
- Birincil eylem mavisi: **Apple Eylem Mavisi** (`#0071e3`)
- Satır içi bağlantı mavisi: **Gövde Bağlantı Mavisi** (`#0066cc`)
- Koyu bölüm tuvali: **Mutlak Siyah** (`#000000`)
- Açık bölüm tuvali: **Soluk Apple Grisi** (`#f5f5f7`)
- Açık üzerinde birincil metin: **Siyaha Yakın Mürekkep** (`#1d1d1f`)
- İkincil metin: **İkincil Nötr Gri** (`#6e6e73`)
- Yumuşak perakende kenarlığı: **Yumuşak Kenarlık Grisi** (`#d2d2d7`)
- Güçlü perakende kenarlığı: **Orta Kenarlık Grisi** (`#86868b`)

### Örnek Bileşen İstemleri
- "Siyah bir tuval (`#000000`) üzerinde SF Pro Display semibold başlık (48-56px), özlü destekleyici metin ve `#0071e3` ile `#1d1d1f` kullanan iki kapsül CTA içeren Apple tarzı bir ürün kahramanı tasarla."
- "Beyaz (`#ffffff`) üzerinde 18px yuvarlatılmış kartlar, `#86868b` kenarlık alanları, SF Pro Text 17px gövde metni ve kompakt seçenek seçicileri içeren bir ticaret yapılandırma paneli oluştur."
- "`#f5f5f7` ve beyaz yüzeyleri dönüşümlü kullanan, görsel öncelikli kartlar, ölçülü gölgeler ve 14-17px SF Pro Text meta verileri içeren bir ürün sunum kart ızgarası kur."
- "Dairesel düğmeler (50% yarıçap), sessiz gri kaplamalar ve galeri gezinmesi için net etkin geri bildirim kullanan bir karusel kontrol kümesi üret."
- "Karışık bir pazarlama + perakende sayfa ritmi oluştur: koyu vitrin bölümü -> açık özellik bölümü -> yoğun ürün listesi modülü, mavi vurguları yalnızca eylemler ve bağlantılar için tutarak."

### Yineleme Kılavuzu
1. Vurguları ayarlamadan önce nötr temeli (`#000000`, `#f5f5f7`, `#ffffff`) önce sabitleyin.
2. Mavi vurguları az ve amaçlı tutun; her şey maviyse hiyerarşi çöker.
3. Tipografiyi şu sırayla ayarlayın: görüntü ölçeği, gövde okunabilirliği, ardından mikro etiketler.
4. Yarıçapı herkese uyan tek bir yuvarlamayla değil, bileşen sınıfına göre (alan, kart, kapsül, daire) eşleştirin.
5. Vitrin bölümlerinden ticaret bölümlerine geçerken yoğunluğu kademeli olarak artırın.
6. Her revizyondan sonra ürün görsellerinin en güçlü görsel katman olarak kaldığını doğrulayın.

### Bilinen Boşluklar
- Belirgin anlamsal durum renkleri (hata/uyarı/başarı) çıkarılan sayfa kümesinde tutarlı şekilde görünmedi.
- Bazı etkileşim mikro durumları modüle göre değişir ve evrensel sistem belirteçleri olarak temsil edilmez.
- Birkaç perakende modülü, beş sayfanın tümünde görünmeyen bağlama özgü tipografi geçersiz kılmaları ortaya koyar.
