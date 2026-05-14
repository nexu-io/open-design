# Token naming for token-first Tailwind

## Decision

Open Design owns the Tailwind color, radius, shadow, and font vocabulary. Tailwind v4 is configured with CSS-first `@theme`, clears the default color namespace with `--color-*: initial`, and exposes project tokens backed by `apps/web/src/index.css` CSS variables.

The runtime source of truth stays in `:root`, `[data-theme="dark"]`, and system-mode CSS variable overrides. Tailwind utilities resolve through those variables, so light mode, dark mode, system mode, and custom accent all share one token path.

## Naming model

Token names follow the current product language in `index.css` for core surfaces and copy, then use semantic names for status colors.

- Surface tokens use nouns: `bg`, `app`, `panel`, `subtle`, `muted`, `elevated`.
- Text utilities keep the `text-*` scale: `text-text`, `text-strong`, `text-muted`, `text-soft`, `text-faint`.
- Border tokens keep the `border-*` scale: `border`, `border-strong`, `border-soft`.
- Accent tokens keep the `accent-*` scale because user custom accent writes the same CSS variables at runtime.
- Status tokens use semantic names in Tailwind: `success`, `info`, `discovery`, `danger`, `warning`.
- Tailwind utility names should read as project concepts: `bg-panel`, `text-muted`, `border-border-strong`, `text-danger`, `bg-success-surface`, `bg-selection-overlay`, `rounded-card`, `shadow-token-sm`, and `font-mono`.
- Radius, shadow, and font utilities use project theme aliases backed by `--radius*`, `--shadow*`, `--sans`, `--serif`, and `--mono`; spacing uses Tailwind's native utilities such as `gap-3`. Typography generally uses the native Tailwind scale, with exact project aliases for existing 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, and 13.5px UI where visual parity requires those sizes.

## Design decision: token-backed color, radius, shadow, and font

Project-owned tokens cover colors, radius, shadow, and font because color carries Open Design's brand and theme behavior, while existing cards, popovers, modals, inputs, controls, editorial moments, and code/file-path text depend on project variables for visual stability.

Radius, shadow, and font aliases resolve to the current CSS variables, including dark-theme shadow overrides and custom `--serif` / `--mono` stacks. Spacing uses Tailwind's native system to keep TSX class names familiar during migration; type uses native utilities plus exact `text-ui-9`, `text-ui-10`, `text-ui-10_5`, `text-ui-11`, `text-ui-11_5`, `text-ui-12_5`, `text-ui-13`, and `text-ui-13_5` aliases for existing 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, and 13.5px component copy:

```tsx
className="rounded-card shadow-token-sm font-mono bg-panel text-text border border-border"
```

Global base styles in `index.css` continue to set the app-level font family, page background, and text color. Component-level font changes can use Tailwind font utilities because `font-sans`, `font-serif`, and `font-mono` resolve to the existing project stacks.

## Required `index.css` source variables

The implementation should add these source variables before using the corresponding `@theme` aliases, so Tailwind theme values still point to the runtime CSS-variable source of truth:

```css
:root {
  --accent-wash: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-foreground: #fff;
  --warning-border: color-mix(in srgb, var(--amber) 35%, transparent);
  --overlay: rgba(28, 27, 26, 0.42);
  --selection-overlay: rgba(22, 119, 255, 0.18);
  --selection-outline: rgba(22, 119, 255, 0.55);
  --inspect-overlay: rgba(37, 99, 235, 0.12);
}
```

The blue selection/inspect values are product interaction tokens for preview annotation overlays. Selection/comment tokens preserve the current FileViewer `#1677ff` / `rgba(22, 119, 255, …)` family; inspect overlay keeps the current edit-mode bridge `rgba(37, 99, 235, …)` value. File color conversion helpers that transport user-authored colors remain allowlisted exceptions.

## `@theme` block

```css
@theme {
  --color-*: initial;

  /* Surfaces */
  --color-bg: var(--bg);
  --color-app: var(--bg-app);
  --color-panel: var(--bg-panel);
  --color-subtle: var(--bg-subtle);
  --color-muted-surface: var(--bg-muted);
  --color-elevated: var(--bg-elevated);

  /* Borders */
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-border-soft: var(--border-soft);

  /* Text */
  --color-text: var(--text);
  --color-strong: var(--text-strong);
  --color-muted: var(--text-muted);
  --color-soft: var(--text-soft);
  --color-faint: var(--text-faint);

  /* Accent */
  --color-accent: var(--accent);
  --color-accent-strong: var(--accent-strong);
  --color-accent-soft: var(--accent-soft);
  --color-accent-tint: var(--accent-tint);
  --color-accent-hover: var(--accent-hover);
  --color-accent-wash: var(--accent-wash);
  --color-accent-foreground: var(--accent-foreground);

  /* Semantic status */
  --color-success: var(--green);
  --color-success-surface: var(--green-bg);
  --color-success-border: var(--green-border);
  --color-info: var(--blue);
  --color-info-surface: var(--blue-bg);
  --color-info-border: var(--blue-border);
  --color-discovery: var(--purple);
  --color-discovery-surface: var(--purple-bg);
  --color-discovery-border: var(--purple-border);
  --color-danger: var(--red);
  --color-danger-surface: var(--red-bg);
  --color-danger-border: var(--red-border);
  --color-danger-foreground: var(--bg-panel);
  --color-warning: var(--amber);
  --color-warning-surface: var(--amber-bg);
  --color-warning-border: var(--warning-border);

  /* Interaction and overlays */
  --color-focus: var(--accent);
  --color-focus-ring: var(--accent-soft);
  --color-overlay: var(--overlay);
  --color-selection-overlay: var(--selection-overlay);
  --color-selection-outline: var(--selection-outline);
  --color-inspect-overlay: var(--inspect-overlay);
  --color-control-hover: var(--bg-subtle);
  --color-control-active: var(--bg-muted);

  /* Radius */
  --radius-control: var(--radius-sm);
  --radius-card: var(--radius);
  --radius-panel: var(--radius-lg);
  --radius-token-pill: var(--radius-pill);

  /* Shadows */
  --shadow-token-xs: var(--shadow-xs);
  --shadow-token-sm: var(--shadow-sm);
  --shadow-token-md: var(--shadow-md);
  --shadow-token-lg: var(--shadow-lg);

  /* Fonts */
  --font-sans: var(--sans);
  --font-serif: var(--serif);
  --font-mono: var(--mono);

  /* Exact existing UI type sizes */
  --text-ui-9: 9px;
  --text-ui-10: 10px;
  --text-ui-10_5: 10.5px;
  --text-ui-11: 11px;
  --text-ui-11_5: 11.5px;
  --text-ui-12_5: 12.5px;
  --text-ui-13: 13px;
  --text-ui-13_5: 13.5px;
}
```

## Existing CSS variable mapping

### Surfaces

| Existing CSS variable | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--bg` | `--color-bg` | `bg-bg`, `text-bg` | Main warm paper canvas and inverse text on dark controls. |
| `--bg-app` | `--color-app` | `bg-app` | App shell background and loading shell background. Keep as compatibility alias while it equals `--bg`. |
| `--bg-panel` | `--color-panel` | `bg-panel`, `text-panel` | Cards, panes, inputs, popovers, modal foreground surfaces. |
| `--bg-subtle` | `--color-subtle` | `bg-subtle` | Quiet hover fills, sidebars, secondary control fills, code backgrounds. |
| `--bg-muted` | `--color-muted-surface` | `bg-muted-surface` | Stronger quiet fill, pressed control states, denser neutral chips. |
| `--bg-elevated` | `--color-elevated` | `bg-elevated` | Modals and elevated overlays. |

### Borders

| Existing CSS variable | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--border` | `--color-border` | `border-border`, `divide-border` | Default hairline borders. |
| `--border-strong` | `--color-border-strong` | `border-border-strong`, `divide-border-strong` | Hover, active, selected, and focus-adjacent borders. |
| `--border-soft` | `--color-border-soft` | `border-border-soft`, `divide-border-soft` | Internal dividers and low-contrast separators. |

### Text

| Existing CSS variable | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--text` | `--color-text` | `text-text`, `border-text`, `bg-text` | Default readable UI copy; `bg-text` for stop/destructive-neutral buttons. |
| `--text-strong` | `--color-strong` | `text-strong`, `bg-strong` | Headings, project names, high-emphasis labels. |
| `--text-muted` | `--color-muted` | `text-muted`, `border-muted` | Secondary copy, labels, icons, inactive controls. |
| `--text-soft` | `--color-soft` | `text-soft` | Lower-emphasis disabled-adjacent text. |
| `--text-faint` | `--color-faint` | `text-faint`, `placeholder:text-faint` | Placeholders, timestamps, dividers labels, low-emphasis metadata. |

### Accent

| Existing CSS variable | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--accent` | `--color-accent` | `bg-accent`, `text-accent`, `border-accent`, `ring-accent` | Primary actions, selected indicators, brand-rust emphasis, active focus edge. |
| `--accent-strong` | `--color-accent-strong` | `bg-accent-strong`, `text-accent-strong` | Pressed accent, stronger labels on tinted accent surfaces. |
| `--accent-soft` | `--color-accent-soft` | `bg-accent-soft`, `ring-accent-soft`, `shadow-[0_0_0_3px_var(--color-accent-soft)]` | Soft halo, input focus ring, active outline glow. |
| `--accent-tint` | `--color-accent-tint` | `bg-accent-tint` | Warm selected fills, gradient stops, subtle primary surfaces. |
| `--accent-hover` | `--color-accent-hover` | `bg-accent-hover`, `border-accent-hover` | Primary button hover state. |
| `--accent-wash` | `--color-accent-wash` | `bg-accent-wash` | Very quiet active fills using `color-mix(in srgb, var(--accent) 12%, transparent)`. |
| `--accent-foreground` | `--color-accent-foreground` | `text-accent-foreground` | Text and icons on solid accent surfaces. |

### Semantic status

| Existing CSS variable | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--green` | `--color-success` | `text-success`, `bg-success` | Successful status, saved state, positive confirmations. |
| `--green-bg` | `--color-success-surface` | `bg-success-surface` | Success notification and pill surfaces. |
| `--green-border` | `--color-success-border` | `border-success-border` | Success notification and pill borders. |
| `--blue` | `--color-info` | `text-info`, `bg-info` | Informational status and non-primary active state. |
| `--blue-bg` | `--color-info-surface` | `bg-info-surface` | Informational status surfaces. |
| `--blue-border` | `--color-info-border` | `border-info-border` | Informational status borders. |
| `--purple` | `--color-discovery` | `text-discovery`, `bg-discovery` | Tool, agent, discovery, or creative status emphasis. |
| `--purple-bg` | `--color-discovery-surface` | `bg-discovery-surface` | Discovery/tool status surfaces. |
| `--purple-border` | `--color-discovery-border` | `border-discovery-border` | Discovery/tool status borders. |
| `--red` | `--color-danger` | `text-danger`, `bg-danger`, `border-danger` | Errors, failed states, destructive actions. |
| `--red-bg` | `--color-danger-surface` | `bg-danger-surface` | Error and destructive confirmation surfaces. |
| `--red-border` | `--color-danger-border` | `border-danger-border` | Error and destructive confirmation borders. |
| `--bg-panel` on solid danger | `--color-danger-foreground` | `text-danger-foreground` | Text/icons on solid danger surfaces. |
| `--amber` | `--color-warning` | `text-warning`, `bg-warning` | Warning and caution status. |
| `--amber-bg` | `--color-warning-surface` | `bg-warning-surface` | Warning status surface. |
| `--warning-border` | `--color-warning-border` | `border-warning-border` | Warning status border. Add a real `--amber-border` later if warnings need hand-tuned contrast. |

### Interaction and overlay

| Source in `index.css` | Tailwind theme token | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--accent` | `--color-focus` | `outline-focus`, `ring-focus` | Focus-visible outlines and direct focus borders. |
| `--accent-soft` | `--color-focus-ring` | `ring-focus-ring` | Input and composer halo states. |
| `--overlay` | `--color-overlay` | `bg-overlay` | Modal scrim/backdrop. |
| `--selection-overlay` | `--color-selection-overlay` | `bg-selection-overlay` | Selected preview/comment overlays. |
| `--selection-outline` | `--color-selection-outline` | `border-selection-outline`, `ring-selection-outline` | Selected preview/comment overlay outlines. |
| `--inspect-overlay` | `--color-inspect-overlay` | `bg-inspect-overlay` | Inspect hover overlays and annotation hints. |
| `--bg-subtle` | `--color-control-hover` | `bg-control-hover` | Default neutral hover fill for controls. |
| `--bg-muted` | `--color-control-active` | `bg-control-active` | Neutral pressed/active fill for controls. |

### Radius and shadow

| Existing CSS variable | Tailwind behavior | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--radius-sm` | Expose as `--radius-control`. | `rounded-control` | Buttons, compact inputs, small controls. |
| `--radius` | Expose as `--radius-card`. | `rounded-card` | Cards, list rows, standard panels. |
| `--radius-lg` | Expose as `--radius-panel`. | `rounded-panel` | Popovers, modals, elevated panels. |
| `--radius-pill` | Expose as `--radius-token-pill`. | `rounded-token-pill` | Pills, badges, segmented controls. |
| `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` | Expose as `--shadow-token-xs`, `--shadow-token-sm`, `--shadow-token-md`, and `--shadow-token-lg`. | `shadow-token-xs`, `shadow-token-sm`, `shadow-token-md`, `shadow-token-lg` | Subtle controls, selected cards, popovers, modals, including dark-theme overrides. |

### Font and native Tailwind primitives

| Existing CSS variable | Tailwind behavior | Utility examples | Intended use |
| --- | --- | --- | --- |
| `--sans`, `--serif`, `--mono` | Expose as Tailwind font theme aliases while retaining the same CSS variables for base/global CSS. | `font-sans`, `font-serif`, `font-mono` | UI text, editorial moments, code/file paths. |
| Existing 9px / 10px / 10.5px / 11px / 11.5px / 12.5px / 13px / 13.5px component text | Use exact project text-size aliases where native `text-xs` or `text-sm` would create visible drift. | `text-ui-9`, `text-ui-10`, `text-ui-10_5`, `text-ui-11`, `text-ui-11_5`, `text-ui-12_5`, `text-ui-13`, `text-ui-13_5` | Compact badges, labels, metadata, and controls currently sized at 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, or 13.5px in `index.css`. |

## Utility vocabulary

Use this vocabulary for TSX migrations.

### Color utilities

- Surfaces: `bg-bg`, `bg-app`, `bg-panel`, `bg-subtle`, `bg-muted-surface`, `bg-elevated`.
- Borders: `border-border`, `border-border-strong`, `border-border-soft`, `divide-border`, `divide-border-soft`.
- Text: `text-text`, `text-strong`, `text-muted`, `text-soft`, `text-faint`, `placeholder:text-faint`.
- Accent: `bg-accent`, `text-accent`, `border-accent`, `bg-accent-hover`, `text-accent-strong`, `bg-accent-tint`, `bg-accent-soft`, `text-accent-foreground`.
- Status: `text-success`, `bg-success-surface`, `border-success-border`, `text-info`, `bg-info-surface`, `border-info-border`, `text-discovery`, `bg-discovery-surface`, `border-discovery-border`, `text-danger`, `bg-danger-surface`, `border-danger-border`, `text-warning`, `bg-warning-surface`, `border-warning-border`.
- Interaction: `outline-focus`, `ring-focus`, `ring-focus-ring`, `bg-overlay`, `bg-selection-overlay`, `border-selection-outline`, `ring-selection-outline`, `bg-inspect-overlay`, `bg-control-hover`, `bg-control-active`.

### Radius, shadow, and font utilities

- Radius: `rounded-control`, `rounded-card`, `rounded-panel`, `rounded-token-pill`.
- Shadows: `shadow-token-xs`, `shadow-token-sm`, `shadow-token-md`, `shadow-token-lg`.
- Fonts: `font-sans`, `font-serif`, `font-mono` resolve to `--sans`, `--serif`, and `--mono`.

### Utility examples

- Radius: `rounded-control`, `rounded-card`, `rounded-panel`, `rounded-token-pill`.
- Shadows: `shadow-token-xs`, `shadow-token-sm`, `shadow-token-md`, `shadow-token-lg`.
- Fonts: `font-sans`, `font-serif`, `font-mono` for project-backed sans, serif, and monospace stacks.
- Type: native Tailwind type utilities for standard sizes, plus `text-ui-9`, `text-ui-10`, `text-ui-10_5`, `text-ui-11`, `text-ui-11_5`, `text-ui-12_5`, `text-ui-13`, and `text-ui-13_5` when matching existing 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, or 13.5px UI exactly.

## Migration rules

1. Use Open Design color token utilities for app UI chrome and component styling.
2. Keep raw CSS variables as the visual source in `index.css`; Tailwind `@theme` tokens should reference `var(--*)` for theme-sensitive values.
3. Use status names in TSX. Examples: `text-danger`, `bg-success-surface`, `border-info-border`.
4. Use project-backed radius and shadow utilities for migrated components that currently depend on `--radius*` or `--shadow*`; examples include `rounded-card`, `rounded-panel`, `shadow-token-sm`, and `shadow-token-md`.
5. Rely on the local `index.css` border-style reset from the Tailwind no-Preflight setup so `border border-border`, `border-border-strong`, and related token utilities render solid borders. Add explicit `border-solid` only for isolated scopes that cannot inherit that reset.
6. Use exact type aliases `text-ui-9`, `text-ui-10`, `text-ui-10_5`, `text-ui-11`, `text-ui-11_5`, `text-ui-12_5`, `text-ui-13`, and `text-ui-13_5`, or inherited type size when the parent already supplies the exact current size, for migrated component text currently defined as 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, or 13.5px in `index.css`.
7. Before applying token utilities to an element, remove, constrain, or move to `@layer base` any retained global element/reset selector that sets the same CSS properties. Unlayered retained CSS must not override migrated token utilities such as `bg-accent`, `rounded-card`, `border-border`, `px-*`, or `font-*` on the same element.
8. Use `font-sans`, `font-serif`, and `font-mono` only after the Tailwind font theme aliases point to `var(--sans)`, `var(--serif)`, and `var(--mono)`; migrated editorial and code/file-path text must preserve the current project stacks.
9. Use complete static class maps for dynamic variants. Avoid fragment interpolation such as `bg-${status}-surface`; prefer maps such as `{ success: 'bg-success-surface text-success', danger: 'bg-danger-surface text-danger' }`. Add an explicit safelist only when runtime-generated classes are required.
10. Use `selection`/`inspect` tokens for preview annotation overlays in app UI and edit-mode integration. Keep file color conversion helpers allowlisted only when they transport user-authored colors.
11. Keep brand assets, SVG illustration colors, sketch/canvas user colors, and file color conversion helpers as documented exceptions.
12. Add one color token before repeating the same arbitrary color value in multiple components.
13. Keep complex one-off gradients and `color-mix()` expressions local during migration only when they encode component-specific art direction; promote repeated patterns into the interaction/status tokens above.
14. Treat CSS-wide/special keywords such as `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` as non-token color semantics for transparent fills, SVG/current-color inheritance, and reset/inherit states. The guard should exempt these keywords while still rejecting real unapproved named colors in app UI chrome.
15. Add style guard fixtures for the keyword exemptions and for at least one rejected real named color so the guard distinguishes CSS semantics from unapproved palette names.

## Existing conflicts and exception handling

The current codebase has a small set of color sources that need either migration to tokens or explicit allowlist handling before the guard becomes strict.

### Migrate to tokens

- `apps/web/src/components/SettingsDialog.tsx:4244,4255,4358,4369-4370` uses legacy variable names and fallback colors such as `var(--danger-fg, #f88)`, `var(--warning-fg, #fbbf24)`, `var(--fg-2, #9aa0a6)`, `var(--surface-2, #11141a)`, and `var(--fg-1, #e6e6e6)`. Replace these with current tokens or Tailwind utilities such as `text-danger`, `border-warning-border`, `text-muted`, `bg-subtle`, and `text-text`.
- `apps/web/src/index.css:200,202,449,454,1303-1311,6492-6500,8130-8133` contains component-level hardcoded foregrounds, shadows, status fallbacks, and live artifact badge colors. Replace these with `--accent*`, `--info*`, `--danger*`, `--success*`, `--warning*`, `--color-accent-foreground`, or migrated Tailwind token utilities.
- `apps/web/src/components/FileViewer.tsx:2350-2352` and `apps/web/src/edit-mode/bridge.ts:200-202` use blue inspect/comment overlay colors. Replace these with `selection`/`inspect` tokens because preview annotation overlays are a repeated product interaction concept.

### Allowlist as intentional exceptions

- Brand and product assets: `apps/web/src/components/AgentIcon.tsx` brand fills and brand gradients.
- One-off SVG illustrations and previews: `apps/web/src/components/NewProjectPanel.tsx:888-912` preview artwork and `apps/web/src/components/NewProjectPanel.tsx:1674-1677` generated HSL artwork. Prefer CSS variables when practical, but allow fixed SVG/art colors when the values encode the illustration itself.
- User-controlled color input and persisted accent defaults: `apps/web/src/state/config.ts`, `apps/web/src/state/appearance.ts`, `apps/web/src/components/SettingsDialog.tsx:4486-4495` accent palette, and `apps/web/src/components/pet/PetSettings.tsx:41-48` pet accent settings. These values are inputs to the token system or user content.
- Canvas and sketch colors: `apps/web/src/components/SketchEditor.tsx` brush colors and canvas drawing colors. Use tokens for UI controls around the canvas; keep user drawing data as user content. The eraser/background color can use `var(--bg)` when it represents the app canvas background.
- File/content color conversion and inspect overrides: `apps/web/src/components/FileViewer.tsx` helpers and related tests may keep raw values only when they operate on user-authored HTML/CSS or browser computed colors. Preview annotation overlays use the `selection`/`inspect` tokens above.
- Manual edit user input examples: `apps/web/src/components/ManualEditPanel.tsx:309` placeholder colors are examples of user-authored CSS values, not app chrome styling.
- External document, iframe, popup, and generated runtime HTML styles: `apps/web/src/runtime/exports.ts`, `apps/web/src/runtime/react-component.ts`, `apps/web/src/providers/registry.ts:423-488`, and `apps/web/src/edit-mode/bridge.ts`. These documents may run outside the app CSS/Tailwind context, so inline values are acceptable when scoped and documented.
- Tests and fixtures under `apps/web/tests/` when the colors are test data for user content, accent normalization, or override parsing.

### General decision framework

When a new color appears, classify it before adding an allowlist entry:

1. App UI chrome or reusable component styling must use Tailwind token utilities or CSS variables from this file.
2. Repeated arbitrary colors should become a named token after the second real use.
3. Runtime theme, custom accent, and appearance code may write CSS variable values because they are token sources.
4. User-authored content, canvas drawing data, imported files, inspect overrides, and color conversion helpers may preserve raw color values because the app is transporting user data.
5. Brand assets, icons, and one-off SVG illustrations may keep fixed colors when the color belongs to the asset artwork.
6. External documents without access to app CSS may keep scoped inline colors, with a comment or allowlist reason that identifies the runtime boundary.
7. Every allowlist entry should include file scope, pattern scope, and reason. Broad path-wide allowlists should be reserved for directories that exclusively contain generated, fixture, or user-content code.

## Guardrail target

The style guard should reject default Tailwind palette utilities in app UI files after this token set lands. Examples to reject include `text-red-500`, `bg-white`, `border-zinc-200`, `from-orange-500`, `ring-blue-400`, and similar default palette classes.

Hardcoded UI color detection lands as Phase 1 scaffolding with keyword exemptions, allowlist structure, and fixture/temp-sample validation. Existing hardcoded UI colors stay classified as migration inventory or explicit exceptions until the component migration phases tighten enforcement by area. Phase 6 enables strict enforcement for the remaining app UI surface.

Allowed color sources are:

- Tailwind utilities generated by the `@theme` tokens in this file.
- Existing CSS variables in `index.css` and runtime appearance code.
- CSS-wide/special keywords such as `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` when they express transparent, inherited, or reset behavior.
- Explicitly documented exceptions for brand assets, SVG illustrations, canvas/sketch user colors, user-authored content, external runtime documents, tests/fixtures, and color conversion helpers.
