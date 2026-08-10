# Memo UI — Design System Package

Evidence-backed design system for the Memo UI brand (source: `guillaume-flambard/memo-ui`, Memo Labs portfolio / lab design language). Warm paper + encre ink, one terracotta accent used as punctuation, Oswald + Geist Mono, flat geometry, 1px hairlines instead of shadows.

Canonical reading order: `DESIGN.md` (rules) → `colors_and_type.css` (tokens) → `PROVENANCE.md` (evidence) → this guide → `preview/` + `ui_kits/app/` (visuals).

## Product Overview

Memo UI is a React component library (monorepo: `packages/core`, `packages/react`, `packages/motion`, `packages/utils`) with a Storybook docs app and a Next.js playground showcase. Its design language is described in the source as "The label voice is Geist Mono: tight, technical, uppercase. The display voice is Oswald: intentional, big, letter-spaced" — **precision + warmth**. Cards and forms are flat (radius 0), delineated by 1px hairlines (`line`/`line2`); elevation is a surface-color change, never a shadow. The accent is used at most twice per viewport. The playground surface is a component showcase: hero, Button ×4 variants/sizes, Card ×3 variants, Text scale, Textarea, footer.

## Getting started

1. Paste `colors_and_type.css` verbatim as the first `<style>` of any artifact — it binds Oswald + Geist Mono and ships the full light/dark token set.
2. For dark mode, add `data-theme="dark"` to the root element.
3. Follow `DESIGN.md` postures: one primary CTA per viewport, accent ≤2×/viewport, Text uses `ink2` for the muted voice, focus ring in accent, hover shifts background (accent → `accentDeep`), structure via hairlines not shadows.
4. Speak the voice: Geist Mono kickers (uppercase, `0.08em` tracking) for labels/metadata; Oswald (uppercase, weights 300–700) for display.

## Package contents

| Path | Purpose |
| --- | --- |
| `DESIGN.md` | Canonical rules doc (palette, typography, voice, layout, postures) |
| `colors_and_type.css` | Paste-ready token sheet — Foundation → Semantic → Component, light + dark, fonts bound |
| `PROVENANCE.md` | Evidence files, token-alignment decision, brand-asset notes |
| `SKILL.md` | Reusable authoring skill for Memo UI artifacts |
| `README.md` | This guide + Preview Manifest |
| `preview/*.html` | 10 focused token cards for human review |
| `assets/` | Preserved source binary evidence — `favicon-captured-storybook.svg` (Storybook chrome, byte-for-byte copy, labeled as evidence, not brand) |
| `ui_kits/app/` | Runnable React component-studio UI kit |
| `source_examples/` | Preserved source implementations of high-signal primitives |
| `system/`·`brand.json`·`context/` | Extractor artifacts + evidence (keep as provenance; canonical system is the above) |

## Preview Manifest

Focused, self-reviewable cards (each named by its `data-od-id`):

| Card (data-od-id) | Token family | Content |
| --- | --- | --- |
| `colors-primary` | Color — foundation | paper/encre/ink2/ink3, line/line2, accent contract (accent/accentDeep/accent2/accentInk/accentSoft/onAccent), surfaces, semantic fills + AA inks |
| `colors-theme-light` | Color — semantic/light | background/surface/text/border/accent pairings, states (hover/focus/selected), button & input bindings |
| `colors-theme-dark` | Color — theme/dark | `[data-theme="dark"]` overrides (`#0a0c12`, `rgba(255,255,255,…)` hairlines), dark usage rules |
| `typography-specimens` | Type | Oswald display scale (xs→5xl), weights 300–700, uppercase tracking rules, Geist Mono kicker/label/meta |
| `spacing-tokens` | Spacing | 4px grid scale 0→96, container/padding/stack usage, density rules |
| `spacing-radius` | Geometry | Flat radius 0 vs pill 9999px; where each applies |
| `spacing-shadows` | Elevation | No shadows; hairline structure (`line`/`line2`), surface-change elevation demo |
| `components-buttons` | Components | Button variants (primary/secondary/ghost/outline) × sizes + disabled + focus + hover transitions |
| `components-inputs` | Components | Input/Textarea/Select/Checkbox/Radio/Switch/Label/FormField, error + focus + disabled states |
| `brand-assets` | Brand | Typographic wordmark lockups (Oswald + Geist Mono), captured-evidence refs from `assets/` — **no logo file exists in source** |

## Reuse workflow

- **New artifact:** bind `colors_and_type.css`, model component shapes from `source_examples/`, keep the UI kit's tokens the single source of color.
- **Edits:** keep tokens bound on every turn; never reintroduce raw hex outside the palette; never drop the Oswald/Geist Mono pairing.
- **Contrast rule:** states never lower contrast — accent text uses `accentInk` on paper/soft washes; hover moves background (solid accent → `accentDeep`), fg unchanged.