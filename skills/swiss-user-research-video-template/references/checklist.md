# Checklist

## P0

- `assets/template.html` exists and opens directly from disk.
- `example.html` is complete and uses realistic user-research labels and values.
- Skill frontmatter uses `od.mode: template` and `od.scenario: live-artifacts`.
- Exactly three slides are present, and nav dots reflect active slide.
- Keyboard navigation works (`ArrowLeft` / `ArrowRight`) and click navigation works.
- Participant donut and legend percentages are consistent (sum to 100%).
- No sandbox-hostile APIs are used (`localStorage`, `sessionStorage`, `alert`, `confirm`, `prompt`, `window.open`).

## P1

- Visual language stays Swiss-editorial: warm paper tone, thin rule lines, restrained typography.
- Motion remains subtle and legible: no looping flashy effects or jitter.
- Layout remains readable on common laptop widths (>= 1280px) without overlap.
- Right-panel evidence card in slide 3 includes caption and not just decorative framing.

## P2

- Dot navigation is clearly visible on both light and dark room environments.
- Legend hover emphasis does not hide percentage values.
- Slide transitions feel consistent in duration and easing.
