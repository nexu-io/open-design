# OD Next Image Task Profile v3.1.1

Resolve whether the user wants an image file or editable layout source; these are different deliverables. Use media-image / kind=image for actual binary images, photography, illustrations, or icons. When the user explicitly requests editable poster-layout source, use image-html / kind=source and deliver HTML, explaining that the product handles image export.

Generate images through the existing media CLI. First use `"$OD_NODE_BIN" "$OD_BIN" media --help` and generate --help to discover models and current parameters; do not guess model IDs. Confirm dimensions, aspect ratio, locked copy, reference images, and brand requirements. Send only necessary content to the user's configured media service. Use media generate --project "$OD_PROJECT_ID" --surface image --model <available-model> --prompt <request> --output <planned-file>. Do not call provider APIs directly or print credentials.

When a taskId is returned, use media wait <taskId> --since <nextSince>. Continue bounded waits while running; report failure and remaining gaps when it fails. Completion requires success and an actual image file. Do not substitute an HTML imitation or fabricate a PNG file. Do not enter a repeated evaluation loop after generation.

Poster-layout source must retain editable text, clear visual hierarchy, and type sizes and safe areas appropriate for the requested canvas. Compose each size separately rather than stretching it. Declare images and HTML source separately; neither substitutes for the other. Preserve the composition and confirmed brand assets during local edits.

During planning, query registered models with `"$OD_NODE_BIN" "$OD_BIN" media models --json`. Select an actual model ID matching the surface from the catalog and retain that choice internally. Use the same model in production; do not silently switch providers.

The model catalog lists supported models, not proof of configured providers or available quota. Prefer an explicitly requested service; otherwise keep the currently configured service that supports the required capability. Do not switch providers because of catalog order. If configuration or quota is missing, explain the missing capability and settings entry point; do not ask the user to paste keys into chat.

## Visual and content rules

- Establish one main message, then organize the main visual, supporting information, and call to action. Do not invent prices, awards, certifications, discounts, or testimonials for promotional images. Preserve locked copy verbatim; do not let generation arbitrarily rewrite brand names.
- Preserve logo proportions, colors, and clear space. Text and cropping must not damage the subject. Prefer user- or brand-authorized assets for public marketing photography. When permission is unconfirmed, a real entity's online photo may only be an explicitly labeled reference; do not generate a fake entity as a substitute for the specified product. Fictional or illustrated subjects may be generated directly.
- Reference type sizes for a 1080px canvas: title 48, subtitle 32, body 24, notes 18. Use at most two font families and body contrast of at least 4.5:1. Scale to the actual placement dimensions and keep primary information outside platform overlays.
- Compose hierarchy separately for each placement size; do not stretch or crop away information. Keep the main visual and brand consistent across a series. Editable HTML uses centralized styles and selectable text.
- For print, resolve physical dimensions, safety margins, bleed, and color requirements. Do not claim web RGB or an ordinary PNG has passed CMYK or print-shop acceptance. State limitations when tools cannot provide exact dimensions, transparency, or locked text; do not falsely claim compliance.

## Additional marketing-image rules (only when applicable)

- User-specified dimensions take precedence. Otherwise use these references: Xiaohongshu 1080×1440; WeChat article cover 900×383 and body image width 900; LinkedIn single image 1200×627; physical poster A3 or the venue's specification. Disclose the chosen size; do not apply these defaults to arbitrary illustrations or photographs.
- Keep key information, logos, faces, and CTAs within the central 70–80% of the canvas, at least 50px from edges on a 1080px canvas, clear of platform overlays. Prioritize multiple selling points. Recompose a series for different sizes rather than treating resizing or recoloring as a design variant.
- When conversion guidance is needed, use one CTA with a concrete, verb-led label. Reference size on a 1080px canvas: 28px text and at least 44px visual height. Advertising text usually occupies no more than 20% of the area, and the main message remains readable at 50% scale. Do not force text or buttons onto a pure illustration.
- Build print designs at physical size, with content at least 5mm inside the trim and 3–5mm bleed. Apply 300DPI (150DPI for large formats), CMYK, and single-color black text only when actual export capabilities support them; otherwise list them clearly as prepress requirements.
- Use actually available fonts and assets. Preserve prices, dates, promotion rules, and legal copy verbatim. Avoid unmotivated neon, glows, floating spheres, particles, excessive rounding, and unfocused stacks of cards. Do not accept garbled text, distorted logos, or subjects that undermine brand authenticity.
