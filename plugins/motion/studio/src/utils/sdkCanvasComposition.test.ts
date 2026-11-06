// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openComposition } from "@hyperframes/sdk";

/**
 * linkedom's HTMLCanvasElement constructor calls `createCanvas(300, 150)` from
 * the Node-only `canvas` package. linkedom guards that import in a try/catch —
 * try the native package, fall back to its own bundled shim — but a bundler
 * resolves the require statically, so the catch never fires in the browser
 * build and `createCanvas` lands undefined. Parsing any `<canvas>` tag then
 * throws, `openComposition` rejects, and Studio silently loses its SDK session
 * for the whole composition (no cutover, and the resolver shadow does not run
 * either).
 *
 * Production telemetry, 72h after the v0.8.47 flip: 1065 of 1544
 * `studio:sdk_session_unavailable` events were this crash, spread across a
 * large share of 197 users. Canvas is common in compositions — Three.js,
 * shaders, particle effects, charts.
 *
 * The fix is a `resolve.alias` in the studio's vite config pointing `canvas` at
 * linkedom's own shim. This test pins the behaviour the alias has to preserve.
 */
const CANVAS_COMPOSITION = `<!doctype html>
<html>
  <body data-composition-id="main" data-width="1920" data-height="1080">
    <div class="clip" data-start="0" data-duration="3">
      <canvas id="scene" width="800" height="600"></canvas>
    </div>
  </body>
</html>`;

describe("openComposition with a <canvas> element", () => {
  it("opens a session instead of throwing on createCanvas", async () => {
    const session = await openComposition(CANVAS_COMPOSITION, { history: false });
    expect(session).toBeTruthy();
    session.dispose();
  });

  it("models the canvas element so edits can target it", async () => {
    const session = await openComposition(CANVAS_COMPOSITION, { history: false });
    // A composition whose elements cannot be modelled is a session the cutover
    // path declines wholesale (sessionEmpty), which is the same silent bypass by
    // a different route.
    expect(session.getElements().length).toBeGreaterThan(0);
    session.dispose();
  });
});

describe("canvas browser-stub alias", () => {
  // The two tests above pass with OR without the fix: vitest resolves
  // `require('canvas')` at runtime, so linkedom's own try/catch fallback works
  // here. Only the bundled build breaks. Nothing else in this suite can observe
  // the bundler, so the alias itself is what has to be pinned — without this,
  // deleting the alias reintroduces a crash that is invisible until it reaches
  // production telemetry.
  it("is configured, so the browser build never resolves the Node canvas package", () => {
    const config = readFileSync(resolve(import.meta.dirname, "../../vite.config.ts"), "utf8");
    expect(config).toMatch(
      /\bcanvas:\s*local\('\.\/src\/shims\/canvasBrowserStub\.js'\)/,
    );
  });

  it("exports the createCanvas shape linkedom destructures", async () => {
    const stub = await import("../shims/canvasBrowserStub.js");
    // linkedom takes the DEFAULT import and destructures createCanvas off it
    // (`import Canvas from '...'; const {createCanvas} = Canvas`), so the
    // default export is the one that actually has to carry the function.
    expect(typeof stub.default.createCanvas).toBe("function");
    expect(typeof stub.createCanvas).toBe("function");
    const canvas = stub.default.createCanvas(300, 150);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
    expect(canvas.getContext()).toBeNull();
  });
});
