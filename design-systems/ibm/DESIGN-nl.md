# Design System Inspired by IBM

> Category: Media & Consumer
> Enterprise-technologie. Carbon design system, gestructureerd blauw palet.

## 1. Visueel Thema & Sfeer

De website van IBM is de digitale belichaming van enterprise-autoriteit, gebouwd op het Carbon Design System — een ontwerptaal zo methodisch gestructureerd dat het leest als een technische specificatie weergegeven als webpagina. De pagina opereert op een strak dualisme: een helder wit (`#ffffff`) canvas met bijna-zwart (`#161616`) tekst, onderbroken door één enkel, onwrikbaar accent — IBM Blue 60 (`#0f62fe`). Dit is geen speelse tech-startup-minimalisme; het is zakelijke precisie gedestilleerd tot pixels. Elk element bevindt zich binnen Carbon's strakke 2x-grid, elke kleur verwijst naar een semantisch token, elke spatiëringswaarde klinkt op de basisunit van 8px.

De IBM Plex-lettertypefamilie is de ruggengraat van het systeem. IBM Plex Sans op licht gewicht (300) voor displaykoppen creëert een onverwacht luchtige, bijna tere kwaliteit op grote formaten — een bewust tegenwicht voor IBM's zakelijke ernst. Op bodymaten introduceert regulier gewicht (400) met 0.16px letterafstand op 14px-bijschriften de minutieuze micro-tracking die Carbon-tekst eerder ingenieursgekalibreerd dan ontworpen doet aanvoelen. IBM Plex Mono dient voor code, data en technische labels, en vormt samen met de zeldzaam gebruikte IBM Plex Serif de volledige familie-triniteit.

Wat IBM's visuele identiteit bepaalt voorbij monochroom-plus-blauw, is de afhankelijkheid van Carbon's component-tokensysteem. Elke interactieve toestand verwijst naar een CSS custom property met het voorvoegsel `--cds-` (Carbon Design System). Knoppen hebben geen hardgecodeerde kleuren; ze verwijzen naar `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Deze getokeniseerde architectuur betekent dat de volledige visuele laag een dunne schil is over een diep systematisch fundament — het ontwerpequivalent van een goed getypte API.

**Kernkenmerken:**
- IBM Plex Sans op gewicht 300 (Light) voor display — zakelijke zwaarwichtigheid door typografische terughoudendheid
- IBM Plex Mono voor code en technische inhoud met consistente 0.16px letterafstand op kleine formaten
- Enkele accentkleur: IBM Blue 60 (`#0f62fe`) — elk interactief element, elke CTA, elke link
- Carbon-tokensysteem (`--cds-*`) dat alle semantische kleuren aanstuurt en thema-wisseling op variabeleniveau mogelijk maakt
- 8px-spatiëringsgrid met strikte naleving — geen arbitraire waarden, alles lijnt uit
- Platte, randloze kaarten op `#f4f4f4` Gray 10-oppervlak — diepte door achtergrondkleurlagen, niet schaduwen
- Onderrandingangen (niet omlijnd) — het kenmerkende Carbon-formulierpatroon
- 0px border-radius op primaire knoppen — ongegeneerd rechthoekig, geen afronding

## 2. Kleurenpalet & Rollen

### Primair
- **IBM Blue 60** (`#0f62fe`): De enige interactieve kleur. Primaire knoppen, links, focustoestanden, actieve indicatoren. Dit is de enige chromatische tint in het kern-UI-palet.
- **White** (`#ffffff`): Paginaachtergrond, kaartoppervlakken, knoptekst op blauw, `--cds-background`.
- **Gray 100** (`#161616`): Primaire tekst, koppen, donkere oppervlakachtergronden, navigatiebalk, voettekst. `--cds-text-primary`.

### Neutrale Schaal (Gray-familie)
- **Gray 100** (`#161616`): Primaire tekst, koppen, donker UI-chroom, voettekstachtergrond.
- **Gray 90** (`#262626`): Secundaire donkere oppervlakken, hovertoestanden op donkere achtergronden.
- **Gray 80** (`#393939`): Tertiair donker, actieve toestanden.
- **Gray 70** (`#525252`): Secundaire tekst, helptekst, beschrijvingen. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Plaatsaanduidingstekst, uitgeschakelde tekst.
- **Gray 50** (`#8d8d8d`): Uitgeschakelde iconen, gedempte labels.
- **Gray 30** (`#c6c6c6`): Randen, scheidingslijnen, invoerveld-onderranden. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Subtiele randen, kaartomlijningen.
- **Gray 10** (`#f4f4f4`): Secundaire oppervlakachtergrond, kaartopvullingen, afwisselende rijen. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Hovertoestand voor Gray 10-oppervlakken.

### Interactief
- **Blue 60** (`#0f62fe`): Primair interactief — knoppen, links, focus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Link-hovertoestand. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Actieve/ingedrukte toestand voor blauwe elementen.
- **Blue 10** (`#edf5ff`): Blauwe tintoppervlak, geselecteerde rijachtergrond.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — 2px inset-rand op gefocuste elementen.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — witte binnenring voor focus op donkere achtergronden.

### Ondersteuning & Status
- **Red 60** (`#da1e28`): Fout, gevaar. `--cds-support-error`.
- **Green 50** (`#24a148`): Succes. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Waarschuwing. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informatief. `--cds-support-info`.

### Donker Thema (Gray 100-thema)
- **Background**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Kaart- en containeroppervlakken.
- **Layer 02**: Gray 80 (`#393939`). Verhoogde oppervlakken.
- **Text Primary**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Text Secondary**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Border Subtle**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactive**: Blue 40 (`#78a9ff`). Links en interactieve elementen worden lichter voor contrast.

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `IBM Plex Sans`, met fallbacks: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, met fallbacks: `Menlo, Courier, monospace`
- **Serif** (beperkt gebruik): `IBM Plex Serif`, voor redactionele/expressieve contexten
- **Pictogramlettertype**: `ibm_icons` — eigen pictogramglyphs op 20px

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Maximale impact, licht gewicht voor elegantie |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Secundaire hero, responsieve fallback |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Expressieve kop |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Sectiekoppen |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Subsectietitels |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Kaarttitels, functiekoppen |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Lichtere kaartkoppen |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Standaard leestekst |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Benadrukte bodytekst, labels |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Compacte bodytekst, bijschriften |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Vetgedrukte bijschriften, navigatie-items |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadata, tijdstempels |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Inline code, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Codeblokken |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Hero mono-decoratief |

### Principes
- **Licht gewicht op displayformaten**: Carbon's expressieve typografieset gebruikt gewicht 300 (Light) bij 42px+. Dit creëert een onderscheidende spanning — de inhoud spreekt met zakelijke autoriteit terwijl de lettervormen fluisteren met typografische lichtheid.
- **Micro-tracking op kleine formaten**: 0.16px letterafstand bij 14px en 0.32px bij 12px. Deze schijnbaar verwaarloosbare waarden zijn Carbon's geheime wapen voor leesbaarheid op compacte formaten — ze openen de nauwgezette IBM Plex-lettervormen net genoeg.
- **Drie functionele gewichten**: 300 (display/expressief), 400 (body/lezen), 600 (nadruk/UI-labels). Gewicht 700 ontbreekt bewust uit de productietypografieschaal.
- **Productief vs. Expressief**: Productieve sets gebruiken krappere regelafstanden (1.29) voor dichte UI. Expressieve sets ademen meer (1.40-1.50) voor marketing- en redactionele inhoud.

## 4. Componentstijlen

### Knoppen

**Primaire Knop (Blauw)**
- Background: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Text: `#ffffff` (White)
- Padding: 14px 63px 14px 15px (asymmetrisch — ruimte voor volgend pictogram)
- Border: 1px solid transparent
- Border-radius: 0px (scherpe rechthoek — de Carbon-signatuur)
- Height: 48px (standaard), 40px (compact), 64px (expressief)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Active: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Focus: `2px solid #0f62fe` inset + `1px solid #ffffff` inner

**Secundaire Knop (Grijs)**
- Background: `#393939` (Gray 80)
- Text: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Active: `#6f6f6f` (Gray 60)
- Zelfde padding/radius als primair

**Tertiaire Knop (Ghost Blauw)**
- Background: transparent
- Text: `#0f62fe` (Blue 60)
- Border: 1px solid `#0f62fe`
- Hover: `#0353e9` tekst + Blue 10 achtergrondtint
- Border-radius: 0px

**Ghost-knop**
- Background: transparent
- Text: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Border: none
- Hover: `#e8e8e8` achtergrondtint

**Gevaarknop**
- Background: `#da1e28` (Red 60)
- Text: `#ffffff`
- Hover: `#b81921` (Red 70)

### Kaarten & Containers
- Background: `#ffffff` op wit thema, `#f4f4f4` (Gray 10) voor verhoogde kaarten
- Border: none (plat ontwerp — geen rand of schaduw op de meeste kaarten)
- Border-radius: 0px (passend bij de rechthoekige knopesthetiek)
- Hover: achtergrond verschuift naar `#e8e8e8` (Gray 10 Hover) voor klikbare kaarten
- Content padding: 16px
- Scheiding: achtergrondkleurlagen (white → gray 10 → white) in plaats van schaduwen

### Invoervelden & Formulieren
- Background: `#f4f4f4` (Gray 10) — `--cds-field`
- Text: `#161616` (Gray 100)
- Padding: 0px 16px (alleen horizontaal)
- Height: 40px (standaard), 48px (groot)
- Border: none aan zijkanten/bovenkant — `2px solid transparent` onderkant
- Bottom-border actief: `2px solid #161616` (Gray 100)
- Focus: `2px solid #0f62fe` (Blue 60) onderrand — `--cds-focus`
- Error: `2px solid #da1e28` (Red 60) onderrand
- Label: 12px IBM Plex Sans, 0.32px letterafstand, Gray 70
- Helptekst: 12px, Gray 60
- Placeholder: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (bovenkant) — invoervelden hebben scherpe hoeken

### Navigatie
- Background: `#161616` (Gray 100) — volledige-breedte donkere masthead
- Height: 48px
- Logo: IBM 8-balk-logo, wit op donker, links uitgelijnd
- Links: 14px IBM Plex Sans, gewicht 400, `#c6c6c6` (Gray 30) standaard
- Link hover: `#ffffff` tekst
- Actieve link: `#ffffff` met onderrandindicator
- Platformwisselaar: links uitgelijnde horizontale tabs
- Zoeken: pictogram-geactiveerd uitschuivend zoekveld
- Mobiel: hamburgermenu met naar links schuivend paneel

### Links
- Standaard: `#0f62fe` (Blue 60) zonder onderstreping
- Hover: `#0043ce` (Blue 70) met onderstreping
- Bezocht: blijft Blue 60 (geen wijziging van bezochte toestand)
- Inline links: standaard onderstreept in bodytekst

### Onderscheidende Componenten

**Inhoudsblok (Hero/Feature)**
- Volledige-breedte afwisselende witte/gray-10 achtergrondstroken
- Kop links uitgelijnd met displaytype van 60px of 48px
- CTA als blauwe primaire knop met pijlpictogram
- Afbeelding/illustratie rechts uitgelijnd of eronder op mobiel

**Tegel (Klikbare Kaart)**
- Background: `#f4f4f4` of `#ffffff`
- Volledige-breedte onderrand of achtergrondverschuiving bij hover
- Pijlpictogram rechtsonder bij hover
- Geen schaduw — platheid is de identiteit

**Tag / Label**
- Background: contextuele kleur op 10% dekking (bijv. Blue 10, Red 10)
- Tekst: overeenkomstige kleur van rang 60
- Padding: 4px 8px
- Border-radius: 24px (pil — uitzondering op de 0px-regel)
- Lettertype: 12px gewicht 400

**Meldingsbanner**
- Volledige-breedte balk, doorgaans Blue 60 of Gray 100 achtergrond
- Witte tekst, 14px
- Sluit/verwijder-pictogram rechts uitgelijnd

## 5. Lay-outprincipes

### Spatiëringssysteem
- Basisunit: 8px (Carbon 2x-grid)
- Componentspatiëringsschaal: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Lay-outspatiëringsschaal: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini-unit: 8px (kleinste bruikbare spatiëring)
- Opvulling binnen componenten: doorgaans 16px
- Tussenruimte tussen kaarten/tegels: 1px (haarfijn) of 16px (standaard)

### Grid & Container
- 16-kolomsgrid (Carbon's 2x-gridsysteem)
- Maximale inhoudbreedte: 1584px (maximaal breekpunt)
- Kolomgoten: 32px (16px op mobiel)
- Marge: 16px (mobiel), 32px (tablet+)
- Inhoud beslaat doorgaans 8-12 kolommen voor leesbare regellengte
- Volledige-breedte secties wisselen af met ingesloten inhoud

### Witruimtefilosofie
- **Functionele dichtheid**: Carbon geeft de voorkeur aan productieve dichtheid boven ruime witruimte. Secties zijn strak verpakt in vergelijking met consumentenontwerpsystemen — dit weerspiegelt IBM's enterprise-DNA.
- **Achtergrondkleurzones**: In plaats van massale opvulling tussen secties, gebruikt IBM afwisselende achtergrondkleuren (white → gray 10 → white) om visuele scheiding te creëren met minimale verticale ruimte.
- **Consistent 48px-ritme**: Grote sectieovergangen gebruiken 48px verticale spatiëring. Hero-secties kunnen 80px–96px gebruiken.

### Border-radiusschaal
- **0px**: Primaire knoppen, invoervelden, tegels, kaarten — de dominante behandeling. Carbon is fundamenteel rechthoekig.
- **2px**: Occasioneel op kleine interactieve elementen (tags)
- **24px**: Tags/labels (pilvorm — de enige afgeronde uitzondering)
- **50%**: Avatarcirkels, pictogramcontainers

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Flat (Level 0) | Geen schaduw, `#ffffff` achtergrond | Standaard paginaoppervlak |
| Layer 01 | Geen schaduw, `#f4f4f4` achtergrond | Kaarten, tegels, afwisselende secties |
| Layer 02 | Geen schaduw, `#e0e0e0` achtergrond | Verhoogde panelen binnen Layer 01 |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Dropdowns, tooltips, overloopmenu's |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + donker scherm | Modaldialogen, zijpanelen |
| Focus | `2px solid #0f62fe` inset + `1px solid #ffffff` | Toetsenbord-focusring |
| Bottom-border | `2px solid #161616` op onderrand | Actief invoerveld, actieve tabindicator |

**Schaduwfilosofie**: Carbon is bewust schaduwafkerig. IBM bereikt diepte voornamelijk door achtergrondkleurlagen — oppervlakken van progressief donkerder grijs stapelen in plaats van box-schaduwen toevoegen. Dit creëert een platte, druk-geïnspireerde esthetiek waarbij hiërarchie wordt gecommuniceerd via kleurwaarde, niet gesimuleerd licht. Schaduwen zijn uitsluitend voorbehouden aan zwevende elementen (dropdowns, tooltips, modals) waar het element daadwerkelijk over inhoud heen ligt. Deze terughoudendheid geeft de zeldzame schaduw betekenisvolle impact — wanneer iets zweeft in Carbon, doet het ertoe.

## 7. Do's en Don'ts

### Do
- Gebruik IBM Plex Sans op gewicht 300 voor displayformaten (42px+) — de lichtheid is opzettelijk
- Pas 0.16px letterafstand toe op 14px bodytekst en 0.32px op 12px bijschriften
- Gebruik 0px border-radius op knoppen, invoervelden, kaarten en tegels — rechthoeken zijn het systeem
- Verwijs naar `--cds-*`-tokennamen bij implementatie (bijv. `--cds-button-primary`, `--cds-text-primary`)
- Gebruik achtergrondkleurlagen (white → gray 10 → gray 20) voor diepte in plaats van schaduwen
- Gebruik onderrand (geen kader) voor indicatoren van invoervelden
- Handhaaf de standaardhoogte van 48px voor knoppen en asymmetrische opvulling voor pictogramaccommodatie
- Pas Blue 60 (`#0f62fe`) toe als het enige accent — één blauw om alles te regeren

### Don't
- Rond knophoeken niet af — 0px radius is de Carbon-identiteit
- Gebruik geen schaduwen op kaarten of tegels — platheid is het punt
- Introduceer geen aanvullende accentkleuren — IBM's systeem is monochromatisch + blauw
- Gebruik geen gewicht 700 (Bold) — de schaal stopt bij 600 (Semibold)
- Voeg geen letterafstand toe aan displayformaattekst — tracking is alleen voor 14px en kleiner
- Omkader invoervelden niet met volledige randen — Carbon-invoervelden gebruiken alleen onderrand
- Gebruik geen verloopachtergronden — IBM's oppervlakken zijn platte, effen kleuren
- Wijk niet af van het 8px-spatiëringsgrid — elke waarde moet deelbaar zijn door 8 (met 2px en 4px voor microaanpassingen)

## 8. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Small (sm) | 320px | Enkelvoudige kolom, hamburgernav, 16px marges |
| Medium (md) | 672px | 2-kolomsgrids beginnen, uitgebreide inhoud |
| Large (lg) | 1056px | Volledige navigatie zichtbaar, 3-4 kolomsgrids |
| X-Large (xlg) | 1312px | Maximale inhoudsdichtheid, brede lay-outs |
| Max | 1584px | Maximale inhoudsbreedte, gecentreerd met marges |

### Aanraakdoelen
- Knophoogte: 48px standaard, minimaal 40px (compact)
- Navigatielinks: 48px rijhoogte voor aanraking
- Invoerhoogte: 40px standaard, 48px groot
- Pictogramknoppen: 48px vierkant aanraakdoel
- Mobiele menu-items: volledige-breedte 48px rijen

### Inklappingsstrategie
- Hero: 60px display → 42px → 32px kop naarmate viewport smaller wordt
- Navigatie: volledige horizontale masthead → hamburger met uitschuivend paneel
- Grid: 4-koloms → 2-koloms → enkelvoudige kolom
- Tegels/kaarten: horizontaal grid → verticale stapel
- Afbeeldingen: beeldverhouding behouden, max-width 100%
- Voettekst: meerkolomse linkgroepen → gestapelde enkelvoudige kolom
- Sectieopvulling: 48px → 32px → 16px

### Afbeeldingsgedrag
- Responsieve afbeeldingen met `max-width: 100%`
- Productillustraties schalen proportioneel
- Hero-afbeeldingen kunnen verschuiven van naast elkaar naar eronder gestapeld
- Datavisualisaties behouden beeldverhouding met horizontaal scrollen op mobiel

## 9. Agent-promptgids

### Snelle Kleurverwijzing
- Primaire CTA: IBM Blue 60 (`#0f62fe`)
- Background: White (`#ffffff`)
- Koptekst: Gray 100 (`#161616`)
- Bodytekst: Gray 100 (`#161616`)
- Secundaire tekst: Gray 70 (`#525252`)
- Oppervlak/Kaart: Gray 10 (`#f4f4f4`)
- Rand: Gray 30 (`#c6c6c6`)
- Link: Blue 60 (`#0f62fe`)
- Link hover: Blue 70 (`#0043ce`)
- Focusring: Blue 60 (`#0f62fe`)
- Fout: Red 60 (`#da1e28`)
- Succes: Green 50 (`#24a148`)

### Voorbeeldcomponentprompts
- "Maak een hero-sectie op witte achtergrond. Kop op 60px IBM Plex Sans gewicht 300, line-height 1.17, kleur #161616. Ondertitel op 16px gewicht 400, line-height 1.50, kleur #525252, max-width 640px. Blauwe CTA-knop (#0f62fe achtergrond, #ffffff tekst, 0px border-radius, 48px hoogte, 14px 63px 14px 15px padding)."
- "Ontwerp een kaarttegel: #f4f4f4 achtergrond, 0px border-radius, 16px padding. Titel op 20px IBM Plex Sans gewicht 600, line-height 1.40, kleur #161616. Body op 14px gewicht 400, letter-spacing 0.16px, line-height 1.29, kleur #525252. Hover: achtergrond verschuift naar #e8e8e8."
- "Bouw een formulierveld: #f4f4f4 achtergrond, 0px border-radius, 40px hoogte, 16px horizontale padding. Label erboven op 12px gewicht 400, letter-spacing 0.32px, kleur #525252. Bottom-border: 2px solid transparent standaard, 2px solid #0f62fe bij focus. Placeholder: #6f6f6f."
- "Maak een donkere navigatiebalk: #161616 achtergrond, 48px hoogte. IBM-logo wit links uitgelijnd. Links op 14px IBM Plex Sans gewicht 400, kleur #c6c6c6. Hover: #ffffff tekst. Actief: #ffffff met 2px onderrand."
- "Bouw een tagcomponent: Blue 10 (#edf5ff) achtergrond, Blue 60 (#0f62fe) tekst, 4px 8px padding, 24px border-radius, 12px IBM Plex Sans gewicht 400."

### Iteratiegids
1. Gebruik altijd 0px border-radius op knoppen, invoervelden en kaarten — dit is niet onderhandelbaar in Carbon
2. Letterafstand alleen op kleine formaten: 0.16px bij 14px, 0.32px bij 12px — nooit op displaytekst
3. Drie gewichten: 300 (display), 400 (body), 600 (nadruk) — geen vet
4. Blue 60 is de enige accentkleur — introduceer geen secundaire accenttinten
5. Diepte komt van achtergrondkleurlagen (white → #f4f4f4 → #e0e0e0), niet schaduwen
6. Invoervelden hebben alleen onderrand, nooit volledig omlijnd
7. Gebruik het voorvoegsel `--cds-` voor tokennaming om Carbon-compatibel te blijven
8. 48px is de universele hoogte voor interactieve elementen
