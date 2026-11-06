# Design System Inspired by GitHub

> Category: Entwicklerwerkzeuge
> Code-zentrierte Plattform. Funktionale Dichte, Blau-auf-Weiß-Präzision, Primer-Grundlagen.

## 1. Visuelles Thema & Atmosphäre

GitHubs Oberfläche ist ingenieurmäßig gestaltet, nicht dekoriert. Jeder Pixel setzt eine klare Haltung: Dies ist ein Werkzeug für Menschen, denen Diffs, Builds und Pull Requests wichtig sind. Der Seitenhintergrund ist ein klares `#ffffff` (hell) oder `#0d1117` (dunkel), mit Inhalten auf dichten rechteckigen Bereichen, die durch haarfeine Rahmen statt Weißraum getrennt sind. Informationsdichte ist das Markenzeichen — Listenzeilen, Code-Zeilen, Repository-Header und Benachrichtigungskarten sind eng zusammengepackt, damit ein erfahrener Nutzer hundert Einträge ohne Scrollen überfliegen kann.

Die charakteristischen Akzente sind das **Primer-Blau** (`#0969da`) für Links und primäre Aktionen sowie das **GitHub-Grün** (`#1a7f37`) für Merge-Zustände, Erfolg und den Merge-Button selbst. Beide wirken leicht gedämpft im Vergleich zu Consumer-Produkt-Blau- und -Grüntönen — gesättigt genug, um sich gegen den dichten grauen Text abzuheben, zurückhaltend genug, um im Hintergrund zu verschwinden, wenn mehrere davon in einem Viewport erscheinen.

Die Typografie verwendet den **system-ui**-Stack im gesamten Produkt, sodass Text auf jedem Betriebssystem scharf gerendert wird, ergänzt durch **SFMono / Menlo / Consolas** für Code. Es gibt keine redaktionelle Display-Schrift; GitHubs Stimme ist die Stimme des Systems, das Sie bereits verwenden.

**Hauptmerkmale:**
- Reines Weiß als Hintergrund (`#ffffff`) oder tiefes Marineschwarz (`#0d1117`) — keine Wärme, kein Farbton
- Haarfeine graue Rahmen (`#d0d7de`) definieren jeden Bereich und jedes Panel
- Primer-Blau (`#0969da`) für Links/Primäraktionen; GitHub-Grün (`#1a7f37`) für Erfolg/Merge
- system-ui für Fließtext; SFMono für Code — keine eigene Schriftart
- Dichte Listenzeilen mit minimalem Innenabstand; Weißraum ist selten
- Octicon-Symbolik bei 16px / 24px — einzeiliger Strich, geometrisch, konsistent
- Pillenförmige Status-Badges mit starker Farbsemantik

## 2. Farbpalette & Rollen

### Primär
- **Canvas Default** (`#ffffff`): Primärer Seitenhintergrund, helles Theme.
- **Canvas Subtle** (`#f6f8fa`): Sekundäre Oberfläche, Seitenleiste, Eingabehintergrund, Header-Streifen.
- **Canvas Inset** (`#eaeef2`): Code-Block-Hintergrund, tief eingebettete Oberfläche.
- **Fg Default** (`#1f2328`): Primärtext, Überschriften, Schrift.
- **Fg Muted** (`#656d76`): Sekundärtext, Bildunterschriften, Dateipfade.

### Markenakzent
- **Primer Blue** (`#0969da`): Links, primäre CTAs, Fokusring-Basis — die universelle interaktive Farbe.
- **Primer Blue Hover** (`#0550ae`): Hover/Gedrückt für primäres Blau.
- **Accent Subtle** (`#ddf4ff`): Weiche blaue Oberfläche für Hinweise, Info-Banner.

### Semantisch
- **Success / Merge Green** (`#1a7f37`): Gemergte PRs, Erfolgs-Badges, Merge-Button.
- **Success Subtle** (`#dafbe1`): Heller Erfolgsfarbton.
- **Open Green** (`#1a7f37`): „Open"-Zustand für Issues/PRs.
- **Closed / Danger Red** (`#cf222e`): Geschlossene PRs, destruktive Aktion, Validierungsfehler.
- **Danger Subtle** (`#ffebe9`): Fehler-Banner-Oberfläche.
- **Attention / Warning Yellow** (`#9a6700`): Warnungstext auf Bernsteinoberfläche.
- **Attention Subtle** (`#fff8c5`): Warnungs-Banner-Oberfläche.
- **Done Purple** (`#8250df`): Gemergt und archiviert, „Erledigt"-Zustand, Premium-Badge.
- **Sponsor Pink** (`#bf3989`): Sponsors-Herz, GitHub Sponsors-Marke.

### Rahmen & Trennlinie
- **Border Default** (`#d0d7de`): Standard-Haarrahmen, Panel-Umriss.
- **Border Muted** (`#d8dee4`): Innere Trennlinien innerhalb eines Panels.
- **Border Subtle** (`#eaeef2`): Dezente Tabellenzeilen-Trennlinien.

### Dunkles Theme
- **Dark Canvas** (`#0d1117`): Dunkler Seitenhintergrund.
- **Dark Surface** (`#161b22`): Seitenleiste, Header, sekundäre Oberfläche.
- **Dark Border** (`#30363d`): Standard-Rahmen im Dunkelmodus.
- **Dark Fg** (`#e6edf3`): Primärtext auf dunklem Hintergrund.

## 3. Typografieregeln

### Schriftfamilie
- **Fließtext / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Code / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Repository-Header, Marketing-Hero |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Seitenüberschrift |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Abschnittsüberschrift |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Unterabschnitt, Panel-Header |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Standard-Textgröße — nicht 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Bildunterschriften, Datei-Metadaten |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Code-Blöcke, Diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Inline-`code`-Spans |

### Grundsätze
- **14px Fließtext, nicht 16px**: GitHubs Prosadichte ist seine Identität. Das Produkt wird bei 14px gelesen, um mehr Zeilen in einen Viewport zu passen.
- **Gewicht binär**: 400 standardmäßig für alles; 600 für Überschriften und Hervorhebungen. Kein 500, kein 700.
- **Systemschriften immer**: Niemals eine Webfont für Chrome laden — Text muss bei langsamen Verbindungen sofort gerendert werden.

## 4. Komponenten-Stile

### Buttons

**Primär (Grün)**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- Verwendung: „Repository erstellen", „Pull Request mergen"

**Standard**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, border `#d0d7de`

**Outline (Blauer Link-Stil)**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`, text `#ffffff`

**Gefahr**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`, text `#ffffff`, border `#a40e26`

### Karten / Boxen
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (Header) + 16px (Body)
- Header hat einen `#f6f8fa`-Streifen mit unterem Rahmen.

### Eingabefelder
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Fokus: border `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### Status-Pillen (Issue / PR)
- **Open**: background `#1a7f37`, Text weiß, padding 4px 10px, radius 9999px.
- **Closed**: background `#cf222e`, Text weiß.
- **Merged**: background `#8250df`, Text weiß.
- **Draft**: background `#6e7781`, Text weiß.

### Labels (Tags für Issues/PRs)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- Hintergrund und Text sind programmatisch (Label-Farbe → Text für Kontrast berechnet).

## 5. Abstände & Layout

- **Basiseinheit**: 4px. Abstands-Skala: 4, 8, 12, 16, 24, 32, 40, 48.
- **Maximale Seitenbreite**: 1280px (`Container-xl`).
- **Seitenleiste**: 296px auf Desktop, bricht unter 1012px zusammen.
- **Zeilen-Padding**: 16px horizontal, 12px vertikal (Listen sind konstruktionsbedingt dicht).

## 6. Animation

- **Dauer**: 80ms für Hover; 200ms für Menü-/Popover-Öffnung.
- **Easing**: `ease-out` beim Öffnen, `ease-in` beim Schließen.
- **Vermieden**: Seitenlade-Animation, Parallax, persistente Micro-Interactions. Dinge erscheinen; sie performen nicht.

## 7. Verwendungsrichtlinien

- Dichte Listen, umrahmte Boxen und Systemtypografie zusammenhalten; isolierte grüne Buttons allein reichen nicht aus, um eine GitHub-ähnliche Produktoberfläche zu erzeugen.
- Grün für konstruktive Repository-Aktionen verwenden, Blau für Links und Fokus, und Rot/Lila/Grau nur für Issue-, PR- und Workflow-Zustände.
- Ruhige Benutzeroberfläche, explizite Rahmen und kompakte Abstände gegenüber dekorativen Schatten oder großen Marketing-Karten bevorzugen.
