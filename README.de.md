# Open Design

> **Die Open-Source-Alternative zu [Claude Design][cd].** Local-first, web-deploybar, BYOK auf jeder Ebene: **16 coding-agent CLIs** werden automatisch in Ihrem `PATH` erkannt (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI) und werden zur Design-Engine, gesteuert von **31 kombinierbaren Skills** und **72 brandreifen Design Systems**. Keine CLI? Ein OpenAI-kompatibler BYOK-Proxy ist dieselbe Schleife ohne Spawn.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — editorial cover: design with the agent on your laptop" width="100%" />
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
  <a href="https://open-design.ai/"><img alt="Herunterladen" src="https://img.shields.io/badge/download-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#supported-coding-agents"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-systems"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.de.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a></p>

---

## Warum es existiert

Anthropics [Claude Design][cd] (veröffentlicht am 2026-04-17, Opus 4.7) hat gezeigt, was passiert, wenn ein LLM aufhört, Prosa zu schreiben, und anfängt, Design-Artefakte zu liefern. Es ging viral und blieb closed-source, nur bezahlt, nur Cloud, fest an Anthropics Modell und Anthropics Skills gebunden. Kein Checkout, kein Self-Hosting, kein Vercel-Deploy, kein Austausch gegen Ihren eigenen Agent.

**Open Design (OD) ist die Open-Source-Alternative.** Dieselbe Schleife, dasselbe artifact-first Denkmodell, aber ohne Lock-in. Wir liefern keinen Agent: Die stärksten coding agents laufen bereits auf Ihrem Laptop. Wir verbinden sie mit einem skillgesteuerten Design-Workflow, der lokal mit `pnpm tools-dev` läuft, die Web-Schicht zu Vercel deployen kann und auf jeder Ebene BYOK bleibt.

Geben Sie `make me a magazine-style pitch deck for our seed round` ein. Das interaktive Fragenformular erscheint, bevor das Modell auch nur ein Pixel improvisiert. Der Agent wählt eine von fünf kuratierten visuellen Richtungen. Ein live `TodoWrite` Plan streamt in die UI. Der daemon baut einen echten Projektordner auf der Festplatte mit Seed-Template, Layout-Bibliothek und Self-Check-Checklist. Der Agent liest sie, der Pre-Flight ist erzwungen, bewertet seine eigene Ausgabe mit einer fünfdimensionalen Kritik und gibt ein einzelnes `<artifact>` aus, das Sekunden später in einem sandboxed iframe rendert.

Das ist nicht "AI versucht, etwas zu designen". Das ist eine AI, die durch den Prompt Stack darauf trainiert wurde, sich wie ein Senior Designer mit funktionierendem Dateisystem, deterministischer Palettenbibliothek und Checklist-Kultur zu verhalten: genau die Messlatte, die Claude Design gesetzt hat, aber offen und unter Ihrer Kontrolle.

OD steht auf den Schultern von vier Open-Source-Projekten:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — der Design-Philosophie-Kompass. Junior-Designer Workflow, das 5-step brand-asset protocol, die anti-AI-slop checklist, die fünfdimensionale Self-Critique und die Idee "5 schools × 20 design philosophies" hinter unserem Direction Picker, alles verdichtet in [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — der Deck-Modus. Unverändert unter [`skills/guizang-ppt/`](skills/guizang-ppt/) gebündelt, mit ursprünglicher LICENSE; magazinartige Layouts, WebGL-Hero, P0/P1/P2-Checklists.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX North Star und nächster Peer. Die erste Open-Source-Alternative zu Claude Design. Wir übernehmen den Streaming-Artifact-Loop, das sandboxed-iframe Preview Pattern (vendored React 18 + Babel), das Live-Agent-Panel (todos + tool calls + unterbrechbare Generierung) und die fünf Exportformate (HTML / PDF / PPTX / ZIP / Markdown). Wir unterscheiden uns bewusst im Formfaktor: Sie sind eine Desktop-Electron-App mit gebündeltem [`pi-ai`][piai]; wir sind eine Web-App + lokaler daemon, die an Ihre vorhandene CLI delegiert.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — die daemon- und runtime-Architektur. PATH-Scan-Agent-Erkennung, der lokale daemon als einziger privilegierter Prozess, die Agent-as-teammate Sichtweise.

## Auf einen Blick

| | Was Sie bekommen |
|---|---|
| **Code-Agent-CLIs (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — automatisch im `PATH` erkannt, mit einem Klick wechselbar |
| **BYOK-Fallback** | OpenAI-kompatibler Proxy unter `/api/proxy/stream` — fügen Sie `baseUrl` + `apiKey` + `model` ein und jeder Anbieter (Anthropic-via-OpenAI, DeepSeek, Groq, MiMo, OpenRouter, Ihr selbst gehostetes vLLM oder jeder andere OpenAI-kompatible Provider) wird zur Engine. Internal-IP/SSRF wird am daemon-Rand blockiert. |
| **Design Systems integriert** | **72** — 2 handgeschriebene Starter + 70 Produktsysteme (Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu, …), importiert aus [`awesome-design-md`][acd2] |
| **Skills integriert** | **31** — 27 im `prototype` mode (web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs, …) + 4 im `deck` mode (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). Im Picker nach `scenario` gruppiert: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **Medienerzeugung** | Image-, Video- und Audio-Surfaces laufen neben dem Design-Loop. **gpt-image-2** (Azure / OpenAI) für Poster, Avatare, Infografiken, illustrierte Karten · **Seedance 2.0** (ByteDance) für 15s-cinematic text-to-video und image-to-video · **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) für HTML→MP4 Motion Graphics (Produkt-Reveals, kinetische Typografie, Datendiagramme, Social Overlays, Logo-Outros). **93** sofort reproduzierbare Prompts — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames — unter [`prompt-templates/`](prompt-templates/), mit Vorschau-Thumbnails und Quellenangabe. Gleiche Chat-Oberfläche wie Code; gibt einen echten `.mp4` / `.png` Chip in den Projekt-Workspace aus. |
| **Visuelle Richtungen** | 5 kuratierte Schulen (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental), jeweils mit deterministischer OKLch-Palette + Font Stack ([`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)) |
| **Device frames** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — pixelgenau, skillübergreifend unter [`assets/frames/`](assets/frames/) geteilt |
| **Agent-Runtime** | Der lokale daemon startet die CLI in Ihrem Projektordner: Der Agent bekommt echte `Read`, `Write`, `Bash`, `WebFetch` gegen eine echte Festplattenumgebung, mit Windows-`ENAMETOOLONG` Fallbacks (stdin / prompt-file) in jedem Adapter |
| **Imports** | Ziehen Sie einen [Claude Design][cd] Export-ZIP in den Welcome Dialog: `POST /api/import/claude-design` parst ihn zu einem echten Projekt, damit Ihr Agent dort weiterarbeiten kann, wo Anthropic aufgehört hat |
| **Persistence** | SQLite in `.od/app.sqlite`: projects · conversations · messages · tabs · saved templates. Morgen wieder öffnen, todo card und offene Dateien sind genau dort, wo Sie sie verlassen haben. |
| **Lebenszyklus** | Ein Einstiegspunkt: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) — startet daemon + web (+ desktop) unter typisierten sidecar stamps |
| **Desktop** | Optionale Electron Shell mit sandboxed renderer + sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — treibt `tools-dev inspect desktop screenshot` für E2E |
| **Bereitstellbar auf** | Lokal (`pnpm tools-dev`) · Vercel Web Layer · paketierte Electron Desktop-App für macOS (Apple Silicon) und Windows (x64) — Download von [open-design.ai](https://open-design.ai/) oder dem [neuesten Release](https://github.com/nexu-io/open-design/releases) |
| **Lizenz** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md

## Demo

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Entry view" /><br/>
<sub><b>Entry view</b> — Skill wählen, Design System wählen, Brief eingeben. Dieselbe Oberfläche für Prototypen, Decks, mobile Apps, Dashboards und Editorial Pages.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Turn-1 discovery form" /><br/>
<sub><b>Turn-1 discovery form</b> — bevor das Modell ein Pixel schreibt, fixiert OD den Brief: Oberfläche, Zielgruppe, Ton, Brand-Kontext, Umfang. 30 Sekunden Radio Buttons schlagen 30 Minuten Redirects.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Direction picker" /><br/>
<sub><b>Direction picker</b> — wenn der Nutzer keine Brand hat, gibt der Agent ein zweites Formular mit 5 kuratierten Richtungen aus (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). Ein Radio-Klick → deterministische Palette + Font Stack, kein Model-Freestyle.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Live todo progress" /><br/>
<sub><b>Live todo progress</b> — der Plan des Agent streamt als Live Card. <code>in_progress</code> → <code>completed</code> Updates landen in Echtzeit. Der Nutzer kann mitten im Flug günstig umleiten.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Sandboxed preview" /><br/>
<sub><b>Sandboxed preview</b> — jedes <code>&lt;artifact&gt;</code> rendert in einem sauberen srcdoc iframe. Direkt im File Workspace editierbar; als HTML, PDF oder ZIP herunterladbar.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72-system library" /><br/>
<sub><b>72-system library</b> — jedes Produktsystem zeigt seine 4-Farben-Signatur. Klicken Sie für das vollständige <code>DESIGN.md</code>, Swatch Grid und Live Showcase.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Magazine deck" /><br/>
<sub><b>Deck mode (guizang-ppt)</b> — der gebündelte <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> wird unverändert übernommen. Magazinlayouts, WebGL-Hero-Hintergründe, Single-File-HTML-Ausgabe, PDF-Export.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Mobile prototype" /><br/>
<sub><b>Mobile prototype</b> — pixelgenauer iPhone 15 Pro Chrome (Dynamic Island, Statusbar-SVGs, Home Indicator). Multi-Screen-Prototypen nutzen die gemeinsamen <code>/frames/</code> Assets, damit der Agent nie ein Telefon neu zeichnet.</sub>
</td>
</tr>
</table>

## Skills

**31 Skills werden direkt mitgeliefert.** Jeder ist ein Ordner unter [`skills/`](skills/), folgt der Claude Code [`SKILL.md`][skill] Konvention und erweitert sie um ein `od:` Frontmatter, das der daemon unverändert parst: `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Zwei oberste **Modes** tragen den Katalog: **`prototype`** (27 Skills, alles, was als einseitiges Artefakt rendert, von Magazin-Landing bis Phone Screen bis PM Spec Doc) und **`deck`** (4 Skills, horizontale Swipe-Präsentationen mit Deck-Framework-Chrome). Das Feld **`scenario`** gruppiert sie im Picker: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### Showcase-Beispiele

Die visuell markanten Skills, die Sie wahrscheinlich zuerst ausführen. Jeder bringt ein echtes `example.html` mit, das Sie direkt aus dem Repo öffnen können, um genau zu sehen, was der Agent erzeugt: keine Authentifizierung, kein Setup.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Consumer dating / matchmaking dashboard — linke Navigation, Ticker Bar, KPIs, 30-day mutual-matches chart, Editorial-Typografie.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>Zweiseitiger Digital E-Guide — Cover (Titel, Autor, TOC Teaser) + Lesson Spread mit Pull Quote und Schritteliste. Creator / Lifestyle Tone.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>Brand product-launch HTML email — Masthead, Hero Image, Headline Lockup, CTA, Specs Grid. Zentrierte Single Column, table-fallback safe.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Drei-Frame gamified mobile-app prototype auf dunkler Showcase Stage — Cover, today's quests mit XP Ribbons + Level Bar, Quest Detail.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Drei-Frame Mobile Onboarding Flow — Splash, Value Prop, Sign-in. Status Bar, Swipe Dots, Primary CTA.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Single-Frame Motion-Design-Hero mit loopenden CSS-Animationen — rotierender Type Ring, animierter Globus, tickender Timer. Bereit für HyperFrames-Handoff.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Drei Karten im 1080×1080 Social-Media-Carousel — filmische Panels mit Display Headlines, die sich über die Serie verbinden, Brand Mark, Loop Affordance.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Pixel / 8-bit Animated Explainer Slide — vollflächige Cream Stage, animiertes Pixel Mascot, kinetische japanische Display Type, loopende CSS Keyframes.</sub>
</td>
</tr>
</table>

### Design- & Marketing-Oberflächen (Prototyp-Modus)

| Skill | Plattform | Szenario | Was er erzeugt |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | Single-page HTML — Landings, Marketing, Hero Pages (default für prototype) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Hero / Features / Pricing / CTA Marketing Layout |
| [`dashboard`](skills/dashboard/) | desktop | operation | Admin / Analytics mit Sidebar + dichtem Datenlayout |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | Eigenständiges Pricing + Vergleichstabellen |
| [`docs-page`](skills/docs-page/) | desktop | engineering | 3-spaltiges Dokumentationslayout |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Editorial Long-form |
| [`mobile-app`](skills/mobile-app/) | mobile | design | iPhone 15 Pro / Pixel gerahmte App-Screen(s) |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Multi-Screen Mobile Onboarding Flow (splash · value-prop · sign-in) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Drei-Frame gamified mobile-app prototype |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | Brand product-launch HTML email (table-fallback safe) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | 3-card 1080×1080 social carousel |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Einseitiges Poster im Magazin-Stil |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Motion-design Hero mit loopenden CSS-Animationen |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Pixel / 8-bit Animated Explainer Slide |
| [`dating-web`](skills/dating-web/) | desktop | personal | Consumer dating dashboard mockup |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | Zweiseitiger Digital E-Guide (cover + lesson) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Handgezeichnete Ideenskizze — für den "show something visible early" Pass |
| [`critique`](skills/critique/) | desktop | design | Fünfdimensionales Self-Critique Scoresheet (Philosophy · Hierarchy · Detail · Function · Innovation) |
| [`tweaks`](skills/tweaks/) | desktop | design | AI-emitted tweaks panel — das Modell zeigt die Parameter, die sich sinnvoll nachjustieren lassen |

### Deck-Oberflächen (Deck-Modus)

| Skill | Default für | Was er erzeugt |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **default** für deck | Web-PPT im Magazinstil — unverändert aus [op7418/guizang-ppt-skill][guizang] gebündelt, ursprüngliche LICENSE bewahrt |
| [`simple-deck`](skills/simple-deck/) | — | Minimaler horizontal-swipe deck |
| [`replit-deck`](skills/replit-deck/) | — | Product-walkthrough deck (Replit-style) |
| [`weekly-update`](skills/weekly-update/) | — | Team weekly cadence als swipe deck (progress · blockers · next) |

### Office- & Operations-Oberflächen (Prototyp-Modus, dokumentartige Szenarien)

| Skill | Szenario | Was er erzeugt |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | PM specification doc mit TOC + decision log |
| [`team-okrs`](skills/team-okrs/) | product | OKR scoresheet |
| [`meeting-notes`](skills/meeting-notes/) | operation | Meeting decision log |
| [`kanban-board`](skills/kanban-board/) | operation | Board snapshot |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Incident runbook |
| [`finance-report`](skills/finance-report/) | finance | Exec finance summary |
| [`invoice`](skills/invoice/) | finance | Single-page invoice |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | Role onboarding plan |

Einen Skill hinzuzufügen bedeutet: ein Ordner. Lesen Sie [`docs/skills-protocol.md`](docs/skills-protocol.md) für das erweiterte Frontmatter, forken Sie einen vorhandenen Skill, starten Sie den daemon neu, und er erscheint im Picker. Der Katalog-Endpunkt ist `GET /api/skills`; die Seed-Zusammenstellung pro Skill (Template + Side-File-Referenzen) liegt in `GET /api/skills/:id/example`.

## Sechs tragende Ideen

### 1 · Wir liefern keinen Agent. Ihrer ist gut genug.

Der daemon durchsucht beim Start Ihren `PATH` nach [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), `qodercli`, [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi` und [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Was er findet, wird zur möglichen Design-Engine: über stdio mit je einem Adapter pro CLI gesteuert und im Model Picker austauschbar. Inspiriert von [`multica`](https://github.com/multica-ai/multica) und [`cc-switch`](https://github.com/farion1231/cc-switch). Keine CLI installiert? `POST /api/proxy/stream` ist dieselbe Pipeline ohne Spawn: Fügen Sie ein beliebiges OpenAI-kompatibles `baseUrl` + `apiKey` ein, und der daemon leitet SSE-Chunks zurück, wobei loopback / link-local / RFC1918 Ziele am Rand abgelehnt werden.

### 2 · Skills sind Dateien, keine Plugins.

Nach Claude Codes [`SKILL.md` Konvention](https://docs.anthropic.com/en/docs/claude-code/skills) ist jeder Skill `SKILL.md` + `assets/` + `references/`. Legen Sie einen Ordner in [`skills/`](skills/), starten Sie den daemon neu, und er erscheint im Picker. Das gebündelte `magazine-web-ppt` ist [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill), unverändert eingecheckt: ursprüngliche Lizenz bewahrt, Attribution bewahrt.

### 3 · Design Systems sind portables Markdown, kein Theme JSON.

Das 9-Section `DESIGN.md` Schema aus [`VoltAgent/awesome-design-md`][acd2]: color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. Jedes Artefakt liest aus dem aktiven System. System wechseln → das nächste Render nutzt die neuen Tokens. Das Dropdown bringt **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…** mit, insgesamt 72.

### 4 · Das interaktive Fragenformular verhindert 80% der Redirects.

ODs Prompt Stack enthält eine harte `RULE 1`: Jeder frische Design Brief beginnt mit einem `<question-form id="discovery">` statt mit Code. Surface · audience · tone · brand context · scale · constraints. Auch ein langer Brief lässt Designentscheidungen offen: visueller Ton, Farbhaltung, Maßstab. Genau diese Dinge fixiert das Formular in 30 Sekunden. Die Kosten einer falschen Richtung sind eine Chat-Runde, nicht ein fertiges Deck.

Das ist der aus [`huashu-design`](https://github.com/alchaincyf/huashu-design) destillierte **Junior-Designer mode**: Fragen vorne bündeln, früh etwas Sichtbares zeigen (selbst ein Wireframe mit grauen Blöcken), den Nutzer günstig umleiten lassen. Zusammen mit dem Brand-Asset-Protokoll (locate · download · `grep` hex · write `brand-spec.md` · vocalise) ist es der wichtigste Grund, warum Output nicht mehr nach AI-Freestyle wirkt, sondern nach einem Designer, der vor dem Malen aufgepasst hat.

### 5 · Der daemon lässt den Agent fühlen, als wäre er auf Ihrem Laptop, weil er es ist.

Der daemon startet die CLI mit `cwd` auf den Artifact-Ordner des Projekts unter `.od/projects/<id>/`. Der Agent bekommt `Read`, `Write`, `Bash`, `WebFetch`: echte Tools gegen ein echtes Dateisystem. Er kann das `assets/template.html` des Skills lesen, Ihre CSS nach Hex-Werten `grep`en, ein `brand-spec.md` schreiben, generierte Bilder ablegen und `.pptx` / `.zip` / `.pdf` Dateien erzeugen, die am Ende des Turns als Download Chips im File Workspace erscheinen. Sessions, Conversations, Messages und Tabs persistieren in einer lokalen SQLite DB: Öffnen Sie das Projekt morgen wieder, und die Todo Card des Agent ist dort, wo Sie sie verlassen haben.

### 6 · Der Prompt Stack ist das Produkt.

Was beim Senden zusammengesetzt wird, ist nicht "system + user". Es ist:

```
DISCOVERY directives  (turn-1 form, turn-2 brand branch, TodoWrite, 5-dim critique)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 systems available)
  + active SKILL.md    (31 skills available)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (auto-injected pre-flight: read assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

Jede Ebene ist kombinierbar. Jede Ebene ist eine Datei, die Sie editieren können. Lesen Sie [`apps/web/src/prompts/system.ts`](apps/web/src/prompts/system.ts) und [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts), um den echten Vertrag zu sehen.

## Architektur

```
┌────────────────────── browser (Next.js 16) ──────────────────────┐
│  chat · file workspace · iframe preview · settings · imports     │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ /api/* (rewritten in dev)          │
               ▼                                    ▼
   ┌──────────────────────────────────┐   /api/proxy/stream (SSE)
   │  Local daemon (Express + SQLite) │   ─→ any OpenAI-compat
   │                                  │       endpoint (BYOK)
   │  /api/agents          /api/skills│       w/ SSRF blocking
   │  /api/design-systems  /api/projects/…
   │  /api/chat (SSE)      /api/proxy/stream (SSE)
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
   │  claude · codex · gemini · opencode · cursor-agent · qwen        │
   │  qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC)                  │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk            │
   └──────────────────────────────────────────────────────────────────┘
```

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, Vercel-deploybar |
| Daemon | Node 24 · Express · SSE streaming · `better-sqlite3`; Tabellen: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| Agent transport | `child_process.spawn`; typisierte Event-Parser für `claude-stream-json` (Claude Code), `qoder-stream-json` (Qoder CLI), `copilot-stream-json` (Copilot), `json-event-stream` pro-CLI Parser (Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe via Agent Client Protocol), `pi-rpc` (Pi via stdio JSON-RPC), `plain` (Qwen Code / DeepSeek TUI) |
| BYOK proxy | `POST /api/proxy/stream` → OpenAI-kompatibles `/v1/chat/completions`, SSE pass-through; lehnt loopback / link-local / RFC1918 Hosts am daemon-Rand ab |
| Storage | Plain files in `.od/projects/<id>/` + SQLite in `.od/app.sqlite` (gitignored, auto-created). Root mit `OD_DATA_DIR` für Testisolation überschreibbar |
| Preview | Sandboxed iframe via `srcdoc` + per-Skill `<artifact>` Parser ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Export | HTML (inline assets) · PDF (browser print, deck-aware) · PPTX (agent-driven via skill) · ZIP (archiver) · Markdown |
| Lifecycle | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; Ports über `--daemon-port` / `--web-port`, Namespaces über `--namespace` |
| Desktop (optional) | Electron Shell — entdeckt die Web URL über sidecar IPC, kein Port-Raten; derselbe `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` Kanal treibt `tools-dev inspect desktop …` für E2E |

## Schnellstart

### Desktop-App herunterladen (kein Build erforderlich)

Der schnellste Weg, Open Design auszuprobieren, ist die vorgefertigte Desktop-App — kein Node, kein pnpm, kein Klonen:

- **[open-design.ai](https://open-design.ai/)** — offizielle Download-Seite
- **[GitHub Releases](https://github.com/nexu-io/open-design/releases)**

### Aus dem Quellcode ausführen

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # should print 10.33.2
pnpm install
pnpm tools-dev run web
# open the web URL printed by tools-dev
```

Windows-Launcher: Erstellen Sie `OpenDesign.exe` selbst mit der Anleitung in `tools/launcher/README.md`, oder laden Sie ihn aus GitHub Releases herunter. Legen Sie die Datei danach in den Repository-Stamm und doppelklicken Sie sie, um bei Bedarf `pnpm install` auszuführen und Open Design mit `pnpm tools-dev` zu starten.

Umgebungsanforderungen: Node `~24` und pnpm `10.33.x`. `nvm`/`fnm` sind nur optionale Helfer; wenn Sie eines davon nutzen, führen Sie vor `pnpm install` `nvm install 24 && nvm use 24` oder `fnm install 24 && fnm use 24` aus.

Für Desktop-/Background-Start, Fixed-Port-Restarts und Media-Generation-Dispatcher-Checks (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`) siehe [`QUICKSTART.de.md`](QUICKSTART.de.md).

Der erste Load:

1. erkennt, welche Agent-CLIs Sie im `PATH` haben, und wählt automatisch eine aus.
2. lädt 31 Skills + 72 Design Systems.
3. öffnet den Welcome Dialog, damit Sie einen Anthropic Key einfügen können (nur für den BYOK-Fallback-Pfad nötig).
4. **erstellt automatisch `./.od/`** — den lokalen Runtime-Ordner für die SQLite Project DB, per-project artifacts und saved renders. Es gibt keinen `od init` Schritt; der daemon `mkdir`t beim Boot alles, was er braucht.

Geben Sie einen Prompt ein, drücken Sie **Senden**, sehen Sie das Fragenformular erscheinen, füllen Sie es aus, sehen Sie die Todo Card streamen, sehen Sie das Artifact rendern. Klicken Sie **Auf Datenträger speichern** oder laden Sie ein Projekt-ZIP herunter.

### First-run state (`./.od/`)

Der daemon besitzt einen versteckten Ordner am Repo-Root. Alles darin ist gitignored und maschinenlokal: niemals committen.

```
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── artifacts/                 ← one-off "Save to disk" renders (timestamped)
└── projects/<id>/             ← per-project working dir, also the agent's cwd
```

| Wenn Sie möchten… | Tun Sie das |
|---|---|
| Inhalt prüfen | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Sauber zurücksetzen | `pnpm tools-dev stop`, `rm -rf .od`, dann erneut `pnpm tools-dev run web` |
| Woandershin verschieben | noch nicht unterstützt — der Pfad ist relativ zum Repo hart codiert |

Vollständige Dateistruktur, Skripte und Fehlerbehebung → [`QUICKSTART.de.md`](QUICKSTART.de.md).

## Repository-Struktur

```
open-design/
├── README.md                      ← English
├── README.de.md                   ← Deutsch
├── README.zh-CN.md                ← 简体中文
├── README.ko.md                   ← 한국어
├── QUICKSTART.md                  ← run / build / deploy guide
├── package.json                   ← pnpm workspace, single bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express, the only server
│   │   ├── src/                   ← TypeScript daemon source
│   │   │   ├── cli.ts             ← `od` bin source, compiled to dist/cli.js
│   │   │   ├── server.ts          ← /api/* routes (projects, chat, files, exports)
│   │   │   ├── agents.ts          ← PATH scanner + per-CLI argv builders
│   │   │   ├── claude-stream.ts   ← streaming JSON parser for Claude Code stdout
│   │   │   ├── skills.ts          ← SKILL.md frontmatter loader
│   │   │   └── db.ts              ← SQLite schema (projects/messages/templates/tabs)
│   │   ├── sidecar/               ← tools-dev daemon sidecar wrapper
│   │   └── tests/                 ← daemon package tests
│   │
│   └── web/                       ← Next.js 16 App Router + React client
│       ├── app/                   ← App Router entrypoints
│       ├── next.config.ts         ← dev rewrites + prod static export to out/
│       └── src/                   ← React + TypeScript client modules
│           ├── App.tsx            ← routing, bootstrap, settings
│           ├── components/        ← chat, composer, picker, preview, sketch, …
│           ├── prompts/
│           │   ├── system.ts      ← composeSystemPrompt(base, skill, DS, metadata)
│           │   ├── discovery.ts   ← turn-1 form + turn-2 branch + 5-dim critique
│           │   └── directions.ts  ← 5 visual directions × OKLch palette + font stack
│           ├── artifacts/         ← streaming <artifact> parser + manifests
│           ├── runtime/           ← iframe srcdoc, markdown, export helpers
│           ├── providers/         ← daemon SSE + BYOK API transports
│           └── state/             ← config + projects (localStorage + daemon-backed)
│
├── e2e/                           ← Playwright UI + external integration/Vitest harness
│
├── packages/
│   ├── contracts/                 ← shared web/daemon app contracts
│   ├── sidecar-proto/             ← Open Design sidecar protocol contract
│   ├── sidecar/                   ← generic sidecar runtime primitives
│   └── platform/                  ← generic process/platform primitives
│
├── skills/                        ← 31 SKILL.md skill bundles (27 prototype + 4 deck)
│   ├── web-prototype/             ← default for prototype mode
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck mode
│   └── guizang-ppt/               ← bundled magazine-web-ppt (default for deck)
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 DESIGN.md systems
│   ├── default/                   ← Neutral Modern (starter)
│   ├── warm-editorial/            ← Warm Editorial (starter)
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md                  ← catalog overview
│
├── assets/
│   └── frames/                    ← shared device frames (used cross-skill)
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   └── deck-framework.html        ← deck baseline (nav / counter / print)
│
├── scripts/
│   └── sync-design-systems.ts     ← re-import upstream awesome-design-md tarball
│
├── docs/
│   ├── spec.md                    ← product spec, scenarios, differentiation
│   ├── architecture.md            ← topologies, data flow, components
│   ├── skills-protocol.md         ← extended SKILL.md od: frontmatter
│   ├── agent-adapters.md          ← per-CLI detection + dispatch
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← long-form provenance
│   ├── roadmap.md                 ← phased delivery
│   ├── schemas/                   ← JSON schemas
│   └── examples/                  ← canonical artifact examples
│
└── .od/                           ← runtime data, gitignored, auto-created
    ├── app.sqlite                 ← projects / conversations / messages / tabs
    ├── projects/<id>/             ← per-project working folder (agent's cwd)
    └── artifacts/                 ← saved one-off renders
```

## Designsysteme

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="The 72 design systems library — style guide spread" width="100%" />
</p>

72 Systeme direkt mitgeliefert, jedes als ein einzelnes [`DESIGN.md`](design-systems/README.md):

<details>
<summary><b>Vollständiger Katalog</b> (zum Aufklappen klicken)</summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Developer Tools** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Productivity** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E-Commerce** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Media** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Automotive** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Other** — `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**Starters** — `default` (Neutral Modern) · `warm-editorial`

</details>

Die Bibliothek wird über [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) aus [`VoltAgent/awesome-design-md`][acd2] importiert. Führen Sie es erneut aus, um zu aktualisieren.

## Visuelle Richtungen

Wenn der Nutzer keine Brand Spec hat, gibt der Agent ein zweites Formular mit fünf kuratierten Richtungen aus: die OD-Adaption von [`huashu-design`s "5 schools × 20 design philosophies" fallback](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback). Jede Richtung ist eine deterministische Spec: Palette in OKLch, Font Stack, Layout-Posture-Cues, Referenzen. Der Agent bindet sie unverändert in das `:root` des Seed Templates. Ein Radio-Klick → ein vollständig spezifiziertes visuelles System. Keine Improvisation, kein AI-slop.

| Richtung | Stimmung | Referenzen |
|---|---|---|
| Editorial — Monocle / FT | Printmagazin, Tinte + Cream + warmer Rust | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | Kühl, strukturiert, minimaler Akzent | Linear · Vercel · Stripe |
| Tech utility | Informationsdichte, Monospace, Terminal | Bloomberg · Bauhaus tools |
| Brutalist | Roh, übergroße Type, keine Schatten, harte Akzente | Bloomberg Businessweek · Achtung |
| Soft warm | Großzügig, niedriger Kontrast, peachy Neutrals | Notion marketing · Apple Health |

Vollständige Spec → [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts).

## Medienerzeugung

OD endet nicht beim Code. Dieselbe Chat-Oberfläche, die `<artifact>`-HTML produziert, treibt auch **Image-**, **Video-** und **Audio-**Generierung — die Modell-Adapter sind in der daemon-Media-Pipeline verdrahtet ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Jedes Render landet als echte Datei im Projekt-Workspace — `.png` für Image, `.mp4` für Video — und erscheint als Download-Chip am Ende des Turns.

Drei Modellfamilien tragen heute die Last:

| Surface | Modell | Anbieter | Wofür |
|---|---|---|---|
| **Image** | `gpt-image-2` | Azure / OpenAI | Poster, Profil-Avatare, illustrierte Karten, Infografiken, Magazin-Social-Cards, Foto-Restaurierung, exploded-view Produktillustrationen |
| **Video** | `seedance-2.0` | ByteDance Volcengine | 15s cinematic t2v + i2v mit Audio — narrative Shorts, Charakter-Close-ups, Produktfilme, MV-Choreografie |
| **Video** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 Motion Graphics — Produkt-Reveals, kinetische Typografie, Datendiagramme, Social Overlays, Logo-Outros, TikTok-Verticals mit Karaoke-Captions |

Die wachsende **Prompt-Galerie** unter [`prompt-templates/`](prompt-templates/) liefert **93 sofort reproduzierbare Prompts** — 43 image (`prompt-templates/image/*.json`), 39 Seedance (`prompt-templates/video/*.json` ohne `hyperframes-*`), 11 HyperFrames (`prompt-templates/video/hyperframes-*.json`). Jeder Eintrag trägt ein Vorschau-Thumbnail, den Prompt-Body wortwörtlich, das Zielmodell, die Aspect Ratio und einen `source`-Block für Lizenz + Attribution. Der daemon serviert sie unter `GET /api/prompt-templates`, die Web-App zeigt sie als Card-Grid in den Tabs **Image templates** und **Video templates** der Entry-View; ein Klick legt den Prompt mit dem richtigen vorausgewählten Modell in den Composer.

### gpt-image-2 — Image-Galerie (Auswahl aus 43)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>3-stufige Infografik im Stein-Look</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>Editorial-Reiseposter, handillustriert</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>Editorial Fashion Still als Einzelframe</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>Profil-Avatar — Neon-Face-Text</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>Editorial Studio-Porträt</sub></td>
</tr>
</table>

Komplettes Set → [`prompt-templates/image/`](prompt-templates/image/). Quellen: meist aus [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0), Autor-Attribution pro Template erhalten.

### Seedance 2.0 — Video-Galerie (Auswahl aus 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>4K cinematic Studio-Film</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>Cinematic Mikroexpression-Studie</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>Narrative Produktfilm</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>Stilisierter Satire-Short</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15s Seedance 2.0 Narrativ</sub></td>
</tr>
</table>

Klicken Sie auf ein Thumbnail, um das tatsächlich gerenderte MP4 abzuspielen. Komplettes Set → [`prompt-templates/video/`](prompt-templates/video/) (die `*-seedance-*` und Cinematic-getaggten Einträge). Quellen: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0), Original-Tweet-Links und Autor-Handles erhalten.

### HyperFrames — HTML→MP4 Motion Graphics (11 sofort reproduzierbare Templates)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) ist HeyGens Open-Source-, agent-natives Video-Framework — Sie (oder der Agent) schreiben HTML + CSS + GSAP, HyperFrames rendert deterministisch zu MP4 via Headless-Chrome + FFmpeg. Open Design liefert HyperFrames als first-class Video-Modell (`hyperframes-html`) verdrahtet im daemon-Dispatch, plus den `skills/hyperframes/`-Skill, der dem Agent Timeline-Vertrag, Scene-Transition-Regeln, Audio-Reactive-Patterns, Captions/TTS und die Catalog-Blocks (`npx hyperframes add <slug>`) beibringt.

Elf HyperFrames-Prompts liegen unter [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/), jeder ein konkreter Brief, der einen spezifischen Archetyp produziert:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5s minimaler Produkt-Reveal</b> · 16:9 · Push-in Title-Card mit Shader-Transition</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30s SaaS-Produkt-Promo</b> · 16:9 · Linear/ClickUp-Stil mit UI-3D-Reveals</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok-Karaoke-Talking-Head</b> · 9:16 · TTS + wortgenau synchronisierte Captions</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30s Brand-Sizzle-Reel</b> · 16:9 · beat-synchrone kinetische Typografie, audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>Animiertes Bar-Chart-Race</b> · 16:9 · NYT-Stil Daten-Infografik</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Flugkarte (Origin → Dest)</b> · 16:9 · Apple-Stil cinematic Route-Reveal</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4s cinematic Logo-Outro</b> · 16:9 · Stück-für-Stück-Aufbau + Bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K Money-Counter</b> · 9:16 · Apple-Stil Hype mit Green-Flash + Burst</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>3-Phone App-Showcase</b> · 16:9 · schwebende Phones mit Feature-Callouts</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>Social-Overlay-Stack</b> · 9:16 · X · Reddit · Spotify · Instagram nacheinander</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Website-zu-Video-Pipeline</b> · 16:9 · captured Site bei 3 Viewports + Transitions</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

Das Muster ist dasselbe wie sonst: Template wählen, Brief editieren, senden. Der Agent liest das mitgelieferte `skills/hyperframes/SKILL.md` (das den OD-spezifischen Render-Workflow enthält — Composition-Source-Files in einen `.hyperframes-cache/`, damit sie den File-Workspace nicht verschmutzen, daemon dispatcht `npx hyperframes render`, um den macOS-sandbox-exec/Puppeteer-Hang zu umgehen, nur die finale `.mp4` landet als Projekt-Chip), schreibt die Composition und liefert ein MP4. Catalog-Block-Thumbnails © HeyGen, von deren CDN; das OSS-Framework selbst ist Apache-2.0.

> **Auch verdrahtet, aber noch nicht als Templates aufgetaucht:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (via Fal), MiniMax video-01 — alle in `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5, Udio v2, Lyria 2 (Music) und gpt-4o-mini-tts, MiniMax TTS (Speech) decken die Audio-Surface ab. Templates dafür sind offene Beiträge — JSON in `prompt-templates/video/` oder `prompt-templates/audio/` legen, taucht im Picker auf.

## Jenseits des Chats — was sonst mitgeliefert wird

Der Chat-/Artifact-Loop steht im Rampenlicht, aber einige weniger sichtbare Fähigkeiten sind bereits verdrahtet und wichtig, bevor Sie OD mit etwas anderem vergleichen:

- **Claude Design ZIP import.** Ziehen Sie einen Export von claude.ai in den Welcome Dialog. `POST /api/import/claude-design` extrahiert ihn in ein echtes `.od/projects/<id>/`, öffnet die Entry-Datei als Tab und bereitet einen Continue-where-Anthropic-left-off Prompt für Ihren lokalen Agent vor. Kein erneutes Prompting, kein "ask the model to re-create what we just had". ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **OpenAI-kompatibler BYOK proxy.** `POST /api/proxy/stream` nimmt `{ baseUrl, apiKey, model, messages }`, normalisiert den Pfad (`…/v1/chat/completions`), leitet SSE-Chunks an den Browser zurück und lehnt loopback / link-local / RFC1918 Ziele ab, um SSRF zu verhindern. Alles, was das OpenAI Chat Schema spricht, funktioniert: Anthropic-via-OpenAI shim, DeepSeek, Groq, MiMo, OpenRouter, Ihr selbst gehostetes vLLM. MiMo bekommt automatisch `tool_choice: 'none'`, weil sein Tool Schema bei freier Generierung Probleme macht.
- **User-saved templates.** Wenn Ihnen ein Render gefällt, snapshottet `POST /api/templates` HTML + Metadata in die SQLite `templates` Tabelle. Das nächste Projekt wählt es aus einer "your templates" Zeile im Picker: dieselbe Oberfläche wie die mitgelieferten 31, aber Ihre eigene.
- **Tab persistence.** Jedes Projekt merkt sich offene Dateien und aktiven Tab in der `tabs` Tabelle. Öffnen Sie das Projekt morgen wieder, und der Workspace sieht genau so aus, wie Sie ihn verlassen haben.
- **Artifact lint API.** `POST /api/artifacts/lint` führt strukturelle Checks auf einem generierten Artifact aus (kaputtes `<artifact>` Framing, fehlende Side Files, stale palette tokens) und gibt Findings zurück, die der Agent in seinen nächsten Turn einlesen kann. Die fünfdimensionale Self-Critique nutzt das, um ihren Score auf echte Evidenz statt Vibes zu stützen.
- **Sidecar protocol + desktop automation.** Daemon-, Web- und Desktop-Prozesse tragen typisierte Five-Field-Stamps (`app · mode · namespace · ipc · source`) und expose'n einen JSON-RPC IPC Channel unter `/tmp/open-design/ipc/<namespace>/<app>.sock`. `tools-dev inspect desktop status \| eval \| screenshot` steuert diesen Channel, sodass Headless-E2E gegen eine echte Electron Shell funktioniert, ohne bespoke Harnesses ([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Windows-friendly spawning.** Jeder Adapter, der sonst am ~32 KB argv Limit von `CreateProcess` bei langen zusammengesetzten Prompts scheitern würde (Codex, Gemini, OpenCode, Cursor Agent, Qwen, Qoder CLI, Pi), füttert den Prompt stattdessen über stdin. Claude Code und Copilot behalten `-p`; der daemon fällt auf eine temp prompt-file zurück, wenn selbst das überläuft.
- **Per-namespace runtime data.** `OD_DATA_DIR` und `--namespace` geben Ihnen vollständig isolierte `.od/`-artige Trees, damit Playwright, Beta Channels und Ihre echten Projekte nie dieselbe SQLite-Datei teilen.

## Anti-AI-Slop-Maschinerie

Die gesamte Maschinerie unten ist das [`huashu-design`](https://github.com/alchaincyf/huashu-design) Playbook, portiert in ODs Prompt Stack und pro Skill über Side-File-Pre-Flight erzwingbar. Lesen Sie [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) für die Live-Formulierung:

- **Question form first.** Turn 1 ist nur `<question-form>`: kein Denken, keine Tools, keine Narration. Der Nutzer wählt Defaults mit Radio-Geschwindigkeit.
- **Brand-spec extraction.** Wenn der Nutzer Screenshot oder URL anhängt, führt der Agent ein fünfstufiges Protokoll aus (locate · download · grep hex · codify `brand-spec.md` · vocalise), bevor er CSS schreibt. **Er rät Brandfarben niemals aus Erinnerung.**
- **Five-dim critique.** Vor dem Ausgeben von `<artifact>` bewertet der Agent seine Ausgabe still 1–5 über philosophy / hierarchy / execution / specificity / restraint. Alles unter 3/5 ist eine Regression: fixen und neu scoren. Zwei Durchgänge sind normal.
- **P0/P1/P2 checklist.** Jeder Skill liefert ein `references/checklist.md` mit harten P0 Gates. Der Agent muss P0 bestehen, bevor er ausgibt.
- **Slop blacklist.** Aggressive violette Gradients, generische Emoji Icons, runde Karte mit linkem Border Accent, handgezeichnete SVG-Menschen, Inter als *display* Face, erfundene Metriken: im Prompt ausdrücklich verboten.
- **Honest placeholders > fake stats.** Wenn der Agent keine echte Zahl hat, schreibt er `—` oder einen beschrifteten grauen Block, nicht "10× faster".

## Vergleich

| Achse | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Lizenz | Closed | MIT | **Apache-2.0** |
| Formfaktor | Web (claude.ai) | Desktop (Electron) | **Web-App + lokaler Daemon** |
| Auf Vercel deploybar | ❌ | ❌ | **✅** |
| Agent-Runtime | Gebündelt (Opus 4.7) | Gebündelt ([`pi-ai`][piai]) | **Delegiert an die vorhandene CLI des Nutzers** |
| Skills | Proprietär | 12 Custom-TS-Module + `SKILL.md` | **31 dateibasierte [`SKILL.md`][skill] Bundles, einfach ablegbar** |
| Designsystem | Proprietär | `DESIGN.md` (v0.2 Roadmap) | **`DESIGN.md` × 72 ausgelieferte Systeme** |
| Provider-Flexibilität | Nur Anthropic | 7+ über [`pi-ai`][piai] | **16 CLI-Adapter + OpenAI-kompatibler BYOK-Proxy** |
| Initiales Fragenformular | ❌ | ❌ | **✅ Harte Regel, Turn 1** |
| Richtungswahl | ❌ | ❌ | **✅ 5 deterministische Richtungen** |
| Live-Todo-Fortschritt + Tool-Stream | ❌ | ✅ | **✅** (UX-Pattern aus open-codesign) |
| Sandboxed-iframe-Vorschau | ❌ | ✅ | **✅** (Pattern aus open-codesign) |
| Claude Design ZIP-Import | n/a | ❌ | **✅ `POST /api/import/claude-design` — dort weiterbearbeiten, wo Anthropic aufgehört hat** |
| Chirurgische Edits im Kommentar-Modus | ❌ | ✅ | 🚧 Roadmap (aus [`open-codesign`][ocod] übernehmen) |
| AI-emitted Tweaks Panel | ❌ | ✅ | 🟡 Teilweise — [`tweaks` skill](skills/tweaks/) wird geliefert, dedizierte chatseitige Panel-UX bleibt Roadmap |
| Dateisystemnaher Workspace | ❌ | Teilweise (Electron-Sandbox) | **✅ Echtes cwd, echte Tools, persistentes SQLite (projects · conversations · messages · tabs · templates)** |
| 5-dimensionale Self-Critique | ❌ | ❌ | **✅ Pre-Emit-Gate** |
| Artifact Lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — Findings fließen zurück zum Agent** |
| Sidecar-IPC + headless Desktop | ❌ | ❌ | **✅ Gestempelte Prozesse + `tools-dev inspect desktop status \| eval \| screenshot`** |
| Exportformate | Begrenzt | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (agent-driven) / ZIP / Markdown** |
| PPT-Skill-Wiederverwendung | N/A | Built-in | **[`guizang-ppt-skill`][guizang] wird eingehängt (Default für deck mode)** |
| Mindestabrechnung | Pro / Max / Team | BYOK | **BYOK — jede OpenAI-kompatible `baseUrl` einfügen** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Unterstützte Code-Agenten

Beim daemon Boot automatisch aus `PATH` erkannt. Keine Konfiguration nötig. Streaming Dispatch lebt in [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`); per-CLI Parser liegen daneben. Modelle werden entweder durch Probing von `<bin> --list-models` / `<bin> models` / ACP Handshake befüllt oder aus einer kuratierten Fallback-Liste, wenn die CLI keine Liste ausgibt.

| Agent | Bin | Stream-Format | Argv-Form (zusammengesetzter Prompt-Pfad) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (typed events) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` Parser | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]` (Prompt über stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` Parser | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]` (Prompt über stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` Parser | `opencode run --format json --dangerously-skip-permissions [--model …] -` (Prompt über stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` Parser | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (Prompt über stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (rohe stdout Chunks) | `qwen --yolo [--model …] -` (Prompt über stdin) |
| Qoder CLI | `qodercli` | `qoder-stream-json` (typed events) | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (Prompt über stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (typed events) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc [--model …] [--thinking …]` (Prompt als RPC-`prompt` Befehl gesendet) |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (raw stdout chunks) | `deepseek exec --auto [--model …] <prompt>` |
| **OpenAI-compatible BYOK** | n/a | SSE pass-through | `POST /api/proxy/stream` → `<baseUrl>/v1/chat/completions`; SSRF-guarded against loopback / link-local / RFC1918 |

Eine neue CLI ist ein Eintrag in [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). Streaming Format ist eines von `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream` (mit per-CLI `eventParser`), `acp-json-rpc`, `pi-rpc` oder `plain`.

## Referenzen & Herkunft

Jedes externe Projekt, aus dem dieses Repo etwas übernimmt. Jeder Link führt zur Quelle, damit Sie die Provenienz prüfen können.

| Projekt | Rolle hier |
|---|---|
| [`Claude Design`][cd] | Das closed-source Produkt, zu dem dieses Repo die Open-Source-Alternative ist. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | Der Design-Philosophie-Kern. Junior-Designer Workflow, 5-step brand-asset protocol, anti-AI-slop checklist, fünfdimensionale Self-Critique und die "5 schools × 20 design philosophies" Bibliothek hinter unserem Direction Picker, alles verdichtet in [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) und [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | Web-PPT-Skill im Magazinstil, unverändert unter [`skills/guizang-ppt/`](skills/guizang-ppt/) gebündelt, ursprüngliche LICENSE bewahrt. Default für den Deck-Modus. P0/P1/P2 Checklist-Kultur für jeden anderen Skill übernommen. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Die daemon + adapter Architektur. PATH-Scan-Agent-Erkennung, lokaler daemon als einziger privilegierter Prozess, Agent-as-teammate Sichtweise. Wir übernehmen das Modell, nicht den Code. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | Die erste Open-Source-Alternative zu Claude Design und unser nächster Peer. Übernommene UX Patterns: streaming-artifact loop, sandboxed-iframe preview (vendored React 18 + Babel), live agent panel (todos + tool calls + interruptible), fünf Exportformate (HTML/PDF/PPTX/ZIP/Markdown), local-first storage hub, `SKILL.md` taste-injection. UX Patterns auf unserer Roadmap: comment-mode surgical edits, AI-emitted tweaks panel. **Wir vendoren [`pi-ai`][piai] bewusst nicht**: open-codesign bündelt es als Agent Runtime; wir delegieren an die CLI, die der Nutzer bereits hat. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | Quelle des 9-Section `DESIGN.md` Schemas und der 69 Produktsysteme, die über [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) importiert wurden. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Inspiration für symlink-basierte Skill-Verteilung über mehrere Agent-CLIs. |
| [Claude Code skills][skill] | Die `SKILL.md` Konvention wurde unverändert übernommen: Jeder Claude Code Skill kann in `skills/` gelegt werden und wird vom daemon gefunden. |

Der ausführliche Provenienztext, was wir jeweils übernehmen und was bewusst nicht, steht in [`docs/references.md`](docs/references.md).

## Roadmap

- [x] Daemon + agent detection (16 CLI adapters) + skill registry + design-system catalog
- [x] Web app + chat + question form + 5-direction picker + todo progress + sandboxed preview
- [x] 31 skills + 72 design systems + 5 visual directions + 5 device frames
- [x] SQLite-backed projects · conversations · messages · tabs · templates
- [x] OpenAI-compatible BYOK proxy (`/api/proxy/stream`) with SSRF guard
- [x] Claude Design ZIP import (`/api/import/claude-design`)
- [x] Sidecar protocol + Electron desktop with IPC automation (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] Artifact lint API + 5-dim self-critique pre-emit gate
- [ ] Comment-mode surgical edits (click element → instruction → patch) — pattern from [`open-codesign`][ocod]
- [ ] AI-emitted tweaks panel UX — building block ([`tweaks` skill](skills/tweaks/)) ships; chat-integrated panel still pending
- [ ] Vercel + tunnel deployment recipe (Topology B)
- [ ] One-command `npx od init` to scaffold a project with `DESIGN.md`
- [ ] Skill marketplace (`od skills install <github-repo>`) and `od skill add | list | remove | test` CLI surface (drafted in [`docs/skills-protocol.md`](docs/skills-protocol.md), implementation pending)
- [x] Packaged Electron build out of `apps/packaged/` — macOS (Apple Silicon) und Windows (x64) Downloads auf [open-design.ai](https://open-design.ai/) und der [GitHub Releases-Seite](https://github.com/nexu-io/open-design/releases)

Phased delivery → [`docs/roadmap.md`](docs/roadmap.md).

## Status

Dies ist eine frühe Implementierung: Der geschlossene Loop (detect → pick skill + design system → chat → parse `<artifact>` → preview → save) läuft end-to-end. Prompt Stack und Skill-Bibliothek tragen den größten Wert und sind stabil. Die komponentenbezogene UI wird täglich ausgeliefert.

## Geben Sie uns einen Star

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Wenn Ihnen das dreißig Minuten gespart hat, geben Sie ein ★. Stars bezahlen keine Miete, aber sie zeigen dem nächsten Designer, Agent und Contributor, dass dieses Experiment Aufmerksamkeit verdient. Ein Klick, drei Sekunden, echtes Signal: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Mitwirken

Issues, PRs, neue Skills und neue Design Systems sind willkommen. Die wirkungsvollsten Beiträge sind meist ein Ordner, eine Markdown-Datei oder ein PR-großer Adapter:

- **Add a skill** — legen Sie einen Ordner in [`skills/`](skills/) an, der der [`SKILL.md`][skill] Konvention folgt.
- **Add a design system** — legen Sie ein `DESIGN.md` in [`design-systems/<brand>/`](design-systems/) nach dem 9-Section Schema ab.
- **Wire up a new coding-agent CLI** — ein Eintrag in [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

Vollständiger Walkthrough, Merge-Messlatte, Code Style und was wir nicht annehmen → [`CONTRIBUTING.de.md`](CONTRIBUTING.de.md) ([English](CONTRIBUTING.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Mitwirkende

Danke an alle, die Open Design vorangebracht haben: durch Code, Docs, Feedback, neue Skills, neue Design Systems oder auch ein scharfes Issue. Jeder echte Beitrag zählt, und die Wand unten ist die einfachste Art, das laut zu sagen.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-07" alt="Open Design contributors" />
</a>

Wenn Sie Ihren ersten PR gemergt haben: willkommen. Das Label [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) ist der Einstiegspunkt.

## Repository-Aktivität

<picture>
  <img alt="Open Design — repository metrics" src="docs/assets/github-metrics.svg" />
</picture>

Das SVG oben wird täglich von [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) mit [`lowlighter/metrics`](https://github.com/lowlighter/metrics) regeneriert. Lösen Sie auf dem **Actions** Tab manuell eine Aktualisierung aus, wenn Sie sie früher brauchen; für reichere Plugins (traffic, follow-up time) fügen Sie ein `METRICS_TOKEN` Repository Secret mit einem fine-grained PAT hinzu.

## Star-Historie

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-07" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-07" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-07" />
  </picture>
</a>

Wenn die Kurve nach oben biegt, ist das das Signal, nach dem wir suchen. ★ dieses Repo, um sie anzuschieben.

## Lizenz

Apache-2.0. Das gebündelte [`skills/guizang-ppt/`](skills/guizang-ppt/) behält seine ursprüngliche [LICENSE](skills/guizang-ppt/LICENSE) (MIT) und Autorenschaftszuordnung zu [op7418](https://github.com/op7418).
