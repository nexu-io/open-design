---
name: magazine-web-ppt
description: 生成"电子杂志 × 电子墨水"风格的横向翻页网页 PPT（单 HTML 文件），含 WebGL 流体背景、衬线标题 + 非衬线正文、章节幕封、数据大字报、图片网格等模板。当用户需要制作分享 / 演讲 / 发布会风格的网页 PPT，或提到"杂志风 PPT"、"horizontal swipe deck"、"editorial magazine"、"e-ink presentation"时使用。
triggers:
  - "ppt"
  - "deck"
  - "slides"
  - "presentation"
  - "magazine"
  - "杂志"
  - "杂志风 PPT"
  - "horizontal swipe"
  - "horizontal swipe deck"
  - "editorial magazine"
  - "e-ink presentation"
  - "网页 PPT"
  - "发布会"
  - "分享 PPT"
od:
  mode: deck
  scenario: marketing
  featured: 0.02
  default_for: deck
  upstream: "https://github.com/op7418/guizang-ppt-skill"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "帮我做一份杂志风的 PPT —— 关于'一人公司 · 被 AI 折叠的组织'，25 分钟分享会，目标受众是设计师 + 创业者。先推荐一个方向（Monocle / WIRED / Kinfolk / Domus / Lab）让我选。"
---

# Magazine Web Ppt

## 这个 Skill 做什么

生成一份**单文件 HTML**的横向翻页 PPT，视觉基调是：

- **电子杂志 + 电子墨水**混血风格
- **WebGL 流体 / 等高线 / 色散背景**（hero 页可见）
- **衬线标题（Noto Serif SC + Playfair Display）+ 非衬线正文（Noto Sans SC + Inter）+ 等宽元数据（IBM Plex Mono）**
- **Lucide 线性图标**（不用 emoji）
- **横向左右翻页**（键盘 ← →、滚轮、触屏滑动、底部圆点、ESC 索引）
- **主题平滑插值**：翻到 hero 页时颜色和 shader 柔顺过渡

这个 skill 的美学不是"商务 PPT"，也不是"消费互联网 UI"——它像 *Monocle* 杂志贴上了代码后的样子。

## 何时使用

**合适的场景**：
- 线下分享 / 行业内部讲话 / 私享会
- AI 新产品发布 / demo day
- 带有强烈个人风格的演讲
- 需要"一次做完，不用翻页工具"的网页版 slides

**不合适的场景**：
- 大段表格数据、图表叠加（用常规 PPT）
- 培训课件（信息密度不够）
- 需要多人协作编辑（这是静态 HTML）

## 工作流

### Step 0 · 选方向(Direction · 必做的第一步)

**在问 6 个澄清问题之前,先让用户在 5 个 magazine 方向里挑一个**。每个方向都把"主题色 / 推荐 layout / chrome 风格 / 推荐 slide 数"打包好,挑了方向就回答掉一半澄清问题。

打开 `references/styles.md`,**整段拷过来**给用户看 5 个方向的 1-line summary,然后让他选:

```
1. Monocle Editorial · 国际杂志风 ✦ 默认
2. WIRED Tech · 数据 + 工程
3. Kinfolk Slow · 慢生活 / 人文
4. Domus Architectural · 建筑 / 空间感
5. Lab / Reference · 学术 + 工艺手册
```

如果用户说"不知道,你推荐"——**默认推 Monocle Editorial**,因为它失败概率最低。如果用户提到"AI / benchmark / 技术发布"——推 WIRED;"读书 / 私享 / 朋友圈"——推 Kinfolk;"设计 / 建筑 / portfolio"——推 Domus;"研究 / 学术 / 方法论"——推 Lab。

挑完方向后,在项目目录下创建或更新 `项目记录.md`,第一行写清方向 + 主题色 + 受众 + 时长(模板见 `styles.md` 末尾)。**全程不要换方向**——半路换 = 前面全废。

### Step 1 · 需求澄清(**动手前必做**)

**如果用户已经给了完整的大纲 + 图片**,可以跳过直接进 Step 2。

**如果用户只给了主题或一个模糊想法**,用这 6 个问题逐个对齐后再动手。不要基于猜测就开始写 slide——一旦结构定错,后期翻修代价很高:

#### 6 问澄清清单

> 第 5 题已在 Step 0 选方向时一并回答(方向→主题色)。下面的 5 题里,第 5 题留白即可。

| # | 问题 | 为什么要问 |
|---|------|-----------|
| 1 | **受众是谁?分享场景?**(行业内部 / 商业发布 / demo day / 私享会) | 决定语言风格和深度 |
| 2 | **分享时长?** | 15 分钟 ≈ 10 页,30 分钟 ≈ 20 页,45 分钟 ≈ 25-30 页(每个方向的推荐范围见 `styles.md`) |
| 3 | **有没有原始素材?**(文档 / 数据 / 旧 PPT / 文章链接) | 有素材就基于素材,没有就帮他搭 |
| 4 | **有没有图片?放在哪?** | 详见下方"图片约定" |
| 5 | ~~**想要哪套主题色?**~~ | ✓ 已在 Step 0 由方向决定 |
| 6 | **有没有硬约束?**(必须包含 XX 数据 / 不能出现 YY) | 避免返工 |

#### 大纲协助(如果用户没有大纲)

用"叙事弧"模板搭骨架,再填内容:

```
钩子(Hook)       → 1 页   : 抛一个反差 / 问题 / 硬数据让人停下来
定调(Context)    → 1-2 页 : 说明背景 / 你是谁 / 为什么讲这个
主体(Core)       → 3-5 页 : 核心内容,用 Layout 4/5/6/9/10 穿插
转折(Shift)      → 1 页   : 打破预期 / 提出新观点
收束(Takeaway)   → 1-2 页 : 金句 / 悬念问题 / 行动建议
```

叙事弧 + 页数规划 + 主题节奏表(见 `layouts.md`),**三张表对齐后**再进 Step 2。

大纲建议保存为 `项目记录.md` 或 `大纲-v1.md`,便于后续迭代。

#### 图片约定(告知用户)

在动手前向用户说清:

- **文件夹位置**:`项目/XXX/ppt/images/` 下(和 `index.html` 同级)
- **命名规范**:`{页号}-{语义}.{ext}`,例如 `01-cover.jpg` / `03-figma.jpg` / `05-dashboard.png`
  - 页号补零便于排序
  - 语义用英文,短、具体、和内容对应
- **规格建议**:
  - 单张 ≥ 1600px 宽(避免大屏模糊)
  - JPG 用于照片/截图,PNG 用于透明 UI/图表
  - 总大小控制在 10MB 内(影响翻页流畅度)
- **如何替换**:保持**同名覆盖**最稳(HTML 里不用改路径);如果文件名变了,记得全局搜 `images/旧名` 改成新名
- **没图怎么办**:和用户对齐,可以先用占位色块生成结构,等图片后期补;但要告知 layout 4/5/10 等图文混排页没图就没法验证视觉效果

### Step 2 · 拷贝模板

从 `assets/template.html` 拷贝一份到目标位置（通常是 `项目/XXX/ppt/index.html`），同时在同级建一个 `images/` 文件夹准备接图片。

```bash
mkdir -p "项目/XXX/ppt/images"
cp "<SKILL_ROOT>/assets/template.html" "项目/XXX/ppt/index.html"
```

`template.html` 是一个**完整可运行**的文件——CSS、WebGL shader、翻页 JS、字体/图标 CDN 全已预设好，只有 `<main id="deck">` 里面是 3 个示例 slide（封面、章节幕封、空白填充页）。

#### 2.1 · 必改占位符（**容易漏**）

拷贝后立刻改掉以下占位符，否则浏览器 Tab 会显示"[必填] 替换为 PPT 标题"这种尴尬文字：

| 位置 | 原始 | 需改为 |
|------|------|--------|
| `<title>` | `[必填] 替换为 PPT 标题 · Deck Title` | 实际 deck 标题(如 `一种新的工作方式 · Luke Wroblewski`) |

每次拷贝完 template.html 第一件事:grep 一下"[必填]" 确认全部替换完。

#### 2.2 · 选定主题色(5 套预设 · 不允许自定义)

本 skill **只允许从 5 套精心调配的预设里选一套**,不接受用户自定义 hex 值——颜色搭配错了画面瞬间变丑,保护美学比给自由更重要。

| # | 主题 | 适合 |
|---|------|------|
| 1 | 🖋 墨水经典 | 通用 / 商业发布 / 不知道选啥的默认 |
| 2 | 🌊 靛蓝瓷 | 科技 / 研究 / 数据 / 技术发布会 |
| 3 | 🌿 森林墨 | 自然 / 可持续 / 文化 / 非虚构 |
| 4 | 🍂 牛皮纸 | 怀旧 / 人文 / 文学 / 独立杂志 |
| 5 | 🌙 沙丘 | 艺术 / 设计 / 创意 / 画廊 |

**操作**:
1. 基于内容主题推荐一套,或直接问用户选哪一套
2. 打开 `references/themes.md`,找到对应主题的 `:root` 块
3. **整体替换** `assets/template.html`(已拷贝版本)开头 `:root{` 块里标有"主题色"注释的那几行(`--ink` / `--ink-rgb` / `--paper` / `--paper-rgb` / `--paper-tint` / `--ink-tint`)
4. 其他 CSS 都走 `var(--...)`,无需任何其他改动

**硬规则**:
- 一份 deck 只用一套主题,不要中途换色
- 不要接受用户给的任意 hex 值——委婉拒绝并展示 5 套让选
- 不要混搭(例如 ink 取墨水经典、paper 取沙丘)——会彻底违和

### Step 3 · 填充内容

#### 3.0 · 预检:类名必须在 template.html 里有定义（**最重要**）

**这是所有生成问题的源头**。layouts.md 的骨架使用了很多类名(`h-hero` / `h-xl` / `stat-card` / `pipeline` / `grid-2-7-5` 等),如果 `assets/template.html` 的 `<style>` 里没有对应定义,浏览器会 fallback 到默认样式——大标题变成非衬线、数据卡片挤成一团、pipeline 糊成一行、图片堆到页面底部。

**在写任何 slide 代码之前:**

1. **先 Read `assets/template.html`**(至少读到 `<style>` 块末尾)
2. **对照 layouts.md 的 Pre-flight 列表**,确认你要用的每个类都在 `<style>` 里存在
3. 如果某个类缺失:**在 template.html 的 `<style>` 里补上**,不要在每个 slide 里 inline 重写
4. **template.html 是唯一的类名来源**——不要发明新类名,如需自定义用 `style="..."` inline

常见容易遗漏的类(必须预先确认存在):
`h-hero` / `h-xl` / `h-sub` / `h-md` / `lead` / `kicker` / `meta-row` / `stat-card` / `stat-label` / `stat-nb` / `stat-unit` / `stat-note` / `pipeline-section` / `pipeline-label` / `pipeline` / `step` / `step-nb` / `step-title` / `step-desc` / `grid-2-7-5` / `grid-2-6-6` / `grid-2-8-4` / `grid-3-3` / `grid-6` / `grid-3` / `grid-4` / `frame` / `frame-img` / `img-cap` / `callout` / `callout-src` / `chrome` / `foot`

#### 3.0.5 · 规划主题节奏（**和类预检同等重要**)

**在挑布局之前**,必须先列出每一页的主题 class(`hero dark` / `hero light` / `light` / `dark`)并写到文档或草稿里对齐。详细规则看 `references/layouts.md` 开头的"主题节奏规划"一节。

**强制规则**:

- 每页 section 必须带 `light` / `dark` / `hero light` / `hero dark` 之一,不要只写 `hero`
- 连续 3 页以上同主题 = 视觉疲劳,不允许
- 8 页以上必须有 ≥1 个 `hero dark` + ≥1 个 `hero light`
- 整个 deck 不能只有 `light` 正文页,必须有 `dark` 正文页制造呼吸
- 每 3-4 页插入 1 个 hero 页(封面/幕封/问题/大引用)

**生成后自检**:`grep 'class="slide' index.html` 列出所有主题,人工确认节奏合理再交付。

#### 3.1 · 挑布局

**不要从零写 slide**。打开 `references/layouts.md`,里面有 10 种现成布局骨架,每种都是完整可粘贴的 `<section>` 代码块:

| Layout | 用途 |
|---|---|
| 1. 开场封面 | 第 1 页 |
| 2. 章节幕封 | 每幕开场 |
| 3. 数据大字报 | 抛硬数据 |
| 4. 左文右图(Quote + Image) | 身份反差 / 故事 |
| 5. 图片网格 | 多图对比 / 截图实证 |
| 6. 两列流水线(Pipeline) | 工作流程 |
| 7. 悬念收束 / 问题页 | 幕末 / 收尾 |
| 8. 大引用页(Big Quote) | 衬线金句 / takeaway |
| 9. 并列对比(Before / After) | 旧模式 vs 新模式 |
| 10. 图文混排(Lead Image + Side Text) | 信息密集的图文页 |

选对应 layout,粘过去,改文案和图片路径即可。**务必先完成 3.0 预检**。

#### 3.2 · 图片比例规范

永远用**标准比例**,不要用原图奇葩比例(如 `2592/1798`):

| 场景 | 推荐比例 |
|------|---------|
| 左文右图 主图 | 16:10 或 4:3 + `max-height:56vh` |
| 图片网格(多图对比) | **固定 `height:26vh`**,不用 aspect-ratio |
| 左小图 + 右文字 | 1:1 或 3:2 |
| 全屏主视觉 | 16:9 + `max-height:64vh` |
| 图文混排小插图 | 3:2 或 3:4 |

**图片绝不使用 `align-self:end`**——会滑到 cell 底被浏览器工具栏遮挡。用 grid 容器 + `align-items:start`(template 已预设)让图片贴顶即可;左列若想贴底,用 flex column + `justify-content:space-between`。

组件细节(字体、颜色、网格、图标、callout、stat-card 等)在 `references/components.md`。

### Step 4 · 对照检查清单自检

生成完一定要打开 `references/checklist.md`，逐项对照。里面总结了**真实迭代过程中踩过的所有坑**，P0 级别的问题（emoji、图片撑破、标题换行、字体分工）必须全部通过。

特别要注意的几条：

1. **大标题必须是衬线字体**——如果显示成非衬线,99% 是 Step 3.0 预检没做,`h-hero` 类在 template.html 里缺失
2. **图片网格里只用 `height:Nvh`,不用 `aspect-ratio`**(会撑破)
3. **图片不能堆到页面底部**——不要用 `align-self:end`,用 grid + `align-items:start`(见 Step 3.2)
4. **图片只能用标准比例**(16:10 / 4:3 / 3:2 / 1:1 / 16:9),不要复制原图的奇葩比例
5. **中文大标题 ≤ 5 字且 `nowrap`**(避免 1 字 1 行)
6. **用 Lucide,不用 emoji**
7. **标题用衬线,正文用非衬线,元数据用等宽**

### Step 5 · 本地预览

直接在浏览器打开 `index.html` 就行。macOS 下：

```bash
open "项目/XXX/ppt/index.html"
```

不需要本地服务器。图片走相对路径 `images/xxx.png`。

### Step 6 · 迭代

根据用户反馈修改——模板的 CSS 已经高度参数化，90% 的调整都是改 inline style（字号 `font-size:Xvw` / 高度 `height:Yvh` / 间距 `gap:Zvh`）。

---

## 资源文件导览

```
magazine-web-ppt/
├── SKILL.md              ← 你正在读
├── assets/
│   ├── template.html     ← 完整的可运行模板（种子文件）
│   └── example-slides.html ← 9 页样例 deck（用于 Examples 预览）
└── references/
    ├── styles.md         ← 5 个 magazine 方向（Monocle / WIRED / Kinfolk / Domus / Lab）
    ├── components.md     ← 组件手册（字体、色、网格、图标、callout、stat、pipeline...）
    ├── layouts.md        ← 10 种页面布局骨架（可直接粘贴）
    ├── themes.md         ← 5 套主题色预设（只能选不能自定义）
    └── checklist.md      ← 质量检查清单（P0/P1/P2/P3 分级）
```

**加载顺序建议**：
1. 先读完 `SKILL.md`(这个文件)了解整体
2. **Step 0 选方向时,读 `styles.md`**——5 个方向各自打包好了主题色 + 推荐 layout + chrome 风格
3. Step 1 需求澄清完成后,如果方向需要确认,再读 `themes.md` 看色板细节
4. **动手前 Read `assets/template.html` 的 `<style>` 块**——这是类名的唯一来源,缺类会导致整页样式崩
5. 读 `layouts.md` 挑布局(顶部有 Pre-flight 类名清单和主题节奏规划)
6. 细节调整时读 `components.md` 查组件
7. 生成后读 `checklist.md` 自检(顶部 P0-0 规则强制预检)

## 核心设计原则（哲学）

> 这些原则是"一人公司"分享 PPT 的 5 轮迭代总结出来的。违反其中任何一条，视觉感都会垮。

1. **克制优于炫技** — WebGL 背景只在 hero 页透出，普通页几乎看不见
2. **结构优于装饰** — 不用阴影、不用浮动卡片、不用 padding box，一切信息靠**大字号 + 字体对比 + 网格留白**
3. **内容层级由字号和字体共同定义** — 最大衬线 = 主标题，中衬线 = 副标，大非衬线 = lead，小非衬线 = body，等宽 = 元数据
4. **图片是第一公民** — 图片只裁底部，保证顶部和左右完整；网格用 `height:Nvh` 固定，不要用 `aspect-ratio` 撑
5. **节奏靠 hero 页** — hero 和 non-hero 交替，才不累眼睛
6. **术语统一** — Skills 就是 Skills，不要中英混合翻译

## 参考作品

本 skill 的视觉基调参考了：

- 歸藏 "一人公司：被 AI 折叠的组织" 分享（2026-04-22，27 页）
- *Monocle* 杂志的版式
- YC 总裁 Garry Tan "Thin Harness, Fat Skills" 那篇博客的 demo

可以把它们当做风格锚点。
