# Von Pinterest inspiriertes Designsystem

> Category: Medien & Konsumenten
> Visuelle Entdeckung. Roter Akzent, Masonry-Grid, Bild-zuerst.

## 1. Visuelles Thema & Atmosphäre

Pinterests Website ist eine warme, inspirationsgetriebene Leinwand, die visuelle Entdeckung wie ein Lifestyle-Magazin behandelt. Das Design basiert auf einem weichen, leicht warmen weißen Hintergrund mit Pinterest-Rot (`#e60023`) als einzigem, kräftigem Markenakzent. Im Gegensatz zu den kühlen Blautönen der meisten Tech-Plattformen hat Pinterests Neutralskala einen deutlich warmen Unterton — Grautöne neigen eher zu Oliv/Sand (`#91918c`, `#62625b`, `#e5e5e0`) als zu kühlem Stahl, was eine gemütliche, handwerkliche Atmosphäre erzeugt, die zum Stöbern einlädt.

Die Typografie verwendet Pin Sans — eine benutzerdefinierte proprietäre Schrift mit einem breiten Fallback-Stack einschließlich japanischer Schriften, was Pinterests globale Reichweite widerspiegelt. Im Display-Maßstab (70px, Stärke 600) erzeugt Pin Sans große, einladende Überschriften. Bei kleineren Größen ist das System kompakt: Schaltflächen bei 12px, Bildunterschriften bei 12–14px. Das CSS-Variablenbenennungssystem (`--comp-*`, `--sema-*`, `--base-*`) offenbart eine ausgefeilte dreistufige Design-Token-Architektur: Komponenten-, Semantik- und Basistoken.

Was Pinterest auszeichnet, ist sein großzügiges Rahmenradius-System (12px–40px, plus 50% für Kreise) und warme, getönte Schaltflächenhintergründe. Der Sekundärknopf (`#e5e5e0`) hat einen deutlich warmen, sandähnlichen Ton statt kaltem Grau. Der primäre rote Knopf verwendet 16px Radius — gerundet, aber nicht pillenförmig. Kombiniert mit warmen Badge-Hintergründen (`hsla(60,20%,98%,.5)` — ein subtiler gelb-warmer Wash) und fotografiedominierten Layouts entsteht ein Design, das handgefertigt und persönlich wirkt, nicht korporativ und steril.

**Wesentliche Merkmale:**
- Warme weiße Leinwand mit Oliv/Sand-getönten Neutralfarben — gemütlich, nicht klinisch
- Pinterest-Rot (`#e60023`) als einziger kräftiger Akzent — niemals subtil, immer selbstbewusst
- Pin-Sans-Schrift mit globalem Fallback-Stack (einschließlich CJK)
- Dreistufige Token-Architektur: `--comp-*` / `--sema-*` / `--base-*`
- Warme Sekundäroberflächen: Sandgrau (`#e5e5e0`), warmes Badge (`hsla(60,20%,98%,.5)`)
- Großzügiger Rahmenradius: 16px Standard, bis zu 40px für große Container
- Fotografie-zuerst-Inhalt — Pins/Bilder sind das primäre visuelle Element
- Dunkler Nah-Lila-Text (`#211922`) — warm, mit einem Hauch von Pflaume

## 2. Farbpalette & Rollen

### Primäre Marke
- **Pinterest-Rot** (`#e60023`): Primäres CTA, Markenakzent — kräftiges, selbstbewusstes Rot
- **Grün 700** (`#103c25`): `--base-color-green-700`, Erfolgs-/Naturakzent
- **Grün 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, gedrücktes Grün

### Text
- **Pflaumenschwarz** (`#211922`): Primärtext — warmes Nahschwarz mit Pflaumenunterton
- **Schwarz** (`#000000`): Sekundärtext, Schaltflächentext
- **Olivgrau** (`#62625b`): Sekundärbeschreibungen, gedämpfter Text
- **Warmsilber** (`#91918c`): `--comp-button-color-text-transparent-disabled`, deaktivierter Text, Eingaberahmen
- **Weiß** (`#ffffff`): Text auf dunklen/farbigen Oberflächen

### Interaktiv
- **Fokusblau** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, Fokusringe
- **Leistungslila** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, Leistungsmerkmale
- **Empfehlungslila** (`#7e238b`): `--sema-color-hover-text-recommendation`, KI-Empfehlung
- **Linkblau** (`#2b48d4`): Linktextfarbe
- **Facebook-Blau** (`#0866ff`): `--facebook-background-color`, Soziales Login
- **Gedrücktes Blau** (`#617bff`): `--base-color-pressed-blue-200`, gedrückter Zustand

### Oberfläche & Rahmen
- **Sandgrau** (`#e5e5e0`): Sekundärer Schaltflächenhintergrund — warm, handwerklich
- **Warmes Licht** (`#e0e0d9`): Kreisschaltflächenhintergründe, Badges
- **Warmer Wash** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, subtiler warmer Badge-Hintergrund
- **Nebel** (`#f6f6f3`): Helle Oberfläche (50% Deckkraft)
- **Rahmen deaktiviert** (`#c8c8c1`): `--sema-color-border-disabled`, deaktivierte Rahmen
- **Hover-Grau** (`#bcbcb3`): `--base-color-hover-grayscale-150`, Hover-Rahmen
- **Dunkle Oberfläche** (`#33332e`): Hintergründe dunkler Abschnitte

### Semantisch
- **Fehlerrot** (`#9e0a0a`): Kontrollkästchen/Formularfehlerzustände

## 3. Typografieregeln

### Schriftfamilie
- **Primär**: `Pin Sans`, Fallbacks: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hierarchie

| Rolle | Schrift | Größe | Stärke | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display-Hero | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Maximaler Eindruck |
| Abschnittsüberschrift | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Negativer Tracking |
| Fließtext | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Standardlesen |
| Bildunterschrift Fett | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Starke Metadaten |
| Bildunterschrift | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Kleiner Text, Tags |
| Schaltfläche | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Schaltflächenbeschriftungen |

### Grundsätze
- **Kompakter Typmaßstab**: Der Bereich ist 12px–70px mit einem dramatischen Sprung — der meiste Funktionstext liegt bei 12–16px und schafft eine dichte, app-ähnliche Informationshierarchie.
- **Warme Gewichtsverteilung**: 600–700 für Überschriften, 400–500 für Fließtext. Keine ultraleichten Gewichte — die Schrift fühlt sich immer substanziell an.
- **Negativer Tracking bei Überschriften**: -1,2px bei 28px-Überschriften erzeugt gemütliche, intime Abschnittstitel.
- **Einzelne Schriftfamilie**: Pin Sans übernimmt alles — keine Sekundär-Display- oder Monospace-Schrift erkannt.

## 4. Komponentenstile

### Schaltflächen

**Primäres Rot**
- Hintergrund: `#e60023` (Pinterest-Rot)
- Text: `#000000` (Schwarz — ungewöhnliche Wahl für den Kontrast auf Rot)
- Innenabstand: 6px 14px
- Radius: 16px (großzügig gerundet, nicht pillenförmig)
- Rahmen: `2px solid rgba(255, 255, 255, 0)` (transparent)
- Fokus: semantischer Rahmen + Umriss über CSS-Variablen

**Sekundäres Sand**
- Hintergrund: `#e5e5e0` (warmes Sandgrau)
- Text: `#000000`
- Innenabstand: 6px 14px
- Radius: 16px
- Fokus: dasselbe semantische Rahmensystem

**Kreisförmige Aktion**
- Hintergrund: `#e0e0d9` (warmes Licht)
- Text: `#211922` (Pflaumenschwarz)
- Radius: 50% (Kreis)
- Verwendung: Pin-Aktionen, Navigationssteuerelemente

**Ghost / Transparent**
- Hintergrund: transparent
- Text: `#000000`
- Kein Rahmen
- Verwendung: Tertiäre Aktionen

### Karten & Container
- Fotografiezuerst-Pin-Karten mit großzügigem Radius (12px–20px)
- Kein traditioneller Box-Schatten auf den meisten Karten
- Weiße oder warme Nebelfarbe als Hintergrund
- 8px weißer dicker Rahmen auf einigen Bild-Containern

### Eingabefelder
- E-Mail-Eingabe: weißer Hintergrund, `1px solid #91918c` Rahmen, 16px Radius, 11px 15px Innenabstand
- Fokus: semantisches Rahmen- + Umrisssystem über CSS-Variablen

### Navigation
- Sauberer Header auf weißem oder warmem Hintergrund
- Pinterest-Logo + Suchleiste zentriert
- Pin Sans 16px für Navigationslinks
- Pinterest-Rot als Akzent für aktive Zustände

### Bildbehandlung
- Pin-artiges Masonry-Grid (charakteristisches Pinterest-Layout)
- Abgerundete Ecken: 12px–20px auf Bildern
- Fotografie als primärer Inhalt — jeder Pin ist ein Bild
- Dicke weiße Rahmen (8px) auf hervorgehobenen Bild-Containern

## 5. Layoutgrundsätze

### Abstandssystem
- Basiseinheit: 8px
- Skala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Große Sprünge: 32px → 80px → 100px für Abschnittsabstände

### Raster & Container
- Masonry-Grid für Pin-Inhalte (charakteristisches Layout)
- Zentrierte Inhaltsabschnitte mit großzügiger Maximalbreite
- Vollbreiter dunkler Footer
- Suchleiste als primäres Navigationselement

### Weißraum-Philosophie
- **Inspirationsdichte**: Das Masonry-Grid packt Pins eng — die Inhaltsdichte IST das Wertversprechen. Weißraum existiert zwischen Abschnitten, nicht innerhalb des Grids.
- **Oben atmen, unten dicht**: Hero-/Feature-Abschnitte erhalten großzügige Abstände; das Pin-Grid ist kompakt und immersiv.

### Rahmenradiusskala
- Standard (12px): Kleine Karten, Links
- Schaltfläche (16px): Schaltflächen, Eingaben, mittlere Karten
- Komfortabel (20px): Feature-Karten
- Groß (28px): Große Container
- Abschnitt (32px): Tab-Elemente, große Panels
- Hero (40px): Hero-Container, große Feature-Blöcke
- Kreis (50%): Aktionsschaltflächen, Tab-Indikatoren

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach (Ebene 0) | Kein Schatten | Standard — Pins setzen auf Inhalt, nicht auf Schatten |
| Subtil (Ebene 1) | Minimaler Schatten (aus Tokens) | Erhöhte Overlays, Dropdowns |
| Fokus (Barrierefreiheit) | `--sema-color-border-focus-outer-default` Ring | Fokuszustände |

**Schattenphilosophie**: Pinterest verwendet minimale Schatten. Das Masonry-Grid setzt auf Inhalt (Fotografie), um visuelles Interesse zu erzeugen, statt auf Elevationseffekte. Tiefe entsteht durch die Wärme der Oberflächenfarben und die großzügige Rundung der Container.

## 7. Gebote und Verbote

### Gebot
- Warme Neutralfarben verwenden (`#e5e5e0`, `#e0e0d9`, `#91918c`) — der warme Oliv/Sand-Ton ist die Identität
- Pinterest-Rot (`#e60023`) nur für primäre CTAs verwenden — es ist kräftig und einzigartig
- Pin Sans ausschließlich verwenden — eine Schrift für alles
- Großzügigen Rahmenradius anwenden: 16px für Schaltflächen/Eingaben, 20px+ für Karten
- Das Masonry-Grid dicht halten — Inhaltsdichte ist der Wert
- Warme Badge-Hintergründe (`hsla(60,20%,98%,.5)`) für subtile warme Washes verwenden
- `#211922` (Pflaumenschwarz) für Primärtext verwenden — wärmer als reines Schwarz

### Verbot
- Keine kühlen Grauneutralen verwenden — immer warm/olivfarben
- Kein reines Schwarz (`#000000`) als Primärtext — Pflaumenschwarz (`#211922`) verwenden
- Keine pillenförmigen Schaltflächen — 16px Radius ist gerundet, aber nicht pillenförmig
- Keine schweren Schatten hinzufügen — Pinterest ist flach by Design, Tiefe kommt aus dem Inhalt
- Keinen kleinen Rahmenradius (<12px) auf Karten — die großzügige Rundung ist essenziell
- Keine zusätzlichen Markenfarben einführen — Rot + warme Neutralfarben ist die vollständige Palette
- Keine dünnen Schriftstärken verwenden — Pin Sans mindestens 400

## 8. Responsives Verhalten

### Haltepunkte
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil | <576px | Einzelne Spalte, kompaktes Layout |
| Mobil Groß | 576–768px | 2-spaltiges Pin-Grid |
| Tablet | 768–890px | Erweitertes Grid |
| Desktop Klein | 890–1312px | Standard-Masonry-Grid |
| Desktop | 1312–1440px | Vollständiges Layout |
| Großer Desktop | 1440–1680px | Erweiterte Grid-Spalten |
| Ultrabreit | >1680px | Maximale Grid-Dichte |

### Reduktionsstrategie
- Pin-Grid: 5+ Spalten → 3 → 2 → 1
- Navigation: Suchleiste + Icons → vereinfachte mobile Navigation
- Feature-Abschnitte: nebeneinander → gestapelt
- Hero: 70px → skaliert proportional herunter
- Footer: dunkle Mehrspalten → gestapelt

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Marke: Pinterest-Rot (`#e60023`)
- Hintergrund: Weiß (`#ffffff`)
- Text: Pflaumenschwarz (`#211922`)
- Sekundärtext: Olivgrau (`#62625b`)
- Schaltflächenoberfläche: Sandgrau (`#e5e5e0`)
- Rahmen: Warmsilber (`#91918c`)
- Fokus: Fokusblau (`#435ee5`)

### Beispiel-Komponentenprompts
- „Hero erstellen: weißer Hintergrund. Überschrift bei 70px Pin Sans Stärke 600, Pflaumenschwarz (#211922). Roter CTA-Knopf (#e60023, 16px Radius, 6px 14px Innenabstand). Sekundärer Sandknopf (#e5e5e0, 16px Radius)."
- „Pin-Karte gestalten: weißer Hintergrund, 16px Radius, kein Schatten. Fotografie füllt oben, 16px Pin Sans Stärke 400 Beschreibung unten in #62625b."
- „Kreisförmige Aktionsschaltfläche erstellen: #e0e0d9 Hintergrund, 50% Radius, #211922 Symbol."
- „Eingabefeld erstellen: weißer Hintergrund, 1px solid #91918c, 16px Radius, 11px 15px Innenabstand. Fokus: blauer Umriss über semantische Tokens."
- „Dunklen Footer gestalten: #33332e Hintergrund. Pinterest-Schriftlogo in Weiß. 12px Pin-Sans-Links in #91918c."

### Iterationsleitfaden
1. Warme Neutralfarben überall — Oliv/Sandgrau, niemals kühler Stahl
2. Pinterest-Rot nur für CTAs — kräftig und einzigartig
3. 16px Radius auf Schaltflächen/Eingaben, 20px+ auf Karten — großzügig, aber nicht pillenförmig
4. Pin Sans ist die einzige Schrift — kompakt bei 12px für die Benutzeroberfläche, 70px für Display
5. Fotografie trägt das Design — die Benutzeroberfläche bleibt warm und minimal
6. Pflaumenschwarz (#211922) für Text — wärmer als reines Schwarz
