# Spring Animations

Springs simulate physics, so they feel more natural than duration-based animations: no fixed duration, they settle by physical parameters.

## Contents
- [When to use springs](#when-to-use-springs)
- [Spring parameters](#spring-parameters)
- [Configuration presets](#configuration-presets)
- [Apple's damping and response framing](#apples-damping-and-response-framing)
- [Asymmetric spring character](#asymmetric-spring-character)
- [Interruptibility advantage](#interruptibility-advantage)
- [Spring-based mouse interactions](#spring-based-mouse-interactions)
- [Snap instead of spring](#snap-instead-of-spring)

## When to use springs

- Drag with momentum (release, let physics take over)
- Elements that feel "alive" (Apple's Dynamic Island)
- Gestures interruptible mid-animation
- Decorative mouse-tracking interactions
- Overshoot effects (playful UI)

**Don't use springs for:** simple fades, color transitions, or precise-timing UI.

## Spring parameters

| Parameter | What it controls | Typical range |
|---|---|---|
| `stiffness` | Speed of movement (higher = faster) | 100-500 |
| `damping` | Resistance (lower = more bounce) | 15-40 |
| `mass` | Weight feel (higher = slower, heavier) | 0.5-2 |

## Configuration presets

**Apple-style (recommended, easier to reason about):**

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
```

**Traditional physics (more control):**

| Preset | stiffness | damping | Use case |
|---|---|---|---|
| Snappy (Apple default) | 500 | 40 | General UI, no bounce |
| Bouncy | 300 | 20 | Playful elements, notifications |
| Gentle | 200 | 30 | Page transitions, large elements |
| Stiff | 700 | 50 | Small precise movements |

Bounce signals brand personality. Default to zero (the safe choice): a finance dashboard should never bounce; a learning app or creative tool can use subtle bounce (0.1-0.2) to feel friendlier. The question isn't "does it look better with bounce?" but "does it match the brand?"

## Apple's damping and response framing

Apple deliberately replaced the physics triplet (mass/stiffness/damping) with two designer-friendly parameters. Reason in these:

- **Damping ratio** controls overshoot. `1.0` = critically damped, no bounce, smooth settle; `< 1.0` overshoots and oscillates; lower = bouncier.
- **Response** is how quickly the value reaches the target, in seconds. Lower = snappier. This is not a duration: a spring has no fixed duration, its settle time emerges from the parameters.

Default most UI to **damping 1.0** (critically damped): graceful and non-distracting. Add bounce (**damping ~0.8**) only when the gesture itself carried momentum (a flick, a throw, a drag release). Overshoot on a menu that just faded in feels wrong; overshoot on a card you flicked feels right.

Values Apple ships:

| Interaction | Damping | Response |
|---|---|---|
| Move / reposition (e.g. PiP) | `1.0` | `0.4` |
| Rotation | `0.8` | `0.4` |
| Drawer / sheet | `0.8` | `0.3` |

**Web mapping:** Motion's `bounce` + `duration` spring API maps closely to Apple's damping + response. A safe house style is critically damped springs everywhere by default; reserve bounce for momentum-driven, physical interactions.

```js
// Critically damped default (no overshoot)
animate(el, { y: 0 }, { type: "spring", bounce: 0, duration: 0.4 });

// Momentum interaction: a little bounce, only because a flick preceded it
animate(el, { y: target }, { type: "spring", bounce: 0.2, duration: 0.4 });
```

## Asymmetric spring character

Open and close differ in **stiffness, not just duration**: when an element earns bounce, the bounce belongs to the open and the close stays critically damped. Bouncing both directions is the most common reason a well-built morph still feels cheap.

Measured on a production container morph (frame-by-frame at 60fps):

| Direction | Time to extreme | Overshoot | Fitted spring | At rest |
|---|---|---|---|---|
| Open | 284ms | 121% of travel | `stiffness: 155, damping: 11` (ζ 0.44) | 584ms |
| Close | 185ms | ~102% of travel | `stiffness: 620, damping: 36` (ζ ~0.75) | 300ms |

The close is twice as fast *and* nearly four times as stiff. Its 2% undershoot is below the perceptual threshold, so a plain `cubic-bezier(0.32, 0.72, 0, 1)` substitutes for it cleanly.

This widens the "bounce only after momentum" default above rather than replacing it. A menu that merely faded in still should not bounce. A container the user watched push outwards has enough implied mass to justify a settle, and that is the one case where the default reads as too conservative.

For measuring asymmetry off a recording rather than choosing it, `choreography.md` covers reading the two directions out of the frame timeline.

## Interruptibility advantage

Springs keep velocity when interrupted; CSS keyframes restart from zero. Ideal for gestures users might change mid-motion.

```tsx
// Spring reverses smoothly from current position
<motion.div
  animate={{ transform: isOpen ? "translateX(0)" : "translateX(-100%)" }}
  transition={{ type: "spring", stiffness: 500, damping: 40 }}
/>
```

Three rules make interruption feel seamless:

- **Animate from the presentation value, never the logical target.** On interrupt, read the element's live on-screen transform and start the new animation from there. Starting from the target value causes a visible jump. (A closing modal the user grabs again should follow the finger, not finish closing first and then reopen.) Springs do this by default; CSS transitions and keyframes cannot be grabbed and reversed mid-flight, so avoid them for gesture-driven motion.
- **Carry velocity through a retarget.** Replacing one animation with another at a reversal creates a velocity discontinuity, a "brick wall". Pick a spring library that re-targets from the current velocity (iOS does this natively with additive animations).
- **Decompose 2D motion into independent X and Y springs.** A single spring on a 2D distance desyncs when X and Y have different velocities.

## Spring-based mouse interactions

Tying values directly to mouse position feels artificial. Use `useSpring` to interpolate instead of updating immediately.

```tsx
import { useSpring } from "motion/react";

// Without spring: instant, feels artificial
const rotation = mouseX * 0.1;

// With spring: has momentum, feels natural
const springRotation = useSpring(mouseX * 0.1, {
  stiffness: 100,
  damping: 10,
});
```

Only for **decorative** interactions. On a functional graph in a banking app, no animation is better.

## Snap instead of spring

If the interaction needs instant response or precise timing, skip the spring: use a short transition or snap to the end state.

```tsx
<motion.div
  animate={{ opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -12 }}
  transition={
    shouldSnap
      ? { duration: 0.12, ease: "linear" }
      : { type: "spring", stiffness: 500, damping: 40 }
  }
/>
```
