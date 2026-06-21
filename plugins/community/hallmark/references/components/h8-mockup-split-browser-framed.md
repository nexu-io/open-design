### H8 · Mockup Split (browser-framed)
Headline left, browser-frame mockup right, the mockup tilted 1–3° for life. Frame can be browser chrome, macOS toolbar, minimal hairline, or floating no-frame.
*Use when:* you're selling a web app and you have a clean, well-lit screenshot.
*Don't confuse with:* H7 Clipped-Edge (which extends past the viewport) or H2 Split Diptych (which uses photography or proof column, not a product mockup).

```html
<section class="hero-mock">
  <div>
    <h1>The studio's new mute button.</h1>
    <p>Press <kbd>⌘ M</kbd> from anywhere.</p>
  </div>
  <figure class="mock">
    <header class="mock__chrome"><span></span><span></span><span></span></header>
    <div class="mock__body"><!-- screenshot or CSS-art mockup --></div>
  </figure>
</section>
```
```css
.hero-mock  { display: grid; grid-template-columns: 1fr 1.2fr; gap: var(--space-2xl); align-items: center; }
.mock       { transform: rotate(1.5deg); border-radius: 12px; overflow: hidden; box-shadow: 0 24px 60px -20px oklch(20% 0.02 60 / 0.18); }
.mock__chrome { display: flex; gap: 6px; padding: 10px 12px; background: var(--color-paper-2); border-block-end: var(--rule-hair) solid var(--color-rule); }
.mock__chrome span { width: 10px; height: 10px; border-radius: 50%; background: var(--color-rule-2); }
```
