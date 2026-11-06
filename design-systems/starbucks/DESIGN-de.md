# Design System Inspired by Starbucks

> Category: E-Commerce & Einzelhandel
> Globale Kaffeeeinzelhandelsmarke. Vierstufiges Grünsystem, warme Crème-Leinwand, vollrunde Buttons.

## 1. Visuelles Thema & Atmosphäre

Das Design-System von Starbucks ist ein **warmes, selbstsicheres Retail-Flaggschiff**, das das Grün der Schürze aus den Filialen auf jede Oberfläche trägt. Die Leinwand wechselt zwischen einem neutral-warmen Crème (`#f2f0eb`) und einem keramischen Gebrochenweiß (`#edebe9`) – Farben, die auf echte Ladenmaterialien verweisen: Papierservietten, Café-Wände, Holzoberflächen – während das charakteristische **Starbucks-Grün** (`#006241`) den Markenmoment auf Hero-Bändern, CTAs und dem Rewards-Erlebnis verankert. Die Grüntöne kommen in vier kalibrierten Abstufungen (Starbucks, Accent, House, Uplift), die jeweils einer bestimmten Flächenrolle zugeordnet sind, und Gold (`#cba258`) erscheint ausschließlich bei Rewards-Status-Zeremonien – nicht als allgemeiner Akzent.

Typografie trägt den größten Teil der Markenstimme. Die hauseigene **SoDoSans**-Schrift (exklusiv für Starbucks) bespielt nahezu jede Oberfläche mit einem engen Letter-Spacing von `-0.16px` – sie wirkt selbstsicher und freundlich, ohne modemagazinartig streng zu sein. Ungewöhnlich: Die Rewards-Seite wechselt für bestimmte Headline-Momente zu einer warmen Serifenschrift (`"Lander Tall", "Iowan Old Style", Georgia`), die subtil an das nostalgische Gefühl einer Café-Kreidetafel erinnert. Und die Karriereseiten verwenden eine handgeschriebene Schrift (`"Kalam", "Comic Sans MS", cursive`) für persönliche Bechernamens-Akzente. Drei Schriften, drei Kontexte – das System ist diszipliniert darin, wann welche erscheint.

Die Flächen atmen durch abgerundete Geometrie. Jeder Button ist eine 50px-Vollpille. Karten erhalten einen 12px-Rundungsradius. Der schwebende „Frap"-CTA – ein kreisrunder 56px-Bestellbutton in Green Accent (`#00754A`) – ist die signierte Tiefengeste des Produkts: Er schwebt unten rechts mit einem mehrschichtigen Schatten-Stack (`0 0 6px rgba(0,0,0,0.24)` Basis + `0 8px 12px rgba(0,0,0,0.14)` Umgebung) und verdichtet sich beim Drücken über `scale(0.95)`. Elevationen sind ansonsten zurückhaltend – Kartenschatten bleiben bei einem geflüsterten Alpha von `0.14/0.24`, die globale Navigation erhält einen leisen dreilagigen Schatten-Stack. Das gesamte System fühlt sich an wie saubere Café-Beschilderung: lesbar, warm und nie laut.

**Wesentliche Merkmale:**
- Vierstufiges grünes Markensystem (Starbucks / Accent / House / Uplift), jeweils einer eigenen Flächenrolle zugeordnet – kein einheitliches „Markengrün"
- Gold ausschließlich für Rewards-Status-Momente reserviert; niemals als Allzweck-Akzent
- Warm-neutrale Leinwand (`#f2f0eb` / `#edebe9`) statt kaltem Weiß – verweist auf Café-Materialien
- Exklusive hauseigene Schrift (SoDoSans) mit engem Letter-Spacing `-0.16px` als universelle Markenstimme
- Kontextspezifische Schriftwechsel: Serifenschrift (Lander Tall) für Rewards, Handschrift (Kalam) für Karriere-Bechernamen
- Vollrunde Buttons (`50px` Radius) universell, `scale(0.95)` beim aktiven Drücken als charakteristische Mikrointeraktion
- Schwebender kreisrunder „Frap"-CTA (`56px`, Green-Accent-Füllung, mehrschichtiger Schatten-Stack) – das signierte Elevationselement des Produkts
- Geschenkkarten-Oberflächen als **fotografierte physische Produkte** gestaltet – jede Karte ist ein eigenständiges illustriertes Foto, keine generierte Grafik
- 12px-Kartenradius + flüsterartig weiche Schatten halten Inhaltskarten flach mit einem Hauch von Abhebung
- Rem-basierte Abstands-Skala verankert bei 1,6rem (~16px) = `--space-3`, hochskalierend bis 6,4rem (~64px)

**Farbblock-Seitenrhythmus:** Crème-Hero → weiße Inhaltsbereiche → dunkelgrünes (`#1E3932`) Feature-Band mit weißem Text → Crème-Nutzungszone → dunkelgrüner (`#1E3932`) Footer mit Gold-/Weißtext – eine espressodunkle Rahmung um den hellen Hauptteil.

## 2. Farbpalette & Rollen

**Analysierte Seiten:** Startseite, Rewards, Geschenkkarten, Produktdetail (Pink Energy Drink), Produkternährung (Cold Brew).

### Primär

- **Starbucks Green** (`#006241`): Das historische Markengrün. Verwendet für h1-Überschriften, primäre Bereichsheadlines auf der Rewards-Seite und als zentrales Markensignal, wo eine einzige dominante Farbe benötigt wird.
- **Green Accent** (`#00754A`): Ein etwas helleres, leuchtstärkeres Grün. Die primäre Füll-CTA-Farbe („Explore our afternoon menu", „See the spring menu") und die Füllung des schwebenden runden Frap-Buttons.
- **House Green** (`#1E3932`): Das tiefe, fast schwarze Markengrün. Footer-Oberfläche, Feature-Band-Hintergründe, dunkle Rewards-Status-Oberflächen und das Headline-„Free coffee is just the beginning"-Hero-Band auf der Rewards-Seite.
- **Green Uplift** (`#2b5148`): Ein sekundäres mitteltiefes Grün, sparsam für dekorative Akzente und Dunkelgradientenmomente eingesetzt.
- **Green Light** (`#d4e9e2`): Eine helle Minzwäsche für Formularvalidierungs-Zustandstöne und helle grüne Nutzungsoberflächen.

### Sekundär & Akzent

- **Gold** (`#cba258`): Fast ausschließlich für Rewards-Status-Zeremonien reserviert – Gold-Tier-Callouts, Partner-Badges (SkyMiles, Bonvoy) und Akzente mit Premium-Anmutung. Niemals eine Allzweck-Markenfarbe.
- **Gold Light** (`#dfc49d`): Weicheres Gold für Hintergrundwäschen auf Gold-Tier-Bereichen.
- **Gold Lightest** (`#faf6ee`): Crème-goldene Seitenoberflächen-Wäsche, verwendet unter Partner-Bereichen auf der Rewards-Seite – verbindet den Gold-Akzent mit dem warmen neutralen System.

### Oberfläche & Hintergrund

- **White** (`#ffffff`): Primäre Karten- und Modal-Oberfläche. Auch Kartenfüllung auf Geschenkkarten-Kacheln.
- **Neutral Cool** (`#f9f9f9`): Subtile kühl-graue Oberfläche für Dropdown-Menüs („Account"-Dropdown), Formular-Karten-Wraps und ruhige Nutzeroberflächen-Container.
- **Neutral Warm** (`#f2f0eb`): Die warme Crème als **primäre Seitenleinwand** für Rewards-Nutzungszonen und Hero-Bänder.
- **Ceramic** (`#edebe9`): Ein etwas wärmeres/dunkleres Crème für Zonentrennungen, sanfte Seitenbereichswäschen und das Rewards-Partner-Band.
- **Black** (`#000000`): Tiefes Tintenschwarz, reserviert für den dunklen CTA-Streifen am Seitenanfang („Join now") und Hochkontrast-Anmelde-Buttons in der oberen Navigation.

### Neutrale Töne & Text

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Primäre Überschriften- und Fließtextfarbe auf hellen Oberflächen. Kein reines Schwarz – ein 87%-Deckkraft-Schwarz, das wärmer wirkt.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Sekundärer/Metadaten-Text auf hellen Oberflächen.
- **Text White** (`rgba(255, 255, 255, 1)`): Primäre Überschriften-/Fließtextfarbe auf dunkelgrünen Oberflächen.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Sekundärtext auf dunkelgrünen Oberflächen – Footer-Link-Beschreibungen, Bildunterschriften.
- **Rewards Green** (`#33433d`): Ein dediziertes gedämpftes Schiefergrün, ausschließlich für Textblöcke auf der Rewards-Seite verwendet – eine etwas „staubigere" Lesefarbe als Text Black, die „Reward-Oberfläche" signalisiert, ohne vollständiges Starbucks-Grün zu verwenden.

### Semantisch & Akzent

- **Red** (`#c82014`): Fehler- und Destruktiv-Zustände (Formular ungültig, destruktive Aktionen).
- **Yellow** (`#fbbc05`): Warnzustand, klassischer Marken-Touch.
- **Green Light** (`#d4e9e2` bei 33% Deckkraft = `hsl(160 32% 87% / 33%)`): Hintergrundton für gültige Formularfelder.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Ungültiger Feldton auf Formularen.

### Schwarz/Weiß-Alpha-Leitern

Zwei parallele transparente Skalen für Überlagerung und Sekundärtextverwendung:
- `rgba(0,0,0,0.06)` bis `rgba(0,0,0,0.90)` in 10%-Schritten – für dunkle Überlagerungen auf hellen Oberflächen
- `rgba(255,255,255,0.10)` bis `rgba(255,255,255,0.90)` in 10%-Schritten – für helle Überlagerungen auf dunklen Oberflächen

### Gradientensystem

Keine strukturellen Gradienten-Token beobachtet. Die Oberflächenhierarchie ist durchgehend aus Volltonfarb-Blöcken aufgebaut – das System setzt auf seine fünfstufige Crème/Grün-Oberflächenpalette statt auf Gradienten.

## 3. Typografieregeln

### Schriftfamilie

- **Primär:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` – Starbucks' exklusive Unternehmensschrift, auf nahezu jeder Oberfläche verwendet
- **Lade-Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif` – was Nutzer sehen, bevor SoDoSans geladen ist
- **Rewards-Serifenschrift:** `"Lander Tall", "Iowan Old Style", Georgia, serif` – für bestimmte Headline-Momente auf der Rewards-Seite für ein warmes, redaktionelles Gefühl
- **Karriere-Handschrift:** `"Kalam", "Comic Sans MS", cursive` – ausschließlich für dekorative Bechernamen-Akzente auf Karriereseiten, in Anlehnung an die handgeschriebenen Namen auf Starbucks-Bechern

Keine OpenType-Stilsets explizit bei `:root` aktiviert.

### Hierarchie

| Rolle | Größe | Gewicht | Zeilenhöhe | Letter Spacing | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5,0rem / 80px | 400–600 | 1,2 | -0.16px | Größtes Rewards/Hero-Display |
| Jumbo (text-9) | 3,6rem / 58px | 400–600 | 1,2 | -0.16px | Sekundäre Hero-Überschriften |
| Hero Large (text-8) | 2,8rem / 45px | 400–600 | 1,2–1,5 | -0.16px | Landing-Bereich-Headlines |
| H1 | 24px | 600 | 36px | -0.16px | Primäre Überschrift in Starbucks-Grün |
| H2 | 24px | 400 | 36px | -0.16px | Bereichstitel mit normalem Gewicht in Text Black |
| Body Large | 19px | 400–600 | 33,25px (~1,75) | -0.16px | Hero-Einführungstext, Feature-Band-Fließtext |
| Body (text-3) | 1,6rem / 16px | 400 | 1,5 (24px) | -0.01em | Standardmäßiger Fließtext |
| Small (text-2) | 1,4rem / ~14px | 400–600 | 1,5 | -0.01em | Button-Beschriftung, Metadaten, Formular-Labels |
| Micro (text-1) | 1,3rem / ~13px | 400 | 1,5 | -0.01em | Aktiver Float-Label-Zustand, Bildunterschriften-Mikrotext |
| Button-Beschriftung | 14–16px | 400–600 | 1,2 | -0.01em | Alle Pill-Button-Beschriftungen |

**Letter-Spacing-Token:**
- `letterSpacingNormal`: `-0.01em` (Standard – eng, charakteristisch)
- `letterSpacingLoose`: `0.1em` (betonte Großbuchstaben)
- `letterSpacingLooser`: `0.15em` (Großbuchstaben-Stils-Labels, extreme Betonung)

**Zeilenhöhen-Token:**
- `lineHeightNormal`: `1,5` (Fließtext)
- `lineHeightCompact`: `1,2` (Display/Buttons)

### Prinzipien

- **Enges negatives Tracking (`-0.01em`)** wird nahezu überall angewendet – das gesamte Produkt wirkt leicht komprimiert, was SoDoSans seine selbstsichere Präsenz verleiht, ohne gequetscht zu wirken.
- **Gewichtsunterschiede tragen die Hierarchie, keine Größenunterschiede.** H1 und H2 teilen dieselbe Größe 24px/36px; nur Gewicht (600 vs. 400) und Farbe (Starbucks-Grün vs. Text Black) unterscheiden sie.
- **Größen-Token verwenden rem, verankert bei `1rem = 10px`** auf dieser Seite (über einen `font-size: 62.5%`-Root-Trick). Also `1.6rem` = 16px, `2.4rem` = 24px usw. Die Skala ist semantisch (textSize-1 bis textSize-10), keine beliebigen Pixelwerte.
- **Kontextspezifische Schriftwechsel** – Serifenschrift bei Rewards, Handschrift bei Karriere – sind bewusst und lokalisiert. Niemals innerhalb derselben Oberfläche mit dem primären Serifenlosen mischen.
- **Fließtext geht nie zu reinem Schwarz** – er liegt bei `rgba(0,0,0,0.87)`, um zur Temperatur der warm-neutralen Leinwand zu passen.

### Hinweis zu Schrift-Ersetzungen

SoDoSans ist exklusiv für Starbucks (lizenziert von House Industries, nicht öffentlich verfügbar). Sinnvolle Open-Source-Alternativen:
- **Inter** (Google Fonts) – ähnliche humanistische geometrische Proportionen, breite Gewichtsspanne
- **Manrope** – etwas runder, ähnlich selbstsicheres Gefühl
- **Nunito Sans** – wärmer, gute Café-Marken-Alternative

Bei Verwendung einer Alternative das enge `-0.01em` / `-0.16px` Tracking auf Lesbarkeit prüfen; bei manchen Open-Source-Schriften ist stattdessen `-0.005em` besser geeignet.

Lander Tall (die Rewards-Serifenschrift) ist eine Exklusivschrift – Open-Source-Alternativen: **Iowan Old Style** (bereits im Fallback), **Lora** oder **Source Serif Pro**. Kalam (Karriere-Handschrift) ist direkt auf Google Fonts verfügbar.

## 4. Komponenten-Styling

### Buttons

**1. Primär Gefüllt – „Explore our afternoon menu / Sign up for free"**
- Hintergrund: `#00754A` (Green Accent)
- Text: `#ffffff`
- Rahmen: `1px solid #00754A`
- Radius: `50px` (vollrunde Pille)
- Innenabstand: `7px 16px`
- Schrift: SoDoSans, 16px, Gewicht 600, Letter-Spacing `-0.01em`
- Aktiv-Zustand: `transform: scale(0.95)` über `--buttonActiveScale`
- Übergang: `all 0.2s ease`

**2. Primär Umrissen – „Give them a try / Start an order"**
- Hintergrund: transparent
- Text: `#00754A` (Green Accent)
- Rahmen: `1px solid #00754A`
- Gleicher Radius/Innenabstand/Aktiv-Zustand/Übergang wie Primär Gefüllt

**3. Schwarz Gefüllt – „Join now"**
- Hintergrund: `#000000`
- Text: `#ffffff`
- Rahmen: `1px solid #000000`
- Radius: `50px`, Innenabstand: `7px 16px`
- Schrift: 14px, Gewicht 600
- Verwendet im CTA-Streifen am Seitenanfang und bei ähnlichen Konversionsmomenten

**4. Dunkel Umrissen – „Sign in"**
- Hintergrund: transparent
- Text: `rgba(0, 0, 0, 0.87)` (Text Black)
- Rahmen: `1px solid rgba(0, 0, 0, 0.87)`
- Radius: `50px`, Innenabstand: `7px 16px`
- Schrift: 14px, Gewicht 600

**5. Grün-auf-Grün Invertiert – „See the spring menu"**
- Hintergrund: `#ffffff`
- Text: `#00754A`
- Rahmen: `1px solid #ffffff`
- Verwendet, wenn die Fläche hinter dem Button das dunkle House-Green-Band ist – weißer Button mit grünem Text statt gefüllter grüner Pille auf grünem Hintergrund

**6. Umrissen auf Dunkel – „Learn more / Order now"**
- Hintergrund: transparent
- Text: `#ffffff`
- Rahmen: `1px solid #ffffff`
- Verwendet auf dunkelgrünen Feature-Bändern als sekundäre Aktion, gepaart mit einem weiß gefüllten CTA

**7. Einwilligungs-Zustimmung (dunkelgrüne Variante)**
- Hintergrund: `rgb(0, 130, 72)` (eine spezifische Variantenfarbe im Cookie-Einwilligungs-Modul)
- Text: `#ffffff`
- Kein Rahmen, `50px` Radius, `7px 16px` Innenabstand, 14px / Gewicht 400
- Etwas heller als Green Accent – reserviert für die Zustimmen-Aktion im Einwilligungsbanner

**8. Frap – Schwebender kreisrunder Bestellbutton**
- Hintergrund: `#00754A` (Green Accent)
- Symbol: `#ffffff`
- Größe: `5.6rem / 56px` (Standard), `4rem / 40px` (Mini-Variante)
- Radius: `50%` (vollständiger Kreis)
- Feste Position unten rechts, `-0.8rem` Touch-Versatz für extra Tippkomfort
- Schatten-Stack: Basis `0 0 6px rgba(0,0,0,0.24)` + Umgebung `0 8px 12px rgba(0,0,0,0.14)`
- Aktiv-Zustand: Umgebungsschatten blendet auf `0 8px 12px rgba(0,0,0,0)` aus
- Dies ist das signierte Elevationselement des Produkts – es schwebt über jeder gescrollten Oberfläche

**9. Vollbreite Feedback-Reiter – „Provide feedback"**
- Hintergrund: `#00754A`
- Text: `#ffffff`
- Radius: `12px 12px 0px 0px` (nur oben abgerundet)
- Innenabstand: `8px 16px`
- Schrift: 14px, Gewicht 400
- Feste Position unten rechts, am Viewport-Rand befestigt

### Karten & Container

**Inhaltskarte (Standard)**
- Hintergrund: `#ffffff` (`--cardBackgroundColor`)
- Radius: `12px` (`--cardBorderRadius`)
- Schatten: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Verwendet für: Feature-Karten, Menüpunkt-Kacheln, Rewards-Status-Panels

**Geschenkkarten-Kachel**
- Hintergrund: Illustrierte Fotografie füllt die Karte (kein einfarbiger Hintergrund)
- Radius: ähnlich wie Karten (`~12px`, an den Ecken etwas enger)
- Schatten: leichter als Standardkarte – diese werden wie physische Karten auf der Leinwand behandelt
- Beschriftet nach Kategorie über dem Kartenraster (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Rewards-Status-Karten (Signatur der Rewards-Seite)**
- Dreierspaltiges Raster: Bronze / Gold / Silber – jeweils ein dunkelgrünes (`#1E3932`) Panel mit:
  - Farbigem Gradienten-/Farbkopfring
  - Nummeriertem „Level"-Badge
  - Status-Titel in großem SoDoSans Gewicht 600
  - Sterne / Vorteile-Liste in weißem/transluzentem weißen Text
  - Unterer „As you earn more stars…"-Fortschrittsunterschrift

**Partner-Karte (Rewards)**
- Hintergrund: `#faf6ee` (Gold Lightest) warme Crème-Oberfläche
- Inhalt: Partner-Logos („SkyMiles", „Bonvoy") zentriert, mit beschreibendem Text darunter
- Radius und Schatten folgen der Standard-Kartenspezifikation

**Dropdown-Menü (Account-Dropdown, obere Navigation)**
- Hintergrund: `#f9f9f9` (Neutral Cool)
- Menüpunkte bei `24px / Gewicht 400` in Text Black
- Kein Rahmen – nur Hintergrundflächenwechsel gegenüber weißer Navigation

**Modal**
- Innenabstand: `2.4rem` (`--modalPadding`)
- Oberer Innenabstand: `8.8rem` (`--modalTopPadding`) – lässt Platz für Schließen-Button / Header
- Kombinierter vertikaler Innenabstand: `11.2rem`
- Radius folgt der Kartenspezifikation (`12px`)

### Eingaben & Formulare

**Floating-Label-Eingabe**
- Label schwebt über dem Eingaberahmen, wenn fokussiert/ausgefüllt
- Desktop-Label-Schriftgröße: `1.9rem` Standard, animiert zu `1.4rem` im aktiven Zustand
- Mobil-Label-Schriftgröße: `1.6rem` Standard, animiert zu `1.3rem` im aktiven Zustand
- Horizontaler Label-Versatz: `12px` vom linken Rand
- Aktives Label-Translate: nach oben bis `-12px` mit `-50%`-Y-Translation
- Feld-Innenabstand: `12px`
- Horizontaler Formular-Innenabstand: `1.6rem`
- Validierung: gültiges Feld erhält `rgba(green-light, 0.33)`-Ton; ungültiges Feld erhält `rgba(red, 0.05)`-Ton
- Übergang: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` bei aktivierter Eingabe

**Options-Symbol (Checkbox/Radio)**
- Innenabstand: `3px`
- Verwendet die oben genannte checked-input-Cubic-Bezier-Animation (eine leicht „federnde" 2.32-Überschwing-Kurve)

### Navigation

**Globale Navigation (obere Leiste)**
- Feste Position mit progressiven Höhen: `64px` xs → `72px` mobil → `83px` Tablet → `99px` Desktop
- Schatten-Stack: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` – dreilagige weiche Abhebung
- Links: Starbucks-Wortmarken-Logo, versetzt um `99px` (md) / `131px` (lg) vom linken Rand
- Primäre Links inline in SoDoSans Gewicht 400–600: Menu · Rewards · Gift Cards
- Rechts: Filiale-finden-Link + Sign in (umrissen) + Join now (schwarz gefüllt)

**Unternavigation (zweite Leiste, z. B. interne Rewards-Navigation)**
- Höhe: `53px` (globale Unternavigation) / `48px` (interne Unternavigation)
- Typischerweise horizontale Tab-Gruppe unterhalb der globalen Navigation

**Mobile Navigation**
- Klappt unterhalb des Tablet-Breakpoints zu einem Hamburger-Drawer zusammen
- Schwebender Frap-Button bleibt unten rechts, unabhängig vom Navigationszustand

### Bildbehandlung

- **Hero-Fotografie**: Produktfotos (Getränke in klarem Glas mit farbigen Hintergründen – Koralle, Salbei, warmes Bernstein) belegen ca. 40vw eines Split-Hero-Layouts; Text belegt die anderen 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Geschenkkarten-Illustrationen**: Jede Karte ist ein eigenständiges illustriertes Foto (Malerei-Anmutung, handgezeichnet wirkend, warme Farbpalette). Niemals generische generierte Grafiken.
- **Rewards-Zeremonie-Bilder**: Fotos von Starbucks-Rewards-App-Bildschirmen, in der Hand gehalten, winklige Kompositionen – Produkt-im-Kontext-Fotografie.
- **Menü-Thumbnails**: Quadratische oder 4:3-Produktfotografie mit sauberen weißen/crèmefarbenen Hintergründen, leichter weicher Schlagschatten um das Glas.
- **Bildeinblenden**: `opacity 0.3s ease-in` Übergang beim Bildladen (`--imageFadeTransition`).

### Feature-Band (dunkelgrüner Hero-Streifen)

Vollbreites `#1E3932`-Band (House Green) mit:
- Links: weiße Überschrift + Unterzeile + CTA-Reihe
- Rechts: Produktfotografie oder Illustration
- Teilungsverhältnis ~40/60 oder 50/50 je nach Bereich
- Weißer Text durchgehend mit `rgba(255,255,255,0.70)` für sekundäre Texte
- CTAs folgen der Paarung Grün-auf-Grün Invertiert (weiß gefüllt) + Umrissen auf Dunkel (weißer Rahmen)

### Expander / Akkordeon

- Dauer: `300ms` (`--expanderDuration`)
- Timing-Kurve: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` – ein gleichmäßiges Ease-out
- Für FAQ-Bereiche auf Rewards- und Geschenkkarten-Seite verwendet

### Cookie-Einwilligungs-Modul

Dunkelgrüne Modal-Karte oben auf der Seite mit „Agree"-Button (grün gefüllt) und „Manage preferences"-Button (umrissen). Erscheint beim ersten Besuch; schließbar.

### Produktdetail-Komponenten (PDP-Signatur-Cluster)

Ein wiederkehrender Komponenten-Cluster auf Menü-Produktseiten (z. B. `/menu/product/40498/iced` für ein Getränkedetail, `/menu/product/.../nutrition` für Nährwertangaben). Diese erweitern das Komponenteninventar ohne Token-Änderungen.

**Größenauswahl**
- Horizontale Reihe mit 4 Becher-Symbol-Buttons (Tall / Grande / Venti / Trenta)
- Jedes Element: Becker-Silhouetten-Symbol oben, Größenname darunter (16/700 in Starbucks-Grün), Flüssigunzen-Unterschrift (13/400 in Text Black Soft)
- Aktiver Zustand: ein grüner kreisförmiger Ring-Umriss (`2px solid #00754A`) um das ausgewählte Becher-Symbol
- Inaktiv: kein Ring, gleiche Typografie
- Vollbreite Reihe, gleichmäßiger Abstand
- Container-Radius: `12px` oder flach; einzelne Symbole sind `50%` kreisförmig
- Innenabstand: `16px 24px`

**Add-in / Milch-Auswahl (umrahmtes Rechteck)**
- Hintergrund: `#ffffff`
- Rahmen: `1px solid #d6dbde` (Eingabe-Rahmen)
- Radius: `4px`
- Vollbreite in seiner Spalte
- Schwebender Label oberhalb des oberen Rahmens: „Add-ins" / „Milk" / „Add-ins" – 13/700 in Text Black, Großbuchstaben, `0.325px` Letter-Spacing
- Angezeigter Wert zentriert (z. B. „Ice", „Coconut", „Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Chevron-nach-unten-Symbol rechts in Text Black Soft
- Fokus: Rahmen wechselt zu Green Accent (`#00754A`)

**Numerischer Stepper**
- Eingebettet in eine Add-in-Zeile, wenn eine Menge erforderlich ist (z. B. Strawberry Fruit Inclusions scoop)
- `−`-Minus-Button + Zahl + `+`-Plus-Button, alle inline rechts des Labels
- Buttons: kreisförmig `32×32px` mit `1px solid #d6dbde` Rahmen, neutral-graues Symbol
- Zahl: 16/700 Text Black zentriert

**Anpassen-Button**
- Hintergrund: `#ffffff`
- Text: `#00754A` (Green Accent)
- Rahmen: `1.5px solid #00754A`
- Radius: `50px` (vollrunde Pille)
- Innenabstand: `14px 40px` (großzügiger als Standard-Pillen – dies ist eine sekundäre primäre Aktion)
- Beschriftung: „Customize" mit einem goldenen Funken-✨-Symbol links eingebettet
- Verwendet für: Einsteigen in den Getränke-Anpassungsfluss nach Größen-/Milchauswahl

**Zum-Bestellung-Hinzufügen-Button (PDP)**
- Hintergrund: `#00754A` (Green Accent)
- Text: `#ffffff`
- Radius: `50px`
- Innenabstand: `14px 32px`
- Fixiert oben rechts der Produktkarte und/oder rechtsbündig im Filialverfügbarkeits-Band
- Gleiches `scale(0.95)`-Aktiv-Verhalten wie andere primäre CTAs

**Rewards-Kosten-Pille – „200★ item"**
- Hintergrund: transparent
- Rahmen: `1px solid #cba258` (Gold)
- Text: `#cba258` (Gold)
- Radius: `50px` (vollrunde Pille)
- Innenabstand: `4px 12px`
- Inhalt: „200★ item", wobei `★` ein kleines ausgefülltes Stern-Glyphe ist – zeigt die für die Einlösung dieses Artikels benötigten Rewards-Sterne
- Schrift: Proxima Nova 13/700 mit `0.5px` Letter-Spacing
- Nur auf Produkten verwendet, die mit Rewards einlösbar sind

**Produktbeschreibungs-Band**
- Vollbreites dunkelgrünes Band (`#1E3932` House Green)
- Enthält von oben nach unten:
  1. Rewards-Kosten-Pille (gold), falls zutreffend
  2. Produktbeschreibungs-Fließtext in Weiß (16/400/1.5)
  3. Nährwert-Zusammenfassung inline („140 calories, 25g sugar, 2.5g fat") mit Info-Symbol-Tooltip – 14/700 weiß
  4. „Full nutrition & ingredients list" umrahmter weißer Pill-Button auf Grün
- Innenabstand: `32px` vertikal
- Erscheint unterhalb des primären Produktkopf-Bands

**Zutaten / Nährwerttabelle**
- Zweispaltiges Layout auf der Nährwert-Seite
- Linke Spalte: „Ingredients"-Header + Liste oder „Not available for this item"-Platzhaltertext mit erklärendem Absatz in Text Black Soft 14/400
- Rechte Spalte: „Nutrition"-Header + Label/Wert-Zeilen
- Jede Zeile: Nährstoff-Label (Proxima Nova 14/400) links, Wert (z. B. „140 calories", „25g", „205 mg**") rechts, getrennt durch eine `1px solid #e7e7e7`-Haarlinie darunter
- Fußnote für Koffein-/Sternchen-Markierungen in 13/400 Text Black Soft unten
- Wiederverwendbares Muster für regulierungskonforme Nährwerttabellen

**Filialverfügbarkeits-Auswahl**
- Erscheint auf dem dunkelgrünen Feature-Band oberhalb der Größenauswahl-Reihe
- Vollbreites abgerundetes Rechteck mit transparent-weißem Inneren
- Text: „For item availability, choose a store" in Weiß, 14/400
- Rechte Seite: Chevron-nach-unten-Affordanz + Einkaufstasche-SVG-Symbol in weißem Umriss
- Radius: `4px`
- Höhe: ~48px

**PDP-Breadcrumb**
- „Menu / Refreshers / Pink Energy Drink"-Pfad über dem Produkttitel
- Trennzeichen: `/`-Schrägstrich in Text Black Soft
- Aktuelle Seite unverlinkt, vorherige Seiten als unterstrichene Green-Accent-Links
- Schrift: 14/400 Proxima Nova
- Erscheint auf allen PDP-Seiten

**Zurück-Chevron-Link (PDP-Nährwert-/Detail-Unterseiten)**
- „← Back"-Textlink über Bereichsüberschriften auf der Nährwertseite
- Text in Green Accent (`#00754A`) 14/700 Proxima Nova
- Linkes Chevron `<` im gleichen Grün
- Alternative zum vollständigen Breadcrumb auf tiefen Unterseiten

## 5. Layout-Prinzipien

### Abstands-System

Rem-basierte semantische Skala (verankert `1rem = 10px`):

| Token | Rem | Pixel | Typische Verwendung |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Engster Inline-Innenabstand |
| `--space-2` | `0.8rem` | 8px | Kleiner Abstand, vertikaler Button-Innenabstand |
| `--space-3` | `1.6rem` | 16px | Standard – Karten-Innenabstand, äußerer Rinnstein xs |
| `--space-4` | `2.4rem` | 24px | Bereich-Innenabstand, äußerer Rinnstein md |
| `--space-5` | `3.2rem` | 32px | Hauptabstand zwischen Bereichen |
| `--space-6` | `4rem` | 40px | Große Abstände, äußerer Rinnstein lg, Header-Kiste |
| `--space-7` | `4.8rem` | 48px | Bereich-zu-Bereich-Abstand |
| `--space-8` | `5.6rem` | 56px | Sehr großes Atmen – Frap-Höhe |
| `--space-9` | `6.4rem` | 64px | Breitester Bereich-Innenabstand |

**Rinnstein-Token:**
- `--outerGutter: 1.6rem` (16px, Standard / Mobil)
- `--outerGutterMedium: 2.4rem` (24px, Tablet)
- `--outerGutterLarge: 4.0rem` (40px, Desktop)

**Universelle Rhythmus-Konstante:** `1.6rem` (16px) erscheint auf jeder Seite als Standard-Außenrinnstein, Karten-Innenabstand-Basis und Textgröße 3 Fließtext – die am häufigsten verwendete Abstandseinheit des Systems.

### Raster & Container

- Spaltenbreiten-Skala: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Geschenkkarten-Raster verwendet ein responsives 3-5-spaltiges Raster mit `~343px`-Kacheln
- Rewards-Status-Bereich: 3-spaltiges dunkelgrünes Panel bei `lg+`-Breakpoints
- Hero: asymmetrische Aufteilung 40% (Bild) / 60% (Inhalt) über `--headerCrateProportion` / `--contentCrateProportion`

### Leerraumphilosophie

Leerraum vermittelt das Gefühl von „reichlich Platz im Café". Bereichs-Innenabstände sind großzügig (40–64px). Inhaltsblöcke werden durch Leerraum statt durch Trennlinien getrennt. Die Crème-Leinwand (`#f2f0eb`) ist selbst ein visueller Atemraum zwischen weißen Karten und grünen Feature-Bändern.

### Rahmenradius-Skala

| Wert | Verwendung |
|-------|-----|
| `12px` | Karten, Modals, Menüpunkt-Kacheln (`--cardBorderRadius`) |
| `12px 12px 0 0` | Vollbreiter Feedback-Reiter (nur oben abgerundet) |
| `50px` | Alle Buttons – vollrunder Pillen-Radius (`--buttonBorderRadius`) |
| `50%` | Kreisförmige Symbole, Frap-Schwebbutton, Avatar-Thumbnails |
| Spezial | `3.3333%/5.298%` elliptisch für Starbucks-Visa-Karten-Mockups (`--svcRoundedCorners`) |

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Karte | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Standard-Inhaltskarten – ein flüsterartig weicher Doppelschatten |
| Globale Navigation | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Dreilagige weiche Abhebung auf der festen oberen Leiste |
| Frap Basis | `0 0 6px rgba(0,0,0,0.24)` | Basis-Halo um den schwebenden kreisrunden CTA |
| Frap Umgebung | `0 8px 12px rgba(0,0,0,0.14)` | Gestapelter gerichteter Umgebungsschatten – lässt den Frap nach vorne schweben |
| Geschenkkarte | Leichter Schlagschatten um illustriertes Foto | Physisches-Karten-Gefühl für Geschenkkarten-Kacheln |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Gestapelte SVG-Schlagschatten für Starbucks-Card-Visuals |

**Schatten-Philosophie:** Flüsterartig weich, geschichtet über Vollton – das System greift nie auf einen einzelnen schweren Schlagschatten zurück. Stattdessen werden 2–3 niedrig-Alpha-Schatten mit unterschiedlichen Versätzen gestapelt, um reales Umgebungs- und Direktlicht zu simulieren. Der Frap-Button ist das am stärksten elevierte Element auf jeder Seite.

### Dekorative Tiefe

- **Kein Gradientensystem** – Oberflächen sind einfarbige Farbblöcke
- **Farbblock-Bandierung** erzeugt wahrgenommene Tiefe (dunkelgrüne Bänder wirken als „vertiefte Feature-Zonen" zwischen Crème/weißen Hauptbereichen)
- **SVG-Filter-Schatten** auf Starbucks-Card-Visuals verleihen eine leichte dreidimensionale Physikalität ohne box-shadow

## 7. Dos und Don'ts

### Richtig machen
- Neutral Warm (`#f2f0eb`) oder Ceramic (`#edebe9`) als Seitenleinwand statt reinem Weiß verwenden – das warme Crème ist das Markenzeichen
- Die Grünstufen ihrer vorgesehenen Flächenrolle zuordnen – Starbucks Green für Überschriften, Green Accent für CTAs, House Green für tiefe Bänder, Uplift für Dekoratives
- Tracking bei `-0.01em` / `-0.16px` für SoDoSans im gesamten System eng halten
- 50px vollrunden Pillen-Radius auf jedem Button ohne Ausnahme verwenden
- `transform: scale(0.95)` als universellen Button-Aktiv-Zustand anwenden
- Gold ausschließlich für Rewards-Status-Zeremonienmomente reservieren
- SoDoSans für fast alles verwenden; nur für Rewards-Redaktions-Headlines zur Lander-Tall-Serifenschrift wechseln; Kalam-Handschrift für Karriere-„Bechernamen"-Momente reservieren
- 2–3 niedrig-Alpha-Schatten statt eines schwereren Schlagschattens für Elevation schichten
- Den kreisrunden Frap-CTA als dauerhaft schwebenden Bestelleinstieg auf jeder Shopping-Oberfläche verwenden
- Die Crème-Leinwand zwischen Inhaltskarten atmen lassen – Leerraum statt Trennlinien

### Nicht machen
- Nicht reines Weiß als Seitenleinwand verwenden – die warme Crème-Temperatur ist bedeutungstragend
- Nicht „ein Markengrün" wählen – das Vier-Grün-System ist beabsichtigt; ausschließlich `#006241` überall einzusetzen flacht die Marke ab
- Gold nicht als Allzweck-Akzent verwenden – es ist nur ein Rewards-Signal
- Die Ecken von Buttons nicht eckig machen – die 50px-Pille ist universell
- Keine Gradientenfüllungen einführen – das System ist durchgehend Farbblock
- H1 und H2 nicht durch Größe kontrastieren – die Hierarchie entsteht durch Gewicht + Farbe (600 Starbucks-Grün vs. 400 Text Black)
- Nicht reines Schwarz für Fließtext verwenden – `rgba(0,0,0,0.87)` passt zur warmen Leinwand
- Das `scale(0.95)`-Aktiv-Feedback bei Buttons nicht weglassen – es ist eine charakteristische Mikrointeraktion
- Keine einzelnen schweren Schatten verwenden; immer 2–3 niedrig-Alpha-Schatten schichten
- Keine Serifenschriften oder Handschriften in den Haupt-Shopping-Fluss einführen – sie gehören zu Rewards- und Karriere-Kontexten

## 8. Responsives Verhalten

### Breakpoints

Aus Komponenten-Breiten-Token und progressiven Navigationshöhen abgeleitet:

| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| xs | < 480px | Globale Navigation 64px; Hamburger-Menü; einspaltiges Layout; Pill-Buttons vollbreit |
| Mobil | 480–767px | Globale Navigation 72px; Geschenkkarten-Raster 2-spaltig; Karten-Innenabstand enger |
| Tablet | 768–1023px | Globale Navigation 83px; Geschenkkarten-Raster 3-spaltig; Hero-Aufteilung beginnt |
| Desktop | 1024–1439px | Globale Navigation 99px; Geschenkkarten-Raster 4-spaltig; vollständiger asymmetrischer Hero 40/60 |
| XLarge | 1440px+ | Inhalt begrenzt auf `--columnWidthXLarge`; Geschenkkarten-Raster 5-spaltig; zusätzlicher Crème-Rand |

### Touch-Targets

- Pill-Buttons bei `7px 16px` Innenabstand messen ~32px Höhe – unterhalb des 44px WCAG-AAA-Minimums für rein berührungsbasierte Oberflächen. Auf Mobilgeräten kann der Button-Innenabstand visuell erweitert werden, um das Minimum zu erfüllen.
- Schwebender kreisrunder Frap-Button bei `56px` liegt deutlich über dem Minimum.
- Frap verwendet `--frapTouchOffset: calc(-1 * .8rem)`, um den Tippbereich 8px über den visuellen Rand hinaus zu erweitern.
- Formular-Float-Label-Eingaben vergrößern ihre Label-Schriftgröße auf Mobilgeräten (1.6rem Basis vs. 1.9rem Desktop) – einfacher zu tippen und auf Armlänge zu lesen.

### Zusammenklapps-Strategie

- **Globale Navigationshöhe skaliert progressiv**: 64 → 72 → 83 → 99px über Breakpoints, kein einzelner Wert
- **Hero-Aufteilung klappt zusammen**: 40/60-asymmetrische Aufteilung → gestapelt (Bild oben, Inhalt darunter) auf Mobil
- **Geschenkkarten-Raster**: 5-spaltig → 4-spaltig → 3-spaltig → 2-spaltig → 1-spaltig über Breakpoints mit angepassten Kartenbreiten
- **Feature-Bänder**: Bleiben vollbreit, aber Text + Bilder stapeln sich vertikal auf Mobil
- **Äußerer Rinnstein skaliert**: 16px → 24px → 40px mit wachsendem Viewport
- **Rewards-3-Spalten-Status-Panels**: Stapeln sich auf Mobilgeräten zu einer einzelnen Spalte

### Bildverhalten

- Hero-Produktfotografie wird auf Mobilgeräten vertikal enger beschnitten; Inhalt wird zum visuellen Anker
- Geschenkkarten-Illustrationen bewahren das Seitenverhältnis; Kartenraster fließt neu
- `opacity 0.3s ease-in` Einblend-Übergang beim Bildladen (verhindert abruptes Aufpoppen)
- Rewards-App-in-Hand-Fotografie skaliert proportional; dehnt sich nie

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz

- Primärer CTA: „Green Accent (`#00754A`)"
- Primärer CTA-Text: „White (`#ffffff`)"
- Marken-Überschrift: „Starbucks Green (`#006241`)"
- Feature-Band / Footer: „House Green (`#1E3932`)"
- Seitenleinwand: „Neutral Warm (`#f2f0eb`)"
- Kartenleinwand: „White (`#ffffff`)"
- Überschriften-Text auf Hell: „Text Black (`rgba(0,0,0,0.87)`)"
- Fließtext auf Hell: „Text Black Soft (`rgba(0,0,0,0.58)`)"
- Fließtext auf Dunkelgrün: „Text White Soft (`rgba(255,255,255,0.70)`)"
- Rewards-Akzent: „Gold (`#cba258`)"
- Rewards-Text: „Rewards Green (`#33433d`)"
- Destruktiv: „Red (`#c82014`)"

### Beispiel-Komponenten-Prompts

1. „Erstelle einen primären Starbucks-CTA-Pill-Button mit Green-Accent-(`#00754A`)-Hintergrund, weißem Text ‚Explore our afternoon menu', SoDoSans-Schrift bei 16px Gewicht 600 mit `-0.01em` Letter-Spacing, `50px` Rahmenradius (vollrunde Pille), `7px 16px` Innenabstand. Wende `transform: scale(0.95)` als Aktiv-Zustand mit einem `0.2s ease`-Übergang an."

2. „Gestalte eine Inhaltskarte mit White-(`#ffffff`)-Hintergrund bei `12px` Rahmenradius, geschichtetem Schatten `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Inhalt mit `16–24px` (`--space-3` bis `--space-4`) innen polstern. Auf einer Neutral-Warm-(`#f2f0eb`)-Seitenleinwand mit `16px` Abstand zu Geschwisterelementen platzieren."

3. „Baue den schwebenden kreisrunden Frap-Bestellbutton – `56px` Durchmesser, Green-Accent-(`#00754A`)-Füllung, weißes Einkaufstasche-Symbol zentriert. Geschichteter Schatten: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Feste Position unten rechts mit `-0.8rem` Touch-Versatz. Aktiv-Zustand lässt den Umgebungsschatten auf `0 8px 12px rgba(0,0,0,0)` mit `scale(0.95)` verschwinden."

4. „Baue ein dunkelgrünes Feature-Band – vollbreiter Bereich mit House-Green-(`#1E3932`)-Hintergrund. Linke Spalte: weißes SoDoSans-h2 bei 24px Gewicht 600, gefolgt von einem Text-White-Soft-(`rgba(255,255,255,0.70)`)-Fließtextabsatz und einer CTA-Reihe mit zwei Buttons (weiß gefüllt mit Green-Accent-Text für primär, Outlined-on-Dark weißer Rahmen für sekundär). Rechte Spalte: Produktfotografie. Teilungsverhältnis 40/60, unterhalb von `768px` vertikal gestapelt."

5. „Erstelle eine Rewards-Status-Karte – House-Green-(`#1E3932`)-Panel mit `12px` Rahmenradius, farbigem Gradienten-Kopfstreifen (Bronze/Silber/Gold-Tier). Titel in SoDoSans 24px Gewicht 600 in Weiß. Vorteile-Liste als weiße Aufzählungspunkte mit `rgba(255,255,255,0.70)` sekundären Unterschriften. Unten Fortschrittstext in Text White Soft. 3 Panels bei `lg+` im Raster, Einzelspalte auf Mobil."

6. „Gestalte eine Geschenkkarten-Kachel – Kartenradius entspricht `12px`, füllt sich mit einem illustrierten Foto (handgemalte Aquarell-Anmutung) als gesamte Oberfläche. Subtiler Schlagschatten lässt sie wie eine physische Karte auf der Crème-Leinwand wirken. Unter einem Kategorie-Label (‚Spring', ‚Thank You', ‚Birthday') in SoDoSans 24px Gewicht 400 oberhalb des Rasters gruppieren."

7. „Erstelle einen Starbucks-Produktdetail-Header – House-Green-(`#1E3932`)-Band mit Breadcrumb ‚Menu / Refreshers / Pink Energy Drink' in 14/400 Weiß über dem Produkttitel in SoDoSans 32/700 Großbuchstaben Weiß. Produktfoto zentriert unterhalb des Titels. Unterhalb des Fotos: eine 4-spaltige Größenauswahl-Reihe – jeder Becher-Symbol-Button zeigt eine vertikale Becker-Silhouette, Größenname (‚Tall' / ‚Grande' / ‚Venti' / ‚Trenta') in 16/700 Weiß und Flüssigunzen in 13/400 Text White Soft. Ausgewählte Größe umhüllt das Becher-Symbol mit einem `2px solid #00754A` kreisförmigen Ring."

8. „Baue einen Starbucks-Anpassungsfluss – unter der Größenauswahl 3 gestapelte umrahmte-Rechteck-Eingabe-Reihen (weißer Hintergrund, `1px solid #d6dbde` Rahmen, `4px` Radius). Jede hat ein schwebendes Label (‚Add-ins', ‚Milk', ‚Add-ins') oberhalb des oberen Rahmens in 13/700 Text Black Großbuchstaben. Wert zentriert (z. B. ‚Ice', ‚Coconut'). Rechts: Chevron-nach-unten in Text Black Soft. Für die Scoop-Zeile einen numerischen Stepper einbetten (`−` `1` `+` mit kreisförmigen `32px` umrahmten Buttons). Unterhalb aller drei Felder: umrahmte grüne ‚Customize'-Pille mit Gold-Funken-Symbol, `50px` Radius, `14px 40px` Innenabstand. Mit einer Green-Accent-gefüllten ‚Add to Order'-Pille in derselben Reihe kombinieren."

9. „Gestalte ein Starbucks-Produktbeschreibungs-Band – vollbreites House-Green-(`#1E3932`) unterhalb des Produktheaders. Oben: eine goldumrahmte ‚200★ item'-Rewards-Kosten-Pille (`50px` Radius, `4px 12px` Innenabstand, Gold-`#cba258`-Rahmen und -Text). Darunter: Produktbeschreibung in Weiß 16/400/1.5. Nährwert-Inline-Zusammenfassung in Weiß 14/700 (‚140 calories, 25g sugar, 2.5g fat') mit Info-Symbol-Tooltip. Umrahmter-Weiß-auf-Grün-Pill-Button ‚Full nutrition &amp; ingredients list'. 32px vertikaler Innenabstand."

10. „Erstelle eine Starbucks-Nährwerttabelle – zweispaltiges Layout innerhalb einer White-Karte. Linke Spalte: ‚Ingredients'-Header (24/400 Text Black), gefolgt von Zutatenliste oder ‚Not available for this item'-Platzhalterabsatz in 14/400 Text Black Soft. Rechte Spalte: ‚Nutrition'-Header, dann Label/Wert-Zeilen (Nährstoffname links, Wert rechts), getrennt durch `1px solid #e7e7e7`-Haarlinien. Typografie: Labels in 14/400 Text Black, Werte in 14/700 Text Black rechtsbündig. Fußnoten-Sternchen-Markierungen in 13/400 Text Black Soft unten."

### Iterations-Leitfaden

Beim Verfeinern bestehender Screens, die mit diesem Design-System erstellt wurden:
1. Fokus auf EINE Komponente auf einmal
2. Auf spezifische Farbnamen und Hex-Codes aus diesem Dokument verweisen
3. Natürliche Sprachbeschreibungen (‚warme Crème-Leinwand', ‚vierstufiges Grünsystem') neben exakten Werten verwenden
4. Die 50px-Pille + `scale(0.95)`-Aktiv-Zustand universell beibehalten
5. Prüfen, ob Grüntöne ihrer korrekten Rolle zugeordnet sind (Green Accent für CTA, Starbucks Green für Überschrift, House Green für Band)
6. Keine Gradienten einführen – das System ist Farbblock
7. SoDoSans-Tracking bei `-0.01em` / `-0.16px` überall beibehalten

### Bekannte Lücken

- SoDoSans ist eine exklusive Schrift, die nicht auf Google Fonts verfügbar ist – bei öffentlicher Implementierung Inter oder Manrope als Ersatz verwenden und den Tausch dokumentieren
- Lander Tall (Rewards-Serifenschrift) ist ebenfalls exklusiv – Ersatz durch Iowan Old Style, Lora oder Source Serif Pro
- Spezifische Animations-Timings pro Komponente jenseits der wenigen dokumentierten (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) sind nicht für jede interaktive Oberfläche erfasst
- Vollständiges Styling des Formularfehler-Zustands (rote Rahmenbreite, Symbolplatzierung) im Tint-Token sichtbar, aber nicht vollständig extrahiert
- Karriereseiten-spezifische Komponenten (Bechernamen-Karte, Such-Radio-Raster) werden in Token-Namen referenziert, sind aber in dieser Extraktion nicht abgedeckt
- Starbucks-Visa-Karten / Starbucks-Card (SVC) detaillierte Mockup-Specs werden durch `--svcRoundedCorners`- und `--svcShadowFilter`-Token angedeutet, sind aber nicht vollständig dokumentiert
