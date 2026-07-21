# Selected Template Full Deck Adapter

Use this reference when extending or verifying Humanize PPT routes that turn a selected `beautiful-html-templates` candidate into a complete deck.

## Durable lesson

V0.3 preview-first is not the end of the workflow. Once the user chooses a Beautiful template, the next class-level capability is a deterministic `--selected-template <slug>` adapter that consumes the existing Humanize PPT AST contracts and writes a complete deck artifact.

## Minimum contract

A selected-template full-deck run must produce:

- `outputs/beautiful/selected/index.html`
- `outputs/beautiful/selected_manifest.json`
- `outputs/beautiful/render_report.md`
- `router_plan.json` with `selected_template`, `actual_output`, and route `status`
- `run_manifest.json` that includes the selected deck files
- `outputs/qa/qa_report.md` with pass/fail status

Do not call the route complete if only `outputs/beautiful/previews/index.html` exists.

## Implementation pattern

1. Add a CLI flag such as `--selected-template <slug>`.
2. Route the run to `beautiful-html-templates` even if `--style-mode preview-first` is not set.
3. Resolve the Beautiful repo via explicit `--beautiful-repo`, installed skill paths, cache, or safe auto-clone.
4. Validate both `index.json` and `templates/<slug>/template.html`.
5. Copy sibling assets from the template folder and shared runtime such as `runtime/deck-stage.js`.
6. Convert `slide_plan.json` into full slide sections.
7. Replace the template's deck container (`<deck-stage>`, `#deck`, or body fallback) with generated sections.
8. Add minimal keyboard navigation only if the template does not already provide it.
9. Write `selected_manifest.json` with `version`, `repo`, `title`, `selected_template`, `deck`, and `slide_count`.
10. Treat missing library/template as blocking QA render issues.

## TDD coverage to preserve

- Failing test first: `write_beautiful_selected_deck` is absent.
- Happy path: full deck exists, has every slide message, has page numbers, copies runtime assets, and removes old template placeholder sections.
- Error path: unknown template returns `missing-template` without writing a fake success.

## Current boundary

This adapter is a verified full-deck bridge, not a designer-grade per-template layout remixer. It should preserve the selected template resources and visual shell while injecting Humanize PPT's AST-derived slide sections. Later work can improve per-template layout adaptation, presenter mode, PDF export, and deploy.
