# CSS Patterns for Marker Highlighting

Pure CSS + GSAP implementations of all five MarkerHighlight.js drawing modes. Use these for deterministic rendering in HyperFrames compositions — no external library dependency, full GSAP timeline control.

## Table of Contents

- [1. Highlight Mode](#1-highlight-mode) — Yellow marker sweep behind text
- [2. Circle Mode](#2-circle-mode) — Hand-drawn ellipse around text
- [3. Burst Mode](#3-burst-mode) — Radiating lines from text
- [4. Scribble Mode](#4-scribble-mode) — Chaotic scribble over text
- [5. Sketchout Mode](#5-sketchout-mode) — Rough rectangle outline

## 1. Highlight Mode

Yellow marker sweep behind text. The most common mode.

```html
<span class="mh-highlight-wrap">
  <span class="mh-highlight-bar" id="hl-1"></span>
  <span class="mh-highlight-text">highlighted text</span>
</span>
```

```css
.mh-highlight-wrap {
  position: relative;
  display: inline;
}
.mh-highlight-bar {
  position: absolute;
  top: 0;
  left: -6px;
  right: -6px;
  bottom: 0;
  background: #fdd835;
  opacity: 0.35;
  transform: scaleX(0);
  transform-origin: left center;
  border-radius: 3px;
  z-index: 0;
}
.mh-highlight-text {
  position: relative;
  z-index: 1;
}
```

```js
// Sweep in from left
tl.to("#hl-1", { scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.6);

// Optional: skew for hand-drawn feel
// gsap.set("#hl-1", { skewX: -2 });
```

### Multi-line Highlight

Stagger bars across multiple lines:

```js
tl.to(
  ".mh-highlight-bar",
  {
    scaleX: 1,
    duration: 0.5,
    ease: "power2.out",
    stagger: 0.3,
  },
  0.6,
);
```

## 2. Circle Mode

Hand-drawn circle around text. Use `border-radius: 50%` with a slight rotation for organic feel.

```html
<span class="mh-circle-wrap">
  <span class="mh-circle-text" id="circle-word">IMPORTANT</span>
  <span class="mh-circle-ring" id="circle-1"></span>
</span>
```

```css
.mh-circle-wrap {
  position: relative;
  display: inline;
}
.mh-circle-text {
  position: relative;
  z-index: 1;
}
.mh-circle-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 130%;
  height: 160%;
  transform: translate(-50%, -50%) rotate(-3deg) scale(0);
  border: 3px solid #e53935;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}
```

```js
// Circle scales in with a wobble
tl.to(
  "#circle-1",
  {
    scale: 1,
    rotation: -3,
    duration: 0.6,
    ease: "back.out(1.7)",
    transformOrigin: "center center",
  },
  0.7,
);
```

### Variations

```css
/* Tighter circle (for short words) */
.mh-circle-ring.tight {
  width: 150%;
  height: 180%;
}

/* Squared circle (rounded rectangle) */
.mh-circle-ring.rounded {
  border-radius: 30%;
  width: 120%;
  height: 140%;
}

/* Ellipse (wider than tall) */
.mh-circle-ring.ellipse {
  width: 150%;
  height: 130%;
  border-radius: 50%;
}
```

## 3. Burst Mode

Radiating lines from text center. Each line is a positioned div rotated to its angle.

```html
<span class="mh-burst-wrap">
  <span class="mh-burst-text">WOW</span>
  <span class="mh-burst-container" id="burst-1">
    <span class="mh-burst-line" style="--angle: 0deg; --len: 70px;"></span>
    <span class="mh-burst-line" style="--angle: 30deg; --len: 55px;"></span>
    <span class="mh-burst-line" style="--angle: 60deg; --len: 80px;"></span>
    <span class="mh-burst-line" style="--angle: 90deg; --len: 45px;"></span>
    <span class="mh-burst-line" style="--angle: 120deg; --len: 65px;"></span>
    <span class="mh-burst-line" style="--angle: 150deg; --len: 75px;"></span>
    <span class="mh-burst-line" style="--angle: 180deg; --len: 50px;"></span>
    <span class="mh-burst-line" style="--angle: 210deg; --len: 60px;"></span>
    <span class="mh-burst-line" style="--angle: 240deg; --len: 80px;"></span>
    <span class="mh-burst-line" style="--angle: 270deg; --len: 40px;"></span>
    <span class="mh-burst-line" style="--angle: 300deg; --len: 70px;"></span>
    <span class="mh-burst-line" style="--angle: 330deg; --len: 55px;"></span>
  </span>
</span>
```

```css
.mh-burst-wrap {
  position: relative;
  display: inline;
}
.mh-burst-text {
  position: relative;
  z-index: 2;
}
.mh-burst-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  z-index: 1;
}
.mh-burst-line {
  position: absolute;
  display: block;
  width: 3px;
  height: var(--len);
  background: #1e88e5;
  left: -1.5px;
  top: calc(-1 * var(--len));
  transform: rotate(var(--angle));
  transform-origin: bottom center;
  opacity: 0;
}
```

```js
// All lines burst outward simultaneously with slight stagger
tl.fromTo(
  "#burst-1 .mh-burst-line",
  { scaleY: 0, opacity: 0 },
  { scaleY: 1, opacity: 1, duration: 0.4, ease: "power2.out", stagger: 0.03 },
  0.7,
);
```

**Vary line lengths** (40-80px range) for an organic, hand-drawn feel. Equal lengths look mechanical.

## 4. Scribble Mode

Wavy SVG underlines and strikethroughs that draw themselves via `stroke-dashoffset`.

```html
<span class="mh-scribble-wrap">
  <span class="mh-scribble-text">underlined text</span>
  <svg class="mh-scribble-svg" viewBox="0 0 500 24" preserveAspectRatio="none">
    <path
      id="scribble-1"
      d="M0,12 Q31,0 62,12 Q93,24 125,12 Q156,0 187,12 Q218,24 250,12 Q281,0 312,12 Q343,24 375,12 Q406,0 437,12 Q468,24 500,12"
      fill="none"
      stroke="#FDD835"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
</div>
```

```css
.mh-scribble-wrap {
  position: relative;
  display: inline;
}
.mh-scribble-text {
  position: relative;
  z-index: 1;
}
.mh-scribble-svg {
  position: absolute;
  left: 0;
  bottom: -6px;
  width: 100%;
  height: 24px;
  z-index: 0;
}
```

```js
// Measure path length and set initial dash state
var path = document.querySelector("#scribble-1");
var len = path.getTotalLength();
gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });

// Draw the line
tl.to(
  "#scribble-1",
  {
    strokeDashoffset: 0,
    duration: 0.8,
    ease: "power1.inOut",
  },
  0.7,
);
```

### Strikethrough Variant

Position the SVG at `top: 50%; transform: translateY(-50%)` instead of `bottom: -6px`.

### Wavy Path Generator

Scale the path's viewBox width to match text width. The wave pattern `Q x1,y1 x2,y2` alternates between `y=0` and `y=24` for a natural wobble. Adjust the control points for tighter or looser waves:

- **Tight waves**: smaller x-increments (25px per half-wave)
- **Loose waves**: larger x-increments (50px per half-wave)
- **Amplitude**: change the y range (0-24 for standard, 0-16 for subtle)

## 5. Sketchout Mode

Cross-hatch lines over de-emphasized text. Multiple angled lines create a "crossed out" effect.

```html
<span class="mh-sketchout-wrap">
  <span class="mh-sketchout-text">old price</span>
  <span class="mh-sketchout-lines" id="sketchout-1">
    <span class="mh-sketchout-line mh-sketchout-fwd"></span>
    <span class="mh-sketchout-line mh-sketchout-bwd"></span>
  </span>
</span>
```

```css
.mh-sketchout-wrap {
  position: relative;
  display: inline;
}
.mh-sketchout-text {
  position: relative;
  z-index: 0;
}
.mh-sketchout-lines {
  position: absolute;
  top: 0;
  left: -4px;
  right: -4px;
  bottom: 0;
  overflow: hidden;
  z-index: 1;
}
.mh-sketchout-line {
  position: absolute;
  display: block;
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  background: #e53935;
  transform-origin: left center;
  transform: scaleX(0);
}
.mh-sketchout-fwd {
  transform: scaleX(0) rotate(-12deg);
}
.mh-sketchout-bwd {
  transform: scaleX(0) rotate(12deg);
}
```

```js
// Forward slash draws first
tl.to(
  "#sketchout-1 .mh-sketchout-fwd",
  {
    scaleX: 1,
    duration: 0.3,
    ease: "power2.out",
  },
  1.0,
);

// Backward slash follows
tl.to(
  "#sketchout-1 .mh-sketchout-bwd",
  {
    scaleX: 1,
    duration: 0.3,
    ease: "power2.out",
  },
  1.15,
);
```

## Combining Modes in Captions

Use mode cycling for visual variety across caption groups:

```js
var MODES = ["highlight", "circle", "burst", "scribble"];

GROUPS.forEach(function (group, gi) {
  var mode = MODES[gi % MODES.length];
  // Apply the mode's CSS pattern to emphasis words in this group
  group.emphasisWords.forEach(function (word) {
    applyMode(word.el, mode, tl, word.start);
  });
});
```

Cycle every 2-3 groups for high energy, every 3-4 for medium, every 4-5 for low.
