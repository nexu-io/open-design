# Open Design

> **L’alternative open source à [Claude Design][cd].** Local-first, déployable sur le web, BYOK à chaque couche : vos CLI de coding agents détectées automatiquement dans le `PATH` deviennent le design engine, piloté par les catalogues de **Skills** et de **Design Systems** du repo. Aucune CLI ? Le proxy BYOK multi-provider exécute la même boucle, sans spawn local.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design : couverture éditoriale, design avec l’agent sur votre laptop" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ffd700&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=2ecc71&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/issues"><img alt="Issues" src="https://img.shields.io/github/issues/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ff6b6b&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=9b59b6&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=3498db&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=e67e22&logo=git&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=8e44ad&logo=git&logoColor=white" /></a>
</p>

<p align="center">
  <a href="https://open-design.ai/"><img alt="Télécharger" src="https://img.shields.io/badge/t%C3%A9l%C3%A9charger-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#coding-agents-pris-en-charge"><img alt="Agents" src="https://img.shields.io/badge/agents-CLI%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-systems"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-catalogue-orange?style=flat-square" /></a>
  <a href="#skills"><img alt="Skills" src="https://img.shields.io/badge/skills-catalogue-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-rejoindre-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.fr.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <b>Français</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## Pourquoi ce projet existe

[Claude Design][cd] d’Anthropic, lancé le 17 avril 2026 avec Opus 4.7, a montré ce qui se passe lorsqu’un LLM cesse de produire seulement du texte et commence à livrer des design artifacts. Le produit est devenu viral, tout en restant closed-source, paid-only, cloud-only et lié au modèle comme aux Skills d’Anthropic. Aucun checkout possible, aucun self-hosting, aucun déploiement Vercel, aucun remplacement par votre propre agent.

**Open Design (OD) est l’alternative open source.** Même boucle, même mental model artifact-first, sans lock-in. Nous ne livrons pas d’agent : les meilleurs coding agents vivent déjà sur votre machine. OD les branche sur un workflow de design piloté par des Skills, exécutable localement avec `pnpm tools-dev`, déployable sur Vercel côté web, avec BYOK à chaque couche.

Tapez `make me a magazine-style pitch deck for our seed round`. Le question form interactif apparaît avant que le modèle n’improvise le moindre pixel. L’agent choisit l’une des cinq directions visuelles soigneusement sélectionnées. Un plan `TodoWrite` live arrive dans l’UI. Le daemon crée un vrai dossier projet sur disque avec un seed template, une layout library et une checklist de self-check. L’agent les lit, le pre-flight est obligatoire, puis il lance une critique en cinq dimensions sur sa propre sortie et émet un seul `<artifact>`, rendu quelques secondes plus tard dans une iframe sandboxée.

Le résultat dépasse l’idée d’une IA qui tente simplement de faire du design. Le prompt stack pousse l’IA à se comporter comme un senior designer avec un vrai filesystem, une bibliothèque de palettes déterministe et une culture de checklist, au niveau fixé par Claude Design, en version ouverte et sous votre contrôle.

OD s’appuie sur quatre projets open source :

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design), la boussole de design philosophy. Le workflow Junior-Designer, le protocole en 5 étapes pour les assets de marque, la checklist anti-AI-slop, la self-critique en 5 dimensions et l’idée « 5 écoles × 20 philosophies design » derrière notre direction picker sont condensés dans [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill), le mode deck. Inclus tel quel sous [`skills/guizang-ppt/`](skills/guizang-ppt/), avec licence originale préservée ; layouts magazine, hero WebGL, checklists P0/P1/P2.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign), notre UX north star et le projet le plus proche. Nous reprenons sa streaming-artifact loop, son pattern de preview en iframe sandboxée (React 18 + Babel vendored), son live agent panel (todos + tool calls + génération interruptible) et ses cinq formats d’export (HTML / PDF / PPTX / ZIP / Markdown). Nous divergeons volontairement sur le format : ils livrent une app desktop Electron avec [`pi-ai`][piai] intégré ; nous sommes une web app + daemon local qui délègue à la CLI déjà installée chez vous.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica), l’architecture daemon et runtime. Détection des agents dans le `PATH`, daemon local comme seul processus privilégié, vision agent-as-teammate.

## En un coup d’œil

| | Ce que vous obtenez |
|---|---|
| **CLI de coding agents (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI, détectées automatiquement dans `PATH`, interchangeables en un clic |
| **BYOK fallback** | Proxy API par protocole sur `/api/proxy/{anthropic,openai,azure,google}/stream` : collez `baseUrl` + `apiKey` + `model`, choisissez Anthropic / OpenAI / Azure OpenAI / Google Gemini, et le daemon normalise le SSE vers le même chat stream. Les destinations internal IP / SSRF sont bloquées côté daemon. |
| **Design Systems intégrés** | Le menu déroulant charge les Design Systems depuis `design-systems/*/DESIGN.md` : starters écrits à la main, product systems importés depuis [`awesome-design-md`][acd2] et design skills normalisés depuis [`awesome-design-skills`][ads]. |
| **Skills intégrés** | Le picker charge les Skills depuis `skills/*/SKILL.md` et les regroupe par `mode` / `scenario` : prototype, deck, image, video, audio, Design System, utility, puis notamment design / marketing / operations / engineering / product / finance / hr / sales / personal. |
| **Génération média** | Les surfaces image, vidéo et audio sont livrées avec la design loop. **gpt-image-2** (Azure / OpenAI) pour posters, avatars, infographies et cartes illustrées ; **Seedance 2.0** (ByteDance) pour du text-to-video et image-to-video cinématique de 15 s ; **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) pour des motion graphics HTML→MP4. La galerie [`prompt-templates/`](prompt-templates/) fournit des prompts prêts à reproduire, avec thumbnails et attribution. Même surface de chat que le code ; les sorties deviennent de vrais fichiers `.mp4` / `.png` dans le workspace du projet. |
| **Directions visuelles** | 5 écoles soigneusement sélectionnées (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental), chacune avec palette OKLch déterministe + font stack ([`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)) |
| **Frames d’appareils** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome, pixel-accurate et partagés entre Skills sous [`assets/frames/`](assets/frames/) |
| **Agent runtime** | Le daemon local lance la CLI dans le dossier projet. L’agent reçoit de vrais `Read`, `Write`, `Bash`, `WebFetch` sur un environnement disque réel, avec fallback Windows `ENAMETOOLONG` (stdin / prompt-file) sur chaque adapter |
| **Imports** | Déposez un ZIP exporté depuis [Claude Design][cd] dans le welcome dialog : `POST /api/import/claude-design` le convertit en vrai projet pour que votre agent continue là où Anthropic s’est arrêté |
| **Persistance** | SQLite dans `.od/app.sqlite` : projects · conversations · messages · tabs · saved templates. Rouvrez demain, la todo card et les fichiers ouverts sont au même endroit. |
| **Lifecycle** | Un seul point d’entrée : `pnpm tools-dev` (start / stop / run / status / logs / inspect / check), qui démarre daemon + web (+ desktop) avec des typed sidecar stamps |
| **Desktop** | Shell Electron optionnel avec renderer sandboxé + sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN), utilisé par `tools-dev inspect desktop screenshot` pour l’E2E |
| **Déployable sur** | Local (`pnpm tools-dev`) · couche web Vercel · application desktop Electron empaquetée pour macOS (Apple Silicon) et Windows (x64) — téléchargement sur [open-design.ai](https://open-design.ai/) ou la [dernière release](https://github.com/nexu-io/open-design/releases) |
| **Licence** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## Démo

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Vue d’entrée" /><br/>
<sub><b>Vue d’entrée</b> : choisissez un Skill, un Design System, puis saisissez le brief. La même surface sert aux prototypes, decks, apps mobiles, dashboards et pages éditoriales.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Question form de découverte du premier tour" /><br/>
<sub><b>Question form de découverte</b> : avant que le modèle n’écrive un pixel, OD verrouille le brief : surface, audience, ton, contexte de marque, échelle. 30 secondes de boutons radio valent mieux que 30 minutes d’allers-retours.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Sélecteur de direction" /><br/>
<sub><b>Direction picker</b> : quand l’utilisateur n’a pas de marque, l’agent émet un second formulaire avec 5 directions soigneusement sélectionnées. Un clic radio → palette + font stack déterministes, sans freestyle du modèle.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Progression todo live" /><br/>
<sub><b>Progression todo live</b> : le plan de l’agent arrive comme carte live. Les états <code>in_progress</code> → <code>completed</code> se mettent à jour en temps réel. L’utilisateur peut corriger le tir à faible coût pendant le travail.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Preview sandboxée" /><br/>
<sub><b>Preview sandboxée</b> : chaque <code>&lt;artifact&gt;</code> est rendu dans une iframe srcdoc propre. Modifiable sur place via le file workspace ; téléchargeable en HTML, PDF, ZIP.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · Bibliothèque de Design Systems" /><br/>
<sub><b>Bibliothèque de Design Systems</b> : chaque product system montre sa signature en 4 couleurs. Cliquez pour le <code>DESIGN.md</code> complet, la grille de swatches et le showcase live.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Deck magazine" /><br/>
<sub><b>Mode deck (guizang-ppt)</b> : le <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> inclus fonctionne tel quel. Layouts magazine, arrière-plans hero WebGL, sortie HTML single-file, export PDF.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Prototype mobile" /><br/>
<sub><b>Prototype mobile</b> : chrome iPhone 15 Pro pixel-accurate (Dynamic Island, SVGs de status bar, home indicator). Les prototypes multi-écrans utilisent les assets partagés <code>/frames/</code>.</sub>
</td>
</tr>
</table>

## Skills

Les Skills livrés avec le repo sont des dossiers sous [`skills/`](skills/) suivant la convention [`SKILL.md`][skill] de Claude Code, avec un frontmatter `od:` étendu que le daemon lit tel quel : `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Le champ **`mode`** structure le catalogue (`prototype`, `deck`, `image`, `video`, `audio`, `design-system`, `utility`, etc.). Le champ **`scenario`** sert au regroupement dans le picker, avec des labels comme `design` · `marketing` · `operations` · `engineering` · `product` · `finance` · `hr` · `sales` · `personal`, et d’autres selon les Skills.

### Exemples showcase

Les Skills visuellement distinctifs que vous lancerez probablement en premier. Chacun livre un vrai `example.html` que vous pouvez ouvrir depuis le repo pour voir ce que l’agent produira, sans auth ni setup.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Dashboard consumer dating / matchmaking : navigation gauche, ticker bar, KPIs, graphique de mutual matches sur 30 jours, typographie éditoriale.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>E-guide numérique en deux spreads : couverture (titre, auteur, teaser de sommaire) + page de leçon avec pull-quote et étapes. Ton creator / lifestyle.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>Email HTML de lancement produit : masthead, image hero, bloc titre, CTA, grille de specs. Colonne unique centrée, compatible fallback table.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Prototype mobile gamifié en trois frames sur scène sombre : cover, quêtes du jour avec rubans XP + barre de niveau, détail de quête.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Onboarding mobile en trois frames : splash, value prop, sign-in. Status bar, dots de swipe, CTA principal.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Hero motion-design single-frame avec animations CSS en boucle : anneau typo rotatif, globe animé, timer. Prêt pour handoff HyperFrames.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Carousel social 1080×1080 en trois cartes : panneaux cinématiques avec titres display liés entre eux, marque, affordance de boucle.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Slide explicative pixel / 8-bit animée : scène crème plein cadre, mascotte pixel animée, typographie display japonaise cinétique, keyframes CSS en boucle.</sub>
</td>
</tr>
</table>

### Surfaces design & marketing (mode prototype)

| Skill | Plateforme | Scénario | Produit |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | HTML single-page : landings, marketing, hero pages (défaut pour prototype) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Layout marketing hero / features / pricing / CTA |
| [`dashboard`](skills/dashboard/) | desktop | operations | Admin / analytics avec sidebar + data dense |
| [`pricing-page`](skills/pricing-page/) | desktop | sales | Page pricing autonome + tableaux de comparaison |
| [`docs-page`](skills/docs-page/) | desktop | engineering | Documentation en 3 colonnes |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Long-form éditorial |
| [`mobile-app`](skills/mobile-app/) | mobile | design | Écran(s) app dans frame iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Flow onboarding mobile multi-écrans (splash · value-prop · sign-in) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Prototype mobile gamifié en trois frames |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | Email HTML de lancement produit (table-fallback safe) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | Carousel social 1080×1080 en 3 cartes |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Poster single-page style magazine |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Hero motion-design avec animations CSS en boucle |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Slide explicative pixel / 8-bit animée |
| [`dating-web`](skills/dating-web/) | desktop | personal | Mockup dashboard dating consumer |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | E-guide en deux spreads (couverture + leçon) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Sketch d’idéation dessiné à la main pour montrer quelque chose tôt |
| [`critique`](skills/critique/) | desktop | design | Scorecard de self-critique en cinq dimensions (Philosophie · Hiérarchie · Détail · Fonction · Innovation) |
| [`tweaks`](skills/tweaks/) | desktop | design | Panneau d’ajustements émis par l’IA, où le modèle expose les paramètres à retoucher |

### Surfaces deck (mode deck)

| Skill | Défaut pour | Produit |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **défaut** pour deck | PPT web style magazine, inclus tel quel depuis [op7418/guizang-ppt-skill][guizang] |
| [`simple-deck`](skills/simple-deck/) | n/a | Deck HTML minimal à swipe horizontal |
| [`replit-deck`](skills/replit-deck/) | n/a | Deck walkthrough produit (style Replit) |
| [`weekly-update`](skills/weekly-update/) | n/a | Cadence weekly d’équipe en deck swipe (progress · blockers · next) |

### Surfaces office & opérations

| Skill | Scénario | Produit |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | Spec PM avec table des matières + decision log |
| [`team-okrs`](skills/team-okrs/) | product | Scorecard OKR |
| [`meeting-notes`](skills/meeting-notes/) | operations | Notes de réunion et decision log |
| [`kanban-board`](skills/kanban-board/) | operations | Snapshot de board |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Runbook d’incident |
| [`finance-report`](skills/finance-report/) | finance | Résumé finance exécutif |
| [`invoice`](skills/invoice/) | finance | Facture single-page |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | Plan d’onboarding par rôle |

Ajouter un Skill revient à ajouter un dossier. Lisez [`docs/skills-protocol.md`](docs/skills-protocol.md) pour le frontmatter `od:` étendu, forkez un Skill existant, redémarrez le daemon, il apparaît dans le picker. L’endpoint catalogue est `GET /api/skills`; l’assemblage seed par Skill est exposé par `GET /api/skills/:id/example`.

## Six idées structurantes

### 1 · Nous ne livrons pas d’agent. Le vôtre suffit.

Au démarrage, le daemon scanne votre `PATH` avec les définitions de [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) : Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro CLI, Mistral Vibe CLI et les adapters ajoutés plus tard. Ceux qu’il trouve deviennent des design engines candidats, pilotés via stdio avec un adapter par CLI et interchangeables depuis le model picker. Inspiré par [`multica`](https://github.com/multica-ai/multica) et [`cc-switch`](https://github.com/farion1231/cc-switch). Aucune CLI installée ? Le mode API suit la même pipeline, sans spawn local : choisissez Anthropic, OpenAI-compatible, Azure OpenAI ou Google Gemini, et le daemon renvoie les chunks SSE normalisés, avec rejet des destinations loopback / link-local / RFC1918.

### 2 · Les Skills sont des fichiers, pas des plugins.

Selon la convention [`SKILL.md`](https://docs.anthropic.com/en/docs/claude-code/skills) de Claude Code, un Skill est au minimum un `SKILL.md` ; `assets/` et `references/` sont des side files optionnels. Déposez un dossier dans [`skills/`](skills/), redémarrez le daemon, il apparaît dans le picker. Le `magazine-web-ppt` inclus est [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) committé tel quel, avec licence originale et attribution préservées.

### 3 · Les Design Systems sont du Markdown portable, pas du JSON de thème.

Le schéma `DESIGN.md` en 9 sections vient de [`VoltAgent/awesome-design-md`][acd2] : color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. Chaque artifact lit le Design System actif. Changez de Design System, le prochain rendu utilise les nouveaux tokens. Le menu déroulant charge les dossiers `design-systems/*/DESIGN.md` : **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…**, ainsi que des design skills normalisés depuis [`awesome-design-skills`][ads].

### 4 · Le question form évite 80 % des allers-retours.

Le prompt stack d’OD impose `RULE 1` : tout nouveau design brief commence par un `<question-form id="discovery">` au lieu de code. Surface · audience · tone · brand context · scale · contraintes. Même un long brief laisse des décisions design ouvertes, comme le ton visuel, la posture couleur ou l’échelle ; le formulaire les verrouille en 30 secondes. Une mauvaise direction coûte un tour de chat, pas un deck terminé.

C’est le **mode Junior-Designer** tiré de [`huashu-design`](https://github.com/alchaincyf/huashu-design) : poser les questions dès le départ, montrer vite quelque chose de visible, même un wireframe en blocs gris, et permettre à l’utilisateur de corriger le tir à faible coût. Combiné au protocole brand-asset (locate · download · `grep` hex · write `brand-spec.md` · vocalise), c’est la raison principale pour laquelle la sortie cesse de ressembler à du freestyle IA et commence à ressembler à un designer qui a observé avant de peindre.

### 5 · Le daemon donne l’impression que l’agent est sur votre laptop, parce qu’il l’est.

Le daemon lance la CLI avec `cwd` pointant vers le dossier artifact du projet sous `.od/projects/<id>/`. L’agent reçoit `Read`, `Write`, `Bash`, `WebFetch`, de vrais outils sur un vrai filesystem. Il peut lire le `assets/template.html` du skill, chercher les valeurs hex dans votre CSS, écrire `brand-spec.md`, déposer des images générées, produire des `.pptx` / `.zip` / `.pdf` qui apparaissent dans le workspace comme download chips à la fin du tour. Sessions, conversations, messages et tabs persistent dans une DB SQLite locale : rouvrez le projet demain, la todo card de l’agent est encore là.

### 6 · Le prompt stack est le produit.

À l’envoi, OD compose plusieurs couches :

```text
DISCOVERY directives  (formulaire tour 1, branche marque tour 2, TodoWrite, critique 5 dimensions)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (catalogue Design Systems)
  + active SKILL.md    (catalogue Skills)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (pre-flight auto-injecté : lire assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

Chaque couche est composable. Chaque couche est un fichier éditable. Lisez [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) et [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) pour voir le contrat réel.

## Architecture

```text
┌────────────────────── browser (Next.js 16) ──────────────────────┐
│  chat · file workspace · iframe preview · settings · imports     │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ /api/* (rewritten in dev)          │
               ▼                                    ▼
   ┌──────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  Local daemon (Express + SQLite) │   ─→ provider-specific APIs
   │                                  │       (BYOK)
   │  /api/agents          /api/skills│       w/ SSRF blocking
   │  /api/design-systems  /api/projects/…
   │  /api/chat (SSE)      /api/proxy/{provider}/stream (SSE)
   │  /api/templates       /api/import/claude-design
   │  /api/artifacts/save  /api/artifacts/lint
   │  /api/upload          /api/projects/:id/files…
   │  /artifacts (static)  /frames (static)
   │
   │  optional: sidecar IPC at /tmp/open-design/ipc/<ns>/<app>.sock
   │  (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN)
   └─────────┬────────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · devin (ACP) · gemini · opencode · cursor-agent │
   │  qwen · qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro · vibe (ACP) │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk            │
   └──────────────────────────────────────────────────────────────────┘
```

| Couche | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, déployable sur Vercel |
| Daemon | Node 24 · Express · streaming SSE · `better-sqlite3`; tables `projects` · `conversations` · `messages` · `tabs` · `templates` |
| Transport agent | `child_process.spawn`; parseurs typed-event pour `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream`, `acp-json-rpc`, `pi-rpc`, `plain` |
| Proxy BYOK | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → APIs provider-specific, SSE normalisé `delta/end/error` ; rejet loopback / link-local / RFC1918 au bord du daemon |
| Stockage | Fichiers simples dans `.od/projects/<id>/` + SQLite dans `.od/app.sqlite` (gitignored, auto-créé). `OD_DATA_DIR` permet l’isolation des tests |
| Aperçu | Iframe sandboxée via `srcdoc` + parser `<artifact>` par Skill ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Export | HTML (assets inline) · PDF (browser print, deck-aware) · PPTX (piloté par agent via Skill) · ZIP (archiver) · Markdown |
| Lifecycle | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; ports via `--daemon-port` / `--web-port`, namespaces via `--namespace` |
| Desktop (optionnel) | Shell Electron, découvre l’URL web par sidecar IPC, sans deviner le port ; le même canal `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` alimente `tools-dev inspect desktop …` pour l’E2E |

## Quickstart

### Télécharger l'application desktop (aucun build requis)

Le moyen le plus rapide d'essayer Open Design est l'application desktop préconstruite — pas de Node, pas de pnpm, pas de clone :

- **[open-design.ai](https://open-design.ai/)** — page de téléchargement officielle
- **[Releases GitHub](https://github.com/nexu-io/open-design/releases)**

### Exécuter depuis les sources

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # should print 10.33.2
pnpm install
pnpm tools-dev run web
# open the web URL printed by tools-dev
```

Prérequis : Node `~24` et pnpm `10.33.x`. `nvm` / `fnm` ne sont que des aides facultatives ; si vous en utilisez un, lancez `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` avant `pnpm install`.

Pour le démarrage desktop/background, les redémarrages sur ports fixes et les checks du dispatcher de génération média (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`), voir [`QUICKSTART.fr.md`](QUICKSTART.fr.md).

Au premier chargement :

1. OD détecte les CLI d’agents présentes dans votre `PATH` et en choisit une automatiquement.
2. Il charge les catalogues Skills + Design Systems depuis les dossiers du repo.
3. Il affiche le welcome dialog pour configurer une clé API, nécessaire seulement pour le fallback BYOK.
4. Il **crée automatiquement `./.od/`**, le dossier runtime local pour la DB SQLite, les artifacts par projet et les rendus enregistrés. Pas d’étape `od init` ; le daemon crée ce dont il a besoin au boot.

Tapez un prompt, cliquez **Send**, regardez le formulaire arriver, remplissez-le, puis suivez la todo card et le rendu de l’artifact. Cliquez **Save to disk** ou téléchargez le projet en ZIP.

### État premier lancement (`./.od/`)

Le daemon possède un dossier caché à la racine du repo. Tout son contenu est gitignored et local à votre machine, ne le committez jamais.

```text
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── media-config.json          ← credentials média / BYOK
├── artifacts/                 ← rendus ponctuels "Save to disk" (horodatés)
└── projects/<id>/             ← dossier de travail par projet, aussi cwd de l’agent
```

| Besoin | Action |
|---|---|
| Inspecter ce qu’il contient | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Repartir de zéro | `pnpm tools-dev stop`, `rm -rf .od`, relancer `pnpm tools-dev run web` |
| Déplacer toutes les données daemon | lancer avec `OD_DATA_DIR=<dir>` ; utilisez `OD_MEDIA_CONFIG_DIR=<dir>` si vous voulez seulement déplacer `media-config.json` |

Carte complète des fichiers, scripts et dépannage → [`QUICKSTART.fr.md`](QUICKSTART.fr.md).

## Structure du dépôt

```text
open-design/
├── README.md                      ← English
├── README.de.md                   ← Deutsch
├── README.zh-CN.md                ← 简体中文
├── README.zh-TW.md                ← 繁體中文
├── README.ko.md                   ← 한국어
├── README.ja-JP.md                ← 日本語
├── README.fr.md                   ← ce fichier
├── QUICKSTART.fr.md               ← guide run / build / deploy
├── package.json                   ← workspace pnpm, bin unique : od
│
├── apps/
│   ├── daemon/                    ← Node + Express, seul serveur
│   │   ├── src/                   ← source TypeScript du daemon
│   │   │   ├── cli.ts             ← source du bin `od`, compilé vers dist/cli.js
│   │   │   ├── server.ts          ← routes /api/* (projects, chat, files, exports)
│   │   │   ├── agents.ts          ← PATH scanner + argv builders par CLI
│   │   │   ├── claude-stream.ts   ← parser JSON streaming pour stdout Claude Code
│   │   │   ├── skills.ts          ← loader du frontmatter SKILL.md
│   │   │   └── db.ts              ← schéma SQLite (projects/messages/templates/tabs)
│   │   ├── sidecar/               ← wrapper tools-dev du daemon sidecar
│   │   └── tests/                 ← tests du package daemon
│   │
│   └── web/                       ← Next.js 16 App Router + client React
│       ├── app/                   ← entrypoints App Router
│       ├── next.config.ts         ← rewrites dev + export statique prod vers out/
│       └── src/                   ← modules client React + TypeScript
│           ├── App.tsx            ← routing, bootstrap, settings
│           ├── components/        ← chat, composer, picker, preview, sketch, …
│           ├── prompts/
│           │   ├── system.ts      ← composeSystemPrompt(base, skill, DS, metadata)
│           │   ├── discovery.ts   ← turn-1 form + turn-2 branch + critique 5 dimensions
│           │   └── directions.ts  ← 5 visual directions × palette OKLch + font stack
│           ├── artifacts/         ← parser streaming <artifact> + manifests
│           ├── runtime/           ← iframe srcdoc, markdown, helpers d’export
│           ├── providers/         ← transports daemon SSE + BYOK API
│           └── state/             ← config + projects (localStorage + daemon-backed)
│
├── e2e/                           ← Playwright UI + harness Vitest / intégration externe
│
├── packages/
│   ├── contracts/                 ← contrats app partagés web/daemon
│   ├── sidecar-proto/             ← contrat du sidecar protocol Open Design
│   ├── sidecar/                   ← primitives runtime sidecar génériques
│   └── platform/                  ← primitives process/platform génériques
│
├── skills/                        ← bundles SKILL.md chargés par le daemon
│   ├── web-prototype/             ← défaut pour le mode prototype
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← mode deck
│   └── guizang-ppt/               ← magazine-web-ppt intégré (défaut pour deck)
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← catalogues DESIGN.md chargés par le daemon
│   ├── default/                   ← Neutral Modern (starter)
│   ├── warm-editorial/            ← Warm Editorial (starter)
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md                  ← aperçu du catalogue
│
├── assets/
│   └── frames/                    ← device frames partagées entre Skills
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   ├── deck-framework.html        ← base deck (nav / counter / print)
│   └── kami-deck.html             ← starter deck façon kami (parchemin / serif ink-blue)
│
├── scripts/
│   └── sync-design-systems.ts     ← réimporte le tarball upstream awesome-design-md
│
├── docs/
│   ├── spec.md                    ← product spec, scenarios, différenciation
│   ├── architecture.md            ← topologies, data flow, composants
│   ├── skills-protocol.md         ← frontmatter od: étendu pour SKILL.md
│   ├── agent-adapters.md          ← détection + dispatch par CLI
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← provenance longue
│   ├── roadmap.md                 ← livraison par phases
│   ├── schemas/                   ← JSON schemas
│   └── examples/                  ← exemples d’artifacts canoniques
│
└── .od/                           ← runtime data, gitignored, auto-créé
    ├── app.sqlite                 ← projects / conversations / messages / tabs
    ├── projects/<id>/             ← dossier de travail par projet, aussi cwd de l’agent
    └── artifacts/                 ← rendus ponctuels Save to disk
```

## Design Systems

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="Bibliothèque de Design Systems : style guide spread" width="100%" />
</p>

Les Design Systems livrés avec le repo sont chargés depuis [`design-systems/*/DESIGN.md`](design-systems/README.md) :

<details>
<summary><b>Exemples du catalogue</b> (cliquer pour ouvrir)</summary>

**AI & LLM** : `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Developer Tools** : `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Productivity** : `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** : `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E-Commerce** : `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Media** : `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Automotive** : `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Other** : `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**Starters** : `default` (Neutral Modern) · `warm-editorial`

</details>

La bibliothèque de product systems est importée depuis [`VoltAgent/awesome-design-md`][acd2] via [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). Relancez ce script pour rafraîchir le catalogue. Les design skills issus de [`bergside/awesome-design-skills`][ads] sont ajoutés directement dans `design-systems/`.

## Directions visuelles

Quand l’utilisateur n’a pas de brand spec, l’agent émet un second formulaire avec cinq directions soigneusement sélectionnées, l’adaptation OD du fallback « 5 schools × 20 design philosophies » de [`huashu-design`](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback). Chaque direction est une spec déterministe : palette OKLch, font stack, posture layout, références, que l’agent injecte tel quel dans le `:root` du seed template. Un clic radio → système visuel entièrement spécifié. Pas d’improvisation, pas d’AI-slop.

| Direction | Mood | Références |
|---|---|---|
| Editorial · Monocle / FT | Magazine imprimé, encre + crème + rouille chaude | Monocle · FT Weekend · NYT Magazine |
| Modern minimal · Linear / Vercel | Froid, structuré, accent minimal | Linear · Vercel · Stripe |
| Tech utility | Densité d’information, monospace, terminal | Bloomberg · Bauhaus tools |
| Brutalist | Brut, typographie oversized, pas d’ombres, accents durs | Bloomberg Businessweek · Achtung |
| Soft warm | Généreux, faible contraste, neutres pêche | Notion marketing · Apple Health |

Spec complète → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts).

## Génération média

OD ne s’arrête pas au code. La même surface de chat qui produit du HTML `<artifact>` pilote aussi la génération **image**, **vidéo** et **audio**, avec des adapters modèle reliés à la pipeline média du daemon ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Chaque rendu arrive comme vrai fichier dans le workspace projet, `.png` pour l’image, `.mp4` pour la vidéo, et apparaît comme chip de téléchargement à la fin du tour.

Trois familles de modèles portent la charge aujourd’hui :

| Surface | Modèle | Fournisseur | Usage |
|---|---|---|---|
| **Image** | `gpt-image-2` | Azure / OpenAI | Posters, avatars, cartes illustrées, infographies, social cards style magazine, restauration photo, art produit éclaté |
| **Vidéo** | `seedance-2.0` | ByteDance Volcengine | t2v + i2v cinématique de 15 s avec audio, shorts narratifs, close-ups personnage, films produit, chorégraphies MV |
| **Vidéo** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | Motion graphics HTML→MP4, product reveals, typographie cinétique, data charts, overlays sociaux, logo outros, verticaux TikTok avec captions karaoke |

Une **galerie de prompts** sous [`prompt-templates/`](prompt-templates/) livre des prompts prêts à reproduire pour les surfaces image et vidéo. Chaque entrée contient un thumbnail, le prompt body exact, le modèle cible, le ratio d’aspect et un bloc `source` pour licence + attribution. Le daemon les sert via `GET /api/prompt-templates`, et la web app les expose comme grille de cartes dans les onglets **Image templates** et **Video templates**.

### gpt-image-2 · galerie image (échantillon)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>Infographie évolution en escalier de pierre 3D</b><br/>Infographie 3 étapes, esthétique pierre taillée</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Carte culinaire urbaine illustrée</b><br/>Poster de voyage éditorial dessiné à la main</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Scène d’ascenseur cinématique</b><br/>Still mode éditorial single-frame</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Portrait anime cyberpunk</b><br/>Avatar profil, texte néon sur le visage</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Portrait glamour en noir</b><br/>Portrait studio éditorial</sub></td>
</tr>
</table>

Set complet → [`prompt-templates/image/`](prompt-templates/image/). Sources : la plupart viennent de [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0), avec attribution auteur conservée par template.

### Seedance 2.0 · galerie vidéo (échantillon de 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Podcast musique & technique guitare</b><br/>Film studio cinématique 4K</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Close-up émotionnel</b><br/>Étude cinématique de micro-expression</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Supercar de luxe cinématique</b><br/>Film produit narratif</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Satire à la Cité interdite</b><br/>Court stylisé satirique</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Court métrage romance japonaise</b><br/>Narration Seedance 2.0 de 15 s</sub></td>
</tr>
</table>

Cliquez sur un thumbnail pour lire le MP4 rendu. Set complet → [`prompt-templates/video/`](prompt-templates/video/). Sources : [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0), avec liens tweets originaux et handles auteurs conservés.

### HyperFrames · motion graphics HTML→MP4 (11 templates prêts à reproduire)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) est le framework vidéo open source agent-native de HeyGen : vous, ou l’agent, écrivez HTML + CSS + GSAP, HyperFrames rend un MP4 déterministe via Chrome headless + FFmpeg. Open Design le livre comme modèle vidéo de première classe (`hyperframes-html`) relié au dispatch daemon, plus le skill `skills/hyperframes/` qui enseigne à l’agent le contrat de timeline, les transitions de scènes, les patterns audio-réactifs, captions/TTS et les catalog blocks (`npx hyperframes add <slug>`).

Onze prompts hyperframes sont fournis sous [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/), chacun comme brief concret pour un archétype précis :

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>Product reveal minimal 5 s</b> · 16:9 · title card push-in avec transition shader</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>Promo produit SaaS 30 s</b> · 16:9 · style Linear/ClickUp avec reveals UI 3D</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>Talking-head TikTok karaoke</b> · 9:16 · TTS + captions synchronisées mot à mot</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>Brand sizzle reel 30 s</b> · 16:9 · typographie cinétique beat-sync, audio-réactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>Bar-chart race animé</b> · 16:9 · infographie data style NYT</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Carte de vol (origine → destination)</b> · 16:9 · reveal de route cinématique style Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>Logo outro cinématique 4 s</b> · 16:9 · assemblage progressif + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>Compteur $0 → $10K</b> · 9:16 · hype style Apple avec flash vert + burst</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>Showcase app 3 phones</b> · 16:9 · téléphones flottants avec callouts feature</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>Stack d’overlays sociaux</b> · 9:16 · X · Reddit · Spotify · Instagram en séquence</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Pipeline website-to-video</b> · 16:9 · capture le site en 3 viewports + transitions</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

Le pattern reste le même : choisissez un template, éditez le brief, envoyez. L’agent lit le `skills/hyperframes/SKILL.md` intégré, écrit la composition et livre un MP4. Les thumbnails de catalog blocks sont © HeyGen, servis depuis leur CDN ; le framework OSS est Apache-2.0.

> **Déjà câblés mais pas encore exposés comme templates :** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (via Fal), MiniMax video-01, tous dans `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Les modèles audio sont catalogués, mais l’UI audio intégrée expose aujourd’hui les providers speech pris en charge, comme MiniMax et FishAudio. La galerie de templates reste image / vidéo : ajoutez un JSON dans `prompt-templates/video/` pour le faire apparaître dans le picker vidéo.

## Au-delà du chat

La boucle chat / artifact est la plus visible, mais plusieurs capacités moins exposées sont déjà câblées :

- **Import ZIP Claude Design.** Déposez un export de claude.ai sur le welcome dialog. `POST /api/import/claude-design` l’extrait dans un vrai `.od/projects/<id>/`, ouvre le fichier d’entrée en tab et prépare un prompt pour continuer là où Anthropic s’est arrêté.
- **Proxy BYOK multi-provider.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` prend `{ baseUrl, apiKey, model, messages }`, construit la requête upstream propre au provider, normalise les chunks SSE vers `delta/end/error` et rejette les destinations loopback / link-local / RFC1918 pour prévenir SSRF.
- **Templates utilisateur.** Une fois un rendu validé, `POST /api/templates` prend un snapshot du HTML + metadata dans la table SQLite `templates`. Le projet suivant peut le choisir depuis une ligne « your templates ».
- **Persistance des tabs.** Chaque projet mémorise ses fichiers ouverts et son onglet actif dans la table `tabs`.
- **Artifact lint API.** `POST /api/artifacts/lint` exécute des checks structurels sur un artifact généré et renvoie des findings que l’agent peut relire au tour suivant.
- **Sidecar protocol + automation desktop.** Les processus daemon, web et desktop portent des stamps typés à cinq champs (`app · mode · namespace · ipc · source`) et exposent un canal JSON-RPC IPC sous `/tmp/open-design/ipc/<namespace>/<app>.sock`.
- **Spawning compatible Windows.** Les adapters qui dépasseraient la limite argv de `CreateProcess` envoient le prompt via stdin ; le daemon retombe sur un fichier prompt temporaire si besoin.
- **Runtime data par namespace.** `OD_DATA_DIR` et `--namespace` donnent des arbres `.od/` isolés, pour que Playwright, les canaux beta et vos vrais projets ne partagent jamais le même SQLite.

## Anti-AI-slop machinery

Tout le mécanisme ci-dessous est le playbook [`huashu-design`](https://github.com/alchaincyf/huashu-design), porté dans le prompt-stack d'OD et rendu vérifiable par Skill via le pre-flight des side files. Lisez [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) pour le texte actuel :

- **Question form first.** Le tour 1 est seulement `<question-form>`, sans thinking, outils ni narration. L’utilisateur choisit des valeurs par défaut à la vitesse de boutons radio.
- **Brand-spec extraction.** Quand l’utilisateur attache un screenshot ou une URL, l’agent suit un protocole en cinq étapes (locate · download · grep hex · codify `brand-spec.md` · vocalise) avant d’écrire du CSS. **Il ne devine jamais les couleurs de marque depuis la mémoire.**
- **Critique 5 dimensions.** Avant d’émettre `<artifact>`, l’agent attribue silencieusement un score à sa sortie de 1 à 5 sur philosophie / hiérarchie / exécution / spécificité / retenue. Tout score sous 3/5 est une régression : il faut corriger puis évaluer à nouveau.
- **Checklist P0/P1/P2.** Les Skills qui fournissent des side files peuvent inclure un `references/checklist.md` avec des P0 gates strictes. L’agent doit passer P0 avant d’émettre quand cette checklist existe.
- **Slop blacklist.** Gradients violets agressifs, icônes emoji génériques, cartes arrondies avec accent left-border, humains SVG dessinés à la main, Inter comme display face, métriques inventées : explicitement interdits dans le prompt.
- **Placeholders honnêtes > fausses stats.** Quand l’agent n’a pas de vrai chiffre, il écrit `N/A` ou un bloc gris libellé, pas « 10× faster ».

## Comparaison

| Axe | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Licence | Fermé | MIT | **Apache-2.0** |
| Format | Web (claude.ai) | Desktop (Electron) | **Web app + daemon local** |
| Déployable sur Vercel | ❌ | ❌ | **✅** |
| Runtime agent | Intégré (Opus 4.7) | Intégré ([`pi-ai`][piai]) | **Délégué à la CLI existante de l’utilisateur** |
| Skills | Propriétaires | 12 modules TS custom + `SKILL.md` | **Bundles [`SKILL.md`][skill] file-based, droppables** |
| Design System | Propriétaire | `DESIGN.md` (roadmap v0.2) | **Catalogue `DESIGN.md` chargé depuis `design-systems/`** |
| Flexibilité fournisseur | Anthropic seulement | 7+ via [`pi-ai`][piai] | **CLI adapters + proxy BYOK multi-provider** |
| Formulaire initial | ❌ | ❌ | **✅ Règle dure, tour 1** |
| Direction picker | ❌ | ❌ | **✅ 5 directions déterministes** |
| Todo progress + tool stream live | ❌ | ✅ | **✅** |
| Aperçu iframe sandboxé | ❌ | ✅ | **✅** |
| Import ZIP Claude Design | n/a | ❌ | **✅ `POST /api/import/claude-design`** |
| Éditions chirurgicales comment-mode | ❌ | ✅ | 🟡 partiel |
| Panneau tweaks émis par IA | ❌ | ✅ | 🚧 roadmap |
| Workspace file-system-grade | ❌ | partiel | **✅ Vrai cwd, vrais outils, SQLite persistant** |
| Self-critique 5 dimensions | ❌ | ❌ | **✅ Gate pre-emit** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint`** |
| Sidecar IPC + desktop headless | ❌ | ❌ | **✅ Processus stampés + `tools-dev inspect desktop status \| eval \| screenshot`** |
| Formats d’export | Limités | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (agent-driven) / ZIP / Markdown** |
| Réutilisation Skill PPT | N/A | Built-in | **[`guizang-ppt-skill`][guizang] intégré** |
| Facturation minimale | Pro / Max / Team | BYOK | **BYOK** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Coding agents pris en charge

Auto-détectés depuis `PATH` au boot du daemon. Aucune config nécessaire. Le dispatch streaming vit dans [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`) ; les parseurs par CLI vivent à côté. Les modèles sont peuplés soit par probe (`<bin> --list-models`, `<bin> models`, handshake ACP), soit par fallback prédéfini quand la CLI n’expose pas de liste.

| Agent | Bin | Format stream | Forme argv (chemin prompt composé) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` | `claude -p --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` (prompt sur stdin) |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + parseur `codex` | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]` (prompt sur stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + parseur `gemini` | `gemini --output-format stream-json --skip-trust --yolo [--model …]` (prompt sur stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + parseur `opencode` | `opencode run --format json --dangerously-skip-permissions [--model …] -` |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + parseur `cursor-agent` | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …]` (prompt sur stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` | `qwen --yolo [--model …] -` |
| Qoder CLI | `qodercli` | `qoder-stream-json` | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (prompt sur stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` | `copilot -p - --allow-all-tools --output-format json [--model …] [--add-dir …]` (prompt sur stdin) |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (raw stdout chunks) | `deepseek exec --auto [--model …] <prompt>` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` | `pi --mode rpc [--model …] [--thinking …]` |
| **BYOK multi-provider** | n/a | SSE normalisé | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI-compatible / Azure OpenAI / Gemini ; protégé contre loopback / link-local / RFC1918 |

Ajouter une nouvelle CLI revient à ajouter une entrée dans [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). Le format de stream est l’un de `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream`, `acp-json-rpc`, `pi-rpc` ou `plain`.

## Références & lignée

Chaque projet externe dont ce repo s’inspire. Chaque lien pointe vers la source pour vérifier la provenance.

| Projet | Rôle ici |
|---|---|
| [`Claude Design`][cd] | Le produit fermé dont ce repo est l’alternative open source. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | Le cœur philosophie design. Workflow Junior-Designer, protocole brand-asset en 5 étapes, checklist anti-AI-slop, self-critique 5 dimensions et bibliothèque « 5 écoles × 20 philosophies design » — tout distillé dans [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) et [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | Skill Magazine-web-PPT inclus tel quel sous [`skills/guizang-ppt/`](skills/guizang-ppt/). Défaut pour le mode deck. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Architecture daemon + adapter. Détection PATH, daemon local comme seul processus privilégié, vision agent-as-teammate. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | Première alternative open source à Claude Design et pair le plus proche. Patterns UX adoptés : streaming-artifact loop, preview iframe sandboxée, panneau agent live, cinq exports, storage hub local, goût injecté par `SKILL.md`. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | Source du schéma `DESIGN.md` en 9 sections et des product systems importés. |
| [`bergside/awesome-design-skills`][ads] | Source des design skills ajoutés comme `DESIGN.md` normalisés sous `design-systems/`. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Inspiration pour la distribution de Skills par symlink entre plusieurs CLI agent. |
| [Claude Code skills][skill] | Convention `SKILL.md` adoptée telle quelle. |

Le récit long de provenance vit dans [`docs/references.md`](docs/references.md).

## Roadmap

- [x] Daemon + détection agents CLI + registre Skills + catalogue Design Systems
- [x] Web app + chat + question form + 5-direction picker + todo progress + preview sandboxée
- [x] Catalogues Skills + Design Systems + 5 directions visuelles + 5 device frames
- [x] Projets · conversations · messages · tabs · templates sur SQLite
- [x] Proxy BYOK multi-provider (`/api/proxy/{anthropic,openai,azure,google}/stream`) avec SSRF guard
- [x] Import ZIP Claude Design (`/api/import/claude-design`)
- [x] Sidecar protocol + desktop Electron avec IPC automation
- [x] Artifact lint API + gate pre-emit de self-critique 5 dimensions
- [ ] Éditions chirurgicales comment-mode
- [ ] UX panneau tweaks émis par IA
- [ ] Recette Vercel + tunnel deployment
- [ ] `npx od init` en une commande pour scaffold un projet avec `DESIGN.md`
- [ ] Skill marketplace (`od skills install <github-repo>`) et surface CLI `od skill add | list | remove | test`
- [x] Build Electron empaqueté depuis `apps/packaged/` — téléchargements macOS (Apple Silicon) et Windows (x64) sur [open-design.ai](https://open-design.ai/) et la [page des releases GitHub](https://github.com/nexu-io/open-design/releases)

Livraison par phases → [`docs/roadmap.md`](docs/roadmap.md).

## Statut

C’est une implémentation encore jeune, mais la boucle fermée fonctionne de bout en bout : détecter → choisir Skill + Design System → chat → parser `<artifact>` → preview → sauvegarder. Le prompt stack et la Skill library concentrent l’essentiel de la valeur, et ils sont stables. Les composants UI évoluent tous les jours.

## Star us

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Star Open Design on GitHub : github.com/nexu-io/open-design" width="100%" /></a>
</p>

Si ce projet vous a économisé trente minutes, donnez-lui une ★. Les stars ne paient pas le loyer, mais elles indiquent au prochain designer, agent ou contributeur que cette expérience mérite son attention : [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Contribuer

Issues, PRs, nouveaux Skills et nouveaux Design Systems sont bienvenus. Les contributions les plus utiles sont souvent un dossier, un fichier Markdown ou un petit adapter qui tient dans une PR :

- **Ajouter un Skill** : déposer un dossier dans [`skills/`](skills/) selon la convention [`SKILL.md`][skill].
- **Ajouter un Design System** : déposer un `DESIGN.md` dans [`design-systems/<brand>/`](design-systems/) avec le schéma en 9 sections.
- **Brancher une nouvelle coding-agent CLI** : une entrée dans [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

Guide complet, critères de merge, style de code et refus fréquents → [`CONTRIBUTING.fr.md`](CONTRIBUTING.fr.md) ([English](CONTRIBUTING.md), [Deutsch](CONTRIBUTING.de.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Contributeurs

Merci à toutes les personnes qui font avancer Open Design : code, docs, retours, nouveaux Skills, nouveaux Design Systems ou issues bien ciblées. Chaque vraie contribution compte.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-13" alt="Contributeurs Open Design" />
</a>

Si vous avez livré votre première PR, bienvenue. Le label [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) est le point d’entrée.

## Activité du dépôt

<picture>
  <img alt="Open Design : métriques du dépôt" src="docs/assets/github-metrics.svg" />
</picture>

Le SVG ci-dessus est régénéré chaque jour par [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) avec [`lowlighter/metrics`](https://github.com/lowlighter/metrics). Lancez un refresh manuel depuis l’onglet **Actions** si vous le voulez plus tôt ; pour des plugins plus riches, ajoutez un secret `METRICS_TOKEN` avec un PAT fine-grained.

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-13" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
    <img alt="Historique des stars Open Design" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
  </picture>
</a>

Si la courbe monte, c’est le signal que nous cherchons. ★ ce repo pour l’aider à monter.

## Crédits

La famille de Skills HTML PPT Studio, le Skill maître [`skills/html-ppt/`](skills/html-ppt/) et les wrappers par template sous [`skills/html-ppt-*/`](skills/), est intégrée depuis le projet open source [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT). La LICENSE upstream est incluse dans le repo à [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE) et le crédit auteur revient à [@lewislulu](https://github.com/lewislulu).

Le flow deck magazine / horizontal-swipe sous [`skills/guizang-ppt/`](skills/guizang-ppt/) est intégré depuis [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT). Crédit auteur : [@op7418](https://github.com/op7418).

## Licence

Apache-2.0. Le bundle `skills/guizang-ppt/` conserve sa [LICENSE](skills/guizang-ppt/LICENSE) originale (MIT) et l’attribution à [op7418](https://github.com/op7418). Le bundle `skills/html-ppt/` conserve sa [LICENSE](skills/html-ppt/LICENSE) originale (MIT) et l’attribution à [lewislulu](https://github.com/lewislulu).
