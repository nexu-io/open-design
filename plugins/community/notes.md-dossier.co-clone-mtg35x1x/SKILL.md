# NOTES.md — dossier.co clone

## Source

- **Site:** https://dossier.co/ — Shopify DTC perfumery ("Made in France perfumes, fair-prices")
- **Recon date:** 2026-08-30 · Evidence: `RECON/live-extract.md` (SOURCE/GUESS graded)
- **License:** commercial site, no source published — clone is clean-room HTML for local
  design study only. Do **not** redeploy publicly. Trademark/product names belong to
  dossier and the referenced designer houses.

## Environment constraints (why this is not a byte-faithful mirror)

| Skill requirement | Status | Reason |
|---|---|---|
| `recon-site.mjs` probe (frameworks, palette, fonts) | ❌ not run | terminal capability unavailable in this session |
| `asset-harvest.mjs` (self-hosted fonts, local images) | ❌ not run | no terminal / no binary download path |
| Real computed colors | ❌ unavailable | FetchURL returns extracted text only (raw HTML/CSS/JSON unobtainable) |
| Real imagery | ❌ unavailable | no asset URLs discoverable without raw HTML |
| Content, IA, copy, nav structure | ✅ SOURCE-grade | live site + archive.org snapshot text |

Verdict per skill discipline: **内容/结构忠实复刻，视觉为有据近似（GUESS）**。
Nothing visual was faked as "real": placeholders are labeled, tokens are flagged in
`brand-spec.md`, and the legal line in the footer discloses the clone.

## Complexity & mode

- **Level:** L3 — content-driven Shopify storefront, mega-nav, carousels, campaign hero.
- **Mode:** 忠实复刻 (content/structure) with honestly-labeled visual approximation.

## What was cloned

### Pass 2 — full site (this update)

Sub-page recon (FetchURL text extracts, 2026-08-30) added SOURCE-grade content for
`/collections/all`, `/products/ambery-saffron`, `/products/ambery-vanilla`,
`/blogs/news`, `/pages/about-us`, `/pages/dossier-plus`, `/pages/contact`,
`/pages/store-locator` — evidence in `RECON/subpages-extract.md`.

Shared layer (all sub-pages bind the same tokens as index.html):
- `assets/site.css` — design system (tokens verbatim from brand-spec.md) + chrome +
  cards/rails/forms/accordion/tables
- `assets/catalog.js` — 24-product catalog + 4 articles; provenance flagged per field
  (VERIFIED vs GUESS; no invented ratings — only ambery-saffron carries the real
  4.3/13,354 + 5 verbatim reviews)
- `assets/site.js` — injects announce/header/footer/cart/search/mnav on every page;
  shared cart (`dossier-cart` localStorage, supports `id@size` keys: 50ml/100ml/
  50ml+11ml/11ml)

Pages:
1. `shop-all.html` — 13 collections via `?c=` (all/women/men/unisex/bestsellers/new/
   best-offers/event/home/candles/diffusers/originals/impressions) + `?q=` text filter;
   working filter sidebar (gender/family/intensity/type/price slider, verbatim
   taxonomy), sort, result counts, retail-availability strip
2. `product.html?p=<slug>` — full PDP: gallery w/ thumbs, member/guest pricing,
   retail comparison, size pills (ambery-saffron 100ml = OUT OF STOCK, verified),
   qty stepper, notes pyramid + ingredients accordions (verbatim labels), badges,
   real review list w/ brand replies + helpfulness votes + sort, related rail
3. `blog.html` + `article.html?a=<slug>` — index (category filter, featured card)
   and 4 articles (3 verbatim excerpts from recon + 1 from about-page copy)
4. `about.html` — creative lab, 10 verbatim awards, risk-free Order/Try/Decide,
   full house timeline (Grasse founding → Impressions → Originals → Home → 2025
   boutiques at 242 Elizabeth St + Queens Center Mall)
5. `dossier-plus.html` — verbatim 9-row comparison table, benefit cards, join form,
   refer-a-friend (clipboard), membership FAQ
6. `scent-finder.html` — 4-step quiz → rule-based matching (labeled as such), relaxed
   filters are disclosed
7. `mini-set.html` — build-a-set with 3+/6+ tier progress (25%/40% off, verbatim
   archive promo), live totals, adds 11ml minis to the shared cart
8. `stores.html` — both boutiques (verbatim addresses), 4 retail partners, verbatim
   availability disclaimer, honest static zip checker
9. `contact.html` — verbatim copy + help@dossier.co, validating form, success state
10. `account.html` — (Pass 3) login/register with client-side demo auth
    (`dossier-users`/`dossier-session` localStorage, btoa-obfuscated, labeled demo),
    dashboard: order history (honest empty state — no checkout in clone), account
    details + default address editing, Dossier+ status, sign out. Header account
    icon + footer/mobile "My Account" links wired site-wide

`index.html` was re-wired: every nav/footer/cloud/CTA link now routes to the real
pages, and homepage cards/search results link through to the PDPs.

### Pass 1 — homepage (index.html, self-contained)

1. Rotating announcement bar (3 real promo messages) with dot indicator
2. Sticky header — serif wordmark, 8-item mega nav with the real menu tree
   (Shop by Gender / The Edits / By Theme / Join the Club / Who We Are), search/account/cart
3. Current campaign hero — "Madelyn Cline. Four Moods. One Vanilla.", live countdown
   (days/hours/minutes), waitlist form → real success copy ("You're on the list!…")
4. "Our latest drops" rail — 4 products incl. Vanilla Expressions ×2, Stronger With You
   Intensely, Rare Beauty's Rare
5. Dossier Impressions / Dossier Originals split banner (light/dark)
6. Women / Men / Unisex tiles
7. "Featured perfumes crafted in France" rail — 6 products (BR540, mgk, Love Don't Be
   Shy, Black Opium, Wellness, Icons)
8. Boutiques banner (dark, ghost CTA)
9. Brand statement + "High standards & non-toxic" promise (verbatim copy)
10. Footer — newsletter, 4 link columns, verbatim 18-link "Inspired by" cloud
11. Working interactions: cart drawer (qty/remove/subtotal, localStorage-persisted),
    live search overlay, mobile nav drawer, Esc/overlay close, rail arrows

## Fidelity scorecard (self-assessed, evidence in file)

- Structure / IA: **9/10** homepage, **8/10** sub-pages — every homepage section plus
  all primary nav destinations now exist; sub-page layouts follow the recon text
  structure but original wireframe order is unverifiable without raw HTML
- Copy: **9/10** — verbatim where recon captured it (PDP, Dossier+ table, about,
  contact, blog excerpts); connective lines authored and flagged
- Visual: **5/10** — direction (monochrome editorial, serif display) is brand-consistent
  but fonts/colors are documented stand-ins, not recon-verified values
- Imagery: **1/10** — labeled placeholders only (hard environment blocker)
- Interaction: **8/10** — filters/sort/PDP/quiz/builder/cart all work client-side;
  hover/scroll micro-motion of the original unverifiable
- Responsive: **8/10** — 1120px/720px breakpoints, drawer nav, no horizontal scroll
- Data honesty: **9/10** — no invented ratings/reviews; unverifiable numbers omitted
  with labeled notes instead of fabricated

## Replacement checklist (before any real use)

1. Run `recon-site.mjs` + `asset-harvest.mjs` once a terminal is available; replace
   `brand-spec.md` tokens with computed values and `Newsreader/Archivo` with the real
   self-hosted fonts (`assets/fonts/fonts.css`).
2. Drop real product/campaign photography into the `.tile`/`.ph` slots
   (manifest-driven swap; placeholders are captioned for mapping).
3. Verify per-product prices against live product pages (only ambery-saffron's
   $79/$71.10 is verified; everything else is the public "from $29–$141" anchor).
4. Re-crawl remaining routes (gift sets, layering, individual blog articles beyond
   the 3 listed, full review streams) with `route-crawl.mjs`.
5. Re-run `audit-clone.mjs --recon --strict` and `compare-recon.mjs` for a real score.

## Run

Open `index.html` directly, or serve statically. No build, no tracking scripts
(clean-room files — nothing to strip), no external calls except Google Fonts.
All pages must be opened over the same folder root (relative `assets/` links).

## Provenance

Formalized by OpenDesign from candidate 5cc57df6-886e-4b22-b1e2-2f25aaf19817.
