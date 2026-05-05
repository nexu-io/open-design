---
name: web-prototype-taste-brutalist
description: Swiss industrial-print web prototype. Newsprint canvas, monolithic black grotesque, viewport-bleeding numerals, hairline grid dividers, hazard-red accent, ASCII syntax decoration. Distilled from Leonxlnx/taste-skill `brutalist-skill` (Swiss Industrial Print mode).
---

# Web Prototype — Industrial Brutalist (Swiss Print)

For briefs that ask for "editorial", "newspaper", "agency portfolio", "Swiss design", "manifesto site", or anywhere the goal is to project rigor and physicality rather than friendliness. This skill commits to ONE substrate (light Swiss print) — never mix with the dark CRT mode in the same artifact.

## Source

Distilled from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — `skills/brutalist-skill/SKILL.md` §2.1 (Swiss Industrial Print). For decks that lean into the dark CRT mode, see `skills/html-ppt-taste-brutalist/`.

## Hard rules

- **Substrate:** unbleached newsprint `#F4F4F0` or `#EAE8E3`. Foreground `#050505` carbon ink.
- **Accent:** ONE color — aviation/hazard red `#E61919`. Used on dividing rules, strikes, alerts. Never as a fill on large surfaces.
- **Display type:** heavy neo-grotesque (Archivo Black / Inter ExtraBold/Black / Neue Haas Grotesk Black). Fluid scale `clamp(4rem, 10vw, 15rem)`. Tracking `-0.04em`. Leading `0.88`. Uppercase only.
- **Micro type:** monospace (JetBrains Mono / IBM Plex Mono). Fixed `10–13px`. Tracking `0.1em`. Uppercase. Used for navigation, metadata, captions, coordinates.
- **Geometry:** `border-radius: 0` everywhere. 90° corners only.
- **Grid:** visible CSS grid with `gap: 1px` over an ink-colored background to render mathematically perfect 1px dividers.
- **Negative space:** asymmetric — hero has a viewport-bleeding numeral or letterform; data clusters are tightly packed.
- **ASCII syntax:** decorate sections with `[ LABEL ]`, `>>>`, `///`, registration `®` / trademark `™` as structural ornament.

## Banned

- `border-radius` above 0.
- Drop shadows, gradients, glassmorphism, glows.
- Centred body text. Justify or hard-left only.
- Color other than ink, paper, and the hazard red.
- Sans-serif body fonts other than Inter/Archivo/Plex/Mono. No "premium" grotesques here — this aesthetic predates them.
- Curved or "soft" iconography.
- AI cliché copy. Use clipped, declarative print-magazine voice.

## Required components

- **Top register strip:** monospace meta band — issue, date, coordinates — running edge to edge with hairline rules above and below.
- **Hero:** giant numeral or single word at viewport-bleeding scale on the left; right column packs three or four monospace metadata blocks.
- **Manifest section:** numbered theses (`01.` / `02.`) with hairline `<hr>` between each, hard-left aligned.
- **Data table or index** rendered with `display: grid; gap: 1px` on an ink background.
- **Specimen block:** typography demo — show the family/weight/case at three scales.
- **Closing colophon:** monospace block stating press, paper stock, edition, set type.

## Motion

This aesthetic is mechanical, not animated. Use motion only as a precision mechanism:
- `IntersectionObserver` reveal: instant `opacity 0 → 1`, no translate/blur.
- Optional ticker/marquee for the top register strip at constant speed.
- `:active` on links: invert ink/paper instantly. No transitions over `120ms`.
- Never animate page-level layout properties.

## Pre-flight

- [ ] Substrate is newsprint, foreground is carbon ink, only accent is hazard red
- [ ] All `border-radius` is `0`
- [ ] Display uses heavy grotesque at viewport-bleeding scale (≥ `8vw`)
- [ ] Micro UI uppercase monospace at fixed `10–13px`, `letter-spacing: 0.1em`
- [ ] At least one `display: grid; gap: 1px` ink-background module
- [ ] ASCII syntax decoration appears at least three times (`[ ... ]`, `>>>`, `///`)
- [ ] Numeric data uses tabular-nums + monospace — no proportional figures
- [ ] No emojis, no curves, no gradients, no shadow effects
