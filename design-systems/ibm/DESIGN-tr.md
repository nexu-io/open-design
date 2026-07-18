# IBM'den İlham Alan Tasarım Sistemi

> Category: Media & Consumer
> Kurumsal teknoloji. Carbon tasarım sistemi, yapılandırılmış mavi palet.

## 1. Görsel Tema ve Atmosfer

IBM'in web sitesi, Carbon Design System üzerine inşa edilmiş kurumsal otoritenin dijital somutlaşmasıdır — o denli metodolojik biçimde yapılandırılmış bir tasarım dili ki mühendislik spesifikasyonu olarak render edilmiş bir web sayfası izlenimi verir. Sayfa, keskin bir dualite üzerine işler: parlak beyaz (`#ffffff`) bir zemin üzerinde neredeyse siyah (`#161616`) metin ve bunu tek, değişmez bir vurguyla noktalayan IBM Blue 60 (`#0f62fe`). Bu, oyuncu tech-startup minimalizmi değil; piksellere damıtılmış kurumsal hassasiyettir. Her öge Carbon'ın katı 2x grid'i içinde yer alır, her renk bir semantik token'a karşılık gelir, her boşluk değeri 8px temel birime hizalanır.

IBM Plex yazı tipi ailesi sistemin omurgasıdır. Görsel başlıklar için ince ağırlıkta (300) IBM Plex Sans, büyük boyutlarda beklenmedik biçimde havadar, neredeyse narin bir nitelik yaratır — IBM'in kurumsal ağırlığına karşı bilinçli bir denge noktasıdır. Gövde boyutlarında, 14px yazı altı başlıklarında 0.16px harf aralığıyla regular ağırlık (400) kullanımı, Carbon metnini tasarlanmış değil mühendislikle üretilmiş hissettiren özenli mikro-takip özelliğini ortaya koyar. IBM Plex Mono; kod, veri ve teknik etiketlere hizmet ederek nadiren gün yüzüne çıkan IBM Plex Serif ile birlikte aile üçlüsünü tamamlar.

IBM'in görsel kimliğini tek renkli-artı-mavi ötesinde tanımlayan şey, Carbon'ın bileşen token sistemine dayanmasıdır. Her etkileşimli durum, `--cds-` (Carbon Design System) önekiyle başlayan bir CSS özel özelliğine karşılık gelir. Düğmelerin sabit kodlu renkleri yoktur; `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active` referanslarını kullanırlar. Bu token'lı mimari, tüm görsel katmanın derinden sistematik bir temel üzerindeki ince bir kaplama olduğu anlamına gelir — iyi yazılmış bir API'nin tasarım eşdeğeri.

**Temel Özellikler:**
- Görsel kullanım için weight 300 (Light) IBM Plex Sans — tipografik sadelik aracılığıyla kurumsal ciddiyet
- Küçük boyutlarda tutarlı 0.16px harf aralığıyla kod ve teknik içerik için IBM Plex Mono
- Tek vurgu rengi: IBM Blue 60 (`#0f62fe`) — her etkileşimli öge, her CTA, her bağlantı
- Tüm semantik renkleri yöneten, değişken düzeyinde tema değiştirmeyi mümkün kılan Carbon token sistemi (`--cds-*`)
- Katı uyumla 8px boşluk grid'i — keyfi değerler yok, her şey hizalanır
- `#f4f4f4` Gray 10 yüzeyinde düz, kenarsız kartlar — gölgeler değil, arka plan rengi katmanlama ile derinlik
- Alt kenarlıklı giriş alanları (kutu değil) — Carbon'ın imza form deseni
- Birincil düğmelerde 0px border-radius — özür dilemeksizin dikdörtgen, yumuşama yok

## 2. Renk Paleti ve Rolleri

### Birincil
- **IBM Blue 60** (`#0f62fe`): Tekil etkileşimli renk. Birincil düğmeler, bağlantılar, odak durumları, aktif göstergeler. Temel UI paletindeki tek kromatik ton budur.
- **White** (`#ffffff`): Sayfa arka planı, kart yüzeyleri, mavi üzerinde düğme metni, `--cds-background`.
- **Gray 100** (`#161616`): Birincil metin, başlıklar, koyu yüzey arka planları, nav çubuğu, footer. `--cds-text-primary`.

### Nötr Ölçek (Gri Ailesi)
- **Gray 100** (`#161616`): Birincil metin, başlıklar, koyu UI çerçevesi, footer arka planı.
- **Gray 90** (`#262626`): İkincil koyu yüzeyler, koyu arka planlarda hover durumları.
- **Gray 80** (`#393939`): Üçüncül koyu, aktif durumlar.
- **Gray 70** (`#525252`): İkincil metin, yardımcı metin, açıklamalar. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Yer tutucu metin, devre dışı metin.
- **Gray 50** (`#8d8d8d`): Devre dışı ikonlar, soluk etiketler.
- **Gray 30** (`#c6c6c6`): Kenarlıklar, ayırıcı çizgiler, giriş alt kenarlıkları. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Narin kenarlıklar, kart dış çizgileri.
- **Gray 10** (`#f4f4f4`): İkincil yüzey arka planı, kart dolguları, dönüşümlü satırlar. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Gray 10 yüzeyler için hover durumu.

### Etkileşimli
- **Blue 60** (`#0f62fe`): Birincil etkileşimli — düğmeler, bağlantılar, odak. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Bağlantı hover durumu. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Mavi ögelerde aktif/basılı durum.
- **Blue 10** (`#edf5ff`): Mavi ton yüzeyi, seçili satır arka planı.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — odaklanmış ögelerde 2px içe kenarlık.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — koyu arka planlarda odak için beyaz iç halka.

### Destek ve Durum
- **Red 60** (`#da1e28`): Hata, tehlike. `--cds-support-error`.
- **Green 50** (`#24a148`): Başarı. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Uyarı. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Bilgilendirme. `--cds-support-info`.

### Koyu Tema (Gray 100 Teması)
- **Background**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Kart ve kapsayıcı yüzeyleri.
- **Layer 02**: Gray 80 (`#393939`). Yükseltilmiş yüzeyler.
- **Text Primary**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Text Secondary**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Border Subtle**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactive**: Blue 40 (`#78a9ff`). Kontrast için bağlantılar ve etkileşimli ögeler daha açık tona kayar.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Birincil**: `IBM Plex Sans`, geri dönüş seçenekleriyle: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, geri dönüş seçenekleriyle: `Menlo, Courier, monospace`
- **Serif** (sınırlı kullanım): `IBM Plex Serif`, editoryal/ifadesel bağlamlar için
- **İkon Yazı Tipi**: `ibm_icons` — 20px'de özel ikon glifleri

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Maksimum etki, zariflik için hafif ağırlık |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | İkincil hero, duyarlı geri dönüş |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | İfadesel başlık |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Bölüm başlıkları |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Alt bölüm başlıkları |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Kart başlıkları, özellik başlıkları |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Daha hafif kart başlıkları |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Standart okuma metni |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Vurgulu gövde, etiketler |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Kompakt gövde, alt yazılar |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Kalın alt yazılar, navigasyon ögeleri |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Meta veri, zaman damgaları |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Satır içi kod, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Kod blokları |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Hero mono dekoratif |

### İlkeler
- **Görsel boyutlarda hafif ağırlık**: Carbon'ın ifadesel tipografi seti, 42px ve üzerinde weight 300 (Light) kullanır. Bu, özgün bir gerilim yaratır — içerik kurumsal otoriteyle konuşurken harf formları tipografik hafifliğiyle fısıldar.
- **Küçük boyutlarda mikro-takip**: 14px'de 0.16px harf aralığı, 12px'de 0.32px. Görünürde önemsiz bu değerler, Carbon'ın kompakt boyutlarda okunabilirlik için gizli silahıdır — sıkışık IBM Plex harf formlarını tam yeterince açar.
- **Üç işlevsel ağırlık**: 300 (görsel/ifadesel), 400 (gövde/okuma), 600 (vurgu/UI etiketleri). Weight 700, üretim tipografi ölçeğinden bilinçli olarak dışarıda bırakılmıştır.
- **Üretken ve İfadesel**: Üretken setler, yoğun UI için daha sıkı satır yükseklikleri (1.29) kullanır. İfadesel setler, pazarlama ve editoryal içerikler için daha fazla nefes alır (1.40-1.50).

## 4. Bileşen Stilleri

### Düğmeler

**Birincil Düğme (Mavi)**
- Background: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Metin: `#ffffff` (White)
- Padding: 14px 63px 14px 15px (asimetrik — sondaki ikon için alan)
- Border: 1px solid transparent
- Border-radius: 0px (keskin dikdörtgen — Carbon imzası)
- Yükseklik: 48px (varsayılan), 40px (kompakt), 64px (ifadesel)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Aktif: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Odak: `2px solid #0f62fe` içe + `1px solid #ffffff` iç

**İkincil Düğme (Gri)**
- Background: `#393939` (Gray 80)
- Metin: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Aktif: `#6f6f6f` (Gray 60)
- Birincil ile aynı padding/radius

**Üçüncül Düğme (Ghost Blue)**
- Background: transparent
- Metin: `#0f62fe` (Blue 60)
- Border: 1px solid `#0f62fe`
- Hover: `#0353e9` metin + Blue 10 arka plan tonu
- Border-radius: 0px

**Ghost Düğme**
- Background: transparent
- Metin: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Border: yok
- Hover: `#e8e8e8` arka plan tonu

**Tehlike Düğmesi**
- Background: `#da1e28` (Red 60)
- Metin: `#ffffff`
- Hover: `#b81921` (Red 70)

### Kartlar ve Kapsayıcılar
- Background: Beyaz temada `#ffffff`, yükseltilmiş kartlar için `#f4f4f4` (Gray 10)
- Border: yok (düz tasarım — çoğu kartta kenarlık veya gölge yoktur)
- Border-radius: 0px (dikdörtgen düğme estetiğiyle uyumlu)
- Hover: Tıklanabilir kartlarda arka plan `#e8e8e8`'e (Gray 10 Hover) kayar
- İçerik padding: 16px
- Ayırma: Gölgeler yerine arka plan rengi katmanlama (beyaz → gray 10 → beyaz)

### Giriş Alanları ve Formlar
- Background: `#f4f4f4` (Gray 10) — `--cds-field`
- Metin: `#161616` (Gray 100)
- Padding: 0px 16px (yalnızca yatay)
- Yükseklik: 40px (varsayılan), 48px (büyük)
- Border: yan/üst taraflarda yok — altta `2px solid transparent`
- Alt kenarlık aktif: `2px solid #161616` (Gray 100)
- Odak: `2px solid #0f62fe` (Blue 60) alt kenarlık — `--cds-focus`
- Hata: `2px solid #da1e28` (Red 60) alt kenarlık
- Etiket: 12px IBM Plex Sans, 0.32px harf aralığı, Gray 70
- Yardımcı metin: 12px, Gray 60
- Yer tutucu: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (üst) — giriş alanları keskin köşelidir

### Navigasyon
- Background: `#161616` (Gray 100) — tam genişlikte koyu masthead
- Yükseklik: 48px
- Logo: IBM 8 çubuklu logo, koyu üzerinde beyaz, sola hizalı
- Bağlantılar: 14px IBM Plex Sans, weight 400, varsayılan `#c6c6c6` (Gray 30)
- Bağlantı hover: `#ffffff` metin
- Aktif bağlantı: Alt kenarlık göstergesiyle `#ffffff`
- Platform değiştirici: Sola hizalı yatay sekmeler
- Arama: İkon tetiklemeli kayan arama alanı
- Mobil: Soldan kayan panel ile hamburger menü

### Bağlantılar
- Varsayılan: Alt çizgi olmadan `#0f62fe` (Blue 60)
- Hover: Alt çizgiyle `#0043ce` (Blue 70)
- Ziyaret edilmiş: Blue 60 kalır (ziyaret edilmiş durum değişikliği yok)
- Satır içi bağlantılar: Gövde metninde varsayılan olarak alt çizgilidir

### Ayırt Edici Bileşenler

**İçerik Bloğu (Hero/Özellik)**
- Tam genişlikte dönüşümlü beyaz/gray-10 arka plan bantları
- 60px veya 48px görsel tipografi ile sola hizalı başlık
- Ok ikonu olan mavi birincil düğme olarak CTA
- Mobilde sağa hizalı veya altta görsel/illüstrasyon

**Fayans (Tıklanabilir Kart)**
- Background: `#f4f4f4` veya `#ffffff`
- Tam genişlikte alt kenarlık veya hover'da arka plan kayması
- Hover'da sağ altta ok ikonu
- Gölge yok — düzlük kimliğin ta kendisi

**Etiket / Yafta**
- Background: %10 opaklıkta bağlamsal renk (ör. Blue 10, Red 10)
- Metin: Karşılık gelen 60 tonunda renk
- Padding: 4px 8px
- Border-radius: 24px (hap şekli — 0px kuralının istisnası)
- Yazı tipi: 12px weight 400

**Bildirim Bandı**
- Tam genişlikte çubuk, genellikle Blue 60 veya Gray 100 arka plan
- Beyaz metin, 14px
- Kapat/yoksay ikonu sağa hizalı

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px (Carbon 2x grid)
- Bileşen boşluk ölçeği: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Düzen boşluk ölçeği: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini birim: 8px (kullanılabilir en küçük boşluk)
- Bileşenler içi padding: genellikle 16px
- Kartlar/fayanslar arasındaki boşluk: 1px (ince çizgi) veya 16px (standart)

### Grid ve Kapsayıcı
- 16 sütunlu grid (Carbon'ın 2x grid sistemi)
- Maksimum içerik genişliği: 1584px (maksimum kesme noktası)
- Sütun boşlukları: 32px (mobilde 16px)
- Kenar boşluğu: 16px (mobil), 32px (tablet ve üzeri)
- Okunabilir satır uzunlukları için içerik genellikle 8-12 sütun kaplar
- Tam kanatlı bölümler kapsanan içerikle dönüşümlü olarak kullanılır

### Beyaz Alan Felsefesi
- **İşlevsel yoğunluk**: Carbon, geniş beyaz alan yerine üretken yoğunluğu tercih eder. Bölümler, tüketici tasarım sistemlerine kıyasla sıkıca paketlenmiştir — bu, IBM'in kurumsal DNA'sını yansıtır.
- **Arka plan rengi bölgeleme**: Bölümler arasında büyük padding kullanmak yerine IBM, minimum dikey alanla görsel ayrım oluşturmak için dönüşümlü arka plan renkleri (beyaz → gray 10 → beyaz) kullanır.
- **Tutarlı 48px ritmi**: Ana bölüm geçişlerinde 48px dikey boşluk kullanılır. Hero bölümleri 80px–96px kullanabilir.

### Border Radius Ölçeği
- **0px**: Birincil düğmeler, giriş alanları, fayanslar, kartlar — baskın uygulama. Carbon temelden dikdörtgenseldir.
- **2px**: Küçük etkileşimli ögelerde ara sıra (etiketler)
- **24px**: Etiketler/yaftalar (hap şekli — tek yuvarlak istisna)
- **50%**: Avatar daireleri, ikon kapsayıcıları

## 6. Derinlik ve Yükseklik

| Seviye | Uygulama | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok, `#ffffff` arka plan | Varsayılan sayfa yüzeyi |
| Layer 01 | Gölge yok, `#f4f4f4` arka plan | Kartlar, fayanslar, dönüşümlü bölümler |
| Layer 02 | Gölge yok, `#e0e0e0` arka plan | Layer 01 içindeki yükseltilmiş paneller |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Açılır menüler, araç ipuçları, taşma menüleri |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + koyu örtü | Modal diyaloglar, yan paneller |
| Odak | `2px solid #0f62fe` içe + `1px solid #ffffff` | Klavye odak halkası |
| Alt kenarlık | Alt kenarda `2px solid #161616` | Aktif giriş, aktif sekme göstergesi |

**Gölge Felsefesi**: Carbon bilinçli olarak gölgeden kaçınır. IBM, derinliği esas olarak arka plan rengi katmanlama yoluyla elde eder — box-shadow eklemek yerine giderek koyulaşan gri yüzeyleri üst üste dizer. Bu, hiyerarşinin simüle edilmiş ışık değil renk değeriyle iletildiği düz, baskı ilhamlı bir estetik yaratır. Gölgeler yalnızca içeriği gerçekten kaplayan kayan ögeler (açılır menüler, araç ipuçları, modallar) için ayrılmıştır. Bu öz denetim, nadir görülen gölgeye anlamlı bir etki kazandırır — Carbon'da bir şey yüzüyorsa, önemi vardır.

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Görsel boyutlarda (42px+) IBM Plex Sans'ı weight 300 ile kullanın — hafiflik kasıtlıdır
- 14px gövde metninde 0.16px, 12px alt yazılarda 0.32px harf aralığı uygulayın
- Düğmeler, giriş alanları, kartlar ve fayanslar için 0px border-radius kullanın — dikdörtgenler sistemin ta kendisidir
- Uygularken `--cds-*` token adlarına başvurun (ör. `--cds-button-primary`, `--cds-text-primary`)
- Gölgeler yerine derinlik için arka plan rengi katmanlama (beyaz → gray 10 → gray 20) kullanın
- Giriş alanı göstergeleri için alt kenarlık (kutu değil) kullanın
- 48px varsayılan düğme yüksekliğini ve ikon barındırmak için asimetrik padding'i koruyun
- Blue 60 (`#0f62fe`) değerini tek vurgu olarak uygulayın — hepsini yöneten tek mavi

### Yapılmayacaklar
- Düğme köşelerini yuvarlatmayın — 0px radius Carbon kimliğidir
- Kartlarda veya fayanslar üzerinde gölge kullanmayın — düzlük asıl amaçtır
- Ek vurgu renkleri eklemeyin — IBM'in sistemi tek renkli + mavidir
- Weight 700 (Bold) kullanmayın — ölçek 600'de (Semibold) biter
- Görsel boyutlu metne harf aralığı eklemeyin — takip yalnızca 14px ve altı içindir
- Giriş alanlarını tam kenarlıklarla kutu içine almayın — Carbon giriş alanları yalnızca alt kenarlık kullanır
- Degrade arka planlar kullanmayın — IBM'in yüzeyleri düz, düz renklerdir
- 8px boşluk grid'inden sapmayin — her değer 8'e bölünebilir olmalıdır (mikro ayarlar için 2px ve 4px ile)

## 8. Duyarlı Davranış

### Kesme Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Small (sm) | 320px | Tek sütun, hamburger navigasyon, 16px kenar boşlukları |
| Medium (md) | 672px | 2 sütunlu grid'ler başlar, genişletilmiş içerik |
| Large (lg) | 1056px | Tam navigasyon görünür, 3-4 sütunlu grid'ler |
| X-Large (xlg) | 1312px | Maksimum içerik yoğunluğu, geniş düzenler |
| Max | 1584px | Maksimum içerik genişliği, kenar boşluklarıyla ortalanmış |

### Dokunma Hedefleri
- Düğme yüksekliği: 48px varsayılan, minimum 40px (kompakt)
- Navigasyon bağlantıları: Dokunma için 48px satır yüksekliği
- Giriş yüksekliği: 40px varsayılan, 48px büyük
- İkon düğmeler: 48px kare dokunma hedefi
- Mobil menü ögeleri: Tam genişlikte 48px satırlar

### Daraltma Stratejisi
- Hero: Görüntü alanı daraldıkça 60px görsel → 42px → 32px başlık
- Navigasyon: Tam yatay masthead → kayan panel ile hamburger
- Grid: 4 sütun → 2 sütun → tek sütun
- Fayanslar/kartlar: Yatay grid → dikey yığın
- Görseller: En-boy oranını koru, max-width 100%
- Footer: Çok sütunlu bağlantı grupları → üst üste tek sütun
- Bölüm padding'i: 48px → 32px → 16px

### Görsel Davranışı
- `max-width: 100%` ile duyarlı görseller
- Ürün illüstrasyonları orantılı ölçeklenir
- Hero görseller yan yana konumdan altında üst üste konuma geçebilir
- Veri görselleştirmeleri, mobilde yatay kaydırmayla en-boy oranını korur

## 9. Ajan Prompt Kılavuzu

### Hızlı Renk Referansı
- Birincil CTA: IBM Blue 60 (`#0f62fe`)
- Arka plan: White (`#ffffff`)
- Başlık metni: Gray 100 (`#161616`)
- Gövde metni: Gray 100 (`#161616`)
- İkincil metin: Gray 70 (`#525252`)
- Yüzey/Kart: Gray 10 (`#f4f4f4`)
- Kenarlık: Gray 30 (`#c6c6c6`)
- Bağlantı: Blue 60 (`#0f62fe`)
- Bağlantı hover: Blue 70 (`#0043ce`)
- Odak halkası: Blue 60 (`#0f62fe`)
- Hata: Red 60 (`#da1e28`)
- Başarı: Green 50 (`#24a148`)

### Örnek Bileşen Promptları
- "Beyaz arka plan üzerinde bir hero bölümü oluştur. Başlık 60px IBM Plex Sans weight 300, line-height 1.17, renk #161616. Alt başlık 16px weight 400, line-height 1.50, renk #525252, max-width 640px. Mavi CTA düğmesi (#0f62fe arka plan, #ffffff metin, 0px border-radius, 48px yükseklik, 14px 63px 14px 15px padding)."
- "Bir kart fayansı tasarla: #f4f4f4 arka plan, 0px border-radius, 16px padding. Başlık 20px IBM Plex Sans weight 600, line-height 1.40, renk #161616. Gövde 14px weight 400, letter-spacing 0.16px, line-height 1.29, renk #525252. Hover: arka plan #e8e8e8'e kayar."
- "Bir form alanı oluştur: #f4f4f4 arka plan, 0px border-radius, 40px yükseklik, 16px yatay padding. Üstte etiket 12px weight 400, letter-spacing 0.32px, renk #525252. Alt kenarlık: varsayılan 2px solid transparent, odakta 2px solid #0f62fe. Yer tutucu: #6f6f6f."
- "Koyu bir navigasyon çubuğu oluştur: #161616 arka plan, 48px yükseklik. IBM logosu beyaz sola hizalı. Bağlantılar 14px IBM Plex Sans weight 400, renk #c6c6c6. Hover: #ffffff metin. Aktif: 2px alt kenarlıkla #ffffff."
- "Bir etiket bileşeni oluştur: Blue 10 (#edf5ff) arka plan, Blue 60 (#0f62fe) metin, 4px 8px padding, 24px border-radius, 12px IBM Plex Sans weight 400."

### Yineleme Kılavuzu
1. Düğmelerde, giriş alanlarında ve kartlarda her zaman 0px border-radius kullanın — bu Carbon'da tartışmaya kapalıdır
2. Harf aralığı yalnızca küçük boyutlarda: 14px'de 0.16px, 12px'de 0.32px — görsel metinde asla
3. Üç ağırlık: 300 (görsel), 400 (gövde), 600 (vurgu) — kalın yok
4. Blue 60 tek vurgu rengidir — ikincil vurgu tonları eklemeyin
5. Derinlik arka plan rengi katmalamasından gelir (beyaz → #f4f4f4 → #e0e0e0), gölgelerden değil
6. Giriş alanlarının yalnızca alt kenarlığı vardır, asla tam kutu içine alınmaz
7. Carbon uyumluluğunu korumak için token adlandırmada `--cds-` önekini kullanın
8. 48px evrensel etkileşimli öge yüksekliğidir
