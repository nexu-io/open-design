import type { PromptTemplateSummary } from '../types';

export const FR_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  'audio-jingle': {
    examplePrompt:
      'Un jingle indie-pop joyeux de 30 secondes pour le lancement d’un coffee shop — piano électrique chaleureux, batterie aux balais, basse douce et un seul chœur “ahhh” lumineux au refrain. Sans chant. Fin facile à boucler.',
    description:
      'Génération audio pour jingles, musiques de fond, voix off et effets sonores. Les demandes de musique partent vers Suno V5 / Udio / Lyria, la voix vers MiniMax TTS / FishAudio / ElevenLabs V3, et les SFX vers ElevenLabs SFX ou AudioCraft. La sortie est un fichier MP3/WAV dans le dossier projet.',
  },
  'blog-post': {
    examplePrompt:
      'Un article long-form / blog post — masthead, placeholder d’image hero, corps d’article avec figures et pull quotes, ligne auteur, articles associés.',
  },
  'critique': {
    examplePrompt:
      'Lancez une critique en 5 dimensions du deck magazine-web-ppt qui vient d’être généré — évaluez philosophie / hiérarchie / détail / fonction / innovation et sortez Keep / Fix / Quick wins.',
  },
  'dashboard': {
    examplePrompt:
      'Dashboard admin / analytics dans un seul fichier HTML.',
  },
  'dating-web': {
    examplePrompt:
      'Concevez “mutuals” — un site de dating pour créateurs sur X. Dashboard digest quotidien avec stats, bar chart des matchs mutuels et ticker communautaire.',
  },
  'design-brief': {},
  'digital-eguide': {
    examplePrompt:
      'Concevez “The Creator’s Style & Format Guide” — page de couverture et page intérieure pour une marque lifestyle creator.',
  },
  'docs-page': {
    examplePrompt:
      'Une page de documentation — navigation à gauche, zone article scrollable, table des matières à droite.',
  },
  'open-design-landing': {
    examplePrompt:
      'Concevez la landing page marketing Open Design dans le style Atelier Zero / Monocle — canvas papier chaud, collage surréaliste plâtre + architecture, grande typographie display serif italique mixée, chiffres romains comme marqueurs de sections et un seul accent corail.',
  },
  'open-design-landing-deck': {
    examplePrompt:
      'Créez le pitch deck Open Design dans le style Atelier Zero — cover avec hero plate, séparateurs de section en chiffres romains, slide stats (31 Skills · 72 systèmes · 12 CLIs), citation client, CTA et end-card mega italic-serif. Pagination horizontal-swipe comme un magazine imprimé.',
    description:
      'Crée un slide deck single-file dans le style Atelier Zero (papier chaud, spans accent en serif italique, points finaux corail, plaques de collage surréalistes). Pagination magazine horizontale avec navigation par flèches et espace, HUD live avec compteur de slides et progress bar ; partage le stylesheet et la bibliothèque d’images à 16 slots avec le Skill frère `open-design-landing`.',
  },
  'email-marketing': {
    examplePrompt:
      'Concevez un email de lancement pour une marque de running shoes — masthead, hero, grand headline lockup, grille de specs, CTA.',
  },
  'eng-runbook': {
    examplePrompt:
      'Rédigez un runbook pour notre service d’auth — alertes, dashboards, procédures standard, rotation on-call.',
  },
  'finance-report': {
    examplePrompt:
      'Créez un rapport financier Q3 pour un SaaS early-stage — MRR, burn, marge brute, top accounts.',
  },
  'gamified-app': {
    examplePrompt:
      'Concevez une app gamifiée de life management — prototype mobile multi-screen : cover poster, quêtes du jour avec XP et détail de quête. “Daily quests for becoming a better human.”',
  },
  'magazine-web-ppt': {
    examplePrompt:
      'Créez-moi un PPT magazine sur “entreprises d’une personne · organisations pliées par l’IA”, talk de 25 minutes, audience designers + founders. Recommandez d’abord une direction (Monocle / WIRED / Kinfolk / Domus / Lab) pour que je choisisse.',
  },
  'hatch-pet': {
    examplePrompt:
      'Faites éclore un petit pixel-pet — un Shiba amical dans un pull confortable. Utilisez le Skill hatch-pet de bout en bout.',
    description:
      'Crée, répare, valide et empaquette une spritesheet de pet animé compatible Codex (atlas 8x9, cellules 192x208), avec contact sheet QA, vidéos preview et pet.json.',
  },
  'hr-onboarding': {
    examplePrompt:
      'Créez un plan d’onboarding 30 jours pour un nouveau Product Designer dans une startup de 40 personnes.',
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
      'Product reveal de 5 secondes : produit premium minimaliste sur une surface crème propre, lumière latérale douce, lent push-in caméra, mouvement retenu, aucun overlay texte.',
    description:
      'Crée des compositions vidéo, animations, title cards, overlays, sous-titres, voiceovers, visuels audio-réactifs et transitions de scènes en HTML HyperFrames.',
  },
  'image-poster': {
    examplePrompt:
      'Poster éditorial pour un festival de cinéma indie — silhouette abstraite forte sur papier chaud légèrement grainé ; titre sans-serif composé à la main en haut, dates et lieu du festival en monospace en bas. Palette ocre et encre atténuée.',
    description:
      'Génération d’image unique pour posters, key art et illustrations éditoriales. Le défaut est gpt-image-2, mais le workflow reste indépendant du fournisseur.',
  },
  'invoice': {
    examplePrompt:
      'Créez une facture d’un studio de design freelance pour un client sur un projet d’identité de marque — trois lignes, acompte de 10 %, TVA de 9 %.',
  },
  'kami-deck': {
    examplePrompt:
      'Créez un deck de conférence en six slides dans le style kami (紙) — parchemin chaud, encre bleue sur la cover, une seule graisse de serif, swipe magazine horizontal.',
    description:
      'Génère un slide deck prêt à imprimer dans le design system kami : parchemin chaud (ou encre bleue sur cover et chapitres), serif dans une seule graisse, accent encre bleue ≤5 % par slide, sans italique. Pagination magazine horizontale (←/→ · molette · swipe · ESC pour la vue d’ensemble). Un seul fichier HTML autonome, uniquement Google Fonts.',
  },
  'kami-landing': {
    examplePrompt:
      'Concevez un one-pager studio dans le style kami — canvas parchemin, accent encre bleue, éditorial comme un whitepaper.',
    description:
      'Génère un one-pager prêt à imprimer dans le style kami (紙) : parchemin chaud, accent encre bleue, serif dans une seule graisse, sans italique, sans gris froids. Se lit comme un whitepaper ou un one-pager studio, pas comme une UI d’app. Multilingue (EN · zh-CN · ja). Un seul fichier HTML sans dépendances.',
  },
  'kanban-board': {
    examplePrompt:
      'Créez un Kanban board pour une équipe growth de 5 personnes en plein sprint — Backlog, Doing, Review, Done.',
  },
  'live-artifact': {
    examplePrompt:
      'Créez un artefact live interactif avec des cartes de statut, un tableau de données et un panneau de détail qui réagit aux changements de sélection.',
  },
  'magazine-poster': {
    examplePrompt:
      'Concevez un poster éditorial style magazine — “You don’t need a designer to ship your first draft anymore.” Papier journal, six sections numérotées.',
  },
  'meeting-notes': {
    examplePrompt:
      'Rédigez les notes d’un weekly growth de 60 minutes — agenda, décisions, action items avec owners, prochaine réunion.',
  },
  'mobile-app': {
    examplePrompt:
      'Un écran d’app mobile, rendu dans un frame iPhone 15 Pro pixel-perfect sur la page.',
  },
  'mobile-onboarding': {
    examplePrompt:
      'Concevez un flow mobile onboarding en 3 écrans pour une app de méditation — welcome, value props, sign-in.',
  },
  'motion-frames': {
    examplePrompt:
      'Concevez un hero animé — un type ring rotatif autour d’un globe wireframe, avec le headline “Reach every country.” Boucle à 12s, prêt pour export HyperFrames.',
  },
  'pm-spec': {
    examplePrompt:
      'Rédigez une PRD pour l’authentification à deux facteurs dans notre app SaaS — problème, scope, milestones, questions ouvertes.',
  },
  'pptx-html-fidelity-audit': {
    examplePrompt:
      'Comparez deck.pptx à deck.html, listez les dérives de layout (overflow de footer, italique manquante, hero non centré) et réexportez avec Footer Rail + Cursor Flow.',
  },
  'pricing-page': {
    examplePrompt:
      'Une pricing page autonome — header, niveaux de plans, table de comparaison des features et FAQ.',
  },
  'replit-deck': {
    examplePrompt:
      'Deck HTML single-file à swipe horizontal dans le style de la galerie de templates Replit Slides.',
  },
  'saas-landing': {
    examplePrompt:
      'Landing page SaaS one-page avec hero, features, social proof, pricing et CTA.',
  },
  'simple-deck': {
    examplePrompt:
      'Deck HTML single-file à swipe horizontal.',
  },
  'social-carousel': {
    examplePrompt:
      'Concevez un social carousel cinématique de 3 cartes — “onwards.”, “to the next one.”, “looking ahead.” Carrés 1080×1080, prêts pour Instagram.',
  },
  'sprite-animation': {
    examplePrompt:
      'Créez une animation à base de sprites avec des anecdotes sur l’histoire de Nintendo. Combinez mascot pixel, texte animé et accent Hanafuda. Couleur et typographie doivent évoquer la marque Nintendo.',
  },
  'team-okrs': {
    examplePrompt:
      'Créez un OKR tracker pour Q4 — trois Objectives, trois Key Results chacun, progress bars, owners, status pills.',
  },
  'tweaks': {
    examplePrompt:
      'Ajoutez à cette landing page un Tweak Panel — Accent Color, Type Scale, Density, Light/Dark — et persistez dans localStorage pour conserver le choix après refresh.',
  },
  'video-shortform': {
    examplePrompt:
      'Product reveal de 5 secondes — une tasse en céramique tourne sur fond papier doux, lumière chaude latérale depuis la gauche, fines particules de poussière dans le rayon. Cinématique, 16:9, lent drift caméra.',
    description:
      'Génération vidéo short-form pour clips de 3 à 10 secondes : product reveals, motion teasers et ambient loops.',
  },
  'web-prototype': {
    examplePrompt:
      'Prototype polyvalent pour desktop web.',
  },
  'weekly-update': {
    examplePrompt:
      'Créez un deck weekly update pour l’équipe growth — terminé, en cours, blockers, metrics et questions pour la semaine prochaine.',
  },
  'wireframe-sketch': {
    examplePrompt:
      'Esquissez un wireframe dessiné à la main v0.1 pour un portail — quatre variantes sous forme de tabs sur papier millimétré, headlines au marqueur, annotations sticky-note, placeholders de charts hachurés.',
  },
};

export const FR_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  airbnb: 'Marketplace de voyage. Accent corail chaleureux, fortement porté par la photo, UI arrondie.',
  airtable: 'Hybride spreadsheet / base de données. Coloré, accessible, esthétique de données structurées.',
  apple: 'Électronique grand public. Espace blanc premium, SF Pro, imagerie cinématique.',
  'atelier-zero':
    'Système de studio éditorial. Canvas papier chaud, collage surréaliste plâtre + architecture, typographie display serif italique mixée, chiffres romains comme marqueurs de sections et un seul accent corail — fait pour landing pages magazine, sites de studio et pages manifeste.',
  binance: 'Exchange crypto. Accent jaune fort sur monochrome, urgence trading-floor.',
  bmw: 'Automobile de luxe. Surfaces dark premium, esthétique d’engineering allemand précis.',
  bugatti: 'Marque hypercar. Toile cinématique sombre, rigueur monochrome, typographie display monumentale.',
  cal: 'Scheduling open-source. UI neutre propre, simplicité orientée développeur.',
  claude: 'Assistant IA d’Anthropic. Accent terracotta chaud, layout éditorial clair.',
  clay: 'Agence créative. Formes organiques, gradients doux, mise en page très éditoriale et dirigée.',
  clickhouse: 'Base analytics rapide. Style documentation technique avec accent jaune.',
  cohere: 'Plateforme IA enterprise. Gradients vivants, esthétique dashboard riche en données.',
  coinbase: 'Exchange crypto. Identité bleue claire, confiance, sensation institutionnelle.',
  composio: 'Plateforme d’intégrations d’outils. Dark moderne avec icônes d’intégration colorées.',
  cursor: 'Éditeur de code AI-first. Interface dark fine, accents en gradient.',
  default:
    'Défaut propre et orienté produit. À utiliser quand le brief ne demande pas d’ambiance précise — bon pour outils B2B, dashboards et pages utility.',
  elevenlabs: 'Plateforme IA voice. UI sombre cinématique, esthétique waveform audio.',
  expo: 'Plateforme React Native. Thème sombre, tracking serré, centré code.',
  ferrari: 'Automobile de luxe. Éditorial chiaroscuro, accents Ferrari Red, noir cinématique.',
  figma: 'Outil de design collaboratif. Multicolore vif, joueur et professionnel.',
  framer: 'Website builder. Noir et bleu audacieux, motion-first, orienté design.',
  hashicorp: 'Automatisation d’infrastructure. Look enterprise propre, noir et blanc.',
  ibm: 'Technologie enterprise. Carbon Design System, palette bleue structurée.',
  intercom: 'Customer messaging. Palette bleue amicale, patterns UI conversationnels.',
  kami:
    'Système papier éditorial. Canvas papier chaud, accent bleu encre, serif à une seule graisse — fait pour CV, one-pagers, white papers, portfolios et slide decks.',
  kraken: 'Trading crypto. UI sombre avec accent violet, dashboards riches en données.',
  lamborghini: 'Marque supercar. Surfaces noir profond, accents or, typographie uppercase dramatique.',
  'linear-app': 'Project management. Ultraminimal, précis, accent violet.',
  lovable: 'Builder full-stack IA. Gradients ludiques, esthétique dev amicale.',
  mastercard: 'Réseau global de paiement. Canvas papier chaud, formes pill orbitales, chaleur éditoriale.',
  meta: 'Tech retail store. Centré photographie, surfaces clair/dark binaires, CTA Meta Blue.',
  minimax: 'Fournisseur de modèles IA. Interface dark audacieuse avec accents néon.',
  mintlify: 'Plateforme de documentation. Propre, accent vert, optimisée pour la lecture.',
  miro: 'Collaboration visuelle. Accent jaune lumineux, esthétique infinite canvas.',
  'mistral-ai': 'Fournisseur LLM open-weight. Minimalisme construit à la française, teinté violet.',
  mongodb: 'Base documentaire. Branding feuille verte, centré sur la documentation développeur.',
  nike: 'Retail sport. UI monochrome, uppercase massive, photographie full-bleed.',
  notion: 'Workspace all-in-one. Minimalisme chaud, headings serif, surfaces douces.',
  nvidia: 'GPU computing. Énergie vert-noir, esthétique de puissance technique.',
  ollama: 'Exécuter des LLMs localement. Terminal-first, simplicité monochrome.',
  'opencode-ai': 'Plateforme IA coding. Thème dark centré développeur.',
  pinterest: 'Découverte visuelle. Accent rouge, masonry grid, focus image.',
  playstation:
    'Retail console gaming. Layout à trois surfaces, autorité calme en typographie display, hover scale cyan.',
  posthog: 'Product analytics. Branding ludique, UI dark developer-friendly.',
  raycast: 'Launcher de productivité. Chrome dark élégant, accents gradient vifs.',
  renault: 'Automobile française. Gradients aurora vivants, typographie NouvelR, énergie forte.',
  replicate: 'Exécuter des modèles ML par API. Canvas blanc propre, orienté code.',
  resend: 'API email. Thème dark minimaliste, accents monospace.',
  revolut: 'Banque digitale. Interface dark fine, cartes gradient, précision fintech.',
  runwayml: 'Génération vidéo IA. UI dark cinématique, layout riche en médias.',
  sanity: 'Headless CMS. Accent rouge, layout éditorial content-first.',
  sentry: 'Monitoring d’erreurs. Dashboard dark, riche en données, accent rose-violet.',
  shopify: 'Plateforme e-commerce. Dark-first et cinématique, accent vert néon, type ultralégère.',
  spacex: 'Technologie spatiale. Noir et blanc stricts, imagerie full-bleed, futuriste.',
  spotify: 'Streaming musical. Vert vivant sur dark, type forte, piloté par album art.',
  starbucks:
    'Marque café retail globale. Système vert à quatre niveaux, canvas papier chaud, boutons full-pill.',
  stripe: 'Infrastructure paiement. Gradients violets signature, élégance en weight 300.',
  supabase: 'Alternative Firebase open-source. Thème dark émeraude, code-first.',
  superhuman: 'Client email rapide. UI dark premium, keyboard-first, glow violet.',
  tesla: 'Automobile électrique. Réduction radicale, photographie full-viewport, presque aucune UI.',
  theverge:
    'Média tech éditorial. Accents acid mint et ultraviolet, display Manuka, story tiles façon rave flyer.',
  'together-ai': 'Infrastructure IA open-source. Technique, design proche blueprint.',
  uber: 'Plateforme de mobilité. Noir et blanc francs, type serrée, énergie urbaine.',
  vercel: 'Déploiement frontend. Précision noir et blanc, Geist Font.',
  vodafone: 'Marque télécom globale. Typographie display uppercase monumentale, bandes Vodafone Red.',
  voltagent: 'Framework d’agents IA. Fond noir profond, accent émeraude, pensé comme un terminal natif.',
  'warm-editorial':
    'Esthétique magazine portée par la serif. Accent terracotta sur papier off-white chaud — bon pour long-form, éditorial et pages marketing portées par la marque.',
  warp: 'Terminal moderne. Interface dark type IDE, command UI en blocs.',
  webflow: 'Visual web builder. Accent bleu, esthétique marketing-site polie.',
  wired: 'Magazine tech. Densité broadsheet sur blanc papier, custom serif display, kicker mono, liens bleu encre.',
  wise: 'Transfert d’argent. Accent vert lumineux, amical et clair.',
  'x-ai': 'Lab IA d’Elon Musk. Look monochrome strict, minimalisme futuriste.',
  xiaohongshu: 'Plateforme social lifestyle UGC. Rouge de marque singulier, radius généreux, content-first.',
  zapier: 'Plateforme d’automatisation. Orange chaud, amical, porté par l’illustration.',
};

export const FR_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  Starter: 'Starter',
  'AI & LLM': 'AI & LLM',
  'Bold & Expressive': 'Audacieux & expressif',
  'Creative & Artistic': 'Créatif & artistique',
  'Developer Tools': 'Developer Tools',
  'Layout & Structure': 'Layout & structure',
  'Modern & Minimal': 'Moderne & minimal',
  'Morphism & Effects': 'Morphism & effets',
  'Productivity & SaaS': 'Productivité & SaaS',
  'Professional & Corporate': 'Professionnel & corporate',
  'Backend & Data': 'Backend & data',
  'Design & Creative': 'Design & créativité',
  'Fintech & Crypto': 'Fintech & crypto',
  'E-Commerce & Retail': 'E-commerce & retail',
  'Media & Consumer': 'Médias & grand public',
  Automotive: 'Automobile',
  'Editorial & Print': 'Éditorial & print',
  'Editorial · Studio': 'Éditorial · Studio',
  'Retro & Nostalgic': 'Rétro & nostalgique',
  'Themed & Unique': 'Thématique & unique',
  'Editorial / Personal / Publication': 'Éditorial / Personnel / Publication',
  Uncategorized: 'Non catégorisé',
};

export const FR_SKILL_IDS_WITH_EN_FALLBACK = [
  'dcf-valuation',
  'flowai-live-dashboard-template',
  'html-ppt-taste-brutalist',
  'html-ppt-taste-editorial',
  // Vendored upstream English-language Zara templates (zarazhangrui/beautiful-html-templates).
  // Localized copy is not maintained; fall back to the upstream English description.
  'html-ppt-zhangzara-8-bit-orbit',
  'html-ppt-zhangzara-biennale-yellow',
  'html-ppt-zhangzara-block-frame',
  'html-ppt-zhangzara-blue-professional',
  'html-ppt-zhangzara-bold-poster',
  'html-ppt-zhangzara-broadside',
  'html-ppt-zhangzara-capsule',
  'html-ppt-zhangzara-cartesian',
  'html-ppt-zhangzara-cobalt-grid',
  'html-ppt-zhangzara-coral',
  'html-ppt-zhangzara-creative-mode',
  'html-ppt-zhangzara-daisy-days',
  'html-ppt-zhangzara-editorial-tri-tone',
  'html-ppt-zhangzara-grove',
  'html-ppt-zhangzara-long-table',
  'html-ppt-zhangzara-mat',
  'html-ppt-zhangzara-monochrome',
  'html-ppt-zhangzara-neo-grid-bold',
  'html-ppt-zhangzara-peoples-platform',
  'html-ppt-zhangzara-pin-and-paper',
  'html-ppt-zhangzara-pink-script',
  'html-ppt-zhangzara-playful',
  'html-ppt-zhangzara-raw-grid',
  'html-ppt-zhangzara-retro-windows',
  'html-ppt-zhangzara-retro-zine',
  'html-ppt-zhangzara-sakura-chroma',
  'html-ppt-zhangzara-scatterbrain',
  'html-ppt-zhangzara-signal',
  'html-ppt-zhangzara-soft-editorial',
  'html-ppt-zhangzara-stencil-tablet',
  'html-ppt-zhangzara-studio',
  'html-ppt-zhangzara-vellum',
  // IB pitch-book skill (#888): English-only skill copy for now.
  'ib-pitch-book',
  'last30days',
  'live-dashboard',
  'orbit-general',
  'orbit-github',
  'orbit-gmail',
  'orbit-linear',
  'orbit-notion',
  // TODO: add localized copy for social-media-dashboard (introduced in #678).
  // Fallback for now so the localized-content coverage test passes.
  'social-media-dashboard',
  'social-media-matrix-tracker-template',
  'web-prototype-taste-brutalist',
  'web-prototype-taste-editorial',
  'web-prototype-taste-soft',
  'waitlist-page',
  'x-research',
  'trading-analysis-dashboard-template',
  'github-dashboard',
] as const;

export const FR_DESIGN_SYSTEM_IDS_WITH_EN_FALLBACK = [
  'agentic',
  'ant',
  'application',
  'arc',
  'artistic',
  'bento',
  'bmw-m',
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
  'mission-control',
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
  'urdu',
  'vibrant',
  'vintage',
] as const;

export const FR_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  Infographic: 'Infographie',
  'Anime / Manga': 'Anime / manga',
  'App / Web Design': 'App / web design',
  'Game UI': 'Game UI',
  Illustration: 'Illustration',
  'Profile / Avatar': 'Profil / avatar',
  'Social Media Post': 'Post réseaux sociaux',
  General: 'Général',
  Advertising: 'Publicité',
  'Motion Graphics': 'Motion graphics',
  Cinematic: 'Cinématique',
  'VFX / Fantasy': 'VFX / fantasy',
  Anime: 'Anime',
  'Social / Meme': 'Social / meme',
  Branding: 'Branding',
  Data: 'Data',
  Marketing: 'Marketing',
  Product: 'Produit',
  'Short Form': 'Short form',
  Travel: 'Voyage',
  'Live Artifact': 'Live artifact',
};

export const FR_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK = ['notion-team-dashboard-live-artifact'] as const;

export const FR_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3D',
  '3d-render': 'rendu 3D',
  action: 'action',
  'ancient-china': 'Chine ancienne',
  anime: 'anime',
  'app-showcase': 'app showcase',
  archery: 'tir à l’arc',
  arpg: 'ARPG',
  'audio-reactive': 'audio-réactif',
  'boss-fight': 'boss fight',
  brand: 'brand',
  branding: 'branding',
  captions: 'sous-titres',
  cavalry: 'cavalerie',
  chart: 'chart',
  childlike: 'enfantin',
  choreography: 'chorégraphie',
  cinematic: 'cinématique',
  'cinematic-romance': 'romance cinématique',
  combat: 'combat',
  combo: 'combo',
  'companion-to-image': 'companion to image',
  counter: 'counter',
  crayon: 'crayon',
  cyberpunk: 'cyberpunk',
  dance: 'danse',
  'data-viz': 'data-viz',
  editorial: 'éditorial',
  'elden-ring': 'Elden Ring',
  endcard: 'end card',
  escort: 'escort',
  'escort-mission': 'mission d’escorte',
  fantasy: 'fantasy',
  fashion: 'mode',
  'fighting-game': 'jeu de combat',
  food: 'food',
  'game-cinematic': 'cinématique jeu',
  'game-ui': 'game UI',
  'grid-sheet': 'grid sheet',
  guanyu: 'Guanyu',
  'hand-drawn': 'dessiné à la main',
  hud: 'HUD',
  'hud-safe': 'HUD-safe',
  hype: 'hype',
  hyperframes: 'HyperFrames',
  idol: 'idol',
  illustration: 'illustration',
  'image-to-image': 'image-to-image',
  infographic: 'infographie',
  japanese: 'japonais',
  karaoke: 'karaoké',
  'key-visual': 'key visual',
  'kinetic-typography': 'typographie cinétique',
  'linear-style': 'style Linear',
  'live-artifact': 'live artifact',
  logo: 'logo',
  lyubu: 'Lyu Bu',
  map: 'carte',
  marketing: 'marketing',
  minimal: 'minimal',
  mmo: 'MMO',
  mobile: 'mobile',
  money: 'argent',
  'mounted-combat': 'combat monté',
  nature: 'nature',
  'open-world': 'open world',
  'otaku-dance': 'danse otaku',
  outro: 'outro',
  overlay: 'overlay',
  pipeline: 'pipeline',
  'pose-reference': 'référence de pose',
  portrait: 'portrait',
  product: 'produit',
  'product-promo': 'promo produit',
  rework: 'rework',
  route: 'itinéraire',
  saas: 'SaaS',
  sequence: 'séquence',
  sizzle: 'sizzle',
  social: 'social',
  storyboard: 'storyboard',
  'street-fighter': 'Street Fighter',
  'style-transfer': 'style transfer',
  tekken: 'Tekken',
  'three-kingdoms': 'Trois Royaumes',
  tiktok: 'TikTok',
  'title-card': 'title card',
  transform: 'transformation',
  travel: 'voyage',
  tts: 'TTS',
  typography: 'typographie',
  'unreal-engine-5': 'Unreal Engine 5',
  vertical: 'vertical',
  'video-reference': 'référence vidéo',
  'vs-screen': 'VS screen',
  'website-to-video': 'website-to-video',
  wuxia: 'wuxia',
  zhaoyun: 'Zhaoyun',
};

export const FR_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infographie 3D d’une évolution en escalier de pierre',
    summary:
      'Transforme une timeline d’évolution plate en infographie 3D réaliste en escalier de pierre, avec rendus détaillés d’organismes et panneaux latéraux structurés.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Illustration anime de combat d’arts martiaux',
    summary:
      'Génère une illustration anime dynamique et impactante de deux personnages féminins qui combattent dans un dojo traditionnel avec effets d’énergie élémentaire.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Mockup d’interface de livestream e-commerce',
    summary:
      'Génère une interface réaliste de livestream social media au-dessus d’un portrait, avec messages de chat personnalisables, popups de cadeaux et carte d’achat produit.',
  },
  'illustrated-city-food-map': {
    title: 'Carte culinaire illustrée d’une ville',
    summary:
      'Génère une tourist map dessinée à la main en style aquarelle, avec spécialités locales numérotées, points d’intérêt et légende.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {},
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Slide explicative Momotaro en style hybride',
    summary:
      'Combine l’esthétique simple et chaleureuse des illustrations Irasutoya avec la densité d’information des slides administratives japonaises.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Profil / avatar - Anime girl vers photo cinématique',
    summary:
      'Transforme une illustration de personnage en portrait réaliste vintage d’intérieur, avec tons chauds, tout en préservant tenue, pose et chat.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Profil / avatar - Shooting photo mode casual en grille',
    summary:
      'Prompt JSON structuré pour un collage de 4 photos d’un shooting photo mode casual, avec paramètres détaillés pour la personne et la lumière.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Profil / avatar - Portrait cinématique sud-asiatique avec vautours',
    summary:
      'Portrait cinématique détaillé d’un jeune homme sud-asiatique dans une scène dark fantasy, entouré de vautours et corbeaux.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Profil / avatar - Portrait anime cyberpunk avec texte néon sur le visage',
    summary:
      'Portrait anime stylé baigné de néon pour poster, social media art ou visuels de branding futuriste.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Profil / avatar - Fantasy girl élégante dans un jardin violet',
    summary:
      'Génère un portrait anime fantasy poli d’une femme élégante, cheveux brillants coiffés, tenue violet-noir et jardin floral magique.',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Profil / avatar - Portrait fantasy éthéré aux cheveux bleus',
    summary:
      'Génère un portrait anime fantasy doux et lumineux pour key art vertical élégant ou illustration de personnage aux cheveux fluides.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Profil / avatar - Portrait glamour d’une femme en noir',
    summary:
      'Génère un portrait luxe photoréaliste d’une femme élégante en tenue noire, idéal pour éditorial mode ou visuels beauté.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Profil / avatar - Prompts de texture selfie hyperréaliste',
    summary:
      'Snippets de prompt détaillés pour textures de peau réalistes et cadrage selfie smartphone authentique avec pores visibles et lumière naturelle.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Profil / avatar - Portrait de mage fantasy lavande',
    summary:
      'Génère un portrait anime fantasy poli d’une princesse mage élégante avec cheveux blonds, fleurs violettes et vêtements cristallins.',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Profil / avatar - Portrait studio monochrome',
    summary:
      'Prompt de photographie commerciale haut de gamme pour portrait monochrome, arrière-plan fortement divisé et lumière studio dramatique.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Profil / avatar - Restauration d’ancienne photo vers portrait DSLR',
    summary:
      'Restaure une photo familiale vintage endommagée de quatre personnes en portrait réaliste propre, colorisé et haute résolution.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Profil / avatar - Portrait poétique d’une femme au jardin',
    summary:
      'Génère un portrait éditorial réaliste d’une jeune femme lettrée dans un jardin ensoleillé, idéal pour lifestyle photography ou literary branding.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Profil / avatar - Fond d’écran portrait d’identité professionnelle',
    summary:
      'Génère un fond d’écran premium haute résolution avec une personne en tenue professionnelle, activités métiers et typographie.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Profil / avatar - Selfie IA réalistement imparfait',
    summary:
      'Prompt GPT-image-2 créatif pour un selfie “raté” qui ressemble à un instantané smartphone accidentel de basse qualité.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Profil / avatar - Portrait marker signé sur shikishi',
    summary:
      'Génère un portrait marker vivant et signé sur shikishi carré, pour fan art autographié et visuel de remerciement personnel.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Profil / avatar - Portrait d’impératrice lapin des neiges',
    summary:
      'Prompt de portrait fantasy réaliste d’une femme royale à motif lapin, en hanfu hivernal devant un temple de montagne enneigé.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Profil / avatar - Portrait hanfu avec masque lapin des neiges',
    summary:
      'Génère un portrait fantasy hivernal cinématique d’une femme masquée en hanfu blanc à motif lapin, idéal pour character art élégant.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Profil / avatar - Portrait hanfu lapin enneigé',
    summary:
      'Génère un portrait fantasy beauty ultradétaillé d’une femme aux oreilles de lapin en hanfu brodé, pour character art ou costume design.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Profil / avatar - Portrait d’esprit lapin enneigé',
    summary:
      'Génère un portrait fantasy calme d’une femme anonyme aux oreilles de lapin en hiver, idéal pour character art atmosphérique.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Profil / avatar - Portrait hanfu de la dynastie Song',
    summary:
      'Prompt optimisé pour portrait réaliste détaillé d’une beauté en hanfu traditionnel de la dynastie Song dans une cour antique.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Post réseaux sociaux - Teaser outfit anime dans un Pokémon shop',
    summary:
      'Génère un poster d’annonce fashion anime doux et pastel, avec visage flouté dans un Pokémon Store.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Post réseaux sociaux - Scène d’ascenseur cinématique',
    summary:
      'Prompt pour une scène sombre et cinématique d’une femme dans un ascenseur métallique, avec lumière et reflets réalistes.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Post réseaux sociaux - Elf girl confuse à un bureau pastel',
    summary:
      'Génère une illustration anime pastel douce d’une elf girl à l’ordinateur dans un workspace kawaii confortable.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Post réseaux sociaux - Photographie fashion éditoriale',
    summary:
      'Prompt atmosphérique centré fashion pour une scène studio minimaliste avec lumière douce et tons chauds.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Post réseaux sociaux - Collage fashion editorial',
    summary:
      'Prompt très détaillé de collage photo 2x2 pour prises fashion editorial, avec styling cohérent, lumière spécifique et visage de référence.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Post réseaux sociaux - Poster d’annonce de transfert PSG',
    summary:
      'Poster football professionnel et puissant pour annoncer la signature d’un joueur au Paris Saint-Germain.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Post réseaux sociaux - Couverture magazine rétro culture pour Showa Day',
    summary:
      'Page éditoriale chaleureuse sur une fête japonaise, avec character art anime, rue nostalgique de l’ère Showa et layout magazine.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Post réseaux sociaux - Génération d’outfits fashion',
    summary:
      'Prompt pour générer une semaine de recommandations d’outfits de fashion blogger à partir d’un profil personnage, avec labels et prix.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Post réseaux sociaux - Collage de snapshots de voyage',
    summary:
      'Prompt détaillé pour un collage nostalgique en 12 frames de photos de voyage solo façon smartphone.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Post réseaux sociaux - Croquis vintage de sign painter',
    summary:
      'Génère un croquis marker dessiné à la main sur papier, avec détails réalistes comme lignes graphite et saignement d’encre.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Poster vue éclatée d’un casque VR',
    summary:
      'Génère un diagramme high-tech en vue éclatée d’un casque VR, avec callouts détaillés de composants et texte promotionnel.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Garçon animé 3D construisant des Lego',
    summary:
      'Prompt vidéo multi-shot en style animation 3D décrivant un garçon qui assemble soigneusement des briques Lego dans une chambre, avec effets time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Une décennie de raffinement : glow-up',
    summary:
      'Prompt de transformation pour Seedance 2.0 montrant la transition d’un homme depuis un décor casual de 2016 vers un lifestyle luxueux à Dubaï en 2026.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Sauvetage par un ancien dragon gardien',
    summary:
      'Prompt cinématique multi-shot détaillé sur une fille dans un village pluvieux sauvée par un dragon émergent.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Vidéo FPV d’un ancien royaume indien',
    summary:
      'Prompt FPV drone rapide et cinématique montrant un royaume indien mystique avec temples et jungles.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt de transfert d’animation et de camera tracking',
    summary:
      'Prompt technique pour Seedance 2.0 appliquant une référence de mouvement précise à un personnage tout en conservant un camera tracking fixe.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Danse de transformation d’outfit synchronisée au beat',
    summary:
      'Prompt Seedance 2.0 qui fait danser un personnage depuis des breakdown frames et déclenche un changement d’outfit synchronisé au beat.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Séquence motion graphics d’introduction de personnage',
    summary:
      'Prompt motion graphics complexe en plusieurs étapes pour présenter une équipe de personnages avec overlays UI et transitions.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Séquence cinématique de fête d’anniversaire',
    summary:
      'Prompt vidéo multi-shot très détaillé pour une séquence d’anniversaire, avec focus sur cohérence des personnages et storytelling émotionnel.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Interaction cinématique avec dragon et envol',
    summary:
      'Prompt storyboard détaillé pour une vidéo avec interaction émotionnelle entre une femme et un dragon, suivie d’un vol cinématique.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Danse de mains cinématique d’une femme est-asiatique',
    summary:
      'Prompt vidéo cinématique multi-shot très détaillé pour une danse de mains stylisée avec instructions caméra et action time-coded.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Close-up facial émotionnel cinématique',
    summary:
      'Prompt technique Seedance 2.0 très détaillé centré sur textures de peau réalistes et transitions émotionnelles complexes du visage.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Exploration cinématique d’une biologiste marine',
    summary:
      'Prompt vidéo cinématique détaillé pour une scène sous-marine où une biologiste marine découvre une épave ancienne dans un récif corallien.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Podcast musical cinématique et technique guitare',
    summary:
      'Prompt cinématique avancé pour une vidéo podcast musical 4K, centrée sur technique guitare, pinch harmonics et esthétique studio.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Guide de navigation d’itinéraire cinématique',
    summary:
      'Prompt multi-scène structuré pour Seedance afin de créer une vidéo de navigation à pied cohérente avec guide récurrent.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Séquence street racing cinématique pour Seedance 2',
    summary:
      'Prompt multi-shot détaillé pour une séquence de street racing nocturne avec focus intense sur le pilote, caméra dynamique et accélération explosive.',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Séquence de combat vampire dans une ruelle',
    summary:
      'Prompt d’action complet pour une scène de court-métrage avec caméra dynamique et combat à grande vitesse dans une ruelle éclairée au néon.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Séquence cinématique sci-fi Crimson Horizon',
    summary:
      'Séquence filmique complète en 9 shots pour un film sci-fi nommé “Crimson Horizon”, du lancement de fusée à la rencontre alien inquiétante sur Mars.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Script de trailer de jeu cyberpunk',
    summary:
      'Prompt vidéo détaillé pour trailer de jeu cyberpunk avec character design, animations UI et transitions d’environnement du void blanc à la favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Satire avec chat dans la Cité interdite',
    summary:
      'Prompt dark comedy complexe pour Seedance 2.0 avec chat fonctionnaire orange et empereur hyène dans une scène satirique de dynastie Qing.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {},
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {},
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {},
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {},
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt vidéo fantasy haute couture hollywoodienne',
    summary:
      'Prompt vidéo multi-scène détaillé pour Seedance 2.0, conçu pour un film fantasy haute couture hollywoodien en esthétique 8K / Unreal Engine.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames : app showcase 12 secondes avec trois phones flottants',
    summary:
      'Composition app showcase 16:9 de 12 secondes — trois écrans iPhone flottent dans l’espace 3D, chacun tourne pour révéler une feature, avec label callouts beat-sync et end logo lockup. Bâti directement sur le bloc de catalogue HyperFrames `app-showcase`.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames : brand sizzle reel de 30 secondes',
    summary:
      'Sizzle reel HyperFrames 16:9 de 30 secondes — coupes rapides, typographie cinétique beat-sync, scale audio-réactif sur les mots display, transitions shader entre cinq scènes, end-card avec logo bloom. Modélisé sur l’archétype aisoc-hype du student kit.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames : bar chart race animé style NYT',
    summary:
      'Infographie data 16:9 de 12 secondes — bar chart et line chart animés avec reveal de catégories en stagger, headline serif façon NYT, footnote source, labels de valeur cinétiques. Bâti sur le bloc HyperFrames `data-chart`.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames : carte de vol style Apple (origin → destination)',
    summary:
      'Carte de route aérienne cinématique 16:9 de 8 secondes — zoom terrain réaliste, avion animé sur route courbe, villes labellisées, compteur de distance cinétique. Bâti sur le bloc HyperFrames `nyc-paris-flight`, réutilisable pour toute paire de villes.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames : logo outro cinématique de 4 secondes',
    summary:
      'Logo outro 16:9 de 4 secondes — construction progressive du wordmark avec bloom, shimmer sweep sur le lockup final, grain overlay doux, CTA en une ligne. Bâti sur les blocs HyperFrames `logo-outro`, `shimmer-sweep` et `grain-overlay`.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames : money counter hype $0 → $10K (9:16)',
    summary:
      'Clip hype vertical HyperFrames 1080×1920 de 6 secondes — compteur style Apple de $0 à $10,000 avec flash vert, particules money-burst, icône cash stack et kicker headline. Bâti sur le bloc HyperFrames `apple-money-count`.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames : product reveal minimal de 5 secondes',
    summary:
      'Composition HyperFrames de 5 secondes pour product reveal haut de gamme — canvas dark, accent chaud unique, push-in title-card lent, ligne kicker cinétique, mouvement retenu. L’agent rend le MP4 depuis HTML+GSAP via Puppeteer ; pas besoin de stock footage.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames : promo produit SaaS 30 secondes style Linear',
    summary:
      'Composition HyperFrames de 30 secondes inspirée des films produit Linear/ClickUp — reveals UI 3D, typographie cinétique beat-sync, screenshots UI animés, end-card avec logo outro. Construite avec blocs HF Catalog et transitions shader.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames : stack d’overlays sociaux 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      'Composition HyperFrames verticale 1080×1920 de 15 secondes empilant quatre cartes sociales animées sur un loop face-cam — post X, réaction Reddit, carte Spotify Now Playing, puis CTA Instagram follow.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames : talking head TikTok 9:16 avec sous-titres karaoke',
    summary:
      'Short vertical HyperFrames 1080×1920 — talking head narré en TTS sur loop face-cam, sous-titres mot-à-mot façon karaoke, lower third animé et overlay follow TikTok en fin.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames : pipeline website-to-video (marketing cut 15 secondes)',
    summary:
      'Composition HyperFrames 16:9 de 15 secondes qui capture un site live en trois tailles de viewport puis anime les scènes avec radial split chromatique.',
  },
  'hunched-character-animation': {
    title: 'Animation d’un personnage voûté',
    summary:
      'Instruction pour Seedance 2 afin de créer une animation de marche sur place à partir d’une référence de personnage précise.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Adaptation live-action anime : duel souffle eau vs tonnerre',
    summary:
      'Prompt 15 secondes très détaillé pour adaptation live-action d’un duel anime avec effets d’eau bleue et d’éclairs dorés.',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Narration cinématique de supercar de luxe',
    summary:
      'Prompt cinématique multi-shot très détaillé pour Seedance 2.0 avec homme stylé, dobermans et supercar vintage dans une scène de montagne brumeuse.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Séquence storyboard d’une académie magique',
    summary:
      'Prompt storyboard détaillé pour une séquence cinématique autour d’une magical girl dans une académie, de l’arrivée au duel magique.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Court-métrage healing en esthétique rural moderne',
    summary:
      'Prompt three-shot détaillé pour Seedance 2.0 produisant un court-métrage healing cinématique dans une esthétique rural moderne.',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Animation atmosphérique de flyer nightclub',
    summary:
      'Prompt d’animation subtil Seedance 2.0 qui donne vie aux éléments de fond et de lumière tout en gardant le sujet principal fixe.',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Esthétique film wuxia HK rétro',
    summary:
      'Prompt vidéo complexe en plusieurs parties recréant l’esthétique wuxia hongkongaise des années 80/90 avec transformation de chat en humain.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0 : court-métrage romance japonaise cinématique de 15 secondes',
    summary:
      'Prompt multi-scène 15 secondes très détaillé pour court-métrage romance high school japonais cinématique et ultraréaliste.',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0 : rappeuse de 80 ans en clip',
    summary:
      'Prompt 15 secondes détaillé pour un clip street rap horizontal 16:9 avec une femme de 80 ans et des tons néon violet/bleu froid.',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Instruction de séquence et mouvement pour vidéo d’arts martiaux',
    summary:
      'Prompt vidéo pour Seedance 2.0 animant une séquence à partir d’un character sheet et mettant l’accent sur mouvements et étapes spécifiques.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Séquence de magie miroir avec échange d’âmes',
    summary:
      'Prompt vidéo narratif sur un événement magique d’échange d’âmes devant un miroir, avec instructions caméra et cues émotionnels.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Jumpscare de grille-pain fusée',
    summary:
      'Prompt pour une vidéo home-video réaliste d’un vieil homme surpris lorsqu’un grille-pain lance du pain comme une fusée.',
  },
  'traditional-dance-performance': {
    title: 'Performance de danse traditionnelle',
    summary:
      'Prompt Seedance 2.0 complet pour une danse traditionnelle gracieuse basée sur des images de référence de chorégraphie et d’identité.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {},
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {},
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {},
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animation crocodile pirate style Disney vintage',
    summary:
      'Prompt narratif multi-scène pour animation classique vintage Disney avec crocodile pirate et oiseaux pirates sur un navire.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Chorégraphie K-pop virale',
    summary:
      'Prompt Seedance 2.0 détaillé faisant danser un personnage selon une chorégraphie basée sur un storyboard de référence en 16 panels.',
  },
  'wasteland-factory-chase': {
    title: 'Poursuite dans une usine wasteland',
    summary:
      'Prompt cinématique pour scène wasteland désertique à haute vitesse avec usine industrielle marchant sur jambes et poursuite en rebel bike.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Game UI - HUD MMO open-world Chine ancienne',
    summary:
      'Génère un mockup screenshot HUD in-game pour AAA open-world MMO en Chine ancienne, style photoréaliste cinématique Black Myth: Wukong, centré sur une épéiste dans une scène de montagne brumeuse avec HUD MMO complet.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Illustration - Rework dessin enfant au crayon',
    summary:
      'Prompt de style transfer qui transforme toute image de référence en illustration au crayon dessinée à la main comme par un enfant de 10 ans, avec palette lumineuse et décor enfantin.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Post réseaux sociaux - Storyboard danse d’une stylish girl (8 shots)',
    summary:
      'Set complet de prompts storyboard en 8 shots pour générer une séquence de danse cohérente, avec style tokens globaux, negative prompt réutilisable et huit plans individuels.',
  },
};
