# Airtable'dan İlham Alan Tasarım Sistemi

> Category: Tasarım ve Yaratıcılık
> Elektronik tablo-veritabanı hibridi. Renkli, dostane, yapılandırılmış veri estetiği.

## 1. Görsel Tema ve Atmosfer

Airtable'ın web sitesi, beyaz bir tuval üzerinde derin lacivert metin (`#181d26`) ve birincil etkileşimli vurgu rengi olarak Airtable Blue (`#1b61c9`) ile "sofistike sadelik" ileten, temiz ve kurumsal dostu bir platformdur. Haas yazı tipi ailesi (display + text varyantları), site genelinde pozitif harf aralığıyla İsviçre hassasiyetinde bir tipografi sistemi oluşturur.

**Temel Özellikler:**
- Derin lacivert metinli (`#181d26`) beyaz tuval
- Birincil CTA ve bağlantı rengi olarak Airtable Blue (`#1b61c9`)
- Haas + Haas Groot Disp çift yazı tipi sistemi
- Gövde metninde pozitif harf aralığı (0.08px–0.28px)
- 12px yarıçaplı düğmeler, kartlar için 16px–32px
- Mavi tonlu çok katmanlı gölge: `rgba(45,127,249,0.28) 0px 1px 3px`
- Anlamsal tema token'ları: `--theme_*` CSS değişken adlandırması

## 2. Renk Paleti ve Roller

### Birincil
- **Derin Lacivert** (`#181d26`): Birincil metin
- **Airtable Blue** (`#1b61c9`): CTA düğmeleri, bağlantılar
- **Beyaz** (`#ffffff`): Birincil yüzey
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Anlamsal
- **Başarı Yeşili** (`#006400`): `--theme_success-text`
- **Zayıf Metin** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **İkincil Aktif** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Nötr
- **Koyu Gri** (`#333333`): İkincil metin
- **Orta Mavi** (`#254fad`): Bağlantı/vurgu mavisi varyantı
- **Kenarlık** (`#e0e2e6`): Kart kenarlıkları
- **Açık Yüzey** (`#f8fafc`): İnce yüzey

### Gölgeler
- **Mavi Tonlu** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Yumuşak** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Tipografi Kuralları

### Yazı Tipi Aileleri
- **Birincil**: `Haas`, yedekler: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, yedek: `Haas`

### Hiyerarşi

| Rol | Yazı Tipi | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Kalın | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Bölüm Başlığı | Haas | 40px | 400 | 1.25 | normal |
| Alt Başlık | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Kart Başlığı | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Özellik | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Gövde | Haas | 18px | 400 | 1.35 | 0.18px |
| Gövde Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Düğme | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Alt Yazı | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Bileşen Stilleri

### Düğmeler
- **Birincil Mavi**: `#1b61c9`, beyaz metin, 16px 24px dolgu, 12px yarıçap
- **Beyaz**: beyaz arka plan, `#181d26` metin, 12px yarıçap, 1px beyaz kenarlık
- **Çerez Onayı**: `#1b61c9` arka plan, 2px yarıçap (keskin)

### Kartlar: `1px solid #e0e2e6`, 16px–24px yarıçap
### Giriş Alanları: Standart Haas stili

## 5. Düzen
- Boşluk: 1–48px (8px temel)
- Yarıçap: 2px (küçük), 12px (düğmeler), 16px (kartlar), 24px (bölümler), 32px (büyük), 50% (daireler)

## 6. Derinlik
- Mavi tonlu çok katmanlı gölge sistemi
- Yumuşak ortam ışığı: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Yapılacaklar ve Yapılmayacaklar
### Yap: CTA'lar için Airtable Blue kullan, pozitif izleme ile Haas kullan, 12px yarıçaplı düğmeler
### Yapma: Pozitif harf aralığını atla, ağır gölgeler kullan

## 8. Duyarlı Davranış
Kırılma noktaları: 425–1664px (23 kırılma noktası)

## 9. Agent Prompt Kılavuzu
- Metin: Derin Lacivert (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Arka Plan: Beyaz (`#ffffff`)
- Kenarlık: `#e0e2e6`
