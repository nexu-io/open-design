# Trading Analysis Dashboard Template Checklist

## P0 (must pass before emitting `<artifact>`)

- [ ] Single-file HTML output (`<!doctype html>`, inline CSS/JS, no build step).
- [ ] Dense trading layout exists: left sidebar + top status + multi-panel body.
- [ ] Light/Dark switch works and persists in `localStorage`.
- [ ] Live/Demo mode switch works (demo changes at least one KPI and one chart state).
- [ ] At least 2 chart regions include:
  - [ ] axis labels (x and y)
  - [ ] units / scale hints (e.g., `$`, `%`, `Δ`)
  - [ ] chart legends naming each plotted series
- [ ] At least one chart supports hover crosshair + tooltip-like readout.
- [ ] At least one chart supports click-to-focus (floating/overlay) and close.
- [ ] Risk cockpit panel shows exposure-style metrics (VaR/Beta/DD or equivalent).
- [ ] Trading workflow panel exists (`Signal -> Risk -> Order -> Fill` semantics).
- [ ] Placeholder values are honest (`—` if unknown), no fabricated marketing claims.

## P1 (quality bar)

- [ ] Typography hierarchy is explicit (display / title / body / mono number styles).
- [ ] Spacing rhythm is consistent (8px-ish system or similar).
- [ ] Professional financial tone (no toy-style icon overload).
- [ ] Theme contrast is readable under both light and dark.
- [ ] Motion effects are subtle and non-blocking.

## P2 (polish)

- [ ] Command palette (`/`) shortcuts included.
- [ ] Demo story sequence (step progression) is visible.
- [ ] Tables include state badges (good/neutral/risk).
- [ ] Dashboard feels presentation-ready without external assets.
