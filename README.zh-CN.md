# Open Design

> **[Claude Design][cd] 的开源替代品。** 本地优先、可部署到 Vercel、每一层都 BYOK —— 你机器上已经装好的 coding agent（Claude Code、Codex、Cursor Agent、Gemini CLI、OpenCode、Qwen、GitHub Copilot CLI）就是设计引擎，由 **19 个可组合 Skills** 和 **71 套品牌级 Design System** 驱动。

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design 封面：与本地 AI 智能体共同设计" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" /></a>
  <a href="#支持的-coding-agent"><img alt="Agents" src="https://img.shields.io/badge/agents-Claude%20%7C%20Codex%20%7C%20Cursor%20%7C%20Gemini%20%7C%20OpenCode%20%7C%20Qwen%20%7C%20Copilot-black" /></a>
  <a href="#design-system"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-71-orange" /></a>
  <a href="#内置-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-19-teal" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

---

## 为什么要做这个

Anthropic 的 [Claude Design][cd]（2026-04-17 发布，基于 Opus 4.7）让大家第一次看到：当一个 LLM 不再写废话、开始直接交付设计成品，会是什么样子。它瞬间出圈 —— 然后保持**闭源**、付费、只跑在云上、绑定 Anthropic 的模型和 Anthropic 的内部 skill。没有 checkout，没有自托管，没有 Vercel 部署，也换不了自己的 agent。

**Open Design（OD）就是它的开源替代品。** 同一套 loop、同一种「artifact-first」心智模型，但没有锁定。我们不做 agent —— 你笔记本上最强的 coding agent 已经装好了。我们要做的，是把它接进一个 skill 驱动的设计工作流，跑在一个普通的 Web 应用里：本地 `pnpm dev`，云端 `vercel deploy`，每一层都 BYOK（自带 Key）。

输入「帮我做一份杂志风的种子轮 pitch deck」。在模型挥洒第一个像素之前，**初始化问题表单**已经先跳出来。Agent 从 5 套精挑的视觉方向里选一个。一张活的 `TodoWrite` 计划卡片实时流入 UI。Daemon 在磁盘上构建出一个真实的项目目录，里面有 seed 模板、布局库、自检 checklist。Agent **强制 pre-flight** 读取它们，对自己的输出跑一轮**五维评审**，几秒后吐出一个 `<artifact>`，渲染在沙盒 iframe 里。

这不是「AI 试图做点设计」。这是一个被提示词栈训练得像高级设计师一样工作的 AI —— 有可用的文件系统、有确定性的色板库、有 checklist 文化 —— 也就是 Claude Design 立下的那条线，只是这次它开源、归你。

OD 站在四个开源项目的肩膀上：

- [**`alchaincyf/huashu-design`**（花叔的画术）](https://github.com/alchaincyf/huashu-design) —— 设计哲学的指南针。Junior-Designer 工作流、5 步品牌资产协议、anti-AI-slop checklist、五维自评审、以及方向选择器背后的「5 流派 × 20 种设计哲学」思路 —— 全部蒸馏进 [`src/prompts/discovery.ts`](src/prompts/discovery.ts)。
- [**`op7418/guizang-ppt-skill`**（歸藏的杂志风 PPT skill）](https://github.com/op7418/guizang-ppt-skill) —— Deck 模式。原样捆绑在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留；杂志版式、WebGL hero、P0/P1/P2 checklist。
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) —— UX 北极星，也是我们最接近的同类。第一个开源的 Claude-Design 替代品。我们借鉴了它的流式 artifact 循环、沙盒 iframe 预览模式（自带 React 18 + Babel）、实时 agent 面板（todos + tool calls + 可中断生成）、5 种导出格式列表（HTML / PDF / PPTX / ZIP / Markdown）。我们刻意在形态上分流 —— 它是桌面 Electron 应用，把 [`pi-ai`][piai] 打包进去做 agent；我们是 Web 应用 + 本地 daemon，把 agent 运行时**委托**给你已经装好的 CLI。
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) —— Daemon 与运行时架构。PATH 扫描式 agent 检测，本地 daemon 作为唯一的特权进程，agent-as-teammate 的世界观。

## 一眼概览

| | 你拿到的 |
|---|---|
| **支持的 coding agent** | Claude Code · Codex CLI · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · GitHub Copilot CLI · Anthropic API（BYOK 兜底） |
| **内置 design system** | **71 套** —— 2 套手写起手 + 69 套从 [`awesome-design-md`][acd2] 导入的产品系统（Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Anthropic、Apple、Cursor、Supabase、Figma…） |
| **内置 skill** | **19 个** —— 原型 / deck / 移动端 / dashboard / pricing / docs / blog / SaaS landing，外加 10 个文档与办公产物模板（PM 规范、周报、OKR、runbook、看板…） |
| **视觉方向** | 5 套精选流派（Editorial Monocle · Modern Minimal · Tech Utility · Brutalist · Soft Warm），每一套自带 OKLch 色板 + 字体栈 |
| **设备外壳** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome —— 像素级精确，跨 skill 共享 |
| **Agent 运行时** | 本地 daemon 在你的项目目录里 spawn CLI —— agent 拥有真实的 `Read` / `Write` / `Bash` / `WebFetch`，作用在真实磁盘上 |
| **部署目标** | 本地 `pnpm dev` · Vercel · 单进程生产 (`npm start`) |
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
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 71 套 design system 库" /><br/>
<sub><b>71 套 design system 库</b> —— 每套产品系统都展示 4 色色卡。点进去看完整的 <code>DESIGN.md</code>、色板网格、live showcase。</sub>
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

19 个 skill，每个一个文件夹，都遵循 Claude Code 的 [`SKILL.md`][skill] 规范，并叠加 OD 的 `od:` frontmatter（`mode`、`platform`、`scenario`、`preview`、`design_system`）。

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

### 设计交付类

| Skill | Mode | 默认场景 | 产出 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | prototype | 桌面 | 单页 HTML —— landing、营销、hero |
| [`saas-landing`](skills/saas-landing/) | prototype | 桌面 | hero / features / pricing / CTA 营销版式 |
| [`dashboard`](skills/dashboard/) | prototype | 桌面 | 带侧栏 + 数据密集型的后台 |
| [`pricing-page`](skills/pricing-page/) | prototype | 桌面 | 独立定价页 + 对比表 |
| [`docs-page`](skills/docs-page/) | prototype | 桌面 | 三栏文档版式 |
| [`blog-post`](skills/blog-post/) | prototype | 桌面 | 长文 editorial |
| [`mobile-app`](skills/mobile-app/) | prototype | 移动 | 带 iPhone 15 Pro / Pixel 外壳的 app 屏 |
| [`simple-deck`](skills/simple-deck/) | deck | 桌面 | 极简横滑 deck |
| [`guizang-ppt`](skills/guizang-ppt/) | deck | **deck 默认** | 杂志风网页 PPT —— 来自 [op7418/guizang-ppt-skill][guizang] |

### 文档与办公产物类

| Skill | Mode | 产出 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | template | PM 规范文档 + 目录 + 决策日志 |
| [`weekly-update`](skills/weekly-update/) | template | 团队周报：进度 / 阻塞 / 下一步 |
| [`meeting-notes`](skills/meeting-notes/) | template | 会议决策纪要 |
| [`eng-runbook`](skills/eng-runbook/) | template | 故障 runbook |
| [`finance-report`](skills/finance-report/) | template | 高管财务摘要 |
| [`hr-onboarding`](skills/hr-onboarding/) | template | 岗位入职计划 |
| [`invoice`](skills/invoice/) | template | 单页发票 |
| [`kanban-board`](skills/kanban-board/) | template | 看板快照 |
| [`team-okrs`](skills/team-okrs/) | template | OKR 计分表 |

新增一个 skill 就是新增一个文件夹。读 [`docs/skills-protocol.md`](docs/skills-protocol.md) 了解扩展 frontmatter，fork 一个现有 skill，重启 daemon 即生效。

## 六个底层设计

### 1 · 我们不带 agent，你的就够好

Daemon 启动时扫 `PATH`，找 [`claude`](https://docs.anthropic.com/en/docs/claude-code)、[`codex`](https://github.com/openai/codex)、[`cursor-agent`](https://www.cursor.com/cli)、[`gemini`](https://github.com/google-gemini/gemini-cli)、[`opencode`](https://opencode.ai/)、[`qwen`](https://github.com/QwenLM/qwen-code)、[`copilot`](https://github.com/features/copilot/cli)。哪个在就用哪个 —— 通过 stdio 驱动，每个 CLI 一个 adapter。灵感来自 [`multica`](https://github.com/multica-ai/multica) 和 [`cc-switch`](https://github.com/farion1231/cc-switch)。一个 CLI 都没有？`Anthropic API · BYOK` 就是同一条管线减去 spawn。

### 2 · Skill 是文件，不是插件

遵循 Claude Code [`SKILL.md` 规范](https://docs.anthropic.com/en/docs/claude-code/skills)，每个 skill = `SKILL.md` + `assets/` + `references/`。把一个文件夹丢进 [`skills/`](skills/)，重启 daemon，picker 里就能看到。内置的 `magazine-web-ppt` 就是 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) **原样**捆绑 —— 原 LICENSE 保留、原作者归属保留。

### 3 · Design System 是可移植的 Markdown，不是 theme JSON

[`VoltAgent/awesome-design-md`][acd2] 的 9 段式 `DESIGN.md` —— color、typography、spacing、layout、components、motion、voice、brand、anti-patterns。每个 artifact 都从激活的 system 里读 token。切换 system → 下一次渲染就用新的 token。下拉框里现成的有：**Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic、Cursor、Supabase、Figma、Resend、Raycast、Lovable、Cohere、Mistral、ElevenLabs、X.AI、Spotify、Webflow、Sanity、PostHog、Sentry、MongoDB、ClickHouse、Cal、Replicate、Clay、Composio…** 共 71 套。

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
  + 激活的 DESIGN.md   （71 套备选）
  + 激活的 SKILL.md    （19 套备选）
  + 项目元数据          （kind、fidelity、speakerNotes、animations、灵感 system id）
  + Skill 副文件       （自动注入 pre-flight：先读 assets/template.html + references/*.md）
  + （deck kind 且无 skill 种子时） DECK_FRAMEWORK_DIRECTIVE   （nav / counter / scroll / print）
```

每一层都可组合。每一层都是一个你能改的文件。看 [`src/prompts/system.ts`](src/prompts/system.ts) 和 [`src/prompts/discovery.ts`](src/prompts/discovery.ts) 就知道真实契约长什么样。

## 技术架构

```
┌────────────────────────── 浏览器 ──────────────────────────────┐
│                                                                │
│   Vite + React SPA  （chat · 文件工作区 · iframe 预览）        │
│                                                                │
└──────────────┬───────────────────────────────────┬─────────────┘
               │ /api/* （dev 走代理）             │ direct (BYOK)
               ▼                                   ▼
   ┌──────────────────────┐              ┌──────────────────────┐
   │   本地 daemon         │              │   Anthropic SDK      │
   │   （Express + SQLite）│              │   （浏览器兜底）      │
   │                      │              └──────────────────────┘
   │   /api/agents        │
   │   /api/skills        │
   │   /api/design-systems│
   │   /api/projects/...  │
   │   /api/chat (SSE)    │
   │                      │
   └─────────┬────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · gemini · opencode · qwen · copilot│
   │  读 SKILL.md + DESIGN.md，把 artifact 写到磁盘                     │
   └────────────────────────────────────────────────────────────────────┘
```

| 层 | 技术栈 |
|---|---|
| 前端 | Vite 5 + React 18 + TypeScript |
| Daemon | Node 20–22 · Express · SSE 流 · `better-sqlite3` 存项目/对话/消息/tab |
| Agent 传输层 | `child_process.spawn`，Claude Code 走 `claude-stream-json` 解析器、Copilot CLI 走 `copilot-stream-json`，其余走 line-buffered plain stdout |
| 存储 | 纯文件 `.od/projects/<id>/` + SQLite `.od/app.sqlite`（已 gitignore，daemon 启动自建） |
| 预览 | 沙盒 iframe（`srcdoc`）+ 每个 skill 的 `<artifact>` parser |
| 导出 | HTML（内联资源）· PDF（浏览器打印）· PPTX（skill 自定义）· ZIP（archiver） |

## Quickstart

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
nvm use              # 使用 .nvmrc 中的 Node 22
corepack enable
pnpm install
pnpm dev:all         # daemon (:7456) + Vite (:5173) 一起起
open http://localhost:5173
```

第一次加载会：

1. 检测你 `PATH` 上有哪些 agent CLI，自动选一个。
2. 加载 19 个 skill + 71 套 design system。
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
| 完全清空，从零再来 | 先停 daemon，再 `rm -rf .od`，然后重新 `pnpm dev:all` |
| 换到别的位置 | 暂不支持 —— 路径是相对仓库根写死的 |

完整文件地图、脚本、排错 → [`QUICKSTART.md`](QUICKSTART.md)。

## 仓库结构

```
open-design/
├── README.md                      ← 英文
├── README.zh-CN.md                ← 本文件
├── QUICKSTART.md                  ← 跑 / 构建 / 部署
├── package.json                   ← 单 bin: od
│
├── daemon/                        ← Node + Express，唯一的服务端
│   ├── cli.js                     ← `od` 二进制入口
│   ├── server.js                  ← /api/* 路由（projects、chat、files、exports）
│   ├── agents.js                  ← PATH 扫描器 + 各 CLI 的 argv 拼装
│   ├── claude-stream.js           ← Claude Code stdout 流式 JSON 解析
│   ├── skills.js                  ← SKILL.md frontmatter 加载器
│   ├── design-systems.js          ← DESIGN.md 加载器 + swatch 提取
│   ├── design-system-preview.js   ← 单系统 live showcase
│   ├── design-system-showcase.js  ← 多 section 画廊渲染
│   ├── lint-artifact.js           ← 输出的 P0/P1 自检
│   ├── projects.js                ← 项目级文件系统辅助
│   ├── db.js                      ← SQLite schema（projects/messages/templates/tabs）
│   └── frontmatter.js             ← 零依赖 YAML 子集解析
│
├── src/                           ← Vite + React + TS 前端
│   ├── App.tsx                    ← 路由、bootstrap、设置
│   ├── components/                ← 27 个组件（chat、composer、picker、preview、sketch…）
│   ├── prompts/
│   │   ├── system.ts              ← composeSystemPrompt(base, skill, DS, metadata)
│   │   ├── official-system.ts     ← 身份宪章
│   │   ├── discovery.ts           ← turn-1 表单 + turn-2 分支 + 五维评审
│   │   ├── directions.ts          ← 5 套视觉方向 × OKLch 色板 + 字体栈
│   │   └── deck-framework.ts      ← deck 导航 / 计数 / 打印样式
│   ├── artifacts/
│   │   ├── parser.ts              ← 流式 <artifact> 标签解析
│   │   └── question-form.ts       ← <question-form> JSON 协议 + 重放
│   ├── runtime/
│   │   ├── srcdoc.ts              ← iframe 沙盒包装
│   │   ├── markdown.tsx           ← 助手消息渲染
│   │   ├── exports.ts             ← HTML / PDF / ZIP 导出
│   │   └── zip.ts                 ← 项目打包
│   ├── providers/
│   │   ├── daemon.ts              ← /api/chat SSE 流消费者
│   │   ├── anthropic.ts           ← BYOK Anthropic SDK 路径
│   │   └── registry.ts            ← /api/agents、/api/skills、/api/design-systems
│   └── state/                     ← config + projects（localStorage + daemon 持久化）
│
├── skills/                        ← 19 个 SKILL.md skill 包
│   ├── web-prototype/             ← 原型默认
│   ├── saas-landing/              ← 营销页（hero / features / pricing / CTA）
│   ├── dashboard/                 ← 后台 / 数据看板
│   ├── pricing-page/              ← 独立定价页 + 对比
│   ├── docs-page/                 ← 三栏文档
│   ├── blog-post/                 ← 长文 editorial
│   ├── mobile-app/                ← 带手机外壳的 app 屏
│   ├── simple-deck/               ← 极简横滑 deck
│   ├── guizang-ppt/               ← 内置 magazine-web-ppt（deck 默认）
│   │   ├── SKILL.md
│   │   ├── assets/template.html   ← seed
│   │   └── references/{themes,layouts,components,checklist}.md
│   ├── pm-spec/                   ← PM 规范文档
│   ├── weekly-update/             ← 团队周报
│   ├── meeting-notes/             ← 会议纪要
│   ├── eng-runbook/               ← 故障 / runbook
│   ├── finance-report/            ← 财务摘要
│   ├── hr-onboarding/             ← 入职计划
│   ├── invoice/                   ← 单页发票
│   ├── kanban-board/              ← 看板快照
│   ├── mobile-onboarding/         ← 多屏移动流
│   └── team-okrs/                 ← OKR 计分表
│
├── design-systems/                ← 71 套 DESIGN.md
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
│   └── sync-design-systems.mjs    ← 从上游 awesome-design-md tarball 重新导入
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
  <img src="docs/assets/design-systems-library.png" alt="71 套 Design Systems 库 — 编辑版式双页" width="100%" />
</p>

71 套开箱即用，每套一个 [`DESIGN.md`](design-systems/README.md)：

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

整个库通过 [`scripts/sync-design-systems.mjs`](scripts/sync-design-systems.mjs) 从 [`VoltAgent/awesome-design-md`][acd2] 导入。重新执行即可刷新。

## 视觉方向

当用户没有品牌资产时，agent 会跳第二个表单，5 套精选方向 —— 这是 [`huashu-design` 的「设计方向顾问 · 5 流派 × 20 种设计哲学」 fallback](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback) 在 OD 里的落地。每一套都是确定性 spec —— OKLch 色板、字体栈、版式姿态、参考列表 —— agent 直接把它**原样**绑进 seed 模板的 `:root`。一个 radio 选完，整套视觉系统全部锁定。零 freestyle，零 AI slop。

| 方向 | 调性 | 参考 |
|---|---|---|
| Editorial — Monocle / FT | 印刷杂志，墨水 + 米色纸 + 暖红强调 | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | 冷调、结构化、克制强调 | Linear · Vercel · Stripe |
| Tech utility | 信息密度、等宽、终端感 | Bloomberg · Bauhaus 工具 |
| Brutalist | 粗粝、巨字、无阴影、刺眼强调 | Bloomberg Businessweek · Achtung |
| Soft warm | 大方、低对比、桃色中性 | Notion 营销页 · Apple Health |

完整 spec → [`src/prompts/directions.ts`](src/prompts/directions.ts)。

## 反 AI Slop 机制

下面整套机制都是 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 的 playbook，被移植进 OD 的提示词栈，并通过 skill 副文件 pre-flight 让每个 skill 都能落地执行。看 [`src/prompts/discovery.ts`](src/prompts/discovery.ts) 是真实文案：

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
| Skill | 私有 | 12 套自定义 TS 模块 + `SKILL.md` | **19 套基于文件的 [`SKILL.md`][skill]，可丢入** |
| Design system | 私有 | `DESIGN.md`（v0.2 路线图） | **`DESIGN.md` × 71 套，开箱即有** |
| Provider 灵活度 | 仅 Anthropic | 7+（[`pi-ai`][piai]） | **取决于你的 agent** |
| 初始化问题表单 | ❌ | ❌ | **✅ 硬规则 turn 1** |
| 方向选择器 | ❌ | ❌ | **✅ 5 套确定性方向** |
| 实时 todo 进度 + tool 流 | ❌ | ✅ | **✅**（UX 模式来自 open-codesign） |
| 沙盒 iframe 预览 | ❌ | ✅ | **✅**（模式来自 open-codesign） |
| 评论模式手术刀编辑 | ❌ | ✅ | 🚧 路线图（移植自 open-codesign） |
| AI 自吐 tweaks 面板 | ❌ | ✅ | 🚧 路线图（移植自 open-codesign） |
| 文件系统级工作区 | ❌ | 部分（Electron 沙盒） | **✅ 真 cwd、真工具、SQLite 持久化** |
| 五维自评审 | ❌ | ❌ | **✅ Emit 前必跑** |
| 导出格式 | 受限 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX / ZIP / Markdown** |
| PPT skill 复用 | N/A | 内置 | **[`guizang-ppt-skill`][guizang] 直接接入** |
| 计费门槛 | Pro / Max / Team | BYOK | **BYOK** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 支持的 Coding Agent

Daemon 启动时从 `PATH` 自动检测，无需配置。

| Agent | 二进制 | 流式 | 备注 |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `--output-format stream-json`（类型化事件） | 一等公民，最佳保真度 |
| [Codex CLI](https://github.com/openai/codex) | `codex` | line-buffered | `codex exec <prompt>` |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | line-buffered | `cursor-agent -p` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | line-buffered | `gemini -p` |
| [OpenCode](https://opencode.ai/) | `opencode` | line-buffered | `opencode run` |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | line-buffered | `qwen -p` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `--output-format json`（类型化事件） | `copilot -p <prompt> --allow-all-tools --output-format json` |
| Anthropic API · BYOK | n/a | SSE 直连 | 没装任何 CLI 时的浏览器兜底 |

加一个新 CLI = 在 [`daemon/agents.js`](daemon/agents.js) 里加一项。流式格式从 `claude-stream-json`（类型化事件）和 `plain`（原始文本）两种里选一个。

## 引用与师承

每一个被借鉴的开源项目都列在这里。点链接可以验证师承。

| 项目 | 在这里的角色 |
|---|---|
| [`Claude Design`][cd] | 本仓库为之提供开源替代的闭源产品。 |
| [**`alchaincyf/huashu-design`**（花叔的画术）](https://github.com/alchaincyf/huashu-design) | 设计哲学的核心。Junior-Designer 工作流、5 步品牌资产协议、anti-AI-slop checklist、五维自评审、以及方向选择器背后的「5 流派 × 20 种设计哲学」库 —— 全部蒸馏进 [`src/prompts/discovery.ts`](src/prompts/discovery.ts) 与 [`src/prompts/directions.ts`](src/prompts/directions.ts)。 |
| [**`op7418/guizang-ppt-skill`**（歸藏）][guizang] | Magazine-web-PPT skill 原样捆绑在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留。Deck 模式默认。P0/P1/P2 checklist 文化也被借给了所有其他 skill。 |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + adapter 架构。PATH 扫描式 agent 检测、本地 daemon 作为唯一特权进程、agent-as-teammate 世界观。我们采纳模型，不 vendor 代码。 |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 第一个开源的 Claude-Design 替代品，也是我们最接近的同类。已采纳的 UX 模式：流式 artifact 循环、沙盒 iframe 预览（自带 React 18 + Babel）、实时 agent 面板（todos + tool calls + 可中断）、5 种导出格式列表（HTML/PDF/PPTX/ZIP/Markdown）、本地优先的 designs hub、`SKILL.md` 品味注入。路线图上的 UX 模式：评论模式手术刀编辑、AI 自吐 tweaks 面板。**我们刻意不 vendor [`pi-ai`][piai]** —— open-codesign 把它打包成 agent 运行时；我们则委托给用户已经装好的 CLI。 |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9 段式 `DESIGN.md` schema 的来源，69 套产品系统通过 [`scripts/sync-design-systems.mjs`](scripts/sync-design-systems.mjs) 导入。 |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 跨多个 agent CLI 的 symlink 式 skill 分发灵感来源。 |
| [Claude Code skills][skill] | `SKILL.md` 规范原样采纳 —— 任何 Claude Code skill 丢进 `skills/` 都能被 daemon 识别。 |

详尽的师承说明（每一项我们采纳了什么、刻意没采纳什么）在 [`docs/references.md`](docs/references.md)。

## Roadmap

- [x] Daemon + agent 检测 + skill registry + design-system 目录
- [x] Web 应用 + 对话 + question form + todo progress + 沙盒预览
- [x] 19 个 skill + 71 套 design system + 5 套视觉方向 + 5 个设备外壳
- [x] SQLite 后端的 projects · conversations · messages · tabs · templates
- [ ] 评论模式手术刀编辑（点元素 → 指令 → 局部 patch）—— 模式来自 [`open-codesign`][ocod]
- [ ] AI 自吐 tweaks 面板（模型自己抛出值得调的参数）—— 模式来自 [`open-codesign`][ocod]
- [ ] Vercel + 隧道部署食谱（Topology B）
- [ ] 一行 `npx od init` 脚手架带 `DESIGN.md`
- [ ] Skill 市场（`od skills install <github-repo>`）

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
- **接入一个新的 coding-agent CLI** —— 在 [`daemon/agents.js`](daemon/agents.js) 里加一项。

完整流程、合并硬线、代码风格、我们不接收的 PR 类型 → [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)（[English](CONTRIBUTING.md)）。

## License

Apache-2.0。内置的 [`skills/guizang-ppt/`](skills/guizang-ppt/) 保留它原始的 [LICENSE](skills/guizang-ppt/LICENSE)（MIT）和原作者 [op7418](https://github.com/op7418) 的归属。
