<h1 align="center">Open Design: a alternativa open-source ao Claude Design</h1>

> 🔥 **O Open Design 0.10.0 chegou: o espaço de trabalho de design Agentic tudo-em-um.** Todo o ofício agora vive em uma única janela — vá de uma ideia vaga à descoberta de referências, coleta de material, edição interativa, fila de comentários, polimento de animações e entrega para um editor ou um Code Agent — sem sair do app. Com sessões em paralelo, deixa de parecer um assistente e passa a parecer um time de design local trabalhando para você. [Baixar 0.10.0](https://github.com/nexu-io/open-design/releases) · [Participar da discussão](https://github.com/nexu-io/open-design/discussions/4153)
>
> ⚡ **Open Design AMR (Agentic Model Router) — o serviço de modelos oficial.** Uma única recarga para usar GPT, Claude, Gemini e DeepSeek dentro do Open Design: mais de 20 modelos de ponta, zero configuração, cobrança pelo uso real de tokens. [Experimentar o AMR](https://open-design.ai/amr/)
>
> 🏅 **O programa Open Design Fellow está aberto.** Se você também acredita que o design deveria ser aberto — torne-se um Open Design Fellow, ajude a moldar o produto ao lado do time central e contribua para que mais pessoas participem da definição do futuro do design. Detalhes → [`MAINTAINERS.md`](../../MAINTAINERS.md) e [Discord](https://discord.gg/qhbcCH8Am4).

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="Open Design — The open-source Claude Design alternative · 150 Design Systems · 261 Plugins · 21 Coding Agents · 14 Media Providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/">Site</a> ·
  <a href="https://open-design.ai/">Download</a> ·
  <a href="https://open-design.ai/amr/">Model Router</a> ·
  <a href="https://discord.gg/qhbcCH8Am4">Discord</a> ·
  <a href="https://x.com/nexudotio">Siga @nexudotio</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="QUICKSTART.pt-BR.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md">English</a> · <a href="README.es.md">Español</a> · <b>Português</b> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## O que é o Open Design

🎨 **A alternativa local-first e open-source ao [Claude Design][cd].** &nbsp;🖥️ **App de desktop nativo para macOS e Windows.** &nbsp;⚡ **Mais de 100 skills** · ✨ **150 sistemas `DESIGN.md` de nível profissional de marca** · 📦 **261 plugins prontos para uso.** &nbsp;🖼️ Gera **protótipos web · desktop · mobile**, **dashboards / artefatos ao vivo**, **decks**, **imagens**, **vídeo**, além de motion graphics com **HyperFrames**. 🔒 Preview em iframe em sandbox · exportação para HTML / PDF / PPTX / MP4. &nbsp;🤖 **Roda em Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Hermes · Kimi · Antigravity e mais 21 CLIs locais**, ou em qualquer endpoint compatível com OpenAI via BYOK.

O Open Design é o que você obtém quando o loop **agent-native** que a Anthropic lançou com o Claude Design — descobrir o briefing, travar a direção, transmitir o artefato, criticar, entregar — deixa de ser fechado e se torna um **sistema de arquivos de skills, design systems e plugins** que os coding agents já presentes no seu laptop conseguem ler, escrever e remixar. Sua CLI vira o motor de design, seu laptop vira o estúdio e o `DESIGN.md` do seu time vira o contrato de marca.

Ele também é a **alternativa ao Figma para a era dos agentes** — em vez de empurrar pixels num canvas, ele entrega artefatos de página única em CSS real, fontes reais, componentes reais, exportados direto para HTML / PDF / PPTX / MP4 — já moldados pelo seu design system, já executáveis dentro do agente que você usa todos os dias.

[cd]: https://x.com/claudeai/status/2045156267690213649

---

## Tour pelo produto

Um olhar rápido sobre o que é o Open Design e o que ele faz. Comece pela **Home**, orquestre fluxos de trabalho recorrentes com **Automation**, destile um contrato de marca em **Design System** e amplie com **Plugins** e **integrações**; dentro do **Studio** de qualquer projeto, o mesmo design system produz protótipos, artefatos ao vivo, HyperFrames, decks e imagens.

### Páginas principais

<table>
<tr>
<td valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/home.png" alt="Página Home" /><br/>
<sub><b>Home</b> — o ponto de entrada com a visão geral. Escolha uma skill e um design system, digite o briefing e dispare tudo a partir de um único lugar.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/automation.png" alt="Página Automation" /><br/>
<sub><b>Automation</b> — orquestre fluxos de design repetitivos em automações reutilizáveis e agendáveis.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/design-system.png" alt="Página Design System" /><br/>
<sub><b>Design System</b> — destile o <code>DESIGN.md</code> do seu time num contrato de marca que molda cada resultado.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/plugin.png" alt="Página Plugin" /><br/>
<sub><b>Plugin</b> — explore, instale e distribua plugins de fluxo de trabalho para estender a geração sob demanda.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/integrations.png" alt="Página Integrations" /><br/>
<sub><b>Integrations</b> — conecte sistemas externos e ferramentas MCP, e use o Open Design a partir de qualquer IDE, script ou automação.</sub>
</td>
</tr>
</table>

### Studio — vários tipos de artefato em um único projeto

Dentro do Studio de um projeto, o mesmo design system produz múltiplos tipos de artefato:

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-prototype.png" alt="Protótipo" /><br/>
<sub><b>Prototype</b> — artefatos HTML de página única que leem seu design system e renderizam num iframe em sandbox, com preview instantâneo e download como código-fonte.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-hyperframe.png" alt="HyperFrame" /><br/>
<sub><b>HyperFrame</b> — motion e gráficos animados programáticos, renderizados para um MP4 real (ex.: 1920×1080 · 30fps).</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-ppt.png" alt="Deck" /><br/>
<sub><b>Deck</b> — pitch decks pelos quais você navega página por página, controla pelo teclado e exporta para PPTX / PDF.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-image.png" alt="Imagem" /><br/>
<sub><b>Image</b> — imagens e assets visuais de nível profissional de marca, com geração e download em alta resolução.</sub>
</td>
</tr>
</table>

---

## Compatibilidade de plataformas

> O Open Design é entregue como **skills, uma CLI e um servidor MCP** que os coding agents populares consomem nativamente. Depois que o OD está instalado, um único `od mcp install <agent>` conecta o servidor MCP à configuração daquele agente, e você chama as mesmas ferramentas de dentro de qualquer agente.

| Coding agent / plataforma &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Status &nbsp;&nbsp; | Instalação do servidor MCP em uma linha &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ Suportado | `od mcp install claude` |
| [Codex CLI](https://github.com/openai/codex) | ✅ Suportado | `od mcp install codex` |
| [Cursor](https://www.cursor.com/cli) | ✅ Suportado | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ Suportado | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ Suportado | `od mcp install copilot` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ Suportado | `od mcp install gemini` |
| [OpenCode](https://opencode.ai/) | ✅ Suportado | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ Suportado | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ Suportado | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ Suportado | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ Suportado | `od mcp install trae` |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | ✅ Suportado | `od mcp install kimi` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ Suportado | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ Suportado | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ Suportado | `od mcp install hermes` |

`od mcp install <agent> --print` para uma prévia em dry-run · `--uninstall` para remover · lista completa com `od mcp install --help`.

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="The 21 coding-agent CLIs Open Design supports — Claude Code · Codex · OpenCode · Hermes · Antigravity · Gemini · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Devin · Trae" width="100%" />
</p>

**Nenhuma CLI instalada?** O proxy BYOK em `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` te dá o mesmo loop (sem spawn de processo) — cole `baseUrl` + `apiKey` + `model`, com suporte a OpenAI, Anthropic, Azure OpenAI, Google Gemini, Ollama, LM Studio, vLLM ou qualquer endpoint compatível com OpenAI. A proteção SSRF por alvo bloqueia IPs internos / link-local / CGNAT na borda do daemon.

O contrato do adaptador e os parsers de stream ficam em [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts). Adicionar uma nova CLI é uma única entrada — veja [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

---

## Demo

Quatro categorias centrais de produto, todas renderizadas por um coding agent rodando no seu laptop. Clique numa miniatura para ver o exemplo real.

### 1 · Protótipos — web · desktop · mobile

A superfície de saída padrão. Artefatos HTML de página única que leem seu `DESIGN.md` e renderizam num iframe em sandbox.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/01-entry-view.png" alt="Tela de entrada" /><br/>
<sub><b>Tela de entrada</b> — escolha uma skill, escolha um design system, digite o briefing. Uma única superfície para protótipos, dashboards, decks, apps mobile e páginas de revista.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/mobile-onboarding.png" alt="Onboarding mobile" /><br/>
<sub><b>Protótipo mobile</b> — chrome do iPhone 15 Pro com precisão de pixel, fluxos multitela. O agente nunca redesenha o frame do celular; frames de dispositivo compartilhados ficam em <code>assets/frames/</code>.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/dating-web.png" alt="Protótipo web dating-web" /><br/>
<sub><b>Protótipo web</b> — um dashboard editorial com barras de rolagem, KPIs e gráficos. Renderizado direto de <code>design-templates/dating-web/</code>.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/gamified-app.png" alt="App gamificado" /><br/>
<sub><b>Protótipo de app mobile</b> — um fluxo gamificado de três telas com faixas de XP e detalhe de quest. Faça o handoff direto para Cursor / Codex / Claude Code para transformar em React/Next/Vue.</sub>
</td>
</tr>
</table>

### 2 · Artefatos & dashboards ao vivo

Dashboards ao vivo, decision rooms, painéis de KPI — artefatos de página única que puxam dados por um painel de tweaks e permanecem editáveis no lugar.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/live-dashboard.png" alt="Dashboard ao vivo" /><br/>
<sub><b>Dashboard ao vivo</b> — um painel de KPI editável cujo painel de tweaks expõe os parâmetros que vale a pena ajustar. O agente emite um manifesto, e o iframe re-renderiza sem recarregar.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/research-decision-room.png" alt="Decision room" /><br/>
<sub><b>Decision room</b> — um artefato de briefing multifonte para reuniões de produto / pesquisa / operações.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/github-dashboard.png" alt="Dashboard GitHub" /><br/>
<sub><b>Dashboard no estilo GitHub</b> — métricas de repositório apresentadas como um artefato ao vivo.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/flowai-live-dashboard-template.png" alt="Dashboard ao vivo Flow" /><br/>
<sub><b>Template de dashboard ao vivo Flow</b> — um template de KPI específico de domínio, com a marca aplicada pelo <code>DESIGN.md</code> ativo.</sub>
</td>
</tr>
</table>

### 3 · Decks — decks de revista, updates semanais, pitches

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/07-magazine-deck.png" alt="Deck de revista (guizang-ppt)" /><br/>
<sub><b>Modo deck (guizang-ppt)</b> — layouts de revista, hero em WebGL, checklists P0/P1/P2. Empacotado na íntegra a partir de <a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a> com sua licença original preservada.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/deck-swiss-international.png" alt="Deck Swiss" /><br/>
<sub><b>Deck no estilo Swiss International</b> — ancorado em grid, com acentos monocromáticos. Um dos <b>15 templates de deck</b> e <b>36 temas</b> em <code>design-templates/html-ppt-*/</code>.</sub>
</td>
</tr>
</table>

Todo deck exporta para **HTML** (arquivo único, assets embutidos), **PDF** (impressão do navegador, ciente do deck), **PPTX** (skill conduzida pelo agente), **ZIP** (arquivo compactado) ou **Markdown**.

### 4 · Imagens — `gpt-image-2`, ImageRouter, API personalizada

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated city food map" /><br/><sub><b>Mapa gastronômico ilustrado da cidade</b><br/>Pôster de viagem editorial desenhado à mão</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic elevator scene" /><br/><sub><b>Cena cinematográfica de elevador</b><br/>Still editorial de quadro único</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk anime portrait" /><br/><sub><b>Retrato cyberpunk</b><br/>Avatar de perfil — texto de rosto em neon</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D stone staircase evolution" /><br/><sub><b>Escadaria de pedra 3D</b><br/>Infográfico em pedra talhada</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous portrait" /><br/><sub><b>Retrato glamoroso</b><br/>Foto de estúdio editorial</sub></td>
</tr>
</table>

**93 prompts prontos para replicar** ficam em [`prompt-templates/`](../../prompt-templates/) — miniaturas de prévia, corpo completo do prompt, modelo de destino, proporção de tela e atribuição de origem. Um clique solta um briefing no composer.

### 5 · Vídeo & HyperFrames — motion graphics agent-native

O **[HyperFrames][hyperframes]** é o framework de vídeo open-source e agent-native da HeyGen, integrado como cidadão de primeira classe no Open Design. O agente escreve HTML + CSS + GSAP, e o HyperFrames renderiza tudo para um MP4 determinístico via Chrome headless + FFmpeg. Combine-o com o **Seedance 2.0** para t2v / i2v cinematográfico, **Veo 3 / Sora 2 / Kling 2** para variantes de modelo roteadas e **Suno v5 / Lyria 2** para a camada de áudio.

<table>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>Promo de produto SaaS de 30s</b> · 16:9 · reveals 3D de UI</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>Talking-head de karaokê para TikTok</b> · 9:16 · TTS + legendas sincronizadas por palavra</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle reel" /></a><br/><sub><b>Sizzle reel de marca de 30s</b> · 16:9 · tipografia cinética reativa ao áudio</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Bar chart race" /></a><br/><sub><b>Corrida de gráfico de barras</b> · 16:9 · infográfico de dados no estilo NYT</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Mapa de voo</b> · 16:9 · reveal de rota no estilo Apple</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>Outro cinematográfico de logo de 4s</b> · 16:9 · montagem peça por peça + bloom</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>Contador de dinheiro $0 → $10K</b> · 9:16 · hype no estilo Apple</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Site para vídeo</b> · 16:9 · captura o site em 3 viewports</sub></td>
</tr>
</table>

11 templates de HyperFrames + 39 prompts de Seedance vêm com o repositório. Miniaturas do catálogo © HeyGen; o framework é Apache-2.0. O fluxo de renderização específico do OD (cache de composição, contorno para sandbox-exec, MP4 como chip) está detalhado em [`design-templates/hyperframes/`](../../design-templates/hyperframes/).

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## Por que o Open Design

> **Em abril de 2026, a Anthropic lançou o [Claude Design][cd] — a primeira vez que um LLM deixou de escrever prosa e passou a entregar artefatos de design diretamente.** Viralizou. Mas continuou closed-source, pago, só na nuvem, preso ao modelo da Anthropic, às skills da Anthropic, à superfície da Anthropic. Sem checkout, sem self-host, sem deploy na Vercel, sem trocar pelo seu próprio agente.

O Open Design (OD) é a alternativa open-source. Mesmo loop, mesmo modelo mental artifact-first, nada do lock-in:

- 🤖 **Agent-native, agnóstico de modelo.** Não entregamos um agente. O `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi` que já está no seu `PATH` é o motor de design. Troque com um clique.
- 🧠 **Nível profissional de marca por padrão.** Toda renderização lê o `DESIGN.md` ativo — um schema de 9 seções cobrindo paleta, tipografia, espaçamento, motion, voz e anti-padrões. 150 sistemas vêm com o repositório (Linear, Stripe, Vercel, Airbnb, Apple, Tesla, Notion, Anthropic, Cursor, Supabase, Figma…). Solte uma pasta e o seletor a encontra.
- 🖥️ **Local-first, BYOK em todas as camadas.** Apps de desktop nativos para macOS (Apple Silicon + Intel) e Windows (x64). AppImage de Linux na trilha de release opcional. SQLite em `.od/app.sqlite`, arquivos em `.od/projects/<id>/`, sem telemetria, sem ida e volta à nuvem.
- 🌍 **Componível em três planos.** **Plugins** carregam fluxos de trabalho executáveis · **skills** carregam o gosto de design do agente · **design systems** carregam a marca. Todos os três são arquivos simples que qualquer pessoa pode escrever, versionar e publicar.
- 🔁 **Renove uma base de código existente.** Entregue um repositório `git` + `DESIGN.md` ao agente e ele refatora seus componentes reais para a especificação de marca. Plugins dedicados migram fluxos do Figma / Pencil para código React / Next.js / Vue.
- 🔒 **Privacidade por convicção.** Tudo roda onde seus dados vivem — seu laptop, o servidor do seu time, seu projeto na Vercel. Quando a rede é necessária, o proxy BYOK é protegido contra SSRF.

### Comparativo

| | [Claude Design][cd] | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| Open source | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| Self-host / desktop | ❌ | ❌ | ❌ | **✅ macOS + Windows + Vercel** |
| Agent-native (roda na sua CLI) | Só Anthropic | ❌ | Só agente na nuvem | **✅ 21 CLIs + BYOK** |
| `DESIGN.md` de nível profissional de marca | Proprietário | Theme JSON | Tokens limitados | **✅ 150 sistemas entregues** |
| Skills / plugins / templates | Fechado | Loja de plugins | Fechado | **✅ Mais de 100 skills · 261 plugins** |
| HyperFrames (HTML→MP4) | ❌ | ❌ | ❌ | **✅ Primeira classe** |
| Renovar um repositório existente para a marca | ❌ | ❌ | ❌ | **✅ via agente + `DESIGN.md`** |
| Cobrança mínima | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · qualquer endpoint compatível** |

---

## Início rápido

### 🖥️ Baixe o app de desktop (recomendado — zero configuração)

A forma mais rápida de usar o Open Design. Sem Node, sem pnpm, sem clone.

- **macOS** (Apple Silicon · Intel x64) → [**open-design.ai**](https://open-design.ai/) ou [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows** (x64) → [**open-design.ai**](https://open-design.ai/) ou [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux** (AppImage, trilha opcional) → [GitHub Releases](https://github.com/nexu-io/open-design/releases)

Após instalar: o app detecta automaticamente cada CLI de coding agent no seu `PATH`, carrega mais de 100 skills e 150 design systems e permite que você digite um briefing na tela de entrada.

### 🤖 Instale no seu coding agent (sem interface)

Você pode usar o Open Design sem nunca abrir a GUI — chame-o como skill, plugin ou servidor MCP dentro do Claude Code, Codex, Cursor, Copilot, OpenClaw, Antigravity, Hermes, Kimi e mais.

```bash
# One-line install into the agent you're using:
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
# <agent> = claude | codex | cursor | copilot | openclaw | antigravity | gemini
#         | pi | vibe | hermes | cline | kimi | trae | opencode
```

Depois, dentro do agente:

```
> Use open-design to generate a landing page with the Linear design system
```

O agente lê `skills/`, escolhe o `SKILL.md` certo, vincula o `DESIGN.md` que você nomeou e emite um `<artifact>` com preview em `http://localhost:7456`.

### 🐳 Rode com Docker

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# open http://localhost:7456
```

### 🧑‍💻 Rode a partir do código-fonte

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Node `~24`, pnpm `10.33.x`. Usuários de Windows, veja [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md). Início rápido completo, variáveis de ambiente, Nix flake e fluxo de build empacotado → [`QUICKSTART.pt-BR.md`](QUICKSTART.pt-BR.md).

### Um fluxo de trabalho completo — do briefing ao artefato

`briefing → plugin → direção → design system → artefato → handoff → memória`

1. **Um PM envia um briefing.** O seletor de plugins oferece landing page · pitch deck · dashboard · post de rede social · spec de PM · scorecard de OKR…
2. **Um designer (ou o agente) trava a direção.** Sem marca? Escolha entre 5 direções curadas. Tem uma marca? Solte um screenshot / URL → o agente conecta o GitHub, importa do Figma e codifica um `DESIGN.md` reutilizável.
3. **O agente emite o primeiro `<artifact>`.** Plugin + skill + `DESIGN.md` estão vinculados. Ele transmite para um iframe em sandbox, editável no lugar — não "regerar do zero".
4. **Faça o handoff para a engenharia.** O artefato é HTML/CSS real — solte-o no Cursor, Codex ou Claude Code para continuar construindo como código. Ou exporte PPTX / PDF / MP4 direto para o marketing.
5. **O Open Design fica mais inteligente conforme você usa.** Seus screenshots, fontes, paletas e artefatos confirmados se acumulam como padrões para a próxima sessão. Menos retrabalho, menos desvio.

---

## Use o Open Design a partir do seu coding agent

O Open Design entrega um **servidor MCP stdio** e **scripts de instalação** por agente. Qualquer agente compatível com MCP em outro repositório pode ler arquivos diretamente dos seus projetos locais do Open Design — tokens CSS, componentes JSX, HTML de entrada — como uma API estruturada consultável por nome. O agente sempre vê o arquivo ao vivo, não uma exportação desatualizada.

```bash
# One-line install (16+ CLIs supported):
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>

# Then the agent can:
od search-files "primary button"      # search files across projects
od get-file design-systems/linear-app/DESIGN.md
od get-artifact <slug>                # latest rendered artifact
od plugin run web-prototype --brief "..."
od skill list --scenario marketing
```

**Por que MCP?** Exportar e reanexar um zip a cada iteração quebra o fluxo. O MCP expõe a fonte de design diretamente — o agente sempre vê o arquivo ao vivo.

**Para um agente começando do zero,** o instalador coloca `~/.config/<agent>/open-design.json` (ou o equivalente da plataforma) além de um snippet MCP de copiar e colar. O Cursor recebe um deeplink de um clique; o Claude Code recebe um one-liner `claude mcp add-json`; todo outro agente recebe JSON no schema que sua configuração espera. Fluxo completo por agente → **Settings → MCP server** no app de desktop, ou [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

**Modelo de segurança.** Somente leitura por padrão, o daemon faz bind em `127.0.0.1` e o SSRF é bloqueado na borda do proxy. A exposição na LAN exige um `OD_BIND_HOST` explícito mais `OD_ALLOWED_ORIGINS`. Credenciais de conector e rotas de preview de artefatos ao vivo permanecem somente em loopback, independentemente disso.

---

## Skills

**Mais de 100 skills vêm na caixa** — cada uma é uma pasta em [`skills/`](../../skills/) seguindo a convenção [`SKILL.md`][skill] do Claude Code, estendida com um frontmatter `od:` (`mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `fidelity`, `example_prompt`). Solte uma pasta, reinicie o daemon e ela aparece no seletor.

Dois **modes** ancoram o catálogo: `prototype` (artefatos de página única web/mobile/desktop) e `deck` (apresentações com swipe horizontal). Também há os modes `image`, `video`, `audio`, `template`, `design-system` e `utility`. O campo **`scenario`** os agrupa por público: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

| Skill | Mode | Scenario | O que produz |
|---|---|---|---|
| [`web-prototype`](../../design-templates/web-prototype/) | prototype | design | Landing page / hero padrão |
| [`saas-landing`](../../design-templates/saas-landing/) | prototype | marketing | Hero / features / preços / CTA |
| [`dashboard`](../../design-templates/dashboard/) | prototype | operation | Admin / analytics (com sidebar) |
| [`mobile-app`](../../design-templates/mobile-app/) | prototype | design | App enquadrado em iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](../../design-templates/mobile-onboarding/) | prototype | design | Splash · proposta de valor · fluxo de login |
| [`social-carousel`](../../design-templates/social-carousel/) | prototype | marketing | Carrossel de 3 cards 1080×1080 |
| [`email-marketing`](../../design-templates/email-marketing/) | prototype | marketing | E-mail de marca seguro com fallback de tabela |
| [`magazine-poster`](../../design-templates/magazine-poster/) | prototype | marketing | Layout de revista em página única |
| [`motion-frames`](../../design-templates/motion-frames/) | prototype | marketing | Hero de motion CSS em loop |
| [`sprite-animation`](../../design-templates/sprite-animation/) | prototype | marketing | Explainer animado em pixel art 8-bit |
| [`pm-spec`](../../design-templates/pm-spec/) | prototype | product | Doc de spec de PM (com sumário + log de decisões) |
| [`team-okrs`](../../design-templates/team-okrs/) | prototype | product | Scorecard de OKR |
| [`eng-runbook`](../../design-templates/eng-runbook/) | prototype | engineering | Runbook de incidentes |
| [`finance-report`](../../design-templates/finance-report/) | prototype | finance | Resumo financeiro executivo |
| [`hr-onboarding`](../../design-templates/hr-onboarding/) | prototype | hr | Plano de onboarding de cargo |
| [`guizang-ppt`](../../design-templates/guizang-ppt/) | deck | marketing | PPT web no estilo revista (padrão de deck) |
| [`html-ppt-*`](../../design-templates/) | deck | marketing | 15 templates de deck × 36 temas (template mestre em [`design-templates/html-ppt/`](../../design-templates/html-ppt/)) |
| [`hyperframes`](../../design-templates/hyperframes/) | video | marketing | Motion graphics HTML → MP4 (framework OSS da HeyGen) |
| [`critique`](../../design-templates/critique/) | utility | design | Scoresheet de autocrítica em cinco dimensões |
| [`tweaks`](../../design-templates/tweaks/) | utility | design | Manifesto de painel de tweaks emitido por IA |

Protocolo completo de skills → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Endpoint do registry de skills: `GET /api/skills`.

---

## Design Systems

**150 sistemas `DESIGN.md` de nível profissional de marca** vêm com o repositório — cada um é um único arquivo Markdown com um schema de 9 seções (cor, tipografia, espaçamento, layout, componentes, motion, voz, marca, anti-padrões), de [`VoltAgent/awesome-design-md`][acd2]. Troque um sistema → a próxima renderização usa os novos tokens. Sem theme JSON.

<details>
<summary><b>Catálogo completo (clique para expandir)</b></summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Developer Tools** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Productivity** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E-commerce** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Media** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Automotive** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Other** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**Starters** — `default` (Neutral Modern) · `warm-editorial`

</details>

Reimporte a biblioteca via [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). Adicione sua própria marca → solte um `DESIGN.md` em `design-systems/<brand>/`. Guia completo → [`design-systems/README.md`](../../design-systems/README.md).

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## Plugins

**261 plugins oficiais** ficam em [`plugins/_official/`](../../plugins/_official/). Cada plugin é uma **pasta portátil de agent-skill** — um `SKILL.md` (legível por qualquer agente que suporte Agent Skills), além de um manifesto opcional `open-design.json` que dá ao Open Design metadados de marketplace, inputs, prévias, pipelines e declarações de capacidades. Vá direto para uma categoria:

| Categoria | Quantidade | Conteúdo |
|---|---|---|
| [`scenarios/`](../../plugins/_official/scenarios/) | 11 | Cenários de design completos — [`od-default`](../../plugins/_official/scenarios/od-default/), [`od-design-refine`](../../plugins/_official/scenarios/od-design-refine/), [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/), [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/), [`od-react-export`](../../plugins/_official/scenarios/od-react-export/), [`od-nextjs-export`](../../plugins/_official/scenarios/od-nextjs-export/), [`od-vue-export`](../../plugins/_official/scenarios/od-vue-export/), [`od-media-generation`](../../plugins/_official/scenarios/od-media-generation/), [`od-new-generation`](../../plugins/_official/scenarios/od-new-generation/), [`od-tune-collab`](../../plugins/_official/scenarios/od-tune-collab/), [`od-plugin-authoring`](../../plugins/_official/scenarios/od-plugin-authoring/) |
| [`image-templates/`](../../plugins/_official/image-templates/) | 45 | Prompts de imagem one-shot — editorial, cinematográfico, produto, retrato |
| [`video-templates/`](../../plugins/_official/video-templates/) | 50 | Templates de motion HyperFrames / Seedance / Veo |
| [`design-systems/`](../../plugins/_official/design-systems/) | 142 | `DESIGN.md` de marca empacotados como plugins |
| [`atoms/`](../../plugins/_official/atoms/) | 13 | Fragmentos de UI reutilizáveis (botões, heroes, cards de KPI) |
| [`examples/`](../../plugins/_official/examples/) | 140 | Outputs de referência remixáveis |

Também [`plugins/community/`](../../plugins/community/) para plugins da comunidade e [`plugins/registry/`](../../plugins/registry/) para o fluxo de publicação.

### O que os plugins podem fazer

- 🤖 **Rodar em qualquer coding agent** — [Claude Code](../../docs/agent-adapters.md), Codex, Cursor, Copilot, [OpenClaw](https://github.com/openclaw/openclaw), [Antigravity](https://antigravity.google), Hermes, Kimi… pelo mesmo protocolo de skill que o agente já conhece.
- 🔁 **Migrar fluxos do Figma / Pencil** → código React, Next.js ou Vue. Veja [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/).
- 🛠️ **Renovar uma base de código existente para uma especificação de marca** — aponte um plugin para um repositório `git` + `DESIGN.md` e receba um PR. Veja [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/).
- 💾 **Persistir fluxos de trabalho personalizados** — os templates reutilizáveis do seu time ficam ao lado dos que já vêm na caixa.

### Usando plugins

Os plugins têm paridade total entre a **interface web** e a **CLI `od`** — os mesmos endpoints `/api/plugins`, escolha o que servir melhor.

**No app de desktop / web:** abra a página **Plugin** para explorar o marketplace e clique em **Install**; dentro do Studio de um projeto, os plugins aparecem como chips no composer que você clica para aplicar (com os inputs que eles declaram).

**Na linha de comando** (roda sem interface — esse é o caminho que os agentes externos usam):

```bash
od plugin list                       # list installed plugins (--task-kind / --mode / --tag filters)
od plugin search "landing page"      # search by keyword
od plugin info od-default            # inspect a plugin's metadata, inputs, capabilities
od plugin install od-figma-migration # install from a registry; also accepts ./local-folder or an https://… link
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default         # upgrade
od plugin uninstall od-default       # uninstall
```

Todo comando suporta `--json`, então você pode encadeá-lo com `jq` / `xargs` para dentro de automações.

### Construindo um plugin

Um plugin **precisa apenas de um `SKILL.md` no mínimo**; para listá-lo no marketplace do Open Design, adicione um `open-design.json`:

```
my-plugin/
├── SKILL.md            ← required: YAML frontmatter (name · description) + trigger phrasing + workflow (aim for < 500 lines)
├── open-design.json    ← needed to list: marketplace metadata + inputs + pipeline + capabilities
├── README.md           ← optional: usage, install, registry links
├── preview/            ← optional: index.html / poster.png (strongly recommended for visual plugins)
└── examples/           ← optional: concrete use cases
```

Campos principais do `open-design.json`: `specVersion` (atualmente `1.0.0`), `name` (ID estável), `version` (semver), `compat.agentSkills[].path` (aponta para `./SKILL.md`), `od.kind` (`skill` / `scenario` / `atom` / `bundle`), `od.taskKind` (`new-generation` / `figma-migration` / `code-migration` / `tune-collab`), `od.mode` (a superfície de saída, ex.: `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`), `od.capabilities[]` (**declare o mínimo** — uma instalação restrita concede apenas `prompt:inject` por padrão), `od.inputs[]` (parâmetros no momento de aplicar).

Faça o scaffold + valide localmente:

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # generate the skeleton
od plugin validate ./my-plugin                          # check manifest / file layout
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

Conjunto completo de campos e contrato de runtime → [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md); desenvolver um plugin com um coding agent → [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md); templates mínimos de copiar e colar → [`plugins/spec/examples/`](../../plugins/spec/examples/).

### Contribuindo com um plugin

1. Solte a pasta do plugin em [`plugins/community/`](../../plugins/community/) (plugins de terceiros), ou — para entregá-lo empacotado com o Open Design — no tier correspondente de [`plugins/_official/`](../../plugins/_official/).
2. Passe na validação: `od plugin validate`, `pnpm guard`, `pnpm --filter @open-design/plugin-runtime typecheck`.
3. Preencha o PR usando o template em [`plugins/spec/CONTRIBUTING.md`](../../plugins/spec/CONTRIBUTING.md) (ID, versão, lane, mode, capacidades, exemplos de trigger; anexe um screenshot / prévia para plugins visuais).
4. Para publicar em um registry externo (skills.sh / ClawHub / GitHub standalone) → [`plugins/spec/PUBLISHING-REGISTRIES.md`](../../plugins/spec/PUBLISHING-REGISTRIES.md).

Endpoint do registry de plugins: `GET /api/plugins`. Visão geral do diretório → [`plugins/README.md`](../../plugins/README.md) ([简体中文](../../plugins/README.zh-CN.md)).

---

## Arquitetura

```
┌────────────────── browser (Next.js 16) / Electron shell ──────────────┐
│  chat · file workspace · iframe preview · settings · import · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  local daemon (Express+SQLite)  │   ─→ any OpenAI-compatible BYOK,
   │                                  │       SSRF-guarded at the edge
   │  /api/skills    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  MCP stdio server                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · copilot · openclaw · antigravity ·│
   │  gemini · opencode · qwen · qoder · hermes (ACP) · kimi (ACP) ·    │
   │  pi (RPC) · kiro · kilo · vibe (ACP) · cline · trae · deepseek     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk             │
   └──────────────────────────────────────────────────────────────────┘
```

| Camada | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript |
| Daemon | Node 24 · Express · streaming SSE · `better-sqlite3` |
| Armazenamento | Arquivos em `.od/projects/<id>/` + SQLite em `.od/app.sqlite` + `media-config.json` (no gitignore, criado automaticamente). `OD_DATA_DIR` realoca tudo. |
| Preview | Iframe `srcdoc` em sandbox + parser de `<artifact>` em streaming |
| Exportação | HTML (embutido) · PDF (impressão do navegador) · PPTX (conduzido pelo agente) · ZIP · Markdown · MP4 (HyperFrames) |
| Desktop | Electron shell + renderer em sandbox + IPC sidecar (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN) |
| Ciclo de vida | Um único ponto de entrada: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) |

Arquitetura completa → [`docs/architecture.md`](../../docs/architecture.md). Protocolo de skills → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Contrato do adaptador de agentes → [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

---

## Roadmap

- [x] Daemon + 21 adaptadores de CLI de coding agents + registry de skills + catálogo de design systems
- [x] App web + chat + formulário de perguntas + seletor de 5 direções + progresso de tarefas + preview em sandbox
- [x] Mais de 100 skills · 150 design systems · 5 direções visuais · 5 frames de dispositivo
- [x] Projetos · conversas · mensagens · abas · templates com SQLite
- [x] Proxy BYOK multiprovedor (`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`) + proteção SSRF
- [x] Importação de ZIP do Claude Design (`/api/import/claude-design`)
- [x] Protocolo sidecar + desktop Electron + automação por IPC
- [x] API de lint de artefatos + gate de autocrítica em 5 dimensões antes da emissão
- [x] **0.8.0** — infraestrutura do marketplace de plugins (261 plugins oficiais, spec de manifesto, scripts de instalação por agente)
- [x] **0.9.0** — Open Design AMR (Model Router oficial embutido no app: zero configuração, login de um clique)
- [x] Builds Electron empacotados — macOS (Apple Silicon + Intel) + Windows (x64) + Linux AppImage (trilha opcional)
- [ ] Edições cirúrgicas em modo comentário — parcialmente entregue; patching direcionado e confiável em andamento
- [ ] UX do painel de tweaks emitido por IA — ainda não implementado
- [ ] `npx od init` para fazer scaffold de um projeto com `DESIGN.md`
- [ ] SDK de plugins + CLI `od plugin {add,list,remove,test,publish}`
- [ ] Plugins de migração Figma / Pencil → React / Next / Vue (alpha)
- [ ] Plugin de renovar base de código existente (apontar para um repositório git + `DESIGN.md`)

Entrega faseada → [`docs/roadmap.md`](../../docs/roadmap.md).

---

## Comunidade

Pessoas de verdade por trás de cada canal.

- 💬 **Discord** — chat diário, compartilhamento de plugins, perguntas → [**discord.gg/qhbcCH8Am4**](https://discord.gg/qhbcCH8Am4)
- 🐦 **X / Twitter** — notas de release, marcos, bastidores → [**@nexudotio**](https://x.com/nexudotio)
- 🗣️ **GitHub Discussions** — Q&A aprofundado, RFCs, "mostre seu trabalho" → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **GitHub Issues** — relatos de bugs, pedidos de features → [**Issues**](https://github.com/nexu-io/open-design/issues)

As labels [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) e [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) são a forma mais fácil de começar.

---

## Contribuindo

O Open Design continua avançando porque os contribuidores — designers, engenheiros, autores de prompts — continuam aparecendo. Muitas das skills, design systems e plugins mais usados foram escritos por pessoas fora do time central.

### 🎯 Por onde começar (máxima alavancagem, mínima mudança)

| Quer entregar… | Como | Onde |
|---|---|---|
| Uma nova **skill** | Solte uma pasta com `SKILL.md` + `assets/` + `references/` | [`skills/`](../../skills/) · spec em [`docs/skills-protocol.md`](../../docs/skills-protocol.md) |
| Um novo **design system** | Solte um `DESIGN.md` usando o schema de 9 seções | [`design-systems/<brand>/`](../../design-systems/) |
| Um novo **plugin** | Solte `open-design.json` + manifesto numa pasta de categoria | [`plugins/community/`](../../plugins/community/) · spec em [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md) · guia de dev por agente em [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md) |
| Suportar uma nova **CLI de coding agent** | Uma entrada de adaptador + parser de stream | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) |
| Corrigir um bug ou polir a UI | Explore a label [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) | [Issues →](https://github.com/nexu-io/open-design/issues) |
| Traduzir a documentação | Atualize os arquivos `README.<lang>.md` | [`TRANSLATIONS.md`](../../TRANSLATIONS.md) |

### 🤖 Contribuindo como agente

Se *você é o agente que está lendo isto*, o caminho mais rápido é:

```bash
# 1. Boot locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. Find a good-first-issue and assign yourself
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # create a branch and worktree

# 3. Make the change, run the checks
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. Open the PR
gh pr create --fill
```

Fluxo completo de contribuição amigável a agentes, estilo de código e barra de qualidade de PR → [English](../../CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja-JP.md) · [Português](CONTRIBUTING.pt-BR.md)).

### 🏅 Programa Open Design Fellow

Estamos recrutando **Open Design Fellows** ao redor do mundo — os Fellows moldam o produto ao lado do time central, representam oficialmente o Open Design em sua região e fazem a comunidade crescer localmente, com suporte financiado ($1,000 / MR), créditos gratuitos de LLM e uma trilha de revisão direta. Detalhes → [`MAINTAINERS.md`](../../MAINTAINERS.md) e o anúncio no [Discord](https://discord.gg/qhbcCH8Am4).

---

## Mantenedores

Eles carregam boa parte do peso — manutenção diária, revisão e suporte à comunidade.

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>Mantenedor</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>Mantenedor</sub>
    </td>
  </tr>
</table>

Regras dos mantenedores, critérios de promoção e o protocolo de saída → [`MAINTAINERS.md`](../../MAINTAINERS.md) (também [Deutsch](MAINTAINERS.de.md) · [Français](MAINTAINERS.fr.md) · [简体中文](MAINTAINERS.zh-CN.md) · [日本語](MAINTAINERS.ja-JP.md) · [Português](MAINTAINERS.pt-BR.md)).

## Contribuidores

Obrigado a todas as pessoas que participaram — código, docs, feedback, uma issue afiada, uma nova skill, um novo design system.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-05-30" alt="Open Design contributors" />
</a>

---

## Atividade do repositório

<picture>
  <img alt="Open Design — repository metrics" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

O SVG acima é regenerado diariamente por [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml) usando [`lowlighter/metrics`](https://github.com/lowlighter/metrics).

---

## Dê uma estrela

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Se isto te poupou trinta minutos, dê um ★. Estrelas não pagam o aluguel — mas dizem ao próximo designer, agente e contribuidor que este experimento vale a atenção deles. Um clique, três segundos, um sinal de verdade.

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-28" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
  </picture>
</a>

---

## Referências & linhagem

| Projeto | Papel |
|---|---|
| [Claude Design][cd] | O produto closed-source ao qual este repositório é a alternativa open-source. |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | A bússola da filosofia de design — fluxo de trabalho de designer júnior, protocolo de brand-asset, checklist anti-AI-slop, crítica em cinco dimensões. |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | A skill de PPT web no estilo revista, empacotada na íntegra em [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/). Padrão para o modo deck. |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | A família HTML PPT Studio — 15 templates de deck, 36 temas, 31 layouts de página, runtime de animação, modo apresentador com cards magnéticos. |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | A primeira alternativa open-source ao Claude Design; padrões de UX que tomamos emprestados (loop de artefato em streaming, iframe em sandbox, painel de agente ao vivo). |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | A arquitetura de daemon + adaptador — detecção de agentes por scan do PATH, daemon local como o único processo privilegiado. |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | Fonte do schema `DESIGN.md` de 9 seções e de 70 sistemas de produto. |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | Fonte das 57 design skills adicionadas em `design-systems/`. |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | O framework de motion graphics HTML→MP4, integrado como o `hyperframes-html` de primeira classe no Open Design. |
| [Claude Code skills][skill] | A convenção `SKILL.md` que adotamos na íntegra. |

Proveniência detalhada → [`docs/references.md`](../../docs/references.md).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Licença

Apache-2.0. O `design-templates/guizang-ppt/` empacotado mantém sua [LICENSE](../../design-templates/guizang-ppt/LICENSE) original (MIT, [@op7418](https://github.com/op7418)). O `design-templates/html-ppt/` empacotado mantém sua [LICENSE](../../design-templates/html-ppt/LICENSE) original (MIT, [@lewislulu](https://github.com/lewislulu)).
