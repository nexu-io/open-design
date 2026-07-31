---
name: "Wireframe"
description: "Claude design system prompt skill for Wireframe"
triggers:
  - "claude wireframe"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Wireframe: Explore Many Ideas Quickly

Produce low-fidelity wireframes or storyboards to explore a flow, layout, or idea before committing to hi-fi design. Use this when the user wants to "explore options," "sketch something out," or "see a few directions," or when the problem is open enough that hi-fi work would be wasted. **Wireframes are disposable** — their value is breadth of options, not the fidelity of any one.

## Phase 1: Understand the goal

Confirm: **what's being explored** (a screen, a flow, a navigation pattern, an information hierarchy, an interaction model); **the user goal** on this screen or flow; **constraints** (mobile or desktop, existing context or greenfield, non-negotiable elements); **number of variations** (3 minimum, 5–6 ceiling per round); **axis of variation** (layout? density? step count? CTA placement?).

If the user just says "wireframe a sign-up flow," propose 2–3 axes (e.g., "single-page form vs multi-step wizard vs progressive disclosure") and ask which to explore.

## Phase 2: Establish wireframe conventions

Stick to the wireframe visual language so the user reads them as wireframes, not broken hi-fi:

- **Greyscale only** — black, white, 2–3 grays; no brand color
- **System sans-serif** — no type personality; the user shouldn't form font opinions yet
- **Boxes for content areas**, labeled ("headline", "image", "feature card")
- **Striped placeholders for imagery** with monospace labels (`product shot 1200×800`) — never real images; they pull focus
- **Ipsum or skeleton copy** — no final copy at this stage
- **Annotations welcome** — numbered callouts on key decisions

This is the one context where hand-drawn-feeling SVG (rectangles, lines, simple icons) is acceptable — everything is at the same low fidelity.

## Phase 3: Sketch variations

Produce **at least 3** variations differing on the established axis. Lay single-screen variations side-by-side with the `design_canvas.jsx` starter; build flow variations as small storyboards (3–5 screens each).

Vary across layout (centered / split-screen / grid), information density, flow structure (single page / multi-step / progressive disclosure), CTA placement, or navigation pattern. Order from most by-the-book to most novel — the user picks something interesting more readily when the safe option sits next to a riskier one.

Write down each variation's distinguishing structure before sketching it. Left unspecified, variations converge on near-identical layouts — make the differences deliberate, and make at least one genuinely off-distribution.

## Phase 4: Annotate

Add 2–4 annotation points per variation, placed next to it (not in a separate doc), so the user reads the variation and its rationale together:

```
- Variation 1 (single-column wizard): simple, focused, but slow
- Variation 2 (single-page form): fastest path, heavy first impression
- Variation 3 (progressive disclosure): balances both, more JS state
```

## Phase 5: Capture decisions and hand off

After the user picks a direction, capture: the chosen variation (or hybrid), what attracted them to it, what they explicitly rejected, and any new constraints surfaced. This becomes the brief for the hi-fi follow-up.

Then suggest `make-a-prototype` (hi-fi interactive), `make-a-deck` (if the wireframe was for a presentation), or another low-fi round. Don't invest hi-fi polish in the wireframes themselves — they've served their purpose.

Summarize: variations produced, axis of variation, recommended next step, open questions surfaced.
