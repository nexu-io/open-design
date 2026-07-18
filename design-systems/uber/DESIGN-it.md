# Design System Inspired by Uber

> Category: Media e Consumer
> Piattaforma di mobilità. Nero e bianco deciso, tipografia serrata, energia urbana.

## 1. Tema Visivo e Atmosfera

Il linguaggio visivo di Uber è una lezione magistrale di minimalismo sicuro di sé — un universo in bianco e nero dove ogni pixel ha uno scopo e nulla decora senza guadagnarselo. L'intera esperienza si fonda su una dualità netta: nero assoluto (`#000000`) e bianco puro (`#ffffff`), senza grigi intermedi che diluiscano il messaggio. Non è il minimalismo sterile di uno startup che non ha finito di progettare — è la sobrietà deliberata di un brand così consolidato da potersi permettere di sottovoce.

Il carattere tipografico distintivo, UberMove, è un geometric sans-serif proprietario con una qualità spiccatamente squadrata e ingegneristica. I titoli in UberMove Bold a 52px hanno il peso di un cartellone — autorevoli, diretti, senza scuse. Il companion UberMoveText gestisce testi di corpo e pulsanti con un carattere leggermente più morbido e leggibile a peso medio (500). Insieme creano un sistema tipografico che ricorda una mappa dei trasporti: chiaro, efficiente, fatto per essere letto di scorcio.

Ciò che rende il design di Uber davvero distintivo è l'uso di fotografie e illustrazioni a piena larghezza abbinate a elementi interattivi a forma di pillola (border-radius 999px). I chip di navigazione, i pulsanti CTA e i selettori di categoria condividono tutti questa forma a capsula, creando un linguaggio d'interfaccia tattile e thumb-friendly inconfondibilmente Uber. Le illustrazioni — scene calde, leggermente stilizzate di conducenti, passeggeri e paesaggi urbani — iniettano umanità in quello che altrimenti potrebbe essere un sistema freddo e monocromatico. Il sito alterna sezioni di contenuto bianche e un footer completamente nero, con layout a schede che usano le ombre più leggere possibili (rgba(0,0,0,0.12-0.16)) per creare una sottile elevazione senza compromettere l'estetica piatta.

**Caratteristiche Chiave:**
- Fondamenta in bianco e nero puro, virtualmente senza grigi intermedi nel chrome dell'interfaccia
- UberMove (titoli) + UberMoveText (corpo/UI) — famiglia geometric sans-serif proprietaria
- Tutto a forma di pillola: pulsanti, chip e voci di navigazione usano tutti border-radius 999px
- Illustrazioni calde e umane in contrasto con l'interfaccia monocromatica
- Layout a schede con ombre impercettibili (opacità 0.12-0.16)
- Griglia di spaziatura a 8px con layout compatti e densi di informazioni
- Fotografia audace integrata come sfondo hero a piena larghezza
- Footer nero che ancora la pagina con un ambiente scuro e ad alto contrasto

## 2. Palette Colori e Ruoli

### Primari
- **Uber Black** (`#000000`): Il colore brand definitivo — usato per pulsanti primari, titoli, testo di navigazione e il footer. Non "quasi-nero" o "nero spento", ma nero vero, senza compromessi.
- **Pure White** (`#ffffff`): Il colore di superficie primario e il testo inverso. Usato per sfondi di pagina, superfici di schede e testo su elementi neri.

### Stati Interattivi e Pulsanti
- **Hover Gray** (`#e2e2e2`): Stato hover del pulsante bianco — un grigio chiaro e freddo che fornisce un feedback chiaro senza aggiungere calore.
- **Hover Light** (`#f3f3f3`): Hover sottile per pulsanti bianchi elevati — un grigio appena percettibile per un feedback d'interazione delicato.
- **Chip Gray** (`#efefef`): Sfondo per pulsanti secondari/filtro e chip di navigazione — un grigio neutro e ultra-chiaro.

### Testo e Contenuti
- **Body Gray** (`#4b4b4b`): Testo secondario e link del footer — un grigio medio senza tendenze calde né fredde.
- **Muted Gray** (`#afafaf`): Testo terziario, link del footer de-enfatizzati e contenuti segnaposto.

### Bordi e Separazione
- **Border Black** (`#000000`): Bordi sottili da 1px per il contenimento strutturale — usati con parsimonia su divisori e contenitori di form.

### Ombre e Profondità
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Elevazione standard delle schede — una leggerezza impalpabile per le schede di contenuto.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Elevazione leggermente più forte per i pulsanti di azione flottanti e gli overlay.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Ombra interna per gli stati attivi/premuti sui pulsanti secondari.

### Stati dei Link
- **Default Link Blue** (`#0000ee`): Blu standard del browser per i link di testo con sottolineatura — usato nel contenuto del corpo.
- **Link White** (`#ffffff`): Link su superfici scure — usato nel footer e nelle sezioni scure.
- **Link Black** (`#000000`): Link su superfici chiare con decorazione a sottolineatura.

### Sistema dei Gradienti
- Il design di Uber è **completamente privo di gradienti**. La dualità bianco/nero e i blocchi di colore piatto creano tutta la gerarchia visiva. Nessun gradiente appare in alcun punto del sistema — ogni superficie è un colore solido, ogni transizione è un bordo netto o un'ombra.

## 3. Regole Tipografiche

### Famiglia di Font
- **Headline / Display**: `UberMove`, con fallback: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Body / UI**: `UberMoveText`, con fallback: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Nota: UberMove e UberMoveText sono caratteri tipografici proprietari. Per implementazioni esterne, usare `system-ui` o Inter come sostituto più vicino disponibile. Il carattere geometrico e dalle proporzioni squadrate di UberMove può essere approssimato con Inter o DM Sans.*

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza di Riga | Note |
|-------|------|------------|------|-----------------|------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (serrata) | Impatto massimo, presenza da cartellone |
| Titolo di Sezione | UberMove | 36px (2.25rem) | 700 | 1.22 (serrata) | Ancore delle sezioni principali |
| Titolo Scheda | UberMove | 32px (2rem) | 700 | 1.25 (serrata) | Titoli di schede e funzionalità |
| Sottotitolo | UberMove | 24px (1.5rem) | 700 | 1.33 | Intestazioni di sezione secondarie |
| Intestazione Piccola | UberMove | 20px (1.25rem) | 700 | 1.40 | Intestazioni compatte, titoli di elenchi |
| Nav / UI Grande | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Link di navigazione, testo UI prominente |
| Body / Button | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Testo di corpo standard, etichette pulsanti |
| Caption | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadati, descrizioni, link piccoli |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (ampia) | Note a piè di pagina, testo legale |

### Principi
- **Titoli in grassetto, corpo in medio**: I titoli UberMove sono esclusivamente a peso 700 (grassetto) — ogni titolo colpisce con la forza di un cartellone. Il corpo e il testo UI in UberMoveText usa 400-500, creando una chiara gerarchia visiva attraverso il contrasto di peso.
- **Altezze di riga compresse per i titoli**: Tutti i titoli usano altezze di riga tra 1.22 e 1.40 — compatte e incisive, pensate per la scansione visiva piuttosto che per la lettura.
- **Tipografia funzionale**: Non esistono trattamenti tipografici decorativi. Nessuna spaziatura tra lettere, nessun text-transform, nessuna dimensione ornamentale. Ogni elemento di testo serve uno scopo comunicativo diretto.
- **Due font, ruoli rigidi**: UberMove è esclusivamente per i titoli. UberMoveText è esclusivamente per il corpo, i pulsanti, i link e l'UI. Il confine non viene mai infranto.

## 4. Stili dei Componenti

### Pulsanti

**Primario Nero (CTA)**
- Background: Uber Black (`#000000`)
- Testo: Pure White (`#ffffff`)
- Padding: 10px 12px
- Radius: 999px (pillola completa)
- Outline: none
- Focus: anello interno `rgb(255,255,255) 0px 0px 0px 2px`
- Il pulsante di azione primaria — audace, ad alto contrasto, impossibile da ignorare

**Secondario Bianco**
- Background: Pure White (`#ffffff`)
- Testo: Uber Black (`#000000`)
- Padding: 10px 12px
- Radius: 999px (pillola completa)
- Hover: il background vira su Hover Gray (`#e2e2e2`)
- Focus: il background vira su Hover Gray, appare l'anello interno
- Usato su superfici scure o come azione secondaria accanto al Primario Nero

**Chip / Filtro**
- Background: Chip Gray (`#efefef`)
- Testo: Uber Black (`#000000`)
- Padding: 14px 16px
- Radius: 999px (pillola completa)
- Attivo: ombra interna `rgba(0,0,0,0.08)`
- Chip di navigazione, selettori di categoria, toggle di filtro

**Azione Flottante**
- Background: Pure White (`#ffffff`)
- Testo: Uber Black (`#000000`)
- Padding: 14px
- Radius: 999px (pillola completa)
- Ombra: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` leggero offset
- Hover: il background vira su `#f3f3f3`
- Controlli mappa, scroll-to-top, CTA flottanti

### Schede e Contenitori
- Background: Pure White (`#ffffff`) su pagine bianche; nessuna differenziazione distinta del background delle schede
- Bordo: nessuno di default — le schede sono definite dall'ombra, non dal tratto
- Radius: 8px per le schede di contenuto standard; 12px per le schede in evidenza/promosse
- Ombra: `rgba(0,0,0,0.12) 0px 4px 16px 0px` per l'elevazione standard
- Le schede sono dense di contenuto con un padding interno minimo
- Le schede guidate dall'immagine usano immagini a piena larghezza con testo sovrapposto o sottostante

### Input e Form
- Testo: Uber Black (`#000000`)
- Background: Pure White (`#ffffff`)
- Bordo: 1px solid Black (`#000000`) — l'unico punto in cui i bordi visibili appaiono in modo prominente
- Radius: 8px
- Padding: spaziatura confortevole standard
- Focus: nessuno stato di focus personalizzato estratto — si basa sull'anello di focus standard del browser

### Navigazione
- Navigazione superiore sticky con sfondo bianco
- Logo: wordmark/icona Uber a 24x24px in nero
- Link: UberMoveText a 14-18px, peso 500, in Uber Black
- Chip di navigazione a forma di pillola con sfondo Chip Gray (`#efefef`) per la navigazione per categoria ("Ride", "Drive", "Business", "Uber Eats")
- Toggle del menu: pulsante circolare con border-radius 50%
- Mobile: pattern menu hamburger

### Trattamento delle Immagini
- Scene illustrate a mano, calde (non fotografie per le sezioni feature)
- Stile illustrativo: persone leggermente stilizzate, palette cromatica calda nelle illustrazioni, atmosfera contemporanea
- Le sezioni hero usano fotografia audace o illustrazione come sfondi a piena larghezza
- Codici QR per i CTA di download dell'app
- Tutte le immagini usano border-radius standard di 8px o 12px quando contenute in schede

### Componenti Distintivi

**Navigazione a Pillola per Categoria**
- Fila orizzontale di pulsanti a forma di pillola per la navigazione di primo livello ("Ride", "Drive", "Business", "Uber Eats", "About")
- Ogni pillola: sfondo Chip Gray, testo nero, radius 999px
- Lo stato attivo è indicato da sfondo nero con testo bianco (inversione)

**Hero con Doppia Azione**
- Hero diviso: testo/CTA a sinistra, mappa/illustrazione a destra
- Due campi di input affiancati per partenza/destinazione
- Pulsante CTA "See prices" in pillola nera

**Schede Plan-Ahead**
- Schede che promuovono funzionalità come "Uber Reserve" e la pianificazione del viaggio
- Ricche di illustrazioni con immagini calde e centrate sull'essere umano
- Pulsanti CTA neri con testo bianco in fondo

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Padding pulsanti: 10px 12px (compatto) o 14px 16px (confortevole)
- Padding interno schede: circa 24-32px
- Spaziatura verticale delle sezioni: generosa ma efficiente — circa 64-96px tra le sezioni principali

### Griglia e Contenitore
- Larghezza massima del contenitore: circa 1136px, centrata
- Hero: layout diviso con testo a sinistra, elemento visivo a destra
- Sezioni feature: griglie a 2 colonne o a colonna singola a piena larghezza
- Footer: griglia di link multicolonna su sfondo nero
- Sezioni a piena larghezza che si estendono fino ai bordi del viewport

### Filosofia degli Spazi Bianchi
- **Efficiente, non arioso**: lo spazio bianco di Uber è funzionale — abbastanza per separare, mai abbastanza da sembrare vuoto. È la spaziatura di un sistema di trasporto: compatta, chiara, orientata allo scopo.
- **Schede dense di contenuto**: le schede comprimono le informazioni con una spaziatura interna minima, affidandosi a ombra e radius per definire i confini.
- **Respiro delle sezioni**: le sezioni principali ricevono una spaziatura verticale generosa, ma all'interno delle sezioni gli elementi sono raggruppati in modo compatto.

### Scala dei Border Radius
- Spigoloso (0px): nessuno spigolo vivo usato negli elementi interattivi
- Standard (8px): schede di contenuto, campi di input, listbox
- Confortevole (12px): schede in evidenza, contenitori più grandi, schede link
- Pillola Completa (999px): tutti i pulsanti, chip, voci di navigazione, pillole
- Circolare (50%): immagini avatar, contenitori icona, controlli circolari

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|---------|-------------|-----|
| Piatto (Livello 0) | Nessuna ombra, sfondo solido | Sfondo pagina, contenuto inline, sezioni di testo |
| Sottile (Livello 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Schede di contenuto standard, blocchi feature |
| Medio (Livello 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Schede elevate, elementi overlay |
| Flottante (Livello 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Pulsanti di azione flottanti, controlli mappa |
| Premuto (Livello 4) | `rgba(0,0,0,0.08) inset` (spread 999px) | Stati attivi/premuti dei pulsanti |
| Anello di Focus | `rgb(255,255,255) 0px 0px 0px 2px inset` | Indicatori di focus da tastiera |

**Filosofia delle Ombre**: Uber usa le ombre esclusivamente come strumento strutturale, mai decorativo. Le ombre sono sempre nere a opacità molto bassa (0.08-0.16), creando la minima separazione necessaria a distinguere i livelli di contenuto. I raggi di sfumatura sono moderati (8-16px) — abbastanza da sembrare naturali, mai drammatici. Non esistono ombre colorate, stack di ombre sovrapposti o effetti di luce ambientale. La profondità è comunicata più attraverso il contrasto tra sezioni nere e bianche che attraverso l'elevazione delle ombre.

## 7. Cosa Fare e Cosa Non Fare

### Fare
- Usare il nero vero (`#000000`) e il bianco puro (`#ffffff`) come palette primaria — il contrasto netto È Uber
- Usare border-radius 999px per tutti i pulsanti, i chip e gli elementi di navigazione a pillola
- Mantenere tutti i titoli in UberMove Bold (700) per un impatto da cartellone
- Usare ombre impercettibili (opacità 0.12-0.16) per l'elevazione delle schede — appena visibili
- Mantenere lo stile di layout compatto e denso di informazioni — Uber privilegia l'efficienza rispetto all'ariosità
- Usare illustrazioni calde e centrate sull'essere umano per ammorbidire l'interfaccia monocromatica
- Applicare radius 8px per le schede di contenuto e 12px per i contenitori in evidenza
- Usare UberMoveText a peso 500 per la navigazione e il testo UI prominente
- Abbinare pulsanti primari neri con secondari bianchi per layout a doppia azione

### Non Fare
- Non introdurre colore nel chrome dell'interfaccia — l'interfaccia di Uber è rigorosamente in nero, bianco e grigio
- Non usare angoli arrotondati inferiori a 999px sui pulsanti — la forma a pillola intera è un elemento identitario fondamentale
- Non applicare ombre pesanti o drop shadow ad alta opacità — la profondità è impercettibile
- Non usare font serif da nessuna parte — la tipografia di Uber è esclusivamente geometric sans-serif
- Non creare layout ariosi e spaziosi con eccessivo spazio bianco — la densità di Uber è intenzionale
- Non usare gradienti o overlay colorati — ogni superficie è un colore piatto e solido
- Non mischiare UberMove nel testo di corpo né UberMoveText nei titoli — la gerarchia è rigida
- Non usare bordi decorativi — i bordi sono funzionali (input, divisori) o assenti
- Non attenuare il contrasto nero/bianco con bianchi sporchi o neri quasi-neri — la dualità è deliberata

## 8. Comportamento Responsive

### Breakpoint
| Nome | Larghezza | Cambiamenti Principali |
|------|-----------|------------------------|
| Mobile Small | 320px | Layout minimo, colonna singola, input impilati, tipografia compatta |
| Mobile | 600px | Mobile standard, layout impilato, nav hamburger |
| Tablet Small | 768px | Le griglie a 2 colonne iniziano, layout a schede espansi |
| Tablet | 1119px | Layout tablet completo, contenuto hero affiancato |
| Desktop Small | 1120px | La griglia desktop si attiva, pillole nav orizzontali |
| Desktop | 1136px | Layout desktop completo, larghezza massima del contenitore, hero diviso |

### Target di Tocco
- Tutti i pulsanti a pillola: altezza minima 44px (padding verticale 10-14px + line-height)
- Chip di navigazione: padding generoso 14px 16px per un comodo tapping con il pollice
- Controlli circolari (menu, chiudi): il radius 50% garantisce target grandi e facili da toccare
- Le superfici delle schede fungono da aree di tocco complete su mobile

### Strategia di Collasso
- **Navigazione**: la nav orizzontale a pillola collassa in menu hamburger con toggle circolare
- **Hero**: il layout diviso (testo + mappa/visuale) si impila in colonna singola — testo sopra, visuale sotto
- **Campi di input**: gli input affiancati partenza/destinazione si impilano verticalmente
- **Schede feature**: la griglia a 2 colonne collassa in schede impilate a piena larghezza
- **Titoli**: il display a 52px scala verso il basso attraverso 36px, 32px, 24px, 20px
- **Footer**: la griglia di link multicolonna collassa in accordion o colonna singola impilata
- **Pillole di categoria**: scroll orizzontale con overflow su schermi più piccoli

### Comportamento delle Immagini
- Le illustrazioni si scalano proporzionalmente all'interno dei loro contenitori
- Le immagini hero mantengono il rapporto d'aspetto, con possibilità di ritaglio su schermi più piccoli
- Le sezioni con codice QR si nascondono su mobile (il download dell'app si sposta su link diretti agli store)
- Le immagini delle schede mantengono border-radius di 8-12px a tutte le dimensioni

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido ai Colori
- Pulsante Primario: "Uber Black (#000000)"
- Sfondo Pagina: "Pure White (#ffffff)"
- Testo Pulsante (su nero): "Pure White (#ffffff)"
- Testo Pulsante (su bianco): "Uber Black (#000000)"
- Testo Secondario: "Body Gray (#4b4b4b)"
- Testo Terziario: "Muted Gray (#afafaf)"
- Sfondo Chip: "Chip Gray (#efefef)"
- Stato Hover: "Hover Gray (#e2e2e2)"
- Ombra Scheda: "rgba(0,0,0,0.12) 0px 4px 16px"
- Sfondo Footer: "Uber Black (#000000)"

### Esempi di Prompt per Componenti
- "Crea una sezione hero su Pure White (#ffffff) con un titolo a 52px UberMove Bold (700), line-height 1.23. Usa testo Uber Black (#000000). Aggiungi un sottotitolo in Body Gray (#4b4b4b) a 16px UberMoveText peso 400 con line-height 1.50. Posiziona un pulsante CTA a pillola Uber Black (#000000) con testo Pure White, radius 999px, padding 10px 12px."
- "Progetta una barra di navigazione per categoria con pulsanti a pillola orizzontali. Ogni pillola: sfondo Chip Gray (#efefef), testo Uber Black (#000000), padding 14px 16px, border-radius 999px. La pillola attiva si inverte con sfondo Uber Black e testo Pure White. Usa UberMoveText a 14px peso 500."
- "Costruisci una scheda feature su Pure White (#ffffff) con border-radius 8px e ombra rgba(0,0,0,0.12) 0px 4px 16px. Titolo in UberMove a 24px peso 700, descrizione in Body Gray (#4b4b4b) a 16px UberMoveText. Aggiungi un pulsante CTA a pillola nera in fondo."
- "Crea un footer scuro su Uber Black (#000000) con testo dei titoli Pure White (#ffffff) in UberMove a 20px peso 700. Link del footer in Muted Gray (#afafaf) a 14px UberMoveText. I link al hover diventano Pure White. Layout a griglia multicolonna."
- "Progetta un pulsante di azione flottante con sfondo Pure White (#ffffff), radius 999px, padding 14px e ombra rgba(0,0,0,0.16) 0px 2px 8px. Al hover il background vira su #f3f3f3. Da usare per scroll-to-top o controlli mappa."

### Guida all'Iterazione
1. Concentrarsi su UN componente alla volta
2. Fare riferimento alla palette rigorosa in bianco e nero — "usa Uber Black (#000000)" non "rendilo scuro"
3. Specificare sempre radius 999px per pulsanti e pillole — è non negoziabile per l'identità Uber
4. Descrivere la famiglia di font esplicitamente — "UberMove Bold per il titolo, UberMoveText Medium per l'etichetta"
5. Per le ombre, usare "ombra impercettibile (rgba(0,0,0,0.12) 0px 4px 16px)" — mai drop shadow pesanti
6. Mantenere i layout compatti e densi di informazioni — Uber è efficiente, non arioso
7. Le illustrazioni devono essere calde e umane — descrivere "persone stilizzate in toni caldi" non forme astratte
8. Abbinare CTA neri con secondari bianchi per layout a doppia azione equilibrati
