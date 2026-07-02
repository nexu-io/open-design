# Von Uber inspiriertes Designsystem

> Category: Medien & Konsumgüter
> Mobilitätsplattform. Kühnes Schwarzweiß, kompakte Typografie, urbane Energie.

## 1. Visuelles Thema & Atmosphäre

Ubers Designsprache ist ein Meisterkurs in selbstbewusstem Minimalismus -- ein schwarz-weißes Universum, in dem jedes Pixel einem Zweck dient und nichts dekoriert, ohne seinen Platz verdient zu haben. Die gesamte Erfahrung baut auf einer extremen Dualität auf: Tiefschwarz (`#000000`) und Reinweiß (`#ffffff`), mit praktisch keinen Mittelgrautönen, die die Botschaft verwässern. Dies ist nicht der sterile Minimalismus eines Startups, das noch nicht fertig entworfen hat -- es ist die bewusste Zurückhaltung einer so etablierten Marke, die es sich leisten kann zu flüstern.

Die charakteristische Schriftart UberMove ist eine proprietäre geometrische Serifenlose mit einer ausgeprägten quadratischen, technisch anmutenden Qualität. Headlines in UberMove Bold bei 52px tragen die Wucht eines Plakats -- autoritativ, direkt, kompromisslos. Die Begleitschrift UberMoveText übernimmt Fließtext und Buttons mit einem etwas weicheren, besser lesbaren Charakter bei mittlerem Gewicht (500). Zusammen schaffen sie ein typografisches System, das sich wie eine Verkehrskarte anfühlt: klar, effizient, fürs schnelle Überfliegen gebaut.

Was Ubers Design wirklich auszeichnet, ist die Verwendung von vollflächiger Fotografie und Illustration kombiniert mit pillenförmigen interaktiven Elementen (999px Eckenradius). Navigations-Chips, CTA-Buttons und Kategorienauswähler teilen alle diese Kapselform und schaffen eine taktile, daumenfreundliche Schnittstellensprache, die unverkennbar Uber ist. Die Illustrationen -- warme, leicht stilisierte Szenen von Fahrern, Mitfahrenden und Stadtlandschaften -- injizieren Menschlichkeit in ein System, das sonst kalt und monochrom wirken könnte. Die Website wechselt zwischen weißen Inhaltsbereichen und einem vollschwarzen Footer, mit kartenbasiertem Layout und den zartestmöglichen Schatten (rgba(0,0,0,0.12-0.16)), die subtile Tiefe ohne Bruch der flachen Ästhetik erzeugen.

**Hauptmerkmale:**
- Rein schwarz-weiße Grundlage mit praktisch keinen Mittelgrautönen im UI-Rahmen
- UberMove (Headlines) + UberMoveText (Text/UI) -- proprietäre geometrische Serifenlosenfamilie
- Pillenform für alles: Buttons, Chips, Nav-Elemente verwenden alle 999px Eckenradius
- Warme, menschliche Illustrationen kontrastieren die strenge monochrome Oberfläche
- Kartenbasiertes Layout mit flüsterweichen Schatten (0,12-0,16 Deckkraft)
- 8px-Abstands-Raster mit kompakten, informationsdichten Layouts
- Kühne Fotografie als vollflächiger Hero-Hintergrund integriert
- Schwarzer Footer, der die Seite in einer dunklen, kontraststarken Umgebung verankert

## 2. Farbpalette & Rollen

### Primärfarben
- **Uber Black** (`#000000`): Die definierende Markenfarbe -- verwendet für primäre Buttons, Headlines, Navigationstext und Footer. Nicht "Fast-Schwarz" oder "Off-Black", sondern wahres, kompromissloses Schwarz.
- **Pure White** (`#ffffff`): Die primäre Oberflächenfarbe und invertierter Text. Verwendet für Seitenhintergründe, Kartenoberflächen und Text auf schwarzen Elementen.

### Interaktive & Button-Zustände
- **Hover Gray** (`#e2e2e2`): Hover-Zustand weißer Buttons -- ein klares, kühles Hellgrau, das deutliches Feedback ohne Wärme liefert.
- **Hover Light** (`#f3f3f3`): Subtiler Hover für erhöhte weiße Buttons -- kaum wahrnehmbares Grau für sanftes Interaktions-Feedback.
- **Chip Gray** (`#efefef`): Hintergrund für Sekundär-/Filterbuttons und Navigations-Chips -- ein neutrales, ultra-helles Grau.

### Text & Inhalt
- **Body Gray** (`#4b4b4b`): Sekundärtext und Footer-Links -- ein echtes Mittelgrau ohne warm oder kühle Tendenz.
- **Muted Gray** (`#afafaf`): Tertiärtext, dezente Footer-Links und Platzhaltercontent.

### Rahmen & Trennung
- **Border Black** (`#000000`): Dünne 1px-Rahmen für strukturelle Abgrenzung -- sparsam bei Trennlinien und Formcontainern verwendet.

### Schatten & Tiefe
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Standard-Kartenerhöhung -- ein federleichter Lift für Inhaltskarten.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Etwas stärkere Erhöhung für schwebende Action-Buttons und Overlays.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Eingebetteter Schatten für aktive/gedrückte Zustände bei Sekundärbuttons.

### Link-Zustände
- **Default Link Blue** (`#0000ee`): Standard-Browser-Blau für unterstrichene Textlinks -- im Fließtext verwendet.
- **Link White** (`#ffffff`): Links auf dunklen Oberflächen -- in Footer und dunklen Bereichen verwendet.
- **Link Black** (`#000000`): Links auf hellen Oberflächen mit Unterstrich-Dekoration.

### Verlauf-System
- Ubers Design ist **vollständig verlaufsfrei**. Die Schwarz/Weiß-Dualität und flache Farbblöcke erzeugen die gesamte visuelle Hierarchie. Nirgendwo im System erscheinen Verläufe -- jede Oberfläche ist eine Volltonfarbe, jeder Übergang ist eine harte Kante oder ein Schatten.

## 3. Typografie-Regeln

### Schriftfamilie
- **Headline/Display**: `UberMove`, mit Fallbacks: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Text/UI**: `UberMoveText`, mit Fallbacks: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Hinweis: UberMove und UberMoveText sind proprietäre Schriftarten. Für externe Implementierungen, verwende `system-ui` oder Inter als nächste verfügbare Alternative. Der geometrische, quadratisch proportionierte Charakter von UberMove kann mit Inter oder DM Sans angenähert werden.*

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Hinweise |
|------|------|------|--------|-------------|-------|
| Display/Hero | UberMove | 52px (3,25rem) | 700 | 1,23 (eng) | Maximale Wirkung, Plakatwand-Präsenz |
| Abschnittsüberschrift | UberMove | 36px (2,25rem) | 700 | 1,22 (eng) | Haupt-Abschnittsanker |
| Kartentitel | UberMove | 32px (2rem) | 700 | 1,25 (eng) | Karten- und Feature-Überschriften |
| Zwischenüberschrift | UberMove | 24px (1,5rem) | 700 | 1,33 | Sekundäre Abschnittsheader |
| Kleine Überschrift | UberMove | 20px (1,25rem) | 700 | 1,40 | Kompakte Überschriften, Listentitel |
| Nav/UI Groß | UberMoveText | 18px (1,13rem) | 500 | 1,33 | Navigationslinks, prominente UI-Texte |
| Text/Button | UberMoveText | 16px (1rem) | 400-500 | 1,25-1,50 | Standard-Fließtext, Button-Beschriftungen |
| Caption | UberMoveText | 14px (0,88rem) | 400-500 | 1,14-1,43 | Metadaten, Beschreibungen, kleine Links |
| Mikro | UberMoveText | 12px (0,75rem) | 400 | 1,67 (locker) | Kleingedrucktes, Rechtstexte |

### Grundsätze
- **Fette Headlines, mittlerer Text**: UberMove-Überschriften haben ausschließlich das Gewicht 700 (Fett) -- jede Überschrift trifft mit Plakatwand-Kraft. UberMoveText für Text und UI-Text verwendet 400-500 und erzeugt eine klare visuelle Hierarchie durch Gewichtskontrast.
- **Enge Überschriften-Zeilenhöhen**: Alle Headlines verwenden Zeilenhöhen zwischen 1,22-1,40 -- kompakt und prägnant, für das Überfliegen statt fürs Lesen ausgelegt.
- **Funktionale Typografie**: Es gibt nirgendwo dekorative Textbehandlung. Kein Buchstabenabstand, keine Textumwandlung, kein dekoratives Sizing. Jedes Textelement dient einem direkten Kommunikationszweck.
- **Zwei Schriften, strikte Rollen**: UberMove ist ausschließlich für Überschriften. UberMoveText ist ausschließlich für Text, Buttons, Links und UI. Die Grenze wird nie überschritten.

## 4. Komponentenstile

### Buttons

**Primär Schwarz (CTA)**
- Hintergrund: Uber Black (`#000000`)
- Text: Pure White (`#ffffff`)
- Innenabstand: 10px 12px
- Radius: 999px (volle Pille)
- Kontur: keine
- Fokus: Eingebetteter Ring `rgb(255,255,255) 0px 0px 0px 2px`
- Der primäre Action-Button -- fett, hoher Kontrast, nicht zu übersehen

**Sekundär Weiß**
- Hintergrund: Pure White (`#ffffff`)
- Text: Uber Black (`#000000`)
- Innenabstand: 10px 12px
- Radius: 999px (volle Pille)
- Hover: Hintergrund wechselt zu Hover Gray (`#e2e2e2`)
- Fokus: Hintergrund wechselt zu Hover Gray, eingebetteter Ring erscheint
- Verwendet auf dunklen Oberflächen oder als sekundäre Aktion neben Primär Schwarz

**Chip/Filter**
- Hintergrund: Chip Gray (`#efefef`)
- Text: Uber Black (`#000000`)
- Innenabstand: 14px 16px
- Radius: 999px (volle Pille)
- Aktiv: Eingebetteter Schatten `rgba(0,0,0,0.08)`
- Navigations-Chips, Kategorienauswähler, Filter-Umschalter

**Schwebende Aktion**
- Hintergrund: Pure White (`#ffffff`)
- Text: Uber Black (`#000000`)
- Innenabstand: 14px
- Radius: 999px (volle Pille)
- Schatten: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` leichter Versatz
- Hover: Hintergrund wechselt zu `#f3f3f3`
- Kartensteuerungen, Scroll-nach-oben, schwebende CTAs

### Karten & Container
- Hintergrund: Pure White (`#ffffff`) auf weißen Seiten; keine deutliche Karten-Hintergrund-Differenzierung
- Rahmen: standardmäßig keiner -- Karten werden durch Schatten, nicht Kontur definiert
- Radius: 8px für Standard-Inhaltskarten; 12px für hervorgehobene/beworbene Karten
- Schatten: `rgba(0,0,0,0.12) 0px 4px 16px 0px` für Standard-Lift
- Karten sind inhaltsdicht mit minimalem Innenabstand
- Bild-geführte Karten verwenden vollflächige Bilder mit Text-Overlay oder darunter

### Eingaben & Formulare
- Text: Uber Black (`#000000`)
- Hintergrund: Pure White (`#ffffff`)
- Rahmen: 1px Vollton Schwarz (`#000000`) -- der einzige Ort, an dem sichtbare Rahmen deutlich erscheinen
- Radius: 8px
- Innenabstand: Standard bequemer Abstand
- Fokus: kein extrahierter benutzerdefinierter Fokuszustand -- verlässt sich auf Standard-Browser-Fokusring

### Navigation
- Klebende Topnavigation mit weißem Hintergrund
- Logo: Uber-Wortmarke/Symbol bei 24x24px in Schwarz
- Links: UberMoveText bei 14-18px, Gewicht 500, in Uber Black
- Pillenförmige Navigations-Chips mit Chip Gray (`#efefef`) Hintergrund für Kategorienavigation ("Fahren", "Fahren anbieten", "Business", "Uber Eats")
- Menü-Umschalter: runder Button mit 50% Eckenradius
- Mobil: Hamburger-Menü-Muster

### Bildbehandlung
- Warme, handillustrierte Szenen (keine Fotos für Feature-Abschnitte)
- Illustrationsstil: leicht stilisierte Menschen, warme Farbpalette in Illustrationen, zeitgenössisches Flair
- Hero-Abschnitte verwenden kühne Fotografie oder Illustration als Vollbreiten-Hintergrund
- QR-Codes für App-Download-CTAs
- Alle Bilder verwenden Standard 8px oder 12px Eckenradius, wenn in Karten enthalten

### Markante Komponenten

**Kategorien-Pille-Navigation**
- Horizontale Reihe pillenförmiger Buttons für Navigation der obersten Ebene ("Fahren", "Fahren anbieten", "Business", "Uber Eats", "Über uns")
- Jede Pille: Chip Gray Hintergrund, schwarzer Text, 999px Radius
- Aktiver Zustand durch schwarzen Hintergrund mit weißem Text angezeigt (Umkehrung)

**Hero mit doppelter Aktion**
- Geteilter Hero: Text/CTA links, Karte/Illustration rechts
- Zwei nebeneinander liegende Eingabefelder für Abholung/Ziel
- "Preise anzeigen" CTA-Button in schwarzer Pille

**Plan-Ahead-Karten**
- Karten zur Bewerbung von Funktionen wie "Uber Reserve" und Reiseplanung
- Illustrationsreich mit warmen, menschenzentrierten Bildern
- Schwarze CTA-Buttons mit weißem Text unten

## 5. Layout-Grundsätze

### Abstands-System
- Basiseinheit: 8px
- Skala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Button-Innenabstand: 10px 12px (kompakt) oder 14px 16px (bequem)
- Karten-Innenabstand: circa 24-32px
- Vertikaler Abstand zwischen Abschnitten: großzügig aber effizient -- circa 64-96px zwischen Hauptabschnitten

### Raster & Container
- Maximale Container-Breite: circa 1136px, zentriert
- Hero: geteiltes Layout mit Text links, Visuell rechts
- Feature-Abschnitte: 2-spaltiges Karten-Raster oder vollbreites Einspalten-Layout
- Footer: mehrspaltiges Link-Raster auf schwarzem Hintergrund
- Vollbreite Abschnitte, die sich bis zu den Viewport-Kanten erstrecken

### Leerraumphilosophie
- **Effizient, nicht luftig**: Ubers Leerraum ist funktional -- genug um zu trennen, nie genug um leer zu wirken. Das ist Abstands-System im Transit-Stil: kompakt, klar, zweckorientiert.
- **Inhaltsdichte Karten**: Karten packen Informationen eng zusammen mit minimalem Innenabstand und verlassen sich auf Schatten und Radius zur Grenzendefinition.
- **Abschnitts-Atemraum**: Hauptabschnitte erhalten großzügigen vertikalen Abstand, aber innerhalb der Abschnitte sind Elemente eng gruppiert.

### Eckenradius-Skala
- Scharf (0px): Keine quadratischen Ecken bei interaktiven Elementen
- Standard (8px): Inhaltskarten, Eingabefelder, Listenboxen
- Bequem (12px): Hervorgehobene Karten, größere Container, Link-Karten
- Volle Pille (999px): Alle Buttons, Chips, Navigationselemente, Pillen
- Kreis (50%): Avatar-Bilder, Symbol-Container, kreisförmige Steuerungen

## 6. Tiefe & Erhöhung

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten, einfarbiger Hintergrund | Seitenhintergrund, Inline-Inhalt, Textabschnitte |
| Subtil (Ebene 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Standard-Inhaltskarten, Feature-Blöcke |
| Mittel (Ebene 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Erhöhte Karten, Overlay-Elemente |
| Schwebend (Ebene 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Schwebende Action-Buttons, Kartensteuerungen |
| Gedrückt (Ebene 4) | `rgba(0,0,0,0.08) inset` (999px Streuung) | Aktive/gedrückte Button-Zustände |
| Fokusring | `rgb(255,255,255) 0px 0px 0px 2px inset` | Tastatur-Fokusindikatoren |

**Schattenphilosophie**: Uber verwendet Schatten als rein strukturelles Werkzeug, niemals dekorativ. Schatten sind immer Schwarz bei sehr niedriger Deckkraft (0,08-0,16) und erzeugen den absoluten Mindest-Lift, der zur Trennung von Inhaltsebenen benötigt wird. Die Unschärferadien sind moderat (8-16px) -- genug um natürlich zu fühlen, aber nie dramatisch. Keine farbigen Schatten, keine geschichteten Schatten-Stacks, keine Umgebungsglüh-Effekte. Tiefe wird mehr durch den Schwarz/Weiß-Abschnittskontrast als durch Schatten-Erhöhung vermittelt.

## 7. Tun & Lassen

### Tun
- Wahres Schwarz (`#000000`) und reines Weiß (`#ffffff`) als primäre Palette verwenden -- der starke Kontrast IST Uber
- 999px Eckenradius für alle Buttons, Chips und pillenförmige Navigationselemente verwenden
- Alle Headlines in UberMove Bold (700) für Plakatwand-Level-Wirkung behalten
- Flüsterweiche Schatten (Deckkraft 0,12-0,16) für Kartenerhöhung verwenden -- kaum sichtbar
- Den kompakten, informationsdichten Layout-Stil beibehalten -- Uber priorisiert Effizienz über Luftigkeit
- Warme, menschenzentrierte Illustrationen verwenden, um die monochrome Oberfläche zu mildern
- 8px Radius für Inhaltskarten und 12px für hervorgehobene Container anwenden
- UberMoveText mit Gewicht 500 für Navigation und prominente UI-Texte verwenden
- Schwarze primäre Buttons mit weißen sekundären Buttons für Doppel-Aktion-Layouts kombinieren

### Nicht tun
- Keine Farben in den UI-Rahmen einführen -- Ubers Oberfläche ist strikt Schwarz, Weiß und Grau
- Keine Eckenradien kleiner als 999px auf Buttons verwenden -- die vollständige Pillenform ist ein Kernidentitätselement
- Keine schweren Schatten oder Schlagschatten mit hoher Deckkraft anwenden -- Tiefe ist flüstersubtil
- Keine Serifenschriften irgendwo verwenden -- Ubers Typografie ist ausschließlich geometrische Serifenlos
- Keine luftigen, geräumigen Layouts mit übermäßigem Leerraum erstellen -- Ubers Dichte ist beabsichtigt
- Keine Verläufe oder Farbüberlagerungen verwenden -- jede Oberfläche ist eine flache, einfarbige Farbe
- UberMove nicht in Fließtext oder UberMoveText nicht in Headlines mischen -- die Hierarchie ist strikt
- Keine dekorativen Rahmen verwenden -- Rahmen sind funktional (Eingaben, Trennlinien) oder gar nicht vorhanden
- Den Schwarz/Weiß-Kontrast nicht mit Off-Whites oder Fast-Schwarz mildern -- die Dualität ist beabsichtigt

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wichtige Änderungen |
|------|-------|-------------|
| Mobil Klein | 320px | Minimales Layout, einzelne Spalte, gestapelte Eingaben, kompakte Typografie |
| Mobil | 600px | Standard-Mobil, gestapeltes Layout, Hamburger-Nav |
| Tablet Klein | 768px | Zweispaltige Raster beginnen, erweiterte Kartenlayouts |
| Tablet | 1119px | Volles Tablet-Layout, nebeneinander liegender Hero-Inhalt |
| Desktop Klein | 1120px | Desktop-Raster aktiviert, horizontale Nav-Pillen |
| Desktop | 1136px | Volles Desktop-Layout, maximale Container-Breite, geteilter Hero |

### Touch-Ziele
- Alle Pillen-Buttons: mindestens 44px Höhe (10-14px vertikaler Innenabstand + Zeilenhöhe)
- Navigations-Chips: großzügiger 14px 16px Innenabstand für komfortables Daumentippen
- Kreisförmige Steuerungen (Menü, Schließen): 50% Radius sorgt für große, leicht treffbare Ziele
- Kartenoberflächen dienen als vollflächige Touch-Ziele auf Mobilgeräten

### Zusammenklapp-Strategie
- **Navigation**: Horizontale Pille-Nav klappt zu Hamburger-Menü mit Kreis-Umschalter zusammen
- **Hero**: Geteiltes Layout (Text + Karte/Visuell) stapelt sich zur Einzelspalte -- Text oben, Visuell unten
- **Eingabefelder**: Nebeneinander liegende Abholung/Ziel-Eingaben stapeln sich vertikal
- **Feature-Karten**: 2-spaltiges Raster klappt zu vollbreiten gestapelten Karten zusammen
- **Überschriften**: 52px Display skaliert über 36px, 32px, 24px, 20px
- **Footer**: Mehrspaltiges Link-Raster klappt zu Akkordeon oder gestapelter Einzelspalte zusammen
- **Kategorien-Pillen**: Horizontales Scrollen mit Überlauf auf kleineren Bildschirmen

### Bild-Verhalten
- Illustrationen skalieren proportional innerhalb ihrer Container
- Hero-Bilder behalten das Seitenverhältnis, können auf kleineren Bildschirmen zugeschnitten werden
- QR-Code-Abschnitte werden auf Mobil ausgeblendet (App-Download wechselt zu direkten Store-Links)
- Karten-Bilder behalten 8-12px Eckenradius bei allen Größen

## 9. Agent-Prompt-Leitfaden

### Schnellfarb-Referenz
- Primärer Button: "Uber Black (#000000)"
- Seitenhintergrund: "Pure White (#ffffff)"
- Button-Text (auf Schwarz): "Pure White (#ffffff)"
- Button-Text (auf Weiß): "Uber Black (#000000)"
- Sekundärtext: "Body Gray (#4b4b4b)"
- Tertiärtext: "Muted Gray (#afafaf)"
- Chip-Hintergrund: "Chip Gray (#efefef)"
- Hover-Zustand: "Hover Gray (#e2e2e2)"
- Karten-Schatten: "rgba(0,0,0,0.12) 0px 4px 16px"
- Footer-Hintergrund: "Uber Black (#000000)"

### Beispiel-Komponentenprompts
- "Erstelle einen Hero-Abschnitt auf Pure White (#ffffff) mit einer Überschrift bei 52px UberMove Bold (700), Zeilenhöhe 1,23. Verwende Uber Black (#000000) Text. Füge einen Untertitel in Body Gray (#4b4b4b) bei 16px UberMoveText Gewicht 400 mit Zeilenhöhe 1,50 hinzu. Platziere einen Uber Black (#000000) Pille-CTA-Button mit Pure White Text, 999px Radius, Innenabstand 10px 12px."
- "Entwirf eine Kategorien-Navigationsleiste mit horizontalen Pillen-Buttons. Jede Pille: Chip Gray (#efefef) Hintergrund, Uber Black (#000000) Text, 14px 16px Innenabstand, 999px border-radius. Aktive Pille kehrt zu Uber Black Hintergrund mit Pure White Text um. Verwende UberMoveText bei 14px Gewicht 500."
- "Baue eine Feature-Karte auf Pure White (#ffffff) mit 8px border-radius und Schatten rgba(0,0,0,0.12) 0px 4px 16px. Titel in UberMove bei 24px Gewicht 700, Beschreibung in Body Gray (#4b4b4b) bei 16px UberMoveText. Füge unten einen schwarzen Pille-CTA-Button hinzu."
- "Erstelle einen dunklen Footer auf Uber Black (#000000) mit Pure White (#ffffff) Überschriftentext in UberMove bei 20px Gewicht 700. Footer-Links in Muted Gray (#afafaf) bei 14px UberMoveText. Links hovern zu Pure White. Mehrspaltiges Raster-Layout."
- "Entwirf einen schwebenden Action-Button mit Pure White (#ffffff) Hintergrund, 999px Radius, 14px Innenabstand und Schatten rgba(0,0,0,0.16) 0px 2px 8px. Hover verschiebt Hintergrund zu #f3f3f3. Für Scroll-nach-oben oder Kartensteuerungen verwenden."

### Iterations-Leitfaden
1. Konzentriere dich auf EINE Komponente auf einmal
2. Referenziere die strikte Schwarz/Weiß-Palette -- "Uber Black (#000000) verwenden" nicht "mach es dunkel"
3. Gib immer 999px Radius für Buttons und Pillen an -- das ist für die Uber-Identität nicht verhandelbar
4. Beschreibe die Schriftfamilie explizit -- "UberMove Bold für die Überschrift, UberMoveText Medium für das Label"
5. Für Schatten, verwende "Flüster-Schatten (rgba(0,0,0,0.12) 0px 4px 16px)" -- niemals schwere Schlagschatten
6. Layouts kompakt und informationsdicht halten -- Uber ist effizient, nicht luftig
7. Illustrationen sollten warm und menschlich sein -- beschreibe "stilisierte Menschen in warmen Tönen", nicht abstrakte Formen
8. Schwarze CTAs mit weißen Sekundärelementen für ausgewogene Doppel-Aktion-Layouts kombinieren
