# Sistema di Design Ispirato a Notion

> Category: Produttività e SaaS
> Spazio di lavoro tutto-in-uno. Minimalismo caldo, intestazioni con grazie, superfici morbide.

## 1. Tema Visivo e Atmosfera

Il sito di Notion incarna la filosofia dello strumento stesso: una tela bianca che non ostacola il tuo lavoro. Il sistema di design è costruito su neutri caldi anziché grigi freddi, creando un minimalismo distintivamente accessibile che evoca la sensazione di carta di qualità piuttosto che vetro sterile. La tela della pagina è bianco puro (`#ffffff`), ma il testo non è nero puro — è un nero caldo quasi assoluto (`rgba(0,0,0,0.95)`) che ammorbidisce impercettibilmente l'esperienza di lettura. La scala di grigi caldi (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) porta sottili sfumature giallo-marroni, conferendo all'interfaccia un calore tattile, quasi analogico.

Il font personalizzato NotionInter (una Inter modificata) è la colonna portante del sistema. Alle dimensioni di visualizzazione (64px), utilizza una spaziatura tra lettere negativa aggressiva (-2.125px), creando titoli che sembrano compressi e precisi. L'intervallo di pesi è più ampio dei sistemi tipici: 400 per il corpo, 500 per gli elementi dell'interfaccia, 600 per le etichette semi-grassetto e 700 per i titoli di visualizzazione. Le funzioni OpenType `"lnum"` (cifre allineate) e `"locl"` (forme localizzate) sono abilitate sui testi più grandi, aggiungendo sofisticazione tipografica che ricompensa la lettura attenta.

Ciò che rende distintivo il linguaggio visivo di Notion è la sua filosofia dei bordi. Invece di bordi pesanti o ombre, Notion usa bordi ultra-sottili `1px solid rgba(0,0,0,0.1)` — bordi che esistono come sussurri, linee di divisione appena percettibili che creano struttura senza peso. Il sistema di ombre è ugualmente sobrio: pile a più livelli con opacità cumulativa che non supera mai 0.05, creando profondità che si percepisce più che si vede.

**Key Characteristics:**
- NotionInter (Inter modificata) con spaziatura negativa tra le lettere alle dimensioni di visualizzazione (-2.125px a 64px)
- Palette di neutri caldi: i grigi hanno sfumature giallo-marroni (`#f6f5f4` bianco caldo, `#31302e` scuro caldo)
- Testo quasi nero tramite `rgba(0,0,0,0.95)` — non nero puro, crea micro-calore
- Bordi ultra-sottili: `1px solid rgba(0,0,0,0.1)` in tutto il sistema — divisione dal peso di un sussurro
- Pile di ombre a più livelli con opacità sotto 0.05 per una profondità quasi impercettibile
- Blu Notion (`#0075de`) come unico colore d'accento per CTA ed elementi interattivi
- Badge a pillola (raggio 9999px) con sfondi blu sfumati per indicatori di stato
- Unità di spaziatura base di 8px con scala organica non rigida

## 2. Palette di Colori e Ruoli

### Primario
- **Nero Notion** (`rgba(0,0,0,0.95)` / `#000000f2`): Testo principale, intestazioni, testo del corpo. L'opacità al 95% ammorbidisce il nero puro senza sacrificare la leggibilità.
- **Bianco puro** (`#ffffff`): Sfondo della pagina, superfici delle card, testo del pulsante su sfondo blu.
- **Blu Notion** (`#0075de`): CTA principale, colore dei link, accento interattivo — l'unico colore saturo nell'interfaccia principale.

### Secondario del Brand
- **Blu marino scuro** (`#213183`): Colore secondario del brand, usato con parsimonia per enfasi e sezioni scure di funzionalità.
- **Blu attivo** (`#005bab`): Stato attivo/premuto del pulsante — variante più scura del Blu Notion.

### Scala dei Neutri Caldi
- **Bianco caldo** (`#f6f5f4`): Tinta di superficie di sfondo, alternanza di sezioni, riempimento sottile delle card. La sfumatura gialla è fondamentale.
- **Scuro caldo** (`#31302e`): Sfondo di superficie scura, testo in sezioni scure. Più caldo dei grigi standard.
- **Grigio caldo 500** (`#615d59`): Testo secondario, descrizioni, etichette attenuate.
- **Grigio caldo 300** (`#a39e98`): Testo segnaposto, stati disabilitati, testo delle didascalie.

### Colori d'Accento Semantici
- **Verde acqua** (`#2a9d99`): Stati di successo, indicatori positivi.
- **Verde** (`#1aae39`): Conferma, badge di completamento.
- **Arancione** (`#dd5b00`): Stati di avviso, indicatori di attenzione.
- **Rosa** (`#ff64c8`): Accento decorativo, evidenziazioni di funzionalità.
- **Viola** (`#391c57`): Funzionalità premium, accenti profondi.
- **Marrone** (`#523410`): Accento terroso, sezioni di funzionalità calde.

### Interattivi
- **Blu link** (`#0075de`): Colore principale del link con sottolineatura al passaggio del cursore.
- **Blu link chiaro** (`#62aef0`): Variante di link più chiaro per sfondi scuri.
- **Blu focus** (`#097fe8`): Anello di focus sugli elementi interattivi.
- **Sfondo badge blu** (`#f2f9ff`): Sfondo del badge a pillola, superficie blu sfumata.
- **Testo badge blu** (`#097fe8`): Testo del badge a pillola, blu più scuro per la leggibilità.

### Ombre e Profondità
- **Ombra card** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Elevazione card a più livelli.
- **Ombra profonda** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Elevazione profonda a cinque livelli per modali e contenuti in evidenza.
- **Bordo sussurro** (`1px solid rgba(0,0,0,0.1)`): Bordo di divisione standard — card, divisori, sezioni.

## 3. Regole Tipografiche

### Famiglia di Font
- **Principale**: `NotionInter`, con fallback: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Funzioni OpenType**: `"lnum"` (cifre allineate) e `"locl"` (forme localizzate) abilitate su testi di visualizzazione e intestazioni.

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Visualizzazione Principale | NotionInter | 64px (4.00rem) | 700 | 1.00 (compatto) | -2.125px | Compressione massima, titoli da cartellone |
| Visualizzazione Secondaria | NotionInter | 54px (3.38rem) | 700 | 1.04 (compatto) | -1.875px | Hero secondario, titoli di funzionalità |
| Intestazione di Sezione | NotionInter | 48px (3.00rem) | 700 | 1.00 (compatto) | -1.5px | Titoli di sezioni di funzionalità, con `"lnum"` |
| Sottotitolo Grande | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Intestazioni delle card, sottosezioni di funzionalità |
| Sottotitolo | NotionInter | 26px (1.63rem) | 700 | 1.23 (compatto) | -0.625px | Sottotitoli di sezione, intestazioni di contenuto |
| Titolo Card | NotionInter | 22px (1.38rem) | 700 | 1.27 (compatto) | -0.25px | Card di funzionalità, titoli di elenco |
| Corpo Grande | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Introduzioni, descrizioni di funzionalità |
| Corpo | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Testo di lettura standard |
| Corpo Medio | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navigazione, testo dell'interfaccia enfatizzato |
| Corpo Semi-Grassetto | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Etichette in evidenza, stati attivi |
| Corpo Grassetto | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Titoli alla dimensione del corpo |
| Nav / Pulsante | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Link di navigazione, testo del pulsante |
| Didascalia | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadati, etichette secondarie |
| Didascalia Leggera | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Didascalie del corpo, descrizioni |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Badge a pillola, tag, etichette di stato |
| Micro Etichetta | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Metadati piccoli, timestamp |

### Principi
- **Compressione in scala**: NotionInter alle dimensioni di visualizzazione usa -2.125px di spaziatura tra lettere a 64px, rilassandosi progressivamente a -0.625px a 26px e normale a 16px. La compressione crea densità nei titoli mantenendo la leggibilità alle dimensioni del corpo.
- **Sistema a quattro pesi**: 400 (corpo/lettura), 500 (interfaccia/interattivo), 600 (enfasi/navigazione), 700 (intestazioni/visualizzazione). L'intervallo di pesi più ampio rispetto alla maggior parte dei sistemi consente una gerarchia sfumata.
- **Scala calda**: L'altezza della riga si restringe all'aumentare delle dimensioni — 1.50 nel corpo (16px), 1.23-1.27 nei sottotitoli, 1.00-1.04 nella visualizzazione. Questo crea titoli più densi e d'impatto.
- **Micro-tracking del badge**: Il testo del badge a 12px usa spaziatura positiva tra le lettere (0.125px) — l'unico tracking positivo nel sistema, creando testo piccolo più ampio e leggibile.

## 4. Stili dei Componenti

### Pulsanti

**Blu Primario**
- Sfondo: `#0075de` (Blu Notion)
- Testo: `#ffffff`
- Padding: 8px 16px
- Raggio: 4px (sottile)
- Bordo: `1px solid transparent`
- Hover: lo sfondo si scurisce a `#005bab`
- Attivo: trasformazione scale(0.9)
- Focus: contorno `2px solid`, ombra `var(--shadow-level-200)`
- Utilizzo: CTA principale ("Prova Notion gratis", "Inizia")

**Secondario / Terziario**
- Sfondo: `rgba(0,0,0,0.05)` (grigio caldo traslucido)
- Testo: `#000000` (quasi nero)
- Padding: 8px 16px
- Raggio: 4px
- Hover: il colore del testo cambia, scale(1.05)
- Attivo: trasformazione scale(0.9)
- Utilizzo: Azioni secondarie, invii di moduli

**Fantasma / Pulsante Link**
- Sfondo: trasparente
- Testo: `rgba(0,0,0,0.95)`
- Decorazione: sottolineatura al passaggio del cursore
- Utilizzo: Azioni terziarie, link in linea

**Pulsante Badge a Pillola**
- Sfondo: `#f2f9ff` (blu sfumato)
- Testo: `#097fe8`
- Padding: 4px 8px
- Raggio: 9999px (pillola completa)
- Font: 12px peso 600
- Utilizzo: Badge di stato, etichette di funzionalità, tag "Nuovo"

### Card e Contenitori
- Sfondo: `#ffffff`
- Bordo: `1px solid rgba(0,0,0,0.1)` (bordo sussurro)
- Raggio: 12px (card standard), 16px (card in evidenza/hero)
- Ombra: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: intensificazione sottile dell'ombra
- Card con immagine: raggio superiore di 12px, l'immagine riempie la metà superiore

### Input e Moduli
- Sfondo: `#ffffff`
- Testo: `rgba(0,0,0,0.9)`
- Bordo: `1px solid #dddddd`
- Padding: 6px
- Raggio: 4px
- Focus: anello di contorno blu
- Segnaposto: grigio caldo `#a39e98`

### Navigazione
- Nav orizzontale pulita su sfondo bianco, non fissa
- Logo del brand allineato a sinistra (icona 33x34px + wordmark)
- Link: NotionInter 15px peso 500-600, testo quasi nero
- Hover: cambio di colore verso `var(--color-link-primary-text-hover)`
- CTA: pulsante a pillola blu ("Prova Notion gratis") allineato a destra
- Mobile: menu a scomparsa con icona hamburger
- Menu a discesa del prodotto con menu categorizzati a più livelli

### Trattamento delle Immagini
- Screenshot del prodotto con bordo `1px solid rgba(0,0,0,0.1)`
- Immagini con angoli superiori arrotondati: raggio `12px 12px 0px 0px`
- Gli screenshot del pannello/spazio di lavoro dominano le sezioni di funzionalità
- Sfondi con gradienti caldi dietro le illustrazioni hero (illustrazioni di personaggi decorativi)

### Componenti Distintivi

**Card di Funzionalità con Illustrazioni**
- Intestazioni illustrative grandi (La Grande Onda, screenshot dell'interfaccia del prodotto)
- Card con raggio 12px e bordo sussurro
- Titolo a 22px peso 700, descrizione a 16px peso 400
- Variante con sfondo bianco caldo (`#f6f5f4`) per le sezioni alternate

**Barra di Fiducia / Griglia di Loghi**
- Loghi aziendali (sezione dei team fidati) nei loro colori del brand
- Layout a scorrimento orizzontale o griglia con conteggi dei team
- Visualizzazione delle metriche: numero grande + schema di descrizione

**Card delle Metriche**
- Visualizzazione di numeri grandi (es. "$4.200 di ROI")
- NotionInter 40px+ peso 700 per la metrica
- Descrizione sotto in testo del corpo grigio caldo
- Contenitore card con bordo sussurro

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Scala organica non rigida con valori frazionari (5.6px, 6.4px) per micro-aggiustamenti

### Griglia e Contenitore
- Larghezza massima del contenuto: circa 1200px
- Hero: colonna singola centrata con padding superiore generoso (80-120px)
- Sezioni di funzionalità: griglie a 2-3 colonne per le card
- Sfondi di sezione a larghezza piena in bianco caldo (`#f6f5f4`) per l'alternanza
- Screenshot di codice/pannello contenuti con bordo sussurro

### Filosofia dello Spazio Bianco
- **Ritmo verticale generoso**: 64-120px tra le sezioni principali. Notion lascia respirare il contenuto con ampio padding verticale.
- **Alternanza calda**: Le sezioni bianche si alternano con sezioni in bianco caldo (`#f6f5f4`), creando un ritmo visivo morbido senza bruschi cambi di colore.
- **Densità orientata al contenuto**: I blocchi di testo del corpo sono compatti (altezza riga 1.50), ma circondati da ampi margini, creando isole di contenuto leggibile in un mare di spazio bianco.

### Scala del Raggio dei Bordi
- Micro (4px): Pulsanti, input, elementi interattivi funzionali
- Sottile (5px): Link, elementi di elenco, voci di menu
- Standard (8px): Card piccole, contenitori, elementi in linea
- Comodo (12px): Card standard, contenitori di funzionalità, parti superiori delle immagini
- Grande (16px): Card hero, contenuti in evidenza, blocchi promozionali
- Pillola completa (9999px): Badge, pillole, indicatori di stato
- Cerchio (100%): Indicatori di scheda, avatar

## 6. Profondità ed Elevazione

| Livello | Trattamento | Utilizzo |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra, nessun bordo | Sfondo della pagina, blocchi di testo |
| Sussurro (Livello 1) | `1px solid rgba(0,0,0,0.1)` | Bordi standard, contorni delle card, divisori |
| Card Morbida (Livello 2) | Pila di ombre a 4 livelli (opacità max. 0.04) | Card di contenuto, blocchi di funzionalità |
| Card Profonda (Livello 3) | Pila di ombre a 5 livelli (opacità max. 0.05, sfocatura 52px) | Modali, pannelli in evidenza, elementi hero |
| Focus (Accessibilità) | Contorno `2px solid var(--focus-color)` | Focus da tastiera su tutti gli elementi interattivi |

**Filosofia delle Ombre**: Il sistema di ombre di Notion usa più livelli con opacità individuale estremamente bassa (da 0.01 a 0.05) che si accumulano in un'elevazione morbida e dall'aspetto naturale. L'ombra card a 4 livelli va da 1.04px a 18px di sfocatura, creando un gradiente di profondità invece di un'unica ombra dura. L'ombra profonda a 5 livelli si estende a 52px di sfocatura con opacità 0.05, producendo un'occlusione ambientale che sembra luce naturale invece di profondità generata dal computer. Questo approccio a livelli fa sì che gli elementi sembrino integrati nella pagina invece di fluttuare sopra di essa.

### Profondità Decorativa
- Sezione hero: illustrazioni di personaggi decorativi (stile giocoso, disegnato a mano)
- Alternanza di sezioni: cambiamenti di sfondo da bianco a bianco caldo (`#f6f5f4`)
- Nessun bordo duro di sezione — la separazione deriva da cambiamenti di colore dello sfondo e dalla spaziatura

## 7. Comportamento Responsivo

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-------|-------------|
| Mobile Piccolo | <400px | Colonna singola compatta, padding minimo |
| Mobile | 400-600px | Mobile standard, layout impilato |
| Tablet Piccolo | 600-768px | Iniziano le griglie a 2 colonne |
| Tablet | 768-1080px | Griglie complete di card, padding espanso |
| Desktop Piccolo | 1080-1200px | Layout desktop standard |
| Desktop | 1200-1440px | Layout completo, larghezza massima del contenuto |
| Desktop Grande | >1440px | Centrato, margini generosi |

### Target di Tocco
- I pulsanti usano padding comodo (8px-16px verticale)
- I link di navigazione a 15px con spaziatura adeguata
- I badge a pillola hanno 8px di padding orizzontale per le aree di tocco
- Il pulsante del menu mobile usa il pulsante hamburger standard

### Strategia di Collasso
- Hero: visualizzazione a 64px -> scala a 40px -> 26px su mobile, mantiene la spaziatura tra lettere proporzionale
- Navigazione: link orizzontali + CTA blu -> menu hamburger
- Card di funzionalità: 3 colonne -> 2 colonne -> colonna singola impilata
- Screenshot del prodotto: mantengono il rapporto d'aspetto con immagini responsive
- Loghi della barra di fiducia: griglia -> scorrimento orizzontale su mobile
- Footer: più colonne -> colonna singola impilata
- Spaziatura della sezione: 80px+ -> 48px su mobile

### Comportamento delle Immagini
- Gli screenshot dello spazio di lavoro mantengono il bordo sussurro a tutte le dimensioni
- Le illustrazioni hero scalano proporzionalmente
- Gli screenshot del prodotto usano immagini responsive con raggio dei bordi consistente
- Le sezioni di bianco caldo a larghezza piena mantengono il trattamento da bordo a bordo

## 8. Accessibilità e Stati

### Sistema di Focus
- Tutti gli elementi interattivi ricevono indicatori di focus visibili
- Contorno di focus: `2px solid` con colore di focus + livello di ombra 200
- Navigazione da tastiera supportata in tutti i componenti interattivi
- Testo ad alto contrasto: quasi nero su bianco supera WCAG AAA (rapporto >14:1)

### Stati Interattivi
- **Predefinito**: Aspetto standard con bordi sussurro
- **Hover**: Cambio di colore nel testo, scale(1.05) sui pulsanti, sottolineatura sui link
- **Attivo/Premuto**: Trasformazione scale(0.9), variante di sfondo più scuro
- **Focus**: Anello di contorno blu con rinforzo dell'ombra
- **Disabilitato**: Testo in grigio caldo (`#a39e98`), opacità ridotta

### Contrasto dei Colori
- Testo principale (rgba(0,0,0,0.95)) su bianco: rapporto ~18:1
- Testo secondario (#615d59) su bianco: rapporto ~5.5:1 (WCAG AA)
- CTA blu (#0075de) su bianco: rapporto ~4.6:1 (WCAG AA per testo grande)
- Testo badge (#097fe8) su sfondo badge (#f2f9ff): rapporto ~4.5:1 (WCAG AA per testo grande)

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido ai Colori
- CTA principale: Blu Notion (`#0075de`)
- Sfondo: Bianco puro (`#ffffff`)
- Sfondo alternativo: Bianco caldo (`#f6f5f4`)
- Testo intestazione: Quasi nero (`rgba(0,0,0,0.95)`)
- Testo corpo: Quasi nero (`rgba(0,0,0,0.95)`)
- Testo secondario: Grigio caldo 500 (`#615d59`)
- Testo attenuato: Grigio caldo 300 (`#a39e98`)
- Bordo: `1px solid rgba(0,0,0,0.1)`
- Link: Blu Notion (`#0075de`)
- Anello di focus: Blu focus (`#097fe8`)

### Esempi di Prompt per Componenti
- "Crea una sezione hero su sfondo bianco. Titolo a 64px NotionInter peso 700, line-height 1.00, letter-spacing -2.125px, color rgba(0,0,0,0.95). Sottotitolo a 20px peso 600, line-height 1.40, color #615d59. Pulsante CTA blu (#0075de, raggio 4px, padding 8px 16px, testo bianco) e pulsante fantasma (sfondo trasparente, testo quasi nero, sottolineatura all'hover)."
- "Progetta una card: sfondo bianco, bordo 1px solid rgba(0,0,0,0.1), raggio 12px. Usa la pila di ombre: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Titolo a 22px NotionInter peso 700, letter-spacing -0.25px. Corpo a 16px peso 400, color #615d59."
- "Costruisci un badge a pillola: sfondo #f2f9ff, testo #097fe8, raggio 9999px, padding 4px 8px, 12px NotionInter peso 600, letter-spacing 0.125px."
- "Crea la navigazione: intestazione bianca. NotionInter 15px peso 600 per i link, testo quasi nero. CTA a pillola blu 'Prova Notion gratis' allineato a destra (sfondo #0075de, testo bianco, raggio 4px)."
- "Progetta un layout a sezioni alternate: le sezioni bianche si alternano con sezioni in bianco caldo (#f6f5f4). Ogni sezione ha 64-80px di padding verticale, max-width 1200px centrato. Intestazione di sezione a 48px peso 700, line-height 1.00, letter-spacing -1.5px."

### Guida all'Iterazione
1. Usa sempre neutri caldi — i grigi di Notion hanno sfumature giallo-marroni (#f6f5f4, #31302e, #615d59, #a39e98), mai grigio-blu
2. La spaziatura tra lettere scala con la dimensione del font: -2.125px a 64px, -1.875px a 54px, -0.625px a 26px, normale a 16px
3. Quattro pesi: 400 (lettura), 500 (interazione), 600 (enfasi), 700 (annuncio)
4. I bordi sono sussurri: 1px solid rgba(0,0,0,0.1) — mai più pesanti
5. Le ombre usano 4-5 livelli con opacità individuale che non supera mai 0.05
6. Lo sfondo di sezione in bianco caldo (#f6f5f4) è essenziale per il ritmo visivo
7. Badge a pillola (9999px) per stato/tag, raggio 4px per pulsanti e input
8. Il Blu Notion (#0075de) è l'unico colore saturo nell'interfaccia principale — usalo con parsimonia per CTA e link
