# kami-article

A drop-in skill that turns a source article (X thread, blog post,
paper, talk transcript) into a print-grade kami one-pager —
**transcript + interpretation on the same canvas**, in the same
warm-parchment / ink-blue / single-serif-weight visual language as
[`kami-landing`](../kami-landing/) and [`kami-deck`](../kami-deck/).

> **Read first** — the agent contract, schema, and self-check live in
> [`SKILL.md`](./SKILL.md). The full P0 / P1 / P2 gate list lives in
> [`references/checklist.md`](./references/checklist.md). This README is
> the human quick-start.

## What you get

A single self-contained HTML file with:

- **Warm parchment canvas** (`#f5f4ed`), never `#ffffff`.
- **Single chromatic accent** — ink-blue (`#1B365D`), constrained to
  ≤ 5% of visible surface.
- **Serif at weight 500** for hierarchy. No italic anywhere.
- **Long-form reading rhythm** — body line-height 1.7–1.8 (slightly
  looser than `kami-landing` because article body is meant to be
  *read*, not *scanned*), language-aware letter-spacing.
- **`tabular-nums`** on every numeric stack.
- **Solid-hex tag fills** (no `rgba()`).
- **1px rings + whisper shadows** for depth — no hard drop shadows.
- **Source-honest by contract** — every quote carries an attribution
  `<span class="src">— Author · venue</span>`; every metric value
  comes from the source piece (or is labelled commentary). The skill
  refuses to invent numbers.
- **Multilingual** by design (EN / zh-CN / ja stacks selectable via
  the `language` parameter).

## When to pick this skill

| You want to... | Pick |
| --- | --- |
| Read someone else's piece and respond to it on one page | **`kami-article`** (you are here) |
| Show off your own brand or product on one page | [`kami-landing`](../kami-landing/) |
| Walk through a thesis slide-by-slide | [`kami-deck`](../kami-deck/) |

## 30-second tour

The skill is "agent-driven, no script": there is no `compose.ts`. The
agent reads `SKILL.md`, gathers the brief in two rounds (source
attribution + your interpretation), then writes `out/index.html`
directly using the tokens and components catalogued in
[`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md).

To preview the canonical Open Design instance:

```bash
open example.html
```

The shipped `example.html` reads Thariq's *"The Unreasonable
Effectiveness of HTML"* (X · @trq212 · `status/2052809885763747935`)
and folds it into a four-chapter zh-CN interpretation. The visible
quotes are short attributed pulls from the original; the surrounding
summary is original commentary.

To start a fresh project:

1. Open the skill in your agent (Claude · Cursor · Codex · …).
2. Answer the source round (author, handle, URL, date, venue).
3. Answer the interpretation round (one-line takeaway, 3-6 metrics
   sourced from the piece, 3-5 chapters with optional `.quote` pulls).
4. Write the file. Done.

## Files

```text
skills/kami-article/
├── SKILL.md                    # ← agent contract (read this first)
├── README.md                   # ← you are here
├── example.html                # canonical Open Design rendering
└── references/
    └── checklist.md            # P0 / P1 / P2 gates
```

## Boundaries

- No external JavaScript. The page is paper, not an app.
- No hard drop shadows, no neumorphism, no `backdrop-filter`.
- No second accent color. No italic. No cool blue-grays.
- One `.tag.brush` per page maximum (the only sanctioned gradient).
- No more than two short attributed `.quote` pulls per source piece.
  Anything longer should ship as a separate transcript artifact —
  this skill is for *response*, not *reproduction*.
- Every metric value must have a real-source provenance. Honest `—`
  beats an invented "10× faster".

## See also

- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — the full token spec.
- [`skills/kami-landing/`](../kami-landing/) — sibling skill for
  brand / product one-pagers in the same kami language.
- [`skills/kami-deck/`](../kami-deck/) — sibling skill that ships a
  slide deck in the same kami language.
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT) that the design system adapts.

## License

Apache-2.0 (same as the rest of `skills/`). The example interpretation
in `example.html` is an original commentary on a publicly-posted X
article by [Thariq (@trq212)](https://x.com/trq212/status/2052809885763747935);
the two visible attributed quotes are short pulls retained for
critical commentary, with full attribution in the footer.
