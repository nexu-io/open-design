# Macrostructures

Twenty-one named landing-page shapes. **Pick one before you write code.** Each is a complete fingerprint — heading placement, body composition, divider language, button voice, image treatment, reveal pattern — bundled as a single named choice. Picking a macrostructure is faster, less error-prone, and *categorically more varied* than choosing six independent axes from `structure.md`.

The Specimen macrostructure (left-margin numbered labels + huge serif + asymmetric spans + typographic CTA) is one of these twenty-one. **It is no longer a default.** Reach for it only when the brief is explicitly editorial, foundry-adjacent, or the user has named it.

## Diversification rule (mandatory)

Before picking, check the target codebase for a `/* Hallmark · macrostructure: <name> · ... */` comment in any existing CSS file. If you find one, **your pick must be a different macrostructure.** No two consecutive Hallmark outputs in the same project share a macrostructure.

When the brief is vague (no theme, no tone), pick from the *first ten* below before reaching for anything in 11–21. The first ten are deliberately the strongest non-Specimen shapes; they cover ~80% of briefs.

## Hero polish patterns

The hero macrostructures (Marquee Hero · Stat-Led · Quote-Led · Letter · Photographic · Clipped) admit one optional **polish pattern** on top of their base shape — HP1 Vertical-rail · HP2 Marquee-overflow · HP3 Cursor-spotlight · HP4 Decorative-numeral. Polish patterns are *structural* (layout / type / motion), not decorative; they live alongside the hero macrostructure rather than replacing it. See [`hero-enrichment.md`](hero-enrichment.md) § Hero shape polish for the catalogue + when each one fits.

A hero may carry one enrichment archetype (E1–E8) AND one polish pattern (HP1–HP4) — but never two polish patterns at once. The decision sequence is: macrostructure → enrichment? → polish? → space discipline.

## Nav and footer voice

Each macrostructure also implies a **nav archetype** (N1–N9) and a **footer archetype** (Ft1–Ft8). The defaults sit in the routing tables in [`component-cookbook.md`](component-cookbook.md) § Navigation and § Footers. Don't ship a hero macrostructure without picking nav + footer alongside — they are part of the page shape, not optional chrome.

---

## The 21 macrostructures — index

**Pick one. Then read ONLY that one file** from `references/macrostructures/`. Do not load the whole catalogue. Slugs are stable; the diversification rule reads the `<name>` from the `/* Hallmark · macrostructure: <name> · ... */` stamp.

- **01 · Bento Grid** — Modular blocks of varying sizes laid out as an irregular grid. Each block is a feature, a quote, an image, a stat. Visual rhythm comes from size variation, not card uniformity. [`macrostructures/01-bento-grid.md`](macrostructures/01-bento-grid.md)
- **02 · Long Document** — Reads like a memo, a letter, or a journal entry. No marketing structure. Continuous prose with inline section heads. The page is *literature* about the product. [`macrostructures/02-long-document.md`](macrostructures/02-long-document.md)
- **03 · Marquee Hero** — The hero IS the page above the fold. A single bold statement or visual fills the viewport. No subhead, no CTA in fold. Below the fold the page becomes something else (a list, a grid, prose). [`macrostructures/03-marquee-hero.md`](macrostructures/03-marquee-hero.md)
- **04 · Stat-Led** — The hero is a giant number — a metric, a count, a percentage. Everything that follows supports or qualifies it. Data is the narrative. [`macrostructures/04-stat-led.md`](macrostructures/04-stat-led.md)
- **05 · Workbench** — Product screenshots in frames are the primary content. The page is a guided tour of the app in use. Less marketing copy, more "here's what you do with it." [`macrostructures/05-workbench.md`](macrostructures/05-workbench.md)
- **06 · Conversational FAQ** — Bold questions, brief answers. The page reads like an honest interview with the product. Often each Q/A is a collapsible accordion. [`macrostructures/06-conversational-faq.md`](macrostructures/06-conversational-faq.md)
- **07 · Manifesto** — Polemical large type. Declaration energy. The page tells the reader what to believe before it tells them what to buy. Often political-poster aesthetic. [`macrostructures/07-manifesto.md`](macrostructures/07-manifesto.md)
- **08 · Photographic** — A single huge image dominates each fold. Text is small annotation, not headline. The design says *look* before it says *read*. [`macrostructures/08-photographic.md`](macrostructures/08-photographic.md)
- **09 · Quote-Led** — The hero is a pull-quote with attribution. The headline is borrowed credibility, not the brand's voice. The page leads with social proof. [`macrostructures/09-quote-led.md`](macrostructures/09-quote-led.md)
- **10 · Specimen** — Numbered left-margin labels, huge serif display, asymmetric column spans, hairline rules, typographic-only CTA, generous whitespace. Editorial / type-foundry energy. [`macrostructures/10-specimen.md`](macrostructures/10-specimen.md)
- **11 · Catalogue** — Uniform grid of variations of the same thing — typefaces, colour palettes, product SKUs. The page is a visual index of inventory. [`macrostructures/11-catalogue.md`](macrostructures/11-catalogue.md)
- **12 · Letter** — First-person, written, intimate. Opens with a greeting ("Dear friend,"). No buttons in the fold. Reads as a personal note from the founder. [`macrostructures/12-letter.md`](macrostructures/12-letter.md)
- **13 · Index-First** — The page IS a list of links. No hero image, no narrative flow. Pure navigation as design. [`macrostructures/13-index-first.md`](macrostructures/13-index-first.md)
- **14 · Narrative Workflow** — Numbered stages tell the story of how the user uses the product over time. Each section is a phase (1.0 → 2.0 → 3.0 → 4.0). The page is a process timeline. [`macrostructures/14-narrative-workflow.md`](macrostructures/14-narrative-workflow.md)
- **15 · Split Studio** — Diptych. Every major content block divides the screen — text on one side, proof on the other. The pairing alternates direction down the page. [`macrostructures/15-split-studio.md`](macrostructures/15-split-studio.md)
- **16 · Feature Stack** — Sticky left pane (label / description) + scroll-synced right pane (screenshots cycling through related details). Cinematic pacing. [`macrostructures/16-feature-stack.md`](macrostructures/16-feature-stack.md)
- **17 · Type Specimen** — The typeface IS the design. Foundry homepage or design-system marketing where a custom typeface is the brand's proof. [`macrostructures/17-type-specimen.md`](macrostructures/17-type-specimen.md)
- **18 · Portfolio Grid** — Filterable cards of projects. Studio or designer homepages where the work is the product. [`macrostructures/18-portfolio-grid.md`](macrostructures/18-portfolio-grid.md)
- **19 · Map / Diagram** — A single large spatial diagram organises the page — flowchart, floor plan, network graph, system map. Information is laid out *spatially*, not linearly. [`macrostructures/19-map-diagram.md`](macrostructures/19-map-diagram.md)
- **20 · Ecosystem Index** — Multiple discovery surfaces — featured / latest / by category / by people. The platform's value is emergence and browsing, not declaration. [`macrostructures/20-ecosystem-index.md`](macrostructures/20-ecosystem-index.md)
- **21 · Component Playground** — Interactive code-and-preview blocks are the page's primary content. Each block previews a thing and shows how to copy-paste it. [`macrostructures/21-component-playground.md`](macrostructures/21-component-playground.md)

---

## SaaS page sequence

When the macrostructure is **Bento Grid · Stat-Led · Workbench · Marquee Hero** and the brief is a B2B SaaS marketing page, ship these sections in roughly this order. None are mandatory — but skipping more than two reads as "the page is incomplete":

1. **Hero** — macrostructure-specific (Bento, Stat, Workbench, Marquee). Two CTAs (primary action + secondary "Talk to sales").
2. **Social proof / logo wall** — 6–8 customer logos in monochrome. (See [`assets.md` § Logo walls](assets.md).)
3. **Features** — 3–6 feature cards, varies by macrostructure (Bento has them inline; Stat-Led usually puts them after the supporting-stats grid).
4. **Testimonials** — 2–4 quote cards. Pull-quote + name + role + company. Photo optional. Avoid "We use [product] every day" language; the quote should be specific to a use case ("Foundry got us SOC2 in five weeks. We wrote zero policies ourselves.").
5. **Pricing** — 2–3 tiers in a comparison table. Feature checklist per tier. Recommended-tier badge on the middle tier. Show the actual price; "Contact sales for pricing" on every tier is a tell that the brand doesn't trust the buyer.
6. **FAQ** — 5–10 questions. Conversational FAQ archetype works here (see Macrostructure 9).
7. **Final CTA strip** — single button + one-sentence prompt.
8. **Footer** — index-style or tabular, theme-appropriate.

Each section transition uses theme-appropriate vertical spacing — `--space-3xl` minimum between major sections. Don't subdivide sections into "rows" with sub-rules — the section break is the visual rhythm.

**Voice rules for SaaS sections:**

- **Pricing:** show the actual price. Sales-led pricing on every tier ("Contact us") signals the brand doesn't trust the buyer.
- **Testimonials:** include the quoted person's role *and* company. Abstract "Engineering Manager" testimonials are slop. If the brief is a real product, use real names. If the brief is a placeholder, use plausible names — never "Jane Doe" / "John Smith" (gate 20).
- **FAQ:** answer like a person, not a sales doc. "Yes — Stripe and Adyen are both supported out of the box" beats "Our platform integrates with leading payment providers."
- **CTA strip:** one button. Not two. The repetition is the call to action.

This sequence is **not** a template you stamp out — it's a recipe of *what should be present*. The macrostructure determines *how* each section looks. A Bento Grid page interleaves features and proof inside the grid; a Stat-Led page sequences them top-to-bottom; a Marquee Hero page lets the marquee do the social-proof work.

For non-SaaS work (Editorial, Manifesto, Letter, Long Document, Quote-Led), this sequence does **not** apply. A bakery does not need a pricing tier comparison.

---

## How to pick

1. **Read the brief.** Note any words that strongly signal one macrostructure ("data heavy", "tell a story", "a list of links", "many small features", "personal note").
2. **Check the codebase** for an existing `/* Hallmark · macrostructure: <name> · ... */` stamp. If found, exclude that name from your choices.
3. **Match brief energy to a macrostructure** using the "Reach for it" lines. Most briefs match 2–4 of these patterns; pick the one that's most categorically distant from any past output for this user.
4. **State your pick** in plain text *before* writing code: "Macrostructure: Bento Grid." Then write the code, opening the CSS with the required stamp.
5. If genuinely torn, offer the user three choices from *different categories* (e.g. Bento + Long Document + Manifesto) and let them pick.

The goal is not novelty for its own sake. The goal is that two pages Hallmark builds for two different briefs *look like different sites, not different colour-swaps of the same template*.
