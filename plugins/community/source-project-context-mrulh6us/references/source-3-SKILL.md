---
name: ixigo-flight-booking-ui-design-system
description: Ixigo-style flight booking design system — trust-first, blue-accented, data-dense OTA visual language for the India/INR domestic flight market. Use whenever building or editing screens in this design system's bound project (flight search/results/details/booking, or any travel/OTA-flavored booking flow reusing these tokens).
user-invocable: true
---

# Ixigo Flight Booking UI — design-system skill

Agent-facing usage instructions. `DESIGN.md` is the authoritative spec; this file is the workflow layer on top of it.

## What's inside

- `DESIGN.md` — the authoritative rules document (color, typography, spacing, layout, components, motion, voice, anti-patterns).
- `colors_and_type.css` — the portable token layer (colors, fonts, type scale, spacing scale, radius, shadow, motion).
- `assets/` — preserved source stylesheet (`design-system.css`), shared state module (`app.js`), and brand mark assets (`logo/`).
- `preview/` — focused review cards for colors, typography, spacing, radius/shadows, components, and applied surfaces.
- `ui_kits/app/` — an applied interface kit (index page + standalone components) assembled from the real source markup.
- The 6 preserved screen files at the project root (`flight-search.html` through `booking-confirmation.html`) — the full-fidelity source example of the booking flow.

## Source context

This design system was extracted from the "Ixigo Flight Booking UI" prototype project — a 6-screen domestic flight booking flow (search → results → fare & seat → traveller → payment → confirmation) for the India/INR market, visually based on ixigo.com. Color and font tokens were pulled from ixigo.com's real production CSS, not guessed — see `context/provenance.md` for exactly what's real evidence versus a documented substitution, and `brand-spec.md` for the original extraction notes.

## When to use this skill

Use this skill when building or editing prototypes, mockups, or production interfaces that extend this ixigo-style flight/travel booking flow, or any similarly data-dense OTA-style booking design that should reuse this system's tokens and components rather than starting from scratch.

## How to use

1. Read `DESIGN.md` in full before writing any layout.
2. Paste `colors_and_type.css`'s `:root` custom-property block (plus its Google Fonts `@import`) into the new file's first `<style>` tag — never re-derive or re-guess the hex/oklch values.
3. Copy component shapes from `assets/design-system.css` and `ui_kits/app/` rather than writing CSS from scratch — match class names where practical (`.card`, `.btn-primary`, `.chip-*`, `.price-summary`, `.stepper`, etc.).
4. For a full applied example of a component in context, open the matching file in `ui_kits/app/components/`, or the relevant screen at the project root, and copy its markup structure.
5. Reuse `assets/app.js` (`window.IxigoProto`) for shared state, INR formatting, and sample flight data rather than inventing new mock data inline.

## Design system highlights

- One accent (`--accent`, ixigo blue) drives every primary action and active state; `--warn` (orange) is reserved strictly for scarcity/urgency badges.
- Numerics — every price, clock time, duration, and PNR/flight code — render in `DM Mono`, never the `Plus Jakarta Sans` body font. This is the system's strongest brand tell.
- Spacing is data-dense and utilitarian (18–22px card padding, 12–14px field gaps), not airy marketing whitespace.
- Radius is soft (8–12px, full pill for tabs/chips) and shadows stay flat (`--shadow-card`/`--shadow-nav`), never heavy or colored.
- Layout follows a booking-stepper + sticky-price-summary pattern across every multi-step checkout screen, collapsing to single-column/bottom-sheet on mobile rather than squeezing the desktop grid.
- Interaction is understated: `translateY(1px)` button presses, `.18s ease` opacity/transform panel swaps, an inline spinner (not a page loader) for the pay button's loading state.

## Non-negotiable rules

See `DESIGN.md` for full rationale behind each of these:

1. **Numerics are always mono.** Any price, clock time, duration, or PNR/flight code gets `class="mono"` (or `var(--font-mono)`) — never the sans body font.
2. **One accent, `--accent`, drives every primary action and active state.** At most twice per screen as a solid fill (primary CTA + one active tab/pill).
3. **`--warn` (orange) is scarcity/urgency-only.** Never a second brand accent, never on a primary button, never blended into a gradient with `--accent`.
4. **Currency is always ₹ (INR)**, formatted with `en-IN` grouping — reuse `fmtINR()` from `assets/app.js`.
5. **Booking stepper on every post-search screen.** New funnel steps get inserted into the existing 6-step stepper, not a new wayfinding pattern.
6. **Sticky price summary on multi-step checkout screens.** Reuse `.price-summary` verbatim so the payable amount never changes shape between screens.
7. **Two-column desktop layouts collapse to single-column on mobile — they are never squeezed.** Follow the documented breakpoints (640/700/860/900/980px).
8. **All flight/pricing data is sample data** generated by a seeded PRNG in `assets/app.js`. Never present it as live/real without saying so.

## Workflow for a new screen in this flow

1. Copy the closest existing screen file (e.g. `flight-details.html` for another mid-funnel step) as a starting template — it already has the header, stepper, and stylesheet link wired up correctly.
2. Update the stepper's active/done states to reflect the new screen's position.
3. Pull shared state (`selectedFlight`, `travellers`, `fareTotal`, etc.) via `window.IxigoProto.getState()` / `.setState()` — this is how state survives across the separate screen files via `localStorage`.
4. Add a redirect-to-search guard at the top of the script block if the screen depends on upstream state not being present (every screen past `flight-search.html` does this already — match the pattern).
5. Run the self-check from the charter (layout integrity, no clipped mono numerics, stepper correctness, `data-od-id` on interactive/named regions) before handing off.

## Anti-patterns — do not do these

See DESIGN.md §9 for the full list. Most common mistakes to avoid when extending this system:
- Adding a gradient background as a "modern" touch — this system uses flat surfaces only.
- Setting a price or time in the sans font because it "reads fine" — it must be mono.
- Introducing a second saturated accent color for variety — there is exactly one (`--accent`).
- Building a new booking step without adding it to the stepper.
