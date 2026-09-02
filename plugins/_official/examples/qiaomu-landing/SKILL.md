---
name: example-qiaomu-landing
description: Dark Linear-style SaaS landing page with split hero, layered product mockup, feature grid, pricing, and testimonials.
---

# AI SaaS Landing Page

A dark, restrained marketing page in the Linear/Framer lineage: split hero (copy left, layered high-fidelity product mockup right), feature grid, three-tier pricing, testimonials, CTA, footer. The product mockup is built as a fake window shell with floating cards and one live detail (animated waveform, typing cursor) instead of a screenshot.

## When to use

- SaaS or AI product landing page / marketing homepage
- Product launch page that needs a believable product preview without real screenshots
- Dark-mode developer-tool or productivity-tool website
- Briefs mentioning "landing page", "marketing site"

## Style rules

- Palette: off-black background `#080807` (never pure `#000`), surfaces `#0f0e0c` / `#181612`, hairline borders `rgba(255,255,255,.07)`; text at `.88` / `.62` / `.35` white alpha. One accent only (here `#7c6bff`, saturation < 80%) with soft fill `rgba(accent,.14)` and border `rgba(accent,.3)`.
- Type: display font with tight tracking (Space Grotesk) + mono for numbers/labels (JetBrains Mono); Chinese text always on the system stack (`-apple-system, "PingFang SC", "Microsoft YaHei", …`). H1 stays within 2-3 lines on a wide container.
- Hero is asymmetric: left-aligned copy column + right visual column; never a centered hero.
- Product mockup = 3 depth layers: window shell with traffic-light dots, main UI, floating cards that overflow the shell edge; add exactly one animated "alive" detail.
- Radius small and consistent (4px); prose measure capped at 640px.
- Pricing: three tiers side by side, middle tier visually featured (accent border + badge); differences scannable in 3 seconds.
- Motion: `cubic-bezier(0.23, 1, 0.32, 1)` ease-out, UI transitions ≤ 300ms, animate only `transform`/`opacity`, respect `prefers-reduced-motion`.
- Copy: invented but plausible brand, organic numbers (e.g. 47.2%, ¥3,847), concrete verbs; at most one exclamation mark per page.

## Anti-patterns

- Purple-blue gradient glow washes, glassmorphism on every card, neon outer glows
- Centered hero + three equal cards in a row (default AI layout)
- Gradient-filled headline text; oversized H1 wrapping 4+ lines
- Buzzword copy ("revolutionary", "seamless", "unleash") and round fake numbers (99.99%)
- Decorative Chinese webfonts; italics anywhere in CJK UI

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

Adapted from https://github.com/joeseesun/qiaomu-design (MIT)
