---
name: g2-design-system
description: Use this skill when generating Open Design artifacts that should follow G2 design system.
user-invocable: true
---

Read README.md, DESIGN.md, colors_and_type.css, preview/, preserved assets, context evidence, and ui_kits/app/ before generating any new interface.

**What's inside:**
- DESIGN.md as the canonical source-backed rules document.
- colors_and_type.css as the reusable token stylesheet.
- preview/ focused review cards for color, typography, spacing, components, and brand assets.
- ui_kits/app/ as a browser-reviewable applied interface kit with modular role components.
- context/ provenance and evidence notes for future refreshes.

**Source context:**
Imported design system extracted from `/Applications/Open Design.app/Contents/Resources/app/prebundled/.tmp/github-design-system-imports/HiCatcat-Design-System-20260616T065457869Z`.

**When to use this skill:**
- Creating product-like prototypes that should follow G2 design system.
- Revising focused design-system preview cards or app UI kit components.
- Building interfaces that need this package's captured density, hierarchy, tokens, and anti-patterns.

**How to use:**
1. Read DESIGN.md for product context, foundations, components, motion, voice, and anti-patterns.
2. Load colors_and_type.css instead of hardcoding palette, typography, radius, or spacing values.
3. Inspect preview/ cards for focused modules before inventing new styling.
4. Reuse ui_kits/app/index.html and ui_kits/app/components/ as the applied component composition.
5. Preserve the product context, hierarchy, density, and anti-patterns documented in DESIGN.md.

**Design system highlights:**

- Background: #fbfaf7
- Foreground: #1f1d1b
- Accent: #d66f4d
- Border: #ddd8d0
