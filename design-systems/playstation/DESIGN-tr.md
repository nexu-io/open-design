# PlayStation'dan İlham Alan Tasarım Sistemi

> Category: Medya ve Tüketici
> Oyun konsolu perakendesi. Üç yüzeyli kanal düzeni, sessiz otorite görsel tipi, cyan hover ölçeği.

## 1. Görsel Tema ve Atmosfer

PlayStation.com, tesadüfen eğlence de satan premium bir tüketici elektroniği markasının pazarlama kolu gibi davranır. Sayfa, **birbirini izleyen yüzeylerin dikey bir kanalı** olarak düzenlenmiştir: yakın siyah bir üst başlık ve hero, ortada bir dizi kâğıt beyazı editoryal panel ve tüm deneyimi temellendiren derin kobalt mavi bir alt bilgi. Bu yüzey modları arasında site, büyük ölçüde fotoğrafa ve 3D ürün renderlarına yaslanır — PS5 konsolu, oyun kapak görselleri, DualSense kontrolörler — donanımın duygusal işi yapmasına izin verirken chrome kısmı ölçülü kalır.

İmza tipografik hamle, **büyük boyutlarda SST Light (ağırlık 300) kullanımıdır**. Sony'nin özel SST ailesi, ağırlık 300'de 22px'ten 54px'e kadar kullanılır; bu da görsel başlıklara, bir oyun mağazasından çok bir lüks saat reklamına yakın, fısıldayan, zarif bir nitelik kazandırır. Bu "sessiz otorite", The Verge'in Manuka bağırışının ya da Wired'ın gazete yoğunluğunun tam tersidir — PlayStation, tipin geride durmasını ve ürünün öne çıkmasını ister. Gövde ve kullanıcı arayüzü 500–700 ağırlıklara yaslanır; ancak *görsel* ses tutarlı biçimde ince ve sakindir.

Kısıtlamanın kırıldığı tek yer **etkileşimdir**. Her birincil düğmenin aynı hover hareketi vardır: dolgu, elektrik mavisi `#1eaedb` cyan'a geçer, 2px beyaz bir kenarlık belirir, 2px PlayStation-mavi dış halka arkasında açılır ve düğmenin tamamı **1,2× büyür**. Bu renk patlaması, kenarlık, halka ve kaldırma ölçeği kombinasyonu, büyük markalar arasında Sony'ye özgü bir imza harekettir — sitenin tek bir sayfada yüzlerce kez tekrarladığı minyatür bir "güç açma" animasyonu.

**Temel Özellikler:**
- Üç yüzeyli kanal düzeni: yakın siyah hero, kâğıt beyazı içerik, kobalt mavi alt bilgi — birbirini izleyen, hiçbir zaman harmanlanmayan
- 22–54px'te SST ağırlık 300 görsel için — ürün fotoğrafçılığının öne çıkmasına izin veren "sessiz otorite" başlıkları
- Marka çapası olarak PlayStation Mavi `#0070cc`; yalnızca hover/focus durumları için ayrılmış cyan `#1eaedb`
- Her etkileşimli öğe hover'da 1,2× büyür — PlayStation'a özgü bir imza "güç açma" kaldırması
- 999px yarıçaplı pill düğmeler; 12–24px yuvarlak köşeli dikdörtgenlerde kart görselleri
- Ticaret-turuncu `#d53b00` yalnızca PlayStation Store / satın alma durumu CTA'ları için kullanılır
- 2120px'e kadar geniş breakpoint kapsamı — site 4K TV tarama bağlamlarına kadar ölçeklenir

## 2. Renk Paleti ve Rolleri

### Birincil (Marka Çapası)
- **PlayStation Mavi** (`#0070cc`): Markanın çapa rengi. Birincil alt bilgide, satır içi bağlantılarda, koyu yüzeylerdeki birincil düğme dolgularında ve her "resmi" işarette kullanılır. Bunu değiştirilemez olarak kabul edin — tüketici belleğinde markayla en çok ilişkilendirilen renk budur.
- **Konsol Siyahı** (`#000000`): Üst başlık, hero arka planlar ve ürün sunum alanları için saf siyah. PlayStation, bir müzenin heykel çerçevelemek için siyahı kullandığı gibi donanımı çerçevelemek için siyah kullanır.

### İkincil ve Vurgu
- **PlayStation Cyan** (`#1eaedb`): Etkileşim rengi. YALNIZCA düğmelerin ve bağlantıların hover, focus ve aktif durumlarına uygulanır. Varsayılan arka plan veya dinlenme durumundaki metin rengi olarak hiçbir zaman görünmez. Tam imza işlemi için hover'da 2px `#ffffff` kenarlık ve 2px `#0070cc` dış halkayla birleştirin.
- **Bağlantı Hover Mavisi** (`#1883fd`): Satır içi metin bağlantısı hover'larında kullanılan daha parlak varyant. Cyan'dan farklıdır — bu bağlantı rengi, cyan düğme rengidir.
- **Koyu Bağlantı Mavisi** (`#0068bd`): Açık yüzeylerdeki dinlenme durumu bağlantı rengi — marka mavinin biraz daha doygun kuzeni.

### Yüzey ve Arka Plan
- **Kâğıt Beyazı** (`#ffffff`): Üst başlık ile alt bilgi arasındaki editoryal paneller için birincil içerik tuvali.
- **Buz Sisi** (`#f5f7fa`): Açık bölüm gradyanının atmosferik bitiş noktası. Belirli panellerin saf beyazdan ayrılması için arka planda ince biçimde kullanılır.
- **Bölücü Tonu** (`#f3f3f3`): İçerik satırları arasındaki sessiz yatay çizgi rengi.
- **Üst Başlık Siyahı** (`#000000`): Üst gezinme ve hero tuvali — ürün odaklı alanlara ayrılmış.
- **Gölge Siyahı** (`#121314`): Bir panelin atmosferik derinliğe ihtiyaç duyduğunda koyu bölüm gradyanının başlangıç çapası.
- **Filtre Sisi** (`rgba(245, 247, 250, 0.3)`): Yapışkan filtre çubukları arkasında kullanılan yarı saydam arka plan — sitedeki tek "camsı morfizm" anı.

### Nötürler ve Metin
- **Görsel Mürekkep** (`#000000`): Beyaz yüzeylerde birincil görsel başlıklar.
- **Derin Kömür** (`#1f1f1f`): Gövde başlıkları ve dinlenme durumu bağlantı rengi — büyük bloklarda görsel halkayı azaltmak için saf siyahtan biraz daha yumuşak.
- **Gövde Grisi** (`#6b6b6b`): İkincil gövde metni ve meta veriler.
- **Sessiz Gri** (`#cccccc`): Üçüncül etiketler, devre dışı durumlar.
- **Yer Tutucu Mürekkep** (`rgba(0, 0, 0, 0.6)`): Form yer tutucu metni — %60 siyah, ayrı bir gri değil.
- **Ters Beyaz** (`#ffffff`): Koyu ve mavi yüzeylerde birincil metin.
- **Koyu Bağlantı Mavisi** (`#53b1ff`): Koyu/siyah yüzeylerdeki dinlenme durumu bağlantı rengi — siyah üzerindeki okunabilirlik için PlayStation Mavinin daha açık, havadan bir varyantı.

### Anlamsal ve Ticaret
- **Ticaret Turuncusu** (`#d53b00`): PlayStation Store satın alma durumu CTA'ları, fiyat vurguları ve "indirimde" rozetleri için ayrılmıştır. Sitedeki tek sıcak renk — tutumlu kullanın ve hiçbir zaman ticaret bağlamı dışında kullanmayın.
- **Ticaret Turuncusu Aktif** (`#aa2f00`): Ticaret düğmelerinin basılı/aktif durumu.
- **Uyarı Kırmızısı** (`#c81b3a`): Form hataları ve yıkıcı eylem uyarıları.
- **Gölge Perdesi 80** (`rgba(0, 0, 0, 0.8)`): Ürün fotoğrafçılığındaki hero metninin arkasında kullanılan dramatik perde.
- **Gölge Perdesi 16** (`rgba(0, 0, 0, 0.16)`): Kartlarda düşük ağırlıklı yükseltme halkası.
- **Gölge Perdesi 08** (`rgba(0, 0, 0, 0.08)`): Tüy ağırlığında kart yükseltmesi — neredeyse görünmez ama beyaz panelleri beyaz arka plandan ayırır.
- **Gölge Perdesi 06** (`rgba(0, 0, 0, 0.06)`): Sistemdeki en hafif gölge.

### Gradyan Sistemi
PlayStation **iki bölüm gradyanı** kullanır, başka bir şey değil:
- **Açık Bölüm Gradyanı**: `#ffffff` → `#f5f7fa` — bir paneli tuvalden sessizce kaldıran neredeyse algılanamaz bir yıkama.
- **Koyu Bölüm Gradyanı**: `#121314` → `#000000` — hero panellerine herhangi bir ton kayması getirmeden ince bir vinyeti veren kısa dikey yıkama.

Her iki gradyan da **yalnızca bölüm arka planı olarak** kullanılır, hiçbir zaman bileşenlerin içinde değil. Gradyan düğme, gradyan metin, parlayan hale yoktur. Marka mavi — mavi-mor değil, mavi-cyan değil.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **SST** / **Playstation SST** (Sony, tescilli) — geri dönüş: `Arial`, `Helvetica`. Toshi Omagari ve Akira Kobayashi tarafından tasarlanan Sony'nin özel küresel yazı tipi. Ana sayfada 300 / 500 / 600 / 700 ağırlıklarını kapsar. **22–54px'te 300 ağırlık** PlayStation'ın tipografik imzasıdır.
- **SST (daraltılmış / alternatif)** — geri dönüş: `helvetica`, `arial`. Genişliğin önemli olduğu birkaç kullanıcı arayüzü modülünde kullanılan sıkıştırılmış bir varyant.
- **Arial** — sistem sans içinde render edilen nadir düğme varyantı için yardımcı geri dönüş.

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|---|---|---|---|---|---|---|
| Hero Görsel (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Sayfadaki en büyük SST anı — sessiz ağırlıklı lüks başlık |
| Hero Görsel (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | İkincil hero başlıkları |
| Büyük Görsel | SST | 35px / 2.20rem | 300 | 1.25 | — | Özellik paneli başlıkları |
| Orta Görsel | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Bölüm başlıkları |
| Kompakt Görsel | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Modül başlıkları — hâlâ 300 hafif ağırlıkta |
| Playstation SST Alt | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Promosyon alt başlığı |
| Kullanıcı Arayüzü Başlık Küçük | SST | 18px / 1.13rem | 600 | 1.00 | — | Sıkı kullanıcı arayüzü başlıkları |
| Düğme / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Birincil düğme etiketi |
| Düğme / Vurgulu | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | Daha yüksek vurgu CTA'ları (satın al, abone ol) |
| Düğme Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | İkincil düğme etiketi |
| Rahat Gövde | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Standart okuma gövdesi |
| Bağlantı Gövdesi | SST | 18px / 1.13rem | 400 | 1.50 | — | Satır içi bağlantı metni |
| Kompakt Düğme | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Kartlardaki mini CTA'lar |
| Yardımcı Altyazı | SST | 14px / 0.88rem | 500 | 1.50 | — | Altyazılar, etiket etiketleri |
| Altyazı Gövdesi | SST | 14px / 0.88rem | 400 | 1.50 | — | Standart meta veriler |
| Playstation Altyazı Kalın | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Vurgulu altyazı |
| Playstation Altyazı Orta | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Yarı kalın altyazı |
| Playstation Düğme | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Sıkı aralıklı kullanıcı arayüzü düğmesi |
| Playstation Sekme | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Sekme/pill etiketi |
| Playstation Kompakt Altyazı | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | En küçük kullanıcı arayüzü altyazısı |
| Mikro Altyazı | SST | 12px / 0.75rem | 500 | 1.50 | — | Alt bilgi mikrokopya, yasal metin |
| Kompakt Altyazı Kalın | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Vurgulu mikro metin |

### İlkeler
- **Büyük boyutlarda 300 ağırlık sestir.** PlayStation, hero başlıklarında hafif ağırlıklı görsel kullanan tek büyük konsol markasıdır. Görsel tipi 500 veya 700'e "yükseltme" dürtüsüne direnin — sessizlik kişiliktir.
- **Kullanıcı arayüzü katmanında ağırlık sıçramaları.** 18px'in altında sistem okunabilirlik için 500–700'e geçer. 300 (görsel) → 400 (gövde) → 500 (altyazılar) → 700 (düğmeler) ağırlık gradyanı hiyerarşidir.
- **Harf aralığı neredeyse yok.** Çoğu değer 0,1–0,45px, ya pozitif ya da hafifçe negatif. 54px hero'daki `-0.1px`, görsel tipi yalnızca "tasarlanmış" olarak okunmaya yetecek kadar sıkıştırır, tipografik bir ifadeye dönüşmeden.
- **İki SST büyük/küçük harf stili.** "SST" ve "Playstation SST" işlevsel olarak aynı ailedir, biraz farklı metrik setleriyle (Playstation SST küçük boyutlarda daha sıkıdır). Sony'nin dahili lisanslama sınırları dışında birbiriyle değiştirilebilir olarak değerlendirin.
- **Büyük harf yok.** The Verge veya Wired'ın aksine, PlayStation nadiren BÜYÜK HARF etiketler kullanır. Kicker'lar ve etiketler başlık durumunda veya cümle durumunda kalır — başka bir "sessiz otorite" hamlesi.
- **Hiçbir yerde serif yok.** Sistemin tamamı sans'tır. Hiçbir baskı sesi karşıtı yok.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil — PlayStation Mavi Pill**
- Arka plan: `#0070cc` (PlayStation Mavi)
- Metin: `#ffffff`, SST 18px / 500 / 0.4px izleme
- Kenarlık: dinlenme durumunda yok
- Kenarlık yarıçapı: `999px` — tam pill
- Dolgu: ~`12px 24px` (boyut sınıfına göre değişken)
- Dış çizgi: dinlenme durumunda `rgb(255, 255, 255) none 0px`
- **Hover (imza hareketi)**:
  - Arka plan `#1eaedb` (PlayStation Cyan) ile dolar
  - Metin `#ffffff` kalır
  - 2px `#ffffff` kenarlık belirir
  - 2px `#0070cc` dış halka gölgesi açılır (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — düğme gerçekten %20 büyür
- Aktif: `opacity: 0.6` — baskıyı sinyal vermek için hızlı bir kararma
- Focus: Hover ile aynı, ancak halka `rgb(0, 114, 206) 0px 0px 0px 2px` focus gölgesine dönüşür
- Geçiş: arka plan, transform ve gölge üzerinde ~180ms ease

**İkincil — Koyu Zemin Üzerinde Beyaz Kontur**
- Arka plan: `#ffffff`
- Metin: `#0172ce` (PlayStation Mavi varyantı)
- Kenarlık: `2px outset #000000` — modern CSS'te son derece nadir olan gerçek bir `outset` kenarlık
- Yarıçap: değişken (genellikle `999px` veya `36px`)
- Dolgu: `16px 20px`
- Hover: aynı imza cyan dolgu + scale(1.2) + halka işlemi
- Focus: aynı halka işlemi

**Ticaret Turuncusu**
- Arka plan: `#d53b00` (Ticaret Turuncusu)
- Metin: `#ffffff`, SST 18px / 700 / 0.45px izleme
- Kenarlık yarıçapı: `999px` — pill
- Yalnızca PS Store / Satın Al / Plus'a Abone Ol CTA'larında kullanılır
- Aktif: arka plan `#aa2f00`'e koyulaşır
- Hover: tüm diğer düğmeler gibi cyan-ters kuralını izler (turuncu özgü bir hover DEĞİL)

**Şeffaf Hayalet**
- Arka plan: şeffaf
- Metin: `#1f1f1f` (Derin Kömür)
- Kenarlık: `1px solid #dedede`
- Dolgu: `0 10px` (sıkı, gezinme için optimize edilmiş)
- Hover: cyan dolgu, beyaz metin, 2px beyaz kenarlık, scale(1.2)
- Aktif: metin `#0072ce`'ye kayar, opacity 0.6

**Simge Dairesi**
- Arka plan: fotoğraf üzerinde `rgba(0, 0, 0, 0.2)`; açık yüzeylerde `#ffffff`
- Kenarlık yarıçapı: `100%` — mükemmel daire
- Karusel önceki/sonraki okları ve paylaşım düğmeleri için kullanılır
- Hover: `var(--color-role-backgrounds-primary-link-hover)` ile açılır (açık zemin üzerinde yaklaşık `#e5e5e5`)

**Mini CTA (Kart İçi)**
- SST 14px / 700 / 0.324px izleme
- Dolgu ~8px 16px
- Yarıçap: `999px`
- "Hemen Satın Al" / "Sepete Ekle" mini CTA'ları için oyun kartlarının içinde kullanılır

### Kartlar ve Konteynerler

**Hero Kart (Oyun Özelliği)**
- Arka plan: fotoğraf/render — genellikle siyah tabanlı
- Kenarlık yarıçapı: özellik kartları için `24px` veya `19px`
- Dolgu: 32–48px iç
- Gölge: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — yalnızca bir kart hero fotoğrafın üzerine bindiğinde kullanılan dramatik düşen gölge
- Hover: hafif ölçek dönüşümü, birincil CTA'da cyan konturu görünür

**Oyun Kapağı Karosu**
- Arka plan: oyun kapak görseli, dolgusuz
- Kenarlık yarıçapı: `12px` veya `13px` (görseller) / `19px` (kart çerçevesi)
- Gölge: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — tüy ağırlığında yükseltme
- Hover: kartın birincil CTA'sı cyan'a aydınlanır, kartın kendisi 1.02× ölçeklenebilir
- Geçiş: transform üzerinde 200ms ease

**İçerik Paneli (Beyaz)**
- Arka plan: `#ffffff` veya açık bölüm gradyanı `#ffffff → #f5f7fa`
- Kenarlık: genellikle yok; komşulardan boşluk ve hafif gölgelerle ayrılır
- Yarıçap: panel hiyerarşisine bağlı olarak `12px`–`24px`
- Gölge: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — sistemdeki en hafif

**Koyu Zemin Üzerinde Koyu Kart**
- Arka plan: fotoğraf üzerinde `rgba(0, 0, 0, 0.2)`
- Kenarlık yarıçapı: `6px` (kompakt) veya `24px` (özellik)
- Hero video üzerindeki "basın kiti" veya "istatistik bloğu" iç giydirmeleri için kullanılır

### Girdiler ve Formlar
- **Varsayılan**: `#ffffff` arka plan, `1px solid #cccccc` kenarlık, `3px` kenarlık yarıçapı (sistemin geri kalanından daha sıkı — girişler PlayStation'ın gerçekten kompakt hale geldiği tek yer), `#1f1f1f`'te SST 16px metin, `rgba(0, 0, 0, 0.6)` yer tutucu.
- **Focus**: `box-shadow: 0 0 0 2px #0070cc` aracılığıyla 2px `#0070cc` focus halkası. Kenarlık rengi değişikliği yok — halka işi yapar.
- **Hata**: kenarlık ve metin `#c81b3a` (Uyarı Kırmızısı)'na kayar, altında aynı kırmızıda satır içi hata metni.
- **Geçiş**: kenarlık ve gölge üzerinde ~180ms ease.

### Gezinme

- **Üst gezinme**: Sol hizalı PlayStation logosu (beyaz), SST 14–16px / 500'de ortalanmış kategori bağlantıları ve sağ hizalı küçük "Oturum Aç" CTA'sı ile siyah (`#000000`) tam kenarlı şerit.
- **Gezinme bağlantısında hover**: renk `#ffffff`'ten `#1883fd` (Bağlantı Hover Mavisi)'ne geçer, alt çizgi yok.
- **Aktif bölüm**: `#0070cc`'de ince 2px alt çizgiyle işaretlenir.
- **Mobil**: gezinme hamburger çekmecesine daraltılır. Çekmeçenin içinde bağlantılar 16px boşluklarla ve 20px yatay dolguyla dikey olarak yığılır.
- **Yapışkan davranış**: gezinme kaydırmada en üstte sabitli kalır; açık yüzey bölgesine girdiğinde **ters çevrilmez** — her yerde siyah arka planlı kalır.

### Görsel İşleme

- **En boy oranları**: 16:9 hero video/fotoğrafçılık, 1:1 konsol renderlar, 3:4 oyun kapak görseli, 4:3 yaşam tarzı görselliği.
- **Köşeler**: kart bağlamına bağlı olarak `12px`, `13px` veya `24px`'e yuvarlatılır. Oyun kapakları `6–12px`, hero görseller `24px` alır.
- **Tam kanama**: yalnızca üst başlık hero ve alt bilgi promosyon bantlarında. Diğer her şey dolgulu bir içerik sütununun içinde oturur.
- **Gölge**: hero'larda dramatik `rgba(0, 0, 0, 0.8) 0 5px 9px 0` düşen gölge, ızgara karolarında tüy `rgba(0, 0, 0, 0.06) 0 5px 9px 0`.
- **Hover**: görsel statik kalır, kart çerçevesi ve birincil CTA yanıt verir.
- **Geç yükleme**: katlama altındaki her şeyde `loading="lazy"`, üst başlık hero'sunda `eager`.

### Oyun Mağazası Pill (Karakteristik)
- Arka plan: `#ffffff`
- Metin: `#000000`, SST 14px / 500
- Dolgu: `14px 18px`
- Yarıçap: `9999px` — tam pill
- Platform etiketlemek için oyun kapakları yanında duran nötr pill etiketi ("PS5", "PS4", "PSVR2"). Koyu zemin üzerinde beyaz kontrast.

## 5. Düzen İlkeleri

### Boşluk Sistemi
- **Temel birim**: 8px.
- **Ölçek**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Bölüm dolgusu**: Ana paneller arasında 48–96px dikey. Hero-içerik geçişleri daha büyük ucu kullanır.
- **Kart dolgusu**: 20–32px iç. Özellik hero kartları 48px'e genişleyebilir.
- **Satır içi aralık**: Başlık ve dek arasında 8–12px, dek ve CTA arasında 12–16px.
- **Mikro ölçek**: 1/2/3/4.5/5/9/10/12 değerleri pill dolgusu, altyazı aralığı ve kenarlık ofsetleri için kullanılır — editoryal ritim için değil.

### Izgara ve Konteyner
- **Maksimum genişlik**: ~1920px (dembrandt 2120px'e kadar kesme noktaları tespit etti). Konteyner sınırları genellikle panele bağlı olarak `1280–1920px` civarında.
- **Sütun desenleri**: Hiyerarşiye bağlı olarak 3/4/6 sütunlu oyun karosu satırlarına çözünen 12 sütunlu duyarlı ızgara. Hero alanlar genellikle 12 sütun kapsar; öne çıkan karolar 6+3+3 veya 4+4+4 konfigürasyonlarında oturur.
- **Dış dolgu**: 16px mobil → 48px tablet → 64–96px masaüstü.
- **Oluğlar**: Sütunlar arasında 16–24px, karo kümeleri içinde daha sıkı (8–12px).

### Boş Alan Felsefesi
PlayStation, boş alanı lüks bir markanın mağaza aydınlatmasını ele aldığı gibi — bir premium sinyal olarak — ele alır. Modüller arasında diğer büyük perakende sitelerden belirgin biçimde daha fazla dikey nefes alma alanı vardır ve beyaz editoryal paneller genellikle hero ölçekli dolguyla yalnızca bir başlık + bir görsel + bir CTA barındırır. Etki, her ürünün küçük resimlerin ızgarasında rekabet etmek yerine kendi odasını aldığı bir "galeri temposu"dur.

### Kenarlık Yarıçapı Ölçeği
- **2px** — çerez banner düğmeleri ve küçük yönetim kullanıcı arayüzü
- **3px** — form girişleri, sekme panelleri (diğer her şeyden daha sıkı — kasıtlı bir "işlevsel kullanıcı arayüzü" ipucu)
- **6px** — kompakt düğmeler ve satır içi görseller
- **12px** — standart oyun kapağı ve içerik görselleri
- **13px** — belirli şekil sarmalayıcılar (iç içe yerleştirme için 12px'ten 1px fark)
- **19px** — özellik kartları
- **20px** — satır içi etiket aralıkları
- **24px** — hero kartlar, birincil özellik çerçeveleri
- **36px** — tam pill gezinme ve ikincil düğme varyantları
- **48px** — büyük özellik düğmeleri
- **999px / 100%** — tam pill birincil düğmeler ve dairesel simge düğmeleri

On bir ayrık yarıçap değeri — bu katalogdaki herhangi bir sitenin en zengin yarıçap sistemlerinden biri. Aralık, PlayStation'ın farklı *hiyerarşiler* için kasıtlı olarak farklı yarıçaplar kullanması nedeniyle mevcuttur: yardımcı için 3px, medya için 12px, özellikler için 24px, CTA'lar için 999px.

## 6. Derinlik ve Yükseltme

| Seviye | İşlem | Kullanım |
|---|---|---|
| 0 | Gölge yok | `#ffffff` üzerinde varsayılan içerik |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Tüy hafifliğinde editoryal panel kaldırması |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Standart ızgara karosu yükseltmesi |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Vurgulu kart (hover veya aktif) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Hero üst katman gölgesi — fotoğrafçılık üzerinde kullanılan dramatik düşen gölge |
| 5 | `0 0 0 2px #0070cc` (focus halkası) | Birincil düğme focus durumu |
| 6 | `0 0 0 2px #000000` (hover halkası) | İkincil düğme hover halkası |
| 7 | Bölüm gradyanı `#121314 → #000000` | Koyu hero panellerinde atmosferik derinlik |

PlayStation'ın derinlik felsefesi **katmanlı ama ölçülüdür**. Gölge ölçeği normal durumlar için 0.06'dan 0.16'ya çalışır, ardından hero düşüşleri için 0.8'e fırlar — 0.2, 0.3, 0.4 orta zemin yoktur. Etki, sayfanın büyük bölümünün neredeyse düz oturmasıdır; ancak bir hero kart fotoğrafın üzerinde yüzmesi gerektiğinde gerçekten *yüzer*. Yükseltme ya fısıldanır ya da bağırılır, hiçbir zaman mırıldanılmaz.

### Dekoratif Derinlik
- **Bölüm gradyanları** (koyu ve açık, ikisi de yukarıda açıklandı) — yalnızca bölüm arka planı olarak kullanılır
- **Focus/hover halkaları** 2px'te, duruma bağlı olarak her zaman mavi veya cyan
- **İki bölüm gradyanının ötesinde hiçbir parıltı, bulanıklık veya atmosferik etki yok**
- **Gradyan düğme veya metin yok** — görsel sistem bölüm geçişleri dışında her yerde düz renk bloklarıdır

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- **Yapın**: Birincil CTA dolgusu ve alt bilgi çapası olarak PlayStation Mavi (`#0070cc`) kullanın. Markanın çapa rengidir.
- **Yapın**: 22px ve üzerindeki her görsel başlık için SST ağırlık 300 kullanın. Sessiz ağırlıklı başlık sestir.
- **Yapın**: Her birincil düğmeye tam hover imzasını uygulayın: cyan dolgu + 2px beyaz kenarlık + 2px mavi dış halka + `scale(1.2)`.
- **Yapın**: Birincil ve ticaret düğmelerinde tam pill yarıçapı (`999px`) kullanın.
- **Yapın**: PlayStation Cyan (`#1eaedb`)'ı yalnızca hover, focus ve aktif durumlar için ayırın — hiçbir zaman dinlenme arka planı olarak kullanmayın.
- **Yapın**: Ticaret Turuncusu (`#d53b00`)'nu yalnızca PlayStation Store / satın alma CTA'larında ve fiyat vurgularında kullanın.
- **Yapın**: Karanlık hero panellerini beyaz içerik panelleriyle dönüşümlü kullanın ve derin mavi bir alt bilgiyle sabitleyin — üç yüzeyli kanal düzeni sayfa ritmidir.
- **Yapın**: Bir kart ürün fotoğrafın üzerine bindiğinde dramatik `rgba(0, 0, 0, 0.8)` hero düşen gölgeler kullanın.
- **Yapın**: Üst gezinmeyi her kaydırma konumunda siyah tutun — açık paneller üzerinde beyaza çevrilmez.

### Yapılmayacaklar
- **Yapmayın**: Görsel başlıkları kalınlaştırmayın. 22–54px'te 700 ağırlık, PlayStation sesini "başka bir oyun perakendecisi" olarak okutturur.
- **Yapmayın**: BÜYÜK HARF etiketler veya kicker'lar kullanmayın. PlayStation nadiren büyük harf kullanır — tehlike bandı değil, sessiz otorite markasıdır.
- **Yapmayın**: İki bildirilen bölüm gradyanının dışında gradyan düğmeler, metin veya arka planlar kullanmayın.
- **Yapmayın**: Ticaret Turuncusu'nun dışında sıcak renkler tanıtmayın. Kırmızı CTA yok, sarı vurgu yok, yeşil başarı pill'i yok.
- **Yapmayın**: Düğmelerde veya medyada kare köşeler kullanmayın. Sistemin on bir yarıçapı var — birini seçin, ama hiçbir zaman `0` değil.
- **Yapmayın**: Birincil düğmelerde `scale(1.2)` hover hareketini atlayın. Kaldırma ölçeği bir marka etkileşim imzasıdır.
- **Yapmayın**: Serif tip kullanmayın. Sistem %100 SST sans'tır.
- **Yapmayın**: Cyan `#1eaedb`'nin dinlenme durumunda metin veya arka plan rengi olarak görünmesine izin vermeyin. Yalnızca harekette var olur.
- **Yapmayın**: Dikkat için yarışan paneller tasarlamayın. PlayStation'ın boş alan ritmi her modüle kendi "galeri odası"nı verir.

## 8. Duyarlı Davranış

### Kesme Noktaları

| Ad | Genişlik | Temel Değişiklikler |
|---|---|---|
| Küçük Mobil | <400px | Tek sütun, gezinme hamburger'a daraltılır, SST hero ~28px'e ölçeklenir |
| Mobil | 400–599px | Tek sütun, karolar tam genişlikte yığılır, dolgu 16px'e açılır |
| Büyük Mobil | 600–767px | Hâlâ tek sütun ama seçili modüllerde 2 sütunlu karo seçeneği |
| Tablet Dikey | 768–1023px | 2 sütunlu oyun ızgarası, gezinme hâlâ yoğunlaştırılmış |
| Tablet Yatay | 1024–1279px | 3–4 sütunlu ızgara, tam gezinme geri yüklendi |
| Masaüstü | 1280–1599px | Tam editoryal ızgara, maksimum hero görsel ölçeği (44–54px) |
| Büyük Masaüstü | 1600–1919px | Konteyner 1600px'de sınırlanır, kenar boşlukları genişler |
| 4K / Büyük Ekran | ≥1920px | Konteyner 1920px maksimuma genişler, hero içerik TV izleme mesafesiyle eşleşmek için ölçeklenir |
| Ultra Geniş | ≥2120px | Aşırı kesme noktası — sayfa sabitli kalır, dış kenar boşlukları ekstra genişliği emer |

Dembrandt taraması 320px ile 2120px arasında 30 kesme noktası tespit etti — alışılmadık derecede geniş bir duyarlı aralık. PlayStation, PS5 sahiplerinin genellikle konsolun tarayıcısı veya telefondan TV'ye yayın aracılığıyla siteye TV'lerde göz attığından, özellikle **büyük ekran bağlamları** (1920–2120px) için ayarlama yapar. Çoğu perakende sitesi 1440px'te ayarlamayı durdurur; PlayStation 4K'ya kadar ayarlamaya devam eder.

### Dokunma Hedefleri
- Birincil pill düğmeler ~48–56px yüksekliğindedir (SST 18px metin + ~12–16px dikey dolgu) — rahatça WCAG AAA.
- Gezinme bağlantıları masaüstünde daha küçüktür (~32–40px yüksekliğinde); mobilde çekmece içinde 48px+'a kadar dolgu alır.
- Simge daire düğmeleri 40–48px'tir — dokunmaya uygun.

### Daraltma Stratejisi
- **Gezinme**: görünüm alanı daralırken tam gezinme → yoğunlaştırılmış → hamburger çekme. Logo sol sabitli kalır; CTA sağ sabitli kalır.
- **Izgara**: 6 sütun → 4 sütun → 3 sütun → 2 sütun → 1 sütun. Oyun karosu kartları kapak görselini kesmeden yeniden akar.
- **Aralık**: Görünüm alanı daralırken bölüm dolgusu 96px → 64px → 48px → 32px → 24px'e sıkışır.
- **Tip**: SST hero 54px → 44px → 35px → 28px → 22px'e ölçeklenir. Hafif ağırlık 300 her boyutta korunur.
- **Hero fotoğrafçılık**: sanat yönetimi takası — masaüstü geniş 16:9 kırpma, mobil ürünü merkezlenmiş 4:3 veya 1:1 kırpma kullanır.

### Görsel Davranışı
- Duyarlı raster (`srcset` + sanat yönetimiyle `<picture>`), en boy oranları kesme noktasına göre korunur.
- 4K'ya hazır: site, TV göz atma sırasında büyütmeyi önlemek için 1920px+'da yüksek yoğunluklu görsel sunar.
- Katlama altındaki her şeyde `loading="lazy"`; hero, ön yükleme ipucuyla `eager`.

## 9. Ajan Yönerge Kılavuzu

### Hızlı Renk Referansı
- **Birincil CTA**: "PlayStation Mavi (`#0070cc`)"
- **Hover / Focus Vurgusu**: "PlayStation Cyan (`#1eaedb`)"
- **Arka Plan (Beyaz Yüzey)**: "Kâğıt Beyazı (`#ffffff`)"
- **Arka Plan (Koyu Yüzey)**: "Konsol Siyahı (`#000000`)"
- **Beyaz Zemin Üzerinde Başlık Metni**: "Görsel Mürekkep (`#000000`)"
- **Beyaz Zemin Üzerinde Gövde Metni**: "Derin Kömür (`#1f1f1f`)"
- **Siyah Zemin Üzerinde Gövde Metni**: "Ters Beyaz (`#ffffff`)"
- **Ticaret / Satın Al Vurgusu**: "Ticaret Turuncusu (`#d53b00`)"
- **Alt Bilgi Çapası**: "PlayStation Mavi (`#0070cc`)"

### Örnek Bileşen İstemleri
1. *"`#0070cc` PlayStation Mavi dolgu, SST 18px / 500 / 0.4px izlemede beyaz metin, 999px kenarlık yarıçapı, 12px × 24px dolgu ile birincil bir CTA düğmesi oluşturun. Hover'da arka plan `#1eaedb` PlayStation Cyan'a geçer, 2px `#ffffff` kenarlık belirir, box-shadow aracılığıyla 2px `#0070cc` dış halka açılır ve tüm düğme 1,2× ölçeklenir — hepsi 180ms ease geçişiyle."*
2. *"`#000000` Konsol Siyahı tuval üzerinde, `#ffffff`'te -0.1px harf aralığı ve 1.25 satır yüksekliğiyle 54px SST ağırlık 300 başlıklı bir hero panel tasarlayın. Altına standart PlayStation hover işlemiyle tek bir birincil CTA yerleştirin. Hiçbir yerde BÜYÜK HARF etiket yok."*
3. *"Bir oyun kapağı karosu oluşturun: 12px kenarlık yarıçaplı 3:4 en boy oranlı görsel, tüy ağırlığında `rgba(0, 0, 0, 0.08) 0 5px 9px 0` düşen gölge, altında 14px SST 700 başlık, 12px SST 500 platform etiketi ve PlayStation Mavide mini 14px / 700 / 0.324px izlemeli birincil CTA."*
4. *"PlayStation Store satın alımı için bir ticaret pill düğmesi oluşturun: `#d53b00` Ticaret Turuncusu dolgu, SST 18px / 700 / 0.45px izlemede `#ffffff` metin, 999px yarıçap, 12px × 28px dolgu. Aktif durum `#aa2f00`'e koyulaşır. Hover, 1,2× ölçekle standart cyan-tersini izler."*
5. *"Karanlık hero bölümleri arasında beyaz içerik paneli tasarlayın: ince `#ffffff → #f5f7fa` açık bölüm gradyanıyla `#ffffff` arka plan, 24px kenarlık yarıçapı, 48px iç dolgu, tüy ağırlığında `rgba(0, 0, 0, 0.06) 0 5px 9px 0` yükseltme, 35px SST 300 başlık, 18px gövde paragrafı ve tek birincil CTA."*

### Yineleme Kılavuzu
Bu tasarım sistemiyle oluşturulan mevcut ekranları geliştirirken:
1. **Görsel ağırlığı denetleyin.** 22px ve üzerindeki her başlık SST ağırlık 300 olmalıdır. Hero ölçeğinde 500 veya 700 ağırlık görüyorsanız PlayStation sesini kaybettiniz.
2. **Hover işlemini denetleyin.** Her birincil düğme, cyan dolgu + beyaz kenarlık + mavi halka kombinasyonuyla hover'da 1,2× ölçeklenmelidir. Bu dördünden herhangi birini kaçırırsanız etkileşim imzası bozulur.
3. **Köşeleri denetleyin.** Her konteyner ve düğme 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 veya 999px / %100'e düşmelidir. Kare köşeler sesi bozar.
4. **Renk yayılmasını denetleyin.** Chrome'da yalnızca PlayStation Mavi (`#0070cc`), Cyan (`#1eaedb`), Ticaret Turuncusu (`#d53b00`) ve bildirilen griler/siyahlar/beyazlar görünmelidir. Başka bir ton görüyorsanız düzeltin.
5. **Yüzey dönüşümünü denetleyin.** Sayfa karanlık hero → beyaz içerik → karanlık hero → beyaz içerik → mavi alt bilgi şeklinde dönüşümlü olmalıdır. İki aynı yüzeyli panel bitişikse bir geçiş ekleyin.
6. **Büyük/küçük harfi denetleyin.** Yalnızca cümle durumu ve başlık durumu. BÜYÜK HARF etiket, düğme veya kicker yok. Büyük harf görüyorsanız dönüştürün.
7. **Gölge ağırlığını denetleyin.** Gölge opaklığı 0.06 / 0.08 / 0.16 / 0.8'e düşmelidir — aralarında hiçbir şey. 0.1, 0.2, 0.3, 0.5 düşen gölgeler görüyorsanız en yakın bildirilen kademedüzeltin.
8. **Boş alanı denetleyin.** İki modül "rekabetçi" hissettiriyorsa (dikkat için yarışıyorsa), 48–96px dikey nefes alma alanı ekleyin. PlayStation'ın galeri temposu ritmi pazarlık konusu değildir.
