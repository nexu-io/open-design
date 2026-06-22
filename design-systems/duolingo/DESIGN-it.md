# Sistema di design ispirato a Duolingo

> Category: Produttività e SaaS
> Piattaforma di apprendimento delle lingue. Verde gufo brillante, ombre spesse, gioia gamificata.

## 1. Tema visivo e atmosfera

Duolingo è la gamificazione resa come linguaggio visivo. L'interfaccia è senza riserve luminosa, con il **verde gufo** (`#58cc02`) come colore primario del brand e una spessa ombra di 4px nella parte inferiore di ogni elemento interattivo, che si legge come un pulsante 3D in attesa di essere premuto. La pagina è bianca (`#ffffff`) con bordi spessi di 2–3px in grigio scuro (`#e5e5e5`), e l'intero sistema si legge come un'app iOS del 2015 rinata con una gerarchia migliore.

La tipografia usa **Feather Bold** (un sans-serif arrotondato personalizzato) per il chrome e **Mona Sans** (o Inter) per il corpo del testo. Le dimensioni display sono grandi e sicure — Duolingo non sussurra mai. I titoli portano spesso il tratto sottolineato verde o siedono su una pillola verde, e la mascotte Duo (un gufo verde) appare come un personaggio illustrativo attivo, non come un logo statico.

Il linguaggio delle forme è amichevole: raggi di 16–20px sulle schede, 12px sui pulsanti, 9999px su chip e barre di avanzamento. L'iconografia è piena, arrotondata e codificata per colore per competenza — ogni superficie di lezione ha una combinazione di colori immediatamente identificabile.

**Caratteristiche principali:**
- Verde gufo (`#58cc02`) come colore di brand dominante, usato in oltre il 30% della superficie
- Spessa ombra inferiore di 4px su ogni pulsante (l'affordance della "pressione tattile")
- Bordi solidi di 2–3px, mai linee sottili
- Feather Bold (display arrotondato) + Mona Sans (corpo)
- Testo grande e sicuro — le dimensioni display partono da 48px e salgono
- Mascotte come personaggio: Duo il gufo appare nell'onboarding, negli errori, nelle serie
- Arancione serie (`#ff9600`) e rosa gemma (`#ce82ff`) come colori di brand secondari

## 2. Palette colori e ruoli

### Primario
- **Verde gufo** (`#58cc02`): Primario brand, CTA principale, risposta corretta.
- **Verde gufo scuro** (`#58a700`): Colore di pressione/ombra per i pulsanti verdi.
- **Verde gufo chiaro** (`#89e219`): Hover, riempimenti morbidi.
- **Verde gufo pallido** (`#dbf8c5`): Superficie morbida, banner di successo.

### Accenti secondari
- **Arancione serie** (`#ff9600`): Contatore serie, icona fiamma, energia premium.
- **Arancione serie scuro** (`#cc7a00`): Arancione premuto.
- **Rosa gemma** (`#ce82ff`): Valuta gemma, Super Duolingo.
- **Blu anguilla** (`#1cb0f6`): Pulsante suggerimento, link informativo.
- **Rosso cardinale** (`#ff4b4b`): Risposta errata, vita persa.
- **Giallo ape** (`#ffc800`): Badge pro, risultato.

### Superficie
- **Neve** (`#ffffff`): Sfondo principale.
- **Anguilla** (`#f7f7f7`): Separazione sezione, superficie secondaria.
- **Cigno** (`#e5e5e5`): Sfondo disabilitato, blocco incorporato.
- **Lupo** (`#777777`): Divisore scuro, testo secondario.

### Inchiostro e testo
- **Nero anguilla** (`#3c3c3c`): Testo principale.
- **Lupo** (`#777777`): Testo secondario, didascalie.
- **Lepre** (`#afafaf`): Disabilitato, segnaposto.

### Bordo
- **Cigno** (`#e5e5e5`): Bordo standard 2px.
- **Lepre** (`#afafaf`): Bordo enfatizzato all'hover.

## 3. Regole tipografiche

### Famiglia di font
- **Display / UI / Titoli**: `Feather Bold`, con fallback: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Corpo / Testo lungo**: `Mona Sans`, con fallback: `'Helvetica Neue', system-ui, sans-serif`
- **Codice (raro, scuole/admin)**: `JetBrains Mono`, con fallback: `ui-monospace, Menlo, monospace`

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza riga | Spaziatura | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Eroe onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Titolo pagina |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Intestazione sezione |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Titolo scheda, riga lezione |
| Corpo grande | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Prompt lezione, istruzione |
| Corpo | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Prosa standard |
| Didascalia | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Contatore XP, metadati |
| Pulsante | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Etichetta pulsante standard |
| Serie | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Numero serie, sulla fiamma |

### Principi
- **800 è il predefinito**: Feather Bold gira a 800 su titoli e pulsanti. 700 risulta debole in questo sistema.
- **Testo grande**: le dimensioni dei titoli sono 25–40% più grandi rispetto ai brand di prodotto tipici — la sicurezza come identità.
- **Forme delle lettere arrotondate**: ogni glifo ha terminazioni morbide; le grazie taglienti romperebbero il contratto di amichevolezza.

## 4. Stile dei componenti

### Pulsanti

**Primario (Verde gufo)**
- Sfondo: `#58cc02`
- Testo: `#ffffff`
- Spaziatura interna: 14px 24px
- Raggio: 16px
- Border-bottom: 4px solid `#58a700` (l'ombra spessa)
- Hover: sfondo `#89e219`
- Attivo: translate-y 4px, border-bottom 0 (il pulsante "si preme")
- Utilizzo: "Continua", "Controlla", CTA principale.

**Secondario (Bianco con ombra inferiore)**
- Sfondo: `#ffffff`
- Testo: `#777777`
- Bordo: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Raggio: 16px
- Spaziatura interna: 14px 24px
- Hover: testo `#3c3c3c`, bordo `#afafaf`

**Arancione serie**
- Sfondo: `#ff9600`
- Testo: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Utilizzo: obiettivo serie, "Inizia serie"

**Errore (Rosso cardinale)**
- Sfondo: `#ff4b4b`
- Testo: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Utilizzo: feedback risposta errata.

### Schede / Riquadri lezione
- Sfondo: `#ffffff`
- Bordo: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Raggio: 16px
- Spaziatura interna: 16px
- Hover: sollevare di 2px, ombra `0 4px 0 #d7d7d7`

### Nodo albero competenze (Bolla lezione)
- Dimensione: 80×72px
- Sfondo: tinta colore competenza (verde per attivo, grigio per bloccato)
- Border-bottom: 6px solid variante più scura
- Raggio: 50% (circolare)
- Attivo: pulsa 1.0 → 1.05 ogni 1.6s

### Input
- Sfondo: `#ffffff`
- Bordo: 2px solid `#e5e5e5`
- Raggio: 12px
- Spaziatura interna: 12px 16px
- Focus: bordo `#1cb0f6` (blu anguilla), anello `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Barra di avanzamento
- Traccia: `#e5e5e5`
- Riempimento: `#58cc02` (o `#ff9600` per la serie)
- Raggio: 9999px
- Altezza: 16px
- Riempimento animato: 320ms ease-out all'incremento.

## 5. Spaziatura e layout

- **Unità base**: 4px. Scala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Contenitore**: max 1080px, grondaia 24px.
- **Colonna albero lezioni**: 320px di larghezza; centrata su desktop.

## 6. Movimento

- **Durata**: 180ms per la pressione del pulsante; 320ms per lo sblocco del nodo competenza; 1.6s per il pulse del nodo attivo.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, leggero superamento) per gli sblocchi.
- **Mascotte**: Duo sbatte le palpebre ogni 4–6s, salta ai traguardi della serie (480ms ease-out molla).

## 7. Linee guida sull'uso

- Mantieni insieme il verde gufo ad alta saturazione, le spesse ombre inferiori e la geometria arrotondata delle lezioni; i pulsanti verdi piatti da soli non si leggono come Duolingo.
- Riserva il testo in grassetto sovradimensionato per i momenti di lezione, serie e progresso in cui il prodotto ha bisogno di incoraggiamento o feedback.
- Usa il movimento giocoso con parsimonia attorno ai cambiamenti di stato di avanzamento, evitando animazioni rimbalzanti generiche su ogni controllo.
