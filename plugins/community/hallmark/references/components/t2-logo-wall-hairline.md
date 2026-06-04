### T2 · Logo wall (hairline)
A row of customer logos, monochromatic, separated by hairline rules. No card boxes, no shadows.
*Use when:* you have recognisable customers and want to surface them quietly.
*Don't confuse with:* the AI-default 6-logo box grid; this version refuses card boxes.

```html
<section class="logo-wall">
  <ul>
    <li><img src="" /></li>
    <li><img src="" /></li>
    <li><img src="" /></li>
  </ul>
</section>
```
```css
.logo-wall ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0; }
.logo-wall li { padding: var(--space-md); border-right: 1px solid var(--color-rule); display: grid; place-items: center; }
.logo-wall img { filter: grayscale(1); opacity: 0.7; }
```
