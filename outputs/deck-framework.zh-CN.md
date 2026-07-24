# Deck 框架注入规范——中文译本

> 原文来源：`packages/contracts/src/prompts/deck-framework.ts`
> 对应渲染：`renderDeckFrameworkDirective('filesystem')`
> 版本快照：2026-07-24，当前 `codex/system-prompt-optimization` 工作区。
> 范围说明：本文是旧版 V1 Deck framework directive 的完整内容，仅保留给 `current` 和 `current_outcome` 实验／回滚变体，已不再是生产默认规范。当当前 Deck Skill 已提供 `assets/template.html` seed 时，运行时为了避免两套 framework 冲突，不会再叠加通用 directive；该 Skill 自身的 `SKILL.md` 及其引用资源属于另一层上下文。
> 翻译原则：按中文技术写作习惯表达；代码块、类名、命令、字段、数值和占位符保持原样。

# 幻灯片 Deck——固定框架（Deck 模式下不可协商）

如果模型每轮都重新编写缩放适配逻辑、键盘处理器、页面显隐切换、页码计数器和打印规则，Deck 就会逐轮退化。用户已经多次遇到这类问题，因此我们提供一套内置的**固定框架**：1920×1080 画布、等比缩放适配、隐藏的程序化前后翻页与计数器、捕获阶段键盘监听、按 R 回到第一页、点击页面左右半区翻页、通过 localStorage 恢复阅读位置，以及在“另存为 PDF”时生成纵向多页 PDF 的打印样式。

**这些能力不需要你编写，也不允许你修改。** 你的职责只有一个：填充内容插槽。

## 工作流程——先复制框架，再填充内容

用户要求制作幻灯片时，TodoWrite 计划在任何内容步骤之前，**必须**从“原样复制 Deck 框架”开始。正确顺序如下：

```
1.  将当前视觉方向的配色和字体绑定到框架的 :root
2.  将下方 canonical skeleton 原样复制为语义明确的 Deck HTML 文件，例如 `investor-pitch-deck.html`（在此之前不要做其他事情）
3.  规划整套 Deck 的页面叙事和表面层级（写页面前，明确说出主表面，以及每个反转页面的叙事职责）
4.  在第二个 <style> 块中添加当前 Deck 专属的类
5.  将每个 <section class="slide"> SLOT 替换为真实内容
6.  自检（不得重写框架控件、@media print 或导航脚本）
7.  用一条简短的普通助手消息，总结已经写入或修改的 Deck 文件
```

如果你发现自己正在为 `.deck-shell`、`.deck-stage`、`.slide`、`.canvas`、`fit()`、`@media print` 或键盘处理器编写 `<style>` 规则——立即停止。框架已经提供了这些能力。重新阅读本规范，然后从“填充 SLOT 内容”继续。

## 框架契约

新建 Deck 时，最终产物应是一个名称具有明确语义的 HTML 文件，并且必须基于下方 canonical skeleton 构建。**原样复制整个 skeleton**，包括第一个 `<style>` 块、`.deck-shell` / `.deck-stage`、隐藏的 `.deck-counter` / `.deck-hint` 程序化控件，以及末尾完整的 `<script>`。不要把所有 Deck 都命名为 `index.html`；只有当用户正在修改已有的 `index.html` Deck，或固定运行时约定要求该路径时，才使用 `index.html`。

你只能编辑标有 `SLOT:` 的位置：

- `SLOT: deck title`——`<title>` 元素。
- `SLOT: theme tokens`——`:root` 中的 CSS 自定义属性（`--bg`、`--fg`、`--accent`、`--shell` 等）。如有需要，可在这里增加新的 token。
- `SLOT: per-deck styles`——第二个 `<style>` 块。在这里定义页面内容需要使用的类，例如 `.title`、`.big-stat`、`.grid-3` 或自定义排版类。**绝不能重新定义** `.deck-shell`、`.deck-stage`、`.slide`、`.deck-counter`、`.deck-hint`，也不能修改 `@media print` 中的任何内容。
- `SLOT: slides`——所有 `<section class="slide">` 块。根据 brief 添加所需数量的页面。第一页必须是 `<section class="slide active" …>`；其余页面使用 `<section class="slide" …>`，不得包含 `active`。脚本会自动统计页数。
- `SLOT: slide N content`——每个 `<section>` 内部的内容。

## 表面层级——叙事优先

除非用户或当前设计系统明确要求另一套表面编排，否则应从当前品牌或视觉方向中选择一个主表面。连续页面可以使用相同表面。只有当反转表面承担明确的叙事职责时才使用它，例如章节切换、关键揭示、证据强调或收尾。整套 Deck 只使用一个表面也是合理的；绝不能按页码或数量配额机械交替浅色与深色。改变背景之前，优先通过布局、尺度、密度、图片和排版建立节奏。

## 常见漂移方式——禁止这样做

下面这些都是已经反复排查过的失败模式。它们看起来“效果等价”，但每一种都会破坏特定能力：

- ❌ 不要自行编写 `fit()` 函数或 `transform: scale()` 脚本。框架已经实现；临时重写的版本会在 OD 查看器的嵌套 transform 容器中发生偏移。
- ❌ 不要在 stage 上使用 `transform-origin: center center`。框架使用 `top left` 配合显式位移，确保缩放后的内容每次都落在同一位置。
- ❌ 不要只使用 `document.addEventListener('keydown', …)`。在 iframe 中，焦点有时位于 window。框架在**两个**目标上都注册了捕获阶段监听；替换成单一监听会导致方向键偶发失效。
- ❌ 不要替换 localStorage key、页面显隐规则（`.slide.active`）或计数器元素 ID（`#deck-cur`、`#deck-total`、`#deck-prev`、`#deck-next`）。框架通过这些 ID 读取对应元素。
- ❌ 不要把前后翻页按钮或计数器放进 `.deck-stage`。它们必须位于缩放元素之外，这样宿主 bridge 才能管理页面，同时避免控件被缩放或裁切。
- ❌ 不要直接重新定义 `.slide`、`.slide.active` 或 `.slide:not(.active)`。框架通过这些精确选择器控制显隐。如果某一页需要非 flex 布局，**请在同一个 `<section class="slide …">` 元素上增加变体类**，例如 `.s-cold`、`.s-magazine`，然后在变体上声明 `display: grid` 或 `display: block`。框架的 active 默认样式包裹在 `:where(...)` 中，specificity 为零，因此你的变体会在当前页生效。变体类不需要比 `.slide.active` 具有更高 specificity。（非当前页的隐藏规则仍会生效，因为它使用了 `:not(.active) { display: none !important; }`。）
- ❌ 不要删除或“整理” `@media print` 块。“分享 → PDF”依靠它把所有页面拼接成多页文档。缺少它时，PDF 导出会退化成单张截图。

## 为什么这很重要（用于判断边界情况）

这套框架是 Deck 与宿主查看器之间的契约。OD iframe 位于经过 transform 的缩放容器中；键盘处理器需要捕获阶段和双目标监听；“分享 → PDF”依赖打印样式；阅读位置通过 localStorage 跨刷新保留。如果某一轮重写了其中任何一项——即使代码看起来“等价”——下一轮就会继续偏离；三轮之后，Deck 往往已经悄悄出现导航异常和 PDF 只导出一页的问题。应把这套框架视为承重基础设施。

如果用户需要框架确实不支持的能力，例如纵向 Deck、自定义页面过渡或同时显示多列页面，应先说明限制并询问用户，再决定是否派生新框架。**默认处理方式：保留框架，只修改页面内容。**

## 单页规范

每个 `<section class="slide" data-screen-label="NN Title">` 代表一页，渲染在 1920×1080 画布上。在 `<section>` 内部，使用你在 `SLOT: per-deck styles` 中定义的类组织内容。页面标签从 1 开始编号，例如 `01 Title`、`02 Problem`。第一页使用 `class="slide active"`；其他页面只使用 `class="slide"`。

只能使用真实文案：不要使用 lorem ipsum，不要编造指标，不要生成通用 emoji 图标列表。如果缺少真实数值，应留下简短、诚实的占位内容。

## 密度与溢出纪律（丑陋 Deck 的第一大来源）

即使页面显隐逻辑正确，只要内容超出 1920×1080 画布，Deck 仍然会失控。当前常见的具体失败模式包括：

- ❌ 标题页同时使用 ≥ 160px 的展示型标题、多行副标题或 Deck 说明，并在 `bottom: ~56px` 放置绝对定位的 `.footer`。文档流内容持续向下增长，而绝对定位 footer 占据底部区域，二者最终会在页面底部约 100px 的范围内碰撞。
- ❌ 数据页同时放入三个数字、三个说明和一个 footer。应拆成三个数据页；框架会自动统计页数，增加页面没有额外成本。
- ❌ 尝试在一个 1080px 页面中塞入 masthead、展示型标题、正文网格、侧栏和绝对定位 footer，做成所谓“杂志跨页”。

以下规则不可协商：

1. **封面或标题页的展示型标题：字号最大约 140px，最多 8 个词，最多 3 行。** 如果标题无法放进这个范围，说明页面结构选择错误——应拆页，而不是缩小字体后继续塞入更多内容。
2. **为 footer 预留安全区。** 如果使用 `.footer { position: absolute; bottom: Npx; }`，footer 上方的文档流内容必须至少在 `1080 − footer_height − N` 之前 80px 停止。实际执行时，不要让文档流内容进入页面底部 200px。最简单的约束方式，是把主要内容放入独立的 `<div style="height: 760px;">`（或使用 `max-height`），再把 footer 绝对定位到其下方。
3. **正文页：最多 3 段；lead 文本宽度最多 56ch；每行最多 12 个词。**
4. **一页只表达一个 idea。** 两个 idea 就拆成两页。

## 数据图表纪律（手写柱状图）

手写的 div/CSS 图表通常会以两种方式让用户觉得“图表在说谎”：一是凭感觉写魔法数字，导致柱长与数据不匹配；二是把数值标签放进固定高度的柱体中，最终被裁切。如果当前模板家族提供了图表参考，例如 `html-ppt` 家族的 Chart.js `chart-bar.html` 模板，应优先使用它，而不是手写 div 图表。确实需要手写横向或纵向柱状图时，应基于以下 skeleton：

```html
<div class="chart" style="--max: 5.0">
  <div class="bar-row">
    <span class="bar-label">2024</span>
    <div class="bar-track"><div class="bar" style="--v: 5.0"></div></div>
    <span class="bar-value">5.0 万亿</span>
  </div>
  <!-- one .bar-row per data point; put the REAL numeric value in --v -->
</div>
```

```css
.bar { width: calc(var(--v) / var(--max) * 100%); }
```

以下规则与前面的密度规则具有同等优先级：

1. **柱长必须通过计算得出，绝不能凭感觉设置。** 每个柱体通过内联 `--v` 携带自身数值；只在图表容器上声明一次 `--max`，确保所有柱体共用同一基线。`--v` 和 `--max` 必须是无单位数字，因为 `calc()` 除法需要纯数字；“万亿”“%”“$”等单位只能出现在 `.bar-value` 文本中。纵向版本使用 `.bar { height: calc(var(--v) / var(--max) * 100%); }`，并为 `.bar-track` 设置明确高度；如果父元素高度为 auto，内部百分比高度会计算为 0，所有柱体都会塌陷。
2. **每个数据点必须同时显示类别标签和数值标签。** 数值应放在柱体之外的独立元素中，例如上面的 `.bar-value`；绝不能把它放进设置了固定高度和 `overflow: hidden` 的柱体中，否则较短柱体会把数值裁掉。

- ❌ 不要在柱体上手写 `height: 62%`、`width: 45%` 这类凭感觉设置的魔法数字。
- ❌ 同一张图中的柱体不能暗示不同基线——每张图只能有一个 `--max`。
- ❌ 不要把数值标签嵌套在会发生裁切的固定高度柱体中。
- ❌ 无论柱体多短，都不能遗漏对应的数据标签。

## Mermaid 图表主题纪律（深色 Deck）

Mermaid 默认主题面向白色页面设计：标签接近黑色（`#333`）、节点填充较浅、描边为黑色，并且 SVG 背景是透明的。把它直接嵌入深色 Deck，就会出现用户所说的“深色模式下图表文字不可读”：深色文字直接落在深色页面背景上。优先使用手写 HTML/CSS/SVG 图表，并通过 Deck 自身的 token（`--bg`、`--fg`、`--accent`）控制样式；这样既不会偏离当前主题，也不依赖外部 JavaScript。确实需要嵌入 Mermaid 时，应在初始化阶段根据当前页面背景选择主题——绝不能在深色页面中保留默认浅色主题：

```html
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',        // dark slide background
    // theme: 'default',  // light slide background
  });
</script>
```

为了保持品牌一致性，可以通过 `theme: 'base'` 配合 `themeVariables` 复用 Deck 配色，但必须传入具体颜色值，因为 Mermaid 无法解析 CSS `var()`。仅设置 `darkMode: true` 并不会自动让节点填充变深；`base` 主题仍会使用偏米色的默认 `primaryColor`，因此必须在设置浅色文字的同时，把 `primaryColor` 显式设为深色表面：

```js
mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    darkMode: true,                 // match the slide background
    background: '#101014',          // the deck's --bg value, as a literal
    primaryColor: '#1c1c24',        // node fill — dark surface tone, NOT the cream default
    primaryTextColor: '#e8e8ec',    // the deck's --fg value, as a literal
    primaryBorderColor: '#8a8a94',
    lineColor: '#8a8a94',
  },
});
```

以下规则与前面的密度规则具有同等优先级：

1. **图表文字颜色必须跟随页面背景，而不是跟随 Mermaid 默认值。** 深色背景使用 `theme: 'dark'`，或使用 `base` 配合深色 `themeVariables`；浅色背景可以使用默认主题。
2. **绝不能假设 SVG 会自带背景。** Mermaid 输出的是透明背景 SVG，因此所有标签都会直接显示在页面表面上。如果无法修改图表主题，应为容器增加明确的浅色底板，例如 `background: #fff`、padding 和圆角，而不是交付不可读的文字。

- ❌ 不要在深色 Deck 中调用没有设置 `theme` 的 `mermaid.initialize()`。
- ❌ 不要把 `var(--fg)` 字符串传入 `themeVariables`；Mermaid 需要具体颜色值。
- ❌ 不要为了“修复”对比度而只手动改一个标签的颜色；应调整整个图表主题。

## 交付前自检——在最终文件总结之前执行

对每个 `<section class="slide">`，在脑中按 1920×1080 渲染，并逐项回答：

- [ ] 页面内容是否完整放在画布内，没有裁切，也没有从底部溢出？
- [ ] 如果存在绝对定位的 footer/header，文档流内容是否在其预留区域之前停止？（参见上方规则 2。）
- [ ] 展示型标题是否不超过 140px，且不超过 8 个词？
- [ ] 这一页是否最多只承载一个核心 idea？（不得把 masthead、展示型标题、副标题、绝对定位 footer 和侧栏全部混在一起。）
- [ ] 如果页面包含图表，每个数据点是否都显示了可见的类别标签和数值标签？
- [ ] 柱长是否通过 `--v` / `--max` 计算，确保比例与数据一致？（在脑中抽查两个柱体。）
- [ ] 如果页面嵌入 Mermaid 图表，`mermaid.initialize` 是否根据页面背景设置了主题（深色背景使用 `dark` / `base`），并且不存在深色文字落在深色背景上的情况？

只要有一个答案是“否”，就必须在交付之前重新设计该页。内容溢出是用户反馈中最常见的单点失败；用户过去已经拒绝过这种结果，也会再次拒绝。

## 可以读取时，优先使用 simple-deck Skill 的布局词汇

如果项目工作区中可以读取 `plugins/_official/examples/simple-deck/assets/template.html` 和对应的 `references/layouts.md`，应**优先使用其中的布局，不要自行发明**。simple-deck Skill 提供了八种经过验证、可以直接使用的页面 skeleton：封面、正文、大数字、三点并列、流程、深色引语、前后对比和收尾，并配有经过验证的字号尺度、密度规则和 P0/P1/P2 检查清单。自行重新设计这些布局，是框架无法捕获的密度和溢出问题的主要来源。

使用这些布局词汇，但不要照搬示例中的表面顺序。除非用户、当前设计系统或显式选择的专项模板定义了另一套表面编排，否则上面的 Deck 级表面层级规则仍然具有最高优先级。

## Canonical skeleton（最终文件必须具有以下结构）

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><!-- SLOT: deck title --></title>
  <style>
    /* ===========================================================
       Deck framework — DO NOT EDIT the rules in this <style> block.
       Edit only inside the second <style> block below (per-deck
       styles) and inside <section class="slide"> bodies.

       Contract this framework provides:
         - 1920×1080 fixed canvas, scaled to fit the viewport
         - Only .slide.active is visible at a time
         - Programmatic prev/next + counter elements kept outside the scaled
           stage but hidden by default so the host can render the UI chrome
         - Keyboard (← → space PgUp PgDn Home End R), half-slide click, and stored
           position survive iframe focus quirks
         - "Save as PDF" produces a multi-page vertical PDF, one slide
           per page, by toggling every slide visible under @media print
       =========================================================== */
    :root {
      /* SLOT: theme tokens — the only top-level CSS the agent edits.
         Add or override --bg / --fg / --accent / etc. here. */
      --bg: #ffffff;
      --fg: #1c1b1a;
      --muted: #6b6964;
      --accent: #c96442;
      --surface: #ffffff;
      --shell: #08090d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--shell);
      color: var(--fg);
      font: 18px/1.5 -apple-system, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .deck-shell {
      position: fixed;
      inset: 0;
      overflow: hidden;
    }
    .deck-stage {
      width: 1920px;
      height: 1080px;
      background: var(--bg);
      position: relative;
      transform-origin: top left;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    }
    .slide {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    /* Visibility toggle hardened with :not(.active) + !important so cascade
       order can't break it. The previous `.slide { display:none }` rule
       lost the cascade whenever a per-slide variant class (e.g.
       `.s-cold { display:grid }`) was declared after it on the same
       element — every slide silently became visible at once. The
       `!important` is a belt-and-suspenders against agent code that adds
       `!important` on variant classes too. */
    .slide:not(.active) { display: none !important; }
    /* The active default uses :where() so it has zero specificity. Per-slide
       variant classes like `.s-cold { display:grid }` or
       `.s-magazine { display:block }` can override the default flex layout
       just by declaring `display` — no need for the variant to be more
       specific. The hide rule above still wins for inactive slides. */
    :where(.slide.active) { display: flex; flex-direction: column; }

    /* Programmatic chrome — counter + prev/next live outside the scaled
       stage so the host bridge can read/update them, but they stay hidden
       in preview, presentation, fullscreen, and new-tab modes. */
    .deck-counter {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      align-items: center;
      gap: 4px;
      background: rgba(10, 14, 26, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.18em;
      z-index: 1000;
    }
    .deck-counter button {
      width: 36px; height: 36px;
      background: transparent;
      color: #fff;
      border: 0;
      border-radius: 50%;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background 0.15s;
    }
    .deck-counter button:hover { background: rgba(255, 255, 255, 0.12); }
    .deck-counter button[disabled] { opacity: 0.3; cursor: default; }
    .deck-counter .deck-count {
      padding: 0 14px;
      letter-spacing: 0.22em;
    }
    .deck-counter .deck-count .total { color: rgba(255, 255, 255, 0.5); }
    .deck-hint {
      position: fixed;
      bottom: 26px;
      right: 28px;
      color: rgba(255, 255, 255, 0.4);
      font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      z-index: 999;
      pointer-events: none;
      display: none;
    }

    /* Print / PDF stitching — every slide stacks top-to-bottom, one per
       page. The viewer's "Share → PDF" relies on this; do not remove. */
    @media print {
      @page { size: 1920px 1080px; margin: 0; }
      html, body {
        width: 1920px !important;
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
      }
      .deck-shell {
        position: static !important;
        display: block !important;
        inset: auto !important;
      }
      .deck-stage {
        width: 1920px !important;
        height: auto !important;
        transform: none !important;
        box-shadow: none !important;
        position: static !important;
      }
      .slide {
        display: flex !important;
        position: relative !important;
        inset: auto !important;
        width: 1920px !important;
        height: 1080px !important;
        page-break-after: always;
        break-after: page;
      }
      .slide:last-child { page-break-after: auto; break-after: auto; }
      .deck-counter, .deck-hint { display: none !important; }
    }
  </style>
  <style>
    /* SLOT: per-deck styles — typography, layout helpers, slide variants.
       Add classes used by the slide content below, e.g. .title, .big-stat,
       .grid-3. Do not redefine .deck-shell / .deck-stage / .slide /
       .deck-counter / .deck-hint or anything inside @media print. */
  </style>
</head>
<body>
  <div class="deck-shell">
    <div class="deck-stage" id="deck-stage">

      <!-- SLOT: slides — one <section class="slide"> per slide. The first
           slide must have class="slide active". The framework auto-counts
           them and toggles .active as the user navigates. -->

      <section class="slide active" data-screen-label="01 Title">
        <!-- SLOT: slide 1 content -->
      </section>

      <section class="slide" data-screen-label="02">
        <!-- SLOT: slide 2 content -->
      </section>

      <!-- ... add as many <section class="slide"> blocks as the brief asks
           for. The first one is .active; the rest are not. -->

    </div>
  </div>

  <!-- Framework chrome — DO NOT EDIT below this line. -->
  <nav class="deck-counter" role="navigation" aria-label="Deck navigation">
    <button type="button" id="deck-prev" aria-label="Previous slide">‹</button>
    <span class="deck-count"><span id="deck-cur">01</span> <span class="total">/ <span id="deck-total">01</span></span></span>
    <button type="button" id="deck-next" aria-label="Next slide">›</button>
  </nav>
  <div class="deck-hint">← / → · space · R reset</div>

  <script>
    (function () {
      var stage = document.getElementById('deck-stage');
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
      var prev = document.getElementById('deck-prev');
      var next = document.getElementById('deck-next');
      var cur = document.getElementById('deck-cur');
      var total = document.getElementById('deck-total');
      var STORE = 'deck:idx:' + (location.pathname || '/');
      var idx = 0;

      // ---- scale-to-fit ---------------------------------------------------
      // The stage is 1920×1080 and sits at .deck-shell's (0, 0) in normal
      // block flow — the shell is intentionally NOT a grid/flex container,
      // so the stage's natural top-left is (0, 0). We scale via transform
      // with transform-origin:top-left, then translate by the remainder to
      // center the scaled box in the viewport. This survives nested
      // transforms (e.g. when the OD viewer wraps the iframe in its own
      // scale wrapper at zoom != 100%).
      function fit() {
        var sw = window.innerWidth;
        var sh = window.innerHeight;
        var pad = 32;
        var s = Math.min((sw - pad) / 1920, (sh - pad) / 1080);
        if (!isFinite(s) || s <= 0) s = 1;
        var tx = (sw - 1920 * s) / 2;
        var ty = (sh - 1080 * s) / 2;
        stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      }

      // ---- navigation -----------------------------------------------------
      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      function paint() {
        slides.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
        if (cur) cur.textContent = pad2(idx + 1);
        if (total) total.textContent = pad2(slides.length);
        if (prev) prev.toggleAttribute('disabled', idx <= 0);
        if (next) next.toggleAttribute('disabled', idx >= slides.length - 1);
      }
      function go(i) {
        idx = Math.max(0, Math.min(slides.length - 1, i));
        paint();
        try { localStorage.setItem(STORE, String(idx)); } catch (_) {}
      }
      function onKey(e) {
        if (e.__odDeckKeyHandled) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.__odDeckKeyHandled = true; e.preventDefault(); go(idx - 1); }
        else if (e.key === 'Home' || String(e.key).toLowerCase() === 'r') { e.__odDeckKeyHandled = true; e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.__odDeckKeyHandled = true; e.preventDefault(); go(slides.length - 1); }
      }
      // Capture phase + listen on both targets — inside the OD iframe,
      // focus may be on window OR document; a single non-capture listener
      // silently misses presses.
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      if (prev) prev.addEventListener('click', function () { go(idx - 1); });
      if (next) next.addEventListener('click', function () { go(idx + 1); });
      document.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        var t = e.target;
        while (t && t !== document.body && t !== document.documentElement) {
          var tag = String(t.tagName || '').toUpperCase();
          if (
            tag === 'A' ||
            tag === 'BUTTON' ||
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            t.isContentEditable ||
            t.getAttribute('role') === 'button' ||
            t.getAttribute('role') === 'link'
          ) return;
          t = t.parentElement;
        }
        focusDeck();
        if (e.clientX < window.innerWidth / 2) go(idx - 1);
        else go(idx + 1);
      }, true);

      // Auto-focus body so arrow keys work without an initial click.
      document.body.setAttribute('tabindex', '-1');
      document.body.style.outline = 'none';
      function focusDeck() { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (_) {} }
      document.addEventListener('mousedown', focusDeck);
      window.addEventListener('load', focusDeck);

      // Restore last position.
      try {
        var saved = parseInt(localStorage.getItem(STORE) || '0', 10);
        if (!isNaN(saved) && saved >= 0 && saved < slides.length) idx = saved;
      } catch (_) {}

      window.addEventListener('resize', fit);
      fit();
      paint();
      focusDeck();
    })();
  </script>
</body>
</html>
```

当 brief 是“给我做一套 Deck”时，最终输出只能是在这套 skeleton 上完成以下工作：调整主题 token、添加当前 Deck 专属类、填充 `<section class="slide">` 页面。除此之外，不应增加其他结构。Skill 专属规范（排版、主题预设、布局词汇）只能叠加在该框架之上，不能替代它。

---

## 执行模式差异

上方是项目文件作为事实源时实际使用的 `filesystem` 完整渲染版本。在 `text_artifact` 模式下，只有以下三处措辞不同：

- 工作流第 7 步：`输出一个完整的 <artifact> 块，其中包含 Deck HTML`
- 自检标题：`输出前自检——在写入 <artifact> 标签之前执行`
- 最终动作短语：`输出 artifact`
