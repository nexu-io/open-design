# Ontwerpsysteem geïnspireerd op Cohere

> Category: AI & LLM
> Enterprise AI-platform. Levendige kleurverlopen, datarijke dashboard-esthetiek.

## 1. Visueel thema & sfeer

De interface van Cohere is een gepolijst enterprise-commando­deck — zelfverzekerd, overzichtelijk en ontworpen om AI als serieuze infrastructuur te laten aanvoelen in plaats van als consumentenspeelgoed. De ervaring speelt zich af op een helderwit canvas waarop inhoud is georganiseerd in royaal afgeronde kaarten (22px radius) die een organische, wolkachtige containertaal creëren. Dit is een site die spreekt tot CTO's en enterprise-architecten: professioneel zonder kil te zijn, verfijnd zonder intimiderend te zijn.

De ontwerptaal overbrugt twee werelden met een dubbel lettertype­systeem: CohereText, een aangepast display-serif met nauw spatiëring, geeft koppen het gezag van een technologisch manifest, terwijl Unica77 Cohere Web alle brood­tekst en UI-tekst verwerkt met geometrische Zwitserse precisie. Dit serif/sans-koppel creëert een persoonlijkheid van "zelfverzekerd gezag ontmoet technische helderheid" die een enterprise AI-platform perfect weerspiegelt.

Kleur wordt uiterst spaarzaam gebruikt — de interface is vrijwel geheel zwart-wit met koele grijze randen (`#d9d9dd`, `#e5e7eb`). Paars-violet verschijnt alleen in fotografische heldbanden, verloop­secties en het interactieve blauw (`#1863dc`) dat hover- en focustoestanden aangeeft. Deze chromatische terughoudendheid zorgt ervoor dat kleur, wanneer die WEL verschijnt — in product­screenshots, enterprise-fotografie en de dieprode sectie — maximaal visueel gewicht draagt.

**Belangrijkste kenmerken:**
- Helderwit canvas met koele grijze containerborders
- 22px kenmerkende hoekradius — de onderscheidende "Cohere-kaart"-rondheid
- Dubbel aangepast lettertype: CohereText (display-serif) + Unica77 (brood­tekst sans)
- Enterprise-waardige chromatische terughoudendheid: zwart, wit, koele grijstinten, minimaal paars-blauw accent
- Dieppurperen/violette heldsecties voor dramatisch contrast
- Ghost/transparante knoppen die blauw worden bij hover
- Enterprise-fotografie met diverse toepassingen uit de praktijk
- CohereMono voor code en technische labels met hoofdletter­transformaties

## 2. Kleurenpalet & rollen

### Primair
- **Cohere Zwart** (`#000000`): Primaire koptekst en elementen met maximale nadruk.
- **Bijna Zwart** (`#212121`): Standaard linkkleur voor brood­tekst — iets zachter dan puur zwart.
- **Diep Donker** (`#17171c`): Een blauwgetint bijna-zwart voor navigatie en tekst in donkere secties.

### Secundair & accent
- **Interactieblauw** (`#1863dc`): Het primaire interactieve accent — verschijnt bij knophover, focustoestanden en actieve links. De enige chromatische actie­kleur.
- **Ring Blauw** (`#4c6ee6` op 50%): Tailwind ring-kleur voor toetsenbord­focusindicatoren.
- **Focuspaars** (`#9b60aa`): Borderkleur bij invoerfocus — een gedempte violet.

### Vlak & achtergrond
- **Puur Wit** (`#ffffff`): De primaire pagina­achtergrond en kaartoppervlak.
- **Sneeuw** (`#fafafa`): Subtiele verhoogde vlakken en lichte sectie­achtergronden.
- **Lichtste Grijs** (`#f2f2f2`): Kaart­borders en de zachtste containerbelijningen.

### Neutrale tinten & tekst
- **Gedempte Lei** (`#93939f`): Niet-geaccentueerde footer­links en tertiaire tekst — een koel­getint grijs met een lichte blauw-violette tint.
- **Koele Border** (`#d9d9dd`): Standaard sectie- en lijstitem­borders — een koele, licht paars­getinte grijstint.
- **Lichte Border** (`#e5e7eb`): Lichtere bordervariant — Tailwinds standaard gray-200.

### Verloopsysteem
- **Paars-Violette Heldband**: Diepe paarse verlooposecties die dramatisch contrast creëren ten opzichte van het witte canvas. Deze verschijnen als volbreedte­banden met product­screenshots en kernboodschappen.
- **Donkere Footer-overgang**: De pagina gaat via diep paars/antraciet over naar de zwarte footer, wat een "schemer"-effect creëert.

## 3. Typografieregels

### Lettertypefamilie
- **Display**: `CohereText`, met terugvalopties: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Brood­tekst / UI**: `Unica77 Cohere Web`, met terugvalopties: `Inter, Arial, ui-sans-serif, system-ui`
- **Code**: `CohereMono`, met terugvalopties: `Arial, ui-sans-serif, system-ui`
- **Pictogrammen**: `CohereIconDefault` (aangepast pictogrammen­lettertype)

### Hiërarchie

| Rol | Lettertype | Grootte | Gewicht | Regelhoogte | Letterafstand | Notities |
|------|------|------|--------|-------------|----------------|-------|
| Display / Held | CohereText | 72px (4.5rem) | 400 | 1.00 (nauw) | -1.44px | Maximale impact, serif-autoriteit |
| Display Secundair | CohereText | 60px (3.75rem) | 400 | 1.00 (nauw) | -1.2px | Grote sectiekoppen |
| Sectiekop | Unica77 | 48px (3rem) | 400 | 1.20 (nauw) | -0.48px | Titels van feature­secties |
| Subkop | Unica77 | 32px (2rem) | 400 | 1.20 (nauw) | -0.32px | Kaartkoppen, feature­namen |
| Feature­titel | Unica77 | 24px (1.5rem) | 400 | 1.30 | normaal | Kleinere sectie­titels |
| Grote Brood­tekst | Unica77 | 18px (1.13rem) | 400 | 1.40 | normaal | Inleidende alinea's |
| Brood­tekst / Knop | Unica77 | 16px (1rem) | 400 | 1.50 | normaal | Standaard brood­tekst, knoptekst |
| Knop Middel | Unica77 | 14px (0.88rem) | 500 | 1.71 (ruim) | normaal | Kleinere knoppen, benadrukte labels |
| Bijschrift | Unica77 | 14px (0.88rem) | 400 | 1.40 | normaal | Metadata, beschrijvingen |
| Hoofdletter­label | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Sectie­labels in hoofdletters |
| Klein | Unica77 | 12px (0.75rem) | 400 | 1.40 | normaal | Kleinste tekst, footer­links |
| Code Micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Kleine codelabels in hoofdletters |

### Principes
- **Serif voor declaratie, sans voor functionaliteit**: CohereText draagt de merkstem op display­schaal — de serif-uiteinden geven koppen het gezag van gepubliceerd onderzoek. Unica77 verwerkt alles functioneels met Zwitsers-geometrische neutraliteit.
- **Negatieve spatiëring op schaal**: CohereText gebruikt -1.2px tot -1.44px letter-spacing bij 60–72px, waardoor dichte, impactvolle tekstblokken ontstaan.
- **Enkel brood­tekst­gewicht**: Vrijwel al het Unica77-gebruik heeft gewicht 400. Gewicht 500 verschijnt alleen voor nadruk op kleine knoppen. Het systeem steunt op grootte en spatiëring, niet op gewichtscontrast.
- **Codelabels in hoofdletters**: CohereMono gebruikt hoofdletters met positieve letter-spacing (0.16–0.28px) voor technische tags en sectie­markeringen.

## 4. Componentopmaak

### Knoppen

**Ghost / Transparant**
- Achtergrond: transparant (`rgba(255, 255, 255, 0)`)
- Tekst: Cohere Zwart (`#000000`)
- Geen zichtbare border
- Hover: tekst verschuift naar Interactieblauw (`#1863dc`), dekking 0.8
- Focus: solide 2px outline in Interactieblauw
- De primaire knopstijl — onzichtbaar totdat er interactie mee is

**Donker Solide**
- Achtergrond: donker/zwart
- Tekst: Puur Wit
- Voor CTA op lichte vlakken
- Pilvormig of standaard radius

**Omlijnd**
- Border­gebaseerde begrenzing
- Gebruikt bij secundaire acties

### Kaarten & containers
- Achtergrond: Puur Wit (`#ffffff`)
- Border: dunne solide Lichtste Grijs (`1px solid #f2f2f2`) voor subtiele kaarten; Koele Border (`#d9d9dd`) voor benadrukte kaarten
- Radius: **22px** — de kenmerkende Cohere-radius voor primaire kaarten, afbeeldingen en dialoog­containers. Ook 4px, 8px, 16px, 20px voor kleinere elementen
- Schaduw: minimaal — Cohere steunt op achtergrond­kleur en borders in plaats van schaduwen
- Speciaal: `0px 0px 22px 22px` radius (alleen onderaan afronden) voor sectie­containers
- Dialoog: 8px radius voor modaal/dialoog­vensters

### Invoervelden & formulieren
- Tekst: wit op donkere invoer, zwart op lichte
- Focusborder: Focuspaars (`#9b60aa`) met `1px solid`
- Focusschaduw: rode ring (`rgb(179, 0, 0) 0px 0px 0px 2px`) — waarschijnlijk voor aanduiding van fouttoestanden
- Focusomlijning: Interactieblauw solide 2px

### Navigatie
- Schone horizontale nav op witte of donkere achtergrond
- Logo: Cohere woordmerk (aangepaste SVG)
- Links: Donkere tekst op 16px Unica77
- CTA: Donkere solide knop
- Mobiel: hamburger­inklapbaar

### Afbeeldings­behandeling
- Enterprise-fotografie met diverse onderwerpen en omgevingen
- Paars­getinte heldfotografie voor dramatische secties
- Product-UI-screenshots op donkere vlakken
- Afbeeldingen met 22px radius passend bij het kaartsysteem
- Volbreedte paarse verloop­secties

### Onderscheidende componenten

**22px-kaartsysteem**
- De 22px hoekradius is de visuele handtekening van Cohere
- Alle primaire kaarten, afbeeldingen en containers gebruiken deze radius
- Creëert een wolkachtige, organische zachtheid die zich onderscheidt van de typische 8–12px

**Enterprise-vertrouwensbalk**
- Bedrijfslogo's weergegeven in een horizontale strook
- Toont enterprise-adoptie
- Schone, monochrome logo­behandeling

**Paarse Heldbanden**
- Volbreedte dieppaarse secties met product­showcases
- Creëren dramatische visuele onderbrekingen in de witte pagina­stroom
- Product­screenshots zweven binnen de paarse omgeving

**Hoofdletter-code­tags**
- CohereMono in hoofdletters met letter-spacing
- Gebruikt als sectie­markeringen en categorisatie­labels
- Creëert een technische, gestructureerde informatie­hiërarchie

## 5. Lay-outprincipes

### Spatiëringssysteem
- Basiseenheid: 8px
- Schaal: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Knopvulling varieert per variant
- Interne kaart­vulling: circa 24–32px
- Verticale sectie­spatiëring: royaal (56–60px tussen secties)

### Raster & container
- Maximale containerbreedte: tot 2560px (zeer breed) met responsief schalen
- Held: gecentreerd met dramatische typografie
- Feature­secties: meerkolomige kaart­rasters
- Enterprise­secties: volbreedte paarse banden
- 26 breekpunten gedetecteerd — uiterst granulair responsief systeem

### Witruimte­filosofie
- **Enterprise­duidelijkheid**: Elke sectie presenteert één helder voorstel met ademruimte daartussen.
- **Fotografie als held**: Grote fotografische secties bieden visuele interesse zonder decoratieve ontwerpelementen te vereisen.
- **Kaartgroepering**: Gerelateerde inhoud is gegroepeerd in 22px-afgeronde kaarten, waardoor natuurlijke informatie­clusters ontstaan.

### Hoekradius­schaal
- Scherp (4px): Navigatie-elementen, kleine tags, paginering
- Comfortabel (8px): Dialoogvensters, secundaire containers, kleine kaarten
- Royaal (16px): Uitgelichte containers, middelgrote kaarten
- Groot (20px): Grote feature­kaarten
- Kenmerkend (22px): Primaire kaarten, heldfoto's, hoofd­containers — DE Cohere-radius
- Pilvormig (9999px): Knoppen, tags, statusindicatoren

## 6. Diepte & elevatie

| Niveau | Behandeling | Gebruik |
|-------|-----------|-----|
| Vlak (Niveau 0) | Geen schaduw, geen border | Pagina­achtergrond, tekstblokken |
| Omlijnd (Niveau 1) | `1px solid #f2f2f2` of `#d9d9dd` | Standaard kaarten, lijstscheidingen |
| Paarse Band (Niveau 2) | Volbreedte donkerpaarse achtergrond | Heldsecties, feature­showcases |

**Schaduw­filosofie**: Cohere is vrijwel schaduwhvlij. Diepte wordt gecommuniceerd door **achtergrond­kleurcontrast** (witte kaarten op paarse banden, wit vlak op sneeuw), **border­begrenzing** (koele grijze borders) en de dramatische **licht-naar-donker sectie­afwisseling**. Wanneer elementen elevatie nodig hebben, bereiken ze die doordat ze wit-op-donker zijn in plaats van door schaduw­werking.

## 7. Do's en don'ts

### Do
- Gebruik 22px hoekradius op alle primaire kaarten en containers — het is de visuele handtekening
- Gebruik CohereText voor display­koppen (72px, 60px) met negatieve letter-spacing
- Gebruik Unica77 voor alle brood­tekst en UI-tekst op gewicht 400
- Houd het palet zwart-wit met koele grijze borders
- Gebruik Interactieblauw (#1863dc) alleen voor interactieve hover/focustoestanden
- Gebruik dieppaarse secties voor dramatische visuele onderbrekingen en product­showcases
- Pas hoofdletters + letter-spacing toe op CohereMono voor sectie­labels
- Handhaaf enterprise-geschikte fotografie met diverse onderwerpen

### Don't
- Gebruik geen andere hoekradius dan 22px op primaire kaarten — de kenmerkende radius doet ertoe
- Introduceer geen warme kleuren — het palet is strikt koel­getint
- Gebruik geen zware schaduwen — diepte komt van kleurcontrast en borders
- Gebruik geen vetgedrukt (700+) gewicht op brood­tekst — 400–500 is het bereik
- Sla de serif/sans-hiërarchie niet over — CohereText voor koppen, Unica77 voor brood­tekst
- Gebruik paars niet als vlakkleur voor kaarten — paars is gereserveerd voor volbreedte­secties
- Reduceer sectie­spatiëring niet onder 40px — enterprise-lay-outs hebben ademruimte nodig
- Gebruik standaard geen decoratie op knoppen — ghost/transparant is de basisstaat

## 8. Responsief gedrag

### Breekpunten
| Naam | Breedte | Belangrijkste wijzigingen |
|------|-------|-------------|
| Klein Mobiel | <425px | Compacte lay-out, minimale spatiëring |
| Mobiel | 425–640px | Enkelvoudige kolom, gestapelde kaarten |
| Groot Mobiel | 640–768px | Kleine spatiëringaanpassingen |
| Tablet | 768–1024px | 2-kolomrasters beginnen |
| Desktop | 1024–1440px | Volledige meerkolomige lay-out |
| Groot Bureaublad | 1440–2560px | Maximale containerbreedte |

*26 breekpunten gedetecteerd — een van de meest granulaire responsieve sites in de dataset.*

### Aanraakdoelen
- Knoppen adequaat groot voor aanraakinteractie
- Navigatielinks met comfortabele spatiëring
- Kaartoppervlakken als aanraakdoelen

### Inklapstrategie
- **Navigatie**: Volledige nav klapt in tot hamburger
- **Feature­rasters**: Meerkolomig → 2-kolomig → enkelvoudige kolom
- **Koptekst**: 72px → 48px → 32px progressief schalen
- **Paarse secties**: Behouden volbreedte, inhoud stapelt
- **Kaartrasters**: 3 → 2 → 1 kolom

### Afbeeldingsgedrag
- Fotografie schaalt proportioneel binnen 22px-radius containers
- Product­screenshots behouden beeldverhouding
- Paarse secties schalen achtergrond proportioneel

## 9. Promptgids voor agents

### Snelle kleurnaslag
- Primaire tekst: "Cohere Zwart (#000000)"
- Pagina­achtergrond: "Puur Wit (#ffffff)"
- Secundaire tekst: "Bijna Zwart (#212121)"
- Hover­accent: "Interactieblauw (#1863dc)"
- Gedempte tekst: "Gedempte Lei (#93939f)"
- Kaart­borders: "Lichtste Grijs (#f2f2f2)"
- Sectie­borders: "Koele Border (#d9d9dd)"

### Voorbeeldprompts voor componenten
- "Maak een heldsectie op Puur Wit (#ffffff) met CohereText op 72px gewicht 400, regelhoogte 1.0, letter-spacing -1.44px. Cohere Zwart tekst. Ondertitel in Unica77 op 18px gewicht 400, regelhoogte 1.4."
- "Ontwerp een feature­kaart met 22px hoekradius, 1px solide Lichtste Grijs (#f2f2f2) border op wit. Titel in Unica77 op 32px, letter-spacing -0.32px. Brood­tekst in Unica77 op 16px, Gedempte Lei (#93939f)."
- "Maak een ghost-knop: transparante achtergrond, Cohere Zwart tekst in Unica77 op 16px. Bij hover verschuift tekst naar Interactieblauw (#1863dc) met dekking 0.8. Focus: 2px solide Interactieblauw outline."
- "Maak een dieppaarse volbreedte­sectie met witte tekst. CohereText op 60px voor de kop. Product­screenshot zweeft erin met 22px hoekradius."
- "Ontwerp een sectie­label met CohereMono op 14px, hoofdletters, letter-spacing 0.28px. Gedempte Lei (#93939f) tekst."

### Iteratiegids
1. Richt je op ÉÉN component tegelijk
2. Gebruik altijd 22px radius voor primaire kaarten — "de Cohere-kaartrondheid"
3. Geef het lettertype op — CohereText voor koppen, Unica77 voor brood­tekst, CohereMono voor labels
4. Interactieve elementen gebruiken Interactieblauw (#1863dc) alleen bij hover
5. Houd vlakken wit met koele grijze borders — geen warme tinten
6. Paars is voor volbreedte­secties, nooit voor kaartachtergronden
