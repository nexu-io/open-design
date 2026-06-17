# Design-System inspiriert von Apple

> Category: Medien & Konsumgüter
> Unterhaltungselektronik. Premium-Weißraum, SF Pro, filmische Bildsprache.

## 1. Visuelles Thema & Atmosphäre

Apples Web-Sprache ist ein präzises redaktionelles System, das zwischen galerieartiger Ruhe und Informationsblöcken in Retail-Dichte wechselt. Der visuelle Ton bleibt zurückhaltend: weite neutrale Flächen, leises Chrome und Produktbilder, die nahezu das gesamte Ausdrucksgewicht tragen. Das Interface ist so konstruiert, dass es verschwindet, damit Hardware, Materialien und Oberflächen-Optionen zum erzählerischen Vordergrund werden.

Über die fünf analysierten Seiten hinweg ist der Rhythmus konsistent, aber nicht monolithisch. Marketing-Flächen (Startseite und Environment) nutzen filmische Schwarz-und-Licht-Kapitelung, während Commerce-Flächen (Store- und Shop-Flows) engere Abstände, mehr Utility-Steuerelemente und dichtere Card-Stapel einführen, ohne die grundlegende Markengrammatik zu durchbrechen. Das Ergebnis ist ein System mit zwei Gängen: Showcase-Modus und Transaktions-Modus.

Typografie ist der Stabilisator. SF Pro Display trägt die Hierarchie von Hero und Merchandising mit kompakten Zeilenhöhen und kontrolliertem Tracking, während SF Pro Text Produkt-Metadaten, Navigation, Filter und dichte Auswahl-UI übernimmt. Die Typografie bleibt dezent, doch der Skalenbereich ist breit genug, um sowohl plakative Hero-Botschaften als auch Mikro-Utility-Labels zu unterstützen.

**Key Characteristics:**
- Binärer Abschnittsrhythmus: tiefschwarze Szenen (`#000000`) im Wechsel mit blassen neutralen Feldern (`#f5f5f7`)
- Eine einzige blaue Akzentfamilie für Action- und Link-Semantik (`#0071e3`, `#0066cc`, `#2997ff`)
- Zwei Betriebsmodi in einem System: filmische Showcase-Module und dichte Commerce-Konfiguratoren
- Starke Abhängigkeit von Bildsprache und Materialoberflächen; das UI-Chrome bleibt visuell dünn
- Enge Headline-Maße (SF Pro Display, Semibold) gepaart mit kompakter Body-/Link-Typografie (SF Pro Text)
- Pillen- und Kapsel-Geometrie als prägende Action-Sprache (`18px` bis `980px` und kreisförmige Steuerelemente)
- Tiefe sparsam eingesetzt; Kontrast und Flächentrennung übernehmen den Großteil der Schichtungsarbeit
- Mehrseitiger Farbblock-Rhythmus: schwarze Hero-Kapitel -> blasse neutrale Merchandising-Felder -> Utility-weiße Retail-Flächen -> dunkle Mikro-Flächen für Steuerelemente

## 2. Farbpalette & Rollen

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primär
- **Absolutes Schwarz** (`#000000`): Immersive Hero-Flächen, hochdramatische Produktkapitel, tiefe UI-Anker.
- **Blasses Apple-Grau** (`#f5f5f7`): Hauptsächliche helle Fläche für Feature-Bänder, Vergleichsblöcke und redaktionelle Übergänge.
- **Fast-Schwarze Tinte** (`#1d1d1f`): Primäre Textfarbe und Dark-Fill-Steuerfarbe auf hellen Flächen.

### Sekundär & Akzent
- **Apple Action-Blau** (`#0071e3`): Primäre Action-Füllung und fokus-signalisierender Marken-Akzent.
- **Body-Link-Blau** (`#0066cc`): Inline-Linkfarbe, optimiert für die Lesbarkeit langer Texte.
- **Hochleuchtdichtes Link-Blau** (`#2997ff`): Helle Link-Behandlung auf dunkleren Szenen, wo stärkerer Kontrast erforderlich ist.

### Oberfläche & Hintergrund
- **Reinweiße Fläche** (`#ffffff`): Retail-/Produktlisten-Hintergründe und dichte transaktionale Abschnitte.
- **Graphit-Oberfläche A** (`#272729`): Kontextschicht für dunkle Cards und Mediensteuerungen.
- **Graphit-Oberfläche B** (`#262629`): Etwas tiefere dunkle Utility-Schicht für Steuerelement-Gruppierungen.
- **Graphit-Oberfläche C** (`#28282b`): Erhöhte dunkle Hilfsflächen.
- **Graphit-Oberfläche D** (`#2a2a2c`): Dunkelste erhöhte Stufe, eingesetzt zur Trennung in reicheren dunklen Szenen.

### Neutrale & Text
- **Sekundäres Neutralgrau** (`#6e6e73`): Sekundärer Fließtext, erläuternde Beschreibungen, tertiäre Metadaten.
- **Sanftes Rahmengrau** (`#d2d2d7`): Trennlinien, dezente Umrisse und gedämpfte Utility-Eingrenzung.
- **Mittleres Rahmengrau** (`#86868b`): Stärkere Feldumrisse in Produktkonfigurations- und Filter-Kontexten.
- **Utility-Dunkelgrau** (`#424245`): Dunkel-neutraler Text-/Flächen-Übergang in Store-Kontexten.

### Semantisch & Akzent
- **Auswahl-/Fokus-Signal** (`#0071e3`): Geteiltes Fokus- und Auswahlzustand-Signal über Marketing- und Commerce-Kontexte hinweg.
- **Fehler/Warnung/Erfolg**: In der extrahierten Flächenmenge war keine eigenständige semantische Palette durchgängig sichtbar.

### Gradienten-System
- Die extrahierten Seiten sind überwiegend von Vollfarb-Flächen geprägt. Visueller Reichtum entsteht durch Fotografie und Oberflächen-Rendering statt durch dauerhafte UI-Gradienten.

## 3. Typografie-Regeln

### Schriftfamilie
- **Display-Familie:** `SF Pro Display`, Fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Text-Familie:** `SF Pro Text`, Fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Aufteilung der Verwendung:** Die Display-Familie übernimmt Hero-/Produkt-Headlines und Merchandising-Überschriften; die Text-Familie übernimmt Navigation, Steuerelemente, Labels und dichten Commerce-Text.

### Hierarchie
| Rolle | Größe | Gewicht | Zeilenhöhe | Laufweite | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Hero-Skala für Environment/Store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Hero-Momente der Startseite |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Hauptkapitel-Überschriften |
| Product Heading | 40px | 600 | 1.10 | normal | Produkt- und Kampagnen-Abschnittstitel |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Geräte- und Merchandising-Callouts |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px bis 0.352px | Modul-Sub-Heros |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Benennung auf Tile-Ebene und Schlüsseltext |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Konfigurator- und gruppierte Inhaltsüberschriften |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Größere Promotion-Links |
| Subhead | 19px | 600 | 1.21 | 0.228px | Kompakte Abschnittseinleitungen |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Standard-Fließtext und Retail-Beschreibungen |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Hervorgehobene Labels und Schlüsselwerte |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Buttons, Hilfslabels, kompakter Navigationstext |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Kleingedrucktes, Mikro-Labels |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Dichte Metadaten und rechtlicher Hilfstext |

### Prinzipien
- **Kontinuität über Seitentypen hinweg:** Dieselbe typografische DNA spannt sich über filmische Launches und Produktkauf-Flows und verhindert so eine Markenspaltung zwischen Marketing und Commerce.
- **Kompression im großen Maßstab:** Display-Stufen nutzen engen Zeilenabstand und kontrolliertes Tracking, um maschinell und produktorientiert zu wirken.
- **Lesbare Dichte in Retail-Tiefe:** SF Pro Text balanciert Kompaktheit mit ausreichend vertikalem Rhythmus für lange Produktlisten und Optionsmatrizen.
- **Abgestimmte Gewichtsleiter:** 600 ist das dominante Hervorhebungsgewicht; 700 erscheint selektiv; 300 wird sparsam für Kontrast in größeren Zeilen eingesetzt.

### Hinweis zu Schrift-Ersatz
- Nächstliegende frei verfügbare Ersatzschriften: `Inter` für textlastige Umsetzung und `SF Pro Display-like` Maße, angenähert mit `Inter Tight` für Überschriften.
- Bei Ersatz die Zeilenhöhe leicht erhöhen (+0.02 bis +0.06) bei Body-Größen und die Intensität des negativen Trackings reduzieren, um die Lesbarkeit zu erhalten.

## 4. Komponenten-Stylings

### Buttons
- **Primäre Füll-Action:** `#0071e3` Hintergrund, `#ffffff` Text, 8px Radius, kompaktes horizontales Padding (üblicherweise 8px 15px). Verwendet für entscheidende Kauf-/Fortschritts-Aktionen.
- **Dunkle Füll-Action:** `#1d1d1f` Hintergrund, `#ffffff` Text, 8px Radius. Verwendet, wenn helle Flächen ein zurückhaltendes, kontraststarkes Primärelement benötigen.
- **Pillen-/Kapsel-Action-Familie:** große Kapsel-Aktionen mit `18px`-`56px` Radien und extreme Pillen-Links mit `980px`. Etabliert Apples weiche, aber präzise Call-to-Action-Silhouette.
- **Utility-Filter-/Button-Hüllen:** helle Hüllen (`#fafafc` oder durchscheinendes Weiß) mit dezenten grauen Rändern (`#d2d2d7` / `#86868b`) für dichte Konfigurationskontexte.
- **Pressed-Verhalten:** aktive Steuerelemente verringern üblicherweise die Skalierung oder verschieben die Füllung leicht, um die physische Druckbestätigung anzuzeigen.

### Cards & Container
- **Redaktionelle/Produkt-Cards:** helle Cards auf `#f5f5f7` oder weißen Feldern mit minimaler Rahmung und bildorientierter Komposition.
- **Dunkle Utility-Cards:** Graphit-Stufen (`#272729` bis `#2a2a2c`), verwendet für Overlays, Mediensteuerungen und Dark-Context-Module.
- **Konfigurator-Panels:** abgerundete Container (oft 12px-18px) mit klarer, aber zurückhaltender Randdefinition.
- **Carousel-/Spotlight-Module:** größere abgerundete Hüllen (`28px`-`36px`) für hervorgehobene Inhaltsbahnen.

### Eingaben & Formulare
- **Retail-Eingabefelder:** durchscheinende oder weiße Hintergründe, dunkler Text (`#1d1d1f`), rahmenbasierte Eingrenzung (`#86868b`).
- **Auswahl-Steuerelemente:** kreisförmige/toggle-artige Steuergeometrie tritt in Produktauswahl-Interfaces häufig auf.
- **Dichte-Strategie:** Formularfelder bleiben visuell ruhig, damit Gerätebilder und Preishierarchie dominant bleiben.

### Navigation
- **Globale Marketing-Nav:** kompakte dunkle, durchscheinende Leiste mit Links in kleiner Schrift und zurückhaltender Ikonografie.
- **Store-/Sub-Shop-Nav-Schichten:** zusätzliche Utility-Leisten, Chips und segmentierte Steuerelemente zur Eingrenzung von Kategorie und Produkt.
- **Link-Hierarchie:** Link-Blautöne bleiben das primäre interaktive Signal, während neutraler Text dichte Navigationssets unterstützt.

### Bildbehandlung
- **Objekt-zuerst-Fotografie:** Hardware und Zubehör werden auf kontrollierten Vollfarb-Flächen in den Vordergrund gerückt.
- **Hochauflösendes Oberflächen-Rendering:** reflektierende/materialbezogene Details sind zentral für die visuelle Überzeugungskraft.
- **Gemischte Rahmung:** randlose Hero-Szenen koexistieren mit abgerundeten Retail-Cards und eng beschnittenen Merchandising-Thumbnails.

### Weitere markante Komponenten
- **Produktkonfigurator-Matrix:** Optionsstapel und Selektoren, die Chips, Radio-artige Steuerelemente und kontextbezogene Preis-/Zusammenfassungs-Blöcke kombinieren.
- **Carousel-Steuerpunkte/-Pfeile:** kreisförmige Steuervokabular in gedämpften Overlays zur Galerie-Progression.
- **Environment-Story-Panels:** narrative Kapitel, die redaktionelle Typografie mit filmischen Produkt-/Umwelt-Visuals verbinden.

## 5. Layout-Prinzipien

### Abstandssystem
- Die Basiseinheit ist effektiv `8px`, doch das System unterstützt dichte Mikro-Stufen für präzise Ausrichtung.
- Häufig wiederverwendete Abstandswerte über die Seiten hinweg: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Über Marketing- und Retail-Flows hinweg sichtbare universelle Rhythmus-Konstanten: `8px`-Einheit als Gerüst mit `14-20px`-Utility-Intervallen für Komponenten-Padding und Listenabstand.

### Grid & Container
- **Showcase-Seiten:** große zentrale Spalten mit breitem horizontalem Atemraum und vollbreiten Farbkapiteln.
- **Commerce-Seiten:** engere mehrspaltige Produkt- und Steuer-Grids mit häufigem modularem Stapeln.
- **Container-Verhalten:** eingeschränkter, lesbarer Kern mit großzügigen Außenrändern bei Desktop-Breiten.

### Whitespace-Philosophie
- **Szenen-Taktung:** große visuelle Kapitel nutzen breiten oberen/unteren Atemraum.
- **Informationsverdichtung wo nötig:** Retail-Seiten komprimieren Abstände bewusst, um pro Viewport mehr handlungsrelevante Informationen freizulegen.
- **Kontrastgeführte Trennung:** Abschnittsübergänge stützen sich mehr auf Flächenwechsel als auf dekorative Trenner.

### Border-Radius-Skala
- **5px:** winzige Utility-Links/-Tags und kleinere Mini-Hüllen.
- **8px-12px:** Standard-Steuerelemente und kompakte Felder.
- **16px-18px:** Cards, Modulrahmen und Commerce-Panels.
- **28px-36px:** größere Modul- und Spotlight-Container.
- **56px / 100px / 980px:** Kapseln, große Pillen und prägende langgestreckte CTA-Formen.
- **50%:** kreisförmige Medien- und Auswahl-Steuerelemente.

## 6. Tiefe & Elevation

| Stufe | Behandlung | Verwendung |
|------|-----------|-----|
| Level 0 | Flache neutrale Flächen (`#ffffff`, `#f5f5f7`, `#000000`) | Haupt-Narrativ und Produktbühnen |
| Level 1 | Dezente Rand-Eingrenzung (`#d2d2d7`, `#86868b`) | Filter, Eingabefelder, Utility-Cards |
| Level 2 | Weicher Schatten (`rgba(0,0,0,0.08)` bis `rgba(0,0,0,0.22)` wo vorhanden) | Hervorgehobene Cards und erhöhte Merchandise-Module |
| Level 3 | Dunkelflächen-Staffelung (`#272729` -> `#2a2a2c`) | Overlays, Mediensteuerungen, dunkle Utility-Cluster |
| Accessibility | Blaues Fokus-Signal (`#0071e3`) | Tastatur- und Auswahl-Hervorhebung |

Tiefe ist bewusst zurückhaltend. Apple bevorzugt Tonalkontrast, Flächen-Staffelung und kompositorische Hierarchie gegenüber schweren Schattenstapeln.

### Dekorative Tiefe
- Dekorative Tiefe entsteht primär durch fotografischen Realismus und Material-Rendering, nicht durch synthetische UI-Effekte.
- Durchscheinende Overlays und glasartige Utility-Leisten sorgen für eine milde atmosphärische Schichtung in Navigation und Steuerelementen.

## 7. Do's und Don'ts

### Do
- Nutze die neutrale Triade (`#000000`, `#f5f5f7`, `#ffffff`) als strukturelles Fundament.
- Reserviere blaue Akzente für echte Action- und Navigations-Semantik.
- Halte die Typografie eng und bewusst, besonders bei Display-Skalen.
- Erhalte die Kapsel-/Kreis-Geometriesprache für Steuerelemente und Schlüssel-Aktionen.
- Lass Produktbilder die visuelle Dramatik tragen; halte das Chrome dezent.
- Setze in dichten Retail-Kontexten rahmenbasierte Eingrenzung statt schwerer Card-Ornamentik ein.
- Bewahre eine klare Trennung zwischen Showcase-Modulen und transaktionalen Modulen, während Kern-Tokens geteilt bleiben.

### Don't
- Führe keine breiten sekundären Akzentpaletten ein, die mit dem Apple-Blau konkurrieren.
- Überstrapaziere keine Schatten, Glow-Effekte oder dekorative Gradienten im Kern-UI-Chrome.
- Mische keine unverwandten Schriftfamilien und lockere das Tracking nicht wahllos.
- Vereinheitliche nicht alle Ecken auf einen einzigen Radius; Apple nutzt zielgerichtete Radius-Stufen.
- Überlade Commerce-Module nicht mit dicken Rändern oder lauten visuellen Effekten.
- Entferne nicht die neutrale Kontrast-Kadenz zwischen dunklen und hellen Kapiteln.
- Behandle Marketing- und Kauf-Flows nicht als getrennte Design-Systeme.

## 8. Responsives Verhalten

### Breakpoints
| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Small Mobile | 374px und darunter | Verdichtete Retail-Steuerelemente, einspaltige Produktstapel |
| Mobile | 375px-640px | Einspaltige Module, kompakte Action-Zeilen, verdichtete Selektoren |
| Tablet | 641px-833px | Erweiterte Cards und gemischte 1-2-spaltige Übergänge |
| Tablet Wide | 834px-1023px | Stabileres mehrspaltiges Merchandising, größere Textblöcke |
| Desktop | 1024px-1240px | Vollständige Retail-Layouts und Produktvergleichsstrukturen |
| Desktop Wide | 1241px-1440px | Erweiterung des Marketing-Heros und breitere Abschnittsabstände |
| Large Desktop | 1441px+ | Maximaler Kapitel-Atemraum und weite redaktionelle Komposition |

### Touch-Targets
- Primäre und sekundäre Aktionen werden generell in tippfreundlichen Pillen-/Button-Geometrien präsentiert.
- Kreisförmige Medien- und Auswahl-Steuerelemente richten sich in mobilen Kontexten an einer minimalen Tippbarkeit aus.
- Dichte Commerce-UI nutzt kompakte Labels, erhält aber klare Trefferregionen durch umgebendes Form-Padding.

### Collapsing-Strategie
- Marketing-Hero-Typografie skaliert in diskreten Stufen herunter und bewahrt dabei den Hierarchie-Kontrast.
- Produkt- und Commerce-Grids brechen von mehrspaltig zu gestapelten Cards um, mit durchgehend sichtbaren Selektoren.
- Utility-Navigation komprimiert sich in einfachere Link-/Steuer-Gruppierungen und bewahrt dabei Schlüssel-Aktionen.
- Optionen-/Konfigurationscluster werden vertikal sequenziert, um den Kauf-Flow auf kleinen Bildschirmen linear zu halten.

### Bildverhalten
- Produktbilder bewahren Seitenverhältnis und Zentralität über die Breakpoints hinweg.
- Hero-Visuals bleiben auf Mobilgeräten dominant, wobei Text um die Medienpriorität herum neu positioniert wird.
- Retail-Thumbnails bleiben durch engere Beschnitt-Logik und dichteres Card-Stapeln lesbar.
- Bildgeführte Module verankern weiterhin den Rhythmus, während die Layout-Dichte zunimmt.

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primäres Action-Blau: **Apple Action-Blau** (`#0071e3`)
- Inline-Link-Blau: **Body-Link-Blau** (`#0066cc`)
- Dunkle Kapitel-Fläche: **Absolutes Schwarz** (`#000000`)
- Helle Kapitel-Fläche: **Blasses Apple-Grau** (`#f5f5f7`)
- Primärer Text auf Hell: **Fast-Schwarze Tinte** (`#1d1d1f`)
- Sekundärer Text: **Sekundäres Neutralgrau** (`#6e6e73`)
- Retail-Rand sanft: **Sanftes Rahmengrau** (`#d2d2d7`)
- Retail-Rand stark: **Mittleres Rahmengrau** (`#86868b`)

### Beispielhafte Komponenten-Prompts
- „Entwirf einen Apple-Style-Produkt-Hero auf einer schwarzen Fläche (`#000000`) mit einer SF Pro Display Semibold-Headline (48-56px), prägnantem Begleittext und zwei Kapsel-CTAs mit `#0071e3` und `#1d1d1f`."
- „Erstelle ein Commerce-Konfigurations-Panel auf Weiß (`#ffffff`) mit 18px abgerundeten Cards, `#86868b` Randfeldern, SF Pro Text 17px Fließtext und kompakten Options-Selektoren."
- „Baue ein Merchandising-Card-Grid, das `#f5f5f7` und weiße Flächen abwechselt, mit bildorientierten Cards, zurückhaltenden Schatten und 14-17px SF Pro Text Metadaten."
- „Generiere einen Carousel-Steuercluster mit kreisförmigen Buttons (50% Radius), gedämpften grauen Overlays und klarem Aktiv-Feedback für die Galerie-Navigation."
- „Komponiere einen gemischten Marketing- + Retail-Seitenrhythmus: dunkles Showcase-Kapitel -> helles Feature-Kapitel -> dichtes Produktlisten-Modul, wobei blaue Akzente nur für Aktionen und Links genutzt werden."

### Iterations-Leitfaden
1. Lege zuerst das neutrale Fundament fest (`#000000`, `#f5f5f7`, `#ffffff`), bevor du Akzente abstimmst.
2. Halte blaue Akzente knapp und zielgerichtet; wenn alles blau ist, kollabiert die Hierarchie.
3. Stimme die Typografie in dieser Reihenfolge ab: Display-Skala, Body-Lesbarkeit, dann Mikro-Labels.
4. Passe den Radius je Komponentenklasse an (Feld, Card, Kapsel, Kreis), statt eine einheitliche Rundung für alles zu verwenden.
5. Erhöhe die Dichte schrittweise beim Übergang von Showcase-Abschnitten zu Commerce-Abschnitten.
6. Validiere nach jeder Überarbeitung, dass Produktbilder die stärkste visuelle Schicht bleiben.

### Bekannte Lücken
- Eigenständige semantische Statusfarben (Fehler/Warnung/Erfolg) waren in der extrahierten Seitenmenge nicht durchgängig sichtbar.
- Einige Interaktions-Mikrozustände variieren je Modul und sind nicht als universelle System-Tokens repräsentiert.
- Einige Retail-Module weisen kontextspezifische Typografie-Overrides auf, die nicht über alle fünf Seiten hinweg auftreten.
