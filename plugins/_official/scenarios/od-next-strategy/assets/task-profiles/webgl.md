# OD Next WebGL Task Profile v3.1.1

Deliver HTML with actual GPU, shader, or 3D interaction, with route=webgl-html and kind=interactive. Choose a WebGL technique appropriate to the request; a static image is not a real-time effect.

Use canvas.getContext('webgl2'), with a readable unsupported-capability message or working webgl fallback when necessary. Record shader compilation errors, cap DPR at 2, and update canvas resolution and viewport on resize. Manage animation through requestAnimationFrame, reduce work when the page is hidden, and release unused GPU resources. Keep text overlays readable and keyboard-accessible.

Separate the camera from the subject: when the model is at the origin, move the view an appropriate distance away instead of placing the camera inside geometry. Adapt framing to the canvas aspect ratio, keeping the subject fully visible with margins. Stop unnecessary drawing while paused and resume animation afterward. Pause requestAnimationFrame when the page is hidden to avoid continuous background GPU use.

Prefer one self-contained HTML file; declare and bundle Worker/WASM dependencies when actually needed. The host recognizes WebGL/Worker/SharedArrayBuffer and supplies powered preview; do not bypass its sandbox. Meet quality and performance boundaries appropriate to the request, then deliver without claiming extra GPU compatibility testing.

## GPU and interaction rules

- Choose one primary technique for the effect: shader fields, ray marching, instanced geometry, or texture post-processing. Match the budget to object count; do not add large particle systems, post-processing, and performance counters by default.
- Check shader compilation and program linking, showing errors in generated code instead of a silent black screen. Handle context lost/restored. Use capped frame-time deltas for animation so returning to the page does not cause a large jump.
- Pointer events handle dragging, cancellation, and touch, with keyboard or button alternatives where needed. Overlays must not obscure the main visual. Respect reduced-motion and retain a usable static state.
- Prefer inline shaders, styles, and small textures. Reduce large asset resolutions appropriately and avoid repeatedly allocating GPU buffers or materials inside loops. Clean up listeners, frame loops, and GPU resources on pause/unload.
- Use alpha:false for opaque scenes. Choose overlay backgrounds or contrast for the scene's brightest region. Follow the existing design system's brand colors and keep titles or explanations clear of the main effect. Colors, title lengths, and "always 60fps" claims in old examples are not universal requirements or performance promises.
