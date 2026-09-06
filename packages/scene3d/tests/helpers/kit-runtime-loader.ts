import { KIT_RUNTIME_JS } from "../../src/viewer/kit-runtime.js";

/**
 * Evaluate the kit runtime bundle and hand back its pure container-reading
 * functions. Shared by the unit-project page tests and the real-export
 * Blender suite so both parse GLBs with the byte-identical code the shipped
 * page runs — a second loader is how the two would drift.
 */
export function loadRuntime(): {
  parseGlb: (buffer: ArrayBuffer) => { json: any; bin: ArrayBuffer };
  readAccessor: (gltf: any, bin: ArrayBuffer, index: number) => ArrayLike<number>;
  textureSourceInfo: (
    gltf: any,
    bin: ArrayBuffer,
    index: number,
  ) => { mime: string; bytes: Uint8Array; sampler: unknown } | null;
} {
  const factory = new Function(
    `${KIT_RUNTIME_JS}\nreturn { parseGlb: parseGlb, readAccessor: readAccessor, textureSourceInfo: textureSourceInfo };`,
  );
  return factory() as ReturnType<typeof loadRuntime>;
}
