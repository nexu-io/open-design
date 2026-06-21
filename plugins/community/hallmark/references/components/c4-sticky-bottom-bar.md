### C4 · Sticky bottom bar
A horizontal bar pinned to the viewport bottom, holding a CTA + a brief reassurance line.
*Use when:* the page is long and the CTA needs to be reachable always.
*Don't confuse with:* anything in the fold; this is a *persistent* element, not a hero CTA.

```html
<aside class="cta-sticky">
  <span>Try it free for 14 days.</span>
  <a class="cta-outline">Start →</a>
</aside>
```
```css
.cta-sticky { position: fixed; left: 0; right: 0; bottom: 0; padding: var(--space-sm) var(--space-md); background: var(--color-paper); border-top: 1px solid var(--color-rule); display: flex; justify-content: space-between; align-items: center; }
```

---
