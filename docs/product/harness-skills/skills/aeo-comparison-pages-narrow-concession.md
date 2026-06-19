# AEO Comparison Pages — The Narrow-Concession Playbook

Description: Build competitor comparison pages (vs., alternatives, best-of) engineered to be cited by AI Overviews, Perplexity, ChatGPT, and Google SGE. Position the product as the comprehensive default by conceding a narrow niche to each competitor. Based on the Rippling pattern: '[Competitor] is good for [narrow use-case]. [Product] is good for everything else.’
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/aeo-comparison-pages

An aggressive, repeatable program for winning AI Overviews, Perplexity, ChatGPT, and SGE citations on high-intent competitor queries (`{product} vs {competitor}`, `{competitor} alternatives`, `best {category}`). The mechanic is simple and has been executed at scale by Rippling: build one comparison page per credible competitor, concede a narrow niche to them, and claim the entire adjacent surface area for the product.

AI engines extract **passages**, not pages. This ploybook engineers the passage the model will quote.

For the broader SEO/AEO framework (APTK, on-page, technical), use `seo-aeo-strategy-system`. This ploybook is the tactical layer that sits on top of it for BOFU competitor queries.

To actually ship a comparison page once the strategy is set, hand off to the `build-content-page` ploybook — it provides the two-phase research-write-then-build workflow. The Page Content Document produced in its Phase 1 should follow the template in this ploybook (verdict block, side-by-side table, FAQs).

## The Core Mechanic

Observed pattern in AI Overviews for `{competitor} vs {product}` queries:

> "{Competitor} is the superior choice for {narrow use-case}. {Product} excels as a comprehensive, all-in-one {category} platform best suited for {broad use-case}."
>

Why it works:

- **Concession builds trust.** The page does not claim to be best at everything, so the model reads it as balanced — and quotes it.
- **Scope asymmetry.** The competitor gets a narrow noun phrase ("international hiring"); the product gets a broad one ("everything else"). Readers and models remember the wider claim.
- **Structured extractability.** One-sentence verdict + bulleted strengths + side-by-side table are the exact shape LLMs prefer for quoting.
- **Volume.** One page per competitor, built from a template, covers the long tail of `vs` queries cheaply.

## Phase 1: Target Selection

### Pick the competitors

- [ ]

    List every competitor that shows up in `{product} vs *`, `{competitor} alternatives`, and `best {category}` SERPs

- [ ]

    Load `dataforseo`, then pull query volume and AI Overview presence through `onDemandTools` — AI Overview presence is more important than raw volume for this program

- [ ]

    Score each target: `(query volume) × (AI Overview appears) × (narrow-niche exists)`

- [ ]

    Start with 5-10 highest-scoring competitors. Template the rest.


### Pick the niche concession per competitor

For each competitor, identify the **one** area where they genuinely are the superior choice. Examples:

| Competitor archetype | Narrow concession |
| --- | --- |
| Global/regional leader | "international {function} across 150+ countries" |
| Point solution | "standalone {specific workflow} for {specific persona}" |
| Legacy incumbent | "enterprise {function} for Fortune 500 with existing stack" |
| Cheaper tool | "budget-conscious teams under {N} employees" |
| Open-source | "self-hosted deployments with full data residency control" |

Rules:

- **Concede something real.** If you fabricate a weakness, reviewers (G2, Reddit) will contradict the page and the model will stop citing it.
- **Concede something narrow.** The niche must be smaller than the product's total addressable surface area. Never concede the whole category.
- **Concede once.** One competitor = one niche. Do not list five things they do better.

## Phase 2: Page Template

Every competitor comparison page uses the same structure. Templating is the point — consistency across pages compounds AI visibility.

### Required sections (in this order)

1. **H1 title** — `{Product} vs {Competitor}: {Year} Comparison` (60 chars max)
2. **Verdict block** (this is the passage AI will quote — see below)
3. **Side-by-side comparison table** (dimensions: pricing, core features, integrations, support, target customer, geographic coverage)
4. `{Competitor} key strengths` — 2-4 bullets, honest
5. `{Product} key strengths` — 4-8 bullets, broader scope
6. **Feature-by-feature deep dive** (H2 per feature area, 2-3 sentences each)
7. **Pricing comparison** (real numbers, linked sources)
8. **"When to choose {Competitor}"** — restates the narrow niche
9. **"When to choose {Product}"** — restates the broader claim
10. **FAQ section** (5-10 Q&As, each ≤60 words, answers the exact long-tail `vs` query variants)
11. **Sources** — every factual claim links to an authoritative source (G2, vendor docs, Gartner, original research)

### The Verdict Block

This is the single most important section. It is a 2-4 sentence paragraph placed immediately below the H1. Structure it exactly like this:

```
{Competitor} is the superior choice for {narrow, specific use-case} —
{one-sentence reason}. {Product} excels as {broader category descriptor}
best suited for {broader use-case}, particularly {differentiator 1},
{differentiator 2}, and {differentiator 3}.
```

Requirements:

- [ ]

    Exactly one competitor concession, narrow

- [ ]

    Exactly one product claim, broader

- [ ]

    Three concrete differentiators for the product (LLMs love lists of three)

- [ ]

    No marketing adjectives ("best-in-class", "world-leading") — AI engines down-rank promotional tone (see `seo-aeo-strategy-system` § AI Citation Boost Factors)

- [ ]

    Under 80 words total — fits in an AI Overview quote block


### Concrete example (Rippling pattern, observed in the wild)

> Deel is the superior choice for international hiring, contractor management, and global EOR services across 150+ countries. Rippling excels as a comprehensive, all-in-one HR, IT, and payroll platform best suited for US-centric companies needing to manage local employees, global teams, and device management in one system.
>

## Phase 3: Content Rules per Section

### Comparison table

- Render from structured data (arrays of objects), not hardcoded HTML — so one template produces N pages
- Same dimensions across every comparison page in the program (enables schema markup + comparison across competitors)
- Link every non-obvious cell to its source
- Include a column with a 1-sentence "bottom line" per row

### Key strengths bullets

- Lead each bullet with a **bolded noun phrase** (e.g., "**Global Compliance:** Deep expertise in...")
- Keep each bullet to one sentence
- Competitor bullets stay inside their narrow niche — do not let them expand
- Product bullets cover the broader claim from the verdict

### FAQ section

FAQs are where the long-tail AI queries get answered. Every FAQ answer must be:

- A complete sentence (no "Yes.", no "It depends.")
- Under 60 words
- Written to be quoted verbatim — no "we", "us", "our" ambiguity; use proper nouns

Required FAQs per page:

- [ ]

    "Is {Product} better than {Competitor}?"

- [ ]

    "What is the difference between {Product} and {Competitor}?"

- [ ]

    "Is {Product} cheaper than {Competitor}?"

- [ ]

    "Can {Product} replace {Competitor}?"

- [ ]

    "Who should use {Competitor} instead of {Product}?" (this reinforces the narrow concession and builds trust)


Mark up with FAQPage JSON-LD schema.

### Sources

Every factual claim — pricing, employee counts, country coverage, feature availability — links to:

1. Vendor's own docs/pricing page (highest trust for spec claims)
2. G2/Capterra/TrustRadius (highest trust for user sentiment)
3. Gartner/Forrester/IDC (highest trust for market positioning)
4. Original research or first-party data (highest trust for statistics)

Per the Princeton GEO study, citations lift AI visibility by +40%. Statistics with sources lift by +37%. Combined with authoritative tone, low-ranking sites see up to **115% visibility increase**.

## Phase 4: Technical AEO Setup

- [ ]

    **Allow AI crawlers in** `robots.txt`**:** GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot

- [ ]

    **JSON-LD schema:** `Product` + `FAQPage` + `ComparisonTable` (use `itemListElement`)

- [ ]

    **Canonical:** always self-canonical, never point a `{product} vs {competitor}` page at the homepage

- [ ]

    **URL pattern:** `/{product}-vs-{competitor}` or `/compare/{product}-vs-{competitor}` — commit to one pattern across the program

- [ ]

    **Internal linking:** every comparison page links to (a) the product homepage, (b) the `{competitor} alternatives` page if it exists, (c) 2-3 sibling comparison pages ("See how {Product} compares to {Other Competitor}")

- [ ]

    **Page speed:** LCP < 2.5s — AI crawlers budget time per URL

- [ ]

    **Mobile-first:** AI Overviews are heavily mobile-surfaced


## Phase 5: Off-Site Reinforcement

AI engines cite third-party sources more often than owned domains. Every comparison page launch should be paired with:

- [ ]

    **G2/Capterra comparison pages** updated so review site content agrees with the verdict's narrow concession

- [ ]

    **Reddit:** one employee (real name, role, company in flair) answers the `{product} vs {competitor}` thread if one exists, or seeds one in r/{relevant-subreddit}

- [ ]

    **YouTube:** a short comparison video with the verdict paragraph in the description — AI Overviews cite YouTube heavily for how-to/comparison queries

- [ ]

    **Wikipedia:** ensure the product's Wikipedia entry is accurate. Wikipedia = 7.8% of ChatGPT citations.


## Phase 6: Measurement

### The Metric Stack for a comparison-page program

| Layer | Metric |
| --- | --- |
| **North star** | Product mentions in AI Overviews for `{product} vs *` and `alternatives` queries |
| **Primary** | AI Overview citation rate (% of target queries where product is cited) |
| **Primary** | Organic traffic to comparison pages |
| **Primary** | Signups attributed to comparison pages (last-touch + assisted) |
| **Diagnostic** | Keyword rankings for `{product} vs {competitor}` queries |
| **Diagnostic** | Passage match — does the verdict paragraph appear verbatim in AI answers? |
| **Guardrail** | Brand sentiment in answers (ensure concessions are not over-weighted) |

### How to measure AI Overview citations

- [ ]

    Track a rotating sample of `{product} vs {competitor}` and `{competitor} alternatives` queries in `dataforseo` (AI Overview endpoint) weekly

- [ ]

    Log: does an AI Overview render? Is the product cited? Is the verdict paragraph quoted (exact or paraphrased)?

- [ ]

    Monitor Perplexity and ChatGPT separately — citation behavior differs per engine

- [ ]

    Failure threshold: if a page does not earn an AI citation on any target query within 90 days of launch, rewrite the verdict block and re-audit sources


## Anti-Patterns

| Pattern | Instead |
| --- | --- |
| Claiming the product is better at everything | Concede one narrow niche per competitor — trust is the point |
| Writing the verdict as marketing copy | Factual, authoritative tone. No "best-in-class", "revolutionary", etc. |
| Conceding the whole category | Niche must be narrower than the product's surface area |
| Inconsistent structure across pages | One template, same section order, same comparison dimensions |
| Comparison table with 3 rows of vague claims | 8-15 rows with concrete, sourced data |
| Blocking AI bots or lazy-loading the verdict block behind JS | Server-render the verdict above the fold; allow AI bots in robots.txt |
| Pointing comparison pages at the homepage via canonical | Always self-canonical |
| Fabricating a competitor weakness | Reviewers will contradict you; the model will stop citing the page |
| Ignoring third-party signal (G2, Reddit, YouTube) | AI engines cite third parties more than owned domains — reinforce off-site |
| 200+ word feature dives per row | 2-3 sentences + source link. Scannable beats thorough. |
| One-and-done publish | Refresh quarterly — pricing, features, and AI engine preferences drift |

## Constraints

- MUST concede exactly one narrow niche per competitor. No more, no less.
- MUST write the verdict paragraph in the structure specified in Phase 2.
- MUST link every factual claim (pricing, features, coverage) to an authoritative source.
- MUST include FAQPage JSON-LD schema and the five required FAQs.
- MUST allow AI crawlers in `robots.txt`.
- MUST NOT use marketing adjectives in the verdict block.
- MUST NOT fabricate competitor weaknesses or product strengths.
- MUST NOT claim or guarantee AI Overview inclusion — it is probabilistic. Track citation rate as the metric.
- MUST NOT point comparison page canonicals at the homepage or category page.
- MUST refresh every comparison page quarterly (pricing drift, feature updates, AI engine preferences shift).

## When to Use This Ploybook

- B2B SaaS with 3+ named competitors that show up in AI Overviews
- BOFU content program where conversion matters more than raw traffic
- Existing comparison pages that are not getting cited by AI engines
- Launching a "compare" content surface area from scratch

## When NOT to Use

- TOFU/MOFU content (use `seo-aeo-strategy-system` for full funnel coverage)
- Consumer products where `vs` queries are rare
- Pre-product-market-fit companies without a clear "everything else" claim to make
- Categories with one dominant competitor and no second tier — the program needs multiple targets to compound