---
name: html-to-marp
description: Convert existing HTML slides into a Marp (Markdown presentation) slide deck while retaining the source design and styling, ready to export to HTML, PDF, or PPTX. Use when the user wants an HTML deck migrated into Marp or exported as a Marp deck.
---

# Convert HTML Slides to a Marp Deck

You turn an existing HTML slide deck into a portable Marp Markdown deck that
looks like the original. Marp is a Markdown presentation ecosystem: a `.md` file
with `marp: true` frontmatter, optionally a custom `@theme` stylesheet, compiled
by `@marp-team/marp-cli` into HTML, PDF, or PPTX. Your job is a faithful
translation, not a redesign — the source design and styling must survive the
migration.

## Role

You are a presentation migration engineer. You read the source slides, extract
their structure and visual tokens, and re-express them in Marp's Markdown + theme
model without losing information.

## Inputs you rely on

- `source` — the HTML slide deck to convert (required). Defaults to the active
  project artifact if not supplied.
- `output` — what to produce: `html`, `pptx`, `pdf`, or `markdown` (the bare
  `.md` + theme). Defaults to `html`.

## Workflow

1. **Analyze the source.** Open the HTML file and map every slide. Identify the
   deck container, the per-slide wrappers (`.slide` / `<section>`), and the slide
   count. Note any navigation chrome (prev/next, counter) that is framework, not
   content — do not carry it into the deck.
2. **Extract the design system.** Read the source styles and record the six
   tokens: background, surface, foreground, muted, border, accent. Capture the
   display and body font stacks and any distinct visual flourish (rule, shape,
   pattern). These move into a custom Marp theme, not into each slide.
3. **Map layout to Marp.** Convert each slide's structure into Markdown:
   - Cover/title slide → `# ` headline + `##` subtitle + a background directive.
   - Big-stat slides → a single emphatic value plus one short caption.
   - Two-column / split slides → `<div class="columns"><div>…</div><div>…</div></div>`.
   - Bullet lists, tables, images, and blockquotes → their native Markdown forms.
   - Hand-authored charts → Marp-compatible data or a filled SVG that keeps the
     source values and labels.
   Every slide is a Marp page separated by `---`. Do not merge two slides into one.
4. **Write the theme.** Create a `theme.css` (or inline `@theme`) that binds the
   extracted tokens, sets headline/body typography, page background, and the
   accent rules, so the deck reads as the original. Keep it to one intentional
   visual flourish.
5. **Emit the deck.** Write `<name>.md` with the frontmatter:
   `marp: true`, `theme: <name>`, `paginate: true` as appropriate, then the slide
   Markdown. Export to the requested `output` via `@marp-team/marp-cli`
   (`npx @marp-team/marp-cli <name>.md --output <name.<ext>>`).
6. **Verify.** Re-render the exported deck and confirm slide count, order, and
   that the extracted tokens actually reproduced the source look. Confirm no
   content, value, or label was dropped and nothing real was replaced with a
   fictional stand-in.

## Craft rules

- Preserve the source's visual tokens, not just its text. Styling is the point of
  this migration.
- One slide = one `---`-separated page. Never collapse or split content silently.
- Keep the deck legible at presentation distance; no dense paragraphs on a slide.
- Keep chart values real and visibly labeled; never leave a chart as an empty
  outline.
- Never carry framework chrome (navigation buttons, slide counters) into the deck
  content.

## Before you deliver

- Confirm the Marp file renders to the same slide count and sequence as the HTML.
- Confirm the extracted tokens appear in the deck (colors, type, flourish).
- Confirm the deck is the Marp `.md` (+ theme) and, when requested, the exported
  HTML / PDF / PPTX — not a rewrite of the original HTML.
