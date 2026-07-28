# Applied UI kit — The Compression Company (reference)

Marketing-web kit distilled from the homepage clone. Use these surfaces when generating new TCC pages or sections; do not treat this as a generic admin mock.

> **Plugin note:** This is **prose structure evidence**. Live `index.html` / `components/*.html` files are **not** shipped in the plugin. Generate kit HTML in the consumer project from this outline + `source-2-DESIGN.md`.

## Structure (when materializing `ui_kits/app/`)

| File | Role |
|------|------|
| `index.html` | Shell entry: sticky nav, hero + benchmark, ticker, strip, funnel, FAQ |
| `components/buttons.html` | Pill CTAs (outline / filled / micro) |
| `components/faq.html` | Accordion FAQ with barcode mark |
| `components/strip-cards.html` | Colored company strip tiles |
| `components/benchmark.html` | Dark benchmark panel + PSNR sidebar |

## Usage (plugin-safe)

1. Read this file for the composition model.  
2. Read **`source-2-DESIGN.md`** for tokens, type, and component specs.  
3. Generate kit HTML in the **consumer** project; link consumer-local tokens CSS / fonts when those files exist.  
4. Compose nav + hero + strip + FAQ rather than inventing SaaS layouts.  
5. Related plugin evidence: `source-3-README.md` (package guide), `source-4-SKILL.md` (agent checklist).

## Design Notes

- **Source basis:** Website Clone homepage (thecompressioncompany.com tokens and bento layout).  
- **Layout:** Black canvas, white paper cells, ~3–5px gutters, 10px radius.  
- **Colors / tokens:** Semantic + sensor tokens as specified in `source-2-DESIGN.md`.  
- **Typography:** Roboter display, Instrument Serif italic, Fragment Mono labels.  
- **Components:** `buttons`, `faq`, `strip-cards`, and `benchmark` mirror production homepage patterns.  
- **Composition model:** Treat the shell as App; the benchmark column as Sidebar; strip tiles and FAQ rows as PreviewCard blocks; the funnel CTA as a Composer action strip.

## Related plugin paths

- Rules: `source-2-DESIGN.md`  
- Package guide: `source-3-README.md`  
- Agent skill: `source-4-SKILL.md`  
- Handoff: `source-1-source-context.md`  
- Provenance: `provenance.json`  
