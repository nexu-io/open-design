# Interaction and states

Every interactive element has eight states. Most AI-generated UI styles two (default, hover) and forgets the rest. That's where interfaces break.

## The eight states

| State | When | Treatment |
| --- | --- | --- |
| Default | At rest | Base styling |
| Hover | Pointer over (only with `@media (hover: hover)`) | Small shift: colour, 1px translate, subtle border |
| Focus | Keyboard or programmatic focus | Visible ring, `:focus-visible` |
| Active / Pressed | During press | Pressed-in: darker, translate(0 1px) |
| Disabled | Not interactive | Reduced opacity (0.5) + `cursor: not-allowed` + `aria-disabled` |
| Loading | Processing | Inline spinner or progress, label stays readable |
| Error | Failed state | Red border, error icon, message, `aria-invalid` |
| Success | Completed | Green check, confirmation, auto-dismiss |

If any of these is missing on a production element, the element isn't finished.

## Focus rings

Visible, always, on every interactive element. The default focus ring most browsers give you is fine; a custom one is better.

```css
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Requirements:

- 2–3px, ≥ 3:1 contrast against both element and page.
- 2px offset from the element.
- `:focus-visible`, not `:focus`, so it's keyboard-only.
- Never `outline: none` without a replacement. `outline: none` with no other focus style is the most common accessibility bug and an immediate audit failure.

## Hit targets

Minimum 44×44 CSS px for any touch-reachable element. Use padding or an `::before` overlay to expand the hit target without changing visual size:

```css
.icon-btn {
  position: relative;
}
.icon-btn::before {
  content: "";
  position: absolute;
  inset: -12px;
}
```

## Forms

- Labels above inputs. Visible. Never placeholder-as-label.
- Placeholders show format, not instruction. `Placeholder: 01 Jan 2026`, not `Placeholder: Enter your birth date`.
- Helper text below input. Error text replaces helper text.
- Validate on **blur**, not on every keystroke. Revalidate on change once the field has been blurred once (the "touched" pattern).
- Error message: (1) what broke, (2) why, (3) what to do. One sentence if possible.
- Associate errors with `aria-describedby`. Set `aria-invalid="true"` on the field.
- Required fields marked with `aria-required`, never with colour alone.
- Disable the submit button only when the form is in a known-invalid or in-flight state. Never on idle.

## Input field states — the exhaustive checklist

This is where the most "almost right" UIs lose. An input field with two states (default + hover) and a different border-width on focus reads as a default settings page — the geometry shifts, the eye notices, the page feels untuned. Every text input, textarea, select, and combobox must satisfy every rule below.

### The no-layout-shift rule

**Border thickness is constant across every state.** Default · hover · focus · error · disabled — the `border-width` value never changes. Layout shift on focus is a tell. State changes go to `background-color`, `outline`, or `box-shadow`, never to `border-width`.

```css
.input {
  border: 1px solid var(--color-rule-2);   /* 1px, always — every state */
  outline: 2px solid transparent;          /* reserved slot for focus ring; no shift on activate */
  outline-offset: 1px;
}
```

The outline starts transparent at 2 px so when the focus ring appears, the box geometry is already correct. No layout shift. No paint thrash.

### State-by-state recipe

| State | Treatment | Why |
| --- | --- | --- |
| **Default** | `border: 1px solid var(--color-rule-2)` · `background: var(--color-paper)` · placeholder in `var(--color-muted)` | Visible field, readable empty signal |
| **Hover** | `background: var(--color-paper-2)` (4–6 % darker than paper) · border unchanged | Subtle background shift, no border flash. Border colour changing alone is missable. |
| **Focus** | `outline: 2px solid var(--color-focus)` · `outline-offset: 1px` · border may deepen to `var(--color-ink-2)` but width stays 1 px | Outline is the focus signal; never animated; ≥ 3:1 contrast against page AND field. |
| **Active / typing** | Same as focus. Don't add a separate "typing" state. | Focus already says "active here". A second signal is noise. |
| **Filled** | Same as default — the value carries the state. Optionally a subtle ink-2 border to visually distinguish from empty. | Don't fight the user's content with a styled chrome change. |
| **Disabled** | `opacity: 0.55` · `cursor: not-allowed` · placeholder `var(--color-rule-2)` · `aria-disabled="true"` · `tabindex="-1"` | Three independent signals (opacity + cursor + colour) so no single channel carries the whole load. |
| **Error** | `border-color: var(--color-error, oklch(58% 0.20 25))` · helper-text replaced by error message · `aria-invalid="true"` · small ⚠ glyph at right edge | Border colour flip is OK *because* helper-text and aria signal it too. Never colour alone. |
| **Success** | Subtle accent-coloured border (3 % chroma above default) · small ✓ glyph · auto-clear if user re-edits | Quiet; success doesn't deserve celebration unless it was hard. |
| **Loading** (validating, async) | Inline spinner at the right edge replacing the standard glyph slot · field stays editable but submit disabled | Don't lock the user out of the field. They may want to fix what they typed. |

### Heights and rhythm

- **Input height = button height.** A page with 44 px buttons and 38 px inputs feels untuned. Pick one base height (44 px is the touch-target floor) and apply it to every text input AND every adjacent button.
- **Vertical padding = `(height − line-height-px) / 2`.** No magic numbers.
- **Right-edge slot reserved.** Every input reserves a ~24 px right-edge slot for an optional clear button, error glyph, or loading spinner. If unused, the slot sits empty — never reflow on icon appearance.

### Labels, helper, error

- **Label above** the input, 4–8 px gap. Never inline (placeholder-as-label is a tell).
- **Helper text below**, ~4 px gap. Same `font-size` as the label, lower visual weight.
- **Error replaces helper** — same position, same size, error colour. Never both at once (causes vertical jump on validation).
- **Helper has stable height.** Reserve a 1-line height even when empty, so adding an error doesn't push the page down. CSS: `min-height: 1lh` on the helper container.

### Don't, list

- Don't transition `border-width`, `padding`, or `height` on any state. Always layout-shift.
- Don't transition the focus ring's `opacity` or `transform`. Focus must be instant.
- Don't put hover effects inside `@media (hover: hover)` — wait, *do* put them inside `@media (hover: hover)` so touch users don't get stuck states.
- Don't disable the field as a way to indicate "wait, loading" — use a loading state with the field still editable.
- Don't change `cursor` on `:focus`. The pointer is already a beam; don't fight it.
- Don't use `outline: none` on focus without an explicit replacement.

### Specific control overrides

- **Textarea.** Same rules as input, plus `resize: vertical` (never `none`, never `both` on a small textarea), `min-height: 6rem` for multi-line UX.
- **Select.** Custom-styled `<select>` only if you can replicate native a11y (keyboard, screen-reader). Otherwise leave it native and style the wrapper.
- **Checkbox / radio.** Use `accent-color: var(--color-accent)` for cheap correct styling on modern browsers; only build a custom one when the design requires it. If custom: still a 1 px outline-offset focus ring.
- **Toggle / switch.** It IS a checkbox. Same a11y rules. The visual design doesn't change the contract.
- **Range / slider.** The thumb gets focus state, not the track. Thumb hit-target ≥ 44 px even if visual size is smaller (use a transparent expansion).
- **File input.** Always wrap in a styled label. Native `<input type="file">` is unstyleable; the label is the surface.
- **Combobox / search.** Listbox sits below, `aria-expanded` mirrors visibility, arrow-keys cycle, Enter selects, Escape closes — and the listbox doesn't push page content (use `position: absolute` + a parent `position: relative`).

## Modals and overlays

- Use the native `<dialog>` element. It handles focus trap, escape to close, and `::backdrop` styling for free.
- Set `inert` on the page content behind a modal so tab order doesn't leak.
- Close on: escape key, backdrop click, explicit close button.
- First focus goes to the first interactive element, not the close button.

## Dropdowns, tooltips, popovers

- Use the Popover API (`popover` attribute). It handles light-dismiss, stacking, and escape for free, and works in every modern browser.
- Position with CSS Anchor Positioning where it's available; fall back to `position: fixed` + `getBoundingClientRect()`.
- Never put a dropdown inside an `overflow: hidden` container without escape. It will clip.
- Flip when near the viewport edge.

## Undo over confirm

- For reversible actions, skip the confirm dialog. Do the thing. Show a toast with an Undo button for 5–10 seconds.
- For destructive, irreversible actions (delete account, drop table), keep the confirm — and make the user type the thing being destroyed, not just click "OK".

## Loading and empty states

- **Skeleton** screens over spinners for content that has a predictable shape (lists, cards, tables).
- **Inline spinners** for in-button state. Replace the label, don't add beside it.
- **Empty states** always have: an illustration or icon (a small one), a one-line explanation of why it's empty, an action to fix it.
- Never show a generic "No results" with no context.

## Bans

- Placeholder-as-label.
- Hover-only functionality (touch users can't hover).
- Focus rings removed without replacement.
- Confirmation dialogs for low-stakes actions.
- Touch targets < 44px.
- Custom cursors on interactive elements.
- Disabled elements with no explanation of why they're disabled.
- Colour-only error states.
- Spinners where a skeleton would show layout.

---

## Contrast discipline

Hallmark output must pass slop-test gates 46–50 before shipping. Compute contrast for every `(color, background-color)` pair on the page. The common failures Hallmark output trips on:

1. **Text on a flipped surface.** `.section--ink { background: var(--color-ink); }` flips the surface dark; nested text still inherits `color: var(--color-ink)` → ink-on-ink. Fix: any rule that sets a dark `background` must *also* set `color: var(--color-paper)` in the same rule.
2. **Button text on accent fill.** `background: var(--color-accent); color: white;` — but white is 4.5:1 against this accent only if `--color-accent` is dark enough. Use `var(--color-accent-ink)` instead, which the theme guarantees passes ≥ APCA Lc 60.
3. **Muted text on tinted paper.** `color: var(--color-muted); background: var(--color-paper-3);` — both mid-lightness, often falls below 4.5:1. Use `--color-neutral` (darker) or lift the background to `--color-paper`.
4. **Focus ring on accent-coloured button.** `outline: 2px solid var(--color-focus);` on a button whose fill is `--color-accent` — if `--color-focus = --color-accent`, the ring vanishes. Use the contrast pair: `--color-focus` set to a colour with ≥ 3:1 against both the element and the page.

### Computation

For each `(text-colour, background-colour)` pair the page actually renders:

- Run **APCA Lc** (preferred — perceptual) or **WCAG 2.1 ratio**.
- Pre-check: if both are in OKLCH with `|L_a − L_b| < 50 %`, flag for full check.
- Body text passes at **APCA Lc ≥ 60** ≈ WCAG 4.5:1.
- Large text / focus rings / icons pass at **APCA Lc ≥ 45** ≈ WCAG 3:1.

### Token contract

Every theme MUST define `--color-accent-ink` — the text colour to use whenever `--color-accent` fills a surface that carries text. The accent-ink colour is verified ≥ APCA Lc 60 against the accent at the time the theme is built. Hallmark code that uses `background: var(--color-accent)` must also set `color: var(--color-accent-ink)`. Falling back to hardcoded `color: white` is a tell — the theme's accent could be a light colour, and white-on-light is the bug.

### When the surface flips

The rule: **any rule that overrides `background-color` must also state the appropriate `color`.** Don't rely on inheritance for surface-flipping classes. Example:

```css
/* WRONG — text inherits color: var(--color-ink); section is now dark; ink-on-ink */
.section--manifesto { background: var(--color-ink); }

/* RIGHT */
.section--manifesto {
  background: var(--color-ink);
  color: var(--color-paper);
}
```

Same applies to per-theme overrides like `[data-theme="manifesto"] .vs__col:first-child { background: var(--color-ink); }` — set `color: var(--color-paper)` at the same time, OR declare the rule on a parent and let descendants inherit explicitly.
