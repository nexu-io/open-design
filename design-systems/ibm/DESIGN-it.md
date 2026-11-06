# Design System Inspired by IBM

> Category: Media & Consumer
> Tecnologia enterprise. Carbon design system, palette blu strutturata.

## 1. Tema Visivo e Atmosfera

Il sito di IBM è l'incarnazione digitale dell'autorità enterprise, costruita sul Carbon Design System — un linguaggio di design così metodicamente strutturato da sembrare una specifica ingegneristica resa come pagina web. La pagina opera su una dualità netta: una tela bianco luminoso (`#ffffff`) con testo quasi nero (`#161616`), punteggiata da un unico, immutabile accento — IBM Blue 60 (`#0f62fe`). Non è il minimalismo giocoso delle startup tech; è la precisione aziendale distillata in pixel. Ogni elemento vive all'interno della rigida griglia 2x di Carbon, ogni colore si mappa su un token semantico, ogni valore di spaziatura si aggancia all'unità base di 8px.

La famiglia tipografica IBM Plex è la spina dorsale del sistema. IBM Plex Sans a peso light (300) per i titoli display crea una qualità inaspettatamente ariosa, quasi delicata, alle grandi dimensioni — un contrapunto deliberato alla gravità aziendale di IBM. Alle dimensioni di corpo, il peso regular (400) con letter-spacing di 0.16px sulle didascalie a 14px introduce il meticoloso micro-tracking che fa sembrare il testo Carbon progettato ingegneristicamente piuttosto che semplicemente disegnato. IBM Plex Mono serve codice, dati ed etichette tecniche, completando la trinità della famiglia insieme all'IBM Plex Serif, usato raramente.

Ciò che definisce l'identità visiva di IBM al di là del monocromatico-più-blu è il ricorso al sistema di token dei componenti di Carbon. Ogni stato interattivo si mappa su una proprietà CSS personalizzata con prefisso `--cds-` (Carbon Design System). I pulsanti non hanno colori hardcoded; fanno riferimento a `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Questa architettura tokenizzata significa che l'intero livello visivo è una sottile facciata su una fondazione profondamente sistematica — l'equivalente nel design di un'API ben tipizzata.

**Caratteristiche Principali:**
- IBM Plex Sans a peso 300 (Light) per il display — gravità aziendale attraverso la sobrietà tipografica
- IBM Plex Mono per codice e contenuti tecnici con letter-spacing costante di 0.16px alle piccole dimensioni
- Colore accento unico: IBM Blue 60 (`#0f62fe`) — ogni elemento interattivo, ogni CTA, ogni link
- Sistema di token Carbon (`--cds-*`) che governa tutti i colori semantici, abilitando il cambio di tema a livello di variabile
- Griglia di spaziatura a 8px con rispetto rigoroso — nessun valore arbitrario, tutto si allinea
- Card piatte e senza bordi su superficie Gray 10 `#f4f4f4` — profondità tramite stratificazione del colore di sfondo, non ombre
- Input con bordo inferiore (non riquadrato) — il pattern form distintivo di Carbon
- Border-radius 0px sui pulsanti primari — rettangolare senza compromessi, nessun arrotondamento

## 2. Palette Colori e Ruoli

### Primari
- **IBM Blue 60** (`#0f62fe`): Il colore interattivo singolare. Pulsanti primari, link, stati di focus, indicatori attivi. È l'unica tonalità cromatica nella palette UI principale.
- **White** (`#ffffff`): Sfondo della pagina, superfici delle card, testo dei pulsanti su blu, `--cds-background`.
- **Gray 100** (`#161616`): Testo primario, titoli, sfondi di superficie scura, barra di navigazione, footer. `--cds-text-primary`.

### Scala Neutri (Famiglia Gray)
- **Gray 100** (`#161616`): Testo primario, titoli, chrome UI scuro, sfondo del footer.
- **Gray 90** (`#262626`): Superfici scure secondarie, stati hover su sfondi scuri.
- **Gray 80** (`#393939`): Scuro terziario, stati attivi.
- **Gray 70** (`#525252`): Testo secondario, testo di aiuto, descrizioni. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Testo segnaposto, testo disabilitato.
- **Gray 50** (`#8d8d8d`): Icone disabilitate, etichette attenuate.
- **Gray 30** (`#c6c6c6`): Bordi, linee divisorie, bordi inferiori degli input. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Bordi sottili, contorni delle card.
- **Gray 10** (`#f4f4f4`): Sfondo superficie secondaria, riempimenti delle card, righe alternate. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Stato hover per le superfici Gray 10.

### Interattivi
- **Blue 60** (`#0f62fe`): Interattivo primario — pulsanti, link, focus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Stato hover dei link. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Stato attivo/premuto per gli elementi blu.
- **Blue 10** (`#edf5ff`): Superficie tinta blu, sfondo riga selezionata.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — bordo inset da 2px sugli elementi con focus.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — anello interno bianco per il focus su sfondi scuri.

### Supporto e Stato
- **Red 60** (`#da1e28`): Errore, pericolo. `--cds-support-error`.
- **Green 50** (`#24a148`): Successo. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Avviso. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informativo. `--cds-support-info`.

### Tema Scuro (Gray 100 Theme)
- **Background**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Superfici di card e contenitori.
- **Layer 02**: Gray 80 (`#393939`). Superfici elevate.
- **Text Primary**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Text Secondary**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Border Subtle**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactive**: Blue 40 (`#78a9ff`). Link ed elementi interattivi si schiariscono per garantire il contrasto.

## 3. Regole Tipografiche

### Famiglia di Font
- **Primary**: `IBM Plex Sans`, con fallback: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, con fallback: `Menlo, Courier, monospace`
- **Serif** (uso limitato): `IBM Plex Serif`, per contesti editoriali/espressivi
- **Icon Font**: `ibm_icons` — glifi icona proprietari a 20px

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza riga | Letter Spacing | Note |
|-------|------|------------|------|--------------|----------------|------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Impatto massimo, peso leggero per eleganza |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Hero secondario, fallback responsive |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Titolo espressivo |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Titoli di sezione |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Titoli di sotto-sezione |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Titoli card, intestazioni feature |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Titoli card più leggeri |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Testo di lettura standard |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Corpo enfatizzato, etichette |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Corpo compatto, didascalie |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Didascalie in grassetto, voci di navigazione |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadati, timestamp |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Codice inline, terminale |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Blocchi di codice |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Decorativo mono per hero |

### Principi
- **Peso leggero alle dimensioni display**: Il set tipografico espressivo di Carbon usa il peso 300 (Light) a partire da 42px. Questo crea una tensione distintiva — il contenuto parla con autorità aziendale mentre le forme delle lettere sussurrano con leggerezza tipografica.
- **Micro-tracking alle piccole dimensioni**: letter-spacing di 0.16px a 14px e di 0.32px a 12px. Questi valori apparentemente trascurabili sono l'arma segreta di Carbon per la leggibilità alle dimensioni compatte — aprono le strette forme delle lettere di IBM Plex quanto basta.
- **Tre pesi funzionali**: 300 (display/espressivo), 400 (corpo/lettura), 600 (enfasi/etichette UI). Il peso 700 è intenzionalmente assente dalla scala tipografica in produzione.
- **Produttivo vs. Espressivo**: I set produttivi usano altezze di riga più strette (1.29) per UI dense. I set espressivi respirano di più (1.40-1.50) per contenuti marketing ed editoriali.

## 4. Stili dei Componenti

### Pulsanti

**Pulsante Primario (Blu)**
- Background: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Testo: `#ffffff` (White)
- Padding: 14px 63px 14px 15px (asimmetrico — spazio per l'icona finale)
- Border: 1px solid transparent
- Border-radius: 0px (rettangolo netto — la firma Carbon)
- Altezza: 48px (default), 40px (compatto), 64px (espressivo)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Active: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Focus: `2px solid #0f62fe` inset + `1px solid #ffffff` interno

**Pulsante Secondario (Gray)**
- Background: `#393939` (Gray 80)
- Testo: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Active: `#6f6f6f` (Gray 60)
- Stesso padding/radius del primario

**Pulsante Terziario (Ghost Blu)**
- Background: transparent
- Testo: `#0f62fe` (Blue 60)
- Border: 1px solid `#0f62fe`
- Hover: testo `#0353e9` + tinta di sfondo Blue 10
- Border-radius: 0px

**Pulsante Ghost**
- Background: transparent
- Testo: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Border: none
- Hover: tinta di sfondo `#e8e8e8`

**Pulsante Danger**
- Background: `#da1e28` (Red 60)
- Testo: `#ffffff`
- Hover: `#b81921` (Red 70)

### Card e Contenitori
- Background: `#ffffff` sul tema bianco, `#f4f4f4` (Gray 10) per card elevate
- Border: none (design piatto — nessun bordo o ombra sulla maggior parte delle card)
- Border-radius: 0px (coerente con l'estetica rettangolare dei pulsanti)
- Hover: lo sfondo passa a `#e8e8e8` (Gray 10 Hover) per le card cliccabili
- Padding del contenuto: 16px
- Separazione: stratificazione del colore di sfondo (white → gray 10 → white) invece delle ombre

### Input e Form
- Background: `#f4f4f4` (Gray 10) — `--cds-field`
- Testo: `#161616` (Gray 100)
- Padding: 0px 16px (solo orizzontale)
- Altezza: 40px (default), 48px (grande)
- Border: nessuno sui lati/in alto — `2px solid transparent` in basso
- Bordo inferiore attivo: `2px solid #161616` (Gray 100)
- Focus: `2px solid #0f62fe` (Blue 60) bordo inferiore — `--cds-focus`
- Errore: `2px solid #da1e28` (Red 60) bordo inferiore
- Etichetta: 12px IBM Plex Sans, letter-spacing 0.32px, Gray 70
- Testo di aiuto: 12px, Gray 60
- Segnaposto: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (in alto) — gli input hanno angoli netti

### Navigazione
- Background: `#161616` (Gray 100) — masthead scuro a larghezza piena
- Altezza: 48px
- Logo: logo IBM a 8 barre, bianco su scuro, allineato a sinistra
- Link: 14px IBM Plex Sans, peso 400, `#c6c6c6` (Gray 30) predefinito
- Hover sui link: testo `#ffffff`
- Link attivo: `#ffffff` con indicatore a bordo inferiore
- Platform switcher: tab orizzontali allineati a sinistra
- Ricerca: campo di ricerca a scorrimento attivato dall'icona
- Mobile: hamburger con pannello scorrevole a sinistra

### Link
- Predefinito: `#0f62fe` (Blue 60) senza sottolineatura
- Hover: `#0043ce` (Blue 70) con sottolineatura
- Visitato: rimane Blue 60 (nessun cambio di stato per i visitati)
- Link inline: sottolineati per impostazione predefinita nel corpo del testo

### Componenti Distintivi

**Content Block (Hero/Feature)**
- Bande di sfondo alternato bianco/gray-10 a larghezza piena
- Titolo allineato a sinistra con tipo display a 60px o 48px
- CTA come pulsante primario blu con icona freccia
- Immagine/illustrazione allineata a destra o in basso su mobile

**Tile (Card Cliccabile)**
- Background: `#f4f4f4` o `#ffffff`
- Hover con bordo inferiore a larghezza piena o cambio di sfondo
- Icona freccia in basso a destra all'hover
- Nessuna ombra — la piattezza è l'identità

**Tag / Etichetta**
- Background: colore contestuale al 10% di opacità (es. Blue 10, Red 10)
- Testo: colore corrispondente al grado 60
- Padding: 4px 8px
- Border-radius: 24px (pill — eccezione alla regola 0px)
- Font: 12px peso 400

**Banner di Notifica**
- Barra a larghezza piena, tipicamente con sfondo Blue 60 o Gray 100
- Testo bianco, 14px
- Icona di chiusura/dismissione allineata a destra

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px (griglia Carbon 2x)
- Scala di spaziatura dei componenti: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Scala di spaziatura del layout: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Unità mini: 8px (spaziatura minima utilizzabile)
- Padding all'interno dei componenti: tipicamente 16px
- Gap tra card/tile: 1px (capello) o 16px (standard)

### Griglia e Contenitore
- Griglia a 16 colonne (sistema a griglia 2x di Carbon)
- Larghezza massima del contenuto: 1584px (breakpoint massimo)
- Gutters di colonna: 32px (16px su mobile)
- Margine: 16px (mobile), 32px (tablet+)
- Il contenuto si estende tipicamente su 8-12 colonne per lunghezze di riga leggibili
- Sezioni full-bleed si alternano con contenuto contenuto

### Filosofia degli Spazi Bianchi
- **Densità funzionale**: Carbon predilige la densità produttiva rispetto agli spazi bianchi generosi. Le sezioni sono compatte rispetto ai design system consumer — questo riflette il DNA enterprise di IBM.
- **Zonizzazione per colore di sfondo**: Invece di padding massivi tra le sezioni, IBM usa colori di sfondo alternati (white → gray 10 → white) per creare separazione visiva con spazio verticale minimo.
- **Ritmo costante a 48px**: Le transizioni principali tra sezioni usano 48px di spaziatura verticale. Le sezioni hero possono usare 80px–96px.

### Scala del Border Radius
- **0px**: Pulsanti primari, input, tile, card — il trattamento dominante. Carbon è fondamentalmente rettangolare.
- **2px**: Occasionalmente su piccoli elementi interattivi (tag)
- **24px**: Tag/etichette (forma pill — l'unica eccezione arrotondata)
- **50%**: Cerchi avatar, contenitori icona

## 6. Profondità ed Elevazione

| Livello | Trattamento | Utilizzo |
|---------|-------------|----------|
| Flat (Level 0) | Nessuna ombra, sfondo `#ffffff` | Superficie di pagina predefinita |
| Layer 01 | Nessuna ombra, sfondo `#f4f4f4` | Card, tile, sezioni alternate |
| Layer 02 | Nessuna ombra, sfondo `#e0e0e0` | Pannelli elevati all'interno di Layer 01 |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Dropdown, tooltip, menu overflow |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + scrim scuro | Finestre modali, pannelli laterali |
| Focus | `2px solid #0f62fe` inset + `1px solid #ffffff` | Anello di focus da tastiera |
| Bottom-border | `2px solid #161616` sul bordo inferiore | Input attivo, indicatore tab attivo |

**Filosofia delle Ombre**: Carbon è deliberatamente avverso alle ombre. IBM ottiene la profondità principalmente attraverso la stratificazione del colore di sfondo — sovrapponendo superfici di grigi progressivamente più scuri piuttosto che aggiungendo box-shadow. Questo crea un'estetica piatta, ispirata alla stampa, in cui la gerarchia è comunicata dal valore del colore, non dalla luce simulata. Le ombre sono riservate esclusivamente agli elementi flottanti (dropdown, tooltip, modali) in cui l'elemento sovrappone genuinamente il contenuto. Questa sobrietà conferisce alla rara ombra un impatto significativo — quando qualcosa fluttua in Carbon, è importante.

## 7. Da Fare e Da Evitare

### Da Fare
- Usare IBM Plex Sans a peso 300 per le dimensioni display (42px+) — la leggerezza è intenzionale
- Applicare letter-spacing di 0.16px sul testo corpo a 14px e di 0.32px sulle didascalie a 12px
- Usare border-radius 0px su pulsanti, input, card e tile — i rettangoli sono il sistema
- Fare riferimento ai nomi dei token `--cds-*` durante l'implementazione (es. `--cds-button-primary`, `--cds-text-primary`)
- Usare la stratificazione del colore di sfondo (white → gray 10 → gray 20) per la profondità invece delle ombre
- Usare il bordo inferiore (non il riquadro) per gli indicatori dei campi input
- Mantenere l'altezza predefinita del pulsante a 48px e il padding asimmetrico per l'alloggiamento delle icone
- Applicare Blue 60 (`#0f62fe`) come unico accento — un solo blu per governarli tutti

### Da Evitare
- Non arrotondare gli angoli dei pulsanti — il radius 0px è l'identità Carbon
- Non usare ombre su card o tile — la piattezza è il punto
- Non introdurre colori accento aggiuntivi — il sistema di IBM è monocromatico + blu
- Non usare il peso 700 (Bold) — la scala si ferma a 600 (Semibold)
- Non aggiungere letter-spacing al testo di dimensione display — il tracking è solo per 14px e inferiori
- Non racchiudere gli input con bordi completi — gli input Carbon usano solo il bordo inferiore
- Non usare sfondi sfumati — le superfici di IBM sono colori piatti e solidi
- Non deviare dalla griglia di spaziatura a 8px — ogni valore deve essere divisibile per 8 (con 2px e 4px per micro-aggiustamenti)

## 8. Comportamento Responsive

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-----------|----------------------|
| Small (sm) | 320px | Colonna singola, nav hamburger, margini 16px |
| Medium (md) | 672px | Iniziano le griglie a 2 colonne, contenuto espanso |
| Large (lg) | 1056px | Navigazione completa visibile, griglie 3-4 colonne |
| X-Large (xlg) | 1312px | Densità massima del contenuto, layout ampi |
| Max | 1584px | Larghezza massima del contenuto, centrato con margini |

### Aree di Tocco
- Altezza pulsante: 48px default, minimo 40px (compatto)
- Link di navigazione: altezza riga 48px per il tocco
- Altezza input: 40px default, 48px grande
- Pulsanti icona: area di tocco quadrata da 48px
- Voci del menu mobile: righe full-width da 48px

### Strategia di Collasso
- Hero: display 60px → 42px → titolo 32px al restringersi del viewport
- Navigazione: masthead orizzontale completo → hamburger con pannello scorrevole
- Griglia: 4 colonne → 2 colonne → colonna singola
- Tile/card: griglia orizzontale → stack verticale
- Immagini: mantengono il rapporto d'aspetto, max-width 100%
- Footer: gruppi di link multicolonna → colonna singola in pila
- Padding di sezione: 48px → 32px → 16px

### Comportamento delle Immagini
- Immagini responsive con `max-width: 100%`
- Le illustrazioni di prodotto scalano proporzionalmente
- Le immagini hero possono passare da affiancate a in pila sotto
- Le visualizzazioni dati mantengono il rapporto d'aspetto con scroll orizzontale su mobile

## 9. Guida ai Prompt per l'Agente

### Riferimento Rapido Colori
- CTA primario: IBM Blue 60 (`#0f62fe`)
- Sfondo: White (`#ffffff`)
- Testo dei titoli: Gray 100 (`#161616`)
- Testo del corpo: Gray 100 (`#161616`)
- Testo secondario: Gray 70 (`#525252`)
- Superficie/Card: Gray 10 (`#f4f4f4`)
- Bordo: Gray 30 (`#c6c6c6`)
- Link: Blue 60 (`#0f62fe`)
- Hover sui link: Blue 70 (`#0043ce`)
- Anello di focus: Blue 60 (`#0f62fe`)
- Errore: Red 60 (`#da1e28`)
- Successo: Green 50 (`#24a148`)

### Esempi di Prompt per Componenti
- "Crea una sezione hero su sfondo bianco. Titolo a 60px IBM Plex Sans peso 300, line-height 1.17, colore #161616. Sottotitolo a 16px peso 400, line-height 1.50, colore #525252, max-width 640px. Pulsante CTA blu (sfondo #0f62fe, testo #ffffff, border-radius 0px, altezza 48px, padding 14px 63px 14px 15px)."
- "Progetta una card tile: sfondo #f4f4f4, border-radius 0px, padding 16px. Titolo a 20px IBM Plex Sans peso 600, line-height 1.40, colore #161616. Corpo a 14px peso 400, letter-spacing 0.16px, line-height 1.29, colore #525252. Hover: lo sfondo passa a #e8e8e8."
- "Costruisci un campo form: sfondo #f4f4f4, border-radius 0px, altezza 40px, padding orizzontale 16px. Etichetta sopra a 12px peso 400, letter-spacing 0.32px, colore #525252. Bordo inferiore: 2px solid transparent predefinito, 2px solid #0f62fe al focus. Segnaposto: #6f6f6f."
- "Crea una barra di navigazione scura: sfondo #161616, altezza 48px. Logo IBM bianco allineato a sinistra. Link a 14px IBM Plex Sans peso 400, colore #c6c6c6. Hover: testo #ffffff. Attivo: #ffffff con bordo inferiore da 2px."
- "Costruisci un componente tag: sfondo Blue 10 (#edf5ff), testo Blue 60 (#0f62fe), padding 4px 8px, border-radius 24px, 12px IBM Plex Sans peso 400."

### Guida all'Iterazione
1. Usare sempre border-radius 0px su pulsanti, input e card — questo è non negoziabile in Carbon
2. Letter-spacing solo alle piccole dimensioni: 0.16px a 14px, 0.32px a 12px — mai sul testo display
3. Tre pesi: 300 (display), 400 (corpo), 600 (enfasi) — nessun bold
4. Blue 60 è l'unico colore accento — non introdurre tonalità di accento secondarie
5. La profondità deriva dalla stratificazione del colore di sfondo (white → #f4f4f4 → #e0e0e0), non dalle ombre
6. Gli input hanno solo il bordo inferiore, mai completamente riquadrati
7. Usare il prefisso `--cds-` per la denominazione dei token per restare compatibili con Carbon
8. 48px è l'altezza universale degli elementi interattivi
