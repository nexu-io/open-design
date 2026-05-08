# HTML-in-Canvas

Render live HTML as WebGL textures — GPU shaders, 3D geometry, and cinematic effects on any DOM content.

The HTML-in-Canvas API (`drawElementImage`) lets you capture live, rendered DOM elements directly into a canvas at GPU speed. This means you can take any HTML — dashboards, forms, landing pages, app UIs — and render them as textures in WebGL scenes with shaders, 3D transformations, and post-processing effects.

> **Chrome flag required for live preview only.** The `drawElementImage` API is experimental.
>
> 1. Open `chrome://flags/#canvas-draw-element` in Chrome or Brave
> 2. Set **CanvasDrawElement** to **Enabled**
> 3. Restart the browser
>
> HyperFrames enables this flag automatically during rendering (`--enable-features=CanvasDrawElement`), so rendered videos work without manual setup. The flag is only needed for live preview in the Studio.

When this skill runs inside Open Design, the daemon shells out to `npx hyperframes render`, which inherits the auto-enable. You do **not** need to add browser flags or pass extra CLI args from the agent.

## How it works

1. Place HTML content inside a `<canvas layoutsubtree>` element
2. The browser renders the HTML children as normal DOM
3. Wait for the canvas to paint, then call `ctx.drawElementImage(element, x, y, w, h)` to capture the rendered pixels
4. Use the canvas as a Three.js texture, apply shaders, map to 3D geometry

> **Always capture from a paint event.** The element snapshot the API draws from is only refreshed when the canvas paints. Calling `drawElementImage` during initial script evaluation can throw because the first snapshot does not exist yet; calling it outside `paint` after that point silently reads the *previous* snapshot. Drive both first-time capture and per-frame updates from `canvas.onpaint`, and use `canvas.requestPaint()` to ask for a fresh snapshot.

```html
<!-- 1. HTML content lives inside the canvas -->
<canvas id="capture" layoutsubtree width="1920" height="1080">
  <div class="my-dashboard">
    <h1>Revenue: $4.2M</h1>
    <div class="chart">...</div>
  </div>
</canvas>

<!-- 2. WebGL canvas for 3D rendering -->
<canvas id="theater" width="1920" height="1080"></canvas>
```

```javascript
// 3. Capture HTML to canvas — wait for paint so the element snapshot exists
var capCanvas = document.getElementById("capture");
var ctx = capCanvas.getContext("2d");
var texture, material;

capCanvas.onpaint = function () {
  ctx.drawElementImage(capCanvas.querySelector(".my-dashboard"), 0, 0, 1920, 1080);
  if (!texture) {
    // 4. Use as Three.js texture
    texture = new THREE.CanvasTexture(capCanvas);
    material = new THREE.MeshBasicMaterial({ map: texture });
  } else {
    texture.needsUpdate = true;
  }
};

// Kick off the first paint; subsequent re-captures call requestPaint() again
capCanvas.requestPaint();
```

## What makes this different

Traditional approaches like `html2canvas` re-parse and re-render the DOM in JavaScript — they're slow, lossy, and miss CSS features like `backdrop-filter`, complex shadows, and web fonts. The `drawElementImage` API uses the browser's own compositor, so:

- **Pixel-perfect** — every CSS feature is supported because the browser renders it natively
- **GPU-accelerated** — captures at 60fps, fast enough for real-time animation
- **Live content** — the HTML can animate, scroll, and change between captures
- **Multiple captures simultaneously** — no nesting restrictions; multiple `<canvas layoutsubtree>` elements can capture different content in the same composition

## Feature detection

Always feature-detect before using the API. Compositions should fall back gracefully for browsers without the flag enabled. (Render path is always fine — the fallback only matters when a user opens the composition in a browser without `CanvasDrawElement`.)

```javascript
function isSupported() {
  var tc = document.createElement("canvas");
  if (!("layoutSubtree" in tc)) return false;
  tc.setAttribute("layoutsubtree", "");
  var ctx = tc.getContext("2d");
  return ctx && typeof ctx.drawElementImage === "function";
}

if (isSupported()) {
  ctx.drawElementImage(element, 0, 0, w, h);
} else {
  // Fallback: draw text directly on canvas, use static image, etc.
}
```

## Re-capturing every frame

For animated content (scrolling, transitions, counters), drive the capture from the canvas's `paint` event and ask for a fresh snapshot each frame with `requestPaint()`. Calling `drawElementImage` directly from the render loop reads the *previous* paint's snapshot, which on seek-driven HyperFrames renders shows up as a stale or frozen first texture.

```javascript
// Capture runs whenever the canvas paints, so the snapshot is always fresh
capCanvas.onpaint = function () {
  ctx.clearRect(0, 0, W, H);
  ctx.drawElementImage(htmlElement, 0, 0, W, H);
  texture.needsUpdate = true;
};

function render() {
  // Update HTML state
  scrollContainer.style.transform = "translateY(-" + scrollOffset + "px)";
  counterEl.textContent = Math.round(currentValue);

  // Schedule a fresh snapshot; the onpaint handler above runs the capture
  capCanvas.requestPaint();

  // Render 3D scene with updated texture
  renderer.render(scene, camera);
}
```

When a HyperFrames timeline drives the underlying HTML (counter ticks, scroll animation), the render loop must run on every frame the texture is visible — otherwise the WebGL surface freezes on the first capture and the user sees a static screen embedded in your 3D scene. This is the most common reason an HTML-in-Canvas composition "looks dead" after rendering.

## Catalog blocks

Install all HTML-in-Canvas blocks at once:

```bash
npx hyperframes add html-in-canvas
```

Or install individually:

| Block | Description | Install |
|-------|-------------|---------|
| Liquid Glass | Voronoi glass fracture with parallax reveal | `npx hyperframes add vfx-liquid-glass` |
| iPhone & MacBook | Real 3D GLTF devices with live HTML screens | `npx hyperframes add vfx-iphone-device` |
| Text Cursor | Dramatic text reveal with chromatic shadows | `npx hyperframes add vfx-text-cursor` |
| Portal | Dimension breach with volumetric light | `npx hyperframes add vfx-portal` |
| Shatter | HTML shatters into glass fragments | `npx hyperframes add vfx-shatter` |
| Magnetic | Magnetic field particle visualization | `npx hyperframes add vfx-magnetic` |
| Liquid Background | Organic liquid simulation | `npx hyperframes add vfx-liquid-background` |

Block reference pages live at `https://hyperframes.heygen.com/catalog/blocks/<name>`.

## Rendering

HyperFrames enables the Chrome flag automatically during rendering. No special configuration needed:

```bash
npx hyperframes render --output my-video.mp4
```

For Docker renders, the flag is also enabled automatically inside the container. Inside Open Design, the daemon's `npx hyperframes render` call (`apps/daemon/src/media.ts`) inherits the same default — you don't need to thread anything through.
