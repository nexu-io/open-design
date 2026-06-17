# Duolingo'dan İlham Alan Tasarım Sistemi

> Category: Üretkenlik ve SaaS
> Dil öğrenme platformu. Parlak baykuş yeşili, kalın gölgeler, oyunlaştırılmış neşe.

## 1. Görsel Tema ve Atmosfer

Duolingo, görsel dil olarak işlenmiş oyunlaştırmadır. Arayüz çekinmeden parlaktır; **baykuş yeşili** (`#58cc02`) marka birincil rengi olarak kullanılır ve her etkileşimli öğenin altında, basılmayı bekleyen bir 3D düğme gibi görünen kalın 4px alt gölgesi bulunur. Sayfa beyazdır (`#ffffff`) ve 2–3px kalın kenarlıklar koyu gri (`#e5e5e5`) renktedir; tüm sistem daha iyi hiyerarşiyle yeniden doğmuş 2015 iOS uygulaması gibi okunur.

Tipografi, krom için **Feather Bold** (özel yuvarlak köşeli sans-serif) ve gövde metni için **Mona Sans** (veya Inter) kullanır. Görüntüleme boyutları büyük ve kendinden emin — Duolingo asla fısıldamaz. Başlıklar genellikle yeşil alt çizgi darbesi taşır veya yeşil bir hap üzerinde oturur; maskot Duo (yeşil bir baykuş) statik bir logo olarak değil, aktif bir illüstrasyon karakteri olarak görünür.

Şekil dili dostanedir: kartlarda 16–20px yarıçap, düğmelerde 12px, çipler ve ilerleme çubuklarında 9999px. İkonografi dolu, yuvarlak ve beceriye göre renk kodludur — her ders yüzeyi anında tanımlanabilir bir renk çifti içerir.

**Temel Özellikler:**
- Baykuş yeşili (`#58cc02`) yüzeyin %30'undan fazlasında kullanılan baskın marka rengi
- Her düğmede 4px kalın alt gölge ("dokunsal basma" karşılığı)
- 2–3px düz kenarlıklar, asla ince çizgiler
- Feather Bold (yuvarlak görüntüleme) + Mona Sans (gövde)
- Büyük, kendinden emin metin — görüntüleme boyutları 48px'den başlayıp yükselir
- Karakter olarak maskot: Duo baykuşu katılım sürecinde, hatalarda, serilerde görünür
- Seri turuncusu (`#ff9600`) ve mücevher pembesi (`#ce82ff`) ikincil marka renkleri olarak

## 2. Renk Paleti & Roller

### Birincil
- **Baykuş Yeşili** (`#58cc02`): Marka birincili, birincil CTA, doğru cevap.
- **Koyu Baykuş Yeşili** (`#58a700`): Yeşil düğmeler için basma/gölge rengi.
- **Açık Baykuş Yeşili** (`#89e219`): Hover, yumuşak dolgular.
- **Soluk Baykuş Yeşili** (`#dbf8c5`): Yumuşak yüzey, başarı afişi.

### İkincil Vurgular
- **Seri Turuncusu** (`#ff9600`): Seri sayacı, alev ikonu, premium enerji.
- **Koyu Seri Turuncusu** (`#cc7a00`): Basılmış turuncu.
- **Mücevher Pembesi** (`#ce82ff`): Mücevher para birimi, Super Duolingo.
- **Yılan Balığı Mavisi** (`#1cb0f6`): İpucu düğmesi, bilgi bağlantısı.
- **Kardinal Kırmızı** (`#ff4b4b`): Yanlış cevap, can kaybı.
- **Arı Sarısı** (`#ffc800`): Pro rozeti, başarı.

### Yüzey
- **Kar** (`#ffffff`): Birincil arka plan.
- **Yılan Balığı** (`#f7f7f7`): Bölüm ayırıcı, ikincil yüzey.
- **Kuğu** (`#e5e5e5`): Devre dışı arka plan, gömülü blok.
- **Kurt** (`#777777`): Koyu ayırıcı, ikincil metin.

### Mürekkep & Metin
- **Yılan Balığı Siyahı** (`#3c3c3c`): Birincil metin.
- **Kurt** (`#777777`): İkincil metin, alt yazılar.
- **Tavşan** (`#afafaf`): Devre dışı, yer tutucu.

### Kenarlık
- **Kuğu** (`#e5e5e5`): Standart 2px kenarlık.
- **Tavşan** (`#afafaf`): Hover'da vurgulanan kenarlık.

## 3. Tipografi Kuralları

### Yazı Tipi Ailesi
- **Görüntüleme / UI / Başlıklar**: `Feather Bold`, yedek: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Gövde / Uzun Metin**: `Mona Sans`, yedek: `'Helvetica Neue', system-ui, sans-serif`
- **Kod (nadir, okullar/yönetim)**: `JetBrains Mono`, yedek: `ui-monospace, Menlo, monospace`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|------|--------|-------------|----------------|-------|
| Görüntüleme | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Katılım kahramanı |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Sayfa başlığı |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Bölüm başlığı |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Kart başlığı, ders satırı |
| Büyük Gövde | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Ders istemi, talimat |
| Gövde | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Standart düzyazı |
| Açıklama | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | XP sayacı, meta veri |
| Düğme | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Standart düğme etiketi |
| Seri | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Seri sayısı, alev üzerinde |

### İlkeler
- **800 varsayılandır**: Feather Bold, başlıklarda ve düğmelerde 800 ağırlıkta çalışır. Bu sistemde 700 zayıf görünür.
- **Büyük metin**: Başlık boyutları tipik ürün markalarından %25–40 daha büyüktür — güven kimlik olarak.
- **Yuvarlak harf biçimleri**: Her glif yumuşak uçlara sahiptir; keskin serifler dostluk sözleşmesini bozar.

## 4. Bileşen Stilleri

### Düğmeler

**Birincil (Baykuş Yeşili)**
- Arka plan: `#58cc02`
- Metin: `#ffffff`
- Dolgu: 14px 24px
- Yarıçap: 16px
- Border-bottom: 4px solid `#58a700` (kalın gölge)
- Hover: arka plan `#89e219`
- Aktif: translate-y 4px, border-bottom 0 (düğme "basılır")
- Kullanım: "Devam Et", "Kontrol Et", ana CTA.

**İkincil (Alt Gölgeli Beyaz)**
- Arka plan: `#ffffff`
- Metin: `#777777`
- Kenarlık: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Yarıçap: 16px
- Dolgu: 14px 24px
- Hover: metin `#3c3c3c`, kenarlık `#afafaf`

**Seri Turuncusu**
- Arka plan: `#ff9600`
- Metin: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Kullanım: seri hedefi, "Seriyi Başlat"

**Hata (Kardinal Kırmızı)**
- Arka plan: `#ff4b4b`
- Metin: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Kullanım: yanlış cevap geri bildirimi.

### Kartlar / Ders Karoları
- Arka plan: `#ffffff`
- Kenarlık: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Yarıçap: 16px
- Dolgu: 16px
- Hover: 2px yükselt, gölge `0 4px 0 #d7d7d7`

### Beceri Ağacı Düğümü (Ders Balonu)
- Boyut: 80×72px
- Arka plan: beceri rengi tonlu (aktif için yeşil, kilitli için gri)
- Border-bottom: 6px solid daha koyu varyant
- Yarıçap: 50% (dairesel)
- Aktif: 1.6s'de bir 1.0 → 1.05 nabız atar

### Giriş Alanları
- Arka plan: `#ffffff`
- Kenarlık: 2px solid `#e5e5e5`
- Yarıçap: 12px
- Dolgu: 12px 16px
- Odak: kenarlık `#1cb0f6` (yılan balığı mavisi), halka `0 0 0 3px rgba(28, 176, 246, 0.2)`

### İlerleme Çubuğu
- Yol: `#e5e5e5`
- Dolgu: `#58cc02` (veya seri için `#ff9600`)
- Yarıçap: 9999px
- Yükseklik: 16px
- Animasyonlu dolgu: artışta 320ms ease-out.

## 5. Boşluk & Düzen

- **Temel birim**: 4px. Ölçek: 4, 8, 12, 16, 24, 32, 48, 64.
- **Kapsayıcı**: maks. 1080px, 24px oluk.
- **Ders ağacı sütunu**: 320px genişlik; masaüstünde ortalı.

## 6. Hareket

- **Süre**: Düğme basması için 180ms; beceri düğümü kilit açma için 320ms; aktif düğüm nabzı için 1.6s.
- **Hızlanma**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, hafif aşma) kilit açma animasyonları için.
- **Maskot**: Duo her 4–6s'de bir göz kırpar, seri dönüm noktalarında zıplar (480ms ease-out yay).

## 7. Kullanım Yönergeleri

- Yüksek doygunluktaki baykuş yeşilini, kalın alt gölgeleri ve yuvarlak ders geometrisini birlikte tutun; düz yeşil düğmeler tek başına Duolingo gibi okunmaz.
- Aşırı büyük kalın metni, ürünün teşvik veya geri bildirime ihtiyaç duyduğu ders, seri ve ilerleme anları için ayırın.
- Eğlenceli hareketi ilerleme durumu değişikliklerinde tutumlu kullanın; her denetimde genel zıpla animasyonlarından kaçının.
