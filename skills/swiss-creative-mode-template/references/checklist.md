# Swiss Creative Mode Template Checklist

## P0 (must pass before emitting `<artifact>`)

- [ ] `assets/template.html` exists and opens directly from disk.
- [ ] `example.html` exists and is a complete hand-built sample.
- [ ] Frontmatter is `od.mode: template`, `od.scenario: live-artifacts`,
      `od.preview.type: html`, and `od.outputs.primary: index.html`.
- [ ] Layout includes 3 scenes:
  - [ ] hero / title scene
  - [ ] four-step process scene
  - [ ] stack/architecture scene
- [ ] Slide navigation works with Prev/Next buttons and dot indicators.
- [ ] Theme toggle works (paper/dark) without page reload.
- [ ] Palette-cycle interaction updates accent colors across cards and chips.
- [ ] Hotspot interaction toggles contextual annotation/detail text.
- [ ] No sandbox-hostile hard dependencies:
  - [ ] no unguarded `localStorage` / `sessionStorage`
  - [ ] no `alert()` / `confirm()` / `prompt()`

## P1 (quality bar)

- [ ] Typography hierarchy is clear (display title, section title, body copy, labels).
- [ ] Spacing rhythm is consistent and grid-aligned.
- [ ] Colors preserve contrast in both themes.
- [ ] Interactions are smooth and non-blocking.
- [ ] Template remains fully usable with keyboard (button focus + Enter/Space on controls).

## P2 (polish)

- [ ] Scene transitions feel deliberate and editorial (no abrupt jump cuts).
- [ ] Labels/copy are realistic and not generic placeholders.
- [ ] Template is presentation-ready without external assets or build tooling.
