---
name: brand-token-system
description: Build reusable brand tokens for light and dark interfaces.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, design-system, tokens, color, typography, light-dark, brand, design-agent]
    related_skills: [figma-extract, layout-options, impeccable]
---

# Brand Token System

Turn a brief (or a visual reference / logo) into a complete, consistent brand
token system and persist it so every other design skill in the session reuses
the same values. Use it when a brief needs a new token system or an explicit
token change; do not rerun it when the current repository or conversation has
already established a usable source of truth. It establishes the values that `layout-options`,
`section-from-prompt`, `motion-states`, and `design-imagery` all read from.

## When to use this skill

- "Set up the colors / text styles for <product>"
- "Make me a palette: primary, secondary, background, outline"
- "I need light and dark mode tokens"
- A design brief that has no usable existing token source

## Inputs

- A product/brand brief (industry, mood, any mandated colors), **or**
- A reference image, screenshot, or logo available to the local client, **or**
- An existing Figma file (use `figma-extract` first, then refine here).

## Workflow

1. **Derive the core palette.** Produce four named roles — **Primary**,
   **Secondary**, **Background**, **Outline** — plus the usual support tokens
   (surface, text, muted, success/warning/danger). Give each an exact hex.
2. **Check contrast.** Verify text-on-background and primary-on-background meet
   WCAG AA; note the ratios. Dark mode is a **re-tuned** palette, not a naive
   inversion of the light one.
3. **Build the type scale.** Font family/fallbacks, a modular size scale
   (e.g. 12/14/16/20/24/32/48), weights, and line-heights.
4. **Emit both modes.** Generate light **and** dark token sets from one logical
   model so they stay in lock-step.
5. **Export.** Write a `DESIGN.md` with rationale and contrast evidence, plus a
   plain `tokens.css` with `:root` and `[data-theme="dark"]` custom properties.
   Emit Tailwind or DTCG only when the target project uses that format.
6. **Persist locally.** Keep the files in the target repository as the working
   source of truth. Do not write profile memory or a remote design system unless
   the user explicitly chooses that destination.
7. **Reuse on later tasks.** Record the selected local files in the delivery
   summary. Later work should read those files directly instead of rediscovering
   or rebuilding the brand system.

## Output contract

- `DESIGN.md` (tokens + rationale, lint-clean)
- `tokens.css` (light + dark custom properties)
- A short summary table of the four roles + contrast ratios
- A note of where the tokens were persisted

## Composition

This skill owns the palette, scale, semantic roles, contrast evidence, and
light/dark discipline. Existing project tokens win over a new system unless
the user explicitly requests a replacement.
