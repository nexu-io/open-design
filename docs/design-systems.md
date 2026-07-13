# Design System Authoring Guide

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md)

This guide covers everything a contributor needs to submit a design system that passes review the first time. If you are adding a design system to `design-systems/<slug>/DESIGN.md`, read this document before opening a PR.

---

## 1. The 9-Section Schema

Every `DESIGN.md` must have these nine section headings:

```
## 1. Visual Theme & Atmosphere
## 2. Color
## 3. Typography
## 4. Spacing
## 5. Layout & Composition
## 6. Components
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

The schema parser extracts headings with `## [0-9].*` — it matches the section number prefix, not the full text. You can add context after the number (e.g., `## 4. Spacing & Grid` or `## 4. Spacing and layout`). Only the `## [digit].` prefix is required. Empty section bodies are acceptable (for rarely-used tokens like motion), but the nine numbered headings must be present.

### Header format

The first H1 becomes the label shown in the design-system picker dropdown. The `> Category:` line immediately after the H1 determines grouping:

```markdown
# Design System Inspired by YourBrand

> Category: Developer Tools
> One-line summary for the picker preview.
```

Available categories: AI & LLM, Developer Tools, Productivity & SaaS, Backend & Data, Design & Creative, Fintech & Crypto, E-Commerce & Retail, Media & Consumer, Automotive, Editorial & Print, Retro & Nostalgic, Bold & Expressive, Modern & Minimal, Professional & Corporate. If none fit, introduce a new one with a PR comment explaining why.

---

## 2. The Review Framework: Lens A and Lens B

All design system PRs are reviewed against two lenses. Understanding these before you submit eliminates most round-trips.

### Lens A — Code Correctness (P1/P2)

Is the file structurally valid and machine-processable? Failing Lens A is blocking.

**Checks:**
- All 9 section headings present and in order
- Color tokens are real hex codes (`#RRGGBB` or `#RGB`), not `#REPLACE_ME`, `currentColor`, or CSS variable names
- No duplicate folder names in `design-systems/`
- CSS variables wrapped in `:root {}` blocks (not bare in the document)
- Font labels for catalog extraction present (see Section 3 below)
- `prefers-reduced-motion` targets specific elements, not a global `*` selector
- Dark mode tokens use `[data-theme="dark"]` override pattern, not duplicate token blocks

### Lens B — Reasoning Completeness (P3)

Is the content substantive and useful, not just syntactically valid? Failing Lens B generates a P3 comment, not a hard block.

**Checks:**
- Color palette lists all roles used in the design system, not just primary/secondary
- Type scale includes Display, H1, Body, Caption (minimum 4 tiers)
- Components section has real CSS, not Lorem Ipsum or placeholder `/* TODO */` blocks
- Anti-patterns are specific (e.g., "Do not use rounded corners > 4px" rather than "Avoid bad design")
- Dark mode is a genuine override with different token values, not a copy of the light block
- Prior art section names real, specific products or design systems (not "inspired by good design")

---

## 3. CSS Variable Structure

### `:root` block (required)

All CSS variables must be inside a `:root {}` block. Bare CSS variable declarations at the top level of a section are invalid.

```css
/* Correct */
:root {
  --color-primary: #625DF5;
  --color-bg: #FFFFFF;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Incorrect — not valid standalone CSS outside :root */
--color-primary: #625DF5;
```

Every color, spacing, typography, and shadow token belongs in `:root`. The exception is component-scoped overrides (e.g., `.card { --card-padding: 16px; }`) which belong under Components.

### Dark mode pattern

Use `[data-theme="dark"]` to override tokens for dark mode:

```css
:root {
  --color-primary: #625DF5;
  --color-bg: #FFFFFF;
}

[data-theme="dark"] {
  --color-primary: #7B75FF;
  --color-bg: #0D0D0D;
}
```

Do not create separate CSS blocks for light and dark without using the `[data-theme="dark"]` selector — it breaks the semantic token system.

### Font labels for catalog extraction

Include this block in the Typography section for the daemon's parser regexes:

```
Font labels for catalog extraction:

Display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
Mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

Labels must be `Display:`, `Body:`, `Mono:` with a colon, followed by the full font stack. The daemon reads these to populate the design-system catalog.

---

## 4. Accessibility Requirements

### WCAG AA contrast ratios

All text and data colors must pass **4.5:1 minimum** contrast ratio against their background (4.5:1 for normal text, 3:1 for large text at 18px+ or 14px+ bold).

**How to verify:**
- Use a contrast checker tool (e.g., WebAIM Contrast Checker, or `#B37A00` on `#FFFFFF`)
- Test each foreground token against its paired background token — not against white by default

**Common mistakes:**
- Claiming WCAG compliance without testing — the review will catch this
- Using a color that "looks fine" on white but fails on the actual dark surface
- Warning/caution colors like `#B37A00` (3.05:1 on white, 5.35:1 on `#FFF3CD`) — verify against the correct background context

**Tertiary text tokens** (timestamps, metadata, grid labels) on dark surfaces must still pass 4.5:1. Do not use `#4A6080` on `#0A0A0A` — that is 2.1:1. Use `#808086` on `#0A0A0A` instead (4.54:1).

### Focus states

Every interactive component (buttons, links, input fields, cards with click handlers) must have a `:focus-visible` style:

```css
.button-primary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

This is a Lens A accessibility requirement. Keyboard-only users get no visual feedback without it.

---

## 5. Component Section Best Practices

The Components section is the most commonly rejected part of a design system. Common failures:

**Do not use hardcoded colors in component CSS.** Every color must reference a semantic token:

```css
/* Correct */
.button-primary {
  background: var(--color-primary);
  color: var(--color-text);
}

/* Incorrect — hardcoded white breaks dark mode */
.button-primary {
  background: var(--color-primary);
  color: #ffffff;
}
```

**Use semantic names for states.** Prefer `--color-state-success` over `#00D26A` directly in component CSS.

**Example component structure:**

```css
/* Status Badge */
.badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 2px;
}

.badge-success {
  background: rgba(38, 222, 129, 0.15);
  color: var(--color-success);
  border: 1px solid rgba(38, 222, 129, 0.3);
}

.badge-warning {
  background: rgba(255, 159, 67, 0.15);
  color: var(--color-warning);
  border: 1px solid rgba(255, 159, 67, 0.3);
}

.badge-critical {
  background: rgba(255, 71, 87, 0.15);
  color: var(--color-critical);
  border: 1px solid rgba(255, 71, 87, 0.3);
}
```

---

## 6. Motion & Interaction

### `prefers-reduced-motion`

Target specific properties, not all elements globally:

```css
/* Correct — targets only the elements that animate */
@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 8px currentColor; }
  50% { text-shadow: 0 0 20px currentColor; }
}

@media (prefers-reduced-motion: reduce) {
  .alert-banner { animation-duration: 0.01ms !important; }
  .countdown { animation: none; }
}

/* Incorrect — global * selector disables transitions everywhere */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

### Timing conventions

```css
--transition-fast:   100ms ease-in;
--transition-base:   150ms ease-out;
--transition-slow:   300ms ease-out;
```

Match easing to purpose: `ease-in` for entering, `ease-out` for leaving, `linear` for continuous motion (scrolling, data updates).

---

## 7. Locale Coverage Requirements

When adding a new design system, include complete English catalog metadata in `design-systems/<id>/DESIGN.md`. Locales use translated summaries when present and otherwise derive the runtime fallback from the English source fields.

### Which localized dictionaries need updating?

Use this decision tree to decide whether to add dictionary copy:

**Does a localized summary already exist for this design system?**
- **Yes** → Add it to the matching `*_DESIGN_SYSTEM_SUMMARIES` dictionary.
- **No** (no translation yet) → Keep the English `summary` and `category` metadata complete in `DESIGN.md`; the localized runtime renders those fields through the default fallback path.

| Locale | File to update | Array |
|--------|---------------|-------|
| German | `apps/web/src/i18n/content.ts` | `DE_DESIGN_SYSTEM_SUMMARIES` when localized copy exists |
| French | `apps/web/src/i18n/content.fr.ts` | `FR_DESIGN_SYSTEM_SUMMARIES` when localized copy exists |
| Russian | `apps/web/src/i18n/content.ru.ts` | `RU_DESIGN_SYSTEM_SUMMARIES` when localized copy exists |

The default English fallback path is automatic. Add localized summary dictionaries only when translated copy exists.

### Test behavior

The `e2e/tests/localized-content.test.ts` test verifies that every `design-systems/*/DESIGN.md` on disk is discoverable and renders a non-empty localized summary through either translated dictionary copy or the English fallback fields.

---

## 8. Anti-patterns Section

The anti-patterns section is where reviewers check if you understand what your design system is **not**. Good anti-patterns are specific and bounded:

```markdown
## 9. Anti-patterns

- Do not use decorative colors in data displays — every hue must convey operational meaning
- Do not use rounded corners greater than 4px — this aesthetic is functional, not friendly
- Do not use proportional fonts for telemetry values — monospace exclusively for data
- Do not animate non-alert elements — motion is reserved for signals that matter
- Do not use light mode — low-light environments are the only context
```

Bad anti-patterns are vague:
- ❌ "Avoid bad design"
- ❌ "Don't overcomplicate things"
- ❌ "Use good colors"

---

## 9. Pre-submission Checklist

Before opening a PR, verify:

- [ ] All 9 section headings present in order
- [ ] No `#REPLACE_ME` or placeholder hex codes
- [ ] All CSS variables wrapped in `:root {}`
- [ ] Font labels block present (Display / Body / Mono)
- [ ] `[data-theme="dark"]` block overrides light tokens, not copies them
- [ ] Interactive components have `:focus-visible` styles
- [ ] All color tokens verified at 4.5:1+ contrast against their paired background
- [ ] No hardcoded colors (like `#ffffff`) in component CSS — use semantic tokens
- [ ] `prefers-reduced-motion` targets specific elements, not `*`
- [ ] Anti-patterns are specific and bounded, not vague prose
- [ ] Dark mode section explicitly states the design intent if dark-only
- [ ] No duplicate CSS block definitions (check for `.panel` appearing twice)
- [ ] Category choice confirmed against existing category list

---

## 10. Design System Size Guide

A well-documented design system is typically 300–600 lines. Being too brief (under 100 lines) triggers a Lens B review asking for more substance. Being verbose does not help if the content is generic.

**Focus areas:**
- Color: 30–50 lines (palette tables + CSS blocks)
- Components: 100–200 lines (3–6 components, fully specified)
- Visual Theme: 30–40 lines (atmosphere + use cases + prior art)
- Anti-patterns: 8–15 lines (one per key mistake to avoid)

The mission-control design system (`design-systems/mission-control/DESIGN.md`) is a good reference — tight scope (3 primary colors, dark only, 6 components).
