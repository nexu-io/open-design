## Dissolve

### Crossfade

Simple opacity swap. The baseline.

```js
tl.to(old, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, T);
tl.fromTo(new, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.inOut" }, T);
```

### Blur Crossfade

Dissolve with blur + scale shift. **Scale blur amount by energy** — see SKILL.md "Blur Intensity by Energy" section. The examples below show the medium (default) version. For calm compositions, increase to 20-30px with a 0.3-0.5s hold at peak blur. For high-energy, decrease to 3-6px with no hold.

**Medium (default):**

```js
tl.to(old, { filter: "blur(10px)", scale: 1.03, opacity: 0, duration: 0.5, ease: "power2.inOut" }, T);
tl.fromTo(new,
  { filter: "blur(10px)", scale: 0.97, opacity: 0 },
  { filter: "blur(0px)", scale: 1, opacity: 1, duration: 0.5, ease: "power2.inOut" }, T + 0.1);
```

**Calm (wellness, luxury) — heavy blur, holds at abstract color:**

```js
tl.to(old, { filter: "blur(25px)", scale: 1.05, duration: 0.6, ease: "power1.in" }, T);
tl.to(old, { opacity: 0, duration: 0.4, ease: "power1.in" }, T + 0.4);
tl.fromTo(new,
  { filter: "blur(25px)", scale: 0.95, opacity: 0 },
  { filter: "blur(25px)", scale: 0.95, opacity: 1, duration: 0.3, ease: "power1.inOut" }, T + 0.5);
tl.to(new, { filter: "blur(0px)", scale: 1, duration: 0.6, ease: "power1.out" }, T + 0.8);
```

### Focus Pull

Outgoing slowly blurs while incoming fades in sharp. Depth-of-field feel. **Scale blur amount and hold duration by energy.**

**Medium:**

```js
tl.to(old, { filter: "blur(15px)", duration: 0.5, ease: "power1.in" }, T);
tl.to(old, { opacity: 0, duration: 0.3, ease: "power2.in" }, T + 0.25);
tl.fromTo(new, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, T + 0.25);
```

**Calm — slow rack focus with long hold at peak defocus:**

```js
tl.to(old, { filter: "blur(30px)", duration: 0.8, ease: "power1.in" }, T);
tl.to(old, { opacity: 0, duration: 0.5, ease: "power1.in" }, T + 0.6);
tl.fromTo(new, { opacity: 0, filter: "blur(20px)" },
  { opacity: 1, filter: "blur(20px)", duration: 0.3, ease: "power1.inOut" }, T + 0.7);
tl.to(new, { filter: "blur(0px)", duration: 0.6, ease: "power1.out" }, T + 1.0);
```

### Color Dip

Fade to solid color, hold, fade up new scene.

```js
tl.to(old, { opacity: 0, duration: 0.2, ease: "power2.in" }, T);
// Background color shows through
tl.fromTo(new, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, T + 0.25);
```
