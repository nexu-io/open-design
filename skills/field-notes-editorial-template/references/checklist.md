# Field Notes Editorial Template Checklist

## P0 (must pass before emitting `<artifact>`)

- [ ] Single-file HTML output (`<!doctype html>`, inline CSS/JS, no build step).
- [ ] `assets/template.html` exists and can be copied directly to `index.html`.
- [ ] `example.html` renders directly from disk with no server.
- [ ] Visual style includes paper background, serif headline typography, and rounded pastel cards.
- [ ] Includes three report views: key metrics, insights cards, retention chart.
- [ ] Includes bottom navigation / pager UI to switch views.
- [ ] Key metric numbers animate from zero on initial render.
- [ ] Retention chart has x-axis labels, y-axis labels, and a legend with named series.
- [ ] No sandbox-hostile APIs without safe guards (`localStorage`, `alert`, `confirm`, `prompt`, `window.open`).
- [ ] Placeholder values stay honest (`—` when unknown), no fabricated claims.

## P1 (quality bar)

- [ ] Typography hierarchy is clear (display, section heading, body, caption).
- [ ] Spacing rhythm is consistent and balanced.
- [ ] Contrast is readable on pastel cards and chart panel.
- [ ] Motion is subtle and non-blocking (< 1.2s per micro animation).
- [ ] Layout remains readable at 1366x768 and 1920x1080.

## P2 (polish)

- [ ] Hover states exist for cards and nav controls.
- [ ] Chart line reveal eases smoothly (no sudden jump).
- [ ] Footer metadata (date / volume / page marker) appears on all views.
