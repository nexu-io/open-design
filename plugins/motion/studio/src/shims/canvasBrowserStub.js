/**
 * Browser stub for the Node-only `canvas` package.
 *
 * linkedom's `HTMLCanvasElement` constructor calls `createCanvas(300, 150)`
 * (300x150 being the HTML canvas default size). linkedom guards that import in
 * a try/catch: the try requires the native `canvas` package, and the catch
 * falls back to linkedom's own bundled canvas shim.
 *
 * That guard only works with a *runtime* require. Vite resolves the specifier
 * statically, so the bundled form is a plain assignment that cannot throw, the
 * catch never runs, and `createCanvas` lands `undefined`. Parsing any `<canvas>`
 * tag then throws inside `openComposition`, Studio loses its SDK session for the
 * whole composition, and every edit silently falls back to the server path — the
 * resolver shadow does not run either, so it was invisible until
 * `studio:sdk_session_unavailable` shipped in v0.8.47.
 *
 * Production telemetry over the 72h after the flip: 1065 of 1544 session-open
 * failures were this crash, across a large share of 197 users. Canvas is common
 * in compositions (Three.js, shaders, particle effects, charts).
 *
 * Aliasing `canvas` to this file makes the browser build resolve to a
 * measurement-only canvas, which is all linkedom's static parse needs — nothing
 * in the SDK rasterizes through it. It mirrors linkedom's own
 * `commonjs/canvas-shim.cjs`, reimplemented here because linkedom's `exports`
 * map does not expose that file.
 */

class BrowserCanvasStub {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  /** linkedom only ever needs the element to exist; nothing draws through it. */
  getContext() {
    return null;
  }
  toDataURL() {
    return "";
  }
}

export function createCanvas(width, height) {
  return new BrowserCanvasStub(width, height);
}

// linkedom consumes this as a DEFAULT import — `import Canvas from
// '../../commonjs/canvas.cjs'` then `const {createCanvas} = Canvas` — so the
// default export is the load-bearing one; the named export above is interop
// belt-and-braces.
export default { createCanvas };
