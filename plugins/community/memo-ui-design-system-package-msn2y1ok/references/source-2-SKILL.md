---
name: memo-ui-design-system
description: >-
  Design and ship artifacts for Memo UI using the evidence-backed brand system:
  warm paper + encre ink, a single terracotta accent used as punctuation,
  Oswald + Geist Mono type pairing, flat geometry, 1px hairlines instead of
  shadows, 4px spacing grid, 200ms/700ms ease-out-expo motion. Use when working
  on any Memo UI screen, page, deck, prototype, or design-system token task, or
  when asked to "apply the Memo UI system", "brand a Memo UI artifact", or
  "refine the Memo UI design system".
user-invocable: true
---

# Memo UI design system

Bind these tokens and rules for every Memo UI artifact. `colors_and_type.css` is the token sheet; `DESIGN.md` is the rules source of truth.

## 0. What is inside (read before generating)

- `README.md` — package guide, Product Overview, and Preview Manifest.
- `DESIGN.md` — canonical rules: product context, palette, type, spacing, layout, motion, voice, component postures, anti-patterns.
- `colors_and_type.css` — the paste-ready token sheet (Foundation → Semantic → Component, light + dark, Oswald/Geist Mono bound).
- `preview/*.html` — 10 self-reviewable token cards (colors-primary, colors-theme-light, colors-theme-dark, typography-specimens, spacing-tokens, spacing-radius, spacing-shadows, components-buttons, components-inputs, brand-assets).
- `source_examples/` — preserved source implementations of high-signal primitives (Button/Card/Input stories, tabs.tsx, badge.tsx, avatar.tsx, Stack/Grid stories).
- `ui_kits/app/` — runnable React component studio that composes the tokens into product surfaces.
- `assets/` — preserved source binary evidence (`favicon-captured-storybook.svg`, labeled as Storybook chrome, not brand). No brand logo/build icons or brand font files exist in the source evidence.

## 1. Always start with the token sheet

1. Paste `colors_and_type.css` verbatim as the first `<style>` in the artifact (it binds Oswald + Geist Mono via Google Fonts `@import` and ships the full light palette).
2. For a dark surface, add `data-theme="dark"` to the root element (token overrides are in the sheet).
3. Never invent tokens or reintroduce hex values outside the palette. Color is derived from the brand tokens only.

## 2. Design language

- **Palette:** paper `#faf9f7` canvas · encre `#16130f` text · ink2 `#6b6055` muted · ink3 `#8a8078` meta · line `#e7e2da` / line2 `#dcd5cc` hairlines · surface `#ffffff` cards · surface2 `#f5f2ee` inset · accent `#ad4c16` (punctuation only) · accentDeep `#8a3d10` hover · accentInk `#7a360e` accent-as-text (AA) · accentSoft `#f4e4d8` wash · onAccent `#ffffff` · ok/warning/error/info fills + ink pairs.
- **Type:** Oswald display + sans (weights 300–700), Geist Mono for kickers/labels/meta (uppercase, `0.08em` tracking). Two distinct faces — never a single family, never Inter.
- **Layout:** 4px grid; radius 0 (pill `9999px` only); 1px hairline borders; no shadows — elevation = surface change + border.
- **Motion:** 200ms micro / 700ms cinematic, `cubic-bezier(0.2,0.7,0.2,1)`; honor `prefers-reduced-motion`.
- **Voice:** precision + warmth. "The label voice is Geist Mono: tight, technical, uppercase. The display voice is Oswald: intentional, big, letter-spaced."

## 3. Component postures

- One primary (solid) CTA per viewport; adjacent entries are secondary/ghost/outline.
- Accent ≤ 2 uses per viewport. Accent as text/icon uses `accentInk` on paper/soft, `onAccent` on solid.
- Structure with `line` hairlines; inset surfaces use `surface2`; cards are `surface` on `paper` with a `line` border.
- Focus: every focusable element gets an accent `:focus-visible` ring. Hover moves the background (solid accent → `accentDeep`; secondary → `surface2`); foreground never dims. Disabled is the only state allowed to reduce contrast.
- Forms: inputs are surface with `line` border → `line2` hover → accent focus; labels `encre`, hints `ink3`, errors `errorInk`; checkbox/radio checked fill accent + `onAccent`; switch track accent when checked.
- Badges: default surface2/ink2/line; accent accentSoft/accentInk; success/warning/error 14% washes + ink text.
- Tabs: list `surface2` + `line` border, active trigger `surface` + `encre`.
- Tooltips: encre bg, paper fg. Modal overlay: 45% encre.

## 4. Brand mark

No logo file exists in the source evidence — the brand mark is typographic: Oswald wordmark + Geist Mono eyebrow with a terracotta pixel/rule accent. Render lockups directly from type tokens; label any derived asset as type-derived.

## 5. Authoring checklist

- [ ] `colors_and_type.css` pasted as first `<style>`; only evidence tokens used
- [ ] Light + dark bindings correct (dark = `data-theme="dark"`)
- [ ] Oswald + Geist Mono paired; kickers uppercase w/ tracking; no Inter as display
- [ ] Radius 0 except pills; no box-shadows as depth
- [ ] One primary CTA; accent ≤2×/viewport; hover/focus/disabled states defined as fg+bg pairs, no contrast drop
- [ ] `data-od-id` on regions, headings, CTAs, and repeated cards
- [ ] No horizontal scroll at 360/390/430/600/768/820/1024/1366/1440/1920px
- [ ] Touch targets ≥44px; `:focus-visible` ring on everything focusable
- [ ] Motion honors `prefers-reduced-motion`
- [ ] No placeholder stubs, no fabricated metrics