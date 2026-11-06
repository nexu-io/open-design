# Ontwerpsysteem geïnspireerd op Spotify

> Category: Media & Consument
> Muziekstreaming. Levendig groen op donker, vette typografie, albumhoes-gedreven.

## 1. Visueel thema & sfeer

De webinterface van Spotify is een donkere, meeslepende muziekspeler die luisteraars omhult in een bijna-zwarte cocon (`#121212`, `#181818`, `#1f1f1f`), waarin albumhoezen en content de primaire kleurenbron worden. De ontwerpfilosofie is "content-first duisternis" — de UI trekt zich terug in de schaduw zodat muziek, podcasts en afspeellijsten kunnen stralen. Elk oppervlak is een tint antraciet, waardoor een bioscoopachtige omgeving ontstaat waar de enige echte kleur afkomstig is van het iconische Spotify-groen (`#1ed760`) en de albumhoezen zelf.

De typografie maakt gebruik van SpotifyMixUI en SpotifyMixUITitle — eigen lettertypen uit de CircularSp-familie (Circular van Lineto, aangepast voor Spotify) met een uitgebreide fallback-stack die Arabisch, Hebreeuws, Cyrillisch, Grieks, Devanagari en CJK-lettertypen bevat, als weerspiegeling van het mondiale bereik van Spotify. Het typografiesysteem is compact en functioneel: 700 (vet) voor nadruk en navigatie, 600 (halfvet) voor secundaire nadruk en 400 (normaal) voor de bodytekst. Knoppen gebruiken hoofdletters met positieve letterafstand (1.4px–2px) voor een systematische, labelachtige uitstraling.

Wat Spotify onderscheidt, is de pil-en-cirkel-geometrie. Primaire knoppen gebruiken een radius van 500px–9999px (volledige pil), ronde afspeelknoppen gebruiken een radius van 50% en zoekinvoervelden zijn 500px-pillen. In combinatie met zware schaduwen (`rgba(0,0,0,0.5) 0px 8px 24px`) op verheven elementen en een unieke inset-rand-schaduwcombinatie (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`) is het resultaat een interface die aanvoelt als een hoogwaardig audioapparaat — tastbaar, afgerond en gebouwd voor aanraakbediening.

**Kernkenmerken:**
- Meeslepend donker thema in bijna-zwart (`#121212`–`#1f1f1f`) — de UI verdwijnt achter de content
- Spotify-groen (`#1ed760`) als enkelvoudig merkaccent — nooit decoratief, altijd functioneel
- Lettertypenset SpotifyMixUI/CircularSp met ondersteuning voor wereldwijde schriftsoorten
- Pilknoppen (500px–9999px) en ronde bedieningselementen (50%) — afgerond, geoptimaliseerd voor aanraking
- Knooplabels in hoofdletters met brede letterafstand (1.4px–2px)
- Zware schaduwen op verheven elementen (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Semantische kleuren: negatief rood (`#f3727f`), waarschuwingsoranje (`#ffa42b`), aankondigingsblauw (`#539df5`)
- Albumhoes als primaire kleurenbron — de UI is bewust achromatisch

## 2. Kleurenpalet & rollen

### Primair merk
- **Spotify-groen** (`#1ed760`): Primair merkaccent — afspeelknoppen, actieve staten, CTA's
- **Bijna-zwart** (`#121212`): Diepste achtergrondoppervlak
- **Donker oppervlak** (`#181818`): Kaarten, containers, verheven oppervlakken
- **Middonker** (`#1f1f1f`): Knoopachtergronden, interactieve oppervlakken

### Tekst
- **Wit** (`#ffffff`): `--text-base`, primaire tekst
- **Zilver** (`#b3b3b3`): Secundaire tekst, gedempte labels, inactieve navigatie
- **Bijna-wit** (`#cbcbcb`): Iets helderdere secundaire tekst
- **Licht** (`#fdfdfd`): Bijna-zuiver wit voor maximale nadruk

### Semantisch
- **Negatief rood** (`#f3727f`): `--text-negative`, foutmeldingstoestanden
- **Waarschuwingsoranje** (`#ffa42b`): `--text-warning`, waarschuwingstoestanden
- **Aankondigingsblauw** (`#539df5`): `--text-announcement`, informatietoestanden

### Oppervlak & rand
- **Donkere kaart** (`#252525`): Verheven kaartoppervlak
- **Middelste kaart** (`#272727`): Alternatief kaartoppervlak
- **Randgrijs** (`#4d4d4d`): Knopranden op donker
- **Lichte rand** (`#7c7c7c`): Omlijnd knopranden, gedempte links
- **Scheidingslijn** (`#b3b3b3`): Dividerlijnen
- **Licht oppervlak** (`#eeeeee`): Lichte-modus-knoppen (zeldzaam)
- **Spotify-groene rand** (`#1db954`): Groene accentrandvariant

### Schaduwen
- **Zwaar** (`rgba(0,0,0,0.5) 0px 8px 24px`): Dialoogvensters, menu's, verheven panelen
- **Middel** (`rgba(0,0,0,0.3) 0px 8px 8px`): Kaarten, dropdowns
- **Inset-rand** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Invoer-rand-schaduwcombinatie

## 3. Typografieregels

### Lettertypenfamilies
- **Titel**: `SpotifyMixUITitle`, fallbacks: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Body**: `SpotifyMixUI`, zelfde fallback-stack

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Sectietitel | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Vetgedrukt titelgewicht |
| Feature-kop | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (krap) | normal | Halfvette sectiekoppen |
| Body vet | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Benadrukte tekst |
| Body | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Standaard bodytekst |
| Knop hoofdletters | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (krap) | 1.4px–2px | `text-transform: uppercase` |
| Knop | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Standaard knop |
| Navigatielink vet | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigatie |
| Navigatielink | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Inactieve navigatie |
| Bijschrift vet | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Vetgedrukte metadata |
| Bijschrift | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadata |
| Klein vet | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Tags, telwaarden |
| Klein | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Kleine druk |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Kleinste tekst |

### Principes
- **Vet/normaal-binair**: De meeste tekst is 700 (vet) of 400 (normaal), met 700 spaarzaam gebruikt. Dit creëert een duidelijke visuele hiërarchie door gewichtscontrast in plaats van maatvariatatie.
- **Hoofdletterknoppen als systeem**: Knooplabels gebruiken hoofdletters + brede letterafstand (1.4px–2px), waardoor een systematische "label"-stem ontstaat die zich onderscheidt van contenttekst.
- **Compacte maten**: Het bereik is 10px–24px — kleiner dan de meeste systemen. Spotify's typografie is compact en functioneel, ontworpen voor het scannen van afspeellijsten, niet voor het lezen van artikelen.
- **Wereldwijde schriftondersteuning**: De uitgebreide fallback-stack (Arabisch, Hebreeuws, Cyrillisch, Grieks, Devanagari, CJK) weerspiegelt het bereik van Spotify in 180+ markten.

## 4. Componentstijlen

### Knoppen

**Donkere pil**
- Background: `#1f1f1f`
- Text: `#ffffff` or `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (full pill)
- Gebruik: Navigatiepillen, secundaire acties

**Grote donkere pil**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Gebruik: Primaire app-navigatieknoppen

**Lichte pil**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- Gebruik: Lichte-modus-CTA's (cookietoestemming, marketing)

**Omlijnd pil**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (asymmetrisch voor icoon)
- Radius: 9999px
- Gebruik: Volgknoppen, secundaire acties

**Ronde afspeelknop**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50% (cirkel)
- Gebruik: Afspelen/pauzebediening

### Kaarten & containers
- Background: `#181818` or `#1f1f1f`
- Radius: 6px–8px
- Geen zichtbare randen op de meeste kaarten
- Hover: lichte achtergrondverheldering
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px` op verheven elementen

### Invoervelden
- Zoekinvoer: achtergrond `#1f1f1f`, tekst `#ffffff`
- Radius: 500px (pil)
- Padding: 12px 96px 12px 48px (icoonbewust)
- Focus: rand wordt `#000000`, outline `1px solid`

### Navigatie
- Donkere zijbalk met SpotifyMixUI 14px gewicht 700 voor actief, 400 voor inactief
- Gedempte kleur `#b3b3b3` voor inactieve items, `#ffffff` voor actief
- Ronde icoónknoppen (50% radius)
- Spotify-logo linksboven in groen

## 5. Lay-outprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Raster & container
- Zijbalk (vast) + hoofdcontentgebied
- Rastergebaseerde album-/afspeellijstkaarten
- Volledige breedte nu-afspelende balk onderaan
- Responsief contentgebied vult de resterende ruimte

### Witruimtefilosofie
- **Donkere compressie**: Spotify pakt content dicht — afspeellijstrasters, tracklijsten en navigatie zijn allemaal krap gespatieerd. De donkere achtergrond biedt visuele rust tussen elementen zonder dat grote tussenruimten nodig zijn.
- **Contentdichtheid boven ademruimte**: Dit is een app, geen marketingsite. Elke pixel dient de luisterervaring.

### Afgeronde-hoekenschaal
- Minimaal (2px): Badges, expliciete tags
- Subtiel (4px): Invoervelden, kleine elementen
- Standaard (6px): Albumhoescontainers, kaarten
- Comfortabel (8px): Secties, dialoogvensters
- Middel (10px–20px): Panelen, overlay-elementen
- Groot (100px): Grote pilknoppen
- Pil (500px): Primaire knoppen, zoekinvoer
- Volledige pil (9999px): Navigatiepillen, zoeken
- Cirkel (50%): Afspeelknoppen, avatars, iconen

## 6. Diepte & elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Basis (Niveau 0) | Achtergrond `#121212` | Diepste laag, paginaachtergrond |
| Oppervlak (Niveau 1) | `#181818` or `#1f1f1f` | Kaarten, zijbalk, containers |
| Verheven (Niveau 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Dropdownmenu's, hoverkaarten |
| Dialoog (Niveau 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modals, overlays, menu's |
| Inset (rand) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Invoergranden |

**Schaduwfilosofie**: Spotify gebruikt opvallend zware schaduwen voor een donkere app. De schaduw met 0.5 dekking bij 24px vervaging creëert een dramatisch "zwevend in duisternis"-effect voor dialoogvensters en menu's, terwijl de 0.3 dekking bij 8px vervaging een subtielere kaartlift biedt. De unieke inset-rand-schaduwcombinatie op invoervelden creëert een verzonken, tastbare kwaliteit.

## 7. Wel en niet doen

### Wel doen
- Gebruik bijna-zwarte achtergronden (`#121212`–`#1f1f1f`) — diepte door tintenvariatie
- Pas Spotify-groen (`#1ed760`) alleen toe voor afspeelbediening, actieve staten en primaire CTA's
- Gebruik de pilvorm (500px–9999px) voor alle knoppen — cirkel (50%) voor afspeelbediening
- Pas hoofdletters + brede letterafstand (1.4px–2px) toe op knooplabels
- Houd typografie compact (bereik 10px–24px) — dit is een app, geen magazine
- Gebruik zware schaduwen (`0.3–0.5 dekking`) voor verheven elementen op donkere achtergronden
- Laat de albumhoes kleur leveren — de UI zelf is achromatisch

### Niet doen
- Gebruik Spotify-groen niet decoratief of als achtergrondkleur — het is uitsluitend functioneel
- Gebruik geen lichte achtergronden voor primaire oppervlakken — de donkere onderdompeling is essentieel
- Sla de pil-/cirkelgeometrie op knoppen niet over — vierkante knoppen breken de identiteit
- Gebruik geen dunne/subtiele schaduwen — op donkere achtergronden moeten schaduwen zwaar zijn om zichtbaar te zijn
- Voeg geen extra merkkleuren toe — groen + achromatische grijstinten vormen het volledige palet
- Gebruik geen ruime regelafstanden — Spotify's typografie is compact en dicht
- Stel geen onbewerkte grijze randen bloot — gebruik in plaats daarvan schaduw- of inset-randen

## 8. Responsief gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Mobiel klein | <425px | Compact mobiel lay-out |
| Mobiel | 425–576px | Standaard mobiel |
| Tablet | 576–768px | 2-kolomsraster |
| Tablet groot | 768–896px | Uitgebreid lay-out |
| Desktop klein | 896–1024px | Zijbalk zichtbaar |
| Desktop | 1024–1280px | Volledig desktopindeling |
| Groot bureaublad | >1280px | Uitgebreid raster |

### Inklappingstrategie
- Zijbalk: volledig → ingeklapt → verborgen
- Albumraster: 5 kolommen → 3 → 2 → 1
- Nu-afspelende balk: behouden op alle schermformaten
- Zoeken: pilinvoer behouden, breedte past aan
- Navigatie: zijbalk → onderste balk op mobiel

## 9. Agent-promptgids

### Snelle kleurverwijzing
- Achtergrond: Bijna-zwart (`#121212`)
- Oppervlak: Donkere kaart (`#181818`)
- Tekst: Wit (`#ffffff`)
- Secundaire tekst: Zilver (`#b3b3b3`)
- Accent: Spotify-groen (`#1ed760`)
- Rand: `#4d4d4d`
- Fout: Negatief rood (`#f3727f`)

### Voorbeeldcomponentprompts
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### Iteratiegids
1. Begin met #121212 — alles bevindt zich in bijna-zwarte duisternis
2. Spotify-groen alleen voor functionele markeringen (afspelen, actief, CTA)
3. Maak alles een pil — 500px voor groot, 9999px voor klein, 50% voor cirkelvormig
4. Hoofdletters + brede spatiëring op knoppen — de systematische labelstijl
5. Zware schaduwen (0.3–0.5 dekking) voor elevatie — lichte schaduwen zijn onzichtbaar op donker
6. De albumhoes levert alle kleur — de UI blijft achromatisch
