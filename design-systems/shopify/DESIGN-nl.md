# Ontwerpsysteem Geïnspireerd door Shopify

> Category: E-Commerce & Detailhandel
> E-commerce platform. Donker-eerst filmisch, neongroen accent, ultralight lettertype.

## 1. Visueel Thema & Sfeer

Shopify.com is een donker-eerst digitaal theater — een website die zijn commerce-platform inszeniert als een filmische première. De gehele ervaring ontvouwt zich tegen een afgrond van bijna-zwarte oppervlakken die het zachtste gefluister van diepdonkergroen dragen (`#02090A`, `#061A1C`, `#102620`), waarmee een nachtelijke atmosfeer ontstaat die minder aanvoelt als een SaaS-marketingpagina en meer als een exclusieve productpresentatie op een tech-keynote. Deze duisternis is niet koud of zakelijk — het is het warme, omhullende donker van een luxe-ervaring, zoals zitten op de eerste rij van een verduisterd auditorium.

De typografie is de onbetwiste ster. NeueHaasGrotesk — een verfijnde Helvetica-afstammeling — verschijnt op monumentale schaal (96px) met een onmogelijk licht gewicht (330-400), waardoor koppen ontstaan die gegraveerd lijken in licht in plaats van gedrukt in inkt. De `ss03` OpenType-functie geeft lettervormen een onderscheidend karakter dat Shopify's typografie scheidt van generiek Helvetica-gebruik. Onder de displaylaag behandelt Inter Variable bodytekst met chirurgische precisie, waarbij even ongewone variabele gewichten (420, 450, 550) worden gebruikt die leven in de ruimtes tussen traditionele gewichtstussenstops. Deze precisie geeft aan dat een bedrijf elk detail zorgvuldig afweegt.

Kleur wordt met extreme terughoudendheid gebruikt. Het primaire accent is Shopify Neongroen (`#36F4A4`) — een elektrische mint die exclusief verschijnt op focusringen en accenthighlights, pulserend als een bioluminescent signaal tegen het donkere canvas. Zachtere groentinten (Aloë `#C1FBD4`, Pistache `#D4F9E0`) zorgen voor sfeervolle wasbeurten. Wit is de enige tekstkleur die telt op donkere oppervlakken, terwijl een zinkgebaseerde neutrale schaal (`#A1A1AA` tot `#3F3F46`) de hiërarchie van stille informatie verzorgt. Het resultaat is een ontwerp dat commerce-technologie het gevoel geeft dat het thuishoort in een sciencefiction-toekomst.

**Belangrijkste Kenmerken:**
- Donker-eerst ontwerp met diep bosgroen-teal ondertonen (niet puur zwart)
- Ultralight display-typografie (gewicht 330) op monumentale schaal (96px) die een etherische aanwezigheid creëert
- Neongroen (`#36F4A4`) als het enige hoogenergetische accent tegen duisternis
- Full-pill knoppen (9999px straal) als de primaire interactieve vorm
- Gelaagde, meerfasige box-shadows die fotografische diepte creëren
- Productschermafbeeldingen ingebed in donkere UI-contexten, passend bij de omringende duisternis
- Zinkgebaseerde neutrale schaal voor teksthiërarchie — gebalanceerd tussen warm en koel

## 2. Kleurenpalet & Rollen

### Primair

- **Shopify Wit** (`#FFFFFF`): Primaire tekst op donkere oppervlakken, knoopvullingen, elementen met hoog contrast
- **Shopify Zwart** (`#000000`): Achtergrond van de body, knooptekst op wit, maximale contrastbasis (--color-shade-100)

### Secundair & Accent

- **Neongroen** (`#36F4A4`): Het kenmerkende accent — focusringen, interactieve highlights, indicatoren van actieve toestand. Elektrisch en bioluminescent
- **Aloë** (`#C1FBD4`): Zachte groene was voor decoratieve achtergronden, sfeervolle kaarten (--color-aloe-10)
- **Pistache** (`#D4F9E0`): Lichtste groentint voor subtiele oppervlaktedifferentiatie (--color-pistachio-10)

### Oppervlak & Achtergrond

- **Void** (`#000000`): Hoofdpagina-achtergrond — echt zwart voor maximale diepte
- **Diep Teal** (`#02090A`): Kaartoppervlakken, inhoudscontainers — bijna-zwart met groene ondertoon
- **Donker Bos** (`#061A1C`): Sectie-achtergronden met zichtbaar groen karakter
- **Bos** (`#102620`): Verhoogde donkere oppervlakken, koptekstachtergronden — de warmste donkere tint
- **Donkere Kaartrand** (`#1E2C31`): Kaandranden op donkere oppervlakken, subtiele grensdefinitie

### Neutrals & Tekst (Zinkschaal)

- **Shade-30** (`#D4D4D8`): Lichtste neutraal, nauwelijks zichtbare randen op donker (--color-shade-30)
- **Gedempte Tekst** (`#A1A1AA`): Secundaire tekst, metadata, beschrijvingen — de stille stem
- **Shade-50** (`#71717A`): Tertiaire tekst, tijdstempels, minst belangrijke informatie (--color-shade-50)
- **Shade-60** (`#52525B`): Uitgeschakelde tekst, decoratieve neutrals (--color-shade-60)
- **Shade-70** (`#3F3F46`): Subtiele scheidingslijnen, nauwelijks zichtbare UI-grenzen (--color-shade-70)
- **Lichte Rand** (`#E4E4E7`): Randen op lichte oppervlakken (zeldzaam — alleen in lichte-modus modals)

### Semantisch & Accent

- **Gedempte Link** (`#9797A2`): Gedempte linktekst met onderstrepingdecoratie
- **Salie Link** (`#9DABAD`): Teal-getinte gedempte links
- **Lavendel Link** (`#BDBDCA`): Lichtere linkvariant
- **Munt Link** (`#99B3AD`): Groen-getinte linkvariant voor thematische secties

### Verloopsysteem

- **Donkere Teal Was**: Radiaal verloop van `#102620` centrum naar `#02090A` rand — gebruikt achter productpresentaties
- **Groen Atmosferisch**: Subtiele groengetinte ambient-verlopen achter hero-secties, die diepte creëren zonder effen kleuren
- **Spotlight**: Gefocust helder gebied dat vervaagt naar zwart — creëert keynote-stijl presentatieverlichting

## 3. Typografische Regels

### Lettertypefamilie

**Display:** NeueHaasGrotesk (verfijnde Helvetica-afstammeling, variabel lettertype)
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType-functies: `ss03` (stilistische set 3 — onderscheidende lettervorm-alternatieven)
- Beschikbare gewichten: 330, 360, 400, 500, 750 (variabel)
- Gebruikt voor alle koppen, hero-tekst en grote display-elementen

**Body:** Inter-Variable
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType-functies: `ss03`
- Beschikbare gewichten: 400, 420, 450, 500, 550 (variabel)
- Gebruikt voor bodytekst, links, knoppen, UI-elementen

**Mono:** ui-monospace
- Fallbacks: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Gebruikt voor codefragmenten, gegevenslabels, technische inhoud

### Hiërarchie

| Rol | Grootte | Gewicht | Regelhoogte | Letterafstand | Notities |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, hero-koppen, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, nadruk display |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, gespatieerd display |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, etherisch display |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, sectietitels |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, subsecties |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, functietitels |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, kaartkoppen |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, kleine koppen |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, kleine koppen |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, inleidende alinea's |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, standaard body |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, benadrukte body |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, compacte body |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, licht benadrukt |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, CTA-tekst |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, navigatie-items |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadata |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, benadrukt onderschrift |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, breed-gespatieerde labels |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, strak-gespatieerde kleine tekst |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, hoofdletter-labels |
| Code | 16px | 400 | 1.50 | — | ui-monospace, hoofdletters, codeblokken |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, hoofdletters, inline-code |

### Principes

Shopify's typografie is een meesterklasse in variabele lettertypeprecisie. De displaylaag leeft bijna uitsluitend op gewichten 330-400 — veergewicht tekst die lijkt te zweven boven de donkere achtergrond als geprojecteerd licht. Dit is het tegenovergestelde van de vette, zware aanpak die de meeste SaaS-sites hanteren: waar anderen schreeuwen, fluistert Shopify op schaal. De 96px-koppen op gewicht 330 creëren een paradox van enorme omvang en delicate streek die zowel monumentaal als fragiel aanvoelt. De `ss03` OpenType-functie activeert een stilistische set die aan specifieke tekens (waarschijnlijk 'a', 'g' en bepaalde cijfers) een verfijnder uiterlijk geeft, waardoor Shopify's typografie zich onderscheidt van standaard Helvetica Neue-gebruik. Inter Variable behandelt de bodylaag met chirurgische precisie, waarbij gewichten als 420 en 550 worden gebruikt die tussen de traditionele stops bestaan — elk stuk tekst heeft precies het visuele gewicht dat het nodig heeft.

## 4. Componentstijlen

### Knoppen

**Primair (Wit Gevuld)**
- Achtergrond: Wit (`#FFFFFF`)
- Tekst: Zwart (`#000000`)
- Rand: 2px solid transparant
- Randstraal: volledige pill (9999px)
- Opvulling: 12px 26px 12px 16px (asymmetrisch — meer rechterruimte voor visuele balans)
- Hover: lichte opaciteitsvermindering of achtergrondverschuiving
- Focus: 2px `#36F4A4` (Neongroen) omtrekring
- Overgang: all 200ms ease

**Secundair (Ghost/Omlijnd)**
- Achtergrond: transparant
- Tekst: Wit (`#FFFFFF`)
- Rand: 2px solid Wit (`#FFFFFF`)
- Randstraal: volledige pill (9999px)
- Opvulling: 12px 26px 12px 16px
- Hover: vult naar witte achtergrond met zwarte tekst
- Focus: 2px `#36F4A4` omtrek

**Badge/Tag (Neutraal Gevuld)**
- Achtergrond: `rgba(255, 255, 255, 0.2)` (bevroren glas)
- Tekst: Wit (`#FFFFFF`)
- Rand: geen
- Randstraal: subtiel afgerond (4px)
- Opvulling: 12px 16px
- Lettertype: 16px normaal

### Kaarten & Containers

- Achtergrond: Diep Teal (`#02090A`) op donkere pagina's
- Rand: 1px solid `#1E2C31` (Donkere Kaartrand) — nauwelijks zichtbare grens
- Randstraal: 8px voor standaardkaarten, 12px voor uitgelichte kaarten, 20px 20px 0 0 voor bovenaf afgeronde kaarten
- Schaduw: Meerlaagsysteem:
  - Rustend: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - De inset witte highlight creëert een subtiele bovenkantgloed
- Hover: schaduw vergroot, kaart kan lichtjes oplichten
- Overgang: box-shadow 300ms ease, transform 200ms ease

### Invoervelden & Formulieren

- Achtergrond: transparant of Donker Bos (`#061A1C`)
- Tekst: Wit (`#FFFFFF`)
- Rand: 1px solid `#3F3F46` (Shade-70)
- Randstraal: 8px
- Opvulling: 12px 16px
- Focus: 2px solid `#36F4A4` (Neongroen focusring)
- Placeholder: Shade-50 (`#71717A`)
- Overgang: border-color 200ms ease

### Navigatie

- Achtergrond: transparant (over donkere hero), wordt Bos (`#102620`) bij scrollen
- Hoogte: ~64px
- Links: Shopify woordmerk-logo (SVG, wit op donker)
- Midden/Rechts: navlinks in 18px/500 NeueHaasGrotesk, wit, letterafstand 0.72px
- CTA: Witte pill-knop "Start for free" (rechts)
- Secundaire CTA: Ghost-knop met witte rand
- Hover: links verschuiven naar Gedempte Tekst (`#A1A1AA`) of krijgen onderstreping
- Mobiel: hamburgermenu, volledig scherm donkere overlay
- Overgang: background 300ms ease bij scrollen

### Beeldbehandeling

- Productschermafbeeldingen: ingebed in donkere UI-contexten, passend bij de omringende duisternis
- Beheerdersinterface-voorbeelden: getoond op donkere achtergronden met subtiele kaartranden
- Beeldverhoudingen: gevarieerd — hero-afbeeldingen zijn breed (16:9-achtig), functie-opnamen zijn flexibel
- Alle afbeeldingen zitten vlak in donkere containers — geen heldere randen of kaders
- Lui laden met donkere tijdelijke oppervlakken

### Vertrouwensindicatoren

- Statistieken prominent weergegeven: "15+" (jaar), "150M+" (kopers)
- Getallen op displayschaal in NeueHaasGrotesk
- Secties voor partner-/ontwikkelaarsecosysteem
- Donkergekleurde getuigenissen geïntegreerd in de paginastroom

## 5. Lay-outprincipes

### Afstandssysteem

Basiseenheid: 8px

| Token | Waarde | Gebruik |
|-------|-------|-----|
| space-1 | 4px | Krappe inline-tussenruimten |
| space-2 | 8px | Basiseenheid, pictogramtussenruimten |
| space-3 | 12px | Kaartopvulling, krappe marges |
| space-4 | 16px | Standaard elementopvulling |
| space-5 | 24px | Kaarttussenruimten, sectieopvulling |
| space-6 | 28px | Gemiddelde sectie-afstand |
| space-7 | 32px | Sectieonderbrekingen |
| space-8 | 36px | Grote opvulling |
| space-9 | 40px | Grote sectie-opvulling |
| space-10 | 64px | Hero-sectieopvulling, grote tussenruimten |

### Raster & Container

- Maximale containerbreedte: ~1280px (gecentreerd)
- Hero: volledig breed, rand-tot-rand donkere achtergrond met gecentreerde tekst
- Functiesecties: 2-koloms lay-outs met tekst en productschermafbeeldingen
- Statssecties: horizontale lay-out met grote getallen
- Horizontale opvulling: 64px desktop, 32px tablet, 16px mobiel
- Rastergap: 24-32px tussen grote inhoudsblokken

### Witruimtefilosofie

Shopify's witruimtestrategie is theatraal. Secties worden gescheiden door uitgestrekte vlakken van donkere ruimte — 80px tot 120px van pure zwarte ademruimte — die het tempo van een presentatie creëren, niet van een webpagina. Elk inhoudsblok is zijn eigen "dia" in een keynote-stijl scroll. Binnen secties is de tussenruimte strakker en bewuster, waardoor focusdichtheid ontstaat tegen de uitgestrekte leegte. Het contrast tussen macro-leegte en micro-precisie is wat de site zijn filmische cadans geeft.

### Randstraalschaal

| Waarde | Context |
|-------|---------|
| 4px | Tags, badges, micro-elementen |
| 8px | Standaardkaarten, invoervelden, videocontainers |
| 12px | Uitgelichte kaarten, afbeeldingscontainers, knoppen (niet-pill) |
| 20px | Bovenaf afgeronde kaarten (20px 20px 0 0), modal-kopteksten |
| 340px | Grote afgeronde decoratieve elementen |
| 9999px | Pill-knoppen, pill-badges, nav-elementen |

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Basis | Geen schaduw, donker oppervlak | Standaard pagina-achtergrond |
| Subtiel | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + inset witte gloed | Rustende kaarten |
| Gemiddeld | Meerlaags: 1px ring + 2px + 4px + 8px schaduwstapel | Verhoogde kaarten, uitgelichte secties |
| Hoog | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modals, dropdowns, overlays |
| Focus | `0px 0px 0px 2px #36F4A4` | Toetsenbordfocusring (Neongroen) |

Shopify's schaduwsysteem is ongewoon geavanceerd. In plaats van enkelvoudige schaduwwaarden gebruiken kaarten een gestapelde, meerlaagse aanpak: een 1px-ring voor grensdefinitie, 2px/4px/8px progressieve vervagingen voor natuurlijke lichtval, en een delicate inset witte gloed (`rgba(255,255,255,0.03)`) die een bovenbelicht glasoppervlak simuleert. Op donkere achtergronden verduisteren schaduwen vanuit al donkere oppervlakken, waardoor de schaduwen meer als "ambient occlusion" functioneren dan als traditionele elevatie — de kaart lijkt lichtjes in het oppervlak te zakken in plaats van erboven te zweven.

### Decoratieve Diepte

- **Donkere teal-verlopen**: Ambient radiale wasbeurten achter hero-secties en productpresentaties
- **Spotlighteffecten**: Heldere gecentreerde gebieden die vervagen naar zwart, wat keynote-stijl theatrale verlichting creëert
- **Randgloed**: Subtiele lichtgekleurde randen op donkere kaarten via inset box-shadow
- **Groene atmosferische halo's**: Zwakke groentinten in achtergrondverlopen, als echo van het merkaccent

## 7. Doe's en Don'ts

### Doe

- Gebruik de donkere teal-zwart oppervlaktehiërarchie (Void → Diep Teal → Donker Bos → Bos) voor diepte
- Houd display-typografie op gewicht 330-400 — de etherische lichtheid is de handtekening van het ontwerp
- Gebruik Neongroen (`#36F4A4`) uitsluitend voor focustoestanden en kritische accenthighlights
- Pas 9999px-straal toe op alle primaire CTA-knoppen — de volledige pill is niet onderhandelbaar
- Gebruik het meerlaagse schaduwsysteem voor kaartelevatie — enkelvoudige schaduwen zien er vlak uit
- Behoud de `ss03` OpenType-functie bij alle tekst — het maakt deel uit van de typografische identiteit
- Gebruik Inter Variable voor bodytekst en NeueHaasGrotesk voor koppen — verwissel hun rollen nooit
- Creëer theatrale tussenruimten tussen secties (80px+) voor filmisch tempo

### Don't

- Gebruik geen puur zwart (#000000) voor tekst op donkere achtergronden — gebruik alleen wit (#FFFFFF)
- Introduceer geen warme kleuren (oranje, rood, geel) — het palet is strikt koel (groenen, teals, neutrals)
- Gebruik geen lettergewichten boven 500 voor NeueHaasGrotesk-bodytekst — zware gewichten breken het etherische gevoel
- Pas geen groene accenten toe op grote oppervlakken — Neongroen is alleen voor kleine, precieze highlights
- Gebruik geen scherpe hoeken (0px straal) op interactieve elementen — alles wordt afgerond
- Voeg geen heldere achtergronden toe — het donkere thema is fundamenteel, niet optioneel
- Gebruik geen enkelvoudige box-shadows — de gestapelde aanpak is het systeem
- Stel de regelhoogte niet in boven 1.56 voor bodytekst — Shopify's tekst is relatief compact
- Meng NeueHaasGrotesk en Inter niet op dezelfde grootte/rol — hun gewichtsschalen verschillen
- Gebruik geen letterafstand onder 0 voor koppen — Shopify-koppen volgen neutraal of positief spatiëren

## 8. Responsief Gedrag

### Breekpunten

| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Mobiel | <640px | Enkele kolom, hamburgernav, displaytekst schaalt naar 48px, 16px opvulling |
| Tablet | 640-1024px | 2-kolomsrasters beginnen, displaytekst op 70px, 32px opvulling |
| Desktop | 1024-1440px | Volledige lay-out, uitgebreide nav, 96px display, 64px opvulling |
| Groot Desktop | >1440px | Max-breedte container gecentreerd, verhoogde sectie-afstand |

### Aanraakdoelwitten

- Minimaal aanraakdoelwit: 44x44px (WCAG AAA)
- Pill-knoppen: minimaal 48px hoogte met ruime horizontale opvulling
- Navlinks: 44px aanraakgebied
- Kaartoppervlakken: volledige kaart is aanklikbaar waar gelinkt

### Samenvalstrategie

- **Navigatie**: Volledige horizontale links → hamburgermenu onder 1024px; logo en CTA-knop blijven zichtbaar
- **Hero-sectie**: 96px display → 70px op tablet → 48px op mobiel; behoudt enkelvoudige-kolom centrering
- **Functiesecties**: 2-koloms tekst+afbeelding → gestapelde enkelvoudige kolom onder 768px
- **Stats**: Horizontale rij → gestapeld verticaal op mobiel
- **Sectieopvulling**: 64px → 40px → 24px → 16px naarmate het viewport smaller wordt
- **Kaarten**: Raster → stapel, volledig breed behouden op mobiel

### Beeldgedrag

- Productschermafbeeldingen: responsief binnen donkere containers, beeldverhouding behouden
- Hero-afbeeldingen: volledig breed op alle breekpunten, lui geladen met donkere tijdelijke aanduidingen
- Beheerdersinterface-voorbeelden: schalen proportioneel, kunnen bijsnijden op mobiel
- Alle afbeeldingen gebruiken CDN (`cdn.shopify.com`) met responsieve srcset

## 9. Agent-promptgids

### Snelle Kleurverwijzing

- Primaire CTA: Shopify Wit (`#FFFFFF`)
- Pagina-achtergrond: Void Zwart (`#000000`)
- Kaartoppervlak: Diep Teal (`#02090A`)
- Sectie-achtergrond: Donker Bos (`#061A1C`)
- Verhoogde achtergrond: Bos (`#102620`)
- Accent: Neongroen (`#36F4A4`)
- Bodytekst: Wit (`#FFFFFF`)
- Gedempte tekst: Gedempt (`#A1A1AA`)
- Donkere rand: Donkere Kaartrand (`#1E2C31`)

### Voorbeeldcomponentprompts

- "Maak een hero-sectie op echt zwarte (#000000) achtergrond met een 96px/330 NeueHaasGrotesk-koptekst in wit, een 20px/500 ondertitel in #A1A1AA, en twee pill-knoppen: wit gevuld (9999px straal) en ghost met 2px witte rand"
- "Ontwerp een functiekaart op Diep Teal (#02090A) met 1px #1E2C31 rand, 12px straal, meerlaagse schaduw (1px ring + 2px/4px/8px vervaging bij 10% zwart), met een 32px/360 witte kop en 18px/400 #A1A1AA bodytekst"
- "Bouw een statssectie op Donker Bos (#061A1C) met 96px/750 witte getallen (NeueHaasGrotesk), 16px/400 #A1A1AA beschrijvende labels, en ruime 64px-tussenruimte tussen statblokken"
- "Maak een plakkerige nav met transparante achtergrond (wordt #102620 bij scrollen), wit Shopify-logo links, 18px/500 witte navlinks met 0.72px letterafstand, en een witte pill-knop 'Start for free' rechts"
- "Ontwerp een tag/badge met rgba(255,255,255,0.2) bevroren glas-achtergrond, 4px straal, 12px 16px opvulling, witte 16px tekst — zwevend boven een donker kaartoppervlak"

### Iteratiegids

Bij het verfijnen van bestaande schermen die zijn gegenereerd met dit ontwerpsysteem:
1. Focus op ÉÉN component tegelijk
2. Verwijs naar specifieke kleurnamen en hex-codes uit dit document
3. Onthoud: dit is een DONKER-EERST ontwerp — lichte oppervlakken zijn de uitzondering, niet de regel
4. Displaytekst moet altijd licht aanvoelen (gewicht 330-400) — als het er zwaar uitziet, verlaag het gewicht
5. Neongroen (#36F4A4) is kostbaar — gebruik spaarzaam voor focus en accent alleen
6. De donkere oppervlaktehiërarchie (zwart → diep teal → donker bos → bos) creëert subtiele diepte
7. Schaduwen zijn meerlaags — een enkele `box-shadow`-waarde zal het Shopify-kaartgevoel niet vastleggen
8. `ss03` OpenType-functie moet actief zijn op alle tekst voor typografische consistentie
