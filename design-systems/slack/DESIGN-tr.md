# Slack'ten İlham Alan Tasarım Sistemi

> Category: Verimlilik & SaaS
> İş yeri iletişim platformu. Aubergine birincil renk, çok vurgulu logo paleti, koyu kenar çubuğu ile açık yüzeyler, sıcak ve erişilebilir.

## 1. Görsel Tema & Atmosfer

Slack'in kimliği, işin insancıl ve hatta biraz eğlenceli hissettirmesi gerektiği fikri üzerine kuruludur. Kanonik yüzey **açık** renktir — derin aubergine (`#4A154B`) kenar çubuğu olan beyaz içerik alanları — karanlık öncelikli araçların tam tersi. Bu kontrast kasıtlıdır: kenar çubuğu sakin, her zaman mevcut bir navigasyon çapasıyken içerik alanı parlak ve açıktır.

Logo paleti — mavi, yeşil, sarı, kırmızı — esas olarak hashtag simgesinde ve pazarlama bağlamlarında görünür, kullanıcı arayüzüne yayılmış değildir. Ürünün kendisinde Slack, aubergine'i tek marka çapası olarak kullanan kısıtlı, profesyonel bir renk sistemi kullanır.

**Temel Özellikler:**
- Açık öncelikli içerik yüzeyleri: beyaz `#FFFFFF` ve beyaza yakın `#F8F8F8`
- Derin aubergine `#4A154B` kenar çubuğu — markanın en tanınmış kullanıcı arayüzü öğesi
- Dört logo vurgu rengi (mavi, yeşil, sarı, kırmızı) yalnızca vurgular olarak tutumlu biçimde kullanılır
- Başlıklar için Larsseit (pazarlama), kullanıcı arayüzü için sistem sans-serif
- Yuvarlak ama karikatür değil: çoğu bileşende 4–8px yarıçap
- Yoğun ama nefes alabilir: net konu hiyerarşisi ile kompakt mesaj satırları
- Sıcak ve konuşma dili tonu — emojiler, tepkiler ve çizimler birinci sınıf öğelerdir

---

## 2. Renk Paleti & Roller

### Birincil Marka Rengi
| Token | Hex | Rol |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Kenar çubuğu arka planı, birincil marka rengi |
| `--color-aubergine-dark` | `#350d36` | Aubergine yüzeylerdeki hover durumları |
| `--color-aubergine-light` | `#611f69` | Kenar çubuğundaki aktif öğe vurgusu |

### Logo Vurgu Renkleri (tutumlu kullanın — yalnızca vurgular, simgeler, pazarlama için)
| Token | Hex | Ad | Rol |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Gökyüzü Mavisi | Kanal simgeleri, bağlantılar, bilgi durumları |
| `--color-green` | `#2EB67D` | Teal Yeşili | Çevrimiçi durumu, başarı durumları |
| `--color-yellow` | `#ECB22E` | Altın | Uzakta durumu, uyarılar, vurgular |
| `--color-red` | `#E01E5A` | Yakut | Bildirimler, hatalar, bahsetme rozeti |

### Yüzey & Arka Plan
| Token | Hex | Rol |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Ana mesaj alanı, modallar |
| `--bg-secondary` | `#F8F8F8` | Konu panelleri, ikincil yüzeyler |
| `--bg-tertiary` | `#F1F1F1` | Giriş arka planları, hover durumları |
| `--bg-sidebar` | `#4A154B` | Sol kenar çubuğu (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Kenar çubuğu öğesi hover |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Aktif kenar çubuğu öğesi |
| `--bg-message-hover` | `#F8F8F8` | Mesaj satırı hover |

### Metin Renkleri
| Token | Hex | Rol |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Birincil gövde metni (siyaha yakın) |
| `--text-secondary` | `#616061` | Zaman damgaları, soluk etiketler |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Kenar çubuğundaki kanal adları |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Kenar çubuğundaki etkin olmayan öğeler |
| `--text-link` | `#1264A3` | Mesajlardaki satır içi bağlantılar |
| `--text-mention` | `#1264A3` | @bahsetme metin rengi |

### Semantik Renkler
| Token | Hex | Rol |
|---|---|---|
| `--color-success` | `#2EB67D` | Başarı bildirimleri, olumlu durumlar |
| `--color-warning` | `#ECB22E` | Uyarı durumları |
| `--color-danger` | `#E01E5A` | Hata durumları, yıkıcı eylemler |
| `--color-info` | `#36C5F0` | Bilgilendirici vurgular |

### Kenarlık & Ayırıcı
| Token | Hex | Rol |
|---|---|---|
| `--border-default` | `#DDDDDD` | Standart ayırıcılar, kart kenarlıkları |
| `--border-subtle` | `#F1F1F1` | Satırlar arasındaki hafif ayırıcılar |
| `--border-focus` | `#1264A3` | Odak halkası rengi |

---

## 3. Tipografi Kuralları

### Yazı Tipleri
| Rol | Resmi | Web Yedeği |
|---|---|---|
| Görüntü / Pazarlama Başlıkları | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Kullanıcı Arayüzü / Gövde / Chrome | Slack Lato (özel) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Kod / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack, pazarlama başlıkları için **Larsseit** ve ürün içi kullanıcı arayüzü için özel bir Lato varyantı kullanır. Web kullanımı için `system-ui` en güvenli yedeğidir.

### Tipografi Ölçeği

| Düzey | Boyut | Kalınlık | Satır Yüksekliği | Harf Aralığı | Kullanım |
|---|---|---|---|---|---|
| Görüntü XL | 48px | 800 | 1.1 | -1px | Pazarlama hero başlıkları |
| Görüntü L | 36px | 700 | 1.15 | -0.5px | Bölüm hero'ları |
| Başlık 1 | 28px | 700 | 1.25 | normal | Modal başlıkları, sayfa üstbilgileri |
| Başlık 2 | 22px | 700 | 1.3 | normal | Kart başlıkları, ayarlar bölümleri |
| Başlık 3 | 18px | 700 | 1.35 | normal | Alt bölüm üstbilgileri |
| Gövde L | 16px | 400 | 1.5 | normal | Mesaj metni, açıklamalar |
| Gövde | 15px | 400 | 1.46667 | normal | Varsayılan kullanıcı arayüzü metni (Slack'in temel boyutu) |
| Gövde SM | 13px | 400 | 1.38462 | normal | İkincil meta veri |
| Altyazı | 12px | 400 | 1.33 | normal | Zaman damgaları, ipuçları |
| Kod | 12px | 400 | 1.5 | normal | Satır içi kod, kod blokları |

### Tipografi Kuralları
- Slack'in temel gövde boyutu **15px'dir** — yoğunluk için 16px'den biraz daha küçük
- Okunmamış kanallar: kalınlık 700 — kalın, birincil okunmamış göstergesidir
- Zaman damgaları: 12px `--text-secondary`, yalnızca hover durumunda göster
- Kod blokları: arka plan `#F8F8F8`, kenarlık `1px solid #DDDDDD`, border-radius 4px
- 12px'in altında yazı tipi boyutu kullanmayın
- Pazarlama başlıkları: büyük görüntü boyutları için letter-spacing `-1px`

---

## 4. Bileşen Stilleri

### Düğmeler

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Giriş Alanları
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Kenar Çubuğu Kanal Öğesi
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Okunmamış Rozeti
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Mesaj Ekleri / Kartlar
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Tepkiler
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Düzen İlkeleri

### Üç Sütunlu Düzen
```
┌──────────────┬──────────────────────────────┬─────────────┐
│ Kenar Çubuğu │        Mesaj Alanı           │   Konu      │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  isteğe bağlı│
└──────────────┴──────────────────────────────┴─────────────┘
```

### Boşluk Sistemi (4px taban)
| Token | Değer | Kullanım |
|---|---|---|
| `--space-1` | 4px | Dar boşluklar |
| `--space-2` | 8px | Bileşen dolgusu |
| `--space-3` | 12px | Giriş dolgusu |
| `--space-4` | 16px | Standart dolgu |
| `--space-6` | 24px | Kart dolgusu |
| `--space-8` | 32px | Bölüm boşlukları |

### Kenar Çubuğu Yapısı
```
[Çalışma Alanı Adı ▼]
────────────────────
Konular
Tüm DM'ler
Taslaklar & Gönderilenler
────────────────────
▼ Kanallar
  # general
  # random
  # design  ● (okunmamış)
────────────────────
▼ Doğrudan Mesajlar
  John Doe
  Jane Smith
```

### Mesaj Oluşturucu
- Mesaj alanının altına sabitlenmiş
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Araç çubuğu: emoji, ekle, biçimlendir, gönder düğmesi

---

## 6. Derinlik & Yükseklik

Slack, açık yüzeyde hafif gölgeler kullanır:

| Düzey | Kullanım | Gölge |
|---|---|---|
| Düz | Mesaj satırları, kenar çubuğu öğeleri | none |
| Düşük | Kartlar, giriş alanları | `0 1px 3px rgba(0,0,0,0.08)` |
| Orta | Açılır menüler, popover'lar | `0 4px 12px rgba(0,0,0,0.12)` |
| Yüksek | Modallar, iletişim kutuları | `0 8px 24px rgba(0,0,0,0.15)` |
| Katman | Modal arka planları | `rgba(0,0,0,0.5)` |

---

## 7. Yapılacaklar ve Yapılmayacaklar

### ✅ Yapın
- Kenar çubuğu için aubergine `#4A154B` kullanın — Slack'in en ikonik kullanıcı arayüzü öğesidir
- Ana içerik alanını beyaz ve açık tutun
- Tüm gövde metni için saf siyah değil `#1D1C1D` (siyaha yakın) kullanın
- Okunmamış durumu göstermek için kanal adlarını kalın yapın — kalınlık göstergedir
- Dört vurgu rengini yalnızca semantik roller için kullanın (başarı, uyarı, tehlike, bilgi)
- Mesaj eklerine ve gömülü öğelere `border-left: 4px` uygulayın
- Zaman damgalarını yalnızca hover durumunda gösterin
- Bağlantılar ve odak durumları için `#1264A3` kullanın
- Kenar çubuğu öğelerini kompakt tutun: 28px yükseklik, 6px border-radius

### ❌ Yapmayın
- Koyu bir ana içerik alanı kullanmayın — Slack açık önceliklidir
- Mavi/yeşil/sarı/kırmızıyı dekoratif vurgular olarak yaymayın
- Metin için saf siyah `#000000` kullanmayın
- Konuşma balonları kullanmayın — mesajlar düz satırlardır
- Düğmeleri büyük yarıçaplı yapmayın — 4px standarttır
- Zaman damgalarını kalıcı olarak göstermeyin
- Kanal adları için BÜYÜK HARF kullanmayın
- 12px altında yazı tipi boyutu kullanmayın

---

## 8. Duyarlı Davranış

### Kırılma Noktaları
| Kırılma Noktası | Genişlik | Düzen |
|---|---|---|
| Mobil | < 768px | Tek panel, kenar çubuğu sol çekmece olarak |
| Tablet | 768–1024px | Yalnızca kenar çubuğu + mesaj alanı |
| Masaüstü | > 1024px | Tam üç sütunlu düzen |

### Mobil Uyarlamalar
- Kenar çubuğu: sol çekmece, açmak için sağa kaydır
- Alt sekme çubuğu: Ana Sayfa, DM'ler, Etkinlik, Sen
- Konu paneli: tam ekran katman
- Oluşturucu: klavyenin üzerine sabitlenmiş
- Kanal listesi öğeleri: 44px dokunma hedefi yüksekliği
- Mobilde aubergine üst başlık çubuğu korunur

---

## 9. Ajan İstemi Kılavuzu

Slack tarzı tasarımlar oluştururken bu yaklaşımı izleyin:

**Renk uygulaması:**
> `background: #FFFFFF`'i ana tuval olarak ayarlayın. Kenar çubuğu için `#4A154B` (aubergine) kullanın. Tüm birincil metin `#1D1C1D`'dir. Bağlantılar ve odak halkaları `#1264A3` kullanır. Dört logo rengi — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — yalnızca semantiktir: bilgi, başarı, uyarı, tehlike.

**Tipografi:**
> Tüm kullanıcı arayüzü için `system-ui, -apple-system, sans-serif` kullanın. Temel boyut 15px'dir. Okunmamış kanallar: kalınlık 700. Gövde metni: kalınlık 400. Zaman damgaları: 12px `#616061`, yalnızca hover'da. Kod: `Monaco, Menlo, monospace`, 12px, arka plan `#F8F8F8`.

**Düzen:**
> Üç sütun: 240px aubergine kenar çubuğu + esnek beyaz mesaj alanı + isteğe bağlı 400px konu paneli. Kenar çubuğu öğeleri: 28px yükseklik, 6px yarıçap, okunmamışken kalın. Oluşturucu: alta sabitlenmiş, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Bileşenler:**
> Düğmeler: 4px yarıçap, 36px yükseklik, aubergine birincil. Giriş alanları: `1px solid #DDDDDD` kenarlık, `#1264A3` odak halkası. Mesaj satırları: düz, balon yok, 36px daire avatar. Tepkiler: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Ton:**
> Slack sıcak, profesyonel ve insancıldır. Boş durumlar dostane çizimler kullanır. Eylem çağrıları doğrudandır: "Mesaj gönder", "Başla". Hata mesajları açık ve yardımcıdır. Hiçbir zaman endişe verici değildir.

**Kaçınılması gereken anti-desenler:**
> Koyu içerik alanı yok. Konuşma balonu yok. Saf siyah metin yok. Dağınık çok renkli vurgular yok. Kanal adlarında BÜYÜK HARF yok. 12px altında yazı tipi yok. Büyük düğme yarıçapı yok.
