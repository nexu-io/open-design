# Ontwerpsysteem geïnspireerd door Airtable

> Category: Design & Creatief
> Hybride van spreadsheet en database. Kleurrijke, vriendelijke, gestructureerde data-esthetiek.

## 1. Visueel thema & Sfeer

De website van Airtable is een strak, bedrijfsvriendelijk platform dat "verfijnde eenvoud" uitstraalt via een wit canvas met diepdonkerblauwe tekst (`#181d26`) en Airtable Blue (`#1b61c9`) als primair interactief accent. De Haas-lettertypefamilie (display + text-varianten) creëert een typografisch systeem van Zwitserse precisie met positieve letterafstand door de hele website.

**Kernkenmerken:**
- Wit canvas met diepdonkerblauwe tekst (`#181d26`)
- Airtable Blue (`#1b61c9`) als primaire CTA- en linkkleur
- Duaal lettertypesysteem Haas + Haas Groot Disp
- Positieve letterafstand in bodytekst (0.08px–0.28px)
- Knoppen met radius 12px, kaarten 16px–32px
- Meerlaagse schaduw met blauwe tint: `rgba(45,127,249,0.28) 0px 1px 3px`
- Semantische thema-tokens: CSS-variabelennaamgeving `--theme_*`

## 2. Kleurenpalet & Rollen

### Primair
- **Diep donkerblauw** (`#181d26`): Primaire tekst
- **Airtable Blue** (`#1b61c9`): CTA-knoppen, links
- **Wit** (`#ffffff`): Primaire oppervlakte
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semantisch
- **Succesgroen** (`#006400`): `--theme_success-text`
- **Zwakke tekst** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Secundair actief** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutraal
- **Donkergrijs** (`#333333`): Secundaire tekst
- **Middenblauw** (`#254fad`): Blauwvariant voor links/accent
- **Rand** (`#e0e2e6`): Kaartranden
- **Lichte oppervlakte** (`#f8fafc`): Subtiele oppervlakte

### Schaduwen
- **Blauwe tint** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Zacht** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Typografieregels

### Lettertypefamilies
- **Primair**: `Haas`, fallbacks: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, fallback: `Haas`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Vet | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Sectiekopregel | Haas | 40px | 400 | 1.25 | normal |
| Subkop | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Kaarttitel | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Functie | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Bodytekst | Haas | 18px | 400 | 1.35 | 0.18px |
| Bodytekst Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Knop | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Bijschrift | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Componentstijlen

### Knoppen
- **Primair blauw**: `#1b61c9`, witte tekst, padding 16px 24px, radius 12px
- **Wit**: witte achtergrond, tekst `#181d26`, radius 12px, witte rand 1px
- **Cookie-toestemming**: achtergrond `#1b61c9`, radius 2px (scherp)

### Kaarten: `1px solid #e0e2e6`, radius 16px–24px
### Invoervelden: Standaard Haas-stijl

## 5. Indeling
- Afstanden: 1–48px (basis 8px)
- Radius: 2px (klein), 12px (knoppen), 16px (kaarten), 24px (secties), 32px (groot), 50% (cirkels)

## 6. Diepte
- Meerlaags schaduwsysteem met blauwe tint
- Zachte omgevingsschaduw: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Wat wel en niet te doen
### Wel: Airtable Blue gebruiken voor CTA's, Haas met positieve tracking, knoppen met radius 12px
### Niet: Positieve letterafstand weglaten, zware schaduwen gebruiken

## 8. Responsief gedrag
Breekpunten: 425–1664px (23 breekpunten)

## 9. Agent-promptgids
- Tekst: Diep donkerblauw (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Achtergrond: Wit (`#ffffff`)
- Rand: `#e0e2e6`
