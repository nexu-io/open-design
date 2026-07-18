# Design System Inspired by Starbucks

> Category: E-Commerce & Vendita al Dettaglio
> Brand globale del caffè. Sistema verde a quattro livelli, canvas color crema caldo, bottoni a pillola piena.

## 1. Tema Visivo & Atmosfera

Il design system di Starbucks è un **flagship retail caldo e sicuro di sé** che porta il verde del grembiule dei suoi negozi su ogni superficie. Il canvas alterna un crema neutro-caldo (`#f2f0eb`) e un bianco ceramica spento (`#edebe9`) — colori che richiamano i materiali del vero locale: i tovaglioli di carta, le pareti del caffè, le finiture in legno — mentre lo **Starbucks Green** (`#006241`) firma il momento di brand sulle hero band, sulle CTA e sull'esperienza Rewards. I verdi declinano in quattro sfumature calibrate (Starbucks, Accent, House, Uplift), ciascuna mappata a un ruolo di superficie specifico; il dorato (`#cba258`) compare soltanto nelle cerimonie di stato Rewards — non come accento generico.

La tipografia porta la maggior parte della voce del brand. Il carattere proprietario **SoDoSans** (esclusivo di Starbucks) occupa quasi ogni superficie con un letter-spacing stretto di `-0.16px` — trasmette sicurezza e cordialità, senza la severità di una rivista di moda. Elemento insolito: la pagina Rewards passa a un serif caldo (`"Lander Tall", "Iowan Old Style", Georgia`) per specifici momenti di headline, evocando sottilmente la nostalgia di una lavagna da caffetteria. Le pagine Careers utilizzano invece uno script a mano libera (`"Kalam", "Comic Sans MS", cursive`) per i dettagli del nome sulla tazza. Tre caratteri, tre contesti — il sistema è disciplinato nel decidere quando ciascuno compare.

Le superfici respirano attraverso una geometria arrotondata. Ogni bottone è una full-pill da 50px. Le card adottano un raggio di 12px. Il floating CTA "Frap" — un bottone circolare da 56px per gli ordini in Green Accent (`#00754A`) — è la firma di profondità del prodotto: fluttua in basso a destra con un layer di ombre sovrapposto (`0 0 6px rgba(0,0,0,0.24)` base + `0 8px 12px rgba(0,0,0,0.14)` ambientale) e si comprime via `scale(0.95)` alla pressione. Le elevazioni sono altrimenti contenute — le ombre delle card restano a un alpha `0.14/0.24` sussurrato, la nav globale ha un quieto stack a tre livelli di ombra. L'intero sistema ha la sensazione di un'insegna da caffè pulita: leggibile, calda, mai urlata.

**Caratteristiche Chiave:**
- Sistema di brand verde a quattro livelli (Starbucks / Accent / House / Uplift), ciascuno mappato a un ruolo di superficie distinto — non un singolo "verde brand"
- L'oro è riservato esclusivamente ai momenti di cerimonia di stato Rewards; mai accento generico
- Canvas neutro-caldo (`#f2f0eb` / `#edebe9`) al posto del bianco freddo — richiama i materiali del caffè
- Carattere tipografico proprietario (SoDoSans) con letter-spacing stretto `-0.16px` come voce universale
- Cambio di carattere specifico per contesto: serif (Lander Tall) per i titoli Rewards, script (Kalam) per i nomi sulla tazza nelle Careers
- Bottoni a pillola piena (`50px` di raggio) universali, `scale(0.95)` allo stato attivo come micro-interazione firma
- CTA circolare floating "Frap" (`56px`, riempimento Green Accent, stack di ombre sovrapposto) — elemento di elevazione firma del prodotto
- Le superfici delle gift card sono progettate come **prodotti fisici fotografati** — ogni card è una fotografia illustrata distinta, non una grafica generata
- Raggio card 12px + ombre morbidissime mantengono le content card piatte con un accenno di sollevamento
- Scala di spaziatura basata su rem ancorata a 1.6rem (~16px) = `--space-3`, con incrementi fino a 6.4rem (~64px)

**Ritmo cromatico della pagina:** Hero crema → sezioni di contenuto bianche → fascia feature verde scuro (`#1E3932`) con testo bianco → zona utility crema → footer verde scuro (`#1E3932`) con testo oro/bianco — una cornice color espresso scuro attorno al corpo luminoso.

## 2. Palette Colori & Ruoli

**Pagine analizzate:** homepage, rewards, gift card, dettaglio prodotto (Pink Energy Drink), informazioni nutrizionali prodotto (Cold Brew).

### Primari

- **Starbucks Green** (`#006241`): Il verde storico del brand. Usato sugli heading h1, sulle intestazioni primarie delle sezioni nella pagina Rewards e come segnale principale di brand ovunque serva un colore dominante unico.
- **Green Accent** (`#00754A`): Un verde leggermente più brillante e luminoso. Il colore primario delle CTA con riempimento ("Explore our afternoon menu", "See the spring menu") e il riempimento del bottone circolare floating Frap.
- **House Green** (`#1E3932`): Il verde brand profondo quasi-nero. Superficie del footer, sfondi delle feature band, superfici scure degli stati reward e la hero band con headline "Free coffee is just the beginning" nella pagina Rewards.
- **Green Uplift** (`#2b5148`): Un verde secondario medio-scuro usato con parsimonia su accenti decorativi e momenti con gradiente scuro.
- **Green Light** (`#d4e9e2`): Un wash menta tenue usato per le tinte degli stati di form validi e superfici di utilità verde chiaro.

### Secondari & Accento

- **Gold** (`#cba258`): Riservato quasi esclusivamente alle cerimonie di stato Rewards — callout tier Gold, badge di partnership (SkyMiles, Bonvoy) e accenti premium. Mai un colore brand generico.
- **Gold Light** (`#dfc49d`): Dorato più morbido per i wash di sfondo nelle sezioni tier gold.
- **Gold Lightest** (`#faf6ee`): Wash di superficie crema-dorata usato sotto le sezioni di partnership nella pagina Rewards — ricollegando l'accento dorato al sistema neutro caldo.

### Superficie & Sfondo

- **White** (`#ffffff`): Superficie primaria di card e modal. Anche riempimento delle card nelle gift card tile.
- **Neutral Cool** (`#f9f9f9`): Superficie grigio-freddo sottile usata nei menu dropdown ("Account" dropdown), nei wrapper delle form card e nei container di utilità sobri.
- **Neutral Warm** (`#f2f0eb`): La **canvas di pagina primaria** color crema caldo per le zone utility Rewards e le hero band.
- **Ceramic** (`#edebe9`): Un crema leggermente più caldo/scuro per i separatori di zona, i wash di sezione di pagina morbidi e la fascia di partnership Rewards.
- **Black** (`#000000`): Inchiostro profondo riservato alla striscia CTA in cima alla pagina ("Join now") e ai bottoni di sign-in nella top-nav ad alto contrasto.

### Neutri & Testo

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Colore primario per heading e testo body su superfici chiare. Non nero puro — un nero all'87% di opacità che risulta più caldo.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Testo secondario/metadati su superfici chiare.
- **Text White** (`rgba(255, 255, 255, 1)`): Testo primario per heading/body su superfici verde scuro.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Testo secondario su superfici verde scuro — descrizioni dei link nel footer, didascalie.
- **Rewards Green** (`#33433d`): Un verde ardesia spento dedicato usato solo nei blocchi di testo della pagina Rewards — un colore di lettura leggermente più "polveroso" rispetto a Text Black che segnala la "superficie reward" senza ricorrere al pieno Starbucks Green.

### Semantici & Accento

- **Red** (`#c82014`): Stato di errore e azione distruttiva (form non valido, azioni distruttive).
- **Yellow** (`#fbbc05`): Stato di avviso, tocco legacy di brand.
- **Green Light** (`#d4e9e2` al 33% di opacità = `hsl(160 32% 87% / 33%)`): Tinta di sfondo per i campi form validi.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Tinta per i campi non validi nei form.

### Scale Alpha Nero/Bianco

Due scale traslucide parallele per overlay e testo secondario:
- Da `rgba(0,0,0,0.06)` a `rgba(0,0,0,0.90)` a passi del 10% — per dark overlay su superfici chiare
- Da `rgba(255,255,255,0.10)` a `rgba(255,255,255,0.90)` a passi del 10% — per light overlay su superfici scure

### Sistema Gradienti

Nessun token di gradiente strutturale osservato. La gerarchia delle superfici è interamente a blocchi di colore pieno — il sistema si affida alla sua palette di superfici crema/verde a cinque livelli anziché ai gradienti.

## 3. Regole Tipografiche

### Font Family

- **Primario:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — il carattere corporate proprietario di Starbucks, usato su quasi ogni superficie
- **Fallback di caricamento:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — ciò che gli utenti vedono prima che SoDoSans si carichi
- **Serif Rewards:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — usato su specifici momenti di headline nella pagina Rewards per un tono editoriale caldo
- **Script Careers:** `"Kalam", "Comic Sans MS", cursive` — usato esclusivamente per i tocchi decorativi del "nome sulla tazza" nelle pagine Careers, con riferimento ai nomi scritti a mano sulle tazze Starbucks

Nessun set stilistico OpenType esplicitamente attivato a `:root`.

### Gerarchia

| Ruolo | Dimensione | Peso | Altezza Riga | Letter Spacing | Note |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Il display più grande Rewards/hero |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Heading hero secondari |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Headline delle sezioni landing |
| H1 | 24px | 600 | 36px | -0.16px | Heading primario in Starbucks-Green |
| H2 | 24px | 400 | 36px | -0.16px | Titolo di sezione in peso regolare in Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Testo intro hero, body delle feature band |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Testo body predefinito |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Label bottoni, metadati, etichette form |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Stato floating-label attivo, micro-copy delle didascalie |
| Button Label | 14–16px | 400–600 | 1.2 | -0.01em | Tutte le etichette dei bottoni a pillola |

**Token letter-spacing:**
- `letterSpacingNormal`: `-0.01em` (predefinito — stretto, caratteristico)
- `letterSpacingLoose`: `0.1em` (caps enfatizzate)
- `letterSpacingLooser`: `0.15em` (etichette in stile maiuscolo, enfasi estrema)

**Token line-height:**
- `lineHeightNormal`: `1.5` (body)
- `lineHeightCompact`: `1.2` (display/bottoni)

### Principi

- **Il tracking negativo stretto (`-0.01em`)** viene applicato quasi universalmente — l'intero prodotto appare leggermente compresso, conferendo a SoDoSans la sua presenza sicura senza sembrare schiacciata.
- **Il cambio di peso porta la gerarchia, non il cambio di dimensione.** H1 e H2 condividono la stessa dimensione 24px/36px; solo il peso (600 vs 400) e il colore (Starbucks-Green vs Text Black) li differenzia.
- **I token di dimensione usano rem, ancorati a `1rem = 10px`** su questo sito (tramite il trucco `font-size: 62.5%` sul root). Quindi `1.6rem` = 16px, `2.4rem` = 24px, ecc. La scala è semantica (textSize-1 through textSize-10), non valori in pixel arbitrari.
- **I cambi di carattere specifici per contesto** — serif su Rewards, script su Careers — sono deliberati e localizzati. Non mescolarli mai con il sans primario sulla stessa superficie.
- **Il testo body non va mai a nero puro** — si attesta a `rgba(0,0,0,0.87)` per corrispondere alla temperatura del canvas neutro caldo.

### Nota sui Sostituti dei Font

SoDoSans è proprietario di Starbucks (concesso in licenza da House Industries, non disponibile pubblicamente). Ragionevoli sostituti open-source:
- **Inter** (Google Fonts) — proporzioni geometriche umaniste simili, ampia gamma di pesi
- **Manrope** — leggermente più tondo, sensazione sicura simile
- **Nunito Sans** — più caldo, buon sostituto per un brand "caffè"

Se si sostituisce, verificare che il tracking stretto `-0.01em` / `-0.16px` rimanga leggibile; alcuni font open-source richiedono `-0.005em` invece.

Lander Tall (il serif Rewards) è custom — sostituti open-source: **Iowan Old Style** (già nel fallback), **Lora**, o **Source Serif Pro**. Kalam (script Careers) è disponibile direttamente su Google Fonts.

## 4. Stili dei Componenti

### Bottoni

**1. Primary Filled — "Explore our afternoon menu / Sign up for free"**
- Background: `#00754A` (Green Accent)
- Testo: `#ffffff`
- Border: `1px solid #00754A`
- Raggio: `50px` (pillola piena)
- Padding: `7px 16px`
- Font: SoDoSans, 16px, peso 600, letter-spacing `-0.01em`
- Stato attivo: `transform: scale(0.95)` tramite `--buttonActiveScale`
- Transition: `all 0.2s ease`

**2. Primary Outlined — "Give them a try / Start an order"**
- Background: trasparente
- Testo: `#00754A` (Green Accent)
- Border: `1px solid #00754A`
- Stesso raggio/padding/attivo/transition del Primary Filled

**3. Black Filled — "Join now"**
- Background: `#000000`
- Testo: `#ffffff`
- Border: `1px solid #000000`
- Raggio: `50px`, Padding: `7px 16px`
- Font: 14px, peso 600
- Usato sulla striscia di join in cima alla pagina e in simili momenti di conversione

**4. Dark Outlined — "Sign in"**
- Background: trasparente
- Testo: `rgba(0, 0, 0, 0.87)` (Text Black)
- Border: `1px solid rgba(0, 0, 0, 0.87)`
- Raggio: `50px`, Padding: `7px 16px`
- Font: 14px, peso 600

**5. Green-on-Green Invertito — "See the spring menu"**
- Background: `#ffffff`
- Testo: `#00754A`
- Border: `1px solid #ffffff`
- Usato quando la superficie dietro il bottone è la fascia verde scuro House Green — bottone bianco con testo verde invece di una pillola verde piena su sfondo verde

**6. Outlined su Scuro — "Learn more / Order now"**
- Background: trasparente
- Testo: `#ffffff`
- Border: `1px solid #ffffff`
- Usato sulle feature band verde scuro per l'azione secondaria abbinata a una CTA bianca piena

**7. Consent Agree (variante verde scuro)**
- Background: `rgb(0, 130, 72)` (una variante verde specifica usata nel modulo cookie-consent)
- Testo: `#ffffff`
- Nessun border, raggio `50px`, padding `7px 16px`, 14px / peso 400
- Leggermente più brillante di Green Accent — riservato all'azione Agree nel banner cookie

**8. Frap — Bottone Circolare Floating per gli Ordini**
- Background: `#00754A` (Green Accent)
- Icona: `#ffffff`
- Dimensione: `5.6rem / 56px` (standard), `4rem / 40px` (variante mini)
- Raggio: `50%` (cerchio pieno)
- Posizione fissa in basso a destra, offset `-0.8rem` per maggior comfort al tocco
- Stack di ombre: base `0 0 6px rgba(0,0,0,0.24)` + ambientale `0 8px 12px rgba(0,0,0,0.14)`
- Stato attivo: l'ombra ambientale si dissolve a `0 8px 12px rgba(0,0,0,0)`
- Questo è l'elemento di elevazione firma del prodotto — fluttua su ogni superficie scorrevole

**9. Tab Feedback a Piena Larghezza — "Provide feedback"**
- Background: `#00754A`
- Testo: `#ffffff`
- Raggio: `12px 12px 0px 0px` (solo in cima)
- Padding: `8px 16px`
- Font: 14px, peso 400
- Posizionato fisso in basso a destra, attaccato al bordo del viewport

### Card & Contenitori

**Content Card (predefinita)**
- Background: `#ffffff` (`--cardBackgroundColor`)
- Raggio: `12px` (`--cardBorderRadius`)
- Ombra: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Usata per: feature card, tile degli articoli del menu, pannelli degli stati reward

**Gift Card Tile**
- Background: la fotografia illustrata riempie la card (nessun sfondo solido)
- Raggio: simile alle card (~`12px`, leggermente più stretto sugli angoli)
- Ombra: più leggera della card predefinita — vengono trattate come card fisiche posate sul canvas
- Categorizzate con un'etichetta sopra la griglia (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Rewards Status Card (firma della pagina Rewards)**
- Griglia a tre colonne: Bronze / Gold / Silver — ciascuna un pannello verde scuro (`#1E3932`) con:
  - Anello di intestazione con colore/gradiente colorato
  - Badge "Level" numerato
  - Titolo di stato in SoDoSans peso 600 grande
  - Liste di stelle/benefici in testo bianco/bianco traslucido
  - Didascalia di progressione in fondo "As you earn more stars…"

**Partnership Card (Rewards)**
- Background: `#faf6ee` (Gold Lightest) superficie crema calda
- Contenuto: loghi partner ("SkyMiles", "Bonvoy") centrati, con testo descrittivo sotto
- Raggio e ombra seguono le specifiche della card predefinita

**Menu Dropdown (dropdown Account, top-nav)**
- Background: `#f9f9f9` (Neutral Cool)
- Voci menu a `24px / peso 400` in Text Black
- Nessun border — solo cambio di superficie di sfondo rispetto alla nav bianca

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding superiore: `8.8rem` (`--modalTopPadding`) — lascia spazio per il bottone di chiusura / intestazione
- Padding verticale combinato: `11.2rem`
- Il raggio eredita le specifiche della card (`12px`)

### Input & Form

**Input a Etichetta Floating**
- L'etichetta fluttua sopra il bordo dell'input quando è in focus/compilato
- Dimensione font etichetta desktop: `1.9rem` predefinita, si anima a `1.4rem` quando attiva
- Dimensione font etichetta mobile: `1.6rem` predefinita, si anima a `1.3rem` attiva
- Offset orizzontale etichetta: `12px` da sinistra
- Traduzione etichetta attiva: fino a `-12px` con traslazione Y `-50%`
- Padding campo: `12px`
- Padding orizzontale form: `1.6rem`
- Validazione: il campo valido ottiene la tinta `rgba(green-light, 0.33)`; il campo non valido ottiene la tinta `rgba(red, 0.05)`
- Transition: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` su input selezionato

**Option Icon (checkbox/radio)**
- Padding: `3px` interno
- Usa l'animazione cubic-bezier dell'input selezionato sopra (una curva leggermente "elastica" con overshoot 2.32)

### Navigazione

**Nav Globale (barra in cima)**
- Posizione fissa con altezze progressive: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Stack di ombre: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — sollevamento morbido a tre livelli
- Sinistra: logo wordmark Starbucks, con offset `99px` (md) / `131px` (lg) dal bordo sinistro
- Link primari in linea in SoDoSans peso 400–600: Menu · Rewards · Gift Cards
- Destra: link "Find a store" + Sign in (outlined) + Join now (nero pieno)

**Sub-nav (seconda barra, es. interna Rewards)**
- Altezza: `53px` (subnav globale) / `48px` (subnav interno)
- Tipicamente un gruppo di tab orizzontali sotto la nav globale

**Nav Mobile**
- Si comprime in un drawer hamburger sotto il breakpoint tablet
- Il bottone floating Frap rimane in basso a destra indipendentemente dallo stato della nav

### Trattamento Immagini

- **Fotografia hero**: Le foto prodotto (bevande in vetro trasparente con sfondi colorati — corallo, salvia, ambra calda) occupano ~40vw di un layout hero diviso; il testo occupa il restante 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Illustrazioni gift card**: Ogni card è una fotografia illustrata distinta (effetto pittorico, dall'aspetto disegnato a mano, palette cromatica calda). Mai grafiche generate generiche.
- **Immagini di cerimonia Rewards**: Fotografie di schermate dell'App Starbucks Rewards tenute in mano, composizioni angolate — fotografia del prodotto in contesto.
- **Miniature menu**: Fotografia di prodotto quadrata o 4:3 con sfondi bianchi/crema puliti, leggera ombra morbida attorno al vetro.
- **Fade-in immagine**: Transition `opacity 0.3s ease-in` al caricamento dell'immagine (`--imageFadeTransition`).

### Feature Band (striscia hero verde scuro)

Fascia `#1E3932` (House Green) a piena larghezza con:
- Sinistra: headline bianca + sottotitolo + riga CTA
- Destra: fotografia prodotto o illustrazione
- Rapporto di divisione ~40/60 o 50/50 a seconda della sezione
- Testo bianco ovunque con `rgba(255,255,255,0.70)` per il testo secondario
- Le CTA seguono l'abbinamento Green-on-Green Invertito (bianco pieno) + Outlined su Scuro (bordo bianco)

### Expander / Accordion

- Durata: `300ms` (`--expanderDuration`)
- Curva di timing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — un ease-out misurato
- Usato per le sezioni FAQ su Rewards e la pagina gift

### Modulo Cookie Consent

Card modal verde scuro in cima alla pagina con bottoni "Agree" (verde pieno) e "Manage preferences" (outlined). Compare alla prima visita; è chiudibile.

### Componenti Dettaglio Prodotto (cluster firma PDP)

Un cluster di componenti ricorrente usato sulle pagine dei prodotti del menu (es. `/menu/product/40498/iced` per il dettaglio di una bevanda, `/menu/product/.../nutrition` per le informazioni nutrizionali). Questi estendono l'inventario dei componenti senza modificare i token.

**Selettore Dimensione**
- Riga orizzontale di 4 bottoni con icona della tazza (Tall / Grande / Venti / Trenta)
- Ogni elemento: icona della sagoma della tazza sopra, nome della dimensione sotto (16/700 in Starbucks-Green), didascalia in once liquide (13/400 in Text Black Soft)
- Stato attivo: un anello circolare verde (`2px solid #00754A`) attorno all'icona della tazza selezionata
- Inattivo: nessun anello, stessa tipografia
- Riga a piena larghezza, spaziatura uniforme
- Raggio del contenitore: `12px` o piatto; le singole icone sono `50%` circolari
- Padding: `16px 24px` interno

**Selezione Aggiuntivi / Latte (rettangolo outlined)**
- Background: `#ffffff`
- Border: `1px solid #d6dbde` (Input Border)
- Raggio: `4px`
- Piena larghezza nella propria colonna
- Etichetta floating sopra il bordo superiore: "Add-ins" / "Milk" / "Add-ins" — 13/700 in Text Black, maiuscolo, letter-spacing `0.325px`
- Valore visualizzato al centro (es. "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Icona chevron-down a destra in Text Black Soft
- Focus: il bordo passa a Green Accent (`#00754A`)

**Stepper Numerico**
- Incorporato in una riga Aggiuntivi quando è necessaria una quantità (es. cucchiaio Strawberry Fruit Inclusions)
- Bottone `−` meno + numero di conteggio + bottone `+` più, tutti in linea a destra dell'etichetta
- Bottoni: circolari `32×32px` con bordo `1px solid #d6dbde`, icona grigio neutro
- Numero di conteggio: 16/700 Text Black centrato

**Bottone Customize**
- Background: `#ffffff`
- Testo: `#00754A` (Green Accent)
- Border: `1.5px solid #00754A`
- Raggio: `50px` (pillola piena)
- Padding: `14px 40px` (generosamente più grande delle pillole predefinite — questa è un'azione primaria secondaria)
- Etichetta: "Customize" con icona sparkle dorata ✨ inserita a sinistra
- Usato per: accedere al flusso di personalizzazione della bevanda dopo la selezione di dimensione/latte

**Bottone Add to Order (PDP)**
- Background: `#00754A` (Green Accent)
- Testo: `#ffffff`
- Raggio: `50px`
- Padding: `14px 32px`
- Fissato in alto a destra della card prodotto e/o allineato a destra nella fascia di disponibilità nel negozio
- Stesso comportamento attivo scale(0.95) delle altre CTA primarie

**Rewards Cost Pill — "200★ item"**
- Background: trasparente
- Border: `1px solid #cba258` (Gold)
- Testo: `#cba258` (Gold)
- Raggio: `50px` (pillola piena)
- Padding: `4px 12px`
- Contenuto: "200★ item" dove `★` è un piccolo glifo stella piena — indica le Rewards Stars necessarie per riscattare questo articolo
- Font: Proxima Nova 13/700 con letter-spacing `0.5px`
- Usato solo sui prodotti riscattabili con i Rewards

**Product Description Band**
- Fascia verde scuro a piena larghezza (`#1E3932` House Green)
- Contiene dall'alto verso il basso:
  1. Rewards Cost Pill (dorata) se applicabile
  2. Testo body descrizione prodotto in bianco (16/400/1.5)
  3. Riepilogo nutrizionale inline ("140 calories, 25g sugar, 2.5g fat") con tooltip icona info — 14/700 bianco
  4. Bottone pillola outlined-bianco-su-verde "Full nutrition & ingredients list"
- Padding: `32px` verticale
- Compare sotto la fascia principale dell'intestazione prodotto

**Tabella Ingredienti / Informazioni Nutrizionali**
- Layout a due colonne nella pagina Nutrition
- Colonna sinistra: intestazione "Ingredients" + lista o testo segnaposto "Not available for this item" con paragrafo esplicativo in Text Black Soft 14/400
- Colonna destra: intestazione "Nutrition" + righe etichetta/valore
- Ogni riga: etichetta nutriente (Proxima Nova 14/400) a sinistra, valore (es. "140 calories", "25g", "205 mg**") a destra, separati da un filetto `1px solid #e7e7e7` sotto
- Nota a piè di pagina per caffeina/asterischi in 13/400 Text Black Soft in fondo
- Pattern riutilizzabile per tabelle di informazioni nutrizionali conformi alla normativa

**Selettore Disponibilità Negozio**
- Compare sulla fascia feature verde scuro sopra la riga del selettore dimensione
- Rettangolo arrotondato a piena larghezza con interno bianco trasparente
- Testo: "For item availability, choose a store" in bianco, 14/400
- Lato destro: affordance chevron-down + icona SVG shopping bag in bianco outline
- Raggio: `4px`
- Altezza: ~48px

**Breadcrumb PDP**
- Percorso "Menu / Refreshers / Pink Energy Drink" sopra il titolo del prodotto
- Separatore: carattere `/` barra in Text Black Soft
- La pagina corrente non è linkata, le pagine precedenti sono link sottolineati in verde accent
- Font: 14/400 Proxima Nova
- Compare su tutte le pagine PDP

**Link Chevron Indietro (sotto-pagine nutrizionali / dettaglio PDP)**
- Link testo "← Back" sopra le intestazioni di sezione nella pagina nutrizione
- Testo in Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron sinistro `<` nello stesso verde
- Alternativa al breadcrumb completo nelle sotto-pagine profonde

## 5. Principi di Layout

### Sistema di Spaziatura

Scala semantica basata su rem (ancorata `1rem = 10px`):

| Token | Rem | Pixel | Uso Tipico |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Padding inline più stretto |
| `--space-2` | `0.8rem` | 8px | Gap piccolo, padding verticale bottone |
| `--space-3` | `1.6rem` | 16px | Predefinito — padding card, gutter esterno xs |
| `--space-4` | `2.4rem` | 24px | Spaziatura interna sezione, gutter esterno md |
| `--space-5` | `3.2rem` | 32px | Spaziatura principale tra sezioni |
| `--space-6` | `4rem` | 40px | Gap ampi, gutter esterno lg, crate intestazione |
| `--space-7` | `4.8rem` | 48px | Spaziatura sezione-a-sezione |
| `--space-8` | `5.6rem` | 56px | Respiro molto ampio — altezza Frap |
| `--space-9` | `6.4rem` | 64px | Padding di sezione più ampio |

**Token gutter:**
- `--outerGutter: 1.6rem` (16px, predefinito / mobile)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Costante di ritmo universale:** `1.6rem` (16px) compare su ogni pagina come gutter esterno predefinito, baseline del padding card e dimensione del testo body 3 — l'unità di spaziatura più frequente del sistema.

### Griglia & Contenitore

- Scala larghezza colonne: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- La griglia gift card usa una griglia responsiva da 3 a 5 colonne di tile da `~343px`
- Sezione stato Rewards: 3 pannelli verde scuro a `lg+` breakpoint
- Hero: divisione asimmetrica 40% (immagine) / 60% (contenuto) tramite `--headerCrateProportion` / `--contentCrateProportion`

### Filosofia degli Spazi Bianchi

Lo spazio bianco trasmette la sensazione di "ampio respiro nel caffè." Il padding delle sezioni tende a essere generoso (40–64px). I blocchi di contenuto sono separati da spazi bianchi invece che da divisori. Il canvas crema (`#f2f0eb`) è di per sé un respiro visivo tra le card bianche e le feature band verdi.

### Scala dei Raggi dei Bordi

| Valore | Uso |
|-------|-----|
| `12px` | Card, modal, tile voci menu (`--cardBorderRadius`) |
| `12px 12px 0 0` | Tab feedback a piena larghezza (solo arrotondato in cima) |
| `50px` | Tutti i bottoni — raggio pillola piena (`--buttonBorderRadius`) |
| `50%` | Icone circolari, bottone floating Frap, miniature avatar |
| Speciale | Ellittico `3.3333%/5.298%` per i mockup Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Profondità & Elevazione

| Livello | Trattamento | Uso |
|-------|-----------|-----|
| Card | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Card di contenuto predefinite — doppia ombra morbidissima |
| Nav Globale | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Sollevamento morbido a triplo livello sulla barra superiore fissa |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Alone base attorno alla CTA circolare floating |
| Frap Ambientale | `0 8px 12px rgba(0,0,0,0.14)` | Ambientale direzionale sovrapposto — fa fluttuare il Frap in avanti |
| Gift Card | Leggera ombra sfumata attorno alla fotografia illustrata | Sensazione di card fisica per le gift tile |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Ombre SVG sovrapposte per le immagini della Starbucks Card |

**Filosofia delle ombre:** Morbidissime, stratificate su colore pieno — il sistema non ricorre mai a una singola ombra densa. Invece, sovrappone 2–3 ombre a basso alpha con offset diversi per simulare l'illuminazione ambientale + diretta del mondo reale. Il bottone Frap è l'elemento più elevato di qualsiasi pagina.

### Profondità Decorativa

- **Nessun sistema di gradienti** — le superfici sono a blocchi di colore pieno
- **La fasciatura a blocchi di colore** porta la profondità percepita (le fasce verde scuro si leggono come "zone feature rientrate" tra le sezioni body crema/bianche)
- **Ombre SVG filter** sulle immagini della Starbucks Card aggiungono una leggera tridimensionalità fisica senza un box-shadow

## 7. Da Fare e Da Non Fare

### Da Fare
- Usare Neutral Warm (`#f2f0eb`) o Ceramic (`#edebe9`) come canvas di pagina al posto del bianco puro — il crema caldo è la firma
- Mappare i livelli del verde ai loro ruoli di superficie intenzionali — Starbucks Green per gli heading, Green Accent per le CTA, House Green per le fasce profonde, Uplift per il decorativo
- Mantenere il tracking stretto a `-0.01em` / `-0.16px` su SoDoSans in tutto il sistema
- Usare il raggio pillola piena da 50px su ogni bottone senza eccezioni
- Applicare `transform: scale(0.95)` come stato attivo universale dei bottoni
- Riservare l'oro ai soli momenti di cerimonia di stato Rewards
- Usare SoDoSans per quasi tutto; passare al serif Lander Tall solo per i titoli editoriali Rewards; riservare lo script Kalam ai momenti "nome sulla tazza" nelle Careers
- Sovrapporre 2–3 ombre a basso alpha invece di una singola ombra più densa per l'elevazione
- Usare la CTA circolare Frap come voce floating persistente per gli ordini su ogni superficie di acquisto
- Lasciare respirare il canvas crema tra le card di contenuto — usare spazi bianchi, non divisori

### Da Non Fare
- Non usare il bianco puro come canvas di pagina — la temperatura del crema caldo è strutturante
- Non scegliere "un verde brand" — il sistema a quattro verdi è intenzionale; usare solo `#006241` ovunque appiattisce il brand
- Non usare l'oro come accento generico — è un segnale Rewards esclusivo
- Non squadrare gli angoli dei bottoni — la pillola da 50px è universale
- Non introdurre riempimenti con gradiente — il sistema è a blocchi di colore pieno
- Non differenziare h1 e h2 per dimensione — la gerarchia viene da peso + colore (600 Starbucks-Green vs 400 Text Black)
- Non usare il nero puro per il testo body — `rgba(0,0,0,0.87)` si abbina al canvas caldo
- Non omettere il feedback attivo `scale(0.95)` sui bottoni — è una micro-interazione firma
- Non sovrapporre ombre singole pesanti; sovrapporre sempre 2–3 a basso alpha
- Non introdurre serif o script nel flusso principale di acquisto — appartengono rispettivamente ai contesti Rewards e Careers

## 8. Comportamento Responsivo

### Breakpoint

Inferiti dai token di larghezza dei componenti e dalle altezze progressive della nav:

| Nome | Larghezza | Cambiamenti Chiave |
|------|-------|-------------|
| xs | < 480px | Nav globale 64px; menu hamburger; layout a colonna singola; bottoni a pillola a piena larghezza |
| Mobile | 480–767px | Nav globale 72px; griglia gift card 2 colonne; il padding delle card si stringe |
| Tablet | 768–1023px | Nav globale 83px; griglia gift card 3 colonne; il layout hero diviso inizia a comparire |
| Desktop | 1024–1439px | Nav globale 99px; griglia gift card 4 colonne; hero asimmetrico completo 40/60 |
| XLarge | 1440px+ | Il contenuto si blocca a `--columnWidthXLarge`; griglia gift card 5 colonne; margine crema extra |

### Target di Tocco

- I bottoni a pillola con padding `7px 16px` misurano ~32px di altezza — sotto il minimo WCAG AAA di 44px per le superfici solo touch. Su mobile, il padding dei bottoni può essere espanso visivamente per rispettare il minimo.
- Il bottone circolare floating Frap a `56px` è ben al di sopra del minimo.
- Il Frap usa `--frapTouchOffset: calc(-1 * .8rem)` per estendere l'area di tocco di 8px oltre il bordo visivo.
- Gli input a etichetta floating aumentano la dimensione del font dell'etichetta su mobile (base 1.6rem vs 1.9rem desktop) — più facile da toccare e leggere a distanza.

### Strategia di Collasso

- **L'altezza della nav globale scala progressivamente**: da 64 → 72 → 83 → 99px tra i breakpoint, non un valore unico
- **Il layout hero diviso si comprime**: divisione asimmetrica 40/60 → impilato (immagine sopra, contenuto sotto) su mobile
- **Griglia gift card**: da 5 → 4 → 3 → 2 → 1 colonna tra i breakpoint con larghezze card adeguate
- **Feature band**: rimangono a piena larghezza ma testo e immagini si impilano verticalmente su mobile
- **Il gutter esterno scala**: da 16px → 24px → 40px man mano che il viewport cresce
- **I pannelli di stato Rewards a 3 colonne**: si impilano in colonna singola su mobile

### Comportamento delle Immagini

- La fotografia prodotto hero si ritaglia più stretta verticalmente su mobile; il contenuto diventa l'àncora visiva
- Le illustrazioni delle gift card preservano il rapporto d'aspetto; la griglia card si riorganizza
- Transition di fade-in `opacity 0.3s ease-in` al caricamento dell'immagine (previene pop-in bruschi)
- Le fotografie dell'app Rewards in mano scalano proporzionalmente; non si deformano

## 9. Guida ai Prompt per Agenti

### Riferimento Rapido Colori

- CTA primaria: "Green Accent (`#00754A`)"
- Testo CTA primaria: "White (`#ffffff`)"
- Heading di brand: "Starbucks Green (`#006241`)"
- Feature band / footer: "House Green (`#1E3932`)"
- Canvas di pagina: "Neutral Warm (`#f2f0eb`)"
- Canvas card: "White (`#ffffff`)"
- Testo heading su chiaro: "Text Black (`rgba(0,0,0,0.87)`)"
- Testo body su chiaro: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Testo body su verde scuro: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Accento Rewards: "Gold (`#cba258`)"
- Testo Rewards: "Rewards Green (`#33433d`)"
- Distruttivo: "Red (`#c82014`)"

### Esempi di Prompt per Componenti

1. "Crea un bottone CTA a pillola primario Starbucks con sfondo Green Accent (`#00754A`), testo bianco 'Explore our afternoon menu', font SoDoSans a 16px peso 600 con letter-spacing `-0.01em`, `border-radius 50px` (pillola piena), padding `7px 16px`. Applica `transform: scale(0.95)` come stato attivo con transition `0.2s ease`."

2. "Progetta una content card con sfondo White (`#ffffff`) a `border-radius 12px`, ombra stratificata `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Imbottisci il contenuto di `16–24px` (`--space-3` fino a `--space-4`). Posiziona su un canvas di pagina Neutral Warm (`#f2f0eb`) con gap di `16px` dai fratelli."

3. "Costruisci il bottone circolare floating Frap per gli ordini — diametro `56px`, riempimento Green Accent (`#00754A`), icona shopping bag bianca centrata. Ombra stratificata: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Posizione fissa in basso a destra con offset `-0.8rem`. Lo stato attivo riduce l'ombra ambientale a `0 8px 12px rgba(0,0,0,0)` con `scale(0.95)`."

4. "Costruisci una feature band verde scuro — sezione a piena larghezza con sfondo House Green (`#1E3932`). Colonna sinistra: h2 SoDoSans bianco a 24px peso 600, seguito da un paragrafo body Text White Soft (`rgba(255,255,255,0.70)`) e una riga CTA con due bottoni (bianco pieno con testo Green Accent per il primario, Outlined-su-Scuro bordo bianco per il secondario). Colonna destra: fotografia prodotto. Rapporto di divisione 40/60, impilati verticalmente sotto `768px`."

5. "Crea una Rewards status card — pannello House Green (`#1E3932`) con `border-radius 12px`, striscia superiore colorata con gradiente (tier Bronze/Silver/Gold). Titolo in SoDoSans 24px peso 600 in bianco. Lista benefici come elenco puntato bianco con didascalie secondarie `rgba(255,255,255,0.70)`. Testo di progressione in fondo in Text White Soft. Impila 3 pannelli in una griglia a `lg+`, colonna singola su mobile."

6. "Progetta una gift card tile — il raggio della card corrisponde a `12px`, riempita con una fotografia illustrata (stile acquerello dipinto a mano) come intera superficie. Una leggera ombra la fa sembrare una card fisica sul canvas crema. Raggruppa sotto un'etichetta di categoria ('Spring', 'Thank You', 'Birthday') in SoDoSans 24px peso 400 sopra la griglia."

7. "Crea un'intestazione prodotto Starbucks — fascia House Green (`#1E3932`) con breadcrumb 'Menu / Refreshers / Pink Energy Drink' in 14/400 bianco sopra il titolo prodotto in SoDoSans 32/700 maiuscolo bianco. Fotografia prodotto centrata sotto il titolo. Sotto la foto: una riga di selettore dimensione a 4 elementi — ogni bottone icona tazza mostra una sagoma verticale della tazza, il nome della dimensione ('Tall' / 'Grande' / 'Venti' / 'Trenta') in 16/700 bianco, e le once liquide in 13/400 Text White Soft. La dimensione selezionata avvolge l'icona tazza in un anello circolare `2px solid #00754A`."

8. "Costruisci un flusso di personalizzazione Starbucks — sotto il selettore dimensione, 3 righe di input a rettangolo outlined impilate (sfondo bianco, bordo `1px solid #d6dbde`, raggio `4px`). Ciascuna ha un'etichetta floating ('Add-ins', 'Milk', 'Add-ins') sopra il bordo superiore in 13/700 Text Black maiuscolo. Valore centrato (es. 'Ice', 'Coconut'). Lato destro: chevron-down in Text Black Soft. Per la riga del cucchiaio, incorpora uno stepper numerico (`−` `1` `+` con bottoni circolari outlined da `32px`). Sotto i tre campi: pillola 'Customize' outlined verde con icona sparkle dorata, raggio `50px`, padding `14px 40px`. Abbina con una pillola 'Add to Order' in Green Accent piena nella stessa riga."

9. "Progetta una product description band Starbucks — House Green (`#1E3932`) a piena larghezza sotto l'intestazione prodotto. In alto: una Rewards Cost Pill dorata outlined '200★ item' (raggio `50px`, padding `4px 12px`, bordo e testo dorati `#cba258`). Sotto: descrizione prodotto in bianco 16/400/1.5. Riepilogo nutrizionale inline in bianco 14/700 ('140 calories, 25g sugar, 2.5g fat') con tooltip icona info. Bottone pillola outlined-bianco-su-verde 'Full nutrition &amp; ingredients list'. Padding verticale 32px."

10. "Crea una tabella informazioni nutrizionali Starbucks — layout a due colonne dentro una card White. Colonna sinistra: intestazione 'Ingredients' (24/400 Text Black), seguita dalla lista ingredienti o dal paragrafo segnaposto 'Not available for this item' in 14/400 Text Black Soft. Colonna destra: intestazione 'Nutrition', poi righe etichetta/valore (nome nutriente a sinistra, valore a destra) separati da filetti `1px solid #e7e7e7`. Tipografia: etichette in 14/400 Text Black, valori in 14/700 Text Black allineati a destra. Marcatori asterisco a piè di pagina in 13/400 Text Black Soft in fondo."

### Guida all'Iterazione

Quando si perfezionano schermate esistenti generate con questo design system:
1. Concentrarsi su UN componente alla volta
2. Fare riferimento ai nomi specifici dei colori e ai codici hex in questo documento
3. Usare descrizioni in linguaggio naturale ("canvas crema caldo", "sistema verde a quattro livelli") insieme ai valori esatti
4. Preservare la pillola da 50px + lo stato attivo `scale(0.95)` in modo universale
5. Verificare che i verdi siano mappati al ruolo corretto (Green Accent per le CTA, Starbucks Green per gli heading, House Green per le fasce)
6. Non introdurre gradienti — il sistema è a blocchi di colore
7. Mantenere il tracking SoDoSans a `-0.01em` / `-0.16px` ovunque

### Lacune Note

- SoDoSans è un carattere tipografico proprietario non disponibile su Google Fonts — nelle implementazioni pubbliche usare Inter o Manrope come sostituto e documentare il cambio
- Lander Tall (il serif Rewards) è anch'esso custom — sostituto con Iowan Old Style, Lora, o Source Serif Pro
- I timing specifici di animazione per componente al di là dei pochi documentati (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) non sono stati catturati per ogni superficie interattiva
- La stilizzazione completa dello stato di errore dei form (spessore bordo rosso, posizionamento icona) è visibile nel token di tinta ma non estratta in modo esaustivo
- I componenti specifici delle pagine Careers (card nome sulla tazza, griglia radio di ricerca) sono referenziati nei nomi dei token ma non coperti da questa estrazione
- Le specifiche dettagliate del mockup Starbucks Visa Card / Starbucks Card (SVC) sono suggerite dai token `--svcRoundedCorners` e `--svcShadowFilter` ma non completamente documentate
