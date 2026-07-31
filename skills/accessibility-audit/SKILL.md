---
name: "Accessibility Audit"
description: "Claude design system prompt skill for Accessibility Audit"
triggers:
  - "claude accessibility audit"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Accessibility Audit: WCAG and Inclusive Design Review

Review the current design for accessibility issues across contrast, semantic structure, keyboard navigation, motion, and forms. Fix any issues found. **Good accessibility is good design — it benefits everyone.**

## Phase 1: Identify the surface to audit

Audit the HTML file the user just edited or asked about; otherwise the most recently modified design file; if unclear, ask. Read it end-to-end and note the framework in use, the expected level (WCAG AA by default), and any user-stated constraints.

## Phase 2: Launch four review agents in parallel

Use the your autonomous sub-agent capabilities tool to launch all four agents concurrently in a single message, each with the full file contents.

Instruct every agent explicitly: report every issue found, including borderline and low-severity ones, with a confidence and severity estimate. Coverage is the agent's job; filtering happens at aggregation (Phase 3).

### Agent 1: Contrast and Color

1. **Text contrast.** Normal text (under 18px) needs 4.5:1; large text (18px+ bold or 24px+) needs 3:1; UI components (buttons, icons, focus rings) need 3:1. Compute the actual ratio for any color pair you can resolve; flag every failing pair with the ratio and the required minimum.
2. **Color-only signaling.** Flag any state communicated by color alone — green/red without an icon, links with no underline, charts with no legend or labels.
3. **Difficult combinations.** Red+green (most common colorblindness), blue+yellow at similar lightness, light gray on white, colored text on colored backgrounds with similar brightness.
4. **Whites and blacks.** Flag pure `#FFFFFF` on `#000000`; subtly toned (`#FAFAFA` / `#1A1A1A`) is preferred. Style recommendation, not WCAG.

### Agent 2: Semantic HTML and Structure

1. **Heading hierarchy.** Exactly one `<h1>`, no skipped levels; headings describe content, not visual size.
2. **Right element for the role.** `<button>` not `<div onclick>`; `<a href>` not a styled `<div>`; `<label for>` linked to inputs; `<nav>`/`<main>`/`<article>`/`<section>`/`<aside>` landmarks.
3. **Alt text on every meaningful image.** Decorative images get `alt=""`; meaningful images describe what they convey (`alt="Wireless headphones, side view"` not `alt="product"`).
4. **Form labels.** Every input has an associated `<label>` (or `aria-label`). Placeholder text alone is not a label.
5. **ARIA only when semantic HTML can't.** Flag `role="button"` on a `<div>` that could be a `<button>`.

### Agent 3: Keyboard Navigation and Focus

1. **Keyboard reachable.** Everything clickable is Tab-reachable — hover-only menus, mouse-only dropdowns, and keyboard-inaccessible modals fail.
2. **Logical tab order.** Follows reading order; flag `tabindex` values greater than 0.
3. **Interaction patterns.** Modals close on Escape; dropdowns open with Enter/Space and arrow-navigate; forms submit on Enter from a field.
4. **Visible focus rings.** Flag `outline: none` without a visible replacement meeting 3:1 contrast against the adjacent background. Prefer `:focus-visible` over `:focus`.
5. **Skip links.** Recommend "Skip to main content" on pages with significant repeated navigation.

### Agent 4: Motion, Forms, and Misc

1. **`prefers-reduced-motion` respected.** Animations beyond a couple hundred milliseconds need a `@media (prefers-reduced-motion: reduce)` block that shortens or removes them.
2. **No flashing** more than 3 times per second (photosensitive epilepsy risk); flag and require pause controls.
3. **Form errors** are specific ("Email address is invalid" not "Invalid"), tied to their field visually and via `aria-describedby`.
4. **Required fields** marked with text and/or icon plus the `required` attribute, not color alone.
5. **Input types and autocomplete.** `type="email"`, `type="tel"`, `autocomplete` attributes for autofill and mobile keyboards.
6. **Hit targets** at least 44×44px on touch surfaces.

## Phase 3: Aggregate and fix

Wait for all four agents to complete. Aggregate their findings into a single deduplicated list and fix each issue directly. For borderline cases (e.g., contrast at 4.4:1), apply the fix anyway — accessibility is the floor, not the ceiling. If a finding is a clear false positive or out-of-scope (e.g., the agent flagged a third-party embed you can't modify), note it and skip it.

Summarize: issues found by category (contrast / semantic / keyboard / motion-forms), issues fixed, and anything left for the user.
