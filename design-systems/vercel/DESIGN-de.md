# Design System Inspired by Vercel

> Category: Entwicklerwerkzeuge
> Frontend-Deployment. Schwarz-weiß-Präzision, Geist-Schrift.

## 1. Visuelles Thema & Atmosphäre

Vercels Website ist die visuelle These einer unsichtbar gemachten Entwickler-Infrastruktur — ein Designsystem so zurückgehalten, dass es beinahe philosophisch wirkt. Die Seite ist überwältigend weiß (`#ffffff`) mit nahezu schwarzem (`#171717`) Text und erzeugt eine galerieartige Leere, in der jedes Element seinen Pixel verdienen muss. Das ist kein Minimalismus als Dekoration; es ist Minimalismus als Ingenieursgrundlage. Das Geist-Designsystem behandelt die Oberfläche wie ein Compiler seinen Code — jedes überflüssige Token wird entfernt, bis nur noch Struktur übrig bleibt.

Die eigens entwickelte Geist-Schriftfamilie ist das Herzstück. Geist Sans verwendet aggressives negatives Laufweite (-2,4 px bis -2,88 px bei Display-Größen), wodurch Überschriften komprimiert, dringend und engineeringhaft wirken — wie Code, der für die Produktion minifiziert wurde. Bei Fließtextgrößen entspannt sich die Laufweite, die geometrische Präzision bleibt jedoch bestehen. Geist Mono ergänzt das System als Monospace-Begleiter für Code, Terminalausgaben und technische Beschriftungen. Beide Schriften aktivieren OpenType `"liga"` (Ligaturen) global, was eine Ebene typografischer Raffinesse hinzufügt, die beim genauen Lesen belohnt.

Was Vercel von anderen monochromen Designsystemen unterscheidet, ist die Philosophie des Schattens als Rahmen. Anstelle traditioneller CSS-Rahmen verwendet Vercel `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — einen Schatten ohne Versatz, ohne Unschärfe und mit 1 px Ausdehnung, der eine rahmenartige Linie erzeugt, ohne die Auswirkungen des Box-Modells. Diese Technik erlaubt es, Rahmen auf der Schattenebene anzusiedeln, was weichere Übergänge, abgerundete Ecken ohne Beschnitt und ein subtileres visuelles Gewicht als traditionelle Rahmen ermöglicht. Das gesamte Tiefensystem basiert auf gestapelten Mehrfachwerten von Schattenlisten, wobei jede Schicht einem bestimmten Zweck dient: eine für den Rahmen, eine für sanfte Erhebung, eine für Umgebungstiefe.

**Wesentliche Merkmale:**
- Geist Sans mit extremer negativer Laufweite (-2,4 px bis -2,88 px bei Display) — Text als komprimierte Infrastruktur
- Geist Mono für Code und technische Beschriftungen mit OpenType `"liga"` global
- Schatten-als-Rahmen-Technik: `box-shadow 0px 0px 0px 1px` ersetzt traditionelle Rahmen durchgehend
- Mehrschichtige Schattenstapel für nuancierte Tiefe (Rahmen + Erhebung + Umgebung in einzelnen Deklarationen)
- Nahezu reiner weißer Hintergrund mit `#171717`-Text — kein reines Schwarz, erzeugt einen Hauch Kontrastweichheit
- Workflow-spezifische Akzentfarben: Ship-Rot (`#ff5b4f`), Vorschau-Pink (`#de1d8d`), Entwicklungs-Blau (`#0a72ef`)
- Fokusliniensystem mit `hsla(212, 100%, 48%, 1)` — ein gesättigtes Blau für Barrierefreiheit
- Pill-Badges (9999 px) mit getönten Hintergründen für Statusanzeigen

## 2. Farbpalette & Rollen

### Primär
- **Vercel-Schwarz** (`#171717`): Primärtext, Überschriften, dunkle Flächenhintergründe. Kein reines Schwarz — die leichte Wärme verhindert Härte.
- **Reines Weiß** (`#ffffff`): Seitenhintergrund, Kartenoberflächen, Schaltflächentext auf Dunkel.
- **Echtes Schwarz** (`#000000`): Sekundäre Verwendung, `--geist-console-text-color-default`, in spezifischen Konsolen-/Code-Kontexten eingesetzt.

### Workflow-Akzentfarben
- **Ship-Rot** (`#ff5b4f`): `--ship-text`, der Workflow-Schritt „in Produktion deployen" — warmes, dringendes Korallrot.
- **Vorschau-Pink** (`#de1d8d`): `--preview-text`, der Vorschau-Deployment-Workflow — lebhaftes Magentapink.
- **Entwicklungs-Blau** (`#0a72ef`): `--develop-text`, der Entwicklungs-Workflow — helles, fokussiertes Blau.

### Konsolen-/Code-Farben
- **Konsolen-Blau** (`#0070f3`): `--geist-console-text-color-blue`, Syntaxhervorhebungs-Blau.
- **Konsolen-Lila** (`#7928ca`): `--geist-console-text-color-purple`, Syntaxhervorhebungs-Lila.
- **Konsolen-Pink** (`#eb367f`): `--geist-console-text-color-pink`, Syntaxhervorhebungs-Pink.

### Interaktiv
- **Link-Blau** (`#0072f5`): Primäre Linkfarbe mit Unterstreichung.
- **Fokus-Blau** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, Fokusring auf interaktiven Elementen.
- **Ring-Blau** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, Tailwind-Ring-Utility.

### Neutralskala
- **Grau 900** (`#171717`): Primärtext, Überschriften, Navigationstext.
- **Grau 600** (`#4d4d4d`): Sekundärtext, Beschreibungstext.
- **Grau 500** (`#666666`): Tertiärtext, gedämpfte Links.
- **Grau 400** (`#808080`): Platzhaltertext, deaktivierte Zustände.
- **Grau 100** (`#ebebeb`): Rahmen, Kartenumrisse, Trennlinien.
- **Grau 50** (`#fafafa`): Subtile Flächentönung, innerer Schattenlichtreflex.

### Fläche & Überlagerung
- **Überlagerungs-Hintergrund** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, Modal-/Dialoghintergrund.
- **Auswahltext** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, Textauswahlhervorhebung.
- **Badge-Blau-Hintergrund** (`#ebf5ff`): Pill-Badge-Hintergrund, getönte blaue Fläche.
- **Badge-Blau-Text** (`#0068d6`): Pill-Badge-Text, dunkleres Blau für Lesbarkeit.

### Schatten & Tiefe
- **Rahmenschatten** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): Das Markenzeichen — ersetzt traditionelle Rahmen.
- **Subtile Erhebung** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Minimale Anhebung für Karten.
- **Kartenstapel** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Vollständiger mehrschichtiger Kartenschatten.
- **Ringrahmen** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Hellgrauer Ringrahmen für Tabs und Bilder.

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `Geist`, mit Fallbacks: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace**: `Geist Mono`, mit Fallbacks: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **OpenType-Funktionen**: `"liga"` global auf allen Geist-Texten aktiviert; `"tnum"` für tabellarische Zahlen bei bestimmten Beschriftungen.

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Laufweite | Anmerkungen |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (eng) | -2.4px bis -2.88px | Maximale Komprimierung, Plakatwirkung |
| Abschnittsüberschrift | Geist | 40px (2.50rem) | 600 | 1.20 (eng) | -2.4px | Überschriften für Feature-Abschnitte |
| Große Unterüberschrift | Geist | 32px (2.00rem) | 600 | 1.25 (eng) | -1.28px | Kartenüberschriften, Unterabschnitte |
| Unterüberschrift | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Leichtere Unterüberschriften |
| Kartentitel | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Feature-Karten |
| Kartentitel Leicht | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Sekundäre Kartenüberschriften |
| Fließtext Groß | Geist | 20px (1.25rem) | 400 | 1.80 (locker) | normal | Einleitungen, Feature-Beschreibungen |
| Fließtext | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Standard-Lesetext |
| Fließtext Klein | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Standard-UI-Text |
| Fließtext Mittel | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Navigation, hervorgehobener Text |
| Fließtext Halbfett | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Starke Beschriftungen, aktive Zustände |
| Schaltfläche / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Schaltflächen, Links, Beschriftungen |
| Schaltfläche Klein | Geist | 14px (0.88rem) | 400 | 1.00 (eng) | normal | Kompakte Schaltflächen |
| Bildunterschrift | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Metadaten, Tags |
| Mono Fließtext | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Code-Blöcke |
| Mono Bildunterschrift | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Code-Beschriftungen |
| Mono Klein | Geist Mono | 12px (0.75rem) | 500 | 1.00 (eng) | normal | `text-transform: uppercase`, technische Beschriftungen |
| Mikro-Badge | Geist | 7px (0.44rem) | 700 | 1.00 (eng) | normal | `text-transform: uppercase`, winzige Badges |

### Grundsätze
- **Komprimierung als Identität**: Geist Sans verwendet bei Display-Größen -2,4 px bis -2,88 px Laufweite — die aggressivste negative Laufweite jedes großen Designsystems. Dies erzeugt Text, der _minifiziert_ wirkt, wie Code, der für die Produktion optimiert wurde. Die Laufweite entspannt sich mit abnehmender Größe schrittweise: -1,28 px bei 32 px, -0,96 px bei 24 px, -0,32 px bei 16 px und normal bei 14 px.
- **Ligaturen überall**: Jedes Geist-Textelement aktiviert OpenType `"liga"`. Ligaturen sind nicht dekorativ — sie sind strukturell und erzeugen engere, effizientere Glyphenkombinationen.
- **Drei Gewichte, strenge Rollen**: 400 (Fließtext/Lesen), 500 (UI/Interaktiv), 600 (Überschriften/Betonung). Kein Fett (700) außer für winzige Mikro-Badges. Diese schmale Gewichtsspanne erzeugt Hierarchie durch Größe und Laufweite, nicht durch Gewicht.
- **Mono als Identität**: Geist Mono in Großbuchstaben mit `"tnum"` oder `"liga"` dient als „Entwicklerkonsolen"-Stimme — kompakte technische Beschriftungen, die die Marketing-Seite mit dem Produkt verbinden.

## 4. Komponenten-Styling

### Schaltflächen

**Primär Weiß (Schattengerahmt)**
- Hintergrund: `#ffffff`
- Text: `#171717`
- Innenabstand: 0px 6px (minimal — inhaltsgetriebene Breite)
- Radius: 6px (dezent abgerundet)
- Schatten: `rgb(235, 235, 235) 0px 0px 0px 1px` (Ringrahmen)
- Hover: Hintergrund wechselt zu `var(--ds-gray-1000)` (dunkel)
- Fokus: `2px solid var(--ds-focus-color)` Kontur + `var(--ds-focus-ring)` Schatten
- Verwendung: Standard-Sekundärschaltfläche

**Primär Dunkel (aus dem Geist-System abgeleitet)**
- Hintergrund: `#171717`
- Text: `#ffffff`
- Innenabstand: 8px 16px
- Radius: 6px
- Verwendung: Primärer Handlungsaufruf („Start Deploying", „Get Started")

**Pill-Schaltfläche / Badge**
- Hintergrund: `#ebf5ff` (getöntes Blau)
- Text: `#0068d6`
- Innenabstand: 0px 10px
- Radius: 9999px (vollständige Pill)
- Schrift: 12px, Gewicht 500
- Verwendung: Status-Badges, Tags, Feature-Beschriftungen

**Große Pill (Navigation)**
- Hintergrund: transparent oder `#171717`
- Radius: 64px–100px
- Verwendung: Tab-Navigation, Abschnittsauswahl

### Karten & Container
- Hintergrund: `#ffffff`
- Rahmen: per Schatten — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Radius: 8px (Standard), 12px (hervorgehobene/Bildkarten)
- Schattenstapel: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Bildkarten: `1px solid #ebebeb` mit 12px Radius oben
- Hover: subtile Schattenverstärkung

### Eingaben & Formulare
- Optionsfeld: Standard-Styling mit Fokus-Hintergrund `var(--ds-gray-200)`
- Fokusschatten: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Fokuskontur: `2px solid var(--ds-focus-color)` — einheitlicher blauer Fokusring
- Rahmen: per Schattentechnik, kein traditioneller Rahmen

### Navigation
- Saubere horizontale Navigation auf Weiß, klebend
- Vercel-Wortmarke linksbündig, 262x52px
- Links: Geist 14px, Gewicht 500, `#171717`-Text
- Aktiv: Gewicht 600 oder Unterstreichung
- Handlungsaufruf: dunkle Pill-Schaltflächen („Start Deploying", „Contact Sales")
- Mobil: Hamburger-Menü-Zusammenklappung
- Produkt-Dropdowns mit mehrstufigen Menüs

### Bildbehandlung
- Produkt-Screenshots mit `1px solid #ebebeb`-Rahmen
- Oben abgerundete Bilder: `12px 12px 0px 0px` Radius
- Dashboard-/Code-Vorschau-Screenshots dominieren Feature-Abschnitte
- Sanfte Verlaufshintergründe hinter Hero-Bildern (pastellfarbig, mehrfarbig)

### Besondere Komponenten

**Workflow-Pipeline**
- Dreistufige horizontale Pipeline: Entwickeln → Vorschau → Deployen
- Jeder Schritt hat seine eigene Akzentfarbe: Blau → Pink → Rot
- Verbunden durch Linien/Pfeile
- Die visuelle Metapher für Vercels zentrales Wertversprechen

**Vertrauensleiste / Logo-Raster**
- Unternehmenslogos (Perplexity, ChatGPT, Cursor usw.) in Graustufen
- Horizontales Scrollen oder Rasterlayout
- Subtile `#ebebeb`-Rahmentrennung

**Kennzahlenkarten**
- Große Zahlendarstellung (z. B. „10x schneller")
- Geist 48px, Gewicht 600 für die Kennzahl
- Beschreibung darunter in grauem Fließtext
- Schattengerahmter Karten-Container

## 5. Layoutprinzipien

### Abstandssystem
- Basiseinheit: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Auffälliger Sprung: von 16px auf 32px — kein 20px oder 24px in der Primärskala

### Raster & Container
- Maximale Inhaltsbreite: ca. 1200px
- Hero: zentrierte Einspalte mit großzügigem oberen Innenabstand
- Feature-Abschnitte: 2–3-spaltige Raster für Karten
- Vollbreite-Trennlinien mit `border-bottom: 1px solid #171717`
- Code-/Dashboard-Screenshots in voller Breite oder eingebettet mit Rahmen

### Weißraum-Philosophie
- **Galerieentleerung**: Massiver vertikaler Innenabstand zwischen Abschnitten (80px–120px+). Der Weißraum IST das Design — er vermittelt, dass Vercel nichts zu beweisen und nichts zu verbergen hat.
- **Komprimierter Text, erweiterter Raum**: Die aggressive negative Laufweite bei Überschriften wird durch großzügigen umgebenden Weißraum ausbalanciert. Der Text ist dicht; der Raum darum herum ist weitläufig.
- **Abschnittsrhythmus**: Weiße Abschnitte wechseln mit weißen Abschnitten — es gibt keine Farbvariation zwischen Abschnitten. Trennung entsteht allein durch Rahmen (Schattenrahmen) und Abstände.

### Rahmenabrundungsskala
- Mikro (2px): Inline-Code-Ausschnitte, kleine Spans
- Subtil (4px): Kleine Container
- Standard (6px): Schaltflächen, Links, funktionale Elemente
- Komfortabel (8px): Karten, Listenelemente
- Bild (12px): Hervorgehobene Karten, Bild-Container (oben abgerundet)
- Groß (64px): Tab-Navigations-Pills
- XL (100px): Große Navigationslinks
- Vollständige Pill (9999px): Badges, Status-Pills, Tags
- Kreis (50%): Menü-Toggle, Avatar-Container

## 6. Tiefe & Erhebung

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten | Seitenhintergrund, Textblöcke |
| Ring (Ebene 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Schatten-als-Rahmen für die meisten Elemente |
| Heller Ring (Ebene 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Hellerer Ring für Tabs, Bilder |
| Subtile Karte (Ebene 2) | Ring + `rgba(0,0,0,0.04) 0px 2px 2px` | Standard-Karten mit minimaler Anhebung |
| Vollständige Karte (Ebene 3) | Ring + Subtil + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + innerer `#fafafa`-Ring | Hervorgehobene Karten, markierte Panels |
| Fokus (Barrierefreiheit) | `2px solid hsla(212, 100%, 48%, 1)` Kontur | Tastaturfokus auf allen interaktiven Elementen |

**Schatten-Philosophie**: Vercel besitzt wohl das ausgefeilteste Schattensystem im modernen Webdesign. Anstatt Schatten für Erhebung im traditionellen Material-Design-Sinne zu nutzen, verwendet Vercel mehrwertige Schattenstapel, bei denen jede Schicht einem klaren architektonischen Zweck dient: eine erzeugt den „Rahmen" (0px Ausdehnung, 1px), eine andere fügt Umgebungsweichheit hinzu (2px Unschärfe), eine weitere verwaltet Tiefe auf Abstand (8px Unschärfe mit negativer Ausdehnung), und ein innerer Ring (`#fafafa`) erzeugt das subtile Leuchten, das die Karte von innen heraus „glühen" lässt. Dieser geschichtete Ansatz lässt Karten gebaut wirken, nicht schwebend.

### Dekorative Tiefe
- Hero-Verlauf: sanfter, pastellfarbig-mehrfarbiger Verlaufswasch hinter dem Hero-Inhalt (kaum sichtbar, atmosphärisch)
- Abschnittsrahmen: `1px solid #171717` (volle dunkle Linie) zwischen Hauptabschnitten
- Keine Hintergrundfarbvariation — Tiefe entsteht ausschließlich durch Schattenschichtung und Rahmenkontrast

## 7. Dos und Don'ts

### Do
- Geist Sans mit aggressiver negativer Laufweite bei Display-Größen verwenden (-2,4 px bis -2,88 px bei 48px)
- Schatten-als-Rahmen (`0px 0px 0px 1px rgba(0,0,0,0.08)`) statt traditioneller CSS-Rahmen einsetzen
- `"liga"` auf allen Geist-Texten aktivieren — Ligaturen sind strukturell, nicht optional
- Das Drei-Gewichte-System verwenden: 400 (Fließtext), 500 (UI), 600 (Überschriften)
- Workflow-Akzentfarben (Rot/Pink/Blau) nur in ihrem Workflow-Kontext anwenden
- Mehrschichtige Schattenstapel für Karten verwenden (Rahmen + Erhebung + Umgebung + inneres Leuchten)
- Die Farbpalette achromatisch halten — Grautöne von `#171717` bis `#ffffff` bilden das System
- `#171717` statt `#000000` für Primärtext verwenden — die Mikrowärme macht einen Unterschied

### Don't
- Keine positive Laufweite bei Geist Sans verwenden — sie ist immer negativ oder null
- Kein Gewicht 700 (Fett) bei Fließtext — 600 ist das Maximum, nur für Überschriften
- Keinen traditionellen CSS-`border` auf Karten — die Schattentechnik verwenden
- Keine warmen Farben (Orange, Gelb, Grün) in die UI-Oberfläche einbringen
- Die Workflow-Akzentfarben (Ship-Rot, Vorschau-Pink, Entwicklungs-Blau) nicht dekorativ anwenden
- Keine schweren Schatten (> 0,1 Deckkraft) — das Schattensystem ist flüsterleise
- Die Laufweite bei Fließtext nicht erhöhen — Geist ist für engen Satz ausgelegt
- Keinen Pill-Radius (9999px) auf primären Aktionsschaltflächen — Pills sind nur für Badges/Tags
- Den inneren `#fafafa`-Ring in Kartenschatten nicht weglassen — er erzeugt das Leuchten, das das System zum Funktionieren bringt

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil Klein | <400px | Enges Einzelspalten-Layout, minimaler Innenabstand |
| Mobil | 400–600px | Standard-Mobil, gestapeltes Layout |
| Tablet Klein | 600–768px | 2-spaltige Raster beginnen |
| Tablet | 768–1024px | Vollständige Kartenraster, erweiterter Innenabstand |
| Desktop Klein | 1024–1200px | Standard-Desktop-Layout |
| Desktop | 1200–1400px | Vollständiges Layout, maximale Inhaltsbreite |
| Großes Desktop | >1400px | Zentriert, großzügige Ränder |

### Touch-Ziele
- Schaltflächen mit komfortablem Innenabstand (8px–16px vertikal)
- Navigationslinks bei 14px mit ausreichendem Abstand
- Pill-Badges mit 10px horizontalem Innenabstand für Touch-Ziele
- Mobiles Menü-Toggle mit 50%-Radius-Kreisschaltfläche

### Zusammenklapp-Strategie
- Hero: Display 48px → verkleinert sich, behält negative Laufweite proportional bei
- Navigation: horizontale Links + Handlungsaufrufe → Hamburger-Menü
- Feature-Karten: 3-spaltig → 2-spaltig → einspaltig gestapelt
- Code-Screenshots: Seitenverhältnis beibehalten, ggf. horizontal scrollbar
- Vertrauensleisten-Logos: Raster → horizontales Scrollen
- Fußzeile: mehrspaltig → gestapelt einspaltig
- Abstandsabstände: 80px+ → 48px auf Mobil

### Bildverhalten
- Dashboard-Screenshots behalten die Rahmenbehandlung in allen Größen
- Hero-Verlauf wird auf Mobil weicher/vereinfacht
- Produkt-Screenshots verwenden responsive Bilder mit einheitlichem Rahmenradius
- Vollbreite-Abschnitte behalten die Rand-zu-Rand-Behandlung bei

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primärer Handlungsaufruf: Vercel-Schwarz (`#171717`)
- Hintergrund: Reines Weiß (`#ffffff`)
- Überschriftentext: Vercel-Schwarz (`#171717`)
- Fließtext: Grau 600 (`#4d4d4d`)
- Rahmen (Schatten): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Link-Blau (`#0072f5`)
- Fokusring: Fokus-Blau (`hsla(212, 100%, 48%, 1)`)

### Beispiel-Komponenten-Prompts
- "Create a hero section on white background. Headline at 48px Geist weight 600, line-height 1.00, letter-spacing -2.4px, color #171717. Subtitle at 20px Geist weight 400, line-height 1.80, color #4d4d4d. Dark CTA button (#171717, 6px radius, 8px 16px padding) and ghost button (white, shadow-border rgba(0,0,0,0.08) 0px 0px 0px 1px, 6px radius)."
- "Design a card: white background, no CSS border. Use shadow stack: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radius 8px. Title at 24px Geist weight 600, letter-spacing -0.96px. Body at 16px weight 400, #4d4d4d."
- "Build a pill badge: #ebf5ff background, #0068d6 text, 9999px radius, 0px 10px padding, 12px Geist weight 500."
- "Create navigation: white sticky header. Geist 14px weight 500 for links, #171717 text. Dark pill CTA 'Start Deploying' right-aligned. Shadow-border on bottom: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Design a workflow section showing three steps: Develop (text color #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Each step: 14px Geist Mono uppercase label + 24px Geist weight 600 title + 16px weight 400 description in #4d4d4d."

### Iterations-Leitfaden
1. Immer Schatten-als-Rahmen statt CSS-Rahmen verwenden — `0px 0px 0px 1px rgba(0,0,0,0.08)` ist die Grundlage
2. Laufweite skaliert mit Schriftgröße: -2,4 px bei 48px, -1,28 px bei 32px, -0,96 px bei 24px, normal bei 14px
3. Nur drei Gewichte: 400 (lesen), 500 (interagieren), 600 (ankündigen)
4. Farbe ist funktional, niemals dekorativ — Workflow-Farben (Rot/Pink/Blau) markieren nur Pipeline-Stufen
5. Der innere `#fafafa`-Ring in Kartenschatten erzeugt das subtile innere Leuchten der Vercel-Karten
6. Geist Mono in Großbuchstaben für technische Beschriftungen, Geist Sans für alles andere
