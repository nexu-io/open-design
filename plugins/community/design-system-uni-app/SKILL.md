---
name: uni-app-design
description: Use this skill to generate well-branded interfaces and assets for uni-app (DCloud's cross-platform Vue framework), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, the uniicons icon font, and an interactive Hello uni-app UI kit for prototyping the WeUI/Mini-Program mobile idiom.
user-invocable: true
---

Read DESIGN.md first, then README.md, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out
and create static HTML files for the user to view. If working on production code, you can
copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build
or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_
production code, depending on the need.

## Quick orientation
- `DESIGN.md` — canonical rules for color, type, layout, components, motion, iconography,
  and implementation checks. Start here.
- `README.md` — full context: product, sources, content & visual foundations, iconography, manifest.
- `colors_and_type.css` — all design tokens (colors, type scale, spacing, radius, elevation)
  as CSS custom properties, plus the `uniicons` `@font-face`. Import this first.
- `ui_kits/hello-uniapp/` — interactive React recreation of the showcase app; lift its
  components (`Button`, `Switch`, `Cell`, `List`, `Card`, `ActionSheet`, `Modal`, `Toast`…).
- `preview/` — small specimen cards for the design-system gallery.
- `assets/` + `fonts/` — logo, tab-bar icons, the `uni.ttf` icon font.

## Essentials to remember
- Single action color: **iOS blue `#007aff`** (primary buttons, switch-on, active tab, links).
  Brand green `#2b9939` is the logo only — not a UI color.
- **Flat**, WeUI/Mini-Program look. Structure comes from **1px hairlines `#c8c7cc`**, not
  shadows. The only stock shadow is the switch knob.
- **System font stack** (no brand webfont); authored in **rpx** (750rpx = viewport width).
- Radii: 5px buttons, 3px checkboxes, 4px cards, 16px switch, 100px badges.
- **No emoji, no gradients, no decorative motion.** Copy is terse, bilingual (zh-first),
  engineer-to-engineer.
- Icons: use the bundled **uniicons** font (`fonts/uni.ttf` / `uniicons.css`). Don't substitute.
