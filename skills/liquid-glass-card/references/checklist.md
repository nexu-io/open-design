# Liquid-glass — pre-emit checklist (P0 gates)

Run every gate below **before** emitting the artifact. Each is a hard gate: if
it fails, fix the output and re-check — do not ship a glass surface that fails
any P0 item.

## P0 — must pass

1. **Distortion is visible.** The glass surface sits over imagery, an aura, or a
   gradient — never a flat solid fill (over a flat color the `feDisplacementMap`
   has nothing to bend and the effect reads as a plain blurred box).
2. **Stacking context is isolated.** Every glass root sets `isolate` (or an
   equivalent non-negative layering) so the `-z-10` distortion layer paints
   over the container background, not behind it or an ancestor.
3. **Fallback is wired.** A non-Chromium fallback is present: `backdrop-filter:
   blur() saturate()` plus the inset edge-shadow stack render a legible glass
   surface even when `backdrop-filter: url(#…)` is unsupported (Safari/Firefox).
   No information is conveyed by the distortion alone.
4. **Contrast holds.** Foreground text on the glass surface meets WCAG AA (4.5:1
   for body, 3:1 for large text) against the *effective* backdrop, not just the
   tint. Verify against the busiest region of the background behind the card.
5. **Tokenized to the active brand.** The `--lg-*` custom properties (canvas,
   foreground, accent, radius) are set from the active DESIGN.md — the demo's
   NIX-flavored defaults are not shipped on another brand.

## P1 — should pass

6. **Responsive.** The surface holds at mobile widths (≤380px): padding, radius,
   and any control row reflow without clipping; touch targets ≥44px.
7. **Interactive controls are accessible.** Any slider/button carries correct
   ARIA and full keyboard support (a `role="slider"` handles Arrow/Home/End,
   not just Enter/Space) — or is a native control.
8. **Motion restraint.** The filter itself is not animated (GPU-costly); one
   shared `<filter>` def per document, referenced by id.
