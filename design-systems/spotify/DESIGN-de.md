# Design System Inspired by Spotify

> Category: Medien & Konsumenten
> Musik-Streaming. Lebendiges Grün auf Dunkel, markante Typografie, albumcover-getrieben.

## 1. Visuelles Thema & Atmosphäre

Spotifys Web-Interface ist ein dunkler, immersiver Musik-Player, der Hörerinnen und Hörer in einen fastschwarzen Kokon hüllt (`#121212`, `#181818`, `#1f1f1f`), in dem Albumcover und Inhalte zur primären Farbquelle werden. Die Designphilosophie lautet „Content-First-Dunkelheit" — die UI tritt in den Schatten zurück, damit Musik, Podcasts und Playlists leuchten können. Jede Fläche ist ein Anthrazit-Ton, was eine theaterartige Umgebung schafft, in der die einzige echte Farbe vom ikonischen Spotify Green (`#1ed760`) und den Albumcovern selbst stammt.

Die Typografie verwendet SpotifyMixUI und SpotifyMixUITitle — proprietäre Schriften aus der CircularSp-Familie (Circular von Lineto, für Spotify angepasst) mit einem umfangreichen Fallback-Stack, der arabische, hebräische, kyrillische, griechische, Devanagari- und CJK-Schriften umfasst — ein Spiegelbild von Spotifys globaler Reichweite. Das Typsystem ist kompakt und funktional: 700 (Bold) für Hervorhebung und Navigation, 600 (Semibold) für sekundäre Akzente und 400 (Regular) für Fließtext. Buttons verwenden Großschreibung mit positivem Buchstabenabstand (1,4 px–2 px) für eine systematische, etikettartige Qualität.

Was Spotify auszeichnet, ist seine Pille-und-Kreis-Geometrie. Primäre Buttons verwenden einen Radius von 500 px–9999 px (volle Pille), runde Play-Buttons verwenden 50 % Radius, und Sucheingaben sind 500-px-Pillen. Kombiniert mit starken Schatten (`rgba(0,0,0,0.5) 0px 8px 24px`) auf erhöhten Elementen und einer einzigartigen Inset-Border-Shadow-Kombination (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`) entsteht ein Interface, das wie ein hochwertiges Audiogerät wirkt — taktil, abgerundet und für Touch konzipiert.

**Wesentliche Merkmale:**
- Fastschwarzes, immersives Dunkelthema (`#121212`–`#1f1f1f`) — die UI verschwindet hinter dem Inhalt
- Spotify Green (`#1ed760`) als einzelner Markenakzent — niemals dekorativ, stets funktional
- SpotifyMixUI/CircularSp-Schriftfamilie mit globaler Schriftunterstützung
- Pille-Buttons (500 px–9999 px) und kreisförmige Steuerelemente (50 %) — abgerundet, touch-optimiert
- Großgeschriebene Button-Beschriftungen mit breitem Buchstabenabstand (1,4 px–2 px)
- Starke Schatten auf erhöhten Elementen (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Semantische Farben: Negativ-Rot (`#f3727f`), Warn-Orange (`#ffa42b`), Hinweis-Blau (`#539df5`)
- Albumcover als primäre Farbquelle — die UI ist von Natur aus achromatisch

## 2. Farbpalette & Rollen

### Primäre Markenfarben
- **Spotify Green** (`#1ed760`): Primärer Markenakzent — Play-Buttons, aktive Zustände, CTAs
- **Fastschwarz** (`#121212`): Tiefste Hintergrundfläche
- **Dunkle Fläche** (`#181818`): Karten, Container, erhöhte Flächen
- **Mitteldunkel** (`#1f1f1f`): Button-Hintergründe, interaktive Flächen

### Text
- **Weiß** (`#ffffff`): `--text-base`, primärer Text
- **Silber** (`#b3b3b3`): Sekundärer Text, gedämpfte Beschriftungen, inaktive Navigation
- **Nahweiß** (`#cbcbcb`): Etwas hellerer sekundärer Text
- **Hell** (`#fdfdfd`): Nahreines Weiß für maximale Betonung

### Semantisch
- **Negativ-Rot** (`#f3727f`): `--text-negative`, Fehlerzustände
- **Warn-Orange** (`#ffa42b`): `--text-warning`, Warnzustände
- **Hinweis-Blau** (`#539df5`): `--text-announcement`, Informationszustände

### Flächen & Rahmen
- **Dunkle Karte** (`#252525`): Erhöhte Kartenfläche
- **Mittlere Karte** (`#272727`): Alternative Kartenfläche
- **Rahmen-Grau** (`#4d4d4d`): Button-Rahmen auf Dunkel
- **Heller Rahmen** (`#7c7c7c`): Umrissene Button-Rahmen, gedämpfte Links
- **Trennlinie** (`#b3b3b3`): Trennlinien
- **Helle Fläche** (`#eeeeee`): Hellmodus-Buttons (selten)
- **Spotify Green Rahmen** (`#1db954`): Grüne Akzent-Rahmen-Variante

### Schatten
- **Stark** (`rgba(0,0,0,0.5) 0px 8px 24px`): Dialoge, Menüs, erhöhte Panels
- **Mittel** (`rgba(0,0,0,0.3) 0px 8px 8px`): Karten, Dropdowns
- **Inset-Rahmen** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Eingabefeld-Rahmen-Shadow-Kombination

## 3. Typografie-Regeln

### Schriftfamilien
- **Titel**: `SpotifyMixUITitle`, Fallbacks: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Body**: `SpotifyMixUI`, gleicher Fallback-Stack

### Hierarchie

| Rolle | Schrift | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|------|--------|-------------|----------------|-------|
| Abschnittstitel | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Fettes Titelgewicht |
| Feature-Überschrift | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (eng) | normal | Semibold-Abschnittsköpfe |
| Body Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Betonter Text |
| Body | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Standard-Fließtext |
| Button Großschrift | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (eng) | 1.4px–2px | `text-transform: uppercase` |
| Button | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Standard-Button |
| Nav-Link Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navigation |
| Nav-Link | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Inaktive Navigation |
| Caption Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Fette Metadaten |
| Caption | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadaten |
| Klein Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Tags, Zählungen |
| Klein | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Kleingedrucktes |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Mikro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Kleinster Text |

### Grundsätze
- **Binäres Bold/Regular**: Der meiste Text ist entweder 700 (Bold) oder 400 (Regular), wobei 600 sparsam eingesetzt wird. Dies schafft eine klare visuelle Hierarchie durch Gewichtskontrast statt Größenvariation.
- **Großgeschriebene Buttons als System**: Button-Beschriftungen verwenden Großschrift + breiten Buchstabenabstand (1,4 px–2 px) und schaffen damit eine systematische „Beschriftungs"-Stimme, die sich vom Inhaltstext abhebt.
- **Kompakte Größen**: Die Spanne reicht von 10 px bis 24 px — enger als die meisten Systeme. Spotifys Typografie ist kompakt und funktional, konzipiert zum Scannen von Playlists, nicht zum Lesen von Artikeln.
- **Globale Schriftunterstützung**: Der umfangreiche Fallback-Stack (Arabisch, Hebräisch, Kyrillisch, Griechisch, Devanagari, CJK) spiegelt Spotifys Reichweite in über 180 Märkten wider.

## 4. Komponenten-Stile

### Buttons

**Dunkle Pille**
- Background: `#1f1f1f`
- Text: `#ffffff` oder `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (volle Pille)
- Verwendung: Navigations-Pillen, sekundäre Aktionen

**Dunkle große Pille**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Verwendung: Primäre App-Navigationsbuttons

**Helle Pille**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- Verwendung: Hellmodus-CTAs (Cookie-Einwilligung, Marketing)

**Umrissene Pille**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (asymmetrisch für Icon)
- Radius: 9999px
- Verwendung: Folgen-Buttons, sekundäre Aktionen

**Kreisförmiger Play**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50% (Kreis)
- Verwendung: Play/Pause-Steuerung

### Karten & Container
- Background: `#181818` oder `#1f1f1f`
- Radius: 6px–8px
- Keine sichtbaren Rahmen bei den meisten Karten
- Hover: leichte Aufhellung des Hintergrunds
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px` auf erhöhten Elementen

### Eingabefelder
- Sucheingabe: `#1f1f1f` Hintergrund, `#ffffff` Text
- Radius: 500px (Pille)
- Padding: 12px 96px 12px 48px (icon-bewusst)
- Fokus: Rahmen wird `#000000`, Outline `1px solid`

### Navigation
- Dunkle Seitenleiste mit SpotifyMixUI 14px Gewicht 700 für aktiv, 400 für inaktiv
- `#b3b3b3` gedämpfte Farbe für inaktive Einträge, `#ffffff` für aktive
- Kreisförmige Icon-Buttons (50 % Radius)
- Spotify-Logo oben links in Grün

## 5. Layout-Grundsätze

### Abstands-System
- Basiseinheit: 8px
- Skala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Raster & Container
- Seitenleiste (fest) + Hauptinhaltsbereich
- Rasterbasierte Album-/Playlist-Karten
- Vollbreite Now-Playing-Leiste am unteren Rand
- Responsiver Inhaltsbereich füllt den verbleibenden Platz

### Weißraum-Philosophie
- **Dunkle Verdichtung**: Spotify packt Inhalte dicht — Playlist-Raster, Track-Listen und Navigation sind alle eng gesetzt. Der dunkle Hintergrund schafft visuellen Abstand zwischen Elementen, ohne große Lücken zu benötigen.
- **Inhaltsdichte vor Atemraum**: Dies ist eine App, keine Marketing-Website. Jedes Pixel dient dem Hörerlebnis.

### Rahmenradius-Skala
- Minimal (2px): Badges, explizite Tags
- Subtil (4px): Eingabefelder, kleine Elemente
- Standard (6px): Albumcover-Container, Karten
- Komfortabel (8px): Abschnitte, Dialoge
- Mittel (10px–20px): Panels, Overlay-Elemente
- Groß (100px): Große Pille-Buttons
- Pille (500px): Primäre Buttons, Sucheingabe
- Volle Pille (9999px): Navigations-Pillen, Suche
- Kreis (50%): Play-Buttons, Avatare, Icons

## 6. Tiefe & Erhöhung

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Basis (Ebene 0) | `#121212` Hintergrund | Tiefste Schicht, Seitenhintergrund |
| Fläche (Ebene 1) | `#181818` oder `#1f1f1f` | Karten, Seitenleiste, Container |
| Erhöht (Ebene 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Dropdown-Menüs, Hover-Karten |
| Dialog (Ebene 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modals, Overlays, Menüs |
| Inset (Rahmen) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Eingabefeld-Rahmen |

**Schatten-Philosophie**: Spotify verwendet für eine dunkel-themed App auffallend starke Schatten. Der Schatten mit 0,5 Deckkraft bei 24 px Weichzeichnung erzeugt einen dramatischen „Schweben in der Dunkelheit"-Effekt für Dialoge und Menüs, während 0,3 Deckkraft bei 8 px Weichzeichnung eine subtilere Karten-Hebung bietet. Die einzigartige Inset-Rahmen-Shadow-Kombination bei Eingabefeldern erzeugt eine versenkte, taktile Qualität.

## 7. Empfehlungen & Warnhinweise

### Empfohlen
- Fastschwarze Hintergründe verwenden (`#121212`–`#1f1f1f`) — Tiefe durch Schattierungsvariation
- Spotify Green (`#1ed760`) ausschließlich für Play-Steuerung, aktive Zustände und primäre CTAs einsetzen
- Pillenform (500 px–9999 px) für alle Buttons — Kreisform (50 %) für Play-Steuerung
- Großschrift + breiten Buchstabenabstand (1,4 px–2 px) auf Button-Beschriftungen anwenden
- Typografie kompakt halten (10 px–24 px-Bereich) — dies ist eine App, kein Magazin
- Starke Schatten (`0,3–0,5 Deckkraft`) für erhöhte Elemente auf dunklen Hintergründen verwenden
- Albumcover für Farbe sorgen lassen — die UI selbst bleibt achromatisch

### Nicht empfohlen
- Spotify Green nicht dekorativ oder auf Hintergründen einsetzen — es ist ausschließlich funktional
- Keine hellen Hintergründe für primäre Flächen — die dunkle Immersion ist das Kernkonzept
- Keine Pille-/Kreis-Geometrie bei Buttons weglassen — eckige Buttons brechen die Identität
- Keine dünnen/subtilen Schatten verwenden — auf dunklen Hintergründen müssen Schatten stark sein, um sichtbar zu sein
- Keine zusätzlichen Markenfarben hinzufügen — Grün + achromatische Grautöne sind die vollständige Palette
- Keine lockeren Zeilenhöhen verwenden — Spotifys Typografie ist kompakt und dicht
- Keine rohen grauen Rahmen freilegen — stattdessen schatten- oder inset-basierte Rahmen verwenden

## 8. Responsives Verhalten

### Haltepunkte
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobile Klein | <425px | Kompaktes mobiles Layout |
| Mobile | 425–576px | Standard-Mobile |
| Tablet | 576–768px | 2-spaltiges Raster |
| Tablet Groß | 768–896px | Erweitertes Layout |
| Desktop Klein | 896–1024px | Seitenleiste sichtbar |
| Desktop | 1024–1280px | Vollständiges Desktop-Layout |
| Großer Desktop | >1280px | Erweitertes Raster |

### Kollaps-Strategie
- Seitenleiste: vollständig → eingeklappt → ausgeblendet
- Album-Raster: 5 Spalten → 3 → 2 → 1
- Now-Playing-Leiste: in allen Größen erhalten
- Suche: Pille-Eingabe erhalten, Breite passt sich an
- Navigation: Seitenleiste → untere Leiste auf Mobile

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Hintergrund: Fastschwarz (`#121212`)
- Fläche: Dunkle Karte (`#181818`)
- Text: Weiß (`#ffffff`)
- Sekundärer Text: Silber (`#b3b3b3`)
- Akzent: Spotify Green (`#1ed760`)
- Rahmen: `#4d4d4d`
- Fehler: Negativ-Rot (`#f3727f`)

### Beispiel-Komponenten-Prompts
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### Iterations-Leitfaden
1. Mit `#121212` beginnen — alles lebt in fastschwarzer Dunkelheit
2. Spotify Green nur für funktionale Hervorhebungen (Play, aktiv, CTA)
3. Alles als Pille gestalten — 500 px für groß, 9999 px für klein, 50 % für kreisförmig
4. Großschrift + breiter Tracking auf Buttons — die systematische Beschriftungs-Stimme
5. Starke Schatten (0,3–0,5 Deckkraft) für Erhöhung — helle Schatten sind auf Dunkel unsichtbar
6. Albumcover liefern alle Farbe — die UI bleibt achromatisch
