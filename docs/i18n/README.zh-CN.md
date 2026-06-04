<h1 align="center">Open Design：The open-source Claude Design alternative</h1>

> 🔥 **Open Design 0.9.0 正式发布：创作，从此无需准备。** [官方 Model Router](https://open-design.ai/amr) 直接内置于应用，无需额外配置、不用安装 CLI，也不必准备 API Key。只需打开应用，登录账号，就能立刻开始设计与创作。[下载 0.9.0](https://github.com/nexu-io/open-design/releases) · [参与讨论](https://github.com/nexu-io/open-design/discussions/3524)
>
> 🏅 **Open Design Fellow 计划正式开放。** 如果你也相信设计应该是开放的，欢迎成为 Open Design Fellow，和核心团队一起打磨产品，让更多人参与并定义设计的未来。详情 → [`MAINTAINERS.md`](../../MAINTAINERS.md) 与 [Discord](https://discord.gg/qhbcCH8Am4)。

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="Open Design — The open-source Claude Design alternative · 150 Design Systems · 261 Plugins · 21 Coding Agents · 14 Media Providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/">官网</a> ·
  <a href="https://open-design.ai/">下载</a> ·
  <a href="https://discord.gg/qhbcCH8Am4">Discord</a> ·
  <a href="https://x.com/nexudotio">关注 @nexudotio</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="QUICKSTART.zh-CN.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <b>简体中文</b> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## 什么是 Open Design

🎨 **本地优先、开源的 [Claude Design][cd] 替代品。** &nbsp;🖥️ **macOS 与 Windows 原生桌面应用。** &nbsp;⚡ **100+ 技能** · ✨ **150 个品牌级 `DESIGN.md` 系统** · 📦 **261 个开箱即用的插件。** &nbsp;🖼️ 可生成 **Web · 桌面 · 移动端原型**、**实时仪表盘 / 工件**、**演示文稿**、**图片**、**视频**，以及 **HyperFrames** 动态图形。🔒 沙箱 iframe 预览 · HTML / PDF / PPTX / MP4 导出。&nbsp;🤖 **运行于 Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Hermes · Kimi · Antigravity 等 21 个本地 CLI**，或通过 BYOK 接入任何 OpenAI 兼容端点。

Open Design 是这样一种产物：Anthropic 随 Claude Design 推出的 **Agent 原生**循环——发现需求、锁定方向、流式输出工件、评审、交付——不再封闭，而是变成了一个由**技能、设计系统和插件组成的文件系统**，你笔记本电脑上已有的编码 Agent 就能读取、编写和混搭。你的 CLI 变成设计引擎，你的笔记本变成工作坊，团队的 `DESIGN.md` 变成品牌契约。

它也是 **Agent 时代的 Figma 替代品**——不再在画布上推像素，而是用真实 CSS、真实字体、真实组件交付单页工件，直接导出 HTML / PDF / PPTX / MP4——已经由你的设计系统塑形，已经可以在你日常使用的 Agent 中运行。

[cd]: https://x.com/claudeai/status/2045156267690213649

---

## 产品速览

快速看懂 Open Design 长什么样、能做什么。从 **Home** 发起创作，用 **Automation** 编排重复流程，在 **Design System** 沉淀品牌契约，靠 **Plugin** 与 **集成** 扩展能力；进入任一项目的 **Studio**，同一套设计系统即可流式产出原型、实时工件、HyperFrame、演示文稿与图片。

### 核心页面

<table>
<tr>
<td valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/home.png" alt="Home 页" /><br/>
<sub><b>Home</b>——总览入口。选择技能与设计系统，输入需求，一处发起所有创作。</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/automation.png" alt="Automation 页" /><br/>
<sub><b>Automation</b>——把重复的设计流程编排成可复用、可定时的自动化任务。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/design-system.png" alt="Design System 页" /><br/>
<sub><b>Design System</b>——把团队的 <code>DESIGN.md</code> 沉淀为品牌契约，所有产物据此塑形。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/plugin.png" alt="Plugin 页" /><br/>
<sub><b>Plugin</b>——浏览、安装并分发工作流插件，按需扩展生成能力。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/integrations.png" alt="Integrations 页" /><br/>
<sub><b>集成</b>——接入外部系统与 MCP 工具，把 Open Design 用到任意 IDE、脚本与自动化中。</sub>
</td>
</tr>
</table>

### Studio——一个项目里的多种产物

进入某个项目的 Studio，同一套设计系统可流式产出多种类型的工件：

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-prototype.png" alt="原型" /><br/>
<sub><b>原型</b>——读取你的设计系统、在沙箱 iframe 中渲染的单页 HTML 工件，可即时预览、下载源码。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-hyperframe.png" alt="HyperFrame" /><br/>
<sub><b>HyperFrame</b>——程序化动效与动态图形，渲染为真实 MP4（如 1920×1080 · 30fps）。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-ppt.png" alt="演示文稿" /><br/>
<sub><b>演示文稿</b>——可逐页预览、键盘翻页、导出 PPTX / PDF 的 pitch deck。</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-image.png" alt="图片" /><br/>
<sub><b>图片</b>——品牌级图片与视觉素材，支持高分辨率生成与下载。</sub>
</td>
</tr>
</table>

---

## 平台兼容性

> Open Design 以 **技能、CLI 和 MCP 服务器**的形式交付，主流编码 Agent 可原生消费。装好 OD 后，一行 `od mcp install <agent>` 把 MCP 服务器 wire 进对应 Agent 的配置，任何 Agent 内调用相同工具。

| 编码 Agent / 平台 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | 状态 &nbsp;&nbsp; | 一行命令安装 MCP 服务器 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ 支持 | `od mcp install claude` |
| [Codex CLI](https://github.com/openai/codex) | ✅ 支持 | `od mcp install codex` |
| [Cursor](https://www.cursor.com/cli) | ✅ 支持 | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ 支持 | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ 支持 | `od mcp install copilot` |
| Gemini CLI | ✅ 支持 | `od mcp install gemini` |
| [OpenCode](https://opencode.ai/) | ✅ 支持 | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ 支持 | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ 支持 | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ 支持 | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ 支持 | `od mcp install trae` |
| Kimi CLI | ✅ 支持 | `od mcp install kimi` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ 支持 | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ 支持 | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ 支持 | `od mcp install hermes` |

`od mcp install <agent> --print` 干跑预览 · `--uninstall` 卸载 · 完整清单 `od mcp install --help`。

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="Open Design 支持的 21 个编码 Agent CLI — Claude Code · Codex · OpenCode · Hermes · Antigravity · Gemini · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Devin · Trae" width="100%" />
</p>

**未安装任何 CLI？** `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` 的 BYOK 代理提供同样的循环（无需 spawn 进程）——粘贴 `baseUrl` + `apiKey` + `model`，支持 OpenAI、Anthropic、Azure OpenAI、Google Gemini、Ollama、LM Studio、vLLM 或任何 OpenAI 兼容端点。每个目标的 SSRF 防护在守护进程边缘拦截内网 IP / link-local / CGNAT。

适配器契约和流解析器位于 [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts)。添加新 CLI 只需一条记录——参见 [`docs/agent-adapters.md`](../../docs/agent-adapters.md)。

---

## 演示

四大核心产品类别，全部由笔记本电脑上运行的编码 Agent 渲染。点击缩略图查看实际示例。

### 1 · 原型——Web · 桌面 · 移动端

默认输出面。读取你的 `DESIGN.md` 并在沙箱 iframe 中渲染的单页 HTML 工件。

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/01-entry-view.png" alt="入口视图" /><br/>
<sub><b>入口视图</b>——选择技能、选择设计系统、输入需求。一个界面承载原型、仪表盘、演示文稿、移动应用、杂志页面。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/mobile-onboarding.png" alt="移动端 Onboarding" /><br/>
<sub><b>移动端原型</b>——像素级精确的 iPhone 15 Pro 外框、多屏流程。Agent 不会重绘手机外框；共享设备边框位于 <code>assets/frames/</code>。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/dating-web.png" alt="Web 原型 dating-web" /><br/>
<sub><b>Web 原型</b>——带滚动条、KPI、图表的编辑类仪表盘。直接从 <code>design-templates/dating-web/</code> 渲染。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/gamified-app.png" alt="游戏化应用" /><br/>
<sub><b>移动端应用原型</b>——三屏游戏化流程，含 XP 绶带和任务详情。可直接交付给 Cursor / Codex / Claude Code 转为 React/Next/Vue。</sub>
</td>
</tr>
</table>

### 2 · 实时工件与仪表盘

实时仪表盘、决策室、KPI 大屏——单页工件通过调参面板拉取数据，原地可编辑。

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/live-dashboard.png" alt="实时仪表盘" /><br/>
<sub><b>实时仪表盘</b>——可编辑的 KPI 大屏，调参面板暴露值得调整的参数。Agent 输出一份 manifest，iframe 无需刷新即可重新渲染。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/research-decision-room.png" alt="决策室" /><br/>
<sub><b>决策室</b>——面向产品 / 研究 / 运营会议的多源简报工件。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/github-dashboard.png" alt="GitHub 仪表盘" /><br/>
<sub><b>GitHub 风格仪表盘</b>——以实时工件形式展示仓库指标。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/flowai-live-dashboard-template.png" alt="Flow 实时仪表盘" /><br/>
<sub><b>Flow 实时仪表盘模板</b>——领域专属 KPI 模板，通过当前激活的 <code>DESIGN.md</code> 品牌化。</sub>
</td>
</tr>
</table>

### 3 · 演示文稿——杂志 Deck、周报、路演

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/07-magazine-deck.png" alt="杂志 Deck (guizang-ppt)" /><br/>
<sub><b>Deck 模式 (guizang-ppt)</b>——杂志版式、WebGL 主视觉、P0/P1/P2 清单。从 <a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a> 完整打包，保留原始许可证。</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/deck-swiss-international.png" alt="瑞士 Deck" /><br/>
<sub><b>瑞士国际风格 Deck</b>——网格锚定、单色强调。<b>15 套 Deck 模板</b>和 <b>36 个主题</b>之一，位于 <code>design-templates/html-ppt-*/</code>。</sub>
</td>
</tr>
</table>

每套 Deck 均可导出为 **HTML**（单文件，内联资源）、**PDF**（浏览器打印，Deck 感知）、**PPTX**（Agent 驱动的技能）、**ZIP**（归档）或 **Markdown**。

### 4 · 图片——`gpt-image-2`、ImageRouter、自定义 API

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="城市美食地图插画" /><br/><sub><b>城市美食地图插画</b><br/>手绘编辑风格旅行海报</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="电影级电梯场景" /><br/><sub><b>电影级电梯场景</b><br/>单帧编辑级静态画面</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="赛博朋克动漫肖像" /><br/><sub><b>赛博朋克肖像</b><br/>个人头像——霓虹面部文字</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D 石质阶梯演变" /><br/><sub><b>3D 石质阶梯</b><br/>石刻信息图</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="魅力人像" /><br/><sub><b>魅力人像</b><br/>编辑级棚拍</sub></td>
</tr>
</table>

**93 个可复刻提示词**位于 [`prompt-templates/`](../../prompt-templates/)——预览缩略图、完整提示词、目标模型、宽高比和来源归属。一键将需求放入编辑器。

### 5 · 视频与 HyperFrames——Agent 原生动态图形

**[HyperFrames][hyperframes]** 是 HeyGen 的开源 Agent 原生视频框架，在 Open Design 中作为一等公民集成。Agent 编写 HTML + CSS + GSAP，HyperFrames 通过 headless Chrome + FFmpeg 渲染为确定性 MP4。搭配 **Seedance 2.0** 实现影视级 t2v / i2v，**Veo 3 / Sora 2 / Kling 2** 提供路由模型变体，**Suno v5 / Lyria 2** 提供音频底座。

<table>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS 宣传片" /></a><br/><sub><b>30 秒 SaaS 产品宣传片</b> · 16:9 · UI 3D 展示</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok 卡拉OK" /></a><br/><sub><b>TikTok 卡拉OK 真人出镜</b> · 9:16 · TTS + 逐字字幕</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="品牌精彩集锦" /></a><br/><sub><b>30 秒品牌精彩集锦</b> · 16:9 · 音频驱动动态字体</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="柱状图竞赛" /></a><br/><sub><b>柱状图竞赛</b> · 16:9 · NYT 风格数据信息图</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="航线图" /></a><br/><sub><b>航线图</b> · 16:9 · Apple 风格路线展示</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo 片尾" /></a><br/><sub><b>4 秒电影级 Logo 片尾</b> · 16:9 · 逐块拼合 + 光晕</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="金额计数器" /></a><br/><sub><b>$0 → $10K 金额计数器</b> · 9:16 · Apple 风格高燃</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="网站转视频" /></a><br/><sub><b>网站转视频</b> · 16:9 · 三视口截取网站</sub></td>
</tr>
</table>

11 个 HyperFrames 模板 + 39 个 Seedance 提示词随仓库一起发布。目录缩略图 © HeyGen，框架 Apache-2.0。OD 专属渲染流程（合成缓存、sandbox-exec 变通方案、MP4-as-chip）详见 [`design-templates/hyperframes/`](../../design-templates/hyperframes/)。

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## 为什么选择 Open Design

> **2026 年 4 月，Anthropic 发布了 [Claude Design][cd]——LLM 第一次不再写文章，而是直接交付设计工件。** 它迅速传播。然而它始终闭源、仅付费、仅云端，锁定 Anthropic 的模型、Anthropic 的技能、Anthropic 的表面。没有 Checkout，没有自托管，没有 Vercel 部署，不能换成你自己的 Agent。

Open Design (OD) 是开源替代品。同样的循环，同样的工件优先心智模型，没有任何锁定：

- 🤖 **Agent 原生，不绑定模型。** 我们不发布 Agent。你 `PATH` 上已有的 `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi` 就是设计引擎。一键切换。
- 🧠 **默认品牌级。** 每次渲染都读取激活的 `DESIGN.md`——9 节 schema 涵盖色板、字体、间距、动效、语言风格、反模式。150 个系统随仓库发布（Linear、Stripe、Vercel、Airbnb、Apple、Tesla、Notion、Anthropic、Cursor、Supabase、Figma……）。放入文件夹，选择器自动识别。
- 🖥️ **本地优先，每一层都可 BYOK。** macOS（Apple Silicon + Intel）和 Windows（x64）原生桌面应用。Linux AppImage 在可选发布通道。SQLite 存储在 `.od/app.sqlite`，文件在 `.od/projects/<id>/`，无遥测，无云端往返。
- 🌍 **三个平面上可组合。** **插件**承载可运行的工作流 · **技能**承载 Agent 的设计品味 · **设计系统**承载品牌。三者都是普通文件，任何人都可以编写、版本控制和发布。
- 🔁 **刷新现有代码库。** 将 `git` 仓库 + `DESIGN.md` 交给 Agent，它就能将你的真实组件重构到品牌规范。专门的插件用于将 Figma / Pencil 工作流迁移到 React / Next.js / Vue 代码。
- 🔒 **隐私信条。** 一切都运行在持有你数据的环境中——你的笔记本、你团队的服务器、你的 Vercel 项目。需要网络时有 SSRF 防护的 BYOK 代理。

### 对比

| | [Claude Design][cd] | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| 开源 | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| 自托管 / 桌面 | ❌ | ❌ | ❌ | **✅ macOS + Windows + Vercel** |
| Agent 原生（在 CLI 中运行） | 仅 Anthropic | ❌ | 仅云端 Agent | **✅ 21 CLI + BYOK** |
| 品牌级 `DESIGN.md` | 私有 | Theme JSON | 有限 token | **✅ 150 系统随附** |
| 技能 / 插件 / 模板 | 封闭 | 插件商店 | 封闭 | **✅ 100+ 技能 · 261 插件** |
| HyperFrames (HTML→MP4) | ❌ | ❌ | ❌ | **✅ 一等公民** |
| 将现有仓库刷新到品牌 | ❌ | ❌ | ❌ | **✅ 通过 Agent + `DESIGN.md`** |
| 最低费用 | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · 任意兼容端点** |

---

## 快速开始

### 🖥️ 下载桌面应用（推荐——零配置）

使用 Open Design 最快的方式。无需 Node、pnpm 或克隆仓库。

- **macOS**（Apple Silicon · Intel x64）→ [**open-design.ai**](https://open-design.ai/) 或 [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows**（x64）→ [**open-design.ai**](https://open-design.ai/) 或 [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux**（AppImage，可选通道）→ [GitHub Releases](https://github.com/nexu-io/open-design/releases)

安装后：应用自动检测 `PATH` 上的所有编码 Agent CLI，加载 100+ 技能和 150 个设计系统，打开后即可在入口视图中输入需求。

### 🤖 安装到你的编码 Agent（无 UI）

你可以在完全不打开 GUI 的情况下使用 Open Design——在 Claude Code、Codex、Cursor、Copilot、OpenClaw、Antigravity、Hermes、Kimi 等中作为技能、插件或 MCP 服务器调用。

```bash
# 一行命令安装到你正在使用的 Agent：
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
# <agent> = claude | codex | cursor | copilot | openclaw | antigravity | gemini
#         | pi | vibe | hermes | cline | kimi | trae | opencode
```

然后在 Agent 内：

```
> Use open-design to generate a landing page with the Linear design system
```

Agent 读取 `skills/`，选择正确的 `SKILL.md`，绑定你指定的 `DESIGN.md`，输出一个可在 `http://localhost:7456` 预览的 `<artifact>`。

### 🐳 使用 Docker 运行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# 打开 http://localhost:7456
```

### 🧑‍💻 从源码运行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Node `~24`，pnpm `10.33.x`。Windows 用户请参见 [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)。完整的快速开始指南、环境变量、Nix flake 和打包构建流程 → [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md)。

### 一个完整的工作流——从需求到工件

`需求 → 插件 → 方向 → 设计系统 → 工件 → 交付 → 记忆`

1. **PM 提交需求。** 插件选择器提供落地页 · 路演 Deck · 仪表盘 · 社交媒体帖 · PM 规范 · OKR 记分卡……
2. **设计师（或 Agent）锁定方向。** 没有品牌？从 5 个精选方向中选择。有品牌？放入截图 / URL → Agent 连接 GitHub、导入 Figma、编纂可复用的 `DESIGN.md`。
3. **Agent 输出首个 `<artifact>`。** 插件 + 技能 + `DESIGN.md` 已绑定。流式传输到沙箱 iframe 中，原地可编辑，不是"从头重新生成"。
4. **交付给工程团队。** 工件是真实的 HTML/CSS——放入 Cursor、Codex 或 Claude Code 中继续作为代码开发。或直接导出 PPTX / PDF / MP4 交给营销团队。
5. **Open Design 越用越聪明。** 你的截图、字体、色板和已确认的工件会累积为下次会话的默认值。更少的重复劳动，更少的偏差。

---

## 从你的编码 Agent 使用 Open Design

Open Design 提供 **stdio MCP 服务器**和逐 Agent 的**安装脚本**。任何位于其他仓库的 MCP 兼容 Agent 都可以直接读取你本地 Open Design 项目的文件——token CSS、JSX 组件、入口 HTML——作为按名称查询的结构化 API。Agent 始终看到实时文件，而非过期的导出。

```bash
# 一行命令安装（支持 16+ CLI）：
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>

# 然后，Agent 可以：
od search-files "primary button"      # 跨项目文件搜索
od get-file design-systems/linear-app/DESIGN.md
od get-artifact <slug>                # 最新渲染的工件
od plugin run web-prototype --brief "..."
od skill list --scenario marketing
```

**为什么选择 MCP？** 每次迭代都导出并重新附加 zip 会打断流程。MCP 直接暴露设计源文件——Agent 始终看到实时文件。

**对于从零开始的 Agent**，安装器会放置 `~/.config/<agent>/open-design.json`（或平台等效路径）以及可复制粘贴的 MCP 代码片段。Cursor 获得一键深层链接；Claude Code 获得 `claude mcp add-json` 一行命令；其他所有 Agent 获得其配置所需 schema 格式的 JSON。完整的逐 Agent 流程 → 桌面应用中的**设置 → MCP 服务器**，或 [`docs/agent-adapters.md`](../../docs/agent-adapters.md)。

**安全模型。** 默认只读，守护进程绑定到 `127.0.0.1`，SSRF 在代理边缘拦截。局域网暴露需要 `OD_BIND_HOST` 显式启用加 `OD_ALLOWED_ORIGINS`。连接器凭证和实时工件预览路由无论如何都保持仅本地回环。

---

## 技能

**100+ 个技能开箱即用**——每个技能是 [`skills/`](../../skills/) 下的一个文件夹，遵循 Claude Code [`SKILL.md`][skill] 约定，并扩展了 `od:` frontmatter（`mode`、`platform`、`scenario`、`preview.type`、`design_system.requires`、`default_for`、`fidelity`、`example_prompt`）。放入文件夹，重启守护进程，它就出现在选择器中。

两种**模式**构成目录主线：`prototype`（Web/移动端/桌面单页工件）和 `deck`（横向滑动演示文稿）。另有 `image`、`video`、`audio`、`template`、`design-system` 和 `utility` 模式。**`scenario`** 字段按受众分组：`design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`。

| 技能 | 模式 | 场景 | 产出物 |
|---|---|---|---|
| [`web-prototype`](../../design-templates/web-prototype/) | prototype | design | 默认落地页 / 主视觉 |
| [`saas-landing`](../../design-templates/saas-landing/) | prototype | marketing | 主视觉 / 功能 / 定价 / CTA |
| [`dashboard`](../../design-templates/dashboard/) | prototype | operation | 管理后台 / 数据分析（带侧边栏） |
| [`mobile-app`](../../design-templates/mobile-app/) | prototype | design | iPhone 15 Pro / Pixel 外框应用 |
| [`mobile-onboarding`](../../design-templates/mobile-onboarding/) | prototype | design | 启动页 · 价值主张 · 登录流程 |
| [`social-carousel`](../../design-templates/social-carousel/) | prototype | marketing | 3 卡 1080×1080 轮播图 |
| [`email-marketing`](../../design-templates/email-marketing/) | prototype | marketing | 表格降级安全的品牌邮件 |
| [`magazine-poster`](../../design-templates/magazine-poster/) | prototype | marketing | 单页杂志版面 |
| [`motion-frames`](../../design-templates/motion-frames/) | prototype | marketing | 循环 CSS 动效主视觉 |
| [`sprite-animation`](../../design-templates/sprite-animation/) | prototype | marketing | 8-bit 像素动画讲解 |
| [`pm-spec`](../../design-templates/pm-spec/) | prototype | product | PM 规范文档（含目录 + 决策日志） |
| [`team-okrs`](../../design-templates/team-okrs/) | prototype | product | OKR 记分表 |
| [`eng-runbook`](../../design-templates/eng-runbook/) | prototype | engineering | 事故应急手册 |
| [`finance-report`](../../design-templates/finance-report/) | prototype | finance | 高管财务摘要 |
| [`hr-onboarding`](../../design-templates/hr-onboarding/) | prototype | hr | 角色入职计划 |
| [`guizang-ppt`](../../design-templates/guizang-ppt/) | deck | marketing | 杂志风格 Web PPT（deck 默认） |
| [`html-ppt-*`](../../design-templates/) | deck | marketing | 15 套 Deck 模板 × 36 个主题（主模板在 [`design-templates/html-ppt/`](../../design-templates/html-ppt/)） |
| [`hyperframes`](../../design-templates/hyperframes/) | video | marketing | HTML → MP4 动态图形（HeyGen OSS 框架） |
| [`critique`](../../design-templates/critique/) | utility | design | 五维自评记分表 |
| [`tweaks`](../../design-templates/tweaks/) | utility | design | AI 输出的调参面板 manifest |

完整技能协议 → [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。技能注册端点：`GET /api/skills`。

---

## 设计系统

**150 个品牌级 `DESIGN.md` 系统**随仓库发布——每个系统是一个 Markdown 文件，包含 9 节 schema（颜色、字体、间距、布局、组件、动效、语言风格、品牌、反模式），来自 [`VoltAgent/awesome-design-md`][acd2]。切换系统 → 下次渲染即使用新 token。无需 Theme JSON。

<details>
<summary><b>完整目录（点击展开）</b></summary>

**AI 与 LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**开发者工具** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**生产力** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**金融科技** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**电商** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**媒体** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**汽车** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**其他** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**入门模板** — `default`（中性现代）· `warm-editorial`

</details>

通过 [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts) 重新导入库。添加自有品牌 → 将 `DESIGN.md` 放入 `design-systems/<brand>/`。完整指南 → [`design-systems/README.md`](../../design-systems/README.md)。

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## 插件

**261 个官方插件**位于 [`plugins/_official/`](../../plugins/_official/)。每个插件就是一个**可移植的 agent skill 文件夹**——一个 `SKILL.md`（任何支持 Agent Skills 的 Agent 都能读），外加一个可选的 `open-design.json` manifest（给 Open Design 提供 marketplace 元数据、输入参数、预览、流水线与权限声明）。直接跳转到分类浏览：

| 分类 | 数量 | 内容 |
|---|---|---|
| [`scenarios/`](../../plugins/_official/scenarios/) | 11 | 完整设计方案——[`od-default`](../../plugins/_official/scenarios/od-default/)、[`od-design-refine`](../../plugins/_official/scenarios/od-design-refine/)、[`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/)、[`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/)、[`od-react-export`](../../plugins/_official/scenarios/od-react-export/)、[`od-nextjs-export`](../../plugins/_official/scenarios/od-nextjs-export/)、[`od-vue-export`](../../plugins/_official/scenarios/od-vue-export/)、[`od-media-generation`](../../plugins/_official/scenarios/od-media-generation/)、[`od-new-generation`](../../plugins/_official/scenarios/od-new-generation/)、[`od-tune-collab`](../../plugins/_official/scenarios/od-tune-collab/)、[`od-plugin-authoring`](../../plugins/_official/scenarios/od-plugin-authoring/) |
| [`image-templates/`](../../plugins/_official/image-templates/) | 45 | 一次性图片提示词——编辑、电影、产品、人像 |
| [`video-templates/`](../../plugins/_official/video-templates/) | 50 | HyperFrames / Seedance / Veo 动态模板 |
| [`design-systems/`](../../plugins/_official/design-systems/) | 142 | 品牌 `DESIGN.md` 包装为插件 |
| [`atoms/`](../../plugins/_official/atoms/) | 13 | 可复用 UI 片段（按钮、主视觉、KPI 卡片） |
| [`examples/`](../../plugins/_official/examples/) | 140 | 可混搭的参考输出 |

另有 [`plugins/community/`](../../plugins/community/) 社区插件和 [`plugins/registry/`](../../plugins/registry/) 注册发布流程。

### 插件能做什么

- 🤖 **在任何编码 Agent 中运行**——[Claude Code](../../docs/agent-adapters.md)、Codex、Cursor、Copilot、[OpenClaw](https://github.com/openclaw/openclaw)、[Antigravity](https://antigravity.google)、Hermes、Kimi……通过 Agent 已知的同一套技能协议。
- 🔁 **迁移 Figma / Pencil 工作流** → React、Next.js 或 Vue 源码。参见 [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/)。
- 🛠️ **将现有代码库刷新到品牌规范**——将插件指向 `git` 仓库 + `DESIGN.md`，获得一个 PR。参见 [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/)。
- 💾 **持久化自定义工作流**——你团队的可复用模板与发布的模板并列。

### 使用插件

插件在 **Web UI** 和 **`od` CLI** 两条路上完全对等——同一套 `/api/plugins` 端点，挑顺手的用。

**在桌面 / Web 应用里**：打开 **Plugin** 页浏览 marketplace，点 **Install**；进入项目 Studio 后，插件以 composer chip 的形式出现，点击即应用（带上它声明的输入参数）。

**在命令行里**（不打开 UI 也能跑，外部 Agent 走的就是这条）：

```bash
od plugin list                       # 列出已安装插件（--task-kind / --mode / --tag 过滤）
od plugin search "landing page"      # 按关键词搜
od plugin info od-default            # 看某个插件的元数据、输入、权限
od plugin install od-figma-migration # 从注册中心装；也支持 ./本地文件夹 或 https://… 直链
od plugin apply od-default --input brief="给我们的种子轮做一页 pitch"
od plugin upgrade od-default         # 升级
od plugin uninstall od-default       # 卸载
```

所有命令都支持 `--json`，方便用 `jq` / `xargs` 串进自动化脚本。

### 构建插件

一个插件**最小只需要一个 `SKILL.md`**；要上架 Open Design marketplace，再加一个 `open-design.json`：

```
my-plugin/
├── SKILL.md            ← 必需：YAML frontmatter（name·description）+ 触发语 + 工作流（建议 < 500 行）
├── open-design.json    ← 上架所需：marketplace 元数据 + 输入 + 流水线 + 权限
├── README.md           ← 可选：用法、安装、注册中心链接
├── preview/            ← 可选：index.html / poster.png（视觉类强烈建议）
└── examples/           ← 可选：具体用例
```

`open-design.json` 的核心字段：`specVersion`（当前 `1.0.0`）、`name`（稳定 ID）、`version`（semver）、`compat.agentSkills[].path`（指向 `./SKILL.md`）、`od.kind`（`skill` / `scenario` / `atom` / `bundle`）、`od.taskKind`（`new-generation` / `figma-migration` / `code-migration` / `tune-collab`）、`od.mode`（输出表面，如 `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`）、`od.capabilities[]`（**按最小权限声明**，默认受限安装只给 `prompt:inject`）、`od.inputs[]`（应用时的参数）。

脚手架 + 本地验证：

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # 生成骨架
od plugin validate ./my-plugin                          # 校验 manifest / 文件布局
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

字段全集与运行时契约 → [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md)；用编码 Agent 自动开发插件 → [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md)；可复制的最小模板 → [`plugins/spec/examples/`](../../plugins/spec/examples/)。

### 贡献插件

1. 把插件文件夹放到 [`plugins/community/`](../../plugins/community/)（第三方插件），或——若想随 Open Design 一起内置——放到对应 tier 的 [`plugins/_official/`](../../plugins/_official/)。
2. 跑通校验：`od plugin validate`、`pnpm guard`、`pnpm --filter @open-design/plugin-runtime typecheck`。
3. 按 [`plugins/spec/CONTRIBUTING.md`](../../plugins/spec/CONTRIBUTING.md) 的模板填 PR（ID、版本、lane、mode、权限、触发示例，视觉类附截图 / 预览）。
4. 想发布到外部注册中心（skills.sh / ClawHub / 独立 GitHub）→ [`plugins/spec/PUBLISHING-REGISTRIES.md`](../../plugins/spec/PUBLISHING-REGISTRIES.md)。

插件注册端点：`GET /api/plugins`。目录概览 → [`plugins/README.md`](../../plugins/README.md)（[简体中文](../../plugins/README.zh-CN.md)）。

---

## 架构

```
┌────────────────────── 浏览器 (Next.js 16) / Electron 外壳 ──────────────┐
│  聊天 · 文件工作区 · iframe 预览 · 设置 · 导入 · MCP                      │
└──────────────┬─────────────────────────────────────┬─────────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  本地守护进程 (Express+SQLite)    │   ─→ 任何 OpenAI 兼容 BYOK,
   │                                  │       SSRF 防护在边缘
   │  /api/skills    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  MCP stdio 服务器                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · copilot · openclaw · antigravity ·  │
   │  gemini · opencode · qwen · qoder · hermes (ACP) · kimi (ACP) ·      │
   │  pi (RPC) · kiro · kilo · vibe (ACP) · cline · trae · deepseek       │
   │  读取 SKILL.md + DESIGN.md，将工件写入磁盘                              │
   └──────────────────────────────────────────────────────────────────────┘
```

| 层 | 技术栈 |
|---|---|
| 前端 | Next.js 16 App Router + React 18 + TypeScript |
| 守护进程 | Node 24 · Express · SSE 流式传输 · `better-sqlite3` |
| 存储 | 文件在 `.od/projects/<id>/` + SQLite 在 `.od/app.sqlite` + `media-config.json`（gitignored，自动创建）。`OD_DATA_DIR` 可重定位全部。 |
| 预览 | 沙箱 `srcdoc` iframe + 流式 `<artifact>` 解析器 |
| 导出 | HTML（内联）· PDF（浏览器打印）· PPTX（Agent 驱动）· ZIP · Markdown · MP4（HyperFrames） |
| 桌面 | Electron 外壳 + 沙箱渲染进程 + sidecar IPC（STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN） |
| 生命周期 | 统一入口：`pnpm tools-dev`（start / stop / run / status / logs / inspect / check） |

完整架构说明 → [`docs/architecture.md`](../../docs/architecture.md)。技能协议 → [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。Agent 适配器契约 → [`docs/agent-adapters.md`](../../docs/agent-adapters.md)。

---

## 路线图

- [x] 守护进程 + 21 个编码 Agent CLI 适配器 + 技能注册中心 + 设计系统目录
- [x] Web 应用 + 聊天 + 问题表单 + 5 方向选择器 + 待办进度 + 沙箱预览
- [x] 100+ 技能 · 150 设计系统 · 5 视觉方向 · 5 设备外框
- [x] SQLite 支撑的项目 · 会话 · 消息 · 标签页 · 模板
- [x] 多供应商 BYOK 代理（`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`）+ SSRF 防护
- [x] Claude Design ZIP 导入（`/api/import/claude-design`）
- [x] Sidecar 协议 + Electron 桌面 + IPC 自动化
- [x] 工件 Lint API + 五维自评预输出门控
- [x] **0.8.0**——插件市场基础设施（261 个官方插件、manifest 规范、逐 Agent 安装脚本）
- [x] 打包 Electron 构建——macOS（Apple Silicon + Intel）+ Windows（x64）+ Linux AppImage（可选通道）
- [ ] 评论模式精确编辑——部分已发布，可靠的定向补丁进行中
- [ ] AI 输出的调参面板 UX——尚未实现
- [ ] `npx od init` 脚手架创建带 `DESIGN.md` 的项目
- [ ] 插件 SDK + `od plugin {add,list,remove,test,publish}` CLI
- [ ] Figma / Pencil → React / Next / Vue 迁移插件（alpha）
- [ ] 刷新现有代码库插件（指向 git 仓库 + `DESIGN.md`）

分阶段交付 → [`docs/roadmap.md`](../../docs/roadmap.md)。

---

## 社区

每个渠道背后都是真实的人。

- 💬 **Discord**——日常聊天、插件分享、提问 → [**discord.gg/qhbcCH8Am4**](https://discord.gg/qhbcCH8Am4)
- 🐦 **X / Twitter**——发版说明、里程碑、幕后 → [**@nexudotio**](https://x.com/nexudotio)
- 🗣️ **GitHub Discussions**——深度问答、RFC、"展示你的作品" → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **GitHub Issues**——Bug 报告、功能请求 → [**Issues**](https://github.com/nexu-io/open-design/issues)

[`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 和 [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) 标签是最简单的入门方式。

---

## 贡献

Open Design 之所以持续前进，是因为贡献者——设计师、工程师、提示词作者——不断出现。许多最常用的技能、设计系统和插件都由核心团队以外的人编写。

### 🎯 从哪里开始（最大杠杆，最小改动）

| 想要交付…… | 怎么做 | 在哪里 |
|---|---|---|
| 一个新的**技能** | 放入包含 `SKILL.md` + `assets/` + `references/` 的文件夹 | [`skills/`](../../skills/) · 规范在 [`docs/skills-protocol.md`](../../docs/skills-protocol.md) |
| 一个新的**设计系统** | 使用 9 节 schema 放入 `DESIGN.md` | [`design-systems/<brand>/`](../../design-systems/) |
| 一个新的**插件** | 在分类文件夹下放入 `plugin.json` + manifest | [`plugins/community/`](../../plugins/community/) · 规范在 [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md) · Agent 开发指南在 [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md) |
| 支持新的**编码 Agent CLI** | 一条适配器记录 + 流解析器 | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) |
| 修复 Bug 或打磨 UI | 浏览 [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 标签 | [Issues →](https://github.com/nexu-io/open-design/issues) |
| 翻译文档 | 更新 `README.<lang>.md` 文件 | [`TRANSLATIONS.md`](../../TRANSLATIONS.md) |

### 🤖 作为 Agent 贡献

如果*你就是正在阅读这段文字的 Agent*，最快的路径是：

```bash
# 1. 本地启动
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. 找到一个 good-first-issue 并分配给自己
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # 创建分支和 worktree

# 3. 做出改动，运行检查
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. 提交 PR
gh pr create --fill
```

完整的 Agent 友好贡献流程、代码风格和 PR 标准 → [English](../../CONTRIBUTING.md)（[Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja-JP.md) · [Português](CONTRIBUTING.pt-BR.md)）。

### 🏅 Open Design Fellow 计划

我们正在全球招募 **Open Design Fellow**——付费维护者，$1,000 / MR 免费 LLM 额度，官方授权在你所在地区推动增长，以及核心团队审查通道。详情 → [`MAINTAINERS.md`](../../MAINTAINERS.md) 和 [Discord](https://discord.gg/qhbcCH8Am4) 上的公告。

---

## 维护者

他们在日常维护、review 和社区支持里撑起了很多关键工作。

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
  </tr>
</table>

维护者规则、晋升标准和退出协议 → [`MAINTAINERS.md`](../../MAINTAINERS.md)（另有 [Deutsch](MAINTAINERS.de.md) · [Français](MAINTAINERS.fr.md) · [简体中文](MAINTAINERS.zh-CN.md) · [日本語](MAINTAINERS.ja-JP.md) · [Português](MAINTAINERS.pt-BR.md)）。

## 贡献者

感谢每一位参与者——代码、文档、反馈、一个精准的 Issue、一个新技能、一个新设计系统。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-05-30" alt="Open Design 贡献者" />
</a>

---

## 仓库活跃度

<picture>
  <img alt="Open Design——仓库指标" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

上方 SVG 由 [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml) 使用 [`lowlighter/metrics`](https://github.com/lowlighter/metrics) 每日重新生成。

---

## 给我们 Star

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="在 GitHub 上给 Open Design 一个 Star — github.com/nexu-io/open-design" width="100%" /></a>
</p>

如果这为你节省了三十分钟，请给一个 ★。Star 不能当饭吃——但它告诉下一位设计师、Agent 和贡献者，这个实验值得他们关注。一次点击，三秒钟，真实的信号。

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-28" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
    <img alt="Open Design Star 历史" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
  </picture>
</a>

---

## 参考与渊源

| 项目 | 角色 |
|---|---|
| [Claude Design][cd] | 本仓库作为开源替代品所对标的闭源产品。 |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | 设计哲学指南针——初级设计师工作流、品牌资产协议、反 AI 泛滥清单、五维评审。 |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | 杂志风格 Web PPT 技能，完整打包在 [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) 下。Deck 模式默认技能。 |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | HTML PPT Studio 系列——15 套 Deck 模板，36 个主题，31 种页面布局，动画运行时，磁力卡片演示模式。 |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | 首个开源 Claude Design 替代品；我们借鉴的 UX 模式（流式工件循环、沙箱 iframe、实时 Agent 面板）。 |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | 守护进程 + 适配器架构——PATH 扫描 Agent 检测、本地守护进程作为唯一特权进程。 |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | 9 节 `DESIGN.md` schema 和 70 个产品系统的来源。 |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | `design-systems/` 下新增的 57 个设计技能的来源。 |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | HTML→MP4 动态图形框架，在 Open Design 中作为 `hyperframes-html` 一等公民集成。 |
| [Claude Code skills][skill] | 我们原样采用的 `SKILL.md` 约定。 |

详细溯源 → [`docs/references.md`](../../docs/references.md)。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 许可证

Apache-2.0。打包的 `design-templates/guizang-ppt/` 保留其原始 [LICENSE](../../design-templates/guizang-ppt/LICENSE)（MIT，[@op7418](https://github.com/op7418)）。打包的 `design-templates/html-ppt/` 保留其原始 [LICENSE](../../design-templates/html-ppt/LICENSE)（MIT，[@lewislulu](https://github.com/lewislulu)）。
