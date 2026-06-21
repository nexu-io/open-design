### N10 · Floating-on-scroll morph
A sticky bar at the top that **morphs into a floating pill** as the user scrolls past a threshold. Two visual modes share one DOM — `.nav` (outer) owns the bar look, `.nav__inner` (inner) owns the pill look. Cross-faded on a single class toggle (`.is-floating`) with one timing curve. Active layer feels seamless; AI defaults always botch this.
*Use when:* atmospheric / modern-minimal pages where the kinetic micro-moment earns its place. Adds a single tasteful surprise; resists novelty.
*Don't confuse with:* N5 Floating pill (always-on, no scroll behaviour). N10 is N5 plus a default-bar state that morphs *into* it.

```html
<header class="nav">
  <div class="nav__inner">
    <a class="wordmark">Hallmark</a>
    <ul class="nav__links">…</ul>
  </div>
</header>
```

The full recipe — the four laws (height-constant, transform-for-offset, cross-fade-everything, single-curve), the property-morph table, the scroll-handler script, and the eight anti-patterns Hallmark refuses — lives in [`floating-nav.md`](floating-nav.md). Reach for that file *before* building this archetype. Skipping the four laws is what makes 90% of attempts read as broken.

*Anti-pattern (one of eight in floating-nav.md):* swapping two `<header>` elements via opacity instead of cross-fading one DOM. Doubles markup, fights focus order, desyncs content.

---
