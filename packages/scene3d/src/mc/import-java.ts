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

    const faceTextures = dominantTexture(raw.faces);
    if (faceTextures.dropped.length > 0) {
      warnings.push(
        `'${label}' has a different texture per face (${[faceTextures.ref, ...faceTextures.dropped].join(", ")}); ` +
          `scene.json binds one material per part, so it imports with '${faceTextures.ref}' and the rest are dropped`,
      );
    }
    const material = ensureMaterial(faceTextures.ref, materialRefs);
    const id = uniqueId(sanitizeId(isObject(raw) && typeof raw.name === "string" ? raw.name : `elem_${i}`), usedIds);

    parts.push({ id, size, shape: "box", material });
    relations.push({ type: "at", part: id, center });
  });

  if (parts.length === 0) {
    return { spec: null, warnings: [...warnings, "no importable (axis-aligned) elements"], skipped };
  }

  // Resolve every referenced material's colour once.
  //
  // References that do NOT resolve all collapse onto ONE material. Minting a
  // separate neutral grey per unresolved reference produced a set of
  // byte-identical materials and a DUPLICATE_MATERIALS warning about the
  // importer's own guess rather than about anything in the author's model.
  // The compiler genuinely cannot tell these surfaces apart, so it says so
  // once instead of inventing distinctions it does not have.
  const materials: RawSpec["materials"] = {};
  const remap = new Map<string, string>();
  let placeholderId: string | null = null;
  for (const [ref, matId] of materialRefs) {
    const resolved = resolveColour(ref, textureMap, opts.resolveTexture, warnings);
    if (!resolved.resolved) {
      if (placeholderId === null) placeholderId = matId;
      else {
        remap.set(matId, placeholderId);
        continue;
      }
    }
    materials[matId] = { baseColor: resolved.color, roughness: 0.85 };
  }
  if (remap.size > 0) {
    for (const part of parts) {
      const to = part.material ? remap.get(part.material) : undefined;
      if (to) part.material = to;
    }
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
function dominantTexture(faces: unknown): { ref: string; dropped: string[] } {
  if (!isObject(faces)) return { ref: "undyed", dropped: [] };
  const counts = new Map<string, number>();
  for (const face of Object.values(faces)) {
    if (!isObject(face) || typeof face.texture !== "string") continue;
    const ref = face.texture.replace(/^#/, "");
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  let best = "undyed";
  let n = 0;
  for (const [ref, c] of counts) if (c > n) ((best = ref), (n = c));
  // A cube with a different texture per face is ordinary Minecraft — a
  // furnace, a crafting table, any block with a distinct top. scene.json binds
  // ONE material per part, so the other faces cannot come along. That is a
  // real limit and fine; losing them without a word is not, and this module's
  // own docblock promises otherwise ("faithful, not lossy-silent") right
  // beside the rotated-element skip that does say so.
  const dropped = [...counts.keys()].filter((ref) => ref !== best).sort();
  return { ref: best, dropped };
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
): { color: [number, number, number]; resolved: boolean } {
  const bytes = resolveBytes(ref, textureMap, resolver);
  if (!bytes) {
    warnings.push(`texture '${ref}' could not be resolved; using a neutral placeholder colour`);
    return { color: [0.6, 0.6, 0.6], resolved: false };
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
    return { color: [clamp01(r / n), clamp01(g / n), clamp01(b / n)], resolved: true };
  } catch {
    warnings.push(`texture '${ref}' is not a decodable PNG; using a neutral placeholder colour`);
    return { color: [0.6, 0.6, 0.6], resolved: false };
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
/** The schema's id ceiling; ids longer than this are not valid parts. */
const MAX_ID = 63;

/**
 * A unique, schema-valid id for `base`.
 *
 * Disambiguation truncates the STEM and then appends the counter — never the
 * other way round. Slicing the joined string is what makes the search
 * non-terminating: once the id already fills the budget, `id_2`, `id_3`, … all
 * slice back to the same value, so the "is it taken?" loop can never find a
 * free candidate. Model files really do carry 60-character duplicate element
 * names, and this runs in TypeScript before any Blender watchdog exists, so
 * the failure was a permanent synchronous wedge of the compile.
 *
 * With a stem that leaves room for the widest counter we could need, every
 * candidate is a distinct string, so one of `used.size + 1` attempts must be
 * free — termination is structural, not a retry limit.
 */
function uniqueId(base: string, used: Set<string>): string {
  const id = (base.startsWith("prp_") || base.startsWith("mtl_") ? base : `prp_${base}`).slice(0, MAX_ID);
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  const last = used.size + 2;
  const stem = id.slice(0, MAX_ID - 1 - String(last).length);
  for (let n = 2; n <= last; n++) {
    const k = `${stem}_${n}`;
    if (!used.has(k)) {
      used.add(k);
      return k;
    }
  }
  /* c8 ignore next -- unreachable: `last - 1` distinct candidates, ≤ used.size taken */
  throw new Error("uniqueId exhausted");
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
