# Designsystem inspiriert von Figma

> Category: Design & Kreativität
> Kollaboratives Designwerkzeug. Lebhaft mehrfarbig, verspielt und dennoch professionell.

## 1. Visuelles Thema & Atmosphäre

Figmas Oberfläche ist das Designwerkzeug, das sich selbst gestaltet hat — ein Meisterwerk typografischer Raffinesse, bei dem eine maßgeschneiderte Variable-Font (figmaSans) zwischen hauchdünn (Gewicht 320) und fett (Gewicht 700) moduliert, mit Haltepunkten bei ungewöhnlichen Zwischenwerten (330, 340, 450, 480, 540), die die meisten Schriftsysteme niemals erkunden. Diese granulare Gewichtskontrolle verleiht jedem Textelement ein präzise kalibriertes visuelles Gewicht und schafft Hierarchie durch Mikro-Unterschiede statt durch das stumpfe Instrument von „Normal vs. Fett".

Die Seite präsentiert eine faszinierende Dualität: Das Interface-Chrome ist streng schwarz-weiß (buchstäblich nur `#000000` und `#ffffff` als Farben erkennbar), während der Hero-Bereich und die Produktpräsentationen mit lebhaften Mehrfarb-Verläufen explodieren — elektrisches Grün, leuchtendes Gelb, tiefes Lila, heißes Pink. Diese Trennung bedeutet, dass das Designsystem selbst farblos ist und die farbenfrohe Ausgabe des Produkts als Heldinneninhalt behandelt. Figmas Marketingseite ist im Wesentlichen eine weiße Galerienwand, auf der bunte Kunst ausgestellt wird.

Was Figma jenseits der Variable-Font besonders auszeichnet, ist seine Kreis-und-Pill-Geometrie. Schaltflächen verwenden einen Radius von 50px (Pill) oder 50% (perfekter Kreis für Icon-Schaltflächen) und erzeugen ein organisches, werkzeugpaletten-ähnliches Gefühl. Der gestrichelte Fokusindikator (`dashed 2px`) ist eine bewusste Designentscheidung, die an die Auswahlgriffe im Figma-Editor erinnert — die UI-Sprache der Website referenziert die UI-Sprache des Produkts.

**Wesentliche Merkmale:**
- Maßgeschneiderte Variable-Font (figmaSans) mit ungewöhnlichen Gewichtshaltepunkten: 320, 330, 340, 450, 480, 540, 700
- Streng schwarz-weißes Interface-Chrome — Farbe existiert nur in Produktinhalten
- figmaMono für großgeschriebene technische Beschriftungen mit weitem Buchstabenabstand
- Pill- (50px) und kreisförmige (50%) Schaltflächengeometrie
- Gestrichelte Fokusumrisse, die an Figmas Editor-Auswahlgriffe erinnern
- Lebhafte Mehrfarb-Hero-Verläufe (Grün, Gelb, Lila, Pink)
- OpenType-Funktion `"kern"` global aktiviert
- Negativer Buchstabenabstand durchgehend — sogar Fließtext bei -0.14px bis -0.26px

## 2. Farbpalette & Rollen

### Primär
- **Reines Schwarz** (`#000000`): Gesamter Text, alle soliden Schaltflächen, alle Rahmen. Die einzige „Farbe" des Interface.
- **Reines Weiß** (`#ffffff`): Alle Hintergründe, weiße Schaltflächen, Text auf dunklen Oberflächen. Die andere Hälfte des Binärsystems.

*Hinweis: Figmas Marketingsite verwendet NUR diese zwei Farben für ihre Interface-Schicht. Alle leuchtenden Farben erscheinen ausschließlich in Produkt-Screenshots, Hero-Verläufen und eingebettetem Inhalt.*

### Oberfläche & Hintergrund
- **Reines Weiß** (`#ffffff`): Primärer Seitenhintergrund und Kartenoberflächen.
- **Glas-Schwarz** (`rgba(0, 0, 0, 0.08)`): Subtile dunkle Überlagerung für sekundäre kreisförmige Schaltflächen und Glaseffekte.
- **Glas-Weiß** (`rgba(255, 255, 255, 0.16)`): Mattglas-Überlagerung für Schaltflächen auf dunklen/farbigen Oberflächen.

### Verlaufssystem
- **Hero-Verlauf**: Ein lebhafter Mehrfach-Verlauf mit elektrischem Grün, leuchtendem Gelb, tiefem Lila und heißem Pink. Dieser Verlauf ist die visuelle Signatur des Hero-Bereichs — er repräsentiert die kreativen Möglichkeiten des Werkzeugs.
- **Produkt-Bereich-Verläufe**: Einzelne Produktbereiche (Design, Dev-Modus, Prototyping) können in ihren Präsentationen eigene Farbthemen verwenden.

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `figmaSans`, mit Fallbacks: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Beschriftungen**: `figmaMono`, mit Fallbacks: `figmaMono Fallback, SF Mono, menlo`

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|-------|---------|-------|---------|------------|-------------------|----------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (eng) | -1.72px | Maximale Wirkung, extreme Laufweite |
| Abschnittsüberschrift | figmaSans | 64px (4rem) | 400 | 1.10 (eng) | -0.96px | Feature-Abschnittstitel |
| Unterüberschrift | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Betonter Abschnittstext |
| Unterüberschrift Hell | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Leichtgewichtiger Abschnittstext |
| Feature-Titel | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Fette Kartenüberschriften |
| Fließtext Groß | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px bis -0.14px | Beschreibungen, Einleitungen |
| Fließtext / Schaltfläche | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px bis normal | Standardfließtext, Navigation, Schaltflächen |
| Fließtext Hell | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px bis normal | Leichtgewichtiger Fließtext |
| Mono-Beschriftung | figmaMono | 18px (1.13rem) | 400 | 1.30 (eng) | 0.54px | Großgeschriebene Abschnittsbeschriftungen |
| Mono Klein | figmaMono | 12px (0.75rem) | 400 | 1.00 (eng) | 0.6px | Großgeschriebene winzige Tags |

### Grundsätze
- **Variable-Font-Präzision**: figmaSans verwendet Gewichte, die die meisten Systeme nie einsetzen — 320, 330, 340, 450, 480, 540. Dies schafft Hierarchie durch subtile Gewichtsunterschiede statt durch dramatische Sprünge. Der Unterschied zwischen 330 und 340 ist kaum wahrnehmbar, aber strukturell bedeutsam.
- **Hell als Basis**: Die meisten Fließtexte verwenden 320–340 (leichter als das typische 400 „Regular"), was ein ätherisches, luftiges Leseerlebnis schafft, das zur Design-Tool-Ästhetik passt.
- **Überall Kerning**: Jedes Textelement aktiviert die OpenType-Funktion `"kern"` — Kerning ist keine Option, es ist strukturell.
- **Negative Laufweite als Standard**: Auch Fließtext verwendet -0.1px bis -0.26px Buchstabenabstand, was durchgehend engen Text erzeugt. Display-Text komprimiert weiter auf -0.96px und -1.72px.
- **Mono für Struktur**: figmaMono in Großbuchstaben mit positivem Buchstabenabstand (0.54px–0.6px) erzeugt technische Wegweiser-Beschriftungen.

## 4. Komponentenstile

### Schaltflächen

**Schwarz Solid (Pill)**
- Hintergrund: Reines Schwarz (`#000000`)
- Text: Reines Weiß (`#ffffff`)
- Radius: Kreis (50%) für Icon-Schaltflächen
- Fokus: gestrichelte 2px-Umrandung
- Maximale Betonung

**Weiße Pill**
- Hintergrund: Reines Weiß (`#ffffff`)
- Text: Reines Schwarz (`#000000`)
- Innenabstand: 8px 18px 10px (asymmetrisch vertikal)
- Radius: Pill (50px)
- Fokus: gestrichelte 2px-Umrandung
- Standard-CTA auf dunklen/farbigen Oberflächen

**Glas Dunkel**
- Hintergrund: `rgba(0, 0, 0, 0.08)` (subtile dunkle Überlagerung)
- Text: Reines Schwarz
- Radius: Kreis (50%)
- Fokus: gestrichelte 2px-Umrandung
- Sekundäre Aktion auf hellen Oberflächen

**Glas Hell**
- Hintergrund: `rgba(255, 255, 255, 0.16)` (Mattglas)
- Text: Reines Weiß
- Radius: Kreis (50%)
- Fokus: gestrichelte 2px-Umrandung
- Sekundäre Aktion auf dunklen/farbigen Oberflächen

### Karten & Container
- Hintergrund: Reines Weiß
- Rahmen: keiner oder minimal
- Radius: 6px (kleine Container), 8px (Bilder, Karten, Dialoge)
- Schatten: subtile bis mittlere Höheneffekte
- Produkt-Screenshots als Karteninhalt

### Navigation
- Saubere horizontale Navigation auf Weiß
- Logo: Figma-Wortmarke in Schwarz
- Produkt-Tabs: pill-förmige (50px) Tab-Navigation
- Links: schwarzer Text, 1px Unterstreichungsdekoration
- CTA: schwarze Pill-Schaltfläche
- Hover: Textfarbe via CSS-Variable

### Besondere Komponenten

**Produkt-Tab-Leiste**
- Horizontal angeordnete pill-förmige Tabs (50px Radius)
- Jeder Tab repräsentiert einen Figma-Produktbereich (Design, Dev-Modus, Prototyping usw.)
- Aktiver Tab hervorgehoben

**Hero-Verlaufsbereich**
- Vollbreit-lebhafter Mehrfarb-Verlauf als Hintergrund
- Weißer Textüberzug mit 86px Display-Überschrift
- Produkt-Screenshots schwebend im Verlauf

**Gestrichelte Fokusindikatoren**
- Alle interaktiven Elemente verwenden `dashed 2px`-Umrandung beim Fokus
- Referenziert die Auswahlgriffe im Figma-Editor
- Eine Meta-Design-Entscheidung, die Website und Produkt verbindet

## 5. Layoutprinzipien

### Abstandssystem
- Basiseinheit: 8px
- Skala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Raster & Container
- Maximale Container-Breite: bis 1920px
- Hero: vollbreit mit zentriertem Inhalt
- Produktbereiche: abwechselnde Präsentationen
- Fußzeile: dunkler vollbreiter Bereich
- Responsiv von 559px bis 1920px

### Weißraumphilosophie
- **Galerieähnliche Rhythmik**: Großzügige Abstände lassen jeden Produktbereich als eigene Ausstellung atmen.
- **Farbige Bereiche als visueller Atemraum**: Der Verlaufs-Hero und die Produktpräsentationen bieten chromatische Erholung zwischen den monochromen Interface-Bereichen.

### Rahmenradius-Skala
- Minimal (2px): Kleine Link-Elemente
- Subtil (6px): Kleine Container, Trennlinien
- Komfortabel (8px): Karten, Bilder, Dialoge
- Pill (50px): Tab-Schaltflächen, CTAs
- Kreis (50%): Icon-Schaltflächen, kreisförmige Elemente

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|------------|------------|
| Flach (Ebene 0) | Kein Schatten | Seitenhintergrund, meiste Texte |
| Oberfläche (Ebene 1) | Weiße Karte auf Verlaufs-/Dunkelbereich | Karten, Produktpräsentationen |
| Erhöht (Ebene 2) | Subtiler Schatten | Schwebende Karten, Hover-Zustände |

**Schattenphilosophie**: Figma setzt Schatten sparsam ein. Die primären Tiefenmechanismen sind **Hintergrundkontrast** (weißer Inhalt auf farbigen/dunklen Bereichen) und die inhärente Dreidimensionalität der Produkt-Screenshots selbst.

## 7. Dos und Don'ts

### Tun
- figmaSans mit präzisen Variable-Font-Gewichten (320–540) verwenden — die granulare Gewichtskontrolle IST das Design
- Das Interface streng schwarz-weiß halten — Farbe kommt nur aus Produktinhalten
- Pill- (50px) und kreisförmige (50%) Geometrie für alle interaktiven Elemente verwenden
- Gestrichelte 2px-Fokusumrisse anwenden — das Signature-Barrierefreiheitsmuster
- Funktion `"kern"` bei allen Texten aktivieren
- figmaMono in Großbuchstaben mit positivem Buchstabenabstand für Beschriftungen verwenden
- Negativen Buchstabenabstand durchgehend anwenden (-0.1px bis -1.72px)

### Nicht tun
- Keine Interface-Farben hinzufügen — die monochrome Palette ist absolut
- Keine Standard-Schriftgewichte (400, 500, 600, 700) verwenden — die einzigartigen Haltepunkte der Variable-Font nutzen (320, 330, 340, 450, 480, 540)
- Keine scharfen Ecken bei Schaltflächen — nur Pill- und Kreisgeometrie
- Keine soliden Fokusumrisse — gestrichelt ist die Signature
- Das Fließtext-Schriftgewicht nicht über 450 erhöhen — die leichtgewichtige Ästhetik ist zentral
- Keinen positiven Buchstabenabstand bei Fließtext — er ist immer negativ

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wesentliche Änderungen |
|------|--------|------------------------|
| Kleines Mobilgerät | <560px | Kompaktes Layout, gestapelt |
| Tablet | 560–768px | Geringfügige Anpassungen |
| Kleiner Desktop | 768–960px | 2-Spalten-Layouts |
| Desktop | 960–1280px | Standardlayout |
| Großer Desktop | 1280–1440px | Erweitert |
| Ultra-breit | 1440–1920px | Maximale Breite |

### Zusammenklapps-Strategie
- Hero-Text: 86px → 64px → 48px
- Produkt-Tabs: horizontales Scrollen auf Mobilgeräten
- Feature-Bereiche: gestapelte Einspalte
- Fußzeile: Mehrspaltig → gestapelt

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Alles: „Reines Schwarz (#000000)" und „Reines Weiß (#ffffff)"
- Glas Dunkel: „rgba(0, 0, 0, 0.08)"
- Glas Hell: „rgba(255, 255, 255, 0.16)"

### Beispiel-Komponenten-Prompts
- „Erstelle einen Hero auf einem lebhaften Mehrfarb-Verlauf (Grün, Gelb, Lila, Pink). Überschrift bei 86px figmaSans Gewicht 400, Zeilenhöhe 1.0, Buchstabenabstand -1.72px. Weißer Text. Weiße Pill-CTA-Schaltfläche (50px Radius, 8px 18px Innenabstand)."
- „Gestalte eine Produkt-Tab-Leiste mit pill-förmigen Schaltflächen (50px Radius). Aktiv: Schwarzer Hintergrund, weißer Text. Inaktiv: transparent, schwarzer Text. figmaSans bei 20px Gewicht 480."
- „Erstelle eine Abschnittsbeschriftung: figmaMono 18px, Großbuchstaben, Buchstabenabstand 0.54px, schwarzer Text. Kern aktiviert."
- „Erstelle Fließtext bei 20px figmaSans Gewicht 330, Zeilenhöhe 1.40, Buchstabenabstand -0.14px. Reines Schwarz auf Weiß."

### Iterations-Leitfaden
1. Variable-Font-Gewichtshaltepunkte präzise verwenden: 320, 330, 340, 450, 480, 540, 700
2. Interface ist immer Schwarz + Weiß — niemals Farben zum Chrome hinzufügen
3. Gestrichelte Fokusumrisse, keine soliden
4. Buchstabenabstand ist bei Fließtext immer negativ, bei Mono-Beschriftungen immer positiv
5. Pill (50px) für Schaltflächen/Tabs, Kreis (50%) für Icon-Schaltflächen
