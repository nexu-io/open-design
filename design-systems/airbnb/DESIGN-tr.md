# Design System Inspired by Airbnb

> Category: E-Ticaret & Perakende
> Seyahat pazaryeri. Sıcak mercan aksan, fotoğraf odaklı, yuvarlak arayüz.

## 1. Görsel Tema & Atmosfer

Airbnb'nin 2026 tasarımı, tesadüfen bir uygulama olan bir seyahat dergisi gibi hissettiriyor — bembeyaz kanvaslar tam ekran fotoğraflara yer açıyor ve arayüzün kendisi ilanların nefes alabilmesi için siliniyor. Karakteristik Rausch mercan pembesi (`#ff385c`) az ama çarpıcı biçimde kullanılıyor: arama CTA'sı, aktif sekme göstergesi, birincil eylem düğmesi ve zaman zaman fiyat ya da istek listesi kalp simgesi. Geri kalan her şey disiplinli bir gri tonlaması, neredeyse her metin satırını `#222222` taşıyor.

Sistemi tartışmasız Airbnb yapan şey, içeriğe ne kadar *güven* duyduğudur. Mülk fotoğrafları kahraman ölçeğinde, 4:3 oranında kenardan kenara yarıçap işlemiyle gösteriliyor. Kategori değiştirme, 3D renderlanmış çizimli simgeler kullanan (eğimli çatılı bir ev, bir sıcak hava balonu, bir servis zili) üç sekmeli seçici (Evler / Deneyimler / Hizmetler) aracılığıyla gerçekleşiyor — fiziksel, dokunsal, neredeyse oyuncak gibi — net `Airbnb Cereal VF` etiketleriyle eşleştirilmiş. Bu, 3D renderlerin ve saf tipografik arayüzün gerilimsiz bir arada var olduğu nadir bir tüketici ürünüdür.

En yeni yüzey **Deneyimler** ürün hattıdır — aynı krom, ancak daha zengin kart yoğunluğu, daha fazla fotoğraf ve yapışkan sağ rayda fiyatlandırmayla ortalanmış bir rezervasyon paneli. İlan detay sayfaları (hem odalar hem deneyimler) sıkı bir şablonu izliyor: tam ekran kahraman görsel ızgarası → örtüşen yuvarlak rezervasyon kartı (kaydırmada yapışık) → olanaklar → yorumlar (Misafir Favorisi ödülleri, defne çelengi düzeni ile büyük ortalanmış `4.81` derecelendirme kullanıyor) → harita → ev sahibi profili → açıklamalar. Bir oda mı yoksa yat turu mu rezervasyon yaptırdığınız fark etmeksizin ritim tutarlı.

**Temel Özellikler:**
- Rausch mercan pembesi (`#ff385c`) tek aksan marka rengi olarak yalnızca birincil CTA'lar ve arama düğmesi için kullanılıyor
- Birincil görsel kelime hazinesi olarak hafif köşe yuvarlamasıyla (14–20 px) tam ekran 4:3 / 16:9 fotoğrafçılık
- Tipografik sekmelerle eşleştirilen 3D renderlanmış kategori simgeleri — sistemin çizime izin verdiği tek yer
- Her yerde dağılmış dairesel `50%` simge düğmeleri (geri oku, paylaş, favori, karusel okları)
- `Airbnb Cereal VF` 8 px hukuki dipnottan 28 px bölüm başlığına her etiketi taşıyor — tek aile sistemi
- Ürün katmanı renk kodlaması: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (koyu mor `#460479`), Airbnb (Rausch mercanı)
- Misafir Favorisi ödül düzeni — iki defne çelenginin arasında ortalanmış devasa derecelendirme numarası, sistemin en tanınabilir anlarından biri
- Masaüstünde sağ raya sabitlenmiş, mobilde alta sabitlenmiş "Rezervasyon" çubuğuna dönüşen fiyat → tarihler → misafirler yığınlı yapışık rezervasyon paneli
- Aktif durum Rausch rengiyle sabit alt mobil navigasyon (Keşfet / İstek Listeleri / Giriş Yap)

## 2. Renk Paleti & Roller

### Birincil
- **Rausch** (`#ff385c`): Markanın karakteristik mercan pembesi. CSS değişkeni `--palette-bg-primary-core`. Şunlar için kullanılır: birincil "Rezerve Et" düğmesi, arama gönder düğmesi, aktif sekme alt çizgisi, istek listesi kalp dolgusu, fiyat vurgusu. Her sayfada en yüksek görünürlüğe sahip tek renk.

### İkincil & Aksan
- **Deep Rausch** (`#e00b41`): Daha doygun bir varyant. CSS değişkeni `--palette-bg-tertiary-core`. Basılı/aktif düğme durumları ve gradyan uç noktaları için kullanılır.
- **Plus Magenta** (`#92174d`): CSS değişkeni `--palette-bg-primary-plus`. Airbnb Plus ürün katmanının marka rengi — üst düzey küratörlü ilan teklifi.
- **Luxe Purple** (`#460479`): CSS değişkeni `--palette-bg-primary-luxe`. Airbnb Luxe ürün katmanının marka rengi — villa/mülk düzeyinde kiralık.
- **Info Blue** (`#428bff`): CSS değişkeni `--palette-text-legal`. Hukuki/bilgilendirici bağlantılar için kullanılır (şartlar, gizlilik, açıklamalar) — sistemdeki tek monorom olmayan bağlantı rengi.

### Yüzey & Arka Plan
- **Canvas White** (`#ffffff`): Varsayılan sayfa arka planı. Her kart, her kapsayıcı, her detay sayfası buradan başlar.
- **Soft Cloud** (`#f7f7f7`): Alt yüzey tonlaması, altbilgi arka planlarında, harita görünümü sarmalayıcılarında ve birincil beyazdan geri çekilmek isteyen "her şey" bölümlerinde kullanılır.
- **Hairline Gray** (`#dddddd`): Her yerde bulunan 1 px kenarlık rengi — kartları, olanak satırlarını, yorum panellerini, altbilgi sütunlarını ayırır. Düzen sisteminin temel taşı.

### Nötrlер & Metin
- **Ink Black** (`#222222`): CSS değişkeni `--palette-text-primary`. Sistemin neredeyse-siyahı. Her başlık, her metin paragrafı, her gezinme etiketi, her fiyat. Bir sayfadaki tüm metnin ~%90'ı için kullanılır.
- **Charcoal** (`#3f3f3f`): CSS değişkeni `--palette-text-focused`. Odaklanmış durumda giriş metninde ve bir adım aşağıdaki vurgu kopyasında kullanılır.
- **Ash Gray** (`#6a6a6a`): CSS değişkeni `--palette-bg-tertiary-hover`. İkincil etiketler, şehir adlarının altındaki "Yazlık kiralıklar" altyazı stili kopya, sessiz altbilgi bağlantıları.
- **Mute Gray** (`#929292`): CSS değişkeni `--palette-text-link-disabled`. Devre dışı düğmeler ve düşük öncelikli meta veriler.
- **Stone Gray** (`#c1c1c1`): Üçüncül bölücüler, simge çizgileri, yer tutucu avatarlar.

### Anlamsal & Aksan
- **Error Red** (`#c13515`): CSS değişkeni `--palette-text-primary-error`. Form doğrulama hataları, yıkıcı eylem uyarıları.
- **Deep Error** (`#b32505`): CSS değişkeni `--palette-text-secondary-error-hover`. Hata durumlarının basılı/aktif varyantları.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): CSS değişkeni `--palette-text-material-disabled`. Devre dışı materyal stili etiketler.

### Gradyan Sistemi
Airbnb'nin marka gradyanı az miktarda görünür, genellikle yalnızca kelime işareti ve markalı arama düğmesi anında:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Bu mercan → magenta süpürmesi "markalı an"dır — hiçbir zaman tam yüzey olarak kullanılmaz, yalnızca dar bir hap dolgusu veya logo işlemi olarak.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Airbnb Cereal VF** (birincil ve tek): Tüm sistemi taşıyan özel değişken ağırlıklı sans-serif. Yedekler (sırayla): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Çıkarılan tokenlarda gözlemlenen ağırlıklar: 500, 600, 700. 400-regular yok — sistemin "gövde" ağırlığı 500, bu da her metin bloğuna güvenli ve kasıtlı okunan ince bir ekstra yoğunluk veriyor.

OpenType özellikleri: `salt` (stilistik alternatifler) kompakt 11 px ve 14 px 600 ağırlıklı etiketlerde kullanılıyor — muhtemelen daha dar rakamlar ve özel karakter şekillendirmesi için. Bağlaç veya kesir basamak özellikleri gözlemlenmedi.

### Hiyerarşi

| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Bölüm Başlığı | 28 px / 1,75 rem | 700 | 1,43 | 0 | "Gelecekteki kaçamaklar için ilham" — sayfa düzeyinde başlıklar |
| Alt Bölüm Başlığı | 22 px / 1,38 rem | 500 | 1,18 | -0,44 px | "Bu yer neler sunuyor", "Ev sahipleriyle tanışın" — içerik bölücüler |
| Kart Başlığı | 21 px / 1,31 rem | 700 | 1,43 | 0 | Yorum paneli başlıkları, kart ana başlıkları |
| İlan Başlığı | 20 px / 1,25 rem | 600 | 1,20 | -0,18 px | "Küçük Grup Yat Turu, Sınırsız Şarap & Meyve" — detay sayfalarında ilan manşetleri |
| Altyazı Kalın | 16 px / 1,00 rem | 600 | 1,25 | 0 | Ev sahibi adı, şehir adı |
| Gövde Orta | 16 px / 1,00 rem | 500 | 1,25 | 0 | Detay sayfalarında birincil gövde metni |
| Düğme Büyük | 16 px / 1,00 rem | 500 | 1,25 | 0 | "Rezerve Et", "Ev sahibi ol" |
| Düğme Varsayılan | 14 px / 0,88 rem | 500 | 1,29 | 0 | Standart düğme etiketleri |
| Bağlantı | 14 px / 0,88 rem | 500 | 1,43 | 0 | Gezinme bağlantıları, altbilgi bağlantıları |
| Altyazı Orta | 14 px / 0,88 rem | 500 | 1,29 | 0 | Meta veriler, altyazı satırları ("Yazlık kiralıklar", "Villa kiralıklar") |
| Altyazı Kalın | 14 px / 0,88 rem | 600 | 1,43 | 0 | `salt` özelliği etkin — sayısal istatistikler, küçük metin vurgusu |
| Altyazı Küçük | 13 px / 0,81 rem | 400 | 1,23 | 0 | Yorum tarihleri, mikro meta veriler |
| Mikro Varsayılan | 12 px / 0,75 rem | 400 | 1,33 | 0 | Altbilgi sorumluluk reddiyeleri, yasal mikro metin |
| Mikro Kalın | 12 px / 0,75 rem | 700 | 1,33 | 0 | "YENİ" hap etiketleri |
| Rozet Büyük Harf | 11 px / 0,69 rem | 600 | 1,18 | 0 | `salt` özelliği — kompakt kategori/durum rozetleri |
| Üst Simge | 8 px / 0,50 rem | 700 | 1,25 | 0,32 px | Büyük harf — fiyat dipnotları, ondalık kuyruklar |

### İlkeler
- **Bir aile, çok ağırlık.** Airbnb Cereal VF 8 px hukuki metinden 28 px sayfa başlıklarına her şeyi yönetir — görsel kimlik ailenin kendisinden gelir, yazı tipi karışımından değil.
- **500 yeni 400'dür.** Sistemin "normal" ağırlığı 500'dür; bu, her paragrafa web varsayılanından biraz daha güvenli bir doku verir.
- **Negatif tracking yalnızca ekran tipinde.** 20 px ve üzeri başlıklar, oyulmuş hissi için tracking'i -0,18 ile -0,44 px arasında sıkıştırır; gövde boyutları okunabilirlik için 0 tracking'de kalır.
- **Başlıklar için sıkı satır yükseklikleri, gövde için cömert.** Ekran tipleri 1,18–1,25 arasında çalışır (sıkı); gövde ve altyazılar uzun form konforu için 1,43'e açılır.
- **8 px dışında tamamen büyük harf yok.** Sistemdeki tek büyük harf dönüşümü 8 px üst simgesidir — her yerde başlık büyüklüğü ince ağırlık kaymaları ile çalışır.

### Yazı Tipi Alternatifleri Hakkında Not
Airbnb Cereal VF özeldir. En yakın açık kaynak alternatifi **Circular Std** (hâlâ ticari) veya **Inter** (ücretsiz, Google Fonts) ile ekran boyutlarında harf aralığı -0,01 em azaltılmış olarak. Sıkı marka sadakati için belgelenen yedek zinciri (`Circular, -apple-system, system-ui`) macOS/iOS'ta `system-ui`'ın benzer proporlara sahip San Francisco'ya çözüldüğü yerde kabul edilebilir biçimde render edilir.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil CTA** ("Rezerve Et", "Ara", "Tarih ekle")
- Arka plan: Rausch `#ff385c`
- Metin: Canvas White `#ffffff`, Airbnb Cereal 500, 16 px
- Dolgu: ~14 px dikey, 24 px yatay
- Yarıçap: 8 px (dikdörtgen) veya %50 (dairesel simge varyantı)
- Kenarlık: yok
- Aktif/basılı: `transform: scale(0.92)` artı `0 0 0 2px` konumunda 2 px `#222222` odak halkası

**İkincil Düğme** ("Ev sahibi ol", kenarlıklı üçüncül eylemler)
- Arka plan: `#ffffff`
- Metin: Ink Black `#222222`, Airbnb Cereal 500, 14–16 px
- Dolgu: 10 px 16 px
- Yarıçap: 20 px (hap) veya 8 px (dikdörtgen)
- Kenarlık: 1 px solid Hairline Gray `#dddddd`

**Yalnızca Simge Dairesel Düğme** (geri oku, paylaş, favori, karusel kontrolleri)
- Arka plan: `#f2f2f2` (hafif beyaz dışı) veya 1 px yarı saydam siyah kenarlıklı beyaz
- Simge: `#222222` kontur çizgisi, 16–20 px
- Boyut: 32–44 px çap
- Yarıçap: %50
- Aktif/basılı: `transform: scale(0.92)`; renkli fotoğraf arka planlarından ayırmak için `0 0 0 4px rgb(255,255,255)` ince 4 px beyaz halka

**Devre Dışı Düğme**
- Arka plan: `#f2f2f2`
- Metin: Stone Gray `#c1c1c1`
- Opaklık: 0,5

**Hap Sekme Düğmesi** (kategori seçici "Evler / Deneyimler / Hizmetler")
- Arka plan: şeffaf
- Metin: Ink Black `#222222`, Airbnb Cereal 500, 16 px
- Dolgu: 8 px 14 px
- Aktif durum: etiketin altında 2 px Ink Black alt çizgisi
- Etiketin üstünde 36–48 px 3D renderlanmış çizimli simge ile eşleştirilmiş

### Kartlar & Kapsayıcılar

**İlan Kartı** (ana sayfa ızgarası, arama sonuçları)
- Arka plan: `#ffffff`
- Yarıçap: görüntüde 14 px, metin şeffaf arka plan üzerinde doğrudan altında oturur
- Görsel: 4:3 en-boy oranı, tam ekran, aynı 14 px yarıçapla yuvarlatılmış
- Dolgu: dış kapsayıcıda yok; görsel ile meta veri satırları arasında 12 px aralık
- Gölge: yok — ayırma boşluktan ve fotoğrafın içsel yarıçapından gelir
- Meta veri deseni: Şehir/bölge 1. satırda (16 px 600), mesafe/süre 2. satırda (14 px 500 Ash Gray), tarih aralığı 3. satırda, altta "gecelik" ile fiyat satırı

**Detay Sayfası Rezervasyon Paneli** (oda/deneyim sayfalarında yapışık sağ ray)
- Arka plan: `#ffffff`
- Yarıçap: 14–20 px
- Kenarlık: 1 px solid Hairline Gray `#dddddd`
- Gölge: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — üç katmanlı yığılmış ince yükseltme
- Dolgu: 24 px
- Genişlik: ~370 px, görüntü alanının üstünden 120–140 px aşağıya sabitlenmiş
- İçerik: fiyat başlığı → tarih seçici → misafir açılır listesi → birincil CTA → "Henüz ücret alınmayacak" dipnotu

**Olanak Izgarası Kartı** (ilan detay sayfalarında)
- Arka plan: `#ffffff`
- Kenarlık: satır düzeyinde 1 px solid Hairline Gray `#dddddd` (öğe başına değil)
- Dolgu: olanak satırı başına 16 px dikey
- Simge + etiket deseni: solda 24 px kontur simge, sağda 16 px 500 ağırlıklı etiket

**Yorum Kartı** (detay sayfalarında bireysel yorum)
- Arka plan: `#ffffff`, kenarlık yok
- Dolgu: 0 (ızgara boşluklarına dayanır)
- İçerik: 40 px dairesel avatar + 16 px 600 ağırlıklı isim + 14 px 400 Ash Gray tarih tek satırda, ardından altında 14 px 500 gövde paragrafı

### Girdiler & Formlar

**Arama Çubuğu** (birincil ana sayfa)
- Arka plan: `#ffffff`
- Kenarlık: üç segmentin tamamını (Nerede / Ne Zaman / Kim) çevreleyen 1 px solid Hairline Gray `#dddddd`
- Yarıçap: 32 px (tam hap)
- Gölge: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — ince yüzer his
- Yapı: ince dikey bölücülerle ayrılan üç segment, her segmentin 14 px 500 yer tutucu üstünde 12 px 500 etiketi var
- Gönder: sağ kenarda Rausch dairesel simge düğmesi, 48 px çap

**Metin Girişi** (genel formlar)
- Arka plan: `#ffffff`
- Kenarlık: 1 px solid Hairline Gray `#dddddd`
- Yarıçap: 8 px
- Dolgu: 14 px 16 px
- Odak: kenarlık Ink Black'e geçer, `0 0 0 2px` siyah dış halka ekler
- Hata: kenarlık `#c13515`'e (Error Red) geçer, yardım metni aynı rengi kullanır

**Tarih Seçici**
- Takvim ızgarası: 7 sütunlu düzen, dairesel `%50` gün hücreleri 40–44 px genişliğinde
- Seçili aralık: beyaz rakamlarla Ink Black `#222222` arka plan
- Başlangıç/bitiş çapaları: daha büyük dolu daireler; orta tarihler Soft Cloud `#f7f7f7` tonlaması kullanır

### Navigasyon

**Üst Gezinme (Masaüstü)**
- Yükseklik: ~80 px
- Arka plan: `#ffffff`
- Sol: Rausch'ta Airbnb kelime işareti+logo düzeni (102×32 px)
- Orta: üç sekmeli kategori seçici (Evler / Deneyimler / Hizmetler) 16 px 500 etiketlerin üstünde yığılmış 36–48 px 3D simgelerle; aktif sekmenin 2 px Ink Black alt çizgisi var
- Sağ: "Ev sahibi ol" metin bağlantısı, ardından 32 px dairesel küre (dil), ardından 36 px hamburger avatar menüsü
- Alt kenarlık: 1 px solid Hairline Gray `#dddddd`

**Üst Gezinme (Mobil)**
- Tek satırlık arama hapı tam genişliği kaplar: küçük büyüteç simgesiyle "Aramanıza başlayın" yer tutucusu
- Altında: üç sekmeli kategori seçici devam eder (Evler / Deneyimler / Hizmetler) — çizimli simgeler ~28 px'e küçülür
- Alta sabitlenmiş sekme çubuğu: Keşfet (aktif durum Rausch) / İstek Listeleri / Giriş Yap — 24 px simgelerin üstünde 12 px etiketler

**İlan Detay İkincil Gezinme**
- Kahraman görselinin ötesine kaydırıldığında görünen çapa bağlantılarının (Fotoğraflar · Olanaklar · Yorumlar · Konum · Ev Sahibi) yapışık yatay kaydırması
- Yükseklik: 56 px
- Alt kenarlık: 1 px solid Hairline Gray

### Görsel İşleme

- **Birincil en-boy oranları**: ana sayfa ilan ızgaraları için 4:3, deneyim kahraman fotoğrafçılığı için 16:9, avatarlar için 1:1
- **Yarıçap**: ilan ızgara görsellerinde 14 px, detay sayfası kahraman fotoçerçevelerinde 20 px, avatarlarda `%50`
- **Detay sayfalarında görsel ızgarası**: solda tek büyük görsel (%50 genişlik) ve sağda 2×2 ızgarasında dört küçük fotoğraf, hepsi 20 px dış yuvarlak kapsayıcıyı paylaşır
- **Geç yükleme**: `loading="lazy"` yaygın kullanımı, önce bulanık yer tutucu önizlemeler
- **Karusel**: görsel üzerinde dikey olarak ortalanmış dairesel 32 px ok düğmeleri; nokta göstergeleri alt kenarın 12 px üstünde oturur

### İmza Bileşenleri

**Misafir Favorisi Ödül Düzeni** (yüksek puanlı ilan detay sayfalarında belirgin biçimde gösterilir)
- 44–56 px 700 ağırlıkta render edilmiş ortalanmış derecelendirme numarası
- ~48 px yükseklikte sol ve sağı çerçeveleyen iki el çizimi defne çelengi SVG çizimi
- Altında: `0,32 px` tracking ile 12 px 700 büyük harf "Misafir Favorisi" etiketi ve 14 px 500 Ash Gray kısa alt etiket
- Tam genişlik blok, kapsayıcı kenarlığı yok — doğrudan beyaz kanvas üzerinde oturur

**Üç Sekmeli Kategori Seçici** (her göz atma yüzeyinin üst kısmında görünür)
- Üç sekme: Evler / Deneyimler / Hizmetler
- Her sekme: 16 px 500 etiketin üstünde 3D renderlanmış çizimli simge (~48 px yükseklik)
- Deneyimler ve Hizmetler şu anda simgenin sağ üstünde yüzen küçük lacivert "YENİ" hap (koyu mavi arka planda 12 px 700 beyaz metin) taşıyor
- Aktif sekme: etiketin altında 2 px Ink Black alt çizgisi

**İlham Şehirleri Izgarası** (ana sayfa "Gelecekteki kaçamaklar için ilham")
- Masaüstünde hedef bağlantılarının 6 sütunlu ızgarası, mobilde 2 sütun
- Her hücre: 1. satırda 16 px 600 şehir adı, 2. satırda 14 px 500 Ash Gray kiralama türü altyazısı ("Yazlık kiralıklar", "Villa kiralıklar")
- Görsel yok — yalnızca metin ızgarası
- Üstte kategoriye göre sekme (Popüler / Sanat ve kültür / Plaj / Dağlar / Açık hava / Yapılacaklar / Seyahat ipuçları ve ilham / Airbnb dostu daireler) — aktif sekmenin 2 px alt çizgisi ve ağırlık kayması var

**Yapışık Rezervasyon Kartı** (ilan detay sayfaları)
- Masaüstünde kullanıcı kahramanın ötesine kaydırırken görüntü alanının üstünden 120 px aşağıda sabit kalır
- Mobilde "X$ başlayarak / gece" etiketiyle Rausch "Rezerve Et" hapıyla tam genişlik alt çubuğuna katlanır
- Her zaman gösterir: fiyat başlığı → tarih görüntüsü → misafir seçici → Rausch CTA → "Henüz ücret alınmayacak" sorumluluk reddi

**Deneyim Ev Sahibi Kartı** (deneyim detay sayfaları)
- Üstte 3:2 kapak fotoğrafıyla tam genişlik yuvarlak kapsayıcı
- Ev sahibi avatarı (dairesel, 56 px) kapağın alt kenarını %50 oranında örtüyor
- Örtüşmenin altında: 16 px 700'de ev sahibi adı, 14 px 500 Ash Gray'de ev sahibi hizmet süresi, küçük Rausch "Ev sahibine mesaj at" hap düğmesi
- Yorumlar ile olanaklar/konum bloğu arasındaki geçiş olarak kullanılır

**"Bilinmesi Gerekenler" Şeridi** (ilan detay sayfaları)
- Kural/politika bloklarının 3 sütunlu ızgarası (Ev kuralları, Güvenlik ve mülk, İptal politikası)
- Her sütun: üstte simge, 16 px 600 başlık, 14 px 500 Ash Gray gövde, Ink Black alt çizgisinde "Daha fazla göster" bağlantısı
- Ayırıcı: genel şeridin üst ve alt kenarında 1 px Hairline Gray

## 5. Düzen İlkeleri

### Aralık Sistemi
- **Temel birim**: 8 px
- **Çıkarılan ölçek**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32 px — piksel mükemmel simge hizalaması için bir avuç ızgara dışı değerle ince taneli
- **Bölüm dolgusu**: masaüstünde ~48–64 px üst/alt, mobilde 24–32 px
- **Kart iç dolgusu**: rezervasyon panellerinde ve büyük kartlarda 24 px, olanak satırlarında 16 px, ilan kartı meta verilerinde 12 px
- **İlan kartları arasındaki kanal**: masaüstünde 24 px, mobilde 16 px
- **Yığılmış metin satırları arasında**: 4–8 px (çok sıkı — seyahat ilanlarının "yoğun bilgi" hissini pekiştirir)

### Izgara & Kapsayıcı
- **Maksimum içerik genişliği**: ultra-geniş ekranlarda 1760–1920 px (Airbnb ızgaranın çoğu siteden daha geniş nefes almasına izin verir); çoğu detay sayfasında 1280 px
- **Ana sayfa ilan ızgarası**: ≥1760 px'de 6 sütun, ≥1440 px'de 5, ≥1128 px'de 4, ≥800 px'de 3, ≥550 px'de 2, altında 1
- **Detay sayfası**: asimetrik 2 sütun — ana içerik ~%58, sağda yapışık rezervasyon paneli ~%36, ~%6 kanal
- **Altbilgi**: 3 sütun Destek / Hosting / Airbnb

### Boşluk Felsefesi
Airbnb yoğun bilgi verici ama hiçbir zaman sıkışık değil. Boşluk *gruplamak* için kullanılır — her fotoğrafın ayrı bir nesne olarak okunması için ilan kartlarının 24 px kanalı var, ancak her kartın altındaki meta veriler 4–8 px boşluklar kullanıyor, böylece fiyat/şehir/tarih tek bir birim gibi hissettiriyor. Detay sayfası rezervasyon panelinin 24 px iç dolgusu var, ancak içindeki satırlar (tarih seçici, misafir seçici, CTA) 12 px'de yığılmış — kart ile sayfa arasındaki sınır içindeki içerikten daha fazla ayırma işi yapıyor.

### Kenarlık Yarıçapı Ölçeği
| Yarıçap | Kullanım |
|--------|-----|
| 4 px | Satır içi çapa etiketleri, etiket yongaları |
| 8 px | Metin düğmeleri, açılır listeler, küçük yardımcı düğmeler |
| 14 px | İlan kartı fotoğrafçılığı, genel içerik kapsayıcıları, rozetler |
| 20 px | Birincil yuvarlak düğmeler (hap şekli), büyük görseller, rezervasyon paneli |
| 32 px | Arama çubuğu hapı, ekstra büyük kapsayıcılar |
| %50 | Tüm dairesel simge düğmeleri, tüm avatarlar, istek listesi kalpleri — sistemin imza yuvarlak geometrisi |

## 6. Derinlik & Yükseltme

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| 0 | Gölge yok | İlan kartları, gövde içeriği, yalnızca metin bölümleri |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Aktif/basılı simge düğmeleri (örn. geri, paylaş, favori) — etkileşimi belirtmek için ince kaldırma |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Yapışık rezervasyon paneli kartı, modallar, açılır menüler — sistemin imza üç katmanlı yükseltmesi |
| Odak Halkası | `0 0 0 2px #222222` | Aktif durumlu düğmeler, odaklanmış arama girişi |
| Beyaz Ayırıcı Halka | `rgb(255, 255, 255) 0 0 0 4px` | Fotoğraflar üzerine yer alan dairesel düğmeler — 4 px beyaz halka düğmeyi renkli görsel arka planlarından temizce ayırır |

Gölge felsefesi: Airbnb tek bir düşen gölge yerine **yığılmış katmanlı gölgeler** kullanır. Üç katmanlı rezervasyon paneli gölgesi tek bir tutarlı kaldırma olarak okunur ancak aslında farklı opaklık/bulanıklık değerlerinde üç ayrı gölgedir — gölgenin çevresinde ağır hissettirmeden premium hissettiren ince kenar yumuşatma oluşturur.

### Dekoratif Derinlik
- **Derinlik olarak fotoğrafçılık**: sistem görsel derinlik oluşturmak için tam ekran fotoğrafçılığa büyük ölçüde dayanır; fotoğrafların ağır işi yapması için gölgeler ve gradyanlar az kullanılır
- **Defne çelengi düzeni**: Misafir Favorisi ödülü, aksi halde düz olan derecelendirme numarasına törensel, kupa benzeri bir varlık kazandıran iki SVG defne çelengi çizimi kullanır
- **3D renderlanmış kategori simgeleri**: Evler/Deneyimler/Hizmetler simgelerinin sanat eserine fırınlanmış kendi yumuşak iç aydınlatmaları ve ince gölgeleri var — markanın "boyutsal" çizime izin verdiği tek yer

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Rausch `#ff385c`'yi birincil eylemler ve aktif sekme göstergesi için ayırın — dekoratif kullanımlarla asla seyreltilemez.
- Fotoğraflara nefes aldırın — 14–20 px yuvarlak köşeli 4:3 kesimler, üzerine bindirilen metin yok, gradyan örtücü yok.
- Rausch'un altındaki her metin katmanı için Ink Black `#222222` kullanın — bu sistemin neredeyse-siyahıdır, gerçek `#000000` asla kullanılmaz.
- Üç sekmeli kategori seçicinin 3D çizimli simgelerini düz tipografiyle eşleştirin — tek bir yüzeyde çizim stillerini karıştırmayın.
- İmza rezervasyon paneli yükseltmesini oluşturmak için üç düşük opaklıklı gölge (~%2, %4, %10) yığın.
- Her kart-karttan ve satır-satırdan bölücü için Hairline Gray `#dddddd` 1 px kenarlıklar kullanın.
- Rezervasyon panelini masaüstünde yapışık, mobilde alta sabitlenmiş rezervasyon çubuğuna katlanan olarak değerlendirin.
- Meta veri grupları içinde 4–8 px aralık ve kartlar arasında 24 px kullanın — bilgi yoğunluğu kasıtlıdır.

### Yapılmayacaklar
- Rausch / Plus Magenta / Luxe Purple ürün katmanı paletinin dışında ikincil aksan renkler eklemeyin.
- Fotoğrafların içine metin yerleştirmeyin — altyazılar her zaman görüntünün altında oturur, asla üzerine bindirilmez.
- Tek 8 px üst simge rolü dışında tamamen büyük harf etiketler kullanmayın.
- Simge düğmelerini %50 dışında herhangi bir şeye yuvarlamayın — dairesel sistemin imza geometrisidir.
- İlan kartlarına düşen gölgeler eklemeyin — yükseltme olmadan beyaz kanvas üzerinde otururlar.
- Gradyan arka planlar kullanmayın — sistemdeki tek gradyan kelime işaretindeki dar Rausch → magenta süpürmesidir.
- 400-normal yazı tipi ağırlığı kullanmayın — Airbnb Cereal'ın gövde ağırlığı 500'dür.
- Airbnb Cereal VF'yi farklı bir ekran yüzüyle geçersiz kılmayın — sistem kasıtlı olarak tek ailelidir.

## 8. Duyarlı Davranış

### Kesme Noktaları

Airbnb ~60 kesme noktası bildirir (bileşen kitaplığından tasarım zamanı artefaktı), ancak anlamlı düzen kaymaları çok daha küçük bir kümede gerçekleşir:

| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Ultra-geniş | ≥1760 px | 6 sütunlu ilan ızgarası, 1760–1920 px maksimum içerik genişliği |
| Masaüstü XL | 1440–1759 px | 5 sütunlu ızgara, tam gezinme görünür, sağ rayda yapışık rezervasyon paneli |
| Masaüstü | 1128–1439 px | 4 sütunlu ızgara, yapışık rezervasyon paneli devam eder |
| Dizüstü | 1024–1127 px | 3–4 sütunlu ızgara, kategori gezinmesi yatay kalır |
| Tablet | 800–1023 px | 3 sütunlu ızgara, küresel arama tek satırlık hapa katlanabilir |
| Küçük tablet | 550–799 px | 2 sütunlu ızgara, rezervasyon paneli tam genişlik satır içi bloğa düşer |
| Mobil | 375–549 px | 1 sütunlu yığılmış düzen, alta sabitlenmiş sekme çubuğu görünür (Keşfet / İstek Listeleri / Giriş Yap) |
| Küçük mobil | <375 px | Kenar dolgusu 16 px'e sıkılaşır; kategori seçici simgeleri ~28 px'e küçülür |

### Dokunma Hedefleri
Tüm etkileşimli öğeler 44×44 px'i karşılar veya aşar. Dairesel simge düğme ailesi özellikle 8–12 px genişletilmiş isabet alanı dolgusuyla 32–44 px boyutlandırılmıştır. Birincil Rausch Rezerve Et düğmesi ~48 px yüksekliğinde. Üç sekmeli kategori seçicinin isabet alanı tam etiket-artı-simge dikdörtgenidir (genellikle sekme başına ~64×80 px).

### Katlama Stratejisi
- **Gezinme**: Üst gezinme, tablette ve üzerinde Airbnb kelime işaretini + üç sekmeli seçiciyi tutar; mobilde seçici arama hapının hemen altına kayar ve küre/avatar kontrolleri alta sabitlenmiş sekme çubuğuna taşınır.
- **Arama çubuğu**: Masaüstünde Rausch dairesel gönder düğmesiyle üç segmentli hap (Nerede / Ne Zaman / Kim); mobilde tek satırlık "Aramanıza başlayın" hapına katlanır, üzerine dokunmak tam ekran arama sayfası açar.
- **Rezervasyon paneli**: ≥1128 px'de yapışık sağ ray; 800–1127 px arasında ana içerik sütununda satır içi; <800 px'de alta sabitlenmiş "Rezerve Et" hapı.
- **İlan ızgarası**: Kesme noktaları arasında 6 → 5 → 4 → 3 → 2 → 1 sütun yeniden akar.
- **Detay sayfası görsel ızgarası**: Masaüstünde beş görsel düzeni (1 büyük + 4 küçük); mobilde sayfa nokta göstergeleriyle kaydırılabilir tam ekran karusel haline gelir.
- **Altbilgi**: 3 sütunlu düzen <800 px'de yığılmış tek sütuna katlanır.

### Görsel Davranışı
- Önce sunulan `im_w=` URL parametreli bulanık önizleme küçük resimleriyle evrensel `loading="lazy"`
- Duyarlı görüntüler genişliğe dayalı teslimat için `im_w` sorgu parametresiyle Airbnb'nin `muscache.com` CDN'ini kullanır (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Sanat yönetimi kırpma yok — aynı görsel kesme noktaları arasında büyütülür/küçültülür
- Karusel, kaynak en boyundan bağımsız olarak tutarlı 4:3 oranını korumak için fotoğraf yüksekliğini otomatik ilerlетir

## 9. Ajan Yönlendirme Kılavuzu

### Hızlı Renk Referansı
- Birincil CTA: "Rausch (#ff385c)"
- Sayfa arka planı: "Canvas White (#ffffff)"
- Alt yüzey: "Soft Cloud (#f7f7f7)"
- Başlık/gövde metni: "Ink Black (#222222)"
- İkincil metin: "Ash Gray (#6a6a6a)"
- Kenarlık/bölücü: "Hairline Gray (#dddddd)"
- Hata: "Error Red (#c13515)"
- Bilgi bağlantısı: "Info Blue (#428bff)"
- Luxe katman aksanı: "Luxe Purple (#460479)"
- Plus katman aksanı: "Plus Magenta (#92174d)"

### Örnek Bileşen Yönlendirmeleri
- "Birincil Rezerve Et düğmesi oluşturun: Rausch (`#ff385c`) arka plan, 16 px'te beyaz Airbnb Cereal 500 ağırlıklı etiket, 14 px × 24 px dolgu, 8 px kenarlık yarıçapı, gölge yok. Aktif/basılı durumda 2 px Ink Black odak halkasıyla (`0 0 0 2px #222222`) `transform: scale(0.92)` ekleyin."
- "14 px kenarlık yarıçaplı 4:3 tam ekran fotoğrafla ilan kartı oluşturun, kapsayıcı gölgesi yok; görüntünün altında 4 px boşluklarla üç metin satırı yığın: 16 px 600 Ink Black'te şehir adı, 14 px 500 Ash Gray'de (`#6a6a6a`) kiralama türü ve 14 px `gecelik` sonekiyle 16 px 500 Ink Black'te fiyat aralığı."
- "Yapışık rezervasyon paneli tasarlayın: beyaz arka plan, 14 px kenarlık yarıçapı, 1 px Hairline Gray (`#dddddd`) kenarlık, 3 katmanlı yükseltme gölgesi (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), 24 px dolgu, 370 px genişlik, masaüstünde görüntü alanının üstünden 120 px aşağıda sabitlenmiş. İçerik: fiyat başlığı, tarih seçici, misafir açılır listesi, Rausch birincil CTA ve 12 px Ash Gray `Henüz ücret alınmayacak` sorumluluk reddi."
- "Üç sekmeli kategori seçici oluşturun: Evler, Deneyimler, Hizmetler etiketli eşit genişlikte üç sekme; her sekmenin 16 px 500 Ink Black etiketinin üstünde ~48 px 3D renderlanmış çizimli simgesi (ev, balon, zil) var; aktif sekme 2 px Ink Black alt çizgisi alır; Deneyimler ve Hizmetler simgelerinin sağ üstüne koyu lacivert arka planda küçük 12 px 700 beyaz `YENİ` hap ekleyin."
- "Misafir Favorisi ödül düzeni render edin: ~48 px yüksekliğinde el çizimi SVG defne çelenkleriyle sol ve sağda flanklanan 52 px 700 ağırlıklı Ink Black ortalanmış derecelendirme numarası; altında 0,32 px tracking'li 12 px 700 büyük harf `MİSAFİR FAVORİSİ` etiketi; 14 px 500 Ash Gray alt etiket; kapsayıcı kenarlığı olmadan doğrudan beyaz kanvas üzerinde oturan tam genişlik blok."

### Yineleme Kılavuzu
Bu tasarım sistemiyle oluşturulmuş mevcut ekranları geliştirirken:
1. Aynı anda TEK bileşene odaklanın.
2. Bu belgeden özel renk adlarına ve hex kodlarına bakın (örn. "Ink Black #222222", "koyu gri" değil).
3. Ölçümlerin yanı sıra doğal dil açıklamaları kullanın ("ince üç katmanlı yükseltme", uzun bir gölge dizesi yerine).
4. İstenilen "hissi" tarif edin ("dergi gibi, fotoğraf önce" vs. "yoğun araç").
5. Her zaman gövde için Airbnb Cereal VF 500 ağırlık ve vurgu için 600–700 varsayılanını kullanın — 400 asla kullanılmaz.
6. Rausch pembesi nadir tutun — görüntü alanı başına birden fazla Rausch renkli öğe görünürse, birinin nötralize edilip edilmeyeceğini düşünün.

### Bilinen Boşluklar
- **Ana sayfa ilan ızgarası kartları**: ana mülk kartı ızgarası (airbnb.com'un birincil görsel yüzeyi) çıkarılan ana sayfa ekran görüntülerinde tam olarak yakalanmadı — içerik yalnızca kısmen yüklendi. Yukarıdaki İlan Kartı özellikleri İlham ızgara yapısından ve Airbnb'nin daha geniş kurallarından çıkarılmıştır; üretim kullanımından önce kesin en-boy oranlarını ve meta veri hiyerarşisini canlı siteye karşı doğrulayın.
- **Deneyimler kategori simgeleri**: Evler / Deneyimler / Hizmetler için 3D çizimli simgeler raster varlıklar olarak sunulur; tam kaynak dosya özellikleri (SVG vs PNG, render edilmiş piksel boyutları) burada belgelenmemiştir.
- **Animasyon ve geçiş zamanlamaları**: yakalanmadı — statik çıkarma kapsamı.
- **Karanlık mod**: Airbnb çıkarılan ürün yüzeylerinde yerel karanlık mod sunmaz; bu belge yalnızca tek açık mod temasını açıklar.
