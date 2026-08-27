## Blur

All blur transitions scale with energy. See SKILL.md "Blur Intensity by Energy" for the full table.

### Blur Through

Content becomes fully abstract before resolving. The heaviest blur transition.

**Calm (default for this type — it's inherently heavy):**

```js
tl.to(old, { filter: "blur(30px)", scale: 1.08, duration: 0.5, ease: "power1.in" }, T);
tl.to(old, { opacity: 0, duration: 0.3, ease: "power1.in" }, T + 0.3);
// Hold: both scenes in abstract blur state
tl.fromTo(new,
  { filter: "blur(30px)", scale: 0.92, opacity: 0 },
  { filter: "blur(30px)", scale: 0.92, opacity: 1, duration: 0.2, ease: "none" }, T + 0.5);
// Slow resolve
tl.to(new, { filter: "blur(0px)", scale: 1, duration: 0.7, ease: "power1.out" }, T + 0.7);
```

**Medium:**

```js
tl.to(old, { filter: "blur(15px)", scale: 1.05, opacity: 0, duration: 0.4, ease: "power2.in" }, T);
tl.fromTo(new,
  { filter: "blur(15px)", scale: 0.95, opacity: 0 },
  { filter: "blur(0px)", scale: 1, opacity: 1, duration: 0.4, ease: "power2.out" }, T + 0.2);
```

### Directional Blur

Blur + skew simulating motion in one direction. Scale blur and skew with energy.

**Medium (default):**

```js
tl.to(old, { filter: "blur(12px)", skewX: -8, x: -200, opacity: 0, duration: 0.4, ease: "power3.in" }, T);
tl.fromTo(new,
  { filter: "blur(12px)", skewX: 8, x: 200, opacity: 0 },
  { filter: "blur(0px)", skewX: 0, x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, T + 0.15);
```

**Calm (heavier blur, gentler motion):**

```js
tl.to(old, { filter: "blur(20px)", skewX: -4, x: -100, opacity: 0, duration: 0.6, ease: "power1.in" }, T);
tl.fromTo(new,
  { filter: "blur(20px)", skewX: 4, x: 100, opacity: 0 },
  { filter: "blur(0px)", skewX: 0, x: 0, opacity: 1, duration: 0.6, ease: "power1.out" }, T + 0.3);
```
