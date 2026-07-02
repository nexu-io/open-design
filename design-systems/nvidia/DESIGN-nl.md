# Ontwerpsysteem geïnspireerd op NVIDIA

> Categorie: Media & Consument
> GPU-computing. Groen-zwarte energie, esthetiek van technische kracht.

## 1. Visueel thema & sfeer

De website van NVIDIA is een hoogcontrasterende, technologiegerichte ervaring die ruwe rekenkracht communiceert via ontwerpbeheersing. De pagina is opgebouwd op een strak zwart (`#000000`) en wit (`#ffffff`) fundament, onderbroken door NVIDIA's kenmerkende groen (`#76b900`) -- een kleur die zo specifiek is dat ze als merkvingerafdruk fungeert. Dit is niet het weelderige groen van de natuur; het is het elektrische, limoenachtige groen van GPU-gerenderd licht, een kleur die ergens tussen chartreuse en kelly green in zit en bij iedereen in de technologiewereld onmiddellijk "NVIDIA" roept.

De custom lettertypefamilie NVIDIA-EMEA (met Arial en Helvetica als fallbacks) creëert een strakke, industriële typografische stem. Koppen van 36px vet met een strakke regelafstand van 1.25 vormen dichte, gezaghebbende tekstblokken. Het lettertype mist de geometrische speelsheid van Silicon Valley-schreefloze lettertypen -- het is Europees, pragmatisch en ingenieursmatig van aard. Bodytekst staat op 15-16px, comfortabel om te lezen maar niet royaal, waardoor het gevoel blijft dat schermruimte geoptimaliseerd wordt als GPU-geheugen.

Wat NVIDIA's ontwerp onderscheidt van andere technologiesites met donkere achtergrond, is het gedisciplineerde gebruik van het groene accent. De `#76b900` verschijnt in randen (`2px solid #76b900`), koppelingsonderstrepingen (`underline 2px rgb(118, 185, 0)`) en CTA's -- maar nooit als achtergrond of grote vlakken in de hoofdinhoud. Het groen is een signaal, geen oppervlak. Gecombineerd met een diep schaduwsysteem (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) en minimale randafronding (1-2px) ontstaat het totaaleffect van precisie-engineeringshardware weergegeven in pixels.

**Kernkenmerken:**
- NVIDIA Green (`#76b900`) als puur accent -- uitsluitend voor randen, onderstrepingen en interactieve highlights
- Zwart (`#000000`) als dominante achtergrond met wit (`#ffffff`) tekst op donkere secties
- Custom lettertype NVIDIA-EMEA met Arial/Helvetica fallback -- industrieel, Europees, strak
- Strakke regelafstanden (1.25 voor koppen) die dichte, gezaghebbende tekstblokken creëren
- Minimale randafronding (1-2px) -- scherpe, geëngineerde hoeken door de hele interface
- Groen omlijnde knoppen (`2px solid #76b900`) als primair interactiepatroon
- Font Awesome 6 Pro/Sharp icoonssysteem op gewicht 900 voor scherpe iconografie
- Multi-framework architectuur (PrimeReact, Fluent UI, Element Plus) voor rijke interactieve componenten

## 2. Kleurenpalet & rollen

### Primair merk
- **NVIDIA Green** (`#76b900`): Het kenmerk -- randen, koppelingsonderstrepingen, CTA-contouren, actieve indicatoren. Nooit gebruikt als grote vlakopvulling.
- **Echt zwart** (`#000000`): Primaire paginaachtergrond, tekst op lichte vlakken, dominante toon.
- **Puur wit** (`#ffffff`): Tekst op donkere achtergronden, lichte sectieachtergronden, kaartoppervlakken.

### Uitgebreid merkpalet
- **NVIDIA Green Light** (`#bff230`): Helder limoenaccent voor highlights en hover-toestanden.
- **Orange 400** (`#df6500`): Warm accent voor waarschuwingen, uitgelichte badges of energiegerelateerde contexten.
- **Yellow 300** (`#ef9100`): Secundair warm accent, highlights voor productcategorieën.
- **Yellow 050** (`#feeeb2`): Licht warm vlak voor callout-achtergronden.

### Status & semantiek
- **Red 500** (`#e52020`): Fouttoestanden, destructieve acties, kritieke waarschuwingen.
- **Red 800** (`#650b0b`): Donkerrood voor ernstige waarschuwingsachtergronden.
- **Green 500** (`#3f8500`): Succestoestanden, positieve indicatoren (donkerder dan merkgroen).
- **Blue 700** (`#0046a4`): Informatieve accenten, alternatief voor koppeling hover.

### Decoratief
- **Purple 800** (`#4d1368`): Diep paars voor kleurovergangeinden, premium/AI-contexten.
- **Purple 100** (`#f9d4ff`): Licht paars oppervlaktint.
- **Fuchsia 700** (`#8c1c55`): Rijk accent voor speciale promoties of uitgelichte inhoud.

### Neutrale schaal
- **Gray 300** (`#a7a7a7`): Gedempte tekst, uitgeschakelde labels.
- **Gray 400** (`#898989`): Secundaire tekst, metadata.
- **Gray 500** (`#757575`): Tertiaire tekst, placeholders, voetteksten.
- **Gray Border** (`#5e5e5e`): Subtiele randen, scheidingslijnen.
- **Near Black** (`#1a1a1a`): Donkere vlakken, kaartachtergronden op zwarte pagina's.

### Interactieve toestanden
- **Koppeling standaard (donkere achtergrond)** (`#ffffff`): Witte koppelingen op donkere achtergronden.
- **Koppeling standaard (lichte achtergrond)** (`#000000`): Zwarte koppelingen met groene onderstreping op lichte achtergronden.
- **Koppeling hover** (`#3860be`): Blauwe verschuiving bij hover op alle koppelingsVarianten.
- **Knop hover** (`#1eaedb`): Teal-highlight voor hover-toestanden van knoppen.
- **Knop actief** (`#007fff`): Helder blauw voor actieve/ingedrukte knoppen.
- **Focusring** (`#000000 solid 2px`): Zwarte contour voor toetsenbordfocus.

### Schaduwen & diepte
- **Kaartschaduw** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Subtiele omgevingsschaduw voor verheven kaarten.

## 3. Typografieregels

### Lettertypefamilie
- **Primair**: `NVIDIA-EMEA`, met fallbacks: `Arial, Helvetica, sans-serif`
- **Icoonfont**: `Font Awesome 6 Pro` (gewicht 900 voor solid-iconen, 700 voor regulier)
- **Icoon Scherp**: `Font Awesome 6 Sharp` (gewicht 300 voor lichte iconen, 400 voor regulier)

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelafstand | Letterspatiëring | Opmerkingen |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (strak) | normaal | Koppen met maximale impact |
| Sectiekop | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (strak) | normaal | Sectietitels, kaartkoppen |
| Subkop | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (ruim) | normaal | Functieomschrijvingen, ondertitels |
| Kaarttitel | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (strak) | normaal | Kaart- en modulekoppen |
| Body groot | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (ruim) | normaal | Benadrukte bodytekst, introparagrafen |
| Body | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normaal | Standaard leestekst |
| Body vet | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normaal | Sterke labels, navigatie-items |
| Body klein | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (ruim) | normaal | Secundaire inhoud, beschrijvingen |
| Body klein vet | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normaal | Benadrukte secundaire inhoud |
| Knop groot | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (strak) | normaal | Primaire CTA-knoppen |
| Knop | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (strak) | normaal | Standaard knoppen |
| Knop compact | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (strak) | 0.144px | Kleine/compacte knoppen |
| Koppeling | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normaal | Navigatiekoppelingen |
| Koppeling hoofdletters | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normaal | `text-transform: uppercase`, navigatielabels |
| Bijschrift | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normaal | Metadata, tijdstempels |
| Bijschrift klein | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (strak) | normaal | Kleine letters, juridische tekst |
| Micro-label | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normaal | `text-transform: uppercase`, minuscule badges |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (strak) | normaal | Kleinste UI-tekst |

### Principes
- **Vet als standaardstem**: NVIDIA leunt zwaar op gewicht 700 voor koppen, knoppen, koppelingen en labels. Gewicht 400 is gereserveerd voor bodytekst en beschrijvingen -- al het andere is vet, wat zelfvertrouwen en gezag uitstraalt.
- **Strakke koppen, ruimere bodytekst**: De regelafstand van koppen is consequent 1.25 (strak), terwijl bodytekst ontspant naar 1.50-1.67. Dit contrast creëert visuele dichtheid bovenaan inhoudsblokken en comfortabele leesbaarheid in alinea's.
- **Hoofdletters voor navigatie**: Koppelingslabels gebruiken `text-transform: uppercase` met gewicht 700, waardoor een navigatiestem ontstaat die aanvoelt als hardwarespecificatielabels.
- **Geen decoratieve spatiëring**: Letterspatiëring is normaal door de hele interface, behalve voor compacte knoppen (0.144px). Het lettertype draagt het industriële karakter zonder manipulatie.

## 4. Componentopmaak

### Knoppen

**Primair (groene rand)**
- Achtergrond: `transparent`
- Tekst: `#000000`
- Opvulling: 11px 13px
- Rand: `2px solid #76b900`
- Afronding: 2px
- Lettertype: 16px gewicht 700
- Hover: achtergrond `#1eaedb`, tekst `#ffffff`
- Actief: achtergrond `#007fff`, tekst `#ffffff`, rand `1px solid #003eff`, scale(1)
- Focus: achtergrond `#1eaedb`, tekst `#ffffff`, contour `#000000 solid 2px`, opacity 0.9
- Gebruik: Primaire CTA ("Meer informatie", "Oplossingen verkennen")

**Secundair (dunne groene rand)**
- Achtergrond: transparent
- Rand: `1px solid #76b900`
- Afronding: 2px
- Gebruik: Secundaire acties, alternatieve CTA's

**Compact / inline**
- Lettertype: 14.4px gewicht 700
- Letterspatiëring: 0.144px
- Regelafstand: 1.00
- Gebruik: Inline CTA's, compacte navigatie

### Kaarten & containers
- Achtergrond: `#ffffff` (licht) of `#1a1a1a` (donkere secties)
- Rand: geen (strakke randen) of `1px solid #5e5e5e`
- Afronding: 2px
- Schaduw: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` voor verheven kaarten
- Hover: intensivering van schaduw
- Opvulling: 16-24px intern

### Koppelingen
- **Op donkere achtergrond**: `#ffffff`, geen onderstreping, hover verschuift naar `#3860be`
- **Op lichte achtergrond**: `#000000` of `#1a1a1a`, onderstreping `2px solid #76b900`, hover verschuift naar `#3860be`, onderstreping verwijderd
- **Groene koppelingen**: `#76b900`, hover verschuift naar `#3860be`
- **Gedempte koppelingen**: `#666666`, hover verschuift naar `#3860be`

### Navigatie
- Donkere zwarte achtergrond (`#000000`)
- Logo links uitgelijnd, prominent NVIDIA-woordmerk
- Koppelingen: NVIDIA-EMEA 14px gewicht 700 hoofdletters, `#ffffff`
- Hover: kleurverschuiving, geen wijziging van onderstreping
- Mega-menu dropdowns voor productcategorieën
- Sticky bij scrollen met backdrop

### Beeldbehandeling
- Product-/GPU-renders als hero-afbeeldingen, vaak volledig breed
- Schermafbeeldingen met subtiele schaduw voor diepte
- Groene kleurovergangslagen over donkere hero-secties
- Cirkelvormige avatarcontainers met radius 50%

### Onderscheidende componenten

**Productkaarten**
- Strakke witte of donkere kaart met minimale afronding (2px)
- Groen accentrand of -onderstreping op de titel
- Patroon van vette kop + lichtere beschrijving
- CTA met groene rand onderaan

**Technische specificatietabellen**
- Industriële rasterindelingen
- Wisselende rijachtergronden (subtiele grijsverschuiving)
- Vette labels, reguliere waarden
- Groene highlights voor kernmetrieken

**Cookie/toestemmingsbanner**
- Vaste positie onderaan
- Afgeronde knoppen (radius 2px)
- Grijze randbehandelingen

## 5. Indelingsprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Primaire opvullingswaarden: 8px, 11px, 13px, 16px, 24px, 32px
- Sectiespatiëring: 48-80px verticale opvulling

### Raster & container
- Maximale inhoudbreedte: circa 1200px (begrensd)
- Volledige-breedte hero-secties met begrensde tekst
- Functiesecties: 2-3 kolomrasters voor productkaarten
- Enkele kolom voor artikel-/bloginhoud
- Zijbalkindelingen voor documentatie

### Witruimtefilosofie
- **Doelbewuste dichtheid**: NVIDIA hanteert een strakkere spatiëring dan typische SaaS-sites, wat de dichtheid van technische inhoud weerspiegelt. Witruimte bestaat om concepten te scheiden, niet om luxueuze leegte te creëren.
- **Sectieritme**: Donkere secties wisselen af met witte secties, waarbij achtergrondkleur (niet alleen spatiëring) inhoudsblokken scheidt.
- **Kaartdichtheid**: Productkaarten staan dicht op elkaar met tussenruimten van 16-20px, wat een catalogusgevoel creëert in plaats van een galeriegevoel.

### Schaal voor randafronding
- Micro (1px): Inline spans, kleine elementen
- Standaard (2px): Knoppen, kaarten, containers, invoervelden -- de standaard voor vrijwel alles
- Cirkel (50%): Avatarafbeeldingen, cirkelvormige tabindicatoren

## 6. Diepte & elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Plat (Niveau 0) | Geen schaduw | Paginaachtergronden, inline tekst |
| Subtiel (Niveau 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Standaard kaarten, modals |
| Rand (Niveau 1b) | `1px solid #5e5e5e` | Inhoudsscheidingslijnen, sectieranden |
| Groen accent (Niveau 2) | `2px solid #76b900` | Actieve elementen, CTA's, geselecteerde items |
| Focus (Toegankelijkheid) | `2px solid #000000` contour | Toetsenbordfocusring |

**Schaduwfilosofie**: Het dieptesysteem van NVIDIA is minimaal en utilitair. Er is in wezen één schaduwwaarde -- een 5px omgevingsonscherpte op 30% dekking -- die spaarzaam wordt gebruikt voor kaarten en modals. Het primaire dieptesignaal is niet schaduw maar _kleurcontrast_: zwarte achtergronden naast witte secties, groene randen op zwarte vlakken. Dit creëert hardwareachtige visuele gelaagdheid waarbij diepte voortkomt uit materiaalverschil, niet uit gesimuleerd licht.

### Decoratieve diepte
- Groene kleurovergangslagen achter hero-inhoud
- Donker-naar-donkerder kleurovergangen (zwart naar bijna-zwart) voor sectieovergangen
- Geen glasmorfisme of vervagingseffecten -- helderheid boven sfeer

## 7. Responsief gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Mobiel klein | <375px | Compacte enkele kolom, verminderde opvulling |
| Mobiel | 375-425px | Standaard mobiele indeling |
| Mobiel groot | 425-600px | Bredere mobiele layout, hints voor 2 kolommen |
| Tablet klein | 600-768px | Begin van 2-kolomrasters |
| Tablet | 768-1024px | Volledige kaartrasters, uitgebreide navigatie |
| Desktop | 1024-1350px | Standaard desktopindeling |
| Groot desktop | >1350px | Maximale inhoudsbreedte, royale marges |

### Aanraakdoelwitten
- Knoppen gebruiken 11px 13px opvulling voor comfortabele tik-doelwitten
- Navigatiekoppelingen op 14px hoofdletters met voldoende spatiëring
- Groen omlijnde knoppen bieden hoog-contrast tik-doelwitten op donkere achtergronden
- Mobiel: hamburgermenuvouwen met volledig scherm overlay

### Vouwstrategie
- Hero: 36px kop schaalt proportioneel omlaag
- Navigatie: volledige horizontale navigatie klapt in bij ~1024px
- Productkaarten: 3 kolommen naar 2 kolommen naar gestapelde enkele kolom
- Voettekst: meerkolomraster klapt in naar enkele gestapelde kolom
- Sectiespatiëring: 64-80px vermindert naar 32-48px op mobiel
- Afbeeldingen: beeldverhouding behouden, schalen naar containerbreedte

### Afbeeldingsgedrag
- GPU-/productrendering behoudt hoge resolutie op alle formaten
- Hero-afbeeldingen schalen proportioneel mee met de viewport
- Kaartafbeeldingen gebruiken consistente beeldverhoudingen
- Volledigbreedtedonkere secties behouden de rand-tot-rand behandeling

## 8. Responsief gedrag (uitgebreid)

### Typografieschaling
- Display 36px schaalt naar ~24px op mobiel
- Sectiekoppen 24px schalen naar ~20px op mobiel
- Bodytekst behoudt 15-16px op alle breekpunten
- Knoptekst behoudt 16px voor consistente tik-doelwitten

### Strategie voor donkere/lichte secties
- Donkere secties (zwarte achtergrond, witte tekst) wisselen af met lichte secties (witte achtergrond, zwarte tekst)
- Het groene accent blijft consistent op beide vlaktypes
- Op donker: koppelingen zijn wit, onderstrepingen zijn groen
- Op licht: koppelingen zijn zwart, onderstrepingen zijn groen
- Deze afwisseling creëert een natuurlijk scrollritme en inhoudsgroepering

## 9. Agentpromptgids

### Snelle kleurverwijzing
- Primair accent: NVIDIA Green (`#76b900`)
- Achtergrond donker: Echt zwart (`#000000`)
- Achtergrond licht: Puur wit (`#ffffff`)
- Koptekst (donkere achtergrond): Wit (`#ffffff`)
- Koptekst (lichte achtergrond): Zwart (`#000000`)
- Bodytekst (lichte achtergrond): Zwart (`#000000`) of Bijna-zwart (`#1a1a1a`)
- Bodytekst (donkere achtergrond): Wit (`#ffffff`) of Gray 300 (`#a7a7a7`)
- Koppeling hover: Blauw (`#3860be`)
- Randaccent: `2px solid #76b900`
- Knop hover: Teal (`#1eaedb`)

### Voorbeeldcomponentprompts
- "Maak een hero-sectie op een zwarte achtergrond. Kop op 36px NVIDIA-EMEA gewicht 700, regelafstand 1.25, kleur #ffffff. Ondertitel op 18px gewicht 400, regelafstand 1.67, kleur #a7a7a7. CTA-knop met transparante achtergrond, 2px solid #76b900 rand, afronding 2px, opvulling 11px 13px, tekst #ffffff. Hover: achtergrond #1eaedb, tekst wit."
- "Ontwerp een productkaart: witte achtergrond, randafronding 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Titel op 20px NVIDIA-EMEA gewicht 700, regelafstand 1.25, kleur #000000. Body op 15px gewicht 400, regelafstand 1.67, kleur #757575. Groen onderstreepaccent op titel: border-bottom 2px solid #76b900."
- "Bouw een navigatiebalk: achtergrond #000000, sticky bovenaan. NVIDIA-logo links uitgelijnd. Koppelingen op 14px NVIDIA-EMEA gewicht 700 hoofdletters, kleur #ffffff. Hover: kleur #3860be. Groen omlijnde CTA-knop rechts uitgelijnd."
- "Maak een donkere functiesectie: achtergrond #000000. Sectielabel op 14px gewicht 700 hoofdletters, kleur #76b900. Kop op 24px gewicht 700, kleur #ffffff. Beschrijving op 16px gewicht 400, kleur #a7a7a7. Drie productkaarten op een rij met 20px tussenruimte."
- "Ontwerp een voettekst: achtergrond #000000. Meerkolomindeling met koppelingsgroepen. Koppelingen op 14px gewicht 400, kleur #a7a7a7. Hover: kleur #76b900. Onderste balk met juridische tekst op 12px, kleur #757575."

### Iteratiegids
1. Gebruik altijd `#76b900` als accent, nooit als achtergrondvulling -- het is een signaalkleur voor randen, onderstrepingen en highlights
2. Knoppen zijn standaard transparant met groene randen -- gevulde achtergronden verschijnen alleen bij hover/actieve toestanden
3. Gewicht 700 is de dominante stem voor alle interactieve elementen en koppen; 400 is alleen voor bodytekst
4. Randafronding is 2px voor alles -- deze scherpe, minimale afronding is essentieel voor de industriële esthetiek
5. Donkere secties gebruiken witte tekst; lichte secties gebruiken zwarte tekst -- het groene accent werkt identiek op beide
6. Koppeling hover is altijd `#3860be` (blauw), ongeacht de standaardkleur van de koppeling
7. Regelafstand 1.25 voor koppen, 1.50-1.67 voor bodytekst -- handhaaf dit contrast voor visuele hiërarchie
8. Navigatie gebruikt hoofdletters 14px vet -- deze typografie als hardwarelabel is onderdeel van de merkstem
