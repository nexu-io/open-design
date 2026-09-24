# Android Material 3 Design Rules

`DESIGN.md` is the canonical rules file for this package. It describes a reusable Material 3 baseline, not a finished product brand. Product evidence always overrides the fallback palette, sample information architecture, and example copy.

## Product Context

Use this system for Android applications and responsive web interfaces that benefit from Material 3 semantics: task-focused navigation, adaptive list-detail or supporting-pane layouts, accessible component states, and coordinated light/dark themes. The package does not contain evidence for a specific product, so it must not invent a logo, brand font, product name, or Google-like content model.

## Color Palette and Roles

Consume semantic roles instead of palette values. Pair each container with its matching foreground: `primary` with `on-primary`, `primary-container` with `on-primary-container`, and the same pattern for secondary, tertiary, error, and surfaces.

- Primary marks the most important action and selected emphasis; do not paint every interactive element primary.
- Secondary and tertiary roles provide lower-priority differentiation, not arbitrary decoration.
- Surface container tiers establish hierarchy before shadows. Use `surface-container-low` through `surface-container-high` according to nesting and emphasis.
- Outline roles define borders and separators. Do not substitute low-contrast text for structural borders.
- Error roles communicate failure together with text or icon cues; color alone is insufficient.
- A product source color requires a complete generated light/dark scheme. Replacing only one token breaks contrast relationships.

The CSS palette is a stable fallback. Android 12+ products may use dynamic color when the product and user setting allow it, while retaining a deterministic baseline for unsupported environments.

## Typography and Type Scale

The baseline has fifteen roles across display, headline, title, body, and label families. Use display roles sparingly, headline/title for content hierarchy, body for reading, and labels for controls or compact metadata.

- Default to Roboto on Android and system-compatible fallbacks on the web.
- Preserve role line-height and weight relationships when localizing.
- Do not use label-small for essential long-form content.
- Avoid all-caps as a default control treatment; use sentence case unless product language rules require otherwise.
- Allow text reflow and zoom. Do not fix component heights around a single language sample.

## Spacing and Layout

Use a 4px base grid. Common gaps are 4, 8, 12, 16, 24, and 32px; page-level separation may use 40 or 48px when hierarchy needs it. Interactive targets must be at least 48 by 48 CSS pixels even when the visible icon is smaller.

Choose structure from available window width rather than device labels:

- Compact, below 600px: single-pane content, top app bar, and bottom navigation when primary destinations need persistent access.
- Medium, 600–839px: navigation rail and one primary content pane; list and detail may replace each other.
- Expanded, 840–1199px: simultaneous list-detail or supporting-pane layouts.
- Large, 1200–1599px, and extra-large, 1600px or wider: preserve readable content measures and add supporting space rather than stretching text indefinitely.

Canonical layouts are feed, list-detail, and supporting pane. The content task decides which one to use. Breakpoints must never be exposed as design controls inside a production interface.

## Shape and Elevation

Use radius tiers with purpose: 4px for tight utility surfaces, 8px for compact controls, 12px for fields and cards, 16px for larger containers, 24px for dialogs or prominent surfaces, and a full pill for chips/FABs where appropriate.

Prefer tonal surface changes over heavy shadows. Elevation level 0 is flat; levels 1–3 may distinguish floating actions, menus, dialogs, and snackbars. Avoid stacking multiple shadow styles or using elevation only as decoration.

## Components

- Buttons: use one filled primary action per focused task area when possible. Tonal, outlined, and text buttons express decreasing emphasis. Disabled controls remain legible and non-interactive.
- Navigation: choose bottom bar, rail, or drawer based on width and destination count. Preserve destination labels where recognition would otherwise suffer.
- Lists and cards: selection, unread state, metadata, and actions need distinct semantics. Do not turn every row into a floating card.
- Text fields: labels persist beyond placeholder text. Helper and error text explain requirements and recovery.
- Dialogs: reserve modal interruption for decisions requiring immediate attention. Keep action order and focus behavior predictable.
- Snackbars: announce short-lived feedback through an `aria-live` region on the web and offer undo only when the operation is reversible.
- Progress: use determinate progress when measurable and indeterminate progress only when duration is unknown.

Every interactive component must define enabled, hover, focus-visible, pressed, selected where applicable, error where applicable, loading where applicable, and disabled states.

## Motion and Interaction

Use standard motion for frequent transitions and expressive motion only for moments that benefit from stronger spatial explanation. Motion must communicate hierarchy or continuity, not delay task completion.

- Keep common state transitions around the short/medium token range.
- Preserve input focus and scroll position during adaptive layout changes.
- Avoid animating large layout distances when opacity or a small transform communicates the same change.
- Under `prefers-reduced-motion: reduce`, remove non-essential transforms and reduce durations to near-instant feedback.
- Keyboard focus must remain visible and follow logical document order.

## Voice and Content

Use concise, task-oriented sentence case. Button labels name actions such as “Reply”, “Archive”, or “Send”; headings name places or objects. Error copy explains both the problem and the next action. Avoid generic “Something went wrong” messages when a specific recovery is known.

The sample inbox copy is demonstrative only. Do not transfer names, messages, or product terminology into unrelated artifacts.

## Accessibility

Target WCAG-compatible contrast, visible focus, semantic landmarks, labeled form controls, descriptive errors, and non-color state indicators. Test text scaling and localization. Web components must use native elements before adding ARIA; Android implementations should expose equivalent Compose semantics.

## Anti-patterns

- Copying Google product branding or information architecture because the system is Material.
- Hardcoding palette hex values inside components instead of consuming semantic tokens.
- Replacing only `primary` while leaving incompatible foreground and container roles.
- Treating compact layout as a scaled-down desktop three-column view.
- Using shadows on every surface instead of tonal hierarchy.
- Hiding labels, validation, or focus state for visual minimalism.
- Displaying token controls, breakpoint switches, source metadata, or generator instructions in a product UI.
- Claiming generated assets, fonts, or components are preserved source evidence.

## Review Checklist

Verify role pairing in both themes, readable type hierarchy, 4px-grid alignment, 48px targets, keyboard traversal, field errors, disabled states, snackbar announcements, reduced motion, and the compact/medium/expanded layout transitions. Update the previews and UI kit whenever a canonical rule changes.
