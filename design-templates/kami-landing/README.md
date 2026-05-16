# kami-landing

A drop-in skill that turns a brief into a print-grade kami one-pager —
warm parchment canvas, ink-blue accent, serif at one weight, no
italic, no cool grays. The output reads like a white paper or studio
one-pager, not an app UI.

> **Read first** — the agent contract, schema, and self-check live in
> [`SKILL.md`](./SKILL.md). This README is the human quick-start.

## What you get

A single self-contained HTML file with:

- **Warm parchment canvas** (`#f5f4ed`), never `#ffffff`.
- **Single chromatic accent** — ink-blue (`#1B365D`), constrained to
  ≤ 5% of visible surface.
- **Serif at weight 500** for hierarchy. No italic anywhere.
- **Tight print rhythm** — line-heights 1.10–1.55, language-aware
  letter-spacing.
- **Tabular-nums** on every numeric stack.
- **Solid-hex tag fills** (no `rgba()`, which print renderers
  double-paint).
- **1px rings + whisper shadows** for depth — no hard drop shadows.
- **Multilingual** by design (EN / zh-CN / ja stacks selectable via
  the `language` parameter).

## 30-second tour

The skill is "agent-driven, no script": there's no `compose.ts`. The
agent reads `SKILL.md`, gathers the brief, then writes
`out/index.html` directly using the tokens and components catalogued
in [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md).

To preview the canonical Open Design instance:

```bash
open example.html
```

To start a fresh project:

1. Open the skill in your agent (Claude · Cursor · Codex · …).
2. Answer two rounds of brief questions (identity + content).
3. Write the file. Done.

## Files

```text
skills/kami-landing/
├── SKILL.md      # ← agent contract (read this first)
├── README.md     # ← you are here
└── example.html  # canonical Open Design rendering
```

## Boundaries

- No external JavaScript. The page is paper, not an app.
- No hard drop shadows, no neumorphism, no `backdrop-filter`.
- No second accent color. No italic. No cool blue-grays.
- One `.tag.brush` per page maximum (it's the only sanctioned gradient).

## See also

- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — the full token spec.
- [`skills/kami-deck/`](../kami-deck/) — sibling skill that produces a
  slide deck in the same kami language.
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT) that the design system adapts.
