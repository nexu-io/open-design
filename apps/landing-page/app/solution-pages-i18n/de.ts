import type { SolutionLocaleCopy } from './types';

export const DE: SolutionLocaleCopy = {
  prototype: {
    title: 'Interaktive Prototypen mit Open Design + Claude Code bauen',
    description:
      'Verwandle einen Prompt in einen klickbaren Multi-Screen-Prototypen, ohne dein Terminal zu verlassen. Open Design gibt deinem Coding-Agent die Design-Fähigkeiten, Vorlagen und das Designsystem, um echte Prototypen auszuliefern, die du im Browser öffnen kannst.',
    breadcrumb: 'Prototyp',
    label: 'Anwendungsfall · Prototyp',
    heading: 'Prototyping im Tempo eines Prompts',
    lead: 'Beschreibe den Flow, den du im Kopf hast, und lass deinen Agent einen echten, klickbaren Prototypen zusammenbauen — mehrere Screens, gemeinsame Stile und lebendige Interaktionen — direkt als HTML gerendert, das du öffnen, teilen und an die Entwicklung übergeben kannst.',
    heroImageAlt:
      'Redaktionelle Illustration einer Hand, die ein Wireframe skizziert, das sich in einen klickbaren Multi-Screen-App-Prototypen verwandelt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design ist die Design-Ebene für den Coding-Agent, den du bereits nutzt. Fürs Prototyping heißt das: von einer Idee in einem Absatz zu einem navigierbaren, gestalteten Prototypen in einer einzigen Session — kein Design-Tool, kein Export-Schritt, keine Übergabelücke.',
    stepsTitle: 'So funktioniert Prototyping mit Open Design',
    steps: [
      {
        title: 'Beschreibe den Flow',
        body: 'Sag deinem Agent in klarer Sprache, was du baust — "ein Onboarding-Flow mit Willkommens-Screen, Tarifauswahl und Bestätigung." Open Design lädt die Prototyp-Fähigkeit, damit der Agent weiß, dass er Screens produzieren soll, nicht eine einzelne Seite.',
        imageAlt:
          'Illustration einer Person, die eine Beschreibung eines App-Flows in klarer Sprache in ein Terminal tippt',
      },
      {
        title: 'Generiere gestaltete Screens',
        body: 'Der Agent wendet ein Designsystem und Prototyp-Vorlagen von Open Design an, sodass jeder Screen Typografie, Abstände und Komponenten teilt, statt wie ein grober Entwurf auszusehen. Du bekommst ein zusammenhängendes Set von Screens, keine zusammenhanglosen Mockups.',
        imageAlt:
          'Illustration mehrerer App-Screens, die nacheinander erscheinen und alle einen einheitlichen visuellen Stil teilen',
      },
      {
        title: 'Verdrahte die Interaktionen',
        body: 'Buttons navigieren, Tabs wechseln, Modals öffnen sich. Der Prototyp wird als eigenständiges HTML gerendert und verhält sich daher in jedem Browser wie das echte Produkt — kein Prototyping-Tool-Konto nötig, um ihn anzusehen.',
        imageAlt:
          'Illustration eines Cursors, der sich durch verknüpfte Screens klickt, mit Pfeilen, die die Navigation dazwischen zeigen',
      },
      {
        title: 'Iteriere und übergib',
        body: 'Verfeinere im Gespräch mit dem Agent — "mach die Tarifauswahl zu einem dreispaltigen Layout." Da das Artefakt in deinem Projekt liegt, teilen Design und der spätere Code eine einzige Quelle der Wahrheit und schließen so die übliche Lücke zwischen Designer und Entwickler.',
        imageAlt:
          'Illustration eines Prototyps, der überarbeitet und dann an einen Entwickler übergeben wird, wobei Design und Code in einer Datei verschmelzen',
      },
    ],
    tableTitle: 'Prototyping mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Klassische Prototyping-Tools',
    tableRows: [
      {
        capability: 'Von der Idee zum ersten Screen',
        withOd: 'Ein Prompt im Agent, den du ohnehin offen hast',
        without: 'Ein separates Tool öffnen, eine Datei anlegen, Boxen von Hand ziehen',
      },
      {
        capability: 'Mehrere verknüpfte Screens',
        withOd: 'Als Set generiert mit gemeinsamen Stilen und funktionierender Navigation',
        without: 'Jeder Frame von Hand gezeichnet und verknüpft',
      },
      {
        capability: 'Einheitliches visuelles System',
        withOd: 'Aus einem wiederverwendbaren Designsystem gezogen, das der Agent anwendet',
        without: 'Pro Datei neu erstellt oder von Hand gepflegt',
      },
      {
        capability: 'Teilbares Ergebnis',
        withOd: 'Eigenständiges HTML — öffnet sich in jedem Browser, kein Konto',
        without: 'Betrachter braucht einen Platz oder einen Freigabelink im Anbieter-Tool',
      },
      {
        capability: 'Weg zu echtem Code',
        withOd: 'Artefakt liegt in deinem Repo; Design und Code teilen eine Quelle',
        without: 'Nach separater Übergabe von Grund auf neu gebaut',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Abo pro Platz, anbietergehostet, exportbegrenzt',
      },
    ],
    featuresTitle: 'Was du prototypisieren kannst',
    features: [
      {
        title: 'Multi-Screen-Web-Apps',
        body: 'Vollständige Flows mit gemeinsamer Navigation — Onboarding, Dashboards, Einstellungen — keine Einzelseiten.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile-App-Flows',
        body: 'Screen-für-Screen-Mobile-Journeys mit nativ wirkenden Übergängen und Zuständen.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landingpages',
        body: 'Marketing-Seiten und SaaS-Landings, die du durchklicken und ausliefern kannst.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Jeder visuelle Geschmack',
        body: 'Redaktionell, weich oder brutalistisch — der Prototyp trägt einen durchgängigen Stil von Anfang bis Ende.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Warteliste & Preise',
        body: 'Conversion-Flächen — Wartelisten, Preistabellen — verdrahtet und markengerecht.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamifiziert & verspielt',
        body: 'Interaktionsstarke Konzepte, bei denen Bewegung und Zustand Teil des Pitches sind.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypen, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Jeder davon begann als Prompt und wurde zu einem klickbaren Artefakt gerendert. Wähle eine Vorlage nahe deiner Idee, beschreibe deine Variante, und der Agent passt sie an.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating-Web-App — Multi-Screen-Flow" },
      { thumb: "example-hr-onboarding", caption: "HR-Onboarding-Flow" },
      { thumb: "example-kami-landing", caption: "Produkt-Landingpage" },
      { thumb: "example-web-prototype-taste-soft", caption: "Web-Prototyp im weichen Stil" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Prototyp-Vorlagen durchsuchen',
    faqTitle: 'Prototyping-FAQ',
    faq: [
      {
        q: 'Brauche ich ein Design-Tool wie Figma, um mit Open Design zu prototypisieren?',
        a: 'Nein. Open Design läuft in deinem Coding-Agent und rendert Prototypen als HTML. Du beschreibst den Flow in Sprache; der Agent produziert die Screens. Es gibt kein separates Canvas-Tool zu lernen oder zu bezahlen.',
      },
      {
        q: 'Sind die Prototypen interaktiv oder nur statische Mockups?',
        a: 'Interaktiv. Navigation, Tabs und Modals funktionieren, weil die Ausgabe echtes HTML und CSS ist. Du kannst dich in jedem Browser genau so durchklicken wie ein Nutzer.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Open Design funktioniert mit Claude Code, Codex, Cursor Agent, Gemini CLI und einem Dutzend weiterer hauseigener Adapter. Du bringst deine eigenen Anbieter-Schlüssel mit; nichts wird für dich gehostet.',
      },
      {
        q: 'Kann ein Prototyp zum echten Produkt werden?',
        a: 'Genau das ist der Sinn. Das Artefakt liegt in deinem Projekt, sodass dasselbe Designsystem und dieselben Komponenten in den Produktionscode übergehen, statt nach einer Übergabe weggeworfen zu werden.',
      },
    ],
    ctaTitle: 'Prototypisiere deine nächste Idee noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle dein nächstes "Was wäre wenn" in etwas Klickbares — im Agent, den du bereits nutzt.',
  },
  dashboard: {
    title: 'Daten-Dashboards mit Open Design + Claude Code erstellen',
    description:
      'Beschreibe die Kennzahlen, die du verfolgst, und lass deinen Coding-Agent ein gestaltetes, responsives Dashboard bauen — Diagramme, KPI-Karten und Tabellen, als HTML gerendert, das du überall hosten kannst. Kein BI-Tool-Platz, kein Drag-and-Drop-Builder.',
    breadcrumb: 'Dashboard',
    label: 'Anwendungsfall · Dashboard',
    heading: 'Dashboards aus einer Beschreibung, nicht aus einem Drag-and-Drop-Builder',
    lead: 'Sag deinem Agent, was er zeigen soll und wie es wirken soll. Open Design liefert die Diagrammmuster, das Layoutsystem und die visuelle Sprache, sodass du ein zusammenhängendes, vorzeigbares Dashboard bekommst — keine Wand aus Widgets im Standardstil.',
    heroImageAlt:
      'Redaktionelle Illustration: rohe Zahlen links fließen in ein sauberes Dashboard aus Diagrammen und KPI-Karten rechts',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt eine in klarer Sprache verfasste Spezifikation deiner Kennzahlen in ein gestaltetes Dashboard, das dein Agent als HTML rendert — versioniert in deinem Repo, überall hostbar, ohne BI-Abo pro Platz.',
    stepsTitle: 'So funktionieren Dashboards mit Open Design',
    steps: [
      {
        title: 'Beschreibe die Kennzahlen',
        body: 'Liste auf, was zählt — "wöchentlich aktive Nutzer, Umsatz nach Tarif, Churn und ein 30-Tage-Trend." Der Agent lädt die Dashboard-Fähigkeit, damit er weiß, dass er KPI-Karten, Diagramme und eine Tabelle anordnen soll, statt eines einzelnen Textblocks.',
        imageAlt: 'Illustration einer Person, die die Kennzahlen auflistet, die ihr wichtig sind',
      },
      {
        title: 'Wähle die Diagrammmuster',
        body: 'Open Design liefert Diagramm- und Layout-Vorlagen, sodass Trends zu Liniendiagrammen, Aufschlüsselungen zu Balken und Verhältnisse zur richtigen Visualisierung werden — durchgängig einheitliche Typografie und Abstände statt nicht zusammenpassender Standards.',
        imageAlt: 'Illustration mehrerer Diagrammtypen, in ein zusammenhängendes Raster angeordnet',
      },
      {
        title: 'Binde deine Daten ein',
        body: 'Richte das Dashboard auf eine CSV, einen JSON-Endpunkt oder füge Beispielzeilen ein. Es rendert zu eigenständigem HTML, das sich aktualisiert, wenn sich die Daten ändern — öffne es in jedem Browser, leg es auf jeden statischen Host.',
        imageAlt: 'Illustration einer Datendatei, die sich mit einem live aktualisierenden Dashboard verbindet',
      },
      {
        title: 'Verfeinere und liefere aus',
        body: 'Passe es im Gespräch mit dem Agent an — "gruppiere Umsatz nach Region, schieb die KPI-Zeile nach oben." Das Artefakt liegt in deinem Projekt, sodass das Dashboard wie jeder andere Code überprüfbar und versioniert ist.',
        imageAlt: 'Illustration eines Dashboards, das verfeinert und dann bereitgestellt wird',
      },
    ],
    tableTitle: 'Dashboards mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'BI-Tools / handcodiert',
    tableRows: [
      {
        capability: 'Von der Kennzahlenliste zum Layout',
        withOd: 'Ein Prompt; der Agent ordnet Karten, Diagramme und Tabellen an',
        without: 'Widgets einzeln ziehen oder Diagrammcode von Grund auf schreiben',
      },
      {
        capability: 'Einheitliches visuelles System',
        withOd: 'Diagrammmuster und Abstände aus einem wiederverwendbaren Designsystem',
        without: 'Standard-Widget-Stile oder pro Diagramm von Hand gestaltet',
      },
      {
        capability: 'Daten verbinden',
        withOd: 'CSV / JSON / eingefügte Zeilen, zu lebendigem HTML gerendert',
        without: 'Anbieter-Konnektoren oder maßgeschneiderte Datenverkabelung',
      },
      {
        capability: 'Hosting & Teilen',
        withOd: 'Eigenständiges HTML auf jedem statischen Host, kein Konto',
        without: 'Betrachter braucht einen Platz beim BI-Anbieter',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Liegt in deinem Repo; diff-bar wie Code',
        without: 'Beim Anbieter eingeschlossen, kein echtes Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Abo pro Platz, anbietergehostet',
      },
    ],
    featuresTitle: 'Was du bauen kannst',
    features: [
      { title: "Produktanalysen", body: "Aktive Nutzer, Funnels, Retention — die Kennzahlen, in denen ein Produktteam lebt.", thumb: "example-dashboard" },
      { title: "Repo- & Dev-Kennzahlen", body: "Sterne, PRs, CI-Status — Engineering-Dashboards aus deinen eigenen Daten.", thumb: "example-github-dashboard" },
      { title: "Finanzberichte", body: "Umsatz, Burn, Runway als teilbarer Bericht angeordnet.", thumb: "example-finance-report" },
      { title: "Live-Betrieb", body: "Echtzeit-Kennzahlen, die sich aktualisieren, wenn sich die zugrunde liegenden Daten bewegen.", thumb: "example-live-dashboard" },
      { title: "Social & Marketing", body: "Kanal-Performance und Kampagnen-Tracking in einer Ansicht.", thumb: "example-social-media-dashboard" },
      { title: "Fachberichte", body: "Strukturierte Berichte für jedes Feld — von klinisch bis Trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Dashboards, aus einem Prompt und einer Datenquelle gerendert. Starte mit einem, das deinem nahekommt, und beschreibe die Kennzahlen, die du verfolgst.',
    gallery: [
      { thumb: "example-data-report", caption: "Datenbericht" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live-Betriebs-Dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading-Analyse-Dashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redaktionelles Datendiagramm" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Dashboard-Vorlagen durchsuchen',
    faqTitle: 'Dashboard-FAQ',
    faq: [
      {
        q: 'Brauche ich ein BI-Tool wie Tableau oder Looker?',
        a: 'Nein. Open Design rendert Dashboards als HTML in deinem Coding-Agent. Du beschreibst die Kennzahlen und richtest es auf deine Daten; es gibt keine separate BI-Plattform zu lizenzieren oder zu lernen.',
      },
      {
        q: 'Woher kommen die Daten?',
        a: 'Aus einer CSV, einem JSON-Endpunkt oder Zeilen, die du einfügst. Das Dashboard ist einfaches HTML und JavaScript, sodass du genau steuerst, woher es liest — nichts wird über einen gehosteten Dienst geleitet.',
      },
      {
        q: 'Können nicht-technische Teammitglieder es ansehen?',
        a: 'Ja. Die Ausgabe ist eine eigenständige Webseite. Jeder mit dem Link oder der Datei kann sie im Browser öffnen — kein Konto, kein Platz.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und ein Dutzend weiterer hauseigener Adapter. Du bringst deine eigenen Anbieter-Schlüssel mit.',
      },
    ],
    ctaTitle: 'Bau dein Dashboard noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle deine Kennzahlen in ein Dashboard, das du überall hosten kannst — im Agent, den du bereits nutzt.',
  },
  slides: {
    title: 'Präsentations-Decks mit Open Design + Claude Code erstellen',
    description:
      'Verwandle eine Gliederung in ein gestaltetes, markengerechtes Slide-Deck, ohne eine Präsentations-App zu öffnen. Open Design gibt deinem Coding-Agent Deck-Vorlagen und ein visuelles System und rendert Slides als HTML, das du präsentieren, exportieren oder teilen kannst.',
    breadcrumb: 'Slides',
    label: 'Anwendungsfall · Slides',
    heading: 'Decks, die gestaltet aussehen, von einem Prompt geschrieben',
    lead: 'Gib deinem Agent eine Gliederung und einen Ton. Open Design wendet eine Deck-Vorlage und ein visuelles System an, sodass jede Slide angeordnet, gesetzt und markengerecht ist — keine Aufzählung auf leerem Hintergrund.',
    heroImageAlt:
      'Redaktionelle Illustration: eine Gliederung links verwandelt sich in eine Folge gestalteter Präsentations-Slides rechts',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt eine Gliederung in ein gestaltetes HTML-Deck, das dein Agent in einer Session rendert — präsentiere es im Browser, exportiere nach PDF oder PPTX und behalte die Quelle in deinem Repo.',
    stepsTitle: 'So funktionieren Decks mit Open Design',
    steps: [
      {
        title: 'Gib ihm die Gliederung',
        body: 'Füge deine Stichpunkte oder eine grobe Struktur ein. Der Agent lädt die Deck-Fähigkeit, sodass er eine Folge angeordneter Slides produziert, kein langes Dokument.',
        imageAlt: 'Illustration einer Textgliederung, die einem Agent übergeben wird',
      },
      {
        title: 'Wähle einen Deck-Stil',
        body: 'Open Design liefert Deck-Vorlagen — redaktionell, Swiss-International, dunkel-technisch und mehr. Der Agent wendet eine an, sodass Typografie, Raster und Akzente über jede Slide hinweg einheitlich bleiben.',
        imageAlt: 'Illustration mehrerer Deck-Stil-Optionen, nebeneinander gelegt',
      },
      {
        title: 'Generiere die Slides',
        body: 'Jeder Punkt wird zu einer gestalteten Slide mit der richtigen Hierarchie — Titel, unterstützende Visuals, Daten-Hervorhebungen. Sie rendert zu HTML und präsentiert daher im Vollbild in jedem Browser.',
        imageAlt: 'Illustration einer Folge fertiger Slides mit einheitlichem Styling',
      },
      {
        title: 'Präsentiere, exportiere, iteriere',
        body: 'Präsentiere aus dem Browser oder exportiere zum Teilen nach PDF / PPTX. Verfeinere im Gespräch mit dem Agent — "straffe die Daten-Slide, füge einen abschließenden Call-to-Action hinzu." Die Deck-Quelle bleibt in deinem Projekt.',
        imageAlt: 'Illustration eines Decks, das präsentiert und in mehrere Formate exportiert wird',
      },
    ],
    tableTitle: 'Decks mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'PowerPoint / Keynote / KI-Slide-Tools',
    tableRows: [
      {
        capability: 'Von der Gliederung zu Slides',
        withOd: 'Ein Prompt; der Agent ordnet jede Slide an',
        without: 'Jede Slide von Hand bauen oder gegen eine Vorlage kämpfen',
      },
      {
        capability: 'Einheitliches Design',
        withOd: 'Deck-Vorlagen mit echtem Raster- und Typsystem',
        without: 'Theme-Drift, manuelle Ausrichtung, markenfremde Standards',
      },
      {
        capability: 'Daten & Diagramme',
        withOd: 'Diagramme und Hervorhebungen als Teil der Slide gerendert',
        without: 'Statische Bilder einfügen oder Diagramme jedes Mal neu bauen',
      },
      {
        capability: 'Exportformate',
        withOd: 'HTML zum Präsentieren, plus PDF- / PPTX-Export',
        without: 'An das Format einer App gebunden',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Quelle liegt in deinem Repo, diff-bar',
        without: 'Binärdatei, kein sinnvolles Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'App-Lizenz oder KI-Add-on pro Platz',
      },
    ],
    featuresTitle: 'Was du präsentieren kannst',
    features: [
      { title: "Pitch-Decks", body: "Investoren- und Sales-Decks mit starkem Narrativ und sauberen Daten-Slides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / redaktionell", body: "Rastergetriebene, typografische Decks, die art-directed aussehen.", thumb: "example-deck-swiss-international" },
      { title: "Kursmodule", body: "Lehr-Decks mit klaren Schritten, Hervorhebungen und Tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Datengrafik-Decks", body: "Dunkle, diagrammlastige Decks für Analysen und Reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Präsentatormodus", body: "Decks im Reveal-Stil, gebaut für die Live-Präsentation im Browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technische Blueprints", body: "Architektur- und Wissens-Decks, die komplexe Systeme abbilden.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Decks, aus einer Gliederung gerendert. Wähle einen Stil nahe deinem Vortrag und beschreibe den Inhalt.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redaktionelles Magazin-Deck" },
      { thumb: "example-guizang-ppt", caption: "Illustrierte Keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open-Slide-Canvas-Deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Deck im Gradient-Theme" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Deck-Vorlagen durchsuchen',
    faqTitle: 'Slides-FAQ',
    faq: [
      {
        q: 'Brauche ich PowerPoint oder Keynote?',
        a: 'Nein. Open Design rendert Decks als HTML in deinem Coding-Agent und kann nach PDF oder PPTX exportieren. Du präsentierst aus dem Browser oder übergibst eine Datei — keine Präsentations-App nötig, um es zu bauen.',
      },
      {
        q: 'Sind das nur KI-generierte Aufzählungspunkte?',
        a: 'Nein. Der Agent wendet eine echte Deck-Vorlage mit Raster, Typskala und visueller Hierarchie an, sodass Slides gestaltet aussehen statt automatisch befüllt.',
      },
      {
        q: 'Kann ich für einen Kunden nach PowerPoint exportieren?',
        a: 'Ja. Decks exportieren zusätzlich zum HTML, aus dem du präsentierst, nach PPTX und PDF, sodass sie zu jedem Format passen, das das Publikum erwartet.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Bau dein nächstes Deck noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle deine Gliederung in ein gestaltetes Deck — im Agent, den du bereits nutzt.',
  },
  image: {
    title: 'Markengerechte Grafiken mit Open Design + Claude Code erstellen',
    description:
      'Erzeuge Social-Cards, Artikel-Cover und Marketing-Grafiken aus einem Prompt — mit echter Typografie und deinem Markensystem angeordnet, als gestochen scharfes HTML gerendert, das du nach PNG exportieren kannst. Keine Design-App, kein Vorlagen-Abo.',
    breadcrumb: 'Bild',
    label: 'Anwendungsfall · Bild',
    heading: 'Markengerechte Grafiken, für dich generiert und angeordnet',
    lead: 'Beschreibe die Card oder das Cover, das du brauchst. Open Design komponiert es mit echter Schrift, Raster und deinen Markenfarben — und rendert dann zu HTML, das du als Bild exportierst, statt mit einer Design-App oder einer generischen Vorlage zu ringen.',
    heroImageAlt:
      'Redaktionelle Illustration: ein Prompt verwandelt sich in ein Set angeordneter Social-Cards und Artikel-Cover',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt einen Prompt in eine gesetzte, markengerechte Grafik, die dein Agent als HTML rendert und nach PNG exportiert — wiederholbar, versioniert und frei von Design-Tools pro Platz.',
    stepsTitle: 'So funktionieren Grafiken mit Open Design',
    steps: [
      {
        title: 'Beschreibe die Grafik',
        body: 'Sag, was es ist — "eine Twitter-Card für unseren Launch mit der Schlagzeile und einem Zitat." Der Agent lädt die passende Fähigkeit, sodass er eine angeordnete Grafik komponiert, keinen reinen Textblock.',
        imageAlt: 'Illustration einer Person, die eine benötigte Social-Card beschreibt',
      },
      {
        title: 'Wende das Markensystem an',
        body: 'Open Design zieht deine Farben, Schrift und Abstände aus einem wiederverwendbaren Designsystem, sodass jede Card zum Rest deiner Marke passt, statt wie ein Einzelstück auszusehen.',
        imageAlt: 'Illustration von Markenfarben und Schrift, die auf ein Card-Layout angewendet werden',
      },
      {
        title: 'Rendern und exportieren',
        body: 'Die Grafik rendert zu HTML in genau den Maßen, die du brauchst — Social-Card, Cover, Banner — und exportiert dann nach PNG. Gestochen scharfer Text, echtes Layout, kein manuelles Nachjustieren.',
        imageAlt: 'Illustration einer Grafik, die gerendert und in eine Bilddatei exportiert wird',
      },
      {
        title: 'Verwende das Rezept wieder',
        body: 'Weil es eine Vorlage ist, ist die nächste Grafik nur einen Prompt entfernt — ändere die Schlagzeile, behalte das Layout. Card-Serien bleiben perfekt einheitlich.',
        imageAlt: 'Illustration einer Card-Vorlage, die eine einheitliche Grafik-Serie produziert',
      },
    ],
    tableTitle: 'Grafiken mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Design-Apps / generische Vorlagen',
    tableRows: [
      {
        capability: 'Von der Idee zur angeordneten Grafik',
        withOd: 'Ein Prompt; der Agent komponiert Schrift und Layout',
        without: 'Eine App öffnen, jedes Element von Hand platzieren',
      },
      {
        capability: 'Markengerecht bleiben',
        withOd: 'Farben und Schrift aus einem wiederverwendbaren Designsystem',
        without: 'Markenstile pro Datei neu wählen oder vom Markenbild abdriften',
      },
      {
        capability: 'Einheitliche Serie',
        withOd: 'Gleiche Vorlage, neuer Text — perfekt ausgerichtetes Set',
        without: 'Jede Variante von Hand neu ausrichten',
      },
      {
        capability: 'Export',
        withOd: 'HTML in exakten Maßen, nach PNG exportiert',
        without: 'Manuelle Canvas-Größe und Export-Einstellungen',
      },
      {
        capability: 'Wiederholbar',
        withOd: 'Ein prompt-getriebenes Rezept in deinem Repo',
        without: 'Eine Einzeldatei, die du jedes Mal neu erstellst',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Design-Tool pro Platz oder Vorlagen-Marktplatz',
      },
    ],
    featuresTitle: 'Was du machen kannst',
    features: [
      { title: "Social-Cards", body: "X- / Twitter-Cards, komponiert mit deiner Schlagzeile und Marke.", thumb: "example-card-twitter" },
      { title: "Artikel-Cover", body: "Redaktionelle Cover im Magazin-Stil für Beiträge und Newsletter.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu-Cards", body: "Cards im RedNote-Stil, auf diesen Feed abgestimmt.", thumb: "example-card-xiaohongshu" },
      { title: "Hero-Grafiken", body: "Flüssige Gradient-Hero-Visuals für Websites und Launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karussells", body: "Social-Karussells aus mehreren Slides, die über alle Frames einheitlich bleiben.", thumb: "example-social-carousel" },
      { title: "UI-Mock-Frames", body: "Benachrichtigungs- und Geräte-Frames für Produkt-Storytelling.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiken, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Cards und Cover, aus einem Prompt gerendert. Wähle eines nahe deinem Bedarf und tausch deinen Text ein.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Social-Card in Pastell" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redaktionelles Dreiton-Poster" },
      { thumb: "example-magazine-poster", caption: "Poster im Magazin-Stil" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Markantes redaktionelles Cover" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Grafik-Vorlagen durchsuchen',
    faqTitle: 'Bild-FAQ',
    faq: [
      {
        q: 'Ist das ein KI-Bildgenerator wie Midjourney?',
        a: 'Nein. Open Design komponiert Grafiken mit echtem Layout und echter Typografie — deine Schlagzeile, deine Marke, exakte Maße — und rendert zu HTML, das du als PNG exportierst. Es ist Design-Komposition, keine Pixel-Generierung.',
      },
      {
        q: 'Kann ich eine einheitliche Serie von Cards machen?',
        a: 'Ja. Da jede Grafik eine Vorlage ist, behältst du das Layout und änderst den Text, sodass eine ganze Serie perfekt ausgerichtet und markengerecht bleibt.',
      },
      {
        q: 'Welche Größen kann es produzieren?',
        a: 'Jede — die Grafik rendert in den exakten Maßen, die du angibst, von einer quadratischen Social-Card bis zu einem breiten Banner, und exportiert dann nach PNG.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Mach deine nächste Grafik noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle einen Prompt in eine markengerechte Grafik — im Agent, den du bereits nutzt.',
  },
  video: {
    title: 'Motion-Grafiken & Kurzvideos mit Open Design + Claude Code erstellen',
    description:
      'Verwandle ein Skript in animierte Frames und Kurzvideos — Titelkarten, Bewegungs-Hintergründe und Outros, mit deinem Markensystem komponiert und aus HTML gerendert. Keine Motion-Graphics-Suite, kein Scrubben auf der Timeline.',
    breadcrumb: 'Video',
    label: 'Anwendungsfall · Video',
    heading: 'Motion-Grafiken aus einem Skript, nicht aus einer Timeline',
    lead: 'Beschreibe den Moment, den du willst — ein Titel-Reveal, eine Daten-Animation, ein Logo-Outro. Open Design komponiert animierte Frames mit deinem Markensystem und rendert sie zu Video, keine Motion-Graphics-Suite nötig.',
    heroImageAlt:
      'Redaktionelle Illustration: ein Skript verwandelt sich in eine Folge animierter Video-Frames',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt ein Skript in animierte, markengerechte Frames, die dein Agent zu Kurzvideo rendert — aus HTML komponiert, in deinem Repo versioniert, ohne Timeline-Editor zu lernen.',
    stepsTitle: 'So funktioniert Motion mit Open Design',
    steps: [
      {
        title: 'Beschreibe den Moment',
        body: 'Sag, was passieren soll — "ein Glitch-Titel, der sich in unser Logo auflöst, dann eine Abschlusskarte." Der Agent lädt die Motion-Fähigkeit, sodass er animierte Frames produziert, kein statisches Bild.',
        imageAlt: 'Illustration einer Person, die eine Bewegungssequenz beschreibt',
      },
      {
        title: 'Wende Marken- & Motion-Stil an',
        body: 'Open Design liefert Frame-Vorlagen — filmische Light-Leaks, Glitch-Titel, Logo-Outros — und wendet deine Farben und Schrift an, sodass die Bewegung gewollt und markengerecht wirkt.',
        imageAlt: 'Illustration von Marken-Styling, das auf animierte Frames angewendet wird',
      },
      {
        title: 'Rendere die Frames zu Video',
        body: 'Frames werden in HTML komponiert und zu Video gerendert, sodass Timing und Layout präzise und wiederholbar sind — kein manuelles Keyframing auf einer Timeline.',
        imageAlt: 'Illustration von HTML-Frames, die zu einem Videoclip rendern',
      },
      {
        title: 'Iteriere und exportiere',
        body: 'Verfeinere im Gespräch mit dem Agent — "verlangsame das Titel-Reveal, füge eine Bildunterschrift hinzu." Exportiere Kurzclips für Social oder Produkt. Die Quelle bleibt in deinem Projekt.',
        imageAlt: 'Illustration eines Videoclips, der verfeinert und für Social exportiert wird',
      },
    ],
    tableTitle: 'Motion mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'After Effects / Motion-Suiten',
    tableRows: [
      {
        capability: 'Vom Skript zu animierten Frames',
        withOd: 'Ein Prompt; der Agent komponiert die Sequenz',
        without: 'Jedes Element von Hand auf einer Timeline keyframen',
      },
      {
        capability: 'Markengerecht bleiben',
        withOd: 'Frame-Vorlagen + deine Farben und Schrift',
        without: 'Marken-Styling pro Projekt neu bauen',
      },
      {
        capability: 'Präzises, wiederholbares Timing',
        withOd: 'In HTML komponiert, deterministisch gerendert',
        without: 'Manuelles Scrubben, schwer zu reproduzieren',
      },
      {
        capability: 'Export für Social',
        withOd: 'Kurzclips zu Video gerendert',
        without: 'Export-Presets und Codec-Gefummel',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Frame-Quelle liegt in deinem Repo, diff-bar',
        without: 'Binäre Projektdatei, kein echtes Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Teure Suite, steile Lernkurve',
      },
    ],
    featuresTitle: 'Was du animieren kannst',
    features: [
      { title: "Hyperframes", body: "Frame-für-Frame-Bewegungssequenzen, aus HTML komponiert.", thumb: "example-video-hyperframes" },
      { title: "Kurzformat für Social", body: "Vertikale Clips, gebaut für Social-Feeds.", thumb: "example-video-shortform" },
      { title: "Motion-Frame-Sets", body: "Wiederverwendbare animierte Frames, die du zu einem Clip zusammensetzt.", thumb: "example-motion-frames" },
      { title: "Filmische Light-Leaks", body: "Filmische Übergänge und atmosphärische Hintergründe.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch-Titel", body: "Titel-Reveals mit Bewegung und Textur.", thumb: "example-frame-glitch-title" },
      { title: "Logo-Outros", body: "Markenkonforme Abschluss-Animationen für jeden Clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte animierte Frames und Clips, aus einem Prompt gerendert. Wähle einen nahe deiner Idee und beschreibe die Bewegung.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes-Sequenz" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Flüssiger Bewegungs-Hintergrund" },
      { thumb: "example-frame-macos-notification", caption: "Animierter UI-Frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animiertes Datendiagramm" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Motion-Vorlagen durchsuchen',
    faqTitle: 'Video-FAQ',
    faq: [
      {
        q: 'Brauche ich After Effects oder eine Motion-Graphics-Suite?',
        a: 'Nein. Open Design komponiert animierte Frames in HTML und rendert sie zu Video in deinem Coding-Agent. Es gibt keinen Timeline-Editor zu lernen oder zu lizenzieren.',
      },
      {
        q: 'Für welche Art von Video eignet sich das?',
        a: 'Kurzformat-Motion — Titelkarten, Daten-Animationen, Logo-Outros, Social-Clips. Es ist für Marken- und Produkt-Motion gebaut, nicht für abendfüllenden Schnitt.',
      },
      {
        q: 'Ist das Timing reproduzierbar?',
        a: 'Ja. Da Frames in Code komponiert und deterministisch gerendert werden, bekommst du jedes Mal dasselbe Ergebnis und kannst es per Prompt präzise anpassen.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Animiere deine nächste Idee noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle ein Skript in Motion — im Agent, den du bereits nutzt.',
  },
  designSystem: {
    title: 'Ein Designsystem mit Open Design + Claude Code bauen und anwenden',
    description:
      'Erfasse deine Marke als wiederverwendbares Designsystem, das dein Coding-Agent auf jedes Artefakt anwendet — Farben, Schrift, Komponenten und Ton in einer DESIGN.md. Einmal definieren; jeder Prototyp, jedes Deck und jedes Dashboard bleibt markengerecht.',
    breadcrumb: 'Designsystem',
    label: 'Anwendungsfall · Designsystem',
    heading: 'Ein Designsystem, angewendet auf alles, was dein Agent macht',
    lead: 'Definiere deine Marke einmal, und Open Design trägt sie in jede Ausgabe — Prototypen, Decks, Dashboards, Grafiken. Das System liegt in deinem Repo als DESIGN.md, die der Agent liest, sodass Konsistenz automatisch entsteht, nicht von Hand.',
    heroImageAlt:
      'Redaktionelle Illustration eines einzelnen Designsystems, das in viele markengerechte Artefakte ausstrahlt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design erfasst deine Marke als portables Designsystem, das dein Agent auf jedes Artefakt anwendet — einmal in deinem Repo definiert, überall durchgesetzt, ohne zentrales Design-Tool, das den Zugang kontrolliert.',
    stepsTitle: 'So funktionieren Designsysteme mit Open Design',
    steps: [
      {
        title: 'Erfasse das System',
        body: 'Beschreibe deine Marke — Farben, Schrift, Abstände, Stimme — oder richte den Agent auf eine bestehende Website, um sie zu extrahieren. Open Design schreibt sie in eine DESIGN.md, die in deinem Projekt liegt.',
        imageAlt: 'Illustration einer Marke, die in eine einzelne Designsystem-Datei erfasst wird',
      },
      {
        title: 'Starte von einer bewährten Basis',
        body: 'Open Design liefert über 140 Referenz-Designsysteme — von Apple und Linear bis redaktionell und brutalistisch. Forke eines nahe deiner Marke, statt von einer leeren Seite zu starten.',
        imageAlt: 'Illustration einer Galerie von Referenz-Designsystemen, durch die geblättert wird',
      },
      {
        title: 'Wende es überall an',
        body: 'Jede andere Fähigkeit liest dasselbe System, sodass ein Prototyp, ein Deck und ein Dashboard alle eine visuelle Sprache teilen — ohne dass du sie jedes Mal neu angeben musst.',
        imageAlt: 'Illustration eines Systems, das einheitlich über viele Artefakt-Typen angewendet wird',
      },
      {
        title: 'Entwickle es an einem Ort weiter',
        body: 'Ändere das System, und das nächste Rendering spiegelt es überall wider. Da es eine Datei in deinem Repo ist, werden Design-Entscheidungen wie Code überprüft und versioniert.',
        imageAlt: 'Illustration eines Designsystems, das aktualisiert wird und sich auf alle Ausgaben überträgt',
      },
    ],
    tableTitle: 'Designsysteme mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Design-Tool-Bibliotheken / Styleguides',
    tableRows: [
      {
        capability: 'Das System definieren',
        withOd: 'Eine DESIGN.md, die der Agent liest, geforkt aus über 140 Referenzen',
        without: 'Ein statischer Styleguide oder eine tool-gebundene Bibliothek',
      },
      {
        capability: 'Über Artefakt-Typen hinweg anwenden',
        withOd: 'Dasselbe System speist Prototypen, Decks, Dashboards, Grafiken',
        without: 'Pro Tool und pro Datei neu implementiert',
      },
      {
        capability: 'Alles konsistent halten',
        withOd: 'Automatisch — jede Fähigkeit liest eine Quelle',
        without: 'Manuelle Disziplin; driftet mit der Zeit',
      },
      {
        capability: 'Die Marke weiterentwickeln',
        withOd: 'Einmal bearbeiten; nächstes Rendering aktualisiert überall',
        without: 'Suchen und Ersetzen über Dateien und Tools hinweg',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Liegt in deinem Repo, diff-bar wie Code',
        without: 'In einem Design-Tool vergraben, schwer zu prüfen',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, portabel, läuft lokal',
        without: 'An ein Design-Tool-Abo gebunden',
      },
    ],
    featuresTitle: 'Systeme, von denen du starten kannst',
    features: [
      { title: "Apple", body: "Saubere, zurückhaltende Ästhetik mit Systemschrift.", thumb: "design-system-apple" },
      { title: "Linear", body: "Klarer Produkt-Tool-Look mit engen Abständen.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Weich, dokumentenorientiert, zugänglich.", thumb: "design-system-notion" },
      { title: "Figma", body: "Verspielt, farbenfroh, mit der Energie eines Kreativ-Tools.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutral, in Forschungsqualität.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dicht, technisch, entwicklernativ.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Designsysteme in Open Design',
    galleryLead:
      'Einige der über 140 Referenzsysteme, die du als Startpunkt forken kannst. Wähle eines nahe deiner Marke und passe es an.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "System im Airbnb-Stil" },
      { thumb: "design-system-vercel", caption: "System im Vercel-Stil" },
      { thumb: "design-system-stripe", caption: "System im Stripe-Stil" },
      { thumb: "design-system-spotify", caption: "System im Spotify-Stil" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Designsysteme durchsuchen',
    faqTitle: 'Designsystem-FAQ',
    faq: [
      {
        q: 'Was genau ist hier das Designsystem?',
        a: 'Eine DESIGN.md-Datei in deinem Repo, die Farben, Schrift, Abstände, Komponenten und Stimme erfasst. Jede Open-Design-Fähigkeit liest sie, sodass deine Marke automatisch auf alles angewendet wird, was der Agent produziert.',
      },
      {
        q: 'Muss ich bei null anfangen?',
        a: 'Nein. Open Design liefert über 140 Referenz-Designsysteme, die du forken kannst — von Apple und Linear bis redaktionell und brutalistisch — und dann an deine Marke anpasst.',
      },
      {
        q: 'Wie bleibt es über Decks, Dashboards und Prototypen hinweg konsistent?',
        a: 'Weil all diese Fähigkeiten dieselbe DESIGN.md lesen. Definiere das System einmal, und Konsistenz entsteht automatisch, statt etwas zu sein, das du von Hand überwachst.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Definiere dein Designsystem noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und gib deinem Agent eine Marke, die er überall anwendet — im Agent, den du bereits nutzt.',
  },
  roleSoloBuilder: {
    title: 'Open Design für Solo-Builder und Indie-Hacker',
    description:
      'Liefere wie ein Ein-Personen-Team. Open Design macht aus deinem Coding-Agenten die Design-Hälfte deines Start-ups – Prototypen, Landingpages, Dashboards und Brand-Visuals, alles aus einem Prompt, alles markenkonform, alles in deinem Repo.',
    breadcrumb: 'Solo-Builder',
    label: 'Für · Solo-Builder',
    heading: 'Dein Design-Team ist der Agent, den du längst nutzt',
    lead: 'Kein Designer, kein Budget, keine Übergabe. Beschreibe, was du brauchst, und dein Agent rendert es – heute Vormittag eine Landingpage, am Nachmittag ein Dashboard, vor dem Launch Social-Cards – alle aus einem Designsystem, das du einmal definiert hast.',
    heroImageAlt:
      'Redaktionelle Illustration einer Person am Schreibtisch, umgeben von einer Landingpage, einer App, einem Dashboard und Social-Cards, alle in einem einheitlichen Stil',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design ist die Designabteilung, die ein Solo-Gründer nie hatte: vom Prompt zum Artefakt über jede Fläche, die dein Produkt braucht, in einer Marke, ohne Übergabe und ohne zusätzliche Tools.',
    stepsTitle: 'So nutzt ein Solo-Builder Open Design',
    steps: [
      {
        title: 'Definiere deine Marke einmal',
        body: 'Halte Farben, Typografie und Tonalität in einer DESIGN.md fest (oder forke eines von über 140 Referenzsystemen). Jedes Artefakt, das du danach erzeugst, ist automatisch markenkonform.',
        imageAlt: 'Illustration einer einzigen Markendefinitionsdatei',
      },
      {
        title: 'Erzeuge alles, was als Nächstes ansteht',
        body: 'Prototyp, Landingpage, Dashboard, Pitch-Deck, Social-Card – derselbe Agent, dieselbe Marke, jeweils ein Prompt. Kein Toolwechsel, kein Nachkaufen von Lizenzen.',
        imageAlt: 'Illustration vieler Artefakttypen, die aus einem Prompt entstehen',
      },
      {
        title: 'Liefere es aus – es ist bereits echt',
        body: 'Alles rendert als HTML / Code in deinem Repo, also wird der Prototyp zum Produkt und die Landingpage geht live. Keine Wegwerf-Mockups.',
        imageAlt: 'Illustration eines Artefakts, das vom Prompt direkt live geht',
      },
    ],
    tableTitle: 'Solo bauen mit Open Design vs. den harten Weg gehen',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Heute allein gestemmt',
    tableRows: [
      { capability: 'Jede Designfläche abdecken', withOd: 'Ein Agent macht Prototyp, Landing, Dashboard, Marke', without: 'Fünf SaaS-Tools und Tutorials zusammenflicken' },
      { capability: 'Markenkonform bleiben', withOd: 'Eine DESIGN.md überall automatisch angewendet', without: 'Den Look pro Tool neu bauen, driftet mit der Zeit' },
      { capability: 'Im Solo-Tempo arbeiten', withOd: 'Von der Idee zum Artefakt in einem Prompt', without: 'Ein Design-Tool lernen, für das du keine Zeit hast' },
      { capability: 'Liefern statt mocken', withOd: 'HTML / Code in deinem Repo, bereit zum Deployen', without: 'Ein Mockup, das jemand erst noch bauen muss' },
      { capability: 'Kosten', withOd: 'Open Source, eigene Keys, läuft lokal', without: 'Ein Stapel Abos mit Lizenzgebühr pro Platz' },
    ],
    featuresTitle: 'Was ein Solo-Builder ausliefern kann',
    features: [
      { title: 'Landingpages', body: 'Marketing- und SaaS-Landings, klickbar und live.', thumb: 'example-saas-landing' },
      { title: 'Produktprototypen', body: 'Mehrseitige Web-Apps zur Validierung der Idee.', thumb: 'example-web-prototype' },
      { title: 'Dashboards', body: 'Kennzahlen- und Admin-Ansichten für dein Produkt.', thumb: 'example-dashboard' },
      { title: 'Brand-Grafiken', body: 'Cover und Poster passend zu deiner Marke.', thumb: 'example-magazine-poster' },
      { title: 'Mobile Flows', body: 'App-Screens, wenn du über das Web hinausgehst.', thumb: 'example-mobile-app' },
      { title: 'Social-Cards', body: 'Launch- und Update-Cards für jeden Kanal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Solo gebaut mit Open Design',
    galleryLead:
      'Jede Fläche, die ein Ein-Personen-Start-up braucht, aus einem Prompt. Wähle eine, die deinem nächsten Schritt nahekommt, und beschreibe sie.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'SaaS-Landingpage' },
      { thumb: 'example-web-prototype', caption: 'Produktprototyp' },
      { thumb: 'example-dashboard', caption: 'Produkt-Dashboard' },
      { thumb: 'example-card-twitter', caption: 'Launch-Social-Card' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Vorlagen durchsuchen',
    faqTitle: 'Solo-Builder-FAQ',
    faq: [
      { q: 'Ich bin kein Designer – kann ich das wirklich nutzen?', a: 'Ja. Du beschreibst in einfacher Sprache, was du willst; der Agent wendet ein Designsystem an und rendert es. Die Fähigkeit liegt im Schreiben des Prompts, nicht im Verschieben von Pixeln.' },
      { q: 'Deckt es alles ab oder nur eine Sache?', a: 'Alles, was ein kleines Produkt braucht – Prototypen, Landingpages, Dashboards, Decks, Grafiken – vom selben Agenten und aus derselben Marke.' },
      { q: 'Was wird aus den Ergebnissen?', a: 'Echtes HTML / Code in deinem Repo, sodass ein Prototyp zum Produkt und eine Landingpage live gehen kann, statt ein Mockup, das du wegwirfst.' },
      { q: 'Welche Agenten kann ich nutzen?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere First-Party-Adapter, mit deinen eigenen Provider-Keys.' },
    ],
    ctaTitle: 'Bau heute Abend das Ganze',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und lass einen Agenten dein Design-Team sein – in dem Agenten, den du ohnehin nutzt.',
  },
  roleDesigner: {
    title: 'Open Design für Designer',
    description:
      'Verbring deine Zeit mit Geschmack, nicht mit Fleißarbeit. Open Design lässt deinen Agenten die repetitive Produktionsarbeit erledigen – Varianten, Zustände, ganze Designsysteme – während du den Look führst und das letzte Wort behältst.',
    breadcrumb: 'Designer',
    label: 'Für · Designer',
    heading: 'Führe das Design – die Produktion übernimmt der Agent',
    lead: 'Du setzt System und Standard; der Agent rendert die Screens, die Zustände, die Varianten, die hochauflösenden Comps. Weniger Rechtecke schieben, mehr entscheiden, wie gut aussieht.',
    heroImageAlt:
      'Redaktionelle Illustration eines Designers, der führt, während ein Agent Screens, Varianten und ein Designsystem ausfüllt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design ist die Produktionsassistenz, die nie ermüdet: Du definierst das Designsystem und bringst den Geschmack ein; der Agent erzeugt den Rest, systemkonform, in deinem Repo.',
    stepsTitle: 'So nutzt ein Designer Open Design',
    steps: [
      {
        title: 'Kodiere dein System',
        body: 'Verwandle deine Marke in eine DESIGN.md – Typoskala, Farbe, Abstände, Komponenten, Tonalität. Das ist die Quelle der Wahrheit, der der Agent folgt.',
        imageAlt: 'Illustration eines als Datei erfassten Designsystems',
      },
      {
        title: 'Erzeuge den Long Tail',
        body: 'Jeden Screen, Zustand und jede Variante, die du sonst von Hand bautest – der Agent rendert sie systemkonform, sodass die langweiligen 80 % in Minuten erledigt sind.',
        imageAlt: 'Illustration vieler systemkonformer Screens, die auf einmal erzeugt werden',
      },
      {
        title: 'Führe und verfeinere',
        body: 'Kritisiere in Sprache – „den Abstand enger, den Leerzustand wärmer". Du behältst das letzte Wort; der Agent macht die Iterationen.',
        imageAlt: 'Illustration eines Designers, der Anweisungen gibt, während sich das Design aktualisiert',
      },
    ],
    tableTitle: 'Gestalten mit Open Design vs. der manuelle Weg',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Manuelles Design-Tooling',
    tableRows: [
      { capability: 'Ein Designsystem bauen', withOd: 'Eine DESIGN.md, die der Agent überall anwendet', without: 'Eine Bibliothek, die du pro Tool von Hand pflegst' },
      { capability: 'Varianten & Zustände erzeugen', withOd: 'Systemkonform aus einem Prompt erzeugt', without: 'Frames duplizieren und jeden einzeln anpassen' },
      { capability: 'Hochauflösende Comps', withOd: 'Als echtes HTML gerendert, kein flaches Mockup', without: 'Pixelarbeit, die das Engineering ohnehin neu baut' },
      { capability: 'Konsistent bleiben', withOd: 'Ein System, automatisch durchgesetzt', without: 'Manuelle Disziplin; driftet mit der Zeit' },
      { capability: 'Übergabe', withOd: 'Das Artefakt ist Code – keine Übersetzungslücke', without: 'Spec-Dokumente und Redlines' },
    ],
    featuresTitle: 'Was ein Designer führen kann',
    features: [
      { title: 'Redaktionelle Layouts', body: 'Art-Directed, rasterbasierte Kompositionen.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Artikel-Cover', body: 'Cover und Aufmacher im Magazinstil.', thumb: 'example-article-magazine' },
      { title: 'Poster', body: 'Markante typografische Poster, markenkonform.', thumb: 'example-magazine-poster' },
      { title: 'Social-Sets', body: 'Konsistente mehrteilige Carousels.', thumb: 'example-social-carousel' },
      { title: 'App-Screens', body: 'Hochauflösende Mobile- und Web-Screens.', thumb: 'example-mobile-app' },
      { title: 'Dashboards', body: 'Daten-UI, die dein System respektiert.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Geführt mit Open Design',
    galleryLead:
      'Hochauflösende, systemkonforme Arbeit, die der Agent aus Anweisungen erzeugt hat. Wähle eine, die deinem Stil nahekommt, und verfeinere sie.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Redaktionelles Layout' },
      { thumb: 'example-article-magazine', caption: 'Magazin-Cover' },
      { thumb: 'example-social-carousel', caption: 'Social-Carousel' },
      { thumb: 'example-magazine-poster', caption: 'Typografisches Poster' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Vorlagen durchsuchen',
    faqTitle: 'Designer-FAQ',
    faq: [
      { q: 'Ersetzt mich das?', a: 'Nein – es ersetzt die Fleißarbeit. Du setzt System und Geschmack; der Agent macht die repetitive Produktion, damit du Zeit für die Entscheidungen hast, die nur du treffen kannst.' },
      { q: 'Wie behalte ich die Kontrolle über den Look?', a: 'Deine DESIGN.md ist der Vertrag. Der Agent rendert innerhalb davon, und du kritisierst in Sprache, bis es passt.' },
      { q: 'Ist das Ergebnis editierbar / echt?', a: 'Es ist echtes HTML/CSS, kein flacher Export – es geht direkt in die Produktion, statt neu gebaut zu werden.' },
      { q: 'Welche Agenten kann ich nutzen?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere First-Party-Adapter, mit deinen eigenen Provider-Keys.' },
    ],
    ctaTitle: 'Führe heute Abend dein nächstes Design',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und lass den Agenten die Produktion erledigen, während du den Geschmack bestimmst – in dem Agenten, den du ohnehin nutzt.',
  },
  roleEngineering: {
    title: 'Open Design für Engineers',
    description:
      'Überspring die Design-Übergabe. Open Design verwandelt eine DESIGN.md in echtes Frontend, das dein Coding-Agent direkt schreibt – systemkonforme UI, Prototypen und Dashboards, im Repo, ohne Figma-Hin-und-Her.',
    breadcrumb: 'Engineering',
    label: 'Für · Engineering',
    heading: 'Von der Spec zum Frontend, keine Übergabe dazwischen',
    lead: 'Richte deinen Agenten auf eine DESIGN.md und eine Beschreibung; er schreibt systemkonformen, echten Frontend-Code – Komponenten, Screens, Dashboards – direkt in dein Projekt. Keine Redlines, kein „Warten auf Design".',
    heroImageAlt:
      'Redaktionelle Illustration einer DESIGN.md, die direkt in Frontend-Code und gerenderte UI fließt und einen Übergabeschritt überspringt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design schließt die Lücke zwischen Designer und Engineer, indem es das Designsystem maschinenlesbar macht: Derselbe Agent, der deinen Code schreibt, wendet das System an und rendert echte UI.',
    stepsTitle: 'So nutzt ein Engineer Open Design',
    steps: [
      {
        title: 'Lies das System, nicht eine Redline',
        body: 'Die DESIGN.md liegt im Repo. Dein Agent liest sie so, wie er den Rest der Codebasis liest – keine exportierten Specs zum Interpretieren.',
        imageAlt: 'Illustration eines Agenten, der eine DESIGN.md neben dem Code liest',
      },
      {
        title: 'Erzeuge systemkonforme UI',
        body: 'Beschreibe den Screen oder die Komponente; der Agent schreibt Frontend, das bereits zum System passt. Prototypen, Admin-Dashboards, interne Tools – in Minuten.',
        imageAlt: 'Illustration von UI-Code, der passend zu einem Designsystem erzeugt wird',
      },
      {
        title: 'Es ist bereits dein Code',
        body: 'Die Ausgabe ist HTML / Framework-Code in deinem Repo, prüfbar in einem PR. Kein Übersetzungsschritt zwischen „dem Design" und „dem Build".',
        imageAlt: 'Illustration einer erzeugten UI, die als prüfbarer PR landet',
      },
    ],
    tableTitle: 'Frontend mit Open Design vs. der Übergabeweg',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Design-zu-Dev-Übergabe',
    tableRows: [
      { capability: 'Ein Design als Bauvorlage bekommen', withOd: 'Eine DESIGN.md, die dein Agent direkt liest', without: 'Eine Figma-Datei, die du von Hand neu interpretierst' },
      { capability: 'Zum System passen', withOd: 'Automatisch zur Generierungszeit durchgesetzt', without: 'Gegen eine Spec abschätzen, Drift schleicht sich ein' },
      { capability: 'Interne Tools / Dashboards bauen', withOd: 'Prompt → systemkonformes Frontend im Repo', without: 'Auf einen Designer warten, dann zweimal bauen' },
      { capability: 'Review', withOd: 'Es ist Code – diff es in einem PR', without: 'Pixelvergleich gegen ein Mockup' },
      { capability: 'Kosten & Lock-in', withOd: 'Open Source, in deinem Repo, läuft lokal', without: 'Ein Design-Tool, das das ganze Team lizenzieren muss' },
    ],
    featuresTitle: 'Was ein Engineer erzeugen kann',
    features: [
      { title: 'Web-App-UI', body: 'Mehrseitige Frontends aus einer Beschreibung.', thumb: 'example-web-prototype' },
      { title: 'Dev-Dashboards', body: 'Repo-, CI- und Kennzahlen-Dashboards.', thumb: 'example-github-dashboard' },
      { title: 'Datenreports', body: 'Strukturierte Reports aus deinen Daten.', thumb: 'example-data-report' },
      { title: 'Admin-Dashboards', body: 'Interne Tools und Admin-Ansichten.', thumb: 'example-dashboard' },
      { title: 'Landingpages', body: 'Marketing-Seiten, ohne aufs Design zu warten.', thumb: 'example-saas-landing' },
      { title: 'Kanban / Boards', body: 'Interne Workflow-UIs.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Von Engineers gebaut mit Open Design',
    galleryLead:
      'Echtes, systemkonformes Frontend, direkt im Repo erzeugt. Wähle eines, das dem nahekommt, was du baust, und beschreibe es.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Web-App-UI' },
      { thumb: 'example-github-dashboard', caption: 'Dev-Dashboard' },
      { thumb: 'example-data-report', caption: 'Datenreport' },
      { thumb: 'example-kanban-board', caption: 'Internes Board-UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Vorlagen durchsuchen',
    faqTitle: 'Engineering-FAQ',
    faq: [
      { q: 'Brauche ich trotzdem einen Designer?', a: 'Für Marke und Richtung ja. Aber zum Bauen systemkonformer UI und interner Tools liest der Agent die DESIGN.md und schreibt das Frontend – ohne Übergabe-Hin-und-Her.' },
      { q: 'Was gibt es aus?', a: 'Echtes HTML / Framework-Code in deinem Repo, prüfbar in einem PR – kein Mockup, das du neu implementierst.' },
      { q: 'Wie bleibt es systemkonform?', a: 'Die DESIGN.md ist die Quelle der Wahrheit; der Agent wendet sie zur Generierungszeit an, sodass die Ausgabe ohne manuelle Pixelprüfung passt.' },
      { q: 'Welche Agenten kann ich nutzen?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere First-Party-Adapter, mit deinen eigenen Provider-Keys.' },
    ],
    ctaTitle: 'Erzeuge heute Abend deine nächste UI',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle eine DESIGN.md in Frontend – in dem Agenten, den du ohnehin nutzt.',
  },
  roleProductManagers: {
    title: 'Open Design für Produktmanager',
    description:
      'Warte nicht länger auf Design-Kapazität, um eine Idee zu vermitteln. Open Design lässt einen PM aus einem Prompt einen klickbaren Prototyp oder Wireframe machen – um Stakeholder auszurichten und das Team zu briefen, ohne Design-Ticket.',
    breadcrumb: 'Produktmanager',
    label: 'Für · Produktmanager',
    heading: 'Mach die Idee klickbar, noch vor dem Kick-off',
    lead: 'Beschreibe den Flow, und dein Agent rendert einen echten, klickbaren Prototyp, den du heute vor Stakeholder bringen kannst – sodass Reviews die echte Sache diskutieren, nicht einen Absatz in einem Dokument.',
    heroImageAlt:
      'Redaktionelle Illustration eines PM, der eine schriftliche Idee in einen klickbaren Prototyp verwandelt, der Stakeholdern gezeigt wird',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design gibt einem PM einen designfreien Weg, Ideen greifbar zu machen: vom Prompt zum Prototyp für Ausrichtung und Briefings, ohne das Design-Budget des Teams zu verbrauchen.',
    stepsTitle: 'So nutzt ein PM Open Design',
    steps: [
      {
        title: 'Beschreibe den Flow',
        body: 'Schreib die User Journey in einfacher Sprache – die Screens, die Zustände, den Happy Path. Kein Wireframe-Tool nötig.',
        imageAlt: 'Illustration eines PM, der einen User-Flow beschreibt',
      },
      {
        title: 'Bekomm einen klickbaren Prototyp',
        body: 'Der Agent rendert navigierbare Screens, durch die du wirklich klicken kannst – weit klarer als eine Folie oder ein Dokument für ein Stakeholder-Review.',
        imageAlt: 'Illustration eines klickbaren Prototyps, der aus einer Beschreibung entsteht',
      },
      {
        title: 'Richte aus und übergib',
        body: 'Teile den Link, sammle Feedback an der echten Sache und gib den Prototyp dann an Design/Eng als präzisen, gemeinsamen Ausgangspunkt weiter.',
        imageAlt: 'Illustration eines Prototyps, der zur Ausrichtung geteilt und dann ans Team übergeben wird',
      },
    ],
    tableTitle: 'PM-Arbeit mit Open Design vs. Warten aufs Design',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Heute ohne',
    tableRows: [
      { capability: 'Eine Idee greifbar machen', withOd: 'Prompt → klickbarer Prototyp, selbst gemacht', without: 'Ein Design-Ticket einreichen und auf Kapazität warten' },
      { capability: 'Stakeholder ausrichten', withOd: 'Sie klicken durch den echten Flow', without: 'Sie lesen ein Dokument und stellen es sich anders vor' },
      { capability: 'Das Team briefen', withOd: 'Ein konkreter Prototyp als Spec', without: 'Eine Textwand und ständiges Hin und Her' },
      { capability: 'Vor dem Bauen iterieren', withOd: 'Per Prompt ändern, neu teilen', without: 'Noch eine Runde in der Design-Warteschlange' },
      { capability: 'Kosten', withOd: 'Open Source, im Agenten, den du ohnehin nutzt', without: 'Design-Stunden für Wegwerf-Konzepte' },
    ],
    featuresTitle: 'Was ein PM vor Leute bringen kann',
    features: [
      { title: 'Mobile Flows', body: 'Durchgängige App-Journeys, klickbar.', thumb: 'example-mobile-app' },
      { title: 'Onboarding-Flows', body: 'Willkommen → Einrichtung → erster Lauf.', thumb: 'example-mobile-onboarding' },
      { title: 'Boards & Workflows', body: 'Kanban- und Prozess-UIs für Specs.', thumb: 'example-kanban-board' },
      { title: 'Dashboards', body: 'Kennzahlenansichten, um das Problem zu rahmen.', thumb: 'example-dashboard' },
      { title: 'Web-Prototypen', body: 'Mehrseitige Web-Flows zum Reviewen.', thumb: 'example-web-prototype' },
      { title: 'Trend-Ansichten', body: '30-Tage- und Trend-Snapshots für Kontext.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Von PMs prototypisiert mit Open Design',
    galleryLead:
      'Klickbare Flows, aus einer Beschreibung gerendert, bereit für ein Stakeholder-Review. Wähle einen, der deiner Idee nahekommt, und beschreibe ihn.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Mobile Flow' },
      { thumb: 'example-mobile-onboarding', caption: 'Onboarding-Flow' },
      { thumb: 'example-kanban-board', caption: 'Workflow-Board' },
      { thumb: 'example-web-prototype', caption: 'Web-Prototyp' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Vorlagen durchsuchen',
    faqTitle: 'Produktmanager-FAQ',
    faq: [
      { q: 'Ich kann nicht designen – ist das etwas für mich?', a: 'Ja. Du beschreibst den Flow in Worten; der Agent macht ihn klickbar. Es geht ums Vermitteln und Ausrichten, kein Design-Tool nötig.' },
      { q: 'Ist es ein echter Prototyp oder ein Mockup?', a: 'Echt und klickbar – Navigation und Zustände funktionieren, sodass Stakeholder auf das tatsächliche Erlebnis reagieren.' },
      { q: 'Ersetzt es das Design?', a: 'Nein – es gibt Design und Eng einen präzisen, gemeinsamen Ausgangspunkt statt einer Text-Spec und spart Design-Kapazität für die Arbeit, die sie braucht.' },
      { q: 'Welche Agenten kann ich nutzen?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere First-Party-Adapter, mit deinen eigenen Provider-Keys.' },
    ],
    ctaTitle: 'Mach heute Abend deine Idee klickbar',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle deine nächste Spec in etwas, das Leute anklicken können – in dem Agenten, den du ohnehin nutzt.',
  },
  roleMarketing: {
    title: 'Open Design für Marketing-Teams',
    description:
      'Liefere Kampagnen im Content-Tempo. Open Design lässt deinen Agenten Landingpages, Social-Cards und Kampagnen-Visuals aus einem Prompt erzeugen – markenkonform, auf Abruf, ohne sich beim Design anzustellen.',
    breadcrumb: 'Marketing',
    label: 'Für · Marketing',
    heading: 'Kampagnen-Visuals im Tempo eines Prompts',
    lead: 'Landingpages, Social-Cards, Cover, Ankündigungsgrafiken – in Sprache beschrieben, markenkonform gerendert, am selben Tag ausgeliefert. Kein Design-Ticket, kein Ringen mit Vorlagen.',
    heroImageAlt:
      'Redaktionelle Illustration einer Marketerin, die ein Briefing in eine Landingpage und ein Set markenkonformer Social-Cards verwandelt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design ist die Always-on-Design-Ressource fürs Marketing: vom Prompt zum Asset für Landingpages und Social, markenkonform, sodass Kampagnen im Tempo deines Textens ausgeliefert werden.',
    stepsTitle: 'So nutzt ein Marketing-Team Open Design',
    steps: [
      {
        title: 'Leg die Marke fest',
        body: 'Deine DESIGN.md hält Farben, Typografie und Tonalität. Jedes Asset, das der Agent macht, ist automatisch markenkonform – kein Neustylen pro Asset.',
        imageAlt: 'Illustration eines Markensystems, das auf Marketing-Assets angewendet wird',
      },
      {
        title: 'Erzeuge die Kampagne',
        body: 'Landingpage, Social-Cards, Cover, Ankündigungsgrafiken – jeweils ein Prompt, ein konsistentes Set über jeden Kanal.',
        imageAlt: 'Illustration eines vollständigen Kampagnen-Sets, das aus Prompts erzeugt wird',
      },
      {
        title: 'Liefere und iteriere',
        body: 'Landingpages rendern als HTML, das du deployen kannst; Grafiken exportieren als PNG. Ändere die Headline, render das Set neu – ohne Warten in einer Warteschlange.',
        imageAlt: 'Illustration von Kampagnen-Assets, die ausgeliefert und schnell iteriert werden',
      },
    ],
    tableTitle: 'Marketing mit Open Design vs. das übliche Gewusel',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Heute ohne',
    tableRows: [
      { capability: 'Eine Landingpage starten', withOd: 'Prompt → markenkonforme Seite, deploybar', without: 'Design briefen oder mit einem Website-Builder kämpfen' },
      { capability: 'Ein konsistentes Social-Set', withOd: 'Gleiche Vorlage, neuer Text, perfekt ausgerichtet', without: 'Jede Card von Hand neu ausrichten' },
      { capability: 'Markenkonform bleiben', withOd: 'Eine DESIGN.md auf jedes Asset angewendet', without: 'Hoffen, dass jedes Asset zu den Richtlinien passt' },
      { capability: 'Im Kampagnen-Tempo arbeiten', withOd: 'Asset per Prompt, am selben Tag', without: 'Hinter dem Design-Backlog anstellen' },
      { capability: 'Kosten', withOd: 'Open Source, kein Design-Tool mit Lizenz pro Platz', without: 'Abos plus Design-Stunden' },
    ],
    featuresTitle: 'Was ein Marketing-Team ausliefern kann',
    features: [
      { title: 'Landingpages', body: 'Kampagnen- und Produkt-Landings, deploybar.', thumb: 'example-saas-landing' },
      { title: 'Social-Cards', body: 'X- / Twitter-Cards, markenkonform.', thumb: 'example-card-twitter' },
      { title: 'Carousels', body: 'Mehrteilige Social-Sets, konsistent.', thumb: 'example-social-carousel' },
      { title: 'Poster', body: 'Ankündigungs- und Event-Poster.', thumb: 'example-magazine-poster' },
      { title: 'Artikel-Cover', body: 'Blog- und Newsletter-Cover.', thumb: 'example-article-magazine' },
      { title: 'Web-Seiten', body: 'Microsites und Kampagnenseiten.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Vom Marketing ausgeliefert mit Open Design',
    galleryLead:
      'Markenkonforme Kampagnen-Assets, aus einem Prompt gerendert. Wähle eines, das deiner Kampagne nahekommt, und tausch deinen Text ein.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Kampagnen-Landingpage' },
      { thumb: 'example-card-twitter', caption: 'Social-Card' },
      { thumb: 'example-social-carousel', caption: 'Social-Carousel' },
      { thumb: 'example-magazine-poster', caption: 'Ankündigungsposter' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Vorlagen durchsuchen',
    faqTitle: 'Marketing-FAQ',
    faq: [
      { q: 'Brauchen wir für jedes Asset einen Designer?', a: 'Nein. Der Agent rendert markenkonforme Landingpages und Social-Assets aus einem Prompt, sodass das Team routinemäßige Kampagnenarbeit ausliefert, ohne sich beim Design anzustellen.' },
      { q: 'Wie bleiben Assets markenkonform?', a: 'Deine DESIGN.md wird automatisch auf alles angewendet – Farben, Typografie und Tonalität ziehen sich durch jedes Asset.' },
      { q: 'Können die Landingpages wirklich live gehen?', a: 'Ja – sie rendern als HTML, das du deployen kannst, und Grafiken exportieren als PNG. Das sind auslieferbare Assets, keine Mockups.' },
      { q: 'Welche Agenten kann ich nutzen?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere First-Party-Adapter, mit deinen eigenen Provider-Keys.' },
    ],
    ctaTitle: 'Liefere heute Abend deine nächste Kampagne',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle Briefings in markenkonforme Assets – in dem Agenten, den du ohnehin nutzt.',
  },
};
