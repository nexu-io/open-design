# Floating nav on scroll — the cross-fade morph

The recipe for **N10 · Floating-on-scroll morph** (see [`component-cookbook.md` § Navigation](component-cookbook.md)). One DOM, two visual modes, single class toggle, one timing curve. AI defaults botch every one of the four laws below — which is why N10 is the most demanding nav in the cookbook.

## The structure

One `<header>` with an inner wrapper. The outer owns the **default bar** visuals; the inner owns the **floating pill** visuals. As `.is-floating` toggles past a scroll threshold, each layer cross-fades its own visuals out while the other fades in.

```html
<header class="nav">
  <div class="nav__inner">
    <a class="wordmark">Hallmark</a>
    <ul class="nav__links">…</ul>
    <a class="cta">Install</a>
  </div>
</header>
```

## The four laws — non-negotiable

**1. Total nav height stays constant.** If outer height changes when state flips, every pixel below shifts vertically. Users perceive this as "the page jumped" mid-scroll. Compensate the inner's shrink with the outer's `padding-block` so the math sums to the same total in both states.

**2. Visible offset uses `transform: translateY()`, never `padding`/`margin`.** The pill should sit detached from the viewport top with breathing room. The naïve add-padding-to-outer fix breaks Law 1. `transform` doesn't affect layout — pill drops visually, box stays put.

**3. Cross-fade ownership of every shared visual.** For every property the outer carries in default (background, border, backdrop-filter, box-shadow), explicitly neutralise it in `.is-floating` *and* put it in the transition list. Forgetting one — say a stale `backdrop-filter: blur(14px)` on the outer in floating mode — yields an invisible blurred strip dragging across the viewport behind nothing.

**4. Single timing curve across every property.** Eight properties on eight curves reads as eight animations. Same eight on `var(--dur-mid)` + `var(--ease-out)` reads as one motion. Use `cubic-bezier(0.16, 1, 0.3, 1)` (exponential ease-out) and ~520 ms.

## The property morph (10 properties, one curve)

| Element | Property | Default | Floating |
|---|---|---|---|
| `.nav` | `padding-block` | `0` | `var(--space-2xs)` |
| `.nav` | `background-color` | dark/0.62 | `transparent` |
| `.nav` | `border-block-end-color` | rule | `transparent` |
| `.nav` | `backdrop-filter` | `saturate(1.4) blur(14px)` | `blur(0)` |
| `.nav__inner` | `max-width` | `var(--page-max)` | `~58rem` |
| `.nav__inner` | `min-height` | `60px` | `52px` |
| `.nav__inner` | `padding-block` | `12px` | `4px` |
| `.nav__inner` | `border-radius` | `0` | `var(--radius-pill, 999px)` |
| `.nav__inner` | `background-color` | `transparent` | dark/0.82 |
| `.nav__inner` | `backdrop-filter` | `blur(0)` | `blur(18px)` |
| `.nav__inner` | `box-shadow` | `none` | drop + tinted glow + inset hairline |
| `.nav__inner` | `transform` | `translateY(0)` | `translateY(12px)` |

Use `blur(0)` not `none` — `none` snaps, `blur(0)` transitions. `backdrop-filter` transitions are 2024+ baseline (Chrome 107+, Safari 14+, Firefox 103+).

## The scroll handler

```js
(() => {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const THRESHOLD = 80;          // ≥ 60 px to avoid micro-scroll twitches
  let floating = false;
  let ticking = false;
  const update = () => {
    const next = window.scrollY > THRESHOLD;
    if (next !== floating) {     // boolean-flip guard — toggle once per state change
      floating = next;
      nav.classList.toggle("is-floating", floating);
    }
  };
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });          // mobile scroll-perf — keep main thread free
  update();
})();
```

Three discipline points:
- **`passive: true`** — listener won't `preventDefault`, browser keeps main thread free for scrolling.
- **`requestAnimationFrame` throttle** — caps to 60 calls/s, aligns with paint.
- **Boolean-flip guard** — class operation runs once per state change, not once per scroll event.

## Anti-patterns Hallmark refuses

1. Two separate `<header>` elements that swap via opacity. Doubles DOM, fights focus order, can desync content.
2. Animating `top` / `margin-top` to add the floating offset. Triggers layout. `transform` is the only correct lever.
3. Using `backdrop-filter: none` in the floating state. Snaps. Use `blur(0)` so it transitions.
4. Letting nav height change between states. Causes content jitter — the single most damaging mistake in this pattern.
5. Different transition durations per property ("speed up the radius", "delay the shadow"). Reads as broken even though everything moves. One curve.
6. `scroll` event without `{ passive: true }` or without rAF throttling. Both kill mobile scroll perf.
7. Threshold = 0 (morph fires at the slightest scroll). Too jumpy. Use ≥ 60 px.
8. Forgetting the boolean-flip guard — toggling the class on every scroll event causes layout thrash.

The pattern works because it's restrained — one orchestrated morph, no embellishment. Pour the polish into the timing curve, the shadow stack, and the height-constant math; not into "more."
