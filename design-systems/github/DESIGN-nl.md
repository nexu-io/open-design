# Ontwerpsysteem geïnspireerd door GitHub

> Category: Ontwikkelaarstools
> Codegedreven platform. Functionele dichtheid, blauw-op-wit precisie, Primer-fundamenten.

## 1. Visueel thema en sfeer

GitHub's oppervlak is geconstrueerd, niet gedecoreerd. Elk pixel verkondigt een standpunt: dit is een tool voor mensen die geven om diffs, builds en pull requests. De pagina-achtergrond is een strak `#ffffff` (licht) of `#0d1117` (donker), met inhoud gerangschikt op dichte rechthoekige panelen gescheiden door haarlijndunne randen in plaats van negatieve ruimte. Informatiedichtheid is het merk — lijstrijen, coderegels, repositoryheaders en notificatiekaarten staan dicht op elkaar, zodat een gevorderde gebruiker honderd items kan scannen zonder te scrollen.

De kenmerkende accenten zijn **Primer-blauw** (`#0969da`) voor links en primaire acties, en **GitHub-groen** (`#1a7f37`) voor samengevoegde statussen, succes en de samenvoegknop zelf. Beide ogen licht gedempt vergeleken met consumentenproduct-blauw en -groen — verzadigd genoeg om leesbaar te zijn op de dichte grijze tekst, terughoudend genoeg om op te gaan in de achtergrond wanneer er meerdere in één viewport verschijnen.

Typografie gebruikt de **system-ui**-stack door het hele product, zodat tekst scherp wordt weergegeven op elk besturingssysteem, aangevuld met **SFMono / Menlo / Consolas** voor code. Er is geen redactioneel weergavelettertype; de stem van GitHub is de stem van het systeem dat je al gebruikt.

**Kernkenmerken:**
- Echt wit canvas (`#ffffff`) of diep marinezwart (`#0d1117`) — geen warmte, geen tint
- Haarlijndunne grijze randen (`#d0d7de`) definiëren elk paneel en vlak
- Primer-blauw (`#0969da`) voor links/primair; GitHub-groen (`#1a7f37`) voor succes/samenvoegen
- system-ui voor proza; SFMono voor code — geen aangepast lettertype
- Dichte lijstrijen met minimale opvulling; witruimte is zeldzaam
- Octicon-pictogrammen op 16px / 24px — enkellijnig, geometrisch, consistent
- Peervormige statusbadges met sterke kleursemantieken

## 2. Kleurenpalet en rollen

### Primair
- **Canvas Standaard** (`#ffffff`): Primaire pagina-achtergrond, licht thema.
- **Canvas Subtiel** (`#f6f8fa`): Secundaire oppervlak, zijbalk, invoerveld-achtergrond, koptekstbalk.
- **Canvas Inset** (`#eaeef2`): Codeblok-achtergrond, diep ingebed oppervlak.
- **Fg Standaard** (`#1f2328`): Primaire tekst, koppen, inkt.
- **Fg Gedempt** (`#656d76`): Secundaire tekst, bijschriften, bestandspaden.

### Merkaccent
- **Primer-blauw** (`#0969da`): Links, primaire CTA's, focusring-basis — de universele interactieve kleur.
- **Primer-blauw hover** (`#0550ae`): Hover/ingedrukt voor primair blauw.
- **Accent Subtiel** (`#ddf4ff`): Zacht blauw oppervlak voor uitroepen, informatiebanners.

### Semantisch
- **Succes / Samenvoeging Groen** (`#1a7f37`): Samengevoegde PR's, succesbadges, samenvoegknop.
- **Succes Subtiel** (`#dafbe1`): Succes oppervlaktint.
- **Open Groen** (`#1a7f37`): "Open" issue/PR-status.
- **Gesloten / Gevaar Rood** (`#cf222e`): Gesloten PR's, destructieve actie, validatiefout.
- **Gevaar Subtiel** (`#ffebe9`): Foutbanner-oppervlak.
- **Aandacht / Waarschuwing Geel** (`#9a6700`): Waarschuwingstekst op amberkleurig oppervlak.
- **Aandacht Subtiel** (`#fff8c5`): Waarschuwingsbanner-oppervlak.
- **Gereed Paars** (`#8250df`): Samengevoegd-en-gearchiveerd, "gereed"-status, premium-badge.
- **Sponsor Roze** (`#bf3989`): Sponsors-hart, GitHub-sponsorsmerk.

### Rand en scheiding
- **Rand Standaard** (`#d0d7de`): Standaard haarlijndunne rand, paneelomtrek.
- **Rand Gedempt** (`#d8dee4`): Binnenste scheidingslijnen binnen een paneel.
- **Rand Subtiel** (`#eaeef2`): Vage tabelrijscheidingslijnen.

### Donker thema
- **Donker Canvas** (`#0d1117`): Donkere pagina-achtergrond.
- **Donker Oppervlak** (`#161b22`): Zijbalk, koptekst, secundair oppervlak.
- **Donkere Rand** (`#30363d`): Standaard donkermodus-rand.
- **Donker Fg** (`#e6edf3`): Primaire tekst op donker.

## 3. Typografieregels

### Lettertypefamilie
- **Hoofdtekst / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterafstand | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Repositoryheader, marketinghero |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normaal | Paginakopping |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normaal | Sectiekopping |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normaal | Subonderdeel, paneelkopje |
| Hoofdtekst | system-ui | 14px (0.875rem) | 400 | 1.5 | normaal | Standaard tekstgrootte — niet 16px |
| Kleine tekst | system-ui | 12px (0.75rem) | 400 | 1.4 | normaal | Bijschriften, bestandsmetadata |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normaal | Codeblokken, diff |
| Inline code | SFMono | 0.85em | 400 | overnemen | normaal | Inline `code`-spans |

### Principes
- **14px tekst, niet 16px**: GitHub's prozadichtheid is zijn identiteit. Het product wordt gelezen op 14px om meer rijen in een viewport te passen.
- **Binair gewicht**: 400 voor alles standaard; 600 voor koppen en nadruk. Geen 500, geen 700.
- **Altijd systeemlettertypen**: laad nooit een weblettertype voor de chrome — tekst moet direct renderen op trage verbindingen.

## 4. Componentstijlen

### Knoppen

**Primair (Groen)**
- Achtergrond: `#1f883d`
- Tekst: `#ffffff`
- Rand: 1px solid `rgba(31, 35, 40, 0.15)`
- Opvulling: 5px 16px
- Radius: 6px
- Schaduw: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: achtergrond `#1a7f37`
- Gebruik: "Repository aanmaken", "Pull request samenvoegen"

**Standaard**
- Achtergrond: `#f6f8fa`
- Tekst: `#1f2328`
- Rand: 1px solid `#d0d7de`
- Opvulling: 5px 16px
- Radius: 6px
- Hover: achtergrond `#f3f4f6`, rand `#d0d7de`

**Omtrek (blauwe linkstijl)**
- Achtergrond: `#ffffff`
- Tekst: `#0969da`
- Rand: 1px solid `#d0d7de`
- Hover: achtergrond `#0969da`, tekst `#ffffff`

**Gevaar**
- Achtergrond: `#ffffff`
- Tekst: `#cf222e`
- Rand: 1px solid `#d0d7de`
- Hover: achtergrond `#a40e26`, tekst `#ffffff`, rand `#a40e26`

### Kaarten / Vakken
- Achtergrond: `#ffffff`
- Rand: 1px solid `#d0d7de`
- Radius: 6px
- Opvulling: 16px (koptekst) + 16px (inhoud)
- Koptekst heeft een `#f6f8fa`-balk met onderrand.

### Invoervelden
- Achtergrond: `#ffffff`
- Rand: 1px solid `#d0d7de`
- Radius: 6px
- Opvulling: 5px 12px
- Focus: rand `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### Statuspillen (Issue / PR)
- **Open**: achtergrond `#1a7f37`, tekst wit, opvulling 4px 10px, radius 9999px.
- **Gesloten**: achtergrond `#cf222e`, tekst wit.
- **Samengevoegd**: achtergrond `#8250df`, tekst wit.
- **Concept**: achtergrond `#6e7781`, tekst wit.

### Labels (Tags op issues/PR's)
- Opvulling: 0 7px
- Radius: 9999px
- Lettertype: 12px / 500
- Achtergrond en tekst zijn programmatisch (labelkleur → tekst berekend voor contrast).

## 5. Afstand en indeling

- **Basiseenheid**: 4px. Afstandsschaal: 4, 8, 12, 16, 24, 32, 40, 48.
- **Maximale paginabreedte**: 1280px (`Container-xl`).
- **Zijbalk**: 296px op desktop, klapt samen onder 1012px.
- **Rijopvulling**: 16px horizontaal, 12px verticaal (lijsten zijn bewust compact).

## 6. Beweging

- **Duur**: 80ms voor hover; 200ms voor menu/popover openen.
- **Versoepeling**: `ease-out` voor openen, `ease-in` voor sluiten.
- **Vermeden**: paginalaadinimaties, parallax, aanhoudende micro-interacties. Dingen verschijnen; ze voeren geen show op.

## 7. Gebruiksrichtlijnen

- Houd dichte lijsten, omrande vakken en systeemtypografie bij elkaar; geïsoleerde groene knoppen zijn niet genoeg om een GitHub-achtig productoppervlak te creëren.
- Gebruik groen voor constructieve repositoryacties, blauw voor links en focus, en rood/paars/grijs alleen voor issue-, PR- en workflowstatussen.
- Geef de voorkeur aan rustige opmaak, expliciete randen en compacte afstand boven decoratieve schaduwen of grote marketingkaarten.
