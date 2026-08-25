/*
 * German copy for the DeepSeek Harness design collection.
 * Translated from the English baseline.
 */
import type { DeepseekCopyOverride } from './index';

export const de: DeepseekCopyOverride = {
  collectionEyebrow: 'Kuratierte Sammlung',
  collectionHeading: 'DeepSeek-Harness-Plugins für Design',
  collectionLede:
    'Eine kuratierte Sammlung von dsh-Plugins für Designarbeit: Vision-Bridges, die Screenshots lesen, Canvases und generative UI, auf denen der Agent zeichnen kann, Design-Review-Tools und Workbenches, die alles in der Vorschau zeigen. DeepSeek Harness liest dasselbe SKILL.md-Format wie Claude Code und Codex — deine Design-Skill-Bibliothek kommt einfach mit.',
  collectionStats: [
    { value: '19', label: 'kuratierte dsh-Plugins' },
    { value: '19', label: 'Quell-Repos' },
    { value: 'SKILL.md', label: 'geteilt mit Claude Code & Codex' },
  ],
  collectionIntro:
    'Jedes dsh-Plugin hier unten existiert wirklich, ist nativ für DeepSeek Harness, über das dsh-plugin-Topic auf GitHub auffindbar und verlinkt auf seine Quelle. Sie erledigen vier Aufgaben: dem rein textbasierten Harness Sehvermögen geben, ihm Design-Flächen zum Zeichnen geben, Design-Review in den Loop einbauen und sein Web-UI in einen Design-Workspace verwandeln.',
  collectionCategoryBlurbs: [
    'Mach aus Screenshots, Mockups und Charts strukturierte Evidenz, auf die ein Text-Modell reagieren kann.',
    'Gib dem Agenten Flächen zum Zeichnen: editierbare Vektor-Canvases, Live-UI-Karten, Slides.',
    'Schließ den Loop: annotiere echte Seiten, kompiliere Motion-Assets, nimm deine Skill-Bibliothek mit.',
    'Mach den Harness selbst zum Design-Workspace: Preview-Panels, Workbenches und Boards neben dem Chat.',
  ],
  collectionCloserHeading: 'Spar dir das Setup. Designe mit DeepSeek Harness in OpenDesign',
  filterAll: 'Alle',
  collectionCloserBody:
    'OpenDesign ist der quelloffene, agent-native Design-Workspace rund um DeepSeek Harness. Er hält Systeme, Skills und Templates konsistent, damit der Agent Arbeit liefert, die dir gehört.',

  categoryVision: 'Vision & Eingabe',
  categoryCanvas: 'Canvas & generatives UI',
  categoryWorkflow: 'Design-Workflow',
  categoryWorkspace: 'Workspace & Vorschau',

  ctaDownload: 'OpenDesign herunterladen',
  ctaStarList: 'DeepSeek Harness mit einem Star versehen',
  ctaGuide: 'So designst du mit DeepSeek Harness',
  ctaBrowseAll: 'Alle Plugins ansehen',
  ctaViewSource: 'Quelle ansehen',
  ctaOurRepo: 'deepseek-harness auf GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Was es macht',
  cardCta: 'Plugin ansehen',

  detailWhatIsIt: 'Worum es geht',
  detailWhyForDesign: 'Warum das fürs Design zählt',
  detailHowWithAgent: 'So nutzt du es mit DeepSeek Harness',
  detailExampleTag: 'Wann du danach greifst',
  detailSource: 'Quelle',
  detailCategory: 'Kategorie',
  detailMaintainer: 'Autor',
  detailTags: 'Tags',
  detailLicense: 'Lizenz',
  detailCovers: 'Was es abdeckt',
  detailUpstream: 'Aus der Upstream-README',
  detailAgentNote: 'Läuft mit DeepSeek Harness',
  detailTraction: 'Resonanz',
  detailRepo: 'Quell-Repository',
  detailStars: 'Stars',

  installHeading: 'So installierst du es',
  installRunInAgent: 'Führe das in einem Terminal aus.',
  installRestart: 'Starte dsh web neu, damit es das Plugin lädt.',
  installClone: 'Klone das Repo.',
  installPoint: 'Verweise DeepSeek Harness auf die Skill-Datei.',
  installThenUse: 'Beschreibe dann das gewünschte Design. Der Harness greift die Tools des Plugins auf.',

  installNote:
    'Jedes Plugin hier ist kostenlos installierbar und verlinkt auf seine echte Originalquelle.',
  installNoteCta: 'Die ganze Sammlung ansehen',
  detailMoreOnList: 'Mehr im DeepSeek-Harness-Repo',
  detailRelated: 'Weitere DeepSeek-Harness-Design-Plugins',
  finalEyebrow: 'Nächster Schritt',
  detailCloserHeading: 'Mit OpenDesign designen, ohne Setup',
  detailCloserBody:
    'Installiere dieses Plugin selbst, oder leg mit OpenDesign eine ganze kuratierte Design-Ebene um DeepSeek Harness. Eigener Key, eigenes Ergebnis.',

  skills: {
    modlens: {
      tagline: 'Gibt rein textbasierten DeepSeek-Modellen Plug-in-Sehvermögen: Screenshot einfügen, strukturierte Evidenz bekommen.',
      whatIsIt:
        'Eine Vision-Brücke für rein textbasierte Coding-Agenten. Füg ein Bild in den Chat ein, und modlens wandelt es in strukturierte JSON-Evidenz um — vollständige Transkription, Layout-Regionen in Lesereihenfolge, Entitäten und Relationen — statt in die Vermutung eines Modells.',
      whyForDesign: [
        'UI-Screenshots werden zu Element-für-Element-Durchgängen, auf die der Agent reagieren kann.',
        'Dichte Charts und Datenvisualisierungen werden vollständig gelesen: Achsen, Skalen, Paletten, hervorgehobene Bereiche.',
        'Füg mehrere Referenzen auf einmal ein, und er identifiziert erst die gemeinsame visuelle Familie, bevor er jede einzeln beschreibt.',
      ],
      howWithAgent: [
        'Installiere das Plugin; der Model-Picker erhält DeepSeek-V4-Varianten mit modlens-Vision.',
        'Füg einen Screenshot, ein Mockup oder ein Chart direkt in die Unterhaltung ein.',
        'Stell Design-Fragen gegen die strukturierte Evidenz, statt das Bild neu zu beschreiben.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline: 'Zehn Vision-Tools für UI-Rekonstruktion, Grounding und Pixel-Diff-Verifikation.',
      whatIsIt:
        'Ein DeepSeek-Harness-natives Bundle aus zehn Vision-Tools: Bild-Q&A, Grounding und Detection mit Pixelkoordinaten, Long-Screenshot-OCR, Zuschneiden, Farbextraktion, HTML-Screenshots und Pixel-Diff. Die Tools werden progressiv über einen vision-tools-Skill eingebunden.',
      whyForDesign: [
        'UI-Rekonstruktion schließt den Loop mit Zahlen: ein eingecheckter Workflow iteriert einen Nachbau von 6,04 % Pixeldifferenz auf 0 %.',
        'Grounding und Detection liefern Pixel-Boxen im Originalbild, der Agent arbeitet also mit Koordinaten statt mit geparster Prosa.',
        'Infografiken und handgezeichnete Skizzen werden zu editierbaren HTML/CSS-Interfaces.',
      ],
      howWithAgent: [
        'Füg das Plugin deinem web- oder headless-Profil hinzu und hinterlege ein Vision-Credential für die Remote-Tools.',
        'Aktiviere das Toolkit; der vision-tools-Skill bindet alle zehn Tool-Schemas ein.',
        'Bau eine Referenz nach und verifiziere dann mit vision_html_screenshot und vision_pixel_diff.',
      ],
    },
    'dsh-ui-spec': {
      tagline: 'Macht aus UI-Screenshots implementierungsreife Specs: Tokens, Spacing-Skala, Layout-Raster.',
      whatIsIt:
        'Ein einzelnes analyze_ui_image-Tool, das einen Screenshot oder ein Mockup in eine strukturierte Frontend-Spec umwandelt. Eine deterministische Geometrie-Ebene misst exakte Abmessungen, Palette, vorgeschlagene Design-Tokens, Layout-Raster und Spacing-Skala; ein optionales Vision-Modell legt Semantik obendrauf.',
      whyForDesign: [
        'Pixelkoordinaten, Spacing-Skalen und Token-Paletten werden deterministisch berechnet, nicht von einem Vision-Modell geraten.',
        'Spec-Felder mappen direkt auf die Umsetzung: vorgeschlagene Tokens auf Design-Tokens, die Spacing-Skala auf CSS.',
        'Semantische Rollen liefern die Absicht, Geometrie liefert die Platzierung — zusammengeführt in einer JSON- plus Markdown-Spec.',
      ],
      howWithAgent: [
        'Füg das Plugin hinzu; die Geometrie-Ebene arbeitet offline und ohne jede Konfiguration.',
        'Verweise die semantische Ebene optional auf einen beliebigen OpenAI-kompatiblen Vision-Endpoint.',
        'Gib dem Agenten einen Screenshot und bau aus der gelieferten Spec statt aus dem Bild.',
      ],
    },
    'dsh-media-skills': {
      tagline: 'Kostenlose Augen und ein kostenloser Pinsel: eingefügte Bilder lesen plus Bildgenerierung ohne Wasserzeichen.',
      whatIsIt:
        'Zwei SKILL.md-Skills und eine kostenlose Vision-Modell-Route für den Harness: vision-review liest Screenshots und fängt visuelle Bugs ab, media-tools generiert Illustrationen, Avatare, Hintergründe und Banner — beide laufen auf Free-Tier-Modellen.',
      whyForDesign: [
        'Fängt visuelle UI-Bugs ab, die ein Text-Agent nicht sehen kann: Überlappung, Overflow, Fehlausrichtung.',
        'Generiert Design-Assets ohne Wasserzeichen auf einem Free Tier, Exploration kostet also nichts.',
        'Ergänzt rein textbasierte Sessions um einen „Add image"-Button; eingefügte Bilder werden dem aktuellen Modell beschrieben.',
      ],
      howWithAgent: [
        'Füg das Plugin hinzu und leg die kostenlosen API-Keys im Credential-Store des Harness ab.',
        'Starte dsh web neu; der Model-Picker erhält eine kostenlose Vision-Route.',
        'Bitte in Alltagssprache um ein Review eines Screenshots oder um ein neues Asset.',
      ],
    },
    'dsh-openpencil': {
      tagline: 'Der Agent designt auf einem echten, editierbaren Vektor-Canvas, statt statische Bilder zurückzugeben.',
      whatIsIt:
        'Verbindet den Harness mit OpenPencil, einem quelloffenen AI-nativen Vektor-Design-Tool. Fünf Tools lassen den Agenten Design-as-Code-.op-Dokumente über transaktionale Batches erstellen, bearbeiten, rendern und inspizieren, mit Multi-Frame-Previews und einem verwalteten Editor für die menschliche Übernahme.',
      whyForDesign: [
        'Ein Loop von der Anforderung bis zum Canvas: der Agent bearbeitet das echte Dokument, und Previews rendern designgetreue Frames.',
        'Transaktionale Batches werden nur bei Erfolg veröffentlicht und überschreiben nie externe Änderungen — Konflikte werden sichtbar.',
        'Ein verwalteter Editor mit Auswahl, Ebenen, Eigenschaften und Undo lässt einen Menschen die Ausgabe des Agenten jederzeit übernehmen.',
      ],
      howWithAgent: [
        'Installiere OpenPencil und füg dann das Plugin deinem web-Profil hinzu.',
        'Beschreibe das Design; der Agent treibt openpencil_create und openpencil_edit in Batches.',
        'Öffne die gerenderte Vorschau oder den verwalteten Editor und iteriere direkt weiter.',
      ],
    },
    'dsh-visualize': {
      tagline: 'Das Modell zeichnet interaktive HTML-Karten direkt in den Unterhaltungsstream.',
      whatIsIt:
        'Ein visualize-Tool plus Begleit-Skill: das Modell schreibt ein HTML-Fragment und mountet es als sandboxed interaktive Karte im Chat — Simulatoren, Charts, Vergleichspanels und UI-Mockups, mit Streaming-Preview und Theme-abgestimmtem Styling.',
      whyForDesign: [
        'UI-Mockups leben in der Unterhaltung und lassen sich anklicken, statt nur beschrieben zu werden.',
        'Karten folgen dem Light/Dark-Theme und der Palette des Hosts, Previews wirken also nativ.',
        'Jede Karte läuft in einem sandboxed iframe mit strikter CSP — ein kaputtes Fragment kann die Session nicht brechen.',
      ],
      howWithAgent: [
        'Füg das Plugin hinzu und starte dsh web neu.',
        'Frag nach einem Mockup oder einem Vergleich; das Modell ruft visualize mit seinem eigenen HTML auf.',
        'Spiel die Session später erneut ab — Karten werden aus dem persistierten Tool-Ergebnis wiederhergestellt.',
      ],
    },
    'dsh-genui': {
      tagline: 'Über dreißig interaktive Komponenten, inline in Antworten gerendert, mit Action-Loop zurück zum Modell.',
      whatIsIt:
        'Das Modell beschreibt ein Interface als JSON in einem dsh-ui fence; ein browserseitiger Renderer macht daraus Live-Komponenten in der Antwort — Karten, Tabellen, Charts, Formulare, Tabs, Timelines, Diffs, mermaid, 3D-Szenen — die schon beim Streamen der Antwort erscheinen.',
      whyForDesign: [
        'Antworten werden zu Interfaces: Datenpanels, Charts und Formulare rendern dort, wo die Erklärung passiert.',
        'Interaktive Komponenten senden Aktionen zurück ans Modell, das wiederum das UI aktualisiert.',
        'Eine Komponenten-Whitelist und ein Spec-Guard sorgen dafür, dass ein kaputtes Chart nie auf dem Bildschirm landet.',
      ],
      howWithAgent: [
        'Füg das Plugin von GitHub hinzu und starte dsh web neu.',
        'Frag nach einem Dashboard, Quiz oder Formular; das Modell schreibt den dsh-ui fence selbst.',
        'Interagiere mit dem Ergebnis — lokale Aktionen reagieren sofort, Modell-Aktionen laufen zurück in den Loop.',
      ],
    },
    'dsh-openmaic': {
      tagline: 'Slides, interaktive Widgets und komplette abspielbare Lektionen, gerendert aus agentengeschriebenem JSON.',
      whatIsIt:
        'Vier Tools und ein Skill für sokratisches Lehren von der THU-MAIC-Gruppe: der Agent schreibt Slide-JSON im PPTist-Stil, das vom offiziellen OpenMAIC-Renderer gerendert wird, streamt interaktive Widgets als sandboxed Karten und kann eine Einzeiler-Anfrage abschicken, die als abspielbares Klassenzimmer zurückkommt.',
      whyForDesign: [
        'Slide-Decks mit Text, Formen, Bildern, Tabellen, Charts, Formeln und Code — geschrieben als JSON in der Unterhaltung.',
        'Interaktive Simulationen und Spiele rendern an Ort und Stelle als sandboxed Karten.',
        'Eine komplette Lektion mit visuellem Inhalt ist nur eine Anfrage entfernt, zurückgeliefert als abspielbarer Link.',
      ],
      howWithAgent: [
        'Füg das Plugin von GitHub hinzu; es kommt kompiliert, also ohne Build-Schritt.',
        'Starte dsh web neu und frag nach einem Deck oder einem Widget.',
        'Für ganze Lektionen pollt openmaic_generate den OpenMAIC-Service und liefert den Klassenzimmer-Link zurück.',
      ],
    },
    'dsh-web-review': {
      tagline: 'Zeig auf Elemente einer Live-Seite, annotiere visuell, und der Agent bearbeitet den Quellcode.',
      whatIsIt:
        'Ein eingebauter Browser für das Web-UI des Harness: Elemente per Hover hervorheben und auswählen wie in einem Design-Tool, Notizen anhängen und visuelle Live-Anpassungen ausprobieren — Text, Farbe, Typografie, Größe, Abstände, Rahmen, Effekte. Annotationen tragen Selektoren und Quellcode-Hinweise, damit der Agent den Code findet und fixt.',
      whyForDesign: [
        'Visuelles Zeigen und Annotieren ersetzt das wortreiche Beschreiben von UI-Problemen.',
        'Live-Anpassungen zeigen eine Änderung auf der Seite in der Vorschau, bevor Code angefasst wird.',
        'Bringt acht gebündelte Design-Skills mit, von better-typography bis interface-review, nutzbar aus dem Annotations-Editor.',
      ],
      howWithAgent: [
        'Füg das Plugin hinzu und starte dsh web.',
        'Öffne deine laufende App im Web-Preview-Tab und annotiere, was sich ändern soll.',
        'Absenden — der Agent erhält Selektoren, Notizen und ausprobierte Werte und bearbeitet den Workspace-Quellcode.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline: 'Kompiliert SVG-Pfade und Keyframes direkt aus der Unterhaltung zu eigenständigen Lottie-Animationen.',
      whatIsIt:
        'Zwei Tools, die Design-Daten in Motion-Assets verwandeln: lottie_compile_shape konvertiert einen SVG-Pfad in Lottie-Shape-Werte, und lottie_compile baut aus einer kompakten Layer-Spec ein komplettes Lottie-JSON zusammen — Rechtecke, Verläufe, Pfade, eingebettete Bilder und Text, mit Keyframe-Animation pro Layer.',
      whyForDesign: [
        'Beschreibe eine Ladeanimation in Alltagssprache und bekomm eine .lottie.json, die auf iOS, Android und im Web läuft.',
        'Bezier-In/Out-Tangenten und Keyframe-Easing werden kompiliert, nicht von Hand geschrieben.',
        'Kein Build-Schritt und pures ESM: was veröffentlicht wird, ist exakt das, was läuft.',
      ],
      howWithAgent: [
        'Füg das Plugin von npm hinzu, oder pinne einen Commit von GitHub.',
        'Beschreibe die Motion: Layer, Timing, Easing, Stagger.',
        'Wirf die kompilierte .lottie.json in LottieWeb, lottie-ios oder lottie-android.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline: 'Deine Claude-Code-Skills, dein Memory und deine globalen Anweisungen, im Harness verfügbar — ohne jede Migration.',
      whatIsIt:
        'Liest die Standard-Dateiablagen von Claude Code direkt — keine Migrationsskripte, kein Kopieren, keine Symlinks. Skills aus ~/.claude/skills wandern in den Skill-Katalog des Harness, Projekt-Memory wird bei jeder Anfrage als Kontext injiziert, und globale CLAUDE.md-Anweisungen ziehen mit um.',
      whyForDesign: [
        'Design-Skills, die du bereits in Claude Code nutzt, laufen hier, ohne dass eine Datei bewegt wird.',
        'Projekt-Memory wird bei jeder Anfrage neu gelesen, neue Notizen greifen also sofort.',
        'Globale Anweisungen und Kollaborationspräferenzen bleiben über Agenten hinweg erhalten.',
      ],
      howWithAgent: [
        'Füg das Plugin deinem Profil hinzu; es funktioniert ohne jede Konfiguration.',
        'Verweise es optional auf zusätzliche Skill-Verzeichnisse wie ~/.agents/skills.',
        'Ruf deine bestehenden Skills beim Namen auf, genau wie in Claude Code.',
      ],
    },
    'dsh-web-ui': {
      tagline: 'Das größte UI-Kit des Ökosystems: Task-Board, Preview-Panel, Git-Graph und ein Skin-Center.',
      whatIsIt:
        'Eine Plugin- und Skin-Sammlung für das Web-UI des Harness: ein fünfspaltiges Task-Board, dessen Karten echte Agent-Sessions ausführen, ein rechtes Seitenpanel mit Dateibaum und Multi-Tab-Previews, ein Git-Graph, mobile Fernsteuerung und ein Skin-Center zum Ausprobieren vor dem Anwenden.',
      whyForDesign: [
        'Das rechte Seitenpanel zeigt Markdown, HTML, Diffs, CSV, PDF, Office-Dateien und Bilder in der Vorschau direkt neben der Unterhaltung.',
        'Das Task-Board macht aus Design-Todos Karten, die eine echte dsh-Agent-Session ausführt und zurückmeldet.',
        'Die Panel-Breite ist per Drag verstellbar und bleibt pro Projekt erhalten, der Workspace bleibt also so, wie du ihn eingerichtet hast.',
      ],
      howWithAgent: [
        'Füg das Aggregat-Paket deinem web-Profil hinzu, um alles auf einmal zu installieren.',
        'Öffne das rechte Seitenpanel und pinne die Dateien und Previews, mit denen du gerade arbeitest.',
        'Leg Design-Aufgaben aufs Board und lass die Karten in echten Agent-Sessions laufen.',
      ],
    },
    'dsh-better-sidebar': {
      tagline: 'Eine komplette Workbench in der Sidebar: Datei-Explorer, reichhaltige Previews, Terminal, Git und ein Browser.',
      whatIsIt:
        'Eine Doppel-Panel-Workbench für das Web-UI des Harness: ein lazy ladender Datei-Explorer mit CodeMirror-Editing, Inline-Previews für Bilder, Markdown, HTML, PDF und Office-Dateien, ein echtes Terminal, ein Git-Panel mit Diffs im VS-Code-Stil, ein eingebetteter sandboxed Browser und per Drag verschiebbare Split-Pane-Tabs.',
      whyForDesign: [
        'Sieh dir HTML, Bilder und Dokumente, die der Agent produziert, in der Vorschau an, ohne die Unterhaltung zu verlassen.',
        'Ein eingebetteter sandboxed Browser öffnet deinen laufenden Prototyp in einem Tab neben dem Chat.',
        'Drittanbieter-Plugins können über seine Service-API eigene Tabs und Datei-Previewer registrieren.',
      ],
      howWithAgent: [
        'Installiere mit dem Einzeiler-Skript, oder füg das npm-Paket deinem web-Profil hinzu.',
        'Öffne die Workbench und verteile Tabs über die rechte Sidebar und das untere Panel.',
        'Prüfe direkt an Ort und Stelle, was der Agent gebaut hat: Previews, Diffs, Terminal- und Browser-Tabs.',
      ],
    },
    'dsh-vision-router': {
      tagline: 'Kostenlose Augen ohne Key für rein textbasierte Agenten: eine eingebaute Vision-Kette plus elf Tools auf Pixelebene.',
      whatIsIt:
        'Ein Vision-Router, der die Originalpixel auf der Seite des Vision-Modells hält und DeepSeek auf der Reasoning-Seite. Wähl eine Modellgruppe mit „+ Auto Vision", füg ein Bild ein, und der Agent treibt elf Tools auf Pixelebene — Grounding, Zuschneiden, Pixel-Diff, Palette, OCR, SVG-Trace, Freistellen, HTML-Screenshots — über eine kostenlose anonyme Vision-Fallback-Kette, ganz ohne Account und ohne Key.',
      whyForDesign: [
        'Ein verifizierbarer Pixel-Loop für UI-Rekonstruktion: Referenz → Screenshot → Pixel-Diff mit roter Heatmap → Fix → wiederholen, bis die Abweichung konvergiert.',
        'Grounding und Detection liefern Pixel-Boxen im Originalbild, und die README dokumentiert einen Nachbau, verifiziert bis auf 2,54 % finale Differenz.',
        'Palettenextraktion, SVG-Vektorisierung von Icons und Hintergrund-Freistellen decken die kleinen Design-Handgriffe rund um einen Nachbau ab.',
      ],
      howWithAgent: [
        'Füg das Plugin deinem web-Profil hinzu; sein Composition-Patch verdrahtet alles ohne einen einzigen manuellen Datei-Edit.',
        'Öffne den Model-Picker und wähl eine mit „+ Auto Vision" markierte Gruppe, bevor du Bilder schickst.',
        'Füg einen Screenshot ein und lass den Agenten vision_ground, vision_crop, vision_describe und vision_pixel_diff verketten.',
      ],
    },
    'dsh-diagram': {
      tagline: 'Macht aus jedem Artikel in der Session einen editierbaren Excalidraw-Canvas statt eines Wegwerf-Bilds.',
      whatIsIt:
        'Ein Excalidraw-Canvas im Harness: der Agent ruft diagram_create auf, um aus einer kompakten semantischen Spec ein Flussdiagramm, Architekturdiagramm, eine Timeline, Hierarchie oder einen Vergleich zu bauen, und ein Canvas-Tab öffnet den vollständigen Editor, sodass du Text, Knoten und Verbindungen direkt in der Session verfeinerst.',
      whyForDesign: [
        'Editierbar statt Wegwerfware: arbeite in einem echten Vektor-Canvas weiter, statt ein statisch generiertes Bild hinzunehmen.',
        'Revisionsbasiertes Compare-and-Set-Autosave verhindert, dass ein veralteter Editor neuere Arbeit stillschweigend überschreibt.',
        'Exportiert .excalidraw, SVG oder PNG, und manuelle Änderungen erreichen den Agenten nur, wenn du ihn diagram_read aufrufen lässt.',
      ],
      howWithAgent: [
        'Füg das Plugin deinem web-Profil hinzu und starte dsh web neu.',
        'Bitte um ein klares Diagramm zum Artikel in der Session; der Agent ruft diagram_create auf.',
        'Öffne den Canvas-Tab, bearbeite direkt, dann exportiere — oder lass den Agenten deine Änderungen zurücklesen.',
      ],
    },
    'deepseek-harness-genui': {
      tagline: 'Die Aufgabe lässt ein fokussiertes React-Interface wachsen — und was du darin auswählst, fließt zurück zum Agenten.',
      whatIsIt:
        'Eine Runtime-Interface-Schicht für Agent-Aufgaben: wenn Text im Weg steht, schreibt der Agent eine kleine React-und-TypeScript-App — angezeigt inline, im Canvas, im Vollbild oder auf localhost — um eine schwierige Beziehung zu erklären, eine komplexe Entscheidung einzusammeln oder nach aufgabenbezogener Freigabe ein angebundenes Tool zu bedienen.',
      whyForDesign: [
        'Interfaces sind Code-first React: Layouts, Controls und Diagramme sind echte Komponenten, keine Screenshots.',
        'Gespeicherte Auswahlen, Eingaben und Entwürfe kehren in die Aufgabe zurück, damit spätere Agent-Turns sie lesen können.',
        'Ein DESIGN.md-System mit vier visuellen Profilen hält generierte Apps auf einer gemeinsamen Designsprache.',
      ],
      howWithAgent: [
        'Führ den Installationsbefehl aus — er fügt das Plugin hinzu und installiert dann das Chromium, das Playwright braucht.',
        'Frag nach einem Interface, wenn Interaktion hilft: ein Picker, ein erkundbares Modell, ein Code-Pfad-Explorer.',
        'Interagiere und frag dann nach — der Agent liest, was du ausgewählt hast, statt dich alles wiederholen zu lassen.',
      ],
    },
    'dsh-annotate': {
      tagline: 'Zeig auf Browser-Elemente und schick dem Agenten strukturierte Fakten statt vager Beschreibungen.',
      whatIsIt:
        'Visuelles Browser-Feedback über eine begleitende Chrome-Extension: /annotate startet den Auswahlmodus, und jedes Element, das du anklickst, steuert einen Selektor, DOM-Fakten, Computed-Style-Highlights, Accessibility-Daten, deinen Kommentar und optional einen Viewport-Screenshot zum nächsten Turn des Agenten bei.',
      whyForDesign: [
        'Visuelles Feedback bleibt am Seitenelement verankert, statt zu einer vagen Beschreibung oder einem eingefügten Screenshot zu werden.',
        'Computed Styles und Accessibility-Daten kommen als strukturierte Fakten an, auf die der Agent direkt reagieren kann.',
        'Eine Loopback-WebSocket-Brücke, beschränkt auf Host, Origin und Extension-ID, hält den Kanal lokal.',
      ],
      howWithAgent: [
        'Klone das Repo und füg das Projekt einem Harness-Profil hinzu, dann lade seinen browser-extension-Ordner über chrome://extensions als entpackte Extension.',
        'Führe /annotate aus, klick Elemente auf der Seite an und häng an jedes einen Kommentar.',
        'Absenden — die erfassten Fakten und der Viewport-Screenshot landen im nächsten Turn des Agenten.',
      ],
    },
    'dsh-hyperframes': {
      tagline: 'HyperFrames by HeyGen, portiert: fünf offizielle Skills, die HTML in fertiges Video verwandeln.',
      whatIsIt:
        'Eine Installation registriert die fünf offiziellen HyperFrames-by-HeyGen-Skills im Harness: HTML-Video-Komposition mit visuellen Stilen, Paletten, Untertiteln und audio-reaktiven Übergängen, die hyperframes-CLI, die Komponenten-Registry, eine Website-zu-Video-Pipeline und eine GSAP-Animationsreferenz.',
      whyForDesign: [
        'Motion Design in dem Medium, in dem du ohnehin arbeitest: aus HTML und CSS wird gerendertes Video.',
        'Eine siebenstufige Website-zu-Video-Pipeline macht aus einer URL einen produzierten Clip.',
        'Die Skills nutzen das offene SKILL.md-Format, dasselbe Set läuft also auch in Claude Code, Cursor und Codex.',
      ],
      howWithAgent: [
        'Füg das Plugin deinem web-Profil hinzu und starte neu.',
        'Sag „mach aus dieser URL ein HyperFrames-Video", um die Pipeline anzustoßen.',
        'Rendere über die hyperframes-CLI; Node 22+ und FFmpeg sind die einzigen Abhängigkeiten.',
      ],
    },
    'dsh-web-preview': {
      tagline: 'Ein gläsernes Seitenpanel, das den Workspace in der Vorschau zeigt, das Projekt ausführt und Elemente annotiert.',
      whatIsIt:
        'Ein seitliches Web-Preview-Panel für das Web-UI des Harness: Workspace-Dateien werden zur Vorschau ausgeliefert — Markdown gerendert, Code mit Zeilennummern, Bilder und HTML unverändert — Projekte erkennen ihren Typ automatisch (Cargo, package.json, go.mod, Python) und laufen mit Live-Logs, und ein Markierungsmodus fängt Element-Annotationen zurück in die Unterhaltung ein.',
      whyForDesign: [
        'Der Prototyp, den der Agent gerade geschrieben hat, öffnet sich neben dem Chat — mit synchronisierter Adressleiste und per Drag verstellbarer Panelbreite.',
        'Der Markierungsmodus hebt Elemente per Hover hervor, erfasst Selektor und HTML-Snapshot und schickt deine Notiz in die Unterhaltung.',
        'Links, Dateipfade und abgelegte Dateien öffnen sich alle im Panel, das Review verlässt die Session also nie.',
      ],
      howWithAgent: [
        'Installiere das Paket in dein web-Profilverzeichnis und mounte es dann, indem du einen insert-Eintrag namens dsh-web-preview-panel in die cordis.patch.yml dieses Profils einträgst.',
        'Starte dsh web neu und öffne den ▶-Preview-Button oben rechts in der Unterhaltung.',
        'Führe das Projekt aus dem Panel aus, annotiere Elemente und schick Logs oder Notizen direkt an den Agenten.',
      ],
    },
  },
};
