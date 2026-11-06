# Ontwerpsysteem geïnspireerd door Stripe

> Category: Fintech & Crypto
> Betalingsinfrastructuur. Kenmerkende paarse verlopen, elegantie met gewicht 300.

## 1. Visueel Thema & Atmosfeer

De website van Stripe is de gouden standaard van fintech-ontwerp — een systeem dat tegelijkertijd technisch en luxueus aanvoelt, precies en warm. De pagina opent op een helder wit canvas (`#ffffff`) met diepe marineblauw koppen (`#061b31`) en een kenmerkend paars (`#533afd`) dat fungeert als merkankerpunt én interactief accent. Dit is niet het koude, klinische paars van bedrijfssoftware; het is een rijk, verzadigd violet dat overkomt als zelfverzekerd en premium. De algehele indruk is die van een financiële instelling opnieuw ontworpen door een topfontgieterij.

Het aangepaste variabele lettertype `sohne-var` is het bepalende element van Stripe's visuele identiteit. Elk tekstelement schakelt de OpenType-stijlset `"ss01"` in, die tekenvormen aanpast voor een uitgesproken geometrisch, modern gevoel. Op weergaveformaten (48px-56px) draait sohne-var op gewicht 300 — een buitengewoon licht gewicht voor koppen dat een etherische, bijna gefluisterde autoriteit creëert. Dit is het tegenovergestelde van de conventie van de "vetgedrukte heldenkop"; de koppen van Stripe voelen aan alsof ze niet hoeven te schreeuwen. De negatieve letterafstand (-1,4px bij 56px, -0,96px bij 48px) perst de tekst samen tot dichte, ingenieurmatig opgebouwde blokken. Bij kleinere formaten gebruikt het systeem ook gewicht 300 met proportioneel verminderde spatiëring, en tabelcijfers via `"tnum"` voor de weergave van financiële gegevens.

Wat Stripe echt onderscheidt, is het schaduwsysteem. In plaats van de platte of eenlagige aanpak van de meeste sites gebruikt Stripe meerlaagse, blauw-getinte schaduwen: de kenmerkende `rgba(50,50,93,0.25)` gecombineerd met `rgba(0,0,0,0.1)` creëert schaduwen met een koele, bijna atmosferische diepte — alsof elementen zweven in een schemerluchthemel. De blauwgrijze ondertoon van de primaire schaduwkleur (50,50,93) sluit direct aan op het marine-paarse merkpalet, waardoor zelfs elevatie merkgebonden aanvoelt.

**Kernkenmerken:**
- sohne-var met OpenType `"ss01"` op alle tekst — een aangepaste stijlset die de lettervormgeving van het merk bepaalt
- Gewicht 300 als het kenmerkende kopgewicht — licht, zelfverzekerd, anti-conventie
- Negatieve letterafstand op weergaveformaten (-1,4px bij 56px, geleidelijk losser naar beneden)
- Blauw-getinte meerlaagse schaduwen met `rgba(50,50,93,0.25)` — elevatie die merkgebonden aanvoelt
- Diepe marineblauw (`#061b31`) koppen in plaats van zwart — warm, premium, financieel kwaliteitsniveau
- Conservatieve randafronding (4px-8px) — geen pilvormige elementen, niets te scherp
- Robijn (`#ea2261`) en magenta (`#f96bee`) accenten voor verlopen en decoratieve elementen
- `SourceCodePro` als de monospace-metgezel voor code en technische labels

## 2. Kleurenpalet & Rollen

### Primair
- **Stripe Paars** (`#533afd`): Primaire merkkleur, CTA-achtergronden, linktekst, interactieve accenten. Een verzadigd blauw-violet dat het hele systeem verankert.
- **Diepe Marine** (`#061b31`): `--hds-color-heading-solid`. Primaire kopkleur. Niet zwart, niet grijs — een zeer donker blauw dat warmte en diepte toevoegt aan tekst.
- **Puur Wit** (`#ffffff`): Paginaachtergrond, kaartoppervlakken, knoptekst op donkere achtergronden.

### Merk & Donker
- **Merkdonker** (`#1c1e54`): `--hds-color-util-brand-900`. Diepe indigo voor donkere secties, voettekstachtergronden en meeslepende merkmomenten.
- **Donkere Marine** (`#0d253d`): `--hds-color-core-neutral-975`. Het donkerste neutraal — bijna-zwart met een blauwe ondertoon voor maximale diepte zonder hardheid.

### Accentkleuren
- **Robijn** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Warm rood-roze voor pictogrammen, waarschuwingen en accenten.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Levendig roze-paars voor verlopen en decoratieve hoogtepunten.
- **Magenta Licht** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Getint oppervlak voor magenta-kaarten en badges.

### Interactief
- **Primair Paars** (`#533afd`): Primaire linkkleur, actieve toestanden, geselecteerde elementen.
- **Paars Hover** (`#4434d4`): Donkerder paars voor zweeftoestanden op primaire elementen.
- **Diep Paars** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Donker paars voor zweeftoestanden van pictogrammen.
- **Licht Paars** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Zacht lavendel voor gedempte zweefachtergronden.
- **Middel Paars** (`#665efd`): `--hds-color-input-selector-text-range`. Bereikkeuzeschuif en invoeraccentkleur.

### Neutrale Schaal
- **Koptekst** (`#061b31`): Primaire koppen, navigatietekst, sterke labels.
- **Label** (`#273951`): `--hds-color-input-text-label`. Formulierlabels, secundaire koppen.
- **Hoofdtekst** (`#64748d`): Secundaire tekst, beschrijvingen, bijschriften.
- **Succesgoen** (`#15be53`): Statusbadges, succesaanduidingen (met 0,2-0,4 alpha voor achtergronden/randen).
- **Succestekst** (`#108c3d`): Tekstkleur van successbadge.
- **Citroen** (`#9b6829`): `--hds-color-core-lemon-500`. Waarschuwings- en accentkleur.

### Oppervlakken & Randen
- **Standaardrand** (`#e5edf5`): Standaardrandkleur voor kaarten, scheidingslijnen en containers.
- **Paarse Rand** (`#b9b9f9`): Actieve/geselecteerde randtoestand op knoppen en invoervelden.
- **Zachte Paarse Rand** (`#d6d9fc`): Subtiele paars-getinte randen voor secundaire elementen.
- **Magenta Rand** (`#ffd7ef`): Roze-getinte randen voor magenta-elementen.
- **Gestreepte Rand** (`#362baa`): Gestreepte randen voor dropzones en plaatshoudelementen.

### Schaduwkleuren
- **Blauwe Schaduw** (`rgba(50,50,93,0.25)`): Het kenmerkende — blauw-getinte primaire schaduwkleur.
- **Donkerblauwe Schaduw** (`rgba(3,3,39,0.25)`): Diepere blauwe schaduw voor verhoogde elementen.
- **Zwarte Schaduw** (`rgba(0,0,0,0.1)`): Secundaire schaduwlaag voor diepteversterking.
- **Omgevingsschaduw** (`rgba(23,23,23,0.08)`): Zachte omgevingsschaduw voor subtiele elevatie.
- **Zachte Schaduw** (`rgba(23,23,23,0.06)`): Minimale omgevingsschaduw voor lichte lift.

## 3. Typografieregels

### Lettertype
- **Primair**: `sohne-var`, met uitwijkoptie: `SF Pro Display`
- **Monospace**: `SourceCodePro`, met uitwijkoptie: `SFMono-Regular`
- **OpenType-functies**: `"ss01"` globaal ingeschakeld op alle sohne-var-tekst; `"tnum"` voor tabelcijfers in financiële gegevens en bijschriften.

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Functies | Opmerkingen |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (nauw) | -1.4px | ss01 | Maximale grootte, fluisterende autoriteit |
| Display Groot | sohne-var | 48px (3.00rem) | 300 | 1.15 (nauw) | -0.96px | ss01 | Secundaire heldenkoppen |
| Sectiekop | sohne-var | 32px (2.00rem) | 300 | 1.10 (nauw) | -0.64px | ss01 | Titels van functiesecties |
| Grote Onderkop | sohne-var | 26px (1.63rem) | 300 | 1.12 (nauw) | -0.26px | ss01 | Kaartkoppen, subsecties |
| Onderkop | sohne-var | 22px (1.38rem) | 300 | 1.10 (nauw) | -0.22px | ss01 | Kleinere sectiekoppen |
| Grote Hoofdtekst | sohne-var | 18px (1.13rem) | 300 | 1.40 | normaal | ss01 | Functiebeschrijvingen, inleidende tekst |
| Hoofdtekst | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normaal | ss01 | Standaard leestekst |
| Knop | sohne-var | 16px (1.00rem) | 400 | 1.00 (nauw) | normaal | ss01 | Tekst van primaire knop |
| Kleine Knop | sohne-var | 14px (0.88rem) | 400 | 1.00 (nauw) | normaal | ss01 | Secundaire/compacte knoppen |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (nauw) | normaal | ss01 | Navigatielinks |
| Bijschrift | sohne-var | 13px (0.81rem) | 400 | normaal | normaal | ss01 | Kleine labels, metadata |
| Klein Bijschrift | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normaal | ss01 | Kleine letters, tijdstempels |
| Tabel Bijschrift | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Financiële gegevens, cijfers |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (nauw) | 0.1px | ss01 | Kleine labels, asmarkeringen |
| Micro Tabel | sohne-var | 10px (0.63rem) | 300 | 1.15 (nauw) | -0.3px | tnum | Grafiekgegevens, kleine cijfers |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (nauw) | normaal | ss01 | Kleinste labels |
| Code Hoofdtekst | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (ruim) | normaal | -- | Codeblokken, syntaxis |
| Vetgedrukte Code | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (ruim) | normaal | -- | Vetgedrukte code, sleutelwoorden |
| Code Label | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (ruim) | normaal | hoofdletters | Technische labels |
| Micro Code | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (nauw) | normaal | ss01 | Kleine codeannotaties |

### Principes
- **Licht gewicht als kenmerk**: Gewicht 300 op weergaveformaten is Stripe's meest onderscheidende typografische keuze. Waar anderen 600-700 gebruiken om aandacht te trekken, gebruikt Stripe lichtheid als luxe — de tekst is zo zelfverzekerd dat het geen gewicht nodig heeft om gezaghebbend te zijn.
- **ss01 overal**: De stijlset `"ss01"` is niet onderhandelbaar. Het past specifieke glyphs aan (waarschijnlijk alternatieve `a`-, `g`- en `l`-vormen) voor een geometrischer, eigentijdser gevoel in alle sohne-var-tekst.
- **Twee OpenType-modi**: `"ss01"` voor weergave-/hoofdtekst, `"tnum"` voor tabelcijfers in financiële gegevens. Deze overlappen nooit — een cijfer in een alinea gebruikt ss01, een cijfer in een datatabel gebruikt tnum.
- **Progressieve spatiëring**: Letterafstand wordt nauwer naargelang de grootte toeneemt: -1,4px bij 56px, -0,96px bij 48px, -0,64px bij 32px, -0,26px bij 26px, normaal bij 16px en kleiner.
- **Twee-gewicht eenvoud**: Voornamelijk 300 (hoofdtekst en koppen) en 400 (UI/knoppen). Geen vetgedrukt (700) in het primaire lettertype — SourceCodePro gebruikt 500/700 voor codecontrast.

## 4. Componentstijlen

### Knoppen

**Primair Paars**
- Achtergrond: `#533afd`
- Tekst: `#ffffff`
- Opvulling: 8px 16px
- Radius: 4px
- Lettertype: 16px sohne-var gewicht 400, `"ss01"`
- Zweefstand: `#4434d4` achtergrond
- Gebruik: Primaire CTA ("Nu starten", "Verkoop contacteren")

**Geest / Omlijnd**
- Achtergrond: transparant
- Tekst: `#533afd`
- Opvulling: 8px 16px
- Radius: 4px
- Rand: `1px solid #b9b9f9`
- Lettertype: 16px sohne-var gewicht 400, `"ss01"`
- Zweefstand: achtergrond verschuift naar `rgba(83,58,253,0.05)`
- Gebruik: Secundaire acties

**Transparant Info**
- Achtergrond: transparant
- Tekst: `#2874ad`
- Opvulling: 8px 16px
- Radius: 4px
- Rand: `1px solid rgba(43,145,223,0.2)`
- Gebruik: Tertiaire/info-niveau acties

**Neutraal Geest**
- Achtergrond: transparant (`rgba(255,255,255,0)`)
- Tekst: `rgba(16,16,16,0.3)`
- Opvulling: 8px 16px
- Radius: 4px
- Omtrek: `1px solid rgb(212,222,233)`
- Gebruik: Uitgeschakelde of gedempte acties

### Kaarten & Containers
- Achtergrond: `#ffffff`
- Rand: `1px solid #e5edf5` (standaard) of `1px solid #061b31` (donker accent)
- Radius: 4px (nauw), 5px (standaard), 6px (comfortabel), 8px (uitgelicht)
- Schaduw (standaard): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Schaduw (omgeving): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Zweefstand: schaduw intensiveert, waarbij vaak de blauw-getinte laag wordt toegevoegd

### Badges / Tags / Pills
**Neutrale Pill**
- Achtergrond: `#ffffff`
- Tekst: `#000000`
- Opvulling: 0px 6px
- Radius: 4px
- Rand: `1px solid #f6f9fc`
- Lettertype: 11px gewicht 400

**Succesbadge**
- Achtergrond: `rgba(21,190,83,0.2)`
- Tekst: `#108c3d`
- Opvulling: 1px 6px
- Radius: 4px
- Rand: `1px solid rgba(21,190,83,0.4)`
- Lettertype: 10px gewicht 300

### Invoervelden & Formulieren
- Rand: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd` of paarse ring
- Label: `#273951`, 14px sohne-var
- Tekst: `#061b31`
- Plaatshouder: `#64748d`

### Navigatie
- Schone horizontale navigatie op wit, sticky met vervaagd achtergrondfilter
- Merklogotype links uitgelijnd
- Links: sohne-var 14px gewicht 400, `#061b31` tekst met `"ss01"`
- Radius: 6px op navigatiecontainer
- CTA: paarse knop rechts uitgelijnd ("Inloggen", "Nu starten")
- Mobiel: hamburgerschakelaar met radius van 6px

### Decoratieve Elementen
**Gestreepte Randen**
- `1px dashed #362baa` (paars) voor plaatshouder-/dropzones
- `1px dashed #ffd7ef` (magenta) voor magenta-getinte decoratieve randen

**Verlopen Accenten**
- Robijn-naar-magenta-verlopen (`#ea2261` naar `#f96bee`) voor heldendecoratief
- Donkere merksecties gebruiken `#1c1e54` achtergronden met witte tekst

## 5. Layoutprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Opvallend: De schaal is dicht aan de kleine kant (elke 2px van 4-12), wat de precisiegerichte UI van Stripe voor financiële gegevens weerspiegelt

### Raster & Container
- Maximale inhoudbreedte: ongeveer 1080px
- Hero: gecentreerde enkelvoudige kolom met royale opvulling, lichte koppen
- Functiesecties: 2-3 kolomrasters voor functiekaarten
- Volledige breedte donkere secties met `#1c1e54` achtergrond voor merkdompeling
- Code-/dashboardvoorbeelden als afgebakende kaarten met blauw-getinte schaduwen

### Witruimtefilosofie
- **Precieze spatiëring**: In tegenstelling tot de immense leegte van minimalistische systemen gebruikt Stripe gemeten, doelgerichte witruimte. Elke tussenruimte is een bewuste typografische keuze.
- **Dichte gegevens, royale omlijsting**: Weergave van financiële gegevens (tabellen, grafieken) is strak gepakt, maar de UI-omlijsting eromheen is royaal gespatiëerd. Dit creëert een gevoel van gecontroleerde dichtheid — als een goed georganiseerd rekenblad in een prachtig frame.
- **Sectieritmiek**: Witte secties wisselen af met donkere merksecties (`#1c1e54`), wat een dramatisch licht/donker ritme creëert dat eentonigheid voorkomt zonder willekeurige kleuren in te voeren.

### Randafronding Schaal
- Micro (1px): Fijnmazige elementen, subtiele afronding
- Standaard (4px): Knoppen, invoervelden, badges, kaarten — het werkpaard
- Comfortabel (5px): Standaard kaartcontainers
- Ruim (6px): Navigatie, grotere interactieve elementen
- Groot (8px): Uitgelichte kaarten, hero-elementen
- Samengesteld: `0px 0px 6px 6px` voor onderaan afgeronde containers (tabbladpanelen, dropdownvoetteksten)

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Plat (Niveau 0) | Geen schaduw | Paginaachtergrond, inline tekst |
| Omgeving (Niveau 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Subtiele kaartlift, zweefhints |
| Standaard (Niveau 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Standaardkaarten, inhoudspanelen |
| Verhoogd (Niveau 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Uitgelichte kaarten, dropdowns, popovers |
| Diep (Niveau 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modals, zwevende panelen |
| Ring (Toegankelijkheid) | `2px solid #533afd` omtrek | Toetsenbordfocusring |

**Schaduwfilosofie**: Stripe's schaduwsysteem is gebouwd op het principe van chromatische diepte. Waar de meeste ontwerpsystemen neutrale grijze of zwarte schaduwen gebruiken, is Stripe's primaire schaduwkleur (`rgba(50,50,93,0.25)`) een diep blauwgrijs dat het marinepalet van het merk weerspiegelt. Dit creëert schaduwen die niet alleen diepte toevoegen — ze voegen merksfeer toe. De meerlaagse aanpak koppelt deze blauw-getinte schaduw aan een puur zwarte secundaire laag (`rgba(0,0,0,0.1)`) op een andere offset, waardoor een parallaxachtige diepte ontstaat waarbij de merkschaduw verder van het element ligt en de neutrale schaduw dichterbij. De negatieve spreidingwaarden (-30px, -18px) zorgen ervoor dat schaduwen niet horizontaal buiten de footprint van het element uitsteken, waardoor elevatie verticaal en gecontroleerd blijft.

### Decoratieve Diepte
- Donkere merksecties (`#1c1e54`) creëren meeslepende diepte door contrast in achtergrondkleur
- Verloonoverlays met robijn-naar-magenta-overgangen voor heldendecoratief
- Schaduwkleur `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) voor bovenkantschaduwen op sticky elementen

## 7. Dos en Don'ts

### Wel doen
- Gebruik sohne-var met `"ss01"` op elk tekstelement — de stijlset IS het merk
- Gebruik gewicht 300 voor alle koppen en hoofdtekst — lichtheid is het kenmerk
- Pas blauw-getinte schaduwen (`rgba(50,50,93,0.25)`) toe voor alle verhoogde elementen
- Gebruik `#061b31` (diepe marine) voor koppen in plaats van `#000000` — de warmte is belangrijk
- Houd randafronding tussen 4px-8px — conservatieve afronding is opzettelijk
- Gebruik `"tnum"` voor elke tabel-/financiële cijferweergave
- Laag schaduwen: blauw-getint ver + neutraal dichtbij voor diepteparallax
- Gebruik `#533afd` paars als primaire interactieve/CTA-kleur

### Niet doen
- Gebruik geen gewicht 600-700 voor sohne-var-koppen — gewicht 300 is de merkstem
- Gebruik geen grote randafronding (12px+, pilvormig) op kaarten of knoppen — Stripe is conservatief
- Gebruik geen neutrale grijze schaduwen — tint altijd met blauw (`rgba(50,50,93,...)`)
- Sla `"ss01"` niet over op sohne-var-tekst — de alternatieve glyphs bepalen de persoonlijkheid
- Gebruik geen puur zwart (`#000000`) voor koppen — altijd `#061b31` diepe marine
- Gebruik geen warme accentkleuren (oranje, geel) voor interactieve elementen — paars is primair
- Pas geen positieve letterafstand toe op weergaveformaten — Stripe trekt nauw
- Gebruik de magenta-/robijnaccenten niet voor knoppen of links — ze zijn alleen decoratief/verlopend

## 8. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Mobiel | <640px | Enkelvoudige kolom, kleinere kopformaten, gestapelde kaarten |
| Tablet | 640-1024px | 2-kolomrasters, matige opvulling |
| Desktop | 1024-1280px | Volledig layout, 3-kolomfunctierasters |
| Groot Bureaublad | >1280px | Gecentreerde inhoud met royale marges |

### Aanraakdoelen
- Knoppen gebruiken comfortabele opvulling (8px-16px verticaal)
- Navigatielinks op 14px met voldoende spatiëring
- Badges hebben minimaal 6px horizontale opvulling voor aanraakdoelen
- Mobiele navigatieschakelaar met knop met radius van 6px

### Inklapstrategie
- Hero: 56px weergave -> 32px op mobiel, gewicht 300 gehandhaafd
- Navigatie: horizontale links + CTA's -> hamburgerschakelaar
- Functiekaarten: 3 kolommen -> 2 kolommen -> enkelvoudige kolom gestapeld
- Donkere merksecties: volledige breedte behouden, interne opvulling verminderen
- Financiële gegevenstabellen: horizontaal scrollen op mobiel
- Sectiespatiëring: 64px+ -> 40px op mobiel
- Typografieschaal comprimeert: 56px -> 48px -> 32px heldenformaten over breekpunten

### Afbeeldingsgedrag
- Dashboard-/productschermafbeeldingen behouden blauw-getinte schaduw op alle formaten
- Hero-verloomdecoraties worden eenvoudiger op mobiel
- Codeblokken behouden `SourceCodePro`-behandeling, kunnen horizontaal scrollen
- Kaartafbeeldingen behouden consistente randafronding van 4px-6px

## 9. Agentpromptgids

### Snelle Kleurenreferentie
- Primaire CTA: Stripe Paars (`#533afd`)
- CTA Zweefstand: Donker Paars (`#4434d4`)
- Achtergrond: Puur Wit (`#ffffff`)
- Koptekst: Diepe Marine (`#061b31`)
- Hoofdtekst: Leisteen (`#64748d`)
- Labeltekst: Donker Leisteen (`#273951`)
- Rand: Zacht Blauw (`#e5edf5`)
- Link: Stripe Paars (`#533afd`)
- Donkere sectie: Merkdonker (`#1c1e54`)
- Succes: Groen (`#15be53`)
- Decoratief accent: Robijn (`#ea2261`), Magenta (`#f96bee`)

### Voorbeeldcomponentprompts
- "Maak een heldsectie op witte achtergrond. Kop op 48px sohne-var gewicht 300, regelhoogte 1.15, letterafstand -0.96px, kleur #061b31, font-feature-settings 'ss01'. Ondertitel op 18px gewicht 300, regelhoogte 1.40, kleur #64748d. Paarse CTA-knop (#533afd, 4px radius, 8px 16px opvulling, witte tekst) en geestknop (transparant, 1px solid #b9b9f9, #533afd tekst, 4px radius)."
- "Ontwerp een kaart: witte achtergrond, 1px solid #e5edf5 rand, 6px radius. Schaduw: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Titel op 22px sohne-var gewicht 300, letterafstand -0.22px, kleur #061b31, 'ss01'. Hoofdtekst op 16px gewicht 300, #64748d."
- "Bouw een succesbadge: rgba(21,190,83,0.2) achtergrond, #108c3d tekst, 4px radius, 1px 6px opvulling, 10px sohne-var gewicht 300, rand 1px solid rgba(21,190,83,0.4)."
- "Maak navigatie: witte sticky header met backdrop-filter blur(12px). sohne-var 14px gewicht 400 voor links, #061b31 tekst, 'ss01'. Paarse CTA 'Nu starten' rechts uitgelijnd (#533afd achtergrond, witte tekst, 4px radius). Navigatiecontainer 6px radius."
- "Ontwerp een donkere merksectie: #1c1e54 achtergrond, witte tekst. Kop 32px sohne-var gewicht 300, letterafstand -0.64px, 'ss01'. Hoofdtekst 16px gewicht 300, rgba(255,255,255,0.7). Kaarten binnenin gebruiken rgba(255,255,255,0.1) rand met 6px radius."

### Iteratiegids
1. Schakel altijd `font-feature-settings: "ss01"` in op sohne-var-tekst — dit is het typografische DNA van het merk
2. Gewicht 300 is de standaard; gebruik 400 alleen voor knoppen/links/navigatie
3. Schaduwformule: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` waarbij Y1/B1 groter zijn (verre schaduw) en Y2/B2 kleiner (nabije schaduw)
4. Kopkleur is `#061b31` (diepe marine), hoofdtekst is `#64748d` (leisteen), labels zijn `#273951` (donker leisteen)
5. Randafronding blijft in het bereik van 4px-8px — gebruik nooit pilvormige of grote afronding
6. Gebruik `"tnum"` voor alle cijfers in tabellen, grafieken of financiële weergaven
7. Donkere secties gebruiken `#1c1e54` — niet zwart, niet grijs, maar een diepe merkgebonden indigo
8. SourceCodePro voor code op 12px/500 met regelhoogte 2.00 (zeer royaal voor leesbaarheid)
