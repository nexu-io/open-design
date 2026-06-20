# Sistema di design ispirato a Pinterest

> Category: Media e consumatori
> Scoperta visiva. Accento rosso, griglia a muratura, immagine prima.

## 1. Tema visivo e atmosfera

Il sito web di Pinterest è una tela calda e ricca di ispirazione che tratta la scoperta visiva come una rivista di lifestyle. Il design si basa su uno sfondo bianco morbido e leggermente caldo con il Rosso Pinterest (`#e60023`) come unico e audace accento del brand. A differenza dei blu freddi della maggior parte delle piattaforme tecnologiche, la scala di neutri di Pinterest ha un sottotono decisamente caldo — i grigi tendono verso l'oliva/sabbia (`#91918c`, `#62625b`, `#e5e5e0`) piuttosto che verso l'acciaio freddo, creando un'atmosfera accogliente e artigianale che invita alla navigazione.

La tipografia usa Pin Sans — un carattere proprietario personalizzato con un'ampia pila di fallback che include caratteri giapponesi, a riflettere la portata globale di Pinterest. Alla scala display (70px, peso 600), Pin Sans crea titoli grandi e accoglienti. Nelle dimensioni più piccole, il sistema è compatto: bottoni a 12px, didascalie a 12–14px. Il sistema di denominazione delle variabili CSS (`--comp-*`, `--sema-*`, `--base-*`) rivela una sofisticata architettura di token di design a tre livelli: componente, semantico e base.

Ciò che distingue Pinterest è il suo generoso sistema di raggi dei bordi (12px–40px, più 50% per i cerchi) e gli sfondi dei bottoni con tonalità calda. Il bottone secondario (`#e5e5e0`) ha una tonalità sabbia distintamente calda piuttosto che grigio freddo. Il bottone rosso primario usa un raggio di 16px — arrotondato ma non a forma di pillola. Combinato con gli sfondi caldi dei badge (`hsla(60,20%,98%,.5)` — un sottile lavaggio giallo-caldo) e i layout dominati dalla fotografia, il risultato è un design che sembra artigianale e personale, non aziendale e sterile.

**Caratteristiche chiave:**
- Tela bianca calda con neutri nelle tonalità oliva/sabbia — accogliente, non clinico
- Rosso Pinterest (`#e60023`) come unico accento audace — mai sottile, sempre sicuro
- Carattere personalizzato Pin Sans con pila di fallback globale (incluso CJK)
- Architettura di token a tre livelli: `--comp-*` / `--sema-*` / `--base-*`
- Superfici secondarie calde: grigio sabbia (`#e5e5e0`), badge caldo (`hsla(60,20%,98%,.5)`)
- Raggio dei bordi generoso: 16px standard, fino a 40px per i contenitori grandi
- Contenuto con fotografia prima — i pin/immagini sono l'elemento visivo principale
- Testo quasi viola scuro (`#211922`) — caldo, con un tocco di prugna

## 2. Tavolozza dei colori e ruoli

### Brand principale
- **Rosso Pinterest** (`#e60023`): CTA primario, accento del brand — rosso audace e sicuro
- **Verde 700** (`#103c25`): `--base-color-green-700`, accento successo/natura
- **Verde 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, verde premuto

### Testo
- **Nero prugna** (`#211922`): Testo principale — quasi nero caldo con sottotono prugna
- **Nero** (`#000000`): Testo secondario, testo del bottone
- **Grigio oliva** (`#62625b`): Descrizioni secondarie, testo attenuato
- **Argento caldo** (`#91918c`): `--comp-button-color-text-transparent-disabled`, testo disabilitato, bordi di input
- **Bianco** (`#ffffff`): Testo su superfici scure/colorate

### Interattivo
- **Blu focus** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, anelli di focus
- **Viola performance** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, funzionalità di performance
- **Viola raccomandazione** (`#7e238b`): `--sema-color-hover-text-recommendation`, raccomandazione IA
- **Blu link** (`#2b48d4`): Colore del testo del link
- **Blu Facebook** (`#0866ff`): `--facebook-background-color`, accesso social
- **Blu premuto** (`#617bff`): `--base-color-pressed-blue-200`, stato premuto

### Superficie e bordo
- **Grigio sabbia** (`#e5e5e0`): Sfondo bottone secondario — caldo, artigianale
- **Luce calda** (`#e0e0d9`): Sfondi bottoni circolari, badge
- **Lavaggio caldo** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, sfondo badge caldo sottile
- **Nebbia** (`#f6f6f3`): Superficie chiara (al 50% di opacità)
- **Bordo disabilitato** (`#c8c8c1`): `--sema-color-border-disabled`, bordi disabilitati
- **Grigio hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, bordo al passaggio del cursore
- **Superficie scura** (`#33332e`): Sfondi delle sezioni scure

### Semantico
- **Rosso errore** (`#9e0a0a`): Stati di errore checkbox/modulo

## 3. Regole tipografiche

### Famiglia di caratteri
- **Principale**: `Pin Sans`, fallback: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Gerarchia

| Ruolo | Carattere | Dimensione | Peso | Altezza di riga | Spaziatura lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Impatto massimo |
| Titolo sezione | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Tracking negativo |
| Corpo | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Lettura standard |
| Didascalia grassetto | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Metadati forti |
| Didascalia | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Testo piccolo, tag |
| Bottone | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Etichette bottone |

### Principi
- **Scala tipografica compatta**: L'intervallo è 12px–70px con un salto drammatico — la maggior parte del testo funzionale è a 12–16px, creando una gerarchia di informazioni densa, simile a un'app.
- **Distribuzione del peso calda**: 600–700 per i titoli, 400–500 per il corpo. Nessun peso ultrasottile — il tipo sembra sempre sostanziale.
- **Tracking negativo nei titoli**: -1,2px nei titoli di 28px crea titoli di sezione accoglienti e intimi.
- **Famiglia di caratteri singola**: Pin Sans gestisce tutto — nessun carattere display secondario o a spaziatura fissa rilevato.

## 4. Stili dei componenti

### Bottoni

**Rosso primario**
- Sfondo: `#e60023` (Rosso Pinterest)
- Testo: `#000000` (nero — scelta insolita per il contrasto sul rosso)
- Padding: 6px 14px
- Raggio: 16px (generosamente arrotondato, non a pillola)
- Bordo: `2px solid rgba(255, 255, 255, 0)` (trasparente)
- Focus: bordo semantico + contorno tramite variabili CSS

**Sabbia secondario**
- Sfondo: `#e5e5e0` (grigio sabbia caldo)
- Testo: `#000000`
- Padding: 6px 14px
- Raggio: 16px
- Focus: stesso sistema di bordo semantico

**Azione circolare**
- Sfondo: `#e0e0d9` (luce calda)
- Testo: `#211922` (nero prugna)
- Raggio: 50% (cerchio)
- Uso: azioni pin, controlli di navigazione

**Ghost / Trasparente**
- Sfondo: trasparente
- Testo: `#000000`
- Nessun bordo
- Uso: azioni terziarie

### Schede e contenitori
- Schede pin con fotografia prima e raggio generoso (12px–20px)
- Nessuna ombra box tradizionale sulla maggior parte delle schede
- Sfondi bianchi o nebbia calda
- Bordo bianco spesso di 8px su alcuni contenitori di immagini

### Input
- Input email: sfondo bianco, bordo `1px solid #91918c`, raggio 16px, padding 11px 15px
- Focus: sistema di bordo semantico + contorno tramite variabili CSS

### Navigazione
- Intestazione pulita su sfondo bianco o caldo
- Logo Pinterest + barra di ricerca centrati
- Pin Sans 16px per i link di navigazione
- Accenti Rosso Pinterest per gli stati attivi

### Trattamento delle immagini
- Griglia a muratura stile pin (layout caratteristico di Pinterest)
- Angoli arrotondati: 12px–20px sulle immagini
- Fotografia come contenuto principale — ogni pin è un'immagine
- Bordi bianchi spessi (8px) sui contenitori delle immagini in evidenza

## 5. Principi di layout

### Sistema di spaziatura
- Unità base: 8px
- Scala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Salti grandi: 32px → 80px → 100px per la spaziatura delle sezioni

### Griglia e contenitore
- Griglia a muratura per il contenuto dei pin (layout caratteristico)
- Sezioni di contenuto centrate con larghezza massima generosa
- Footer scuro a larghezza intera
- Barra di ricerca come elemento di navigazione principale

### Filosofia degli spazi bianchi
- **Densità di ispirazione**: La griglia a muratura comprime i pin — la densità del contenuto È la proposta di valore. Lo spazio bianco esiste tra le sezioni, non all'interno della griglia.
- **Respira sopra, densità sotto**: Le sezioni hero/in evidenza ricevono padding generoso; la griglia dei pin è compatta e immersiva.

### Scala del raggio dei bordi
- Standard (12px): Schede piccole, link
- Bottone (16px): Bottoni, input, schede medie
- Comodo (20px): Schede in evidenza
- Grande (28px): Contenitori grandi
- Sezione (32px): Elementi tab, pannelli grandi
- Hero (40px): Contenitori hero, blocchi in evidenza grandi
- Cerchio (50%): Bottoni di azione, indicatori tab

## 6. Profondità ed elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra | Predefinito — i pin si affidano al contenuto, non all'ombra |
| Sottile (Livello 1) | Ombra minimale (dai token) | Overlay elevati, menu a tendina |
| Focus (Accessibilità) | Anello `--sema-color-border-focus-outer-default` | Stati di focus |

**Filosofia delle ombre**: Pinterest usa ombre minimali. La griglia a muratura si affida al contenuto (fotografia) per creare interesse visivo piuttosto che agli effetti di elevazione. La profondità deriva dal calore dei colori delle superfici e dall'arrotondamento generoso dei contenitori.

## 7. Da fare e da non fare

### Da fare
- Usare neutri caldi (`#e5e5e0`, `#e0e0d9`, `#91918c`) — il tono caldo oliva/sabbia è l'identità
- Applicare il Rosso Pinterest (`#e60023`) solo per i CTA principali — è audace e singolare
- Usare Pin Sans esclusivamente — un carattere per tutto
- Applicare raggio dei bordi generoso: 16px per bottoni/input, 20px+ per schede
- Mantenere la griglia a muratura densa — la densità del contenuto è il valore
- Usare sfondi badge caldi (`hsla(60,20%,98%,.5)`) per lavaggi caldi sottili
- Usare `#211922` (nero prugna) per il testo principale — più caldo del nero puro

### Da non fare
- Non usare neutri grigio freddi — sempre caldo/tonalità oliva
- Non usare il nero puro (`#000000`) come testo principale — usare il nero prugna (`#211922`)
- Non usare bottoni a forma di pillola — il raggio di 16px è arrotondato ma non a pillola
- Non aggiungere ombre pesanti — Pinterest è piatto per design, la profondità viene dal contenuto
- Non usare piccolo raggio dei bordi (<12px) sulle schede — l'arrotondamento generoso è essenziale
- Non introdurre colori del brand aggiuntivi — rosso + neutri caldi è la tavolozza completa
- Non usare pesi del carattere sottili — Pin Sans minimo 400

## 8. Comportamento responsivo

### Punti di interruzione
| Nome | Larghezza | Cambiamenti chiave |
|------|-------|-------------|
| Mobile | <576px | Colonna singola, layout compatto |
| Mobile grande | 576–768px | Griglia pin a 2 colonne |
| Tablet | 768–890px | Griglia espansa |
| Desktop piccolo | 890–1312px | Griglia a muratura standard |
| Desktop | 1312–1440px | Layout completo |
| Desktop grande | 1440–1680px | Colonne griglia espanse |
| Ultra wide | >1680px | Densità massima della griglia |

### Strategia di riduzione
- Griglia pin: 5+ colonne → 3 → 2 → 1
- Navigazione: barra di ricerca + icone → nav mobile semplificata
- Sezioni in evidenza: fianco a fianco → impilate
- Hero: 70px → scala proporzionalmente verso il basso
- Footer: scuro multicolonna → impilato

## 9. Guida ai prompt per agenti

### Riferimento rapido dei colori
- Brand: Rosso Pinterest (`#e60023`)
- Sfondo: Bianco (`#ffffff`)
- Testo: Nero prugna (`#211922`)
- Testo secondario: Grigio oliva (`#62625b`)
- Superficie bottone: Grigio sabbia (`#e5e5e0`)
- Bordo: Argento caldo (`#91918c`)
- Focus: Blu focus (`#435ee5`)

### Esempi di prompt per componenti
- "Creare un hero: sfondo bianco. Titolo a 70px Pin Sans peso 600, nero prugna (#211922). Bottone CTA rosso (#e60023, raggio 16px, padding 6px 14px). Bottone sabbia secondario (#e5e5e0, raggio 16px)."
- "Progettare una scheda pin: sfondo bianco, raggio 16px, nessuna ombra. La fotografia riempie la parte superiore, descrizione 16px Pin Sans peso 400 sotto in #62625b."
- "Costruire un bottone di azione circolare: sfondo #e0e0d9, raggio 50%, icona #211922."
- "Creare un campo di input: sfondo bianco, 1px solid #91918c, raggio 16px, padding 11px 15px. Focus: contorno blu tramite token semantici."
- "Progettare il footer scuro: sfondo #33332e. Logo script Pinterest in bianco. Link 12px Pin Sans in #91918c."

### Guida all'iterazione
1. Neutri caldi ovunque — grigi oliva/sabbia, mai acciaio freddo
2. Rosso Pinterest solo per i CTA — audace e singolare
3. Raggio di 16px su bottoni/input, 20px+ su schede — generoso ma non a pillola
4. Pin Sans è l'unico carattere — compatto a 12px per l'interfaccia, 70px per il display
5. La fotografia porta il design — l'interfaccia rimane calda e minimale
6. Nero prugna (#211922) per il testo — più caldo del nero puro
