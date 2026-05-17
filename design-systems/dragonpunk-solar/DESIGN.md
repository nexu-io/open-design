# Design System Inspired by DragonPunk Solar

> Category: Bold & Expressive
> Sun-bleached solarpunk meets cyberpunk neon and high-fantasy mythos — the daylight twin of DragonPunk Noir.

## 1. Visual Theme & Atmosphere

DragonPunk Solar (DPS) is solarpunk wearing fiber-optic veins. Where DPN is `3 AM wet stone street`, DPS is `noon on a rooftop garden in summer`. The canvas is **Solar White** (`#FFF8E1`) — not a sterile sheet-of-paper white but a cream warmed by sun-glare, the lightness of dragon-scale catching light. Against that canvas, the same **70/20/10 budget** that runs DPN flips: 70% bright tones do the structural work, 20% cool accents do the signaling, 10% deep shadows break the blaze.

The atmospheric law remains **operational dashboard, not arcade marquee** — same reactor-control-room calm, just daylit. 95% of pixels do not glow; the small flaring minority carries meaning. The difference from DPN: where DPN can use a single cyan token for both readable accent and focus-glow (cyan-on-void clears ~110:1 contrast), DPS *must* split the role — on cream, cyan contrast collapses to ~1.7:1. DPS solves this with **Bole** and **Rubric** drawn from Renaissance gilding tradition: bole is the deep red-clay ground gilders laid beneath gold leaf to make it glow; rubric is the manuscript-red used for headings and important wayfinding in flowing body copy.

DPS is **light without being innocent**. The shadows aren't gone — they're cast hard by direct sunlight, defined and deliberate. Heat haze sits at the edges. Solar arrays bloom on gothic spires. Plan 9 / Acme / NeXTSTEP lineage holds: square corners, no shadows, no blur, no animations except where state is changing.

**Key Characteristics:**
- Solar canvas (`#FFF8E1`) — cream warmed by sun-glare, never sterile white
- Bole (`#3D1208`) as load-bearing reading color — deep red-warm pencil, ~13:1 contrast on Solar White
- Rubric (`#B82F08`) for readable accent (links, hashtags, wayfinding) — ~5.5:1 contrast
- Plasma Cyan (`#00D4FF`) reserved for focus-glow only (cool spike in a warm register)
- Square corners exclusively — same DPN rule
- No drop shadows. No blur. No skeumorphism. Plan 9 / Acme lineage
- Cool flares treated as instrument-panel LEDs against a daylit field
- The same operational dashboard discipline as DPN, with a light surface and warm ink

## 2. Color

The palette mirrors DPN's three-band structure (canvas / accent / warm) but rotated for cream-surface contrast math. Bole replaces gold as ink; Rubric replaces cyan-as-readable-accent; Plasma Cyan retreats to glow-only.

### Primary — Solar Foundation

- **Solar White** (`#FFF8E1`): Primary canvas. A cream warmed toward gold, never neutral. Reads as "sun-baked paper" or "dragon-scale catching light."
- **Dune Gold** (`#D4A017`): Elevated surfaces, panel separators, midtone warmth. The "raised" layer above the canvas.
- **Horizon Azure** (`#4A90E2`): Far-distance accents, the cool spike at the edge of vision — clear skies, distant haze. Used sparingly as a secondary cool counterpoint.

### Typographic Inks — Renaissance Gilding Tradition

- **Bole** (`#3D1208`): **Load-bearing reading color.** Body text, headings. Deep red-warm pencil doing the contrast work against Solar White (~13:1). The gilder's underground that makes gold leaf glow.
- **Rubric** (`#B82F08`): **Readable accent.** Links, hashtags, wayfinding distinction in flowing text. Manuscript-red. ~5.5:1 contrast — comfortable for reading, distinct from body without shouting.
- **Plasma Cyan** (`#00D4FF`): **Glow only.** Focus rings, active states, hover decoration. The cool spike in DPS's warm register — mirrors gold's role as the warm spike in DPN's cool register. Never used as readable text on cream (the contrast doesn't support it).

### Cool — Cyberpunk Injection

- **Solar Magenta** (`#FF1493`): Alert / now / urgent state. Reserved for transient signal — never for surface fill.
- **Electric Violet** (`#A020F0`): Magic / arcane / high-tier system elements. Same role as DPN's Electric Purple, just one notch hotter for the daylit context.
- **Luminescent Green** (`#00FF7F`): Data streams, system internals, growth/positive-state indicators. The "the machine is working" green.

### Warm — Fantasy Spike & Semantic Signal

- **Solar Crimson** (`#FF4500`): Warning / threshold / hot-spike. Active danger state, error states, "approaching limit."
- **Blaze Orange** (`#FF8C00`): Active processing, in-flight, "this is happening now." Less severe than crimson.
- **Dragon Gold** (`#FFD700`): Highlight / treasure / power-state. Used sparingly as ornament on the cream — too much gold-on-cream becomes invisible.
- **Sunlit Bronze** (`#DAA520`): Disabled / stale / aged-metal state. What rubric turns into when the data is no longer fresh.

### CSS tokens

```css
:root {
  /* Surface */
  --color-canvas:        #FFF8E1;
  --color-surface:       #FFFFFF;
  --color-surface-high:  #FAF4D8;
  --color-on-surface:    #3D1208;

  /* Typographic roles */
  --color-ink:           #3D1208;  /* Bole — load-bearing read color */
  --color-ink-muted:     #DAA520;  /* Sunlit Bronze — disabled / stale */
  --color-accent:        #B82F08;  /* Rubric — readable accent */
  --color-accent-hover:  #FF4500;  /* Solar Crimson — link hover */
  --color-glow:          #00D4FF;  /* Plasma Cyan — focus rings only */

  /* Semantic signal */
  --color-warning:       #FF4500;  /* Solar Crimson */
  --color-active:        #FF8C00;  /* Blaze Orange — in-flight */
  --color-danger:        #FF1493;  /* Solar Magenta — transient now state */
  --color-magic:         #A020F0;  /* Electric Violet — arcane / high-tier */
  --color-data:          #00FF7F;  /* Luminescent Green — protocol-flavored */

  /* Surface tones */
  --color-dune:          #D4A017;
  --color-azure:         #4A90E2;
  --color-gold-ornament: #FFD700;
}

[data-theme="dark"] {
  /* DPS is the LIGHT face of Dragonpunk. The dark mirror is DPN.
     This override block flips DPS to its DPN counterpart for users who
     prefer dark; tokens shift roles per the cross-system mapping
     documented in DPN.md § Typographic Roles. */
  --color-canvas:        #0A0A0F;
  --color-surface:       #2D2D3A;
  --color-surface-high:  #3D3D4A;
  --color-on-surface:    #E8E4DC;
  --color-ink:           #FFB800;  /* Dragon Gold */
  --color-ink-muted:     #CD7F32;
  --color-accent:        #00F5FF;  /* Neon Cyan does both roles in dark */
  --color-accent-hover:  #5CFAFF;
  --color-glow:          #00F5FF;
  --color-warning:       #FF6B35;
  --color-active:        #FF8C00;
  --color-danger:        #FF2D95;
  --color-magic:         #9D00FF;
  --color-data:          #39FF14;
}
```

## 3. Typography

The same three-family stack as DPN — `Inter` for UI, `JetBrains Mono` for data, `Major Mono Display` for display headings. The DragonPunk identity sits in the role-color mapping, not in custom typefaces.

```css
:root {
  --font-sans:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:    "JetBrains Mono", "IBM Plex Mono", ui-monospace, "SF Mono", monospace;
  --font-display: "Major Mono Display", "JetBrains Mono", monospace;

  /* Scale — 1.2 ratio (matches DPN) */
  --font-size-display: 2.488rem;
  --font-size-h1:      2.074rem;
  --font-size-h2:      1.728rem;
  --font-size-h3:      1.44rem;
  --font-size-h4:      1.2rem;
  --font-size-body:    1rem;
  --font-size-caption: 0.833rem;
  --font-size-micro:   0.694rem;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold:   600;

  --leading-tight:  1.15;
  --leading-normal: 1.45;
  --leading-loose:  1.65;

  --tracking-tight:  -0.01em;
  --tracking-normal: 0;
  --tracking-wide:   0.05em;
  --tracking-caps:   0.1em;
}
```

Body text uses `var(--color-ink)` (Bole). Links use `var(--color-accent)` (Rubric) with `var(--color-accent-hover)` (Solar Crimson) on hover. Focus glow uses `var(--color-glow)` (Plasma Cyan). Uppercase labels (status chips, dashboard headers) earn `tracking-caps` and read as "instrument-panel labels in a sunny control room."

**Critical contrast rule:** Plasma Cyan (`#00D4FF`) on Solar White has ~1.7:1 contrast — failing WCAG AA for any text use. DPS *never* renders text in Plasma Cyan on canvas. Cyan only appears as 2px+ outlines (focus rings, active-state borders) where it functions as edge-detection rather than text.

## 4. Spacing

Same 4-pixel base unit as DPN. Same scale at 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. The visual register changes; the dimensional grammar holds.

```css
:root {
  --space-0:  0;
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;
  --space-16: 64px;
}
```

## 5. Layout & Composition

Same composition rules as DPN: flush-edge containers by default, prose pinned at `72ch` left-aligned, 12-column grid at page level, flex with explicit gap for component-internal layout, no margin-collapse.

The only DPS-specific layout note: **sun-bleached negative space**. Cream canvas tolerates more whitespace than void does — DPN's tight dashboard density gives way slightly in DPS to a more spacious, sun-warmed cadence. Sections breathe at `--space-12`; consider `--space-16` for hero-level breaks. Cards sit on `--color-surface` (white) against the cream canvas, gaining presence by being *brighter* than their background rather than darker.

```css
.container {
  max-width: none;
  padding-inline: var(--space-6);
}
.container-prose {
  max-width: 72ch;
  text-align: left;
}
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4);
}
```

## 6. Components

### Card / Panel

```css
.dps-panel {
  background: var(--color-surface);            /* pure white, brighter than cream canvas */
  color: var(--color-ink);
  border: 1px solid var(--color-surface-high); /* faint warm border */
  border-radius: 0;
  padding: var(--space-4) var(--space-6);
  box-shadow: none;
  font-family: var(--font-sans);
}

.dps-panel--data {
  font-family: var(--font-mono);
  font-size: var(--font-size-caption);
  line-height: var(--leading-normal);
  background: var(--color-surface-high);       /* subtler than pure white for data panes */
}
```

### Button

```css
.dps-btn {
  background: transparent;
  color: var(--color-ink);
  border: 1px solid var(--color-ink);
  border-radius: 0;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  cursor: pointer;
  transition: color 80ms linear, border-color 80ms linear, background 80ms linear;
}
.dps-btn:hover {
  background: var(--color-ink);
  color: var(--color-canvas);
}
.dps-btn:focus-visible {
  outline: 2px solid var(--color-glow);        /* Plasma Cyan ring on cream */
  outline-offset: 2px;
}
.dps-btn--primary {
  background: var(--color-ink);
  color: var(--color-canvas);
}
.dps-btn--accent {
  border-color: var(--color-accent);           /* Rubric */
  color: var(--color-accent);
}
.dps-btn--accent:hover {
  background: var(--color-accent);
  color: var(--color-canvas);
}
.dps-btn--danger {
  border-color: var(--color-warning);
  color: var(--color-warning);
}
```

### Status chip / LED

```css
.dps-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: transparent;
  color: var(--color-ink);
  border: 1px solid currentColor;
  padding: 2px var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-micro);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
.dps-chip--ok      { color: var(--color-data); }       /* Luminescent Green */
.dps-chip--active  { color: var(--color-active); }     /* Blaze Orange */
.dps-chip--warn    { color: var(--color-warning); }    /* Solar Crimson */
.dps-chip--alert   { color: var(--color-danger); }     /* Solar Magenta */
.dps-chip--magic   { color: var(--color-magic); }      /* Electric Violet */
```

### Link

```css
.dps-link {
  color: var(--color-accent);                  /* Rubric — readable on cream */
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  transition: color 80ms linear;
}
.dps-link:hover {
  color: var(--color-accent-hover);            /* Solar Crimson — hot spike on hover */
}
```

### Input

```css
.dps-input {
  background: var(--color-surface);            /* pure white field on cream canvas */
  color: var(--color-ink);
  border: 1px solid var(--color-surface-high);
  border-radius: 0;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-body);
  caret-color: var(--color-glow);              /* Plasma Cyan caret */
}
.dps-input:focus-visible {
  outline: 0;
  border-color: var(--color-glow);             /* Cyan border on focus */
  box-shadow: 0 0 0 1px var(--color-glow);     /* one-pixel inset cyan glow */
}
```

### Heading + caption

```css
.dps-h1 {
  font-family: var(--font-sans);
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);                     /* Bole */
  margin-block-end: var(--space-4);
}
.dps-h2-accent {
  /* Wayfinding heading — Rubric for important-but-secondary breaks */
  font-family: var(--font-sans);
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);                  /* Rubric */
}
.dps-caption {
  font-family: var(--font-mono);
  font-size: var(--font-size-caption);
  color: var(--color-ink-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
```

## 7. Motion & Interaction

Identical motion discipline to DPN: **state-change only**. No ambient animation, no parallax, no infinite loops. Transitions 80–120ms. One-shot pulses on alert chips, never `animation-iteration-count: infinite`.

```css
:root {
  --motion-fast:   80ms;
  --motion-normal: 120ms;
  --motion-slow:   160ms;
  --motion-ease:   cubic-bezier(0.2, 0, 0.4, 1);
}

@keyframes dps-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.5; }
  100% { opacity: 1; }
}

.dps-chip--alert {
  animation: dps-pulse var(--motion-slow) ease-in-out;
  animation-iteration-count: 1;
}

@media (prefers-reduced-motion: reduce) {
  .dps-chip--alert,
  .dps-btn {
    animation: none;
    transition: none;
  }
}
```

## 8. Voice & Brand

DPS's voice is **same factual register as DPN, but daylit** — same terse, technical, no-exclamation-marks discipline, with copy that implies open horizons rather than wet streets. Status chips stay uppercase mono; body copy stays sentence case; error messages stay past-tense factual.

Tone calibration:
- Status: `READY · ACTIVE · IDLE · SYNCING` — identical vocabulary to DPN
- Errors: "Authentication declined." — past-tense factual
- Empty state: "Nothing scheduled." — flat, neutral
- Confirmation: "Saved." — single word

Iconography matches DPN: line-only, 1.5px stroke, square caps, square corners. Reserved palette is ink color (Bole) or accent color (Rubric) — never custom hues.

The brand lineage is **Orbis under sun** — the same 10,500-year-old setting, but rooftop gardens, solar-sailed spires, dragons basking on heat-baked stone instead of slinking through wet alleys. The aesthetic does not announce the worldbuilding; it implies an old, layered, lived-in civilization that's *uplit* rather than backlit.

## 9. Anti-patterns

- **Sterile white** (`#FFF` as canvas). The canvas is warm cream `#FFF8E1`; nothing else. Pure white is reserved for elevated surface (`var(--color-surface)`) where a brighter card sits on the cream.
- **Cyan as text** on cream. Plasma Cyan fails contrast for body or link text. Cyan is exclusively a 2px+ outline / focus-ring / caret color.
- **Gold-ornament on cream as primary signal.** Dragon Gold (`#FFD700`) on Solar White is decorative; never use it as text or as the primary signal color. Bole or Rubric carry signal.
- **Rounded corners > 0px on rectangles.** Same DPN rule. Square always. The only allowed roundness is `border-radius: 50%` for circles.
- **Drop shadows.** Use border + brighter-surface elevation. No `box-shadow` except the 1px cyan focus-glow on inputs (a *signal*, not a depth illusion).
- **Background gradients on surfaces.** No gradient cards, no gradient buttons, no ambient wash on the canvas. The only allowed gradient is a functional cyan→crimson context-depth signal (mirroring DPN's cyan→ember).
- **Ambient idle animation.** No `animation: ... infinite`. No "breathing" UI. State change only.
- **Light/dark theme as identical palettes.** DPS's dark-mode override is *DPN's tokens* — Bole becomes Dragon Gold, Rubric becomes Neon Cyan, Plasma Cyan stays cyan. Same brand, different palette family, not duplicated values.
- **Centered prose.** Same DPN rule — long-form text is left-aligned. Centered = decorative.
- **Cute or whimsical microcopy.** Solar daylight doesn't soften the voice; the world is just as old in DPS as in DPN. No "Oops!", no emoji-as-decoration in errors.
- **Sans-serif numeric data.** Numbers in tables, code, terminals always render in `--font-mono`. Same rule as DPN — the data-density discipline crosses themes.
- **Hover-only affordances.** Anything interactive must be discoverable without hover; hover is decoration on already-visible affordance.

---

**Prior art / influences:** Plan 9 from Bell Labs, Acme editor, NeXTSTEP system fonts and chrome, Renaissance manuscript rubrication (bole and rubric as named ink roles), solarpunk illustration tradition, the Mixxx LateNight-DPS skin, the `dps-solar.css` light-toggle for DPN, the cross-system role-mapping documented in DPN.md § Typographic Roles, and the Dragonpunk Network public-facing brand surface.
