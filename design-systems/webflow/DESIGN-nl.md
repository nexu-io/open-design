# Ontwerpsysteem geïnspireerd door Webflow

> Category: Design & Creatief
> Visuele websitebouwer. Gepolijste marketingsite-esthetiek met blauwe accenten.

## 1. Visueel thema & sfeer

De website van Webflow is een visueel rijke, tool-georiënteerde platform dat "ontwerpen zonder code" communiceert via schone witte oppervlakken, het kenmerkende Webflow-blauw（`#146ef5`）en een rijke secundaire kleurenpalet（paars, roze, groen, oranje, geel, rood）. Het aangepaste lettertype WF Visual Sans Variable creëert een zelfverzekerd, precies typografisch systeem met gewicht 600 voor weergave en 500 voor de tekst.

**Belangrijkste kenmerken：**
- Wit canvas met bijna zwarte（`#080808`）tekst
- Webflow-blauw（`#146ef5`）als primaire merkkleur en interactieve kleur
- WF Visual Sans Variable — aangepast variabel lettertype met gewicht 500–600
- Rijke secundaire palet：paars `#7a3dff`, roze `#ed52cb`, groen `#00d722`, oranje `#ff6b00`, geel `#ffae13`, rood `#ee1d36`
- Conservatieve randradius van 4px–8px — scherp, niet afgerond
- Meerdere schaduwlagen（5-laags cascadesschaduwen）
- Hoofdletters labels：10px–15px, gewicht 500–600, grote letterafstand（0,6px–1,5px）
- translate(6px)-hover-animatie op knoppen

## 2. Kleurenpalet & rollen

### Primair
- **Bijna Zwart**（`#080808`）：Primaire tekst
- **Webflow-blauw**（`#146ef5`）：`--_color---primary--webflow-blue`, primaire CTA en links
- **Blauw 400**（`#3b89ff`）：`--_color---primary--blue-400`, lichter interactief blauw
- **Blauw 300**（`#006acc`）：`--_color---blue-300`, donkerdere blauwvariant
- **Knop hover blauw**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Secundaire accenten
- **Paars**（`#7a3dff`）：`--_color---secondary--purple`
- **Roze**（`#ed52cb`）：`--_color---secondary--pink`
- **Groen**（`#00d722`）：`--_color---secondary--green`
- **Oranje**（`#ff6b00`）：`--_color---secondary--orange`
- **Geel**（`#ffae13`）：`--_color---secondary--yellow`
- **Rood**（`#ee1d36`）：`--_color---secondary--red`

### Neutraal
- **Grijs 800**（`#222222`）：Donkere secundaire tekst
- **Grijs 700**（`#363636`）：Middentekst
- **Grijs 300**（`#ababab`）：Gedempte tekst, tijdelijke aanduiding
- **Middengrijs**（`#5a5a5a`）：Linktekst
- **Randgrijs**（`#d8d8d8`）：Randen, scheidingslijnen
- **Rand hover**（`#898989`）：Hover-rand

### Schaduwen
- **5-laags cascade**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Typografieregels

### Lettertype：`WF Visual Sans Variable`, terugval：`Arial`

| Rol | Grootte | Gewicht | Regelhoogte | Letterafstand | Opmerkingen |
|------|------|--------|-------------|----------------|-------|
| Display-hero | 80px | 600 | 1,04 | -0,8px | |
| Sectiekop | 56px | 600 | 1,04 | normal | |
| Subtitel | 32px | 500 | 1,30 | normal | |
| Functietitel | 24px | 500–600 | 1,30 | normal | |
| Tekst | 20px | 400–500 | 1,40–1,50 | normal | |
| Standaardtekst | 16px | 400–500 | 1,60 | -0,16px | |
| Knop | 16px | 500 | 1,60 | -0,16px | |
| Hoofdletter label | 15px | 500 | 1,30 | 1,5px | uppercase |
| Onderschrift | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge hoofdletters | 12,8px | 550 | 1,20 | normal | uppercase |
| Micro hoofdletters | 10px | 500–600 | 1,30 | 1px | uppercase |
| Code：Inconsolata（bijbehorend monospace-lettertype）

## 4. Componentstijlen

### Knoppen
- Transparant：tekst `#080808`, translate(6px) bij hover
- Witte cirkel：radius 50%, witte achtergrond
- Blauwe badge：`#146ef5` achtergrond, radius 4px, gewicht 550

### Kaarten：`1px solid #d8d8d8`, radius 4px–8px
### Badges：blauwtint achtergrond bij 10% dekking, radius 4px

## 5. Opmaak
- Afstand：fractionele schaal（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Radius：2px, 4px, 8px, 50% — conservatief, scherp
- Breekpunten：479px, 768px, 992px

## 6. Diepte：5-laags cascadeschaduwsysteem

## 7. Wat te doen en te laten
- Doen：WF Visual Sans Variable gebruiken met gewicht 500–600. Blauw（`#146ef5`）voor CTA's. Radius 4px. translate(6px) bij hover.
- Laten：Functionele elementen niet meer dan 8px afronden. Secundaire kleuren niet gebruiken op primaire CTA's.

## 8. Responsief：479px, 768px, 992px

## 9. Agent-promptgids
- Tekst：Bijna Zwart（`#080808`）
- CTA：Webflow-blauw（`#146ef5`）
- Achtergrond：Wit（`#ffffff`）
- Rand：`#d8d8d8`
- Secundair：Paars `#7a3dff`, Roze `#ed52cb`, Groen `#00d722`
