# Design System Inspired by Uber

> Categorie: Media & Consument
> Mobiliteitplatform. Vet zwart-wit, strakke typografie, stedelijke energie.

## 1. Visueel thema & sfeer

Uber's ontwerptaal is een meesterklas in zelfverzekerd minimalisme -- een zwart-wit universum waar elke pixel een doel dient en niets decoratief is zonder dat het zijn plek verdiend heeft. De gehele ervaring is gebouwd op een scherp dualisme: gitzwart (`#000000`) en puur wit (`#ffffff`), met vrijwel geen middentonen die de boodschap verdunnen. Dit is niet het steriele minimalisme van een startup die het ontwerp nog niet heeft afgerond -- het is de bewuste terughoudendheid van een merk dat zo gevestigd is dat het zich kan veroorloven te fluisteren.

Het kenmerkende lettertype, UberMove, is een propriëtair geometrisch schreefloos lettertype met een opvallend vierkante, ingenieuze kwaliteit. Koppen in UberMove Bold op 52px hebben het gewicht van een billboard -- gezaghebbend, direct, zonder verontschuldiging. Het aanvullende lettertype UberMoveText verwerkt de broodtekst en knoppen met een iets zachter, beter leesbaar karakter op gemiddeld gewicht (500). Samen creëren ze een typografisch systeem dat aanvoelt als een transitkaart: helder, efficiënt, gebouwd om snel te scannen.

Wat Uber's ontwerp werkelijk onderscheidend maakt, is het gebruik van full-bleed fotografie en illustraties gecombineerd met pilvormige interactieve elementen (999px border-radius). Navigatiechips, CTA-knoppen en categorieselectors delen allemaal deze capsulevorm, waardoor een tastbare, duimvriendelijke interfacetaal ontstaat die onmiskenbaar Uber is. De illustraties -- warme, licht gestileerde scènes van chauffeurs, passagiers en stadsgezichten -- brengen menselijkheid in wat anders een koud, monochroom systeem zou kunnen zijn. De site wisselt af tussen witte inhoudssecties en een volledig zwarte voettekst, met op kaarten gebaseerde indelingen die de zachtst mogelijke schaduwen gebruiken (rgba(0,0,0,0.12-0.16)) om subtiele diepte te creëren zonder de vlakke esthetiek te doorbreken.

**Belangrijkste kenmerken:**
- Puur zwart-witte basis met vrijwel geen middentonen in de UI-structuur
- UberMove (koppen) + UberMoveText (broodtekst/UI) -- propriëtaire geometrische schreefloze lettertypefamilie
- Pilvorm overal: knoppen, chips en navigatie-items gebruiken allemaal 999px border-radius
- Warme, mensgerichte illustraties als contrast met de strakke monochrome interface
- Op kaarten gebaseerde indeling met fluisterzachte schaduwen (0.12-0.16 dekking)
- 8px-spatiëringsgrid met compacte, informatiedichte indelingen
- Krachtige fotografie geïntegreerd als full-bleed hero-achtergronden
- Zwarte voettekst als ankerpunt van de pagina met een donkere, hoog-contrast omgeving

## 2. Kleurenpalet & rollen

### Primair
- **Uber Black** (`#000000`): De bepalende merkleur -- gebruikt voor primaire knoppen, koppen, navigatietekst en de voettekst. Niet "bijna-zwart" of "gebroken zwart", maar echt, compromisloos zwart.
- **Pure White** (`#ffffff`): De primaire vlakkleur en inverse tekst. Gebruikt voor paginaachtergronden, kaartoppervlakken en tekst op zwarte elementen.

### Interactieve en knopstatussen
- **Hover Gray** (`#e2e2e2`): Hoverstatusvoor witte knoppen -- een schone, koele lichtgrijze kleur die duidelijke feedback geeft zonder warmte.
- **Hover Light** (`#f3f3f3`): Subtiele hover voor verhoogde witte knoppen -- nauwelijks zichtbaar grijs voor zachte interactiefeedback.
- **Chip Gray** (`#efefef`): Achtergrond voor secundaire/filterknoppen en navigatiechips -- een neutraal, ultralichTgrijs.

### Tekst & inhoud
- **Body Gray** (`#4b4b4b`): Secundaire tekst en voettekstlinks -- een echt middengrijs zonder warme of koele tint.
- **Muted Gray** (`#afafaf`): Tertiaire tekst, gedemptevoettekstlinks en tijdelijke aanduidingen.

### Randen & scheiding
- **Border Black** (`#000000`): Dunne 1px-randen voor structurele afbakening -- spaarzaam gebruikt op scheidingslijnen en formuliercontainers.

### Schaduwen & diepte
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Standaard kaartelevatie -- een veerverlichte lift voor inhoudskaarten.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Iets sterkere elevatie voor zwevende actieknoppen en overlays.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Inzettende schaduw voor actieve/ingedrukte statussen op secundaire knoppen.

### Linkstatussen
- **Default Link Blue** (`#0000ee`): Standaard browserblauw voor tekstlinks met onderstreping -- gebruikt in broodtekst.
- **Link White** (`#ffffff`): Links op donkere oppervlakken -- gebruikt in de voettekst en donkere secties.
- **Link Black** (`#000000`): Links op lichte oppervlakken met onderstrepingsdecoratie.

### Gradiëntsysteem
- Uber's ontwerp is **volledig gradiëntvrij**. Het zwart/wit-dualisme en vlakke kleurblokken creëren alle visuele hiërarchie. Nergens in het systeem verschijnen gradiënten -- elk oppervlak is een effen kleur, elke overgang is een harde rand of een schaduw.

## 3. Typografieregels

### Lettertypefamilie
- **Kop / Display**: `UberMove`, met terugvalopties: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Broodtekst / UI**: `UberMoveText`, met terugvalopties: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Opmerking: UberMove en UberMoveText zijn propriëtaire lettertypen. Gebruik voor externe implementaties `system-ui` of Inter als de dichtstbijzijnde beschikbare vervanger. Het geometrische, vierkant-geproportioneerde karakter van UberMove kan worden benaderd met Inter of DM Sans.*

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Opmerkingen |
|------|------|------|--------|-------------|-------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (strak) | Maximale impact, billboardaanwezigheid |
| Sectiekop | UberMove | 36px (2.25rem) | 700 | 1.22 (strak) | Grote sectie-ankerpunten |
| Kaarttitel | UberMove | 32px (2rem) | 700 | 1.25 (strak) | Kaart- en functiekoppen |
| Subkop | UberMove | 24px (1.5rem) | 700 | 1.33 | Secundaire sectiekoppen |
| Kleine kop | UberMove | 20px (1.25rem) | 700 | 1.40 | Compacte koppen, lijsttitels |
| Navigatie / UI groot | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Navigatielinks, prominente UI-tekst |
| Broodtekst / Knop | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Standaard broodtekst, knoplabels |
| Bijschrift | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadata, beschrijvingen, kleine links |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (ruim) | Kleine tekst, juridische tekst |

### Principes
- **Vette koppen, middenzwaar broodtekst**: UberMove-koppen zijn uitsluitend gewicht 700 (vet) -- elke kop komt met billboardkracht binnen. UberMoveText voor broodtekst en UI gebruikt 400-500, waardoor een duidelijke visuele hiërarchie ontstaat door gewichtscontrast.
- **Strakke koplijnafstanden**: Alle koppen gebruiken regelafstanden tussen 1.22-1.40 -- compact en krachtig, ontworpen voor scannen in plaats van lezen.
- **Functionele typografie**: Er is nergens een decoratieve typografische behandeling. Geen letterafstand, geen text-transform, geen ornamentele maatvoering. Elk tekstelement dient een direct communicatiedoel.
- **Twee lettertypen, strikte rollen**: UberMove is uitsluitend voor koppen. UberMoveText is uitsluitend voor broodtekst, knoppen, links en UI. De grens wordt nooit overschreden.

## 4. Componentstijlen

### Knoppen

**Primair zwart (CTA)**
- Achtergrond: Uber Black (`#000000`)
- Tekst: Pure White (`#ffffff`)
- Opvulling: 10px 12px
- Radius: 999px (volledige pil)
- Omtrek: geen
- Focus: inzettende ring `rgb(255,255,255) 0px 0px 0px 2px`
- De primaire actieknop -- vet, hoog contrast, niet te missen

**Secundair wit**
- Achtergrond: Pure White (`#ffffff`)
- Tekst: Uber Black (`#000000`)
- Opvulling: 10px 12px
- Radius: 999px (volledige pil)
- Hover: achtergrond verschuift naar Hover Gray (`#e2e2e2`)
- Focus: achtergrond verschuift naar Hover Gray, inzettende ring verschijnt
- Gebruikt op donkere oppervlakken of als secundaire actie naast Primair Zwart

**Chip / Filter**
- Achtergrond: Chip Gray (`#efefef`)
- Tekst: Uber Black (`#000000`)
- Opvulling: 14px 16px
- Radius: 999px (volledige pil)
- Actief: inzettende schaduw `rgba(0,0,0,0.08)`
- Navigatiechips, categorieselectors, filtertoggle-knoppen

**Zwevende actieknop**
- Achtergrond: Pure White (`#ffffff`)
- Tekst: Uber Black (`#000000`)
- Opvulling: 14px
- Radius: 999px (volledige pil)
- Schaduw: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` lichte verschuiving
- Hover: achtergrond verschuift naar `#f3f3f3`
- Kaartbediening, naar-boven-scrollen, zwevende CTA's

### Kaarten & containers
- Achtergrond: Pure White (`#ffffff`) op witte pagina's; geen duidelijk onderscheid in kaartachtergrond
- Rand: standaard geen -- kaarten worden gedefinieerd door schaduw, niet door lijn
- Radius: 8px voor standaard inhoudskaarten; 12px voor uitgelichte/gepromote kaarten
- Schaduw: `rgba(0,0,0,0.12) 0px 4px 16px 0px` voor standaard lift
- Kaarten zijn informatiedicht met minimale interne opvulling
- Afbeeldingsgeleide kaarten gebruiken full-bleed afbeeldingen met tekstoverlay of tekst eronder

### Invoervelden & formulieren
- Tekst: Uber Black (`#000000`)
- Achtergrond: Pure White (`#ffffff`)
- Rand: 1px solid Black (`#000000`) -- de enige plek waar zichtbare randen prominent verschijnen
- Radius: 8px
- Opvulling: standaard comfortabele spatiëring
- Focus: geen speciaal aangepaste focusstatus -- maakt gebruik van de standaard browserfocusring

### Navigatie
- Plakkerige bovenste navigatie met witte achtergrond
- Logo: Uber-woordmerk/pictogram op 24x24px in zwart
- Links: UberMoveText op 14-18px, gewicht 500, in Uber Black
- Pilvormige navigatiechips met Chip Gray (`#efefef`) achtergrond voor categorienavigatie ("Ride", "Drive", "Business", "Uber Eats")
- Menutoggle: ronde knop met 50% border-radius
- Mobiel: hamburgermenupatroon

### Afbeeldingsbehandeling
- Warme, handgeïllustreerde scènes (geen foto's voor featuresecties)
- Illustratiestijl: licht gestileerde mensen, warm kleurenpalet in illustraties, eigentijdse sfeer
- Hero-secties gebruiken krachtige fotografie of illustraties als breedbeeldachtergronden
- QR-codes voor CTA's voor het downloaden van de app
- Alle afbeeldingen gebruiken standaard 8px of 12px border-radius wanneer ze in kaarten zijn opgenomen

### Onderscheidende componenten

**Categoriepil-navigatie**
- Horizontale rij pilvormige knoppen voor navigatie op het hoogste niveau ("Ride", "Drive", "Business", "Uber Eats", "About")
- Elke pil: Chip Gray achtergrond, zwarte tekst, 999px radius
- Actieve status aangegeven door zwarte achtergrond met witte tekst (inversie)

**Hero met dubbele actie**
- Gesplitste hero: tekst/CTA links, kaart/illustratie rechts
- Twee invoervelden naast elkaar voor ophaallocatie/bestemming
- "See prices" CTA-knop in zwarte pil

**Vooruitplankaarten**
- Kaarten die functies promoten zoals "Uber Reserve" en reisplanning
- Illustratiezwaar met warme, mensgericchte afbeeldingen
- Zwarte CTA-knoppen met witte tekst onderaan

## 5. Indelingsprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Knopopvulling: 10px 12px (compact) of 14px 16px (comfortabel)
- Interne kaartopvulling: ongeveer 24-32px
- Verticale sectie-spatiëring: royaal maar efficiënt -- ongeveer 64-96px tussen grote secties

### Grid & container
- Maximale containerbreedte: ongeveer 1136px, gecentreerd
- Hero: gesplitste indeling met tekst links, visueel rechts
- Featuresecties: 2-kolomskaartgrids of breedbeeldenkelkolom
- Voettekst: meerkolomslink-grid op zwarte achtergrond
- Breedbeeldsecties die zich uitstrekken tot de viewportranden

### Witruimtefilosofie
- **Efficiënt, niet luchtig**: Uber's witruimte is functioneel -- genoeg om te scheiden, nooit genoeg om leeg aan te voelen. Dit is transitsysteem-spatiëring: compact, helder, doelgericht.
- **Informatiedichte kaarten**: Kaarten pakken informatie compact samen met minimale interne spatiëring, en vertrouwen op schaduw en radius om grenzen te definiëren.
- **Ademruimte per sectie**: Grote secties krijgen royale verticale spatiëring, maar binnen secties zijn elementen nauw gegroepeerd.

### Schaal voor afrondingsradius
- Scherp (0px): Geen vierkante hoeken gebruikt in interactieve elementen
- Standaard (8px): Inhoudskaarten, invoervelden, keuzelijsten
- Comfortabel (12px): Uitgelichte kaarten, grotere containers, linkkaarten
- Volledige pil (999px): Alle knoppen, chips, navigatie-items, pillen
- Cirkel (50%): Avatarafbeeldingen, pictogramcontainers, cirkelvormige bedieningselementen

## 6. Diepte & elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Plat (niveau 0) | Geen schaduw, effen achtergrond | Paginaachtergrond, inline inhoud, tekstsecties |
| Subtiel (niveau 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Standaard inhoudskaarten, functieblokken |
| Gemiddeld (niveau 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Verhoogde kaarten, overlayelementen |
| Zwevend (niveau 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Zwevende actieknoppen, kaartbediening |
| Ingedrukt (niveau 4) | `rgba(0,0,0,0.08) inset` (999px spreiding) | Actieve/ingedrukte knopstatussen |
| Focusring | `rgb(255,255,255) 0px 0px 0px 2px inset` | Toetsenbord-focusindicatoren |

**Schaduwfilosofie**: Uber gebruikt schaduwen puur als structureel hulpmiddel, nooit decoratief. Schaduwen zijn altijd zwart op zeer lage dekking (0.08-0.16), waardoor de minimaal benodigde lift ontstaat om inhoudslagen te scheiden. De vervagingsradii zijn gematigd (8-16px) -- genoeg om natuurlijk aan te voelen, maar nooit dramatisch. Er zijn geen gekleurde schaduwen, geen gestapelde schaduwstapels en geen omgevingsgloweffecten. Diepte wordt meer gecommuniceerd door het zwart/wit-sectiecontrast dan door schaduw-elevatie.

## 7. Doe's en don'ts

### Doe
- Gebruik echt zwart (`#000000`) en puur wit (`#ffffff`) als het primaire palet -- het harde contrast IS Uber
- Gebruik 999px border-radius voor alle knoppen, chips en pilvormige navigatie-elementen
- Houd alle koppen in UberMove Bold (700) voor billboardniveau-impact
- Gebruik fluisterzachte schaduwen (0.12-0.16 dekking) voor kaartelevatie -- nauwelijks zichtbaar
- Handhaaf de compacte, informatiedichte indelingsstijl -- Uber geeft prioriteit aan efficiëntie boven luchtigheid
- Gebruik warme, mensgerichte illustraties om de monochrome interface te verzachten
- Pas 8px radius toe voor inhoudskaarten en 12px voor uitgelichte containers
- Gebruik UberMoveText op gewicht 500 voor navigatie en prominente UI-tekst
- Combineer zwarte primaire knoppen met witte secundaire knoppen voor dubbele-actie-indelingen

### Doe niet
- Voeg geen kleur toe aan de UI-structuur -- Uber's interface is strikt zwart, wit en grijs
- Gebruik geen afgeronde hoeken kleiner dan 999px op knoppen -- de volledige-pilvorm is een kernidentiteitselement
- Pas geen zware schaduwen of slagschaduwen toe met hoge dekking -- diepte is fluisterzacht
- Gebruik geen schreeflettertypen -- Uber's typografie is uitsluitend geometrisch schreefloos
- Creëer geen luchtige, ruime indelingen met overmatige witruimte -- Uber's dichtheid is opzettelijk
- Gebruik geen gradiënten of kleuroverlays -- elk oppervlak is een vlakke, effen kleur
- Meng UberMove niet in broodtekst of UberMoveText niet in koppen -- de hiërarchie is strikt
- Gebruik geen decoratieve randen -- randen zijn functioneel (invoervelden, scheidingslijnen) of afwezig
- Verzacht het zwart/wit-contrast niet met gebroken witten of bijna-zwarten -- het dualisme is bewust

## 8. Responsief gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Mobiel klein | 320px | Minimale indeling, enkelijke kolom, gestapelde invoervelden, compacte typografie |
| Mobiel | 600px | Standaard mobiel, gestapelde indeling, hamburgernav |
| Tablet klein | 768px | Tweekoloms-grids beginnen, uitgebreide kaartindelingen |
| Tablet | 1119px | Volledige tabletindeling, zij-aan-zij hero-inhoud |
| Desktop klein | 1120px | Desktopgrid activeert, horizontale navpillen |
| Desktop | 1136px | Volledige desktopindeling, maximale containerbreedte, gesplitste hero |

### Aanraakdoelwitten
- Alle pilknoppen: minimaal 44px hoogte (10-14px verticale opvulling + regelafstand)
- Navigatiechips: royale 14px 16px opvulling voor comfortabel duimtippen
- Cirkelvormige bedieningselementen (menu, sluiten): 50% radius zorgt voor grote, gemakkelijk te raken doelwitten
- Kaartoppervlakken fungeren als volledig-oppervlak aanraakdoelwitten op mobiel

### Instortingsstrategie
- **Navigatie**: Horizontale pilnav valt in tot hamburgermenu met cirkelvormige toggle
- **Hero**: Gesplitste indeling (tekst + kaart/visueel) stapelt naar enkelijke kolom -- tekst boven, visueel onder
- **Invoervelden**: Zij-aan-zij ophaal/bestemmingsinvoervelden stapelen verticaal
- **Functiekaarten**: 2-kolomsgrid valt in tot breedbeeldgestapelde kaarten
- **Koppen**: 52px display schaalt omlaag via 36px, 32px, 24px, 20px
- **Voettekst**: Meerkolomslink-grid valt in tot accordeon of gestapelde enkelijke kolom
- **Categoriepillen**: Horizontaal scrollen met overflow op kleinere schermen

### Afbeeldingsgedrag
- Illustraties schalen proportioneel mee binnen hun containers
- Hero-afbeeldingen behouden de beeldverhouding en kunnen bijgesneden worden op kleinere schermen
- QR-codeblokken zijn verborgen op mobiel (app downloaden verschuift naar directe store-links)
- Kaartafbeeldingen behouden 8-12px border-radius op alle formaten

## 9. Agentpromptgids

### Snelle kleurverwijzing
- Primaire knop: "Uber Black (#000000)"
- Paginaachtergrond: "Pure White (#ffffff)"
- Knoptekst (op zwart): "Pure White (#ffffff)"
- Knoptekst (op wit): "Uber Black (#000000)"
- Secundaire tekst: "Body Gray (#4b4b4b)"
- Tertiaire tekst: "Muted Gray (#afafaf)"
- Chipachtergrond: "Chip Gray (#efefef)"
- Hoverstatus: "Hover Gray (#e2e2e2)"
- Kaartschaduw: "rgba(0,0,0,0.12) 0px 4px 16px"
- Voettekstachtergrond: "Uber Black (#000000)"

### Voorbeeldcomponentprompts
- "Maak een hero-sectie op Pure White (#ffffff) met een kop op 52px UberMove Bold (700), regelafstand 1.23. Gebruik Uber Black (#000000) tekst. Voeg een ondertitel toe in Body Gray (#4b4b4b) op 16px UberMoveText gewicht 400 met regelafstand 1.50. Plaats een Uber Black (#000000) pil-CTA-knop met Pure White tekst, 999px radius, opvulling 10px 12px."
- "Ontwerp een categorienavigatiebalk met horizontale pilknoppen. Elke pil: Chip Gray (#efefef) achtergrond, Uber Black (#000000) tekst, 14px 16px opvulling, 999px border-radius. Actieve pil inverteert naar Uber Black achtergrond met Pure White tekst. Gebruik UberMoveText op 14px gewicht 500."
- "Bouw een functiekaart op Pure White (#ffffff) met 8px border-radius en schaduw rgba(0,0,0,0.12) 0px 4px 16px. Titel in UberMove op 24px gewicht 700, beschrijving in Body Gray (#4b4b4b) op 16px UberMoveText. Voeg onderaan een zwarte pil-CTA-knop toe."
- "Maak een donkere voettekst op Uber Black (#000000) met Pure White (#ffffff) koptekst in UberMove op 20px gewicht 700. Voettekstlinks in Muted Gray (#afafaf) op 14px UberMoveText. Links hoveren naar Pure White. Meerkolomsgrid-indeling."
- "Ontwerp een zwevende actieknop met Pure White (#ffffff) achtergrond, 999px radius, 14px opvulling en schaduw rgba(0,0,0,0.16) 0px 2px 8px. Hover verschuift achtergrond naar #f3f3f3. Gebruik voor naar-boven-scrollen of kaartbediening."

### Iteratiegids
1. Concentreer je op ÉÉN component tegelijk
2. Verwijs naar het strikte zwart/wit-palet -- "gebruik Uber Black (#000000)" niet "maak het donker"
3. Specificeer altijd 999px radius voor knoppen en pillen -- dit is niet onderhandelbaar voor de Uber-identiteit
4. Beschrijf de lettertypefamilie expliciet -- "UberMove Bold voor de kop, UberMoveText Medium voor het label"
5. Gebruik voor schaduwen "fluisterschaduw (rgba(0,0,0,0.12) 0px 4px 16px)" -- nooit zware slagschaduwen
6. Houd indelingen compact en informatiedicht -- Uber is efficiënt, niet luchtig
7. Illustraties moeten warm en menselijk zijn -- beschrijf "gestileerde mensen in warme tinten" niet abstracte vormen
8. Combineer zwarte CTA's met witte secundaire knoppen voor evenwichtige dubbele-actie-indelingen
