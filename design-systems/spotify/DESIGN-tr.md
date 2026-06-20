# Spotify'dan İlham Alan Tasarım Sistemi

> Category: Medya ve Tüketici
> Müzik akışı. Koyu zemin üzerinde canlı yeşil, kalın yazı tipi, albüm kapağı odaklı.

## 1. Görsel Tema ve Atmosfer

Spotify'ın web arayüzü, dinleyicileri neredeyse siyah bir koza (`#121212`, `#181818`, `#1f1f1f`) içinde saran koyu ve sürükleyici bir müzik oynatıcısıdır; burada albüm kapakları ve içerik rengin birincil kaynağı haline gelir. Tasarım felsefesi "içerik önce karanlık"tır — arayüz gölgeye çekilir, böylece müzik, podcast'ler ve çalma listeleri parlamaya başlar. Her yüzey bir kömür tonudur; bu sayede müziğin ikonik Spotify Yeşili (`#1ed760`) ve albüm kapağından gelen tek gerçek rengin parladığı tiyatro benzeri bir ortam yaratılır.

Yazı tipi sistemi SpotifyMixUI ve SpotifyMixUITitle'ı kullanır — Spotify için özelleştirilmiş CircularSp ailesinden (Lineto tarafından Circular, Spotify için uyarlanmıştır) özel fontlar; Arapça, İbranice, Kiril, Yunan, Devanagari ve CJK fontlarını içeren kapsamlı bir geri dönüş yığını ile birlikte Spotify'ın küresel erişimini yansıtır. Tür sistemi kompakt ve işlevseldir: vurgu ve navigasyon için 700 (kalın), ikincil vurgu için 600 (yarı kalın) ve gövde için 400 (normal). Düğmeler sistematik, etiket benzeri bir kalite için büyük harf ve pozitif harf aralığı (1.4px–2px) kullanır.

Spotify'ı ayırt eden özellik hap ve daire geometrisidir. Birincil düğmeler 500px–9999px yarıçap (tam hap), dairesel oynat düğmeleri %50 yarıçap ve arama girişleri 500px hap kullanır. Yükseltilmiş elementlerdeki ağır gölgeler (`rgba(0,0,0,0.5) 0px 8px 24px`) ve benzersiz iç içe geçmiş kenarlık-gölge kombinasyonu (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`) ile birlikte ortaya çıkan arayüz, premium bir ses cihazı gibi hissettirir — dokunsal, yuvarlak ve dokunuşa göre tasarlanmış.

**Temel Özellikler:**
- Neredeyse siyah sürükleyici koyu tema (`#121212`–`#1f1f1f`) — arayüz içeriğin arkasına çekilir
- Tekil marka aksanı olarak Spotify Yeşili (`#1ed760`) — hiçbir zaman dekoratif, her zaman işlevsel
- Küresel yazı tipi desteğiyle SpotifyMixUI/CircularSp font ailesi
- Hap düğmeler (500px–9999px) ve dairesel kontroller (%50) — yuvarlak, dokunuşa optimize
- Geniş harf aralığıyla (1.4px–2px) büyük harf düğme etiketleri
- Yükseltilmiş elementlerde ağır gölgeler (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Anlamsal renkler: negatif kırmızı (`#f3727f`), uyarı turuncusu (`#ffa42b`), duyuru mavisi (`#539df5`)
- Birincil renk kaynağı olarak albüm kapağı — arayüz tasarım gereği akromatik

## 2. Renk Paleti ve Rolleri

### Birincil Marka
- **Spotify Yeşili** (`#1ed760`): Birincil marka aksanı — oynat düğmeleri, aktif durumlar, harekete geçirici mesajlar
- **Neredeyse Siyah** (`#121212`): En derin arka plan yüzeyi
- **Koyu Yüzey** (`#181818`): Kartlar, konteynerler, yükseltilmiş yüzeyler
- **Orta Koyu** (`#1f1f1f`): Düğme arka planları, etkileşimli yüzeyler

### Metin
- **Beyaz** (`#ffffff`): `--text-base`, birincil metin
- **Gümüş** (`#b3b3b3`): İkincil metin, soluk etiketler, pasif navigasyon
- **Neredeyse Beyaz** (`#cbcbcb`): Biraz daha parlak ikincil metin
- **Açık** (`#fdfdfd`): Maksimum vurgu için saf beyaza yakın

### Anlamsal
- **Negatif Kırmızı** (`#f3727f`): `--text-negative`, hata durumları
- **Uyarı Turuncusu** (`#ffa42b`): `--text-warning`, uyarı durumları
- **Duyuru Mavisi** (`#539df5`): `--text-announcement`, bilgi durumları

### Yüzey ve Kenarlık
- **Koyu Kart** (`#252525`): Yükseltilmiş kart yüzeyi
- **Orta Kart** (`#272727`): Alternatif kart yüzeyi
- **Kenarlık Grisi** (`#4d4d4d`): Koyu zemin üzerinde düğme kenarlıkları
- **Açık Kenarlık** (`#7c7c7c`): Çerçeveli düğme kenarlıkları, soluk bağlantılar
- **Ayırıcı** (`#b3b3b3`): Bölücü çizgiler
- **Açık Yüzey** (`#eeeeee`): Açık mod düğmeleri (nadir)
- **Spotify Yeşili Kenarlık** (`#1db954`): Yeşil aksan kenarlık varyantı

### Gölgeler
- **Ağır** (`rgba(0,0,0,0.5) 0px 8px 24px`): Diyaloglar, menüler, yükseltilmiş paneller
- **Orta** (`rgba(0,0,0,0.3) 0px 8px 8px`): Kartlar, açılır menüler
- **İç Kenarlık** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Giriş kenarlık-gölge kombinasyonu

## 3. Tipografi Kuralları

### Font Aileleri
- **Başlık**: `SpotifyMixUITitle`, geri dönüş seçenekleri: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **Arayüz / Gövde**: `SpotifyMixUI`, aynı geri dönüş yığını

### Hiyerarşi

| Rol | Font | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Bölüm Başlığı | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Kalın başlık ağırlığı |
| Öne Çıkan Başlık | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (sıkı) | normal | Yarı kalın bölüm başlıkları |
| Gövde Kalın | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Vurgulu metin |
| Gövde | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Standart gövde |
| Büyük Harf Düğme | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (sıkı) | 1.4px–2px | `text-transform: uppercase` |
| Düğme | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Standart düğme |
| Navigasyon Bağlantısı Kalın | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigasyon |
| Navigasyon Bağlantısı | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Pasif navigasyon |
| Altyazı Kalın | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Kalın meta verisi |
| Altyazı | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Meta verisi |
| Küçük Kalın | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Etiketler, sayımlar |
| Küçük | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | İnce baskı |
| Rozet | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Mikro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | En küçük metin |

### İlkeler
- **Kalın/normal ikili**: Metnin büyük çoğunluğu ya 700 (kalın) ya da 400 (normal) olup 600 ölçülü biçimde kullanılır. Bu, boyut varyasyonu yerine ağırlık kontrastı aracılığıyla net bir görsel hiyerarşi yaratır.
- **Sistem olarak büyük harf düğmeler**: Düğme etiketleri büyük harf ve geniş harf aralığı (1.4px–2px) kullanır; bu da içerik metninden farklı, sistematik bir "etiket" sesi oluşturur.
- **Kompakt boyutlandırma**: Aralık 10px–24px — çoğu sistemden daha dar. Spotify'ın tipi kompakt ve işlevseldir; makale okumak için değil, çalma listelerini taramak için tasarlanmıştır.
- **Küresel yazı tipi desteği**: Kapsamlı geri dönüş yığını (Arapça, İbranice, Kiril, Yunan, Devanagari, CJK) Spotify'ın 180'den fazla pazardaki erişimini yansıtır.

## 4. Bileşen Stilleri

### Düğmeler

**Koyu Hap**
- Arka plan: `#1f1f1f`
- Metin: `#ffffff` veya `#b3b3b3`
- Dolgu: 8px 16px
- Yarıçap: 9999px (tam hap)
- Kullanım: Navigasyon hapları, ikincil eylemler

**Koyu Büyük Hap**
- Arka plan: `#181818`
- Metin: `#ffffff`
- Dolgu: 0px 43px
- Yarıçap: 500px
- Kullanım: Birincil uygulama navigasyon düğmeleri

**Açık Hap**
- Arka plan: `#eeeeee`
- Metin: `#181818`
- Yarıçap: 500px
- Kullanım: Açık mod harekete geçirici mesajları (çerez onayı, pazarlama)

**Çerçeveli Hap**
- Arka plan: şeffaf
- Metin: `#ffffff`
- Kenarlık: `1px solid #7c7c7c`
- Dolgu: 4px 16px 4px 36px (simge için asimetrik)
- Yarıçap: 9999px
- Kullanım: Takip düğmeleri, ikincil eylemler

**Dairesel Oynat**
- Arka plan: `#1f1f1f`
- Metin: `#ffffff`
- Dolgu: 12px
- Yarıçap: %50 (daire)
- Kullanım: Oynat/duraklat kontrolleri

### Kartlar ve Konteynerler
- Arka plan: `#181818` veya `#1f1f1f`
- Yarıçap: 6px–8px
- Çoğu kartta görünür kenarlık yok
- Üzerine gelince: hafif arka plan aydınlanması
- Gölge: yükseltilmiş üzerinde `rgba(0,0,0,0.3) 0px 8px 8px`

### Girişler
- Arama girişi: `#1f1f1f` arka plan, `#ffffff` metin
- Yarıçap: 500px (hap)
- Dolgu: 12px 96px 12px 48px (simge farkındalıklı)
- Odak: kenarlık `#000000` olur, dış çizgi `1px solid`

### Navigasyon
- Aktif için SpotifyMixUI 14px ağırlık 700, pasif için 400 ile koyu kenar çubuğu
- Pasif öğeler için `#b3b3b3` soluk rengi, aktif için `#ffffff`
- Dairesel simge düğmeleri (%50 yarıçap)
- Sol üstte yeşil renkte Spotify logosu

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Ölçek: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Izgara ve Konteyner
- Kenar çubuğu (sabit) + ana içerik alanı
- Izgara tabanlı albüm/çalma listesi kartları
- Altta tam genişlikte şu an çalıyor çubuğu
- Kalan alanı dolduran duyarlı içerik alanı

### Beyaz Alan Felsefesi
- **Koyu sıkıştırma**: Spotify içeriği yoğun bir şekilde paketler — çalma listesi ızgaraları, parça listeleri ve navigasyon sıkı bir şekilde yerleştirilmiştir. Koyu arka plan, büyük boşluklara gerek kalmadan öğeler arasında görsel dinlenme sağlar.
- **Nefes alma alanı yerine içerik yoğunluğu**: Bu bir uygulama, pazarlama sitesi değil. Her piksel dinleme deneyimine hizmet eder.

### Köşe Yarıçapı Ölçeği
- Minimal (2px): Rozetler, açık etiketler
- İnce (4px): Girişler, küçük öğeler
- Standart (6px): Albüm kapağı konteynerleri, kartlar
- Rahat (8px): Bölümler, diyaloglar
- Orta (10px–20px): Paneller, katman öğeleri
- Büyük (100px): Büyük hap düğmeler
- Hap (500px): Birincil düğmeler, arama girişi
- Tam Hap (9999px): Navigasyon hapları, arama
- Daire (%50): Oynat düğmeleri, avatarlar, simgeler

## 6. Derinlik ve Yükseklik

| Seviye | Uygulama | Kullanım |
|-------|-----------|-----|
| Taban (Seviye 0) | `#121212` arka plan | En derin katman, sayfa arka planı |
| Yüzey (Seviye 1) | `#181818` veya `#1f1f1f` | Kartlar, kenar çubuğu, konteynerler |
| Yükseltilmiş (Seviye 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Açılır menüler, üzerine gelince kartlar |
| Diyalog (Seviye 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Kalıplar, katmanlar, menüler |
| İç Kenarlık | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Giriş kenarlıkları |

**Gölge Felsefesi**: Spotify, koyu temalı bir uygulama için oldukça ağır gölgeler kullanır. 24px bulanıklıkta 0.5 opaklık gölgesi, diyaloglar ve menüler için dramatik bir "karanlıkta yüzme" etkisi yaratırken 8px bulanıklıkta 0.3 opaklık daha ince bir kart kaldırma sağlar. Girişlerdeki benzersiz iç kenarlık-gölge kombinasyonu içe gömülü, dokunsal bir kalite yaratır.

## 7. Yapılması ve Yapılmaması Gerekenler

### Yapılması Gerekenler
- Neredeyse siyah arka planlar kullanın (`#121212`–`#1f1f1f`) — gölge varyasyonuyla derinlik
- Spotify Yeşilini (`#1ed760`) yalnızca oynat kontrolleri, aktif durumlar ve birincil harekete geçirici mesajlar için uygulayın
- Tüm düğmeler için hap şekli (500px–9999px) kullanın — oynat kontrolleri için dairesel (%50)
- Düğme etiketlerine büyük harf ve geniş harf aralığı (1.4px–2px) uygulayın
- Tipografiyi kompakt tutun (10px–24px aralığı) — bu bir uygulama, dergi değil
- Koyu arka planlardaki yükseltilmiş öğeler için ağır gölgeler kullanın (0.3–0.5 opaklık)
- Albüm kapağının renk sağlamasına izin verin — arayüzün kendisi akromatik

### Yapılmaması Gerekenler
- Spotify Yeşilini dekoratif amaçlarla veya arka planlarda kullanmayın — yalnızca işlevseldir
- Birincil yüzeyler için açık arka planlar kullanmayın — koyu sürükleyicilik temeldir
- Düğmelerdeki hap/daire geometrisini atlamayın — kare düğmeler kimliği bozar
- İnce/hafif gölgeler kullanmayın — koyu arka planlarda gölgelerin görünür olması için ağır olması gerekir
- Ek marka renkleri eklemeyin — yeşil ve akromatik griler tam palettir
- Rahat satır yükseklikleri kullanmayın — Spotify tipografisi kompakt ve yoğundur
- Ham gri kenarlıkları açıkta bırakmayın — bunun yerine gölge tabanlı veya iç kenarlıklar kullanın

## 8. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | <425px | Kompakt mobil düzeni |
| Mobil | 425–576px | Standart mobil |
| Tablet | 576–768px | 2 sütunlu ızgara |
| Büyük Tablet | 768–896px | Genişletilmiş düzen |
| Küçük Masaüstü | 896–1024px | Kenar çubuğu görünür |
| Masaüstü | 1024–1280px | Tam masaüstü düzeni |
| Büyük Masaüstü | >1280px | Genişletilmiş ızgara |

### Daraltma Stratejisi
- Kenar çubuğu: tam → daraltılmış → gizli
- Albüm ızgarası: 5 sütun → 3 → 2 → 1
- Şu an çalıyor çubuğu: tüm boyutlarda korunur
- Arama: hap girişi korunur, genişlik ayarlanır
- Navigasyon: kenar çubuğu → mobilede alt çubuk

## 9. Ajan Komut Kılavuzu

### Hızlı Renk Referansı
- Arka plan: Neredeyse Siyah (`#121212`)
- Yüzey: Koyu Kart (`#181818`)
- Metin: Beyaz (`#ffffff`)
- İkincil metin: Gümüş (`#b3b3b3`)
- Aksan: Spotify Yeşili (`#1ed760`)
- Kenarlık: `#4d4d4d`
- Hata: Negatif Kırmızı (`#f3727f`)

### Örnek Bileşen Komutları
- "Koyu kart oluştur: `#181818` arka plan, 8px yarıçap. Başlık 16px SpotifyMixUI ağırlık 700, beyaz metin. Alt başlık 14px ağırlık 400, `#b3b3b3`. Üzerine gelince `rgba(0,0,0,0.3) 0px 8px 8px` gölgesi."
- "Hap düğme tasarla: `#1f1f1f` arka plan, beyaz metin, 9999px yarıçap, 8px 16px dolgu. 14px SpotifyMixUI ağırlık 700, büyük harf, harf aralığı 1.4px."
- "Dairesel oynat düğmesi oluştur: Spotify Yeşili (`#1ed760`) arka plan, `#000000` simgesi, %50 yarıçap, 12px dolgu."
- "Arama girişi oluştur: `#1f1f1f` arka plan, beyaz metin, 500px yarıçap, 12px 48px dolgu. İç kenarlık: `rgb(124,124,124) 0px 0px 0px 1px inset`."
- "Navigasyon kenar çubuğu tasarla: `#121212` arka plan. Aktif öğeler: 14px ağırlık 700, beyaz. Pasif: 14px ağırlık 400, `#b3b3b3`."

### Yineleme Kılavuzu
1. `#121212` ile başlayın — her şey neredeyse siyah karanlıkta yaşar
2. Yalnızca işlevsel vurgular için Spotify Yeşili (oynat, aktif, harekete geçirici mesaj)
3. Her şeyi hap yapın — büyükler için 500px, küçükler için 9999px, dairesel için %50
4. Düğmelerde büyük harf ve geniş izleme — sistematik etiket sesi
5. Yükseklik için ağır gölgeler (0.3–0.5 opaklık) — koyu zeminde hafif gölgeler görünmez
6. Albüm kapağı tüm rengi sağlar — arayüz akromatik kalır
