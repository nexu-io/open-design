---
name: social-instagram-carousel
en_name: "Instagram Carousel"
emoji: "📲"
description: "Instagram-native carousel on the 4:5 (1080x1350) feed format: a hook cover, swipeable body slides, and a CTA end-card. Brand-driven palette, modern styles and typography, your images or AI imagery, per-slide image downloads."
zh_description: "基于 4:5 (1080x1350) 信息流尺寸的 Instagram 轮播图: 钩子封面, 可滑动正文页, 行动号召尾页。品牌配色, 现代风格与字体, 支持自有或 AI 图片, 每张可下载。"
en_description: "Instagram-native carousel on the 4:5 (1080x1350) feed format: a hook cover, swipeable body slides, and a CTA end-card. Brand-driven palette, modern styles and typography, your images or AI imagery, per-slide image downloads."
category: card
scenario: marketing
aspect_hint: "1080x1350 (4:5)"
featured: 8
tags: ["instagram", "ig", "social", "carousel", "marketing", "images"]
triggers:
  - "instagram carousel"
  - "ig carousel"
  - "carousel post"
  - "social carousel"
  - "swipe post"
example_id: sample-ig-expensive-design
example_name: "Instagram Carousel - Make designs feel expensive"
example_format: markdown
example_tagline: "7 slides, 4:5, brand-driven"
example_desc: "Save-worthy how-to carousel, drop-into-Instagram ready"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "Use the Instagram Carousel template. Ask me fresh for ALL my brand details (brand name, Instagram handle, primary color, logo, fonts, design style, size, tone, image source/provider/style) and the topic every time, then build a swipeable 4:5 Instagram carousel with a single Download all slides button."
---

# Template: Instagram Carousel

Build a swipeable Instagram carousel as one self-contained HTML artifact: a
vertical deck of full-size 4:5 slides where every slide is export-ready as an
individual 1080x1350 image, with one top-level "Download all slides" button that
exports every slide as a PNG in a single zip (no per-slide buttons).

## Writing rule (strict)

Never use em dashes or en dashes (the long dash glyphs, Unicode U+2014 and U+2013) anywhere: not in slide
copy, headlines, captions, or your chat replies. Use a hyphen "-", a comma, a
colon, parentheses, or split into two sentences instead. This is a hard rule.

## Step 1: Ask the user for ALL brand details, every time

Always run the full intake fresh on every new carousel. Do NOT read or use OD
memory, project memory, a saved brand profile, a previous carousel's answers, or
any smart default. Even if you "know" the brand from earlier (Airnet, a handle, a
color, fonts), ask again, the user may want something different this time. Ask
every field below and WAIT for the answers before generating anything. Never
pre-fill or assume. If the user truly wants to skip a field, they say so
explicitly; otherwise ask.

1. Brand name (shown on the first and last slides).
2. Instagram handle (watermark and CTA).
3. Primary brand color (one hex, or a description and you pick one).
4. Logo (an SVG path, the brand initial, or skip).
5. Fonts / typography (see the Typography menu).
6. Design style: detect the field from the topic and apply the matching "Niche
   design direction", or offer a named "Design preset" / Style menu option. Let
   the user override.
7. Instagram size: 4:5 portrait 1080x1350 (default), 1:1 square 1080x1080,
   1.91:1 landscape 1080x566, or 3:4 tall 1080x1440. The first slide locks it.
8. Tone (professional, casual, playful, bold, minimal).
9. Images, ask three things:
   (i) Source: upload your own / AI-generate (only if a media provider key is
   configured) / none (no images, design + typography only).
   (ii) NEVER use Pollinations for the carousel. If AI-generate, discover the
   configured models from `/api/media/models` (providers that have a key) and use
   the exact model `id` the user picks. If NO provider key is configured, do not
   generate images and do not use Pollinations: build an image-free carousel that
   leans on excellent typography and the background treatments and layout.
   (iii) If using images, pick an imagery style matched to the content (3D clay
   render, flat vector, line doodle, isometric, watercolor/anime, paper-cut, or
   realistic photo) and remove the image background so it never sits in a
   clashing box (see "Removing the image background").
   See "Images on slides".
10. Topic and the actual points to cover, and how many slides (default 7).

## Step 2: Derive the 6-token palette from the one primary

```
BRAND_PRIMARY = user's color            // accent: progress fill, icons, tags
BRAND_LIGHT   = primary lightened ~20%  // accents on dark, pills
BRAND_DARK    = primary darkened ~30%   // CTA text, gradient anchor
LIGHT_BG      = tinted off-white        // never pure #fff
LIGHT_BORDER  = one shade darker than LIGHT_BG
DARK_BG       = near-black with brand tint (warm: #1A1918, cool: #0F172A)
```
Gradient slides: `linear-gradient(165deg, BRAND_DARK 0%, BRAND_PRIMARY 50%, BRAND_LIGHT 100%)`.

## Typography menu (all Google Fonts)

Pick a pairing that fits the tone, and make the heading a real display or serif
face, never the same flat sans as the body. A distinctive headline font is the
single biggest lift to "excellent" type. Lead with these:

Display / statement (big, high-impact headlines):
- Statement caps: Anton + Inter Tight
- Big display: Unbounded (700-900) + Hanken Grotesk
- Heavy grotesque: Hanken Grotesk (800) + Hanken Grotesk (400)
- Wide industrial: Archivo Expanded + Archivo

Editorial / serif (premium, magazine feel):
- Luxe contrast: Bodoni Moda + Inter
- High-contrast display: DM Serif Display + DM Sans
- Warm expressive: Fraunces (opsz high) + Outfit
- New editorial: Instrument Serif + Inter
- Elegant: Cormorant Garamond (600) + Mulish
- Classic: Playfair Display + DM Sans

Modern sans / technical:
- Sharp grotesk: Space Grotesk + Inter
- Geometric modern: Plus Jakarta Sans (700) + Plus Jakarta Sans (400)
- Expressive modern: Sora + Manrope
- Mono-technical: Space Mono (labels) + Space Grotesk (body)
- Friendly rounded: Bricolage Grotesque + Bricolage Grotesque
- Clean neutral: Figtree, or Onest

Scale (for the 1080-wide slide): hook/display 92-128px; title 60-76px; subhead
40-48px; body 32-40px (min ~28px); eyebrow/tags ~20-22px uppercase; step numbers
~108px. Tracking: tighten display headings (-0.02 to -0.03em), open uppercase
labels (+0.10 to +0.16em). Heading weight 600-900, body 400-500. Mix weights in
one headline for emphasis (for example a 400 line then an 800 accent line). Live
HTML/CSS text only, never rasterized copy. Use `.serif` (heading) and `.sans`
(body) classes. Vary the heading treatment across the deck so it does not read as
one template.

## Style menu (modern looks)

Apply the chosen style on top of the palette and fonts:

- Editorial: light cream bg, big serif display, thin rules, lots of whitespace.
- Bold: high-contrast, oversized sans headlines, accent blocks, tight spacing.
- Minimal: near-mono palette, one accent dot, generous margins.
- Dark glow: dark bg, accent as a soft radial glow behind the headline.
- Gradient mesh: full-bleed multi-stop brand gradient + glassy cards (backdrop blur).
- Bento: modular rounded cards in a grid, one stat or idea per cell.
- Neo-brutalist: thick borders, hard offset shadows, raw flat color, mono labels.
- Swiss / grid: strict columns, Helvetica-like sans, red or single accent, rules.
- Soft / claymorphic: soft shadows, rounded shapes, pastel tints of the brand color.
- Mono-technical: monospace accents, hairline grid, code-style pills, cool palette.
- Retro / Y2K: saturated gradient, chrome and bevel accents, condensed type.
- Magazine: multi-column editorial, a drop cap, kicker + folio, hairline rules.
- Editorial mono: monospace headings, hairline rules, huge negative space, one accent.
- Vaporwave: magenta-cyan gradient, chrome text, a grid-horizon line.
- Organic: soft blob shapes, rounded everything, pastel tints, no hard edges.
- Art-deco: gold hairlines, symmetric geometry, tall condensed caps, fan motifs.
- Risograph: two-color overprint, heavy grain, slight misregister, flat shapes.
- Maximalist: layered type, sticker accents, bold clashing color, busy but balanced.
- Minimal luxe: near-white, one thin serif, huge margins, tiny refined labels.

## Background treatments (never leave a slide flat)

Every non-image slide must have a real background treatment, not a plain solid
fill. Rotate through the library below so no two adjacent slides look the same,
but keep one motif family per carousel so it stays cohesive. Patterns stay
subtle (low alpha) so text keeps >=4.5:1 contrast; on dark slides use
white-alpha tints. Apply on the `.slide` or a `::before`/`::after` layer behind
the content. Tint with the brand tokens. Suggested mapping: cover/CTA -> mesh or
glow; text slides -> dot grid, line grid, or stripes; list slides -> bento.

1. Dot grid
```css
background-color: var(--light-bg);
background-image: radial-gradient(rgba(0,0,0,0.07) 1.6px, transparent 1.6px);
background-size: 30px 30px;
```
2. Line grid / boxes
```css
background-color: var(--light-bg);
background-image:
  linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px);
background-size: 46px 46px;
```
3. Mesh gradient (brand), great on the cover
```css
background:
  radial-gradient(60% 60% at 18% 12%, rgba(BRAND_LIGHT_RGB,0.55) 0, transparent 60%),
  radial-gradient(55% 55% at 88% 8%, rgba(BRAND_PRIMARY_RGB,0.45) 0, transparent 55%),
  radial-gradient(70% 70% at 95% 100%, rgba(BRAND_DARK_RGB,0.5) 0, transparent 60%),
  var(--light-bg);
```
4. Soft orbs / glow (great on dark)
```css
background:
  radial-gradient(42% 42% at 75% 22%, rgba(BRAND_PRIMARY_RGB,0.42) 0, transparent 70%),
  radial-gradient(38% 38% at 12% 92%, rgba(BRAND_LIGHT_RGB,0.22) 0, transparent 70%),
  var(--dark-bg);
```
5. Diagonal stripes
```css
background: repeating-linear-gradient(45deg, var(--light-bg) 0 16px, rgba(BRAND_PRIMARY_RGB,0.06) 16px 18px);
```
6. Concentric rings
```css
background: repeating-radial-gradient(circle at 82% 18%, transparent 0 36px, rgba(0,0,0,0.04) 36px 37px), var(--light-bg);
```
7. Grain / noise (layer over any of the above for a premium finish)
```css
.grain::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");}
```
8. Bento cards (structural), great for list/feature slides
```css
.bento{display:grid;gap:18px;grid-template-columns:1fr 1fr;}
.bento .cell{background:var(--surface);border:1px solid var(--light-border);border-radius:24px;padding:36px;}
```
9. Accent block: a full-height brand-color bar on one edge behind the eyebrow.
10. Half-tone: a tinted brand gradient on the top third, clean below.
11. Blueprint grid (on dark)
```css
background-color: var(--dark-bg);
background-image:
  linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
background-size: 40px 40px;
```
12. Halftone dots (fade across the slide)
```css
background-color: var(--light-bg);
background-image: radial-gradient(rgba(BRAND_PRIMARY_RGB,0.18) 2.5px, transparent 2.5px);
background-size: 22px 22px;
-webkit-mask-image: linear-gradient(135deg, #000, transparent 72%);
        mask-image: linear-gradient(135deg, #000, transparent 72%);
```
13. Isometric grid
```css
background-color: var(--light-bg);
background-image:
  linear-gradient(30deg, rgba(0,0,0,0.05) 1px, transparent 1px),
  linear-gradient(150deg, rgba(0,0,0,0.05) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
background-size: 48px 84px;
```
14. Spotlight vignette (on dark)
```css
background: radial-gradient(60% 50% at 50% 30%, rgba(255,255,255,0.07) 0, transparent 60%), var(--dark-bg);
```
15. Gradient blobs (big and soft)
```css
background:
  radial-gradient(38% 30% at 20% 25%, rgba(BRAND_PRIMARY_RGB,0.5) 0, transparent 60%),
  radial-gradient(34% 28% at 82% 70%, rgba(BRAND_LIGHT_RGB,0.45) 0, transparent 60%),
  var(--light-bg);
```
16. Topographic rings
```css
background: repeating-radial-gradient(circle at 28% 118%, rgba(BRAND_PRIMARY_RGB,0.06) 0 2px, transparent 2px 56px), var(--light-bg);
```
17. Paper / canvas: any light treatment above plus the grain overlay (7) at opacity .06 for a printed feel.

Replace `BRAND_*_RGB` with the comma-separated RGB channels of the matching
token (for example a `#c0492f` primary becomes `192,73,47`).

## Design presets (quick complete looks)

If the user is unsure or wants a fast pick, offer these named presets. Each one
bundles a palette direction + fonts + background + layout motif into a cohesive
look. The user's brand color still drives the palette; the preset sets the rest.

1. Editorial Luxe: cream + ink, Bodoni Moda + Inter, dot or line grid, hairline
   rules, oversized serif headline, generous whitespace.
2. Neo-Brutalist Pop: white + black + one loud accent, Archivo Black + Space
   Grotesk, flat color blocks, thick borders with a hard offset shadow, mono labels.
3. Dark Glow Tech: near-black + electric accent, Space Grotesk + Inter, glow or
   spotlight background, a neon accent rule, code-style pills.
4. Soft Pastel Bento: pastel tints of the brand color, Bricolage Grotesque,
   bento cards, soft rounded shadows, one idea per card.
5. Swiss Grid: off-white + single accent, Inter (Helvetica-like), line grid,
   strict columns, rules, everything left-aligned.
6. Magazine Mono: cream + ink, Space Mono + Space Grotesk, halftone or dot grid,
   kicker + folio, drop cap, hairline rules.
7. Gradient Mesh Modern: full-bleed brand mesh, Sora + Manrope, glassy cards
   (backdrop blur), big rounded corners.
8. Y2K Chrome: saturated magenta-cyan gradient, Archivo Expanded, gradient blobs,
   chrome bevel accents, condensed caps.
9. Bold Statement Sans: white + black + one accent, Anton or Hanken 800, huge
   caps headline, flat color blocks, minimal furniture.
10. Glass Dark: near-black + neon accent, Sora + Inter, spotlight background,
    translucent glass cards (backdrop blur) with a thin glowing edge.
11. Warm Risograph: two-color overprint of the brand color, Bricolage Grotesque,
    heavy grain, flat playful shapes, slight misregister.
12. Corporate Clean: navy or slate + one accent, Figtree, line grid, tidy columns,
    restrained and trustworthy.
13. Pastel Clay: claymorphic, pastel tints of the brand color, Bricolage or
    Quicksand, soft shadows, fully rounded shapes.
14. Art-Deco Gold: ink + gold hairlines, Cormorant Garamond + Inter, symmetric
    geometry, fan motifs, tall elegant caps.
15. Gradient Noir: near-black + vivid gradient accents, Space Grotesk, gradient
    blobs, modern and high-contrast.
16. Duotone Print: brand duotone images, Archivo, halftone-dot background,
    posterized two-tone, editorial poster feel.

## Niche design directions (match the look to the field)

Detect the field from the topic and apply the matching direction so the carousel
looks native to that world. Each direction sets palette + fonts + background +
imagery + motif; the user's brand color still tints the palette, and they can
override with any preset above. Keep text contrast >=4.5:1 throughout.

- Tech / SaaS: cool indigo-violet + one electric accent, Space Grotesk + Inter,
  blueprint or line-grid background, UI mockups, mono labels, code-style pills.
- Gadgets / hardware: charcoal-black + neon accent, Sora + Inter, spotlight or
  glow background, product render on dark with a soft reflection, spec pills.
- Product / e-commerce: clean light + brand accent, Plus Jakarta Sans, soft bento
  cards, product photo on a tinted block, price and feature tags.
- Beauty / skincare: blush and nude pastels + soft gold, Cormorant Garamond +
  Mulish, gradient blobs with grain, glowy product or portrait imagery, thin rules.
- Fashion / apparel: high-contrast editorial (black-white + one accent), Bodoni
  Moda + Inter, full-bleed photo + minimal type, magazine layout, big folio numbers.
- Food / recipe: warm terracotta and cream, Fraunces + DM Sans, dot grid or paper
  texture, full-bleed food photo + scrim, numbered steps.
- Fitness / wellness: energetic lime-teal or calm sage, Hanken Grotesk + Archivo,
  bold color blocks or organic shapes, action imagery, stat hero slides.
- Finance / fintech: trustworthy navy-slate + green accent, Figtree + Inter, line
  grid, clean stat and chart slides, restrained and tidy.
- Education / coaching: friendly warm blue and amber, Bricolage Grotesque + Inter,
  dot grid or bento, numbered steps and checklists.
- Travel: airy sky and sand + sunset accent, Sora + Manrope, mesh or gradient
  blobs, full-bleed scenery photo, location tags.
- Real estate / architecture: muted stone and charcoal + brass, Cormorant + Inter,
  line grid, full-bleed property photos, elegant serif headings.
- Health / medical: clean clinical teal and white + one accent, Inter, minimal
  furniture, calm and trustworthy.
- Creative / agency / portfolio: bold expressive color, Unbounded + Hanken
  Grotesque, gradient mesh or blobs, oversized type, playful motifs.
- Food and drink / cafe, Crypto / web3 (dark neon, mono), Gaming (neon on black),
  Music (vivid gradient): adapt the nearest direction above.

## Slide layouts (archetypes, mix across the deck)

Do not repeat one layout on every slide. Pull from these and match the layout to
the content. Keep the required furniture (progress bar, brand mark, swipe cue) on
each.

- Hook cover: eyebrow + oversized headline + swipe cue (sets the look).
- Split: 50/50 image-or-color-block beside text.
- Giant number: a huge figure (01, 02) with one supporting line, for steps.
- Stat hero: one oversized statistic + label + a sentence of context.
- This vs that: two columns, strikethrough pills on one side, check pills on the other.
- Pull quote: full-bleed quote in the display face + attribution.
- Checklist / list: ticked rows, one idea each.
- Index / agenda: a numbered overview of what the carousel covers.
- Feature bento: rounded cards in a grid, one point per cell.
- CTA end-card: logo + tagline + follow/save/share pills, full progress bar, no swipe cue.

## Images on slides (sources and styles)

NEVER use Pollinations for the carousel. Images come only from the user's own
upload or the user's CONFIGURED media provider. If neither is available, build an
image-free carousel (see (c)); do not generate images and do not fall back to
Pollinations.

(a) User-uploaded: embed as base64 (`data:image/jpeg;base64,...`; check the real
type with `file`). Full-bleed with a scrim (a ~40% black-to-transparent gradient)
under the text.

(b) AI-generated via the user's CONFIGURED provider only (a provider with a key,
never Pollinations). Discover valid ids from `/api/media/models` (the `image`
list) and pass the exact id the user picked in step 9, never a hardcoded one.
Remove the image background so it never sits in a box (see "Removing the image
background"): generate the subject on a pure solid background that matches the
slide tone, then blend it out. Generate through the dispatcher and embed as base64:
```bash
"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" \
  --surface image --model "<id the user picked from /api/media/models>" \
  --output "slide.png" --aspect 4:5 \
  --prompt "<subject>, on a pure solid black background (use white for light slides), plain, no gradient, no shadow"
```
The available ids depend on which providers have keys, so discover them at
runtime rather than assuming a model exists.

(c) None or no provider configured: do NOT use images (and never Pollinations).
Build an excellent image-free carousel that carries on typography and design
alone: a distinctive heading face from the Typography menu, a strong type ramp,
and a DIFFERENT background treatment per slide (mesh, dots, line grid, glow,
stripes, bento, accent block). Done well this looks premium with zero imagery,
and it is the correct choice whenever no media provider key is set.

(d) Illustration and icon styles (via the configured provider, same path as (b)). The
style is set entirely by prompt words, so match the style to the content. Use a
clean background for spot art ("on a plain soft pastel background" or "on white")
and place it in a rounded card or a slide corner; for a hero, go full-bleed with
a scrim under the text. Recipe: `<style words>, <subject>, <brand colors>, <bg>`.

Imagery style menu (prompt recipe -> good for):
- 3D clay render: "3D rendered clay illustration of <subject>, glossy, soft studio
  lighting, pastel background, octane render" -> finance, startup, product, app icons.
- Flat vector: "flat minimal vector illustration of <subject>, simple shapes, two
  colors, white background" -> business, finance, education, how-to.
- Line doodle: "single-line hand-drawn monoline doodle of <subject>, accent on
  cream" -> minimal and editorial accents.
- Isometric: "isometric 3D illustration of <subject>, clean, soft shadows" ->
  tech, SaaS, process and flow diagrams.
- Watercolor / anime: "soft anime watercolor illustration of <subject>, cozy
  storybook, pastel, hand-drawn" -> food, lifestyle, wellness, kids.
- Paper-cut / collage: "layered paper-cut illustration of <subject>, soft shadows"
  -> playful and craft topics.
- Realistic photo: "candid realistic photo of <subject>, natural light, shallow
  depth of field, editorial" -> lifestyle, beauty, food, people.
- Abstract 3D: "glossy abstract 3D gradient shapes, brand colors" -> tech and
  decorative backgrounds.

Real humans: for authentic faces prefer the user's own photos or real stock; AI
faces can look uncanny and raise likeness issues. If you do generate people, keep
them mid-distance or stylized (3D or illustrated) and describe them generically.

Removing the image background (do this for EVERY subject or object so it never
sits in a clashing box). Most image models do NOT honor a "transparent
background" prompt, they return a solid background regardless, so do NOT rely on
prompting for transparency. Use this reliable, model-agnostic method:

1. Generate the subject on a PURE solid background that matches the slide tone:
   a DARK slide -> prompt "...on a pure solid black background"; a LIGHT slide ->
   "...on a pure solid white background". Keep the subject centered with margin.
2. Drop that background in the slide with a blend mode on the `<img>`:
   - dark slide: `mix-blend-mode: screen` (pure black disappears)
   - light slide: `mix-blend-mode: multiply` (pure white disappears)
   Add a soft edge fade so any residue feathers out:
   `-webkit-mask-image: radial-gradient(closest-side, #000 72%, transparent);
            mask-image: radial-gradient(closest-side, #000 72%, transparent);`
   The subject now reads as a clean cutout on the slide, with no box.

Verify after generating: if the image still shows a visible rectangle on the
slide, the model returned a non-pure background, regenerate with a stronger
"pure solid black/white background, plain, no gradient, no shadow" instruction,
or go full-bleed with a scrim instead. Only request a real transparent PNG if you
KNOW the user's model outputs alpha (most do not); a truly transparent PNG from
an arbitrary model needs a separate background-removal step.

Clarity: generate at >=1024px and add "sharp focus, high detail, studio lighting".
Keep one imagery style per carousel so the deck stays cohesive.

## Slide format and required furniture

- Each slide uses the chosen size; default `width:1080px; aspect-ratio:4/5`.
  Use `1/1`, `1.91/1`, or `3/4` if picked. First slide locks the ratio.
- Stack slides in a `.deck` (flex column). Each slide is its own
  `<section data-od-id="slide-N">`.
- Keep critical content inside a ~10% safe margin; leave the bottom ~10% clear
  (Instagram chrome overlaps there), about 150px on a 1350-tall slide.
- Progress bar on every slide: 3px track + fill at `((i+1)/total)*100%` + an
  `i+1/total` counter. Light slides: black-alpha track, BRAND_PRIMARY fill.
  Dark/gradient/photo slides: white-alpha track, white fill.
- Swipe cue on every slide except the last. The last slide has no cue, full bar.
- Brand mark (logo or @handle + accent) on every slide.

## Slide sequence (5-10 slides, 7 ideal)

Cover (hook) -> Problem -> Solution (gradient or hero image) -> Features ->
Details -> How-to -> CTA. Alternate light/dark/photo. Adapt to the topic. One
idea per slide. Components: tag label, strikethrough pills, tag pills,
quote/prompt box, feature list, numbered steps, CTA button, scrim over images.

## Content formats (offer one if the user is unsure)

Listicle, How-to/steps, Checklist, Mistakes -> fixes, This vs that, Case study
(with real numbers), Myth vs fact, Quick-start kit, Story/lesson. Always: one
outcome per carousel, a one-sentence promise on slide 1, one idea per slide, a
repeated motif, a clear CTA on the last slide.

## Hooks (write the cover line by content type)

The cover hook is the whole carousel's job in one line: it must stop the scroll
and promise one specific payoff the rest of the deck delivers. Write 2-3 hook
options for the topic, pick the strongest, and keep it short enough to set large
(ideally <=9 words). Be specific (numbers, named outcomes), open a curiosity gap
or stake, and never promise what the slides do not deliver.

Hook formulas (fill in from the user's topic):
- Outcome promise: "How to [outcome] without [common pain]".
- Number / listicle: "[N] [things] that [benefit]".
- Contrarian: "Stop [common advice]. Do [this] instead".
- Mistake callout: "[N] mistakes that [bad result] (and the fix)".
- Curiosity gap: "The real reason your [thing] [underperforms]".
- Question: "Why does [X] look [premium / cheap]?".
- Before / after: "From [bad state] to [good state] in [N steps]".
- Authority / secret: "What [pros] know about [topic] that you do not".
- Speed: "[Outcome] in [N] minutes" or "[N]-step [outcome]".
- Loss aversion: "You lose [thing] every time you [common action]".
- Story: "I [did X]. Here is what happened".

Match the hook to the content format the user picked:
- Listicle -> Number hook.
- How-to / steps -> Outcome promise or Speed hook.
- Checklist -> Number hook + a "save this" CTA.
- Mistakes -> fixes -> Mistake callout.
- This vs that -> Question or comparison hook.
- Case study -> Before / after with the real number.
- Myth vs fact -> Contrarian hook.
- Quick-start kit -> Speed hook.
- Story / lesson -> Story hook.

Pair the hook with a one-line subhead on the cover that states the payoff plainly
(for example hook "Make your designs feel expensive" + subhead "5 fast moves, no
new budget"). Carry the same promise into the CTA end-card.

## DOWNLOAD (required: the output must be downloadable)

The artifact must let the user download the slides as real images. Use a single
"Download all slides" button. Do NOT add a per-slide button on each slide (it
clutters the deck and collides with Open Design's own Download chrome).

1. Load html-to-image and JSZip:
   `<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js"></script>`
   `<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>`
2. Put one "Download all slides" button in a control bar at the top, left-aligned
   (`justify-content: flex-start`), so it never overlaps Open Design's Download
   button in the top-right. Put `data-slide` on each slide section.
3. CRITICAL for image slides: base64-embed AI images (see "Images on slides"). If
   you must reference a remote `<img>`, it MUST have `crossorigin="anonymous"`
   (else it taints the canvas and the render throws). Embedded data-URI images
   never taint, so prefer them.
4. Render every slide to a PNG, bundle them into ONE zip, and download the zip
   once. A single download avoids the browser/sandbox block on firing many
   downloads (which is why per-slide loops only ever saved the first slide):
```html
<script>
  const all = document.querySelector('[data-dl-all]');
  if (all) all.onclick = async () => {
    const slides = document.querySelectorAll('[data-slide]');
    const label = all.textContent; all.disabled = true;
    try {
      const zip = new JSZip(); let ok = 0;
      for (let i = 0; i < slides.length; i++) {
        all.textContent = 'Rendering ' + (i+1) + '/' + slides.length + '...';
        try {
          const blob = await htmlToImage.toBlob(slides[i], { pixelRatio: 1, width: slides[i].offsetWidth, height: slides[i].offsetHeight });
          if (blob) { zip.file('slide_' + (i+1) + '.png', blob); ok++; }
        } catch (e) { console.error('slide ' + (i+1) + ' failed', e); }
      }
      all.textContent = 'Zipping...';
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a'); a.href = url; a.download = 'carousel-slides.zip'; a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
      all.textContent = ok + '/' + slides.length + ' in zip';
    } catch (e) { console.error('zip failed', e); all.textContent = 'Failed, see console'; }
    setTimeout(function (){ all.textContent = label; all.disabled = false; }, 2200);
  };
</script>
```
Downloads land on disk when the artifact is opened in a normal browser; inside
Open Design's sandboxed preview they stay in the sandbox, so tell the user to
open the served URL in their browser (or use Open Design's own Download) to save
the PNGs locally.

## Using a media provider (keyed)

This carousel does not use Pollinations. To generate images at all, the user
needs a provider key; otherwise build an image-free carousel (see "Images on
slides" (c)). To use a provider:
1. Open Settings -> Media providers and add a key for any image provider OD
   supports. Each provider serves different models.
2. Discover which models are actually usable from `/api/media/models` (the
   `image` list shows every model and its provider; `providers` shows which have
   a key). Do not assume any specific model or provider exists.
3. Show the user the configured models and let them choose. Generate with the
   exact id they picked: `od media generate --model "<id>"`, then embed the
   result. Always take the id from the endpoint, never hardcode one.
If no key is set, do not generate images and do not use Pollinations: build an
image-free carousel that leans on excellent typography and the background
treatments.

## Output

Emit one self-contained HTML document (`<!doctype html>` ... `</html>`, CSS
inline; web-font `<link>` and the html-to-image CDN allowed). Real content from
the user's answers only. No lorem ipsum. No em dashes. Put `data-od-id` on the
deck and each slide, and `data-slide` on each slide node for the downloader.

## Self-check

All brand details were asked fresh this run (nothing reused or assumed); a strong
cover hook matched to the content type, with a payoff subhead, carried into the
CTA; chosen style and typography applied with a distinctive heading face; every non-image
slide has a real background treatment (dot grid, line grid, mesh, glow, stripes,
or bento), never a flat solid, and adjacent slides differ; chosen size on every
slide; no em dashes anywhere; images placed with a scrim under text; progress bar
+ brand mark on every slide; swipe cue on all but the last; one top-left
"Download all slides" button that works (no per-slide buttons); Pollinations was
NOT used; images came only from the user's upload or their configured provider as
background-removed cutouts (pure solid bg + blend) and are base64-embedded, or, if no provider was
configured, the carousel is image-free and carries on typography and design;
5-10 slides.
