# Design System Inspired by Nike

> Category: E-Commerce & Retail
> Retail sportivo. UI monocromatica, tipografia maiuscola imponente, fotografie a tutta pagina.

## 1. Tema Visivo e Atmosfera

Nike.com è una cattedrale cinetica del retail — un sito che trasferisce l'energia esplosiva dello sport in un'esperienza di acquisto digitale. Il design opera su un principio di semplicità radicale: eliminare tutto fino al nero, bianco e grigio in modo che la fotografia atletica e il colore del prodotto possano dominare senza concorrenza. Il risultato assomiglia meno a un sito web e più a un editoriale sportivo impaginato con la precisione di una rivista di lusso. Ogni pixel di spazio serve o a vendere un prodotto o a condurre verso il prodotto.

Il "Podium CDS" (il Core Design System interno di Nike) stabilisce una fondazione aggressivamente monocromatica. L'interfaccia sparisce in testo nero (`#111111`) e superfici bianche, lasciando che la fotografia hero — atleti sudati, scarpe in volo, energia degli stadi — porti il peso emotivo. Quando il colore compare nell'interfaccia, è quasi esclusivamente funzionale: rosso per gli errori, blu per i link, verde per i successi. Il prodotto è la storia del colore. Questa sobrietà crea un paradosso visivo: le pagine più colorate di internet sembrano le più minimali, perché tutta la vivacità proviene dalla merce e non dall'interfaccia.

Il sistema tipografico è l'altra metà dell'identità visiva di Nike. Titoli enormi in maiuscolo con Nike Futura ND — una variante condensata e personalizzata di Futura con un'interlinea (0.90) impossibilmente stretta — sfondano le immagini hero come un'onda d'urto tipografica. Sotto i titoli, la famiglia Helvetica Now si occupa di tutto, dalla navigazione alle descrizioni dei prodotti, con la chiarezza precisa della tradizione svizzera. Questa divisione tra carattere display espressivo e corpo funzionale rispecchia la dualità del brand Nike: ispirazione incontra esecuzione.

**Key Characteristics:**
- UI monocromatica (nero/bianco/grigio) che lascia alla fotografia del prodotto l'esclusività del colore
- Tipografia display maiuscola di grandi dimensioni (96px, interlinea 0.90) che sfonda le immagini hero
- Fotografie a tutta pagina senza border radius — le immagini riempiono ogni bordo disponibile
- Pulsanti a pillola (30px radius) come elemento interattivo principale
- Griglia spaziatura a 8px con disciplina atletica — ogni misura si aggancia al sistema
- Architettura di shopping guidata per categoria con grandi card di navigazione fotografica
- Modello di elevazione senza ombre e con bordi minimi — la differenziazione delle superfici avviene solo attraverso variazioni di grigio

## 2. Palette Colori e Ruoli

### Primari

- **Nike Black** (`#111111`): Il fondamento — testo principale, sfondi dei pulsanti, testo nav, overlay hero. Deliberatamente non nero puro (#000000), crea un'esperienza di lettura leggermente più morbida
- **Nike White** (`#FFFFFF`): Canvas principale della pagina, testo dei pulsanti su sfondo scuro, superfici delle card, sfondo della barra di navigazione

### Superfici e Sfondi

- **Snow** (`#FAFAFA`): Superficie più chiara, differenziazione sottile quasi-bianca (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Sfondo secondario, riempimento input di ricerca, segnaposto immagine, scheletro di caricamento (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Sfondo stato hover, riempimento pulsante disabilitato (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Sfondo principale nelle sezioni scure/invertite (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Sfondo primario inverso, superficie più scura non-nera (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Stato hover su sfondi scuri (--podium-cds-color-grey-700)

### Neutrali e Testo

- **Primary Text** (`#111111`): Testo del corpo principale, titoli, link di navigazione (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Testi descrittivi, metadati, timestamp, etichette prezzi (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Elementi inattivi, opzioni non disponibili (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Testo disabilitato su sfondi scuri (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Colore bordo standard, corrispondente al testo secondario
- **Border Secondary** (`#CACACB`): Bordi sottili, bordi input, linee divisorie (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Stato bordo inattivo
- **Border Active** (`#111111`): Bordo attivo/in focus, corrispondente al testo primario

### Semantici e Accentuati

- **Nike Red** (`#D30005`): Errori critici, badge saldi, notifiche urgenti (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, rosso leggermente più chiaro per enfasi
- **Nike Orange Badge** (`#D33918`): Testo badge, callout promozionali (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Accento arancione espressivo (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Conferma, disponibilità, stati positivi (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Successo su sfondi scuri (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Link testuali, evidenziazioni informative (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Link su sfondi scuri (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Sfondi di avviso, banner attenzione (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Anello indicatore focus da tastiera

### Spettro Cromatico Esteso (Podium CDS)

Ogni rampa di colore va da 50 a 900 per uso espressivo nelle campagne e nelle pagine prodotto:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Sistema dei Gradienti

Nike evita i gradienti nell'interfaccia. Quando compaiono dei gradienti, sono fotografici — applicati agli sfondi hero dei prodotti (es. una scarpa rossa su un gradiente rosso-rosso più scuro). Il design system in sé utilizza solo colori piatti.

## 3. Regole Tipografiche

### Font Family

**Display:** Nike Futura ND (variante condensata personalizzata di Futura esclusiva di Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Usato esclusivamente per i grandi titoli display in maiuscolo
- Caratteristicamente stretta interlinea (0.90) e trasformazione in maiuscolo

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Usato per i titoli di sezione e i titoli dei prodotti tra 24 e 32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Usato per link, pulsanti, didascalie, testo del corpo enfatizzato

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Usato per il testo del corpo standard, descrizioni, metadati

**Arabic:** Neue Frutiger Arabic — alternativa specifica per la locale

### Gerarchia

| Ruolo | Dimensione | Peso | Interlinea | Spaziatura Lettere | Note |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, maiuscolo, titoli hero |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, titoli di sezione |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, sottosezioni |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, titoli card |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, descrizioni prodotto |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, testo enfatizzato |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, link di navigazione |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, link footer/utilità |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, testo CTA |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, pulsanti secondari |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, etichette prezzi |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, timestamp |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, testo legale |

### Principi

La tipografia di Nike è uno studio nella tensione. Il livello display — Nike Futura ND a 96px con un'interlinea devastante di 0.90 — è progettato per sembrare il tabellone di uno stadio: massiccio, condensato, maiuscolo, impossibile da ignorare. Trasforma i titoli in grida di battaglia. Al di sotto del livello display, Helvetica Now offre un contrappunto clinico: leggibilità con precisione svizzera e interlinea generosa di 1.75 per una navigazione confortevole tra i prodotti. Il weight 500 (Medium) domina in tutto il testo del corpo, conferendo alla prosa di Nike una leggera assertività senza la pesantezza del grassetto — ogni frase si legge come una raccomandazione sicura, non come un urlo.

## 4. Stili dei Componenti

### Pulsanti

**Primario**
- Background: Nike Black (`#111111`)
- Testo: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: nessuno
- Border radius: pillola completamente arrotondata (30px)
- Padding: ~12px 24px
- Hover: il background passa a Grey-500 (`#707072`), colore testo hover
- Active: effetto ripple scale(0) con opacity 0.5
- Focus: 2px box-shadow ring in `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Primario su Sfondo Scuro**
- Background: White (`#FFFFFF`)
- Testo: Black (`#111111`)
- Hover: il background passa a Grey-300 (`#CACACB`)

**Secondario (Delineato)**
- Background: transparent
- Testo: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: il bordo si scurisce a `#707072`, background a grey-200

**Disabilitato**
- Background: Grey-200 (`#E5E5E5`)
- Testo: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Pulsante Icona**
- Background: Grey-100 (`#F5F5F5`)
- Forma: 30px radius (o 50% per circolare)
- Padding: 6px
- Hover: background Grey-500

### Card e Contenitori

- Background: White (`#FFFFFF`) — nessun bordo visibile della card nella maggior parte dei casi
- Border radius: 0px per le card con immagine prodotto (immagini a tutto campo), 20px per i contenitori interattivi
- Shadow: nessuna — Nike non usa assolutamente nessuna ombra nelle card
- Hover: nessun effetto di sollevamento sulle card prodotto; sottolineatura sui link testuali all'interno delle card
- Card prodotto: immagine in alto (senza radius), metadati testuali in basso con gap di 12px
- Card categoria: fotografia a tutto campo con sovrapposizione testo su gradiente scuro
- Transition: opacity 200ms ease per il cambio immagine in hover

### Input e Form

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` quando visibile, o senza bordo nella ricerca
- Border radius: 24px (input di ricerca), 8px (input nei form)
- Font: Helvetica Now Text, 16px
- Focus: il bordo passa a `#111111` (border-active), 2px focus ring in `rgba(39, 93, 197, 1)`
- Errore: border `#D30005` (critical)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Navigazione

- Background: White (`#FFFFFF`), sticky
- Altezza: ~60px desktop
- Sinistra: logo Nike Swoosh (24x24px SVG)
- Centro: link di categoria (New & Featured, Men, Women, Kids, Sale) in 16px/500 Helvetica Now Text Medium
- Destra: Ricerca (input 24px radius), Preferiti, icone Carrello
- Hover: il colore del testo passa a Grey-500 (`#707072`)
- Mobile: menu hamburger, overlay a schermo intero
- Banner superiore: barra messaggi promozionali con sfondo scuro (#111111) e testo bianco

### Trattamento delle Immagini

- Immagini hero: a tutto campo, senza border radius, da bordo a bordo
- Griglia prodotti: rapporto 1:1 o 4:3, senza border radius
- Card categoria: 16:9 o 4:3, a tutto campo con sovrapposizione testo
- Segnaposto immagine: sfondo solido Grey-100 (`#F5F5F5`)
- Caricamento lazy: native loading="lazy", scheletro usa bg #F5F5F5
- Hover prodotto: cambio immagine secondaria (vista frontale → laterale)

### Banner Promozionali

- Sfondo scuro a larghezza completa (`#111111`) con testo bianco
- Padding stretto (8-12px verticale)
- Testo centrato, 12px/500 Helvetica Now Text Medium
- Usato per promozioni di spedizione, vantaggi per i membri, annunci di saldi

## 5. Principi di Layout

### Sistema di Spaziatura

Unità base: 4px (la griglia primaria è a multipli di 8px)

| Token | Valore | Utilizzo |
|-------|-------|-----|
| space-1 | 4px | Spazi stretti tra icone, spaziatura inline |
| space-2 | 8px | Unità base, spazi icone pulsanti |
| space-3 | 12px | Padding interno card, margini stretti |
| space-4 | 16px | Padding standard, spaziatura nav |
| space-5 | 20px | Gap tra card prodotto |
| space-6 | 24px | Padding interno sezione, gap griglia |
| space-7 | 32px | Interruzioni di sezione |
| space-8 | 48px | Padding sezione principale |
| space-9 | 64px | Padding sezione hero |
| space-10 | 80px | Spaziatura sezioni grandi |

### Griglia e Contenitore

- Larghezza massima contenitore: 1920px
- Larghezza contenuto standard: ~1440px con padding orizzontale
- Griglia prodotti: 3 colonne su desktop, 2 su tablet, 1 su mobile
- Griglia categoria: 3 colonne con immagini a tutto campo
- Gap griglia: 4-12px tra le card prodotto (intenzionalmente stretto)
- Padding orizzontale: 48px desktop, 24px tablet, 16px mobile

### Filosofia dello Spazio Bianco

La strategia degli spazi bianchi di Nike è deliberatamente aggressiva — non nel modo lussuoso e respirante di un brand di moda, ma in un modo compresso ad alta densità che riempie ogni pixel con contenuto o con assenza intenzionale. Le griglie prodotto usano gap minimi (4-12px) per creare una sensazione di abbondanza e scelta. Le interruzioni di sezione sono generose (48-80px) per separare i contesti di acquisto. L'effetto complessivo è quello di un negozio che sembra pieno di prodotti rimanendo comunque navigabile — come un grande negozio sportivo ben organizzato.

### Scala Border Radius

| Valore | Contesto |
|-------|---------|
| 0px | Immagini prodotto, fotografia hero (bordi netti) |
| 8px | Input nei form (non ricerca) |
| 18px | Elementi interattivi piccoli |
| 20px | Contenitori, card con contenuto UI |
| 24px | Input di ricerca, pillole medie |
| 30px | Pulsanti, tag, filtri (pillola completa) |
| 50% | Pulsanti icona circolari, segnaposto avatar |

## 6. Profondità ed Elevazione

| Livello | Trattamento | Utilizzo |
|-------|-----------|-----|
| Flat | Nessuna ombra, nessun bordo | Stato predefinito per tutto |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Linea inset sottile tra le sezioni |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Anello focus da tastiera |
| Overlay | Scrim scuro sopra la fotografia | Leggibilità testo su immagine |

La filosofia di elevazione di Nike è radicalmente piatta. Non ci sono ombre nelle card, nessun sollevamento in hover, nessun elemento flottante. La profondità è comunicata esclusivamente attraverso il colore — le sezioni scure retrocedono, quelle chiare avanzano, le variazioni di grigio indicano i cambi di stato. Questa piattezza rinforza la personalità del brand atletica e diretta: nessun fronzolo visivo, solo comunicazione diretta. L'unica "ombra" nell'intero sistema è una linea divisoria inset di 1px e l'anello di focus richiesto per l'accessibilità.

### Profondità Decorativa

- **Overlay fotografici hero**: Scrims a gradiente scuro sopra le fotografie a tutto campo per la leggibilità del testo
- **Gradienti sfondo prodotto**: Sfondi colorati dietro le foto hero dei prodotti (es. scarpa rossa su gradiente rosso)
- **Barre banner**: Strisce promozionali solide scure (#111111) in cima alla pagina

## 7. Cosa Fare e Cosa Evitare

### Cosa Fare

- Usare Nike Black (#111111) per tutto il testo principale — mai il puro #000000
- Mantenere i pulsanti a forma di pillola (30px radius) e limitati alle varianti primaria/secondaria
- Usare fotografie a tutto campo, da bordo a bordo, per le sezioni hero — nessun border radius sulle immagini
- Lasciare che la fotografia del prodotto fornisca tutta la vivacità cromatica; mantenere l'interfaccia monocromatica
- Usare Nike Futura ND in maiuscolo SOLO per i titoli display (96px+)
- Mantenere gap stretti nella griglia prodotti (4-12px) per una sensazione densa e abbondante
- Usare Grey-100 (#F5F5F5) per tutti gli sfondi di input e segnaposto
- Riservare il colore esclusivamente al significato semantico (rosso=errore, verde=successo, blu=link)
- Usare weight 500 (Medium) per tutti gli elementi testuali interattivi

### Cosa Evitare

- Non aggiungere ombre alle card — il modello di elevazione di Nike è completamente piatto
- Non usare border radius sulle immagini prodotto — solo gli elementi UI hanno angoli arrotondati
- Non introdurre colori del brand al di là della scala di grigi per gli elementi dell'interfaccia
- Non usare Nike Futura ND sotto i 24px — è esclusivamente un carattere display
- Non aggiungere effetti di sollevamento in hover — le card Nike non si animano in hover
- Non usare il weight normale (400) per pulsanti o link — usare sempre 500
- Non posizionare sfondi colorati dietro gli elementi dell'interfaccia — il colore è riservato ai contesti prodotto
- Non usare più di due livelli di gerarchia testuale per card (titolo + corpo)
- Non aggiungere divisori decorativi — l'inset di 1px è l'unico pattern divisorio
- Non ammorbidire il contrasto — il design di Nike spinge deliberatamente il nero su bianco al massimo

## 8. Comportamento Responsive

### Breakpoint

| Nome | Larghezza | Cambiamenti Principali |
|------|-------|-------------|
| Mobile | <640px | Colonna singola, nav hamburger, il testo display si ridimensiona, padding stretto 16px |
| Small Tablet | 640-768px | Inizia la griglia prodotti a 2 colonne, nav ancora collassata |
| Tablet | 768-960px | Griglie a 2 colonne, le card categoria si scalano, padding orizzontale 24px |
| Small Desktop | 960-1024px | La nav si espande a orizzontale completo, griglia prodotti a 3 colonne |
| Desktop | 1024-1440px | Layout completo, nav espansa, griglie a 3 colonne, padding 48px |
| Large Desktop | >1440px | Contenitore a larghezza massima centrato, margini aumentati, immagini hero a tutto campo |

### Target di Tocco

- Target di tocco minimo: 44x44px (WCAG AAA)
- Icone nav mobile: area di tocco 48x48px
- Card prodotto: l'intera superficie è tappabile
- Pillole filtro: altezza minima 36px con padding 12px

### Strategia di Collasso

- **Navigazione**: Link categoria completi → menu hamburger sotto 960px; icone ricerca, preferiti, carrello rimangono visibili
- **Griglie prodotti**: 3 col → 2 col a 960px → 1 col a 640px
- **Sezioni hero**: Il testo display si scala da 96px → 64px → 48px; le immagini hero rimangono a tutto campo a tutte le dimensioni
- **Card categoria**: 3 col → 2 col → 1 col con fotografia a tutto campo mantenuta
- **Padding sezione**: 80px → 48px → 32px → 24px man mano che il viewport si restringe
- **Banner promozionale**: il testo va a capo o viene troncato, mantiene lo sfondo scuro

### Comportamento delle Immagini

- Immagini responsive via Nike CDN (`c.static-nike.com`) con parametri di larghezza
- Immagini prodotto: srcset con risoluzioni multiple (w_320, w_640, w_960, w_1920)
- Immagini hero: a tutto campo a tutti i breakpoint, il rapporto d'aspetto cambia (16:9 desktop → 4:3 mobile)
- Caricamento lazy: native loading="lazy", segnaposto grey-100 durante il caricamento
- Art direction: i ritagli degli hero cambiano tra le composizioni desktop e mobile

## 9. Guida ai Prompt per l'Agente

### Riferimento Rapido Colori

- CTA principale: Nike Black (`#111111`)
- Sfondo: White (`#FFFFFF`)
- Superficie secondaria: Light Gray (`#F5F5F5`)
- Testo titoli: Nike Black (`#111111`)
- Testo corpo / hover: Secondary Text (`#707072`)
- Bordo: Border Secondary (`#CACACB`)
- Errore: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Esempi di Prompt per Componenti

- "Crea una sezione hero prodotto con fotografia a tutto campo da bordo a bordo, senza border radius, un overlay a gradiente scuro per il testo, e un titolo enorme in maiuscolo da 96px/500 in stile Nike Futura con interlinea 0.90 e un pulsante a pillola Nike Black (#111111) (30px radius)"
- "Progetta una griglia prodotti a 3 colonne con immagini quadrate (senza border radius), gap di 4px tra le card, nome prodotto in 16px/500 Nike Black (#111111), prezzo in 14px/500, e testo secondario in Grey-500 (#707072)"
- "Costruisci una barra di navigazione bianca sticky con logo allineato a sinistra, link di categoria centrati in 16px/500 (#111111) con colore hover #707072, e ricerca allineata a destra (24px radius, sfondo #F5F5F5), preferiti e icone carrello"
- "Crea una striscia banner promozionale con sfondo #111111, testo bianco centrato 12px/500, e padding verticale 8px — larghezza completa, senza border radius"
- "Progetta un pulsante secondario delineato con sfondo transparent, bordo #CACACB 1.5px, pill radius 30px, testo #111111 16px/500, bordo che si scurisce a #707072 in hover"

### Guida all'Iterazione

Quando si perfezionano schermate esistenti generate con questo design system:
1. Concentrarsi su UN componente alla volta
2. Fare riferimento a nomi di colore specifici e codici hex da questo documento
3. Ricordare: la fotografia del prodotto è il colore — l'interfaccia rimane monocromatica
4. Usare la scala di grigi per i cambi di stato: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Se qualcosa nell'interfaccia sembra troppo colorato, probabilmente lo è — Nike mantiene l'interfaccia in scala di grigi
6. Il carattere display (Nike Futura) deve essere SEMPRE in maiuscolo e mai sotto i 24px
7. Il carattere corpo (Helvetica Now) dovrebbe quasi sempre avere weight 500 per gli elementi interattivi
