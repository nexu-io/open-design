# Figma'dan İlham Alan Tasarım Sistemi

> Kategori: Tasarım ve Yaratıcılık
> İş birliğine dayalı tasarım aracı. Canlı çok renkli, eğlenceli ama profesyonel.

## 1. Görsel Tema ve Atmosfer

Figma'nın arayüzü, kendisini tasarlayan tasarım aracıdır — özel bir değişken fontun (figmaSans) son derece ince (ağırlık 320) ile kalın (ağırlık 700) arasında, çoğu tipografi sisteminin hiç keşfetmediği alışılmadık ara duraklarda (330, 340, 450, 480, 540) modulasyon yaptığı, tipografik incelemenin bir ustalık dersidir. Bu ayrıntılı ağırlık kontrolü, her metin öğesine hassasça kalibre edilmiş bir görsel ağırlık kazandırır ve hiyerarşiyi "normal ile kalın" arasındaki kaba fark yerine mikro farklılıklar aracılığıyla oluşturur.

Sayfa büyüleyici bir ikililik sunar: arayüz çerçevesi kesinlikle siyah-beyazdır (gerçek anlamda yalnızca renk olarak `#000000` ve `#ffffff` algılanır); kahraman bölümü ve ürün vitrisleri ise elektrik yeşili, parlak sarı, derin mor, ateşli pembe gibi canlı çok renkli gradyanlarla patlar. Bu ayrım, tasarım sisteminin kendisinin renksiz olduğu ve ürünün renkli çıktısını kahraman içerik olarak ele aldığı anlamına gelir. Figma'nın pazarlama sayfası özünde renkli sanat eserlerini sergileyen beyaz bir galeri duvarıdır.

Figma'yı değişken fontun ötesinde ayırt eden şey, daire ve hap geometrisidir. Düğmeler 50 piksel yarıçap (hap) veya %50 (simge düğmeleri için mükemmel daire) kullanır; bu da organik, araç paleti benzeri bir his yaratır. Kesik çizgili odak göstergesi (`dashed 2px`), Figma editörünün kendisindeki seçim tutamaçlarını kasıtlı olarak yansıtan bir tasarım tercihi olup web sitesinin UI dili, ürünün UI diline gönderme yapar.

**Temel Özellikler:**
- Alışılmadık ağırlık duraklı özel değişken font (figmaSans): 320, 330, 340, 450, 480, 540, 700
- Kesinlikle siyah-beyaz arayüz çerçevesi — renk yalnızca ürün içeriğinde bulunur
- Geniş harf aralığıyla büyük harfli teknik etiketler için figmaMono
- Hap (50px) ve dairesel (%50) düğme geometrisi
- Figma'nın editör seçim tutamaçlarını yansıtan kesik çizgili odak çerçeveleri
- Canlı çok renkli kahraman gradyanları (yeşil, sarı, mor, pembe)
- Global olarak etkinleştirilmiş OpenType `"kern"` özelliği
- Her yerde negatif harf aralığı — gövde metni bile -0.14px ile -0.26px arasında

## 2. Renk Paleti ve Rolleri

### Birincil
- **Saf Siyah** (`#000000`): Tüm metinler, tüm düz düğmeler, tüm kenarlıklar. Arayüzün tek "rengi."
- **Saf Beyaz** (`#ffffff`): Tüm arka planlar, beyaz düğmeler, koyu yüzeylerdeki metin. İkilinin diğer yarısı.

*Not: Figma'nın pazarlama sitesi arayüz katmanı için YALNIZCA bu iki rengi kullanır. Tüm canlı renkler yalnızca ürün ekran görüntülerinde, kahraman gradyanlarında ve gömülü içeriklerde görünür.*

### Yüzey ve Arka Plan
- **Saf Beyaz** (`#ffffff`): Birincil sayfa arka planı ve kart yüzeyleri.
- **Cam Siyah** (`rgba(0, 0, 0, 0.08)`): İkincil dairesel düğmeler ve cam efektleri için narin koyu katman.
- **Cam Beyaz** (`rgba(255, 255, 255, 0.16)`): Koyu/renkli yüzeylerdeki düğmeler için donuk cam katmanı.

### Gradyan Sistemi
- **Kahraman Gradyanı**: Elektrik yeşili, parlak sarı, derin mor ve ateşli pembe kullanan canlı çok duraklı bir gradyan. Bu gradyan, kahraman bölümünün görsel imzasıdır — aracın yaratıcı olanaklarını temsil eder.
- **Ürün Bölümü Gradyanları**: Bireysel ürün alanları (Tasarım, Geliştirici Modu, Prototipleme) vitrislerinde farklı renk temaları kullanabilir.

## 3. Tipografi Kuralları

### Font Ailesi
- **Birincil**: `figmaSans`, geri dönüş fontlarıyla: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Etiketler**: `figmaMono`, geri dönüş fontlarıyla: `figmaMono Fallback, SF Mono, menlo`

### Hiyerarşi

| Rol | Font | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Vitrin / Kahraman | figmaSans | 86px (5.38rem) | 400 | 1.00 (sıkı) | -1.72px | Maksimum etki, aşırı takip |
| Bölüm Başlığı | figmaSans | 64px (4rem) | 400 | 1.10 (sıkı) | -0.96px | Özellik bölümü başlıkları |
| Alt Başlık | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Vurgulu bölüm metni |
| Alt Başlık İnce | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Hafif ağırlıklı bölüm metni |
| Özellik Başlığı | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Kalın kart başlıkları |
| Gövde Büyük | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px ile -0.14px | Açıklamalar, girişler |
| Gövde / Düğme | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px ile normal | Standart gövde, gezinti, düğmeler |
| Gövde İnce | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px ile normal | Hafif ağırlıklı gövde metni |
| Mono Etiket | figmaMono | 18px (1.13rem) | 400 | 1.30 (sıkı) | 0.54px | Büyük harfli bölüm etiketleri |
| Mono Küçük | figmaMono | 12px (0.75rem) | 400 | 1.00 (sıkı) | 0.6px | Büyük harfli küçük etiketler |

### İlkeler
- **Değişken font hassasiyeti**: figmaSans, çoğu sistemin hiç dokunmadığı ağırlıklar kullanır — 320, 330, 340, 450, 480, 540. Bu, hiyerarşiyi dramatik sıçramalar yerine ince ağırlık farklılıkları aracılığıyla oluşturur. 330 ile 340 arasındaki fark neredeyse algılanamaz ancak yapısal olarak önemlidir.
- **Temel olarak ince**: Çoğu gövde metni, tipik 400 "normal"den daha hafif olan 320–340 kullanır ve tasarım aracı estetiğiyle örtüşen ethereal, havadar bir okuma deneyimi yaratır.
- **Her yerde kern**: Her metin öğesi OpenType `"kern"` özelliğini etkinleştirir — kerning isteğe bağlı değil, yapısal bir zorunluluktur.
- **Varsayılan olarak negatif takip**: Gövde metni bile -0.1px ile -0.26px harf aralığı kullanır ve evrensel olarak sıkı metin oluşturur. Vitrin metni -0.96px ve -1.72px'e kadar daha da sıkışır.
- **Yapı için Mono**: Büyük harflerle pozitif harf aralığıyla (0.54px–0.6px) figmaMono, teknik işaret etiketleri oluşturur.

## 4. Bileşen Stilleri

### Düğmeler

**Siyah Düz (Hap)**
- Arka Plan: Saf Siyah (`#000000`)
- Metin: Saf Beyaz (`#ffffff`)
- Yarıçap: simge düğmeleri için daire (%50)
- Odak: kesik çizgili 2px çerçeve
- Maksimum vurgu

**Beyaz Hap**
- Arka Plan: Saf Beyaz (`#ffffff`)
- Metin: Saf Siyah (`#000000`)
- Dolgu: 8px 18px 10px (asimetrik dikey)
- Yarıçap: hap (50px)
- Odak: kesik çizgili 2px çerçeve
- Koyu/renkli yüzeylerde standart CTA

**Cam Koyu**
- Arka Plan: `rgba(0, 0, 0, 0.08)` (narin koyu katman)
- Metin: Saf Siyah
- Yarıçap: daire (%50)
- Odak: kesik çizgili 2px çerçeve
- Açık yüzeylerde ikincil eylem

**Cam Açık**
- Arka Plan: `rgba(255, 255, 255, 0.16)` (donuk cam)
- Metin: Saf Beyaz
- Yarıçap: daire (%50)
- Odak: kesik çizgili 2px çerçeve
- Koyu/renkli yüzeylerde ikincil eylem

### Kartlar ve Konteynerler
- Arka Plan: Saf Beyaz
- Kenarlık: yok veya minimal
- Yarıçap: 6px (küçük konteynerler), 8px (görseller, kartlar, diyaloglar)
- Gölge: hafiften orta düzeye yükseklik efektleri
- Kart içeriği olarak ürün ekran görüntüleri

### Gezinti
- Beyaz üzerinde temiz yatay gezinti
- Logo: siyah Figma wordmark
- Ürün sekmeleri: hap şeklinde (50px) sekme gezintisi
- Bağlantılar: siyah metin, 1px alt çizgi dekorasyonu
- CTA: Siyah hap düğme
- Üzerine gelme: CSS değişkeni aracılığıyla metin rengi

### Ayırt Edici Bileşenler

**Ürün Sekme Çubuğu**
- Yatay hap şeklinde sekmeler (50px yarıçap)
- Her sekme bir Figma ürün alanını temsil eder (Tasarım, Geliştirici Modu, Prototipleme, vb.)
- Aktif sekme vurgulanmış

**Kahraman Gradyan Bölümü**
- Tam genişlikte canlı çok renkli gradyan arka planı
- 86px vitrin başlıklı beyaz metin katmanı
- Gradyan içinde yüzen ürün ekran görüntüleri

**Kesik Çizgili Odak Göstergeleri**
- Tüm etkileşimli öğeler odakta `dashed 2px` çerçeve kullanır
- Figma editöründeki seçim tutamaçlarına gönderme yapar
- Web sitesini ve ürünü birbirine bağlayan bir meta-tasarım tercihi

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Ölçek: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Izgaraları ve Konteyner
- Maksimum konteyner genişliği: 1920px'e kadar
- Kahraman: ortalanmış içerikli tam genişlikte gradyan
- Ürün bölümleri: dönüşümlü vitrisler
- Alt bilgi: koyu tam genişlikte bölüm
- 559px ile 1920px arasında duyarlı

### Boşluk Felsefesi
- **Galeri benzeri ritim**: Cömert boşluk, her ürün bölümünün kendi sergisi olarak nefes almasını sağlar.
- **Görsel nefes olarak renkli bölümler**: Gradyan kahraman ve ürün vitrisler, tek renkli arayüz bölümleri arasında kromatik rahatlama sağlar.

### Kenarlık Yarıçapı Ölçeği
- Minimal (2px): Küçük bağlantı öğeleri
- Narin (6px): Küçük konteynerler, ayırıcılar
- Rahat (8px): Kartlar, görseller, diyaloglar
- Hap (50px): Sekme düğmeleri, CTA'lar
- Daire (%50): Simge düğmeleri, dairesel öğeler

## 6. Derinlik ve Yükseklik

| Seviye | Uygulama | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok | Sayfa arka planı, çoğu metin |
| Yüzey (Seviye 1) | Gradyan/koyu bölümde beyaz kart | Kartlar, ürün vitrisler |
| Yükseltilmiş (Seviye 2) | Hafif gölge | Yüzen kartlar, üzerine gelme durumları |

**Gölge Felsefesi**: Figma gölgeleri tutumlu kullanır. Birincil derinlik mekanizmaları **arka plan kontrastı** (renkli/koyu bölümlerde beyaz içerik) ve ürün ekran görüntülerinin kendine özgü boyutsallığıdır.

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- figmaSans'ı hassas değişken ağırlıklarla kullanın (320–540) — ayrıntılı ağırlık kontrolü tasarımın kendisidir
- Arayüzü kesinlikle siyah-beyaz tutun — renk yalnızca ürün içeriğinden gelir
- Tüm etkileşimli öğelerde hap (50px) ve dairesel (%50) geometri kullanın
- Kesik çizgili 2px odak çerçeveleri uygulayın — imza erişilebilirlik deseni
- Tüm metinlerde `"kern"` özelliğini etkinleştirin
- Etiketler için büyük harflerle pozitif harf aralığıyla figmaMono kullanın
- Her yerde negatif harf aralığı uygulayın (-0.1px ile -1.72px)

### Yapılmayacaklar
- Arayüze renk eklemeyin — tek renkli palet mutlaktır
- Standart font ağırlıkları kullanmayın (400, 500, 600, 700) — değişken fontun benzersiz duraklarını kullanın (320, 330, 340, 450, 480, 540)
- Düğmelerde keskin köşeler kullanmayın — yalnızca hap ve dairesel geometri
- Düz odak çerçeveleri kullanmayın — kesik çizgi imzadır
- Gövde font ağırlığını 450'nin üzerine çıkarmayın — hafif ağırlık estetiği çekirdektir
- Gövde metninde pozitif harf aralığı kullanmayın — her zaman negatif olmalıdır

## 8. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | <560px | Kompakt düzen, yığılmış |
| Tablet | 560–768px | Küçük ayarlamalar |
| Küçük Masaüstü | 768–960px | 2 sütunlu düzenler |
| Masaüstü | 960–1280px | Standart düzen |
| Büyük Masaüstü | 1280–1440px | Genişletilmiş |
| Ultra geniş | 1440–1920px | Maksimum genişlik |

### Daraltma Stratejisi
- Kahraman metni: 86px → 64px → 48px
- Ürün sekmeleri: mobilde yatay kaydırma
- Özellik bölümleri: yığılmış tek sütun
- Alt bilgi: çok sütunlu → yığılmış

## 9. Ajan Prompt Kılavuzu

### Hızlı Renk Referansı
- Her şey: "Saf Siyah (#000000)" ve "Saf Beyaz (#ffffff)"
- Cam Koyu: "rgba(0, 0, 0, 0.08)"
- Cam Açık: "rgba(255, 255, 255, 0.16)"

### Örnek Bileşen Promptları
- "Canlı çok renkli gradyan (yeşil, sarı, mor, pembe) üzerinde bir kahraman oluşturun. Başlık 86px figmaSans ağırlık 400, satır-yüksekliği 1.0, harf-aralığı -1.72px. Beyaz metin. Beyaz hap CTA düğmesi (50px yarıçap, 8px 18px dolgu)."
- "Hap şeklinde düğmelerle (50px yarıçap) bir ürün sekme çubuğu tasarlayın. Aktif: siyah arka plan, beyaz metin. Pasif: şeffaf, siyah metin. 20px ağırlık 480'de figmaSans."
- "Bir bölüm etiketi oluşturun: figmaMono 18px, büyük harf, harf-aralığı 0.54px, siyah metin. Kern etkin."
- "20px figmaSans ağırlık 330, satır-yüksekliği 1.40, harf-aralığı -0.14px'de gövde metni oluşturun. Beyaz üzerinde Saf Siyah."

### Yineleme Kılavuzu
1. Değişken font ağırlık duraklarını hassasça kullanın: 320, 330, 340, 450, 480, 540, 700
2. Arayüz her zaman siyah + beyazdır — çerçeveye asla renk eklemeyin
3. Kesik çizgili odak çerçeveleri, düz değil
4. Harf aralığı gövdede her zaman negatif, mono etiketlerde her zaman pozitif
5. Düğmeler/sekmeler için Hap (50px), simge düğmeleri için daire (%50)
