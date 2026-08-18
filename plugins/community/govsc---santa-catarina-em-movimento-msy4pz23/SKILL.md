---
name: govsc-santa-catarina-em-movimento
description: Use the GOVSC - Santa Catarina em Movimento design system for institutional presentations, public-policy decks, executive pages, data-led reports, and decision surfaces.
user-invocable: true
---

# GOVSC - Santa Catarina em Movimento

Reusable Claude Design package sections: What is inside, Source context, When to use, How to use, and Design system highlights.

## What is inside

What is inside: a canonical DESIGN.md, brand tokens, preserved official assets, focused preview cards, and a runnable applied UI kit.

Read `README.md`, `DESIGN.md`, `BRAND.md`, `brand.json` and `colors_and_type.css` before implementing. Use `assets/` for the official logos and reference captures. Review `preview/` for focused visual evidence and `ui_kits/app/` for the applied shell.

## Source context

Source context: pasted DESIGN.md, local source notes, two 16:9 model PDFs, and official logo references in assets/.

The system is extracted from `context/input-DESIGN.md` and supported by `context/source-context.md`, two 16:9 model PDFs and three preserved brand-reference assets. The Manual de Marca takes precedence over layout examples.

## When to use

When to use: GOVSC decks, executive briefings, public-policy reports, KPI views, territorial narratives, and decision surfaces.

Use for GOVSC institutional presentations, executive briefings, accountability reports, public-policy narratives, territorial programs, KPI views and decision requests. Keep the system distinct from generic startup or marketing UI.

## How to use

How to use: read the source-backed rules, choose one narrative mode, use semantic tokens, preserve the mark, and verify states and data context.

1. Choose one narrative mode: clear institutional for data, or dark executive for impact.
2. Start with a conclusion-led title and one primary idea per screen.
3. Use the 12-column, 8px-based layout and 44px controls.
4. Use semantic roles from `colors_and_type.css`; reserve `--govsc-accent` for rare high-signal moments.
5. Use official files from `assets/` and preserve their proportions and clear space.
6. Label every data view with period, unit, universe and source. Use explicit placeholders when content is missing.
7. Verify contrast, focus-visible, reduced-motion and responsive behavior before delivery.

## Design system highlights

- Inter 400/700 with a system fallback stack.
- 12-role palette: White, Cloud, Mist, Preto, Ink, Slate, Mist border, Marrom, Lima, Verde, Amarelo and Vermelho semantic tokens.
- 8px radius maximum (no radius on photography), 1px borders, 12-column grid, 16:9 presentation canvas.
- Documentary Santa Catarina imagery, natural treatment, full-bleed and consistent image sets; explicitly reserved placeholders when photography is unavailable.
- Acents: Lima and Verde lead graphic accents; Vermelho only in low-intensity strokes/markers; Amarelo in moderation for exceptional alerts.
- Coverage for cover, divider, KPI, chart, map, timeline, process, decision table, governance, risks and closing.
- No fabricated data, no recreated marks, no decorative crest, no color-only meaning and no generic filler copy.

## Provenance

Formalized by Open Design from candidate fbfa39e2-8d4c-467b-be03-9fdea6906286.
