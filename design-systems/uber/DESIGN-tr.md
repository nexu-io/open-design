# Uber'den İlham Alan Tasarım Sistemi

> Category: Medya ve Tüketici
> Mobilite platformu. Cesur siyah-beyaz, sıkı tipografi, kentsel enerji.

## 1. Görsel Tema ve Atmosfer

Uber'in tasarım dili, özgüvenli minimalizmin ustalık eseri bir örneğidir; her pikselin bir amaca hizmet ettiği ve hiçbir şeyin hak etmeden süsleme yapmadığı siyah-beyaz bir evren. Tüm deneyim keskin bir ikililik üzerine inşa edilmiştir: jet siyahı (`#000000`) ve saf beyaz (`#ffffff`), mesajı sulandıracak orta gri tonlar neredeyse hiç kullanılmamaktadır. Bu, tasarımını henüz tamamlamamış bir girişimin steril minimalizmi değil; o kadar köklü bir markanın bilerek benimsediği kısıtlamadır ki marka fısıltıyla bile yetinebilir.

İmza tipografisi olan UberMove, belirgin biçimde kare ve mühendislik kalitesi taşıyan tescilli bir geometrik sans-serif yazı tipidir. UberMove Bold ile 52px boyutundaki başlıklar bir reklam panosunun ağırlığını taşır; otoriter, doğrudan ve özür dilemez. Yardımcı yazı tipi UberMoveText ise orta ağırlıkta (500) biraz daha yumuşak ve okunabilir bir karakterle gövde metni ve düğmeleri karşılar. Birlikte, bir ulaşım haritasına benzeyen bir tipografik sistem oluştururlar: açık, verimli ve hızlı tarama için tasarlanmış.

Uber tasarımını gerçekten özgün kılan şey, tam ekran fotoğraf ve illüstrasyonların hap biçimli etkileşimli öğelerle (999px border-radius) birlikte kullanımıdır. Navigasyon çipleri, CTA düğmeleri ve kategori seçicilerin tümü bu kapsül şeklini paylaşarak Uber'e özgü dokunmatik, parmak dostu bir arayüz dili oluşturur. İllüstrasyonlar; sürücüleri, yolcuları ve kentsel manzaraları gösteren sıcak, hafifçe stilize edilmiş sahneler aracılığıyla başka türlü soğuk ve tek renkli kalabilecek sisteme insani bir boyut katar. Site beyaz içerik bölümleri ile tam siyah bir alt bilgi arasında gidip gelirken, kart tabanlı düzenlemeler düz estetiği bozmadan hafif bir yükselme hissi yaratmak için mümkün olan en yumuşak gölgeleri kullanır (rgba(0,0,0,0.12-0.16)).

**Temel Özellikler:**
- Arayüz çerçevesinde neredeyse hiç orta gri tonu bulunmayan saf siyah-beyaz temel
- UberMove (başlıklar) + UberMoveText (gövde/UI) — tescilli geometrik sans-serif aile
- Her şey hap biçimli: düğmeler, çipler ve navigasyon öğeleri 999px border-radius kullanır
- Keskin tek renkli arayüzle kontrast oluşturan sıcak, insani illüstrasyonlar
- Çok hafif gölgelerle (0.12-0.16 opaklık) kart tabanlı düzenleme
- Kompakt, bilgi yoğun düzenlemelerle 8px aralık ızgarası
- Tam ekran kahraman arka planları olarak entegre edilmiş cesur fotoğrafçılık
- Sayfayı koyu, yüksek kontrastlı bir ortamla demirleyen siyah alt bilgi

## 2. Renk Paleti ve Rolleri

### Birincil
- **Uber Siyahı** (`#000000`): Tanımlayıcı marka rengi — birincil düğmeler, başlıklar, navigasyon metni ve alt bilgi için kullanılır. "Siyaha yakın" veya "mat siyah" değil, gerçek, taviz vermeyen bir siyah.
- **Saf Beyaz** (`#ffffff`): Birincil yüzey rengi ve ters metin. Sayfa arka planları, kart yüzeyleri ve siyah öğeler üzerindeki metin için kullanılır.

### Etkileşimli ve Düğme Durumları
- **Üzerine Gelinme Grisi** (`#e2e2e2`): Beyaz düğme üzerine gelinme durumu — sıcaklık katmadan net geri bildirim sağlayan temiz, serin açık gri.
- **Üzerine Gelinme Açığı** (`#f3f3f3`): Yükseltilmiş beyaz düğmeler için ince üzerine gelinme durumu — nazik etkileşim geri bildirimi için neredeyse görünmez gri.
- **Çip Grisi** (`#efefef`): İkincil/filtre düğmeleri ve navigasyon çipleri için arka plan — nötr, ultra açık gri.

### Metin ve İçerik
- **Gövde Grisi** (`#4b4b4b`): İkincil metin ve alt bilgi bağlantıları — sıcak veya serin bir eğilim taşımayan gerçek orta gri.
- **Soluk Gri** (`#afafaf`): Üçüncül metin, önemsizleştirilmiş alt bilgi bağlantıları ve yer tutucu içerik.

### Kenarlıklar ve Ayrıştırma
- **Kenarlık Siyahı** (`#000000`): Yapısal çerçeveleme için ince 1px kenarlıklar — bölücüler ve form konteynerlerinde idareli kullanılır.

### Gölgeler ve Derinlik
- **Hafif Gölge** (`rgba(0, 0, 0, 0.12)`): Standart kart yükseltme — içerik kartları için hafif bir kaldırma.
- **Orta Gölge** (`rgba(0, 0, 0, 0.16)`): Yüzen eylem düğmeleri ve katmanlar için biraz daha güçlü yükseltme.
- **Düğme Basma** (`rgba(0, 0, 0, 0.08)`): İkincil düğmelerdeki etkin/basılmış durumlar için içe dönük gölge.

### Bağlantı Durumları
- **Varsayılan Bağlantı Mavisi** (`#0000ee`): Altı çizili metin bağlantıları için standart tarayıcı mavisi — gövde içeriğinde kullanılır.
- **Beyaz Bağlantı** (`#ffffff`): Koyu yüzeylerdeki bağlantılar — alt bilgi ve koyu bölümlerde kullanılır.
- **Siyah Bağlantı** (`#000000`): Altı çizili süslemeyle açık yüzeylerdeki bağlantılar.

### Degrade Sistemi
- Uber tasarımı **tamamen degradesizdir**. Siyah/beyaz ikilik ve düz renk blokları tüm görsel hiyerarşiyi oluşturur. Sistemde hiçbir yerde degrade görünmez — her yüzey düz bir renk, her geçiş keskin bir kenar veya gölgedir.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Başlık / Görüntü**: `UberMove`, geri dönüş seçenekleriyle: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Gövde / UI**: `UberMoveText`, geri dönüş seçenekleriyle: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Not: UberMove ve UberMoveText tescilli yazı tipleridir. Harici uygulamalar için en yakın kullanılabilir alternatif olarak `system-ui` veya Inter kullanın. UberMove'un geometrik, kare oranlı karakteri Inter veya DM Sans ile yaklaşık olarak temsil edilebilir.*

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Notlar |
|------|------|------|--------|-------------|-------|
| Görüntü / Kahraman | UberMove | 52px (3.25rem) | 700 | 1.23 (sıkı) | Maksimum etki, reklam panosu varlığı |
| Bölüm Başlığı | UberMove | 36px (2.25rem) | 700 | 1.22 (sıkı) | Ana bölüm çapaları |
| Kart Başlığı | UberMove | 32px (2rem) | 700 | 1.25 (sıkı) | Kart ve özellik başlıkları |
| Alt Başlık | UberMove | 24px (1.5rem) | 700 | 1.33 | İkincil bölüm başlıkları |
| Küçük Başlık | UberMove | 20px (1.25rem) | 700 | 1.40 | Kompakt başlıklar, liste başlıkları |
| Navigasyon / UI Büyük | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Navigasyon bağlantıları, öne çıkan UI metni |
| Gövde / Düğme | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Standart gövde metni, düğme etiketleri |
| Altyazı | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Meta veriler, açıklamalar, küçük bağlantılar |
| Mikro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (rahat) | Küçük yazı, yasal metin |

### İlkeler
- **Kalın başlıklar, orta gövde**: UberMove başlıkları yalnızca 700 ağırlığında (kalın) kullanılır — her başlık reklam panosu gücüyle çarpar. UberMoveText gövde ve UI metni 400-500 kullanır; bu ağırlık kontrastı aracılığıyla net bir görsel hiyerarşi oluşturur.
- **Sıkı başlık satır yükseklikleri**: Tüm başlıklar 1.22-1.40 arasında satır yükseklikleri kullanır — kompakt ve vurucu, okumak yerine taramak için tasarlanmış.
- **İşlevsel tipografi**: Hiçbir yerde dekoratif tipografi uygulaması yoktur. Harf aralığı, metin dönüşümü veya süsleme amaçlı boyutlandırma kullanılmaz. Her metin öğesi doğrudan bir iletişim amacına hizmet eder.
- **İki yazı tipi, katı roller**: UberMove yalnızca başlıklar için kullanılır. UberMoveText yalnızca gövde, düğmeler, bağlantılar ve UI için kullanılır. Sınır hiçbir zaman aşılmaz.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil Siyah (CTA)**
- Arka plan: Uber Siyahı (`#000000`)
- Metin: Saf Beyaz (`#ffffff`)
- İç boşluk: 10px 12px
- Yarıçap: 999px (tam hap)
- Anahat: yok
- Odak: iç çerçeve `rgb(255,255,255) 0px 0px 0px 2px`
- Birincil eylem düğmesi — cesur, yüksek kontrastlı, gözden kaçmaz

**İkincil Beyaz**
- Arka plan: Saf Beyaz (`#ffffff`)
- Metin: Uber Siyahı (`#000000`)
- İç boşluk: 10px 12px
- Yarıçap: 999px (tam hap)
- Üzerine gelinme: arka plan Üzerine Gelinme Grisi (`#e2e2e2`) olur
- Odak: arka plan Üzerine Gelinme Grisi olur, iç çerçeve görünür
- Koyu yüzeylerde veya Birincil Siyahın yanında ikincil eylem olarak kullanılır

**Çip / Filtre**
- Arka plan: Çip Grisi (`#efefef`)
- Metin: Uber Siyahı (`#000000`)
- İç boşluk: 14px 16px
- Yarıçap: 999px (tam hap)
- Etkin: içe dönük gölge `rgba(0,0,0,0.08)`
- Navigasyon çipleri, kategori seçiciler, filtre geçiş düğmeleri

**Yüzen Eylem**
- Arka plan: Saf Beyaz (`#ffffff`)
- Metin: Uber Siyahı (`#000000`)
- İç boşluk: 14px
- Yarıçap: 999px (tam hap)
- Gölge: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Dönüşüm: `translateY(2px)` hafif kaydırma
- Üzerine gelinme: arka plan `#f3f3f3` olur
- Harita kontrolleri, en üste kaydır, yüzen CTA'lar

### Kartlar ve Konteynerler
- Arka plan: Beyaz sayfalarda Saf Beyaz (`#ffffff`); belirgin kart arka planı farklılaştırması yok
- Kenarlık: varsayılan olarak yok — kartlar kontur değil, gölgeyle tanımlanır
- Yarıçap: standart içerik kartları için 8px; öne çıkan/öne çıkarılan kartlar için 12px
- Gölge: standart kaldırma için `rgba(0,0,0,0.12) 0px 4px 16px 0px`
- Kartlar minimum iç boşlukla bilgi yoğundur
- Görsel öncelikli kartlar, metin bindirme veya alt metin ile tam ekran görseller kullanır

### Giriş Alanları ve Formlar
- Metin: Uber Siyahı (`#000000`)
- Arka plan: Saf Beyaz (`#ffffff`)
- Kenarlık: 1px solid Siyah (`#000000`) — görünür kenarlıkların belirgin biçimde göründüğü tek yer
- Yarıçap: 8px
- İç boşluk: standart rahat aralık
- Odak: özel odak durumu çıkarılmamış — standart tarayıcı odak halkasına dayanır

### Navigasyon
- Beyaz arka planlı sabit üst navigasyon
- Logo: 24x24px boyutunda siyah Uber sözcük işareti/simgesi
- Bağlantılar: Uber Siyahında 14-18px, 500 ağırlığında UberMoveText
- Kategori navigasyonu için Çip Grisi (`#efefef`) arka planlı hap biçimli navigasyon çipleri ("Ride", "Drive", "Business", "Uber Eats")
- Menü geçiş düğmesi: %50 border-radius'lu dairesel düğme
- Mobil: hamburger menü deseni

### Görsel İşleme
- Sıcak, el çizimi sahneler (özellik bölümleri için fotoğraf değil)
- İllüstrasyon stili: hafifçe stilize edilmiş insanlar, illüstrasyonlarda sıcak renk paleti, çağdaş his
- Kahraman bölümleri tam genişlikte arka plan olarak cesur fotoğrafçılık veya illüstrasyon kullanır
- Uygulama indirme CTA'ları için QR kodları
- Tüm görseller kartlarda yer aldığında standart 8px veya 12px border-radius kullanır

### Öne Çıkan Bileşenler

**Kategori Hap Navigasyonu**
- Üst düzey navigasyon için yatay hap biçimli düğme satırı ("Ride", "Drive", "Business", "Uber Eats", "About")
- Her hap: Çip Grisi arka plan, siyah metin, 999px yarıçap
- Etkin durum, beyaz metin içeren siyah arka planla gösterilir (ters çevirme)

**Çift Eylemli Kahraman**
- Bölünmüş kahraman: sol tarafta metin/CTA, sağ tarafta harita/illüstrasyon
- Yan yana alış/varış noktası için iki giriş alanı
- Siyah hapta "See prices" CTA düğmesi

**Önceden Planlama Kartları**
- "Uber Reserve" ve seyahat planlaması gibi özellikleri tanıtan kartlar
- Sıcak, insan merkezli görsellerle illüstrasyon ağırlıklı
- Altta beyaz metinli siyah CTA düğmeleri

## 5. Düzenleme İlkeleri

### Aralık Sistemi
- Temel birim: 8px
- Ölçek: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Düğme iç boşluğu: 10px 12px (kompakt) veya 14px 16px (rahat)
- Kart iç boşluğu: yaklaşık 24-32px
- Bölüm dikey aralığı: cömert ama verimli — ana bölümler arasında yaklaşık 64-96px

### Izgara ve Konteyner
- Maksimum konteyner genişliği: yaklaşık 1136px, ortalanmış
- Kahraman: sol metin, sağ görsel bölünmüş düzenleme
- Özellik bölümleri: 2 sütunlu kart ızgaraları veya tam genişlikte tek sütun
- Alt bilgi: siyah arka planda çok sütunlu bağlantı ızgarası
- Görüntü alanı kenarlarına kadar uzanan tam genişlikte bölümler

### Beyaz Alan Felsefesi
- **Verimli, havadar değil**: Uber'in beyaz alanı işlevseldir — ayırmak için yeterli, boş hissettirmeyecek kadar az. Bu bir ulaşım sistemi aralığıdır: kompakt, açık ve amaca yönelik.
- **Bilgi yoğun kartlar**: Kartlar sınırları tanımlamak için gölge ve yarıçapa güvenerek minimal iç aralıkla bilgiyi sıkıştırır.
- **Bölüm nefes alanı**: Ana bölümler geniş dikey aralık alır, ancak bölümler içinde öğeler birbirine yakın gruplandırılır.

### Kenarlık Yarıçapı Ölçeği
- Keskin (0px): Etkileşimli öğelerde kare köşe kullanılmaz
- Standart (8px): İçerik kartları, giriş alanları, liste kutuları
- Rahat (12px): Öne çıkan kartlar, büyük konteynerler, bağlantı kartları
- Tam Hap (999px): Tüm düğmeler, çipler, navigasyon öğeleri, hapler
- Daire (%50): Avatar görselleri, simge konteynerleri, dairesel kontroller

## 6. Derinlik ve Yükseltme

| Düzey | İşlem | Kullanım |
|-------|-----------|-----|
| Düz (Düzey 0) | Gölge yok, düz arka plan | Sayfa arka planı, satır içi içerik, metin bölümleri |
| İnce (Düzey 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Standart içerik kartları, özellik blokları |
| Orta (Düzey 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Yükseltilmiş kartlar, katman öğeleri |
| Yüzen (Düzey 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Yüzen eylem düğmeleri, harita kontrolleri |
| Basılmış (Düzey 4) | `rgba(0,0,0,0.08) inset` (999px yayılma) | Etkin/basılmış düğme durumları |
| Odak Halkası | `rgb(255,255,255) 0px 0px 0px 2px inset` | Klavye odak göstergeleri |

**Gölge Felsefesi**: Uber, gölgeyi yalnızca yapısal bir araç olarak kullanır; hiçbir zaman dekoratif amaçla. Gölgeler, içerik katmanlarını ayırmak için gereken minimum kaldırmayı yaratmak adına her zaman çok düşük opaklıkta (0.08-0.16) siyahtır. Bulanıklık yarıçapları ılımlıdır (8-16px) — doğal hissettirmek için yeterli ama hiçbir zaman dramatik değil. Renkli gölgeler, katmanlı gölge yığınları veya ortam ışığı efektleri bulunmaz. Derinlik, gölge yükseltmesinden çok siyah/beyaz bölüm kontrastıyla iletilir.

## 7. Yapılacaklar ve Yapılmayacaklar

### Yapılacaklar
- Birincil palet olarak gerçek siyah (`#000000`) ve saf beyaz (`#ffffff`) kullanın — bu sert kontrast Uber'dir
- Tüm düğmeler, çipler ve hap biçimli navigasyon öğeleri için 999px border-radius kullanın
- Reklam panosu düzeyinde etki için tüm başlıkları UberMove Bold (700) ile tutun
- Kart yükseltmesi için çok hafif gölgeler (0.12-0.16 opaklık) kullanın — neredeyse görünmez
- Kompakt, bilgi yoğun düzenleme stilini sürdürün — Uber havadarlık yerine verimliliğe öncelik verir
- Tek renkli arayüzü yumuşatmak için sıcak, insan merkezli illüstrasyonlar kullanın
- İçerik kartları için 8px yarıçap, öne çıkan konteynerler için 12px uygulayın
- Navigasyon ve öne çıkan UI metni için UberMoveText'i 500 ağırlığında kullanın
- Çift eylemli düzenlemeler için siyah birincil düğmeleri beyaz ikincil düğmelerle eşleştirin

### Yapılmayacaklar
- UI çerçevesine renk eklemeyin — Uber arayüzü kesinlikle siyah, beyaz ve gridir
- Düğmelerde 999px'den az yuvarlak köşe kullanmayın — tam hap biçimi temel bir kimlik unsurudur
- Yüksek opaklıklı ağır gölgeler veya düşen gölgeler uygulamayın — derinlik çok hafiftir
- Hiçbir yerde serif yazı tipleri kullanmayın — Uber tipografisi yalnızca geometrik sans-seriftir
- Aşırı beyaz alanla havadar, geniş düzenlemeler oluşturmayın — Uber yoğunluğu kasıtlıdır
- Degradeler veya renk katmanları kullanmayın — her yüzey düz, düz bir renktir
- UberMove'u gövde metnine veya UberMoveText'i başlıklara karıştırmayın — hiyerarşi katıdır
- Dekoratif kenarlıklar kullanmayın — kenarlıklar işlevseldir (giriş alanları, bölücüler) veya yoktur
- Siyah/beyaz kontrastı kırık beyazlar veya siyaha yakın renklerle yumuşatmayın — ikilik kasıtlıdır

## 8. Duyarlı Davranış

### Kırılma Noktaları
| Ad | Genişlik | Temel Değişiklikler |
|------|-------|-------------|
| Küçük Mobil | 320px | Minimum düzenleme, tek sütun, yığılmış girişler, kompakt tipografi |
| Mobil | 600px | Standart mobil, yığılmış düzenleme, hamburger navigasyon |
| Küçük Tablet | 768px | İki sütunlu ızgaralar başlar, genişletilmiş kart düzenlemeleri |
| Tablet | 1119px | Tam tablet düzeni, yan yana kahraman içeriği |
| Küçük Masaüstü | 1120px | Masaüstü ızgarası etkinleşir, yatay navigasyon hapları |
| Masaüstü | 1136px | Tam masaüstü düzeni, maksimum konteyner genişliği, bölünmüş kahraman |

### Dokunma Hedefleri
- Tüm hap düğmeleri: minimum 44px yükseklik (10-14px dikey iç boşluk + satır yüksekliği)
- Navigasyon çipleri: rahat parmak dokunması için 14px 16px geniş iç boşluk
- Dairesel kontroller (menü, kapat): %50 yarıçap kolay tıklanabilir büyük hedefler sağlar
- Kart yüzeyleri mobilde tam alan dokunma hedefleri olarak görev yapar

### Daraltma Stratejisi
- **Navigasyon**: Yatay hap navigasyonu dairesel geçiş düğmeli hamburger menüye daraltır
- **Kahraman**: Bölünmüş düzenleme (metin + harita/görsel) tek sütuna yığılır — üstte metin, altta görsel
- **Giriş alanları**: Yan yana alış/varış noktası girişleri dikey olarak yığılır
- **Özellik kartları**: 2 sütunlu ızgara tam genişlikte yığılmış kartlara daraltır
- **Başlıklar**: 52px görüntü 36px, 32px, 24px, 20px üzerinden küçülür
- **Alt bilgi**: Çok sütunlu bağlantı ızgarası akordeon veya yığılmış tek sütuna daraltır
- **Kategori hapları**: Daha küçük ekranlarda taşmayla yatay kaydırma

### Görsel Davranışı
- İllüstrasyonlar konteynerlerinin içinde orantılı biçimde ölçeklenir
- Kahraman görselleri en boy oranını korur, daha küçük ekranlarda kırpılabilir
- QR kodu bölümleri mobilde gizlenir (uygulama indirme doğrudan mağaza bağlantılarına kayar)
- Kart görsellerinde tüm boyutlarda 8-12px border-radius korunur

## 9. Ajan Yönerge Kılavuzu

### Hızlı Renk Referansı
- Birincil Düğme: "Uber Siyahı (#000000)"
- Sayfa Arka Planı: "Saf Beyaz (#ffffff)"
- Düğme Metni (siyah üzerinde): "Saf Beyaz (#ffffff)"
- Düğme Metni (beyaz üzerinde): "Uber Siyahı (#000000)"
- İkincil Metin: "Gövde Grisi (#4b4b4b)"
- Üçüncül Metin: "Soluk Gri (#afafaf)"
- Çip Arka Planı: "Çip Grisi (#efefef)"
- Üzerine Gelinme Durumu: "Üzerine Gelinme Grisi (#e2e2e2)"
- Kart Gölgesi: "rgba(0,0,0,0.12) 0px 4px 16px"
- Alt Bilgi Arka Planı: "Uber Siyahı (#000000)"

### Örnek Bileşen Yönergeleri
- "Saf Beyaz (#ffffff) üzerinde 52px UberMove Bold (700), satır yüksekliği 1.23 ile bir kahraman bölümü oluşturun. Uber Siyahı (#000000) metin kullanın. Gövde Grisi (#4b4b4b) rengiyle 16px UberMoveText 400 ağırlığında, 1.50 satır yüksekliğinde bir altyazı ekleyin. Saf Beyaz metin içeren Uber Siyahı (#000000) hap CTA düğmesi yerleştirin: 999px yarıçap, 10px 12px iç boşluk."
- "Yatay hap düğmelerle bir kategori navigasyon çubuğu tasarlayın. Her hap: Çip Grisi (#efefef) arka plan, Uber Siyahı (#000000) metin, 14px 16px iç boşluk, 999px border-radius. Etkin hap Saf Beyaz metinle Uber Siyahı arka plana çevrilir. 14px 500 ağırlığında UberMoveText kullanın."
- "Saf Beyaz (#ffffff) üzerinde 8px border-radius ve rgba(0,0,0,0.12) 0px 4px 16px gölgeli bir özellik kartı oluşturun. Başlık 24px 700 ağırlığında UberMove, açıklama Gövde Grisi (#4b4b4b) üzerinde 16px UberMoveText. Alta siyah hap CTA düğmesi ekleyin."
- "Uber Siyahı (#000000) üzerinde 20px 700 ağırlığında UberMove ile Saf Beyaz (#ffffff) başlık metni içeren koyu bir alt bilgi oluşturun. Alt bilgi bağlantıları 14px UberMoveText ile Soluk Gri (#afafaf) renkte. Bağlantılar üzerine gelinmede Saf Beyaz olur. Çok sütunlu ızgara düzeni."
- "Saf Beyaz (#ffffff) arka planlı, 999px yarıçaplı, 14px iç boşluklu ve rgba(0,0,0,0.16) 0px 2px 8px gölgeli bir yüzen eylem düğmesi tasarlayın. Üzerine gelinmede arka plan #f3f3f3 olur. En üste kaydırma veya harita kontrolleri için kullanın."

### Yineleme Kılavuzu
1. Bir seferde TEK bir bileşene odaklanın
2. Katı siyah/beyaz paletine başvurun — "onu koyu yap" değil, "Uber Siyahı (#000000) kullan"
3. Düğmeler ve hapler için her zaman 999px yarıçap belirtin — bu Uber kimliği için pazarlık konusu değildir
4. Yazı tipi ailesini açıkça tanımlayın — "başlık için UberMove Bold, etiket için UberMoveText Medium"
5. Gölgeler için "çok hafif gölge (rgba(0,0,0,0.12) 0px 4px 16px)" kullanın — asla ağır düşen gölgeler değil
6. Düzenlemeleri kompakt ve bilgi yoğun tutun — Uber verimlidir, havadar değil
7. İllüstrasyonlar sıcak ve insani olmalı — "soyut şekiller" değil, "sıcak tonlarda stilize insanlar" tanımlayın
8. Dengeli çift eylemli düzenlemeler için siyah CTA'ları beyaz ikincillerle eşleştirin
