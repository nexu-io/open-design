---
name: html-ppt-taste-brutalist
description: 16:9 HTML deck in tactical-telemetry / CRT-terminal taste. Deactivated-CRT charcoal slides, white-phosphor monospace, hazard-red accent, scanline overlay, ASCII syntax, density over decoration. Distilled from Leonxlnx/taste-skill `brutalist-skill` (Tactical Telemetry mode).
---

# HTML PPT — Tactical Telemetry / CRT Terminal

A 16:9 deck for project debriefs, security reviews, infra incident write-ups, ops walkthroughs, and any "we are not selling, we are reporting" presentation. Reads like a declassified mission packet, not a pitch deck.

This skill commits to ONE substrate (dark CRT) — never mix with the light Swiss-print mode in the same artifact.

## Source

Distilled from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — `skills/brutalist-skill/SKILL.md` §2.2 (Tactical Telemetry & CRT Terminal). Deck system follows the project's existing `html-ppt` convention (16:9 slides, vertical-stack fallback when opened directly).

## Hard rules

- **Substrate:** deactivated-CRT charcoal `#0A0A0A` / `#121212`. Never pure black.
- **Foreground:** white phosphor `#EAEAEA`. Secondary `#9A9A98`.
- **Accent:** ONE color — hazard red `#E61919`. Used on alerts, classifications, the latest data point. Never as a slide background fill.
- **Optional:** terminal green `#4AF626` for ONE specific UI element across the entire deck (e.g. a single status indicator). Omit if it doesn't earn its place.
- **Type:** monospace dominates. JetBrains Mono / IBM Plex Mono for body and meta. Heavy condensed grotesque (Archivo Black / Inter Black) only for slide titles.
- **Title scale:** `clamp(56px, 7vw, 96px)`, uppercase, tracking `-0.04em`, leading `0.9`.
- **Geometry:** `border-radius: 0`. Visible 1px hairlines (`#2A2A28` on charcoal). Use `display: grid; gap: 1px` over a hairline-colored background to render perfect cells.
- **Scanline overlay:** subtle `repeating-linear-gradient` at `2px / 4px` cycle, opacity ≤ `0.08`, applied as a fixed pointer-events-none layer.
- **Phosphor noise:** optional SVG-grain pseudo-element, opacity ≤ `0.06`.
- **Slide chrome:** every slide carries top register strip — classification, slide ID, timestamp, coordinates — and a bottom bar with serial number + page.

## Banned

- `border-radius` above 0.
- Drop shadows, gradients, glassmorphism, glow.
- Color other than charcoal, phosphor, hazard red, and at most one terminal-green element.
- Sans-serif body fonts. Monospace is the body.
- Pitch-deck "delight" — emoji, illustration, stock photography, friendly icons.
- Light-mode slides anywhere in the same deck.
- Slide transitions other than instant cuts.

## Required slide archetypes (10–14 total)

1. **Classification cover** — giant numeral or call-sign on the left, redaction bar above the title, mono meta column on the right.
2. **Briefing strip** — eight-cell mono register with mission ID, dates, principals, classification.
3. **Numbered objectives** — three to five hairline-separated theses, each with `>>>` marker.
4. **Telemetry grid** — `display: grid; gap: 1px` of mono key-value cells; red highlight on the variant that breaks the trend.
5. **Threat / risk register** — hairline table with severity column in red.
6. **Sequence / timeline** — vertical mono list, 2-px vertical rule on the left, hazard markers on critical events.
7. **Diagram / wiring** — pure-CSS box-and-line schematic; rectangles with hairlines, ASCII arrows.
8. **Specimen** — single mono character or word at viewport-bleeding scale, used as a visual fulcrum.
9. **Alert** — diagonal hazard-stripe block (`repeating-linear-gradient(135deg, ...)`) with the most important sentence in the deck.
10. **Audit log** — append-only mono entries with timestamp + actor + event.
11. **Closing colophon** — operator, system, build, classification, sign-off line.

## Motion

This aesthetic is mechanical and instant.
- Cuts between slides — no fades. Optionally a 60ms flicker (`opacity: 0.85 → 1`).
- A blinking caret on the cover (`▌`) and a single pulse on the live status dot. Nothing else moves.

## Pre-flight

- [ ] Substrate is charcoal, foreground is phosphor, only accent is hazard red
- [ ] All `border-radius` is 0; all corners are 90°
- [ ] Title slide includes classification + serial + timestamp + coordinates
- [ ] At least one `display: grid; gap: 1px` telemetry module
- [ ] Scanline overlay applied as fixed pointer-events-none element, opacity ≤ 0.08
- [ ] At least one diagonal hazard-stripe alert block
- [ ] ASCII syntax decoration (`[ ... ]`, `>>>`, `///`) appears at least four times across the deck
- [ ] Numeric data uses tabular-nums + monospace
- [ ] No emojis, no curves, no gradients, no shadow effects
- [ ] Terminal green appears on zero or one element only — never as text body color
