---
name: create-presentation-with-open-design
description: Create or refine a browser-rendered presentation with Open Design, including pitches, strategy decks, progress reviews, and teaching decks. Use only when the user explicitly selects or names Open Design; clarify native PPTX requests before generation.
---

# Create Presentation with Open Design

Apply `$open-design-basics`, then execute this presentation contract.

## Dynamic decision dimensions and execution

- Use `artifactType: presentation` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - The audience, room, and decision the deck should drive.
  - Narrative objective, core claim, and desired ending.
  - Slide count, presentation duration, and story structure.
  - Required evidence, data, source material, and content gaps.
  - Speaker notes, collaboration, and native PowerPoint requirements.
  - Brand source, reference deck, and visual cadence.
- Tailor choices around the requested story. An investor pitch, quarterly review, and teaching deck should receive different narrative and evidence options.
- Infer the normal output as a browser presentation with a real rendered preview. Put supplied narrative, data, slide count, audience, and brand constraints in `knownAnswers`; do not re-ask them.
- If the user requires a real `.pptx`, confirm that requirement before starting. Do not describe the browser deck as a native PowerPoint file.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `presentation` to the Open Design `slides` workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, a real deck entry file, and a real `previewUrl`. Verify a coherent narrative, readable slide frames, no clipped content, and the requested evidence or CTA. Open the exact Studio and preview URLs in separate in-app-browser tabs. A source-only deck with no rendered preview is incomplete.
