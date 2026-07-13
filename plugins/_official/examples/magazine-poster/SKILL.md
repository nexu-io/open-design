---
name: magazine-poster
description: |
  An editorial-style poster — newsprint paper, dateline, oversized serif
  headline with a struck-through word and italic accent, a 2-column body
  block, and 6 numbered sections with annotated pull-quote captions.
  Reads like a Sunday-paper full-page essay or a thoughtful launch poster.
  Use when the brief asks for "magazine poster", "editorial poster",
  "newsprint", "essay layout", or "manifesto".
triggers:
  - "magazine poster"
  - "editorial poster"
  - "newsprint"
  - "newspaper layout"
  - "essay"
  - "manifesto"
  - "long-form poster"
  - "杂志海报"
  - "报纸版式"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design an editorial magazine-style poster — ‘You don't need a designer to ship your first draft anymore.’ Newsprint paper, six numbered sections."
---

# Magazine Poster Skill

Produce a single-page editorial poster — looks like a tear-out from a
Sunday paper. Long-form, deliberate, type-driven.

## Workflow

1. **Read the active DESIGN.md** (injected above). Pick the heaviest serif
   token in the DS for the headline, the body serif for the columns, and
   a typewriter / mono token for the section eyebrows and annotations.
2. **Pick the topic** from the brief. Write a real, opinionated headline —
   one with a struck-through word ("a designer", "the template hunt") and
   an italic accent on a key noun ("first draft", "mood", "specifics").
3. **Layout**, in order:
   - **Top rule** — thin black hairline + a dateline ("01 · A · YOUR LAB"
     left, "DD · MMM · YYYY" right). Light typewriter font.
   - **Top eyebrow** — a single mono tag like "POSTED TODAY".
   - **Headline** — 2–3 lines, oversized serif. One word struck through
     with `text-decoration: line-through; text-decoration-thickness: 2px`.
     One word italic, in accent color.
   - **Deck** — a 1–2 sentence subhead in italic serif at ~60% size of
     the headline, with a dash separator and a `— what works` callout
     fragment in accent.
   - **Accent rule** — short horizontal accent-colored bar (~80px).
   - **Body grid** — six numbered cells in a 2×3 (or 3×2) grid. Each cell:
     - eyebrow (`01 · SHIP FAST`) in mono, accent color.
     - bold serif sub-headline.
     - 2–3 sentence body in body serif.
     - one annotated callout — a quoted "use this prompt" line on a tinted
       background block, set in mono.
   - **Footer band** — rule above, three cells: handle / role / date, with a
     small "PRO TIP" plate on the left containing one closing line.
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - Background uses a creamy paper tint (`#f3eee2` or DS canvas) plus a
     subtle paper noise (`radial-gradient` dots at low opacity).
   - 2-column body grid via CSS Grid; min-width 1100px page.
   - `data-od-id` on header, headline, deck, each cell, footer.
5. **Self-check**:
   - Type hierarchy is unmistakable — headline owns the page.
   - Strikethrough + italic accent both appear, exactly once each.
   - Body reads like real opinion, not lorem ipsum.
   - Looks intentional at 1280–1440px wide.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="poster-slug" type="text/html" title="Poster Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
