### H2 · Split Diptych
Headline + lede on one side, image or product capture on the other. 6/6 or 7/5 columns.
*Use when:* you can pair every claim with a visual proof.
*Don't confuse with:* H6 Photographic (which puts the image full-bleed, not paired).

```html
<section class="hero-split">
  <div><h1>…</h1><p>…</p><a class="cta-outline">…</a></div>
  <figure><img src="" /></figure>
</section>
```
```css
.hero-split { display: grid; grid-template-columns: 7fr 5fr; gap: var(--space-2xl); align-items: center; }
@media (max-width: 56rem) { .hero-split { grid-template-columns: 1fr; } }
```
