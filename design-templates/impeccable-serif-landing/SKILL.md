---
name: "impeccable-serif-landing"
en_name: "Warm Serif SaaS Landing"
zh_name: "暖色衬线 SaaS 落地页"
description: "Warm cream SaaS landing with an oversized Fraunces serif hero, an italic accent word, a peach gradient ground, pill buttons, and a dark inverted CTA band."
zh_description: "暖奶油 SaaS 落地页：超大 Fraunces 衬线主视觉、斜体强调词、桃色渐变底、胶囊按钮、深色反转 CTA 带。"
triggers:
  - "saas landing"
  - "serif landing page"
  - "warm landing"
  - "cream landing page"
  - "product website"
  - "SaaS 落地页"
  - "衬线字落地页"
  - "暖色官网"
  - "产品官网"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "marketing"
  category: "landing-page"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Build a warm cream SaaS landing page for a team knowledge-base product: huge serif hero with an italic accent word, pill buttons, feature cards, and a dark CTA band."
---
# Warm Serif SaaS Landing

A friendly, editorial SaaS landing page that leads with type instead of screenshots: a huge
Fraunces serif headline with one italic accent word on a cream-to-peach gradient, a sticky
blurred nav, an italic serif logo strip, three soft feature cards, and a full-bleed dark CTA
band. Everything is round, warm, and quietly confident.

## When to use

- Briefs mentioning "SaaS landing", "warm", "friendly", "editorial serif", "big headline",
  "cream / beige palette", "not another dark gradient page"
- Products selling calm and craft: docs and knowledge tools, writing apps, planning tools,
  boutique services
- Any hero-first marketing page where a single sentence should carry the pitch

## Style rules

- **Color.** Cream ground `#faf6ef`, warm card surface `#f4ebdc`, peach gradient stop `#f6dfcb`,
  ink `#1f1a15`, soft text `#5b4f44`, hairlines `#e6dccb`. One burnt-orange accent pair:
  `#c8552b` with deep `#a8431f` for the eyebrow, the italic hero word, and icon strokes. The
  dark CTA band inverts to ink with cream text at 70% opacity for its lede.
- **Typography.** Display face Fraunces (variable optical size, fallback `Georgia, serif`),
  weight 400 for heroes: H1 `clamp(48px, 7vw, 88px)`, line-height 1.05, letter-spacing -0.02em,
  with exactly one `<em>` word italicized and colored `#a8431f`. Section H2s
  `clamp(36px, 4.5vw, 52px)`. Body face Inter (fallback `system-ui, sans-serif`), ledes 18-20px
  soft brown, body 15px. Eyebrow: 12px uppercase, letter-spacing 0.16em, weight 600, accent-deep.
- **Hero.** Centered, `linear-gradient(180deg, cream 0%, peach 100%)`, padding 120px top /
  140px bottom. Order: eyebrow, H1 (max 920px), lede (max 620px), two pill CTAs, small trust
  line with one `<strong>`.
- **Buttons.** Fully rounded pills (`border-radius: 999px`), 14px 28px padding. Primary is
  solid ink on cream (inverts to cream-on-ink inside the dark band); ghost is 1px ink outline.
  Hover lifts `translateY(-1px)` over 150ms ease. Nav pill is a smaller 9px 18px version.
- **Nav.** Sticky, `backdrop-filter: blur(10px)` over 85%-alpha cream, 1px bottom hairline.
  Serif wordmark at 22px weight 600 preceded by an 8px accent dot.
- **Logo strip.** A hairline-bounded band of fictional customer names set in italic Fraunces
  22px soft brown — typographic logos, no image files.
- **Cards.** 3-column grid, 32px gap, `border-radius: 20px`, warm surface + hairline border,
  centered text, 40px 32px padding. Icon chip: 56px square, radius 14, cream fill, hairline
  border, holding a 26px line-art SVG stroked in accent-deep (stroke-width 1.8, round caps).
- **Rhythm.** Content max-width 1180px, section padding 120px block, 32px inline. Hairline
  borders (never shadows) separate bands.

## Anti-patterns

- Dark-mode hero, neon gradients, glassmorphism, or drop shadows — warmth comes from the palette
- Sans-serif or bold-weight display headlines; Fraunces 400 with one italic em is the identity
- More than one accent hue, or accent-filled buttons (accent is for type and icons only)
- Emoji icons or raster logos — line-art SVG strokes and italic serif names instead
- Sharp corners on interactive elements; buttons are pills, cards are 20px radius

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

Adapted from https://github.com/pbakaus/impeccable (Apache-2.0)
