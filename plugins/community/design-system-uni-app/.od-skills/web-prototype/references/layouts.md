# Web prototype layouts

**8 paste-ready section skeletons.** Drop into `<main id="content">` of `assets/template.html`. Don't write sections from scratch — pick the closest layout, paste, swap copy.

## Pre-flight (do this once before pasting anything)

1. **Read `assets/template.html`** through the end of the `<style>` block. Every class used below must exist there. If one is missing, add it to `<style>` rather than inlining it on each section.
2. **Pick a section list before writing copy.** Default rhythms:
   - **Landing**: 1 hero → 2 features → 3 stat-row OR quote → 4 split → 6 cta-strip → footer
   - **Marketing / editorial**: 1 hero-center → 7 log-list → 4 split → 6 cta-strip
   - **Pricing / docs**: 1 hero-center → table-driven → 6 cta-strip
3. **One accent per screen, used at most twice.** The hero eyebrow and the primary button already use it; budget any third usage carefully.

## Class inventory (must exist in `template.html`)

> `section` `container` `hero` `hero-center` `hero-split` `hero-cta` `eyebrow` `lead` `h1` `h2` `h3` `meta` `num` `btn` `btn-primary` `btn-secondary` `btn-ghost` `btn-arrow` `card` `card-flat` `card-rule` `feature` `feature-mark` `stat` `stat-num` `stat-label` `stat-unit` `quote` `quote-mark` `quote-author` `pill` `tag` `field` `input` `textarea` `ds-table` `num-col` `ph-img` `square` `portrait` `wide` `rule` `rule-strong` `grid-2` `grid-3` `grid-4` `grid-2-1` `grid-1-2` `row` `row-between` `stack` `log-row` `pull` `topnav` `pagefoot`

If you reach for a class not on this list, define it in `<style>` first or use `style="…"` inline. Never invent a global class on a `<section>` that isn't backed by CSS.

---

## Layout 1 — Hero, centered

Use when the page leads with a thesis sentence (most landings, most marketing pages). One eyebrow, one h1 (≤14 words), one lead sentence, two CTAs.

```html
<section class="section hero" data-od-id="hero">
  <div class="container hero-center">
    <p class="eyebrow">EYEBROW · CONTEXT</p>
    <h1>One sharp sentence about what this is.</h1>
    <p class="lead">One concrete-value subhead — what changes for the reader.</p>
    <div class="hero-cta">
      <button class="btn btn-primary">Primary action</button>
      <button class="btn btn-secondary">Secondary</button>
    </div>
  </div>
</section>
```

## Layout 2 — Hero, split (text + visual)

Use when there is a real product visual (product UI, screenshot, photograph). Left half copy, right half a `ph-img` placeholder the user replaces.

```html
<section class="section" data-od-id="hero-split">
  <div class="container hero-split">
    <div>
      <p class="eyebrow">EYEBROW · ROLE</p>
      <h1>Headline that names the change.</h1>
      <p class="lead" style="margin-top: 20px;">A short subhead — concrete, not corporate. Two sentences max.</p>
      <div class="hero-cta" style="margin-top: 28px;">
        <button class="btn btn-primary">Primary action</button>
        <button class="btn btn-ghost btn-arrow">Read the story</button>
      </div>
    </div>
    <div class="ph-img wide" aria-label="Hero visual placeholder">[ Hero visual · 16:9 ]</div>
  </div>
</section>
```

## Layout 3 — Feature triplet

Three feature cells. Lead with a small `<h2>` framing the row. Don't put an icon on every heading — one tasteful mark per cell, monoline.

```html
<section class="section" data-od-id="features">
  <div class="container stack" style="gap: 56px;">
    <div style="max-width: 36ch;">
      <p class="eyebrow">WHAT'S DIFFERENT</p>
      <h2>Three things you'll notice in the first ten minutes.</h2>
    </div>
    <div class="grid-3">
      <div class="feature card-flat">
        <div class="feature-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v18M3 12h18"/></svg>
        </div>
        <h3>Specific feature one</h3>
        <p>Two-sentence description that names the user value, not the technology.</p>
      </div>
      <div class="feature card-flat">
        <div class="feature-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>
        </div>
        <h3>Specific feature two</h3>
        <p>Two-sentence description that names the user value, not the technology.</p>
      </div>
      <div class="feature card-flat">
        <div class="feature-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 12h10M4 17h16"/></svg>
        </div>
        <h3>Specific feature three</h3>
        <p>Two-sentence description that names the user value, not the technology.</p>
      </div>
    </div>
  </div>
</section>
```

## Layout 4 — Stat row (data billboard)

Use when there are real numbers. Three stats max — four feels like a brochure. **Don't invent metrics.** If you don't have a number, use a different layout.

```html
<section class="section" data-od-id="stats">
  <div class="container">
    <p class="eyebrow" style="margin-bottom: 40px;">BY THE NUMBERS · 2026</p>
    <div class="grid-3">
      <div class="stat">
        <div class="stat-num num">38<span class="stat-unit">×</span></div>
        <p class="stat-label">less data moved over the wire vs. naive sync, on real customer workloads.</p>
      </div>
      <div class="stat">
        <div class="stat-num num">3,184</div>
        <p class="stat-label">paying teams, including 14 of the YC W26 batch.</p>
      </div>
      <div class="stat">
        <div class="stat-num num">$0.04<span class="stat-unit">/GB</span></div>
        <p class="stat-label">average egress saved — typical $1,800/mo bill drops to $200.</p>
      </div>
    </div>
  </div>
</section>
```

## Layout 5 — Pull quote (testimonial)

A single decisive quote with attribution. Use sparingly — one per page, never two in a row.

```html
<section class="section" data-od-id="quote">
  <div class="container" style="max-width: 800px;">
    <div class="quote-mark">"</div>
    <blockquote class="quote">Filebase pays for itself in the first month. We were going to hire a dedicated DevOps person to babysit our sync — instead we just switched.</blockquote>
    <p class="quote-author">— Mira Hassan, CTO at Northwind Studios</p>
  </div>
</section>
```

## Layout 6 — CTA strip (closing)

End the page on one decisive ask. Centered, generous whitespace, one primary button. No secondary unless the page has zero other buttons.

```html
<section class="section" data-od-id="cta-strip" style="text-align: center;">
  <div class="container" style="max-width: 600px;">
    <h2>Stop measuring meetings. Start measuring focus.</h2>
    <p class="lead" style="margin: 16px auto 32px;">Free for solo. $4/mo per teammate after that.</p>
    <button class="btn btn-primary">Start free</button>
  </div>
</section>
```

## Layout 7 — Log list (changelog / blog index / posts)

Editorial layout for a list of dated entries. Date in mono on the left, title + dek in the middle, optional pull stat on the right. Borders on top, never around — boxes feel like a brochure.

```html
<section class="section" data-od-id="log">
  <div class="container">
    <div class="row-between" style="margin-bottom: 32px;">
      <h2>Recent changes</h2>
      <a class="btn btn-ghost btn-arrow" href="#">View all</a>
    </div>
    <div>
      <article class="log-row">
        <span class="meta">Apr 27, 2026</span>
        <div>
          <h3>Sync engine v3 — half the wire bytes</h3>
          <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">A new content-defined chunker that produces 38× fewer post-edit changes on Final Cut projects.</p>
        </div>
        <span class="pull meta">Engineering</span>
      </article>
      <article class="log-row">
        <span class="meta">Apr 19, 2026</span>
        <div>
          <h3>Per-folder bandwidth budgets</h3>
          <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">Cap how much a single project can pull each month — useful for archive folders.</p>
        </div>
        <span class="pull meta">Product</span>
      </article>
      <article class="log-row">
        <span class="meta">Apr 04, 2026</span>
        <div>
          <h3>S3 + R2 dual-region replication</h3>
          <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">Two providers, automatic failover. Enterprise tier only for now.</p>
        </div>
        <span class="pull meta">Infra</span>
      </article>
    </div>
  </div>
</section>
```

## Layout 8 — Comparison table (pricing, plan matrix, before/after)

Hairline borders, mono numerics, one column highlighted via an accent border. Don't put the whole row in surface-color — that screams "table".

```html
<section class="section" data-od-id="pricing">
  <div class="container">
    <div style="text-align: center; max-width: 36ch; margin: 0 auto 56px;">
      <p class="eyebrow">PRICING</p>
      <h2>One row of features. Three lines of pricing.</h2>
    </div>
    <table class="ds-table">
      <thead>
        <tr>
          <th>Feature</th>
          <th class="num-col">Solo</th>
          <th class="num-col">Team</th>
          <th class="num-col">Enterprise</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Sync engine v3</td><td class="num-col">✓</td><td class="num-col">✓</td><td class="num-col">✓</td></tr>
        <tr><td>Per-folder budgets</td><td class="num-col">—</td><td class="num-col">✓</td><td class="num-col">✓</td></tr>
        <tr><td>SAML / SCIM</td><td class="num-col">—</td><td class="num-col">—</td><td class="num-col">✓</td></tr>
        <tr><td>Dedicated infra</td><td class="num-col">—</td><td class="num-col">—</td><td class="num-col">✓</td></tr>
        <tr style="border-top: 1px solid var(--fg);">
          <td><strong>Monthly</strong></td>
          <td class="num-col"><strong>$0</strong></td>
          <td class="num-col"><strong>$4 / seat</strong></td>
          <td class="num-col"><strong>Talk to us</strong></td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

---

## Section rhythm — when in doubt

For a 5-section landing:
1. Hero (Layout 1 or 2)
2. Features (Layout 3)
3. Stats *or* quote (Layout 4 or 5)
4. Split detail (custom, using `grid-2-1` / `grid-1-2`)
5. CTA + footer (Layout 6)

For a 4-section docs/marketing index:
1. Hero center (Layout 1)
2. Log list (Layout 7)
3. CTA + footer (Layout 6)

Two stat rows in a row, two quote blocks in a row, two feature triplets in a row — all visual fatigue. Alternate.
