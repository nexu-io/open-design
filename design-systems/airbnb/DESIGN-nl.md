# Design System Inspired by Airbnb

> Category: E-Commerce & Detailhandel
> Reismarktplaats. Warm koraalaccent, fotografiegedreven, afgeronde interface.

## 1. Visueel Thema & Sfeer

Airbnbs ontwerp van 2026 voelt als een reistijdschrift dat toevallig een app is — makeloos witte doeken maken plaats voor volledigscherm fotografie, en de interface zelf verdwijnt zodat de listings kunnen ademen. De kenmerkende Rausch koraalroze (`#ff385c`) wordt spaarzaam maar onmiskenbaar gebruikt: zoek-CTA, actieve tab-indicator, primaire actieknop, en het occasionele prijslabel of wenslijst-hart. Al het andere is een gedisciplineerde grijsschaal, waarbij `#222222` bijna elke tekstregel draagt.

Wat het systeem onmiskenbaar Airbnb maakt, is hoeveel *vertrouwen* het in content stelt. Foto's van accommodaties worden op heroformaat weergegeven, 4:3 met een rand-aan-rand radiusbehandeling. Categoriewissel verloopt via een tri-tab-kiezer (Woningen / Ervaringen / Diensten) die 3D gerenderde geïllustreerde iconen gebruikt (een puntdakhuis, een heteluchtballon, een servicebel) — fysiek, tactiel, bijna speelgoedachtig — gecombineerd met scherpe `Airbnb Cereal VF`-labels. Dit is het zeldzame consumentenproduct waarbij 3D renders en puur typografische interface zonder spanning naast elkaar bestaan.

Het nieuwste oppervlak is de **Ervaringen**-productlijn — hetzelfde chroom, maar rijkere kaartdichtheid, meer fotografie en een centraal verankerd boekingspaneel met een vaste rechterrail voor de prijs. Detailpagina's van listings (zowel kamers als ervaringen) volgen een strak template: volledigscherm hero-afbeeldingsraster → overlappende afgeronde boekingskaart (vastgezet bij scrollen) → voorzieningen → beoordelingen (Gastfavoriet-awards gebruiken een grote gecentreerde `4.81`-beoordeling met een laurierkransopzet) → kaart → gastprofielpagina → openbaarmakingen. Het ritme is consistent, of u nu een kamer of een jachttour boekt.

**Kernkenmerken:**
- Rausch koraalroze (`#ff385c`) als enkelvoudige accentmerkkleur, alleen gebruikt voor primaire CTA's en de zoekknop
- Volledigscherm fotografie in 4:3 / 16:9 met zachte hoekafronding (14–20 px) als primair visueel vocabulaire
- 3D gerenderde categorieiconen gecombineerd met typografische tabs — de ene plek waar het systeem illustratie toestaat
- Ronde `50%` icoorknoppen (pijl terug, delen, favoriet, carrouselpijlen) verspreid door de interface
- `Airbnb Cereal VF` draagt elk label, van de juridische voetnoot van 8 px tot de sectiekopregel van 28 px — een eenfamilie-systeem
- Productlaag-kleurcodering: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (dieppaars `#460479`), Airbnb (Rausch koraal)
- Gastfavoriet-award-opzet — gecentreerd reusachtig beoordelingsnummer tussen twee laurierkransen, een van de meest herkenbare momenten in het systeem
- Vastgezet boekingspaneel met een prijs → datums → gasten-stapel, verankerd aan de rechterrail op desktop, getransformeerd naar een onderaan verankerde "Reserveer"-balk op mobiel
- Vaste onderste mobiele navigatie (Verkennen / Verlanglijsten / Inloggen) met een actieve Rausch-tint

## 2. Kleurenpalet & Rollen

### Primair
- **Rausch** (`#ff385c`): De kenmerkende koraalroze van het merk. CSS-variabele `--palette-bg-primary-core`. Gebruikt voor: primaire "Reserveer"-knop, zoekknop, actieve tab-onderstreping, wenslijst-hartopvulling, prijsnadruk. De kleur met de hoogste zichtbaarheid op elke pagina.

### Secundair & Accent
- **Deep Rausch** (`#e00b41`): Een meer verzadigde variant. CSS-variabele `--palette-bg-tertiary-core`. Gebruikt voor ingedrukte/actieve knoepstatussen en gradiënteindpunten.
- **Plus Magenta** (`#92174d`): CSS-variabele `--palette-bg-primary-plus`. De merkkleur voor de Airbnb Plus-productlaag — een hogere gecureerde listingaanbieding.
- **Luxe Purple** (`#460479`): CSS-variabele `--palette-bg-primary-luxe`. De merkkleur voor de Airbnb Luxe-productlaag — villa/landgoed-verhuur.
- **Info Blue** (`#428bff`): CSS-variabele `--palette-text-legal`. Gebruikt voor juridische/informatieve links (voorwaarden, privacy, openbaarmakingen) — de enige niet-monochrome linkkleur in het systeem.

### Oppervlak & Achtergrond
- **Canvas White** (`#ffffff`): De standaard paginaachtergrond. Elke kaart, elke container, elke detailpagina begint hier.
- **Soft Cloud** (`#f7f7f7`): Subtiele suboppervlaktetint gebruikt op voettekst-achtergronden, kaartweergave-wrappers en "alles-andere"-secties die terug willen treden van het primaire wit.
- **Hairline Gray** (`#dddddd`): Alomtegenwoordige 1-px-randkleur — scheidt kaarten, voorzieningenrijen, beoordelingspanelen, voettekstkolommen. Het werkpaard van het lay-outsysteem.

### Neutralen & Tekst
- **Ink Black** (`#222222`): CSS-variabele `--palette-text-primary`. Het bijna-zwart van het systeem. Elke koptekst, elke alinea, elk navigatielabel, elke prijs. Gebruikt voor ~90% van alle tekst op een pagina.
- **Charcoal** (`#3f3f3f`): CSS-variabele `--palette-text-focused`. Gebruikt in gefocuste invoertekst en nadrukstekst van één stap lager.
- **Ash Gray** (`#6a6a6a`): CSS-variabele `--palette-bg-tertiary-hover`. Secundaire labels, "Cottage-verhuur"-ondertitelstijl onder stadsnamen, gedempte voettekstlinks.
- **Mute Gray** (`#929292`): CSS-variabele `--palette-text-link-disabled`. Uitgeschakelde knoppen en lage-prioriteit metadata.
- **Stone Gray** (`#c1c1c1`): Tertiaire scheidingslijnen, icoonstroeken, plaatshouder-avatars.

### Semantisch & Accent
- **Error Red** (`#c13515`): CSS-variabele `--palette-text-primary-error`. Formuliervalidatiefouten, waarschuwingen voor destructieve acties.
- **Deep Error** (`#b32505`): CSS-variabele `--palette-text-secondary-error-hover`. Ingedrukte/actieve varianten van foutstatus.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): CSS-variabele `--palette-text-material-disabled`. Uitgeschakelde materiaalstijl-labels.

### Gradiëntensysteem
Airbnbs merkgradiënt verschijnt spaarzaam, typisch alleen op het woordmerk en het gebrandmerkte zoekknop-moment:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Deze koraal → magenta-sweep is het "gebrandmerkte moment" — nooit gebruikt als volledig oppervlak, alleen als smalle pilvulling of logobehandeling.

## 3. Typografieregels

### Lettertypefamilie
- **Airbnb Cereal VF** (primair en enig): Het gepatenteerde variabelgewicht sans-serif dat het hele systeem draagt. Fallbacks (in volgorde): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

In de geëxtraheerde tokens waargenomen gewichten: 500, 600, 700. Geen 400-regulier — het "broodtekst"-gewicht van het systeem is 500, wat elk tekstblok een subtiele extra dichtheid geeft die als zelfverzekerd en doordacht leest.

OpenType-functies: `salt` (stilistische alternatieven) wordt gebruikt op de compacte 11-px- en 14-px-600-gewichtslabels — waarschijnlijk voor nauwere cijfers en speciale-tekenvorming. Geen ligatuur- of gebroken-cijfer-functies waargenomen.

### Hiërarchie

| Rol | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|--------|-------------|----------------|-------|
| Sectiekop | 28 px / 1,75 rem | 700 | 1,43 | 0 | "Inspiratie voor toekomstige uitstapjes" — koppen op paginaniveau |
| Subsectiekop | 22 px / 1,38 rem | 500 | 1,18 | -0,44 px | "Wat deze plek biedt", "Maak kennis met de hosts" — inhoudsscheidingen |
| Kaarttitel | 21 px / 1,31 rem | 700 | 1,43 | 0 | Beoordelingspaneel koppen, hoofdtitels van kaarten |
| Listingtitel | 20 px / 1,25 rem | 600 | 1,20 | -0,18 px | "Kleine Groepsjachttour, Onbeperkte Wijn & Fruit" — listingkoppen op detailpagina's |
| Ondertitel Vet | 16 px / 1,00 rem | 600 | 1,25 | 0 | Hostnaam, stadsnaam |
| Broodtekst Medium | 16 px / 1,00 rem | 500 | 1,25 | 0 | Primaire broodtekst op detailpagina's |
| Knop Groot | 16 px / 1,00 rem | 500 | 1,25 | 0 | "Reserveer", "Word host" |
| Knop Standaard | 14 px / 0,88 rem | 500 | 1,29 | 0 | Standaard knooplabels |
| Link | 14 px / 0,88 rem | 500 | 1,43 | 0 | Navigatielinks, voettekstlinks |
| Bijschrift Medium | 14 px / 0,88 rem | 500 | 1,29 | 0 | Metadata, ondertitelregels ("Cottage-verhuur", "Villa-verhuur") |
| Bijschrift Vet | 14 px / 0,88 rem | 600 | 1,43 | 0 | `salt`-functie ingeschakeld — numerieke statistieken, kleintekst-nadruk |
| Bijschrift Klein | 13 px / 0,81 rem | 400 | 1,23 | 0 | Beoordelingsdatums, micro-metadata |
| Micro Standaard | 12 px / 0,75 rem | 400 | 1,33 | 0 | Voettekst-disclaimers, juridische micro-kopij |
| Micro Vet | 12 px / 0,75 rem | 700 | 1,33 | 0 | "NIEUW"-pillabels |
| Badge Hoofdletters | 11 px / 0,69 rem | 600 | 1,18 | 0 | `salt`-functie — compacte categorie-/statusbadges |
| Superscript | 8 px / 0,50 rem | 700 | 1,25 | 0,32 px | Hoofdletters — prijsvoetnoten, decimaalstaarten |

### Principes
- **Één familie, veel gewichten.** Airbnb Cereal VF behandelt alles van juridische tekst van 8 px tot paginakoppen van 28 px — de visuele identiteit komt uit de familie zelf, niet uit lettertype-mengen.
- **500 is het nieuwe 400.** Het "reguliere" gewicht van het systeem is 500, wat elke alinea een iets zelfverzekerder textuur geeft dan de webstandaard.
- **Negatieve tracking alleen bij displaytypen.** Koppen van 20 px en groter comprimeren de tracking met -0,18 tot -0,44 px om gebeiteld aan te voelen; broodtekstformaten blijven op 0 tracking voor leesbaarheid.
- **Strakke regelhoogten voor koppen, ruimhartig voor broodtekst.** Displaytypen draaien op 1,18–1,25 (strak); broodtekst en bijschriften openen naar 1,43 voor langvorm comfort.
- **Geen hoofdletters behalve op 8 px.** De enige hoofdlettertransformatie in het systeem is het 8-px-superscript — overal anders doet zinschrift met subtiele gewichtsverschuivingen het werk.

### Opmerking over Lettertype-substituten
Airbnb Cereal VF is gepatenteerd. Het dichtstbijzijnde open-source substituut is **Circular Std** (nog commercieel) of **Inter** (gratis, Google Fonts) met letterafstand verminderd met -0,01 em bij displayformaten. Voor strikte merkentrouw rendert de gedocumenteerde fallback-keten (`Circular, -apple-system, system-ui`) acceptabel op macOS/iOS waar `system-ui` wordt omgezet naar San Francisco, dat vergelijkbare proporties heeft.

## 4. Component-opmaak

### Knoppen

**Primaire CTA** ("Reserveer", "Zoeken", "Datums toevoegen")
- Achtergrond: Rausch `#ff385c`
- Tekst: Canvas White `#ffffff`, Airbnb Cereal 500, 16 px
- Opvulling: ~14 px verticaal, 24 px horizontaal
- Radius: 8 px (rechthoekig) of 50% (ronde icovariant)
- Rand: geen
- Actief/ingedrukt: `transform: scale(0.92)` plus een 2-px-`#222222`-focusring op `0 0 0 2px`

**Secundaire Knop** ("Word host", omrande tertiaire acties)
- Achtergrond: `#ffffff`
- Tekst: Ink Black `#222222`, Airbnb Cereal 500, 14–16 px
- Opvulling: 10 px 16 px
- Radius: 20 px (pil) of 8 px (rechthoekig)
- Rand: 1 px solid Hairline Gray `#dddddd`

**Alleen-icoon Ronde Knop** (pijl terug, delen, favoriet, carrouselbesturingen)
- Achtergrond: `#f2f2f2` (licht gebroken wit) of wit met 1-px transparante zwarte rand
- Icoon: `#222222` contourstreek, 16–20 px
- Grootte: 32–44 px diameter
- Radius: 50%
- Actief/ingedrukt: `transform: scale(0.92)`; subtiele 4-px witte ring `0 0 0 4px rgb(255,255,255)` om te scheiden van kleurrijke fotografieachtergronden

**Uitgeschakelde Knop**
- Achtergrond: `#f2f2f2`
- Tekst: Stone Gray `#c1c1c1`
- Doorzichtigheid: 0,5

**Piltab-knop** (categoriekiezer "Woningen / Ervaringen / Diensten")
- Achtergrond: transparant
- Tekst: Ink Black `#222222`, Airbnb Cereal 500, 16 px
- Opvulling: 8 px 14 px
- Actieve staat: 2-px Ink Black-onderstreping onder het label
- Gecombineerd met een 3D gerenderd geïllustreerd icoon van 36–48 px boven het label

### Kaarten & Containers

**Listingkaart** (beranda-raster, zoekresultaten)
- Achtergrond: `#ffffff`
- Radius: 14 px op de afbeelding, tekst zit direct eronder op transparante achtergrond
- Afbeelding: 4:3-beeldverhouding, volledig scherm, afgerond met dezelfde 14-px radius
- Opvulling: geen op de buitenste container; 12 px ruimte tussen afbeelding en metadatarijen
- Schaduw: geen — scheiding komt van witruimte en de intrinsieke radius van de foto
- Metadatapatroon: Stad/regio op regel 1 (16 px 600), afstand/duur op regel 2 (14 px 500 Ash Gray), datumbereik op regel 3, prijsregel met "per nacht" onderaan

**Detailpagina Boekingspaneel** (vaste rechterrail op kamer-/ervaringspagina's)
- Achtergrond: `#ffffff`
- Radius: 14–20 px
- Rand: 1 px solid Hairline Gray `#dddddd`
- Schaduw: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — een gestapelde drielaagse subtiele verhoging
- Opvulling: 24 px
- Breedte: ~370 px, vastgezet 120–140 px onder de bovenkant van de viewport
- Inhoud: prijskop → datumkiezer → gastenkeuzelijst → primaire CTA → voetnoot "U wordt nog niet in rekening gebracht"

**Voorzieningenraster-kaart** (op listingdetailpagina's)
- Achtergrond: `#ffffff`
- Rand: 1 px solid Hairline Gray `#dddddd` op rijniveau (niet per item)
- Opvulling: 16 px verticaal per voorzieningsrij
- Icoon + label-patroon: 24-px contouricoon links, 16-px-500-gewichtslabel rechts

**Beoordelingskaart** (individuele beoordeling op detailpagina's)
- Achtergrond: `#ffffff`, geen rand
- Opvulling: 0 (afhankelijk van rasterafstanden)
- Inhoud: 40-px ronde avatar + 16-px-600-gewichtsnaam + 14-px-400 Ash Gray datum op één rij, dan 14-px-500 broodtekstalinie eronder

### Invoer & Formulieren

**Zoekbalk** (primaire startpagina)
- Achtergrond: `#ffffff`
- Rand: 1 px solid Hairline Gray `#dddddd` om alle drie segmenten (Waar / Wanneer / Wie)
- Radius: 32 px (volledige pil)
- Schaduw: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — subtiel zwevend gevoel
- Structuur: drie segmenten gescheiden door dunne verticale scheidingslijnen, elk segment heeft een 12-px-500-label boven een 14-px-500-plaatshouder
- Verzenden: Rausch ronde icoknop aan de rechterrand, 48-px diameter

**Tekstinvoer** (generieke formulieren)
- Achtergrond: `#ffffff`
- Rand: 1 px solid Hairline Gray `#dddddd`
- Radius: 8 px
- Opvulling: 14 px 16 px
- Focus: rand schakelt over naar Ink Black, voegt `0 0 0 2px` zwarte buitenste ring toe
- Fout: rand schakelt over naar `#c13515` (Error Red), helptekst gebruikt dezelfde kleur

**Datumkiezer**
- Kalenderraster: 7-kolomindeling, ronde `50%` dagcellen 40–44 px breed
- Geselecteerd bereik: Ink Black `#222222` achtergrond met witte cijfers
- Start-/eindankers: grotere gevulde cirkels; middendatums gebruiken Soft Cloud `#f7f7f7`-tint

### Navigatie

**Bovenste Nav (Desktop)**
- Hoogte: ~80 px
- Achtergrond: `#ffffff`
- Links: Airbnb woordmerk+logo-opzet in Rausch (102×32 px)
- Midden: tri-tab categoriekiezer (Woningen / Ervaringen / Diensten) met 3D-iconen van 36–48 px gestapeld boven 16-px-500-labels; actieve tab heeft 2-px Ink Black-onderstreping
- Rechts: "Word host"-tekstlink, dan 32-px ronde bol (taal), dan 36-px hamburgermenu avatar
- Onderste rand: 1 px solid Hairline Gray `#dddddd`

**Bovenste Nav (Mobiel)**
- Eénregels zoekpil neemt de volledige breedte in: "Begin uw zoekopdracht"-plaatshouder met klein vergrootglas-icoon
- Eronder: tri-tab categoriekiezer blijft bestaan (Woningen / Ervaringen / Diensten) — geïllustreerde iconen krimpen naar ~28 px
- Onderaan vaste tabbar: Verkennen (actieve status Rausch) / Verlanglijsten / Inloggen — 24-px-iconen boven 12-px-labels

**Listing Detailpagina Secundaire Nav**
- Vaste horizontale scroll van ankerlinks (Foto's · Voorzieningen · Beoordelingen · Locatie · Host) verschijnt bij scrollen voorbij de hero-afbeelding
- Hoogte: 56 px
- Onderste rand: 1 px solid Hairline Gray

### Afbeeldingsbehandeling

- **Primaire beeldverhoudingen**: 4:3 voor listingrasters op de startpagina, 16:9 voor ervaring-herofotografie, 1:1 voor avatars
- **Radius**: 14 px op listingraster-afbeeldingen, 20 px op detailpagina-herofotoframes, `50%` op avatars
- **Afbeeldingsraster op detailpagina's**: vijf-foto-raster met één grote afbeelding links (50% breedte) en vier kleinere foto's in een 2×2-raster rechts, alle gedeeld in de buitenste afgeronde container van 20 px
- **Lazy loading**: intensief gebruik van `loading="lazy"` met vervaagde plaatshoudervoorbeelden
- **Carrousel**: ronde 32-px pijlknoppen overlappen de afbeelding, verticaal gecentreerd; puntindicatoren zitten 12 px boven de onderrand

### Kenmerkende Componenten

**Gastfavoriet-award-opzet** (prominent weergegeven op detailpagina's van listings met hoge beoordeling)
- Gecentreerd beoordelingsnummer weergegeven op 44–56 px met 700-gewicht
- Twee handgetekende laurierkrans-SVG-illustraties flankeren links en rechts op ~48 px hoogte
- Eronder: "Gastfavoriet"-label op 12 px 700 hoofdletters met `0,32 px`-tracking, en een kort sub-label op 14 px 500 Ash Gray
- Volledige breedte blok, geen containerrand — zit direct op wit canvas

**Tri-Tab Categoriekiezer** (verschijnt bovenaan elk bladeroppervlak)
- Drie tabs: Woningen / Ervaringen / Diensten
- Elke tab: 3D gerenderd geïllustreerd icoon (~48 px hoog) boven 16-px-500-label
- Ervaringen en Diensten dragen momenteel een kleine donkerblauwe "NIEUW"-pil (12-px-700 witte tekst op donkerblauwe achtergrond) zwevend rechtsboven het icoon
- Actieve tab: 2-px Ink Black-onderstreping onder het label

**Inspiratiestedenkader** (startpagina "Inspiratie voor toekomstige uitstapjes")
- 6-kolomsraster van bestemmingslinks op desktop, 2 kolommen op mobiel
- Elke cel: 16-px-600-stadsnaam op regel 1, 14-px-500 Ash Gray-verhuurtype-ondertitel op regel 2 ("Cottage-verhuur", "Villa-verhuur")
- Geen afbeeldingen — alleen-tekstraster
- Bovenaan met tabs per categorie (Populair / Kunst & cultuur / Strand / Bergen / Buiten / Activiteiten / Reistips & inspiratie / Airbnb-vriendelijke appartementen) — actieve tab heeft 2-px-onderstreping en gewichtsverschuiving

**Vaste Reserveerkaart** (listingdetailpagina's)
- Blijft vast 120 px onder de bovenkant van de viewport op desktop terwijl de gebruiker voorbij de hero scrolt
- Klapt in tot een volledigbreedte onderbalk op mobiel met een "Vanaf $X / nacht"-label en een Rausch-"Reserveer"-pil
- Altijd weergegeven: prijskop → datumweergave → gastenkiezer → Rausch CTA → disclaimer "U wordt nog niet in rekening gebracht"

**Ervaring Gastenkaart** (detailpagina's van ervaringen)
- Volledigbreedte afgeronde container met een 3:2 omslagfoto bovenaan
- Gastavatar (rond, 56 px) overlapt de onderrand van de omslag met 50%
- Onder de overlap: hostnaam op 16 px 700, hostervaring op 14 px 500 Ash Gray, kleine Rausch-"Bericht aan host"-pilknop
- Gebruikt als overgang tussen beoordelingen en het voorzieningen-/locatieblok

**"Wat u moet weten"-strip** (listingdetailpagina's)
- 3-kolomsraster van regel-/beleidsblokken (Huisregels, Veiligheid & eigendom, Annuleringsbeleid)
- Elke kolom: icoon bovenaan, 16-px-600-kop, 14-px-500 Ash Gray-broodtekst, "Meer weergeven"-link in Ink Black-onderstreping
- Scheidingslijn: 1-px Hairline Gray boven- en onderrand op de gehele strip

## 5. Lay-outprincipes

### Spatiëringssysteem
- **Basiseenheid**: 8 px
- **Geëxtraheerde schaal**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32 px — fijnkorrelig met een handvol off-raster-waarden voor pixelperfecte icoonautozetting
- **Sectie-opvulling**: ~48–64 px boven/onder op desktop, 24–32 px op mobiel
- **Kaart interne opvulling**: 24 px op boekingspanelen en grote kaarten, 16 px op voorzieningsrijen, 12 px op listingkaart-metadata
- **Tussenruimte tussen listingkaarten**: 24 px desktop, 16 px mobiel
- **Tussen gestapelde tekstrijen**: 4–8 px (zeer krap — versterkt het "dichte informatie"-gevoel van reislistings)

### Raster & Container
- **Maximale inhoudsbreede**: 1760–1920 px op ultrabreed (Airbnb laat het raster verder ademen dan de meeste sites); 1280 px op de meeste detailpagina's
- **Startpagina-listingraster**: 6 kolommen bij ≥1760 px, 5 bij ≥1440 px, 4 bij ≥1128 px, 3 bij ≥800 px, 2 bij ≥550 px, 1 eronder
- **Detailpagina**: 2-kolomsasymmetrisch — hoofdinhoud ~58%, vaste boekingspaneel ~36% rechts, ~6% tussenruimte
- **Voettekst**: 3 kolommen Ondersteuning / Hosting / Airbnb

### Witruimtefilosofie
Airbnb is informatief maar nooit benauwd. Witruimte wordt gebruikt om te *groeperen* — listingkaarten hebben 24 px tussenruimte zodat elke foto als een afzonderlijk object leest, maar de metadata onder elke kaart gebruikt 4–8 px-tussenruimten zodat prijs/stad/datum als één eenheid aanvoelt. Het detailpagina-boekingspaneel heeft 24 px interne opvulling, maar rijen daarbinnen (datumkiezer, gastenkiezer, CTA) zijn gestapeld op 12 px — de grens tussen de kaart en de pagina doet meer scheidingswerk dan de inhoud daarbinnen.

### Randradius-schaal
| Radius | Gebruik |
|--------|-----|
| 4 px | Inline ankertags, tag-chips |
| 8 px | Tekstknoppen, keuzelijsten, kleine hulpprogrammaknoppen |
| 14 px | Listingkaartfotografie, generieke inhoudscontainers, badges |
| 20 px | Primaire afgeronde knoppen (pilvorm), grote afbeeldingen, boekingspaneel |
| 32 px | Zoekbalk-pil, extra grote containers |
| 50% | Alle ronde icoorknoppen, alle avatars, wenslijst-harten — de kenmerkende ronde geometrie van het systeem |

## 6. Diepte & Verhoging

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| 0 | Geen schaduw | Listingkaarten, hoofdinhoud, alleen-tekst-secties |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Actieve/ingedrukte icoorknoppen (bijv. terug, delen, favoriet) — subtiele lift om interactie aan te geven |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Vaste boekingspaneel-kaart, modals, keuzelijstmenu's — de kenmerkende drielaagse verhoging van het systeem |
| Focusring | `0 0 0 2px #222222` | Actieve-statussknoppen, gefocuste zoekinvoer |
| Witte Scheidingsring | `rgb(255, 255, 255) 0 0 0 4px` | Ronde knoppen overlapt op foto's — een 4-px witte ring scheidt de knop netjes van kleurrijke afbeeldingsachtergronden |

Schaduwfilosofie: Airbnb gebruikt **gestapelde gelaagde schaduwen** in plaats van één enkele slagschaduw. De drielaagse boekingspaneel-schaduw leest als één samenhangende lift maar bestaat eigenlijk uit drie afzonderlijke schaduwen op verschillende dekking/vervagingswaarden — wat subtiele anti-aliasing creëert aan de omtrek van de schaduw die premium aanvoelt zonder zwaar te zijn.

### Decoratieve Diepte
- **Fotografie als diepte**: het systeem vertrouwt sterk op volledigschermfotografie om visuele diepte te creëren; schaduwen en gradiënten worden spaarzaam gebruikt zodat de foto's het zware werk doen
- **Laurierkransopzet**: de Gastfavoriet-award gebruikt twee SVG-laurierkransillustaties die het anderszins platte beoordelingsnummer een ceremoniële, trofeeachtige aanwezigheid geven
- **3D gerenderde categorieiconen**: de iconen voor Woningen/Ervaringen/Diensten hebben hun eigen zachte interne verlichting en subtiele gegoten schaduwen ingebakken in het artwork — de enige plek waar het merk "dimensionele" illustratie toestaat

## 7. Wat Wel en Wat Niet

### Wat Wel
- Reserveer Rausch `#ff385c` voor primaire acties en de actieve tab-indicator — verdun het nooit met decoratief gebruik.
- Laat fotografie ademen — 4:3-uitsneden met 14–20-px afgeronde hoeken, geen overlappende tekst, geen gradiëntschermen.
- Gebruik Ink Black `#222222` voor elke tekstlaag onder Rausch — dit is het bijna-zwart van het systeem, nooit echt `#000000`.
- Combineer de 3D-geïllustreerde iconen van de tri-tab categoriekiezer met platte typografie — meng geen illustratiestijlen binnen één enkel oppervlak.
- Stapel drie lage-dekking schaduwen (~2%, 4%, 10%) om de kenmerkende boekingspaneel-verhoging te creëren.
- Gebruik Hairline Gray `#dddddd` 1-px-randen voor elke kaart-naar-kaart- en rij-naar-rij-scheidingslijn.
- Behandel het boekingspaneel als vastgezet op desktop, inklappend naar een onderaan verankerde reserveringsbalk op mobiel.
- Gebruik 4–8-px-afstand binnen metadatagroepen en 24 px tussen kaarten — informatiedichtheid is opzettelijk.

### Wat Niet
- Voer geen secundaire accentkleuren in buiten het Rausch / Plus Magenta / Luxe Purple-productlaagpalet.
- Plaats geen tekst in foto's — bijschriften zitten altijd onder de afbeelding, nooit overlappend.
- Gebruik geen hoofdletterlabels behalve de enkele 8-px-superscript-rol.
- Rond icoorknoppen niet af tot iets anders dan 50% — cirkelvormig is de kenmerkende geometrie van het systeem.
- Voeg geen slagschaduwen toe aan listingkaarten — ze zitten op wit canvas zonder verhoging.
- Gebruik geen gradiëntachtergronden — de enige gradiënt in het systeem is een smalle Rausch → magenta sweep op het woordmerk.
- Gebruik het lettergewicht 400-regulier niet — het broodtekstgewicht van Airbnb Cereal is 500.
- Vervang Airbnb Cereal VF niet door een ander displaylettertype — het systeem is opzettelijk één familie.

## 8. Responsief Gedrag

### Breekpunten

Airbnb declareert ~60 breekpunten (ontwerptijdartefact van hun componentenbibliotheek), maar de betekenisvolle lay-outverschuivingen vinden plaats bij een veel kleinere set:

| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Ultra-breed | ≥1760 px | 6-kolomslistingraster, 1760–1920 px maximale inhoudsbreede |
| Desktop XL | 1440–1759 px | 5-kolomsraster, volledige nav zichtbaar, vaste boekingspaneel op de rechterrail |
| Desktop | 1128–1439 px | 4-kolomsraster, vaste boekingspaneel blijft bestaan |
| Laptop | 1024–1127 px | 3–4-kolomsraster, categorienavigatie blijft horizontaal |
| Tablet | 800–1023 px | 3-kolomsraster, globale zoekopdracht kan inklapten tot een enkele rijpil |
| Klein tablet | 550–799 px | 2-kolomsraster, boekingspaneel daalt naar volledigbreedte inline blok |
| Mobiel | 375–549 px | 1-koloms gestapelde indeling, onderaan vaste tabbar verschijnt (Verkennen / Verlanglijsten / Inloggen) |
| Klein mobiel | <375 px | Randopvulling trekt in naar 16 px; categoriekiezer-iconen krimpen naar ~28 px |

### Aanraakdoelen
Alle interactieve elementen voldoen aan of overschrijden 44×44 px. De ronde icoorknoopfamilie is specifiek 32–44 px groot met 8–12 px uitgebreide trefgebied-opvulling. De primaire Rausch Reserveer-knop is ~48 px hoog. Het trefgebied van de tri-tab categoriekiezer is het volledige label-plus-icoon rechthoek (typisch ~64×80 px per tab).

### Inklapstrategie
- **Nav**: Bovenste nav houdt Airbnb-woordmerk + tri-tab kiezer op tablet en groter; op mobiel schuift de kiezer net onder de zoekpil, en de bol-/avataronbesturingen verhuizen naar een onderaan verankerde tabbar.
- **Zoekbalk**: Driesegment-pil (Waar / Wanneer / Wie) met een ronde Rausch-verzendknop op desktop; klapt op mobiel in tot een eenregel "Begin uw zoekopdracht"-pil, waarop tikken een volledigscherm zoekblad opent.
- **Boekingspaneel**: Vaste rechterrail op ≥1128 px; inline binnen de hoofdinhoudskolom tussen 800–1127 px; onderaan vaste "Reserveer"-pil op <800 px.
- **Listingraster**: Doorloopt van 6 → 5 → 4 → 3 → 2 → 1 kolommen over breekpunten.
- **Detailpagina-afbeeldingsraster**: Vijf-afbeelding-indeling (1 groot + 4 klein) op desktop; wordt op mobiel een veegbaar volledigscherm carrousel met paginapuntindicatoren.
- **Voettekst**: 3-kolomsindeling klapt in naar gestapelde enkele kolom bij <800 px.

### Afbeeldingsgedrag
- `loading="lazy"` universeel, met vervaagde `im_w=`-URL-geparametriseerde voorbeeldminiaturen als eerste geserveerd
- Responsieve afbeeldingen gebruiken Airbnbs `muscache.com`-CDN met de `im_w`-queryparameter voor breedtegebaseerde levering (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Geen art-direction-uitsneden — dezelfde afbeelding wordt op/neer geschaald over breekpunten
- Carrousels passen de foto-hoogte automatisch aan om een consistente 4:3-verhouding te behouden ongeacht de bronverhouding

## 9. Agent-promptgids

### Snelle Kleurenreferentie
- Primaire CTA: "Rausch (#ff385c)"
- Paginaachtergrond: "Canvas White (#ffffff)"
- Suboppervlak: "Soft Cloud (#f7f7f7)"
- Kop-/broodtekst: "Ink Black (#222222)"
- Secundaire tekst: "Ash Gray (#6a6a6a)"
- Rand/scheidingslijn: "Hairline Gray (#dddddd)"
- Fout: "Error Red (#c13515)"
- Info-link: "Info Blue (#428bff)"
- Luxe-laag accent: "Luxe Purple (#460479)"
- Plus-laag accent: "Plus Magenta (#92174d)"

### Voorbeeld Componentprompts
- "Maak een primaire Reserveer-knop: Rausch (`#ff385c`) achtergrond, wit Airbnb Cereal 500-gewicht label op 16 px, 14 px × 24 px opvulling, 8 px border-radius, geen schaduw. Op actief/ingedrukt voeg `transform: scale(0.92)` toe met een 2-px Ink Black focusring (`0 0 0 2px #222222`)."
- "Bouw een listingkaart met een 4:3 volledigscherm foto op 14-px border-radius, geen containerschaduw; onder de afbeelding stapel drie tekstrijen met 4-px-tussenruimten: stadsnaam op 16 px 600 Ink Black, verhuurtype op 14 px 500 Ash Gray (`#6a6a6a`), en prijsrange in 16 px 500 Ink Black met een 14-px `per nacht` achtervoegsel."
- "Ontwerp een vast boekingspaneel: witte achtergrond, 14-px border-radius, 1-px Hairline Gray (`#dddddd`) rand, 3-laags verhogingsschaduw (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), 24-px opvulling, 370-px breedte, vastgezet 120 px onder de viewport-bovenkant op desktop. Inhoud: prijskop, datumkiezer, gastenkeuzelijst, Rausch primaire CTA, en een 12-px Ash Gray `U wordt nog niet in rekening gebracht` disclaimer."
- "Maak een tri-tab categoriekiezer: drie gelijkbrede tabs gelabeld Woningen, Ervaringen, Diensten; elke tab heeft een ~48-px 3D gerenderd geïllustreerd icoon (huis, ballon, bel) boven een 16-px-500 Ink Black label; actieve tab krijgt een 2-px Ink Black onderstreping; voeg een kleine 12-px-700 witte `NIEUW` pil toe op een donker marineblauwe achtergrond rechtsboven de Ervaringen- en Diensten-iconen."
- "Render de Gastfavoriet-award-opzet: een gecentreerd beoordelingsnummer op 52-px 700-gewicht Ink Black, geflankeerd links en rechts door handgetekende SVG-laurierkransen op ~48 px hoog; eronder een 12-px-700 hoofdletters `GASTFAVORIET`-label met 0,32-px tracking; sub-label op 14 px 500 Ash Gray; volledigbreedte blok direct op wit canvas zonder containerrand."

### Iteratiegids
Bij het verfijnen van bestaande schermen gegenereerd met dit ontwerpsysteem:
1. Richt u op ÉÉN component tegelijk.
2. Verwijs naar specifieke kleurnamen en hexcodes uit dit document (bijv. "Ink Black #222222", niet "donkergrijs").
3. Gebruik beschrijvingen in natuurlijke taal naast metingen ("subtiele drielaagse verhoging" in plaats van een lange schaduwstring).
4. Beschrijf het gewenste "gevoel" ("tijdschriftachtig, fotografie-eerst" vs. "dichte hulpprogramma").
5. Standaard altijd Airbnb Cereal VF 500-gewicht voor broodtekst en 600–700 voor nadruk — nooit 400.
6. Houd Rausch-roze schaars — als er meer dan één Rausch-gekleurd element per viewport verschijnt, overweeg of één geneutraliseerd moet worden.

### Bekende Lacunes
- **Startpagina-listingrasterkaarten**: het primaire vastgoedkaartenraster (het primaire visuele oppervlak van airbnb.com) werd niet volledig vastgelegd in de geëxtraheerde startpagina-schermafbeeldingen — inhoud laadde slechts gedeeltelijk. De bovenstaande Listingkaart-specificaties zijn afgeleid van de Inspiratierasterstructuur en de bredere conventies van Airbnb; bevestig exacte beeldverhoudingen en metadatahiërarchie met de live site voor productiegebruik.
- **Ervaringen-categorieiconen**: de 3D geïllustreerde iconen voor Woningen / Ervaringen / Diensten worden geserveerd als raster-assets; hun exacte bronbestandsspecificaties (SVG vs PNG, gerenderde pixelafmetingen) zijn hier niet gedocumenteerd.
- **Animatie- en overgangstimings**: niet vastgelegd — statische extractiebereik.
- **Donkere modus**: Airbnb levert geen native donkere modus in de geëxtraheerde productoppervlakken; dit document beschrijft alleen het enkele lichte-modus-thema.
