# Cloudflare Kumo UI Design System

> Category: Developer Tools
> A compact, semantic component language for modern web applications: layered neutral surfaces, precise Inter typography, accessible controls, automatic light/dark color roles, and task-appropriate chart palettes.

## Provenance and intended use

This is an **Open Design curated integration** of Cloudflare's Kumo UI, not an official Cloudflare-maintained Open Design package and not an endorsement or partnership. It is based only on Cloudflare's official sources:

- [Kumo documentation](https://kumo-ui.com/), including the color, accessibility, component, and chart guidance.
- [`cloudflare/kumo`](https://github.com/cloudflare/kumo/tree/0c5832575c99988917b81cd752002e10f3dc9c7a) at commit `0c5832575c99988917b81cd752002e10f3dc9c7a`.
- npm package `@cloudflare/kumo` version `2.9.2`.
- Upstream license: MIT, Copyright (c) 2026 Cloudflare, Inc.

Use this package for developer tools, infrastructure consoles, administration surfaces, data-heavy dashboards, and product workflows that benefit from Kumo's compact component density. The package translates Kumo's semantic roles into Open Design's shared token contract; it does not vendor the React library, its components, or Cloudflare assets.

## Visual principles and atmosphere

Kumo interfaces are quiet, compact, and operational. Start with a near-white canvas (`--bg: oklch(98.75% 0 0)`) and white component surfaces (`--surface: #ffffff`). Use the recessed neutral (`--surface-warm: oklch(96% 0 0)`) for segmented controls, table tints, or nested regions; despite the Open Design slot name, this surface is neutral rather than warm.

Build depth with surface hierarchy, rings, and restrained shadows instead of decorative gradients. Kumo's official order is canvas → base component → elevated layer → recessed/tinted region. A `LayerCard`-style surface uses an `8px` radius, a semantic ring, and a small shadow. Keep related labels, descriptions, and actions tightly grouped; allow larger gaps only between separate tasks or sections.

Prefer sentence-case headings, short action-oriented labels, and content-first composition. Avoid uppercase headings, altered tracking, bold-heavy typography, oversized marketing treatments, and stacked cards inside cards. Inline icons should align with the first line of adjacent text, especially when labels can wrap.

## Semantic color system and themes

Choose tokens by role, never by the hue you happen to want. The light-mode bindings are:

| Open Design token | Kumo role | Value |
| --- | --- | --- |
| `--bg` | canvas | `oklch(98.75% 0 0)` |
| `--surface` | base component | `#ffffff` |
| `--surface-warm` | recessed compatibility tier | `oklch(96% 0 0)` |
| `--fg` | default text | `oklch(21% 0.006 285.885)` |
| `--muted` | subtle text | `oklch(55.6% 0 0)` |
| `--border` | line beside elevation | `oklch(14.5% 0 0 / 0.1)` |
| `--border-soft` | hairline between flat surfaces | `oklch(93.5% 0 0)` |
| `--accent` | brand background | `oklch(0.5772 0.2324 260)` |
| `--accent-hover` | brand-background hover | `oklch(48.8% 0.243 264.376)` |
| `--success` | success indicator | `oklch(59.6% 0.145 163.225)` |
| `--warn` | warning indicator | `oklch(73.9% 0.177 58.2)` |
| `--danger` | error/destructive indicator | `oklch(63.7% 0.237 25.331)` |

Set `data-mode="dark"` to follow Kumo's native mode hook. In generated Open Design artifacts, `data-theme="dark"` resolves the same override. Dark mode changes semantic values rather than adding `dark:` utility variants: the canvas becomes `oklch(10% 0 0)`, component surfaces become `oklch(17% 0 0)`, primary text becomes `oklch(97% 0 0)`, and the line/hairline pair becomes `oklch(32% 0 0)` / `oklch(26.9% 0 0)`.

Do not substitute Cloudflare orange (`#f6821f`) for every primary control. Kumo distinguishes its orange brand text role from the blue semantic brand background used by primary actions. Use semantic status colors only when meaning is present, and use tints or neutral surfaces behind longer status copy rather than flooding an interface with solid status color.

## Typography and hierarchy

Use Inter for display and body text, with system sans-serif fallbacks. Use the system monospace stack for code, identifiers, configuration keys, and tabular technical data. Inline monospace should be optically smaller than surrounding prose, following Kumo's guidance of roughly `0.9em`.

The base Kumo text scale is deliberately compact:

| Token | Size | Typical role |
| --- | --- | --- |
| `--text-xs` | `12px` | captions, compact labels |
| `--text-sm` | `13px` | dense secondary controls |
| `--text-base` | `14px` | body, buttons, data, interactables |
| `--text-lg` | `16px` | small heading or emphasized content |
| `--text-xl` | `20px` | dialog or card title |
| `--text-2xl` | `24px` | section heading |
| `--text-3xl` | `30px` | page heading |
| `--text-4xl` | `36px` | Open Design compatibility ceiling |

Body leading is `1.5`; display leading is `1.2`. Keep `--tracking-display: 0`: the official Kumo design skill explicitly avoids manual tracking. Use weight `600` for headings, `500` for emphasized inline text and control labels, and `400` for ordinary copy. Do not use `700` as the default emphasis mechanism.

## Spacing, density, radius, and layout

Kumo components use compact Tailwind utility spacing on a `4px` rhythm. The shared bindings are `4`, `8`, `12`, `16`, `20`, `24`, `32`, and `48px`. Related text commonly uses `4–8px`; control clusters use `8–12px`; card interiors use `16px`; distinct task groups use `24–32px`. Apply slightly less vertical than horizontal padding when that produces better optical alignment, such as `20px` horizontal with `16px` vertical.

Control radii map to Kumo's `rounded-sm`, `rounded-md`, and `rounded-lg` patterns: `4px`, `6px`, and `8px`; reserve `9999px` for pills, circular icon actions, and status shapes. Nested shapes within `8px` of each other must use concentric radii: outer radius equals inner radius plus the intervening padding.

Kumo does not publish global section or container tokens, so the following are explicitly Open Design compatibility bindings rather than upstream claims: section spacing is `64px` desktop, `48px` tablet, and `32px` phone; the container cap is `1200px` with `24px`, `16px`, and `12px` gutters. Treat these as starting values for product dashboards, not as Cloudflare layout specifications.

## Components and composition patterns

- **Buttons:** Default to the secondary style for ordinary actions. Reserve the primary blue treatment for the highest-emphasis action and use destructive styling only for consequential actions. Base controls are `36px` high with `8px` radii; Kumo also supports compact `20px` and `26px` sizes and a `40px` large size. Icon-only buttons require an accessible label.
- **Fields and inputs:** Pair controls with visible labels when possible. Inputs and buttons of the same size should align. Error content must be associated with its field, and placeholder text must not replace an accessible name.
- **Layered cards:** Use a base surface with a line ring and small shadow, or compose a restrained elevated header with a base content layer. Never nest `LayerCard` treatments inside one another.
- **Dialogs:** Keep dialogs mounted and drive visibility through open state so entry and exit motion can complete. Use `role="alertdialog"` for destructive confirmations and critical acknowledgements; use an ordinary dialog for forms and general content. Kumo's documented widths range from `288px` to `768px`.
- **Navigation and disclosure:** Keep active, hover, and focus states distinct. Preserve component-native keyboard behavior for menus, tabs, selects, command palettes, and collapsibles.
- **Loading:** Disable a loading action, retain its label when useful, and show a labeled spinner. Use skeleton lines for content-shaped loading, with stable dimensions to prevent layout shift.

Use semantic HTML before visual styling. A button performs an in-place action; a link navigates. Heading appearance must not determine heading level: choose `h1`–`h6` according to the document outline.

## Interaction, focus, disabled, and loading states

Every interactive element needs separate default, hover, active, focus-visible, disabled, and loading behavior. For a primary action, use `--accent`, switch immediately to `--accent-hover` on hover, and use the same value for active because Kumo does not publish a separate brand-active token. White (`--accent-on`) remains the label color on the saturated action surface.

Use `--focus-ring` as a visible `2px` ring. Its light value is Kumo focus near-black (`oklch(15% 0 0)`); its dark value is the light neutral `oklch(93.5% 0 0)`. Do not rely on a color-only hover change as the keyboard indicator. Disabled controls retain their form, remove interaction, use an appropriate inactive/subtle foreground, and must not be communicated by opacity alone when the state would become ambiguous.

Hover color changes are immediate in Kumo's design guidance; do not attach the motion tokens to simple color swaps. Use `150ms` for short opacity or transform state changes and `250ms` with `cubic-bezier(0.77, 0, 0.175, 1)` for larger disclosure or sidebar movement. Loading spinners need an accessible status label, and skeletons should preserve the eventual content footprint.

## Data visualization and chart color use

Select a chart palette by the data task:

- **Semantic:** use attention `#FC574A`, warning `#F8A054`, success `#00A63E`, neutral `#B9D6FF`, disabled `#CBCBCB`, and skeleton `#DDDDDD` when data has status, severity, or health meaning.
- **Categorical:** for nominal series, use the ordered light palette `#4290F0`, `#F5B647`, `#E8649D`, `#8D58EE`, `#50C3B6`, and `#D37536`. Cycle by modulo only when more series are unavoidable; prefer showing a small number of important categories.
- **Sequential:** for one magnitude, use `#E1EAF4`, `#8EBCF6`, `#4290F0`, `#0E58B4`, and `#03254F` from low to high in light mode. Dark mode reverses prominence so higher values remain visually strongest.

Do not use categorical color for ordered magnitude or semantic color for unrelated series. Color alone must not encode a distinction: pair line series with dashes or markers, provide labels and legends, and ensure patterns remain legible when colors are perceived similarly.

## Accessibility and keyboard behavior

Kumo is built on Base UI and provides ARIA roles, pointer behavior, keyboard navigation, and focus management for many components, but consumers still own correct labels, contrast, document structure, and visible focus styling. Preserve the provided behavior for arrow keys, alphanumeric typeahead, `Home`, `End`, `Enter`, and `Escape` where the component supports it.

Associate labels and errors with form controls. Add `aria-label` or `aria-labelledby` when no visible label exists, including icon-only controls. Supply alternative text for meaningful images and do not claim blanket WCAG conformance: verify actual foreground/background pairings in the generated interface. Keep focus indicators visible on every background, and restore focus appropriately when overlays close.

Use more than color to communicate errors, success, selection, and chart series. Avoid disabled text on a surface if contrast becomes unreadable. Preserve native button, link, table, form, and heading semantics instead of rebuilding them with generic containers.

## Motion and reduced motion

Motion should explain a state change, not decorate the interface. Kumo uses `150ms` transitions for dialogs, switches, popovers, and small state changes, while its sidebar defaults to `250ms` with the easing stored in `--ease-standard`. Keep collapsing content at a stable intrinsic width or height so text does not reflow during the exit.

Respect `prefers-reduced-motion: reduce`. This package sets `--motion-fast` and `--motion-base` to `0ms` in reduced-motion mode. Generated components must also stop continuous decorative motion, replace smooth scrolling with immediate movement, and preserve all information when an animation is removed. A necessary progress indicator may remain functional, but it still needs a textual status that does not depend on motion.

## Do and avoid

**Do**

- Use semantic surface, text, border, status, and focus roles so light and dark modes stay synchronized.
- Keep content text at `14px`, headings sentence-cased, and emphasis at medium or semibold weights.
- Group related content tightly and separate independent tasks with clear space or a hairline.
- Use rings with shadows, concentric radii, and a single primary action per decision point.
- Align icons with the first line of text and give icon-only controls accessible names.
- Match chart color systems to semantic, categorical, or sequential data tasks.

**Avoid**

- Raw palette colors when a semantic role exists, or manual `dark:` variants that bypass the theme.
- Uppercase headings, altered letter spacing, default bold (`700`) text, or oversized marketing typography.
- Slow hover color transitions, ornamental motion, or animations that ignore reduced-motion preferences.
- Borders combined indiscriminately with shadows; use Kumo's line/hairline ring hierarchy.
- Nested LayerCards, conditional dialog mounting, placeholder-only form labels, or unlabeled icon buttons.
- Claiming that Open Design's compatibility section/layout bindings are official Kumo tokens.
