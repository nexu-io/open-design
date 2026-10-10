# Debugging Symptoms

Turn "this feels off" into a named cause, then make the smallest fix that addresses it. Never tweak values blindly: randomly nudging durations produces a different animation, not a better one, and destroys the ability to tell what actually helped.

## Contents
- [The loop](#the-loop)
- ["It feels slow / sluggish"](#it-feels-slow--sluggish)
- ["It feels robotic / lifeless / flat"](#it-feels-robotic--lifeless--flat)
- ["It feels cheap, but I can't say why"](#it-feels-cheap-but-i-cant-say-why)
- ["It's janky / drops frames"](#its-janky--drops-frames)
- ["It jumps / snaps / shifts"](#it-jumps--snaps--shifts)
- ["It fires when it shouldn't / flickers"](#it-fires-when-it-shouldnt--flickers)
- [When no row matches](#when-no-row-matches)

## The loop

1. **Reproduce it on the environment where it feels wrong.** A gesture that's fine on a laptop can stutter on a phone; an opacity crossfade that's fine at 120Hz looks rough at 60Hz.
2. **Slow it down.** Record and scrub frame by frame, or set the DevTools Animations panel to 10-25% playback. This is the single highest-leverage step: the flaw invisible at full speed (a late fade, a wrong origin, two states reading as separate objects) is obvious at quarter speed.
3. **Classify the symptom** with the tables below; causes are ordered by likelihood.
4. **Change one variable, re-record, compare.** Easing first, then duration: duration depends on the easing (a steep curve affords a longer duration), so tuning duration before the curve is settled is wasted work.
5. **Verify at full speed, then with fresh eyes.** An animation approved only in slow motion hasn't been approved.

## "It feels slow / sluggish"

| Check, in order | Fix |
| --- | --- |
| `ease-in` on the animation | Swap to a strong ease-out; `ease-in` starts slow, delaying the exact moment the user is watching. The same duration instantly feels faster. |
| Built-in named easing (`ease-out`, `ease-in-out`) | Replace with a custom curve; built-ins accelerate too weakly, so motion feels flat and slow at any duration. |
| Duration over ~300ms on product UI | Cut it. A 180ms dropdown feels more responsive than a 400ms one. Only a very steep curve earns a long duration. |
| Animation on a high-frequency action (keyboard nav, shortcut toggle, constant hover) | Delete the animation. At 100+ uses a day any duration reads as lag; the fix is removal, not tuning. |
| A `delay` in the chain | Remove or shrink it; delays on interactive responses read as the UI hesitating. |

## "It feels robotic / lifeless / flat"

| Check, in order | Fix |
| --- | --- |
| `linear` easing on non-constant motion | Nothing physical moves at constant speed. Ease-out for enter/exit, ease-in-out for on-screen movement. `linear` only for marquees, spinners, time-visualizing holds, and scrubbed scroll motion. |
| Curve too weak | Steepen it; when an animation feels flat, the curve is usually the problem, not the duration. |
| A duration-based ease on something that should feel alive (drag release, morphing pill) | Use a spring; fixed durations can't carry velocity or an organic settle. A weird-feeling spring is usually fixed by raising damping. |
| Uniform stagger (identical delay and distance per item) | Vary delay and distance by importance; the metronome effect is what feels mechanical. |

## "It feels cheap, but I can't say why"

| Check, in order | Fix |
| --- | --- |
| Entrance from `scale(0)` or a bare fade | Start from `scale(0.9-0.96)` plus opacity; nothing real appears from nothing, and a near-full start reads as "it was almost already there". |
| Wrong `transform-origin` | Popovers, dropdowns, and tooltips scale from their trigger, not center (use the library's origin variable: `--transform-origin` in Base UI, `--radix-popover-content-transform-origin` in Radix). Slowed playback makes a wrong origin unmistakable. |
| Crossfade shows two distinct overlapping states | Add `filter: blur(2px)` during the transition; blur bridges the gap so the eye reads one transforming object instead of two swapped ones. |
| Sub-animations on different clocks | Unify the timing family so the component reads as one entity; one slow sub-animation breaks the whole thing. |
| Enter and exit mismatched | Exit in the direction of entry, roughly 20% faster and simpler than the entrance; the user already decided, get out of the way. |
| Motion mismatched to personality | A playful app can bounce; a dashboard stays crisp. Feel can overrule the blueprint, but deliberately. |

## "It's janky / drops frames"

Work the diagnosis checklist in `performance-deep-dive.md`; the short order is: non-`transform`/`opacity` properties first, then motion coinciding with a busy main thread (move to CSS/WAAPI, or stop co-scheduling the work), then per-frame React state updates, then an inherited CSS variable driving transforms, then animated `blur()` over 20px. Only after those, `will-change: transform`.

If it janks only sometimes (on open, on the first run, during navigation, while data lands), the animation is fine and a long task is sharing the tick. Record a performance trace over the interaction and look for a task over 50ms; fix the scheduling, not the motion (see Long tasks during animation in `performance-deep-dive.md`).

## "It jumps / snaps / shifts"

| Check, in order | Fix |
| --- | --- |
| Element jumps when retriggered quickly (new toast, rapid toggle) | `@keyframes` restart from zero; they aren't interruptible. Use CSS transitions or springs, which retarget from the current state with velocity. |
| Exit animation never plays | The `AnimatePresence` child is missing a `key` (or `AnimatePresence` sits inside the conditional instead of around it). No key, no exit; check this first. |
| Height snaps instead of animating | `height: auto` isn't animatable; measure it and animate the pixel value (see the auto-height pattern in `component-patterns.md`). |
| 1px shift at animation start or end | `will-change: transform`; the browser is handing the element between CPU and GPU, which render slightly differently. |
| Content flashes to its final state before animating | The initial state arrives after first paint. Set it in CSS (or `@starting-style`) so the element is born hidden. |

## "It fires when it shouldn't / flickers"

| Check, in order | Fix |
| --- | --- |
| Hover element oscillates between states | The hover animation moves the element out from under the cursor, ending the hover, dropping it back in. Move the transform to an inner child; the parent stays put under the cursor. |
| Hover states firing on phones | Touch taps trigger phantom hovers. Gate with `@media (hover: hover) and (pointer: fine)`. |
| Every tooltip in a row animates as the cursor sweeps | Once one tooltip is open, siblings open with no delay and no animation (Base UI exposes `data-instant`; set `transition-duration: 0ms` on it). |
| Animation replays every time it scrolls into view or on back-navigation | Intro and reveal animations run once. Unobserve after firing or persist a has-played flag. |

## When no row matches

The animation may be correct and wrong anyway: built to spec but the spec is off. Re-derive the basics in order: should this animate at all (frequency)? Right easing family for the motion type? Duration matched to that easing and the element's size? If a reference exists (an app whose version feels right), record the reference and scrub both side by side; matching reality beats theorizing. When a crossfade resists all tuning, a 2px blur is the sanctioned last resort.
