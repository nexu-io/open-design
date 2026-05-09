# Checklist

## P0

- `assets/template.html` exists and opens directly from disk.
- `example.html` renders the default sample in an iframe without a build step.
- SKILL frontmatter uses `od.mode: template`, `od.scenario: live-artifacts`, and `od.outputs.primary: index.html`.
- The template preserves a three-page editorial narrative in one scene flow.
- Each page dwell is <= 3 seconds in the default timeline.
- Includes high-end transitions (multi-column wipe) and layered text reveal motion.
- Includes ambient cinematic finish (film grain, vignette, frame chrome).
- No sandbox-hostile APIs (`localStorage`, `sessionStorage`, `alert`, `confirm`, `prompt`, `window.open`).

## P1

- Local preview supports keyboard chapter jumps (`1`,`2`,`3`) and reset (`R`).
- Cursor-follow glow interaction is smooth and non-blocking.
- Typography hierarchy clearly separates kicker, display serif, and metadata labels.
- Color system stays constrained to dark base + single magenta accent.

## P2

- Scene transitions remain readable at 30fps export.
- Small metadata text remains legible on a 1080p canvas.
- Decorative effects (grain/glow) do not overpower core copy.
