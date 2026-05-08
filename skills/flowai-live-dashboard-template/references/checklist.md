# Checklist

## P0

- `assets/template.html` exists and opens directly from disk in a browser.
- `example.html` is a complete, hand-built sample with real labels, names, and values.
- Skill frontmatter is `od.mode: prototype`, `od.scenario: operations`,
  `od.preview.type: html`, `od.design_system.requires: true`.
- All three tabs (`Team Members`, `Team Details`, `Activity Log`) switch
  correctly; only one view is visible at a time.
- Role bar chart animates with easing on first reveal of the details tab.
- Chart hover tooltips show precise label and value.
- Panels/cards zoom in/out via click; clicking the backdrop or pressing
  Esc restores the layout.
- Dark mode toggle works and chart strokes/labels remain legible (chart
  colors are re-derived from CSS variables on toggle, not baked in).
- No external avatar / photo CDN dependencies; avatars are inline SVG or
  initial badges.

## P1

- "Export CSV" exports every row currently rendered in the team table,
  including the `Workflow` column (driven by the table DOM, not a hardcoded
  fixture).
- Layout collapses gracefully on narrow viewports: under 1300px the main
  grid stacks to a single column and stat cards fall back to two columns;
  under 720px stat cards stack to one column and tabs wrap.
- Colors and spacing inherit from root tokens / CSS variables; no
  hardcoded hex values inside chart drawing code.

## P2

- Tooltip avoids viewport edge clipping.
- Chart values animate smoothly on re-render after a theme switch.
- Tab state is reflected in the URL hash and survives a refresh.
