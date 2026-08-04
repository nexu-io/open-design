import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const de: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design für Codex/ChatGPT | Open Design Cloud Plugin installieren',
    description:
      'Installieren Sie Open Design Cloud in Codex/ChatGPT und erstellen Sie Websites, Präsentationen, Prototypen und Designsysteme direkt in derselben Aufgabe.',
    keywords:
      'Open Design Codex Plugin, ChatGPT Desktop Plugin, Codex Plugin installieren, Open Design Cloud, Codex Design Plugin, Codex MCP',
  },
  hero: {
    title: 'Open Design Plugin für Codex/ChatGPT',
    leadBefore: 'Geben Sie die folgende Anweisung in eine beliebige Aufgabe in Ihrer',
    chatgptLabel: 'ChatGPT-Desktop-App ein',
    installAria: 'Open Design Cloud in Codex/ChatGPT installieren',
    copy: 'Kopieren',
    github: 'Quellcode auf GitHub ansehen ↗',
  },
  agentInstall: {
    howToName: 'Open Design Plugin in Codex installieren',
    howToDescription:
      'Von Agenten ausführbare Schritte zum Installieren des Open Design Plugins in Codex und zum Registrieren des lokalen MCP.',
    eyebrow: 'Für Agenten lesbares Installationsprotokoll',
    title: 'Das Codex-Plugin vollständig installieren.',
    intro:
      'Wenn der Benutzer Sie gebeten hat, Open Design zu installieren, führen Sie dieses Protokoll der Reihe nach aus. Die Anfrage autorisiert ausschließlich Änderungen an der Codex-Plugin- und MCP-Konfiguration des Benutzers. Lassen Sie andere Marketplaces, Plugins, MCP-Server und den Authentifizierungsstatus unverändert.',
    downloadLabel: 'Offizielle Download-Seite von Open Design ↗',
    steps: [
      {
        title: 'Die unterstützte Umgebung vorab prüfen',
        body:
          'Codex CLI 0.144.6 oder neuer, Open Design 0.17.0 oder neuer sowie Zugriff auf das kanonische Marketplace-Repository sind erforderlich. Laden Sie nicht eigenmächtig ein Installationsprogramm herunter und führen Sie kein ungeprüftes Installationsskript aus. Fehlt Open Design oder ist die Version zu alt, brechen Sie ab und verweisen Sie den Benutzer auf die offizielle Download-Seite.',
      },
      {
        title: 'Die Konfiguration vor Änderungen prüfen',
        body:
          'Lesen Sie den erforderlichen Selektor und die Version aus release-manifest.json und vergleichen Sie beides anschließend mit dem geprüften Codex-Status. Ein fehlendes MCP namens open-design ist bei einer Erstinstallation zu erwarten. Verweist der Marketplace-Name open-design auf eine andere Quelle, brechen Sie ab und melden Sie den Konflikt. Behalten Sie open-design@open-design nur bei, wenn die installierte Version mit der in release-manifest.json deklarierten Version übereinstimmt.',
      },
      {
        title: 'Nur fehlende Komponenten installieren',
        body:
          'Führen Sie den Marketplace-Befehl nur aus, wenn der kanonische Marketplace fehlt. Führen Sie den Plugin-Befehl aus, wenn open-design@open-design fehlt. Ist eine andere Version installiert, bitten Sie den Benutzer vor dem Aktualisieren oder erneuten Installieren um Bestätigung; überspringen Sie die Installation nur, wenn genau die erforderliche Version vorhanden ist. Ein Ergebnis mit alreadyAdded: true gilt als Erfolg. Bearbeiten Sie die Codex-Konfiguration nicht manuell und kopieren Sie keine Plugin-Dateien in das Codex-Benutzerverzeichnis.',
      },
      {
        title: 'Das lokale MCP von Open Design sicherstellen',
        body:
          'Behalten Sie ein vorhandenes, aktiviertes MCP namens open-design bei. Führen Sie andernfalls das von der installierten Open Design Anwendung bereitgestellte MCP-Installationsprogramm aus. Führen Sie auf POSIX-Systemen den aufgelösten od-Pfad erst aus, nachdem dessen Prüfung open-design-cli:mcp-install:v1 zurückgegeben hat; bei jedem anderen Ergebnis, einschließlich /usr/bin/od, müssen Sie Open Design Settings → MCP server oder den signierten, im Paket enthaltenen Vorgang --headless --mcp-install codex verwenden. Legen Sie niemals einen localhost-Port auf Verdacht fest und führen Sie codex mcp login nicht aus; die Vela-Anmeldung erfolgt in Open Design.',
      },
      {
        title: 'Überprüfen, Bericht erstatten und eine neue Aufgabe starten',
        body:
          'Überprüfen Sie die Plugin-ID open-design@open-design, bestätigen Sie, dass die installierte Version exakt plugin.version in release-manifest.json entspricht, und prüfen Sie ein aktiviertes stdio MCP namens open-design. Dessen Befehl muss einen absoluten Startpfad von Open Design verwenden und darf weder bearer token noch API key oder Vela-Zugangsdaten enthalten. Berichten Sie, was installiert wurde, und nennen Sie alle noch ausstehenden Voraussetzungen für Open Design oder die Vela-Anmeldung. Starten Sie eine neue Codex-Aufgabe, damit der installierte Plugin-Snapshot geladen wird, und rufen Sie anschließend @open-design auf.',
      },
    ],
  },
  demo: {
    title: 'Einmal installieren. Direkt aus Codex/ChatGPT gestalten.',
    lead:
      'Sehen Sie sich zuerst den vollständigen Arbeitsbereich von Codex und Open Design an und folgen Sie anschließend dem echten Ablauf von der Installation bis zum Ergebnis.',
    overviewAlt:
      'Eine echte Codex-Aufgabe mit dem Open Design Plugin neben der fertigen Goodfield-Café-Website',
    overviewLabel: 'Echte Codex-Aufgabe',
    overviewCaption:
      'Prompt, Übergabe an Open Design, generierte Dateien und fertige Website bleiben in einem Arbeitsbereich sichtbar.',
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
          'Nachdem Codex die Installation abgeschlossen hat, öffnen Sie das installierte Open Design Plugin in einer neuen Aufgabe und wählen Sie „Try now“, um zu beginnen.',
        alt: 'Die echte Detailansicht des Open Design Plugins in Codex mit der Schaltfläche Try now',
      },
      {
        phase: 'Erstellen',
        title: 'Das Design-Briefing formulieren',
        body:
          'Erwähnen Sie Open Design und beschreiben Sie anschließend das gewünschte Ergebnis, die Inhalte, die visuelle Richtung und die Anforderungen an die responsive Darstellung.',
        alt: 'Ein echter Codex-Prompt, der Open Design mit einer einladenden Website für ein Nachbarschaftscafé beauftragt',
      },
      {
        phase: 'Erstellen',
        title: 'Die Übergabe live verfolgen',
        body:
          'Codex bestätigt die Richtung, legt das Projekt an und übergibt die Arbeit an Open Design, während die Dateien live erscheinen.',
        alt: 'Ein echter Arbeitsbereich von Codex und Open Design während der Erstellung der Website für das Nachbarschaftscafé',
      },
      {
        phase: 'Erstellen',
        title: 'Das Ergebnis prüfen',
        body:
          'Dieselbe Aufgabe liefert die responsive Landingpage des Goodfield Cafés sowie die generierten Bilder und bearbeitbaren Dateien zurück.',
        alt: 'Die fertige Landingpage des Goodfield Nachbarschaftscafés, erstellt mit dem Open Design Plugin in Codex',
      },
    ],
  },
  use: {
    title: 'Mit dem exakten Prompt starten.',
    lead:
      'Wählen Sie Open Design im Plugin-Menü von Codex aus, beschreiben Sie das gewünschte Ergebnis und verfeinern Sie es in derselben Aufgabe weiter. Codex stellt die Plugin-Erwähnung als Open Design Chip dar.',
    promptLabel: 'Prompt aus der aufgezeichneten Codex-Aufgabe',
    copyPrompt: 'Codex-Prompt kopieren',
    galleryAria: 'Mit Open Design erstellte Beispiele',
    templates: [
      {
        alt: 'Oryzo-Produkt-Landingpage mit einer haptischen Schneidematte und einem Objekt aus Kork',
        label: 'Produkt-Launch',
      },
      {
        alt: 'Open Design Osaka Event-Landingpage mit typografisch gestalteter Karte',
        label: 'Eventseite',
      },
      {
        alt: 'Dunkle, redaktionell gestaltete Produktwebsite für Fable 5',
        label: 'Redaktionelle Website',
      },
      {
        alt: 'Interaktive Open Design Modell-Zeitleiste auf einer hellen Arbeitsfläche',
        label: 'Interaktive Story',
      },
    ],
    promptListAria: 'Prompt-Beispiele für Open Design Cloud',
    prompts: [
      { title: 'Website' },
      { title: 'Präsentationen' },
      { title: 'Prototyp' },
      { title: 'Designsystem' },
    ],
  },
  faq: {
    title: 'Fragen vor der Installation',
    lead: 'Codex behält die Kontrolle über die Aufgabe. Open Design übernimmt den visuellen Workflow.',
    items: [
      {
        q: 'Welche Funktionen ergänzt das Plugin in Codex?',
        a:
          'Es erweitert Codex um einen Open Design Workflow für Websites, Präsentationen, Prototypen und Designsysteme. Für Briefings, Projekte und die Erstellung von Ergebnissen verbindet sich das Plugin mit dem lokalen Open Design MCP.',
      },
      {
        q: 'Welche Codex-Produkte werden unterstützt?',
        a:
          'Das aktuelle Paket unterstützt Codex Desktop und Codex CLI. Codex ist der erste unterstützte Host.',
      },
      {
        q: 'Was benötige ich vor der Installation?',
        a:
          'Verwenden Sie Codex CLI 0.144.6 oder neuer und Open Design 0.17.0 oder neuer. Installieren Sie Open Design, bevor Sie das lokale MCP registrieren.',
      },
      {
        q: 'Warum benötige ich eine neue Codex-Aufgabe?',
        a:
          'Codex lädt Plugin- und MCP-Funktionen beim Start einer Aufgabe. Eine neue Aufgabe erkennt das soeben installierte Open Design Cloud Plugin.',
      },
      {
        q: 'Muss das Open Design Fenster geöffnet bleiben?',
        a:
          'Nein. Das registrierte lokale MCP kann die signierte Open Design Laufzeit bei Bedarf ohne sichtbare Benutzeroberfläche starten.',
      },
    ],
  },
  final: {
    aria: 'Open Design Cloud in Codex/ChatGPT installieren',
    title: 'Open Design in Ihrer nächsten Codex/ChatGPT-Aufgabe nutzen.',
    bodyBeforeMention: 'Installieren Sie das Plugin, verbinden Sie das lokale MCP und rufen Sie',
    bodyAfterMention: 'auf.',
    copy: 'Kopieren',
    download: 'Open Design herunterladen',
    source: 'Quellcode ansehen',
  },
  clipboard: {
    copying: 'Wird kopiert…',
    copied: 'Kopiert',
    failed: 'Auswählen und kopieren',
  },
  schema: {
    pageName: 'Open Design Cloud Plugin für Codex/ChatGPT',
    applicationName: 'Open Design Cloud Plugin für Codex/ChatGPT',
  },
};

export default de;
