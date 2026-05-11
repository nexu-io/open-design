# Project Tools

> Architecture rationale (why `import-sources` defaults are asymmetric for in-repo vs out-of-repo files): see [docs/technical-design.md "Project Structure & Lifecycle"](../../../../docs/technical-design.md#project-structure--lifecycle).

Project tools create, validate, and inspect the standard PPT Master workspace.

## `project_manager.py`

Main entry point for project setup and validation.

```bash
python3 scripts/project_manager.py init <project_name> --format ppt169
python3 scripts/project_manager.py import-sources <project_path> <source1> [<source2> ...]
python3 scripts/project_manager.py validate <project_path>
python3 scripts/project_manager.py info <project_path>
```

Notes:
- Files outside the repo are copied into `sources/` by default
- With `--move`, files outside the repo are moved into `sources/`
- Files already inside the repo are moved into `sources/` by default (with a stderr
  note), to avoid leaving unintended artifacts that could be committed by mistake.
  Pass `--copy` to force a copy for in-repo sources instead.
- `--move` and `--copy` are mutually exclusive.

Common formats:
- `ppt169`
- `ppt43`
- `xiaohongshu`
- `moments`
- `story`
- `banner`
- `a4`

Examples:

```bash
python3 scripts/project_manager.py init my_presentation --format ppt169
python3 scripts/project_manager.py validate projects/my_presentation_ppt169_20251116
python3 scripts/project_manager.py info projects/my_presentation_ppt169_20251116
```

## `project_utils.py`

Shared helper module used by other scripts.

Typical use:

```python
from project_utils import get_project_info, validate_project_structure
```

You can also run it directly for quick checks:

```bash
python3 scripts/project_utils.py <project_path>
```

## `batch_validate.py`

Batch-check project structure and compliance.

```bash
python3 scripts/batch_validate.py examples
python3 scripts/batch_validate.py examples projects
python3 scripts/batch_validate.py --all
python3 scripts/batch_validate.py examples --export
```

Use this for repository-wide health checks before release or cleanup.

## `generate_examples_index.py`

Rebuild `examples/README.md` automatically.

```bash
python3 scripts/generate_examples_index.py
python3 scripts/generate_examples_index.py examples
```

## `pptx_template_import.py`

Unified PPTX preparation entry point for `/create-template`.

```bash
python3 scripts/pptx_template_import.py <template.pptx>
python3 scripts/pptx_template_import.py <template.pptx> -o <output_dir>
python3 scripts/pptx_template_import.py <template.pptx> --manifest-only
python3 scripts/pptx_template_import.py <template.pptx> --skip-manifest
python3 scripts/pptx_template_import.py <template.pptx> --embed-images
python3 scripts/pptx_template_import.py <template.pptx> --inheritance-mode both
python3 scripts/pptx_template_import.py <template.pptx> --inheritance-mode flat
python3 scripts/pptx_template_import.py <template.pptx> --inheritance-mode layered
```

Notes:
- Extracts reusable media assets from `ppt/media/`
- Summarizes slide size, theme colors, font metadata, and per-master theme metadata
- Resolves slide / layout / master relationships from OOXML relationships; every master and layout is included even when no sample slide currently references it
- Generates `manifest.json` (single source of truth for slide size, theme, per-master themes, assets, layouts, masters, placeholders, slides, SVG file paths, and page-type candidates), `summary.md` (short orientation digest), `assets/`, and shape-level SVGs under `svg/`
- **SVG output emits two views by default** (`--inheritance-mode both`):
  - `svg/` — layered template view for designers: every master and layout in the deck rendered once as `svg/master_*.svg` / `svg/layout_*.svg` (including ones no sample slide currently references); `svg/slide_NN.svg` contains only that slide's own shapes; `svg/inheritance.json` records which layout / master each slide consumes.
  - `svg-flat/` — companion view: each `slide_NN.svg` is self-contained (master + layout + slide painted into one file), so opening any slide in isolation shows the full page like PowerPoint would. Useful for previews, screenshots, and "did this slide actually render correctly" sanity checks.
- `manifest.json` records `svgFile` for slides / layouts / masters, `flatSvgFile` for slides when `svg-flat/` exists, placeholder type / index / geometry / base style, an asset map used by SVG `href` values, and common assets reused through slide / layout / master inheritance
- Layered slide SVGs keep only the slide's own background; inherited master / layout backgrounds stay in the corresponding master / layout SVGs
- Placeholder guides are intentionally lightweight in `svg/` master / layout files; `svg-flat/` hides those guides and is the visual preview source
- Charts, SmartArt, diagrams, and OLE objects become typed placeholders in `svg/`; `svg-flat/` shows a preview image with a corner badge when one exists, otherwise a visible placeholder. Tables are converted into real SVG content.
- Pass `--inheritance-mode layered` to skip `svg-flat/`, or `--inheritance-mode flat` for the legacy round-trip view (single self-contained `svg/` tree without master/layout/inheritance files).
- SVG export reads OOXML directly via `pptx_to_svg` — no PowerPoint or Keynote dependency, runs on any platform
- `<image>` elements in `svg/` reference files in `assets/` directly; pass `--embed-images` to inline as data URIs instead
- External linked images and missing media are strict failures. Office vector media such as EMF / WMF are converted to PNG previews when the local toolchain can do so; otherwise the import fails instead of silently dropping content.
- Required in `/create-template` whenever the reference source is `.pptx`
- Default output directory is `<pptx_stem>_template_import/`
- Use `--manifest-only` when you explicitly want only the lightweight import output without slide SVG export
- Intended for template reference preparation, not for final 1:1 template delivery

Implementation note:
- Internal helpers for this workflow live under `scripts/template_import/`

## `error_helper.py`

Show standardized fixes for common project errors.

```bash
python3 scripts/error_helper.py
python3 scripts/error_helper.py missing_readme
python3 scripts/error_helper.py missing_readme project_path=my_project
```
