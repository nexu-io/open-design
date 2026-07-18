# Design System Inspired by Nike

> Category: E-Commerce & Einzelhandel
> Sportlicher Einzelhandel. Monochrome UI, massiver Großbuchstaben-Schriftsatz, randlose Fotografie.

## 1. Visuelles Thema & Atmosphäre

Nike.com ist eine kinetische Einzelhandels-Kathedrale — eine Website, die die explosive Energie des Sports in ein digitales Einkaufserlebnis überträgt. Das Design beruht auf dem Prinzip radikaler Einfachheit: Alles wird auf Schwarz, Weiß und Grau reduziert, damit athletische Fotografie und Produktfarbe ohne Konkurrenz dominieren können. Das Ergebnis wirkt weniger wie eine Website und mehr wie ein Sport-Magazin, mit der Präzision eines Luxustitels gestaltet. Jedes Pixel der Fläche verkauft entweder ein Produkt oder führt darauf zu.

Das „Podium CDS" (Nikes internes Core Design System) legt eine aggressiv monochromatische Grundlage. Die UI verschwindet in schwarzem (`#111111`) Text und weißen Flächen, damit Hero-Fotografie — schwitzende Athleten, Schuhe in der Luft, Stadion-Energie — die emotionale Last tragen kann. Wenn Farbe in der UI auftaucht, ist sie fast ausschließlich funktional: Rot für Fehler, Blau für Links, Grün für Erfolg. Das Produkt selbst ist die Farbgeschichte. Diese Zurückhaltung erzeugt ein visuelles Paradoxon: Die farbenreichsten Seiten im Internet wirken am minimalistischsten, weil alle Lebendigkeit aus der Ware statt aus der Oberfläche kommt.

Das Typografiesystem ist die zweite Hälfte von Nikes visueller Identität. Massive Großbuchstaben-Headlines in Nike Futura ND — eine exklusive, schmale Futura-Variante mit unmöglich engem Zeilenabstand (0.90) — durchdringen Hero-Bilder wie ein typografischer Schockwelle. Unterhalb der Headlines erledigt die Helvetica Now-Familie als Arbeitspferd alles von Navigation bis Produktbeschreibungen mit schweizerischer Präzisionsklarheit. Diese Trennung zwischen expressivem Display-Schriftbild und funktionalem Fließtext spiegelt Nikes Marken-Dualität wider: Inspiration trifft Ausführung.

**Key Characteristics:**
- Monochromatische UI (schwarz/weiß/grau), die Produktfotografie zur einzigen Farbquelle macht
- Massiver Display-Schriftsatz in Großbuchstaben (96px, Zeilenabstand 0.90), der durch Hero-Bilder sticht
- Randlose Fotografie ohne Border-Radius — Bilder füllen jede verfügbare Kante
- Pill-förmige Buttons (30px Radius) als primäres Interaktionselement
- 8px-Abstands-Grid mit athletischer Disziplin — jede Maßangabe rastet im System ein
- Kategorie-getriebene Shopping-Architektur mit großen navigationalen Bildkarten
- Schatten-freies, border-minimales Elevations-Modell — Oberflächendifferenzierung ausschließlich durch Grau-Verschiebungen

## 2. Farbpalette & Rollen

### Primär

- **Nike Black** (`#111111`): Die Grundlage — primärer Text, Button-Hintergründe, Nav-Text, Hero-Überlagerungen. Bewusst kein reines Schwarz (#000000), was ein minimal weicheres Leseerlebnis erzeugt
- **Nike White** (`#FFFFFF`): Primäre Seitenoberfläche, Button-Text auf dunklem Grund, Karten-Flächen, Nav-Bar-Hintergrund

### Fläche & Hintergrund

- **Snow** (`#FAFAFA`): Hellste Fläche, nahezu weiße, subtile Differenzierung (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Sekundärer Hintergrund, Sucheingabe-Füllung, Bild-Platzhalter, Lade-Skeleton (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Hover-Zustand-Hintergrund, deaktivierter Button-Fill (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Primärer Hintergrund für dunkle/invertierte Abschnitte (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Invertierter primärer Hintergrund, dunkelste nicht-schwarze Fläche (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Hover-Zustand auf dunklen Hintergründen (--podium-cds-color-grey-700)

### Neutraltöne & Text

- **Primary Text** (`#111111`): Haupt-Fließtext, Überschriften, Nav-Links (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Beschreibungstexte, Metadaten, Zeitstempel, Preisetiketten (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Inaktive Elemente, nicht verfügbare Optionen (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Deaktivierter Text auf dunklen Hintergründen (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Standard-Rahmenfarbe, passend zu Secondary Text
- **Border Secondary** (`#CACACB`): Dezente Rahmen, Eingaberahmen, Trennlinien (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Inaktiver Rahmenzustand
- **Border Active** (`#111111`): Aktiver/fokussierter Rahmen, passend zu Primary Text

### Semantisch & Akzent

- **Nike Red** (`#D30005`): Kritische Fehler, Sale-Badges, dringende Benachrichtigungen (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, etwas helleres Rot zur Betonung
- **Nike Orange Badge** (`#D33918`): Badge-Text, Aktions-Callouts (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Expressiver orangefarbener Akzent (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Bestätigung, Verfügbarkeit, positive Zustände (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Erfolg auf dunklen Hintergründen (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Text-Links, informative Hervorhebungen (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Links auf dunklen Hintergründen (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Warnhinweis-Hintergründe, Aufmerksamkeitsbanner (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Tastatur-Fokusring-Indikator

### Erweitertes Farbspektrum (Podium CDS)

Jede Farbreihe läuft von 50–900 für expressive Verwendung in Kampagnen und Produktseiten:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Verlaufssystem

Nike vermeidet UI-Verläufe. Wenn Verläufe auftreten, sind sie fotografischer Natur — auf Produkt-Hero-Hintergründe angewendet (z. B. ein roter Schuh auf einem rot-zu-tieferem-rot-Verlauf). Das Design-System selbst arbeitet ausschließlich mit Vollfarben.

## 3. Typografie-Regeln

### Schriftfamilie

**Display:** Nike Futura ND (exklusive schmale Futura-Variante, nur für Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Ausschließlich für große Display-Headlines in Großbuchstaben
- Charakteristisch enger Zeilenabstand (0.90) und Großbuchstaben-Transformation

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Für Abschnittsüberschriften und Produkttitel bei 24–32px

**Body Medium:** Helvetica Now Text Medium (Gewicht 500)
- Fallbacks: Helvetica, Arial
- Für Links, Buttons, Bildunterschriften, hervorgehobenen Fließtext

**Body:** Helvetica Now Text (Gewicht 400)
- Fallbacks: Helvetica, Arial
- Für Standard-Fließtext, Beschreibungen, Metadaten

**Arabic:** Neue Frutiger Arabic — sprachspezifische Alternative

### Hierarchie

| Rolle | Größe | Gewicht | Zeilenabstand | Buchstabenabstand | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, Großbuchstaben, Hero-Headlines |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, Abschnittstitel |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, Unterabschnitte |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, Kartentitel |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, Produktbeschreibungen |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, hervorgehobener Text |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, Navigationslinks |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, Footer-/Utility-Links |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, CTA-Text |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, sekundäre Buttons |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, Preisetiketten |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, Zeitstempel |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, Rechtstexte |

### Prinzipien

Nikes Typografie ist eine Studie in Spannung. Die Display-Ebene — Nike Futura ND bei 96px mit einem verheerenden 0.90-Zeilenabstand — ist so konzipiert, dass sie sich wie eine Stadion-Anzeigetafel anfühlt: massiv, komprimiert, in Großbuchstaben, unmöglich zu übersehen. Sie verwandelt Headlines in Schlachtrufe. Unterhalb der Display-Ebene bietet Helvetica Now einen klinischen Gegenpol: schweizerische Präzisionslesbarkeit mit großzügigem 1.75-Zeilenabstand für komfortables Produktbrowsing. Gewicht 500 (Medium) dominiert im gesamten Fließtext und verleiht Nikes Texten eine leichte Bestimmtheit ohne die Schwere von Fettschrift — jeder Satz liest sich wie eine souveräne Empfehlung, kein Aufschrei.

## 4. Komponentenstile

### Buttons

**Primär**
- Hintergrund: Nike Black (`#111111`)
- Text: Weiß (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Rahmen: keiner
- Border-Radius: vollständig gerundete Pill (30px)
- Padding: ~12px 24px
- Hover: Hintergrund wechselt zu Grey-500 (`#707072`), Text-Hover-Farbe
- Aktiv: scale(0)-Ripple-Effekt mit Opacity 0.5
- Fokus: 2px box-shadow-Ring in `rgba(39, 93, 197, 1)`
- Übergang: background 200ms ease

**Primär auf Dunkel**
- Hintergrund: Weiß (`#FFFFFF`)
- Text: Schwarz (`#111111`)
- Hover: Hintergrund wechselt zu Grey-300 (`#CACACB`)

**Sekundär (Outlined)**
- Hintergrund: transparent
- Text: Nike Black (`#111111`)
- Rahmen: 1.5px solid `#CACACB` (grey-300)
- Border-Radius: 30px
- Hover: Rahmen dunkelt zu `#707072`, Hintergrund zu grey-200

**Deaktiviert**
- Hintergrund: Grey-200 (`#E5E5E5`)
- Text: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Icon-Button**
- Hintergrund: Grey-100 (`#F5F5F5`)
- Form: 30px-Radius (oder 50% für rund)
- Padding: 6px
- Hover: Grey-500-Hintergrund

### Karten & Container

- Hintergrund: Weiß (`#FFFFFF`) — in den meisten Fällen keine sichtbare Kartengrenze
- Border-Radius: 0px für Produktbild-Karten (kantenbündige Bilder), 20px für interaktive Container
- Schatten: keiner — Nike verwendet keinerlei Kartenschatten
- Hover: kein Hebe-Effekt auf Produktkarten; Unterstreichung bei Text-Links innerhalb von Karten
- Produktkarten: Bild oben (kein Radius), Text-Metadaten darunter mit 12px-Abstand
- Kategorie-Karten: randlose Fotografie mit Text-Overlay auf dunklem Verlauf
- Übergang: opacity 200ms ease für Bildwechsel beim Hover

### Eingaben & Formulare

- Hintergrund: Grey-100 (`#F5F5F5`)
- Rahmen: 1px solid `#CACACB` wenn sichtbar, oder rahmenlos bei der Suche
- Border-Radius: 24px (Sucheingaben), 8px (Formulareingaben)
- Schrift: Helvetica Now Text, 16px
- Fokus: Rahmen wechselt zu `#111111` (border-active), 2px-Fokusring in `rgba(39, 93, 197, 1)`
- Fehler: Rahmen `#D30005` (critical)
- Platzhalter: Grey-500 (`#707072`)
- Übergang: border-color 200ms ease

### Navigation

- Hintergrund: Weiß (`#FFFFFF`), sticky
- Höhe: ~60px Desktop
- Links: Nike-Swoosh-Logo (24x24px SVG)
- Mitte: Kategorielinks (Neu & Featured, Herren, Damen, Kinder, Sale) in 16px/500 Helvetica Now Text Medium
- Rechts: Suche (24px-Radius-Eingabe), Favoriten, Warenkorb-Icons
- Hover: Textfarbe wechselt zu Grey-500 (`#707072`)
- Mobil: Hamburger-Menü, Vollbild-Overlay
- Oberes Banner: Werbeinhalt-Nachrichtenleiste mit dunklem Hintergrund (#111111) und weißem Text

### Bildbehandlung

- Hero-Bilder: randlos, kein Border-Radius, kantenbündig
- Produktraster: quadratisch (1:1) oder 4:3-Seitenverhältnis, kein Border-Radius
- Kategorie-Karten: 16:9 oder 4:3, randlos mit Text-Overlay
- Bild-Platzhalter: Grey-100 (`#F5F5F5`) Vollflächenhintergrund
- Lazy Loading: natives loading="lazy", Skeleton verwendet #F5F5F5-Hintergrund
- Produkt-Hover: sekundärer Bildwechsel (Vorder- → Seitenansicht)

### Werbebanner

- Volle Breite, dunkler (`#111111`) Hintergrund mit weißem Text
- Engem Padding (8–12px vertikal)
- Zentrierter Text, 12px/500 Helvetica Now Text Medium
- Verwendet für Versandaktionen, Mitglieder-Vorteile, Sale-Ankündigungen

## 5. Layout-Prinzipien

### Abstands-System

Basiseinheit: 4px (primäres Grid in 8px-Vielfachen)

| Token | Wert | Verwendung |
|-------|-------|-----|
| space-1 | 4px | Enge Icon-Abstände, Inline-Spacing |
| space-2 | 8px | Basiseinheit, Button-Icon-Abstände |
| space-3 | 12px | Internes Karten-Padding, enge Abstände |
| space-4 | 16px | Standard-Padding, Nav-Abstände |
| space-5 | 20px | Produktkarten-Abstände |
| space-6 | 24px | Internes Abschnitt-Padding, Grid-Abstände |
| space-7 | 32px | Abschnittsumbrüche |
| space-8 | 48px | Größeres Abschnitt-Padding |
| space-9 | 64px | Hero-Abschnitt-Padding |
| space-10 | 80px | Großes Abschnitts-Spacing |

### Grid & Container

- Maximale Container-Breite: 1920px
- Standard-Inhaltsbreite: ~1440px mit horizontalem Padding
- Produktraster: 3-spaltig auf Desktop, 2-spaltig auf Tablet, 1-spaltig auf Mobil
- Kategorieraster: 3-spaltig mit randlosen Bildern
- Grid-Abstand: 4–12px zwischen Produktkarten (bewusst eng)
- Horizontales Padding: 48px Desktop, 24px Tablet, 16px Mobil

### Weißraum-Philosophie

Nikes Weißraum-Strategie ist bewusst aggressiv — nicht auf die luxuriöse, atmende Art einer Modemarke, sondern auf eine komprimierte, dichte Art, die jedes Pixel mit entweder Inhalt oder bewusstem Leerraum füllt. Produktraster verwenden minimale Abstände (4–12px), um ein Gefühl von Fülle und Auswahl zu erzeugen. Abschnittsumbrüche sind großzügig (48–80px), um Shopping-Kontexte zu trennen. Der Gesamteffekt ist ein Geschäft, das vollgepackt mit Produkten wirkt, während es dennoch navigierbar bleibt — wie ein gut organisierter Sportartikel-Supermarkt.

### Border-Radius-Skala

| Wert | Kontext |
|-------|---------|
| 0px | Produktbilder, Hero-Fotografie (scharfe Kanten) |
| 8px | Formulareingaben (nicht Suche) |
| 18px | Kleine interaktive Elemente |
| 20px | Container, Karten mit UI-Inhalt |
| 24px | Sucheingaben, mittlere Pills |
| 30px | Buttons, Tags, Filter (vollständige Pill) |
| 50% | Runde Icon-Buttons, Avatar-Platzhalter |

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Flach | Kein Schatten, kein Rahmen | Standardzustand für alles |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Dezente Inset-Linie zwischen Abschnitten |
| Fokus | `0 0 0 2px rgba(39, 93, 197, 1)` | Tastatur-Fokusring |
| Overlay | Dunkler Scrim über Fotografie | Lesbarkeit von Text auf Bildern |

Nikes Elevations-Philosophie ist radikal flach. Es gibt keine Kartenschatten, keine Hover-Hebe-Effekte, keine schwebenden Elemente. Tiefe wird ausschließlich durch Farbe kommuniziert — dunkle Abschnitte treten zurück, helle Abschnitte treten vor, Grau-Verschiebungen zeigen Zustandsänderungen an. Diese Flachheit verstärkt die athletische, nüchterne Markenpersönlichkeit: keine visuellen Verzierungen, nur direkte Kommunikation. Der einzige „Schatten" im gesamten System ist eine 1px-Inset-Trennlinie und der zugänglichkeitsbedingte Fokusring.

### Dekorative Tiefe

- **Hero-Fotografie-Overlays**: Dunkle Verlaufs-Scrims über randloser Fotografie für Textlesbarkeit
- **Produkt-Hintergrundverläufe**: Farbige Hintergründe hinter Hero-Produktaufnahmen (z. B. roter Schuh auf rotem Verlauf)
- **Banner-Leisten**: Solide dunkle (#111111) Werbestreifen am oberen Seitenrand

## 7. Dos und Don'ts

### Do

- Nike Black (#111111) für alle primären Texte verwenden — niemals reines #000000
- Buttons pill-förmig halten (30px-Radius) und auf primäre/sekundäre Varianten beschränken
- Randlose, kantenbündige Fotografie für Hero-Abschnitte verwenden — kein Border-Radius auf Bildern
- Produktfotografie die gesamte Farblebendigkeit liefern lassen; UI monochrom halten
- Nike Futura ND in Großbuchstaben AUSSCHLIESSLICH für Display-Headlines (96px+) verwenden
- Enge Produktraster-Abstände (4–12px) für ein dichtes, reichhaltiges Gefühl beibehalten
- Grey-100 (#F5F5F5) für alle Eingabe- und Platzhalter-Hintergründe verwenden
- Farbe ausschließlich für semantische Bedeutung reservieren (rot=Fehler, grün=Erfolg, blau=Link)
- Gewicht 500 (Medium) für alle interaktiven Textelemente verwenden

### Don't

- Keine Schatten zu Karten hinzufügen — Nikes Elevations-Modell ist vollständig flach
- Keinen Border-Radius auf Produktbilder anwenden — nur UI-Elemente erhalten abgerundete Ecken
- Keine Markenfarben jenseits der Grau-Skala für UI-Elemente einführen
- Nike Futura ND nicht unter 24px verwenden — es ist ausschließlich eine Display-Schrift
- Keine Hover-Hebe-Effekte einsetzen — Nike-Karten animieren beim Hover nicht
- Kein reguläres Gewicht (400) für Buttons oder Links verwenden — immer 500 nutzen
- Keine farbigen Hintergründe hinter UI-Elementen platzieren — Farbe ist für Produktkontexte reserviert
- Nicht mehr als zwei Text-Hierarchieebenen pro Karte verwenden (Titel + Body)
- Keine dekorativen Trennlinien hinzufügen — die 1px-Inset-Linie ist das einzige Trennmuster
- Den Kontrast nicht abschwächen — Nikes Design treibt Schwarz-auf-Weiß bewusst auf Maximum

## 8. Responsives Verhalten

### Breakpoints

| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil | <640px | Einspaltig, Hamburger-Nav, Display-Text skaliert kleiner, enges 16px-Padding |
| Kleines Tablet | 640-768px | 2-spaltiges Produktraster beginnt, Nav noch zugeklappt |
| Tablet | 768-960px | 2-spaltige Raster, Kategorie-Karten skalieren, horizontales Padding 24px |
| Kleiner Desktop | 960-1024px | Nav expandiert zu vollständig horizontal, 3-spaltiges Produktraster |
| Desktop | 1024-1440px | Vollständiges Layout, erweiterte Nav, 3-spaltige Raster, 48px-Padding |
| Großer Desktop | >1440px | Max-Width-Container zentriert, vergrößerte Abstände, Hero-Bilder vollrandlos |

### Touch-Ziele

- Minimales Touch-Ziel: 44x44px (WCAG AAA)
- Mobile Nav-Icons: 48x48px Berührungsfläche
- Produktkarten: gesamte Fläche ist antippbar
- Filter-Pills: mindestens 36px Höhe mit 12px-Padding

### Kollaps-Strategie

- **Navigation**: Vollständige Kategorielinks → Hamburger-Menü unter 960px; Suche, Favoriten, Warenkorb-Icons bleiben sichtbar
- **Produktraster**: 3-spaltig → 2-spaltig bei 960px → 1-spaltig bei 640px
- **Hero-Abschnitte**: Display-Text skaliert von 96px → 64px → 48px; Hero-Bilder bleiben bei allen Größen randlos
- **Kategorie-Karten**: 3-spaltig → 2-spaltig → 1-spaltig mit beibehaltener randloser Fotografie
- **Abschnitts-Padding**: 80px → 48px → 32px → 24px mit schmaler werdendem Viewport
- **Werbebanner**: Text umbricht oder wird abgeschnitten, dunkler Hintergrund bleibt erhalten

### Bildverhalten

- Responsive Bilder über Nike CDN (`c.static-nike.com`) mit Breiten-Parametern
- Produktbilder: srcset mit mehreren Auflösungen (w_320, w_640, w_960, w_1920)
- Hero-Bilder: randlos bei allen Breakpoints, Seitenverhältnis wechselt (16:9 Desktop → 4:3 Mobil)
- Lazy Loading: natives loading="lazy", grey-100-Platzhalter während des Ladens
- Art Direction: Hero-Ausschnitte wechseln zwischen Desktop- und Mobil-Komposition

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz

- Primärer CTA: Nike Black (`#111111`)
- Hintergrund: Weiß (`#FFFFFF`)
- Sekundäre Fläche: Light Gray (`#F5F5F5`)
- Überschriftentext: Nike Black (`#111111`)
- Fließtext / Hover: Secondary Text (`#707072`)
- Rahmen: Border Secondary (`#CACACB`)
- Fehler: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Beispiel-Komponentenprompts

- „Erstelle einen Produkt-Hero-Abschnitt mit randloser, kantenbündiger Fotografie, kein Border-Radius, einem dunklen Verlaufs-Overlay für Text und einer massiven 96px/500-Headline in Großbuchstaben im Nike-Futura-Stil mit 0.90-Zeilenabstand und einem Nike-Black-Pill-Button (#111111, 30px Radius)"
- „Gestalte ein 3-spaltiges Produktkarten-Raster mit quadratischen Bildern (kein Border-Radius), 4px-Abstand zwischen Karten, Produktname in 16px/500 Nike Black (#111111), Preis in 14px/500 und Sekundärtext in Grey-500 (#707072)"
- „Baue eine sticky weiße Navigationsleiste mit linksbündigem Logo, zentrierten Kategorielinks in 16px/500 (#111111) mit Hover-Farbe #707072 und rechtsbündiger Suche (24px-Radius, #F5F5F5-Hintergrund), Favoriten- und Warenkorb-Icons"
- „Erstelle einen Werbebannerstreifen mit #111111-Hintergrund, weißem 12px/500-zentriertem Text und 8px-vertikalem Padding — volle Breite, kein Border-Radius"
- „Gestalte einen sekundären Outlined-Button mit transparentem Hintergrund, 1.5px-#CACACB-Rahmen, 30px-Pill-Radius, 16px/500-#111111-Text, Hover-Rahmen dunkelt zu #707072"

### Iterations-Leitfaden

Beim Verfeinern bestehender Screens, die mit diesem Design-System erstellt wurden:
1. Konzentriere dich auf EINE Komponente gleichzeitig
2. Referenziere spezifische Farbnamen und Hex-Codes aus diesem Dokument
3. Denke daran: Produktfotografie ist die Farbe — die UI bleibt monochrom
4. Verwende die Grau-Skala für Zustandsänderungen: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Wenn etwas in der UI zu farbig wirkt, ist es das wahrscheinlich — Nike hält die UI in Graustufen
6. Display-Schrift (Nike Futura) sollte IMMER in Großbuchstaben sein und nie unter 24px
7. Fließtext (Helvetica Now) sollte für interaktive Elemente fast immer Gewicht 500 haben
