### Ft8 · Marquee scroll
A horizontal infinite-scroll line of repeating tagline + dot separator: `STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 ·`. Sport-genre sites, fashion lookbooks, brand-forward agencies.
*Use when:* the brand voice is loud, kinetic, sport-or-manifesto.
*Don't confuse with:* Ft4 Dense colophon (which is static text).

```html
<footer class="foot-marquee" aria-label="Footer">
  <div class="foot-marquee__track" aria-hidden="true">
    <span>STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 ·</span>
    <span>STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 ·</span>
  </div>
  <p class="visually-hidden">Studio · 2026 · MIT licensed</p>
</footer>
```
```css
.foot-marquee { overflow: hidden; border-top: 2px solid var(--color-ink); }
.foot-marquee__track { display: flex; gap: var(--space-2xl); white-space: nowrap; padding-block: var(--space-md); animation: foot-marquee 32s linear infinite; }
.foot-marquee__track span { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.08em; font-size: clamp(1rem, 2.5vw, 1.5rem); }
@keyframes foot-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .foot-marquee__track { animation: none; } }
```

*Anti-pattern:* using Ft8 on editorial / quiet contexts — the motion reads as loud. Pair only with playful / sport / manifesto voices, and always honour `prefers-reduced-motion: reduce`.

---
