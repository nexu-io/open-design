### N7 · Brutal slab
A heavy, full-width nav with a 2 px solid border-bottom, all-caps wordmark and tracked uppercase link row, dense rhythm, no shadow, no rounded corners. Reads as Pentagram project pages, Liquid Death, brutalist-leaning agencies.
*Use when:* the genre is playful (Brutal, Manifesto, Sport) or the brand voice is heavy / declarative.
*Don't confuse with:* N1 Wordmark + 2 links (which is small and quiet).

```html
<header class="nav-slab">
  <a class="slab-mark">STUDIO</a>
  <nav class="slab-nav" aria-label="Primary">
    <ul><li><a>CATALOG</a></li><li><a>VOICE</a></li><li><a>WORK</a></li></ul>
  </nav>
  <a class="cta-fill cta-fill--slab">GET</a>
</header>
```
```css
.nav-slab { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-sm) var(--page-gutter); border-bottom: 2px solid var(--color-ink); background: var(--color-paper); }
.slab-mark { font-family: var(--font-display); font-weight: 800; letter-spacing: 0.04em; }
.slab-nav ul { display: flex; gap: var(--space-md); list-style: none; padding: 0; margin: 0 0 0 auto; }
.slab-nav a { text-transform: uppercase; letter-spacing: 0.08em; font-size: var(--text-sm); font-weight: 600; }
```

*Anti-pattern:* combining N7 with rounded corners, soft shadows, or backdrop-blur — those vocabularies fight. If you reach for blur, drop to N5; if you reach for round, drop to N1.
