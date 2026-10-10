# clip-path for Animation

`clip-path` is hardware-accelerated and creates effects impossible with `opacity` and `transform` alone.

## Contents
- [The inset shape](#the-inset-shape)
- [Tab colour transitions](#tab-colour-transitions)
- [Hold-to-delete](#hold-to-delete)
- [Image reveals on scroll](#image-reveals-on-scroll)
- [Comparison sliders](#comparison-sliders)

## The inset shape

`clip-path: inset(top right bottom left)` clips a rectangle. Each value eats into the element from that side.

```css
/* Fully hidden from right */
.hidden { clip-path: inset(0 100% 0 0); }

/* Fully visible */
.visible { clip-path: inset(0 0 0 0); }
```

Transition between states:

```css
.reveal {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
.reveal.active {
  clip-path: inset(0 0 0 0);
}
```

## Tab colour transitions

Duplicate the tab list. Style the copy as active (different background and text colour). Clip it so only the active tab shows. Animate the clip on tab change. This gives a seamless colour transition that per-tab `color` timing can't match.

```css
.tabs-active-overlay {
  clip-path: inset(0 var(--clip-right) 0 var(--clip-left));
  transition: clip-path 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

Update `--clip-left` and `--clip-right` via JS on tab change.

## Hold-to-delete

Put `clip-path: inset(0 100% 0 0)` on a coloured overlay. On `:active`, transition to `inset(0 0 0 0)` over 2s `linear`. On release, snap back with 200ms `ease-out`. Add `scale(0.97)` on the button for press feedback.

```css
.delete-overlay {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms ease-out;
}

.delete-button:active .delete-overlay {
  clip-path: inset(0 0 0 0);
  transition: clip-path 2s linear;
}
```

## Image reveals on scroll

Start hidden from bottom with `clip-path: inset(0 0 100% 0)`. Animate to `inset(0 0 0 0)` on viewport entry.

```tsx
"use client";
import { useRef, useEffect, useState } from "react";

export function RevealImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1, rootMargin: "-100px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        clipPath: visible ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
        transition: "clip-path 800ms cubic-bezier(0.77, 0, 0.175, 1)",
      }}
    >
      <img src={src} alt={alt} />
    </div>
  );
}
```

## Comparison sliders

Overlay two images. Clip the top with `clip-path: inset(0 50% 0 0)`. Adjust the right inset by drag position. No extra DOM, fully hardware-accelerated.

```css
.comparison-top {
  clip-path: inset(0 var(--split) 0 0);
}
```

Update `--split` from pointer events on the handle.
