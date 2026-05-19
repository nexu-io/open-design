# Checklist

## P0

- `assets/template.html` exists and opens directly in a browser.
- `example.html` previews both the editable template and `assets/default-showcase.mp4`.
- Skill frontmatter uses `od.mode: template`, `od.surface: video`, and `od.type: hyperframes`.
- Composition is vertical 9:16, 1080x1920, with exactly 12 scenes.
- Every scene has direct `class="scene clip"` plus explicit `data-start`, `data-duration`, and `data-track-index` attributes.
- Rendered MP4 is not blank: contact sheet must show visible content in all 12 scenes.
- No scene has text/component overlap at 1080x1920.
- Timeline is deterministic: no unseeded randomness and no infinite repeats.
- Template avoids sandbox-hostile APIs (`localStorage`, `sessionStorage`, `alert`, `confirm`, `prompt`).

## P1

- Motion feels like flipping through a reading journal: calm page reveals, highlight strokes, note cards, and bookmark accents.
- Key stats remain legible after video compression on mobile social feeds.
- Scene holds stay between 2.8 and 4.2 seconds by default.
- The final persona card is strong enough to serve as a social sharing frame.

## P2

- Keyboard preview controls (`1`-`9`, `0`, `-`, `=`, `r`) jump to scenes locally.
- The template can be adapted to non-WeRead reading data without changing the visual system.
- Static fallback remains readable if GSAP fails to load.

