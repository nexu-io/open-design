## Light

### Light Leak

Multiple warm-colored overlays wash across frame. Needs: a flat warm tint layer + 2-3 bright radial gradient divs, all larger than the frame so edges are never visible.

```js
// Warm tint washes over entire frame
tl.to("#leak-warm", { opacity: 0.4, duration: 0.3, ease: "power1.in" }, T);
// Bright leak elements drift in
tl.to("#leak-1", { opacity: 0.9, x: 300, duration: 0.5, ease: "sine.inOut" }, T + 0.05);
tl.to("#leak-2", { opacity: 0.8, x: 200, duration: 0.6, ease: "sine.inOut" }, T + 0.1);
// Peak warmth then swap
tl.to("#leak-warm", { opacity: 0.6, duration: 0.15, ease: "power2.in" }, T + 0.35);
tl.set(old, { opacity: 0 }, T + 0.45);
tl.set(new, { opacity: 1 }, T + 0.45);
// Leak fades
tl.to("#leak-warm", { opacity: 0, duration: 0.4, ease: "power2.out" }, T + 0.5);
tl.to("#leak-1", { opacity: 0, x: 600, duration: 0.35, ease: "power1.out" }, T + 0.5);
```

### Overexposure Burn

Scene progressively blows out to white using CSS `filter: brightness()`, then white overlay fades in. Swap at peak white. White recedes to reveal new scene.

```js
tl.to(old, { filter: "brightness(1.5)", scale: 1.03, duration: 0.2, ease: "power1.in" }, T);
tl.to(old, { filter: "brightness(3)", scale: 1.06, duration: 0.2, ease: "power2.in" }, T + 0.2);
tl.to("#flash-overlay", { opacity: 0.5, duration: 0.25, ease: "power1.in" }, T + 0.15);
tl.to("#flash-overlay", { opacity: 1, duration: 0.15, ease: "power2.in" }, T + 0.4);
tl.set(old, { opacity: 0, filter: "brightness(1)", scale: 1 }, T + 0.55);
tl.set(new, { opacity: 1 }, T + 0.55);
tl.to("#flash-overlay", { opacity: 0, duration: 0.35, ease: "power2.out" }, T + 0.55);
```

### Film Burn

Staggered warm overlays (amber, orange, red) bleed from one edge. Each overlay is a large radial gradient div at high z-index.

```js
tl.to("#burn-a", { opacity: 1, x: -300, duration: 0.4, ease: "power1.in" }, T);
tl.to("#burn-b", { opacity: 1, x: -500, duration: 0.5, ease: "power1.in" }, T + 0.05);
tl.to("#burn-c", { opacity: 1, x: -200, duration: 0.45, ease: "power1.in" }, T + 0.1);
tl.set(old, { opacity: 0 }, T + 0.35);
tl.set(new, { opacity: 1 }, T + 0.35);
tl.to("#burn-a", { opacity: 0, duration: 0.3, ease: "power2.out" }, T + 0.45);
tl.to("#burn-b", { opacity: 0, duration: 0.3, ease: "power2.out" }, T + 0.5);
tl.to("#burn-c", { opacity: 0, duration: 0.3, ease: "power2.out" }, T + 0.55);
```
