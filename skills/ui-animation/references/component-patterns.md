# Component Animation Patterns

Popovers, dropdowns, tooltips, drawers, and modals live with their recipes in `transition-recipes.md`.

## Contents
- [Buttons](#buttons)
- [Toasts](#toasts)
- [Crossfade transitions](#crossfade-transitions)
- [Lists and stagger](#lists-and-stagger)
- [Hover effects](#hover-effects)
- [Step form navigation](#step-form-navigation)
- [Layout morphs and auto height (Motion)](#layout-morphs-and-auto-height-motion)
- [3D transforms](#3d-transforms)

## Buttons

Add `transform: scale(0.97)` on `:active` for instant press feedback. Press is 0ms; release may ease. `touch-action: manipulation` on the control drops the double-tap-zoom delay. Do not put it on `html`, a map, or a pinch-zoom lightbox.

```css
.button {
  touch-action: manipulation;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.button:active {
  transform: scale(0.97);
  transition-duration: 0s;
}
```

`scale(0.9)` is too aggressive: the button visibly collapses, drawing the eye to the shrinking rather than the action. Press feedback should be felt, not seen; stay in the `0.96-0.98` range.

Mask imperfect crossfade between button states with blur:

```css
.button-content.transitioning {
  filter: blur(2px);
  opacity: 0.7;
}
```

Blur under 20px; heavy blur is expensive, especially in Safari.

## Toasts

Enter and exit from the same direction for spatial consistency (makes swipe-to-dismiss intuitive).

```css
.toast {
  transform: translate3d(0, 6px, 0);
  opacity: 0;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
              opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.toast[data-open="true"] {
  transform: translate3d(0, 0, 0);
  opacity: 1;
}
```

Use CSS transitions (not keyframes) for toasts: added rapidly, and keyframes restart on interruption while transitions retarget smoothly.

## Crossfade transitions

When the container is small or outgoing/incoming content are structurally similar, a full directional slide adds too much visual weight; use a crossfade with a subtle directional hint instead.

```css
.view-enter {
  opacity: 0;
  transform: translateY(8px);
  filter: blur(4px);
  transition: opacity 150ms ease-out, transform 150ms ease-out, filter 150ms ease-out;
}
.view-enter-active {
  opacity: 1;
  transform: translateY(0);
  filter: blur(0);
}
```

Crossfade candidates: nav content swaps, tab panels with similar structure, small card state changes. The 8px shift signals "the view changed" without the visual weight of content traveling across the screen.

## Lists and stagger

Keep stagger delays short (30-50ms per item); total under 300ms.

```css
.item {
  opacity: 0;
  transform: translateY(8px);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
              opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.list[data-open="true"] .item {
  opacity: 1;
  transform: translateY(0);
}
.list[data-open="true"] .item:nth-child(2) { transition-delay: 50ms; }
.list[data-open="true"] .item:nth-child(3) { transition-delay: 100ms; }
.list[data-open="true"] .item:nth-child(4) { transition-delay: 150ms; }
```

```tsx
const listVariants = {
  show: { transition: { staggerChildren: 0.05 } },
};
```

Never block interaction while stagger animations are playing.

When removing items, use `AnimatePresence mode="popLayout"` so the exiting element is pulled out of document flow immediately and siblings start reflowing in parallel with the exit. The default mode waits for exit to finish before siblings move, causing sequential rather than parallel motion.

```tsx
<AnimatePresence mode="popLayout">
  {items.map((item) => (
    <motion.div
      key={item.id}
      layout
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
    />
  ))}
</AnimatePresence>
```

## Hover effects

Gate hover animations behind a media query to avoid false positives on touch. Tailwind `hover:` is not gated unless the project set `hoverOnlyWhenSupported` or a custom variant.

```css
@media (hover: hover) and (pointer: fine) {
  .link {
    transition: color 200ms ease, opacity 200ms ease;
  }
  .link:hover {
    opacity: 0.8;
  }
}
```

Fix hover flicker: apply hover on the parent, animate the child. `translateY` on the target itself moves the element out from under the cursor at the bottom edge, ending the hover and looping infinitely.

```css
.box:hover .box-inner {
  transform: translateY(-20%);
}
.box-inner {
  transition: transform 150ms ease;
}
```

For scale-based hover, use `scale(1.01)` to `scale(1.02)`; `scale(1.05)` is visibly inflated. Transform hovers run 100-150ms, faster than the 200ms colour/opacity hover above: the user's eye is already on the element, so movement past 150ms reads as lag.

```css
@media (hover: hover) and (pointer: fine) {
  .card {
    transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .card:hover {
    transform: scale(1.015);
  }
}
```

## Step form navigation

Forward steps slide content left (like reading); backward steps slide content right (like undoing). Animating both directions the same way breaks the user's mental model of forward vs backward progress.

```tsx
const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -100 : 100,
    opacity: 0,
  }),
};

<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={step}
    custom={direction}
    variants={variants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
  />
</AnimatePresence>
```

## Layout morphs and auto height (Motion)

The `layout` and `layoutId` props cover what CSS can't animate, and each carries a gotcha that presents as a visual bug:

- **`layout`** animates any layout change, including CSS-unanimatable properties like `flex-direction`. Change the element's *actual styles* (className or inline), not the `animate` prop; Motion measures before and after and interpolates. Add `layout` to neighbouring elements too, or they jump while the animating one glides.
- **`layoutId`** morphs one element into another across mount/unmount: tab indicators, card-to-detail expansions, a button becoming a popover. You can't steer *how* a shared-layout morph moves; to add motion on top, animate the **parent** and let the children follow.
- **Border radius distorts during layout animation** because the morph is transform-based scaling. Motion corrects the radius only when it's an inline pixel value: always `style={{ borderRadius: 12 }}`, never a className or `rem` radius, on anything with `layout`/`layoutId`.
- **No `key`, no exit.** An `AnimatePresence` child without a `key` never unmounts, so the exit animation silently never fires (and `AnimatePresence` must wrap the conditional, not sit inside it). When an exit does nothing, check the key first.
- **Exiting elements have stale props.** An `AnimatePresence` child that is animating out has already left the tree, so it can't see new state. Pass `custom` to both `AnimatePresence` and the `motion` element (as in the step-form pattern above), or direction-aware exits always leave the same way.

**Auto height:** Motion can't animate `auto` to `auto`. Measure the content and animate to the pixel value:

```jsx
import useMeasure from "react-use-measure";

const [ref, bounds] = useMeasure();

<motion.div animate={{ height: bounds.height ? bounds.height : null }}>
  <div ref={ref} className="inner">{content}</div>  {/* padding lives here */}
</motion.div>
```

The `ref` and the animated height must be on *different* elements; on the same one, the element freezes at its animated height and stops reacting to content changes. Put the padding on the inner element so the measurement includes it, and fall back to `null` (meaning `auto`) while `bounds.height` is `0` on first render to avoid a layout shift. `useMeasure` wraps `ResizeObserver`; hand-rolling it is a few lines if the dependency isn't wanted.

When the same surface swaps content at different sizes, make the crossfade duration proportional to how much the height changed, so small changes don't over-animate:

```js
const MIN = 0.15, MAX = 0.27;
const delta = Math.abs(bounds.height - previousHeightRef.current);
const duration = Math.min(Math.max(delta / 500, MIN), MAX);
```

## 3D transforms

For depth effects (card flips, coin spins, orbits), use `rotateX()`/`rotateY()` with `transform-style: preserve-3d` on the wrapper: stays on the GPU, needs no JavaScript. Reserve it for illustrative or delight moments, not high-frequency UI.

```css
.flip {
  transform-style: preserve-3d;
  transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
}
.flip[data-flipped="true"] {
  transform: rotateY(180deg);
}
.flip .front,
.flip .back {
  backface-visibility: hidden;
}
.flip .back {
  transform: rotateY(180deg);
}
```

Set `perspective` on the parent (e.g. `perspective: 1000px`) to control depth intensity; smaller values exaggerate the effect. As with SVG, set `transform-box: fill-box; transform-origin: center` if the rotation pivots around the wrong point.
