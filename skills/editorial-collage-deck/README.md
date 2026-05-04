# editorial-collage-deck

Sister skill to [`editorial-collage`](../editorial-collage/). Produces
a single-file slide deck in the **Atelier Zero** design language —
warm-paper background, italic-serif emphasis, coral terminating dots,
surreal collage plates — with scroll-snap pagination and arrow-key
navigation.

> **Read first** — agent contract, schema, and self-check live in
> [`SKILL.md`](./SKILL.md). This README is the human quick-start.

## 30-second tour

```bash
# 1. Compose the worked example.
npx tsx scripts/compose.ts inputs.example.json example.html

# 2. Open it.
open example.html
```

The deck assumes 16 collage assets at `../editorial-collage/assets/`
(the sister skill ships them). Use ←/→ · Space · PageUp/PageDown ·
Home/End to navigate.

## What you get

- N viewport-height slides (the worked example has 11) with
  `scroll-snap-type: y mandatory` for clean pagination.
- HUD at top: brand mark · deck title · keyboard hint · live
  `NN / TT` counter.
- Coral progress bar at the bottom that fills as you advance.
- 7 slide kinds: `cover`, `section`, `content`, `stats`, `quote`,
  `cta`, `end`. Mix freely.
- Same 16-slot image library as the landing-page sister skill —
  no extra prompting or rendering.

## Files

```text
skills/editorial-collage-deck/
├── SKILL.md                 # ← agent contract (read this first)
├── README.md                # ← you are here
├── schema.ts                # typed slide variants + brand block (re-exports from sister)
├── inputs.example.json      # Open Design 11-slide pitch deck
├── example.html             # canonical rendering
└── scripts/
    └── compose.ts           # inputs.json + sister styles.css → index.html
```

## Authoring a deck

1. Copy `inputs.example.json` to your project as `inputs.json`.
2. Edit `brand` (or copy from a sister-skill `inputs.json` you already have).
3. Set `deck_title` (the kicker shown in the HUD).
4. Build the `slides` array. Each entry is one of seven kinds — see
   [`schema.ts`](./schema.ts) for the full type. A typical pitch:

   ```text
   1.  cover     — title plate
   2.  section   — chapter divider
   3-5. content  — manifesto, capabilities, method
   6.  stats     — the numbers
   7.  section   — chapter divider
   8.  content   — selected work
   9.  quote     — customer testimonial
   10. cta       — primary action
   11. end       — kicker word
   ```

5. Run the composer:

   ```bash
   npx tsx scripts/compose.ts inputs.json out/index.html
   ```

## Image strategy

The deck inherits the sister skill's 16-slot image library. Set
`inputs.imagery.assets_path` to wherever those PNGs live; the example
uses `'../editorial-collage/assets/'`.

To regenerate or stub:

```bash
# Generate via gpt-image-2 (fal.ai)
FAL_KEY=fal-... npx tsx ../editorial-collage/scripts/imagegen.ts \
  ../editorial-collage/inputs.example.json \
  --out=../editorial-collage/assets/

# Or paper-textured SVG placeholders
npx tsx ../editorial-collage/scripts/placeholder.ts ../editorial-collage/assets/
```

## See also

- [`editorial-collage`](../editorial-collage/) — landing page sister skill.
- [`design-systems/atelier-zero/DESIGN.md`](../../design-systems/atelier-zero/DESIGN.md) — design tokens.
