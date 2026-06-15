---
name: hps-true-blueprint
description: True Blueprint deck theme — blueprint-blue #0b3a6f field under a 40px white drafting grid, dashed-border translucent cards, white/ice-blue ink with amber annotations, all JetBrains Mono, 2px corners, zero shadows. Drawing-sheet chrome (title block, sheet index, construction-line numbers, hatched bars, SVG schematics). Use for system-architecture decks, infra migration reviews, engineering design docs, or any presentation that should read like a working drawing. Based on the blueprint theme from lewislulu/html-ppt-skill.
triggers:
  - "blueprint"
  - "engineering drawing"
  - "system architecture deck"
  - "architecture review"
  - "design review"
  - "schematic"
  - "蓝图"
  - "工程图"
  - "架构评审"
  - "系统架构"
od:
  mode: deck
  surface: web
  scenario: product
  upstream: "https://github.com/lewislulu/html-ppt-skill"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: true
  animations: true
  example_prompt: "Use True Blueprint to turn my architecture review into a single-file HTML deck that reads like an engineering drawing set. Start from the seed example.html — keep its locked token sheet, 40px drafting-grid background, drawing-frame chrome and navigation script exactly as-is, replace slide content only, draw diagrams as inline SVG schematics, and use real content with no lorem ipsum."
  example_prompt_i18n:
    zh-CN: "用「工程蓝图」把我的架构评审做成一套像工程图纸的单文件 HTML 幻灯片。从种子 example.html 出发——完整保留锁定的 token 表、40px 绘图网格底、图框装置和导航脚本，只替换幻灯片内容，架构图用内联 SVG 简图绘制，使用真实内容，不要 lorem ipsum。"
---

# True Blueprint（工程蓝图）

A locked single-theme deck skin ported from the `blueprint` theme of the
upstream MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts). The whole deck reads as one engineering drawing
set: blueprint-blue paper, white drafting grid, dashed component outlines,
mono lettering, amber redline annotations.

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. The theme is LOCKED — no theme cycling, no
colors or fonts outside this spec.**

> Sibling note: `html-ppt-knowledge-arch-blueprint` is the *light* blueprint
> variant (cream paper + rust-red ink). This plugin is the opposite-polarity
> scheme — dark blue field, white ink. Do not blend the two palettes.

## Locked token sheet (`:root` — reproduce verbatim)

```css
:root{
  --bg:#0b3a6f; --bg-soft:#0a3260;
  --surface:rgba(255,255,255,.06); --surface-2:rgba(255,255,255,.1);
  --border:rgba(190,220,255,.3); --border-strong:rgba(190,220,255,.55);
  --text-1:#e8f3ff; --text-2:#b8d4f0; --text-3:#7da8cf;
  --accent:#ffffff; --accent-2:#aee1ff; --accent-3:#ffd27a;
  --good:#8ef0a6; --warn:#ffd27a; --bad:#ff8a96;
  --grad:linear-gradient(135deg,#ffffff,#aee1ff);
  --grad-soft:linear-gradient(135deg,#0a3260,#0b3a6f);
  --radius:2px; --radius-sm:2px; --radius-lg:4px;
  --shadow:none; --shadow-lg:0 16px 40px rgba(0,0,0,.3);
  --font-sans:'JetBrains Mono','IBM Plex Mono',Menlo,monospace;
  --font-serif:'JetBrains Mono',Menlo,monospace;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'JetBrains Mono',Menlo,monospace;
  --letter-tight:-.02em; --letter-normal:0;
  --ease:cubic-bezier(.4,0,.2,1);
  --grid-line:rgba(255,255,255,.06);
  --ink:rgba(190,220,255,.45);
}
```

Color roles: white `--accent` for headline emphasis, ice-blue `--accent-2`
for ink lines / connectors / progress, amber `--accent-3` strictly for
annotations, callouts and the single highlighted element per slide.
`--good/--warn/--bad` (mint/amber/coral) are redline-annotation semantics —
use them in eyebrows and ticks only, never as fills.

## Typography

- **One family everywhere.** Every font slot is `'JetBrains Mono', monospace`.
  The only allowed remote resource is the JetBrains Mono Google Fonts
  `@import` (weights 300/400/500/700/800 + italic 400).
- `.h1`/`.h2` are UPPERCASE, weight 800/700, `clamp()`-fluid
  (h1: `clamp(40px,5vw,64px)`).
- `.kicker` is a `// slash-comment` style label: 13px, 700, `.18em`
  letterspacing, uppercase, ice-blue. `.eyebrow`: 12px, `.22em`, `--text-3`.
- `.lede` is weight 300, `--text-2`, max-width 64ch.

## Signature devices (what makes it a blueprint)

1. **Drafting-grid canvas** — body background is two 1px
   `linear-gradient` layers at `rgba(255,255,255,.06)` on a 40px cell over
   solid `#0b3a6f`. Never replace with a flat fill or an image.
2. **Double drawing frame** — every slide draws `.slide::before` (1px solid
   `--ink`, inset 28px) and `.slide::after` (1px dashed, inset 34px).
3. **Dashed translucent cards** — `.card` is `rgba(255,255,255,.04)` with a
   **1px dashed** `rgba(190,220,255,.45)` border, 2px radius, no shadow.
4. **Title block** — the cover carries a `.title-block` strip of bordered
   cells: `DWG NO. / REV. / SCALE / DATE` (REV value in amber).
5. **Construction-line section numbers** — `.section-num` giant digits,
   transparent fill, `1.5px -webkit-text-stroke` in `--ink`.
6. **Hatched charts** — `.bar-chart .bar` fills with a 45°
   `repeating-linear-gradient` cross-hatch (ice-blue; `.hot` = amber for the
   one highlighted bar), 1px ice-blue outline, labels uppercase.
7. **SVG schematics** — diagrams are inline SVG: dashed `rect` components
   (`stroke-dasharray:6 4`), the focal component in solid white 2px, ice-blue
   connectors with arrowhead `<marker>`s, dashed data-flow lines
   (`stroke-dasharray:2 5`), and amber dimension-line annotations. No
   diagram/chart libraries, no remote images.
8. **Bracketed step counters** — `.steps .card::before` renders
   `[01] [02] …` in amber mono.
9. **Dashed spec tables** — `.spec-table` cells use 1px dashed borders and
   read like a materials schedule.

## Page structure & runtime (keep the seed verbatim)

- Each page: `<section class="slide" data-title="...">` inside
  `<div class="deck" id="deck">` — a horizontal scroll-snap strip; every
  slide is `flex:0 0 100vw` × `100vh`, padding `72px 96px`, designed at a
  1280×720 16:9 baseline and fluid via `clamp()`. One screen per slide —
  no internal scrolling; split content into more slides instead.
- Fixed chrome: `.deck-header` (project name + locked theme chip),
  `.deck-footer` (attribution + `N / total` counter), 2px `.progress-bar`.
- Navigation script: `←`/`→`/`Space`/`PageUp`/`PageDown`/`Home`/`End`;
  `#/N` hash routing via try/catch-wrapped `history.replaceState`
  (srcdoc-safe); dual window/document capture-phase key listeners deduped by
  Event identity; scroll sync; resize re-snap; body auto-focus. These solve
  real iframe-host bugs — do not "simplify" them away.
- **No theme cycling.** Unlike the upstream html-ppt-studio system this
  family is ported from, there is no `T` key and no `themes` array — the
  skin is locked.
- Animations: only the inlined subset — `.anim-rise-in`, `.anim-fade-up`,
  `.anim-stagger-list`. At most one hero animation plus one stagger per slide.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide, 1–3
  sentences, never visible.

## Layout masters (all demonstrated in example.html)

| # | master | use for |
|---|---|---|
| 1 | drawing-sheet cover + title block | opening |
| 2 | sheet-index toc (3 accent cards) | agenda |
| 3 | section divider (outline-stroke number) | chapter breaks |
| 4 | inline-SVG architecture schematic | system/topology pages |
| 5 | two-column notes + dashed spec table | rules, specs |
| 6 | KPI grid (g4 cards) | metrics |
| 7 | hatched bar chart | distributions, budgets |
| 8 | bracketed process steps (g4) | plans, pipelines |
| 9 | rev comparison (bad vs good cards) | before/after |
| 10 | mono pull-quote sign-off | quote + closer |

Composition default: cover → sheet index → (divider → 2–4 content pages) × N
→ sign-off. Target 8–15 pages.

## Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>` verbatim.
2. Replace the 11 demo slides with your planned master sequence; keep the
   `data-title` attributes meaningful.
3. Update the header project name, cover title block (DWG NO./REV./DATE) and
   footer attribution; the counter total is computed by the script.
4. Real content, real numbers — no lorem ipsum, no placeholder images.
5. Amber appears at most once-as-focus per slide; everything else is
   white/ice-blue ink.
6. Verify: arrows + Space navigate, `#/4` deep-links, no slide overflows
   vertically, no color or font outside this spec.

## Attribution

Palette, token vocabulary, and the blueprint visual language come from the
upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;), theme `blueprint`. The LICENSE file
ships alongside this skill — keep it in place when redistributing.
