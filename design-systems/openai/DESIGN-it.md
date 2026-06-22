# Design System Inspired by OpenAI

> Category: AI & LLM
> Sistema calmo e quasi monocromatico, ancorato a un teal-nero profondo con ampio spazio bianco e tipografia editoriale.

## 1. Visual Theme & Atmosphere

La superficie prodotto di OpenAI si legge come un laboratorio di ricerca vestito per il pubblico — clinico, contenuto, deliberatamente silenzioso. Lo sfondo della pagina è un bianco puro (`#ffffff`) sovrapposto a un inchiostro quasi nero (`#0d0d0d`) con una sottile sfumatura teal, così che persino il testo appaia leggermente freddo piuttosto che aggressivamente scuro. Il risultato è una neutralità cromatica che mette al centro l'output del modello, il codice e la prosa, non gli elementi decorativi intorno a essi.

La mossa distintiva è l'uso di **Söhne** (o il suo sostituto di sistema `inter`) con pesi contenuti — 400 per il corpo, 500 per navigazione ed etichette, 600 per l'enfasi — abbinato a **Signifier**, un serif contemporaneo usato per i titoli editoriali di grande formato. Mentre la maggior parte dei brand AI punta al futuristico, i titoli serif di OpenAI conferiscono al prodotto un tono discretamente letterario, come se ogni annuncio fosse un saggio.

Il sistema delle forme è uniformemente morbido: raggi da 8px a 12px, pillole da 9999px per tag e chip, nessun angolo netto. Le transizioni tra sezioni sono indicate dallo spazio bianco piuttosto che da divisori; quando i bordi compaiono sono linee sottilissime `#e5e5e5` che si leggono come assenza di colore piuttosto che come sua presenza.

**Key Characteristics:**
- Tela bianco puro (`#ffffff`) con inchiostro teal-nero profondo (`#0d0d0d`)
- Söhne / Inter a pesi moderati (400, 500, 600) — contenimento rispetto all'affermazione
- Serif Signifier per i titoli editoriali di grande formato
- Raggi morbidi da 8–12px ovunque; pillole da 9999px per i chip
- Bordi a linea sottile (`#e5e5e5`) usati con parsimonia; lo spazio bianco come divisore principale
- Illustrazioni monocromatiche in teal profondo — nessun gradiente nei segni grafici
- Interlinea generosa (1.55–1.65) e tracking prossimo allo zero

## 2. Color Palette & Roles

### Primary
- **Pure White** (`#ffffff`): Sfondo primario, superficie della card, sfondo del pulsante.
- **Ink Black** (`#0d0d0d`): Testo primario, marchio, CTA primaria.
- **Soft Black** (`#1a1a1a`): Intestazione secondaria, inchiostro alternativo per testo non critico.

### Surface & Background
- **Mist** (`#fafafa`): Sfondo di separazione sezione, superficie del footer.
- **Pearl** (`#f5f5f5`): Superficie della card, pannello elevato.
- **Cloud** (`#ececec`): Sfondo disabilitato, tonalità divisore.

### Brand Accent
- **OpenAI Teal** (`#10a37f`): Brand primario, link, badge in evidenza — l'unico colore in un sistema altrimenti neutro.
- **Teal Deep** (`#0a7a5e`): Stato hover e premuto per il colore brand.
- **Teal Soft** (`#e8f5f0`): Tinta di superficie per badge di successo, callout in evidenza.

### Neutrals & Text
- **Graphite** (`#3c3c3c`): Testo corpo, colore di lettura predefinito.
- **Slate** (`#6e6e6e`): Testo secondario, didascalie, metadati.
- **Ash** (`#9b9b9b`): Testo terziario, segnaposto, etichetta disabilitata.
- **Stone** (`#c4c4c4`): Divisori decorativi, icone tenui.

### Semantic & Border
- **Border Hairline** (`#e5e5e5`): Separatore a linea sottile standard.
- **Border Soft** (`#ededed`): Contorno della card su superficie bianca.
- **Error** (`#ef4146`): Validazione, azione distruttiva.
- **Warning** (`#f5a623`): Ambra tenue per stati di avviso.
- **Info** (`#2563eb`): Tono link informativo (usato con parsimonia; il teal ha comunque la precedenza).

## 3. Typography Rules

### Font Family
- **Display / Editorial**: `Signifier`, con fallback: `'Source Serif Pro', Georgia, serif`
- **Body / UI**: `Söhne`, con fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, con fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Hero editoriale, titoli di annuncio |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Intestazione pagina |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Intestazione sezione |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Sottosezione |
| Body Large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Paragrafi di apertura |
| Body | Söhne | 16px (1rem) | 400 | 1.65 | normal | Testo di lettura standard |
| Body Small | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Corpo card, UI densa |
| Caption | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadati, badge |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, link nav maiuscoli |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Blocchi di codice, output terminale |

### Principles
- **Il contenimento come identità**: i pesi si fermano a 600; il 700+ è fuori brand. La gerarchia deriva da dimensione e colore, non dal peso.
- **Serif per l'anima, sans per il sistema**: Signifier appare solo nei momenti editoriali di grande formato. L'interfaccia prodotto è esclusivamente sans.
- **Tracking negativo per il display**: -0.02em sulle dimensioni display; il tracking torna a zero a partire da 16px.

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#0d0d0d`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 9999px (pillola intera) sui chip, 12px sulle CTA rettangolari
- Hover: sfondo `#1a1a1a`
- Use: CTA primaria, "Try ChatGPT", "Sign in"

**Secondary**
- Background: `#ffffff`
- Text: `#0d0d0d`
- Border: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Radius: 12px
- Hover: sfondo `#fafafa`, bordo `#d4d4d4`

**Brand Accent**
- Background: `#10a37f`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Use: CTA upgrade in evidenza, percorso di successo

### Cards
- Background: `#ffffff`
- Border: 1px solid `#ededed`
- Radius: 16px
- Padding: 24px–32px
- Shadow: nessuna per impostazione predefinita; al hover `0 4px 16px rgba(13,13,13,0.06)`

### Inputs
- Background: `#ffffff`
- Border: 1px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 14px
- Focus: bordo `#10a37f`, anello `0 0 0 3px rgba(16,163,127,0.12)`

### Pills & Tags
- Background: `#f5f5f5`
- Text: `#3c3c3c`
- Padding: 4px 10px
- Radius: 9999px
- Font: 12px / 500

## 5. Spacing & Layout

- **Unità base**: 4px. Scala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: max-width 1200px, gutter 24px su mobile, 48px su desktop.
- **Ritmo delle sezioni**: 96–128px verticali tra le sezioni principali; 64px su mobile.
- **Griglia**: 12 colonne desktop, 4 colonne mobile, gap 24px.

## 6. Motion

- **Durata**: 150–220ms per hover; 280–360ms per le transizioni di layout.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (uscita fluida) per gli ingressi.
- **Contenimento**: nessun parallax, nessuno scroll-jacking. Solo sottile fade e translate.

## 7. Usage Guardrails

- Preservare insieme il contenimento editoriale neutro, il raggio morbido e l'uso scarso dell'accento; gli accenti verdi da soli non creano una superficie simile a OpenAI.
- Usare i momenti display in stile Signifier solo per la gerarchia editoriale o degli annunci, mantenendo i controlli prodotto nel sistema sans.
- Evitare motion ornamentali, ombre pesanti e card decorative sovradimensionate; il sistema deve sembrare calmo, leggibile e deliberato.
