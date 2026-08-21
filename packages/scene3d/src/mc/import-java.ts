import { decodePng } from "../sheet/png.js";

/**
 * Import a Minecraft **Java block model** (or a basic Blockbench `.bbmodel`)
 * as a `scene.json` spec — the migration half of the round trip.
 *
 * A modeller (or an AI) brings an existing model IN: each cuboid `element`
 * becomes a box part anchored at its centre, and the normal pipeline then
 * validates, builds, LINTS (the voxel rules apply to the import!) and can
 * re-emit it. Because the coordinate map is the exact inverse of the exporter's
 * (`(X,Y,Z)_px → (X, −Z, Y)/16` in Blender metres), `import(export(model))`
 * reproduces the model's geometry — the strongest regression the exporter has.
 *
 * Faithful, not lossy-silent: `scene.json` reasons in axis-aligned boxes, so a
 * ROTATED element cannot be represented and is SKIPPED with a reason rather
 * than imported at the wrong orientation — the same honesty the exporter keeps.
 * Textures resolve to a flat base colour (a bound PNG averaged in linear space,
 * or an embedded `.bbmodel` data URI); an unresolved texture becomes a neutral
 * placeholder named for the reference, so the geometry always imports.
 */

export interface ImportResult {
  /** A raw scene-spec object to hand to validateSceneSpec, or null on failure. */
  spec: RawSpec | null;
  warnings: string[];
  skipped: Array<{ element: string; reason: string }>;
}

interface RawSpec {
  schemaVersion: 1;
  name?: string;
  materials: Record<string, { baseColor: [number, number, number]; roughness: number }>;
  parts: Array<{ id: string; size: [number, number, number]; shape: "box"; material: string }>;
  relations: Array<{ type: "at"; part: string; center: [number, number, number] }>;
}

/** Resolve a texture reference (already stripped of a leading `#`) to PNG
 *  bytes — the pipeline supplies file access; the importer stays pure. */
export type TextureResolver = (ref: string) => Uint8Array | undefined;

const PX = 16;

export function importJavaModel(
  model: unknown,
  opts: { name?: string; resolveTexture?: TextureResolver } = {},
): ImportResult {
  const warnings: string[] = [];
  const skipped: Array<{ element: string; reason: string }> = [];
  if (!isObject(model) || !Array.isArray((model as { elements?: unknown }).elements)) {
    return { spec: null, warnings: ["not a Minecraft model: no `elements` array"], skipped };
  }
  const elements = (model as { elements: unknown[] }).elements;
  const textureMap = normaliseTextures((model as { textures?: unknown }).textures);

  const parts: RawSpec["parts"] = [];
  const relations: RawSpec["relations"] = [];
  const materialRefs = new Map<string, string>(); // texture ref -> material id
  const usedIds = new Set<string>();

  elements.forEach((raw, i) => {
    const label = isObject(raw) && typeof raw.name === "string" ? raw.name : `element ${i}`;
    if (!isObject(raw)) {
      skipped.push({ element: label, reason: "not an object" });
      return;
    }
    const from = asVec3(raw.from);
    const to = asVec3(raw.to);
    if (!from || !to) {
      skipped.push({ element: label, reason: "missing or malformed from/to" });
      return;
    }
    // A rotated element has no axis-aligned representation in scene.json.
    const rot = raw.rotation;
    if (isObject(rot) && typeof rot.angle === "number" && rot.angle !== 0) {
      skipped.push({ element: label, reason: `rotated ${rot.angle}° (scene.json is axis-aligned)` });
      return;
    }
    if (Array.isArray(rot) && rot.some((v) => typeof v === "number" && v !== 0)) {
      skipped.push({ element: label, reason: "rotated (scene.json is axis-aligned)" });
      return;
    }
    const dims: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    if (dims.some((d) => d <= 0)) {
      skipped.push({ element: label, reason: "zero or negative extent" });
      return;
    }
    const centre: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

    // Inverse of the exporter's frame map: MC px (X,Y,Z) -> Blender m (X,-Z,Y)/16.
    // nz() folds a negative zero (from −0/16) back to 0 so the spec is clean.
    const size: [number, number, number] = [nz(dims[0] / PX), nz(dims[2] / PX), nz(dims[1] / PX)];
    const center: [number, number, number] = [nz(centre[0] / PX), nz(-centre[2] / PX), nz(centre[1] / PX)];

    const texRef = dominantTexture(raw.faces);
    const material = ensureMaterial(texRef, materialRefs);
    const id = uniqueId(sanitizeId(isObject(raw) && typeof raw.name === "string" ? raw.name : `elem_${i}`), usedIds);

    parts.push({ id, size, shape: "box", material });
    relations.push({ type: "at", part: id, center });
  });

  if (parts.length === 0) {
    return { spec: null, warnings: [...warnings, "no importable (axis-aligned) elements"], skipped };
  }

  // Resolve every referenced material's colour once.
  const materials: RawSpec["materials"] = {};
  for (const [ref, matId] of materialRefs) {
    materials[matId] = { baseColor: resolveColour(ref, textureMap, opts.resolveTexture, warnings), roughness: 0.85 };
  }

  return {
    spec: {
      schemaVersion: 1,
      ...(opts.name ? { name: opts.name } : {}),
      materials,
      parts,
      relations,
    },
    warnings,
    skipped,
  };
}

/** Normalise the two texture container shapes to `key -> value` (a resource
 *  path, or a base64/data-URI source for an embedded `.bbmodel` texture). */
function normaliseTextures(textures: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (Array.isArray(textures)) {
    // Blockbench: [{ name/id, source }]
    textures.forEach((t, i) => {
      if (!isObject(t)) return;
      const key = typeof t.id === "string" ? t.id : typeof t.name === "string" ? t.name : String(i);
      const src = typeof t.source === "string" ? t.source : "";
      out.set(key, src);
      out.set(String(i), src); // faces may reference textures by index string
    });
  } else if (isObject(textures)) {
    for (const [k, v] of Object.entries(textures)) if (typeof v === "string") out.set(k, v);
  }
  return out;
}

/** The texture reference most of an element's faces use (its material). */
function dominantTexture(faces: unknown): string {
  if (!isObject(faces)) return "undyed";
  const counts = new Map<string, number>();
  for (const face of Object.values(faces)) {
    if (!isObject(face) || typeof face.texture !== "string") continue;
    const ref = face.texture.replace(/^#/, "");
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  let best = "undyed";
  let n = 0;
  for (const [ref, c] of counts) if (c > n) ((best = ref), (n = c));
  return best;
}

function ensureMaterial(texRef: string, refs: Map<string, string>): string {
  const existing = refs.get(texRef);
  if (existing) return existing;
  const id = `mtl_${sanitizeId(texRef)}`;
  refs.set(texRef, id);
  return id;
}

/** A texture's average colour in LINEAR space (baseColor is linear), or a
 *  neutral grey when the pixels cannot be resolved. */
function resolveColour(
  ref: string,
  textureMap: Map<string, string>,
  resolver: TextureResolver | undefined,
  warnings: string[],
): [number, number, number] {
  const bytes = resolveBytes(ref, textureMap, resolver);
  if (!bytes) {
    warnings.push(`texture '${ref}' could not be resolved; using a neutral placeholder colour`);
    return [0.6, 0.6, 0.6];
  }
  try {
    const img = decodePng(bytes);
    let r = 0;
    let g = 0;
    let b = 0;
    const n = img.width * img.height;
    for (let i = 0; i < n; i++) {
      r += srgbToLinear(img.data[i * 4]! / 255);
      g += srgbToLinear(img.data[i * 4 + 1]! / 255);
      b += srgbToLinear(img.data[i * 4 + 2]! / 255);
    }
    return [clamp01(r / n), clamp01(g / n), clamp01(b / n)];
  } catch {
    warnings.push(`texture '${ref}' is not a decodable PNG; using a neutral placeholder colour`);
    return [0.6, 0.6, 0.6];
  }
}

function resolveBytes(
  ref: string,
  textureMap: Map<string, string>,
  resolver: TextureResolver | undefined,
): Uint8Array | undefined {
  const src = textureMap.get(ref);
  // An embedded data URI (Blockbench) carries the bytes inline.
  if (src && /^data:image\/png;base64,/i.test(src)) {
    try {
      return Uint8Array.from(Buffer.from(src.replace(/^data:image\/png;base64,/i, ""), "base64"));
    } catch {
      /* fall through to the resolver */
    }
  }
  if (!resolver) return undefined;
  // Try the reference, its basename, and the mapped resource path's basename.
  const candidates = new Set<string>([ref, basename(ref)]);
  if (src) candidates.add(basename(src));
  for (const c of candidates) {
    const bytes = resolver(c);
    if (bytes) return bytes;
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asVec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [a, b, c] = v;
  if (typeof a !== "number" || typeof b !== "number" || typeof c !== "number") return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  return [a, b, c];
}
function sanitizeId(name: string): string {
  let s = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(s)) s = `p_${s}`;
  if (s.length < 3) s = (s + "___").slice(0, 3);
  return s.slice(0, 60);
}
function uniqueId(base: string, used: Set<string>): string {
  const id = base.startsWith("prp_") || base.startsWith("mtl_") ? base : `prp_${base}`.slice(0, 63);
  let k = id;
  let n = 2;
  while (used.has(k)) k = `${id}_${n++}`.slice(0, 63);
  used.add(k);
  return k;
}
function basename(p: string): string {
  return (p.split(/[\\/]/).pop() ?? p).replace(/\.(png|tga)$/i, "");
}
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
/** Fold a negative zero to positive zero so the emitted spec stays clean. */
function nz(v: number): number {
  return v === 0 ? 0 : v;
}
