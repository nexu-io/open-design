# Design System Inspired by Discord

> Category: Produktivität & SaaS
> Sprach-/Chat-Plattform. Tiefes Blurple, dunkle Oberflächen, verspielter Akzent-Charakter.

## 1. Visuelles Thema & Atmosphäre

Discords Produkt ist für Abende, Raids und Gruppensprache ausgelegt — daher sind alle Oberflächen konsequent dunkel gestaltet. Die Standardfläche ist das tiefe `Background Primary` (`#313338` helles Design, `#1e1f22` dunkles Design), wobei Chat-Spalten auf leicht helleren oder dunkleren Tönen geschichtet werden, um Kanäle, Threads und Seitenpanels zu kennzeichnen. Das charakteristische **Blurple** (`#5865f2`) ist dem Markenzeichen, primären CTAs, Erwähnungen und dem Eigenzuordnungs-Affordance vorbehalten — sparsam eingesetzt, damit es gegen die gedämpften Neutraltöne heraussticht.

Die Typografie setzt auf **gg sans** (Discords individuellen Whitney-Ersatz) für Fließtext und Benutzeroberfläche, mit abgerundeten geometrischen Formen, die zugänglich wirken, aber in den kleinen Größen, die ein Chat-Client erfordert, lesbar bleiben. Überschriften skalieren inkrementell; Chat-Zeilen sind eng gefasst (4–8px zwischen Nachrichtengruppen), damit ein stundenlanges Scrollen nach oben übersichtlich bleibt.

Die Formensprache ist abgerundet, aber nicht ballonweich: 8px Radien auf Karten, 4px auf Eingabefeldern, vollständige Pillen auf Status-Badges und Tags. Server werden als abgerundete quadratische Avatare mit 48px dargestellt, die beim Hover zu Kreisen werden — eine kleine Bewegung, die Teil der Markenidentität geworden ist.

**Key Characteristics:**
- Dunkle Oberflächen: `#1e1f22` / `#2b2d31` / `#313338` (3-stufige Tiefe)
- Blurple `#5865f2` als einziger gesättigter Akzent auf der Chat-Oberfläche
- gg sans (Whitney-Stil) für alle Texte — freundlich, geometrisch, neutral
- Abgerundete quadratische Server-Avatare (16px Radius), die beim Hover in Kreise wechseln
- Enger Chat-Zeilenabstand, großzügige Polsterung in Seitenpanels
- Status-Punkte: grün online, gelb abwesend, rot nicht stören, grau offline
- Pixel-exakte 1px-Trennlinien in dezenten Off-White-Tönen mit geringem Alpha

## 2. Farbpalette & Rollen

### Primär
- **Blurple** (`#5865f2`): Markenfarbe, primäre CTA, Erwähnungs-Hervorhebung.
- **Blurple Hover** (`#4752c4`): Hover/Aktiv-Zustand für Blurple.
- **Blurple Soft** (`#7289da`): Legacy-Blurple, sekundärer Akzent im Marketing.

### Oberfläche (Dunkles Design — Standard)
- **Background Tertiary** (`#1e1f22`): Server-Listen-Leiste, tiefster Hintergrund.
- **Background Secondary** (`#2b2d31`): Kanal-Seitenleiste, Einstellungs-Seitenleiste.
- **Background Primary** (`#313338`): Chat-Oberfläche, Nachrichtenspalte.
- **Background Floating** (`#111214`): Schwebende Popovers, Tooltips, Autovervollständigung.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Hover-Überlagerung auf Zeilen.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Aktive Zeile.

### Oberfläche (Helles Design)
- **Light Bg Primary** (`#ffffff`): Chat-Oberfläche im hellen Design.
- **Light Bg Secondary** (`#f2f3f5`): Seitenleiste im hellen Design.
- **Light Bg Tertiary** (`#e3e5e8`): Tiefste helle Oberfläche.

### Text
- **Header Primary** (`#f2f3f5`): Kanal-Header, Modal-Titel im dunklen Design.
- **Header Secondary** (`#b5bac1`): Gedämpfte Header.
- **Text Normal** (`#dbdee1`): Fließtext im dunklen Design — leicht kühler als reines Weiß.
- **Text Muted** (`#949ba4`): Zeitstempel, Server-Namen, sekundäre Metadaten.
- **Text Link** (`#00a8fc`): Hyperlinks in Nachrichten — Himmelblau, unterscheidbar von Blurple.
- **Channels Default** (`#80848e`): Inaktiver Kanalname in der Seitenleiste.

### Status & Semantisch
- **Status Online** (`#23a55a`): Online-Punkt, Erfolgszustände.
- **Status Idle** (`#f0b232`): Abwesend-Punkt, Away-Status.
- **Status DND** (`#f23f43`): Nicht stören, dient auch als destruktives Rot.
- **Status Streaming** (`#593695`): „Streaming"-Lila.
- **Status Offline** (`#80848e`): Offline-Grau.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Softer Blurple-Schimmer auf @mention-Zeilen.

### Rahmen & Trennlinien
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Standard-Trennlinie im dunklen Design.
- **Border Subtle** (`#3f4147`): Feste Trennlinie für Karten.

## 3. Typografie-Regeln

### Schriftfamilie
- **Body / UI / Headings**: `gg sans`, mit Fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (Legacy / Whitney)**: `Whitney`, mit Fallback: `gg sans`
- **Code / Mono**: `"gg mono"`, mit Fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Zeichenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Marketing-Hero |
| Seitenüberschrift | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Einstellungs-/Profil-Titel |
| Kanalname | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, Kanal-Header |
| Nachrichtentext | gg sans | 16px (1rem) | 400 | 1.375 | normal | Normaler Chat-Text |
| Benutzername | gg sans | 16px (1rem) | 500 | 1.25 | normal | Verfasser einer Nachricht |
| Zeitstempel | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | „Heute um 16:32 Uhr" |
| Seitenleisten-Kanal | gg sans | 16px (1rem) | 500 | 1.25 | normal | Zeilen der Kanalliste |
| Server-Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | Server-Header |
| Bildunterschrift / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Statustext, Bearbeitungs-Tag |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | Inline-`Code` |
| Code-Block | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | ```dreifach-umzäunter``` Block |

### Grundsätze
- **Freundliche Geometrie**: gg sans ersetzt Whitney mit abgerundeten Abschlüssen bei a/g/s — die Marke möchte Wärme vermitteln, ohne die Lesbarkeit zu beeinträchtigen.
- **Gewichtskontrast statt Farbkontrast**: Hierarchie entsteht durch Gewichtsschritte 400→500→600→700→800; die Oberfläche bleibt neutral.
- **16px Fließtext**: Chat-Nachrichten werden nicht unter 16px verkleinert. Dichte entsteht durch Zeilenhöhe (1.375), nicht durch Schriftgröße.

## 4. Komponentenstile

### Schaltflächen

**Primär**
- Hintergrund: `#5865f2`
- Text: `#ffffff`
- Innenabstand: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- Verwendung: Primäre CTAs, „Weiter", „Server beitreten"

**Sekundär**
- Hintergrund: `#4e5058`
- Text: `#ffffff`
- Innenabstand: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tertiär / Dezent (Link-Stil)**
- Hintergrund: transparent
- Text: `#dbdee1`
- Hover: Text unterstrichen, kein Hintergrundwechsel

**Destruktiv**
- Hintergrund: `#da373c`
- Text: `#ffffff`
- Hover: `#a12d2f`

### Eingabefelder
- Hintergrund: `#1e1f22`
- Text: `#dbdee1`
- Rahmen: 1px solid `#1e1f22`
- Radius: 4px
- Innenabstand: 10px 12px
- Fokus: Rahmen `#5865f2`

### Server-Avatare
- Größe: 48×48px
- Radius: 16px (abgerundetes Quadrat) standardmäßig; wechselt beim Hover und im aktiven Zustand zu 50%.
- Aktiver Zustand: 4px weiße Pille an der linken Kante der Symbol-Spalte.

### Status-Punkte
- Größe: 10×10px
- Rahmen: 3px solid background-tertiary (erzeugt den „Einschnitt"-Effekt)
- Position: unten rechts am Avatar.

### Karten / Einbettungen
- Hintergrund: `#2b2d31` (dunkel) oder `#f2f3f5` (hell)
- Linker Rahmen: 4px solid Einbettungs-Akzentfarbe.
- Radius: 4px
- Innenabstand: 8px 16px

### Erwähnungs-Pille
- Hintergrund: `rgba(88, 101, 242, 0.3)`
- Text: `#c9cdfb`
- Innenabstand: 0 2px
- Radius: 3px

## 5. Abstände & Layout

- **Basiseinheit**: 4px. Skala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Server-Leiste**: 72px breit, fest.
- **Kanal-Seitenleiste**: 240px breit.
- **Mitgliederliste**: 240px breit auf Desktop.
- **Chat-Spalte**: fluid, min. 380px.

## 6. Animation

- **Dauer**: 200ms für Hover; 350ms für die Avatar-Kreis-Verwandlung; 80ms für Tooltip-Einblendung.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` für die Avatar-Verwandlung (schneller Einstieg, dann Einpendeln).
- **Benachrichtigungs-Puls**: 1,4s ease-in-out infinite auf dem Ungelesen-Erwähnungs-Indikator.

## 7. Verwendungsrichtlinien

- Die dunkle Hülle, kompakte Dichte und Blurple-Aktionshierarchie gemeinsam beibehalten; Blurple auf einem hellen Marketing-Layout wirkt dem Discord-Produktgefühl entgegen.
- Navigationsintensive Oberflächen um Leisten, Seitenleisten und Chat-Spalten strukturieren statt um isolierte dekorative Karten.
- Die abgerundete quadratische Avatar- und Status-Punkt-Sprache verwenden, wenn Personen, Server oder aktive Präsenz dargestellt werden.
