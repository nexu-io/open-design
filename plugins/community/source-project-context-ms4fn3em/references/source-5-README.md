# Applied UI kit — The Compression Company

Marketing-web kit distilled from the homepage clone. Use these surfaces when generating new TCC pages or sections; do not treat this folder as a generic admin mock.

## Structure

| File | Role |
|------|------|
| `index.html` | Shell entry: sticky nav, hero + benchmark, ticker, strip, funnel, FAQ |
| `components/buttons.html` | Pill CTAs (outline / filled / micro) |
| `components/faq.html` | Accordion FAQ with barcode mark |
| `components/strip-cards.html` | Colored company strip tiles |
| `components/benchmark.html` | Dark benchmark panel + PSNR sidebar |

`index.html` links to the modular files under `components/` so reviewers can open each surface from the kit entry.

## Usage

1. Open `index.html` to inspect the composed marketing shell.  
2. Copy markup from `components/*.html` when you build new section artifacts.  
3. Link `../../fonts/fonts.css` and `../../colors_and_type.css` (already set in kit HTML).  
4. Import patterns into semantic deliverables (`capabilities-section.html`, etc.).  
5. Create new variants by composing nav + hero + strip + FAQ rather than inventing SaaS layouts.

## Design Notes

- **Source basis:** Website Clone homepage (thecompressioncompany.com tokens and bento layout).  
- **Layout:** Black canvas, white paper cells, ~3–5px gutters, 10px radius.  
- **Colors / tokens:** Bound only through `colors_and_type.css` (chalk/ink, sensor accents, blue primary CTA).  
- **Typography:** Roboter display, Instrument Serif italic, Fragment Mono labels.  
- **Components:** `buttons`, `faq`, `strip-cards`, and `benchmark` mirror production homepage patterns (nav pills, accordion, colored strip, PSNR panel).  
- **Composition model:** Treat `index.html` as the App shell; the benchmark column as a Sidebar panel; strip tiles and FAQ rows as PreviewCard blocks; the funnel CTA as a Composer action strip.

## Related package paths

- Rules: `../../DESIGN.md`  
- Previews: `../../preview/`  
- Full example: `../../examples/homepage-full.html`  
- Brand assets: `../../assets/`
