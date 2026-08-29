// German (de) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const de: DeepPartial<CodexSlidesCopy> = {
  title: 'Codex Slides — Open-Source-KI-Slide-Studio in Codex · PPTX & PDF',
  description:
    'Codex Slides ist ein quelloffenes KI-Slide-Studio, das direkt in Codex läuft. Beschreib ein Deck — oder zeig ihm ein Repository, ein PDF oder eine Tabelle — und dein lokales Codex recherchiert, gliedert, gestaltet, rendert und exportiert eine echte PPTX sowie ein druckfertiges PDF. Jede Folie ist eine vollflächige visuelle Leinwand. 45 Deck-Vorlagen, 73 Community-Stile, 24 geführte Szenarien; Fast mode rendert 10+ Folien in rund 4–5 Minuten. Browser-first, MIT-lizenziert, läuft mit deinem bestehenden `codex login` — ganz ohne zusätzliche API-Keys.',
  label: 'Schwesterprojekt',
  heading: 'Das KI-Slide-Studio in deinem Coding-Agenten',
  lead:
    'Die meisten KI-Foliengeneratoren verstecken die Arbeit hinter einer einzigen Anfrage und reichen dir eine Datei. Codex Slides hält die ganze Kette in Codex sichtbar — Recherche, Gliederung, visuelle Richtung, Rendern, Bearbeiten, Präsentieren, Exportieren — und jedes Deck bleibt ein dauerhaftes Projekt auf deiner eigenen Festplatte. Bild-nativ: Jede Folie ist eine vollflächige visuelle Leinwand, keine Vorlage mit ausgetauschtem Text.',
  downloadCta: 'OpenDesign herunterladen',
  heroAlt:
    'Codex Slides — links Codex, das im Browser das Slide-Studio steuert, rechts eine fertig gerenderte Marktbericht-Folie',

  glanceAria: 'Auf einen Blick',
  glance: {
    stars: 'GitHub-Sterne',
    templates: 'Deck-Vorlagen',
    styles: 'Community-Stile',
    scenarios: 'Geführte Szenarien',
    license: 'Lizenz',
  },

  whyTitle: 'Warum es das gibt',
  whyLead:
    'Ein Deck ist kein One-Shot-Generierungsproblem. Es ist eine Kette von Entscheidungen — was gesagt wird, in welcher Reihenfolge, in welcher visuellen Sprache — und jede einzelne lässt sich vor dem Rendern billiger korrigieren als danach.',
  ideas: [
    {
      headline: 'Du siehst zu, statt auf eine Datei zu warten.',
      body: 'Codex öffnet das Studio in seinem Browser und hält es sichtbar. Du bestätigst das Briefing, überarbeitest die Gliederung und gibst die visuelle Richtung frei, bevor eine einzige Seite gerendert wird — so werden die teuren Fehler gefangen, solange sie noch billig sind.',
    },
    {
      headline: 'Jedes Deck ist ein dauerhaftes Projekt, kein Download.',
      body: 'Konversation, Quellen, Gliederung, Markenregeln, Checkpoints und gerenderte Seiten bleiben alle auf der Festplatte. Komm morgen wieder und arbeite am selben Projekt weiter; jeder KI-Befehl und jede manuelle Änderung hinterlässt einen unveränderlichen Checkpoint, den du prüfen, wiederherstellen oder exportieren kannst.',
    },
    {
      headline: 'Bild-nativ — die Folie ist die Leinwand.',
      body: 'Jede Seite wird als eine einzige vollflächige visuelle Leinwand komponiert und nicht als Textfeld auf einem Theme; genau deshalb hält das Ergebnis dem Vergleich mit handgestalteten Decks stand. Markier eine Folie direkt und lass allein diese Seite aus deinen Anmerkungen neu generieren.',
    },
  ],

  flowTitle: 'So funktioniert es',
  flowLead:
    'Ein Prompt hinein, ein präsentationsfertiges Deck heraus — mit einem Checkpoint an jeder Stelle, an der dein Urteil mehr wert ist als ein weiterer Modellaufruf.',
  flow: [
    { step: '01', headline: 'Das Briefing klären', body: 'Ein zugeschnittenes Fragenformular bestätigt Publikum, Seitenzahl, Seitenverhältnis, Sprache, Auflösung und visuelle Absicht, bevor das Schreiben beginnt.' },
    { step: '02', headline: 'Die Fakten recherchieren', body: 'Optionale mehrstufige Web-Recherche erzeugt ein quellenbelegtes Markdown-Briefing, das in Design Files einsehbar und bearbeitbar bleibt.' },
    { step: '03', headline: 'Die Gliederung formen', body: 'Bearbeite jeden Titel und jeden Kernpunkt, ergänze oder streiche Folien, sortier die Story um oder lass den Agenten sie umbauen — bevor es überhaupt Visuals gibt.' },
    { step: '04', headline: 'Die visuelle Richtung festlegen', body: 'Codex Slides sortiert seine Stil-Bibliothek nach deinem Thema und deiner Gliederung. Nimm einen Vorschlag, durchsuch den ganzen Katalog oder bleib beim Standard.' },
    { step: '05', headline: 'Parallel rendern', body: 'Fast mode schickt alle Seiten gleichzeitig los statt eine nach der anderen, sodass ein Deck mit 10+ Folien in etwa vier bis fünf Minuten fertig ist, während die Richtung gesetzt bleibt.' },
    { step: '06', headline: 'Direkt bearbeiten', body: 'Lass umschreiben, markier einen Bereich mit Pfeilen und Kommentaren, tausch ein Bild, sortier Seiten um, setz Übergänge und schreib Sprechernotizen.' },
    { step: '07', headline: 'Präsentieren und exportieren', body: 'Starte Presenter Mode mit synchronisiertem Publikumsfenster und Timer und lade danach eine echte PPTX sowie ein druckfertiges PDF mit erhaltenen Notizen herunter.' },
  ],

  showcaseTitle: 'So sehen die Decks aus',
  showcaseLead:
    'Jede Karte ist ein visuelles System, das mit Codex Slides mitgeliefert wird — eine fertige Richtung als Startpunkt, in die du dein eigenes Thema, dein Publikum oder deine Dateien einsetzt.',
  showcase: [
    { alt: 'Business- und Marktbericht-Deck mit Diagrammen und KPI-Hervorhebungen', tag: 'Marktbericht · Diagramme & KPIs' },
    { alt: 'Daten-Dashboard-Deck mit Weltkarte, Ringdiagramm und Kennzahlen-Kacheln', tag: 'Datenstory · Dashboard' },
    { alt: 'Filmische Produkt-Keynote-Folie mit kontraststarkem Titelmoment', tag: 'Keynote · filmisch' },
    { alt: 'Redaktionelles Magazin-Deck mit Serifen-Schlagzeilen und Druckraster', tag: 'Editorial · Druckraster' },
    { alt: 'Helle, luftige Produkt-Keynote-Folie mit weichen 3D-Diagrammknoten und einem einzigen Indigo-Akzent', tag: 'Keynote · Clean Daylight' },
    { alt: 'Beschriftete technische Schnittdarstellung, die ein System als Querschnitt rekonstruiert', tag: 'Technik · beschrifteter Schnitt' },
  ],

  insideTitle: 'Das echte Produkt',
  insideLead:
    'Das sind die echten Screens, die Codex in seinem Browser steuert — dieselben, die du auch von Hand bedienen würdest, sodass du an jedem Punkt eingreifen und übernehmen kannst.',
  inside: [
    { alt: 'Codex-Slides-Startseite mit Prompt-Composer, Szenario-Shortcuts und Community-Stilen', tag: 'Start · Deck beschreiben' },
    { alt: 'Szenario-Bibliothek mit vorkonfigurierten Präsentations-Workflows', tag: 'Szenarien · Workflow wählen' },
    { alt: 'Bearbeitbares Präsentations-Outline mit Titeln und Talking Points', tag: 'Outline · Story formen' },
    { alt: 'Folien-Editor mit voller Leinwand im Blick, Toolbar, Sprechernotizen und Miniaturen', tag: 'Editor · volle Leinwand' },
  ],

  scenariosTitle: 'Sechs Workflow-Gruppen',
  scenariosLead:
    'Vierundzwanzig geführte Szenarien, gebündelt in sechs Workflow-Gruppen. Jede Gruppe bringt ihre eigenen Fragen, Quellen-Slots und ihre eigene visuelle Grammatik mit. Starte mit einer davon — oder beschreib einfach, was du brauchst.',
  scenarios: [
    { name: 'Von Grund auf erstellen', blurb: 'Geschäftsberichte, Pitch-Decks und Projektvorschläge aus einem einzigen Briefing.' },
    { name: 'Eine Quelle umwandeln', blurb: 'Eine bestehende PPTX, HTML-Seite oder PDF aufwerten; Dokumente, Notizen oder ein Whiteboard-Foto in Folien verwandeln.' },
    { name: 'Daten & Insights', blurb: 'Dashboards, wiederkehrende Performance-Reports, Finanzergebnisse und Umfrage-Auswertungen.' },
    { name: 'Recherche & Entscheidungen', blurb: 'Deep-Research-Präsentationen, Marktstudien, Wettbewerbsanalysen, Literaturübersichten.' },
    { name: 'Ein Deck optimieren', blurb: 'Ein Markensystem anwenden, einen Referenzstil nachbauen, übersetzen und lokalisieren, kürzen oder ausbauen.' },
    { name: 'Spezialisierte Formate', blurb: 'Schulungsunterlagen, Launch-Keynotes, Portfolios und Fallstudien, vorlagengesteuerte Serien.' },
  ],

  formatsTitle: 'Echte Dateien zum Weitergeben',
  formatsLead:
    'Wenn das Deck sitzt, exportier eine echte PowerPoint (.pptx) und ein druckfertiges PDF — beide behalten deine Sprechernotizen. Wähl die Renderqualität und das Format, das zum Raum oder zum Feed passt:',
  formatsRows: [
    { label: 'Exportformate', values: 'PowerPoint (.pptx) · PDF · Sprechernotizen erhalten' },
    { label: 'Renderqualität', values: '1K · 2K · 4K' },
    { label: 'Seitenverhältnisse', values: '16:9 · 4:3 · 1:1 · 9:16 · 3:4' },
  ],

  duoTitle: 'Schnell und reibungslos',
  fastTitle: 'Fast mode',
  fastLead:
    'Seiten werden parallel gerendert — bis zu vier gleichzeitig, der Rest in der Warteschlange — statt eine nach der anderen, während die freigegebene Gliederung und die visuelle Richtung gesetzt bleiben. Ein Deck mit zehn Folien ist typischerweise in rund vier bis fünf Minuten fertig, und ein unterbrochener Lauf setzt am gespeicherten Projektstand wieder an, statt von vorn zu beginnen.',
  installTitle: 'In Codex installieren',
  installLead:
    'Füg das Repository als Plugin-Marktplatz hinzu, installier das Plugin, starte Codex neu und beginn eine neue Aufgabe. Du brauchst Codex mit Plugin-Unterstützung, Node.js 20 oder neuer und ein `codex login` — keinen eigenen OpenAI-Key und für den Standard-Workflow auch keine `.env`-Datei.',

  finalEyebrow: 'Nächster Schritt',
  tiebackTitle: 'Aus der Open-Design-Familie',
  tiebackBody:
    'OpenDesign ist der offene, local-first Design-Workspace, der außerhalb des Coding-Agenten sitzt, den du ohnehin nutzt. Codex Slides ist dieselbe Idee, gerichtet auf Präsentationen: Dein Agent arbeitet sichtbar, das Projekt bleibt auf deiner Maschine, und nichts steckt hinter einem Abo. Für das volle Design-Toolkit jenseits der Folien hol dir die Open-Design-App.',

  schemaAlternateName: 'Das quelloffene KI-Slide-Studio in Codex',
  schemaWhatQuestion: 'Was ist Codex Slides?',
  schemaWhatAnswer:
    'Codex Slides ist ein quelloffenes, MIT-lizenziertes KI-Slide-Studio, das als Plugin in Codex läuft. Es verwandelt einen Prompt, ein Repository oder eine Sammlung von Dateien über einen sichtbaren Workflow in ein präsentationsfertiges Deck — Klärung, optionale Recherche, Gliederung, visuelle Richtung, paralleles Rendern, Bearbeiten, Präsentieren und PPTX/PDF-Export — und bewahrt jedes Deck als dauerhaftes Projekt auf deiner eigenen Festplatte.',
  schemaKeyQuestion: 'Braucht Codex Slides einen eigenen API-Key?',
  schemaKeyAnswer:
    'Nein. Es läuft über das ChatGPT-Konto, mit dem du dich bereits per `codex login` angemeldet hast. Der Standard-Workflow braucht weder einen eigenen OpenAI-API-Key noch eine `.env`-Datei; nötig sind Codex mit Plugin-Unterstützung, Node.js 20 oder neuer und Git.',
  schemaExportQuestion: 'Kann Codex Slides echte PowerPoint-Dateien exportieren?',
  schemaExportAnswer:
    'Ja. Codex Slides exportiert eine echte PPTX und ein druckfertiges PDF, beide mit den Sprechernotizen des Projekts, in 1K/2K/4K-Renderqualität und in fünf Seitenverhältnissen (16:9, 4:3, 1:1, 9:16, 3:4). Da es bild-nativ arbeitet, enthalten exportierte PPTX-Folien vollflächige Bilder statt einzeln editierbarer PowerPoint-Formen; der Export mit editierbaren Formen steht auf der Roadmap.',
  schemaRelationQuestion: 'Hat Codex Slides mit OpenDesign zu tun?',
  schemaRelationAnswer:
    'Ja. Codex Slides ist ein Schwesterprojekt des Teams hinter OpenDesign — derselbe offene, local-first, agent-native Ansatz, angewandt auf Präsentationen statt auf Designdateien.',
};

export default de;
