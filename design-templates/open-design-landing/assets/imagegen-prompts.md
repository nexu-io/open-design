# Atelier Zero — Image Generation Prompt Pack

This pack is consumed by the `open-design-landing` skill. Every page-level
image is rendered with `gpt-image-fal` (preferred) or `gpt-image-azure`.

The pack has three layers:

1. **Style anchor** — the long block that tells the model what
   universe we are in. Always prepend to every prompt.
2. **Variable slots** — the per-render content (subject, motifs,
   accent, page type).
3. **Per-slot variants** — explicit composition templates for hero,
   about, capabilities, method tiles, lab cards, work cards,
   testimonial, and CTA.

Render at 1024×1024 minimum for square slots (hero / about / capabilities
/ testimonial / cta), 816×816 for the four method tiles, and 768×1024 for
portrait slots (lab cards, featured work). Authoritative per-slot
dimensions and aspect ratios live in `image-manifest.json` — treat that
file as the source of truth. Save as PNG to `assets/<slot>.png`.

---

## 1. Style anchor (always prepend)

```text
Use case: ads-marketing

Asset type: editorial website hero / creative studio landing page visual

Primary request: Generate a refined editorial web page composition in the
same visual language as a high-end creative AI research studio.

Style/medium: sophisticated digital collage, modern Swiss editorial layout,
Bauhaus geometric composition, classical plaster sculpture fragments,
brutalist/minimal architecture, art-direction website mockup, premium
agency aesthetic.

Scene/backdrop: warm off-white handmade paper background with subtle
grain, faint vertical folds, scanned paper fibers, lightly aged print
texture, thin drafting lines and registration marks.

Subject: a surreal collage combining a cropped classical plaster head or
face fragment, abstract architectural blocks, archways or stairs, sky
cutouts, one small human figure, a delicate tree or botanical element,
and geometric color planes.

Composition/framing: wide 16:9 web page layout, strong asymmetrical
grid, generous negative space, large typography area on the left or
top-left, collage focal object on the right or center-right, precise
alignment, thin divider lines, small UI navigation details.

Lighting/mood: soft diffused daylight, museum-like calm, intelligent,
restrained, tactile, poetic, premium, research-driven.

Color palette: warm ivory, stone beige, soft concrete gray, deep black
text, muted charcoal, washed coral-red accent, occasional mustard-yellow
accent, pale sky blue only inside small sky/image cutouts.

Materials/textures: matte plaster, limestone, travertine, concrete, rough
torn paper edges, halftone print grain, translucent vellum-like overlays,
fine grid paper, dotted matrix patterns.

Typography: large clean grotesk sans-serif for main headline, elegant
high-contrast italic serif for emphasized words, tiny uppercase coral
labels, compact UI microcopy. Text must be crisp, readable, and spelled
exactly as provided.

Graphic details: thin hairline circles, partial arcs, crosshair marks,
small black dots, dotted grids, fine coordinate lines, numbered
annotations, small arrow buttons, simple pill buttons, minimal logo mark.

Constraints: preserve a high-end editorial web design feel; keep spacing
elegant and uncluttered; no cartoon style; no neon colors; no glossy 3D;
no busy gradients; no generic stock-photo look.

Avoid: distorted typography, misspelled text, extra random words, heavy
shadows, childish illustration, cyberpunk, saturated purple/blue palette,
plastic materials, overly decorative UI cards, cluttered composition,
low-resolution textures, watermarks.
```

## 2. Variable slots (substitute per render)

```text
Brand/logo text:        "<BRAND_NAME>"
Navigation text:        "<NAV_1>", "<NAV_2>", "<NAV_3>", "<NAV_4>", "<NAV_5>"
Eyebrow label:          "<EYEBROW>"
Main headline:          "<MAIN_HEADLINE>"
Italic emphasis words:  "<ITALIC_WORDS>"
Body copy:              "<BODY_COPY>"
Primary button:         "<PRIMARY_CTA>"
Secondary button:       "<SECONDARY_CTA>"
Footer/micro labels:    "<FOOTER_LABELS>"
Main collage subject:   <plaster head | eye | hand | arch | stair | tree | landscape | object>
Inserted texture motifs:<sky, mountain, ocean, eye close-up, dancer, stone, fabric, map, grid, handwritten note>
Accent color:           <washed coral red | mustard yellow | pale blue | muted sage>
Page type:              <hero | about | capabilities | method tile | lab card | work card | testimonial | cta>
```

## 3. Per-slot composition templates

### `hero.png` — 1:1 (1024×1024)

```text
Composition/framing: left half is intentionally empty/quiet to allow real
HTML headline overlay; right half holds a tall surreal collage of a
cropped classical plaster head with the top sliced open, sky/architecture
cutouts visible inside the head, a delicate young tree growing through
the composition, a coral sun disk behind, a mustard accent ring at the
base, hairline coordinate marks and dotted matrices around it, a small
human figure standing for scale in the lower-left of the image. Page
type: hero landing.
```

### `about.png` — 1:1 (1024×1024)

```text
Composition: a surreal museum-vitrine arrangement of a partial plaster
profile head facing right, with an open archway carved through the
torso, sky cutout inside the arch, a tree seedling growing out of the
shoulder, and a coral half-circle behind the head. Tiny dotted hairlines
trace contours. Strong negative space top-left for a side-note overlay.
Page type: about / manifesto plate.
```

### `capabilities.png` — 1:1 (1024×1024)

```text
Composition: a Bauhaus-grid stack of architectural fragments — a coral
arch on the left, a beige concrete column center, a mustard small disc
upper-right, a delicate tree mid-frame, a small classical hand fragment
holding a pencil bottom-center. Crosshair and circular hairlines
overlay. Page type: capabilities matrix.
```

### `method-1.png` … `method-4.png` — 1:1 (816×816)

```text
Composition: a single visual metaphor per step.
  method-1 — a magnifying glass over a small architectural map (Detect)
  method-2 — a clipboard with a tiny questionnaire and a coral pen (Discover)
  method-3 — a compass + ruler + color swatch fan (Direct)
  method-4 — a printer's tray with stacked paper sheets exiting (Deliver)
Each on the warm paper ground with hairline grid, a single coral or
mustard accent piece, and one numbered annotation tag. Page type:
method tile.
```

### `lab-1.png` … `lab-5.png` — 3:4 (768×1024)

```text
Composition: portrait-oriented experiment cards. Each is a square-ish
plaster-and-architecture vignette, vertical, with a single dominant
subject:
  lab-1 — a stack of folded magazine spreads
  lab-2 — a film strip + a synthetic eye + a soundwave hairline
  lab-3 — a typewriter with prompt cards in the carriage
  lab-4 — five small dotted gauges arranged in a circle (5-dim critique)
  lab-5 — a glass dome / cloche over a tiny sandbox cityscape (Sandbox)
Use the same paper ground; allow soft drop shadow but stay restrained.
Page type: lab card.
```

### `work-1.png` & `work-2.png` — 3:4 (768×1024)

```text
Composition: featured work plates.
  work-1 — guizang-ppt: an oversized open magazine spread on a desk,
           coral spine, mustard tab. Slight perspective.
  work-2 — dating-web: a concrete dashboard slab, a coral graph bar
           rising, a small classical bust beside it for scale.
Both on the warm paper ground with crop marks.
Page type: work card.
```

### `testimonial.png` — 1:1 (1024×1024)

```text
Composition: a classical plaster bust facing 3/4 left, slightly cropped,
with a small sky cutout where the eye would be, a thin coral arc around
the back of the head, mustard dot at the chin. Quiet background, lots of
negative space upper right. Page type: testimonial portrait.
```

### `cta.png` — 1:1 (1024×1024)

```text
Composition: a closing-plate collage — a mustard sun behind a single
coral arch on the right, a delicate tree growing through the arch, a
small human figure in the lower-left foreground reading a folded
broadsheet, hairline coordinate ladder up the left edge, and a small
"FIN." dotted seal in the upper-right. Page type: closing CTA plate.
```

## 4. Chinese project input template

Use only when the model copy must be Chinese; otherwise prefer English
for legibility. Keep verbatim text short.

```text
请生成一张 16:9 横版网页视觉稿，风格为高级创意 AI 工作室官网：现代瑞士编辑排版、
包豪斯几何、古典石膏雕塑拼贴、极简建筑、手工纸张肌理、细线工程制图标记。

品牌文字："<品牌名>"
导航："<导航1>", "<导航2>", "<导航3>", "<导航4>"
小标签："<小标签>"
主标题必须逐字渲染："<主标题>"
强调词（斜体衬线）："<强调词>"
正文必须逐字渲染："<正文>"
按钮文字："<按钮1>", "<按钮2>"

画面主体：<主体描述>
贴图与元素：<天空 / 石材 / 植物 / 人物 / 眼睛 / 山脉 / 水面 / UI 截图等>
构图：<左文右图 / 右文左图 / 顶部大标题下方横向卡片 / 中央拼贴 / 时间线分栏>
色彩：暖象牙白纸张、黑色文字、石灰/混凝土灰、炭黑、低饱和珊瑚红点缀、
     少量芥末黄或浅天蓝。

限制：文字清晰可读、不添加多余文字、不要水印、不要卡通、不要霓虹、
     不要厚重阴影、不要俗套科技蓝紫渐变。
```

## 5. Calling convention

Pseudocode for an agent driver:

```ts
for (const slot of imageManifest.slots) {
  const prompt = [
    STYLE_ANCHOR,
    fillVars(VARIABLE_SLOTS, brand),
    PER_SLOT[slot.id],
  ].join('\n\n');

  await gptImageFal({
    prompt,
    width:  slot.width,
    height: slot.height,
    quality: 'high',
    output: `assets/${slot.id}.png`,
  });
}
```

If `gpt-image-fal` is unavailable, the same prompts work with
`gpt-image-azure` — but mask-based inpainting is azure-only.
