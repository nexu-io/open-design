# SVG Animation

Recipes for animating vector art: line drawing, rotation, path morphing, shakes, and ambient life. SVG has its own coordinate system and its own transform-origin rules, so HTML habits produce wrong results here.

## Contents
- [Fundamentals](#fundamentals)
- [Line drawing (self-drawing stroke)](#line-drawing-self-drawing-stroke)
- [Rotation and transform-origin (the SVG trap)](#rotation-and-transform-origin-the-svg-trap)
- [Path morphing](#path-morphing)
- [Shakes and multi-step motion](#shakes-and-multi-step-motion)
- [Ambient life](#ambient-life)
- [Performance for busy SVG scenes](#performance-for-busy-svg-scenes)

## Fundamentals

- SVG is coordinate-based with no document flow; unpositioned elements stack at `(0,0)`.
- `viewBox="minX minY width height"` is the camera: it enables responsive scaling and keeps animation values consistent at any display size.
- Path commands: `M` move (no draw), `L` line, `Z` close; uppercase is absolute, lowercase relative. Close paths with `Z` or the point where start meets end shows an awkward corner.
- Degenerate shapes don't render at all: `width="0"`, `r="0"`, or a line whose start equals its end vanish entirely (unlike `opacity: 0`, where the shape still exists).
- Put `overflow: visible` on the `<svg>` so overshoot and scale don't clip. Nest `<g>` groups to layer independent transforms on one element.

## Line drawing (self-drawing stroke)

Reveal a stroke as if it's being drawn by animating `stroke-dashoffset`:

1. Set `stroke-dasharray` so the dash equals the full path length and the gap is large (only one dash shows).
2. Offset by the path length to hide it.
3. Animate the offset back to `0` to draw it in.

```css
path {
  stroke-dasharray: 1px 1.1px;
  stroke-dashoffset: 1px;
  animation: draw 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }
```

- `pathLength="100"` on the path normalizes its length so you work in round numbers and can share values across paths of different real lengths.
- `animation-fill-mode: forwards` is required or the shape snaps back to hidden when the animation ends.
- Stagger multiple strokes with `animation-delay` (a checkmark waits for its box to finish drawing).
- `stroke-linecap: round` gotcha: rounded caps extend past the mathematical dash, so make the gap slightly larger than the dash (`1px` dash, `1.1px` gap) or the caps peek through while the line should be hidden.

## Rotation and transform-origin (the SVG trap)

`transform-origin` in SVG defaults to the viewBox `(0,0)`, and `center` means the center of the viewBox, not the element. Fix it one of two ways:

```css
/* Preferred: make origin relative to the element's own box (HTML-like) */
.el { transform-box: fill-box; transform-origin: center; }

/* Or: keep viewBox coordinates and rotate around a specific point */
.hand { transform-origin: 50px 50px; } /* clock center of a 100x100 viewBox */
```

For a zero-thickness line's bounding box, `transform-origin: 0% 100%` hits the start point (the zero dimension ignores its percentage).

**Motion for React overrides a `transformOrigin` set in `style` on SVG elements back to `50% 50%`.** Set it in the `initial` prop instead:

```jsx
<motion.g
  initial={{ transformOrigin: "76.3px 69.5px" }}
  style={{ transformBox: "view-box" }}
  animate={{ rotate: 360 }}
/>
```

Use `transform-box: view-box` plus a pixel `transformOrigin` to rotate a group around a distant point (e.g. decorations orbiting a clock's center).

## Path morphing

Animate a path's `d` between two shapes; this only works when both paths share point structure:

```jsx
const progress = useMotionValue(0);
const d = useTransform(progress, [0, 1], [openPath, closedPath]);
// <motion.path d={d} />
```

If the two paths differ in structure, interpolate with the `flubber` library instead.

## Shakes and multi-step motion

Keyframe arrays fit shakes, pulses, and press feedback: decaying, alternating-sign values.

```jsx
// bell shake: rotate keyframes, large to small, alternating
animate={{ rotate: [0, 20, -15, 12.5, -10, 10, -7.5, 7.5, -5, 5, 0] }}
// press feedback: compress, overshoot, settle
animate={{ transform: ["scale(1)", "scale(0.97)", "scale(1.01)", "scale(1)"] }}
```

Put the rotate on a wrapping `<g>` so nested decorations shake for free.

## Ambient life

Make idle scenes feel alive with barely perceptible looping motion, and use **non-syncing durations** so layers never line up; that's what makes it read organic instead of mechanical:

```jsx
// float: translateY 0 to 1.5px over 3s; rotate: 0 to 2deg over 4s
transition={{ ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
```

Give idle and attention loops an initial delay (~2s) so users discover interactions first, and a `repeatDelay` between plays. Pause the loops off-screen (see the IntersectionObserver hook in `performance-deep-dive.md`).

## Performance for busy SVG scenes

Many simultaneously animating SVG elements, especially with filters, can drop frames. Promote only the animated ones, after you see jank, not preemptively:

```css
svg [data-animate]   { will-change: transform, opacity, stroke-dashoffset; contain: layout style paint; }
svg .filter-animated { will-change: transform; transform: translateZ(0); }
```

`contain: layout style paint` isolates an element's rendering so it doesn't repaint siblings; `translateZ(0)` forces a GPU layer for expensive filtered elements. Target `[data-animate]`, not every node; too many GPU layers cost memory.
