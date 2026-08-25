/**
 * Every real-Blender (or real-pxr) suite gates itself with
 * `describe.skipIf(!hasBlender)` / `it.skipIf(!pxrAvailable)`, which is
 * correct for a developer machine that never installed the optional
 * runtime — but on a CI image that is SUPPOSED to carry Blender/pxr, the
 * same skip silently turns a missing install into a green run: five of
 * six pipeline stages never execute and nothing records that.
 *
 * These two assertions are the escape hatch. They are inert by default —
 * call them right after the file resolves its probe, and they do nothing
 * unless the environment explicitly promised real coverage.
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
