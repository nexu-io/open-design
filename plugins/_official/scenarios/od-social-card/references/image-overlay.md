# Image Overlay & Subject Safety

Two rules that govern any poster where text sits on top of an image — full-bleed background, large photo well with title bar, or generated/AI image with text overlay.

A composition can pass HTML linting and still be unreadable. Both rules below must clear before you ship.

## Rule 1 — Selection first, mask only if selection fails

The default editorial-magazine answer is **no mask**. Real magazine covers (Kinfolk, Cereal, Apartamento, Monocle) almost never lay a uniform black gradient over a hero photo. They rely on **photo selection + composition** so text lands in a quiet zone naturally. If you cannot find such a photo, the answer is usually to swap the photo, not to caulk over a bad one with a 70%-black scrim.

Apply the steps in order. Stop at the first one that passes.

### Step 1 — Photo selection (the main lever)

Before picking a mask, verify the photo qualifies for full-bleed treatment. Both tests must pass:

**Quiet-zone test**: at least one band of ≥30% canvas (full width × ≥30% height, or full height × ≥30% width) is **low-detail / low-contrast / uniform**. Examples: out-of-focus background, deep shade, fog, calm water, plain sky, blurred grass. This band is where the title will land.

**Light test**: the photo carries **atmospheric / restrained light** — overcast, dawn fog, golden hour, forest understory, film softness, dusk silhouette. Reject high-saturation noon shots, on-camera flash, "tourist trap" selfies, generic stock cheerfulness.

If either test fails, **the photo is wrong for M16**. Fall back to M01 (split-layout cover with photo in a frame), or shoot/source again. Do not "fix it with a mask."

### Step 2 — Compose without a mask first

Place the title inside the qualified quiet zone. Run the thumbnail contrast check (Step 4). If it reads clean, ship as-is. Most well-selected editorial photos pass at this step.

A no-mask cover signals craft. A heavily masked cover signals "we couldn't find the right photo." Try Step 2 every time before reaching for Step 3.

### Step 3 — Localized, image-toned tint (fallback only)

Only when Step 2 fails the contrast check. Three rules:

1. **Localized, not full-canvas.** Tint only the title region. Use `radial-gradient` centered on the title block, or a one-sided linear gradient that fades to fully transparent past the title. Never `inset: 0` over the whole image with a uniform alpha curve.
2. **Image-toned, not black.** Sample a dark tone already in the photo and use it as the tint color. Forest → deep moss `#1a2818`. Dusk → tea-rose dusk `#4a2638`. Snow → cool grey-blue `#2a3438`. Pure black `#000` reads as "annotation layer," not "atmospheric depth."
3. **Soft, not opaque.** Peak alpha 0.15-0.30 in the title region, falling to 0 outside. If you need >0.40 to read, the photo failed Step 1 — go back.

```css
/* Example: title in lower-left, image-toned soft tint */
.hero-bleed::after {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(
    60% 45% at 25% 80%,         /* centered on title block */
    rgba(26, 40, 24, 0.28) 0%,  /* forest moss tone, soft peak */
    rgba(26, 40, 24, 0.0) 100%);
  pointer-events: none;
}
```

### Step 4 — Thumbnail contrast check (always)

Whether or not you applied a tint:

- Render the PNG, downscale to 360 px wide in Preview / a browser tab, and look.
- Title strokes must be legible without zoom.
- If title looks like it's "fighting" the photo → swap photo or shift title to a different quiet zone, **not** strengthen the mask.
- If photo looks dead grey under uniform dark → mask is way too heavy or covers wrong area; restart from Step 1.

### Banned

- **Uniform full-canvas vertical falloff** (the `rgba(0,0,0,.55) → .10 → .10 → .80` pattern from earlier versions of this skill). That is game-key-art treatment, not editorial.
- **Pure black mask color**. Always image-toned (forest, dusk, snow, ink-blue, sepia).
- Flat black/white rectangle behind text — reads like screenshot annotation.
- `mix-blend-mode: difference` for readability — wrecks skin tones, breaks on print.
- `img { opacity: .6 }` — kills the photo's depth, the whole point of full-bleed.
- Reaching for Step 3 before honestly attempting Step 1 with a better photo.

---

## Rule 2 — Place text away from subject / face zones

Posters in 旅行 / 游戏 / 影视 / 穿搭 / 美食 frequently use a real photo as the hero. The photo has a subject — a face, a hand, a product, a peak. Text that overlaps the subject reads as graffiti, not editorial.

### Subject zone discovery — multimodal first

Before designing the title position on a hero photo, look at the image. Open it with the Read tool and observe in plain language:

1. Where is the **primary subject's face / focal feature**? (e.g. "the climber's face is in the upper-right third around 70% x 30% y")
2. Where is the **edge of the subject's silhouette**? (e.g. "left edge ends at ~40% x; below that is sky")
3. Where is the **largest open / low-detail area**? (e.g. "the lower-left quadrant is uniform fog")

Record the answers as a comment in the HTML next to the hero block:

```html
<!-- subject map (Wukong cover hero):
     face/skull centerpiece: 50% x 45% y, occupies ~30% of frame
     left-side staff & weapons: 15-40% x, full height
     safe text zone: top band (0-15% y) and bottom band (65-100% y)
-->
```

This is the input the layout uses. It's deterministic and reviewable.

### Safe-zone placement rules

Given the subject map, place text in this order of preference:

1. **Above + below** the subject (kicker top, title bottom). 90% of full-bleed covers should do this.
2. **One side** — if subject occupies one vertical column (e.g. portrait shot on right side), text fills the opposite column. Combine with side tint from Rule 1 Step 3 only if needed.
3. **Diagonal corner** — only when the subject is in one corner and the opposite corner is genuinely empty. Rare.

Never place display titles **across** the face. A 90 px Chinese title cutting through a person's eyes is destructive even with a mask.

### Composition discipline (editorial look)

These four rules are what separates an editorial poster from a generic image-with-text:

- **Asymmetric placement.** Titles offset to one side / one corner read more confident than dead-centered ones. The Kinfolk / Cereal habit.
- **Generous negative space.** Title should occupy ≤40% of the canvas. The photo and the empty quiet zone are doing the design work.
- **Title in one quiet zone, only one.** Splitting the title into two zones (top + bottom) is fine; splitting it into three or wrapping around the subject is busy.
- **Title never overlaps the subject silhouette.** If the only safe placement requires crossing the subject's edge, switch modes (move to a frame, diptych, or off-image title) — do not enlarge the mask.

### Crop guards

The face-avoidance rule should also drive `object-position`. If the subject is in the upper third, do not use `object-position: center top` (that pushes the face into the title band).

| Subject location in raw image | Recommended `object-position` for 3:4 crop |
| ----------------------------- | ------------------------------------------ |
| Face / focus in upper third   | `center 25%` (lifts face higher, gives bottom room for title) |
| Face / focus in middle third  | `center center` (default; text goes top + bottom) |
| Face / focus in lower third   | `center 70%` (drops face down, top room for title) |
| Wide landscape, no single subject | `center 35%` (slight upward bias to retain horizon line) |
| Vertical portrait, full body  | `center top` |

### When the photo cannot accommodate text

If running the subject map shows there is no safe zone wider than ~30% of the poster (subject fills the frame, e.g. tight portrait), do not retrofit. Options:

- Move the photo into a **smaller frame** (use `.frame-img.r-3x4` or `.r-1x1` inside the layout — give it a defined slot, surround it with whitespace and text).
- **Two-image diptych** with one tight subject + one negative-space image, run titles over the negative-space one.
- **Move text off the image entirely** — title above, photo below. The Yading cover already does this.

A photo that demands the full canvas is not a sign that text should fight it. It is a sign that text should sit elsewhere.

---

## Checklist before delivery

Run this for every poster that has text touching an image:

- [ ] Photo passes quiet-zone test (≥30% canvas low-detail band) AND light test (atmospheric, not high-saturation noon).
- [ ] Tried no-mask composition first. Tint only added if Step 4 contrast check failed.
- [ ] If tinted: localized (`radial-gradient` or one-sided), image-toned color (not pure black), peak alpha ≤ 0.30.
- [ ] No full-canvas vertical falloff present (`linear-gradient(180deg, rgba(0,0,0,.X) → ...)` over `inset:0`).
- [ ] Subject map documented as a comment near the hero block.
- [ ] No display title (≥ 72 px) overlaps a face / hand / key product feature / subject silhouette.
- [ ] Title occupies ≤40% of canvas. Asymmetric placement preferred over centered.
- [ ] `object-position` chosen from the table above, not left at default `center top` for face shots.
- [ ] Thumbnail test passed (downscale to 360 px wide; title still legible without strain).
- [ ] No flat black/white text plate behind the title.

If any item fails, fix it before exporting the final PNG. Do not deliver and "we can adjust later" — the QA window for social cards is the moment of upload.
