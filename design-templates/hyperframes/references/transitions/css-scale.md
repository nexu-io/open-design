## Scale / Zoom

### Zoom Through

Old zooms past camera + blurs, new zooms in from behind.

```js
tl.to(old, { scale: 2.5, opacity: 0, filter: "blur(8px)", duration: 0.4, ease: "power3.in" }, T);
tl.fromTo(new,
  { scale: 0.5, opacity: 0, filter: "blur(8px)" },
  { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "power3.out" }, T + 0.15);
```

### Zoom Out

Old shrinks away, new was behind it. Needs z-index management.

```js
tl.set(new, { opacity: 1, zIndex: 1 }, T);
tl.set(old, { zIndex: 10, transformOrigin: "50% 50%" }, T);
tl.to(old, { scale: 0.3, opacity: 0, duration: 0.4, ease: "power3.in" }, T);
tl.set(old, { zIndex: "auto" }, T + 0.4);
tl.set(new, { zIndex: "auto" }, T + 0.4);
```
