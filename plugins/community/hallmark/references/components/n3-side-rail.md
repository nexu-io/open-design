### N3 · Side-rail
A thin vertical strip on the left edge — wordmark rotated, plus 2–3 dot-indicators for sections. Editorial / portfolio energy.
*Use when:* the page is long and section-numbered.
*Don't confuse with:* N1 Top wordmark (which is horizontal).

```html
<nav class="nav-rail">
  <p class="wordmark vertical">Studio</p>
  <ul class="dots"><li></li><li></li><li></li></ul>
</nav>
```
```css
.nav-rail { position: fixed; left: 0; top: 0; bottom: 0; width: 3rem; padding: var(--space-md); writing-mode: vertical-rl; }
```
