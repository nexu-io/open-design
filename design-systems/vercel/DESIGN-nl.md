# Ontwerpsysteem geïnspireerd door Vercel

> Category: Ontwikkelaarstools
> Frontend-implementatie. Zwart-witte precisie, Geist-lettertype.

## 1. Visueel Thema & Sfeer

De website van Vercel is de visuele these van ontwikkelaarsinfrastructuur die onzichtbaar is gemaakt — een ontwerpsysteem zo terughoudend dat het bijna filosofisch aandoet. De pagina is overweldigend wit (`#ffffff`) met bijna-zwart (`#171717`) tekst, waardoor een galerij-achtige leegte ontstaat waarin elk element zijn pixel moet verdienen. Dit is geen minimalisme als decoratie; het is minimalisme als ingenieursprincipe. Het Geist-ontwerpsysteem behandelt de interface zoals een compiler code behandelt — elk overbodig token wordt verwijderd totdat alleen structuur overblijft.

De aangepaste Geist-lettertypefamilie is de kroonjuweel. Geist Sans gebruikt agressieve negatieve letterafstand (-2,4px tot -2,88px op weergavegroottes), waardoor koppen ontstaan die gecomprimeerd, urgent en geëngineered aanvoelen — als code die voor productie geminificeerd is. Op tekstgroottes ontspant de spatiëring, maar de geometrische precisie blijft. Geist Mono completeert het systeem als de monospace-metgezel voor code, terminaluitvoer en technische labels. Beide lettertypen schakelen OpenType `"liga"` (ligaturen) globaal in, wat een laag van typografische verfijning toevoegt die beloont bij aandachtig lezen.

Wat Vercel onderscheidt van andere monochrome ontwerpsystemen is zijn schaduw-als-rand-filosofie. In plaats van traditionele CSS-randen gebruikt Vercel `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — een schaduw met nul offset, nul vervaging en 1px verspreiding, die een randachtige lijn creëert zonder de gevolgen van het box-model. Deze techniek laat randen bestaan in de schaduwlaag, waardoor vloeiendere overgangen, afgeronde hoeken zonder knippen en een subtielere visuele zwaarte mogelijk zijn dan traditionele randen. Het volledige dieptesysteem is gebouwd op gelaagde, meervoudige schaduwstapels waarbij elke laag een specifiek doel dient: één voor de rand, één voor zachte verhoging en één voor omgevingsdiepte.

**Belangrijkste kenmerken:**
- Geist Sans met extreme negatieve letterafstand (-2,4px tot -2,88px op weergave) — tekst als gecomprimeerde infrastructuur
- Geist Mono voor code en technische labels met globaal OpenType `"liga"`
- Schaduw-als-rand-techniek: `box-shadow 0px 0px 0px 1px` vervangt overal traditionele randen
- Meervoudige schaduwstapels voor genuanceerde diepte (rand + verhoging + omgeving in enkele declaraties)
- Bijna-puur wit canvas met `#171717` tekst — niet helemaal zwart, waardoor micro-contrastzachtheid ontstaat
- Werkstroom-specifieke accentkleuren: Verzend-rood (`#ff5b4f`), Voorbeeld-roze (`#de1d8d`), Ontwikkel-blauw (`#0a72ef`)
- Focusring-systeem met `hsla(212, 100%, 48%, 1)` — een verzadigd blauw voor toegankelijkheid
- Pill-badges (9999px) met getinte achtergronden voor statusindicatoren

## 2. Kleurenpalet & Rollen

### Primair
- **Vercel Zwart** (`#171717`): Primaire tekst, koppen, donkere oppervlakteachtergronden. Niet zuiver zwart — de lichte warmte voorkomt hardheid.
- **Puur Wit** (`#ffffff`): Paginaachtergrond, kaartoppervlakken, knoptekst op donker.
- **Echt Zwart** (`#000000`): Secundair gebruik, `--geist-console-text-color-default`, gebruikt in specifieke console-/codecontexten.

### Werkstroom-accentkleuren
- **Verzend-rood** (`#ff5b4f`): `--ship-text`, de "verzenden naar productie"-werkstroomstap — warm, urgent koraalrood.
- **Voorbeeld-roze** (`#de1d8d`): `--preview-text`, de voorbeeldimplementatiewerkstroom — levendig magentaroze.
- **Ontwikkel-blauw** (`#0a72ef`): `--develop-text`, de ontwikkelingswerkstroom — helder, gefocust blauw.

### Console-/codekleuren
- **Consoleblauw** (`#0070f3`): `--geist-console-text-color-blue`, syntaxisaccentuering blauw.
- **Consolepaars** (`#7928ca`): `--geist-console-text-color-purple`, syntaxisaccentuering paars.
- **Consoleroze** (`#eb367f`): `--geist-console-text-color-pink`, syntaxisaccentuering roze.

### Interactief
- **Linkblauw** (`#0072f5`): Primaire linkkleur met onderstrepingsdecoratie.
- **Focusblauw** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, focusring op interactieve elementen.
- **Ringblauw** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, Tailwind ring-hulpklasse.

### Neutralenschaal
- **Grijs 900** (`#171717`): Primaire tekst, koppen, navigatietekst.
- **Grijs 600** (`#4d4d4d`): Secundaire tekst, beschrijvingstekst.
- **Grijs 500** (`#666666`): Tertiaire tekst, gedempte links.
- **Grijs 400** (`#808080`): Plaatsaanduidingstekst, uitgeschakelde toestanden.
- **Grijs 100** (`#ebebeb`): Randen, kaartcontouren, scheidslijnen.
- **Grijs 50** (`#fafafa`): Subtiele oppervlaktetint, binnenste schaduwmarkering.

### Oppervlak & Overlay
- **Overlay-achtergrond** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, modaal/dialoogachtergrond.
- **Selectietekst** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, tekstselectiemarkering.
- **Badge blauw achtergrond** (`#ebf5ff`): Pill-badge-achtergrond, getint blauw oppervlak.
- **Badge blauw tekst** (`#0068d6`): Pill-badge-tekst, donkerder blauw voor leesbaarheid.

### Schaduwen & Diepte
- **Randschaduw** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): De handtekening — vervangt traditionele randen.
- **Subtiele verhoging** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Minimale lift voor kaarten.
- **Kaartstapel** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Volledige meervoudige kaartschaduw.
- **Ringrand** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Lichtgrijze ringrand voor tabbladen en afbeeldingen.

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `Geist`, met fallbacks: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace**: `Geist Mono`, met fallbacks: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **OpenType-functies**: `"liga"` globaal ingeschakeld op alle Geist-tekst; `"tnum"` voor tabulaire cijfers op specifieke bijschriften.

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (strak) | -2.4px tot -2.88px | Maximale compressie, billboard-impact |
| Sectiekop | Geist | 40px (2.50rem) | 600 | 1.20 (strak) | -2.4px | Functiesectietitels |
| Grote subkop | Geist | 32px (2.00rem) | 600 | 1.25 (strak) | -1.28px | Kaartkoppen, subsecties |
| Subkop | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Lichtere subkoppen |
| Kaarttitel | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Functiekaarten |
| Lichte kaarttitel | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Secundaire kaartkoppen |
| Grote hoofdtekst | Geist | 20px (1.25rem) | 400 | 1.80 (ontspannen) | normal | Introducties, functiebeschrijvingen |
| Hoofdtekst | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Standaard leestekst |
| Kleine hoofdtekst | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Standaard UI-tekst |
| Middelhoofdtekst | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Navigatie, benadrukte tekst |
| Halfvette hoofdtekst | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Sterke labels, actieve toestanden |
| Knop / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Knoppen, links, bijschriften |
| Kleine knop | Geist | 14px (0.88rem) | 400 | 1.00 (strak) | normal | Compacte knoppen |
| Bijschrift | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadata, tags |
| Mono hoofdtekst | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Codeblokken |
| Mono bijschrift | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Codelabels |
| Kleine mono | Geist Mono | 12px (0.75rem) | 500 | 1.00 (strak) | normal | `text-transform: uppercase`, technische labels |
| Micro-badge | Geist | 7px (0.44rem) | 700 | 1.00 (strak) | normal | `text-transform: uppercase`, kleine badges |

### Principes
- **Compressie als identiteit**: Geist Sans op weergavegroottes gebruikt -2,4px tot -2,88px letterafstand — de meest agressieve negatieve spatiëring van elk groot ontwerpsysteem. Dit creëert tekst die _geminificeerd_ aanvoelt, als code geoptimaliseerd voor productie. De spatiëring ontspant progressief naarmate de grootte afneemt: -1,28px op 32px, -0,96px op 24px, -0,32px op 16px en normaal op 14px.
- **Ligaturen overal**: Elk Geist-tekstelement schakelt OpenType `"liga"` in. Ligaturen zijn niet decoratief — ze zijn structureel en creëren strakke, efficiëntere glyph-combinaties.
- **Drie gewichten, strikte rollen**: 400 (hoofdtekst/lezen), 500 (UI/interactief), 600 (koppen/nadruk). Geen vet (700) behalve voor kleine micro-badges. Dit smalle gewichtsbereik creëert hiërarchie door grootte en spatiëring, niet door gewicht.
- **Mono als identiteit**: Geist Mono in hoofdletters met `"tnum"` of `"liga"` dient als de "ontwikkelaarsconsole"-stem — compacte technische labels die de marketingsite verbinden met het product.

## 4. Componentstijlen

### Knoppen

**Primair wit (schaduwomrand)**
- Achtergrond: `#ffffff`
- Tekst: `#171717`
- Opvulling: 0px 6px (minimaal — inhoudsgestuurde breedte)
- Radius: 6px (subtiel afgerond)
- Schaduw: `rgb(235, 235, 235) 0px 0px 0px 1px` (ringrand)
- Hover: achtergrond verschuift naar `var(--ds-gray-1000)` (donker)
- Focus: `2px solid var(--ds-focus-color)` omtrek + `var(--ds-focus-ring)` schaduw
- Gebruik: Standaard secundaire knop

**Primair donker (afgeleid uit Geist-systeem)**
- Achtergrond: `#171717`
- Tekst: `#ffffff`
- Opvulling: 8px 16px
- Radius: 6px
- Gebruik: Primaire CTA ("Start Deploying", "Get Started")

**Pill-knop / Badge**
- Achtergrond: `#ebf5ff` (getint blauw)
- Tekst: `#0068d6`
- Opvulling: 0px 10px
- Radius: 9999px (volledige pill)
- Lettertype: 12px gewicht 500
- Gebruik: Statusbadges, tags, functielabels

**Grote pill (navigatie)**
- Achtergrond: transparant of `#171717`
- Radius: 64px–100px
- Gebruik: Tabbladnavigatie, sectieselectoren

### Kaarten & Containers
- Achtergrond: `#ffffff`
- Rand: via schaduw — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Radius: 8px (standaard), 12px (uitgelichte/afbeeldingskaarten)
- Schaduwstapel: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Afbeeldingskaarten: `1px solid #ebebeb` met 12px bovenste radius
- Hover: subtiele schaduwintensivering

### Invoervelden & Formulieren
- Radio: standaardstijl met focus `var(--ds-gray-200)` achtergrond
- Focusschaduw: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Focusomtrek: `2px solid var(--ds-focus-color)` — consistente blauwe focusring
- Rand: via schaduw-techniek, niet traditionele rand

### Navigatie
- Schone horizontale navigatie op wit, sticky
- Vercel-woordmerk links uitgelijnd, 262x52px
- Links: Geist 14px gewicht 500, `#171717` tekst
- Actief: gewicht 600 of onderstreping
- CTA: donkere pill-knoppen ("Start Deploying", "Contact Sales")
- Mobiel: hamburgermenu inklapbaar
- Product-dropdowns met meervoudige menu's

### Afbeeldingsbehandeling
- Productschermafbeeldingen met `1px solid #ebebeb` rand
- Bovenafgeronde afbeeldingen: `12px 12px 0px 0px` radius
- Dashboard-/codevoorbeeldschermafbeeldingen domineren functiesecties
- Zachte verloopachtergronden achter hero-afbeeldingen (pastel multicolor)

### Onderscheidende componenten

**Werkstroompijplijn**
- Drietraps horizontale pijplijn: Ontwikkelen → Voorbeeld → Verzenden
- Elke stap heeft zijn eigen accentkleur: Blauw → Roze → Rood
- Verbonden met lijnen/pijlen
- De visuele metafoor voor Vercels kernwaardepropositie

**Vertrouwensbalk / Logoraster**
- Bedrijfslogo's (Perplexity, ChatGPT, Cursor, enz.) in grijswaarden
- Horizontaal scrollen of rasterindeling
- Subtiele `#ebebeb` randscheiding

**Metriekkaarten**
- Grote cijferweergave (bijv. "10x sneller")
- Geist 48px gewicht 600 voor de metriek
- Beschrijving eronder in grijze hoofdtekst
- Schaduwomrande kaartcontainer

## 5. Layoutprincipes

### Afstandssysteem
- Basiséénheid: 8px
- Schaal: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Opvallende sprong: van 16px naar 32px — geen 20px of 24px in primaire schaal

### Raster & Container
- Maximale inhoudbreedte: ongeveer 1200px
- Hero: gecentreerde enkele kolom met ruime bovenopvulling
- Functiesecties: 2–3 kolomrasters voor kaarten
- Volledige breedte-scheidslijnen met `border-bottom: 1px solid #171717`
- Code-/dashboardschermafbeeldingen als volledig-breedte of ingesloten met rand

### Witruimtefilosofie
- **Galerij-leegte**: Enorme verticale opvulling tussen secties (80px–120px+). De witruimte IS het ontwerp — het communiceert dat Vercel niets te bewijzen en niets te verbergen heeft.
- **Gecomprimeerde tekst, uitgebreide ruimte**: De agressieve negatieve letterafstand op koppen wordt gecompenseerd door royale omliggende witruimte. De tekst is dicht; de ruimte eromheen is uitgestrekt.
- **Sectieritme**: Witte secties wisselen af met witte secties — er is geen kleurvariatie tussen secties. Scheiding komt uitsluitend van randen (schaduwranden) en afstand.

### Grensradius-schaal
- Micro (2px): Inline-codefragmenten, kleine spans
- Subtiel (4px): Kleine containers
- Standaard (6px): Knoppen, links, functionele elementen
- Comfortabel (8px): Kaarten, lijstitems
- Afbeelding (12px): Uitgelichte kaarten, afbeeldingscontainers (bovenafgerond)
- Groot (64px): Tabbladnavigatiepills
- XL (100px): Grote navigatielinks
- Volledige pill (9999px): Badges, statuspills, tags
- Cirkel (50%): Menuschakelaar, avatar-containers

## 6. Diepte & Verhoging

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Vlak (niveau 0) | Geen schaduw | Paginaachtergrond, tekstblokken |
| Ring (niveau 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Schaduw-als-rand voor de meeste elementen |
| Lichte ring (niveau 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Lichtere ring voor tabbladen, afbeeldingen |
| Subtiele kaart (niveau 2) | Ring + `rgba(0,0,0,0.04) 0px 2px 2px` | Standaardkaarten met minimale lift |
| Volledige kaart (niveau 3) | Ring + Subtiel + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + binnenste `#fafafa` ring | Uitgelichte kaarten, gemarkeerde panelen |
| Focus (toegankelijkheid) | `2px solid hsla(212, 100%, 48%, 1)` omtrek | Toetsenbordfocus op alle interactieve elementen |

**Schaduwfilosofie**: Vercel heeft aantoonbaar het meest verfijnde schaduwsysteem in modern webontwerp. In plaats van schaduwen te gebruiken voor verhoging in de traditionele Material Design-zin, gebruikt Vercel meervoudige schaduwstapels waarbij elke laag een duidelijk architecturaal doel heeft: één creëert de "rand" (0px verspreiding, 1px), een andere voegt omgevingszachtheid toe (2px vervaging), een andere verwerkt diepte op afstand (8px vervaging met negatieve verspreiding), en een binnenring (`#fafafa`) creëert de subtiele markering die de kaart "gloeit" van binnenuit. Deze gelaagde aanpak laat kaarten gebouwd aanvoelen, niet zwevend.

### Decoratieve diepte
- Hero-verloop: zacht, pastel multicolor verloopwas achter hero-inhoud (nauwelijks zichtbaar, atmosferisch)
- Sectieranden: `1px solid #171717` (volledige donkere lijn) tussen grote secties
- Geen achtergrondkleurvariatie — diepte komt volledig van schaduwlagen en randcontrast

## 7. Doe's en Verboden

### Doe
- Gebruik Geist Sans met agressieve negatieve letterafstand op weergavegroottes (-2,4px tot -2,88px op 48px)
- Gebruik schaduw-als-rand (`0px 0px 0px 1px rgba(0,0,0,0.08)`) in plaats van traditionele CSS-randen
- Schakel `"liga"` in op alle Geist-tekst — ligaturen zijn structureel, niet optioneel
- Gebruik het driegewichtssysteem: 400 (hoofdtekst), 500 (UI), 600 (koppen)
- Pas werkstroom-accentkleuren (rood/roze/blauw) alleen toe in hun werkstroomcontext
- Gebruik meervoudige schaduwstapels voor kaarten (rand + verhoging + omgeving + binnenste markering)
- Houd het kleurenpalet achromatisch — grijzen van `#171717` tot `#ffffff` zijn het systeem
- Gebruik `#171717` in plaats van `#000000` voor primaire tekst — de micro-warmte maakt verschil

### Verboden
- Gebruik geen positieve letterafstand op Geist Sans — het is altijd negatief of nul
- Gebruik geen gewicht 700 (vet) op hoofdtekst — 600 is het maximum, alleen voor koppen
- Gebruik geen traditionele CSS `border` op kaarten — gebruik de schaduwrandtechniek
- Introduceer geen warme kleuren (oranje, geel, groen) in de UI-shell
- Pas de werkstroom-accentkleuren (Verzend-rood, Voorbeeld-roze, Ontwikkel-blauw) niet decoratief toe
- Gebruik geen zware schaduwen (> 0,1 dekking) — het schaduwsysteem is fluisterzacht
- Vergroot de letterafstand van de hoofdtekst niet — Geist is ontworpen om strak te lopen
- Gebruik geen pill-radius (9999px) op primaire actieknoppen — pills zijn alleen voor badges/tags
- Sla de binnenste `#fafafa` ring in kaartschaduwen niet over — het is de gloed die het systeem laat werken

## 8. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Kleine mobiel | <400px | Strakke enkele kolom, minimale opvulling |
| Mobiel | 400–600px | Standaard mobiel, gestapelde indeling |
| Kleine tablet | 600–768px | 2-kolomrasters beginnen |
| Tablet | 768–1024px | Volledige kaartrasters, uitgebreide opvulling |
| Kleine desktop | 1024–1200px | Standaard desktopindeling |
| Desktop | 1200–1400px | Volledige indeling, maximale inhoudsbreedte |
| Grote desktop | >1400px | Gecentreerd, ruime marges |

### Aanraakvlakken
- Knoppen gebruiken comfortabele opvulling (8px–16px verticaal)
- Navigatielinks op 14px met voldoende afstand
- Pill-badges hebben 10px horizontale opvulling voor aanraakvlakken
- Mobiele menutoggle gebruikt een cirkelvormige knop met 50% radius

### Inklap-strategie
- Hero: weergave 48px → schaalt omlaag, behoudt negatieve spatiëring proportioneel
- Navigatie: horizontale links + CTA's → hamburgermenu
- Functiekaarten: 3 kolommen → 2 kolommen → enkele gestapelde kolom
- Codeschermafbeeldingen: behoudt beeldverhouding, kan horizontaal scrollen
- Vertrouwensbalklogo's: raster → horizontaal scrollen
- Voettekst: meerdere kolommen → enkele gestapelde kolom
- Sectieafstand: 80px+ → 48px op mobiel

### Afbeeldingsgedrag
- Dashboardschermafbeeldingen behouden randbehandeling op alle groottes
- Hero-verloop wordt zachter/vereenvoudigd op mobiel
- Productschermafbeeldingen gebruiken responsieve afbeeldingen met consistente randradius
- Volledig-breedte secties behouden rand-tot-rand-behandeling

## 9. Agentpromptgids

### Snelle kleurverwijzing
- Primaire CTA: Vercel Zwart (`#171717`)
- Achtergrond: Puur Wit (`#ffffff`)
- Koptekst: Vercel Zwart (`#171717`)
- Hoofdtekst: Grijs 600 (`#4d4d4d`)
- Rand (schaduw): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Linkblauw (`#0072f5`)
- Focusring: Focusblauw (`hsla(212, 100%, 48%, 1)`)

### Voorbeeldcomponentprompts
- "Maak een hero-sectie op witte achtergrond. Kop op 48px Geist gewicht 600, regelhoogte 1.00, letterafstand -2.4px, kleur #171717. Ondertitel op 20px Geist gewicht 400, regelhoogte 1.80, kleur #4d4d4d. Donkere CTA-knop (#171717, 6px radius, 8px 16px opvulling) en ghost-knop (wit, schaduwrand rgba(0,0,0,0.08) 0px 0px 0px 1px, 6px radius)."
- "Ontwerp een kaart: witte achtergrond, geen CSS-rand. Gebruik schaduwstapel: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radius 8px. Titel op 24px Geist gewicht 600, letterafstand -0.96px. Hoofdtekst op 16px gewicht 400, #4d4d4d."
- "Bouw een pill-badge: #ebf5ff achtergrond, #0068d6 tekst, 9999px radius, 0px 10px opvulling, 12px Geist gewicht 500."
- "Maak navigatie: witte sticky header. Geist 14px gewicht 500 voor links, #171717 tekst. Donkere pill-CTA 'Start Deploying' rechts uitgelijnd. Schaduwrand onderaan: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Ontwerp een werkstroomsectie met drie stappen: Ontwikkelen (tekstkleur #0a72ef), Voorbeeld (#de1d8d), Verzenden (#ff5b4f). Elke stap: 14px Geist Mono hoofdletters label + 24px Geist gewicht 600 titel + 16px gewicht 400 beschrijving in #4d4d4d."

### Iteratiegids
1. Gebruik altijd schaduw-als-rand in plaats van CSS-rand — `0px 0px 0px 1px rgba(0,0,0,0.08)` is het fundament
2. Letterafstand schaalt met de lettergrootte: -2,4px op 48px, -1,28px op 32px, -0,96px op 24px, normaal op 14px
3. Slechts drie gewichten: 400 (lezen), 500 (interageren), 600 (aankondigen)
4. Kleur is functioneel, nooit decoratief — werkstroomkleuren (rood/roze/blauw) markeren alleen pijplijnfasen
5. De binnenste `#fafafa` ring in kaartschaduwen is wat Vercel-kaarten hun subtiele binnenste gloed geeft
6. Geist Mono hoofdletters voor technische labels, Geist Sans voor al het andere
