# GitHub'dan İlham Alan Tasarım Sistemi

> Category: Geliştirici Araçları
> Kod odaklı platform. Fonksiyonel yoğunluk, beyaz üzerine mavi hassasiyet, Primer temelleri.

## 1. Görsel Tema ve Atmosfer

GitHub'ın yüzeyi dekore edilmiş değil, mühendislik ürünüdür. Her piksel bir duruş ilan eder: bu, diff'ler, build'ler ve pull request'lerle ilgilenen insanlar için yapılmış bir araçtır. Sayfa arka planı sade bir `#ffffff` (açık) veya `#0d1117` (koyu) şeklindedir; içerik, negatif alan yerine ince çizgi kenarlıklarla ayrılmış yoğun dikdörtgen paneller üzerinde düzenlenir. Bilgi yoğunluğu markanın ta kendisidir — liste satırları, kod satırları, depo başlıkları ve bildirim kartlarının tamamı kaydırmadan yüzlerce öğeyi tarayabilmek için birbirine yakın sıkıştırılmıştır.

Karakteristik vurgular, bağlantılar ve birincil eylemler için **Primer mavisi** (`#0969da`) ile birleştirilmiş durumlar, başarı ve merge butonu için **GitHub yeşili** (`#1a7f37`)'dir. Her ikisi de tüketici ürünü mavileri ve yeşillerine kıyasla biraz daha mat görünür — yoğun gri metne karşı okunabilecek kadar doygun, ancak tek bir görünüm penceresinde birkaç tanesi göründüğünde arka plana karışacak kadar ölçülüdür.

Tipografi, metnin her işletim sisteminde net bir şekilde görüntülenmesi için ürünün tamamında **system-ui** yığınını kullanır; kod için ise **SFMono / Menlo / Consolas** ile eşleştirilir. Editoryal bir görüntüleme yazı tipi yoktur; GitHub'ın sesi, halihazırda kullandığınız sistemin sesidir.

**Temel Özellikler:**
- Gerçek beyaz zemin (`#ffffff`) veya derin lacivert-siyah (`#0d1117`) — ısı yok, ton yok
- İnce çizgi gri kenarlıklar (`#d0d7de`) her bölme ve paneli tanımlar
- Bağlantılar/birincil için Primer mavisi (`#0969da`); başarı/merge için GitHub yeşili (`#1a7f37`)
- Düz yazı için system-ui; kod için SFMono — özel yazı tipi yok
- Minimal dolgu ile yoğun liste satırları; boşluk nadirdir
- 16px / 24px Octicon ikonografisi — tek çizgi, geometrik, tutarlı
- Güçlü renk semantiğiyle hap şekilli durum rozetleri

## 2. Renk Paleti ve Rolleri

### Birincil
- **Canvas Default** (`#ffffff`): Birincil sayfa arka planı, açık tema.
- **Canvas Subtle** (`#f6f8fa`): İkincil yüzey, kenar çubuğu, girdi arka planı, başlık şeridi.
- **Canvas Inset** (`#eaeef2`): Kod bloğu arka planı, derin iç içe yüzey.
- **Fg Default** (`#1f2328`): Birincil metin, başlıklar, mürekkep.
- **Fg Muted** (`#656d76`): İkincil metin, açıklamalar, dosya yolları.

### Marka Vurgusu
- **Primer Blue** (`#0969da`): Bağlantılar, birincil çağrı-eylem butonları, odak halkası tabanı — evrensel etkileşimli renk.
- **Primer Blue Hover** (`#0550ae`): Birincil mavi için üzerine gelme/basılı durumu.
- **Accent Subtle** (`#ddf4ff`): Açıklamalar ve bilgi bannerleri için yumuşak mavi yüzey.

### Semantik
- **Success / Merge Green** (`#1a7f37`): Birleştirilmiş PR'lar, başarı rozetleri, merge butonu.
- **Success Subtle** (`#dafbe1`): Başarı yüzey tonu.
- **Open Green** (`#1a7f37`): "Açık" issue/PR durumu.
- **Closed / Danger Red** (`#cf222e`): Kapatılmış PR'lar, yıkıcı eylem, doğrulama hatası.
- **Danger Subtle** (`#ffebe9`): Hata banner yüzeyi.
- **Attention / Warning Yellow** (`#9a6700`): Kehribar yüzeyde uyarı metni.
- **Attention Subtle** (`#fff8c5`): Uyarı banner yüzeyi.
- **Done Purple** (`#8250df`): Birleştirilmiş-ve-arşivlenmiş, "tamamlandı" durumu, premium rozet.
- **Sponsor Pink** (`#bf3989`): Sponsors kalbi, GitHub sponsors markası.

### Kenarlık ve Ayırıcı
- **Border Default** (`#d0d7de`): Standart ince çizgi kenarlık, panel dış çizgisi.
- **Border Muted** (`#d8dee4`): Panel içindeki iç bölücüler.
- **Border Subtle** (`#eaeef2`): Soluk tablo satır bölücüleri.

### Koyu Tema
- **Dark Canvas** (`#0d1117`): Koyu sayfa arka planı.
- **Dark Surface** (`#161b22`): Kenar çubuğu, başlık, ikincil yüzey.
- **Dark Border** (`#30363d`): Standart koyu mod kenarlığı.
- **Dark Fg** (`#e6edf3`): Koyu zemin üzerinde birincil metin.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Gövde / Arayüz**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Kod / Monospace**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Kalınlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Depo başlığı, pazarlama hero |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Sayfa başlığı |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Bölüm başlığı |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Alt bölüm, panel başlığı |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Varsayılan metin boyutu — 16px değil |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Açıklamalar, dosya meta verileri |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Kod blokları, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Satır içi `code` alanları |

### İlkeler
- **14px gövde, 16px değil**: GitHub'ın düz yazı yoğunluğu onun kimliğidir. Ürün, bir görünüm penceresine daha fazla satır sığdırmak için 14px'te okunur.
- **İkili kalınlık**: Varsayılan olarak her şey için 400; başlıklar ve vurgu için 600. 500 yok, 700 yok.
- **Her zaman sistem yazı tipleri**: Chrome için asla bir web yazı tipi yüklemeyin — metin yavaş bağlantılarda da anında görüntülenmelidir.

## 4. Bileşen Stilleri

### Butonlar

**Birincil (Yeşil)**
- Arka plan: `#1f883d`
- Metin: `#ffffff`
- Kenarlık: 1px solid `rgba(31, 35, 40, 0.15)`
- Dolgu: 5px 16px
- Yarıçap: 6px
- Gölge: `0 1px 0 rgba(31,35,40,0.1)`
- Üzerine gelme: arka plan `#1a7f37`
- Kullanım: "Depo oluştur", "Pull request'i birleştir"

**Varsayılan**
- Arka plan: `#f6f8fa`
- Metin: `#1f2328`
- Kenarlık: 1px solid `#d0d7de`
- Dolgu: 5px 16px
- Yarıçap: 6px
- Üzerine gelme: arka plan `#f3f4f6`, kenarlık `#d0d7de`

**Dış Çizgi (Mavi Bağlantı Stili)**
- Arka plan: `#ffffff`
- Metin: `#0969da`
- Kenarlık: 1px solid `#d0d7de`
- Üzerine gelme: arka plan `#0969da`, metin `#ffffff`

**Tehlike**
- Arka plan: `#ffffff`
- Metin: `#cf222e`
- Kenarlık: 1px solid `#d0d7de`
- Üzerine gelme: arka plan `#a40e26`, metin `#ffffff`, kenarlık `#a40e26`

### Kartlar / Kutular
- Arka plan: `#ffffff`
- Kenarlık: 1px solid `#d0d7de`
- Yarıçap: 6px
- Dolgu: 16px (başlık) + 16px (gövde)
- Başlıkta alt kenarlıklı `#f6f8fa` şerit bulunur.

### Girdiler
- Arka plan: `#ffffff`
- Kenarlık: 1px solid `#d0d7de`
- Yarıçap: 6px
- Dolgu: 5px 12px
- Odak: kenarlık `#0969da`, halka `0 0 0 3px rgba(9,105,218,0.3)`

### Durum Hapları (Issue / PR)
- **Açık**: arka plan `#1a7f37`, beyaz metin, dolgu 4px 10px, yarıçap 9999px.
- **Kapalı**: arka plan `#cf222e`, beyaz metin.
- **Birleştirildi**: arka plan `#8250df`, beyaz metin.
- **Taslak**: arka plan `#6e7781`, beyaz metin.

### Etiketler (Issue/PR Üzerindeki Etiketler)
- Dolgu: 0 7px
- Yarıçap: 9999px
- Yazı tipi: 12px / 500
- Arka plan ve metin programatiktir (etiket rengi → kontrast için metin hesaplanır).

## 5. Boşluk ve Düzen

- **Temel birim**: 4px. Boşluk ölçeği: 4, 8, 12, 16, 24, 32, 40, 48.
- **Sayfa maksimum genişliği**: 1280px (`Container-xl`).
- **Kenar çubuğu**: Masaüstünde 296px, 1012px'in altında daralır.
- **Satır dolgusu**: 16px yatay, 12px dikey (listeler tasarım gereği yoğundur).

## 6. Hareket

- **Süre**: Üzerine gelme için 80ms; menü/popover açma için 200ms.
- **Yumuşatma**: Açılanlar için `ease-out`, kapananlar için `ease-in`.
- **Kaçınılanlar**: Sayfa yükleme animasyonu, parallax, kalıcı mikro etkileşimler. Şeyler görünür; performans sergilemez.

## 7. Kullanım Kılavuzları

- Yoğun listeleri, kenarlıklı kutuları ve sistem tipografisini bir arada tutun; izole yeşil butonlar GitHub benzeri bir ürün yüzeyi oluşturmak için yeterli değildir.
- Yapıcı depo eylemleri için yeşil, bağlantılar ve odak için mavi, yalnızca issue, PR ve iş akışı durumları için kırmızı/mor/gri kullanın.
- Dekoratif gölgeler veya büyük pazarlama tarzı kartlar yerine sade krom, açık kenarlıklar ve kompakt aralama tercih edin.
