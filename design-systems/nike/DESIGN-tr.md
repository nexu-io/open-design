# Nike'den İlham Alan Tasarım Sistemi

> Category: E-Ticaret & Perakende
> Atletik perakende. Tek renkli arayüz, büyük harf büyük tipografi, tam ekran fotoğrafçılık.

## 1. Görsel Tema & Atmosfer

Nike.com, kinetik bir perakende katedrali — sporun patlayıcı enerjisini dijital bir alışveriş deneyimine aktaran bir site. Tasarım, radikal sadelik ilkesi üzerine işliyor: atletik fotoğrafçılığın ve ürün renginin rakipsiz hâkim olabilmesi için her şeyi siyah, beyaz ve griye indirgiyor. Ortaya çıkan şey bir web sitesinden çok, lüks bir derginin hassasiyetiyle düzenlenmiş bir spor editöryeli gibi hissettiriyor. Alanın her pikselinde ya ürün satılıyor ya da ürüne doğru yönlendiriliyor.

"Podium CDS" (Nike'ın dahili Çekirdek Tasarım Sistemi), agresif biçimde tek renkli bir zemin oluşturuyor. Arayüz, siyah (`#111111`) metin ve beyaz yüzeyler içinde kayboluyor; hero fotoğrafçılığı — terleyen sporcular, havada ayakkabılar, stat enerjisi — duygusal ağırlığı taşıyor. Arayüzde renk göründüğünde neredeyse yalnızca işlevsel: hatalar için kırmızı, bağlantılar için mavi, başarı için yeşil. Renk hikâyesi ürünün kendisine ait. Bu kısıtlama görsel bir paradoks yaratıyor: İnternetteki en renkli sayfalar en minimal hissettiriyor, çünkü bütün canlılık arayüzden değil, mağaza ürünlerinden geliyor.

Tipografi sistemi, Nike'ın görsel kimliğinin diğer yarısı. Nike Futura ND'deki — inanılmaz sıkı satır aralığıyla (0.90) kullanılan, Nike'a özel dar bir Futura varyantı — devasa büyük harfli başlıklar, hero görselleri üzerinden tipografik bir şok dalgası gibi vuruyor. Başlıkların altında, işyükü niteliğindeki Helvetica Now ailesi navigasyondan ürün açıklamalarına kadar her şeyi İsviçre hassasiyetiyle karşılıyor. İfade edici display tipi ile işlevsel body tipi arasındaki bu ayrım, Nike'ın marka dualitesini yansıtıyor: ilham ile yürütme bir arada.

**Temel Özellikler:**
- Ürün fotoğrafçılığının tek renk kaynağı olmasını sağlayan tek renkli arayüz (siyah/beyaz/gri)
- Hero görselleri üzerinden vuran devasa büyük harfli display tipografisi (96px, line-height 0.90)
- Kenar yarıçapı olmayan tam ekran fotoğrafçılık — görseller mevcut her kenarı dolduruyor
- Birincil etkileşimli öğe olarak hap şekilli düğmeler (30px yarıçap)
- Atletik disiplinle 8px aralık ızgarası — her ölçüm sisteme yapışıyor
- Büyük navigasyon görsel kartlarıyla kategori odaklı alışveriş mimarisi
- Gölgesiz, minimum kenarlıklı yükseklik modeli — yüzey farklılaşması yalnızca gri geçişlerle

## 2. Renk Paleti & Rolleri

### Birincil

- **Nike Siyahı** (`#111111`): Temel — birincil metin, düğme arka planları, nav metni, hero kaplamaları. Kasıtlı olarak saf siyah (#000000) değil; okuma deneyimini biraz daha yumuşatıyor
- **Nike Beyazı** (`#FFFFFF`): Birincil sayfa tuvali, koyu zemin üzerindeki düğme metni, kart yüzeyleri, nav çubuğu arka planı

### Yüzey & Arka Plan

- **Snow** (`#FAFAFA`): En açık yüzey, neredeyse beyaz ince farklılaşma (--podium-cds-color-grey-50)
- **Açık Gri** (`#F5F5F5`): İkincil arka plan, arama girişi dolgusu, görsel yer tutucusu, yükleme iskeleti (--podium-cds-color-grey-100)
- **Hover Gri** (`#E5E5E5`): Hover durum arka planı, devre dışı düğme dolgusu (--podium-cds-color-grey-200)
- **Koyu Yüzey** (`#28282A`): Koyu/ters çevrilmiş bölümlerde birincil arka plan (--podium-cds-color-grey-800)
- **Derin Antrasit** (`#1F1F21`): Ters birincil arka plan, en koyu siyah olmayan yüzey (--podium-cds-color-grey-900)
- **Koyu Hover** (`#39393B`): Koyu arka planlardaki hover durumu (--podium-cds-color-grey-700)

### Nötrler & Metin

- **Birincil Metin** (`#111111`): Ana gövde metni, başlıklar, nav bağlantıları (--podium-cds-color-text-primary)
- **İkincil Metin** (`#707072`): Açıklayıcı kopya, meta veri, zaman damgaları, fiyat etiketleri (--podium-cds-color-text-secondary)
- **Devre Dışı Metin** (`#9E9EA0`): Etkin olmayan öğeler, kullanılamaz seçenekler (--podium-cds-color-text-disabled)
- **Devre Dışı Ters** (`#4B4B4D`): Koyu arka planlardaki devre dışı metin (--podium-cds-color-text-disabled-inverse)
- **Kenarlık Birincil** (`#707072`): Standart kenarlık rengi, ikincil metinle eşleşiyor
- **Kenarlık İkincil** (`#CACACB`): İnce kenarlıklar, girdi kenarlıkları, bölücü çizgiler (--podium-cds-color-grey-300)
- **Kenarlık Devre Dışı** (`#CACACB`): Etkin olmayan kenarlık durumu
- **Kenarlık Aktif** (`#111111`): Aktif/odaklanmış kenarlık, birincil metinle eşleşiyor

### Anlamsal & Vurgu

- **Nike Kırmızısı** (`#D30005`): Kritik hatalar, indirim rozetleri, acil bildirimler (--podium-cds-color-red-600)
- **Parlak Kırmızı** (`#EE0005`): Red-500, vurgu için biraz daha açık kırmızı
- **Nike Turuncu Rozet** (`#D33918`): Rozet metni, promosyon çağrıları (--podium-cds-color-text-badge)
- **Turuncu Flaş** (`#FF5000`): İfade edici turuncu vurgu (--podium-cds-color-orange-400)
- **Başarı Yeşili** (`#007D48`): Onay, kullanılabilirlik, olumlu durumlar (--podium-cds-color-green-600)
- **Başarı Ters** (`#1EAA52`): Koyu arka planlarda başarı (--podium-cds-color-green-500)
- **Bağlantı Mavisi** (`#1151FF`): Metin bağlantıları, bilgi vurguları (--podium-cds-color-blue-500)
- **Bilgi Ters** (`#1190FF`): Koyu arka planlarda bağlantılar (--podium-cds-color-blue-400)
- **Uyarı Sarısı** (`#FEDF35`): Uyarı arka planları, dikkat bantları (--podium-cds-color-yellow-200)
- **Odak Halkası** (`rgba(39, 93, 197, 1)`): Klavye odak gösterge halkası

### Genişletilmiş Renk Spektrumu (Podium CDS)

Her renk rampası, kampanyalar ve ürün sayfalarında ifade edici kullanım için 50–900 arasında çalışıyor:

- **Kırmızı**: `#FFE5E5` → `#EE0005` → `#530300`
- **Turuncu**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Sarı**: `#FEF087` → `#FCA600` → `#99470A`
- **Yeşil**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Mavi**: `#D6EEFF` → `#1151FF` → `#020664`
- **Mor**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pembe**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Gradyan Sistemi

Nike, arayüz gradyanlarından kaçınır. Gradyanlar göründüğünde fotoğrafiktir — ürün hero arka planlarına uygulanır (örn. kırmızı-daha koyu kırmızı gradyan üzerinde kırmızı ayakkabı). Tasarım sisteminin kendisi yalnızca düz renk kullanır.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi

**Display:** Nike Futura ND (Nike'a özel dar Futura varyantı)
- Geri dönüşler: Helvetica Now Text Medium, Helvetica, Arial
- Yalnızca büyük harfli büyük display başlıkları için kullanılır
- Karakteristik sıkı line-height (0.90) ve büyük harf dönüşümü

**Heading:** Helvetica Now Display Medium
- Geri dönüşler: Helvetica, Arial
- 24–32px'te bölüm başlıkları ve ürün başlıkları için kullanılır

**Gövde Medium:** Helvetica Now Text Medium (ağırlık 500)
- Geri dönüşler: Helvetica, Arial
- Bağlantılar, düğmeler, altyazılar, vurgulanan gövde metni için kullanılır

**Gövde:** Helvetica Now Text (ağırlık 400)
- Geri dönüşler: Helvetica, Arial
- Standart gövde kopyası, açıklamalar, meta veri için kullanılır

**Arapça:** Neue Frutiger Arabic — yerel dile özgü alternatif

### Hiyerarşi

| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, büyük harf, hero başlıkları |
| Başlık 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, bölüm başlıkları |
| Başlık 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, alt bölümler |
| Başlık 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, kart başlıkları |
| Gövde | 16px | 400 | 1.75 | — | Helvetica Now Text, ürün açıklamaları |
| Gövde Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, vurgulanan metin |
| Bağlantı | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, navigasyon bağlantıları |
| Küçük Bağlantı | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, alt bilgi/yardımcı bağlantılar |
| Düğme | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, CTA metni |
| Küçük Düğme | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, ikincil düğmeler |
| Altyazı | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, fiyat etiketleri |
| Küçük | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, zaman damgaları |
| Çok Küçük | 12px | 400 | 1.50 | — | Helvetica Now Text, yasal metinler |

### İlkeler

Nike'ın tipografisi bir gerilim çalışmasıdır. Display katmanı — yıkıcı 0.90 line-height ile 96px'te Nike Futura ND — bir stat skorborduna benzer hissettirmek üzere tasarlandı: devasa, sıkıştırılmış, büyük harf, görmezden gelinmesi imkânsız. Başlıkları savaş çığlıklarına dönüştürüyor. Display katmanının altında, Helvetica Now klinik bir denge noktası sunuyor: rahat ürün gezintisi için 1.75 satır yüksekliğiyle İsviçre hassasiyetinde okunabilirlik. Ağırlık 500 (Medium) gövde metni boyunca hâkim olup Nike'ın düz yazısına kalın yazının ağırlığı olmadan hafif bir kararlılık kazandırıyor — her cümle güvenli bir öneri gibi, bağırma değil.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil**
- Arka plan: Nike Siyahı (`#111111`)
- Metin: Beyaz (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Kenarlık: yok
- Kenarlık yarıçapı: tam yuvarlak hap (30px)
- Dolgu: ~12px 24px
- Hover: arka plan Grey-500'e (`#707072`) kayıyor, metin hover rengi
- Aktif: opaklık 0.5 ile scale(0) dalgalanma efekti
- Odak: `rgba(39, 93, 197, 1)` ile 2px box-shadow halkası
- Geçiş: arka plan 200ms ease

**Koyu Zemin Üzerinde Birincil**
- Arka plan: Beyaz (`#FFFFFF`)
- Metin: Siyah (`#111111`)
- Hover: arka plan Grey-300'e (`#CACACB`) kayıyor

**İkincil (Kenarlıklı)**
- Arka plan: şeffaf
- Metin: Nike Siyahı (`#111111`)
- Kenarlık: 1.5px solid `#CACACB` (grey-300)
- Kenarlık yarıçapı: 30px
- Hover: kenarlık `#707072`'ye koyulaşıyor, arka plan grey-200'e geçiyor

**Devre Dışı**
- Arka plan: Grey-200 (`#E5E5E5`)
- Metin: Grey-400 (`#9E9EA0`)
- İmleç: not-allowed

**Simge Düğmesi**
- Arka plan: Grey-100 (`#F5F5F5`)
- Şekil: 30px yarıçap (veya dairesel için 50%)
- Dolgu: 6px
- Hover: Grey-500 arka planı

### Kartlar & Konteynerler

- Arka plan: Beyaz (`#FFFFFF`) — çoğu durumda görünür kart sınırı yok
- Kenarlık yarıçapı: ürün görsel kartları için 0px (kenara kadar görüntüleme), etkileşimli konteynerler için 20px
- Gölge: yok — Nike hiçbir kart gölgesi kullanmaz
- Hover: ürün kartlarında kaldırma efekti yok; kartlar içindeki metin bağlantılarında alt çizgi
- Ürün kartları: üstte görsel (yarıçap yok), altta 12px boşlukla metin meta verisi
- Kategori kartları: koyu gradyan üzerinde metin kaplamasıyla tam ekran fotoğrafçılık
- Geçiş: hover'da görsel değişimi için opaklık 200ms ease

### Girişler & Formlar

- Arka plan: Grey-100 (`#F5F5F5`)
- Kenarlık: görünür olduğunda 1px solid `#CACACB`, veya aramada kenarlıksız
- Kenarlık yarıçapı: 24px (arama girişleri), 8px (form girişleri)
- Yazı tipi: Helvetica Now Text, 16px
- Odak: kenarlık `#111111`'e (border-active) kayıyor, `rgba(39, 93, 197, 1)` ile 2px odak halkası
- Hata: kenarlık `#D30005` (kritik)
- Yer tutucu: Grey-500 (`#707072`)
- Geçiş: border-color 200ms ease

### Navigasyon

- Arka plan: Beyaz (`#FFFFFF`), yapışkan
- Yükseklik: masaüstünde ~60px
- Sol: Nike Swoosh logosu (24x24px SVG)
- Orta: 16px/500 Helvetica Now Text Medium ile kategori bağlantıları (Yeni & Öne Çıkan, Erkek, Kadın, Çocuk, İndirim)
- Sağ: Arama (24px yarıçap girişi), Favoriler, Sepet simgeleri
- Hover: metin rengi Grey-500'e (`#707072`) kayıyor
- Mobil: hamburger menü, tam ekran kaplama
- Üst bant: koyu arka plan (#111111) ve beyaz metinli promosyon mesajı çubuğu

### Görsel İşleme

- Hero görseller: tam ekran, kenarlık yarıçapı yok, kenara kadar
- Ürün ızgarası: kare (1:1) veya 4:3 en boy oranı, kenarlık yarıçapı yok
- Kategori kartları: metin kaplamasıyla 16:9 veya 4:3, tam ekran
- Görsel yer tutucu: Grey-100 (`#F5F5F5`) düz arka plan
- Geç yükleme: yerel loading="lazy", iskelet #F5F5F5 arka plan kullanır
- Ürün hover'ı: ikincil görsel değişimi (ön → yan görünüm)

### Promosyon Bantları

- Beyaz metinli tam genişlik koyu (`#111111`) arka plan
- Sıkı dolgu (dikey 8-12px)
- Ortalanmış metin, 12px/500 Helvetica Now Text Medium
- Kargo promosyonları, üye avantajları, indirim duyuruları için kullanılır

## 5. Düzen İlkeleri

### Aralık Sistemi

Temel birim: 4px (birincil ızgara 8px katları)

| Token | Değer | Kullanım |
|-------|-------|-----|
| space-1 | 4px | Sıkı simge boşlukları, satır içi aralık |
| space-2 | 8px | Temel birim, düğme simge boşlukları |
| space-3 | 12px | Kart iç dolgusu, sıkı kenar boşlukları |
| space-4 | 16px | Standart dolgu, nav aralığı |
| space-5 | 20px | Ürün kartı boşlukları |
| space-6 | 24px | Bölüm iç dolgusu, ızgara boşlukları |
| space-7 | 32px | Bölüm araları |
| space-8 | 48px | Ana bölüm dolgusu |
| space-9 | 64px | Hero bölümü dolgusu |
| space-10 | 80px | Büyük bölüm aralığı |

### Izgara & Konteyner

- Maksimum konteyner genişliği: 1920px
- Standart içerik genişliği: yatay dolguyla ~1440px
- Ürün ızgarası: masaüstünde 3 sütun, tablette 2 sütun, mobilde 1 sütun
- Kategori ızgarası: tam ekran görsellerle 3 sütun
- Izgara boşluğu: ürün kartları arasında 4-12px (kasıtlı olarak sıkı)
- Yatay dolgu: masaüstü 48px, tablet 24px, mobil 16px

### Beyaz Alan Felsefesi

Nike'ın beyaz alan stratejisi kasıtlı olarak agresif — bir moda markasının ferahlayarak nefes alan lüks yolunda değil, her pikseli içerik ya da kasıtlı yoklukla dolduran sıkıştırılmış, yüksek yoğunluklu bir yolda. Ürün ızgaraları bolluğu ve seçeneği hissettirmek için minimum boşluk kullanıyor (4-12px). Bölüm araları alışveriş bağlamlarını ayırmak için cömert (48-80px). Genel etki, iyi organize edilmiş bir atletik süpermarket gibi — ürünle dolu hissettirirken gezinmeyi kolaylaştıran bir mağaza.

### Kenarlık Yarıçapı Ölçeği

| Değer | Bağlam |
|-------|---------|
| 0px | Ürün görselleri, hero fotoğrafçılığı (keskin kenarlar) |
| 8px | Form girişleri (arama dışı) |
| 18px | Küçük etkileşimli öğeler |
| 20px | Konteynerler, arayüz içeriğiyle kartlar |
| 24px | Arama girişleri, orta haplar |
| 30px | Düğmeler, etiketler, filtreler (tam hap) |
| 50% | Dairesel simge düğmeleri, avatar yer tutucuları |

## 6. Derinlik & Yükseklik

| Seviye | İşleme | Kullanım |
|-------|-----------|-----|
| Düz | Gölge yok, kenarlık yok | Her şey için varsayılan durum |
| Bölücü | `0px -1px 0px 0px #E5E5E5 inset` | Bölümler arasında ince içe yerleştirilmiş çizgi |
| Odak | `0 0 0 2px rgba(39, 93, 197, 1)` | Klavye odak halkası |
| Kaplama | Fotoğrafçılık üzerinde koyu perde | Görsel üzerindeki metin okunabilirliği |

Nike'ın yükseklik felsefesi radikal biçimde düz. Kart gölgesi yok, hover kaldırması yok, kayan öğe yok. Derinlik yalnızca renk aracılığıyla iletiliyor — koyu bölümler geri çekiliyor, açık bölümler öne çıkıyor, gri geçişler durum değişikliklerini gösteriyor. Bu düzlük atletik, lafı dolandırmayan marka kişiliğini pekiştiriyor: görsel süs yok, yalnızca doğrudan iletişim. Sistemdeki tek "gölge" 1px içe yerleştirilmiş bölücü çizgi ve erişilebilirlik için zorunlu odak halkası.

### Dekoratif Derinlik

- **Hero fotoğrafçılık kaplamaları**: Metin okunabilirliği için tam ekran fotoğrafçılık üzerinde koyu gradyan perdeler
- **Ürün arka plan gradyanları**: Hero ürün çekimlerinin arkasındaki renkli arka planlar (örn. kırmızı gradyan üzerinde kırmızı ayakkabı)
- **Bant çubukları**: Sayfa üstünde düz koyu (#111111) promosyon şeritleri

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar

- Tüm birincil metin için Nike Siyahı (#111111) kullanın — asla saf #000000 değil
- Düğmeleri hap şekilli tutun (30px yarıçap) ve birincil/ikincil varyantlarla sınırlı tutun
- Hero bölümleri için tam ekran, kenara kadar fotoğrafçılık kullanın — görsellerde kenarlık yarıçapı olmasın
- Tüm renk canlılığını ürün fotoğrafçılığına bırakın; arayüzü tek renkli tutun
- Nike Futura ND büyük harflerini YALNIZCA display başlıkları (96px+) için kullanın
- Yoğun, bol bir his için sıkı ürün ızgara boşluklarını (4-12px) koruyun
- Tüm girdi ve yer tutucu arka planlar için Grey-100 (#F5F5F5) kullanın
- Rengi yalnızca anlamsal anlam için ayırın (kırmızı=hata, yeşil=başarı, mavi=bağlantı)
- Tüm etkileşimli metin öğeleri için ağırlık 500 (Medium) kullanın

### Yapılmayacaklar

- Kartlara gölge eklemeyin — Nike'ın yükseklik modeli tamamen düz
- Ürün görsellerinde kenarlık yarıçapı kullanmayın — yalnızca arayüz öğeleri yuvarlatılmış köşe alır
- Arayüz öğeleri için gri ölçeğin ötesinde marka renkleri tanıtmayın
- Nike Futura ND'yi 24px'in altında kullanmayın — yalnızca bir display yazı tipiyüzüdür
- Hover kaldırma efektleri eklemeyin — Nike kartları hover'da animasyon yapmaz
- Düğmeler veya bağlantılar için regular ağırlık (400) kullanmayın — her zaman 500 kullanın
- Arayüz öğelerinin arkasına renkli arka plan koymayın — renk ürün bağlamları için ayrılmıştır
- Kart başına iki metin hiyerarşisi seviyesinden fazla kullanmayın (başlık + gövde)
- Dekoratif bölücüler eklemeyin — 1px içe yerleştirilmiş çizgi tek bölücü kalıptır
- Kontrastı yumuşatmayın — Nike'ın tasarımı siyah-beyaz kontrastı kasıtlı olarak maksimuma taşıyor

## 8. Duyarlı Davranış

### Kırılma Noktaları

| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Mobil | <640px | Tek sütun, hamburger nav, display metni küçülüyor, sıkı 16px dolgu |
| Küçük Tablet | 640-768px | 2 sütunlu ürün ızgarası başlıyor, nav hâlâ daraltılmış |
| Tablet | 768-960px | 2 sütunlu ızgaralar, kategori kartları ölçekleniyor, yatay dolgu 24px |
| Küçük Masaüstü | 960-1024px | Nav tam yataya genişliyor, 3 sütunlu ürün ızgarası |
| Masaüstü | 1024-1440px | Tam düzen, genişletilmiş nav, 3 sütunlu ızgaralar, 48px dolgu |
| Büyük Masaüstü | >1440px | Maksimum genişlik konteyner ortalanmış, artan kenar boşlukları, hero görseller tam ekran |

### Dokunma Hedefleri

- Minimum dokunma hedefi: 44x44px (WCAG AAA)
- Mobil nav simgeleri: 48x48px dokunma alanı
- Ürün kartları: tüm yüzey dokunulabilir
- Filtre hapları: 12px dolguyla minimum 36px yükseklik

### Daraltma Stratejisi

- **Navigasyon**: Tam kategori bağlantıları → 960px altında hamburger menü; arama, favoriler, sepet simgeleri görünür kalıyor
- **Ürün ızgaraları**: 3 sütun → 960px'te 2 sütun → 640px'te 1 sütun
- **Hero bölümleri**: Display metni 96px → 64px → 48px'e ölçekleniyor; hero görseller tüm boyutlarda tam ekran kalıyor
- **Kategori kartları**: 3 sütun → 2 sütun → korunan tam ekran görüntülemeyle 1 sütun
- **Bölüm dolgusu**: Görüntü alanı daraldıkça 80px → 48px → 32px → 24px
- **Promosyon bandı**: metin sarılıyor veya kısalıyor, koyu arka plan korunuyor

### Görsel Davranışı

- Nike CDN (`c.static-nike.com`) üzerinden genişlik parametreleriyle duyarlı görseller
- Ürün görselleri: birden fazla çözünürlüklü srcset (w_320, w_640, w_960, w_1920)
- Hero görseller: tüm kırılma noktalarında tam ekran, en boy oranı değişiyor (masaüstü 16:9 → mobil 4:3)
- Geç yükleme: yerel loading="lazy", yükleme sırasında grey-100 yer tutucu
- Sanat yönetimi: hero kırpmaları masaüstü ve mobil kompozisyonlar arasında değişiyor

## 9. Ajan Komut Kılavuzu

### Hızlı Renk Referansı

- Birincil CTA: Nike Siyahı (`#111111`)
- Arka plan: Beyaz (`#FFFFFF`)
- İkincil yüzey: Açık Gri (`#F5F5F5`)
- Başlık metni: Nike Siyahı (`#111111`)
- Gövde metni / hover: İkincil Metin (`#707072`)
- Kenarlık: Kenarlık İkincil (`#CACACB`)
- Hata: Nike Kırmızısı (`#D30005`)
- Bağlantı: Bağlantı Mavisi (`#1151FF`)

### Örnek Bileşen Komutları

- "Kenarlık yarıçapı olmayan tam ekran kenara kadar fotoğrafçılık, metin için koyu gradyan kaplama ve 0.90 line-height ile Nike Futura stilinde devasa büyük harfli 96px/500 başlık ve Nike Siyahı (#111111) hap düğmesi (30px yarıçap) ile bir ürün hero bölümü oluşturun"
- "Kare görsellerle (kenarlık yarıçapı yok) 4px kart boşluğu, 16px/500 Nike Siyahı (#111111) ürün adı, 14px/500 fiyat ve Grey-500 (#707072) ikincil metinli 3 sütunlu ürün kart ızgarası tasarlayın"
- "Sol hizalı logo, ortalanmış 16px/500 (#111111) kategori bağlantıları ve hover rengi #707072, sağ hizalı arama (24px yarıçap, #F5F5F5 arka plan), favoriler ve sepet simgeleri ile yapışkan beyaz navigasyon çubuğu oluşturun"
- "#111111 arka plan, beyaz 12px/500 ortalanmış metin ve 8px dikey dolguyla — tam genişlik, kenarlık yarıçapı yok — bir promosyon bandı şeridi oluşturun"
- "Şeffaf arka plan, 1.5px #CACACB kenarlık, 30px hap yarıçapı, 16px/500 #111111 metin, hover kenarlığı #707072'ye koyulaşan ikincil kenarlıklı düğme tasarlayın"

### Yineleme Kılavuzu

Bu tasarım sistemiyle oluşturulan mevcut ekranları geliştirirken:
1. Bir seferde BİR bileşene odaklanın
2. Bu belgeden belirli renk adlarına ve hex kodlarına başvurun
3. Unutmayın: ürün fotoğrafçılığı renktir — arayüz tek renkli kalır
4. Durum değişiklikleri için gri ölçeği kullanın: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Arayüzde bir şey çok renkli hissettiriyorsa muhtemelen öyledir — Nike arayüzü griyi ölçekte tutar
6. Display tipi (Nike Futura) HER ZAMAN büyük harf olmalı ve 24px'in altına düşmemelidir
7. Gövde tipi (Helvetica Now) etkileşimli öğeler için neredeyse her zaman ağırlık 500 olmalıdır
