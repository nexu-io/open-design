# Design System Ispirato a PlayStation

> Category: Media e consumo
> Retail per console da gioco. Layout a canale su tre superfici, tipografia display dall'autorità silenziosa, cyan con scala al passaggio del cursore.

## 1. Tema Visivo e Atmosfera

PlayStation.com si presenta come il braccio marketing di un brand premium di elettronica di consumo che, tra le altre cose, vende intrattenimento. La pagina è organizzata come un **canale verticale di superfici alternate**: una testata e un hero quasi neri, una sequenza di pannelli editoriali bianco carta al centro e un footer blu cobalto intenso che ancora l'intera esperienza. Tra queste modalità di superficie, il sito punta deciso su fotografia e render 3D del prodotto — la console PS5, le copertine dei giochi, i controller DualSense — lasciando all'hardware il compito di trasmettere l'emozione mentre il contorno grafico rimane contenuto.

La scelta tipografica distintiva è **SST Light (peso 300) a grandi dimensioni**. La famiglia SST personalizzata di Sony viene utilizzata da 22px fino a 54px in peso 300, conferendo ai titoli display una qualità sussurrata ed elegante che si avvicina più a una pubblicità di orologi di lusso che a un negozio di videogiochi. Questa "autorità silenziosa" è l'esatto opposto della Manuka urlata di The Verge o della densità da edicola di Wired — PlayStation vuole che il testo si ritiri e il prodotto guidi. Il corpo testo e l'UI si appoggiano ai pesi 500–700, ma la *voce display* è costantemente sottile e calma.

L'unico punto in cui la moderazione si rompe è nell'**interazione**. Ogni pulsante primario ha la stessa animazione al passaggio del cursore: il riempimento si trasforma in un cyan elettrico `#1eaedb`, appare un bordo bianco da 2px, un anello esterno blu PlayStation da 2px fiorisce dietro di esso, e l'intero pulsante **si scala di 1.2×**. Quella combinazione di pop cromatico, bordo, anello e scala in rilievo è una mossa distintiva unica di Sony tra i grandi brand — una miniatura animazione "accensione" che il sito ripete centinaia di volte in una singola pagina.

**Caratteristiche Chiave:**
- Layout a canale su tre superfici: hero quasi nero, contenuto bianco carta, footer blu cobalto — alternati, mai mescolati
- SST peso 300 a 22–54px per il display — titoli dall'"autorità silenziosa" che lasciano guidare la fotografia di prodotto
- PlayStation Blue `#0070cc` come colore anchor del brand; cyan `#1eaedb` riservato esclusivamente agli stati hover/focus
- Ogni elemento interattivo si scala di 1.2× al passaggio del cursore — un "power-on" lift distintivo unico di PlayStation
- Pulsanti pill con raggio pieno 999px; arte delle card con rettangoli arrotondati da 12–24px
- Commerce-orange `#d53b00` usato esclusivamente per i CTA di PlayStation Store / stato acquisto
- Copertura ampia dei breakpoint fino a 2120px — il sito si scala fino ai contesti di navigazione su TV 4K

## 2. Palette Colori e Ruoli

### Primario (Anchor del Brand)
- **PlayStation Blue** (`#0070cc`): Il colore anchor del brand. Utilizzato nel footer principale, nei link inline, nei riempimenti dei pulsanti primari su superfici scure e in ogni indicatore "ufficiale". Trattalo come immutabile — è il colore che il brand associa di più nella memoria del consumatore.
- **Console Black** (`#000000`): Nero puro per la testata, gli sfondi degli hero e le zone di presentazione del prodotto. PlayStation usa il nero per incorniciare l'hardware come un museo usa il nero per incorniciare una scultura.

### Secondario e Accento
- **PlayStation Cyan** (`#1eaedb`): Il colore dell'interazione. Applicato SOLO agli stati hover, focus e active di pulsanti e link. Non appare mai come sfondo predefinito né come colore del testo a riposo. Abbinalo a un bordo `#ffffff` da 2px e un anello esterno `#0070cc` da 2px al passaggio del cursore per il trattamento distintivo completo.
- **Link Hover Blue** (`#1883fd`): La variante più luminosa usata al passaggio del cursore sui link di testo inline. Distinta dal Cyan — questo è il colore del link, il Cyan è il colore del pulsante.
- **Dark Link Blue** (`#0068bd`): Il colore del link a riposo su superfici chiare — un cugino leggermente più saturo del blu del brand.

### Superficie e Sfondo
- **Paper White** (`#ffffff`): Canvas principale dei contenuti per i pannelli editoriali tra la testata e il footer.
- **Ice Mist** (`#f5f7fa`): Il punto di arrivo atmosferico del gradiente di sezione chiaro. Usato in modo sottile dietro certi pannelli per sollevarli dal bianco puro.
- **Divider Tint** (`#f3f3f3`): Il colore discreto della riga divisoria orizzontale tra le righe di contenuto.
- **Masthead Black** (`#000000`): Canvas per la nav superiore e l'hero — riservato alle zone focalizzate sul prodotto.
- **Shadow Black** (`#121314`): L'anchor iniziale del gradiente di sezione scuro quando un pannello necessita di profondità atmosferica.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Sfondo traslucido usato dietro le barre filtro sticky — l'unico momento "glassmorphism" del sito.

### Neutri e Testo
- **Display Ink** (`#000000`): Titoli display primari su superfici bianche.
- **Deep Charcoal** (`#1f1f1f`): Titoli del corpo testo e colore del link a riposo — leggermente più morbido del nero puro per ridurre l'effetto visivo su blocchi grandi.
- **Body Gray** (`#6b6b6b`): Testo del corpo secondario e metadati.
- **Mute Gray** (`#cccccc`): Etichette terziarie, stati disabilitati.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Testo placeholder dei form — nero al 60%, non un valore grigio separato.
- **Inverse White** (`#ffffff`): Testo primario su superfici scure e blu.
- **Dark-Link Blue** (`#53b1ff`): Il colore del link a riposo su superfici scure/nere — una variante ariosa e più chiara del PlayStation Blue per la leggibilità sul nero.

### Semantico e Commerce
- **Commerce Orange** (`#d53b00`): Riservato ai CTA di acquisto di PlayStation Store, ai callout di prezzo e ai badge "in saldo". L'unico colore caldo del sito — usalo con parsimonia e mai al di fuori di un contesto commerce.
- **Commerce Orange Active** (`#aa2f00`): Lo stato premuto/active dei pulsanti commerce.
- **Warning Red** (`#c81b3a`): Errori dei form e avvisi per azioni distruttive.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Il drammatico scrim usato dietro il testo hero sulla fotografia di prodotto.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Anello di elevazione a basso peso sulle card.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Elevazione card leggerissima — quasi invisibile, ma separa i pannelli bianchi dallo sfondo bianco.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): L'ombra più leggera del sistema.

### Sistema di Gradienti
PlayStation usa **due gradienti di sezione** e niente altro:
- **Gradiente Sezione Chiara**: da `#ffffff` → `#f5f7fa` — una velatura quasi impercettibile che solleva delicatamente un pannello dal canvas.
- **Gradiente Sezione Scura**: da `#121314` → `#000000` — una breve velatura verticale che conferisce ai pannelli hero una sottile vignettatura senza introdurre alcuno spostamento di tonalità.

Entrambi i gradienti sono usati **solo come sfondi di sezione**, mai all'interno dei componenti. Non ci sono pulsanti con gradiente, né testo con gradiente, né aloni luminosi. Il brand è blu — non blu-viola, non blu-cyan.

## 3. Regole Tipografiche

### Famiglia di Font
- **SST** / **Playstation SST** (Sony, proprietario) — fallback: `Arial`, `Helvetica`. Il carattere globale personalizzato di Sony, progettato da Toshi Omagari e Akira Kobayashi. Copre i pesi 300 / 500 / 600 / 700 nella homepage. Il peso **300 a 22–54px** è la firma tipografica di PlayStation.
- **SST (condensed / alternate)** — fallback: `helvetica`, `arial`. Una variante compressa usata in alcuni moduli UI dove la larghezza è rilevante.
- **Arial** — fallback utility per la rara variante di pulsante che viene renderizzata in sans-serif di sistema.

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza riga | Spaziatura lettere | Note |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Il momento SST più grande della pagina — titolo luxury a peso leggero |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Titoli hero secondari |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Titoli dei pannelli feature |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Intestazioni di sezione |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Titoli di modulo — ancora in peso leggero 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Sotto-intestazione promozionale |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Intestazioni UI compatte |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Etichetta pulsante primario |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTA ad alta enfasi (acquisto, abbonamento) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Etichetta pulsante secondario |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Corpo testo di lettura standard |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Testo del link inline |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTA nelle card |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Didascalie, etichette tag |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Metadati standard |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Didascalia enfatizzata |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Didascalia semi-grassetto |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Pulsante UI con interlinea stretta |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Etichetta tab/pill |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Didascalia UI più piccola |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Microcopy del footer, testo legale |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Micro testo enfatizzato |

### Principi
- **Il peso 300 a grandi dimensioni è la voce.** PlayStation è l'unico grande brand di console che usa un display a peso leggero per i titoli hero. Resisti all'impulso di "aggiornare" il tipo display a 500 o 700 — la quiete è la personalità.
- **I salti di peso avvengono nel layer UI.** Sotto i 18px il sistema passa a 500–700 per la leggibilità. Il gradiente di peso da 300 (display) → 400 (corpo) → 500 (didascalie) → 700 (pulsanti) è la gerarchia.
- **La spaziatura delle lettere è appena percettibile.** La maggior parte dei valori è compresa tra 0.1–0.45px, positivi o leggermente negativi. Il `-0.1px` sull'hero da 54px stringe il tipo display quanto basta per sembrare "progettato" senza diventare una dichiarazione tipografica.
- **Due varianti di SST.** "SST" e "Playstation SST" sono funzionalmente la stessa famiglia con set di metriche leggermente diversi (Playstation SST è più stretto a piccole dimensioni). Trattali come intercambiabili per scopi che esulano dalla licenza interna di Sony.
- **Niente tutto maiuscolo.** A differenza di The Verge o Wired, PlayStation usa raramente etichette in MAIUSCOLO. Kicker e tag rimangono in title case o sentence case — un'altra mossa di "autorità silenziosa".
- **Niente serif in nessun punto.** L'intero sistema è sans. Non esiste alcuna voce contrapposta di stampa.

## 4. Stili dei Componenti

### Pulsanti

**Primario — Pill PlayStation Blue**
- Sfondo: `#0070cc` (PlayStation Blue)
- Testo: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Bordo: nessuno a riposo
- Raggio bordo: `999px` — pill completo
- Padding: ~`12px 24px` (variabile in base alla classe dimensione)
- Outline: `rgb(255, 255, 255) none 0px` a riposo
- **Hover (mossa distintiva)**:
  - Lo sfondo si riempie di `#1eaedb` (PlayStation Cyan)
  - Il testo rimane `#ffffff`
  - Appare un bordo `#ffffff` da 2px
  - Un anello esterno `#0070cc` da 2px fiorisce (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — il pulsante cresce effettivamente del 20%
- Active: `opacity: 0.6` — un rapido oscuramento per segnalare la pressione
- Focus: Come hover, ma l'anello diventa un'ombra focus `rgb(0, 114, 206) 0px 0px 0px 2px`
- Transizione: ~180ms ease su sfondo, transform e ombra

**Secondario — Contorno Bianco su Scuro**
- Sfondo: `#ffffff`
- Testo: `#0172ce` (variante PlayStation Blue)
- Bordo: `2px outset #000000` — un vero bordo `outset`, estremamente raro nel CSS moderno
- Raggio: variabile (spesso `999px` o `36px`)
- Padding: `16px 20px`
- Hover: stesso riempimento cyan distintivo + scale(1.2) + trattamento anello
- Focus: stesso trattamento anello

**Commerce Orange**
- Sfondo: `#d53b00` (Commerce Orange)
- Testo: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Raggio bordo: `999px` — pill
- Usato solo su CTA PS Store / Acquista / Abbonati Plus
- Active: lo sfondo si scurisce a `#aa2f00`
- Hover: segue la regola cyan-invert come tutti gli altri pulsanti (NON un hover specifico per l'arancione)

**Ghost Trasparente**
- Sfondo: trasparente
- Testo: `#1f1f1f` (Deep Charcoal)
- Bordo: `1px solid #dedede`
- Padding: `0 10px` (stretto, ottimizzato per la nav)
- Hover: riempimento cyan, testo bianco, bordo bianco da 2px, scale(1.2)
- Active: il testo si sposta su `#0072ce`, opacity 0.6

**Cerchio Icona**
- Sfondo: `rgba(0, 0, 0, 0.2)` su fotografie; `#ffffff` su superfici chiare
- Raggio bordo: `100%` — cerchio perfetto
- Usato per le frecce prev/next del carosello e i pulsanti di condivisione
- Hover: si schiarisce a `var(--color-role-backgrounds-primary-link-hover)` (circa `#e5e5e5` su chiaro)

**Mini CTA (In-card)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Raggio: `999px`
- Usato all'interno delle card gioco per mini CTA "Acquista ora" / "Aggiungi al carrello"

### Card e Contenitori

**Hero Card (Feature Gioco)**
- Sfondo: fotografia/render — di solito ancorato al nero
- Raggio bordo: `24px` o `19px` per le feature card
- Padding: 32–48px interno
- Ombra: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — un'ombra proiettata drammatica usata solo quando una card si sovrappone alla fotografia hero
- Hover: sottile transform di scala, un contorno cyan appare sul CTA primario

**Tile Copertina Gioco**
- Sfondo: copertina del gioco, senza padding
- Raggio bordo: `12px` o `13px` (immagini) / `19px` (cornice card)
- Ombra: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — elevazione leggerissima
- Hover: il CTA primario della card si illumina in cyan, la card stessa può scalare di 1.02×
- Transizione: 200ms ease sul transform

**Pannello Contenuto (Bianco)**
- Sfondo: `#ffffff` o il gradiente di sezione chiara `#ffffff → #f5f7fa`
- Bordo: tipicamente nessuno; separato dai vicini da spaziatura e ombra sottile
- Raggio: da `12px` a `24px` a seconda della gerarchia del pannello
- Ombra: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — la più leggera del sistema

**Card Scura su Scuro**
- Sfondo: `rgba(0, 0, 0, 0.2)` su fotografia
- Raggio bordo: `6px` (compatto) o `24px` (feature)
- Usato per inlay "press kit" o "stat block" su video hero

### Input e Form
- **Predefinito**: sfondo `#ffffff`, bordo `1px solid #cccccc`, raggio bordo `3px` (più stretto del resto del sistema — gli input sono l'unico punto in cui PlayStation diventa genuinamente compatto), testo SST 16px in `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: anello focus `#0070cc` da 2px tramite `box-shadow: 0 0 0 2px #0070cc`. Nessun cambio di colore del bordo — l'anello fa il lavoro.
- **Errore**: il bordo e il testo si spostano su `#c81b3a` (Warning Red), testo di errore inline sotto nello stesso rosso.
- **Transizione**: ~180ms ease su bordo e ombra.

### Navigazione

- **Nav superiore**: striscia nera (`#000000`) a piena larghezza con il logo PlayStation (bianco) allineato a sinistra, link di categoria centrati in SST 14–16px / 500 e un piccolo CTA "Accedi" allineato a destra.
- **Hover sul link nav**: il colore transita da `#ffffff` a `#1883fd` (Link Hover Blue), senza sottolineatura.
- **Sezione attiva**: marcata da una sottile sottolineatura da 2px in `#0070cc`.
- **Mobile**: la nav collassa in un cassetto hamburger. All'interno del cassetto, i link si impilano verticalmente con gap da 16px e padding orizzontale da 20px.
- **Comportamento sticky**: la nav rimane fissa in alto durante lo scroll; quando entra in una zona di superficie chiara **non si inverte** — rimane su sfondo nero per tutta la navigazione.

### Trattamento delle Immagini

- **Rapporti d'aspetto**: video/fotografia hero 16:9, render console 1:1, copertine giochi 3:4, immagini lifestyle 4:3.
- **Angoli**: arrotondati a `12px`, `13px` o `24px` a seconda del contesto della card. Le copertine dei giochi ottengono `6–12px`, le immagini hero `24px`.
- **Full-bleed**: solo nella testata hero e nei banner promozionali del footer. Tutto il resto si trova all'interno di una colonna di contenuto con padding.
- **Ombra**: drammatica `rgba(0, 0, 0, 0.8) 0 5px 9px 0` sugli hero, leggera `rgba(0, 0, 0, 0.06) 0 5px 9px 0` sulle tile della griglia.
- **Hover**: l'immagine rimane statica, la cornice della card e il CTA primario rispondono.
- **Lazy loading**: `loading="lazy"` su tutto ciò che è sotto il fold, `eager` sull'hero della testata.

### Pill Store Giochi (Distintivo)
- Sfondo: `#ffffff`
- Testo: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Raggio: `9999px` — pill completo
- Un tag pill neutro che si affianca alle copertine dei giochi per etichettare la piattaforma ("PS5", "PS4", "PSVR2"). Contrasto bianco su scuro.

## 5. Principi di Layout

### Sistema di Spaziatura
- **Unità base**: 8px.
- **Scala**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Padding di sezione**: 48–96px verticale tra i pannelli principali. Le transizioni hero-contenuto usano il valore più alto.
- **Padding card**: 20–32px interno. Le feature hero card possono espandersi a 48px.
- **Spaziatura inline**: 8–12px tra titolo e deck, 12–16px tra deck e CTA.
- **Micro-scala**: i valori 1/2/3/4.5/5/9/10/12 sono usati per il padding dei pill, la spaziatura delle didascalie e gli offset dei bordi — non per il ritmo editoriale.

### Griglia e Contenitore
- **Larghezza massima**: ~1920px (i breakpoint rilevati da dembrandt arrivano fino a 2120px). Il contenitore è tipicamente limitato a circa `1280–1920px` a seconda del pannello.
- **Modelli di colonne**: griglia responsive a 12 colonne che si risolve in righe di tile di gioco a 3/4/6 colonne a seconda della gerarchia. Le zone hero spesso si estendono su 12 colonne; le tile in evidenza si trovano in configurazioni 6+3+3 o 4+4+4.
- **Padding esterno**: 16px mobile → 48px tablet → 64–96px desktop.
- **Gutter**: 16–24px tra le colonne, più stretto (8–12px) all'interno dei cluster di tile.

### Filosofia degli Spazi Bianchi
PlayStation tratta gli spazi bianchi come un brand di lusso tratta l'illuminazione del negozio — come un segnale premium. Tra i moduli c'è notevolmente più spazio di respirazione verticale rispetto a qualsiasi altro grande sito retail, e i pannelli editoriali bianchi spesso contengono solo un titolo + un'immagine + un CTA con padding a scala hero. L'effetto è un "ritmo da galleria" in cui ogni prodotto ha la propria sala invece di competere in una griglia di miniature.

### Scala del Raggio del Bordo
- **2px** — pulsanti del banner cookie e piccola UI di amministrazione
- **3px** — input form, pannelli tab (più stretto di tutto il resto — un segnale deliberato di "UI funzionale")
- **6px** — pulsanti compatti e immagini inline
- **12px** — immagini standard delle copertine dei giochi e immagini di contenuto
- **13px** — certi wrapper di figure (un offset di 1px rispetto a 12px per l'annidamento)
- **19px** — feature card
- **20px** — span di tag inline
- **24px** — hero card, cornici feature primarie
- **36px** — nav full-pill e varianti di pulsanti secondari
- **48px** — pulsanti feature grandi
- **999px / 100%** — pulsanti primari full-pill e pulsanti icona circolari

Undici valori di raggio discreti — uno dei sistemi di raggio più ricchi di qualsiasi sito in questo catalogo. La gamma esiste perché PlayStation usa deliberatamente raggi diversi per *gerarchie* diverse: 3px per l'utility, 12px per i media, 24px per le feature, 999px per i CTA.

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|---|---|---|
| 0 | Nessuna ombra | Contenuto predefinito su `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Sollevamento leggero del pannello editoriale |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Elevazione standard della tile griglia |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Card enfatizzata (hover o active) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Ombra overlay hero — proiettata drammatica su fotografia |
| 5 | `0 0 0 2px #0070cc` (anello focus) | Stato focus del pulsante primario |
| 6 | `0 0 0 2px #000000` (anello hover) | Anello hover del pulsante secondario |
| 7 | Gradiente di sezione `#121314 → #000000` | Profondità atmosferica sui pannelli hero scuri |

La filosofia della profondità di PlayStation è **stratificata ma contenuta**. La scala delle ombre va da 0.06 a 0.16 per gli stati normali, poi salta a 0.8 per le proiezioni hero — non esiste un middle-ground di 0.2, 0.3, 0.4. L'effetto è che la maggior parte della pagina rimane quasi piatta, ma quando una hero card deve fluttuare sulla fotografia, *fluttua* davvero. L'elevazione è o sussurrata o urlata, mai bisbigliata.

### Profondità Decorativa
- **Gradienti di sezione** (scuro e chiaro, entrambi descritti sopra) — usati solo come sfondi di sezione
- **Anelli focus/hover** a 2px, sempre blu o cyan a seconda dello stato
- **Nessun bagliore, sfocatura o effetto atmosferico** al di là dei due gradienti di sezione
- **Nessun pulsante o testo con gradiente** — il sistema visivo è blocchi di colore solido ovunque tranne che nelle transizioni di sezione

## 7. Da Fare e Da Non Fare

### Da Fare
- **Fai** uso di PlayStation Blue (`#0070cc`) come riempimento principale del CTA e anchor del footer. È il colore anchor del brand.
- **Fai** uso di SST peso 300 per ogni titolo display da 22px in su. Il titolo a peso leggero è la voce.
- **Fai** applicare la firma hover completa a ogni pulsante primario: riempimento cyan + bordo bianco da 2px + anello esterno blu da 2px + `scale(1.2)`.
- **Fai** uso del raggio full-pill (`999px`) sui pulsanti primari e commerce.
- **Fai** riservare PlayStation Cyan (`#1eaedb`) esclusivamente agli stati hover, focus e active — mai come sfondo a riposo.
- **Fai** uso di Commerce Orange (`#d53b00`) solo sui CTA di PlayStation Store / acquisto e nei callout di prezzo.
- **Fai** alternare i pannelli hero scuri con i pannelli di contenuto bianchi e ancora con un footer blu intenso — il layout a canale su tre superfici è il ritmo della pagina.
- **Fai** uso di ombre hero drammatiche `rgba(0, 0, 0, 0.8)` quando una card si sovrappone alla fotografia di prodotto.
- **Fai** mantenere la nav superiore nera in ogni posizione di scroll — non si inverte al bianco sui pannelli chiari.

### Da Non Fare
- **Non** mettere in grassetto i titoli display. Il peso 300 a 22–54px è la voce di PlayStation. Il tipo display in peso 700 si legge come "un altro rivenditore di giochi".
- **Non** usare etichette o kicker in TUTTO MAIUSCOLO. PlayStation usa raramente il maiuscolo — è un brand dall'autorità silenziosa, non un brand da nastro di avvertimento.
- **Non** usare pulsanti, testo o sfondi con gradiente al di fuori dei due gradienti di sezione dichiarati.
- **Non** introdurre colori caldi al di fuori di Commerce Orange. Nessun CTA rosso, nessuna evidenziazione gialla, nessuna pillola di successo verde.
- **Non** usare angoli quadrati su pulsanti o media. Il sistema ha undici raggi — scegline uno, ma mai `0`.
- **Non** saltare la mossa hover `scale(1.2)` sui pulsanti primari. La scala in rilievo è una firma d'interazione del brand.
- **Non** usare il tipo serif. Il sistema è 100% SST sans.
- **Non** lasciare che il cyan `#1eaedb` appaia come colore del testo o dello sfondo a riposo. Esiste solo in movimento.
- **Non** progettare pannelli che competono per l'attenzione. Il ritmo degli spazi bianchi di PlayStation dà a ogni modulo la propria "sala galleria".

## 8. Comportamento Responsivo

### Breakpoint

| Nome | Larghezza | Cambiamenti Principali |
|---|---|---|
| Small Mobile | <400px | Colonna singola, nav collassa in hamburger, l'hero SST si scala a ~28px |
| Mobile | 400–599px | Colonna singola, tile si impilano a piena larghezza, il padding si apre a 16px |
| Large Mobile | 600–767px | Ancora colonna singola ma opzione a 2 colonne per le tile in moduli selezionati |
| Tablet Portrait | 768–1023px | Griglia giochi a 2 colonne, nav ancora condensata |
| Tablet Landscape | 1024–1279px | Griglia a 3–4 colonne, nav completa ripristinata |
| Desktop | 1280–1599px | Griglia editoriale completa, scala display hero massima (44–54px) |
| Large Desktop | 1600–1919px | Il contenitore si limita a 1600px, i margini si espandono |
| 4K / Schermo Grande | ≥1920px | Il contenitore si espande fino a 1920px max, il contenuto hero si scala per adattarsi alla distanza di visione TV |
| Ultra-Wide | ≥2120px | Breakpoint estremo — la pagina rimane ancorata, i margini esterni assorbono la larghezza extra |

La scansione dembrandt ha rilevato 30 breakpoint tra 320px e 2120px — un range responsivo insolitamente ampio. PlayStation si ottimizza specificamente per i **contesti a grande schermo** (1920–2120px) perché i possessori di PS5 navigano frequentemente sul sito su TV tramite il browser della console o tramite il cast-to-TV da telefono. La maggior parte dei siti retail smette di ottimizzare a 1440px; PlayStation continua fino al 4K.

### Target di Tocco
- I pulsanti pill primari sono alti ~48–56px (testo SST 18px + ~12–16px di padding verticale) — comodamente WCAG AAA.
- I link nav sono più piccoli (~32–40px di altezza) sul desktop; su mobile si portano a 48px+ all'interno del cassetto.
- I pulsanti cerchio icona sono 40–48px — ottimizzati per il tocco.

### Strategia di Collasso
- **Nav**: nav completa → condensata → cassetto hamburger al restringersi del viewport. Il logo rimane ancorato a sinistra; il CTA rimane ancorato a destra.
- **Griglia**: 6 col → 4 col → 3 col → 2 col → 1 col. Le card tile dei giochi si ridispongono senza ritagliare le copertine.
- **Spaziatura**: il padding di sezione si stringe da 96px → 64px → 48px → 32px → 24px al restringersi del viewport.
- **Tipo**: l'hero SST si scala da 54px → 44px → 35px → 28px → 22px. Il peso leggero 300 viene preservato in ogni dimensione.
- **Fotografia hero**: scambio con art-direction — il desktop usa crop 16:9 larghi, il mobile usa crop 4:3 o 1:1 con il prodotto centrato.

### Comportamento delle Immagini
- Raster responsivo (`srcset` + `<picture>` con art-direction), rapporti d'aspetto preservati per breakpoint.
- Pronto per 4K: il sito serve immagini ad alta densità a 1920px+ per evitare l'upscaling nella navigazione su TV.
- `loading="lazy"` su tutto ciò che è sotto il fold; l'hero è `eager` con un hint di preload.

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido Colori
- **CTA Primario**: "PlayStation Blue (`#0070cc`)"
- **Accento Hover / Focus**: "PlayStation Cyan (`#1eaedb`)"
- **Sfondo (Superficie Bianca)**: "Paper White (`#ffffff`)"
- **Sfondo (Superficie Scura)**: "Console Black (`#000000`)"
- **Testo Titolo su Bianco**: "Display Ink (`#000000`)"
- **Testo Corpo su Bianco**: "Deep Charcoal (`#1f1f1f`)"
- **Testo Corpo su Nero**: "Inverse White (`#ffffff`)"
- **Accento Commerce / Acquisto**: "Commerce Orange (`#d53b00`)"
- **Anchor Footer**: "PlayStation Blue (`#0070cc`)"

### Esempi di Prompt per Componenti
1. *"Crea un pulsante CTA primario con riempimento PlayStation Blue `#0070cc`, testo bianco in SST 18px / 500 / 0.4px tracking, raggio bordo 999px, padding 12px × 24px. Al passaggio del cursore, lo sfondo transita a `#1eaedb` PlayStation Cyan, appare un bordo `#ffffff` da 2px, un anello esterno `#0070cc` da 2px fiorisce tramite box-shadow, e l'intero pulsante si scala di 1.2× — tutto con una transizione ease da 180ms."*
2. *"Progetta un pannello hero su canvas Console Black `#000000` con un titolo SST peso 300 da 54px in `#ffffff` con -0.1px letter-spacing e line-height 1.25. Posiziona un singolo CTA primario sotto con il trattamento hover PlayStation standard. Nessuna etichetta in TUTTO MAIUSCOLO da nessuna parte."*
3. *"Costruisci una tile copertina gioco: immagine con rapporto d'aspetto 3:4 e raggio bordo 12px, ombra proiettata leggerissima `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, un titolo SST 700 da 14px sotto, un tag piattaforma SST 500 da 12px e un mini CTA primario in PlayStation Blue con 14px / 700 / 0.324px tracking."*
4. *"Crea un pulsante pill commerce per un acquisto su PlayStation Store: riempimento Commerce Orange `#d53b00`, testo `#ffffff` in SST 18px / 700 / 0.45px tracking, raggio 999px, padding 12px × 28px. Lo stato active si scurisce a `#aa2f00`. L'hover segue il cyan-invert standard con scala 1.2×."*
5. *"Progetta un pannello di contenuto bianco tra sezioni hero scure: sfondo `#ffffff` con il sottile gradiente di sezione chiara `#ffffff → #f5f7fa`, raggio bordo 24px, padding interno 48px, elevazione leggerissima `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, un titolo SST 300 da 35px, un paragrafo di corpo da 18px e un singolo CTA primario."*

### Guida all'Iterazione
Quando si perfezionano schermate esistenti generate con questo design system:
1. **Controlla il peso del display.** Ogni titolo da 22px in su dovrebbe essere SST peso 300. Se vedi peso 500 o 700 alla scala hero, hai perso la voce PlayStation.
2. **Controlla il trattamento hover.** Ogni pulsante primario deve scalare di 1.2× al passaggio del cursore con la combinazione riempimento cyan + bordo bianco + anello blu. Mancarne uno qualsiasi di questi quattro rompe la firma d'interazione.
3. **Controlla gli angoli.** Ogni contenitore e pulsante dovrebbe avere 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 o 999px / 100%. Gli angoli quadrati rompono la voce.
4. **Controlla la dispersione cromatica.** Solo PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) e i grigi/neri/bianchi dichiarati dovrebbero apparire nel chrome. Se vedi qualsiasi altra tonalità, correggila.
5. **Controlla l'alternanza delle superfici.** La pagina dovrebbe alternare hero scuro → contenuto bianco → hero scuro → contenuto bianco → footer blu. Se due pannelli della stessa superficie sono adiacenti, inserisci una transizione.
6. **Controlla il casing.** Solo sentence case e title case. Nessuna etichetta, pulsante o kicker in TUTTO MAIUSCOLO. Se vedi il maiuscolo, convertilo.
7. **Controlla il peso delle ombre.** L'opacità delle ombre dovrebbe essere 0.06 / 0.08 / 0.16 / 0.8 — niente nel mezzo. Se vedi ombre con 0.1, 0.2, 0.3, 0.5, correggile al livello dichiarato più vicino.
8. **Controlla gli spazi bianchi.** Se due moduli sembrano "competitivi" (si contendono l'attenzione), aggiungi 48–96px di spazio di respirazione verticale. Il ritmo da galleria di PlayStation è non negoziabile.
