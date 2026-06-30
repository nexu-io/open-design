# Components

Shared component spec for both seed templates. Read this when you need to look up a class, a font size, or a hard rule that recurs across recipes. Per-recipe details live in `layout-recipes.md`; per-theme color tokens live in `theme-presets.md`.

## Font Stacks

Editorial Magazine x E-ink (`template-editorial-card.html`):

- `--serif-zh`: Noto Serif SC, Songti SC, STSong — display titles.
- `--serif-en`: Playfair Display, italic for subtitles and pull quotes.
- `--sans-zh`: Noto Sans SC, PingFang SC — utility text and fallback; body and lead default to serif-zh in Editorial.
- `--sans-en`: Inter — Latin body in mixed content.
- `--mono`: IBM Plex Mono — labels, page metadata, issue strip, captions.

Swiss International (`template-swiss-card.html`):

- `--sans`: Inter, Helvetica Neue, Helvetica.
- `--sans-zh`: Noto Sans SC, PingFang SC — Chinese body.
- `--mono`: IBM Plex Mono — labels, captions, t-meta.

Never load a serif font in the Swiss template. Never let the Editorial template lose its serif display family.

## Type Scale + Weight Mapping

Both templates follow the rule **"the larger, the lighter."** Small text always uses heavier weight than large text. On 1080x1440 boards, the minimum readable size is 22-28px after factoring in mobile downsample.

Editorial scale (default for 3:4):

| Role        | Class       | Size  | Weight | Tracking | Family    |
| ----------- | ----------- | ----- | ------ | -------- | --------- |
| Display     | `.h-display`| 124px | 500    | +.04em   | serif-zh  |
| Section ttl | `.h-xl`     |  88px | 500    | +.03em   | serif-zh  |
| Mid title   | `.h-md`     |  56px | 500    | +.02em   | serif-zh  |
| Subtitle    | `.h-sub`    |  36px | 400 it | normal   | serif-en  |
| Pull quote  | `.pullquote`|  64px | 500 it | normal   | serif-zh  |
| Lead        | `.lead`     |  28px | 400    | normal   | **serif-zh** |
| Body        | `.body`     |  24px | 400    | normal   | **serif-zh** |
| Kicker      | `.kicker`   |  21px | 500    | +.22em   | mono      |
| Meta        | `.meta`     |  18px | 500    | +.20em   | mono      |
| Label       | `.label`    |  18px | 500    | +.20em   | mono      |

> **Restored 2026-05-27.** The previous defaults (900 / 700 / 700 / sans body / `−.01em`) made Editorial cards read as heavy infographic banners. They are NOT the Guizang showcase aesthetic — see `local-tests/demo-showcase/editorial.html` for the source-of-truth. The rule is restrained typography: light weights, **serif body italic-tolerant**, **wide tracking** on display + mono. Heaviness in Editorial = visual demotion to "generic landing-page", same trap as Swiss.

Swiss scale (default for 3:4):

| Role        | Class         | Size  | Weight | Family    |
| ----------- | ------------- | ----- | ------ | --------- |
| Hero        | `.h-hero`     | 240px | 200    | sans      |
| Statement   | `.h-statement`| 180px | 200    | sans      |
| Section ttl | `.h-xl`       | 120px | 300    | sans      |
| Mid title   | `.h-md`       |  56px | 400    | sans      |
| Mega number | `.num-mega`   | 200px | 200    | sans      |
| XL number   | `.num-xl`     | 144px | 200    | sans      |
| Lead        | `.lead`       |  30px | 400    | sans-zh   |
| Body        | `.body`       |  26px | 400    | sans-zh   |
| Category    | `.t-cat`      |  22px | 600    | sans      |
| Meta        | `.t-meta`     |  20px | 500    | mono      |
| Caption     | `.swiss-img-caption` | 18px | 500 | mono   |

Both templates auto-shrink display sizes inside `.poster.square` and `.poster.wide`. You usually do not override them. Override only when a single title cannot be shortened further.

### Chinese Title Length Bands

Chinese characters are visually denser than Latin. Pick a band before sizing:

| Title shape                                | Editorial display | Swiss h-hero |
| ------------------------------------------ | ----------------- | ------------ |
| 1 line, <= 6 Chinese chars                 | 132px (default)   | 240px (default) |
| 1 line, 7-10 chars                         | 108px             | 200px        |
| 2 lines, each <= 8 chars                   | 96px              | 180px        |
| 2 lines, any line 9-12 chars               | 84px              | 152px        |
| 3 lines (rare)                             | 72px              | 132px        |

If the title still does not fit, **shorten the copy first**. Never solve overflow by shrinking body text below the minimum readable size.

### Swiss `.h-xl` — Hard Caps per Board (validated)

The seed template ships these caps. Anything more violates the vertical budget — verified empirically in `local-tests/smoke-ai-tools/`:

| Board                | Default `.h-xl` | Max lines | Max chars / line | What happens past the cap                                          |
| -------------------- | --------------- | --------- | ---------------- | ------------------------------------------------------------------ |
| `.poster.xhs` (1080×1440) | 96px       | 2         | 8                | 3-line title pushes ledger/matrix past 1440 — push content off-canvas |
| `.poster.square` (1080×1080) | 88px   | 2         | 7                | Bottom card or metadata strip clips                                 |
| `.poster.wide` (2100×900)   | 104px   | 1         | 14               | Wraps to 2 lines and crowds the right column                        |

**If your title needs 3 Chinese lines on `.poster.xhs`:** switch the recipe from S03/S10/S12 (data-heavy) to S01/S05 (cover-style) where the title can dominate. Don't shrink `.h-xl` below 80px — small + heavy reads as Web1.0.

### Editorial `.h-xl` — Hard Caps per Board (validated)

The Editorial seed default for `.h-xl` is 88px serif weight 500. Verified in `local-tests/demo-smoke-editorial-travel/` on M11/M14/M07 with 3-paragraph body + ledger + 5-step pipeline:

| Board                | Default `.h-xl` | Max lines | Max chars / line | What happens past the cap                                                 |
| -------------------- | --------------- | --------- | ---------------- | ------------------------------------------------------------------------- |
| `.poster.xhs` (1080×1440) | 88px       | 2         | 9                | 3 lines push the marginalia / ledger / pipeline rows past the issue strip |
| `.poster.square` (1080×1080) | 78px   | 2         | 8                | Sub-paragraph or pull-quote clips                                          |
| `.poster.wide` (2100×900)   | 96px    | 1         | 16               | Wraps and crowds the marginalia column                                     |

The smoke deck's p2 title `第三次进山,装备比上一次轻 3.4kg` is the 2-line × 9-char limit and worked. The `<br>` was load-bearing — let CJK auto-wrap freely on `.h-xl` and you get awkward breaks. Hard-break manually at semantic seams.

**Per-recipe nuance:**
- M11 (Marginalia Essay): 2-line title leaves room for **3 paragraphs of 3-4 sentences each** in a 700px main column, and 5-7 marginalia rows in a 220px aside.
- M14 (Vertical Pipeline): 2-line title + **5 steps** (each step-title 42px serif + step-desc 26px sans, 28px gap) hits the 1440 floor exactly — adding a 6th step requires shrinking title to 1 line.
- M07 (Field Ledger): 2-line title + **5 ledger rows** with both `.ledger-title` and `.ledger-note` ≈ 100-120px row height — exactly fills. 6 rows requires 1-line title.

### Matrix + hero-stat-bottom on `.poster.xhs`

`.matrix-fill` with `grid-auto-rows: min-content` is the safe default on `xhs`. Hard limits:

| Cells | Rows | Pair with hero-stat-bottom? | Notes                                             |
| ----- | ---- | --------------------------- | ------------------------------------------------- |
| 4     | 2    | Yes — comfortable           | Cells get 200+ px each                            |
| 6     | 3    | Yes — recommended           | The sweet spot                                    |
| 8     | 4    | Only with shortened title + `num-mega` 110-128px | Compressed; do not also use 3-line title |
| 10+   | 5+   | **No**                      | Use S10 H-Bar Chart instead — that pattern scales |

## Minimum Readable Sizes (mobile-safe)

A 1080x1440 PNG is usually viewed on a phone at 360-420 logical pixels wide. Anything below the listed size becomes unreadable:

| Role                | Minimum | Notes                                    |
| ------------------- | ------- | ---------------------------------------- |
| Body / paragraph    | 28px    | Editorial, Swiss alike                   |
| Lead                | 30px    | The "1.5x body" guard                    |
| Caption / kicker    | 20px    | Do not drop below 18px                   |
| Label / meta strip  | 20px    | Mono only                                |
| Cell title in grids | 24px    | Matrix / brief cards                     |
| Number annotation   | 22px    | Stat-card .lbl, ledger .sub              |

If you cannot fit the copy, cut the copy. Do not shrink type.

## Card Fills — Swiss Only, Mutually Exclusive

Four card classes exist; **never combine them on the same node:**

- `.card-ink` — solid black ink, paper text. Use for one statement card.
- `.card-accent` — accent fill, accent-on text. Use sparingly; max one accent card per poster.
- `.card-fill` — grey-1 fill, ink text. The workhorse for matrix / brief / takeaway grids.
- `.card-outlined` — transparent + 1px grey-2 border, ink text. Use when you need a card without weight.

Multi-card grids must use **the same** card class for every cell, except a single accent highlight is allowed when one item is meant to stand out. Mixing `card-fill` with `card-outlined` in the same grid looks like sloppy templating.

The Editorial template intentionally does not provide card classes. Editorial layouts express hierarchy through type, rules, ledger rows, and column structure — not card backgrounds. If you find yourself wanting a card on an Editorial poster, you probably picked the wrong style mode.

## Image Containers

Both templates share the same `.frame-img` system. Always pick a standard ratio class. Never write `aspect-ratio: 2592/1798` style ad-hoc ratios.

| Class       | Ratio  | Use                                                |
| ----------- | ------ | -------------------------------------------------- |
| `.r-3x4`    | 3 : 4  | Default for portrait covers and field-note photos. |
| `.r-1x1`    | 1 : 1  | Square portraits, product objects, balanced grids. |
| `.r-4x3`    | 4 : 3  | Classic editorial photo, full-bleed top zone.      |
| `.r-3x2`    | 3 : 2  | Magazine inline figure.                            |
| `.r-16x9`   | 16 : 9 | Landscape photo, infographic.                      |
| `.r-16x10`  | 16 : 10| Default for left-text + right-image splits.        |
| `.r-21x9`   | 21 : 9 | WeChat 21:9 hero image, S08 Image Hero top zone.   |

Default `object-fit: cover` keeps `object-position: center 50%` (both templates). Use `.fit-contain` for UI screenshots, dense text, code, and infographics. Do not crop faces or product key features.

**Subject-aware cropping — always set `object-position` inline per photo.** The template default is a fallback, not a recommendation. Before each `<img>`, look at the source and ask: where is the subject? Then set `style="object-position:center N%"` on the `<img>` directly:

| Subject location in source            | Inline value             |
| ------------------------------------- | ------------------------ |
| Subject near top (sky-heavy landscape, face at top) | `center 25-35%`  |
| Subject centered (default)            | `center 50%` (omit, it's the default) |
| Subject mid-body (hiker, hands, mid-frame) | `center 55-65%` |
| Subject low (foreground gear, ledger, foot of frame) | `center 70-80%` |

The default `center 50%` will silently crop subjects out of frame on tall ratios (`r-3x4`, `r-21x9`). Every photo in a delivered package needs a deliberate `object-position` — even if the conclusion is "50% is fine here." Catch this in the render-check pass: if the subject is more than 1/3 outside the visible crop, fix it before delivering.

**Caption class name (don't get this wrong):**
- Editorial template: `.img-cap` — 18px mono, applied to `<figcaption>` under `.frame-img`. Writing `.cap` falls back to browser-default 16px and trips R4.
- Swiss template: `.swiss-img-caption` — same role, 18px mono.

There is no shared `.cap` class. If you see `.cap` in a draft, fix it before render.

## Screenshot Containers (.frame-shot)

For UI screenshots / web captures / code shots, use `.frame-shot` (both seeds carry it). It defaults to `object-fit: contain` so the source pixels stay pristine — the opposite of `.frame-img`. See `references/screenshot-treatment.md` for the full parameter matrix.

Quick summary of style-locked defaults (don't second-guess these):

| Style     | Corners      | Shadow       | Default bg   | Default inset |
| --------- | ------------ | ------------ | ------------ | ------------- |
| Swiss     | `corners-sq` | `shadow-none`| `bg-grey-1`  | `inset-sub`   |
| Editorial | `corners-sm` | `shadow-soft`| `bg-paper-2` | `inset-sub`   |

Two device wrappers (`.device-browser`, `.device-phone`) ship in both templates and provide CSS-only browser chrome / phone bezel — no SVG, no image deps. Wrap one `.frame-shot` per chrome.

## Map Block (.map-block)

For content with spatial relationships (routes, neighborhoods, store locations). Both seeds ship `.map-block` + `.map-pin` + `.map-legend`. Pick the map source by how literal the location needs to be — see `references/map-component.md` for the full playbook:

- **Mode T** (default for travel / route / wayfinding) — Mapbox Static Images API URL as `<img>` source; needs `MAPBOX_ACCESS_TOKEN`. Apply `tone-paper` (Editorial) or `tone-paper` saturation-0 (Swiss).
- **Mode O** — OSM static tile composite, fallback when no Mapbox token is available and the map still needs to be geographically real.
- **Mode S** — schematic SVG drawn in `viewBox="0 0 100 100"` for conceptual or abstract relation maps only.

Hard limits: ≤6 pins per board, ≤1 accent pin, no SVG text labels (names go in `.map-pin .card`).

## Spacing Tokens (Swiss only)

Swiss template exposes a Carbon-style 2x scale. Stick to these tokens — arbitrary `px` margins drift fast across posters.

| Token   | Value  | Typical use                                          |
| ------- | ------ | ---------------------------------------------------- |
| `--sp-3`|  8px   | Tight chip gap, inline meta spacing.                 |
| `--sp-4`| 12px   | Card inner gap, dense list rows.                     |
| `--sp-5`| 16px   | Body block bottom margin, lead-to-paragraph.         |
| `--sp-6`| 24px   | Card padding (compact), grid gap (tight).            |
| `--sp-7`| 32px   | Default grid gap.                                    |
| `--sp-8`| 40px   | Card padding (default), section gap (compact).       |
| `--sp-9`| 48px   | Section gap (default), pair-preview outer padding.   |
| `--sp-10`| 64px  | Major break between content blocks on portrait.      |
| `--sp-11`| 80px  | Poster outer padding (square / wide).                |
| `--sp-12`| 96px  | Poster outer padding (portrait).                     |
| `--sp-13`| 160px | Wide poster horizontal padding only.                 |

Editorial template uses bare `px` for now because magazine layouts often want bespoke spacing for atmosphere. If you find a pattern that recurs, add an editorial token here.

## Icons

Default icon library is **Lucide** (loaded only by the Swiss template). Editorial layouts rarely need icons; when they do, use the same Lucide set, but limit to one or two per poster.

Rules:

- No emoji anywhere. Emojis ruin both styles.
- Use angular Lucide icons (`arrow-right`, `check`, `triangle-alert`, `dot`, `plus`, `equal`, `slash`). Avoid pillow-rounded icons (`smile`, `heart-filled`) — they fight Swiss geometry.
- Icon stroke weight: 1.5 (Lucide default). Do not thicken.
- Size: 56px for ledger row indicators, 32px inline with body, 24px in chips. Never below 20px.
- Color: `var(--accent)` for highlight, `var(--grey-3)` for neutral, `var(--ink)` for primary. Never gradient.

To add an icon:

```html
<i data-lucide="arrow-right" width="32" height="32"></i>
```

The Swiss template runs `lucide.createIcons()` on load. If you inject icons after load, call it again manually.

## Issue Label and Corner Metadata

Social cards do not have PPT's chrome/foot dual-row metadata. They use a single, quiet element instead.

Editorial issue elements:

- `.issue-row` — top: "Vol. 01 · 2026.05" with a small accent dot between segments.
- `.issue-strip` — bottom band: 3-5 short labels separated by em-dashes, above a hairline.

Swiss issue elements:

- `.chrome-min` — top single row with category on left, date/issue on right, bottom hairline.
- `.t-meta` — inline mono uppercase metadata anywhere on the poster.

One issue element per poster. Never both top issue strip and bottom issue strip on the same poster — it looks like decoration.

## Layout Primitives

Both templates share the same primitives (different default gaps).

| Class            | Editorial gap   | Swiss gap       | Use                                  |
| ---------------- | --------------- | --------------- | ------------------------------------ |
| `.stack`         | flex column     | flex column     | Default vertical flow.               |
| `.row`           | flex row        | flex row        | Horizontal flow.                     |
| `.gap-1`...`-5`  | 12-64px         | 8-16px          | Editorial gaps (px) vs Swiss (token).|
| `.gap-6`...`-10` | n/a             | 24-64px         | Swiss only — Carbon scale.           |
| `.col-2-7-5`     | 7:5 split       | n/a             | Editorial only — quote + image.      |
| `.col-2-8-4`     | 8:4 split       | n/a             | Editorial only — text-heavy + image. |
| `.grid-12`       | n/a             | 12-col grid     | Swiss only.                          |
| `.span-N`        | n/a             | grid column span| Swiss only.                          |
| `.grid-3`        | 3 columns       | 3 columns       | Both.                                |

## Hard Rules (Shared)

These rules guard the visual identity. Violations are almost always wrong.

1. Pick exactly one style mode per package. Never mix Editorial and Swiss.
2. Pick exactly one theme/accent per package. Never combine two palettes.
3. No emojis, ever. Use Lucide or restrained type.
4. No fake data, no fake percentages, no `Lorem` text in delivered output.
5. No `border-radius`, `box-shadow`, or `linear-gradient` in Swiss.
6. No flat one-color background in Editorial — paper grain + optional WebGL atmosphere is required on hero / quote / sparse pages.
7. Every `.poster` must have stable export dimensions. Never use `vw` / `vh` in poster content.
8. Every image must be wrapped in `.frame-img` with a standard ratio class.
9. Multi-card grids use one card class. One accent card maximum.
10. Honor the type scale and minimum sizes. Cut copy before shrinking type.
