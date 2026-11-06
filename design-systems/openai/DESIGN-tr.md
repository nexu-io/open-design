# OpenAI'dan İlham Alan Tasarım Sistemi

> Category: Yapay Zeka & Büyük Dil Modelleri
> Derin teal-siyahına dayanan, geniş beyaz alan ve editoryal tipografiyle oluşturulmuş sakin, neredeyse tek renkli sistem.

## 1. Görsel Tema ve Atmosfer

OpenAI'ın ürün yüzeyi, kamuya açık bir araştırma laboratuvarı gibi okunur — klinik, kısıtlı ve kasıtlı olarak sessiz. Sayfa arka planı gerçek beyaz (`#ffffff`) üzerine hafif teal alt tonu taşıyan neredeyse siyah bir mürekkep (`#0d0d0d`) katmanıyla oluşturulmuştur; bu sayede metnin kendisi bile koyu yerine hafifçe soğuk bir izlenim bırakır. Sonuç, model çıktısını, kodu ve nesri ön plana taşıyan; onları çevreleyen kabuğu değil, içeriği ön plana çıkaran bir kromatik nötrlüktür.

Sistemin imza hamlesi, kısıtlı ağırlıklarda — gövde için 400, gezinti ve etiketler için 500, vurgu için 600 — **Söhne** (ya da sistem alternatifi `inter`) kullanımı ve bunun editoryal görüntü için kullanılan çağdaş bir serif olan **Signifier** ile eşleştirilmesidir. Pek çok yapay zeka markası fütüristik bir görünüme yönelirken, OpenAI'ın serif başlıkları ürüne sessiz sedasız edebi bir ton katar; sanki her duyuru bir denemeymiş gibi.

Şekil sistemi düzgün biçimde yumuşaktır: 8px–12px yarıçaplar, etiket ve yongalar için 9999px haplar, hiçbir yerde sert köşe yoktur. Bölüm geçişleri bölücüler yerine beyaz boşlukla belirtilir; kenarlıklar göründüğünde `#e5e5e5` ince çizgilerdir ve bu çizgiler rengin varlığından çok yokluğunu çağrıştırır.

**Temel Özellikler:**
- Gerçek beyaz tuval (`#ffffff`) ve derin teal-siyahı mürekkep (`#0d0d0d`)
- Söhne / Inter mütevazı ağırlıklarda (400, 500, 600) — iddialılık değil, kısıtlılık
- Editoryal görüntü başlıkları için Signifier serif
- Her yerde yumuşak 8–12px yarıçaplar; yongalar için 9999px haplar
- İnce kenarlıklar (`#e5e5e5`) tutumlu kullanım; birincil bölücü olarak beyaz boşluk
- Derin teal rengiyle tek renkli illüstrasyonlar — markalarda gradyan yok
- Geniş satır yüksekliği (1.55–1.65) ve sıfıra yakın harf aralığı

## 2. Renk Paleti ve Rolleri

### Birincil
- **Saf Beyaz** (`#ffffff`): Birincil arka plan, kart yüzeyi, düğme arka planı.
- **Mürekkep Siyahı** (`#0d0d0d`): Birincil metin, marka işareti, birincil eylem çağrısı.
- **Yumuşak Siyah** (`#1a1a1a`): İkincil başlık, kritik olmayan metinler için alternatif mürekkep.

### Yüzey ve Arka Plan
- **Sis** (`#fafafa`): Bölüm arası arka plan, altbilgi yüzeyi.
- **İnci** (`#f5f5f5`): Kart yüzeyi, yükseltilmiş panel.
- **Bulut** (`#ececec`): Devre dışı arka plan, bölücü tonu.

### Marka Vurgusu
- **OpenAI Teal** (`#10a37f`): Marka birincil rengi, bağlantı, vurgulama rozeti — aksi hâlde nötr sistemde tek renk.
- **Teal Koyu** (`#0a7a5e`): Marka rengi için üzerine gelme ve basılma durumu.
- **Teal Açık** (`#e8f5f0`): Başarı rozetleri ve vurgulama belirtim kutuları için yüzey tonu.

### Nötrler ve Metin
- **Grafit** (`#3c3c3c`): Gövde metni, varsayılan okuma rengi.
- **Arduvaz** (`#6e6e6e`): İkincil metin, altyazılar, meta veri.
- **Kül** (`#9b9b9b`): Üçüncül metin, yer tutucu, devre dışı etiket.
- **Taş** (`#c4c4c4`): Dekoratif bölücüler, soluk simgeler.

### Anlamsal ve Kenarlık
- **Kenarlık İnce** (`#e5e5e5`): Standart ince çizgi ayırıcı.
- **Kenarlık Yumuşak** (`#ededed`): Beyaz yüzeyde kart ana hattı.
- **Hata** (`#ef4146`): Doğrulama, yıkıcı eylem.
- **Uyarı** (`#f5a623`): Danışma durumları için yumuşak kehribar.
- **Bilgi** (`#2563eb`): Bilgilendirici bağlantı tonu (tutumlu kullanılır; teal yine de öne çıkar).

## 3. Tipografi Kuralları

### Yazı Ailesi
- **Görüntü / Editoryal**: `Signifier`, geri dönüş: `'Source Serif Pro', Georgia, serif`
- **Gövde / Arayüz**: `Söhne`, geri dönüş: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Kod / Monospace**: `Söhne Mono`, geri dönüş: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Görüntü | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Editoryal kahraman, duyuru başlıkları |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Sayfa başlığı |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Bölüm başlığı |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Alt bölüm |
| Büyük Gövde | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Giriş paragrafları |
| Gövde | Söhne | 16px (1rem) | 400 | 1.65 | normal | Standart okuma metni |
| Küçük Gövde | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Kart gövdesi, yoğun arayüz |
| Altyazı | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Meta veri, rozetler |
| Etiket | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Kaş metni, büyük harfli gezinti bağlantıları |
| Kod | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Kod blokları, terminal çıktısı |

### İlkeler
- **Kısıtlılık bir kimlik olarak**: Ağırlıklar 600 ile sınırlıdır; 700 ve üzeri marka dışı hissettirır. Hiyerarşi ağırlıktan değil, boyut ve renkten gelir.
- **Ruh için serif, sistem için sans-serif**: Signifier yalnızca editoryal görüntü anlarında kullanılır. Ürün arayüzü tamamen sans-serif'tir.
- **Görüntü boyutlarında negatif harf aralığı**: Görüntü boyutlarında -0.02em; 16px'te harf aralığı sıfıra döner.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil**
- Arka plan: `#0d0d0d`
- Metin: `#ffffff`
- Dolgu: 10px 18px
- Yarıçap: Yongalarda 9999px (tam hap), dikdörtgen eylem çağrılarında 12px
- Üzerine gelme: `#1a1a1a` arka plan
- Kullanım: Birincil eylem çağrısı, "ChatGPT'yi Dene", "Giriş yap"

**İkincil**
- Arka plan: `#ffffff`
- Metin: `#0d0d0d`
- Kenarlık: 1px solid `#e5e5e5`
- Dolgu: 10px 18px
- Yarıçap: 12px
- Üzerine gelme: arka plan `#fafafa`, kenarlık `#d4d4d4`

**Marka Vurgusu**
- Arka plan: `#10a37f`
- Metin: `#ffffff`
- Dolgu: 10px 18px
- Yarıçap: 12px
- Üzerine gelme: `#0a7a5e`
- Kullanım: Öne çıkan yükseltme eylem çağrısı, başarı yolu

### Kartlar
- Arka plan: `#ffffff`
- Kenarlık: 1px solid `#ededed`
- Yarıçap: 16px
- Dolgu: 24px–32px
- Gölge: Varsayılan olarak yok; üzerine gelindiğinde `0 4px 16px rgba(13,13,13,0.06)`

### Girdiler
- Arka plan: `#ffffff`
- Kenarlık: 1px solid `#e5e5e5`
- Yarıçap: 12px
- Dolgu: 12px 14px
- Odak: kenarlık `#10a37f`, halka `0 0 0 3px rgba(16,163,127,0.12)`

### Haplar ve Etiketler
- Arka plan: `#f5f5f5`
- Metin: `#3c3c3c`
- Dolgu: 4px 10px
- Yarıçap: 9999px
- Yazı tipi: 12px / 500

## 5. Boşluk ve Düzen

- **Temel birim**: 4px. Ölçek: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Kapsayıcı**: Maksimum genişlik 1200px, mobilde 24px oluk, masaüstünde 48px.
- **Bölüm ritmi**: Ana bölümler arasında dikey olarak 96–128px; mobilde 64px.
- **Izgara**: Masaüstünde 12 sütun, mobilde 4 sütun, 24px boşluk.

## 6. Hareket

- **Süre**: Üzerine gelme için 150–220ms; düzen geçişleri için 280–360ms.
- **Yumuşatma**: Girişler için `cubic-bezier(0.16, 1, 0.3, 1)` (düzgün çıkış).
- **Kısıtlılık**: Paralaks yok, kaydırma engeli yok. Yalnızca hafif solma ve öteleme.

## 7. Kullanım Yönergeleri

- Nötr editoryal kısıtlılığı, yumuşak yarıçapı ve seyrek vurgu kullanımını bir arada koruyun; yeşil vurgu renkler tek başına OpenAI benzeri bir yüzey oluşturmaz.
- Signifier tarzı görüntü anlarını yalnızca editoryal veya duyuru hiyerarşisi için kullanın; ürün kontrolleri sans-serif sisteminde kalsın.
- Süslü hareketlerden, ağır gölgelerden ve aşırı büyük dekoratif kartlardan kaçının; sistem sakin, okunabilir ve kasıtlı hissettirmelidir.
