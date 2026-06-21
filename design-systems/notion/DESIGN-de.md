# Von Notion inspiriertes Designsystem

> Category: Produktivität & SaaS
> All-in-one-Workspace. Warmer Minimalismus, Serifenüberschriften, weiche Oberflächen.

## 1. Visuelles Thema & Atmosphäre

Notions Website verkörpert die Philosophie des Werkzeugs selbst: eine leere Leinwand, die nicht im Weg steht. Das Designsystem basiert auf warmen Neutraltönen statt kalten Grautönen und schafft so einen unverwechselbar einladenden Minimalismus, der sich eher wie hochwertiges Papier anfühlt als wie steriles Glas. Die Seitenleinwand ist reines Weiß (`#ffffff`), doch der Text ist kein reines Schwarz — es handelt sich um ein warmes Fast-Schwarz (`rgba(0,0,0,0.95)`), das das Leseerlebnis unmerklich weicher macht. Die warme Grauabstufung (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) trägt subtile gelbbraune Untertöne, die der Oberfläche eine taktile, beinahe analoge Wärme verleihen.

Die eigene Schrift NotionInter (ein modifiziertes Inter) ist das Rückgrat des Systems. Bei Displaygrößen (64px) wird ein aggressives negatives Buchstabenabstand (-2.125px) eingesetzt, das komprimierte und präzise Überschriften erzeugt. Der Schriftgewichtsbereich ist breiter als bei typischen Systemen: 400 für Fließtext, 500 für UI-Elemente, 600 für halbfette Beschriftungen und 700 für Display-Überschriften. OpenType-Funktionen `"lnum"` (Mediävalziffern als Versalziffern) und `"locl"` (lokalisierte Formen) sind bei größeren Texten aktiviert und verleihen der Typografie eine Raffinesse, die beim genauen Lesen belohnt wird.

Was Notions visuelle Sprache unverwechselbar macht, ist die Randphilosophie. Anstelle schwerer Ränder oder Schatten verwendet Notion ultraschmale `1px solid rgba(0,0,0,0.1)`-Ränder — Ränder, die wie Flüstern existieren, kaum wahrnehmbare Trennlinien, die Struktur ohne Gewicht erzeugen. Das Schattensystem ist ebenso zurückhaltend: Mehrschichtige Stapel mit einer kumulativen Deckkraft von höchstens 0,05 erzeugen Tiefe, die gefühlt statt gesehen wird.

**Hauptmerkmale:**
- NotionInter (modifiziertes Inter) mit negativem Buchstabenabstand bei Displaygrößen (-2.125px bei 64px)
- Warme Neutralpalette: Grautöne tragen gelbbraune Untertöne (`#f6f5f4` warmes Weiß, `#31302e` warmes Dunkel)
- Fast-schwarzer Text via `rgba(0,0,0,0.95)` — kein reines Schwarz, erzeugt Mikrowärme
- Ultraschmale Ränder: `1px solid rgba(0,0,0,0.1)` durchgehend — flüsternde Trennlinien
- Mehrschichtige Schattenstapel mit einer Einzeldeckkraft von unter 0,05 für kaum wahrnehm­bare Tiefe
- Notion Blue (`#0075de`) als einzige Akzentfarbe für CTAs und interaktive Elemente
- Pill-Badges (9999px Radius) mit getönten blauen Hintergründen als Statusindikatoren
- 8px Basisabstandseinheit mit einer organischen, nicht starren Abstufung

## 2. Farbpalette & Rollen

### Primär
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`): Primärtext, Überschriften, Fließtext. Die 95 %-Deckkraft weicht reines Schwarz auf, ohne die Lesbarkeit zu beeinträchtigen.
- **Reines Weiß** (`#ffffff`): Seitenhintergrund, Kartenoberflächen, Schaltflächentext auf Blau.
- **Notion Blue** (`#0075de`): Primärer CTA, Linkfarbe, interaktiver Akzent — die einzige gesättigte Farbe im UI-Kern-Chrome.

### Marke Sekundär
- **Deep Navy** (`#213183`): Sekundäre Markenfarbe, sparsam für Betonung und dunkle Feature-Abschnitte eingesetzt.
- **Active Blue** (`#005bab`): Schaltfläche aktiv/gedrückt — dunklere Variante von Notion Blue.

### Warme Neutralabstufung
- **Warmes Weiß** (`#f6f5f4`): Hintergrundflächentönung, Abschnittsalternierung, subtile Kartenfüllung. Der gelbe Unterton ist entscheidend.
- **Warmes Dunkel** (`#31302e`): Dunkler Oberflächenhintergrund, Text in dunklen Abschnitten. Wärmer als Standardgrau.
- **Warmes Grau 500** (`#615d59`): Sekundärtext, Beschreibungen, gedämpfte Beschriftungen.
- **Warmes Grau 300** (`#a39e98`): Platzhaltertext, deaktivierte Zustände, Beschriftungstext.

### Semantische Akzentfarben
- **Blaugrün** (`#2a9d99`): Erfolgszustände, positive Indikatoren.
- **Grün** (`#1aae39`): Bestätigung, Abschlussbadges.
- **Orange** (`#dd5b00`): Warnzustände, Aufmerksamkeitsindikatoren.
- **Pink** (`#ff64c8`): Dekorativer Akzent, Feature-Highlights.
- **Lila** (`#391c57`): Premium-Features, tiefe Akzente.
- **Braun** (`#523410`): Erdiger Akzent, warme Feature-Abschnitte.

### Interaktiv
- **Link-Blau** (`#0075de`): Primäre Linkfarbe mit Unterstrich beim Hovern.
- **Link-Hellblau** (`#62aef0`): Hellere Linkvariante für dunkle Hintergründe.
- **Fokus-Blau** (`#097fe8`): Fokusring bei interaktiven Elementen.
- **Badge-Blau-Hintergrund** (`#f2f9ff`): Pill-Badge-Hintergrund, getönte blaue Fläche.
- **Badge-Blau-Text** (`#097fe8`): Pill-Badge-Text, dunkleres Blau für bessere Lesbarkeit.

### Schatten & Tiefe
- **Kartenschatten** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Mehrschichtige Kartenerhöhung.
- **Tiefer Schatten** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Fünfschichtige tiefe Erhöhung für Modals und hervorgehobene Inhalte.
- **Flüsterrand** (`1px solid rgba(0,0,0,0.1)`): Standardtrennrand — Karten, Trennlinien, Abschnitte.

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `NotionInter`, mit Fallbacks: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **OpenType-Funktionen**: `"lnum"` (Versalziffern) und `"locl"` (lokalisierte Formen) bei Display- und Überschriftentexten aktiviert.

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (eng) | -2.125px | Maximale Kompression, Billboard-Überschriften |
| Display Sekundär | NotionInter | 54px (3.38rem) | 700 | 1.04 (eng) | -1.875px | Sekundärer Hero, Feature-Überschriften |
| Abschnittsüberschrift | NotionInter | 48px (3.00rem) | 700 | 1.00 (eng) | -1.5px | Feature-Abschnittstitel mit `"lnum"` |
| Unterüberschrift Groß | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Kartenüberschriften, Feature-Unterabschnitte |
| Unterüberschrift | NotionInter | 26px (1.63rem) | 700 | 1.23 (eng) | -0.625px | Abschnitts-Untertitel, Inhaltsköpfe |
| Kartentitel | NotionInter | 22px (1.38rem) | 700 | 1.27 (eng) | -0.25px | Feature-Karten, Listentitel |
| Fließtext Groß | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Einleitungen, Feature-Beschreibungen |
| Fließtext | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Standardlesetext |
| Fließtext Medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navigation, betonter UI-Text |
| Fließtext Halbfett | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Starke Beschriftungen, aktive Zustände |
| Fließtext Fett | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Überschriften in Fließtextgröße |
| Nav / Schaltfläche | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Navigationslinks, Schaltflächentext |
| Bildunterschrift | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadaten, sekundäre Beschriftungen |
| Bildunterschrift Hell | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Textunterschriften, Beschreibungen |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Pill-Badges, Tags, Statusbeschriftungen |
| Mikrobeschriftung | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Kleine Metadaten, Zeitstempel |

### Grundsätze
- **Kompression im Maßstab**: NotionInter bei Displaygrößen verwendet -2.125px Buchstabenabstand bei 64px und lockert sich progressiv auf -0.625px bei 26px und normal bei 16px auf. Die Kompression erzeugt Dichte bei Überschriften und erhält die Lesbarkeit bei Fließtextgrößen.
- **Vier-Gewicht-System**: 400 (Fließtext/Lesen), 500 (UI/Interaktiv), 600 (Betonung/Navigation), 700 (Überschriften/Display). Der breitere Gewichtsbereich im Vergleich zu den meisten Systemen ermöglicht eine nuancierte Hierarchie.
- **Warme Skalierung**: Die Zeilenhöhe wird enger, je größer die Schrift wird — 1,50 bei Fließtext (16px), 1,23–1,27 bei Unterüberschriften, 1,00–1,04 bei Display. Dies erzeugt dichtere, wirkungsvollere Überschriften.
- **Badge-Mikro-Tracking**: Der 12px-Badge-Text verwendet positiven Buchstabenabstand (0,125px) — das einzige positive Tracking im System, das kleinen Text breiter und lesbarer macht.

## 4. Komponentenstile

### Schaltflächen

**Primär Blau**
- Hintergrund: `#0075de` (Notion Blue)
- Text: `#ffffff`
- Innenabstand: 8px 16px
- Radius: 4px (subtil)
- Rand: `1px solid transparent`
- Hover: Hintergrund wird zu `#005bab` dunkler
- Aktiv: scale(0.9)-Transformation
- Fokus: `2px solid` Fokusumrandung, `var(--shadow-level-200)` Schatten
- Verwendung: Primärer CTA ("Get Notion free", "Try it")

**Sekundär / Tertiär**
- Hintergrund: `rgba(0,0,0,0.05)` (transluzentes warmes Grau)
- Text: `#000000` (Fast-Schwarz)
- Innenabstand: 8px 16px
- Radius: 4px
- Hover: Textfarbe wechselt, scale(1.05)
- Aktiv: scale(0.9)-Transformation
- Verwendung: Sekundäre Aktionen, Formularübermittlungen

**Ghost / Link-Schaltfläche**
- Hintergrund: transparent
- Text: `rgba(0,0,0,0.95)`
- Dekoration: Unterstrich beim Hovern
- Verwendung: Tertiäre Aktionen, Inline-Links

**Pill-Badge-Schaltfläche**
- Hintergrund: `#f2f9ff` (getöntes Blau)
- Text: `#097fe8`
- Innenabstand: 4px 8px
- Radius: 9999px (volle Pill)
- Schrift: 12px Gewicht 600
- Verwendung: Statusbadges, Feature-Beschriftungen, "New"-Tags

### Karten & Container
- Hintergrund: `#ffffff`
- Rand: `1px solid rgba(0,0,0,0.1)` (Flüsterrand)
- Radius: 12px (Standardkarten), 16px (Featured/Hero-Karten)
- Schatten: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: Subtile Schattenverstärkung
- Bildkarten: 12px oberer Radius, Bild füllt obere Hälfte

### Eingaben & Formulare
- Hintergrund: `#ffffff`
- Text: `rgba(0,0,0,0.9)`
- Rand: `1px solid #dddddd`
- Innenabstand: 6px
- Radius: 4px
- Fokus: Blauer Umrandungsring
- Platzhalter: Warmes Grau `#a39e98`

### Navigation
- Klare horizontale Navigation auf Weiß, nicht fixiert
- Markenlogo linksbündig (33x34px Symbol + Wortmarke)
- Links: NotionInter 15px Gewicht 500–600, Fast-schwarzer Text
- Hover: Farbwechsel zu `var(--color-link-primary-text-hover)`
- CTA: Blauer Pill-Button ("Get Notion free") rechtsbündig
- Mobil: Hamburger-Menü-Einklappen
- Produkt-Dropdowns mit mehrstufigen kategorisierten Menüs

### Bildbehandlung
- Produkt-Screenshots mit `1px solid rgba(0,0,0,0.1)` Rand
- Bilder mit abgerundeten oberen Ecken: `12px 12px 0px 0px` Radius
- Dashboard/Workspace-Vorschau-Screenshots dominieren Feature-Abschnitte
- Warme Verlaufshintergründe hinter Hero-Illustrationen (dekorative Charakterillustrationen)

### Besondere Komponenten

**Feature-Karten mit Illustrationen**
- Große illustrative Kopfzeilen (Die große Welle, Produkt-UI-Screenshots)
- Karte mit 12px Radius und Flüsterrand
- Titel bei 22px Gewicht 700, Beschreibung bei 16px Gewicht 400
- Warmes Weiß (`#f6f5f4`) als Hintergrundvariante für abwechselnde Abschnitte

**Vertrauensleiste / Logo-Raster**
- Unternehmenslogos (Abschnitt vertrauenswürdiger Teams) in ihren Markenfarben
- Horizontales Scrollen oder Rasterlayout mit Teamanzahlen
- Kennzahlenanzeige: Große Zahl + Beschreibungsmuster

**Kennzahlenkarten**
- Große Zahlenanzeige (z. B. „$4.200 ROI")
- NotionInter 40px+ Gewicht 700 für die Kennzahl
- Beschreibung darunter in warmem grauem Fließtext
- Karten-Container mit Flüsterrand

## 5. Layoutprinzipien

### Abstands­system
- Basiseinheit: 8px
- Abstufung: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Nicht starres, organisches Maß mit Dezimalwerten (5,6px, 6,4px) für Mikrojustierungen

### Raster & Container
- Maximale Inhaltsbreite: ca. 1.200px
- Hero: Zentrierte Einzelspalte mit großzügigem oberen Innenabstand (80–120px)
- Feature-Abschnitte: 2–3-Spalten-Raster für Karten
- Vollbreite warmes Weiß (`#f6f5f4`) als Abschnittshintergrund für Alternierung
- Code/Dashboard-Screenshots als umrahmte Elemente mit Flüsterrand

### Leerraumphilosophie
- **Großzügiger vertikaler Rhythmus**: 64–120px zwischen Hauptabschnitten. Notion lässt Inhalte mit großzügigem vertikalem Innenabstand atmen.
- **Warme Alternierung**: Weiße Abschnitte wechseln mit warmen weißen (`#f6f5f4`) Abschnitten ab, was einen sanften visuellen Rhythmus ohne harte Farbbrüche erzeugt.
- **Inhaltszentrierte Dichte**: Fließtextblöcke sind kompakt (Zeilenhöhe 1,50), aber von reichlichem Außenabstand umgeben, was Inseln lesbaren Inhalts in einem Meer aus Leerraum schafft.

### Eckenradius-Abstufung
- Mikro (4px): Schaltflächen, Eingaben, funktionale interaktive Elemente
- Subtil (5px): Links, Listenelemente, Menüeinträge
- Standard (8px): Kleine Karten, Container, Inline-Elemente
- Komfortabel (12px): Standardkarten, Feature-Container, Bildköpfe
- Groß (16px): Hero-Karten, hervorgehobene Inhalte, Werbeblöcke
- Volle Pill (9999px): Badges, Pills, Statusindikatoren
- Kreis (100%): Tab-Indikatoren, Avatare

## 6. Tiefe & Erhöhung

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten, kein Rand | Seitenhintergrund, Textblöcke |
| Flüstern (Ebene 1) | `1px solid rgba(0,0,0,0.1)` | Standardränder, Kartenumrisse, Trennlinien |
| Weiche Karte (Ebene 2) | 4-Schicht-Schattenstapel (max. Deckkraft 0,04) | Inhaltskarten, Feature-Blöcke |
| Tiefe Karte (Ebene 3) | 5-Schicht-Schattenstapel (max. Deckkraft 0,05, 52px Unschärfe) | Modals, hervorgehobene Bereiche, Hero-Elemente |
| Fokus (Barrierefreiheit) | `2px solid var(--focus-color)` Umrandung | Tastaturfokus auf allen interaktiven Elementen |

**Schatten­philosophie**: Notions Schattensystem verwendet mehrere Schichten mit extrem niedriger Einzeldeckkraft (0,01 bis 0,05), die sich zu weich und natürlich wirkender Erhöhung akkumulieren. Der 4-Schicht-Kartenschatten spannt sich von 1,04px bis 18px Unschärfe und erzeugt einen Tiefenverlauf statt eines einzelnen harten Schattens. Der 5-Schicht-Tiefenschatten reicht bei 0,05 Deckkraft bis zu 52px Unschärfe und produziert Umgebungsverdeckung, die sich wie natürliches Licht anfühlt und nicht wie computergenerierte Tiefe. Dieser mehrschichtige Ansatz lässt Elemente so wirken, als wären sie in die Seite eingebettet, statt über ihr zu schweben.

### Dekorative Tiefe
- Hero-Abschnitt: Dekorative Charakterillustrationen (verspielt, handgezeichneter Stil)
- Abschnittsalternierung: Weißer zu warmem weißem (`#f6f5f4`) Hintergrundwechsel
- Keine harten Abschnittsränder — Trennung entsteht durch Hintergrundfarb­änderungen und Abstände

## 7. Responsives Verhalten

### Haltepunkte
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil Klein | <400px | Enge Einzelspalte, minimaler Innenabstand |
| Mobil | 400–600px | Standard-Mobil, gestapeltes Layout |
| Tablet Klein | 600–768px | 2-Spalten-Raster beginnt |
| Tablet | 768–1080px | Vollständige Kartenraster, erweiterter Innenabstand |
| Desktop Klein | 1080–1200px | Standard-Desktop-Layout |
| Desktop | 1200–1440px | Volles Layout, maximale Inhaltsbreite |
| Großer Desktop | >1440px | Zentriert, großzügige Außenabstände |

### Berührungsziele
- Schaltflächen verwenden komfortablen Innenabstand (8px–16px vertikal)
- Navigationslinks bei 15px mit ausreichendem Abstand
- Pill-Badges haben 8px horizontalen Innenabstand für Tippziele
- Mobiles Menü-Toggle verwendet standardmäßige Hamburger-Schaltfläche

### Einklappstrategie
- Hero: 64px Display → skaliert auf 40px → 26px auf Mobil, proportionaler Buchstabenabstand bleibt erhalten
- Navigation: Horizontale Links + blauer CTA → Hamburger-Menü
- Feature-Karten: 3-Spalten → 2-Spalten → Einzelspalte gestapelt
- Produkt-Screenshots: Seitenverhältnis mit responsiven Bildern beibehalten
- Vertrauensleisten-Logos: Raster → horizontales Scrollen auf Mobil
- Fußzeile: Mehrspaltig → einzelne gestapelte Spalte
- Abstandsabschnitte: 80px+ → 48px auf Mobil

### Bildverhalten
- Workspace-Screenshots behalten Flüsterrand bei allen Größen bei
- Hero-Illustrationen skalieren proportional
- Produkt-Screenshots verwenden responsive Bilder mit einheitlichem Randradius
- Vollbreite warme weiße Abschnitte behalten rand-zu-rand-Behandlung bei

## 8. Barrierefreiheit & Zustände

### Fokussystem
- Alle interaktiven Elemente erhalten sichtbare Fokusindikatoren
- Fokusumrandung: `2px solid` mit Fokusfarbe + Schattenebene 200
- Tab-Navigation wird in allen interaktiven Komponenten unterstützt
- Hoher Kontrast: Fast-Schwarz auf Weiß übertrifft WCAG AAA (>14:1 Verhältnis)

### Interaktive Zustände
- **Standard**: Standarderscheinung mit Flüsterrändern
- **Hover**: Farbwechsel bei Text, scale(1.05) bei Schaltflächen, Unterstrich bei Links
- **Aktiv/Gedrückt**: scale(0.9)-Transformation, dunklere Hintergrundvariante
- **Fokus**: Blauer Umrandungsring mit Schattenverstärkung
- **Deaktiviert**: Warmes Grau (`#a39e98`) Text, reduzierte Deckkraft

### Farbkontrast
- Primärtext (rgba(0,0,0,0.95)) auf Weiß: ca. 18:1 Verhältnis
- Sekundärtext (#615d59) auf Weiß: ca. 5,5:1 Verhältnis (WCAG AA)
- Blauer CTA (#0075de) auf Weiß: ca. 4,6:1 Verhältnis (WCAG AA für großen Text)
- Badge-Text (#097fe8) auf Badge-Hintergrund (#f2f9ff): ca. 4,5:1 Verhältnis (WCAG AA für großen Text)

## 9. Agenten-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primärer CTA: Notion Blue (`#0075de`)
- Hintergrund: Reines Weiß (`#ffffff`)
- Alternativer Hintergrund: Warmes Weiß (`#f6f5f4`)
- Überschriftentext: Fast-Schwarz (`rgba(0,0,0,0.95)`)
- Fließtext: Fast-Schwarz (`rgba(0,0,0,0.95)`)
- Sekundärtext: Warmes Grau 500 (`#615d59`)
- Gedämpfter Text: Warmes Grau 300 (`#a39e98`)
- Rand: `1px solid rgba(0,0,0,0.1)`
- Link: Notion Blue (`#0075de`)
- Fokusring: Fokus-Blau (`#097fe8`)

### Beispiel-Komponentenprompts
- „Erstelle einen Hero-Abschnitt auf weißem Hintergrund. Überschrift bei 64px NotionInter Gewicht 700, Zeilenhöhe 1,00, Buchstabenabstand -2,125px, Farbe rgba(0,0,0,0.95). Untertitel bei 20px Gewicht 600, Zeilenhöhe 1,40, Farbe #615d59. Blauer CTA-Button (#0075de, 4px Radius, 8px 16px Innenabstand, weißer Text) und Ghost-Button (transparenter Hintergrund, Fast-schwarzer Text, Unterstrich beim Hovern)."
- „Gestalte eine Karte: weißer Hintergrund, 1px solid rgba(0,0,0,0.1) Rand, 12px Radius. Schattenstapel verwenden: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Titel bei 22px NotionInter Gewicht 700, Buchstabenabstand -0,25px. Fließtext bei 16px Gewicht 400, Farbe #615d59."
- „Erstelle ein Pill-Badge: #f2f9ff Hintergrund, #097fe8 Text, 9999px Radius, 4px 8px Innenabstand, 12px NotionInter Gewicht 600, Buchstabenabstand 0,125px."
- „Erstelle Navigation: weißer Header. NotionInter 15px Gewicht 600 für Links, Fast-schwarzer Text. Blauer Pill-CTA 'Get Notion free' rechtsbündig (#0075de Hintergrund, weißer Text, 4px Radius)."
- „Gestalte ein abwechselndes Abschnittslayout: Weiße Abschnitte wechseln mit warmen weißen (#f6f5f4) Abschnitten ab. Jeder Abschnitt hat 64–80px vertikalen Innenabstand, maximale Breite 1200px zentriert. Abschnittsüberschrift bei 48px Gewicht 700, Zeilenhöhe 1,00, Buchstabenabstand -1,5px."

### Iterationsleitfaden
1. Immer warme Neutraltöne verwenden — Notions Grautöne haben gelbbraune Untertöne (#f6f5f4, #31302e, #615d59, #a39e98), niemals Blaugrau
2. Buchstabenabstand skaliert mit Schriftgröße: -2,125px bei 64px, -1,875px bei 54px, -0,625px bei 26px, normal bei 16px
3. Vier Gewichte: 400 (lesen), 500 (interagieren), 600 (betonen), 700 (ankündigen)
4. Ränder sind Flüstern: 1px solid rgba(0,0,0,0.1) — niemals schwerer
5. Schatten verwenden 4–5 Schichten mit einer Einzeldeckkraft von nie mehr als 0,05
6. Der warme weiße (#f6f5f4) Abschnittshintergrund ist für den visuellen Rhythmus unverzichtbar
7. Pill-Badges (9999px) für Status/Tags, 4px Radius für Schaltflächen und Eingaben
8. Notion Blue (#0075de) ist die einzige gesättigte Farbe im UI-Kern — sparsam für CTAs und Links einsetzen
