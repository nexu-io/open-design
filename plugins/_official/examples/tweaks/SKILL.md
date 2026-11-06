---
name: tweaks
description: |
  Wrap any HTML artifact with a side panel of live, parameterized
  controls — accent color, type scale, density, motion, theme — that
  rewrite CSS custom properties in real time and persist to
  localStorage. Lets the user explore variants of a design without
  re-prompting the agent. Use when the brief asks for "variants",
  "side-by-side options", "tweak this", "let me adjust", "live
  knobs", or "实时调参".
triggers:
  - "tweaks"
  - "variants"
  - "tweak panel"
  - "live controls"
  - "adjust on the fly"
  - "实时调参"
  - "可调参数面板"
  - "side panel"
  - "knobs"
od:
  mode: prototype
  platform: desktop
  scenario: design
  upstream: "https://github.com/alchaincyf/huashu-design"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Wrap this landing page with a tweak panel — accent color, type scale, density, light/dark — persist to localStorage so the user can refresh without losing their choice."
---

# Tweaks Skill · 参数化变体面板

Wrap any HTML artifact with a side panel of live controls that rewrite
CSS custom properties in real time and persist to `localStorage`.
Inspired by the *huashu-design* tweak pattern.

## What you produce

A single self-contained HTML file with two layers:

1. **Stage** — the original artifact (landing page / deck / dashboard)
   re-keyed so all visual decisions read from CSS custom properties:
   `--accent`, `--scale`, `--density`, `--mode`, `--motion`.
2. **Panel** — a fixed sidebar (or drawer on small viewports) with
   form controls bound to those custom properties via a tiny
   vanilla-JS bridge. Persists every change to `localStorage` keyed
   by the artifact identifier.

The user can:

- Open the artifact and see the stage rendered with their saved
  preferences (or sensible defaults).
- Adjust accent / scale / density / mode / motion in the panel and
  watch the stage update instantly — no rerender.
- Press <kbd>T</kbd> to hide / reveal the panel; <kbd>R</kbd> to
  reset to defaults.
- Refresh the page — every choice is persisted.

## When to use

- The user generated something they like 80% of, and wants to dial
  in the last 20% themselves.
- You're presenting a design system / brand and want the audience to
  feel the variants live (instead of you re-running the agent).
- You're shipping a stand-alone demo (e.g. a portfolio piece) and
  want viewers to play.

## When *not* to use

- One-shot artifacts that won't be iterated on (e.g. a runbook —
  parameters don't help).
- When the artifact's value is in fixed ratios (e.g. an infographic
  with carefully balanced data viz — knobs would degrade it).

## The 5 standard knobs

> Pick a subset that suits the artifact. Don't ship all 5 if only 2
> matter — clutter is a regression.

### 1. `--accent` — Accent color

A select with 5–8 curated swatches (don't ship a free color picker —
the user will pick a bad color and blame you).

```js
const ACCENT_PRESETS = [
  { id: 'rust',    val: '#c96442', label: 'Rust' },
  { id: 'cobalt',  val: '#2c4d8e', label: 'Cobalt' },
  { id: 'sage',    val: '#4a7a3f', label: 'Sage' },
  { id: 'plum',    val: '#7a3f6a', label: 'Plum' },
  { id: 'graphite',val: '#3a3a3a', label: 'Graphite' },
];
```

The artifact uses `var(--accent)` everywhere it had a hard-coded
accent before. Border / link / pull-quote rule / CTA all flip
together.

### 2. `--scale` — Type scale (0.85 / 1.0 / 1.15)

Three settings: *Compact* (0.85), *Normal* (1.0), *Generous* (1.15).
All `font-size` declarations multiply by `var(--scale)` via
`calc(... * var(--scale))`.

Don't go beyond ±15% — beyond that the layout breaks (column flow,
breakpoints, line counts).

### 3. `--density` — Layout density (Tight / Normal / Roomy)

Three settings that swap the spacing scale: *Tight* (0.75) /
*Normal* (1.0) / *Roomy* (1.4). All `padding` / `gap` / `margin`
declarations multiply by `var(--density)`.

This is the highest-impact knob — it's also the most fragile, so
**every layout-critical container must declare its base spacing in
custom properties** before you wrap.

### 4. `--mode` — Light / Dark

A 2-state toggle. Sets `data-mode="light"` vs `"dark"` on the
`<html>` element and the artifact's `:root` selector responds with
two color sets.

If the artifact already has a media-query-based dark mode, *replace*
it with the data-attr version — the user's choice should win over
their OS.

### 5. `--motion` — Off / Subtle / Lively

Three settings. Maps to a CSS variable `--motion-mult` that scales
all `transition-duration` / `animation-duration` declarations:

- *Off* — `0s` (also disables WebGL canvases / decorative animation).
- *Subtle* — `1.0` (the artifact's authored timing).
- *Lively* — `1.6` (slower transitions, more visible motion).

Respect `prefers-reduced-motion`: default to *Off* if the user has
that set, regardless of stored preference.

## Implementation primitives

Read `assets/wrap.html` — it ships the panel + bridge as an
inert template. Your job is to:

1. Take the user's existing artifact HTML.
2. Lift its accent / mode / spacing / scale into custom properties
   (search for hard-coded `#hex` / `Npx` / `Nrem` and convert).
3. Paste the contents into the marked region of `wrap.html`.
4. Edit `assets/wrap.html`'s `KNOBS` array to keep only the knobs
   you decided are relevant to *this* artifact. Don't ship 5 if 2
   matter.
5. Patch the `STORAGE_KEY` to a unique slug (`tweaks-<artifact-slug>`).

The bridge in `wrap.html`:
- Loads `localStorage[STORAGE_KEY]` JSON on first paint.
- Applies values as `document.documentElement.style.setProperty('--accent', ...)`.
- Listens to every form control's `change` event and writes back.
- Exposes <kbd>T</kbd> (toggle panel) and <kbd>R</kbd> (reset).

## Workflow

### Step 1 — Acquire the artifact

Same options as the critique skill:

1. Project file (`index.html` in the project folder).
2. Pasted HTML in the chat.
3. Generated by you in this turn.

### Step 2 — Decide which knobs apply

Read the artifact's CSS first. For each knob, decide *yes / no*:

- `--accent` — yes if the artifact has 1 accent color used ≥ 3 times.
- `--scale` — yes if the artifact is type-driven (article, deck,
  pricing page).
- `--density` — yes if the artifact has consistent gap / padding
  rhythm (deck, dashboard, landing). No for runbooks (already dense).
- `--mode` — yes if the artifact has authored dark mode tokens, or
  you're willing to derive them.
- `--motion` — yes if the artifact has any transition / animation
  worth scaling. No for static reports / critique reports.

Default: **3 knobs is the sweet spot.** Five is too busy, one is
not worth a panel.

### Step 3 — Lift hard-coded values into custom properties

Open `assets/wrap.html`'s `<style>` block — copy its custom-property
naming scheme (`--accent`, `--scale`, etc.). In the user's artifact,
find every place those concerns live and rewrite:

- `color: #c96442` → `color: var(--accent)`
- `font-size: 18px` → `font-size: calc(18px * var(--scale))`
- `padding: 24px 32px` → `padding: calc(24px * var(--density)) calc(32px * var(--density))`
- `transition: opacity 200ms` → `transition: opacity calc(200ms * var(--motion-mult))`

If the artifact uses `clamp()` or `vw` already, multiply the
*outer* value by the custom property — don't tear apart `clamp(...)`.

### Step 4 — Paste into the wrap

Copy the artifact's `<style>` and `<body>` into the marked regions
of `wrap.html`. Keep the panel + bridge intact.

### Step 5 — Test the loop

Open the result, click each knob at least once, refresh the page,
confirm the choice persists. If a knob breaks the layout —
*remove it*, don't ship it.

## Output contract

```
<artifact identifier="tweaks-<artifact-slug>" type="text/html" title="<Artifact Title> · Tweaks">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact ("Wrapped X with a 3-knob tweak
panel — accent / scale / mode."). Stop after `</artifact>`.

## Hard rules

- **Don't ship a free color picker** — only curated swatches. Users
  pick bad colors when given freedom; saving them from that is the
  whole point.
- **Persist by artifact identifier** — `tweaks-<slug>`, not a global
  key. Two artifacts open in two tabs must not share state.
- **Respect `prefers-reduced-motion`** — default to *Off* for motion
  if the user has that set, override only on explicit click.
- **Single-file** — no external CSS / JS / fonts beyond the artifact's
  existing imports. Inline the panel + bridge.
- **Panel hidden by default on viewports < 720px** — slide-in drawer
  via a "T" button at top-right.
- **Don't ship more than 5 knobs.** Three is the sweet spot.
