# Build a Content Page

Description: Two-phase workflow for building content-driven web pages (comparison guides, listicles, how-to articles, pillar pages).
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/build-content-page

A two-phase workflow for building content-driven web pages. Run Phase 1, save the Page Content Document, then run Phase 2 from that document. Do not stop at raw research notes.

**Core principle:** Phase 1 internalizes research and produces page-ready content. The research itself is a means to an end — the Page Content Document is the deliverable, not the research notes.

**For competitor comparison pages (**`{product} vs {competitor}`**,** `{competitor} alternatives`**):** Read the `aeo-comparison-pages` ploybook before Phase 1 — it specifies the verdict-block structure, required FAQs, JSON-LD schema, and "narrow concession" positioning that make the page citable by AI Overviews. The Page Content Document in Phase 1 should follow that template.

---

## **Phase 1: Research & Write the Page Content Document**

**Mode:** research + copywriting. Load the `research` and `copywrite` skills.

Do both research AND writing before building. This prevents raw notes from becoming a second interpretation problem.

### **Step 1: Research the Topic**

Load the `research` skill and investigate the topic thoroughly. Use 4-8+ web searches. Read workspace documents for existing brand context and positioning.

**Research is for YOUR understanding, not for the output.** Gather everything you need to write authoritatively — competitor data, pricing, features, reviews, statistics. But do NOT write it all down. You are building expertise to write a great page, not producing a research report.

### **Step 2: Write the Page Content Document**

Load the `copywrite` skill. Save a single document titled with the page name (e.g., "Best AI Receptionist for Medical Practices (2025)").

**This document IS the web page content.** It should read like the final page — section headings, body text, comparison tables, CTAs. Use it as the build spec in Phase 2.

Example Document Structure

```markdown
# Page Title (the H1)

## Meta

- **Target keywords:** [primary keyword] ([volume]/mo, KD [n]), [secondary]...
- **Target word count:** [n] words
- **Content format:** [comparison guide | listicle | how-to | pillar page]
- **Tone:** [e.g., objective & authoritative, not promotional]

## Sections

### [Section 1 Name] — Hero / Introduction

[2-3 sentences introducing the topic. What the reader will learn.]

### [Section 2 Name] — e.g., Quick Comparison Table

[Full comparison table with real data. This table will be rendered as-is.]

### [Section 3 Name] — e.g., Detailed Reviews

[Each item gets a structured mini-review: 3-4 sentences + key facts.]

### [Section N Name] — CTA / Conclusion

[Closing paragraph + call to action]

## Sources

- [Smith.ai Pricing](https://smith.ai/pricing) — pricing data, feature list
- [HIPAA Journal: AI in Healthcare](https://www.hipaajournal.com/...) — compliance requirements
- [G2 Reviews: My AI Front Desk](https://www.g2.com/products/...) — user sentiment
```

**Source links are required.** Every factual claim (pricing, features, compliance status) should be traceable to a URL. Inline links in the body text are preferred for key claims; the Sources section at the end collects all referenced URLs with a brief note on what each provided.

Word Budget Rules

This is a **web page**, not a long-form article. Web pages communicate through structure, visual hierarchy, and scannable blocks — not walls of text. The Page Content Document should contain only the copy that will actually appear on the page.

| Page type | Max document length | Per-item budget (if comparison/listicle) |
| --- | --- | --- |
| Simple landing page | 500-800 words | N/A |
| Comparison / listicle page | 800-1,500 words | 50-100 words per item |
| In-depth guide page | 1,200-2,000 words | 100-150 words per item |

**If no target is specified, default to 800-1,500 words.** Web pages that need more than 2,000 words of copy are rare — if you are writing more, you are probably including content that belongs in the research, not on the page. Scannable and structured beats long and thorough.

Comparison / Listicle Items

For comparison guides and listicles, each item gets a **structured mini-review**, not an exhaustive profile:

```markdown
### [Product Name]

**What it does:** [1 sentence]
**Best for:** [specific audience]
**Pricing:** [actual numbers or "custom/quote-based"] ([source](URL))

[2-3 sentences covering key strengths and notable limitations.
Focus on what matters to the target reader, not exhaustive feature lists.
Link key claims to sources inline, e.g. "[HIPAA BAA available](URL)".]
```

**ANTI-PATTERN:** Writing 200+ words per product in a 10-product comparison. That alone would be 2,000+ words before you even add the intro, table, and CTA. Visitors scan web pages — they do not read essays. Keep each item tight: key facts and a sharp take, not a comprehensive review.

What NOT to Include

- Exhaustive feature lists per competitor (use the comparison table instead)
- Full prose paragraphs restating what the comparison table already shows
- Research methodology or "how we gathered this data" sections
- Information that will not appear on the final web page
- Separate "research notes" documents — everything goes in one document

### **Phase 1 Checklist**

Use this as your working checklist:

```
## Objective
Research [topic] and write a Page Content Document for a [content format]
targeting [target keywords]. The document IS the page content — write it
as web page copy, not as research notes.

## Content Specs
- Target page copy: [800-1,500] words (this is a web page, not an article)
- Format: [comparison guide with 8-10 products | listicle | how-to | etc.]
- Tone: [objective, authoritative, not promotional | etc.]
- Per-item budget: [50-100] words max per product/item

## Research Scope
[What to research — competitors, features, pricing, etc.]

## Checklist
- [ ] Load the `research` and `copywrite` skills
- [ ] Read workspace documents for brand context: [document names/paths]
- [ ] Conduct 4-8+ web searches covering [research angles]
- [ ] Write the Page Content Document (structured sections, comparison table, mini-reviews)
- [ ] Include source links: inline for key claims (pricing, features, compliance), plus a Sources section at the end
- [ ] Verify document length is within budget
- [ ] Save as a document and register as artifact

## CRITICAL: Do NOT produce a separate research report. Your research
informs the content — it does not become a separate deliverable.
The only output is the Page Content Document.
```

---

## **Phase 2: Build the Web Page**

**Mode:** design engineering. Load `code`, `brand-adherence`, and `build-site-page`; use `designSystem` before editing.

### **Step 1: Read the Page Content Document**

Read the document produced in Phase 1. This is your spec — every section in the document maps to a section on the web page.

### **Step 2: Audit Existing Components**

Load `brand-adherence` and `build-site-page` (or `componentize-site` if the site is not componentized yet). Run `designSystem` with `action="plan-page-build"` before code edits, then read the returned route/page/template/section paths. Use scoped `code.glob` only when `designSystem` misses a specific path.

### **Step 3: Build**

1. Pick or create a page template (see `build-site-page` skill for template selection)
2. Create the content object with typed props — pull text directly from the Page Content Document
3. Build new sections as needed, following existing site style
4. Comparison tables render from structured data (arrays of objects), not hardcoded HTML
5. Screenshot and review each section

### **Step 4: SEO Setup**

- Meta tags from the document's Meta section
- Proper heading hierarchy (H1 = page title, H2 = section headings)
- Read the SEO strategy system Ploybook for SEO guidance: `ploybook(action: "read", id: "seo-aeo-strategy-system")`

### **Step 5: Verify**

- `bun run build`
- `screenshot({ fullPage: true, review: true })`
- Responsive check (mobile, tablet, desktop)

### **Phase 2 Checklist**

```
## Objective
Build the [page name] web page using the Page Content Document as the spec.

## Content Source
Read the document at [document path/title] — it contains the full page
content: section headings, body text, comparison tables, and CTAs.

## Checklist
- [ ] Load the `code`, `brand-adherence`, and `build-site-page` skills
- [ ] Read the Page Content Document
- [ ] Run `designSystem(action="plan-page-build")` and read returned paths
- [ ] Reuse or shallow-refactor the closest page template/sections
- [ ] Build all sections from the document (comparison table from structured data)
- [ ] Set up SEO meta tags from the document's Meta section
- [ ] Run the site's existing check/build script after confirming it exists
- [ ] Screenshot full page + responsive checks
```

---

## **Rules**

- MUST produce exactly one document in Phase 1 — the Page Content Document. No separate research reports.
- MUST stay within the word budget. Default 800-1,500 words for page copy. If you are over 2,000 words, you are writing an article, not a web page.
- MUST use structured formats (tables, bullet snapshots) over prose for comparison data.
- MUST NOT include information in the document that will not appear on the final web page.
- MUST reuse existing site sections and components where they fit (Phase 2).
- MUST include source links — inline in body text for key factual claims (pricing, compliance, features) AND a ## Sources section at the end listing all referenced URLs. The builder decides how to render them (footnotes, inline links, sources section, etc.).

## **When to Use This Ploybook**

- Building a comparison guide, listicle, how-to article, or pillar page
- Content requires web research (competitor analysis, market data, product reviews)
- The page is content-first (text-heavy) rather than design-first (visual-heavy)

## **When NOT to Use**

- Building a homepage or landing page (use "Create a Homepage from Scratch")
- Building from a Figma design (use "Create a Homepage from a Figma File")
- The content already exists and just needs to be put on a page (use `build-site-page` skill directly)