# Design System Inspired by Airbnb

> Category: E-Commerce & Einzelhandel
> Reisemarktplatz. Warmes Korallrot als Akzentfarbe, fotografiegeprägt, abgerundete Benutzeroberfläche.

## 1. Visuelles Thema & Atmosphäre

Airbnbs Design 2026 wirkt wie ein Reisemagazin, das zufällig eine App ist – makellose weiße Flächen weichen vollflächiger Fotografie, und die Benutzeroberfläche selbst tritt zurück, damit die Unterkünfte Raum zum Atmen haben. Das charakteristische Rausch-Korallenrosa (`#ff385c`) wird sparsam, aber unverkennbar eingesetzt: Such-CTA, aktiver Tab-Indikator, primärer Aktionsbutton und gelegentlich Preise oder die Wunschlisten-Herzikone. Alles andere ist ein diszipliniertes Grausystem, wobei `#222222` nahezu jede Textzeile trägt.

Was das System unverkennbar zu Airbnb macht, ist das hohe *Vertrauen*, das es in den Inhalt setzt. Unterkunftsfotos werden in Heldenformat angezeigt, 4:3 mit randloser Radiusbehandlung. Der Kategoriewechsel erfolgt über einen Tri-Tab-Wähler (Unterkünfte / Erlebnisse / Dienstleistungen), der 3D-gerenderte illustrierte Icons verwendet (ein Satteldachhaus, ein Heißluftballon, eine Serviceglocke) – physisch, taktil, fast spielzeugähnlich – gepaart mit klaren `Airbnb Cereal VF`-Beschriftungen. Dies ist eines der seltenen Konsumprodukte, bei denen 3D-Renderings und rein typografische Benutzeroberfläche problemlos koexistieren.

Die neueste Oberfläche ist die **Erlebnisse**-Produktlinie – gleiche Grundstruktur, aber reichere Kartendichte, mehr Fotografie und ein mittig verankertes Buchungspanel mit festem rechten Preisbereich. Detailseiten für Unterlagen (sowohl Zimmer als auch Erlebnisse) folgen einer strikten Vorlage: vollflächiges Heldbild-Raster → überlappendes abgerundetes Buchungskartenformat (beim Scrollen fixiert) → Ausstattung → Bewertungen (Gast-Favorit-Auszeichnungen nutzen eine große zentrierte `4.81`-Bewertung mit einem Lorbeerkranz-Lockup) → Karte → Gastgeberprofil → Hinweise. Der Rhythmus ist konsistent, egal ob Sie ein Zimmer oder eine Yachttour buchen.

**Hauptmerkmale:**
- Rausch-Korallenrosa (`#ff385c`) als einzelne Akzent-Markenfarbe, ausschließlich für primäre CTAs und den Such-Button verwendet
- Vollflächige Fotografie im Format 4:3 / 16:9 mit sanfter Eckabrundung (14–20 px) als primäres visuelles Vokabular
- 3D-gerenderte Kategorieicons gepaart mit typografischen Tabs – der einzige Ort, an dem das System Illustration zulässt
- Kreisförmige `50%`-Symbolschaltflächen (Zurückpfeil, Teilen, Favorit, Karussellpfeile) über das gesamte Design verteilt
- `Airbnb Cereal VF` trägt jede Beschriftung, von der 8-px-Rechtsfußnote bis zur 28-px-Abschnittsüberschrift – ein Einfamilientypografiesystem
- Produktstufenfarbkodierung: Airbnb Plus (Magenta `#92174d`), Airbnb Luxe (Tiefviolett `#460479`), Airbnb (Rausch-Korall)
- Gast-Favorit-Auszeichnungs-Lockup – zentrierte riesige Bewertungszahl zwischen zwei Lorbeerkränzen, einer der bekanntesten Momente im System
- Fest verankerte Buchungspanel mit Preis → Datum → Gäste-Stapel, auf dem Desktop an die rechte Leiste angeheftet, auf Mobilgeräten in eine am unteren Rand verankerte „Reservieren"-Leiste umgewandelt
- Feste untere mobile Navigation (Erkunden / Wunschlisten / Anmelden) mit aktivem Rausch-Farbton

## 2. Farbpalette & Rollen

### Primär
- **Rausch** (`#ff385c`): Das charakteristische Korallenrosa der Marke. CSS-Variable `--palette-bg-primary-core`. Verwendet für: primärer „Reservieren"-Button, Such-Absenden-Button, aktive Tab-Unterstreichung, Wunschlisten-Herzfüllung, Preishervorhebung. Die einzelne Farbe mit der höchsten Sichtbarkeit auf jeder Seite.

### Sekundär & Akzent
- **Deep Rausch** (`#e00b41`): Eine gesättigtere Variante. CSS-Variable `--palette-bg-tertiary-core`. Verwendet für gedrückte/aktive Schaltflächenzustände und Gradientenendpunkte.
- **Plus Magenta** (`#92174d`): CSS-Variable `--palette-bg-primary-plus`. Die Markenfarbe für die Airbnb-Plus-Produktstufe – ein hochwertiges kuratiertes Unterkunftsangebot.
- **Luxe Purple** (`#460479`): CSS-Variable `--palette-bg-primary-luxe`. Die Markenfarbe für die Airbnb-Luxe-Produktstufe – Villen-/Anwesen-Vermietungen.
- **Info Blue** (`#428bff`): CSS-Variable `--palette-text-legal`. Verwendet für rechtliche/informative Links (Nutzungsbedingungen, Datenschutz, Hinweise) – die einzige nicht-monochrome Linkfarbe im System.

### Oberfläche & Hintergrund
- **Canvas White** (`#ffffff`): Der Standard-Seitenhintergrund. Jede Karte, jeder Container, jede Detailseite beginnt hier.
- **Soft Cloud** (`#f7f7f7`): Subtiler Unterflächenton, verwendet für Fußzeilenhintergründe, Kartenansichts-Wrapper und „alles andere"-Abschnitte, die sich vom primären Weiß zurückziehen sollen.
- **Hairline Gray** (`#dddddd`): Allgegenwärtige 1-px-Rahmenfarbe – trennt Karten, Ausstattungszeilen, Bewertungspanels, Fußzeilenspalten. Das Arbeitspferd des Layoutsystems.

### Neutraltöne & Text
- **Ink Black** (`#222222`): CSS-Variable `--palette-text-primary`. Das Nahezu-Schwarz des Systems. Jede Überschrift, jeder Fließtextabsatz, jede Navigationsbeschriftung, jeder Preis. Verwendet für ~90 % des gesamten Textes auf einer Seite.
- **Charcoal** (`#3f3f3f`): CSS-Variable `--palette-text-focused`. Verwendet in fokussiertem Eingabetext und einem Schritt darunter liegenden Hervorhebungstexten.
- **Ash Gray** (`#6a6a6a`): CSS-Variable `--palette-bg-tertiary-hover`. Sekundäre Beschriftungen, „Cottages zum Mieten"-Untertitelstil unter Städtenamen, gedämpfte Fußzeilenlinks.
- **Mute Gray** (`#929292`): CSS-Variable `--palette-text-link-disabled`. Deaktivierte Schaltflächen und Metadaten mit niedriger Priorität.
- **Stone Gray** (`#c1c1c1`): Tertiäre Trennlinien, Icon-Striche, Platzhalter-Avatare.

### Semantisch & Akzent
- **Error Red** (`#c13515`): CSS-Variable `--palette-text-primary-error`. Formvalidierungsfehler, Warnungen zu destruktiven Aktionen.
- **Deep Error** (`#b32505`): CSS-Variable `--palette-text-secondary-error-hover`. Gedrückte/aktive Varianten von Fehlerzuständen.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): CSS-Variable `--palette-text-material-disabled`. Deaktivierte Beschriftungen im Materialstil.

### Gradientsystem
Airbnbs Markensteigung erscheint sparsam, typischerweise nur beim Wortmarke und beim gebrandeten Such-Button-Moment:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Dieser Korall → Magenta-Übergang ist der „Markenmoment" – nie als vollständige Fläche verwendet, nur als schmale Pillfüllung oder Logo-Behandlung.

## 3. Typografieregeln

### Schriftfamilie
- **Airbnb Cereal VF** (primär und einzige): Der proprietäre variabel-gewichtete serifenlose Schriftzug, der das gesamte System trägt. Fallbacks (in der Reihenfolge): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

In den extrahierten Tokens beobachtete Gewichte: 500, 600, 700. Kein 400-Regular – das „Fließtext"-Gewicht des Systems ist 500, was jedem Textblock eine subtile zusätzliche Dichte verleiht, die selbstbewusst und bewusst wirkt.

OpenType-Funktionen: `salt` (stilistische Alternativen) wird bei den kompakten 11-px- und 14-px-600-Gewichts-Beschriftungen verwendet – wahrscheinlich für engere Ziffern und Sonderzeichenformen. Keine Ligaturen oder Bruchziffernfunktionen beobachtet.

### Hierarchie

| Rolle | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Abschnittsüberschrift | 28 px / 1,75 rem | 700 | 1,43 | 0 | „Inspiration für zukünftige Ausflüge" – Überschriften auf Seitenebene |
| Unterabschnittsüberschrift | 22 px / 1,38 rem | 500 | 1,18 | -0,44 px | „Was dieser Ort zu bieten hat", „Lerne die Gastgeber kennen" – Inhaltstrenner |
| Kartentitel | 21 px / 1,31 rem | 700 | 1,43 | 0 | Bewertungspanel-Überschriften, Kartenleittitel |
| Unterkunftstitel | 20 px / 1,25 rem | 600 | 1,20 | -0,18 px | „Kleine Gruppenbootstour, unbegrenzter Wein & Früchte" – Unterkunfts-Headlines auf Detailseiten |
| Untertitel fett | 16 px / 1,00 rem | 600 | 1,25 | 0 | Gastgebername, Stadtname |
| Fließtext mittel | 16 px / 1,00 rem | 500 | 1,25 | 0 | Primärer Fließtext auf Detailseiten |
| Button Groß | 16 px / 1,00 rem | 500 | 1,25 | 0 | „Reservieren", „Gastgeber werden" |
| Button Standard | 14 px / 0,88 rem | 500 | 1,29 | 0 | Standard-Schaltflächenbeschriftungen |
| Link | 14 px / 0,88 rem | 500 | 1,43 | 0 | Navigationslinks, Fußzeilenlinks |
| Beschriftung mittel | 14 px / 0,88 rem | 500 | 1,29 | 0 | Metadaten, Untertitelzeilen („Ferienhaus-Vermietungen", „Villa-Vermietungen") |
| Beschriftung fett | 14 px / 0,88 rem | 600 | 1,43 | 0 | `salt`-Funktion aktiviert – numerische Statistiken, Kleintext-Hervorhebung |
| Beschriftung klein | 13 px / 0,81 rem | 400 | 1,23 | 0 | Bewertungsdaten, Mikro-Metadaten |
| Mikro Standard | 12 px / 0,75 rem | 400 | 1,33 | 0 | Fußzeilen-Disclaimer, rechtlicher Mikro-Text |
| Mikro fett | 12 px / 0,75 rem | 700 | 1,33 | 0 | „NEU"-Pill-Beschriftungen |
| Badge Großbuchstaben | 11 px / 0,69 rem | 600 | 1,18 | 0 | `salt`-Funktion – kompakte Kategorie-/Status-Badges |
| Hochgestellt | 8 px / 0,50 rem | 700 | 1,25 | 0,32 px | Großbuchstaben – Preis-Fußnoten, Dezimalenden |

### Grundsätze
- **Eine Familie, viele Gewichte.** Airbnb Cereal VF übernimmt alles von 8 px Rechtstext bis 28 px Seitenüberschriften – die visuelle Identität kommt aus der Familie selbst, nicht aus dem Schriftmischen.
- **500 ist das neue 400.** Das „reguläre" Gewicht des Systems ist 500, was jedem Absatz eine etwas selbstbewusstere Textur als den Web-Standard verleiht.
- **Negativer Buchstabenabstand nur bei Display-Typen.** Überschriften ab 20 px komprimieren den Buchstabenabstand um -0,18 bis -0,44 px für eine gemeißelte Wirkung; Fließtextgrößen bleiben bei 0 Buchstabenabstand für die Lesbarkeit.
- **Enge Zeilenhöhen für Überschriften, großzügige für Fließtext.** Display-Typen laufen bei 1,18–1,25 (eng); Fließtext und Beschriftungen öffnen sich auf 1,43 für Langform-Komfort.
- **Keine Großbuchstaben außer bei 8 px.** Die einzige Großbuchstabentransformation im System ist das 8-px-Hochgestellt – überall sonst leistet Satzschrift mit subtilen Gewichtsverschiebungen die Arbeit.

### Hinweis zu Schriftsubstituten
Airbnb Cereal VF ist proprietär. Der engste Open-Source-Ersatz ist **Circular Std** (noch kommerziell) oder **Inter** (kostenlos, Google Fonts) mit um -0,01 em reduziertem Buchstabenabstand bei Display-Größen. Für strenge Markentreue rendert die dokumentierte Fallback-Kette (`Circular, -apple-system, system-ui`) auf macOS/iOS akzeptabel, wo `system-ui` in San Francisco aufgelöst wird, das ähnliche Proportionen aufweist.

## 4. Komponenten-Stilisierungen

### Schaltflächen

**Primärer CTA** („Reservieren", „Suchen", „Daten hinzufügen")
- Hintergrund: Rausch `#ff385c`
- Text: Canvas White `#ffffff`, Airbnb Cereal 500, 16 px
- Innenabstand: ~14 px vertikal, 24 px horizontal
- Radius: 8 px (rechteckig) oder 50 % (kreisförmige Icon-Variante)
- Rahmen: keiner
- Aktiv/gedrückt: `transform: scale(0.92)` plus ein 2-px-`#222222`-Fokusring bei `0 0 0 2px`

**Sekundäre Schaltfläche** („Gastgeber werden", umrandete tertiäre Aktionen)
- Hintergrund: `#ffffff`
- Text: Ink Black `#222222`, Airbnb Cereal 500, 14–16 px
- Innenabstand: 10 px 16 px
- Radius: 20 px (Pill) oder 8 px (rechteckig)
- Rahmen: 1 px solid Hairline Gray `#dddddd`

**Nur-Icon-Kreisschaltfläche** (Zurückpfeil, Teilen, Favorit, Karussell-Steuerung)
- Hintergrund: `#f2f2f2` (leicht gebrochenes Weiß) oder Weiß mit 1 px transparentem schwarzen Rahmen
- Icon: `#222222` Konturstrich, 16–20 px
- Größe: 32–44 px Durchmesser
- Radius: 50 %
- Aktiv/gedrückt: `transform: scale(0.92)`; subtiler 4-px-weißer Ring `0 0 0 4px rgb(255,255,255)` zur Trennung von farbenfrohen Fotografie-Hintergründen

**Deaktivierte Schaltfläche**
- Hintergrund: `#f2f2f2`
- Text: Stone Gray `#c1c1c1`
- Deckkraft: 0,5

**Pill-Tab-Schaltfläche** (Kategorieauswahl „Unterkünfte / Erlebnisse / Dienstleistungen")
- Hintergrund: transparent
- Text: Ink Black `#222222`, Airbnb Cereal 500, 16 px
- Innenabstand: 8 px 14 px
- Aktiver Zustand: 2-px Ink Black-Unterstreichung unterhalb der Beschriftung
- Gepaart mit einem 36–48 px 3D-gerenderten illustrierten Icon über der Beschriftung

### Karten & Container

**Unterkunftskarte** (Startseiten-Raster, Suchergebnisse)
- Hintergrund: `#ffffff`
- Radius: 14 px auf dem Bild, Text sitzt direkt darunter auf transparentem Hintergrund
- Bild: 4:3-Seitenverhältnis, vollflächig, abgerundet mit demselben 14-px-Radius
- Innenabstand: keiner am äußeren Container; 12 px Abstand zwischen Bild und Metadatenzeilen
- Schatten: keiner – die Trennung ergibt sich aus dem Weißraum und dem intrinsischen Radius der Fotografie
- Metadatenmuster: Stadt/Region in Zeile 1 (16 px 600), Entfernung/Dauer in Zeile 2 (14 px 500 Ash Gray), Datumsbereich in Zeile 3, Preiszeile mit „pro Nacht" am unteren Rand

**Detailseiten-Buchungspanel** (festes rechtes Führungsschiene auf Zimmer-/Erlebnisseiten)
- Hintergrund: `#ffffff`
- Radius: 14–20 px
- Rahmen: 1 px solid Hairline Gray `#dddddd`
- Schatten: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` – eine gestapelte dreilagige subtile Erhebung
- Innenabstand: 24 px
- Breite: ~370 px, 120–140 px unterhalb des Viewport-Oberkante befestigt
- Inhalt: Preisüberschrift → Datumsauswahl → Gäste-Dropdown → primärer CTA → „Es werden noch keine Kosten berechnet"-Fußnote

**Ausstattungsraster-Karte** (auf Unterkunfts-Detailseiten)
- Hintergrund: `#ffffff`
- Rahmen: 1 px solid Hairline Gray `#dddddd` auf Zeilenebene (nicht pro Element)
- Innenabstand: 16 px vertikal pro Ausstattungszeile
- Icon-+Label-Muster: 24-px-Kontur-Icon links, 16-px-500-Gewichts-Label rechts

**Bewertungskarte** (Einzelbewertung auf Detailseiten)
- Hintergrund: `#ffffff`, kein Rahmen
- Innenabstand: 0 (basiert auf Rasterabständen)
- Inhalt: 40-px-kreisförmiger Avatar + 16-px-600-Gewichts-Name + 14-px-400 Ash Gray-Datum in einer Zeile, dann 14-px-500-Fließtextabsatz darunter

### Eingaben & Formulare

**Suchleiste** (primäre Startseite)
- Hintergrund: `#ffffff`
- Rahmen: 1 px solid Hairline Gray `#dddddd` umhüllt alle drei Segmente (Wo / Wann / Wer)
- Radius: 32 px (vollständige Pill)
- Schatten: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` – subtiles Schwebegefühl
- Struktur: Drei Segmente, getrennt durch dünne vertikale Trennlinien, jedes Segment hat eine 12-px-500-Beschriftung über einem 14-px-500-Platzhalter
- Absenden: Rausch-kreisförmiger Icon-Button am rechten Rand, 48 px Durchmesser

**Texteingabe** (allgemeine Formulare)
- Hintergrund: `#ffffff`
- Rahmen: 1 px solid Hairline Gray `#dddddd`
- Radius: 8 px
- Innenabstand: 14 px 16 px
- Fokus: Rahmen wechselt zu Ink Black, fügt `0 0 0 2px` schwarzen äußeren Ring hinzu
- Fehler: Rahmen wechselt zu `#c13515` (Error Red), Hilfstext verwendet gleiche Farbe

**Datumsauswahl**
- Kalenderraster: 7-spaltiges Layout, kreisförmige `50%`-Tageszellen 40–44 px breit
- Ausgewählter Bereich: Ink Black `#222222` Hintergrund mit weißen Ziffern
- Start-/Endanker: größere gefüllte Kreise; mittlere Daten verwenden Soft Cloud `#f7f7f7` Tönung

### Navigation

**Obere Navigation (Desktop)**
- Höhe: ~80 px
- Hintergrund: `#ffffff`
- Links: Airbnb-Wortmarke+Logo-Lockup in Rausch (102×32 px)
- Mitte: Tri-Tab-Kategoriewähler (Unterkünfte / Erlebnisse / Dienstleistungen) mit 36–48 px 3D-Icons, gestapelt über 16-px-500-Beschriftungen; aktiver Tab hat eine 2-px Ink Black-Unterstreichung
- Rechts: „Gastgeber werden"-Textlink, dann 32-px-kreisförmiger Globus (Sprache), dann 36-px-Hamburger-Avatar-Menü
- Untere Rahmenlinie: 1 px solid Hairline Gray `#dddddd`

**Obere Navigation (Mobil)**
- Einzeilige Such-Pill belegt die volle Breite: „Suche starten"-Platzhalter mit kleinem Lupensymbol
- Darunter: Tri-Tab-Kategoriewähler bleibt bestehen (Unterkünfte / Erlebnisse / Dienstleistungen) – illustrierte Icons schrumpfen auf ~28 px
- Am unteren Rand fixierte Tab-Leiste: Erkunden (aktiver Zustand Rausch) / Wunschlisten / Anmelden – 24-px-Icons über 12-px-Beschriftungen

**Sekundäre Navigation der Unterkunfts-Detailseite**
- Festes horizontales Scrollen von Ankerlinks (Fotos · Ausstattung · Bewertungen · Lage · Gastgeber) erscheint beim Scrollen über das Heldenbild
- Höhe: 56 px
- Untere Rahmenlinie: 1 px solid Hairline Gray

### Bildbehandlung

- **Primäre Seitenverhältnisse**: 4:3 für Startseiten-Unterkunftsraster, 16:9 für Erlebnis-Heldfotografie, 1:1 für Avatare
- **Radius**: 14 px auf Unterkunftsrasterbildern, 20 px auf Detailseiten-Heldfotorahmen, `50%` auf Avataren
- **Bildraster auf Detailseiten**: Fünf-Foto-Raster mit einem einzelnen großen linken Bild (50 % Breite) und vier kleineren Fotos in einem 2×2-Raster rechts, alle in dem gemeinsamen 20-px-abgerundeten Container
- **Lazy Loading**: intensiver Einsatz von `loading="lazy"` mit verschwommenen Platzhaltervorschauen
- **Karussell**: kreisförmige 32-px-Pfeil-Buttons überlagern das Bild, vertikal zentriert; Punktindikatoren sitzen 12 px über dem unteren Rand

### Signaturkomponenten

**Gast-Favorit-Auszeichnungs-Lockup** (prominent auf Detailseiten mit hoher Bewertung)
- Zentrierte Bewertungszahl bei 44–56 px 700-Gewicht
- Zwei handgezeichnete Lorbeerkranz-SVG-Illustrationen flankieren links und rechts bei ~48 px Höhe
- Darunter: „Gast-Favorit"-Label bei 12 px 700 Großbuchstaben mit `0,32 px` Buchstabenabstand und kurzes Unter-Label bei 14 px 500 Ash Gray
- Vollbreite-Block, kein Container-Rahmen – sitzt direkt auf weißem Canvas

**Tri-Tab-Kategoriewähler** (erscheint oben auf jeder Such-Oberfläche)
- Drei Tabs: Unterkünfte / Erlebnisse / Dienstleistungen
- Jeder Tab: 3D-gerendertes illustriertes Icon (~48 px hoch) über 16-px-500-Beschriftung
- Erlebnisse und Dienstleistungen tragen derzeit eine kleine dunkelblau-blaue „NEU"-Pill (12 px 700 weißer Text auf dunkelblauem Hintergrund), die oben rechts am Icon schwebt
- Aktiver Tab: 2 px Ink Black-Unterstreichung unterhalb der Beschriftung

**Inspirationsstadt-Raster** (Startseite „Inspiration für zukünftige Ausflüge")
- 6-spaltiges Raster mit Zielortlinks auf dem Desktop, 2-spaltig auf Mobilgeräten
- Jede Zelle: 16-px-600-Stadtname in Zeile 1, 14-px-500 Ash Gray-Mietyp-Untertitel in Zeile 2 („Ferienhaus-Vermietungen", „Villa-Vermietungen")
- Keine Bilder – nur Text-Raster
- Oben durch Kategorie tabgesteuert (Beliebt / Kunst & Kultur / Strand / Berge / Outdoor / Aktivitäten / Reisetipps & Inspiration / Airbnb-freundliche Wohnungen) – aktiver Tab hat 2-px-Unterstreichung und Gewichtsverschiebung

**Reservierungs-Fixkarte** (Unterkunfts-Detailseiten)
- Bleibt auf dem Desktop 120 px unter dem Viewport-Oberkante fixiert, während der Benutzer am Heldenbild vorbeiscrollt
- Faltet sich auf Mobilgeräten zu einer vollbreiten unteren Leiste mit einem „Ab $X / Nacht"-Label und einem Rausch-„Reservieren"-Pill zusammen
- Immer sichtbar: Preisüberschrift → Datumsanzeige → Gästeauswahl → Rausch CTA → „Es werden noch keine Kosten berechnet"-Disclaimer

**Erlebnis-Gastgeberkarte** (Erlebnis-Detailseiten)
- Vollbreiter abgerundeter Container mit einem 3:2-Titelbild oben
- Gastgeber-Avatar (kreisförmig, 56 px) überlappt die untere Kante des Titelbilds um 50 %
- Unter der Überlappung: Gastgebername bei 16 px 700, Gastgeber-Amtszeit bei 14 px 500 Ash Gray, kleiner Rausch-„Gastgeber kontaktieren"-Pill-Button
- Dient als Übergang zwischen Bewertungen und dem Ausstattungs-/Standort-Block

**„Wichtiges"-Streifen** (Unterkunfts-Detailseiten)
- 3-spaltiges Raster mit Regel-/Richtlinienblöcken (Hausregeln, Sicherheit & Eigentum, Stornierungsrichtlinie)
- Jede Spalte: Icon oben, 16-px-600-Überschrift, 14-px-500 Ash Gray-Fließtext, „Mehr anzeigen"-Link in Ink Black-Unterstreichung
- Trennlinie: 1 px Hairline Gray ober- und unterhalb des gesamten Streifens

## 5. Layout-Grundsätze

### Abstandssystem
- **Basiseinheit**: 8 px
- **Extrahierte Skala**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32 px – feinkörnig mit einer Handvoll Off-Raster-Werten für pixelgenaue Icon-Ausrichtung
- **Abschnittspolsterung**: ~48–64 px oben/unten auf dem Desktop, 24–32 px auf Mobilgeräten
- **Karten-Innenpolsterung**: 24 px bei Buchungspanels und großen Karten, 16 px bei Ausstattungszeilen, 12 px bei Unterkunftskarten-Metadaten
- **Rinne zwischen Unterkunftskarten**: 24 px Desktop, 16 px Mobil
- **Zwischen gestapelten Textzeilen**: 4–8 px (sehr eng – verstärkt das „dichte Informations"-Gefühl von Reiseangeboten)

### Raster & Container
- **Maximale Inhaltsbreite**: 1760–1920 px auf ultrabreiten Monitoren (Airbnb lässt das Raster weiter atmen als die meisten Websites); 1280 px auf den meisten Detailseiten
- **Startseiten-Unterkunftsraster**: 6 Spalten bei ≥1760 px, 5 bei ≥1440 px, 4 bei ≥1128 px, 3 bei ≥800 px, 2 bei ≥550 px, 1 darunter
- **Detailseite**: 2-spaltig asymmetrisch – Hauptinhalt ~58 %, festes Buchungspanel ~36 % rechts, ~6 % Rinne
- **Fußzeile**: 3-spaltig Support / Hosting / Airbnb

### Weißraum-Philosophie
Airbnb ist dicht informativ, aber nie beengt. Weißraum wird zur *Gruppierung* verwendet – Unterkunftskarten haben 24 px Rinne, damit jede Fotografie als eigenständiges Objekt wahrgenommen wird, aber die Metadaten unter jeder Karte verwenden 4–8 px Abstände, damit Preis/Stadt/Datum wie eine einzige Einheit wirken. Das Detailseiten-Buchungspanel hat 24 px Innenpolsterung, aber die Zeilen darin (Datumsauswahl, Gästeauswahl, CTA) sind mit 12 px gestapelt – die Grenze zwischen der Karte und der Seite leistet mehr Trennungsarbeit als der Inhalt darin.

### Rahmenradius-Skala
| Radius | Verwendung |
|--------|-----|
| 4 px | Inline-Anker-Tags, Tag-Chips |
| 8 px | Textschaltflächen, Dropdowns, kleine Utility-Schaltflächen |
| 14 px | Unterkunftskartenfotografie, allgemeine Inhaltscontainer, Badges |
| 20 px | Primäre abgerundete Schaltflächen (Pill-Form), große Bilder, Buchungspanel |
| 32 px | Suchleisten-Pill, extra-große Container |
| 50 % | Alle kreisförmigen Icon-Schaltflächen, alle Avatare, Wunschlisten-Herzen – die charakteristische runde Geometrie des Systems |

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| 0 | Kein Schatten | Unterkunftskarten, Hauptinhalt, nur-Text-Abschnitte |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Aktive/gedrückte Icon-Schaltflächen (z. B. Zurück, Teilen, Favorit) – subtiler Lift zur Anzeige der Interaktion |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Festes Buchungspanel, Modals, Dropdown-Menüs – die charakteristische dreilagige Elevation des Systems |
| Fokusring | `0 0 0 2px #222222` | Aktive Schaltflächen, fokussierte Sucheingabe |
| Weiße Trennlinie | `rgb(255, 255, 255) 0 0 0 4px` | Kreisförmige Schaltflächen, die über Fotos überlagert sind – ein 4-px-weißer Ring trennt den Button sauber vom farbenfrohen Bildhintergrund |

Schatttenphilosophie: Airbnb verwendet **gestapelte Schichten-Schatten** statt eines einzelnen Schlagschattens. Der dreilagige Buchungspanel-Schatten wirkt wie eine zusammenhängende Erhebung, besteht aber eigentlich aus drei separaten Schatten mit unterschiedlichen Deckkraft-/Unschärfewerten – das erzeugt eine subtile Anti-Aliasing am Schatten-Rand, die edel wirkt, ohne schwer zu sein.

### Dekorative Tiefe
- **Fotografie als Tiefe**: Das System verlässt sich stark auf vollflächige Fotografie, um visuelle Tiefe zu erzeugen; Schatten und Verläufe werden sparsam eingesetzt, damit die Fotos die Hauptarbeit leisten
- **Lorbeerkranz-Lockup**: Die Gast-Favorit-Auszeichnung verwendet zwei SVG-Lorbeerkranz-Illustrationen, die der sonst flachen Bewertungszahl eine feierliche, pokalähnliche Präsenz verleihen
- **3D-gerenderte Kategorieicons**: Die Icons für Unterkünfte/Erlebnisse/Dienstleistungen haben ihre eigene sanfte innere Beleuchtung und subtile eingebackene Schlagschatten im Artwork – der einzige Ort, an dem die Marke „dimensionale" Illustration erlaubt

## 7. Dos und Don'ts

### Do
- Reserviere Rausch `#ff385c` für primäre Aktionen und den aktiven Tab-Indikator – verwässere es niemals durch dekorativen Einsatz.
- Lass der Fotografie Raum – 4:3-Ausschnitte mit 14–20 px abgerundeten Ecken, kein überlagernder Text, keine Verlaufsfolien.
- Verwende Ink Black `#222222` für jede Textschicht unterhalb Rausch – das ist das Nahezu-Schwarz des Systems, niemals echtes `#000000`.
- Paare die 3D-illustrierten Icons des Tri-Tab-Kategoriewählers mit flacher Typografie – mische keine Illustrationsstile auf einer einzelnen Oberfläche.
- Stapele drei niedrigopazitätsshatten (~2 %, 4 %, 10 %), um die charakteristische Buchungspanel-Elevation zu erzeugen.
- Verwende Hairline Gray `#dddddd` 1-px-Rahmen für jeden Karten-zu-Karten- und Zeilen-zu-Zeilen-Trennlinien.
- Behandle das Buchungspanel auf dem Desktop als fixiert, auf Mobilgeräten in eine am unteren Rand verankerte Reservierungsleiste einklappend.
- Verwende 4–8 px Abstand innerhalb von Metadatengruppen und 24 px zwischen Karten – Informationsdichte ist beabsichtigt.

### Don't
- Führe keine sekundären Akzentfarben außerhalb der Rausch / Plus Magenta / Luxe Purple-Produktstufenpalette ein.
- Platziere keinen Text in Fotografien – Bildunterschriften sitzen immer unter dem Bild, niemals darüber.
- Verwende keine Großbuchstaben-Labels außer der einzigen 8-px-Hochgestellt-Rolle.
- Runde Icon-Schaltflächen nicht auf etwas anderes als 50 % ab – Kreisförmigkeit ist die Signaturgeometrie des Systems.
- Füge Unterkunftskarten keine Schlagschatten hinzu – sie sitzen auf weißem Canvas ohne Elevation.
- Verwende keine Verlaufshintergründe – der einzige Verlauf im System ist ein schmaler Rausch → Magenta-Übergang auf der Wortmarke.
- Verwende das 400-regular-Schriftgewicht nicht – Airbnb Cerals Fließtextgewicht ist 500.
- Überschreibe Airbnb Cereal VF nicht mit einer anderen Display-Schrift – das System ist bewusst einfamiliär.

## 8. Responsives Verhalten

### Breakpoints

Airbnb deklariert ~60 Breakpoints (Design-Zeit-Artefakt aus seiner Komponentenbibliothek), aber die bedeutenden Layout-Verschiebungen finden bei einer viel kleineren Menge statt:

| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Ultra-breit | ≥1760 px | 6-spaltiges Unterkunftsraster, 1760–1920 px maximale Inhaltsbreite |
| Desktop XL | 1440–1759 px | 5-spaltiges Raster, vollständige Navigation sichtbar, festes Buchungspanel auf der rechten Leiste |
| Desktop | 1128–1439 px | 4-spaltiges Raster, festes Buchungspanel bleibt bestehen |
| Laptop | 1024–1127 px | 3–4-spaltiges Raster, Kategorienavigation bleibt horizontal |
| Tablet | 800–1023 px | 3-spaltiges Raster, globale Suche kann sich zu einer einzeiligen Pill zusammenfalten |
| Kleines Tablet | 550–799 px | 2-spaltiges Raster, Buchungspanel fällt auf vollbreites Inline-Block |
| Mobil | 375–549 px | 1-spaltiges gestapeltes Layout, am unteren Rand fixierte Tab-Leiste erscheint (Erkunden / Wunschlisten / Anmelden) |
| Kleines Mobil | <375 px | Kantenpolsterung verkleinert sich auf 16 px; Kategoriewähler-Icons schrumpfen auf ~28 px |

### Touch-Ziele
Alle interaktiven Elemente erfüllen oder überschreiten 44×44 px. Die kreisförmige Icon-Schaltflächenfamilie ist speziell 32–44 px groß mit 8–12 px erweitertem Hit-Bereich-Polsterung. Der primäre Rausch-Reservieren-Button ist ~48 px hoch. Der Hit-Bereich des Tri-Tab-Kategoriewählers ist das vollständige Beschriftung-plus-Icon-Rechteck (typischerweise ~64×80 px pro Tab).

### Einklapp-Strategie
- **Navigation**: Obere Navigation behält Airbnb-Wortmarke + Tri-Tab-Wähler auf Tablet und darüber; auf Mobilgeräten gleitet der Wähler direkt unter die Such-Pill, und die Globus-/Avatar-Steuerungen verschieben sich zu einer am unteren Rand verankerten Tab-Leiste.
- **Suchleiste**: Drei-Segment-Pill (Wo / Wann / Wer) mit einem Rausch-Kreis-Absenden-Button auf dem Desktop; faltet sich auf Mobilgeräten zu einer einzeiligen „Suche starten"-Pill zusammen, deren Tippen ein Vollbild-Such-Sheet öffnet.
- **Buchungspanel**: Feste rechte Leiste bei ≥1128 px; inline innerhalb der Hauptinhalts-Spalte zwischen 800–1127 px; am unteren Rand festes „Reservieren"-Pill bei <800 px.
- **Unterkunftsraster**: Fließt 6 → 5 → 4 → 3 → 2 → 1 Spalten über Breakpoints um.
- **Detailseiten-Bildraster**: Fünf-Bild-Layout (1 groß + 4 klein) auf dem Desktop; wird auf Mobilgeräten zu einem wischbaren vollflächigen Karussell mit Seitenpunktindikatoren.
- **Fußzeile**: 3-spaltiges Layout faltet sich bei <800 px zu einspaltig gestapelt zusammen.

### Bildverhalten
- `loading="lazy"` universell, mit verschwommenen `im_w=`-URL-parametrisierten Vorschau-Thumbs zuerst
- Responsive Bilder verwenden Airbnbs `muscache.com`-CDN mit `im_w`-Abfrageparameter für breitenbasierte Bereitstellung (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Kein Art-Direction-Zuschnitt – dasselbe Bild wird über Breakpoints hoch- und heruntergescalt
- Karussells auto-passen die Fotohöhe an, um ein konsistentes 4:3-Verhältnis unabhängig vom Quell-Seitenverhältnis beizubehalten

## 9. Agent-Prompt-Leitfaden

### Schnelle Farbreferenz
- Primärer CTA: „Rausch (#ff385c)"
- Seitenhintergrund: „Canvas White (#ffffff)"
- Unteroberfläche: „Soft Cloud (#f7f7f7)"
- Überschriften-/Fließtext: „Ink Black (#222222)"
- Sekundärer Text: „Ash Gray (#6a6a6a)"
- Rahmen/Trennlinie: „Hairline Gray (#dddddd)"
- Fehler: „Error Red (#c13515)"
- Info-Link: „Info Blue (#428bff)"
- Luxe-Stufen-Akzent: „Luxe Purple (#460479)"
- Plus-Stufen-Akzent: „Plus Magenta (#92174d)"

### Beispiel-Komponenten-Prompts
- „Erstelle einen primären Reservieren-Button: Rausch (`#ff385c`) Hintergrund, weißes Airbnb Cereal 500-Gewicht-Label bei 16 px, 14 px × 24 px Polsterung, 8 px Rahmenradius, kein Schatten. Bei aktiv/gedrückt füge `transform: scale(0.92)` mit einem 2-px Ink Black-Fokusring (`0 0 0 2px #222222`) hinzu."
- „Baue eine Unterkunftskarte mit einer 4:3-vollflächigen Fotografie bei 14-px-Rahmenradius, kein Container-Schatten; unter dem Bild stapele drei Textzeilen mit 4-px-Abständen: Stadtname bei 16 px 600 Ink Black, Miettyp bei 14 px 500 Ash Gray (`#6a6a6a`) und Preisbereich bei 16 px 500 Ink Black mit einem 14-px-`pro Nacht`-Suffix."
- „Entwirf ein festes Buchungspanel: weißer Hintergrund, 14-px-Rahmenradius, 1-px Hairline Gray (`#dddddd`) Rahmen, 3-Schichten-Elevation-Schatten (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), 24 px Polsterung, 370 px Breite, 120 px unter dem Viewport-Oberkante auf dem Desktop fixiert. Inhalt: Preisüberschrift, Datumsauswahl, Gäste-Dropdown, Rausch-primärer CTA und ein 12-px Ash Gray `Es werden noch keine Kosten berechnet`-Disclaimer."
- „Erstelle einen Tri-Tab-Kategoriewähler: Drei gleich breite Tabs beschriftet mit Unterkünfte, Erlebnisse, Dienstleistungen; jeder Tab hat ein ~48-px-3D-gerendertes illustriertes Icon (Haus, Ballon, Glocke) über einem 16-px-500-Ink-Black-Label; aktiver Tab erhält eine 2-px Ink Black-Unterstreichung; füge eine kleine 12-px-700-weißes-`NEU`-Pill auf einem dunkelmarinen Hintergrund oben rechts an den Erlebnisse- und Dienstleistungs-Icons hinzu."
- „Rendere das Gast-Favorit-Auszeichnungs-Lockup: Eine zentrierte Bewertungszahl bei 52 px 700-Gewicht Ink Black, flankiert links und rechts von handgezeichneten SVG-Lorbeerkränzen bei ~48 px Höhe; darunter ein 12-px-700-Großbuchstaben-`GAST FAVORIT`-Label mit 0,32 px Buchstabenabstand; Unter-Label bei 14 px 500 Ash Gray; vollbreiter Block direkt auf weißem Canvas ohne Container-Rahmen."

### Iterationsführer
Beim Verfeinern vorhandener Bildschirme, die mit diesem Design-System erstellt wurden:
1. Konzentriere dich auf EINE Komponente auf einmal.
2. Referenziere spezifische Farbnamen und Hex-Codes aus diesem Dokument (z. B. „Ink Black #222222", nicht „Dunkelgrau").
3. Verwende natürliche Sprachbeschreibungen neben Maßen („subtile dreilagige Elevation" statt einer langen Schattenzeichenkette).
4. Beschreibe das gewünschte „Gefühl" („magazinartig, fotografieprimär" vs. „dichte Utility").
5. Standardmäßig immer Airbnb Cereal VF 500-Gewicht für Fließtext und 600–700 für Hervorhebung – niemals 400.
6. Halte Rausch-Rosa selten – wenn mehr als ein Rausch-farbiges Element pro Viewport erscheint, überlege, ob eines neutralisiert werden sollte.

### Bekannte Lücken
- **Startseiten-Unterkunftsraster-Karten**: Das Haupt-Unterkunftskarten-Raster (die primäre visuelle Oberfläche von airbnb.com) wurde in den extrahierten Startseiten-Screenshots nicht vollständig erfasst – der Inhalt wurde nur teilweise geladen. Die obigen Unterkunftskarten-Spezifikationen sind aus der Inspirationsrasterstruktur und Airbnbs breiteren Konventionen abgeleitet; bestätige genaue Seitenverhältnisse und Metadaten-Hierarchie gegen die Live-Website vor dem Produktionseinsatz.
- **Erlebniskategorie-Icons**: Die 3D-illustrierten Icons für Unterkünfte / Erlebnisse / Dienstleistungen werden als Raster-Assets bereitgestellt; ihre genauen Quelldatei-Spezifikationen (SVG vs. PNG, gerenderte Pixelabmessungen) sind hier nicht dokumentiert.
- **Animations- und Übergangstimings**: Nicht erfasst – statischer Extraktionsumfang.
- **Dunkelmodus**: Airbnb liefert keinen nativen Dunkelmodus in den extrahierten Produktoberflächen; dieses Dokument beschreibt nur das einzige Hell-Modus-Thema.
