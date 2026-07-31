---
name: "Interaction States Pass"
description: "Claude design system prompt skill for Interaction States Pass"
triggers:
  - "claude interaction states pass"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Interaction States Pass

Verify every interactive element has a complete set of states (default, hover, active, disabled, focus, loading) plus transitions and feedback; add what's missing. **Interactive elements without state feedback feel broken** — a button without hover looks like a label; a removed focus ring locks out keyboard users. This is the safety net before a design is shown to users.

## Phase 1: Inventory interactive elements

Walk the design and list every interactive element: buttons (including `role="button"` and anything with a click handler), links, form inputs, toggles (checkboxes, radios, switches), clickable cards or rows, navigation items (tabs, sidebar links, breadcrumbs), and custom widgets (dropdowns, accordions, modals, popovers).

## Phase 2: Per-element state verification

Check all six aspects for each element. Flag everything, including borderline cases — note a confidence level rather than silently dropping a finding you're unsure about.

1. **Default.** Clearly interactive at rest: buttons have fill or border distinct from body text; links look like links; inputs have visible borders or fills. Flag elements that only reveal interactivity on hover — touch and keyboard users never hover.
2. **Hover.** Visual change on cursor-over — at minimum a color shift; better, color + shadow + slight transform (`translateY(-2px)`). Don't use opacity reduction as hover; it reads as disabled.
3. **Active / pressed.** Darker color, slight scale-down (`transform: scale(0.98)`), or return-to-baseline — confirms the click registered before the action completes.
4. **Disabled.** Lower opacity (~0.6), no hover effect, `cursor: not-allowed`, distinct from both default and hover. If disabled pending a condition ("fill all required fields"), indicate *why* — tooltip, inline message, or `title` attribute.
5. **Focus.** Visible ring via `:focus-visible` (not bare `:focus`): 3:1 contrast against the adjacent background, at least 2px thick with 2px offset. `outline: none` is **never** used without a replacement.
6. **Loading** (for elements that trigger async work). Disable on click to prevent double-submission, swap the label for a spinner or "Loading…", restore on completion. Data fetched on render gets a skeleton, spinner, or progress indicator.

## Phase 3: Verify transitions

Every state change transitions smoothly, not snapped (`transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease`):

- **0.15–0.3s** for state changes (hover, focus, active); **0.3–0.5s** for entry/exit (modals, drawers, toasts)
- Avoid over 0.5s on micro-interactions (laggy) and 0s / no transition (broken)
- Wrap motion-heavy transitions in `@media (prefers-reduced-motion: reduce)`

## Phase 4: Verify feedback for actions

Every action shows a visible result: submission success (toast, inline message, or redirect with confirmation), submission failure (clear error, tied to the field if field-specific), validation errors (appear on blur or submit, cleared when fixed), state changes (immediate visual update). Flag silent successes and silent failures — both feel broken.

Current state is visible too: the active page or tab, selected items, and active filters or sorts are visually distinct.

## Phase 5: Apply fixes and summarize

Add each missing state or feedback element using the design system's tokens. Where the system doesn't define one, use: hover 10–15% darker (or `color-mix`); active another 10% or `scale(0.98)`; disabled opacity 0.6 + `cursor: not-allowed`; focus `outline: 2px solid var(--color-primary); outline-offset: 2px`; transition `0.2s ease`. Where the right state isn't obvious (e.g., a toggle button's hover-on-active), make a judgment call and note it.

Summarize: elements inventoried, states added by category, transitions added or normalized, feedback added, judgment calls the user should review.
