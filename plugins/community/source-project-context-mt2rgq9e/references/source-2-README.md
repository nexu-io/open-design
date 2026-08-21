# Project As Complete OpenDesign Design System

> A reusable, production-ready design system for technical portfolios and high-impact engineering showcases.

---

## Overview

This design system is derived from the **Portfolio OS** project, a personal technical showcase engineered for Big Tech visibility and freelance impact. It is not a generic portfolio template; it is a **digital twin** of engineering capabilities, designed to demonstrate production-grade precision, security, and futuristic aesthetics.

---

## Design System Package

### Core Files

| File | Purpose |
|------|---------|
| `DESIGN.md` | Complete design system specification with tokens, components, and rules |
| `SKILL.md` | Skill definition for reuse in OpenDesign projects |
| `colors_and_type.css` | CSS variables for colors, typography, spacing, and motion |
| `context/provenance.md` | Evidence and source references for design decisions |

### Preview Cards

| Card | Purpose |
|------|---------|
| `preview/colors.html` | Visual review of the color palette and semantic roles |
| `preview/typography.html` | Typography scale, typefaces, and rendering examples |
| `preview/spacing.html` | Spacing scale, layout density, and container examples |
| `preview/radius_shadows.html` | Border radius, shadows, and depth effects |
| `preview/components.html` | Interactive component gallery (buttons, cards, forms, navigation) |
| `preview/brand_assets.html` | Logo, wordmark, and brand identity examples |
| `preview/applied_ui.html` | Applied interface surfaces (hero, about, projects, contact) |

### Applied Interface Kit

| Path | Purpose |
|------|---------|
| `ui_kits/app/` | Production-ready interface kit with index and component files |
| `ui_kits/app/index.html` | Entry point for the applied UI kit |
| `ui_kits/app/components/` | Reusable component examples |

### Assets

| Path | Purpose |
|------|---------|
| `assets/fonts/` | Font files (Space Grotesk, Inter, JetBrains Mono) |
| `assets/icons/` | SVG icons and logos |
| `assets/images/` | Background images, mesh textures, and brand imagery |

---

## Usage

### For Designers

1. **Review the design system:**
   - Start with `DESIGN.md` for tokens, components, and rules.
   - Use preview cards to inspect colors, typography, spacing, and components.
   - Reference `colors_and_type.css` for CSS variables.

2. **Apply the system:**
   - Use OKLch tokens for all colors.
   - Use Space Grotesk for display, Inter for body, JetBrains Mono for mono.
   - Follow component patterns for buttons, cards, forms, and navigation.

3. **Preserve authenticity:**
   - Do not deviate from the locked visual language.
   - Use realistic technical imagery and code examples.

### For Developers

1. **Integrate tokens:**
   ```css
   :root {
     --bg: oklch(0 0 0);
     --surface: oklch(0.14 0.004 250);
     --fg: oklch(0.97 0.005 80);
     --muted: oklch(0.65 0.01 250);
     --border: oklch(0.26 0.006 250);
     --accent: oklch(0.82 0.16 80);
   }
   ```

2. **Use components:**
   - Buttons: `.btn-primary`, `.btn-secondary`
   - Cards: `.card`
   - Navigation: `.topnav`
   - Forms: Plain inputs with `--surface` background

3. **Respect constraints:**
   - Only one primary button per viewport.
   - Use `--accent` sparingly (no more than twice per screen).
   - Ensure all interactive elements have clear focus rings.

---

## Provenance

### Source Evidence

- **portfolio-os.html:** Primary source for tokens, components, layout, and interaction patterns.
- **README.md:** Provides context for purpose, tech stack, and future roadmap.
- **quality.md:** Confirms TypeScript, linting, accessibility, and performance standards.
- **components.json:** Confirms Tailwind CSS 4, OKLCH color space, and shadcn/ui usage.
- **package.json:** Confirms bleeding-edge stack (Next.js 16, React 19, Framer Motion, Tailwind CSS 4).

### Preserved Assets

- **Fonts:** Space Grotesk, Inter, JetBrains Mono (loaded from Google Fonts).
- **Icons:** SVG icons used in feature marks and buttons.
- **Imagery:** Mesh background, vignette overlay, and status dot animations.

---

## Next Steps

1. **Inspect previews:** Start with `preview/colors.html` and `preview/components.html`.
2. **Apply to projects:** Use the system for new technical portfolios or engineering showcases.
3. **Contribute:** Extend the system with new components or refinements based on real-world usage.

---

## Summary

This design system is a **production-ready, high-impact** system for technical portfolios. It balances geometric typography, vibrant amber accents, and dynamic motion to convey precision engineering and futuristic ambition. Every decision is rooted in the source project's evidence, ensuring consistency and authenticity.

**Key takeaways:**
- Use OKLch tokens for all colors.
- Use Space Grotesk for display, Inter for body, JetBrains Mono for mono.
- Use `--accent` sparingly—no more than twice per screen.
- Motion should enhance clarity, not distract.
- Avoid generic templates; prioritize realism and technical authenticity.

---

**Design system id:** user:web-prototype-design-system  
**Project id:** aeadc299-6651-467a-b576-7c242466acdf