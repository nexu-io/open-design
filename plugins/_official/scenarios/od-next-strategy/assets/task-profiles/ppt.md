# OD Next Presentation Task Profile v2.0.0

> Rollout: active

Task routing, clarification, Build, and the ship-on-write boundary follow the
general orchestration Skill. Profile field semantics and the artifact
contract bind to the V2 machine contract at the recorded taskProfileVersion.

## Profile fields

Resolve audience, purpose, speaking time or page budget, source material and
locked scope, story arc, data sources, brand references, and presentation
format. Freeze type, color, page grid, margins, chart language, imagery, and
section rhythm in the Design Spec. Record the chosen narrative structure in
the Task Profile.

Never silently omit a missing field: decide per the general orchestration
Skill whether to enter the clarification stage, or convert the gap into an
explicit assumption with its risk disclosed in prose.

Quality focus: narrative coherence, one clear point per slide, readability,
truthful data, layout fitted to content, and consistency across the deck.

## Artifact contract

The canonical deliverable is fixed: one editable single-file HTML deck with a
stable entry, complete content and slide order, openable and pageable from
Open Design's real entry point, with no overflow or cropping.

- The Agent generates and modifies only the HTML primary deliverable; it
  never generates, previews, exports, or validates PPTX or PDF.
- PPTX, PDF, and other formats are produced by Open Design's product-side
  engineering after the HTML primary deliverable is written; they are outside
  the Agent's responsibility. The Agent does not claim an output that the
  declared production route did not create.
- Even when the user's request mentions PPTX or PDF, complete the HTML
  primary deliverable first; never probe for Keynote, PowerPoint,
  LibreOffice, print-to-PDF routes, or PDF libraries, and never implement a
  format converter.
- Rules in the general orchestration Skill concerning export routes,
  exporters, editable formats, or derived deliverables apply only when the
  current task contract explicitly assigns them to the Agent; they never
  apply to PPTX or PDF.

This boundary is an Open Design product runtime boundary, not a default
design preference a prompt can override. Writing the single-file HTML to disk
IS the delivery: no previewing, no paging back through slides, no
slide-by-slide inspection, and no generating, opening, previewing, or
exporting of PPTX or PDF. Never describe a PPTX or PDF that the product-side
route has not yet produced as completed output.

## Build Requirements

Global priority follows the Core System Prompt; this profile establishes no
separate order. Where higher-level instructions and the contract are silent,
edit tasks carry forward the confirmed brand guidelines, the existing deck,
and existing templates; user references apply only within their designated
scope; this profile's defaults fill only what remains unspecified.

### Choose a proven narrative structure

When the user specifies no storyline, pick a proven structure by purpose as
the skeleton, then trim it to the content — never invent a structure from
scratch:

| Purpose | Structure | Slides | Ordering |
|---|---|---|---|
| Strategy decision | Status quo — problem — proposal — trade-offs — decision request | 8–12 | Lead with conclusions; give each decision point its own slide |
| Solution proposal | Goal — insight — solution — implementation path — benefits and risks — next steps | 10–15 | The insight carries the proposal's credibility; never omit it |
| Pitch | Hook — problem — solution — product — traction — market — business model — team — funding ask | 10–12 | Front-load traction; the earlier the evidence, the more credible |
| Training | Learning objectives — concept — example — exercise — recap | 15–30 | Follow every concept immediately with an example; never stack theory in one block |
| Retrospective report | Conclusions — key metrics — what was done — what worked and what didn't — next steps | 10–15 | Put the conclusion and the verdict on the first slide; never open with a chronological account |
| Case study | Customer background — prior pain — solution — quantified results — replicability | 8–12 | Results must be quantified; otherwise fall back to describing the pain |

Advance the narrative by alternating "current pain → a better possibility".
Place one rhythm break at roughly the 1/3 mark and another at the 2/3 mark of
the deck (a full-slide image, a single large number, or a whitespace slide);
never hold the same density throughout.

### Make every slide state one main conclusion

- Follow the narrative structure already settled; never change the
  presentation's goal on your own.
- Organize each slide around one main message.
- Write titles as conclusions, not column labels: "Customer acquisition cost
  down 42% in three months", not "Market analysis" or "Solution".
- When content runs long, split the slide or reorganize the hierarchy — never
  just shrink the text.

Generate conclusion titles and body copy by applying the copy formula for the
slide type:

| Slide type | Formula | Pattern |
|---|---|---|
| Opening hook | Contrast | "[old way] has stopped working; [new way] is happening" |
| Problem | Problem — escalation — consequence | "[pain point]? Every [period], [loss]" |
| Cost | Cost of inaction | "Left unsolved, it costs [quantified amount] every [period]" |
| Solution | Before — after — bridge | "From [status quo] to [goal], [solution] is the path" |
| Feature | Feature — advantage — benefit | "[feature] lets you [advantage], so you gain [benefit]" |
| Evidence | Evidence stacking | Quantified result + source + comparable |
| Action | Explicit ask | Open with a verb; spell out the audience's next step |

### Design for the presentation setting

- Keep titles, body copy, charts, and key figures legible under normal
  playback or projection conditions.
- Use whitespace and alignment to build order; never let elements hug the
  edges or spread evenly to fill the slide.
- Emphasize what the audience actually needs to remember; never let
  everything compete for attention at once.
- Keep supporting information — slide numbers, sources, footnotes — clear but
  understated.

### Build a layout system that is consistent yet varied

- Keep fonts, colors, spacing, graphic language, and slide margins
  consistent.
- Choose from the layout catalog by content relationship; never let every
  slide mechanically reuse one layout:

| Content | Layout |
|---|---|
| One dominant metric | Giant-number slide: the number dominates, one sentence of explanation |
| 3–4 parallel metrics | Metric board with equal-width columns |
| Two-way comparison | Split columns or a comparison table |
| 3–6 capability points | Card grid, icon on top, conclusion below |
| Progression over time | Timeline, no more than 6 nodes |
| Customer testimonial | Large-quote slide; the attribution and identity must be real |
| Process or architecture | Diagram slide: one main path, branches no more than two levels deep |
| Section transition | Full-slide whitespace or a full-bleed image, section name only |

- Cover, section, content, data, and closing slides belong to one system
  while differing in reasonable ways; vary density intentionally across them.
- Decorative elements must build brand feel, hierarchy, or rhythm; they must
  never interfere with the information.
- **Style-direction inference examples:** fundraising pitches lean confident
  high-contrast large type; academic and retrospective reports lean
  restrained serifs with data first; corporate training leans steady
  brand-color-driven layouts. Without a brand, pick by scenario and vocalize
  the choice in one sentence.

When the task configuration supplies the following values, execute them and
record them in the Design Spec:

- **Visual style** decides the palette, font pairing, and chart style: a
  data-dense style favors tables and chart density; a brand-forward visual
  style favors full-slide hero visuals and whitespace.
- **Per-slide information density** decides the load: the talk version
  carries one conclusion plus at most three supporting points per slide, with
  enlarged type and generous whitespace; the read version may carry full
  arguments and annotations, but still keeps one main conclusion per slide.

### Avoid deck clichés

- Apply the core anti-cliché defaults strictly: no warm beige / cream slide
  grounds by default, no stock UI faces as display type, no invented metrics.
- Avoid the gradient-wash title slide with an oversized headline floating on
  a colored blur; a cover earns attention through typography, a real image,
  or one strong graphic device.
- Never put an icon beside every bullet or heading; icons appear only where
  they add meaning.
- Never center-align every slide; alignment follows the layout catalog above.
- Avoid decorative corner blobs, floating orbs, and abstract 3D shapes used
  as page filler.

### Express data and relationships accurately

- Choose charts and graphics by the relationship: comparison, trend,
  sequence, composition, distribution, process, or flow.
- Highlight the data that carries the conclusion; de-emphasize secondary
  information.
- Retain the necessary data sources, units, and time ranges; never fabricate
  metrics, quotes, customer claims, or citations.
- Never use visual effects to exaggerate or distort data relationships.

### Use visual assets that work

- Images, icons, charts, and diagrams should help the audience understand
  the content, not fill empty space.
- Keep assets sharp and stylistically consistent; avoid visible stretching,
  unbalanced cropping, and low-quality screen captures.
- When people, product, or scene imagery spans multiple slides, keep subject,
  tone, and visual language consistent.
- When the user provides a brand template, carry its layouts and visual
  assets forward first.

### Quality floor

Meet the following in one pass, while writing the source:

- The storyline holds: the titles alone, read in sequence, tell the full
  story, and each slide's main point is clear.
- Content and data are credible: every number carries its source, unit, and
  time range; locked copy is preserved verbatim — never deleted or altered.
- The deck is visually consistent: cover, section, content, data, and closing
  slides share one set of fonts, one palette, and one margin system; slides
  vary in rhythm but never drift.
- Typography sizes type and containers to the content volume; never write a
  layout that would overflow, crop, or force extreme small type. Pick body
  colors for ≥4.5:1 contrast against the background, and never let body type
  fall below the deck-wide minimum.
- No placeholder text remains.
- Edit tasks touch only the affected slides, keeping the slide-flow structure
  and every slide outside the authorized scope exactly as they were.
- The output is a genuinely usable, still-editable single-file HTML; never
  describe a PPTX or PDF that Open Design's engineering has not yet produced
  as completed.

## Build Packages

Simple mode owns the full narrative. Complex mode may split complete
chapters, each finishable independently, only after the story arc, data
definitions, page grid, and Design Spec are frozen. Each package returns a
complete ordered chapter, not disconnected individual pages.
