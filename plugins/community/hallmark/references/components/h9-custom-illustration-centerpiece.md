### H9 · Custom Illustration Centerpiece
A single hand-built SVG (Tier B in the enrichment hierarchy — or pure CSS at Tier A for simpler shapes) sitting on the hero as one illustrative element. The bakery loaf, the studio's mascot, the workflow diagram.
*Use when:* the brand has a *thing* that benefits from being drawn — a craft, a character, a process.
*Don't confuse with:* H6 Photographic (real photography) or H8 Mockup (a product screenshot, not artwork).

The illustration itself is *built*, not picked from Storyset / Humaaans / unDraw / Lottie. See [`custom-craft.md`](custom-craft.md) for full recipes (CSS art, hand-built SVG, declarative animation). The cookbook entry below is the page-level structural sketch.

```html
<section class="hero-art">
  <div>
    <p class="eyebrow">Maple Street Bread · est. 2026</p>
    <h1>Sourdough, every morning.</h1>
    <p>Slow-fermented overnight, baked on stone, before you wake.</p>
  </div>
  <svg viewBox="0 0 200 100" class="loaf" aria-label="A loaf of bread">
    <path class="loaf__body" d="M 20 70 Q 100 10 180 70 L 180 90 L 20 90 Z" />
    <path class="loaf__score" d="M 60 50 L 90 30 M 100 45 L 130 25 M 140 50 L 165 35" />
  </svg>
</section>
```
```css
.hero-art   { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2xl); align-items: center; }
.loaf__body { fill: oklch(72% 0.14 50); }
.loaf__score{ stroke: oklch(38% 0.10 35); stroke-width: 2; fill: none; stroke-linecap: round; }
```

---
