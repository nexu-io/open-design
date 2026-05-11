> See shared-standards.md for common technical constraints.

# Template Designer — Template Design Role

## Core Mission

Generate reusable page templates for the **global template library** based on a finalized template brief.

> This is a standalone role: only triggered via the `/create-template` workflow. It is **not** the project-level template selection/customization step in the main PPT generation pipeline.

## Usage

- **Trigger**: `/create-template` workflow
- **Output location**: `templates/layouts/<template_name>/`
- **Input**: finalized template brief (template ID, display name, category, applicable scenarios, tone, theme mode, canvas format, optional reference assets)

When the workflow provides a PPTX reference source, the effective input package comes from the unified `pptx_template_import.py` preparation workspace and becomes:

- finalized template brief
- `manifest.json` — single source of truth (slide size, theme, per-master themes, assets, asset map, placeholders, layouts, masters, slides, SVG file paths, page-type candidates)
- `summary.md` — short orientation digest derived from manifest.json
- exported `assets/`
- `svg/master_*.svg` / `svg/layout_*.svg` — every master / layout in the deck rendered once as standalone SVG, including ones no sample slide references (template packages often ship more design surfaces than the embedded samples exercise)
- `svg/slide_NN.svg` — each slide's own shapes and slide-local background only; master / layout decoration and backgrounds are **not** inlined here
- `svg/inheritance.json` — which layout / master each slide consumes
- `svg-flat/slide_NN.svg` — companion view; each slide is self-contained so you can preview or screenshot a single page without losing the surrounding chrome. Use it as a sanity check for "what would PowerPoint actually show", not as an authoring source — the master/layout chrome will be duplicated across every flat slide.
- optional screenshots for visual cross-checking

PPTX import interpretation:

- Placeholder guides in master / layout SVGs are layout signals. Use `manifest.json` placeholder records for type / index / geometry / base style; do not copy dashed guide boxes into final templates unless the visual design truly uses dashed boxes.
- Charts, SmartArt, diagrams, and OLE objects may appear as typed placeholders in layered SVGs. In flat SVGs they may show preview images. Treat them as source intent markers, not reusable decorative assets.
- The asset filenames referenced by SVGs are governed by the manifest asset map. Prefer those references over inventing duplicate asset names.

Input priority for PPTX-backed template creation:

1. `manifest.json` for all factual metadata (theme, assets, unique layout/master structure, slide reuse, page-type guidance)
2. `svg/master_*.svg` + `svg/layout_*.svg` — the **primary source for the deck's shared visual language**: backgrounds, page chrome, decorative bars, recurring brand motifs. These are what the new template's fixed structure should adopt or reinterpret. Read these before any slide SVG.
3. `svg/inheritance.json` for confirming which slide uses which layout / master
4. exported `assets/` for reusable visual resources
5. `svg/slide_NN.svg` — each slide's unique content, useful for judging composition rhythm and content density (not for fixed structure)
6. `summary.md` only as a fast scan; never as the canonical fact source
7. screenshots / original PPTX only for style verification

---

## Page Roster

The output page set is determined by **replication mode**, declared in the finalized template brief:

| Mode | When to use | Roster |
|------|-------------|--------|
| `standard` (default) | Most templates — clean, reusable, balanced coverage | `01_cover`, `02_chapter`, `03_content`, `04_ending`, optional `02_toc` |
| `fidelity` | User explicitly wants strict replication of a source PPTX, but still wants the AI to clean / cluster / cap variants | Standard roster + one variant per distinct layout cluster found in `manifest.json` |
| `mirror` | User wants every source slide preserved 1:1 as a reference page (someone else's polished deck used as a library template). Verbatim copy, no abstraction, no placeholders | One SVG per source slide, named `<NNN>_<page_type>.svg` by source order |

### Standard mode

| # | Filename | Purpose | Description |
|---|----------|---------|-------------|
| 01 | `01_cover.svg` | Cover | Fixed structure: title, subtitle, date, organization |
| 02 | `02_chapter.svg` | Chapter page | Fixed structure: chapter number, chapter title |
| 03 | `03_content.svg` | Content page | Flexible structure: only defines header/footer; content area freely laid out by AI |
| 04 | `04_ending.svg` | Ending page | Fixed structure: thank-you message, contact info |
| -- | `02_toc.svg` | Table of contents | Optional: TOC title, chapter list (number + title) |

**Design philosophy**: Templates define visual consistency and structural pages; content pages maintain maximum flexibility.

**Naming note**: TOC page keeps `02_toc.svg` naming for template library compatibility and sort order.

### Fidelity mode

When the brief sets `Replication mode: fidelity`, derive the page roster from `manifest.json` page-type clusters and emit one SVG per distinct visual cluster.

**Variant naming**: append a lowercase letter suffix to the parent type's index, preserving sort order:

| Parent type | Example variants |
|-------------|------------------|
| Chapter | `02a_chapter_full.svg`, `02b_chapter_minimal.svg` |
| Content | `03a_content_two_col.svg`, `03b_content_data_card.svg`, `03c_content_quote.svg` |
| Ending | `04a_ending_thanks.svg`, `04b_ending_contact.svg` |

Extension page types beyond the canonical four (transition / appendix / disclaimer / divider) take the next free index: `05_section_break.svg`, `06_appendix.svg`, `07_disclaimer.svg`.

**Roster decision**:

- Cluster slides from `manifest.json` by `pageType` + visual structure (column count, hero-image vs. icon-grid vs. quote, etc.)
- One SVG per cluster — do **not** emit a variant for a cluster represented by a single source slide unless that slide is structurally distinct from existing variants
- One variant per visually distinct cluster — let the source's structural diversity drive the count. Collapse only **near-duplicates** (same column count, same hero element, same content density); do not collapse genuine structural differences just to keep the variant count down. If you find yourself wanting one variant per source slide, that is the signal the user should be in `mirror` mode, not `fidelity`
- Record every emitted page in `design_spec.md §V Page Roster` and in the `pages` field of the `layouts_index.json` entry (auto-collected by `register_template.py`)

> Variants reuse the parent type's placeholder set — see §4 (Placeholder Reference) below.

### Mirror mode

When the brief sets `Replication mode: mirror`, the role does **not** abstract or reconstruct. Each source slide becomes one template page **byte-for-byte**:

- Source: `<import_workspace>/svg-flat/slide_NN.svg` (the self-contained "what PowerPoint shows" view). Do **not** read or use `svg/master_*.svg`, `svg/layout_*.svg`, or `svg/inheritance.json` — chrome / content separation is irrelevant because mirror does not insert placeholders.
- Output: `templates/layouts/<template_id>/<NNN>_<page_type>.svg`, where `<NNN>` is the zero-padded source slide index (3 digits) and `<page_type>` is derived from `manifest.json` `pageTypeCandidates` — `cover` / `toc` / `chapter` / `content` / `ending`. When the page-type heuristic is ambiguous, fall back to `content`. Preserve source slide order via the numeric prefix.
- Modifications allowed: **only** rewriting `<image href="...">` paths to point at the local `assets/` copy, and renaming asset files to semantic names. Everything else — geometry, decoration, sprite-sheet wrappers, original example text, chart placeholders, embedded fonts — is copied as-is.
- Modifications forbidden: inserting `{{TITLE}}` / `{{CONTENT_AREA}}` / any other placeholder; "cleaning up" decorative complexity; merging similar slides; dropping master/layout chrome (it's already baked into the flat SVG, leave it).
- `design_spec.md` §V Page Roster lists every emitted file with **a one-line description** of what the page contains and what content slot it suits — Strategist selects mirror pages purely from these descriptions, since the SVG itself carries no placeholder contract.

**Why mirror has no placeholders**: it is consumed as a **visual reference** rather than a templated form. Executor's mirror path (see [executor-base.md](executor-base.md) §1.1) copies the chosen mirror page into the project and edits text elements in place against the project content — no `{{}}` substitution happens. This keeps the library asset 100% verbatim and lets the user re-discover the source deck by browsing `templates/layouts/<template_id>/` directly.

**What mirror is not**: a pixel-perfect re-rendering pipeline test. Charts, SmartArt, OLE objects, and EMF / WMF media that fail to round-trip in `pptx_template_import.py` will fail the same way in mirror. If the import workspace has missing media or unsupported objects, mirror inherits those gaps — the user should be told before generation begins.

---

## Template Design Specifications

### 1. Must Generate design_spec.md

**Scope rule — personality only.** A template `design_spec.md` describes **what makes this template recognizable**: brand colors, signature decorative motifs, page-by-page visual character, bundled assets. It does **not** restate generic constraints — those live in the canonical references and are already loaded by every downstream role:

- SVG technical constraints, PPT compatibility rules → [`shared-standards.md`](shared-standards.md)
- Generic layout pattern library, spacing bands, font-size ratio bands → [`templates/design_spec_reference.md`](../templates/design_spec_reference.md) (read by Strategist when authoring the **project** design_spec)
- Canonical placeholder vocabulary → §4 below
- Content methodology (pyramid / SCQA / MECE) → [`strategist.md`](strategist.md)

Re-declaring any of these in a template `design_spec.md` is noise — Strategist already has them in context, and duplication forces every relaxation to sweep N templates instead of one source. **If a rule is generic, omit it. If this template breaks a generic rule, write only the deviation.**

**Required skeleton:**

```markdown
---
template_id: <id>
category: brand | general | scenario | government | special
summary: <one-line tone & use case>
keywords: [tag1, tag2, tag3]
primary_color: "#......"
canvas_format: ppt169
replication_mode: standard | fidelity | mirror
# Optional — only when this template overrides canonical placeholder vocabulary.
# Omit entirely for `mirror` mode (mirror has no placeholders).
# placeholders:
#   01_cover: ["{{TITLE}}", "{{SUBTITLE}}", "{{BRAND_LOGO}}"]
#   03_content: ["{{KEY_MESSAGE}}", "{{CONTENT_AREA}}"]
---

# [Template Name] — Design Specification

## I. Template Overview
- Use cases, design tone, theme mode (light / dark / mixed)
- One paragraph: what visually identifies this template at a glance

## II. Color Scheme
- HEX values with role labels (primary / accent / background / text / etc.)
- Brand-specific application rules when present (e.g. "KPI cards rotate blue→green→red→yellow")

## III. Typography (omit when using the default `Arial, "Microsoft YaHei", sans-serif` stack)
- Per-role font stacks ONLY when the template intentionally diverges (display serif title, brand typeface, etc.)
- Font-install or embedding requirement when a non-preinstalled font leads any stack
- Body baseline px (informational; `spec_lock.md` owns the actual values per project)

## IV. Signature Design Elements
- Decorative motifs that ARE this template — top bar, gradient underline, logo treatment, brand emblem placement
- Optional XML snippet for any reusable component unique to this template

## V. Page Roster
One row per emitted SVG describing what this template's version of cover / chapter / content / ending looks like (background treatment, decorative anchors, layout rhythm). For `fidelity` mode, also note the cluster source and visual differentiator. For `mirror` mode the roster is the **load-bearing artifact** — Strategist picks mirror pages purely from these descriptions, so each row must include enough detail to distinguish it from siblings (column count, hero element, content density, what kind of content slot it fits — "three-column KPI grid with large numbers, suits quarterly summary"). Roster entries must match the actual SVG files on disk.

## VI. Assets (omit when none)
Logos, cover backgrounds, brand textures bundled with the template package — file name, dimensions, intended usage.

## VII. Placeholder Overrides (omit when none)
Reference the `placeholders:` frontmatter declaration and explain the rationale (e.g. "consulting decks lead with `{{KEY_MESSAGE}}` instead of `{{PAGE_TITLE}}`").
```

Sections to **omit** from template `design_spec.md` (sourced elsewhere — listing them here is noise):

| Don't write | Source |
|---|---|
| SVG technical constraints / Mandatory rules / Prohibited elements | `shared-standards.md` §1 |
| PPT compatibility rules (`<g opacity>`, inline-styles-only, etc.) | `shared-standards.md` |
| Generic layout pattern library (centered card / 三栏 / timeline / …) | `design_spec_reference.md` §V |
| Generic spacing bands (margin 40-60px, card gap 20-32px, etc.) | `design_spec_reference.md` §V |
| Generic font-size hierarchy (cover 2.5-5x body, page title 1.5-2x, …) | `design_spec_reference.md` §IV |
| Canonical placeholder table (`{{TITLE}}`, `{{PAGE_NUM}}`, …) | §4 below |
| Content methodology (pyramid / SCQA / MECE / 金字塔) | `strategist.md` |
| "Usage Instructions" boilerplate (copy template / select page / …) | `create-template.md` |
| Created Date / Page Count rows | not a library-level field |

When rewriting an existing template that contains the omitted sections, delete them — do not leave a "see XXX" pointer behind. The pointer is what this scope rule replaces.

### 2. Inherit Design Specification

Templates must strictly follow the finalized template brief and the generated `design_spec.md`:
- **Canvas dimensions**: viewBox matches the design spec
- **Color scheme**: Uses primary, secondary, and accent colors from the spec
- **Font plan**: Uses the per-role font families declared in the spec
- **Layout principles**: Margins and spacing conform to the spec

If PPTX import output exists:
- Prefer imported theme colors and fonts over visually guessed values
- Reuse exported `assets/` images directly — `<image>` references in `svg/` already point at canonical files
- Treat page-type candidates from `manifest.pageTypeCandidates` as hints, not guarantees

**Precondition**:

- When PPTX import output is provided, do not generate any template SVG or `design_spec.md` until every file under `<import_workspace>/svg/` has been read — including `master_*.svg`, `layout_*.svg`, and every `slide_*.svg`
- Before template generation begins, explicitly report the read slide indexes

### 2.1 PPTX Import Simplification Rule

The imported PPTX is a **reference source**, not a direct conversion target.

Do:
- preserve brand assets, recurring backgrounds, and stable structural motifs
- rebuild the layout into a clean SVG structure aligned with PPT Master constraints
- simplify repeated decorative fragments into a smaller number of maintainable SVG elements
- use a background image asset when the original decorative layer is too complex to recreate cleanly
- use cleaned slide SVG references to inspect composition, spacing, text hierarchy, and fixed decorative structure only after factual metadata has been anchored
- read every reference SVG under `svg/` — `master_*.svg`, `layout_*.svg`, and every `slide_*.svg` regardless of slide count. Master / layout files describe the deck's shared visual language (read first); slide files describe per-page content (read after). Partial coverage drops template fidelity.
- rename adopted assets to semantic names (`cover_bg.png`, `brand_emblem.png`) rather than carrying raw `image3.png` into the final template

Do not:
- attempt 1:1 translation of every PowerPoint shape, group, shadow, or decorative fragment
- mirror PPT-specific complexity when it makes the resulting SVG brittle or hard to edit
- introduce dense low-value vector detail that does not materially improve template reuse

### 3. Placeholder Markers

> **Mirror mode skips this section entirely.** Mirror SVGs are verbatim copies of the source flat slides — they carry no `{{}}` markers. Executor reads them as visual references and edits text in place (see [executor-base.md](executor-base.md) §1.1). The rest of this section applies to `standard` and `fidelity` only.

Use clear placeholder markers for replaceable content:

```xml
<!-- Text placeholder -->
<text x="80" y="320" fill="#FFFFFF" font-size="48" font-weight="bold">
  {{TITLE}}
</text>

<!-- Content area placeholder (content page only) -->
<rect x="40" y="90" width="1200" height="550" fill="#FFFFFF" rx="8"/>
<text x="640" y="365" text-anchor="middle" fill="#CBD5E1" font-size="16">
  {{CONTENT_AREA}}
</text>
```

### 4. Placeholder Reference (canonical convention, overridable per template)

This is the **default vocabulary** used across the library. Newly created templates SHOULD prefer these names so projects that consume the library find familiar slots; designers MAY substitute or extend them when a style genuinely needs different vocabulary (e.g. consulting decks lead with `{{KEY_MESSAGE}}` instead of `{{PAGE_TITLE}}`; a brand cover may need `{{BRAND_LOGO}}`).

`svg_quality_checker.py --template-mode` emits **advisory warnings** when a page lacks the conventional placeholder for its type. To silence those warnings — and document the template's actual contract — declare a `placeholders:` map in `design_spec.md` frontmatter:

```yaml
placeholders:
  01_cover: ["{{TITLE}}", "{{SUBTITLE}}", "{{BRAND_LOGO}}"]
  03_content: ["{{KEY_MESSAGE}}", "{{CONTENT_AREA}}"]
  03a_content_dual_col: []   # explicitly assert "no required placeholders"
```

| Placeholder | Purpose | Applicable page | Convention role |
|------------|---------|-------------------|--------|
| `{{TITLE}}` | Main title | Cover | Default |
| `{{SUBTITLE}}` | Subtitle | Cover | Default |
| `{{DATE}}` | Date | Cover | Default |
| `{{AUTHOR}}` | Author / Organization | Cover | Default |
| `{{CHAPTER_NUM}}` | Chapter number | Chapter page | Default |
| `{{CHAPTER_TITLE}}` | Chapter title | Chapter page | Default |
| `{{CHAPTER_DESC}}` | Chapter description | Chapter page | Optional |
| `{{PAGE_TITLE}}` | Page title | Content page | Default |
| `{{CONTENT_AREA}}` | Content area | Content page | Default |
| `{{PAGE_NUM}}` | Page number | Content page, ending page | Default |
| `{{KEY_MESSAGE}}` | Key takeaway | Content page (consulting style) | Style-specific |
| `{{SECTION_NAME}}` | Section name | Content page footer | Optional |
| `{{SOURCE}}` | Data source | Content page footer | Optional |
| `{{THANK_YOU}}` | Thank-you message | Ending page | Default |
| `{{CONTACT_INFO}}` | Contact info | Ending page | Default |
| `{{ENDING_SUBTITLE}}` | Ending subtitle | Ending page | Optional |
| `{{CLOSING_MESSAGE}}` | Closing message | Ending page | Style-specific |
| `{{COPYRIGHT}}` | Copyright | Ending page | Optional |

For TOC pages in **newly created library templates**, use indexed placeholders:

- `{{TOC_ITEM_1_TITLE}}`, `{{TOC_ITEM_1_DESC}}`
- `{{TOC_ITEM_2_TITLE}}`, `{{TOC_ITEM_2_DESC}}`
- ...

Do **not** create new TOC placeholder families such as `{{CHAPTER_01_TITLE}}` for new templates. Existing templates may contain legacy placeholder variants, but new library assets should converge on the indexed TOC contract.

Variants reuse their parent type's placeholder set by default: every `03*_content*.svg` shares the content placeholder list above, unless the spec frontmatter declares an override for that specific stem.

When rebuilding from imported PPTX references, placeholder insertion takes priority over visual mimicry. If the original layout leaves insufficient room for canonical placeholders, adjust the layout instead of inventing one-off placeholder families — or, if the deviation is intentional and meaningful, declare it in frontmatter.

---

## Output Requirements

### File Save Location

Standard mode (default):

```
templates/layouts/<template_name>/
├── design_spec.md     # Design specification (required)
├── 01_cover.svg
├── 02_chapter.svg
├── 02_toc.svg          # Optional
├── 03_content.svg
├── 04_ending.svg
└── *.png / *.jpg       # Image assets (if any)
```

Fidelity mode adds variants and extension pages, e.g.:

```
templates/layouts/<template_name>/
├── design_spec.md
├── 01_cover.svg
├── 02a_chapter_full.svg
├── 02b_chapter_minimal.svg
├── 02_toc.svg
├── 03a_content_two_col.svg
├── 03b_content_data_card.svg
├── 03c_content_quote.svg
├── 04_ending.svg
├── 05_section_break.svg
└── *.png / *.jpg
```

Mirror mode emits one SVG per source slide, named by source order:

```
templates/layouts/<template_name>/
├── design_spec.md
├── 001_cover.svg
├── 002_toc.svg
├── 003_content.svg
├── 004_content.svg
├── 005_chapter.svg
├── 006_content.svg
├── ...
├── 049_content.svg
├── 050_ending.svg
└── *.png / *.jpg
```

Filenames preserve the source slide order via the 3-digit prefix; `<page_type>` is derived from `manifest.json` `pageTypeCandidates`. No `{{}}` placeholders appear in any mirror SVG.

### Template Preview

After each template is generated, provide a brief summary table listing each template's status.

If the template is based on PPTX import output, briefly note:
- which extracted assets were reused directly
- which complex original decorations were intentionally simplified
- whether any page-type mapping required judgment beyond the import heuristic

---

## Using Pre-built Template Library (Optional)

If suitable template resources already exist, use them directly instead of generating new ones:

1. **Copy template**: Copy template files to the project's `templates/` directory
2. **Adjust colors**: Modify colors per the project design spec
3. **Customize**: Make project-specific adjustments

This section describes downstream reuse. The `Template_Designer` role itself is responsible for creating or normalizing the reusable library asset first.

**Example library structure** (query `templates/layouts/layouts_index.json`):

```
templates/layouts/
├── google_style/      # Google Material Design style
├── academic_defense/  # Academic defense style
└── 招商银行/          # China Merchants Bank brand style
```

---

## Phase Completion Checkpoint

```markdown
## Template_Designer Phase Complete

- [x] Read `references/template-designer.md`
- [x] Replication mode confirmed: `standard` | `fidelity` | `mirror`
- [x] Every page listed in `design_spec.md §V Page Roster` saved to `templates/layouts/<template_name>/`
- [x] Naming convention applied (standard / fidelity: letter-suffix variants; mirror: `<NNN>_<page_type>.svg`)
- [x] Templates follow design spec (colors, fonts, layout)
- [x] Placeholder markers are clear and standardized (standard / fidelity); mirror SVGs contain **no** `{{}}` markers
- [ ] **Next step**: Validate assets and register the template in `layouts_index.json` (include `pages` field)
```
