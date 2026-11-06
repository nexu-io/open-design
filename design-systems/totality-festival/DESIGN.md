---
name: Totality Festival Design System
colors:
  surface: "#121318"
  surface-dim: "#121318"
  surface-bright: "#38393f"
  surface-container-lowest: "#0d0e13"
  surface-container-low: "#1a1b21"
  surface-container: "#1e1f25"
  surface-container-high: "#292a2f"
  surface-container-highest: "#34343a"
  on-surface: "#e3e1e9"
  on-surface-variant: "#d0c6ab"
  inverse-surface: "#e3e1e9"
  inverse-on-surface: "#2f3036"
  outline: "#999077"
  outline-variant: "#4d4732"
  surface-tint: "#e9c400"
  primary: "#fff6df"
  on-primary: "#3a3000"
  primary-container: "#ffd700"
  on-primary-container: "#705e00"
  inverse-primary: "#705d00"
  secondary: "#bdf4ff"
  on-secondary: "#00363d"
  secondary-container: "#00e3fd"
  on-secondary-container: "#00616d"
  tertiary: "#fcf3ff"
  on-tertiary: "#3b2754"
  tertiary-container: "#e7d1ff"
  on-tertiary-container: "#6b5586"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  background: "#121318"
  on-background: "#e3e1e9"
  surface-variant: "#34343a"
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 72px
    fontWeight: "700"
    lineHeight: 80px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: "600"
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  label-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: "500"
    lineHeight: 20px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: 12px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.primary-fixed}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: 12px
    height: 48px
  card-glass-level-2:
    backgroundColor: rgba(52, 52, 58, 0.2)
    rounded: "{rounded.xl}"
    padding: "{spacing.gutter}"
  input-field:
    backgroundColor: "{colors.surface-container-lowest}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 12px
  hero-headline:
    textColor: "{colors.primary}"
    typography: "{typography.headline-xl}"
  badge-celestial:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-tertiary-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 4px
---

# Design System Inspired by Totality Festival

> Category: Themed & Unique
> Surface: web
> A cosmic-premium, glassmorphic dark system that captures the visceral awe of a solar eclipse — obsidian surfaces, amber "corona" highlights, and cyan atmospheric accents.

## 1. Visual Theme & Atmosphere

"Cosmic Premium" — the visceral tension and awe of a solar eclipse. The aesthetic blends the stark mystery of deep space with the explosive brilliance of the solar corona. Surfaces appear as translucent obsidian slabs floating over nebula-like gradients. High-energy amber accents represent the "diamond ring" flash — they make the interface feel luminous and alive rather than heavy or muted.

- **Visual style:** dark, glassmorphic, cinematic
- **Color stance:** obsidian neutral, amber corona accent, cyan atmospheric
- **Design intent:** Keep outputs recognizable as a premium festival / creator product; use radial gradients for backgrounds to simulate the circular nature of the eclipse.

## 2. Color

- **Primary:** `#fff6df` — Amber / white-gold, the solar corona and "diamond ring" flash. Used for critical CTAs and high-importance highlights.
- **Primary Container:** `#ffd700` — Pure corona gold. Reserved for the single most important highlight on a screen.
- **Secondary:** `#bdf4ff` — Soft cyan, the atmospheric thinning and ethereal glow of the sky during totality. Used for interactive states and secondary emphasis.
- **Secondary Container:** `#00e3fd` — Vivid cyan for interactive ambient glow rims.
- **Tertiary:** `#fcf3ff` — Faint lavender-white for subtle tinted highlights.
- **Tertiary Container:** `#e7d1ff` — Deep indigo haze, celestial badges.
- **Surface:** `#121318` — Obsidian / near-black foundation.
- **Surface Container:** `#1e1f25` — Slightly elevated obsidian for cards.
- **Surface Container High:** `#292a2f` — Elevated panels, active states.
- **Text:** `#e3e1e9` — Warm off-white for primary body copy and headlines.
- **Text Muted:** `#d0c6ab` — Warm parchment tone for metadata and labels.
- **Outline:** `#999077` — Low-contrast warm gray for hairline borders.

- Favor Primary (#fff6df) and Primary Container (#ffd700) for the "corona flash" moments — max 3 per screen.
- Use Secondary (#bdf4ff / #00e3fd) for interactive states, never for decorative flourishes.
- Surfaces stack as semi-transparent glass: `rgba(255, 255, 255, 0.05-0.1)` with `backdrop-filter: blur(20px)` and a 1px `rgba(255, 255, 255, 0.1)` inner border to simulate light refraction.

## 3. Typography

A dual-font strategy to balance cinematic impact with utility.

- **Display / Headings:** Space Grotesk — geometric, technical, futuristic-astronomical tone. Tight letter spacing (`-0.02em` to `-0.04em`) on large headings to feel "locked" and monumental.
- **Body / Long-form:** Inter — neutral, highly legible in low-light environments.
- **Labels:** Space Grotesk with wide tracking (`0.1em`) and uppercase, to read as "coordinates" or "readouts" rather than UI chrome.

Apply a subtle text-shadow or low-opacity primary-colored glow to `headline-xl` elements on the darkest backgrounds for a truly cinematic feel — radiant, not static.

## 4. Layout & Spacing

- **Grid:** 12-column fixed grid on desktop with generous outer margins (64–80px) to simulate the isolation of a celestial body in the void. Fluid model on mobile with 16px margins.
- **Rhythm:** 8px base unit. Internal component spacing tight (8 / 16px); external section margins wide (64 / 80px) to create distinct "islands" of content.
- **Max width:** 1280px for content containers.
- **Negative space is a feature, not a cost.** Prefer breathing room over density.

## 5. Elevation & Depth

Depth is achieved through **glassmorphism** and light-based layering — not traditional drop shadows.

- **Level 1 (Base):** Deep obsidian surface with an optional radial gradient vignette in `#1a1b21` → `#121318`.
- **Level 2 (Panels):** Semi-transparent surfaces at `rgba(52, 52, 58, 0.2)` with `backdrop-filter: blur(20px)` and a 1px inner stroke at `rgba(255, 255, 255, 0.1)` to simulate refraction on a glass edge.
- **Level 3 (Interactive / Active):** An **ambient glow** — a soft, diffused shadow tinted with Secondary (`#00e3fd`) or Primary Container (`#ffd700`), creating the impression of light bleeding from behind the object.

## 6. Shapes

Shape language is **soft-technical**. Geometric overall, but small corner radii soften aggression.

- **Buttons, inputs:** `rounded-lg` (8px).
- **Cards, featured containers:** `rounded-xl` (12px).
- **Badges, pills:** `rounded-full`.
- **Decorative elements:** circles and perfect arcs are encouraged to mirror the orbital / eclipse theme.

## 7. Components

- **Primary button:** Amber fill on obsidian, with a luminous amber glow on hover (mimics the diamond-ring flash). Space Grotesk label, uppercase, `0.1em` tracking.
- **Secondary button:** Transparent fill, cyan outline and label — suggests the sky's transition during totality.
- **Glass card (level 2):** `rgba(52,52,58,0.2)` + 20px blur + 1px inner white stroke + generous internal padding.
- **Input field:** Anchored in the deepest surface (`#0d0e13`) for maximum contrast; cyan border on focus.
- **Badges:** Pill-shaped with the tertiary container color; reserved for "celestial" metadata (status, live indicators).

## 8. Do's & Don'ts

- **Do** use Primary Container (`#ffd700`) no more than 3 times per screen — it's the flash, not the background.
- **Do** pair large Space Grotesk headlines with a subtle primary-colored glow on dark surfaces.
- **Do** tint shadows and glows with Primary or Secondary — never use pure gray shadows.
- **Don't** use solid opaque fills for cards — break the glass illusion.
- **Don't** combine amber and cyan glows on the same element — choose one depending on state (amber = highlight / CTA; cyan = interactive / focus).
- **Don't** use sharp 0-radius corners except for data tables where structure outweighs warmth.
