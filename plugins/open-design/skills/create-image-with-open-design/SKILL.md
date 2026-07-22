---
name: create-image-with-open-design
description: Create or refine a static image artifact with Open Design, including campaign visuals, product imagery, editorial illustrations, posters, and social graphics. Use only when the user explicitly selects or names Open Design and wants an image rather than a website or motion artifact.
---

# Create Image with Open Design

Apply `$open-design-basics`, then execute this image contract.

## Dynamic decision dimensions and execution

- Use `artifactType: image` for `collect_brief`, `create_project`, and `start_run`.
- Treat the following as decision dimensions to consider only when unknown and outcome-changing, never as fixed form rows or a checklist to ask in full:
  - The image's use, placement, and communication job.
  - Primary subject, message, and required product or brand assets.
  - Aspect ratio, crop behavior, text-safe area, and variant count.
  - Composition, environment, camera or illustration posture, and emphasis.
  - Visual medium, reference style, palette, and brand fidelity.
  - Audience or channel only when it changes the composition or tone.
- Tailor choices to the requested use. A hero image, app-store graphic, editorial illustration, and event poster need different composition and format options.
- Put supplied subject, copy, palette, reference assets, aspect, and placement in `knownAnswers`; do not re-ask them or request a free-text image prompt.
- Call `create_project`, then `start_run` with the confirmed structured brief. The server maps `image` to the Open Design image media-generation workflow.

## Delivery standard

Require a successful terminal run, `artifactCount > 0`, at least one readable image file, and a real `previewUrl`. Verify the selected subject, direction, format, and requested variants. Open the exact Studio and preview URLs in separate in-app-browser tabs. A prompt, placeholder, or metadata record without an image file is incomplete.
