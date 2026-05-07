import type {
  DesignSystemSummary,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import type { Locale } from './types';
import {
  FR_DESIGN_SYSTEM_CATEGORIES,
  FR_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK,
  FR_DESIGN_SYSTEM_SUMMARIES,
  FR_PROMPT_TEMPLATE_CATEGORIES,
  FR_PROMPT_TEMPLATE_COPY,
  FR_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
  FR_PROMPT_TEMPLATE_TAGS,
  FR_SKILL_COPY,
  FR_SKILL_IDS_WITH_EN_FALLBACK,
} from './content.fr';
import {
  RU_DESIGN_SYSTEM_CATEGORIES,
  RU_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK,
  RU_DESIGN_SYSTEM_SUMMARIES,
  RU_PROMPT_TEMPLATE_CATEGORIES,
  RU_PROMPT_TEMPLATE_COPY,
  RU_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
  RU_PROMPT_TEMPLATE_TAGS,
  RU_SKILL_COPY,
  RU_SKILL_IDS_WITH_EN_FALLBACK,
} from './content.ru';

type LocalizedSkillCopy = { description?: string; examplePrompt?: string };
type LocalizedPromptTemplateCopy = Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>;
type LocalizedContentIds = {
  skills: string[];
  designSystems: string[];
  designSystemCategories: string[];
  promptTemplates: string[];
  promptTemplateCategories: string[];
  promptTemplateTags: string[];
};
type LocalizedContentBundle = {
  skillCopy: Record<string, LocalizedSkillCopy>;
  skillIdsWithEnFallback: readonly string[];
  designSystemSummaries: Record<string, string>;
  designSystemCategories: Record<string, string>;
  designSystemIdsWithEnFallback: readonly string[];
  promptTemplateCategories: Record<string, string>;
  promptTemplateIdsWithEnFallback: readonly string[];
  promptTemplateTags: Record<string, string>;
  promptTemplateCopy: Record<string, LocalizedPromptTemplateCopy>;
};

const DE_SKILL_COPY: Record<string, LocalizedSkillCopy> = {
  'audio-jingle': {
    examplePrompt:
      'Ein fröhlicher 30-Sekunden-Indie-Pop-Jingle für den Launch eines Coffee Shops — warmes E-Piano, Besen-Drums, sanfter Bass und ein einzelner sonniger „ahhh“-Chor im Refrain. Ohne Gesang. Loop-freundliches Ende.',
    description:
      'Audio-Generierung für Jingles, Musikbetten, Voiceover und Soundeffekte. Musik-Anfragen werden an Suno V5 / Udio / Lyria geleitet, Sprache an MiniMax TTS / FishAudio / ElevenLabs V3 und SFX an ElevenLabs SFX oder AudioCraft. Die Ausgabe ist eine MP3/WAV-Datei im Projektordner.',
  },
  'blog-post': {
    examplePrompt:
      'Ein Long-form-Artikel / Blogpost — Masthead, Hero-Bild-Platzhalter, Artikeltext mit Abbildungen und Pull Quotes, Autorenzeile, verwandte Beiträge.',
  },
  'critique': {
    examplePrompt:
      'Führen Sie eine 5-dimensionale Kritik für das gerade erzeugte magazine-web-ppt Deck aus — bewerten Sie Philosophie / Hierarchie / Detail / Funktion / Innovation und geben Sie Keep / Fix / Quick-wins aus.',
  },
  'dashboard': {
    examplePrompt:
      'Admin- / Analytics-Dashboard in einer einzigen HTML-Datei.',
  },
  'dating-web': {
    examplePrompt:
      'Entwerfen Sie ‚mutuals‘ — eine Dating-Site für X-Poster. Tägliches Digest-Dashboard mit Statistiken, Balkendiagramm für gegenseitige Matches und Community-Ticker.',
  },
  'design-brief': {},
  'digital-eguide': {
    examplePrompt:
      'Entwerfen Sie ‚The Creator\'s Style & Format Guide‘ — Coverseite und eine Innenseite für eine Lifestyle-Creator-Brand.',
  },
  'docs-page': {
    examplePrompt:
      'Eine Dokumentationsseite — linke Navigation, scrollbarer Artikelbereich, rechte Inhaltsübersicht.',
  },
  'open-design-landing': {
    examplePrompt:
      'Entwerfen Sie die Open-Design-Marketing-Landingpage im Atelier-Zero- / Monocle-Stil — warme Papierleinwand, surreale Plaster-und-Architektur-Collage, übergroße gemischte Italic-Serif-Display-Type, römische Ziffern als Sektionsmarker und ein einziger Korallenakzent.',
  },
  'open-design-landing-deck': {
    examplePrompt:
      'Erstellen Sie das Open-Design-Pitch-Deck im Atelier-Zero-Stil — Cover mit Hero-Plate, römische Sektions-Trenner, Stats-Slide (31 Skills · 72 Systeme · 12 CLIs), Kundenzitat, CTA und Mega-Italic-Serif-End-Card. Horizontal-Swipe-Pagination wie eine Print-Magazine.',
    description:
      'Erstellt ein Single-File-Slide-Deck im Atelier-Zero-Stil (warmes Papier, italic-serif Akzent-Spans, korallenfarbene Schluss-Dots, surreale Collage-Platten). Horizontale Magazin-Pagination mit Pfeiltasten- und Leertaste-Navigation, Live-HUD mit Slide-Zähler und Fortschrittsbalken; teilt sich Stylesheet und 16-Slot-Bildbibliothek mit der Schwester-Skill `open-design-landing`.',
  },
  'email-marketing': {
    examplePrompt:
      'Entwerfen Sie eine Launch-E-Mail für eine sportliche Laufschuhmarke — Masthead, Hero, großes Headline-Lockup, Specs Grid, CTA.',
  },
  'eng-runbook': {
    examplePrompt:
      'Schreiben Sie ein Runbook für unseren Auth-Service — Alerts, Dashboards, Standardverfahren, On-Call-Rotation.',
  },
  'finance-report': {
    examplePrompt:
      'Erstellen Sie einen Q3-Finanzbericht für ein Early-Stage-SaaS — MRR, Burn, Bruttomarge, Top-Accounts.',
  },
  'gamified-app': {
    examplePrompt:
      'Entwerfen Sie eine gamifizierte Life-Management-App — mobiler Multi-Screen-Prototyp: Cover-Poster, heutige Quests mit XP und Quest-Detail. ‚Daily quests for becoming a better human.‘',
  },
  'magazine-web-ppt': {
    examplePrompt:
      'Erstellen Sie mir ein Magazin-PPT über ‚Ein-Personen-Unternehmen · von AI gefaltete Organisationen‘, 25-minütiger Vortrag, Zielgruppe Designer + Gründer. Empfehlen Sie zuerst eine Richtung (Monocle / WIRED / Kinfolk / Domus / Lab), damit ich wählen kann.',
  },
  'hatch-pet': {
    examplePrompt:
      'Brüten Sie mir ein winziges Pixel-Pet aus — ein freundlicher Shiba in einem kuscheligen Pulli. Nutzen Sie die hatch-pet-Skill durchgehend.',
    description:
      'Erstellt, repariert, validiert und packt ein Codex-kompatibles animiertes Pet-Spritesheet (8x9 Atlas, 192x208 Zellen) inklusive QA-Kontaktbogen, Vorschauvideos und pet.json.',
  },
  'hr-onboarding': {
    examplePrompt:
      'Erstellen Sie einen 30-Tage-Onboardingplan für einen neuen Product Designer in einem 40-Personen-Startup.',
  },
  'html-ppt': {},
  'html-ppt-course-module': {},
  'html-ppt-dir-key-nav-minimal': {},
  'html-ppt-graphify-dark-graph': {},
  'html-ppt-hermes-cyber-terminal': {},
  'html-ppt-knowledge-arch-blueprint': {},
  'html-ppt-obsidian-claude-gradient': {},
  'html-ppt-pitch-deck': {},
  'html-ppt-presenter-mode': {},
  'html-ppt-product-launch': {},
  'html-ppt-tech-sharing': {},
  'html-ppt-testing-safety-alert': {},
  'html-ppt-weekly-report': {},
  'html-ppt-xhs-pastel-card': {},
  'html-ppt-xhs-post': {},
  'html-ppt-xhs-white-editorial': {},
  'hyperframes': {
    examplePrompt:
      'Ein 5-Sekunden-Product-Reveal: ein minimalistisches High-End-Produkt auf einer sauberen cremefarbenen Fläche, weiches Seitenlicht, langsamer Kamera-Push-in, zurückhaltende Bewegung, keine Text-Overlays.',
    description:
      'Erstellt Videokompositionen, Animationen, Title Cards, Overlays, Untertitel, Voiceovers, audio-reaktive Visuals und Szenenübergänge in HyperFrames HTML.',
  },
  'image-poster': {
    examplePrompt:
      'Editorial-Poster für ein Indie-Filmfestival — eine kräftige abstrakte Silhouette auf warmem, leicht körnigem Papier; handgesetzter Sans-Serif-Titel oben, Festivaldaten und Ort unten in Monospace. Gedämpfte Ocker- und Tintenpalette.',
    description:
      'Einzelbild-Generierung für Poster, Key Art und Editorial-Illustrationen. Standard ist gpt-image-2, der Workflow ist aber provider-agnostisch.',
  },
  'invoice': {
    examplePrompt:
      'Erstellen Sie eine Rechnung eines freiberuflichen Designstudios an einen Kunden für ein Brand-Identity-Projekt — drei Positionen, 10% Retainer, 9% Umsatzsteuer.',
  },
  'kami-deck': {
    examplePrompt:
      'Erstellen Sie ein sechsteiliges Konferenz-Deck im kami-Stil (紙) — warmes Pergament, Tintenblau auf dem Cover, eine Serifenschnittstärke, horizontaler Magazin-Swipe.',
    description:
      'Erzeugt ein druckreifes Slide-Deck im kami-Designsystem: warmes Pergament (oder Tintenblau auf Cover/Kapitel), Serif nur in einer Schnittstärke, Tintenblau-Akzent ≤5% pro Folie, ohne Kursiv. Horizontale Magazin-Pagination (←/→ · Rad · Wischen · ESC-Übersicht). Eine eigenständige HTML-Datei, nur Google Fonts.',
  },
  'kami-landing': {
    examplePrompt:
      'Entwerfen Sie eine einseitige Studio-One-Pager im kami-Stil — Pergament-Leinwand, Tintenblau-Akzent, editorial wie ein Whitepaper.',
    description:
      'Erzeugt eine druckreife Einseiter im kami-Stil (紙): warmes Pergament, Tintenblau-Akzent, Serif in einer Schnittstärke, kein Kursiv, keine kühlen Grautöne. Liest sich wie Whitepaper oder Studio-One-Pager, nicht wie App-UI. Mehrsprachig (EN · zh-CN · ja). Eine eigenständige HTML-Datei ohne Abhängigkeiten.',
  },
  'kanban-board': {
    examplePrompt:
      'Erstellen Sie ein Kanban-Board für ein 5-köpfiges Growth-Team mitten im Sprint — Backlog, Doing, Review, Done.',
  },
  'live-artifact': {
    examplePrompt:
      'Erstellen Sie ein interaktives Live-Artefakt mit Statuskarten, Datentabelle und einem Detailpanel, das auf Auswahländerungen reagiert.',
  },
  'magazine-poster': {
    examplePrompt:
      'Entwerfen Sie ein Editorial-Poster im Magazin-Stil — ‚You don\'t need a designer to ship your first draft anymore.‘ Zeitungspapier, sechs nummerierte Abschnitte.',
  },
  'meeting-notes': {
    examplePrompt:
      'Schreiben Sie Notizen aus einem 60-minütigen Weekly des Growth-Teams — Agenda, Entscheidungen, Action Items mit Verantwortlichen, nächstes Meeting.',
  },
  'mobile-app': {
    examplePrompt:
      'Ein Mobile-App-Screen, gerendert in einem pixelgenauen iPhone-15-Pro-Rahmen auf der Seite.',
  },
  'mobile-onboarding': {
    examplePrompt:
      'Entwerfen Sie einen 3-Screen-Mobile-Onboarding-Flow für eine Meditations-App — Welcome, Value Props, Sign-in.',
  },
  'motion-frames': {
    examplePrompt:
      'Entwerfen Sie einen animierten Hero — ein rotierender Type-Ring um einen Wireframe-Globus, mit der Headline ‚Reach every country.‘ Loop bei 12s, bereit für HyperFrames-Export.',
  },
  'pm-spec': {
    examplePrompt:
      'Schreiben Sie mir eine PRD für Two-Factor Auth in unserer SaaS-App — Problem, Scope, Meilensteine, offene Fragen.',
  },
  'pptx-html-fidelity-audit': {
    examplePrompt:
      'Vergleichen Sie deck.pptx mit deck.html, listen Sie Layout-Drift auf (Fußzeilen-Überlauf, fehlendes Italic, Hero nicht zentriert) und exportieren Sie mit Footer-Rail + Cursor-Flow neu.',
  },
  'pricing-page': {
    examplePrompt:
      'Eine eigenständige Pricing Page — Header, Plan-Stufen, Feature-Vergleichstabelle und FAQ.',
  },
  'replit-deck': {
    examplePrompt:
      'Single-file horizontal-swipe HTML deck im Stil der Landing-Page-Template-Galerie von Replit Slides.',
  },
  'saas-landing': {
    examplePrompt:
      'Einseitige SaaS-Landingpage mit Hero, Features, Social Proof, Pricing und CTA.',
  },
  'simple-deck': {
    examplePrompt:
      'Single-file horizontal-swipe HTML deck.',
  },
  'social-carousel': {
    examplePrompt:
      'Entwerfen Sie ein 3-Karten-Cinematic-Social-Carousel — ‚onwards.‘, ‚to the next one.‘, ‚looking ahead.‘. 1080×1080 Squares, direkt bereit für Instagram.',
  },
  'sprite-animation': {
    examplePrompt:
      'Erstellen Sie eine sprite-basierte Animation mit Trivia zur Geschichte von Nintendo. Kombinieren Sie Pixel-Maskottchen, animierten Text und einen Hanafuda-Akzent. Farbe und Typografie sollen sich wie die Nintendo-Brand anfühlen.',
  },
  'team-okrs': {
    examplePrompt:
      'Erstellen Sie einen OKR-Tracker für Q4 — drei Objectives, je drei Key Results, Progress Bars, Verantwortliche, Status-Pills.',
  },
  'tweaks': {
    examplePrompt:
      'Ergänzen Sie diese Landingpage um ein Tweak Panel — Accent Color, Type Scale, Density, Light/Dark — und persistieren Sie in localStorage, damit die Auswahl nach Refresh erhalten bleibt.',
  },
  'video-shortform': {
    examplePrompt:
      '5-Sekunden-Product-Reveal — eine Keramik-Kaffeetasse rotiert auf einem weichen Papierhintergrund, warmes Seitenlicht von links, feine Staubpartikel schweben im Lichtstrahl. Filmisch, 16:9, langsamer Kamera-Drift.',
    description:
      'Short-form-Video-Generierung für 3-10-Sekunden-Clips wie Product Reveals, Motion Teasers und Ambient Loops.',
  },
  'web-prototype': {
    examplePrompt:
      'Allzweck-Prototyp für Desktop-Web.',
  },
  'weekly-update': {
    examplePrompt:
      'Erstellen Sie ein Weekly-Update-Deck für das Growth-Team — was fertig wurde, was läuft, Blocker, Kennzahlen und Fragen für nächste Woche.',
  },
  'wireframe-sketch': {
    examplePrompt:
      'Skizzieren Sie ein handgezeichnetes Wireframe v0.1 für ein Portal — vier Varianten als Tabs auf Millimeterpapier, Marker-Headlines, Sticky-Note-Anmerkungen, schraffierte Chart-Platzhalter.',
  },
};

const DE_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  airbnb: 'Reisemarktplatz. Warmer Korallenakzent, fotogetrieben, abgerundete UI.',
  airtable: 'Spreadsheet-Datenbank-Hybrid. Farbenfroh, freundlich, strukturierte Datenästhetik.',
  apple: 'Unterhaltungselektronik. Premium-Weißraum, SF Pro, filmische Bildsprache.',
  'atelier-zero':
    'Editoriales Studio-System. Warme Papierleinwand, surreale Plaster-und-Architektur-Collage, gemischte Italic-Serif-Display-Type, römische Ziffern als Sektionsmarker und ein einziger Korallenakzent — gemacht für Magazin-Landingpages, Studio-Sites und Manifestseiten.',
  binance: 'Krypto-Börse. Kräftiger gelber Akzent auf Monochrom, Trading-Floor-Dringlichkeit.',
  bmw: 'Luxusautomobil. Dunkle Premium-Flächen, präzise deutsche Engineering-Ästhetik.',
  bugatti: 'Hypercar-Marke. Kinodunkle Leinwand, monochrome Strenge, monumentale Display-Type.',
  cal: 'Open-Source-Terminplanung. Saubere neutrale UI, entwicklerorientierte Einfachheit.',
  claude: 'Anthropics AI-Assistent. Warmer Terrakotta-Akzent, klares Editorial-Layout.',
  clay: 'Kreativagentur. Organische Formen, weiche Verläufe, art-directed Layout.',
  clickhouse: 'Schnelle Analytics-Datenbank. Gelb akzentuierter, technischer Dokumentationsstil.',
  cohere: 'Enterprise-AI-Plattform. Lebendige Verläufe, datenreiche Dashboard-Ästhetik.',
  coinbase: 'Krypto-Börse. Klare blaue Identität, vertrauensfokussiert, institutionelles Gefühl.',
  composio: 'Tool-Integrationsplattform. Modern dunkel mit farbigen Integrationsicons.',
  cursor: 'AI-first Code-Editor. Schlanke dunkle Oberfläche, Verlaufsakzente.',
  default:
    'Sauberer, produktorientierter Standard. Nutzen, wenn der Brief keine bestimmte Stimmung verlangt — gut für B2B-Tools, Dashboards und Utility-Pages.',
  elevenlabs: 'AI-Voice-Plattform. Dunkle filmische UI, Audio-Waveform-Ästhetik.',
  expo: 'React-Native-Plattform. Dunkles Theme, enge Laufweite, codezentriert.',
  ferrari: 'Luxusautomobil. Chiaroscuro-Editorial, Ferrari-Red-Akzente, filmisches Schwarz.',
  figma: 'Kollaboratives Design-Tool. Lebendige Mehrfarbigkeit, spielerisch und professionell.',
  framer: 'Website-Builder. Mutiges Schwarz und Blau, motion-first, designorientiert.',
  hashicorp: 'Infrastrukturautomatisierung. Sauberer Enterprise-Look, Schwarz und Weiß.',
  ibm: 'Enterprise-Technologie. Carbon Design System, strukturierte blaue Palette.',
  intercom: 'Customer Messaging. Freundliche blaue Palette, konversationelle UI-Muster.',
  kami:
    'Editoriales Papiersystem. Warme Pergament-Leinwand, tintenblauer Akzent, Serif in nur einem Schnitt — gemacht für Lebensläufe, One-Pager, White-Paper, Portfolios und Slide-Decks.',
  kraken: 'Krypto-Trading. Dunkle UI mit violettem Akzent, datenreiche Dashboards.',
  lamborghini: 'Supercar-Marke. Echtschwarze Flächen, Goldakzente, dramatische Großbuchstaben-Typografie.',
  'linear-app': 'Projektmanagement. Ultraminimal, präzise, violetter Akzent.',
  lovable: 'AI-Full-Stack-Builder. Spielerische Verläufe, freundliche Dev-Ästhetik.',
  mastercard: 'Globales Zahlungsnetzwerk. Warme Cream-Leinwand, orbitale Pillenformen, Editorial-Wärme.',
  meta: 'Tech-Retail-Store. Fotografiezentriert, binäre Hell/Dunkel-Flächen, Meta-Blue CTAs.',
  minimax: 'AI-Modellanbieter. Mutige dunkle Oberfläche mit Neonakzenten.',
  mintlify: 'Dokumentationsplattform. Sauber, grün akzentuiert, fürs Lesen optimiert.',
  miro: 'Visuelle Zusammenarbeit. Heller gelber Akzent, Infinite-Canvas-Ästhetik.',
  'mistral-ai': 'Open-Weight-LLM-Anbieter. Französisch konstruiertes Minimalismusgefühl, violett getönt.',
  mongodb: 'Dokumentendatenbank. Grünes Leaf-Branding, Fokus auf Entwicklerdokumentation.',
  nike: 'Sporthandel. Monochrome UI, massive Großbuchstaben, Full-Bleed-Fotografie.',
  notion: 'All-in-one-Workspace. Warmer Minimalismus, Serif-Headings, weiche Flächen.',
  nvidia: 'GPU-Computing. Grün-schwarze Energie, technische Power-Ästhetik.',
  ollama: 'LLMs lokal ausführen. Terminal-first, monochrome Einfachheit.',
  'opencode-ai': 'AI-Coding-Plattform. Entwicklerzentriertes dunkles Theme.',
  pinterest: 'Visuelle Entdeckung. Roter Akzent, Masonry Grid, bildfokussiert.',
  playstation:
    'Gaming-Konsolen-Retail. Drei-Flächen-Channel-Layout, ruhige Autorität in Display-Type, cyanfarbene Hover-Skalierung.',
  posthog: 'Product Analytics. Spielerisches Branding, entwicklerfreundliche dunkle UI.',
  raycast: 'Produktivitätslauncher. Schlankes dunkles Chrome, lebendige Verlaufsakzente.',
  renault: 'Französisches Automobil. Lebendige Aurora-Verläufe, NouvelR-Typografie, starke Energie.',
  replicate: 'ML-Modelle per API ausführen. Saubere weiße Leinwand, code-orientiert.',
  resend: 'E-Mail-API. Minimalistisches dunkles Theme, Monospace-Akzente.',
  revolut: 'Digital Banking. Schlanke dunkle Oberfläche, Verlaufskarten, Fintech-Präzision.',
  runwayml: 'AI-Videogenerierung. Filmische dunkle UI, medienreiches Layout.',
  sanity: 'Headless CMS. Roter Akzent, content-first Editorial-Layout.',
  sentry: 'Fehler-Monitoring. Dunkles Dashboard, datenreich, pink-violetter Akzent.',
  shopify: 'E-Commerce-Plattform. Dark-first und filmisch, neongrüner Akzent, ultraleichte Type.',
  spacex: 'Raumfahrttechnologie. Strenges Schwarz-Weiß, Full-Bleed-Bildsprache, futuristisch.',
  spotify: 'Musikstreaming. Lebendiges Grün auf Dunkel, fette Type, album-art-driven.',
  starbucks:
    'Globale Kaffee-Retail-Marke. Vierstufiges grünes System, warme Cream-Leinwand, Full-Pill-Buttons.',
  stripe: 'Payment-Infrastruktur. Signatur-violette Verläufe, Weight-300-Eleganz.',
  supabase: 'Open-Source-Firebase-Alternative. Dunkles Smaragd-Theme, code-first.',
  superhuman: 'Schneller E-Mail-Client. Premium-dunkle UI, keyboard-first, violetter Glow.',
  tesla: 'Elektrisches Automobil. Radikale Reduktion, Full-Viewport-Fotografie, nahezu keine UI.',
  theverge:
    'Tech-Editorial-Medium. Acid-Mint- und Ultraviolett-Akzente, Manuka-Display, Rave-Flyer-Story-Tiles.',
  'together-ai': 'Open-Source-AI-Infrastruktur. Technisch, blueprint-artiges Design.',
  uber: 'Mobilitätsplattform. Kräftiges Schwarz-Weiß, enge Type, urbane Energie.',
  vercel: 'Frontend-Deployment. Schwarz-Weiß-Präzision, Geist Font.',
  vodafone: 'Globale Telekommarke. Monumentale Großbuchstaben-Display-Type, Vodafone-Red-Kapitelbänder.',
  voltagent: 'AI-Agent-Framework. Void-schwarze Leinwand, Smaragdakzent, terminal-nativ.',
  'warm-editorial':
    'Serifengeführte Magazin-Ästhetik. Terrakotta-Akzent auf warmem Off-White-Papier — gut für Long-form, Editorial und brandgeführte Marketingseiten.',
  warp: 'Modernes Terminal. Dunkle IDE-artige Oberfläche, blockbasierte Command-UI.',
  webflow: 'Visueller Web-Builder. Blau akzentuiert, polierte Marketing-Site-Ästhetik.',
  wired: 'Tech-Magazin. Papierweiße Broadsheet-Dichte, Custom-Serif-Display, Mono-Kicker, tintenblaue Links.',
  wise: 'Geldtransfer. Leuchtend grüner Akzent, freundlich und klar.',
  'x-ai': 'Elon Musks AI-Lab. Strenger Monochrom-Look, futuristischer Minimalismus.',
  xiaohongshu: 'Lifestyle-UGC-Social-Plattform. Singuläres Brand-Rot, großzügiger Radius, content-first.',
  zapier: 'Automatisierungsplattform. Warmes Orange, freundlich illustrationsgetrieben.',
};

const DE_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  Starter: 'Starter',
  'AI & LLM': 'AI & LLM',
  'Bold & Expressive': 'Mutig & Ausdrucksstark',
  'Creative & Artistic': 'Kreativ & Künstlerisch',
  'Developer Tools': 'Entwickler-Tools',
  'Layout & Structure': 'Layout & Struktur',
  'Modern & Minimal': 'Modern & Minimal',
  'Morphism & Effects': 'Morphism & Effekte',
  'Productivity & SaaS': 'Produktivität & SaaS',
  'Professional & Corporate': 'Professionell & Corporate',
  'Backend & Data': 'Backend & Daten',
  'Design & Creative': 'Design & Kreativität',
  'Fintech & Crypto': 'Fintech & Krypto',
  'E-Commerce & Retail': 'E-Commerce & Handel',
  'Media & Consumer': 'Medien & Consumer',
  Automotive: 'Automotive',
  'Editorial & Print': 'Editorial & Print',
  'Editorial · Studio': 'Editorial · Studio',
  'Retro & Nostalgic': 'Retro & Nostalgisch',
  'Themed & Unique': 'Thematisch & Einzigartig',
  Uncategorized: 'Nicht kategorisiert',
};

const DE_SKILL_IDS_WITH_EN_FALLBACK = [
  'flowai-live-dashboard-template',
  'html-ppt-taste-brutalist',
  'html-ppt-taste-editorial',
  'live-dashboard',
  'orbit-general',
  'orbit-github',
  'orbit-gmail',
  'orbit-linear',
  'orbit-notion',
  'social-media-dashboard',
  'social-media-matrix-tracker-template',
  'web-prototype-taste-brutalist',
  'web-prototype-taste-editorial',
  'web-prototype-taste-soft',
  'waitlist-page',
] as const;

const DE_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK = [
  'agentic',
  'ant',
  'application',
  'arc',
  'artistic',
  'bento',
  'bold',
  'brutalism',
  'cafe',
  'canva',
  'claymorphism',
  'clean',
  'colorful',
  'contemporary',
  'corporate',
  'cosmic',
  'creative',
  'dashboard',
  'discord',
  'dithered',
  'doodle',
  'dramatic',
  'duolingo',
  'editorial',
  'elegant',
  'energetic',
  'enterprise',
  'expressive',
  'fantasy',
  'flat',
  'friendly',
  'futuristic',
  'github',
  'glassmorphism',
  'gradient',
  'huggingface',
  'levels',
  'lingo',
  'luxury',
  'material',
  'minimal',
  'modern',
  'mono',
  'neobrutalism',
  'neon',
  'neumorphism',
  'openai',
  'pacman',
  'paper',
  'perspective',
  'premium',
  'professional',
  'publication',
  'refined',
  'retro',
  'shadcn',
  'simple',
  'skeumorphism',
  'sleek',
  'spacious',
  'storytelling',
  'totality-festival',
  'tetris',
  'vibrant',
  'vintage',
] as const;

const DE_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  Infographic: 'Infografik',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'App- / Webdesign',
  'Game UI': 'Spiel-UI',
  Illustration: 'Illustration',
  'Profile / Avatar': 'Profil / Avatar',
  'Social Media Post': 'Social-Media-Post',
  General: 'Allgemein',
  Advertising: 'Werbung',
  'Motion Graphics': 'Motion Graphics',
  Cinematic: 'Filmisch',
  'VFX / Fantasy': 'VFX / Fantasy',
  Anime: 'Anime',
  'Social / Meme': 'Social / Meme',
  Branding: 'Branding',
  Data: 'Daten',
  Marketing: 'Marketing',
  Product: 'Produkt',
  'Short Form': 'Short Form',
  Travel: 'Reise',
  'Live Artifact': 'Live-Artefakt',
};

const DE_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK = ['notion-team-dashboard-live-artifact'] as const;

const DE_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3D',
  '3d-render': '3D-Render',
  action: 'Action',
  'ancient-china': 'Altes China',
  anime: 'Anime',
  'app-showcase': 'App-Showcase',
  archery: 'Archery',
  arpg: 'ARPG',
  'audio-reactive': 'Audio-reaktiv',
  'boss-fight': 'Boss Fight',
  brand: 'Brand',
  branding: 'Branding',
  captions: 'Untertitel',
  cavalry: 'Cavalry',
  chart: 'Chart',
  childlike: 'Kindlich',
  choreography: 'Choreografie',
  cinematic: 'Filmisch',
  'cinematic-romance': 'Filmische Romanze',
  combat: 'Kampf',
  combo: 'Combo',
  'companion-to-image': 'Companion to Image',
  counter: 'Counter',
  crayon: 'Wachsmalstift',
  cyberpunk: 'Cyberpunk',
  dance: 'Tanz',
  'data-viz': 'Data-Viz',
  editorial: 'Editorial',
  'elden-ring': 'Elden Ring',
  endcard: 'End Card',
  escort: 'Escort',
  'escort-mission': 'Escort Mission',
  fantasy: 'Fantasy',
  fashion: 'Mode',
  'fighting-game': 'Fighting Game',
  food: 'Food',
  'game-cinematic': 'Game Cinematic',
  'game-ui': 'Spiel-UI',
  'grid-sheet': 'Grid Sheet',
  guanyu: 'Guanyu',
  'hand-drawn': 'Handgezeichnet',
  hud: 'HUD',
  'hud-safe': 'HUD-safe',
  hype: 'Hype',
  hyperframes: 'HyperFrames',
  idol: 'Idol',
  illustration: 'Illustration',
  'image-to-image': 'Bild-zu-Bild',
  infographic: 'Infografik',
  japanese: 'Japanisch',
  karaoke: 'Karaoke',
  'key-visual': 'Key Visual',
  'kinetic-typography': 'Kinetische Typografie',
  'linear-style': 'Linear-Stil',
  'live-artifact': 'Live-Artefakt',
  logo: 'Logo',
  lyubu: 'Lyu Bu',
  map: 'Karte',
  marketing: 'Marketing',
  minimal: 'Minimal',
  mmo: 'MMO',
  mobile: 'Mobile',
  money: 'Geld',
  'mounted-combat': 'Mounted Combat',
  nature: 'Natur',
  'open-world': 'Open World',
  'otaku-dance': 'Otaku Dance',
  outro: 'Outro',
  overlay: 'Overlay',
  pipeline: 'Pipeline',
  'pose-reference': 'Pose Reference',
  portrait: 'Porträt',
  product: 'Produkt',
  'product-promo': 'Produkt-Promo',
  rework: 'Überarbeiten',
  route: 'Route',
  saas: 'SaaS',
  sequence: 'Sequenz',
  sizzle: 'Sizzle',
  social: 'Social',
  storyboard: 'Storyboard',
  'street-fighter': 'Street Fighter',
  'style-transfer': 'Stiltransfer',
  tekken: 'Tekken',
  'three-kingdoms': 'Three Kingdoms',
  tiktok: 'TikTok',
  'title-card': 'Title Card',
  transform: 'Transformieren',
  travel: 'Reise',
  tts: 'TTS',
  typography: 'Typografie',
  'unreal-engine-5': 'Unreal Engine 5',
  vertical: 'Vertikal',
  'video-reference': 'Video Reference',
  'vs-screen': 'VS Screen',
  'website-to-video': 'Website-zu-Video',
  wuxia: 'Wuxia',
  zhaoyun: 'Zhaoyun',
};

const DE_PROMPT_TEMPLATE_COPY: Record<string, LocalizedPromptTemplateCopy> = {
  '3d-stone-staircase-evolution-infographic': {
    title: '3D-Infografik einer Steintreppen-Evolution',
    summary:
      'Verwandelt eine flache Evolutions-Zeitachse in eine realistische 3D-Steintreppen-Infografik mit detaillierten Organismus-Renderings und strukturierten Seitenpanels.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Anime-Kampfsport-Battle-Illustration',
    summary:
      'Erzeugt eine dynamische, wirkungsvolle Anime-Illustration von zwei weiblichen Figuren, die in einem traditionellen Dojo mit elementaren Energieeffekten kämpfen.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'E-Commerce-Livestream-UI-Mockup',
    summary:
      'Erzeugt ein realistisches Social-Media-Livestream-Interface über einem Porträt, inklusive anpassbarer Chat-Nachrichten, Geschenk-Popups und Produktkaufkarte.',
  },
  'illustrated-city-food-map': {
    title: 'Illustrierte Stadt-Food-Map',
    summary:
      'Erzeugt eine handgezeichnete Tourist Map im Aquarellstil mit nummerierten lokalen Spezialitäten, Sehenswürdigkeiten und Legende.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {},
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Momotaro-Erklärslide im Hybrid-Stil',
    summary:
      'Kombiniert die einfache, warme Ästhetik von Irasutoya-Illustrationen mit der hohen Informationsdichte japanischer Behörden-Slides.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / Avatar - Anime-Girl zu filmischem Foto',
    summary:
      'Verwandelt eine Charakterreferenz-Illustration in ein realistisches, warm getöntes Vintage-Interieur-Porträt und bewahrt Outfit, Pose und Katze.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / Avatar - Casual-Fashion-Grid-Fotoshooting',
    summary:
      'Strukturierter JSON-Prompt für eine 4-Foto-Collage eines lässigen Fashion-Shootings mit detaillierten Parametern für Person und Licht.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / Avatar - Filmisches südasiatisches Männerporträt mit Geiern',
    summary:
      'Detailliertes filmisches Porträt eines jungen südasiatischen Mannes in einer düsteren Dark-Fantasy-Szene, umgeben von Geiern und Raben.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / Avatar - Cyberpunk-Anime-Porträt mit Neon-Gesichtstext',
    summary:
      'Stilvolles neongetränktes Anime-Porträt für Poster, Social-Media-Art oder futuristische Branding-Visuals.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / Avatar - Elegantes Fantasy-Girl im violetten Garten',
    summary:
      'Erzeugt ein poliertes Anime-Fantasy-Porträt einer eleganten Frau mit glänzend gestyltem Haar, violett-schwarzer Kleidung und magischem Blumengarten.',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / Avatar - Ätherisches blauhaariges Fantasy-Porträt',
    summary:
      'Erzeugt ein weiches, leuchtendes Anime-Fantasy-Porträt für elegante vertikale Key Art oder Charakterillustrationen mit fließendem Haar.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / Avatar - Glamouröses Frauenporträt in Schwarz',
    summary:
      'Erzeugt ein fotorealistisches Luxusporträt einer eleganten Frau in schwarzem Outfit, ideal für Fashion Editorials oder Beauty Imagery.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / Avatar - Hyperrealistische Selfie-Textur-Prompts',
    summary:
      'Detaillierte Prompt-Snippets für realistische Hauttexturen und authentisches Smartphone-Selfie-Framing mit sichtbaren Poren und natürlichem Licht.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / Avatar - Lavendel-Fantasy-Magierinnenporträt',
    summary:
      'Erzeugt ein poliertes Anime-Fantasy-Porträt einer eleganten Magierprinzessin mit blondem Haar, violetten Blumen und Kristallkleidung.',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / Avatar - Monochromes Studio-Porträt',
    summary:
      'High-end Commercial-Photography-Prompt für ein monochromes Porträt mit markant geteiltem Hintergrund und dramatischem Studiolicht.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / Avatar - Alte Fotorestaurierung zu DSLR-Porträt',
    summary:
      'Restauriert ein beschädigtes Vintage-Familienfoto mit vier Personen zu einem sauberen, kolorierten, hochauflösenden realistischen Porträt.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / Avatar - Poetisches Frauenporträt im Garten',
    summary:
      'Erzeugt ein realistisches Editorial-Porträt einer belesenen jungen Frau in einem sonnigen Garten, ideal für Lifestyle-Fotografie oder Literary Branding.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / Avatar - Professionelles Identity-Porträt-Wallpaper',
    summary:
      'Erzeugt ein hochauflösendes Premium-Wallpaper mit einer Person in professioneller Kleidung, beruflichen Aktivitäten und Typografie.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / Avatar - Realistisch unperfektes AI-Selfie',
    summary:
      'Kreativer GPT-Image-2-Prompt für ein „misslungenes“ Selfie, das wie ein zufälliger, niedrigqualitativer Smartphone-Schnappschuss wirkt.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / Avatar - Signiertes Marker-Porträt auf Shikishi',
    summary:
      'Erzeugt ein lebendiges signiertes Marker-Porträt auf quadratischem Shikishi-Board für Fan-Art-Autogramme und persönliche Dankesvisuals.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / Avatar - Schneehasen-Kaiserin-Porträt',
    summary:
      'Realistischer Fantasy-Porträtprompt für eine königliche, hasenmotivierte Frau in winterlichem Hanfu vor einem verschneiten Bergtempel.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / Avatar - Schneehasenmasken-Hanfu-Porträt',
    summary:
      'Erzeugt ein filmisches Winter-Fantasy-Porträt einer maskierten Frau in weißem Hanfu mit Hasenmotiv, ideal für elegante Charakterkunst.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / Avatar - Verschneites Hasen-Hanfu-Porträt',
    summary:
      'Erzeugt ein ultradetailliertes Fantasy-Beauty-Porträt einer hasenohrigen Frau in besticktem Hanfu für Charakterkunst oder Kostümdesign.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / Avatar - Verschneites Hasengeist-Porträt',
    summary:
      'Erzeugt ein ruhiges Fantasy-Porträt einer anonymen hasenohrigen Frau im Winter, ideal für atmosphärische Charakterkunst.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / Avatar - Hanfu-Porträt der Song-Dynastie',
    summary:
      'Optimierter Prompt für ein detailliertes realistisches Porträt einer Schönheit im traditionellen Hanfu der Song-Dynastie in einem antiken Hof.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Social-Media-Post - Anime-Pokémon-Shop-Outfit-Teaser',
    summary:
      'Erzeugt ein weiches pastelliges Anime-Fashion-Announcement-Poster mit verschwommenem Gesicht in einem Pokémon-Store.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Social-Media-Post - Filmische Aufzugsszene',
    summary:
      'Prompt für eine düstere, filmische Szene einer Frau in einem metallischen Aufzug mit realistischem Licht und Reflexionen.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Social-Media-Post - Verwirrtes Elf-Girl am Pastell-Schreibtisch',
    summary:
      'Erzeugt eine weiche pastellige Anime-Illustration eines Elf-Girls am Computer in einem gemütlichen Kawaii-Workspace.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Social-Media-Post - Editorial-Fashion-Fotografie',
    summary:
      'Stimmungsvoller, fashion-fokussierter Prompt für eine minimalistische Studioszene mit weichem Licht und warmen Tönen.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Social-Media-Post - Fashion-Editorial-Collage',
    summary:
      'Hochdetaillierter 2x2-Fotocollage-Prompt für Fashion-Editorial-Shots mit konsistentem Styling, spezifischem Licht und Referenzgesicht.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Social-Media-Post - PSG-Transfer-Ankündigungsposter',
    summary:
      'Kräftiges professionelles Football-Signing-Poster zur Ankündigung eines Spielerwechsels zu Paris Saint-Germain.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Social-Media-Post - Retro-Kultur-Magazincover zum Showa Day',
    summary:
      'Warme Editorial-Seite zu einem japanischen Feiertag mit Anime-Charakterkunst, nostalgischer Showa-Straßenszene und Magazinlayout.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Social-Media-Post - Fashion-Outfit-Generierung',
    summary:
      'Prompt zur Generierung einer Woche Fashion-Blogger-Outfit-Empfehlungen auf Basis eines Charakterprofils, inklusive Labels und Preisen.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Social-Media-Post - Travel-Snapshot-Collage',
    summary:
      'Detaillierter Prompt für eine nostalgische 12-Frame-Collage aus smartphoneartigen Reisefotos einer Solo-Reise.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Social-Media-Post - Vintage-Sign-Painter-Skizze',
    summary:
      'Erzeugt eine handgezeichnete Marker-Skizze auf Papier mit realistischen Details wie Graphitlinien und Tintenverlauf.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'VR-Headset-Explosionsansicht-Poster',
    summary:
      'Erzeugt ein Hightech-Explosionsdiagramm eines VR-Headsets mit detaillierten Komponenten-Callouts und Promotion-Text.',
  },
  '3d-animated-boy-building-lego': {
    title: '3D-animierter Junge baut Lego',
    summary:
      'Multi-Shot-Video-Prompt im 3D-Animationsstil über einen Jungen, der in einem Zimmer vorsichtig Lego-Steine zusammensetzt, inklusive Time-Lapse-Effekten.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Ein Jahrzehnt Verfeinerung: Glow-Up',
    summary:
      'Transformation-Prompt für Seedance 2.0, der einen Mann von einem lockeren 2016-Setting zu einem luxuriösen Dubai-Lifestyle 2026 führt.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Rettung durch einen uralten Wächterdrachen',
    summary:
      'Detaillierter filmischer Multi-Shot-Prompt über ein Mädchen in einem regnerischen Dorf, das von einem auftauchenden Drachen gerettet wird.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'FPV-Video eines alten indischen Königreichs',
    summary:
      'Schneller filmischer FPV-Drohnenprompt, der ein mystisches indisches Königreich mit Tempeln und Dschungeln zeigt.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt für Animation Transfer und Camera Tracking',
    summary:
      'Technischer Prompt für Seedance 2.0, der eine bestimmte Bewegungsreferenz auf eine Figur anwendet und zugleich festes Camera Tracking hält.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Beat-synchroner Outfit-Transformationstanz',
    summary:
      'Seedance-2.0-Prompt, der eine Figur anhand von Breakdown-Frames tanzen lässt und einen beat-synchronen Outfitwechsel ausführt.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Character-Intro-Motion-Graphics-Sequenz',
    summary:
      'Komplexer mehrstufiger Motion-Graphics-Prompt zur Vorstellung eines Character-Teams mit UI-Overlays und Übergängen.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Filmische Geburtstagsfeier-Sequenz',
    summary:
      'Hochdetaillierter Multi-Shot-Video-Prompt für eine Geburtstagssequenz mit Fokus auf Charakterkonsistenz und emotionalem Storytelling.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Filmische Dracheninteraktion und Flug',
    summary:
      'Detaillierter Storyboard-Prompt für ein Video mit emotionaler Interaktion zwischen einer Frau und einem Drachen, gefolgt von einem filmischen Flug.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Filmischer Handtanz einer ostasiatischen Frau',
    summary:
      'Hochdetaillierter filmischer Multi-Shot-Video-Prompt für einen stilisierten Handtanz mit time-coded Kamera- und Handlungsanweisungen.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Filmisches emotionales Face-Close-up',
    summary:
      'Hochdetaillierter technischer Seedance-2.0-Prompt mit Fokus auf realistische Hauttexturen und komplexe emotionale Gesichtstransitionen.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Filmische Erkundung einer Meeresbiologin',
    summary:
      'Detaillierter filmischer Video-Prompt für eine Unterwasserszene, in der eine Meeresbiologin ein altes Schiffswrack in einem Korallenriff entdeckt.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Filmischer Musik-Podcast und Gitarrentechnik',
    summary:
      'Fortgeschrittener filmischer Prompt für ein 4K-Musikpodcast-Video mit Fokus auf Gitarrentechnik, Pinch Harmonics und Studioästhetik.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Filmischer Routen-Navigationsguide',
    summary:
      'Strukturierter Multi-Scene-Prompt für Seedance, um ein konsistentes Walking-Navigation-Video mit wiederkehrendem Tour-Guide zu erstellen.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Filmische Street-Racing-Sequenz für Seedance 2',
    summary:
      'Detaillierter Multi-Shot-Prompt für eine nächtliche Street-Racing-Sequenz mit intensivem Fahrerfokus, dynamischer Kameraarbeit und explosiver Beschleunigung.',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Filmische Vampir-Kampfszene in einer Gasse',
    summary:
      'Umfassender Action-Prompt für eine Kurzfilmszene mit dynamischer Kamera und Hochgeschwindigkeitskampf in einer neonbeleuchteten Gasse.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Crimson Horizon Sci-Fi-Filmsequenz',
    summary:
      'Umfassende 9-Shot-Filmsequenz für einen Sci-Fi-Film namens „Crimson Horizon“, vom Raketenstart bis zur unheimlichen Alien-Begegnung auf dem Mars.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Cyberpunk-Game-Trailer-Script',
    summary:
      'Ausführlicher Video-Prompt für einen Cyberpunk-Game-Trailer mit Charakterdesign, UI-Animationen und Umgebungswechsel vom weißen Void zur Favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Satire mit Katze in der Verbotenen Stadt',
    summary:
      'Komplexer Dark-Comedy-Prompt für Seedance 2.0 mit einem orangefarbenen Katzenbeamten und einem Hyänenkaiser in einer satirischen Qing-Dynastie-Szene.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {},
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {},
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {},
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {},
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Hollywood-Haute-Couture-Fantasy-Video-Prompt',
    summary:
      'Detaillierter Multi-Scene-Video-Prompt für Seedance 2.0, ausgelegt auf einen Hollywood-Haute-Couture-Fantasy-Film mit 8K/Unreal-Engine-Ästhetik.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: 12-Sekunden-App-Showcase – drei schwebende Phones',
    summary:
      'Eine 12-sekündige 16:9-App-Showcase-Komposition – drei schwebende iPhone-Screens schweben im 3D-Raum, jedes rotiert nacheinander, um ein anderes Feature zu zeigen, beat-synchrone Label-Callouts, End-Logo-Lockup. Direkt auf dem HyperFrames-`app-showcase`-Catalog-Block aufgebaut.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: 30-Sekunden-Brand-Sizzle-Reel',
    summary:
      'Ein 30-sekündiges 16:9-HyperFrames-Sizzle-Reel – schnelle Schnitte, beat-synchrone kinetische Typografie, audio-reaktive Skalierung auf Display-Wörtern, Shader-Übergänge zwischen fünf Szenen, End-Card mit Logo-Bloom. Modelliert nach dem aisoc-hype-Archetyp aus dem Student-Kit.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Animiertes Bar-Chart-Race (NYT-Stil)',
    summary:
      'Eine 12-sekündige 16:9-Daten-Infografik – animiertes Balken- und Liniendiagramm mit gestaffeltem Kategorie-Reveal, NYT-artiger Serif-Headline, Quellen-Footnote, kinetische Wert-Labels. Direkt auf dem HyperFrames-`data-chart`-Catalog-Block aufgebaut.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Apple-Style-Flugkarte (Origin → Destination)',
    summary:
      'Eine 8-sekündige filmische 16:9-Flugrouten-Karte – realistischer Terrain-Zoom, animiertes Flugzeug, das auf einer geschwungenen Route von Start- zu Zielort gleitet, beschriftete Städte, kinetischer Distanzzähler. Direkt auf dem HyperFrames-`nyc-paris-flight`-Catalog-Block aufgebaut, für jedes Städtepaar wiederverwendbar.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: 4-Sekunden filmisches Logo-Outro',
    summary:
      'Ein 4-sekündiges 16:9-Logo-Outro – stückweise Wordmark-Aufbau mit Bloom, Shimmer-Sweep über das finale Lockup, weiches Grain-Overlay, einzeilige CTA. Aufgebaut auf den HyperFrames-Blöcken `logo-outro`, `shimmer-sweep` und `grain-overlay`.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: $0 → $10K Money-Counter-Hype (9:16)',
    summary:
      'Ein 6-sekündiger vertikaler 1080×1920-HyperFrames-Hype-Clip – Apple-artiger $0 → $10.000-Counter mit grünem Flash, Money-Burst-Partikeln, Cash-Stack-Icon, Kicker-Headline. Aufgebaut auf dem HyperFrames-`apple-money-count`-Catalog-Block.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: 5-Sekunden minimaler Product Reveal',
    summary:
      'Eine 5-sekündige HyperFrames-Komposition für einen High-End-Product-Reveal – dunkle Leinwand, einzelner warmer Akzent, langsamer Push-in-Title-Card, kinetische Kicker-Zeile, zurückhaltende Bewegung. Der Agent rendert MP4 aus HTML+GSAP via Puppeteer; kein Stock Footage nötig.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: 30-Sekunden-SaaS-Product-Promo (Linear-Stil)',
    summary:
      'Eine 30-sekündige HyperFrames-Komposition modelliert nach Linear/ClickUp-artigen Produktfilmen – UI-3D-Reveals, beat-synchrone kinetische Typografie, animierte UI-Screenshots, End-Card mit Logo-Outro. Aus HF-Catalog-Blöcken (ui-3d-reveal, app-showcase, logo-outro) plus Shader-Übergängen zwischen Szenen aufgebaut.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: 9:16 Social-Overlay-Stack (X · Reddit · Spotify · Instagram)',
    summary:
      'Eine 15-sekündige vertikale 1080×1920-HyperFrames-Komposition, die vier animierte Social-Cards über einen Face-Cam-Loop stapelt – einen X-Post, eine Reddit-Reaktion, eine Spotify-Now-Playing-Card und am Ende eine Instagram-Follow-CTA. Jede Karte ist ein HyperFrames-Catalog-Block; die Choreografie ist das Value-Add.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: 9:16 TikTok-Talking-Head mit Karaoke-Untertiteln',
    summary:
      'Ein vertikaler 1080×1920-HyperFrames-Short – TTS-narrierter Talking-Head über einem Face-Cam-Loop, mit karaoke-artigen wort-synchronen Untertiteln, animiertem Lower Third und einem TikTok-Follow-Overlay am Ende. Spiegelt den may-shorts-19-Archetyp aus dem HyperFrames-Student-Kit.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Website-zu-Video-Pipeline (15-Sekunden-Marketing-Cut)',
    summary:
      'Eine 15-sekündige 16:9-HyperFrames-Komposition, die eine Live-Website in drei Viewport-Größen erfasst und dann mit einem chromatischen Radial-Split zwischen Szenen animiert. Spiegelt den hyperframes-sizzle-Student-Kit-Archetyp wider, bei dem die Site das Quell-Asset ist.',
  },
  'hunched-character-animation': {
    title: 'Animation einer gebeugten Figur',
    summary:
      'Anweisung für Seedance 2, eine In-place-Walking-Animation für eine bestimmte Charakterreferenz zu erstellen.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Live-Action-Anime-Adaption: Wasser- vs. Donner-Atmungsduell',
    summary:
      'Hochdetaillierter 15-Sekunden-Prompt für eine Live-Action-Adaption eines Anime-Duells mit blauen Wasser- und goldenen Blitzeffekten.',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Filmische Luxus-Supercar-Erzählung',
    summary:
      'Hochdetaillierter filmischer Multi-Shot-Prompt für Seedance 2.0 mit stilvollem Mann, Dobermännern und Vintage-Supercar in nebliger Bergszene.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Storyboard-Sequenz einer magischen Akademie',
    summary:
      'Detaillierter Storyboard-Prompt für eine filmische Sequenz über ein Magical Girl an einer Akademie, von Ankunft bis magischem Duell.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Healing-Kurzfilm im modernen Rural-Aesthetic-Stil',
    summary:
      'Detaillierter Three-Shot-Prompt für Seedance 2.0, der einen heilenden filmischen Kurzfilm im modernen Rural-Aesthetic-Stil erzeugt.',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Atmosphärische Animation eines Nightclub-Flyers',
    summary:
      'Subtiler Seedance-2.0-Animationsprompt, der Hintergrund- und Lichtelemente zum Leben erweckt, während das Motiv fixiert bleibt.',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Retro-HK-Wuxia-Filmästhetik',
    summary:
      'Komplexer mehrteiliger Video-Prompt, der die 80er-/90er-Hongkong-Wuxia-Filmästhetik mit einer Verwandlung von Katze zu Mensch nachbildet.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: 15-Sekunden-filmischer japanischer Romance-Kurzfilm',
    summary:
      'Hochdetaillierter 15-Sekunden-Multi-Scene-Prompt für einen filmischen, ultrarealistischen japanischen High-School-Romance-Kurzfilm.',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: 80-jährige Rapperin im Musikvideo',
    summary:
      'Detaillierter 15-Sekunden-Prompt für ein horizontales Street-Rap-MV in 16:9 mit einer 80-jährigen Frau und kühlen Neonviolett-/Blautönen.',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Sequenz- und Bewegungsanweisung für Kampfsportvideo',
    summary:
      'Video-Prompt für Seedance 2.0, der eine Sequenz anhand eines Character Sheets animiert und spezifische Bewegungen und Schritte betont.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Magische Spiegel-Sequenz mit Seelentausch',
    summary:
      'Narrativer Video-Prompt über ein magisches Seelentausch-Ereignis an einem Spiegel, mit Kameraanweisungen und emotionalen Cues.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Toaster-Raketen-Jumpscare',
    summary:
      'Prompt für eine realistische Home-Video-Aufnahme eines alten Mannes, der erschrickt, als ein Toaster Brot wie eine Rakete abschießt.',
  },
  'traditional-dance-performance': {
    title: 'Traditionelle Tanzperformance',
    summary:
      'Umfassender Seedance-2.0-Video-Prompt für einen anmutigen traditionellen Tanz auf Basis von Choreografie- und Identitätsreferenzbildern.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {},
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {},
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {},
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Piraten-Krokodil-Animation im Vintage-Disney-Stil',
    summary:
      'Mehrszeniger narrativer Prompt für eine klassische Vintage-Disney-Animation mit einem Krokodilpiraten und Vogelpiraten auf einem Schiff.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Virale K-Pop-Dance-Choreografie',
    summary:
      'Detaillierter Seedance-2.0-Prompt, der eine Figur eine Choreografie auf Basis eines 16-Panel-Storyboard-Referenzbilds tanzen lässt.',
  },
  'wasteland-factory-chase': {
    title: 'Wasteland-Factory-Chase',
    summary:
      'Filmischer Prompt für eine High-Speed-Wüsten-Wasteland-Szene mit einer laufenden Industriefabrik auf Beinen und einer Verfolgung per Rebel Bike.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Spiel-UI - Altes China, Open-World-MMO-HUD',
    summary:
      'Erzeugt ein In-Game-HUD-Screenshot-Mockup für ein AAA-Open-World-MMO im alten China im filmischen photorealistischen Stil von Black Myth: Wukong, zentriert auf eine Schwertkämpferin in einer nebligen Bergszene mit vollständigem MMO-HUD (Charakterpanel, Minimap, Skill-Hotbar, Quest-Tracker, Chat).',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Illustration - Wachsmalstift-Kinderzeichnung-Überarbeitung',
    summary:
      'Ein Stiltransfer-Prompt, der jedes Referenzbild in eine handgezeichnete Wachsmalstift-Illustration verwandelt, die wirkt, als hätte sie ein 10-jähriges Kind gemalt. Ersetzt die Originalfarbpalette durch helle, verspielte Wachsmalstifttöne auf sauberem weißem Papier, mit kindlicher Deko wie Schlössern, Süßigkeiten, Sternen und Regenbögen. Funktioniert als Bild-zu-Bild-Edit in GPT-image-2.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Social-Media-Post - Tanz-Storyboard eines Stylish Girls (8 Shots)',
    summary:
      'Ein vollständiges 8-Shot-Storyboard-Prompt-Set für die Erzeugung einer kohärenten Bild-für-Bild-Tanzsequenz einer stylischen Figur. Enthält gemeinsame globale Style-Token, einen wiederverwendbaren Negativ-Prompt und acht Einzelshots (Eröffnungspose → Hüftgroove → Body Wave → Beat-Drop-Hüftdreher → seitliche Hüftschwingung → Haarwurf → Power-Stance → Abschlusspose).',
  },
};

const LOCALIZED_CONTENT: Partial<Record<Locale, LocalizedContentBundle>> = {
  de: {
    skillCopy: DE_SKILL_COPY,
    skillIdsWithEnFallback: DE_SKILL_IDS_WITH_EN_FALLBACK,
    designSystemSummaries: DE_DESIGN_SYSTEM_SUMMARIES,
    designSystemCategories: DE_DESIGN_SYSTEM_CATEGORIES,
    designSystemIdsWithEnFallback: DE_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK,
    promptTemplateCategories: DE_PROMPT_TEMPLATE_CATEGORIES,
    promptTemplateIdsWithEnFallback: DE_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
    promptTemplateTags: DE_PROMPT_TEMPLATE_TAGS,
    promptTemplateCopy: DE_PROMPT_TEMPLATE_COPY,
  },
  ru: {
    skillCopy: RU_SKILL_COPY,
    skillIdsWithEnFallback: RU_SKILL_IDS_WITH_EN_FALLBACK,
    designSystemSummaries: RU_DESIGN_SYSTEM_SUMMARIES,
    designSystemCategories: RU_DESIGN_SYSTEM_CATEGORIES,
    designSystemIdsWithEnFallback: RU_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK,
    promptTemplateCategories: RU_PROMPT_TEMPLATE_CATEGORIES,
    promptTemplateIdsWithEnFallback: RU_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
    promptTemplateTags: RU_PROMPT_TEMPLATE_TAGS,
    promptTemplateCopy: RU_PROMPT_TEMPLATE_COPY,
  },
  fr: {
    skillCopy: FR_SKILL_COPY,
    skillIdsWithEnFallback: FR_SKILL_IDS_WITH_EN_FALLBACK,
    designSystemSummaries: FR_DESIGN_SYSTEM_SUMMARIES,
    designSystemCategories: FR_DESIGN_SYSTEM_CATEGORIES,
    designSystemIdsWithEnFallback: FR_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK,
    promptTemplateCategories: FR_PROMPT_TEMPLATE_CATEGORIES,
    promptTemplateIdsWithEnFallback: FR_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
    promptTemplateTags: FR_PROMPT_TEMPLATE_TAGS,
    promptTemplateCopy: FR_PROMPT_TEMPLATE_COPY,
  },
};

function buildLocalizedContentIds(content: LocalizedContentBundle): LocalizedContentIds {
  return {
    skills: [
      ...Object.keys(content.skillCopy),
      ...content.skillIdsWithEnFallback,
    ],
    designSystems: [
      ...Object.keys(content.designSystemSummaries),
      ...content.designSystemIdsWithEnFallback,
    ],
    designSystemCategories: Object.keys(content.designSystemCategories),
    promptTemplates: [
      ...Object.keys(content.promptTemplateCopy),
      ...content.promptTemplateIdsWithEnFallback,
    ],
    promptTemplateCategories: Object.keys(content.promptTemplateCategories),
    promptTemplateTags: Object.keys(content.promptTemplateTags),
  };
}

export const LOCALIZED_CONTENT_IDS = {
  de: buildLocalizedContentIds(LOCALIZED_CONTENT.de!),
  ru: buildLocalizedContentIds(LOCALIZED_CONTENT.ru!),
  fr: buildLocalizedContentIds(LOCALIZED_CONTENT.fr!),
} satisfies Record<'de' | 'ru' | 'fr', LocalizedContentIds>;

export const GERMAN_CONTENT_IDS = LOCALIZED_CONTENT_IDS.de;
export const RUSSIAN_CONTENT_IDS = LOCALIZED_CONTENT_IDS.ru;
export const FRENCH_CONTENT_IDS = LOCALIZED_CONTENT_IDS.fr;

function getLocalizedContent(locale: Locale): LocalizedContentBundle | undefined {
  return LOCALIZED_CONTENT[locale];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function localizeSkillPrompt(locale: Locale, skill: SkillSummary): string | undefined {
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.examplePrompt;
  if (translated) return translated;
  return skill.examplePrompt ? normalizeText(skill.examplePrompt) : undefined;
}

export function localizeSkillDescription(locale: Locale, skill: SkillSummary): string {
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.description;
  if (translated) return translated;
  return normalizeText(skill.description);
}

export function localizeDesignSystemSummary(
  locale: Locale,
  system: DesignSystemSummary,
): string {
  const translated = getLocalizedContent(locale)?.designSystemSummaries[system.id];
  if (translated) return translated;
  return system.summary || system.category || '';
}

export function localizeDesignSystemCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.designSystemCategories[category] ?? category;
}

export function localizePromptTemplateCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.promptTemplateCategories[category] ?? category;
}

export function localizePromptTemplateSummary(
  locale: Locale,
  template: PromptTemplateSummary,
): PromptTemplateSummary {
  const content = getLocalizedContent(locale);
  if (!content) return template;
  const translated = content.promptTemplateCopy[template.id];
  const tags = template.tags?.map((tag) => content.promptTemplateTags[tag] ?? tag);
  return {
    ...template,
    title: translated?.title ?? template.title,
    summary: translated?.summary ?? template.summary,
    category: localizePromptTemplateCategory(locale, template.category || 'General'),
    tags,
  };
}
