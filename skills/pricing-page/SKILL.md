---
name: pricing-page
description: |
  A standalone pricing page — header, plan tiers, feature comparison table,
  and an FAQ. Use when the brief asks for "pricing", "plans",
  "subscription tiers", or a "compare plans" page.
triggers:
  - "pricing"
  - "pricing page"
  - "plans"
  - "subscription"
  - "compare plans"
  - "定价"
  - "套餐"
od:
  mode: prototype
  platform: desktop
  scenario: sales
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
---

# Pricing Page Skill

Produce a single-screen pricing page that respects the active DESIGN.md.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use only its colors, type
   tokens, and component patterns.
2. **Classify** the product from the brief and pick a tier shape:
   - 3-tier (most common): Free / Pro / Team or Starter / Growth / Enterprise.
   - 4-tier when the brief says "scale" or "enterprise plus".
   - 2-tier when it says "individual / business" or "personal / pro".
3. **Sections**, in order:
   1. **Hero** — page title (e.g. "Pricing"), one-line subhead, optional
      monthly/annual toggle.
   2. **Plan cards** — one card per tier. Each card: tier name, price (use the
      display font + larger scale for the number), 1-line positioning, 4–6
      bullet features, primary CTA. Mark the recommended tier with the DS
      accent border or a small badge.
   3. **Comparison table** — feature rows × tier columns, ✓ / — / value cells.
      Group features into 2–3 logical sections (Core, Collaboration,
      Support, Security…). Sticky header.
   4. **FAQ** — 4–6 collapsible Q&A items. Use `<details><summary>` for the
      collapse — no JS.
   5. **Footer CTA** — single line + button, accent band sparingly.
4. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>`.
   - CSS Grid for the plan-card row; CSS Grid for the comparison table.
   - `data-od-id` on each tier card and each table row.
5. **Money rendering**: use the display font for the big number, body for the
   currency and "/mo" — sizes per DESIGN.md scale.
6. **Self-check**:
   - Prices are plausible for the product (not "$X / month").
   - Accent is on the recommended tier and one CTA only.
   - Comparison table renders cleanly at 1024px and stacks readably below
     768px (rotate column headers or scroll-x).
   - No fake feature names — every row reads as something a real product
     would actually offer.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="pricing-slug" type="text/html" title="Pricing — Product Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
