# Presentation Checkup — Failure Mode Catalog (v0.9)

> English mirror of `references/qa-failure-modes.md`. Both files are kept in
> sync; the code-side source of truth is the `FAILURE_MODES` dict in
> `scripts/humanize_ppt_v2.py`, matched one-to-one by id.

The presentation checkup (the former "QA loop"; the CLI is still `--qa-from`) is the per-page review Humanize PPT runs over rendered HTML or a native PPTX before sign-off. The checkup is **not** about how pretty the deck is — it is about the **outline**: it diffs each rendered page against its outline page and catches the pages that can be *looked at* but not *presented*, until every page is one you could stand up and deliver.

Say plainly what a failed page is. A page with only a few words that never finishes the point it owes; or a page that does not complete the audience state transfer it promised — the listener walks away from it in the same state they arrived. Such pages should not exist. The checkup finds them and emits a fix instruction (`fix_prompt.md`) for the downstream skill to re-render.

This file is the human-readable catalog the checkup scans against. The single code-side source of truth is the `FAILURE_MODES` dict in `scripts/humanize_ppt_v2.py`; the two sides correspond by id.

**Catalog discipline: list only rules that actually exist in code.** No wishlist, no invented checks. A failure class that is real but the scanner cannot yet detect goes under [Failure classes the static scan can't catch yet](#failure-classes-the-static-scan-cant-catch-yet) — it is never dressed up as a mode.

## Scope

Failure modes come in two layers:

- **Layer 1: renderer-agnostic failure classes.** The symptom can show up on any renderer's output. As of v0.8.0, `placeholder-residue` is itself renderer-agnostic (scope `any`) and runs on every downstream-rendered HTML.
- **Layer 2: renderer-specific modes.** Scoped by renderer id:
  - **guizang**: applies to both Style A and Style B unless noted otherwise
  - **guizang-style-a**: Style A only
  - **guizang-style-b**: Style B only (Swiss-locked)
  - **frontend-slides**: English-renderer rules for overflow, contrast, hyphenation, font contracts, and image alt text
  - **beautiful-html-templates**: the same English-renderer rules, scoped to its native HTML decks
  - **ppt-master**: native PPTX/OOXML rules for package integrity, page count, editable objects, notes, AST drift, relationships, transitions, and native objects

## Layer 1: renderer-agnostic failure classes

| Failure class | What the audience sees | Implemented rules |
| --- | --- | --- |
| Template placeholder residue | Half-finished tokens like `[必填]`, `SLIDES_HERE`, lorem ipsum, TODO, TBD on a live slide | `placeholder-residue` (scope `any`, runs on every renderer) |
| Animation downgrade | The whole deck sits motionless; the delivery rhythm collapses | `low-power-default`, `data-anim-thin` |
| Layout contract breach | Page count or layout doesn't match the outline; content that should appear is missing | `swiss-sxx-count-mismatch`, `swiss-sxx-invented-id`, `swiss-low-diversity` |
| Missing background layer | The hero page background is blank; the page looks unfinished | `webgl-canvas-missing` |
| English renderer contract breach | English-native decks show horizontal scroll, weak contrast, noisy broken words, generic font fallback, or inaccessible images | `english-horizontal-overflow`, `english-low-contrast`, `english-hyphenation-noise`, `english-font-contract-missing`, `english-image-alt-missing` |
| Native PPTX contract breach | PowerPoint cannot open the deck, page count drifts, slides are flattened, notes/transitions/relationships are missing | `pptx-package-invalid`, `pptx-slide-count-mismatch`, `pptx-placeholder-residue`, `pptx-slide-empty`, `pptx-flattened-slide`, `pptx-missing-speaker-notes`, `pptx-speaker-intent-drift`, `pptx-ast-content-drift`, `pptx-broken-relationship`, `pptx-transition-missing`, `pptx-native-object-missing` |
| AI draft residue | Model scaffolding text like "As an AI" / "First I need to" leaks onto the slide | brief-mode check `visible_slide_text_has_no_ai_draft_markers` (`BANNED_VISIBLE_PATTERNS` in `write_qa`), run on the slide plan *before* rendering |

### Failure classes the static scan can't catch yet

Font-weight downgrade, viewport clipping caused by real browser layout, image/text misalignment, badges or decorative elements covering body copy — these are real rendering failures, but they need a real render to detect. Neither the HTML static scan nor PPTX OOXML inspection can see them today. HTML routes use downstream visual checklists and screenshot review; PPT Master uses its own `svg_quality_checker` and runs `visual-review` only when the user explicitly opts in.

The v0.9.1 English-renderer rules below intentionally cover the static subset Humanize can detect reliably: explicit horizontal overflow settings, obvious low-contrast hex pairs, forced hyphenation/noisy wrapping CSS, missing font contracts, and missing image alt text. They do not claim to replace screenshot review.

Real case: in the 2026-06-13 checkup of the English deck (`docs/showcase/hermes-agent-mastery/en/ppt/`), the static scan passed, while a per-page screenshot review found a page-number badge covering body text on 9 pages — the audience would read a broken fragment like "uires confirmation." Fix and re-check record: `docs/showcase/hermes-agent-mastery/en/qa/presentation-checkup-2026-06-13.md`. Screenshot review is half the checkup methodology and is not automated yet.

There is also a class where even the *page itself* is correct — what's wrong is **how you capture it**:

**WebGL hero cover not captured by a static screenshot → blank cover.** Guizang Style A covers paint their background with a WebGL hero canvas. The HTML is fully correct (`canvas#bg-dark`/`canvas#bg-light` both present, ample `data-anim`, `low-power` not active — every static check passes), but a PNG shot of it comes back blank: the canvas paints its first frame asynchronously *after* load, and the screenshot fires before that, capturing an uncolored canvas. The static rule `webgl-canvas-missing` checks "is the canvas in the HTML"; it cannot check "did the canvas paint, did the screenshot catch it." This is a **correct page + wrong capture = blank artifact** class, distinct from the "the page itself is broken" classes like text overflow, but it likewise needs a real render / screenshot review to surface.

Evidence: in the 2026-06 nine-style agent-cover experiment, the static screenshot of the Style A `ink-classic` cover was only 14KB and read as a blank page by eye (the Style B Swiss static cover screenshot in the same batch was fine). That batch of screenshots was therefore pulled rather than shipped (leave it empty before staging a fake).

Backstop rule (baked into the v0.9 style-gallery cover render commands; see `references/style-gallery-spec.md`): when capturing a WebGL hero page, treat the live `cover.html` as the source of truth and `cover.png` as a thumbnail only; wait for the canvas's first frame before screenshotting (delay ≥1.5s); a `cover.png` under 20KB is always a failed capture, not an empty cover — re-shoot or ship the live page only. This is not detectable today (Humanize does not read PNG bytes), so it is listed here, not packaged as a `FAILURE_MODES` mode.

## Mode catalog

Each mode gives four things: symptom, what the audience sees, detection (the rule function name in `scripts/humanize_ppt_v2.py`), and fix direction (what `fix_prompt.md` asks the downstream skill to do).

### `placeholder-residue` (all renderers)

**Symptom:** Template placeholders leaked into the rendered HTML. The downstream skill's own substitution pass didn't finish, or filler text was left in. As of v0.8.0 this rule is renderer-agnostic.

**What the audience sees:** Tokens like `[必填]`, `<!-- SLIDES_HERE -->`, lorem ipsum, TODO, TBD on a live slide. The audience knows instantly the page is unfinished.

**Detection:** `check_placeholder_residue`. `[必填]` or `SLIDES_HERE` in the rendered HTML → fail; lorem ipsum (case-insensitive), a standalone TODO, or TBD → fail.

**Fix direction:** Replace every `[必填]`, delete the `<!-- SLIDES_HERE -->` marker, swap lorem / TODO / TBD filler for finished content; the downstream skill must run its substitution pass to completion.

### `low-power-default` (guizang)

**Symptom:** `body.low-power` is active in the rendered HTML. It suppresses animation; it is meant to be a runtime opt-in power saver, not the default.

**What the audience sees:** The deck opens fully static — the intended entrance animations and rhythm are gone.

**Detection:** `check_low_power_default`. `low-power` in the `<body>` class list → fail.

**Fix direction:** Remove `low-power` from the body class; animation must play on first load.

### `webgl-canvas-missing` (guizang-style-a)

**Symptom:** The dual WebGL canvas (`canvas#bg-dark` and `canvas#bg-light`) is missing or only half present. Without it the hero background cannot render.

**What the audience sees:** The hero page background is blank or a dead block of color; the opening page looks half-built.

**Detection:** `check_webgl_canvas_missing`. Passes only if both `canvas#bg-dark` and `canvas#bg-light` are present.

**Fix direction:** Add both canvases back so the Style A WebGL hero background can render.

> Related but distinct: a present-and-correct canvas can still produce a *blank screenshot* if captured before it paints. That is a capture-time failure, not a static one — see [Failure classes the static scan can't catch yet](#failure-classes-the-static-scan-cant-catch-yet).

### `data-anim-thin` (guizang-style-a)

**Symptom:** `data-anim` / `data-animate` markers are too few to carry a watchable deck. The verified Ink Classic baseline has 86.

**What the audience sees:** Almost no element entrance animation between slides; the whole deck reads like a stack of static posters.

**Detection:** `check_data_anim_thin`. Fewer than 3 → hard fail; fewer than 10 → soft warn.

**Fix direction:** Add `data-anim` / `data-animate` markers on non-cover pages, targeting more than 10 (Ink Classic has 86).

### `swiss-sxx-count-mismatch` (guizang-style-b)

**Symptom:** The count of `data-layout="Sxx"` markers in the rendered HTML doesn't match the page count in `slide_plan.json`.

**What the audience sees:** Some outline pages didn't render, or pages appear that aren't in the outline; when you get to that page there's nothing on the projector to match.

**Detection:** `check_swiss_sxx_count_mismatch`. Sxx count ≠ page count → fail.

**Fix direction:** Make the `data-layout="Sxx"` count equal the page count in `slide_plan.json`, re-produced by the downstream skill.

### `swiss-sxx-invented-id` (guizang-style-b)

**Symptom:** A `data-layout="Sxx"` value is not in the registered set (`S01` through `S22`). The downstream skill invented a layout id instead of picking from the registered set in `references/layouts-swiss.md`.

**What the audience sees:** That page's layout isn't in the Swiss system and breaks from the deck's visual language; the audience can feel that the page is "off."

**Detection:** `check_swiss_sxx_invented_id`. Any Sxx value outside S01–S22 → fail.

**Fix direction:** Replace invented Sxx values with registered layout ids from S01 through S22.

### `swiss-low-diversity` (guizang-style-b, soft warn)

**Symptom:** Fewer than 6 distinct `Sxx` values in an 8-page deck (other lengths use 60% of the page count, rounded up, as the floor). The whole deck reads like one layout stamped n times.

**What the audience sees:** Every page looks nearly identical; after three pages the audience drifts, because the layout gives no signal that "this page differs from the last."

**Detection:** `check_swiss_low_diversity`. Fewer than 3 → hard fail; below the 60% floor → soft warn.

**Fix direction:** Diversify the Swiss layouts, ideally a different registered Sxx per page, with a 60% uniqueness floor.

### `english-horizontal-overflow` (frontend-slides, beautiful-html-templates)

**Symptom:** The rendered HTML opts into horizontal scrolling (`overflow-x:auto`, `scroll`, or `visible`) or sets viewport widths above `100vw`.

**What the audience sees:** A slide can drift sideways or clip long English technical terms, especially in browser presenter mode or during screenshot capture.

**Detection:** `check_english_horizontal_overflow`. CSS with `overflow-x:auto/scroll/visible` or `width` / `min-width` above `100vw` -> fail.

**Fix direction:** Keep horizontal overflow locked (`overflow-x:hidden`) and fit long terms through layout, font sizing, or safe wrapping rather than a wider canvas.

### `english-low-contrast` (frontend-slides, beautiful-html-templates)

**Symptom:** A CSS rule sets explicit foreground and background hex colors whose contrast ratio is below 3.0:1.

**What the audience sees:** English copy fades into the panel, especially on projectors or in recordings.

**Detection:** `check_english_low_contrast`. Static hex pairs in the same CSS rule are measured; ratio below 3.0:1 -> fail.

**Fix direction:** Increase text/background contrast, usually by darkening the background or using a stronger text token.

### `english-hyphenation-noise` (frontend-slides, beautiful-html-templates, soft warn)

**Symptom:** CSS enables forced visual breaking such as `hyphens:auto`, `word-break:break-all`, or `overflow-wrap:anywhere`.

**What the audience sees:** Technical English words split into noisy fragments and the slide looks machine-compressed.

**Detection:** `check_english_hyphenation_noise`. The noisy CSS declarations above -> warn.

**Fix direction:** Prefer manual line breaks, shorter copy, or `overflow-wrap:break-word` for rare long tokens.

### `english-font-contract-missing` (frontend-slides, beautiful-html-templates)

**Symptom:** The deck has no web font / `@font-face` source and no distinctive font-family contract.

**What the audience sees:** The deck falls back to generic system serif/sans, losing the native renderer's intended identity.

**Detection:** `check_english_font_contract_missing`. No `fonts.googleapis.com` / `@font-face` and no recognizable named deck font -> fail.

**Fix direction:** Add the renderer's intended web font or a documented local font stack with a distinctive primary family.

### `english-image-alt-missing` (frontend-slides, beautiful-html-templates)

**Symptom:** `<img>` tags are missing `alt` or have an empty `alt`.

**What the audience sees:** Visual assets become inaccessible to assistive tooling and harder to audit in generated decks.

**Detection:** `check_english_image_alt_missing`. Any image tag with missing or empty `alt` -> fail.

**Fix direction:** Add short, meaningful alt text for every image.

## PPT Master native PPTX modes

`scripts/pptx_qa.py` reads OOXML for these rules; `FAILURE_MODES` remains the authority for ids, scope, and default severity. Humanize writes reports and fix prompts but never edits the PPTX zip.

| ID | Audience/delivery symptom | Detection | Fix direction |
|---|---|---|---|
| `pptx-package-invalid` | PowerPoint cannot open the file or asks to repair it | ZIP CRC, required package parts, relationship parsing | Re-export from the owning PPT Master project; do not hand-patch OOXML |
| `pptx-slide-count-mismatch` | The talk has missing or extra pages | Ordered PPTX slide list vs `slide_plan.json` | Align the SVG roster/fill plan with Humanize and re-export |
| `pptx-placeholder-residue` | TODO/TBD/`[必填]` remains on a live slide | All slide `a:t` text | Remove residue in `svg_output/` or `fill_plan.json`, then re-export |
| `pptx-slide-empty` | The projector shows a page with no presentable text | No visible `a:t` text | Restore the page message as editable text |
| `pptx-flattened-slide` | The page is one flat picture instead of editable elements | No `p:sp`, `p:grpSp`, or `p:graphicFrame` | Re-run PPT Master's native DrawingML/template-fill route |
| `pptx-missing-speaker-notes` | Presenter View has no per-page script | Missing/meaningless notesSlide content | Map `speaker_intent.md` to `notes/total.md` or `slides[].notes` |
| `pptx-speaker-intent-drift` | Notes exist but no longer support the page intent | Weak lexical overlap with `speaker_intent`, warn | Restore the Humanize intent in PPT Master's note source |
| `pptx-ast-content-drift` | The page says something different from its AST contract | Weak overlap with title/message/visible content, warn | Restore the state transfer from `slide_plan.json` |
| `pptx-broken-relationship` | Images, notes, or charts disappear in PowerPoint | Internal slide relationship target missing/invalid | Let the PPT Master exporter rebuild the package |
| `pptx-transition-missing` | Requested native page transitions are absent | Missing `p:transition` | Re-export with the requested `-t` flag |
| `pptx-native-object-missing` | A requested editable table/chart is flattened or absent | Planned table page lacks table/chart `graphicData` | Add native markers and re-export with `--native-objects` |

Real verification: `docs/showcase/ppt-master-native/verification-2026-07-10.md`. A 10-slide native deck exported by PPT Master `b0beba5b` passed on round 1 with 0 failures / 1 warning, 10 notes slides, and 399 editable containers.

## English renderers: full support status

v0.9.1 verified state (matches `registry/renderer_registry.json`):

- `beautiful-html-templates` is marked `"support_level": "full"`: the brief exit works, the presentation checkup ran end to end on its real Neo-Grid deck (scan, screenshot finding, fix, re-check — per-round record in `docs/showcase/hermes-agent-mastery/en/qa/presentation-checkup-2026-06-13.md`), and it now has 5 English-renderer-specific static rules.
- `frontend-slides` is marked `"support_level": "full"`: the brief exit works, the presentation checkup ran end to end on the first real frontend-slides deck (`docs/showcase/v0.9-frontend-slides/ppt/index.html`), the negative-control scan proved the checkup is not a no-op, and it now has the same 5 English-renderer-specific static rules.

The renderer-specific rules stay conservative: they encode static checks Humanize can run deterministically, while screenshot review remains required for overlap, clipping, and presenter-view bugs that static HTML cannot prove.

## How the checkup uses this catalog

1. HTML uses `run_checks(html, plan, modes)`; PPTX uses `inspect_pptx(path, plan, ...)`. Both return `[{id, severity, pages, evidence}]`.
2. `_write_qa_report` produces the human-readable `qa_report.md`.
3. `_write_fix_prompt` produces the downstream-executable `fix_prompt.md` (e.g. "replace S04's `data-layout="S99"` with a registered Sxx layout").
4. The iteration tracker `qa_iteration.json` records the round, which findings the last round resolved, and which are still open.

The checkup is capped at `--max-qa-iterations` (default 3). If unresolved findings remain at the cap, `qa_status` becomes `needs-human` and is handed back to the next agent or a human to decide.
