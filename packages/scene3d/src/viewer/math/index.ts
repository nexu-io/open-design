/**
 * Public barrel for the viewer's math engine.
 *
 * Two consumers read this one surface:
 *   - the Node test suite, which imports these functions directly, and
 *   - the browser kit runtime, into which esbuild bundles this module as an
 *     IIFE global (`S3DMath`) inlined into the page (see esbuild.config.mjs →
 *     kit-math.generated.ts).
 *
 * Because both run the SAME compiled code, the gizmo's math is finally the
 * math the tests cover — no inline re-implementation to drift from it.
 */
export * from "./projection.js";
export * from "./constraints.js";
export * from "./dynamics.js";
export * from "./harmonics.js";
export * from "./group-transforms.js";
