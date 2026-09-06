# Design System Inspired by OpenAI Astra

> Category: AI & LLM
> The dark, cinematic launch-page register of openai.com: a black void, a living galaxy that tells the story on scroll, one typeface at weight 500, and monochrome pill chrome.

## 1. Visual Theme & Atmosphere

The GPT-6 Astra launch page is openai.com with the lights turned off and the sky turned on. Where the everyday OpenAI surface is a white research memo, this register is a planetarium: the canvas is pure black (`#000000`) because the four thousand stars that carry the narrative need a void to float in. Nothing else on the page competes with them. Text is white, controls are white-at-alpha, and the only chroma anywhere is the teal-blue ambient glow (`#23435f`) breathing behind the galaxy and the stars' own palette.

The signature move is that scroll is the story. The galaxy sits in the first screen, tilts away as you begin to read, scatters into two star rails that flank the copy column, then gathers itself into a cursor while the page talks about the model taking actions, and finally into a six-arc knot that holds for the rest of the page. Copy never animates; the stars do. The reader is never told to look at the effect, it just accompanies the text like a soundtrack.

Everything around the stars is quiet on purpose. One typeface, OpenAI Sans, at weight 500 for every heading and 400 for body, with tight negative tracking at display sizes. Buttons are pills. Rules are hairlines at 20% white. There are no cards, no gradients, no shadows, no illustrations; depth comes from glass fills and light, not from layering.

**Key Characteristics:**
- Pure black canvas (`#000000`); the page is dark because of the stars, not as a theme toggle
- White foreground (`#ffffff`, `#fafafa` in hero chrome) with secondaries as white at fixed alphas: 60%, 44%, 20%, 12%
- One family (OpenAI Sans, Inter fallback), weight 500 headings, 400 body, -0.03em display tracking
- Monochrome pill chrome: white primary pill, 12% glass pills, 36px round icon controls
- A single ambient glow (`#23435f` at 55%) and a five-colour star palette are the only colour on the page
- Scroll choreography: tilt, scatter to rails, form cursor, form knot; copy is static
- Hero labels split across the viewport ("GPT" left, "Astra" right) with staggered letter reveals

## 2. Color Palette & Roles

### Canvas & Surfaces
- **Void** (`#000000`): Page background, hero backdrop, canvas clear colour. Never lifted.
- **Panel** (`#1f1f1f`): Solid surface for the rare opaque card or code block.
- **Band** (`#0a0a0a`): Barely-lifted section band for footers and footnote regions.

### Foreground
- **White** (`#ffffff`): Body copy, headings, primary icon colour.
- **Hero White** (`#fafafa`): Split labels, scroll hint, and layout text inside the hero chrome.
- **White 60** (`#ffffff99`): Ledes, secondary copy, timestamps.
- **White 44** (`#ffffff70`): Footnotes, inactive navigation, meta labels.

### Lines & Glass
- **Hairline** (`#ffffff33`): Rules, outlines, glass-pill hover fill.
- **Soft Line** (`#ffffff14`): Dividers inside glass, label text-shadow tint.
- **Glass** (`#ffffff1f`): Resting fill for glass pills and translucent controls.
- **Replay Glass** (`#ffffff26` → `#ffffff40` on hover): The round replay control.

### Accent
- **White Accent** (`#ffffff`): The primary CTA is a white pill with black text (`#000000`). Hover `#ffffffe6`, pressed `#ffffffcc`.
- The system has no coloured accent. Do not introduce teal, blue, or purple for buttons or links.

### Atmosphere (extension, not UI colour)
- **Ambient Glow** (`#23435f`): Radial gradient behind the stars at 55% opacity, fading in over 5.5s. Recedes to about 12% once the galaxy scatters.
- **Star Palette**: `#6dcbf4` sky, `#7ab1fe` periwinkle, `#f87915` ember, `#fa994c` amber, `#f5f6fb` white, quantised at 36 / 16 / 12 / 10 / 26%. The fixed ratio is what makes the field read as "cold with a tenth of warmth"; never smooth it into a gradient.

```css
/* Astra extension values (outside the shared token spine) */
:root {
  --astra-ambient-color: #23435f;
  --astra-ambient-opacity: 0.55;
  --astra-ambient-fade-duration: 5.5s;
  --astra-glass: #ffffff1f;
  --astra-glass-hover: #ffffff33;
  --astra-star-1: #6dcbf4; --astra-star-2: #7ab1fe; --astra-star-3: #f87915;
  --astra-star-4: #fa994c; --astra-star-5: #f5f6fb;
}
```

### Chart Series (extension, data only)
- Series use the site's chart palette, never UI tokens: **Blue 3** `#539af8` (featured model, star marker), **Blue 2** `#2c67c5` (previous generation, circle), **Orange 2** `#ac4f23` (comparison, diamond), **Orange 1** `#653218` (comparison, triangle), **Gray 3** `#8f8f8f` (neutral). Reference lines are `#ac4f23` dashed `8 6`. Axes, ticks and labels stay white.

## 3. Typography Rules

### Font Family
- **Display and body**: OpenAI Sans (proprietary). Use `"OpenAI Sans", "Inter", system-ui, sans-serif`; Inter is the closest open metric match. Enable `"liga"` and `"calt"`.
- **Mono**: `"SF Mono", Consolas, "Liberation Mono", ui-monospace, monospace` for benchmarks and code.
- Never pair with a serif. The light `openai` system uses one for editorial moments; this register does not.

### Hierarchy
The site scale is fluid between 375px and 1440px; the values below are the desktop maximum and the phone minimum.

| Role | Size (desktop / phone) | Line height | Tracking | Weight |
|---|---|---|---|---|
| Hero label (h1) | 64px / 32px | 1.0 / 1.14 | -0.03em | 500 |
| Section title (h2) | 48px / 32px | 1.16 / 1.14 | -0.01em → -0.03em | 500 |
| Sub-section (h3) | 30px / 24px | 1.32 | -0.01em | 500 |
| h4 | 22px / 20px | 1.26 | -0.01em | 500 |
| h5 (benchmark heads) | 18px / 16px | 1.32 | -0.01em | 500 |
| p1 body | 17px | 28px (1.65) | -0.01em | 400 |
| p2 / caption | 14px | 23px | -0.01em / 0 | 400 |
| cta | 14px | 14px | 0 | 500 |
| meta | 14px | 19.6px | 0 | 500 |
| nav-header | 13px | 19.7px | 0 | 500 |

### Principles
- Weight 500 is the loudest the page gets. No 600, no 700, no italics.
- Headings use `text-wrap: balance`; body uses `text-wrap: pretty`.
- Section titles cap at `max-width: 1000px`; body copy sits in a 676px column so the star rails have room.
- Hero labels are split: "GPT" pinned left at 50% height, "Astra" pinned right, each letter revealing with a stagger.
- Tabular numerals for timestamps and benchmark figures.

## 4. Component Stylings

### Buttons
- **Primary pill**: white fill, black text, `min-height 40px`, padding `12px 16px`, `font: 500 14px/1`, radius 9999px, `transition: background-color 300ms cubic-bezier(0.6, 0, 0.4, 1)`. Hover `#ffffffe6`.
- **Glass pill**: same geometry, fill `#ffffff1f`, white text, hover `#ffffff33`. This is the default for every secondary action.
- **Ghost pill**: transparent, white text, hover `#ffffff33`. Used in rows of links.
- **Icon button**: round, 16 / 24 / 32 / 40px, transparent, hover glass, `transition 200ms linear`.
- **Replay control**: 36px circle at the hero's bottom-right, `#ffffff26` fill, `#ffffffcc` glyph, hover `#ffffff40` / `#ffffffe6`, 150ms.
- Focus: `outline 2px solid #ffffffb3`, offset 2px (inset -4px on the drag surface).

### Hero Chrome
- A fixed, pointer-transparent layer over the canvas holds the split labels, the scroll hint (`#fafafa99`, bottom 32px, centred) and the replay control (bottom 12px, right 12px). Its opacity is driven by `--astra-copy-opacity` and fades as the reader scrolls.
- The drag surface is a full-bleed `<button>` with `cursor: grab`, `touch-action: pan-y pinch-zoom`, so dragging rotates the galaxy without hijacking vertical scroll.

### Copy Column
- `max-width 676px`, centred, vertical padding about 26vh, `p1` body in `#ffffff99`, h2 in white. No background, no border. The first copy block carries `data-astra-intro` and its position drives the tilt and scatter.

### Shape Cue
- A `576px × 80vh` frame centred in the column, `pointer-events: none`, holding an invisible SVG of the target path so it reserves the correct aspect ratio. Stars land exactly on the path inside this frame. A caption (`14px 500`, tracking 0.08em) and a note (`14px`, `#ffffff70`, max 440px) sit under it.
- Static fallback: the frame shows a poster image of the pre-rendered particles at `#fafafa4d` when WebGL or motion is unavailable.

### Benchmarks
- Rows of `h5` labels with tabular figures; comparisons in `#ffffff99`, the featured model in white. Hairline `#ffffff33` between rows. No bars in colour; use white-at-alpha lengths.

### Footnotes & Meta
- `FOOTNOTES` as a `p2` heading in `#ffffff99`, entries in `#ffffff70`, hairline above.

### Site Header
- Fixed, `54px` tall (`3.375rem`; `64px` above 1440px). At the top of the page it is fully transparent over the canvas; as soon as the page scrolls a solid `#000000` surface fades in over `400ms cubic-bezier(0.33, 1, 0.68, 1)`, with a masked `brightness(95%) contrast(105%)` strip beneath it. No blur.
- Content is centred in the `1088px` container with `24px` gutters. Left group: wordmark `17px` tall, nav links `13px / 500` with `16px` side padding (white, hover `#ffffff99`), then the `40px` round search button in `#ffffff99` closing the group. Right group: glass pill **Log in** with a chevron and white pill **Try …** with an outward arrow, both `36px` tall (`!h-9`), `20px` side padding, `14px / 500` label, `12px` icons, `0.3em` icon gap; the white pill hovers to `#ffffffcc`.

### Segmented Control
- Hairline pill container (`1px #ffffff33`, `4px` inner padding, `4px` gap). Items are `40px` pills, `12px 16px` padding, `14px / 500`; the selected item fills `#ffffff1f`, hover `#ffffff14`. Used to switch charts and benchmark views.

### Chart Card
- `16px` radius, `1px #ffffff33` border, `32px` padding, black fill. Header row: title at h4 size, a glass select pill (`API Cost ▾`) beneath it, a download icon button on the right.
- Legend: `17px` labels with shape markers per series (star, circle, diamond, triangle) and a dashed swatch for "reported score only". Plot: white `1px` axes, mono `13px` ticks, `17px` axis titles, dashed reference line, `2px` series lines with `5px` markers.
- Caption: italic `14px`, centred, max `640px`, white. Series colours from the chart palette in §2.

### Quote Card
- `#1f1f1f` fill, `1px #ffffff1f` border, `10px` radius, `32px` vertical and `24px` horizontal padding, the page's `0 18px 60px rgba(0,0,0,0.08)` shadow (invisible on black, kept for light embeds).
- Logo row `32px` tall, quote at h5 size `/ 500` with `-0.01em` tracking and `0.5em` indent, attribution `14px / 500` in `#ffffff99`.

### Media Frame & Two-up Comparison
- Any screenshot, video or side-by-side product UI sits in a `10px`-radius frame with a `1px #ffffff14` hairline on `#0a0a0a`; `overflow: hidden`, no shadow. Two-up: two columns, `16px` gap, `24px` padding, centred labels at h4 size above each pane.

### Comparison Table
- Fixed layout, first column `34%`, `20px` row padding, `24px` column gap, `1px #ffffff33` rule above every row and below the last. Cells `17px / 400`, header `500`, missing values as a muted `-`. No zebra stripes, no highlighted winner column; emphasis comes from the copy.

### Footer
- `120px` above, `13px / 500` throughout. Five columns of link groups: heading in `#ffffff99` with `16px` below, links `20px` apart, groups `44px` apart, external links carry a `10px` outward arrow.
- Bottom bar: `16px` social glyphs, copyright, underlined **Manage Cookies** (`#ffffff70` underline), and a glass language pill with a globe icon.

## 5. Layout Principles

### Grid & Container
- Content container `1088px` (68rem); the page gutter is `max(20px, (viewport - 68rem) / 2)`.
- Twelve columns, gap 8 / 16 / 24px at phone / tablet / desktop.
- Full-bleed media may extend to 1728px; the canvas is always full viewport.
- Hero labels inset `clamp(20px, 4vw, 56px)` from the viewport edges.

### Vertical Rhythm
- Hero: exactly `100svh`, no copy inside except the sr-only h1 and the split labels.
- Copy blocks: about 26vh padding top and bottom, so each block arrives alone in the viewport.
- Shape cues: 80vh frame plus 18vh padding; the star formation is the section.
- Section spacing tokens (128 / 96 / 64px) are the pixel equivalents at a 960px viewport.

### Spacing System
- 4px base. Typical stops: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128.
- Inside pills: 12px vertical, 16px horizontal, gap 4px between icon and label.

### Whitespace Philosophy
- The star rails are the whitespace. Leave the sides of the column empty at every breakpoint wider than 720px; do not fill them with cards or images.

## 6. Depth & Elevation

- **No shadows**. `--elev-flat: none`. The single shadow utility on the site (`0 18px 60px rgba(0,0,0,0.08)`) is invisible on black and exists only for embedded light media.
- **Glass for hierarchy**: resting `#ffffff1f`, hover `#ffffff33`, ring `0 0 0 1px #ffffff33`.
- **Light for emphasis**: bloom (intensity 0.7, threshold 0.08, radius 0.72) and a lens flare on the galaxy core; hero labels carry `text-shadow: 0 0 24px #fafafa14`.
- **Radii**: 6px chips and code, 10px inputs and small cards, 16px media, 9999px everything interactive.
- Never use `backdrop-filter: blur()` over the canvas; the stars repaint every frame and the blur would be re-computed each time. The only backdrop effect on the page is the header's masked brightness/contrast strip.

## 7. Motion & Scroll Choreography

### Timing
- Named curves: `curve-d cubic-bezier(0.6, 0, 0.4, 1)` for colour and layout transitions (300ms), `curve-a` linear for icon buttons (200ms), `curve-e cubic-bezier(0.5, 1.25, 0, 1)` for the rare overshoot, `cubic-bezier(0.22, 1, 0.36, 1)` for reveals.
- Durations: 150ms fast, 200ms short, 300ms medium, 400ms long, 1s reveals, 5.5s ambient fade.
- Reduced motion: the canvas is replaced by posters, drag is disabled, and every animation is set to `none`.

### Hero Entrance
- Ambient glow fades in over 5.5s to 55% while the galaxy plays its intro (same 5.5s).
- Split labels reveal letter by letter: 1s, `cubic-bezier(0.22, 1, 0.36, 1)`, delays 0.85s to 1.25s, each letter sliding 44px in from its edge.
- The section title lags scroll by up to 120px (`--astra-title-parallax-y`).

### Scroll Stages (800px of scroll = progress 1)
1. **Tilt**: the galaxy rotates to -52° about X, peaking at 75% of the intro block's travel and flattening at 100%.
2. **Scatter**: 72% of the stars drift to rails on either side of the 676px column; brightness falls to 18%, dim stars shrink to 45%; the rails keep a depth-weighted parallax as you keep scrolling; ambient opacity recedes to 12%.
3. **Cursor**: when the cue enters the viewport, stars form the cursor path over the first 36% of entry and dissolve between 50% and 86%. On formation the shape auto-rotates 0.42 rad.
4. **Knot**: the last cue holds; six arcs each own one sixth of the flow, so the ring keeps moving while it stays.
- Scrolling back reverses every stage deterministically; the same seeds put every star back in the same place.

### Rules
- Only the stars respond to scroll. Copy, buttons and images never parallax, pin, or fade on scroll.
- No scroll-jacking. Native scroll, passive listeners, one `requestAnimationFrame` per scroll event.
- Pointer: hover repels nearby stars; drag rotates the galaxy with per-layer lag (0.68). Never animate the cursor itself.

## 8. Do's and Don'ts

### Do
- Keep the canvas `#000000` and let the ambient glow supply the softness.
- Keep the copy column at 676px and empty on both sides.
- Use one white pill CTA per screen; every other control is glass.
- Use weight 500 for every heading and 400 for body; keep display tracking at -0.03em.
- Reserve the shape frames (576px × 80vh) even before the engine is wired, so layout does not shift.
- Ship the static poster fallback and honour `prefers-reduced-motion`.
- Pair this system with the `starflow-launch` skill when the page needs the particle engine.

### Don't
- Don't add gradients, coloured buttons, tinted cards, or a coloured link colour.
- Don't lift the background to charcoal, add noise, or add a vignette; the page has none. The only tint is the ambient glow, which reads as a near-uniform blue-black with slightly brighter corners.
- Don't use a serif, a second sans, weight 600+, or italics.
- Don't animate copy on scroll, pin sections, or add scroll-snap.
- Don't put cards, illustrations, or screenshots in the star rails.
- Don't use `backdrop-filter` over the canvas or box-shadows for depth.
- Don't imply affiliation: this is a distillation of public CSS, not an OpenAI asset.

## 9. Responsive Behavior

### Breakpoints
- Phone < 768px, tablet 768px to 1023px, desktop ≥ 1024px. Type scales fluidly between 375px and 1440px.

### Collapsing Strategy
- Below 720px the copy column takes the full width with 20px gutters; the star rails move behind the text at 18% brightness and the column padding drops to 18vh.
- Hero labels move from 50% height to 46% (left) and 54% (right) with 16px insets so they never collide.
- The shape frame keeps 80vh height and shrinks to the viewport width; the path stays proportionally centred.
- Grid gaps: 8px phone, 16px tablet, 24px desktop.

### Touch & Performance
- Pointer targets at least 40px; the drag surface uses `touch-action: pan-y pinch-zoom`.
- Pixel budget capped at 2.4 megapixels regardless of DPR; the engine drops to half-rate rendering, then a tighter budget, when frames are missed.
- Below `full` quality the bloom pass is skipped, never the stars.

## 10. Agent Prompt Guide

### Quick Reference
```
Canvas #000000 · Panel #1f1f1f · Band #0a0a0a
Text #ffffff · Hero #fafafa · Muted #ffffff99 · Meta #ffffff70
Hairline #ffffff33 · Soft #ffffff14 · Glass #ffffff1f
Accent #ffffff on #000000 · Glow #23435f @ 55% · Stars #6dcbf4 #7ab1fe #f87915 #fa994c #f5f6fb
Font: OpenAI Sans / Inter, 500 headings, 400 body, h1 64px -0.03em, p1 17px/28px
Pills 9999px · Radii 6 / 10 / 16px · Column 676px · Container 1088px · Cue 576px × 80vh
Motion: 300ms cubic-bezier(.6,0,.4,1) · reveals 1s cubic-bezier(.22,1,.36,1) · no scroll-jacking
```

### Example Component Prompts
- "A launch hero in the Astra system: black canvas, split labels 'NOVA' left and '2' right at 64px weight 500, scroll hint at the bottom, one glass pill 'Read the research'."
- "A 676px copy block with an h2 at 48px and two p1 paragraphs in #ffffff99, 26vh padding, nothing on either side."
- "A shape cue: a 576px × 80vh frame reserving a cursor path, caption 'It takes action' at 14px 500 tracking 0.08em, note in #ffffff70."
- "A benchmark table: h5 labels, tabular figures, our model in white and three comparisons in #ffffff99, hairlines between rows, no colour bars."
- "A 54px transparent site header: wordmark left, five 13px nav links, a search icon, a glass 'Log in ▾' pill and a white 'Try Nova ↗' pill."
- "A chart card: 16px radius and hairline border, title, glass 'API Cost ▾' select, legend with star/circle/diamond markers, dashed reference line, italic centred caption."
- "A quote card on #1f1f1f: 32px logo row, quote at 18px / 500, attribution in #ffffff99."
- "A five-column footer at 13px / 500: group headings in #ffffff99, links 20px apart, outward arrows on external links, bottom bar with social glyphs, copyright and a language pill."

### Iteration Guide
- If the page looks like a generic dark template, remove colour, shadows and cards first; then check the column width and the empty rails.
- If the hero feels static, the engine is missing or reduced motion is on; verify the canvas, then the 5.5s intro.
- If the stars fight the copy, widen the rails by lowering `contentBounds` or reduce scatter brightness; never dim the text.
- If motion feels busy, remove anything animating that is not a star.
