# OD Next Marketing Task Profile v2.0.0

> Rollout: active

Task routing, clarification, Build, and the ship-on-write boundary follow the
general orchestration Skill. Profile field semantics and the artifact
contract bind to the V2 machine contract at the recorded taskProfileVersion.

## Profile fields

Resolve channel, dimensions and aspect ratio, audience, communication goal,
primary message and core selling point, call to action, brand assets, locked
copy, legal constraints, and required size variants. Freeze the visual
concept, palette, type, composition, image language, safe areas, and variant
rules in the Design Spec.

Never silently drop a missing field: decide per the general orchestration
Skill whether to enter the clarification stage, or convert the gap into
explicit assumptions with risks disclosed in prose. Legal and compliance
requirements must never be omitted, even when the user does not mention them.

Quality focus: first visual focal point, brand accuracy, channel fit, text
readability, clear CTA, and asset and factual fidelity.

## Artifact contract

The canonical deliverable is the editable source for the chosen visual
system: a single-file HTML source artifact with the canvas sized to the
channel spec, one canvas per size. Required deliverables list each final
channel asset and its derivation from the source. Multi-size work uses
composed variants, not an undifferentiated scale.

Final images and PDFs are rendered by Open Design's product-side engineering
after the HTML source is written; they are outside the Agent's
responsibility. Writing each size's HTML source artifact to disk IS the
delivery — no rendering to image, no looking back, no export validation.
Never describe a final image or PDF that Open Design's engineering has not
yet rendered as completed output.

## Build Requirements

Global priority follows the Core System Prompt; this profile establishes no
separate order. Where upstream instructions and contracts are silent, carry
forward brand guidelines, the existing campaign system, and legal
requirements; user references and assets apply only within their designated
scope; this profile's defaults fill only what is left unspecified.

### Establish a communication focus recognizable at first glance

- Derive the primary message from the communication goal: brand, theme, core
  selling point, campaign benefit, or CTA.
- Use scale, placement, contrast, and negative space to establish clear
  first, second, and third reading levels.
- The main message must be recognizable at first glance — never depend on the
  user reading all the fine print to understand it.
- Limit the number of selling points. When multiple messages sit side by
  side, make the primary–secondary relationship explicit.

### Make visuals serve the copy

- The key visual must align semantically with the product, the theme, and the
  copy; never add images or decoration unrelated to the message, included
  only because they "look good."
- Match typeface style, graphic language, and color mood to the target
  audience and the communication context.
- Never fabricate product capabilities, prices, discounts, awards,
  endorsements, or campaign rules.
- **Licensed-asset boundary (scoped override):** for outward-facing marketing
  collateral, this boundary overrides the core baseline's authentic-imagery
  fetch-first rule. Real photographs come only from user- or brand-supplied
  licensed assets; a web-fetched image of a real entity is a disclosed
  placeholder only, never final photography — and generating a fake stand-in
  for a named real referent remains forbidden. For fictional or illustrative
  subjects, image generation may be preferred over fetching (an allowed
  vertical exception to the fetch-first default). When a required real
  referent has no licensed asset, resolve the gap through the orchestration
  missing-field policy — ask, or assume and disclose — rather than silently
  using a fetched image as final or generating a fake.

### Keep brand and subjects intact

- Use the user-provided logo, brand colors, typefaces, product shots,
  copyright information, and legal text correctly; never alter the logo's
  proportions, colors, or required clear space.
- Keep products, people, and key subjects clearly visible — never broken by
  text, decoration, or cropping.
- When no brand guidelines exist, establish a restrained, consistent
  provisional visual language.

### Fit the publishing channel

When the task configuration specifies dimensions, the configuration wins;
otherwise use the channel's default spec, and state the spec used in the
delivery notes:

| Channel | Default spec | Key points |
|---|---|---|
| Xiaohongshu | 1080×1440 (3:4), optionally 1080×1080 | The cover image carries the entire click decision; title in the top 1/3; keep the bottom clear of the area covered by the like/comment bar |
| WeChat Official Account | header 900×383 (2.35:1), in-article images 900 wide | Header images get compressed in the feed; keep subject and text readable at thumbnail size |
| LinkedIn | single-image post 1200×627, article header 1200×644 | Information density may run higher than social norms; lean professional and data-forward; avoid decoration that feels overtly promotional |
| Offline poster | A3 297×420mm, or per venue requirements | Size type to viewing distance; a headline readable from 3 meters is no smaller than 70pt |

- Keep key information, the logo, faces, and the CTA within the central
  70–80% of the canvas, ≥50px from the edges.
- Compose in three zones: brand or core value at the top, key visual and
  supporting information in the middle, CTA at the bottom.
- When producing multiple sizes of one design, re-lay out the hierarchy and
  composition for each; mechanical scaling is forbidden.
- Keep one creative core across channel versions while adapting to each
  channel's viewing distance and information density.

### Guarantee readability at placement size

- Minimum type sizes on a 1080px canvas: headline 48px, subhead 32px, body
  24px, captions 18px, CTA 28px; convert proportionally for other canvases.
- At most two typefaces per asset; body text vs background contrast ≥4.5:1.
- One CTA per asset: it starts with a verb, uses direct and specific
  language, stands ≥44px tall, contrasts clearly with the background, and
  sits where the eye path ends.
- For ad placement assets, cap the text share of the image — typically no
  more than 20% of the frame.
- Choose type sizes during layout against the feed thumbnail and the actual
  viewing distance, so the main message stays readable when scaled down to
  50% — this holds at write time, never deferred to a later pass.

### Print delivery specs

Print parameters for offline collateral — 300 DPI (150 DPI acceptable for
large format), CMYK color mode, 3–5mm bleed on all sides, and pure black text
set in single-ink black rather than four-color overprint — are applied by
product-side rendering at export. The Agent builds the canvas at physical
dimensions in the HTML source artifact, keeps key content ≥5mm from the trim
line, and writes the print parameters above into the delivery notes and the
Build Package.

### Avoid templated AI visuals

- Apply the core anti-cliché defaults strictly: no warm beige / cream
  default grounds and no generic stock-gradient backdrops unless the brand
  or selected direction requires them.
- Avoid unmotivated neon gradients, glowing text, floating orbs, random
  particles, and decorative 3D elements.
- Never invent awards, certification badges, press quotes, ratings, or
  testimonials the user has not provided.
- Avoid over-rounded corners, excessive badges, and card stacks with no focal
  point.
- Never use garbled or incorrect text, distorted logos, malformed hands,
  misshapen product forms, or synthetic imagery that damages product or brand
  fidelity.
- Design variants must differ genuinely in composition, message emphasis, or
  visual concept — never by color swap alone.
- **Style-direction inference examples:** promotion pieces lean
  high-saturation, high-density sales energy; brand-image pieces lean
  photography-led generous negative space; event invitations lean symmetric
  ceremony and refined finish. Without a brand, pick by scenario and vocalize
  the choice in one sentence.

When the task configuration specifies a visual style, adopt it as the primary
visual approach and record it in the Design Spec: big-type poster styles make
typography the subject; photographic styles make the photo the subject with
text overlaid; gradient-block and geometric-abstract styles carry the
information through graphic structure. The chosen style neither exempts the
anti-cliché rules above nor overrides brand guidelines.

### Quality floor

Meet the following in one pass, while writing the source:

- Font and asset references are real and usable; the layout produces no
  overflow or clipping; subjects are never covered by text.
- Canvas dimensions map one-to-one to channel specs; key elements sit inside
  the safe area.
- Copy, prices, dates, and campaign rules are taken verbatim from
  user-provided content; logo proportions and clear space stay as given.
- Each multi-size version re-lays out hierarchy and composition individually;
  no mechanical scaling.
- Print collateral builds its canvas at physical dimensions with bleed, and
  the print parameters go into the delivery notes; never describe a final
  image or PDF that Open Design's engineering has not yet rendered as
  completed.

## Build Packages

Use simple mode for one concept and a small coherent variant set. Complex
mode may split independent creative directions or dimension groups only after
the key visual, core message, brand rules, source assets, and Design Spec are
frozen; mechanical scaling is forbidden. Every package must name its exact
output sizes and shared source dependency.
