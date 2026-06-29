# Ontwerpsysteem Geïnspireerd door Figma

> Category: Design & Creatief
> Collaboratief ontwerptool. Levendig veelkleurig, speels maar professioneel.

## 1. Visueel Thema & Sfeer

Figma's interface is het ontwerptool dat zichzelf heeft ontworpen — een meesterwerk in typografische verfijning waarbij een aangepast variabel lettertype (figmaSans) moduleert tussen scheermesdun (weight 320) en vet (weight 700) met tussenstappen op ongebruikelijke waarden (330, 340, 450, 480, 540) die de meeste lettertypesystemen nooit verkennen. Deze nauwkeurige gewichtscontrole geeft elk tekstelement een precies gekalibreerde visuele zwaarte, waardoor hiërarchie ontstaat via micro-verschillen in plaats van het grove instrument van "regulier versus vet."

De pagina presenteert een fascinerende dualiteit: de interfaceschil is strikt zwart-wit (letterlijk alleen `#000000` en `#ffffff` als kleuren), terwijl de herorubriek en productpresentaties exploderen met levendige meerkleursgradiënten — elektrisch groen, helder geel, diep paars, knalroze. Door deze scheiding is het ontwerpsysteem zelf kleurloos en wordt de kleurrijke output van het product als heldinhoud behandeld. De marketingpagina van Figma is in wezen een witte galeriemuur waarop kleurrijke kunst wordt getoond.

Wat Figma onderscheidt naast het variabele lettertype is de cirkel-en-pill-geometrie. Knoppen gebruiken een radius van 50px (pill) of 50% (perfecte cirkel voor pictogramknoppen), wat een organisch, toolpalette-achtig gevoel creëert. De gestippelde focusindicator (`dashed 2px`) is een bewuste ontwerpkeuze die verwijst naar selectiehandvatten in de Figma-editor zelf — de UI-taal van de website verwijst naar de UI-taal van het product.

**Kernkenmerken:**
- Aangepast variabel lettertype (figmaSans) met ongebruikelijke gewichtsstappen: 320, 330, 340, 450, 480, 540, 700
- Strikt zwart-witte interfaceschil — kleur bestaat alleen in productinhoud
- figmaMono voor hoofdlettertechnische labels met brede letterafstand
- Pill- (50px) en cirkelvormige (50%) knopgeometrie
- Gestippelde focusomlijningen die verwijzen naar selectiehandvatten in de Figma-editor
- Levendige meerkleursherogradiënten (groen, geel, paars, roze)
- OpenType `"kern"`-functie wereldwijd ingeschakeld
- Negatieve letterafstand overal — zelfs voor bodytekst van -0.14px tot -0.26px

## 2. Kleurenpalet & Rollen

### Primair
- **Zuiver Zwart** (`#000000`): Alle tekst, alle gevulde knoppen, alle randen. De enige "kleur" van de interface.
- **Zuiver Wit** (`#ffffff`): Alle achtergronden, witte knoppen, tekst op donkere oppervlakken. De andere helft van het binaire stelsel.

*Opmerking: De marketingsite van Figma gebruikt ALLEEN deze twee kleuren voor de interfacelaag. Alle levendige kleuren verschijnen uitsluitend in productschermafbeeldingen, herogradiënten en ingesloten inhoud.*

### Oppervlak & Achtergrond
- **Zuiver Wit** (`#ffffff`): Primaire paginaachtergrond en kaartoppervlakken.
- **Glazen Zwart** (`rgba(0, 0, 0, 0.08)`): Subtiele donkere overlay voor secundaire cirkelvormige knoppen en glaseffecten.
- **Glazen Wit** (`rgba(255, 255, 255, 0.16)`): Matglazen overlay voor knoppen op donkere/gekleurde oppervlakken.

### Gradiëntsysteem
- **Herogradiënt**: Een levendige meerstops-gradiënt met elektrisch groen, helder geel, diep paars en knalroze. Deze gradiënt is de visuele signatuur van de herorubriek — het vertegenwoordigt de creatieve mogelijkheden van het tool.
- **Productrubriekgradiënten**: Individuele productgebieden (Design, Dev Mode, Prototyping) kunnen eigen kleurthema's gebruiken in hun presentaties.

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `figmaSans`, met fallbacks: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Labels**: `figmaMono`, met fallbacks: `figmaMono Fallback, SF Mono, menlo`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (strak) | -1.72px | Maximale impact, extreme spatiëring |
| Sectiekopping | figmaSans | 64px (4rem) | 400 | 1.10 (strak) | -0.96px | Titels van functiesecties |
| Subkopping | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Benadrukte sectietekst |
| Subkopping Licht | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Lichtgewicht sectietekst |
| Functietitel | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Vette kaartkoppen |
| Body Groot | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px tot -0.14px | Beschrijvingen, introducties |
| Body / Knop | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px tot normal | Standaard body, navigatie, knoppen |
| Body Licht | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px tot normal | Lichtgewicht bodytekst |
| Mono Label | figmaMono | 18px (1.13rem) | 400 | 1.30 (strak) | 0.54px | Sectielabels in hoofdletters |
| Mono Klein | figmaMono | 12px (0.75rem) | 400 | 1.00 (strak) | 0.6px | Kleine tags in hoofdletters |

### Principes
- **Nauwkeurigheid van variabel lettertype**: figmaSans gebruikt gewichten die de meeste systemen nooit aanraken — 320, 330, 340, 450, 480, 540. Dit creëert hiërarchie via subtiele gewichtsverschillen in plaats van dramatische sprongen. Het verschil tussen 330 en 340 is vrijwel onmerkbaar, maar structureel significant.
- **Licht als basis**: De meeste bodytekst gebruikt 320–340 (lichter dan het gebruikelijke 400 "regulier"), waardoor een etherische, luchtige leeservaring ontstaat die aansluit bij de esthetiek van het ontwerptool.
- **Kern overal**: Elk tekstelement schakelt de OpenType `"kern"`-functie in — uitlijning is niet optioneel, het is structureel.
- **Negatieve spatiëring als standaard**: Zelfs bodytekst gebruikt -0.1px tot -0.26px letterafstand, waardoor universeel strakke tekst ontstaat. Displaytekst comprimeeert verder naar -0.96px en -1.72px.
- **Mono voor structuur**: figmaMono in hoofdletters met positieve letterafstand (0.54px–0.6px) creëert technische wegwijzerlabels.

## 4. Componentstijlen

### Knoppen

**Zwart Gevuld (Pill)**
- Achtergrond: Zuiver Zwart (`#000000`)
- Tekst: Zuiver Wit (`#ffffff`)
- Radius: cirkel (50%) voor pictogramknoppen
- Focus: gestippelde omlijning van 2px
- Maximale nadruk

**Witte Pill**
- Achtergrond: Zuiver Wit (`#ffffff`)
- Tekst: Zuiver Zwart (`#000000`)
- Opvulling: 8px 18px 10px (asymmetrisch verticaal)
- Radius: pill (50px)
- Focus: gestippelde omlijning van 2px
- Standaard CTA op donkere/gekleurde oppervlakken

**Glazen Donker**
- Achtergrond: `rgba(0, 0, 0, 0.08)` (subtiele donkere overlay)
- Tekst: Zuiver Zwart
- Radius: cirkel (50%)
- Focus: gestippelde omlijning van 2px
- Secundaire actie op lichte oppervlakken

**Glazen Licht**
- Achtergrond: `rgba(255, 255, 255, 0.16)` (matglas)
- Tekst: Zuiver Wit
- Radius: cirkel (50%)
- Focus: gestippelde omlijning van 2px
- Secundaire actie op donkere/gekleurde oppervlakken

### Kaarten & Containers
- Achtergrond: Zuiver Wit
- Rand: geen of minimaal
- Radius: 6px (kleine containers), 8px (afbeeldingen, kaarten, dialoogvensters)
- Schaduw: subtiele tot middelhoge verheffingseffecten
- Productschermafbeeldingen als kaartinhoud

### Navigatie
- Strakke horizontale navigatie op wit
- Logo: Figma-woordmerk in zwart
- Producttabs: pill-vormige tabnavigatie (50px)
- Links: zwarte tekst, onderstreping van 1px decoratie
- CTA: Zwarte pill-knop
- Hover: tekstkleur via CSS-variabele

### Onderscheidende Componenten

**Producttabbalk**
- Horizontale pill-vormige tabs (radius 50px)
- Elke tab vertegenwoordigt een Figma-productgebied (Design, Dev Mode, Prototyping, enz.)
- Actieve tab gemarkeerd

**Herogradiëntsectie**
- Volledige breedte levendige meerkleursgradiëntachtergrond
- Witte tekstoverlay met 86px displaykopping
- Productschermafbeeldingen zwevend in de gradiënt

**Gestippelde Focusindicatoren**
- Alle interactieve elementen gebruiken `dashed 2px` omlijning bij focus
- Verwijst naar de selectiehandvatten in de Figma-editor
- Een meta-ontwerpkeuze die website en product verbindt

## 5. Layoutprincipes

### Spacingsysteem
- Basiseenheid: 8px
- Schaal: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Raster & Container
- Maximale containerbreedte: tot 1920px
- Hero: volledige breedte gradiënt met gecentreerde inhoud
- Productsecties: afwisselende presentaties
- Footer: donkere sectie met volledige breedte
- Responsief van 559px tot 1920px

### Witruimtefilosofie
- **Galerieachtig ritme**: Ruime spacing laat elke productsectie ademen als een eigen tentoonstelling.
- **Kleurensecties als visuele ademruimte**: De gradiënthero en productpresentaties bieden chromatische verlichting tussen de monochrome interfacesecties.

### Randradius-schaal
- Minimaal (2px): Kleine linkelementen
- Subtiel (6px): Kleine containers, scheidingslijnen
- Comfortabel (8px): Kaarten, afbeeldingen, dialoogvensters
- Pill (50px): Tabknoppen, CTA's
- Cirkel (50%): Pictogramknoppen, cirkelvormige elementen

## 6. Diepte & Verheffing

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Vlak (Niveau 0) | Geen schaduw | Paginaachtergrond, meeste tekst |
| Oppervlak (Niveau 1) | Witte kaart op gradiënt/donkere sectie | Kaarten, productpresentaties |
| Verheven (Niveau 2) | Subtiele schaduw | Zwevende kaarten, hovertoestanden |

**Schaduwfilosofie**: Figma gebruikt schaduwen spaarzaam. De primaire dieptemechanismen zijn **achtergrondcontrast** (witte inhoud op kleurrijke/donkere secties) en de inherente dimensionaliteit van de productschermafbeeldingen zelf.

## 7. Do's en Don'ts

### Do
- Gebruik figmaSans met precieze variabele gewichten (320–540) — de nauwkeurige gewichtscontrole ÍS het ontwerp
- Houd de interface strikt zwart-wit — kleur komt alleen uit productinhoud
- Gebruik pill- (50px) en cirkelvormige (50%) geometrie voor alle interactieve elementen
- Pas gestippelde omlijningen van 2px toe voor focus — het kenmerkende toegankelijkheidspatroon
- Schakel de `"kern"`-functie in op alle tekst
- Gebruik figmaMono in hoofdletters met positieve letterafstand voor labels
- Pas negatieve letterafstand toe overal (-0.1px tot -1.72px)

### Don't
- Voeg geen interfacekleuren toe — het monochrome palet is absoluut
- Gebruik geen standaard lettertypegewichten (400, 500, 600, 700) — gebruik de unieke stappen van het variabele lettertype (320, 330, 340, 450, 480, 540)
- Gebruik geen scherpe hoeken op knoppen — alleen pill- en cirkelvormige geometrie
- Gebruik geen gevulde focusomlijningen — gestippeld is de signatuur
- Verhoog het bodytekstgewicht niet boven 450 — de lichtgewicht esthetiek is essentieel
- Gebruik geen positieve letterafstand op bodytekst — het is altijd negatief

## 8. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijke Wijzigingen |
|------|-------|-------------|
| Klein Mobiel | <560px | Compact layout, gestapeld |
| Tablet | 560–768px | Kleine aanpassingen |
| Klein Bureaublad | 768–960px | 2-kolomlay-outs |
| Bureaublad | 960–1280px | Standaardlayout |
| Groot Bureaublad | 1280–1440px | Uitgebreid |
| Ultrabreed | 1440–1920px | Maximale breedte |

### Samenvouwstrategie
- Herotekst: 86px → 64px → 48px
- Producttabs: horizontaal scrollen op mobiel
- Functiesecties: gestapeld in één kolom
- Footer: meerdere kolommen → gestapeld

## 9. Agent Prompt-gids

### Snelle Kleurverwijzing
- Alles: "Zuiver Zwart (#000000)" en "Zuiver Wit (#ffffff)"
- Glazen Donker: "rgba(0, 0, 0, 0.08)"
- Glazen Licht: "rgba(255, 255, 255, 0.16)"

### Voorbeeldprompts voor Componenten
- "Maak een hero op een levendige meerkleursgradiënt (groen, geel, paars, roze). Kopping op 86px figmaSans weight 400, line-height 1.0, letter-spacing -1.72px. Witte tekst. Witte pill CTA-knop (radius 50px, opvulling 8px 18px)."
- "Ontwerp een producttabbalk met pill-vormige knoppen (radius 50px). Actief: zwarte achtergrond, witte tekst. Inactief: transparant, zwarte tekst. figmaSans op 20px weight 480."
- "Bouw een sectielabel: figmaMono 18px, hoofdletters, letter-spacing 0.54px, zwarte tekst. Kern ingeschakeld."
- "Maak bodytekst op 20px figmaSans weight 330, line-height 1.40, letter-spacing -0.14px. Zuiver Zwart op wit."

### Iteratiegids
1. Gebruik variabele lettertypegewichtsstappen precies: 320, 330, 340, 450, 480, 540, 700
2. Interface is altijd zwart + wit — voeg nooit kleuren toe aan de schil
3. Gestippelde focusomlijningen, niet gevuld
4. Letterafstand is altijd negatief op body, altijd positief op monolabels
5. Pill (50px) voor knoppen/tabs, cirkel (50%) voor pictogramknoppen
