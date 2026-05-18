# 杂志级组件手册 (Editorial Components for Phantom Motion)

本手册定义了汲取自《Monocle》杂志美学的核心 UI 组件。生成动态动画时，**必须**优先采用这些组件模式。

---

## 字体 Typography

字体分工是本系统最重要的规则，**严禁混用**。

| Class | 用途 | 字体 |
|---|---|---|
| `.h-hero` | 巨幕标题 | Playfair Display 700, min(10vw,17vh) |
| `.h-xl` | 章节标题 | Noto Serif SC 700, min(7vw,12vh) |
| `.h-sub` | 副标题 | Noto Serif SC 600, 2.5rem |
| `.h-md` | 中号标题 | Noto Serif SC 500, 1.9vw |
| `.lead` | 引导段 | Noto Serif SC 400, 1.25rem, line-height:2.2 |
| `.kicker` | 钩子短句 | IBM Plex Mono, 0.75rem, uppercase, letter-spacing:5px |
| `.meta-row` | 元数据行 | IBM Plex Mono, 0.6rem, 灰色 |

**核心规则**：
- **衬线**：标题、重点金句、数字 → "视觉重音"
- **非衬线**：正文描述、大段阅读 → "信息密度"
- **等宽**：kicker、meta、foot → "装饰节奏"

**强调技巧**：
- `<em class="en">英文词</em>` → Playfair Display 斜体
- `<em style="opacity:.65">短语</em>` → 标题后半段淡出，制造节奏

---

## Chrome & Foot（杂志页眉页脚）

每页的顶部和底部的元信息条。几乎所有页都应保留。

```html
<div class="chrome">
  <div class="left">
    <span>第一幕 · 硬数据</span>
    <span class="sep"></span>
    <span>Act I</span>
  </div>
  <div class="right"><span>02 / 27</span></div>
</div>

<div class="foot">
  <div class="title">项目名 · CodePilot　|　github.com/codepilot</div>
  <div>Act I · Dev Numbers</div>
</div>
```

**规则**：
- `chrome.right` 放页码 `NN / TOTAL`
- chrome 和 foot 共同构成杂志感的"页眉页脚"
- chrome ≠ kicker（chrome 是栏目标签，kicker 是本页钩子）

---

## Callout 引用框

展示金句 / 关键观点 / 他人引言。

```html
<div class="callout" style="max-width:80vw">
  <div class="q-big">"这东西在三年前，<br>需要一个十人团队做一年。"</div>
  <span class="callout-src">— 一个观察者的判断</span>
</div>
```

**变体**：
- 不带来源：去掉 `.callout-src`
- 在 hero 页使用：外层加 `position:relative;z-index:2`（避免被 WebGL 遮罩盖住）

---

## Stat 数字矩阵

展示数据指标。三段式结构：label（英文等宽小标签）→ nb（巨型数字）→ note（注释）。

```html
<div class="stat-card">
  <div class="stat-label">Duration</div>
  <div class="stat-nb">64 <span class="stat-unit">天</span></div>
  <div class="stat-note">从 0 到现在</div>
</div>
```

**数字后单位**用 `<span class="stat-unit">` 缩小到 0.4em，opacity 0.5。

**常用布局容器**：
- `.grid-6`：3×2 网格（6 个 stat）
- `.grid-4`：2×2 网格（4 个 stat）
- `.grid-3`：3 等分单行

---

## Figure 图片框

**最容易踩坑的组件**，务必遵守规则。

```html
<figure class="frame-img" style="height:26vh">
  <img src="images/xxx.png" alt="说明">
  <figcaption class="img-cap">平台 · 数据</figcaption>
</figure>
```

### 关键约束

1. **图片网格必须用 `height:Nvh` 固定高度**，不要用 `aspect-ratio`
2. **`object-position:top center`**，只裁底部
3. **网格里多张图用 inline grid**：`grid-template-columns:1fr 1fr 1fr; gap:1vh 1.2vw`
4. **图片与布局顶对齐**：用 `align-items:start`，不要 `align-self:end`
5. **信息图/截图**：加 `.fit-contain`，避免文字被裁切
6. **标准比例**：16:9 / 16:10 / 4:3 / 3:2 / 1:1

---

## Ghost 巨型背景字

用作"装饰性背景字"，极低透明度。

```html
<div class="ghost" style="right:-6vw;top:-8vh">BUT</div>
```

- 字号 34vw，opacity 0.06
- 内容：英文单词或数字（章节序号 01/02/03、关键词 BUT/NOW/HERE）
- 使用 ghost 的页面里，其他内容要加 `position:relative;z-index:2`

---

## Highlight 荧光标记

行内短语的"荧光笔"效果：

```html
<span class="hi">关键词</span>
```

在文字底部生成半透明高亮条。只对 1-3 个词使用，不要大面积用。

---

## Tag & Kicker

**Kicker** 是标题上方的小提示（等宽、全大写、小字号）：
```html
<div class="kicker">过去 64 天 · 开发篇</div>
<div class="h-xl">一个人，做了什么。</div>
```

**Tag** 是独立标签胶囊（带边框）：
```html
<div style="display:flex;gap:1.6vw;flex-wrap:wrap">
  <div class="tag">标签一</div>
  <div class="tag">标签二</div>
</div>
```

---

## Icons 图标

**严禁使用 emoji**。用 Lucide 图标：

```html
<i data-lucide="compass" class="ico-lg"></i>   <!-- 大图标 -->
<i data-lucide="target" class="ico-md"></i>    <!-- 中图标 -->
<i data-lucide="check-circle" class="ico-sm"></i> <!-- 小图标 -->
```

**常用图标**：
- 判断类：`compass`, `target`, `crosshair`
- 关系类：`share-2`, `users`, `network`, `link`
- 品牌类：`crown`, `gem`, `award`, `star`
- 流程类：`workflow`, `route`, `arrow-right-left`
- 数据类：`grid-2x2`, `bar-chart-3`, `trending-up`
- 审美类：`palette`, `brush`, `eye`, `sparkles`

---

## 核心设计原则（哲学）

> 违反其中任何一条，杂志感都会垮。

1. **克制优于炫技** — WebGL 背景只在 hero 页透出，普通页几乎不可见
2. **结构优于装饰** — 不用阴影、不用浮动卡片，一切信息靠**大字号 + 字体对比 + 网格留白**
3. **内容层级由字号和字体共同定义** — 最大衬线=主标题，中衬线=副标，大非衬线=lead，小非衬线=body，等宽=元数据
4. **图片是第一公民** — 只裁底部，高度固定，标准比例
5. **节奏靠 hero 页** — hero 和 non-hero 交替，才不累眼睛
