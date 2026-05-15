---
name: sample-plugin
description: Phase 1 sample plugin synthesizing a SKILL.md frontmatter for backwards-compat tests.
od:
  kind: skill
  taskKind: new-generation
  preview:
    type: deck
---

# Sample Plugin

This is the SKILL.md half of the Phase 1 e2e fixture. The companion
`open-design.json` sidecar carries the canonical Open Design plugin
manifest fields; this file proves the SKILL-only adapter path stays
honest when an install lacks an explicit sidecar (just delete
`open-design.json` to test the legacy compat tier).

## Workflow

1. Acknowledge the user's brief via the discovery question form atom.
2. Use TodoWrite to plan the brief.
3. Emit the brief as a deck artifact.
