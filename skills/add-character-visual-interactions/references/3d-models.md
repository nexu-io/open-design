# 3D Model Route

## Supported Formats

Prefer GLB/GLTF. Support FBX when supplied. Do not claim OBJ support in the first version because it lacks a reliable animation and hierarchy contract.

Use Three.js only for the 3D route. Reuse the installed version when present; add it only when the requested model requires it and the user accepts the dependency.

## Inspect Before Animating

Load the model and traverse its hierarchy. Record meshes, groups, bones, animation clips, material warnings, bounds, and component names. Confirm whether body, eyes, wings, or other parts are independently controllable.

When parts are welded but geometrically separable, split only when geometry provides an unambiguous boundary. Otherwise report the asset limitation instead of guessing.

If the requested local motion needs a head, eye, wing, or other pivot that the asset cannot provide, stop before implementation. Ask for a corrected asset or explicit approval for a reduced effect such as whole-character target following. Never present whole-model shaking as local animation.

## Normalize the Asset

Use model bounds to compute center and scale. Place the visible subject around a stable root group and keep camera framing independent from source-unit scale. Cap renderer pixel ratio.

Create rotation pivots at anatomical roots. For wings, pivot at each wing root and animate left and right parts with mirrored motion. Small and large wings may use a slight phase offset. Never shake the whole model to imitate local animation.

## Motion Constraints

Apply yaw to the stable root, allow only a small bounded pitch, and keep roll at zero unless explicitly required. Prevent flips and continuous rotation. Use shortest-path interpolation for turns.

## Failure Fallback

Model loading, unsupported materials, missing WebGL, or renderer creation must never block the page. Remove or hide the failed visual surface, preserve all functional content, and report the visual limitation. Do not redirect, disable controls, or change authentication behavior because a decorative asset failed.

## Cleanup

On unmount, cancel animation frames, disconnect observers, remove listeners, dispose geometries, materials, textures, and the renderer, then detach the canvas. The 3D code and assets must not load on unrelated routes.
