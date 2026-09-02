---
name: skill-compact-landing
description: Compact premium landing pages: narrow measure, quiet typography, tiny tactile controls, a product-native signature artifact, clear CTA hierarchy, zero layout shift.
---

# Compact Premium Landing

Build a small, finished product world, not a stretched marketing template. The page is deliberately narrow, information-dense but calm, and carries one "signature artifact" that only this product could show.

## When to use

- Briefs mentioning "compact landing", "micro-saas", "developer tool page", "package demo", "docs intro"
- Products whose value fits one screen: CLIs, APIs, utilities, npm packages, indie tools
- Any landing where high-intent visitors need a fast, credible decision, not a scroll journey

## Style rules

- **Design fingerprint first.** Before coding, pick one coherent direction across: composition (offset rail, framed console, split pamphlet, stacked specimen), measure (420-720px, vary per product), palette (warm paper / cool fog / monochrome ink / dark charcoal / product-tinted), type pairing (grotesk+mono, humanist+mono, serif+sans), geometry (sharp / machined / soft radii), and one motif (indices, colored dots, stamps, ASCII marks). Derive all tokens from that one direction.
- **Signature artifact.** Include one product-native element that creates identity: a real-looking delivery log, data specimen, live output sample, or miniature workflow. It must look useful, not decorative.
- **CTA hierarchy.** Primary action in the first viewport, visually strongest element; one quiet secondary beside it. Never two competing primaries.
- **Buttons are tactile and small.** Compact scale: 24-28px visual height, 11-12px label (or medium 32-36px). Press feedback `transform: scale(0.96)`. Label/icon slots keep fixed width across loading/copied states.
- **Quiet typography.** Body 13.5-15px, muted secondary text, tabular-nums on every changing number, mono for technical values. Concrete copy: real numbers, real commands; no vague claims, fake testimonials, or badge clouds.
- **Zero-shift motion.** Animate only transform/opacity/filter; reserve dimensions (fixed heights, aspect-ratio, width-locked labels); overlay state swaps in the same grid area; gate hover effects behind `(hover:hover)`; respect prefers-reduced-motion.
- **Accessibility floor.** 40px minimum hit areas (visually small controls get invisible padding), visible :focus-visible ring, semantic HTML.

## Anti-patterns

- Oversized generic hero + three equal feature cards + logo wall by reflex
- Defaulting to the same centered 440px white/zinc column for every product
- Purple-blue AI gradients, uncontrolled rainbow accents, decorative dashboards
- Perpetual ambient animation competing with the primary CTA
- Adding a JS library for an effect two lines of CSS can do

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/Danilaa1/compact-landing-skill (MIT)
