# Open Design

> **La alternativa open source a [Claude Design][cd].** Local-first, desplegable en web, BYOK en cada capa: **16 CLI de coding agents** detectadas automáticamente en tu `PATH` (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI) se convierten en el motor de diseño, impulsadas por **31 Skills componibles** y **72 Design Systems de nivel marca**. ¿No tienes una CLI? Un proxy BYOK compatible con OpenAI ejecuta el mismo bucle sin el spawn local.

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
  <a href="https://github.com/nexu-io/open-design/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#coding-agents-soportados"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-systems"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Español</b> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## Por qué existe

[Claude Design][cd] de Anthropic (lanzado el 2026-04-17 con Opus 4.7) mostró qué pasa cuando un LLM deja de escribir prosa y empieza a entregar artefactos de diseño. Se volvió viral, pero siguió siendo closed-source, de pago, cloud-only y bloqueado al modelo y las skills de Anthropic. No hay checkout, no hay self-hosting, no hay despliegue en Vercel y no hay forma de cambiarlo por tu propio agente.

**Open Design (OD) es la alternativa open source.** El mismo bucle, el mismo modelo mental artifact-first, sin lock-in. No distribuimos un agente: los coding agents más fuertes ya viven en tu laptop. Los conectamos a un flujo de diseño guiado por skills que corre localmente con `pnpm tools-dev`, puede desplegar la capa web en Vercel y mantiene BYOK en cada capa.

Escribe `make me a magazine-style pitch deck for our seed round`. El formulario interactivo aparece antes de que el modelo improvise un solo píxel. El agente elige una de cinco direcciones visuales curadas. Un plan `TodoWrite` en vivo se transmite en la UI. El daemon crea una carpeta real en disco con una plantilla inicial, una biblioteca de layouts y una checklist de autoevaluación. El agente las lee, con pre-flight obligatorio, ejecuta una crítica de cinco dimensiones sobre su propia salida y emite un único `<artifact>` que se renderiza segundos después en un iframe sandboxed.

Eso no es "AI tries to design something". Es una IA entrenada por el prompt stack para comportarse como un diseñador senior con filesystem real, una biblioteca de paletas determinista y cultura de checklist: exactamente el estándar que Claude Design marcó, pero abierto y tuyo.

OD se apoya en cuatro hombros open source:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design): la brújula de filosofía de diseño. El flujo Junior-Designer, el protocolo de marca en 5 pasos, la checklist anti-AI-slop, la autocrítica de 5 dimensiones y la idea de "5 schools × 20 design philosophies" detrás del selector de dirección, todo destilado en [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill): el modo deck. Incluido literalmente bajo [`skills/guizang-ppt/`](skills/guizang-ppt/) con la LICENSE original preservada; layouts magazine-style, hero WebGL y checklists P0/P1/P2.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign): la estrella norte de UX y nuestro par más cercano. La primera alternativa open source a Claude Design. Tomamos prestados su bucle streaming-artifact, el patrón de preview en iframe sandboxed (React 18 + Babel vendorizados), su panel de agente en vivo (todos + tool calls + generación interrumpible) y su lista de cinco formatos de exportación (HTML / PDF / PPTX / ZIP / Markdown). Divergimos deliberadamente en el formato: ellos son una app Electron de escritorio con [`pi-ai`][piai]; nosotros somos una web app + daemon local que delega en tu CLI existente.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica): la arquitectura daemon-and-runtime. Detección de agentes en `PATH`, el daemon local como único proceso privilegiado y la visión del agente como compañero de equipo.

## De un vistazo

| | Lo que obtienes |
|---|---|
| **Coding-agent CLIs (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — auto-detectadas en `PATH`, intercambiables con un clic |
| **Fallback BYOK** | Proxy API específico por protocolo en `/api/proxy/{anthropic,openai,azure,google}/stream`: pega `baseUrl` + `apiKey` + `model`, elige Anthropic / OpenAI / Azure OpenAI / Google Gemini, y el daemon normaliza SSE de vuelta al mismo stream de chat. IP internas/SSRF bloqueadas en el borde del daemon. |
| **Design systems incluidos** | **129**: 2 starters escritos a mano + 70 sistemas de producto (Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu, …) desde [`awesome-design-md`][acd2], más 57 design skills desde [`awesome-design-skills`][ads] añadidas directamente bajo `design-systems/` |
| **Skills incluidas** | **31**: 27 en modo `prototype` (web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs, …) + 4 en modo `deck` (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). Agrupadas en el selector por `scenario`: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **Generación de medios** | Superficies de imagen · video · audio junto al bucle de diseño. **gpt-image-2** (Azure / OpenAI) para pósters, avatares, infografías y mapas ilustrados · **Seedance 2.0** (ByteDance) para text-to-video e image-to-video cinematográfico de 15s · **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) para motion graphics HTML→MP4 (product reveals, tipografía cinética, charts de datos, overlays sociales, logo outros). **93** prompts listos para replicar: 43 gpt-image-2 + 39 Seedance + 11 HyperFrames bajo [`prompt-templates/`](prompt-templates/), con thumbnails de preview y atribución de fuente. La misma superficie de chat que el código; produce chips reales `.mp4` / `.png` en el workspace del proyecto. |
| **Direcciones visuales** | 5 escuelas curadas (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental): cada una trae una paleta OKLch determinista + font stack ([`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)) |
| **Frames de dispositivo** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome: pixel-perfect, compartidos entre skills bajo [`assets/frames/`](assets/frames/) |
| **Runtime de agente** | El daemon local spawnea la CLI en la carpeta del proyecto: el agente recibe `Read`, `Write`, `Bash`, `WebFetch` reales contra un entorno real en disco, con fallbacks de Windows `ENAMETOOLONG` (stdin / prompt-file) en cada adapter |
| **Imports** | Suelta un ZIP exportado desde [Claude Design][cd] en el diálogo de bienvenida: `POST /api/import/claude-design` lo parsea en un proyecto real para que tu agente siga editando donde Anthropic lo dejó |
| **Persistencia** | SQLite en `.od/app.sqlite`: projects · conversations · messages · tabs · saved templates. Reabre mañana y la tarjeta de todo y los archivos abiertos estarán exactamente donde los dejaste. |
| **Lifecycle** | Un punto de entrada: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check): arranca daemon + web (+ desktop) bajo sidecar stamps tipados |
| **Desktop** | Shell Electron opcional con renderer sandboxed + sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — impulsa `tools-dev inspect desktop screenshot` para E2E |
| **Desplegable en** | Local (`pnpm tools-dev`) · capa web en Vercel · Electron empaquetado (placeholder, en curso) |
| **Licencia** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## Demo

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Vista de entrada" /><br/>
<sub><b>Vista de entrada</b> — elige una skill, elige un design system y escribe el brief. La misma superficie para prototipos, decks, apps móviles, dashboards y páginas editoriales.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Formulario de descubrimiento del primer turno" /><br/>
<sub><b>Formulario de descubrimiento del primer turno</b> — antes de que el modelo escriba un píxel, OD fija el brief: superficie, audiencia, tono, contexto de marca y escala. 30 segundos de radios superan 30 minutos de redirecciones.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Selector de dirección" /><br/>
<sub><b>Selector de dirección</b> — cuando el usuario no tiene marca, el agente emite un segundo formulario con 5 direcciones curadas (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). Un clic de radio → una paleta determinista + font stack, sin freestyle del modelo.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Progreso todo en vivo" /><br/>
<sub><b>Progreso todo en vivo</b> — el plan del agente se transmite como una tarjeta en vivo. Las actualizaciones <code>in_progress</code> → <code>completed</code> llegan en tiempo real. El usuario puede redirigir barato, a mitad del vuelo.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Preview sandboxed" /><br/>
<sub><b>Preview sandboxed</b> — cada <code>&lt;artifact&gt;</code> se renderiza en un iframe srcdoc limpio. Editable en sitio mediante el file workspace; descargable como HTML, PDF o ZIP.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · Biblioteca de 72 sistemas" /><br/>
<sub><b>Biblioteca de 72 sistemas</b> — cada sistema de producto muestra su firma de 4 colores. Haz clic para ver el <code>DESIGN.md</code> completo, la cuadrícula de muestras y el showcase en vivo.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Magazine deck" /><br/>
<sub><b>Modo deck (guizang-ppt)</b> — el <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> incluido entra sin cambios. Layouts magazine, fondos hero WebGL, salida HTML single-file y export PDF.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Prototipo móvil" /><br/>
<sub><b>Prototipo móvil</b> — chrome de iPhone 15 Pro pixel-perfect (Dynamic Island, SVGs de status bar, home indicator). Los prototipos multi-screen usan los assets compartidos de <code>/frames/</code>, así el agente nunca redibuja un teléfono.</sub>
</td>
</tr>
</table>

## Skills

**31 skills vienen incluidas.** Cada una es una carpeta bajo [`skills/`](skills/) siguiendo la convención [`SKILL.md`][skill] de Claude Code, con un frontmatter extendido `od:` que el daemon parsea literalmente: `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Dos **modos** principales sostienen el catálogo: **`prototype`** (27 skills: cualquier cosa que renderiza como artefacto single-page, desde una landing editorial hasta una pantalla móvil o un PM spec doc) y **`deck`** (4 skills: presentaciones con swipe horizontal y chrome de deck-framework). El campo **`scenario`** es lo que el selector usa para agruparlas: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### Ejemplos showcase

Las skills visualmente distintivas que probablemente probarás primero. Cada una trae un `example.html` real que puedes abrir directamente desde el repo para ver exactamente lo que producirá el agente, sin auth ni setup.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Dashboard consumer dating / matchmaking — navegación lateral izquierda, ticker bar, KPIs, chart de mutual matches a 30 días y tipografía editorial.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>E-guide digital de dos spreads — portada (título, autor, teaser de TOC) + spread de lección con pull-quote y lista de pasos. Tono creator / lifestyle.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>Email HTML de lanzamiento de producto de marca — masthead, hero image, headline lockup, CTA y specs grid. Columna única centrada, seguro con table fallback.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Prototipo de app móvil gamificada en tres frames sobre un escenario showcase oscuro — portada, misiones de hoy con ribbons de XP + barra de nivel y detalle de misión.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Flujo de onboarding móvil en tres frames — splash, value-prop, sign-in. Status bar, swipe dots y CTA principal.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Hero motion-design de un frame con animaciones CSS en loop — anillo tipográfico rotatorio, globo animado y temporizador en marcha. Listo para hand-off a HyperFrames.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Carrusel social de tres cards 1080×1080 — paneles cinematográficos con titulares display que conectan la serie, marca y affordance de loop.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Slide explicativo animado pixel / 8-bit — escenario crema full-bleed, mascota pixel animada, display type japonés cinético y keyframes CSS en loop.</sub>
</td>
</tr>
</table>

### Superficies de diseño y marketing (modo prototype)

| Skill | Plataforma | Escenario | Qué produce |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | HTML single-page: landings, marketing, hero pages (default para prototype) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Layout de hero / features / pricing / CTA |
| [`dashboard`](skills/dashboard/) | desktop | operation | Admin / analytics con sidebar + layout denso de datos |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | Pricing independiente + tablas comparativas |
| [`docs-page`](skills/docs-page/) | desktop | engineering | Documentación de 3 columnas |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Long-form editorial |
| [`mobile-app`](skills/mobile-app/) | mobile | design | Pantalla(s) de app en frame iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Flujo mobile onboarding multi-screen (splash · value-prop · sign-in) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Prototipo gamificado mobile en tres frames |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | Email HTML de lanzamiento de producto (seguro con table fallback) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | Carrusel social 1080×1080 de 3 cards |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Póster single-page estilo revista |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Hero motion-design con animaciones CSS en loop |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Slide explicativo pixel / 8-bit animado |
| [`dating-web`](skills/dating-web/) | desktop | personal | Mockup de dashboard consumer dating |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | E-guide digital de dos spreads (cover + lesson) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Boceto de ideación hand-drawn para el pase de "mostrar algo visible temprano" |
| [`critique`](skills/critique/) | desktop | design | Hoja de autocrítica de cinco dimensiones (Philosophy · Hierarchy · Detail · Function · Innovation) |
| [`tweaks`](skills/tweaks/) | desktop | design | Panel de tweaks emitido por la IA: el modelo expone los parámetros que vale la pena ajustar |

### Superficies deck (modo deck)

| Skill | Default para | Qué produce |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **default** para deck | Web PPT estilo revista: incluido literalmente desde [op7418/guizang-ppt-skill][guizang], LICENSE original preservada |
| [`simple-deck`](skills/simple-deck/) | — | Deck minimal de swipe horizontal |
| [`replit-deck`](skills/replit-deck/) | — | Deck de walkthrough de producto (estilo Replit) |
| [`weekly-update`](skills/weekly-update/) | — | Cadencia semanal de equipo como swipe deck (progress · blockers · next) |

### Superficies de oficina y operaciones (modo prototype, escenarios tipo documento)

| Skill | Escenario | Qué produce |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | Documento de PM spec con TOC + decision log |
| [`team-okrs`](skills/team-okrs/) | product | Hoja de OKR |
| [`meeting-notes`](skills/meeting-notes/) | operation | Registro de decisiones de reunión |
| [`kanban-board`](skills/kanban-board/) | operation | Snapshot de tablero |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Runbook de incidente |
| [`finance-report`](skills/finance-report/) | finance | Resumen financiero ejecutivo |
| [`invoice`](skills/invoice/) | finance | Factura single-page |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | Plan de onboarding de rol |

Añadir una skill toma una carpeta. Lee [`docs/skills-protocol.md`](docs/skills-protocol.md) para el frontmatter extendido, haz fork de una skill existente, reinicia el daemon y aparecerá en el selector. El endpoint de catálogo es `GET /api/skills`; el armado de seed por skill (template + referencias side-file) vive en `GET /api/skills/:id/example`.

## Seis ideas centrales

### 1 · No distribuimos un agente. El tuyo es suficiente.

El daemon escanea tu `PATH` buscando [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), `devin`, [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), `qodercli`, [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi`, [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), [`kiro-cli`](https://kiro.dev), `kilo`, [`vibe-acp`](https://github.com/mistralai/mistral-vibe) y `deepseek` al iniciar. Los que encuentra se vuelven motores de diseño candidatos, controlados por stdio con un adapter por CLI y reemplazables desde el selector de modelo. Inspirado por [`multica`](https://github.com/multica-ai/multica) y [`cc-switch`](https://github.com/farion1231/cc-switch). ¿Sin CLI instalada? El modo API es el mismo pipeline sin spawn: elige Anthropic, OpenAI-compatible, Azure OpenAI o Google Gemini y el daemon devuelve chunks SSE normalizados, rechazando loopback / link-local / RFC1918 en el borde.

### 2 · Las Skills son archivos, no plugins.

Siguiendo la convención [`SKILL.md`](https://docs.anthropic.com/en/docs/claude-code/skills) de Claude Code, cada skill es `SKILL.md` + `assets/` + `references/`. Suelta una carpeta en [`skills/`](skills/), reinicia el daemon y aparece en el selector. El `magazine-web-ppt` incluido es [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) commiteado literalmente: licencia original preservada, atribución preservada.

### 3 · Los Design Systems son Markdown portable, no theme JSON.

El schema `DESIGN.md` de 9 secciones de [`VoltAgent/awesome-design-md`][acd2]: color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. Cada artefacto lee desde el sistema activo. Cambia el sistema → el siguiente render usa los nuevos tokens. El dropdown viene con **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…**, más 57 design skills tomadas de [`awesome-design-skills`][ads].

### 4 · El formulario interactivo evita el 80% de redirecciones.

El prompt stack de OD fija una `RULE 1`: cada brief de diseño nuevo empieza con un `<question-form id="discovery">` en lugar de código. Surface · audience · tone · brand context · scale · constraints. Incluso un brief largo deja decisiones de diseño abiertas: tono visual, postura de color, escala. Son exactamente las cosas que el formulario cierra en 30 segundos. El costo de una dirección equivocada es una ronda de chat, no un deck terminado.

Este es el **Junior-Designer mode** destilado de [`huashu-design`](https://github.com/alchaincyf/huashu-design): agrupar preguntas al inicio, mostrar algo visible temprano (incluso un wireframe con bloques grises) y permitir redirección barata. Combinado con el protocolo de brand assets (locate · download · `grep` hex · write `brand-spec.md` · vocalise), es la principal razón por la que el output deja de sentirse como freestyle de IA y empieza a sentirse como un diseñador que prestó atención antes de pintar.

### 5 · El daemon hace que el agente se sienta en tu laptop, porque lo está.

El daemon spawnea la CLI con `cwd` apuntando a la carpeta de artefactos del proyecto bajo `.od/projects/<id>/`. El agente recibe `Read`, `Write`, `Bash`, `WebFetch`: herramientas reales contra un filesystem real. Puede `Read` el `assets/template.html` de la skill, hacer `grep` de tus CSS para valores hex, escribir `brand-spec.md`, guardar imágenes generadas y producir archivos `.pptx` / `.zip` / `.pdf` que aparecen en el workspace como chips de descarga al terminar el turno. Sesiones, conversaciones, mensajes y pestañas persisten en SQLite local: abre el proyecto mañana y la tarjeta de todo del agente estará donde la dejaste.

### 6 · El prompt stack es el producto.

Lo que se compone al enviar no es "system + user". Es:

```
DISCOVERY directives  (turn-1 form, turn-2 brand branch, TodoWrite, 5-dim critique)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 systems available)
  + active SKILL.md    (31 skills available)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (auto-injected pre-flight: read assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

Cada capa es componible. Cada capa es un archivo que puedes editar. Lee [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) y [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) para ver el contrato real.

## Arquitectura

```
┌────────────────────── browser (Next.js 16) ──────────────────────┐
│  chat · file workspace · iframe preview · settings · imports     │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ /api/* (rewritten in dev)          │
               ▼                                    ▼
   ┌──────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  Local daemon (Express + SQLite) │   ─→ any OpenAI-compat
   │                                  │       endpoint (BYOK)
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
   │  qwen · qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro (ACP) · kilo (ACP) · vibe (ACP) · deepseek  │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk            │
   └──────────────────────────────────────────────────────────────────┘
```

| Capa | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, desplegable en Vercel |
| Daemon | Node 24 · Express · SSE streaming · `better-sqlite3`; tablas: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| Transporte de agente | `child_process.spawn`; parsers de eventos tipados para `claude-stream-json` (Claude Code), `qoder-stream-json` (Qoder CLI), `copilot-stream-json` (Copilot), `json-event-stream` por CLI (Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe via Agent Client Protocol), `pi-rpc` (Pi via stdio JSON-RPC), `plain` (Qwen Code / DeepSeek TUI) |
| Proxy BYOK | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → APIs upstream específicas por proveedor, SSE `delta/end/error` normalizado; rechaza hosts loopback / link-local / RFC1918 en el borde del daemon |
| Storage | Archivos planos en `.od/projects/<id>/` + SQLite en `.od/app.sqlite` + credenciales en `.od/media-config.json` (gitignored, auto-creado). `OD_DATA_DIR=<dir>` reubica todos los datos del daemon; `OD_MEDIA_CONFIG_DIR=<dir>` limita el override solo a `media-config.json` |
| Preview | Iframe sandboxed via `srcdoc` + parser `<artifact>` por skill ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Export | HTML (assets inline) · PDF (browser print, deck-aware) · PPTX (agent-driven via skill) · ZIP (archiver) · Markdown |
| Lifecycle | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; puertos via `--daemon-port` / `--web-port`, namespaces via `--namespace` |
| Desktop (opcional) | Shell Electron: descubre la URL web mediante sidecar IPC, sin adivinar puertos; el mismo canal `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` impulsa `tools-dev inspect desktop …` para E2E |

## Quickstart

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # should print 10.33.2
pnpm install
pnpm tools-dev run web
# open the web URL printed by tools-dev
```

Requisitos de entorno: Node `~24` y pnpm `10.33.x`. `nvm`/`fnm` son helpers opcionales; si usas uno, ejecuta `nvm install 24 && nvm use 24` o `fnm install 24 && fnm use 24` antes de `pnpm install`.

Para arranque desktop/background, reinicios con puerto fijo y checks del dispatcher de media generation (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`), consulta [`QUICKSTART.md`](QUICKSTART.md).

La primera carga:

1. Detecta qué agent CLIs tienes en `PATH` y elige una automáticamente.
2. Carga 31 skills + 72 design systems.
3. Muestra el diálogo de bienvenida para pegar una Anthropic key (solo necesaria para el fallback BYOK).
4. **Auto-crea `./.od/`**: la carpeta runtime local para SQLite, artefactos por proyecto y renders guardados. No hay paso `od init`; el daemon hace `mkdir` de todo lo que necesita al arrancar.

Escribe un prompt, pulsa **Enviar**, mira llegar el question form, complétalo, mira el todo card en stream y luego el artefacto renderizado. Haz clic en **Guardar en disco** o descarga como ZIP del proyecto.

### Estado de primera ejecución (`./.od/`)

El daemon posee una carpeta oculta en la raíz del repo. Todo dentro está gitignored y es local a la máquina: nunca lo commitees.

```
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── artifacts/                 ← one-off "Save to disk" renders (timestamped)
└── projects/<id>/             ← per-project working dir, also the agent's cwd
```

| Quieres… | Haz esto |
|---|---|
| Inspeccionar qué hay ahí | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Resetear a limpio | `pnpm tools-dev stop`, `rm -rf .od`, vuelve a ejecutar `pnpm tools-dev run web` |
| Moverlo a otro lugar | todavía no soportado: la ruta está hard-codeada relativa al repo |

Mapa completo de archivos, scripts y troubleshooting → [`QUICKSTART.md`](QUICKSTART.md).

## Ejecutar el proyecto

Open Design puede ejecutarse como web app en tu navegador o como aplicación desktop de Electron. Ambos modos comparten la misma arquitectura de daemon local + web.

### Web / Localhost (Default)

```bash
# Foreground mode — keeps the lifecycle command in the foreground (logs written to files)
pnpm tools-dev run web

# View recent logs:
pnpm tools-dev logs

# Background mode — daemon + web run as background processes
pnpm tools-dev start web
```

Por defecto, `tools-dev` se enlaza a puertos efímeros disponibles e imprime las URLs reales al arrancar. Para usar puertos fijos desde un estado detenido:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

Si daemon/web ya están corriendo, usa `restart` para cambiar puertos en la sesión existente:

```bash
pnpm tools-dev restart --daemon-port 17456 --web-port 17573
```

### Desktop / Electron

```bash
# Start daemon + web + desktop in the background
pnpm tools-dev

# Check desktop status
pnpm tools-dev inspect desktop status

# Take a screenshot of the desktop app
pnpm tools-dev inspect desktop screenshot --path /tmp/open-design.png
```

La app desktop descubre la URL web automáticamente mediante sidecar IPC — no hace falta adivinar puertos.

### Otros comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm tools-dev status` | Muestra los estados de sidecar en ejecución |
| `pnpm tools-dev logs` | Muestra las colas de logs de daemon/web/desktop |
| `pnpm tools-dev stop` | Detiene todos los sidecars en ejecución |
| `pnpm tools-dev restart` | Detiene y luego reinicia todos los sidecars |
| `pnpm tools-dev check` | Estado + logs recientes + diagnósticos comunes |

Para reinicios con puertos fijos, arranque en background y troubleshooting completo, consulta [`QUICKSTART.md`](QUICKSTART.md).

## Usar Open Design desde tu coding agent

Open Design trae un servidor MCP stdio. Conéctalo a Claude Code, Codex, Cursor, VS Code, Antigravity, Zed, Windsurf o cualquier cliente compatible con MCP y el agente en otro repo podrá leer archivos de tus proyectos locales de Open Design directamente. Reemplaza el ciclo exportar-zip-y-adjuntar. Cuando el agente llama `search_files`, `get_file` o `get_artifact` sin argumento de proyecto, el MCP usa por defecto el proyecto (y archivo) que tienes abierto ahora en Open Design, así que prompts como *"build this in my app"* o *"match these styles"* simplemente funcionan.

**¿Por qué MCP?** Exportar y re-adjuntar un zip en cada iteración rompe el flujo. El MCP server expone tu fuente de diseño directamente -- tokens CSS, componentes JSX, entry HTML -- como API estructurada que el agente puede consultar por nombre. El agente siempre ve el archivo vivo, no una copia obsoleta del último export.

Abre **Ajustes → MCP server** en la app Open Design para un flujo de instalación por cliente. El panel inserta la ruta absoluta de tu binario `node` y del `cli.js` compilado del daemon en cada snippet, así funciona en un source clone nuevo donde `od` no está en tu PATH. Cursor recibe un deeplink de un clic; los demás reciben un snippet JSON copy-paste en el schema que espera su archivo de config (Claude Code incluye un one-liner `claude mcp add-json` para no editar a mano `~/.claude.json`). Reinicia o recarga tu cliente después de instalar para que el servidor aparezca.

El daemon debe estar corriendo localmente para que las tool calls MCP funcionen. Si el agente se inició antes que Open Design, reinicia el agente cuando Open Design ya esté arriba para que alcance el daemon vivo. Las tool calls hechas con el daemon offline devuelven un error claro `"daemon not reachable"` en lugar de crashear.

**Modelo de seguridad.** El MCP server es read-only; expone lectura de archivos, metadata y búsqueda, nada que escriba a disco o llame servicios externos. Corre como child process del coding agent sobre stdio, así que cualquier cliente MCP que registres hereda acceso de lectura a tus proyectos locales de Open Design. Trátalo como instalar una extensión de VS Code: solo registra clientes en los que confíes. El daemon se enlaza a `127.0.0.1` por defecto; exponerlo en LAN requiere opt-in explícito con `OD_BIND_HOST`.

## Estructura del repositorio

```
open-design/
├── README.md                      ← this file
├── README.de.md                   ← Deutsch
├── README.ru.md                   ← Русский
├── README.zh-CN.md                ← 简体中文
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
│   ├── deck-framework.html        ← deck baseline (nav / counter / print)
│   └── kami-deck.html             ← kami-flavored deck starter (parchment / ink-blue serif)
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

## Design Systems

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="The 72 design systems library — style guide spread" width="100%" />
</p>

72 sistemas listos, cada uno como un único [`DESIGN.md`](design-systems/README.md):

<details>
<summary><b>Catálogo completo</b> (clic para expandir)</summary>

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

La biblioteca de sistemas de producto se importa mediante [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) desde [`VoltAgent/awesome-design-md`][acd2]. Vuelve a ejecutarlo para refrescar. Las 57 design skills vienen de [`bergside/awesome-design-skills`][ads] y se agregan directamente en `design-systems/`.

## Direcciones visuales

Cuando el usuario no tiene brand spec, el agente emite un segundo formulario con cinco direcciones curadas: la adaptación OD del fallback ["5 schools × 20 design philosophies"](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback) de [`huashu-design`](https://github.com/alchaincyf/huashu-design). Cada dirección es una spec determinista: paleta en OKLch, font stack, pistas de layout y referencias, que el agente enlaza literalmente al `:root` de la plantilla seed. Un radio click → un sistema visual completamente especificado. Sin improvisación, sin AI-slop.

| Dirección | Mood | Referencias |
|---|---|---|
| Editorial — Monocle / FT | Revista impresa, tinta + crema + rust cálido | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | Frío, estructurado, acento mínimo | Linear · Vercel · Stripe |
| Tech utility | Densidad informativa, monospace, terminal | Bloomberg · Bauhaus tools |
| Brutalist | Crudo, tipografía oversized, sin sombras, acentos duros | Bloomberg Businessweek · Achtung |
| Soft warm | Generoso, bajo contraste, neutros melocotón | Notion marketing · Apple Health |

Spec completa → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts).

## Generación de medios

OD no se detiene en código. La misma superficie de chat que produce HTML `<artifact>` también impulsa generación de **imagen**, **video** y **audio**, con adapters de modelos conectados al pipeline de media del daemon ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Cada render aterriza como archivo real en el workspace del proyecto: `.png` para imagen, `.mp4` para video, y aparece como chip de descarga al terminar el turno.

Tres familias de modelos llevan la carga hoy:

| Superficie | Modelo | Proveedor | Para qué sirve |
|---|---|---|---|
| **Image** | `gpt-image-2` | Azure / OpenAI | Pósters, avatares, mapas ilustrados, infografías, social cards estilo revista, restauración fotográfica, arte de producto exploded-view |
| **Video** | `seedance-2.0` | ByteDance Volcengine | t2v + i2v cinematográfico de 15s con audio: shorts narrativos, close-ups de personajes, product films, coreografía estilo MV |
| **Video** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 motion graphics: product reveals, tipografía cinética, data charts, overlays sociales, logo outros, verticales TikTok con captions karaoke |

Una **galería de prompts** creciente en [`prompt-templates/`](prompt-templates/) trae **93 prompts listos para replicar**: 43 de imagen (`prompt-templates/image/*.json`), 39 Seedance (`prompt-templates/video/*.json` excluyendo `hyperframes-*`) y 11 HyperFrames (`prompt-templates/video/hyperframes-*.json`). Cada uno incluye thumbnail de preview, el cuerpo del prompt literal, el modelo objetivo, aspect ratio y un bloque `source` para licencia + atribución. El daemon los sirve en `GET /api/prompt-templates`; la web app los muestra como card grid en las pestañas **Plantillas de imagen** y **Plantillas de vídeo** del entry view; un clic suelta el prompt en el composer con el modelo correcto preseleccionado.

### gpt-image-2 — galería de imagen (muestra de 43)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="Evolución de escalera de piedra 3D" /><br/><sub><b>Infografía de evolución de escalera de piedra 3D</b><br/>Infografía de 3 pasos, estética de piedra tallada</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Mapa gastronómico urbano ilustrado" /><br/><sub><b>Mapa gastronómico urbano ilustrado</b><br/>Póster de viaje editorial ilustrado a mano</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Escena cinematográfica de ascensor" /><br/><sub><b>Escena cinematográfica de ascensor</b><br/>Still editorial de moda de un frame</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Retrato cyberpunk anime" /><br/><sub><b>Retrato cyberpunk anime</b><br/>Avatar de perfil — texto neón sobre rostro</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Mujer glamurosa de negro" /><br/><sub><b>Retrato de mujer glamurosa de negro</b><br/>Retrato editorial de estudio</sub></td>
</tr>
</table>

Set completo → [`prompt-templates/image/`](prompt-templates/image/). Fuentes: la mayoría provienen de [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0), con atribución de autor preservada por template.

### Seedance 2.0 — galería de video (muestra de 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Podcast musical y guitarra" /></a><br/><sub><b>Podcast musical y técnica de guitarra</b><br/>Film de estudio cinematográfico 4K</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Rostro emocional" /></a><br/><sub><b>Close-up de rostro emocional</b><br/>Estudio cinematográfico de microexpresión</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Supercar de lujo" /></a><br/><sub><b>Cinemática de supercar de lujo</b><br/>Film narrativo de producto</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Gato de la Ciudad Prohibida" /></a><br/><sub><b>Sátira del gato de la Ciudad Prohibida</b><br/>Short de sátira estilizada</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Romance japonés" /></a><br/><sub><b>Corto de romance japonés</b><br/>Narrativa Seedance 2.0 de 15s</sub></td>
</tr>
</table>

Haz clic en cualquier thumbnail para reproducir el MP4 renderizado. Set completo → [`prompt-templates/video/`](prompt-templates/video/) (las entradas `*-seedance-*` y etiquetadas Cinematic). Fuentes: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0), con links a tweets originales y handles de autor preservados.

### HyperFrames — motion graphics HTML→MP4 (11 templates listos)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) es el framework open source agent-native de HeyGen para video: tú (o el agente) escribes HTML + CSS + GSAP, y HyperFrames lo renderiza a un MP4 determinista mediante headless Chrome + FFmpeg. Open Design incluye HyperFrames como modelo de video first-class (`hyperframes-html`) conectado al dispatch del daemon, además de la skill `skills/hyperframes/`, que enseña al agente el contrato de timeline, reglas de transición de escena, patrones audio-reactive, captions/TTS y bloques de catálogo (`npx hyperframes add <slug>`).

Once prompts hyperframes vienen bajo [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/), cada uno como brief concreto que produce un arquetipo específico:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Reveal de producto" /></a><br/><sub><b>Reveal minimal de producto de 5s</b> · 16:9 · title card push-in con transición shader</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="Promo SaaS" /></a><br/><sub><b>Promo de producto SaaS de 30s</b> · 16:9 · estilo Linear/ClickUp con reveals UI 3D</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="Karaoke TikTok" /></a><br/><sub><b>Talking-head karaoke para TikTok</b> · 9:16 · TTS + captions sincronizadas por palabra</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Sizzle de marca" /></a><br/><sub><b>Sizzle reel de marca de 30s</b> · 16:9 · tipografía cinética sincronizada al beat, audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Chart de datos" /></a><br/><sub><b>Bar-chart race animado</b> · 16:9 · infografía de datos estilo NYT</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Mapa de vuelo" /></a><br/><sub><b>Mapa de vuelo (origen → destino)</b> · 16:9 · reveal cinematográfico de ruta estilo Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Outro de logo" /></a><br/><sub><b>Outro cinematográfico de logo de 4s</b> · 16:9 · ensamblaje pieza por pieza + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Contador de dinero" /></a><br/><sub><b>Contador de dinero $0 → $10K</b> · 9:16 · hype estilo Apple con flash verde + burst</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="Showcase de app" /></a><br/><sub><b>Showcase de app con 3 teléfonos</b> · 16:9 · teléfonos flotantes con callouts de features</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Overlay social" /></a><br/><sub><b>Stack de overlays sociales</b> · 9:16 · X · Reddit · Spotify · Instagram en secuencia</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website a video" /></a><br/><sub><b>Pipeline website-to-video</b> · 16:9 · captura el sitio en 3 viewports + transiciones</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

El patrón es el mismo que en el resto: elige un template, edita el brief y envía. El agente lee `skills/hyperframes/SKILL.md` (con el workflow de render específico de OD: archivos fuente de composición a `.hyperframes-cache/` para no ensuciar el file workspace, el daemon despacha `npx hyperframes render` para evitar el cuelgue macOS sandbox-exec / Puppeteer, y solo el `.mp4` final llega como chip del proyecto), crea la composición y entrega un MP4. Thumbnails de catálogo © HeyGen, servidos desde su CDN; el framework OSS es Apache-2.0.

> **También conectado pero aún no expuesto como templates:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (via Fal), MiniMax video-01: todos viven en `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5, Udio v2, Lyria 2 (music) y gpt-4o-mini-tts, MiniMax TTS (speech) cubren la superficie de audio. Los templates para esto son contribuciones abiertas: suelta un JSON en `prompt-templates/video/` o `prompt-templates/audio/` y aparecerá en el selector.

## Más allá del chat: qué más incluye

El bucle chat / artifact se lleva el foco, pero ya hay varias capacidades menos visibles conectadas que vale la pena conocer antes de comparar OD con cualquier otra cosa:

- **Import de ZIP de Claude Design.** Suelta una exportación de claude.ai en el diálogo de bienvenida. `POST /api/import/claude-design` la extrae en un `.od/projects/<id>/` real, abre el entry file como tab y prepara un prompt para continuar donde Anthropic lo dejó. Sin re-prompting, sin "pedirle al modelo que recree lo que ya teníamos". ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts): `/api/import/claude-design`)
- **Proxy BYOK multi-provider.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` recibe `{ baseUrl, apiKey, model, messages }`, construye la request upstream específica por proveedor, normaliza chunks SSE a `delta/end/error` y rechaza destinos loopback / link-local / RFC1918 para evitar SSRF. OpenAI-compatible cubre OpenAI, Azure AI Foundry `/openai/v1`, DeepSeek, Groq, MiMo, OpenRouter y vLLM self-hosted; Azure OpenAI agrega deployment URL + `api-version`; Google usa Gemini `:streamGenerateContent`.
- **Templates guardados por usuario.** Cuando te gusta un render, `POST /api/templates` guarda snapshot del HTML + metadata en la tabla SQLite `templates`. El siguiente proyecto lo elige desde una fila "your templates" en el selector: la misma superficie que las 31 shipped, pero tuya.
- **Persistencia de pestañas.** Cada proyecto recuerda archivos abiertos y la pestaña activa en la tabla `tabs`. Reabre mañana y el workspace luce exactamente como lo dejaste.
- **Artifact lint API.** `POST /api/artifacts/lint` ejecuta checks estructurales sobre un artefacto generado (framing `<artifact>` roto, side files requeridos faltantes, tokens de paleta stale) y devuelve findings que el agente puede leer en su siguiente turno. La autocrítica five-dim usa esto para anclar su score en evidencia real, no vibes.
- **Sidecar protocol + desktop automation.** Los procesos daemon, web y desktop llevan stamps tipados de cinco campos (`app · mode · namespace · ipc · source`) y exponen un canal JSON-RPC IPC en `/tmp/open-design/ipc/<namespace>/<app>.sock`. `tools-dev inspect desktop status \| eval \| screenshot` usa ese canal, así E2E headless corre contra un shell Electron real sin harness bespoke ([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Spawning amigable con Windows.** Todo adapter que normalmente rompería el límite de argv de `CreateProcess` (~32 KB) con prompts compuestos largos (Codex, Gemini, OpenCode, Cursor Agent, Qwen, Qoder CLI, Pi) envía el prompt por stdin. Claude Code y Copilot mantienen `-p`; el daemon cae a un prompt-file temporal cuando incluso eso se desborda.
- **Datos runtime por namespace.** `OD_DATA_DIR` y `--namespace` te dan árboles `.od/` totalmente aislados, así Playwright, canales beta y tus proyectos reales nunca comparten SQLite.

## Maquinaria anti-AI-slop

Todo lo siguiente es el playbook de [`huashu-design`](https://github.com/alchaincyf/huashu-design), portado al prompt-stack de OD y hecho exigible por skill mediante el pre-flight de side files. Lee [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) para ver el texto vivo:

- **Question form first.** El turno 1 es solo `<question-form>`: sin thinking, sin tools, sin narración. El usuario elige defaults a velocidad de radio buttons.
- **Extracción de brand spec.** Cuando el usuario adjunta screenshot o URL, el agente ejecuta un protocolo de cinco pasos (locate · download · grep hex · codify `brand-spec.md` · vocalise) antes de escribir CSS. **Nunca adivina colores de marca de memoria.**
- **Crítica five-dim.** Antes de emitir `<artifact>`, el agente puntúa silenciosamente su output de 1 a 5 en philosophy / hierarchy / execution / specificity / restraint. Cualquier cosa bajo 3/5 es una regresión: corrige y repuntúa. Dos pasadas es normal.
- **Checklist P0/P1/P2.** Cada skill trae `references/checklist.md` con gates P0 duros. El agente debe pasar P0 antes de emitir.
- **Blacklist de slop.** Gradientes morados agresivos, iconos emoji genéricos, cards redondeadas con acento de borde izquierdo, humanos SVG hand-drawn, Inter como *display* face, métricas inventadas: prohibido explícitamente en el prompt.
- **Placeholders honestos > stats falsos.** Cuando el agente no tiene un número real, escribe `—` o un bloque gris etiquetado, no "10× faster".

## Comparación

| Eje | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Licencia | Cerrado | MIT | **Apache-2.0** |
| Formato | Web (claude.ai) | Desktop (Electron) | **App web + daemon local** |
| Desplegable en Vercel | ❌ | ❌ | **✅** |
| Runtime de agente | Incluido (Opus 4.7) | Incluido ([`pi-ai`][piai]) | **Delegado a la CLI existente del usuario** |
| Skills | Propietarias | 12 módulos TS custom + `SKILL.md` | **31 bundles [`SKILL.md`][skill] basados en archivos, droppable** |
| Design system | Propietario | `DESIGN.md` (roadmap v0.2) | **`DESIGN.md` × 129 sistemas incluidos** |
| Flexibilidad de proveedor | Solo Anthropic | 7+ via [`pi-ai`][piai] | **16 adapters CLI + proxy BYOK OpenAI-compatible** |
| Formulario inicial de preguntas | ❌ | ❌ | **✅ Regla dura, turno 1** |
| Selector de dirección | ❌ | ❌ | **✅ 5 direcciones deterministas** |
| Progreso todo en vivo + stream de tools | ❌ | ✅ | **✅** (patrón UX de open-codesign) |
| Preview en iframe sandboxed | ❌ | ✅ | **✅** (patrón de open-codesign) |
| Import de ZIP de Claude Design | n/a | ❌ | **✅ `POST /api/import/claude-design`: seguir editando donde Anthropic lo dejó** |
| Ediciones quirúrgicas en comment-mode | ❌ | ✅ | 🟡 parcial: comentarios en elementos del preview + adjuntos de chat; patching dirigido confiable sigue en progreso |
| Panel de tweaks emitido por IA | ❌ | ✅ | 🚧 roadmap: el panel UX dedicado en el lado del chat aún no está implementado |
| Workspace de nivel filesystem | ❌ | parcial (Electron sandbox) | **✅ cwd real, tools reales, SQLite persistido (projects · conversations · messages · tabs · templates)** |
| Autocrítica five-dim | ❌ | ❌ | **✅ Gate pre-emit** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint`: findings devueltos al agente** |
| Sidecar IPC + desktop headless | ❌ | ❌ | **✅ Procesos stamped + `tools-dev inspect desktop status \| eval \| screenshot`** |
| Formatos de exportación | Limitado | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (agent-driven) / ZIP / Markdown** |
| Reuso de PPT skill | N/A | Incluido | **[`guizang-ppt-skill`][guizang] entra directo (default para deck mode)** |
| Facturación mínima | Pro / Max / Team | BYOK | **BYOK: pega cualquier `baseUrl` OpenAI-compatible** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Coding agents soportados

Auto-detectados desde `PATH` al arrancar el daemon. Sin configuración requerida. El dispatch streaming vive en [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`); los parsers por CLI viven al lado. Los modelos se cargan probando `<bin> --list-models` / `<bin> models` / handshake ACP, o desde una lista fallback curada cuando la CLI no expone una lista.

| Agente | Bin | Formato de stream | Forma de argv (ruta de prompt compuesto) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (typed events) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + parser `codex` | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]` (prompt por stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + parser `gemini` | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]` (prompt por stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + parser `opencode` | `opencode run --format json --dangerously-skip-permissions [--model …] -` (prompt por stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + parser `cursor-agent` | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (prompt por stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (chunks raw de stdout) | `qwen --yolo [--model …] -` (prompt por stdin) |
| Qoder CLI | `qodercli` | `qoder-stream-json` (typed events) | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (prompt por stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (typed events) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (chunks raw de stdout) | `deepseek exec --auto [--model …] <prompt>` (prompt como argumento posicional) |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc --no-session [--model …] [--thinking …]` (prompt enviado como comando RPC `prompt`) |
| **BYOK multi-provider** | n/a | Normalización SSE | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI-compatible / Azure OpenAI / Gemini; protegido contra SSRF hacia loopback / link-local / RFC1918 |

Añadir una CLI nueva es una entrada en [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). El formato de streaming es uno de `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream` (con `eventParser` por CLI), `acp-json-rpc`, `pi-rpc` o `plain`.

## Referencias y linaje

Cada proyecto externo del que este repo toma ideas. Cada link va a la fuente para verificar la procedencia.

| Proyecto | Rol aquí |
|---|---|
| [`Claude Design`][cd] | El producto closed-source del que este repo es alternativa open source. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | Núcleo de filosofía de diseño. Junior-Designer workflow, protocolo de brand assets en 5 pasos, checklist anti-AI-slop, autocrítica de 5 dimensiones y la biblioteca "5 schools × 20 design philosophies" detrás del direction picker, destilado en [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) y [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | Skill Magazine-web-PPT incluida literalmente bajo [`skills/guizang-ppt/`](skills/guizang-ppt/) con LICENSE original preservada. Default para deck mode. La cultura de checklist P0/P1/P2 se toma para cada otra skill. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Arquitectura daemon + adapter. Detección por PATH, daemon local como único proceso privilegiado, visión agent-as-teammate. Adoptamos el modelo; no vendorizamos el código. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | La primera alternativa open source a Claude Design y nuestro par más cercano. Patrones UX adoptados: streaming-artifact loop, sandboxed-iframe preview (React 18 + Babel vendorizados), panel de agente en vivo (todos + tool calls + interruptible), lista de export de cinco formatos (HTML/PDF/PPTX/ZIP/Markdown), hub local-first, taste-injection `SKILL.md` y primer pase de anotaciones comment-mode en preview. Patrones todavía en roadmap: confiabilidad completa de surgical-edit y AI-emitted tweaks panel. **Deliberadamente no vendorizamos [`pi-ai`][piai]**: open-codesign lo incluye como agent runtime; nosotros delegamos en la CLI que ya tenga el usuario. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | Fuente del schema `DESIGN.md` de 9 secciones y de 70 sistemas de producto importados via [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). |
| [`bergside/awesome-design-skills`][ads] | Fuente de 57 design skills añadidas directamente como archivos `DESIGN.md` normalizados bajo `design-systems/`. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Inspiración para distribución de skills con symlinks entre varias agent CLIs. |
| [Claude Code skills][skill] | La convención `SKILL.md` adoptada literalmente: cualquier skill de Claude Code se suelta en `skills/` y el daemon la detecta. |

El write-up largo de procedencia, qué tomamos de cada uno y qué no, vive en [`docs/references.md`](docs/references.md).

## Roadmap

- [x] Daemon + detección de agentes (16 adapters CLI) + skill registry + catálogo de design systems
- [x] Web app + chat + question form + picker de 5 direcciones + progreso todo + sandboxed preview
- [x] 31 skills + 72 design systems + 5 direcciones visuales + 5 frames de dispositivo
- [x] SQLite-backed projects · conversations · messages · tabs · templates
- [x] Proxy BYOK multi-provider (`/api/proxy/{anthropic,openai,azure,google}/stream`) con guard SSRF
- [x] Import de ZIP Claude Design (`/api/import/claude-design`)
- [x] Sidecar protocol + Electron desktop con IPC automation (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] Artifact lint API + gate pre-emit de autocrítica five-dim
- [ ] Comment-mode surgical edits: parcial enviado: comentarios de elementos preview y adjuntos de chat; patching dirigido confiable sigue en progreso
- [ ] UX de AI-emitted tweaks panel: aún no implementado
- [ ] Receta de despliegue Vercel + tunnel (Topology B)
- [ ] `npx od init` de un comando para scaffold de proyecto con `DESIGN.md`
- [ ] Skill marketplace (`od skills install <github-repo>`) y superficie CLI `od skill add | list | remove | test` (borrador en [`docs/skills-protocol.md`](docs/skills-protocol.md), implementación pendiente)
- [ ] Build Electron empaquetado desde `apps/packaged/`

Entrega por fases → [`docs/roadmap.md`](docs/roadmap.md).

## Estado

Esta es una implementación temprana: el bucle cerrado (detect → pick skill + design system → chat → parse `<artifact>` → preview → save) corre end-to-end. El prompt stack y la biblioteca de skills son donde vive la mayor parte del valor, y están estables. La UI a nivel componente se publica a diario.

## Danos una estrella

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Si esto te ahorró treinta minutos, dale una ★. Las estrellas no pagan la renta, pero le dicen al próximo diseñador, agente y contributor que este experimento merece atención. Un clic, tres segundos, señal real: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Contribuir

Issues, PRs, nuevas skills y nuevos design systems son bienvenidos. Las contribuciones de mayor impacto suelen ser una carpeta, un archivo Markdown o un adapter del tamaño de un PR:

- **Añadir una skill**: suelta una carpeta en [`skills/`](skills/) siguiendo la convención [`SKILL.md`][skill].
- **Añadir un design system**: suelta un `DESIGN.md` en [`design-systems/<brand>/`](design-systems/) usando el schema de 9 secciones.
- **Conectar una nueva coding-agent CLI**: una entrada en [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

Walkthrough completo, estándar de merge, code style y lo que no aceptamos → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Contribuidores

Gracias a todas las personas que han ayudado a mover Open Design hacia adelante: con código, docs, feedback, nuevas skills, nuevos design systems o incluso un issue preciso. Toda contribución real cuenta, y el muro de abajo es la forma más simple de decirlo en voz alta.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-13" alt="Contribuidores de Open Design" />
</a>

Si ya enviaste tu primer PR, bienvenido. La etiqueta [`good-first-issue`](https://github.com/nexu-io/open-design/labels/good-first-issue) es el punto de entrada.

## Actividad del repositorio

<picture>
  <img alt="Open Design — repository metrics" src="docs/assets/github-metrics.svg" />
</picture>

El SVG anterior se regenera diariamente mediante [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) usando [`lowlighter/metrics`](https://github.com/lowlighter/metrics). Ejecuta un refresh manual desde la pestaña **Actions** si lo quieres antes; para plugins más ricos (traffic, follow-up time), añade un secret `METRICS_TOKEN` con un PAT fine-grained.

## Historial de estrellas

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-13" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
    <img alt="Historial de estrellas de Open Design" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
  </picture>
</a>

Si la curva sube, esa es la señal que buscamos. Dale ★ a este repo para impulsarlo.

## Créditos

La familia de skills HTML PPT Studio: la skill maestra [`skills/html-ppt/`](skills/html-ppt/) y los wrappers por template bajo [`skills/html-ppt-*/`](skills/) (15 templates full-deck, 36 themes, 31 layouts single-page, 27 animaciones CSS + 20 canvas FX, el runtime de teclado y el presenter mode de magnetic-card), está integrada desde el proyecto open source [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT). La LICENSE upstream viene en el repo en [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE) y el crédito de autoría va a [@lewislulu](https://github.com/lewislulu). Cada card Examples por template (`html-ppt-pitch-deck`, `html-ppt-tech-sharing`, `html-ppt-presenter-mode`, `html-ppt-xhs-post`, …) delega la guía de autoría a la skill maestra para preservar end-to-end el comportamiento prompt → output upstream cuando haces clic en **Usar este prompt**.

El flujo magazine / horizontal-swipe deck bajo [`skills/guizang-ppt/`](skills/guizang-ppt/) está integrado desde [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT). El crédito de autoría va a [@op7418](https://github.com/op7418).

## Licencia

Apache-2.0. El bundle `skills/guizang-ppt/` conserva su [LICENSE](skills/guizang-ppt/LICENSE) original (MIT) y la atribución de autoría a [op7418](https://github.com/op7418). El bundle `skills/html-ppt/` conserva su [LICENSE](skills/html-ppt/LICENSE) original (MIT) y la atribución de autoría a [lewislulu](https://github.com/lewislulu).
