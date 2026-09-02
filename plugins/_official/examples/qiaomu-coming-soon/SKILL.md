---
name: example-qiaomu-coming-soon
description: Cinematic space-voyage coming-soon page with starfield, rotating coordinate ring, launch countdown, and an email waitlist CTA.
---

# Coming Soon Page

A pre-launch teaser page in a SpaceX-cinematic register: pure-CSS starfield and planet, rotating SVG coordinate ring, mouse-follow glow, a giant ghosted backdrop word, a launch-countdown HUD, and an email waitlist as the single conversion goal. Maximum visual daring (VARIANCE 9-10) on top of a strict function contract.

## When to use

- Coming-soon / launching-soon / pre-launch pages
- Product-teaser or waitlist-capture full-page moments for a brand
- Any open creative brief where anticipation itself is the product

## Style rules

- Function contract first, no matter how artistic: (1) a "Launching soon" badge or countdown legible at first glance, (2) one plain sentence saying what is coming and why it matters, (3) an email field + "Notify me" CTA as the single, prominent action. Atmosphere that hides these is a failed page.
- Palette: near-black space ground with spectral white `#f0f0fa` text and ONE accent (`#0099ff`) used for glow `rgba(0,153,255,.12)`, ring details, badge, and the CTA. Set `color-scheme: dark`.
- Type: condensed display face (Barlow Condensed) for the headline + mono (Space Mono) for HUD labels, countdown, and the email field; Chinese on the system stack. A giant teaser word ("Soon", the product name) can be a ghost layer (low-alpha fill or outline) BEHIND content, never competing with the headline.
- Scene is built from cheap primitives: box-shadow star particles at 2-3 parallax depths, radial-gradient planet, one slow rotating SVG ring (60s+ linear), mouse-follow radial glow at ~10% alpha. No image assets.
- Waitlist controls fit the register: pill-shaped mono email input on transparent fill `rgba(240,240,250,.08)`, border `rgba(240,240,250,.35)`; the "Notify me" button is the highest-contrast element on the page. Front-end confirmation state ("You are on the list") replaces the helper note on submit.
- Craft details make it memorable: HUD corner readouts in mono (stars, status, T-minus timer), a tab-title easter egg, coordinate/scanline micro-decoration — pick 2-3, not all.
- Motion: ambient loops slow and subtle (drift, twinkle); interactive feedback fast (≤ 200ms, `cubic-bezier(0.23, 1, 0.32, 1)`); everything under `prefers-reduced-motion` guards; animate only `transform`/`opacity`/`filter`.
- Keep it one viewport: no scrolling on desktop 1280×800; content centered with breathing room.

## Anti-patterns

- Vague mystery copy with no hint of what is coming or why anyone should care
- Purple-blue gradient nebulas and neon outer glows; more than one accent hue
- Multiple competing CTAs (social links, docs, pricing) diluting the one waitlist action
- Heavy WebGL/canvas dependencies for what CSS particles can do
- Fast ambient animation that turns the page into a screensaver

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
