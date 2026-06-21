# Shopify'dan İlham Alan Tasarım Sistemi

> Category: E-Ticaret ve Perakende
> E-ticaret platformu. Karanlık-önce sinematik, neon yeşil vurgu, ultra-hafif yazı tipi.

## 1. Görsel Tema & Atmosfer

Shopify.com karanlık-önce bir dijital tiyatrodur — ticaret platformunu sinematik bir gala gibi sahneleyen bir web sitesi. Tüm deneyim, derin orman yeşilinin en hafif fısıltısını taşıyan (`#02090A`, `#061A1C`, `#102620`) neredeyse siyah yüzeylerin uçurumu karşısında açılır; bir SaaS pazarlama sayfasından çok bir teknoloji sunumundaki özel ürün tanıtımını andıran gece atmosferi yaratır. Bu karanlık soğuk veya kurumsal değildir — bir lüks deneyimin sıcak, kucaklayan karanlığıdır; karanlık bir salonun ön sırasında oturmak gibi.

Tipografi tartışmasız yıldızdır. NeueHaasGrotesk — rafine edilmiş bir Helvetica soyundan gelen yazı tipi — inanılmaz derecede hafif bir ağırlıkla (330-400) anıtsal ölçekte (96px) görünür ve mürekkepte basılmış değil, ışıkta kazınmış gibi hissettiren başlıklar oluşturur. `ss03` OpenType özelliği, harf biçimlerine Shopify'ın tipografisini genel Helvetica kullanımından ayıran özgün bir karakter katar. Görüntüleme katmanının altında Inter Variable, geleneksel ağırlık durakları arasındaki boşluklarda yaşayan olağandışı değişken ağırlıklar (420, 450, 550) kullanarak gövde metnini cerrahi bir hassasiyetle işler. Bu hassasiyet, her ayrıntıyı özenle işleyen bir şirketin işaretidir.

Renk son derece kısıtlamayla kullanılır. Birincil vurgu Shopify Neon Yeşil (`#36F4A4`) — karanlık tuval karşısında biyolüminesans bir sinyal gibi nabız atan; yalnızca odak halkaları ve vurgu noktalarında beliren elektrik bir nane. Daha yumuşak yeşil tonları (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) atmosferik yıkamalar sağlar. Beyaz, karanlık yüzeylerdeki tek önemli metin rengidir; çinko tabanlı nötr bir ölçek (`#A1A1AA`'dan `#3F3F46`'ya) sessiz bilgilerin hiyerarşisini yönetir. Sonuç, ticaret teknolojisini bilimkurgu geleceğine ait gibi hissettiren bir tasarımdır.

**Temel Özellikler:**
- Derin orman-teal alt tonlarıyla karanlık-önce tasarım (saf siyah değil)
- Anıtsal ölçekte (96px) ultra-hafif görüntüleme tipografisi (ağırlık 330) etherik bir varlık yaratır
- Karanlığa karşı tekil yüksek enerjili vurgu olarak Neon Yeşil (`#36F4A4`)
- Birincil etkileşimli şekil olarak tam pill düğmeler (9999px yarıçap)
- Fotoğrafik derinlik yaratan katmanlı, çok aşamalı box-shadow'lar
- Çevreleyen karanlıkla örtüşen karanlık UI bağlamlarına yerleştirilen ürün ekran görüntüleri
- Metin hiyerarşisi için çinko tabanlı nötr ölçek — sıcak ve soğuk arasında dengeli

## 2. Renk Paleti & Roller

### Birincil

- **Shopify White** (`#FFFFFF`): Karanlık yüzeylerde birincil metin, düğme dolguları, yüksek kontrastlı öğeler
- **Shopify Black** (`#000000`): Gövde arka planı, beyaz üzerinde düğme metni, maksimum kontrast tabanı (--color-shade-100)

### İkincil & Vurgu

- **Neon Green** (`#36F4A4`): İmza vurgusu — odak halkaları, etkileşimli noktalar, aktif durum göstergeleri. Elektrikli ve biyolüminesant
- **Aloe** (`#C1FBD4`): Dekoratif arka planlar ve atmosferik kartlar için yumuşak yeşil yıkama (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): İnce yüzey farklılaştırması için en açık yeşil ton (--color-pistachio-10)

### Yüzey & Arka Plan

- **Void** (`#000000`): Kök sayfa arka planı — maksimum derinlik için gerçek siyah
- **Deep Teal** (`#02090A`): Kart yüzeyleri, içerik konteynerleri — yeşil alt tonlu neredeyse siyah
- **Dark Forest** (`#061A1C`): Görünür yeşil karakterli bölüm arka planları
- **Forest** (`#102620`): Yükseltilmiş karanlık yüzeyler, başlık arka planları — en sıcak karanlık ton
- **Dark Card Border** (`#1E2C31`): Karanlık yüzeylerdeki kart sınırları, ince sınır tanımı

### Nötrler & Metin (Çinko Ölçeği)

- **Shade-30** (`#D4D4D8`): En açık nötr, karanlıkta neredeyse görünmez sınırlar (--color-shade-30)
- **Muted Text** (`#A1A1AA`): İkincil metin, meta veri, açıklamalar — sessiz ses
- **Shade-50** (`#71717A`): Üçüncül metin, zaman damgaları, en az önemli bilgi (--color-shade-50)
- **Shade-60** (`#52525B`): Devre dışı metin, dekoratif nötrler (--color-shade-60)
- **Shade-70** (`#3F3F46`): İnce ayırıcılar, neredeyse görünmez UI sınırları (--color-shade-70)
- **Light Border** (`#E4E4E7`): Açık yüzeylerdeki sınırlar (nadir — yalnızca açık mod modallarında)

### Semantik & Vurgu

- **Link Muted** (`#9797A2`): Altı çizili süslemeyle sessize alınmış bağlantı metni
- **Link Sage** (`#9DABAD`): Teal tonlu sessize alınmış bağlantılar
- **Link Lavender** (`#BDBDCA`): Daha açık bağlantı varyantı
- **Link Mint** (`#99B3AD`): Temalı bölümler için yeşil tonlu bağlantı varyantı

### Degrade Sistemi

- **Dark Teal Wash**: `#102620` merkezden `#02090A` kenara radyal degrade — ürün vitrinlerinin arkasında kullanılır
- **Green Atmospheric**: Katı renkler kullanmadan derinlik yaratan, hero bölümlerinin arkasındaki ince yeşil tonlu ortam degradeleri
- **Spotlight**: Siyaha soluklaşan odaklanmış parlak alan — keynote tarzı sunum aydınlatması yaratır

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi

**Görüntüleme:** NeueHaasGrotesk (rafine edilmiş Helvetica soyundan gelen, değişken yazı tipi)
- Geri dönüş: Helvetica, Arial, sans-serif
- OpenType özellikleri: `ss03` (stil seti 3 — özgün harf biçimi alternatifleri)
- Mevcut ağırlıklar: 330, 360, 400, 500, 750 (değişken)
- Tüm başlıklar, hero metni ve büyük görüntüleme öğeleri için kullanılır

**Gövde:** Inter-Variable
- Geri dönüş: Helvetica, Arial, sans-serif
- OpenType özellikleri: `ss03`
- Mevcut ağırlıklar: 400, 420, 450, 500, 550 (değişken)
- Gövde metni, bağlantılar, düğmeler, UI öğeleri için kullanılır

**Mono:** ui-monospace
- Geri dönüş: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Kod parçacıkları, veri etiketleri, teknik içerik için kullanılır

### Hiyerarşi

| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, hero başlıkları, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, vurgu görüntüsü |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, aralıklı görüntü |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, etherik görüntü |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, bölüm başlıkları |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, alt bölümler |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, özellik başlıkları |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, kart başlıkları |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, küçük başlıklar |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, küçük başlıklar |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, giriş paragrafları |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, standart gövde |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, vurgulu gövde |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, kompakt gövde |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, hafifçe vurgulu |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, CTA metni |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, navigasyon öğeleri |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, meta veri |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, vurgulu başlık altı |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, geniş aralıklı etiketler |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, dar aralıklı küçük metin |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, büyük harf etiketleri |
| Code | 16px | 400 | 1.50 | — | ui-monospace, büyük harf, kod blokları |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, büyük harf, satır içi kod |

### İlkeler

Shopify'ın tipografisi değişken yazı tipi hassasiyetinde bir ustalık dersidir. Görüntüleme katmanı neredeyse yalnızca 330-400 ağırlıklarında yaşar — yansıtılmış ışık gibi karanlık arka planın üzerinde süzülüyor gibi görünen tüy ağırlıklı metin. Bu, çoğu SaaS sitesinin aldığı kalın, ağır yaklaşımın tam tersidir: diğerleri bağırdığında Shopify ölçekte fısıldar. 330 ağırlığındaki 96px başlıklar, hem anıtsal hem de narin hissettiren devasa boyut ve ince konturun paradoksunu yaratır. `ss03` OpenType özelliği, belirli karakterlere (muhtemelen 'a', 'g' ve bazı rakamlar) daha rafine bir görünüm veren stilistik bir seti etkinleştirerek Shopify'ın tipografisini standart Helvetica Neue kullanımından ayırır. Inter Variable, gövde katmanını cerrahi hassasiyetle işler ve geleneksel duraklar arasında yer alan 420 ve 550 gibi ağırlıklar kullanır — her metin parçasının tam olarak ihtiyaç duyduğu görsel ağırlığı vardır.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil (Beyaz Dolgulu)**
- Arka plan: Beyaz (`#FFFFFF`)
- Metin: Siyah (`#000000`)
- Sınır: 2px solid şeffaf
- Sınır yarıçapı: tam pill (9999px)
- Dolgu: 12px 26px 12px 16px (asimetrik — görsel denge için daha fazla sağ dolgu)
- Hover: hafif opaklık azaltma veya arka plan kayması
- Odak: 2px `#36F4A4` (Neon Yeşil) ana hat halkası
- Geçiş: all 200ms ease

**İkincil (Ghost/Çerçeveli)**
- Arka plan: şeffaf
- Metin: Beyaz (`#FFFFFF`)
- Sınır: 2px solid Beyaz (`#FFFFFF`)
- Sınır yarıçapı: tam pill (9999px)
- Dolgu: 12px 26px 12px 16px
- Hover: siyah metinle beyaz arka plana dolar
- Odak: 2px `#36F4A4` ana hat

**Badge/Tag (Nötr Dolgulu)**
- Arka plan: `rgba(255, 255, 255, 0.2)` (buzlu cam)
- Metin: Beyaz (`#FFFFFF`)
- Sınır: yok
- Sınır yarıçapı: hafifçe yuvarlatılmış (4px)
- Dolgu: 12px 16px
- Yazı tipi: 16px normal

### Kartlar & Konteynerler

- Arka plan: Karanlık sayfalarda Deep Teal (`#02090A`)
- Sınır: 1px solid `#1E2C31` (Dark Card Border) — neredeyse görünmez sınır
- Sınır yarıçapı: Standart kartlar için 8px, öne çıkan kartlar için 12px, üstten yuvarlatılmış kartlar için 20px 20px 0 0
- Gölge: Çok katmanlı sistem:
  - Dinlenim: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - İç beyaz vurgu, ince bir üst kenar parlaması yaratır
- Hover: gölge genişler, kart hafifçe parıldayabilir
- Geçiş: box-shadow 300ms ease, transform 200ms ease

### Giriş Alanları & Formlar

- Arka plan: şeffaf veya Dark Forest (`#061A1C`)
- Metin: Beyaz (`#FFFFFF`)
- Sınır: 1px solid `#3F3F46` (Shade-70)
- Sınır yarıçapı: 8px
- Dolgu: 12px 16px
- Odak: 2px solid `#36F4A4` (Neon Yeşil odak halkası)
- Yer tutucu: Shade-50 (`#71717A`)
- Geçiş: border-color 200ms ease

### Navigasyon

- Arka plan: şeffaf (karanlık hero üzerinde), kaydırmada Forest (`#102620`) olur
- Yükseklik: ~64px
- Sol: Shopify wordmark logosu (SVG, karanlık üzerinde beyaz)
- Orta/Sağ: 18px/500 NeueHaasGrotesk nav bağlantıları, beyaz, harf aralığı 0.72px
- CTA: Beyaz pill düğme "Start for free" (sağ)
- İkincil CTA: Beyaz sınırlı Ghost düğme
- Hover: bağlantılar Muted Text'e (`#A1A1AA`) kayar veya altı çizgi kazanır
- Mobil: hamburger menü, tam ekran karanlık bindirme
- Geçiş: kaydırmada background 300ms ease

### Görsel İşleme

- Ürün ekran görüntüleri: çevreleyen karanlıkla örtüşen karanlık UI bağlamlarına yerleştirilen
- Yönetici arayüzü önizlemeleri: ince kart sınırlarıyla karanlık arka planlarda gösterilir
- En boy oranları: çeşitli — hero görüntüleri geniş (16:9 benzeri), özellik görüntüleri esnek
- Tüm görüntüler karanlık konteynerlerde düzgün oturur — parlak sınır veya çerçeve yok
- Karanlık yer tutucu yüzeylerle geç yükleme

### Güven Göstergeleri

- Öne çıkan istatistikler: "15+" (yıl), "150M+" (alıcı)
- NeueHaasGrotesk'te görüntüleme ölçeğinde sayılar
- İş ortağı/geliştirici ekosistemi çağrı bölümleri
- Sayfa akışına entegre karanlık temalı referanslar

## 5. Düzen İlkeleri

### Boşluk Sistemi

Temel birim: 8px

| Token | Değer | Kullanım |
|-------|-------|-----|
| space-1 | 4px | Dar satır içi boşluklar |
| space-2 | 8px | Temel birim, ikon boşlukları |
| space-3 | 12px | Kart dolgusu, dar kenar boşlukları |
| space-4 | 16px | Standart öğe dolgusu |
| space-5 | 24px | Kart boşlukları, bölüm dolgusu |
| space-6 | 28px | Orta bölüm aralığı |
| space-7 | 32px | Bölüm araları |
| space-8 | 36px | Büyük dolgu |
| space-9 | 40px | Ana bölüm dolgusu |
| space-10 | 64px | Hero bölüm dolgusu, büyük boşluklar |

### Izgara & Konteyner

- Maksimum konteyner genişliği: ~1280px (ortalanmış)
- Hero: tam genişlik, kenardan kenara karanlık arka plan ve ortalanmış metin
- Özellik bölümleri: metin ve ürün ekran görüntüleriyle 2 sütunlu düzenler
- İstatistik bölümleri: büyük sayılarla yatay düzen
- Yatay dolgu: masaüstü 64px, tablet 32px, mobil 16px
- Izgara boşluğu: ana içerik blokları arasında 24-32px

### Boşluk Felsefesi

Shopify'ın boşluk stratejisi tiyatraldir. Bölümler, bir sunumun temposunu değil, bir web sayfasını yaratan geniş karanlık alan genişlikleriyle ayrılır — 80px ile 120px arasında saf siyah nefes alma alanı. Her içerik bloğu, keynote tarzı kaydırmada kendi "slaydı"dır. Bölümlerin içinde aralık daha sıkı ve daha kasıtlıdır; geniş boşluğa karşı odak yoğunluğu yaratır. Makro düzeyde boşluk ile mikro düzeyde hassasiyet arasındaki zıtlık, siteye sinematik kadansını veren şeydir.

### Sınır Yarıçap Ölçeği

| Değer | Bağlam |
|-------|---------|
| 4px | Etiketler, rozetler, mikro öğeler |
| 8px | Standart kartlar, giriş alanları, video konteynerleri |
| 12px | Öne çıkan kartlar, görüntü konteynerleri, düğmeler (pill olmayan) |
| 20px | Üstten yuvarlatılmış kartlar (20px 20px 0 0), modal başlıkları |
| 340px | Büyük yuvarlak dekoratif öğeler |
| 9999px | Pill düğmeler, pill rozetler, nav öğeleri |

## 6. Derinlik & Yükseklik

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| Temel | Gölge yok, karanlık yüzey | Varsayılan sayfa arka planı |
| Hafif | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + iç beyaz parıltı | Dinlenim kartları |
| Orta | Çok katmanlı: 1px halka + 2px + 4px + 8px gölge yığını | Yükseltilmiş kartlar, öne çıkan bölümler |
| Yüksek | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modaller, açılır menüler, bindirmeler |
| Odak | `0px 0px 0px 2px #36F4A4` | Klavye odak halkası (Neon Yeşil) |

Shopify'ın gölge sistemi alışılmadık derecede karmaşıktır. Tek değerli gölgeler yerine, kartlar yığılmış, çok katmanlı bir yaklaşım kullanır: sınır tanımı için 1px halka, doğal ışık düşüşü için 2px/4px/8px ilerleyici bulanıklıklar ve üstten aydınlatılmış cam yüzeyini simüle eden hassas bir iç beyaz parıltı (`rgba(255,255,255,0.03)`). Karanlık arka planlarda gölgeler zaten karanlık yüzeylerden koyulaşır, dolayısıyla gölgeler geleneksel yükseltmeden çok "ortam tıkama" işlevi görür — kart yüzeyin üzerinde yüzmek yerine yüzeye hafifçe batıyor gibi görünür.

### Dekoratif Derinlik

- **Karanlık teal degradeleri**: Hero bölümleri ve ürün vitrinlerinin arkasındaki ortam radyal yıkamaları
- **Spotlight efektleri**: Siyaha soluklaşan parlak ortalanmış alanlar, keynote tarzı tiyatral aydınlatma yaratır
- **Kenar parlaması**: İç box-shadow aracılığıyla karanlık kartlarda ince açık renkli kenarlar
- **Yeşil atmosferik hale**: Arka plan degradelerindeki soluk yeşil tonları, marka vurgusunu yansıtır

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar

- Derinlik için karanlık teal-siyah yüzey hiyerarşisini kullanın (Void → Deep Teal → Dark Forest → Forest)
- Görüntüleme tipografisini 330-400 ağırlığında tutun — etherik hafiflik tasarımın imzasıdır
- Neon Green (`#36F4A4`) yalnızca odak durumları ve kritik vurgu noktaları için kullanın
- Tüm birincil CTA düğmelerine 9999px yarıçap uygulayın — tam pill tartışmasızdır
- Kart yüksekliği için çok katmanlı gölge sistemini kullanın — tek gölgeler düz görünür
- `ss03` OpenType özelliğini tüm metinlerde koruyun — bu tipografik kimliğin bir parçasıdır
- Gövde metni için Inter Variable, başlıklar için NeueHaasGrotesk kullanın — rollerini asla karıştırmayın
- Sinematik tempo için bölümler arasında tiyatral aralık yaratın (80px+)

### Yapılmayacaklar

- Karanlık arka planlarda metin için saf siyah (#000000) kullanmayın — yalnızca beyaz (#FFFFFF) kullanın
- Sıcak renkler (turuncu, kırmızı, sarı) eklemeyin — palet kesinlikle soğuktur (yeşiller, teal'ler, nötrler)
- NeueHaasGrotesk gövde metni için 500'ün üzerinde yazı tipi ağırlıkları kullanmayın — ağır ağırlıklar etherik hissi bozar
- Büyük yüzeylere yeşil vurgular uygulamayın — Neon Yeşil yalnızca küçük, hassas noktalar içindir
- Etkileşimli öğelerde keskin köşeler (0px yarıçap) kullanmayın — her şey yuvarlanır
- Parlak arka planlar eklemeyin — karanlık tema temeldir, seçenek değil
- Tek katmanlı box-shadow kullanmayın — yığılmış yaklaşım sistemdir
- Gövde metni için satır yüksekliğini 1.56'nın üzerine ayarlamayın — Shopify'ın metni nispeten kompakttır
- NeueHaasGrotesk ve Inter'i aynı boyut/rolde karıştırmayın — ağırlık ölçekleri farklıdır
- Başlıklar için 0'ın altında harf aralığı kullanmayın — Shopify başlıkları nötr veya pozitif izler

## 8. Duyarlı Davranış

### Kesme Noktaları

| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Mobil | <640px | Tek sütun, hamburger nav, görüntüleme metni 48px'e ölçeklenir, 16px dolgu |
| Tablet | 640-1024px | 2 sütunlu ızgaralar başlar, görüntüleme metni 70px, 32px dolgu |
| Masaüstü | 1024-1440px | Tam düzen, genişletilmiş nav, 96px görüntüleme, 64px dolgu |
| Büyük Masaüstü | >1440px | Ortalanmış maksimum genişlik konteyneri, artan bölüm aralığı |

### Dokunma Hedefleri

- Minimum dokunma hedefi: 44x44px (WCAG AAA)
- Pill düğmeler: cömert yatay dolguyla minimum 48px yükseklik
- Nav bağlantıları: 44px dokunma alanı
- Kart yüzeyleri: bağlantılı olduğunda tam kart dokunulabilir

### Daraltma Stratejisi

- **Navigasyon**: Tam yatay bağlantılar → 1024px altında hamburger menü; logo ve CTA düğmesi görünür kalır
- **Hero bölümü**: 96px görüntüleme → tablette 70px → mobilde 48px; tek sütun ortalama hizalamasını korur
- **Özellik bölümleri**: 2 sütunlu metin+görüntü → 768px altında yığılmış tek sütun
- **İstatistikler**: Yatay sıra → mobilde yığılmış dikey
- **Bölüm dolgusu**: Görünüm alanı daraldıkça 64px → 40px → 24px → 16px
- **Kartlar**: Izgara → yığın, mobilde tam genişliği korur

### Görüntü Davranışı

- Ürün ekran görüntüleri: karanlık konteynerlerde duyarlı, en boy oranını korur
- Hero görüntüleri: tüm kesme noktalarında tam genişlik, karanlık yer tutucularla geç yükleme
- Yönetici UI önizlemeleri: orantılı ölçeklenir, mobilde kırpılabilir
- Tüm görüntüler duyarlı srcset ile CDN (`cdn.shopify.com`) kullanır

## 9. Ajan Prompt Kılavuzu

### Hızlı Renk Referansı

- Birincil CTA: Shopify White (`#FFFFFF`)
- Sayfa arka planı: Void Black (`#000000`)
- Kart yüzeyi: Deep Teal (`#02090A`)
- Bölüm arka planı: Dark Forest (`#061A1C`)
- Yükseltilmiş arka plan: Forest (`#102620`)
- Vurgu: Neon Green (`#36F4A4`)
- Gövde metni: White (`#FFFFFF`)
- Sessiz metin: Muted (`#A1A1AA`)
- Karanlık sınır: Dark Card Border (`#1E2C31`)

### Örnek Bileşen Promptları

- "Gerçek siyah (#000000) arka planda beyaz 96px/330 NeueHaasGrotesk başlıklı, #A1A1AA'da 20px/500 alt başlıklı ve iki pill düğmeli hero bölümü oluşturun: beyaz dolgulu (9999px yarıçap) ve 2px beyaz sınırlı ghost"
- "Deep Teal (#02090A) üzerinde 1px #1E2C31 sınırlı, 12px yarıçaplı, çok katmanlı gölgeli (1px halka + %10 siyahta 2px/4px/8px bulanıklık) 32px/360 beyaz başlık ve 18px/400 #A1A1AA gövde metni içeren özellik kartı tasarlayın"
- "Dark Forest (#061A1C) üzerinde 96px/750 beyaz sayılar (NeueHaasGrotesk), 16px/400 #A1A1AA tanımlayıcı etiketler ve istatistik blokları arasında cömert 64px aralıkla istatistik bölümü oluşturun"
- "Şeffaf arka planlı (kaydırmada #102620 olur) yapışkan nav, sol beyaz Shopify logosu, 0.72px harf aralıklı 18px/500 beyaz nav bağlantıları ve sağda beyaz pill 'Start for free' düğmesi oluşturun"
- "rgba(255,255,255,0.2) buzlu cam arka planlı, 4px yarıçaplı, 12px 16px dolgulu, beyaz 16px metinli etiket/rozet — karanlık kart yüzeyinin üzerinde yüzüyor"

### Yineleme Kılavuzu

Bu tasarım sistemiyle oluşturulan mevcut ekranları geliştirirken:
1. Bir seferde BİR bileşene odaklanın
2. Bu belgeden belirli renk adlarına ve hex kodlarına başvurun
3. Unutmayın: bu KARANLIK-ÖNCE bir tasarım — açık yüzeyler istisnadır, kural değil
4. Görüntüleme metni her zaman tüy-hafif hissettirmelidir (ağırlık 330-400) — ağır görünüyorsa ağırlığı azaltın
5. Neon Green (#36F4A4) kıymetlidir — yalnızca odak ve vurgu için tutumlu kullanın
6. Karanlık yüzey hiyerarşisi (siyah → deep teal → dark forest → forest) ince derinlik yaratır
7. Gölgeler çok katmanlıdır — tek bir `box-shadow` değeri Shopify kart hissini yakalayamaz
8. `ss03` OpenType özelliği tipografik tutarlılık için tüm metinlerde etkin olmalıdır
