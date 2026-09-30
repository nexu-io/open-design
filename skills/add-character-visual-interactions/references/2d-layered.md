# Layered 2D Route

## Asset Contract

Prefer transparent, independently positioned assets for body, head, face, eyes, eyelids, and moving appendages. Record each part visual anchor and transform origin.

A single source image may be reused through CSS clipping when separate assets are unavailable, but treat this as page-specific. For reusable production work, request transparent layers rather than building a generic image segmentation system.

## Layering

Use a stable relative container and absolutely positioned visual parts. Keep page layout outside the character component so moving the character never changes form or navigation geometry.

Recommended order:

1. Body
2. Head mask or background repair layer
3. Head and face
4. Eyes and pupils
5. Eyelids and foreground details

Move pupils faster than the head. Move the head with smaller angles and stronger damping. Set transform origins at anatomical pivots, not element centers by default.

## Micro-Animation

Use CSS keyframes for blink closure and a page-local timer for randomized intervals. A typical blink lasts 120 to 180 milliseconds with several seconds between blinks. Clear every timer on unmount.

Do not move the full character to fake blinking, breathing, or wing motion. Animate the relevant layer. Add idle breathing only when requested and keep it below the threshold that shifts surrounding layout.

## Responsive Behavior

Scale from a constrained aspect ratio. At narrow widths, reduce opacity or hide the decorative character before allowing it to cover functional controls. Verify that long labels, validation messages, and loading states still fit.
