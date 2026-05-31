# AWS PPTX deck — pre-emit checklist

Run before emitting `<artifact>`. Every **P0** must pass. P1 should pass; if you waive, say so explicitly in the response.

## P0 — must pass

- [ ] Canvas is exactly `1920 × 1080`. The framework's `.deck-stage { width: 1920px; height: 1080px; }` block is intact.
- [ ] `<html data-theme="dark">` or `<html data-theme="light">` is set, and the `:root[data-theme="..."]` token block in `assets/template.html` is unmodified.
- [ ] Every color in the deck resolves to an AWS palette token (Squid Ink, Smile Orange, Galaxy Purple, Nebula, Mars Red, Cosmos Pink, Endor Green, Orbit Turquoise, Light Gray, White, Black, Arrow-on-Dark). No improvised hex values.
- [ ] Every architecture / system / data-flow slide either embeds a generated diagram from `assets/diagrams/` (via drawio or architecture-diagram skill) OR carries the explicit `.arch-placeholder` slot. **No hand-drawn SVG architecture diagrams in the deck file itself.**
- [ ] Every slide has a `data-screen-label="NN Title"` attribute (1-indexed).
- [ ] First `<section class="slide">` has the `active` class. None of the others do.
- [ ] The Cover slide carries the Smile Orange bottom accent bar (`<div class="cover-accent"></div>`).
- [ ] The Cover slide includes the session code in 14px Smile Orange uppercase top-left.
- [ ] All slide titles ≤ 8 words, ≤ 3 lines, ≤ 44pt.
- [ ] All body bullets ≤ 15 words per line, ≤ 5 bullets per slide.
- [ ] Tables: header row uses `--smile-orange`, alternating rows use the prescribed dark or light alternating fills.
- [ ] When `techVsBusiness` is `tech` or `business`: every Content slide that explains a concept uses the **Two-Column** layout (image/diagram + bullets), not bullets-only.
- [ ] No emoji used as feature icons. No Inter/Roboto headlines (system fallbacks declared in `--font-display` are fine).
- [ ] No "Feature One / Feature Two", no lorem ipsum, no invented metrics. Real copy or short honest stubs only (`—`, `[customer]`).
- [ ] The framework `<script>` and `@media print` blocks are unchanged from `assets/template.html`.

## P1 — should pass

- [ ] Theme rhythm — no 3+ consecutive same-layout slides (e.g. four content-only slides in a row). Insert a section divider or two-column to break the cadence.
- [ ] Every architecture slide carries a one-sentence caption (14px Amazon Ember) below the diagram.
- [ ] Service category colors only used in their assigned semantic role (Galaxy Purple ⟶ Analytics; Nebula ⟶ Database; etc).
- [ ] Smile Orange is used at most twice per slide.
- [ ] Status pills only used for actual status — not as decoration.
- [ ] Quote slide has attribution (name, title, customer/company).
- [ ] Q&A slide includes speaker name + contact info (email or twitter handle), not just "Questions?".

## P2 — polish

- [ ] Big-stat slides have a one-sentence "what this means" line below the number.
- [ ] Demo/Code slides use `--font-mono` and a Squid Ink surface even in light theme.
- [ ] Comparison tables have an explicit "winner" column or check/cross visual cue.
- [ ] Customer Story slide has the customer logo (real, not invented), 3 metrics, 1 quote.
- [ ] Resources/CTA slide includes at least one QR code slot or short-link.
- [ ] PDF print preview (Save → PDF) renders 12 separate vertical pages, no clipping.

## Density check (most common failure)

For every slide, mentally render at 1920×1080 and check:

- [ ] Title fits within 80px of vertical space.
- [ ] Body content stops at least 80px before the bottom edge or any absolutely-positioned footer.
- [ ] On Cover slide, the headline does not overlap the orange accent bar.
- [ ] On Two-Column slides, the image column has `aspect-ratio` set so the diagram doesn't squish.
- [ ] On Architecture slides, the diagram caption is fully visible (not cut off at the bottom safe band).

## 5-dimensional critique

Score yourself silently 1–5 on each axis. If any < 3, fix the weakest, re-score.

1. **Philosophy** — does it look like an AWS-issued deck (Squid Ink + Smile Orange, Amazon Ember rhythm, AWS layout patterns)? Or did it drift to a generic SaaS landing-page aesthetic?
2. **Hierarchy** — does each slide have one clear focal point? Title + visual + bullets, in that order, every time.
3. **Execution** — typography sizes, spacing, alignment, contrast. Are headlines at the right size, are bullets consistent, do tables align?
4. **Specificity** — is every word, number, customer name specific to this brief? Or did filler creep in?
5. **Restraint** — Smile Orange used at most twice per slide; service category colors used only in assigned roles; one decisive flourish per deck (not three competing).
