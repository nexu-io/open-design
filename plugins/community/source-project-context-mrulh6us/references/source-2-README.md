# Ixigo Flight Booking UI — Design System

A reusable Open Design design-system package generated from the "Ixigo Flight Booking UI" prototype project (`a4b376d0-5b42-4024-af98-faedbcf9cbc2`).

## Product Overview

The source product is a 6-screen responsive web prototype covering the full domestic flight-booking journey for the India/INR market: search → results → fare & seat selection → traveller details → payment → confirmation. It supports origin/destination autocomplete, one-way/round-trip/multi-city search, trip filtering and sorting, seat-map and meal/baggage add-ons, per-traveller forms with GST invoice fields, a multi-method payment flow (UPI/card/netbanking/wallet), and a boarding-pass-style e-ticket confirmation. The interface is built as a trust-first, blue-accented, data-dense OTA (online travel agency) experience — visual tokens were extracted directly from ixigo.com's live production CSS rather than guessed, and every price/time/duration is rendered in a distinct monospace font as the system's signature typographic tell. All flight and pricing data in the prototype is seeded sample data (no live booking connector), which this package documents explicitly so it is never mistaken for a real inventory feed.

Read **`DESIGN.md`** first — it is the authoritative spec (color, type, spacing, layout, components, motion, voice, anti-patterns). Everything else in this package implements or demonstrates it.

## Package Contents

| Path | What it is |
|---|---|
| `DESIGN.md` | Authoritative design spec — read this first. |
| `SKILL.md` | Agent-facing instructions for binding this system into a new build. |
| `colors_and_type.css` | Portable token layer — color, type, spacing, radius, shadow, motion custom properties. Drop into any new project's `<style>`. |
| `brand-spec.md` | Original brand extraction notes (source evidence: real hex pulled from ixigo.com's production CSS). |
| `context/source-context.md` | How this design-system project relates to its source prototype project. |
| `context/provenance.md` | Exactly which tokens/assets are real (pulled from ixigo.com) vs. reconstructed, and what is sample data. |
| `assets/design-system.css` | The source prototype's full shared stylesheet (tokens + layout + every component class) — preserved as source evidence and reused by the preserved screens. |
| `assets/app.js` | The source prototype's shared state/mock-data module (seeded flight generator, INR formatting, localStorage flow state). Preserved as source evidence. |
| `assets/logo/` | Brand mark assets (wordmark + app-icon mark) reconstructed as real SVG files from the CSS-drawn logo in the source screens. |
| `preview/` | Focused, standalone HTML review cards — colors, typography, spacing, radius/shadows, components, brand assets, applied UI surfaces. Open any file directly in a browser. |
| `ui_kits/app/` | An applied interface kit: an index page plus standalone component files (search widget, flight result card, flight-summary preview card, price summary, payment method switcher) assembled from the real source markup. |
| `index.html`, `flight-search.html`, `flight-results.html`, `flight-details.html`, `traveler-details.html`, `payment.html`, `booking-confirmation.html` | The original 6-screen prototype flow, preserved verbatim as the highest-fidelity source example. Start at `flight-search.html` — state carries forward via `localStorage` (see `assets/app.js`). |

## Source Context

This package was generated entirely from a local Open Design project (`a4b376d0-5b42-4024-af98-faedbcf9cbc2`, "Ixigo Flight Booking UI"), not a linked GitHub repository. The copied files (6 HTML screens, `assets/design-system.css`, `assets/app.js`, `brand-spec.md`) are the primary evidence — see `context/source-context.md` for the intake manifest and `context/provenance.md` for exactly which values trace back to ixigo.com's real production CSS versus a documented substitution.

## Preview Manifest

Focused, standalone review cards under `preview/` — open any file directly in a browser:

- `preview/colors-primary.html` — surface/text/brand/state color tokens as live swatches.
- `preview/typography-specimens.html` — the two type families, the full type scale, and the numerics-in-mono convention applied.
- `preview/spacing-tokens.html` — the spacing scale, card rhythm, and container width.
- `preview/radius-shadows.html` — radius tokens and the three shadow levels.
- `preview/components-buttons.html` — buttons, tab/pill groups, chips, and the booking stepper.
- `preview/components-forms.html` — form fields (default/focus/invalid) and radio-card selection.
- `preview/brand-assets.html` — the wordmark and app-icon mark, plus the live CSS-drawn header logo.
- `preview/applied-surfaces.html` — live thumbnails of all 6 real preserved screens.

## Reuse Workflow

1. Read `DESIGN.md` in full.
2. Paste `colors_and_type.css`'s `:root` block into your new file's first `<style>` tag (or `<link>` it directly).
3. Copy component shapes from `assets/design-system.css` and `ui_kits/app/` rather than writing CSS from scratch — match class names where practical (`.card`, `.btn-primary`, `.chip-*`, `.price-summary`, etc.).
4. Keep the numeric-in-mono convention (DESIGN.md §3) — it's the system's strongest brand tell.
5. If you need real flight/pricing data, replace `assets/app.js`'s `generateFlights()` — everything downstream (results, details, payment, confirmation) currently runs on seeded sample data, not a live connector.

Reviewers inspecting this package for the first time should open, in order: `preview/colors-primary.html` and `preview/typography-specimens.html` (the token foundation), `preview/components-buttons.html` and `preview/applied-surfaces.html` (components in context), `ui_kits/app/index.html` (the applied kit), then `flight-search.html` to click through the live flow (the full-fidelity source example).
