import { defineConfig } from "vitest/config";

/**
 * scene3d's tests are unusual: several of them spawn a real headless
 * Blender and compile a scene end to end. That is deliberate — the whole
 * point of this package is that its guarantees are measured on real
 * artifacts rather than mocked — but it makes those files resource-bound
 * rather than CPU-bound.
 *
 * In parallel, two or more Blender processes contend for memory and the
 * GPU-less render path, and a compile that finishes comfortably on its own
 * overruns its timeout. That presents as a test which passes in isolation
 * and fails in the full run — the exact shape of flake that teaches people
 * to re-run the suite instead of reading it.
 *
 * That contention is a property of the BLENDER files, not of the suite, so
 * the constraint lives on a project scoped to exactly those files instead
 * of on the whole run. Serialising every file — including the pure
 * TypeScript slices that never spawn a subprocess — paid Blender's
 * reliability tax on work that owes nothing.
 *
 *   unit    — pure TS (lint, solver, parser, viewer math, sheet decoding).
 *             Full file parallelism; these finish in seconds together.
 *   blender — the real-Blender integration files, one at a time, exactly
 *             as before. Keep this list in sync when adding a suite that
 *             calls `compile()`.
 *
 * A cold Blender start plus a compile is comfortably over the 5s default;
 * the timeout is sized to the slowest real compile in the suite with
 * headroom, not to the average. Both projects inherit it.
 */
const BLENDER_FILES = [
  "tests/atelier-pipeline.test.ts",
  "tests/findings2-real.test.ts",
  "tests/findings3-real.test.ts",
  "tests/formats.test.ts",
  "tests/kit-viewer.test.ts",
  "tests/master-carry.test.ts",
  "tests/master-parity.test.ts",
  "tests/pipeline.test.ts",
  "tests/real-assets.test.ts",
  "tests/shader-pipeline.test.ts",
  "tests/spec-pipeline.test.ts",
  "tests/uv-material-pipeline.test.ts",
  "tests/voxel-pipeline.test.ts",
];

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/*.test.ts"],
          exclude: [...BLENDER_FILES, "**/node_modules/**", "**/dist/**"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: "blender",
          include: BLENDER_FILES,
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
