---
name: kimi-careers-screenshot-rebuild
description: Rebuild Kimi Careers-style recruitment landing pages from screenshots and recordings, preserving the black pixel-art stage, fixed-scene transitions, and Moonshot recruiting copy rhythm.
---

# Kimi Careers Screenshot Rebuild

Use this plugin when the user wants a Kimi Careers / Moonshot AI recruitment landing page, a screenshot-faithful rebuild, or an Open Design artifact that follows the visual system captured from `careers.kimi.com`.

## Behavior

- Treat screenshots and recordings as the source of truth for layout, timing, and motion.
- Use `assets/DESIGN-MANIFEST.json` and `assets/DESIGN-HANDOFF.md` for tokens, fonts, interaction notes, and implementation constraints.
- Prefer fixed full-viewport scenes over ordinary long-page section stacking when the reference behaves like scene transitions.
- Preserve the Kimi visual signatures:
  - black or near-black stage
  - white pixel typography
  - Bayer / 1-bit image texture
  - sparse Moonshot AI recruitment navigation
  - fixed-scene scroll transitions
  - restrained Kimi blue accents only when the source uses them
- Do not replace screenshot-accurate composition with generic canvas approximations unless the user explicitly asks for a reinterpretation.
- Do not use browser fallback fonts to fake the headline pixel font when fidelity matters. Use supplied image slices or the original `Fusion Pixel 12px Mono zh_hans` font file if available.

## Workflow

1. Inspect the provided screenshot, recording, or existing artifact before editing.
2. Build a scene-by-scene difference table when the user reports fidelity issues.
3. Restore a static screenshot-faithful baseline before adding motion.
4. Add motion only after the static composition is close.
5. Model motion as scroll-driven scene states, not generic fade/translate entrance effects.
6. Validate the artifact against the Kimi contracts in `assets/DESIGN-HANDOFF.md`.

## Inputs

- `artifactKind`: the requested output type, usually a landing page or recruitment microsite.
- `brief`: the product, recruiting, or campaign brief.
- `reference`: screenshots, recordings, or notes that define the scene sequence.
- `motionFidelity`: whether to prioritize static screenshot fidelity or scroll-transition fidelity.

## Example

See `examples/landing-screenshot-rebuild.html` for the packaged artifact from the source project.
