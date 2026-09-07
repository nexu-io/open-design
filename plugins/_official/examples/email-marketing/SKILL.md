---
name: email-marketing
description: "A reference-first product-launch email with a masthead, hero, headline lockup, body copy, primary CTA, specifications grid, and compliance footer."
license: MIT
metadata:
  author: Open Design
  version: "0.1.1"
---

# Email Marketing

Use this skill when the user wants a marketing email in the visual and information pattern of the supplied Email Marketing reference.

## Best for

- product-launch emails
- newsletter campaigns
- promotional email blasts

## Reference-first workflow

1. Read `template.json` completely before creating the deliverable.
2. Copy `example.html` as the literal starting file. `example.html` is the canonical, renderable reference; do not rebuild the layout from memory, a screenshot, or a new design system.
3. Map the user's source material into these editable regions: brand and campaign identity, product hero, headline and body copy, primary CTA, proof or specification blocks, and compliance footer.
4. Replace content and data only where needed. Preserve the reference DOM hierarchy, CSS tokens, spacing, responsive behavior, and visual signature unless the user explicitly requests a visual change.
5. Use only supplied facts. If a product claim, specification, URL, address, or legal detail is missing, mark it clearly as `To confirm` instead of inventing it.
6. Produce one self-contained HTML file. Keep imagery as inline SVG, CSS, or data URIs; do not add a runtime dependency on the network.
7. Render and inspect the result at both desktop email width and the mobile breakpoint before delivery.

## Required information structure

- masthead with brand identity
- product or campaign hero
- eyebrow and headline lockup
- concise supporting copy
- one primary CTA
- proof points or specifications
- sender, unsubscribe, and view-in-browser footer

## Visual invariants

- Keep the centered 600–680px single-column email composition on a tinted page background.
- Preserve the warm paper palette, orange-red accent, oversized condensed headline, and product-focused hero treatment.
- Keep one dominant CTA and use the accent sparingly so the hierarchy remains clear.
- Preserve the mobile behavior at 540px: hide secondary navigation, reduce the headline, and retain readable two-column proof points.

## Email compatibility gate

- Keep the artifact self-contained and usable without external fonts, images, scripts, or network requests.
- Preserve semantic sections and straightforward layout primitives so the result can be adapted to table-based email delivery when required.
- Do not add interactions that only work in a full browser page.
- Confirm the complete campaign reads in order from masthead through the compliance footer without clipping.

## Output checks

- The result visually matches `example.webp` at first glance.
- The desktop render remains centered and no wider than 680px.
- The mobile render remains readable at 480px with no horizontal overflow.
- The CTA is singular and visually dominant.
- The footer retains sender identity, unsubscribe, and view-in-browser affordances.
- The final HTML contains the user's actual content rather than lorem ipsum, placeholder images, invented claims, or invented specifications.
