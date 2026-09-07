/**
 * Test-environment escape hatches, exported from the package so EVERY suite
 * that gates on an optional runtime can arm them — including host-side
 * suites (the daemon's real-Blender route test) that must not reach into
 * this package's tests/ directory across the repo's boundary rules.
 *
 * A `describe.skipIf(!hasBlender)` gate is correct on a developer machine
 * that never installed the optional runtime, but on an environment that is
 * SUPPOSED to carry it the same skip silently turns a missing install into
 * a green run. These assertions are inert by default and only bite when the
 * environment explicitly promised real coverage.
 */

/**
 * Throws when `SCENE3D_REQUIRE_BLENDER` is set but no Blender runtime was
 * found. Call with the file's own `hasBlender` boolean right after it is
 * computed from `probeBlender()`.
 */
export function assertBlenderIfRequired(hasBlender: boolean): void {
  if (process.env.SCENE3D_REQUIRE_BLENDER && !hasBlender) {
    throw new Error(
      "SCENE3D_REQUIRE_BLENDER is set but no Blender runtime was found — this environment promised real-Blender coverage",
    );
  }
}

/**
 * Throws when `SCENE3D_REQUIRE_PXR` is set but no pxr (OpenUSD) runtime
 * was found. Separate from `assertBlenderIfRequired` because pxr is a
 * different, independently-optional runtime.
 */
export function assertPxrIfRequired(pxrAvailable: boolean): void {
  if (process.env.SCENE3D_REQUIRE_PXR && !pxrAvailable) {
    throw new Error(
      "SCENE3D_REQUIRE_PXR is set but no pxr (OpenUSD) runtime was found — this environment promised real-pxr coverage",
    );
  }
}
