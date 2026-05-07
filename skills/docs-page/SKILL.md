---
name: docs-page
description: |
  A documentation page — left nav, scrollable article body, right-rail
  table of contents. Use when the brief mentions "docs", "documentation",
  "guide", "API reference", or "tutorial".
triggers:
  - "docs"
  - "documentation"
  - "guide"
  - "tutorial"
  - "api reference"
  - "文档"
od:
  mode: prototype
  platform: desktop
  scenario: engineering
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
---

# Docs Page Skill

Produce a single, three-column documentation page in one HTML file.

## Workflow

1. **Read the active DESIGN.md** (injected above). Use the body type token for
   prose; the mono token for code; respect line-height and max-width rules.
2. **Pick a topic** from the brief — the page should look like real docs, not
   a generic wireframe. Concrete API names, command examples, plausible
   parameters.
3. **Lay out** three regions:
   - **Left nav** (240–280px, sticky): grouped link list, current page bolded
     with a left-edge accent stripe. 3–5 groups of 4–8 links.
   - **Article body** (max-width ~720px, centered in the middle column):
     H1, lede paragraph, H2 sections, code blocks, callout boxes (note /
     warning), inline links, lists.
   - **Right TOC** (200–240px, sticky): "On this page" with the H2/H3
     anchors, current section highlighted as the user scrolls.
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, all CSS inline.
   - CSS Grid for the three columns; sticky positioning for the rails.
   - Code blocks: monospace token, soft surface fill, copy-button affordance
     (visual only — no JS needed).
   - Anchor IDs on every H2/H3 so the TOC links work.
   - `data-od-id` on the nav, article, and TOC.
5. **Prose**: write at least 350 words of believable docs. Include at least
   one shell command, one code snippet (5–15 lines), one callout, one table.
6. **Self-check**:
   - Body text wraps at the DS line-length sweet spot (60–75 chars).
   - Code uses the DS mono token, not generic `monospace`.
   - Accent is restrained — used for active nav item, links, one callout
     border. Not on body text.
   - Page is readable at 1280w and collapses gracefully below 900w (TOC drops
     out, nav becomes a top drawer).

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="docs-slug" type="text/html" title="Docs — Page Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
