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

**Checklist item (fails lint):** a generation prompt missing the no-text
clause or the portrait instruction.

## 3. Style anchor — cover first, others reference it

Generate the cover background FIRST. Every body background is generated with
the cover image attached as a visual reference ("same style, same palette").
Per-card unrelated styles are a fail.

**Checklist item (fails lint):** a body background generated without the
cover anchor reference; visibly mismatched styles across cards.

## 4. Text = 100% Pillow overlay

AI images must not carry rendered text; all Korean text is overlaid by the
compose script (Pretendard first, Nanum fallback). Editing copy must never
require re-generating a background.

**Checklist item (fails lint):** copy baked into a generated background; text
rendered by anything other than the compose script.

## 5. Type minimums

Body text ≥36px, cover hook ≥80px (at 1080px width — feed-thumbnail
legibility). The compose defaults (hook 92 / body-title 64 / body 40 /
cover-sub 44 / cta-handle 112 / cta-sub 42) satisfy this.

**Checklist item (fails lint):** body text <36px or cover hook <80px.

## 6. Safe margins ≥72px

No text closer than 72px to any card edge (crop and UI-overlay safety).

**Checklist item (fails lint):** text inside the 72px edge band.

## 7. One card, one message

Each body card: one key point — title (≤2 lines) + support lines (≤3~4).
No multi-topic cards.

**Checklist item (fails lint):** a body card carrying two unrelated points
or more than 4 support lines.

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
- **body** — top-center logo + left-aligned bold title (≤2 lines, ~64px) +
  body lines (~40px, generous leading). **No boxes, no scrim bands** —
  uniform full-frame darkening only (a hard-edge scrim band is a
  user-rejected pattern). Legibility is primarily the background prompt's
  job (rule 2's calm text zone).
- **cta** — reuse of the COVER background (no extra generation: N-1 calls
  total) + full-frame dim (~45%) + centered account handle (~112px) + sub
  line (~42px; + disclaimer if the brand requires one).
- Brand logo on every card = image-asset composite at top center, fixed
  width 99px — never font-rendered.

**Checklist item (fails lint):** any hard-edge box/band behind text; a
font-rendered logo; a CTA card with its own generated background.

## 10. Card index badge (N/total)

Every card carries an "N/total" index badge (compose script, top-right).

**Checklist item (fails lint):** missing or wrong-order index badge.

## 11. Color discipline

Background prompts state the brand palette (DESIGN.md tokens); overlay text
colors come from DESIGN.md tokens; keep text/background contrast (light text
over darkened background, or the inverse).

**Checklist item (fails lint):** off-palette background; illegible
text/background combination.

## 12. Caption separated + fixed 8-block anatomy

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

## 13. Output structure

Deliverables per run: `<slug>-NN.png` (every card, index order) +
`<slug>-preview.html` static gallery (pure HTML — `<img>` per card in order
+ one `.caption` block) + `cards.json` + a handoff reminder to append one
line to `publish-history.md` after actually publishing (the skill never
appends it automatically).

**Checklist item (fails lint):** missing gallery; gallery `<img>` order ≠
card index order; missing `.caption` block.

---

## Lint checklist summary

| # | Rule | Fail condition |
|---|------|----------------|
| 1 | Card size | PNG ≠ 1080×1350 (or explicit 1:1) |
| 2 | Background prompt | missing no-text clause / portrait instruction |
| 3 | Style anchor | body bg without cover reference; mismatched styles |
| 4 | Pillow-only text | copy baked into a generated background |
| 5 | Type minimums | body <36px; hook <80px |
| 6 | Safe margins | text inside the 72px edge band |
| 7 | One message | multi-topic body card; >4 support lines |
| 8 | Card count | <5 or >10 without explicit request |
| 9 | Role layouts | hard-edge box/band; font-rendered logo; CTA own bg |
| 10 | Index badge | missing / wrong order |
| 11 | Color | off-palette bg; illegible contrast |
| 12 | Caption anatomy | caption in PNG; missing ①/③/⑧; inline hashtags |
| 13 | Output set | missing gallery/caption block; img order mismatch |
