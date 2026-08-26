---
name: design-drift-watch
description: Compare deployed pages with Figma and report visual drift.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, sync, figma, visual-diff, qa, drift, design-agent]
    related_skills: [figma-extract, figma-token-sync, brand-token-system]
---

# Design Drift Watch

Detect when the **shipped UI** has drifted from the **Figma design** it was
built against. Detection-only: it reports, it does not auto-fix.

## Trigger

- On demand, after a deploy, or through a scheduler configured outside this skill.
- Configure: list of `{url, figma_node}` pairs (deployed page ↔ Figma frame).

## Direction

**Compare both sides.** Neither is mutated; the skill surfaces divergence for a
human to triage (is the code wrong, or has the design moved on?).

## Workflow

1. **Capture** each deployed page with the active client's browser or screenshot
   capability at the agreed viewports.
2. **Fetch** the matching Figma frame export via `figma-extract`.
3. **Compare visually** - focus on layout, spacing, color, type, and
   missing/extra elements; describe differences, don't just pixel-diff.
4. **Score** severity per page (cosmetic / notable / broken).
5. **Report** only pages above a threshold. Send an external notification or
   create a task only when the user names and authorizes a configured destination.
   Pages in sync are logged quietly.

## Output contract

- Per-page drift verdict + annotated differences
- Drift digest with thumbnails when drift exists
- Optional authorized task for "broken" severity

## Guardrails

- Read-only on both the site and Figma.
- Never auto-edits code or design — this is a watch, not a fixer.
- Respects auth: only screenshots pages it's authorized to reach.
