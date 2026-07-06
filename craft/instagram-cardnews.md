# Instagram card-news (AI background + Pillow overlay) — craft rules

Brand-agnostic technical constraints for producing an Instagram carousel
card-news set as final PNG files. Pipeline: AI-generated backgrounds (codex
built-in `image_gen`) + deterministic Pillow text overlay (the skill's
`scripts/compose_cards.py`). Brand-specific facts (palette, voice, hook
formulas, logo asset path, disclaimers, account handle) belong in
`design-systems/<brand>/DESIGN.md`, NOT here.

---

## 1. Card size — exactly 1080×1350 (4:5)

Final PNGs are exactly **1080×1350 px (4:5)**. The compose script guarantees
this via center 4:5 crop + LANCZOS resize; never ship a raw generated image.
1:1 (1080×1080) only on explicit user request.

**Checklist item (fails lint):** an output PNG whose size ≠ 1080×1350 (or
≠ the explicitly requested 1:1).

## 2. Background generation — portrait, no text

Backgrounds come from codex `image_gen`. Every generation prompt MUST: state
**portrait orientation** (4:5 is not directly supported — the crop guarantees
the final ratio); forbid text (**"no text, no letters, no watermark"**); and
instruct the model to keep the text zone (per role layout, rule 9) simple and
calm.

Basic-layout runs (the current only body layout): the background must be a
**photorealistic real-world environment** — an actual place/scene the card's
message lives in. Flat or graphic illustration backgrounds (including dark
solid + object compositions) are a fail. Style keywords: "photorealistic
real-world environment, cinematic natural lighting". Constraints must also
include: **"no flat illustration, no abstract graphic background"**.

**Checklist item (fails lint):** a generation prompt missing the no-text
clause or the portrait instruction; a basic-layout background that is a flat
or graphic illustration instead of a photorealistic environment.

## 3. Style anchor — cover first, others reference it

Generate the cover background FIRST. Every body background is generated with
the cover image attached as a visual reference ("same style, same palette").
Per-card unrelated styles are a fail.

If the brand has a mascot/character (registered in the brand's DESIGN.md),
every body-background call must attach TWO view_image references: the cover
anchor (style/palette) AND the brand character reference asset (identity),
plus a character-lock clause ("Use the exact same character as in the
reference image — identical proportions, face, eyes, mouth, colors. Do not
redesign, restyle, or reinterpret the character."). Character drift across
cards is a fail.

Character scale/framing (character brands): the character is the dominant
subject — roughly 50–70% of frame height, near-center, full body, close-to-mid
shot (no distant long shot), fully inside the central 4:5 crop safe area (the
top/bottom ~8.3% bands of a 2:3 render are cropped away). A tiny, distant,
corner-pushed, or crop-clipped character is a fail.

**Checklist item (fails lint):** a body background generated without the
cover anchor reference; visibly mismatched styles across cards; a character
brand run missing the character reference attachment; character shape drift
(proportions/face/colors) between cards; a character rendered tiny/distant
or clipped by the 4:5 crop.

## 4. Text = 100% Pillow overlay

AI images must not carry rendered text; all Korean text is overlaid by the
compose script (Pretendard first, Nanum fallback). Editing copy must never
require re-generating a background.

**Checklist item (fails lint):** copy baked into a generated background; text
rendered by anything other than the compose script.

## 5. Type minimums

Body text ≥36px, cover hook ≥80px (at 1080px width — feed-thumbnail
legibility). The compose defaults (hook 92 / body-title 58 / body 43 /
cover-sub 44 / cta-handle 112 / cta-sub 42) satisfy this.

**Checklist item (fails lint):** body text <36px or cover hook <80px.

## 6. Safe margins ≥72px

No text closer than 72px to any card edge (crop and UI-overlay safety).

**Checklist item (fails lint):** text inside the 72px edge band.

## 7. One card, one message

Each body card: one key point — title (≤2 lines) + support lines (≤7).
No multi-topic cards.

**Checklist item (fails lint):** a body card carrying two unrelated points
or more than 7 support lines.

## 8. Card count — 5–8 default, 10 max

Default 5–8 cards (cover + body cards + CTA). Hard max 10.

**Checklist item (fails lint):** <5 or >10 cards without an explicit user
request.

## 9. Fixed role layouts (cover / body / cta)

Layouts are a fixed contract (smoke-proven 2026-07-06); per-run variation is
text + background only.

- **cover** — bottom-left subtitle (~44px) + large hook (~92px) over a soft
  bottom gradient (feathered — hard edges forbidden). A "저장" nudge tag is
  allowed in the subtitle.
- **body** — top-center logo + left-aligned bold title (≤2 lines, ~58px,
  ink-top anchored at ~648px) + body lines (~43px, uniform 62px line pitch,
  ≤7 lines, ink-top anchored at ~794px — fixed grid regardless of title line
  count) over a soft bottom gradient (start ~0.40H, peak alpha ~230,
  feathered — hard edges forbidden). **No boxes, no scrim bands, no uniform
  full-frame darkening** (v2: uniform darkening is retired; a hard-edge scrim
  band remains a user-rejected pattern). Legibility is primarily the
  background prompt's job (rule 2's calm lower half).
  Body lines are prose-style paragraph lines that fill the column — width-based
  breaks (roughly 25–31 chars/line incl. spaces at the 43px body size, mid-word breaks allowed), longest body line ≥80% of
  the 912px usable width (symmetric 84px margins, right ink limit x=996). A
  half-width narrow column or clipped summary fragments are a fail.
- **cta** — reuse of the COVER background (no extra generation: N-1 calls
  total) + **uniform full-frame dim (~45%) by contract — never a gradient**
  (user-confirmed 2026-07-06) + centered account handle (~112px) + sub line
  (~42px; + disclaimer if the brand requires one).
- Brand logo on every card = image-asset composite at top center, fixed
  width 99px — never font-rendered.

**Checklist item (fails lint):** box/band/uniform darkening behind text; a
font-rendered logo; a CTA card with its own generated background; a CTA card
with a gradient instead of the uniform dim; a body card whose longest line
fills <80% of the usable width (narrow column).

## 10. Color discipline

Background prompts state the brand palette (DESIGN.md tokens); overlay text
colors come from DESIGN.md tokens; keep text/background contrast (light text
over darkened background, or the inverse).

**Checklist item (fails lint):** off-palette background; illegible
text/background combination.

## 11. Caption separated + fixed 8-block anatomy

Caption + hashtags never appear inside card images — they live in the
gallery's `.caption` block only. The caption follows the fixed 8-block
anatomy (canonical template: skill `references/card-structure.md`):
① hook restatement ("quoted question") + audience empathy + situational
emoji ② emoji-headed body section blocks (📊/📚 + subtitle (+source) + `·`
bullets) ③ ⚠️ caution/disclaimer ④ ✅ action checklist (1️⃣2️⃣3️⃣) ⑤ 💡
closing insight ⑥ 💬 save/tag nudge ⑦ `—` divider + next-content teaser +
@handle follow nudge ✨ ⑧ 📌 source list (`·` separated). Hashtags follow
as a separate block after ⑧.

**Checklist item (fails lint):** caption text inside a card PNG; a caption
missing blocks ①/③/⑧ (minimum skeleton); hashtags mixed into the caption
body instead of a trailing block.

## 12. Output structure

Deliverables per run: `<slug>-NN.png` (every card, index order) +
`<slug>-preview.html` static gallery (pure HTML — `<img>` per card in order,
each card followed by a per-card download anchor
`<a href="<slug>-NN.png" download>` + one `.caption` block) + `cards.json` +
a handoff reminder to append one line to `publish-history.md` after actually
publishing (the skill never appends it automatically).

**Checklist item (fails lint):** missing gallery; gallery `<img>` order ≠
card index order; missing `.caption` block; a card missing its download
anchor or an anchor href that does not match that card's filename.

---

## Lint checklist summary

| # | Rule | Fail condition |
|---|------|----------------|
| 1 | Card size | PNG ≠ 1080×1350 (or explicit 1:1) |
| 2 | Background prompt | missing no-text/portrait clause; flat-illustration background on basic layout |
| 3 | Style anchor | body bg without cover anchor; mismatched styles; missing character reference; character drift |
| 4 | Pillow-only text | copy baked into a generated background |
| 5 | Type minimums | body <36px; hook <80px |
| 6 | Safe margins | text inside the 72px edge band |
| 7 | One message | multi-topic body card; >7 support lines |
| 8 | Card count | <5 or >10 without explicit request |
| 9 | Role layouts | box/band/uniform darkening behind text; font-rendered logo; CTA own bg or gradient dim |
| 10 | Color | off-palette bg; illegible contrast |
| 11 | Caption anatomy | caption in PNG; missing ①/③/⑧; inline hashtags |
| 12 | Output set | missing gallery/caption block; img order mismatch; missing/wrong download anchor |
