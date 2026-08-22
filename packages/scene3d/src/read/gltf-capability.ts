import * as fs from "node:fs";

/**
 * Material capability, as declared by a glTF container.
 *
 * The parity fingerprint counts meshes, materials, armatures and bound clips.
 * Counting is enough to catch a material that vanished and blind to one that
 * survived as a shell — and that is the normal outcome of the master
 * round-trip, because `UsdPreviewSurface` cannot express most of the modern
 * PBR extension surface. Calibration against the Khronos corpus found glass,
 * iridescence, sheen, IOR and volume all destroyed end to end, with every
 * stage reporting success:
 *
 *     IridescenceLamp   [ior, iridescence, transmission, volume] -> []
 *     ToyCar            [clearcoat, sheen, transmission, ...]    -> [clearcoat, ...]
 *     TransmissionTest  [transmission, xmp]                      -> []
 *
 * Reading `extensionsUsed` off both ends makes that visible. It is a
 * DETECTION, not a repair: the architecture puts USD in the middle on purpose,
 * so the honest move is to name what the shape of the pipeline costs, exactly
 * as the importer names a missing `.mtl` rather than guessing one.
 */

/** Extensions that describe how a surface SHADES. Losing one changes the
 *  render; losing `KHR_xmp` (metadata) or a compression codec does not. */
const SHADING_EXTENSIONS = new Set([
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_diffuse_transmission",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_texture_transform",
]);

/**
 * `extensionsUsed` from a `.glb` or `.gltf`, or null when the file cannot be
 * read as either. Never throws: a container this cannot parse is a fact to
 * report elsewhere, not a reason to fail a compile that already succeeded.
 */
export function gltfExtensionsUsed(file: string): string[] | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  try {
    let text: string;
    if (buf.length >= 20 && buf.toString("ascii", 0, 4) === "glTF") {
      // GLB: 12-byte header, then chunk(length, type, data); the first is JSON.
      const jsonLength = buf.readUInt32LE(12);
      if (jsonLength <= 0 || 20 + jsonLength > buf.length) return null;
      text = buf.subarray(20, 20 + jsonLength).toString("utf8");
    } else {
      text = buf.toString("utf8");
    }
    const doc: unknown = JSON.parse(text);
    if (typeof doc !== "object" || doc === null) return null;
    const used = (doc as { extensionsUsed?: unknown }).extensionsUsed;
    if (!Array.isArray(used)) return [];
    return used.filter((e): e is string => typeof e === "string");
  } catch {
    return null;
  }
}

/**
 * Shading capability the source declared that the deliverable does not.
 *
 * Empty when nothing was lost, when neither file could be read, or when the
 * source declared nothing to lose — the caller cannot tell those apart from
 * the result alone, which is why "unreadable" returns nothing rather than a
 * phantom loss.
 */
export function lostShadingCapability(sourceFile: string, shippedFile: string): string[] {
  const source = gltfExtensionsUsed(sourceFile);
  const shipped = gltfExtensionsUsed(shippedFile);
  if (source === null || shipped === null) return [];
  const kept = new Set(shipped);
  return source.filter((e) => SHADING_EXTENSIONS.has(e) && !kept.has(e)).sort();
}
