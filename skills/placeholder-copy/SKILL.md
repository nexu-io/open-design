---
name: placeholder-copy
description: Write representative UI copy without invented claims.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, copy, content, ux-writing, placeholder, humanizer, design-agent]
    related_skills: [layout-options, section-from-prompt]
---

# Placeholder Copy

When a mockup needs words, generate believable, on-brand placeholder copy from a
short product description — so mockups read like a real product, not lorem ipsum.

## When to use this skill

- "Fill this layout with copy for <product>"
- "Give me hero + feature + CTA text for this"
- Any time a mockup or section needs content rather than greeking

## Inputs

- A product/feature description (what it does, who it's for, tone)
- The set of slots to fill (hero headline, sub-copy, N feature blurbs, CTA,
  nav labels, footer, etc.)

## Workflow

1. **Extract the value prop** from the description in one sentence.
2. **Draft per slot:** punchy hero headline (≤8 words), supporting sub-copy
   (1–2 sentences), feature blurbs (title + 1 line each), and a CTA verb phrase.
3. **Edit for natural language.** Remove boilerplate cadence, vague superlatives,
   repeated sentence shapes, and AI-marketing phrases.
4. **Match tone** to the brand (e.g. fintech = precise/credible; consumer = warm).
5. **Return as a fill-map** the layout skills can drop straight into slots.

## Output contract

- A JSON/markdown map of slot → copy
- 2–3 alternative headlines for the hero
- No lorem ipsum unless the user explicitly asks for greeking

## Rules

- Real, specific copy beats generic filler. Avoid "Lorem", "Unlock the power of",
  "Seamlessly", and other tells.
- Never invent factual claims (pricing, stats, certifications) — mark those as
  `[CLIENT INPUT]` placeholders.
