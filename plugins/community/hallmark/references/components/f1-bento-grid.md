
### F1 · Bento grid
Asymmetric grid of 8–15 tiles in mixed spans (1×1, 2×1, 1×2, 2×2). Visual rhythm via size.
*Use when:* multiple equally-valid entry points; SaaS feature page.
*Don't confuse with:* F2 Sticky-scroll (which stacks vertically with sticky pacing).

```html
<section class="bento">
  <article class="cell span-2x2">…</article>
  <article class="cell span-1x1">…</article>
  <article class="cell span-2x1">…</article>
</section>
```
```css
.bento { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 12rem; gap: var(--space-md); }
.span-2x2 { grid-column: span 2; grid-row: span 2; }
.span-2x1 { grid-column: span 2; }
.span-1x2 { grid-row: span 2; }
@media (max-width: 56rem) { .bento { grid-template-columns: repeat(2, 1fr); } }
```
