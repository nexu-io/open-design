# Von Duolingo inspiriertes Designsystem

> Category: Produktivität & SaaS
> Sprachlernplattform. Leuchtendes Eulengrün, wuchtige Schatten, spielerische Freude.

## 1. Visuelles Thema und Atmosphäre

Duolingo ist Gamification als visuelle Sprache. Die Oberfläche ist unverblümt leuchtend, mit **Eulengrün** (`#58cc02`) als Marken-Primärfarbe und einem wuchtigen 4px-Bodenschatten auf jedem interaktiven Element, das wie ein 3D-Button wirkt, der darauf wartet, gedrückt zu werden. Die Seite ist weiß (`#ffffff`) mit kräftigen 2–3px-Rändern in tiefem Grau (`#e5e5e5`), und das gesamte System liest sich wie eine iOS-App von 2015, die mit besserer Hierarchie neugeboren wurde.

Die Typografie verwendet **Feather Bold** (eine benutzerdefinierte gerundete Serifenlose) für das Chrome und **Mona Sans** (oder Inter) für den Fließtext. Displaygrößen sind groß und selbstbewusst – Duolingo flüstert nie. Überschriften tragen oft einen grünen Unterstrichstrich oder sitzen auf einer grünen Pille, und das Maskottchen Duo (eine grüne Eule) erscheint als aktiver Illustrationscharakter, nicht als statisches Logo.

Die Formensprache ist freundlich: 16–20px Radien auf Karten, 12px auf Buttons, 9999px auf Chips und Fortschrittsbalken. Das Ikonografie-System ist gefüllt, gerundet und farbcodiert nach Fähigkeit – jede Lernoberfläche hat eine sofort erkennbare Farbkombination.

**Hauptmerkmale:**
- Eulengrün (`#58cc02`) als dominante Markenfarbe, die auf über 30% der Oberfläche verwendet wird
- Wuchtiger 4px-Bodenschatten auf jedem Button (die „taktile Drück"-Affordanz)
- 2–3px Vollränder, niemals Haarlinien
- Feather Bold (gerundetes Display) + Mona Sans (Fließtext)
- Großer, selbstbewusster Text – Displaygrößen beginnen bei 48px und steigen
- Maskottchen als Charakter: Duo die Eule erscheint beim Onboarding, Fehlern, Streaks
- Streak-Orange (`#ff9600`) und Juwelen-Pink (`#ce82ff`) als sekundäre Markenfarben

## 2. Farbpalette & Rollen

### Primär
- **Eulengrün** (`#58cc02`): Marken-Primär, primärer CTA, richtige Antwort.
- **Eulengrün Tief** (`#58a700`): Gedrückt-/Schattenfarbe für grüne Buttons.
- **Eulengrün Hell** (`#89e219`): Hover, weiche Füllungen.
- **Eulengrün Blass** (`#dbf8c5`): Weiche Oberfläche, Erfolgsbanner.

### Sekundäre Akzente
- **Streak-Orange** (`#ff9600`): Streak-Zähler, Feuersymbol, Premium-Energie.
- **Streak-Orange Tief** (`#cc7a00`): Gedrücktes Orange.
- **Juwelen-Pink** (`#ce82ff`): Juwelenwährung, Super Duolingo.
- **Aal-Blau** (`#1cb0f6`): Hinweis-Button, Info-Link.
- **Kardinalrot** (`#ff4b4b`): Falsche Antwort, Leben verloren.
- **Bienengelb** (`#ffc800`): Pro-Abzeichen, Auszeichnung.

### Oberfläche
- **Schnee** (`#ffffff`): Primärer Hintergrund.
- **Aal** (`#f7f7f7`): Abschnittstrennung, sekundäre Oberfläche.
- **Schwan** (`#e5e5e5`): Deaktivierter Hintergrund, eingebetteter Block.
- **Wolf** (`#777777`): Dunkler Trenner, sekundärer Text.

### Tinte & Text
- **Aalschwarz** (`#3c3c3c`): Primärer Text.
- **Wolf** (`#777777`): Sekundärer Text, Bildunterschriften.
- **Hase** (`#afafaf`): Deaktiviert, Platzhalter.

### Rand
- **Schwan** (`#e5e5e5`): Standard-2px-Rand.
- **Hase** (`#afafaf`): Betonter Rand beim Hover.

## 3. Typografieregeln

### Schriftfamilie
- **Display / UI / Überschriften**: `Feather Bold`, Fallback: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Fließtext / Langtext**: `Mona Sans`, Fallback: `'Helvetica Neue', system-ui, sans-serif`
- **Code (selten, Schulen/Admin)**: `JetBrains Mono`, Fallback: `ui-monospace, Menlo, monospace`

### Hierarchie

| Rolle | Schrift | Größe | Stärke | Zeilenhöhe | Zeichenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Onboarding-Hero |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Seitentitel |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Abschnittsüberschrift |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Kartentitel, Lernzeile |
| Fließtext Groß | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Lernaufgabe, Anweisung |
| Fließtext | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Standardtext |
| Bildunterschrift | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | XP-Zähler, Metadaten |
| Button | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Standard-Button-Label |
| Streak | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Streak-Zahl, auf der Flamme |

### Prinzipien
- **800 ist Standard**: Feather Bold läuft bei Überschriften und Buttons mit 800. 700 wirkt in diesem System schwach.
- **Großer Text**: Überschriftengrößen sind 25–40% größer als bei typischen Produktmarken – Selbstvertrauen als Identität.
- **Gerundete Buchstabenformen**: Jede Glyphe hat weiche Abschlüsse; scharfe Serifen würden den Freundlichkeitsvertrag brechen.

## 4. Komponenten-Styling

### Buttons

**Primär (Eulengrün)**
- Hintergrund: `#58cc02`
- Text: `#ffffff`
- Padding: 14px 24px
- Radius: 16px
- Border-bottom: 4px solid `#58a700` (der wuchtige Schatten)
- Hover: Hintergrund `#89e219`
- Aktiv: translate-y 4px, border-bottom 0 (Button „drückt")
- Verwendung: „Weiter", „Prüfen", Haupt-CTA.

**Sekundär (Weiß mit Bodenschatten)**
- Hintergrund: `#ffffff`
- Text: `#777777`
- Rand: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Padding: 14px 24px
- Hover: Text `#3c3c3c`, Rand `#afafaf`

**Streak-Orange**
- Hintergrund: `#ff9600`
- Text: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Verwendung: Streak-Ziel, „Streak starten"

**Fehler (Kardinalrot)**
- Hintergrund: `#ff4b4b`
- Text: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Verwendung: Feedback bei falscher Antwort.

### Karten / Lernkacheln
- Hintergrund: `#ffffff`
- Rand: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Radius: 16px
- Padding: 16px
- Hover: 2px anheben, Schatten `0 4px 0 #d7d7d7`

### Fähigkeitsbaum-Knoten (Lernblase)
- Größe: 80×72px
- Hintergrund: fähigkeitsfarbengetönt (grün für aktiv, grau für gesperrt)
- Border-bottom: 6px solid dunklere Variante
- Radius: 50% (kreisförmig)
- Aktiv: pulsiert 1.0 → 1.05 alle 1.6s

### Eingaben
- Hintergrund: `#ffffff`
- Rand: 2px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 16px
- Fokus: Rand `#1cb0f6` (Aal-Blau), Ring `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Fortschrittsbalken
- Spur: `#e5e5e5`
- Füllung: `#58cc02` (oder `#ff9600` für Streak)
- Radius: 9999px
- Höhe: 16px
- Animierte Füllung: 320ms ease-out beim Inkrementieren.

## 5. Abstände & Layout

- **Basiseinheit**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Container**: max. 1080px, 24px Rinne.
- **Lernbaumspalte**: 320px breit; auf Desktop zentriert.

## 6. Motion

- **Dauer**: 180ms für Button-Druck; 320ms für Knoten-Freischalten; 1.6s für aktiven Knoten-Puls.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (Back-out, leichter Überschwinger) für Freischalt-Animationen.
- **Maskottchen**: Duo blinzelt alle 4–6s, springt bei Streak-Meilensteinen (480ms ease-out Feder).

## 7. Verwendungsrichtlinien

- Behalten Sie das hochgesättigte Eulengrün, die wuchtigen Bodenschatten und die gerundete Lerngeometrie zusammen; flache grüne Buttons allein lesen sich nicht als Duolingo.
- Reservieren Sie übergroßen Fettdruck für Lern-, Streak- und Fortschrittsmomente, bei denen das Produkt Ermutigung oder Feedback benötigt.
- Verwenden Sie spielerische Bewegungen sparsam rund um Fortschrittsstatusänderungen und vermeiden Sie generische Bouncy-Animationen auf jedem Steuerelement.
