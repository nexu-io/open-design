# Designsysteem geïnspireerd door Apple

> Category: Media & Consumer
> Consumentenelektronica. Premium witruimte, SF Pro, cinematische beelden.

## 1. Visueel thema & sfeer

Apple's web-taal is een precies redactioneel systeem dat afwisselt tussen galerie-achtige rust en informatieblokken met retail-dichtheid. De visuele toon blijft ingetogen: brede neutrale canvassen, stille chrome en productbeelden die vrijwel al het expressieve gewicht krijgen. De interface is zo ontworpen dat ze verdwijnt, zodat hardware, materialen en afwerkingsopties de narratieve voorgrond worden.

Over de vijf geanalyseerde pagina's heen is het ritme consistent maar niet monolithisch. Marketingoppervlakken (homepage en Environment) gebruiken cinematische zwart-en-licht-hoofdstukindeling, terwijl commerce-oppervlakken (Store- en Shop-flows) krappere spatiëring, meer utiliteitsbedieningen en dichtere kaartstapels introduceren zonder de kerngrammatica van het merk te doorbreken. Het resultaat is één systeem met twee versnellingen: showcasemodus en transactiemodus.

Typografie is de stabilisator. SF Pro Display draagt de hiërarchie van hero en merchandising met compacte regelhoogtes en gecontroleerde tracking, terwijl SF Pro Text de productmetadata, navigatie, filters en dichte selectie-UI verzorgt. De typografie blijft ingetogen, maar het schaalbereik is breed genoeg om zowel billboard-hero-boodschappen als micro-utiliteitslabels te ondersteunen.

**Belangrijkste kenmerken:**
- Binair sectieritme: diepzwarte scènes (`#000000`) afgewisseld met bleke neutrale velden (`#f5f5f7`)
- Eén blauwe accentfamilie voor actie- en linksemantiek (`#0071e3`, `#0066cc`, `#2997ff`)
- Twee bedrijfsmodi in één systeem: cinematische showcasemodules en dichte commerce-configurators
- Sterke afhankelijkheid van beelden en materiaalafwerkingen; UI-chrome blijft visueel dun
- Strakke headline-metrieken (SF Pro Display, semibold) gecombineerd met compacte body-/linktypografie (SF Pro Text)
- Pil- en capsulegeometrie als kenmerkende actie-taal (`18px` tot `980px` en cirkelvormige bedieningen)
- Diepte spaarzaam gebruikt; contrast en oppervlaktescheiding doen het meeste laagwerk
- Kleurblokritme over meerdere pagina's: zwarte hero-hoofdstukken -> bleke neutrale merchandisingvelden -> utiliteitswitte retailoppervlakken -> donkere micro-oppervlakken voor bedieningen

## 2. Kleurenpalet & rollen

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primair
- **Absoluut zwart** (`#000000`): Immersieve hero-canvassen, dramatische producthoofdstukken, diepe UI-ankers.
- **Bleek Apple-grijs** (`#f5f5f7`): Hoofd-lichtoppervlak voor feature-banden, vergelijkingsblokken en redactionele overgangen.
- **Bijna-zwarte inkt** (`#1d1d1f`): Primaire tekst en donkergevulde bedieningskleur op lichte canvassen.

### Secundair & accent
- **Apple actieblauw** (`#0071e3`): Primaire actievulling en focus-signalerend merkaccent.
- **Body-linkblauw** (`#0066cc`): Inline-linkkleur geoptimaliseerd voor leesbaarheid in lange teksten.
- **Hoog-luminantie-linkblauw** (`#2997ff`): Heldere linkbehandeling op donkerdere scènes waar sterker contrast vereist is.

### Oppervlak & achtergrond
- **Puur wit canvas** (`#ffffff`): Retail-/productlijst-achtergronden en dichte transactionele secties.
- **Grafietoppervlak A** (`#272729`): Donkere kaart- en mediabedieningscontextlaag.
- **Grafietoppervlak B** (`#262629`): Iets diepere donkere utiliteitslaag voor bedieningsgroeperingen.
- **Grafietoppervlak C** (`#28282b`): Verhoogde donkere ondersteunende oppervlakken.
- **Grafietoppervlak D** (`#2a2a2c`): Donkerste verhoogde stap, gebruikt voor scheiding in rijkere donkere scènes.

### Neutralen & tekst
- **Secundair neutraal grijs** (`#6e6e73`): Secundaire body-tekst, helperbeschrijvingen, tertiaire metadata.
- **Zacht randgrijs** (`#d2d2d7`): Scheidingslijnen, subtiele omlijningen en gedempte utiliteitsomkadering.
- **Middelmatig randgrijs** (`#86868b`): Sterkere veldomlijningen in productconfiguratie- en filtercontexten.
- **Utiliteits-donkergrijs** (`#424245`): Donker-neutrale tekst-/oppervlakteovergang in storecontexten.

### Semantisch & accent
- **Selectie-/focussignaal** (`#0071e3`): Gedeeld focus- en geselecteerd-staat-signaal over marketing- en commerce-contexten heen.
- **Fout/waarschuwing/succes**: Er was geen apart semantisch palet consistent zichtbaar in de geëxtraheerde oppervlakteset.

### Gradiëntsysteem
- De geëxtraheerde pagina's worden overweldigend door effen oppervlakken aangedreven. Visuele rijkdom komt voort uit fotografie en afwerkingsweergave in plaats van persistente UI-gradiënten.

## 3. Typografieregels

### Lettertypefamilie
- **Display-familie:** `SF Pro Display`, fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Text-familie:** `SF Pro Text`, fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Verdeling van gebruik:** De Display-familie verzorgt hero-/productheadlines en merchandisingkoppen; de Text-familie verzorgt navigatie, bedieningen, labels en dichte commerce-tekst.

### Hiërarchie
| Rol | Grootte | Gewicht | Regelhoogte | Letterspatiëring | Opmerkingen |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Schaal voor Environment-/store-hero |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Homepage-heromomenten |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Belangrijke hoofdstukkoppen |
| Product Heading | 40px | 600 | 1.10 | normal | Product- en campagnesectietitels |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Apparaat- en merchandising-callouts |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px tot 0.352px | Sub-hero's op moduleniveau |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Naamgeving en kerntekst op tegelniveau |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Configurator- en gegroepeerde-contentkoppen |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Grotere promotionele links |
| Subhead | 19px | 600 | 1.21 | 0.228px | Compacte sectie-intro's |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Standaard body en retailbeschrijvingen |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Benadrukte labels en kernwaarden |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Knoppen, helperlabels, compacte nav-tekst |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Kleine lettertjes, micro-labels |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Dichte metadata en juridische ondersteunende tekst |

### Principes
- **Continuïteit over paginatypes heen:** Hetzelfde typografische DNA strekt zich uit over cinematische lanceringen en productaankoopflows, wat een merkscheiding tussen marketing en commerce voorkomt.
- **Compressie op grote schaal:** Display-niveaus gebruiken strakke leading en gecontroleerde tracking om gemachineerd en product-eerst aan te voelen.
- **Leesbare dichtheid op retaildiepte:** SF Pro Text balanceert compactheid met genoeg verticaal ritme voor lange productlijsten en optiematrixen.
- **Afgemeten gewichtsladder:** 600 is het dominante nadrukgewicht; 700 verschijnt selectief; 300 wordt spaarzaam gebruikt voor contrast in grotere regels.

### Opmerking over lettertypevervangers
- Dichtstbijzijnde vrij beschikbare vervangers: `Inter` voor tekstrijke implementatie en `SF Pro Display-like` metrieken benaderd met `Inter Tight` voor koppen.
- Verhoog bij het vervangen de regelhoogte iets (+0.02 tot +0.06) op body-groottes en verminder de intensiteit van negatieve tracking om de leesbaarheid te behouden.

## 4. Componentstijlen

### Knoppen
- **Primaire gevulde actie:** `#0071e3` achtergrond, `#ffffff` tekst, 8px radius, compacte horizontale padding (vaak 8px 15px). Gebruikt voor beslissende aankoop-/voortgangsacties.
- **Donkergevulde actie:** `#1d1d1f` achtergrond, `#ffffff` tekst, 8px radius. Gebruikt wanneer lichte oppervlakken een ingetogen hoog-contrast-primaire nodig hebben.
- **Pil-/capsule-actiefamilie:** grote capsule-acties met `18px`-`56px` radii en extreme pil-links met `980px`. Vestigt Apple's zachte maar precieze call-to-action-silhouet.
- **Utiliteitsfilter-/knopomhulsels:** lichte omhulsels (`#fafafc` of doorschijnend wit) met subtiele grijze randen (`#d2d2d7` / `#86868b`) voor dichte configuratiecontexten.
- **Ingedrukt gedrag:** actieve bedieningen verkleinen vaak de schaal of verschuiven de vulling iets om fysieke drukbevestiging aan te geven.

### Kaarten & containers
- **Redactionele/productkaarten:** lichte kaarten op `#f5f5f7` of witte velden met minimale omkadering en beeld-eerst-compositie.
- **Donkere utiliteitskaarten:** grafietstappen (`#272729` tot `#2a2a2c`) gebruikt voor overlays, mediabedieningen en donkercontext-modules.
- **Configuratorpanelen:** afgeronde containers (vaak 12px-18px) met duidelijke maar ingetogen randdefinitie.
- **Carrousel-/spotlight-modules:** grotere afgeronde omhulsels (`28px`-`36px`) voor uitgelichte content-lanes.

### Invoervelden & formulieren
- **Retail-invoervelden:** doorschijnende of witte achtergronden, donkere tekst (`#1d1d1f`), randgeleide omkadering (`#86868b`).
- **Selectiebedieningen:** cirkelvormige/toggle-achtige bedieningsgeometrie verschijnt vaak in productselectie-interfaces.
- **Dichtheidsstrategie:** formuliervelden blijven visueel stil om de productbeelden en prijshiërarchie dominant te houden.

### Navigatie
- **Globale marketingnavigatie:** compacte donkere doorschijnende balk met klein-type-links en ingetogen iconografie.
- **Store-/sub-shop-navigatielagen:** aanvullende utiliteitsbalken, chips en gesegmenteerde bedieningen voor categorie- en productverfijning.
- **Linkhiërarchie:** linkblauwen blijven het primaire interactieve signaal, terwijl neutrale tekst dichte navigatiesets ondersteunt.

### Beeldbehandeling
- **Object-eerst-fotografie:** hardware en accessoires worden op de voorgrond geplaatst op gecontroleerde effen oppervlakken.
- **Hoogwaardige afwerkingsweergave:** reflecterende/materiaaldetails staan centraal in de visuele overtuiging.
- **Gemengde omkadering:** full-bleed-heroscènes bestaan naast afgeronde retailkaarten en strak bijgesneden merchandising-thumbnails.

### Andere onderscheidende componenten
- **Productconfiguratormatrix:** optiestapels en selectors die chips, radioknop-achtige bedieningen en contextuele prijs-/samenvattingsblokken combineren.
- **Carrouselbedieningsstippen/-pijlen:** cirkelvormig bedieningsvocabulaire in gedempte overlays voor galerievoortgang.
- **Environment-verhaalpanelen:** narratieve hoofdstukken die redactionele typografie combineren met cinematische product-/omgevingsbeelden.

## 5. Lay-outprincipes

### Spatiëringssysteem
- De basiseenheid is in feite `8px`, maar het systeem ondersteunt dichte micro-stappen voor precieze uitlijning.
- Vaak hergebruikte spatiëringswaarden over pagina's heen: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Universele ritmeconstanten zichtbaar over zowel marketing- als retailflows: `8px`-eenheidsstellage met `14-20px` utiliteitsintervallen voor componentpadding en lijstspatiëring.

### Grid & container
- **Showcasepagina's:** grote centrale kolommen met brede horizontale ademruimte en kleurhoofdstukken over de volledige breedte.
- **Commerce-pagina's:** krappere multi-kolom-product- en bedieningsgrids met frequente modulaire stapeling.
- **Containergedrag:** beperkte leesbare kern met royale buitenmarges bij desktopbreedtes.

### Witruimtefilosofie
- **Scènetempo:** belangrijke visuele hoofdstukken gebruiken brede boven-/onder-ademruimte.
- **Informatiecompactie waar nodig:** retailpagina's comprimeren bewust de spatiëring om meer bruikbare informatie per viewport te tonen.
- **Contrastgeleide scheiding:** sectieovergangen leunen meer op oppervlakteveranderingen dan op decoratieve scheidingslijnen.

### Border-radius-schaal
- **5px:** kleine utiliteitslinks/tags en kleine kleine omhulsels.
- **8px-12px:** standaardbedieningen en compacte velden.
- **16px-18px:** kaarten, modulekaders en commerce-panelen.
- **28px-36px:** grotere module- en spotlightcontainers.
- **56px / 100px / 980px:** capsules, grote pillen en kenmerkende verlengde CTA-vormen.
- **50%:** cirkelvormige media- en selectiebedieningen.

## 6. Diepte & elevatie

| Niveau | Behandeling | Gebruik |
|------|-----------|-----|
| Niveau 0 | Platte neutrale oppervlakken (`#ffffff`, `#f5f5f7`, `#000000`) | Hoofdverhaal en productpodia |
| Niveau 1 | Subtiele randomkadering (`#d2d2d7`, `#86868b`) | Filters, invoervelden, utiliteitskaarten |
| Niveau 2 | Zachte schaduw (`rgba(0,0,0,0.08)` tot `rgba(0,0,0,0.22)` waar aanwezig) | Uitgelichte kaarten en verhoogde merchandisingmodules |
| Niveau 3 | Donkeroppervlak-trapsgewijze opbouw (`#272729` -> `#2a2a2c`) | Overlays, mediabedieningen, donkere utiliteitsclusters |
| Toegankelijkheid | Blauw focussignaal (`#0071e3`) | Toetsenbord- en selectienadruk |

Diepte is bewust ingetogen. Apple geeft de voorkeur aan tonaal contrast, oppervlaktetrapsgewijze opbouw en compositorische hiërarchie boven zware schaduwstapels.

### Decoratieve diepte
- Decoratieve diepte wordt voornamelijk gecreëerd door fotografisch realisme en materiaalweergave, niet door synthetische UI-effecten.
- Doorschijnende overlays en glasachtige utiliteitsbalken zorgen voor milde atmosferische gelaagdheid in navigatie en bedieningen.

## 7. Do's en don'ts

### Do
- Gebruik de neutrale triade (`#000000`, `#f5f5f7`, `#ffffff`) als de structurele basis.
- Reserveer blauwe accenten voor echte actie- en navigatiesemantiek.
- Houd typografie strak en doelbewust, vooral op display-schalen.
- Behoud de capsule-/cirkelgeometrietaal voor bedieningen en kernacties.
- Laat productbeelden de visuele dramatiek dragen; houd chrome ingetogen.
- Gebruik randgeleide omkadering in dichte retailcontexten in plaats van zware kaartornamentiek.
- Bewaar duidelijke scheiding tussen showcasemodules en transactionele modules terwijl je kerntokens gedeeld houdt.

### Don't
- Introduceer geen brede secundaire accentpaletten die concurreren met Apple-blauw.
- Overmatig gebruik van schaduwen, gloed-effecten of decoratieve gradiënten in de kern-UI-chrome.
- Meng geen niet-verwante lettertypefamilies en versoepel de tracking niet zonder onderscheid.
- Maak niet alle hoeken vlak tot één radius; Apple gebruikt doelbewuste radius-niveaus.
- Overlaad commerce-modules niet met dikke randen of luide visuele effecten.
- Verwijder niet de neutrale contrastcadans tussen donkere en lichte hoofdstukken.
- Behandel marketing- en aankoopflows niet als aparte designsystemen.

## 8. Responsief gedrag

### Breakpoints
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Small Mobile | 374px en lager | Aangescherpte retailbedieningen, één-koloms productstapels |
| Mobile | 375px-640px | Één-koloms modules, compacte actierijen, gecondenseerde selectors |
| Tablet | 641px-833px | Uitgebreide kaarten en gemengde 1-2-koloms-overgangen |
| Tablet Wide | 834px-1023px | Stabielere multi-koloms merchandising, grotere tekstblokken |
| Desktop | 1024px-1240px | Volledige retail-lay-outs en productvergelijkingsstructuren |
| Desktop Wide | 1241px-1440px | Marketing-hero-uitbreiding en bredere sectiespatiëring |
| Large Desktop | 1441px+ | Maximale hoofdstuk-ademruimte en brede redactionele compositie |

### Aanraakdoelen
- Primaire en secundaire acties worden over het algemeen gepresenteerd in tap-vriendelijke pil-/knopgeometrieën.
- Cirkelvormige media- en selectiebedieningen sluiten aan op minimale aanraakbare intentie in mobiele contexten.
- Dichte commerce-UI gebruikt compacte labels maar behoudt duidelijke trefzones via omringende vormpadding.

### Inklapstrategie
- Marketing-hero-typografie schaalt omlaag in discrete niveaus terwijl het hiërarchiecontrast behouden blijft.
- Product- en commerce-grids klappen in van multi-kolom naar gestapelde kaarten met persistente selectorzichtbaarheid.
- Utiliteitsnavigatie comprimeert tot eenvoudigere link-/bedieningsgroeperingen terwijl kernacties behouden blijven.
- Optie-/configuratieclusters worden verticaal in volgorde geplaatst om de aankoopflow lineair te houden op kleine schermen.

### Beeldgedrag
- Productbeelden behouden verhouding en centraliteit door breakpoints heen.
- Hero-beelden blijven dominant op mobiel, met tekst herpositioneerd rond mediaprioriteit.
- Retail-thumbnails blijven leesbaar via strakkere bijsnijdlogica en dichtere kaartstapeling.
- Beeldgeleide modules blijven het ritme verankeren naarmate de lay-outdichtheid toeneemt.

## 9. Agent-promptgids

### Snelle kleurreferentie
- Primair actieblauw: **Apple actieblauw** (`#0071e3`)
- Inline-linkblauw: **Body-linkblauw** (`#0066cc`)
- Donker hoofdstuk-canvas: **Absoluut zwart** (`#000000`)
- Licht hoofdstuk-canvas: **Bleek Apple-grijs** (`#f5f5f7`)
- Primaire tekst op licht: **Bijna-zwarte inkt** (`#1d1d1f`)
- Secundaire tekst: **Secundair neutraal grijs** (`#6e6e73`)
- Retailrand zacht: **Zacht randgrijs** (`#d2d2d7`)
- Retailrand sterk: **Middelmatig randgrijs** (`#86868b`)

### Voorbeeld-componentprompts
- "Ontwerp een Apple-stijl product-hero op een zwart canvas (`#000000`) met SF Pro Display semibold headline (48-56px), beknopte ondersteunende tekst en twee capsule-CTA's met `#0071e3` en `#1d1d1f`."
- "Maak een commerce-configuratiepaneel op wit (`#ffffff`) met 18px afgeronde kaarten, `#86868b` randvelden, SF Pro Text 17px body-tekst en compacte optieselectors."
- "Bouw een merchandising-kaartgrid dat `#f5f5f7` en witte oppervlakken afwisselt, met beeld-eerst-kaarten, ingetogen schaduwen en 14-17px SF Pro Text metadata."
- "Genereer een carrouselbedieningscluster met cirkelvormige knoppen (50% radius), gedempte grijze overlays en duidelijke actieve feedback voor galerienavigatie."
- "Stel een gemengd marketing- + retail-paginaritme samen: donker showcase-hoofdstuk -> licht feature-hoofdstuk -> dichte productlijstmodule, terwijl blauwe accenten alleen voor acties en links behouden blijven."

### Iteratiegids
1. Vergrendel eerst de neutrale basis (`#000000`, `#f5f5f7`, `#ffffff`) voordat je accenten afstemt.
2. Houd blauwe accenten schaars en doelbewust; als alles blauw is, stort de hiërarchie in.
3. Stem typografie af in deze volgorde: display-schaal, body-leesbaarheid, dan micro-labels.
4. Stem radius af per componentklasse (veld, kaart, capsule, cirkel) in plaats van één-maat-past-iedereen-afronding.
5. Verhoog de dichtheid geleidelijk bij het overgaan van showcasesecties naar commerce-secties.
6. Valideer dat productbeelden de sterkste visuele laag blijven na elke revisie.

### Bekende hiaten
- Aparte semantische statuskleuren (fout/waarschuwing/succes) waren niet consistent zichtbaar in de geëxtraheerde paginaset.
- Sommige interactie-micro-states variëren per module en worden niet weergegeven als universele systeemtokens.
- Een paar retailmodules onthullen contextspecifieke typografie-overrides die niet over alle vijf pagina's verschijnen.
