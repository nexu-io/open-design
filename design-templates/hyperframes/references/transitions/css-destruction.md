## Destruction

### Page Burn

The outgoing scene literally burns away from a corner. A fire front expands with noise-based irregular edges, a canvas draws the scorched char line at the burn boundary, and individual text characters/elements chip off and fall with gravity as the fire reaches them. The incoming scene reveals behind the burn.

This transition has three systems working together:

1. **Fire geometry** — a radial front expanding from a corner (e.g., bottom-right) with noise-based irregularity for organic edges
2. **Scene clipping** — the outgoing scene uses an SVG clip-path (with `fill-rule: evenodd`) that cuts a hole matching the fire front. As the fire expands, more of the scene is clipped away. All content (text, images, lines) burns with the page — no separate debris.
3. **Scorched edge** — a `<canvas>` overlay draws a radial gradient fringe at the fire boundary to simulate charring

**When to use:** Dramatic reveals, edgy/destructive mood, gaming, cyberpunk. This is the most dramatic transition in the catalog — reserve it for hero moments.

**Requirements:**

- A `<canvas>` element for the burn edge overlay
- A noise function for organic fire edge geometry
- SVG clip-path with evenodd fill-rule for the inverted clip

**Fire geometry (deterministic noise):**

```js
function noise(x) {
  var ix = Math.floor(x),
    fx = x - ix;
  var a = Math.sin(ix * 127.1 + 311.7) * 43758.5453;
  var b = Math.sin((ix + 1) * 127.1 + 311.7) * 43758.5453;
  var t = fx * fx * (3 - 2 * fx);
  return a - Math.floor(a) + (b - Math.floor(b) - (a - Math.floor(a))) * t;
}

function fireRadiusAtAngle(angle, progress) {
  var base = progress * maxRadius;
  return (
    base +
    noise(angle * 3 + progress * 4) * 50 +
    noise(angle * 8 + progress * 9) * 20 +
    noise(angle * 15 + progress * 15) * 8
  );
}
```

**Incoming scene timing:** The incoming scene should NOT be visible during the burn. As the fire consumes the outgoing scene, **black shows through the holes** — this is the dramatic part. The viewer watches content being destroyed against blackness.

At ~90% through the burn, the incoming scene fades in SLOWLY from black — the background first, then content staggered. Use long, gentle fades (`power1.out`, 0.8-1.2s durations) so it feels like the new scene materializes from darkness, not a hard swap.

```js
// Scene 2 stays at opacity: 0 during the burn — black behind the fire
tl.set("#s2-title", { opacity: 0 }, T);
tl.set("#s2-subtitle", { opacity: 0 }, T);

// At 90% through, scene bg fades in slowly from black
var contentReveal = T + BURN_DURATION * 0.9;
tl.to("#scene2", { opacity: 1, duration: 1.2, ease: "power1.out" }, contentReveal);

// Content fades in staggered on top, even slower
tl.to("#s2-title", { opacity: 1, duration: 1.0, ease: "power1.out" }, contentReveal + 0.5);
tl.to("#s2-subtitle", { opacity: 1, duration: 0.8, ease: "power1.out" }, contentReveal + 0.7);
```

**Content burns with the page — no falling debris.** The clip-path on scene1 IS the effect — as the fire shape expands, everything behind the fire edge (text, images, lines) disappears naturally. Don't clone elements, don't create falling debris. The content is part of the page being consumed. The scorched canvas edge provides the visual char line at the burn boundary.

**Hide scene1 via `tl.set` at burn end — NEVER in `onComplete`.** Using `onComplete` to hide scene1 is not reversible when scrubbing. Instead, use a `tl.set` at the exact burn end time:

```js
tl.to(
  burnState,
  {
    progress: 1,
    duration: BURN_DURATION,
    ease: "none",
    onUpdate: function () {
      var wp = burnState.progress;
      var scene1 = document.getElementById("scene1");
      if (wp <= 0) {
        scene1.style.clipPath = "none"; // fully visible when rewound
      } else if (wp < 1) {
        scene1.style.clipPath = buildClipPath(wp);
      }
      drawEdge(wp);
    },
    // NO onComplete — use tl.set instead
  },
  T,
);

// Hide scene1 at exact burn end — reversible via timeline
tl.set("#scene1", { opacity: 0 }, T + BURN_DURATION);
tl.set("#scene1", { clipPath: "none" }, T + BURN_DURATION);
```

The `onUpdate` handles clip-path and canvas edge per-frame. The `tl.set` handles the final hide — and GSAP automatically reverses it when scrubbing backward, restoring scene1 to `opacity: 1`.

The `onUpdate` callback is the key — it runs every frame to advance the clip-path and canvas edge in sync with the timeline.
