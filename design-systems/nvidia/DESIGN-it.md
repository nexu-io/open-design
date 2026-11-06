# Design System Inspired by NVIDIA

> Categoria: Media & Consumer
> GPU computing. Energia verde-nera, estetica della potenza tecnica.

## 1. Tema Visivo e Atmosfera

Il sito di NVIDIA è un'esperienza ad alto contrasto, orientata alla tecnologia, che comunica potenza computazionale grezza attraverso una disciplina progettuale rigorosa. La pagina è costruita su una base netta di nero (`#000000`) e bianco (`#ffffff`), punteggiata dal verde caratteristico di NVIDIA (`#76b900`) — un colore così specifico da funzionare come impronta digitale del brand. Non è il verde rigoglioso della natura; è il verde elettrico, virato verso il lime, della luce renderizzata da GPU, un colore che si colloca tra il chartreuse e il kelly green e che per chiunque operi nel settore tecnologico significa immediatamente "NVIDIA".

La famiglia di font personalizzata NVIDIA-EMEA (con fallback Arial e Helvetica) crea una voce tipografica pulita e industriale. Le intestazioni a 36px grassetto con line-height compatto 1.25 formano blocchi di testo densi e autorevoli. Il font è privo della giocosità geometrica dei sans-serif della Silicon Valley — è europeo, pragmatico e orientato all'ingegneria. Il testo del corpo va dai 15 ai 16px, comodo da leggere ma non generoso, mantenendo la sensazione che lo spazio su schermo sia ottimizzato come la memoria GPU.

Ciò che distingue il design di NVIDIA dagli altri siti tech a sfondo scuro è l'uso disciplinato dell'accento verde. Il colore `#76b900` compare nei bordi (`2px solid #76b900`), nelle sottolineature dei link (`underline 2px rgb(118, 185, 0)`) e nelle CTA — ma mai come sfondo o grande superficie nel contenuto principale. Il verde è un segnale, non una superficie. Abbinato a un sistema di ombre profonde (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) e a un border radius minimo (1-2px), l'effetto complessivo è quello di un hardware di ingegneria di precisione reso in pixel.

**Caratteristiche Principali:**
- Verde NVIDIA (`#76b900`) come accento puro — solo bordi, sottolineature e highlight interattivi
- Sfondo nero (`#000000`) dominante con testo bianco (`#ffffff`) sulle sezioni scure
- Font personalizzato NVIDIA-EMEA con fallback Arial/Helvetica — industriale, europeo, pulito
- Line-height compatti (1.25 per le intestazioni) che creano blocchi di testo densi e autorevoli
- Border radius minimo (1-2px) — angoli netti e ingegnerizzati su tutta l'interfaccia
- Pulsanti con bordo verde (`2px solid #76b900`) come schema interattivo primario
- Sistema di icone Font Awesome 6 Pro/Sharp al peso 900 per iconografia nitida
- Architettura multi-framework (PrimeReact, Fluent UI, Element Plus) per componenti interattivi ricchi

## 2. Palette Colori e Ruoli

### Brand Primario
- **Verde NVIDIA** (`#76b900`): Il segno distintivo — bordi, sottolineature dei link, contorni CTA, indicatori attivi. Mai usato come riempimento di grandi superfici.
- **Nero Puro** (`#000000`): Sfondo primario della pagina, testo su superfici chiare, tono dominante.
- **Bianco Puro** (`#ffffff`): Testo su sfondi scuri, sfondi di sezioni chiare, superfici delle card.

### Palette Brand Estesa
- **Verde NVIDIA Chiaro** (`#bff230`): Accento lime brillante per highlight e stati hover.
- **Arancione 400** (`#df6500`): Accento caldo per avvisi, badge in evidenza o contesti legati all'energia.
- **Giallo 300** (`#ef9100`): Accento caldo secondario, highlight per categorie di prodotto.
- **Giallo 050** (`#feeeb2`): Superficie calda chiara per sfondi di callout.

### Stato e Semantica
- **Rosso 500** (`#e52020`): Stati di errore, azioni distruttive, avvisi critici.
- **Rosso 800** (`#650b0b`): Rosso scuro per sfondi di avvisi gravi.
- **Verde 500** (`#3f8500`): Stati di successo, indicatori positivi (più scuro del verde brand).
- **Blu 700** (`#0046a4`): Accenti informativi, alternativa hover per i link.

### Decorativo
- **Viola 800** (`#4d1368`): Viola scuro per estremità di gradienti, contesti premium/AI.
- **Viola 100** (`#f9d4ff`): Tinta superficiale viola chiaro.
- **Fucsia 700** (`#8c1c55`): Accento ricco per promozioni speciali o contenuti in evidenza.

### Scala Neutri
- **Grigio 300** (`#a7a7a7`): Testo attenuato, etichette disabilitate.
- **Grigio 400** (`#898989`): Testo secondario, metadata.
- **Grigio 500** (`#757575`): Testo terziario, segnaposto, footer.
- **Bordo Grigio** (`#5e5e5e`): Bordi sottili, linee divisorie.
- **Quasi Nero** (`#1a1a1a`): Superfici scure, sfondi delle card su pagine nere.

### Stati Interattivi
- **Link Predefinito (sfondo scuro)** (`#ffffff`): Link bianchi su sfondi scuri.
- **Link Predefinito (sfondo chiaro)** (`#000000`): Link neri con sottolineatura verde su sfondi chiari.
- **Link Hover** (`#3860be`): Shift verso il blu all'hover su tutte le varianti di link.
- **Button Hover** (`#1eaedb`): Highlight teal per gli stati hover dei pulsanti.
- **Button Attivo** (`#007fff`): Blu brillante per gli stati attivi/premuti dei pulsanti.
- **Focus Ring** (`#000000 solid 2px`): Contorno nero per il focus da tastiera.

### Ombre e Profondità
- **Ombra Card** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Ombra ambientale sottile per le card in rilievo.

## 3. Regole Tipografiche

### Famiglia di Font
- **Primario**: `NVIDIA-EMEA`, con fallback: `Arial, Helvetica, sans-serif`
- **Font Icone**: `Font Awesome 6 Pro` (peso 900 per icone solid, 700 per regular)
- **Icone Sharp**: `Font Awesome 6 Sharp` (peso 300 per icone light, 400 per regular)

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Line Height | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (compatto) | normal | Titoli ad alto impatto |
| Intestazione Sezione | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (compatto) | normal | Titoli di sezione, intestazioni card |
| Sottotitolo | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (rilassato) | normal | Descrizioni di funzionalità, sottotitoli |
| Titolo Card | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (compatto) | normal | Intestazioni di card e moduli |
| Corpo Grande | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (rilassato) | normal | Corpo enfatizzato, paragrafi di apertura |
| Corpo | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Testo di lettura standard |
| Corpo Grassetto | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Etichette forti, elementi di navigazione |
| Corpo Piccolo | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (rilassato) | normal | Contenuto secondario, descrizioni |
| Corpo Piccolo Grassetto | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Contenuto secondario enfatizzato |
| Pulsante Grande | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (compatto) | normal | Pulsanti CTA primari |
| Pulsante | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (compatto) | normal | Pulsanti standard |
| Pulsante Compatto | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (compatto) | 0.144px | Pulsanti piccoli/compatti |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Link di navigazione |
| Link Maiuscolo | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, etichette di navigazione |
| Didascalia | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadata, timestamp |
| Didascalia Piccola | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (compatto) | normal | Note legali, testo fine |
| Micro Etichetta | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, badge minuscoli |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (compatto) | normal | Testo UI più piccolo |

### Principi
- **Il grassetto come voce predefinita**: NVIDIA fa largo uso del peso 700 per intestazioni, pulsanti, link ed etichette. Il peso 400 è riservato al testo del corpo e alle descrizioni — tutto il resto è grassetto, che trasmette sicurezza e autorevolezza.
- **Intestazioni compatte, corpo rilassato**: Il line-height delle intestazioni è costantemente 1.25 (compatto), mentre il testo del corpo si rilassa a 1.50-1.67. Questo contrasto crea densità visiva in cima ai blocchi di contenuto e una leggibilità confortevole nei paragrafi.
- **Maiuscolo per la navigazione**: Le etichette dei link usano `text-transform: uppercase` con peso 700, creando una voce di navigazione che ricorda le etichette delle specifiche hardware.
- **Nessuna spaziatura decorativa**: La spaziatura tra le lettere è normale su tutta l'interfaccia, ad eccezione dei pulsanti compatti (0.144px). Il font porta in sé il carattere industriale senza bisogno di manipolazione.

## 4. Stili dei Componenti

### Pulsanti

**Primario (Bordo Verde)**
- Sfondo: `transparent`
- Testo: `#000000`
- Padding: 11px 13px
- Bordo: `2px solid #76b900`
- Radius: 2px
- Font: 16px peso 700
- Hover: sfondo `#1eaedb`, testo `#ffffff`
- Attivo: sfondo `#007fff`, testo `#ffffff`, bordo `1px solid #003eff`, scale(1)
- Focus: sfondo `#1eaedb`, testo `#ffffff`, outline `#000000 solid 2px`, opacità 0.9
- Uso: CTA primaria ("Scopri di più", "Esplora le Soluzioni")

**Secondario (Bordo Verde Sottile)**
- Sfondo: transparent
- Bordo: `1px solid #76b900`
- Radius: 2px
- Uso: Azioni secondarie, CTA alternative

**Compatto / Inline**
- Font: 14.4px peso 700
- Spaziatura lettere: 0.144px
- Line-height: 1.00
- Uso: CTA inline, navigazione compatta

### Card e Contenitori
- Sfondo: `#ffffff` (chiaro) o `#1a1a1a` (sezioni scure)
- Bordo: nessuno (bordi netti) o `1px solid #5e5e5e`
- Radius: 2px
- Ombra: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` per le card in rilievo
- Hover: intensificazione dell'ombra
- Padding: 16-24px interno

### Link
- **Su sfondo scuro**: `#ffffff`, nessuna sottolineatura, hover shifta a `#3860be`
- **Su sfondo chiaro**: `#000000` o `#1a1a1a`, sottolineatura `2px solid #76b900`, hover shifta a `#3860be`, sottolineatura rimossa
- **Link verdi**: `#76b900`, hover shifta a `#3860be`
- **Link attenuati**: `#666666`, hover shifta a `#3860be`

### Navigazione
- Sfondo nero scuro (`#000000`)
- Logo allineato a sinistra, wordmark NVIDIA prominente
- Link: NVIDIA-EMEA 14px peso 700 maiuscolo, `#ffffff`
- Hover: cambio colore, nessuna variazione della sottolineatura
- Mega-menu a tendina per le categorie di prodotto
- Fisso allo scroll con backdrop

### Trattamento Immagini
- Render prodotto/GPU come immagini hero, spesso a larghezza piena
- Immagini screenshot con ombra sottile per la profondità
- Overlay con gradiente verde sulle sezioni hero scure
- Contenitori avatar circolari con radius 50%

### Componenti Distintivi

**Card Prodotto**
- Card bianca o scura pulita con radius minimo (2px)
- Bordo di accento verde o sottolineatura sul titolo
- Schema intestazione in grassetto + descrizione più leggera
- CTA con bordo verde in fondo

**Tabelle Specifiche Tecniche**
- Layout a griglia industriale
- Sfondi di riga alternati (sottile variazione grigia)
- Etichette in grassetto, valori regular
- Highlight verdi per le metriche chiave

**Banner Cookie/Consenso**
- Posizionamento fisso in basso
- Pulsanti con bordi arrotondati (radius 2px)
- Trattamenti con bordo grigio

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Valori di padding primari: 8px, 11px, 13px, 16px, 24px, 32px
- Spaziatura sezioni: 48-80px di padding verticale

### Griglia e Contenitore
- Larghezza massima del contenuto: circa 1200px (contenuta)
- Sezioni hero a larghezza piena con testo contenuto
- Sezioni funzionalità: griglie a 2-3 colonne per le card prodotto
- Colonna singola per contenuto articoli/blog
- Layout sidebar per la documentazione

### Filosofia degli Spazi Bianchi
- **Densità intenzionale**: NVIDIA usa una spaziatura più compatta rispetto ai tipici siti SaaS, riflettendo la densità del contenuto tecnico. Lo spazio bianco esiste per separare i concetti, non per creare un vuoto di lusso.
- **Ritmo delle sezioni**: Le sezioni scure si alternano con quelle bianche, usando il colore di sfondo (non solo la spaziatura) per separare i blocchi di contenuto.
- **Densità delle card**: Le card prodotto sono ravvicinate con gap di 16-20px, creando una sensazione da catalogo piuttosto che da galleria.

### Scala Border Radius
- Micro (1px): Span inline, elementi minuscoli
- Standard (2px): Pulsanti, card, contenitori, input — il default per quasi tutto
- Cerchio (50%): Immagini avatar, indicatori tab circolari

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra | Sfondi pagina, testo inline |
| Sottile (Livello 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Card standard, modal |
| Bordo (Livello 1b) | `1px solid #5e5e5e` | Divisori di contenuto, bordi di sezione |
| Accento verde (Livello 2) | `2px solid #76b900` | Elementi attivi, CTA, elementi selezionati |
| Focus (Accessibilità) | outline `2px solid #000000` | Anello di focus da tastiera |

**Filosofia delle Ombre**: Il sistema di profondità di NVIDIA è minimale e utilitaristico. Esiste essenzialmente un solo valore di ombra — un blur ambientale da 5px al 30% di opacità — usato con parsimonia per card e modal. Il segnale primario di profondità non è l'ombra ma il _contrasto cromatico_: sfondi neri accanto a sezioni bianche, bordi verdi su superfici nere. Questo crea una stratificazione visiva simile all'hardware, dove la profondità deriva dalla differenza materiale, non dalla luce simulata.

### Profondità Decorativa
- Velature con gradiente verde dietro il contenuto hero
- Gradienti dal scuro al più scuro (dal nero al quasi-nero) per le transizioni tra sezioni
- Nessun effetto glassmorphism o blur — chiarezza sopra l'atmosfera

## 7. Comportamento Responsive

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-------|-------------|
| Mobile Small | <375px | Colonna singola compatta, padding ridotto |
| Mobile | 375-425px | Layout mobile standard |
| Mobile Large | 425-600px | Mobile più largo, qualche accenno a 2 colonne |
| Tablet Small | 600-768px | Inizio delle griglie a 2 colonne |
| Tablet | 768-1024px | Griglie card complete, navigazione espansa |
| Desktop | 1024-1350px | Layout desktop standard |
| Desktop Grande | >1350px | Larghezza massima del contenuto, margini generosi |

### Aree di Tocco
- I pulsanti usano padding 11px 13px per target di tocco comodi
- I link di navigazione a 14px maiuscolo con spaziatura adeguata
- I pulsanti con bordo verde forniscono target di tocco ad alto contrasto su sfondi scuri
- Mobile: menu hamburger collassabile con overlay a schermo intero

### Strategia di Collasso
- Hero: l'intestazione a 36px scala proporzionalmente verso il basso
- Navigazione: la nav orizzontale completa collassa nel menu hamburger a ~1024px
- Card prodotto: da 3 colonne a 2 colonne a colonna singola impilata
- Footer: la griglia multi-colonna collassa in colonna singola impilata
- Spaziatura sezioni: 64-80px si riduce a 32-48px su mobile
- Immagini: mantengono il rapporto d'aspetto, scalano alla larghezza del contenitore

### Comportamento Immagini
- I render GPU/prodotto mantengono alta risoluzione a tutte le dimensioni
- Le immagini hero scalano proporzionalmente con il viewport
- Le immagini nelle card usano rapporti d'aspetto coerenti
- Le sezioni scure a tutta larghezza mantengono il trattamento bordo-a-bordo

## 8. Comportamento Responsive (Esteso)

### Scaling Tipografico
- Il display a 36px scala a ~24px su mobile
- Le intestazioni di sezione a 24px scalano a ~20px su mobile
- Il testo del corpo mantiene 15-16px su tutti i breakpoint
- Il testo dei pulsanti mantiene 16px per target di tocco coerenti

### Strategia Sezioni Scure/Chiare
- Le sezioni scure (sfondo nero, testo bianco) si alternano con quelle chiare (sfondo bianco, testo nero)
- L'accento verde rimane coerente su entrambi i tipi di superficie
- Su scuro: i link sono bianchi, le sottolineature sono verdi
- Su chiaro: i link sono neri, le sottolineature sono verdi
- Questa alternanza crea un ritmo naturale nello scroll e raggruppamenti di contenuto

## 9. Guida ai Prompt per l'Agent

### Riferimento Rapido Colori
- Accento primario: Verde NVIDIA (`#76b900`)
- Sfondo scuro: Nero Puro (`#000000`)
- Sfondo chiaro: Bianco Puro (`#ffffff`)
- Testo intestazioni (sfondo scuro): Bianco (`#ffffff`)
- Testo intestazioni (sfondo chiaro): Nero (`#000000`)
- Testo corpo (sfondo chiaro): Nero (`#000000`) o Quasi Nero (`#1a1a1a`)
- Testo corpo (sfondo scuro): Bianco (`#ffffff`) o Grigio 300 (`#a7a7a7`)
- Link hover: Blu (`#3860be`)
- Bordo accento: `2px solid #76b900`
- Button hover: Teal (`#1eaedb`)

### Esempi di Prompt per i Componenti
- "Crea una sezione hero su sfondo nero. Titolo a 36px NVIDIA-EMEA peso 700, line-height 1.25, colore #ffffff. Sottotitolo a 18px peso 400, line-height 1.67, colore #a7a7a7. Pulsante CTA con sfondo transparent, bordo 2px solid #76b900, radius 2px, padding 11px 13px, testo #ffffff. Hover: sfondo #1eaedb, testo bianco."
- "Progetta una card prodotto: sfondo bianco, border-radius 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Titolo a 20px NVIDIA-EMEA peso 700, line-height 1.25, colore #000000. Corpo a 15px peso 400, line-height 1.67, colore #757575. Accento sottolineatura verde sul titolo: border-bottom 2px solid #76b900."
- "Costruisci una barra di navigazione: sfondo #000000, sticky in cima. Logo NVIDIA allineato a sinistra. Link a 14px NVIDIA-EMEA peso 700 maiuscolo, colore #ffffff. Hover: colore #3860be. Pulsante CTA con bordo verde allineato a destra."
- "Crea una sezione funzionalità scura: sfondo #000000. Etichetta sezione a 14px peso 700 maiuscolo, colore #76b900. Intestazione a 24px peso 700, colore #ffffff. Descrizione a 16px peso 400, colore #a7a7a7. Tre card prodotto in riga con gap di 20px."
- "Progetta un footer: sfondo #000000. Layout multi-colonna con gruppi di link. Link a 14px peso 400, colore #a7a7a7. Hover: colore #76b900. Barra inferiore con testo legale a 12px, colore #757575."

### Guida all'Iterazione
1. Usa sempre `#76b900` come accento, mai come riempimento di sfondo — è un colore segnale per bordi, sottolineature e highlight
2. I pulsanti sono transparent con bordi verdi di default — gli sfondi pieni compaiono solo negli stati hover/attivo
3. Il peso 700 è la voce dominante per tutti gli elementi interattivi e le intestazioni; il 400 è solo per i paragrafi del corpo
4. Il border radius è 2px per tutto — questo arrotondamento netto e minimale è fondamentale per l'estetica industriale
5. Le sezioni scure usano testo bianco; le sezioni chiare usano testo nero — l'accento verde funziona in modo identico su entrambe
6. L'hover dei link è sempre `#3860be` (blu) indipendentemente dal colore predefinito del link
7. Line-height 1.25 per le intestazioni, 1.50-1.67 per il testo del corpo — mantieni questo contrasto per la gerarchia visiva
8. La navigazione usa maiuscolo 14px grassetto — questa tipografia da etichetta hardware fa parte della voce del brand
