---
name: wireframe-mobile-flow
description: |
  A lo-fi multi-screen MOBILE flow wireframe — three or four phone frames
  laid out in a row on a board, showing a connected user flow (Onboarding →
  Home feed → Item detail → Confirm). Grey-box content inside each device,
  dashed connector arrows + numbered step labels between screens, and a
  couple of annotation callouts. Reads like an app flow pinned to a
  whiteboard before any pixels are committed. Use when the brief asks for
  "mobile wireframe", "app flow", "user flow wireframe", "lo-fi mobile",
  "low fidelity", "线框图", "移动端线框", or "App 流程".
triggers:
  - "mobile wireframe"
  - "app flow"
  - "user flow"
  - "lo-fi mobile"
  - "wireframe"
  - "low fidelity"
  - "移动端线框"
  - "App 流程图"
od:
  mode: prototype
  platform: auto
  scenario: design
  fidelity: wireframe
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
    sections: [color, typography, layout, components]
  example_prompt: "Wireframe a lo-fi mobile flow v0.1 — three phone frames in a row (Onboarding → Home feed → Item detail), grey-box screens, dashed step arrows between them, and two annotation callouts."
---

# Wireframe Mobile Flow Skill

Produce a single board showing a mobile app's user flow as a row of lo-fi
phone frames. The point is the *flow* — how a user moves screen to screen —
not the polish of any one screen. Keep the screens clean grey-boxes (not
scribbly) but keep the connectors and annotations loose and informal.

## Workflow

1. **Skip the DESIGN.md** if it pushes for finished UI. This skill is
   deliberately low-fidelity: greyboxes, placeholder rects, and bars stand in
   for real content. Honor type tokens only loosely (system sans for the
   board, mono for labels and datelines).
2. **Pick the flow steps** from the brief — typically 3–4 connected screens
   like Onboarding → Home feed → Item detail → Confirm. Name each step so the
   connector arrows can carry a numbered, verb-first label ("① tap Start",
   "② open item", "③ add to cart").
3. **Lay out the board**, in order:
   - **Board header** — bold sans title with a pinned "WIREFRAME v0.1 ·
     MOBILE" tag (dashed border, slight rotation) and a mono dateline on the
     right (date / device / fidelity).
   - **Phone row** — 3–4 rounded device frames (~240–280px wide) in a
     horizontal row, each with a notch / status bar. Inside each frame put
     the greybox content for its step: hero image-placeholder (rect + X),
     title/price bars, list cards (thumbnail X + 2 text bars), category
     chips, a bottom tab bar, sticky CTA bars, a confirm checkmark — match the
     screen's role.
   - **Connectors** — dashed arrows between consecutive phones, each carrying
     a small mono step label describing the tap that advances the flow.
   - **Annotations** — 1–2 small sticky / callout notes pinned near a screen
     to flag intent ("hero must sell value in 3s", "checkout = 1 screen").
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline, no external JS, no
     external images (CSS/SVG placeholders only).
   - Use Inter / system-ui for the board and IBM Plex Mono for labels via
     Google Fonts; a light marker font is allowed for annotations only.
   - Defined dark device-frame borders, medium-grey content blocks on white
     screens, and a single accent color for arrows and annotations so the
     board reads clearly even as a small thumbnail.
   - `data-od-id` on the header, each phone screen, the connectors, and the
     annotations.
5. **Self-check**:
   - The three main phones are visible in a ~1280px viewport; the flow reads
     left-to-right.
   - Screens are clean greyboxes (not scribbly); connectors and stickies are
     the loose, informal parts.
   - No near-white-on-white regions — every block has a visible grey fill or
     border. If a screen renders blank as a thumbnail, raise the contrast.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="wireframe-slug" type="text/html" title="Wireframe — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
