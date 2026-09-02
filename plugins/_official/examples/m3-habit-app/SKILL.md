---
name: m3-habit-app
description: Material Design 3 mobile app home screen (Android-style) with a green tonal seed scheme, top app bar, primary-container streak card, checkbox habit list, tonal FAB, and bottom navigation bar in an iPhone-style device frame.
---

# Material 3 Habit Tracker

A habit-tracking mobile app first screen built strictly on Google's Material Design 3: a centered iPhone-style device frame, a scheme generated from a green tonal seed, tonal surface layering, pill-shaped navigation, and M3 component anatomy (top app bar, FAB, navigation bar, list items, checkboxes).

## When to use

- Briefs mentioning "material design", "MD3", "material you", "android app", "mobile app", "habit tracker", "daily checklist", "streak"
- Personal productivity, wellness, routine, or self-tracking app mockups
- Any phone-frame prototype that should feel like a native Android (Material You) app

## Style rules

- **Device frame.** The app renders inside an iPhone-style device frame (black rounded bezel + Dynamic Island + status bar with 9:41 / 5G / battery); generated output must keep this frame. The frame is 390x740 with a 12px black bezel, 56px outer corners, and a 44px-radius screen; the status bar uses `surface` / `on-surface` tokens.
- **Phone screen.** The screen fills the frame with `surface`, centered on a `surface-container` backdrop. Content = status bar, top app bar, scrollable body, bottom navigation bar pinned to the bottom edge of the frame; FAB floats above the nav bar (right: 20px, bottom: 100px).
- **Tokens first.** Every color is a `--md-sys-color-*` custom property from one green-seed light scheme: primary #3B6939, primary-container #BCF0B4 / on-primary-container #002204, secondary-container #D5E8CF, tertiary-container #BCEBF0, surface #F7FBF1, on-surface #191D17, on-surface-variant #424940, outline #72796F, outline-variant #C2C9BD. Never hardcode a hex at the point of use, and only pair roles with their `on-` partners.
- **Tonal elevation.** No box shadows anywhere. Depth ladder: page backdrop `surface-container`, phone `surface`, habit rows `surface-container-low`, hover washes `surface-container-high`, nav bar `surface-container`.
- **Shape ladder.** Checkboxes 4px, habit rows and icon tiles 12px (medium), streak card and FAB 16px (large), phone frame 28px (extra-large), pills/avatar/day dots 9999px (full). FAB morphs 16px to full radius on hover with `cubic-bezier(0.2, 0, 0, 1)` at 200ms.
- **Typography.** Roboto Flex (Google Fonts) with `Roboto, 'Segoe UI', system-ui, sans-serif` fallback. App bar title 22px/500, streak number 44px/700 with tabular-nums, list titles 15px/500, metadata 12px in on-surface-variant, nav labels 12px/500 with 0.5px letter-spacing.
- **Streak card.** The hero moment: primary-container fill, on-primary-container text, oversized count, and a 7-dot week row where completed days are solid `primary` circles with `on-primary` letters.
- **Habit list.** Each row: a 40px tonal icon tile (alternating secondary-container / tertiary-container), name + meta text, and an M3 checkbox (22px, 2px `outline` border; checked = filled `primary` with an on-primary check mark). Completed rows strike through the name and drop it to on-surface-variant.
- **Bottom navigation bar.** 80px tall on surface-container, 3 destinations, each a 64x32 pill (secondary-container when active) above a 12px label; active label darkens to on-surface at weight 600.
- **Section headers.** 14px/600 label with a right-aligned "n / m done" counter in on-surface-variant tabular figures.

## Anti-patterns

- Drop shadows for elevation; MD3 here is purely tonal
- iOS styling: translucent bars, SF-style segmented controls, blue links
- Raw hex colors inline instead of `--md-sys-color-*` tokens, or mismatched role pairs
- Radii outside the 4/8/12/16/28/full ladder, or sharp corners
- Gradients, glassmorphism, neon accents, or more than the one seed-derived palette
- Cramming multiple screens into the frame; this is one focused home screen

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Original page authored for OpenDesign following https://github.com/hamen/material-3-skill (MIT); Material Design 3 is an open specification by Google
