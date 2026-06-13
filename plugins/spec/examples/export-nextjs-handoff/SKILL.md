---
name: export-nextjs-handoff
description: Use this plugin when the user wants an accepted Open Design artifact converted into a Next.js App Router handoff with clean components, styles, assets, and implementation notes.
license: MIT
metadata:
  author: open-design-spec
  version: "0.1.0"
---

# Export Next.js Handoff

## Workflow

1. Read the accepted artifact and identify components, assets, layout tokens, and interactions.
2. Generate a Next.js App Router folder with page, component, and style boundaries.
3. Preserve visual fidelity while using maintainable component names and accessible markup.
4. Run available typecheck or build commands when a package is present.
5. Return a diff summary and handoff notes.

## Output Contract

Produce `nextjs-handoff/` and `handoff-summary.md`.

