# Components Reference

This is the component handbook for the `magazine-web-ppt` skill. template.html already defines all the styles; this file only describes "what each component looks like and how to use it."

## Contents

- [Base Slide shell](#base-slide-shell)
- [Typography](#typography)
- [Chrome & Foot](#chrome--foot)
- [Callout](#callout)
- [Stat number matrix](#stat-number-matrix)
- [Platform card](#platform-card)
- [Rowline table row](#rowline-table-row)
- [Pillar card](#pillar-card)
- [Tag & Kicker](#tag--kicker)
- [Figure image frame](#figure-image-frame)
- [Icons](#icons)
- [Ghost giant background text](#ghost-giant-background-text)
- [Highlight](#highlight)

---

## Base Slide shell

Every page is a `<section class="slide ...">`. It must include the `data-theme` attribute (`light` or `dark`); the JS switches the background based on this attribute when paging.

```html
<section class="slide light" data-theme="light">   <!-- light page -->
<section class="slide dark" data-theme="dark">     <!-- dark page -->
<section class="slide light hero" data-theme="light">  <!-- Hero page: light + thin overlay revealing WebGL -->
<section class="slide dark hero" data-theme="dark">    <!-- Hero page: dark + thin overlay -->
```

**Using light vs dark: alternate them**, switching theme every 2-3 pages, and avoid more than 3 consecutive pages of the same color. When paging, the WebGL background fades smoothly between the two shaders.

**Using the hero class**: only add it to visually dominant pages (cover, quote pages, act transitions, ending). After adding `hero` the overlay drops to 12-16% and the WebGL background shows through heavily, so don't put too much text on a hero page.

---

## Typography

The type division of labor is this template's most important rule; mixing is strictly forbidden.

| Class | Use | Font |
|---|---|---|
| `.display` | Extra-large English (hero page) | Playfair Display 700, 11vw |
| `.display-zh` | Extra-large Chinese headline | Noto Serif SC 700, 7.8vw |
| `.h1-zh` | Page main title | Noto Serif SC 700, 4.6vw |
| `.h2-zh` | Subtitle | Noto Serif SC 600, 3.2vw |
| `.h3-zh` | Pipeline step title | Noto Serif SC 500, 1.9vw |
| `.lead` | Lead paragraph (larger than body) | Noto Serif SC 400, 1.9vw |
| `.body-zh` | **Body / description (sans-serif)** | Noto Sans SC 400, 1.22vw |
| `.body-serif` | Body (serif) | Noto Serif SC 400, 1.3vw |
| `.kicker` | Section hint (above the title) | IBM Plex Mono, 12px uppercase |
| `.meta` | Metadata label | IBM Plex Mono, 0.88vw uppercase |
| `.big-num` | Giant number | Playfair Display 800, 10vw |
| `.mid-num` | Medium number | Playfair Display 700, 5.5vw |

**Core rules**:
- **Serif** (`serif-zh` / `serif-en`): titles, key quotes, numbers: used for "visual accent"
- **Sans-serif** (`sans-zh`): body descriptions, long reading content: used for "information density"
- **Monospace** (`mono`): the English labels in kicker, meta, foot: used for "decorative rhythm"

**Emphasis techniques**:
- `<em class="en">English word</em>`: renders the English word in Playfair Display italic (looks great)
- `<em style="opacity:.65">phrase</em>`: fades out the second half of a title to create rhythm

---

## Chrome & Foot

The metadata bars at the top and bottom of every page. Almost every page should have them.

```html
<div class="chrome">
  <div class="left">
    <span>第一幕 · 硬数据</span>
    <span class="sep"></span>
    <span>Act I</span>
  </div>
  <div class="right"><span>02 / 27</span></div>
</div>

<!-- ... page body ... -->

<div class="foot">
  <div class="title">项目名 · CodePilot　|　github.com/codepilot</div>
  <div>Act I · Dev Numbers</div>
</div>
```

**Rules**:
- `chrome.right` always holds the page number `NN / TOTAL` (TOTAL is the total page count)
- `foot.title` is the Chinese caption, `foot.right` is the English act marker
- chrome and foot together form the magazine-like "header and footer"

---

## Callout

Displays a quote / key takeaway / someone else's words.

```html
<div class="callout" style="max-width:80vw">
  <div class="q-big">"这东西在三年前，<br>需要一个十人团队做一年。"</div>
  <span class="cite">— 一个观察者的判断</span>
</div>
```

Variants:
- Without cite: just drop the `<span class="cite">`
- With an English quote: `<em class="en">"Thin Harness, Fat Skills."</em>`
- Used on a hero page: add `style="position:relative;z-index:2"` to the outer element (so it isn't covered by the background overlay)

---

## Stat number matrix

Displays data metrics, often paired with `.grid-6` / `.grid-4`.

```html
<div class="grid-6">
  <div class="stat">
    <span class="m">Duration</span>
    <span class="n">64<em style="font-size:.4em;opacity:.5;font-style:normal"> 天</em></span>
    <span class="l">从 0 到现在</span>
  </div>
  <!-- ... more stats ... -->
</div>
```

Three-part structure: `.m` mono small label → `.n` giant number → `.l` description. The unit after the number uses `<em>` shrunk to 0.4em, opacity 0.5.

**Common layout containers**:
- `.grid-6`: 3×2 grid (most common, 6 stats)
- `.grid-4`: 2×2 grid (4 stats)
- `.grid-3`: 3 equal columns in one row (3 stats / pillars)

---

## Platform card

Displays a social platform / channel + follower count.

```html
<div class="plat">
  <div class="sub">Weibo</div>
  <div class="name">微博</div>
  <div class="nb">289K</div>
</div>
```

Optional fourth line (supplementary note):
```html
<div class="body-zh" style="font-size:max(11px,.8vw);opacity:.5;margin-top:.6vh">
  含小绿书同步
</div>
```

**"Also On" variant** (additional platforms):
```html
<div class="plat" style="border-top-style:dashed;opacity:.72">
  <div class="sub">Also On</div>
  <div class="body-zh" style="font-weight:600;margin-top:.8vh">
    B 站　·　知乎
  </div>
</div>
```

---

## Rowline table row

List-style content, one entry per row.

```html
<div class="rowline">
  <div class="k">CLAUDE.md</div>
  <div class="v">你该怎么做事 —— 行为规则 + 工作偏好 + 禁止事项</div>
  <div class="m">EMPLOYEE · HANDBOOK</div>
</div>
```

Three-column structure: `.k` serif keyword · `.v` body description · `.m` mono label (right-aligned). The first and last rowline automatically get a top/bottom border.

**Variant: 2 columns**: `style="grid-template-columns:1fr 3fr"` drops the `.m` column.

---

## Pillar card

A three-pillar structure, often used for "concepts side by side" pages.

```html
<div class="grid-3">
  <div class="pillar">
    <div class="ic">01</div>
    <div class="t">三层<br>文档体系</div>
    <div class="d">CLAUDE.md<br>+ 项目知识库<br>+ 护栏文件</div>
  </div>
  <!-- ... more pillars ... -->
</div>
```

**Pillar with an icon (for emphasis pages)**:
```html
<div class="pillar" style="padding:4vh 2vw;border:1px solid currentColor;border-color:rgba(10,10,11,.2)">
  <div class="ic"><i data-lucide="compass" class="ico-lg"></i></div>
  <div class="t">判断力</div>
  <div class="d">决策和方向的权威。<br>取舍、品味、方向感。</div>
</div>
```

`.ic` can be a sequence number (`01 / 02 / 03` or `A. / B. / C.`) or a Lucide icon.

---

## Tag & Kicker

**Kicker** is the small hint text above the title (mono, all caps, small size):
```html
<div class="kicker">过去 64 天 · 开发篇</div>
<div class="h1-zh">一个人，做了什么。</div>
```

**Tag** is a standalone label pill (with a border):
```html
<div style="display:flex;gap:1.6vw;flex-wrap:wrap">
  <div class="tag">早上 10 点起床</div>
  <div class="tag">周二 / 四下午健身</div>
  <div class="tag">晚上照样看剧 · 玩游戏</div>
</div>
```

---

## Figure image frame

**This is the component most prone to pitfalls in this template; be sure to follow the rules below**.

### Base structure

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

### Key constraints (hard-won lessons, do not break)

1. **Must use a fixed `height:Nvh`**, not `aspect-ratio`.
   - Reason: using aspect-ratio in a grid breaks the parent container and makes images stack.
   - Recommended sizes: `height:18vh` (compact strip) / `22vh` (standard grid) / `26vh` (featured) / `28vh` (large image).

2. **`object-position:top center` (already set in the CSS)**, only the bottom may be cropped.
   - Cropping the sides or top is strictly forbidden: that is the image's core identity area.

3. **For multiple images in a grid, use an inline grid rather than `grid-3`**:
   ```html
   <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1vh 1.2vw">
     <figure class="tile">...</figure>
     <figure class="tile">...</figure>
     <figure class="tile">...</figure>
   </div>
   ```

4. **Aligning the image with the rest of the layout**: add `align-self:end` to the figure alone to push the image to the bottom.

### Frame Caption variants

```html
<!-- Standard: figure name on the left, number on the right -->
<figcaption class="frame-cap">
  <span class="pf">推特 · Twitter</span>
  <span class="nb">137K</span>
</figcaption>

<!-- Numbered -->
<figcaption class="frame-cap">
  <span class="idx">01</span>
  <span class="pf">AI 润色</span>
  <span>Polish</span>
</figcaption>
```

### Image placeholder (design-phase placeholder)

When the image isn't in place yet, use a dashed frame as a placeholder:
```html
<div class="img-slot r-4x3">  <!-- r-4x3 / r-16x9(default) / r-3x2 / r-1x1 -->
  <span class="plus">+</span>
  <span class="label">GitHub 截图位置</span>
</div>
```

---

## Icons

**Emoji are strictly forbidden**. Use Lucide via CDN (already included in template.html).

```html
<i data-lucide="compass" class="ico-lg"></i>     <!-- large icon (for pillars) -->
<i data-lucide="target" class="ico-md"></i>      <!-- medium icon (for list items) -->
<i data-lucide="check-circle" class="ico-sm"></i>  <!-- small icon (inline) -->
```

**Common Lucide icon names** (grouped by meaning):

- Judgment: `compass`, `target`, `crosshair`, `search-check`
- Relationships: `share-2`, `users`, `network`, `link`, `handshake`
- Brand: `crown`, `gem`, `award`, `star`, `badge-check`
- Process: `workflow`, `route`, `arrow-right-left`, `repeat`
- Data: `grid-2x2`, `bar-chart-3`, `trending-up`, `activity`
- Aesthetics: `palette`, `brush`, `eye`, `sparkles`
- Right/wrong: `check-circle`, `x-circle`, `check`, `x`
- Direction: `arrow-right`, `arrow-up-right`, `corner-down-right`

**Inline combination of icon and text**:
```html
<div class="h3-zh" style="display:flex;align-items:center;gap:.8em">
  <i data-lucide="target" class="ico-md"></i>
  判断 — 什么值得写
</div>
```

---

## Ghost giant background text

Used as "decorative background text," extremely low opacity, to create a magazine feel.

```html
<div class="ghost" style="right:-6vw;top:-8vh">BUT</div>
<div class="ghost" style="left:-8vw;bottom:-18vh;font-style:italic">Harness</div>
```

- Size 34vw, opacity 0.06
- Common positioning: `right:-6vw;top:-8vh` (overflowing top-right) / `left:-8vw;bottom:-18vh` (overflowing bottom-left)
- Content: an English word or number (act number 01/02/03, keyword BUT/NOW/HERE)

**Note**: on a page that uses ghost, other content should add `position:relative;z-index:2` to avoid being pushed underneath.

---

## Highlight

The "highlighter" effect on an inline phrase:

```html
<span class="hi">不是</span>
<span class="hi">一次性爆发</span>
```

It generates a semi-transparent highlight bar at the bottom of the text. A dark theme uses a bright bar, a light theme a dark bar (the CSS handles this).

**Best for**: use on only 1-3 key words, not across large areas.
