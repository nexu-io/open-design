# Authoring guide

How to turn a user request ("make me a deck about X") into a finished
html-ppt deck. Follow these steps in order.

## 1. Understand the deck

Before touching files, clarify:

1. **Audience** — engineers? designers? executives? consumers?
2. **Length** — 5 min lightning? 20 min share? 45 min talk?
3. **Language** — Chinese, English, bilingual? (Noto Sans SC is preloaded.)
4. **Format** — on-screen live, PDF export, 小红书图文?
5. **Tone** — clinical / playful / editorial / cyber?

The audience + tone map to a theme; the length maps to slide count; the
format maps to runtime features (live → notes + T-cycle; PDF → page-break
CSS, already handled in `base.css`).

## 2. Pick a theme

Use `references/themes.md`. When in doubt:

- **Engineers** → `catppuccin-mocha` / `tokyo-night` / `dracula`.
- **Designers / product** → `editorial-serif` / `aurora` / `soft-pastel`.
- **Execs** → `minimal-white` / `arctic-cool` / `swiss-grid`.
- **Consumers** → `xiaohongshu-white` / `sunset-warm` / `soft-pastel`.
- **Cyber / CLI / infra** → `terminal-green` / `blueprint` / `gruvbox-dark`.
- **Pitch / bold** → `neo-brutalism` / `sharp-mono` / `bauhaus`.
- **Launch / product reveal** → `glassmorphism` / `aurora`.

Wire the theme as `<link id="theme-link" href="../assets/themes/NAME.css">`
and list 3-5 alternatives in `data-themes` so the user can press T to audition.

## 3. Outline the deck

A solid 20-minute deck is usually:

```
cover → toc → section-divider #1 → [2-4 body pages] →
section-divider #2 → [2-4 body pages] → section-divider #3 →
[2-4 body pages] → cta → thanks
```

Pick 1 layout per page from `references/layouts.md`. Don't repeat the same
layout twice in a row.

## 4. Scaffold the deck

```bash
./scripts/new-deck.sh my-talk
```

This copies `templates/deck.html` into `examples/my-talk/index.html` with
paths rewritten. Add/remove `<section class="slide">` blocks to match your
outline.

## 5. Author each slide

For each outline item:

1. Open the matching single-page layout, e.g. `templates/single-page/kpi-grid.html`.
2. Copy the `<section class="slide">…</section>` block.
3. Paste into your deck.
4. Replace demo data with real data. Keep the class structure intact.
5. Set `data-title="..."` (used by the Overview grid).
6. Add `<div class="notes">…</div>` with speaker notes.

## 6. Add animations sparingly

Rules of thumb:

- Cover/title: `rise-in` or `blur-in`.
- Body content: `fade-up` for the hero element, `stagger-list` for grids/lists.
- Stat pages: `counter-up`.
- Section dividers: `perspective-zoom` or `cube-rotate-3d`.
- Closer: `confetti-burst` on the "Thanks" text.

Pick **one** accent animation per slide. Everything else should be calm.

## 7. Chinese + English decks

- Fonts are already imported in `fonts.css` (Noto Sans SC + Noto Serif SC).
- Use `lang="zh-CN"` on `<html>`.
- For bilingual titles, stack lines: `<h1 class="h1">主标题<br><span class="dim">English subtitle</span></h1>`.
- Keep English subtitles in a lighter weight (300) and dim color to avoid
  visual competition.

## 8. Review in-browser

```bash
open examples/my-talk/index.html
```

Walk through every slide with ← →. Press:

- **O** — overview grid; catch any layout clipping.
- **T** — cycle themes; make sure nothing looks broken in any theme.
- **S** — open speaker notes; verify every slide has notes.

## 9. Export to PNG

```bash
# single slide
./scripts/render.sh examples/my-talk/index.html

# all slides (autodetect count by looking for .slide sections)
./scripts/render.sh examples/my-talk/index.html all

# explicit slide count + output dir
./scripts/render.sh examples/my-talk/index.html 12 out/my-talk-png
```

Output is 1920×1080 by default. Change in `render.sh` if the user wants 3:4
for 小红书图文 (1242×1660).

## 10. What to NOT do

- Don't hand-author from a blank file.
- Don't use raw hex colors in slide markup. Use tokens.
- Don't load heavy animation frameworks. Everything should stay within the
  CSS/JS that already ships.
- Don't add more than one new template file unless a genuinely new layout
  type is needed. Prefer composition.
- Don't delete slides from the showcase decks.
- **Don't put presenter-only text on the slide.** Any descriptive text,
  narration cues, or explanations meant for the speaker (e.g. "这一页的重点是…",
  "Note: mention X here", small grey captions explaining the slide's purpose)
  MUST go inside `<div class="notes">`, not as visible elements. The `.notes`
  div is hidden (`display:none`) and only shown via the S overlay. Slides
  should contain ONLY audience-facing content.

## Troubleshooting

- **Theme doesn't switch with T**: check `data-themes` on `<body>` and
  `data-theme-base` pointing to the themes directory relative to the HTML
  file.
- **Fonts fall back**: make sure `fonts.css` is linked before the theme.
- **Chart.js colors wrong**: charts read CSS vars in JS; make sure they run
  after the DOM is ready (`addEventListener('DOMContentLoaded', …)`).
- **PNG too small**: bump `--window-size` in `scripts/render.sh`.
