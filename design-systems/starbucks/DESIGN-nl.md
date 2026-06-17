# Ontwerpsysteem Geïnspireerd door Starbucks

> Category: E-commerce & Retail
> Wereldwijd koffiemerk. Viertrapps groen systeem, warm crèmekleurig canvas, volronde knoppen.

## 1. Visueel Thema & Sfeer

Het ontwerpsysteem van Starbucks is een **warm, zelfverzekerd retailvlagschip** dat de groene kleur van hun schort op elke oppervlakte draagt. Het canvas wisselt af tussen een neutraal-warme crème (`#f2f0eb`) en een keramisch gebroken wit (`#edebe9`) — kleuren die verwijzen naar echte winkelmateriaal: de papieren servetten, de cafémuren, de houten afwerkingen — terwijl het kenmerkende **Starbucks Groen** (`#006241`) het merkanker vormt op heldbanden, CTA's en de Rewards-ervaring. De groenen zijn beschikbaar in vier gekalibreerde tinten (Starbucks, Accent, House, Uplift), elk toegewezen aan een specifieke oppervlakterol, en goud (`#cba258`) verschijnt uitsluitend bij Rewards-statusceremonies — niet als algemeen accent.

Typografie draagt het grootste deel van de merkstem. Het propriëtaire **SoDoSans**-lettertype (exclusief voor Starbucks) staat op vrijwel elke oppervlakte met een strak `-0.16px` letterafstand — het oogt zelfverzekerd en vriendelijk in plaats van modeblad-streng. Wat opvalt: de Rewards-pagina schakelt naar een warm schreeflettertype (`"Lander Tall", "Iowan Old Style", Georgia`) voor specifieke koptekstmomenten, wat subtiel de nostalgische sfeer van een koffiehuis-krijtbord oproept. En de Careers-pagina's gebruiken een handschriftlettertype (`"Kalam", "Comic Sans MS", cursive`) voor persoonlijke bekernaaminvullingen. Drie lettertypen, drie contexten — het systeem hanteert strakke regels over wanneer elk verschijnt.

De oppervlakten ademen door afgeronde geometrie. Elke knop is een 50px volronde pil. Kaarten hebben een afronding van 12px. De zwevende "Frap"-CTA — een cirkelvormige bestelknop van 56px in Green Accent (`#00754A`) — is de kenmerkende dieptestap van het product: hij zweeft rechtsonder met een gelaagde schaduwstapel (`0 0 6px rgba(0,0,0,0.24)` basis + `0 8px 12px rgba(0,0,0,0.14)` omgevend) en comprimeert via `scale(0.95)` bij indrukken. Elevaties zijn verder ingetogen — kaartschaduwen blijven op een gefluisterde `0.14/0.24` alpha, de globale navigatie krijgt een rustige drielaagse schaduwstapel. Het hele systeem voelt aan als helder cafébordwerk: leesbaar, warm en nooit schreeuwend.

**Belangrijkste Kenmerken:**
- Viertrapps groen merkensysteem (Starbucks / Accent / House / Uplift), elk toegewezen aan een aparte oppervlakterol — niet één enkel "merkgroen"
- Goud uitsluitend gereserveerd voor Rewards-statusmomenten; nooit een universeel accent
- Warm-neutraal canvas (`#f2f0eb` / `#edebe9`) in plaats van koud wit — verwijst naar cafématerialen
- Exclusief propriëtair lettertype (SoDoSans) met strak `-0.16px` letterafstand als universele stem
- Contextspecifieke letterwissels: schreef (Lander Tall) voor Rewards, script (Kalam) voor Careers-bekernames
- Volronde knoppen (`50px` radius) universeel, `scale(0.95)` actieve druk als kenmerkende micro-interactie
- Zwevende "Frap"-ronde CTA (`56px`, Green Accent vulling, gelaagde schaduwstapel) — het kenmerkende elevatielement van het product
- Cadeaukaartoppervlakten ontworpen als **gefotografeerd fysiek product** — elke kaart is een afzonderlijke geïllustreerde foto, geen gegenereerde afbeelding
- 12px kaartafronding + fluisterzachte schaduwen houden inhoudskaarten vlak-plus-een-vleugje-lift
- Rem-gebaseerde ruimteschaal verankerd op 1,6rem (~16px) = `--space-3`, oplopend tot 6,4rem (~64px)

**Kleurblok paginaopbouw:** Crème held → Witte inhoudsecties → Donkergroen (`#1E3932`) kenmerkenband met witte tekst → Crème bruikbaarheidszone → Donkergroen (`#1E3932`) voettekst met goud/witte tekst — een espresso-donkere boeking rond het heldere hoofddeel.

## 2. Kleurenpalet & Rollen

**Geanalyseerde bronpagina's:** startpagina, rewards, cadeaukaarten, productdetail (Pink Energy Drink), productvoeding (Cold Brew).

### Primair

- **Starbucks Green** (`#006241`): Het historische merkgroen. Gebruikt voor h1-koppen, primaire sectiekoppen op de Rewards-pagina en als het hoofdmerksignaal waar één dominante kleur nodig is.
- **Green Accent** (`#00754A`): Een iets helderder, meer lumineus groen. De primaire gevulde-CTA-kleur ("Explore our afternoon menu", "See the spring menu") en de vulling van de zwevende ronde Frap-knop.
- **House Green** (`#1E3932`): Het diepe bijna-zwarte merkgroen. Voettekstoppervlak, kenmerkenbanachtergronden, reward-statusdonkere oppervlakken en de koptekst "Free coffee is just the beginning" held-band op Rewards.
- **Green Uplift** (`#2b5148`): Een secundair middel-donker groen, spaarzaam gebruikt op decoratieve accenten en donkere-gradient-momenten.
- **Green Light** (`#d4e9e2`): Een bleke muntgroene was, gebruikt voor formulier-geldige-staatstinten en lichte groene bruikbaarheidsoppervlakten.

### Secundair & Accent

- **Gold** (`#cba258`): Vrijwel uitsluitend gereserveerd voor Rewards-statusceremonies — Gold-niveau-uitingen, partnerbadges (SkyMiles, Bonvoy) en premium aandoende accenten. Nooit een universeel merkkleur.
- **Gold Light** (`#dfc49d`): Zachter goud voor achtergrondwassen op Gold-niveau-secties.
- **Gold Lightest** (`#faf6ee`): Crème-goud paginaoppervlaktewas, gebruikt onder partnersecties op de Rewards-pagina — koppelt het goudaccent terug aan het warme neutrale systeem.

### Oppervlak & Achtergrond

- **White** (`#ffffff`): Primair kaart- en modaaloppervlak. Ook kaartopvulling op cadeaukaartpanelen.
- **Neutral Cool** (`#f9f9f9`): Subtiel koel-grijs oppervlak gebruikt voor uitklapmenu's ("Account"-uitklap), formulierkaartomhulsels en stille bruikbaarheidscontainers.
- **Neutral Warm** (`#f2f0eb`): Het warme crème **primaire paginacanvas** voor Rewards-bruikbaarheidszones en heldbanden.
- **Ceramic** (`#edebe9`): Een iets warmere/donkerdere crème voor zonescheiders, zachte paginasectiewassen en de Rewards-partnerband.
- **Black** (`#000000`): Diepe inkt, gereserveerd voor de donkere CTA-balk bovenaan de pagina ("Join now") en hoog-contrast bovenste-navigatie aanmeldknoppen.

### Neutralen & Tekst

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Primaire kop- en bodytekstkleur op lichte oppervlakten. Niet puur zwart — een 87%-opaciteit zwart dat warmer aanvoelt.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Secundaire/metadatatekst op lichte oppervlakten.
- **Text White** (`rgba(255, 255, 255, 1)`): Primaire kop-/bodytekst op donkergroene oppervlakten.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Secundaire tekst op donkergroene oppervlakten — voettekstlinkbeschrijvingen, bijschrifttekst.
- **Rewards Green** (`#33433d`): Een exclusief gedempte leisteengroen, uitsluitend gebruikt op tekstvakken van de Rewards-pagina — een iets "stoffiger" leeskleur dan Text Black die "reward-oppervlak" signaleert zonder volledig Starbucks Groen te gebruiken.

### Semantisch & Accent

- **Red** (`#c82014`): Fout- en destructiestatus (formulier ongeldig, destructieve acties).
- **Yellow** (`#fbbc05`): Waarschuwingsstatus, legale merktoets.
- **Green Light** (`#d4e9e2` bij 33% opaciteit = `hsl(160 32% 87% / 33%)`): Formulier-geldig-veld tintsachtergrond.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Ongeldig-veld tint op formulieren.

### Zwart/Wit Alfatrappen

Twee parallelle doorschijnende schalen voor overlay- en secundaire tekstgebruik:
- `rgba(0,0,0,0.06)` tot `rgba(0,0,0,0.90)` in stappen van 10% — voor donkere overlays op lichte oppervlakten
- `rgba(255,255,255,0.10)` tot `rgba(255,255,255,0.90)` in stappen van 10% — voor lichte overlays op donkere oppervlakten

### Gradiëntsysteem

Geen structurele gradiënt-tokens waargenomen. Oppervlaktehiërarchie is doorlopend op basis van effen kleurblokken — het systeem vertrouwt op zijn vijftrapps crème/groen oppervlaktenpalet in plaats van gradiënten.

## 3. Typografieregels

### Lettertype Familie

- **Primair:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — Het propriëtaire bedrijfslettertype van Starbucks, gebruikt op vrijwel elke oppervlakte
- **Laad-fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — Wat gebruikers zien vóór SoDoSans geladen is
- **Rewards Schreef:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — Gebruikt op specifieke koptekstmomenten op de Rewards-pagina voor een warm redactioneel gevoel
- **Careers Script:** `"Kalam", "Comic Sans MS", cursive` — Uitsluitend gebruikt voor decoratieve "bekernaam"-accenten op Careers-pagina's, een verwijzing naar handgeschreven namen op Starbucks-bekers

Geen OpenType-stijlsets expliciet geactiveerd bij `:root`.

### Hiërarchie

| Rol | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5,0rem / 80px | 400–600 | 1,2 | -0,16px | Grootste Rewards/held-display |
| Jumbo (text-9) | 3,6rem / 58px | 400–600 | 1,2 | -0,16px | Secundaire heldkoppen |
| Hero Large (text-8) | 2,8rem / 45px | 400–600 | 1,2–1,5 | -0,16px | Landingssectie-koppen |
| H1 | 24px | 600 | 36px | -0,16px | Starbucks-Green primaire kop |
| H2 | 24px | 400 | 36px | -0,16px | Regulier-gewicht sectietitel in Text Black |
| Body Large | 19px | 400–600 | 33,25px (~1,75) | -0,16px | Held-introtekst, kenmerkenbandtekst |
| Body (text-3) | 1,6rem / 16px | 400 | 1,5 (24px) | -0,01em | Standaard bodytekst |
| Small (text-2) | 1,4rem / ~14px | 400–600 | 1,5 | -0,01em | Knopetiket, metadata, formulierlabels |
| Micro (text-1) | 1,3rem / ~13px | 400 | 1,5 | -0,01em | Actief zweef-labelstatus, bijschrift-microtekst |
| Knopetiket | 14–16px | 400–600 | 1,2 | -0,01em | Alle pil-knopetiket |

**Letterafstand-tokens:**
- `letterSpacingNormal`: `-0.01em` (standaard — strak, kenmerkend)
- `letterSpacingLoose`: `0.1em` (benadrukte hoofdletters)
- `letterSpacingLooser`: `0.15em` (hoofdletterstijl-labels, extreme nadruk)

**Regelhoogte-tokens:**
- `lineHeightNormal`: `1.5` (body)
- `lineHeightCompact`: `1.2` (display/knoppen)

### Principes

- **Strakke negatieve tracking (`-0.01em`)** wordt bijna universeel toegepast — het hele product leest licht gecomprimeerd, wat SoDoSans zijn zelfverzekerde aanwezigheid geeft zonder dat het benauwd aanvoelt.
- **Gewichtsverschillen dragen hiërarchie, geen grootteverskillen.** H1 en H2 delen dezelfde 24px/36px grootte; alleen gewicht (600 vs 400) en kleur (Starbucks-Green vs Text Black) onderscheiden ze.
- **Groottetokens gebruiken rem, verankerd op `1rem = 10px`** op deze site (via een `font-size: 62.5%` roottruc). Dus `1.6rem` = 16px, `2.4rem` = 24px, enz. De schaal is semantisch (textSize-1 t/m textSize-10), geen willekeurige pixelwaarden.
- **Contextspecifieke letterwissels** — schreef bij Rewards, script bij Careers — zijn bewust en gelokaliseerd. Meng ze nooit met het primaire schreefloze lettertype op dezelfde oppervlakte.
- **Bodytekst gaat nooit puur zwart** — deze staat op `rgba(0,0,0,0.87)` om overeen te komen met de temperatuur van het warm-neutrale canvas.

### Opmerking over Lettertypevervangers

SoDoSans is propriëtair voor Starbucks (gelicentieerd van House Industries, niet publiek beschikbaar). Redelijke open-source vervangers:
- **Inter** (Google Fonts) — vergelijkbare humanistische geometrische verhoudingen, breed gewichtsbereik
- **Manrope** — iets ronder, vergelijkbaar zelfverzekerd gevoel
- **Nunito Sans** — warmer, goed als "café"-merkvervanger

Controleer bij vervanging of de strakke `-0.01em` / `-0.16px` tracking nog goed leest; sommige open-source lettertypen hebben `-0.005em` nodig.

Lander Tall (het Rewards-schreeflettertype) is ook aangepast — open-source vervangers: **Iowan Old Style** (al in fallback), **Lora** of **Source Serif Pro**. Kalam (Careers-script) is rechtstreeks beschikbaar op Google Fonts.

## 4. Componentstijlen

### Knoppen

**1. Primair Gevuld — "Explore our afternoon menu / Sign up for free"**
- Achtergrond: `#00754A` (Green Accent)
- Tekst: `#ffffff`
- Rand: `1px solid #00754A`
- Radius: `50px` (volronde pil)
- Opvulling: `7px 16px`
- Lettertype: SoDoSans, 16px, gewicht 600, letterafstand `-0.01em`
- Actieve status: `transform: scale(0.95)` via `--buttonActiveScale`
- Overgang: `all 0.2s ease`

**2. Primair Omlijnd — "Give them a try / Start an order"**
- Achtergrond: transparant
- Tekst: `#00754A` (Green Accent)
- Rand: `1px solid #00754A`
- Zelfde radius/opvulling/actief/overgang als Primair Gevuld

**3. Zwart Gevuld — "Join now"**
- Achtergrond: `#000000`
- Tekst: `#ffffff`
- Rand: `1px solid #000000`
- Radius: `50px`, Opvulling: `7px 16px`
- Lettertype: 14px, gewicht 600
- Gebruikt op de bovenkant-van-pagina aanmeldingsbalk en vergelijkbare conversiemomenten

**4. Donker Omlijnd — "Sign in"**
- Achtergrond: transparant
- Tekst: `rgba(0, 0, 0, 0.87)` (Text Black)
- Rand: `1px solid rgba(0, 0, 0, 0.87)`
- Radius: `50px`, Opvulling: `7px 16px`
- Lettertype: 14px, gewicht 600

**5. Groen-op-Groen Omgekeerd — "See the spring menu"**
- Achtergrond: `#ffffff`
- Tekst: `#00754A`
- Rand: `1px solid #ffffff`
- Gebruikt wanneer de oppervlakte achter de knop de donkergroene House Green-band is — witte knop met groene tekst in plaats van een gevulde groene pil op groene achtergrond

**6. Omlijnd op Donker — "Learn more / Order now"**
- Achtergrond: transparant
- Tekst: `#ffffff`
- Rand: `1px solid #ffffff`
- Gebruikt op donkergroene kenmerkendbanden voor secundaire actie gekoppeld aan een witte gevulde CTA

**7. Toestemming Akkoord (donkergroene variant)**
- Achtergrond: `rgb(0, 130, 72)` (een specifieke variantgroen gebruikt in de cookietoestemmingsmodule)
- Tekst: `#ffffff`
- Geen rand, `50px` radius, `7px 16px` opvulling, 14px / gewicht 400
- Iets helderder dan Green Accent — gereserveerd voor de Akkoord-actie van de toestemmingsbanner

**8. Frap — Zwevende Ronde Bestelknop**
- Achtergrond: `#00754A` (Green Accent)
- Icoon: `#ffffff`
- Afmeting: `5.6rem / 56px` (standaard), `4rem / 40px` (minivariant)
- Radius: `50%` (volledige cirkel)
- Vaste positie rechtsonder, `-0.8rem` aanraakoffset voor extra tikcomfort
- Schaduwstapel: basis `0 0 6px rgba(0,0,0,0.24)` + omgevend `0 8px 12px rgba(0,0,0,0.14)`
- Actieve status: omgevende schaduw vervaagt naar `0 8px 12px rgba(0,0,0,0)`
- Dit is het kenmerkende elevatielement van het product — het zweeft boven elk gescrolde oppervlak

**9. Volbreedte Feedbacktab — "Provide feedback"**
- Achtergrond: `#00754A`
- Tekst: `#ffffff`
- Radius: `12px 12px 0px 0px` (alleen bovenaan afgerond)
- Opvulling: `8px 16px`
- Lettertype: 14px, gewicht 400
- Vaste positie rechtsonder-binnenin, bevestigd aan de viewport-rand

### Kaarten & Containers

**Inhoudskaart (standaard)**
- Achtergrond: `#ffffff` (`--cardBackgroundColor`)
- Radius: `12px` (`--cardBorderRadius`)
- Schaduw: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Gebruikt voor: featurekaarten, menu-item-tegels, reward-statuspanelen

**Cadeaukaartpaneel**
- Achtergrond: geïllustreerde fotografie vult de kaart (geen effen achtergrond)
- Radius: vergelijkbaar met kaarten (~`12px`, iets strakker op hoeken)
- Schaduw: lichter dan standaardkaart — deze worden behandeld als fysieke kaarten op het canvas
- Gelabeld per categorie boven het kaartgrid (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Rewards-statuskaarten (kenmerkend voor Rewards-pagina)**
- Driekolomsraster: Bronze / Gold / Silver-achtig — elk een donkergroen (`#1E3932`) paneel met:
  - Gekleurde gradiënt/kleur koptekstring
  - Genummerd "Level"-badge
  - Statustitel in grote SoDoSans gewicht 600
  - Sterren/voordelen lijst in witte/doorschijnend-witte tekst
  - Onderaan "As you earn more stars…" progressiebijschrift

**Partnerkaart (Rewards)**
- Achtergrond: `#faf6ee` (Gold Lightest) warm-crème oppervlak
- Inhoud: partnerlogo's ("SkyMiles", "Bonvoy") gecentreerd, met beschrijvende tekst eronder
- Radius en schaduw volgen standaard kaartspecificaties

**Uitklapmenu (Account-uitklap, bovenste navigatie)**
- Achtergrond: `#f9f9f9` (Neutral Cool)
- Menu-items op `24px / gewicht 400` in Text Black
- Geen rand — alleen achtergrondoppervlaktewijziging ten opzichte van witte navigatie

**Modaal**
- Opvulling: `2.4rem` (`--modalPadding`)
- Bovenste opvulling: `8.8rem` (`--modalTopPadding`) — laat ruimte voor sluitknop/koptekst
- Gecombineerde verticale opvulling: `11.2rem`
- Radius erft van kaartspecificaties (`12px`)

### Invoervelden & Formulieren

**Zweef-label Invoerveld**
- Label zweeft boven de invoerrand wanneer gefocust/ingevuld
- Desktoplabel lettergrootte: `1.9rem` standaard, animeert naar `1.4rem` wanneer actief
- Mobiellabel lettergrootte: `1.6rem` standaard, animeert naar `1.3rem` actief
- Label horizontale offset: `12px` van links
- Actief label translateert: omhoog naar `-12px` met `-50%` Y-translatie
- Veld opvulling: `12px`
- Formulier horizontale opvulling: `1.6rem`
- Validatie: geldig veld krijgt `rgba(green-light, 0.33)` tint; ongeldig veld krijgt `rgba(red, 0.05)` tint
- Overgang: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` bij aangevinkt invoer

**Opticoon (checkbox/radio)**
- Opvulling: `3px` binnenin
- Gebruikt de bovenstaande cubic-bezier-animatie voor aangevinkt invoer (een licht "veerkrachtige" 2.32 overshoot-curve)

### Navigatie

**Globale navigatie (bovenste balk)**
- Vaste positie met progressieve hoogten: `64px` xs → `72px` mobiel → `83px` tablet → `99px` desktop
- Schaduwstapel: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — drielaagse zachte lift
- Links: Starbucks-woordmerlogo, verschoven met `99px` (md) / `131px` (lg) van linkerrand
- Primaire links inline in SoDoSans gewicht 400–600: Menu · Rewards · Gift Cards
- Rechts: Winkel zoeken link + Aanmelden (omlijnd) + Nu lid worden (zwart gevuld)

**Subnavigatie (tweede balk, bijv. Rewards intern)**
- Hoogte: `53px` (globale subnavigatie) / `48px` (interne subnavigatie)
- Doorgaans horizontale tabbladgroep onder de globale navigatie

**Mobiele navigatie**
- Klapt in tot een hamburgermenu-la onder tabletbreekpunt
- Zwevende Frap-knop blijft rechtsonder ongeacht de navigatiestatus

### Beeldverwerking

- **Heldfotografie**: Productfoto's (dranken in doorzichtig glas met gekleurde achtergronden — koraal, salie, warm amber) beslaan ~40vw van een gesplitste heldopmaak; tekst beslaat de andere 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Cadeaukaartillustraties**: Elke kaart is een afzonderlijke geïllustreerde foto (geschilderd gevoel, handgetekend uitziend, warm kleurenpalet). Nooit generieke gegenereerde afbeeldingen.
- **Rewards-ceremonie-afbeeldingen**: Foto's van Starbucks Rewards App-schermen in de hand gehouden, scheve composities — product-in-context-fotografie.
- **Menuthumbnails**: Vierkante of 4:3 productfotografie met schone witte/crème achtergronden, lichte zachte slagschaduw rondom het glas.
- **Beeldfade-in**: `opacity 0.3s ease-in` overgang bij afbeeldingsladingen (`--imageFadeTransition`).

### Kenmerkband (donkergroene heldstrook)

Volbreedte `#1E3932` (House Green) band met:
- Links: witte koptekst + subkop + CTA-rij
- Rechts: productfotografie of illustratie
- Splitverhouding ~40/60 of 50/50 afhankelijk van sectie
- Witte tekst doorlopend met `rgba(255,255,255,0.70)` voor secundaire tekst
- CTA's volgen Groen-op-Groen Omgekeerd (wit gevuld) + Omlijnd op Donker (witte omtrek) combinatie

### Uitklapper / Accordeon

- Duur: `300ms` (`--expanderDuration`)
- Timingcurve: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — een beheerste ease-out
- Gebruikt voor FAQ-secties op Rewards en de cadeaupagina

### Cookietoestemmingsmodule

Donkergroene modale kaart bovenaan de pagina met "Akkoord" (groen gevuld) en "Voorkeuren beheren" (omlijnd) knoppen. Verschijnt bij eerste bezoek; te sluiten.

### Productdetailcomponenten (PDP-kenmerkcluster)

Een herhalend componentcluster gebruikt op menupagina's (bijv. `/menu/product/40498/iced` voor een drankdetail, `/menu/product/.../nutrition` voor voedingsfeiten). Deze breiden de componentenlijst uit zonder tokens te wijzigen.

**Maatoptieselectie**
- Horizontale rij van 4 bekerpicogramknoppen (Tall / Grande / Venti / Trenta)
- Elk item: bekersilhouetpicogram bovenaan, maatnaam eronder (16/700 in Starbucks-Green), vloeistof-ounce bijschrift (13/400 in Text Black Soft)
- Actieve status: een groene cirkelomtrekring (`2px solid #00754A`) rondom het geselecteerde bekerpicogram
- Inactief: geen ring, dezelfde typografie
- Volbreedte rij, gelijkmatige afstand
- Radius van container: `12px` of vlak; individuele picogrammen zijn `50%` cirkelvormig
- Opvulling: `16px 24px` intern

**Add-in / Melkselectie (omlijnde rechthoek)**
- Achtergrond: `#ffffff`
- Rand: `1px solid #d6dbde` (Invoerrand)
- Radius: `4px`
- Volbreedte in zijn kolom
- Zweef-label boven bovenste rand: "Add-ins" / "Milk" / "Add-ins" — 13/700 in Text Black, hoofdletters, `0.325px` letterafstand
- Weergegeven waarde gecentreerd (bijv. "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Chevron-neer-icoon rechts in Text Black Soft
- Focus: rand verschuift naar Green Accent (`#00754A`)

**Numerieke Stappenregelaar**
- Ingebed in een Add-in-rij wanneer een hoeveelheid vereist is (bijv. Strawberry Fruit Inclusions scoop)
- `−` min-knop + aantalnummer + `+` plus-knop, allemaal inline rechts van het label
- Knoppen: cirkelvormig `32×32px` met `1px solid #d6dbde` rand, neutraal grijs icoon
- Aantalnummer: 16/700 Text Black gecentreerd

**Aanpassen Knop**
- Achtergrond: `#ffffff`
- Tekst: `#00754A` (Green Accent)
- Rand: `1.5px solid #00754A`
- Radius: `50px` (volronde pil)
- Opvulling: `14px 40px` (ruimer dan standaardpillen — dit is een secundaire primaire actie)
- Label: "Customize" met een goud fonkelend ✨ icoon links ingezet
- Gebruikt voor: het betreden van de drankpersonalisatiestroom na maat-/melkselectie

**Aan Bestelling Toevoegen Knop (PDP)**
- Achtergrond: `#00754A` (Green Accent)
- Tekst: `#ffffff`
- Radius: `50px`
- Opvulling: `14px 32px`
- Vastgespeld rechtsboven op de productkaart en/of rechts uitgelijnd binnen de winkelsbeschikbaarheidsband
- Zelfde scale(0.95) actief gedrag als andere primaire CTA's

**Rewards Kostenpil — "200★ item"**
- Achtergrond: transparant
- Rand: `1px solid #cba258` (Gold)
- Tekst: `#cba258` (Gold)
- Radius: `50px` (volronde pil)
- Opvulling: `4px 12px`
- Inhoud: "200★ item" waarbij `★` een klein gevuld sterrenglyph is — geeft aan hoeveel Rewards Stars vereist zijn om dit item in te wisselen
- Lettertype: Proxima Nova 13/700 met `0.5px` letterafstand
- Uitsluitend gebruikt op producten die inwisselbaar zijn via Rewards

**Productbeschrijvingsband**
- Volbreedte donkergroene band (`#1E3932` House Green)
- Bevat van boven naar beneden:
  1. Rewards Kostenpil (goud) indien van toepassing
  2. Productbeschrijving bodytekst in wit (16/400/1,5)
  3. Voedingssamenvatting inline ("140 calories, 25g sugar, 2.5g fat") met info-icoon tooltip — 14/700 wit
  4. "Full nutrition & ingredients list" omlijnde-wit-op-groen pil knop
- Opvulling: `32px` verticaal
- Verschijnt onder de primaire productkoptekstband

**Ingrediënten- / Voedingstabel**
- Tweekolomsopmaak op de Voedingspagina
- Linkerkolom: "Ingredients" koptekst + lijst of "Not available for this item" plaatshouder tekstblok met een verklarende alinea in Text Black Soft 14/400
- Rechterkolom: "Nutrition" koptekst + label/waarde-rijen
- Elke rij: voedingsstoflabel (Proxima Nova 14/400) links, waarde (bijv. "140 calories", "25g", "205 mg**") rechts, gescheiden door een `1px solid #e7e7e7` haarlijntje eronder
- Voetnoot voor cafeïne/asterisktekens in 13/400 Text Black Soft onderaan
- Herbruikbaar patroon voor regelgevingconforme voedingstabellen

**Winkelsbeschikbaarheidsselectie**
- Verschijnt op donkergroene kenmerkband boven de maatoptierij
- Volbreedte afgeronde rechthoek met transparant-wit interieur
- Tekst: "For item availability, choose a store" in wit, 14/400
- Rechterkant: chevron-neer-aanduiding + boodschappentas SVG-icoon in witte omtrek
- Radius: `4px`
- Hoogte: ~48px

**PDP Broodkruimelpad**
- "Menu / Refreshers / Pink Energy Drink" spoor boven de producttitel
- Scheidingsteken: `/` schuine streep in Text Black Soft
- Huidige pagina is niet gelinkt, vorige pagina's zijn onderstreepte green-accent-links
- Lettertype: 14/400 Proxima Nova
- Verschijnt op alle PDP-pagina's

**Terug Chevron-link (PDP voeding / detail sub-pagina's)**
- "← Back" tekstlink boven sectiekoppen op de voedingspagina
- Tekst in Green Accent (`#00754A`) 14/700 Proxima Nova
- Links chevron `<` in hetzelfde groen
- Alternatief voor volledig broodkruimelpad op diepe subpagina's

## 5. Opmaakprincipes

### Ruimtesysteem

Rem-gebaseerde semantische schaal (verankerd `1rem = 10px`):

| Token | Rem | Pixels | Typisch gebruik |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Kleinste inline opvulling |
| `--space-2` | `0.8rem` | 8px | Kleine tussenruimte, knop verticale opvulling |
| `--space-3` | `1.6rem` | 16px | Standaard — kaartopvulling, buitenste goot xs |
| `--space-4` | `2.4rem` | 24px | Sectie binnenste ruimte, buitenste goot md |
| `--space-5` | `3.2rem` | 32px | Grote ruimte tussen secties |
| `--space-6` | `4rem` | 40px | Grote tussenruimten, buitenste goot lg, heldcrate |
| `--space-7` | `4.8rem` | 48px | Sectie-naar-sectie-ruimte |
| `--space-8` | `5.6rem` | 56px | Zeer grote ademruimte — Frap-hoogte |
| `--space-9` | `6.4rem` | 64px | Breedste sectie-opvulling |

**Goot-tokens:**
- `--outerGutter: 1.6rem` (16px, standaard / mobiel)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Universele ritme-constante:** `1.6rem` (16px) verschijnt op elke pagina als de standaard buitenste goot, kaartopvulling-basislijn en body-tekstgrootte 3 — de meest frequente ruimte-eenheid van het systeem.

### Raster & Container

- Kolombreedte-schaal: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Cadeaukaartgrid gebruikt een 3-5-koloms responsief raster van ~`343px` tegels
- Rewards-statussectie: 3-kolomns donkergroene panelen bij `lg+` breekpunten
- Held: asymmetrische splitsing 40% (afbeelding) / 60% (inhoud) via `--headerCrateProportion` / `--contentCrateProportion`

### Witruimtefilosofie

Witruimte draagt het gevoel van "volop ruimte in het café." Sectie-opvulling is ruimhartig (40–64px). Inhoudsblokken worden gescheiden door witruimte in plaats van scheidingslijnen. Het crème canvas (`#f2f0eb`) is zelf een visuele ademteug tussen witte kaarten en groene kenmerkendbanden.

### Afrondingsschaal

| Waarde | Gebruik |
|-------|-----|
| `12px` | Kaarten, modale vensters, menu-item-tegels (`--cardBorderRadius`) |
| `12px 12px 0 0` | Volbreedte feedbacktab (alleen bovenaan afgerond) |
| `50px` | Alle knoppen — volronde pilradius (`--buttonBorderRadius`) |
| `50%` | Ronde iconen, Frap zwevende knop, avatarminiaturen |
| Speciaal | `3.3333%/5.298%` elliptisch voor Starbucks-Visa-Card mockups (`--svcRoundedCorners`) |

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Kaart | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Standaard inhoudskaarten — een fluisterzachte dubbele schaduw |
| Globale navigatie | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Drielaagse zachte lift op de vaste bovenste balk |
| Frap Basis | `0 0 6px rgba(0,0,0,0.24)` | Basishalo rondom de zwevende ronde CTA |
| Frap Omgevend | `0 8px 12px rgba(0,0,0,0.14)` | Gestapelde richtinggevende omgeving — laat de Frap naar voren drijven |
| Cadeaukaart | Lichte slagschaduw rondom geïllustreerde foto | Fysiek-kaartgevoel voor cadeaupanelen |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Gestapelde SVG-slagschaduwen voor Starbucks Card-visuals |

**Schaduwfilosofie:** Fluisterzacht, gelaagd over effen — het systeem gebruikt nooit een enkele zware slagschaduw. In plaats daarvan stapelt het 2–3 laag-alpha schaduwen met verschillende offsets om echte omgevings- en directe belichting te simuleren. De Frap-knop is het meest verheven element op elke pagina.

### Decoratieve Diepte

- **Geen gradiëntsysteem** — oppervlakten zijn effen kleurblokken
- **Kleurblokbanding** draagt waargenomen diepte (donkergroene banden lezen als "verzonken kenmerkendzones" tussen crème/witte lichaamssecties)
- **SVG-filterschaduwen** op Starbucks-Card-visuals voegen een lichte 3D-fysicaliteit toe zonder box-shadow

## 7. Wel & Niet

### Wel
- Gebruik Neutral Warm (`#f2f0eb`) of Ceramic (`#edebe9`) als paginacanvas in plaats van puur wit — het warme crème is kenmerkend
- Wijs de groentinten toe aan hun beoogde oppervlakterol — Starbucks Green voor koppen, Green Accent voor CTA's, House Green voor diepe banden, Uplift voor decoratief
- Houd de tracking strak op `-0.01em` / `-0.16px` op SoDoSans door het hele systeem
- Gebruik 50px volronde pilradius op elke knop zonder uitzondering
- Pas `transform: scale(0.95)` toe als de universele knop actieve status
- Reserveer Gold uitsluitend voor Rewards-statusceremonemomenten
- Gebruik SoDoSans voor bijna alles; schakel over naar Lander Tall schreef alleen voor Rewards-redactionele koppen; reserveer Kalam-script voor Careers "bekernaam"-momenten
- Stapel 2–3 laag-alpha schaduwen in plaats van één zwaardere slagschaduw voor elevatie
- Gebruik de ronde Frap-CTA als de persistente zwevende bestelingang op elk winkeloppervlak
- Laat het crème canvas ademen tussen inhoudskaarten — gebruik witruimte, geen scheidingslijnen

### Niet
- Gebruik geen puur wit als paginacanvas — de warme crèmetemperatuur is essentieel
- Kies niet één "merkgroen" — het viertrapps groene systeem is opzettelijk; alleen `#006241` overal gebruiken vlakt het merk af
- Gebruik Gold niet als universeel accent — het is uitsluitend een Rewards-signaal
- Maak de hoeken van knoppen niet vierkant — de 50px pil is universeel
- Voer geen gradiëntvullingen in — het systeem is doorlopend kleurblok
- Onderscheid h1 en h2 niet door grootte — de hiërarchie komt van gewicht + kleur (600 Starbucks-Green vs 400 Text Black)
- Gebruik geen puur zwart voor bodytekst — `rgba(0,0,0,0.87)` past bij het warme canvas
- Sla de `scale(0.95)` actieve feedback op knoppen niet over — het is een kenmerkende micro-interactie
- Stapel geen enkelvoudige zware schaduwen; stapel altijd 2–3 laag-alpha schaduwen
- Voer geen schreve lettertypen of scripts in de hoofdwinkelstroom in — ze horen thuis in Rewards- en Careers-contexten respectievelijk

## 8. Responsief Gedrag

### Breekpunten

Afgeleid van componentbreedtetokens en progressieve navigatiehoogten:

| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| xs | < 480px | Globale navigatie 64px; hamburgermenu; eénkolomsopmaak; pilknoppen volbreedte |
| Mobiel | 480–767px | Globale navigatie 72px; cadeaukaartgrid 2-koloms; kaartopvulling wordt strakker |
| Tablet | 768–1023px | Globale navigatie 83px; cadeaukaartgrid 3-koloms; held-splitsing begint te verschijnen |
| Desktop | 1024–1439px | Globale navigatie 99px; cadeaukaartgrid 4-koloms; volledig asymmetrische held 40/60 |
| XLarge | 1440px+ | Inhoud begrensd op `--columnWidthXLarge`; cadeaukaartgrid 5-koloms; extra crème marge |

### Aanraakdoelwitten

- Pilknoppen bij `7px 16px` opvulling meten ~32px hoog — onder het WCAG AAA-minimum van 44px voor alleen-aanraakoppervlakken. Op mobiel kan knopopvulling visueel worden vergroot om aan het minimum te voldoen.
- Zwevende ronde Frap-knop bij `56px` is ruim boven het minimum.
- Frap gebruikt `--frapTouchOffset: calc(-1 * .8rem)` om het tikgebied 8px voorbij de visuele rand uit te breiden.
- Formulier zweef-label invoervelden vergroten hun labellettergrootte op mobiel (1,6rem basis vs 1,9rem desktop) — gemakkelijker te tikken en te lezen op armslengte.

### Inklapstrategie

- **Globale navigatiehoogte schaalt progressief**: 64 → 72 → 83 → 99px over breekpunten, niet één enkele waarde
- **Held-splitsing klapt in**: 40/60 asymmetrische splitsing → gestapeld (afbeelding boven, inhoud eronder) op mobiel
- **Cadeaukaartgrid**: 5-koloms → 4-koloms → 3-koloms → 2-koloms → 1-koloms over breekpunten met aangepaste kaartbreedten
- **Kenmerkendbanden**: Blijven volbreedte maar tekst + afbeelding stapelen verticaal op mobiel
- **Buitenste goot schaalt**: 16px → 24px → 40px naarmate de viewport groter wordt
- **Rewards 3-kolomns statuspanelen**: Stapelen naar één kolom op mobiel

### Beeldgedrag

- Heldproductfotografie crop strakker verticaal op mobiel; inhoud wordt het visuele anker
- Cadeaukaartillustraties bewaren beeldverhouding; kaartgrid herstroomt
- `opacity 0.3s ease-in` fade-in-overgang bij afbeeldingslading (voorkomt storend verschijnen)
- Rewards app-in-hand fotografie schaalt proportioneel; nooit uitgerekt

## 9. Agent Promptgids

### Snelle Kleurenreferentie

- Primaire CTA: "Green Accent (`#00754A`)"
- Primaire CTA-tekst: "White (`#ffffff`)"
- Merkkop: "Starbucks Green (`#006241`)"
- Kenmerkband / voettekst: "House Green (`#1E3932`)"
- Paginacanvas: "Neutral Warm (`#f2f0eb`)"
- Kaartcanvas: "White (`#ffffff`)"
- Koptekst op licht: "Text Black (`rgba(0,0,0,0.87)`)"
- Bodytekst op licht: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Bodytekst op donkergroen: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Rewards accent: "Gold (`#cba258`)"
- Rewards tekst: "Rewards Green (`#33433d`)"
- Destructief: "Red (`#c82014`)"

### Voorbeeldcomponentprompts

1. "Maak een primaire Starbucks CTA-pilknop met Green Accent (`#00754A`) achtergrond, witte tekst 'Explore our afternoon menu', SoDoSans lettertype op 16px gewicht 600 met `-0.01em` letterafstand, `50px` rand-radius (volronde pil), `7px 16px` opvulling. Pas `transform: scale(0.95)` toe als de actieve status met een `0.2s ease` overgang."

2. "Ontwerp een inhoudskaart met White (`#ffffff`) achtergrond op `12px` rand-radius, gelaagde schaduw `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Vul inhoud `16–24px` (`--space-3` t/m `--space-4`). Plaats op een Neutral Warm (`#f2f0eb`) paginacanvas met `16px` tussenruimte naar gezusterlijke elementen."

3. "Bouw de Frap zwevende ronde bestelknop — `56px` diameter, Green Accent (`#00754A`) vulling, wit boodschappentasicoon gecentreerd. Gelaagde schaduw: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Vaste positie rechtsonder met `-0.8rem` aanraakoffset. Actieve status laat de omgevende schaduw zakken naar `0 8px 12px rgba(0,0,0,0)` met `scale(0.95)`."

4. "Bouw een donkergroene kenmerkband — volbreedtesectie met House Green (`#1E3932`) achtergrond. Linkerkolom: witte SoDoSans h2 op 24px gewicht 600, gevolgd door een Text White Soft (`rgba(255,255,255,0.70)`) bodytekstalina en een CTA-rij met twee knoppen (Wit-gevuld met Green Accent-tekst voor primair, Omlijnd-op-Donker witte rand voor secundair). Rechterkolom: productfotografie. Splitverhouding 40/60, verticaal gestapeld onder `768px`."

5. "Maak een Rewards-statuskaart — House Green (`#1E3932`) paneel met `12px` rand-radius, gekleurde gradiënt bovenste streep (Bronze/Silver/Gold niveau). Titel in SoDoSans 24px gewicht 600 in wit. Voordelen lijst als witte opsommingstekens met `rgba(255,255,255,0.70)` secundaire bijschriften. Onderste progressietekst in Text White Soft. Stapel 3 panelen in een raster bij `lg+`, één kolom op mobiel."

6. "Ontwerp een cadeaukaartpaneel — kaartradius overeenkomend met `12px`, gevuld met een geïllustreerde foto (handgetekend aquarelgeschilderd gevoel) als het gehele oppervlak. Subtiele slagschaduw laat het aanvoelen als een fysieke kaart op het crème canvas. Groepeer onder een categorielabel ('Spring', 'Thank You', 'Birthday') in SoDoSans 24px gewicht 400 boven het raster."

7. "Maak een Starbucks productdetailkoptekst — House Green (`#1E3932`) band met broodkruimelpad 'Menu / Refreshers / Pink Energy Drink' in 14/400 wit boven de producttitel in SoDoSans 32/700 hoofdletters wit. Productfoto gecentreerd onder titel. Onder foto: een 4-kolomns maatselectierij — elke bekerknop toont een verticaal bekersilhouet, maatnaam ('Tall' / 'Grande' / 'Venti' / 'Trenta') in 16/700 wit, en vloeistof-ounce in 13/400 Text White Soft. De geselecteerde maat wikkelt het bekericoon in een `2px solid #00754A` cirkelring."

8. "Bouw een Starbucks aanpasstroom — onder de maatselectie, 3 gestapelde omlijnde-rechthoek invoervelden (witte achtergrond, `1px solid #d6dbde` rand, `4px` radius). Elk heeft een zweef-label ('Add-ins', 'Milk', 'Add-ins') boven de bovenste rand in 13/700 Text Black hoofdletters. Waarde gecentreerd (bijv. 'Ice', 'Coconut'). Rechts: chevron-neer in Text Black Soft. Voor de scoop-rij, embed een numerieke stappenregelaar (`−` `1` `+` met cirkelvormige `32px` omlijnde knoppen). Onder alle drie velden: omlijnde groene 'Customize' pil met goud fonkelend icoon, `50px` radius, `14px 40px` opvulling. Combineer met een Green Accent gevulde 'Add to Order' pil in dezelfde rij."

9. "Ontwerp een Starbucks productbeschrijvingsband — volbreedte House Green (`#1E3932`) onder de productkoptekst. Bovenaan: een goud-omlijnde '200★ item' Rewards Kostenpil (`50px` radius, `4px 12px` opvulling, goud `#cba258` rand en tekst). Eronder: productbeschrijving in wit 16/400/1,5. Voedingsinline-samenvatting in wit 14/700 ('140 calories, 25g sugar, 2.5g fat') met info-icoon tooltip. Omlijnd-wit-op-groen pilknop 'Full nutrition &amp; ingredients list'. 32px verticale opvulling."

10. "Maak een Starbucks voedingstabel — tweekolomsopmaak binnen een witte kaart. Linkerkolom: 'Ingredients' koptekst (24/400 Text Black), gevolgd door ingrediëntenlijst of 'Not available for this item' plaatshouder alinea in 14/400 Text Black Soft. Rechterkolom: 'Nutrition' koptekst, dan label/waarde-rijen (voedingsstoflabel links, waarde rechts) gescheiden door `1px solid #e7e7e7` haarlijntjes. Typografie: labels in 14/400 Text Black, waarden in 14/700 Text Black rechts uitgelijnd. Voetnootasterisktekens in 13/400 Text Black Soft onderaan."

### Iteratiegids

Bij het verfijnen van bestaande schermen gegenereerd met dit ontwerpsysteem:
1. Focus op ÉÉN component tegelijk
2. Verwijs naar specifieke kleurnamen en hex-codes uit dit document
3. Gebruik beschrijvende taal ("warm crème canvas," "viertrapps groen systeem") naast exacte waarden
4. Bewaar de 50px pil + `scale(0.95)` actieve status universeel
5. Controleer of de groenen zijn toegewezen aan hun correcte rol (Green Accent voor CTA, Starbucks Green voor kop, House Green voor band)
6. Voer geen gradiënten in — het systeem is kleurblok
7. Houd de SoDoSans tracking op `-0.01em` / `-0.16px` door het geheel

### Bekende Hiaten

- SoDoSans is een propriëtair lettertype dat niet beschikbaar is op Google Fonts — gebruik bij publieke implementatie Inter of Manrope als vervanger en documenteer de uitwisseling
- Lander Tall (Rewards schreef) is ook aangepast — vervang door Iowan Old Style, Lora of Source Serif Pro
- Specifieke per-component animatietimings buiten de paar gedocumenteerde (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) zijn niet voor elk interactief oppervlak vastgelegd
- Volledig formulierfoutstatus-styling (rode randdikte, icoonplaatsing) zichtbaar in het tint-token maar niet uitputtend geëxtraheerd
- Careers-paginaspecifieke componenten (bekernaamskaart, zoekradiogrid) worden gerefereerd in tokennamen maar worden niet gedekt door deze extractie
- Starbucks Visa Card / Starbucks-Card (SVC) gedetailleerde mockupspecificaties worden gesuggereerd door `--svcRoundedCorners`- en `--svcShadowFilter`-tokens maar zijn niet volledig gedocumenteerd
