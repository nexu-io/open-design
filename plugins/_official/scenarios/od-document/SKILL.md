---
name: od-document
description: Default document/PDF scenario for reports, docs, resumes, proposals, and print-friendly written artifacts.
triggers:
  - document
  - docs
  - PDF
  - report
  - resume
  - 文档
  - PDF
od:
  scenario: document
  mode: document
---

# Document / PDF Scenario

Create a polished, export-safe document as a single HTML artifact. Optimize for reading, printing, and PDF export.

## Workflow

1. Read `assets/template.html` and `references/structures.md`.
2. Choose the structure that matches `documentType`.
3. Write real, specific copy. No lorem ipsum.
4. Use print-friendly CSS: stable page width, strong headings, no overflow, good widow/orphan behavior where practical.
5. Verify against `references/checklist.md`.

## Hard Rules

- Use document hierarchy, not app-dashboard card stacks.
- Keep line length readable and page breaks sensible.
- If the target is a resume, prioritize scannability and measurable impact.
- If the target is docs, prioritize headings, examples, callouts, and step order.
