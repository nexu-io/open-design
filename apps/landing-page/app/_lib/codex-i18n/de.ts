/*
 * German copy for the curated Codex design collection.
 * Translated from the English baseline in `../codex-i18n.ts`.
 */
import type { CodexCopyOverride } from './index';

export const de: CodexCopyOverride = {
  collectionEyebrow: 'Kuratierte Sammlung',
  collectionHeading: 'Die Design-Plugins, mit denen Codex echtes UI liefert',
  collectionLede:
    'OpenAI Codex schreibt funktionierenden Code. Sich selbst überlassen landet er bei sicheren Fonts, mittelmäßigen Abständen und zentrierter Helvetica. Diese Plugins geben ihm Geschmack: ästhetische Skills und Design-System-Regeln. Installiere eins davon, oder nutze alle in Open Design.',
  collectionStats: [
    { value: '50', label: 'kuratierte Plugins' },
    { value: '13', label: 'Quell-Repos' },
    { value: 'Open', label: 'Source & geprüft' },
  ],
  collectionIntro:
    'Jedes Plugin hier unten existiert wirklich und verlinkt auf seine Quelle. Sie erledigen zwei Aufgaben: ästhetischen Geschmack setzen, bevor Code entsteht, und dein Design-System in Regeln gießen, an die sich der Agent hält.',
  collectionCategoryBlurbs: [
    'Überschreibe die ästhetischen Standardentscheidungen von Codex, bevor die erste Zeile fällt.',
    'Mach aus deinen Tokens und Komponenten Regeln, denen Codex folgt, statt zu improvisieren.',
  ],
  collectionCloserHeading: 'Spar dir das Setup. Designe mit Codex in Open Design',
  filterAll: 'Alle',
  collectionCloserBody:
    'Open Design ist der quelloffene, agent-native Design-Workspace rund um Codex. Er hält Systeme, Skills und Templates konsistent, damit der Agent Arbeit liefert, die dir gehört.',
  categoryFrontend: 'Frontend & UI',
  categoryDesignSystems: 'Design-Systeme',
  ctaDownload: 'Open Design herunterladen',
  ctaStarList: 'Liste mit einem Star versehen',
  ctaBrowseAll: 'Alle Plugins ansehen',
  ctaViewSource: 'Quelle ansehen',
  ctaOurRepo: 'codex-design auf GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Was es macht',
  cardCta: 'Plugin ansehen',
  detailWhatIsIt: 'Worum es geht',
  detailWhyForDesign: 'Warum das fürs Design zählt',
  detailHowWithCodex: 'So nutzt du es mit Codex',
  detailExampleTag: 'Wann du danach greifst',
  detailSource: 'Quelle',
  detailCategory: 'Kategorie',
  detailMaintainer: 'Autor',
  detailTags: 'Tags',
  detailLicense: 'Lizenz',
  detailCovers: 'Was es abdeckt',
  detailUpstream: 'Aus der Upstream-SKILL.md',
  detailCodexNote: 'Läuft mit Codex',
  detailTraction: 'Resonanz',
  detailRepo: 'Quell-Repository',
  detailStars: 'Stars',
  installHeading: 'So installierst du es',
  installRunInCodex: 'Führe das in Codex aus.',
  installRestart: 'Starte Codex neu, damit er den neuen Skill lädt.',
  installClone: 'Klone das Repo.',
  installPoint: 'Verweise Codex auf die Skill-Datei.',
  installThenUse: 'Beschreibe dann das gewünschte UI. Codex folgt dem Skill.',
  installNote:
    'Jedes Plugin hier ist kostenlos, quelloffen und verlinkt auf seine echte Originalquelle.',
  installNoteCta: 'Die ganze Sammlung ansehen',
  detailMoreOnList: 'Mehr auf der codex-design-Liste',
  detailRelated: 'Weitere Codex-Design-Plugins',
  finalEyebrow: 'Nächster Schritt',
  detailCloserHeading: 'Mit Open Design designen, ohne Setup',
  detailCloserBody:
    'Installiere dieses Plugin selbst, oder leg mit Open Design eine ganze kuratierte Design-Ebene um Codex. Eigener Key, eigenes Ergebnis.',
  skills: {
    'gpt-taste': {
      tagline: 'Baut preisverdächtige Landingpages mit GSAP-Scroll-Motion und lückenlosen Bento-Grids.',
      whatIsIt:
        'Eine Frontend-Direktive, die Layout-Varianz über simulierte Zufallsauswahl von Hero, Typografie, Komponenten und GSAP-Paradigmen erzwingt. Sie setzt außerdem eine AIDA-Seitenstruktur und großzügige Section-Abstände durch.',
      whyForDesign: [
        'Hero-Headlines bleiben zwei bis drei Zeilen lang, weil Container breiter werden, statt zu Textwänden umzubrechen.',
        'Bento-Grids nutzen grid-flow-dense, damit keine Zelle leer oder verzerrt bleibt.',
        'Billige Meta-Labels sind verboten, und der Textkontrast von Buttons wird vor der Ausgabe geprüft.',
      ],
      howWithCodex: [
        'Frag nach einer Seite, und der Skill liefert zuerst einen design_plan-Block, bevor UI-Code entsteht.',
        'Prüf seine Zufallsauswahl: Hero-Layout, Font-Stack, Komponenten, GSAP-Paradigmen.',
        'Kontrolliere die Pre-Flight-Punkte: Hero-Breitenrechnung, Grid-Dichte, Label-Check, Kontrast.',
      ],
    },
    'stitch-design-taste': {
      tagline: 'Schreibt eine DESIGN.md, die Google Stitch zu nicht-generischen Screens lenkt.',
      whatIsIt:
        'Erzeugt eine DESIGN.md-Datei, die auf die Screen-Generierung von Google Stitch abgestimmt ist. Sie kodiert Atmosphäre, Farbe, Typografie, Komponenten, Layout, Motion und eine explizite Liste verbotener Muster.',
      whyForDesign: [
        'Stitch-Screens erben eine Akzentfarbe unter 80 % Sättigung statt Neon-Lila-Verläufen.',
        'Zentrierte Heros und drei gleich große Kartenreihen sind oberhalb der festgelegten Varianz verboten.',
        'Loading- und Empty-States werden skeletal und komponiert statt generischer Spinner.',
      ],
      howWithCodex: [
        'Beschreib die Stimmung des Projekts, und der Skill setzt Werte für Dichte, Varianz und Motion.',
        'Er liefert eine DESIGN.md mit sieben Abschnitten, Hex-Codes und funktionalen Farbrollen.',
        'Gib diese Datei direkt an Stitch weiter, oder über den Stitch-MCP-Server.',
      ],
    },
    'image-to-code': {
      tagline: 'Erzeugt zuerst Design-Bilder, analysiert sie und baut dann passenden Frontend-Code.',
      whatIsIt:
        'Ein bildgetriebener Workflow für visuelle Web-Aufgaben. Der Agent erzeugt Referenzbilder je Section, extrahiert daraus Typografie, Abstände, Farbe und Komponenten und baut die Seite passend dazu.',
      whyForDesign: [
        'Der Code folgt einer echten visuellen Referenz, damit die Umsetzung nicht in generische Layouts abdriftet.',
        'Jede Section bekommt ein eigenes großes Bild, sodass Text und Abstände analysierbar bleiben.',
        'Heros bleiben unter drei Headline-Zeilen und frei von verschachtelten Container-Stapeln.',
      ],
      howWithCodex: [
        'Gib die Anzahl der Sections an, dann erzeugt der Skill in Codex ein Bild pro Section.',
        'Frag nach einem Detail-Render, wenn Button- oder Schrift-Details unleserlich bleiben.',
        'Lass ihn den Klarheits-Check laufen, bevor er Implementierungsdateien schreibt.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Erzeugt hochwertige Mobile-App-Screen-Flows als Bilder, nicht als Code.',
      whatIsIt:
        'Ein reiner Bild-Skill für Mobile-Screen-Konzepte und -Flows über iOS, Android und plattformübergreifende Produkte hinweg. Er zeigt Screens in sauberen Handy-Mockups und schreibt nie Code.',
      whyForDesign: [
        'Screens respektieren Safe Areas und Systembereiche, statt wie Websites in einem Handy zu wirken.',
        'Eine festgelegte Design-Bibel hält Palette, Schrift und Icons über alle Screens hinweg konsistent.',
        'Mehrteilige Screen-Sets ergeben einen glaubwürdigen Flow statt beziehungsloser Einzel-Mockups.',
      ],
      howWithCodex: [
        'Nenn App-Kategorie und Anzahl der Screens, jeder Screen wird ein eigenes Bild.',
        'Der Skill wählt zuerst einen Plattform-Modus: iOS, Android oder plattformneutral.',
        'Lass ihn jeden Screen neu erzeugen, bei dem Text zu klein oder der Rahmen ungleichmäßig ist.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Erzeugt ein horizontales Referenzbild pro Section einer Landingpage.',
      whatIsIt:
        'Ein Bild-Regie-Skill für Website-Design-Referenzen. Er erzeugt ein separates horizontales Bild je Section, mit einer festen Palette und variierender Hero-Komposition über das gesamte Set.',
      whyForDesign: [
        'Eine Landingpage mit acht Sections ergibt acht lesbare Comps, kein zusammengequetschtes Board.',
        'Die Hero-Komposition variiert über das ausgelutschte Standardmuster links Text, rechts Bild hinaus.',
        'Eine Palette, eine Schriftskala und eine CTA-Familie gelten für jeden erzeugten Frame.',
      ],
      howWithCodex: [
        'Sag, wie viele Sections du willst, ohne Angabe setzt der Skill standardmäßig sechs an.',
        'Der Skill nennt zuerst die Anzahl und beschriftet dann jede Ausgabe mit ihrer Section-Nummer.',
        'Gib Stimmungswörter wie editorial oder cinematic an, um Hero-Größe und Hintergrund zu lenken.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Baut warme, monochrome Editorial-Interfaces mit flachen Bento-Grids.',
      whatIsIt:
        'Ein Frontend-Protokoll für minimalistische, dokumentartige Interfaces. Es legt eine warme monochrome Palette fest, eine typografische Hierarchie aus Serif und Mono, Bento-Karten mit 1px-Rand und gedämpfte Pastellakzente.',
      whyForDesign: [
        'Jede Karte und jeder Trenner nutzt einen einzigen 1px hellgrauen Rand mit klarem Radius.',
        'Akzente kommen nur aus vier blassen Pastelltönen, reserviert für Tags und Inline-Code.',
        'Sections gewinnen Tiefe durch Bildmaterial mit geringer Deckkraft statt flacher, leerer Hintergründe.',
      ],
      howWithCodex: [
        'Frag nach einer Seite, der Skill legt zuerst den groben Weißraum fest, py-24 oder py-32.',
        'Er begrenzt die Textbreite auf max-w-4xl und wendet die monochromen Variablen sofort an.',
        'Scroll-Einblendungen laufen über IntersectionObserver, ausschließlich auf transform und opacity.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Liest das Briefing, wählt eine Richtung, liefert Interfaces ohne Templates.',
      whatIsIt:
        'Ein Anti-Slop-Frontend-Skill für Landingpages, Portfolios und Redesigns. Er formuliert eine Design-Einschätzung, setzt Regler für Varianz, Motion und Dichte und durchläuft dann eine lange Pre-Flight-Prüfung.',
      whyForDesign: [
        'Enterprise-Briefings bekommen das offizielle Design-System-Paket statt handgestrickter Lookalike-CSS.',
        'Die Pre-Flight-Prüfung verbietet Gedankenstriche, nummerierte Section-Eyebrows, Scroll-Hinweise und doppelte CTA-Absichten.',
        'Layout-Wiederholung ist gedeckelt, acht Sections nutzen mindestens vier unterschiedliche Familien.',
      ],
      howWithCodex: [
        'Der Agent formuliert eine einzeilige Design-Einschätzung, bevor er Code schreibt.',
        'Er setzt drei Regler: Design-Varianz, Motion-Intensität und visuelle Dichte.',
        'Jeder Punkt der Pre-Flight-Liste muss bestehen, sonst gilt die Seite nicht als fertig.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Baut strenge Interfaces im Schweizer Print-Stil oder als CRT-Terminal mit analogem Korn.',
      whatIsIt:
        'Ein Design-System für Interfaces, das Schweizer Typografie-Print mit militärischer Terminal-Ästhetik verbindet. Es legt strenge Raster, extremen Kontrast in der Schriftskala, einen einzigen Warnrot-Akzent und simulierte analoge Degradation fest.',
      whyForDesign: [
        'Pro Projekt wird ein Untergrund gewählt, Hell und Dunkel mischen sich nie.',
        'border-radius ist komplett verbannt, jede Ecke bleibt bei neunzig Grad.',
        'Halbton-, Scanline- und Rauschfilter verhindern, dass Flächen wie flache Vektorgrafik wirken.',
      ],
      howWithCodex: [
        'Wähl einen Archetyp: Schweizer Industrie-Print oder taktisches CRT-Telemetrie-Terminal.',
        'Große Überschriften nutzen clamp mit negativem Tracking, Metadaten laufen in kleiner Großbuchstaben-Monospace.',
        'Grid-Abstände von 1px mit kontrastierenden Hintergründen erzeugen die messerscharfen Trennlinien.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Prüft eine bestehende Seite und wertet sie auf, ohne die Funktion zu brechen.',
      whatIsIt:
        'Ein Scan-, Diagnose- und Fix-Workflow für bestehende Projekte. Er prüft Typografie, Farbe, Layout, States, Inhalt, Icons und Codequalität und setzt dann gezielte Upgrades im bestehenden Stack um.',
      whyForDesign: [
        'Lila-blaue KI-Verläufe und drei gleich große Kartenreihen werden durch durchdachte Alternativen ersetzt.',
        'Buttons in Kartengruppen richten sich trotz unterschiedlicher Inhalte an einer einzigen unteren Linie aus.',
        'Fehlende Hover-, Focus-, Loading-, Empty- und Error-States werden ergänzt.',
      ],
      howWithCodex: [
        'Er scannt zuerst die Codebasis, um Framework und Styling-Methode zu identifizieren.',
        'Er listet jedes generische Muster und jede Schwachstelle auf, bevor er etwas ändert.',
        'Fixes landen in Prioritätsreihenfolge: Fonts, Farbe, States, Layout, Komponenten, Typografie-Feinschliff.',
      ],
    },
    'brandkit': {
      tagline: 'Erzeugt Brand-Guideline-Boards, Logo-Systeme und Identity-Decks als Bilder.',
      whatIsIt:
        'Ein Bildgenerierungs-Skill für Brand-Kit-Boards. Er erzeugt Logo-Systeme, Farb- und Schrift-Panels, Mockups und Stimmungsbilder, angeordnet auf einem rasterbasierten Präsentationsboard.',
      whyForDesign: [
        'Ein Standard-3x3-Panelsystem deckt Logo, Konstruktion, Farbe, Schrift und Anwendungen ab.',
        'Logo-Konzepte folgen einer genannten Methode wie Monogramm, Metapher-Fusion oder Negative Space.',
        'Boards haben Rhythmus: ruhige, funktionale, emotionale und technische Panels statt einheitlicher Lautstärke.',
      ],
      howWithCodex: [
        'Nenn Marke und Kategorie, der Skill wählt zuerst einen visuellen Modus.',
        'Standardmäßig entsteht ein 3x3-Board, oder ein 2x3-Mini-Deck im Referenzstil.',
        'Halt den Text knapp: Markenname, ein Slogan, ein Befehl, ein paar Labels.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Scroll-getriebene Narration: Lenis, ScrollTrigger, Sticky-Stapel.',
      whatIsIt:
        'Ein Skill für Scroll-Choreografie: Lenis Smooth Scrolling, GSAP ScrollTrigger, gestaffelte Reveals, Sticky-Card-Stapel, Parallax und scroll-gesteuerte Übergänge.',
      whyForDesign: [
        'Scroll-Choreografie ist der größte Unterschied zwischen einer Agenten-Seite und einer Studio-Seite.',
        'Liefert benannte Motion-Tokens statt willkürlicher Animationswerte.',
        'Definiert eine Seitenanatomie, damit die Sections in bewusster Reihenfolge auftreten.',
      ],
      howWithCodex: [
        'Klone das Repo und verweise Codex auf diese Skill-Datei.',
        'Beschreibe die Geschichte, die die Seite beim Scrollen erzählen soll.',
        'Stimme die Motion-Tokens ab, aber behalte Stapel und Anatomie des Skills bei.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'Ein echtes, beleuchtetes 3D-Hero-Objekt statt CSS-Transform-Trick.',
      whatIsIt:
        'Ein echtes 3D-WebGL-Objekt mit geometrischer Mesh-Tiefe, physikalisch basiertem Material, gerichtetem und Umgebungslicht, perspektivischer Kamera und schwebender Bewegung.',
      whyForDesign: [
        'Agenten greifen zu CSS-Transforms und bekommen eine flache Attrappe. Hier gibt es echtes Licht.',
        'Material- und Licht-Defaults lassen das Objekt wie ein Produkt wirken, nicht wie Spielzeug.',
        'Die Bewegung ist bewusst dezent, damit das Objekt den Hero trägt statt ihn zu stehlen.',
      ],
      howWithCodex: [
        'Klone das Repo und verweise Codex auf diese Skill-Datei.',
        'Frag nach einem 3D-Hero-Objekt und beschreibe das gewünschte Material.',
        'Passe Material- und Licht-Defaults an, aber behalte das Kamera-Rezept.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Feine Verlaufskanten für Karten, Panels und Navigationsleisten.',
      whatIsIt:
        'Ein Skill für Oberflächendetails: dezente Verlaufsränder für Karten, Preis-Panels, Navigationsleisten, Modals, Buttons und Hero-Flächen, ganz ohne lautes Glühen.',
      whyForDesign: [
        'Die Kante entscheidet, ob eine Fläche premium wirkt oder nach schlichtem Rahmenkasten aussieht.',
        'Kodiert Geschmacksregeln, damit der Effekt dezent bleibt und nicht in Neon kippt.',
        'Bringt eine Tailwind-Abkürzung mit und passt so in einen bestehenden Stack.',
      ],
      howWithCodex: [
        'Klone das Repo und verweise Codex auf diese Skill-Datei.',
        'Frag nach der Komponente. Der Skill liefert die Kantenbehandlung.',
        'Wähle je nach Fläche das einfache oder das maskierte Muster.',
      ],
    },
    'high-end-visual-design': {
      tagline: 'Blockiert generische KI-Defaults und erzwingt Layout und Motion auf Agenturniveau.',
      whatIsIt:
        'Ein direktiver Skill, der gängige KI-Design-Defaults verbietet und den Agenten zwingt, vor jedem UI-Code einen Vibe-Archetyp und einen Layout-Archetyp zu wählen.',
      whyForDesign: [
        'Inter, Roboto und fette Lucide-Icons sind verboten, damit die Ausgabe nicht mehr nach Template aussieht.',
        'Karten bekommen eine äußere Hülle plus inneren Kern, was Containern echte, präzise Tiefe gibt.',
        'Das Section-Padding startet bei py-24, damit Layouts atmen statt zu drängen.',
      ],
      howWithCodex: [
        'Frag Codex nach einer Seite, er würfelt zuerst still die Varianz-Engine.',
        'Er legt Hintergrundtextur und Schriftskala an und baut dann Container mit doppeltem Rahmen.',
        'Er spielt eigene cubic-bezier-Motion ein und läuft dann die Pre-Output-Checkliste durch.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Ordnet einer Frontend-Aufgabe genau eine kuratierte, meinungsstarke Bibliothek zu.',
      whatIsIt:
        'Ein Nachschlage-Skill, den du explizit aufrufst. Er ordnet eine genannte Aufgabe einer einzigen empfohlenen Bibliothek aus einer kuratierten Tabelle zu, die Primitives, Motion, Charts, Virtualisierung, State und Styling abdeckt.',
      whyForDesign: [
        'Eine Empfehlung pro Aufgabe, also keine Optionsliste, über die man streiten muss.',
        'Prüft zuerst die package.json, um wiederzuverwenden, was das Projekt schon hat.',
        'Erkennt selbstgebaute Dropdowns und Toasts und ersetzt sie durch barrierefreie Primitives.',
      ],
      howWithCodex: [
        'Ruf ihn explizit auf, von selbst löst er nie aus.',
        'Nenn die Aufgabe, nicht den Bibliotheksnamen, etwa ‚Ich brauche Toasts‘.',
        'Er nennt eine Bibliothek, erklärt ihren Einsatz und bindet sie ein.',
      ],
    },
    'apple-design': {
      tagline: 'Apples fluide Interface-Prinzipien, übersetzt in Web-Springs und Gesten.',
      whatIsIt:
        'Wissen aus Apples WWDC-Design-Talks, vor allem Designing Fluid Interfaces, übertragen auf CSS, Pointer Events und Spring-Bibliotheken. Deckt Reaktion, Unterbrechbarkeit, Momentum, Materialien, Typografie und Barrierefreiheit ab.',
      whyForDesign: [
        'Feedback feuert bei pointer-down, damit gedrückte Elemente nicht mehr tot wirken.',
        'Animationen starten vom aktuellen Bildschirmwert, das entfernt sichtbare Sprünge bei Unterbrechung.',
        'Flicks projizieren einen Landepunkt, damit Würfe dort landen, wohin die Geste zielte.',
      ],
      howWithCodex: [
        'Bitte Codex um ein Sheet, ein Drawer oder eine Drag-Interaktion.',
        'Er trackt 1:1 per Pointer Capture und protokolliert den Geschwindigkeitsverlauf.',
        'Beim Loslassen übergibt er die Geschwindigkeit an ein Spring mit den mitgelieferten Damping-Werten.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Macht aus einer vagen Motion-Beschreibung den exakten Fachbegriff.',
      whatIsIt:
        'Ein Glossar zum Rückwärtsnachschlagen. Du beschreibst einen Motion-Effekt lose, und der Skill liefert den präzisen Begriff, wörtlich zitiert, mit nahen Alternativen, wenn mehrere passen könnten.',
      whyForDesign: [
        'Gibt Designern das richtige Wort, um einen Agenten zu prompten.',
        'Trennt nahe Paare wie clip-path versus mask oder Pop-in versus Bounce.',
        'Erfindet keine Begriffe, damit die Benennung verlässlich bleibt.',
      ],
      howWithCodex: [
        'Beschreib, was du gesehen hast, etwa ‚den iOS-Rubber-Band-Scroll‘.',
        'Er liefert den fett gesetzten Begriff plus eine einzeilige Glossardefinition.',
        'Frag nach Alternativen, wenn zwei Begriffe plausibel passen könnten.',
      ],
    },
    'emil-design-eng': {
      tagline: 'Emil Kowalskis Regeln für Animations-Timing, Easing und Komponenten-Feinschliff.',
      whatIsIt:
        'Kodiert eine Design-Engineering-Philosophie: ein Entscheidungsframework für Animation, Spring-Empfehlungen, Komponentenprinzipien, clip-path-Techniken, Gesten-Handling, Performance-Regeln und eine Review-Checkliste.',
      whyForDesign: [
        'Häufige Aktionen verlieren ihre Animation ganz, damit Command Palettes sofort bleiben.',
        'Einblendungen starten bei scale(0.95), nie bei scale(0), damit nichts aus dem Nichts erscheint.',
        'Popovers skalieren von ihrem Trigger statt aus der Mitte und wahren so den räumlichen Bezug.',
      ],
      howWithCodex: [
        'Bitte Codex, UI-Code zu prüfen, er liefert eine Before-After-Why-Tabelle.',
        'Bei neuer Motion beantwortet er: sollte das animieren, warum, welches Easing, wie schnell.',
        'Er wendet die Checkliste an und markiert transition: all sowie Dauern über 300ms.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Ein Einstiegspunkt, der Logo-, Identity-, Slide-, Banner- und Icon-Arbeit verteilt.',
      whatIsIt:
        'Ein einheitlicher Design-Skill, der Aufgaben an Sub-Skills oder eingebaute Module verteilt. Die Module decken Logo-Generierung, Corporate-Identity-Mockups, HTML-Slides, Banner, Social-Fotos und SVG-Icons über Gemini-Skripte ab.',
      whyForDesign: [
        'Logo, Identity-Mockups und Deck entstehen alle aus einem einzigen Brand-Input.',
        'Icons entstehen als SVG-Text, damit sie editierbar bleiben statt Raster.',
        'Banner-Regeln erzwingen Safe Zones, maximal zwei Fonts und einen CTA.',
      ],
      howWithCodex: [
        'Exportiere zuerst GEMINI_API_KEY und installiere google-genai und pillow.',
        'Führe scripts/logo/search.py für ein Design-Briefing aus, dann generate.py für Bilder.',
        'Gib das Logo an scripts/cip/generate.py weiter, um fertige Mockups zu erzeugen.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Gestaltet maßgenaue Banner in HTML und exportiert sie dann als PNGs.',
      whatIsIt:
        'Ein fünfstufiger Banner-Workflow: Anforderungen sammeln, Art Direction recherchieren, das Banner in HTML und CSS mit generierten Visuals bauen, auf exakte Plattform-Pixel screenshotten und dann Optionen zur Iteration zeigen.',
      whyForDesign: [
        'Jedes Banner exportiert in exakten Plattform-Pixeln, damit nichts beschnitten oder skaliert wird.',
        'Generierte Visuals werden ohne Text gerendert, damit Headlines gestochenes HTML bleiben.',
        'Drei Art Directions pro Anfrage, damit der Vergleich vor der Festlegung kommt.',
      ],
      howWithCodex: [
        'Beantworte die Fragen zu Zweck, Plattform, Inhalt, Marke, Stil und Menge.',
        'Er baut ein HTML-Banner pro Art Direction mit angewandten Safe Zones.',
        'Er screenshottet jedes in fester Breite und Höhe und komprimiert Dateien über dem Limit.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'Baut barrierefreie Interfaces mit shadcn-Komponenten und Tailwind-Utilities.',
      whatIsIt:
        'Kombiniert eine shadcn-Komponentenebene auf Radix-Primitives, eine Tailwind-Utility-Styling-Ebene und eine Canvas-Ebene für visuelles Design. Enthält Referenzdateien zu Theming, Barrierefreiheit, Responsive-Regeln und Anpassung.',
      whyForDesign: [
        'Dialoge und Menüs erben Radix’ Focus-Management, damit Barrierefreiheit nicht nachgerüstet wird.',
        'Theme-Farben liegen in CSS-Variablen, damit der Dark Mode konsistent bleibt.',
        'Mobile-First-Breakpoints bedeuten, dass Layouts klein beginnen und nach oben aufbauen.',
      ],
      howWithCodex: [
        'Führe npx shadcn@latest init aus, um Framework und Theme zu konfigurieren.',
        'Füge Komponenten mit npx shadcn@latest add button card dialog form hinzu.',
        'Führe scripts/tailwind_config_gen.py aus, um eine Config mit eigenen Tokens zu erzeugen.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Hält Brand-Guidelines, Design-Tokens und Assets synchron.',
      whatIsIt:
        'Ein Brand-Identity-Skill rund um Skripte, die Brand-Kontext in Prompts einspeisen, Assets validieren, Farben extrahieren und brand-guidelines.md in Design-Token-JSON und CSS-Variablen synchronisieren.',
      whyForDesign: [
        'Eine Markdown-Datei ist die Single Source of Truth für Tokens und CSS.',
        'Extrahierte Farben werden mit der Palette abgeglichen, das fängt Drift früh ab.',
        'Assets werden vor der Freigabe auf Benennung, Größe und Format geprüft.',
      ],
      howWithCodex: [
        'Bearbeite docs/brand-guidelines.md und führe dann scripts/sync-brand-to-tokens.cjs aus.',
        'Prüfe mit scripts/inject-brand-context.cjs --json.',
        'Prüfe jede neue Datei mit scripts/validate-asset.cjs, bevor du sie ausspielst.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Baut HTML-Präsentationsdecks mit Chart.js und Layout-Patterns.',
      whatIsIt:
        'Ein kleiner Routing-Skill für strategische HTML-Präsentationen. Er parst ein Subcommand und lädt dann Referenzdateien zu Layout-Patterns, ein HTML-Template, Copywriting-Formeln und Slide-Strategien.',
      whyForDesign: [
        'Slides sind HTML, damit Schrift und Abstände echten Design-Tokens folgen.',
        'Chart.js übernimmt Daten-Slides, damit Zahlen live bleiben statt eingefügter Bilder.',
        'Layout-Patterns werden aus einem Set gewählt, das hält ein Deck visuell konsistent.',
      ],
      howWithCodex: [
        'Ruf ihn mit dem create-Subcommand plus Thema und Slide-Anzahl auf.',
        'Er lädt references/create.md und folgt diesem Erstellungs-Workflow.',
        'Er zieht Layout-Patterns und Copywriting-Formeln aus den Referenzdateien.',
      ],
    },
    'design-system-tokens': {
      tagline: 'Dreischichtige Design-Tokens, Komponenten-Specs und token-konforme Slide-Generierung.',
      whatIsIt:
        'Ein Design-System-Skill, der Primitive-, Semantic- und Component-Token-Ebenen als CSS-Variablen abdeckt, dazu Komponenten-State-Specs und einen Slide-Generator, der Decks aus denselben Tokens baut.',
      whyForDesign: [
        'Die Semantic-Token-Ebene macht den Wechsel zwischen Light- und Dark-Theme zur Config-Änderung statt zum Rewrite.',
        'Komponenten-Specs listen Default-, Hover-, Active- und Disabled-States auf, damit beim Handoff nichts unklar bleibt.',
        'Ein Validator markiert hartkodierte hex-Werte und hält Komponenten und Slides im Token-System.',
      ],
      howWithCodex: [
        'Führe generate-tokens.cjs gegen eine JSON-Token-Config aus, um deine CSS-Variablendatei zu erzeugen.',
        'Bitte Codex um Komponenten-Specs und führe dann validate-tokens.cjs über src/ aus, um rohe Werte abzufangen.',
        'Nutze search-slides.py mit Position- und Kontext-Flags, um Layouts für ein Deck zu wählen.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Magazin-Layout in Gelasio-Serif auf einem strikten 8pt-Raster.',
      whatIsIt:
        'Ein Design-System-Richtlinien-Skill für einen modernen Editorial-Look: Gelasio-Serif für Fließtext und Display, Ubuntu Mono, Fast-Schwarz #111111 auf weißen Flächen und ein 8pt-Grundlinienraster.',
      whyForDesign: [
        'Display und Fließtext als Serif aus einer Familie halten lange Lesepassagen typografisch konsistent.',
        'Ein 8pt-Grundlinienraster erzwingt vertikalen Rhythmus über Überschriften, Fließtext und Abstände.',
        'Die Barrierefreiheitslatte umfasst reduced-motion-Support, 44px-Touch-Targets und High-Contrast-Handling.',
      ],
      howWithCodex: [
        'Bitte Codex, die Design-Absicht zu wiederholen, und definiere Tokens, bevor du Komponenten anfasst.',
        'Verlange Komponentenregeln zu Anatomie, Varianten, States und Responsive-Verhalten.',
        'Schließ mit der QA-Checkliste ab, damit ein Code-Reviewer die Ausgabe prüfen kann.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Terrakotta-Akzent auf Creme, DM-Serif-Display-Headlines, für Langtexte.',
      whatIsIt:
        'Ein Richtlinien-Skill für ein sonnengebranntes Editorial-Interface: Creme-Flächen #F3E9D8, ein Terrakotta-Akzent #C56A3C, DM-Serif-Display-Headlines, JetBrains Mono. Abgestimmt auf Blogs und Storytelling.',
      whyForDesign: [
        'Nur eine Akzentfarbe, damit Betonung knapp bleibt und Headlines die Hierarchie tragen.',
        'Warme Creme-Flächen mindern das Blenden in langen Artikeln gegenüber reinweißen Seiten.',
        'Display-Serif-Headlines über tintenbraunem Fließtext setzen einen klaren Editorial-Rhythmus.',
      ],
      howWithCodex: [
        'Verweise Codex auf die Terrakotta- und Creme-Tokens, bevor er eine Komponente schreibt.',
        'Verlange Anatomie, Varianten und States pro Komponente, mit explizit benannten Spacing-Tokens.',
        'Verlange Anti-Patterns und Migrationshinweise, wenn du bestehende inkonsistente UI nachrüstest.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Punktmuster-Schattierung und eine begrenzte Palette für retro, kontraststarke Screens.',
      whatIsIt:
        'Ein Richtlinien-Skill für geditherte Interfaces, die Punktmuster nutzen, um Schattierungen aus einer begrenzten Palette zu simulieren. Open Sans für Fließtext, Space Grotesk für Display, IBM Plex Mono, Akzente in Blau und Violett.',
      whyForDesign: [
        'Punktmuster ersetzen Verläufe, damit Schattierung ein bewusst eingeschränktes Farbset übersteht.',
        'Kontraststarkes Rendering hält Text lesbar, selbst wenn Flächen dichte Mustertextur tragen.',
        'Regeln verbieten dekorative Motion und verhindern, dass die Retro-Optik zu visuellem Rauschen wird.',
      ],
      howWithCodex: [
        'Nenn Codex zuerst das Palettenlimit und lass ihn dann musterbasierte Schattierungsregeln ableiten.',
        'Verlange Empty-, Loading- und Error-States, damit gemusterte Flächen lesbar bleiben.',
        'Prüfe Hit Areas und Focus-States, die dieser Skill explizit hervorhebt.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Weich extrudierte Flächen in Steingrau mit Space-Mono-Schrift.',
      whatIsIt:
        'Ein Richtlinien-Skill für neumorphes UI: Innen- und Außenschatten auf einer monochromen Steinfläche #E7E5E4, ein Teal-Akzent #006666, Space Mono für Display und Fließtext, kompaktes Density-Spacing.',
      whyForDesign: [
        'Monochrome Flächen bedeuten, dass Tiefe aus Schatten statt aus Farbkontrast kommt.',
        'Kompaktes Density-Spacing passt zu kontrolllastigen Panels wie Dashboards und Settings-Screens.',
        'Regeln verbieten das Mischen visueller Metaphern, damit weiche Extrusion die einzige Tiefensprache bleibt.',
      ],
      howWithCodex: [
        'Lass Codex Flächen- und Schatten-Tokens setzen, bevor er ein einzelnes Control stylt.',
        'Verlange sichtbare Focus-States, da weiche Schatten allein Tastaturnutzer im Stich lassen.',
        'Fordere semantisches HTML vor ARIA, wie dieser Skill vorgibt.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Raster aus unterschiedlichen Blöcken auf Creme, Inter-Schrift, kompakte Skala.',
      whatIsIt:
        'Ein Richtlinien-Skill für Bento-Box-Layouts, die Inhalte als Rasterblöcke unterschiedlicher Größe zeigen. Durchgängig Inter, eine kompakte Schriftskala von 12 bis 32, Pfirsich- und Blau-Akzente auf Creme.',
      whyForDesign: [
        'Unterschiedliche Blockgrößen tragen die Hierarchie, das Raster selbst übernimmt die Gewichtung.',
        'Eine kompakte Schriftskala von 12 bis 32 packt dichten Text in kleine Kacheln.',
        'Die Creme-Fläche #FFF5E6 hält Blockkanten lesbar ohne schwere Rahmen.',
      ],
      howWithCodex: [
        'Bitte Codex, jedem Block eine Größe nach Content-Priorität zuzuweisen.',
        'Definiere Spacing-Tokens auf der Skala von 4 bis 32, bevor du Kacheln anordnest.',
        'Verlange Overflow- und Long-Label-Handling, das dieser Skill als Edge Cases führt.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Pralle, runde 3D-Formen, Poppins-Headlines, Blau auf Weiß.',
      whatIsIt:
        'Ein Richtlinien-Skill für claymorphes UI: weiche, runde, pralle Formen, die formbaren Ton nachahmen. Poppins für Display, Montserrat für Fließtext, ein Blau-Akzent #3B82F6 und tiefblauer Text auf Weiß.',
      whyForDesign: [
        'Pralle, runde Formen geben Buttons eine klare Druck-Affordanz ohne zusätzliche Labels.',
        'Tiefblauer Text #1C398E auf Weiß hält den Kontrast, während die Palette verspielt bleibt.',
        'Regeln verbieten das Mischen von Metaphern, damit Ton-Tiefe nie mit Glas oder Flat kombiniert wird.',
      ],
      howWithCodex: [
        'Bitte Codex zuerst um Radius- und Schatten-Tokens, da sie den Ton-Look definieren.',
        'Kombiniere Poppins-Display mit Montserrat-Fließtext wie vorgegeben, nicht zwei ähnliche Sans-Schriften.',
        'Prüfe, dass focus-visible- und Disabled-States die weiche Formgebung überstehen.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Rohbeton-inspirierte Layouts, Darker-Grotesque-Display, Rot und Ocker.',
      whatIsIt:
        'Ein Richtlinien-Skill für brutalistisches UI aus der Rohbeton-Architektur der 1950er: schmucklos, funktional, bewusst schroff. Darker-Grotesque als Display-Schrift, Rot #DD614C und Ocker #DAA144 auf Weiß.',
      whyForDesign: [
        'Fette, schmucklose Elemente lassen Dekoration weg, damit Struktur und Text das Gewicht tragen.',
        'Zwei starke Akzente, Rot und Ocker, ersetzen Verläufe und Schatten komplett.',
        'Die Barrierefreiheitsuntergrenze gilt weiterhin, damit schroffe Layouts Kontrast und sichtbaren Fokus behalten.',
      ],
      howWithCodex: [
        'Sag Codex, der Ton ist fett und schmucklos, bevor er Komponenten wählt.',
        'Verankere jede Regel an einem Token oder Schwellwert, wie es die Quality Gates verlangen.',
        'Ergänze jede Do-Regel um ein konkretes Don’t-Beispiel, wenn du die Ausgabe prüfst.',
      ],
    },
    'hallmark-design-skill': {
      tagline: 'Anti-Slop-Design-Flow mit 58 Gates und erzwungener struktureller Vielfalt.',
      whatIsIt:
        'Ein Design-Skill für KI-Coding-Assistenten mit einem Standard-Build-Flow und drei Verben: audit, redesign und study. Er drängt auf strukturelle Vielfalt, damit zwei Builds nicht denselben Seitenrhythmus teilen.',
      whyForDesign: [
        'Diversifizierungsregeln erzwingen unterschiedliche Makrostrukturen, Navs und Footer über aufeinanderfolgende Builds.',
        'Gesperrte Tokens verbieten inline hex- oder font-family-Werte, die den Token-Block umgehen.',
        'Jede Ausgabe wird bei 320, 375, 414 und 768 Pixel Breite geprüft.',
      ],
      howWithCodex: [
        'Lass den Pre-Flight-Scan zuerst vorhandene Fonts, Palette und Motion-Bibliotheken lesen.',
        'Beantworte das Gate zu Zielgruppe, Use Case und Ton, oder sag einfach los.',
        'Führe hallmark audit auf einer Seite aus, für eine priorisierte Punch-List ohne Änderungen.',
      ],
    },
    'impeccable': {
      tagline: 'Zwei Dutzend Befehle, um Frontend-Interfaces zu bauen, zu kritisieren und zu verfeinern.',
      whatIsIt:
        'Ein Frontend-Design-Skill mit Befehlen, gruppiert als build, evaluate, refine, enhance, fix und iterate. Er liest Projektkontext und eine Register-Referenz und schreibt dann produktionsreifen Code.',
      whyForDesign: [
        'Die Register-Aufteilung schickt Marketingseiten und Produkt-UI durch unterschiedliche Designregeln.',
        'Absolute Verbote weisen Verlaufstext, Seitenstreifen-Rahmen und Eyebrow-Labels über jeder Section zurück.',
        'Kontrastuntergrenzen sind explizit: 4,5:1 für Fließtext, 3:1 für großen Text.',
      ],
      howWithCodex: [
        'Führe context.mjs einmal pro Session aus, damit der Skill PRODUCT.md und DESIGN.md lädt.',
        'Ruf einen Befehl wie critique, polish oder animate mit einer Zieldatei auf.',
        'Nutze den Live-Modus mit laufendem Dev-Server, um Varianten im Browser zu erzeugen.',
      ],
    },
    'design-dna': {
      tagline: 'Extrahiere ein Referenzdesign in strukturiertes JSON und generiere daraus.',
      whatIsIt:
        'Ein dreiphasiger Workflow, der Design-Identität über messbare Tokens, qualitativen Stil und visuelle Effekte erfasst. Er gibt ein vollständiges Design-DNA-JSON aus und wendet dieses JSON dann auf neuen Content an.',
      whyForDesign: [
        'Macht aus einem Screenshot oder einer URL benannte Farb-, Schrift- und Abstandswerte.',
        'Erfasst Stimmung, Komposition und Brand Voice, nicht nur messbare Tokens.',
        'Erfasst Canvas-, WebGL-, Shader- und Scroll-Effekte, die reines CSS nicht ausdrücken kann.',
      ],
      howWithCodex: [
        'Verlange das Schema, um alle drei Dimensionen zu sehen, bevor du etwas analysierst.',
        'Gib Codex Referenzbilder oder URLs und verlange ein befülltes DNA-JSON.',
        'Übergib das JSON plus deinen Content, um eine eigenständige HTML-Seite zu erzeugen.',
      ],
    },
    'material-3': {
      tagline: 'Setze Googles Material Design 3 über Compose, Flutter und Web um.',
      whatIsIt:
        'Ein Leitfaden zu Material Design 3, der den md.sys-Token-Namespace, 30+ Komponenten, adaptives Layout, Theming und M3 Expressive abdeckt. Jetpack Compose ist das primäre Ziel, Flutter und @material/web sind sekundär.',
      whyForDesign: [
        'Color-, Type-, Shape- und Elevation-Tokens ersetzen hartkodierte hex- und Radius-Werte.',
        'Tonale Flächen tragen Tiefe statt Schatten, im Einklang mit der aktuellen MD3-Spec.',
        'Ein bewertetes Audit benotet zehn Kategorien und listet Fixes in Prioritätsreihenfolge.',
      ],
      howWithCodex: [
        'Nenn die Plattform, damit Codex Compose, Flutter oder CSS Custom Properties wählt.',
        'Verlange eine Komponente und bekomm die richtige Variante plus Token-Verdrahtung.',
        'Führe das Audit gegen eine URL oder Quelldateien aus, für einen Compliance-Report.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Sechzehn konkrete UI-Feinschliff-Regeln mit Review-Checkliste.',
      whatIsIt:
        'Eine Reihe von Design-Engineering-Prinzipien für Interface-Feinschliff: konzentrische Radien, optische Ausrichtung, gestapelte Schatten, gestaffelte Einblend-Animationen, Tabellenziffern, Hit Areas und Transition-Spezifität.',
      whyForDesign: [
        'Nennt exakte Werte, damit die Skalierung beim Drücken immer 0.96 ist, nie geraten.',
        'Behebt den verschachtelten Radius-Fehler, der die meisten Komponenten daneben wirken lässt.',
        'Fängt Layout-Shift durch wechselnde Zahlen ab, bevor er die Nutzer erreicht.',
      ],
      howWithCodex: [
        'Verweise Codex auf eine Komponente und bitte ihn, die Prinzipien anzuwenden.',
        'Verlange ein Review, die Befunde kommen als Before-After-Tabellen zurück.',
        'Geh die vierzehnteilige Checkliste durch, bevor du eine Frontend-Änderung mergst.',
      ],
    },
    'visual-plan': {
      tagline: 'Macht aus Text-Plänen prüfbare Dokumente mit Wireframes und Prototypen.',
      whatIsIt:
        'Ein strukturierter Planungsmodus für Coding-Agenten. Pläne werden zu überfliegbaren Dokumenten mit Inline-Diagrammen, Code, Datenmodellen, offenen Fragen und einem optionalen Canvas oben oder Live-Prototyp.',
      whyForDesign: [
        'UI-Pläne beginnen mit Wireframe-Artboards, eines pro nutzersichtbarem State.',
        'Reviewer kommentieren verankerte Elemente, statt im Chat zu diskutieren.',
        'Mehrstufige Flows bekommen einen bedienbaren Prototyp neben den statischen Mockups.',
      ],
      howWithCodex: [
        'Installiere über die Agent-Native CLI und führe dann den Befehl /visual-plan aus.',
        'Füg einen bestehenden Codex- oder Markdown-Plan als Quelle ein.',
        'Lies das Feedback, patche den Plan und prüfe das gespeicherte Ergebnis.',
      ],
    },
    'kami': {
      tagline: 'Setzt Lebensläufe, Whitepaper, Decks und Landingpages in einer Designsprache.',
      whatIsIt:
        'Ein Template-System für professionelle Dokumente und Produkt-Landingpages. Warme Pergament-Fläche, tintenblauer Akzent, serifengeführte Hierarchie, mit Templates für neun Dokumenttypen plus fünfzehn Diagramm-Primitives.',
      whyForDesign: [
        'Eine Akzentfarbe und eine Serif-Familie halten jedes Deliverable visuell konsistent.',
        'Ein Density-Vertrag markiert Textseiten, die weniger als halb voll rendern.',
        'Diagramm-Primitives decken Architektur, Flowcharts, Quadranten, Timelines und Charts ab.',
      ],
      howWithCodex: [
        'Sag, was du brauchst, der Entscheidungsbaum wählt das passende Template.',
        'Lass Codex deinen Rohcontent zuerst in ein validiertes content.json destillieren.',
        'Führe das Build-Skript aus, um HTML, PDF und Verifizierungs-Reports zu erzeugen.',
      ],
    },
    'masked-reveal': {
      tagline: 'Enthüllt Headlines Wort für Wort durch eine Overflow-Maske beim Scrollen.',
      whatIsIt:
        'Ein GSAP-ScrollTrigger-Pattern, das eine Überschrift in maskierte Wort-Spans zerlegt und sie gestaffelt nach oben führt, sobald der Text in den Viewport kommt. Enthält ein React-Cleanup-Pattern.',
      whyForDesign: [
        'Die Staffelung auf Wortebene wirkt ruhiger und editorialer als eine Animation auf Buchstabenebene.',
        'Screenreader bekommen weiterhin den vollen Text über ein aria-label.',
        'Reduced-Motion-Nutzer sehen statischen Text ohne angewandtes transform.',
      ],
      howWithCodex: [
        'Markiere eine Überschrift mit data-masked-reveal und ergänze die CSS-mask-Regeln.',
        'Ruf den Split-Helper auf, der das kostenpflichtige SplitText-Plugin umgeht.',
        'Wickle es in React in einen GSAP-Context, damit ScrollTrigger beim Routenwechsel aufräumt.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'Baut präzise Editorial-Layouts mit dünnen Rahmen und Eckwinkeln.',
      whatIsIt:
        'Ein Zwölf-Spalten-Raster-Pattern, bei dem jede Section innerhalb von 1px-gerahmten Boxen an geteilten Spalten einrastet. L-förmige Eckwinkel werden als Hintergrundebenen über einer Diagonaltextur mit geringer Deckkraft gezeichnet.',
      whyForDesign: [
        'Jede Section teilt eine Rahmenfarbe, eine Winkelgröße, eine Spacing-Skala.',
        'Eckwinkel brauchen kein zusätzliches Markup, damit die Struktur in CSS bleibt.',
        'Das Layout bleibt klar lesbar, auch wenn die Texturebene entfernt wird.',
      ],
      howWithCodex: [
        'Verlange eine technische oder editoriale Seite und bekomm zuerst das übergeordnete Raster.',
        'Vergib explizite Span-Klassen statt ad hoc gesetzter Section-Breiten.',
        'Prüfe, dass Rahmenkanten an beiden Breakpoints vertikal und horizontal fluchten.',
      ],
    },
    'container-lines': {
      tagline: 'Zeichnet dezente vertikale Hilfslinien an den Kanten deines Content-Containers.',
      whatIsIt:
        'Ein CSS-Pattern, das 1px vertikale Linien an beiden Kanten des Content-Containers setzt, plus optionale Mini-Eckquadrate. Die Hilfslinien liegen hinter dem Content und ignorieren Pointer Events.',
      whyForDesign: [
        'Zeigt die Containerbreite, damit lose Hero-Sections strukturelle Spannung gewinnen.',
        'Die Hilfslinien teilen max-width und Padding des Containers, damit sie nie verrutschen.',
        'Pointer Events sind deaktiviert, damit Linien nie Klicks oder Auswahl blockieren.',
      ],
      howWithCodex: [
        'Füg die container-lines-Klasse zur Layout-Hülle hinzu.',
        'Setz Eckquadrate nur an echte Container- oder Section-Ecken.',
        'Prüfe, dass die Linien auf hellen und dunklen Hintergründen dezent bleiben.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Gibt Buttons und Panels taktile Tiefe mit gestapelten Verläufen und Schatten.',
      whatIsIt:
        'Ein Oberflächenrezept für taktiles Web-UI: vertikale Verlaufsfüllungen, ein 1px reflektierender Verlaufsrand, gestapelte Außen- und Inset-Schatten. Geprägter Text, Icons und Mikrotextur sind optional.',
      whyForDesign: [
        'Erhabene und gedrückte States kehren die Tiefe um, damit Controls physisch wirken.',
        'Die Tiefe bleibt gerichtet, mit Licht von oben und Schatten unten.',
        'Warnt davor, Glassmorphism, Neumorphism und Skeuomorphism in einer Komponente zu mischen.',
      ],
      howWithCodex: [
        'Setz die Basis-Tokens einmal und stimm sie dann pro Marke und Theme ab.',
        'Wende die erhabene Fläche auf Karten, Buttons, Tabs und Control-Gehäuse an.',
        'Nutze die gedrückte Variante nur für aktive Toggles und ausgewählte Tabs.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Drei fertige Tailwind-Shadow-Utilities für neutrale, gestapelte Elevation.',
      whatIsIt:
        'Ein Set exakter Tailwind-Arbitrary-Shadow-Klassen in drei Stärken. Jede stapelt mehrere neutrale Ebenen mit geringer Deckkraft statt Tailwinds Standard-Shadow-Skala.',
      whyForDesign: [
        'Die Elevation bleibt neutral, kein farbiges Glühen färbt die Fläche darunter.',
        'Drei feste Stärken sind Controls, Karten und Hero-Media zugeordnet.',
        'Gestapelte Ebenen mit geringer Deckkraft wirken wie echte Tiefe statt eines plumpen Schlagschattens.',
      ],
      howWithCodex: [
        'Bitte Codex, die md-Utility auf Karten, Panels und Popovers anzuwenden.',
        'Reservier die lg-Utility für Hero-Media und modalartige Container.',
        'Kombiniere jeden Schatten mit einer sauberen Flächenfüllung und konsistentem Radius.',
      ],
    },
    'dither-background': {
      tagline: 'Canvas-Hintergrund mit sichtbarem 4x4-Bayer-Dithering und quadratischen Pixeln.',
      whatIsIt:
        'Ein Canvas-Rezept, das ein fast schwarzes prozedurales Feld aus Value Noise, FBM und einem 4x4-Bayer-Threshold rendert, gezeichnet als vergrößerte quadratische Zellen.',
      whyForDesign: [
        'Vergrößerte Zellen halten die Dither-Matrix lesbar, statt in Filmkorn zu zerfallen.',
        'Eine sechsstufige monochrome Palette hält Vordergrundschrift lesbar ohne schweres Overlay.',
        'Vignette und außermittige Masse geben einen hellen Fokusbereich statt gleichmäßiger Helligkeit.',
      ],
      howWithCodex: [
        'Leg das fixierte Canvas hinter den Content und setz pointer-events auf none.',
        'Justiere cellSize zwischen 5px und 10px für die Lesbarkeit der Matrix.',
        'Passe wave-, cloud-, ridge- und vignette-Werte an, um die Masse zu formen.',
      ],
    },
    'webgl-laser': {
      tagline: 'Vollbild-Shader-Strahl mit weißglühendem Kern und markengetöntem Nebel.',
      whatIsIt:
        'Ein roher WebGL-Fragment-Shader, der einen dünnen vertikalen Laser auf ein Vollbild-Quad zeichnet. Der Kern bleibt fast weiß, Halo und FBM-Rauch folgen deiner Akzentfarbe.',
      whyForDesign: [
        'Halo und Rauch lesen aus deiner Markenakzentfarbe statt einem hartkodierten Blau.',
        'Getrennte Kern- und Glow-Breiten halten den Strahl als Klinge, nicht als Balken.',
        'Der Rauch konzentriert sich am Strahl und löst sich nach außen auf, das schützt den Textkontrast.',
      ],
      howWithCodex: [
        'Setz eine --brand-accent Custom Property, die der Shader in RGB umwandelt.',
        'Platzier das fixierte Canvas hinter dem Content mit pointer-events none.',
        'Justiere coreWidth, glowWidth, smokeDensity und xOffset, um den Strahl zu positionieren.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Fast schwarzes Navy-System mit einem Mesh-Feld in einer Hero-Hülle.',
      whatIsIt:
        'Eine dunkelblaue Richtung mit CSS-Color-Tokens, einer Border-Gradient-Hero-Hülle, Canvas-Mesh-Feld, gläserner Nav-Pill, schwebenden Nodes, Rails und gepaarten CTAs.',
      whyForDesign: [
        'Das Mesh sitzt in der Hero-Hülle, damit es die Komposition treibt statt sie nur zu schmücken.',
        'Benannte Tokens fixieren Werte für Hintergrund, Hülle, Linie, Text und Akzent über die ganze Seite.',
        'Rails, Eckquadrate und Node-Pills geben der minimalen Hülle technische Struktur.',
      ],
      howWithCodex: [
        'Füg den Token-Block ein und bau dann das Seitenfundament und die Hero-Hülle.',
        'Setz das Mesh-Canvas in die Hülle, hinter den Hüllen-Content.',
        'Platzier ein paar Nodes, Rails und Marker und halt die Drift-Loops langsam.',
      ],
    },
    'gsap-skills': {
      tagline: 'Offizielles GSAP-Animations-Set, von Core-Tweens über ScrollTrigger bis React.',
      whatIsIt:
        'GreenSocks offizielles Skill-Set, um Web-Animation mit GSAP zu bauen. Acht Module decken die Core-API, Timelines, ScrollTrigger, Plugins, React, weitere Frameworks, Performance und Utilities ab.',
      whyForDesign: [
        'Motion folgt GSAPs echter API, statt dass der Agent die Syntax errät.',
        'ScrollTrigger und Timelines werden sauber sequenziert, nicht ad hoc gestapelt.',
        'Performance-Regeln halten Animation flüssig statt ruckelig beim Scrollen.',
      ],
      howWithCodex: [
        'Installiere das GSAP-Skill-Set, damit Codex das passende Modul laden kann.',
        'Verlange die gewünschte Motion, das richtige Modul übernimmt die API.',
        'Greif in einem Komponentenbaum zum React- oder Frameworks-Modul.',
      ],
    },
    'animation-review': {
      tagline: 'Motion finden, verbessern und gegen eine Senior-Craft-Latte prüfen.',
      whatIsIt:
        'Drei von Emil Kowalskis Motion-Skills als ein Loop: Stellen finden, die animieren sollten, bestehende Motion verbessern und Animationscode gegen eine hohe Craft-Latte prüfen.',
      whyForDesign: [
        'Deckt UI auf, die sich bewegen sollte, es aber nicht tut, und weist Motion zurück, die es nicht sollte.',
        'Macht aus vagem ‚mach es schöner‘ ein priorisiertes Motion-Audit.',
        'Misst Animation an einer benannten Craft-Latte, nicht an persönlichem Geschmack.',
      ],
      howWithCodex: [
        'Starte den Find-Durchlauf, um Motion-Chancen in deiner UI zu orten.',
        'Wende den Improve-Durchlauf an, um bestehenden Animationscode zu überarbeiten.',
        'Starte den Review-Durchlauf vor dem Ausliefern, um handwerklich schwache Motion abzufangen.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Editoriales Mehrspalten-Raster mit übergroßen Headlines und winzigen Großbuchstaben-Labels.',
      whatIsIt:
        'Eine Layout-Richtung für Agentur-Sites: breite Raster-Hüllen, übergroße Display-Headlines, kleine Großbuchstaben-Metadaten in angrenzenden Spalten und architektonische Bildblöcke.',
      whyForDesign: [
        'Strikte Spaltenplatzierung lässt jede Elementposition bewusst wirken.',
        'Der Größenkontrast zwischen Display-Headlines und winzigen Metadaten trägt die Hierarchie.',
        'Negativraum bleibt erhalten statt gefüllt und hält die Seite editorial.',
      ],
      howWithCodex: [
        'Setz zuerst eine breite max-width-Hülle mit sichtbaren Spaltenteilungen.',
        'Verankere eine Hero-Headline über die meisten Spalten, Begleittext in einer Seitenspalte.',
        'Bau Service-Zeilen als Mehrspalten-Listings mit winzigen Metadaten-Labels.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Dunkle, mattierte Flächen rund um eine runde Kalibrierungsskala.',
      whatIsIt:
        'Eine dunkle Glas-Richtung um eine uhrenartige Skala: fast schwarze Basis mit Beam-Rastern, mattierte Nav-Kapseln und ein geschichtetes Ring-und-Tick-Kernstück.',
      whyForDesign: [
        'Eine dominante Skala verankert das Layout, statt als dekoratives Widget dazusitzen.',
        'Beam-Linien und Fadenkreuze richten sich an der Skala aus und verstärken die Kalibrierungslogik.',
        'Die monochrome Palette bedeutet, dass Helligkeit aus Glas-Highlights kommt, nicht aus gesättigten Akzenten.',
      ],
      howWithCodex: [
        'Beginn mit einer fast schwarzen Basis plus schwachen Raster- und Beam-Hilfslinien.',
        'Bau Nav, Pills und Buttons als dunkle Glaskapseln mit 1px-Highlight-Wrappern.',
        'Schichte die Skala: äußerer Ring, Ticks, rotierende Labels, Zentrum-Emblem.',
      ],
    },
  },
};
