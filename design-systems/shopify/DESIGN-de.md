# Design-System inspiriert von Shopify

> Category: E-Commerce & Einzelhandel
> E-Commerce-Plattform. Dark-first kinematisch, neongrüner Akzent, ultraleichte Typografie.

## 1. Visuelles Thema & Atmosphäre

Shopify.com ist ein Dark-first-Digitaltheater — eine Website, die ihre Commerce-Plattform wie eine kinematische Premiere inszeniert. Das gesamte Erlebnis entfaltet sich vor einem Abgrund aus nahezu schwarzen Flächen, die den leisesten Hauch von tiefem Waldgrün tragen (`#02090A`, `#061A1C`, `#102620`) und eine nächtliche Atmosphäre erzeugen, die weniger wie eine SaaS-Marketingseite und mehr wie eine exklusive Produktpräsentation auf einer Tech-Keynote wirkt. Diese Dunkelheit ist nicht kalt oder korporativ — es ist das warme, umhüllende Dunkel eines Luxuserlebnisses, wie das Sitzen in der ersten Reihe eines abgedunkelten Auditoriums.

Die Typografie ist der unbestrittene Star. NeueHaasGrotesk — ein verfeinerter Helvetica-Nachfahre — erscheint in monumentalem Maßstab (96px) mit unvorstellbar leichtem Gewicht (330–400) und erzeugt Überschriften, die eher in Licht graviert als in Tinte gedruckt wirken. Das `ss03`-OpenType-Feature verleiht den Buchstabenformen einen unverwechselbaren Charakter, der Shopifys Typografie von generischer Helvetica-Verwendung abhebt. Unterhalb der Display-Ebene übernimmt Inter Variable den Fließtext mit chirurgischer Präzision und verwendet gleichermaßen ungewöhnliche variable Gewichte (420, 450, 550), die zwischen den traditionellen Gewichtsstufen liegen. Diese Präzision signalisiert ein Unternehmen, das jedes Detail bis ins Letzte durchdenkt.

Farbe wird mit äußerster Zurückhaltung eingesetzt. Der primäre Akzent ist Shopify Neon Green (`#36F4A4`) — ein elektrisches Mint, das ausschließlich auf Fokusringen und Akzenthighlights erscheint und wie ein biolumineszentes Signal gegen die dunkle Leinwand pulsiert. Weichere Grüntöne (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) sorgen für atmosphärische Waschungen. Weiß ist die einzige Textfarbe, die auf dunklen Flächen zählt, während eine zinkbasierte Neutralskala (`#A1A1AA` bis `#3F3F46`) die Hierarchie stiller Informationen handhabt. Das Ergebnis ist ein Design, das Commerce-Technologie so wirken lässt, als gehöre sie in eine Science-Fiction-Zukunft.

**Wesentliche Merkmale:**
- Dark-first-Design mit tiefen Waldteal-Untertönen (kein reines Schwarz)
- Ultraleichte Display-Typografie (Gewicht 330) in monumentalem Maßstab (96px), die eine ätherische Präsenz erzeugt
- Neon Green (`#36F4A4`) als der einzige hochenergetische Akzent gegen die Dunkelheit
- Vollpill-Buttons (9999px Radius) als primäre interaktive Form
- Mehrschichtige Box-Shadows, die fotografische Tiefe erzeugen
- Produkt-Screenshots eingebettet in dunkle UI-Kontexte, passend zur umgebenden Dunkelheit
- Zinkbasierte Neutralskala für Text-Hierarchie — ausgewogen zwischen warm und kühl

## 2. Farbpalette & Rollen

### Primär

- **Shopify White** (`#FFFFFF`): Primärer Text auf dunklen Flächen, Button-Füllungen, hochkontrastige Elemente
- **Shopify Black** (`#000000`): Body-Hintergrund, Button-Text auf Weiß, maximale Kontrastbasis (--color-shade-100)

### Sekundär & Akzent

- **Neon Green** (`#36F4A4`): Der Signaturakzent — Fokusringe, interaktive Highlights, Aktionszustandsindikatoren. Elektrisch und biolumineszent
- **Aloe** (`#C1FBD4`): Weiche grüne Waschung für dekorative Hintergründe, atmosphärische Karten (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): Hellster Grünton für subtile Oberflächendifferenzierung (--color-pistachio-10)

### Fläche & Hintergrund

- **Void** (`#000000`): Stammseiten-Hintergrund — reines Schwarz für maximale Tiefe
- **Deep Teal** (`#02090A`): Kartenoberflächen, Inhaltscontainer — nahezu schwarz mit grünem Unterton
- **Dark Forest** (`#061A1C`): Abschnittshintergründe mit sichtbarem grünem Charakter
- **Forest** (`#102620`): Erhöhte dunkle Flächen, Header-Hintergründe — der wärmste dunkle Ton
- **Dark Card Border** (`#1E2C31`): Kartenränder auf dunklen Flächen, subtile Grenzziehung

### Neutraltöne & Text (Zinc-Skala)

- **Shade-30** (`#D4D4D8`): Hellstes Neutral, kaum sichtbare Ränder im Dunkeln (--color-shade-30)
- **Muted Text** (`#A1A1AA`): Sekundärer Text, Metadaten, Beschreibungen — die leise Stimme
- **Shade-50** (`#71717A`): Tertiärer Text, Zeitstempel, unwichtigste Infos (--color-shade-50)
- **Shade-60** (`#52525B`): Deaktivierter Text, dekorative Neutraltöne (--color-shade-60)
- **Shade-70** (`#3F3F46`): Subtile Trennlinien, kaum sichtbare UI-Grenzen (--color-shade-70)
- **Light Border** (`#E4E4E7`): Ränder auf hellen Flächen (selten — nur in Light-Mode-Modals)

### Semantisch & Akzent

- **Link Muted** (`#9797A2`): Gedämpfter Linktext mit Unterstreichungsdekor
- **Link Sage** (`#9DABAD`): Teal-getönte gedämpfte Links
- **Link Lavender** (`#BDBDCA`): Hellere Link-Variante
- **Link Mint** (`#99B3AD`): Grüngetönte Link-Variante für thematische Abschnitte

### Gradient-System

- **Dark Teal Wash**: Radialer Gradient von `#102620` Mitte zu `#02090A` Rand — verwendet hinter Produkt-Showcases
- **Green Atmospheric**: Subtile grüngetönte Ambient-Gradienten hinter Hero-Abschnitten, die Tiefe ohne Vollfarben erzeugen
- **Spotlight**: Fokussierter heller Bereich verblasst zu Schwarz — erzeugt Keynote-artige Präsentationsbeleuchtung

## 3. Typografieregeln

### Schriftfamilie

**Display:** NeueHaasGrotesk (verfeinerter Helvetica-Nachfahre, variable Schrift)
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType-Features: `ss03` (Stilistischer Satz 3 — unverwechselbare Buchstabenalternativen)
- Verfügbare Gewichte: 330, 360, 400, 500, 750 (variabel)
- Verwendet für alle Überschriften, Hero-Text und große Display-Elemente

**Body:** Inter-Variable
- Fallbacks: Helvetica, Arial, sans-serif
- OpenType-Features: `ss03`
- Verfügbare Gewichte: 400, 420, 450, 500, 550 (variabel)
- Verwendet für Fließtext, Links, Buttons, UI-Elemente

**Mono:** ui-monospace
- Fallbacks: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Verwendet für Code-Snippets, Datenbeschriftungen, technische Inhalte

### Hierarchie

| Rolle | Größe | Gewicht | Zeilenhöhe | Zeichenabstand | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, Hero-Headlines, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, Betonungs-Display |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, gesperrtes Display |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, ätherisches Display |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, Abschnittstitel |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, Unterabschnitte |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, Feature-Titel |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, Karten-Überschriften |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, kleine Überschriften |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, kleinere Überschriften |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, Lead-Absätze |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, Standard-Fließtext |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, betonter Fließtext |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, kompakter Text |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, leicht betont |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, CTA-Text |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, Navigationselemente |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, Metadaten |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, betonte Beschriftung |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, weit gesperrte Labels |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, eng gesperrter Kleintext |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, Großbuchstaben-Labels |
| Code | 16px | 400 | 1.50 | — | ui-monospace, Großbuchstaben, Code-Blöcke |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, Großbuchstaben, Inline-Code |

### Prinzipien

Shopifys Typografie ist ein Meisterkurs in variabler Schriftpräzision. Die Display-Ebene lebt fast ausschließlich bei Gewichten 330–400 — federleichter Text, der über dem dunklen Hintergrund wie projiziertes Licht zu schweben scheint. Dies ist das Gegenteil des fetten, schweren Ansatzes der meisten SaaS-Seiten: Wo andere schreien, flüstert Shopify in Großformat. Die 96px-Überschriften bei Gewicht 330 erzeugen ein Paradoxon aus enormer Größe und zartem Strich, der sich zugleich monumental und fragil anfühlt. Das `ss03`-OpenType-Feature aktiviert einen stilistischen Satz, der bestimmten Zeichen (wahrscheinlich 'a', 'g' und bestimmten Ziffern) ein verfeinerteres Erscheinungsbild verleiht und Shopifys Typografie von der Standard-Helvetica-Neue-Nutzung unterscheidet. Inter Variable übernimmt die Body-Ebene mit chirurgischer Präzision und verwendet Gewichte wie 420 und 550, die zwischen den traditionellen Haltepunkten liegen — jedes Textstück hat genau das visuelle Gewicht, das es benötigt.

## 4. Komponenten-Styling

### Buttons

**Primär (Weiße Füllung)**
- Hintergrund: Weiß (`#FFFFFF`)
- Text: Schwarz (`#000000`)
- Rahmen: 2px solid transparent
- Rahmenradius: volle Pille (9999px)
- Innenabstand: 12px 26px 12px 16px (asymmetrisch — mehr rechts für visuelle Balance)
- Hover: leichte Opazitätsreduzierung oder Hintergrundverschiebung
- Fokus: 2px `#36F4A4` (Neon Green) Umrissring
- Übergang: all 200ms ease

**Sekundär (Ghost/Outlined)**
- Hintergrund: transparent
- Text: Weiß (`#FFFFFF`)
- Rahmen: 2px solid Weiß (`#FFFFFF`)
- Rahmenradius: volle Pille (9999px)
- Innenabstand: 12px 26px 12px 16px
- Hover: füllt sich mit weißem Hintergrund und schwarzem Text
- Fokus: 2px `#36F4A4` Umriss

**Badge/Tag (Neutral gefüllt)**
- Hintergrund: `rgba(255, 255, 255, 0.2)` (Milchglas)
- Text: Weiß (`#FFFFFF`)
- Rahmen: keiner
- Rahmenradius: leicht abgerundet (4px)
- Innenabstand: 12px 16px
- Schrift: 16px regular

### Karten & Container

- Hintergrund: Deep Teal (`#02090A`) auf dunklen Seiten
- Rahmen: 1px solid `#1E2C31` (Dark Card Border) — kaum sichtbare Grenze
- Rahmenradius: 8px für Standard-Karten, 12px für Featured-Karten, 20px 20px 0 0 für oben abgerundete Karten
- Schatten: Mehrschichtiges System:
  - Ruhezustand: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - Das eingefügte weiße Highlight erzeugt ein subtiles Leuchten an der Oberkante
- Hover: Schatten weitet sich aus, Karte kann leicht aufhellen
- Übergang: box-shadow 300ms ease, transform 200ms ease

### Eingaben & Formulare

- Hintergrund: transparent oder Dark Forest (`#061A1C`)
- Text: Weiß (`#FFFFFF`)
- Rahmen: 1px solid `#3F3F46` (Shade-70)
- Rahmenradius: 8px
- Innenabstand: 12px 16px
- Fokus: 2px solid `#36F4A4` (Neon Green Fokusring)
- Platzhalter: Shade-50 (`#71717A`)
- Übergang: border-color 200ms ease

### Navigation

- Hintergrund: transparent (über dunklem Hero überlagert), wird beim Scrollen zu Forest (`#102620`)
- Höhe: ~64px
- Links: Shopify Wortmarken-Logo (SVG, weiß auf dunkel)
- Mitte/Rechts: Nav-Links in 18px/500 NeueHaasGrotesk, weiß, Zeichenabstand 0.72px
- CTA: Weißer Pill-Button "Start for free" (rechts)
- Sekundäre CTA: Ghost-Button mit weißem Rahmen
- Hover: Links wechseln zu Muted Text (`#A1A1AA`) oder erhalten Unterstreichung
- Mobil: Hamburger-Menü, Vollbild-dunkle Überlagerung
- Übergang: background 300ms ease beim Scrollen

### Bildbehandlung

- Produkt-Screenshots: eingebettet in dunkle UI-Kontexte, passend zur umgebenden Dunkelheit
- Admin-Interface-Vorschauen: auf dunklen Hintergründen mit subtilen Kartenrändern gezeigt
- Seitenverhältnisse: variiert — Hero-Bilder sind breit (ca. 16:9), Feature-Aufnahmen sind flexibel
- Alle Bilder liegen bündig in dunklen Containern — keine hellen Rahmen oder Umrandungen
- Lazy Loading mit dunklen Platzhalter-Flächen

### Vertrauensindikatoren

- Statistiken prominent angezeigt: "15+" (Jahre), "150M+" (Käufer)
- Zahlen in Display-Größe in NeueHaasGrotesk
- Partner-/Entwickler-Ökosystem-Callout-Abschnitte
- Dunkel gestaltete Testimonials, nahtlos in den Seitenfluss integriert

## 5. Layout-Prinzipien

### Abstandssystem

Basiseinheit: 8px

| Token | Wert | Verwendung |
|-------|-------|-----|
| space-1 | 4px | Enge Inline-Abstände |
| space-2 | 8px | Basiseinheit, Icon-Abstände |
| space-3 | 12px | Karten-Innenabstand, enge Außenabstände |
| space-4 | 16px | Standard-Element-Innenabstand |
| space-5 | 24px | Karten-Abstände, Abschnitts-Innenabstand |
| space-6 | 28px | Mittlerer Abschnittsabstand |
| space-7 | 32px | Abschnittsumbrüche |
| space-8 | 36px | Großer Innenabstand |
| space-9 | 40px | Hauptabschnitts-Innenabstand |
| space-10 | 64px | Hero-Abschnitts-Innenabstand, große Abstände |

### Raster & Container

- Maximale Container-Breite: ~1280px (zentriert)
- Hero: volle Breite, randlos dunkler Hintergrund mit zentriertem Text
- Feature-Abschnitte: 2-Spalten-Layouts mit Text und Produkt-Screenshots
- Stats-Abschnitte: horizontales Layout mit großen Zahlen
- Horizontale Abstände: 64px Desktop, 32px Tablet, 16px Mobil
- Rasterabstand: 24–32px zwischen großen Inhaltsblöcken

### Weißraum-Philosophie

Shopifys Weißraum-Strategie ist theatralisch. Abschnitte werden durch weite Flächen dunklen Raums getrennt — 80px bis 120px reines schwarzes Atemraum — der den Rhythmus einer Präsentation, nicht einer Webseite erzeugt. Jeder Inhaltsblock ist seine eigene "Folie" in einem Keynote-artigen Scroll. Innerhalb der Abschnitte ist der Abstand enger und durchdachter, was fokale Dichte gegen das weitläufige Nichts erzeugt. Der Kontrast zwischen makroskopischer Leere und mikroskopischer Präzision verleiht der Seite ihre kinematische Kadenz.

### Rahmenradius-Skala

| Wert | Kontext |
|-------|---------|
| 4px | Tags, Badges, Micro-Elemente |
| 8px | Standard-Karten, Eingaben, Video-Container |
| 12px | Featured-Karten, Bild-Container, Buttons (nicht Pille) |
| 20px | Oben abgerundete Karten (20px 20px 0 0), Modal-Header |
| 340px | Große abgerundete dekorative Elemente |
| 9999px | Pill-Buttons, Pill-Badges, Nav-Elemente |

## 6. Tiefe & Elevation

| Ebene | Behandlung | Verwendung |
|-------|-----------|-----|
| Basis | Kein Schatten, dunkle Fläche | Standard-Seitenhintergrund |
| Subtil | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + eingefügtes weißes Leuchten | Ruhende Karten |
| Mittel | Mehrschichtig: 1px Ring + 2px + 4px + 8px Schattenstapel | Erhöhte Karten, Featured-Abschnitte |
| Hoch | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modals, Dropdowns, Overlays |
| Fokus | `0px 0px 0px 2px #36F4A4` | Tastaturfokusring (Neon Green) |

Shopifys Schattensystem ist ungewöhnlich ausgefeilt. Anstatt einzelner Schattenwerte verwenden Karten einen gestapelten, mehrschichtigen Ansatz: einen 1px-Ring zur Grenzziehung, progressive 2px/4px/8px-Unschärfen für natürlichen Lichtabfall und ein zartes eingefügtes weißes Leuchten (`rgba(255,255,255,0.03)`), das eine von oben beleuchtete Glasoberfläche simuliert. Auf dunklen Hintergründen verdunkeln Schatten von bereits dunklen Flächen aus, sodass die Schatten eher als "Ambient Occlusion" funktionieren als als traditionelle Elevation — die Karte erscheint leicht in die Fläche einzusinken, statt über ihr zu schweben.

### Dekorative Tiefe

- **Dunkle Teal-Gradienten**: Ambient-Radialwaschungen hinter Hero-Abschnitten und Produkt-Showcases
- **Spotlight-Effekte**: Helle zentrierte Bereiche verblassen zu Schwarz und erzeugen Keynote-artige theatralische Beleuchtung
- **Randleuchten**: Subtile hellfarbige Kanten auf dunklen Karten via eingefügtem Box-Shadow
- **Grüne atmosphärische Halos**: Schwache Grüntöne in Hintergrundgradienten, die den Markenakzent widerspiegeln

## 7. Gebote & Verbote

### Gebote

- Verwende die dunkle Teal-Schwarz-Flächenhierarchie (Void → Deep Teal → Dark Forest → Forest) für Tiefe
- Halte die Display-Typografie bei Gewicht 330–400 — die ätherische Leichtigkeit ist die Signatur des Designs
- Verwende Neon Green (`#36F4A4`) ausschließlich für Fokuszustände und kritische Akzenthighlights
- Wende 9999px Radius auf alle primären CTA-Buttons an — die volle Pille ist nicht verhandelbar
- Verwende das mehrschichtige Schattensystem für Karten-Elevation — einzelne Schatten wirken flach
- Behalte das `ss03`-OpenType-Feature für den gesamten Text bei — es ist Teil der typografischen Identität
- Verwende Inter Variable für Fließtext und NeueHaasGrotesk für Überschriften — vertausche ihre Rollen nie
- Schaffe theatralische Abstände zwischen Abschnitten (80px+) für kinematisches Tempo

### Verbote

- Verwende kein reines Schwarz (#000000) für Text auf dunklen Hintergründen — verwende nur Weiß (#FFFFFF)
- Füge keine warmen Farben ein (Orange, Rot, Gelb) — die Palette ist streng kühl (Grüntöne, Teals, Neutraltöne)
- Verwende keine Schriftgewichte über 500 für NeueHaasGrotesk-Fließtext — schwere Gewichte brechen das ätherische Gefühl
- Trage keine Grünakzente auf große Flächen auf — Neon Green ist für kleine, präzise Highlights reserviert
- Verwende keine scharfen Ecken (0px Radius) auf interaktiven Elementen — alles wird gerundet
- Füge keine hellen Hintergründe hinzu — das dunkle Thema ist fundamental, nicht optional
- Verwende keine einschichtigen Box-Shadows — der gestapelte Ansatz ist das System
- Setze die Zeilenhöhe für Fließtext nicht über 1.56 — Shopifys Text ist relativ kompakt
- Mische NeueHaasGrotesk und Inter nicht in derselben Größe/Rolle — ihre Gewichtsskalen unterscheiden sich
- Verwende keinen negativen Zeichenabstand für Überschriften — Shopify-Überschriften sind neutral oder positiv gesperrt

## 8. Responsives Verhalten

### Breakpoints

| Name | Breite | Wesentliche Änderungen |
|------|-------|-------------|
| Mobil | <640px | Einzelspalte, Hamburger-Nav, Display-Text skaliert auf 48px, 16px Innenabstand |
| Tablet | 640–1024px | 2-Spalten-Raster beginnen, Display-Text bei 70px, 32px Innenabstand |
| Desktop | 1024–1440px | Volles Layout, erweitertes Nav, 96px Display, 64px Innenabstand |
| Großer Desktop | >1440px | Max-Breite Container zentriert, vergrößerte Abschnittsabstände |

### Touch-Ziele

- Mindest-Touch-Ziel: 44x44px (WCAG AAA)
- Pill-Buttons: Mindesthöhe 48px mit großzügigem horizontalem Innenabstand
- Nav-Links: 44px Touch-Fläche
- Karten-Flächen: gesamte Karte ist klickbar, wo verlinkt

### Kollaps-Strategie

- **Navigation**: Volle horizontale Links → Hamburger-Menü unter 1024px; Logo und CTA-Button bleiben sichtbar
- **Hero-Abschnitt**: 96px Display → 70px auf Tablet → 48px auf Mobil; behält einspaltige Zentrierung bei
- **Feature-Abschnitte**: 2-Spalten Text+Bild → gestapelte Einzelspalte unter 768px
- **Stats**: Horizontale Reihe → gestapelt vertikal auf Mobil
- **Abschnitts-Innenabstand**: 64px → 40px → 24px → 16px mit schmalem Viewport
- **Karten**: Raster → Stapel, Vollbreite auf Mobil beibehalten

### Bildverhalten

- Produkt-Screenshots: responsiv in dunklen Containern, Seitenverhältnis beibehalten
- Hero-Bilder: volle Breite auf allen Breakpoints, lazy geladen mit dunklen Platzhaltern
- Admin-UI-Vorschauen: proportional skaliert, können auf Mobil beschnitten werden
- Alle Bilder verwenden CDN (`cdn.shopify.com`) mit responsivem srcset

## 9. Agent Prompt-Leitfaden

### Kurzreferenz Farben

- Primäre CTA: Shopify White (`#FFFFFF`)
- Seitenhintergrund: Void Black (`#000000`)
- Kartenoberfläche: Deep Teal (`#02090A`)
- Abschnitts-Hg.: Dark Forest (`#061A1C`)
- Erhöhter Hg.: Forest (`#102620`)
- Akzent: Neon Green (`#36F4A4`)
- Fließtext: Weiß (`#FFFFFF`)
- Gedämpfter Text: Muted (`#A1A1AA`)
- Dunkler Rahmen: Dark Card Border (`#1E2C31`)

### Beispiel-Komponenten-Prompts

- "Erstelle einen Hero-Abschnitt auf echtem schwarzem (#000000) Hintergrund mit einer 96px/330 NeueHaasGrotesk-Überschrift in Weiß, einem 20px/500 Untertitel in #A1A1AA und zwei Pill-Buttons: weiß gefüllt (9999px Radius) und Ghost mit 2px weißem Rahmen"
- "Designe eine Feature-Karte auf Deep Teal (#02090A) mit 1px #1E2C31 Rahmen, 12px Radius, mehrschichtigem Schatten (1px Ring + 2px/4px/8px Blur bei 10% Schwarz), einer 32px/360 weißen Überschrift und 18px/400 #A1A1AA Fließtext"
- "Erstelle einen Stats-Abschnitt auf Dark Forest (#061A1C) mit 96px/750 weißen Zahlen (NeueHaasGrotesk), 16px/400 #A1A1AA beschreibenden Labels und großzügigem 64px Abstand zwischen den Stat-Blöcken"
- "Erstelle eine klebrige Nav mit transparentem Hintergrund (wird beim Scrollen #102620), weißem Shopify-Logo links, 18px/500 weißen Nav-Links mit 0.72px Zeichenabstand und einem weißen Pill-Button 'Start for free' rechts"
- "Designe ein Tag/Badge mit rgba(255,255,255,0.2) Milchglas-Hintergrund, 4px Radius, 12px 16px Innenabstand, weißem 16px Text — schwebt über einer dunklen Kartenoberfläche"

### Iterations-Leitfaden

Beim Verfeinern bestehender Screens, die mit diesem Design-System erstellt wurden:
1. Konzentriere dich auf EINE Komponente auf einmal
2. Verweise auf spezifische Farbnamen und Hex-Codes aus diesem Dokument
3. Denke daran: Dies ist ein DARK-FIRST-Design — helle Flächen sind die Ausnahme, nicht die Regel
4. Display-Text sollte immer federleicht wirken (Gewicht 330–400) — wenn er schwer wirkt, reduziere das Gewicht
5. Neon Green (#36F4A4) ist kostbar — sparsam verwenden, nur für Fokus und Akzent
6. Die dunkle Flächenhierarchie (schwarz → deep teal → dark forest → forest) erzeugt subtile Tiefe
7. Schatten sind mehrschichtig — ein einzelner `box-shadow`-Wert wird das Shopify-Kartengefühl nicht erfassen
8. Das `ss03`-OpenType-Feature muss auf dem gesamten Text aktiv sein, um typografische Konsistenz zu gewährleisten
