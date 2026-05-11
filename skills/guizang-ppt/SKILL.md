---
name: ppt-business-deck
description: 生成商务风格 PPT 演示文稿（单 HTML 文件），纯白背景 + 精致排版，标准演示字体（微软雅黑/苹方/Segoe UI/Arial）。适用于汇报、路演、产品发布等正式场景。
triggers:
  - "ppt"
  - "deck"
  - "slides"
  - "presentation"
  - "slides"
  - "网页 PPT"
  - "发布会"
  - "分享 PPT"
  - "汇报"
  - "路演"
od:
  mode: deck
  scenario: business
  featured: 9
  default_for: deck
  upstream: "https://github.com/op7418/guizang-ppt-skill"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "帮我做一份商务 PPT —— 关于'AI 赋能数字化转型'，25 分钟分享会，目标受众是企业高管。"
---

# PPT 商务演示

## 这个 Skill 做什么

生成一份**单文件 HTML**的横向翻页 PPT，视觉基调是：

- **纯白背景 + 深灰文字** — 所有页面统一白底，禁止深色背景、禁止黑白交替。文字用深灰（非纯黑），视觉更柔和
- **标准演示字体** — 标题用黑体（PingFang SC Bold / Microsoft YaHei Bold / Segoe UI Bold），正文用常规体（PingFang SC / Microsoft YaHei / Segoe UI），全部为系统字体
- **精致商务布局** — 标题 + 要点 + 数据图表 + 高级组件（时间轴、进度条、渐变卡片、环形指标等），信息密度适中，适合投影演示
- **横向翻页**（键盘 ← →、滚轮、触屏滑动、底部圆点）
- **无 WebGL / 无动画背景** — 投影环境下动画背景会降低可读性

这个 skill 的美学是**精致商务演示**（McKinsey / BCG 咨询报告级别），不是"电子杂志"、不是"消费互联网 UI"。在保证纯白背景和可读性的前提下，尽可能使用丰富的视觉元素：微渐变卡片、时间轴、数据大字报、大引用金句、环形指标、编号步骤、图标网格等。

**所有字体必须使用系统字体，不导入 Google Fonts，不使用 WebFont。**

## 核心约束（违反任何一条都会导致输出不合格）

### 背景约束
- **所有页面必须是纯白背景**（`#ffffff` 或 `oklch(100% 0 0)`）
- **禁止深色背景页** — 不允许 `dark` / `hero dark` 主题
- **禁止黑白交替** — 不允许某些页白底某些页黑底
- **页面背景纯白** — 不使用全页渐变/图案/深色背景
- **封面页例外**：允许使用高质量 Unsplash 照片作为封面背景，必须叠加半透明遮罩（`rgba(var(--accent-rgb), .85)`）确保文字可读。其他页面不做背景图

### 字体约束
- **标题**：PingFang SC / Microsoft YaHei / Segoe UI（sans-serif 黑体）
- **正文**：PingFang SC / Microsoft YaHei / Segoe UI（sans-serif 常规体）
- **数字/代码**：Menlo / Consolas / ui-monospace
- **禁止衬线字体作为标题** — Georgia / Times / Noto Serif / Playfair 一律不使用
- **禁止 Google Fonts** — 不加载任何 WebFont

### 颜色约束

**文字颜色层级**（PPT 导出无损，所有颜色均可安全使用）：
- 主文字：`#1a1a1a` ~ `#333333`（深灰，不是纯黑 — 视觉更柔和）
- 次级文字：`#475569` ~ `#64748B`（Slate 灰，用于副标题/标注）
- 辅助文字：`#94A3B8`（浅灰，仅用于脚注/来源等非关键信息）
- **强调色（accent）**：从 brief/品牌中提取，或用深蓝 `#0a1f3d`，全 deck 统一一个主强调色
- **辅助强调色**：可引入一个辅助色（如成功绿 `#059669`、警告橙 `#D97706`），用于正/负指标标记（Before-After 对比、涨跌标识等）
- **禁止紫色** — AI-slop 最常见的错误
- **渐变规则**：允许局部微渐变（卡片/按钮/装饰元素），禁止全页渐变背景
- **图表颜色**：数据系列使用同色系的深度变化（如 accent 的 100%/70%/40% 透明度），不用彩虹色

### 图表与图片（PPT 导出专用）
- **数据图表用 HTML Canvas 绘制** — 不用 CSS 条形图、不用内联 SVG。Canvas 在 PDF→PPTX 管线中以 600 DPI 渲染为清晰位图，零失真。
- **图表配色必须读取 `:root` 中的 `--bg` / `--fg` / `--accent` 变量**，用这些值做填充、轴线、标签。
- **图表要精致**：加网格线、轴标签、数据值标注、圆角柱状、平滑曲线。不要扁平简陋的图表。
- **非图表图片（照片、截图）**：用 `<img>` 标签，固定标准比例（16:10 / 4:3 / 3:2 / 1:1 / 16:9），加微边框。图片要融合到 PPT 布局中，不是浮在表面。
- **封面/章节页的背景图**：用高质量 Unsplash 照片，URL 必须是 HTTPS。
- **禁止用 emoji 作图标** — 用 Lucide 图标或纯文字。

### 布局约束
- 每页一个核心信息，不要信息过载
- 标题字号 ≥ 36px（投影可读）
- 正文字号 ≥ 18px
- 留白充足，不要塞满内容
- 数据用表格/数字突出，不用装饰性元素
- **高级组件优先使用 template.html 已有类**（gradient-card、timeline、icon-grid、big-quote、progress-bar、ring-stat 等）
- **禁止 animation / transition / @keyframes** — PPT 导出为静态 PDF/PPTX，动态效果会丢失
- **禁止 backdrop-filter** — PDF 渲染不支持

## 何时使用

**合适的场景**：
- 企业汇报 / 路演 / 融资 BP
- 产品发布会 / 技术分享
- 内部培训 / 会议演示
- 需要正式、专业、可投影的演示文稿

**不合适的场景**：
- 个人作品集 / 艺术展示（用 editorial 风格）
- 创意营销页面（用 landing page skill）
- 需要强烈视觉冲击的创意 deck

## 工作流

### Step 0 · 选方向

**在问澄清问题之前，先让用户在 5 个商务方向里挑一个**：

```
1. 深蓝商务 · 专业稳重 ✦ 默认（适合汇报/路演/融资）
2. 极简商务 · 干净利落（适合科技/互联网产品）
3. 暖色商务 · 亲和友好（适合教育/医疗/消费品牌）
4. 活力商务 · 年轻有冲劲（适合创业/营销/增长）
```

如果用户说"不知道，你推荐"——**默认推深蓝商务**。挑完方向后，在项目目录下创建或更新 `项目记录.md`，写清方向 + 主题色 + 受众 + 时长。

### Step 1 · 需求澄清

**如果用户已经给了完整的大纲 + 素材**，可以跳过直接进 Step 2。

**如果用户只给了主题或一个模糊想法**，用这些问题对齐后再动手：

| # | 问题 | 为什么要问 |
|---|------|-----------|
| 1 | **受众是谁？分享场景？** | 决定语言风格和深度 |
| 2 | **分享时长？** | 15 分钟 ≈ 10 页，25 分钟 ≈ 15-20 页 |
| 3 | **有没有原始素材？**（文档/数据/旧 PPT） | 有素材就基于素材 |
| 4 | **有没有品牌规范？**（logo/配色/字体） | 有品牌就遵循品牌 |
| 5 | **有没有硬约束？** | 避免返工 |

#### 大纲协助

用"叙事弧"模板搭骨架：

```
开场(Hook)       → 1 页   : 抛一个反差/问题/硬数据
背景(Context)    → 1-2 页 : 说明背景/你是谁/为什么讲
主体(Core)       → 3-5 页 : 核心内容，用数据/图表支撑
方案(Solution)   → 1-2 页 : 你的方案/产品/策略
收尾(Takeaway)   → 1 页   : 金句/行动建议/联系方式
```

### Step 2 · 拷贝模板

从 `assets/template.html` 拷贝一份到目标位置：

```bash
cp "<SKILL_ROOT>/assets/template.html" "项目/XXX/ppt/index.html"
```

#### 2.1 · 必改占位符

拷贝后立刻改掉 `[必填]` 占位符。

#### 2.2 · 绑定方向主题色

打开 `references/themes.md`，找到对应方向的 `:root` 块，整体替换 `index.html` 开头的 `:root` 色值。

**硬规则**：一份 deck 只用一套主题色，不要中途换色。

### Step 3 · 填充内容

#### 3.0 · 预检

在写任何 slide 代码之前：
1. 先 Read `assets/template.html` 的 `<style>` 块
2. 确认你要用的每个类都在 `<style>` 里存在
3. 缺失则在 template.html 补上
4. **不要发明新类名**

#### 3.1 · 挑布局

打开 `references/layouts.md`，里面有现成布局骨架，直接粘贴改文案。

### Step 3.2 · 逐页填充（一页一页写，不要一次性写所有页）

**强制规则：每次只创建一个 TodoWrite 项目，写完一页再创建下一个。**

禁止一次性创建多个 TodoWrite 项目（会导致上下文爆炸 → 超时卡死）。

#### 逐页续写模式（daemon 自动触发）

当 daemon 通过 `POST /api/projects/:id/deck/generate-next` 触发新的一页生成时：

- **不需要**重新 Read template.html — 你已经在第一次运行时读过并拷贝了骨架
- **不需要**重新 Read layouts.md — 布局知识已经在你的上下文中
- **不需要**做 TodoWrite — daemon 已经告诉你写哪一页
- **只需要**：Read 当前 index.html → 找到插入位置 → Write 插入新 slide → STOP

这能节省大量上下文预算，避免"显卡"（上下文溢出）。

### Step 4 · 自检

生成完打开 `references/checklist.md` 逐项对照。

### Step 5 · 本地预览

```bash
open "项目/XXX/ppt/index.html"
```

### Step 6 · 迭代

根据用户反馈修改——模板的 CSS 已经高度参数化，90% 的调整都是改 inline style。

---

## 资源文件导览

```
ppt-business-deck/
├── SKILL.md              ← 你正在读
├── assets/
│   └── template.html     ← 完整的可运行模板（种子文件）
└── references/
    ├── themes.md         ← 5 套商务主题色预设
    ├── layouts.md        ← 页面布局骨架
    └── checklist.md      ← 质量检查清单
```

## 核心设计原则

1. **白底深灰** — 所有页面纯白背景，深灰文字（非纯黑），封面页可用高质量照片 + accent 遮罩
2. **视觉丰富** — 在纯白底色上，充分使用渐变卡片、时间轴、环形指标、大引用、编号步骤、图标网格等高级组件
3. **字体层级** — 标题粗体大字号，正文常规体，数字等宽
4. **一色贯穿** — 全 deck 只用一个 accent 色（品牌色或深蓝色），渐变从 accent 出发
5. **留白呼吸** — 不塞满内容，留白是商务 PPT 的奢侈品
6. **数据说话** — 用数字/图表/对比说话，精致而非花哨

## 参考作品

- McKinsey / BCG 咨询报告 PPT
- Apple Keynote 产品发布会
- 阿里巴巴/腾讯年度财报演示
