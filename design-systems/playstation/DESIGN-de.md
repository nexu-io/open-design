# Design System Inspired by PlayStation

> Category: Medien & Verbraucher
> Gaming-Konsolen-Retail. Dreiflächen-Kanal-Layout, ruhig-autoritärer Display-Schriftsatz, Cyan-Hover-Skalierung.

## 1. Visuelles Thema & Atmosphäre

PlayStation.com tritt auf wie die Marketingabteilung einer Premium-Unterhaltungselektronikmarke, die nebenbei Entertainment verkauft. Die Seite ist als **vertikaler Kanal mit abwechselnden Oberflächen** organisiert: ein nahezu schwarzer Masthead und Hero, eine Abfolge von papierweiß gehaltenen Editorial-Panels in der Mitte und ein tief-kobaltblauer Footer, der das gesamte Erlebnis verankert. Zwischen diesen Oberflächenmodi setzt die Site stark auf Fotografie und 3D-Produktrenderings — die PS5-Konsole, Spielcover-Art, DualSense-Controller — und lässt die Hardware die emotionale Arbeit leisten, während das Chrome zurückhaltend bleibt.

Der typografische Markenzug ist **SST Light (Stärke 300) in großen Größen**. Sonys maßgeschneiderte SST-Familie wird von 22px bis 54px in Stärke 300 eingesetzt und verleiht Display-Headlines eine geflüsterte, elegante Qualität, die eher an eine Luxusuhr-Anzeige als an einen Spieleladen erinnert. Diese „ruhige Autorität" ist das genaue Gegenteil von The Verges Manuka-Schrei oder Wireds Kioskdichte — PlayStation möchte, dass die Schrift zurücktritt und das Produkt führt. Body und UI setzen auf Stärken 500–700, aber die *Display*-Stimme ist durchgängig schlank und ruhig.

Der einzige Bereich, in dem die Zurückhaltung bricht, ist die **Interaktion**. Jeder primäre Button hat dieselbe Hover-Bewegung: Die Füllung wechselt zu einem elektrischen Cyan `#1eaedb`, ein 2px weißer Rand erscheint, ein 2px PlayStation-blauer Außenring entfaltet sich dahinter, und der gesamte Button **skaliert auf 1.2×**. Diese Kombination aus Farbpop, Rand, Ring und Lift-Skalierung ist ein Markenzug, einzigartig für Sony unter den großen Marken — eine miniaturhafte „Power-On"-Animation, die die Site hunderte Male auf einer einzigen Seite wiederholt.

**Wesentliche Merkmale:**
- Dreiflächen-Kanal-Layout: nahezu schwarzer Hero, papierweiß gehaltener Content, kobaltblauer Footer — abwechselnd, niemals übergehend
- SST Stärke 300 bei 22–54px für Display — Headlines mit „ruhiger Autorität", die Produktfotografie in den Vordergrund stellen
- PlayStation Blue `#0070cc` als Markenanker; Cyan `#1eaedb` ausschließlich für Hover-/Fokus-Zustände reserviert
- Jedes interaktive Element skaliert bei Hover auf 1.2× — ein signaturhafter „Power-On"-Lift, einzigartig für PlayStation
- Pill-Buttons mit vollem 999px-Radius; Karten-Art in abgerundeten 12–24px-Rechtecken
- Commerce-Orange `#d53b00` ausschließlich für PlayStation Store / Kauf-CTAs
- Breite Breakpoint-Abdeckung bis 2120px — die Site skaliert bis in 4K-TV-Browser-Kontexte

## 2. Farbpalette & Rollen

### Primär (Markenanker)
- **PlayStation Blue** (`#0070cc`): Die Ankerfarbe der Marke. Verwendet im primären Footer, für Inline-Links, primäre Button-Füllungen auf dunklen Flächen und jeden „offiziellen" Marker. Als unveränderlich behandeln — es ist die Farbe, mit der die Marke im Verbrauchergedächtnis am stärksten assoziiert wird.
- **Console Black** (`#000000`): Reines Schwarz für den Masthead, Hero-Hintergründe und Produktpräsentationszonen. PlayStation nutzt Schwarz, um Hardware zu rahmen, wie ein Museum Schwarz verwendet, um eine Skulptur zu rahmen.

### Sekundär & Akzent
- **PlayStation Cyan** (`#1eaedb`): Die Interaktionsfarbe. NUR auf Hover-, Fokus- und aktiven Zuständen von Buttons und Links angewendet. Erscheint nie als Standard-Hintergrund oder Textfarbe im Ruhezustand. Im Hover mit einem 2px `#ffffff`-Rand und einem 2px `#0070cc`-Außenring für das vollständige Signatur-Treatment kombinieren.
- **Link Hover Blue** (`#1883fd`): Die hellere Variante, die bei Inline-Textverlinkungen im Hover verwendet wird. Unterscheidet sich von Cyan — dies ist die Link-Farbe, Cyan ist die Button-Farbe.
- **Dark Link Blue** (`#0068bd`): Die Link-Farbe im Ruhezustand auf hellen Flächen — ein etwas gesättigterer Cousin des Markenblaus.

### Fläche & Hintergrund
- **Paper White** (`#ffffff`): Primäre Inhalts-Leinwand für Editorial-Panels zwischen Masthead und Footer.
- **Ice Mist** (`#f5f7fa`): Der atmosphärische Endpunkt des hellen Abschnitts-Gradienten. Dezent hinter bestimmten Panels eingesetzt, um sie vom reinen Weiß abzuheben.
- **Divider Tint** (`#f3f3f3`): Die unauffällige horizontale Trennfarbe zwischen Inhaltsreihen.
- **Masthead Black** (`#000000`): Obere Navigation und Hero-Leinwand — für produktorientierte Zonen reserviert.
- **Shadow Black** (`#121314`): Der Startanker des dunklen Abschnitts-Gradienten, wenn ein Panel atmosphärische Tiefe benötigt.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Transluzenter Hintergrund für fixierte Filterleisten — der einzige „Glassmorphismus"-Moment auf der Site.

### Neutraltöne & Text
- **Display Ink** (`#000000`): Primäre Display-Headlines auf weißen Flächen.
- **Deep Charcoal** (`#1f1f1f`): Body-Headlines und Link-Farbe im Ruhezustand — etwas weicher als reines Schwarz, um den visuellen Ring bei großen Textblöcken zu reduzieren.
- **Body Gray** (`#6b6b6b`): Sekundärer Body-Text und Metadaten.
- **Mute Gray** (`#cccccc`): Tertiäre Labels, deaktivierte Zustände.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Formular-Platzhaltertext — 60% Schwarz, kein separater Grauwert.
- **Inverse White** (`#ffffff`): Primärtext auf dunklen und blauen Flächen.
- **Dark-Link Blue** (`#53b1ff`): Die Link-Farbe im Ruhezustand auf dunklen/schwarzen Flächen — eine hellere, luftige Variante des PlayStation Blue für Lesbarkeit auf Schwarz.

### Semantisch & Commerce
- **Commerce Orange** (`#d53b00`): Reserviert für PlayStation Store-Kauf-CTAs, Preishinweise und „Im Angebot"-Badges. Die einzige Warmfarbe auf der Site — sparsam einsetzen und niemals außerhalb eines Commerce-Kontexts verwenden.
- **Commerce Orange Active** (`#aa2f00`): Der gedrückte/aktive Zustand von Commerce-Buttons.
- **Warning Red** (`#c81b3a`): Formularfehler und Warnungen bei destruktiven Aktionen.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Die dramatische Schirmschicht hinter Hero-Text auf Produktfotografien.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Leichtgewichtiger Erhöhungsring auf Karten.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Federleichte Karten-Erhöhung — kaum sichtbar, trennt aber weiße Panels vom weißen Hintergrund.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): Der leichteste Schatten im System.

### Gradientensystem
PlayStation verwendet **zwei Abschnitts-Gradienten** und nichts sonst:
- **Light Section Gradient**: von `#ffffff` → `#f5f7fa` — ein nahezu unmerklicher Wash, der ein Panel still von der Leinwand abhebt.
- **Dark Section Gradient**: von `#121314` → `#000000` — ein kurzer vertikaler Wash, der Hero-Panels eine dezente Vignette verleiht, ohne eine Farbverschiebung einzuführen.

Beide Gradienten werden **ausschließlich als Abschnittshintergründe** verwendet, niemals innerhalb von Komponenten. Es gibt keine Gradienten-Buttons, keinen Gradiententext, keine leuchtenden Halos. Die Marke ist blau — nicht Blau-zu-Lila, nicht Blau-zu-Cyan.

## 3. Typografieregeln

### Schriftfamilie
- **SST** / **Playstation SST** (Sony, proprietär) — Fallback: `Arial`, `Helvetica`. Sonys maßgeschneiderte globale Schrift, entworfen von Toshi Omagari und Akira Kobayashi. Deckt die Stärken 300 / 500 / 600 / 700 auf der Homepage ab. Die Stärke **300 bei 22–54px** ist PlayStations typografische Signatur.
- **SST (condensed / alternate)** — Fallback: `helvetica`, `arial`. Eine komprimierte Variante, die in einigen UI-Modulen eingesetzt wird, wo Breite eine Rolle spielt.
- **Arial** — Utility-Fallback für die seltene Button-Variante, die in System-Sans rendert.

### Hierarchie

| Rolle | Schrift | Größe | Stärke | Zeilenhöhe | Buchstabenabstand | Hinweise |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Der größte SST-Moment auf der Seite — Luxus-Headline in ruhiger Stärke |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Sekundäre Hero-Headlines |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Feature-Panel-Headlines |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Abschnittsüberschriften |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Modultitel — noch in der leichten Stärke 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Werblicher Sub-Heading |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Kompakte UI-Überschriften |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Primäres Button-Label |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | Stärker betonte CTAs (Kaufen, Abonnieren) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Sekundäres Button-Label |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Standardmäßiger Lesetext |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Inline-Linktext |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini-CTAs in Karten |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Bildunterschriften, Tag-Labels |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Standard-Metadaten |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Betonte Bildunterschrift |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Halbfette Bildunterschrift |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | UI-Button mit engem Zeilenabstand |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Tab-/Pill-Label |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Kleinste UI-Bildunterschrift |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Footer-Mikrokopie, Rechtstexte |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Betonter Mikrotext |

### Grundsätze
- **Stärke 300 in großen Größen ist die Stimme.** PlayStation ist die einzige große Konsolen-Marke, die eine leichte Display-Schrift für ihre Hero-Headlines verwendet. Der Versuchung widerstehen, den Display-Schriftsatz auf 500 oder 700 zu „upgraden" — die Ruhe ist die Persönlichkeit.
- **Stärkewechsel auf der UI-Ebene.** Unterhalb von 18px wechselt das System zur Lesbarkeit auf 500–700. Der Stärkegradient von 300 (Display) → 400 (Body) → 500 (Bildunterschriften) → 700 (Buttons) ist die Hierarchie.
- **Buchstabenabstand ist kaum wahrnehmbar.** Die meisten Werte liegen bei 0.1–0.45px, positiv oder leicht negativ. Der `-0.1px`-Wert beim 54px-Hero zieht den Display-Schriftsatz gerade so weit zusammen, dass er als „designed" wirkt, ohne zur typografischen Aussage zu werden.
- **Zwei SST-Schreibweisen.** „SST" und „Playstation SST" sind funktional dieselbe Familie mit leicht unterschiedlichen Metriken (Playstation SST ist bei kleinen Größen kompakter). Für Zwecke außerhalb von Sonys interner Lizenzierung als austauschbar behandeln.
- **Kein Großbuchstaben-Text.** Anders als The Verge oder Wired verwendet PlayStation selten GROSSBUCHSTABEN-Labels. Kicker und Tags bleiben in Groß-/Kleinschreibung oder Satzzweig — ein weiterer Zug „ruhiger Autorität".
- **Nirgendwo Serifenschrift.** Das gesamte System ist Sans-Serif. Es gibt keinen Druckstimmen-Gegenpunkt.

## 4. Komponentenstile

### Buttons

**Primär — PlayStation Blue Pill**
- Hintergrund: `#0070cc` (PlayStation Blue)
- Text: `#ffffff`, SST 18px / 500 / 0.4px Tracking
- Rand: keiner im Ruhezustand
- Randradius: `999px` — vollständige Pill
- Padding: ~`12px 24px` (variabel je nach Größenklasse)
- Outline: `rgb(255, 255, 255) none 0px` im Ruhezustand
- **Hover (Signatur-Bewegung)**:
  - Hintergrund füllt sich mit `#1eaedb` (PlayStation Cyan)
  - Text bleibt `#ffffff`
  - 2px `#ffffff`-Rand erscheint
  - 2px `#0070cc`-Außenring-Schatten entfaltet sich (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — der Button wächst tatsächlich um 20%
- Aktiv: `opacity: 0.6` — eine kurze Abdunkelung als Drucksignal
- Fokus: Wie Hover, aber der Ring wird zu `rgb(0, 114, 206) 0px 0px 0px 2px` Fokus-Schatten
- Übergang: ~180ms ease auf Hintergrund, Transform und Schatten

**Sekundär — Weiße Outline auf Dunkel**
- Hintergrund: `#ffffff`
- Text: `#0172ce` (PlayStation Blue-Variante)
- Rand: `2px outset #000000` — ein echter `outset`-Rand, der in modernem CSS äußerst selten ist
- Radius: variiert (oft `999px` oder `36px`)
- Padding: `16px 20px`
- Hover: dieselbe Signatur-Cyan-Füllung + scale(1.2) + Ring-Treatment
- Fokus: dasselbe Ring-Treatment

**Commerce Orange**
- Hintergrund: `#d53b00` (Commerce Orange)
- Text: `#ffffff`, SST 18px / 700 / 0.45px Tracking
- Randradius: `999px` — Pill
- Nur bei PS Store / Kaufen / Subscribe Plus CTAs verwendet
- Aktiv: Hintergrund wird dunkler zu `#aa2f00`
- Hover: folgt wie alle anderen Buttons der Cyan-Invert-Regel (KEIN orange-spezifischer Hover)

**Transparent Ghost**
- Hintergrund: transparent
- Text: `#1f1f1f` (Deep Charcoal)
- Rand: `1px solid #dedede`
- Padding: `0 10px` (kompakt, navigationsoptimiert)
- Hover: Cyan-Füllung, weißer Text, 2px weißer Rand, scale(1.2)
- Aktiv: Text wechselt zu `#0072ce`, opacity 0.6

**Icon Circle**
- Hintergrund: `rgba(0, 0, 0, 0.2)` auf Fotografie; `#ffffff` auf hellen Flächen
- Randradius: `100%` — perfekter Kreis
- Verwendet für Karussell-Vor-/Zurück-Pfeile und Share-Buttons
- Hover: hellt auf zu `var(--color-role-backgrounds-primary-link-hover)` (ungefähr `#e5e5e5` auf hell)

**Mini CTA (In-Karte)**
- SST 14px / 700 / 0.324px Tracking
- Padding ~8px 16px
- Radius: `999px`
- Innerhalb von Spielkarten für „Jetzt kaufen" / „In den Warenkorb" Mini-CTAs verwendet

### Karten & Container

**Hero Card (Spielfeature)**
- Hintergrund: Fotografie/Rendering — meist schwarz verankert
- Randradius: `24px` oder `19px` für Feature-Karten
- Padding: 32–48px innen
- Schatten: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — ein dramatischer Drop-Shadow, nur verwendet, wenn eine Karte über der Hero-Fotografie liegt
- Hover: dezente Skalierungstransformation, Cyan-Outline erscheint am primären CTA

**Game Cover Tile**
- Hintergrund: Spielcover-Art, ohne Padding
- Randradius: `12px` oder `13px` (Bilder) / `19px` (Kartenrahmen)
- Schatten: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — federleichte Erhöhung
- Hover: Der primäre CTA der Karte leuchtet cyan auf, die Karte selbst kann auf 1.02× skalieren
- Übergang: 200ms ease auf Transform

**Content Panel (Weiß)**
- Hintergrund: `#ffffff` oder der helle Abschnitts-Gradient `#ffffff → #f5f7fa`
- Rand: typischerweise keiner; durch Abstände und dezente Schatten von Nachbarn getrennt
- Radius: `12px`–`24px` je nach Panel-Hierarchie
- Schatten: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — der leichteste im System

**Dark Card on Dark**
- Hintergrund: `rgba(0, 0, 0, 0.2)` über Fotografie
- Randradius: `6px` (kompakt) oder `24px` (Feature)
- Für „Pressemappe"- oder „Statistikblock"-Einlagen über Hero-Video verwendet

### Eingaben & Formulare
- **Standard**: `#ffffff`-Hintergrund, `1px solid #cccccc`-Rand, `3px`-Randradius (enger als der Rest des Systems — Eingaben sind der einzige Bereich, wo PlayStation wirklich kompakt wird), SST 16px Text in `#1f1f1f`, Platzhalter `rgba(0, 0, 0, 0.6)`.
- **Fokus**: 2px `#0070cc`-Fokusring via `box-shadow: 0 0 0 2px #0070cc`. Keine Randfarbenänderung — der Ring übernimmt die Arbeit.
- **Fehler**: Rand und Text wechseln zu `#c81b3a` (Warning Red), inline Fehlertext darunter in derselben Rotfarbe.
- **Übergang**: ~180ms ease auf Rand und Schatten.

### Navigation

- **Obere Navigation**: schwarzer (`#000000`) vollblütiger Streifen mit dem PlayStation-Logo (weiß) linksbündig, Kategorielinks mittig in SST 14–16px / 500 und ein kleines „Anmelden"-CTA rechtsbündig.
- **Hover auf Navigationslink**: Farbe wechselt von `#ffffff` zu `#1883fd` (Link Hover Blue), keine Unterstreichung.
- **Aktiver Abschnitt**: durch eine dezente 2px-Unterstreichung in `#0070cc` markiert.
- **Mobil**: Navigation faltet sich zu einer Hamburger-Schublade. Innerhalb der Schublade werden Links vertikal mit 16px-Abständen und 20px horizontalem Padding gestapelt.
- **Fixiertes Verhalten**: Die Navigation bleibt beim Scrollen oben fixiert; wenn sie eine helle Oberflächenzone betritt, **kehrt sie sich nicht um** — sie bleibt durchgehend mit schwarzem Hintergrund.

### Bildbehandlung

- **Seitenverhältnisse**: 16:9 Hero-Video/Fotografie, 1:1 Konsolen-Renderings, 3:4 Spielcover-Art, 4:3 Lifestyle-Bildmaterial.
- **Ecken**: abgerundet auf `12px`, `13px` oder `24px` je nach Kartenkontext. Spielcover erhalten `6–12px`, Hero-Bilder erhalten `24px`.
- **Vollblut**: nur im Masthead-Hero und Footer-Werbebannern. Alles andere sitzt innerhalb einer mit Padding versehenen Inhaltsspalte.
- **Schatten**: dramatischer `rgba(0, 0, 0, 0.8) 0 5px 9px 0`-Drop auf Heroes, Feder `rgba(0, 0, 0, 0.06) 0 5px 9px 0` auf Gitterkacheln.
- **Hover**: Bild bleibt statisch, Kartenrahmen und primäres CTA reagieren.
- **Lazy Loading**: `loading="lazy"` auf allem unterhalb der Falte, `eager` beim Masthead-Hero.

### Game Store Pill (Markant)
- Hintergrund: `#ffffff`
- Text: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — vollständige Pill
- Ein neutrales Pill-Tag, das neben Spielcovern sitzt, um Plattformen zu beschriften („PS5", „PS4", „PSVR2"). Weiß-auf-Dunkel-Kontrast.

## 5. Layoutprinzipien

### Abstandssystem
- **Basiseinheit**: 8px.
- **Skala**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Abschnittspading**: 48–96px vertikal zwischen Hauptpanels. Hero-zu-Inhalt-Übergänge nutzen das obere Ende.
- **Kartenpading**: 20–32px innen. Feature-Hero-Karten können auf 48px erweitert werden.
- **Inline-Abstände**: 8–12px zwischen Überschrift und Deck, 12–16px zwischen Deck und CTA.
- **Mikroskala**: Die Werte 1/2/3/4.5/5/9/10/12 werden für Pill-Padding, Bildunterschriften-Abstände und Randversätze verwendet — nicht für den redaktionellen Rhythmus.

### Raster & Container
- **Maximale Breite**: ~1920px (dembrandt hat Breakpoints bis 2120px erkannt). Container-Caps typischerweise bei `1280–1920px` je nach Panel.
- **Spaltenmuster**: Responsives 12-Spalten-Raster, das sich je nach Hierarchie in 3/4/6-spaltige Spielkachelreihen auflöst. Hero-Zonen überspannen oft 12 Spalten; vorgestellte Kacheln sitzen in 6+3+3- oder 4+4+4-Konfigurationen.
- **Außenpadding**: 16px mobil → 48px Tablet → 64–96px Desktop.
- **Rinnen**: 16–24px zwischen Spalten, enger (8–12px) innerhalb von Kachelclustern.

### Weißraum-Philosophie
PlayStation behandelt Weißraum wie eine Luxusmarke die Ladenbeleuchtung — als Premiumsignal. Es gibt merklich mehr vertikalen Atemraum zwischen Modulen als auf jeder anderen großen Retail-Site, und die weißen Editorial-Panels halten oft nur eine Überschrift + ein Bild + einen CTA bei Hero-Scale-Padding. Das Ergebnis ist ein „Galerietempo", bei dem jedes Produkt seinen eigenen Raum erhält, anstatt in einem Raster aus Thumbnails zu konkurrieren.

### Eckenradius-Skala
- **2px** — Cookie-Banner-Buttons und kleines Admin-UI
- **3px** — Formulareingaben, Tab-Panels (enger als alles andere — ein bewusstes „Funktionale UI"-Signal)
- **6px** — kompakte Buttons und Inline-Bilder
- **12px** — Standard-Spielcover-Bilder und Inhaltsbilder
- **13px** — bestimmte Figure-Wrapper (1px-Versatz von 12px für Verschachtelung)
- **19px** — Feature-Karten
- **20px** — Inline-Tag-Spans
- **24px** — Hero-Karten, primäre Feature-Rahmen
- **36px** — Full-Pill-Navigation und sekundäre Button-Varianten
- **48px** — große Feature-Buttons
- **999px / 100%** — vollständige Pill-Primärbuttons und kreisförmige Icon-Buttons

Elf diskrete Radiuswerte — eines der reichhaltigsten Radius-Systeme aller Sites in diesem Katalog. Diese Bandbreite existiert, weil PlayStation bewusst unterschiedliche Radien für unterschiedliche *Hierarchien* verwendet: 3px für Utility, 12px für Medien, 24px für Features, 999px für CTAs.

## 6. Tiefe & Erhöhung

| Ebene | Treatment | Verwendung |
|---|---|---|
| 0 | Kein Schatten | Standardinhalt auf `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Federleichte Anhebung redaktioneller Panels |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Standarderhöhung von Gitterkacheln |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Betonte Karte (Hover oder aktiv) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Hero-Overlay-Schatten — dramatischer Drop über Fotografie |
| 5 | `0 0 0 2px #0070cc` (Fokusring) | Fokuszustand des primären Buttons |
| 6 | `0 0 0 2px #000000` (Hover-Ring) | Hover-Ring des sekundären Buttons |
| 7 | Abschnitts-Gradient `#121314 → #000000` | Atmosphärische Tiefe auf dunklen Hero-Panels |

PlayStations Tiefenphilosophie ist **geschichtet, aber zurückhaltend**. Die Schatten-Skala läuft von 0.06 bis 0.16 für Normalzustände und springt dann für Hero-Drops auf 0.8 — es gibt keine Mittelwerte bei 0.2, 0.3, 0.4. Das Ergebnis ist, dass der größte Teil der Seite fast flach wirkt, aber wenn eine Hero-Karte über Fotografie schweben muss, *schwebt* sie tatsächlich. Erhöhung wird entweder geflüstert oder gerufen, nie gebrummelt.

### Dekorative Tiefe
- **Abschnitts-Gradienten** (dunkel und hell, beide oben beschrieben) — nur als Abschnittshintergründe verwendet
- **Fokus-/Hover-Ringe** bei 2px, immer blau oder cyan je nach Zustand
- **Keine Glows, Unschärfen oder atmosphärische Effekte** außer den zwei Abschnitts-Gradienten
- **Keine Gradienten-Buttons oder -Text** — das visuelle System besteht überall aus einfarbigen Blöcken, außer bei Abschnittsübergängen

## 7. Dos und Don'ts

### Do
- **Do** PlayStation Blue (`#0070cc`) als primäre CTA-Füllung und Footer-Anker verwenden. Es ist die Ankerfarbe der Marke.
- **Do** SST Stärke 300 für jede Display-Überschrift ab 22px und größer verwenden. Die leichtgewichtige Überschrift ist die Stimme.
- **Do** die vollständige Hover-Signatur auf jeden primären Button anwenden: Cyan-Füllung + 2px weißer Rand + 2px blauer Außenring + `scale(1.2)`.
- **Do** vollständigen Pill-Radius (`999px`) auf primären und Commerce-Buttons verwenden.
- **Do** PlayStation Cyan (`#1eaedb`) ausschließlich für Hover-, Fokus- und aktive Zustände reservieren — niemals als ruhenden Hintergrund.
- **Do** Commerce Orange (`#d53b00`) nur für PlayStation Store / Kauf-CTAs und Preishinweise verwenden.
- **Do** dunkle Hero-Panels mit weißen Content-Panels abwechseln und mit einem tief blauen Footer verankern — das Dreiflächen-Kanal-Layout ist der Seitenrhythmus.
- **Do** dramatische `rgba(0, 0, 0, 0.8)` Hero-Drop-Shadows verwenden, wenn eine Karte über Produktfotografie liegt.
- **Do** die obere Navigation bei jeder Scroll-Position schwarz halten — sie kehrt sich nicht zu Weiß über hellen Panels um.

### Don't
- **Don't** Display-Überschriften fett gestalten. Stärke 300 bei 22–54px ist die PlayStation-Stimme. Stärke-700-Display-Schrift wirkt wie „ein weiterer Spielhändler".
- **Don't** GROSSBUCHSTABEN-Labels oder Kicker verwenden. PlayStation nutzt selten Großbuchstaben — es ist eine Marke mit ruhiger Autorität, keine Gefahrenband-Marke.
- **Don't** Gradienten-Buttons, -Text oder -Hintergründe außerhalb der zwei deklarierten Abschnitts-Gradienten verwenden.
- **Don't** Warmfarben außerhalb von Commerce Orange einführen. Keine roten CTAs, keine gelben Highlights, keine grünen Erfolgs-Pills.
- **Don't** eckige Ecken bei Buttons oder Medien verwenden. Das System hat elf Radien — einen wählen, aber niemals `0`.
- **Don't** die `scale(1.2)` Hover-Bewegung bei primären Buttons überspringen. Der Lift-Scale ist eine Marken-Interaktionssignatur.
- **Don't** Serifenschrift verwenden. Das System ist zu 100% SST sans.
- **Don't** zulassen, dass Cyan `#1eaedb` als Text- oder Hintergrundfarbe im Ruhezustand erscheint. Es existiert nur in Bewegung.
- **Don't** Panels gestalten, die um Aufmerksamkeit kämpfen. PlayStations Weißraum-Rhythmus gibt jedem Modul seinen eigenen „Galerieraum".

## 8. Responsives Verhalten

### Breakpoints

| Name | Breite | Wesentliche Änderungen |
|---|---|---|
| Small Mobile | <400px | Einzelspalte, Navigation faltet sich zum Hamburger, SST Hero skaliert auf ~28px |
| Mobile | 400–599px | Einzelspalte, Kacheln stapeln sich in voller Breite, Padding öffnet sich auf 16px |
| Large Mobile | 600–767px | Noch Einzelspalte, aber 2-spaltige Kacheloption in ausgewählten Modulen |
| Tablet Portrait | 768–1023px | 2-spaltiges Spielraster, Navigation noch komprimiert |
| Tablet Landscape | 1024–1279px | 3–4-spaltiges Raster, vollständige Navigation wiederhergestellt |
| Desktop | 1280–1599px | Vollständiges redaktionelles Raster, maximale Hero-Display-Skalierung (44–54px) |
| Large Desktop | 1600–1919px | Container-Cap bei 1600px, Ränder erweitern sich |
| 4K / Big-Screen | ≥1920px | Container erweitert sich auf maximal 1920px, Hero-Inhalt skaliert für TV-Betrachtungsabstand |
| Ultra-Wide | ≥2120px | Extremer Breakpoint — Seite bleibt verankert, äußere Ränder absorbieren zusätzliche Breite |

Der dembrandt-Sweep erkannte 30 Breakpoints zwischen 320px und 2120px — eine ungewöhnlich breite responsive Bandbreite. PlayStation optimiert speziell für **Großbildschirm-Kontexte** (1920–2120px), weil PS5-Besitzer häufig die Site über den Browser der Konsole oder per Cast-to-TV vom Smartphone auf Fernsehern durchsuchen. Die meisten Retail-Sites hören bei 1440px auf zu optimieren; PlayStation optimiert bis in 4K weiter.

### Touch-Ziele
- Primäre Pill-Buttons sind ~48–56px hoch (SST 18px Text + ~12–16px vertikales Padding) — komfortabel WCAG AAA.
- Navigationslinks sind auf dem Desktop kleiner (~32–40px hoch); auf Mobilgeräten werden sie innerhalb der Schublade auf 48px+ aufgefüllt.
- Icon-Kreis-Buttons sind 40–48px — touch-freundlich.

### Reduktionsstrategie
- **Navigation**: vollständige Navigation → komprimiert → Hamburger-Schublade bei schmaler werdendem Viewport. Logo bleibt links fixiert; CTA bleibt rechts fixiert.
- **Raster**: 6-Sp. → 4-Sp. → 3-Sp. → 2-Sp. → 1-Sp. Spielkachelkarten werden ohne Beschneidung der Cover-Art umgebrochen.
- **Abstände**: Abschnittspading wird von 96px → 64px → 48px → 32px → 24px bei schmaler werdendem Viewport gestrafft.
- **Schrift**: SST-Hero skaliert von 54px → 44px → 35px → 28px → 22px. Die leichte Stärke 300 wird bei jeder Größe beibehalten.
- **Hero-Fotografie**: Art-Direction-Swap — Desktop verwendet breite 16:9-Ausschnitte, Mobil verwendet 4:3- oder 1:1-Ausschnitte mit dem Produkt zentriert.

### Bildverhalten
- Responsives Raster (`srcset` + `<picture>` mit Art-Direction), Seitenverhältnisse per Breakpoint erhalten.
- 4K-bereit: Die Site liefert hochdichte Bilder ab 1920px, um Upscaling beim TV-Browsing zu vermeiden.
- `loading="lazy"` auf allem unterhalb der Falte; Hero ist `eager` mit einem Preload-Hinweis.

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- **Primäres CTA**: „PlayStation Blue (`#0070cc`)"
- **Hover / Fokus-Akzent**: „PlayStation Cyan (`#1eaedb`)"
- **Hintergrund (Weiße Fläche)**: „Paper White (`#ffffff`)"
- **Hintergrund (Dunkle Fläche)**: „Console Black (`#000000`)"
- **Überschriftentext auf Weiß**: „Display Ink (`#000000`)"
- **Bodytext auf Weiß**: „Deep Charcoal (`#1f1f1f`)"
- **Bodytext auf Schwarz**: „Inverse White (`#ffffff`)"
- **Commerce / Kauf-Akzent**: „Commerce Orange (`#d53b00`)"
- **Footer-Anker**: „PlayStation Blue (`#0070cc`)"

### Beispiel-Komponentenprompts
1. *„Erstelle einen primären CTA-Button mit einer `#0070cc` PlayStation Blue-Füllung, weißem Text in SST 18px / 500 / 0.4px Tracking, 999px Randradius, 12px × 24px Padding. Bei Hover wechselt der Hintergrund zu `#1eaedb` PlayStation Cyan, ein 2px `#ffffff`-Rand erscheint, ein 2px `#0070cc`-Außenring entfaltet sich via box-shadow, und der gesamte Button skaliert auf 1.2× — alles in einem 180ms ease-Übergang."*
2. *„Gestalte ein Hero-Panel auf einer `#000000` Console Black-Leinwand mit einer 54px SST Stärke 300 Überschrift in `#ffffff` mit -0.1px Buchstabenabstand und 1.25 Zeilenhöhe. Platziere darunter ein einzelnes primäres CTA mit dem Standard-PlayStation-Hover-Treatment. Nirgendwo GROSSBUCHSTABEN-Labels."*
3. *„Baue eine Spielcover-Kachel: 3:4-Seitenverhältnis-Bild mit 12px Randradius, federleichter `rgba(0, 0, 0, 0.08) 0 5px 9px 0`-Drop-Shadow, einem 14px SST 700-Titel darunter, einem 12px SST 500-Plattform-Tag und einem Mini-14px / 700 / 0.324px Tracking primärem CTA in PlayStation Blue."*
4. *„Erstelle einen Commerce-Pill-Button für einen PlayStation Store-Kauf: `#d53b00` Commerce Orange-Füllung, `#ffffff`-Text in SST 18px / 700 / 0.45px Tracking, 999px Radius, 12px × 28px Padding. Aktiver Zustand dunkelt zu `#aa2f00` ab. Hover folgt dem Standard-Cyan-Invert mit 1.2× Skalierung."*
5. *„Gestalte ein weißes Content-Panel zwischen dunklen Hero-Abschnitten: `#ffffff`-Hintergrund mit dem dezenten `#ffffff → #f5f7fa` hellen Abschnitts-Gradienten, 24px Randradius, 48px inneres Padding, federleichte `rgba(0, 0, 0, 0.06) 0 5px 9px 0`-Erhöhung, eine 35px SST 300-Überschrift, einen 18px-Bodyabsatz und ein einzelnes primäres CTA."*

### Iterationsleitfaden
Beim Verfeinern bestehender Screens, die mit diesem Design-System erstellt wurden:
1. **Display-Stärke prüfen.** Jede Überschrift ab 22px und größer sollte SST Stärke 300 sein. Wer Stärke 500 oder 700 auf Hero-Scale sieht, hat die PlayStation-Stimme verloren.
2. **Hover-Treatment prüfen.** Jeder primäre Button muss bei Hover auf 1.2× skalieren, mit der Kombination aus Cyan-Füllung + weißem Rand + blauem Ring. Fehlt einer dieser vier Punkte, bricht die Interaktionssignatur.
3. **Ecken prüfen.** Jeder Container und Button sollte auf 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 oder 999px / 100% landen. Eckige Ecken brechen die Stimme.
4. **Farbausbreitung prüfen.** Nur PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) und die deklarierten Grau-/Schwarz-/Weißtöne sollten im Chrome erscheinen. Wird ein anderer Farbton gesehen, korrigieren.
5. **Flächenwechsel prüfen.** Die Seite sollte zwischen dunklem Hero → weißem Inhalt → dunklem Hero → weißem Inhalt → blauem Footer wechseln. Sind zwei gleiche Flächen nebeneinander, einen Übergang einfügen.
6. **Schreibweise prüfen.** Nur Satz- und Titelschreibweise. Keine GROSSBUCHSTABEN-Labels, -Buttons oder -Kicker. Wird Großschreibung gesehen, umwandeln.
7. **Schattengewicht prüfen.** Schatten-Deckkraft sollte auf 0.06 / 0.08 / 0.16 / 0.8 landen — nichts dazwischen. Werden Drop-Shadows bei 0.1, 0.2, 0.3, 0.5 gesehen, zur nächsten deklarierten Ebene korrigieren.
8. **Weißraum prüfen.** Wenn zwei Module „wettbewerberisch" wirken (um Aufmerksamkeit kämpfen), 48–96px vertikalen Atemraum hinzufügen. PlayStations Galerietempo-Rhythmus ist unverhandelbar.
