# Reference analysis · 2026-09-22

Inspected rendered pages at 1280×720, including initial and scrolled states:

- [Shopify Editions Winter 2026](https://www.shopify.com/editions/winter2026)
- [Pear](https://pear.no/)

## Pear: observed structure

The loaded opening is a full-screen blue painterly scene with a classical figure
on the right, not a black blank screen. A 68px top band and 68px left rail form a
persistent fine-line frame. Another vertical rule sits near x=1095. The opening
serif heading begins near x=96, y=260; supporting text and a compact CTA sit below.
A horizontal rule at y≈520 introduces a small label and paragraph band. Small
crossing marks reinforce this fixed coordinate system.

Scrolling changes the scene behind that frame: figure and woven curtain expand,
a pale diagonal surface fills the view, then close-up pear branches and leaves
occupy the full viewport. Copy changes within the frame. The important behavior
is continuous image-scale/occlusion choreography, not isolated card entrance
animations. These observations do not establish the site's underlying renderer.

## Shopify: observed structure

The opening uses a full-bleed painted landscape and two large classical figures.
A fine outlined panel near x=470, y=128, width≈340px, height≈465px holds the edition
title, short introduction, and a dense vertical contents list with Roman numerals.
The header stays small and occupies the very top edge of the image.

After scrolling, the boxed contents disperse into a diagonal arrangement while
figures change scale and a bright circular transition appears. A later Sidekick
scene fills the viewport with a large figure and laptop, with a compact video
plate, left-hand chapter navigation, and editorial text. The reference's visual
identity comes from authored large scenes and transitions, not generic UI cards.

## Implementation mapping

| Observed device | Heritage implementation | Files |
|---|---|---|
| Fixed fine-line frame | Header, left progress rail, vertical registration | styles.css |
| Full-screen art | Three locally generated individual image masters | assets/generated/ |
| Contents inside imagery | Opening directory plus accessible modal menu | compose.ts |
| Scene scale/occlusion | Three native-scroll pinned camera stages | motion-runtime.ts |
| Dense/quiet alternation | Asymmetric atlas, material strip, quiet notes | compose.ts / styles.css |
| Scene-specific interaction | Image wipe, SVG trace, disclosure notes | motion-runtime.ts |

This is a structural and motion adaptation, not a pixel-identical reconstruction.
No copied reference artwork, 3D models, video, particle transition, or true depth
segmentation is included. The exterior master supplies crops of one camera view;
the interior is explicitly a separate artistic scene. The generation pipeline is
usable independently of the three bundled example assets.

## Acceptance rule for future generations

Start by comparing opening proportions, focal position, contents placement, and
start/middle/end scroll states against the observed reference structure. Changing
only palette and fonts does not satisfy the reference. Do not accept a final page
made from repeated heading-plus-image splits or composition placeholder SVGs.
