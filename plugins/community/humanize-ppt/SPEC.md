# Humanize PPT — Technical Specification

> Authoritative technical reference for the engine. `SKILL.md` is the
> agent-facing trigger doc; `README.md` / `README.en.md` are the public intro.
> This file specifies *what the engine does and guarantees*. Code-side source
> of truth is `scripts/humanize_ppt_v2.py` (stable entrypoint:
> `scripts/humanize_ppt.py`).
>
> Version: 1.1 · License: MIT · Author: LearnPrompt

## 1. Purpose & boundary

Humanize PPT is a **presentation system** for agent-made HTML presentations and native editable PPTX — built **for the talk**, not just the template. It is broadly compatible with downstream renderers that consume plain markdown + JSON; verified outputs now include both HTML decks and PPT Master's native DrawingML PowerPoint.

Three core capabilities frame everything:

1. **Outline director** — turns raw material (markdown / text / research doc) into an AST outline (audience-state-transfer; every page turn moves the audience forward) and a per-page production brief. Old `.ppt`/`.pptx` files are not read directly — extract their text first (`scripts/pptx_qa.py`), then pass the text as `--source`; a rendered `.pptx` is consumed via `--qa-from`, not `--source`.
2. **Visual-enhancement director** — decides, per page, whether the page needs an image (preferred: `baoyu-image-gen` via the local Codex CLI, no API key; alt: imagegen / imagen / nanobanana-ppt), a deterministic inline SVG diagram, or a video (Remotion), and emits machine-actionable asset slots (`asset_path` + `prompt_hint`).
3. **Presentation checkup + presenter hand-off** — auto-catches "look-only" pages after render (§7) and feeds presenter-mode speaker notes (§1 boundary below).

The downstream template skill renders the beautiful deck; Humanize orchestrates the talk. The hard boundary (the division of labor), unchanged since v0.6.4:

- Humanize never opens a downstream renderer's template.
- Humanize never injects sections into rendered HTML/PPTX.
- Humanize never post-processes rendered HTML/PPTX.
- When a downstream skill updates, Humanize needs zero changes.

Humanize decides **what** and **where**; the downstream skill produces the file. Humanize's own HTML remains zero-dependency working drafts, not decks. PPT Master style selection is delegated to its mandatory native Confirm UI rather than duplicated in Humanize.

## 2. AST — Audience-State-Transfer

- **Audience**: who listens, what they know, what they resist.
- **State**: audience state before/after the deck, plus the blocking tension.
- **Transfer**: the slide-by-slide path from initial to desired state.

Core sentence: *PPT is not an information container; it is an audience state-transfer artifact.* The role arc is `hook → context → tension → method → proof → takeaway` (`ROLE_ARC`).

## 3. CLI surface

```
python3 scripts/humanize_ppt.py --out <dir> [mode flags] [inputs] [renderer/style]
```

### Inputs (one required for brief/outline/gallery modes)
- `--source <path>` — markdown / text raw material. Old `.ppt`/`.pptx` are rejected (fail closed): extract text first via `scripts/pptx_qa.py`, then pass that text. A rendered `.pptx` goes through `--qa-from`, not `--source`.
- `--research-md <path>` — pre-existing research doc (e.g. hv-analysis output). Takes priority over `--source`; the brief writer does not re-parse raw material.
- `--title <str>` — deck title (required for non-QA modes).

### Modes (checked in this order in `main()`)
1. `--qa-from <rendered.html|native.pptx>` → **presentation checkup** (§7). Mutually exclusive with `--source`.
2. `--style-gallery` (v0.9) → **cover-style gate** (§6). Wins over `--preview-outline`.
3. `--preview-outline` → write `outline-preview.md` and stop (review checkpoint).
4. `--confirm-outline` → validate freshness, write `preview-confirmed.json`. Refuses if the outline is missing or the source mtime is newer. Mutually exclusive with `--preview-outline`.
5. (no mode flag) → **brief mode**: write the full output contract (§5) and the renderer's production prompt. Wipes and recreates `--out` first, but only when it is missing, empty, or already a Humanize PPT run (`run_manifest.json` / `style_gallery_plan.json` / `outline-preview.md` / `preview-confirmed.json` at its root) — otherwise refuses unless `--force` is passed.

### Renderer / style selection
- `--renderer {auto,guizang,beautiful-html-templates,html-ppt,frontend-slides,ppt-master}` (default `auto`). `ppt-master` is explicit unless `--ppt-master-template` forces it.
- `--guizang-style {A,B}` — A = flexible (5 themes), B = Swiss-locked (4 accents). A requires `--guizang-theme {ink-classic,indigo-porcelain,forest-ink,kraft-paper,dune}`; B requires `--guizang-accent {ikb,lemon-yellow,lemon-green,safety-orange}`.
- `--selected-template <slug>`, `--occasion`, `--mood`, `--preview-count` — beautiful-html-templates selection hints.
- `--gallery-count N` (v0.9) — style-gallery candidate count, minimum and default 4, capped at the candidates defined for the renderer.
- `--ppt-master-template <raw.pptx>` — forces PPT Master's native `template-fill-pptx` route.
- `--ppt-master-repo`, `--ppt-master-python` (verified Python ≥3.10), `--ppt-master-format`, `--ppt-master-project-name`, `--ppt-master-visual-style` — downstream runtime/location/project/confirmation recommendations.
- `--ppt-master-native-objects`, `--ppt-master-transition`, `--ppt-master-animation`, `--ppt-master-animation-trigger`, `--ppt-master-visual-review` — native export and explicit visual-review settings. On raw-template fill, only page transitions are written; existing native objects/animations are preserved and image replacement or new object animation is reported as a template-fill v1 boundary.

### Adapters & flags
`--presenter-adapter`, `--export-adapter`, `--presenter`, `--no-render`, `--skip-install-check`, `--max-qa-iterations N` (default 3), `--beautiful-repo`, `--no-beautiful-auto-clone`, `--force` (brief mode only — wipe a non-empty `--out` that is not already a Humanize PPT run).

## 4. Data flow

```
raw material
   │  read_source → detect_language → build_slide_plan (per-role + decide_media)
   ▼
slide_plan.json  ──(--style-gallery)──▶  ≥4 cover-only render commands + style_gallery.html picker  ──pick──┐
   │                                                                                                         │
   │  (--preview-outline) ──▶ outline-preview.md ──(--confirm-outline)──▶ preview-confirmed.json             │ reinjection_command
   ▼                                                                                                         ▼
brief mode: deck_brief / ast_outline / slide_plan / speaker_intent / asset_manifest / video_slots / style_brief
   │  + <renderer>-production-prompt.md (per-page media block + media production guidance)
   ▼
downstream skill renders natively  ──▶  rendered HTML or native PPTX
   │
   ▼
--qa-from <rendered.html|native.pptx>  ──▶  presentation checkup (≤3 rounds): qa_report.md / fix_prompt.md / qa_iteration.json
```

The brief is plain markdown + JSON. Verified recommendations: zh HTML → `guizang-ppt-skill`; en HTML → `frontend-slides` / `beautiful-html-templates`; native editable PowerPoint → `ppt-master`.

## 5. Output contract (brief mode)

Every brief run writes, into `--out`:

1. `deck_brief.md` — audience, goal, tension, success criteria.
2. `ast_outline.md` — AST map and narrative arc.
3. `slide_plan.json` — per-slide plan; schema `contracts/slide-plan.schema.json`.
4. `speaker_intent.md` — per-slide speaker action (downstream's source for native speaker notes).
5. `asset_manifest.md` — per-page material decisions.
6. `video_slots.json` — optional Remotion / HyperFrames insertion plan.
7. `style_brief.md` — visual principle for downstream production.
8. `renderer_registry.json` — renderer capability snapshot for this run.
9. `router_plan.json` — selected primary renderer + staged routes.
10. `commands/*.md` — bounded instructions per downstream specialist.
11. `<renderer>-production-prompt.md` — the brief the next agent consumes.
12. `run_manifest.json`, `outputs/qa/qa_report.md`, `outputs/qa/fix_list.md`.

PPT Master additionally writes `ppt-master-source.md` and disposable `outputs/ppt-master-handoff/` copies. The former freezes Humanize's semantic page contract; the latter lets PPT Master's main route obey its `import-sources --move` rule without moving the user's original file.

## 6. Style gallery (v0.9) — the cover-style gate

`--style-gallery` precedes the outline: it lets the human compare ≥4 covers side by side before committing to a style. Humanize emits the spec; the downstream skill renders the covers.

For the resolved renderer it takes the first `N` of `STYLE_GALLERY_CANDIDATES[renderer]` (guizang spans Style A themes + a Style B Swiss accent so the four covers are visually distinct) and writes:

- `commands/style-gallery/<id>.md` — a **cover-only** render command: render only S01 in that style → `outputs/style-gallery/<id>/cover.{html,png}`. Not a full deck.
- `style_gallery.html` — zero-dependency single-file picker stitching the covers via relative-path `<iframe>`s, each with its label, description, and re-injection command. A not-yet-rendered cover shows the frame backdrop plus an always-visible caption — no faked thumbnail.
- `style_gallery_plan.json` — per-candidate `id`, `label`, `description`, `cli`, `command_file`, `cover_html`, `cover_png`, `reinjection_command`.

After picking, the human runs the candidate's `reinjection_command`, which carries `--renderer` + style args into the normal outline → brief flow. Spec: `references/style-gallery-spec.md`.

PPT Master exception: `--renderer ppt-master --style-gallery` writes `style_gallery_plan.json` with `mode: downstream-confirm-ui` and `commands/style-gallery/ppt-master-confirm-ui.md`. It does not emit fake cover artifacts because PPT Master's mandatory Stage 1 already owns the visual-style catalog and native preview SVGs.

**WebGL static-screenshot trap**: Style A covers use a WebGL hero canvas whose PNG can capture blank (canvas paints after load). Each Style A cover command warns to treat `cover.html` as truth, delay screenshots ≥1.5s, and treat a `cover.png` under 20KB as a failed capture. See §7 and `references/qa-failure-modes.md`.

## 7. Presentation checkup (`--qa-from`)

Per-page review of rendered HTML or native PPTX against the outline — grades the outline, not beauty. Capped at `--max-qa-iterations` (default 3); unresolved findings at the cap flip `qa_status` to `needs-human`.

- `FAILURE_MODES` (in `humanize_ppt_v2.py`) is the code-side source of truth; the human-readable catalog is `references/qa-failure-modes.md` (+ English mirror `references/qa-failure-modes.en.md`), matched by id.
- Each round: `run_checks` → findings `[{id, severity, pages, evidence}]` → `qa_report.md` (human) + `fix_prompt.md` (downstream-actionable) + `qa_iteration.json` (round state).
- PPTX dispatch uses `scripts/pptx_qa.py::inspect_pptx`: OOXML package integrity, page count, placeholder residue, editable shapes, speaker notes, AST/notes drift, relationships, transitions, and requested native table/chart objects.
- Failure classes the static scan can't catch (text overflow, badge occlusion, the WebGL static-screenshot trap) are listed but not packaged as `FAILURE_MODES` rules — catalog discipline: only rules that exist in code.

## 8. Per-page media model

`build_slide_plan` calls `decide_media(role, title, message, visible_content, slide_id)`, which applies `ROLE_MEDIA_POLICY` per role and produces, for each of `image` / `diagram` / `video`:

- `needed` (bool), `kind` (e.g. `gpt-photo`, `screenshot`, `svg-html`, `remotion-clip`), and for `video` a `duration_s`.
- v0.6.7 machine-actionable fields: `asset_path` (where to write), `prompt_hint` (what to generate), plus `aspect_ratio` / `max_size_kb` for images.

A media slot **with** `asset_path` is an executable task; **without** one it is a label only. The three brief writers share `_format_per_page_media_block` (surfaces the slots) and `_media_production_guidance` (maps each `kind` to a concrete, hot-pluggable generator skill). Schema: `contracts/slide-plan.schema.json`.

## 9. Renderer registry

`registry/renderer_registry.json` snapshots renderer capability. `support_level` values, updated only on real results (宁空不摆拍):

- `guizang` → `full`
- `beautiful-html-templates` → `full` (brief exit + real Neo-Grid checkup + 5 English-specific modes)
- `frontend-slides` → `full` (brief exit + real frontend-slides checkup + the same 5 English-specific modes)
- `ppt-master` → `full` (main + raw template-fill real routes, 11 PPTX-specific modes, real 10-page main export and 5-page template-fill export/checkup on 2026-07-10)

## 10. Versioning & tests

- `VERSION` in `humanize_ppt_v2.py`. Version history under `docs/versions/`.
- Tests in `tests/` (pytest); run `python3 -m pytest -q`. v0.9 adds `tests/test_v090_style_gallery.py`.
- The Luban discipline for this project: 验料 (confirm baseline green) → 访行 (read the existing flow) → 过尺 (run pytest) → 慢刨 (implement) → 回炉 (registry / SKILL.md / version / marketplace). Release actions (push / tag / marketplace bump) are gated on human review.
