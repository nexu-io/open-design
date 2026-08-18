# Motion Fit Design System

> Category: Health & Fitness

A normalized Open Design package derived from the Motion Fit library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Brand accent shifts by mode: `#ff4000` in light UI and `#00ff85` in dark UI — intense, athletic, and progress-driven rather than soft or lifestyle-coded.
- Radius is locked to `0px` — every control and surface stays sharp, mechanical, and performance-focused.
- Spacing runs on a `4px` base token; no global control-height token is defined, so keep mobile layouts compact instead of inventing a taller default.
- Type is `Orbitron` for the primary sans voice, with `serif` and `monospace` fallbacks kept generic and secondary.
- Voice is short, imperative, and metric-led: "Start Workout", "Recovery Score", and "Daily Streak" set a disciplined, no-fluff tone.
- Shadows are effectively flat: `2px 2px 0.5px 0px` with `0` opacity across the token set, so hierarchy comes from contrast, borders, and accent color.
- Dark surfaces anchor the system: `#0a0a0a`, `#161616`, and `#27272a` carry most UI structure, with bright accent hits used sparingly for action and status.
- Signature quirk: performance visuals pull from electric chart colors like `#d6ff0a`, `#6200ff`, `#00ff1e`, and `#ff3def`, giving analytics a synthetic training-lab feel.

## Color Roles

- **Canvas:** `#292929` → `--bg`.
- **Surface:** `#030303` → `--surface`.
- **Primary text:** `#e2e8f0` → `--fg`.
- **Muted text:** `#a1a1aa` → `--muted`.
- **Accent:** `#ff4000` → `--accent`.
- **Border:** `#292929` → `--border`.
- **Danger:** `#ef4444` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Type is `Orbitron` for the primary sans voice, with `serif` and `monospace` fallbacks kept generic and secondary.

## Spacing and Layout

- Radius is locked to `0px` — every control and surface stays sharp, mechanical, and performance-focused.
- Spacing runs on a `4px` base token; no global control-height token is defined, so keep mobile layouts compact instead of inventing a taller default.
- Type is `Orbitron` for the primary sans voice, with `serif` and `monospace` fallbacks kept generic and secondary.

## Component Inventory

- **Button** (action): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Card** (surface): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Bottom Navigation** (navigation): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Input** (form): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Avatar** (identity): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.
- **Chip** (selection): Use the exported component anatomy and declared states; do not recreate it as an unrelated pattern.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Radius is locked to `0px` — every control and surface stays sharp, mechanical, and performance-focused.

## Motion

- Use `--motion-fast` for hover and focus feedback and `--motion-base` for state changes.
- Prefer short ease-out transitions; remove non-essential motion when reduced motion is requested.

## Accessibility

- Radius is locked to `0px` — every control and surface stays sharp, mechanical, and performance-focused.
- Shadows are effectively flat: `2px 2px 0.5px 0px` with `0` opacity across the token set, so hierarchy comes from contrast, borders, and accent color.

## Avoid

- Do not invent a near-copy when a mapped component exists.
- Do not bypass the no-match confirmation rule.
- Do not add undeclared tokens, arbitrary color literals, or unverified component states.
