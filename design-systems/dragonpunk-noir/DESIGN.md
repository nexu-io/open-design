# Design System Inspired by DragonPunk Noir

> Category: Bold & Expressive
> Noir cinematography meets cyberpunk neon and high-fantasy mythos — the dark face of the Dragonpunk world.

## 1. Visual Theme & Atmosphere

DragonPunk Noir (DPN) is film noir wearing fiber-optic veins. The default surface is **void-black** — not a pure `#000` but `#0A0A0F`, the warmest possible black, the color of a wet stone street at 3 AM. Against that void, the entire experience is a **70/20/10 budget**: 70% deep tones do the structural work, 20% neon does the signaling, 10% warm fantasy-accent breaks the cold. Nothing here is saturated by default; saturation is *event*.

The atmospheric law is **operational dashboard, not arcade marquee**. Think reactor control room: a calm dark canvas where 95% of pixels do not move, do not glow, do not shimmer — and a small minority of pixels carry meaning by virtue of their flare. Cyan glow under a focus ring is data. Gold ink in a heading is fact. Magenta pulse on a warning chip is *now*. The same surface that looks meditative in idle state lights up *only* when something has changed.

Typographically, DPN is **Plan 9 / Acme / NeXTSTEP** in its bones — fixed-width where data lives, generous line-height, square corners, no rounded box-drawing, no shadows, no blur, no animations except where state is changing. The DragonPunk part shows up in the chrome: dragon-gold ink and neon-cyan accent that say "this is a world where ancient magic compiles to fiber-optic spell-code."

**Key Characteristics:**
- Void canvas (`#0A0A0F`) — warmest possible black, never `#000`
- Dragon-gold ink (`#FFB800`) as the load-bearing reading color (~12:1 contrast on void)
- Cyan-on-void (`#00F5FF`) collapses readable-accent and focus-glow into one token (~110:1 contrast headroom)
- Square corners exclusively — no border-radius anywhere except where a circle is the *point* (avatars, dots)
- No drop shadows. No blur. No glass. No skeumorphism. Plan 9 / Acme lineage
- Neon flares treated as instrument-panel LEDs: present, signal-carrying, never decorative
- Motion is minimal and reserved for state transitions; no ambient animation, no parallax
- The aesthetic implies a *lived-in* world with 10,500 years of layered history — not a tech demo

## 2. Color

The palette is organized by **function-budget**: void family does structure, neon family does signal, warm family does the fantasy-accent break. Every token is wired into `:root` and `[data-theme="dark"]` overrides.

### Primary — Noir Foundation

- **Void Black** (`#0A0A0F`): Primary canvas. Not pure black; carries a barely-perceptible blue undertone that reads as "stone at night" rather than "OLED off." Default page background, default container background.
- **Smoke Grey** (`#2D2D3A`): Elevated surfaces, panel separators, fog/midtone shadows. The "raised" layer above void.
- **Bone White** (`#E8E4DC`): Highlights, fog particles, dragon-bone, eyes-in-darkness. Reserved for moments demanding maximum lightness against void.

### Neon — Cyberpunk Injection

- **Neon Cyan** (`#00F5FF`): The single load-bearing accent. Links, focus rings, active states, hover decoration. On void, ~110:1 contrast — high enough that one color serves both *readable-accent* and *focus-glow* roles. Use generously where status matters; never as ambient decoration.
- **Magenta Pulse** (`#FF2D95`): Alert / now / urgent state. Reserved for transient signal — never for surface fill.
- **Electric Purple** (`#9D00FF`): Magic / arcane / high-tier system elements. Distinct from magenta by being deeper and more saturated; reads as "spell" where magenta reads as "alarm."
- **Toxic Green** (`#39FF14`): Data streams, system internals, "the machine is working" indicators. Terminal-flavored; reads as raw protocol.

### Warm — Fantasy Accent

- **Dragon Gold** (`#FFB800`): **Typographic ink role.** This is the load-bearing reading color, the typographic pencil. Body text, headings — gold-on-void clears ~12:1 contrast. Also: treasure, flame, power, dragon eyes in non-typographic use.
- **Ember Orange** (`#FF6B35`): Warning role. The warm spike at the limit — context-depth indicators (cyan→ember gradient in ChatHUD), error states, "approaching threshold."
- **Blood Crimson** (`#8B0000`): Danger / violence / old magic. Deeper than ember; reads as "consequence" where ember reads as "warn." Reserved for destructive-action confirmations.
- **Ancient Bronze** (`#CD7F32`): Aged metal, artifacts, history. Used for inactive/disabled states of warm accents — what gold turns into when the data is stale.

### CSS tokens

```css
:root {
  /* Surface */
  --color-canvas:        #0A0A0F;
  --color-surface:       #2D2D3A;
  --color-surface-high:  #3D3D4A;
  --color-on-surface:    #E8E4DC;

  /* Typographic roles */
  --color-ink:           #FFB800;  /* Dragon Gold — load-bearing read color */
  --color-ink-muted:     #CD7F32;  /* Ancient Bronze — disabled / stale */
  --color-accent:        #00F5FF;  /* Neon Cyan — readable accent + focus glow */
  --color-accent-hover:  #5CFAFF;  /* Cyan lightened ~20% on hover */

  /* Semantic signal */
  --color-warning:       #FF6B35;  /* Ember Orange */
  --color-danger:        #FF2D95;  /* Magenta Pulse — transient now state */
  --color-deep-danger:   #8B0000;  /* Blood Crimson — destructive confirm */
  --color-magic:         #9D00FF;  /* Electric Purple — arcane / high-tier */
  --color-data:          #39FF14;  /* Toxic Green — protocol-flavored */

  /* Bone overlay */
  --color-bone:          #E8E4DC;
}

[data-theme="dark"] {
  /* DPN is dark-by-default; tokens above already are the dark theme.
     Override block kept present per Lens A; values intentionally identical. */
  --color-canvas:        #0A0A0F;
  --color-surface:       #2D2D3A;
  --color-on-surface:    #E8E4DC;
  --color-ink:           #FFB800;
  --color-accent:        #00F5FF;
}
```

## 3. Typography

A **three-family stack** with deliberate role separation: serif-free, mono-forward, with optional display weight for headings carrying the DragonPunk world signal.

- **Body / UI**: `Inter`, system-ui fallback. Reads quietly against void; no swashes, no character. Doing the structural work.
- **Mono**: `JetBrains Mono` (preferred), `IBM Plex Mono` fallback, `monospace` final. Where data lives. Code blocks, terminal panes, table values, technical metadata.
- **Display** (optional): `Major Mono Display` for hero numerals and section labels that carry signal-character. Reserved.

Type scale uses a 1.2 ratio (minor third), tightly cadenced so that information density feels dashboard-correct rather than magazine-roomy.

```css
:root {
  --font-sans:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:    "JetBrains Mono", "IBM Plex Mono", ui-monospace, "SF Mono", monospace;
  --font-display: "Major Mono Display", "JetBrains Mono", monospace;

  /* Scale — 1.2 ratio */
  --font-size-display: 2.488rem;  /* 39.8px */
  --font-size-h1:      2.074rem;  /* 33.2px */
  --font-size-h2:      1.728rem;  /* 27.6px */
  --font-size-h3:      1.44rem;   /* 23px */
  --font-size-h4:      1.2rem;    /* 19px */
  --font-size-body:    1rem;      /* 16px */
  --font-size-caption: 0.833rem;  /* 13.3px */
  --font-size-micro:   0.694rem;  /* 11px */

  /* Weights */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold:   600;

  /* Leading */
  --leading-tight:  1.15;
  --leading-normal: 1.45;
  --leading-loose:  1.65;

  /* Tracking */
  --tracking-tight:  -0.01em;
  --tracking-normal: 0;
  --tracking-wide:   0.05em;
  --tracking-caps:   0.1em;  /* small-caps + uppercase labels */
}
```

All body text uses `var(--color-ink)` (Dragon Gold). All links use `var(--color-accent)` (Neon Cyan). All headings use `var(--color-ink)` but at heavier weight + tighter leading. Uppercase labels (status chips, section anchors, dashboard headers) use `tracking-caps` to earn the dashboard-instrument signal.

## 4. Spacing

A **4-pixel base unit**, with steps at 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Tight at the small end (dashboard data density), generous at the large end (breathing between sections). No half-pixel values; no irregular steps.

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

Component-internal padding tends toward `--space-2` / `--space-3`. Component-to-component spacing tends toward `--space-4` / `--space-6`. Section breaks use `--space-12`.

## 5. Layout & Composition

The default container is **flush-edge with no max-width** — the canvas wants to fill the screen the way a reactor console does. When narrower reading is needed (long-form prose, articles), use a max-width of `72ch` and align left, never centered. **Centered prose is decorative; left-aligned prose is operational.**

Grid is on a 12-column system at the page level, but components prefer **flex with explicit gap** over grid for internal composition. Avoid `grid-template-areas` for anything except actual map-shaped layouts (HUD, dashboard).

Vertical rhythm follows the spacing scale: section heads sit `--space-12` above content, paragraphs sit `--space-4` apart, list items sit `--space-2` apart. No margin-collapse fuckery — every box owns its own padding.

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
.dpn-panel {
  background: var(--color-surface);
  color: var(--color-ink);
  border: 1px solid var(--color-surface-high);
  border-radius: 0;             /* square — no exceptions */
  padding: var(--space-4) var(--space-6);
  box-shadow: none;             /* no shadows ever */
  font-family: var(--font-sans);
}

.dpn-panel--data {
  font-family: var(--font-mono);
  font-size: var(--font-size-caption);
  line-height: var(--leading-normal);
}
```

### Button

```css
.dpn-btn {
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
.dpn-btn:hover {
  background: var(--color-ink);
  color: var(--color-canvas);
}
.dpn-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.dpn-btn--primary {
  background: var(--color-ink);
  color: var(--color-canvas);
}
.dpn-btn--danger {
  border-color: var(--color-deep-danger);
  color: var(--color-deep-danger);
}
```

### Status chip / LED

```css
.dpn-chip {
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
.dpn-chip--ok      { color: var(--color-accent); }
.dpn-chip--warn    { color: var(--color-warning); }
.dpn-chip--alert   { color: var(--color-danger); }
.dpn-chip--magic   { color: var(--color-magic); }
.dpn-chip--data    { color: var(--color-data); }
```

### Link

```css
.dpn-link {
  color: var(--color-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  transition: color 80ms linear;
}
.dpn-link:hover {
  color: var(--color-accent-hover);
}
```

### Input

```css
.dpn-input {
  background: var(--color-canvas);
  color: var(--color-ink);
  border: 1px solid var(--color-surface-high);
  border-radius: 0;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-body);
  caret-color: var(--color-accent);
}
.dpn-input:focus-visible {
  outline: 0;
  border-color: var(--color-accent);
}
```

### Heading + caption

```css
.dpn-h1 {
  font-family: var(--font-sans);
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  margin-block-end: var(--space-4);
}
.dpn-caption {
  font-family: var(--font-mono);
  font-size: var(--font-size-caption);
  color: var(--color-ink-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
```

## 7. Motion & Interaction

Motion is **state-change-only**. No ambient animation, no parallax, no infinite loops, no "delight" particles. When a state changes, the transition is 80–120ms linear or ease-out — quick enough to feel direct, slow enough to be perceived as motion rather than a jump cut.

Allowed motion:
- Color/opacity transitions on hover, focus, active (80–120ms)
- Mount / unmount fades on modal-shape elements (120–160ms)
- One-shot pulse on state-change chips (a single `keyframes` cycle, never `infinite`)

Disallowed motion: parallax, marquee scrolls, particle effects, ambient idle animation, hover bounces, micro-wiggles.

```css
:root {
  --motion-fast:   80ms;
  --motion-normal: 120ms;
  --motion-slow:   160ms;
  --motion-ease:   cubic-bezier(0.2, 0, 0.4, 1);
}

@keyframes dpn-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
}

.dpn-chip--alert {
  animation: dpn-pulse var(--motion-slow) ease-in-out;
  animation-iteration-count: 1;
}

@media (prefers-reduced-motion: reduce) {
  .dpn-chip--alert,
  .dpn-btn {
    animation: none;
    transition: none;
  }
}
```

## 8. Voice & Brand

DPN's voice in copy is **terse, technical, slightly noir-poetic**. Status messages read like a ship's log; error messages read like a detective taking notes. Uppercase labels for status chips. Sentence case for everything else. Never exclamation marks; the visual neon flare carries emphasis already.

Tone calibration:
- Status: `READY · WAITING · ACTIVE · IDLE` — uppercase, terse, single word
- Errors: "Authentication declined." — past-tense factual, no "Oops!"
- Empty state: "Nothing here yet." — flat, not encouraging
- Confirmation: "Saved." — single word, no exclamation

Iconography is line-only, never filled. 1.5px stroke, square caps, square corners. Reserved palette: ink color or accent color, nothing custom.

The brand pulls visual identity from the **Orbis world** — a 10,500-year-old setting where colony-ship descendants live alongside dragons and use spell-code for fiber-optic runes. The aesthetic does not announce this; it just *implies* a layered, lived-in world that's older than the user and indifferent to user-flattery.

## 9. Anti-patterns

- **Rounded corners > 0px on rectangles.** Square always. The single allowed roundness is `border-radius: 50%` for avatars, status dots, and circular elements that are circular because they're circles. Never `8px`, never `4px`, never `2px`.
- **Drop shadows.** Use border or surface elevation (different background) for separation. No `box-shadow`. Period.
- **Gradients on surfaces.** No background gradients on cards, buttons, page chrome. The only allowed gradient is a *signal* — a 1px focus-ring stroke fading from cyan→ember in a depth-indicator. Functional, not decorative.
- **Saturation on canvas.** The canvas is `--color-canvas`; nothing else. Don't tint with cyan, don't paint with subtle gradients, don't add ambient color washes. Canvas stays canvas.
- **Animation on idle.** No CSS `animation: ... infinite`. No "breathing" buttons. No spinning anything that isn't actively loading. State change *only*.
- **Centered prose.** Long-form text never gets `text-align: center`. Headlines occasionally; bodies never.
- **Cute or whimsical microcopy.** "Oops!", "Yay!", emojis-as-decoration in error messages — none of it. The world is too old for that voice.
- **Multiple neons in a single chip.** A chip is one color. Cyan or ember or magenta, not a gradient between them. The exception is the cyan→ember context-depth indicator which is itself a single semantic role.
- **Sans-serif numeric data.** Numbers in tables, code, terminals always render in `--font-mono`. Never `--font-sans` for any column that contains digits primarily.
- **Hover styles on touch-only components.** Nothing should require hover to be discoverable; hover is *decoration on already-visible affordance*.

---

**Prior art / influences:** Plan 9 from Bell Labs, Acme editor, NeXTSTEP system fonts and chrome, Blade Runner 2049 set design, ChatHUD's terminal UI conventions, the Mixxx LateNight-DPN skin, the dpn-void.css scheme, the Dragonpunk Network brand surface for the public-facing site.
