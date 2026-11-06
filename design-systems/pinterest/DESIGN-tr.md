# Pinterest'ten İlham Alan Tasarım Sistemi

> Category: Media & Consumer
> Görsel keşif. Kırmızı vurgu, masonry ızgara, görsel ön planda.

## 1. Görsel Tema ve Atmosfer

Pinterest'in web sitesi, görsel keşfi bir yaşam tarzı dergisi gibi ele alan sıcak, ilham verici bir tuvaldir. Tasarım, yumuşak, hafif sıcak bir beyaz arka plan üzerinde çalışır; Pinterest Red (`#e60023`) ise tekil, cesur marka vurgusu olarak öne çıkar. Çoğu teknoloji platformunun soğuk mavileri yerine, Pinterest'in nötr skalası belirgin biçimde sıcak bir alt tona sahiptir — gri tonlar soğuk çelik yerine zeytin/kum renklerine (`#91918c`, `#62625b`, `#e5e5e0`) yaklaşır ve gezinmeyi teşvik eden sıcak, el yapımı bir atmosfer yaratır.

Tipografi, Pin Sans kullanır — Japonca yazı tiplerini de kapsayan geniş bir geri dönüş yığınıyla birlikte özel, tescilli bir yazı tipidir; bu, Pinterest'in küresel erişimini yansıtır. Görüntü ölçeğinde (70px, ağırlık 600), Pin Sans büyük ve davetkar başlıklar oluşturur. Daha küçük boyutlarda sistem kompakttır: düğmeler 12px, altyazılar 12–14px. CSS değişken adlandırma sistemi (`--comp-*`, `--sema-*`, `--base-*`), bileşen düzeyinde, semantik düzeyde ve temel düzeyde olmak üzere üç katmanlı bir tasarım token mimarisini ortaya koyar.

Pinterest'i farklı kılan, cömert border-radius sistemi (12px–40px, artı daireler için %50) ve sıcak tonlu düğme arka planlarıdır. İkincil düğme (`#e5e5e0`), soğuk gri yerine belirgin biçimde sıcak, kum benzeri bir tona sahiptir. Birincil kırmızı düğme 16px yarıçap kullanır — yuvarlak ama hap şeklinde değil. Sıcak rozet arka planları (`hsla(60,20%,98%,.5)` — ince sarı-sıcak bir parlaklık) ve fotoğraf ağırlıklı düzenlerle birlikte, sonuç kurumsal ve steril değil, el yapımı ve kişisel hissettiren bir tasarımdır.

**Temel Özellikler:**
- Zeytin/kum tonlu nötrlerle sıcak beyaz tuval — rahat, klinik değil
- Tekil cesur vurgu olarak Pinterest Red (`#e60023`) — asla ince, her zaman kendinden emin
- Küresel geri dönüş yığınıyla özel Pin Sans yazı tipi (CJK dahil)
- Üç katmanlı token mimarisi: `--comp-*` / `--sema-*` / `--base-*`
- Sıcak ikincil yüzeyler: kum grisi (`#e5e5e0`), sıcak rozet (`hsla(60,20%,98%,.5)`)
- Cömert border-radius: standart 16px, büyük konteynerler için 40px'e kadar
- Fotoğraf öncelikli içerik — pinler/görseller birincil görsel öğedir
- Koyu mor-yakını metin (`#211922`) — sıcak, bir dokunuş erik tonu

## 2. Renk Paleti ve Roller

### Birincil Marka
- **Pinterest Red** (`#e60023`): Birincil CTA, marka vurgusu — cesur, kendinden emin kırmızı
- **Green 700** (`#103c25`): `--base-color-green-700`, başarı/doğa vurgusu
- **Green 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, basılı yeşil

### Metin
- **Erik Siyahı** (`#211922`): Birincil metin — erik alt tonuyla sıcak, neredeyse siyah
- **Siyah** (`#000000`): İkincil metin, düğme metni
- **Zeytin Grisi** (`#62625b`): İkincil açıklamalar, soluk metin
- **Sıcak Gümüş** (`#91918c`): `--comp-button-color-text-transparent-disabled`, devre dışı metin, giriş kenarlıkları
- **Beyaz** (`#ffffff`): Koyu/renkli yüzeylerdeki metin

### Etkileşimli
- **Odak Mavisi** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, odak halkaları
- **Performans Moru** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, performans özellikleri
- **Öneri Moru** (`#7e238b`): `--sema-color-hover-text-recommendation`, yapay zeka önerisi
- **Bağlantı Mavisi** (`#2b48d4`): Bağlantı metni rengi
- **Facebook Mavisi** (`#0866ff`): `--facebook-background-color`, sosyal oturum açma
- **Basılı Mavi** (`#617bff`): `--base-color-pressed-blue-200`, basılı durum

### Yüzey ve Kenarlık
- **Kum Grisi** (`#e5e5e0`): İkincil düğme arka planı — sıcak, el yapımı hissi
- **Sıcak Işık** (`#e0e0d9`): Dairesel düğme arka planları, rozetler
- **Sıcak Parlaklık** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, ince sıcak rozet arka planı
- **Sis** (`#f6f6f3`): Açık yüzey (%50 opaklıkta)
- **Devre Dışı Kenarlık** (`#c8c8c1`): `--sema-color-border-disabled`, devre dışı kenarlıklar
- **Hover Grisi** (`#bcbcb3`): `--base-color-hover-grayscale-150`, hover kenarlığı
- **Koyu Yüzey** (`#33332e`): Koyu bölüm arka planları

### Semantik
- **Hata Kırmızısı** (`#9e0a0a`): Onay kutusu/form hata durumları

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Birincil**: `Pin Sans`, geri dönüşler: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|-----|-----------|-------|---------|-----------------|--------------|--------|
| Ekran Hero | Pin Sans | 70px (4.38rem) | 600 | normal | normal | Maksimum etki |
| Bölüm Başlığı | Pin Sans | 28px (1.75rem) | 700 | normal | -1.2px | Negatif izleme |
| Gövde | Pin Sans | 16px (1.00rem) | 400 | 1.40 | normal | Standart okuma |
| Kalın Altyazı | Pin Sans | 14px (0.88rem) | 700 | normal | normal | Güçlü meta veri |
| Altyazı | Pin Sans | 12px (0.75rem) | 400–500 | 1.50 | normal | Küçük metin, etiketler |
| Düğme | Pin Sans | 12px (0.75rem) | 400 | normal | normal | Düğme etiketleri |

### İlkeler
- **Kompakt tür skalası**: Aralık dramatik bir sıçramayla 12px–70px arasındadır — çoğu işlevsel metin yoğun, uygulama benzeri bir bilgi hiyerarşisi oluşturan 12–16px arasındadır.
- **Sıcak ağırlık dağılımı**: Başlıklar için 600–700, gövde için 400–500. Ultra-hafif ağırlıklar yok — yazı tipi her zaman önemli hissettiriyor.
- **Başlıklarda negatif izleme**: 28px başlıklarda -1.2px, rahat ve samimi bölüm başlıkları oluşturur.
- **Tek yazı tipi ailesi**: Pin Sans her şeyi halleder — ikincil bir ekran veya sabit aralıklı yazı tipi algılanmadı.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil Kırmızı**
- Arka plan: `#e60023` (Pinterest Red)
- Metin: `#000000` (siyah — kırmızı üzerinde kontrast için alışılmadık tercih)
- Dolgu: 6px 14px
- Yarıçap: 16px (cömertçe yuvarlak, hap şeklinde değil)
- Kenarlık: `2px solid rgba(255, 255, 255, 0)` (şeffaf)
- Odak: semantik kenarlık + CSS değişkenleri aracılığıyla taslak

**İkincil Kum**
- Arka plan: `#e5e5e0` (sıcak kum grisi)
- Metin: `#000000`
- Dolgu: 6px 14px
- Yarıçap: 16px
- Odak: aynı semantik kenarlık sistemi

**Dairesel Eylem**
- Arka plan: `#e0e0d9` (sıcak ışık)
- Metin: `#211922` (erik siyahı)
- Yarıçap: %50 (daire)
- Kullanım: Pin eylemleri, gezinme denetimleri

**Ghost / Şeffaf**
- Arka plan: şeffaf
- Metin: `#000000`
- Kenarlık yok
- Kullanım: Üçüncül eylemler

### Kartlar ve Konteynerler
- Cömert yarıçaplı (12px–20px) fotoğraf öncelikli pin kartları
- Çoğu kartta geleneksel box-shadow yok
- Beyaz veya sıcak sis arka planları
- Bazı görsel konteynerlerde 8px kalın beyaz kenarlık

### Giriş Alanları
- E-posta girişi: beyaz arka plan, `1px solid #91918c` kenarlık, 16px yarıçap, 11px 15px dolgu
- Odak: CSS değişkenleri aracılığıyla semantik kenarlık + taslak sistemi

### Gezinme
- Beyaz veya sıcak arka planda temiz başlık
- Pinterest logosu + arama çubuğu ortalanmış
- Gezinme bağlantıları için 16px Pin Sans
- Aktif durumlar için Pinterest Red vurguları

### Görsel İşleme
- Pin tarzı masonry ızgara (Pinterest'in imzalı düzeni)
- Yuvarlak köşeler: görsellerde 12px–20px
- Birincil içerik olarak fotoğrafçılık — her pin bir görseldir
- Öne çıkan görsel konteynerlerinde kalın beyaz kenarlıklar (8px)

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Skala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Büyük sıçramalar: Bölüm aralığı için 32px → 80px → 100px

### Izgara ve Konteyner
- Pin içeriği için masonry ızgara (imzalı düzen)
- Cömert maksimum genişlikle ortalanmış içerik bölümleri
- Tam genişlikte koyu alt bilgi
- Birincil gezinme öğesi olarak arama çubuğu

### Boşluk Felsefesi
- **İlham yoğunluğu**: Masonry ızgara pinleri sıkıca paketler — içerik yoğunluğu DEĞERİN kendisidir. Boşluk bölümler arasında bulunur, ızgara içinde değil.
- **Yukarıda nefes, aşağıda yoğunluk**: Kahraman/özellik bölümleri cömert dolgu alır; pin ızgarası kompakt ve sürükleyicidir.

### Border Radius Skalası
- Standart (12px): Küçük kartlar, bağlantılar
- Düğme (16px): Düğmeler, girişler, orta kartlar
- Konforlu (20px): Özellik kartları
- Büyük (28px): Büyük konteynerler
- Bölüm (32px): Sekme öğeleri, büyük paneller
- Kahraman (40px): Kahraman konteynerleri, büyük özellik blokları
- Daire (%50): Eylem düğmeleri, sekme göstergeleri

## 6. Derinlik ve Yükseklik

| Seviye | İşlem | Kullanım |
|--------|-------|---------|
| Düz (Seviye 0) | Gölge yok | Varsayılan — pinler gölge değil içeriğe güvenir |
| İnce (Seviye 1) | Minimal gölge (tokenlardan) | Yükseltilmiş katmanlar, açılır menüler |
| Odak (Erişilebilirlik) | `--sema-color-border-focus-outer-default` halkası | Odak durumları |

**Gölge Felsefesi**: Pinterest minimal gölgeler kullanır. Masonry ızgara, yükseklik efektleri yerine görsel ilgi oluşturmak için içeriğe (fotoğrafçılık) dayanır. Derinlik, yüzey renklerinin sıcaklığından ve konteynerlerin cömert yuvarlaklığından gelir.

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Sıcak nötrler kullan (`#e5e5e0`, `#e0e0d9`, `#91918c`) — sıcak zeytin/kum tonu kimliğin kendisidir
- Pinterest Red'i (`#e60023`) yalnızca birincil CTA'lar için uygula — cesur ve tekil
- Yalnızca Pin Sans kullan — her şey için tek yazı tipi
- Cömert border-radius uygula: düğmeler/girişler için 16px, kartlar için 20px+
- Masonry ızgarayı yoğun tut — içerik yoğunluğu değerdir
- İnce sıcak parlaklıklar için sıcak rozet arka planları kullan (`hsla(60,20%,98%,.5)`)
- Birincil metin için `#211922` (erik siyahı) kullan — saf siyahtan daha sıcak

### Yapılmayacaklar
- Soğuk gri nötrler kullanma — her zaman sıcak/zeytin tonlu
- Birincil metin olarak saf siyah (`#000000`) kullanma — erik siyahı (`#211922`) kullan
- Hap şekilli düğmeler kullanma — 16px yarıçap yuvarlak ama hap şeklinde değil
- Ağır gölgeler ekleme — Pinterest tasarım olarak düzdür, derinlik içerikten gelir
- Kartlarda küçük border-radius (<12px) kullanma — cömert yuvarlama esastır
- Ek marka renkleri tanıtma — kırmızı + sıcak nötrler tam paletdir
- İnce yazı tipi ağırlıkları kullanma — Pin Sans minimum 400

## 8. Duyarlı Davranış

### Kırılma Noktaları
| İsim | Genişlik | Temel Değişiklikler |
|------|---------|-------------------|
| Mobil | <576px | Tek sütun, kompakt düzen |
| Büyük Mobil | 576–768px | 2 sütunlu pin ızgarası |
| Tablet | 768–890px | Genişletilmiş ızgara |
| Küçük Masaüstü | 890–1312px | Standart masonry ızgara |
| Masaüstü | 1312–1440px | Tam düzen |
| Büyük Masaüstü | 1440–1680px | Genişletilmiş ızgara sütunları |
| Ultra-geniş | >1680px | Maksimum ızgara yoğunluğu |

### Daraltma Stratejisi
- Pin ızgarası: 5+ sütun → 3 → 2 → 1
- Gezinme: arama çubuğu + simgeler → basitleştirilmiş mobil gezinme
- Özellik bölümleri: yan yana → yığılmış
- Kahraman: 70px → orantılı olarak küçülür
- Alt bilgi: koyu çok sütunlu → yığılmış

## 9. Ajan Prompt Kılavuzu

### Hızlı Renk Referansı
- Marka: Pinterest Red (`#e60023`)
- Arka plan: Beyaz (`#ffffff`)
- Metin: Erik Siyahı (`#211922`)
- İkincil metin: Zeytin Grisi (`#62625b`)
- Düğme yüzeyi: Kum Grisi (`#e5e5e0`)
- Kenarlık: Sıcak Gümüş (`#91918c`)
- Odak: Odak Mavisi (`#435ee5`)

### Örnek Bileşen Promptları
- "Kahraman oluştur: beyaz arka plan. 70px Pin Sans ağırlık 600 başlık, erik siyahı (#211922). Kırmızı CTA düğmesi (#e60023, 16px yarıçap, 6px 14px dolgu). İkincil kum düğmesi (#e5e5e0, 16px yarıçap)."
- "Pin kartı tasarla: beyaz arka plan, 16px yarıçap, gölge yok. Fotoğrafçılık üstte, 16px Pin Sans ağırlık 400 açıklama altında #62625b rengiyle."
- "Dairesel eylem düğmesi oluştur: #e0e0d9 arka plan, %50 yarıçap, #211922 simge."
- "Giriş alanı oluştur: beyaz arka plan, 1px solid #91918c, 16px yarıçap, 11px 15px dolgu. Odak: semantik tokenlar aracılığıyla mavi taslak."
- "Koyu alt bilgi tasarla: #33332e arka plan. Beyaz Pinterest script logosu. #91918c rengiyle 12px Pin Sans bağlantılar."

### Yineleme Kılavuzu
1. Her yerde sıcak nötrler — zeytin/kum griler, asla soğuk çelik
2. Yalnızca CTA'lar için Pinterest Red — cesur ve tekil
3. Düğmeler/girişler için 16px yarıçap, kartlar için 20px+ — cömert ama hap şeklinde değil
4. Pin Sans tek yazı tipidir — UI için 12px kompakt, ekran için 70px
5. Fotoğrafçılık tasarımı taşır — UI sıcak ve minimal kalır
6. Metin için erik siyahı (#211922) — saf siyahtan daha sıcak
