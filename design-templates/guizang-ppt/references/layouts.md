# Page Layout Library

This document collects the 10 most commonly used page layout skeletons. Each is a complete, paste-ready `<section class="slide ...">...</section>` code block; just swap in your copy/images to use it.

---

## ⚠️ Read before generating (Pre-flight)

### A. Class names must come from template.html

Every class layouts.md uses (`h-hero` / `h-xl` / `h-sub` / `h-md` / `lead` / `meta-row` / `stat-card` / `stat-label` / `stat-nb` / `stat-unit` / `stat-note` / `pipeline-section` / `pipeline-label` / `pipeline` / `step` / `step-nb` / `step-title` / `step-desc` / `grid-2-7-5` / `grid-2-6-6` / `grid-2-8-4` / `grid-3-3` / `grid-6` / `grid-3` / `grid-4` / `frame` / `frame-img` / `img-cap` / `callout` / `callout-src` / `kicker`) is predefined in the `<style>` block of `assets/template.html`.

**Do not invent new class names**. If you must customize, write it inline with `style="..."`. If you're unsure whether a class exists before generating, grep template.html to confirm.

### B. Image ratio rules (very important)

**Always use a standard ratio**, never the source image's odd ratio like `aspect-ratio: 2592/1798`:

| Scenario | Recommended ratio | How to write it |
|------|---------|------|
| Lead image + text, main image | 16:10 or 4:3 | `aspect-ratio:16/10; max-height:54vh` |
| Image grid (multi-image comparison) | uniform | **fixed `height:26vh`, not aspect-ratio** |
| Small image left + text right | 1:1 or 3:2 | `aspect-ratio:1/1; max-width:40vw` |
| Full-screen hero visual | 16:9 | `aspect-ratio:16/9; max-height:64vh` |
| Image + text mix, small inset | 3:2 | `aspect-ratio:3/2; max-width:30vw` |

The image must be wrapped in `<figure class="frame-img">`; the inner `<img>` automatically gets `object-fit:cover + object-position:top center`, cropping only the bottom, never the top/left/right.

### C. Image positioning guidelines (avoid images piling at the very bottom of the page, hidden by the browser toolbar)

**Wrong approaches** (already learned the hard way, don't repeat):
- Using `align-self:end` in a non-grid container: `align-self` has no effect outside flex/grid, and the image falls to the end of the document flow and piles at the bottom.
- Using `position:absolute + bottom:0` to "pin" the image to the bottom: it gets covered by the bottom `.foot` and `#nav` dots.
- Writing only `height:N vh` for a single image with no `max-height`: it overflows the viewport on low-resolution screens.

**Right approach**:
- Image + text mixes **must use the grid structure `.frame.grid-2-7-5`** (or `.grid-2-6-6` / `.grid-2-8-4`).
- The grid container defaults to `align-items:start` (already set in the template), so the image naturally sticks to the top of the cell.
- If you need "the image's bottom aligned with the left-column callout": **give the left column flex column + `justify-content:space-between`** (so the callout sticks to the bottom of the left column on its own), and **just keep the right-column figure at align-items:start**: do not add `align-self:end`.
- It's recommended that every grid parent add inline `style="padding-top:6vh"` to give the title area breathing room.

### D. Theme color and theme rhythm

- Pick one theme color from the 5 presets in `references/themes.md`; custom hex values are not allowed.
- The theme rhythm (which of light / dark / hero light / hero dark each page uses) has hard rules in the "Theme rhythm planning" section below; read it before generating.
- Decide both things before picking layouts, to avoid rework.

---

## 0. Base structure (the same for every slide)

```html
<section class="slide [light|dark|hero light|hero dark]">
  <div class="chrome">
    <div>上下文标签 · 子标签</div>
    <div>ACT · 页号 / 总页数</div>
  </div>
  <!-- 主内容 -->
  <div class="foot">
    <div>页码说明 · Page Description</div>
    <div>— · —</div>
  </div>
</section>
```

- Non-hero pages should add a `light` or `dark` theme; hero pages add `hero light` or `hero dark` (participating in WebGL theme interpolation).
- `chrome` and `foot` are the optional but recommended four-corner metadata, top/bottom and left/right.
- **Hero pages are for section covers / openings / closings / transitions**; non-hero pages are for body content.

### ⚠️ chrome and kicker must not say the same thing

This is the most common content-duplication problem. The two are on completely different semantic dimensions:

| Location | Role | Nature of content | Example |
|------|------|---------|------|
| `.chrome` top-left | **magazine masthead / nav metadata** | a stable "section name" or "chapter category," can be the same across pages | "Act II · Workflow" / "Data · Result" / "lukew.com · 2026.04" |
| `.chrome` top-right | **page number + act number** | fixed format | "Act II · 15 / 25" |
| `.kicker` | **the one-of-a-kind lead-in for this page** | the "small prefix" of the headline, like the line above a magazine headline, different on every page | "BUT" / "一个人,做了什么。" / "Phase 01 · 设计阶段" |

**Counter-example** (already learned the hard way): chrome says "设计先行 · Design First" and kicker says "Phase 01 · 设计阶段": the meaning repeats, and the reader instantly senses AI generation.

**Right approach**: chrome is the **section label** (stable, reusable across pages), kicker is the **hook for this page** (a short line, dramatic); the two complement each other and don't translate into each other.

### ⚠️ Theme rhythm planning (must read · do before generating)

**Core mechanism**: every page's `<section>` must carry one of `light` / `dark` / `hero light` / `hero dark`. The JS infers the theme from the class to decide whether the body gets `light-bg`, which switches whether the dark or light WebGL canvas is in front. No theme, or a custom name, = fallback error.

#### Default theme by layout

| Layout | Default theme | Reason |
|---|---|---|
| 1. Cover | `hero dark` | opening ceremony, strong impact on a dark base |
| 2. Act divider | `hero dark` and `hero light` **must alternate** | breathing rhythm |
| 3. Big numbers (data) | `light` | numbers need a paper-white base; you can occasionally insert `dark` when several acts fire in a row |
| 4. Lead image + text | **alternate `light` / `dark`** | the workhorse of body rhythm |
| 5. Image grid | `light` | screenshots need a light base |
| 6. Pipeline | `light` | flowcharts need clarity |
| 7. Question page | `hero dark` | strong visual impact by default |
| 8. Big quote | **`dark` preferred**, occasionally `light` | the ceremony of a quote relies on a dark base |
| 9. Comparison page | `light` | two columns need clarity |
| 10. Image + text mix | **alternate `light` / `dark`** | rhythm |

#### Rhythm hard rules (self-check with grep after generating)

- ❌ **Forbidden**: 3+ consecutive pages on the same theme (including stacked light and stacked dark)
- ❌ **Forbidden**: an 8+ page deck without at least 1 `hero dark` + 1 `hero light`
- ❌ **Forbidden**: a whole deck with only `light` body pages and no `dark` body page at all: it looks flat and breathless
- ✅ **Recommended**: insert 1 hero page every 3-4 pages (cover / divider / question / big quote)

#### 8-page rhythm template (ready to apply directly)

| Page | Theme | Layout | Notes |
|---|---|---|---|
| 1 | `hero dark` | Cover | opening |
| 2 | `light` | Big numbers | data thrown out |
| 3 | `dark` | Lead image + text | comparison/story |
| 4 | `light` | Pipeline | process |
| 5 | `hero light` | Act divider | breathing |
| 6 | `dark` | Lead image + text or big quote | |
| 7 | `hero dark` | Question page | suspenseful close |
| 8 | `light` | Big quote / ending | wrap-up |

**Draw this table and align it first, then start writing slides**. Skipping the planning and pasting skeletons straight = all light.

---

## Layout 1: Hero Cover

```html
<section class="slide hero dark">
  <div class="chrome">
    <div>A Talk · 2026.04.22</div>
    <div>Vol.01</div>
  </div>
  <div class="frame" style="display:grid; gap:4vh; align-content:center; min-height:80vh">
    <div class="kicker">私享会 · 李继刚</div>
    <h1 class="h-hero">一人公司</h1>
    <h2 class="h-sub">被 AI 折叠的组织</h2>
    <p class="lead" style="max-width:60vw">
      一个 AI 创作者 —— 在 64 天里做了 11 万行代码、在 9 个平台上持续输出，生活节奏几乎没有被改变。
    </p>
    <div class="meta-row">
      <span>歸藏 Guizang</span><span>·</span><span>独立创作者 / CodePilot 作者</span>
    </div>
  </div>
  <div class="foot">
    <div>一场关于 AI · 组织 · 个体的分享</div>
    <div>— 2026 —</div>
  </div>
</section>
```

**Key points**:
- Use `hero dark` so the WebGL background shows through across most of the area
- `h-hero` is the largest size (10vw), used here as the title hero visual
- Use `min-height:80vh + align-content:center` to vertically center the content as a whole
- No need to write a page number in `.chrome`; the cover is self-contained

---

## Layout 2: Act Divider

```html
<section class="slide hero light">
  <div class="chrome">
    <div>第一幕 · 硬数据</div>
    <div>Act I · 01 / 25</div>
  </div>
  <div class="frame" style="display:grid; gap:6vh; align-content:center; min-height:80vh">
    <div class="kicker">Act I</div>
    <h1 class="h-hero" style="font-size:8.5vw">硬数据</h1>
    <p class="lead" style="max-width:55vw">
      先看数字，再谈方法。
    </p>
  </div>
  <div class="foot">
    <div>第一幕引子</div>
    <div>— · —</div>
  </div>
</section>
```

**Key points**:
- Minimalist; just kicker + big title + one line of intro
- The covers of two acts can alternate `hero light` / `hero dark` to create rhythm
- The `h-hero` size can be tuned from 10vw down to 8.5vw to fit length

---

## Layout 3: Big Numbers Grid

```html
<section class="slide light">
  <div class="chrome">
    <div>过去 64 天 · 开发篇</div>
    <div>Act I / Dev · 02 / 25</div>
  </div>
  <div class="frame" style="padding-top:6vh">
    <div class="kicker">一个人，做了什么。</div>
    <h2 class="h-xl">过去 64 天</h2>
    <p class="lead" style="margin-bottom:5vh">从 0 到开源 CodePilot。</p>

    <div class="grid-6" style="margin-top:6vh">
      <div class="stat-card">
        <div class="stat-label">Duration</div>
        <div class="stat-nb">64 <span class="stat-unit">天</span></div>
        <div class="stat-note">从 0 到现在</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lines of Code</div>
        <div class="stat-nb">110K+</div>
        <div class="stat-note">一行行写到 11 万+</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">GitHub Stars</div>
        <div class="stat-nb">5,166</div>
        <div class="stat-note">一个开源仓库</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Downloads</div>
        <div class="stat-nb">41K+</div>
        <div class="stat-note">装到了几万台电脑里</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Providers</div>
        <div class="stat-nb">19</div>
        <div class="stat-note">跨平台接入</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Commits</div>
        <div class="stat-nb">608+</div>
        <div class="stat-note">没有协作者</div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>项目 · CodePilot　|　github.com/codepilot</div>
    <div>Act I · Dev Numbers</div>
  </div>
</section>
```

**Key points**:
- A 3×2 or 4×2 grid is most stable (see `.grid-6`)
- Each `stat-card` has a fixed structure: label (small English) → nb (big number) → note (annotation)
- Numbers should be 2-3 characters (too long overflows); use K / M shorthand
- Leave 5vh+ of buffer above so the title area catches the eye first

---

## Layout 4: Lead Image + Text (Quote + Image)

```html
<section class="slide light">
  <div class="chrome">
    <div>身份反差 · The Twist</div>
    <div>03 / 25</div>
  </div>
  <div class="frame grid-2-7-5" style="padding-top:6vh">
    <!-- 左列：标题 + 正文 + callout，flex column 让 callout 贴列底 -->
    <div style="display:flex; flex-direction:column; justify-content:space-between; gap:3vh">
      <div>
        <div class="kicker">BUT</div>
        <h2 class="h-xl" style="white-space:nowrap; font-size:7.2vw">
          我不是程序员。
        </h2>
        <p class="lead" style="margin-top:3vh">
          大学毕业之后再也没写过一行代码。过去十年做的是 UI 设计和 AI 特效。
        </p>
      </div>
      <div class="callout">
        "这东西在三年前，<br>
        需要一个十人团队做一年。"
        <div class="callout-src">— 一个观察者的判断</div>
      </div>
    </div>
    <!-- 右列：图片用标准 16/10 比例 + max-height，不要 align-self:end -->
    <figure class="frame-img" style="aspect-ratio:16/10; max-height:56vh">
      <img src="images/codepilot.png" alt="CodePilot 产品截图">
      <figcaption class="img-cap">CodePilot · 产品截图</figcaption>
    </figure>
  </div>
  <div class="foot">
    <div>Page 03 · 我不是程序员</div>
    <div>— · —</div>
  </div>
</section>
```

**Key points**:
- Use `grid-2-7-5` (left 7 parts, right 5 parts); `align-items:start` is already preset in the template
- The **left column** uses flex column + `justify-content:space-between`: title at the top, callout naturally at the bottom
- The **right-column image** **should not get `align-self:end`**. That slides the image to the bottom of the cell, hidden by the browser toolbar on low-resolution screens
- The image must use a **standard ratio 16/10 or 4/3 + `max-height:56vh`**; don't use the source image's odd ratio (like `2592/1798`)

---

## Layout 5: Image Grid (multi-image comparison)

```html
<section class="slide light">
  <div class="chrome">
    <div>平台粉丝实证</div>
    <div>Act I / Ops · 05 / 27</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">Proof · 粉丝实证</div>
    <h2 class="h-xl">10 个平台 · 6 张截图</h2>

    <div class="grid-3-3" style="margin-top:4vh">
      <figure class="frame-img" style="height:26vh">
        <img src="images/weibo.png" alt="微博 289K">
        <figcaption class="img-cap">微博 · 289K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/twitter.png" alt="推特 137K">
        <figcaption class="img-cap">推特 · 137K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/wechat.png" alt="公众号 96K">
        <figcaption class="img-cap">公众号 · 96K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/jike.png" alt="即刻 26K">
        <figcaption class="img-cap">即刻 · 26K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/xhs.png" alt="小红书 19K">
        <figcaption class="img-cap">小红书 · 19K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/douyin.png" alt="抖音 10K">
        <figcaption class="img-cap">抖音 · 10K</figcaption>
      </figure>
    </div>
  </div>
  <div class="foot">
    <div>截图时间 · 2026.04</div>
    <div>Page 05 · 粉丝实证</div>
  </div>
</section>
```

**Key points**:
- Key: every `frame-img` must hard-set `height:NNvh` (not `aspect-ratio`), or the grid breaks
- The image automatically gets `object-fit:cover + object-position:top`, cropping only the bottom
- Use `.grid-3-3` (3×2) or `.grid-3` (3×1) to carry it

---

## Layout 6: Two-Column Pipeline

```html
<section class="slide light">
  <div class="chrome">
    <div>我的工作流 · Workflow</div>
    <div>Act II · 15 / 27</div>
  </div>
  <div class="frame">
    <div class="kicker">Pipeline · 流水线</div>
    <h2 class="h-xl">两条流水线</h2>

    <!-- 第一组：文本侧 -->
    <div class="pipeline-section">
      <div class="pipeline-label">文本侧 · Text Pipeline</div>
      <div class="pipeline">
        <div class="step">
          <div class="step-nb">01</div>
          <div class="step-title">Draft</div>
          <div class="step-desc">AI 帮我起草初稿</div>
        </div>
        <div class="step">
          <div class="step-nb">02</div>
          <div class="step-title">Polish</div>
          <div class="step-desc">AI 润色去 AI 味</div>
        </div>
        <div class="step">
          <div class="step-nb">03</div>
          <div class="step-title">Morph</div>
          <div class="step-desc">AI 变形成推特 / 小红书</div>
        </div>
        <div class="step">
          <div class="step-nb">04</div>
          <div class="step-title">Illustrate</div>
          <div class="step-desc">AI 生成信息图</div>
        </div>
        <div class="step">
          <div class="step-nb">05</div>
          <div class="step-title">Distribute</div>
          <div class="step-desc">一键分发 9 平台</div>
        </div>
      </div>
    </div>

    <!-- 第二组：视频侧 -->
    <div class="pipeline-section">
      <div class="pipeline-label">视觉 · 视频侧 · Video Pipeline</div>
      <div class="pipeline">
        <div class="step">
          <div class="step-nb">06</div>
          <div class="step-title">Cut</div>
          <div class="step-desc">AI 帮我剪辑</div>
        </div>
        <div class="step">
          <div class="step-nb">07</div>
          <div class="step-title">Wrap</div>
          <div class="step-desc">AI 帮我包装</div>
        </div>
        <div class="step">
          <div class="step-nb">08</div>
          <div class="step-title">Cover</div>
          <div class="step-desc">AI 生成封面</div>
        </div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>Page 15 · 我的内容工厂</div>
    <div>Workflow</div>
  </div>
</section>
```

**Key points**:
- Use `.pipeline-section` to group + `.pipeline-label` as the group title
- Between two groups, use a 3.6vh gap + a fine top divider line (already preset in the CSS)
- Each step has the fixed structure nb → title → desc
- Step count is unlimited, but a single row should be ≤5; otherwise move to a second pipeline

---

## Layout 7: Suspenseful Close / Question Page (Hero Question)

```html
<section class="slide hero dark">
  <div class="chrome">
    <div>留给你的问题</div>
    <div>24 / 27</div>
  </div>
  <div class="frame" style="display:grid; gap:8vh; align-content:center; min-height:80vh">
    <div class="kicker">The Question</div>
    <h1 class="h-hero" style="font-size:7vw; line-height:1.15">
      你的公司里，<br>
      哪些岗位本来就<br>
      不该由人来做？
    </h1>
    <p class="lead" style="max-width:50vw">
      这个问题，不是技术问题，是架构问题。
    </p>
  </div>
  <div class="foot">
    <div>Page 24 · The Question</div>
    <div>— · —</div>
  </div>
</section>
```

**Key points**:
- The more whitespace on a hero page the better; put only one question
- Tune the `h-hero` size to the length (7vw suits 3 lines, 10vw suits 1 line)
- Break lines manually with `<br>` to keep the breaks at semantic points
- The tail can give one more `lead` line as the punchline

---

## Layout 8: Big Quote Page (serif quote)

```html
<section class="slide light">
  <div class="chrome">
    <div>The Takeaway · 核心金句</div>
    <div>18 / 25</div>
  </div>
  <div class="frame" style="display:grid; gap:5vh; align-content:center; min-height:80vh">
    <div class="kicker">Quote · 金句</div>
    <blockquote style="font-family:var(--serif-zh); font-weight:700; font-size:5.8vw; line-height:1.2; letter-spacing:-.01em; max-width:72vw">
      "没有交接,<br>所有人都在构建。"
    </blockquote>
    <p class="lead" style="max-width:55vw; opacity:.65">
      Without the handoff, everyone builds.<br>
      And that makes all the difference.
    </p>
    <div class="meta-row">
      <span>— Luke Wroblewski</span><span>·</span><span>2026.04.16</span>
    </div>
  </div>
  <div class="foot">
    <div>Page 18 · 金句</div>
    <div>— · —</div>
  </div>
</section>
```

**Key points**:
- Whitespace across the whole page; put only one big quote + attribution
- Use inline style on the `<blockquote>` to enlarge it on its own (5-6vw); don't use `h-hero` (that name belongs to the page main title)
- Follow it with the English original (lead · opacity:.65) to create hierarchy
- Pair with `meta-row` for the attribution · date

---

## Layout 9: Side-by-Side Comparison (A vs B · Old vs New)

```html
<section class="slide light">
  <div class="chrome">
    <div>旧 vs 新 · The Shift</div>
    <div>12 / 25</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">Before / After · 范式转变</div>
    <h2 class="h-xl" style="margin-bottom:4vh">从交接到共建</h2>

    <div class="grid-2-6-6" style="gap:5vw 4vh">
      <!-- 左列：旧 -->
      <div style="padding:3vh 2vw; border-left:3px solid currentColor; opacity:.55">
        <div class="kicker" style="opacity:.9">Before · 旧模式</div>
        <h3 class="h-md" style="margin-top:2vh">设计 → 开发 → 交接</h3>
        <ul style="margin-top:3vh; padding-left:1.2em; display:flex; flex-direction:column; gap:1.4vh; font-family:var(--sans-zh); font-size:max(14px,1.1vw); line-height:1.55">
          <li>设计师在 Figma 做稿</li>
          <li>开发者盯着文件翻译像素</li>
          <li>反复 PR 沟通对齐</li>
          <li>非技术人员无法触碰代码</li>
        </ul>
      </div>
      <!-- 右列:新 -->
      <div style="padding:3vh 2vw; border-left:3px solid currentColor">
        <div class="kicker" style="opacity:.9">After · 新模式</div>
        <h3 class="h-md" style="margin-top:2vh">同工具 · 并行 · 共建</h3>
        <ul style="margin-top:3vh; padding-left:1.2em; display:flex; flex-direction:column; gap:1.4vh; font-family:var(--sans-zh); font-size:max(14px,1.1vw); line-height:1.55">
          <li>三个角色同时在 Intent 工作</li>
          <li>agents.md 作为共享上下文</li>
          <li>代理处理对齐 / 冲突 / 动画</li>
          <li>任何人都能安全贡献代码</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>Page 12 · 范式转变</div>
    <div>Before / After</div>
  </div>
</section>
```

**Key points**:
- Use `.grid-2-6-6` (1:1) to split left and right in half
- The left column at `opacity:.55` visually weakens the "old"; the right column at full brightness emphasizes the "new"
- Both columns use `border-left:3px solid` + `padding-left` for a blockquote feel
- Each column has a uniform structure: `kicker` → `h-md` → `<ul>` bullets, consistent rhythm

---

## Layout 10: Image + Text Mix (Lead Image + Side Text)

```html
<section class="slide light">
  <div class="chrome">
    <div>Design First · 设计先行</div>
    <div>08 / 16</div>
  </div>
  <div class="frame grid-2-8-4" style="padding-top:6vh">
    <!-- 左列:大段正文 + 引用 -->
    <div>
      <div class="kicker">Phase 01 · 设计阶段</div>
      <h2 class="h-xl" style="margin-top:1vh; margin-bottom:3vh">设计先行 · 2 周</h2>

      <p class="lead" style="margin-bottom:3vh">
        在 Figma 中完成视觉探索与设计系统,网格 / 排版 / 颜色变量 / 可复用组件,桌面和移动端稿件几轮反馈迭代。
      </p>

      <p style="font-family:var(--sans-zh); font-size:max(14px,1.15vw); line-height:1.75; opacity:.78; margin-bottom:2.4vh">
        两周之内,视觉风格、粗略结构、方向性内容全部稳定。这是扎实的传统设计流程——在这里还没什么新鲜事。
      </p>

      <div class="callout" style="margin-top:3vh">
        "This phase was pretty standard.<br>Just a solid Web design process."
        <div class="callout-src">— Luke Wroblewski</div>
      </div>
    </div>
    <!-- 右列:辅助图 · 竖版或方形 -->
    <figure class="frame-img" style="aspect-ratio:3/4; max-height:60vh">
      <img src="images/figma.png" alt="Figma design system">
      <figcaption class="img-cap">Figma · Design System</figcaption>
    </figure>
  </div>
  <div class="foot">
    <div>Page 08 · Design First</div>
    <div>约 2 周</div>
  </div>
</section>
```

**Key points**:
- `.grid-2-8-4` (8:4) lets the body dominate and the image play a supporting role
- The left column holds multiple information levels: kicker → big title → lead → body paragraph → callout (quote)
- The right-column image uses a **vertical 3:4** or square 1:1 to avoid competing with the left-column text for attention
- This layout suits scenarios with **a higher amount of page information** (unlike Layout 4 with just one quote)

---

## Appendix: Common grid templates

| Class | Ratio | Use |
|---|---|---|
| `.grid-2-6-6` | 6:6 (1:1) | split in half |
| `.grid-2-7-5` | 7:5 | text-dominant + supporting image |
| `.grid-2-8-4` | 8:4 (2:1) | long text + small image/data |
| `.grid-3` | 1:1:1 | 3 items side by side (cases/screenshots) |
| `.grid-3-3` | 3×2 | 6-image matrix |
| `.grid-6` | 3×2 | 6 data cards |

Every grid reserves `gap: 3vw 4vh` (horizontal 3vw, vertical 4vh), which you can override individually.

---

## Page rhythm suggestion

For a 25-30 page talk, the following rhythm is recommended:

1. **Hero Cover** (page 1)
2. **Act Divider** (act 1 opening, hero light or hero dark)
3. **Big Numbers** (throw out hard data for impact)
4. **Quote + Image** (cover the identity twist / hook)
5. **Image Grid** (supporting evidence)
6. **Hero Question** (act close, leave suspense)
7. ... acts 2 and 3 follow the same rhythm ...
8. **Hero Close** (last page, a question or thanks)

Hero pages and non-hero pages should alternate at a **2-3 : 1 ratio**; don't run more than 3 consecutive non-hero pages, nor more than 2 consecutive hero pages.
