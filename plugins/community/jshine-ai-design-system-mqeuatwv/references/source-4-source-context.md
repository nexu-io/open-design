# Design System Source Context

This file is generated during setup and should be treated as source evidence for the design-system project. Use it before writing or revising DESIGN.md, previews, tokens, UI kit examples, or assets.

## Company / Product

Canonical design-system title: --- name Design System

---
name: Jshine AI
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434654'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0353da'
  primary: '#003da6'
  on-primary: '#ffffff'
  primary-container: '#0052d9'
  on-primary-container: '#cbd6ff'
  inverse-primary: '#b4c5ff'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#3d4655'
  on-tertiary: '#ffffff'
  tertiary-container: '#545e6d'
  on-tertiary-container: '#cdd7e9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#d9e3f5'
  tertiary-fixed-dim: '#bdc7d8'
  on-tertiary-fixed: '#121c29'
  on-tertiary-fixed-variant: '#3e4756'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1440px

---

## Brand & Style

This design system is built on the narrative of an "Intelligent Aura." It targets high-level enterprise and technical users who require a high-end, industrial AI aesthetic that feels both powerful and ethereal. 

The style is a sophisticated blend of **Corporate Modern** and **Glassmorphism**. It utilizes a light, airy canvas to ensure maximum readability and a sense of "unlimited space," contrasted with dense, high-contrast structural elements. The visual language emphasizes precision, logic, and premium status, evoking an emotional response of trust, clarity, and cutting-edge intelligence. 

Key visual identifiers include:

- **Translucent layering:** Information lives on glass-like surfaces with soft backdrop blurs.
- **Industrial Precision:** Sharp, technical typography and geometric grid alignment.
- **Luminous Highlights:** Subtle gold accents that suggest premium status and "golden path" interactions.

## Colors

The palette is designed to emphasize a clean, professional environment where color is used purposefully for hierarchy and status.

- **Primary (Deep Blue - #0052D9):** Reserved for structural anchors such as sidebars, headers, and primary call-to-actions. It represents the "core" of the intelligence.
- **Secondary (Gold - #D4AF37):** Used sparingly for high-priority indicators, premium tier features, and subtle ornamental strokes that guide the eye to key successes.
- **Tertiary (Light Blue - #E1EBFD):** Acts as a soft highlight for hover states, selected items, or subtle background tinting behind glass cards.
- **Surface (Slate 50 / White):** The primary environment. Backgrounds are kept at `#FFFFFF` or `#F8FAFC` to maintain a light, industrial-grade clarity.
- **Text:** Headlines use a deep navy-charcoal for legibility, while metadata uses a medium-grey to reduce visual noise.

## Typography

The typography system balances technical rigor with modern readability. **Space Grotesk** is used for all headlines and labels to reinforce the industrial-tech aesthetic; its geometric construction feels engineered and precise. 

**Manrope** is utilized for body copy to provide a more human, accessible reading experience for long-form data and descriptions.

**Stylistic Rules:**

- **Large Scales:** Use `display-lg` for dashboard summaries and hero statements.
- **Technical Labels:** Small labels should always use `Space Grotesk` with a slight letter spacing increase to mimic engineering blueprints.
- **Contrast:** Maintain high contrast for body copy against the light background, but allow headers to use the Primary Deep Blue when they serve as section anchors.

## Layout & Spacing

This design system uses a **Fixed Grid** approach for the main content area to maintain a high-end, editorial feel, while sidebars and utility panels remain fluid.

- **Desktop:** 12-column grid with a 1440px max-width. 24px gutters provide ample "breathing room" between complex AI data modules.
- **Tablet:** 8-column grid with 24px margins. Content cards stack horizontally in pairs.
- **Mobile:** 4-column grid with 16px margins. Most glassmorphism cards transition to full-width to maximize reading area.

The spacing rhythm follows a strict 8px linear scale. Large components (like glass cards) should use 32px or 40px internal padding to maintain the "airy" feel of the Intelligent Aura aesthetic.

## Elevation & Depth

Depth is achieved through **Glassmorphism** and **Tonal Layering** rather than traditional heavy shadows.

- **Level 1 (Base):** The Pure White or Slate 50 background.
- **Level 2 (Glass Cards):** Semi-transparent white surfaces (`rgba(255, 255, 255, 0.7)`) with a 12px-20px backdrop blur. These should have a 1px solid white border at 40% opacity to define the edge.
- **Level 3 (Interactive/Floating):** Use a very soft, diffused primary-tinted shadow (Deep Blue at 5% opacity) to indicate items that are lifted or active.
- **Premium Indicators:** Use thin, 1px Gold (#D4AF37) borders for "Featured" or "Pro" modules to distinguish them from standard glass layers.

## Shapes

The shape language is **Soft** but controlled. We avoid overly rounded or "bubbly" shapes to maintain the industrial, high-end AI feel.

- **Standard Elements:** Buttons and input fields use a 0.25rem (4px) radius.
- **Glass Cards:** Larger containers use 0.75rem (12px) to soften the technical density of the data inside.
- **Status Icons:** Circular indicators are permitted for status dots (online/offline) to provide a geometric counterpoint to the rectangular grid.

## Components

### Buttons

- **Primary:** Solid Deep Blue (#0052D9) with white Space Grotesk text. No shadow, just a subtle scale-down on click.
- **Secondary:** Transparent background with a 1px Deep Blue border.
- **Premium:** Gold (#D4AF37) background with navy text, used only for conversion or high-tier actions.

### Glass Cards

The signature component. Must include a `backdrop-filter: blur(12px)`, a semi-transparent white background, and a faint 1px white border. Use these for grouping related AI insights or user profile data.

### Input Fields

Minimalist design. Underline-only or subtle 1px Slate 200 border. On focus, the border transitions to Deep Blue with a soft 2px Light Blue outer glow.

### Chips & Badges

Small, technical chips using `label-sm` typography. 

- **Standard:** Light Blue background with Deep Blue text.
- **Premium/High Priority:** Gold background with dark text.

### Progress Indicators

Use thin, 2px lines. The background track should be Slate 100, while the active fill is a gradient from Deep Blue to Light Blue to imply movement and processing.

## GitHub Repositories

- None linked.

Connector status: GitHub connector is not configured; repository intake will use local git credentials or authenticated GitHub CLI when possible.

## Local Code

Linked folders readable by the local agent: none.

Copied browser-selected code snapshot files under `context/local-code/`: none.

## Design And Brand Resources

Figma files selected: none.

Locally parsed Figma summaries under `context/figma/`: none.
Fonts, logos, and assets selected: none.

Uploaded brand asset files under `assets/`: none.

## Notes

No additional notes provided.

## Review Contract

- `/design-systems/create` only collected setup inputs. All GitHub extraction, local evidence intake, source reading, design-system construction, package audit, and artifact writes should happen inside this project workspace.
- DESIGN.md is the canonical source of truth.
- Use the canonical design-system title above for headings, README/SKILL names, preview labels, and UI-kit copy unless inspected evidence proves a more accurate product name. Never title the system from URL protocol text such as `https`.
- colors_and_type.css should hold concrete reusable tokens when the source evidence supports them; if fonts/ contains preserved font files, colors_and_type.css must bind those files with @font-face, @import, or url(...) references so typography does not fall back to substitute fonts.
- README.md and SKILL.md should make the extracted system reusable as a real Open Design design-system package.
- README.md should include a source-backed Product Overview/Product Context section, source repository or source folder references, package contents, a concrete `## Preview Manifest` listing every generated `preview/*.html` card, and reuse workflow, similar to Claude Design exports.
- SKILL.md should include YAML frontmatter with `name`, `description`, and `user-invocable`, plus Claude-style reusable skill sections: What is inside, Source context, When to use this skill, How to use, and Design system highlights. The usage guidance should point agents at README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/.
- README.md, SKILL.md, DESIGN.md, and ui_kits/app/README.md must describe the final focused preview cards and `ui_kits/app/` paths, not old scaffold names such as `preview/typography-scale.html` or `ui_kits/generated_interface/`.
- preview/ should contain small reviewable HTML cards for typography, color themes, spacing, radius, shadows, brand assets, and component evidence.
- source_examples/ or equivalent root/nested source files should preserve selected high-signal original components when snapshots include substantial app/component source, similar to Claude Design exports that keep files like SelectModelButton.tsx or ChatNavBar/index.tsx alongside the package. These examples should contain substantive original implementation code, not tiny stubs that only share the component name.
- ui_kits/app/ should contain an applied interface example, plus substantive role-based files under `ui_kits/app/components/` when the source snapshots include representative app shells, navigation, chat/input surfaces, or reusable components. `ui_kits/app/README.md` should explain structure, component files, usage, design notes, and source basis. `ui_kits/app/index.html` must load `../../colors_and_type.css`, must load/import/compose the modular component files, and must mount/render the composed interface instead of staying as a standalone generic static mock or disconnected script list. If the entry directly loads `.jsx`/`.tsx` files, include React, ReactDOM, and Babel standalone scripts and expose each loaded component as `window.ComponentName` / `globalThis.ComponentName`, or write compiled browser-ready JavaScript instead. For chat/workspace evidence, cover app shell, sidebar/navigation, assistant/list rail, chat area, input bar/composer, and message bubble/comment roles; the app shell component must compose those roles into one product-like surface. Placeholder component shells are not sufficient.
Claude-style UI-kit entry contract:
- When `ui_kits/app/components/*.jsx` or `*.tsx` files exist, `ui_kits/app/index.html` must behave like a runnable browser entry, not a static mock.
- Use the same structure as Claude Design exports: load React, ReactDOM, and Babel standalone scripts, load `../../colors_and_type.css`, create a `#root`, load each component script from `components/`, then render the composed `App` component.
- `App.jsx` must assign `window.App = App` (or `globalThis.App = App`), and every directly loaded component file must expose the same browser global for its component name.
- Use this skeleton for direct JSX component kits, replacing the component list only when evidence supports different names:
```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
<link rel="stylesheet" href="../../colors_and_type.css">
<div id="root"></div>
<script type="text/babel" src="components/Sidebar.jsx"></script>
<script type="text/babel" src="components/AssistantsList.jsx"></script>
<script type="text/babel" src="components/ChatArea.jsx"></script>
<script type="text/babel" src="components/MessageBubble.jsx"></script>
<script type="text/babel" src="components/InputBar.jsx"></script>
<script type="text/babel" src="components/App.jsx"></script>
<script type="text/babel">
const { App } = window;
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
</script>
```
- Preview cards and UI-kit visuals should explicitly label or model source-backed modules from the captured evidence instead of generic placeholder modules.
- assets/, build/, fonts/, and context/ should preserve logos, app icons, tray icons, installer/runtime icons, wordmarks, font files, provenance, and source notes for future projects.
Claude-style build asset contract:
- When evidence includes `context/.../files/build/...`, create a root `build/` directory and copy representative runtime assets there with their original filenames and path intent, such as `build/icon.png`, `build/logo.png`, `build/tray_icon.png`, and `build/icon.ico`.
- Copy those runtime assets byte-for-byte from the captured `context/.../files/...` snapshots. Do not redraw, re-encode, optimize, or substitute generated placeholders for files that the evidence already captured.
- Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`. `assets/` may include convenience aliases, but root `build/` must preserve the source runtime files for future agents and package consumers.
- `preview/brand-assets.html` should reference at least some real preserved files from `build/` or `assets/` with `<img>`, `<picture>`, `<object>`, or CSS `url(...)`, and README.md / SKILL.md should mention `build/` in the package manifest when it exists.
- preview/brand-assets.html should visibly reference preserved files from assets/ or build/ instead of recreating logos/icons as inline placeholder drawings.
- GitHub evidence must come from the bounded `github-design-context` command, not direct connector tree/content/raw tool calls. The command tries this-device git first, authenticated GitHub CLI second, and connector-platform fallback only when local access cannot read the repository.
- Linked local folder evidence should come from the bounded `local-design-context` command, which writes a local evidence note and snapshots under `context/local-code/` before final design-system rules are drafted.
- Before marking the design system ready, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every reported error or warning.
- Draft design systems cannot be used by other projects until published.
