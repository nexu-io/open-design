# Jshine AI Design System

> Category: Custom  |  Surface: web  |  Version: 1.0

A complete Open Design design system package for the Jshine AI enterprise platform. Built from the `context/source-context.md` specification, this package captures the "Intelligent Aura" visual language — a sophisticated blend of Corporate Modern precision and Glassmorphism translucency, targeting high-end enterprise and technical users.

## Product Overview

**Jshine AI** is an enterprise-grade artificial intelligence platform. The name "Jshine" combines a bright, radiant prefix with a modern tech sensibility — suggesting intelligence that illuminates and clarifies. The brand communicates intelligence, clarity, precision, and ethereal power.

The visual language is built on three design pillars:
- **Translucent layering** — Information lives on glass-like surfaces with soft backdrop blurs, creating depth without heavy shadows.
- **Industrial precision** — Sharp, technical typography (Space Grotesk) and geometric grid alignment evoke engineering blueprints.
- **Luminous highlights** — Subtle gold accents (`--secondary-container`) signal premium status and "golden path" interactions — used sparingly, at most once per screen.

### Primary UI Surfaces

| Surface | Description | Key Components |
|---------|-------------|----------------|
| Workspace dashboard | High-level AI insight summaries | Glass cards, progress indicators, status chips, metric displays |
| AI assistant / chat interface | Conversational AI workspace | Sidebar navigation, assistant selection, message threads, input composer |
| Data analytics views | Dense tabular data exploration | Monospace numerics, hairline borders, progressive disclosure |
| Settings / configuration | Form-driven administration panels | Minimalist inputs, toggles, premium feature indicators |

### Core Capabilities Evidenced by Package Source

The `context/source-context.md` specification provides:
- Complete Material Design 3-style color token tree (brand, surface hierarchy, text, inverse, fixed, state).
- Six-entry typography scale with explicit font families, sizes, weights, line-heights, and letter-spacing.
- 8px linear spacing scale with desktop/tablet/mobile grid contracts.
- Glassmorphism elevation model with backdrop-filter blur layering (4 depth levels).
- Component specifications for buttons (3 variants), glass cards, inputs, chips/badges, progress indicators, and tables.
- Brand narrative, voice/tone rules, and 15+ specific anti-patterns.

### Source References

| Source | Path | Role |
|--------|------|------|
| Design system specification | `context/source-context.md` | Canonical source of truth for all tokens, rules, and components |
| Canonical rules document | `DESIGN.md` | 9-section design system with provenance mapping and anti-patterns |
| Reusable CSS tokens | `colors_and_type.css` | Single-file token sheet with utility classes and Google Fonts imports |
| Agent skill entry | `SKILL.md` | Discoverable skill package with YAML frontmatter and usage guidance |

No external GitHub repositories, local code folders, Figma files, or uploaded binary brand assets were linked during system creation. The entire design system is derived from and validated against the single source specification in `context/source-context.md`.

## Package Contents

```
jshine-ai-design-system/
├── README.md                              ← This file: package guide with product context, contents,
│                                             preview manifest, UI kit summary, and reuse workflows
├── SKILL.md                               ← Agent-usable skill entry with YAML frontmatter, package
│                                             inventory, source context, usage guidance, and design
│                                             system highlights grounded in source evidence
├── DESIGN.md                              ← Canonical design system rules (9 sections with source
│                                             provenance mapping and anti-patterns)
├── colors_and_type.css                    ← Reusable CSS token file: 70+ custom properties on :root,
│                                             utility classes, Google Fonts imports
├── context/
│   └── source-context.md                  ← Original design system definition: company/product identity,
│                                             complete color token tree, typography tokens, spacing/radius
│                                             scales, Brand & Style narrative, elevation model, component
│                                             specifications, layout rules, and review contract
├── preview/
│   ├── colors-primary.html                ← Primary, secondary, tertiary, and error color swatches
│   ├── colors-theme-light.html            ← Full light theme surface hierarchy and text/border tokens
│   ├── colors-theme-dark.html             ← Dark theme inverse palette and adapted surface layers
│   ├── typography-specimens.html          ← Complete type scale specimens with font pairings
│   ├── spacing-tokens.html                ← 8px linear spacing scale and 12-column grid demo
│   ├── spacing-radius.html                ← 6-level border radius scale with usage notes
│   ├── spacing-shadows.html               ← 4-level elevation model (base through premium)
│   ├── components-buttons.html            ← 3 button variants in all interaction states
│   ├── components-inputs.html             ← Inputs, chips, badges, and progress indicators
│   └── brand-assets.html                  ← Brand identity showcase with wordmark and design pillars
└── ui_kits/
    └── app/
        ├── README.md                      ← UI kit documentation: structure, component roles, usage, design notes
        ├── index.html                     ← Runnable React 18 browser entry loading all components
        └── components/
            ├── App.jsx                    ← App shell composing Sidebar + AssistantsList + ChatArea + InputBar
            ├── Sidebar.jsx                ← Primary navigation sidebar (deep blue primary-container)
            ├── AssistantsList.jsx         ← AI assistant selector with glass-card list and search
            ├── ChatArea.jsx               ← Main conversation workspace with message threading
            ├── MessageBubble.jsx          ← Individual message with avatar, timestamp, and role styling
            └── InputBar.jsx               ← Message composer with character counter and send action
```

### Preserved Directories

No build/, assets/, fonts/, or source_examples/ subdirectories exist in this package. Future imports may populate these with runtime icons like build/icon.ico, brand marks like assets/logo.svg, font files like fonts/roboto.woff2, and captured component snapshots like source_examples/Button.tsx. The design system is derived entirely from the text specification in `context/source-context.md`.

## Preview Manifest

Each preview card is a self-contained HTML file demonstrating a specific design system concern. Open them in a browser or the Open Design review panel to validate tokens visually before applying them to artifacts.

| File | Token Categories Demonstrated | What Reviewers Should Inspect |
|------|------------------------------|-------------------------------|
| `preview/colors-primary.html` | Brand colors: `--primary`, `--primary-container`, `--on-primary`, `--on-primary-container`, `--secondary`, `--secondary-container`, `--on-secondary`, `--on-secondary-container`, `--tertiary`, `--tertiary-container`, `--on-tertiary`, `--on-tertiary-container`, `--error`, `--error-container`, `--on-error`, `--on-error-container`; fixed variants: `--primary-fixed`, `--primary-fixed-dim`, `--on-primary-fixed`, `--on-primary-fixed-variant`, `--secondary-fixed`, `--secondary-fixed-dim`, `--on-secondary-fixed`, `--on-secondary-fixed-variant` | Swatch layout with hex values and token name labels. Verify primary deep blue (`#0052D9`) anchors, secondary gold (`#fed65b`) premium signals, and error red (`#ba1a1a`) are distinct and accessible. |
| `preview/colors-theme-light.html` | Surface hierarchy: `--background`, `--surface`, `--surface-dim`, `--surface-bright`, `--surface-container-lowest`, `--surface-container-low`, `--surface-container`, `--surface-container-high`, `--surface-container-highest`, `--surface-variant`, `--surface-tint`; text tokens: `--on-background`, `--on-surface`, `--on-surface-variant`; border tokens: `--outline`, `--outline-variant`; state colors | Full light theme token cascade. Verify the 6-level surface hierarchy provides visible contrast between layers, and that `--on-surface` text has sufficient contrast (≥4.5:1) against all surface containers. |
| `preview/colors-theme-dark.html` | Inverse tokens: `--inverse-surface`, `--inverse-on-surface`, `--inverse-primary`; dark-adapted surface layers | Dark mode variant of the full palette. Verify the inverse surface (`#2d3133`) provides a dark background with legible inverse text (`#eff1f3`), and that `--inverse-primary` (`#b4c5ff`) is visible against dark surfaces. |
| `preview/typography-specimens.html` | `--display-lg` (Space Grotesk, 48px, 700, -0.02em), `--headline-lg` (Space Grotesk, 32px, 600), `--headline-md` (Space Grotesk, 24px, 600), `--body-lg` (Manrope, 18px, 400), `--body-md` (Manrope, 16px, 400), `--label-sm` (Space Grotesk, 12px, 500, 0.05em); font pairing rules | Each type scale entry rendered at its native size with its token name, font family, size, weight, line-height, and letter-spacing. Verify Space Grotesk renders as the display/headline family, Manrope as body, and that the two-family pairing rule is visually enforced (no Space Grotesk in body, no Manrope in headlines). |
| `preview/spacing-tokens.html` | `--spacing-base` (8px), `--spacing-2` (16px), `--spacing-3` (24px), `--spacing-4` (32px), `--spacing-5` (40px), `--spacing-6` (48px), `--spacing-gutter` (24px), `--spacing-margin-mobile` (16px), `--spacing-margin-desktop` (48px), `--container-max` (1440px); 12-column desktop grid | Visual bars showing relative spacing sizes plus a 12-column grid demo at 1440px max-width with 24px gutters. Verify the 8px linear rhythm is consistent and the grid creates visible breathing room between modules. |
| `preview/spacing-radius.html` | `--rounded-sm` (0.125rem/2px), `--rounded` (0.25rem/4px), `--rounded-md` (0.375rem/6px), `--rounded-lg` (0.5rem/8px), `--rounded-xl` (0.75rem/12px), `--rounded-full` (9999px) | Visual boxes with each radius applied, labeled with token name, value, and recommended usage (e.g., buttons use `--rounded`, glass cards use `--rounded-xl`, pills use `--rounded-full`). |
| `preview/spacing-shadows.html` | Level 1: base surface (no elevation), Level 2: glass card (`backdrop-filter: blur(12px)`, semi-transparent white, 1px white border), Level 3: floating interactive (primary-tinted shadow at 5% opacity), Level 4: premium indicator (1px gold border) | Each elevation level rendered as a card on a patterned background to demonstrate the `backdrop-filter` effect. Verify glass cards show visible blur (requires background content behind them), floating cards lift with subtle primary shadow, and the premium gold border is distinct. |
| `preview/components-buttons.html` | Primary button (solid `--primary-container`, white text, 4px radius, scale-down click), Secondary button (transparent, 1px `--primary` border, `--primary` text), Premium button (`--secondary-container` gold background, dark text) | Each variant in default, hover, active/focus, and disabled states. Verify Space Grotesk labels, scale-down click behavior (`transform: scale(0.97)`), no box-shadow on hover, and the premium gold button is reserved and visually distinct. |
| `preview/components-inputs.html` | Input fields (default, focus with `--primary` border glow, filled, error with `--error` border); Chips: standard (`--primary-fixed` background, `--on-primary-fixed` text), premium (`--secondary-fixed` gold background, dark text); Progress bar: 2px height, `--surface-container-highest` track, `--primary` to `--primary-fixed-dim` gradient fill | Verify minimalist input styling (1px `--outline-variant` border, 4px radius), focus transitions to primary with 2px outer glow, chips use `--label-sm` typography with 0.05em letter-spacing, and progress bar animates with gradient movement. |
| `preview/brand-assets.html` | Jshine AI wordmark, color story (primary deep blue, secondary gold, tertiary light blue), typeface pairings (Space Grotesk + Manrope), glassmorphism demonstration, design philosophy pillars | Brand identity showcase. Verify the wordmark uses Space Grotesk in primary-container color, the color story accurately represents the three-brand-color budget, and the glassmorphism demo shows the signature translucent card effect. |

## UI Kit (`ui_kits/app/`)

The UI kit is a runnable React 18 application that applies the Jshine AI design system to an AI assistant workspace — the primary product surface for an enterprise AI platform. It serves as a reference implementation and a template for new projects.

### Entry Point

`ui_kits/app/index.html` loads:
1. React 18.3.1 (UMD) and ReactDOM 18.3.1 (UMD) from unpkg CDN
2. Babel standalone 7.29.0 from unpkg CDN
3. `../../colors_and_type.css` for all design tokens
4. Each modular component file from `ui_kits/app/components/` as `<script type="text/babel">`
5. A render call: `ReactDOM.createRoot(document.getElementById('root')).render(<App />)`

All components expose themselves as `window.ComponentName` for cross-file access.

### Component Roles

| Component | Source File | Role | Key Design-System Tokens Used |
|-----------|-------------|------|-------------------------------|
| **App** | `components/App.jsx` | Top-level workspace shell composing Sidebar + AssistantsList + ChatArea + InputBar | `--background`, `--surface`, layout grid |
| **Sidebar** | `components/Sidebar.jsx` | Primary navigation: logo/wordmark, nav links (Workspace, Models, Analytics, Settings), user profile section | `--primary-container` (background), `--on-primary-container` (text), `--label-sm` (nav labels) |
| **AssistantsList** | `components/AssistantsList.jsx` | AI assistant selector: search input, scrollable list of glass-card assistant items with status indicators and premium badges | Glass card tokens (backdrop-filter, semi-transparent white, 1px white border), `--secondary-container` (premium badge), standard chip tokens |
| **ChatArea** | `components/ChatArea.jsx` | Main conversation workspace: scrollable message thread, progress indicator during AI processing | `--surface-container` (background), `--body-md` (message text), progress indicator tokens |
| **MessageBubble** | `components/MessageBubble.jsx` | Individual message: avatar, sender name, timestamp, formatted content, role-based styling | User messages: primary-tinted background, right-aligned. Assistant messages: `--surface-container` background, left-aligned. `--body-md`, `--label-sm` typography |
| **InputBar** | `components/InputBar.jsx` | Message composer: text input, character/token counter, send button (primary), model selector indicator | `--surface-container` (background), `--outline-variant` (border), primary button tokens, `--label-sm` (counter) |

### Design Notes

- The sidebar uses `--primary-container` (`#0052D9`) as its background — this is the structural anchor of the workspace per `DESIGN.md` Section 2.
- Assistant cards use the glassmorphism contract from `DESIGN.md` Section 6: `backdrop-filter: blur(12px)`, `background: rgba(255,255,255,0.7)`, `border: 1px solid rgba(255,255,255,0.4)`, `border-radius: 0.75rem`.
- The premium "Pro" assistant tier uses the gold `--secondary-container` badge — per `DESIGN.md` Section 9, gold appears on at most one element per view.
- All typography follows the two-family rule: Space Grotesk for navigation labels and button text; Manrope for message body and descriptions.
- The input bar sits at the bottom of the workspace with a `--surface-container` background and `--outline-variant` top border, consistent with the minimalist input style from `DESIGN.md` Section 6.

### Source Basis

This UI kit is an original implementation derived from the Jshine AI design system specification in `context/source-context.md` and the canonical rules in `DESIGN.md`. No external source code snapshots were captured during system creation — the components are built from the design tokens, component contracts, layout rules, and elevation model defined in the design system specification.

## Reuse Workflow

### For Design Agents (Automated Artifact Generation)

When this design system is set as the active design system for a project:

1. **Read the canonical rules.** Open `DESIGN.md` first. Section 1 establishes the visual posture (Corporate Modern + Glassmorphism). Section 9 lists anti-patterns to avoid. The provenance table at the bottom maps every section back to `context/source-context.md`.

2. **Link the token file.** Add `<link rel="stylesheet" href="colors_and_type.css">` to your HTML `<head>`. All 70+ design tokens are CSS custom properties on `:root` — no build step, no preprocessor, no configuration.

3. **Bind :root tokens into seed templates.** When using the OD deck framework or prototyping seeds, replace the `:root` block with tokens from `colors_and_type.css`. Specifically bind: `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent` (map to `--primary-container`), font families, and spacing scale.

4. **Apply utility classes for standard components.** The CSS file includes ready-to-use classes: `.glass-card` for the signature glassmorphism card, `.btn-primary` / `.btn-secondary` / `.btn-premium` for buttons, `.input` for form fields, `.chip-standard` / `.chip-premium` for badges, `.progress` for progress bars, and typography classes (`.display-lg`, `.headline-lg`, `.headline-md`, `.body-lg`, `.body-md`, `.label-sm`, `.mono`).

5. **Reference previews for visual validation.** Before committing to a token value, open the corresponding `preview/` card: `preview/colors-theme-light.html` for surface hierarchy, `preview/typography-specimens.html` for type scale, `preview/spacing-tokens.html` for spacing rhythm.

6. **Study the UI kit for layout patterns.** `ui_kits/app/` demonstrates sidebar + assistant list + chat area + input bar composition. Examine `App.jsx` for the overall layout grid and `Sidebar.jsx` for the deep-blue navigation pattern.

7. **Run the anti-pattern checklist before shipping.** Section 9 of `DESIGN.md` — verify: no heavy shadows on cards (use glass), no gold on more than one element per view, no Space Grotesk in body copy, no warm beige/cream/peach page backgrounds, no Inter/Roboto/Arial as display, no emoji as icons, no gradient page backgrounds.

### For Developers (Manual Integration)

1. **Copy the token file.** Copy `colors_and_type.css` into your project's stylesheet directory (e.g., `src/styles/` or `public/css/`).

2. **No build step required.** All tokens are plain CSS custom properties. Link the file and use `var(--primary-container)` etc. directly in your stylesheets or inline styles.

3. **Google Fonts are imported automatically.** The file includes `@import url(...)` for Space Grotesk, Manrope, and JetBrains Mono. For production, consider self-hosting these fonts or using a more specific subset to reduce load time. If self-hosting, replace the `@import` with `@font-face` declarations and place font files in a `fonts/` directory.

4. **Extend component classes following the established patterns.** The utility classes in `colors_and_type.css` use the design tokens via `var()` references. New component classes should follow the same pattern: reference tokens, not raw hex values. For glass cards, always include both `backdrop-filter` and `-webkit-backdrop-filter` with the same blur value.

5. **Run visual regression tests against the preview cards.** When modifying token values, compare your rendered components against the corresponding `preview/` card to ensure visual consistency. The preview cards are the visual source of truth for token appearance.

6. **Check `DESIGN.md` Section 9 before merging.** The anti-pattern list covers common drift modes that make the design system look generic. Review it as part of your PR checklist, especially when adding new components.

### Review Workflow

For teams adopting this design system:

1. **First review:** Open `preview/colors-theme-light.html` and `preview/colors-theme-dark.html` to confirm the palette works for your product. Check contrast ratios on all surface layers.
2. **Second review:** Open `preview/typography-specimens.html` to verify Space Grotesk and Manrope render correctly in your browser. Confirm the two-family rule: Space Grotesk for display/headlines/labels, Manrope for body.
3. **Third review:** Open `preview/spacing-tokens.html`, `preview/spacing-radius.html`, and `preview/spacing-shadows.html` to confirm the spacing rhythm, corner radius scale, and glassmorphism elevation model match your expectations.
4. **Component review:** Open `preview/components-buttons.html` and `preview/components-inputs.html` to verify button variants, input states, chips, and progress indicators.
5. **Brand review:** Open `preview/brand-assets.html` to confirm the brand identity summary matches your product positioning.
6. **Applied review:** Open `ui_kits/app/index.html` in a browser to see all components composed into a real product interface. Verify the glass cards render with visible backdrop blur, the sidebar navigation is clear, and the input bar is functional.
