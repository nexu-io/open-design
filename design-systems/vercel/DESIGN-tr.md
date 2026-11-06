# Vercel'den İlham Alan Tasarım Sistemi

> Category: Geliştirici Araçları
> Ön uç dağıtımı. Siyah beyaz hassasiyet, Geist fontu.

## 1. Görsel Tema ve Atmosfer

Vercel'in web sitesi, görünmez kılınmış geliştirici altyapısının görsel tezidir — o denli kısıtlanmış bir tasarım sistemi ki neredeyse felsefi bir boyut kazanıyor. Sayfa büyük ölçüde beyaz (`#ffffff`) zemin üzerine siyaha yakın (`#171717`) metinden oluşuyor; her öğenin pikselini hak ettiği galeri boşluğu yaratıyor. Bu, dekorasyon amaçlı bir minimalizm değil; mühendislik ilkesi olarak minimalizm. Geist tasarım sistemi arayüze bir derleyicinin koda yaklaştığı gibi yaklaşır — gereksiz her token ayıklanır, geriye yalnızca yapı kalır.

Özel Geist font ailesi sistemin taç mücevheridir. Geist Sans, görüntü boyutlarında agresif negatif harf aralığı (-2.4px ile -2.88px) kullanarak sıkıştırılmış, acil ve mühendislik ürünü hissiyatı veren başlıklar oluşturur — tıpkı üretime göre küçültülmüş kod gibi. Gövde boyutlarında aralık gevşese de geometrik hassasiyet sürer. Geist Mono ise kod, terminal çıktısı ve teknik etiketler için monoaralıklı tamamlayıcı olarak sistemi tamamlar. Her iki font da global düzeyde OpenType `"liga"` (bağlıharfler) etkinleştirerek yakından okumayı ödüllendiren tipografik bir incelik katmanı ekler.

Vercel'i diğer tek renkli tasarım sistemlerinden ayıran şey, gölgeyi kenarlık olarak kullanma felsefesidir. Geleneksel CSS kenarlıkları yerine Vercel, `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` kullanır — sıfır ofsetli, sıfır bulanıklıklı, 1px yayılan bir gölge, kutu modeli çıkarımları olmaksızın kenarlığa benzer bir çizgi oluşturur. Bu teknik kenarlıkların gölge katmanında var olmasına olanak tanır; daha yumuşak geçişler, kırpmasız yuvarlak köşeler ve geleneksel kenarlıklara kıyasla daha ince görsel ağırlık sağlar. Tüm derinlik sistemi katmanlı, çok değerli gölge yığınları üzerine inşa edilmiştir; her katmanın belirli bir amacı vardır: biri kenarlık için, biri yumuşak yükseltme için, biri ortam derinliği için.

**Temel Özellikler:**
- Görüntü boyutlarında aşırı negatif harf aralıklı (-2.4px ile -2.88px) Geist Sans — sıkıştırılmış altyapı olarak metin
- Kod ve teknik etiketler için global `"liga"` OpenType özellikli Geist Mono
- Gölge-kenarlık tekniği: `box-shadow 0px 0px 0px 1px` geleneksel kenarlıkların yerini alıyor
- Nüanslı derinlik için çok katmanlı gölge yığınları (tek bildirimlerde kenarlık + yükseltme + ortam)
- `#171717` metinli neredeyse saf beyaz tuval — tam siyah değil, mikro kontrast yumuşaklığı yaratıyor
- İş akışına özgü vurgu renkleri: Gönderim Kırmızısı (`#ff5b4f`), Önizleme Pembesi (`#de1d8d`), Geliştirme Mavisi (`#0a72ef`)
- Erişilebilirlik için `hsla(212, 100%, 48%, 1)` kullanan odak halkası sistemi — doygun mavi
- Durum göstergeleri için boyalı arka planlı hap rozetleri (9999px)

## 2. Renk Paleti ve Rolleri

### Birincil
- **Vercel Siyahı** (`#171717`): Birincil metin, başlıklar, koyu yüzey arka planları. Saf siyah değil — hafif sıcaklık sertliği önler.
- **Saf Beyaz** (`#ffffff`): Sayfa arka planı, kart yüzeyleri, koyu zemin üzerinde düğme metni.
- **Gerçek Siyah** (`#000000`): İkincil kullanım, `--geist-console-text-color-default`, belirli konsol/kod bağlamlarında kullanılır.

### İş Akışı Vurgu Renkleri
- **Gönderim Kırmızısı** (`#ff5b4f`): `--ship-text`, "üretime gönder" iş akışı adımı — sıcak, acil mercan kırmızısı.
- **Önizleme Pembesi** (`#de1d8d`): `--preview-text`, önizleme dağıtım iş akışı — canlı magenta-pembe.
- **Geliştirme Mavisi** (`#0a72ef`): `--develop-text`, geliştirme iş akışı — parlak, odaklı mavi.

### Konsol / Kod Renkleri
- **Konsol Mavisi** (`#0070f3`): `--geist-console-text-color-blue`, sözdizimi vurgulama mavisi.
- **Konsol Moru** (`#7928ca`): `--geist-console-text-color-purple`, sözdizimi vurgulama moru.
- **Konsol Pembesi** (`#eb367f`): `--geist-console-text-color-pink`, sözdizimi vurgulama pembesi.

### Etkileşimli
- **Bağlantı Mavisi** (`#0072f5`): Altı çizili birincil bağlantı rengi.
- **Odak Mavisi** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, etkileşimli öğelerde odak halkası.
- **Halka Mavisi** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, Tailwind halka yardımcısı.

### Nötr Skala
- **Gri 900** (`#171717`): Birincil metin, başlıklar, gezinti metni.
- **Gri 600** (`#4d4d4d`): İkincil metin, açıklama kopyası.
- **Gri 500** (`#666666`): Üçüncül metin, soluk bağlantılar.
- **Gri 400** (`#808080`): Yer tutucu metin, devre dışı durumlar.
- **Gri 100** (`#ebebeb`): Kenarlıklar, kart dış çizgileri, bölücüler.
- **Gri 50** (`#fafafa`): İnce yüzey tonu, iç gölge vurgusu.

### Yüzey ve Katman
- **Katman Arka Planı** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, modal/diyalog arka planı.
- **Seçim Metni** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, metin seçimi vurgusu.
- **Rozet Mavi Arka Planı** (`#ebf5ff`): Hap rozet arka planı, boyalı mavi yüzey.
- **Rozet Mavi Metni** (`#0068d6`): Hap rozet metni, okunabilirlik için daha koyu mavi.

### Gölgeler ve Derinlik
- **Kenarlık Gölgesi** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): İmza — geleneksel kenarlıkların yerini alır.
- **İnce Yükseltme** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Kartlar için minimal kalkış.
- **Kart Yığını** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Tam çok katmanlı kart gölgesi.
- **Halka Kenarlığı** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Sekmeler ve görseller için açık gri halka kenarlığı.

## 3. Tipografi Kuralları

### Font Ailesi
- **Birincil**: `Geist`, yedeklerle birlikte: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Tek Aralıklı**: `Geist Mono`, yedeklerle birlikte: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **OpenType Özellikleri**: Tüm Geist metinlerde global olarak `"liga"` etkin; belirli başlıklarda tablo numaraları için `"tnum"`.

### Hiyerarşi

| Rol | Font | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Görüntü Kahraman | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (sıkı) | -2.4px ile -2.88px | Maksimum sıkıştırma, billboard etkisi |
| Bölüm Başlığı | Geist | 40px (2.50rem) | 600 | 1.20 (sıkı) | -2.4px | Özellik bölümü başlıkları |
| Büyük Alt Başlık | Geist | 32px (2.00rem) | 600 | 1.25 (sıkı) | -1.28px | Kart başlıkları, alt bölümler |
| Alt Başlık | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Daha hafif alt başlıklar |
| Kart Başlığı | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Özellik kartları |
| Kart Başlığı Açık | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | İkincil kart başlıkları |
| Büyük Gövde | Geist | 20px (1.25rem) | 400 | 1.80 (gevşek) | normal | Girişler, özellik açıklamaları |
| Gövde | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Standart okuma metni |
| Küçük Gövde | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Standart arayüz metni |
| Orta Gövde | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Gezinti, vurgulanan metin |
| Yarı Kalın Gövde | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Güçlü etiketler, aktif durumlar |
| Düğme / Bağlantı | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Düğmeler, bağlantılar, altyazılar |
| Küçük Düğme | Geist | 14px (0.88rem) | 400 | 1.00 (sıkı) | normal | Kompakt düğmeler |
| Altyazı | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Meta veri, etiketler |
| Tek Aralıklı Gövde | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Kod blokları |
| Tek Aralıklı Altyazı | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Kod etiketleri |
| Küçük Tek Aralıklı | Geist Mono | 12px (0.75rem) | 500 | 1.00 (sıkı) | normal | `text-transform: uppercase`, teknik etiketler |
| Mikro Rozet | Geist | 7px (0.44rem) | 700 | 1.00 (sıkı) | normal | `text-transform: uppercase`, küçük rozetler |

### İlkeler
- **Kimlik olarak sıkıştırma**: Geist Sans, görüntü boyutlarında -2.4px ile -2.88px harf aralığı kullanır — herhangi bir büyük tasarım sisteminin en agresif negatif aralığı. Bu, üretime optimize edilmiş kod gibi _küçültülmüş_ hissettiren bir metin yaratır. Boyut azaldıkça aralık kademeli olarak gevşer: 32px'de -1.28px, 24px'de -0.96px, 16px'de -0.32px ve 14px'de normal.
- **Her yerde bağlıharfler**: Her Geist metin öğesi OpenType `"liga"` etkinleştirir. Bağlıharfler dekoratif değil — yapısaldır, daha sıkı ve verimli glif kombinasyonları oluşturur.
- **Üç ağırlık, katı roller**: 400 (gövde/okuma), 500 (arayüz/etkileşimli), 600 (başlıklar/vurgu). Küçük mikro rozetler dışında kalın (700) yok. Bu dar ağırlık aralığı, ağırlık yerine boyut ve aralıkla hiyerarşi oluşturur.
- **Kimlik için tek aralıklı**: `"tnum"` veya `"liga"` ile büyük harfli Geist Mono, pazarlama sitesini ürüne bağlayan "geliştirici konsolu" sesi olarak işlev görür — kompakt teknik etiketler.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil Beyaz (Gölge Kenarlıklı)**
- Arka plan: `#ffffff`
- Metin: `#171717`
- Dolgu: 0px 6px (minimal — içerik odaklı genişlik)
- Yarıçap: 6px (hafifçe yuvarlak)
- Gölge: `rgb(235, 235, 235) 0px 0px 0px 1px` (halka kenarlığı)
- Üzerine gelindiğinde: arka plan `var(--ds-gray-1000)` (koyu) olur
- Odaklandığında: `2px solid var(--ds-focus-color)` dış çizgi + `var(--ds-focus-ring)` gölgesi
- Kullanım: Standart ikincil düğme

**Birincil Koyu (Geist sisteminden çıkarılan)**
- Arka plan: `#171717`
- Metin: `#ffffff`
- Dolgu: 8px 16px
- Yarıçap: 6px
- Kullanım: Birincil harekete geçirici mesaj ("Dağıtımı Başlat", "Başla")

**Hap Düğmesi / Rozet**
- Arka plan: `#ebf5ff` (boyalı mavi)
- Metin: `#0068d6`
- Dolgu: 0px 10px
- Yarıçap: 9999px (tam hap)
- Font: 12px ağırlık 500
- Kullanım: Durum rozetleri, etiketler, özellik etiketleri

**Büyük Hap (Gezinti)**
- Arka plan: şeffaf veya `#171717`
- Yarıçap: 64px–100px
- Kullanım: Sekme gezintisi, bölüm seçicileri

### Kartlar ve Kapsayıcılar
- Arka plan: `#ffffff`
- Kenarlık: gölge aracılığıyla — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Yarıçap: 8px (standart), 12px (öne çıkan/görsel kartlar)
- Gölge yığını: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Görsel kartlar: 12px üst yarıçaplı `1px solid #ebebeb`
- Üzerine gelindiğinde: ince gölge yoğunlaşması

### Girişler ve Formlar
- Radyo: `var(--ds-gray-200)` arka planlı odak ile standart stil
- Odak gölgesi: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Odak dış çizgisi: `2px solid var(--ds-focus-color)` — tutarlı mavi odak halkası
- Kenarlık: geleneksel kenarlık değil, gölge tekniği aracılığıyla

### Gezinti
- Beyaz zemin üzerinde temiz yatay gezinti, yapışkan
- Vercel logotipi sola hizalı, 262x52px
- Bağlantılar: Geist 14px ağırlık 500, `#171717` metin
- Aktif: ağırlık 600 veya altı çizgi
- Harekete geçirici mesaj: koyu hap düğmeleri ("Dağıtımı Başlat", "Satışla İletişim")
- Mobil: hamburger menü daraltma
- Çok düzeyli menülerle ürün açılır listeleri

### Görsel İşleme
- `1px solid #ebebeb` kenarlıklı ürün ekran görüntüleri
- Üstten yuvarlak görseller: `12px 12px 0px 0px` yarıçap
- Pano/kod önizleme ekran görüntüleri özellik bölümlerine hakimiyet sağlar
- Kahraman görsellerin arkasında yumuşak gradyan arka planlar (pastel çok renk)

### Belirgin Bileşenler

**İş Akışı Boru Hattı**
- Üç adımlı yatay boru hattı: Geliştir → Önizle → Gönder
- Her adımın kendi vurgu rengi: Mavi → Pembe → Kırmızı
- Çizgiler/oklar ile bağlantılı
- Vercel'in temel değer önerisinin görsel metaforu

**Güven Çubuğu / Logo Izgarası**
- Şirket logoları (Perplexity, ChatGPT, Cursor, vb.) gri tonlamalı
- Yatay kaydırma veya ızgara düzeni
- İnce `#ebebeb` kenarlık ayırma

**Metrik Kartlar**
- Büyük sayı görünümü (ör. "10 kat daha hızlı")
- Metrik için Geist 48px ağırlık 600
- Altında gri gövde metninde açıklama
- Gölge kenarlıklı kart kapsayıcısı

## 5. Düzen İlkeleri

### Aralık Sistemi
- Temel birim: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Dikkat çekici boşluk: 16px'den 32px'e atlama — birincil skalada 20px veya 24px yok

### Izgara ve Kapsayıcı
- Maksimum içerik genişliği: yaklaşık 1200px
- Kahraman: cömert üst dolgu ile ortalanmış tek sütun
- Özellik bölümleri: kartlar için 2–3 sütunlu ızgaralar
- `border-bottom: 1px solid #171717` kullanan tam genişlikli bölücüler
- Kod/pano ekran görüntüleri tam genişlik veya kenarlıklı kapsayıcı

### Boşluk Felsefesi
- **Galeri boşluğu**: Bölümler arasında devasa dikey dolgu (80px–120px+). Boş alan tasarımın kendisidir — Vercel'in kanıtlayacak ve saklayacak hiçbir şeyi olmadığını iletir.
- **Sıkıştırılmış metin, genişletilmiş alan**: Başlıklardaki agresif negatif harf aralığı, çevresindeki cömert boş alanla dengelenir. Metin yoğundur; etrafındaki alan geniştir.
- **Bölüm ritmi**: Beyaz bölümler beyaz bölümlerle dönüşümlü gelir — bölümler arasında renk değişimi yoktur. Ayrım yalnızca kenarlıklardan (gölge kenarlıklar) ve aralıktan gelir.

### Köşe Yarıçapı Skalası
- Mikro (2px): Satır içi kod snippet'leri, küçük span'lar
- İnce (4px): Küçük kapsayıcılar
- Standart (6px): Düğmeler, bağlantılar, işlevsel öğeler
- Rahat (8px): Kartlar, liste öğeleri
- Görsel (12px): Öne çıkan kartlar, görsel kapsayıcılar (üstten yuvarlak)
- Büyük (64px): Sekme gezinti hapları
- XL (100px): Büyük gezinti bağlantıları
- Tam Hap (9999px): Rozetler, durum hapları, etiketler
- Daire (50%): Menü geçiş düğmesi, avatar kapsayıcıları

## 6. Derinlik ve Yükseltme

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok | Sayfa arka planı, metin blokları |
| Halka (Seviye 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Çoğu öğe için gölge-kenarlık |
| Açık Halka (Seviye 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Sekmeler ve görseller için daha açık halka |
| İnce Kart (Seviye 2) | Halka + `rgba(0,0,0,0.04) 0px 2px 2px` | Minimal kalkışlı standart kartlar |
| Tam Kart (Seviye 3) | Halka + İnce + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + iç `#fafafa` halkası | Öne çıkan kartlar, vurgulanan paneller |
| Odak (Erişilebilirlik) | `2px solid hsla(212, 100%, 48%, 1)` dış çizgi | Tüm etkileşimli öğelerde klavye odağı |

**Gölge Felsefesi**: Vercel, modern web tasarımındaki en gelişmiş gölge sistemine sahip olduğunu savunabilir. Geleneksel Material Design anlamında yükseltme için gölge kullanmak yerine, Vercel her katmanın belirgin bir mimari amaca sahip olduğu çok değerli gölge yığınları kullanır: biri "kenarlık" oluşturur (0px yayılım, 1px), diğeri ortam yumuşaklığı ekler (2px bulanıklık), bir diğeri uzakta derinliği ele alır (negatif yayılımlı 8px bulanıklık) ve iç halka (`#fafafa`) kartı "içten parlatan" ince vurguyu oluşturur. Bu katmanlı yaklaşım, kartların yüzmek yerine inşa edilmiş hissettirmesini sağlar.

### Dekoratif Derinlik
- Kahraman gradyanı: kahraman içeriğinin arkasında yumuşak, pastel çok renkli gradyan yıkaması (neredeyse görünmez, atmosferik)
- Bölüm kenarlıkları: büyük bölümler arasında `1px solid #171717` (tam koyu çizgi)
- Arka plan rengi değişimi yok — derinlik tamamen gölge katmanlaması ve kenarlık kontrastından geliyor

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Görüntü boyutlarında agresif negatif harf aralıklı Geist Sans kullanın (-2.4px ile -2.88px, 48px'de)
- Geleneksel CSS kenarlıkları yerine gölge-kenarlık (`0px 0px 0px 1px rgba(0,0,0,0.08)`) kullanın
- Tüm Geist metinlerde `"liga"` etkinleştirin — bağlıharfler isteğe bağlı değil, yapısaldır
- Üç ağırlık sistemini kullanın: 400 (gövde), 500 (arayüz), 600 (başlıklar)
- İş akışı vurgu renklerini (Kırmızı/Pembe/Mavi) yalnızca iş akışı bağlamlarında uygulayın
- Kartlar için çok katmanlı gölge yığınları kullanın (kenarlık + yükseltme + ortam + iç vurgu)
- Renk paletini akromatik tutun — `#171717`'den `#ffffff`'ye gri tonlar sistemin kendisidir
- Birincil metin için `#000000` yerine `#171717` kullanın — mikro sıcaklık önemlidir

### Yapılmayacaklar
- Geist Sans'da pozitif harf aralığı kullanmayın — her zaman negatif veya sıfır
- Gövde metninde ağırlık 700 (kalın) kullanmayın — 600 maksimum, yalnızca başlıklar için
- Kartlarda geleneksel CSS `border` kullanmayın — gölge-kenarlık tekniğini kullanın
- Arayüz çerçevesine sıcak renkler (turuncular, sarılar, yeşiller) eklemeyin
- İş akışı vurgu renklerini (Gönderim Kırmızısı, Önizleme Pembesi, Geliştirme Mavisi) dekoratif amaçla uygulamayın
- Ağır gölgeler kullanmayın (0.1 opaklığın üzeri) — gölge sistemi fısıltı düzeyindedir
- Gövde metni harf aralığını artırmayın — Geist sıkı çalışmak üzere tasarlanmıştır
- Birincil eylem düğmelerinde hap yarıçapı (9999px) kullanmayın — haplar yalnızca rozetler/etiketler içindir
- Kart gölgelerinde iç `#fafafa` halkasını atlamayın — sistemi çalıştıran parlaklık budur

## 8. Duyarlı Davranış

### Kesme Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | <400px | Sıkı tek sütun, minimal dolgu |
| Mobil | 400–600px | Standart mobil, yığılmış düzen |
| Küçük Tablet | 600–768px | 2 sütunlu ızgaralar başlar |
| Tablet | 768–1024px | Tam kart ızgaraları, genişletilmiş dolgu |
| Küçük Masaüstü | 1024–1200px | Standart masaüstü düzeni |
| Masaüstü | 1200–1400px | Tam düzen, maksimum içerik genişliği |
| Büyük Masaüstü | >1400px | Ortalanmış, cömert kenar boşlukları |

### Dokunma Hedefleri
- Düğmeler rahat dolgu kullanır (dikey 8px–16px)
- Gezinti bağlantıları yeterli aralıkla 14px'de
- Hap rozetleri dokunma hedefleri için 10px yatay dolgu
- Mobil menü geçiş düğmesi %50 yarıçaplı dairesel düğme kullanır

### Daraltma Stratejisi
- Kahraman: görüntü 48px → orantılı olarak küçülür, negatif aralığı korur
- Gezinti: yatay bağlantılar + harekete geçirici mesajlar → hamburger menü
- Özellik kartları: 3 sütun → 2 sütun → tek sütun yığılmış
- Kod ekran görüntüleri: en boy oranını korur, yatay kaydırabilir
- Güven çubuğu logoları: ızgara → yatay kaydırma
- Alt bilgi: çok sütun → yığılmış tek sütun
- Bölüm aralığı: mobilde 80px+ → 48px

### Görsel Davranışı
- Pano ekran görüntüleri tüm boyutlarda kenarlık işlemini korur
- Kahraman gradyanı mobilde yumuşar/basitleşir
- Ürün ekran görüntüleri tutarlı köşe yarıçaplı duyarlı görseller kullanır
- Tam genişlikli bölümler kenardan kenara işlemi korur

## 9. Ajan Komut İstemi Rehberi

### Hızlı Renk Referansı
- Birincil harekete geçirici mesaj: Vercel Siyahı (`#171717`)
- Arka plan: Saf Beyaz (`#ffffff`)
- Başlık metni: Vercel Siyahı (`#171717`)
- Gövde metni: Gri 600 (`#4d4d4d`)
- Kenarlık (gölge): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Bağlantı: Bağlantı Mavisi (`#0072f5`)
- Odak halkası: Odak Mavisi (`hsla(212, 100%, 48%, 1)`)

### Örnek Bileşen İstemleri
- "Beyaz arka plan üzerinde bir kahraman bölümü oluşturun. Başlık 48px Geist ağırlık 600, satır yüksekliği 1.00, harf aralığı -2.4px, renk #171717. Alt başlık 20px Geist ağırlık 400, satır yüksekliği 1.80, renk #4d4d4d. Koyu harekete geçirici mesaj düğmesi (#171717, 6px yarıçap, 8px 16px dolgu) ve hayalet düğme (beyaz, gölge kenarlık rgba(0,0,0,0.08) 0px 0px 0px 1px, 6px yarıçap)."
- "Bir kart tasarlayın: beyaz arka plan, CSS kenarlığı yok. Gölge yığını kullanın: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Yarıçap 8px. Başlık 24px Geist ağırlık 600, harf aralığı -0.96px. Gövde 16px ağırlık 400, #4d4d4d."
- "Bir hap rozeti oluşturun: #ebf5ff arka plan, #0068d6 metin, 9999px yarıçap, 0px 10px dolgu, 12px Geist ağırlık 500."
- "Gezinti oluşturun: beyaz yapışkan başlık. Bağlantılar için Geist 14px ağırlık 500, #171717 metin. Sağa hizalı koyu hap harekete geçirici mesaj 'Dağıtımı Başlat'. Altta gölge kenarlık: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Üç adım gösteren bir iş akışı bölümü tasarlayın: Geliştir (metin rengi #0a72ef), Önizle (#de1d8d), Gönder (#ff5b4f). Her adım: 14px Geist Mono büyük harf etiketi + 24px Geist ağırlık 600 başlık + #4d4d4d'de 16px ağırlık 400 açıklama."

### Yineleme Rehberi
1. CSS kenarlığı yerine her zaman gölge-kenarlık kullanın — `0px 0px 0px 1px rgba(0,0,0,0.08)` temeldir
2. Harf aralığı font boyutuyla ölçeklenir: 48px'de -2.4px, 32px'de -1.28px, 24px'de -0.96px, 14px'de normal
3. Yalnızca üç ağırlık: 400 (oku), 500 (etkileş), 600 (duyur)
4. Renk işlevseldir, asla dekoratif değil — iş akışı renkleri (Kırmızı/Pembe/Mavi) yalnızca boru hattı aşamalarını işaretler
5. Kart gölgelerindeki iç `#fafafa` halkası, Vercel kartlarına ince iç parlaklığı veren unsurdur
6. Teknik etiketler için büyük harfli Geist Mono, diğer her şey için Geist Sans
