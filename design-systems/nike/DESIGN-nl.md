# Design System Inspired by Nike

> Category: E-Commerce & Retail
> Sportretail. Monochrome UI, massieve hoofdlettertypografie, full-bleed fotografie.

## 1. Visueel Thema & Sfeer

Nike.com is een kinetische retailkathedraal — een site die de explosieve energie van sport omzet in een digitale winkelervaring. Het ontwerp stoelt op het principe van radicale eenvoud: alles terugbrengen tot zwart, wit en grijs, zodat atletische fotografie en productkleur ongehinderd de aandacht kunnen opeisen. Het resultaat voelt minder als een website en meer als een sportredactioneel opgemaakt met de precisie van een luxetijdschrift. Elke pixel wordt ofwel gebruikt om een product te verkopen, ofwel om naar een product toe te leiden.

Het "Podium CDS" (Nike's interne Core Design System) legt een agressief monochromatisch fundament. De UI verdwijnt in zwarte (`#111111`) tekst en witte vlakken, zodat herografieën — bezwetende atleten, schoenen in de lucht, stadiumenenergie — het emotionele gewicht dragen. Wanneer kleur wel in de UI verschijnt, is dat vrijwel uitsluitend functioneel: rood voor fouten, blauw voor links, groen voor succes. Het product zelf is het kleurverhaal. Deze terughoudendheid creëert een visuele paradox: de kleurrijkste pagina's op internet voelen het meest minimalistisch aan, omdat alle levendigheid uit de merchandise komt en niet uit de interface.

Het typografiesysteem vormt de andere helft van Nike's visuele identiteit. Massieve hoofdletter-koppen in Nike Futura ND — een op maat gecondenseerde Futura-variant met een onmogelijk strakke regelafstand (0.90) — doorborendeheldenafbeeldingen als een typografische schokgolf. Onder de koppen verzorgt de Helvetica Now-familie alles, van navigatie tot productomschrijvingen, met Zwitserse precisie en helderheid. Deze splitsing tussen expressieve displaytypografie en functionele bodytekst weerspiegelt Nike's merkdualiteit: inspiratie ontmoet uitvoering.

**Kernkenmerken:**
- Monochromatische UI (zwart/wit/grijs) waarbij productfotografie de enige kleurBron is
- Massieve uppercase display-typografie (96px, regelafstand 0.90) die heldenfoto's doorboort
- Full-bleed fotografie zonder border radius — beelden vullen elke beschikbare rand
- Pilvormige knoppen (30px radius) als primair interactief element
- 8px-rasterraamwerk met atletische discipline — elke maat snapped aan het systeem
- Categoriegedreven winkelarchitectuur met grote navigatieafbeeldingskaarten
- Schaduwvrij, randminimaal elevatiemodel — vlakdifferentiatie uitsluitend via grijstintverschuivingen

## 2. Kleurenpalet & Rollen

### Primair

- **Nike Black** (`#111111`): Het fundament — primaire tekst, knopackergronden, navigatietekst, hero-overlays. Bewust niet puur zwart (#000000), waardoor een fractie zachtere leeservaring ontstaat
- **Nike White** (`#FFFFFF`): Primair paginacanvas, knoptekst op donker, kaartoppervlakken, navigatiebalkrind

### Oppervlak & Achtergrond

- **Snow** (`#FAFAFA`): Lichtste oppervlak, bijna-wit subtiele differentiatie (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Secundaire achtergrond, zoekinvulveld, afbeeldingsplaatshouder, laadskeleton (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Hover-staatsachtergrond, uitgeschakeld knopvulling (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Primaire achtergrond op donkere/geïnverteerde secties (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Inverse primaire achtergrond, donkerste niet-zwarte oppervlak (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Hover-staat op donkere achtergronden (--podium-cds-color-grey-700)

### Neutrale Tinten & Tekst

- **Primary Text** (`#111111`): Hoofdlichaamstekst, koppen, navigatielinks (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Beschrijvende tekst, metadata, tijdstempels, prijslabels (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Inactieve elementen, niet-beschikbare opties (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Uitgeschakelde tekst op donkere achtergronden (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Standaard randkleur, overeenkomend met secundaire tekst
- **Border Secondary** (`#CACACB`): Subtiele randen, invoerranden, scheidingslijnen (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Inactieve randstaat
- **Border Active** (`#111111`): Actieve/gefocuste rand, overeenkomend met primaire tekst

### Semantisch & Accent

- **Nike Red** (`#D30005`): Kritieke fouten, uitverkoopbadges, urgente meldingen (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, iets lichter rood voor nadruk
- **Nike Orange Badge** (`#D33918`): Badgetekst, promotionele call-outs (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Expressief oranje accent (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Bevestiging, beschikbaarheid, positieve staten (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Succes op donkere achtergronden (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Tekstlinks, informatieve highlights (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Links op donkere achtergronden (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Waarschuwingsachtergronden, aandachtbanners (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Toetsenbordfocusindicatorring

### Uitgebreid Kleurenspectrum (Podium CDS)

Elke kleurgradiënt loopt van 50 tot 900 voor expressief gebruik in campagnes en productpagina's:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Gradiëntsysteem

Nike vermijdt UI-gradiënten. Wanneer gradiënten verschijnen, zijn ze fotografisch — toegepast op productheldenachtergronden (bijv. een rode schoen op een rood-naar-dieper-rood gradiënt). Het ontwerpsysteem zelf werkt uitsluitend met vlakke kleuren.

## 3. Typografieregels

### Lettertypefamilie

**Display:** Nike Futura ND (op maat gecondenseerde Futura-variant exclusief voor Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Uitsluitend gebruikt voor grote uppercase display-koppen
- Kenmerkend strakke regelafstand (0.90) en uppercase-transformatie

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Gebruikt voor sectiekoppen en producttitels van 24–32px

**Body Medium:** Helvetica Now Text Medium (gewicht 500)
- Fallbacks: Helvetica, Arial
- Gebruikt voor links, knoppen, bijschriften, benadrukte lichaamstekst

**Body:** Helvetica Now Text (gewicht 400)
- Fallbacks: Helvetica, Arial
- Gebruikt voor standaard lichaamstekst, omschrijvingen, metadata

**Arabic:** Neue Frutiger Arabic — locale-specifiek alternatief

### Hiërarchie

| Rol | Grootte | Gewicht | Regelafstand | Letterruimte | Notities |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, uppercase, heldenkoppen |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, sectietitels |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, subsecties |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, kaarttitels |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, productomschrijvingen |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, benadrukte tekst |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, navigatielinks |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, voettekst/hulplinks |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, CTA-tekst |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, secundaire knoppen |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, prijslabels |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, tijdstempels |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, juridische tekst |

### Principes

Nike's typografie is een studie in spanning. De displaylaag — Nike Futura ND op 96px met een verwoestende regelafstand van 0.90 — is ontworpen om aan te voelen als een stadionscoreboard: massief, gecondenseerd, uppercase, onmogelijk te negeren. Het transformeert koppen in strijdkreten. Onder de displaylaag biedt Helvetica Now een klinisch tegenwicht: Zwitserse precisie in leesbaarheid met een royale regelafstand van 1.75 voor comfortabel productbrowsen. Gewicht 500 (Medium) domineert de gehele lichaamstekst, waardoor Nike's proza een lichte assertiviteit krijgt zonder de zwaarheid van vet — elke zin leest als een zelfverzekerde aanbeveling, niet als een schreeuw.

## 4. Componentstijlen

### Knoppen

**Primair**
- Achtergrond: Nike Black (`#111111`)
- Tekst: Wit (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Rand: geen
- Border radius: volledig afgeronde pil (30px)
- Padding: ~12px 24px
- Hover: achtergrond verschuift naar Grey-500 (`#707072`), hover-tekstkleur
- Actief: scale(0) rimpeleffect met dekking 0.5
- Focus: 2px box-shadow ring in `rgba(39, 93, 197, 1)`
- Overgang: achtergrond 200ms ease

**Primair op Donker**
- Achtergrond: Wit (`#FFFFFF`)
- Tekst: Zwart (`#111111`)
- Hover: achtergrond verschuift naar Grey-300 (`#CACACB`)

**Secundair (Omlijnd)**
- Achtergrond: transparant
- Tekst: Nike Black (`#111111`)
- Rand: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: rand verdonkert naar `#707072`, achtergrond naar grey-200

**Uitgeschakeld**
- Achtergrond: Grey-200 (`#E5E5E5`)
- Tekst: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Pictogramknop**
- Achtergrond: Grey-100 (`#F5F5F5`)
- Vorm: 30px radius (of 50% voor cirkelvormig)
- Padding: 6px
- Hover: Grey-500 achtergrond

### Kaarten & Containers

- Achtergrond: Wit (`#FFFFFF`) — in de meeste gevallen geen zichtbare kaartrand
- Border radius: 0px voor productafbeeldingskaarten (rand-aan-rand beelden), 20px voor interactieve containers
- Schaduw: geen — Nike gebruikt absoluut geen kaartschaduwen
- Hover: geen lift-effect op productkaarten; onderstreping op tekstlinks binnen kaarten
- Productkaarten: afbeelding bovenaan (geen radius), tekstmetadata eronder met 12px tussenruimte
- Categoriekaarten: full-bleed fotografie met tekstoverlay op donkere gradiënt
- Overgang: dekking 200ms ease voor beeldwisseling bij hover

### Invoervelden & Formulieren

- Achtergrond: Grey-100 (`#F5F5F5`)
- Rand: 1px solid `#CACACB` indien zichtbaar, of randloos bij zoeken
- Border radius: 24px (zoekinvoervelden), 8px (formulierinvoervelden)
- Lettertype: Helvetica Now Text, 16px
- Focus: rand verschuift naar `#111111` (border-active), 2px focusring in `rgba(39, 93, 197, 1)`
- Fout: rand `#D30005` (kritiek)
- Plaatshouder: Grey-500 (`#707072`)
- Overgang: border-color 200ms ease

### Navigatie

- Achtergrond: Wit (`#FFFFFF`), sticky
- Hoogte: ~60px desktop
- Links: Nike Swoosh-logo (24x24px SVG)
- Midden: Categorielinks (Nieuw & Uitgelicht, Heren, Dames, Kinderen, Sale) in 16px/500 Helvetica Now Text Medium
- Rechts: Zoeken (24px radius invoerveld), Favorieten, Winkelwagenpictogrammen
- Hover: tekstkleur verschuift naar Grey-500 (`#707072`)
- Mobiel: hamburgermenu, volledig scherm overlay
- Bovenbanner: promotionele berichtenbalk met donkere achtergrond (#111111) en witte tekst

### Beeldbehandeling

- Heldenfoto's: full-bleed, geen border radius, rand-aan-rand
- Productraster: vierkant (1:1) of 4:3 beeldverhouding, geen border radius
- Categoriekaarten: 16:9 of 4:3, full-bleed met tekstoverlay
- Afbeeldingsplaatshouder: Grey-100 (`#F5F5F5`) effen achtergrond
- Lazy loading: native loading="lazy", skeleton gebruikt #F5F5F5 achtergrond
- Product hover: secundaire beeldwisseling (voor- → zijaanzicht)

### Promotiebanners

- Volledige breedte donkere (`#111111`) achtergrond met witte tekst
- Strakke padding (8-12px verticaal)
- Gecentreerde tekst, 12px/500 Helvetica Now Text Medium
- Gebruikt voor verzendpromoties, ledenvoordelen, uitverkoopmededelingen

## 5. Layoutprincipes

### Ruimtesysteem

Basiseenheid: 4px (primair raster is veelvouden van 8px)

| Token | Waarde | Gebruik |
|-------|-------|-----|
| space-1 | 4px | Strakke pictogramtussenruimten, inline-afstand |
| space-2 | 8px | Basiseenheid, knooppictogramtussenruimten |
| space-3 | 12px | Interne kaartpadding, strakke marges |
| space-4 | 16px | Standaard padding, navigatieafstand |
| space-5 | 20px | Productkaartafstanden |
| space-6 | 24px | Interne sectiepadding, rasterafstanden |
| space-7 | 32px | Sectie-onderbrekingen |
| space-8 | 48px | Grote sectiepadding |
| space-9 | 64px | Heldenectiepadding |
| space-10 | 80px | Grote sectieafstand |

### Raster & Container

- Maximale containerbreedte: 1920px
- Standaard inhoudsbreedte: ~1440px met horizontale padding
- Productraster: 3 kolommen op desktop, 2 kolommen op tablet, 1 kolom op mobiel
- Categorieraster: 3 kolommen met full-bleed afbeeldingen
- Rasterafstand: 4-12px tussen productkaarten (bewust strak)
- Horizontale padding: 48px desktop, 24px tablet, 16px mobiel

### Witruimtefilosofie

Nike's witruimtestrategie is bewust agressief — niet op de ruimhartige, luchtige manier van een modebrand, maar op een gecomprimeerde, hoogdichte manier die elke pixel vult met ofwel inhoud ofwel bewuste leegte. Productrasters gebruiken minimale tussenruimten (4-12px) om een gevoel van overvloed en keuze te creëren. Sectieonderbrekingen zijn royaal (48-80px) om winkelcontexten van elkaar te scheiden. Het totaaleffect is een winkel die vol product aanvoelt terwijl hij toch navigeerbaar blijft — als een goed georganiseerde atletische superstore.

### Border Radius-schaal

| Waarde | Context |
|-------|---------|
| 0px | Productafbeeldingen, herof fotografie (scherpe randen) |
| 8px | Formulierinvoervelden (niet-zoeken) |
| 18px | Kleine interactieve elementen |
| 20px | Containers, kaarten met UI-inhoud |
| 24px | Zoekinvoervelden, middelgrote pillen |
| 30px | Knoppen, tags, filters (volledige pil) |
| 50% | Cirkelvormige pictogramknoppen, avatarplaatshouders |

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Vlak | Geen schaduw, geen rand | Standaardstaat voor alles |
| Scheidingslijn | `0px -1px 0px 0px #E5E5E5 inset` | Subtiele inset-lijn tussen secties |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Toetsenbordfocusring |
| Overlay | Donkere schermlaag over fotografie | Leesbaarheid van tekst op afbeelding |

Nike's elevatiefilosofie is radicaal vlak. Er zijn geen kaartschaduwen, geen hover-lifts, geen zwevende elementen. Diepte wordt uitsluitend gecommuniceerd via kleur — donkere secties wijken terug, lichte secties komen naar voren, grijsverschuivingen geven staatswijzigingen aan. Deze vlakheid versterkt de atletische, no-nonsense merkpersoonlijkheid: geen visuele franjes, alleen directe communicatie. De enige "schaduw" in het gehele systeem is een 1px inset-scheidingslijn en de voor toegankelijkheid vereiste focusring.

### Decoratieve Diepte

- **Herof otografie-overlays**: Donkere gradiëntlagen over full-bleed fotografie voor tekstleesbaarheid
- **Productachtergrondgradiënten**: Gekleurde achtergronden achter heldenproductfoto's (bijv. rode schoen op rode gradiënt)
- **Bannerstroken**: Effen donkere (#111111) promotiestroken bovenaan de pagina

## 7. Doe's en Don'ts

### Doe

- Gebruik Nike Black (#111111) voor alle primaire tekst — nooit puur #000000
- Houd knoppen pilvormig (30px radius) en beperk ze tot primaire/secundaire varianten
- Gebruik full-bleed, rand-aan-rand fotografie voor heldenecties — geen border radius op afbeeldingen
- Laat productfotografie alle kleurlevendigheid leveren; houd de UI monochromatisch
- Gebruik uppercase Nike Futura ND UITSLUITEND voor display-koppen (96px+)
- Handhaaf strakke productrasterafstanden (4-12px) voor een dichte, overvloedige uitstraling
- Gebruik Grey-100 (#F5F5F5) voor alle invoer- en plaatshouderachtergronden
- Reserveer kleur uitsluitend voor semantische betekenis (rood=fout, groen=succes, blauw=link)
- Gebruik gewicht 500 (Medium) voor alle interactieve tekstelementen

### Doe Niet

- Voeg geen schaduwen toe aan kaarten — Nike's elevatiemodel is volledig vlak
- Gebruik geen border radius op productafbeeldingen — alleen UI-elementen krijgen afgeronde hoeken
- Introduceer geen merkkleuren buiten de grijsschaal voor UI-elementen
- Gebruik Nike Futura ND niet kleiner dan 24px — het is uitsluitend een displaylettertype
- Voeg geen hover lift-effecten toe — Nike-kaarten animeren niet bij hover
- Gebruik geen normaal gewicht (400) voor knoppen of links — gebruik altijd 500
- Plaats geen gekleurde achtergronden achter UI-elementen — kleur is gereserveerd voor productcontexten
- Gebruik niet meer dan twee niveaus van teksthiërarchie per kaart (titel + lichaamstekst)
- Voeg geen decoratieve scheidingslijnen toe — de 1px inset is het enige scheidingslijnpatroon
- Verzacht het contrast niet — Nike's ontwerp duwt zwart-op-wit bewust naar het maximum

## 8. Responsief Gedrag

### Breekpunten

| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Mobiel | <640px | Enkele kolom, hamburgernav, displaytekst schaalt omlaag, strakke 16px padding |
| Kleine Tablet | 640-768px | 2-koloms productraster begint, nav nog ingeklapt |
| Tablet | 768-960px | 2-kolomsrasters, categoriekaarten schalen, horizontale padding 24px |
| Kleine Desktop | 960-1024px | Nav klapt uit naar volledig horizontaal, 3-koloms productraster |
| Desktop | 1024-1440px | Volledige lay-out, uitgevouwen nav, 3-kolomsrasters, 48px padding |
| Grote Desktop | >1440px | Max-breedte container gecentreerd, vergrote marges, heldenfoto's full-bleed |

### Aanraakvlakken

- Minimaal aanraakvlak: 44x44px (WCAG AAA)
- Mobiele navigatiepictogrammen: 48x48px aanraakoppervlak
- Productkaarten: volledig oppervlak is aantikbaar
- Filterpillen: minimaal 36px hoogte met 12px padding

### Inklappingstrategie

- **Navigatie**: Volledige categorielinks → hamburgermenu onder 960px; zoeken, favorieten, winkelwagenpictogrammen blijven zichtbaar
- **Productrasters**: 3 kolommen → 2 kolommen bij 960px → 1 kolom bij 640px
- **Heldensecties**: Displaytekst schaalt van 96px → 64px → 48px; heldenfoto's blijven op alle formaten full-bleed
- **Categoriekaarten**: 3 kolommen → 2 kolommen → 1 kolom met behoud van full-bleed beelden
- **Sectiepadding**: 80px → 48px → 32px → 24px naarmate het venster smaller wordt
- **Promotiebanner**: tekst loopt door of wordt afgekapt, behoudt donkere achtergrond

### Beeldgedrag

- Responsieve afbeeldingen via Nike CDN (`c.static-nike.com`) met breedteparameters
- Productafbeeldingen: srcset met meerdere resoluties (w_320, w_640, w_960, w_1920)
- Heldenfoto's: full-bleed op alle breekpunten, beeldverhouding verschuift (16:9 desktop → 4:3 mobiel)
- Lazy loading: native loading="lazy", grey-100 plaatshouder tijdens laden
- Art direction: herdensneden veranderen tussen desktop- en mobielcomposities

## 9. Agent-promptgids

### Snelle Kleurnaslag

- Primaire CTA: Nike Black (`#111111`)
- Achtergrond: Wit (`#FFFFFF`)
- Secundair oppervlak: Light Gray (`#F5F5F5`)
- Koptekst: Nike Black (`#111111`)
- Lichaamstekst / hover: Secondary Text (`#707072`)
- Rand: Border Secondary (`#CACACB`)
- Fout: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Voorbeeldcomponentprompts

- "Maak een productheldenectie met full-bleed rand-aan-rand fotografie, geen border radius, een donkere gradiëntoverlay voor tekst, en een massieve uppercase 96px/500 kop in Nike Futura-stijl met regelafstand 0.90 en een Nike Black (#111111) pilknop (30px radius)"
- "Ontwerp een 3-koloms productkaartdraster met vierkante afbeeldingen (geen border radius), 4px tussenruimte tussen kaarten, productnaam in 16px/500 Nike Black (#111111), prijs in 14px/500, en secundaire tekst in Grey-500 (#707072)"
- "Bouw een sticky witte navigatiebalk met een links uitgelijnd logo, gecentreerde categorielinks in 16px/500 (#111111) met hover-kleur #707072, en rechts uitgelijnd zoeken (24px radius, #F5F5F5 achtergrond), favorieten en winkelwagenpictogrammen"
- "Maak een promotiebannerstrook met #111111 achtergrond, witte 12px/500 gecentreerde tekst, en 8px verticale padding — volledige breedte, geen border radius"
- "Ontwerp een secundaire omlijnd knop met transparante achtergrond, 1.5px #CACACB rand, 30px pilradius, 16px/500 #111111 tekst, hover waarbij rand verdonkert naar #707072"

### Iteratiegids

Bij het verfijnen van bestaande schermen die met dit ontwerpsysteem zijn gegenereerd:
1. Focus op ÉÉN component tegelijk
2. Verwijs naar specifieke kleurnamen en hexcodes uit dit document
3. Onthoud: productfotografie is de kleur — de UI blijft monochromatisch
4. Gebruik de grijsschaal voor staatswijzigingen: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Als iets in de UI te kleurrijk aanvoelt, is dat waarschijnlijk ook zo — Nike houdt de UI grijswaarden
6. Displaylettertype (Nike Futura) moet ALTIJD uppercase zijn en nooit kleiner dan 24px
7. Lichaamstekst (Helvetica Now) moet voor interactieve elementen vrijwel altijd gewicht 500 hebben
