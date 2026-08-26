---
name: layout-options
description: Create exactly three structurally distinct layouts.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, layout, wireframe, mockup, options, lo-fi, hi-fi, design-agent]
    related_skills: [brand-token-system, placeholder-copy, impeccable]
---

# Layout Options (3-up)

Given a look-&-feel reference plus a layout brief, return **exactly three
visually distinct** layout directions so a human can pick fast. This is the
core "give me options" behavior from the Design Agent request.

## When to use this skill

- "Here's a reference — give me 3 options for the landing hero"
- "Show me a few directions for this page, lo-fi is fine"
- Any request that asks for choices / variants of a layout

## Inputs

- A reference such as a screenshot, URL, or Figma frame available to the client
- A layout brief (what sections, what the page is for)
- Fidelity: **lo-fi** (wireframe) or **hi-fi** (styled). If unspecified, deliver
  lo-fi first, then hi-fi on the chosen one (PRD §D.II, OQ-5).

## Workflow

1. **Load tokens.** If a brand token set exists for this brief, read it; else run
   `brand-token-system` first so hi-fi options are on-brand.
2. **Pick 3 genuinely different structures** — not three tweaks of one layout.
   E.g. centered-hero vs. split-hero vs. editorial; vary rhythm, density, focal point.
3. **Render by fidelity:**
   - **lo-fi**: grayscale semantic HTML/CSS wireframes with no decorative polish.
   - **hi-fi**: token-applied HTML/CSS or the target project's real component stack.
4. **Assemble one comparison artifact** — a single HTML file showing the 3
   options side-by-side (or stacked with labels A/B/C), each self-contained.
5. **Caption each option** with a one-line rationale ("A: trust-forward, dense;
   B: airy, product-led; C: editorial").

## Output contract

- One HTML comparison file with 3 labelled options
- A one-line rationale per option
- A clear prompt for the human to choose (this skill never auto-picks)

## Rules

- Exactly 3. The Design Agent's M1 layout and wireframe contract does not allow a different count.
- Options must be **visually distinct**, verified by rendering, not just claimed.
- Honor the requested fidelity; don't silently upgrade lo-fi to hi-fi.
