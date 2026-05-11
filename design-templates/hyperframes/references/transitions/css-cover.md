## Cover

### Staggered Color Blocks

Full-screen (1920x1080) colored divs slide across staggered. Scene swaps while covered.

**2-block** (standard):

```js
tl.set("#wipe-a", { x: -1920 }, T - 0.01);
tl.set("#wipe-b", { x: -1920 }, T - 0.01);
tl.to("#wipe-a", { x: 0, duration: 0.25, ease: "power3.inOut" }, T);
tl.to("#wipe-b", { x: 0, duration: 0.25, ease: "power3.inOut" }, T + 0.06);
tl.set(old, { opacity: 0 }, T + 0.2);
tl.set(new, { opacity: 1 }, T + 0.2);
tl.to("#wipe-a", { x: 1920, duration: 0.25, ease: "power3.inOut" }, T + 0.28);
tl.to("#wipe-b", { x: 1920, duration: 0.25, ease: "power3.inOut" }, T + 0.34);
```

**5-block** (dense variant): same pattern with 5 blocks at 0.04s stagger. Use composition palette colors.

### Horizontal Blinds

Full-width strips slide across staggered. Each strip: `width: 1920px; height: Xpx`.

**6 strips** (180px each): `0.03s` stagger
**12 strips** (90px each): `0.018s` stagger

```js
for (var i = 0; i < N; i++) {
  tl.set("#blind-h-" + i, { x: -1920 }, T - 0.01);
  tl.fromTo("#blind-h-" + i, { x: -1920 }, { x: 0, duration: 0.2, ease: "power3.inOut" }, T + i * stagger);
}
tl.set(old, { opacity: 0 }, T + coverTime);
tl.set(new, { opacity: 1 }, T + coverTime);
for (var i = 0; i < N; i++) {
  tl.to("#blind-h-" + i, { x: 1920, duration: 0.2, ease: "power3.inOut" }, T + exitStart + i * stagger);
}
```

### Vertical Blinds

Same as horizontal but strips are tall and narrow, moving on Y axis.
