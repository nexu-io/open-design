# Stripe'dan İlham Alan Tasarım Sistemi

> Category: Fintech & Kripto
> Ödeme altyapısı. Özgün mor degradeler, 300 kalınlığında zariflik.

## 1. Görsel Tema & Atmosfer

Stripe'ın web sitesi, fintech tasarımının altın standardıdır — teknik ve lüks, hassas ve sıcak bir his veren sistemi aynı anda başarır. Sayfa, temiz bir beyaz tuval (`#ffffff`) üzerinde derin lacivert başlıklar (`#061b31`) ve hem marka çapası hem de etkileşimli vurgu olarak işlev gören özgün bir mor (`#533afd`) ile açılır. Bu, kurumsal yazılımın soğuk, klinik moru değildir; özgüvenli ve premium okunan, zengin, doygun bir menekşe morundur. Genel izlenim, dünya standartlarında bir yazı döküm şirketi tarafından yeniden tasarlanmış bir finansal kurumdan aldığınız hissi verir.

Özel `sohne-var` değişken yazı tipi, Stripe'ın görsel kimliğinin belirleyici unsurudur. Her metin öğesi, karakterlerin belirgin biçimde geometrik ve modern bir his için değiştirildiği OpenType `"ss01"` stilistik kümesini etkinleştirir. Görüntü boyutlarında (48-56px), sohne-var 300 kalınlığında çalışır — başlıklar için son derece hafif bir kalınlık, neredeyse fısıldayan bir otorite yaratır. Bu, "kalın kahraman başlık" kuralının tam tersidir; Stripe'ın başlıkları bağırmaya ihtiyaç duymaz. Negatif harf aralığı (56px'te -1.4px, 48px'te -0.96px), metni yoğun, mühendislik bloklarına sıkıştırır. Daha küçük boyutlarda sistem, orantılı biçimde azaltılmış takip ile 300 kalınlığını kullanır ve finansal veri gösterimi için `"tnum"` aracılığıyla tabular rakamlar uygular.

Stripe'ı gerçekten ayırt eden unsur gölge sistemidir. Çoğu sitenin düz veya tek katmanlı yaklaşımının aksine, Stripe çok katmanlı, mavi tonlu gölgeler kullanır: özgün `rgba(50,50,93,0.25)` ile `rgba(0,0,0,0.1)`'in birleşimi, serin, neredeyse atmosferik bir derinliğe sahip gölgeler oluşturur — sanki öğeler alacakaranlık bir gökyüzünde yüzüyormuş gibi. Birincil gölge renginin mavi-gri alt tonu (50,50,93), lacivert-mor marka paletine doğrudan bağlanır ve yükseklik bile marka kimliğiyle uyumlu hissettirir.

**Temel Özellikler:**
- Tüm metinlerde OpenType `"ss01"` ile sohne-var — markanın harf biçimlerini tanımlayan özel bir stilistik küme
- İmza başlık kalınlığı olarak 300 Kalınlık — hafif, özgüvenli, konvansiyona karşı
- Görüntü boyutlarında negatif harf aralığı (-1.4px, 56px'te; aşağıya doğru aşamalı gevşeme)
- `rgba(50,50,93,0.25)` kullanılan mavi tonlu çok katmanlı gölgeler — marka rengi hissettiren yükseklik
- Siyah yerine derin lacivert (`#061b31`) başlıklar — sıcak, premium, finansal kalitede
- Muhafazakâr köşe yarıçapı (4-8px) — hap şekli yok, sert kenar yok
- Degradeler ve dekoratif öğeler için yakut (`#ea2261`) ve macenta (`#f96bee`) vurguları
- Kod ve teknik etiketler için tek aralıklı yardımcı olarak `SourceCodePro`

## 2. Renk Paleti & Roller

### Birincil
- **Stripe Moru** (`#533afd`): Birincil marka rengi, CTA arka planları, bağlantı metni, etkileşimli vurgular. Tüm sisteme çıpa olan doygun bir mavi-menekşe.
- **Derin Lacivert** (`#061b31`): `--hds-color-heading-solid`. Birincil başlık rengi. Siyah değil, gri değil — metne sıcaklık ve derinlik katan çok koyu bir mavi.
- **Saf Beyaz** (`#ffffff`): Sayfa arka planı, kart yüzeyleri, koyu arka planlarda düğme metni.

### Marka & Koyu
- **Marka Koyu** (`#1c1e54`): `--hds-color-util-brand-900`. Koyu bölümler, alt bilgi arka planları ve sürükleyici marka anları için derin indigo.
- **Koyu Lacivert** (`#0d253d`): `--hds-color-core-neutral-975`. En koyu nötr — maksimum derinlik için mavi alt tonla neredeyse siyah, sertlik olmaksızın.

### Vurgu Renkleri
- **Yakut** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Simgeler, uyarılar ve vurgu öğeleri için sıcak kırmızı-pembe.
- **Macenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Degradeler ve dekoratif vurgular için canlı pembe-mor.
- **Açık Macenta** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Macenta temalı kart ve rozetler için renklendirilmiş yüzey.

### Etkileşimli
- **Birincil Mor** (`#533afd`): Birincil bağlantı rengi, aktif durumlar, seçili öğeler.
- **Mor Üzerine Gelme** (`#4434d4`): Birincil öğelerde üzerine gelme durumları için daha koyu mor.
- **Derin Mor** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Simge üzerine gelme durumları için koyu mor.
- **Açık Mor** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Yumuşatılmış üzerine gelme arka planları için hafif lavanta.
- **Orta Mor** (`#665efd`): `--hds-color-input-selector-text-range`. Aralık seçici ve girdi vurgu rengi.

### Nötr Ölçeği
- **Başlık** (`#061b31`): Birincil başlıklar, navigasyon metni, güçlü etiketler.
- **Etiket** (`#273951`): `--hds-color-input-text-label`. Form etiketleri, ikincil başlıklar.
- **Gövde** (`#64748d`): İkincil metin, açıklamalar, altyazılar.
- **Başarı Yeşili** (`#15be53`): Durum rozetleri, başarı göstergeleri (arka planlar/kenarlıklar için 0.2-0.4 alfa ile).
- **Başarı Metni** (`#108c3d`): Başarı rozet metin rengi.
- **Limon** (`#9b6829`): `--hds-color-core-lemon-500`. Uyarı ve vurgu aksan.

### Yüzey & Kenarlıklar
- **Varsayılan Kenarlık** (`#e5edf5`): Kart, ayırıcı ve kapsayıcılar için standart kenarlık rengi.
- **Mor Kenarlık** (`#b9b9f9`): Düğme ve girdilerde aktif/seçili durum kenarlıkları.
- **Yumuşak Mor Kenarlık** (`#d6d9fc`): İkincil öğeler için ince mor tonlu kenarlıklar.
- **Macenta Kenarlık** (`#ffd7ef`): Macenta temalı öğeler için pembe tonlu kenarlıklar.
- **Kesik Kenarlık** (`#362baa`): Bırakma alanları ve yer tutucu öğeler için kesik kenarlıklar.

### Gölge Renkleri
- **Mavi Gölge** (`rgba(50,50,93,0.25)`): İmza — mavi tonlu birincil gölge rengi.
- **Koyu Mavi Gölge** (`rgba(3,3,39,0.25)`): Yükseltilmiş öğeler için daha derin mavi gölge.
- **Siyah Gölge** (`rgba(0,0,0,0.1)`): Derinlik pekiştirmesi için ikincil gölge katmanı.
- **Ortam Gölgesi** (`rgba(23,23,23,0.08)`): İnce yükseklik için yumuşak ortam gölgesi.
- **Yumuşak Gölge** (`rgba(23,23,23,0.06)`): Hafif kaldırma için minimal ortam gölgesi.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Birincil**: `sohne-var`, geri dönüş: `SF Pro Display`
- **Tek Aralıklı**: `SourceCodePro`, geri dönüş: `SFMono-Regular`
- **OpenType Özellikleri**: Tüm sohne-var metinlerde `"ss01"` genel olarak etkin; finansal veri ve altyazılarda tabular sayılar için `"tnum"`.

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Kalınlık | Satır Yüksekliği | Harf Aralığı | Özellikler | Notlar |
|------|------|------|--------|-------------|----------------|----------|-------|
| Görüntü Kahraman | sohne-var | 56px (3.50rem) | 300 | 1.03 (sıkı) | -1.4px | ss01 | Maksimum boyut, fısıldayan otorite |
| Büyük Görüntü | sohne-var | 48px (3.00rem) | 300 | 1.15 (sıkı) | -0.96px | ss01 | İkincil kahraman başlıklar |
| Bölüm Başlığı | sohne-var | 32px (2.00rem) | 300 | 1.10 (sıkı) | -0.64px | ss01 | Özellik bölümü başlıkları |
| Büyük Alt Başlık | sohne-var | 26px (1.63rem) | 300 | 1.12 (sıkı) | -0.26px | ss01 | Kart başlıkları, alt bölümler |
| Alt Başlık | sohne-var | 22px (1.38rem) | 300 | 1.10 (sıkı) | -0.22px | ss01 | Daha küçük bölüm başlıkları |
| Büyük Gövde | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Özellik açıklamaları, giriş metni |
| Gövde | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Standart okuma metni |
| Düğme | sohne-var | 16px (1.00rem) | 400 | 1.00 (sıkı) | normal | ss01 | Birincil düğme metni |
| Küçük Düğme | sohne-var | 14px (0.88rem) | 400 | 1.00 (sıkı) | normal | ss01 | İkincil/kompakt düğmeler |
| Bağlantı | sohne-var | 14px (0.88rem) | 400 | 1.00 (sıkı) | normal | ss01 | Navigasyon bağlantıları |
| Açıklama | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Küçük etiketler, meta veriler |
| Küçük Açıklama | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | İnce baskı, zaman damgaları |
| Tabular Açıklama | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Finansal veriler, sayılar |
| Mikro | sohne-var | 10px (0.63rem) | 300 | 1.15 (sıkı) | 0.1px | ss01 | Küçük etiketler, eksen işaretçileri |
| Tabular Mikro | sohne-var | 10px (0.63rem) | 300 | 1.15 (sıkı) | -0.3px | tnum | Grafik verileri, küçük sayılar |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (sıkı) | normal | ss01 | En küçük etiketler |
| Kod Gövdesi | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rahat) | normal | -- | Kod blokları, sözdizimi |
| Kalın Kod | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (rahat) | normal | -- | Kalın kod, anahtar kelimeler |
| Kod Etiketi | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rahat) | normal | büyük harf | Teknik etiketler |
| Mikro Kod | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (sıkı) | normal | ss01 | Küçük kod açıklamaları |

### İlkeler
- **İmza olarak hafif kalınlık**: Görüntü boyutlarında 300 kalınlık, Stripe'ın en ayırt edici tipografik tercihidir. Diğerleri dikkat çekmek için 600-700 kullanırken, Stripe hafifliği lüks olarak kullanır — metin, otorite sahibi olmak için kalınlığa ihtiyaç duymayacak kadar özgüvenlidir.
- **Her yerde ss01**: `"ss01"` stilistik kümesi zorunludur. Tüm sohne-var metinlerde daha geometrik, çağdaş bir his yaratmak için belirli glifleri (muhtemelen alternatif `a`, `g`, `l` biçimleri) değiştirir.
- **İki OpenType modu**: Görüntü/gövde metni için `"ss01"`, finansal verideki tabular rakamlar için `"tnum"`. Bunlar hiçbir zaman çakışmaz — bir paragraftaki sayı ss01 kullanır, veri tablosundaki sayı tnum kullanır.
- **Aşamalı takip**: Harf aralığı boyutla orantılı biçimde sıkışır: 56px'te -1.4px, 48px'te -0.96px, 32px'te -0.64px, 26px'te -0.26px, 16px ve altında normal.
- **İki kalınlık sadeliği**: Ağırlıklı olarak 300 (gövde ve başlıklar) ve 400 (UI/düğmeler). Birincil yazı tipinde kalın (700) yok — SourceCodePro, kod kontrastı için 500/700 kullanır.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil Mor**
- Arka Plan: `#533afd`
- Metin: `#ffffff`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Yazı Tipi: 16px sohne-var 400 kalınlık, `"ss01"`
- Üzerine Gelme: `#4434d4` arka plan
- Kullanım: Birincil CTA ("Hemen başla", "Satış ekibiyle iletişime geç")

**Hayalet / Çerçeveli**
- Arka Plan: şeffaf
- Metin: `#533afd`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Kenarlık: `1px solid #b9b9f9`
- Yazı Tipi: 16px sohne-var 400 kalınlık, `"ss01"`
- Üzerine Gelme: arka plan `rgba(83,58,253,0.05)` olarak değişir
- Kullanım: İkincil eylemler

**Şeffaf Bilgi**
- Arka Plan: şeffaf
- Metin: `#2874ad`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Kenarlık: `1px solid rgba(43,145,223,0.2)`
- Kullanım: Üçüncül/bilgi düzeyinde eylemler

**Nötr Hayalet**
- Arka Plan: şeffaf (`rgba(255,255,255,0)`)
- Metin: `rgba(16,16,16,0.3)`
- Dolgu: 8px 16px
- Yarıçap: 4px
- Taslak: `1px solid rgb(212,222,233)`
- Kullanım: Devre dışı veya sessiz eylemler

### Kartlar & Kapsayıcılar
- Arka Plan: `#ffffff`
- Kenarlık: `1px solid #e5edf5` (standart) veya `1px solid #061b31` (koyu vurgu)
- Yarıçap: 4px (sıkı), 5px (standart), 6px (rahat), 8px (öne çıkan)
- Gölge (standart): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Gölge (ortam): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Üzerine Gelme: gölge yoğunlaşır, çoğunlukla mavi tonlu katman eklenir

### Rozetler / Etiketler / Haplar
**Nötr Hap**
- Arka Plan: `#ffffff`
- Metin: `#000000`
- Dolgu: 0px 6px
- Yarıçap: 4px
- Kenarlık: `1px solid #f6f9fc`
- Yazı Tipi: 11px 400 kalınlık

**Başarı Rozeti**
- Arka Plan: `rgba(21,190,83,0.2)`
- Metin: `#108c3d`
- Dolgu: 1px 6px
- Yarıçap: 4px
- Kenarlık: `1px solid rgba(21,190,83,0.4)`
- Yazı Tipi: 10px 300 kalınlık

### Girdiler & Formlar
- Kenarlık: `1px solid #e5edf5`
- Yarıçap: 4px
- Odak: `1px solid #533afd` veya mor halka
- Etiket: `#273951`, 14px sohne-var
- Metin: `#061b31`
- Yer Tutucu: `#64748d`

### Navigasyon
- Beyaz üzerinde temiz yatay navigasyon, bulanık arka plan ile yapışkan
- Marka logosu sola hizalı
- Bağlantılar: sohne-var 14px 400 kalınlık, `#061b31` metin, `"ss01"` ile
- Yarıçap: Navigasyon kapsayıcısında 6px
- CTA: Sağa hizalı mor düğme ("Giriş yap", "Hemen başla")
- Mobil: 6px yarıçaplı hamburger düğme

### Dekoratif Öğeler
**Kesik Kenarlıklar**
- Yer tutucu/bırakma alanları için `1px dashed #362baa` (mor)
- Macenta temalı dekoratif kenarlıklar için `1px dashed #ffd7ef` (macenta)

**Degrade Vurguları**
- Kahraman dekorasyonları için yakuttan macenta'ya degradeler (`#ea2261`'den `#f96bee`'ye)
- Koyu marka bölümleri, beyaz metinle `#1c1e54` arka planları kullanır

## 5. Düzen İlkeleri

### Boşluk Sistemi
- Temel birim: 8px
- Ölçek: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Dikkat çekici: Ölçek küçük uçta yoğundur (4-12 arası her 2px'te), bu Stripe'ın finansal veriye yönelik hassasiyet odaklı UI'sını yansıtır

### Izgara & Kapsayıcı
- Maksimum içerik genişliği: yaklaşık 1080px
- Kahraman: Geniş dolgu ve hafif başlıklarla ortalanmış tek sütun
- Özellik bölümleri: Özellik kartları için 2-3 sütunlu ızgaralar
- Marka daldırması için `#1c1e54` arka planlı tam genişlik koyu bölümler
- Mavi tonlu gölgelerle kapsayıcı kartlar olarak kod/gösterge paneli önizlemeleri

### Boşluk Felsefesi
- **Hassas aralık**: Minimalist sistemlerin uçsuz bucaksız boşluğunun aksine, Stripe ölçülü, amaçlı boşluk kullanır. Her boşluk kasıtlı bir tipografik tercihtir.
- **Yoğun veri, geniş çerçeve**: Finansal veri gösterimleri (tablolar, grafikler) sıkışık paketlenmiştir, ancak etrafındaki UI çerçevesi geniş biçimde aralıklıdır. Bu, güzel bir çerçevedeki iyi düzenlenmiş bir e-tablo gibi kontrollü bir yoğunluk hissi yaratır.
- **Bölüm ritmi**: Beyaz bölümler, koyu marka bölümleriyle dönüşümlü gelir (`#1c1e54`), keyfi renk eklemeden monotonluğu önleyen dramatik bir açık/koyu ritim yaratır.

### Köşe Yarıçapı Ölçeği
- Mikro (1px): İnce taneli öğeler, ince yuvarlama
- Standart (4px): Düğmeler, girdiler, rozetler, kartlar — çalışkan standart
- Rahat (5px): Standart kart kapsayıcıları
- Gevşek (6px): Navigasyon, daha büyük etkileşimli öğeler
- Büyük (8px): Öne çıkan kartlar, kahraman öğeleri
- Bileşik: Alt yuvarlatlmış kapsayıcılar için `0px 0px 6px 6px` (sekme panelleri, açılır liste altbilgileri)

## 6. Derinlik & Yükseklik

| Seviye | Uygulama | Kullanım |
|-------|-----------|-----|
| Düz (Seviye 0) | Gölge yok | Sayfa arka planı, satır içi metin |
| Ortam (Seviye 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | İnce kart kaldırma, üzerine gelme ipuçları |
| Standart (Seviye 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Standart kartlar, içerik panelleri |
| Yükseltilmiş (Seviye 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Öne çıkan kartlar, açılır listeler, açılır pencereler |
| Derin (Seviye 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modallar, yüzen paneller |
| Halka (Erişilebilirlik) | `2px solid #533afd` taslak | Klavye odak halkası |

**Gölge Felsefesi**: Stripe'ın gölge sistemi, kromatik derinlik ilkesi üzerine kuruludur. Çoğu tasarım sistemi nötr gri veya siyah gölgeler kullanırken, Stripe'ın birincil gölge rengi (`rgba(50,50,93,0.25)`), markanın lacivert paletini yansıtan derin bir mavi-gridir. Bu, yalnızca derinlik katmayan, marka atmosferi de katan gölgeler yaratır. Çok katmanlı yaklaşım, bu mavi tonlu gölgeyi farklı bir ofsetle saf siyah ikincil katmanla (`rgba(0,0,0,0.1)`) eşleştirir; markalı gölgenin öğeden daha uzakta, nötr gölgenin ise daha yakında oturduğu paralaks benzeri bir derinlik yaratır. Negatif yayılma değerleri (-30px, -18px), gölgelerin öğenin yatay ayak izinin ötesine uzanmamasını sağlayarak yüksekliği dikey ve kontrollü tutar.

### Dekoratif Derinlik
- Koyu marka bölümleri (`#1c1e54`), arka plan rengi kontrastı ile sürükleyici derinlik yaratır
- Kahraman dekorasyonları için yakuttan macenta'ya geçişli degrade kaplama
- Yapışkan öğelerin üst kenar gölgeleri için `rgba(0,55,112,0.08)` gölge rengi (`--hds-color-shadow-sm-top`)

## 7. Yapılması ve Yapılmaması Gerekenler

### Yapılması Gerekenler
- Her metin öğesinde `"ss01"` ile sohne-var kullanın — stilistik küme markanın kendisidir
- Tüm başlıklar ve gövde metni için 300 kalınlık kullanın — hafiflik imzadır
- Tüm yükseltilmiş öğeler için mavi tonlu gölgeler (`rgba(50,50,93,0.25)`) uygulayın
- Başlıklar için `#000000` yerine `#061b31` (derin lacivert) kullanın — sıcaklık önemlidir
- Köşe yarıçapını 4-8px arasında tutun — muhafazakâr yuvarlama kasıtlıdır
- Herhangi bir tabular/finansal sayı gösterimi için `"tnum"` kullanın
- Gölgeleri katmanlayın: Derinlik paralaksı için uzakta mavi tonlu + yakında nötr
- Birincil etkileşimli/CTA rengi olarak `#533afd` moru kullanın

### Yapılmaması Gerekenler
- sohne-var başlıklarda 600-700 kalınlık kullanmayın — 300 kalınlık marka sesidir
- Kartlar veya düğmelerde büyük köşe yarıçapı (12px+, hap şekilleri) kullanmayın — Stripe muhafazakârdır
- Nötr gri gölgeler kullanmayın — her zaman mavi ile tonlayın (`rgba(50,50,93,...)`)
- Herhangi bir sohne-var metinde `"ss01"` atlamayın — alternatif glifler kişiliği tanımlar
- Başlıklar için saf siyah (`#000000`) kullanmayın — her zaman `#061b31` derin lacivert
- Etkileşimli öğeler için sıcak vurgu renkleri (turuncu, sarı) kullanmayın — mor birincildir
- Görüntü boyutlarında pozitif harf aralığı uygulamayın — Stripe sıkı takip eder
- Macenta/yakut vurgularını düğmeler veya bağlantılar için kullanmayın — bunlar yalnızca dekoratif/degrade amaçlıdır

## 8. Duyarlı Davranış

### Kesme Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Mobil | <640px | Tek sütun, azaltılmış başlık boyutları, yığılmış kartlar |
| Tablet | 640-1024px | 2 sütunlu ızgaralar, orta dolgu |
| Masaüstü | 1024-1280px | Tam düzen, 3 sütunlu özellik ızgaraları |
| Büyük Masaüstü | >1280px | Geniş kenar boşluklarıyla ortalanmış içerik |

### Dokunma Hedefleri
- Düğmeler rahat dolgu kullanır (dikey 8-16px)
- Navigasyon bağlantıları yeterli aralıklı 14px ile
- Rozetlerin dokunma hedefleri için minimum 6px yatay dolgusu var
- 6px yarıçaplı düğme ile mobil navigasyon düğmesi

### Çökme Stratejisi
- Kahraman: 56px görüntü -> mobilds 32px, 300 kalınlık korunur
- Navigasyon: yatay bağlantılar + CTA'lar -> hamburger düğme
- Özellik kartları: 3 sütun -> 2 sütun -> tek sütun yığılmış
- Koyu marka bölümleri: tam genişlik işlemi koru, iç dolguyu azalt
- Finansal veri tabloları: mobilde yatay kaydırma
- Bölüm aralığı: 64px+ -> mobilds 40px
- Tipografi ölçeği sıkışır: kesme noktalarında 56px -> 48px -> 32px kahraman boyutları

### Görsel Davranışı
- Gösterge paneli/ürün ekran görüntüleri tüm boyutlarda mavi tonlu gölgeyi korur
- Kahraman degradeli dekorasyonlar mobilds sadeleşir
- Kod blokları `SourceCodePro` işlemini korur, yatay kaydırabilir
- Kart görüntüleri tutarlı 4-6px köşe yarıçapını korur

## 9. Ajan Komut İstemi Rehberi

### Hızlı Renk Referansı
- Birincil CTA: Stripe Moru (`#533afd`)
- CTA Üzerine Gelme: Koyu Mor (`#4434d4`)
- Arka Plan: Saf Beyaz (`#ffffff`)
- Başlık metni: Derin Lacivert (`#061b31`)
- Gövde metni: Arduvaz (`#64748d`)
- Etiket metni: Koyu Arduvaz (`#273951`)
- Kenarlık: Yumuşak Mavi (`#e5edf5`)
- Bağlantı: Stripe Moru (`#533afd`)
- Koyu bölüm: Marka Koyu (`#1c1e54`)
- Başarı: Yeşil (`#15be53`)
- Vurgu dekoratif: Yakut (`#ea2261`), Macenta (`#f96bee`)

### Örnek Bileşen Komut İstemleri
- "Beyaz arka plan üzerinde bir kahraman bölümü oluşturun. Başlık 48px sohne-var 300 kalınlık, satır yüksekliği 1.15, harf aralığı -0.96px, renk #061b31, font-feature-settings 'ss01'. Alt başlık 18px 300 kalınlık, satır yüksekliği 1.40, renk #64748d. Mor CTA düğmesi (#533afd, 4px yarıçap, 8px 16px dolgu, beyaz metin) ve hayalet düğme (şeffaf, 1px solid #b9b9f9, #533afd metin, 4px yarıçap)."
- "Kart tasarlayın: beyaz arka plan, 1px solid #e5edf5 kenarlık, 6px yarıçap. Gölge: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Başlık 22px sohne-var 300 kalınlık, harf aralığı -0.22px, renk #061b31, 'ss01'. Gövde 16px 300 kalınlık, #64748d."
- "Başarı rozeti oluşturun: rgba(21,190,83,0.2) arka plan, #108c3d metin, 4px yarıçap, 1px 6px dolgu, 10px sohne-var 300 kalınlık, kenarlık 1px solid rgba(21,190,83,0.4)."
- "Navigasyon oluşturun: backdrop-filter blur(12px) ile beyaz yapışkan başlık. Bağlantılar için sohne-var 14px 400 kalınlık, #061b31 metin, 'ss01'. Mor CTA 'Hemen başla' sağa hizalı (#533afd arka plan, beyaz metin, 4px yarıçap). Navigasyon kapsayıcısı 6px yarıçap."
- "Koyu marka bölümü tasarlayın: #1c1e54 arka plan, beyaz metin. Başlık 32px sohne-var 300 kalınlık, harf aralığı -0.64px, 'ss01'. Gövde 16px 300 kalınlık, rgba(255,255,255,0.7). İçindeki kartlar rgba(255,255,255,0.1) kenarlık ile 6px yarıçap kullanır."

### Yineleme Rehberi
1. sohne-var metinde her zaman `font-feature-settings: "ss01"` etkinleştirin — bu markanın tipografik DNA'sıdır
2. 300 kalınlık varsayılandır; 400'ü yalnızca düğmeler/bağlantılar/navigasyon için kullanın
3. Gölge formülü: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` burada Y1/B1 daha büyük (uzak gölge) ve Y2/B2 daha küçük (yakın gölge)
4. Başlık rengi `#061b31` (derin lacivert), gövde `#64748d` (arduvaz), etiketler `#273951` (koyu arduvaz)
5. Köşe yarıçapı 4-8px aralığında kalır — hap şekilleri veya büyük yuvarlama kullanmayın
6. Tabloların, grafiklerin veya finansal görüntülemelerdeki sayılar için `"tnum"` kullanın
7. Koyu bölümler `#1c1e54` kullanır — siyah değil, gri değil, derin markalı bir indigo
8. 12px/500 kalınlıkta SourceCodePro, 2.00 satır yüksekliği ile kod için (okunabilirlik için çok geniş)
