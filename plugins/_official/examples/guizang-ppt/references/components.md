# 组件参考 · Components

这是 `magazine-web-ppt` skill 的组件手册。template.html 已经定义好了所有样式，这里只写"这个组件长什么样、怎么用"。

## 目录

- [基础 Slide 外壳](#基础-slide-外壳)
- [字体 Typography](#字体-typography)
- [Chrome & Foot](#chrome--foot)
- [Callout 引用框](#callout-引用框)
- [Stat 数字矩阵](#stat-数字矩阵)
- [Platform 平台卡](#platform-平台卡)
- [Rowline 表格行](#rowline-表格行)
- [Pillar 支柱卡](#pillar-支柱卡)
- [Tag & Kicker](#tag--kicker)
- [Figure 图片框](#figure-图片框)
- [Icons 图标](#icons-图标)
- [Ghost 巨型背景字](#ghost-巨型背景字)
- [Highlight 荧光标记](#highlight-荧光标记)

---

## 基础 Slide 外壳

每一页都是一个 `<section class="slide ...">`。必须包含 `data-theme` 属性（`light` 或 `dark`），JS 翻页时会根据这个属性切换背景。

```html
<section class="slide light" data-theme="light">   <!-- 浅色页 -->
<section class="slide dark" data-theme="dark">     <!-- 深色页 -->
<section class="slide light hero" data-theme="light">  <!-- Hero 页：浅色 + 薄遮罩透出 WebGL -->
<section class="slide dark hero" data-theme="dark">    <!-- Hero 页：深色 + 薄遮罩 -->
```

**light vs dark 的使用：交替使用**，每 2-3 页切换一次主题，避免连续超过 3 页同色。翻页时 WebGL 背景会自动在两个 shader 之间渐变过渡。

**hero 类的使用**：只给视觉主导的页面加（封面、金句页、章节过渡、结尾）。加 `hero` 后遮罩降到 12-16%，WebGL 背景会大幅透出，所以不要在 hero 页上放太多文字。

---

## 字体 Typography

字体分工是本模板最重要的规则，严禁混用。

| Class | 用途 | 字体 |
|---|---|---|
| `.display` | 超大号英文（Hero 页） | Playfair Display 700, 11vw |
| `.display-zh` | 超大号中文标题 | Noto Serif SC 700, 7.8vw |
| `.h1-zh` | 页面主标题 | Noto Serif SC 700, 4.6vw |
| `.h2-zh` | 副标题 | Noto Serif SC 600, 3.2vw |
| `.h3-zh` | 流水线步骤标题 | Noto Serif SC 500, 1.9vw |
| `.lead` | 引导段（比 body 大） | Noto Serif SC 400, 1.9vw |
| `.body-zh` | **正文/描述（非衬线）** | Noto Sans SC 400, 1.22vw |
| `.body-serif` | 正文（衬线） | Noto Serif SC 400, 1.3vw |
| `.kicker` | 小节提示（标题上方） | IBM Plex Mono, 12px uppercase |
| `.meta` | 元信息标签 | IBM Plex Mono, 0.88vw uppercase |
| `.big-num` | 巨型数字 | Playfair Display 800, 10vw |
| `.mid-num` | 中号数字 | Playfair Display 700, 5.5vw |

**核心规则**：
- **衬线**（`serif-zh` / `serif-en`）：标题、重点金句、数字 —— 用于"视觉重音"
- **非衬线**（`sans-zh`）：正文描述、大段阅读内容 —— 用于"信息密度"
- **等宽**（`mono`）：kicker、meta、foot 的英文标签 —— 用于"装饰节奏"

**强调技巧**：
- `<em class="en">英文词</em>` —— 把英文词渲染成 Playfair Display 斜体（很好看）
- `<em style="opacity:.65">短语</em>` —— 让标题后半段淡出，制造节奏

---

## Chrome & Foot

每一页的顶部和底部的元信息条。几乎所有页都应该有。

```html
<div class="chrome">
  <div class="left">
    <span>第一幕 · 硬数据</span>
    <span class="sep"></span>
    <span>Act I</span>
  </div>
  <div class="right"><span>02 / 27</span></div>
</div>

<!-- ... 页面主体 ... -->

<div class="foot">
  <div class="title">项目名 · CodePilot　|　github.com/codepilot</div>
  <div>Act I · Dev Numbers</div>
</div>
```

**规则**：
- `chrome.right` 总是放页码 `NN / TOTAL` （TOTAL 为总页数）
- `foot.title` 是中文说明，`foot.right` 是英文 act 标记
- chrome 和 foot 共同构成杂志感的"页眉页脚"

---

## Callout 引用框

展示金句 / 关键观点 / 他人引言。

```html
<div class="callout" style="max-width:80vw">
  <div class="q-big">"这东西在三年前，<br>需要一个十人团队做一年。"</div>
  <span class="cite">— 一个观察者的判断</span>
</div>
```

变体：
- 不带 cite：去掉 `<span class="cite">` 即可
- 带英文金句：`<em class="en">"Thin Harness, Fat Skills."</em>`
- 在 hero 页使用：外层加 `style="position:relative;z-index:2"`（避免被背景遮罩盖住）

---

## Stat 数字矩阵

展示数据指标，常与 `.grid-6` / `.grid-4` 配合。

```html
<div class="grid-6">
  <div class="stat">
    <span class="m">Duration</span>
    <span class="n">64<em style="font-size:.4em;opacity:.5;font-style:normal"> 天</em></span>
    <span class="l">从 0 到现在</span>
  </div>
  <!-- ... 更多 stat ... -->
</div>
```

三段式结构：`.m` 等宽小标签 → `.n` 巨型数字 → `.l` 描述说明。数字后的单位用 `<em>` 缩小到 0.4em，opacity 0.5。

**常用布局容器**：
- `.grid-6` — 3×2 网格（最常用，6 个 stat）
- `.grid-4` — 2×2 网格（4 个 stat）
- `.grid-3` — 3 等分单行（3 个 stat / pillar）

---

## Platform 平台卡

展示社交平台 / 渠道 + 粉丝数。

```html
<div class="plat">
  <div class="sub">Weibo</div>
  <div class="name">微博</div>
  <div class="nb">289K</div>
</div>
```

可选第四行（补充说明）：
```html
<div class="body-zh" style="font-size:max(11px,.8vw);opacity:.5;margin-top:.6vh">
  含小绿书同步
</div>
```

**"Also On" 变体**（补充平台）：
```html
<div class="plat" style="border-top-style:dashed;opacity:.72">
  <div class="sub">Also On</div>
  <div class="body-zh" style="font-weight:600;margin-top:.8vh">
    B 站　·　知乎
  </div>
</div>
```

---

## Rowline 表格行

列表式内容，每行一个条目。

```html
<div class="rowline">
  <div class="k">CLAUDE.md</div>
  <div class="v">你该怎么做事 —— 行为规则 + 工作偏好 + 禁止事项</div>
  <div class="m">EMPLOYEE · HANDBOOK</div>
</div>
```

三列结构：`.k` 衬线关键词 · `.v` 正文描述 · `.m` 等宽标签（右对齐）。第一个和最后一个 rowline 自动加上下边框。

**变体：2 列**：`style="grid-template-columns:1fr 3fr"` 去掉 `.m` 列。

---

## Pillar 支柱卡

三支柱结构，常用于"概念并列"类型页面。

```html
<div class="grid-3">
  <div class="pillar">
    <div class="ic">01</div>
    <div class="t">三层<br>文档体系</div>
    <div class="d">CLAUDE.md<br>+ 项目知识库<br>+ 护栏文件</div>
  </div>
  <!-- ... 更多 pillar ... -->
</div>
```

**带图标的 pillar（用于强调性页面）**：
```html
<div class="pillar" style="padding:4vh 2vw;border:1px solid currentColor;border-color:rgba(10,10,11,.2)">
  <div class="ic"><i data-lucide="compass" class="ico-lg"></i></div>
  <div class="t">判断力</div>
  <div class="d">决策和方向的权威。<br>取舍、品味、方向感。</div>
</div>
```

`.ic` 可以是序号（`01 / 02 / 03` 或 `A. / B. / C.`），也可以是 Lucide 图标。

---

## Tag & Kicker

**Kicker** 是标题上方的小提示文字（等宽、全大写、小字号）：
```html
<div class="kicker">过去 64 天 · 开发篇</div>
<div class="h1-zh">一个人，做了什么。</div>
```

**Tag** 是独立的标签胶囊（带边框）：
```html
<div style="display:flex;gap:1.6vw;flex-wrap:wrap">
  <div class="tag">早上 10 点起床</div>
  <div class="tag">周二 / 四下午健身</div>
  <div class="tag">晚上照样看剧 · 玩游戏</div>
</div>
```

---

## Figure 图片框

**这是本模板最容易踩坑的组件，务必遵守以下规则**。

### 基础结构

```html
<figure class="tile">
  <div class="frame-img" style="height:26vh">
    <img src="图片素材/xxx.png" alt="说明">
  </div>
  <figcaption class="frame-cap">
    <span class="pf">推特 · Twitter</span>
    <span class="nb">137K</span>
  </figcaption>
</figure>
```

### 关键约束（血泪经验，不要违反）

1. **必须用 `height:Nvh` 固定高度**，不要用 `aspect-ratio`。
   - 原因：用 aspect-ratio 在网格里会撑破父容器，导致图片堆叠。
   - 推荐尺寸：`height:18vh` (紧凑条形) / `22vh` (标准网格) / `26vh` (突出展示) / `28vh` (大图)。

2. **`object-position:top center`（已在 CSS 里设好）**，只允许裁掉底部。
   - 严禁裁剪左右和顶部 —— 这是图片的核心身份信息区。

3. **网格里多张图时，用内联 grid 而不是 `grid-3`**：
   ```html
   <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1vh 1.2vw">
     <figure class="tile">...</figure>
     <figure class="tile">...</figure>
     <figure class="tile">...</figure>
   </div>
   ```

4. **图片与布局其他部分对齐**：figure 单独加 `align-self:end` 让图片贴底。

### Frame Caption 变体

```html
<!-- 标准：左 figure 名，右数字 -->
<figcaption class="frame-cap">
  <span class="pf">推特 · Twitter</span>
  <span class="nb">137K</span>
</figcaption>

<!-- 带编号 -->
<figcaption class="frame-cap">
  <span class="idx">01</span>
  <span class="pf">AI 润色</span>
  <span>Polish</span>
</figcaption>
```

### 图片占位（设计阶段占位符）

图片还没有就位时，用虚线框占位：
```html
<div class="img-slot r-4x3">  <!-- r-4x3 / r-16x9(default) / r-3x2 / r-1x1 -->
  <span class="plus">+</span>
  <span class="label">GitHub 截图位置</span>
</div>
```

---

## Icons 图标

**严禁使用 emoji**。用 Lucide via CDN（template.html 已引入）。

```html
<i data-lucide="compass" class="ico-lg"></i>     <!-- 大图标（pillar 用） -->
<i data-lucide="target" class="ico-md"></i>      <!-- 中图标（列表项用） -->
<i data-lucide="check-circle" class="ico-sm"></i>  <!-- 小图标（inline 用） -->
```

**常用 Lucide 图标名**（按含义分组）：

- 判断类：`compass`, `target`, `crosshair`, `search-check`
- 关系类：`share-2`, `users`, `network`, `link`, `handshake`
- 品牌类：`crown`, `gem`, `award`, `star`, `badge-check`
- 流程类：`workflow`, `route`, `arrow-right-left`, `repeat`
- 数据类：`grid-2x2`, `bar-chart-3`, `trending-up`, `activity`
- 审美类：`palette`, `brush`, `eye`, `sparkles`
- 对错类：`check-circle`, `x-circle`, `check`, `x`
- 方向类：`arrow-right`, `arrow-up-right`, `corner-down-right`

**图标与文字 inline 组合**：
```html
<div class="h3-zh" style="display:flex;align-items:center;gap:.8em">
  <i data-lucide="target" class="ico-md"></i>
  判断 — 什么值得写
</div>
```

---

## Ghost 巨型背景字

用作"装饰性背景字"，极低透明度，营造杂志感。

```html
<div class="ghost" style="right:-6vw;top:-8vh">BUT</div>
<div class="ghost" style="left:-8vw;bottom:-18vh;font-style:italic">Harness</div>
```

- 字号 34vw，opacity 0.06
- 常用定位：`right:-6vw;top:-8vh`（右上超出）/ `left:-8vw;bottom:-18vh`（左下超出）
- 内容：英文单词或数字（章节序号 01/02/03、关键词 BUT/NOW/HERE）

**注意**：使用 ghost 的页面里，其他内容要加 `position:relative;z-index:2` 避免被压到下面。

---

## Highlight 荧光标记

行内短语的"荧光笔"效果：

```html
<span class="hi">不是</span>
<span class="hi">一次性爆发</span>
```

在文字底部生成一条半透明高亮条。深色主题用亮条，浅色主题用暗条（CSS 已处理）。

**适合场景**：只对关键 1-3 个词使用，不要大面积用。
