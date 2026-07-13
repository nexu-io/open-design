# kami-deck

Sister skill to [`kami-landing`](../kami-landing/). Produces a single
self-contained HTML file: a horizontal magazine-style swipe deck in
the **kami (紙 / 纸)** design system — print rhythm, ink-blue accent,
serif at one weight, no italic, no cool grays.

> **Read first** — agent contract, schema, and self-check live in
> [`SKILL.md`](./SKILL.md). This README is the human quick-start.

## What you get

- N viewport-sized slides laid out horizontally on a transformed
  flex track.
- **Cover / chapter / end slides** flip background to ink-blue
  (`#1B365D`) with ivory text. **All other slides** stay on
  parchment (`#f5f4ed`) with serif at weight 500.
- **Per-slide chrome strip**: brand mark · deck title · live
  slide counter (`01 / 09`).
- **Tabular-nums** on every counter, metric, and date.
- **Ink-blue progress bar** at the bottom that fills as you advance.
- **Dot indicator** near the bottom; click to jump.
- **ESC overview grid** with scaled thumbnails.
- **Keyboard / wheel / touch nav** — same model as `guizang-ppt`.
- **Multilingual stack** — EN / zh-CN / ja, set on `:root` via the
  `language` parameter.

## 30-second tour

The skill is "agent-driven, no script": there's no `compose.ts`. The
agent reads `SKILL.md`, gathers the brief, then writes
`out/index.html` directly using the tokens from
[`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md)
and the layout primitives in [`example.html`](./example.html).

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
skills/kami-deck/
├── SKILL.md      # ← agent contract (read this first)
├── README.md     # ← you are here
└── example.html  # canonical Open Design rendering (9 slides)
```

## Boundaries

- No second accent color. No italic. No cool blue-grays. No hard
  drop shadows.
- One self-contained HTML file. No router, no external JS bundle.
- Cover / chapter / end slides only — no other slide kind goes dark.
- Tag fills must be solid hex (kami's print invariant), not `rgba()`.

## See also

- [`kami-landing`](../kami-landing/) — long-form one-pager sister.
- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — token spec.
- [`open-design-landing-deck`](../open-design-landing-deck/) — same
  swipe nav model, different visual language (Atelier Zero).
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT) the design system adapts.
