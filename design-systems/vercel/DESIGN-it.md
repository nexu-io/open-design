# Design System Inspired by Vercel

> Category: Strumenti per sviluppatori
> Distribuzione frontend. Precisione in bianco e nero, font Geist.

## 1. Tema Visivo e Atmosfera

Il sito di Vercel è la tesi visiva dell'infrastruttura per sviluppatori resa invisibile — un design system così sobrio da rasentare il filosofico. La pagina è prevalentemente bianca (`#ffffff`) con testo quasi nero (`#171717`), creando un'impaginazione simile a una galleria d'arte in cui ogni elemento guadagna il proprio pixel. Non è minimalismo come decorazione; è minimalismo come principio ingegneristico. Il design system Geist tratta l'interfaccia come un compilatore tratta il codice — ogni token superfluo viene eliminato finché rimane solo la struttura.

La famiglia di font personalizzata Geist è il gioiello della corona. Geist Sans utilizza una spaziatura tra le lettere aggressivamente negativa (da -2.4px a -2.88px nelle dimensioni display), creando titoli che sembrano compressi, urgenti e ingegnerizzati — come codice minificato per la produzione. Nelle dimensioni del corpo del testo, la crenatura si allenta, ma la precisione geometrica persiste. Geist Mono completa il sistema come companion monospazio per codice, output di terminale ed etichette tecniche. Entrambi i font abilitano globalmente `"liga"` OpenType (legature), aggiungendo un livello di raffinatezza tipografica che premia la lettura attenta.

Ciò che distingue Vercel dagli altri design system monocromatici è la sua filosofia dell'ombra come bordo. Invece dei tradizionali bordi CSS, Vercel usa `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — un'ombra a offset zero, sfocatura zero e spread 1px che crea una linea simile a un bordo senza le implicazioni del box model. Questa tecnica consente ai bordi di esistere nel livello delle ombre, permettendo transizioni più fluide, angoli arrotondati senza clipping e un peso visivo più sottile rispetto ai bordi tradizionali. L'intero sistema di profondità è costruito su stack di ombre multi-valore stratificate, dove ogni livello ha uno scopo specifico: uno per il bordo, uno per la morbida elevazione, uno per la profondità ambientale.

**Caratteristiche Principali:**
- Geist Sans con spaziatura tra le lettere estremamente negativa (da -2.4px a -2.88px in display) — il testo come infrastruttura compressa
- Geist Mono per codice ed etichette tecniche con `"liga"` OpenType abilitato globalmente
- Tecnica dell'ombra come bordo: `box-shadow 0px 0px 0px 1px` sostituisce i bordi tradizionali ovunque
- Stack di ombre multi-livello per una profondità sfumata (bordo + elevazione + ambientale in dichiarazioni singole)
- Tela quasi bianca pura con testo `#171717` — non completamente nero, che crea una morbidezza di micro-contrasto
- Colori accentuati specifici per il workflow: Ship Red (`#ff5b4f`), Preview Pink (`#de1d8d`), Develop Blue (`#0a72ef`)
- Sistema di anello di focus con `hsla(212, 100%, 48%, 1)` — un blu saturo per l'accessibilità
- Badge a pillola (9999px) con sfondi sfumati per indicatori di stato

## 2. Palette Colori e Ruoli

### Primari
- **Vercel Black** (`#171717`): Testo primario, titoli, sfondi di superfici scure. Non è nero puro — il leggero calore impedisce la durezza.
- **Pure White** (`#ffffff`): Sfondo della pagina, superfici delle card, testo dei pulsanti su scuro.
- **True Black** (`#000000`): Uso secondario, `--geist-console-text-color-default`, usato in contesti specifici di console/codice.

### Colori Accentuati del Workflow
- **Ship Red** (`#ff5b4f`): `--ship-text`, la fase "ship to production" del workflow — corallo-rosso caldo e urgente.
- **Preview Pink** (`#de1d8d`): `--preview-text`, il workflow di distribuzione in anteprima — magenta-rosa vivido.
- **Develop Blue** (`#0a72ef`): `--develop-text`, il workflow di sviluppo — blu brillante e focalizzato.

### Colori Console / Codice
- **Console Blue** (`#0070f3`): `--geist-console-text-color-blue`, blu per l'evidenziazione della sintassi.
- **Console Purple** (`#7928ca`): `--geist-console-text-color-purple`, viola per l'evidenziazione della sintassi.
- **Console Pink** (`#eb367f`): `--geist-console-text-color-pink`, rosa per l'evidenziazione della sintassi.

### Interattivi
- **Link Blue** (`#0072f5`): Colore primario dei link con decorazione di sottolineatura.
- **Focus Blue** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, anello di focus sugli elementi interattivi.
- **Ring Blue** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, utility ring di Tailwind.

### Scala dei Neutri
- **Gray 900** (`#171717`): Testo primario, titoli, testo di navigazione.
- **Gray 600** (`#4d4d4d`): Testo secondario, testo descrittivo.
- **Gray 500** (`#666666`): Testo terziario, link attenuati.
- **Gray 400** (`#808080`): Testo segnaposto, stati disabilitati.
- **Gray 100** (`#ebebeb`): Bordi, contorni delle card, divisori.
- **Gray 50** (`#fafafa`): Tinta di superficie sottile, evidenziazione dell'ombra interna.

### Superficie e Overlay
- **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, sfondo di modal/dialog.
- **Selection Text** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, evidenziazione della selezione del testo.
- **Badge Blue Bg** (`#ebf5ff`): Sfondo del badge a pillola, superficie azzurra sfumata.
- **Badge Blue Text** (`#0068d6`): Testo del badge a pillola, blu più scuro per la leggibilità.

### Ombre e Profondità
- **Border Shadow** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): La firma — sostituisce i bordi tradizionali.
- **Subtle Elevation** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Sollevamento minimo per le card.
- **Card Stack** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Ombra card multi-livello completa.
- **Ring Border** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Anello-bordo grigio chiaro per tab e immagini.

## 3. Regole Tipografiche

### Famiglia di Font
- **Primario**: `Geist`, con fallback: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospazio**: `Geist Mono`, con fallback: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Funzionalità OpenType**: `"liga"` abilitato globalmente su tutto il testo Geist; `"tnum"` per numeri tabulari su didascalie specifiche.

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (compatto) | -2.4px a -2.88px | Massima compressione, impatto da billboard |
| Titolo di Sezione | Geist | 40px (2.50rem) | 600 | 1.20 (compatto) | -2.4px | Titoli di sezione feature |
| Sottotitolo Grande | Geist | 32px (2.00rem) | 600 | 1.25 (compatto) | -1.28px | Titoli delle card, sotto-sezioni |
| Sottotitolo | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Sottotitoli più leggeri |
| Titolo Card | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Card feature |
| Titolo Card Light | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Titoli card secondarie |
| Corpo Grande | Geist | 20px (1.25rem) | 400 | 1.80 (rilassato) | normal | Introduzioni, descrizioni feature |
| Corpo | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Testo di lettura standard |
| Corpo Piccolo | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Testo UI standard |
| Corpo Medio | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Navigazione, testo enfatizzato |
| Corpo Grassetto | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Etichette forti, stati attivi |
| Pulsante / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Pulsanti, link, didascalie |
| Pulsante Piccolo | Geist | 14px (0.88rem) | 400 | 1.00 (compatto) | normal | Pulsanti compatti |
| Didascalia | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadati, tag |
| Mono Corpo | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Blocchi di codice |
| Mono Didascalia | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Etichette codice |
| Mono Piccolo | Geist Mono | 12px (0.75rem) | 500 | 1.00 (compatto) | normal | `text-transform: uppercase`, etichette tecniche |
| Micro Badge | Geist | 7px (0.44rem) | 700 | 1.00 (compatto) | normal | `text-transform: uppercase`, badge minuscoli |

### Principi
- **La compressione come identità**: Geist Sans nelle dimensioni display usa da -2.4px a -2.88px di spaziatura tra le lettere — il tracking negativo più aggressivo di qualsiasi sistema di design importante. Crea testo che sembra _minificato_, come codice ottimizzato per la produzione. Il tracking si allenta progressivamente al diminuire della dimensione: -1.28px a 32px, -0.96px a 24px, -0.32px a 16px, e normal a 14px.
- **Legature ovunque**: Ogni elemento di testo Geist abilita `"liga"` OpenType. Le legature non sono decorative — sono strutturali, creando combinazioni di glifi più compatte ed efficienti.
- **Tre pesi, ruoli rigidi**: 400 (corpo/lettura), 500 (UI/interattivo), 600 (titoli/enfasi). Nessun grassetto (700) tranne i micro-badge minuscoli. Questo intervallo ristretto di pesi crea gerarchia attraverso dimensione e tracking, non il peso.
- **Mono per l'identità**: Geist Mono in maiuscolo con `"tnum"` o `"liga"` serve come voce "console dello sviluppatore" — etichette tecniche compatte che collegano il sito marketing al prodotto.

## 4. Stili dei Componenti

### Pulsanti

**Primario Bianco (con bordo-ombra)**
- Sfondo: `#ffffff`
- Testo: `#171717`
- Padding: 0px 6px (minimale — larghezza guidata dal contenuto)
- Raggio: 6px (leggermente arrotondato)
- Ombra: `rgb(235, 235, 235) 0px 0px 0px 1px` (anello-bordo)
- Hover: lo sfondo diventa `var(--ds-gray-1000)` (scuro)
- Focus: contorno `2px solid var(--ds-focus-color)` + ombra `var(--ds-focus-ring)`
- Uso: Pulsante secondario standard

**Primario Scuro (dedotto dal sistema Geist)**
- Sfondo: `#171717`
- Testo: `#ffffff`
- Padding: 8px 16px
- Raggio: 6px
- Uso: CTA primario ("Start Deploying", "Get Started")

**Pulsante a Pillola / Badge**
- Sfondo: `#ebf5ff` (azzurro sfumato)
- Testo: `#0068d6`
- Padding: 0px 10px
- Raggio: 9999px (pillola completa)
- Font: 12px peso 500
- Uso: Badge di stato, tag, etichette feature

**Pillola Grande (Navigazione)**
- Sfondo: trasparente o `#171717`
- Raggio: 64px–100px
- Uso: Navigazione a tab, selettori di sezione

### Card e Contenitori
- Sfondo: `#ffffff`
- Bordo: tramite ombra — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Raggio: 8px (standard), 12px (card in evidenza/con immagine)
- Stack di ombre: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Card con immagine: `1px solid #ebebeb` con raggio superiore 12px
- Hover: lieve intensificazione dell'ombra

### Input e Form
- Radio: stile standard con focus sfondo `var(--ds-gray-200)`
- Ombra di focus: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Contorno di focus: `2px solid var(--ds-focus-color)` — anello di focus blu coerente
- Bordo: tramite tecnica dell'ombra, non bordo tradizionale

### Navigazione
- Nav orizzontale pulita su bianco, sticky
- Logotipo Vercel allineato a sinistra, 262x52px
- Link: Geist 14px peso 500, testo `#171717`
- Attivo: peso 600 o sottolineatura
- CTA: pulsanti a pillola scuri ("Start Deploying", "Contact Sales")
- Mobile: collasso a menu hamburger
- Dropdown di prodotto con menu multi-livello

### Trattamento delle Immagini
- Screenshot di prodotto con bordo `1px solid #ebebeb`
- Immagini arrotondate in alto: raggio `12px 12px 0px 0px`
- Screenshot di dashboard/anteprima codice dominano le sezioni feature
- Sfondi con sfumatura morbida dietro le immagini hero (pastello multi-colore)

### Componenti Distintivi

**Pipeline del Workflow**
- Pipeline orizzontale a tre fasi: Develop → Preview → Ship
- Ogni fase ha il proprio colore accentuato: Blu → Rosa → Rosso
- Collegati con linee/frecce
- La metafora visiva della proposta di valore principale di Vercel

**Barra di Fiducia / Griglia Loghi**
- Loghi aziendali (Perplexity, ChatGPT, Cursor, ecc.) in scala di grigi
- Scorrimento orizzontale o layout a griglia
- Leggera separazione con bordo `#ebebeb`

**Card Metriche**
- Visualizzazione di numeri grandi (es. "10x faster")
- Geist 48px peso 600 per la metrica
- Descrizione sotto in testo corpo grigio
- Contenitore card con bordo-ombra

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Gap notevole: salta da 16px a 32px — nessun 20px o 24px nella scala primaria

### Griglia e Contenitore
- Larghezza massima del contenuto: circa 1200px
- Hero: singola colonna centrata con generoso padding superiore
- Sezioni feature: griglie a 2–3 colonne per le card
- Divisori a larghezza piena con `border-bottom: 1px solid #171717`
- Screenshot di codice/dashboard a larghezza piena o contenuti con bordo

### Filosofia dello Spazio Bianco
- **Vuoto da galleria**: Padding verticale massiccio tra le sezioni (80px–120px+). Lo spazio bianco È il design — comunica che Vercel non ha nulla da dimostrare e nulla da nascondere.
- **Testo compresso, spazio espanso**: La spaziatura tra le lettere aggressivamente negativa nei titoli è bilanciata da uno spazio bianco circostante generoso. Il testo è denso; lo spazio attorno è vasto.
- **Ritmo delle sezioni**: Le sezioni bianche si alternano con sezioni bianche — non c'è variazione di colore tra le sezioni. La separazione avviene solo tramite bordi (bordi-ombra) e spaziatura.

### Scala dei Raggi di Bordo
- Micro (2px): Frammenti di codice inline, span piccoli
- Sottile (4px): Contenitori piccoli
- Standard (6px): Pulsanti, link, elementi funzionali
- Comodo (8px): Card, voci di elenco
- Immagine (12px): Card in evidenza, contenitori di immagini (arrotondati in alto)
- Grande (64px): Pillole di navigazione a tab
- XL (100px): Link di navigazione grandi
- Pillola Piena (9999px): Badge, pillole di stato, tag
- Cerchio (50%): Toggle del menu, contenitori avatar

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra | Sfondo della pagina, blocchi di testo |
| Anello (Livello 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Ombra come bordo per la maggior parte degli elementi |
| Anello Chiaro (Livello 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Anello più chiaro per tab e immagini |
| Card Sottile (Livello 2) | Anello + `rgba(0,0,0,0.04) 0px 2px 2px` | Card standard con sollevamento minimo |
| Card Completa (Livello 3) | Anello + Sottile + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + anello interno `#fafafa` | Card in evidenza, pannelli evidenziati |
| Focus (Accessibilità) | Contorno `2px solid hsla(212, 100%, 48%, 1)` | Focus da tastiera su tutti gli elementi interattivi |

**Filosofia delle Ombre**: Vercel possiede probabilmente il sistema di ombre più sofisticato nel web design moderno. Invece di usare le ombre per l'elevazione nel senso tradizionale del Material Design, Vercel utilizza stack di ombre multi-valore dove ogni livello ha uno scopo architetturale distinto: uno crea il "bordo" (spread 0px, 1px), un altro aggiunge morbidezza ambientale (sfocatura 2px), un altro gestisce la profondità a distanza (sfocatura 8px con spread negativo), e un anello interno (`#fafafa`) crea la leggera evidenziazione che fa "brillare" la card dall'interno. Questo approccio stratificato fa sì che le card sembrino costruite, non fluttuanti.

### Profondità Decorativa
- Sfumatura hero: leggera sfumatura pastello multi-colore dietro il contenuto hero (appena visibile, atmosferica)
- Bordi di sezione: `1px solid #171717` (linea scura completa) tra le sezioni principali
- Nessuna variazione del colore di sfondo — la profondità deriva interamente dalla stratificazione delle ombre e dal contrasto dei bordi

## 7. Da Fare e Da Non Fare

### Da Fare
- Usare Geist Sans con spaziatura tra le lettere aggressivamente negativa nelle dimensioni display (da -2.4px a -2.88px a 48px)
- Usare l'ombra come bordo (`0px 0px 0px 1px rgba(0,0,0,0.08)`) invece dei tradizionali bordi CSS
- Abilitare `"liga"` su tutto il testo Geist — le legature sono strutturali, non opzionali
- Usare il sistema a tre pesi: 400 (corpo), 500 (UI), 600 (titoli)
- Applicare i colori accentuati del workflow (Rosso/Rosa/Blu) solo nel loro contesto di workflow
- Usare stack di ombre multi-livello per le card (bordo + elevazione + ambientale + evidenziazione interna)
- Mantenere la palette cromatica acromatica — i grigi da `#171717` a `#ffffff` sono il sistema
- Usare `#171717` invece di `#000000` per il testo primario — il micro-calore conta

### Da Non Fare
- Non usare spaziatura tra le lettere positiva su Geist Sans — è sempre negativa o zero
- Non usare il peso 700 (grassetto) sul testo del corpo — 600 è il massimo, usato solo per i titoli
- Non usare il `border` CSS tradizionale sulle card — usare la tecnica del bordo-ombra
- Non introdurre colori caldi (aranci, gialli, verdi) nel chrome dell'interfaccia
- Non applicare i colori accentuati del workflow (Ship Red, Preview Pink, Develop Blue) in modo decorativo
- Non usare ombre pesanti (opacità > 0.1) — il sistema di ombre è a livello di sussurro
- Non aumentare la spaziatura delle lettere del testo corpo — Geist è progettato per correre stretto
- Non usare il raggio a pillola (9999px) sui pulsanti di azione primari — le pillole sono solo per badge/tag
- Non saltare l'anello interno `#fafafa` nelle ombre delle card — è il bagliore che fa funzionare il sistema

## 8. Comportamento Responsive

### Breakpoint
| Nome | Larghezza | Modifiche Chiave |
|------|-------|-------------|
| Mobile Piccolo | <400px | Singola colonna stretta, padding minimo |
| Mobile | 400–600px | Mobile standard, layout a colonna |
| Tablet Piccolo | 600–768px | Le griglie a 2 colonne iniziano |
| Tablet | 768–1024px | Griglie di card complete, padding espanso |
| Desktop Piccolo | 1024–1200px | Layout desktop standard |
| Desktop | 1200–1400px | Layout completo, larghezza massima del contenuto |
| Desktop Grande | >1400px | Centrato, margini generosi |

### Target di Tocco
- I pulsanti usano un padding comodo (8px–16px verticale)
- Link di navigazione a 14px con spaziatura adeguata
- I badge a pillola hanno 10px di padding orizzontale per i target di tocco
- Il toggle del menu mobile usa un pulsante circolare con raggio 50%

### Strategia di Collasso
- Hero: display 48px → si riduce, mantiene il tracking negativo proporzionalmente
- Navigazione: link orizzontali + CTA → menu hamburger
- Card feature: 3 colonne → 2 colonne → singola colonna impilata
- Screenshot del codice: mantengono il rapporto d'aspetto, possono scorrere orizzontalmente
- Loghi della barra di fiducia: griglia → scorrimento orizzontale
- Footer: multi-colonna → singola colonna impilata
- Spaziatura delle sezioni: 80px+ → 48px su mobile

### Comportamento delle Immagini
- Gli screenshot della dashboard mantengono il trattamento del bordo a tutte le dimensioni
- La sfumatura hero si ammorbidisce/semplifica su mobile
- Gli screenshot del prodotto usano immagini responsive con raggio di bordo coerente
- Le sezioni a larghezza piena mantengono il trattamento bordo-a-bordo

## 9. Guida ai Prompt per l'Agente

### Riferimento Rapido Colori
- CTA primario: Vercel Black (`#171717`)
- Sfondo: Pure White (`#ffffff`)
- Testo titoli: Vercel Black (`#171717`)
- Testo corpo: Gray 600 (`#4d4d4d`)
- Bordo (ombra): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Link Blue (`#0072f5`)
- Anello di focus: Focus Blue (`hsla(212, 100%, 48%, 1)`)

### Prompt di Componenti di Esempio
- "Crea una sezione hero su sfondo bianco. Titolo a 48px Geist peso 600, line-height 1.00, letter-spacing -2.4px, colore #171717. Sottotitolo a 20px Geist peso 400, line-height 1.80, colore #4d4d4d. Pulsante CTA scuro (#171717, raggio 6px, padding 8px 16px) e pulsante ghost (bianco, bordo-ombra rgba(0,0,0,0.08) 0px 0px 0px 1px, raggio 6px)."
- "Progetta una card: sfondo bianco, nessun bordo CSS. Usa lo stack di ombre: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Raggio 8px. Titolo a 24px Geist peso 600, letter-spacing -0.96px. Corpo a 16px peso 400, #4d4d4d."
- "Crea un badge a pillola: sfondo #ebf5ff, testo #0068d6, raggio 9999px, padding 0px 10px, Geist 12px peso 500."
- "Crea la navigazione: header sticky bianco. Geist 14px peso 500 per i link, testo #171717. CTA a pillola scura 'Start Deploying' allineata a destra. Bordo-ombra in basso: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Progetta una sezione workflow che mostra tre fasi: Develop (colore testo #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Ogni fase: etichetta Geist Mono 14px maiuscolo + titolo Geist 24px peso 600 + descrizione 16px peso 400 in #4d4d4d."

### Guida all'Iterazione
1. Usare sempre l'ombra come bordo invece del bordo CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` è la base
2. La spaziatura tra le lettere scala con la dimensione del font: -2.4px a 48px, -1.28px a 32px, -0.96px a 24px, normal a 14px
3. Solo tre pesi: 400 (leggere), 500 (interagire), 600 (annunciare)
4. Il colore è funzionale, mai decorativo — i colori del workflow (Rosso/Rosa/Blu) indicano solo le fasi della pipeline
5. L'anello interno `#fafafa` nelle ombre delle card è ciò che conferisce alle card Vercel il loro sottile bagliore interno
6. Geist Mono in maiuscolo per le etichette tecniche, Geist Sans per tutto il resto
