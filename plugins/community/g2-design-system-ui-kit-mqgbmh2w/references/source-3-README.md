# G2 design system

A reusable Open Design package for the G2 AR/glasses HUD design system by HiCatcat.

This README works as a Claude Design package guide — listing source/context references, package contents, preview cards, preserved assets, fonts, build artifacts, ui_kits/app, and a concrete reuse or review workflow for agents and reviewers.

## Product Overview

HiCatcat G2 is a glasses-mounted AR control interface design system. It defines the visual vocabulary for a dark-canvas HUD: control panels, calls, messages, AI cards, dialogs, toasts, teleprompter, and bottom action bar — purpose-built for compact 320px and regular 640px display modes. Not a generic mobile skin, brand site, or marketing page.

**Product context:**
- Primary profile: `glasses` (dark HUD, compact display modes)
- Core style: black canvas (`#08090d`), high-contrast foreground
- Font source: Noto Sans (Figma tokens in `tokens/sources/g2/Styles.json`)
- Display modes: compact 320 (`Mode 320.tokens.json`), regular 640 (`Mode 640.tokens.json`)
- Source repo: `https://github.com/HiCatcat/Design-System`
- Local source: `/Users/meta-bounds/Documents/Codex/2026-06-02/md/Design-System`

## Source and Context References

| Reference | Path | Content |
|---|---|---|
| Import source | — | `HiCatcat-Design-System-20260616T065457869Z` (prebundled) |
| Import evidence | `source/evidence.md` | 0 CSS variables detected; tokens use OD fallback |
| Token source | `source/tokens.source.json` | Low confidence on color/type/spacing; 0 extracted tokens |
| Contract report | `source/token-contract.report.json` | Full token coverage quality report |
| Scanned files | `source/scanned-files.json` | Inventory of captured source files |
| Snippets index | `source/snippets/INDEX.json` | Index of captured source code snippets |
| Provenance | `context/provenance.md` + `context/provenance.json` | Structured capture metadata |

## Package Contents

| Path | Role |
|---|---|
| `DESIGN.md` | Canonical design rules: color, typography, spacing, motion, voice, anti-pattern, components, agent guidance |
| `README.md` | This file — package guide with manifest, workflow, and reuse instructions |
| `tokens.css` | OD-normalized token contract (`:root` CSS custom properties) |
| `colors_and_type.css` | Companion palette with G2-branded warm accent (`#d66f4d`) |
| `SKILL.md` | Agent skill definition — load when generating G2-system artifacts |
| `USAGE.md` | Auto-generated read-order and do/avoid guide |
| `components.html` | Compact fixture: button, input, card, nav proportions |
| `components.manifest.json` | Structured component inventory: 5 groups, 12 selectors, 5 classes |
| `manifest.json` | Package manifest for OD tooling |
| `package.json` | Package metadata |
| `design-tokens.json` | Derived Design Tokens JSON (OD format) |
| `tailwind-v4.css` | Derived Tailwind v4 theme CSS |
| `preview/` | 14 focused review cards (see Preview Manifest below) |
| `ui_kits/app/` | React-based applied interface: Sidebar, ChatArea, AssistantsList, InputBar, MessageBubble, App shell |
| `assets/` | Preserved brand asset: `logo.svg` |
| `source/` | Import evidence: token source, contract report, scanned files, snippets index |
| `context/` | Provenance and source-capture metadata |
| `src/` | Source reference files (`design-system-reference.tsx`) |
| `index.html` | Applied artifact: DevPulse developer SaaS analytics dashboard (dark theme) |

## Preview Manifest

Each `preview/*.html` card demonstrates a focused module of the design system. Open individually in a browser for visual review.

| Path | Review purpose | Demonstrated tokens/assets |
|---|---|---|
| `preview/colors.html` | Full palette swatches | `tokens.css` — all color tokens |
| `preview/colors-theme-light.html` | Light theme color application | `tokens.css` light palette |
| `preview/colors-theme-dark.html` | Dark theme color application | `tokens.css` dark variant |
| `preview/colors-primary.html` | Primary/accent color variants | `--accent` token family |
| `preview/typography.html` | Type scale overview | `tokens.css` type tokens + font stacks |
| `preview/typography-specimens.html` | Detailed type specimens | Font stack + scale tokens |
| `preview/spacing.html` | Spacing scale overview | `tokens.css` space tokens |
| `preview/spacing-tokens.html` | Spacing token application | Space token contract |
| `preview/spacing-shadows.html` | Elevation and shadow tokens | `--elev-*` tokens |
| `preview/spacing-radius.html` | Border radius tokens | `--radius-*` tokens |
| `preview/components-buttons.html` | Button variants and states | `components.html` button patterns |
| `preview/components-inputs.html` | Input field variants and states | `components.html` input patterns |
| `preview/brand-assets.html` | Logo variants (light + dark backgrounds) | `assets/logo.svg` preserved brand asset |
| `preview/app.html` | App shell with token-bound layout | `tokens.css` + layout primitives |

## Preserved Assets, Fonts, and Build Artifacts

### Preserved Assets
| Asset | Path | Type | Size |
|---|---|---|---|
| Logo (warm) | `assets/logo.svg` | SVG | 518 B |

The logo features a warm circle mark with "GD" monogram on `#fbfaf7` background, accent color `#d66f4d`.

### Fonts
No font files (`.ttf`, `.woff`, `.woff2`) were captured from the source import. The G2 source references Noto Sans through Figma tokens but does not bundle font files. `tokens.css` uses system font stacks with Inter as the primary sans-serif.

### Build Artifacts
No runtime or build artifacts were captured from the source import. The `context/` directory contains only provenance metadata (`provenance.md`, `provenance.json`). No `build/` directory exists — the G2 source repository provided Figma token JSON files (`Styles.json`, `Mode 320.tokens.json`, `Mode 640.tokens.json`) rather than compiled application assets.

## ui_kits/app

An applied React interface demonstrating G2 component composition. Loads `../../colors_and_type.css` for token binding and mounts modular JSX components via Babel standalone.

**Entry point:** `ui_kits/app/index.html`

**Components (`ui_kits/app/components/`):**

| Component | File | Role |
|---|---|---|
| App | `App.jsx` | Shell composition with `title` and `summary` props |
| Sidebar | `Sidebar.jsx` | Navigation sidebar |
| AssistantsList | `AssistantsList.jsx` | AI assistant catalog |
| ChatArea | `ChatArea.jsx` | Message thread display |
| InputBar | `InputBar.jsx` | Compose input with send action |
| MessageBubble | `MessageBubble.jsx` | Individual message card with role/sender |

Each component is a self-contained Babel JSX module. Components export to `window` for cross-file access (e.g., `window.App`). All components together form a complete messaging/assistant interface — matching the G2 HUD's chat, message, and AI card patterns.

## Review Workflow

### For agents generating new G2-system artifacts:
1. Read `DESIGN.md` — canonical rules for color, typography, spacing, motion, voice, and anti-pattern.
2. Copy the `:root { ... }` block from `tokens.css` into the first `<style>` of your artifact.
3. Check `components.manifest.json` for available component groups (buttons, inputs, cards, typography, layout primitives).
4. Reference `components.html` for concrete proportions and state styling of those components.
5. Open relevant `preview/*.html` cards for visual reference on color, type, spacing, and component appearance.
6. For G2 AR/HUD contexts, apply the dark-theme override documented in `DESIGN.md` under Color → Dark-theme override.
7. For React-based artifacts, reuse components from `ui_kits/app/components/` or use them as structural templates.

### For human reviewers inspecting this package:
1. Open `preview/colors.html` through `preview/app.html` in a browser to review the visual system end-to-end.
2. Read `DESIGN.md` for the design rationale, product voice, and anti-pattern rules.
3. Open `ui_kits/app/index.html` in a browser to see the composed React interface live.
4. Review `components.html` for the compact component fixture.
5. Examine `index.html` (DevPulse developer SaaS analytics dashboard) for a production-applied artifact using this system's dark theme.

### For refreshing or updating this package:
1. Update `DESIGN.md` sections as the source design evolves.
2. Sync `tokens.css` with any new token definitions from the source.
3. Regenerate `preview/` cards if token values change.
4. Update `components.manifest.json` if component patterns change.
5. Run the package audit: `od tools connectors design-system-package-audit --path . --fail-on-warnings`
