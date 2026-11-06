# Checklist

## P0

- `assets/template.html` exists and opens directly from disk.
- `example.html` is complete, hand-built, and uses realistic social analytics labels/values.
- Skill frontmatter uses `od.mode: template` and `od.scenario: live-artifacts`.
- Template supports dark/light switching without broken contrast.
- Core charts expose hover tooltip with explicit dimension + value.
- Line charts support pin point + drag range statistics.
- Shift+drag saves multiple ranges and updates A/B comparison insight.
- Insights panel updates on hover, pin, and range interactions.

## P1

- Mobile fallback stacks grids under 1260px.
- All sections render without external JS/CSS frameworks.
- Data narratives are consistent (platform cards, KPI row, and charts do not conflict).
- Visual style remains cinematic and glassmorphic while keeping readability.

## P2

- Tooltip avoids edge clipping in common viewport sizes.
- 3D/parallax and glow effects are subtle enough to avoid motion fatigue.
- Chart redraw after theme switch keeps interactions functional.
