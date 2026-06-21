### F6 · Product card grid
Each card is a product, not a feature. Image · name · price · one micro-action. Reads like a shop floor, not a marketing site.
*Use when:* the brief is commerce, catalogue, lookbook, marketplace — anything where the page sells *things*, not *features*.
*Don't confuse with:* F1 Bento (which sells *features*; tiles vary in size and span). Product cards are uniform on purpose — the rhythm comes from the products, not the layout.

**Variation knobs:** card ratio (3/4 portrait · 1/1 square · 4/3 landscape) · density (3-up · 4-up · 5-up) · price treatment (under name · over image · hover-reveal) · micro-action (Add · Save · View → · none).

```html
<section class="product-grid">
  <article class="product">
    <a class="product__media" href=""><img src="" alt="" loading="lazy" /></a>
    <div class="product__meta">
      <h3 class="product__name">Linen Apron · Indigo</h3>
      <p class="product__price tabular-nums">¥ 6,400</p>
    </div>
    <button class="product__add" aria-label="Add Linen Apron to bag">+</button>
  </article>
  <!-- ... more products, uniform shape ... -->
</section>
```
```css
.product-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-xl) var(--space-lg); }
@media (max-width: 60rem) { .product-grid { grid-template-columns: repeat(2, 1fr); } }
.product { display: grid; gap: var(--space-sm); position: relative; }
.product__media { display: block; aspect-ratio: 3 / 4; background: var(--color-paper-2); overflow: hidden; }
.product__media img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--dur-long) var(--ease-out); }
.product__media:hover img { transform: scale(1.02); }
.product__name { font-family: var(--font-body); font-size: var(--text-md); margin: 0; }
.product__price { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-ink-2); }
.product__add { position: absolute; top: var(--space-sm); right: var(--space-sm); width: 32px; height: 32px; background: var(--color-paper); border: var(--rule-hair) solid var(--color-rule-2); cursor: pointer; opacity: 0; transition: opacity var(--dur-short) var(--ease-out); }
.product:hover .product__add, .product:focus-within .product__add { opacity: 1; }
@media (pointer: coarse) { .product__add { opacity: 1; } }
```

**Anti-patterns to avoid in product grids:**
- Don't borrow Bento's irregular spans — products want uniform rhythm.
- Don't put feature-style two-line descriptions under product names. The price *is* the description.
- Don't auto-scale the image on idle — only on hover, and only by 1.02× max.
- Don't use cards with shadow + radius + border + tile + ribbon. Pick one container signal.

---
