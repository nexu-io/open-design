---
name: web-prototype-taste-soft
description: Apple-tier soft web prototype. Silver/cream canvas, double-bezel cards, button-in-button CTAs, generous squircle radii, spring motion, ambient mesh. Distilled from Leonxlnx/taste-skill `soft-skill` + sections 4–8 of `taste-skill`.
---

# Web Prototype — Soft Premium

For briefs that ask for "Apple-like", "Linear-tier", "premium consumer", "calm SaaS", or "$150k agency" finish. The aesthetic is soft, weighty, and obsessive about nested architecture.

## Source

Distilled from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — `skills/soft-skill/SKILL.md` ("Vanguard UI Architect") with the haptic micro-aesthetics, double-bezel architecture, and motion choreography rules. See `example.html` in this directory for a fully-realized template.

## Hard rules

- **Canvas:** silver-grey or warm cream (`#F2F2F0` or `#FDFBF7`). Not pure white.
- **Type pairing:** display in Geist / Plus Jakarta Sans / Cabinet Grotesk at heavy weight, body in the same family, monospace meta in Geist Mono.
- **Display:** `clamp(48px, 7vw, 96px)`, `letter-spacing: -0.035em`, `line-height: 0.96`. Heavy weight (700+).
- **Squircle radii:** `border-radius: 28px–40px` (`rounded-[2rem]` to `rounded-[2.5rem]`) on major surfaces.
- **Double-bezel mandatory:** every important card is a wrapper (`p-1.5`, hairline border, soft outer shadow) containing an inner core with its own background and a *concentric smaller radius* (e.g., outer `2rem`, inner `calc(2rem - 0.375rem)`).
- **CTA = button-in-button:** primary CTAs are full pills (`rounded-full px-6 py-3`); the trailing arrow lives inside its own circular wrapper flush-right.
- **Ambient depth:** one slow-drifting radial mesh blob behind hero, `opacity ≤ 0.18`, `pointer-events: none`, fixed.
- **Eyebrow tag** above each section header: pill, uppercase mono, `letter-spacing: 0.2em`, `text-[10px]`.

## Banned

- Inter, Roboto, Helvetica, Open Sans.
- Generic 1px solid gray borders (use `border-black/5` / `ring-1 ring-black/5`).
- `shadow-md`, `shadow-lg`, hard drop shadows. Only diffuse, wide-spread, low-opacity (`0 20px 40px -15px rgba(0,0,0,0.05)`).
- Edge-to-edge sticky navbars glued to the top. Use a floating glass pill (`mt-6 mx-auto w-max rounded-full`).
- Linear or `ease-in-out` transitions. Use `cubic-bezier(0.32, 0.72, 0, 1)` or spring physics.
- `h-screen` (use `min-h-[100dvh]`).
- Animating `width` / `height` / `top` / `left`. Only `transform` and `opacity`.
- Pure black `#000`. Use Zinc-950 / Off-Black.

## Required components

- Floating-pill navbar with backdrop-blur-2xl.
- Asymmetric hero: massive heavy display, eyebrow tag, body lede `max-w-[52ch]`, two CTAs (primary pill with button-in-button arrow + ghost).
- Bento grid using the **double-bezel** pattern; at least one wide card and one tall card.
- Feature row with **z-axis cascade** or split image module.
- Marquee strip of customer logos, slow infinite translation (`-100% / 20s`), pause on hover.
- Closing band on a soft inverted surface (deep zinc / espresso).
- Footer: monospace meta, hairline above.

## Motion

- All transitions: `transition: transform 700ms cubic-bezier(0.32,0.72,0,1)` minimum.
- Hover on CTAs: outer pill scales `0.98` on `:active`, inner trailing-icon circle translates `(+1px, -1px)` and `scale(1.05)`.
- Scroll entry: `translateY(16px) blur(8px) opacity(0)` → `translateY(0) blur(0) opacity(1)`. `IntersectionObserver` only.
- Marquee: `transform: translateX(-50%)` over `30s linear` infinite, applied to a duplicated track.
- Hero mesh blob: 24s+ keyframe drift, opacity-only or transform-only.

## Pre-flight

- [ ] Floating pill nav with `backdrop-blur` + hairline ring
- [ ] At least one card uses the double-bezel (outer shell + inner core, concentric radii)
- [ ] Primary CTA uses button-in-button trailing icon
- [ ] Section padding ≥ `py-24`
- [ ] No banned fonts; display weight ≥ 700
- [ ] Hero uses `min-h-[100dvh]`, never `100vh`
- [ ] All transitions use custom cubic-bezier or spring; no `linear` / `ease-in-out`
- [ ] Mobile: layout collapses to single column under 768px, all rotations + overlaps removed
