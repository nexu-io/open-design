---
name: promax-pet-app
description: Warm claymorphic mobile app home screen with chunky bordered cards, offset clay shadows, rounded Fredoka display type, and an orange pet-tech palette.
---

# Pet Care Mobile App

A cheerful mobile-first companion app screen in a soft "clay" idiom: cream background, white cards with thick peach borders and double-layer offset shadows, one confident orange running through avatar, stats, dots, and the active tab. Everything is round, tactile, and thumb-sized.

## When to use

- Briefs mentioning "mobile app", "pet app", "companion app", "cute", "playful", "habit tracker", "daily log"
- Consumer app home screens built around one hero profile card plus quick actions and a timeline feed
- Any single-column phone layout (max-width 420px on desktop) with a fixed bottom tab bar

## Style rules

- **Device frame.** The app renders inside an iPhone-style device frame (black rounded bezel + Dynamic Island + status bar with 9:41 / 5G / battery) centered on the cream canvas; generated output must keep this frame. The frame is 390x740 with a 12px black bezel, 56px outer corners, and a 44px-radius screen; the status bar sits on the cream background in the burnt-sienna ink color.
- **Layout.** Inside the screen: single column, 20px side padding, flex column with the 72px bottom nav pinned to the bottom edge of the frame (in-flow, never fixed to the browser viewport). The content area between status bar and nav clips overflow like a real screen. Sticky header with a subtle background fade gradient.
- **Typography.** Fredoka (Google Fonts) for the logo, headings, section titles, and stat values; Nunito (`-apple-system, sans-serif` fallback) for everything else. Logo 1.5rem/700, hero name 1.5rem, section titles 1.1rem, body 0.85-0.95rem, labels and timestamps 0.75rem.
- **Color.** Background cream `#FFF7ED`, card white `#FFFFFF`, ink burnt-sienna `#9A3412`, muted slate `#64748B`, border peach `#FED7AA`. Primary orange `#F97316` with secondary `#FB923C`; blue `#2563EB` reserved as a rare accent. Action icon wells rotate soft pastel gradients (peach `#FED7AA→#FDBA74`, blue `#BFDBFE→#93C5FD`, green `#BBF7D0→#86EFAC`).
- **Radii.** Three-tier scale: hero/outer cards 28px, regular cards 20px, buttons and nav pills 16px; avatars and feed dots fully circular. Nothing sharp-cornered.
- **Clay shadows.** Two signature shadows: `--shadow-clay: 0 4px 0 0 rgba(154,52,18,0.12), 0 8px 24px -4px rgba(249,115,22,0.15)` for raised brand elements, `--shadow-card: 0 2px 0 0 rgba(154,52,18,0.06), 0 12px 32px -8px rgba(0,0,0,0.08)` for cards. The solid 0-blur offset layer is what makes surfaces read as clay; every card also wears a 2px `#FED7AA` border.
- **Components.** Hero card: centered 120px gradient circle avatar, name, subtitle, then a three-stat row (Fredoka value in orange over a tiny muted label). Quick actions: 3-column grid of bordered cards with 48px gradient icon wells. Feed: horizontal cards with time, a 12px orange dot, then bold title + muted detail. Bottom nav: four icon-over-label items; active item turns orange on a 12% orange pill.
- **Motion.** 0.2s ease only: icon buttons scale to 0.96 on hover, action cards lift `translateY(-2px)` with a deeper shadow, nav recolors. Always pair `:focus-visible` with a 2px `--ring` outline.

## Anti-patterns

- Cool grays, dark mode, or desaturated corporate palettes; the screen stays warm and cream
- Flat borderless cards or plain single-layer drop shadows; the solid offset shadow layer plus 2px border is mandatory
- Sharp corners, dense multi-column desktop layouts, or hiding the bottom tab bar
- Photographic imagery; mascots and icons are flat inline SVG shapes
- More than one saturated accent per element; blue and green appear only inside their own icon wells

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

Adapted from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT)
