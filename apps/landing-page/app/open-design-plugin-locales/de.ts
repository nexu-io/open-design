import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const de: OpenDesignPluginCopy = {
  metadata: {
    title: 'OpenDesign für Codex/ChatGPT | OpenDesign Cloud Plugin installieren',
    description:
      'Installieren Sie OpenDesign Cloud in Codex/ChatGPT und erstellen Sie Websites, Präsentationen, Prototypen und Designsysteme direkt in derselben Aufgabe.',
    keywords:
      'OpenDesign Codex Plugin, ChatGPT Desktop Plugin, Codex Plugin installieren, OpenDesign Cloud, Codex Design Plugin, Codex MCP',
  },
  hero: {
    title: 'OpenDesign Plugin für Codex/ChatGPT',
    leadBefore: 'Geben Sie die folgende Anweisung in eine beliebige Aufgabe in Ihrer',
    chatgptLabel: 'ChatGPT-Desktop-App ein',
    installAria: 'OpenDesign Cloud in Codex/ChatGPT installieren',
    copy: 'Kopieren',
    github: 'Installationsanleitung auf GitHub öffnen ↗',
  },
  demo: {
    title: 'Einmal installieren. Direkt aus Codex/ChatGPT gestalten.',
    lead:
      'Sehen Sie sich zuerst den vollständigen Arbeitsbereich von Codex und OpenDesign an und folgen Sie anschließend dem echten Ablauf von der Installation bis zum Ergebnis.',
    overviewAlt:
      'Eine echte Codex-Aufgabe mit dem OpenDesign Plugin neben der fertigen Goodfield-Café-Website',
    overviewLabel: 'Echte Codex-Aufgabe',
    overviewCaption:
      'Prompt, Übergabe an OpenDesign, generierte Dateien und fertige Website bleiben in einem Arbeitsbereich sichtbar.',
    stepListAria: 'Die fünf Phasen eines echten Durchlaufs mit dem Codex Plugin',
    installPhase: 'Installieren',
    installTitle: 'Codex mit der Installation beauftragen',
    installBody:
      'Fügen Sie diese Anweisung in eine Codex-Aufgabe ein. Codex fügt die kanonische Git-Marketplace-Quelle hinzu, installiert das Plugin nur, wenn es fehlt, und schließt die Einrichtung des lokalen MCP ab, ohne dass ein Eintrag in einem öffentlichen Katalog erforderlich ist.',
    installNote: 'Einmal in Codex einfügen – alle Installationsschritte werden für Sie erledigt.',
    steps: [
      {
        phase: 'Verwenden',
        title: 'Eine neue Codex-Aufgabe starten',
        body:
          'Nachdem Codex die Installation abgeschlossen hat, öffnen Sie das installierte OpenDesign Plugin in einer neuen Aufgabe und wählen Sie „Try now“, um zu beginnen.',
        alt: 'Die echte Detailansicht des OpenDesign Plugins in Codex mit der Schaltfläche Try now',
      },
      {
        phase: 'Erstellen',
        title: 'Das Design-Briefing formulieren',
        body:
          'Erwähnen Sie OpenDesign und beschreiben Sie anschließend das gewünschte Ergebnis, die Inhalte, die visuelle Richtung und die Anforderungen an die responsive Darstellung.',
        alt: 'Ein echter Codex-Prompt, der OpenDesign mit einer einladenden Website für ein Nachbarschaftscafé beauftragt',
      },
      {
        phase: 'Erstellen',
        title: 'Die Übergabe live verfolgen',
        body:
          'Codex bestätigt die Richtung, legt das Projekt an und übergibt die Arbeit an OpenDesign, während die Dateien live erscheinen.',
        alt: 'Ein echter Arbeitsbereich von Codex und OpenDesign während der Erstellung der Website für das Nachbarschaftscafé',
      },
      {
        phase: 'Erstellen',
        title: 'Das Ergebnis prüfen',
        body:
          'Dieselbe Aufgabe liefert die responsive Landingpage des Goodfield Cafés sowie die generierten Bilder und bearbeitbaren Dateien zurück.',
        alt: 'Die fertige Landingpage des Goodfield Nachbarschaftscafés, erstellt mit dem OpenDesign Plugin in Codex',
      },
    ],
  },
  use: {
    title: 'Mit dem exakten Prompt starten.',
    lead:
      'Wählen Sie OpenDesign im Plugin-Menü von Codex aus, beschreiben Sie das gewünschte Ergebnis und verfeinern Sie es in derselben Aufgabe weiter. Codex stellt die Plugin-Erwähnung als OpenDesign Chip dar.',
    promptLabel: 'Prompt aus der aufgezeichneten Codex-Aufgabe',
    copyPrompt: 'Codex-Prompt kopieren',
    galleryAria: 'Mit OpenDesign erstellte Beispiele',
    templates: [
      {
        alt: 'Oryzo-Produkt-Landingpage mit einer haptischen Schneidematte und einem Objekt aus Kork',
        label: 'Produkt-Launch',
      },
      {
        alt: 'OpenDesign Osaka Event-Landingpage mit typografisch gestalteter Karte',
        label: 'Eventseite',
      },
      {
        alt: 'Dunkle, redaktionell gestaltete Produktwebsite für Fable 5',
        label: 'Redaktionelle Website',
      },
      {
        alt: 'Interaktive OpenDesign Modell-Zeitleiste auf einer hellen Arbeitsfläche',
        label: 'Interaktive Story',
      },
    ],
    promptListAria: 'Prompt-Beispiele für OpenDesign Cloud',
    prompts: [
      { title: 'Website' },
      { title: 'Präsentationen' },
      { title: 'Prototyp' },
      { title: 'Designsystem' },
    ],
  },
  faq: {
    title: 'Fragen vor der Installation',
    lead: 'Codex behält die Kontrolle über die Aufgabe. OpenDesign übernimmt den visuellen Workflow.',
    items: [
      {
        q: 'Welche Funktionen ergänzt das Plugin in Codex?',
        a:
          'Es erweitert Codex um einen OpenDesign Workflow für Websites, Präsentationen, Prototypen und Designsysteme. Für Briefings, Projekte und die Erstellung von Ergebnissen verbindet sich das Plugin mit dem lokalen OpenDesign MCP.',
      },
      {
        q: 'Welche Codex-Produkte werden unterstützt?',
        a:
          'Das aktuelle Paket unterstützt Codex Desktop und Codex CLI. Codex ist der erste unterstützte Host.',
      },
      {
        q: 'Was benötige ich vor der Installation?',
        a:
          'Verwenden Sie Codex CLI 0.144.6 oder neuer und OpenDesign 0.17.0 oder neuer. Installieren Sie OpenDesign, bevor Sie das lokale MCP registrieren.',
      },
      {
        q: 'Warum benötige ich eine neue Codex-Aufgabe?',
        a:
          'Codex lädt Plugin- und MCP-Funktionen beim Start einer Aufgabe. Eine neue Aufgabe erkennt das soeben installierte OpenDesign Cloud Plugin.',
      },
      {
        q: 'Muss das OpenDesign Fenster geöffnet bleiben?',
        a:
          'Nein. Das registrierte lokale MCP kann die signierte OpenDesign Laufzeit bei Bedarf ohne sichtbare Benutzeroberfläche starten.',
      },
    ],
  },
  final: {
    aria: 'OpenDesign Cloud in Codex/ChatGPT installieren',
    title: 'OpenDesign in Ihrer nächsten Codex/ChatGPT-Aufgabe nutzen.',
    bodyBeforeMention: 'Installieren Sie das Plugin, verbinden Sie das lokale MCP und rufen Sie',
    bodyAfterMention: 'auf.',
    copy: 'Kopieren',
    download: 'OpenDesign herunterladen',
    source: 'Quellcode ansehen',
  },
  clipboard: {
    copying: 'Wird kopiert…',
    copied: 'Kopiert',
    failed: 'Auswählen und kopieren',
  },
  schema: {
    pageName: 'OpenDesign Cloud Plugin für Codex/ChatGPT',
    applicationName: 'OpenDesign Cloud Plugin für Codex/ChatGPT',
  },
};

export default de;
