# NVIDIA'dan İlham Alan Tasarım Sistemi

> Category: Medya ve Tüketici
> GPU hesaplama. Yeşil-siyah enerji, teknik güç estetiği.

## 1. Görsel Tema ve Atmosfer

NVIDIA'nın web sitesi, tasarım kısıtlaması aracılığıyla ham hesaplama gücünü ileten, yüksek kontrastlı ve teknoloji odaklı bir deneyimdir. Sayfa, stark bir siyah (`#000000`) ve beyaz (`#ffffff`) temel üzerine inşa edilmiş olup NVIDIA'nın imza yeşiliyle (`#76b900`) noktalanmaktadır — marka parmak izi işlevi gören bu kadar özgül bir renk. Bu, doğanın bol yeşili değil; GPU ile işlenmiş ışığın elektrikli, limon tarafa kaymış yeşilidir. Chartreuse ile kelly yeşil arasında konumlanan bu renk, teknoloji alanındaki herkese anında "NVIDIA" sinyali verir.

Özel NVIDIA-EMEA yazı tipi ailesi (Arial ve Helvetica yedekleriyle birlikte) temiz, endüstriyel bir tipografik ses yaratır. Sıkı 1.25 satır yüksekliğiyle 36px kalın başlıklar, yoğun ve otoriter metin blokları oluşturur. Yazı tipi, Silikon Vadisi'nin geometrik oyunculuğundan yoksundur — Avrupalı, pragmatik ve mühendislik odaklıdır. Gövde metni 15-16px boyutunda, okuma için rahat ama cömert değildir; bu sayede ekran alanının GPU belleği gibi optimize edildiği hissi korunur.

NVIDIA'nın tasarımını diğer koyu arka planlı teknoloji sitelerinden ayıran şey, yeşil aksanın disiplinli kullanımıdır. `#76b900`, kenarlarda (`2px solid #76b900`), bağlantı alt çizgilerinde (`underline 2px rgb(118, 185, 0)`) ve CTA'larda görünür — ancak ana içerikteki arka planlar veya büyük yüzey alanları olarak asla kullanılmaz. Yeşil bir sinyal rengidir, yüzey değil. Derin bir gölge sistemiyle (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) ve minimal kenarlık yarıçapıyla (1-2px) birleştiğinde, genel etki piksel halinde işlenmiş hassas mühendislik donanımını andırır.

**Temel Özellikler:**
- NVIDIA Yeşili (`#76b900`) saf aksан olarak — yalnızca kenarlıklar, alt çizgiler ve etkileşimli vurgular
- Siyah (`#000000`) baskın arka plan, koyu bölümlerde beyaz (`#ffffff`) metin
- Arial/Helvetica yedekli özel NVIDIA-EMEA yazı tipi — endüstriyel, Avrupalı, temiz
- Yoğun, otoriter metin blokları oluşturan sıkı satır yükseklikleri (başlıklar için 1.25)
- Minimal kenarlık yarıçapı (1-2px) — tüm sayfa boyunca keskin, mühendislik köşeleri
- Birincil etkileşimli model olarak yeşil kenarlıklı düğmeler (`2px solid #76b900`)
- Keskin ikonografi için 900 ağırlığında Font Awesome 6 Pro/Sharp ikon sistemi
- Zengin etkileşimli bileşenler sağlayan çok çerçeveli mimari (PrimeReact, Fluent UI, Element Plus)

## 2. Renk Paleti ve Roller

### Birincil Marka
- **NVIDIA Yeşili** (`#76b900`): İmza — kenarlıklar, bağlantı alt çizgileri, CTA hatları, aktif göstergeler. Büyük yüzey dolguları olarak asla kullanılmaz.
- **Gerçek Siyah** (`#000000`): Birincil sayfa arka planı, açık yüzeylerdeki metin, baskın ton.
- **Saf Beyaz** (`#ffffff`): Koyu arka planlardaki metin, açık bölüm arka planları, kart yüzeyleri.

### Genişletilmiş Marka Paleti
- **NVIDIA Açık Yeşil** (`#bff230`): Vurgular ve üzerine gelme durumları için parlak limon aksanı.
- **Turuncu 400** (`#df6500`): Uyarılar, öne çıkan rozetler veya enerjiyle ilgili bağlamlar için sıcak aksan.
- **Sarı 300** (`#ef9100`): İkincil sıcak aksan, ürün kategori vurguları.
- **Sarı 050** (`#feeeb2`): Açıklama kutusu arka planları için açık sıcak yüzey.

### Durum ve Anlamsal
- **Kırmızı 500** (`#e52020`): Hata durumları, yıkıcı eylemler, kritik uyarılar.
- **Kırmızı 800** (`#650b0b`): Ciddi uyarı arka planları için koyu kırmızı.
- **Yeşil 500** (`#3f8500`): Başarı durumları, pozitif göstergeler (marka yeşilinden daha koyu).
- **Mavi 700** (`#0046a4`): Bilgilendirici aksanlar, alternatif bağlantı üzerine gelme.

### Dekoratif
- **Mor 800** (`#4d1368`): Gradyan sonları, premium/AI bağlamları için koyu mor.
- **Mor 100** (`#f9d4ff`): Açık mor yüzey tonu.
- **Fuşya 700** (`#8c1c55`): Özel promosyonlar veya öne çıkan içerik için zengin aksan.

### Nötr Skala
- **Gri 300** (`#a7a7a7`): Sessiz metin, devre dışı etiketler.
- **Gri 400** (`#898989`): İkincil metin, meta veri.
- **Gri 500** (`#757575`): Üçüncül metin, yer tutucular, alt bilgiler.
- **Gri Kenarlık** (`#5e5e5e`): İnce kenarlıklar, bölücü çizgiler.
- **Siyaha Yakın** (`#1a1a1a`): Koyu yüzeyler, siyah sayfalardaki kart arka planları.

### Etkileşimli Durumlar
- **Bağlantı Varsayılan (koyu arka plan)** (`#ffffff`): Koyu arka planlarda beyaz bağlantılar.
- **Bağlantı Varsayılan (açık arka plan)** (`#000000`): Açık arka planlarda yeşil alt çizgili siyah bağlantılar.
- **Bağlantı Üzerine Gelme** (`#3860be`): Tüm bağlantı türlerinde üzerine gelindiğinde mavi kayma.
- **Düğme Üzerine Gelme** (`#1eaedb`): Düğme üzerine gelme durumları için turkuaz vurgu.
- **Düğme Aktif** (`#007fff`): Aktif/basılı düğme durumları için parlak mavi.
- **Odak Halkası** (`#000000 solid 2px`): Klavye odağı için siyah çerçeve.

### Gölgeler ve Derinlik
- **Kart Gölgesi** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Yükseltilmiş kartlar için ince ortam gölgesi.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Birincil**: `NVIDIA-EMEA`, yedekler: `Arial, Helvetica, sans-serif`
- **İkon Yazı Tipi**: `Font Awesome 6 Pro` (düz ikonlar için 900 ağırlık, normal için 700)
- **İkon Keskin**: `Font Awesome 6 Sharp` (hafif ikonlar için 300 ağırlık, normal için 400)

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Vitrin Baş | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (sıkı) | normal | Maksimum etki başlıkları |
| Bölüm Başlığı | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (sıkı) | normal | Bölüm başlıkları, kart başlıkları |
| Alt Başlık | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (rahat) | normal | Özellik açıklamaları, alt başlıklar |
| Kart Başlığı | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (sıkı) | normal | Kart ve modül başlıkları |
| Gövde Büyük | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (rahat) | normal | Vurgulu gövde, öne çıkan paragraflar |
| Gövde | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Standart okuma metni |
| Gövde Kalın | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Güçlü etiketler, gezinme öğeleri |
| Küçük Gövde | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (rahat) | normal | İkincil içerik, açıklamalar |
| Küçük Gövde Kalın | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Vurgulu ikincil içerik |
| Büyük Düğme | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (sıkı) | normal | Birincil CTA düğmeleri |
| Düğme | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (sıkı) | normal | Standart düğmeler |
| Kompakt Düğme | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (sıkı) | 0.144px | Küçük/kompakt düğmeler |
| Bağlantı | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Gezinme bağlantıları |
| Büyük Harf Bağlantı | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, gezinme etiketleri |
| Altyazı | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Meta veri, zaman damgaları |
| Küçük Altyazı | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (sıkı) | normal | Küçük baskı, hukuki |
| Mikro Etiket | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, küçük rozetler |
| Mikro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (sıkı) | normal | En küçük arayüz metni |

### İlkeler
- **Kalın varsayılan ses olarak**: NVIDIA, başlıklar, düğmeler, bağlantılar ve etiketler için ağırlıklı olarak 700 ağırlık kullanır. 400 ağırlık yalnızca gövde metni ve açıklamalar için ayrılmıştır — diğer her şey kalın olup güven ve otorite yansıtır.
- **Sıkı başlıklar, rahat gövde**: Başlık satır yüksekliği tutarlı biçimde 1.25 (sıkı) iken, gövde metni 1.50-1.67'ye rahatlar. Bu kontrast, içerik bloklarının üstünde görsel yoğunluk ve paragraflarda rahat okunabilirlik sağlar.
- **Gezinme için büyük harf**: Bağlantı etiketleri, `text-transform: uppercase` ve 700 ağırlık kullanarak, donanım teknik özelliği etiketleri gibi okunan bir gezinme sesi yaratır.
- **Dekoratif takip yok**: Harf aralığı kompakt düğmeler (0.144px) dışında tüm sayfa boyunca normaldir. Yazı tipi, manipülasyon olmaksızın endüstriyel karakteri taşır.

## 4. Bileşen Stillendirmeleri

### Düğmeler

**Birincil (Yeşil Kenarlık)**
- Arka plan: `transparent`
- Metin: `#000000`
- Dolgu: 11px 13px
- Kenarlık: `2px solid #76b900`
- Yarıçap: 2px
- Yazı tipi: 16px 700 ağırlık
- Üzerine gelme: arka plan `#1eaedb`, metin `#ffffff`
- Aktif: arka plan `#007fff`, metin `#ffffff`, kenarlık `1px solid #003eff`, scale(1)
- Odak: arka plan `#1eaedb`, metin `#ffffff`, çerçeve `#000000 solid 2px`, opaklık 0.9
- Kullanım: Birincil CTA ("Daha Fazla Bilgi", "Çözümleri Keşfet")

**İkincil (İnce Yeşil Kenarlık)**
- Arka plan: şeffaf
- Kenarlık: `1px solid #76b900`
- Yarıçap: 2px
- Kullanım: İkincil eylemler, alternatif CTA'lar

**Kompakt / Satır İçi**
- Yazı tipi: 14.4px 700 ağırlık
- Harf aralığı: 0.144px
- Satır yüksekliği: 1.00
- Kullanım: Satır içi CTA'lar, kompakt gezinme

### Kartlar ve Konteynerler
- Arka plan: `#ffffff` (açık) veya `#1a1a1a` (koyu bölümler)
- Kenarlık: yok (temiz kenarlar) veya `1px solid #5e5e5e`
- Yarıçap: 2px
- Gölge: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` yükseltilmiş kartlar için
- Üzerine gelme: gölge yoğunlaşması
- Dolgu: 16-24px iç

### Bağlantılar
- **Koyu Arka Planda**: `#ffffff`, alt çizgi yok, üzerine gelindiğinde `#3860be`'ye kayar
- **Açık Arka Planda**: `#000000` veya `#1a1a1a`, alt çizgi `2px solid #76b900`, üzerine gelindiğinde `#3860be`'ye kayar, alt çizgi kaldırılır
- **Yeşil Bağlantılar**: `#76b900`, üzerine gelindiğinde `#3860be`'ye kayar
- **Sessiz Bağlantılar**: `#666666`, üzerine gelindiğinde `#3860be`'ye kayar

### Gezinme
- Koyu siyah arka plan (`#000000`)
- Logo sola hizalı, belirgin NVIDIA sözcük işareti
- Bağlantılar: NVIDIA-EMEA 14px 700 ağırlık büyük harf, `#ffffff`
- Üzerine gelme: renk kayması, alt çizgi değişikliği yok
- Ürün kategorileri için mega menü açılır listeleri
- Kaydırma sırasında arka planla sabit

### Görsel İşleme
- Ürün/GPU renderleri kahraman görüntüleri olarak, genellikle tam genişlikte
- Derinlik için ince gölgeli ekran görüntüsü görselleri
- Koyu kahraman bölümlerinde yeşil gradyan katmanlar
- %50 yarıçaplı dairesel avatar konteynerleri

### Ayırt Edici Bileşenler

**Ürün Kartları**
- Minimal yarıçaplı (2px) temiz beyaz veya koyu kart
- Başlıkta yeşil aksan kenarlığı veya alt çizgi
- Kalın başlık + daha hafif açıklama modeli
- Altta yeşil kenarlıklı CTA

**Teknik Özellik Tabloları**
- Endüstriyel ızgara düzenleri
- Dönüşümlü satır arka planları (ince gri kayma)
- Kalın etiketler, normal değerler
- Temel ölçümler için yeşil vurgular

**Çerez/Onay Başlığı**
- Sabit alt konum
- Yuvarlak düğmeler (2px yarıçap)
- Gri kenarlık işlemleri

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Birincil dolgu değerleri: 8px, 11px, 13px, 16px, 24px, 32px
- Bölüm aralığı: 48-80px dikey dolgu

### Izgara ve Konteyner
- Maksimum içerik genişliği: yaklaşık 1200px (kapsanan)
- Kapsanan metinle tam genişlik kahraman bölümleri
- Özellik bölümleri: ürün kartları için 2-3 sütun ızgaralar
- Makale/blog içeriği için tek sütun
- Belgeleme için kenar çubuğu düzenleri

### Beyaz Alan Felsefesi
- **Amaçlı yoğunluk**: NVIDIA, teknik içeriğin yoğunluğunu yansıtarak tipik SaaS sitelerinden daha sıkı aralık kullanır. Beyaz alan kavramları ayırmak için vardır, lüks boşluk yaratmak için değil.
- **Bölüm ritmi**: Koyu bölümler beyaz bölümlerle dönüşümlü olarak içerik bloklarını yalnızca aralıkla değil arka plan rengiyle ayırır.
- **Kart yoğunluğu**: Ürün kartları 16-20px boşluklarla birbirine yakın durur; bu, galeri hissi değil katalog hissi yaratır.

### Kenarlık Yarıçapı Skalası
- Mikro (1px): Satır içi aralıklar, küçük öğeler
- Standart (2px): Düğmeler, kartlar, konteynerler, giriş alanları — neredeyse her şey için varsayılan
- Daire (%50): Avatar görselleri, dairesel sekme göstergeleri

## 6. Derinlik ve Yükseklik

| Seviye | İşlem | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok | Sayfa arka planları, satır içi metin |
| İnce (Seviye 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Standart kartlar, modaller |
| Kenarlık (Seviye 1b) | `1px solid #5e5e5e` | İçerik bölücüler, bölüm kenarlıkları |
| Yeşil aksan (Seviye 2) | `2px solid #76b900` | Aktif öğeler, CTA'lar, seçili öğeler |
| Odak (Erişilebilirlik) | `2px solid #000000` çerçeve | Klavye odak halkası |

**Gölge Felsefesi**: NVIDIA'nın derinlik sistemi minimal ve faydacıdır. Temelde tek bir gölge değeri vardır — %30 opaklıkta 5px ortam bulanıklığı — kartlar ve modaller için tutumlu biçimde kullanılır. Birincil derinlik sinyali gölge değil, _renk kontrastıdır_: beyaz bölümlerin yanında siyah arka planlar, siyah yüzeylerde yeşil kenarlıklar. Bu, derinliğin simüle edilmiş ışıktan değil malzeme farklılığından geldiği donanıma benzer görsel katmanlama yaratır.

### Dekoratif Derinlik
- Kahraman içeriğinin arkasında yeşil gradyan yıkamaları
- Bölüm geçişleri için karanlıktan daha koruya gradyanlar (siyahtan siyaha yakına)
- Cam morfizm veya bulanıklık efekti yok — atmosfer yerine netlik

## 7. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | <375px | Kompakt tek sütun, azaltılmış dolgu |
| Mobil | 375-425px | Standart mobil düzen |
| Büyük Mobil | 425-600px | Daha geniş mobil, bazı 2 sütun ipuçları |
| Küçük Tablet | 600-768px | 2 sütun ızgaralar başlar |
| Tablet | 768-1024px | Tam kart ızgaraları, genişletilmiş gezinme |
| Masaüstü | 1024-1350px | Standart masaüstü düzeni |
| Büyük Masaüstü | >1350px | Maksimum içerik genişliği, geniş kenar boşlukları |

### Dokunma Hedefleri
- Düğmeler rahat dokunma hedefleri için 11px 13px dolgu kullanır
- Yeterli aralıkla 14px büyük harf gezinme bağlantıları
- Yeşil kenarlıklı düğmeler koyu arka planlarda yüksek kontrastlı dokunma hedefleri sağlar
- Mobil: tam ekran katmanla hamburger menü daraltma

### Daraltma Stratejisi
- Kahraman: 36px başlık orantılı olarak küçülür
- Gezinme: tam yatay gezinme ~1024px'te hamburger menüye daraltır
- Ürün kartları: 3 sütundan 2 sütuna tek sütun istiflemeye
- Alt bilgi: çok sütunlu ızgara tek istifleme sütununa daraltır
- Bölüm aralığı: 64-80px mobilette 32-48px'e düşer
- Görseller: en boy oranını korur, konteyner genişliğine ölçeklenir

### Görsel Davranışı
- GPU/ürün renderleri tüm boyutlarda yüksek çözünürlüğü korur
- Kahraman görseller görüntü alanıyla orantılı ölçeklenir
- Kart görselleri tutarlı en boy oranları kullanır
- Tam kanama koyu bölümler uçtan uca işlemi korur

## 8. Duyarlı Davranış (Genişletilmiş)

### Tipografi Ölçekleme
- 36px ekran mobilette ~24px'e düşer
- Bölüm başlıkları 24px mobilette ~20px'e düşer
- Gövde metni tüm kırılma noktalarında 15-16px'i korur
- Düğme metni tutarlı dokunma hedefleri için 16px'i korur

### Koyu/Açık Bölüm Stratejisi
- Koyu bölümler (siyah arka plan, beyaz metin) açık bölümlerle (beyaz arka plan, siyah metin) dönüşümlü olur
- Yeşil aksan her iki yüzey türünde de tutarlı kalır
- Koyu yüzeyde: bağlantılar beyaz, alt çizgiler yeşil
- Açık yüzeyde: bağlantılar siyah, alt çizgiler yeşil
- Bu dönüşüm doğal kaydırma ritmi ve içerik gruplandırması oluşturur

## 9. Ajan Yönlendirme Kılavuzu

### Hızlı Renk Referansı
- Birincil aksan: NVIDIA Yeşili (`#76b900`)
- Koyu arka plan: Gerçek Siyah (`#000000`)
- Açık arka plan: Saf Beyaz (`#ffffff`)
- Başlık metni (koyu arka plan): Beyaz (`#ffffff`)
- Başlık metni (açık arka plan): Siyah (`#000000`)
- Gövde metni (açık arka plan): Siyah (`#000000`) veya Siyaha Yakın (`#1a1a1a`)
- Gövde metni (koyu arka plan): Beyaz (`#ffffff`) veya Gri 300 (`#a7a7a7`)
- Bağlantı üzerine gelme: Mavi (`#3860be`)
- Kenarlık aksanı: `2px solid #76b900`
- Düğme üzerine gelme: Turkuaz (`#1eaedb`)

### Örnek Bileşen Yönlendirmeleri
- "Siyah arka plan üzerinde kahraman bölümü oluştur. 36px NVIDIA-EMEA 700 ağırlık başlık, satır yüksekliği 1.25, renk #ffffff. 18px 400 ağırlık alt başlık, satır yüksekliği 1.67, renk #a7a7a7. Şeffaf arka planlı CTA düğmesi, 2px solid #76b900 kenarlık, 2px yarıçap, 11px 13px dolgu, metin #ffffff. Üzerine gelme: arka plan #1eaedb, beyaz metin."
- "Ürün kartı tasarla: beyaz arka plan, 2px kenarlık yarıçapı, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. 20px NVIDIA-EMEA 700 ağırlık başlık, satır yüksekliği 1.25, renk #000000. 15px 400 ağırlık gövde, satır yüksekliği 1.67, renk #757575. Başlıkta yeşil alt çizgi aksanı: border-bottom 2px solid #76b900."
- "Gezinme çubuğu oluştur: #000000 arka plan, üstte sabit. NVIDIA logosu sola hizalı. 14px NVIDIA-EMEA 700 ağırlık büyük harf bağlantılar, renk #ffffff. Üzerine gelme: renk #3860be. Sağa hizalı yeşil kenarlıklı CTA düğmesi."
- "Koyu özellik bölümü oluştur: #000000 arka plan. 14px 700 ağırlık büyük harf bölüm etiketi, renk #76b900. 24px 700 ağırlık başlık, renk #ffffff. 16px 400 ağırlık açıklama, renk #a7a7a7. 20px boşlukla üç ürün kartı yan yana."
- "Alt bilgi tasarla: #000000 arka plan. Bağlantı gruplarıyla çok sütunlu düzen. 14px 400 ağırlık bağlantılar, renk #a7a7a7. Üzerine gelme: renk #76b900. 12px yasal metin, renk #757575 ile alt çubuk."

### Yineleme Kılavuzu
1. Aksан olarak her zaman `#76b900` kullan, arka plan dolgusu olarak asla — kenarlıklar, alt çizgiler ve vurgular için sinyal rengidir
2. Düğmeler varsayılan olarak yeşil kenarlıklı şeffaftır — dolu arka planlar yalnızca üzerine gelme/aktif durumlarında görünür
3. 700 ağırlık, tüm etkileşimli ve başlık öğeleri için baskın sestir; 400 yalnızca gövde paragrafları için
4. Kenarlık yarıçapı her şey için 2px — bu keskin, minimal yuvarlatma, endüstriyel estetiğin özüdür
5. Koyu bölümler beyaz metin kullanır; açık bölümler siyah metin kullanır — yeşil aksan her ikisinde de aynı şekilde çalışır
6. Bağlantı üzerine gelme, bağlantının varsayılan renginden bağımsız olarak her zaman `#3860be` (mavi) dir
7. Başlıklar için satır yüksekliği 1.25, gövde metni için 1.50-1.67 — görsel hiyerarşi için bu kontrastı koru
8. Gezinme büyük harf 14px kalın kullanır — bu donanım etiketi tipografisi marka sesinin bir parçasıdır
