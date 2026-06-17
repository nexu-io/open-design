# Design System Inspired by Cohere

> Kategorie: KI & LLM
> Enterprise-KI-Plattform. Lebendige Verläufe, datenreiche Dashboard-Ästhetik.

## 1. Visuelles Thema & Atmosphäre

Coheres Benutzeroberfläche ist ein poliertes Enterprise Command Deck – selbstbewusst, klar und darauf ausgelegt, KI wie ernsthafte Infrastruktur wirken zu lassen, nicht wie ein Konsumerprodukt. Die Erfahrung entfaltet sich auf einem hellen weißen Canvas, auf dem Inhalte in großzügig abgerundeten Karten (22px Radius) organisiert sind, die eine organische, wolkenartige Containersprache erzeugen. Diese Seite spricht CTOs und Enterprise-Architekten an: professionell ohne kalt zu sein, anspruchsvoll ohne einzuschüchtern.

Die Designsprache verbindet zwei Welten durch ein duales Schriftbild-System: CohereText, eine individuelle Display-Serifenschrift mit engem Tracking, verleiht Überschriften die Schwere eines technologischen Manifests, während Unica77 Cohere Web alle Fließtexte und UI-Texte mit geometrischer Schweizer Präzision übernimmt. Diese Paarung aus Serif und Sans erzeugt eine Persönlichkeit, die „souveräne Autorität trifft technische Klarheit" verkörpert – perfekt für eine Enterprise-KI-Plattform.

Farbe wird mit extremer Zurückhaltung eingesetzt – die Oberfläche ist nahezu vollständig schwarz-weiß mit kühlen grauen Umrandungen (`#d9d9dd`, `#e5e7eb`). Lila-Violett erscheint nur in fotografischen Hero-Bändern, Verlaufsabschnitten und dem interaktiven Blau (`#1863dc`), das Hover- und Fokuszustände signalisiert. Diese chromatische Zurückhaltung bewirkt, dass Farbe, wenn sie DOCH erscheint – in Produkt-Screenshots, Enterprise-Fotografie und dem tieflila Abschnitt – maximales visuelles Gewicht trägt.

**Hauptmerkmale:**
- Heller weißer Canvas mit kühlen grauen Begrenzungsrändern
- 22px Signatur-Rahmenradius – die charakteristische „Cohere Card"-Rundung
- Duale individuelle Schriftart: CohereText (Display-Serif) + Unica77 (Fließtext-Sans)
- Enterprise-gerechte chromatische Zurückhaltung: Schwarz, Weiß, kühle Grautöne, minimaler lila-blauer Akzent
- Tiefe lila/violette Hero-Abschnitte mit dramatischem Kontrast
- Ghost-/transparente Buttons, die beim Hover zu Blau wechseln
- Enterprise-Fotografie mit vielfältigen realen Anwendungen
- CohereMono für Code und technische Beschriftungen mit Großbuchstaben-Transformierungen

## 2. Farbpalette & Rollen

### Primär
- **Cohere Black** (`#000000`): Primäre Überschriftenfarbe und Elemente mit maximaler Betonung.
- **Near Black** (`#212121`): Standard-Linkfarbe für Fließtext – etwas weicher als reines Schwarz.
- **Deep Dark** (`#17171c`): Ein blaustichiges Dunkelgrau für Navigation und Text in dunklen Abschnitten.

### Sekundär & Akzent
- **Interaction Blue** (`#1863dc`): Der primäre interaktive Akzent – erscheint beim Button-Hover, Fokuszuständen und aktiven Links. Die einzige chromatische Aktionsfarbe.
- **Ring Blue** (`#4c6ee6` bei 50%): Tailwind Ring-Farbe für Tastatur-Fokusindikatoren.
- **Focus Purple** (`#9b60aa`): Fokusrahmenfarbe für Eingabefelder – ein gedämpftes Violett.

### Oberfläche & Hintergrund
- **Pure White** (`#ffffff`): Der primäre Seitenhintergrund und die Kartenoberfläche.
- **Snow** (`#fafafa`): Subtil erhöhte Oberflächen und Hintergründe für helle Abschnitte.
- **Lightest Gray** (`#f2f2f2`): Kartenränder und die zartesten Begrenzungslinien.

### Neutrale Töne & Text
- **Muted Slate** (`#93939f`): Abgestufte Footer-Links und tertiärer Text – ein kühles Grau mit leichtem blau-violetten Einschlag.
- **Border Cool** (`#d9d9dd`): Standard-Trennlinie für Abschnitte und Listenelemente – ein kühles, leicht lila-getöntes Grau.
- **Border Light** (`#e5e7eb`): Hellere Randvariante – Tailwinds Standard-gray-200.

### Verlaufsystem
- **Lila-Violetter Hero-Band**: Tiefe lila Verlaufsabschnitte, die dramatischen Kontrast zum weißen Canvas erzeugen. Diese erscheinen als vollbreite Bänder, die Produkt-Screenshots und Kernbotschaften rahmen.
- **Dunkler Footer-Verlauf**: Die Seite geht durch Tiefviolett/Anthrazit in den schwarzen Footer über und erzeugt einen „Dämmerung"-Effekt.

## 3. Typografie-Regeln

### Schriftfamilie
- **Display**: `CohereText`, mit Fallbacks: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Fließtext / UI**: `Unica77 Cohere Web`, mit Fallbacks: `Inter, Arial, ui-sans-serif, system-ui`
- **Code**: `CohereMono`, mit Fallbacks: `Arial, ui-sans-serif, system-ui`
- **Icons**: `CohereIconDefault` (individuelle Icon-Schrift)

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (eng) | -1.44px | Maximale Wirkung, Serif-Autorität |
| Display Sekundär | CohereText | 60px (3.75rem) | 400 | 1.00 (eng) | -1.2px | Große Abschnittsüberschriften |
| Abschnittsüberschrift | Unica77 | 48px (3rem) | 400 | 1.20 (eng) | -0.48px | Feature-Abschnittstitel |
| Unterüberschrift | Unica77 | 32px (2rem) | 400 | 1.20 (eng) | -0.32px | Kartenüberschriften, Feature-Namen |
| Feature-Titel | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Kleinere Abschnittstitel |
| Fließtext Groß | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Einleitungsabsätze |
| Fließtext / Button | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Standard-Fließtext, Button-Text |
| Button Medium | Unica77 | 14px (0.88rem) | 500 | 1.71 (locker) | normal | Kleinere Buttons, betonte Beschriftungen |
| Bildunterschrift | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadaten, Beschreibungen |
| Großbuchstaben-Label | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Abschnittsbeschriftungen in Großbuchstaben |
| Klein | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Kleinster Text, Footer-Links |
| Code Mikro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Winzige Code-Labels in Großbuchstaben |

### Grundsätze
- **Serif für Deklaration, Sans für Funktionalität**: CohereText trägt die Markenstimme auf Display-Ebene – seine Serifen verleihen Überschriften die Autorität veröffentlichter Forschungsarbeiten. Unica77 übernimmt alles Funktionale mit Schweizer geometrischer Neutralität.
- **Negatives Tracking bei großen Schriftgraden**: CohereText verwendet -1,2px bis -1,44px Buchstabenabstand bei 60–72px und erzeugt dichte, wirkungsvolle Textblöcke.
- **Einheitliches Fließtextgewicht**: Nahezu die gesamte Unica77-Nutzung erfolgt mit Gewicht 400. Gewicht 500 erscheint nur zur Betonung kleiner Buttons. Das System stützt sich auf Größe und Abstände, nicht auf Gewichtskontraste.
- **Code-Labels in Großbuchstaben**: CohereMono verwendet Großbuchstaben mit positivem Buchstabenabstand (0,16–0,28px) für technische Tags und Abschnittsmarkierungen.

## 4. Komponenten-Gestaltung

### Buttons

**Ghost / Transparent**
- Hintergrund: transparent (`rgba(255, 255, 255, 0)`)
- Text: Cohere Black (`#000000`)
- Kein sichtbarer Rahmen
- Hover: Text wechselt zu Interaction Blue (`#1863dc`), Deckkraft 0,8
- Fokus: 2px fester Rahmen in Interaction Blue
- Der primäre Button-Stil – unsichtbar bis zur Interaktion

**Dunkel Ausgefüllt**
- Hintergrund: dunkel/schwarz
- Text: Pure White
- Für CTAs auf hellen Oberflächen
- Pillenform oder Standardradius

**Umrissen**
- Rahmenbasierte Begrenzung
- Für sekundäre Aktionen

### Karten & Container
- Hintergrund: Pure White (`#ffffff`)
- Rahmen: dünner fester Lightest Gray (`1px solid #f2f2f2`) für dezente Karten; Cool Border (`#d9d9dd`) für betonte Karten
- Radius: **22px** – der Signatur-Cohere-Radius für primäre Karten, Bilder und Dialog-Container. Außerdem 4px, 8px, 16px, 20px für kleinere Elemente
- Schatten: minimal – Cohere vertraut auf Hintergrundfarbe und Rahmen statt auf Schatten
- Besonders: `0px 0px 22px 22px` Radius (nur unten abgerundet) für Abschnittscontainer
- Dialog: 8px Radius für Modal-/Dialogboxen

### Eingabefelder & Formulare
- Text: Weiß auf dunklem Eingabefeld, Schwarz auf hellem
- Fokusrahmen: Focus Purple (`#9b60aa`) mit `1px solid`
- Fokusschatten: roter Ring (`rgb(179, 0, 0) 0px 0px 0px 2px`) – wahrscheinlich für Fehlerzustandsanzeige
- Fokus-Outline: Interaction Blue, 2px fest

### Navigation
- Klare horizontale Navigation auf weißem oder dunklem Hintergrund
- Logo: Cohere-Wortmarke (individuelle SVG)
- Links: Dunkler Text, 16px Unica77
- CTA: Dunkel ausgefüllter Button
- Mobil: Hamburger-Kollaps

### Bildbehandlung
- Enterprise-Fotografie mit vielfältigen Motiven und Umgebungen
- Lila getönte Hero-Fotografie für dramatische Abschnitte
- Produkt-UI-Screenshots auf dunklen Oberflächen
- Bilder mit 22px Radius passend zum Kartensystem
- Vollbreite lila Verlaufsabschnitte

### Charakteristische Komponenten

**22px-Kartensystem**
- Der 22px-Rahmenradius ist Coheres visuelles Markenzeichen
- Alle primären Karten, Bilder und Container verwenden diesen Radius
- Erzeugt eine wolkenartige, organische Weichheit, die sich von den typischen 8–12px abhebt

**Enterprise-Vertrauensleiste**
- Firmenlogos in einem horizontalen Streifen dargestellt
- Demonstriert Enterprise-Akzeptanz
- Klare, monochrome Logo-Behandlung

**Lila Hero-Bänder**
- Vollbreite tieflila Abschnitte, die Produktpräsentationen rahmen
- Erzeugen dramatische visuelle Unterbrechungen im weißen Seitenfluss
- Produkt-Screenshots schweben innerhalb der lila Umgebung

**Großbuchstaben-Code-Tags**
- CohereMono in Großbuchstaben mit Buchstabenabstand
- Als Abschnittsmarkierungen und Kategorisierungs-Labels verwendet
- Schafft eine technische, strukturierte Informationshierarchie

## 5. Layout-Grundsätze

### Abstandssystem
- Basiseinheit: 8px
- Skala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Button-Padding je nach Variante
- Internes Karten-Padding: ca. 24–32px
- Vertikaler Abstand zwischen Abschnitten: großzügig (56–60px)

### Raster & Container
- Maximale Container-Breite: bis zu 2560px (sehr breit) mit responsiver Skalierung
- Hero: zentriert mit dramatischer Typografie
- Feature-Abschnitte: mehrspaltige Kartenraster
- Enterprise-Abschnitte: vollbreite lila Bänder
- 26 Breakpoints erkannt – äußerst granulares responsives System

### Weißraum-Philosophie
- **Enterprise-Klarheit**: Jeder Abschnitt präsentiert eine klare Aussage mit Atemraum dazwischen.
- **Fotografie als Hero**: Große fotografische Abschnitte bieten visuelles Interesse, ohne dekorative Designelemente zu benötigen.
- **Karten-Gruppierung**: Zusammengehörige Inhalte sind in 22px-abgerundeten Karten gruppiert und bilden natürliche Informationscluster.

### Rahmenradius-Skala
- Scharf (4px): Navigationselemente, kleine Tags, Paginierung
- Angenehm (8px): Dialogboxen, sekundäre Container, kleine Karten
- Großzügig (16px): Hervorgehobene Container, mittlere Karten
- Groß (20px): Große Feature-Karten
- Signatur (22px): Primäre Karten, Hero-Bilder, Hauptcontainer – DER Cohere-Radius
- Pille (9999px): Buttons, Tags, Statusindikatoren

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten, kein Rahmen | Seitenhintergrund, Textblöcke |
| Gerahmt (Ebene 1) | `1px solid #f2f2f2` oder `#d9d9dd` | Standard-Karten, Listentrennlinien |
| Lila Band (Ebene 2) | Vollbreiter dunkler lila Hintergrund | Hero-Abschnitte, Feature-Präsentationen |

**Schatten-Philosophie**: Cohere ist nahezu schattenfrei. Tiefe wird durch **Hintergrundfarbkontrast** (weiße Karten auf lila Bändern, weiße Oberfläche auf Snow), **Rahmenbegrenzung** (kühle graue Rahmen) und den dramatischen **Hell-Dunkel-Abschnittswechsel** kommuniziert. Wenn Elemente Elevation benötigen, erreichen sie diese durch Weiß-auf-Dunkel statt durch Schatten.

## 7. Empfehlungen & Warnungen

### Empfohlen
- 22px Rahmenradius auf allen primären Karten und Containern verwenden – es ist das visuelle Markenzeichen
- CohereText für Display-Überschriften (72px, 60px) mit negativem Buchstabenabstand verwenden
- Unica77 für alle Fließtexte und UI-Texte mit Gewicht 400 verwenden
- Palette in Schwarz-Weiß mit kühlen grauen Rahmen halten
- Interaction Blue (#1863dc) nur für interaktive Hover-/Fokuszustände verwenden
- Tiefe lila Abschnitte für dramatische visuelle Unterbrechungen und Produktpräsentationen verwenden
- Großbuchstaben + Buchstabenabstand auf CohereMono für Abschnittsbeschriftungen anwenden
- Enterprise-gerechte Fotografie mit vielfältigen Motiven beibehalten

### Nicht empfohlen
- Keinen anderen Rahmenradius als 22px auf primären Karten verwenden – der Signaturradius ist entscheidend
- Keine Warmtöne einführen – die Palette ist strikt kühl gehalten
- Keine starken Schatten verwenden – Tiefe entsteht durch Farbkontrast und Rahmen
- Kein fettes (700+) Gewicht für Fließtext verwenden – 400–500 ist der Bereich
- Die Serif/Sans-Hierarchie nicht überspringen – CohereText für Überschriften, Unica77 für Fließtext
- Lila nicht als Flächenfarbe für Karten verwenden – Lila ist ausschließlich für vollbreite Abschnitte reserviert
- Abstandsabstände nicht unter 40px reduzieren – Enterprise-Layouts brauchen Atemraum
- Buttons standardmäßig nicht mit Dekoration versehen – Ghost/Transparent ist der Ausgangszustand

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Kleines Mobilgerät | <425px | Kompaktes Layout, minimale Abstände |
| Mobilgerät | 425–640px | Einspaltig, gestapelte Karten |
| Großes Mobilgerät | 640–768px | Geringfügige Abstandsanpassungen |
| Tablet | 768–1024px | 2-spaltige Raster beginnen |
| Desktop | 1024–1440px | Vollständiges mehrspalriges Layout |
| Großer Desktop | 1440–2560px | Maximale Container-Breite |

*26 Breakpoints erkannt – eine der granularsten responsiven Websites im Datensatz.*

### Touch-Ziele
- Buttons ausreichend groß für Touch-Interaktion
- Navigationslinks mit angemessenem Abstand
- Kartenoberflächen als Touch-Ziele

### Kollaps-Strategie
- **Navigation**: Vollständige Navigation kollabiert zu Hamburger
- **Feature-Raster**: Mehrspaltig → 2-spaltig → einspaltig
- **Hero-Text**: 72px → 48px → 32px progressive Skalierung
- **Lila Abschnitte**: Vollbreite beibehalten, Inhalt stapelt sich
- **Kartenraster**: 3 → 2 → 1 Spalte

### Bildverhalten
- Fotografie skaliert proportional in 22px-Radius-Containern
- Produkt-Screenshots behalten das Seitenverhältnis bei
- Lila Abschnitte skalieren den Hintergrund proportional

## 9. Agenten-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primärer Text: „Cohere Black (#000000)"
- Seitenhintergrund: „Pure White (#ffffff)"
- Sekundärer Text: „Near Black (#212121)"
- Hover-Akzent: „Interaction Blue (#1863dc)"
- Gedämpfter Text: „Muted Slate (#93939f)"
- Kartenrahmen: „Lightest Gray (#f2f2f2)"
- Abschnittsrahmen: „Border Cool (#d9d9dd)"

### Beispiel-Komponenten-Prompts
- „Erstelle einen Hero-Abschnitt auf Pure White (#ffffff) mit CohereText bei 72px Gewicht 400, Zeilenhöhe 1,0, Buchstabenabstand -1,44px. Cohere Black Text. Untertitel in Unica77 bei 18px Gewicht 400, Zeilenhöhe 1,4."
- „Gestalte eine Feature-Karte mit 22px Rahmenradius, 1px fester Lightest Gray (#f2f2f2) Rahmen auf Weiß. Titel in Unica77 bei 32px, Buchstabenabstand -0,32px. Fließtext in Unica77 bei 16px, Muted Slate (#93939f)."
- „Erstelle einen Ghost-Button: transparenter Hintergrund, Cohere Black Text in Unica77 bei 16px. Beim Hover wechselt Text zu Interaction Blue (#1863dc) mit 0,8 Deckkraft. Fokus: 2px fester Interaction Blue Rahmen."
- „Erstelle einen tieflila vollbreiten Abschnitt mit weißem Text. CohereText bei 60px für die Überschrift. Produkt-Screenshot schwebt darin mit 22px Rahmenradius."
- „Gestalte ein Abschnitts-Label mit CohereMono bei 14px, Großbuchstaben, Buchstabenabstand 0,28px. Muted Slate (#93939f) Text."

### Iterationsleitfaden
1. Konzentriere dich auf EINE Komponente nach der anderen
2. Verwende immer 22px Radius für primäre Karten – „die Cohere-Karten-Rundung"
3. Gib die Schriftart an – CohereText für Überschriften, Unica77 für Fließtext, CohereMono für Labels
4. Interaktive Elemente verwenden Interaction Blue (#1863dc) nur beim Hover
5. Oberflächen weiß mit kühlen grauen Rahmen halten – keine Warmtöne
6. Lila ist für vollbreite Abschnitte, niemals für Kartenhintergründe
