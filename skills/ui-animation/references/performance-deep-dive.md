# Performance Deep Dive

Advanced performance guidance beyond the quick rules in SKILL.md.

## Contents
- [Property cost tiers](#property-cost-tiers)
- [CSS vs JS animations](#css-vs-js-animations)
- [Long tasks during animation](#long-tasks-during-animation)
- [Web Animations API (WAAPI)](#web-animations-api-waapi)
- [CSS variables inheritance trap](#css-variables-inheritance-trap)
- [Motion transform ownership](#motion-transform-ownership)
- [Pause looping animations off-screen](#pause-looping-animations-off-screen)
- [Compositing layers and will-change](#compositing-layers-and-will-change)
- [Fix shaky 1px shifts](#fix-shaky-1px-shifts)

## Property cost tiers

Every animatable property enters the browser's Layout, Paint, Composite pipeline at one of three points, and the cost differs by an order of magnitude:

| Tier | Properties | Cost |
|---|---|---|
| Composite only | `transform`, `opacity` (plus `filter`, `clip-path`, `background-color` in current Chrome/Firefox) | Cheapest; the browser promotes these to their own layer |
| Paint + Composite | `box-shadow`, `border-radius`, `color` | No re-measuring, but an expensive redraw every frame |
| Layout + Paint + Composite | `width`, `height`, `padding`, `margin`, `top`, `left`, `border-width` | Most expensive; layout recalculates every frame |

The paint tier is the one people miss because it doesn't look like layout. Swap down a tier:

| Instead of animating | Animate |
|---|---|
| `width`/`height`/`padding` to grow or shrink | `scale()` |
| `margin`/`top`/`left` to move | `translate()` (percentages are relative to the element's own size) |
| `box-shadow` | `filter: drop-shadow(...)` |
| `border-radius` | `clip-path: inset(0 round 50px)` |

A layout property may not visibly drop frames on an element with `position: absolute` or few children, but the `scale()` version looks identical and cannot regress on a slower device; take the one with no downside.

## CSS vs JS animations

| Approach | Driver | Interruptible | Best for |
|---|---|---|---|
| CSS transitions | Browser/compositor for transform/opacity | Yes (retargets) | Predetermined state changes |
| CSS keyframes | Browser/compositor when properties allow it | No (restarts from zero) | Looping, predetermined sequences |
| WAAPI (`el.animate()`) | Browser animation engine | Yes (cancel/reverse) | Dynamic values with imperative control |
| Motion values (`x`, `y`, `style`) | Motion DOM renderer, no React re-renders | Yes | React gestures, drag, coordinated UI |
| JS (`requestAnimationFrame`) | Main thread | Yes (manual) | Complex choreography, physics |

**Rule: CSS transitions > WAAPI > CSS keyframes > JS.** Under load (page navigation, heavy rendering), CSS stays smooth while JS drops frames.

## Long tasks during animation

The rule above holds because `transform` and `opacity` animate on the compositor thread, which keeps running while the main thread is blocked. Everything else shares one thread: style recalculation, layout, paint, and every line of JS including `requestAnimationFrame` callbacks and Motion's `x`/`y`. That thread is also the one your application code runs on. The budget there is roughly 10ms of the 16.6ms frame at 60Hz, and half that at 120Hz. A task over 50ms is a long task: any concurrent main-thread animation visibly stutters and input goes unanswered for its duration.

So when motion janks *only sometimes* (on open, on first run, during navigation, while data lands), suspect the work sharing the tick, not the animation code. Moving to CSS/WAAPI is the fix when the animation can be expressed that way; when it can't (drag, springs, physics, choreography), fix the scheduling instead.

**1. Don't co-schedule.** Starting an animation and expensive work in the same tick makes the entrance pay for the work: a modal that mounts a large tree, a drawer that parses its contents, a tab that fetches on click. Start the motion, let a frame land, then do the work, or defer the work to `transitionend`/`onAnimationComplete` so it runs after the motion finishes.

**2. Chunk what can't be deferred,** against a time budget rather than a fixed item count, so the cost tracks the device instead of your laptop:

```ts
const yieldToBrowser = (): Promise<unknown> =>
  typeof scheduler !== "undefined" && "yield" in scheduler
    ? scheduler.yield()
    : new Promise((resolve) => setTimeout(resolve, 0));

async function inChunks<T>(items: T[], work: (item: T) => void) {
  let start = performance.now();
  for (const item of items) {
    work(item);
    if (performance.now() - start > 5) {   // leave the rest of the frame to the animation
      await yieldToBrowser();
      start = performance.now();
    }
  }
}
```

`scheduler.yield()` resumes ahead of other pending tasks rather than behind them, but it is Chromium-only today, hence the `setTimeout` fallback. Use `await new Promise(requestAnimationFrame)` instead when the chunked work feeds the animation itself and must resume in step with frames.

Yielding does not make the work faster; the total is unchanged. It lets frames paint and input dispatch between the pieces, which is the entire perceived difference. If the work genuinely cannot be split (one large parse, one synchronous layout of a huge tree), it belongs in a worker or on the server; no amount of animation tuning hides it.

## Web Animations API (WAAPI)

JavaScript control with CSS performance. Hardware-accelerated, interruptible, promise-based.

```ts
const animation = element.animate(
  [
    { transform: "translateY(100%)", opacity: 0 },
    { transform: "translateY(0)", opacity: 1 },
  ],
  {
    duration: 300,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    fill: "forwards",
  }
);

// Cancel or reverse at any time
animation.reverse();
await animation.finished;
```

## CSS variables inheritance trap

A CSS variable change on a parent recalculates styles for **all children**. In a drawer with many items, updating `--swipe-amount` on the container forces expensive recalc on every one.

```ts
// Bad: triggers recalc on all children
element.style.setProperty("--swipe-amount", `${distance}px`);

// Good: only affects this element
element.style.transform = `translateY(${distance}px)`;
```

Exception: `@property` with `inherits: false` avoids the cascade, but has limited browser support.

## Motion transform ownership

Motion's `x`/`y` are first-class APIs for single-axis movement and drag: they update without React re-renders and are the default for gesture-heavy components.

```tsx
const x = useMotionValue(0);

// Idiomatic Motion API for drag and axis movement
<motion.div drag="x" style={{ x }} />

// Use one handwritten transform string when you need to author
// multiple transform functions together or interop with non-Motion code
<motion.div animate={{ transform: "translateX(100px) rotate(4deg)" }} />
```

Don't mix Motion `x`/`y` props with a handwritten `transform` string on one element; pick one transform owner.

One more reason to reach for the string form: the individual shorthands (`x`, `y`, `scale`, `rotate`) are implemented with CSS variables and driven from `requestAnimationFrame`, so they are not hardware-accelerated. That's harmless normally, but motion that runs *while* the main thread is busy (page navigation, tab switches during data loading, hydration) drops frames exactly then. Vercel's dashboard hit this with a shared-layout tab highlight that janked during navigation; the fix was moving it to CSS. When an animation must survive a busy main thread, animate the full `transform` string, or move it to CSS/WAAPI.

## Pause looping animations off-screen

Looping animations consume GPU resources even when not visible.

```ts
"use client";
import { useEffect, useRef } from "react";

export function usePauseOffscreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      el.style.animationPlayState = entry.isIntersecting ? "running" : "paused";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
```

## Compositing layers and will-change

`will-change` creates a new compositor layer, at a memory cost.

- Only promote during animation, remove after
- Only for `transform` and `opacity`
- Too many layers is worse than no promotion

```css
.animating { will-change: transform, opacity; }
```

Toggle the class on animation start, remove on `transitionend` or `animationend`.

## Fix shaky 1px shifts

Elements can shift 1px at animation start/end from GPU/CPU handoff. Apply `will-change: transform` during the animation (not permanently) to keep compositing on the GPU throughout.
