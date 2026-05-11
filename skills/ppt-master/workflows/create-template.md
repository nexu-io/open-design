---
description: Generate a new PPT layout template based on existing project files or reference templates
---

# Create New Template Workflow

> **Role invoked**: [Template_Designer](../references/template-designer.md)

Generate a complete set of reusable PPT layout templates for the **global template library**.

> This workflow is for **library asset creation**, not project-level one-off customization. The output must be reusable by future PPT projects and discoverable from `templates/layouts/layouts_index.json`.

## Process Overview

```
Reference Intake & Analysis -> Fact-Based Brief Proposal -> User Confirmation Gate -> Create Directory + Invoke Template_Designer -> Validate Assets -> Register Index -> Output
```

The first three steps derive the brief from facts, not guesses. **No final template directory may be created and no template SVG / `design_spec.md` may be written until `[TEMPLATE_BRIEF_CONFIRMED]` is emitted in Step 3.** Reference-analysis intermediates produced by `pptx_template_import.py` (typically under `/tmp/pptx_template_import/`) are explicitly **not** subject to this gate — they are temporary workspaces feeding Step 2.

---

## Step 1: Reference Intake & Analysis

Branch by the type of reference source the user supplied. This step produces analysis artefacts only — it does **not** create the final template directory, write `design_spec.md`, or touch `layouts_index.json`.

### Input source taxonomy

| Type | What the user supplied | Tool / read path | Replication modes available |
|------|-------------------------|------------------|------------------------------|
| **A** `.pptx` reference | A `.pptx` file path | `pptx_template_import.py` → `manifest.json` + `svg/master_*.svg` + `svg/layout_*.svg` + `svg/slide_*.svg` + `svg-flat/slide_*.svg` + `assets/` | `standard` / `fidelity` / `mirror` |
| **B** Existing SVG assets | `projects/<x>/svg_output/`, `templates/layouts/<existing>`, or a loose `.svg` folder | `ls` + `Read` each `*.svg`; plus `design_spec.md` / `spec_lock.md` if present | `standard` / `fidelity` (AI visual clustering) / `mirror` (direct 1:1 copy) |
| **C** Image / visual references | Screenshot folder, single image, PDF pages | `ls` + `Read` each file (multimodal visual recognition) | `standard` only |
| **D** No reference source | Verbal description only ("McKinsey style", "tech blue", "dark minimal") | — | `standard` only |

`fidelity` and `mirror` are not available for type C / D — visual references and verbal-only briefs cannot drive page-by-page replication. Type A is the canonical path: `manifest.json` page-type candidates and the layered `svg/` workspace anchor cluster detection (fidelity) and verbatim copy (mirror) with factual data. Type B is supported with caveats:

- **mirror on type B** — direct 1:1 copy. B's SVGs are already self-contained (one file per page, equivalent to `svg-flat/slide_*.svg`). Page-type for the `<NNN>_<page_type>.svg` filename is read from the source filename when it follows the PPT Master naming convention (`01_cover.svg` → `cover`, `03a_content_two_col.svg` → `content`); fall back to `content` otherwise. Particularly natural when the source is `templates/layouts/<existing>` and the user wants to fork an existing template.
- **fidelity on type B** — clustering relies on the AI's visual judgement of the SVGs; there is no `manifest.json.pageTypeCandidates` to anchor it. Variant count and grouping are more subjective and may need iteration. If the input is already a PPT Master template (`templates/layouts/<existing>`), parse the existing variant filenames (`03a_content_two_col` etc.) as authoritative cluster hints rather than re-clustering visually.

### 1A. `.pptx` reference

Run the unified preparation helper:

```bash
python3 skills/ppt-master/scripts/pptx_template_import.py "<reference_template.pptx>"
```

This produces, in one workspace:

- `manifest.json` — single source of truth: slide size, theme colors, fonts, per-master theme summaries, asset inventory, placeholder metadata, SVG file paths, per-slide / per-layout / per-master metadata, page-type candidates
- `summary.md` — short human-readable digest derived from manifest.json (for quick scanning only)
- `assets/` — extracted reusable image assets; `manifest.json` owns the asset-name mapping and SVG `href` values reuse that mapping
- `svg/` — **primary view** (layered template view):
  - `svg/master_*.svg` — every slide master in the deck rendered once, including masters that no sample slide currently uses (template packages routinely ship more masters than the visible samples reference)
  - `svg/layout_*.svg` — every slide layout in the deck rendered once (its own contribution; master shapes do **not** repeat here)
  - `svg/slide_NN.svg` — each slide's own shapes and slide-local background; master / layout shapes and backgrounds are **not** inlined here
  - `svg/inheritance.json` — which layout & master each slide consumes
- `svg-flat/` — **companion view** (one self-contained SVG per slide):
  - `svg-flat/slide_NN.svg` — master + layout + slide painted into a single SVG so opening any slide on its own shows the full page like PowerPoint would. Use this for previews / screenshot pipelines / "what does the slide actually look like" sanity checks.
- The default `--inheritance-mode both` emits both views. Pass `layered` to skip `svg-flat/`, or `flat` for round-trip use cases (legacy: `svg/` becomes self-contained slides without the master/layout/inheritance files).

Import fidelity rules:

- Placeholder metadata is recorded in `manifest.json`; master / layout SVGs show lightweight dashed guides with labels only in `svg/`, not in `svg-flat/`.
- Charts, SmartArt, diagrams, and OLE objects are typed placeholders in `svg/`. In `svg-flat/`, they use a preview image with a small badge when one exists; otherwise they stay visible as placeholders. Tables are converted to real SVG.
- Missing media and external linked images fail the import. EMF / WMF Office vector media are converted to PNG previews when supported by the local toolchain; otherwise the import fails.

It is a reconstruction aid, not a final direct template conversion.

**Read order during analysis** (read everything below before composing Step 2):

1. `manifest.json` (factual metadata: slide size, theme, assets, layouts, masters, slide page-types)
2. `svg/master_*.svg` and `svg/layout_*.svg` — read these **before** any slide SVG; they show the deck's shared visual language (background, headers, footers, decorative bars). This is what the new template's fixed structure should adapt from.
3. `svg/inheritance.json` — confirms which slide uses which layout/master
4. exported `assets/`
5. cleaned slide SVG references `svg/slide_NN.svg` — content unique to each slide; consult after the master/layout language is understood
6. `summary.md` only as a quick orientation aid
7. user-provided screenshots or the original PPTX only for visual cross-checking

Interpretation rule (carries forward into Steps 2 and 4):

- `manifest.json` is the source of truth for slide size, theme colors, fonts, background inheritance, reusable asset inventory, unique layout/master structure, and slide reuse relationships
- `summary.md` is a quick scan; never treat it as the canonical fact source — go back to `manifest.json` if anything is unclear
- exported `assets/` are the canonical reusable image pool — `<image>` references in `svg/` already point at these files directly
- `svg/master_*.svg` / `svg/layout_*.svg` are the **primary source for fixed structural design** — recurring backgrounds, page chrome, decorative motifs that the template should preserve. The new template's `01_cover` / `02_chapter` / `03_content` / `04_ending` typically inherit elements from these layers.
- `svg/slide_NN.svg` shows page-specific content — useful for judging composition rhythm and content density, not for fixed structure. Read every slide regardless of count.
- `svg-flat/slide_NN.svg` is for human preview and screenshot comparison; do not treat duplicated master/layout chrome inside flat slides as separate reusable template structure.
- screenshots remain useful for judging composition and style, but should not override extracted factual metadata unless the import result is clearly incomplete

**Hard read gate** (`standard` / `fidelity` modes — `mirror` differs, see below):

- The agent MUST finish reading every `svg/master_*.svg`, `svg/layout_*.svg`, and `svg/slide_*.svg` file under `<import_workspace>/svg/` before moving on to Step 2
- The agent MUST list the read master / layout / slide filenames inside the Step 2 brief proposal as proof of the gate

Do **not** treat the imported PPTX or exported slide SVGs as direct final template assets — Step 4 reconstructs them as a clean, maintainable PPT Master template package, not a 1:1 shape translation.

> **Mirror-mode fast path** — when the user has indicated mirror replication (verbatim copy of every source slide):
> - Read **only** `svg-flat/slide_*.svg` (the self-contained, what-PowerPoint-shows view) and `manifest.json` (for theme colors, fonts, asset inventory).
> - Skip `svg/master_*.svg` / `svg/layout_*.svg` / `svg/inheritance.json` — chrome / content separation is irrelevant in mirror mode (no placeholder insertion happens).
> - Mirror is explicitly a verbatim copy flow — every slide becomes a template page as-is. The "reconstruct, don't translate" rule applies to `standard` / `fidelity` only.

### 1B. Existing SVG assets

`ls` the directory and `Read` every `*.svg` to extract:

- canvas size (`viewBox` on the root `<svg>`)
- recurring colors (`fill` / `stroke` values; identify the dominant 2–4 hex codes as candidate theme colors)
- fonts (`font-family` attributes on `<text>`)
- placeholder usage (existing `{{...}}` strings, if any)
- structural decoration (recurring `<rect>` bars, `<path>` motifs, embedded `<image>` references)

If a `design_spec.md` or `spec_lock.md` accompanies the SVGs, `Read` it too — it is a higher-confidence source than re-deriving from the SVG alone. Record the equivalent of a `manifest.json`'s factual fields in your own analysis notes (no actual file written) so Step 2 can label them `[fact]`.

### 1C. Image / visual references

`ls` the folder (or single file) and `Read` each image / PDF page. Extract what's visible:

- rough theme colors (eyeball the dominant 2–4 hues; do NOT report exact HEX as fact)
- page count (count the supplied images as an approximate slide count)
- dominant typography style (sans / serif / display) — never report a font name
- decorative motifs and composition rhythm

Be explicit in Step 2 that exact HEX values, font names, and placeholder structure are **estimates from visual inspection** (`[suggested]`), never `[fact]`.

### 1D. No reference source

Skip the analysis. Step 2 will list every Required item as `[decision]`; nothing is fact-derivable from a non-existent source.

---

## Step 2: Fact-Based Brief Proposal

Compose a single message that surfaces every Required brief item to the user, **labelling each value's provenance**:

- **`[fact]`** — extracted from Step 1 analysis (e.g. theme color from `manifest.json`)
- **`[suggested]`** — AI-inferred from analysis or context (e.g. tone summary, applicable scenarios; visually estimated values from type C)
- **`[decision]`** — pure user choice, no analysis substitute (e.g. `template_id`, `replication mode`, `category`)

Items to surface:

| Item | Required | Provenance by input type |
|------|----------|--------------------------|
| New template ID | Yes | `[decision]` — user chooses ASCII slug; if Chinese brand name, must be filesystem-safe and match `layouts_index.json` exactly |
| Template display name | Yes | `[decision]` (often the source deck title — `[suggested]` from `summary.md` for type A) |
| Category | Yes | `[decision]` — one of `brand` / `general` / `scenario` / `government` / `special` |
| Applicable scenarios | Yes | `[suggested]` from analysis; user confirms |
| Tone summary | Yes | `[suggested]` from analysis (e.g. `Modern, restrained, data-driven`) |
| Theme mode | Yes | A: `[fact]` from `manifest.json` background colors. B: `[fact]` from SVG `fill`. C: `[suggested]` from visual estimate. D: `[decision]` |
| Canvas format | Yes | A/B: `[fact]` from slide size or SVG `viewBox`. C: `[suggested]` from image aspect ratio. D: `[decision]`, default `ppt169` |
| Replication mode | Yes | `[decision]` — `standard` always available; `fidelity` and `mirror` available for type A (canonical, manifest-anchored) and type B (AI visual clustering / direct 1:1 copy — see Step 1 caveats); reject `fidelity` / `mirror` upfront for type C / D |
| Visual fidelity for fixed pages | Yes for `standard` / `fidelity` when reference exists; **N/A for `mirror`** (mirror is implicitly literal) | `[decision]` — `literal` (preserve original geometry / decoration / sprite crops as-is; for cover / chapter / ending especially) or `adapted` (use the reference for tone/structure but allow design evolution). Different page types may take different settings |
| Reference source | Optional | already known if Step 1 ran |
| Theme color | Optional | A: `[fact]` from theme XML. B: `[fact]` from dominant SVG `fill`. C: `[suggested]` from visual estimate (HEX is approximate). D: `[decision]` |
| Fonts | Optional | A: `[fact]` from `manifest.json`. B: `[fact]` from SVG `font-family`. C / D: not derivable — `[decision]` if user wants a custom stack |
| Design style | Optional | `[suggested]` from analysis |
| Assets list | Optional | A: `[fact]` from `assets/` listing; user picks which to bundle. B / C: `[decision]` per file. D: none |
| Keywords | Yes | `[suggested]` from analysis (3–5 short tags); user confirms |

For type A, also include in this message:

- the exact `svg/master_*.svg`, `svg/layout_*.svg`, `svg/slide_*.svg` filenames you read (proof of the hard read gate)
- a one-line summary of the master / layout structure you extracted

The user replies with corrections, additions, or "all good".

> **Persist the brief into `design_spec.md`**. When the Template_Designer writes `design_spec.md` in Step 4, declare a YAML frontmatter block at the top with the confirmed brief (`template_id`, `category`, `summary`, `keywords`, `primary_color`, `canvas_format`, `replication_mode`, etc.). `register_template.py` reads this in Step 6, so the brief flows directly into the index without the AI re-deriving it from prose. See Step 6 for the recommended frontmatter shape.

---

## Step 3: User Confirmation Gate

**MANDATORY interactive gate — this step BLOCKS Steps 4 onward.**

1. Echo back the finalized brief (post-corrections) in a single message
2. Emit the marker `[TEMPLATE_BRIEF_CONFIRMED]` on its own line

Skipping this gate — including silently inferring values from the reference source, opened IDE file, or prior conversation — is a workflow violation. Even if the user said "用这个 .pptx 做模板" upfront, you MUST still surface Step 2 with provenance labels and obtain explicit confirmation here. The reference source informs the brief; it does not substitute for it.

**Required outcome of Step 3** (all must be true before emitting `[TEMPLATE_BRIEF_CONFIRMED]`):

- [ ] User has been shown every Required item in Step 2 with provenance labels
- [ ] User has replied with values or explicit acceptance of suggested defaults
- [ ] The template is clearly positioned as a **global library template**
- [ ] The canvas format is fixed before SVG generation
- [ ] Replication mode is consistent with the input type (`fidelity` / `mirror` allowed for A and B with B's caveats noted; forbidden for C / D)
- [ ] The template metadata is complete enough to register into `layouts_index.json`
- [ ] Marker `[TEMPLATE_BRIEF_CONFIRMED]` emitted on its own line after the echoed brief

Step 4 MUST NOT run until `[TEMPLATE_BRIEF_CONFIRMED]` has been emitted in the current conversation.

---

## Step 4: Create Template Directory + Invoke Template_Designer

> **Precondition**: `[TEMPLATE_BRIEF_CONFIRMED]` was emitted in Step 3. If not, return to Step 3.

Create the final template directory:

```bash
mkdir -p "skills/ppt-master/templates/layouts/<template_id>"
```

> **Output location**: Global templates go to `skills/ppt-master/templates/layouts/`; project templates go to `projects/<project>/templates/`
>
> The generated directory name must match the final template ID used in `layouts_index.json`.

**Switch to the Template_Designer role** and generate per role definition. The role input is the finalized brief from Step 3 plus the analysis bundle from Step 1.

If the input source is type A, pass the following internal package to the role:

- finalized brief from Step 3
- `manifest.json`
- `summary.md` (orientation only)
- exported `assets/`
- cleaned slide SVG references from `svg/`
- optional screenshots, if available

For type B, pass the SVG file list, any companion `design_spec.md` / `spec_lock.md`, and the analysis notes.
For type C, pass the image file list and the visual analysis notes.
For type D, pass only the finalized brief.

The role uses the analysis bundle to anchor objective facts such as theme colors, fonts, reusable backgrounds, and common branding assets, then rebuilds the final SVG templates in a simplified, maintainable form.

**Apply the visual-fidelity decision from Step 3**: pages marked `literal` (typically cover / chapter / ending) must reproduce the reference's geometry, decoration, and sprite-sheet crops as-is — "simplified, maintainable form" applies only to genuinely redundant structure, not to load-bearing layout. Pages marked `adapted` may use the reference for tone and structural rhythm but evolve the design.

**Sprite-sheet preservation (do NOT simplify away)**: PPTX-exported assets are often sprite sheets — a single tall/large image referenced from multiple slides, each cropping a different region via nested `<svg ... viewBox="...">` wrappers around `<image width="1" height="1">`. This nesting is **load-bearing geometry**, not redundant structure. When rebuilding, preserve the exact `viewBox` crop and the outer `<svg>` placement for every image; do not flatten to a single `<image>` with direct `x/y/width/height`. Verify by sampling: if any asset's pixel dimensions don't match the on-page display aspect, it is a sprite and the wrapper must stay.

**Mirror-mode override** (type A or B): when `Replication mode: mirror`, this step is a **verbatim copy** rather than a reconstruction. The Template_Designer role:

1. **Copies the source pages** into the template directory **without any modification** — no placeholder insertion, no decorative simplification, no chrome/content reorganization. The SVG that ships in the template is byte-for-byte the source page (modulo filename change and asset path rewrites).
   - Type A: source is `<import_workspace>/svg-flat/slide_NN.svg`
   - Type B: source is each `*.svg` in the input directory (already self-contained)
2. **Renames each file** using the source-order-first convention `<NNN>_<page_type>.svg`, where `<NNN>` is the source-order index zero-padded to 3 digits and `<page_type>` is typically `cover` / `toc` / `chapter` / `content` / `ending` (fall back to `content` when the type cannot be confidently classified). Examples: `001_cover.svg`, `002_toc.svg`, `003_content.svg`, ..., `050_ending.svg`.
   - Type A: derive `<page_type>` from `manifest.json.pageTypeCandidates`
   - Type B: derive `<page_type>` from the source filename when it follows the PPT Master convention (`01_cover.svg` → `cover`, `03a_content_two_col.svg` → `content`); otherwise infer from page content or fall back to `content`
3. **Copies bundled assets** into the template directory and rewrites the `<image href="...">` paths inside each copied SVG to point at the local copies. Asset filenames may be renamed to semantic names (`brand_emblem.png` instead of `image3.png`) when it improves readability — but the rewrite must be consistent across every page.
   - Type A: assets come from `<import_workspace>/assets/`
   - Type B: resolve relative paths in source `<image href="...">` against the source SVG location and copy each unique asset; if the source already follows PPT Master conventions (assets co-located with SVGs in the same directory), copy the whole asset set and then rewrite paths
4. Writes `design_spec.md` per [template-designer.md](../references/template-designer.md) §1 — the **§V Page Roster description per page is the load-bearing artifact** because mirror has no placeholders to advertise the per-page contract; downstream Strategist selects pages purely from these descriptions.

Mirror mode does **not** invoke the "reconstruct into clean SVG" pathway. The sprite-sheet preservation rule still applies (because the flat SVGs already contain the original sprite wrappers — do not flatten them when copying).

**Expected outputs from this step** (full spec → [template-designer.md](../references/template-designer.md)):

1. `design_spec.md` — **personality only**. Required sections: Template Overview, Color Scheme, Signature Design Elements, Page Roster (matching the actual SVG files on disk). Skip Typography / Assets / Placeholder Overrides when they would just restate defaults. Declare brief frontmatter for `register_template.py`. **Do not** restate generic SVG constraints, layout pattern libraries, font-size ratio bands, the canonical placeholder table, or content methodology — those are sourced from `shared-standards.md` / `design_spec_reference.md` / `strategist.md` and are already in the downstream reader's context. Full scope rule and skeleton: [template-designer.md §1](../references/template-designer.md#1-must-generate-design_specmd).
2. Page roster — see [Page Roster](../references/template-designer.md#page-roster) for `standard` / `fidelity` / `mirror` mode rosters, variant naming, and TOC handling
3. Placeholder vocabulary — pages should adopt the conventional names (`{{TITLE}}`, `{{CONTENT_AREA}}`, ...) when they fit. Full reference: [Placeholder Reference](../references/template-designer.md#4-placeholder-reference-canonical-convention-overridable-per-template). When a template style legitimately needs different vocabulary (consulting → `{{KEY_MESSAGE}}`, branded cover → `{{BRAND_LOGO}}`), declare a `placeholders:` block in `design_spec.md` frontmatter so the registrar and quality checker treat it as the template's authoritative contract. **Avoid** one-off indexed families such as `{{CHAPTER_01_TITLE}}` — use the indexed TOC pattern instead.
4. Template assets (optional) — Logos / PNG / JPG / reference SVG bundled with the template package

---

## Step 5: Validate Template Assets

```bash
ls -la "skills/ppt-master/templates/layouts/<template_id>"
```

Run SVG validation on the template directory:

```bash
python3 skills/ppt-master/scripts/svg_quality_checker.py "skills/ppt-master/templates/layouts/<template_id>" --template-mode --format <canvas_format>
```

`--template-mode` makes the checker:

- glob `*.svg` in the template directory directly (templates do not live under `svg_output/`)
- skip `spec_lock.md` drift checks (templates do not ship a spec_lock)
- enforce roster ↔ `design_spec.md` consistency as **errors** (orphan files / missing files break `layouts_index.json`)
- emit advisory **warnings** when a page lacks a conventional placeholder — these are hints, not failures. Declare a `placeholders:` block in `design_spec.md` frontmatter to silence them when your template intentionally uses a different vocabulary

**Checklist**:

- [ ] `design_spec.md` follows the personality-only skeleton (Overview / Color / Signature / Page Roster); generic constraints (SVG rules, pattern libraries, ratio bands, canonical placeholder table) are NOT restated. §V Page Roster lists every emitted page
- [ ] Every page declared in `design_spec.md §V Page Roster` exists as an SVG file in the template directory (and vice versa — no orphan files)
- [ ] Variant filenames follow the letter-suffix convention (e.g. `03a_content_two_col.svg`); variants typically reuse the parent type's placeholder set unless the spec frontmatter declares otherwise
- [ ] If TOC exists, placeholder pattern uses the canonical indexed form
- [ ] SVG viewBox matches the chosen canvas format (for `ppt169`: `0 0 1280 720`)
- [ ] Placeholder names follow the canonical convention where applicable; templates with intentionally different vocabularies (e.g. `{{KEY_MESSAGE}}` instead of `{{PAGE_TITLE}}`) should declare a `placeholders:` frontmatter block to silence advisory warnings
- [ ] Asset files referenced by SVGs actually exist in the template package
- [ ] For `fidelity` mode: every sprite-sheet asset retains its nested `<svg viewBox=...>` crop wrapper; no image whose file aspect differs from its on-page aspect was flattened to a bare `<image>`
- [ ] For `mirror` mode: file count equals source page count (type A: `ls templates/layouts/<id>/*_*.svg | wc -l` matches `<import_workspace>/svg-flat/slide_*.svg | wc -l`; type B: matches the source SVG count); filenames follow the `<NNN>_<page_type>.svg` convention; **no `{{...}}` placeholder strings appear in any copied SVG** (`grep -l "{{" templates/layouts/<id>/*.svg` should return nothing — if the type B source itself contains placeholders, the user should be in `standard` mode, not `mirror`); §V Page Roster in `design_spec.md` lists every emitted file with a one-line description of what the page contains and what content slot it suits

This step is a **hard gate**. Do not register the template into the library index until validation passes.

---

## Step 6: Register Template in Library Index

Run the unified registrar; it derives the `layouts_index.json` entry and refreshes the `README.md` Quick Index from `design_spec.md` (frontmatter when present, prose fallback otherwise) plus the actual SVG file list:

```bash
python3 skills/ppt-master/scripts/register_template.py <template_id>
```

Outputs:

- updates `skills/ppt-master/templates/layouts/layouts_index.json` — the flat `template_id → { summary, keywords }` map
- refreshes the auto-managed Quick Index inside `skills/ppt-master/templates/layouts/README.md` (the surrounding category sections stay hand-edited)
- prints a "Template Creation Complete" card you can use directly for Step 7

The completion card's file roster is collected by globbing `*.svg` in the template directory, so `fidelity`-mode templates that include variant pages such as `03a_content_two_col` are listed automatically.

`layouts_index.json` is a **discovery index** — it lets the AI answer "what templates are available?" by listing names and paths. It is **not** consulted to trigger Step 4. Step 4 triggers on an explicit directory path supplied by the user, regardless of whether that path is registered. A template directory that has not been run through `register_template.py` still works fine when the user gives its path; it just won't appear in discovery listings.

> **Recommended for new templates**: declare a YAML frontmatter block at the top of `design_spec.md`. The registrar prefers it over the §I table and lets you set `category`, `keywords`, `summary`, etc. without relying on prose extraction:
>
> ```yaml
> ---
> template_id: my_template
> category: brand            # brand | general | scenario | government | special
> summary: Strategic consulting, executive briefings, ...
> keywords: [tag1, tag2, tag3]
> primary_color: "#005587"
> canvas_format: ppt169
> replication_mode: standard  # standard | fidelity | mirror
> # Optional: per-page placeholder overrides. Templates that legitimately
> # use a different vocabulary (e.g. consulting decks with {{KEY_MESSAGE}}
> # in place of {{PAGE_TITLE}}, or content variants with bespoke slots)
> # should declare them here so svg_quality_checker --template-mode does
> # not flag them as conventional-placeholder gaps.
> # Mirror-mode templates do not need this field — they have no placeholders.
> placeholders:
>   01_cover: ["{{TITLE}}", "{{SUBTITLE}}", "{{BRAND_LOGO}}"]
>   03_content: ["{{KEY_MESSAGE}}", "{{CONTENT_AREA}}"]
>   03a_content_dual_col: []   # silences hints for this variant entirely
> ---
> ```

> To rebuild every entry at once (e.g. after editing many specs), run:
>
> ```bash
> python3 skills/ppt-master/scripts/register_template.py --rebuild-all
> ```

If you need to update the categorized sections lower in `README.md` (Brand Style Templates / General Style Templates / etc.), edit those by hand — the registrar deliberately leaves them alone so curated descriptions are preserved.

---

## Step 7: Output Confirmation

`register_template.py` already printed a "Template Creation Complete" card during Step 6 — copy it verbatim into the conversation. The card includes the template name, path, category, primary color, index status, and the full SVG file roster (auto-collected from disk, so `fidelity`-mode variant pages and TOC pages are listed correctly without manual editing).

For a standard-mode template the card looks like:

```markdown
## Template Creation Complete

**Template Name**: <template_id> (<display_name>)
**Template Path**: `templates/layouts/<template_id>/`
**Category**: <category>
**Primary Color**: <hex>
**Index Registration**: Done

### Files Included

| File | Status |
|------|--------|
| `01_cover.svg` | Done |
| `02_chapter.svg` | Done |
| `02_toc.svg` | Done |
| `03_content.svg` | Done |
| `04_ending.svg` | Done |
```

---

## Color Scheme Quick Reference

| Style | Primary Color | Use Cases |
|-------|---------------|-----------|
| Tech Blue | `#004098` | Certification, evaluation |
| McKinsey | `#005587` | Strategic consulting |
| Government Blue | `#003366` | Government projects |
| Business Gray | `#2C3E50` | General business |

---

## Notes

1. **SVG technical constraints**: See [shared-standards.md](../references/shared-standards.md) — do not restate them in the template's `design_spec.md`
2. **Color consistency**: All SVG files must use the same color scheme as `design_spec.md §II Color Scheme`
3. **Placeholder convention**: `{{}}` format only; default names listed in [Placeholder Reference](../references/template-designer.md#4-placeholder-reference-canonical-convention-overridable-per-template). Override per template via `placeholders:` frontmatter when needed.
4. **Discovery requirement**: A template directory is only discoverable after `register_template.py` has been run against it (Step 6)

> **Full role specification**: [template-designer.md](../references/template-designer.md)
