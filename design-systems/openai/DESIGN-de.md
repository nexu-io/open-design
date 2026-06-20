# Design System Inspired by OpenAI

> Category: KI & LLM
> Ruhiges, nahezu monochromes System, verankert in tiefem Blaugrün-Schwarz mit großzügigem Weißraum und redaktioneller Typografie.

## 1. Visuelles Thema & Atmosphäre

OpenAIs Produktoberfläche wirkt wie ein Forschungslabor, das sich für die Öffentlichkeit herausgeputzt hat — klinisch, zurückhaltend, bewusst leise. Der Seitenhintergrund ist ein echtes Weiß (`#ffffff`), das einem nahezu schwarzen Tintenton (`#0d0d0d`) mit subtiler Blaugrün-Untertönung gegenübergestellt wird, sodass selbst der Text leicht gekühlt statt aggressiv dunkel wirkt. Das Ergebnis ist eine chromatische Neutralität, die Modellausgaben, Code und Fließtext in den Vordergrund stellt — nicht das Drumherum.

Das Markenzeichen ist der Einsatz von **Söhne** (oder ihrem Systemersatz `inter`) in zurückhaltenden Schriftschnitten — 400 für Fließtext, 500 für Navigation und Labels, 600 für Betonung — gepaart mit **Signifier**, einer zeitgenössischen Serifenschrift für redaktionelle Display-Elemente. Wo die meisten KI-Marken auf Futurismus setzen, verleihen OpenAIs Serifen-Überschriften dem Produkt einen leise literarischen Ton, als wäre jede Ankündigung ein Essay.

Das Formsystem ist durchgehend weich: 8px–12px Radien, 9999px Pills für Tags und Chips, keinerlei harte Ecken. Abschnittswechsel werden durch Weißraum statt durch Trennlinien markiert; wenn Rahmen erscheinen, sind es `#e5e5e5`-Haarlinien, die eher wie das Fehlen von Farbe wirken als wie ihre Präsenz.

**Wesentliche Merkmale:**
- Echte Weiß-Leinwand (`#ffffff`) mit tiefem Blaugrün-Schwarz-Tinte (`#0d0d0d`)
- Söhne / Inter in bescheidenen Schnitten (400, 500, 600) — Zurückhaltung statt Behauptung
- Signifier Serifenschrift für redaktionelle Display-Überschriften
- Weiche 8–12px Radien überall; 9999px Pills für Chips
- Haarrahmen (`#e5e5e5`) sparsam eingesetzt; Weißraum als primärer Trenner
- Einfarbige Illustrationen in tiefem Blaugrün — keine Verläufe in Markierungen
- Großzügige Zeilenhöhe (1.55–1.65) und Laufweite nahe null

## 2. Farbpalette & Rollen

### Primär
- **Reinweiß** (`#ffffff`): Primärer Hintergrund, Kartenoberfläche, Button-Hintergrund.
- **Tintenschwarz** (`#0d0d0d`): Primärtext, Markenzeichen, primärer CTA.
- **Weiches Schwarz** (`#1a1a1a`): Sekundäre Überschrift, alternative Tinte für unkritischen Text.

### Oberflächen & Hintergründe
- **Nebel** (`#fafafa`): Hintergrund für Abschnittsumbrüche, Footer-Oberfläche.
- **Perle** (`#f5f5f5`): Kartenoberfläche, erhöhtes Panel.
- **Wolke** (`#ececec`): Deaktivierter Hintergrund, Trennton.

### Markenakzent
- **OpenAI Teal** (`#10a37f`): Primäre Markenfarbe, Link, Hervorhebungs-Badge — die einzige Farbe in einem ansonsten neutralen System.
- **Teal Deep** (`#0a7a5e`): Hover- und gedrückter Zustand für die Markenfarbe.
- **Teal Soft** (`#e8f5f0`): Oberflächenton für Erfolgs-Badges, hervorgehobene Callouts.

### Neutraltöne & Text
- **Graphit** (`#3c3c3c`): Fließtext, Standard-Lesefarbe.
- **Schiefer** (`#6e6e6e`): Sekundärtext, Bildunterschriften, Metadaten.
- **Asche** (`#9b9b9b`): Tertiärtext, Platzhalter, deaktiviertes Label.
- **Stein** (`#c4c4c4`): Dekorative Trennlinien, schwache Icons.

### Semantisch & Rahmen
- **Rahmen Haarlinie** (`#e5e5e5`): Standardmäßiger Haarlinienseparator.
- **Rahmen Weich** (`#ededed`): Kartenumriss auf weißer Oberfläche.
- **Fehler** (`#ef4146`): Validierung, destruktive Aktion.
- **Warnung** (`#f5a623`): Weiches Bernstein für Hinweiszustände.
- **Info** (`#2563eb`): Informationeller Link-Ton (sparsam verwendet; Teal hat Vorrang).

## 3. Typografieregeln

### Schriftfamilien
- **Display / Redaktionell**: `Signifier`, mit Fallback: `'Source Serif Pro', Georgia, serif`
- **Fließtext / UI**: `Söhne`, mit Fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, mit Fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Redaktionelles Hero, Ankündigungstitel |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Seitenüberschrift |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Abschnittsüberschrift |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Unterabschnitt |
| Großer Fließtext | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Einleitungsabsätze |
| Fließtext | Söhne | 16px (1rem) | 400 | 1.65 | normal | Standard-Lesetext |
| Kleiner Fließtext | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Kartentext, kompaktes UI |
| Bildunterschrift | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadaten, Badges |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, Navigationslinks in Großbuchstaben |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Code-Blöcke, Terminal-Ausgabe |

### Prinzipien
- **Zurückhaltung als Identität**: Schriftgewichte enden bei 600; 700+ wirkt markenfern. Hierarchie entsteht durch Größe und Farbe, nicht durch Gewicht.
- **Serifenschrift für Seele, Grotesk für das System**: Signifier erscheint nur in redaktionellen Display-Momenten. Das Produkt-UI ist rein serifenlos.
- **Negativer Tracking bei Display**: -0.02em bei Display-Größen; Tracking kehrt bis 16px auf null zurück.

## 4. Komponentenstile

### Buttons

**Primär**
- Hintergrund: `#0d0d0d`
- Text: `#ffffff`
- Innenabstand: 10px 18px
- Radius: 9999px (volle Pill) bei Chips, 12px bei rechteckigen CTAs
- Hover: Hintergrund `#1a1a1a`
- Verwendung: Primärer CTA, „Try ChatGPT", „Sign in"

**Sekundär**
- Hintergrund: `#ffffff`
- Text: `#0d0d0d`
- Rahmen: 1px solid `#e5e5e5`
- Innenabstand: 10px 18px
- Radius: 12px
- Hover: Hintergrund `#fafafa`, Rahmen `#d4d4d4`

**Markenakzent**
- Hintergrund: `#10a37f`
- Text: `#ffffff`
- Innenabstand: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Verwendung: Hervorgehobener Upgrade-CTA, Erfolgspfad

### Karten
- Hintergrund: `#ffffff`
- Rahmen: 1px solid `#ededed`
- Radius: 16px
- Innenabstand: 24px–32px
- Schatten: standardmäßig keiner; bei Hover `0 4px 16px rgba(13,13,13,0.06)`

### Eingabefelder
- Hintergrund: `#ffffff`
- Rahmen: 1px solid `#e5e5e5`
- Radius: 12px
- Innenabstand: 12px 14px
- Fokus: Rahmen `#10a37f`, Ring `0 0 0 3px rgba(16,163,127,0.12)`

### Pills & Tags
- Hintergrund: `#f5f5f5`
- Text: `#3c3c3c`
- Innenabstand: 4px 10px
- Radius: 9999px
- Schrift: 12px / 500

## 5. Abstände & Layout

- **Basiseinheit**: 4px. Skala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: max-width 1200px, 24px Gutter auf Mobilgeräten, 48px auf dem Desktop.
- **Abschnittsrhythmus**: 96–128px vertikal zwischen Hauptabschnitten; 64px auf Mobilgeräten.
- **Raster**: 12-spaltig auf dem Desktop, 4-spaltig auf Mobilgeräten, 24px Abstand.

## 6. Bewegung

- **Dauer**: 150–220ms für Hover; 280–360ms für Layout-Übergänge.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth out) für Einblendungen.
- **Zurückhaltung**: kein Parallax, kein Scroll-Jacking. Nur subtiles Fade und Translate.

## 7. Verwendungsrichtlinien

- Die neutrale redaktionelle Zurückhaltung, weiche Radien und sparsame Akzentnutzung müssen gemeinsam bewahrt werden; grüne Akzente allein ergeben keine OpenAI-ähnliche Oberfläche.
- Signifier-artige Display-Momente nur für redaktionelle oder Ankündigungshierarchien einsetzen; Produktsteuerelemente verbleiben im Grotesk-System.
- Ornamentale Bewegungen, schwere Schatten und überdimensionierte dekorative Karten vermeiden; das System soll ruhig, lesbar und durchdacht wirken.
