# Design System Inspired by Stripe

> Category: Fintech & Cripto
> Infrastruttura di pagamento. Gradienti viola caratteristici, eleganza con peso 300.

## 1. Tema Visivo e Atmosfera

Il sito web di Stripe è il punto di riferimento nel design fintech — un sistema che riesce a sembrare allo stesso tempo tecnico e lussuoso, preciso e caldo. La pagina si apre su una tela bianca pulita (`#ffffff`) con intestazioni blu navy profondi (`#061b31`) e un viola caratteristico (`#533afd`) che funge sia da ancoraggio del brand sia da accento interattivo. Non è il viola freddo e clinico del software enterprise; è un violetto ricco e saturo che trasmette sicurezza e qualità premium. L'impressione complessiva è quella di un istituto finanziario ridisegnato da una fonderia tipografica di livello mondiale.

Il font variabile personalizzato `sohne-var` è l'elemento distintivo dell'identità visiva di Stripe. Ogni elemento testuale abilita il set stilistico OpenType `"ss01"`, che modifica le forme dei caratteri per un aspetto decisamente geometrico e moderno. Alle dimensioni display (48px–56px), sohne-var viene usato con peso 300 — un peso straordinariamente leggero per i titoli, che crea un'autorevolezza eterea, quasi sussurrata. È l'opposto della convenzione "titolo hero in grassetto"; i titoli di Stripe sembrano non aver bisogno di urlare. La spaziatura negativa tra le lettere (-1,4px a 56px, -0,96px a 48px) comprime il testo in blocchi densi e ingegnerizzati. Alle dimensioni più piccole, il sistema usa anch'esso peso 300 con tracking proporzionalmente ridotto, e numerali tabulari tramite `"tnum"` per la visualizzazione di dati finanziari.

Ciò che distingue davvero Stripe è il suo sistema di ombre. Anziché l'approccio piatto o a singolo strato della maggior parte dei siti, Stripe usa ombre multistrato con tonalità blu: la caratteristica `rgba(50,50,93,0.25)` combinata con `rgba(0,0,0,0.1)` crea ombre con una profondità fresca, quasi atmosferica — come se gli elementi fluttuassero in un cielo al crepuscolo. La sfumatura blu-grigia del colore d'ombra primario (50,50,93) è direttamente collegata alla palette navy-viola del brand, rendendo persino l'elevazione coerente con il marchio.

**Caratteristiche Principali:**
- sohne-var con OpenType `"ss01"` su tutti i testi — un set stilistico personalizzato che definisce le lettere del brand
- Peso 300 come peso caratteristico dei titoli — leggero, sicuro, anticonvenzionale
- Spaziatura negativa tra le lettere alle dimensioni display (-1,4px a 56px, rilassamento progressivo verso il basso)
- Ombre multistrato con tonalità blu usando `rgba(50,50,93,0.25)` — elevazione che sembra colorata dal brand
- Intestazioni blu navy profondo (`#061b31`) invece del nero — caldo, premium, di livello finanziario
- Border-radius conservativo (4px–8px) — niente a pillola, niente di brusco
- Accenti rubino (`#ea2261`) e magenta (`#f96bee`) per elementi di gradiente e decorativi
- `SourceCodePro` come font monospazio complementare per codice ed etichette tecniche

## 2. Palette Colori e Ruoli

### Primari
- **Viola Stripe** (`#533afd`): Colore brand primario, sfondi CTA, testo link, highlight interattivi. Un blu-violetto saturo che fa da ancoraggio all'intero sistema.
- **Blu Navy Profondo** (`#061b31`): `--hds-color-heading-solid`. Colore primario delle intestazioni. Non nero, non grigio — un blu molto scuro che aggiunge calore e profondità al testo.
- **Bianco Puro** (`#ffffff`): Sfondo pagina, superfici delle card, testo dei pulsanti su sfondi scuri.

### Brand e Scuro
- **Brand Scuro** (`#1c1e54`): `--hds-color-util-brand-900`. Indaco profondo per sezioni scure, sfondi footer e momenti di immersione nel brand.
- **Navy Scuro** (`#0d253d`): `--hds-color-core-neutral-975`. Il neutro più scuro — quasi nero con una sfumatura blu per la massima profondità senza durezza.

### Colori Accento
- **Rubino** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Rosa-rosso caldo per icone, avvisi ed elementi accento.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Rosa-viola vivace per gradienti e highlight decorativi.
- **Magenta Chiaro** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Superficie tinta per card e badge a tema magenta.

### Interattivi
- **Viola Primario** (`#533afd`): Colore link primario, stati attivi, elementi selezionati.
- **Viola Hover** (`#4434d4`): Viola più scuro per gli stati hover degli elementi primari.
- **Viola Profondo** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Viola scuro per gli stati hover delle icone.
- **Viola Chiaro** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Lavanda tenue per sfondi hover attenuati.
- **Viola Medio** (`#665efd`): `--hds-color-input-selector-text-range`. Colore del selettore range e highlight degli input.

### Scala Neutri
- **Intestazione** (`#061b31`): Intestazioni principali, testo nav, etichette in evidenza.
- **Etichetta** (`#273951`): `--hds-color-input-text-label`. Etichette form, intestazioni secondarie.
- **Corpo** (`#64748d`): Testo secondario, descrizioni, didascalie.
- **Verde Successo** (`#15be53`): Badge di stato, indicatori di successo (con alpha 0,2–0,4 per sfondi/bordi).
- **Testo Successo** (`#108c3d`): Colore del testo dei badge di successo.
- **Limone** (`#9b6829`): `--hds-color-core-lemon-500`. Accento di avviso e highlight.

### Superfici e Bordi
- **Bordo Predefinito** (`#e5edf5`): Colore bordo standard per card, divisori e contenitori.
- **Bordo Viola** (`#b9b9f9`): Bordi degli stati attivi/selezionati su pulsanti e input.
- **Bordo Viola Tenue** (`#d6d9fc`): Bordi con sfumatura viola tenue per elementi secondari.
- **Bordo Magenta** (`#ffd7ef`): Bordi con sfumatura rosa per elementi a tema magenta.
- **Bordo Tratteggiato** (`#362baa`): Bordi tratteggiati per zone di rilascio ed elementi segnaposto.

### Colori Ombra
- **Ombra Blu** (`rgba(50,50,93,0.25)`): Il caratteristico — colore d'ombra primario con sfumatura blu.
- **Ombra Blu Scuro** (`rgba(3,3,39,0.25)`): Ombra blu più profonda per elementi elevati.
- **Ombra Nera** (`rgba(0,0,0,0.1)`): Strato d'ombra secondario per il rinforzo della profondità.
- **Ombra Ambiente** (`rgba(23,23,23,0.08)`): Ombra ambiente tenue per un'elevazione sottile.
- **Ombra Morbida** (`rgba(23,23,23,0.06)`): Ombra ambiente minima per un sollevamento leggero.

## 3. Regole Tipografiche

### Famiglia di Font
- **Primario**: `sohne-var`, con fallback: `SF Pro Display`
- **Monospazio**: `SourceCodePro`, con fallback: `SFMono-Regular`
- **Funzionalità OpenType**: `"ss01"` abilitato globalmente su tutto il testo sohne-var; `"tnum"` per numeri tabulari su dati finanziari e didascalie.

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Funzionalità | Note |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (stretto) | -1.4px | ss01 | Dimensione massima, autorevolezza sussurrata |
| Display Grande | sohne-var | 48px (3.00rem) | 300 | 1.15 (stretto) | -0.96px | ss01 | Titoli hero secondari |
| Intestazione Sezione | sohne-var | 32px (2.00rem) | 300 | 1.10 (stretto) | -0.64px | ss01 | Titoli di sezione delle funzionalità |
| Sottotitolo Grande | sohne-var | 26px (1.63rem) | 300 | 1.12 (stretto) | -0.26px | ss01 | Intestazioni card, sottosezioni |
| Sottotitolo | sohne-var | 22px (1.38rem) | 300 | 1.10 (stretto) | -0.22px | ss01 | Intestazioni sezione più piccole |
| Corpo Grande | sohne-var | 18px (1.13rem) | 300 | 1.40 | normale | ss01 | Descrizioni funzionalità, testo introduttivo |
| Corpo | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normale | ss01 | Testo di lettura standard |
| Pulsante | sohne-var | 16px (1.00rem) | 400 | 1.00 (stretto) | normale | ss01 | Testo pulsante primario |
| Pulsante Piccolo | sohne-var | 14px (0.88rem) | 400 | 1.00 (stretto) | normale | ss01 | Pulsanti secondari/compatti |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (stretto) | normale | ss01 | Link di navigazione |
| Didascalia | sohne-var | 13px (0.81rem) | 400 | normale | normale | ss01 | Etichette piccole, metadati |
| Didascalia Piccola | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normale | ss01 | Caratteri fini, timestamp |
| Didascalia Tabulare | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Dati finanziari, numeri |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (stretto) | 0.1px | ss01 | Etichette minuscole, marcatori asse |
| Micro Tabulare | sohne-var | 10px (0.63rem) | 300 | 1.15 (stretto) | -0.3px | tnum | Dati grafico, numeri piccoli |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (stretto) | normale | ss01 | Etichette più piccole |
| Corpo Codice | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rilassato) | normale | -- | Blocchi di codice, sintassi |
| Codice Grassetto | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (rilassato) | normale | -- | Codice in grassetto, parole chiave |
| Etichetta Codice | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rilassato) | normale | maiuscolo | Etichette tecniche |
| Codice Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (stretto) | normale | ss01 | Annotazioni codice minuscole |

### Principi
- **Il peso leggero come firma**: Il peso 300 alle dimensioni display è la scelta tipografica più distintiva di Stripe. Dove altri usano 600–700 per attirare l'attenzione, Stripe usa la leggerezza come lusso — il testo è così sicuro di sé da non aver bisogno del peso per essere autorevole.
- **ss01 ovunque**: Il set stilistico `"ss01"` è irrinunciabile. Modifica glifi specifici (probabilmente forme alternate di `a`, `g`, `l`) per creare un aspetto più geometrico e contemporaneo su tutto il testo sohne-var.
- **Due modalità OpenType**: `"ss01"` per il testo display/corpo, `"tnum"` per i numerali tabulari nei dati finanziari. Non si sovrappongono mai — un numero in un paragrafo usa ss01, un numero in una tabella dati usa tnum.
- **Tracking progressivo**: La spaziatura tra le lettere si stringe proporzionalmente con la dimensione: -1,4px a 56px, -0,96px a 48px, -0,64px a 32px, -0,26px a 26px, normale a 16px e sotto.
- **Semplicità a due pesi**: Principalmente 300 (corpo e intestazioni) e 400 (UI/pulsanti). Nessun grassetto (700) nel font primario — SourceCodePro usa 500/700 per il contrasto nel codice.

## 4. Stili dei Componenti

### Pulsanti

**Viola Primario**
- Sfondo: `#533afd`
- Testo: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Font: 16px sohne-var peso 400, `"ss01"`
- Hover: sfondo `#4434d4`
- Uso: CTA primario ("Inizia ora", "Contatta le vendite")

**Ghost / Delineato**
- Sfondo: trasparente
- Testo: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Bordo: `1px solid #b9b9f9`
- Font: 16px sohne-var peso 400, `"ss01"`
- Hover: lo sfondo passa a `rgba(83,58,253,0.05)`
- Uso: Azioni secondarie

**Info Trasparente**
- Sfondo: trasparente
- Testo: `#2874ad`
- Padding: 8px 16px
- Radius: 4px
- Bordo: `1px solid rgba(43,145,223,0.2)`
- Uso: Azioni terziarie/di livello informativo

**Ghost Neutro**
- Sfondo: trasparente (`rgba(255,255,255,0)`)
- Testo: `rgba(16,16,16,0.3)`
- Padding: 8px 16px
- Radius: 4px
- Contorno: `1px solid rgb(212,222,233)`
- Uso: Azioni disabilitate o attenuate

### Card e Contenitori
- Sfondo: `#ffffff`
- Bordo: `1px solid #e5edf5` (standard) o `1px solid #061b31` (accento scuro)
- Radius: 4px (stretto), 5px (standard), 6px (comodo), 8px (in evidenza)
- Ombra (standard): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Ombra (ambiente): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: l'ombra si intensifica, aggiungendo spesso lo strato con tonalità blu

### Badge / Tag / Pillole
**Pillola Neutra**
- Sfondo: `#ffffff`
- Testo: `#000000`
- Padding: 0px 6px
- Radius: 4px
- Bordo: `1px solid #f6f9fc`
- Font: 11px peso 400

**Badge Successo**
- Sfondo: `rgba(21,190,83,0.2)`
- Testo: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Bordo: `1px solid rgba(21,190,83,0.4)`
- Font: 10px peso 300

### Input e Form
- Bordo: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd` o anello viola
- Etichetta: `#273951`, 14px sohne-var
- Testo: `#061b31`
- Segnaposto: `#64748d`

### Navigazione
- Navigazione orizzontale pulita su bianco, sticky con sfondo sfocato
- Logotipo del brand allineato a sinistra
- Link: sohne-var 14px peso 400, testo `#061b31` con `"ss01"`
- Radius: 6px sul contenitore nav
- CTA: pulsante viola allineato a destra ("Accedi", "Inizia ora")
- Mobile: toggle hamburger con radius 6px

### Elementi Decorativi
**Bordi Tratteggiati**
- `1px dashed #362baa` (viola) per zone segnaposto/di rilascio
- `1px dashed #ffd7ef` (magenta) per bordi decorativi a tema magenta

**Accenti Gradiente**
- Gradienti da rubino a magenta (`#ea2261` a `#f96bee`) per decorazioni hero
- Le sezioni brand scure usano sfondi `#1c1e54` con testo bianco

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Notevole: la scala è densa nell'estremità piccola (ogni 2px da 4 a 12), riflettendo l'UI orientata alla precisione di Stripe per i dati finanziari

### Griglia e Contenitore
- Larghezza massima del contenuto: circa 1080px
- Hero: colonna singola centrata con padding generoso, titoli leggeri
- Sezioni funzionalità: griglie a 2–3 colonne per le card delle funzionalità
- Sezioni scure a larghezza piena con sfondo `#1c1e54` per l'immersione nel brand
- Anteprime di codice/dashboard come card contenute con ombre a tonalità blu

### Filosofia degli Spazi Bianchi
- **Spaziatura di precisione**: A differenza della vastità vuota dei sistemi minimalisti, Stripe usa uno spazio bianco misurato e intenzionale. Ogni gap è una scelta tipografica deliberata.
- **Dati densi, chrome generoso**: Le visualizzazioni di dati finanziari (tabelle, grafici) sono confezionate strettamente, ma il chrome dell'interfaccia intorno a esse è spaziato generosamente. Questo crea una sensazione di densità controllata — come un foglio di calcolo ben organizzato in una bella cornice.
- **Ritmo delle sezioni**: Le sezioni bianche si alternano a sezioni brand scure (`#1c1e54`), creando una cadenza drammatica chiaro/scuro che previene la monotonia senza introdurre colori arbitrari.

### Scala del Border-Radius
- Micro (1px): Elementi a grana fine, arrotondamento sottile
- Standard (4px): Pulsanti, input, badge, card — il cavallo di battaglia
- Comodo (5px): Contenitori card standard
- Rilassato (6px): Navigazione, elementi interattivi più grandi
- Grande (8px): Card in evidenza, elementi hero
- Composto: `0px 0px 6px 6px` per contenitori arrotondati in basso (pannelli tab, piè di pagina dropdown)

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra | Sfondo pagina, testo inline |
| Ambiente (Livello 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Sollevamento sottile delle card, suggerimenti hover |
| Standard (Livello 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Card standard, pannelli di contenuto |
| Elevato (Livello 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Card in evidenza, dropdown, popover |
| Profondo (Livello 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modali, pannelli fluttuanti |
| Anello (Accessibilità) | contorno `2px solid #533afd` | Anello di focus da tastiera |

**Filosofia delle Ombre**: Il sistema di ombre di Stripe è costruito su un principio di profondità cromatica. Dove la maggior parte dei sistemi di design usa ombre grigio neutro o nero, il colore d'ombra primario di Stripe (`rgba(50,50,93,0.25)`) è un blu-grigio profondo che riecheggia la palette navy del brand. Questo crea ombre che non aggiungono solo profondità — aggiungono atmosfera al brand. L'approccio multistrato abbina questa ombra con tonalità blu a uno strato secondario nero puro (`rgba(0,0,0,0.1)`) con un offset diverso, creando una profondità simile al parallasse dove l'ombra brandizzata è più lontana dall'elemento e l'ombra neutra è più vicina. I valori di spread negativi (-30px, -18px) assicurano che le ombre non si estendano oltre l'impronta dell'elemento in orizzontale, mantenendo l'elevazione verticale e controllata.

### Profondità Decorativa
- Le sezioni brand scure (`#1c1e54`) creano profondità immersiva attraverso il contrasto del colore di sfondo
- Sovrapposizioni di gradiente con transizioni da rubino a magenta per decorazioni hero
- Colore ombra `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) per ombre sul bordo superiore degli elementi sticky

## 7. Da Fare e Da Evitare

### Da Fare
- Usa sohne-var con `"ss01"` su ogni elemento di testo — il set stilistico È il brand
- Usa il peso 300 per tutti i titoli e il testo corpo — la leggerezza è la firma
- Applica ombre con tonalità blu (`rgba(50,50,93,0.25)`) per tutti gli elementi elevati
- Usa `#061b31` (blu navy profondo) per le intestazioni invece di `#000000` — il calore conta
- Mantieni il border-radius tra 4px e 8px — l'arrotondamento conservativo è intenzionale
- Usa `"tnum"` per qualsiasi visualizzazione di numeri tabulari/finanziari
- Stratifica le ombre: blu con tonalità lontano + neutro vicino per la profondità parallasse
- Usa il viola `#533afd` come colore interattivo/CTA primario

### Da Evitare
- Non usare il peso 600–700 per i titoli sohne-var — il peso 300 è la voce del brand
- Non usare border-radius grandi (12px+, forme a pillola) su card o pulsanti — Stripe è conservativo
- Non usare ombre grigio neutro — usa sempre la tonalità blu (`rgba(50,50,93,...)`)
- Non saltare `"ss01"` su nessun testo sohne-var — i glifi alternativi definiscono la personalità
- Non usare il nero puro (`#000000`) per le intestazioni — usa sempre `#061b31` blu navy profondo
- Non usare colori accento caldi (arancione, giallo) per gli elementi interattivi — il viola è primario
- Non applicare spaziatura positiva tra le lettere alle dimensioni display — Stripe usa il tracking stretto
- Non usare gli accenti magenta/rubino per pulsanti o link — sono solo decorativi/per gradienti

## 8. Comportamento Responsivo

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-------|-------------|
| Mobile | <640px | Colonna singola, dimensioni titoli ridotte, card impilate |
| Tablet | 640-1024px | Griglie a 2 colonne, padding moderato |
| Desktop | 1024-1280px | Layout completo, griglie funzionalità a 3 colonne |
| Desktop Grande | >1280px | Contenuto centrato con margini generosi |

### Target di Tocco
- I pulsanti usano padding comodo (8px–16px verticale)
- Link di navigazione a 14px con spaziatura adeguata
- I badge hanno un padding orizzontale minimo di 6px per le aree di tocco
- Toggle nav mobile con pulsante a radius 6px

### Strategia di Collasso
- Hero: display da 56px -> 32px su mobile, peso 300 mantenuto
- Navigazione: link orizzontali + CTA -> toggle hamburger
- Card funzionalità: 3 colonne -> 2 colonne -> colonna singola impilata
- Sezioni brand scure: mantengono il trattamento a larghezza piena, riducono il padding interno
- Tabelle dati finanziari: scorrimento orizzontale su mobile
- Spaziatura delle sezioni: 64px+ -> 40px su mobile
- La scala tipografica si comprime: da 56px -> 48px -> 32px nelle dimensioni hero tra i breakpoint

### Comportamento delle Immagini
- Screenshot dashboard/prodotto mantengono l'ombra con tonalità blu a tutte le dimensioni
- Le decorazioni gradiente hero si semplificano su mobile
- I blocchi di codice mantengono il trattamento `SourceCodePro`, possono scorrere orizzontalmente
- Le immagini delle card mantengono un border-radius costante di 4px–6px

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido Colori
- CTA primario: Viola Stripe (`#533afd`)
- Hover CTA: Viola Scuro (`#4434d4`)
- Sfondo: Bianco Puro (`#ffffff`)
- Testo intestazione: Blu Navy Profondo (`#061b31`)
- Testo corpo: Ardesia (`#64748d`)
- Testo etichetta: Ardesia Scuro (`#273951`)
- Bordo: Blu Tenue (`#e5edf5`)
- Link: Viola Stripe (`#533afd`)
- Sezione scura: Brand Scuro (`#1c1e54`)
- Successo: Verde (`#15be53`)
- Accento decorativo: Rubino (`#ea2261`), Magenta (`#f96bee`)

### Esempi di Prompt per Componenti
- "Crea una sezione hero su sfondo bianco. Titolo a 48px sohne-var peso 300, line-height 1.15, letter-spacing -0.96px, colore #061b31, font-feature-settings 'ss01'. Sottotitolo a 18px peso 300, line-height 1.40, colore #64748d. Pulsante CTA viola (#533afd, radius 4px, padding 8px 16px, testo bianco) e pulsante ghost (trasparente, 1px solid #b9b9f9, testo #533afd, radius 4px)."
- "Progetta una card: sfondo bianco, bordo 1px solid #e5edf5, radius 6px. Ombra: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Titolo a 22px sohne-var peso 300, letter-spacing -0.22px, colore #061b31, 'ss01'. Corpo a 16px peso 300, #64748d."
- "Costruisci un badge successo: sfondo rgba(21,190,83,0.2), testo #108c3d, radius 4px, padding 1px 6px, 10px sohne-var peso 300, bordo 1px solid rgba(21,190,83,0.4)."
- "Crea la navigazione: header bianco sticky con backdrop-filter blur(12px). sohne-var 14px peso 400 per i link, testo #061b31, 'ss01'. CTA viola 'Inizia ora' allineato a destra (sfondo #533afd, testo bianco, radius 4px). Contenitore nav radius 6px."
- "Progetta una sezione brand scura: sfondo #1c1e54, testo bianco. Titolo 32px sohne-var peso 300, letter-spacing -0.64px, 'ss01'. Corpo 16px peso 300, rgba(255,255,255,0.7). Le card interne usano bordo rgba(255,255,255,0.1) con radius 6px."

### Guida all'Iterazione
1. Abilita sempre `font-feature-settings: "ss01"` sul testo sohne-var — questo è il DNA tipografico del brand
2. Il peso 300 è il predefinito; usa 400 solo per pulsanti/link/navigazione
3. Formula ombra: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` dove Y1/B1 sono più grandi (ombra lontana) e Y2/B2 sono più piccoli (ombra vicina)
4. Il colore dell'intestazione è `#061b31` (blu navy profondo), il corpo è `#64748d` (ardesia), le etichette sono `#273951` (ardesia scuro)
5. Il border-radius rimane nell'intervallo 4px–8px — non usare mai forme a pillola o arrotondamenti grandi
6. Usa `"tnum"` per qualsiasi numero in tabelle, grafici o visualizzazioni finanziarie
7. Le sezioni scure usano `#1c1e54` — non nero, non grigio, ma un indaco profondo del brand
8. SourceCodePro per il codice a 12px/500 con line-height 2.00 (molto generoso per la leggibilità)
