# editorial-collage

Reusable skill that produces a world-class editorial landing page in
the **Atelier Zero** design language — the warm-paper, italic-serif,
collage-on-grid aesthetic shared by Monocle, Apartamento, and Études.

The skill is parameterized: fill one typed `inputs.json`, run one
script, get a self-contained HTML file. Optionally generate 16 surreal
collage assets with `gpt-image-2`, or fall back to paper-textured SVG
placeholders so the layout still feels intentional with zero image
budget.

> **Read first** — the agent contract, inputs schema, and self-check
> live in [`SKILL.md`](./SKILL.md). This README is the human
> quick-start.

## 30-second tour

```bash
# 1. Paper-textured placeholders so the layout renders immediately.
npx tsx scripts/placeholder.ts ./out/assets/

# 2. Compose the standalone HTML from the worked example.
npx tsx scripts/compose.ts inputs.example.json ./out/index.html

# 3. Open it.
open ./out/index.html
```

That's it. Three commands, full editorial landing page, no API keys.

To brand it for yourself, copy `inputs.example.json` to `inputs.json`,
edit the fields (the schema is self-documenting — see
[`schema.ts`](./schema.ts)), and re-run step 2.

## The three image strategies

| Strategy        | Cost   | Latency | When                                      |
| :-------------- | :----- | :------ | :---------------------------------------- |
| `placeholder`   | $0     | <1s     | First pass, demo, internal review.        |
| `generate`      | ~$0.40 | ~6 min  | Final delivery; original collage plates.  |
| `bring-your-own`| $0     | 0s      | You have art direction PNGs ready to drop in. |

Set `inputs.imagery.strategy` to one of the three.

```bash
# generate mode (requires FAL_KEY in env)
FAL_KEY=fal-... npx tsx scripts/imagegen.ts inputs.json --out=./out/assets/
```

Without `FAL_KEY`, the imagegen script prints the prompts so you can
route them through the `/gpt-image-fal` slash-command skill manually.

## Layout at a glance

8 numbered Roman-numeral sections, all responsive at 1280 / 1080 / 880 / 560:

```
I.   Hero          — display headline + 3 stat rings + 4-step index + collage plate
II.  About         — manifesto + studio stamp + tilted side-note
III. Capabilities  — 4 cards (skills / systems / adapters / BYOK) + ribbon
IV.  Labs          — 5 portrait cards + filter pills + progress bar
V.   Method        — 4 numbered steps with thumbnails on hairline timeline
VI.  Selected work — dark slab, 2 tilted cards (one rotated -1.2°, one +2.4°)
VII. Testimonial   — pull quote + 5 partner glyphs
VIII. CTA          — closing pitch + ribbon + email pill
     Footer       — 4 link columns + huge italic-serif kicker word
```

Every section has scroll-reveal motion (IntersectionObserver, respects
`prefers-reduced-motion`).

## Files

```text
skills/editorial-collage/
├── SKILL.md                 # ← agent contract (read this first)
├── README.md                # ← you are here
├── schema.ts                # typed inputs (single source of truth)
├── styles.css               # Atelier Zero stylesheet (single source of truth)
├── inputs.example.json      # Open Design as the worked example
├── example.html             # canonical rendering, regenerable from inputs.example.json
├── scripts/
│   ├── compose.ts           # inputs.json + styles.css → index.html
│   ├── imagegen.ts          # gpt-image-2 wrapper (fal.ai backend)
│   └── placeholder.ts       # SVG paper-textured frames
└── assets/
    ├── *.png                # 16 collage plates (Open Design instance)
    ├── image-manifest.json  # slot → file / dimensions / prompt mapping
    └── imagegen-prompts.md  # human-readable prompt pack
```

## Regenerate the canonical example

After editing `styles.css`, `schema.ts`, or `inputs.example.json`:

```bash
npx tsx scripts/compose.ts inputs.example.json example.html
```

The `example.html` in this folder is the pre-rendered known-good demo —
useful as a visual reference and for QA against the live composer
output.

## See also

- [`design-systems/atelier-zero/DESIGN.md`](../../design-systems/atelier-zero/DESIGN.md) — colors, type, motion tokens.
- [`apps/landing-page/`](../../apps/landing-page/) — Next.js 16 deployable counterpart of this skill.
- [`skills/editorial-collage-deck/`](../editorial-collage-deck/) — sibling skill that produces a slide deck in the same visual language.
