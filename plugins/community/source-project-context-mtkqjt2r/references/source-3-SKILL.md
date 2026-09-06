---
name: flowmax-pros-design-system
description: Produce designs and artifacts that match the FlowMax Pros design system — an ink-and-paper marketing language (Playfair Display + Geist + Geist Mono, gold emphasis, action-blue CTAs) reconstructed from the FlowMax Pros CRM marketing site.
user-invocable: true
---

# SKILL — Producing designs with the FlowMax Pros design system

A Claude-Design-style skill for generating artifacts in the **FlowMax Pros** design language. Bind the tokens, follow the pairing rules, apply the source components — never reinterpret the brand.

## What is inside

- `DESIGN.md` — the authoritative rules (context, color, type, spacing, layout, components, motion, voice, anti-patterns).
- `colors_and_type.css` — reusable foundation: light/dark semantic tokens + the `premium-landing` brand DNA + type stacks + radius/shadow/motion. Self-loads `fonts/fonts.css`.
- `preview/` — focused review cards (colors, typography, spacing, radius/shadows, components, brand assets, applied surfaces).
- `ui_kits/app/` — applied interface kit (marketing landing screen, hero product demo screen, component gallery).
- `assets/`, `build/`, `fonts/`, `examples/site/` — preserved source assets and the original HTML pair.
- `README.md`, `context/provenance.md` — package guide and source/licensing record.

## Source context

The system is reconstructed from **FlowMax Pros** (flowmaxpros.com), an 11-section React + Tailwind + GSAP marketing site mirrored 1:1 in this workspace under `site/`. Tokens are taken directly from the production bundle `site/assets/index-B9b6BLNK.css` and the component markup/copy from `site/assets/index-Du2xdisQ.js`. Recon evidence (`RECON/`, `NOTES.md`) confirms: 11 sections, 0 console errors, 0.000585 pixel diff vs the original, no horizontal scroll 1366→360px, all contrast pairs ≥ 4.68:1, double-ring focus states, reduced-motion fallbacks.

**Design DNA in one sentence:** deep-navy `ink` fields, warm `paper` surfaces, one restrained `gold` accent, one electric-blue `action` color — Playfair Display serif for two marketing moments, Geist for all UI, Geist Mono for uppercase labels.

## When to use

- Any web artifact (landing page, marketing site, product demo, dashboard shell) for a CRM / marketing-automation / agency / dental / med-spa audience.
- Any task asking to "match the FlowMax Pros style", reuse this design system, or keep an existing FlowMax-branded experience consistent.
- Extensions of the existing landing (new sections, localized variants, pricing surfaces) where copy/pattern continuity matters.

## How to use

1. **Bind tokens.** Paste `colors_and_type.css` verbatim as the first `<style>` (or link it). Wrap marketing canvases in `<div class="premium-landing font-sans">` so the brand DNA applies.
2. **Read DESIGN.md first.** The direction is locked; do not ask brand/style/theme questions or propose new palettes.
3. **Apply components, don't redesign them.** Copy shapes from `preview/components-buttons.html` and `ui_kits/app/components.html`: pill buttons (one primary per viewport), pill tabs, workflow cards, comparison rows, chat bubbles, stats band, nav.
4. **Honor the type pairing.** Playfair only for hero + closing `h2`; Geist everywhere else; Geist Mono only as uppercase labels (`letter-spacing 1.5px`, `tabular-nums`).
5. **Keep motion disciplined.** Durations `.18s/.24s/.42s/.7s`, ease-enter `cubic-bezier(.165,.84,.44,1)`, and always ship the `prefers-reduced-motion: reduce` static fallback with double focus rings.
6. **Use real assets and honest copy.** Reference preserved files under `assets/`, `build/`, `fonts/` — never hotlink. Never fabricate metrics or testimonials; the product's real stats are `50+ templates`, `4 verticals`, `2hrs to launch`, `$0 per-seat fees`, `14-day trial`.
7. **Verify.** Check contrast pairs, hover state backgrounds (never lower foreground contrast), focus rings, and 360px responsive behavior.

## Design-system highlights

- **Accent discipline:** gold = emphasis only (checkmarks, stats, hairlines, gold-on-dark on ink); `#2563EB` action = interactive only. Source hover/press token `--action-hover #1D4ED8`. One accent per viewport, max two.
- **Dual-theme contract:** the marketing system is a deterministic ink-and-paper palette (no toggle, scoped under `.premium-landing`); the app shell uses the semantic `.dark` tokens. Never mix the two scopes (see DESIGN.md §10).
- **Surfaces:** `ink #0F172A`, `ink-deep #0A0E1A`, `paper #FFFFFF`, `paper-warm #FAF9F7`.
- **Radii:** 4px (sm), 12px (md), pill; the only asymmetric radii are the chat message bubbles (`4px 12px 12px`, `12px 12px 4px`).
- **Type scale:** hero 48→76px Playfair `-2.5px` tracking; data `h2` 36→56px display; UI `h2` 30→36px Geist semibold; body 18–20px; mono labels 10–12px.
- **Elevation:** `raise-1/-2` for buttons, `overlay 0 24px 64px rgba(15,23,42,.18)` for the floating demo card.
- **Motion:** CSS `--dur-hover .18s`, `--dur-state .24s`, `--dur-reveal .42s`; runtime `--dur-interact .14s`, `--dur-strike .6s`, `--stagger .07s`; ease-enter `cubic-bezier(.165,.84,.44,1)`.
- **Voice:** second person, outcome-first, numbers over adjectives ("Launch automations in 2 hours, not 2 weeks"); hero swaps headline by traffic source (referral/LinkedIn/dental/agency/twitter) — keep the pattern.

## Machine-readable brand

`brand.json` carries the token roles, brand voice, typography, surfaces and provenance as data. When a runtime or tool asks for a brand spec, read roles from `brand.json` and the full rules from `DESIGN.md`.

## Delivery checklist

- [ ] `colors_and_type.css` bound; `.premium-landing` wrapper present on marketing surfaces
- [ ] Display/body/mono pairing honored; mono only as uppercase labels
- [ ] One accent per viewport; state changes keep contrast; focus rings on every focusable
- [ ] Real imagery/logo/font files referenced locally from `assets/`, `build/`, `fonts/`
- [ ] No purple-gradient generic wash, no emoji icons, no invented metrics
- [ ] Responsive at 360px, no horizontal scroll; champion 1440px

## Legal note

Brand, logo mark and copy © FlowMax Pros; the source declares no license. Public redeployment requires the owner's authorization or brand/copy replacement — see `context/provenance.md` and the deployment checklist in `NOTES.md`.