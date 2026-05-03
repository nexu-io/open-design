# OneShot Design: Claude Design For Authors Module

Module version: 1.0
Last reviewed: May 2026
Source posture: built from the Claude Design author-cover doctrine supplied by James. Verify live Claude Design export formats and controls before using this in a client-facing workflow.

## Strategic Position

Claude Design belongs in the author cover workflow as a layout, briefing, and pre-visualization tool. It is not an image generator and it is not a print-production tool. Its highest value is compressing decisions before art generation and finishing.

Use Claude Design for:

- Cover layout mockups and composition zones.
- Typography direction exploration.
- Series design system rules.
- Cover brief decks for designer handoff.
- Thumbnail and shelf-test sheets.
- Audiobook, ad, and launch asset crop layouts.
- Author brand one-pagers.
- ARC and pre-order asset packs.
- Series bible visual pages.

Use other tools for:

- Cinematic or photorealistic art plates: Midjourney, Flux, or another image model.
- Retouching and finishing: Photoshop or Affinity.
- Print-ready wraps, CMYK, bleed, spine math, and 300 dpi files: InDesign, Affinity Publisher, KDP, and IngramSpark tooling.
- Governed component systems and version control: Figma.

Operating rule: Claude Design decides the layout and brief. Midjourney or Flux draws the art. Photoshop or Affinity finishes the cover. KDP or IngramSpark validates print production.

## CoverVision Placement

| Stage | Tool | Claude Design Role |
| --- | --- | --- |
| 1. Intake | Claude chat or OneShot | Questionnaire and scoping brief |
| 2. Research | Browser, Amazon, local corpus | Comp analysis sheet only |
| 3. Creative Brief | Claude Design | Shareable visual brief deck |
| 4. Concept Development | Claude Design | 3 concept lane mockups |
| 5. Generation | Midjourney, Flux, image pipeline | None |
| 6. Selection | Human review | Thumbnail sheets and comparison pages |
| 7. Finishing | Photoshop, Affinity | None |
| 8. Typography | Claude Design pre-comp, Photoshop final | Exploration only, final execution elsewhere |
| 9. Production | KDP, IngramSpark, InDesign | None |
| 10. QA | CoverVision checklist | Exported checklist and review packet |

## Workflow 1: Pre-Generation Concept Mockup

Purpose: lock composition before spending image-generation budget.

Prompt template:

```text
Genre: [dark fantasy thriller]
Subgenre / shelf: [grimdark, adult, post-2020 cohort]
Title: [The Hollow King]
Subtitle: [Book One of The Hollow Chronicles]
Author name: [J. Mercer]
Trim size: [6x9 inches, front cover only]

Composition direction:
- Title placement: bottom third
- Hero image zone: upper two-thirds, use a labeled placeholder rectangle
- Author name: foot, centered, small caps
- Series badge: top edge band, condensed sans

Color palette: deep midnight blue, bone white, one oxblood accent
Typography feel: condensed serif, slightly distressed, no italics, no swashes
Reference cohort: [3 to 5 comp titles]

Build a front-cover layout mockup. Show three variants of title scale on the same composition.
```

Iteration moves:

- Adjust title scale by 10 percent in each direction.
- Test caps versus mixed case.
- Test author name at 25, 33, and 40 percent of title weight.
- Lock the strongest lane and export it as the art directive.

## Workflow 2: Typography Direction Lab

Purpose: test type before committing to a finishing pass.

Prompt template:

```text
Title: [The Hollow King]
Author: [J. Mercer]
Tone words: austere, mythic, visceral

Generate 6 typographic directions on the same blank composition:
1. Condensed serif, all caps, tight tracking
2. Wide serif, mixed case, generous leading
3. Slab serif, all caps, distressed texture
4. Geometric sans, all caps, wide tracking
5. Hand-drawn display, mixed case, slight irregularity
6. Modern condensed sans, all caps, thin weight

Show all 6 on a 2x3 grid. Use the same hero-image placeholder rectangle across all 6.
```

Decision rule: pick the two directions that still read at thumbnail size.

## Workflow 3: Series Design System

Purpose: make every book in a series look like it belongs to the same product line.

Prompt template:

```text
Build a series design system for a [number]-book [genre] series.

Series name: [The Hollow Chronicles]
Author: [J. Mercer]
Recurring visual elements:
- Color band at top edge, [percentage] of cover height
- Spine number or front-cover book number position
- Author name placement and scale
- Series name placement and type style
- Title type family, scale, and texture

Define rules for title scale, author scale, color per book, type hierarchy, margins, negative space, and forbidden treatments.
Apply the system to Book 1 as proof of concept.
```

Maintenance prompt: "Apply the saved series system to a new front cover. Title: [Book 2]. Color band shifts to [color]. Hero image placeholder only."

## Workflow 4: Cover Brief Deck

Purpose: turn the author brief into a designer-readable visual handoff.

Required pages:

1. Positioning: genre, subgenre, target reader, comparable titles, price tier.
2. Mood board: 6 to 10 reference covers with notes.
3. Typography direction: 2 to 3 preferred type treatments.
4. Color palette: primary, secondary, accent, hex values, usage ratios.
5. Composition wireframe: labeled layout from Workflow 1.
6. Must-have list: required motifs, placement, series requirements.
7. Must-avoid list: genre cliches, content red lines, rights risks.
8. Series system page when relevant.

Prompt:

```text
Build an 8-page cover design brief deck from the following notes.
Use clean editorial pacing, consistent header bars, and readable annotations.
Export-ready as PDF for designer handoff.
```

## Workflow 5: Thumbnail Shelf-Test Sheet

Purpose: test survival at online retail scale.

Prompt template:

```text
Create a thumbnail comparison sheet.
Render 6 book cover mockups at small Amazon-thumbnail scale.
Title and author only, minimal hero detail.
Lay them out in a 2x3 grid on neutral gray.
Label each A through F.
Add a second strip below showing the same 6 covers at 2x scale.
```

Decision rule: title readable and genre identifiable in one second.

## Workflow 6: Audiobook And Ad Crop Layouts

Purpose: prepare derivative marketing layouts before final art arrives.

Core crops:

| Asset | Dimensions | Use |
| --- | --- | --- |
| Audiobook square | 3000x3000 | Audible and ACX |
| Facebook ad banner | 1200x628 | Facebook and Instagram ads |
| BookBub banner | 800x450 | BookBub campaigns |
| Amazon A+ header | 970x300 | Author and detail pages |
| Newsletter header | 600x300 | Email campaigns |
| Social card | 1200x675 | Threads, X, and link previews |

Prompt:

```text
Build a derivative crop pack referencing the locked front-cover composition for [title].
Generate the six layouts listed above.
Preserve the title hierarchy and one signature visual element from the cover.
Use labeled placeholders for final art.
Export as a single review PDF with one crop per page.
```

## Workflow 7: Comp Cover Pattern Analysis

Purpose: decode the shelf before designing.

Prompt template:

```text
Build a comp analysis grid.
Genre: [genre and subgenre]
Format: 3x3 grid of nine reference cover thumbnails, using labeled placeholders if final images are unavailable.

Below the grid, create a pattern-notes panel covering:
- Dominant color palettes
- Typography conventions
- Composition patterns
- Title-to-author scale ratio
- Common motifs
- Negative space conventions
- Avoidable cliches
```

Use this as the research page of the designer brief.

## Workflow 8: Author Brand One-Pager

Purpose: create the author visual identity that persists across books.

Prompt template:

```text
Build an author brand one-pager.
Author: [name]
Genres: [genres]
Tone words: [three words]
Tagline: [tagline]

Include:
- Author name treatment, 3 variants
- Monogram or icon direction
- Brand color palette with hex values
- Brand typography rules
- Tagline treatment
- Author photo placeholders, square and circular
```

## Workflow 9: ARC And Pre-Order Asset Pack

Purpose: turn the locked cover direction into launch assets.

Required assets:

1. ARC reader welcome page.
2. Pre-order announcement card.
3. Cover reveal countdown card.
4. Quote graphic templates.
5. Bookmark layout.
6. Author signature card.

Use the locked cover composition, series system, and author brand one-pager as inputs.

## Workflow 10: Series Bible Visual Pages

Purpose: preserve consistency after Book 1.

Required pages:

1. Series cover spec sheet.
2. World visual palette.
3. Character visual reference grid.
4. Iconography sheet.
5. Type system page.
6. Book naming and numbering rules.

## Master Prompting Rules

- Be composition-specific. Name title placement, art zone, margins, and scale.
- Name the genre and subgenre.
- Always provide a tone triplet.
- Reference comparable titles when possible.
- Let Claude Design ask clarifying questions.
- Request explicit variations.
- Use the save-and-pivot pattern: "Save what we have and try a completely different approach."
- Cap refinement at three rounds: composition, type, color/finish.

## Genre Calibration Starter

| Genre | Composition | Type | Color | Failure Mode |
| --- | --- | --- | --- | --- |
| Romance | Character-forward | Script plus serif | Warm pastels or jewel tones | Dated self-pub look |
| Romantasy | Symbol-forward | Display serif | Black, gold, red | Type too thin |
| Thriller | Title-dominant | Bold sans | Black, white, one accent | Movie-poster knockoff |
| Cozy mystery | Illustrated scene | Hand-lettered display | Warm yellows, teals, cream | Too cute |
| Epic fantasy | Landscape or figure | Modified serif | Earth tones, one accent | Stock-art feel |
| Grimdark | Fragment or partial figure | Distressed serif or slab | Ash, oxblood, desaturated | Too pretty |
| Literary fiction | Object or abstraction | Modern serif | Limited palette | Over-clever |
| Horror | Negative space | Distressed or clean sans | Black plus one accent | Cliche gore |
| Hard sci-fi | Object or geometry | Geometric sans | Blue, white, restrained neon | Tech-magazine look |
| Space opera | Vista, ship, planet | Modern sans | Deep blues, orange, white | Generic NASA look |
| Business nonfiction | Single concept image | Bold sans | High contrast | Slide-deck look |
| Memoir | Object or portrait | Intimate serif | Muted warm palette | Textbook feel |
| YA contemporary | Character or photo | Modern sans | Saturated color | Reads middle-grade |
| YA fantasy | Symbol-forward | Decorative display serif | Jewel tones | Reads too adult |

## Production Handoff Rules

- Claude Design output is design intent, not the final cover.
- Convert the locked mockup into an image-generation prompt that preserves negative space and art-zone needs.
- Use Photoshop or Affinity for retouching, typography execution, final hierarchy, and raster export.
- Use InDesign, Affinity Publisher, KDP, or IngramSpark for wraps, spine, bleed, trim, CMYK, and 300 dpi output.
- Keep the Claude Design PDF as a review and handoff artifact.

## Pitfalls

1. Treating Claude Design as a finished art generator.
2. Generating images before locking composition.
3. Over-iterating past three refinement rounds.
4. Prompting vaguely.
5. Ignoring clarifying questions.
6. Designing series books as one-offs.
7. Trusting comments that may disappear instead of pasting notes into chat.
8. Uploading mockup PDFs as print-ready files.

## Quick Reference

- Research and brief: Workflows 7 and 4.
- Concept: Workflows 1 and 2.
- System: Workflows 3 and 8.
- Generation: Midjourney, Flux, or image pipeline.
- Finishing: Photoshop or Affinity.
- Marketing: Workflows 5, 6, and 9.
- Maintenance: Workflow 10.

Three-word rule: every prompt includes genre plus tone triplet.
Three-round rule: cap refinement at three passes.
One-lock rule: composition locks before image generation.
