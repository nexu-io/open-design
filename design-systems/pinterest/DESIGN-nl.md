# Ontwerpsysteem Geïnspireerd door Pinterest

> Category: Media & Consumer
> Visuele ontdekking. Rood accent, masonry-raster, afbeelding staat centraal.

## 1. Visueel Thema & Sfeer

De website van Pinterest is een warm, inspirerend canvas dat visuele ontdekking behandelt als een lifestylemagazine. Het ontwerp werkt op een zachte, licht warme witte achtergrond met Pinterest Red (`#e60023`) als het enige, gedurfde merkaccent. In tegenstelling tot de koele blauwtinten van de meeste techplatforms heeft de neutrale schaal van Pinterest een duidelijk warme ondertoon — grijstinten neigen naar olijf/zand (`#91918c`, `#62625b`, `#e5e5e0`) in plaats van koel staal, wat een gezellige, ambachtelijke sfeer creëert die uitnodigt tot browsen.

De typografie maakt gebruik van Pin Sans — een aangepast propriëtair lettertype met een brede fallback-stack inclusief Japanse lettertypen, wat de wereldwijde reikwijdte van Pinterest weerspiegelt. Op displayschaal (70px, gewicht 600) creëert Pin Sans grote, uitnodigende koppen. Op kleinere formaten is het systeem compact: knoppen op 12px, onderschriften op 12–14px. Het CSS-variabelennaamgevingssysteem (`--comp-*`, `--sema-*`, `--base-*`) onthult een verfijnde drielaagse ontwerptokenarchitectuur: tokens op component-, semantisch en basisniveau.

Wat Pinterest onderscheidt, is zijn genereuze border-radius-systeem (12px–40px, plus 50% voor cirkels) en warm getinte knopachtergronden. De secundaire knop (`#e5e5e0`) heeft een duidelijk warme, zandachtige toon in plaats van koud grijs. De primaire rode knop gebruikt een radius van 16px — afgerond maar niet pilvormig. Gecombineerd met warme badge-achtergronden (`hsla(60,20%,98%,.5)` — een subtiele geel-warme waas) en door fotografie gedomineerde layouts, resulteert dit in een ontwerp dat handgemaakt en persoonlijk aanvoelt, niet zakelijk en steriel.

**Kernkenmerken:**
- Warm wit canvas met olijf/zandkleurige neutrale tinten — gezellig, niet klinisch
- Pinterest Red (`#e60023`) als enig gedurfd accent — nooit subtiel, altijd zelfverzekerd
- Aangepast lettertype Pin Sans met wereldwijde fallback-stack (inclusief CJK)
- Drielaagse tokenarchitectuur: `--comp-*` / `--sema-*` / `--base-*`
- Warme secundaire oppervlakken: zandgrijs (`#e5e5e0`), warme badge (`hsla(60,20%,98%,.5)`)
- Genereuze border-radius: 16px standaard, tot 40px voor grote containers
- Fotografie-eerste inhoud — pins/afbeeldingen zijn het primaire visuele element
- Donker bijna-paars tekst (`#211922`) — warm, met een vleugje pruim

## 2. Kleurenpalet & Rollen

### Primair Merk
- **Pinterest Red** (`#e60023`): Primaire CTA, merkaccent — gedurfd, zelfverzekerd rood
- **Green 700** (`#103c25`): `--base-color-green-700`, succes-/natuuraccent
- **Green 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, ingedrukt groen

### Tekst
- **Pruimzwart** (`#211922`): Primaire tekst — warme bijna-zwart met pruimondertoon
- **Zwart** (`#000000`): Secundaire tekst, knoptekst
- **Olijfgrijs** (`#62625b`): Secundaire beschrijvingen, gedempte tekst
- **Warm Zilver** (`#91918c`): `--comp-button-color-text-transparent-disabled`, uitgeschakelde tekst, invoergransen
- **Wit** (`#ffffff`): Tekst op donkere/gekleurde oppervlakken

### Interactief
- **Focusblauw** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, focusringen
- **Prestatiepaars** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, prestatiefuncties
- **Aanbevelingspaars** (`#7e238b`): `--sema-color-hover-text-recommendation`, AI-aanbeveling
- **Linkblauw** (`#2b48d4`): Linktekstkleur
- **Facebookblauw** (`#0866ff`): `--facebook-background-color`, sociale login
- **Ingedrukt Blauw** (`#617bff`): `--base-color-pressed-blue-200`, ingedrukte toestand

### Oppervlak & Rand
- **Zandgrijs** (`#e5e5e0`): Achtergrond secundaire knop — warm, ambachtelijk
- **Warm Licht** (`#e0e0d9`): Achtergronden cirkelvormige knoppen, badges
- **Warme Waas** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, subtiele warme badge-achtergrond
- **Mist** (`#f6f6f3`): Licht oppervlak (bij 50% dekking)
- **Uitgeschakelde Rand** (`#c8c8c1`): `--sema-color-border-disabled`, uitgeschakelde randen
- **Hovergrijs** (`#bcbcb3`): `--base-color-hover-grayscale-150`, hoverrand
- **Donker Oppervlak** (`#33332e`): Achtergronden donkere secties

### Semantisch
- **Foutrood** (`#9e0a0a`): Foutstatus voor selectievakjes/formulieren

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `Pin Sans`, fallbacks: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Notities |
|-----|-----------|---------|---------|-------------|---------------|---------|
| Display Hero | Pin Sans | 70px (4.38rem) | 600 | normaal | normaal | Maximale impact |
| Sectiekop | Pin Sans | 28px (1.75rem) | 700 | normaal | -1.2px | Negatieve tracking |
| Hoofdtekst | Pin Sans | 16px (1.00rem) | 400 | 1.40 | normaal | Standaard lezen |
| Vet onderschrift | Pin Sans | 14px (0.88rem) | 700 | normaal | normaal | Sterke metadata |
| Onderschrift | Pin Sans | 12px (0.75rem) | 400–500 | 1.50 | normaal | Kleine tekst, tags |
| Knop | Pin Sans | 12px (0.75rem) | 400 | normaal | normaal | Knoplabels |

### Principes
- **Compacte typeschaal**: Het bereik is 12px–70px met een dramatische sprong — de meeste functionele tekst is 12–16px, waardoor een dichte, app-achtige informatiehiërarchie ontstaat.
- **Warme gewichtsverdeling**: 600–700 voor koppen, 400–500 voor hoofdtekst. Geen ultra-lichte gewichten — de typografie voelt altijd substantieel aan.
- **Negatieve tracking op koppen**: -1.2px op 28px-koppen creëert gezellige, intieme sectietitels.
- **Enkele lettertypefamilie**: Pin Sans verzorgt alles — geen secundair display- of monospace-lettertype gedetecteerd.

## 4. Componentstijlen

### Knoppen

**Primair Rood**
- Achtergrond: `#e60023` (Pinterest Red)
- Tekst: `#000000` (zwart — ongebruikelijke keuze voor contrast op rood)
- Opvulling: 6px 14px
- Radius: 16px (royaal afgerond, niet pilvormig)
- Rand: `2px solid rgba(255, 255, 255, 0)` (transparant)
- Focus: semantische rand + omtrek via CSS-variabelen

**Secundair Zand**
- Achtergrond: `#e5e5e0` (warm zandgrijs)
- Tekst: `#000000`
- Opvulling: 6px 14px
- Radius: 16px
- Focus: hetzelfde semantische randsysteem

**Cirkelvormige Actie**
- Achtergrond: `#e0e0d9` (warm licht)
- Tekst: `#211922` (pruimzwart)
- Radius: 50% (cirkel)
- Gebruik: Pinacties, navigatiecontroles

**Ghost / Transparant**
- Achtergrond: transparant
- Tekst: `#000000`
- Geen rand
- Gebruik: Tertiaire acties

### Kaarten & Containers
- Fotografie-eerste pinkaarten met royale radius (12px–20px)
- Geen traditionele box-shadow op de meeste kaarten
- Witte of warme mistige achtergronden
- Witte dikke rand van 8px op sommige afbeeldingscontainers

### Invoervelden
- E-mailinvoer: witte achtergrond, `1px solid #91918c` rand, radius 16px, opvulling 11px 15px
- Focus: semantisch rand- en omtreksysteem via CSS-variabelen

### Navigatie
- Schone koptekst op witte of warme achtergrond
- Pinterest-logo + zoekbalk gecentreerd
- Pin Sans 16px voor navigatielinks
- Pinterest Red-accenten voor actieve toestanden

### Beeldbehandeling
- Masonry-raster in pinstijl (kenmerkende Pinterest-layout)
- Afgeronde hoeken: 12px–20px op afbeeldingen
- Fotografie als primaire inhoud — elke pin is een afbeelding
- Dikke witte randen (8px) op uitgelichte afbeeldingscontainers

## 5. Layoutprincipes

### Spaatsysteem
- Basiseenheid: 8px
- Schaal: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Grote sprongen: 32px → 80px → 100px voor sectie-spatiëring

### Raster & Container
- Masonry-raster voor pin-inhoud (kenmerkende layout)
- Gecentreerde inhoudssecties met royale maximale breedte
- Donkere voettekst op volledige breedte
- Zoekbalk als primair navigatie-element

### Witruimtefilosofie
- **Inspiratiedichtheid**: Het masonry-raster pakt pins dicht op elkaar — de inhoudsdichtheid IS de waardepropositie. Witruimte bestaat tussen secties, niet binnen het raster.
- **Adem boven, dichtheid onder**: Hero-/functiesecties krijgen royale opvulling; het pinraster is compact en immersief.

### Border Radius-schaal
- Standaard (12px): Kleine kaarten, links
- Knop (16px): Knoppen, invoervelden, middelgrote kaarten
- Comfortabel (20px): Functiekaarten
- Groot (28px): Grote containers
- Sectie (32px): Tabelementen, grote panelen
- Hero (40px): Hero-containers, grote functieblokken
- Cirkel (50%): Actieknoppen, tabindicatoren

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|--------|-------------|---------|
| Vlak (Niveau 0) | Geen schaduw | Standaard — pins vertrouwen op inhoud, niet op schaduw |
| Subtiel (Niveau 1) | Minimale schaduw (van tokens) | Verhoogde overlays, dropdowns |
| Focus (Toegankelijkheid) | `--sema-color-border-focus-outer-default` ring | Focustoestanden |

**Schaduwfilosofie**: Pinterest gebruikt minimale schaduwen. Het masonry-raster vertrouwt op inhoud (fotografie) om visuele interesse te creëren in plaats van elevatie-effecten. Diepte komt van de warmte van oppervlakkleuren en de royale afronding van containers.

## 7. Do's en Don'ts

### Doen
- Gebruik warme neutralen (`#e5e5e0`, `#e0e0d9`, `#91918c`) — de warme olijf-/zandtoon is de identiteit
- Pas Pinterest Red (`#e60023`) alleen toe voor primaire CTA's — het is gedurfd en enkelvoudig
- Gebruik Pin Sans uitsluitend — één lettertype voor alles
- Pas royale border-radius toe: 16px voor knoppen/invoervelden, 20px+ voor kaarten
- Houd het masonry-raster dicht — inhoudsdichtheid is de waarde
- Gebruik warme badge-achtergronden (`hsla(60,20%,98%,.5)`) voor subtiele warme wazen
- Gebruik `#211922` (pruimzwart) voor primaire tekst — het is warmer dan puur zwart

### Niet Doen
- Gebruik geen koele grijze neutralen — altijd warm/olijfgetint
- Gebruik geen puur zwart (`#000000`) als primaire tekst — gebruik pruimzwart (`#211922`)
- Gebruik geen pilvormige knoppen — een radius van 16px is afgerond maar niet pilvormig
- Voeg geen zware schaduwen toe — Pinterest is plat by design, diepte komt van inhoud
- Gebruik geen kleine border-radius (<12px) op kaarten — de royale afronding is essentieel
- Introduceer geen extra merkkleuren — rood + warme neutralen is het complete palet
- Gebruik geen dunne lettergewichten — Pin Sans minimaal 400

## 8. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijke Wijzigingen |
|------|---------|------------------------|
| Mobiel | <576px | Enkele kolom, compact layout |
| Groot Mobiel | 576–768px | 2-koloms pinraster |
| Tablet | 768–890px | Uitgebreid raster |
| Klein Bureau | 890–1312px | Standaard masonry-raster |
| Bureau | 1312–1440px | Volledige layout |
| Groot Bureau | 1440–1680px | Uitgebreide rasterkolommen |
| Ultrabreed | >1680px | Maximale rasterdichtheid |

### Samenvouwstrategie
- Pinraster: 5+ kolommen → 3 → 2 → 1
- Navigatie: zoekbalk + pictogrammen → vereenvoudigde mobiele navigatie
- Functiesecties: naast elkaar → gestapeld
- Hero: 70px → schaalt proportioneel omlaag
- Voettekst: donkere meerdere kolommen → gestapeld

## 9. Agentpromptgids

### Snelle Kleurverwijzing
- Merk: Pinterest Red (`#e60023`)
- Achtergrond: Wit (`#ffffff`)
- Tekst: Pruimzwart (`#211922`)
- Secundaire tekst: Olijfgrijs (`#62625b`)
- Knopoppervlak: Zandgrijs (`#e5e5e0`)
- Rand: Warm Zilver (`#91918c`)
- Focus: Focusblauw (`#435ee5`)

### Voorbeeldcomponentprompts
- "Maak een hero: witte achtergrond. Kop van 70px Pin Sans gewicht 600, pruimzwart (#211922). Rode CTA-knop (#e60023, radius 16px, opvulling 6px 14px). Secundaire zandknop (#e5e5e0, radius 16px)."
- "Ontwerp een pinkaart: witte achtergrond, radius 16px, geen schaduw. Fotografie vult de bovenkant, beschrijving van 16px Pin Sans gewicht 400 eronder in #62625b."
- "Bouw een cirkelvormige actieknop: achtergrond #e0e0d9, radius 50%, pictogram #211922."
- "Maak een invoerveld: witte achtergrond, 1px solid #91918c, radius 16px, opvulling 11px 15px. Focus: blauwe omtrek via semantische tokens."
- "Ontwerp de donkere voettekst: achtergrond #33332e. Pinterest-scriptlogo in wit. Links van 12px Pin Sans in #91918c."

### Iteratiegids
1. Warme neutralen overal — olijf-/zandgrijzen, nooit koel staal
2. Pinterest Red alleen voor CTA's — gedurfd en enkelvoudig
3. Radius 16px op knoppen/invoervelden, 20px+ op kaarten — royaal maar niet pilvormig
4. Pin Sans is het enige lettertype — compact op 12px voor UI, 70px voor display
5. Fotografie draagt het ontwerp — de UI blijft warm en minimaal
6. Pruimzwart (#211922) voor tekst — warmer dan puur zwart
