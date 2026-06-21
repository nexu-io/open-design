# Design System Inspired by Stripe

> Category: Fintech & Kryptowährung
> Zahlungsinfrastruktur. Charakteristische lila Verläufe, elegantes Gewicht 300.

## 1. Visuelles Thema & Atmosphäre

Stripes Website ist der Goldstandard im Fintech-Design – ein System, das gleichzeitig technisch und luxuriös, präzise und warm wirkt. Die Seite öffnet sich auf einer sauberen weißen Leinwand (`#ffffff`) mit tiefen marinegrauen Überschriften (`#061b31`) und einem charakteristischen Lila (`#533afd`), das sowohl als Markenanker als auch als interaktiver Akzent fungiert. Dies ist nicht das kalte, klinische Lila von Unternehmenssoftware; es ist ein sattes, gesättigtes Violett, das selbstbewusst und premium wirkt. Der Gesamteindruck ist der einer Finanzinstitution, die von einer erstklassigen Schriftgießerei neu gestaltet wurde.

Die benutzerdefinierte variable Schriftart `sohne-var` ist das prägende Element von Stripes visueller Identität. Jedes Textelement aktiviert den OpenType-Stilsatz `"ss01"`, der Zeichenformen für einen ausgesprochen geometrischen, modernen Look modifiziert. Bei Displaygrößen (48px–56px) läuft sohne-var mit Gewicht 300 – ein außergewöhnlich leichtes Gewicht für Überschriften, das eine ätherische, fast geflüsterte Autorität erzeugt. Dies ist das Gegenteil der Konvention "fette Hero-Überschrift"; Stripes Überschriften wirken, als müssten sie nicht schreien. Der negative Buchstabenabstand (-1,4px bei 56px, -0,96px bei 48px) verdichtet den Text zu kompakten, engineerten Blöcken. Bei kleineren Größen verwendet das System ebenfalls Gewicht 300 mit proportional reduziertem Tracking sowie tabellarische Ziffern via `"tnum"` für die Darstellung von Finanzdaten.

Was Stripe wirklich auszeichnet, ist sein Schattensystem. Anstelle des flachen oder einlagigen Ansatzes der meisten Websites verwendet Stripe mehrschichtige, blau getönte Schatten: das charakteristische `rgba(50,50,93,0.25)` kombiniert mit `rgba(0,0,0,0.1)` erzeugt Schatten mit einer kühlen, fast atmosphärischen Tiefe – als ob Elemente in einem Dämmerungshimmel schweben. Der blaugraue Unterton der primären Schattenfarbe (50,50,93) ist direkt mit der marineblau-lila Markenpalette verknüpft, sodass selbst die Elevation markentypisch wirkt.

**Hauptmerkmale:**
- sohne-var mit OpenType `"ss01"` auf allen Texten – ein benutzerdefinierter Stilsatz, der die Schriftzeichen der Marke definiert
- Gewicht 300 als charakteristisches Überschriftengewicht – leicht, selbstbewusst, konventionswidrig
- Negativer Buchstabenabstand bei Displaygrößen (-1,4px bei 56px, progressive Lockerung nach unten)
- Blau getönte mehrschichtige Schatten mit `rgba(50,50,93,0.25)` – Elevation, die markenfarbig wirkt
- Tiefe Marine-Überschriften (`#061b31`) statt Schwarz – warm, premium, von Finanzqualität
- Konservativer Border-Radius (4px–8px) – keine Pillenform, keine harten Kanten
- Ruby (`#ea2261`) und Magenta (`#f96bee`) als Akzente für Verläufe und dekorative Elemente
- `SourceCodePro` als Monospace-Begleiter für Code und technische Bezeichnungen

## 2. Farbpalette & Rollen

### Primär
- **Stripe-Lila** (`#533afd`): Primäre Markenfarbe, CTA-Hintergründe, Link-Text, interaktive Hervorhebungen. Ein gesättigtes Blauviolett, das das gesamte System verankert.
- **Tiefes Marine** (`#061b31`): `--hds-color-heading-solid`. Primäre Überschriftenfarbe. Nicht schwarz, nicht grau – ein sehr dunkles Blau, das dem Text Wärme und Tiefe verleiht.
- **Reines Weiß** (`#ffffff`): Seitenhintergrund, Kartenoberflächen, Schaltflächentext auf dunklen Hintergründen.

### Marke & Dunkel
- **Marken-Dunkel** (`#1c1e54`): `--hds-color-util-brand-900`. Tiefes Indigo für dunkle Bereiche, Fußzeilenhintergründe und immersive Markenmomente.
- **Dunkles Marine** (`#0d253d`): `--hds-color-core-neutral-975`. Das dunkelste Neutral – fast schwarz mit einem blauen Unterton für maximale Tiefe ohne Härte.

### Akzentfarben
- **Ruby** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Warmes Rotpink für Icons, Warnmeldungen und Akzentelemente.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Kräftiges Pinkladenviolett für Verläufe und dekorative Hervorhebungen.
- **Magenta Hell** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Getönte Oberfläche für magentafarbene Karten und Abzeichen.

### Interaktiv
- **Primäres Lila** (`#533afd`): Primäre Link-Farbe, aktive Zustände, ausgewählte Elemente.
- **Lila Hover** (`#4434d4`): Dunkleres Lila für Hover-Zustände bei primären Elementen.
- **Lila Tief** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Dunkles Lila für Icon-Hover-Zustände.
- **Lila Hell** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Sanftes Lavendel für gedämpfte Hover-Hintergründe.
- **Lila Mittel** (`#665efd`): `--hds-color-input-selector-text-range`. Bereichsselektor und Eingabe-Hervorhebungsfarbe.

### Neutrale Skala
- **Überschrift** (`#061b31`): Primäre Überschriften, Navigationstext, starke Bezeichnungen.
- **Beschriftung** (`#273951`): `--hds-color-input-text-label`. Formularfelder-Beschriftungen, sekundäre Überschriften.
- **Fließtext** (`#64748d`): Sekundärer Text, Beschreibungen, Bildunterschriften.
- **Erfolgsgrün** (`#15be53`): Statusabzeichen, Erfolgsindikatoren (mit 0,2–0,4 Alpha für Hintergründe/Rahmen).
- **Erfolgstext** (`#108c3d`): Textfarbe für Erfolgsabzeichen.
- **Zitrone** (`#9b6829`): `--hds-color-core-lemon-500`. Warn- und Hervorhebungsakzent.

### Oberflächen & Rahmen
- **Standardrahmen** (`#e5edf5`): Standardrahmenfarbe für Karten, Trennlinien und Container.
- **Lila Rahmen** (`#b9b9f9`): Rahmen für aktive/ausgewählte Zustände bei Schaltflächen und Eingaben.
- **Weicher Lila-Rahmen** (`#d6d9fc`): Subtile lila getönte Rahmen für sekundäre Elemente.
- **Magenta-Rahmen** (`#ffd7ef`): Pinkladengetönte Rahmen für magentafarbene Elemente.
- **Gestrichelter Rahmen** (`#362baa`): Gestrichelte Rahmen für Ablagezonen und Platzhalterelemente.

### Schattenfarben
- **Schatten Blau** (`rgba(50,50,93,0.25)`): Das Charakteristische – blau getönte primäre Schattenfarbe.
- **Schatten Dunkelblau** (`rgba(3,3,39,0.25)`): Tieferer blauer Schatten für erhöhte Elemente.
- **Schatten Schwarz** (`rgba(0,0,0,0.1)`): Sekundäre Schattenebene zur Tiefenverstärkung.
- **Schatten Ambient** (`rgba(23,23,23,0.08)`): Weicher Umgebungsschatten für subtile Elevation.
- **Schatten Sanft** (`rgba(23,23,23,0.06)`): Minimaler Umgebungsschatten für leichtes Anheben.

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `sohne-var`, mit Fallback: `SF Pro Display`
- **Monospace**: `SourceCodePro`, mit Fallback: `SFMono-Regular`
- **OpenType-Features**: `"ss01"` global auf allen sohne-var-Texten aktiviert; `"tnum"` für tabellarische Zahlen bei Finanzdaten und Bildunterschriften.

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Features | Hinweise |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (eng) | -1.4px | ss01 | Maximale Größe, Gewicht-300-Autorität |
| Display Groß | sohne-var | 48px (3.00rem) | 300 | 1.15 (eng) | -0.96px | ss01 | Sekundäre Hero-Überschriften |
| Abschnittsüberschrift | sohne-var | 32px (2.00rem) | 300 | 1.10 (eng) | -0.64px | ss01 | Titel für Feature-Abschnitte |
| Zwischenüberschrift Groß | sohne-var | 26px (1.63rem) | 300 | 1.12 (eng) | -0.26px | ss01 | Kartenüberschriften, Unterabschnitte |
| Zwischenüberschrift | sohne-var | 22px (1.38rem) | 300 | 1.10 (eng) | -0.22px | ss01 | Kleinere Abschnittsköpfe |
| Fließtext Groß | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Feature-Beschreibungen, Einleitungstext |
| Fließtext | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Standardlesetext |
| Schaltfläche | sohne-var | 16px (1.00rem) | 400 | 1.00 (eng) | normal | ss01 | Primärer Schaltflächentext |
| Schaltfläche Klein | sohne-var | 14px (0.88rem) | 400 | 1.00 (eng) | normal | ss01 | Sekundäre/kompakte Schaltflächen |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (eng) | normal | ss01 | Navigationslinks |
| Bildunterschrift | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Kleine Bezeichnungen, Metadaten |
| Bildunterschrift Klein | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Kleingedrucktes, Zeitstempel |
| Bildunterschrift Tabellarisch | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Finanzdaten, Zahlen |
| Mikro | sohne-var | 10px (0.63rem) | 300 | 1.15 (eng) | 0.1px | ss01 | Winzige Bezeichnungen, Achsenmarkierungen |
| Mikro Tabellarisch | sohne-var | 10px (0.63rem) | 300 | 1.15 (eng) | -0.3px | tnum | Diagrammdaten, kleine Zahlen |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (eng) | normal | ss01 | Kleinste Bezeichnungen |
| Code Fließtext | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (weit) | normal | -- | Code-Blöcke, Syntax |
| Code Fett | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (weit) | normal | -- | Fetter Code, Schlüsselwörter |
| Code Bezeichnung | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (weit) | normal | Großbuchstaben | Technische Bezeichnungen |
| Code Mikro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (eng) | normal | ss01 | Winzige Code-Anmerkungen |

### Grundsätze
- **Leichtes Gewicht als Merkmal**: Gewicht 300 bei Displaygrößen ist Stripes markanteste typografische Entscheidung. Während andere 600–700 einsetzen, um Aufmerksamkeit zu erregen, nutzt Stripe Leichtheit als Luxus – der Text ist so selbstbewusst, dass er kein Gewicht braucht, um Autorität auszustrahlen.
- **ss01 überall**: Der Stilsatz `"ss01"` ist unverhandelbar. Er modifiziert bestimmte Glyphen (wahrscheinlich alternative `a`-, `g`-, `l`-Formen), um über alle sohne-var-Texte hinweg ein geometrischeres, zeitgemäßeres Gefühl zu erzeugen.
- **Zwei OpenType-Modi**: `"ss01"` für Display-/Fließtext, `"tnum"` für tabellarische Ziffern in Finanzdaten. Diese überlappen sich nie – eine Zahl in einem Absatz verwendet ss01, eine Zahl in einer Datentabelle verwendet tnum.
- **Progressives Tracking**: Der Buchstabenabstand wird proportional mit der Größe enger: -1,4px bei 56px, -0,96px bei 48px, -0,64px bei 32px, -0,26px bei 26px, normal ab 16px und darunter.
- **Zwei-Gewicht-Einfachheit**: Primär 300 (Fließtext und Überschriften) und 400 (UI/Schaltflächen). Kein Fett (700) bei der Primärschrift – SourceCodePro verwendet 500/700 für Code-Kontrast.

## 4. Komponentenstile

### Schaltflächen

**Primäres Lila**
- Hintergrund: `#533afd`
- Text: `#ffffff`
- Innenabstand: 8px 16px
- Radius: 4px
- Schrift: 16px sohne-var Gewicht 400, `"ss01"`
- Hover: `#4434d4` Hintergrund
- Verwendung: Primäre CTAs ("Jetzt starten", "Vertrieb kontaktieren")

**Ghost / Umrandet**
- Hintergrund: transparent
- Text: `#533afd`
- Innenabstand: 8px 16px
- Radius: 4px
- Rahmen: `1px solid #b9b9f9`
- Schrift: 16px sohne-var Gewicht 400, `"ss01"`
- Hover: Hintergrund wechselt zu `rgba(83,58,253,0.05)`
- Verwendung: Sekundäre Aktionen

**Transparentes Info**
- Hintergrund: transparent
- Text: `#2874ad`
- Innenabstand: 8px 16px
- Radius: 4px
- Rahmen: `1px solid rgba(43,145,223,0.2)`
- Verwendung: Tertiäre/Info-Ebene-Aktionen

**Neutrales Ghost**
- Hintergrund: transparent (`rgba(255,255,255,0)`)
- Text: `rgba(16,16,16,0.3)`
- Innenabstand: 8px 16px
- Radius: 4px
- Umriss: `1px solid rgb(212,222,233)`
- Verwendung: Deaktivierte oder gedämpfte Aktionen

### Karten & Container
- Hintergrund: `#ffffff`
- Rahmen: `1px solid #e5edf5` (Standard) oder `1px solid #061b31` (dunkler Akzent)
- Radius: 4px (eng), 5px (Standard), 6px (bequem), 8px (hervorgehoben)
- Schatten (Standard): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Schatten (Ambient): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: Schatten verstärkt sich, oft mit der blau getönten Ebene

### Abzeichen / Tags / Pillen
**Neutrales Pill**
- Hintergrund: `#ffffff`
- Text: `#000000`
- Innenabstand: 0px 6px
- Radius: 4px
- Rahmen: `1px solid #f6f9fc`
- Schrift: 11px Gewicht 400

**Erfolgsabzeichen**
- Hintergrund: `rgba(21,190,83,0.2)`
- Text: `#108c3d`
- Innenabstand: 1px 6px
- Radius: 4px
- Rahmen: `1px solid rgba(21,190,83,0.4)`
- Schrift: 10px Gewicht 300

### Eingaben & Formulare
- Rahmen: `1px solid #e5edf5`
- Radius: 4px
- Fokus: `1px solid #533afd` oder lila Ring
- Beschriftung: `#273951`, 14px sohne-var
- Text: `#061b31`
- Platzhalter: `#64748d`

### Navigation
- Saubere horizontale Navigation auf Weiß, fixiert mit verschwommenem Hintergrund
- Marken-Wortmarke linksbündig
- Links: sohne-var 14px Gewicht 400, `#061b31` Text mit `"ss01"`
- Radius: 6px auf dem Navigationscontainer
- CTA: Lila Schaltfläche rechtsbündig ("Anmelden", "Jetzt starten")
- Mobil: Hamburger-Umschalter mit 6px Radius

### Dekorative Elemente
**Gestrichelte Rahmen**
- `1px dashed #362baa` (lila) für Platzhalter-/Ablagezonen
- `1px dashed #ffd7ef` (magenta) für magentafarbene dekorative Rahmen

**Verlauf-Akzente**
- Ruby-zu-Magenta-Verläufe (`#ea2261` bis `#f96bee`) für Hero-Dekorationen
- Dunkle Marken-Abschnitte verwenden `#1c1e54` Hintergründe mit weißem Text

## 5. Layout-Grundsätze

### Abstandssystem
- Basiseinheit: 8px
- Skala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Besonders: Die Skala ist am unteren Ende dicht (alle 2px von 4–12), was Stripes präzisionsorientierte Benutzeroberfläche für Finanzdaten widerspiegelt

### Raster & Container
- Maximale Inhaltsbreite: ca. 1080px
- Hero: zentrierte Einzelspalte mit großzügigem Innenabstand und leichten Überschriften
- Feature-Abschnitte: 2–3-Spalten-Raster für Feature-Karten
- Vollbreite dunkle Abschnitte mit `#1c1e54` Hintergrund für Markenimmersion
- Code-/Dashboard-Vorschauen als enthaltene Karten mit blau getönten Schatten

### Weißraumphilosophie
- **Präzisionsabstände**: Anders als die weite Leere minimalistischer Systeme verwendet Stripe gemessenen, zielgerichteten Weißraum. Jeder Abstand ist eine bewusste typografische Entscheidung.
- **Dichte Daten, großzügiges Chrom**: Finanzdaten-Anzeigen (Tabellen, Diagramme) sind eng gepackt, aber die UI-Umgebung um sie herum ist großzügig beabstandet. Dies erzeugt ein Gefühl kontrollierter Dichte – wie eine gut organisierte Tabellenkalkulation in einem schönen Rahmen.
- **Abschnittsrhythmus**: Weiße Abschnitte wechseln sich mit dunklen Marken-Abschnitten (`#1c1e54`) ab, was eine dramatische Hell/Dunkel-Kadenz erzeugt, die Monotonie verhindert, ohne willkürliche Farben einzuführen.

### Border-Radius-Skala
- Mikro (1px): Feinkörnige Elemente, subtile Abrundung
- Standard (4px): Schaltflächen, Eingaben, Abzeichen, Karten – das Arbeitstier
- Bequem (5px): Standard-Kartencontainer
- Entspannt (6px): Navigation, größere interaktive Elemente
- Groß (8px): Hervorgehobene Karten, Hero-Elemente
- Zusammengesetzt: `0px 0px 6px 6px` für unten gerundete Container (Tab-Panels, Dropdown-Fußzeilen)

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten | Seitenhintergrund, Inline-Text |
| Ambient (Ebene 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Subtiles Anheben von Karten, Hover-Hinweise |
| Standard (Ebene 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Standard-Karten, Inhaltspanels |
| Erhöht (Ebene 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Hervorgehobene Karten, Dropdowns, Popovers |
| Tief (Ebene 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modals, schwebende Panels |
| Ring (Barrierefreiheit) | `2px solid #533afd` Umriss | Tastaturfokusring |

**Schattenphilosophie**: Stripes Schattensystem basiert auf dem Prinzip der chromatischen Tiefe. Während die meisten Design-Systeme neutrale graue oder schwarze Schatten verwenden, ist Stripes primäre Schattenfarbe (`rgba(50,50,93,0.25)`) ein tiefes Blaugrau, das die Marine-Palette der Marke widerspiegelt. Dies erzeugt Schatten, die nicht nur Tiefe hinzufügen – sie fügen Markenatmosphäre hinzu. Der mehrschichtige Ansatz kombiniert diesen blau getönten Schatten mit einer reinen schwarzen Sekundärebene (`rgba(0,0,0,0.1)`) mit einem anderen Versatz, was eine parallax-ähnliche Tiefe erzeugt, bei der der Markenschatten weiter vom Element entfernt sitzt und der neutrale Schatten näher. Die negativen Spreizwerte (-30px, -18px) stellen sicher, dass Schatten nicht horizontal über den Fußabdruck des Elements hinausgehen, was die Elevation vertikal und kontrolliert hält.

### Dekorative Tiefe
- Dunkle Marken-Abschnitte (`#1c1e54`) erzeugen immersive Tiefe durch Hintergrundfarbenkontrast
- Verlauf-Overlays mit Ruby-zu-Magenta-Übergängen für Hero-Dekorationen
- Schattenfarbe `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) für Oberkanten-Schatten auf fixierten Elementen

## 7. Dos und Don'ts

### Do
- sohne-var mit `"ss01"` auf jedem Textelement verwenden – das Stilset IST die Marke
- Gewicht 300 für alle Überschriften und Fließtext verwenden – Leichtheit ist das Markenzeichen
- Blau getönte Schatten (`rgba(50,50,93,0.25)`) für alle erhöhten Elemente anwenden
- `#061b31` (tiefes Marine) für Überschriften statt `#000000` verwenden – die Wärme ist wichtig
- Border-Radius zwischen 4px–8px halten – konservative Abrundung ist beabsichtigt
- `"tnum"` für jede tabellarische/finanzielle Zahlendarstellung verwenden
- Schatten schichten: blau getönt weit + neutral nah für Tiefen-Parallax
- `#533afd` Lila als primäre interaktive/CTA-Farbe verwenden

### Don't
- Gewicht 600–700 für sohne-var-Überschriften nicht verwenden – Gewicht 300 ist die Markenstimme
- Große Border-Radii (12px+, Pillenformen) bei Karten oder Schaltflächen nicht verwenden – Stripe ist konservativ
- Keine neutralen grauen Schatten – immer mit Blau tönen (`rgba(50,50,93,...)`)
- `"ss01"` bei keinem sohne-var-Text überspringen – die alternativen Glyphen definieren die Persönlichkeit
- Reines Schwarz (`#000000`) für Überschriften nicht verwenden – immer `#061b31` tiefes Marine
- Warme Akzentfarben (Orange, Gelb) für interaktive Elemente nicht verwenden – Lila ist primär
- Keinen positiven Buchstabenabstand bei Displaygrößen anwenden – Stripe trackt eng
- Die Magenta/Ruby-Akzente nicht für Schaltflächen oder Links verwenden – sie sind nur dekorativ/Verlauf

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wichtigste Änderungen |
|------|-------|-------------|
| Mobil | <640px | Einzelspalte, reduzierte Überschriftengrößen, gestapelte Karten |
| Tablet | 640-1024px | 2-Spalten-Raster, moderater Innenabstand |
| Desktop | 1024-1280px | Vollständiges Layout, 3-Spalten-Feature-Raster |
| Großer Desktop | >1280px | Zentrierter Inhalt mit großzügigen Rändern |

### Touch-Ziele
- Schaltflächen verwenden bequemen Innenabstand (8px–16px vertikal)
- Navigationslinks bei 14px mit ausreichendem Abstand
- Abzeichen haben mindestens 6px horizontalen Innenabstand für Tap-Ziele
- Mobiler Nav-Umschalter mit 6px Radius-Schaltfläche

### Zusammenklapstrategie
- Hero: 56px Display -> 32px auf Mobil, Gewicht 300 beibehalten
- Navigation: horizontale Links + CTAs -> Hamburger-Umschalter
- Feature-Karten: 3-Spalten -> 2-Spalten -> einzelne gestapelte Spalte
- Dunkle Marken-Abschnitte: Vollbreiten-Behandlung beibehalten, internen Innenabstand reduzieren
- Finanzdaten-Tabellen: horizontales Scrollen auf Mobil
- Abschnittsabstand: 64px+ -> 40px auf Mobil
- Typografieskala komprimiert: 56px -> 48px -> 32px Hero-Größen über Breakpoints

### Bildverhalten
- Dashboard-/Produktscreenshots behalten blau getönte Schatten in allen Größen
- Hero-Verlauf-Dekorationen vereinfachen sich auf Mobil
- Code-Blöcke behalten `SourceCodePro`-Behandlung, können horizontal scrollen
- Kartenbilder behalten konsistenten 4px–6px Border-Radius

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primäres CTA: Stripe-Lila (`#533afd`)
- CTA Hover: Lila Dunkel (`#4434d4`)
- Hintergrund: Reines Weiß (`#ffffff`)
- Überschriftentext: Tiefes Marine (`#061b31`)
- Fließtext: Schiefer (`#64748d`)
- Beschriftungstext: Dunkler Schiefer (`#273951`)
- Rahmen: Weiches Blau (`#e5edf5`)
- Link: Stripe-Lila (`#533afd`)
- Dunkler Abschnitt: Marken-Dunkel (`#1c1e54`)
- Erfolg: Grün (`#15be53`)
- Dekorativer Akzent: Ruby (`#ea2261`), Magenta (`#f96bee`)

### Beispiel-Komponentenprompts
- "Erstelle einen Hero-Abschnitt auf weißem Hintergrund. Überschrift bei 48px sohne-var Gewicht 300, Zeilenhöhe 1.15, Buchstabenabstand -0.96px, Farbe #061b31, font-feature-settings 'ss01'. Untertitel bei 18px Gewicht 300, Zeilenhöhe 1.40, Farbe #64748d. Lila CTA-Schaltfläche (#533afd, 4px Radius, 8px 16px Innenabstand, weißer Text) und Ghost-Schaltfläche (transparent, 1px solid #b9b9f9, #533afd Text, 4px Radius)."
- "Gestalte eine Karte: weißer Hintergrund, 1px solid #e5edf5 Rahmen, 6px Radius. Schatten: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Titel bei 22px sohne-var Gewicht 300, Buchstabenabstand -0.22px, Farbe #061b31, 'ss01'. Fließtext bei 16px Gewicht 300, #64748d."
- "Erstelle ein Erfolgsabzeichen: rgba(21,190,83,0.2) Hintergrund, #108c3d Text, 4px Radius, 1px 6px Innenabstand, 10px sohne-var Gewicht 300, Rahmen 1px solid rgba(21,190,83,0.4)."
- "Erstelle Navigation: weißer fixierter Header mit backdrop-filter blur(12px). sohne-var 14px Gewicht 400 für Links, #061b31 Text, 'ss01'. Lila CTA 'Jetzt starten' rechtsbündig (#533afd Hintergrund, weißer Text, 4px Radius). Nav-Container 6px Radius."
- "Gestalte einen dunklen Marken-Abschnitt: #1c1e54 Hintergrund, weißer Text. Überschrift 32px sohne-var Gewicht 300, Buchstabenabstand -0.64px, 'ss01'. Fließtext 16px Gewicht 300, rgba(255,255,255,0.7). Karten innen verwenden rgba(255,255,255,0.1) Rahmen mit 6px Radius."

### Iterationsleitfaden
1. `font-feature-settings: "ss01"` auf sohne-var-Text immer aktivieren – das ist die typografische DNA der Marke
2. Gewicht 300 ist der Standard; 400 nur für Schaltflächen/Links/Navigation verwenden
3. Schattenformel: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` wobei Y1/B1 größer sind (ferner Schatten) und Y2/B2 kleiner (naher Schatten)
4. Überschriftenfarbe ist `#061b31` (tiefes Marine), Fließtext ist `#64748d` (Schiefer), Beschriftungen sind `#273951` (dunkler Schiefer)
5. Border-Radius bleibt im Bereich 4px–8px – niemals Pillenformen oder große Abrundungen verwenden
6. `"tnum"` für alle Zahlen in Tabellen, Diagrammen oder Finanzanzeigen verwenden
7. Dunkle Abschnitte verwenden `#1c1e54` – nicht Schwarz, nicht Grau, sondern ein tiefes Marken-Indigo
8. SourceCodePro für Code bei 12px/500 mit 2.00 Zeilenhöhe (sehr großzügig für Lesbarkeit)
