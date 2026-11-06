# Design System Inspired by Figma

> Category: Design e Creatività
> Strumento di design collaborativo. Multicolore vivace, giocoso ma professionale.

## 1. Tema Visivo e Atmosfera

L'interfaccia di Figma è lo strumento di design che ha progettato sé stesso — un capolavoro di sofisticazione tipografica in cui un font variabile personalizzato (figmaSans) modula tra sottilissimo (weight 320) e grassetto (weight 700) con soste a valori intermedi insoliti (330, 340, 450, 480, 540) che la maggior parte dei sistemi tipografici non esplora mai. Questo controllo granulare del peso conferisce a ogni elemento testuale un peso visivo precisamente calibrato, creando gerarchia attraverso micro-differenze piuttosto che con lo strumento grossolano di "normale vs grassetto."

La pagina presenta una dualità affascinante: il chrome dell'interfaccia è rigorosamente in bianco e nero (letteralmente solo `#000000` e `#ffffff` rilevati come colori), mentre la sezione hero e le vetrine dei prodotti esplodono con vivaci gradienti multicolore — verdi elettrici, gialli brillanti, viola profondi, rosa accesi. Questa separazione significa che il design system stesso è privo di colori, trattando l'output colorato del prodotto come il contenuto protagonista. La pagina marketing di Figma è essenzialmente una galleria con pareti bianche che espone arte colorata.

Ciò che rende Figma distintiva oltre al font variabile è la sua geometria circolare e a pillola. I pulsanti usano un raggio di 50px (pillola) o 50% (cerchio perfetto per i pulsanti icona), creando un aspetto organico simile a una tavolozza di strumenti. L'indicatore di focus con contorno tratteggiato (`dashed 2px`) è una scelta di design deliberata che richiama le maniglie di selezione nell'editor di Figma stesso — il linguaggio UI del sito web fa riferimento al linguaggio UI del prodotto.

**Caratteristiche Principali:**
- Font variabile personalizzato (figmaSans) con pesi insoliti: 320, 330, 340, 450, 480, 540, 700
- Chrome dell'interfaccia rigorosamente in bianco e nero — il colore esiste solo nel contenuto del prodotto
- figmaMono per etichette tecniche in maiuscolo con ampia spaziatura tra lettere
- Geometria dei pulsanti a pillola (50px) e circolare (50%)
- Contorni di focus tratteggiati che richiamano le maniglie di selezione dell'editor di Figma
- Gradienti hero multicolore vivaci (verde, giallo, viola, rosa)
- Feature OpenType `"kern"` abilitata globalmente
- Spaziatura tra lettere negativa ovunque — anche il testo corpo a -0.14px fino a -0.26px

## 2. Palette Colori e Ruoli

### Primari
- **Nero puro** (`#000000`): Tutto il testo, tutti i pulsanti solidi, tutti i bordi. L'unico "colore" dell'interfaccia.
- **Bianco puro** (`#ffffff`): Tutti gli sfondi, i pulsanti bianchi, il testo su superfici scure. L'altra metà del binario.

*Nota: Il sito marketing di Figma usa SOLO questi due colori per il suo livello interfaccia. Tutti i colori vivaci appaiono esclusivamente negli screenshot del prodotto, nei gradienti hero e nel contenuto incorporato.*

### Superfici e Sfondi
- **Bianco puro** (`#ffffff`): Sfondo principale della pagina e superfici delle card.
- **Nero vetro** (`rgba(0, 0, 0, 0.08)`): Sottile overlay scuro per i pulsanti circolari secondari e gli effetti vetro.
- **Bianco vetro** (`rgba(255, 255, 255, 0.16)`): Overlay vetro smerigliato per i pulsanti su superfici scure/colorate.

### Sistema di Gradienti
- **Gradiente Hero**: Un vivace gradiente multi-stop che usa verde elettrico, giallo brillante, viola profondo e rosa acceso. Questo gradiente è la firma visiva della sezione hero — rappresenta le possibilità creative dello strumento.
- **Gradienti delle Sezioni Prodotto**: Le singole aree del prodotto (Design, Dev Mode, Prototipazione) possono usare temi di colore distinti nelle loro vetrine.

## 3. Regole Tipografiche

### Famiglia di Font
- **Primario**: `figmaSans`, con fallback: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Etichette**: `figmaMono`, con fallback: `figmaMono Fallback, SF Mono, menlo`

### Gerarchia

| Ruolo | Font | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (stretto) | -1.72px | Impatto massimo, tracking estremo |
| Intestazione Sezione | figmaSans | 64px (4rem) | 400 | 1.10 (stretto) | -0.96px | Titoli sezione feature |
| Sotto-intestazione | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Testo sezione enfatizzato |
| Sotto-intestazione Leggero | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Testo sezione a peso leggero |
| Titolo Feature | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Intestazioni card in grassetto |
| Corpo Grande | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px a -0.14px | Descrizioni, introduzioni |
| Corpo / Pulsante | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px a normal | Corpo standard, navigazione, pulsanti |
| Corpo Leggero | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px a normal | Testo corpo a peso leggero |
| Etichetta Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (stretto) | 0.54px | Etichette sezione in maiuscolo |
| Mono Piccolo | figmaMono | 12px (0.75rem) | 400 | 1.00 (stretto) | 0.6px | Tag minuscoli in maiuscolo |

### Principi
- **Precisione del font variabile**: figmaSans usa pesi che la maggior parte dei sistemi non utilizza mai — 320, 330, 340, 450, 480, 540. Questo crea gerarchia attraverso sottili differenze di peso piuttosto che salti drammatici. La differenza tra 330 e 340 è quasi impercettibile ma strutturalmente significativa.
- **Il leggero come base**: La maggior parte del testo corpo usa 320–340 (più leggero del tipico 400 "normale"), creando un'esperienza di lettura eterea e ariosa che si adatta all'estetica dello strumento di design.
- **Kern ovunque**: Ogni elemento testuale abilita la feature OpenType `"kern"` — la crenatura non è opzionale, è strutturale.
- **Tracking negativo per default**: Anche il testo corpo usa da -0.1px a -0.26px di spaziatura tra lettere, creando testo universalmente compatto. Il testo display si comprime ulteriormente a -0.96px e -1.72px.
- **Mono per la struttura**: figmaMono in maiuscolo con spaziatura tra lettere positiva (0.54px–0.6px) crea etichette di segnalazione tecnica.

## 4. Stili dei Componenti

### Pulsanti

**Nero Solido (Pillola)**
- Sfondo: Nero puro (`#000000`)
- Testo: Bianco puro (`#ffffff`)
- Raggio: cerchio (50%) per i pulsanti icona
- Focus: contorno dashed 2px
- Massima enfasi

**Pillola Bianca**
- Sfondo: Bianco puro (`#ffffff`)
- Testo: Nero puro (`#000000`)
- Padding: 8px 18px 10px (verticale asimmetrico)
- Raggio: pillola (50px)
- Focus: contorno dashed 2px
- CTA standard su superfici scure/colorate

**Vetro Scuro**
- Sfondo: `rgba(0, 0, 0, 0.08)` (sottile overlay scuro)
- Testo: Nero puro
- Raggio: cerchio (50%)
- Focus: contorno dashed 2px
- Azione secondaria su superfici chiare

**Vetro Chiaro**
- Sfondo: `rgba(255, 255, 255, 0.16)` (vetro smerigliato)
- Testo: Bianco puro
- Raggio: cerchio (50%)
- Focus: contorno dashed 2px
- Azione secondaria su superfici scure/colorate

### Card e Contenitori
- Sfondo: Bianco puro
- Bordo: nessuno o minimo
- Raggio: 6px (contenitori piccoli), 8px (immagini, card, dialog)
- Ombra: effetti di elevazione da sottile a medio
- Screenshot del prodotto come contenuto delle card

### Navigazione
- Navigazione orizzontale pulita su sfondo bianco
- Logo: wordmark di Figma in nero
- Tab prodotto: navigazione a tab a forma di pillola (50px)
- Link: testo nero, decorazione sottolineatura 1px
- CTA: pulsante pillola nero
- Hover: colore del testo tramite variabile CSS

### Componenti Distintivi

**Barra Tab Prodotto**
- Tab a forma di pillola orizzontale (raggio 50px)
- Ogni tab rappresenta un'area del prodotto Figma (Design, Dev Mode, Prototipazione, ecc.)
- Tab attivo evidenziato

**Sezione Gradiente Hero**
- Sfondo gradiente multicolore vivace a larghezza piena
- Testo bianco sovrapposto con intestazione display da 86px
- Screenshot del prodotto fluttuanti all'interno del gradiente

**Indicatori di Focus Tratteggiati**
- Tutti gli elementi interattivi usano il contorno `dashed 2px` al focus
- Richiamano le maniglie di selezione nell'editor di Figma
- Una scelta meta-design che collega il sito web e il prodotto

## 5. Principi di Layout

### Sistema di Spaziatura
- Unità base: 8px
- Scala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Griglia e Contenitore
- Larghezza massima del contenitore: fino a 1920px
- Hero: gradiente a larghezza piena con contenuto centrato
- Sezioni prodotto: vetrine alternate
- Footer: sezione scura a larghezza piena
- Responsivo da 559px a 1920px

### Filosofia dello Spazio Bianco
- **Ritmo da galleria**: La spaziatura generosa permette a ogni sezione prodotto di respirare come una propria esibizione.
- **Le sezioni colorate come respiro visivo**: Il gradiente hero e le vetrine dei prodotti forniscono sollievo cromatico tra le sezioni di interfaccia monocromatiche.

### Scala dei Raggi dei Bordi
- Minimale (2px): Piccoli elementi link
- Sottile (6px): Contenitori piccoli, divisori
- Comodo (8px): Card, immagini, dialog
- Pillola (50px): Pulsanti tab, CTA
- Cerchio (50%): Pulsanti icona, elementi circolari

## 6. Profondità ed Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Piatto (Livello 0) | Nessuna ombra | Sfondo della pagina, la maggior parte del testo |
| Superficie (Livello 1) | Card bianca su sezione gradiente/scura | Card, vetrine prodotto |
| Elevato (Livello 2) | Ombra sottile | Card fluttuanti, stati hover |

**Filosofia delle Ombre**: Figma usa le ombre con parsimonia. I principali meccanismi di profondità sono il **contrasto di sfondo** (contenuto bianco su sezioni colorate/scure) e la dimensionalità intrinseca degli screenshot del prodotto stessi.

## 7. Da Fare e Da Evitare

### Da Fare
- Usare figmaSans con pesi variabili precisi (320–540) — il controllo granulare del peso È il design
- Mantenere l'interfaccia rigorosamente in bianco e nero — il colore proviene solo dal contenuto del prodotto
- Usare la geometria a pillola (50px) e circolare (50%) per tutti gli elementi interattivi
- Applicare contorni di focus dashed 2px — il pattern di accessibilità caratteristico
- Abilitare la feature `"kern"` su tutto il testo
- Usare figmaMono in maiuscolo con spaziatura tra lettere positiva per le etichette
- Applicare spaziatura tra lettere negativa ovunque (da -0.1px a -1.72px)

### Da Evitare
- Non aggiungere colori all'interfaccia — la palette monocromatica è assoluta
- Non usare pesi di font standard (400, 500, 600, 700) — usare i valori unici del font variabile (320, 330, 340, 450, 480, 540)
- Non usare angoli netti sui pulsanti — solo geometria a pillola e circolare
- Non usare contorni di focus solidi — il tratteggiato è la firma
- Non aumentare il peso del font corpo sopra 450 — l'estetica a peso leggero è fondamentale
- Non usare spaziatura tra lettere positiva sul testo corpo — è sempre negativa

## 8. Comportamento Responsivo

### Breakpoint
| Nome | Larghezza | Modifiche Principali |
|------|-------|-------------|
| Mobile Piccolo | <560px | Layout compatto, impilato |
| Tablet | 560–768px | Aggiustamenti minori |
| Desktop Piccolo | 768–960px | Layout a 2 colonne |
| Desktop | 960–1280px | Layout standard |
| Desktop Grande | 1280–1440px | Espanso |
| Ultra-wide | 1440–1920px | Larghezza massima |

### Strategia di Collasso
- Testo hero: 86px → 64px → 48px
- Tab prodotto: scroll orizzontale su mobile
- Sezioni feature: colonna singola impilata
- Footer: multi-colonna → impilato

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido Colori
- Tutto: "Nero puro (#000000)" e "Bianco puro (#ffffff)"
- Vetro Scuro: "rgba(0, 0, 0, 0.08)"
- Vetro Chiaro: "rgba(255, 255, 255, 0.16)"

### Esempi di Prompt per Componenti
- "Crea un hero su un gradiente multicolore vivace (verde, giallo, viola, rosa). Titolo a 86px figmaSans peso 400, line-height 1.0, letter-spacing -1.72px. Testo bianco. Pulsante CTA pillola bianco (raggio 50px, padding 8px 18px)."
- "Progetta una barra tab prodotto con pulsanti a forma di pillola (raggio 50px). Attivo: sfondo nero, testo bianco. Inattivo: trasparente, testo nero. figmaSans a 20px peso 480."
- "Costruisci un'etichetta sezione: figmaMono 18px, maiuscolo, letter-spacing 0.54px, testo nero. Kern abilitato."
- "Crea testo corpo a 20px figmaSans peso 330, line-height 1.40, letter-spacing -0.14px. Nero puro su bianco."

### Guida all'Iterazione
1. Usare i valori di peso del font variabile con precisione: 320, 330, 340, 450, 480, 540, 700
2. L'interfaccia è sempre nero + bianco — non aggiungere mai colori al chrome
3. Contorni di focus tratteggiati, non solidi
4. La spaziatura tra lettere è sempre negativa sul corpo, sempre positiva sulle etichette mono
5. Pillola (50px) per pulsanti/tab, cerchio (50%) per i pulsanti icona
