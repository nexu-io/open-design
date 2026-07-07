---
name: "Make A Prototype"
description: "Claude design system prompt skill for Make A Prototype"
triggers:
  - "claude make a prototype"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Make a Prototype: Interactive Clickable Prototype

Build a working interactive prototype — clickable, navigable, with real state and feedback. Use this when the user asks for a prototype, mockup, demo, or "make it interactive." **Prototypes interact** — static screenshots strung together with `<a>` tags don't count; the point is to test the flow with real clicking, typing, validating, succeeding, failing.

## Phase 1: Discovery

Confirm before building: **the flow** (screens, entry point, goal state — map it as a list); **fidelity** (hi-fi or mid-fi); **device frame** (desktop browser, iOS, Android, macOS window); **variations** (one flow or several to compare); **brand / design system** (always confirm — if none, invoke `frontend-aesthetic-direction` first); **sample data** (real-looking content, no Lorem ipsum).

## Phase 2: Map screens and state

Write the flow down before building, and drop it into the file as a comment block so the user can see the plan:

```
Screens:
  1. Welcome — "Get started" CTA → 2
  2. Email entry — validate format → 3 on valid, inline error on invalid
  3. Profile — name, photo upload → 4
  4. Success — "You're in" → 1 (loop demo)

State:
  - currentScreen: 1
  - email: ""
  - emailError: null
```

## Phase 3: Build screen-by-screen

For each screen: mount it in the DOM (display toggling or React state within a single page); hi-fi visuals matching the design system — real components, not generic boxes; plausible real content (actual names, product copy, numbers); one primary CTA per screen, secondary actions smaller and de-emphasized.

Initialize an appropriate device frame (iOS, Android, macOS, or Browser). The frame stays fixed; the prototype lives inside it.

## Phase 4: Wire up interactions

Every interaction wired, not just the happy path:

- **Navigation.** Primary CTAs advance, back moves backward, state persists across screens.
- **Form validation.** Empty submit → inline error; bad format → specific field-tied error; valid → proceed.
- **Loading states.** Async actions show a loading indicator and disable the button against double-submit. Fake the latency with `setTimeout` — don't skip the loading state because the work is fake; it's part of what's being tested.
- **Success and error feedback.** Toast, inline confirmation, or page transition; errors clear and tied to their field or action.
- **State changes.** Toggling, selecting, filtering all update the UI immediately.

## Phase 5: Sub-state and persistence

Make meaningful sub-state reactive: selection state, filter/sort state, modal/dropdown open-state (focus moves into the modal, Escape closes it), form values and errors.

Persist what matters across reload via `localStorage`: current screen, form drafts, tweak values (see `make-tweakable`). Refreshing mid-iteration is one of the most common user actions — state that doesn't survive makes the prototype feel broken.

## Phase 6: Verify

Walk the full flow in the preview: every CTA leads somewhere, every form validates, every error is clear and recoverable, every async action shows feedback, every state change is visible, keyboard navigation works (Tab through, Enter to submit, Escape to close), focus is visible. If you can't verify a behavior, say so in the summary rather than claiming success.

## Phase 7: Variations (if requested)

Expose variations as tweaks in a floating panel (`make-tweakable`), side-by-side on a canvas (`design_canvas.jsx` starter), or in-prototype toggles. **Don't scatter v1.html / v2.html / v3.html across the project — one file, many variants.**

Summarize briefly: what flows work, what's faked (e.g., "submit calls a setTimeout fake"), what's open for the user to decide.
