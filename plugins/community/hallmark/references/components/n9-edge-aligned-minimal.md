### N9 · Edge-aligned minimal
Wordmark hard-left, single CTA hard-right, vast empty space between, no link row at all. The *absence* is the design — Apple product pages, Carl Hauser, luxury sites.
*Use when:* the page is luxury / quiet / Atelier / Salon and the brand earns the silence.
*Don't confuse with:* N1 Wordmark + 2 links (which fills the middle).

```html
<header class="nav-edge">
  <a class="wordmark">Studio</a>
  <a class="cta-outline">Get →</a>
</header>
```
```css
.nav-edge { display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--page-gutter); }
.nav-edge .wordmark { font-family: var(--font-display); font-size: var(--text-md); }
```

*Anti-pattern:* adding 4 inline links between the wordmark and CTA "to fill the space". The space *is* the design; if you fill it, you've made N1 with extra steps.
