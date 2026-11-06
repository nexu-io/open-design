# Ontwerpsysteem Geïnspireerd door Notion

> Category: Productiviteit & SaaS
> Alles-in-één werkruimte. Warme minimalisme, schreefkoppen, zachte oppervlakken.

## 1. Visueel Thema & Sfeer

De website van Notion belichaamt de filosofie van het gereedschap zelf: een blanco canvas dat niet in de weg staat. Het ontwerpsysteem is gebouwd op warme neutralen in plaats van koude grijstinten, wat een uitgesproken toegankelijk minimalisme creëert dat aanvoelt als kwaliteitspapier in plaats van steriel glas. Het paginacanvas is puur wit (`#ffffff`), maar de tekst is niet puur zwart -- het is een warme bijna-zwart (`rgba(0,0,0,0.95)`) die de leeservaring onmerkbaar verzacht. De warme grijsschaal (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) draagt subtiele geel-bruine ondertonen, waardoor de interface een tactiele, bijna analoge warmte krijgt.

Het aangepaste NotionInter-lettertype (een aangepaste Inter) is de ruggengraat van het systeem. Op weergaveformaten (64px) gebruikt het een agressieve negatieve letterspatiëring (-2.125px), wat koppen creëert die gecomprimeerd en precies aanvoelen. Het gewichtsbereik is breder dan typische systemen: 400 voor de hoofdtekst, 500 voor UI-elementen, 600 voor semi-vette labels en 700 voor weergavekoppen. OpenType-functies `"lnum"` (staande cijfers) en `"locl"` (gelokaliseerde vormen) zijn ingeschakeld op grotere tekst, wat typografische verfijning toevoegt die aandachtige lezers beloont.

Wat Notions visuele taal onderscheidend maakt, is de randfilosofie. In plaats van zware randen of schaduwen gebruikt Notion ultra-dunne `1px solid rgba(0,0,0,0.1)` randen -- randen die bestaan als gefluister, nauwelijks waarneembare scheidingslijnen die structuur creëren zonder gewicht. Het schaduwsysteem is even terughoudend: meerlaagse stapels met cumulatieve dekking die nooit meer dan 0.05 bedraagt, waardoor diepte ontstaat die gevoeld wordt in plaats van gezien.

**Kernkenmerken:**
- NotionInter (aangepaste Inter) met negatieve letterspatiëring op weergaveformaten (-2.125px bij 64px)
- Warm neutraal palet: grijstinten dragen geel-bruine ondertonen (`#f6f5f4` warm wit, `#31302e` warm donker)
- Bijna-zwarte tekst via `rgba(0,0,0,0.95)` -- niet puur zwart, creëert micro-warmte
- Ultra-dunne randen: `1px solid rgba(0,0,0,0.1)` doorheen -- scheiding met gefluisterd gewicht
- Meerlaagse schaduwstapels met sub-0.05 dekking voor nauwelijks zichtbare diepte
- Notion Blue (`#0075de`) als het enige accentkleur voor CTA's en interactieve elementen
- Pilvormige badges (9999px radius) met getinte blauwe achtergronden voor statusindicatoren
- 8px basisspatie-eenheid met een organische, niet-rigide schaal

## 2. Kleurenpalet & Rollen

### Primair
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`): Primaire tekst, koppen, hoofdtekst. De 95% dekking verzacht puur zwart zonder leesbaarheid op te offeren.
- **Pure White** (`#ffffff`): Pagina-achtergrond, kaartoppervlakken, knoptekst op blauw.
- **Notion Blue** (`#0075de`): Primaire CTA, linkkleur, interactief accent -- de enige verzadigde kleur in de kern-UI.

### Merk Secundair
- **Deep Navy** (`#213183`): Secundaire merkkleur, spaarzaam gebruikt voor nadruk en donkere functiesecties.
- **Active Blue** (`#005bab`): Actieve/ingedrukte knopstatus -- donkere variant van Notion Blue.

### Warme Neutrale Schaal
- **Warm White** (`#f6f5f4`): Achtergrondoppervlakteaanduiding, sectieafwisseling, subtiele kaartopvulling. De gele ondertoon is essentieel.
- **Warm Dark** (`#31302e`): Donkere oppervlakte-achtergrond, tekst in donkere secties. Warmer dan standaard grijstinten.
- **Warm Gray 500** (`#615d59`): Secundaire tekst, beschrijvingen, gedempte labels.
- **Warm Gray 300** (`#a39e98`): Plaatsaanduidingstekst, uitgeschakelde staten, bijschrifttekst.

### Semantische Accentkleuren
- **Teal** (`#2a9d99`): Successtatussen, positieve indicatoren.
- **Green** (`#1aae39`): Bevestiging, voltooiingsbadges.
- **Orange** (`#dd5b00`): Waarschuwingsstatussen, aandachtsindicatoren.
- **Pink** (`#ff64c8`): Decoratief accent, functiemarkering.
- **Purple** (`#391c57`): Premiumfuncties, diepe accenten.
- **Brown** (`#523410`): Aards accent, warme functiesecties.

### Interactief
- **Link Blue** (`#0075de`): Primaire linkkleur met onderstreping bij hover.
- **Link Light Blue** (`#62aef0`): Lichtere linkvariant voor donkere achtergronden.
- **Focus Blue** (`#097fe8`): Focusring op interactieve elementen.
- **Badge Blue Bg** (`#f2f9ff`): Pilbadge-achtergrond, getint blauw oppervlak.
- **Badge Blue Text** (`#097fe8`): Pilbadge-tekst, donkerder blauw voor leesbaarheid.

### Schaduwen & Diepte
- **Card Shadow** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Meerlaagse kaartelevatie.
- **Deep Shadow** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Vijflaagse diepe elevatie voor modals en uitgelichte inhoud.
- **Whisper Border** (`1px solid rgba(0,0,0,0.1)`): Standaard scheidingsrand -- kaarten, scheidingstekens, secties.

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `NotionInter`, met terugvalmogelijkheden: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **OpenType-functies**: `"lnum"` (staande cijfers) en `"locl"` (gelokaliseerde vormen) ingeschakeld op weergave- en koptekst.

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterspatiëring | Notities |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (strak) | -2.125px | Maximale compressie, billboardkoppen |
| Display Secundair | NotionInter | 54px (3.38rem) | 700 | 1.04 (strak) | -1.875px | Secundaire hero, functiekoppen |
| Sectiekop | NotionInter | 48px (3.00rem) | 700 | 1.00 (strak) | -1.5px | Functiesectietitels, met `"lnum"` |
| Subkop Groot | NotionInter | 40px (2.50rem) | 700 | 1.50 | normaal | Kaartkoppen, feature-subsecties |
| Subkop | NotionInter | 26px (1.63rem) | 700 | 1.23 (strak) | -0.625px | Sectie-subtitels, inhoudskoppen |
| Kaartitel | NotionInter | 22px (1.38rem) | 700 | 1.27 (strak) | -0.25px | Functiekaarten, lijsttitels |
| Hoofdtekst Groot | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Introducties, functiebeschrijvingen |
| Hoofdtekst | NotionInter | 16px (1.00rem) | 400 | 1.50 | normaal | Standaard leestekst |
| Hoofdtekst Medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normaal | Navigatie, benadrukte UI-tekst |
| Hoofdtekst Semi-vet | NotionInter | 16px (1.00rem) | 600 | 1.50 | normaal | Sterke labels, actieve staten |
| Hoofdtekst Vet | NotionInter | 16px (1.00rem) | 700 | 1.50 | normaal | Koppen op hoofdtekstgrootte |
| Nav / Knop | NotionInter | 15px (0.94rem) | 600 | 1.33 | normaal | Navigatielinks, knoptekst |
| Bijschrift | NotionInter | 14px (0.88rem) | 500 | 1.43 | normaal | Metadata, secundaire labels |
| Bijschrift Licht | NotionInter | 14px (0.88rem) | 400 | 1.43 | normaal | Hoofdtekstbijschriften, beschrijvingen |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Pilbadges, tags, statuslabels |
| Microlabel | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Kleine metadata, tijdstempels |

### Principes
- **Compressie op schaal**: NotionInter op weergaveformaten gebruikt -2.125px letterspatiëring bij 64px, progressief verslappend naar -0.625px bij 26px en normaal bij 16px. De compressie creëert dichtheid bij koppen terwijl de leesbaarheid bij hoofdtekstformaten behouden blijft.
- **Systeem met vier gewichten**: 400 (hoofdtekst/lezen), 500 (UI/interactief), 600 (nadruk/navigatie), 700 (koppen/weergave). Het bredere gewichtsbereik vergeleken met de meeste systemen maakt genuanceerde hiërarchie mogelijk.
- **Warme schaling**: Regelhoogte wordt strakker naarmate de grootte toeneemt -- 1.50 bij hoofdtekst (16px), 1.23-1.27 bij subkoppen, 1.00-1.04 bij weergave. Dit creëert dichtere, meer impactvolle koppen.
- **Badge-microtracering**: De 12px-badgetekst gebruikt positieve letterspatiëring (0.125px) -- de enige positieve tracering in het systeem, waardoor bredere, beter leesbare kleine tekst ontstaat.

## 4. Componentstyling

### Knoppen

**Primair Blauw**
- Achtergrond: `#0075de` (Notion Blue)
- Tekst: `#ffffff`
- Opvulling: 8px 16px
- Radius: 4px (subtiel)
- Rand: `1px solid transparent`
- Hover: achtergrond donkerder naar `#005bab`
- Actief: scale(0.9) transformatie
- Focus: `2px solid` focusomtrek, `var(--shadow-level-200)` schaduw
- Gebruik: Primaire CTA ("Get Notion free", "Probeer het")

**Secundair / Tertiair**
- Achtergrond: `rgba(0,0,0,0.05)` (doorschijnend warm grijs)
- Tekst: `#000000` (bijna-zwart)
- Opvulling: 8px 16px
- Radius: 4px
- Hover: tekstkleur verschuift, scale(1.05)
- Actief: scale(0.9) transformatie
- Gebruik: Secundaire acties, formulierinzendingen

**Ghost / Linkknop**
- Achtergrond: transparant
- Tekst: `rgba(0,0,0,0.95)`
- Decoratie: onderstreping bij hover
- Gebruik: Tertiaire acties, inlinelinks

**Pilbadge-knop**
- Achtergrond: `#f2f9ff` (getint blauw)
- Tekst: `#097fe8`
- Opvulling: 4px 8px
- Radius: 9999px (volledige pil)
- Lettertype: 12px gewicht 600
- Gebruik: Statusbadges, functielabels, "Nieuw"-tags

### Kaarten & Containers
- Achtergrond: `#ffffff`
- Rand: `1px solid rgba(0,0,0,0.1)` (gefluisterde rand)
- Radius: 12px (standaardkaarten), 16px (uitgelichte/herokaarten)
- Schaduw: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: subtiele schaduwintensivering
- Afbeeldingskaarten: 12px bovenste radius, afbeelding vult bovenste helft

### Invoer & Formulieren
- Achtergrond: `#ffffff`
- Tekst: `rgba(0,0,0,0.9)`
- Rand: `1px solid #dddddd`
- Opvulling: 6px
- Radius: 4px
- Focus: blauwe omtrekring
- Plaatsaanduiding: warm grijs `#a39e98`

### Navigatie
- Schone horizontale navigatie op wit, niet kleverig
- Merkloge links uitgelijnd (33x34px pictogram + woordmerk)
- Links: NotionInter 15px gewicht 500-600, bijna-zwarte tekst
- Hover: kleurverschuiving naar `var(--color-link-primary-text-hover)`
- CTA: blauwe pilknop ("Get Notion free") rechts uitgelijnd
- Mobiel: hamburgermenuvouwing
- Productdropdowns met meerlagig gecategoriseerde menu's

### Afbeeldingsbehandeling
- Productschermafbeeldingen met `1px solid rgba(0,0,0,0.1)` rand
- Bovenafrondende afbeeldingen: `12px 12px 0px 0px` radius
- Dashboard/werkruimtevoorbeeldschermafbeeldingen domineren functiesecties
- Warme verloopachtergronden achter hero-illustraties (decoratieve karakterillustraties)

### Onderscheidende Componenten

**Functiekaarten met Illustraties**
- Grote illustratieve headers (The Great Wave, productUI-schermafbeeldingen)
- 12px-radiuskaart met gefluisterde rand
- Titel op 22px gewicht 700, beschrijving op 16px gewicht 400
- Warm witte (`#f6f5f4`) achtergrondvariant voor afwisselende secties

**Vertrouwensbalk / Logogrid**
- Bedrijfslogo's (sectie vertrouwde teams) in hun merkkleuren
- Horizontaal scrollend of rasterindeling met teamaantallen
- Metrische weergave: groot getal + beschrijvingspatroon

**Metrische Kaarten**
- Grote getalweergave (bijv. "$4.200 ROI")
- NotionInter 40px+ gewicht 700 voor de metriek
- Beschrijving eronder in warm grijs hoofdtekst
- Container met gefluisterde rand

## 5. Indelingsprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Niet-rigide organische schaal met fractionele waarden (5.6px, 6.4px) voor micro-aanpassingen

### Raster & Container
- Maximale inhoudbreedte: circa 1200px
- Hero: gecentreerde enkele kolom met royale bovenste opvulling (80-120px)
- Functiesecties: 2-3 kolomrasters voor kaarten
- Volledige breedte warme witte (`#f6f5f4`) sectie-achtergronden voor afwisseling
- Code/dashboardschermafbeeldingen als container met gefluisterde rand

### Witruimtefilosofie
- **Royaal verticaal ritme**: 64-120px tussen hoofdsecties. Notion laat inhoud ademen met grote verticale opvulling.
- **Warme afwisseling**: Witte secties wisselen af met warm witte (`#f6f5f4`) secties, waardoor een zachte visuele cadans ontstaat zonder harde kleurbreuken.
- **Inhoudgerichte dichtheid**: Blokken hoofdtekst zijn compact (regelhoogte 1.50) maar omgeven door ruime marges, waardoor eilanden van leesbare inhoud in een zee van witruimte ontstaan.

### Randradiusschaal
- Micro (4px): Knoppen, invoervelden, functionele interactieve elementen
- Subtiel (5px): Links, lijstitems, menu-items
- Standaard (8px): Kleine kaarten, containers, inlineelementen
- Comfortabel (12px): Standaardkaarten, featurecontainers, beeldtops
- Groot (16px): Herokaarten, uitgelichte inhoud, promotionele blokken
- Volledige Pil (9999px): Badges, pillen, statusindicatoren
- Cirkel (100%): Tabindicatoren, avatars

## 6. Diepte & Elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Plat (Niveau 0) | Geen schaduw, geen rand | Pagina-achtergrond, tekstblokken |
| Gefluisterd (Niveau 1) | `1px solid rgba(0,0,0,0.1)` | Standaardranden, kaartomtrekken, scheidingstekens |
| Zachte Kaart (Niveau 2) | 4-laagse schaduwstapel (max dekking 0.04) | Inhoudskaarten, featureblokken |
| Diepe Kaart (Niveau 3) | 5-laagse schaduwstapel (max dekking 0.05, 52px waas) | Modals, uitgelichte panelen, hero-elementen |
| Focus (Toegankelijkheid) | `2px solid var(--focus-color)` omtrek | Toetsenbordfocus op alle interactieve elementen |

**Schaduwfilosofie**: Notions schaduwsysteem gebruikt meerdere lagen met uiterst lage individuele dekking (0.01 tot 0.05) die accumuleren tot zachte, natuurlijk ogende elevatie. De 4-laagse kaartschaduw strekt zich uit van 1.04px tot 18px waas, waardoor een kleurverloop van diepte ontstaat in plaats van een enkele harde schaduw. De 5-laagse diepe schaduw strekt zich uit tot 52px waas bij 0.05 dekking, wat omgevingsocclusie produceert die aanvoelt als natuurlijk licht in plaats van computergegenereerde diepte. Deze gelaagde aanpak zorgt ervoor dat elementen ingebed in de pagina aanvoelen in plaats van erboven te zweven.

### Decoratieve Diepte
- Herosectie: decoratieve karakterillustraties (speelse, met de hand getekende stijl)
- Sectieafwisseling: achtergrondkleurverschuivingen van wit naar warm wit (`#f6f5f4`)
- Geen harde sectieranden -- scheiding komt van achtergrondkleurveranderingen en spatiëring

## 7. Responsief Gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste Wijzigingen |
|------|-------|-------------|
| Mobiel Klein | <400px | Strakke enkele kolom, minimale opvulling |
| Mobiel | 400-600px | Standaard mobiel, gestapelde indeling |
| Tablet Klein | 600-768px | 2-kolomrasters beginnen |
| Tablet | 768-1080px | Volledige kaartrasters, uitgebreide opvulling |
| Desktop Klein | 1080-1200px | Standaard desktopindeling |
| Desktop | 1200-1440px | Volledige indeling, maximale inhoudbreedte |
| Groot Desktop | >1440px | Gecentreerd, royale marges |

### Aanraakvlakken
- Knoppen gebruiken comfortabele opvulling (8px-16px verticaal)
- Navigatielinks op 15px met voldoende spatiëring
- Pilbadges hebben 8px horizontale opvulling voor aanraakvlakken
- Mobiele menutoggle gebruikt standaard hamburgerknop

### Inklapstrategie
- Hero: 64px weergave -> schaalt naar 40px -> 26px op mobiel, behoudt proportionele letterspatiëring
- Navigatie: horizontale links + blauwe CTA -> hamburgermenu
- Functiekaarten: 3 kolommen -> 2 kolommen -> gestapelde enkele kolom
- Productschermafbeeldingen: behoudt beeldverhouding met responsieve afbeeldingen
- Vertrouwensbalklogo's: raster -> horizontaal scrollen op mobiel
- Voettekst: meerdere kolommen -> gestapelde enkele kolom
- Sectiespatiëring: 80px+ -> 48px op mobiel

### Afbeeldingsgedrag
- Werkruimteschermafbeeldingen behouden gefluisterde rand op alle formaten
- Hero-illustraties schalen proportioneel
- Productschermafbeeldingen gebruiken responsieve afbeeldingen met consistente randradius
- Volledig brede warm witte secties behouden rand-tot-rand behandeling

## 8. Toegankelijkheid & Staten

### Focussysteem
- Alle interactieve elementen ontvangen zichtbare focusindicatoren
- Focusomtrek: `2px solid` met focuskleur + schaduwlevel 200
- Tabnavigatie ondersteund in alle interactieve componenten
- Hoogcontrasttekst: bijna-zwart op wit overschrijdt WCAG AAA (>14:1 verhouding)

### Interactieve Staten
- **Standaard**: Standaard weergave met gefluisterde randen
- **Hover**: Kleurverschuiving op tekst, scale(1.05) op knoppen, onderstreping op links
- **Actief/Ingedrukt**: scale(0.9) transformatie, donkere achtergrondvariant
- **Focus**: Blauwe omtrekring met schaduwversterking
- **Uitgeschakeld**: Warm grijs (`#a39e98`) tekst, verminderde dekking

### Kleurcontrast
- Primaire tekst (rgba(0,0,0,0.95)) op wit: ~18:1 verhouding
- Secundaire tekst (#615d59) op wit: ~5.5:1 verhouding (WCAG AA)
- Blauwe CTA (#0075de) op wit: ~4.6:1 verhouding (WCAG AA voor grote tekst)
- Badgetekst (#097fe8) op badge-achtergrond (#f2f9ff): ~4.5:1 verhouding (WCAG AA voor grote tekst)

## 9. Agentpromptgids

### Snelle Kleurverwijzing
- Primaire CTA: Notion Blue (`#0075de`)
- Achtergrond: Pure White (`#ffffff`)
- Alt. Achtergrond: Warm White (`#f6f5f4`)
- Koptekst: Near-Black (`rgba(0,0,0,0.95)`)
- Hoofdtekst: Near-Black (`rgba(0,0,0,0.95)`)
- Secundaire tekst: Warm Gray 500 (`#615d59`)
- Gedempte tekst: Warm Gray 300 (`#a39e98`)
- Rand: `1px solid rgba(0,0,0,0.1)`
- Link: Notion Blue (`#0075de`)
- Focusring: Focus Blue (`#097fe8`)

### Voorbeeldcomponentprompts
- "Maak een herosectie op witte achtergrond. Kop op 64px NotionInter gewicht 700, regelhoogte 1.00, letterspatiëring -2.125px, kleur rgba(0,0,0,0.95). Ondertitel op 20px gewicht 600, regelhoogte 1.40, kleur #615d59. Blauwe CTA-knop (#0075de, 4px radius, opvulling 8px 16px, witte tekst) en ghostknop (transparante achtergrond, bijna-zwarte tekst, onderstreping bij hover)."
- "Ontwerp een kaart: witte achtergrond, 1px solid rgba(0,0,0,0.1) rand, 12px radius. Gebruik schaduwstapel: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Titel op 22px NotionInter gewicht 700, letterspatiëring -0.25px. Hoofdtekst op 16px gewicht 400, kleur #615d59."
- "Bouw een pilbadge: #f2f9ff achtergrond, #097fe8 tekst, 9999px radius, opvulling 4px 8px, NotionInter 12px gewicht 600, letterspatiëring 0.125px."
- "Maak navigatie: witte header. NotionInter 15px gewicht 600 voor links, bijna-zwarte tekst. Blauwe pil-CTA 'Get Notion free' rechts uitgelijnd (#0075de achtergrond, witte tekst, 4px radius)."
- "Ontwerp een afwisselende sectie-indeling: witte secties wisselen af met warm witte (#f6f5f4) secties. Elke sectie heeft 64-80px verticale opvulling, max-breedte 1200px gecentreerd. Sectiekop op 48px gewicht 700, regelhoogte 1.00, letterspatiëring -1.5px."

### Iteratiegids
1. Gebruik altijd warme neutralen -- de grijstinten van Notion hebben geel-bruine ondertonen (#f6f5f4, #31302e, #615d59, #a39e98), nooit blauwgrijs
2. Letterspatiëring schaalt met lettergrootte: -2.125px bij 64px, -1.875px bij 54px, -0.625px bij 26px, normaal bij 16px
3. Vier gewichten: 400 (lees), 500 (interacteer), 600 (benadruk), 700 (kondig aan)
4. Randen zijn gefluisterd: 1px solid rgba(0,0,0,0.1) -- nooit zwaarder
5. Schaduwen gebruiken 4-5 lagen met individuele dekking die nooit meer dan 0.05 bedraagt
6. De warm witte (#f6f5f4) sectie-achtergrond is essentieel voor visueel ritme
7. Pilbadges (9999px) voor status/tags, 4px radius voor knoppen en invoervelden
8. Notion Blue (#0075de) is de enige verzadigde kleur in de kern-UI -- gebruik het spaarzaam voor CTA's en links
