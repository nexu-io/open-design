## Distortion

### Glitch

RGB-tinted overlays (NOT multiply blend — use normal blending at 35% opacity) jitter with large offsets. Scene itself also jitters.

```js
tl.set("#glitch-r", { opacity: 1, x: 40, y: -8 }, T);
tl.set("#glitch-g", { opacity: 1, x: -30, y: 12 }, T);
tl.set("#glitch-b", { opacity: 1, x: 15, y: -20 }, T);
tl.set(old, { x: -15 }, T);
// 6 jitter frames at 0.03s intervals with big offsets (±30-60px)
// ... swap and clear at T + 0.2
```

### Chromatic Aberration

RGB overlays start aligned then spread apart (±80px), scene fades, converge on new scene.

```js
tl.set("#glitch-r", { opacity: 0.6, x: 0 }, T);
tl.set("#glitch-g", { opacity: 0.6, x: 0 }, T);
tl.set("#glitch-b", { opacity: 0.6, x: 0 }, T);
tl.to("#glitch-r", { x: -80, opacity: 0.8, duration: 0.3, ease: "power2.in" }, T);
tl.to("#glitch-b", { x: 80, opacity: 0.8, duration: 0.3, ease: "power2.in" }, T);
tl.to("#glitch-g", { y: 30, duration: 0.3, ease: "power2.in" }, T);
// Swap at T + 0.3, converge back at T + 0.3
```

### Ripple

Rapid oscillation (±30px) + scale distortion (0.97-1.03) + increasing blur. Swap at peak distortion.

```js
tl.to(old, { x: 30, scale: 1.02, duration: 0.04, ease: "none" }, T);
tl.to(old, { x: -25, scale: 0.98, filter: "blur(4px)", duration: 0.04, ease: "none" }, T + 0.04);
// ... more oscillations with increasing blur
// Swap at peak, incoming stabilizes with decreasing wobble
```

### VHS Tape

Clone scene into 20 horizontal strips (each 54px, clip-path'd). Each strip shifts x independently with seeded pseudo-random offsets at per-bar random intervals. Add red+blue chromatic offset copies on each strip (z-index above main, 35% opacity). Make strips wider than frame (2020px at left:-50px) so edges never show.

See SKILL.md for clone-based implementation pattern.
