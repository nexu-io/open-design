import { defineConfig } from "vitest/config";

/**
 * scene3d's tests are unusual: several of them spawn a real headless
 * Blender and compile a scene end to end. That is deliberate — the whole
 * point of this package is that its guarantees are measured on real
 * artifacts rather than mocked — but it makes the suite resource-bound
 * rather than CPU-bound.
 *
 * Run test files one at a time. In parallel, two or more Blender processes
 * contend for memory and the GPU-less render path, and a compile that
 * finishes comfortably on its own overruns its timeout. That presents as a
 * test which passes in isolation and fails in the full run — the exact
 * shape of flake that teaches people to re-run the suite instead of
 * reading it.
 *
 * The cost is wall-clock time on a suite that is already dominated by
 * subprocess latency, so serialising buys reliability for very little.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    // A cold Blender start plus a compile is comfortably over the 5s
    // default; this is sized to the slowest real compile in the suite with
    // headroom, not to the average.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
