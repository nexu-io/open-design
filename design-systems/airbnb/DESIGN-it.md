# Design System Inspired by Airbnb

> Category: E-Commerce & Vendita al dettaglio
> Marketplace di viaggi. Accento corallo caldo, guidato dalla fotografia, interfaccia arrotondata.

## 1. Tema Visivo & Atmosfera

Il design Airbnb del 2026 ricorda una rivista di viaggi che per caso è anche un'app: tele bianche immacolate lasciano spazio a fotografie a tutta pagina, e l'interfaccia stessa scompare per lasciare respirare gli annunci. Il caratteristico rosa corallo Rausch (`#ff385c`) è usato con parsimonia ma in modo inconfondibile: CTA di ricerca, indicatore del tab attivo, pulsante di azione principale e occasionalmente prezzi o il cuore della wishlist. Tutto il resto è una scala di grigi rigorosa, con `#222222` che porta quasi ogni riga di testo.

Ciò che rende il sistema inconfondibilmente Airbnb è la *fiducia* che ripone nei contenuti. Le foto degli alloggi vengono mostrate in formato hero, 4:3 con trattamento del raggio a bordo pieno. Il cambio categoria avviene tramite un selettore a tre tab (Case / Esperienze / Servizi) che usa icone illustrate renderizzate in 3D (una casa con tetto a spiovente, una mongolfiera, un campanello di servizio) — fisiche, tattili, quasi giocattolo — abbinate a etichette `Airbnb Cereal VF` nitide. Questo è uno dei rari prodotti consumer in cui rendering 3D e interfaccia puramente tipografica coesistono senza tensione.

La superficie più nuova è la linea di prodotti **Esperienze** — stesso cromo, ma densità delle schede più ricca, più fotografia e un pannello di prenotazione ancorato al centro con prezzi fissi sulla colonna destra. Le pagine di dettaglio degli annunci (sia stanze che esperienze) seguono un template stretto: griglia immagine hero a tutta pagina → scheda di prenotazione arrotondata sovrapposta (fissa allo scorrimento) → servizi → recensioni (i premi Preferiti dagli ospiti usano una grande valutazione `4.81` centrata con un lockup a corona d'alloro) → mappa → profilo del host → informative. Il ritmo è coerente sia che tu stia prenotando una stanza o un tour in yacht.

**Caratteristiche Chiave:**
- Rosa corallo Rausch (`#ff385c`) come colore brand a singolo accento, usato solo per le CTA principali e il pulsante di ricerca
- Fotografia a tutta pagina in formato 4:3 / 16:9 con angoli arrotondati delicati (14–20 px) come vocabolario visivo principale
- Icone di categoria 3D renderizzate abbinate a tab tipografici — l'unico punto in cui il sistema permette l'illustrazione
- Pulsanti icona circolari `50%` (freccia indietro, condividi, preferito, frecce del carosello) distribuiti ovunque
- `Airbnb Cereal VF` porta ogni etichetta, dalla nota legale di 8 px all'intestazione di sezione di 28 px — un sistema a singola famiglia
- Codifica colore per livello di prodotto: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (viola scuro `#460479`), Airbnb (corallo Rausch)
- Lockup del premio Preferito dagli ospiti — numero di valutazione gigante centrato tra due corone d'alloro, uno dei momenti più riconoscibili del sistema
- Pannello di prenotazione fisso con stack prezzo → date → ospiti, ancorato alla colonna destra sul desktop, trasformato in una barra "Prenota" ancorata in basso sul mobile
- Navigazione mobile inferiore fissa (Esplora / Wishlist / Accedi) con tinta Rausch per lo stato attivo

## 2. Palette Colori & Ruoli

### Primario
- **Rausch** (`#ff385c`): Il rosa corallo caratteristico del brand. Variabile CSS `--palette-bg-primary-core`. Usato per: pulsante principale "Prenota", pulsante di invio ricerca, sottolineatura tab attivo, riempimento cuore wishlist, enfasi del prezzo. Il colore con la singola visibilità più alta su ogni pagina.

### Secondario & Accento
- **Deep Rausch** (`#e00b41`): Una variante più saturata. Variabile CSS `--palette-bg-tertiary-core`. Usato per stati premuti/attivi dei pulsanti e punti terminali del gradiente.
- **Plus Magenta** (`#92174d`): Variabile CSS `--palette-bg-primary-plus`. Il colore brand per il livello di prodotto Airbnb Plus — un'offerta di annunci curati di fascia alta.
- **Luxe Purple** (`#460479`): Variabile CSS `--palette-bg-primary-luxe`. Il colore brand per il livello di prodotto Airbnb Luxe — affitti di ville/tenute.
- **Info Blue** (`#428bff`): Variabile CSS `--palette-text-legal`. Usato per link legali/informativi (termini, privacy, informative) — l'unico colore link non monocromatico nel sistema.

### Superficie & Sfondo
- **Canvas White** (`#ffffff`): Lo sfondo pagina predefinito. Ogni scheda, ogni container, ogni pagina di dettaglio inizia qui.
- **Soft Cloud** (`#f7f7f7`): Tinta di sub-superficie sottile usata su sfondi del footer, wrapper della vista mappa e sezioni "tutto il resto" che vogliono arretrare rispetto al bianco primario.
- **Hairline Gray** (`#dddddd`): Colore bordo da 1 px onnipresente — separa schede, righe di servizi, pannelli di recensioni, colonne del footer. Il cavallo di battaglia del sistema di layout.

### Neutri & Testo
- **Ink Black** (`#222222`): Variabile CSS `--palette-text-primary`. Il quasi-nero del sistema. Ogni intestazione, ogni paragrafo di testo, ogni etichetta di navigazione, ogni prezzo. Usato per circa il 90% di tutto il testo su una pagina.
- **Charcoal** (`#3f3f3f`): Variabile CSS `--palette-text-focused`. Usato nel testo di input nello stato focused e nel testo di enfasi di un livello inferiore.
- **Ash Gray** (`#6a6a6a`): Variabile CSS `--palette-bg-tertiary-hover`. Etichette secondarie, testo in stile sottotitolo "Affitti di cottage" sotto i nomi delle città, link del footer attenuati.
- **Mute Gray** (`#929292`): Variabile CSS `--palette-text-link-disabled`. Pulsanti disabilitati e metadati di bassa priorità.
- **Stone Gray** (`#c1c1c1`): Divisori terziari, tratti delle icone, avatar segnaposto.

### Semantici & Accento
- **Error Red** (`#c13515`): Variabile CSS `--palette-text-primary-error`. Errori di validazione del form, avvisi di azioni distruttive.
- **Deep Error** (`#b32505`): Variabile CSS `--palette-text-secondary-error-hover`. Varianti premute/attive degli stati di errore.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Variabile CSS `--palette-text-material-disabled`. Etichette in stile materiale disabilitate.

### Sistema di Gradienti
Il gradiente del brand Airbnb appare con parsimonia, tipicamente solo sul wordmark e nel momento del pulsante di ricerca brandizzato:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Questa transizione corallo → magenta è il "momento brand" — mai usato come superficie completa, solo come riempimento di una pillola stretta o trattamento del logo.

## 3. Regole Tipografiche

### Famiglia di Font
- **Airbnb Cereal VF** (primario e unico): Il sans-serif a peso variabile proprietario che porta l'intero sistema. Fallback (in ordine): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Pesi osservati nei token estratti: 500, 600, 700. Nessun 400-regular — il peso "corpo" del sistema è 500, che dà a ogni blocco di testo una densità extra sottile che si legge come sicura e deliberata.

Funzionalità OpenType: `salt` (alternati stilistici) è usato sulle etichette compatte da 11 px e 14 px a peso 600 — probabilmente per cifre più strette e formatura di caratteri speciali. Non sono state osservate funzionalità di legatura o cifre frazionarie.

### Gerarchia

| Ruolo | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|--------|-------------|----------------|-------|
| Intestazione Sezione | 28 px / 1,75 rem | 700 | 1,43 | 0 | "Ispirazione per future fughe" — intestazioni a livello di pagina |
| Intestazione Sottosezione | 22 px / 1,38 rem | 500 | 1,18 | -0,44 px | "Cosa offre questo posto", "Incontra gli host" — divisori di contenuto |
| Titolo Scheda | 21 px / 1,31 rem | 700 | 1,43 | 0 | Intestazioni pannello recensioni, titoli principali delle schede |
| Titolo Annuncio | 20 px / 1,25 rem | 600 | 1,20 | -0,18 px | "Tour in yacht per piccoli gruppi, vino e frutta illimitati" — headline degli annunci nelle pagine di dettaglio |
| Sottotitolo Grassetto | 16 px / 1,00 rem | 600 | 1,25 | 0 | Nome host, nome città |
| Corpo Medio | 16 px / 1,00 rem | 500 | 1,25 | 0 | Testo corpo principale nelle pagine di dettaglio |
| Pulsante Grande | 16 px / 1,00 rem | 500 | 1,25 | 0 | "Prenota", "Diventa un host" |
| Pulsante Predefinito | 14 px / 0,88 rem | 500 | 1,29 | 0 | Etichette pulsante standard |
| Link | 14 px / 0,88 rem | 500 | 1,43 | 0 | Link di navigazione, link del footer |
| Didascalia Media | 14 px / 0,88 rem | 500 | 1,29 | 0 | Metadati, righe di sottotitolo ("Affitti cottage", "Affitti ville") |
| Didascalia Grassetto | 14 px / 0,88 rem | 600 | 1,43 | 0 | Funzione `salt` abilitata — statistiche numeriche, enfasi testo piccolo |
| Didascalia Piccola | 13 px / 0,81 rem | 400 | 1,23 | 0 | Date recensioni, micro-metadati |
| Micro Predefinito | 12 px / 0,75 rem | 400 | 1,33 | 0 | Disclaimer del footer, micro-testo legale |
| Micro Grassetto | 12 px / 0,75 rem | 700 | 1,33 | 0 | Etichette pillola "NUOVO" |
| Badge Maiuscolo | 11 px / 0,69 rem | 600 | 1,18 | 0 | Funzione `salt` — badge di categoria/stato compatti |
| Apice | 8 px / 0,50 rem | 700 | 1,25 | 0,32 px | Maiuscolo — note a piè di pagina dei prezzi, code decimali |

### Principi
- **Una famiglia, molti pesi.** Airbnb Cereal VF gestisce tutto dal testo legale da 8 px alle intestazioni di pagina da 28 px — l'identità visiva viene dalla famiglia stessa, non dal mescolare i caratteri.
- **500 è il nuovo 400.** Il peso "regolare" del sistema è 500, che dà a ogni paragrafo una texture leggermente più sicura rispetto al default del web.
- **Tracking negativo solo per i tipi display.** Le intestazioni da 20 px in su comprimono il tracking di -0,18 a -0,44 px per sembrare scolpite; le dimensioni del corpo rimangono a 0 tracking per la leggibilità.
- **Altezze di riga strette per i titoli, generose per il corpo.** I tipi display girano a 1,18–1,25 (stretto); corpo e didascalia si aprono a 1,43 per il comfort nella lettura estesa.
- **Nessun maiuscolo tranne a 8 px.** L'unica trasformazione maiuscola nel sistema è l'apice da 8 px — altrove, il maiuscolo di frase con sottili variazioni di peso fa il lavoro.

### Nota sui Sostituti dei Font
Airbnb Cereal VF è proprietario. Il sostituto open-source più vicino è **Circular Std** (ancora commerciale) o **Inter** (gratuito, Google Fonts) con la spaziatura lettere ridotta di -0,01 em alle dimensioni display. Per fedeltà rigorosa al brand, la catena di fallback documentata (`Circular, -apple-system, system-ui`) renderizza accettabilmente su macOS/iOS dove `system-ui` si risolve in San Francisco, che ha proporzioni simili.

## 4. Stili dei Componenti

### Pulsanti

**CTA Principale** ("Prenota", "Cerca", "Aggiungi date")
- Sfondo: Rausch `#ff385c`
- Testo: Canvas White `#ffffff`, Airbnb Cereal 500, 16 px
- Padding: ~14 px verticale, 24 px orizzontale
- Raggio: 8 px (rettangolare) o 50% (variante icona circolare)
- Bordo: nessuno
- Attivo/premuto: `transform: scale(0.92)` più un anello di focus da 2 px `#222222` a `0 0 0 2px`

**Pulsante Secondario** ("Diventa un host", azioni terziarie con bordo)
- Sfondo: `#ffffff`
- Testo: Ink Black `#222222`, Airbnb Cereal 500, 14–16 px
- Padding: 10 px 16 px
- Raggio: 20 px (pillola) o 8 px (rettangolare)
- Bordo: 1 px solid Hairline Gray `#dddddd`

**Pulsante Circolare Solo Icona** (freccia indietro, condividi, preferito, controlli carosello)
- Sfondo: `#f2f2f2` (bianco leggermente spento) o bianco con bordo nero traslucido da 1 px
- Icona: tratto contorno `#222222`, 16–20 px
- Dimensione: diametro 32–44 px
- Raggio: 50%
- Attivo/premuto: `transform: scale(0.92)`; anello bianco sottile da 4 px `0 0 0 4px rgb(255,255,255)` per separare dagli sfondi fotografici colorati

**Pulsante Disabilitato**
- Sfondo: `#f2f2f2`
- Testo: Stone Gray `#c1c1c1`
- Opacità: 0,5

**Pulsante Tab Pillola** (selettore categoria "Case / Esperienze / Servizi")
- Sfondo: trasparente
- Testo: Ink Black `#222222`, Airbnb Cereal 500, 16 px
- Padding: 8 px 14 px
- Stato attivo: sottolineatura Ink Black da 2 px sotto l'etichetta
- Abbinato a un'icona illustrata 3D renderizzata di 36–48 px sopra l'etichetta

### Schede & Contenitori

**Scheda Annuncio** (griglia homepage, risultati di ricerca)
- Sfondo: `#ffffff`
- Raggio: 14 px sull'immagine, il testo siede direttamente sotto su sfondo trasparente
- Immagine: rapporto 4:3, a tutta pagina, arrotondata con lo stesso raggio da 14 px
- Padding: nessuno sul contenitore esterno; 12 px di spaziatura tra immagine e righe di metadati
- Ombra: nessuna — la separazione viene dallo spazio bianco e dal raggio intrinseco della fotografia
- Schema metadati: Città/regione nella riga 1 (16 px 600), distanza/durata nella riga 2 (14 px 500 Ash Gray), intervallo di date nella riga 3, riga del prezzo con "per notte" in fondo

**Pannello di Prenotazione Pagina Dettaglio** (colonna destra fissa nelle pagine stanza/esperienza)
- Sfondo: `#ffffff`
- Raggio: 14–20 px
- Bordo: 1 px solid Hairline Gray `#dddddd`
- Ombra: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — un'elevazione sottile a tre strati sovrapposti
- Padding: 24 px
- Larghezza: ~370 px, ancorato 120–140 px sotto la parte superiore del viewport
- Contenuto: intestazione prezzo → selezionatore data → dropdown ospiti → CTA principale → nota "Non ti verrà addebitato nulla ancora"

**Scheda Griglia Servizi** (nelle pagine di dettaglio degli annunci)
- Sfondo: `#ffffff`
- Bordo: 1 px solid Hairline Gray `#dddddd` a livello di riga (non per elemento)
- Padding: 16 px verticale per riga di servizio
- Schema icona + etichetta: icona contorno da 24 px a sinistra, etichetta a peso 500 da 16 px a destra

**Scheda Recensione** (recensione individuale nelle pagine di dettaglio)
- Sfondo: `#ffffff`, nessun bordo
- Padding: 0 (si basa sui gap della griglia)
- Contenuto: avatar circolare da 40 px + nome a peso 600 da 16 px + data Ash Gray 400 da 14 px in una riga, poi paragrafo corpo a peso 500 da 14 px sotto

### Input & Form

**Barra di Ricerca** (homepage principale)
- Sfondo: `#ffffff`
- Bordo: 1 px solid Hairline Gray `#dddddd` che avvolge tutti e tre i segmenti (Dove / Quando / Chi)
- Raggio: 32 px (pillola completa)
- Ombra: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — sensazione galleggiante sottile
- Struttura: tre segmenti divisi da sottili divisori verticali, ogni segmento ha un'etichetta a peso 500 da 12 px sopra un segnaposto a peso 500 da 14 px
- Invio: pulsante icona circolare Rausch al bordo destro, diametro 48 px

**Input Testo** (form generici)
- Sfondo: `#ffffff`
- Bordo: 1 px solid Hairline Gray `#dddddd`
- Raggio: 8 px
- Padding: 14 px 16 px
- Focus: il bordo passa a Ink Black, aggiunge anello esterno nero `0 0 0 2px`
- Errore: il bordo passa a `#c13515` (Error Red), il testo di aiuto usa lo stesso colore

**Selezionatore di Date**
- Griglia calendario: layout a 7 colonne, celle giorno circolari `50%` larghe 40–44 px
- Intervallo selezionato: sfondo Ink Black `#222222` con cifre bianche
- Ancoraggi inizio/fine: cerchi riempiti più grandi; le date intermedie usano la tinta Soft Cloud `#f7f7f7`

### Navigazione

**Nav Superiore (Desktop)**
- Altezza: ~80 px
- Sfondo: `#ffffff`
- Sinistra: lockup wordmark+logo Airbnb in Rausch (102×32 px)
- Centro: selezionatore categoria a tre tab (Case / Esperienze / Servizi) con icone 3D di 36–48 px sovrapposte sopra etichette a peso 500 da 16 px; il tab attivo ha una sottolineatura Ink Black da 2 px
- Destra: link testuale "Diventa un host", poi globo circolare da 32 px (lingua), poi menu hamburger avatar da 36 px
- Bordo inferiore: 1 px solid Hairline Gray `#dddddd`

**Nav Superiore (Mobile)**
- Pillola di ricerca a riga singola occupa la larghezza completa: segnaposto "Inizia la tua ricerca" con piccola icona lente
- Sotto: il selezionatore di categoria a tre tab persiste (Case / Esperienze / Servizi) — le icone illustrate si rimpiccioliscono a ~28 px
- Barra tab fissa in basso: Esplora (stato attivo Rausch) / Wishlist / Accedi — icone da 24 px sopra etichette da 12 px

**Nav Secondaria Pagina Dettaglio Annuncio**
- Scorrimento orizzontale fisso di link anchor (Foto · Servizi · Recensioni · Posizione · Host) appare scorrendo oltre l'immagine hero
- Altezza: 56 px
- Bordo inferiore: 1 px solid Hairline Gray

### Trattamento delle Immagini

- **Rapporti di aspetto principali**: 4:3 per le griglie degli annunci in homepage, 16:9 per la fotografia hero delle esperienze, 1:1 per gli avatar
- **Raggio**: 14 px sulle immagini della griglia degli annunci, 20 px sui frame della foto hero nelle pagine di dettaglio, `50%` sugli avatar
- **Griglia immagini nelle pagine di dettaglio**: griglia a cinque foto con una singola immagine grande a sinistra (50% della larghezza) e quattro foto più piccole in una griglia 2×2 a destra, tutte condividono il contenitore arrotondato esterno da 20 px
- **Lazy loading**: uso intensivo di `loading="lazy"` con anteprime segnaposto sfocate
- **Carosello**: pulsanti freccia circolari da 32 px sovrapposti all'immagine, centrati verticalmente; gli indicatori a punti siedono 12 px sopra il bordo inferiore

### Componenti Firma

**Lockup Premio Preferito dagli Ospiti** (mostrato prominentemente nelle pagine di dettaglio degli annunci con alta valutazione)
- Numero di valutazione centrato renderizzato a 44–56 px con peso 700
- Due illustrazioni SVG di corona d'alloro disegnate a mano che fiancheggiano sinistra e destra a ~48 px di altezza
- Sotto: etichetta "Preferito dagli Ospiti" a 12 px 700 maiuscolo con tracking `0,32 px`, e una breve sotto-etichetta a 14 px 500 Ash Gray
- Blocco a larghezza piena, nessun bordo contenitore — siede direttamente su canvas bianca

**Selezionatore di Categoria a Tre Tab** (appare in cima a ogni superficie di navigazione)
- Tre tab: Case / Esperienze / Servizi
- Ogni tab: icona illustrata 3D renderizzata (~48 px di altezza) sopra l'etichetta a peso 500 da 16 px
- Esperienze e Servizi portano attualmente una piccola pillola "NUOVO" blu navy (testo bianco 12 px 700 su sfondo blu scuro) che galleggia in alto a destra dell'icona
- Tab attivo: sottolineatura Ink Black da 2 px sotto l'etichetta

**Griglia Città di Ispirazione** (homepage "Ispirazione per future fughe")
- Griglia a 6 colonne di link destinazione sul desktop, 2 colonne su mobile
- Ogni cella: nome città a 16 px 600 nella riga 1, sottotitolo tipo di affitto Ash Gray 500 da 14 px nella riga 2 ("Affitti cottage", "Affitti ville")
- Nessuna immagine — griglia solo testo
- Con tab sopra per categoria (Popolare / Arte & cultura / Spiaggia / Montagne / Outdoor / Cose da fare / Consigli di viaggio & ispirazione / Appartamenti Airbnb-friendly) — il tab attivo ha sottolineatura da 2 px e spostamento di peso

**Scheda Prenotazione Fissa** (pagine di dettaglio degli annunci)
- Rimane fissa 120 px sotto la parte superiore del viewport sul desktop mentre l'utente scorre oltre l'hero
- Si comprime in una barra inferiore a larghezza piena su mobile con un'etichetta "Da $X / notte" e una pillola Rausch "Prenota"
- Mostra sempre: intestazione prezzo → visualizzazione date → selettore ospiti → CTA Rausch → disclaimer "Non ti verrà addebitato nulla ancora"

**Scheda Host Esperienza** (pagine di dettaglio delle esperienze)
- Contenitore arrotondato a larghezza piena con una foto di copertina 3:2 in cima
- Avatar host (circolare, 56 px) che si sovrappone al bordo inferiore della copertina del 50%
- Sotto la sovrapposizione: nome host a 16 px 700, anzianità host a 14 px 500 Ash Gray, piccolo pulsante pillola Rausch "Contatta l'host"
- Usato come transizione tra le recensioni e il blocco servizi/posizione

**Striscia "Cose da sapere"** (pagine di dettaglio degli annunci)
- Griglia a 3 colonne di blocchi di regole/politiche (Regole della casa, Sicurezza e proprietà, Politica di cancellazione)
- Ogni colonna: icona in cima, intestazione a 16 px 600, corpo Ash Gray a 14 px 500, link "Mostra altro" in sottolineatura Ink Black
- Separatore: bordi superiore e inferiore da 1 px Hairline Gray sull'intera striscia

## 5. Principi di Layout

### Sistema di Spaziatura
- **Unità base**: 8 px
- **Scala estratta**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32 px — granulare con una manciata di valori fuori griglia usati per l'allineamento preciso delle icone
- **Padding di sezione**: ~48–64 px top/bottom sul desktop, 24–32 px su mobile
- **Padding interno schede**: 24 px nei pannelli di prenotazione e nelle schede grandi, 16 px nelle righe di servizi, 12 px nei metadati delle schede annuncio
- **Gutter tra schede annuncio**: 24 px desktop, 16 px mobile
- **Tra righe di testo sovrapposte**: 4–8 px (molto stretto — rafforza la sensazione di "informazioni dense" degli annunci di viaggio)

### Griglia & Contenitore
- **Larghezza massima del contenuto**: 1760–1920 px su ultra-wide (Airbnb lascia respirare la griglia più della maggior parte dei siti); 1280 px sulla maggior parte delle pagine di dettaglio
- **Griglia annunci homepage**: 6 colonne a ≥1760 px, 5 a ≥1440 px, 4 a ≥1128 px, 3 a ≥800 px, 2 a ≥550 px, 1 sotto
- **Pagina di dettaglio**: 2 colonne asimmetrica — contenuto principale ~58%, pannello di prenotazione fisso ~36% a destra, ~6% gutter
- **Footer**: 3 colonne Support / Hosting / Airbnb

### Filosofia dello Spazio Bianco
Airbnb è densamente informativo ma mai affollato. Lo spazio bianco è usato per *raggruppare* — le schede annuncio hanno 24 px di gutter così ogni fotografia si legge come un oggetto distinto, ma i metadati sotto ogni scheda usano gap di 4–8 px così il prezzo/città/data sembra un'unità singola. Il pannello di prenotazione della pagina di dettaglio ha 24 px di padding interno, ma le righe al suo interno (selezionatore date, selettore ospiti, CTA) sono impilate a 12 px — il confine tra la scheda e la pagina fa più lavoro di separazione del contenuto al suo interno.

### Scala dei Raggi di Bordo
| Raggio | Utilizzo |
|--------|-----|
| 4 px | Tag anchor inline, chip tag |
| 8 px | Pulsanti testo, dropdown, piccoli pulsanti utility |
| 14 px | Fotografia schede annuncio, contenitori di contenuto generici, badge |
| 20 px | Pulsanti arrotondati principali (forma pillola), immagini grandi, pannello di prenotazione |
| 32 px | Pillola barra di ricerca, contenitori extra-grandi |
| 50% | Tutti i pulsanti icona circolari, tutti gli avatar, cuori wishlist — la geometria rotonda caratteristica del sistema |

## 6. Profondità & Elevazione

| Livello | Trattamento | Utilizzo |
|-------|-----------|-----|
| 0 | Nessuna ombra | Schede annuncio, contenuto corpo, sezioni solo testo |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Pulsanti icona attivi/premuti (es. indietro, condividi, preferito) — sollevamento sottile per indicare interazione |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Scheda pannello di prenotazione fissa, modal, menu dropdown — l'elevazione caratteristica a tre strati del sistema |
| Anello Focus | `0 0 0 2px #222222` | Pulsanti in stato attivo, input di ricerca focalizzato |
| Anello Separatore Bianco | `rgb(255, 255, 255) 0 0 0 4px` | Pulsanti circolari sovrapposti alle fotografie — un anello bianco da 4 px separa nettamente il pulsante dagli sfondi fotografici colorati |

Filosofia delle ombre: Airbnb usa **ombre a strati sovrapposti** piuttosto che una singola ombra. L'ombra a tre strati del pannello di prenotazione si legge come un singolo sollevamento coeso ma in realtà è composta da tre ombre separate con diversi valori di opacità/sfocatura — creando un anti-aliasing sottile al perimetro dell'ombra che sembra premium senza essere pesante.

### Profondità Decorativa
- **La fotografia come profondità**: il sistema si affida pesantemente alla fotografia a tutta pagina per creare profondità visiva; ombre e gradienti sono usati con parsimonia così le fotografie fanno il lavoro pesante
- **Lockup corona d'alloro**: il premio Preferito dagli ospiti usa due illustrazioni SVG di alloro che danno al numero di valutazione altrimenti piatto una presenza cerimoniale, simile a un trofeo
- **Icone di categoria 3D renderizzate**: le icone Case/Esperienze/Servizi hanno la propria illuminazione interna morbida e sottili ombre proiettate incorporate nell'artwork — l'unico punto in cui il brand permette l'illustrazione "dimensionale"

## 7. Da Fare e Da Evitare

### Da Fare
- Riserva Rausch `#ff385c` per le azioni principali e l'indicatore del tab attivo — non diluirlo mai con usi decorativi.
- Lascia respirare la fotografia — ritagli 4:3 con angoli arrotondati di 14–20 px, nessun testo sovrapposto, nessun filtro gradiente.
- Usa Ink Black `#222222` per ogni livello di testo sotto Rausch — questo è il quasi-nero del sistema, mai il vero `#000000`.
- Abbina le icone 3D illustrate del selezionatore di categoria a tre tab con la tipografia piatta — non mescolare stili di illustrazione su una singola superficie.
- Sovrapponi tre ombre a bassa opacità (~2%, 4%, 10%) per creare l'elevazione caratteristica del pannello di prenotazione.
- Usa i bordi da 1 px Hairline Gray `#dddddd` per ogni divisore da scheda a scheda e da riga a riga.
- Tratta il pannello di prenotazione come fisso sul desktop, comprimendosi in una barra di prenotazione ancorata in basso su mobile.
- Usa spaziatura di 4–8 px all'interno dei gruppi di metadati e 24 px tra le schede — la densità delle informazioni è intenzionale.

### Da Evitare
- Non introdurre colori accento secondari al di fuori della palette per livello di prodotto Rausch / Plus Magenta / Luxe Purple.
- Non inserire testo nelle fotografie — le didascalie siedono sempre sotto l'immagine, mai sovrapposte.
- Non usare etichette in maiuscolo tranne per il singolo ruolo apice da 8 px.
- Non arrotondare i pulsanti icona a nulla di diverso da 50% — la circolarità è la geometria caratteristica del sistema.
- Non aggiungere ombre alle schede annuncio — siedono su canvas bianca senza elevazione.
- Non usare sfondi a gradiente — l'unico gradiente nel sistema è una stretta transizione Rausch → magenta sul wordmark.
- Non usare il peso di font 400-regular — il peso del corpo di Airbnb Cereal è 500.
- Non sostituire Airbnb Cereal VF con un diverso typeface display — il sistema è intenzionalmente a singola famiglia.

## 8. Comportamento Responsive

### Breakpoint

Airbnb dichiara ~60 breakpoint (artefatto di progettazione dalla sua libreria di componenti), ma i cambiamenti di layout significativi avvengono a un insieme molto più piccolo:

| Nome | Larghezza | Cambiamenti Chiave |
|------|-------|-------------|
| Ultra-wide | ≥1760 px | Griglia annunci a 6 colonne, larghezza massima contenuto 1760–1920 px |
| Desktop XL | 1440–1759 px | Griglia a 5 colonne, nav completa visibile, pannello di prenotazione fisso sulla colonna destra |
| Desktop | 1128–1439 px | Griglia a 4 colonne, pannello di prenotazione fisso persiste |
| Laptop | 1024–1127 px | Griglia a 3–4 colonne, nav categoria rimane orizzontale |
| Tablet | 800–1023 px | Griglia a 3 colonne, la ricerca globale può collassare in una singola pillola a riga |
| Tablet piccolo | 550–799 px | Griglia a 2 colonne, il pannello di prenotazione scende a blocco inline a larghezza piena |
| Mobile | 375–549 px | Layout a 1 colonna impilato, appare la barra tab fissa in basso (Esplora / Wishlist / Accedi) |
| Mobile piccolo | <375 px | Il padding laterale si stringe a 16 px; le icone del selezionatore categoria si rimpiccioliscono a ~28 px |

### Target Touch
Tutti gli elementi interattivi rispettano o superano i 44×44 px. La famiglia di pulsanti icona circolari è specificamente dimensionata 32–44 px con 8–12 px di padding esteso dell'area di hit. Il pulsante principale Rausch Prenota è ~48 px di altezza. L'area di hit del selezionatore di categoria a tre tab è il rettangolo completo etichetta-più-icona (tipicamente ~64×80 px per tab).

### Strategia di Collasso
- **Nav**: La nav superiore mantiene wordmark Airbnb + selezionatore a tre tab su tablet e superiori; su mobile il selezionatore scivola appena sotto la pillola di ricerca, e i controlli globo/avatar si spostano alla barra tab ancorata in basso.
- **Barra di ricerca**: Pillola a tre segmenti (Dove / Quando / Chi) con un pulsante di invio circolare Rausch sul desktop; collassa in una singola pillola "Inizia la tua ricerca" su mobile, il cui tocco apre un foglio di ricerca a schermo intero.
- **Pannello di prenotazione**: Colonna destra fissa a ≥1128 px; inline all'interno della colonna del contenuto principale tra 800–1127 px; pillola "Prenota" fissa in basso a <800 px.
- **Griglia annunci**: Ridispone 6 → 5 → 4 → 3 → 2 → 1 colonne attraverso i breakpoint.
- **Griglia immagini pagina di dettaglio**: Layout a cinque immagini (1 grande + 4 piccole) sul desktop; diventa un carosello a tutta pagina scorrevole su mobile con indicatori punto-pagina.
- **Footer**: Il layout a 3 colonne collassa a singola colonna impilata a <800 px.

### Comportamento delle Immagini
- `loading="lazy"` universale, con anteprime `im_w=` parametrizzate per URL sfocate servite per prime
- Le immagini responsive usano il CDN `muscache.com` di Airbnb con il parametro query `im_w` per la distribuzione basata sulla larghezza (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Nessun ritaglio art-direction — la stessa immagine viene scalata su/giù attraverso i breakpoint
- I caroselli auto-adattano l'altezza della foto per mantenere un rapporto 4:3 coerente indipendentemente dall'aspetto sorgente

## 9. Guida ai Prompt per l'Agente

### Riferimento Rapido Colori
- CTA principale: "Rausch (#ff385c)"
- Sfondo pagina: "Canvas White (#ffffff)"
- Sub-superficie: "Soft Cloud (#f7f7f7)"
- Testo intestazione/corpo: "Ink Black (#222222)"
- Testo secondario: "Ash Gray (#6a6a6a)"
- Bordo/divisore: "Hairline Gray (#dddddd)"
- Errore: "Error Red (#c13515)"
- Link informativo: "Info Blue (#428bff)"
- Accento livello Luxe: "Luxe Purple (#460479)"
- Accento livello Plus: "Plus Magenta (#92174d)"

### Esempi di Prompt per Componenti
- "Crea un pulsante Prenota principale: sfondo Rausch (`#ff385c`), etichetta bianca Airbnb Cereal 500 a 16 px, padding 14 px × 24 px, border-radius 8 px, nessuna ombra. Su attivo/premuto aggiungi `transform: scale(0.92)` con un anello di focus Ink Black da 2 px (`0 0 0 2px #222222`)."
- "Costruisci una scheda annuncio con una fotografia a tutta pagina 4:3 a 14 px di border-radius, nessuna ombra contenitore; sotto l'immagine impila tre righe di testo con gap di 4 px: nome città a 16 px 600 Ink Black, tipo di affitto a 14 px 500 Ash Gray (`#6a6a6a`), e fascia di prezzo a 16 px 500 Ink Black con un suffisso `per notte` a 14 px."
- "Progetta un pannello di prenotazione fisso: sfondo bianco, 14 px border-radius, bordo Hairline Gray (`#dddddd`) da 1 px, ombra elevazione a 3 strati (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), padding 24 px, larghezza 370 px, ancorato 120 px sotto la parte superiore del viewport sul desktop. Contenuto: intestazione prezzo, selezionatore date, dropdown ospiti, CTA principale Rausch e disclaimer Ash Gray da 12 px `Non ti verrà addebitato nulla ancora`."
- "Crea un selezionatore di categoria a tre tab: tre tab di uguale larghezza etichettati Case, Esperienze, Servizi; ogni tab ha un'icona illustrata 3D renderizzata di ~48 px (casa, mongolfiera, campanello) sopra un'etichetta Ink Black a peso 500 da 16 px; il tab attivo ottiene una sottolineatura Ink Black da 2 px; aggiungi una piccola pillola `NUOVO` bianca 12 px 700 su sfondo blu scuro in alto a destra delle icone Esperienze e Servizi."
- "Renderizza il lockup del premio Preferito dagli Ospiti: un numero di valutazione centrato a 52 px con peso 700 Ink Black, fiancheggiato a sinistra e a destra da corone d'alloro SVG disegnate a mano a ~48 px di altezza; sotto, un'etichetta maiuscola `PREFERITO DAGLI OSPITI` a 12 px 700 con tracking 0,32 px; sotto-etichetta a 14 px 500 Ash Gray; blocco a larghezza piena che siede direttamente su canvas bianca senza bordo contenitore."

### Guida all'Iterazione
Quando si perfezionano schermate esistenti generate con questo design system:
1. Concentrati su UN componente alla volta.
2. Fai riferimento a nomi di colori specifici e codici hex da questo documento (es. "Ink Black #222222", non "grigio scuro").
3. Usa descrizioni in linguaggio naturale insieme alle misure ("elevazione sottile a tre strati" invece di una lunga stringa di ombra).
4. Descrivi la "sensazione" desiderata ("stile magazine, fotografia prima" vs "utility densa").
5. Usa sempre Airbnb Cereal VF a peso 500 per il corpo e 600–700 per l'enfasi — mai 400.
6. Mantieni il rosa Rausch scarso — se più di un elemento colorato Rausch appare per viewport, considera se uno dovrebbe essere neutralizzato.

### Lacune Conosciute
- **Schede griglia annunci homepage**: la griglia principale delle schede proprietà (la superficie visiva principale di airbnb.com) non è stata catturata completamente negli screenshot della homepage estratti — il contenuto si è caricato solo parzialmente. Le specifiche delle schede annuncio sopra sono dedotte dalla struttura della griglia di ispirazione e dalle convenzioni più ampie di Airbnb; conferma i rapporti di aspetto esatti e la gerarchia dei metadati con il sito live prima dell'uso in produzione.
- **Icone categoria Esperienze**: le icone 3D illustrate per Case / Esperienze / Servizi sono servite come asset raster; le loro specifiche esatte del file sorgente (SVG vs PNG, dimensioni pixel renderizzate) non sono documentate qui.
- **Timing di animazione e transizione**: non catturati — ambito di estrazione statico.
- **Modalità scura**: Airbnb non fornisce una modalità scura nativa nelle superfici di prodotto estratte; questo documento descrive solo il singolo tema in modalità chiara.
