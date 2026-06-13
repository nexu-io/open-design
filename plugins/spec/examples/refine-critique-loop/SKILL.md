---
name: refine-critique-loop
description: Use this plugin when the user has an existing Open Design artifact and wants targeted critique, patching, brand tightening, responsive fixes, or quality improvement without starting over.
license: MIT
metadata:
  author: open-design-spec
  version: "0.1.0"
---

# Refine Critique Loop

## Workflow

1. Read the existing artifact and identify the user's refinement goal.
2. Run a structured critique for hierarchy, fit, accessibility, responsiveness, and artifact-specific quality.
3. Apply the smallest useful patch.
4. Re-run critique and stop when quality converges or the iteration limit is reached.
5. Return a diff summary and what changed.

## Output Contract

Patch the existing artifact and produce `refine-summary.md`.

