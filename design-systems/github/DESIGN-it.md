# Design System Inspired by GitHub

> Category: Strumenti per sviluppatori
> Piattaforma orientata al codice. Densità funzionale, precisione blu su bianco, fondamenta Primer.

## 1. Tema Visivo e Atmosfera

La superficie di GitHub è ingegnerizzata, non decorata. Ogni pixel dichiara una posizione: questo è uno strumento per chi si preoccupa di diff, build e pull request. Lo sfondo della pagina è un pulito `#ffffff` (tema chiaro) o `#0d1117` (tema scuro), con i contenuti disposti su riquadri rettangolari densi separati da bordi sottilissimi anziché dallo spazio negativo. La densità delle informazioni è il marchio — righe di elenco, righe di codice, intestazioni dei repository e schede delle notifiche sono tutte ravvicinate, così un utente esperto può scorrere centinaia di elementi senza scorrerli tutti.

Gli accenti caratteristici sono il **blu Primer** (`#0969da`) per i link e le azioni primarie, e il **verde GitHub** (`#1a7f37`) per gli stati di unione, il successo e il pulsante di merge stesso. Entrambi appaiono leggermente smorzati rispetto ai blu e verdi dei prodotti consumer — sufficientemente saturi da distinguersi sul testo grigio denso, abbastanza contenuti da scomparire nello sfondo quando più elementi appaiono nello stesso viewport.

La tipografia usa lo stack **system-ui** in tutto il prodotto, così il testo si renderizza nitidamente su ogni sistema operativo, abbinato a **SFMono / Menlo / Consolas** per il codice. Non esiste un carattere editoriale display; la voce di GitHub è la voce del sistema su cui ti trovi già.

**Caratteristiche Principali:**
- Tela bianca pura (`#ffffff`) o nero-blu profondo (`#0d1117`) — nessun calore, nessuna tinta
- Bordi grigi sottilissimi (`#d0d7de`) definiscono ogni riquadro e pannello
- Blu Primer (`#0969da`) per link/primario; verde GitHub (`#1a7f37`) per successo/merge
- system-ui per la prosa; SFMono per il codice — nessun carattere personalizzato
- Righe di elenco dense con spaziatura minima; lo spazio bianco è raro
- Iconografia Octicon a 16px / 24px — tratto singolo, geometrica, coerente
- Badge di stato a forma di pillola con semantica cromatica forte

## 2. Palette Colori e Ruoli

### Primario
- **Canvas Default** (`#ffffff`): Sfondo principale della pagina, tema chiaro.
- **Canvas Subtle** (`#f6f8fa`): Superficie secondaria, barra laterale, sfondo degli input, striscia dell'intestazione.
- **Canvas Inset** (`#eaeef2`): Sfondo dei blocchi di codice, superficie incassata in profondità.
- **Fg Default** (`#1f2328`): Testo primario, titoli, inchiostro.
- **Fg Muted** (`#656d76`): Testo secondario, didascalie, percorsi dei file.

### Accento del Brand
- **Primer Blue** (`#0969da`): Link, CTA primarie, base dell'anello di focus — il colore interattivo universale.
- **Primer Blue Hover** (`#0550ae`): Hover/pressione per il blu primario.
- **Accent Subtle** (`#ddf4ff`): Superficie blu tenue per callout, banner informativi.

### Semantico
- **Success / Merge Green** (`#1a7f37`): PR unite, badge di successo, pulsante di merge.
- **Success Subtle** (`#dafbe1`): Tinta superficie di successo.
- **Open Green** (`#1a7f37`): Stato "Aperto" di issue/PR.
- **Closed / Danger Red** (`#cf222e`): PR chiuse, azione distruttiva, errore di validazione.
- **Danger Subtle** (`#ffebe9`): Superficie del banner di errore.
- **Attention / Warning Yellow** (`#9a6700`): Testo di avviso su superficie ambrata.
- **Attention Subtle** (`#fff8c5`): Superficie del banner di avviso.
- **Done Purple** (`#8250df`): Unito e archiviato, stato "fatto", badge premium.
- **Sponsor Pink** (`#bf3989`): Cuore degli sponsor, brand di GitHub Sponsors.

### Bordo e Divisore
- **Border Default** (`#d0d7de`): Bordo sottile standard, contorno del pannello.
- **Border Muted** (`#d8dee4`): Divisori interni all'interno di un pannello.
- **Border Subtle** (`#eaeef2`): Divisori tenue tra le righe della tabella.

### Tema Scuro
- **Dark Canvas** (`#0d1117`): Sfondo della pagina scura.
- **Dark Surface** (`#161b22`): Barra laterale, intestazione, superficie secondaria.
- **Dark Border** (`#30363d`): Bordo standard in modalità scura.
- **Dark Fg** (`#e6edf3`): Testo primario su sfondo scuro.

## 3. Regole Tipografiche

### Famiglia di Caratteri
- **Body / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Gerarchia

| Ruolo | Carattere | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Intestazione repository, hero marketing |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Titolo della pagina |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Titolo di sezione |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Sottosezione, intestazione del pannello |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Dimensione testo predefinita — non 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Didascalie, metadati dei file |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Blocchi di codice, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Span `code` inline |

### Principi
- **Body a 14px, non 16px**: La densità della prosa di GitHub è la sua identità. Il prodotto si legge a 14px per far rientrare più righe in un viewport.
- **Peso binario**: 400 per tutto di default; 600 per i titoli e l'enfasi. Nessun 500, nessun 700.
- **Sempre font di sistema**: non caricare mai un webfont per il chrome — il testo deve renderizzarsi istantaneamente su connessioni lente.

## 4. Stili dei Componenti

### Pulsanti

**Primario (Verde)**
- Background: `#1f883d`
- Testo: `#ffffff`
- Bordo: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- Utilizzo: "Crea repository", "Unisci pull request"

**Default**
- Background: `#f6f8fa`
- Testo: `#1f2328`
- Bordo: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, bordo `#d0d7de`

**Outline (Stile Link Blu)**
- Background: `#ffffff`
- Testo: `#0969da`
- Bordo: 1px solid `#d0d7de`
- Hover: background `#0969da`, testo `#ffffff`

**Danger**
- Background: `#ffffff`
- Testo: `#cf222e`
- Bordo: 1px solid `#d0d7de`
- Hover: background `#a40e26`, testo `#ffffff`, bordo `#a40e26`

### Card / Box
- Background: `#ffffff`
- Bordo: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (intestazione) + 16px (corpo)
- L'intestazione ha una striscia `#f6f8fa` con bordo inferiore.

### Input
- Background: `#ffffff`
- Bordo: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: bordo `#0969da`, anello `0 0 0 3px rgba(9,105,218,0.3)`

### Pillole di Stato (Issue / PR)
- **Aperto**: background `#1a7f37`, testo bianco, padding 4px 10px, radius 9999px.
- **Chiuso**: background `#cf222e`, testo bianco.
- **Unito**: background `#8250df`, testo bianco.
- **Bozza**: background `#6e7781`, testo bianco.

### Etichette (Tag su Issue/PR)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- Background e testo sono programmatici (colore etichetta → testo calcolato per contrasto).

## 5. Spaziatura e Layout

- **Unità base**: 4px. Scala di spaziatura: 4, 8, 12, 16, 24, 32, 40, 48.
- **Larghezza massima della pagina**: 1280px (`Container-xl`).
- **Barra laterale**: 296px su desktop, si riduce sotto 1012px.
- **Padding delle righe**: 16px orizzontale, 12px verticale (le liste sono dense per design).

## 6. Movimento

- **Durata**: 80ms per l'hover; 200ms per l'apertura di menu/popover.
- **Easing**: `ease-out` per le aperture, `ease-in` per le chiusure.
- **Evitato**: animazione al caricamento della pagina, parallax, micro-interazioni persistenti. Le cose appaiono; non eseguono.

## 7. Linee Guida d'Uso

- Mantenere insieme le liste dense, i box con bordo e la tipografia di sistema; i pulsanti verdi isolati non bastano a creare una superficie prodotto simile a GitHub.
- Usare il verde per le azioni costruttive del repository, il blu per i link e il focus, e rosso/viola/grigio solo per gli stati di issue, PR e workflow.
- Preferire un chrome discreto, bordi espliciti e spaziatura compatta rispetto a ombre decorative o card di grandi dimensioni in stile marketing.
