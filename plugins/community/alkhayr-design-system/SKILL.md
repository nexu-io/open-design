---
name: alkhayr-design-system
description: Build pages and flows for the Alkhayr Waqf Charity Foundation website using its design system — pixel-sampled green/gold tokens, Bricolage Grotesque single-family type, the mihrab arch motif, measured contrast gates, and the six real site pages (Home, About, Our Waqf Vision, Projects, Donate, Contact).
od:
  kind: skill
  mode: prototype
---

# Alkhayr Design System

Applies the Alkhayr Waqf Charity Foundation design system to any new page,
flow, or component for the foundation's website. The full token table,
contrast measurements, and posture rules live in
`references/brand-spec.md` — **read it first, every run.** A complete,
runnable demonstration of the system (tokens, type scale, components,
dark theme) ships at `examples/index.html` with the logo at
`examples/assets/alkhayr.jpeg`.

## When this skill fires

- Any design task for Alkhayr Waqf Charity Foundation: the six site pages
  (Home, About Us, Our Waqf Vision, Projects, Donate, Contact), donation
  flows, campaign landing pages, or new components inside that site.
- Any request to extend the system itself (new component, new state, dark
  theme variant of a pattern).

Do NOT use it for unrelated brands — the palette is pixel-sampled from the
Alkhayr logo and will look wrong anywhere else.

## The system in one sentence

Warm Paper canvas, deep-green `#013B2C` ink, sprig-green `#31763F` as the
single action color, minaret gold held in reserve, Bricolage Grotesque
carrying the whole hierarchy by weight, and the logo's pointed mihrab arch
as the one signature shape.

## Hard rules (violating these is a regression)

1. **Tokens only.** Use the token set from `references/brand-spec.md`
   (`--paper`, `--card`, `--ink`, `--ink-soft`, `--line`, `--accent`,
   `--gold`/`--gold-ink`, `--deep`, plus the full dark set under
   `:root[data-theme="dark"]`). Never invent new hex values; extend with
   `oklch()` derivations of existing tokens if a gap appears.
2. **Contrast gates are measured, not guessed.** Body text ≥ 4.5:1, large
   text ≥ 3:1. Gold `#BF9543` is 2.67:1 on Paper — **never** gold text on
   light surfaces; use `--gold-ink` (`#8A6A2A`, 4.86:1) instead.
3. **One family, weight does the work.** Bricolage Grotesque everywhere:
   800 display, 700 headings, 400 body, 500 for quotes. The family has
   **no italic axis** — never synthesize oblique; Hadith and pull-quotes
   stay upright 500, set apart by sprig-green color and gold accents.
   Tight tracking −0.01…−0.02em at ≥32px; uppercase eyebrows at
   0.12–0.14em.
4. **Accent budget.** Sprig green is the only action color, ≤2 visible
   uses per screen. Gold is a reserve — eyebrows, borders, the arch
   outline, metadata — never fills for primary actions.
5. **One special shape.** The pointed mihrab arch (image masks, section
   dividers) is the signature. Use sparingly; everything else is hairline
   borders + whitespace, 8px control radii, 12–20px card radii, pill
   badges. Shadows only on hover and floating chrome.
6. **Honest content.** Real foundation copy only (the six-page copy deck
   is canonical). No lorem ipsum, no invented metrics, no NGO stock
   photography — labelled placeholders until real hostel-project photos
   exist. Donation surfaces always show the real bank details exactly as
   supplied by the foundation.
7. **Tone.** Institutional, warm, trustee-like. This is a waqf (permanent
   charitable endowment) — durability and transparency over urgency.
   Avoid charity-guilt tropes and countdown-timer pressure patterns.

## Workflow

1. Read `references/brand-spec.md`. Bind the full token block (light +
   dark) to `:root` before any layout work.
2. If the brief doesn't name a page, ask which of the six it is (or which
   new surface) — one consolidated question, not field-by-field.
3. TodoWrite a short plan: tokens → layout → real copy → self-check.
4. Compose with the documented components (buttons, badges, cards, stat
   blocks, arch image masks, bank-detail blocks, quote treatments) —
   `examples/index.html` is the living reference; lift its class patterns
   rather than inventing parallel ones.
5. Fill with real copy from the brief. Unknown values get honest
   placeholders, never fabricated numbers.
6. Self-check before shipping: every hard rule above, both themes if the
   artifact has a toggle, and the anti-AI-slop checklist (no gradient
   heroes, no emoji icons, no left-border-accent cards, no invented
   stats).
7. Ship one canonical HTML file per screen; `index.html` stays an
   overview/launcher when multiple screens exist.

## Dark theme

The dark token set is part of the system, not an afterthought. Any new
page must define both `:root` and `:root[data-theme="dark"]` values and
verify the bank-detail card and arch motif in both. Dark accent shifts to
`#5FAE6F`, dark gold to `#D9B65A` (8.5:1 on deep — text-safe there).

## Files

- `references/brand-spec.md` — token table, measured contrast gates, type
  rules, posture rules. Source of truth.
- `examples/index.html` — the full system demonstrated live: swatches with
  AA ratios, type scale, spacing/radius, all components, dark-mode toggle.
- `examples/assets/alkhayr.jpeg` — the foundation logo (palette source and
  lockup asset).
