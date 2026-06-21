# Sistema di Design Ispirato a Spotify

> Category: Media e Consumer
> Streaming musicale. Verde vibrante su sfondo scuro, tipografia decisa, guidato dall'arte degli album.

## 1. Tema Visivo e Atmosfera

L'interfaccia web di Spotify è un music player scuro e immersivo che avvolge gli ascoltatori in un bozzolo quasi nero (`#121212`, `#181818`, `#1f1f1f`), dove l'arte degli album e i contenuti diventano la principale fonte di colore. La filosofia di design è "content-first darkness" — l'interfaccia si ritira nell'ombra affinché musica, podcast e playlist possano risplendere. Ogni superficie è una tonalità di antracite, creando un ambiente teatrale in cui il solo vero colore proviene dall'iconico Spotify Green (`#1ed760`) e dalle copertine degli album stessi.

La tipografia utilizza SpotifyMixUI e SpotifyMixUITitle — font proprietari della famiglia CircularSp (Circular di Lineto, personalizzato per Spotify) con un ampio stack di fallback che include font arabi, ebraici, cirillici, greci, Devanagari e CJK, a riflesso della portata globale di Spotify. Il sistema tipografico è compatto e funzionale: 700 (bold) per l'enfasi e la navigazione, 600 (semibold) per l'enfasi secondaria e 400 (regular) per il corpo del testo. I pulsanti usano il maiuscolo con letter-spacing positivo (1.4px–2px) per una qualità sistematica da etichetta.

Ciò che distingue Spotify è la sua geometria a pillola e cerchio. I pulsanti primari usano un raggio da 500px a 9999px (pillola completa), i pulsanti circolari di play usano un raggio del 50%, e gli input di ricerca sono pillole da 500px. Combinando ombre pesanti (`rgba(0,0,0,0.5) 0px 8px 24px`) sugli elementi elevati con un'esclusiva combinazione di bordo inset-shadow (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), il risultato è un'interfaccia che ricorda un dispositivo audio premium — tattile, arrotondata e costruita per il tocco.

**Caratteristiche Principali:**
- Tema scuro immersivo quasi nero (`#121212`–`#1f1f1f`) — l'interfaccia scompare dietro al contenuto
- Spotify Green (`#1ed760`) come unico accento di brand — mai decorativo, sempre funzionale
- Famiglia di font SpotifyMixUI/CircularSp con supporto per scritture globali
- Pulsanti a pillola (500px–9999px) e controlli circolari (50%) — arrotondati, ottimizzati per il tocco
- Etichette dei pulsanti in maiuscolo con ampio letter-spacing (1.4px–2px)
- Ombre pesanti sugli elementi elevati (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Colori semantici: rosso negativo (`#f3727f`), arancione di avviso (`#ffa42b`), blu di annuncio (`#539df5`)
- L'arte degli album come fonte primaria di colore — l'interfaccia è acromatica per design

## 2. Palette Colori e Ruoli

### Brand Primario
- **Spotify Green** (`#1ed760`): Accento primario del brand — pulsanti play, stati attivi, CTA
- **Quasi Nero** (`#121212`): Superficie di sfondo più profonda
- **Superficie Scura** (`#181818`): Card, contenitori, superfici elevate
- **Medio Scuro** (`#1f1f1f`): Sfondi di pulsanti, superfici interattive

### Testo
- **Bianco** (`#ffffff`): `--text-base`, testo primario
- **Argento** (`#b3b3b3`): Testo secondario, etichette attenuate, nav inattiva
- **Quasi Bianco** (`#cbcbcb`): Testo secondario leggermente più luminoso
- **Chiaro** (`#fdfdfd`): Quasi bianco puro per la massima enfasi

### Semantici
- **Rosso Negativo** (`#f3727f`): `--text-negative`, stati di errore
- **Arancione di Avviso** (`#ffa42b`): `--text-warning`, stati di avviso
- **Blu di Annuncio** (`#539df5`): `--text-announcement`, stati informativi

### Superficie e Bordo
- **Card Scura** (`#252525`): Superficie di card elevata
- **Card Media** (`#272727`): Superficie di card alternativa
- **Grigio Bordo** (`#4d4d4d`): Bordi dei pulsanti su sfondo scuro
- **Bordo Chiaro** (`#7c7c7c`): Bordi di pulsanti con contorno, link attenuati
- **Separatore** (`#b3b3b3`): Linee divisorie
- **Superficie Chiara** (`#eeeeee`): Pulsanti in modalità chiara (raro)
- **Bordo Spotify Green** (`#1db954`): Variante di bordo con accento verde

### Ombre
- **Pesante** (`rgba(0,0,0,0.5) 0px 8px 24px`): Dialoghi, menu, pannelli elevati
- **Media** (`rgba(0,0,0,0.3) 0px 8px 8px`): Card, dropdown
- **Bordo Inset** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Combinazione bordo-ombra per gli input

## 3. Regole Tipografiche

### Famiglie di Font
- **Titolo**: `SpotifyMixUITitle`, fallback: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Corpo**: `SpotifyMixUI`, stesso stack di fallback

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Letter Spacing | Note |
|------|------|------|--------|-------------|----------------|-------|
| Titolo di Sezione | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Peso titolo bold |
| Intestazione Feature | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (compatto) | normal | Intestazioni sezione semibold |
| Corpo Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Testo enfatizzato |
| Corpo | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Corpo standard |
| Pulsante Maiuscolo | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (compatto) | 1.4px–2px | `text-transform: uppercase` |
| Pulsante | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Pulsante standard |
| Link Nav Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigazione |
| Link Nav | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Nav inattiva |
| Didascalia Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Metadati bold |
| Didascalia | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadati |
| Piccolo Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Tag, contatori |
| Piccolo | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Testo fine |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Testo minimo |

### Principi
- **Binario bold/regular**: La maggior parte del testo è 700 (bold) o 400 (regular), con il 600 usato con parsimonia. Questo crea una chiara gerarchia visiva tramite il contrasto di peso piuttosto che la variazione di dimensione.
- **Pulsanti in maiuscolo come sistema**: Le etichette dei pulsanti usano il maiuscolo + ampio letter-spacing (1.4px–2px), creando una voce "etichetta" sistematica distinta dal testo dei contenuti.
- **Dimensioni compatte**: L'intervallo va da 10px a 24px — più ristretto della maggior parte dei sistemi. La tipografia di Spotify è compatta e funzionale, progettata per scorrere le playlist, non per leggere articoli.
- **Supporto per scritture globali**: L'esteso stack di fallback (arabo, ebraico, cirillico, greco, Devanagari, CJK) riflette la presenza di Spotify in oltre 180 mercati.

## 4. Stili dei Componenti

### Pulsanti

**Pillola Scura**
- Background: `#1f1f1f`
- Testo: `#ffffff` o `#b3b3b3`
- Padding: 8px 16px
- Raggio: 9999px (pillola completa)
- Uso: Pillole di navigazione, azioni secondarie

**Pillola Scura Grande**
- Background: `#181818`
- Testo: `#ffffff`
- Padding: 0px 43px
- Raggio: 500px
- Uso: Pulsanti di navigazione principali dell'app

**Pillola Chiara**
- Background: `#eeeeee`
- Testo: `#181818`
- Raggio: 500px
- Uso: CTA in modalità chiara (consenso cookie, marketing)

**Pillola con Contorno**
- Background: trasparente
- Testo: `#ffffff`
- Bordo: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (asimmetrico per icona)
- Raggio: 9999px
- Uso: Pulsanti Segui, azioni secondarie

**Play Circolare**
- Background: `#1f1f1f`
- Testo: `#ffffff`
- Padding: 12px
- Raggio: 50% (cerchio)
- Uso: Controlli play/pausa

### Card e Contenitori
- Background: `#181818` o `#1f1f1f`
- Raggio: 6px–8px
- Nessun bordo visibile sulla maggior parte delle card
- Hover: leggero schiarimento dello sfondo
- Ombra: `rgba(0,0,0,0.3) 0px 8px 8px` sugli elementi elevati

### Input
- Input di ricerca: sfondo `#1f1f1f`, testo `#ffffff`
- Raggio: 500px (pillola)
- Padding: 12px 96px 12px 48px (consapevole dell'icona)
- Focus: il bordo diventa `#000000`, outline `1px solid`

### Navigazione
- Barra laterale scura con SpotifyMixUI 14px peso 700 per gli elementi attivi, 400 per quelli inattivi
- `#b3b3b3` colore attenuato per gli elementi inattivi, `#ffffff` per quelli attivi
- Pulsanti icona circolari (raggio 50%)
- Logo Spotify in alto a sinistra in verde

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Griglia e Contenitore
- Barra laterale (fissa) + area contenuto principale
- Card album/playlist basate su griglia
- Barra "ora in riproduzione" a larghezza piena in basso
- L'area contenuto responsive occupa lo spazio rimanente

### Filosofia degli Spazi Bianchi
- **Compressione scura**: Spotify addensa i contenuti — griglie di playlist, elenchi di tracce e navigazione sono tutti a spaziatura ravvicinata. Lo sfondo scuro fornisce riposo visivo tra gli elementi senza necessitare di grandi spazi.
- **Densità dei contenuti prima del respiro**: Questa è un'app, non un sito di marketing. Ogni pixel serve l'esperienza di ascolto.

### Scala dei Raggi dei Bordi
- Minimo (2px): Badge, tag espliciti
- Sottile (4px): Input, elementi piccoli
- Standard (6px): Contenitori di copertine album, card
- Confortevole (8px): Sezioni, dialoghi
- Medio (10px–20px): Pannelli, elementi overlay
- Grande (100px): Pulsanti a pillola grandi
- Pillola (500px): Pulsanti primari, input di ricerca
- Pillola Completa (9999px): Pillole di navigazione, ricerca
- Cerchio (50%): Pulsanti play, avatar, icone

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Base (Livello 0) | Sfondo `#121212` | Strato più profondo, sfondo della pagina |
| Superficie (Livello 1) | `#181818` o `#1f1f1f` | Card, barra laterale, contenitori |
| Elevato (Livello 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menu a tendina, card al passaggio del mouse |
| Dialogo (Livello 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modali, overlay, menu |
| Inset (Bordo) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Bordi degli input |

**Filosofia delle Ombre**: Spotify utilizza ombre notevolmente pesanti per un'app a tema scuro. L'ombra con opacità 0.5 a 24px di blur crea un effetto drammatico di "fluttuazione nel buio" per dialoghi e menu, mentre quella con opacità 0.3 a 8px di blur fornisce un sollevamento più sottile per le card. L'esclusiva combinazione di bordo inset-shadow sugli input crea una qualità tattile e incassata.

## 7. Cosa Fare e Cosa Non Fare

### Fare
- Usare sfondi quasi neri (`#121212`–`#1f1f1f`) — profondità tramite variazione di tonalità
- Applicare Spotify Green (`#1ed760`) solo per i controlli di riproduzione, gli stati attivi e le CTA primarie
- Usare la forma a pillola (500px–9999px) per tutti i pulsanti — circolare (50%) per i controlli play
- Applicare maiuscolo + ampio letter-spacing (1.4px–2px) sulle etichette dei pulsanti
- Mantenere la tipografia compatta (intervallo 10px–24px) — questa è un'app, non una rivista
- Usare ombre pesanti (opacità 0.3–0.5) per gli elementi elevati su sfondi scuri
- Lasciare che l'arte degli album fornisca il colore — l'interfaccia stessa è acromatica

### Non Fare
- Non usare Spotify Green in modo decorativo o sugli sfondi — è solo funzionale
- Non usare sfondi chiari per le superfici primarie — l'immersione nel buio è fondamentale
- Non omettere la geometria a pillola/cerchio sui pulsanti — i pulsanti squadrati spezzano l'identità
- Non usare ombre sottili/leggere — su sfondi scuri, le ombre devono essere pesanti per essere visibili
- Non aggiungere ulteriori colori di brand — verde + grigi acromatici è la palette completa
- Non usare interlinee rilassate — la tipografia di Spotify è compatta e densa
- Non esporre bordi grigi grezzi — usare invece bordi basati su ombre o bordi inset

## 8. Comportamento Responsive

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-------|-------------|
| Mobile Piccolo | <425px | Layout mobile compatto |
| Mobile | 425–576px | Mobile standard |
| Tablet | 576–768px | Griglia a 2 colonne |
| Tablet Grande | 768–896px | Layout espanso |
| Desktop Piccolo | 896–1024px | Barra laterale visibile |
| Desktop | 1024–1280px | Layout desktop completo |
| Desktop Grande | >1280px | Griglia espansa |

### Strategia di Collasso
- Barra laterale: completa → ridotta → nascosta
- Griglia album: 5 colonne → 3 → 2 → 1
- Barra "ora in riproduzione": mantenuta a tutte le dimensioni
- Ricerca: input a pillola mantenuto, la larghezza si adatta
- Navigazione: barra laterale → barra inferiore su mobile

## 9. Guida al Prompt per l'Agente

### Riferimento Rapido ai Colori
- Sfondo: Quasi Nero (`#121212`)
- Superficie: Card Scura (`#181818`)
- Testo: Bianco (`#ffffff`)
- Testo secondario: Argento (`#b3b3b3`)
- Accento: Spotify Green (`#1ed760`)
- Bordo: `#4d4d4d`
- Errore: Rosso Negativo (`#f3727f`)

### Esempi di Prompt per Componenti
- "Crea una card scura: sfondo `#181818`, raggio 8px. Titolo a 16px SpotifyMixUI peso 700, testo bianco. Sottotitolo a 14px peso 400, `#b3b3b3`. Ombra `rgba(0,0,0,0.3) 0px 8px 8px` al passaggio del mouse."
- "Progetta un pulsante a pillola: sfondo `#1f1f1f`, testo bianco, raggio 9999px, padding 8px 16px. 14px SpotifyMixUI peso 700, maiuscolo, letter-spacing 1.4px."
- "Costruisci un pulsante play circolare: sfondo Spotify Green (`#1ed760`), icona `#000000`, raggio 50%, padding 12px."
- "Crea un input di ricerca: sfondo `#1f1f1f`, testo bianco, raggio 500px, padding 12px 48px. Bordo inset: `rgb(124,124,124) 0px 0px 0px 1px inset`."
- "Progetta la barra laterale di navigazione: sfondo `#121212`. Elementi attivi: 14px peso 700, bianco. Inattivi: 14px peso 400, `#b3b3b3`."

### Guida all'Iterazione
1. Inizia con `#121212` — tutto vive nell'oscurità quasi nera
2. Spotify Green solo per evidenziazioni funzionali (play, attivo, CTA)
3. Usa la pillola ovunque — 500px per le grandi, 9999px per le piccole, 50% per le circolari
4. Maiuscolo + ampia spaziatura sui pulsanti — la voce sistematica da etichetta
5. Ombre pesanti (opacità 0.3–0.5) per l'elevazione — le ombre leggere sono invisibili sul scuro
6. L'arte degli album fornisce tutto il colore — l'interfaccia rimane acromatica
