# Design System Inspired by Cohere

> Category: AI & LLM
> Piattaforma AI enterprise. Gradienti vivaci, estetica da dashboard ricca di dati.

## 1. Tema Visivo e Atmosfera

L'interfaccia di Cohere è un deck di comando enterprise rifinito — deciso, pulito, progettato per far percepire l'AI come un'infrastruttura seria piuttosto che un giocattolo consumer. L'esperienza vive su una tela bianco brillante dove i contenuti sono organizzati in card generosamente arrotondate (raggio 22px) che creano un linguaggio di contenimento organico, simile alle nuvole. È un sito che parla a CTO e architetti enterprise: professionale senza essere freddo, sofisticato senza essere intimidatorio.

Il linguaggio di design unisce due mondi con un sistema a doppio carattere tipografico: CohereText, un serif display personalizzato con tracking stretto, conferisce ai titoli il peso di un manifesto tecnologico, mentre Unica77 Cohere Web gestisce tutto il testo corpo e UI con precisione geometrica svizzera. Questo abbinamento serif/sans crea una personalità di "autorità sicura incontra chiarezza ingegneristica" che riflette perfettamente una piattaforma AI enterprise.

Il colore è usato con estrema moderazione — l'interfaccia è quasi interamente in bianco e nero con bordi grigio freddo (`#d9d9dd`, `#e5e7eb`). Il viola-violetto appare solo nelle bande hero fotografiche, nelle sezioni con gradienti e nell'interattivo blu (`#1863dc`) che segnala gli stati hover e focus. Questa moderazione cromatica significa che quando il colore APPARE — negli screenshot di prodotto, nelle fotografie enterprise e nella sezione viola profondo — porta il massimo peso visivo.

**Caratteristiche Chiave:**
- Tela bianco brillante con bordi di contenimento grigio freddo
- Raggio del bordo caratteristico di 22px — la distintiva "rotondità della card Cohere"
- Doppio carattere tipografico personalizzato: CohereText (serif display) + Unica77 (sans corpo)
- Moderazione cromatica di livello enterprise: nero, bianco, grigi freddi, accento viola-blu minimale
- Sezioni hero viola profondo/violetto che forniscono un contrasto drammatico
- Pulsanti ghost/trasparenti che virano al blu al passaggio del mouse
- Fotografia enterprise che mostra diverse applicazioni nel mondo reale
- CohereMono per codice ed etichette tecniche con trasformazioni maiuscole

## 2. Palette Colori e Ruoli

### Primari
- **Cohere Black** (`#000000`): Testo dei titoli principale ed elementi di massima enfasi.
- **Near Black** (`#212121`): Colore standard dei link del corpo — leggermente più morbido del nero puro.
- **Deep Dark** (`#17171c`): Un quasi-nero con sfumatura blu per la navigazione e il testo nelle sezioni scure.

### Secondari e Accenti
- **Interaction Blue** (`#1863dc`): L'accento interattivo primario — appare al passaggio del mouse sui pulsanti, negli stati focus e nei link attivi. L'unico colore d'azione cromatico.
- **Ring Blue** (`#4c6ee6` al 50%): Colore del ring Tailwind per gli indicatori di focus da tastiera.
- **Focus Purple** (`#9b60aa`): Colore del bordo di focus degli input — un violetto attenuato.

### Superfici e Sfondi
- **Pure White** (`#ffffff`): Lo sfondo principale della pagina e la superficie delle card.
- **Snow** (`#fafafa`): Superfici elevate sottili e sfondi delle sezioni chiare.
- **Lightest Gray** (`#f2f2f2`): Bordi delle card e le linee di contenimento più morbide.

### Neutri e Testo
- **Muted Slate** (`#93939f`): Link footer de-enfatizzati e testo terziario — un grigio dai toni freddi con una leggera sfumatura blu-violetto.
- **Border Cool** (`#d9d9dd`): Bordi standard di sezione e di elemento di lista — un grigio freddo con leggera sfumatura violacea.
- **Border Light** (`#e5e7eb`): Variante bordo più chiara — il gray-200 standard di Tailwind.

### Sistema di Gradienti
- **Banda Hero Viola-Violetto**: Sezioni con gradiente viola profondo che creano un contrasto drammatico rispetto alla tela bianca. Appaiono come bande a piena larghezza che ospitano screenshot di prodotto e messaggi chiave.
- **Gradiente Footer Scuro**: La pagina transisce attraverso viola profondo/carbone fino al footer nero, creando un effetto "tramonto".

## 3. Regole Tipografiche

### Famiglia di Caratteri
- **Display**: `CohereText`, con fallback: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Corpo / UI**: `Unica77 Cohere Web`, con fallback: `Inter, Arial, ui-sans-serif, system-ui`
- **Codice**: `CohereMono`, con fallback: `Arial, ui-sans-serif, system-ui`
- **Icone**: `CohereIconDefault` (font di icone personalizzato)

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (stretto) | -1.44px | Impatto massimo, autorità serif |
| Display Secondario | CohereText | 60px (3.75rem) | 400 | 1.00 (stretto) | -1.2px | Intestazioni di sezione grandi |
| Intestazione Sezione | Unica77 | 48px (3rem) | 400 | 1.20 (stretto) | -0.48px | Titoli sezione feature |
| Sotto-intestazione | Unica77 | 32px (2rem) | 400 | 1.20 (stretto) | -0.32px | Intestazioni card, nomi feature |
| Titolo Feature | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Titoli sezione più piccoli |
| Corpo Grande | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Paragrafi introduttivi |
| Corpo / Pulsante | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Corpo standard, testo pulsante |
| Pulsante Medio | Unica77 | 14px (0.88rem) | 500 | 1.71 (rilassato) | normal | Pulsanti più piccoli, etichette enfatizzate |
| Didascalia | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadati, descrizioni |
| Etichetta Maiuscola | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Etichette di sezione in maiuscolo |
| Piccolo | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Testo più piccolo, link footer |
| Codice Micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Etichette codice in maiuscolo minuscolo |

### Principi
- **Serif per la dichiarazione, sans per l'utilità**: CohereText porta la voce del brand alla scala display — le sue terminazioni serif danno ai titoli l'autorità della ricerca pubblicata. Unica77 gestisce tutto il funzionale con neutralità geometrico-svizzera.
- **Tracking negativo alla scala**: CohereText usa da -1.2px a -1.44px di spaziatura tra lettere a 60–72px, creando blocchi di testo densi e d'impatto.
- **Peso corpo singolo**: Quasi tutto l'uso di Unica77 è al peso 400. Il peso 500 appare solo per l'enfasi nei pulsanti piccoli. Il sistema si affida a dimensione e spaziatura, non al contrasto di peso.
- **Etichette codice in maiuscolo**: CohereMono usa il maiuscolo con spaziatura positiva tra lettere (0.16–0.28px) per tag tecnici e marcatori di sezione.

## 4. Stili dei Componenti

### Pulsanti

**Ghost / Trasparente**
- Sfondo: trasparente (`rgba(255, 255, 255, 0)`)
- Testo: Cohere Black (`#000000`)
- Nessun bordo visibile
- Hover: il testo vira a Interaction Blue (`#1863dc`), opacità 0.8
- Focus: contorno solido 2px in Interaction Blue
- Lo stile principale del pulsante — invisibile finché non si interagisce

**Solido Scuro**
- Sfondo: scuro/nero
- Testo: Pure White
- Per CTA su superfici chiare
- A forma di pillola o con raggio standard

**Delineato**
- Contenimento basato sul bordo
- Usato nelle azioni secondarie

### Card e Contenitori
- Sfondo: Pure White (`#ffffff`)
- Bordo: sottile solido Lightest Gray (`1px solid #f2f2f2`) per card sottili; Cool Border (`#d9d9dd`) per le enfatizzate
- Raggio: **22px** — il raggio caratteristico di Cohere per card primarie, immagini e contenitori di dialogo. Anche 4px, 8px, 16px, 20px per elementi più piccoli
- Ombra: minimale — Cohere si affida al colore di sfondo e ai bordi piuttosto che alle ombre
- Speciale: raggio `0px 0px 22px 22px` (arrotondamento solo in basso) per i contenitori di sezione
- Dialog: raggio 8px per le finestre modali/dialog

### Input e Form
- Testo: bianco su input scuro, nero su chiaro
- Bordo focus: Focus Purple (`#9b60aa`) con `1px solid`
- Ombra focus: ring rosso (`rgb(179, 0, 0) 0px 0px 0px 2px`) — probabilmente per indicazione di stato errore
- Contorno focus: Interaction Blue solido 2px

### Navigazione
- Nav orizzontale pulita su sfondo bianco o scuro
- Logo: wordmark Cohere (SVG personalizzato)
- Link: testo scuro a 16px Unica77
- CTA: pulsante solido scuro
- Mobile: collasso hamburger

### Trattamento delle Immagini
- Fotografia enterprise con soggetti e ambienti diversificati
- Fotografia hero con tinta viola per le sezioni drammatiche
- Screenshot UI del prodotto su superfici scure
- Immagini con raggio 22px in linea con il sistema delle card
- Sezioni a gradiente viola a piena larghezza

### Componenti Distintivi

**Sistema Card 22px**
- Il raggio del bordo di 22px è la firma visiva di Cohere
- Tutte le card, immagini e contenitori primari usano questo raggio
- Crea una morbidezza organica, simile alle nuvole, che è distintiva rispetto ai tipici 8–12px

**Barra di Fiducia Enterprise**
- Loghi aziendali visualizzati in una striscia orizzontale
- Dimostra l'adozione enterprise
- Trattamento logo pulito, monocromatico

**Bande Hero Viola**
- Sezioni viola profondo a piena larghezza che ospitano le vetrine del prodotto
- Creano pause visive drammatiche nel flusso della pagina bianca
- Gli screenshot del prodotto galleggiano nell'ambiente viola

**Tag Codice Maiuscolo**
- CohereMono in maiuscolo con spaziatura tra lettere
- Usato come marcatori di sezione ed etichette di categorizzazione
- Crea una gerarchia informativa tecnica e strutturata

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Il padding dei pulsanti varia per variante
- Padding interno delle card: circa 24–32px
- Spaziatura verticale delle sezioni: generosa (56–60px tra le sezioni)

### Griglia e Contenitore
- Larghezza massima del contenitore: fino a 2560px (molto ampia) con ridimensionamento responsivo
- Hero: centrato con tipografia drammatica
- Sezioni feature: griglie di card multi-colonna
- Sezioni enterprise: bande viola a piena larghezza
- 26 breakpoint rilevati — sistema responsivo estremamente granulare

### Filosofia dello Spazio Bianco
- **Chiarezza enterprise**: Ogni sezione presenta una proposta chiara con spazio di respiro tra le altre.
- **La fotografia come hero**: Le grandi sezioni fotografiche forniscono interesse visivo senza richiedere elementi di design decorativi.
- **Raggruppamento a card**: I contenuti correlati sono raggruppati in card con arrotondamento a 22px, creando cluster informativi naturali.

### Scala dei Raggi dei Bordi
- Netto (4px): Elementi di navigazione, tag piccoli, paginazione
- Comodo (8px): Finestre dialog, contenitori secondari, card piccole
- Generoso (16px): Contenitori featured, card medie
- Grande (20px): Card feature grandi
- Caratteristico (22px): Card primarie, immagini hero, contenitori principali — IL raggio Cohere
- Pillola (9999px): Pulsanti, tag, indicatori di stato

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra, nessun bordo | Sfondo pagina, blocchi di testo |
| Con bordo (Livello 1) | `1px solid #f2f2f2` o `#d9d9dd` | Card standard, separatori di lista |
| Banda Viola (Livello 2) | Sfondo viola scuro a piena larghezza | Sezioni hero, vetrine feature |

**Filosofia delle Ombre**: Cohere è praticamente privo di ombre. La profondità è comunicata attraverso il **contrasto del colore di sfondo** (card bianche su bande viola, superficie bianca su neve), il **contenimento con bordi** (bordi grigio freddo), e la drammatica **alternanza di sezioni chiare e scure**. Quando gli elementi hanno bisogno di elevazione, la ottengono essendo bianco-su-scuro piuttosto che proiettando ombre.

## 7. Cosa Fare e Cosa Evitare

### Da Fare
- Usare il raggio del bordo di 22px su tutte le card e i contenitori primari — è la firma visiva
- Usare CohereText per i titoli display (72px, 60px) con spaziatura tra lettere negativa
- Usare Unica77 per tutto il testo corpo e UI al peso 400
- Mantenere la palette in bianco e nero con bordi grigio freddo
- Usare Interaction Blue (#1863dc) solo per gli stati interattivi hover/focus
- Usare le sezioni viola profondo per pause visive drammatiche e vetrine di prodotto
- Applicare maiuscolo + spaziatura tra lettere su CohereMono per le etichette di sezione
- Mantenere fotografia appropriata al contesto enterprise con soggetti diversificati

### Da Evitare
- Non usare raggi del bordo diversi da 22px sulle card primarie — il raggio caratteristico è importante
- Non introdurre colori caldi — la palette è rigorosamente dai toni freddi
- Non usare ombre pesanti — la profondità viene dal contrasto cromatico e dai bordi
- Non usare il peso grassetto (700+) sul testo corpo — l'intervallo è 400–500
- Non saltare la gerarchia serif/sans — CohereText per i titoli, Unica77 per il corpo
- Non usare il viola come colore di superficie per le card — il viola è riservato alle sezioni a piena larghezza
- Non ridurre la spaziatura delle sezioni sotto i 40px — i layout enterprise hanno bisogno di spazio di respiro
- Non usare decorazione sui pulsanti per impostazione predefinita — ghost/trasparente è lo stato base

## 8. Comportamento Responsivo

### Breakpoint
| Nome | Larghezza | Cambiamenti Principali |
|------|-------|-------------|
| Mobile Piccolo | <425px | Layout compatto, spaziatura minimale |
| Mobile | 425–640px | Colonna singola, card impilate |
| Mobile Grande | 640–768px | Aggiustamenti minori alla spaziatura |
| Tablet | 768–1024px | Inizio delle griglie a 2 colonne |
| Desktop | 1024–1440px | Layout multi-colonna completo |
| Desktop Grande | 1440–2560px | Larghezza massima del contenitore |

*26 breakpoint rilevati — uno dei siti più granularmente responsivi nel dataset.*

### Target di Tocco
- Pulsanti adeguatamente dimensionati per l'interazione touch
- Link di navigazione con spaziatura comoda
- Superfici delle card come target di tocco

### Strategia di Collasso
- **Navigazione**: La nav completa si riduce a hamburger
- **Griglie feature**: Multi-colonna → 2 colonne → colonna singola
- **Testo hero**: 72px → 48px → 32px ridimensionamento progressivo
- **Sezioni viola**: Mantengono la piena larghezza, il contenuto si impila
- **Griglie card**: 3 → 2 → 1 colonna

### Comportamento delle Immagini
- La fotografia si ridimensiona proporzionalmente all'interno di contenitori con raggio 22px
- Gli screenshot del prodotto mantengono il rapporto d'aspetto
- Le sezioni viola ridimensionano lo sfondo proporzionalmente

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido ai Colori
- Testo Principale: "Cohere Black (#000000)"
- Sfondo Pagina: "Pure White (#ffffff)"
- Testo Secondario: "Near Black (#212121)"
- Accento Hover: "Interaction Blue (#1863dc)"
- Testo Attenuato: "Muted Slate (#93939f)"
- Bordi Card: "Lightest Gray (#f2f2f2)"
- Bordi Sezione: "Border Cool (#d9d9dd)"

### Esempi di Prompt per Componenti
- "Crea una sezione hero su Pure White (#ffffff) con CohereText a 72px peso 400, line-height 1.0, letter-spacing -1.44px. Testo Cohere Black. Sottotitolo in Unica77 a 18px peso 400, line-height 1.4."
- "Progetta una card feature con raggio del bordo 22px, bordo 1px solid Lightest Gray (#f2f2f2) su bianco. Titolo in Unica77 a 32px, letter-spacing -0.32px. Corpo in Unica77 a 16px, Muted Slate (#93939f)."
- "Costruisci un pulsante ghost: sfondo trasparente, testo Cohere Black in Unica77 a 16px. Al hover, il testo vira a Interaction Blue (#1863dc) con opacità 0.8. Focus: contorno solido 2px Interaction Blue."
- "Crea una sezione a piena larghezza viola profondo con testo bianco. CohereText a 60px per il titolo. Lo screenshot del prodotto galleggia all'interno con raggio del bordo 22px."
- "Progetta un'etichetta di sezione usando CohereMono a 14px, maiuscolo, letter-spacing 0.28px. Testo Muted Slate (#93939f)."

### Guida all'Iterazione
1. Concentrarsi su UN componente alla volta
2. Usare sempre il raggio 22px per le card primarie — "la rotondità della card Cohere"
3. Specificare il carattere tipografico — CohereText per i titoli, Unica77 per il corpo, CohereMono per le etichette
4. Gli elementi interattivi usano Interaction Blue (#1863dc) solo al hover
5. Mantenere le superfici bianche con bordi grigio freddo — nessun tono caldo
6. Il viola è per le sezioni a piena larghezza, mai per gli sfondi delle card
