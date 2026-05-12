---
name: faq-page
description: |
  A Frequently Asked Questions (FAQ) page with collapsible accordion sections,
  search functionality, and category filtering. Use when the brief asks for
  "FAQ", "help center", "questions", or "support page".
triggers:
  - "faq"
  - "FAQ"
  - "frequently asked questions"
  - "help center"
  - "support page"
  - "Q&A"
  - "常见问题"
  - "帮助中心"
od:
  mode: prototype
  platform: desktop
  scenario: support
  featured: 8
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, accessibility-baseline, state-coverage]
---

# FAQ Page Skill

Produce a single FAQ page with collapsible accordion sections, search, and category filtering.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use the component tokens for
   interactive elements (accordion headers, search input, category pills).
2. **Pick the domain** from the brief (e.g., SaaS product, e-commerce, service)
   and write 12–18 real FAQ entries across 3–4 categories.
   - **Edge cases**:
     - If the brief provides fewer than 8 FAQs, ask for more content or generate
       realistic questions based on the domain.
     - For 1–5 FAQs, skip categories and search; show a simple list.
     - For very long answers (>100 words), break into paragraphs or bullet points
       to maintain readability.
3. **Sections**, in order:
   - **Header** — page title ("Frequently Asked Questions" or "Help Center"),
     optional subtitle (1 sentence explaining what users can find here).
   - **Search bar** — prominent search input with placeholder text and icon.
     Functional JS to filter questions in real-time.
   - **Category filters** — 3–4 pill-style buttons to filter by category
     (e.g., "Billing", "Account", "Technical", "General"). "All" selected by default.
   - **FAQ accordion** — collapsible question/answer pairs:
     - Question as clickable header with expand/collapse icon (chevron or plus/minus).
     - Answer hidden by default, expands on click with smooth animation.
     - Each entry has `data-category` attribute for filtering.
   - **Footer CTA** — "Still have questions?" section with contact link or
     support email.
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS and JS inline.
   - Accordion uses semantic HTML (`<details>` and `<summary>` for progressive
     enhancement, or custom JS with proper ARIA attributes).
   - Search filters questions by matching text in question or answer.
   - Category filters show/hide questions based on `data-category`.
   - Smooth transitions for expand/collapse (max-height or grid-template-rows).
   - `data-od-id` on header, search, categories, accordion container, footer.
5. **Self-check**:
   - Questions are specific and realistic (not generic placeholders).
   - Answers are concise (2–4 sentences) but complete.
   - Keyboard navigation works (Tab through questions, Enter to expand).
   - Search is case-insensitive and filters by matching text.
   - Only one accordion item expanded at a time (optional, depends on UX preference).
   - Mobile-friendly (accordion headers are tappable, search is usable).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="faq-page" type="text/html" title="FAQ Page">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

## Example questions by category

**Billing**
- How do I update my payment method?
- What payment methods do you accept?
- Can I get a refund?
- How do I cancel my subscription?

**Account**
- How do I reset my password?
- Can I change my email address?
- How do I delete my account?
- What happens to my data after I cancel?

**Technical**
- What browsers do you support?
- Is there a mobile app?
- How do I export my data?
- What are your API rate limits?

**General**
- What is [Product Name]?
- How do I get started?
- Do you offer customer support?
- Where can I find your terms of service?
