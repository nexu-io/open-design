# Cohere'den İlham Alan Tasarım Sistemi

> Kategori: Yapay Zeka & LLM
> Kurumsal yapay zeka platformu. Canlı degradeler, veri yoğun gösterge tablosu estetiği.

## 1. Görsel Tema & Atmosfer

Cohere arayüzü, parlak ve temiz bir kurumsal komuta güvertesidir; yapay zekanın tüketici oyuncağı gibi değil, ciddi bir altyapı gibi hissettirmesi için tasarlanmıştır. Deneyim, içeriğin organik ve bulut benzeri bir kapsayıcı dil oluşturan, cömertçe yuvarlatılmış kartlara (22px yarıçap) organize edildiği parlak beyaz bir tuval üzerinde yaşar. Bu site, CTO'lara ve kurumsal mimarılara hitap eden bir sitedir: soğuk olmadan profesyonel, korkutucu olmadan sofistike.

Tasarım dili, iki dünyayı çift yazı tipi sistemiyle birleştirir: sıkı aralıklı özel bir görünüm serif yazı tipi olan CohereText, manşetlere bir teknoloji manifestosunun ağırlığını verirken, Unica77 Cohere Web geometrik İsviçre hassasiyetiyle tüm gövde ve arayüz metinlerini ele alır. Bu serif/sans eşleşmesi, kurumsal bir yapay zeka platformunu mükemmel biçimde yansıtan "özgüvenli otorite mühendislik netliğiyle buluşuyor" kişiliği yaratır.

Renk, son derece kısıtlı biçimde kullanılır — arayüz neredeyse tamamen siyah-beyazdır ve serin gri kenarlıklar (`#d9d9dd`, `#e5e7eb`) içerir. Mor-eflatun yalnızca fotoğraflı hero bantlarında, degrade bölümlerde ve hover ile odak durumlarını işaret eden etkileşim mavisinde (`#1863dc`) görünür. Bu renk kısıtlaması, renk GERÇEKTEN göründüğünde — ürün ekran görüntülerinde, kurumsal fotoğraflarda ve koyu mor bölümde — maksimum görsel ağırlık taşımasını sağlar.

**Temel Özellikler:**
- Serin gri kapsayıcı kenarlıklı parlak beyaz tuval
- 22px imza kenarlık yarıçapı — karakteristik "Cohere kartı" yuvarlaklığı
- Çift özel yazı tipi: CohereText (görünüm serif) + Unica77 (gövde sans)
- Kurumsal düzeyde renk kısıtlaması: siyah, beyaz, serin griler, minimal mor-mavi vurgu
- Dramatik kontrast sağlayan koyu mor/eflatun hero bölümleri
- Hover durumunda maviye geçen hayalet/şeffaf düğmeler
- Çeşitli gerçek dünya uygulamalarını gösteren kurumsal fotoğrafçılık
- Büyük harf dönüşümleriyle kod ve teknik etiketler için CohereMono

## 2. Renk Paleti & Roller

### Birincil
- **Cohere Siyahı** (`#000000`): Birincil başlık metni ve maksimum vurgulu öğeler.
- **Koyu Siyah Yakını** (`#212121`): Standart gövde bağlantı rengi — saf siyahtan biraz daha yumuşak.
- **Derin Koyu** (`#17171c`): Navigasyon ve koyu bölüm metni için mavi tonlu siyah yakını.

### İkincil & Vurgu
- **Etkileşim Mavisi** (`#1863dc`): Birincil etkileşimli vurgu — düğme hover, odak durumları ve aktif bağlantılarda görünür. Tek renkli eylem rengi.
- **Halka Mavisi** (`#4c6ee6` %50 opaklıkta): Klavye odak göstergeleri için Tailwind halka rengi.
- **Odak Moru** (`#9b60aa`): Giriş odak kenarlık rengi — mat bir eflatun.

### Yüzey & Arka Plan
- **Saf Beyaz** (`#ffffff`): Ana sayfa arka planı ve kart yüzeyi.
- **Kar Beyazı** (`#fafafa`): İnce yükseltilmiş yüzeyler ve açık bölüm arka planları.
- **En Açık Gri** (`#f2f2f2`): Kart kenarlıkları ve en yumuşak kapsayıcı çizgiler.

### Nötrler & Metin
- **Mat Arduvaz** (`#93939f`): Önemsizleştirilmiş altbilgi bağlantıları ve üçüncül metin — hafif mavi-eflatun tonu olan serin gri.
- **Serin Kenarlık** (`#d9d9dd`): Standart bölüm ve liste öğesi kenarlıkları — serin, hafif mor tonlu gri.
- **Açık Kenarlık** (`#e5e7eb`): Daha açık kenarlık varyantı — Tailwind'in standart gray-200'ü.

### Degrade Sistemi
- **Mor-Eflatun Hero Bandı**: Beyaz tuvale karşı dramatik kontrast oluşturan derin mor degrade bölümleri. Bunlar ürün ekran görüntülerini ve temel mesajları barındıran tam genişlikte bantlar olarak görünür.
- **Koyu Altbilgi Degradesi**: Sayfa, koyu mor/antrasit üzerinden siyah altbilgiye geçerek "alacakaranlık" etkisi yaratır.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Görünüm**: `CohereText`, yedek yazı tipleriyle: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Gövde / Arayüz**: `Unica77 Cohere Web`, yedek yazı tipleriyle: `Inter, Arial, ui-sans-serif, system-ui`
- **Kod**: `CohereMono`, yedek yazı tipleriyle: `Arial, ui-sans-serif, system-ui`
- **İkonlar**: `CohereIconDefault` (özel ikon yazı tipi)

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Görünüm / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (sıkı) | -1.44px | Maksimum etki, serif otoritesi |
| İkincil Görünüm | CohereText | 60px (3.75rem) | 400 | 1.00 (sıkı) | -1.2px | Büyük bölüm başlıkları |
| Bölüm Başlığı | Unica77 | 48px (3rem) | 400 | 1.20 (sıkı) | -0.48px | Özellik bölümü başlıkları |
| Alt Başlık | Unica77 | 32px (2rem) | 400 | 1.20 (sıkı) | -0.32px | Kart başlıkları, özellik adları |
| Özellik Başlığı | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Daha küçük bölüm başlıkları |
| Büyük Gövde | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Giriş paragrafları |
| Gövde / Düğme | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Standart gövde, düğme metni |
| Orta Düğme | Unica77 | 14px (0.88rem) | 500 | 1.71 (rahat) | normal | Daha küçük düğmeler, vurgulu etiketler |
| Açıklamalı Yazı | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Meta veriler, açıklamalar |
| Büyük Harf Etiketi | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Büyük harf bölüm etiketleri |
| Küçük | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | En küçük metin, altbilgi bağlantıları |
| Mikro Kod | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Küçük büyük harf kod etiketleri |

### İlkeler
- **Bildirim için serif, kullanım için sans**: CohereText, marka sesini görünüm ölçeğinde taşır — serif uçları, manşetlere yayımlanmış araştırma otoritesi verir. Unica77, her işlevsel şeyi İsviçre-geometrik tarafsızlıkla ele alır.
- **Ölçekte negatif aralık**: CohereText, 60–72px'de -1.2px ile -1.44px harf aralığı kullanarak yoğun, etkili metin blokları oluşturur.
- **Tek gövde ağırlığı**: Neredeyse tüm Unica77 kullanımı 400 ağırlığındadır. 500 ağırlığı yalnızca küçük düğme vurgusu için görünür. Sistem, ağırlık kontrastına değil boyut ve aralığa dayanır.
- **Büyük harf kod etiketleri**: CohereMono, teknik etiketler ve bölüm işaretçileri için pozitif harf aralığıyla (0.16–0.28px) büyük harf kullanır.

## 4. Bileşen Stilleri

### Düğmeler

**Hayalet / Şeffaf**
- Arka plan: şeffaf (`rgba(255, 255, 255, 0)`)
- Metin: Cohere Siyahı (`#000000`)
- Görünür kenarlık yok
- Hover: metin Etkileşim Mavisine (`#1863dc`) geçer, opaklık 0.8
- Odak: Etkileşim Mavisinde katı 2px anahat
- Birincil düğme stili — etkileşime girilene kadar görünmez

**Koyu Katı**
- Arka plan: koyu/siyah
- Metin: Saf Beyaz
- Açık yüzeylerde harekete geçirici mesaj için
- Hap şeklinde veya standart yarıçap

**Anahat**
- Kenarlık tabanlı kapsayıcı
- İkincil eylemlerde kullanılır

### Kartlar & Kapsayıcılar
- Arka plan: Saf Beyaz (`#ffffff`)
- Kenarlık: ince çizgi En Açık Gri (`1px solid #f2f2f2`) ince kartlar için; vurgulu kartlar için Serin Kenarlık (`#d9d9dd`)
- Yarıçap: **22px** — birincil kartlar, görseller ve diyalog kapsayıcıları için imza Cohere yarıçapı. Daha küçük öğeler için ayrıca 4px, 8px, 16px, 20px
- Gölge: minimal — Cohere gölgeler yerine arka plan rengi ve kenarlıklara dayanır
- Özel: bölüm kapsayıcıları için `0px 0px 22px 22px` yarıçap (yalnızca alt yuvarlama)
- Diyalog: modal/diyalog kutuları için 8px yarıçap

### Girdiler & Formlar
- Metin: koyu girdide beyaz, açık girdide siyah
- Odak kenarlığı: `1px solid` ile Odak Moru (`#9b60aa`)
- Odak gölgesi: kırmızı halka (`rgb(179, 0, 0) 0px 0px 0px 2px`) — büyük olasılıkla hata durumu göstergesi
- Odak anahatı: Etkileşim Mavisi katı 2px

### Navigasyon
- Beyaz veya koyu arka planda temiz yatay navigasyon
- Logo: Cohere wordmark (özel SVG)
- Bağlantılar: 16px Unica77'de koyu metin
- Harekete geçirici mesaj: Koyu katı düğme
- Mobil: hamburger menüye daraltma

### Görüntü İşleme
- Çeşitli konular ve ortamlarla kurumsal fotoğrafçılık
- Dramatik bölümler için mor tonlu hero fotoğrafçılığı
- Koyu yüzeylerde ürün arayüzü ekran görüntüleri
- Kart sistemiyle eşleşen 22px yarıçaplı görseller
- Tam genişlikte mor degrade bölümler

### Ayırt Edici Bileşenler

**22px Kart Sistemi**
- 22px kenarlık yarıçapı, Cohere'nin görsel imzasıdır
- Tüm birincil kartlar, görseller ve kapsayıcılar bu yarıçapı kullanır
- Tipik 8–12px'den ayrışan bulut benzeri, organik bir yumuşaklık yaratır

**Kurumsal Güven Çubuğu**
- Yatay şerit halinde gösterilen şirket logoları
- Kurumsal benimsemeyi kanıtlar
- Temiz, tek renkli logo işleme

**Mor Hero Bantları**
- Ürün vitrinlerini barındıran tam genişlikte derin mor bölümler
- Beyaz sayfa akışında dramatik görsel kırılmalar yaratır
- Ürün ekran görüntüleri mor ortamda yüzer

**Büyük Harf Kod Etiketleri**
- Harf aralığıyla büyük harfli CohereMono
- Bölüm işaretçileri ve sınıflandırma etiketleri olarak kullanılır
- Teknik, yapılandırılmış bilgi hiyerarşisi oluşturur

## 5. Düzen İlkeleri

### Aralık Sistemi
- Temel birim: 8px
- Ölçek: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Düğme dolgusu varyanta göre değişir
- Kart iç dolgusu: yaklaşık 24–32px
- Bölüm dikey aralığı: cömert (bölümler arası 56–60px)

### Izgara & Kapsayıcı
- Maksimum kapsayıcı genişliği: duyarlı ölçeklendirmeyle 2560px'e kadar (çok geniş)
- Hero: dramatik tipografili ortalanmış
- Özellik bölümleri: çok sütunlu kart izgaraları
- Kurumsal bölümler: tam genişlikte mor bantlar
- 26 kesme noktası tespit edildi — son derece ayrıntılı duyarlı sistem

### Boşluk Felsefesi
- **Kurumsal netlik**: Her bölüm, aralarında nefes alma alanıyla tek bir net önerme sunar.
- **Hero olarak fotoğrafçılık**: Büyük fotoğraflı bölümler, dekoratif tasarım öğeleri gerektirmeden görsel ilgi sağlar.
- **Kart gruplandırması**: İlgili içerik, doğal bilgi kümeleri oluşturan 22px yuvarlak kartlara gruplandırılır.

### Kenarlık Yarıçapı Ölçeği
- Keskin (4px): Navigasyon öğeleri, küçük etiketler, sayfalama
- Rahat (8px): Diyalog kutuları, ikincil kapsayıcılar, küçük kartlar
- Cömert (16px): Öne çıkan kapsayıcılar, orta kartlar
- Büyük (20px): Büyük özellik kartları
- İmza (22px): Birincil kartlar, hero görselleri, ana kapsayıcılar — Cohere'nin yarıçapı
- Hap (9999px): Düğmeler, etiketler, durum göstergeleri

## 6. Derinlik & Yükseklik

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok, kenarlık yok | Sayfa arka planı, metin blokları |
| Kenarlıklı (Seviye 1) | `1px solid #f2f2f2` veya `#d9d9dd` | Standart kartlar, liste ayırıcılar |
| Mor Bant (Seviye 2) | Tam genişlikte koyu mor arka plan | Hero bölümleri, özellik vitrini |

**Gölge Felsefesi**: Cohere neredeyse gölgesizdir. Derinlik **arka plan rengi kontrastıyla** (mor bantlarda beyaz kartlar, kar üzerinde beyaz yüzey), **kenarlık kapsayıcısıyla** (serin gri kenarlıklar) ve dramatik **açıktan-koyuya bölüm değişimiyle** iletilir. Öğelerin yükseklik kazanması gerektiğinde bunu gölge yayarak değil, koyu üzerinde beyaz olarak elde ederler.

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Tüm birincil kartlarda ve kapsayıcılarda 22px kenarlık yarıçapı kullanın — görsel imzadır
- Negatif harf aralığıyla görünüm başlıklarında (72px, 60px) CohereText kullanın
- Tüm gövde ve arayüz metinlerinde 400 ağırlığında Unica77 kullanın
- Paleti serin gri kenarlıklarla siyah-beyaz tutun
- Etkileşim Mavisini (#1863dc) yalnızca hover/odak etkileşimli durumlar için kullanın
- Dramatik görsel kırılmalar ve ürün vitrini için derin mor bölümler kullanın
- Bölüm etiketleri için CohereMono'da büyük harf + harf aralığı uygulayın
- Çeşitli konularla kurumsal düzeyde uygun fotoğrafçılık sürdürün

### Yapılmayacaklar
- Birincil kartlarda 22px dışında kenarlık yarıçapı kullanmayın — imza yarıçapı önemlidir
- Sıcak renkler eklemeyin — palet kesinlikle serin tonludur
- Ağır gölgeler kullanmayın — derinlik renk kontrastı ve kenarlıklardan gelir
- Gövde metninde kalın (700+) ağırlık kullanmayın — aralık 400–500'dür
- Serif/sans hiyerarşisini atlamayın — başlıklar için CohereText, gövde için Unica77
- Kartlar için yüzey rengi olarak mor kullanmayın — mor tam genişlikte bölümler için ayrılmıştır
- Bölüm aralığını 40px'in altına düşürmeyin — kurumsal düzenler nefes alanına ihtiyaç duyar
- Düğmelere varsayılan olarak süsleme eklemeyin — hayalet/şeffaf temel durumdur

## 8. Duyarlı Davranış

### Kesme Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | <425px | Kompakt düzen, minimal aralık |
| Mobil | 425–640px | Tek sütun, yığılmış kartlar |
| Büyük Mobil | 640–768px | Küçük aralık ayarlamaları |
| Tablet | 768–1024px | 2 sütunlu ızgaralar başlar |
| Masaüstü | 1024–1440px | Tam çok sütunlu düzen |
| Büyük Masaüstü | 1440–2560px | Maksimum kapsayıcı genişliği |

*26 kesme noktası tespit edildi — veri setindeki en ayrıntılı duyarlı sitelerden biri.*

### Dokunma Hedefleri
- Dokunma etkileşimi için yeterli boyutta düğmeler
- Rahat aralıklı navigasyon bağlantıları
- Dokunma hedefleri olarak kart yüzeyleri

### Daraltma Stratejisi
- **Navigasyon**: Tam navigasyon hamburger menüye daraltır
- **Özellik ızgaraları**: Çok sütunlu → 2 sütunlu → tek sütun
- **Hero metni**: 72px → 48px → 32px aşamalı ölçekleme
- **Mor bölümler**: Tam genişliği korur, içerik yığılır
- **Kart ızgaraları**: 3 → 2 → 1 sütun

### Görsel Davranış
- Fotoğrafçılık 22px yarıçaplı kapsayıcılar içinde orantılı olarak ölçeklenir
- Ürün ekran görüntüleri en boy oranını korur
- Mor bölümler arka planı orantılı olarak ölçekler

## 9. Ajan Prompt Kılavuzu

### Hızlı Renk Referansı
- Birincil Metin: "Cohere Siyahı (#000000)"
- Sayfa Arka Planı: "Saf Beyaz (#ffffff)"
- İkincil Metin: "Koyu Siyah Yakını (#212121)"
- Hover Vurgusu: "Etkileşim Mavisi (#1863dc)"
- Mat Metin: "Mat Arduvaz (#93939f)"
- Kart Kenarlıkları: "En Açık Gri (#f2f2f2)"
- Bölüm Kenarlıkları: "Serin Kenarlık (#d9d9dd)"

### Örnek Bileşen Promptları
- "Saf Beyaz (#ffffff) üzerinde CohereText ile 72px 400 ağırlığında, satır yüksekliği 1.0, harf aralığı -1.44px olacak şekilde bir hero bölümü oluşturun. Cohere Siyahı metin. Unica77 ile 18px 400 ağırlığında, satır yüksekliği 1.4 altyazı."
- "22px kenarlık yarıçaplı, beyaz üzerinde 1px katı En Açık Gri (#f2f2f2) kenarlıklı bir özellik kartı tasarlayın. Unica77'de 32px, harf aralığı -0.32px başlık. Unica77'de 16px, Mat Arduvaz (#93939f) gövde metni."
- "Hayalet düğme oluşturun: şeffaf arka plan, Unica77'de 16px Cohere Siyahı metin. Hover durumunda metin 0.8 opaklıkla Etkileşim Mavisine (#1863dc) geçer. Odak: 2px katı Etkileşim Mavisi anahat."
- "Beyaz metinli derin mor tam genişlikte bir bölüm oluşturun. Başlık için CohereText 60px. Ürün ekran görüntüsü 22px kenarlık yarıçapıyla içinde yüzer."
- "CohereMono'da 14px, büyük harf, harf aralığı 0.28px kullanarak bir bölüm etiketi tasarlayın. Mat Arduvaz (#93939f) metin."

### Yineleme Kılavuzu
1. Bir seferde BİR bileşene odaklanın
2. Birincil kartlar için her zaman 22px yarıçap kullanın — "Cohere kart yuvarlaklığı"
3. Yazı tipini belirtin — başlıklar için CohereText, gövde için Unica77, etiketler için CohereMono
4. Etkileşimli öğeler yalnızca hover durumunda Etkileşim Mavisini (#1863dc) kullanır
5. Yüzeyleri serin gri kenarlıklarla beyaz tutun — sıcak ton yok
6. Mor tam genişlikte bölümler içindir, asla kart arka planı olarak kullanılmaz
