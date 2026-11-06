# Sistema di Design Ispirato a Shopify

> Category: E-Commerce e Retail
> Piattaforma e-commerce. Cinematografica con sfondo scuro, accento verde neon, tipografia ultra-leggera.

## 1. Tema Visivo & Atmosfera

Shopify.com è un teatro digitale a priorità scura — un sito che mette in scena la propria piattaforma commerciale come una prima cinematografica. L'intera esperienza si svolge su un abisso di superfici quasi nere che portano il più tenue sussurro di verde foresta profondo (`#02090A`, `#061A1C`, `#102620`), creando un'atmosfera notturna che sembra meno una pagina marketing SaaS e più un lancio esclusivo di prodotto a una keynote tecnologica. Questa oscurità non è fredda né aziendale — è il buio caldo e avvolgente di un'esperienza di lusso, come sedersi in prima fila di un auditorium al buio.

La tipografia è la protagonista indiscutibile. NeueHaasGrotesk — una raffinata discendente dell'Helvetica — appare in scala monumentale (96px) con un peso incredibilmente leggero (330-400), creando titoli che sembrano incisi nella luce piuttosto che stampati nell'inchiostro. Il feature OpenType `ss03` conferisce alle lettere un carattere distintivo che separa la tipografia di Shopify dall'uso generico dell'Helvetica. Al di sotto del livello display, Inter Variable gestisce il corpo del testo con precisione chirurgica, usando pesi variabili ugualmente insoliti (420, 450, 550) che vivono negli spazi tra le tradizionali fermate di peso. Questa precisione segnala un'azienda che cura ogni dettaglio.

Il colore è usato con estrema parsimonia. L'accento primario è Shopify Verde Neon (`#36F4A4`) — una menta elettrica che appare esclusivamente sugli anelli di focus e sui punti salienti dell'accento, pulsando come un segnale bioluminescente contro la tela scura. Tinte di verde più morbide (Aloe `#C1FBD4`, Pistacchio `#D4F9E0`) forniscono lavaggi atmosferici. Il bianco è l'unico colore del testo che conta su superfici scure, mentre una scala neutra a base di zinco (`#A1A1AA` fino a `#3F3F46`) gestisce la gerarchia delle informazioni discrete. Il risultato è un design che fa sembrare la tecnologia commerciale come se appartenesse a un futuro di fantascienza.

**Caratteristiche Principali:**
- Design a priorità scura con sottotoni verde-teal di foresta profonda (non nero puro)
- Tipografia display ultra-leggera (peso 330) in scala monumentale (96px) che crea una presenza eterea
- Verde Neon (`#36F4A4`) come l'unico accento ad alta energia contro l'oscurità
- Pulsanti a pillola intera (raggio 9999px) come forma interattiva primaria
- Box shadow multistrato e multi-stadio che creano profondità fotografica
- Screenshot del prodotto incorporati in contesti UI scuri, abbinati all'oscurità circostante
- Scala neutra a base di zinco per la gerarchia del testo — bilanciata tra caldo e freddo

## 2. Palette di Colori & Ruoli

### Primari

- **Shopify Bianco** (`#FFFFFF`): Testo primario su superfici scure, riempimenti pulsante, elementi ad alto contrasto
- **Shopify Nero** (`#000000`): Sfondo body, testo pulsante su bianco, base di contrasto massimo (--color-shade-100)

### Secondari & Accento

- **Verde Neon** (`#36F4A4`): L'accento distintivo — anelli di focus, highlight interattivi, indicatori di stato attivo. Elettrico e bioluminescente
- **Aloe** (`#C1FBD4`): Lavaggio verde morbido per sfondi decorativi, card atmosferiche (--color-aloe-10)
- **Pistacchio** (`#D4F9E0`): Tinta verde più chiara per una sottile differenziazione delle superfici (--color-pistachio-10)

### Superficie & Sfondo

- **Vuoto** (`#000000`): Sfondo radice della pagina — nero vero per la massima profondità
- **Teal Profondo** (`#02090A`): Superfici card, contenitori di contenuto — quasi nero con sottotono verde
- **Foresta Scura** (`#061A1C`): Sfondi sezione con carattere verde visibile
- **Foresta** (`#102620`): Superfici scure elevate, sfondi header — la tonalità scura più calda
- **Bordo Card Scuro** (`#1E2C31`): Bordi card su superfici scure, definizione sottile del confine

### Neutri & Testo (Scala Zinco)

- **Shade-30** (`#D4D4D8`): Neutro più chiaro, bordi appena percettibili sul scuro (--color-shade-30)
- **Testo Attenuato** (`#A1A1AA`): Testo secondario, metadati, descrizioni — la voce discreta
- **Shade-50** (`#71717A`): Testo terziario, timestamp, informazioni meno importanti (--color-shade-50)
- **Shade-60** (`#52525B`): Testo disabilitato, neutri decorativi (--color-shade-60)
- **Shade-70** (`#3F3F46`): Divisori sottili, confini UI appena visibili (--color-shade-70)
- **Bordo Chiaro** (`#E4E4E7`): Bordi su superfici chiare (raro — solo in modali modalità chiara)

### Semantici & Accento

- **Link Attenuato** (`#9797A2`): Testo link attenuato con decorazione sottolineatura
- **Link Salvia** (`#9DABAD`): Link attenuati con tinta teal
- **Link Lavanda** (`#BDBDCA`): Variante link più chiara
- **Link Menta** (`#99B3AD`): Variante link con tinta verde per sezioni tematiche

### Sistema Gradiente

- **Lavaggio Teal Scuro**: Gradiente radiale dal centro `#102620` al bordo `#02090A` — usato dietro le vetrine di prodotto
- **Verde Atmosferico**: Sottili gradienti ambientali con tinta verde dietro le sezioni hero, creando profondità senza colori solidi
- **Riflettore**: Area luminosa focalizzata che sfuma verso il nero — crea un'illuminazione in stile presentazione keynote

## 3. Regole Tipografiche

### Famiglia di Font

**Display:** NeueHaasGrotesk (raffinata discendente dell'Helvetica, font variabile)
- Fallback: Helvetica, Arial, sans-serif
- Feature OpenType: `ss03` (set stilistico 3 — alternanze di letterform distintive)
- Pesi disponibili: 330, 360, 400, 500, 750 (variabile)
- Usato per tutti i titoli, testo hero e grandi elementi display

**Body:** Inter-Variable
- Fallback: Helvetica, Arial, sans-serif
- Feature OpenType: `ss03`
- Pesi disponibili: 400, 420, 450, 500, 550 (variabile)
- Usato per testo body, link, pulsanti, elementi UI

**Mono:** ui-monospace
- Fallback: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Usato per snippet di codice, etichette dati, contenuto tecnico

### Gerarchia

| Ruolo | Dimensione | Peso | Altezza Riga | Spaziatura Lettere | Note |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, titoli hero, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, display enfasi |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, display spaziato |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, display etereo |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, titoli sezione |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, sottosezioni |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, titoli funzionalità |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, titoli card |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, titoli piccoli |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, titoli minori |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, paragrafi introduttivi |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, body standard |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, body enfatizzato |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, body compatto |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, leggermente enfatizzato |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, testo CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, voci di navigazione |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadati |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, didascalia enfatizzata |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, etichette con spaziatura ampia |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, testo piccolo a spaziatura stretta |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, etichette in maiuscolo |
| Code | 16px | 400 | 1.50 | — | ui-monospace, maiuscolo, blocchi di codice |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, maiuscolo, codice inline |

### Principi

La tipografia di Shopify è una masterclass nella precisione dei font variabili. Il livello display vive quasi esclusivamente ai pesi 330-400 — testo leggero come una piuma che sembra fluttuare sopra lo sfondo scuro come luce proiettata. Questo è l'opposto dell'approccio in grassetto e pesante che la maggior parte dei siti SaaS adotta: dove gli altri urlano, Shopify sussurra in scala. I titoli da 96px al peso 330 creano un paradosso di dimensioni enormi e tratto delicato che sembra allo stesso tempo monumentale e fragile. Il feature OpenType `ss03` attiva un set stilistico che conferisce a caratteri specifici (probabilmente 'a', 'g' e certi numerali) un aspetto più raffinato, distinguendo la tipografia di Shopify dall'uso standard di Helvetica Neue. Inter Variable gestisce il livello body con precisione chirurgica, usando pesi come 420 e 550 che esistono tra le fermate tradizionali — ogni pezzo di testo ha esattamente il peso visivo di cui ha bisogno.

## 4. Stili dei Componenti

### Pulsanti

**Primario (Riempimento Bianco)**
- Sfondo: Bianco (`#FFFFFF`)
- Testo: Nero (`#000000`)
- Bordo: 2px solid trasparente
- Raggio bordo: pillola intera (9999px)
- Padding: 12px 26px 12px 16px (asimmetrico — più padding a destra per equilibrio visivo)
- Hover: leggera riduzione dell'opacità o cambio di sfondo
- Focus: anello di contorno `#36F4A4` (Verde Neon) da 2px
- Transizione: all 200ms ease

**Secondario (Ghost/Contornato)**
- Sfondo: trasparente
- Testo: Bianco (`#FFFFFF`)
- Bordo: 2px solid Bianco (`#FFFFFF`)
- Raggio bordo: pillola intera (9999px)
- Padding: 12px 26px 12px 16px
- Hover: si riempie con sfondo bianco e testo nero
- Focus: contorno `#36F4A4` da 2px

**Badge/Tag (Neutro Riempito)**
- Sfondo: `rgba(255, 255, 255, 0.2)` (vetro satinato)
- Testo: Bianco (`#FFFFFF`)
- Bordo: nessuno
- Raggio bordo: leggermente arrotondato (4px)
- Padding: 12px 16px
- Font: 16px regular

### Card & Contenitori

- Sfondo: Teal Profondo (`#02090A`) su pagine scure
- Bordo: 1px solid `#1E2C31` (Bordo Card Scuro) — confine appena visibile
- Raggio bordo: 8px per card standard, 12px per card in primo piano, 20px 20px 0 0 per card arrotondate in cima
- Ombra: Sistema multistrato:
  - A riposo: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - L'highlight bianco inset crea un sottile bagliore sul bordo superiore
- Hover: l'ombra si espande, la card può illuminarsi leggermente
- Transizione: box-shadow 300ms ease, transform 200ms ease

### Input & Form

- Sfondo: trasparente o Foresta Scura (`#061A1C`)
- Testo: Bianco (`#FFFFFF`)
- Bordo: 1px solid `#3F3F46` (Shade-70)
- Raggio bordo: 8px
- Padding: 12px 16px
- Focus: 2px solid `#36F4A4` (anello di focus Verde Neon)
- Segnaposto: Shade-50 (`#71717A`)
- Transizione: border-color 200ms ease

### Navigazione

- Sfondo: trasparente (sovrapposto all'hero scuro), diventa Foresta (`#102620`) allo scroll
- Altezza: ~64px
- Sinistra: logo wordmark Shopify (SVG, bianco su scuro)
- Centro/Destra: link di navigazione in 18px/500 NeueHaasGrotesk, bianco, letter-spacing 0.72px
- CTA: Pulsante pillola bianco "Start for free" (destra)
- CTA Secondario: Pulsante ghost con bordo bianco
- Hover: i link passano a Testo Attenuato (`#A1A1AA`) o acquisiscono sottolineatura
- Mobile: menu hamburger, overlay scuro a schermo intero
- Transizione: background 300ms ease allo scroll

### Trattamento Immagini

- Screenshot del prodotto: incorporati in contesti UI scuri, abbinati all'oscurità circostante
- Anteprime interfaccia admin: mostrate su sfondi scuri con bordi card sottili
- Proporzioni: varie — le immagini hero sono larghe (circa 16:9), le foto delle funzionalità sono flessibili
- Tutte le immagini si inseriscono a filo nei contenitori scuri — senza bordi o cornici luminosi
- Lazy loading con superfici placeholder scure

### Indicatori di Fiducia

- Statistiche visualizzate in modo prominente: "15+" (anni), "150M+" (acquirenti)
- Numeri in scala display in NeueHaasGrotesk
- Sezioni di richiamo per l'ecosistema di partner/sviluppatori
- Testimonianze con tema scuro integrate nel flusso della pagina

## 5. Principi di Layout

### Sistema di Spaziatura

Unità base: 8px

| Token | Valore | Uso |
|-------|-------|-----|
| space-1 | 4px | Spazi inline stretti |
| space-2 | 8px | Unità base, spazi icona |
| space-3 | 12px | Padding card, margini stretti |
| space-4 | 16px | Padding standard elemento |
| space-5 | 24px | Spazi card, padding sezione |
| space-6 | 28px | Spaziatura sezione media |
| space-7 | 32px | Interruzioni sezione |
| space-8 | 36px | Padding grande |
| space-9 | 40px | Padding sezione principale |
| space-10 | 64px | Padding sezione hero, spazi ampi |

### Griglia & Contenitore

- Larghezza massima contenitore: ~1280px (centrato)
- Hero: larghezza intera, sfondo scuro da bordo a bordo con testo centrato
- Sezioni funzionalità: layout a 2 colonne con testo e screenshot del prodotto
- Sezioni statistiche: layout orizzontale con numeri grandi
- Padding orizzontale: 64px desktop, 32px tablet, 16px mobile
- Spazio griglia: 24-32px tra i principali blocchi di contenuto

### Filosofia degli Spazi Bianchi

La strategia degli spazi bianchi di Shopify è teatrale. Le sezioni sono separate da vaste distese di spazio scuro — da 80px a 120px di respiro di nero puro — che creano il ritmo di una presentazione, non di una pagina web. Ogni blocco di contenuto è il proprio "slide" in uno scroll in stile keynote. All'interno delle sezioni, la spaziatura è più stretta e deliberata, creando densità focale contro il vuoto espansivo. Il contrasto tra il vuoto a livello macro e la precisione a livello micro è ciò che conferisce al sito la sua cadenza cinematografica.

### Scala Raggio Bordo

| Valore | Contesto |
|-------|---------|
| 4px | Tag, badge, micro-elementi |
| 8px | Card standard, input, contenitori video |
| 12px | Card in primo piano, contenitori immagine, pulsanti (non-pillola) |
| 20px | Card arrotondate in cima (20px 20px 0 0), header modali |
| 340px | Grandi elementi decorativi arrotondati |
| 9999px | Pulsanti pillola, badge pillola, elementi di navigazione |

## 6. Profondità & Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Base | Nessuna ombra, superficie scura | Sfondo pagina predefinito |
| Sottile | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + bagliore bianco inset | Card a riposo |
| Medio | Multistrato: anello 1px + 2px + 4px + 8px stack di ombre | Card elevate, sezioni in primo piano |
| Alto | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modali, dropdown, overlay |
| Focus | `0px 0px 0px 2px #36F4A4` | Anello di focus da tastiera (Verde Neon) |

Il sistema di ombre di Shopify è insolitamente sofisticato. Invece di ombre a valore singolo, le card usano un approccio stratificato e multistrato: un anello da 1px per la definizione del confine, sfocature progressive da 2px/4px/8px per la caduta di luce naturale e un delicato bagliore bianco inset (`rgba(255,255,255,0.03)`) che simula una superficie di vetro illuminata dall'alto. Su sfondi scuri, le ombre si scuriscono da superfici già scure, quindi le ombre funzionano più come "occlusione ambientale" che come elevazione tradizionale — la card sembra affondare leggermente nella superficie piuttosto che galleggiare sopra di essa.

### Profondità Decorativa

- **Gradienti teal scuri**: Lavaggi radiali ambientali dietro le sezioni hero e le vetrine di prodotto
- **Effetti riflettore**: Aree luminose centrate che sfumano verso il nero, creando un'illuminazione teatrale in stile keynote
- **Bagliore bordo**: Bordi di colore chiaro sottili su card scure tramite box-shadow inset
- **Aloni atmosferici verdi**: Tinte verdi tenue nei gradienti di sfondo, che richiamano l'accento del brand

## 7. Cosa Fare e Cosa Non Fare

### Fare

- Usare la gerarchia di superfici verde-teal-nero scuro (Vuoto → Teal Profondo → Foresta Scura → Foresta) per la profondità
- Mantenere la tipografia display al peso 330-400 — la leggerezza eterea è la firma del design
- Usare Verde Neon (`#36F4A4`) esclusivamente per gli stati di focus e gli highlight accento critici
- Applicare il raggio 9999px a tutti i pulsanti CTA primari — la pillola intera è non negoziabile
- Usare il sistema di ombre multistrato per l'elevazione delle card — le ombre singole sembrano piatte
- Mantenere il feature OpenType `ss03` su tutto il testo — fa parte dell'identità tipografica
- Usare Inter Variable per il testo body e NeueHaasGrotesk per i titoli — non mescolare mai i loro ruoli
- Creare una spaziatura teatrale tra le sezioni (80px+) per il ritmo cinematografico

### Non Fare

- Non usare il nero puro (#000000) per il testo su sfondi scuri — usare solo il bianco (#FFFFFF)
- Non introdurre colori caldi (arancione, rosso, giallo) — la palette è rigorosamente fresca (verdi, teal, neutri)
- Non usare pesi font superiori a 500 per il testo body NeueHaasGrotesk — i pesi pesanti rompono la sensazione eterea
- Non applicare accenti verdi a superfici ampie — Verde Neon è solo per highlight piccoli e precisi
- Non usare angoli netti (raggio 0px) su elementi interattivi — tutto si arrotonda
- Non aggiungere sfondi luminosi — il tema scuro è fondamentale, non opzionale
- Non usare box-shadow a singolo strato — l'approccio a stack è il sistema
- Non impostare line-height sopra 1.56 per il testo body — il testo di Shopify è relativamente compatto
- Non mescolare NeueHaasGrotesk e Inter alla stessa dimensione/ruolo — le loro scale di peso differiscono
- Non usare letter-spacing sotto 0 per i titoli — i titoli di Shopify hanno tracking neutro o positivo

## 8. Comportamento Responsive

### Breakpoint

| Nome | Larghezza | Cambiamenti Principali |
|------|-------|-------------|
| Mobile | <640px | Colonna singola, nav hamburger, testo display scala a 48px, padding 16px |
| Tablet | 640-1024px | Le griglie a 2 colonne iniziano, testo display a 70px, padding 32px |
| Desktop | 1024-1440px | Layout completo, nav espansa, display 96px, padding 64px |
| Desktop Grande | >1440px | Contenitore larghezza max centrato, spaziatura sezione aumentata |

### Target Touch

- Target touch minimo: 44x44px (WCAG AAA)
- Pulsanti pillola: altezza minima 48px con padding orizzontale generoso
- Link di navigazione: area touch 44px
- Superfici card: l'intera card è toccabile dove collegata

### Strategia di Collasso

- **Navigazione**: Link orizzontali completi → menu hamburger sotto 1024px; logo e pulsante CTA rimangono visibili
- **Sezione hero**: display 96px → 70px su tablet → 48px su mobile; mantiene l'allineamento centrale a colonna singola
- **Sezioni funzionalità**: testo+immagine a 2 colonne → colonna singola sovrapposta sotto 768px
- **Statistiche**: Riga orizzontale → verticale sovrapposta su mobile
- **Padding sezione**: 64px → 40px → 24px → 16px man mano che il viewport si restringe
- **Card**: Griglia → stack, mantenendo la larghezza intera su mobile

### Comportamento Immagini

- Screenshot del prodotto: responsive all'interno di contenitori scuri, mantengono le proporzioni
- Immagini hero: larghezza intera su tutti i breakpoint, caricate in lazy con placeholder scuri
- Anteprime UI admin: scalano proporzionalmente, possono essere ritagliate su mobile
- Tutte le immagini usano CDN (`cdn.shopify.com`) con srcset responsive

## 9. Guida Prompt per Agente

### Riferimento Rapido Colori

- CTA primario: Shopify Bianco (`#FFFFFF`)
- Sfondo pagina: Nero Vuoto (`#000000`)
- Superficie card: Teal Profondo (`#02090A`)
- Sfondo sezione: Foresta Scura (`#061A1C`)
- Sfondo elevato: Foresta (`#102620`)
- Accento: Verde Neon (`#36F4A4`)
- Testo body: Bianco (`#FFFFFF`)
- Testo attenuato: Attenuato (`#A1A1AA`)
- Bordo scuro: Bordo Card Scuro (`#1E2C31`)

### Esempi di Prompt Componente

- "Crea una sezione hero su sfondo nero vero (#000000) con un titolo NeueHaasGrotesk 96px/330 in bianco, un sottotitolo 20px/500 in #A1A1AA e due pulsanti pillola: riempimento bianco (raggio 9999px) e ghost con bordo bianco da 2px"
- "Progetta una card funzionalità su Teal Profondo (#02090A) con bordo 1px #1E2C31, raggio 12px, ombra multistrato (anello 1px + sfocatura 2px/4px/8px al 10% nero), contenente un titolo bianco 32px/360 e testo body #A1A1AA 18px/400"
- "Costruisci una sezione statistiche su Foresta Scura (#061A1C) con numeri bianchi 96px/750 (NeueHaasGrotesk), etichette descrittive #A1A1AA 16px/400 e spaziatura generosa di 64px tra i blocchi statistiche"
- "Crea una nav sticky con sfondo trasparente (diventa #102620 allo scroll), logo Shopify bianco a sinistra, link di navigazione bianchi 18px/500 con letter-spacing 0.72px e un pulsante pillola bianco 'Start for free' a destra"
- "Progetta un tag/badge con sfondo vetro satinato rgba(255,255,255,0.2), raggio 4px, padding 12px 16px, testo bianco 16px — fluttuante su una superficie card scura"

### Guida all'Iterazione

Quando si rifiniscono schermate esistenti generate con questo sistema di design:
1. Concentrarsi su UN componente alla volta
2. Fare riferimento a nomi di colori specifici e codici hex da questo documento
3. Ricordare: questo è un design A PRIORITÀ SCURA — le superfici chiare sono l'eccezione, non la regola
4. Il testo display deve sempre sembrare leggero come una piuma (peso 330-400) — se sembra pesante, ridurre il peso
5. Verde Neon (#36F4A4) è prezioso — usarlo con parsimonia solo per focus e accento
6. La gerarchia di superfici scure (nero → teal profondo → foresta scura → foresta) crea una profondità sottile
7. Le ombre sono multistrato — un singolo valore `box-shadow` non catturerà la sensazione di card Shopify
8. Il feature OpenType `ss03` deve essere attivo su tutto il testo per la coerenza tipografica
