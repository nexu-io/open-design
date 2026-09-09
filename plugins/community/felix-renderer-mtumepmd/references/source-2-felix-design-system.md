# Felix Design System

Version: 1.2  
Status: Ready for OpenDesign integration  
Primary canvas: 1080 × 1920 portrait

## Purpose

Felix Design System defines the persistent visual contract for Felix data visualizations. It governs color, typography, composition, data marks, bilingual labeling, authorship, motion continuity, and export-safe layout. Data meaning, source handling, research methods, rendering logic, and verification remain the responsibility of the `dataviz-felix` skill.

The visual posture is editorial and evidence-led: cool charcoal structure, restrained typography, generous negative space, and color reserved for data meaning or one deliberate brand accent.

## System boundary

Felix uses one Design System with multiple renderer templates. This document owns the visual rules shared across every template. A renderer template owns its visualization grammar, fixed layout profile, geometry, state mapping, and backend. Project data and domain interpretation remain outside both and are governed by the `dataviz-felix` skill and the project manifest.

Every renderer must name one layout profile from this document. A renderer may add documented series tokens or geometry required by its data semantics, but it must not redefine the six core tokens, typography roles, author identity, or export-safe layout rules.

## Core tokens

Bind these six tokens verbatim in OpenDesign artifacts:

```css
:root {
  --bg: oklch(0.145 0.012 230);
  --surface: oklch(0.205 0.014 230);
  --fg: oklch(0.942 0.006 170);
  --muted: oklch(0.690 0.018 220);
  --border: oklch(0.340 0.014 225);
  --accent: oklch(0.594 0.223 26.9);

  --font-display: "Iowan Old Style", "Baskerville", "Times New Roman", serif;
  --font-body: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  --font-mono: "IBM Plex Mono", "SFMono-Regular", "Cascadia Mono", "Menlo", monospace;
}
```

The accent is derived from the existing Zeno mark red `#e52629`. The light and dark logo structural colors map to the same cool-neutral family as `--fg` and `--border`; project artifacts should use the OKLch tokens rather than reintroducing raw hex colors.

### Extended semantic colors

These colors support data and interface states. They are not substitutes for the six core tokens.

```css
:root {
  --info: oklch(0.710 0.135 235);
  --success: oklch(0.700 0.145 155);
  --warning: oklch(0.790 0.145 82);
  --danger: var(--accent);
  --data-cyan: oklch(0.770 0.115 205);
  --data-blue: oklch(0.680 0.160 255);
  --data-yellow: oklch(0.840 0.145 95);
  --data-green: oklch(0.730 0.140 155);
  --data-magenta: oklch(0.690 0.180 345);
  --data-neutral: oklch(0.720 0.018 220);
}
```

Use semantic colors only when the data or state has that meaning. Never use the brand red merely to make an arbitrary series more prominent. When red carries a data meaning such as heat, warning, decline, or the red sector of an official light, omit decorative brand-red accents near the chart.

## Typography

### Roles

- Display: English titles, major years, headline numerics, and short editorial statements.
- Body: Chinese titles, bilingual labels, annotations, legends, explanatory copy, and source lines.
- Mono: units, dates, coordinates, algorithm names, parameter values, IDs, and compact metadata.

Chinese remains visually primary when Chinese and English are paired. English supports rather than duplicates the Chinese hierarchy.

### Master-canvas scale

| Role | Size | Line height | Weight | Notes |
|---|---:|---:|---:|---|
| Chinese title | 62 px | 1.12 | 600 | Prefer one or two balanced lines |
| English title | 30 px | 1.20 | 500 | Uppercase only for short labels |
| Kicker | 20 px | 1.30 | 600 | Mono, tracked 0.10em |
| Hero metric | 112–176 px | 0.92 | 500 | Display face; tabular numerals where available |
| Primary data label | 28–36 px | 1.20 | 600 | Keep readable at phone scale |
| Secondary annotation | 22–26 px | 1.35 | 400 | Use `--muted` only on `--bg` or `--surface` |
| Source / method | 18–21 px | 1.40 | 400 | Stable wording across video frames |
| Chinese creator credit | 22–24 px | 1.20 | 500 | One instance, upper right |
| English creator mark | 22–26 px | 1.20 | 500 | Paired with the Zeno icon |

Avoid a last line containing only one or two Chinese characters or one short English word. Adjust the text column and line break before reducing type size.

## Layout

### Master grid

- Canvas: 1080 × 1920.
- Editorial column: x = 120–960; width = 840.
- Header field: choose the source-backed layout profile below; do not move an approved header upward.
- Title rule: use the selected profile’s fixed coordinate; do not impose a universal y = 286–306.
- Main visual field: begins at least 48 px below the title rule.
- Footnote field: keep its first baseline at or above y = 1750.
- Essential content must remain within x = 120–960 and y = 96–1790.
- Preview through uniform scaling. Do not recompute master coordinates from the viewport.

### Header anatomy

1. Small bilingual or place-and-topic kicker at upper left.
2. One Chinese creator credit, `@一尺之棰`, right aligned at x = 960.
3. Chinese title.
4. English title.
5. One full-width structural rule.

Do not add a second English credit in the header. Do not add decorative rules that compete with the title rule.

### Main visual field

- Give the primary graphic at least 64 px of clear space from header and footnotes.
- Labels belong close to their marks; leaders should be short and unambiguous.
- Legends explain encodings that cannot be labeled directly. Do not repeat a direct label in a legend.
- Maps, charts, metrics, and annotations must remain inside the editorial column unless a deliberate full-bleed terrain or atmospheric field sits behind them.
- A full-bleed field is decorative context; data-bearing boundaries and labels remain within the safe area.

### Footer and source field

- Order: scope → unit/method → source → date/version.
- Use stable wording across all frames of a video.
- Keep detailed provenance, mappings, disputes, and transformation audit in the local manifest or README rather than crowding the frame.
- Do not use a footer slogan unless the task explicitly calls for one.

## Author identity

- Show `@一尺之棰` exactly once in the upper-right header.
- Show the Zeno vector mark with `zeno.yczc` exactly once in the main visual field.
- Place the English mark below the title rule and above the first footnote.
- Prefer a stable, low-information area within or immediately beside the main graphic.
- Keep it clear of labels, flags, axes, legends, boundaries, data marks, and the visual focus.
- Use the dark-background logo on dark compositions and the light-background logo on light compositions.
- Preserve the circle, horizontal rule, and six descending red bars.
- Icon size: 30–44 px. Gap to `zeno.yczc`: 10–12 px.
- Never tile, repeat, enlarge, or rotate the mark as a watermark.

In animation, keep the mark stable for the full duration. Move it only through a smooth transition when a changing data layer would otherwise collide with it.

## Data encoding

- Neutral structure uses `--fg`, `--muted`, and `--border`.
- Category colors belong to data marks and their directly associated values.
- Use the same data-to-color mapping in stills and animation.
- Filled areas, points, bars, lines with visible weight, or other explicit marks must carry the data. Empty outlines alone are insufficient.
- Reserve the highest contrast for the primary data relationship.
- Use no more than six categorical hues in one view. Above six, group, facet, filter, or label directly.
- Sequential scales vary lightness monotonically. Diverging scales require a meaningful midpoint.
- Missing, unknown, estimated, modelled, and observed values must remain distinguishable when those states affect interpretation.
- Flags, legal boundaries, display geometry, and numeric aggregation are separate semantic layers and require separate validation.

## Accent budget

The brand accent may appear in at most two intentional roles per screen:

1. Zeno mark bars.
2. One selected headline, active control, or primary action when red does not already encode data.

If the visualization uses red as a data encoding, the Zeno mark is the only decorative brand-red role.

## Motion

- Motion reveals real states, transformations, or documented transitions.
- Compute each frame from explicit time or snapshot state; never depend on the previously rendered frame.
- Keep titles, creator identity, source text, and method annotation pixel-stable unless the narrative explicitly changes them.
- Use one dominant transition grammar per piece: reveal, accumulation, comparison, or spatial movement.
- Do not animate neutral decoration independently from the data story.
- Initial phases used for visual rhythm must be documented as artistic parameters when they are not observations.
- Default finished video: 1080 × 1920, H.264, `yuv420p`, no audio unless requested.

## Interaction states for previews

- Minimum target size: 44 × 44 px.
- Every focusable element has a visible `:focus-visible` ring using `--accent` with an outer `--bg` separation.
- Hover and active states change background, border, position, or shadow while preserving foreground contrast.
- Selected controls may use `--fg` on `--surface`. Primary actions use `--bg` on `--fg`; use `--accent` for the action border, focus ring, or a non-text indicator.
- Tooltips use `--surface` with `--fg`, a `--border` edge, and no transparency that reduces readability over maps.
- Disabled controls are the only state allowed to reduce text contrast.

The source brand red does not provide 4.5:1 contrast with either `--bg` or `--fg` at normal text sizes. Do not use it as normal body text or as the background of a solid text button. It remains valid for the Zeno mark, large data marks, borders, focus rings, and other non-text graphics that meet the applicable 3:1 graphical contrast requirement.

## Light-background exception

The default Felix composition is dark. A light variant is permitted only when the subject, publication context, or user request requires it. For a light composition, swap structural roles deliberately:

```css
.theme-light {
  --bg: oklch(0.970 0.006 170);
  --surface: oklch(0.935 0.008 190);
  --fg: oklch(0.245 0.012 225);
  --muted: oklch(0.510 0.018 220);
  --border: oklch(0.820 0.012 210);
}
```

The brand accent does not change. Use the light-background Zeno logo whose structural stroke is dark.

## Required artifact contract

Every new Felix HTML renderer should:

- bind the six core tokens exactly;
- expose deterministic snapshot or time rendering through `window.felix`;
- keep data, fonts, and assets project-local;
- include `data-od-id` on inspectable regions and controls;
- use the same visual mapping for preview, still, and video frames;
- retain a local data manifest and source attribution;
- avoid remote image or font dependencies in final exports.

## Pre-delivery visual gate

- No clipping, accidental overlap, unsafe margins, or orphaned short final lines.
- All bilingual pairs are present, correctly ordered, and legible at phone scale.
- Title, source text, and authorship remain stable across video frames.
- Creator names appear no more than once each.
- Brand red stays within the accent budget and does not conflict with data meaning.
- Data colors have explicit meanings and match the manifest.
- Still and animation show the same state identically when given the same data and time.
- Export dimensions, codec, frame rate, duration, pixel format, and audio state match the requested output.


## 已确认作品的布局变体（2026-09-09）

用户确认四个来源项目的整体布局可用；旧署名不作为模板标准。现有作品的布局优先于此前未从成品提取的页眉坐标。新增模板必须明确选择 profile，不把所有图形挤入同一套纵坐标。

| Profile | 来源 | 固定结构 | 范围 |
|---|---|---|---|
| births-circle-v1 | world-births-circle/app.js | 眉题 y=224；主标题 y=352；英文 y=396；横线 y=435；圆心 (540,1090)，最大半径390；来源 y=1689/1723 | 当前可运行种子 |
| release-timeline | ai-model-release-layouts/motion.js | 保留原时间线排布与分章节时间映射；署名从双行改为分区 | 后续独立 SVG 模板 |
| life-distribution | china-life-expectancy-animation/LAYOUT_SPEC.md | 顶部200px留白；横线 y=427；图表 y=635–1240；来源 y=1685 | 后续 SVG + Canvas 模板；以实际 renderer 复核文档坐标 |
| editorial-sequence | english-information-access/render_felix.py | 每页1080×1920；按内容选择矩阵、条带、点阵等布局 | 保留 Python 后端；不强制迁移 HTML |

圆图的圆周文字是已确认的有意外扩布局，允许在编辑列之外、画布之内；国别数据标注仍服从其原始几何碰撞检测。此例外不扩展到所有标题和脚注。

圆图种子的英文标识锚点为 (744,1500)，图标36×36，英文基线 y=1526。圆图外缘及环绕标签最下方约 y=1544，但标识所在右侧位置不与圆相交；该位置仅属于此 profile，不得推广为统一水印坐标。

保留原项目分类色映射时，将色值转换为 OKLch 并在项目中登记为 series token；这不改变系统的六个核心 token。不要为套用新色板而改变分类语义。
