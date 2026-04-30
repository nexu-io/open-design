# iOS 26 Liquid Glass

> Category: Mobile & OS
> James's iOS 26 Liquid Glass system. Translucent lensing materials, layered mobile chrome, SF typography, adaptive contrast, and accessibility-aware motion.

## 1. Source And Intent

This design system is derived from the local OneShot reference files:

- `liquid_glass_design_system---64829619-43c9-475f-bfca-399c0c3c4f7c.docx`
- `liquid_glass_prototype---4d424121-2626-45c7-a944-e1efff6d6d75.html`

Use it for iOS 26-style mobile app concepts, lock-screen surfaces, Control
Center-style dashboards, widgets, tab bars, modal sheets, floating action
surfaces, and Apple-adjacent product UI. The goal is not generic frosted glass.
The goal is a layered mobile interface where translucent surfaces lens the
background, preserve legibility, and respond to interaction.

## 2. Core Philosophy

Liquid Glass is a four-layer system:

| Layer | Role | Rules |
| --- | --- | --- |
| Background | Foundation | Wallpaper, photo, video, app content, or atmospheric field. Never apply glass to the background itself. |
| Glass | Floating UI | Cards, widgets, tab bars, nav bars, sheets, popovers, Control Center tiles, HUDs. Uses blur, saturation, translucent fill, border, shadow, and highlight. |
| Solid | Focus surface | Reading views, photo/video canvases, map/content surfaces, or any area where glass would hurt comprehension. |
| Dynamic | Responsive state | Elements that adapt to content, motion, brightness, or interaction state. |

Every glass element should demonstrate:

- Lensing: the surface bends and concentrates background light; it is not just a flat opacity overlay.
- Specular response: a highlight or sheen tracks pointer, tilt, or scene light.
- Materialization: surfaces appear by modulating depth and light, not by simply fading in.
- Adaptive shadow: shadow softness and offset respond to what sits beneath.
- Contrast maintenance: text and controls remain readable over variable backgrounds.

## 3. Material Tiers

Choose one tier per surface. Do not mix several tiers in one component unless
the hierarchy truly requires it.

| Tier | Approx blur | Saturation | Base opacity | Use |
| --- | ---: | ---: | ---: | --- |
| Ultra Thin | 16-20px | 140% | 18-35% light, 22-40% dark | Hints, HUD overlays, photo/video chrome that should recede. |
| Thin | 24-30px | 160% | 32-45% light, 34-52% dark | Lightweight nav bars, search fields, inline popovers, small notifications. |
| Regular | 40-50px | 180% | 55-58% light, 50-62% dark | Default cards, widgets, menus, tab bars, Control Center tiles. |
| Thick | 56-70px | 180% | 72% light, 68-74% dark | Modal sheets, interruptive panels, action sheets, high-legibility surfaces. |
| Chrome | 60-90px | 180-200% | 82-84% light, 78-86% dark | Persistent system chrome, keyboard toolbars, status surfaces. |
| Clear | 8px | 110% | 6% light, 8% dark | Home-screen icon aesthetic only. Do not place body text on Clear. |

Selection rules:

- Start with Regular for new floating surfaces.
- Use Thin when the surface should feel lightweight and secondary.
- Use Thick only for task-interrupting panels or dense controls.
- Reserve Chrome for persistent system-level UI.
- Do not use Clear for text-heavy UI.

## 4. Tokens

### Material

```css
:root {
  --glass-blur-ultrathin: 20px;
  --glass-blur-thin: 30px;
  --glass-blur-regular: 50px;
  --glass-blur-thick: 70px;
  --glass-blur-chrome: 90px;
  --glass-saturate: 180%;

  --glass-fill-l-ultrathin: rgba(255, 255, 255, .35);
  --glass-fill-l-thin: rgba(255, 255, 255, .45);
  --glass-fill-l-regular: rgba(255, 255, 255, .58);
  --glass-fill-l-thick: rgba(255, 255, 255, .72);
  --glass-fill-l-chrome: rgba(255, 255, 255, .84);

  --glass-fill-d-ultrathin: rgba(28, 28, 30, .40);
  --glass-fill-d-thin: rgba(28, 28, 30, .52);
  --glass-fill-d-regular: rgba(28, 28, 30, .62);
  --glass-fill-d-thick: rgba(28, 28, 30, .74);
  --glass-fill-d-chrome: rgba(28, 28, 30, .86);

  --glass-border-l: rgba(255, 255, 255, .55);
  --glass-border-d: rgba(255, 255, 255, .18);
}
```

### Color

- **System Background Light** (`#F2F2F7`): app canvas behind floating glass.
- **System Background Dark** (`#000000`): dark-mode canvas.
- **Label Light** (`#1D1D1F`): primary text on light surfaces.
- **Label Dark** (`#F5F5F7`): primary text on dark surfaces.
- **Secondary Label Light** (`rgba(60,60,67,0.68)`): captions and metadata.
- **Secondary Label Dark** (`rgba(235,235,245,0.68)`): dark-mode captions.
- **Tertiary Label Light** (`rgba(60,60,67,0.38)`): disabled and auxiliary text.
- **Tertiary Label Dark** (`rgba(235,235,245,0.38)`): dark disabled and auxiliary text.
- **Accent Blue** (`#007AFF`): primary action and active state.
- **Accent Indigo** (`#5E5CE6`): secondary system accent.
- **Accent Pink** (`#FF2D55`): urgent or social signal.
- **Accent Green** (`#30D158`): success and live-positive state.

### Elevation

```css
:root {
  --elev-1: 0 1px 2px rgba(0,0,0,.06), 0 4px 10px rgba(0,0,0,.08);
  --elev-2: 0 2px 4px rgba(0,0,0,.08), 0 12px 28px rgba(0,0,0,.14);
  --elev-3: 0 4px 8px rgba(0,0,0,.10), 0 24px 56px rgba(0,0,0,.22);
}
```

### Radius

- **Small**: 14px for compact chips and tiny panels.
- **Medium**: 22px for widgets and small cards.
- **Large**: 34px for Control Center tiles and app cards.
- **Extra large**: 48px for large sheets and device chrome.
- **Capsule**: 999px for segmented controls, dock surfaces, and pill actions.
- Use continuous curvature. Avoid sharp 4px web-app corners.

### Motion

- **Swift**: `220ms cubic-bezier(0.32, 0.72, 0, 1)` for taps, toggles, and small state changes.
- **Expressive**: `380ms cubic-bezier(0.2, 0.8, 0.2, 1)` for sheets, materialization, and larger transitions.
- Use small scale response on press: `scale(0.97)` to `scale(0.99)`.
- Respect reduced motion. Replace big transforms with opacity/contrast changes.

## 5. Typography

### Font Stack

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  "SF Pro Display",
  "Helvetica Neue",
  Arial,
  sans-serif;
```

### Type Scale

| Role | Size | Weight | Line height | Tracking |
| --- | ---: | ---: | ---: | ---: |
| Lock-screen time | 76-96px | 700 | .92 | -0.04em |
| Large app title | 34-44px | 700 | 1.05 | -0.03em |
| Screen title | 28-34px | 700 | 1.10 | -0.02em |
| Card title | 17-22px | 600 | 1.20 | -0.01em |
| Body | 15-17px | 400 | 1.42 | 0 |
| Control label | 13-15px | 500-600 | 1.25 | 0 |
| Metadata | 11-13px | 500 | 1.25 | .01em |

Typography rules:

- Use SF-style system type everywhere.
- Keep labels short. Glass surfaces cannot carry dense paragraphs safely.
- Use weight, hierarchy, and spacing before adding color.
- Avoid all-caps unless it is a tiny system label.

## 6. Components

### Glass Primitive

```css
.glass {
  position: relative;
  background: var(--glass-fill-l-regular);
  backdrop-filter: blur(var(--glass-blur-regular)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-regular)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border-l);
  box-shadow: var(--elev-1);
  overflow: hidden;
}

.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,0) 44%),
    radial-gradient(circle at 20% 0%, rgba(255,255,255,.45), transparent 30%);
  opacity: .45;
}
```

### Lock Screen

- Background is full-screen wallpaper or atmospheric imagery.
- Time is large, centered, and allowed to interact with wallpaper composition.
- Notifications use Thin glass.
- Widgets use Regular glass with clear title/value hierarchy.
- Bottom actions are Chrome glass circles.
- Do not overfill the lock screen; preserve wallpaper as a primary design element.

### Control Center

- Use a grid of Regular and Thick glass tiles.
- Connectivity cluster can use Chrome or Regular glass.
- Sliders are Thick glass with rounded tracks and strong active fills.
- Toggles use accent fills only when active.
- Tile labels should be short and high contrast.

### Home Screen And Dock

- App icons can use a clear/glass aesthetic, but labels need stronger contrast.
- Dock uses Chrome glass with capsule radius and high blur.
- Avoid placing long text over the dock material.

### Tab Bar

- Floating capsule or rounded bar, Chrome or Thick glass.
- Active tab uses blue fill, icon weight, or raised contrast.
- Inactive tabs stay quiet and translucent.
- Maintain a minimum 44px touch target.

### Navigation Bar

- Thin or Chrome glass depending on scroll depth.
- Use compact title, back affordance, and one or two actions max.
- Bar should materialize over content rather than sit as an opaque rectangle.

### Cards And Widgets

- Regular glass is the default.
- Use 22-34px radius.
- Use a subtle highlight layer and elevation.
- Prefer one strong number, one label, and one supporting line.
- Avoid long body copy and dense tables on glass.

### Modal Sheet

- Thick glass.
- 34-48px top radius.
- Strong enough fill for form fields and decisions.
- Use a dimmed or blurred backdrop only when needed for focus.

## 7. Layout

- Start with an iPhone-first canvas.
- Use safe-area padding at the top and bottom.
- Keep persistent chrome floating over content, not boxed into a flat header/footer.
- Use depth layers intentionally: background, glass, solid focus, dynamic state.
- Keep gaps generous enough that transparent materials do not visually merge.
- Use 8px spacing as the base rhythm, with 12px, 16px, 20px, 24px, and 32px as common steps.

## 8. Accessibility

- Include a Reduce Bright Effects mode by lowering saturation from 180% to about 110% and reducing highlight opacity.
- Respect Reduce Motion. Avoid large parallax or aggressive materialization when enabled.
- Increase fill opacity when text contrast falls below readable levels.
- Never place body text on Clear glass.
- Do not rely on blur alone to separate controls.
- Ensure touch targets are at least 44px.

## 9. Do

- Treat glass as a material with blur, saturation, fill, border, highlight, and shadow.
- Put meaningful content behind glass so lensing is visible.
- Use Regular glass for most floating surfaces.
- Use SF-style typography and iOS spacing.
- Make every glass component accessible in light and dark modes.
- Use accent colors sparingly and semantically.
- Build iPhone-sized examples with realistic status bars, Dynamic Island, tab bars, sheets, and widgets.

## 10. Do Not

- Do not ship generic web frosted-glass cards and call them Liquid Glass.
- Do not put paragraphs or dense tables on Clear or Ultra Thin glass.
- Do not overuse blue accent. One primary action per surface is enough.
- Do not flatten the layer model into a single dashboard card grid.
- Do not use sharp corners, heavy black borders, or web-admin density.
- Do not ignore reduced brightness and reduced motion states.

## 11. Prompt Recipes

### Mobile App Prototype

Design a high-fidelity iOS 26 Liquid Glass mobile app prototype. Use a full
iPhone canvas with layered wallpaper/content background, Regular glass cards,
Chrome glass tab bar, SF-style typography, safe-area spacing, adaptive
contrast, and a reduced-brightness accessibility state. Include one primary
workflow and one modal sheet.

### Control Center Surface

Design an iOS 26 Control Center-style interface with Regular and Thick glass
tiles, active accent toggles, glass sliders, Chrome-level persistent controls,
and a background that proves the lensing effect.

### Lock Screen Widget Set

Design an iOS 26 lock-screen concept with large time typography, Thin glass
notifications, Regular glass widgets, Chrome glass bottom actions, and a
wallpaper-aware layout that preserves negative space.
