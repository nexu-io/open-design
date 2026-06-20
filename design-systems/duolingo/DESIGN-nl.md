# Ontwerpsysteem geïnspireerd op Duolingo

> Category: Productiviteit & SaaS
> Taallerenplatform. Helder uilengroen, dikke schaduwen, geGamificeerde vreugde.

## 1. Visueel thema en sfeer

Duolingo is gamificatie als visuele taal. De interface is zonder omwegen helder, met **uilengroen** (`#58cc02`) als primaire merkkleur en een dikke onderschaduw van 4px op elk interactief element dat eruitziet als een 3D-knop die wacht om ingedrukt te worden. De pagina is wit (`#ffffff`) met dikke randen van 2–3px in donkergrijs (`#e5e5e5`), en het hele systeem leest als een iOS-app uit 2015 die herboren is met een betere hiërarchie.

De typografie gebruikt **Feather Bold** (een aangepast afgerond schreefloos lettertype) voor de chrome en **Mona Sans** (of Inter) voor de hoofdtekst. Weergaveformaten zijn groot en zelfverzekerd — Duolingo fluistert nooit. Koppen dragen vaak een groene onderstrepingsstreek of zitten op een groene pil, en het mascotte Duo (een groene uil) verschijnt als een actief illustratiepersonage, niet als een statisch logo.

De vormentaal is vriendelijk: 16–20px stralen op kaarten, 12px op knoppen, 9999px op chips en voortgangsbalken. Iconografie is gevuld, afgerond en kleurgecodeerd per vaardigheid — elk lesoppervlak heeft een direct herkenbaar kleurenpaar.

**Kenmerken:**
- Uilengroen (`#58cc02`) als dominante merkkleur, gebruikt op meer dan 30% van het oppervlak
- Dikke onderschaduw van 4px op elke knop (de "tactiele druk"-affordantie)
- Solide randen van 2–3px, nooit haarlijnen
- Feather Bold (afgerond display) + Mona Sans (hoofdtekst)
- Grote, zelfverzekerde tekst — weergaveformaten beginnen bij 48px en klimmen
- Mascotte als personage: Duo de uil verschijnt bij onboarding, fouten, streken
- Streeksoranje (`#ff9600`) en gemroze (`#ce82ff`) als secundaire merkkleuren

## 2. Kleurpalet & rollen

### Primair
- **Uilengroen** (`#58cc02`): Merkprimair, primaire CTA, juist antwoord.
- **Uilengroen diep** (`#58a700`): Druk-/schaduwkleur voor groene knoppen.
- **Uilengroen licht** (`#89e219`): Hover, zachte vullingen.
- **Uilengroen bleek** (`#dbf8c5`): Zacht oppervlak, succesbanner.

### Secundaire accenten
- **Streeksoranje** (`#ff9600`): Streeksteller, vlampictogram, premium energie.
- **Streeksoranje diep** (`#cc7a00`): Ingedrukt oranje.
- **Gemroze** (`#ce82ff`): Gemvaluta, Super Duolingo.
- **Aalblauwe** (`#1cb0f6`): Hintknop, informatielink.
- **Kardinaalsrood** (`#ff4b4b`): Fout antwoord, leven verloren.
- **Bijengeel** (`#ffc800`): Pro-badge, prestatie.

### Oppervlak
- **Sneeuw** (`#ffffff`): Primaire achtergrond.
- **Aal** (`#f7f7f7`): Sectie-einde, secundair oppervlak.
- **Zwaan** (`#e5e5e5`): Uitgeschakelde achtergrond, ingebed blok.
- **Wolf** (`#777777`): Donkere scheider, secundaire tekst.

### Inkt & tekst
- **Aalzwart** (`#3c3c3c`): Primaire tekst.
- **Wolf** (`#777777`): Secundaire tekst, bijschriften.
- **Haas** (`#afafaf`): Uitgeschakeld, tijdelijke aanduiding.

### Rand
- **Zwaan** (`#e5e5e5`): Standaardrand 2px.
- **Haas** (`#afafaf`): Benadrukte rand bij hover.

## 3. Typografieregels

### Lettertypenreeks
- **Display / UI / Koppen**: `Feather Bold`, met terugval: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Hoofdtekst / Lange tekst**: `Mona Sans`, met terugval: `'Helvetica Neue', system-ui, sans-serif`
- **Code (zeldzaam, scholen/admin)**: `JetBrains Mono`, met terugval: `ui-monospace, Menlo, monospace`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Notities |
|------|------|------|--------|-------------|----------------|-------|
| Display | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Onboarding-hero |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Paginatitel |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Sectiekop |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Kaarttitel, lesrij |
| Grote tekst | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Lesprompt, instructie |
| Tekst | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Standaardtekst |
| Bijschrift | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | XP-teller, metadata |
| Knop | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Standaard knooplabel |
| Streek | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Streeknummer, op vlam |

### Principes
- **800 is de standaard**: Feather Bold loopt op 800 bij koppen en knoppen. 700 voelt zwak aan in dit systeem.
- **Grote tekst**: kopformaten zijn 25–40% groter dan typische productmerken — zelfvertrouwen als identiteit.
- **Afgeronde lettervormingen**: elke glyph heeft zachte uiteinden; scherpe schreven zouden het vriendelijkheidscontract breken.

## 4. Componentstijlen

### Knoppen

**Primair (Uilengroen)**
- Achtergrond: `#58cc02`
- Tekst: `#ffffff`
- Opvulling: 14px 24px
- Radius: 16px
- Border-bottom: 4px solid `#58a700` (de dikke schaduw)
- Hover: achtergrond `#89e219`
- Actief: translate-y 4px, border-bottom 0 (knop "drukt in")
- Gebruik: "Doorgaan", "Controleren", hoofd-CTA.

**Secundair (Wit met onderschaduw)**
- Achtergrond: `#ffffff`
- Tekst: `#777777`
- Rand: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Opvulling: 14px 24px
- Hover: tekst `#3c3c3c`, rand `#afafaf`

**Streeksoranje**
- Achtergrond: `#ff9600`
- Tekst: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Gebruik: streekdoel, "Streek starten"

**Fout (Kardinaalsrood)**
- Achtergrond: `#ff4b4b`
- Tekst: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Gebruik: feedback bij fout antwoord.

### Kaarten / Lestegels
- Achtergrond: `#ffffff`
- Rand: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Opvulling: 16px
- Hover: 2px optillen, schaduw `0 4px 0 #d7d7d7`

### Vaardigheidsboomknoop (Lesbelletje)
- Grootte: 80×72px
- Achtergrond: vaardigheidskleur getint (groen voor actief, grijs voor vergrendeld)
- Border-bottom: 6px solid donkerder variant
- Radius: 50% (cirkelvormig)
- Actief: pulseert 1.0 → 1.05 elke 1.6s

### Invoervelden
- Achtergrond: `#ffffff`
- Rand: 2px solid `#e5e5e5`
- Radius: 12px
- Opvulling: 12px 16px
- Focus: rand `#1cb0f6` (aalblauw), ring `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Voortgangsbalk
- Spoor: `#e5e5e5`
- Vulling: `#58cc02` (of `#ff9600` voor streek)
- Radius: 9999px
- Hoogte: 16px
- Geanimeerde vulling: 320ms ease-out bij toename.

## 5. Afstanden & Lay-out

- **Basiseenheid**: 4px. Schaal: 4, 8, 12, 16, 24, 32, 48, 64.
- **Container**: max. 1080px, 24px goot.
- **Lesboomkolom**: 320px breed; gecentreerd op desktop.

## 6. Beweging

- **Duur**: 180ms voor knopdruk; 320ms voor vaardigheidsknoop-ontgrendeling; 1.6s voor actieve knooppuls.
- **Versnelling**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, lichte overschrijding) voor ontgrendelingen.
- **Mascotte**: Duo knippert elke 4–6s, springt bij streekmijlpalen (480ms ease-out veer).

## 7. Gebruiksrichtlijnen

- Houd het hoogverzadigde uilengroen, dikke onderschaduwen en afgeronde lesgeometrie samen; vlakke groene knoppen alleen lezen niet als Duolingo.
- Reserveer oversized vetgedrukte tekst voor les-, streek- en voortgangsmomenten waar het product aanmoediging of feedback nodig heeft.
- Gebruik speelse beweging spaarzaam rond voortgangsstatuswijzigingen, vermijd generieke stuiteranimaties op elk besturingselement.
