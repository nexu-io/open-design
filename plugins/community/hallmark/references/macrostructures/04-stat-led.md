## 04 · Stat-Led

The hero is a giant number — a metric, a count, a percentage. Everything that follows supports or qualifies it. Data is the narrative.

- **Heading:** numeric display (8–12 rem), tabular figures, small qualifier line below.
- **Body:** sections each anchored by a supporting stat or chart.
- **Divider:** hairline rules between stat blocks; tabular-nums everywhere.
- **Button:** outlined chip aligned beneath the qualifier.
- **Image:** charts and small data-viz; no photography.
- **Reveal:** number-tick on the hero figure — counter from 0 to target over ~500 ms.

Reach for it when the brief is "we have proof in numbers" — enterprise/B2B, fundraising platforms, climate or impact pages.

Avoid for products without a defensible single metric. A fake big number is worse than no number.

Reference: Ahrefs, Stripe Sessions stat blocks, climate-impact dashboards, venture firm portfolio pages.

**Sample opening lines** (imitate the *specificity*, not the wording — the number does the work):
> *"+47% · faster · decide late."* — italicised number, three-word qualifier
> *"4 seconds. From the alert link to the slow span."* — pairs the number with what it bought
> *"434 total posts. New CSS you feel like you could use today."* — adam argyle, nerdy.dev — the count grounds the page in real volume

```html
<section class="stat-hero">
  <div class="figure tnum">99.97<span class="unit">%</span></div>
  <p class="qualifier">uptime across 2026, measured externally.</p>
  <a class="cta-outline">Read the report →</a>
</section>
<section class="supporting-stats">…</section>
```

---
