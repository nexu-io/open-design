# Animation Review Format

## Contents
- [Operating posture](#operating-posture)
- [Ten non-negotiable standards](#ten-non-negotiable-standards)
- [Remedial preference hierarchy](#remedial-preference-hierarchy)
- [Before/After/Why table](#beforeafterwhy-table)
- [Review checklist](#review-checklist)
- [Verdict output](#verdict-output)

## Operating posture

Senior motion reviewer with a brutal eye for craft. Bias toward motion that feels right, not motion that merely runs. A transition that works but feels sluggish, lands from the wrong origin, fires too often, or drops frames is a regression, not a pass. Default to flagging; approval is earned, not assumed.

## Ten non-negotiable standards

Measure every animation in the diff against these; a violation is a finding. For exact values (curves, durations, spring config), cite the easing/duration tables in `SKILL.md` rather than approximating. Each standard ends with a **Flag on sight** clause: hard findings to catch without deliberation.

1. **Justified motion.** Every animation answers "why animate this?": feedback, orientation, continuity, state, or deliberate delight. "Looks cool" on a frequently-seen element is a block.
2. **Frequency-appropriate.** Keyboard focus and repeated actions must respond immediately. Flag motion that delays task completion or creates distracting repeated travel; a brief nonblocking transition is not automatically a defect.
3. **Responsive easing.** Entering/exiting elements use `ease-out` or a strong custom curve; built-in CSS easings are too weak for deliberate animation. Flag on sight: `ease-in` on any UI interaction, or weak built-in easing on a deliberate animation (it delays the moment the user watches most).
4. **Sub-300ms UI.** UI animations stay under 300ms; scale duration with distance traveled. Flag on sight: UI duration > 300ms with no stated reason.
5. **Origin and physical correctness.** Popovers, dropdowns, and tooltips scale from their trigger (`transform-origin`), not center; modals stay centered. Flag on sight: `transform-origin: center` on a trigger-anchored popover/dropdown/tooltip, or `scale(0)`/pure-fade entrances with no initial transform (start at `scale(0.9-0.96)` plus opacity).
6. **Interruptibility.** Rapidly-triggered or gesture-driven motion (toasts, toggles, drags) must retarget from its current state; prefer CSS transitions or springs over keyframes, which restart from zero. Flag on sight: keyframes on toasts, toggles, or anything added/triggered rapidly.
7. **GPU-only properties.** Animate `transform` and `opacity` only. Flag on sight: animating `width`/`height`/`margin`/`padding`/`top`/`left`; `transition: all` (unbounded property animation); Framer Motion `x`/`y`/`scale` props on motion that runs while the page is busy; updating a CSS variable on a parent to drive a child transform (style recalc storm).
8. **Accessibility.** Inspect generated hover gating, including Tailwind v4's built-in media query. Exercise reduced-motion behavior and the same keyboard/touch task. Flag spatial motion without an appropriate reduced-motion alternative.
9. **Asymmetric enter/exit.** The press itself is instant (`:active` at 0ms); what runs slower is a deliberate phase the user commits to, such as a hold-to-confirm fill or a destructive confirm, while the system's response and the release snap. Occasional surfaces enter slightly slower than they exit; high-frequency ephemeral UI enters at 0ms and fades out briefly (SKILL.md Core rules). Flag on sight: any delay on the press, or symmetric timing on a hold or release interaction.
10. **Cohesion.** Motion matches the component's personality and the rest of the product: playful can be bouncier, a dashboard stays crisp. When unsure whether motion feels right, the strongest move is often to delete it. Flag on sight: mismatched personality, a jarring crossfade where a subtle blur would bridge two states, or an everything-at-once entrance where a 30-50ms stagger belongs.

## Remedial preference hierarchy

Prefer earlier moves over later ones:

1. **Delete the animation** (disruptively repeated or without a purpose).
2. **Reduce it**: shorter duration, smaller transform, fewer animated properties.
3. **Fix the easing**: swap `ease-in` to `ease-out` or a strong custom curve.
4. **Fix the origin and physicality**: correct `transform-origin`; replace `scale(0)` with `scale(0.95)` plus opacity.
5. **Make it interruptible**: keyframes to transitions, or a spring for gesture-driven motion.
6. **Move it to the GPU**: layout props to `transform`/`opacity`; shorthand to a full `transform` string; WAAPI for programmatic CSS.
7. **Asymmetric timing**: slow the deliberate phase, snap the response.
8. **Polish**: blur to mask crossfades, stagger for groups, `@starting-style` for entry, spring for "alive" elements.
9. **Accessibility and cohesion**: add hover gating; tune to match the component's personality.

## Before/After/Why table

Required first part of every review. Markdown table, one row per issue; never a "Before:/After:" list on separate lines.

| Before | After | Why |
|---|---|---|
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties; `all` animates unintended properties off-GPU |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing in the real world appears from nothing |
| `ease-in` on dropdown | `ease-out` with custom curve | `ease-in` feels sluggish; `ease-out` gives instant feedback |
| No `:active` state on button | `transform: scale(0.97)` on `:active` with `transition-duration: 0s` | Buttons must feel responsive to press |
| `transform-origin: center` on popover | `transform-origin: var(--transform-origin)` | Popovers scale from trigger (modals stay centered) |

## Review checklist

Rows add recipe-specific signal beyond the ten standards; for the standard violations (`transition: all`, layout props, `ease-in`, `scale(0)`, hover guard, symmetric timing, keyboard action, >300ms, rapid-fire keyframes) see the Flag-on-sight clauses above.

| Issue | Fix |
|---|---|
| CSS variable drag animation | Use `transform` directly on the element |
| Missing `setPointerCapture` on drag | Add pointer capture for reliable tracking |
| Motion `x`/`y` mixed with a handwritten `transform` | Pick one transform owner |
| Hard cut between views sharing elements | Add shared-element transition; animate persistent components in place |
| Contextual overlay enters from centre | Set `transform-origin` to trigger; animate outward from source |
| Elements all appear at once | Add stagger delay (30-50ms between items) |
| Touch target under 44px on interactive element | Add `::before` pseudo-element sized to 44x44px minimum (WCAG 2.5.5) |
| Hover scale > 1.03, or a transform hover slower than 150ms | Use `scale(1.01-1.02)` and 100-150ms transition (colour-only hover keeps 200ms) |
| Container animates AND children stagger | Pick one entrance: animate the container OR stagger children, not both |
| Missing close-state cleanup after `setTimeout` | Add `is-closing` class, remove after transition duration |
| Missing reflow (`void el.offsetWidth`) between class changes | Force reflow before re-adding classes to restart transitions |
| Animating container instead of inner pieces | Apply transitions to child elements, not the wrapper |
| Same bouncy spring on open and close | Bounce the open only; damp the close and roughly halve its duration |
| Value snapped to its detent during the drag | Follow the pointer continuously; snap the projected landing point on release |
| CSS carousel scrolls the page | `touch-action: pan-x` and `overscroll-behavior-x: contain`; leave JS libraries on `pan-y` |
| Hardcoded `stroke-dasharray` on SVG success path | Use `path.getTotalLength()` to measure the path |
| `.is-error` and `.is-shaking` merged into one class | Keep them separate: `.is-shaking` controls animation only, `.is-error` controls visual state |

## Verdict output

Required second part of every review. Group remaining commentary by impact tier, highest first; omit empty tiers.

1. **Feel-breaking regressions**: sluggish easing, comes-from-nowhere entrances, motion on high-frequency or keyboard actions.
2. **Missed simplifications**: animations to remove or drastically reduce.
3. **Performance**: non-GPU properties, dropped-frame risks, recalc storms.
4. **Interruptibility and timing**: keyframes where transitions/springs belong; symmetric timing that should be asymmetric.
5. **Origin, physicality, and cohesion**: wrong origin, mismatched personality, jarring crossfades.
6. **Accessibility**: pointer/hover gating.

Close with a decision, citing `file:line`:

- **Block**: any feel-breaking regression, motion that delays keyboard or repeated actions, `scale(0)` or `ease-in` on UI, or a non-GPU animation with an easy GPU fix.
- **Approve**: no feel-breaking regressions, no obvious motion that should be deleted, durations and easing within bounds, interruptibility handled where needed.

When this review joins a `ui-design` audit's ship verdict, that skill's `references/ship-readiness.md` maps Block items to a tier; motion never blocks a release on its own.

Reusable-component library DX (defaults over options, drop-in ergonomics, naming, docs site) is authoring, not review; see the `ui-design` skill.

For debugging animations (slow-motion, DevTools Animations panel, real-device testing, reduced-motion checks), see the Validation section in `SKILL.md`.
