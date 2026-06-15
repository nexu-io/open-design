---
name: Jshine AI
description: Enterprise AI platform design system with glassmorphism layering, deep blue primary anchors, gold premium accents, and Space Grotesk + Manrope typography. Use for AI dashboards, chat interfaces, data analytics tools, and enterprise workspaces.
user-invocable: false
---

# Jshine AI Design System

## What's inside

The Jshine AI design system package delivers a complete visual language for enterprise AI products. It combines Corporate Modern precision with Glassmorphism translucency to create an "Intelligent Aura" — light, airy, and industrial.

**Rules and tokens**
- `README.md` — Package guide with product context, source references, package contents, preview manifest, UI kit summary, and concrete reuse workflows for agents and developers.
- `DESIGN.md` — Canonical design system rules across 9 sections: Visual Theme & Atmosphere (Section 1), Color (Section 2), Typography (Section 3), Spacing (Section 4), Layout & Composition (Section 5), Components (Section 6), Motion & Interaction (Section 7), Voice & Brand (Section 8), and Anti-patterns (Section 9). Sections are mapped to their source provenance in `context/source-context.md`.
- `SKILL.md` — This file: agent-usable skill entry with YAML frontmatter, package inventory, source context, usage guidance, and design system highlights grounded in source evidence.
- `colors_and_type.css` — Single-file CSS token sheet. All Material Design 3-style custom properties on `:root` (brand colors, surface hierarchy, text tokens, inverse tokens, state colors, typography tokens, spacing tokens, border-radius tokens) plus utility classes (`.glass-card`, `.btn-primary`, `.btn-secondary`, `.btn-premium`, `.input`, `.chip-standard`, `.chip-premium`, `.progress`, typography classes, `.mono`). Imports Google Fonts for Space Grotesk, Manrope, and JetBrains Mono.

**Source evidence**
- `context/source-context.md` — Original design system specification: company/product identity, complete color token tree, typography tokens with font family/size/weight/line-height/letter-spacing values, spacing and border-radius scales, Brand & Style narrative, elevation model, shape language, component specifications (Buttons, Glass Cards, Input Fields, Chips & Badges, Progress Indicators), and layout rules for desktop/tablet/mobile grids. This is the single source of truth from which all design system files are derived.

**Review previews**
- `preview/colors-primary.html` — Primary, secondary, tertiary, and error color swatches with hex values and token names.
- `preview/colors-theme-light.html` — Full light theme surface hierarchy tokens (background through surface-container-highest), text tokens (on-surface, on-surface-variant), border tokens (outline, outline-variant), and semantic states.
- `preview/colors-theme-dark.html` — Dark theme inverse palette: inverse-surface, inverse-on-surface, inverse-primary, plus dark-mode adapted surface layers.
- `preview/typography-specimens.html` — Complete type scale specimens: display-lg (48px Space Grotesk 700), headline-lg (32px Space Grotesk 600), headline-md (24px Space Grotesk 600), body-lg (18px Manrope 400), body-md (16px Manrope 400), label-sm (12px Space Grotesk 500). Shows font pairings, weights, letter-spacing, and line-height for each token.
- `preview/spacing-tokens.html` — 8px linear spacing scale visualization: spacing-base (8px) through spacing-6 (48px), gutter (24px), margin-mobile (16px), margin-desktop (48px), and container-max (1440px). Includes 12-column desktop grid demo.
- `preview/spacing-radius.html` — Border radius scale: rounded-sm (2px), rounded (4px), rounded-md (6px), rounded-lg (8px), rounded-xl (12px), rounded-full (9999px). Each with applied visual demonstration and usage notes.
- `preview/spacing-shadows.html` — Elevation model: Level 1 base surface, Level 2 glass card (backdrop-filter blur 12px), Level 3 floating interactive (primary-tinted shadow 5% opacity), and premium indicator (1px gold border).
- `preview/components-buttons.html` — Three button variants (Primary solid, Secondary outline, Premium gold) in default, hover, active, and disabled states.
- `preview/components-inputs.html` — Input fields in default/focus/filled/error states, standard and premium chips/badges, progress bar with gradient fill animation.
- `preview/brand-assets.html` — Brand identity showcase: Jshine AI wordmark, color story, typeface pairings, glassmorphism demonstration, and design philosophy pillars.

**Applied UI kit**
- `ui_kits/app/README.md` — UI kit documentation: structure, component roles table, usage workflow, design notes, and source basis.
- `ui_kits/app/index.html` — Runnable React 18 browser entry: loads React, ReactDOM, Babel standalone, `../../colors_and_type.css`, all modular component files under `components/`, and renders the composed `App` into `#root`.
- `ui_kits/app/components/App.jsx` — App shell composing Sidebar + AssistantsList + ChatArea + InputBar into a full AI assistant workspace layout. Exposes `window.App`.
- `ui_kits/app/components/Sidebar.jsx` — Primary navigation sidebar with logo/wordmark, nav items, and user profile. Deep blue primary-container background. Exposes `window.Sidebar`.
- `ui_kits/app/components/AssistantsList.jsx` — AI assistant selector: search input, scrollable glass-card list, status indicators, premium tier badge. Exposes `window.AssistantsList`.
- `ui_kits/app/components/ChatArea.jsx` — Main conversation workspace: scrollable message thread with user and assistant MessageBubble components, progress indicator. Exposes `window.ChatArea`.
- `ui_kits/app/components/MessageBubble.jsx` — Individual message: avatar, sender name, timestamp, formatted content with role-based styling (user right/primary-tinted, assistant left/surface-container). Exposes `window.MessageBubble`.
- `ui_kits/app/components/InputBar.jsx` — Message composer: text input with character counter, send button (primary), and model selector indicator. Exposes `window.InputBar`.

**Directories not present in this package**
No `build/`, `assets/`, `fonts/`, or `source_examples/` directories exist — no external GitHub repositories, local code folders, Figma files, or binary brand assets were linked during system creation. All tokens and rules are derived from `context/source-context.md` alone.

## Source context

This design system was created from a single structured specification: `context/source-context.md`. That file is the canonical source of truth and provides:

- **Company / Product identity** — The Jshine AI brand name, the "Intelligent Aura" narrative, and target audience (high-level enterprise and technical users).
- **Complete color token tree** — Material Design 3 structured tokens: brand colors (primary, secondary, tertiary), surface hierarchy (6 layers from background to surface-container-highest), text tokens (on-surface, on-surface-variant), inverse tokens (inverse-surface, inverse-on-surface, inverse-primary), fixed color variants, and semantic state colors (error, on-error, error-container).
- **Typography tokens** — Six named type scale entries (display-lg, headline-lg, headline-md, body-lg, body-md, label-sm) each with explicit fontFamily, fontSize, fontWeight, lineHeight, and letterSpacing values. Two font families: Space Grotesk (display, headlines, labels) and Manrope (body).
- **Spacing and radius tokens** — 8px linear spacing scale with named steps, and 6-level border-radius scale (sm through full).
- **Brand & Style narrative** — Visual atmosphere (Corporate Modern + Glassmorphism), key identifiers (translucent layering, industrial precision, luminous gold highlights), and emotional positioning.
- **Component specifications** — Detailed contracts for Buttons (3 variants), Glass Cards (backdrop-filter blur rules), Input Fields (states and focus behavior), Chips & Badges (standard and premium), Progress Indicators (gradient fill), and Tables (hairline borders, no striping).
- **Layout rules** — Desktop 12-column grid (1440px max, 24px gutters), tablet 8-column grid (24px margins), mobile 4-column grid (16px margins).
- **Elevation model** — 4-level depth system: base surface, glass card (backdrop-filter), floating interactive (primary-tinted shadow), premium indicator (gold border).

No external GitHub repositories, local code folders, Figma files, or uploaded brand assets were provided. The `DESIGN.md` document derives all 9 sections from this source, with cross-reference provenance mapping in Section "Source Provenance" at the bottom of `DESIGN.md`.

## When to use

Activate this design system when generating artifacts for:

- **Enterprise AI platforms** — Dashboards, monitoring consoles, and analytical workspaces requiring high information density with premium industrial aesthetic.
- **AI assistant / chat interfaces** — Conversational AI products with glassmorphism card layering, sidebar navigation, and message threading.
- **Data analytics tools** — Dense tabular views, metrics displays, and reporting surfaces with monospace numerics and tabular formatting.
- **Premium B2B SaaS** — Products targeting technical or enterprise buyers where precision, trust, and clarity are the primary emotional signals.
- **Any project needing a cool, industrial, precise visual language** — When the brief calls for corporate modern, glass, or "intelligent aura" aesthetics.

Do NOT use this system for:
- Consumer-facing playful or animated products (use Human/Approachable instead).
- Editorial, magazine, or publishing sites (use Editorial/Monocle instead).
- Developer tools or CLI documentation (use Tech/Utility instead).
- Warm, cozy, or craft-branded products — the palette is intentionally cool and slate-based.

## How to use

Follow this workflow when generating artifacts under the Jshine AI design system:

1. **Read the rules first.** Open `DESIGN.md` — it is the authoritative specification for all visual decisions. Pay particular attention to Section 9 (Anti-patterns) which lists specific things to avoid (no heavy box-shadows on cards, no gold on more than one element per view, no Space Grotesk for body copy, no warm beige/cream backgrounds).
2. **Link the tokens.** Include `colors_and_type.css` in your HTML: `<link rel="stylesheet" href="colors_and_type.css">`. All 70+ tokens are on `:root` — no build step, no preprocessor needed. The file also imports Google Fonts for Space Grotesk, Manrope, and JetBrains Mono.
3. **Study the previews.** Open `preview/` cards in a browser or the Design System preview tab. Check `preview/colors-theme-light.html` for surface hierarchy tokens, `preview/typography-specimens.html` for type scale, `preview/spacing-tokens.html` for spacing rhythm, and `preview/components-buttons.html` for button variants before building components.
4. **Apply components.** Use the CSS utility classes from `colors_and_type.css` — `.glass-card`, `.btn-primary`, `.btn-secondary`, `.btn-premium`, `.input`, `.chip-standard`, `.chip-premium`, `.progress`, plus typography classes (`.display-lg`, `.headline-lg`, `.headline-md`, `.body-lg`, `.body-md`, `.label-sm`, `.mono`).
5. **Reference the UI kit.** `ui_kits/app/` is a worked example showing all components composed into a real product interface. Examine `App.jsx` for layout composition, `Sidebar.jsx` for navigation patterns, `ChatArea.jsx` for message threading, and `InputBar.jsx` for input handling.
6. **Honor the constraints.** Glass cards must use `backdrop-filter: blur(12px)` with semi-transparent white background and 1px white border (Section 6 of `DESIGN.md`). Gold (`--secondary-container`) is reserved for premium-tier conversion elements only (Section 9). Space Grotesk is display/headlines/labels only; Manrope is body only (Section 3).
7. **Check against anti-patterns.** Before emitting any artifact, run through Section 9 of `DESIGN.md`: no heavy shadows on cards (use glass), no rounded corners above `--rounded-xl` (12px) except pills, no warm beige/cream/peach page backgrounds, no Inter/Roboto/Arial as display faces, no emoji as feature icons, no gradient page backgrounds.

## Design system highlights

Each highlight below is grounded in a specific section of `context/source-context.md` and its corresponding `DESIGN.md` section.

1. **Glassmorphism as the signature elevation model** (Source: `context/source-context.md` — Elevation & Depth; `DESIGN.md` Section 2, 5, 6)
   Cards use `background: rgba(255,255,255,0.7)`, `backdrop-filter: blur(12px)`, `-webkit-backdrop-filter: blur(12px)`, and `border: 1px solid rgba(255,255,255,0.4)` with `border-radius: 0.75rem`. This replaces traditional box-shadows for a translucent, layered "intelligent aura" effect. Interactive floating elements add a soft primary-tinted shadow at 5% opacity.

2. **Controlled three-color budget** (Source: `context/source-context.md` — Colors; `DESIGN.md` Section 2)
   Deep blue (`--primary-container: #0052D9`) anchors structural elements (sidebars, headers, primary CTAs). Gold (`--secondary-container: #D4AF37 / #fed65b`) is a premium signal used at most once per screen — never a decoration. Light blue (`--primary-fixed: #dbe1ff`) handles hover states, selected items, and subtle background tints. All colors are expressed in Material Design 3 token semantics with full light and dark theme support.

3. **Industrial typography system** (Source: `context/source-context.md` — Typography; `DESIGN.md` Section 3)
   Space Grotesk (display: 48px/700/-0.02em; headlines: 32px and 24px/600; labels: 12px/500/+0.05em) delivers engineering-precision headlines and technical labels. Manrope (body: 18px and 16px/400) handles long-form copy. The two families never swap roles. Tabular numbers (`font-variant-numeric: tabular-nums`) are required for all data, metrics, and tables.

4. **Strict 8px spacing rhythm** (Source: `context/source-context.md` — Layout & Spacing; `DESIGN.md` Section 4)
   All spacing follows an 8px linear scale from `--spacing-base` (8px) to `--spacing-6` (48px). Desktop pages use 48px margins with 24px grid gutters on a 12-column grid at 1440px max-width. Glass cards use 32-40px internal padding to maintain the airy Intelligent Aura feel.

5. **Component system with anti-pattern enforcement** (Source: `context/source-context.md` — Components, Review Contract; `DESIGN.md` Section 6, 9)
   Three button variants (Primary solid, Secondary outline, Premium gold conversion-only), glass cards with mandatory backdrop-filter, minimalist inputs with primary focus glow, standard/premium chips, and gradient progress indicators. Section 9 lists 15+ specific anti-patterns including: no heavy shadows on cards, no gold on more than one element per view, no rounded corners above 12px except pills, no warm beige/cream/peach page backgrounds, no Inter/Roboto/Arial as display, no emoji icons, no gradient page backgrounds.

6. **Responsive grid contracts** (Source: `context/source-context.md` — Layout & Spacing; `DESIGN.md` Section 5)
   Desktop: 12-column, 1440px max-width, 24px gutters. Tablet: 8-column, 24px margins, cards stack in pairs. Mobile: 4-column, 16px margins, full-width glass cards. Navigation: sidebar with primary-container background, Space Grotesk labels, active states with primary highlight.
