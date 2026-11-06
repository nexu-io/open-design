# Presenter / Export Adapter Pattern

Use this reference when evolving Humanize PPT or similar presentation-director skills from “final deck exists” to “deliverable presentation package”.

## Trigger

Apply this pattern when the workflow already produces a final HTML deck and the user wants the skill to operate more independently as a PPT skill, without collapsing into a fixed visual-template renderer.

## Architecture

Keep three layers separate:

1. **Outline / contract** — AST brief, slide plan, speaker intent, asset manifest.
2. **Production renderer** — guizang, beautiful-html-templates selected deck, html-ppt, frontend-slides, or another renderer.
3. **Completion adapters** — presenter shell, export package, QA and delivery manifests.

Presenter/export are post-processing adapters. They should require a rendered final deck, not just a preview gallery.

## Required behavior

### Presenter adapter

Inputs:

- final deck path, usually `outputs/<renderer>/index.html` or `outputs/beautiful/selected/index.html`
- `slide_plan.json`
- speaker intent fields

Outputs:

- `outputs/presenter/index.html`
- `outputs/presenter/presenter_manifest.json`
- `outputs/presenter/render_report.md`

Minimum shell:

- iframe or embedded final deck
- `CURRENT`, `NEXT`, and `SCRIPT` panels
- notes generated from speaker intent and slide messages
- keyboard navigation controls
- manifest with source deck path and slide count

### Export adapter

Inputs:

- final deck directory
- slide count / run metadata

Outputs:

- `outputs/export/package/index.html`
- copied local deck assets
- `outputs/export/export_pdf.sh`
- `outputs/export/export_manifest.json`
- `outputs/export/README.md`
- `outputs/export/render_report.md`

PDF export script may rely on Playwright, but must document the install command or failure message instead of silently failing.

## QA gate

If requested, router status must show:

- `presenter-adapter.status == rendered`
- `export-adapter.status == packaged`
- `qa.status == pass`

If only a preview gallery exists, adapters should return `missing-deck` and QA should fail. Do not call a preview gallery a completed deliverable.

## TDD notes

Add failing tests before implementation for:

- presenter shell is created and includes deck href, `CURRENT`, `NEXT`, `SCRIPT`, and speaker notes
- export package copies deck files and writes `export_pdf.sh`, `README.md`, and manifest
- missing final deck returns `missing-deck`

Then run targeted tests, full test suite, `py_compile`, and one real sample run.
