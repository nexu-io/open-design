### N5 · Floating pill
A rounded full-pill nav, *visibly detached* from the page edges, sitting ~`var(--space-md)` from the top, soft blur backdrop, soft shadow. Reads as contemporary modern-minimal — Vercel, Linear, Framer, Raycast.
*Use when:* the page is modern-minimal / atmospheric and the hero has a distinct surface or imagery beneath the pill that the blur can sit over.
*Don't confuse with:* N1 Wordmark + 2 links (which is full-width); N2 Floating chip (which is corner-anchored).

```html
<nav class="nav-pill" aria-label="Primary">
  <a class="wordmark">Studio</a>
  <ul class="nav-pill__links"><li><a>Catalog</a></li><li><a>Voice</a></li></ul>
  <a class="cta-fill">Get →</a>
</nav>
```
```css
.nav-pill {
  position: fixed; inset: var(--space-md) auto auto 50%;
  transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: var(--space-md);
  padding: 0.5rem 0.875rem;
  background: color-mix(in oklch, var(--color-paper) 78%, transparent);
  backdrop-filter: blur(14px) saturate(120%);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: 999px;
  box-shadow: 0 8px 24px -12px oklch(0% 0 0 / 0.18);
  z-index: 20;
}
```

*Anti-pattern:* a "pill" that's ~95 % viewport-wide is just a full-width nav with rounded ends — defeats the point. The pill must be visibly detached and content-sized; if your link list pushes it past ~720 px, drop a link or switch to N1.
