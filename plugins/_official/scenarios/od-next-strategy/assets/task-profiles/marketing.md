# OD Next Marketing Task Profile v2.1.0

> Rollout: active

The Core System Prompt owns general design goals and instruction priority.
Task routing, clarification, Build, and ship-on-write follow the general
orchestration Skill. Profile fields and the artifact contract bind to the V2
machine contract at the recorded taskProfileVersion.

## Profile fields

Resolve channel, dimensions and aspect ratio, audience, communication goal,
primary message and selling point, call to action, brand assets, locked copy,
applicable legal constraints, and required size variants. Record the chosen
visual concept, configured style, composition, safe areas, and variant rules
in the Design Spec. Preserve applicable legal and compliance requirements;
handle missing inputs through the general orchestration Skill's clarification
and assumption policy.

## Artifact contract

Deliver editable single-file HTML source artifacts with one canvas per
required size, sized to the channel specification. Record each required final
channel asset and its derivation from the source. Compose each size as its
own variant rather than mechanically scaling a single layout.

Open Design's product-side engineering renders final images and PDFs after
the HTML sources are written; these exports are outside the Agent's
responsibility. Writing each size's complete HTML source to disk IS delivery:
no image rendering, post-generation inspection, or export validation follows.
Never describe an image or PDF as completed before the product has rendered
it.

## Marketing goals

- **Connect the claim, evidence, and action.** Make the main selling point
  understandable at a glance, support it with relevant product information,
  and make the intended audience action clear. Secondary messages and fine
  print support the claim without obscuring it. Use direct, specific CTA
  wording suited to the communication goal.
- **Preserve brand and factual fidelity.** Carry forward the confirmed
  campaign system. Preserve supplied copy, prices, dates, campaign rules,
  copyright, and legal text verbatim. Keep logo proportions, colors, and
  required clear space intact. Do not invent capabilities, offers, awards, certifications,
  endorsements, testimonials, or other claims. Keep the product and key
  subjects recognizable and unobscured.
- **Fit the placement.** At the channel's displayed size and viewing distance,
  the main message, brand, and action remain legible and clear of crop or
  platform-overlay zones. Adapt composition and information density for each
  required size while retaining the same campaign idea. When distinct
  creative directions are requested, distinguish their composition, message
  emphasis, or visual concept, rather than only swapping colors.

## Canvas and print parameters

Configured dimensions take precedence. Otherwise use the channel default
below and state the selected specification in the delivery notes:

| Channel | Default canvas |
|---|---|
| Xiaohongshu | 1080×1440 (3:4), optionally 1080×1080 |
| WeChat Official Account | Header 900×383 (2.35:1); in-article images 900px wide |
| LinkedIn | Single-image post 1200×627; article header 1200×644 |
| Offline poster | A3 297×420mm, or the venue's required dimensions |

For print, build the HTML canvas at physical dimensions with 3–5mm bleed on
all sides and keep key content at least 5mm inside the trim line. Record the
print parameters in the delivery notes and Build Package: 300 DPI (150 DPI
acceptable for large format), CMYK, 3–5mm bleed, and pure black text in
single-ink black rather than four-color overprint. Product-side rendering
applies the print export parameters; the Agent does not produce the exported
image or PDF.

## Licensed assets

For outward-facing marketing collateral, real photographs must be user- or
brand-supplied licensed assets. A web-fetched image of a real entity can only
be a disclosed placeholder, not final photography. Do not generate a fake
stand-in for a named real referent. For fictional or illustrative subjects,
image generation may be preferred over fetching. When a required real subject
lacks a licensed asset, handle the gap through the orchestration missing-input
policy rather than silently using unlicensed final photography or a fake.

## Build Packages

Use simple mode for one concept and a small coherent variant set. Complex
mode may split independent creative directions or dimension groups only after
the key visual, core message, brand rules, source assets, and Design Spec are
frozen. Every package names its exact output sizes and shared source
dependency and composes each size individually.
