### N2 · Floating chip
A small fixed chip in a corner — wordmark + a single action ("Try it"). Doesn't sit in document flow.
*Use when:* the page is fold-heavy and traditional nav would fight the content.
*Don't confuse with:* C4 Sticky bottom bar (which is full-width).

```html
<aside class="nav-chip">
  <a class="wordmark">Studio</a>
  <a class="cta-outline">Try →</a>
</aside>
```
```css
.nav-chip { position: fixed; top: var(--space-md); right: var(--space-md); display: inline-flex; gap: var(--space-md); padding: 0.5rem 0.75rem; background: var(--color-paper); border: 1px solid var(--color-rule); }
```
