# Ontwerpsysteem geïnspireerd door Discord

> Category: Productiviteit & SaaS
> Spraak- en chatplatform. Diep blurple, donkere basisoppervlakken, speelse accentmomenten.

## 1. Visueel thema & sfeer

Discord's product is ontworpen voor avonduren, raids en groepsgesprekken — daardoor is het gehele interface donker als standaard. Het standaard canvas is het diepe `Background Primary` (`#313338` licht thema, `#1e1f22` donker thema), met chatkolommen gelaagd op iets lichtere of donkerdere tinten om kanalen, threads en zijpanelen te onderscheiden. Het kenmerkende **Blurple** (`#5865f2`) is gereserveerd voor het merkteken, primaire CTA's, vermeldingen en de "jij"-aanduiding — spaarzaam ingezet zodat het opvalt tegen de gedempte neutralen.

Typografie is **gg sans** (Discord's aangepaste Whitney-vervanger) voor lopende tekst en chrome, met afgeronde geometrische vormen die vriendelijk aanvoelen maar toch leesbaar blijven op de kleine lettergroottes die een chatclient vereist. Koppen worden geleidelijk groter; chatrijen zijn compact (4–8px tussen berichtgroepen) zodat uren terugscrolwerk overzichtelijk blijft.

De vormtaal is afgerond maar niet ballonzacht: 8px radii op kaarten, 4px op invoervelden, volledige pill-vormen op statusbadges en tags. Servers zijn afgerond-vierkante avatars van 48px die bij hover veranderen in cirkels — een subtiele animatie die onderdeel is geworden van de merkidentiteit.

**Belangrijkste kenmerken:**
- Donkere basisoppervlakken: `#1e1f22` / `#2b2d31` / `#313338` (3-traps diepte)
- Blurple `#5865f2` als enig verzadigd accent in het chatoppervlak
- gg sans (Whitney-stijl) voor alle tekst — vriendelijk, geometrisch, neutraal
- Afgerond-vierkante server-avatars (16px radius) die bij hover snappen naar cirkels
- Compacte rijspatiëring voor chat, royale opvulling voor zijpanelen
- Statusdots: groen online, geel inactief, rood niet-storen, grijs offline
- Pixelnauwkeurige 1px-scheidingslijnen in subtiel gebroken wit met lage alpha

## 2. Kleurenpalet & rollen

### Primair
- **Blurple** (`#5865f2`): Merkprimair, primaire CTA, vermelding-highlight.
- **Blurple Hover** (`#4752c4`): Hover/actief voor blurple.
- **Blurple Soft** (`#7289da`): Oud blurple, secundair accent in marketing.

### Oppervlak (donker thema — standaard)
- **Background Tertiary** (`#1e1f22`): Serverlijstrail, diepste achtergrond.
- **Background Secondary** (`#2b2d31`): Kanaalsidebar, instellingssidebar.
- **Background Primary** (`#313338`): Chatoppervlak, berichtenkolom.
- **Background Floating** (`#111214`): Zwevende popovers, tooltips, automatisch aanvullen.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Hover-overlay op rijen.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Actieve rij.

### Oppervlak (licht thema)
- **Light Bg Primary** (`#ffffff`): Chatoppervlak in licht thema.
- **Light Bg Secondary** (`#f2f3f5`): Sidebar in licht thema.
- **Light Bg Tertiary** (`#e3e5e8`): Diepste lichte oppervlak.

### Tekst
- **Header Primary** (`#f2f3f5`): Kanaalkoppen, modaltitels in donker thema.
- **Header Secondary** (`#b5bac1`): Gedempte koppen.
- **Text Normal** (`#dbdee1`): Bodytekst in donker thema — iets koeler dan puur wit.
- **Text Muted** (`#949ba4`): Tijdstempels, servernamen, secundaire metadata.
- **Text Link** (`#00a8fc`): Hyperlinks in berichten — hemelsblauw, onderscheidend van blurple.
- **Channels Default** (`#80848e`): Inactieve kanaalnaam in sidebar.

### Status & semantisch
- **Status Online** (`#23a55a`): Online-dot, succestoestanden.
- **Status Idle** (`#f0b232`): Inactief-dot, afwezig.
- **Status DND** (`#f23f43`): Niet-storen, ook gebruikt als destructief rood.
- **Status Streaming** (`#593695`): "Streaming"-paars.
- **Status Offline** (`#80848e`): Offline-grijs.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Zachte blurple-gloed op @vermelding-rijen.

### Rand & scheidingslijn
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Standaard scheidingslijn in donker.
- **Border Subtle** (`#3f4147`): Effen scheidingslijn voor kaarten.

## 3. Typografieregels

### Lettertypefamilie
- **Body / UI / Koppen**: `gg sans`, met fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (oud / Whitney)**: `Whitney`, met fallback: `gg sans`
- **Code / Mono**: `"gg mono"`, met fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Marketing hero |
| Paginakop | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Instellingen-/profieltitels |
| Kanaalnaam | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, kanaalkoptekst |
| Berichttekst | gg sans | 16px (1rem) | 400 | 1.375 | normal | Standaard chattekst |
| Gebruikersnaam | gg sans | 16px (1rem) | 500 | 1.25 | normal | Auteur van een bericht |
| Tijdstempel | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Vandaag om 16:32" |
| Sidebar-kanaal | gg sans | 16px (1rem) | 500 | 1.25 | normal | Kanaalslijstrijen |
| Servernaam | gg sans | 16px (1rem) | 600 | 1.25 | normal | Serverkopregel |
| Bijschrift / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Statustekst, bewerkt-label |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | Inline `code` |
| Codeblok | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | ```driedubbel-omheind``` blok |

### Principes
- **Vriendelijke geometrie**: gg sans vervangt Whitney met afgeronde uiteinden op a/g/s — het merk wil warmte zonder leesbaarheid op te offeren.
- **Gewichtscontrast boven kleurcontrast**: hiërarchie komt voort uit gewichtsstappen 400→500→600→700→800; het oppervlak blijft neutraal.
- **16px bodytekst**: chatberichten krimpen niet onder 16px. Dichtheid komt van regelhoogte (1.375), niet van lettergrootte.

## 4. Componentstijlen

### Knoppen

**Primair**
- Achtergrond: `#5865f2`
- Tekst: `#ffffff`
- Opvulling: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- Gebruik: Primaire CTA's, "Doorgaan", "Server joinen"

**Secundair**
- Achtergrond: `#4e5058`
- Tekst: `#ffffff`
- Opvulling: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tertiair / Subtiel (linkstijl)**
- Achtergrond: transparant
- Tekst: `#dbdee1`
- Hover: tekst onderstreept, geen achtergrondverandering

**Gevaarlijk**
- Achtergrond: `#da373c`
- Tekst: `#ffffff`
- Hover: `#a12d2f`

### Invoervelden
- Achtergrond: `#1e1f22`
- Tekst: `#dbdee1`
- Rand: 1px solid `#1e1f22`
- Radius: 4px
- Opvulling: 10px 12px
- Focus: rand `#5865f2`

### Server-avatars
- Grootte: 48×48px
- Radius: 16px (afgerond vierkant) standaard; gaat bij hover en actief over naar 50%.
- Actieve toestand: 4px witte pill aan de linkerrand van de icoonskolom.

### Statusdots
- Grootte: 10×10px
- Rand: 3px solid background-tertiary (creëert het "inkeping"-effect)
- Positie: rechtsonder op de avatar.

### Kaarten / Insluitingen
- Achtergrond: `#2b2d31` (donker) of `#f2f3f5` (licht)
- Linkerrand: 4px solid insluiting-accentkleur.
- Radius: 4px
- Opvulling: 8px 16px

### Vermelding-pill
- Achtergrond: `rgba(88, 101, 242, 0.3)`
- Tekst: `#c9cdfb`
- Opvulling: 0 2px
- Radius: 3px

## 5. Spatiëring & lay-out

- **Basiseenheid**: 4px. Schaal: 4, 8, 12, 16, 20, 24, 32, 40.
- **Serverrail**: 72px breed, vast.
- **Kanaalsidebar**: 240px breed.
- **Ledenlijst**: 240px breed op desktop.
- **Chatkolom**: fluid, minimaal 380px.

## 6. Beweging

- **Duur**: 200ms voor hover; 350ms voor de avatar-cirkelmorfose; 80ms voor tooltip-fade.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` voor de avatarmorfose (vlot aanloopje, dan bezinken).
- **Melding-puls**: 1.4s ease-in-out infinite op de indicator voor ongelezen vermeldingen.

## 7. Gebruiksrichtlijnen

- Bewaar de donkere schil, compacte dichtheid en blurple-actiehiërarchie gezamenlijk; blurple gebruiken op een lichte, marketingachtige lay-out doorbreekt het Discord-productgevoel.
- Houd navigatie-intensieve oppervlakken gestructureerd rondom rails, sidebars en chatkolommen in plaats van geïsoleerde decoratieve kaarten.
- Gebruik de afgerond-vierkante avatar en statusdot-taal bij het weergeven van mensen, servers of actieve aanwezigheid.
