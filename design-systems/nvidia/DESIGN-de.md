# Design System Inspired by NVIDIA

> Kategorie: Medien & Verbraucher
> GPU-Computing. Grün-schwarze Energie, technische Kraft-Ästhetik.

## 1. Visuelles Thema & Atmosphäre

Die Website von NVIDIA ist ein kontrastreicher, technologieorientierter Auftritt, der rohe Rechenleistung durch gestalterische Zurückhaltung kommuniziert. Die Seite baut auf einem klaren Schwarz (`#000000`) und Weiß (`#ffffff`) auf, akzentuiert durch NVIDIAs charakteristisches Grün (`#76b900`) – eine so spezifische Farbe, dass sie wie ein Marken-Fingerabdruck wirkt. Es ist nicht das saftige Grün der Natur, sondern das elektrische, limonenverschobene Grün von GPU-gerendertem Licht – eine Farbe zwischen Chartreuse und Kellgrün, die in der Technologiebranche sofort „NVIDIA" signalisiert.

Die benutzerdefinierte NVIDIA-EMEA-Schriftfamilie (mit Arial und Helvetica als Fallback) schafft eine klare, industrielle typografische Stimme. Überschriften in 36px fett mit engem Zeilenabstand 1.25 erzeugen dichte, autoritative Textblöcke. Die Schrift besitzt nicht die geometrische Verspieltheit von Silicon-Valley-Serifenlosen – sie ist europäisch, pragmatisch und ingenieursorientiert. Fließtext läuft bei 15–16px, angenehm zu lesen, aber nicht großzügig, was das Gefühl vermittelt, dass der Bildschirmplatz wie GPU-Speicher optimiert wird.

Was NVIDIAs Design von anderen Tech-Sites mit dunklem Hintergrund unterscheidet, ist der disziplinierte Einsatz des grünen Akzents. Das `#76b900` erscheint in Rahmen (`2px solid #76b900`), Link-Unterstreichungen (`underline 2px rgb(118, 185, 0)`) und CTAs – jedoch nie als Hintergrundfarbe oder große Fläche im Hauptinhalt. Das Grün ist ein Signal, keine Fläche. Kombiniert mit einem tiefen Schattensystem (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) und minimalem Eckenradius (1–2px) entsteht insgesamt der Eindruck von Präzisionshardware, in Pixeln gerendert.

**Wesentliche Merkmale:**
- NVIDIA-Grün (`#76b900`) als reiner Akzent – ausschließlich für Rahmen, Unterstreichungen und interaktive Hervorhebungen
- Schwarz (`#000000`) als dominanter Hintergrund mit weißem (`#ffffff`) Text auf dunklen Bereichen
- NVIDIA-EMEA-Custom-Schrift mit Arial/Helvetica-Fallback – industriell, europäisch, klar
- Enge Zeilenabstände (1.25 für Überschriften) erzeugen dichte, autoritative Textblöcke
- Minimaler Eckenradius (1–2px) – scharfe, präzise Ecken durchgehend
- Grün umrahmte Schaltflächen (`2px solid #76b900`) als primäres Interaktionsmuster
- Font Awesome 6 Pro/Sharp Icon-System mit Stärke 900 für scharfe Ikonografie
- Multi-Framework-Architektur (PrimeReact, Fluent UI, Element Plus) für umfangreiche interaktive Komponenten

## 2. Farbpalette & Rollen

### Primäre Markenfarben
- **NVIDIA-Grün** (`#76b900`): Das Markenzeichen – Rahmen, Link-Unterstreichungen, CTA-Konturen, Aktivindikatoren. Nie als große Fläche verwendet.
- **Reines Schwarz** (`#000000`): Primärer Seitenhintergrund, Text auf hellen Flächen, dominanter Ton.
- **Reines Weiß** (`#ffffff`): Text auf dunklen Hintergründen, helle Abschnittshintergründe, Kartenoberflächen.

### Erweiterte Markenpalette
- **NVIDIA-Grün Hell** (`#bff230`): Leuchtender Limettenakzent für Hervorhebungen und Hover-Zustände.
- **Orange 400** (`#df6500`): Warmer Akzent für Hinweise, Featured-Badges oder energiebezogene Kontexte.
- **Gelb 300** (`#ef9100`): Sekundärer warmer Akzent, Produktkategorie-Hervorhebungen.
- **Gelb 050** (`#feeeb2`): Helle, warme Fläche für Callout-Hintergründe.

### Status & Semantik
- **Rot 500** (`#e52020`): Fehlerzustände, destruktive Aktionen, kritische Warnungen.
- **Rot 800** (`#650b0b`): Tiefes Rot für schwerwiegende Warn-Hintergründe.
- **Grün 500** (`#3f8500`): Erfolgszustände, positive Indikatoren (dunkler als das Markengrün).
- **Blau 700** (`#0046a4`): Informative Akzente, alternative Link-Hover-Farbe.

### Dekorativ
- **Lila 800** (`#4d1368`): Tiefes Lila für Verlaufsenden, Premium-/KI-Kontexte.
- **Lila 100** (`#f9d4ff`): Heller lila Flächenton.
- **Fuchsia 700** (`#8c1c55`): Satter Akzent für besondere Aktionen oder hervorgehobene Inhalte.

### Neutrale Skala
- **Grau 300** (`#a7a7a7`): Gedämpfter Text, deaktivierte Beschriftungen.
- **Grau 400** (`#898989`): Sekundärtext, Metadaten.
- **Grau 500** (`#757575`): Tertiärtext, Platzhalter, Fußzeilen.
- **Grau Rahmen** (`#5e5e5e`): Dezente Rahmen, Trennlinien.
- **Fast Schwarz** (`#1a1a1a`): Dunkle Flächen, Kartenhintergründe auf schwarzen Seiten.

### Interaktionszustände
- **Link Standard (dunkler Hintergrund)** (`#ffffff`): Weiße Links auf dunklen Hintergründen.
- **Link Standard (heller Hintergrund)** (`#000000`): Schwarze Links mit grüner Unterstreichung auf hellen Hintergründen.
- **Link Hover** (`#3860be`): Blauverschiebung beim Hover für alle Link-Varianten.
- **Button Hover** (`#1eaedb`): Türkis-Hervorhebung für Button-Hover-Zustände.
- **Button Aktiv** (`#007fff`): Leuchtendes Blau für aktive/gedrückte Button-Zustände.
- **Fokusring** (`#000000 solid 2px`): Schwarzer Rahmen für Tastaturfokus.

### Schatten & Tiefe
- **Karten-Schatten** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Dezenter Umgebungsschatten für erhöhte Karten.

## 3. Typografie-Regeln

### Schriftfamilie
- **Primär**: `NVIDIA-EMEA`, mit Fallbacks: `Arial, Helvetica, sans-serif`
- **Icon-Schrift**: `Font Awesome 6 Pro` (Stärke 900 für solide Icons, 700 für reguläre)
- **Icon Sharp**: `Font Awesome 6 Sharp` (Stärke 300 für helle Icons, 400 für reguläre)

### Hierarchie

| Rolle | Schrift | Größe | Stärke | Zeilenhöhe | Zeichenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (eng) | normal | Überschriften mit maximaler Wirkung |
| Abschnittsüberschrift | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (eng) | normal | Abschnittstitel, Kartenüberschriften |
| Unterüberschrift | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (entspannt) | normal | Feature-Beschreibungen, Untertitel |
| Kartentitel | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (eng) | normal | Karten- und Modulüberschriften |
| Fließtext Groß | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (entspannt) | normal | Betonter Fließtext, Einleitungsabsätze |
| Fließtext | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Standardlesetext |
| Fließtext Fett | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Starke Beschriftungen, Navigationselemente |
| Fließtext Klein | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (entspannt) | normal | Sekundäre Inhalte, Beschreibungen |
| Fließtext Klein Fett | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Betonte sekundäre Inhalte |
| Button Groß | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (eng) | normal | Primäre CTA-Schaltflächen |
| Button | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (eng) | normal | Standardschaltflächen |
| Button Kompakt | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (eng) | 0.144px | Kleine/kompakte Schaltflächen |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Navigationslinks |
| Link Großschrift | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, Navigationsbeschriftungen |
| Bildunterschrift | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadaten, Zeitstempel |
| Bildunterschrift Klein | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (eng) | normal | Kleingedrucktes, rechtliche Hinweise |
| Mikro-Beschriftung | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, winzige Badges |
| Mikro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (eng) | normal | Kleinster UI-Text |

### Prinzipien
- **Fett als Standardstimme**: NVIDIA setzt stark auf Stärke 700 für Überschriften, Schaltflächen, Links und Beschriftungen. Stärke 400 ist dem Fließtext und Beschreibungen vorbehalten – alles andere ist fett und strahlt Selbstvertrauen und Autorität aus.
- **Enge Überschriften, entspannter Fließtext**: Der Zeilenabstand für Überschriften ist durchgehend 1.25 (eng), während Fließtext auf 1.50–1.67 entspannt. Dieser Kontrast erzeugt visuelle Dichte am Anfang von Inhaltsblöcken und angenehme Lesbarkeit in Absätzen.
- **Großschrift für Navigation**: Link-Beschriftungen verwenden `text-transform: uppercase` mit Stärke 700 und schaffen so eine Navigationsstimme, die wie Hardware-Spezifikationsbeschriftungen wirkt.
- **Kein dekorativer Zeichenabstand**: Der Zeichenabstand ist durchgehend normal, außer bei kompakten Schaltflächen (0.144px). Die Schrift selbst trägt den industriellen Charakter, ohne Manipulation.

## 4. Komponenten-Stile

### Schaltflächen

**Primär (grüner Rahmen)**
- Hintergrund: `transparent`
- Text: `#000000`
- Innenabstand: 11px 13px
- Rahmen: `2px solid #76b900`
- Radius: 2px
- Schrift: 16px Stärke 700
- Hover: Hintergrund `#1eaedb`, Text `#ffffff`
- Aktiv: Hintergrund `#007fff`, Text `#ffffff`, Rahmen `1px solid #003eff`, scale(1)
- Fokus: Hintergrund `#1eaedb`, Text `#ffffff`, Kontur `#000000 solid 2px`, Deckkraft 0.9
- Verwendung: Primäre CTA („Mehr erfahren", „Lösungen entdecken")

**Sekundär (dünner grüner Rahmen)**
- Hintergrund: transparent
- Rahmen: `1px solid #76b900`
- Radius: 2px
- Verwendung: Sekundäre Aktionen, alternative CTAs

**Kompakt / Inline**
- Schrift: 14.4px Stärke 700
- Zeichenabstand: 0.144px
- Zeilenhöhe: 1.00
- Verwendung: Inline-CTAs, kompakte Navigation

### Karten & Container
- Hintergrund: `#ffffff` (hell) oder `#1a1a1a` (dunkle Abschnitte)
- Rahmen: keiner (saubere Kanten) oder `1px solid #5e5e5e`
- Radius: 2px
- Schatten: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` für erhöhte Karten
- Hover: Schatten verstärkt sich
- Innenabstand: 16–24px intern

### Links
- **Auf dunklem Hintergrund**: `#ffffff`, keine Unterstreichung, Hover wechselt zu `#3860be`
- **Auf hellem Hintergrund**: `#000000` oder `#1a1a1a`, Unterstreichung `2px solid #76b900`, Hover wechselt zu `#3860be`, Unterstreichung entfernt
- **Grüne Links**: `#76b900`, Hover wechselt zu `#3860be`
- **Gedämpfte Links**: `#666666`, Hover wechselt zu `#3860be`

### Navigation
- Dunkler schwarzer Hintergrund (`#000000`)
- Logo linksbündig, markantes NVIDIA-Wortmarke
- Links: NVIDIA-EMEA 14px Stärke 700 Großschrift, `#ffffff`
- Hover: Farbwechsel, keine Änderung der Unterstreichung
- Mega-Menü-Dropdowns für Produktkategorien
- Beim Scrollen fixiert mit Hintergrundüberlagerung

### Bildbehandlung
- Produkt-/GPU-Renderings als Hero-Bilder, oft volle Breite
- Screenshot-Bilder mit dezenten Schatten für Tiefenwirkung
- Grüne Verlaufsüberlagerungen auf dunklen Hero-Abschnitten
- Kreisförmige Avatar-Container mit 50% Radius

### Besondere Komponenten

**Produktkarten**
- Saubere weiße oder dunkle Karte mit minimalem Radius (2px)
- Grüner Akzentrahmen oder -unterstreichung am Titel
- Muster: fette Überschrift + leichtere Beschreibung
- CTA mit grünem Rahmen am unteren Rand

**Technische Spezifikationstabellen**
- Industrielle Rasterlayouts
- Abwechselnde Zeilenhintergründe (dezente Grauabstufung)
- Fette Beschriftungen, reguläre Werte
- Grüne Hervorhebungen für Schlüsselkennzahlen

**Cookie-/Einwilligungsbanner**
- Feste Positionierung unten
- Abgerundete Schaltflächen (2px Radius)
- Graue Rahmenbehandlungen

## 5. Layout-Prinzipien

### Abstands-System
- Basiseinheit: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Primäre Innenabstandswerte: 8px, 11px, 13px, 16px, 24px, 32px
- Abschnittsabstand: 48–80px vertikaler Innenabstand

### Raster & Container
- Maximale Inhaltsbreite: ca. 1200px (begrenzt)
- Vollbreite Hero-Abschnitte mit begrenztem Text
- Feature-Abschnitte: 2–3-Spalten-Raster für Produktkarten
- Einspaltig für Artikel-/Blog-Inhalte
- Sidebar-Layouts für Dokumentation

### Weißraum-Philosophie
- **Zweckmäßige Dichte**: NVIDIA verwendet engere Abstände als typische SaaS-Sites, was die Dichte technischer Inhalte widerspiegelt. Weißraum dient dazu, Konzepte zu trennen, nicht um luxuriöse Leere zu erzeugen.
- **Abschnittsrhythmus**: Dunkle Abschnitte wechseln sich mit weißen ab und nutzen die Hintergrundfarbe (nicht nur Abstände) zur Trennung von Inhaltsblöcken.
- **Kartendichte**: Produktkarten liegen mit 16–20px Abstand nah beieinander und erzeugen eher ein Katalog- als ein Galerie-Gefühl.

### Eckenradius-Skala
- Mikro (1px): Inline-Spans, winzige Elemente
- Standard (2px): Schaltflächen, Karten, Container, Eingabefelder – der Standard für nahezu alles
- Kreis (50%): Avatar-Bilder, kreisförmige Tab-Indikatoren

## 6. Tiefe & Erhöhung

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten | Seitenhintergründe, Inline-Text |
| Dezent (Ebene 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Standardkarten, Modals |
| Rahmen (Ebene 1b) | `1px solid #5e5e5e` | Inhalts-Trennlinien, Abschnittsrahmen |
| Grüner Akzent (Ebene 2) | `2px solid #76b900` | Aktive Elemente, CTAs, ausgewählte Elemente |
| Fokus (Barrierefreiheit) | `2px solid #000000` Kontur | Tastaturfokusring |

**Schatten-Philosophie**: NVIDIAs Tiefensystem ist minimal und funktional. Es gibt im Wesentlichen einen einzigen Schattenwert – eine 5px Umgebungsunschärfe bei 30% Deckkraft – der sparsam für Karten und Modals eingesetzt wird. Das primäre Tiefensignal ist nicht der Schatten, sondern der _Farbkontrast_: schwarze Hintergründe neben weißen Abschnitten, grüne Rahmen auf schwarzen Flächen. Dies erzeugt eine hardwareartige visuelle Schichtung, bei der Tiefe durch Materialunterschied entsteht, nicht durch simuliertes Licht.

### Dekorative Tiefe
- Grüne Verlaufswaschen hinter Hero-Inhalten
- Dunkel-zu-Dunkler-Verläufe (Schwarz zu Fast-Schwarz) für Abschnittsübergänge
- Kein Glassmorphismus oder Unschärfe-Effekte – Klarheit vor Atmosphäre

## 7. Responsives Verhalten

### Haltepunkte
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil Klein | <375px | Kompakte Einspalte, reduzierte Innenabstände |
| Mobil | 375–425px | Standard-Mobilansicht |
| Mobil Groß | 425–600px | Breiteres Mobil, erste 2-Spalten-Hinweise |
| Tablet Klein | 600–768px | 2-Spalten-Raster beginnen |
| Tablet | 768–1024px | Volle Kartenraster, erweiterte Navigation |
| Desktop | 1024–1350px | Standard-Desktop-Layout |
| Großer Desktop | >1350px | Maximale Inhaltsbreite, großzügige Ränder |

### Touch-Ziele
- Schaltflächen verwenden 11px 13px Innenabstand für komfortable Touch-Ziele
- Navigationslinks bei 14px Großschrift mit ausreichendem Abstand
- Grün umrahmte Schaltflächen bieten kontrastreiche Touch-Ziele auf dunklen Hintergründen
- Mobil: Hamburger-Menü-Kollaps mit Vollbild-Überlagerung

### Kollaps-Strategie
- Hero: 36px Überschrift skaliert proportional nach unten
- Navigation: Volle horizontale Navigation kollabiert bei ~1024px zum Hamburger-Menü
- Produktkarten: 3-spaltig → 2-spaltig → einspaltig gestapelt
- Fußzeile: Mehrspaltenraster kollabiert zur gestapelten Einspalte
- Abschnittsabstand: 64–80px reduziert auf 32–48px auf Mobilgeräten
- Bilder: Seitenverhältnis beibehalten, auf Containerbreite skalieren

### Bildverhalten
- GPU-/Produktrenderings behalten bei allen Größen hohe Auflösung
- Hero-Bilder skalieren proportional mit dem Viewport
- Kartenbilder verwenden einheitliche Seitenverhältnisse
- Vollflächige dunkle Abschnitte behalten die randlose Behandlung bei

## 8. Responsives Verhalten (Erweitert)

### Typografie-Skalierung
- Display 36px skaliert auf Mobilgeräten auf ~24px
- Abschnittsüberschriften 24px skalieren auf Mobilgeräten auf ~20px
- Fließtext bleibt bei 15–16px über alle Haltepunkte
- Schaltflächentext bleibt bei 16px für einheitliche Touch-Ziele

### Dunkel-/Hell-Abschnitt-Strategie
- Dunkle Abschnitte (schwarzer Hintergrund, weißer Text) wechseln sich mit hellen Abschnitten ab (weißer Hintergrund, schwarzer Text)
- Der grüne Akzent bleibt auf beiden Flächentypen konsistent
- Auf dunkel: Links sind weiß, Unterstreichungen sind grün
- Auf hell: Links sind schwarz, Unterstreichungen sind grün
- Diese Abwechslung schafft einen natürlichen Scroll-Rhythmus und eine inhaltliche Gruppierung

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primärer Akzent: NVIDIA-Grün (`#76b900`)
- Dunkler Hintergrund: Reines Schwarz (`#000000`)
- Heller Hintergrund: Reines Weiß (`#ffffff`)
- Überschriftentext (dunkler Hintergrund): Weiß (`#ffffff`)
- Überschriftentext (heller Hintergrund): Schwarz (`#000000`)
- Fließtext (heller Hintergrund): Schwarz (`#000000`) oder Fast Schwarz (`#1a1a1a`)
- Fließtext (dunkler Hintergrund): Weiß (`#ffffff`) oder Grau 300 (`#a7a7a7`)
- Link Hover: Blau (`#3860be`)
- Rahmenakzent: `2px solid #76b900`
- Button Hover: Türkis (`#1eaedb`)

### Beispiel-Komponenten-Prompts
- „Erstelle einen Hero-Abschnitt auf schwarzem Hintergrund. Überschrift bei 36px NVIDIA-EMEA Stärke 700, Zeilenhöhe 1.25, Farbe #ffffff. Untertitel bei 18px Stärke 400, Zeilenhöhe 1.67, Farbe #a7a7a7. CTA-Schaltfläche mit transparentem Hintergrund, 2px solid #76b900 Rahmen, 2px Radius, 11px 13px Innenabstand, Text #ffffff. Hover: Hintergrund #1eaedb, Text weiß."
- „Gestalte eine Produktkarte: weißer Hintergrund, 2px Eckenradius, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Titel bei 20px NVIDIA-EMEA Stärke 700, Zeilenhöhe 1.25, Farbe #000000. Fließtext bei 15px Stärke 400, Zeilenhöhe 1.67, Farbe #757575. Grüner Unterstreichungsakzent am Titel: border-bottom 2px solid #76b900."
- „Baue eine Navigationsleiste: #000000 Hintergrund, oben fixiert. NVIDIA-Logo linksbündig. Links bei 14px NVIDIA-EMEA Stärke 700 Großschrift, Farbe #ffffff. Hover: Farbe #3860be. Grün umrahmte CTA-Schaltfläche rechtsbündig."
- „Erstelle einen dunklen Feature-Abschnitt: #000000 Hintergrund. Abschnittsbezeichnung bei 14px Stärke 700 Großschrift, Farbe #76b900. Überschrift bei 24px Stärke 700, Farbe #ffffff. Beschreibung bei 16px Stärke 400, Farbe #a7a7a7. Drei Produktkarten in einer Reihe mit 20px Abstand."
- „Gestalte eine Fußzeile: #000000 Hintergrund. Mehrspaltiges Layout mit Link-Gruppen. Links bei 14px Stärke 400, Farbe #a7a7a7. Hover: Farbe #76b900. Untere Leiste mit rechtlichem Text bei 12px, Farbe #757575."

### Iterations-Leitfaden
1. Immer `#76b900` als Akzent verwenden, nie als Hintergrundfläche – es ist eine Signalfarbe für Rahmen, Unterstreichungen und Hervorhebungen
2. Schaltflächen sind standardmäßig transparent mit grünem Rahmen – gefüllte Hintergründe erscheinen nur bei Hover-/Aktiv-Zuständen
3. Stärke 700 ist die dominierende Stimme für alle interaktiven und Überschriften-Elemente; 400 ist nur für Fließtextabsätze
4. Eckenradius ist für alles 2px – diese scharfe, minimale Rundung ist zentral für die industrielle Ästhetik
5. Dunkle Abschnitte verwenden weißen Text; helle Abschnitte verwenden schwarzen Text – grüner Akzent funktioniert auf beiden identisch
6. Link Hover ist immer `#3860be` (blau), unabhängig von der Standardfarbe des Links
7. Zeilenhöhe 1.25 für Überschriften, 1.50–1.67 für Fließtext – diesen Kontrast für visuelle Hierarchie beibehalten
8. Navigation verwendet Großschrift 14px fett – diese Hardware-Beschriftungs-Typografie ist Teil der Markenstimme
