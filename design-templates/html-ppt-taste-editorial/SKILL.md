---
name: html-ppt-taste-editorial
description: 16:9 HTML deck in editorial-minimalist taste. Warm cream slides, serif display + grotesque body, hairline rules, monospace meta, generous macro-whitespace, one accent. Distilled from Leonxlnx/taste-skill `minimalist-skill`.
---

# HTML PPT — Editorial Minimalism

A 16:9 deck for the briefs that hate neon: investor updates, design reviews, internal manifestos, lecture decks. Reads like a print supplement, not a SaaS landing.

## Source

Distilled from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — `skills/minimalist-skill/SKILL.md`. The deck system follows the existing project convention from `skills/html-ppt-pitch-deck/example.html` (each `.slide` is a `100vw × 100vh` section; opened directly, slides stack vertically). See `example.html` in this directory.

## Hard rules

- **Substrate:** warm off-white `#FBFBFA` / `#F7F6F3`. Foreground off-black `#1A1A19`. Never pure white or pure black.
- **Type pairing:** display in **serif** (Instrument Serif / Newsreader / Lyon), body in **grotesque** (Inter Tight / Switzer), meta in **mono** (JetBrains Mono).
- **Display scale per slide:** title `clamp(56px, 6.5vw, 96px)` italic-capable serif, line-height `1.05`, tracking `-0.025em`.
- **Hairline only:** `1px solid #EAEAEA` — borders, dividers, table cells. No drop shadows.
- **One accent color** chosen from the muted-pastel pairs (e.g. sage `#346538` on `#EDF3EC`, or red `#9F2F2D` on `#FDEBEC`). Used sparingly — eyebrow dot, chart fill, call-out chip. Never as a slide background.
- **Slide padding:** generous (`72px 96px` minimum). Title at most 14ch wide.
- **Eyebrow:** every slide opens with a mono uppercase eyebrow `letter-spacing: 0.18em` and a section number `01 / 09`.
- **Page numbers:** mono, bottom-right corner.

## Banned

- Inter (use Inter *Tight* if you must, but prefer Switzer / SF Pro). No Roboto, Open Sans.
- Heavy drop shadows. Glow. Gradient text.
- 3-equal-card feature rows. Use uneven hairline-divided columns instead.
- Emojis in text or as bullet markers — use `—` or no marker.
- Full-bleed photography on every slide. Use one or two image slides; reserve them.
- AI-cliché copy ("Elevate", "Unleash", "Seamless", "Next-Gen").
- Slide transitions noisier than fade-in.

## Required slide archetypes (10–12 total recommended)

1. **Cover** — serif title, italic mid-sentence accent, mono meta footer.
2. **Eyebrow + thesis** — single sentence of body lede on the left; mono numbered TOC on the right.
3. **Numbered manifesto** — three or four hairline-separated theses.
4. **Bento data slide** — uneven 6-col grid with hairline gaps; one stat in serif, supporting in mono.
5. **Quote / pull-out** — single sentence at large serif, attribution mono, hairline above and below.
6. **Comparison** — two columns separated by a vertical hairline; "Doesn't / Does" or "Before / After".
7. **Table or index** — `display: grid; gap: 1px` on hairline color.
8. **Chart or breakdown** — flat horizontal bar chart with mono labels, accent fill only on the latest bar.
9. **Team / colophon** — mono key-value list, no avatars.
10. **Closing** — serif final line italic; CTA as ghost button; signature in mono.

## Motion

- Static-preview fallback: keep every slide visible (already wired by the deck base). When run as a real deck, fade-in at `400ms cubic-bezier(0.16, 1, 0.3, 1)` is plenty.
- No translate, no blur, no auto-advance.

## Pre-flight

- [ ] Substrate is warm off-white; foreground is off-black; never pure black/white
- [ ] Serif used on titles, grotesque on body, mono on meta — three families, three jobs
- [ ] One accent color, used at most three times in the whole deck
- [ ] Every slide has eyebrow + section number + page number
- [ ] At least one hairline-grid table or comparison module
- [ ] No drop shadows, no gradients, no emojis, no banned fonts
