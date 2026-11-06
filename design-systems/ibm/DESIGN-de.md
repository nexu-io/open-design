# Von IBM inspiriertes Designsystem

> Category: Medien & Verbraucher
> Enterprise-Technologie. Carbon-Designsystem, strukturierte blaue Farbpalette.

## 1. Visuelles Thema & Atmosphäre

IBMs Website ist die digitale Verkörperung von Unternehmensautorität, die auf dem Carbon Design System aufgebaut wurde – einer Designsprache, die so methodisch strukturiert ist, dass sie wie eine als Webseite dargestellte Ingenieurspezifikation wirkt. Die Seite arbeitet mit einer starken Dualität: ein helles weißes (`#ffffff`) Canvas mit nahezu schwarzem (`#161616`) Text, durchbrochen von einem einzigen, unveränderlichen Akzent – IBM Blue 60 (`#0f62fe`). Das ist kein verspielter Minimalismus eines Tech-Startups; es ist Unternehmensgenauigkeit, in Pixel destilliert. Jedes Element existiert innerhalb von Carbons strengem 2x-Raster, jede Farbe wird einem semantischen Token zugeordnet, jeder Abstandswert rastet auf der 8px-Basiseinheit ein.

Die IBM-Plex-Schriftfamilie ist das Rückgrat des Systems. IBM Plex Sans in Light-Stärke (300) für Display-Überschriften erzeugt in großen Größen eine überraschend luftige, fast zarte Qualität – ein bewusstes Gegengewicht zu IBMs Unternehmensschwergewicht. Bei Textgrößen führt Regular-Gewicht (400) mit 0,16px Letter-Spacing bei 14px-Bildunterschriften das sorgfältige Mikro-Tracking ein, das den Carbon-Text eher ingenieursmäßig als gestalterisch wirken lässt. IBM Plex Mono dient für Code, Daten und technische Beschriftungen und vervollständigt die Familientrinität neben dem selten eingesetzten IBM Plex Serif.

Was IBMs visuelle Identität jenseits von Monochrom und Blau definiert, ist die Abhängigkeit vom Carbon-Komponenten-Token-System. Jeder interaktive Zustand wird einer CSS-Custom-Property mit dem Präfix `--cds-` (Carbon Design System) zugeordnet. Buttons haben keine hartcodierten Farben; sie referenzieren `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Diese tokenisierte Architektur bedeutet, dass die gesamte visuelle Ebene eine dünne Hülle über einem tief systematischen Fundament ist – das Designäquivalent einer gut typisierten API.

**Hauptmerkmale:**
- IBM Plex Sans in Gewicht 300 (Light) für Display – Unternehmensgewicht durch typografische Zurückhaltung
- IBM Plex Mono für Code und technische Inhalte mit konsistentem 0,16px Letter-Spacing bei kleinen Größen
- Einzelne Akzentfarbe: IBM Blue 60 (`#0f62fe`) – jedes interaktive Element, jeder CTA, jeder Link
- Carbon-Token-System (`--cds-*`) für alle semantischen Farben, ermöglicht Theme-Switching auf Variablenebene
- 8px-Abstandsraster mit strikter Einhaltung – keine beliebigen Werte, alles ausgerichtet
- Flache, rahmenlose Karten auf `#f4f4f4` Gray-10-Oberfläche – Tiefe durch Hintergrundfarben-Layering, nicht durch Schatten
- Unterkanten-Eingabefelder (keine Rahmen-Boxen) – das charakteristische Carbon-Formularmuster
- 0px Rahmenradius bei primären Buttons – kompromisslos rechteckig, keine Abrundung

## 2. Farbpalette & Rollen

### Primär
- **IBM Blue 60** (`#0f62fe`): Die einzige interaktive Farbe. Primäre Buttons, Links, Fokuszustände, aktive Indikatoren. Dies ist der einzige chromatische Farbton in der Kern-UI-Palette.
- **Weiß** (`#ffffff`): Seitenhintergrund, Kartenoberflächen, Button-Text auf Blau, `--cds-background`.
- **Gray 100** (`#161616`): Primärtext, Überschriften, dunkle Oberflächenhintergründe, Navigationsleiste, Fußzeile. `--cds-text-primary`.

### Neutrale Skala (Gray-Familie)
- **Gray 100** (`#161616`): Primärtext, Überschriften, dunkles UI-Chrome, Fußzeilenhintergrund.
- **Gray 90** (`#262626`): Sekundäre dunkle Oberflächen, Hover-Zustände auf dunklen Hintergründen.
- **Gray 80** (`#393939`): Tertiäres Dunkel, aktive Zustände.
- **Gray 70** (`#525252`): Sekundärtext, Hilfstext, Beschreibungen. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Platzhaltertext, deaktivierter Text.
- **Gray 50** (`#8d8d8d`): Deaktivierte Icons, gedämpfte Beschriftungen.
- **Gray 30** (`#c6c6c6`): Rahmen, Trennlinien, Eingabe-Unterkanten. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Subtile Rahmen, Kartenumrisse.
- **Gray 10** (`#f4f4f4`): Sekundärer Oberflächenhintergrund, Kartenfüllung, wechselnde Zeilen. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Hover-Zustand für Gray-10-Oberflächen.

### Interaktiv
- **Blue 60** (`#0f62fe`): Primär interaktiv – Buttons, Links, Fokus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Link-Hover-Zustand. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Aktiv-/Gedrückt-Zustand für blaue Elemente.
- **Blue 10** (`#edf5ff`): Blaue Tint-Oberfläche, ausgewählter Zeilenhintergrund.
- **Focus Blue** (`#0f62fe`): `--cds-focus` – 2px Inset-Rahmen bei fokussierten Elementen.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` – weißer Innenring für Fokus auf dunklen Hintergründen.

### Unterstützung & Status
- **Red 60** (`#da1e28`): Fehler, Gefahr. `--cds-support-error`.
- **Green 50** (`#24a148`): Erfolg. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Warnung. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informational. `--cds-support-info`.

### Dunkles Theme (Gray-100-Theme)
- **Hintergrund**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Karten- und Containeroberflächen.
- **Layer 02**: Gray 80 (`#393939`). Erhöhte Oberflächen.
- **Primärtext**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Sekundärtext**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Subtiler Rahmen**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interaktiv**: Blue 40 (`#78a9ff`). Links und interaktive Elemente werden für Kontrast heller.

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `IBM Plex Sans`, mit Fallbacks: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, mit Fallbacks: `Menlo, Courier, monospace`
- **Serif** (eingeschränkte Verwendung): `IBM Plex Serif`, für redaktionelle/expressive Kontexte
- **Icon-Schrift**: `ibm_icons` – proprietäre Icon-Glyphen bei 20px

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Letter-Spacing | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Maximale Wirkung, leichtes Gewicht für Eleganz |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Sekundärer Hero, responsiver Fallback |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Expressiver Überschrift |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Abschnittsüberschriften |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Unterabschnittstitel |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Kartentitel, Feature-Header |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Leichtere Kartenüberschriften |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Standard-Lesetext |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Betonter Fließtext, Beschriftungen |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Kompakter Fließtext, Bildunterschriften |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Fette Bildunterschriften, Nav-Elemente |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadaten, Zeitstempel |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Inline-Code, Terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Codeblöcke |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Hero-Mono-Dekoration |

### Grundsätze
- **Leichtes Gewicht bei Display-Größen**: Carbons expressiver Typsatz verwendet Gewicht 300 (Light) ab 42px+. Das erzeugt eine unverkennbare Spannung – der Inhalt spricht mit Unternehmensautorität, während die Buchstabenformen mit typografischer Leichtigkeit flüstern.
- **Mikro-Tracking bei kleinen Größen**: 0,16px Letter-Spacing bei 14px und 0,32px bei 12px. Diese scheinbar unbedeutenden Werte sind Carbons Geheimwaffe für Lesbarkeit bei kompakten Größen – sie öffnen die engen IBM-Plex-Buchstabenformen gerade genug.
- **Drei funktionale Gewichte**: 300 (Display/Expressiv), 400 (Text/Lesen), 600 (Betonung/UI-Beschriftungen). Gewicht 700 fehlt absichtlich im Produktions-Typsystem.
- **Produktiv vs. Expressiv**: Produktive Sets verwenden engere Zeilenhöhen (1,29) für dichte UI. Expressive Sets atmen mehr (1,40–1,50) für Marketing- und redaktionelle Inhalte.

## 4. Komponenten-Styling

### Buttons

**Primärer Button (Blau)**
- Hintergrund: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Text: `#ffffff` (Weiß)
- Padding: 14px 63px 14px 15px (asymmetrisch – Platz für nachfolgendes Icon)
- Rahmen: 1px solid transparent
- Rahmenradius: 0px (scharfes Rechteck – das Carbon-Erkennungszeichen)
- Höhe: 48px (Standard), 40px (kompakt), 64px (expressiv)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Aktiv: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Fokus: `2px solid #0f62fe` Inset + `1px solid #ffffff` Innen

**Sekundärer Button (Grau)**
- Hintergrund: `#393939` (Gray 80)
- Text: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Aktiv: `#6f6f6f` (Gray 60)
- Gleiche Padding/Radius wie primär

**Tertiärer Button (Ghost Blue)**
- Hintergrund: transparent
- Text: `#0f62fe` (Blue 60)
- Rahmen: 1px solid `#0f62fe`
- Hover: `#0353e9` Text + Blue-10-Hintergrundtönung
- Rahmenradius: 0px

**Ghost-Button**
- Hintergrund: transparent
- Text: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Rahmen: keiner
- Hover: `#e8e8e8` Hintergrundtönung

**Danger-Button**
- Hintergrund: `#da1e28` (Red 60)
- Text: `#ffffff`
- Hover: `#b81921` (Red 70)

### Karten & Container
- Hintergrund: `#ffffff` bei weißem Theme, `#f4f4f4` (Gray 10) bei erhöhten Karten
- Rahmen: kein (flaches Design – kein Rahmen oder Schatten bei den meisten Karten)
- Rahmenradius: 0px (passend zur rechteckigen Button-Ästhetik)
- Hover: Hintergrund wechselt zu `#e8e8e8` (Gray 10 Hover) bei klickbaren Karten
- Inhaltspadding: 16px
- Trennung: Hintergrundfarben-Layering (weiß → grau 10 → weiß) statt Schatten

### Eingabefelder & Formulare
- Hintergrund: `#f4f4f4` (Gray 10) — `--cds-field`
- Text: `#161616` (Gray 100)
- Padding: 0px 16px (nur horizontal)
- Höhe: 40px (Standard), 48px (groß)
- Rahmen: keine Seiten/Oberkante — `2px solid transparent` Unterkante
- Aktive Unterkante: `2px solid #161616` (Gray 100)
- Fokus: `2px solid #0f62fe` (Blue 60) Unterkante — `--cds-focus`
- Fehler: `2px solid #da1e28` (Red 60) Unterkante
- Beschriftung: 12px IBM Plex Sans, 0,32px Letter-Spacing, Gray 70
- Hilfstext: 12px, Gray 60
- Platzhalter: Gray 60 (`#6f6f6f`)
- Rahmenradius: 0px (oben) — Eingabefelder haben scharfe Ecken

### Navigation
- Hintergrund: `#161616` (Gray 100) — vollbreites dunkles Masthead
- Höhe: 48px
- Logo: IBM 8-Balken-Logo, weiß auf dunkel, linksbündig
- Links: 14px IBM Plex Sans, Gewicht 400, `#c6c6c6` (Gray 30) Standard
- Link-Hover: `#ffffff` Text
- Aktiver Link: `#ffffff` mit Unterkanten-Indikator
- Plattform-Switcher: linksbündige horizontale Tabs
- Suche: Icon-ausgelöstes Slide-out-Suchfeld
- Mobil: Hamburger mit links schiebendem Panel

### Links
- Standard: `#0f62fe` (Blue 60) ohne Unterstreichung
- Hover: `#0043ce` (Blue 70) mit Unterstreichung
- Besucht: bleibt Blue 60 (keine Änderung des besuchten Zustands)
- Inline-Links: im Fließtext standardmäßig unterstrichen

### Charakteristische Komponenten

**Inhaltsblock (Hero/Feature)**
- Vollbreite abwechselnde weiß/grau-10-Hintergrundbänder
- Überschrift linksbündig mit 60px oder 48px Display-Typ
- CTA als blauer primärer Button mit Pfeil-Icon
- Bild/Illustration auf Mobil rechtsbündig oder darunter

**Kachel (Klickbare Karte)**
- Hintergrund: `#f4f4f4` oder `#ffffff`
- Vollbreite Unterkante oder Hintergrundfarbwechsel beim Hover
- Pfeil-Icon rechts unten beim Hover
- Kein Schatten – Flachheit ist die Identität

**Tag/Label**
- Hintergrund: kontextuelle Farbe bei 10% Deckkraft (z. B. Blue 10, Red 10)
- Text: entsprechende 60er-Grade-Farbe
- Padding: 4px 8px
- Rahmenradius: 24px (Pill – Ausnahme von der 0px-Regel)
- Schrift: 12px Gewicht 400

**Benachrichtigungsbanner**
- Vollbreiter Balken, typischerweise Blue-60- oder Gray-100-Hintergrund
- Weißer Text, 14px
- Schließen/Verwerfen-Icon rechtsbündig

## 5. Layoutprinzipien

### Abstandssystem
- Basiseinheit: 8px (Carbon 2x-Raster)
- Komponentenabstandsskala: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Layoutabstandsskala: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini-Einheit: 8px (kleinster verwendbarer Abstand)
- Padding innerhalb von Komponenten: typischerweise 16px
- Abstand zwischen Karten/Kacheln: 1px (Haarlinie) oder 16px (Standard)

### Raster & Container
- 16-Spalten-Raster (Carbons 2x-Rastersystem)
- Maximale Inhaltsbreite: 1584px (maximaler Breakpoint)
- Spalten-Gutters: 32px (16px auf Mobil)
- Margin: 16px (Mobil), 32px (Tablet+)
- Inhalt erstreckt sich typischerweise über 8–12 Spalten für lesbare Zeilenlängen
- Vollbleed-Abschnitte wechseln mit enthaltenen Inhalten ab

### Weißraum-Philosophie
- **Funktionelle Dichte**: Carbon bevorzugt produktive Dichte gegenüber expansivem Weißraum. Abschnitte sind im Vergleich zu Consumer-Designsystemen eng gepackt – das spiegelt IBMs Enterprise-DNA wider.
- **Hintergrundfarben-Zonierung**: Anstelle von massivem Padding zwischen Abschnitten verwendet IBM abwechselnde Hintergrundfarben (weiß → grau 10 → weiß), um visuelle Trennung mit minimalem vertikalem Platz zu erzeugen.
- **Konsistenter 48px-Rhythmus**: Wichtige Abschnittsübergänge verwenden 48px vertikalen Abstand. Hero-Abschnitte können 80px–96px verwenden.

### Rahmenradius-Skala
- **0px**: Primäre Buttons, Eingabefelder, Kacheln, Karten – die dominante Behandlung. Carbon ist fundamental rechteckig.
- **2px**: Gelegentlich bei kleinen interaktiven Elementen (Tags)
- **24px**: Tags/Labels (Pill-Form – die einzige gerundete Ausnahme)
- **50%**: Avatar-Kreise, Icon-Container

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flat (Ebene 0) | Kein Schatten, `#ffffff` Hintergrund | Standard-Seitenoberfläche |
| Layer 01 | Kein Schatten, `#f4f4f4` Hintergrund | Karten, Kacheln, wechselnde Abschnitte |
| Layer 02 | Kein Schatten, `#e0e0e0` Hintergrund | Erhöhte Panels innerhalb von Layer 01 |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Dropdowns, Tooltips, Overflow-Menüs |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + dunkles Scrim | Modal-Dialoge, Seitenpanels |
| Fokus | `2px solid #0f62fe` Inset + `1px solid #ffffff` | Tastaturfokusring |
| Unterkante | `2px solid #161616` an der Unterkante | Aktives Eingabefeld, aktiver Tab-Indikator |

**Schattenphilosophie**: Carbon meidet Schatten absichtlich. IBM erreicht Tiefe primär durch Hintergrundfarben-Layering – durch Stapeln von Oberflächen in zunehmend dunklerem Grau statt durch Hinzufügen von Box-Shadows. Das erzeugt eine flache, druckinspirierte Ästhetik, bei der Hierarchie durch Farbwert und nicht durch simuliertes Licht kommuniziert wird. Schatten sind ausschließlich für schwebende Elemente reserviert (Dropdowns, Tooltips, Modals), bei denen das Element den Inhalt tatsächlich überlagert. Diese Zurückhaltung verleiht dem seltenen Schatten bedeutsame Wirkung – wenn in Carbon etwas schwebt, ist es wichtig.

## 7. Dos und Don'ts

### Dos
- IBM Plex Sans in Gewicht 300 für Display-Größen (42px+) verwenden – die Leichtigkeit ist beabsichtigt
- 0,16px Letter-Spacing bei 14px-Fließtext und 0,32px bei 12px-Bildunterschriften anwenden
- 0px Rahmenradius für Buttons, Eingabefelder, Karten und Kacheln – Rechtecke sind das System
- Bei der Implementierung `--cds-*`-Token-Namen referenzieren (z. B. `--cds-button-primary`, `--cds-text-primary`)
- Hintergrundfarben-Layering (weiß → grau 10 → grau 20) für Tiefe statt Schatten verwenden
- Unterkanten (keine Boxen) für Eingabefeld-Indikatoren verwenden
- 48px Standard-Button-Höhe und asymmetrisches Padding für Icon-Unterbringung beibehalten
- Blue 60 (`#0f62fe`) als einzige Akzentfarbe anwenden – ein Blau, das alles regiert

### Don'ts
- Keine runden Button-Ecken – 0px Radius ist die Carbon-Identität
- Keine Schatten auf Karten oder Kacheln – Flachheit ist der Punkt
- Keine zusätzlichen Akzentfarben einführen – IBMs System ist monochrom + blau
- Kein Gewicht 700 (Bold) – die Skala endet bei 600 (Semibold)
- Kein Letter-Spacing zu Display-Texten hinzufügen – Tracking gilt nur für 14px und darunter
- Eingabefelder nicht mit vollständigen Rahmen boxen – Carbon-Eingaben verwenden nur Unterkanten
- Keine Verlaufshintergründe – IBMs Oberflächen sind flache Vollfarben
- Nicht vom 8px-Abstandsraster abweichen – jeder Wert sollte durch 8 teilbar sein (mit 2px und 4px für Mikro-Anpassungen)

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wichtige Änderungen |
|------|-------|-------------|
| Small (sm) | 320px | Einzelspalte, Hamburger-Navigation, 16px Margins |
| Medium (md) | 672px | 2-Spalten-Raster beginnt, erweiterter Inhalt |
| Large (lg) | 1056px | Vollständige Navigation sichtbar, 3–4-Spalten-Raster |
| X-Large (xlg) | 1312px | Maximale Inhaltsdichte, breite Layouts |
| Max | 1584px | Maximale Inhaltsbreite, zentriert mit Margins |

### Touch-Ziele
- Button-Höhe: 48px Standard, Minimum 40px (kompakt)
- Navigationslinks: 48px Zeilenhöhe für Touch
- Eingabefeldgröße: 40px Standard, 48px groß
- Icon-Buttons: 48px quadratisches Touch-Ziel
- Mobile Menüelemente: vollbreite 48px-Zeilen

### Zusammenfall-Strategie
- Hero: 60px Display → 42px → 32px Überschrift bei schmalem Viewport
- Navigation: vollständiges horizontales Masthead → Hamburger mit herausschiebendem Panel
- Raster: 4-spaltig → 2-spaltig → einzelne Spalte
- Kacheln/Karten: horizontales Raster → vertikaler Stapel
- Bilder: Seitenverhältnis beibehalten, max-width 100%
- Fußzeile: mehrspaltiger Link-Gruppen → gestapelte Einzelspalte
- Abschnittspadding: 48px → 32px → 16px

### Bildverhalten
- Responsive Bilder mit `max-width: 100%`
- Produktillustrationen skalieren proportional
- Hero-Bilder können von nebeneinander zu unten gestapelt wechseln
- Datenvisualisierungen behalten das Seitenverhältnis bei und scrollen horizontal auf Mobil

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primäres CTA: IBM Blue 60 (`#0f62fe`)
- Hintergrund: Weiß (`#ffffff`)
- Überschriftentext: Gray 100 (`#161616`)
- Fließtext: Gray 100 (`#161616`)
- Sekundärtext: Gray 70 (`#525252`)
- Oberfläche/Karte: Gray 10 (`#f4f4f4`)
- Rahmen: Gray 30 (`#c6c6c6`)
- Link: Blue 60 (`#0f62fe`)
- Link-Hover: Blue 70 (`#0043ce`)
- Fokusring: Blue 60 (`#0f62fe`)
- Fehler: Red 60 (`#da1e28`)
- Erfolg: Green 50 (`#24a148`)

### Beispiel-Komponentenprompts
- "Erstelle einen Hero-Abschnitt auf weißem Hintergrund. Überschrift bei 60px IBM Plex Sans Gewicht 300, Zeilenhöhe 1,17, Farbe #161616. Untertitel bei 16px Gewicht 400, Zeilenhöhe 1,50, Farbe #525252, maximale Breite 640px. Blauer CTA-Button (#0f62fe Hintergrund, #ffffff Text, 0px Rahmenradius, 48px Höhe, 14px 63px 14px 15px Padding)."
- "Gestalte eine Kartenkachel: #f4f4f4 Hintergrund, 0px Rahmenradius, 16px Padding. Titel bei 20px IBM Plex Sans Gewicht 600, Zeilenhöhe 1,40, Farbe #161616. Fließtext bei 14px Gewicht 400, Letter-Spacing 0,16px, Zeilenhöhe 1,29, Farbe #525252. Hover: Hintergrund wechselt zu #e8e8e8."
- "Baue ein Formularfeld: #f4f4f4 Hintergrund, 0px Rahmenradius, 40px Höhe, 16px horizontales Padding. Beschriftung oben bei 12px Gewicht 400, Letter-Spacing 0,32px, Farbe #525252. Unterkante: 2px solid transparent Standard, 2px solid #0f62fe beim Fokus. Platzhalter: #6f6f6f."
- "Erstelle eine dunkle Navigationsleiste: #161616 Hintergrund, 48px Höhe. IBM-Logo weiß linksbündig. Links bei 14px IBM Plex Sans Gewicht 400, Farbe #c6c6c6. Hover: #ffffff Text. Aktiv: #ffffff mit 2px Unterkante."
- "Baue eine Tag-Komponente: Blue-10-(#edf5ff)-Hintergrund, Blue-60-(#0f62fe)-Text, 4px 8px Padding, 24px Rahmenradius, 12px IBM Plex Sans Gewicht 400."

### Iterations-Leitfaden
1. Immer 0px Rahmenradius bei Buttons, Eingabefeldern und Karten – das ist in Carbon nicht verhandelbar
2. Letter-Spacing nur bei kleinen Größen: 0,16px bei 14px, 0,32px bei 12px – niemals bei Display-Text
3. Drei Gewichte: 300 (Display), 400 (Text), 600 (Betonung) – kein Bold
4. Blue 60 ist die einzige Akzentfarbe – keine sekundären Akzenttöne einführen
5. Tiefe kommt von Hintergrundfarben-Layering (weiß → `#f4f4f4` → `#e0e0e0`), nicht von Schatten
6. Eingaben haben nur Unterkante, niemals vollständig gerahmt
7. `--cds-`-Präfix für Token-Benennung verwenden, um Carbon-kompatibel zu bleiben
8. 48px ist die universelle Höhe für interaktive Elemente
