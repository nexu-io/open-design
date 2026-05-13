# Open Design

> **[Claude Design][cd] 的开源替代品。** 本地优先、可部署到 Vercel、每一层都 BYOK —— **16 套 coding-agent CLI** 在 `PATH` 上自动检测（Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI）就是设计引擎，由 **31 个可组合 Skills** 和 **72 套品牌级 Design System** 驱动。

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design 封面：与本地 AI 智能体共同设计" width="100%" />
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
  <a href="https://open-design.ai/"><img alt="下载客户端" src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-%E5%AE%A2%E6%88%B7%E7%AB%AF-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#支持的-coding-agent"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-system"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#内置-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-加入-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.zh-CN.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <b>简体中文</b> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## 为什么要做这个

Anthropic 的 [Claude Design][cd]（2026-04-17 发布，基于 Opus 4.7）让大家第一次看到：当一个 LLM 不再写废话、开始直接交付设计成品，会是什么样子。它瞬间出圈 —— 然后保持**闭源**、付费、只跑在云上、绑定 Anthropic 的模型和 Anthropic 的内部 skill。没有 checkout，没有自托管，没有 Vercel 部署，也换不了自己的 agent。

**Open Design（OD）就是它的开源替代品。** 同一套 loop、同一种「artifact-first」心智模型，但没有锁定。我们不做 agent —— 你笔记本上最强的 coding agent 已经装好了。我们要做的，是把它接进一个 skill 驱动的设计工作流：本地用 `pnpm tools-dev` 跑完整本地闭环，云端可单独部署 Web 层，每一层都 BYOK（自带 Key）。

输入「帮我做一份杂志风的种子轮 pitch deck」。在模型挥洒第一个像素之前，**初始化问题表单**已经先跳出来。Agent 从 5 套精挑的视觉方向里选一个。一张活的 `TodoWrite` 计划卡片实时流入 UI。Daemon 在磁盘上构建出一个真实的项目目录，里面有 seed 模板、布局库、自检 checklist。Agent **强制 pre-flight** 读取它们，对自己的输出跑一轮**五维评审**，几秒后吐出一个 `<artifact>`，渲染在沙盒 iframe 里。

这不是「AI 试图做点设计」。这是一个被提示词栈训练得像高级设计师一样工作的 AI —— 有可用的文件系统、有确定性的色板库、有 checklist 文化 —— 也就是 Claude Design 立下的那条线，只是这次它开源、归你。

OD 站在四个开源项目的肩膀上：

- [**`alchaincyf/huashu-design`**（花叔的画术）](https://github.com/alchaincyf/huashu-design) —— 设计哲学的指南针。Junior-Designer 工作流、5 步品牌资产协议、anti-AI-slop checklist、五维自评审、以及方向选择器背后的「5 流派 × 20 种设计哲学」思路 —— 全部蒸馏进 [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts)。
- [**`op7418/guizang-ppt-skill`**（歸藏的杂志风 PPT skill）](https://github.com/op7418/guizang-ppt-skill) —— Deck 模式。原样捆绑在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留；杂志版式、WebGL hero、P0/P1/P2 checklist。
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) —— UX 北极星，也是我们最接近的同类。第一个开源的 Claude-Design 替代品。我们借鉴了它的流式 artifact 循环、沙盒 iframe 预览模式（自带 React 18 + Babel）、实时 agent 面板（todos + tool calls + 可中断生成）、5 种导出格式列表（HTML / PDF / PPTX / ZIP / Markdown）。我们刻意在形态上分流 —— 它是桌面 Electron 应用，把 [`pi-ai`][piai] 打包进去做 agent；我们是 Web 应用 + 本地 daemon，把 agent 运行时**委托**给你已经装好的 CLI。
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) —— Daemon 与运行时架构。PATH 扫描式 agent 检测，本地 daemon 作为唯一的特权进程，agent-as-teammate 的世界观。

## 一眼概览

| | 你拿到的 |
|---|---|
| **Coding-agent CLI（16 套）** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI —— 在 `PATH` 上自动检测，picker 一键切换 |
| **BYOK 兜底** | 协议分流代理 `/api/proxy/{anthropic,openai,azure,google}/stream` —— 填 `baseUrl` + `apiKey` + `model`，选择 Anthropic / OpenAI / Azure OpenAI / Google Gemini，daemon 会把各家 SSE 统一成同一条 chat stream。daemon 边界拒绝 loopback / link-local / RFC1918 防 SSRF。 |
| **内置 design system** | **72 套** —— 2 套手写起手 + 70 套从 [`awesome-design-md`][acd2] 导入的产品系统（Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Anthropic、Apple、Cursor、Supabase、Figma、小红书…） |
| **内置 skill** | **31 个** —— 27 个 `prototype` 模式（web-prototype、saas-landing、dashboard、mobile-app、gamified-app、social-carousel、magazine-poster、dating-web、sprite-animation、motion-frames、critique、tweaks、wireframe-sketch、pm-spec、eng-runbook、finance-report、hr-onboarding、invoice、kanban-board、team-okrs…）+ 4 个 `deck` 模式（`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`）。Picker 按 `scenario` 分组：design / marketing / operation / engineering / product / finance / hr / sale / personal。 |
| **媒体生成** | 图像 · 视频 · 音频三类 surface 与设计循环并行可用。**gpt-image-2**（Azure / OpenAI）做海报、头像、信息图、城市插画地图 · **Seedance 2.0**（字节跳动）做 15 秒电影感 t2v + i2v · **HyperFrames**（[heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)）做 HTML→MP4 动态图形（产品揭示、动力学排版、数据图表、社媒卡片、Logo 收尾）。**93 条**可一键复刻的 prompt gallery —— 43 条 gpt-image-2 + 39 条 Seedance + 11 条 HyperFrames，统一放在 [`prompt-templates/`](prompt-templates/) 下，附预览图与来源署名。Chat 入口和写代码同一处；输出真实的 `.mp4` / `.png` 落到项目工作区里。 |
| **视觉方向** | 5 套精选流派（Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental），每套自带 OKLch 色板 + 字体栈（[`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)） |
| **设备外壳** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome —— 像素级精确，跨 skill 共享，统一在 [`assets/frames/`](assets/frames/) |
| **Agent 运行时** | 本地 daemon 在你的项目目录里 spawn CLI —— agent 拥有真实的 `Read` / `Write` / `Bash` / `WebFetch`，作用在真实磁盘上；每个 adapter 都有 Windows `ENAMETOOLONG` 兜底（stdin / 临时 prompt 文件） |
| **导入** | 把 [Claude Design][cd] 导出的 ZIP 直接拖到欢迎弹窗 —— `POST /api/import/claude-design` 解压成真实项目，agent 接着 Anthropic 停下的地方继续编辑，不用再向模型重述上下文 |
| **持久化** | SQLite 在 `.od/app.sqlite`：projects · conversations · messages · tabs · 用户 templates。明天再开，todo 卡片和打开的文件都还在原位。 |
| **生命周期** | 唯一入口 `pnpm tools-dev`（start / stop / run / status / logs / inspect / check）—— 用类型化 sidecar stamp 启动 daemon + web（+ desktop） |
| **桌面端** | 可选 Electron 壳：渲染器 sandbox + sidecar IPC（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）—— 同一通道驱动 `tools-dev inspect desktop screenshot`，跑 E2E |
| **部署目标** | 本地 `pnpm tools-dev` · Vercel Web 层 · 打包好的 Electron 桌面端，支持 macOS（Apple Silicon）和 Windows（x64）—— 从 [open-design.ai](https://open-design.ai/) 或 [最新 release](https://github.com/nexu-io/open-design/releases) 直接下载 |
| **License** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md

## 效果展示

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · 入口页" /><br/>
<sub><b>入口页</b> —— 选 skill、选 design system、写一行需求。同一个表面服务原型、deck、移动端、dashboard、editorial 页面所有 mode。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · 初始化问题表单" /><br/>
<sub><b>初始化问题表单</b> —— 模型动笔之前，OD 先把需求锁住：surface、受众、调性、品牌上下文、规模。30 秒勾选项秒杀 30 分钟来回返工。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · 方向选择器" /><br/>
<sub><b>方向选择器</b> —— 用户没有品牌上下文时，agent 自动跳第二个表单，5 套精选方向（Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm）一个 radio 选完，色板 + 字体栈直接锁定，没有 freestyle 空间。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · 实时 todo 进度" /><br/>
<sub><b>实时 todo 进度</b> —— Agent 的计划以活卡片形式流入 UI。<code>in_progress</code> → <code>completed</code> 实时切换。用户能在中途以极低成本介入纠偏。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · 沙盒预览" /><br/>
<sub><b>沙盒预览</b> —— 每个 <code>&lt;artifact&gt;</code> 都在干净的 srcdoc iframe 里渲染。可在文件工作区里就地编辑；可下载为 HTML / PDF / ZIP。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72 套 design system 库" /><br/>
<sub><b>72 套 design system 库</b> —— 每套产品系统都展示 4 色色卡。点进去看完整的 <code>DESIGN.md</code>、色板网格、live showcase。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · 杂志风 deck" /><br/>
<sub><b>Deck 模式（guizang-ppt）</b> —— 内置的 <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> 原样接入。杂志版式、WebGL hero 背景、单文件 HTML 输出、可导 PDF。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · 移动端原型" /><br/>
<sub><b>移动端原型</b> —— 像素级精确的 iPhone 15 Pro chrome（灵动岛、状态栏 SVG、Home Indicator）。多屏原型直接复用 <code>/frames/</code> 共享资源，agent 永远不需要重新画一遍手机。</sub>
</td>
</tr>
</table>

## 内置 Skills

**31 个 skill，每个一个文件夹**，都遵循 Claude Code 的 [`SKILL.md`][skill] 规范，并叠加 OD 的 `od:` frontmatter，daemon 原样解析 —— `mode`、`platform`、`scenario`、`preview.type`、`design_system.requires`、`default_for`、`featured`、`fidelity`、`speaker_notes`、`animations`、`example_prompt`（[`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)）。

两种顶层 **mode** 撑起整个目录：**`prototype`**（27 个 —— 任何能被渲染成单页 artifact 的产物，从杂志风 landing 到手机屏到 PM 规范文档都算）和 **`deck`**（4 个 —— 横滑式演示，自带 deck framework 框架）。**`scenario`** 是 picker 用来分组的字段：`design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`。

### 示例展示（Showcase examples）

视觉表现最强、最适合上手第一跑的几条 skill。每条都附带可直接打开的 `example.html` —— 不用登录、不用配置，先看产出再下单。

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>消费级约会 / 婚恋仪表盘 —— 左侧栏、社区动态 ticker、头部 KPI、30 天双向匹配柱状图，editorial 字体，克制点缀色。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>两页数字 e-guide —— 封面（标题、作者、TOC 预告）+ 内文跨页（pull-quote + 步骤列表），创作者 / 生活方式风。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>品牌新品发布邮件 —— 顶部 wordmark、hero 图、标题锁排、主 CTA、规格网格。居中单列 + 表格降级，邮件客户端安全。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>三屏游戏化移动 app 原型，黑色舞台 —— 封面 / 今日任务（XP 缎带 + 等级条）/ 任务详情。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>三屏移动端引导流 —— splash、价值主张、登录。状态栏、滑动点、主 CTA。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>单帧 motion 设计 hero，CSS 循环动画 —— 旋转字环、地球、计时器。可直接交给 HyperFrames 等关键帧导出。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>1080×1080 三连社媒轮播图 —— 三张电影感面板，标题前后呼应，品牌标识、loop 标记。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>像素 / 8-bit 动画解释器单帧 —— 米白通屏、像素吉祥物、动感日文标题、循环 CSS keyframes，可直接录屏成竖版视频。</sub>
</td>
</tr>
</table>

### 设计与营销类（prototype 模式）

| Skill | 平台 | 场景 | 产出 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | 桌面 | design | 单页 HTML —— landing、营销、hero（prototype 默认） |
| [`saas-landing`](skills/saas-landing/) | 桌面 | marketing | hero / features / pricing / CTA 营销版式 |
| [`dashboard`](skills/dashboard/) | 桌面 | operation | 带侧栏 + 数据密集型的后台 |
| [`pricing-page`](skills/pricing-page/) | 桌面 | sale | 独立定价页 + 对比表 |
| [`docs-page`](skills/docs-page/) | 桌面 | engineering | 三栏文档版式 |
| [`blog-post`](skills/blog-post/) | 桌面 | marketing | 长文 editorial |
| [`mobile-app`](skills/mobile-app/) | 移动 | design | 带 iPhone 15 Pro / Pixel 外壳的 app 屏 |
| [`mobile-onboarding`](skills/mobile-onboarding/) | 移动 | design | 多屏移动端引导流（splash · 价值主张 · 登录） |
| [`gamified-app`](skills/gamified-app/) | 移动 | personal | 三屏游戏化 app 原型 |
| [`email-marketing`](skills/email-marketing/) | 桌面 | marketing | 品牌新品发布邮件（表格降级邮件客户端安全） |
| [`social-carousel`](skills/social-carousel/) | 桌面 | marketing | 1080×1080 三连社媒轮播 |
| [`magazine-poster`](skills/magazine-poster/) | 桌面 | marketing | 单页杂志风海报 |
| [`motion-frames`](skills/motion-frames/) | 桌面 | marketing | CSS 循环动画的 motion hero |
| [`sprite-animation`](skills/sprite-animation/) | 桌面 | marketing | 像素 / 8-bit 动画解释器 |
| [`dating-web`](skills/dating-web/) | 桌面 | personal | 消费级约会 / 婚恋仪表盘 |
| [`digital-eguide`](skills/digital-eguide/) | 桌面 | marketing | 两页数字 e-guide（封面 + 内文跨页） |
| [`wireframe-sketch`](skills/wireframe-sketch/) | 桌面 | design | 手绘风线框稿 —— 服务于 "先把灰块拼出来给用户看" 的早期回合 |
| [`critique`](skills/critique/) | 桌面 | design | 五维自评分卡（Philosophy · Hierarchy · Detail · Function · Innovation） |
| [`tweaks`](skills/tweaks/) | 桌面 | design | AI 自吐 tweaks 面板 —— 模型自己抛出值得调的参数 |

### Deck 类（deck 模式）

| Skill | 默认 | 产出 |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **deck 默认** | 杂志风网页 PPT —— 来自 [op7418/guizang-ppt-skill][guizang]，原 LICENSE 保留 |
| [`simple-deck`](skills/simple-deck/) | — | 极简横滑 deck |
| [`replit-deck`](skills/replit-deck/) | — | 产品演示 deck（Replit 风） |
| [`weekly-update`](skills/weekly-update/) | — | 团队周报横滑 deck（进度 · 阻塞 · 下一步） |

### 文档与办公产物类（prototype 模式 + 文档场景）

| Skill | Scenario | 产出 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | PM 规范文档 + 目录 + 决策日志 |
| [`team-okrs`](skills/team-okrs/) | product | OKR 计分表 |
| [`meeting-notes`](skills/meeting-notes/) | operation | 会议决策纪要 |
| [`kanban-board`](skills/kanban-board/) | operation | 看板快照 |
| [`eng-runbook`](skills/eng-runbook/) | engineering | 故障 runbook |
| [`finance-report`](skills/finance-report/) | finance | 高管财务摘要 |
| [`invoice`](skills/invoice/) | finance | 单页发票 |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | 岗位入职计划 |

新增一个 skill 就是新增一个文件夹。读 [`docs/skills-protocol.md`](docs/skills-protocol.md) 了解扩展 frontmatter，fork 一个现有 skill，重启 daemon 即生效。目录拉取走 `GET /api/skills`；单个 skill 的种子拼装（template + 边角文件 references）走 `GET /api/skills/:id/example`。

## 六个底层设计

### 1 · 我们不带 agent，你的就够好

Daemon 启动时扫 `PATH`，找 [`claude`](https://docs.anthropic.com/en/docs/claude-code)、[`codex`](https://github.com/openai/codex)、[`cursor-agent`](https://www.cursor.com/cli)、[`gemini`](https://github.com/google-gemini/gemini-cli)、[`opencode`](https://opencode.ai/)、[`qwen`](https://github.com/QwenLM/qwen-code)、`qodercli`、[`copilot`](https://github.com/features/copilot/cli)、`hermes`、`kimi` 和 [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)。能找到的都成为候选设计引擎 —— 走 stdio，每个 CLI 一个 adapter，model picker 一键切换。灵感来自 [`multica`](https://github.com/multica-ai/multica) 和 [`cc-switch`](https://github.com/farion1231/cc-switch)。一个 CLI 都没装？API mode 就是同一条管线减去 spawn —— 选择 Anthropic、OpenAI 兼容、Azure OpenAI 或 Google Gemini，daemon 把归一化后的 SSE 转发回浏览器，loopback / link-local / RFC1918 在边界直接拒绝。

### 2 · Skill 是文件，不是插件

遵循 Claude Code [`SKILL.md` 规范](https://docs.anthropic.com/en/docs/claude-code/skills)，每个 skill = `SKILL.md` + `assets/` + `references/`。把一个文件夹丢进 [`skills/`](skills/)，重启 daemon，picker 里就能看到。内置的 `magazine-web-ppt` 就是 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) **原样**捆绑 —— 原 LICENSE 保留、原作者归属保留。

### 3 · Design System 是可移植的 Markdown，不是 theme JSON

[`VoltAgent/awesome-design-md`][acd2] 的 9 段式 `DESIGN.md` —— color、typography、spacing、layout、components、motion、voice、brand、anti-patterns。每个 artifact 都从激活的 system 里读 token。切换 system → 下一次渲染就用新的 token。下拉框里现成的有：**Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic、Cursor、Supabase、Figma、Resend、Raycast、Lovable、Cohere、Mistral、ElevenLabs、X.AI、Spotify、Webflow、Sanity、PostHog、Sentry、MongoDB、ClickHouse、Cal、Replicate、Clay、Composio、小红书…** 共 72 套。

### 4 · 初始化问题表单干掉 80% 的来回返工

OD 的提示词栈把 `RULE 1` 写死了：每个新设计任务都从 `<question-form id="discovery">` 开始，**不是代码**。Surface · 受众 · 调性 · 品牌上下文 · 规模 · 约束。一段写得很长的需求里仍然有大量留白：视觉调性、色彩立场、规模 —— 而表单恰恰把这些用 30 秒勾选项锁死。错方向的代价是一轮对话，不是一份做完的 deck。

这就是从 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 蒸馏出来的 **Junior-Designer 模式**：开工前一次性批量问完，尽早 show 出一些可见的东西（哪怕只是灰色方块的 wireframe），让用户用最低成本介入纠偏。再叠加品牌资产协议（定位 · 下载 · `grep` hex · 写 `brand-spec.md` · 复述），这是输出从「AI freestyle」跳到「先看资料再画图的设计师」最关键的一步。

### 5 · Daemon 让 agent 感觉自己就在你笔记本上 —— 因为它就是

Daemon `spawn` CLI 时，`cwd` 设到该项目在 `.od/projects/<id>/` 下的 artifact 文件夹。Agent 拿到的 `Read` / `Write` / `Bash` / `WebFetch` 都是真工具，作用在真文件系统上。它能 `Read` skill 的 `assets/template.html`，能 `grep` 你的 CSS 拿 hex，能写一份 `brand-spec.md`，能落地生成的图片，能产出 `.pptx` / `.zip` / `.pdf` —— 这些文件在 turn 结束的时候作为下载 chip 出现在文件工作区里。Session、对话、消息、tab 都持久化在本地 SQLite 里 —— 明天再打开这个项目，agent 的 todo 卡片还在你昨天停下的地方。

### 6 · 提示词栈本身就是产品

发送时拼装的不是「system + user」。它是：

```
DISCOVERY 指令         （turn-1 表单、turn-2 品牌分支、TodoWrite、五维评审）
  + 身份与工作流宪章   （OFFICIAL_DESIGNER_PROMPT、anti-AI-slop、Junior Designer 模式）
  + 激活的 DESIGN.md   （72 套备选）
  + 激活的 SKILL.md    （31 套备选）
  + 项目元数据          （kind、fidelity、speakerNotes、animations、灵感 system id）
  + Skill 副文件       （自动注入 pre-flight：先读 assets/template.html + references/*.md）
  + （deck kind 且无 skill 种子时） DECK_FRAMEWORK_DIRECTIVE   （nav / counter / scroll / print）
```

每一层都可组合。每一层都是一个你能改的文件。看 [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) 和 [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) 就知道真实契约长什么样。

## 技术架构

```
┌─────────────── 浏览器（Next.js 16）─────────────────────────────┐
│  chat · 文件工作区 · iframe 预览 · 设置 · 导入                  │
└──────────────┬─────────────────────────────────┬───────────────┘
               │ /api/*（dev 走 rewrites）        │
               ▼                                  ▼
   ┌─────────────────────────────────┐  /api/proxy/{provider}/stream (SSE)
   │  本地 daemon（Express + SQLite）│  ─→ 任意 OpenAI 兼容
   │                                 │      端点（BYOK）
   │  /api/agents         /api/skills│      含 SSRF 防御
   │  /api/design-systems /api/projects/…
   │  /api/chat (SSE)     /api/proxy/{provider}/stream (SSE)
   │  /api/templates      /api/import/claude-design
   │  /api/artifacts/save /api/artifacts/lint
   │  /api/upload         /api/projects/:id/files…
   │  /artifacts (静态)   /frames (静态)
   │
   │  可选 sidecar IPC：/tmp/open-design/ipc/<ns>/<app>.sock
   │  （STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN）
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · gemini · opencode · cursor-agent · qwen        │
   │  qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC)          │
   │  读 SKILL.md + DESIGN.md，把 artifact 写到磁盘                   │
   └──────────────────────────────────────────────────────────────────┘
```

| 层 | 技术栈 |
|---|---|
| 前端 | Next.js 16 App Router + React 18 + TypeScript，可部署到 Vercel |
| Daemon | Node 24 · Express · SSE 流 · `better-sqlite3`；表：`projects` · `conversations` · `messages` · `tabs` · `templates` |
| Agent 传输层 | `child_process.spawn`，Claude Code 走 `claude-stream-json`、Qoder CLI 走 `qoder-stream-json`、Copilot 走 `copilot-stream-json`、Codex / Gemini / OpenCode / Cursor Agent 走 `json-event-stream`（每个 CLI 一个 parser）、Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe 走 `acp-json-rpc`（Agent Client Protocol）、Pi 走 `pi-rpc`（stdio JSON-RPC）、Qwen Code / DeepSeek TUI 走 `plain` |
| BYOK 代理 | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → 各 provider 上游 API，统一输出 `delta/end/error` SSE；daemon 边界拒绝 loopback / link-local / RFC1918 |
| 存储 | 纯文件 `.od/projects/<id>/` + SQLite `.od/app.sqlite`（已 gitignore，daemon 启动自建）。`OD_DATA_DIR` 可改根目录用于测试隔离 |
| 预览 | 沙盒 iframe（`srcdoc`）+ 每个 skill 的 `<artifact>` parser（[`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)） |
| 导出 | HTML（内联资源）· PDF（浏览器打印，deck-aware）· PPTX（agent 驱动经由 skill）· ZIP（archiver）· Markdown |
| 生命周期 | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`；端口走 `--daemon-port` / `--web-port`，命名空间走 `--namespace` |
| 桌面端（可选） | Electron 壳 —— 通过 sidecar IPC 拿 web URL，不猜端口；同一通道（`STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN`）驱动 `tools-dev inspect desktop …` 跑 E2E |

## Quickstart

### 下载桌面端（无需构建）

试用 Open Design 最快的方式是直接下载预编译的桌面端 —— 不用装 Node、不用 pnpm、不用 clone：

- **[open-design.ai](https://open-design.ai/)** —— 官方下载页
- **[GitHub releases](https://github.com/nexu-io/open-design/releases)**

### 从源码运行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 应输出 10.33.2
pnpm install
pnpm tools-dev run web
# 打开 tools-dev 输出的 web URL
```

环境要求：Node `~24`，pnpm `10.33.x`。`nvm` / `fnm` 只是可选辅助工具，不是项目必需步骤；如果使用它们，先执行 `nvm install 24 && nvm use 24` 或 `fnm install 24 && fnm use 24`，再运行 `pnpm install`。

桌面端/后台启动、固定端口重启，以及 media 生成派发器检查（`OD_BIN`、`OD_DAEMON_URL`、`apps/daemon/dist/cli.js`）见 [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md)。

第一次加载会：

1. 检测你 `PATH` 上有哪些 agent CLI，自动选一个。
2. 加载 31 个 skill + 72 套 design system。
3. 弹欢迎对话框，让你贴 Anthropic key（仅 BYOK 兜底路径需要）。
4. **自动创建 `./.od/`** —— 本地运行时目录，存放 SQLite 项目库、各项目工作区、保存下来的 artifact。**没有** `od init` 这一步，daemon 启动时会自己 `mkdir`。

输入需求，回车，看 question form 跳出来，填，看 todo 卡片流动，看 artifact 渲染。点 **Save to disk** 或导出整个项目 ZIP。

### 第一次跑起来（`./.od/` 解释）

Daemon 在仓库根下维护一个隐藏目录，里面所有内容都已 gitignore，纯本机数据，**不要** commit。

```
.od/
├── app.sqlite                 ← 项目 · 对话 · 消息 · 打开的 tab
├── artifacts/                 ← Save to disk 一次性渲染（带时间戳）
└── projects/<id>/             ← 每个项目的工作目录，也是 agent 的 cwd
```

| 想做什么 | 怎么做 |
|---|---|
| 看一眼里面有啥 | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| 完全清空，从零再来 | `pnpm tools-dev stop`，再 `rm -rf .od`，然后重新 `pnpm tools-dev run web` |
| 换到别的位置 | 暂不支持 —— 路径是相对仓库根写死的 |

完整文件地图、脚本、排错 → [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md)。

## 仓库结构

```
open-design/
├── README.md                      ← 英文
├── README.de.md                   ← Deutsch
├── README.zh-CN.md                ← 本文件
├── QUICKSTART.md                  ← 跑 / 构建 / 部署
├── package.json                   ← 单 bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express，唯一的服务端
│   │   ├── src/                   ← TypeScript daemon 源码
│   │   │   ├── cli.ts             ← `od` bin 源码，编译到 dist/cli.js
│   │   │   ├── server.ts          ← /api/* 路由（projects、chat、files、exports）
│   │   │   ├── agents.ts          ← PATH 扫描器 + 各 CLI 的 argv 拼装
│   │   │   ├── claude-stream.ts   ← Claude Code stdout 流式 JSON 解析
│   │   │   ├── skills.ts          ← SKILL.md frontmatter 加载器
│   │   │   └── db.ts              ← SQLite schema（projects/messages/templates/tabs）
│   │   ├── sidecar/               ← tools-dev daemon sidecar wrapper
│   │   └── tests/                 ← daemon 包测试
│   │
│   └── web/                       ← Next.js 16 App Router + React 客户端
│       ├── app/                   ← App Router 入口
│       ├── next.config.ts         ← dev rewrites + 生产 out/ 静态导出
│       └── src/                   ← React + TS 客户端模块
│           ├── App.tsx            ← 路由、bootstrap、设置
│           ├── components/        ← chat、composer、picker、preview、sketch…
│           ├── prompts/           ← system、discovery、directions、deck framework
│           ├── artifacts/         ← streaming <artifact> parser + manifest
│           ├── runtime/           ← iframe srcdoc、markdown、导出辅助
│           ├── providers/         ← daemon SSE + BYOK API 传输
│           └── state/             ← localStorage + daemon-backed 项目状态
│
├── e2e/                           ← Playwright UI + 外部集成/Vitest harness
│
├── packages/
│   ├── contracts/                 ← web/daemon 共享 app contracts
│   ├── sidecar-proto/             ← Open Design sidecar protocol contract
│   ├── sidecar/                   ← 通用 sidecar runtime primitives
│   └── platform/                  ← 通用 process/platform primitives
│
├── skills/                        ← 31 个 SKILL.md skill 包（27 prototype + 4 deck）
│   ├── web-prototype/             ← prototype 默认
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck 模式
│   └── guizang-ppt/               ← 内置 magazine-web-ppt（deck 默认）
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 套 DESIGN.md
│   ├── default/                   ← Neutral Modern（起手）
│   ├── warm-editorial/            ← Warm Editorial（起手）
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md
│
├── assets/
│   └── frames/                    ← 跨 skill 共享设备外壳
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   └── deck-framework.html        ← deck 基线（nav / counter / print）
│
├── scripts/
│   └── sync-design-systems.ts     ← 从上游 awesome-design-md tarball 重新导入
│
├── docs/
│   ├── spec.md                    ← 产品定义、场景、差异化
│   ├── architecture.md            ← 拓扑、数据流、组件
│   ├── skills-protocol.md         ← 扩展 SKILL.md 的 od: frontmatter
│   ├── agent-adapters.md          ← 各 CLI 检测 + 派发
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← 详尽的引用与师承
│   ├── roadmap.md                 ← 分阶段交付
│   ├── schemas/                   ← JSON schema
│   └── examples/                  ← 标准 artifact 样例
│
└── .od/                           ← 运行时数据，已 gitignore，daemon 启动自建
    ├── app.sqlite                 ← 项目 / 对话 / 消息 / tab
    ├── projects/<id>/             ← 每个项目的工作目录（agent 的 cwd）
    └── artifacts/                 ← 单次保存的 artifact
```

## Design System

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="72 套 Design Systems 库 — 编辑版式双页" width="100%" />
</p>

72 套开箱即用，每套一个 [`DESIGN.md`](design-systems/README.md)：

<details>
<summary><b>完整目录</b>（点击展开）</summary>

**AI & LLM** —— `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**开发者工具** —— `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**生产力** —— `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**金融科技** —— `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**电商 / 出行** —— `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**媒体** —— `spotify` · `playstation` · `wired` · `theverge` · `meta`

**汽车** —— `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**其他** —— `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**起手** —— `default`（Neutral Modern）· `warm-editorial`

</details>

整个库通过 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 从 [`VoltAgent/awesome-design-md`][acd2] 导入。重新执行即可刷新。

## 视觉方向

当用户没有品牌资产时，agent 会跳第二个表单，5 套精选方向 —— 这是 [`huashu-design` 的「设计方向顾问 · 5 流派 × 20 种设计哲学」 fallback](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback) 在 OD 里的落地。每一套都是确定性 spec —— OKLch 色板、字体栈、版式姿态、参考列表 —— agent 直接把它**原样**绑进 seed 模板的 `:root`。一个 radio 选完，整套视觉系统全部锁定。零 freestyle，零 AI slop。

| 方向 | 调性 | 参考 |
|---|---|---|
| Editorial — Monocle / FT | 印刷杂志，墨水 + 米色纸 + 暖红强调 | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | 冷调、结构化、克制强调 | Linear · Vercel · Stripe |
| Tech utility | 信息密度、等宽、终端感 | Bloomberg · Bauhaus 工具 |
| Brutalist | 粗粝、巨字、无阴影、刺眼强调 | Bloomberg Businessweek · Achtung |
| Soft warm | 大方、低对比、桃色中性 | Notion 营销页 · Apple Health |

完整 spec → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)。

## 媒体生成

OD 不止于代码。同一套生成 `<artifact>` HTML 的 chat 入口，也驱动**图像**、**视频**、**音频**生成 —— 模型 adapter 已经接进 daemon 的 media pipeline（[`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts)、[`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)）。每一次渲染都是真实落盘的文件，`.png` 或 `.mp4` 在 turn 结束时直接以下载 chip 的形式出现在工作区里。

目前主力是三个模型族：

| Surface | 模型 | 提供方 | 用来做什么 |
|---|---|---|---|
| **图像** | `gpt-image-2` | Azure / OpenAI | 海报、头像、城市插画地图、信息图、杂志风社媒卡、老照片修复、产品爆炸图 |
| **视频** | `seedance-2.0` | 字节跳动 Volcengine | 15s 电影感 t2v + i2v + 音频 —— 叙事短片、人物特写、产品片、MV 编排 |
| **视频** | `hyperframes-html` | [HeyGen 开源](https://github.com/heygen-com/hyperframes) | HTML→MP4 动态图形 —— 产品揭示、动力学排版、数据图表、社媒覆盖层、Logo 收尾、TikTok 竖屏配卡拉 OK 字幕 |

不断生长的 **prompt gallery** 在 [`prompt-templates/`](prompt-templates/) —— 共 **93 条可一键复刻 prompt**：43 条图像（`prompt-templates/image/*.json`）、39 条 Seedance（`prompt-templates/video/*.json`，不含 `hyperframes-*`）、11 条 HyperFrames（`prompt-templates/video/hyperframes-*.json`）。每一条都带预览缩略图、原文 prompt、目标模型、画幅比，以及一个用来注明许可与作者的 `source` 区块。daemon 在 `GET /api/prompt-templates` 暴露它们；Web 入口的 **Image templates** / **Video templates** 两个 tab 把它们渲染成卡片网格，一键就把 prompt 拍进 composer，并自动选好对应模型。

### gpt-image-2 —— 图像样例（共 43 条，下面 5 张）

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>三段式石材风信息图</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>编辑级手绘旅行海报</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>电梯场景的单帧时尚静帧</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>头像 —— 霓虹脸字</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>编辑级影棚肖像</sub></td>
</tr>
</table>

完整列表 → [`prompt-templates/image/`](prompt-templates/image/)。来源：多数取自 [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts)（CC-BY-4.0），逐条保留作者署名。

### Seedance 2.0 —— 视频样例（共 39 条，下面 5 段）

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>4K 电影感录音棚片段</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>电影感微表情研究</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>叙事化产品片</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>风格化讽刺短片</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15s Seedance 2.0 叙事短片</sub></td>
</tr>
</table>

点任意缩略图即可播放真实渲染出的 MP4。完整列表 → [`prompt-templates/video/`](prompt-templates/video/)（`*-seedance-*` 与带 Cinematic 标签的条目）。来源：[`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts)（CC-BY-4.0），保留原推链接和作者 handle。

### HyperFrames —— HTML→MP4 动态图形（11 条可一键复刻模板）

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) 是 HeyGen 开源的 agent-native 视频框架 —— 你（或者 agent）写 HTML + CSS + GSAP，HyperFrames 通过 headless Chrome + FFmpeg 确定性地渲成 MP4。Open Design 把 HyperFrames 作为一等视频模型（`hyperframes-html`）接到 daemon dispatch；同时打包了 `skills/hyperframes/` 这个 skill，把 timeline 合约、scene transition 规则、audio-reactive 模式、字幕/TTS、目录块（`npx hyperframes add <slug>`）一并教给 agent。

11 条 HyperFrames prompt 放在 [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/)，每一条都是产生具体某个原型的明确 brief：

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5s 极简产品揭示</b> · 16:9 · 推近标题卡 + shader 转场</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30s SaaS 产品片</b> · 16:9 · Linear/ClickUp 风带 UI 3D 揭示</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok 卡拉 OK 口播</b> · 9:16 · TTS + 单词对齐字幕</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30s 品牌 sizzle</b> · 16:9 · 节拍同步动力学排版、audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>动画 bar-chart race</b> · 16:9 · NYT 风数据信息图</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>航线地图（起 → 终）</b> · 16:9 · Apple 风电影感路径揭示</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4s 电影感 Logo 收尾</b> · 16:9 · 逐部件拼合 + 光晕</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K 数字飙升</b> · 9:16 · Apple 风高燃绿光闪 + 钞票飞溅</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>3 手机 app 展示</b> · 16:9 · 悬浮三屏 + 功能旁注</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>社媒卡叠加</b> · 9:16 · X · Reddit · Spotify · Instagram 依次入画</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>网站到视频管线</b> · 16:9 · 抓取 3 种视口 + 转场串联</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

套路和其它一样：选模板、改 brief、发送。Agent 读取自带的 `skills/hyperframes/SKILL.md`（里面带 OD 专用的渲染流程 —— composition 源文件落到 `.hyperframes-cache/`，避免污染文件工作区；daemon 替你触发 `npx hyperframes render`，绕开 macOS sandbox-exec / Puppeteer 卡死；最终只有 `.mp4` 作为项目 chip 出现），写完 composition、产出 MP4。目录块缩略图版权归 HeyGen，从他们的 CDN 回源；OSS 框架本身是 Apache-2.0。

> **已经接好但还没出 prompt 模板的：** Kling 2.0 / 1.6 / 1.5、Veo 3 / Veo 2、Sora 2 / Sora 2-Pro（via Fal）、MiniMax video-01 —— 都在 `VIDEO_MODELS`（[`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)）里。Suno v5 / v4.5、Udio v2、Lyria 2（音乐）和 gpt-4o-mini-tts、MiniMax TTS（语音）覆盖音频侧。补全这些模型的 prompt 模板属于开放贡献 —— 把 JSON 放进 `prompt-templates/video/` 或 `prompt-templates/audio/`，picker 里就能直接看到。

## 聊天循环之外，还交付了什么

Chat / artifact 循环最显眼，但这套仓库里还有几个能力被埋得有点深，对照其它产品做选型之前值得先扫一遍：

- **Claude Design ZIP 导入。** 把 claude.ai 导出的 ZIP 拖到欢迎弹窗，`POST /api/import/claude-design` 把它解压成真实 `.od/projects/<id>/`，把入口文件作为 tab 打开，并预置一句「接着 Anthropic 停下的地方继续编辑」给本地 agent。不用再让模型重述上下文，也不用「让模型重新画一遍」。([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **多 provider BYOK 代理。** `POST /api/proxy/{anthropic,openai,azure,google}/stream` 接收 `{ baseUrl, apiKey, model, messages }`，构造各 provider 的上游请求，把 SSE chunk 统一成 `delta/end/error`，同时拒绝 loopback / link-local / RFC1918 防 SSRF。OpenAI 兼容路径覆盖 OpenAI、Azure AI Foundry `/openai/v1`、DeepSeek、Groq、MiMo、OpenRouter、自托管 vLLM；Azure OpenAI 路径补上 deployment URL + `api-version`；Google 路径走 Gemini `:streamGenerateContent`。
- **用户自存 templates。** 喜欢某次渲染？`POST /api/templates` 把 HTML + 元数据快照进 SQLite `templates` 表。下个项目的 picker 里多一行「你的模板」 —— 跟内置 31 套同一个挑选面，但是你的。
- **Tab 持久化。** 每个项目记得自己打开的文件和当前 tab，存在 `tabs` 表里。明天再打开，工作区还是你昨天离开时的样子。
- **Artifact lint API。** `POST /api/artifacts/lint` 对生成的 artifact 跑结构性检查（`<artifact>` 框架是否破损、必需的副文件是否缺失、palette token 是否过期），返回 agent 下一回合可以读回去的 findings。五维自评审就是用它把分数落到证据上而不是 vibe。
- **Sidecar 协议 + 桌面端自动化。** Daemon、web、desktop 进程都带类型化的 5 字段 stamp（`app · mode · namespace · ipc · source`），并把 JSON-RPC IPC 通道暴露在 `/tmp/open-design/ipc/<namespace>/<app>.sock`。`tools-dev inspect desktop status \| eval \| screenshot` 就跑在这条通道上，所以 headless E2E 直接打到真实 Electron 壳，不用造定制夹具（[`packages/sidecar-proto/`](packages/sidecar-proto/)、[`apps/desktop/src/main/`](apps/desktop/src/main/)）。
- **Windows 友好的 spawn。** 任何在长 prompt 上会撞 `CreateProcess` 32 KB argv 上限的 adapter（Codex、Gemini、OpenCode、Cursor Agent、Qwen、Qoder CLI、Pi）都改走 stdin。Claude Code 和 Copilot 保留 `-p`；连 stdin 都装不下时 daemon 退回临时 prompt 文件。
- **按 namespace 隔离的 runtime data。** `OD_DATA_DIR` 加 `--namespace` 给你完全隔离的 `.od/`-style 目录树，Playwright、beta channel、你正经的项目永远不会共用同一个 SQLite 文件。

## 反 AI Slop 机制

下面整套机制都是 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 的 playbook，被移植进 OD 的提示词栈，并通过 skill 副文件 pre-flight 让每个 skill 都能落地执行。看 [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) 是真实文案：

- **先表单。** Turn 1 必须是 `<question-form>`，**不准** thinking、不准 tools、不准旁白。用户用 radio 速度选默认。
- **品牌资产协议。** 用户贴截图或 URL 时，agent 走 5 步流程（定位 · 下载 · grep hex · 写 `brand-spec.md` · 复述）才能开始写 CSS。**绝不从记忆里猜品牌色**。
- **五维评审。** 在吐 `<artifact>` 之前，agent 默默给自己 1–5 分打分，五个维度：哲学 / 层级 / 执行 / 具体度 / 克制。任一维 < 3/5 视为退步 —— 修完再评。两轮是常态。
- **P0/P1/P2 checklist。** 每个 skill 都自带 `references/checklist.md`，含硬性 P0。Agent 必须 P0 全过才能 emit。
- **Slop 黑名单。** 暴力紫渐变、通用 emoji 图标、左 border 圆角卡片、手绘 SVG 真人脸、Inter 当 *display* 字体、自编指标 —— 提示词里全部明令禁止。
- **诚实占位 > 假数据。** Agent 没真数字时写 `—` 或一个标注的灰块，绝不写「快 10 倍」。

## 横向对比

| 维度 | [Claude Design][cd]（Anthropic） | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| License | 闭源 | MIT | **Apache-2.0** |
| 形态 | Web (claude.ai) | 桌面 (Electron) | **Web 应用 + 本地 daemon** |
| 可部署 Vercel | ❌ | ❌ | **✅** |
| Agent 运行时 | 内置 (Opus 4.7) | 内置 ([`pi-ai`][piai]) | **委托给用户已装好的 CLI** |
| Skill | 私有 | 12 套自定义 TS 模块 + `SKILL.md` | **31 套基于文件的 [`SKILL.md`][skill]，可丢入** |
| Design system | 私有 | `DESIGN.md`（v0.2 路线图） | **`DESIGN.md` × 72 套，开箱即有** |
| Provider 灵活度 | 仅 Anthropic | 7+（[`pi-ai`][piai]） | **16 套 CLI adapter + OpenAI 兼容 BYOK 代理** |
| 初始化问题表单 | ❌ | ❌ | **✅ 硬规则 turn 1** |
| 方向选择器 | ❌ | ❌ | **✅ 5 套确定性方向** |
| 实时 todo 进度 + tool 流 | ❌ | ✅ | **✅**（UX 模式来自 open-codesign） |
| 沙盒 iframe 预览 | ❌ | ✅ | **✅**（模式来自 open-codesign） |
| Claude Design ZIP 导入 | n/a | ❌ | **✅ `POST /api/import/claude-design` —— 接着 Anthropic 停下的地方继续编辑** |
| 评论模式手术刀编辑 | ❌ | ✅ | 🟡 部分 —— 预览元素评论 + chat 附件已实现；可靠的局部 patch 仍在推进 |
| AI 自吐 tweaks 面板 | ❌ | ✅ | 🚧 路线图 —— 专属 chat-side 面板 UX 尚未实现 |
| 文件系统级工作区 | ❌ | 部分（Electron 沙盒） | **✅ 真 cwd、真工具、SQLite 持久化（projects · conversations · messages · tabs · templates）** |
| 五维自评审 | ❌ | ❌ | **✅ Emit 前必跑** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` —— 把 findings 喂回 agent** |
| Sidecar IPC + 无头桌面端 | ❌ | ❌ | **✅ stamped 进程 + `tools-dev inspect desktop status \| eval \| screenshot`** |
| 导出格式 | 受限 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX（agent 驱动）/ ZIP / Markdown** |
| PPT skill 复用 | N/A | 内置 | **[`guizang-ppt-skill`][guizang] 直接接入（deck 模式默认）** |
| 计费门槛 | Pro / Max / Team | BYOK | **BYOK —— 填任意 OpenAI 兼容 `baseUrl`** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 支持的 Coding Agent

Daemon 启动时从 `PATH` 自动检测，无需配置。流式分发逻辑在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 的 `AGENT_DEFS` 里；每个 CLI 的 parser 也在同目录。模型列表的来源要么是探测 `<bin> --list-models` / `<bin> models` / ACP 握手，要么走精选 fallback。

| Agent | 二进制 | 流式格式 | argv 形态（拼装好的 prompt 路径） |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json`（类型化事件） | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` parser | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]`（prompt 走 stdin） |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` parser | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]`（prompt 走 stdin） |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` parser | `opencode run --format json --dangerously-skip-permissions [--model …] -`（prompt 走 stdin） |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` parser | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -`（prompt 走 stdin） |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain`（原始 stdout chunk） | `qwen --yolo [--model …] -`（prompt 走 stdin） |
| Qoder CLI | `qodercli` | `qoder-stream-json`（类型化事件） | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]`（prompt 走 stdin） |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json`（类型化事件） | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc`（Agent Client Protocol） | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc`（stdio JSON-RPC） | `pi --mode rpc [--model …] [--thinking …]`（prompt 走 RPC `prompt` 命令） |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain`（原始 stdout chunk） | `deepseek exec --auto [--model …] <prompt>` |
| **多 provider BYOK** | n/a | SSE 归一化 | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI 兼容 / Azure OpenAI / Gemini；拒绝 loopback / link-local / RFC1918 |

加一个新 CLI = 在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 里加一项。流式格式从 `claude-stream-json` / `qoder-stream-json` / `copilot-stream-json` / `json-event-stream`（搭配每 CLI 的 `eventParser`）/ `acp-json-rpc` / `pi-rpc` / `plain` 中选一个。

## 引用与师承

每一个被借鉴的开源项目都列在这里。点链接可以验证师承。

| 项目 | 在这里的角色 |
|---|---|
| [`Claude Design`][cd] | 本仓库为之提供开源替代的闭源产品。 |
| [**`alchaincyf/huashu-design`**（花叔的画术）](https://github.com/alchaincyf/huashu-design) | 设计哲学的核心。Junior-Designer 工作流、5 步品牌资产协议、anti-AI-slop checklist、五维自评审、以及方向选择器背后的「5 流派 × 20 种设计哲学」库 —— 全部蒸馏进 [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) 与 [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)。 |
| [**`op7418/guizang-ppt-skill`**（歸藏）][guizang] | Magazine-web-PPT skill 原样捆绑在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留。Deck 模式默认。P0/P1/P2 checklist 文化也被借给了所有其他 skill。 |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + adapter 架构。PATH 扫描式 agent 检测、本地 daemon 作为唯一特权进程、agent-as-teammate 世界观。我们采纳模型，不 vendor 代码。 |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 第一个开源的 Claude-Design 替代品，也是我们最接近的同类。已采纳的 UX 模式：流式 artifact 循环、沙盒 iframe 预览（自带 React 18 + Babel）、实时 agent 面板（todos + tool calls + 可中断）、5 种导出格式列表（HTML/PDF/PPTX/ZIP/Markdown）、本地优先的 designs hub、`SKILL.md` 品味注入，以及评论模式预览标注的第一版。路线图上的 UX 模式：可靠的局部 patch 和 AI 自吐 tweaks 面板。**我们刻意不 vendor [`pi-ai`][piai]** —— open-codesign 把它打包成 agent 运行时；我们则委托给用户已经装好的 CLI。 |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9 段式 `DESIGN.md` schema 的来源，69 套产品系统通过 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 导入。 |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 跨多个 agent CLI 的 symlink 式 skill 分发灵感来源。 |
| [Claude Code skills][skill] | `SKILL.md` 规范原样采纳 —— 任何 Claude Code skill 丢进 `skills/` 都能被 daemon 识别。 |

详尽的师承说明（每一项我们采纳了什么、刻意没采纳什么）在 [`docs/references.md`](docs/references.md)。

## Roadmap

- [x] Daemon + agent 检测（16 套 CLI adapter）+ skill registry + design-system 目录
- [x] Web 应用 + 对话 + question form + 5 套方向选择器 + todo progress + 沙盒预览
- [x] 31 个 skill + 72 套 design system + 5 套视觉方向 + 5 个设备外壳
- [x] SQLite 后端的 projects · conversations · messages · tabs · templates
- [x] 多 provider BYOK 代理（`/api/proxy/{anthropic,openai,azure,google}/stream`）含 SSRF 防御
- [x] Claude Design ZIP 导入（`/api/import/claude-design`）
- [x] Sidecar 协议 + Electron 桌面端 + IPC 自动化（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）
- [x] Artifact lint API + 五维自评审 emit-前 gate
- [ ] 评论模式手术刀编辑 —— 已部分交付：预览元素评论和 chat 附件；可靠的定向 patch 仍在推进
- [ ] AI 自吐 tweaks 面板 UX —— 尚未实现
- [ ] Vercel + 隧道部署食谱（Topology B）
- [ ] 一行 `npx od init` 脚手架带 `DESIGN.md`
- [ ] Skill 市场（`od skills install <github-repo>`）和 `od skill add | list | remove | test` CLI 表面（在 [`docs/skills-protocol.md`](docs/skills-protocol.md) 里有草案，daemon 实现尚未跟上）
- [x] `apps/packaged/` 出可分发 Electron 安装包 —— macOS（Apple Silicon）和 Windows（x64）下载已上线 [open-design.ai](https://open-design.ai/) 和 [GitHub releases 页面](https://github.com/nexu-io/open-design/releases)

分阶段交付计划在 [`docs/roadmap.md`](docs/roadmap.md)。

## 项目状态

这是一个早期实现 —— 闭环（检测 → 选 skill + design system → 对话 → 解析 `<artifact>` → 预览 → 保存）已经端到端跑通。提示词栈和 skill 库是价值最重的部分，目前已稳定。组件级 UI 仍在每天迭代。

## 给我们点个 Star

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="给 Open Design 点个 Star —— github.com/nexu-io/open-design" width="100%" /></a>
</p>

如果这套东西帮你省了半小时，给它一个 ★。Star 不付房租，但它告诉下一个设计师、Agent 和贡献者：这个实验值得他们的注意力。一次点击、三秒钟、真实信号：[github.com/nexu-io/open-design](https://github.com/nexu-io/open-design)。

## 贡献

欢迎 issue、PR、新 skill、新 design system。收益最高的贡献往往就是一个文件夹、一份 Markdown，或者一个 PR 大小的 adapter：

- **加一个 skill** —— 往 [`skills/`](skills/) 丢一个文件夹，遵循 [`SKILL.md`][skill] 规范。
- **加一套 design system** —— 往 [`design-systems/<brand>/`](design-systems/) 丢一份 `DESIGN.md`，用 9 段式 schema。
- **接入一个新的 coding-agent CLI** —— 在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 里加一项。

完整流程、合并硬线、代码风格、我们不接收的 PR 类型 → [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)（[English](CONTRIBUTING.md)，[Deutsch](CONTRIBUTING.de.md)，[Français](CONTRIBUTING.fr.md)）。

## 贡献者墙

感谢每一位让 Open Design 变得更好的朋友 —— 无论是写代码、修文档、提 issue、加 skill 还是加 design system，每一次真实贡献都会被记住。下面这面墙是最直观的「Thank you」。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-13" alt="Open Design 贡献者" />
</a>

第一次提 PR？欢迎从 [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) 标签起步。

## 仓库活跃度

<picture>
  <img alt="Open Design 仓库指标" src="docs/assets/github-metrics.svg" />
</picture>

上面的 SVG 由 [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) 借助 [`lowlighter/metrics`](https://github.com/lowlighter/metrics) 每天自动重新生成。想要立刻刷新可以去 **Actions** 选项卡手动触发；想开启更丰富的插件（traffic、follow-up time 等）可在仓库 secrets 里加一个细粒度 PAT 命名为 `METRICS_TOKEN`。

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-13" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
  </picture>
</a>

曲线往上走 —— 那就是我们想看到的信号。点 ★ 推它一把。

## 鸣谢 / Credits

[`skills/html-ppt/`](skills/html-ppt/) 主 skill 以及 [`skills/html-ppt-*/`](skills/) 下的 15 个 per-template 子 skill —— 含 15 套 full-deck、36 套主题、31 个单页 layout、27 个 CSS 动画 + 20 个 canvas FX、键盘 runtime 与磁吸卡片演讲者模式 —— 整合自开源项目 [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)（MIT）。原始 LICENSE 已保留于 [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE)，原作者归属 [@lewislulu](https://github.com/lewislulu)。每张 per-template 的 Examples 卡片（`html-ppt-pitch-deck`、`html-ppt-tech-sharing`、`html-ppt-presenter-mode`、`html-ppt-xhs-post` …）都把 authoring 指南委托给主 skill，所以点 **Use this prompt** 后，沿用上游同样的 prompt → 产物路径。

[`skills/guizang-ppt/`](skills/guizang-ppt/) 杂志风横向翻页 deck 整合自 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)（MIT），原作者归属 [@op7418](https://github.com/op7418)。

## License

Apache-2.0。内置的 [`skills/guizang-ppt/`](skills/guizang-ppt/) 保留它原始的 [LICENSE](skills/guizang-ppt/LICENSE)（MIT）和原作者 [op7418](https://github.com/op7418) 的归属。内置的 [`skills/html-ppt/`](skills/html-ppt/) 保留它原始的 [LICENSE](skills/html-ppt/LICENSE)（MIT）和原作者 [lewislulu](https://github.com/lewislulu) 的归属。
