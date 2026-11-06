# What an OD design-system folder looks like

Reference for the `od-contribute` skill's `validate-design-system.sh` step.

> **Authoritative source**: read 1–2 existing folders under `design-systems/` in `nexu-io/open-design` at runtime — the conventions evolve as new systems land.

## Minimum viable design system

```
design-systems/<brand-slug>/
└── DESIGN.md          # required — the brand brief OD loads
```

A few systems include extras: `components.html`, `tokens.css`. These are optional, referenced from `DESIGN.md` if present.

## DESIGN.md structure (observed convention)

H1 with the brand name, then a blockquote with category + one-sentence pitch, then numbered H2 sections. Looking at established systems (`airbnb`, `apple`, etc.), the typical section list is:

```markdown
# Design System Inspired by <Brand>

> Category: <e.g. E-Commerce & Retail>
> <one-sentence pitch>

## 1. Visual Theme & Atmosphere
## 2. Color Palette & Roles
## 3. Typography
## 4. Layout & Spacing
## 5. Components
## 6. Motion & Interaction
## 7. Iconography & Imagery
## 8. Voice & Tone
## 9. Edge Cases & Variations
```

Section ordering and exact titles vary — the validator only checks **structural overlap with reference systems**, not exact heading text. ≥30% overlap with the union of headings from existing systems is enough to pass.

## What the validator actually enforces

1. File is non-empty and has at least one H1.
2. ≥30% heading overlap with reference DESIGN.md files (when references are passed in).
3. No `../` relative paths that would resolve outside `design-systems/<brand>/`.

That's deliberately loose — DESIGN.md is a creative brief, not a schema.

## Don'ts

- Don't reference assets outside the brand folder.
- Don't paste binary fonts; use a CSS `@font-face` reference and let OD resolve at runtime.
- Don't use real customer logos / proprietary brand assets you don't have rights to (the validator won't catch this — it's a maintainer-review concern).
