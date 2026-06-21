## 01 · Bento Grid

Modular blocks of varying sizes laid out as an irregular grid. Each block is a feature, a quote, an image, a stat. Visual rhythm comes from size variation, not card uniformity.

- **Heading:** centered display in a fixed-height hero (not full viewport).
- **Body:** asymmetric grid — 8–15 blocks of mixed spans (1×1, 2×1, 1×2, 2×2).
- **Divider:** consistent 12–24 px gap; no rules; the grid itself is the rhythm.
- **Button:** outlined chip on the hero; tile-internal CTAs as typographic links.
- **Image:** tightly cropped inside individual blocks; never full-bleed.
- **Reveal:** none, or a subtle one-shot fade on grid-tile entry.

Reach for it when the brief is "many small things to show", a feature page, a SaaS landing, or anywhere users have multiple equally-valid entry points.

Avoid when the message is a single hero idea — Bento spreads attention; one-idea pages need Marquee or Stat-Led.

Reference: Apple in-page sections, Framer feature pages, Tailwind UI templates.

**Sample opening lines** (imitate the *specificity*, not the wording):
> *"Tracejam · v0.4 · for SREs. Distributed tracing that explains itself."* — paraphrased from real observability tools
> *"Resend is the email API for developers. Send transactional and marketing emails at scale."* — resend.com
> *"The product development system for teams and agents."* — linear.app

```html
<header class="hero-fixed">…</header>
<section class="bento">
  <article class="cell span-2x2">…</article>  <!-- hero feature -->
  <article class="cell span-1x1">…</article>
  <article class="cell span-2x1">…</article>  <!-- wide stat -->
  <article class="cell span-1x2">…</article>  <!-- tall image -->
  <article class="cell span-1x1">…</article>
  <article class="cell span-1x1">…</article>
</section>
```

---
