# Starbucks'tan İlham Alan Tasarım Sistemi

> Category: E-Ticaret & Perakende
> Küresel kahve perakende markası. Dört kademeli yeşil sistem, sıcak krem tuval, tam-hap düğmeler.

## 1. Görsel Tema & Atmosfer

Starbucks'ın tasarım sistemi, mağaza önlüğünün yeşilini her yüzeye taşıyan **sıcak, özgüvenli bir amiral mağazasıdır**. Tuval, nötr-sıcak bir krem (`#f2f0eb`) ile seramik kırık beyaz (`#edebe9`) arasında gidip gelir — bu renkler gerçek mağaza malzemelerini çağrıştırır: kağıt peçeteler, kafe duvarları, ahşap yüzeyler. İmza **Starbucks Yeşili** (`#006241`) ise hero bantlarında, CTA'larda ve Rewards deneyiminde marka anını çıpalar. Yeşiller dört kalibreli tonda gelir (Starbucks, Accent, House, Uplift); her biri belirli bir yüzey rolüne eşlenmiştir. Altın (`#cba258`) yalnızca Rewards-statüsü törenlerinde belirir; genel bir vurgu rengi olarak kullanılmaz.

Tipografi, marka sesinin büyük bölümünü taşır. Özel tescilli **SoDoSans** yazı tipi (Starbucks'a özgü), sıkı bir `-0.16px` harf aralığıyla neredeyse her yüzeyde yer alır — moda dergisi sertliğinden uzak, özgüvenli ve samimi bir his verir. Dikkat çekici olan: Rewards sayfası, belirli başlık anlarında sıcak bir serif (`"Lander Tall", "Iowan Old Style", Georgia`) kullanır; bu, bir kafe kara tahtasının nostaljik havasını ince biçimde yansıtır. Careers sayfaları ise kişisel fincan-adı dokunuşları için el yazısı bir script (`"Kalam", "Comic Sans MS", cursive`) kullanır. Üç yazı tipi, üç bağlam — sistem, her birinin ne zaman görüneceği konusunda son derece disiplinlidir.

Yüzeyler, yuvarlak geometriyle nefes alır. Her düğme 50 piksel tam-hap biçimindedir. Kartlar 12 piksel yuvarlatılmış dikdörtgen kullanır. "Frap" yüzen CTA'sı — Yeşil Accent (`#00754A`) renginde 56 piksel dairesel bir sipariş düğmesi — ürünün imza derinlik hamlesidir: sağ altta katmanlı gölge yığınıyla (`0 0 6px rgba(0,0,0,0.24)` taban + `0 8px 12px rgba(0,0,0,0.14)` ortam) yüzer ve basışta `scale(0.95)` ile sıkışır. Diğer yükseltme efektleri kısıtlıdır — kart gölgeleri fısıldayan `0.14/0.24` alfa değerlerinde kalır, global gezinti üç katmanlı yumuşak gölge yığını alır. Sistem bir bütün olarak temiz kafe tabelaları gibi hissettirir: okunaklı, sıcak ve asla bağırmayan.

**Temel Özellikler:**
- Her biri ayrı bir yüzey rolüne eşlenmiş dört kademeli yeşil marka sistemi (Starbucks / Accent / House / Uplift) — tek bir "marka yeşili" değil
- Altın, yalnızca Rewards-statüsü anlarına ayrılmıştır; genel amaçlı bir vurgu rengi değildir
- Soğuk beyaz yerine sıcak-nötr tuval (`#f2f0eb` / `#edebe9`) — kafe malzemelerini çağrıştırır
- Evrensel ses olarak sıkı `-0.16px` harf aralığıyla özel tescilli yazı tipi (SoDoSans)
- Bağlama özgü yazı tipi geçişleri: Rewards için serif (Lander Tall), Careers fincan adları için script (Kalam)
- Tam-hap düğmeler (`50px` yarıçap) evrensel; imza mikro-etkileşim olarak `scale(0.95)` aktif basış
- Yüzen "Frap" dairesel CTA'sı (`56px`, Yeşil Accent dolgu, katmanlı gölge yığını) — ürünün imza yükseltme ögesi
- Hediye kartı yüzeyleri **fotoğraflanmış fiziksel ürün** olarak tasarlanmıştır — her kart üretilmiş grafik değil, özgün illüstratif bir fotoğraftır
- 12 piksel kart yarıçapı + fısıltı yumuşaklığındaki gölgeler, içerik kartlarını yassı-artı-hafif-kalkış görünümünde tutar
- `--space-3` = 1.6rem (~16px) çıpa noktasıyla 6.4rem'e (~64px) kadar uzanan rem tabanlı aralık ölçeği

**Renk bloklu sayfa ritmi:** Krem hero → Beyaz içerik bölümleri → Beyaz metin içeren koyu yeşil (`#1E3932`) özellik bandı → Krem araç bölgesi → Altın / beyaz metin içeren koyu yeşil (`#1E3932`) alt bilgi — parlak gövdenin etrafını saran espresso-koyu bir çerçeve.

## 2. Renk Paleti & Roller

**Analiz edilen sayfalar:** Ana sayfa, rewards, hediye kartları, ürün detay (Pink Energy Drink), ürün beslenme (Cold Brew).

### Birincil

- **Starbucks Yeşili** (`#006241`): Tarihi marka yeşili. h1 başlıklarında, Rewards sayfasındaki birincil bölüm başlıklarında ve tek bir baskın renge ihtiyaç duyulan her yerde ana marka sinyali olarak kullanılır.
- **Yeşil Accent** (`#00754A`): Biraz daha parlak, daha aydınlık bir yeşil. Birincil dolu CTA rengi ("Explore our afternoon menu", "See the spring menu") ve yüzen Frap dairesel düğmesinin dolgusu.
- **House Green** (`#1E3932`): Derin, siyaha yakın marka yeşili. Alt bilgi yüzeyi, özellik bandı arka planları, ödül-statüsü koyu yüzeyleri ve Rewards'taki "Free coffee is just the beginning" hero bandının başlığı.
- **Yeşil Uplift** (`#2b5148`): Dekoratif vurgularda ve koyu gradyan anlarında seyrek kullanılan ikincil orta-koyu yeşil.
- **Yeşil Light** (`#d4e9e2`): Form geçerli-durum renklendirmeleri ve açık yeşil araç yüzeylerinde kullanılan soluk nane yıkama tonu.

### İkincil & Vurgu

- **Altın** (`#cba258`): Neredeyse yalnızca Rewards-statüsü törenlerine ayrılmıştır — Altın katman açıklamaları, ortaklık rozetleri (SkyMiles, Bonvoy) ve premium hissiyatlı vurgular. Hiçbir zaman genel amaçlı bir marka rengi değildir.
- **Altın Light** (`#dfc49d`): Altın katman bölümlerinin arka plan yıkamalarında kullanılan daha yumuşak altın.
- **Altın En Açık** (`#faf6ee`): Rewards sayfasındaki ortaklık bölümlerinde kullanılan krem-altın sayfa-yüzeyi yıkama tonu — altın vurguyu sıcak nötr sisteme bağlar.

### Yüzey & Arka Plan

- **Beyaz** (`#ffffff`): Birincil kart ve modal yüzeyi. Ayrıca hediye kartı kutucuklarında kart dolgusu.
- **Nötr Cool** (`#f9f9f9`): Açılır menülerde ("Hesap" açılır menüsü), form-kart sarmalayıcılarında ve sessiz araç kapsayıcılarda kullanılan ince serin gri yüzey.
- **Nötr Sıcak** (`#f2f0eb`): Rewards araç bölgeleri ve hero bantlar için sıcak krem **birincil sayfa tuvali**.
- **Seramik** (`#edebe9`): Bölge ayırıcılar, yumuşak sayfa-bölüm yıkamaları ve Rewards ortaklık bandı için biraz daha sıcak/koyu krem.
- **Siyah** (`#000000`): Sayfanın en üstündeki koyu CTA şeridi ("Join now") ve yüksek kontrastlı üst-gezinti giriş düğmeleri için ayrılmış derin mürekkep rengi.

### Nötrler & Metin

- **Metin Siyahı** (`rgba(0, 0, 0, 0.87)`): Açık yüzeylerdeki birincil başlık ve gövde metin rengi. Saf siyah değil — daha sıcak okunan %87 opaklıkta siyah.
- **Metin Siyahı Yumuşak** (`rgba(0, 0, 0, 0.58)`): Açık yüzeylerdeki ikincil/meta veri metni.
- **Metin Beyazı** (`rgba(255, 255, 255, 1)`): Koyu yeşil yüzeylerdeki birincil başlık/gövde metni.
- **Metin Beyazı Yumuşak** (`rgba(255, 255, 255, 0.70)`): Koyu yeşil yüzeylerdeki ikincil metin — alt bilgi bağlantı açıklamaları, altyazı metni.
- **Rewards Yeşili** (`#33433d`): Yalnızca Rewards sayfası metin bloklarında kullanılan özel mat arduvaz-yeşil — Starbucks Yeşili'ni kullanmadan "ödül yüzeyi" sinyali veren biraz "daha soluk" bir okuma rengi.

### Anlamsal & Vurgu

- **Kırmızı** (`#c82014`): Hata ve yıkıcı durum (form geçersiz, yıkıcı eylemler).
- **Sarı** (`#fbbc05`): Uyarı durumu, eski marka dokunuşu.
- **Yeşil Light** (%33 opaklıkta `#d4e9e2` = `hsl(160 32% 87% / 33%)`): Form geçerli-alan renklendirme arka planı.
- **Kırmızı Ton** (`hsl(4 82% 43% / 5%)`): Formlarda geçersiz alan renklendirmesi.

### Siyah / Beyaz Alfa Kademeleri

Katman ve ikincil-metin kullanımı için iki paralel yarı saydam ölçek:
- `rgba(0,0,0,0.06)` ile `rgba(0,0,0,0.90)` arasında %10 adımlarla — açık yüzeylerde koyu katmanlar için
- `rgba(255,255,255,0.10)` ile `rgba(255,255,255,0.90)` arasında %10 adımlarla — koyu yüzeylerde açık katmanlar için

### Gradyan Sistemi

Yapısal gradyan token'ı gözlemlenmemiştir. Yüzey hiyerarşisi baştan sona düz renk blokludur — sistem gradyanlar yerine beş kademeli krem/yeşil yüzey paletine dayanır.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi

- **Birincil:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — Starbucks'ın özel kurumsal yazı tipi; neredeyse her yüzeyde kullanılır
- **Yükleme Geri Dönüşü:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — SoDoSans yüklenmeden önce kullanıcıların gördüğü yazı tipi
- **Rewards Serif:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — sıcak editorial his için Rewards sayfasındaki belirli başlık anlarında kullanılır
- **Careers Script:** `"Kalam", "Comic Sans MS", cursive` — Starbucks bardaklarındaki el yazısı isimlere atıfta bulunan, yalnızca Careers sayfasındaki "fincan adı" dekoratif dokunuşlarında kullanılır

`:root` düzeyinde açıkça etkinleştirilmiş OpenType stilistik set yoktur.

### Hiyerarşi

| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | En büyük Rewards/hero gösterimi |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | İkincil hero başlıkları |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | İniş bölümü başlıkları |
| H1 | 24px | 600 | 36px | -0.16px | Starbucks-Yeşil birincil başlık |
| H2 | 24px | 400 | 36px | -0.16px | Metin Siyahı'nda normal ağırlıklı bölüm başlığı |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Hero giriş kopyası, özellik bandı gövdesi |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Varsayılan gövde kopyası |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Düğme etiketi, meta veri, form etiketleri |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Aktif yüzen etiket durumu, altyazı mikro-kopyası |
| Düğme Etiketi | 14–16px | 400–600 | 1.2 | -0.01em | Tüm hap-düğme etiketleri |

**Harf aralığı token'ları:**
- `letterSpacingNormal`: `-0.01em` (varsayılan — sıkı, karakteristik)
- `letterSpacingLoose`: `0.1em` (vurgulanan büyük harf)
- `letterSpacingLooser`: `0.15em` (büyük harf stili etiketler, aşırı vurgu)

**Satır yüksekliği token'ları:**
- `lineHeightNormal`: `1.5` (gövde)
- `lineHeightCompact`: `1.2` (görüntü/düğmeler)

### İlkeler

- **Sıkı negatif izleme (`-0.01em`)** neredeyse evrensel olarak uygulanır — ürünün tamamı hafifçe sıkıştırılmış okur; bu, SoDoSans'a bunaltılmış hissettirmeden özgüvenli bir varlık kazandırır.
- **Hiyerarşiyi ağırlık değişimleri taşır, boyut değişimleri değil.** H1 ve H2 aynı 24px/36px boyutu paylaşır; onları yalnızca ağırlık (600 ile 400) ve renk (Starbucks-Yeşil ile Metin Siyahı) birbirinden ayırır.
- **Boyut token'ları rem kullanır; `1rem = 10px` temellidir** (bu sitede `font-size: 62.5%` kök numarası aracılığıyla). Dolayısıyla `1.6rem` = 16px, `2.4rem` = 24px vb. Ölçek semantiktir (textSize-1 ile textSize-10 arasında), rastgele piksel değerleri değil.
- **Bağlama özgü yazı tipi geçişleri** — Rewards'ta serif, Careers'ta script — kasıtlı ve yerelleştirilmiştir. Bunları aynı yüzeyde birincil sans-serif ile asla karıştırmayın.
- **Gövde metni asla saf siyah değildir** — sıcak-nötr tuval sıcaklığıyla uyumlu olması için `rgba(0,0,0,0.87)` değerini alır.

### Yazı Tipi Alternatifleri Hakkında Not

SoDoSans, Starbucks'a özeldir (House Industries lisanslı, kamuya açık değildir). Makul açık kaynaklı alternatifler:
- **Inter** (Google Fonts) — benzer hümanist geometrik oranlar, geniş ağırlık aralığı
- **Manrope** — biraz daha yuvarlak, benzer özgüvenli his
- **Nunito Sans** — daha sıcak, "kafe" markası alternatifi için iyi

Kullanırken sıkı `-0.01em` / `-0.16px` izlemenin hâlâ iyi okunup okunmadığını doğrulayın; bazı açık kaynaklı yazı tipleri bunun yerine `-0.005em` gerektirebilir.

Lander Tall (Rewards serifi) de özeldir — açık kaynaklı alternatifler: **Iowan Old Style** (zaten geri dönüşte mevcut), **Lora** veya **Source Serif Pro**. Kalam (Careers scripti) Google Fonts'ta doğrudan mevcuttur.

## 4. Bileşen Stilleri

### Düğmeler

**1. Birincil Dolu — "Explore our afternoon menu / Sign up for free"**
- Arka plan: `#00754A` (Yeşil Accent)
- Metin: `#ffffff`
- Çerçeve: `1px solid #00754A`
- Yarıçap: `50px` (tam hap)
- Dolgu: `7px 16px`
- Yazı tipi: SoDoSans, 16px, ağırlık 600, harf aralığı `-0.01em`
- Aktif durum: `--buttonActiveScale` aracılığıyla `transform: scale(0.95)`
- Geçiş: `all 0.2s ease`

**2. Birincil Çerçeveli — "Give them a try / Start an order"**
- Arka plan: şeffaf
- Metin: `#00754A` (Yeşil Accent)
- Çerçeve: `1px solid #00754A`
- Birincil Dolu ile aynı yarıçap/dolgu/aktif/geçiş

**3. Siyah Dolu — "Join now"**
- Arka plan: `#000000`
- Metin: `#ffffff`
- Çerçeve: `1px solid #000000`
- Yarıçap: `50px`, Dolgu: `7px 16px`
- Yazı tipi: 14px, ağırlık 600
- Sayfanın en üstündeki katılım şeridinde ve benzer dönüşüm anlarında kullanılır

**4. Koyu Çerçeveli — "Sign in"**
- Arka plan: şeffaf
- Metin: `rgba(0, 0, 0, 0.87)` (Metin Siyahı)
- Çerçeve: `1px solid rgba(0, 0, 0, 0.87)`
- Yarıçap: `50px`, Dolgu: `7px 16px`
- Yazı tipi: 14px, ağırlık 600

**5. Yeşil Üstünde Yeşil Ters — "See the spring menu"**
- Arka plan: `#ffffff`
- Metin: `#00754A`
- Çerçeve: `1px solid #ffffff`
- Düğmenin arkasındaki yüzey koyu yeşil House Green bandı olduğunda kullanılır — yeşil arka plan üstünde dolu yeşil hap yerine yeşil metin içeren beyaz düğme

**6. Koyu Üstünde Çerçeveli — "Learn more / Order now"**
- Arka plan: şeffaf
- Metin: `#ffffff`
- Çerçeve: `1px solid #ffffff`
- Beyaz dolu CTA ile eşleştirilen ikincil eylem olarak koyu yeşil özellik bantlarında kullanılır

**7. Onay Düğmesi (koyu yeşil varyant)**
- Arka plan: `rgb(0, 130, 72)` (çerez onay modülünde kullanılan belirli bir varyant yeşil)
- Metin: `#ffffff`
- Çerçeve yok, `50px` yarıçap, `7px 16px` dolgu, 14px / ağırlık 400
- Yeşil Accent'ten biraz daha parlak — onay banner'ındaki Kabul Et eylemi için ayrılmıştır

**8. Frap — Yüzen Dairesel Sipariş Düğmesi**
- Arka plan: `#00754A` (Yeşil Accent)
- Simge: `#ffffff`
- Boyut: `5.6rem / 56px` (standart), `4rem / 40px` (mini varyant)
- Yarıçap: `50%` (tam daire)
- Sabit sağ alt, ek dokunma konforu için `-0.8rem` dokunma ofseti
- Gölge yığını: taban `0 0 6px rgba(0,0,0,0.24)` + ortam `0 8px 12px rgba(0,0,0,0.14)`
- Aktif durum: ortam gölgesi `0 8px 12px rgba(0,0,0,0)` değerine söner
- Bu, ürünün imza yükseltme ögesidir — kaydırılan her yüzeyin üzerinde yüzer

**9. Tam Genişlik Geri Bildirim Sekmesi — "Provide feedback"**
- Arka plan: `#00754A`
- Metin: `#ffffff`
- Yarıçap: `12px 12px 0px 0px` (yalnızca üst yuvarlatılmış)
- Dolgu: `8px 16px`
- Yazı tipi: 14px, ağırlık 400
- Görüntü alanı kenarına yapışık, sabit sağ alt içe konumlandırılmış

### Kartlar & Kapsayıcılar

**İçerik Kartı (varsayılan)**
- Arka plan: `#ffffff` (`--cardBackgroundColor`)
- Yarıçap: `12px` (`--cardBorderRadius`)
- Gölge: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Kullanım: özellik kartları, menü öğesi kutucukları, ödül-statüsü panelleri

**Hediye Kartı Kutucuğu**
- Arka plan: illüstratif fotoğraf kartı doldurur (düz arka plan yok)
- Yarıçap: kartlara benzer (~12px, köşelerde biraz daha sıkı)
- Gölge: varsayılan kartten daha hafif — bunlar tuval üstünde yatıyor gibi fiziksel kart gibi ele alınır
- Kart ızgarasının üstünde kategoriye göre etiketlenir (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Rewards Durum Kartları (Rewards sayfası imzası)**
- Üç sütun ızgara: Bronz / Altın / Gümüş — her biri şunları içeren koyu yeşil (`#1E3932`) panel:
  - Renkli gradyan/renk başlık halkası
  - Numaralı "Level" rozeti
  - Büyük SoDoSans ağırlık 600'de durum başlığı
  - Beyaz/yarı saydam-beyaz metinde yıldızlar / avantajlar listesi
  - Altta "As you earn more stars…" ilerleme açıklaması

**Ortaklık Kartı (Rewards)**
- Arka plan: `#faf6ee` (Altın En Açık) sıcak-krem yüzey
- İçerik: ortalanmış ortak logoları ("SkyMiles", "Bonvoy") ve altında açıklayıcı metin
- Yarıçap ve gölge varsayılan kart özelliklerini takip eder

**Açılır Menü (Hesap açılır menüsü, üst gezinti)**
- Arka plan: `#f9f9f9` (Nötr Cool)
- Menü öğeleri Metin Siyahı'nda `24px / ağırlık 400`
- Çerçeve yok — yalnızca beyaz gezinti karşısında arka plan yüzeyi değişimi

**Modal**
- Dolgu: `2.4rem` (`--modalPadding`)
- Üst dolgu: `8.8rem` (`--modalTopPadding`) — kapat düğmesi / başlık için yer bırakır
- Toplam dikey dolgu: `11.2rem`
- Yarıçap kart özelliklerinden miras alınır (`12px`)

### Girişler & Formlar

**Yüzen Etiketli Giriş**
- Odaklanıldığında/dolduğunda etiket giriş çerçevesinin üstüne yüzer
- Masaüstü etiket yazı tipi boyutu: varsayılan `1.9rem`, aktifken `1.4rem`'e animasyonlu geçiş
- Mobil etiket yazı tipi boyutu: varsayılan `1.6rem`, aktifken `1.3rem`'e animasyonlu geçiş
- Etiket yatay ofseti: soldan `12px`
- Aktif etiket çevirisi: `-50%` Y çevirisiyle `-12px`'e kadar yukarı
- Alan dolgusu: `12px`
- Form yatay dolgusu: `1.6rem`
- Doğrulama: geçerli alana `rgba(green-light, 0.33)` renklendirmesi; geçersiz alana `rgba(red, 0.05)` renklendirmesi
- Geçiş: işaretli girişte `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)`

**Seçenek Simgesi (onay kutusu/radyo)**
- Dolgu: `3px` iç
- Yukarıdaki işaretli-giriş cubic-bezier animasyonunu kullanır (hafifçe "yaylı" 2.32 aşım eğrisi)

### Gezinti

**Global Gezinti (üst çubuk)**
- Kademeli yüksekliklerle sabit konum: `64px` xs → `72px` mobil → `83px` tablet → `99px` masaüstü
- Gölge yığını: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — üç katmanlı yumuşak kaldırma
- Sol: Starbucks kelime markası logosu, sol kenardan `99px` (md) / `131px` (lg) ofsetli
- SoDoSans ağırlık 400–600'de satır içi birincil bağlantılar: Menu · Rewards · Gift Cards
- Sağ: Mağaza bul bağlantısı + Giriş yap (çerçeveli) + Şimdi katıl (siyah dolu)

**Alt Gezinti (ikinci çubuk, örn. Rewards dahili)**
- Yükseklik: `53px` (global alt gezinti) / `48px` (dahili alt gezinti)
- Genellikle global gezintinin altında yatay sekme grubu

**Mobil Gezinti**
- Tablet kırılma noktasının altında hamburger çekmecesine daraltılır
- Frap yüzen düğmesi, gezinti durumundan bağımsız olarak sağ altta kalır

### Görsel İşleme

- **Hero fotoğrafçılığı**: Ürün fotoğrafları (renkli arka planlarda — mercan, adaçayı, sıcak kehribar — şeffaf camda içecekler) bölünmüş-hero düzeninin ~%40'ını kaplar; metin diğer %60'ı kaplar (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Hediye kartı illüstrasyonları**: Her kart özgün illüstratif bir fotoğraftır (boyalı hissiyat, el çizimi görünümü, sıcak renk paleti). Asla genel üretilmiş grafikler değil.
- **Rewards tören görselleri**: Elde tutulan, açılı kompozisyonlarda Starbucks Rewards Uygulaması ekranlarının fotoğrafları — bağlam içi ürün fotoğrafçılığı.
- **Menü küçük resimleri**: Temiz beyaz/krem arka planlarda, cam etrafında hafif yumuşak düşük gölgeli kare veya 4:3 ürün fotoğrafçılığı.
- **Görsel solma girişi**: Görsel yüklemede `opacity 0.3s ease-in` geçişi (`--imageFadeTransition`).

### Özellik Bandı (koyu yeşil hero şeridi)

Şunları içeren tam genişlik `#1E3932` (House Green) bandı:
- Sol: beyaz başlık + alt başlık + CTA satırı
- Sağ: ürün fotoğrafçılığı veya illüstrasyon
- Bölüm oranı bölüme göre ~%40/%60 veya %50/%50
- `rgba(255,255,255,0.70)` ikincil kopya için Metin Beyazı Yumuşak dahil boyunca beyaz metin
- CTA'lar Yeşil Üstünde Yeşil Ters (beyaz dolu) + Koyu Üstünde Çerçeveli (beyaz çerçeve) ikilemine göre

### Genişletici / Akordeon

- Süre: `300ms` (`--expanderDuration`)
- Zamanlama eğrisi: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — ölçülü bir ease-out
- Rewards ve hediye sayfasındaki SSS bölümlerinde kullanılır

### Çerez Onay Modülü

Sayfanın en üstünde "Agree" (yeşil dolu) ve "Manage preferences" (çerçeveli) düğmeli koyu yeşil modal kart. İlk ziyarette görünür; kapatılabilir.

### Ürün Detay Bileşenleri (PDP imza kümesi)

Menü ürün sayfalarında kullanılan tekrarlayan bileşen kümesi (örn. bir içecek detayı için `/menu/product/40498/iced`, besin gerçekleri için `/menu/product/.../nutrition`). Bu bileşenler token'ları değiştirmeksizin bileşen envanterini genişletir.

**Boyut Seçenekleri Seçici**
- 4 bardak simgesi düğmesinden oluşan yatay sıra (Tall / Grande / Venti / Trenta)
- Her öğe: üstte bardak siluet simgesi, altında boyut adı (Starbucks-Yeşil'de 16/700), sıvı ons altyazısı (Metin Siyahı Yumuşak'ta 13/400)
- Aktif durum: seçilen bardak simgesinin etrafında yeşil dairesel halka anahat (`2px solid #00754A`)
- Pasif durum: halka yok, aynı tipografi
- Tam genişlik sıra, eşit aralık
- Kapsayıcı yarıçapı: `12px` veya düz; bireysel simgeler `50%` dairesel
- Dolgu: `16px 24px` iç

**Eklenti / Süt Seçimi (çerçeveli dikdörtgen)**
- Arka plan: `#ffffff`
- Çerçeve: `1px solid #d6dbde` (Giriş Çerçevesi)
- Yarıçap: `4px`
- Sütununda tam genişlik
- Üst çerçevenin üstünde yüzen etiket: "Add-ins" / "Milk" / "Add-ins" — Metin Siyahı'nda 13/700, büyük harf, `0.325px` harf aralığı
- Ortalanmış değer gösterimi (örn. "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Metin Siyahı
- Sağ tarafta Metin Siyahı Yumuşak'ta aşağı ok simgesi
- Odak: çerçeve Yeşil Accent'e (`#00754A`) geçer

**Sayısal Artırıcı**
- Bir miktar gerektiğinde Eklenti satırının içine gömülü (örn. Strawberry Fruit Inclusions scoop)
- Etiketin sağında satır içi `−` eksi düğmesi + sayı + `+` artı düğmesi
- Düğmeler: `1px solid #d6dbde` çerçeveli, nötr gri simgeli dairesel `32×32px`
- Sayı: ortalanmış 16/700 Metin Siyahı

**Özelleştir Düğmesi**
- Arka plan: `#ffffff`
- Metin: `#00754A` (Yeşil Accent)
- Çerçeve: `1.5px solid #00754A`
- Yarıçap: `50px` (tam hap)
- Dolgu: `14px 40px` (varsayılan haplardan belirgin biçimde daha büyük — bu ikincil birincil eylemdir)
- Etiket: Sol iç simge olarak altın parıltı ✨ simgesiyle "Customize"
- Kullanım: boyut/süt seçiminin ardından içecek özelleştirme akışına giriş

**Siparişe Ekle Düğmesi (PDP)**
- Arka plan: `#00754A` (Yeşil Accent)
- Metin: `#ffffff`
- Yarıçap: `50px`
- Dolgu: `14px 32px`
- Ürün kartının sağ üstüne sabitlenmiş ve/veya mağaza-kullanılabilirlik bandı içinde sağa hizalanmış
- Diğer birincil CTA'larla aynı scale(0.95) aktif davranışı

**Rewards Maliyet Hapı — "200★ item"**
- Arka plan: şeffaf
- Çerçeve: `1px solid #cba258` (Altın)
- Metin: `#cba258` (Altın)
- Yarıçap: `50px` (tam hap)
- Dolgu: `4px 12px`
- İçerik: `★`'ın küçük dolu yıldız glifi olduğu "200★ item" — bu öğeyi kullanmak için gereken Rewards Yıldızlarını gösterir
- Yazı tipi: `0.5px` harf aralığıyla Proxima Nova 13/700
- Yalnızca Rewards ile kullanılabilir ürünlerde kullanılır

**Ürün Açıklama Bandı**
- Tam genişlik koyu yeşil band (`#1E3932` House Green)
- Yukarıdan aşağıya şunları içerir:
  1. Rewards Maliyet Hapı (altın), varsa
  2. Beyaz'da ürün açıklama gövde kopyası (16/400/1.5)
  3. Satır içi bilgi-simgesi ipucuyla besinsel özet ("140 calories, 25g sugar, 2.5g fat") — 14/700 beyaz
  4. "Full nutrition & ingredients list" açık-beyaz-yeşil-üstünde hap düğmesi
- Dolgu: `32px` dikey
- Birincil ürün başlık bandının altında görünür

**Malzemeler / Besin Tablosu**
- Beslenme sayfasında iki sütun düzeni
- Sol sütun: "Ingredients" başlığı + liste veya açıklayıcı paragrafta Metin Siyahı Yumuşak 14/400'de "Not available for this item" yer tutucu metin bloğu
- Sağ sütun: "Nutrition" başlığı + etiket/değer satırları
- Her satır: solda besin etiketi (Proxima Nova 14/400), sağda değer (örn. "140 calories", "25g", "205 mg**"), altında `1px solid #e7e7e7` ince çizgi
- Altta 13/400 Metin Siyahı Yumuşak'ta kafein/yıldız işareti notları
- Besin gerçekleri yönetmelik uyumlu tablolar için yeniden kullanılabilir desen

**Mağaza Kullanılabilirlik Seçici**
- Boyut seçenekleri satırının üstünde koyu yeşil özellik bandında görünür
- Saydam-beyaz iç kısmıyla tam genişlik yuvarlatılmış dikdörtgen
- Metin: beyazda "For item availability, choose a store", 14/400
- Sağ taraf: beyaz anahat alışveriş torbasız SVG simgesiyle aşağı ok karşılık işareti
- Yarıçap: `4px`
- Yükseklik: ~48px

**PDP Ekmek Kırıntısı**
- Ürün başlığının üstünde "Menu / Refreshers / Pink Energy Drink" izi
- Ayraç: Metin Siyahı Yumuşak'ta `/` eğik çizgi karakteri
- Geçerli sayfa bağlantısız, önceki sayfalar altı çizili yeşil-vurgu bağlantıları
- Yazı tipi: 14/400 Proxima Nova
- Tüm PDP sayfalarında görünür

**Geri Ok Bağlantısı (PDP beslenme / detay alt sayfaları)**
- Beslenme sayfasındaki bölüm başlıklarının üstünde "← Back" metin bağlantısı
- Yeşil Accent'te metin (`#00754A`) 14/700 Proxima Nova
- Sol ok `<` aynı yeşilde
- Derin alt sayfalarda tam ekmek kırıntısına alternatif

## 5. Düzen İlkeleri

### Aralık Sistemi

Rem tabanlı semantik ölçek (çıpa `1rem = 10px`):

| Token | Rem | Piksel | Tipik Kullanım |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | En sıkı satır içi dolgu |
| `--space-2` | `0.8rem` | 8px | Küçük boşluk, düğme dikey dolgusu |
| `--space-3` | `1.6rem` | 16px | Varsayılan — kart dolgusu, dış boşluk xs |
| `--space-4` | `2.4rem` | 24px | Bölüm iç aralığı, dış boşluk md |
| `--space-5` | `3.2rem` | 32px | Bölümler arası büyük aralık |
| `--space-6` | `4rem` | 40px | Büyük boşluklar, dış boşluk lg, başlık kutusu |
| `--space-7` | `4.8rem` | 48px | Bölümden bölüme aralık |
| `--space-8` | `5.6rem` | 56px | Çok büyük nefes — Frap yüksekliği |
| `--space-9` | `6.4rem` | 64px | En geniş bölüm dolgusu |

**Oluk token'ları:**
- `--outerGutter: 1.6rem` (16px, varsayılan / mobil)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, masaüstü)

**Evrensel ritim sabiti:** `1.6rem` (16px) her sayfada varsayılan dış boşluk, kart dolgusu taban çizgisi ve metin boyutu 3 gövde olarak görünür — sistemin en sık kullanılan aralık birimi.

### Izgara & Kapsayıcı

- Sütun genişliği ölçeği: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Hediye kartı ızgarası `~343px` kutucuklardan oluşan 3-5'li duyarlı ızgara kullanır
- Rewards durum bölümü: `lg+` kırılma noktalarında 3'lü koyu yeşil paneller
- Hero: `--headerCrateProportion` / `--contentCrateProportion` aracılığıyla %40 (görsel) / %60 (içerik) asimetrik bölünme

### Beyaz Alan Felsefesi

Beyaz alan "kafede bol yer var" hissini taşır. Bölüm dolgusu bol miktarda (40–64px) kullanılır. İçerik blokları ayırıcılar yerine beyaz alanla birbirinden ayrılır. Krem tuval (`#f2f0eb`) beyaz kartlar ile yeşil özellik bantları arasında görsel bir nefes alır.

### Köşe Yarıçap Ölçeği

| Değer | Kullanım |
|-------|-----|
| `12px` | Kartlar, modaller, menü öğesi kutucukları (`--cardBorderRadius`) |
| `12px 12px 0 0` | Tam genişlik geri bildirim sekmesi (yalnızca üst yuvarlatılmış) |
| `50px` | Tüm düğmeler — tam hap yarıçapı (`--buttonBorderRadius`) |
| `50%` | Dairesel simgeler, Frap yüzen düğmesi, avatar küçük resimleri |
| Özel | Starbucks-Visa-Kartı maketleri için `3.3333%/5.298%` eliptik (`--svcRoundedCorners`) |

## 6. Derinlik & Yükseltme

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| Kart | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Varsayılan içerik kartları — fısıltı yumuşaklığında çift gölge |
| Global Gezinti | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Sabit üst çubukta üç katmanlı yumuşak kaldırma |
| Frap Taban | `0 0 6px rgba(0,0,0,0.24)` | Yüzen dairesel CTA etrafında taban hale |
| Frap Ortam | `0 8px 12px rgba(0,0,0,0.14)` | Frap'ı öne çıkaran yığılmış yönsel ortam |
| Hediye Kartı | İllüstratif fotoğrafın etrafında hafif düşük gölge | Hediye kutucukları için fiziksel kart hissi |
| Starbucks Kartı (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Starbucks Kartı görselleri için yığılmış SVG düşük gölgeleri |

**Gölge felsefesi:** Fısıltı yumuşaklığında, düz renk üzerine katmanlı — sistem asla tek bir ağır düşük gölgeye uzanmaz. Bunun yerine, gerçek dünya ortam + doğrudan aydınlatmayı simüle etmek için farklı ofsetlerle 2–3 düşük-alfa gölge yığar. Frap düğmesi, herhangi bir sayfadaki en yüksek öğedir.

### Dekoratif Derinlik

- **Gradyan sistemi yok** — yüzeyler düz renk bloklu
- **Renk bloklu bantlama** algılanan derinliği taşır (koyu yeşil bantlar, krem/beyaz gövde bölümleri arasında "girintili özellik bölgeleri" olarak okunur)
- **Starbucks Kartı görsellerinde SVG filtre gölgeleri**, box-shadow olmadan hafif bir 3B fiziksellik katar

## 7. Yapılması & Yapılmaması Gerekenler

### Yapılması Gerekenler
- Saf beyaz yerine sayfa tuvali olarak Nötr Sıcak (`#f2f0eb`) veya Seramik (`#edebe9`) kullanın — sıcak krem imzadır
- Yeşil kademeleri amaçlanan yüzey rollerine göre eşleyin — Starbucks Yeşili başlıklar için, Yeşil Accent CTA'lar için, House Green derin bantlar için, Uplift dekoratif
- SoDoSans'ta sistem genelinde `-0.01em` / `-0.16px` sıkı izlemeyi koruyun
- Tüm düğmelerde istisnasız 50px tam hap yarıçapı kullanın
- Evrensel düğme aktif durumu olarak `transform: scale(0.95)` uygulayın
- Altını yalnızca Rewards-statüsü tören anlarına ayırın
- Neredeyse her şey için SoDoSans kullanın; yalnızca Rewards editorial başlıkları için Lander Tall serif'e geçin; Kalam scripti yalnızca Careers "fincan adı" anlarına ayırın
- Yükseltme için tek bir ağır düşük gölge yerine 2–3 düşük-alfa gölge katmanlayın
- Frap dairesel CTA'yı her alışveriş yüzeyinde kalıcı yüzen sipariş girişi olarak kullanın
- Krem tuvalin içerik kartları arasında nefes almasına izin verin — ayırıcılar değil, beyaz alan kullanın

### Yapılmaması Gerekenler
- Sayfa tuvali olarak saf beyaz kullanmayın — sıcak krem sıcaklığı belirleyici bir unsurdur
- "Tek marka yeşili" seçmeyin — dört yeşil sistem kasıtlıdır; yalnızca `#006241` kullanmak markayı düzleştirir
- Altını genel amaçlı vurgu olarak kullanmayın — yalnızca Rewards sinyalidir
- Düğme köşelerini köşeli yapmayın — 50px hap evrenseldir
- Gradyan dolgular eklemeyin — sistem baştan sona renk blokludur
- H1 ve H2 arasındaki ağırlık-kontrastını boyutla sağlamayın — hiyerarşi ağırlıktan + renkten gelir (600 Starbucks-Yeşil ile 400 Metin Siyahı)
- Gövde metni için saf siyah kullanmayın — `rgba(0,0,0,0.87)` sıcak tuvale uyar
- Düğmelerdeki `scale(0.95)` aktif geri bildirimi atlamayın — imza mikro-etkileşimdir
- Tek ağır gölgeler yığmayın; her zaman 2–3 düşük-alfa yığın
- Ana alışveriş akışına serif veya script eklemeyin — bunlar sırasıyla Rewards ve Careers bağlamlarına aittir

## 8. Duyarlı Davranış

### Kırılma Noktaları

Bileşen genişliği token'larından ve kademeli gezinti yüksekliklerinden çıkarılmıştır:

| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| xs | < 480px | Global gezinti 64px; hamburger menü; tek sütun düzenler; hap düğmeler tam genişlik |
| Mobil | 480–767px | Global gezinti 72px; hediye kartı ızgarası 2'li; kart dolgusu sıkışır |
| Tablet | 768–1023px | Global gezinti 83px; hediye kartı ızgarası 3'lü; hero bölünmesi görünmeye başlar |
| Masaüstü | 1024–1439px | Global gezinti 99px; hediye kartı ızgarası 4'lü; tam asimetrik hero %40/%60 |
| XLarge | 1440px+ | İçerik `--columnWidthXLarge`'da sınırlanır; hediye kartı ızgarası 5'li; ekstra krem kenar boşluğu |

### Dokunma Hedefleri

- `7px 16px` dolgulu hap düğmeleri ~32px yüksekliğindedir — yalnızca dokunmatik yüzeyler için 44px WCAG AAA minimum değerinin altında. Mobilde düğme dolgusu minimumu karşılamak için görsel olarak genişletilebilir.
- `56px` Frap yüzen dairesel düğmesi minimumun çok üzerindedir.
- Frap, görsel kenar ötesinde dokunma alanını 8px genişletmek için `--frapTouchOffset: calc(-1 * .8rem)` kullanır.
- Form yüzen etiket girişleri mobilde etiket yazı tipi boyutunu artırır (1.9rem masaüstü yerine 1.6rem taban) — uzak tutmada dokunup okumak daha kolay.

### Daraltma Stratejisi

- **Global gezinti yüksekliği kademeli ölçeklenir**: kırılma noktaları boyunca 64 → 72 → 83 → 99px, tek bir değer değil
- **Hero bölünmesi daraltılır**: %40/%60 asimetrik bölünme → mobilden yığılmış (üstte görsel, altta içerik)
- **Hediye kartı ızgarası**: kırılma noktaları boyunca ayarlanmış kart genişlikleriyle 5'li → 4'lü → 3'lü → 2'li → 1'li
- **Özellik bantları**: Tam genişlikte kalır ancak mobilden metin + görseller dikey yığılır
- **Dış boşluk ölçeklenir**: Görüntü alanı büyüdükçe 16px → 24px → 40px
- **Rewards 3 sütunlu durum panelleri**: Mobilden tek sütuna yığılır

### Görsel Davranışı

- Hero ürün fotoğrafçılığı mobilden dikey olarak daha sıkı kırpar; içerik görsel çıpa olur
- Hediye kartı illüstrasyonları en boy oranını korur; kart ızgarası yeniden akar
- Görsel yüklemede `opacity 0.3s ease-in` solma girişi geçişi (rahatsız edici ani görünümü önler)
- Elde tutulan Rewards uygulaması fotoğrafçılığı orantılı ölçeklenir; asla uzamaz

## 9. Ajan İstemi Kılavuzu

### Hızlı Renk Başvurusu

- Birincil CTA: "Yeşil Accent (`#00754A`)"
- Birincil CTA metni: "Beyaz (`#ffffff`)"
- Marka başlığı: "Starbucks Yeşili (`#006241`)"
- Özellik bandı / alt bilgi: "House Green (`#1E3932`)"
- Sayfa tuvali: "Nötr Sıcak (`#f2f0eb`)"
- Kart tuvali: "Beyaz (`#ffffff`)"
- Açık üstünde başlık metni: "Metin Siyahı (`rgba(0,0,0,0.87)`)"
- Açık üstünde gövde metni: "Metin Siyahı Yumuşak (`rgba(0,0,0,0.58)`)"
- Koyu yeşil üstünde gövde metni: "Metin Beyazı Yumuşak (`rgba(255,255,255,0.70)`)"
- Rewards vurgusu: "Altın (`#cba258`)"
- Rewards metni: "Rewards Yeşili (`#33433d`)"
- Yıkıcı: "Kırmızı (`#c82014`)"

### Örnek Bileşen İstemleri

1. "Yeşil Accent (`#00754A`) arka plan, 'Explore our afternoon menu' beyaz metin, `-0.01em` harf aralığıyla SoDoSans yazı tipi 16px ağırlık 600, `50px` kenarlık-yarıçapı (tam hap), `7px 16px` dolgu ile birincil Starbucks CTA hap düğmesi oluşturun. `0.2s ease` geçişiyle aktif durum olarak `transform: scale(0.95)` uygulayın."

2. "`12px` kenarlık-yarıçapıyla Beyaz (`#ffffff`) arka plan, katmanlı gölge `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` içerik kartı tasarlayın. İçeriklere `16–24px` dolgu ekleyin (`--space-3` ile `--space-4` arası). Kardeşlere `16px` boşlukla Nötr Sıcak (`#f2f0eb`) sayfa tuvali üzerine yerleştirin."

3. "Frap yüzen dairesel sipariş düğmesi oluşturun — `56px` çap, Yeşil Accent (`#00754A`) dolgu, ortalanmış beyaz alışveriş torbasız simge. Katmanlı gölge: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. `-0.8rem` dokunma ofseti ile sağ altta sabit konum. Aktif durum ortam gölgesini `0 8px 12px rgba(0,0,0,0)` değerine `scale(0.95)` ile daraltır."

4. "Koyu yeşil özellik bandı oluşturun — House Green (`#1E3932`) arka planlı tam genişlik bölüm. Sol sütun: 24px ağırlık 600 beyaz SoDoSans h2, ardından Metin Beyazı Yumuşak (`rgba(255,255,255,0.70)`) gövde paragrafı ve iki düğmeli CTA satırı (birincil için Yeşil Accent metinli Beyaz-dolu, ikincil için Koyu Üstünde Çerçeveli beyaz çerçeve). Sağ sütun: ürün fotoğrafçılığı. Bölünme oranı %40/%60, `768px` altında dikey yığılmış."

5. "Rewards durum kartı oluşturun — `12px` kenarlık-yarıçaplı House Green (`#1E3932`) panel, renkli gradyan üst şerit (Bronz/Gümüş/Altın katman). SoDoSans'ta başlık 24px ağırlık 600 beyaz. Avantajlar listesi `rgba(255,255,255,0.70)` ikincil altyazılarla beyaz maddeler olarak. Altta Metin Beyazı Yumuşak'ta ilerleme metni. `lg+`'da ızgarada 3 panel, mobilden tek sütun."

6. "Hediye kartı kutucuğu tasarlayın — kart yarıçapı `12px`'e uyar, tüm yüzeyi illüstratif fotoğrafla doldurur (el çizimi suluboya-boyalı hissiyat). Hafif düşük gölge onu krem tuval üstünde fiziksel bir kart gibi hissettirir. Izgara üstünde SoDoSans 24px ağırlık 400'de bir kategori etiketi ('Spring', 'Thank You', 'Birthday') ile gruplandırın."

7. "Starbucks ürün detay başlığı oluşturun — ürün başlığının üstünde beyaz'da 14/400 ile ekmek kırıntısı 'Menu / Refreshers / Pink Energy Drink' içeren House Green (`#1E3932`) bandı ve SoDoSans 32/700 büyük harf beyaz ürün başlığı. Başlığın altında ortalanmış ürün fotoğrafı. Fotoğrafın altında 4'lü boyut seçici satırı — her bardak simgesi düğmesi dikey bardak silueti, boyut adı ('Tall' / 'Grande' / 'Venti' / 'Trenta') 16/700 beyaz ve sıvı ons 13/400 Metin Beyazı Yumuşak'ta gösterir. Seçili boyut bardak simgesini `2px solid #00754A` dairesel halkaya sarar."

8. "Starbucks özelleştirme akışı oluşturun — boyut seçicinin altında 3 yığılmış çerçeveli-dikdörtgen giriş satırı (beyaz arka plan, `1px solid #d6dbde` çerçeve, `4px` yarıçap). Her birinin üst çerçevesinin üstünde yüzen etiketi ('Add-ins', 'Milk', 'Add-ins') 13/700 Metin Siyahı büyük harf. Ortalanmış değer (örn. 'Ice', 'Coconut'). Sağ taraf: Metin Siyahı Yumuşak'ta aşağı ok. Kaşık satırı için dairesel `32px` çerçeveli düğmelerle sayısal artırıcı (`−` `1` `+`) ekleyin. Üç alanın altında: altın parıltı simgesiyle çerçeveli yeşil 'Customize' hapı, `50px` yarıçap, `14px 40px` dolgu. Aynı satırda Yeşil Accent dolu 'Add to Order' hapı ile eşleştirin."

9. "Starbucks ürün açıklama bandı tasarlayın — ürün başlığının altında tam genişlik House Green (`#1E3932`). Üst: altın çerçeveli '200★ item' Rewards Maliyet Hapı (`50px` yarıçap, `4px 12px` dolgu, altın `#cba258` çerçeve ve metin). Altında: 16/400/1.5 beyaz'da ürün açıklaması. Bilgi-simgesi ipucuyla 14/700 beyaz'da satır içi besinsel özet ('140 calories, 25g sugar, 2.5g fat'). Açık-beyaz-yeşil-üstünde hap düğmesi 'Full nutrition &amp; ingredients list'. 32px dikey dolgu."

10. "Starbucks besin gerçekleri tablosu oluşturun — Beyaz kart içinde iki sütun düzeni. Sol sütun: 'Ingredients' başlığı (24/400 Metin Siyahı), ardından 14/400 Metin Siyahı Yumuşak'ta malzeme listesi veya 'Not available for this item' yer tutucu paragraf. Sağ sütun: 'Nutrition' başlığı, ardından `1px solid #e7e7e7` ince çizgilerle ayrılan etiket/değer satırları (solda besin adı, sağda değer). Tipografi: 14/400 Metin Siyahı'nda etiketler, sağa hizalı 14/700 Metin Siyahı değerler. Altta 13/400 Metin Siyahı Yumuşak'ta dipnot yıldız işareti işaretleri."

### Yineleme Kılavuzu

Bu tasarım sistemiyle oluşturulmuş mevcut ekranları geliştirirken:
1. Bir seferde TEK bir bileşene odaklanın
2. Bu belgeden belirli renk adlarına ve hex kodlarına başvurun
3. Tam değerlerin yanı sıra doğal dil açıklamaları kullanın ("sıcak krem tuval", "dört kademeli yeşil sistem")
4. 50px hap + `scale(0.95)` aktif durumu evrensel olarak koruyun
5. Yeşillerin doğru rollerine eşlenip eşlenmediğini kontrol edin (CTA için Yeşil Accent, başlık için Starbucks Yeşili, band için House Green)
6. Gradyan eklemeyin — sistem renk blokludur
7. SoDoSans izlemeyi sistem genelinde `-0.01em` / `-0.16px`'te tutun

### Bilinen Eksiklikler

- SoDoSans, Google Fonts'ta bulunmayan özel bir yazı tipidir — kamuya açık uygularken Inter veya Manrope'u yerine kullanın ve değişikliği belgeleyin
- Lander Tall (Rewards serifi) de özeldir — Iowan Old Style, Lora veya Source Serif Pro ile değiştirin
- Belgelenen birkaçının ötesinde (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) her etkileşimli yüzey için bileşen başına animasyon zamanlamaları yakalanmamıştır
- Form hata durumu tam stili (kırmızı çerçeve ağırlığı, simge yerleşimi) renklendirme token'ında görünür ancak kapsamlı biçimde çıkarılmamıştır
- Careers sayfasına özgü bileşenler (fincan-adı kartı, arama radyo ızgarası) token adlarında başvuruludur ancak bu çıkarım kapsamında yer almaz
- Starbucks Visa Kartı / Starbucks-Kartı (SVC) ayrıntılı maket özellikleri `--svcRoundedCorners` ve `--svcShadowFilter` token'larıyla ima edilir ancak tam olarak belgelenmemiştir
