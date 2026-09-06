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
  const doc = gltfDocument(file);
  if (doc === null) return null;
  const used = (doc as { extensionsUsed?: unknown }).extensionsUsed;
  if (!Array.isArray(used)) return [];
  return used.filter((e): e is string => typeof e === "string");
}

/** The JSON of a `.glb` or `.gltf`, or null when it cannot be read as either.
 *  One parse, shared: two readers that each sniffed the container their own
 *  way would eventually disagree about what a file is. */
function gltfDocument(file: string): object | null {
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
    return typeof doc === "object" && doc !== null ? (doc as object) : null;
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

/**
 * Which glTF extension carries a material channel, where one does.
 *
 * A channel absent from this map has no glTF representation at all — that is
 * a fact about the format, not a gap in the table, and it is why the report
 * distinguishes "the deliverable dropped it" from "no deliverable of this
 * kind can carry it". `coatIor` and `coatTint` are deliberately absent:
 * `KHR_materials_clearcoat` carries a factor, a roughness and a normal
 * texture, and nothing else, so crediting them to it would report a channel
 * as preserved that the file cannot express.
 */
const CHANNEL_EXTENSION: Readonly<Record<string, string>> = {
  coat: "KHR_materials_clearcoat",
  coatRoughness: "KHR_materials_clearcoat",
  coatNormal: "KHR_materials_clearcoat",
  transmission: "KHR_materials_transmission",
  sheen: "KHR_materials_sheen",
  sheenRoughness: "KHR_materials_sheen",
  sheenTint: "KHR_materials_sheen",
  anisotropic: "KHR_materials_anisotropy",
  anisotropicRotation: "KHR_materials_anisotropy",
  thinFilmThickness: "KHR_materials_iridescence",
  thinFilmIor: "KHR_materials_iridescence",
  ior: "KHR_materials_ior",
  specular: "KHR_materials_specular",
  specularTint: "KHR_materials_specular",
  emissionStrength: "KHR_materials_emissive_strength",
};

/** Every material in a glTF/GLB, by name, with the extensions IT declares. */
function gltfMaterialExtensions(file: string): Map<string, Set<string>> | null {
  const doc = gltfDocument(file);
  if (doc === null) return null;
  const out = new Map<string, Set<string>>();
  const materials = (doc as { materials?: unknown }).materials;
  if (!Array.isArray(materials)) return out;
  for (const m of materials) {
    if (typeof m !== "object" || m === null) continue;
    const name = (m as { name?: unknown }).name;
    const ext = (m as { extensions?: unknown }).extensions;
    out.set(
      typeof name === "string" ? name : "",
      new Set(ext && typeof ext === "object" ? Object.keys(ext as object) : []),
    );
  }
  return out;
}

/**
 * Channels the author wrote that the shipped glTF does not carry, PER
 * MATERIAL.
 *
 * Per material because an extension is not a scene-wide capability: one
 * material carrying `KHR_materials_clearcoat` says nothing about whether a
 * second material's coat survived. Reading `extensionsUsed` alone reports no
 * loss for a real loss whenever any other material happens to use the same
 * extension.
 *
 * The compiler sets every authored channel on the surface it builds and the
 * proof photographs that surface — so what is in the render is real. The
 * deliverable is a different question: OpenUSD is the master and every
 * container is lowered from it, so a channel `UsdPreviewSurface` cannot
 * express does not reach the file even though it reached the picture. That
 * gap is measured here rather than assumed, by reading the shipped container.
 */
export function lostAuthoredChannels(
  authored: ReadonlyMap<string, readonly string[]>,
  shippedFile: string,
): Array<{ material: string; channel: string; extension: string }> {
  const shipped = gltfMaterialExtensions(shippedFile);
  if (shipped === null) return [];
  const out: Array<{ material: string; channel: string; extension: string }> = [];
  for (const material of [...authored.keys()].sort()) {
    // A material the container does not name at all was not exported; that is
    // a different finding than a channel being dropped, and not this one's.
    const kept = shipped.get(material);
    if (kept === undefined) continue;
    for (const channel of [...new Set(authored.get(material) ?? [])].sort()) {
      const extension = CHANNEL_EXTENSION[channel];
      if (extension === undefined) continue; // no glTF representation to lose
      if (kept.has(extension)) continue;
      out.push({ material, channel, extension });
    }
  }
  return out;
}
