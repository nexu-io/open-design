---
name: web-prototype-taste-editorial
description: Editorial-minimalist web prototype. Warm monochrome canvas, serif display + grotesque body, 1px hairline borders, muted pastel chips, generous macro-whitespace, ambient micro-motion. Distilled from Leonxlnx/taste-skill `minimalist-skill`.
---

# Web Prototype — Editorial Minimalism

A single-page web prototype shaped like a Notion/Linear marketing site or premium documentation surface. Use when the brief asks for "clean", "editorial", "premium SaaS", "documentation", or "knowledge product".

## Source

Distilled from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — `skills/minimalist-skill/SKILL.md` and the spatial-rhythm rules in `skills/taste-skill/SKILL.md`. See `example.html` in this directory for a fully-realized template.

## Hard rules

- **Canvas:** warm off-white (`#FBFBFA` or `#F7F6F3`), never pure white.
- **Foreground:** off-black `#111111`, secondary text `#787774`. Never `#000000`.
- **Borders:** `1px solid #EAEAEA` only. No drop shadows above `0 1px 2px rgba(0,0,0,0.04)`.
- **Type pairing:** display in editorial serif (Instrument Serif / Newsreader / Lyon), body in grotesque (Geist / Switzer / SF Pro), monospace for meta/keystrokes (Geist Mono / JetBrains Mono).
- **Display tracking:** `letter-spacing: -0.025em`, `line-height: 1.05`.
- **Pastel chips only:** muted backgrounds (`#FDEBEC`, `#E1F3FE`, `#EDF3EC`, `#FBF3DB`) for tags/badges. Never as section backgrounds.
- **Containers:** `border-radius: 8–12px` max. No pill containers, no `rounded-full` on cards.
- **Section padding:** `py-24` minimum, `py-32` for hero.

## Banned

- Inter, Roboto, Open Sans (use Geist / Switzer / SF Pro).
- Generic Lucide thin-stroke icons (use Phosphor Bold or Radix).
- Gradients, neon, glassmorphism beyond a subtle navbar blur.
- Drop shadows above `shadow-sm`. No glows.
- Generic placeholder names (John Doe / Acme / Lorem). Use specific contextual content.
- AI copy clichés: "Elevate", "Seamless", "Unleash", "Next-Gen".
- Pure black `#000000`.
- Centered hero H1 over a dark image.

## Required components

- Sticky pill navbar (translucent off-white, `backdrop-blur-md`, hairline border).
- Asymmetric hero: serif display left-aligned, eyebrow tag above, lede paragraph at `max-w-[52ch]`.
- Bento feature grid with **uneven row heights** and visible `1px` dividers — never 3 equal cards.
- A "what it isn't" or contrast block separated by `border-t` only, no card.
- Pricing or signup band with one accent CTA.
- Footer: monospace metadata, single hairline above.

## Motion (subtle only)

- Scroll entry: `translateY(12px) → 0` + `opacity 0 → 1` over `600ms cubic-bezier(0.16, 1, 0.3, 1)`. `IntersectionObserver` only.
- Hover lift on cards: `box-shadow` from `0 0 0` to `0 2px 8px rgba(0,0,0,0.04)` over `200ms`.
- Stagger lists by `--index * 80ms`.
- Animate only `transform` and `opacity`.

## Pre-flight

- [ ] Serif display + grotesque body pairing present
- [ ] Canvas is warm off-white, foreground is off-black
- [ ] All cards/dividers use `1px solid #EAEAEA`
- [ ] At least one asymmetric layout (split, eyebrow tag, uneven bento)
- [ ] Pastel chips used only for tags, never as block backgrounds
- [ ] Section padding ≥ `py-24`
- [ ] No emojis, no banned fonts, no AI clichés
