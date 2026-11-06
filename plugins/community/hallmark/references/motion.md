# Motion

Most AI-generated motion is scattered — hover lifts on every card, fade-in on every scroll, bouncing icons. Quiet it. One orchestrated moment beats ten small ones.

> For per-interaction recipes (button press, focus, modal, toast, optimistic update, command palette, drag handle, etc.), see [`microinteractions.md`](microinteractions.md). This file is the *language* of motion; that file is the *vocabulary*.

## Principles

- **Animate only `transform` and `opacity`.** These are GPU-composited; they don't trigger layout. Anything else is a performance bug waiting.
- **Duration is three buckets.** Micro (100–150ms), minor (200–300ms), major (300–500ms). Exits are ~75% of the enter.
- **Easing is exponential ease-out.** Elements coming in slow down into place. Elements leaving accelerate away.
- **Motion serves perception.** If you can't explain what a transition communicates, cut it.
- **Reduced motion is non-optional.** `@media (prefers-reduced-motion: reduce)` collapses all spatial motion to opacity crossfade.

## Easings

Use these three. Name them as tokens.

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);        /* elements entering */
  --ease-in:  cubic-bezier(0.7,  0, 0.84, 0);       /* elements leaving  */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* state toggles     */
}
```

`ease`, `ease-in-out` (default), `cubic-bezier(0.25, 0.1, 0.25, 1)` — these are the browser defaults and they read as uncrafted.

## Durations

```css
:root {
  --dur-micro: 120ms;   /* button press, toggle tick, color shift  */
  --dur-short: 220ms;   /* hover lift, tooltip, menu open          */
  --dur-long:  420ms;   /* modal, drawer, accordion, page reveal   */
}
```

Exits use roughly 75% of the enter:

```css
.menu.is-open  { transition: transform var(--dur-short) var(--ease-out); }
.menu.is-close { transition: transform calc(var(--dur-short) * 0.75) var(--ease-in); }
```

## Page-load orchestration

One sequence on page load. Stagger by DOM index using a CSS custom property, not by JS.

```html
<section style="--i: 0">…</section>
<section style="--i: 1">…</section>
<section style="--i: 2">…</section>
```

```css
.reveal {
  opacity: 0;
  transform: translateY(8px);
  animation: reveal var(--dur-long) var(--ease-out) forwards;
  animation-delay: calc(var(--i, 0) * 60ms);
}
@keyframes reveal {
  to { opacity: 1; transform: none; }
}
```

Cap total stagger at ~500ms. Beyond that the page feels slow to settle.

## Scroll-linked motion

- Use IntersectionObserver, **never** `scroll` event listeners.
- Use it only for *reveal once* effects. No parallax. No scroll-scrubbed animations unless there is a specific reason.
- Every scroll-triggered motion must have a reduced-motion fallback.

## State transitions

- Button hover / active: micro duration, `--ease-out`, `transform: translateY(-1px)` on hover, `translateY(0)` on active. Never a `box-shadow` transition on hover on a dark background (glow effect).
- Menu / tooltip / dropdown: short duration, `--ease-out` on open, `--ease-in` on close. Use the popover API or `inert` to manage focus.
- Modal: long duration, scale-in (0.96 → 1) + opacity crossfade. Backdrop fades in at the same duration.
- Accordion: animate `grid-template-rows: 0fr` → `grid-template-rows: 1fr` (not `height`). With `--ease-in-out`.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 150ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 150ms !important;
  }
  .reveal { animation: reveal-reduced 150ms linear forwards; }
  @keyframes reveal-reduced { to { opacity: 1; transform: none; } }
}
```

Functional motion (progress bars, loading spinners, skeletons) still runs — just slower.

## Bans

- `ease` (browser default, mediocre).
- `linear` on anything except progress bars and ticking loaders.
- Bounce / elastic / overshoot on UI elements. Dated; signals "template".
- Animating `width`, `height`, `top`, `left`, `margin`, `padding`.
- `will-change` set preemptively across a whole class. Only on the element, only while it's animating.
- Parallax.
- Custom cursors.
- Scroll-driven animations without a reduced-motion fallback.
- Infinite loops (other than functional loaders) — they pull the eye and never let go.
