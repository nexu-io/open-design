# Image generation prompt system

## Shared visual anchor

Museum-grade editorial photography and architectural visualization. Restrained
Chinese heritage palette derived from real material rather than decorative
“Chinese style”. Documentary optical behavior, natural perspective, coherent
camera, physically plausible light, subtle grain, low saturation, deep but not
crushed blacks, no text, no logo, no fake calligraphy, no lantern decoration,
no purple/blue tech gradients, no gold luxury treatment, no generic tourism
poster composition.

## Continuity rule

For `scene_master` assets, one generated/rendered master defines the camera.
Depth maps and masks must be derived from that master. Never request separate
background/mid/foreground generations for the same camera scene.

## Per-slot additions

The runtime combines the shared anchor with:

1. subject identity and only documented facts from `inputs.json`;
2. Subject DNA descriptors;
3. the slot `prompt` from `asset-manifest.json`;
4. responsive crop intent;
5. a no-text/no-logo directive.
