# Layout Recipes

These are static social-image recipes adapted from the Guizang PPT style language. They are not copied PPT templates.

## Editorial Magazine x E-ink Recipes

These structures (ledger / marginalia / pull-quote / photo-well / pipeline-vertical) work for **any topic** that wants a magazine-feature pace — outdoor, AI, finance, food, workplace, gaming, all welcome. The mode is a visual stance, not a content filter. See `style-system.md` "Style ↔ content type are decoupled" for the full reasoning.

Portrait rule:

- Every 3:4 page should occupy the vertical canvas intentionally. If the content only creates a thin table, switch to M08/M09/M10 below or add a large pull quote, evidence image, marginal column, or full-height ledger.

**Content density rule (hard)**: on 1080×1440 cards, content must cover ≥75% of canvas height. Any pure-whitespace band >15% canvas height (>216px) needs a stated reason — hero-image breathing, single-sentence statement, or leading/trailing margins (combined ≤15%). Do NOT use `<div style="flex: 1"></div>` to push content to the vertical centre — Editorial magazines absorb whitespace across opposing pages; social cards are scrolled one at a time and under-filled cards read as "PowerPoint with a missing element." Each recipe below carries a `Minimum density:` line indicating the smallest content set that fills a 3:4 canvas. If your copy doesn't reach that floor, **shorten the canvas (switch to 1:1) or pick a different recipe** — never just publish under-filled.

### M01 Cover: Magazine Issue Cover

Best for Rednote page 1, portrait social cards, or article-card covers.

Structure:

- Top issue row: category, date, ratio, or account label.
- Large serif/Songti-like title, usually 2-4 lines.
- One large image or photo crop occupying 35%-55% of the page.
- Bottom issue strip with 3-5 points.

Style:

- Paper background, deep ink title.
- Photo can bleed inside a large rectangular well.
- Accent appears as one vertical rule, page number, or small label.

### M02 Field Note Photo

Best for outdoor, object, hardware, or real-world observation.

Structure:

- Large documentary photo.
- Narrow caption column or bottom caption band.
- One short takeaway in large type.

Use when the photo is evidence, not decoration.

### M03 Editorial Essay Split

Best for explaining one idea with nuance.

Structure:

- Left: large title or pull quote.
- Right: 2-3 short paragraphs or numbered fragments.
- Thin rule between columns.

Keep paragraphs short. If it becomes dense, split the page.

**Minimum density (3:4)**: title + 3 short paragraphs OR title + 2 paragraphs + numbered footer list. Title alone is M04, not M03. If you have only a title + 1 paragraph, switch to M04 Pull Quote or fold a marginal column in for M11 Marginalia Essay.

### M04 Pull Quote / Thesis

Best for a core sentence or conclusion.

Structure:

- Large quote across the page.
- Small source/context row.
- Optional tiny note or issue marker.

Use to create rhythm between dense pages.

**Minimum density (3:4)**: this is the **one recipe** where ≤60% canvas content is allowed (hero statement = intentional whitespace). BUT you must add (a) source/context row 18-20px mono ≤15% from bottom, (b) date-stamp or 章号 kicker at top, (c) hairline rule above the source row. Without these three "anchor points," whitespace reads as missing content. Don't use M04 if you can't supply at least one anchor.

### M05 Checklist / Buying Guide

Best for Rednote practical content.

Structure:

- Header title.
- 4-6 rows, each with a number, item, and consequence.
- Optional small photo crop or material swatch.

Avoid generic rounded cards; use rows, rules, columns, and issue labels.

### M06 Evidence Wall

Best for multiple screenshots, references, or small images.

Structure:

- 2x2 or 3-column image grid.
- Each image has a short caption.
- One larger headline anchors the interpretation.

Use only when supplied images are readable at the final size.

### M07 Closing Note

Best for final page.

Structure:

- Big takeaway title (≤2 lines).
- **4-6 ledger items**, each 26-30px serif title + 16-18px serif sub-line ("consequence" / "reason" / "example"). Each item row should consume 100-140px vertical (border + padding + content).
- Closing block: pull-quote OR signature line OR price/CTA OR small marginalia (one of these is required).
- Small footer label.

Mood should feel like the end of a magazine feature, not a sales banner.

**Minimum density (3:4)**: title + **≥4 ledger items with sub-lines** + closing block. The previous "2-3 rules" version under-fills 3:4 by ~40%. If you genuinely only have 3 reasons, expand each to "title + 2-line consequence + example/quote" OR pair with a pull-quote closing block. **3 short ledger lines on a 3:4 canvas is a failure mode**; either expand or switch to M04 Pull Quote.

### M08 Tall Ledger

Best for lists, roles, pros/cons, gear items, product capabilities, and agent responsibilities.

Structure:

- Header title.
- 4-6 full-width rows.
- Each row minimum 118-170px on a 1080x1440 canvas.
- Left index/marginalia column, right title + consequence.
- Optional vertical accent strip or bottom issue note.

Use when a normal table would become too short. Do not let the ledger occupy only the middle third of the page.

### M09 Atmospheric Thesis

Best for sparse but important points.

Structure:

- WebGL/ink-flow background visible across the page.
- One very large thesis or quote.
- 1-2 supporting notes.
- Small issue metadata and a bottom rule.

Use this instead of forcing a small table onto a page with little content.

### M10 Evidence Feature

Best for supplied screenshots/photos.

Structure:

- Large screenshot/photo occupying 45%-65% of the vertical canvas.
- Headline and lead above or beside it.
- Bottom caption band with 2-3 takeaways.

The image is not an afterthought. If the screenshot is important, it must be big enough to inspect.

### M11 Marginalia Essay

Best for nuanced explanation with moderate text.

Structure:

- Wide editorial title.
- Main column with 2-3 paragraphs.
- Narrow marginal column containing keywords, quote fragments, or small evidence crops.
- Hairline vertical rule between columns.

Use this when M03 feels too empty but a ledger feels too mechanical.

### M12 Section Divider

Best for a mid-carousel breath between dense pages. Drop one between act 1 and act 2 of a 7-9 page Rednote set so the reader gets a beat of silence.

Structure:

- WebGL ink-flow background visible across most of the canvas (Editorial template mounts this by default).
- One mono `kicker` like `Act II` or `Part 2 of 3`.
- One large serif `h-display` naming the section (3-6 Chinese characters).
- One short subtitle in serif italic.
- Optional bottom `issue-strip` with the section's promise.

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-04">
  <canvas class="mag-bg" data-bg="ink-flow"></canvas>
  <div class="grain"></div>
  <div class="content stack gap-4" style="justify-content:center; align-items:flex-start">
    <p class="kicker">Act II · Part 2</p>
    <h1 class="h-display">实测结果</h1>
    <p class="h-sub">What actually happened.</p>
  </div>
  <div class="issue-strip">
    <span>Section · Findings</span>
    <span>—</span>
    <span>3 pages</span>
  </div>
</section>
```

Adapt for 1:1: drop the subtitle, center the `h-display`, keep the ink-flow background strong. Adapt for 21:9: shift title to the left half, let the WebGL atmosphere occupy the right half.

### M13 Hero Question

Best for the last page of a Rednote carousel or for a sharp pivot mid-set. The question is the entire page.

Structure:

- WebGL ink-flow background.
- Quiet kicker like `The Question` or `留给你的`.
- Big serif question, broken into 2-3 lines on `<br>` at semantic breakpoints (not random wraps).
- One short single-sentence prompt in `lead`, often a hint or invitation to comment.
- Minimal metadata at bottom.

**Minimum density (3:4)**: like M04, this is intentionally airy. Required anchors: top kicker (0-12% y) + bottom prompt + bottom metadata strip. The ink-flow WebGL background **must be visible** (don't let `.content` cover it). If the WebGL background is missing or the kicker is empty, the page reads as under-filled rather than meditative.

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-09">
  <canvas class="mag-bg" data-bg="ink-flow"></canvas>
  <div class="grain"></div>
  <div class="content stack gap-4" style="justify-content:center">
    <p class="kicker">The Question · 留给你的</p>
    <h1 class="h-display">
      下一次<br>
      你会先<br>
      问 AI 还是问朋友?
    </h1>
    <p class="lead">在评论区告诉我你的答案。</p>
  </div>
  <div class="issue-strip">
    <span>End · Page 9</span>
    <span>—</span>
    <span>欢迎留言</span>
  </div>
</section>
```

Title length cap: 3 lines, each <= 6 Chinese characters at default size. If the question is longer, shorten it; do not shrink the `h-display`.

### M14 Vertical Pipeline

Best for explaining a 3-5 step workflow, decision tree, or recipe. PPT's pipeline is horizontal; for portrait social cards rotate it vertical.

Structure:

- `kicker` + `h-xl` page title.
- 3-5 `.pipeline-v .step` rows. Each row has step number (mono), step title (serif), one-line description (sans).
- Hairline between steps, gap 28-36px.
- Optional small evidence image to the right of the title, or a single bottom caption.

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-06">
  <canvas class="mag-bg" data-bg="ink-flow"></canvas>
  <div class="grain"></div>
  <div class="content stack gap-3">
    <p class="kicker">Workflow · 4 步</p>
    <h2 class="h-xl">我的写作流水线</h2>
    <div class="pipeline-v">
      <div class="step">
        <div class="step-nb">01</div>
        <div>
          <h3 class="step-title">Draft</h3>
          <p class="step-desc">用语音备忘录把想法说出来</p>
        </div>
      </div>
      <div class="step">
        <div class="step-nb">02</div>
        <div>
          <h3 class="step-title">Reorder</h3>
          <p class="step-desc">用 AI 把段落顺序重新排</p>
        </div>
      </div>
      <div class="step">
        <div class="step-nb">03</div>
        <div>
          <h3 class="step-title">Polish</h3>
          <p class="step-desc">人工逐句去 AI 味</p>
        </div>
      </div>
      <div class="step">
        <div class="step-nb">04</div>
        <div>
          <h3 class="step-title">Ship</h3>
          <p class="step-desc">同时发小红书、推特、公众号</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

Hard limit: 3-5 steps. If you have 6+, split into two pages or switch to M05 Checklist.

### M15 Before / After

Best for "old way vs new way", "before AI vs after AI", "rookie vs pro" comparisons. PPT's Before/After is left-right; on 3:4 portrait, stack top/bottom to avoid pinched columns.

Structure:

- `kicker` + `h-xl` page title.
- `.beforeafter` container with two `.ba-block` rows: one with class `before` (dimmed at .68 opacity), one without.
- Each block has its own kicker, mid title, and 3-4 short bullets.

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-07">
  <canvas class="mag-bg" data-bg="ink-flow"></canvas>
  <div class="grain"></div>
  <div class="content stack gap-3">
    <p class="kicker">Before · After</p>
    <h2 class="h-xl">写作流的演变</h2>
    <div class="beforeafter">
      <div class="ba-block before">
        <p class="kicker">Before · 旧</p>
        <h3 class="h-md">在 Notion 里反复修</h3>
        <ul class="body" style="margin:0; padding-left:1.2em">
          <li>开头改了 20 遍</li>
          <li>每个段落都想精雕</li>
          <li>一周才发一条</li>
        </ul>
      </div>
      <div class="ba-block">
        <p class="kicker">After · 新</p>
        <h3 class="h-md">先发版,再迭代</h3>
        <ul class="body" style="margin:0; padding-left:1.2em">
          <li>20 分钟出初稿</li>
          <li>评论区做精修</li>
          <li>一天发三条</li>
        </ul>
      </div>
    </div>
  </div>
</section>
```

Adapt for 21:9: switch to left/right split (use `.col-2` grid). Adapt for 1:1: usually too cramped; consider M04 Pull Quote instead.

### M16 Image-Led Cover (Full-Bleed Hero)

Best for **lifestyle, image-heavy** content where the user has 1+ excellent photos: 旅行目的地 / 户外场景 / 自家成菜 / 家居一角 / 情感场景照. Photo fills the canvas; title rides on top with restraint. This is what M01 is **not** — M01 splits the canvas into photo + text blocks. M16 lets the photo own the canvas.

**Reference look**: Kinfolk / Cereal / Apartamento / Monocle covers. Quiet photo, serif title, paper-cream text, generous negative space, asymmetric placement. **NOT** game key-art with heavy black gradient. **NOT** travel poster with chunky bold caption.

**Required**: `references/image-overlay.md` Rule 1 Steps 1-4 must all pass. The first gate (photo selection) is the hardest — most photos fail it.

### Photo qualification (gate before choosing M16)

Run both tests on the user's photo. Both must pass, or **switch to M01** (split-layout) instead of forcing M16.

1. **Quiet-zone test**: photo has a band of ≥30% canvas (full width × ≥30% height, or full height × ≥30% width) that is low-detail / out-of-focus / uniform. This is where the title will land.
2. **Light test**: photo carries atmospheric/restrained light — overcast, dawn fog, golden hour, forest understory, dusk silhouette, film softness. Reject high-saturation noon shots, on-camera flash, generic tourist snaps.

If only one passes: try M01. If neither: ask user for a different photo, or use M01 with a smaller `.frame-img` slot. **Do not "fix it with a mask."**

**Page sequence convention** (this is the "image-led" pattern):

```
P1 (M16)               ← full-bleed photo + short title — the hook
P2 (S11 / M05 / M10)   ← ledger / checklist / mini-data — text-heavy rest stop
P3 (M02 or M16-small)  ← second photo as field-note evidence, not full-bleed
P4-N (M02 / M11)       ← more field notes or marginalia essays
P_last (M07 / M04)     ← closing note or pull quote
```

Never run two M16 in a row. After a full-bleed photo the eye needs text. P2 must be data/text.

**Four title-placement modes** — pick by subject map (from image-overlay.md Rule 2):

| Mode | Subject location | Title position | Tint (only if Step 4 contrast fails) |
| ---- | ---------------- | -------------- | ------------------------------------ |
| **A · 顶压底沉** (top kicker + bottom title) | Subject in middle third (face, peak, hero object), top + bottom open | Top: kicker 0-12% y. Bottom: 1-2 line title 72-92% y. | Try no tint. If needed: bottom-only radial, image-toned, peak α ≤ 0.30 over title block. |
| **B · 侧栏立柱** (vertical column) | Subject occupies a **clean** vertical column with ≥40% width safe opposite side. Skip B if subject edge is irregular (e.g. tree canopy spilling sideways) — use A or D instead. | Opposite column (~36-40% of width), stacked: kicker → title → subtitle | Try no tint. If needed: one-sided horizontal falloff `radial-gradient(45% 60% at 18% 50%, …)`, image-toned. |
| **C · 角落徽章** (corner badge) | Subject fills most of the frame; one corner is genuinely empty | Small block in the empty corner (≤35% w × ≤25% h): kicker / short title / meta | Light vignette only in that corner — never darken the whole image |
| **D · 下沉条带** (bottom ribbon) | Wide landscape / atmospheric scene / no single subject; abundant negative space at bottom | Bottom band 78-92% y: title + meta strip; align flush-left or flush-right (not centered) | Try no tint. If needed: bottom-only radial, image-toned, peak α 0.20-0.30 |

**Typography spec on 1080×1440 (Editorial × E-ink) — restrained, NOT chunky**:

| Element | Mode A | Mode B | Mode C | Mode D |
| ------- | ------ | ------ | ------ | ------ |
| Kicker  | mono 20-22px, uppercase, tracking 0.18-0.22em | mono 20-22px | mono 18-20px | mono 22-24px |
| Title font | Noto Serif SC **400-500** (NOT 700-900) | same | same | same |
| Title size | **88-108px**. Default 96px for 2-line zh title. Drop to 88px if 2 lines × ≥7 chars. | **84-100px**, wrap on phrase boundary | 56-64px (NOT display) | **96-112px**, single line preferred |
| Title tracking (zh) | 0.10-0.15em | 0.10-0.15em | 0.05-0.10em | 0.12-0.18em |
| Title line-height | 1.10-1.18 | 1.10-1.18 | 1.20 | 1.05-1.10 |
| Subtitle | optional `h-sub` 28-32px italic Playfair, tracking 0 | same | omit | same |
| Issue strip | mono 18-20px bottom, uppercase, tracking 0.20-0.25em, hairline above | omit | omit | mono 20-22px, tracking 0.20-0.25em |
| Text color | `#f5f1e8` (paper-cream, NOT pure white #fff) | same | same | same |
| Hairline color | `rgba(245, 241, 232, 0.35)` (paper at 35% alpha) | same | same | same |

**Forbidden in M16 type**:

- Title weight 700+ inline (e.g. `font-weight: 800` to "make it pop"). M16 wants **regular-medium serif**, not bold.
- Pure white `#fff` text — too clinical, fights the photo's warmth. Always paper-cream.
- Title size > 120px on 1080-wide canvas. We are not making travel posters.
- Latin sans-serif as primary title (Helvetica / Inter for the headline) — M16 belongs to serif. Sans only as kicker / meta / mono caption.
- Centered title on D mode. Always flush-left or flush-right for asymmetric Kinfolk feel.

**Title-length budget** (cut copy if you bust this — never shrink type below 84px):

| Mode | Max Chinese chars | Max lines |
| ---- | ----------------- | --------- |
| A    | 12 (2 × 6) or 14 (2 × 7 at 88px)  | 2 |
| B    | 14 (2 × 7)                         | 2 |
| C    | 8                                  | 1 |
| D    | 10                                 | 1 |

**Square (1:1, 1080×1080) and Wide (21:9, 2100×900) adaptations**:

- **1:1**: Use Mode A or Mode D only. Mode B's column squeeze, Mode C's corner are too tight on square. Shorten title to 6-10 chars.
- **21:9**: Use Mode B (left text column + right photo bleed) or Mode D (full-width bottom band). Mode A works but the bottom title competes with the WeChat caption strip — prefer D.

**HTML skeleton (Mode A — 顶压底沉 on 3:4, no mask)**:

```html
<section class="poster xhs" id="cover-image-led">
  <!-- subject map (cover hero — example: Yading lake at dawn):
       primary focus: snow peak at 50% x 32% y (middle band)
       safe text zone: top band (0-12% y) low-detail sky,
                        bottom band (72-95% y) calm water reflection
       quiet-zone test: PASS — bottom 30% is uniform water
       light test: PASS — dawn overcast, soft saturation
  -->
  <div class="hero-bleed" style="background-image: url('assets/hero-yading.jpg');
                                  background-size: cover;
                                  background-position: center center;
                                  position: absolute; inset: 0;"></div>
  <!-- NO MASK — quiet zone already provides contrast.
       Add only if Step 4 contrast check fails. -->
  <div class="content" style="position: relative; height: 100%;
        color: #f5f1e8; padding: 72px 80px;
        display: flex; flex-direction: column;">
    <p class="kicker" style="color: #f5f1e8; opacity: .85;
        font-family: var(--mono); font-size: 22px;
        letter-spacing: 0.22em; text-transform: uppercase; margin: 0">
      Vol. 04 — 2026 — 户外
    </p>
    <div style="flex: 1"></div>
    <h1 style="font-family: 'Noto Serif SC', serif;
        font-weight: 500; font-size: 96px; line-height: 1.12;
        letter-spacing: 0.12em; color: #f5f1e8;
        margin: 0 0 18px 0">
      在稻城<br/>看见冬天
    </h1>
    <div style="border-top: 1px solid rgba(245,241,232,.35);
         padding-top: 14px; font-family: var(--mono); font-size: 19px;
         letter-spacing: 0.22em; text-transform: uppercase;
         color: #f5f1e8; opacity: .85">
      DAY 1-4 · 4,200 M · −18°C
    </div>
  </div>
</section>
```

**HTML skeleton (Mode D — 下沉条带 on 21:9, for WeChat main cover)**:

```html
<section class="poster wide" id="wechat-21x9-led">
  <!-- subject map: wide atmospheric landscape, mist over lake at dawn
       quiet-zone test: PASS — entire bottom 35% is calm water + mist -->
  <div class="hero-bleed" style="background-image: url('assets/hero-yading-wide.jpg');
        background-size: cover; background-position: center 40%;
        position: absolute; inset: 0;"></div>
  <div class="content" style="position: relative; height: 100%;
        color: #f5f1e8; padding: 0 96px 88px;
        display: flex; flex-direction: column; justify-content: flex-end;
        align-items: flex-start;">
    <h1 style="font-family: 'Noto Serif SC', serif; font-weight: 500;
         font-size: 108px; line-height: 1.05; letter-spacing: 0.14em;
         margin: 0; color: #f5f1e8">
      在稻城看见冬天
    </h1>
    <div style="margin-top: 18px; border-top: 1px solid rgba(245,241,232,.35);
         padding-top: 14px; font-family: var(--mono); font-size: 20px;
         letter-spacing: 0.24em; text-transform: uppercase">
      VOL. 04 — DAY 1-4 — 4,200 M — 35MM
    </div>
  </div>
</section>
```

**Pitfalls**:

- Choosing M16 when the photo fails quiet-zone or light test. The cover will look bad no matter what mask you layer on. Fall back to M01.
- Putting Mode A's bottom title across someone's torso when the subject is in the lower third — re-run subject map and switch to Mode C, or change `object-position: center 70%`.
- Mode C with a heavy backdrop plate behind the corner title — defeats the point of having a great photo. Use vignette only.
- Using Mode B on a photo where the subject's silhouette is **irregular** (trees with sideways branches, scattered objects) — the "side column" won't be wide enough to be a true safe zone. Switch to Mode A or D.
- Adding a full-canvas vertical falloff "just in case." Mask-by-default kills the editorial look. The fix is photo selection, not opacity.
- Setting title weight 700+ or pure-white text — both are anti-pattern in Editorial M16.
- Running M16 on every cover. M16 is for **image-heavy lifestyle**. Product/tech/AI release covers still belong to S01 / S03 / M01.

## Swiss International Recipes

These structures (accent cover / matrix / KPI tower / h-bar / numbered statement) work for **any topic** that wants an engineered, quantified pace — software releases yes, but also travel budgets, fitness logs, recipe portions, reading stats, anything where you'd rather count it than narrate it. The mode is a visual stance, not a content filter.

### S01 Accent Cover

Best for Rednote cover.

Structure:

- Full accent or off-white background.
- Big light-weight title.
- Simple abstract system block, comparison, or two-node diagram.
- Bottom metadata strip.

Use one clear concept. No decorative blobs.

### S02 Two Signals / Comparison

Best for explaining two sources, two options, or two product directions.

Structure:

- Page title.
- Two large rectangular modules.
- One module may be ink-filled; the other paper/outlined.
- Short notes below each.

### S03 Data Layer / File Card

Best for Markdown, memory, source-of-truth, database, or state.

Structure:

- Large file-type or object block.
- List of 3-4 properties.
- Strong mono labels.

### S04 Interface / Browser Mock

Best for HTML, UI, presentation, interaction, or output layer.

Structure:

- Browser-window style frame with straight edges.
- Inside: one hero content block plus 2-3 functional modules.
- Bottom action or interaction strip.

### S05 Trap / Warning Rows

Best for problems, anti-patterns, and "do not do this" pages.

Structure:

- Big warning title.
- Three horizontal rows.
- Left mono label, right consequence.

Safety Orange works well here if the whole package uses it.

### S06 Pipeline / Architecture

Best for workflows and layered systems.

Structure:

- Three rows or columns: source, render, share.
- Each has number, label, action, and consequence.
- Use hairline boxes and neutral grey fills.

### S07 Takeaway Ledger

Best for final page.

Structure:

- Big thesis title.
- Three ledger rows with number, phrase, and compressed explanation.
- Dark or ink background can create closure.

### S08 Image Hero

Best for the WeChat 21:9 main cover and the Rednote cover when you have one strong photo or product render. The image fills the page; the title sits inside an overlay block; 3 quantified stats anchor the bottom.

Structure:

- `.chrome-min` top single row (category + date).
- `.image-hero` grid: `.hero-img-wrap` with one `.frame-img.r-21x9` photo (or `.r-3x2` on 3:4).
- `.hero-overlay-block` sitting over the upper-left of the image with `t-cat` kicker + `h-statement` title.
- `.hero-stats` row of 3 `.stat-block`s, each with a big `num` (e.g. `132K`) and a mono `lbl`.

HTML skeleton (21:9, the natural format for this recipe):

```html
<section class="poster wide" id="wechat-21x9-hero" data-accent="ikb">
  <div class="content stack gap-7">
    <div class="chrome-min">
      <span class="t-cat">Release · 产品</span>
      <span class="t-meta">2026.05 · v3.0</span>
    </div>
    <div class="image-hero">
      <div class="hero-img-wrap">
        <img src="assets/hero.jpg" alt="hero">
        <div class="hero-overlay-block">
          <p class="t-cat">Cover · 主封面</p>
          <h1 class="h-statement">下一代<br>写作工作流</h1>
        </div>
      </div>
      <div class="hero-stats">
        <div class="stat-block">
          <p class="num">132K</p>
          <p class="lbl">Weekly Writers</p>
        </div>
        <div class="stat-block">
          <p class="num">3.4×</p>
          <p class="lbl">Output Speed</p>
        </div>
        <div class="stat-block">
          <p class="num">98%</p>
          <p class="lbl">Ship Rate</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

Adapt for 3:4: keep the same `.image-hero` structure but swap `.r-21x9` to `.r-3x2`, drop overlay block down to 35% height. Adapt for 1:1: drop the overlay block entirely, push title above the image, keep at most 2 stats in `hero-stats`.

### S09 KPI Tower

Best for product-update pages, release notes, traffic dashboards, growth posts — anywhere 3-4 numbers need to be compared at a glance.

Structure:

- `kicker` + `h-xl` page title.
- `.kpi-tower-row` with 4 `.tower-col`s, each containing a `num`, `lbl`, and a `.bar-tower` whose height encodes the value via `style="--h:Npx"`.
- One column may carry the `.muted` modifier to drop the bar to neutral grey (use for a comparison baseline).

HTML skeleton (3:4 — template auto-collapses to 2 columns):

```html
<section class="poster xhs" id="xhs-data" data-accent="lemon-yellow">
  <div class="content stack gap-7">
    <p class="t-cat">Data · 半年增长</p>
    <h2 class="h-xl">六个月,四组数字</h2>
    <div class="kpi-tower-row">
      <div class="tower-col">
        <p class="num">132K</p>
        <p class="lbl">Subscribers</p>
        <div class="bar-tower" style="--h:320px"></div>
      </div>
      <div class="tower-col">
        <p class="num">3.4M</p>
        <p class="lbl">Reads</p>
        <div class="bar-tower" style="--h:220px"></div>
      </div>
      <div class="tower-col">
        <p class="num">68%</p>
        <p class="lbl">Repeat Visits</p>
        <div class="bar-tower" style="--h:160px"></div>
      </div>
      <div class="tower-col muted">
        <p class="num">8.2%</p>
        <p class="lbl">Conversion</p>
        <div class="bar-tower" style="--h:120px"></div>
      </div>
    </div>
  </div>
</section>
```

`--h` is a real height in px — pick values that proportionally encode the data. Do not invent numbers; if you only have 2 numbers, drop to 2 columns and use S03 File Card instead. Adapt for 21:9: keep 4 columns at the original width (it's where the layout shines). Adapt for 1:1: 2 columns max, taller bars.

### S10 H-Bar Chart

Best for rankings, comparisons of 5-10 items, "top N" lists, before/after pairs at scale. The bar fill encodes magnitude via `style="--w:NN%"`.

Structure:

- `kicker` + `h-xl` page title.
- `.h-bar-chart` grid with 5-10 `.bar-row`s.
- Each row: `.row-lbl` (Chinese item name), `.row-track` containing `.row-fill`, `.row-val` (mono number).

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-rank" data-accent="ikb">
  <div class="content stack gap-7">
    <p class="t-cat">Ranking · TOP 6</p>
    <h2 class="h-xl">本月最受欢迎的工具</h2>
    <div class="h-bar-chart">
      <div class="bar-row">
        <div class="row-lbl">Claude Code</div>
        <div class="row-track"><div class="row-fill" style="--w:94%"></div></div>
        <div class="row-val">94%</div>
      </div>
      <div class="bar-row">
        <div class="row-lbl">Cursor</div>
        <div class="row-track"><div class="row-fill" style="--w:78%"></div></div>
        <div class="row-val">78%</div>
      </div>
      <div class="bar-row">
        <div class="row-lbl">Linear</div>
        <div class="row-track"><div class="row-fill" style="--w:62%"></div></div>
        <div class="row-val">62%</div>
      </div>
      <div class="bar-row">
        <div class="row-lbl">Raycast</div>
        <div class="row-track"><div class="row-fill" style="--w:48%"></div></div>
        <div class="row-val">48%</div>
      </div>
      <div class="bar-row">
        <div class="row-lbl">Notion</div>
        <div class="row-track"><div class="row-fill" style="--w:36%"></div></div>
        <div class="row-val">36%</div>
      </div>
      <div class="bar-row">
        <div class="row-lbl">Obsidian</div>
        <div class="row-track"><div class="row-fill" style="--w:28%"></div></div>
        <div class="row-val">28%</div>
      </div>
    </div>
  </div>
</section>
```

Hard limits: max 6 rows on 1:1, max 10 rows on 3:4, max 8 rows on 21:9. On 3:4 the template stacks `row-lbl` above the track automatically — leave it alone. Always use real percentages or normalize the largest value to 100%; never fabricate.

### S11 Stacked Ledger

Best for shopping lists, expense rollups, agent capability inventories, or any "big number + label + icon" row stack where each item is quantified.

Structure:

- `kicker` + `h-xl` page title.
- `.stacked-ledger` containing 4-6 `.ledger-row`s.
- Each row: `.ledger-num` (large mono-feel sans number), `.ledger-lbl` (Chinese label + optional `.sub` secondary line), `.ledger-icn` (Lucide icon).

HTML skeleton (3:4):

```html
<section class="poster xhs" id="xhs-spend" data-accent="safety-orange">
  <div class="content stack gap-7">
    <p class="t-cat">Spend · 五月账单</p>
    <h2 class="h-xl">这个月我把钱花在哪</h2>
    <div class="stacked-ledger">
      <div class="ledger-row">
        <p class="ledger-num">¥1,280</p>
        <div class="ledger-lbl">订阅 · Subscriptions
          <span class="sub">Claude · Cursor · Linear</span>
        </div>
        <i class="ledger-icn" data-lucide="square-stack"></i>
      </div>
      <div class="ledger-row">
        <p class="ledger-num">¥860</p>
        <div class="ledger-lbl">书 · Books
          <span class="sub">6 本中文 · 2 本英文</span>
        </div>
        <i class="ledger-icn" data-lucide="book-open"></i>
      </div>
      <div class="ledger-row">
        <p class="ledger-num">¥540</p>
        <div class="ledger-lbl">咖啡 · Coffee
          <span class="sub">主要在 Manner 和 Seesaw</span>
        </div>
        <i class="ledger-icn" data-lucide="coffee"></i>
      </div>
      <div class="ledger-row">
        <p class="ledger-num">¥320</p>
        <div class="ledger-lbl">硬件 · Hardware
          <span class="sub">键盘配件 · 一根 USB-C</span>
        </div>
        <i class="ledger-icn" data-lucide="keyboard"></i>
      </div>
    </div>
  </div>
</section>
```

Hard limits: max 6 rows on 3:4, max 4 rows on 1:1, max 8 rows on 21:9. Pick angular Lucide icons (`book-open`, `coffee`, `bolt`, `square-stack`, `keyboard`) — never `heart-filled` or `smile`. If you cannot find numerical evidence, this is the wrong recipe; use S05 Trap Rows or M08 Tall Ledger.

### S12 Matrix + Hero Stat

Best for capability matrices, agent inventories, "this set covers X domains" pages where 8-12 small cells back a single bottom-line number.

Structure:

- `kicker` + `h-xl` page title.
- `.matrix-fill` grid of 8-12 `.matrix-cell`s. Each cell: `.cell-nb` (numbered mono label like `01`) and `.cell-title` (one short Chinese phrase).
- Exactly one cell may carry the `.is-accent` modifier to single out the most important capability.
- `.hero-stat-bottom` below the grid: left column with a kicker + short sentence, right column with one `num-mega` summary stat.

HTML skeleton (3:4 — matrix collapses to 2 columns):

```html
<section class="poster xhs" id="xhs-matrix" data-accent="lemon-green">
  <div class="content stack gap-7">
    <p class="t-cat">Capabilities · 能力清单</p>
    <h2 class="h-xl">一个 Agent,十二件事</h2>
    <div class="matrix-fill">
      <div class="matrix-cell"><p class="cell-nb">01</p><p class="cell-title">读取项目结构</p></div>
      <div class="matrix-cell"><p class="cell-nb">02</p><p class="cell-title">运行测试</p></div>
      <div class="matrix-cell is-accent"><p class="cell-nb">03</p><p class="cell-title">起草 PR 描述</p></div>
      <div class="matrix-cell"><p class="cell-nb">04</p><p class="cell-title">回滚错误改动</p></div>
      <div class="matrix-cell"><p class="cell-nb">05</p><p class="cell-title">迁移 lockfile</p></div>
      <div class="matrix-cell"><p class="cell-nb">06</p><p class="cell-title">检查类型</p></div>
      <div class="matrix-cell"><p class="cell-nb">07</p><p class="cell-title">追踪 issue</p></div>
      <div class="matrix-cell"><p class="cell-nb">08</p><p class="cell-title">阅读日志</p></div>
    </div>
    <div class="hero-stat-bottom">
      <div>
        <p class="t-cat">In total · 累计</p>
        <p class="lead">在 6 个仓库上,持续 4 周。</p>
      </div>
      <p class="num-mega">12</p>
    </div>
  </div>
</section>
```

Hard limits: 8 cells on 3:4 (2×4), 9 cells on 1:1 (3×3), 12 cells on 21:9 (4×3). Max one `is-accent` cell — two breaks the rhythm. The `num-mega` at bottom must agree with the cell count (`12` if 12 cells, `8` if 8); never display a number unsupported by the grid.

## WeChat Adaptation

For 21:9:

- Use M01/S01 as a wide composition, not a crop.
- Put title in the left or center-left safe area.
- Use the right half for photo/object/system visual.
- Enlarge title and subtitle spacing if the center feels empty.

For 1:1:

- Distill the long title into a simple centered title.
- If the user asks for no image, use type only.
- Avoid small subtitles and avoid photos by default.
- Keep the square readable as a thumbnail: one idea, big type, generous margins.

For pair preview:

- Put the `21:9` and `1:1` compositions in one HTML preview frame.
- The preview frame is for review only; do not treat it as a third required WeChat deliverable unless requested.
