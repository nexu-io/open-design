---
name: create-document-with-open-design
description: Create or refine a web-first document with Open Design, including reports, proposals, briefs, guides, and editorial documents. Use only when the user explicitly selects or names Open Design and accepts Markdown source plus a print-ready HTML or PDF-ready preview; do not promise native DOCX output.
---

# Create Document with Open Design

Apply `$open-design-basics`, then execute this document contract.

## Dynamic decision dimensions and execution

- Use `artifactType: document` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - Document purpose, reader decision, and success condition.
  - Audience, reading context, and expected subject familiarity.
  - Document genre, section structure, and narrative order.
  - Evidence, citations, supplied source material, and recommendation depth.
  - Length, level of detail, editorial tone, and brand treatment.
  - Print-ready, PDF-ready, and native `.docx` expectations.
- Tailor choices to the requested document. A board memo, research report, customer proposal, and public guide need different structure, evidence, and depth options.
- Put supplied outline, evidence, copy, citations, audience, and brand constraints in `knownAnswers`; do not re-ask them or request a free-text document brief.
- If the user requires a native `.docx`, explain before starting that this Open Design workflow does not produce one. Do not label HTML, Markdown, or PDF-ready output as DOCX.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `document` to the Open Design document/new-generation workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a readable Markdown source file, a print-ready HTML entry file, and a real `previewUrl`. Verify the selected sections, hierarchy, evidence, and print layout. Open the exact Studio and preview URLs in separate in-app-browser tabs. A Markdown-only result without the promised print-ready preview is incomplete; native DOCX is outside this contract.
