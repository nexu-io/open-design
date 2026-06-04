### N6 · Newspaper masthead
Full-width header, large centred wordmark on the top row, thin issue/date line above or below in serif small caps, optional inline link row beneath, double-rule below the whole thing. Reads as editorial, broadsheet — NYT, FT, Vogue.
*Use when:* the page is editorial, magazine-shaped, or framed as an issue / edition.
*Don't confuse with:* N1 Wordmark + 2 links (which is asymmetric and small).

```html
<header class="nav-mast">
  <p class="mast-line muted">No 22 · Spring 2026 · Studio</p>
  <h1 class="mast-name">STUDIO</h1>
  <nav class="mast-nav" aria-label="Primary">
    <ul><li><a>Catalog</a></li><li><a>Voice</a></li><li><a>Letters</a></li></ul>
  </nav>
  <hr class="mast-rule double" aria-hidden="true">
</header>
```
```css
.nav-mast { display: grid; gap: var(--space-2xs); padding: var(--space-md) var(--page-gutter) 0; text-align: center; }
.mast-name { font-family: var(--font-display); font-size: clamp(2.25rem, 5vw, 3.75rem); letter-spacing: -0.01em; line-height: 0.95; margin: 0; }
.mast-line { font-variant: small-caps; letter-spacing: 0.08em; font-size: var(--text-xs); }
.mast-nav ul { display: inline-flex; gap: var(--space-md); list-style: none; padding: 0; margin: var(--space-2xs) 0 0; }
.mast-rule.double { border: 0; border-top: var(--rule-hair) solid var(--color-rule); border-bottom: var(--rule-hair) solid var(--color-rule); height: 4px; margin: var(--space-sm) 0 0; }
```

*Anti-pattern:* using N6 on a SaaS dashboard or a developer-tool product page. The masthead vocabulary belongs to long-form / editorial sites; on a B2B product, it reads as costume.
