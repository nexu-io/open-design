# GSC Keyword Optimization

Description: Find keywords that are already earning impressions for a page in Google Search Console but are missing from the page's content, then weave them in to lift CTR and rankings. Uses the connected GSC integration directly — no CSV export needed. Requires Google Search Console to be connected in workspace settings. Adapted from @hridoyreh (https://x.com/hridoyreh).
Tag: content-optimization, ctr, google-search-console, gsc, integration-gsc-required, keyword-optimization, on-page-seo, search-analytics, seo
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/gsc-keyword-optimization

# GSC Keyword Optimization

Find search queries that are already earning impressions for a specific page but aren't mentioned in the page content — then weave them in so the page starts converting those impressions into clicks. This is a pure upside play: Google already thinks the page is relevant; we just need to make that relevance explicit.

Credit: the underlying approach is adapted from [@hridoyreh on X](https://x.com/hridoyreh) (GSC → identify high-impression keywords missing from content → add them to existing content). This Ploybook queries GSC directly via the connected integration instead of exporting CSVs by hand.

**Scope:** This Ploybook is a focused, single-page play — fast, surgical, schedulable. For full multi-page SEO engagements (audience/product strategy, topic clustering, technical audits, competitive benchmarking, AEO), use the `seo-aeo-strategy-system` Ploybook instead.

---

## Phase 0: Preflight — Verify GSC Is Connected

**This Ploybook requires the Google Search Console integration. Do not skip this phase. If GSC is not connected, stop immediately — do not attempt to continue with alternative data sources.**

- [ ]

    Load `gsc` with `onDemandTools({ action: "load", tools: ["gsc"] })`, then execute `onDemandTools({ action: "execute", tool: "gsc", input: { action: "checkConnection" } })` before anything else. This is non-negotiable — every downstream phase depends on real GSC data.

- [ ]

    If the tool returns `success: false` with error `INTEGRATION_NOT_CONNECTED`, `GSC_NOT_CONNECTED`, or `GSC_NO_SITE`: **halt immediately**. Do not query GA4, do not web-scrape, do not ask for a CSV. Tell the user exactly one thing:

    > "I can't run this Ploybook yet — Google Search Console isn't connected for this workspace. Connect it in **Workspace Settings → Integrations → Google Search Console**, select the site that matches the page you want to optimize, then re-run this Ploybook."
    >

    Then stop. Do not proceed to Phase 1 under any circumstances.

- [ ]

    If `checkConnection` succeeds, record the returned `siteUrl` — you'll need it to validate that the target page belongs to this GSC property. If the user later asks you to optimize a page on a different domain, stop and ask them to connect/select the correct GSC site.

- [ ]

    Use the `gsc` guide returned by `onDemandTools(action: "load")` for dimension reference and query shapes before running search analytics queries.


### Output of Phase 0

Either: a confirmed `siteUrl` matching the user's target domain, and you proceed. Or: a halt with the message above — no further phases run.

---

## Phase 1: Identify the Target Page

- [ ]

    Confirm the exact page URL to optimize. If the user hasn't named one, ask. Do not guess based on "our homepage" or "our pricing page" — you need the canonical URL because GSC is URL-exact.

- [ ]

    Verify the page URL's origin matches the `siteUrl` from Phase 0 (accounting for `sc-domain:` vs `https://` GSC property formats). If it doesn't match, halt and ask the user to either correct the URL or reconnect GSC with the right property.


---

## Phase 2: Pull Keyword Data for That Page

Query GSC for the last 90 days of performance, filtered to the target page, grouped by query.

- [ ]

    Compute `endDate` as today and `startDate` as 90 days ago (both `YYYY-MM-DD`). Never hardcode dates.

- [ ]

    Execute `onDemandTools({ action: "execute", tool: "gsc", input: { action: "searchAnalytics", dimensions: ["query", "page"], startDate, endDate, rowLimit: 1000 } })`.

- [ ]

    From the returned rows, keep only those where the `page` dimension equals the target URL. If zero rows remain, the page has insufficient search data — tell the user the page needs more time or more indexed traffic before this Ploybook can help, and stop.

- [ ]

    If fewer than ~20 query rows remain, warn the user the signal is thin and proceed with reduced confidence.


### Why 90 days

Shorter windows are noisy (seasonality, algorithm fluctuations); longer windows dilute recent intent shifts. 90 days is the same window the source workflow uses and matches GSC's default Performance view.

---

## Phase 3: Read the Current Page Content

Before you can say a keyword is "missing," you need to know what's actually on the page.

- [ ]

    Find the page in the workspace. Try `documents({ action: "list" })` and `site({ action: "pages" })` (or equivalent page/site tools available in this workspace) to locate the source file(s) for the target URL.

- [ ]

    If the page lives in the workspace, read its full rendered text content — headings, body copy, meta title, meta description, alt text, FAQ answers. Merge into one normalized, lowercased text blob for matching.

- [ ]

    If the page is **not** in the workspace (external site not cloned/imported), use `web({ action: "extract", url })` on the target URL to pull the rendered content. Note this in your final report so the user knows recommendations were based on the live HTML, not the source files.


---

## Phase 4: Find the Gap — High-Impression Keywords Missing From Content

This is the core analysis. For each GSC query row from Phase 2, decide whether the page already uses that keyword.

- [ ]

    Normalize both the GSC query and the page text: lowercase, collapse whitespace, strip punctuation. Do not stem aggressively — Google treats "pricing" and "price" as related but distinct in rankings, and so should you.

- [ ]

    A query is **missing** if none of its significant terms (non-stopwords, ≥3 chars) appear in the page text. A query is **partially present** if some terms appear but the full phrase doesn't. A query is **present** if the full phrase (or a near-identical variant) is in the page.

- [ ]

    Build the opportunity list: queries that are **missing** or **partially present**, sorted by `impressions` descending. Keep the top 10-15 for the report.

- [ ]

    For each opportunity, record: `keyword`, `impressions`, `ctr`, `position`, `gap type` (missing | partial), and a one-line rationale for why it's a good addition (search intent match, topical adjacency, commercial value).

- [ ]

    Drop opportunities that are clearly irrelevant to the page's topic (branded queries for other companies, off-topic long-tail, etc.). The goal is lift, not keyword stuffing — do not recommend terms that would force the page off-topic.


### Why "impressions but no clicks"

These are the highest-leverage wins in SEO. Google is already ranking the page for the term (impressions > 0), but users either don't see the keyword in the snippet (low CTR) or the page's relevance signal is weak (poor position). Adding the keyword to title, headings, and body directly addresses both.

---

## Phase 5: Recommend Content Edits

Translate the opportunity list into concrete, surgical edits. Do not rewrite the whole page.

- [ ]

    Load the `copywrite` skill (`skill({ name: "copywrite" })`) if you're going to propose or draft new copy.

- [ ]

    For each top opportunity, recommend **one** of: update the `<title>` / `<h1>`, add an `<h2>` or section header, add a sentence to an existing paragraph, add an FAQ item, or update the meta description. Prefer the highest-visibility placement the keyword naturally fits.

- [ ]

    If the user has given you edit authority, apply the changes with `documents({ action: "write" })` (or the appropriate page/site edit tool for this workspace) — otherwise, save the recommendations as a report (see Phase 6) and wait for approval.

- [ ]

    Respect the page's existing voice, structure, and brand. Weave keywords in; do not bolt on awkward phrasings. If a keyword can't be added without hurting readability, drop it from the recommendations — ranking gains aren't worth tanking the page.


### Constraints

- MUST NOT invent performance numbers, CTR projections, or ranking predictions — work only from the real GSC data you pulled.
- MUST NOT keyword-stuff. One natural usage in a well-placed spot beats five forced ones.
- MUST preserve the page's primary search intent — if the top opportunity would shift the page's topic, skip it and note the mismatch in the report.

---

## Phase 6: Save the Report

- [ ]

    Write a keyword opportunity report to `documents({ action: "write", path: "/Reference/GSC Keyword Opportunities - {page slug or domain} - {YYYY-MM-DD}", content: <markdown> })`. Use dynamic date generation — never hardcode the date.


Report structure:

```markdown
# GSC Keyword Opportunities: {page URL}

**Window:** {startDate} → {endDate} (90 days)
**GSC site:** {siteUrl}
**Total impressions analyzed:** {sum}
**Opportunities found:** {count}

## Top Missing Keywords (ranked by impressions)

| Keyword | Impressions | CTR | Position | Gap | Suggested Placement |
| ------- | ----------: | --: | -------: | --- | ------------------- |
| ...     |         ... | ... |      ... | ... | ...                 |

## Recommended Edits

1. **{Placement}** — {before} → {after} (addresses: {keyword list})
2. ...

## Notes

- {Any caveats: thin data, off-topic queries dropped, external page, etc.}
```

- [ ]

    End your turn with a short summary: how many opportunities were found, the top 3 by impressions, and whether you applied the edits or are waiting for approval.


---

## Re-Run Guidance

This Ploybook is a good candidate for a scheduled run (e.g., monthly per high-value page) once cloned to the workspace. Each run will surface newly emerging impressions — queries Google started showing the page for after the last optimization pass. Use workspace scheduling to set that up; global Ploybook templates can't be scheduled directly.