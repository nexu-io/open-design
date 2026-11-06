# Design System Inspired by PlayStation

> Category: Media & Entertainment
> Gaming console retail. Drievlaks-kanaalindeling, rustig-gezaghebbend display-lettertype, cyaan hover-schaalvergroting.

## 1. Visueel Thema & Sfeer

PlayStation.com presenteert zich als de marketingtak van een premium consumentenelektronicamerk dat toevallig ook entertainment verkoopt. De pagina is georganiseerd als een **verticaal kanaal van afwisselende vlakken**: een bijna-zwarte masthead en hero, een reeks papierechte redactionele panelen in het midden, en een diepkobaltblauwe footer die de gehele ervaring verankert. Tussen die vlakken leunt de site zwaar op fotografie en 3D-productrenders — de PS5-console, game-coverart, DualSense-controllers — zodat de hardware het emotionele werk doet terwijl het visuele kader ingetogen blijft.

De kenmerkende typografische keuze is **SST Light (gewicht 300) op grote formaten**. Sony's eigen SST-familie wordt gebruikt van 22px tot 54px in gewicht 300, waardoor display-koppen een gefluisterde, elegante kwaliteit krijgen die dichter bij een advertentie voor een luxehorloge voelt dan bij een gamewinkel. Die "rustige autoriteit" is het exacte tegendeel van The Verge's Manuka-schreeuw of Wired's krantenstanddichtheid — PlayStation wil dat het lettertype terugwijkt en het product de leiding neemt. Body en UI leunen op gewichten 500–700, maar de *display*-stem is consequent dun en kalm.

De enige plek waar ingetogenheid losgelaten wordt, is **interactie**. Elke primaire knop heeft dezelfde hover-beweging: de vulling wisselt naar een elektrisch cyaan `#1eaedb`, een 2px witte rand verschijnt, een 2px PlayStation-blauwe buitenring bloeit erachter op, en de gehele knop **schaalt omhoog met 1,2×**. Die combinatie van kleurpop, rand, ring en liftschaal is een kenmerkende beweging die uniek is aan Sony onder grote merken — een miniatuur "power-on"-animatie die de site honderden keren herhaalt op één enkele pagina.

**Belangrijkste kenmerken:**
- Drievlaks-kanaalindeling: bijna-zwarte hero, papierchitte content, kobaltblauwe footer — afwisselend, nooit vermengend
- SST gewicht 300 op 22–54px voor display — "rustig gezaghebbende" koppen die productfotografie de leiding geven
- PlayStation Blue `#0070cc` als merkanker; cyaan `#1eaedb` uitsluitend gereserveerd voor hover/focus-staten
- Elk interactief element schaalt 1,2× bij hover — een kenmerkende "power-on"-lift uniek aan PlayStation
- Pill-knoppen op volledig 999px-radius; card-art in afgeronde rechthoeken van 12–24px
- Commerce-oranje `#d53b00` uitsluitend gebruikt voor PlayStation Store / koop-CTA's
- Brede breekpuntdekking tot 2120px — de site schaalt helemaal mee naar 4K-tv-browse-contexten

## 2. Kleurenpalet & Rollen

### Primair (Merkanker)
- **PlayStation Blue** (`#0070cc`): De ankerkleur van het merk. Gebruikt op de primaire footer, inline links, primaire knoppen op donkere vlakken en elke "officiële" markering. Behandel dit als onveranderlijk — het is de kleur waarmee het merk het sterkst geassocieerd wordt in het consumentengeheugen.
- **Console Black** (`#000000`): Puur zwart voor de masthead, hero-achtergronden en productpresentatiezones. PlayStation gebruikt zwart om hardware te omlijsten zoals een museum zwart gebruikt om een sculptuur te omlijsten.

### Secundair & Accent
- **PlayStation Cyan** (`#1eaedb`): De interactiekleur. UITSLUITEND toegepast op hover-, focus- en actieve staten van knoppen en links. Verschijnt nooit als standaardachtergrond of als rustende tekstkleur. Combineer met een 2px `#ffffff`-rand en een 2px `#0070cc` buitenring bij hover voor de volledige kenmerkende behandeling.
- **Link Hover Blue** (`#1883fd`): De helderder variant gebruikt op inline-tekstlink-hovers. Verschilt van Cyaan — dit is de linkkleur, Cyaan is de knopkleur.
- **Dark Link Blue** (`#0068bd`): De linkkleur in rust op lichte vlakken — een iets meer verzadigde neef van het merkblauw.

### Vlak & Achtergrond
- **Paper White** (`#ffffff`): Primair inhoudscanvas voor redactionele panelen tussen masthead en footer.
- **Ice Mist** (`#f5f7fa`): Het atmosferische eindpunt van het lichte sectieverloop. Subtiel gebruikt achter bepaalde panelen om ze van puur wit te laten loskomen.
- **Divider Tint** (`#f3f3f3`): De rustige horizontale-lijnkleur tussen inhoudsrijen.
- **Masthead Black** (`#000000`): Bovenste navigatie en hero-canvas — gereserveerd voor product-vooropgestelde zones.
- **Shadow Black** (`#121314`): Het startanker van het donkere sectieverloop wanneer een paneel atmosferische diepte nodig heeft.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Doorschijnende achtergrond gebruikt achter plakkerige filterbalkjes — het enige "glassmorphism"-moment op de site.

### Neutralen & Tekst
- **Display Ink** (`#000000`): Primaire display-koppen op witte vlakken.
- **Deep Charcoal** (`#1f1f1f`): Bodykoppen en linkkleur in rust — iets zachter dan puur zwart om visuele ruis bij grote blokken te verminderen.
- **Body Gray** (`#6b6b6b`): Secundaire bodytekst en metadata.
- **Mute Gray** (`#cccccc`): Tertiaire labels, uitgeschakelde staten.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Formulier-placeholdertekst — 60% zwart, geen aparte grijswaarde.
- **Inverse White** (`#ffffff`): Primaire tekst op donkere en blauwe vlakken.
- **Dark-Link Blue** (`#53b1ff`): De linkkleur in rust op donkere/zwarte vlakken — een lichtere, luchtige variant van PlayStation Blue voor leesbaarheid op zwart.

### Semantisch & Commerce
- **Commerce Orange** (`#d53b00`): Gereserveerd voor PlayStation Store-koop-CTA's, prijsaanduidingen en "in aanbieding"-badges. De enige warme kleur op de site — spaarzaam gebruiken en nooit buiten een commerce-context.
- **Commerce Orange Active** (`#aa2f00`): De ingedrukte/actieve staat van commerce-knoppen.
- **Warning Red** (`#c81b3a`): Formulierfouten en waarschuwingen voor destructieve acties.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Het dramatische scherm achter herotext op productfotografie.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Lichtgewicht elevatielijn op kaarten.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Vederlichte kaartelevatie — nauwelijks zichtbaar maar scheidt witte panelen van witte achtergrond.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): De lichtste schaduw in het systeem.

### Verloopsysteem
PlayStation gebruikt **twee sectieverlopen** en niets anders:
- **Licht sectieverloop**: van `#ffffff` → `#f5f7fa` — een bijna-onmerkbare was die een paneel rustig van het canvas laat loskomen.
- **Donker sectieverloop**: van `#121314` → `#000000` — een korte verticale was die heropanelen een subtiele vignette geeft zonder kleurverschuiving te introduceren.

Beide verlopen worden **uitsluitend als sectieachtergronden** gebruikt, nooit binnen componenten. Er zijn geen verlooopknoppen, geen verloooptekst, geen gloeiende halo's. Het merk is blauw — niet blauw-naar-paars, niet blauw-naar-cyaan.

## 3. Typografieregels

### Lettertypen
- **SST** / **Playstation SST** (Sony, eigendomsrechtelijk beschermd) — terugval: `Arial`, `Helvetica`. Sony's aangepaste wereldwijde lettertype, ontworpen door Toshi Omagari en Akira Kobayashi. Dekt gewichten 300 / 500 / 600 / 700 over de startpagina. Het gewicht **300 op 22–54px** is PlayStation's typografische handtekening.
- **SST (condensed / alternate)** — terugval: `helvetica`, `arial`. Een gecomprimeerde variant gebruikt in een handvol UI-modules waar breedte telt.
- **Arial** — nutsterugval voor de zeldzame knopvariant die in systeem-sans wordt weergegeven.

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterafstand | Opmerkingen |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Het grootste SST-moment op de pagina — rustig-gewicht luxekop |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Secundaire herokoppen |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Feature-panelkoppen |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Sectiekoppen |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Moduletitels — nog steeds in lichtgewicht 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Promotionele subkop |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Compacte UI-koppen |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Primair knoplabel |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | Hogere-nadruk-CTA's (kopen, abonneren) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Secundair knoplabel |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Standaard leestekst |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Inline linktekst |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini-CTA's in kaarten |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Bijschriften, taginscripties |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Standaard metadata |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Benadrukt bijschrift |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Semi-vet bijschrift |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | UI-knop met compacte regelafstand |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Tab/pill-label |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Kleinste UI-bijschrift |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Footer-microtekst, juridische tekst |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Benadrukte microtekst |

### Principes
- **Gewicht 300 op grote formaten is de stem.** PlayStation is het enige grote consolemerk dat een lichtgewicht display gebruikt voor herokoppen. Weersta de neiging om display-type te "upgraden" naar 500 of 700 — de stilte ís de persoonlijkheid.
- **Gewichtssprong op de UI-laag.** Onder 18px verschuift het systeem naar 500–700 voor leesbaarheid. Het gewichtsverloop van 300 (display) → 400 (body) → 500 (bijschriften) → 700 (knoppen) is de hiërarchie.
- **Letterafstand is nauwelijks aanwezig.** De meeste waarden zijn 0.1–0.45px, positief of licht negatief. De `-0.1px` op de 54px-hero comprimeert het display-type net genoeg om als "ontworpen" te lezen zonder typografische verklaring te worden.
- **Twee SST-varianten.** "SST" en "Playstation SST" zijn functioneel dezelfde familie met iets andere metrische sets (Playstation SST is compacter op kleine formaten). Behandel ze als uitwisselbaar voor doeleinden buiten Sony's interne licenties.
- **Geen hoofdletters.** Anders dan The Verge of Wired gebruikt PlayStation zelden HOOFDLETTER-labels. Kickers en tags blijven in titelcaps of zinnecaps — nog een "rustige autoriteit"-beweging.
- **Nergens een schreeflettertype.** Het gehele systeem is schreefloos. Er is geen tegengewicht in drukstem.

## 4. Componentstijlen

### Knoppen

**Primair — PlayStation Blue Pill**
- Achtergrond: `#0070cc` (PlayStation Blue)
- Tekst: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Rand: geen in ruststand
- Randradius: `999px` — volledige pill
- Padding: ~`12px 24px` (variabel afhankelijk van maatklasse)
- Omtrek: `rgb(255, 255, 255) none 0px` in ruststand
- **Hover (kenmerkende beweging)**:
  - Achtergrond vult naar `#1eaedb` (PlayStation Cyan)
  - Tekst blijft `#ffffff`
  - 2px `#ffffff`-rand verschijnt
  - 2px `#0070cc` buitenring-schaduw bloeit op (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — de knop groeit daadwerkelijk 20%
- Actief: `opacity: 0.6` — een korte dimming om indrukken aan te geven
- Focus: Hetzelfde als hover, maar de ring wordt `rgb(0, 114, 206) 0px 0px 0px 2px` focusschaduw
- Overgang: ~180ms ease op achtergrond, transformatie en schaduw

**Secundair — Witte omtrek op donker**
- Achtergrond: `#ffffff`
- Tekst: `#0172ce` (PlayStation Blue-variant)
- Rand: `2px outset #000000` — een echte `outset`-rand, wat extreem zeldzaam is in moderne CSS
- Radius: varieert (vaak `999px` of `36px`)
- Padding: `16px 20px`
- Hover: dezelfde kenmerkende cyaanvulling + scale(1.2) + ringbehandeling
- Focus: dezelfde ringbehandeling

**Commerce Orange**
- Achtergrond: `#d53b00` (Commerce Orange)
- Tekst: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Randradius: `999px` — pill
- Uitsluitend gebruikt op PS Store / Kopen / Subscribe Plus-CTA's
- Actief: achtergrond donkert naar `#aa2f00`
- Hover: volgt de cyaan-omkerregel zoals alle andere knoppen (GEEN oranjespeficieke hover)

**Transparante Ghost**
- Achtergrond: transparant
- Tekst: `#1f1f1f` (Deep Charcoal)
- Rand: `1px solid #dedede`
- Padding: `0 10px` (compact, navigatiegeoptimaliseerd)
- Hover: cyaanvulling, witte tekst, 2px witte rand, scale(1.2)
- Actief: tekst verschuift naar `#0072ce`, opacity 0.6

**Pictogramcirkel**
- Achtergrond: `rgba(0, 0, 0, 0.2)` op fotografie; `#ffffff` op lichte vlakken
- Randradius: `100%` — perfecte cirkel
- Gebruikt voor carrousel-vorige/volgende-pijlen en deelknoppen
- Hover: lichter naar `var(--color-role-backgrounds-primary-link-hover)` (ruwweg `#e5e5e5` op licht)

**Mini-CTA (in kaart)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Radius: `999px`
- Gebruikt in gamekaarten voor "Nu kopen" / "Aan winkelwagen toevoegen" mini-CTA's

### Kaarten & Containers

**Herokaart (Game Feature)**
- Achtergrond: fotografie/render — doorgaans zwart verankerd
- Randradius: `24px` of `19px` voor feature-kaarten
- Padding: 32–48px binnenruimte
- Schaduw: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — een dramatische slagschaduw uitsluitend gebruikt wanneer een kaart over de herofotografie heen valt
- Hover: subtiele schaaltransformatie, cyaan omtrek verschijnt op primaire CTA

**Game Cover-tegel**
- Achtergrond: game-coverart, zonder padding
- Randradius: `12px` of `13px` (afbeeldingen) / `19px` (kaartkader)
- Schaduw: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — vederlichte elevatie
- Hover: de primaire CTA van de kaart licht op in cyaan, de kaart zelf kan 1,02× schalen
- Overgang: 200ms ease op transformatie

**Inhoudspaneel (Wit)**
- Achtergrond: `#ffffff` of het lichte sectieverloop `#ffffff → #f5f7fa`
- Rand: doorgaans geen; gescheiden van buren door spatiëring en subtiele schaduwen
- Radius: `12px`–`24px` afhankelijk van paneelhiërarchie
- Schaduw: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — de lichtste in het systeem

**Donkere kaart op donker**
- Achtergrond: `rgba(0, 0, 0, 0.2)` over fotografie
- Randradius: `6px` (compact) of `24px` (feature)
- Gebruikt voor "persdossier"- of "statistiekenblok"-inlays over herovideo

### Invoervelden & Formulieren
- **Standaard**: `#ffffff`-achtergrond, `1px solid #cccccc`-rand, `3px` randradius (strakker dan de rest van het systeem — invoervelden zijn de enige plek waar PlayStation echt compact wordt), SST 16px tekst in `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: 2px `#0070cc` focusring via `box-shadow: 0 0 0 2px #0070cc`. Geen randkleurwijziging — de ring doet het werk.
- **Fout**: rand en tekst wisselen naar `#c81b3a` (Warning Red), inline fouttekst eronder in dezelfde rood.
- **Overgang**: ~180ms ease op rand en schaduw.

### Navigatie

- **Bovenste navigatie**: zwarte (`#000000`) volbreedte-balk met het PlayStation-logo (wit) links uitgelijnd, categorielinks gecentreerd in SST 14–16px / 500, en een kleine "Aanmelden"-CTA rechts uitgelijnd.
- **Hover op navigatielink**: kleur gaat over van `#ffffff` naar `#1883fd` (Link Hover Blue), geen onderstreping.
- **Actieve sectie**: gemarkeerd door een subtiele 2px onderstreping in `#0070cc`.
- **Mobiel**: navigatie klapt in tot een hamburgerladen. Binnen de lade stapelen links verticaal met 16px tussenruimte en 20px horizontale opvulling.
- **Plakgedrag**: de navigatie blijft boven vastgespijkerd bij scrollen; wanneer deze een licht-vlakzone ingaat **keert deze niet om** — hij blijft zwart-gebackde door alles heen.

### Beeldbehandeling

- **Beeldverhoudingen**: 16:9 herovideo/fotografie, 1:1 console-renders, 3:4 game-coverart, 4:3 lifestyle-beelden.
- **Hoeken**: afgerond naar `12px`, `13px`, of `24px` afhankelijk van kaartcontext. Game-covers krijgen `6–12px`, heroimages krijgen `24px`.
- **Volbreedte**: uitsluitend in de masthead-hero en footer-reclamebalkjes. Al het andere zit binnen een gepaddede inhoudskolom.
- **Schaduw**: dramatische `rgba(0, 0, 0, 0.8) 0 5px 9px 0` slagschaduw op heroes, veder `rgba(0, 0, 0, 0.06) 0 5px 9px 0` op rastertegels.
- **Hover**: afbeelding blijft statisch, het kaartkader en de primaire CTA reageren.
- **Lazy loading**: `loading="lazy"` op alles onder de vouw, `eager` op de masthead-hero.

### Gamewinkel-pill (Onderscheidend)
- Achtergrond: `#ffffff`
- Tekst: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — volledige pill
- Een neutrale pill-tag naast game-covers om het platform te labelen ("PS5", "PS4", "PSVR2"). Wit-op-donker contrast.

## 5. Indelingsprincipes

### Spatiëringssysteem
- **Basiseenheid**: 8px.
- **Schaal**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Sectieopvulling**: 48–96px verticaal tussen grote panelen. Hero-naar-inhoud-overgangen gebruiken het hogere einde.
- **Kaartopvulling**: 20–32px binnenruimte. Feature-herokaarten kunnen uitbreiden naar 48px.
- **Inline-spatiëring**: 8–12px tussen kop en deck, 12–16px tussen deck en CTA.
- **Microschaal**: De waarden 1/2/3/4.5/5/9/10/12 worden gebruikt voor pill-padding, bijschriftspatiëring en randverschuivingen — niet voor redactioneel ritme.

### Raster & Container
- **Maximale breedte**: ~1920px (dembrandt detecteerde breekpunten tot 2120px). Containerlimieten doorgaans rond `1280–1920px` afhankelijk van het paneel.
- **Kolompatronen**: 12-kolomsresponsief raster dat oplost in 3/4/6-koloms-gamestegelrijen afhankelijk van hiërarchie. Herozones beslaan vaak 12 kolommen; uitgelichte tegels zitten in 6+3+3 of 4+4+4-configuraties.
- **Buitenopvulling**: 16px mobiel → 48px tablet → 64–96px desktop.
- **Kolommarge**: 16–24px tussen kolommen, strakker (8–12px) binnen tegelclusters.

### Witruimtefilosofie
PlayStation behandelt witruimte zoals een luxemerk winkelverlichting behandelt — als een premiumsignaal. Er is merkbaar meer verticale ademruimte tussen modules dan op enige andere grote retailsite, en de witte redactionele panelen bevatten vaak slechts één kop + één afbeelding + één CTA op hero-schaal opvulling. Het effect is een "galerietempo" waarbij elk product zijn eigen ruimte krijgt in plaats van te concurreren in een raster van miniaturen.

### Randradiusschaal
- **2px** — cookiebannerknopppen en kleine admin-UI
- **3px** — invoervelden, tabpanelen (strakker dan al het andere — een bewuste "functionele UI"-aanwijzing)
- **6px** — compacte knoppen en inline-afbeeldingen
- **12px** — standaard game-coverafbeeldingen en inhoudsafbeeldingen
- **13px** — bepaalde figuuromhulsels (1px-verschuiving van 12px voor nesting)
- **19px** — feature-kaarten
- **20px** — inline-tagspans
- **24px** — herokaarten, primaire feature-kaders
- **36px** — volledige pill-navigatie en secundaire knopvarianten
- **48px** — grote feature-knoppen
- **999px / 100%** — volledige pill-primaire knoppen en cirkelvormige pictogramknoppen

Elf afzonderlijke radiuswaarden — een van de rijkste radiussystemen van elke site in deze catalogus. Het bereik bestaat omdat PlayStation bewust verschillende radii gebruikt voor verschillende *hiërarchieën*: 3px voor hulpfuncties, 12px voor media, 24px voor features, 999px voor CTA's.

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|---|---|---|
| 0 | Geen schaduw | Standaardinhoud op `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Vederlichte redactionele paneellift |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Standaard rastertegel-elevatie |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Benadrukte kaart (hover of actief) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Hero-overlay-schaduw — dramatische slagschaduw gebruikt over fotografie |
| 5 | `0 0 0 2px #0070cc` (focusring) | Primaire knopfocusstatus |
| 6 | `0 0 0 2px #000000` (hoverring) | Secundaire knophovertring |
| 7 | Sectieverloop `#121314 → #000000` | Atmosferische diepte op donkere heropanelen |

PlayStation's dieptefilosofie is **gelaagd maar ingetogen**. De schaduwschaal loopt van 0.06 tot 0.16 voor normale staten, springt daarna naar 0.8 voor herodruppels — er is geen 0.2, 0.3, 0.4 middenmoot. Het effect is dat de meeste pagina bijna plat blijft, maar wanneer een herokaart over fotografie moet zweven, *zweeft* hij echt. Elevatie wordt of gefluisterd of geschreeuwd, nooit gemompeld.

### Decoratieve Diepte
- **Sectieverlopen** (donker en licht, beiden hierboven beschreven) — uitsluitend gebruikt als sectieachtergronden
- **Focus/hoverrings** op 2px, altijd blauw of cyaan afhankelijk van staat
- **Geen gloeiers, vervaging of atmosferische effecten** buiten de twee sectieverlopen
- **Geen verlooopknoppen of -tekst** — het visuele systeem is overal egale kleurblokken behalve bij sectieovergangen

## 7. Wel & Niet Doen

### Wel Doen
- **Gebruik** PlayStation Blue (`#0070cc`) als primaire CTA-vulling en footer-anker. Het is de ankerkleur van het merk.
- **Gebruik** SST gewicht 300 voor elke display-kop van 22px en groter. De rustig-gewicht kop is de stem.
- **Pas** de volledige hoverhandtekening toe op elke primaire knop: cyaanvulling + 2px witte rand + 2px blauwe buitenring + `scale(1.2)`.
- **Gebruik** volledige pill-radius (`999px`) op primaire en commerce-knoppen.
- **Reserveer** PlayStation Cyan (`#1eaedb`) uitsluitend voor hover-, focus- en actieve staten — nooit als rustende achtergrond.
- **Gebruik** Commerce Orange (`#d53b00`) uitsluitend op PlayStation Store / aankoop-CTA's en prijsaanduidingen.
- **Wissel** donkere heropanelen af met witte inhoudspanelen en verankerd met een diepblauwe footer — de drievlaks-kanaalindeling is het paginritme.
- **Gebruik** dramatische `rgba(0, 0, 0, 0.8)` hero-slagschaduwen wanneer een kaart over productfotografie valt.
- **Houd** de bovenste navigatie zwart op elke scrollpositie — hij keert niet om naar wit boven lichte panelen.

### Niet Doen
- **Maak** display-koppen niet vet. Gewicht 300 op 22–54px is de PlayStation-stem. Gewicht 700-display-type leest als "een andere gameretailer".
- **Gebruik** geen HOOFDLETTER-labels of kickers. PlayStation gebruikt zelden hoofdletters — het is een rustig-gezaghebbend merk, geen gevaarband.
- **Gebruik** geen verlooopknoppen, -tekst of -achtergronden buiten de twee gedeclareerde sectieverlopen.
- **Introduceer** geen warme kleuren buiten Commerce Orange. Geen rode CTA's, geen gele markeringen, geen groene succesbadges.
- **Gebruik** geen rechte hoeken op knoppen of media. Het systeem heeft elf radii — kies er een, maar nooit `0`.
- **Sla** de `scale(1.2)`-hoverbeweging op primaire knoppen niet over. De liftschaal is een merkinteractiehandtekening.
- **Gebruik** geen schreeflettertype. Het systeem is 100% SST schreefloos.
- **Laat** cyaan `#1eaedb` niet verschijnen als tekst- of achtergrondkleur in rust. Het bestaat alleen in beweging.
- **Ontwerp** geen panelen die om aandacht strijden. PlayStation's witruimtritme geeft elke module zijn eigen "galerieruimte".

## 8. Responsief Gedrag

### Breekpunten

| Naam | Breedte | Belangrijkste Wijzigingen |
|---|---|---|
| Small Mobile | <400px | Enkelvoudige kolom, navigatie klapt in tot hamburger, SST-hero schaalt naar ~28px |
| Mobile | 400–599px | Enkelvoudige kolom, tegels stapelen volbreedte, opvulling opent naar 16px |
| Large Mobile | 600–767px | Nog enkelvoudige kolom maar 2-kolomstegeloptie in bepaalde modules |
| Tablet Portrait | 768–1023px | 2-kolomsgameraster, navigatie nog ingeklapt |
| Tablet Landscape | 1024–1279px | 3–4-kolomsraster, volledige navigatie hersteld |
| Desktop | 1280–1599px | Volledig redactioneel raster, maximale herodisplayscaal (44–54px) |
| Large Desktop | 1600–1919px | Container begrenst op 1600px, marges breiden uit |
| 4K / Big-Screen | ≥1920px | Container breidt uit naar maximaal 1920px, heroinhoud schaalt mee voor tv-kijkafstand |
| Ultra-Wide | ≥2120px | Extreem breekpunt — pagina blijft verankerd, buitenmarges absorberen extra breedte |

De dembrandt-sweep detecteerde 30 breekpunten tussen 320px en 2120px — een ongewoon breed responsief bereik. PlayStation stemt specifiek af op **grootbeeldschermcontexten** (1920–2120px) omdat PS5-eigenaren de site regelmatig op tv's bekijken via de consolebrowser of via casten-naar-tv vanuit een telefoon. De meeste retailsites stoppen met afstemmen op 1440px; PlayStation blijft afstemmen tot 4K.

### Aanraakdoelwitten
- Primaire pill-knoppen zijn ~48–56px hoog (SST 18px tekst + ~12–16px verticale opvulling) — comfortabel WCAG AAA.
- Navigatielinks zijn kleiner (~32–40px hoog) op desktop; op mobiel worden ze opgevuld naar 48px+ binnen de lade.
- Pictogramcirkelknoppen zijn 40–48px — aanraakvriendelijk.

### Inklappingstrategie
- **Navigatie**: volledige navigatie → ingeklapt → hamburgerladen naarmate het venster smaller wordt. Logo blijft links vastgespijkerd; CTA blijft rechts vastgespijkerd.
- **Raster**: 6-koloms → 4-koloms → 3-koloms → 2-koloms → 1-koloms. Gametegel-kaarten herstromen zonder cover-art bij te snijden.
- **Spatiëring**: sectieopvulling comprimeert van 96px → 64px → 48px → 32px → 24px naarmate het venster smaller wordt.
- **Lettertype**: SST-hero schaalt van 54px → 44px → 35px → 28px → 22px. Het lichtgewicht 300 wordt op elke maat bewaard.
- **Herofotografie**: art-directionwissel — desktop gebruikt brede 16:9-uitsnedes, mobiel gebruikt 4:3- of 1:1-uitsnedes met het product gecentreerd.

### Afbeeldingsgedrag
- Responsief raster (`srcset` + `<picture>` met art-direction), beeldverhoudingen bewaard per breekpunt.
- 4K-klaar: de site levert hoge-dichtheidsbeelden bij 1920px+ om upscaling bij tv-browsen te vermijden.
- `loading="lazy"` op alles onder de vouw; hero is `eager` met een preload-hint.

## 9. Agent Prompt-gids

### Snelle kleurverwijzing
- **Primaire CTA**: "PlayStation Blue (`#0070cc`)"
- **Hover / Focus-accent**: "PlayStation Cyan (`#1eaedb`)"
- **Achtergrond (Wit vlak)**: "Paper White (`#ffffff`)"
- **Achtergrond (Donker vlak)**: "Console Black (`#000000`)"
- **Koptekst op wit**: "Display Ink (`#000000`)"
- **Bodytekst op wit**: "Deep Charcoal (`#1f1f1f`)"
- **Bodytekst op zwart**: "Inverse White (`#ffffff`)"
- **Commerce / Koopaanduid**: "Commerce Orange (`#d53b00`)"
- **Footer-anker**: "PlayStation Blue (`#0070cc`)"

### Voorbeeldcomponentprompts
1. *"Maak een primaire CTA-knop met een `#0070cc` PlayStation Blue-vulling, witte tekst in SST 18px / 500 / 0.4px tracking, 999px randradius, 12px × 24px opvulling. Bij hover gaat de achtergrond over naar `#1eaedb` PlayStation Cyan, verschijnt een 2px `#ffffff`-rand, bloeit een 2px `#0070cc` buitenring op via box-shadow, en schaalt de gehele knop 1,2× — alles in een 180ms ease-overgang."*
2. *"Ontwerp een heropaneel op een `#000000` Console Black-canvas met een 54px SST gewicht 300-kop in `#ffffff` met -0.1px letterafstand en 1.25 regelafstand. Plaats één primaire CTA eronder met de standaard PlayStation-hoverbehandeling. Nergens HOOFDLETTER-labels."*
3. *"Bouw een game-covertegel: 3:4-beeldverhouding met 12px randradius, vederlichte `rgba(0, 0, 0, 0.08) 0 5px 9px 0` slagschaduw, een 14px SST 700-titel eronder, een 12px SST 500-platformtag, en een mini-14px / 700 / 0.324px tracking-primaire CTA in PlayStation Blue."*
4. *"Maak een commerce-pill-knop voor een PlayStation Store-aankoop: `#d53b00` Commerce Orange-vulling, `#ffffff`-tekst in SST 18px / 700 / 0.45px tracking, 999px-radius, 12px × 28px opvulling. Actieve staat donkert naar `#aa2f00`. Hover volgt de standaard cyaan-omkeer met 1,2× schaal."*
5. *"Ontwerp een wit inhoudspaneel tussen donkere herosecties: `#ffffff`-achtergrond met het subtiele `#ffffff → #f5f7fa` lichte sectieverloop, 24px randradius, 48px binnenopvulling, vederlichte `rgba(0, 0, 0, 0.06) 0 5px 9px 0` elevatie, een 35px SST 300-kop, een 18px bodyparagraaf en één primaire CTA."*

### Iteratiegids
Bij het verfijnen van bestaande schermen gemaakt met dit ontwerpsysteem:
1. **Controleer displaygewicht.** Elke kop van 22px en groter moet SST gewicht 300 zijn. Als je gewicht 500 of 700 op heroschaal ziet, ben je de PlayStation-stem kwijt.
2. **Controleer de hoverbehandeling.** Elke primaire knop moet 1,2× schalen bij hover met de cyaanvulling + witte rand + blauwe ring combinatie. Mis er één van die vier en de interactiehandtekening breekt.
3. **Controleer hoeken.** Elke container en knop moet uitkomen op 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 of 999px / 100%. Rechte hoeken breken de stem.
4. **Controleer kleurverspreiding.** Alleen PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) en de gedeclareerde grijzen/zwarten/witten mogen in het chrome verschijnen. Als je een andere tint ziet, corrigeer die.
5. **Controleer vlakafwisseling.** De pagina moet afwisselen: donkere hero → witte inhoud → donkere hero → witte inhoud → blauwe footer. Als twee gelijkaardig-vlakpanelen naast elkaar staan, voeg een overgang in.
6. **Controleer hoofdlettergebruik.** Uitsluitend zinnecaps en titelcaps. Geen HOOFDLETTER-labels, knoppen of kickers. Als je hoofdletters ziet, converteer die.
7. **Controleer schaduwgewicht.** Schaduwdoorzichtigheid moet uitkomen op 0.06 / 0.08 / 0.16 / 0.8 — niets daartussenin. Als je 0.1, 0.2, 0.3, 0.5 slagschaduwen ziet, corrigeer naar de dichtstbijzijnde gedeclareerde laag.
8. **Controleer witruimte.** Als twee modules "concurrerend" aanvoelen (strijden om aandacht), voeg 48–96px verticale ademruimte toe. PlayStation's galerietemporitme is niet onderhandelbaar.
