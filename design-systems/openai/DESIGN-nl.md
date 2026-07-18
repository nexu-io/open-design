# Ontwerpsysteem geïnspireerd door OpenAI

> Category: AI & LLM
> Rustig, bijna-monochromatisch systeem verankerd in een diep teal-zwart met royale witruimte en redactionele typografie.

## 1. Visueel Thema & Sfeer

Het productoppervlak van OpenAI leest als een onderzoekslab dat zich klaar heeft gemaakt voor het publiek — klinisch, ingetogen, bewust stil. De pagina-achtergrond is een puur wit (`#ffffff`) gelaagd over een bijna-zwarte inkt (`#0d0d0d`) met een subtiele teal-ondertoon, zodat zelfs de tekst iets afgekoeld aanvoelt in plaats van agressief donker. Het resultaat is een chromatische neutraliteit die modeluitvoer, code en proza centraal stelt — niet de chrome eromheen.

De kenmerkende aanpak is het gebruik van **Söhne** (of de systeemvervanger `inter`) op ingetogen gewichten — 400 voor lopende tekst, 500 voor navigatie en labels, 600 voor nadruk — gecombineerd met **Signifier**, een hedendaags schreeflettertype dat wordt ingezet voor redactionele weergave. Waar de meeste AI-merken futuristisch neigen, geven de schreefkoppen van OpenAI het product een stilletjes literaire toon, alsof elk aankondiging een essay is.

Het vormsysteem is uniform zacht: 8px–12px radii, 9999px pills voor tags en chips, geen harde hoeken ergens. Sectieovergangen worden aangeduid met witruimte in plaats van scheidingslijnen; wanneer randen verschijnen zijn het `#e5e5e5` haarlijnen die eerder als afwezigheid van kleur worden gelezen dan als aanwezigheid ervan.

**Belangrijkste Kenmerken:**
- Puur wit canvas (`#ffffff`) met diep teal-zwarte inkt (`#0d0d0d`)
- Söhne / Inter op bescheiden gewichten (400, 500, 600) — terughoudendheid boven assertiviteit
- Signifier schreef voor redactionele weergavekoppen
- Zachte 8–12px radii overal; 9999px pills voor chips
- Haarlijnen (`#e5e5e5`) spaarzaam ingezet; witruimte als primaire verdeler
- Eenkleurige illustraties in diep teal — geen kleurverlopen in merktekens
- Royale regelafstand (1.55–1.65) en spatiëring nabij nul

## 2. Kleurenpalet & Rollen

### Primair
- **Puur Wit** (`#ffffff`): Primaire achtergrond, kaartoppervlak, knopachtergrond.
- **Inktezwart** (`#0d0d0d`): Primaire tekst, merkteken, primaire CTA.
- **Zacht Zwart** (`#1a1a1a`): Secundaire kop, alternatieve inkt voor niet-kritieke tekst.

### Oppervlak & Achtergrond
- **Nevel** (`#fafafa`): Sectie-achtergrond voor afwisseling, voettekstoppervlak.
- **Parels** (`#f5f5f5`): Kaartoppervlak, verheven paneel.
- **Wolk** (`#ececec`): Uitgeschakelde achtergrond, scheidingslijn-tint.

### Merkaccent
- **OpenAI Teal** (`#10a37f`): Merkprimair, link, markeringsbadge — de enige kleur in een verder neutraal systeem.
- **Diep Teal** (`#0a7a5e`): Hover- en ingedrukte staat voor de merkkleur.
- **Zacht Teal** (`#e8f5f0`): Oppervlaktint voor succesbadges, gemarkeerde uitroepen.

### Neutraal & Tekst
- **Grafiet** (`#3c3c3c`): Broodtekst, standaard leeskleur.
- **Leisteen** (`#6e6e6e`): Secundaire tekst, bijschriften, metadata.
- **As** (`#9b9b9b`): Tertiaire tekst, plaatshouder, uitgeschakeld label.
- **Steen** (`#c4c4c4`): Decoratieve scheidingslijnen, vage iconen.

### Semantisch & Rand
- **Randhaarlijn** (`#e5e5e5`): Standaard haarlijnscheidingsteken.
- **Zachte Rand** (`#ededed`): Kaartomlijning op wit oppervlak.
- **Fout** (`#ef4146`): Validatie, destructieve actie.
- **Waarschuwing** (`#f5a623`): Zacht amber voor adviestoestanden.
- **Info** (`#2563eb`): Informatieve linktoon (spaarzaam gebruikt; teal heeft voorrang).

## 3. Typografieregels

### Lettertypefamilie
- **Weergave / Redactioneel**: `Signifier`, met terugval: `'Source Serif Pro', Georgia, serif`
- **Broodtekst / UI**: `Söhne`, met terugval: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, met terugval: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterspatiëring | Notities |
|------|------|------|--------|-------------|----------------|-------|
| Weergave | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Redactionele hero, aankondigingstitels |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Paginakop |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Sectiekop |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Subsectie |
| Grote Broodtekst | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Inleidende alinea's |
| Broodtekst | Söhne | 16px (1rem) | 400 | 1.65 | normal | Standaard leestekst |
| Kleine Broodtekst | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Kaartinhoud, compacte UI |
| Bijschrift | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadata, badges |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Wenkbrauw, navigatielinks in hoofdletters |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Codeblokken, terminaluitvoer |

### Principes
- **Terughoudendheid als identiteit**: gewichten beperkt tot 600; 700+ voelt merkreemd aan. Hiërarchie komt van grootte en kleur, niet van gewicht.
- **Schreef voor ziel, schreefloos voor systeem**: Signifier verschijnt alleen in redactionele weergavemomenten. De product-UI is uitsluitend schreefloos.
- **Negatieve spatiëring bij weergave**: -0.02em bij weergaveformaten; spatiëring keert terug naar nul bij 16px.

## 4. Componentstijlen

### Knoppen

**Primair**
- Achtergrond: `#0d0d0d`
- Tekst: `#ffffff`
- Opvulling: 10px 18px
- Radius: 9999px (volledige pill) voor chips, 12px voor rechthoekige CTA's
- Hover: `#1a1a1a` achtergrond
- Gebruik: Primaire CTA, "Try ChatGPT", "Sign in"

**Secundair**
- Achtergrond: `#ffffff`
- Tekst: `#0d0d0d`
- Rand: 1px solid `#e5e5e5`
- Opvulling: 10px 18px
- Radius: 12px
- Hover: achtergrond `#fafafa`, rand `#d4d4d4`

**Merkaccent**
- Achtergrond: `#10a37f`
- Tekst: `#ffffff`
- Opvulling: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Gebruik: Gemarkeerde upgrade-CTA, succespad

### Kaarten
- Achtergrond: `#ffffff`
- Rand: 1px solid `#ededed`
- Radius: 16px
- Opvulling: 24px–32px
- Schaduw: standaard geen; bij hover `0 4px 16px rgba(13,13,13,0.06)`

### Invoervelden
- Achtergrond: `#ffffff`
- Rand: 1px solid `#e5e5e5`
- Radius: 12px
- Opvulling: 12px 14px
- Focus: rand `#10a37f`, ring `0 0 0 3px rgba(16,163,127,0.12)`

### Pills & Tags
- Achtergrond: `#f5f5f5`
- Tekst: `#3c3c3c`
- Opvulling: 4px 10px
- Radius: 9999px
- Lettertype: 12px / 500

## 5. Afstand & Lay-out

- **Basiseenheid**: 4px. Schaal: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: max-width 1200px, 24px marge op mobiel, 48px op desktop.
- **Sectieritmiek**: 96–128px verticaal tussen grote secties; 64px op mobiel.
- **Raster**: 12 kolommen op desktop, 4 kolommen op mobiel, 24px tussenruimte.

## 6. Beweging

- **Duur**: 150–220ms voor hover; 280–360ms voor lay-outtransities.
- **Versnelling**: `cubic-bezier(0.16, 1, 0.3, 1)` (vloeiend uit) voor ingangen.
- **Terughoudendheid**: geen parallax, geen scroll-jacking. Uitsluitend subtiele vervaging en verschuiving.

## 7. Gebruiksrichtlijnen

- Behoud de neutrale redactionele ingetogenheid, zachte radius en spaarzaam accentgebruik samen; groene accenten alleen creëren geen OpenAI-achtig oppervlak.
- Gebruik Signifier-stijl weergavemomenten alleen voor redactionele of aankondigingshiërarchie, en houd productbesturingen in het schreefloze systeem.
- Vermijd ornamentele beweging, zware schaduwen en overmaatse decoratieve kaarten; het systeem moet rustig, leesbaar en doordacht aanvoelen.
