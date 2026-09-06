# OpenAI Astra Usage

Package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for visual intent, the scroll choreography, and anti-patterns.
3. Paste `tokens.css` into the first artifact `<style>` block before writing component CSS.
4. Open `components.html` when exact recipes matter: hero chrome, pill buttons, copy column, shape cue.
5. Inspect `preview/` pages for a visual sanity check of colours, type, and spacing.

## Design Highlights

- Pure black canvas (`#000000`) under a living galaxy; white text, white-at-alpha secondaries
- One typeface (OpenAI Sans, Inter fallback) at weight 500 for headings, 400 for body
- Monochrome pill chrome: white CTA, 12% glass pills, 20% hairlines
- The only chroma is the ambient glow (`#23435f`) and the star palette; neither is UI colour
- Scroll is the narrative: tilt, scatter to side rails, re-form into cursor and knot shapes

## Do

- Preserve the schema token names exactly so cross-brand switching stays reliable.
- Keep the canvas black. Do not lift it to `#0a0a0a` "for softness"; the glow does that job.
- Reserve a content column (max 676px) in the middle of the viewport so the star rails can flank it.
- Use `--accent` (white) for exactly one primary action per screen; everything else is glass.
- When the page needs the particle engine, pair this system with the `starflow-launch` skill.

## Avoid

- Avoid raw hex values outside the copied `:root` token block.
- Avoid gradients, coloured buttons, or tinted cards; the system is monochrome by design.
- Avoid drop shadows for depth; use glass fills, hairlines, and glow.
- Avoid scroll-jacking or parallax on copy; only the stars respond to scroll.
- Avoid claiming affiliation; this is an independent distillation of public CSS.
