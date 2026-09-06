/**
 * Re-export of the runtime escape hatches from src/testing.ts — the single
 * source of truth, exported from the package so host-side suites (the
 * daemon's real-Blender route test) can arm the same hatches without
 * reaching into this tests/ directory across the repo's boundary rules.
 */
export { assertBlenderIfRequired, assertPxrIfRequired } from "../../src/testing.js";
