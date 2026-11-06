# Discord'dan İlham Alan Tasarım Sistemi

> Kategori: Üretkenlik & SaaS
> Sesli / sohbet platformu. Derin mor-mavi (blurple), karanlık öncelikli yüzeyler, eğlenceli vurgu anları.

## 1. Görsel Tema & Atmosfer

Discord'un ürünü, akşamlar, baskınlar ve grup sesli görüşmeleri için tasarlanmıştır; bu nedenle tüm yüzey karanlık önceliklidir. Varsayılan tuval, derin `Background Primary` (`#313338` açık tema, `#1e1f22` koyu tema) rengidir; kanalları, konuları ve yan panelleri belirtmek için sohbet sütunları biraz daha açık veya koyu tonların üzerine katmanlanır. Karakteristik **Blurple** (`#5865f2`), marka işareti, birincil eylem çağrısı, bahsedilmeler ve "siz" karşılığı için ayrılmıştır — bastırılmış nötrler üzerinde öne çıkması için tutumlu kullanılır.

Tipografi, düz metin ve arayüz için **gg sans** (Discord'un özel Whitney değişimi) kullanır; yuvarlak geometrik şekiller, bir sohbet istemcisinin gerektirdiği küçük boyutlarda bile erişilebilir ama okunaklı bir his verir. Başlıklar kademeli olarak büyür; sohbet satırları sıkıdır (mesaj grupları arasında 4–8px) bu sayede saatlerce geriye dönük kaydırma taranabilir hissettir.

Şekil dili yuvarlak ama balon kadar yumuşak değildir: kartlarda 8px, girişlerde 4px köşe yarıçapı, durum rozetleri ve etiketlerde tam hap şekli. Sunucular hover'da dairelere dönüşen 48px boyutunda yuvarlatılmış kare avatarlara sahiptir — markanın kimliğinin bir parçası haline gelmiş küçük bir hareket öğesi.

**Temel Özellikler:**
- Karanlık öncelikli yüzeyler: `#1e1f22` / `#2b2d31` / `#313338` (3 adımlı derinlik)
- Sohbet yüzeyindeki tek doymuş vurgu olarak Blurple `#5865f2`
- Tüm metinler için gg sans (Whitney stili) — samimi, geometrik, nötr
- Hover'da dairelere dönüşen yuvarlatılmış kare sunucu avatarları (16px yarıçap)
- Sıkı sohbet satırı boşluğu, geniş yan panel dolgusu
- Durum noktaları: çevrimiçi için yeşil, boşta için sarı, rahatsız etme için kırmızı, çevrimdışı için gri
- Koyu modda düşük alfa ile ince kırık beyaz tonlarında piksele hizalanmış 1px ayırıcılar

## 2. Renk Paleti & Roller

### Birincil
- **Blurple** (`#5865f2`): Marka birincili, birincil eylem çağrısı, bahsetme vurgusu.
- **Blurple Hover** (`#4752c4`): Blurple için hover/aktif durumu.
- **Blurple Soft** (`#7289da`): Eski blurple, pazarlamada ikincil vurgu.

### Yüzey (Koyu Tema — varsayılan)
- **Background Tertiary** (`#1e1f22`): Sunucu listesi rayı, en derin arka plan.
- **Background Secondary** (`#2b2d31`): Kanal kenar çubuğu, ayarlar kenar çubuğu.
- **Background Primary** (`#313338`): Sohbet yüzeyi, mesaj sütunu.
- **Background Floating** (`#111214`): Kayan açılır pencereler, araç ipuçları, otomatik tamamlama.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Satırlarda hover bindirmesi.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Aktif satır.

### Yüzey (Açık Tema)
- **Light Bg Primary** (`#ffffff`): Açık temada sohbet yüzeyi.
- **Light Bg Secondary** (`#f2f3f5`): Açık temada kenar çubuğu.
- **Light Bg Tertiary** (`#e3e5e8`): En derin açık yüzey.

### Metin
- **Header Primary** (`#f2f3f5`): Koyu temada kanal başlıkları, modal başlıkları.
- **Header Secondary** (`#b5bac1`): Sessiz başlıklar.
- **Text Normal** (`#dbdee1`): Koyu temada gövde metni — saf beyazdan biraz daha soğuk.
- **Text Muted** (`#949ba4`): Zaman damgaları, sunucu adları, ikincil meta veriler.
- **Text Link** (`#00a8fc`): Mesajlardaki köprüler — blurple'dan ayrışan gök mavisi.
- **Channels Default** (`#80848e`): Kenar çubuğundaki etkin olmayan kanal adı.

### Durum & Anlamsal
- **Status Online** (`#23a55a`): Çevrimiçi nokta, başarı durumları.
- **Status Idle** (`#f0b232`): Boşta nokta, uzakta.
- **Status DND** (`#f23f43`): Rahatsız etme, aynı zamanda yıkıcı kırmızı görevi görür.
- **Status Streaming** (`#593695`): "Yayın yapıyor" moru.
- **Status Offline** (`#80848e`): Çevrimdışı grisi.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): @bahsetme satırlarında yumuşak blurple yıkaması.

### Kenarlık & Ayırıcı
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Koyu modda standart ayırıcı.
- **Border Subtle** (`#3f4147`): Kartlar için düz ayırıcı.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Gövde / Arayüz / Başlıklar**: `gg sans`, geri dönüş: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Ekran (eski / Whitney)**: `Whitney`, geri dönüş: `gg sans`
- **Kod / Mono**: `"gg mono"`, geri dönüş: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Pazarlama hero |
| Sayfa Başlığı | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Ayarlar/profil başlıkları |
| Kanal Adı | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, kanal başlığı |
| Mesaj Gövdesi | gg sans | 16px (1rem) | 400 | 1.375 | normal | Standart sohbet metni |
| Kullanıcı Adı | gg sans | 16px (1rem) | 500 | 1.25 | normal | Mesajın yazarı |
| Zaman Damgası | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Bugün 16:32'de" |
| Kenar Çubuğu Kanalı | gg sans | 16px (1rem) | 500 | 1.25 | normal | Kanal listesi satırları |
| Sunucu Adı | gg sans | 16px (1rem) | 600 | 1.25 | normal | Sunucu başlığı |
| Altyazı / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Durum metni, düzenlendi etiketi |
| Satır İçi Kod | gg mono | 0.875em | 400 | inherit | normal | Satır içi `code` |
| Kod Bloğu | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | ```üçlü çit``` bloğu |

### İlkeler
- **Samimi geometri**: gg sans, a/g/s harflerinde yuvarlak uçlarıyla Whitney'in yerini alır — marka okunabilirliği bozmadan sıcaklık ister.
- **Renk kontrastı yerine ağırlık kontrastı**: hiyerarşi 400→500→600→700→800 ağırlık adımlarından gelir; yüzey nötr kalır.
- **16px gövde**: sohbet mesajları 16px'in altına düşmez. Yoğunluk yazı tipi boyutundan değil satır yüksekliğinden (1.375) gelir.

## 4. Bileşen Stillandırmaları

### Düğmeler

**Birincil**
- Arka Plan: `#5865f2`
- Metin: `#ffffff`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Hover: `#4752c4`
- Kullanım: Birincil eylem çağrıları, "Devam Et", "Sunucuya Katıl"

**İkincil**
- Arka Plan: `#4e5058`
- Metin: `#ffffff`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Hover: `#6d6f78`

**Üçüncül / İnce (Bağlantı stili)**
- Arka Plan: transparent
- Metin: `#dbdee1`
- Hover: metin altı çizili, arka plan değişmez

**Tehlike**
- Arka Plan: `#da373c`
- Metin: `#ffffff`
- Hover: `#a12d2f`

### Girişler
- Arka Plan: `#1e1f22`
- Metin: `#dbdee1`
- Kenarlık: 1px solid `#1e1f22`
- Yarıçap: 4px
- Dolgu: 10px 12px
- Odak: kenarlık `#5865f2`

### Sunucu Avatarları
- Boyut: 48×48px
- Yarıçap: varsayılan olarak 16px (yuvarlatılmış kare); hover ve aktif durumda %50'ye geçiş yapar.
- Aktif durum: ikon sütununun sol kenarında 4px beyaz hap.

### Durum Noktaları
- Boyut: 10×10px
- Kenarlık: 3px solid background-tertiary ("çentik" efekti oluşturur)
- Konum: avatarın sağ alt köşesi.

### Kartlar / Gömülü İçerikler
- Arka Plan: `#2b2d31` (koyu) veya `#f2f3f5` (açık)
- Sol kenarlık: 4px solid gömülü içerik vurgu rengi.
- Yarıçap: 4px
- Dolgu: 8px 16px

### Bahsetme Hapı
- Arka Plan: `rgba(88, 101, 242, 0.3)`
- Metin: `#c9cdfb`
- Dolgu: 0 2px
- Yarıçap: 3px

## 5. Boşluk & Düzen

- **Temel birim**: 4px. Ölçek: 4, 8, 12, 16, 20, 24, 32, 40.
- **Sunucu rayı**: 72px genişliğinde, sabit.
- **Kanal kenar çubuğu**: 240px genişliğinde.
- **Üye listesi**: Masaüstünde 240px genişliğinde.
- **Sohbet sütunu**: Akışkan, minimum 380px.

## 6. Hareket

- **Süre**: Hover için 200ms; avatar daire dönüşümü için 350ms; araç ipucu solması için 80ms.
- **Geçiş eğrisi**: Avatar dönüşümü için `cubic-bezier(0.215, 0.61, 0.355, 1)` (hızlı başlar, yerleşir).
- **Bildirim titreşimi**: Okunmamış bahsetme göstergesinde 1.4s ease-in-out infinite.

## 7. Kullanım Kılavuzları

- Karanlık kabuğu, kompakt yoğunluğu ve blurple eylem hiyerarşisini birlikte koruyun; blurple'ı açık pazarlama stili bir düzende kullanmak Discord ürün hissini bozar.
- Gezinti ağırlıklı yüzeyleri yalıtılmış dekoratif kartlar yerine raylar, kenar çubukları ve sohbet sütunları etrafında yapılandırın.
- İnsanları, sunucuları veya aktif varlığı temsil ederken yuvarlatılmış kare avatar ve durum noktası dilini kullanın.
