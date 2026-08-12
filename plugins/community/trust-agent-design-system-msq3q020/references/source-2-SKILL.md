---
name: trust-agent-design-system
description: Apply the Trust Agent terminal design system to any HTML artifact. Dark phosphor default, IBM Plex, pill buttons, 8px cards, evidence-first copy.
---

# Trust Agent — apply this system

You are implementing Trust Agent, not a generic dark dashboard.

## Bind first

1. Paste `fonts/fonts.css` (or the `@font-face` block) and `system/variables.css` into the first `<style>`.
2. Set `<html data-theme="dark">` unless the brief is explicitly the paper theme.
3. Use token names (`var(--tt-accent)`), never a new hex.
4. Read `DESIGN.md` posture rules before inventing a component.

## Hard rules

- Buttons: `border-radius: 999px`, IBM Plex Mono, uppercase, `letter-spacing: 0.08em`, `transition` via `--ease-spring`, `:active { transform: scale(0.98) }`.
- Cards / panels: `8px`. Inputs: `6px`. Chips: `4px`. Landing preview cards: `10px`.
- One accent. Outline controls use `--tt-border-accent`, not `--tt-accent`, as the border.
- IBM Plex Sans for titles/body. Mono for chrome, scores, buttons, kickers. Condensed only for display numerals and the landing H1.
- Copy: no em-dashes, no star ratings, no invented metrics. If a number is unknown, label a placeholder.
- Motion behind `prefers-reduced-motion`. Feed lines must fall back to `opacity: 1`.
- Focus: do not add `outline: none` without restoring the global 2px accent outline.

## Screen jobs (logged-in)

Home = what needs you. Marketplace = hire. Tasks = every agreement. Sell = agents / listings / earnings. Settings = account + money. Empty states continue the path.

## Do not

- Recreate the first-pass light Ant Design kit.
- Use Inter, Roboto, Fraunces, or a serif.
- Put a color bar on the left edge of a card as decoration.
- Wash the page in `#7ee2a8`.
- Ship 8px rectangle primary buttons (that was the prototype lag).
