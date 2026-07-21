# v0.9 Spec: `--style-gallery` Flag (the cover-style gate)

Date: 2026-06-17
Status: Implemented in v0.9 (`feat/v0.9-next`).

v1.1 renderer exception: PPT Master already owns a mandatory three-stage Confirm UI with native `visual_style` preview SVGs. `--renderer ppt-master --style-gallery` therefore delegates to that surface; it does not create four speculative PPT Master projects.

## Motivation

Humanize PPT is *for the presentation* and *compatible with downstream HTML PPT renderers* — and it **never renders**. By v0.8 the flow was: AST slice → (optional `--preview-outline` review) → production brief → downstream renders. The human picks the renderer and (for guizang) a single style/theme up front, blind. They commit to one look before seeing a single pixel.

The 9-style showcase on "10 分钟入门 Agent 7 概念" showed the cost: people want to *see covers side by side* before committing. One static thumbnail per style is the cheapest possible preview — a cover is the highest-signal page, and rendering one page is cheap for the downstream skill.

The architecture decision (拍板): **the gallery shows ≥4 covers that the downstream skill really renders.** Humanize stays in its lane — it emits the spec and the commands; it does not render the covers itself.

## Design

### New flags

```
--style-gallery            (boolean, default off) — the gate before the outline.
--gallery-count N          (int, default 4, minimum 4) — capped at the candidates defined for the renderer.
```

`--style-gallery` is checked **before** `--preview-outline` in `main()`: you pick a style, *then* preview the outline. Passing both stops at the gallery.

### What it writes (then stops)

For the resolved primary renderer (`choose_routes`), Humanize takes the first
`N` candidates from `STYLE_GALLERY_CANDIDATES[renderer]` and writes:

1. `commands/style-gallery/<id>.md` — a **cover-only** render command per
   candidate. It tells the downstream skill to render **only S01** in that
   style and write `outputs/style-gallery/<id>/cover.{html,png}`. Not a full deck.
2. `style_gallery.html` — a **zero-dependency single-file** picker that stitches
   the candidate covers (relative-path `<iframe>`s) with each candidate's label,
   description, and the exact re-injection command. Honest about pending state:
   a not-yet-rendered cover shows the frame backdrop plus an always-visible
   caption — no faked thumbnail (宁空不摆拍).
3. `style_gallery_plan.json` — machine-readable: per-candidate `id`, `label`,
   `description`, `cli`, `command_file`, `cover_html`, `cover_png`,
   `reinjection_command`.

Then it prints `{"ok": true, "stopped_at": "style-gallery", ...}` and returns 0.
No outline, no brief, no QA.

For `ppt-master`, the renderer-native branch writes instead:

1. `commands/style-gallery/ppt-master-confirm-ui.md` — re-injection command plus the instruction to use PPT Master's Stage 1 direction page.
2. `style_gallery_plan.json` with `mode: downstream-confirm-ui`, `picker: null`, and `candidate_source` pointing to PPT Master's own visual-style catalog.

It returns `stopped_at: ppt-master-style-gate`. No fake `style_gallery.html`, cover image, or candidate deck is emitted.

### The candidates

Module-level `STYLE_GALLERY_CANDIDATES`, keyed by renderer, ≥4 each:

- **guizang** — spans both tracks so the four covers are visually distinct:
  Style A `ink-classic` (the known-good baseline), Style A `kraft-paper`,
  Style A `indigo-porcelain`, Style B Swiss `ikb`.
- **frontend-slides** — 4 style directions (editorial-serif, techno-grid,
  soft-gradient, mono-contrast).
- **beautiful-html-templates** — 4 template slots filled from the skill's
  native template library (placeholder slugs; downstream picks real templates).

Each candidate carries `cli`: the exact renderer/style args grafted onto the
next run. After picking a cover, the human runs the printed
`reinjection_command`, which resumes the normal outline → brief flow with the
chosen style. (Append `--preview-outline` for the review checkpoint.)

### WebGL static-screenshot trap (ties to QA failure modes)

Guizang Style A covers use a WebGL hero canvas. A static PNG screenshot
captures the canvas **before it paints → blank cover** (实证: a Style A
`ink-classic` cover PNG came back 14KB, an empty page). So each Style A
candidate command warns:

- treat `cover.html` (the live page) as the source of truth; `cover.png` is a
  thumbnail only,
- wait for the canvas's first frame before screenshotting (delay ≥1.5s),
- a `cover.png` under 20KB is a failed capture, not an empty cover.

The picker footer repeats this so a blank frame is read correctly.

## Boundary (unchanged)

Humanize decides *what* (which candidate styles) and *where* (the output
paths). The downstream skill produces the cover files. Humanize never opens a
renderer template and never post-processes rendered HTML. The picker is a
Humanize-owned working draft (like `preview_outline_html.py`), not a deck.

## Reuse

`run_style_gallery_mode` reuses `read_source` / `detect_language` /
`build_slide_plan` / `choose_routes` / `now_iso` — the same primitives as the
brief and preview-outline modes. No new parsing path.
