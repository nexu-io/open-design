# Webflow'dan İlham Alan Tasarım Sistemi

> Category: Tasarım ve Yaratıcılık
> Görsel web oluşturucu. Mavi aksentli, cilalı pazarlama sitesi estetiği.

## 1. Görsel Tema ve Atmosfer

Webflow'un web sitesi, temiz beyaz yüzeyler, imza rengi olan Webflow Mavisi（`#146ef5`）ve zengin ikincil renk paleti（mor, pembe, yeşil, turuncu, sarı, kırmızı）aracılığıyla "kodsuz tasarım" anlayışını aktaran, görsel açıdan zengin ve araç odaklı bir platformdur. Özel WF Visual Sans Variable yazı tipi, görsel başlıklar için 600 ve metin için 500 ağırlığıyla kendinden emin ve hassas bir tipografi sistemi oluşturur.

**Temel Özellikler：**
- Neredeyse siyah（`#080808`）metin ile beyaz tuval
- Webflow Mavisi（`#146ef5`）birincil marka ve etkileşim rengi olarak
- WF Visual Sans Variable — 500–600 ağırlık aralığında özel değişken yazı tipi
- Zengin ikincil palet：mor `#7a3dff`, pembe `#ed52cb`, yeşil `#00d722`, turuncu `#ff6b00`, sarı `#ffae13`, kırmızı `#ee1d36`
- Tutucu 4px–8px kenarlık yarıçapı — keskin, yuvarlak değil
- Çok katmanlı gölge yığınları（5 katmanlı basamaklı gölgeler）
- Büyük harf etiketler：10px–15px, ağırlık 500–600, geniş harf aralığı（0,6px–1,5px）
- Düğmelerde translate(6px) hover animasyonu

## 2. Renk Paleti ve Rolleri

### Birincil
- **Neredeyse Siyah**（`#080808`）：Birincil metin
- **Webflow Mavisi**（`#146ef5`）：`--_color---primary--webflow-blue`, birincil CTA ve bağlantılar
- **Mavi 400**（`#3b89ff`）：`--_color---primary--blue-400`, daha açık etkileşimli mavi
- **Mavi 300**（`#006acc`）：`--_color---blue-300`, daha koyu mavi varyantı
- **Düğme Hover Mavisi**（`#0055d4`）：`--mkto-embed-color-button-hover`

### İkincil Aksentler
- **Mor**（`#7a3dff`）：`--_color---secondary--purple`
- **Pembe**（`#ed52cb`）：`--_color---secondary--pink`
- **Yeşil**（`#00d722`）：`--_color---secondary--green`
- **Turuncu**（`#ff6b00`）：`--_color---secondary--orange`
- **Sarı**（`#ffae13`）：`--_color---secondary--yellow`
- **Kırmızı**（`#ee1d36`）：`--_color---secondary--red`

### Nötr
- **Gri 800**（`#222222`）：Koyu ikincil metin
- **Gri 700**（`#363636`）：Orta metin
- **Gri 300**（`#ababab`）：Soluk metin, yer tutucu
- **Orta Gri**（`#5a5a5a`）：Bağlantı metni
- **Kenarlık Grisi**（`#d8d8d8`）：Kenarlıklar, bölücüler
- **Kenarlık Hover**（`#898989`）：Hover kenarlığı

### Gölgeler
- **5 Katmanlı Basamak**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Tipografi Kuralları

### Yazı tipi：`WF Visual Sans Variable`, yedek：`Arial`

| Rol | Boyut | Ağırlık | Satır Yüksekliği | Harf Aralığı | Notlar |
|------|------|--------|-------------|----------------|-------|
| Display Hero | 80px | 600 | 1,04 | -0,8px | |
| Bölüm Başlığı | 56px | 600 | 1,04 | normal | |
| Alt Başlık | 32px | 500 | 1,30 | normal | |
| Özellik Başlığı | 24px | 500–600 | 1,30 | normal | |
| Gövde | 20px | 400–500 | 1,40–1,50 | normal | |
| Standart Gövde | 16px | 400–500 | 1,60 | -0,16px | |
| Düğme | 16px | 500 | 1,60 | -0,16px | |
| Büyük Harf Etiketi | 15px | 500 | 1,30 | 1,5px | uppercase |
| Açıklama | 14px | 400–500 | 1,40–1,60 | normal | |
| Rozet Büyük Harf | 12,8px | 550 | 1,20 | normal | uppercase |
| Mikro Büyük Harf | 10px | 500–600 | 1,30 | 1px | uppercase |
| Kod：Inconsolata（eşlik eden monospace yazı tipi）

## 4. Bileşen Stilleri

### Düğmeler
- Şeffaf：metin `#080808`, hover'da translate(6px)
- Beyaz daire：yarıçap %50, beyaz arka plan
- Mavi rozet：`#146ef5` arka plan, 4px yarıçap, ağırlık 550

### Kartlar：`1px solid #d8d8d8`, 4px–8px yarıçap
### Rozetler：%10 opaklıkta mavi tonlu arka plan, 4px yarıçap

## 5. Düzen
- Aralık：kesirli ölçek（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Yarıçap：2px, 4px, 8px, %50 — tutucu, keskin
- Kırılma noktaları：479px, 768px, 992px

## 6. Derinlik：5 Katmanlı Basamaklı Gölge Sistemi

## 7. Yapılması ve Yapılmaması Gerekenler
- Yapın：WF Visual Sans Variable'ı ağırlık 500–600 ile kullanın. CTA'lar için Mavi（`#146ef5`）kullanın. 4px yarıçap. Hover'da translate(6px).
- Yapmayın：İşlevsel öğeleri 8px'in üzerinde yuvarlayın. Birincil CTA'larda ikincil renkleri kullanmayın.

## 8. Duyarlı：479px, 768px, 992px

## 9. Agent Prompt Kılavuzu
- Metin：Neredeyse Siyah（`#080808`）
- CTA：Webflow Mavisi（`#146ef5`）
- Arka plan：Beyaz（`#ffffff`）
- Kenarlık：`#d8d8d8`
- İkincil：Mor `#7a3dff`, Pembe `#ed52cb`, Yeşil `#00d722`
