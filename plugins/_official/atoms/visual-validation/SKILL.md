---
name: visual-validation
description: Render the current artifact, compare it against reference screenshots, and feed the result into critique scoring.
od:
  scenario: new-generation
  mode: critique
---

# Visual validation

This atom renders the current project artifact through the daemon preview
route, compares it against discovered or explicit reference screenshots, and
feeds a conservative score back into the critique loop.

## Current state

- The daemon registry executes `visual-validation` as a built-in atom worker.
- Reports are written under `critique/visual-validation/`.
- When no reference screenshots are present, the atom skips without changing
  critique signals.

When references exist but the daemon cannot render the artifact, the atom fails
closed by returning a low critique score and `preview.ok: false`.
