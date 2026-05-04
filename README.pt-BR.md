# Open Design

> **A alternativa open-source ao [Claude Design][cd].** Local-first, deployável via web, BYOK em toda camada — **13 CLIs de agentes de código** detectados automaticamente no seu `PATH` (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Mistral Vibe) viram a engine de design, dirigidos por **31 Skills compositáveis** e **72 Design Systems de qualidade de marca**. Sem CLI? Um proxy BYOK compatível com OpenAI é o mesmo loop, só sem o spawn.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — capa editorial: design com o agente no seu laptop" width="100%" />
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
  <a href="#agentes-de-código-suportados"><img alt="Agents" src="https://img.shields.io/badge/agents-12%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-systems"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="QUICKSTART.pt-BR.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Português (Brasil)</b> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · العربية · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a></p>

---

## Por que isto existe

O [Claude Design][cd] da Anthropic (lançado em 2026-04-17, com Opus 4.7) mostrou o que acontece quando um LLM para de escrever prosa e começa a entregar artifacts de design. Bombou — e ficou closed-source, pago, só na nuvem, preso ao modelo da Anthropic e às skills da Anthropic. Não tem checkout, não tem self-host, não tem deploy na Vercel, não tem swap-do-seu-próprio-agente.

**O Open Design (OD) é a alternativa open-source.** Mesmo loop, mesmo modelo mental orientado a artifact, sem nenhum trava. A gente não despacha um agente — os agentes de código mais fortes já estão no seu laptop. A gente os pluga em um workflow de design orientado a skills que roda local com `pnpm tools-dev`, pode subir a camada web na Vercel e mantém BYOK em toda camada.

Digite `me faz um pitch deck estilo revista para nossa rodada seed`. O formulário de perguntas interativo aparece antes de o modelo improvisar um pixel. O agente escolhe uma de cinco direções visuais curadas. Um plano `TodoWrite` ao vivo flui para a UI. O daemon constrói uma pasta de projeto real em disco com template-semente, biblioteca de layouts e checklist de auto-checagem. O agente lê tudo — pre-flight forçado — roda uma crítica em cinco dimensões contra a própria saída e emite um único `<artifact>` que renderiza num iframe sandboxed em segundos.

Isso não é "IA tentando desenhar algo". É uma IA que foi treinada, pela pilha de prompt, para se comportar como uma designer sênior com filesystem funcional, biblioteca de paleta determinística e cultura de checklist — exatamente a barra que o Claude Design colocou, mas aberta e sua.

OD se apoia em quatro ombros open-source:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — a bússola da filosofia de design. Workflow Junior-Designer, protocolo de 5 passos para asset de marca, checklist anti-AI-slop, autocrítica em 5 dimensões e a ideia "5 escolas × 20 filosofias de design" por trás do nosso direction picker — tudo destilado em [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — o modo deck. Empacotado literalmente sob [`skills/guizang-ppt/`](skills/guizang-ppt/) com o LICENSE original preservado; layouts estilo revista, hero WebGL, checklists P0/P1/P2.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — a estrela-guia de UX e nosso peer mais próximo. A primeira alternativa open-source ao Claude Design. Pegamos o loop de streaming-artifact dele, o padrão de preview em iframe sandboxed (React 18 + Babel vendored), o painel de agente ao vivo (todos + tool calls + geração interruptível) e a lista de cinco formatos de export (HTML / PDF / PPTX / ZIP / Markdown). Divergimos de propósito no form factor — eles são um app desktop Electron com [`pi-ai`][piai] embutido; nós somos um web app + daemon local que delega ao seu CLI já existente.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — a arquitetura de daemon-and-runtime. Detecção de agente por scan de PATH, daemon local como único processo privilegiado, visão de mundo agente-como-time.

## Visão geral

| | O que você ganha |
|---|---|
| **CLIs de agente (13)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Mistral Vibe CLI (ACP) — detectados automaticamente no `PATH`, troca em um clique |
| **Fallback BYOK** | Proxy de API por protocolo em `/api/proxy/{anthropic,openai,azure,google}/stream` — cole `baseUrl` + `apiKey` + `model`, escolha Anthropic / OpenAI / Azure OpenAI / Google Gemini, e o daemon normaliza o SSE de volta para o mesmo stream de chat. IPs internos / SSRF bloqueados na borda do daemon. |
| **Design systems built-in** | **129** — 2 starters escritos à mão + 70 sistemas de produto (Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu, …) de [`awesome-design-md`][acd2], mais 57 design skills de [`awesome-design-skills`][ads] adicionados direto em `design-systems/` |
| **Skills built-in** | **31** — 27 em modo `prototype` (web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs, …) + 4 em modo `deck` (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). Agrupadas no picker por `scenario`: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **Geração de mídia** | Imagem · vídeo · áudio entregues lado a lado com o loop de design. **gpt-image-2** (Azure / OpenAI) para pôsteres, avatares, infográficos, mapas ilustrados · **Seedance 2.0** (ByteDance) para texto-para-vídeo cinematográfico de 15s e imagem-para-vídeo · **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) para motion graphics HTML→MP4 (revelações de produto, kinetic typography, gráficos de dados, overlays sociais, logo outros). **93** prompts prontos para replicar — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames — em [`prompt-templates/`](prompt-templates/), com thumbnails de preview e atribuição da fonte. Mesma superfície de chat do código; saída é um `.mp4` / `.png` real entrando no workspace do projeto. |
| **Direções visuais** | 5 escolas curadas (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental) — cada uma trazendo paleta OKLch determinística + font stack ([`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)) |
| **Frames de dispositivo** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — pixel-accurate, compartilhados entre skills sob [`assets/frames/`](assets/frames/) |
| **Runtime de agente** | Daemon local sobe o CLI dentro da pasta do seu projeto — agente recebe `Read`, `Write`, `Bash`, `WebFetch` reais contra um ambiente real em disco, com fallbacks de Windows `ENAMETOOLONG` (stdin / arquivo de prompt) em todos os adapters |
| **Imports** | Solte um ZIP exportado do [Claude Design][cd] no welcome dialog — `POST /api/import/claude-design` parseia para um projeto real, então seu agente continua editando de onde a Anthropic parou |
| **Persistência** | SQLite em `.od/app.sqlite`: projects · conversations · messages · tabs · saved templates. Reabra amanhã, o card de todo e os arquivos abertos estão exatamente onde você deixou. |
| **Ciclo de vida** | Um único entry point: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) — sobe daemon + web (+ desktop) sob stamps tipados de sidecar |
| **Desktop** | Shell Electron opcional com renderer sandboxed + IPC sidecar (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — alimenta `tools-dev inspect desktop screenshot` para E2E |
| **Deployável em** | Local (`pnpm tools-dev`) · camada web Vercel · Electron empacotado (placeholder, em andamento) |
| **Licença** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## Demo

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Tela de entrada" /><br/>
<sub><b>Tela de entrada</b> — escolha um skill, escolha um design system, digite o brief. Mesma superfície para protótipos, decks, mobile apps, dashboards e páginas editoriais.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Formulário de descoberta no turn 1" /><br/>
<sub><b>Formulário de descoberta no turn 1</b> — antes do modelo escrever um pixel, o OD trava o brief: superfície, audiência, tom, contexto de marca, escala. 30 segundos de radios derrotam 30 minutos de redirecionamento.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Direction picker" /><br/>
<sub><b>Direction picker</b> — quando o usuário não tem marca, o agente emite um segundo formulário com 5 direções curadas (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). Um clique em um radio → paleta determinística + font stack, sem freestyle do modelo.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Progresso de todos ao vivo" /><br/>
<sub><b>Progresso de todos ao vivo</b> — o plano do agente é streamado como um card vivo. Atualizações <code>in_progress</code> → <code>completed</code> caem em tempo real. O usuário pode redirecionar barato, em pleno voo.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Preview sandboxed" /><br/>
<sub><b>Preview sandboxed</b> — todo <code>&lt;artifact&gt;</code> renderiza dentro de um iframe srcdoc limpo. Editável in place via o workspace de arquivos; baixável como HTML, PDF, ZIP.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · Biblioteca de 72 sistemas" /><br/>
<sub><b>Biblioteca de 72 sistemas</b> — todo sistema de produto mostra sua assinatura de 4 cores. Clique para ver o <code>DESIGN.md</code> completo, swatch grid e showcase ao vivo.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Deck estilo revista" /><br/>
<sub><b>Modo deck (guizang-ppt)</b> — o <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> bundled cai inalterado. Layouts estilo revista, fundos hero WebGL, saída HTML em arquivo único, export PDF.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Protótipo mobile" /><br/>
<sub><b>Protótipo mobile</b> — chrome iPhone 15 Pro pixel-accurate (Dynamic Island, SVGs da status bar, home indicator). Protótipos multi-tela usam os assets compartilhados de <code>/frames/</code> para o agente nunca redesenhar um celular.</sub>
</td>
</tr>
</table>

## Skills

**31 skills entregues na caixa.** Cada uma é uma pasta sob [`skills/`](skills/) seguindo a convenção [`SKILL.md`][skill] do Claude Code, estendida com um frontmatter `od:` que o daemon parseia literalmente — `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Dois **modos** top-level carregam o catálogo: **`prototype`** (27 skills — qualquer coisa que renderize como artifact de página única, de uma landing estilo revista a uma tela de celular a um doc de spec de PM) e **`deck`** (4 skills — apresentações com swipe horizontal, com chrome de framework de deck). O campo **`scenario`** é o que o picker usa para agrupar: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### Showcase de exemplos

As skills visualmente mais distintas, que você provavelmente vai rodar primeiro. Cada uma traz um `example.html` real para abrir direto do repo e ver exatamente o que o agente vai produzir — sem auth, sem setup.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Dashboard de namoro / matchmaking de consumo — nav lateral à esquerda, ticker bar, KPIs, gráfico de matches mútuos de 30 dias, tipografia editorial.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>E-guide digital de duas páginas — capa (título, autora, teaser de TOC) + spread de aula com pull-quote e lista de passos. Tom criador / lifestyle.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>E-mail HTML de lançamento de produto de marca — masthead, imagem hero, lockup de headline, CTA, grid de specs. Coluna única centralizada, table-fallback safe.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Protótipo mobile gamificado em três frames sobre um palco escuro de showcase — cover, missões do dia com ribbons de XP + barra de level, detalhe de missão.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Fluxo de onboarding mobile em três frames — splash, value-prop, sign-in. Status bar, dots de swipe, CTA primária.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Hero de motion-design em frame único com animações CSS em loop — anel de tipografia em rotação, globo animado, timer girando. Pronto para hand-off para o HyperFrames.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Carrossel 1080×1080 de mídia social com três cards — painéis cinematográficos com headlines de display que se conectam ao longo da série, marca, affordance de loop.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Slide explicador animado em pixel / 8-bit — palco creme em full-bleed, mascote pixel animado, tipografia de display japonesa cinética, keyframes CSS em loop.</sub>
</td>
</tr>
</table>

### Superfícies de design & marketing (modo prototype)

| Skill | Plataforma | Cenário | O que produz |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | HTML de página única — landings, marketing, hero pages (default do prototype) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Layout de marketing hero / features / pricing / CTA |
| [`dashboard`](skills/dashboard/) | desktop | operation | Admin / analytics com sidebar + layout denso de dados |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | Pricing standalone + tabelas comparativas |
| [`docs-page`](skills/docs-page/) | desktop | engineering | Layout de documentação em 3 colunas |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Editorial de formato longo |
| [`mobile-app`](skills/mobile-app/) | mobile | design | Tela(s) de app emolduradas em iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Fluxo de onboarding mobile multi-tela (splash · value-prop · sign-in) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Protótipo de app mobile gamificado em três frames |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | E-mail HTML de lançamento de produto de marca (table-fallback safe) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | Carrossel social 1080×1080 com 3 cards |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Pôster de página única estilo revista |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Hero de motion-design com animações CSS em loop |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Slide explicador animado em pixel / 8-bit |
| [`dating-web`](skills/dating-web/) | desktop | personal | Mockup de dashboard de namoro de consumo |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | E-guide digital de duas páginas (capa + aula) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Sketch de ideação à mão — para a passada "mostre algo visível cedo" |
| [`critique`](skills/critique/) | desktop | design | Scoresheet de autocrítica em cinco dimensões (Filosofia · Hierarquia · Detalhe · Função · Inovação) |
| [`tweaks`](skills/tweaks/) | desktop | design | Painel de tweaks emitidos pela IA — o modelo expõe os parâmetros que valem ajuste |

### Superfícies de deck (modo deck)

| Skill | Default para | O que produz |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **default** do deck | PPT web estilo revista — bundled literalmente de [op7418/guizang-ppt-skill][guizang], LICENSE original preservado |
| [`simple-deck`](skills/simple-deck/) | — | Deck minimalista com swipe horizontal |
| [`replit-deck`](skills/replit-deck/) | — | Deck de walkthrough de produto (estilo Replit) |
| [`weekly-update`](skills/weekly-update/) | — | Cadência semanal do time como deck swipe (progresso · bloqueios · próximos) |

### Superfícies de office & operações (modo prototype, cenários com sabor de documento)

| Skill | Cenário | O que produz |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | Doc de spec de PM com TOC + log de decisão |
| [`team-okrs`](skills/team-okrs/) | product | Scoresheet de OKR |
| [`meeting-notes`](skills/meeting-notes/) | operation | Log de decisões de reunião |
| [`kanban-board`](skills/kanban-board/) | operation | Snapshot de board |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Runbook de incidente |
| [`finance-report`](skills/finance-report/) | finance | Resumo executivo financeiro |
| [`invoice`](skills/invoice/) | finance | Fatura de página única |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | Plano de onboarding por cargo |

Adicionar uma skill leva uma pasta. Leia [`docs/skills-protocol.md`](docs/skills-protocol.md) para o frontmatter estendido, forke uma skill existente, reinicie o daemon, ela aparece no picker. O endpoint de catálogo é `GET /api/skills`; a montagem do seed por skill (template + referências auxiliares) vive em `GET /api/skills/:id/example`.

## Seis ideias que sustentam o projeto

### 1 · Não despachamos um agente. O seu já basta.

O daemon escaneia seu `PATH` por [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), `devin`, [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi`, [`pi`](https://github.com/mariozechner/pi-ai), [`kiro-cli`](https://kiro.dev) e [`vibe-acp`](https://github.com/mistralai/mistral-vibe) na inicialização. Os que ele encontrar viram engines de design candidatas — dirigidas via stdio com um adapter por CLI, trocáveis pelo picker de modelo. Inspirado em [`multica`](https://github.com/multica-ai/multica) e [`cc-switch`](https://github.com/farion1231/cc-switch). Sem CLI instalado? O modo API é o mesmo pipeline menos o spawn — escolha Anthropic, OpenAI-compatible, Azure OpenAI ou Google Gemini, e o daemon repassa chunks SSE normalizados, com destinos loopback / link-local / RFC1918 rejeitados na borda.

### 2 · Skills são arquivos, não plugins.

Seguindo a convenção [`SKILL.md`](https://docs.anthropic.com/en/docs/claude-code/skills) do Claude Code, cada skill é `SKILL.md` + `assets/` + `references/`. Coloque uma pasta em [`skills/`](skills/), reinicie o daemon, ela aparece no picker. O `magazine-web-ppt` bundled é o [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) commitado literalmente — licença original preservada, atribuição preservada.

### 3 · Design Systems são Markdown portátil, não JSON de tema.

O schema de 9 seções de `DESIGN.md` vindo de [`VoltAgent/awesome-design-md`][acd2] — color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. Todo artifact lê do sistema ativo. Troque o sistema → o próximo render usa os novos tokens. O dropdown vem com **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…** — mais 57 design skills vindas de [`awesome-design-skills`][ads].

### 4 · O formulário interativo de perguntas evita 80% dos redirecionamentos.

A pilha de prompt do OD hardcoda uma `RULE 1`: todo brief de design fresco começa com um `<question-form id="discovery">` em vez de código. Superfície · audiência · tom · contexto de marca · escala · restrições. Um brief comprido ainda deixa decisões de design abertas — tom visual, postura de cor, escala — exatamente as coisas que o formulário trava em 30 segundos. O custo de uma direção errada é uma rodada de chat, não um deck pronto.

Esse é o **modo Junior-Designer** destilado de [`huashu-design`](https://github.com/alchaincyf/huashu-design): batch das perguntas no início, mostre algo visível cedo (mesmo que seja um wireframe com blocos cinza), deixe o usuário redirecionar barato. Combinado com o protocolo de asset de marca (localizar · baixar · `grep` hex · escrever `brand-spec.md` · vocalizar), é a maior razão para a saída parar de soar como freestyle de IA e começar a soar como uma designer que prestou atenção antes de pintar.

### 5 · O daemon faz o agente parecer estar no seu laptop, porque está.

O daemon spawna o CLI com `cwd` no diretório de artifacts do projeto sob `.od/projects/<id>/`. O agente recebe `Read`, `Write`, `Bash`, `WebFetch` — tools reais contra um filesystem real. Ele consegue `Read` no `assets/template.html` da skill, `grep` o seu CSS atrás de hex values, escrever um `brand-spec.md`, soltar imagens geradas, e produzir `.pptx` / `.zip` / `.pdf` que aparecem no workspace de arquivos como chips de download quando a turn termina. Sessions, conversations, messages e tabs persistem num SQLite local — abra o projeto amanhã e o card de todo do agente está exatamente onde você deixou.

### 6 · A pilha de prompt é o produto.

O que você compõe no envio não é "system + user". É:

```
DISCOVERY directives  (turn-1 form, turn-2 brand branch, TodoWrite, 5-dim critique)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 systems available)
  + active SKILL.md    (31 skills available)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (auto-injected pre-flight: read assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

Toda camada é compositável. Toda camada é um arquivo que dá pra editar. Leia [`apps/web/src/prompts/system.ts`](apps/web/src/prompts/system.ts) e [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) para ver o contrato real.

## Arquitetura

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
   │  qwen · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro (ACP) · vibe (ACP)     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk            │
   └──────────────────────────────────────────────────────────────────┘
```

| Camada | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, deployável na Vercel |
| Daemon | Node 24 · Express · streaming SSE · `better-sqlite3`; tabelas: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| Transporte do agente | `child_process.spawn`; parsers de eventos tipados para `claude-stream-json` (Claude Code), `copilot-stream-json` (Copilot), parsers `json-event-stream` por CLI (Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Mistral Vibe via Agent Client Protocol), `pi-rpc` (Pi via stdio JSON-RPC), `plain` (Qwen Code) |
| Proxy BYOK | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → APIs upstream específicas por provider, SSE normalizado em `delta/end/error`; rejeita hosts loopback / link-local / RFC1918 na borda do daemon |
| Storage | Arquivos planos em `.od/projects/<id>/` + SQLite em `.od/app.sqlite` + credenciais em `.od/media-config.json` (gitignored, autocriado). `OD_DATA_DIR=<dir>` realoca todos os dados do daemon (usado para isolamento de teste e setups com instalação read-only); `OD_MEDIA_CONFIG_DIR=<dir>` afunila o override apenas para `media-config.json`, em setups que querem manter chaves de API fora do diretório de dados |
| Preview | Iframe sandboxed via `srcdoc` + parser `<artifact>` por skill ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Export | HTML (assets inline) · PDF (browser print, deck-aware) · PPTX (orientado pelo agente via skill) · ZIP (archiver) · Markdown |
| Ciclo de vida | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; portas via `--daemon-port` / `--web-port`, namespaces via `--namespace` |
| Desktop (opcional) | Shell Electron — descobre a URL do web via IPC sidecar, sem chute de porta; o mesmo canal `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` alimenta `tools-dev inspect desktop …` para E2E |

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

Requisitos de ambiente: Node `~24` e pnpm `10.33.x`. `nvm`/`fnm` são apenas helpers opcionais; se você usa um, rode `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` antes do `pnpm install`.

Para startup desktop/background, restart com porta fixa e checagens do dispatcher de geração de mídia (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`), veja [`QUICKSTART.pt-BR.md`](QUICKSTART.pt-BR.md).

No primeiro carregamento:

1. Detecta quais CLIs de agente você tem no `PATH` e escolhe um automaticamente.
2. Carrega 31 skills + 72 design systems.
3. Abre o welcome dialog para você colar uma chave Anthropic (só necessária para o caminho de fallback BYOK).
4. **Cria automaticamente `./.od/`** — a pasta de runtime local para o SQLite de projetos, artifacts por projeto e renders salvos. Não há passo `od init`; o daemon `mkdir`a tudo no boot.

Digite um prompt, clique em **Send**, veja o formulário de perguntas chegar, preencha, veja o card de todo streamando, veja o artifact renderizar. Clique em **Save to disk** ou baixe como ZIP do projeto.

### Estado de primeira execução (`./.od/`)

O daemon dono de uma única pasta oculta na raiz do repo. Tudo nela é gitignored e local da máquina — nunca faça commit.

```
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── artifacts/                 ← one-off "Save to disk" renders (timestamped)
└── projects/<id>/             ← per-project working dir, also the agent's cwd
```

| Quando você quiser… | Faça isto |
|---|---|
| Inspecionar o que tem dentro | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Resetar para um estado limpo | `pnpm tools-dev stop`, `rm -rf .od`, rode `pnpm tools-dev run web` de novo |
| Mover para outro lugar | ainda não suportado — o caminho é hard-coded relativo ao repo |

Mapa completo de arquivos, scripts e troubleshooting → [`QUICKSTART.pt-BR.md`](QUICKSTART.pt-BR.md).

## Estrutura do repositório

```
open-design/
├── README.md                      ← this file
├── README.pt-BR.md                ← Português (Brasil)
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
  <img src="docs/assets/design-systems-library.png" alt="A biblioteca de 72 design systems — spread de style guide" width="100%" />
</p>

72 sistemas na caixa, cada um como um único [`DESIGN.md`](design-systems/README.md):

<details>
<summary><b>Catálogo completo</b> (clique para expandir)</summary>

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

A biblioteca de sistemas de produto é importada via [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) de [`VoltAgent/awesome-design-md`][acd2]. Re-rode para atualizar. As 57 design skills vêm de [`bergside/awesome-design-skills`][ads] e são adicionadas direto em `design-systems/`.

## Direções visuais

Quando o usuário não tem brand spec, o agente emite um segundo formulário com cinco direções curadas — a adaptação do OD do [fallback "5 escolas × 20 filosofias de design" do `huashu-design`](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback). Cada direção é uma spec determinística — paleta em OKLch, font stack, dicas de postura de layout, referências — que o agente coloca literalmente no `:root` do template-semente. Um clique de radio → um sistema visual totalmente especificado. Sem improviso, sem AI-slop.

| Direção | Mood | Refs |
|---|---|---|
| Editorial — Monocle / FT | Revista impressa, tinta + creme + ferrugem quente | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | Frio, estruturado, acento mínimo | Linear · Vercel · Stripe |
| Tech utility | Densidade de informação, monoespaçada, terminal | Bloomberg · ferramentas Bauhaus |
| Brutalist | Cru, tipografia gigante, sem sombra, acentos duros | Bloomberg Businessweek · Achtung |
| Soft warm | Generoso, baixo contraste, neutros pessegos | Marketing da Notion · Apple Health |

Spec completa → [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts).

## Geração de mídia

O OD não para no código. A mesma superfície de chat que produz HTML `<artifact>` também dirige geração de **imagem**, **vídeo** e **áudio**, com adapters de modelo plugados no pipeline de mídia do daemon ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Todo render cai como arquivo real no workspace do projeto — `.png` para imagem, `.mp4` para vídeo — e aparece como chip de download quando a turn termina.

Três famílias de modelo carregam o peso hoje:

| Superfície | Modelo | Provider | Para quê |
|---|---|---|---|
| **Imagem** | `gpt-image-2` | Azure / OpenAI | Pôsteres, avatares de perfil, mapas ilustrados, infográficos, cards sociais estilo revista, restauração de foto, arte explodida de produto |
| **Vídeo** | `seedance-2.0` | ByteDance Volcengine | t2v + i2v cinematográfico de 15s com áudio — shorts narrativos, close-ups de personagem, filmes de produto, coreografia estilo MV |
| **Vídeo** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | Motion graphics HTML→MP4 — revelações de produto, kinetic typography, gráficos de dados, overlays sociais, logo outros, verticais estilo TikTok com legendas em karaokê |

Uma **galeria de prompts** crescente em [`prompt-templates/`](prompt-templates/) entrega **93 prompts prontos para replicar** — 43 de imagem (`prompt-templates/image/*.json`), 39 Seedance (`prompt-templates/video/*.json` excluindo `hyperframes-*`), 11 HyperFrames (`prompt-templates/video/hyperframes-*.json`). Cada um carrega thumbnail de preview, corpo do prompt literal, modelo alvo, aspect ratio e bloco `source` para licença + atribuição. O daemon serve em `GET /api/prompt-templates`, o app web os mostra como grid de cards nas tabs **Image templates** e **Video templates** da tela de entrada; um clique solta o prompt no composer com o modelo certo pré-selecionado.

### gpt-image-2 — galeria de imagens (amostra de 43)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="Evolução em escada de pedra 3D" /><br/><sub><b>Infográfico de Evolução em Escada de Pedra 3D</b><br/>Infográfico de 3 passos, estética de pedra esculpida</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Mapa Ilustrado de Comida" /><br/><sub><b>Mapa Ilustrado de Comida da Cidade</b><br/>Pôster de viagem editorial ilustrado à mão</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cena Cinematográfica de Elevador" /><br/><sub><b>Cena Cinematográfica de Elevador</b><br/>Still editorial de moda em frame único</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Retrato Anime Cyberpunk" /><br/><sub><b>Retrato Anime Cyberpunk</b><br/>Avatar de perfil — texto neon no rosto</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Mulher Glamurosa de Preto" /><br/><sub><b>Retrato de Mulher Glamurosa de Preto</b><br/>Retrato editorial de estúdio</sub></td>
</tr>
</table>

Set completo → [`prompt-templates/image/`](prompt-templates/image/). Fontes: a maioria vem de [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0), com atribuição autoral preservada por template.

### Seedance 2.0 — galeria de vídeos (amostra de 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Podcast de Música e Violão" /></a><br/><sub><b>Podcast de Música & Técnica de Violão</b><br/>Filme cinematográfico de estúdio em 4K</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Rosto Emocional" /></a><br/><sub><b>Close-up de Rosto Emocional</b><br/>Estudo cinematográfico de microexpressão</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Supercarro de Luxo" /></a><br/><sub><b>Supercarro de Luxo Cinematográfico</b><br/>Filme narrativo de produto</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Gato da Cidade Proibida" /></a><br/><sub><b>Sátira do Gato da Cidade Proibida</b><br/>Sátira estilizada curta</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Romance Japonês" /></a><br/><sub><b>Curta de Romance Japonês</b><br/>Narrativa Seedance 2.0 de 15s</sub></td>
</tr>
</table>

Clique em qualquer thumbnail para tocar o MP4 renderizado de fato. Set completo → [`prompt-templates/video/`](prompt-templates/video/) (entradas `*-seedance-*` e marcadas como Cinematic). Fontes: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0), com links originais de tweet e handles dos autores preservados.

### HyperFrames — motion graphics HTML→MP4 (11 templates prontos)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) é o framework open-source de vídeo agent-native da HeyGen — você (ou o agente) escreve HTML + CSS + GSAP, o HyperFrames renderiza em MP4 determinístico via headless Chrome + FFmpeg. O Open Design despacha o HyperFrames como modelo de vídeo de primeira classe (`hyperframes-html`) plugado ao dispatch do daemon, mais a skill `skills/hyperframes/` que ensina ao agente o contrato de timeline, regras de transição entre cenas, padrões audio-reativos, captions/TTS e os blocos do catálogo (`npx hyperframes add <slug>`).

Onze prompts hyperframes vivem em [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/), cada um sendo um brief concreto que produz um arquétipo específico:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Reveal de produto" /></a><br/><sub><b>Reveal de produto minimalista de 5s</b> · 16:9 · push-in title card com transição shader</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="Promo SaaS" /></a><br/><sub><b>Promo de produto SaaS de 30s</b> · 16:9 · estilo Linear/ClickUp com reveals 3D de UI</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaokê" /></a><br/><sub><b>Talking-head karaokê TikTok</b> · 9:16 · TTS + legendas word-synced</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Sizzle reel" /></a><br/><sub><b>Sizzle reel de marca de 30s</b> · 16:9 · kinetic typography sincronizada na batida, audio-reativa</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Gráfico de dados" /></a><br/><sub><b>Bar-chart race animada</b> · 16:9 · infográfico de dados estilo NYT</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Mapa de voo" /></a><br/><sub><b>Mapa de voo (origem → destino)</b> · 16:9 · reveal cinematográfico de rota estilo Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>Logo outro cinematográfico de 4s</b> · 16:9 · montagem peça-por-peça + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Contador de dinheiro" /></a><br/><sub><b>Contador $0 → $10K</b> · 9:16 · hype estilo Apple com flash verde + burst</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>Showcase de app em 3 celulares</b> · 16:9 · celulares flutuantes com callouts de feature</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Overlay social" /></a><br/><sub><b>Stack de overlays sociais</b> · 9:16 · X · Reddit · Spotify · Instagram em sequência</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Site para vídeo" /></a><br/><sub><b>Pipeline site-para-vídeo</b> · 16:9 · captura site em 3 viewports + transições</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

Padrão é o mesmo do resto: pegue um template, edite o brief, envie. O agente lê o `skills/hyperframes/SKILL.md` bundled (que carrega o workflow de render específico do OD — composição de arquivos-fonte em um `.hyperframes-cache/` para não poluir o workspace de arquivos, daemon despacha `npx hyperframes render` para fugir do hang sandbox-exec / Puppeteer do macOS, só o `.mp4` final cai como chip de projeto), autoriza a composição e entrega um MP4. Thumbnails dos blocos do catálogo © HeyGen, servidos do CDN deles; o framework OSS em si é Apache-2.0.

> **Também plugados, mas ainda sem templates de superfície:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (via Fal), MiniMax video-01 — todos vivem em `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5, Udio v2, Lyria 2 (música) e gpt-4o-mini-tts, MiniMax TTS (fala) cobrem a superfície de áudio. Templates para esses são contribuições abertas — solte um JSON em `prompt-templates/video/` ou `prompt-templates/audio/` e ele aparece no picker.

## Além do chat — o que mais entregamos

O loop chat / artifact é o destaque, mas algumas capacidades menos visíveis já estão plugadas e valem conhecer antes de comparar o OD com qualquer outra coisa:

- **Importação de ZIP do Claude Design.** Solte um export do claude.ai no welcome dialog. `POST /api/import/claude-design` extrai para um `.od/projects/<id>/` real, abre o arquivo de entrada como tab e prepara um prompt continue-de-onde-a-Anthropic-parou para o seu agente local. Sem reprompt, sem "peça ao modelo para recriar o que acabamos de ter". ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **Proxy BYOK multi-provider.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` recebe `{ baseUrl, apiKey, model, messages }`, monta a requisição upstream específica do provider, normaliza chunks SSE em `delta/end/error` e rejeita destinos loopback / link-local / RFC1918 para evitar SSRF. OpenAI-compatível cobre OpenAI, Azure AI Foundry `/openai/v1`, DeepSeek, Groq, MiMo, OpenRouter e vLLM self-hosted; Azure OpenAI adiciona URL de deployment + `api-version`; Google usa Gemini `:streamGenerateContent`.
- **Templates salvos pelo usuário.** Quando você gosta de um render, `POST /api/templates` faz snapshot do HTML + metadados na tabela `templates` do SQLite. O próximo projeto pega ele numa linha "your templates" no picker — mesma superfície dos 31 entregues, mas seu.
- **Persistência de tabs.** Todo projeto lembra os arquivos abertos e a tab ativa na tabela `tabs`. Reabra o projeto amanhã e o workspace está exatamente como você deixou.
- **API de lint de artifact.** `POST /api/artifacts/lint` roda checagens estruturais num artifact gerado (framing `<artifact>` quebrado, side files obrigatórios faltando, tokens de paleta velhos) e devolve findings que o agente pode reler na próxima turn. A autocrítica de 5-dim usa isso para ancorar a nota em evidência real, não em vibes.
- **Protocolo de sidecar + automação desktop.** Daemon, web e desktop carregam stamps tipados de cinco campos (`app · mode · namespace · ipc · source`) e expõem um canal IPC JSON-RPC em `/tmp/open-design/ipc/<namespace>/<app>.sock`. `tools-dev inspect desktop status \| eval \| screenshot` dirige esse canal, então E2E headless funciona contra um shell Electron real sem harnesses customizados ([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Spawn amigável a Windows.** Todo adapter que estouraria o limite de ~32 KB de argv do `CreateProcess` em prompts compostos longos (Codex, Gemini, OpenCode, Cursor Agent, Qwen, Pi) entrega o prompt via stdin. Claude Code e Copilot ficam com `-p`; o daemon faz fallback para arquivo temporário de prompt quando até isso transborda.
- **Dados de runtime por namespace.** `OD_DATA_DIR` e `--namespace` te dão árvores estilo `.od/` totalmente isoladas, então Playwright, canais beta e seus projetos reais nunca compartilham um arquivo SQLite.

## Maquinário anti-AI-slop

Toda a maquinaria abaixo é o playbook do [`huashu-design`](https://github.com/alchaincyf/huashu-design), portado para a pilha de prompt do OD e exigível por skill via o pre-flight de side files. Leia [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) para o texto vivo:

- **Formulário de perguntas primeiro.** O turn 1 é só `<question-form>` — sem pensar, sem tools, sem narração. O usuário escolhe defaults na velocidade de um radio.
- **Extração de brand-spec.** Quando o usuário anexa um screenshot ou URL, o agente roda um protocolo de cinco passos (localizar · baixar · grep hex · codificar `brand-spec.md` · vocalizar) antes de escrever CSS. **Nunca chuta cores de marca de memória.**
- **Crítica em 5-dim.** Antes de emitir `<artifact>`, o agente silenciosamente nota o output de 1 a 5 em filosofia / hierarquia / execução / especificidade / contenção. Qualquer coisa abaixo de 3/5 é regressão — corrija e renote. Duas passadas é normal.
- **Checklist P0/P1/P2.** Toda skill traz um `references/checklist.md` com gates duros P0. O agente precisa passar P0 antes de emitir.
- **Blacklist de slop.** Gradiente roxo agressivo, ícones genéricos de emoji, card arredondado com borda lateral de destaque, humanos SVG desenhados à mão, Inter como fonte de *display*, métricas inventadas — explicitamente proibidos no prompt.
- **Placeholder honesto > stat falsa.** Quando o agente não tem um número real, ele escreve `—` ou um bloco cinza com label, não "10× mais rápido".

## Comparação

| Eixo | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Licença | Closed | MIT | **Apache-2.0** |
| Form factor | Web (claude.ai) | Desktop (Electron) | **Web app + daemon local** |
| Deployável na Vercel | ❌ | ❌ | **✅** |
| Runtime de agente | Bundled (Opus 4.7) | Bundled ([`pi-ai`][piai]) | **Delegado ao CLI já existente do usuário** |
| Skills | Proprietárias | 12 módulos TS customizados + `SKILL.md` | **31 bundles [`SKILL.md`][skill] em arquivo, drop-in** |
| Design system | Proprietário | `DESIGN.md` (roadmap v0.2) | **`DESIGN.md` × 129 sistemas entregues** |
| Flexibilidade de provider | Só Anthropic | 7+ via [`pi-ai`][piai] | **12 adapters de CLI + proxy BYOK OpenAI-compatible** |
| Form de perguntas inicial | ❌ | ❌ | **✅ Regra dura, turn 1** |
| Direction picker | ❌ | ❌ | **✅ 5 direções determinísticas** |
| Progresso de todos ao vivo + stream de tools | ❌ | ✅ | **✅** (padrão UX vindo do open-codesign) |
| Preview em iframe sandboxed | ❌ | ✅ | **✅** (padrão vindo do open-codesign) |
| Importação de ZIP do Claude Design | n/a | ❌ | **✅ `POST /api/import/claude-design` — continue de onde a Anthropic parou** |
| Edições cirúrgicas em modo comentário | ❌ | ✅ | 🟡 parcial — comentários por elemento de preview + anexos no chat; confiabilidade do patch cirúrgico ainda em andamento |
| Painel de tweaks emitido pela IA | ❌ | ✅ | 🚧 roadmap — UX dedicada de painel ao lado do chat ainda não está implementada |
| Workspace nível filesystem | ❌ | parcial (sandbox Electron) | **✅ cwd real, tools reais, SQLite persistido (projects · conversations · messages · tabs · templates)** |
| Autocrítica em 5-dim | ❌ | ❌ | **✅ Gate pré-emit** |
| Lint de artifact | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — findings devolvidos ao agente** |
| IPC de sidecar + desktop headless | ❌ | ❌ | **✅ Processos com stamps + `tools-dev inspect desktop status \| eval \| screenshot`** |
| Formatos de export | Limitado | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (orientado pelo agente) / ZIP / Markdown** |
| Reuso de skill PPT | N/A | Built-in | **[`guizang-ppt-skill`][guizang] cai inalterado (default do deck mode)** |
| Cobrança mínima | Pro / Max / Team | BYOK | **BYOK — cole qualquer `baseUrl` OpenAI-compatible** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Agentes de código suportados

Detectados automaticamente do `PATH` no boot do daemon. Sem config necessária. O dispatch streaming vive em [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`); parsers por CLI vivem ao lado. Modelos são populados sondando `<bin> --list-models` / `<bin> models` / handshake ACP, ou via lista fallback curada quando o CLI não expõe lista.

| Agente | Bin | Formato de stream | Forma do argv (caminho de prompt composto) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (eventos tipados) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + parser `codex` | `codex exec --json --skip-git-repo-check --full-auto [-C cwd] [--model …] [-c model_reasoning_effort=…] -` (prompt no stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + parser `gemini` | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]` (prompt no stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + parser `opencode` | `opencode run --format json --dangerously-skip-permissions [--model …] -` (prompt no stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + parser `cursor-agent` | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (prompt no stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (chunks crus de stdout) | `qwen --yolo [--model …] -` (prompt no stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (eventos tipados) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| [Pi](https://github.com/mariozechner/pi-ai) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc --no-session [--model …] [--thinking …]` (prompt enviado como comando RPC `prompt`) |
| **BYOK multi-provider** | n/a | Normalização SSE | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI-compatible / Azure OpenAI / Gemini; com guarda SSRF contra loopback / link-local / RFC1918 |

Adicionar um novo CLI é uma entrada em [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). O formato de stream é um de `claude-stream-json`, `copilot-stream-json`, `json-event-stream` (com `eventParser` por CLI), `acp-json-rpc`, `pi-rpc` ou `plain`.

## Referências & linhagem

Todo projeto externo do qual este repo emprestou. Cada link aponta para a fonte para você verificar a procedência.

| Projeto | Papel aqui |
|---|---|
| [`Claude Design`][cd] | O produto closed-source ao qual este repo é alternativa open-source. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | O núcleo de filosofia de design. Workflow Junior-Designer, protocolo de 5 passos para asset de marca, checklist anti-AI-slop, autocrítica em 5 dimensões e a biblioteca "5 escolas × 20 filosofias de design" por trás do nosso direction picker — tudo destilado em [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) e [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | Skill magazine-web-PPT bundled literalmente sob [`skills/guizang-ppt/`](skills/guizang-ppt/) com LICENSE original preservado. Default do deck mode. Cultura de checklist P0/P1/P2 emprestada para todas as outras skills. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | A arquitetura de daemon + adapter. Detecção de agente por scan de PATH, daemon local como único processo privilegiado, visão de mundo agente-como-time. Adotamos o modelo; não vendoramos o código. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | A primeira alternativa open-source ao Claude Design e nosso peer mais próximo. Padrões UX adotados: loop streaming-artifact, preview em iframe sandboxed (React 18 + Babel vendored), painel de agente ao vivo (todos + tool calls + interruptível), lista de cinco formatos de export (HTML/PDF/PPTX/ZIP/Markdown), hub de storage local-first, injeção de gosto via `SKILL.md` e a primeira passada de anotações de preview em modo comentário. Padrões UX ainda no nosso roadmap: confiabilidade plena de edição cirúrgica e painel de tweaks emitido pela IA. **Deliberadamente não vendoramos [`pi-ai`][piai]** — o open-codesign embute como runtime de agente; nós delegamos para o CLI que o usuário já tem. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | Fonte do schema de 9 seções do `DESIGN.md` e dos 70 sistemas de produto importados via [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). |
| [`bergside/awesome-design-skills`][ads] | Fonte das 57 design skills adicionadas direto como arquivos `DESIGN.md` normalizados sob `design-systems/`. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Inspiração para distribuição de skills via symlink entre múltiplos CLIs de agente. |
| [Claude Code skills][skill] | A convenção `SKILL.md` adotada literalmente — qualquer skill do Claude Code cai em `skills/` e é detectada pelo daemon. |

Procedência em formato longo — o que pegamos de cada um, o que deliberadamente não pegamos — vive em [`docs/references.md`](docs/references.md).

## Roadmap

- [x] Daemon + detecção de agente (12 adapters de CLI) + registry de skills + catálogo de design system
- [x] Web app + chat + formulário de perguntas + picker de 5 direções + progresso de todos + preview sandboxed
- [x] 31 skills + 72 design systems + 5 direções visuais + 5 frames de dispositivo
- [x] Projects · conversations · messages · tabs · templates lastreados em SQLite
- [x] Proxy BYOK multi-provider (`/api/proxy/{anthropic,openai,azure,google}/stream`) com guarda SSRF
- [x] Importação de ZIP do Claude Design (`/api/import/claude-design`)
- [x] Protocolo de sidecar + desktop Electron com automação IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] API de lint de artifact + gate de autocrítica 5-dim pré-emit
- [ ] Edições cirúrgicas em modo comentário — parcial entregue: comentários por elemento de preview e anexos de chat; patch alvo confiável segue em andamento
- [ ] UX do painel de tweaks emitido pela IA — ainda não implementado
- [ ] Receita de deploy Vercel + tunnel (Topologia B)
- [ ] `npx od init` em um comando para fazer scaffold de um projeto com `DESIGN.md`
- [ ] Marketplace de skills (`od skills install <github-repo>`) e superfície CLI `od skill add | list | remove | test` (rascunhada em [`docs/skills-protocol.md`](docs/skills-protocol.md), implementação pendente)
- [ ] Build Electron empacotado a partir de `apps/packaged/`

Entrega faseada → [`docs/roadmap.md`](docs/roadmap.md).

## Status

Esta é uma implementação inicial — o loop fechado (detectar → escolher skill + design system → chat → parsear `<artifact>` → preview → salvar) roda end-to-end. A pilha de prompt e a biblioteca de skills é onde mora a maior parte do valor, e estão estáveis. A UI no nível de componente está sendo entregue diariamente.

## Dê uma estrela

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Dê estrela ao Open Design no GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Se isso te poupou trinta minutos — dá um ★. Estrelas não pagam aluguel, mas dizem para a próxima designer, agente e contribuidora que esse experimento vale a atenção. Um clique, três segundos, sinal real: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Contribuindo

Issues, PRs, novas skills e novos design systems são todos bem-vindos. As contribuições com maior alavancagem geralmente são uma pasta, um arquivo Markdown ou um adapter do tamanho de um PR:

- **Adicione uma skill** — solte uma pasta em [`skills/`](skills/) seguindo a convenção [`SKILL.md`][skill].
- **Adicione um design system** — solte um `DESIGN.md` em [`design-systems/<marca>/`](design-systems/) usando o schema de 9 seções.
- **Plugue um novo CLI de agente de código** — uma entrada em [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

Walkthrough completo, barra para mergear, estilo de código e o que não aceitamos → [`CONTRIBUTING.pt-BR.md`](CONTRIBUTING.pt-BR.md) ([English](CONTRIBUTING.md), [Deutsch](CONTRIBUTING.de.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Contribuidoras e contribuidores

Obrigado a todas as pessoas que ajudaram a empurrar o Open Design pra frente — via código, docs, feedback, novas skills, novos design systems ou até uma issue afiada. Toda contribuição real conta, e a parede abaixo é a forma mais simples de dizer isso em voz alta.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-04" alt="Contribuidoras e contribuidores do Open Design" />
</a>

Se você acabou de mandar seu primeiro PR — bem-vindo. A label [`good-first-issue`](https://github.com/nexu-io/open-design/labels/good-first-issue) é o ponto de entrada.

## Atividade do repositório

<picture>
  <img alt="Open Design — métricas do repositório" src="docs/assets/github-metrics.svg" />
</picture>

O SVG acima é regenerado diariamente por [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) usando [`lowlighter/metrics`](https://github.com/lowlighter/metrics). Dispare um refresh manual pela aba **Actions** se quiser antes; para plugins mais ricos (tráfego, follow-up time), adicione um secret de repositório `METRICS_TOKEN` com um PAT fine-grained.

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-04" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-04" />
    <img alt="Histórico de estrelas do Open Design" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-04" />
  </picture>
</a>

Se a curva sobe, é o sinal que a gente procura. ★ esse repo para empurrar.

## Créditos

A família de skills HTML PPT Studio — a master [`skills/html-ppt/`](skills/html-ppt/) e os wrappers por template em [`skills/html-ppt-*/`](skills/) (15 templates de deck completo, 36 temas, 31 layouts de página única, 27 animações CSS + 20 canvas FX, runtime de teclado e modo apresentador com magnetic cards) — é integrada do projeto open-source [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT). O LICENSE upstream está in-tree em [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE) e o crédito autoral vai para [@lewislulu](https://github.com/lewislulu). Cada card de Examples por template (`html-ppt-pitch-deck`, `html-ppt-tech-sharing`, `html-ppt-presenter-mode`, `html-ppt-xhs-post`, …) delega a orientação de autoria para a master skill, então o comportamento prompt → output do upstream é preservado end-to-end ao clicar em **Use this prompt**.

O fluxo magazine / horizontal-swipe deck em [`skills/guizang-ppt/`](skills/guizang-ppt/) é integrado de [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT). Crédito autoral para [@op7418](https://github.com/op7418).

## Licença

Apache-2.0. O bundled `skills/guizang-ppt/` mantém seu [LICENSE](skills/guizang-ppt/LICENSE) original (MIT) e atribuição de autoria a [op7418](https://github.com/op7418). O bundled `skills/html-ppt/` mantém seu [LICENSE](skills/html-ppt/LICENSE) original (MIT) e atribuição de autoria a [lewislulu](https://github.com/lewislulu).
