# Design System Inspired by Discord

> Category: Produttività e SaaS
> Piattaforma vocale e di chat. Blurple intenso, superfici dark-first, momenti d'accento giocosi.

## 1. Tema Visivo e Atmosfera

Il prodotto Discord è progettato per serate, raid e chat vocali di gruppo — quindi l'intera superficie è dark-first. La canvas predefinita è il profondo `Background Primary` (`#313338` tema chiaro, `#1e1f22` tema scuro), con colonne di chat stratificate su tonalità leggermente più chiare o più scure per indicare canali, thread e pannelli laterali. Il caratteristico **Blurple** (`#5865f2`) è riservato al marchio, alle CTA primarie, alle menzioni e all'indicatore "tu" — usato con parsimonia per risaltare sui neutri attenuati.

La tipografia è **gg sans** (il sostituto personalizzato di Whitney di Discord) per il testo e il chrome, con forme geometriche arrotondate che risultano accessibili pur mantenendo la leggibilità alle piccole dimensioni richieste da un client di chat. I titoli scalano in modo incrementale; le righe di chat sono compatte (4–8px tra i gruppi di messaggi) affinché ore di scorrimento risultino facilmente analizzabili.

Il linguaggio delle forme è arrotondato ma non morbido come un palloncino: raggio di 8px sulle card, 4px sugli input, pillole complete su badge di stato e tag. I server hanno avatar con angoli arrotondati da 48px che si trasformano in cerchi al passaggio del mouse — un piccolo dettaglio in movimento che è diventato parte dell'identità del brand.

**Caratteristiche Chiave:**
- Superfici dark-first: `#1e1f22` / `#2b2d31` / `#313338` (profondità a 3 livelli)
- Blurple `#5865f2` come unico accento saturo nella superficie di chat
- gg sans (stile Whitney) per tutto il testo — amichevole, geometrico, neutro
- Avatar dei server a quadrato arrotondato (raggio 16px) che si trasformano in cerchi al passaggio del mouse
- Spaziatura compatta tra le righe di chat, padding generoso nel pannello laterale
- Indicatori di stato: verde online, giallo inattivo, rosso non disturbare, grigio offline
- Divisori da 1px allineati al pixel in bianco attenuato a bassa opacità

## 2. Palette Colori e Ruoli

### Primari
- **Blurple** (`#5865f2`): Primario del brand, CTA primaria, evidenziazione delle menzioni.
- **Blurple Hover** (`#4752c4`): Hover/attivo per il blurple.
- **Blurple Soft** (`#7289da`): Blurple legacy, accento secondario nel marketing.

### Superficie (Tema Scuro — predefinito)
- **Background Tertiary** (`#1e1f22`): Barra lista server, sfondo più profondo.
- **Background Secondary** (`#2b2d31`): Barra laterale canali, barra laterale impostazioni.
- **Background Primary** (`#313338`): Superficie di chat, colonna messaggi.
- **Background Floating** (`#111214`): Popover flottanti, tooltip, completamento automatico.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Overlay hover sulle righe.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Riga attiva.

### Superficie (Tema Chiaro)
- **Light Bg Primary** (`#ffffff`): Superficie di chat nel tema chiaro.
- **Light Bg Secondary** (`#f2f3f5`): Barra laterale nel tema chiaro.
- **Light Bg Tertiary** (`#e3e5e8`): Superficie chiara più profonda.

### Testo
- **Header Primary** (`#f2f3f5`): Intestazioni dei canali, titoli modali nel tema scuro.
- **Header Secondary** (`#b5bac1`): Intestazioni attenuate.
- **Text Normal** (`#dbdee1`): Testo corpo nel tema scuro — leggermente più freddo del bianco puro.
- **Text Muted** (`#949ba4`): Timestamp, nomi server, metadati secondari.
- **Text Link** (`#00a8fc`): Hyperlink nei messaggi — blu cielo, distinto dal blurple.
- **Channels Default** (`#80848e`): Nome canale inattivo nella barra laterale.

### Stato e Semantica
- **Status Online** (`#23a55a`): Indicatore online, stati di successo.
- **Status Idle** (`#f0b232`): Indicatore inattivo, assente.
- **Status DND** (`#f23f43`): Non disturbare, utilizzato anche come rosso distruttivo.
- **Status Streaming** (`#593695`): Viola "in streaming".
- **Status Offline** (`#80848e`): Grigio offline.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Sfondo blurple tenue sulle righe con @menzione.

### Bordo e Divisori
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Divisore standard nel tema scuro.
- **Border Subtle** (`#3f4147`): Divisore solido per le card.

## 3. Regole Tipografiche

### Famiglia di Font
- **Corpo / UI / Intestazioni**: `gg sans`, con fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (legacy / Whitney)**: `Whitney`, con fallback: `gg sans`
- **Codice / Mono**: `"gg mono"`, con fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza riga | Spaziatura lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero marketing |
| Intestazione pagina | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Titoli impostazioni/profilo |
| Nome canale | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, intestazione canale |
| Corpo messaggio | gg sans | 16px (1rem) | 400 | 1.375 | normal | Testo chat standard |
| Nome utente | gg sans | 16px (1rem) | 500 | 1.25 | normal | Autore di un messaggio |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Oggi alle 16:32" |
| Canale barra laterale | gg sans | 16px (1rem) | 500 | 1.25 | normal | Righe lista canali |
| Nome server | gg sans | 16px (1rem) | 600 | 1.25 | normal | Intestazione server |
| Didascalia / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Testo di stato, tag modificato |
| Codice inline | gg mono | 0.875em | 400 | inherit | normal | `code` inline |
| Blocco codice | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Blocco ```triple-fenced``` |

### Principi
- **Geometria amichevole**: gg sans sostituisce Whitney con terminali arrotondati su a/g/s — il brand vuole calore senza compromettere la leggibilità.
- **Contrasto di peso anziché di colore**: la gerarchia si ottiene tramite passaggi di peso 400→500→600→700→800; la superficie rimane neutra.
- **Corpo a 16px**: i messaggi di chat non scendono sotto i 16px. La densità si ottiene tramite l'altezza della riga (1.375), non la dimensione del font.

## 4. Stili dei Componenti

### Bottoni

**Primario**
- Background: `#5865f2`
- Testo: `#ffffff`
- Padding: 8px 16px
- Raggio: 4px
- Hover: `#4752c4`
- Utilizzo: CTA primarie, "Continua", "Unisciti al Server"

**Secondario**
- Background: `#4e5058`
- Testo: `#ffffff`
- Padding: 8px 16px
- Raggio: 4px
- Hover: `#6d6f78`

**Terziario / Sottile (stile link)**
- Background: transparent
- Testo: `#dbdee1`
- Hover: testo sottolineato, nessun cambiamento di sfondo

**Pericoloso**
- Background: `#da373c`
- Testo: `#ffffff`
- Hover: `#a12d2f`

### Input
- Background: `#1e1f22`
- Testo: `#dbdee1`
- Bordo: 1px solid `#1e1f22`
- Raggio: 4px
- Padding: 10px 12px
- Focus: bordo `#5865f2`

### Avatar dei Server
- Dimensione: 48×48px
- Raggio: 16px (quadrato arrotondato) per impostazione predefinita; transizione a 50% al passaggio del mouse e in stato attivo.
- Stato attivo: pillola bianca da 4px sul bordo sinistro della colonna icone.

### Indicatori di Stato
- Dimensione: 10×10px
- Bordo: 3px solid background-tertiary (crea l'effetto "tacca")
- Posizione: in basso a destra dell'avatar.

### Card / Embed
- Background: `#2b2d31` (scuro) o `#f2f3f5` (chiaro)
- Bordo sinistro: 4px solid colore accento dell'embed.
- Raggio: 4px
- Padding: 8px 16px

### Pillola di Menzione
- Background: `rgba(88, 101, 242, 0.3)`
- Testo: `#c9cdfb`
- Padding: 0 2px
- Raggio: 3px

## 5. Spaziatura e Layout

- **Unità base**: 4px. Scala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Barra server**: larghezza 72px, fissa.
- **Barra laterale canali**: larghezza 240px.
- **Lista membri**: larghezza 240px su desktop.
- **Colonna chat**: fluida, min 380px.

## 6. Animazione

- **Durata**: 200ms per hover; 350ms per la trasformazione in cerchio dell'avatar; 80ms per la comparsa del tooltip.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` per la trasformazione dell'avatar (scatto iniziale poi assestamento).
- **Pulsazione notifica**: 1.4s ease-in-out infinite sull'indicatore di menzione non letta.

## 7. Linee Guida d'Uso

- Preservare insieme il guscio scuro, la densità compatta e la gerarchia delle azioni blurple; usare il blurple su un layout marketing in stile chiaro rompe la sensazione del prodotto Discord.
- Mantenere le superfici con navigazione complessa strutturate attorno a barre, barre laterali e colonne di chat, anziché card decorative isolate.
- Utilizzare il linguaggio degli avatar a quadrato arrotondato e degli indicatori di stato per rappresentare persone, server o presenza attiva.
