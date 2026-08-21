import { Census, CensusMaterial } from "../types.js";
import { NormalizedContract } from "../contract.js";
import { encodePng } from "../sheet/png.js";

/**
 * Lower a compiled scene to a Minecraft **Java block/item model** — the JSON
 * the game actually loads.
 *
 * This is the piece that turns the voxel linter into a toolchain: a modeller
 * authors `scene.json`, and the compiler emits a `model.json` (plus its
 * textures) that drops into a resource pack. USD stays the master; this is a
 * pure lowering of the census (which is measured from the USD-built scene), on
 * the TS side of the process boundary, exactly like the USDZ packager.
 *
 * v1 is faithful, not exhaustive: it emits every axis-aligned cuboid exactly —
 * which is the whole of what `scene.json` authors, since the solver reasons in
 * boxes — and REPORTS every part it cannot represent as a single vanilla
 * element (a sphere, an imported non-cuboid, a rotated box) rather than
 * emitting wrong geometry. The linter (W-971/972) has already warned about the
 * same parts, so the two speak with one voice.
 *
 * Coordinate frame: Blender is Z-up right-handed; Java is Y-up right-handed
 * with +X east, +Y up, +Z south. The map is a −90° rotation about X,
 * `(x, y, z) → (x, z, −y)`, then metres → pixels (×16, one block = one metre =
 * 16 px). Every face direction and element corner follows from that one map.
 */

export interface JavaFace {
  uv: [number, number, number, number];
  texture: string;
}
export interface JavaElement {
  from: [number, number, number];
  to: [number, number, number];
  faces: Record<string, JavaFace>;
}
export interface JavaModel {
  credit?: string;
  textures: Record<string, string>;
  elements: JavaElement[];
  display?: Record<string, unknown>;
}
export interface TextureDirective {
  /** The model texture variable (`#body`) and file basename (`body.png`). */
  key: string;
  /** Absolute/relative census filepath to copy, when the material is textured. */
  copyFrom?: string;
  /** A synthesized solid-colour PNG, when the material is a flat colour. */
  png?: Uint8Array;
}
export interface JavaModelBuild {
  model: JavaModel;
  textures: TextureDirective[];
  skipped: Array<{ object: string; reason: string }>;
}

/** Pixels per block — the vanilla model unit. One block is one metre in the
 *  scene, so a metre maps to 16 model pixels. */
const PX = 16;
/** Resource-path prefix for emitted texture references. The modeller re-points
 *  the namespace when they drop the files into their pack; `block/<key>` is the
 *  vanilla-resolvable default. */
const TEXTURE_PREFIX = "block/";
/** The six Java face directions, by the Blender face-normal axis they map to.
 *  Blender +Z→up, −Z→down, +X→east, −X→west, +Y→north (−Z_mc), −Y→south. */
const FACE_DIRS = ["down", "up", "north", "south", "west", "east"] as const;

export function buildJavaModel(census: Census, _contract: NormalizedContract): JavaModelBuild {
  const worldByName = new Map(census.objects.map((o) => [o.name, o]));
  const materialByName = new Map(census.materials.map((m) => [m.name, m]));
  const textureByName = new Map(census.textures.map((t) => [t.name, t]));

  // One texture variable per material, names made MC-safe and unique.
  const keyOfMaterial = new Map<string, string>();
  const used = new Set<string>();
  const directives: TextureDirective[] = [];
  const textures: Record<string, string> = {};

  const ensureTextureKey = (matName: string | undefined): string => {
    const mat = matName ? materialByName.get(matName) : undefined;
    const base = sanitizeKey(matName ?? "undyed");
    const existing = keyOfMaterial.get(matName ?? "\0undyed");
    if (existing) return existing;
    let key = base;
    let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    used.add(key);
    keyOfMaterial.set(matName ?? "\0undyed", key);
    textures[key] = `${TEXTURE_PREFIX}${key}`;
    directives.push(textureDirective(key, mat, textureByName));
    return key;
  };

  const elements: JavaElement[] = [];
  const skipped: Array<{ object: string; reason: string }> = [];

  // Deterministic order: the census meshes are already name-sorted.
  for (const mesh of census.meshes) {
    const v = mesh.voxel;
    if (!v || !v.isBox) {
      skipped.push({ object: mesh.object, reason: v ? "not a single cuboid" : "no voxel facts" });
      continue;
    }
    if (!v.axisAligned) {
      // A rotated box needs its un-rotated extent + an element rotation, which
      // v1 does not recover; emitting its AABB would ship the wrong shape.
      skipped.push({
        object: mesh.object,
        reason: v.rotationAxis ? `rotated ${v.rotationDeg}° about ${v.rotationAxis}` : "rotated about multiple axes",
      });
      continue;
    }
    const world = worldByName.get(mesh.object);
    if (!world?.worldMin || !world?.worldMax) {
      skipped.push({ object: mesh.object, reason: "no world bounds" });
      continue;
    }
    const [from, to] = boxToMc(world.worldMin, world.worldMax);
    const key = ensureTextureKey(mesh.materials?.[0]);
    const faces: Record<string, JavaFace> = {};
    for (const dir of FACE_DIRS) {
      faces[dir] = { uv: [0, 0, PX, PX], texture: `#${key}` };
    }
    elements.push({ from, to, faces });
  }

  // `particle` (break/landing particles) points at the first real texture.
  const firstKey = Object.keys(textures)[0];
  if (firstKey) textures["particle"] = `#${firstKey}`;

  const model: JavaModel = {
    credit: "Generated by scene3d",
    textures,
    elements,
    display: DEFAULT_DISPLAY,
  };
  return { model, textures: directives, skipped };
}

/** Map a Blender-space AABB to a Java element's from/to in pixels. The axis
 *  remap + sign flip reorders extents, so min/max are recomputed after mapping;
 *  the result satisfies from ≤ to componentwise, as the format requires. */
function boxToMc(
  min: [number, number, number],
  max: [number, number, number],
): [[number, number, number], [number, number, number]] {
  // Blender (x,y,z) → MC (x, z, −y).
  const xs = [min[0], max[0]];
  const ys = [min[2], max[2]]; // MC y from Blender z
  const zs = [-max[1], -min[1]]; // MC z from −Blender y (flip swaps ends)
  const from: [number, number, number] = [px(Math.min(...xs)), px(Math.min(...ys)), px(Math.min(...zs))];
  const to: [number, number, number] = [px(Math.max(...xs)), px(Math.max(...ys)), px(Math.max(...zs))];
  return [from, to];
}

/** Metres → model pixels, rounded to the 1/16-pixel MC allows so a
 *  grid-aligned box lands on integer pixels exactly. */
function px(metres: number): number {
  return Number((metres * PX).toFixed(4));
}

function textureDirective(
  key: string,
  mat: CensusMaterial | undefined,
  textureByName: Map<string, { name: string; filepath: string }>,
): TextureDirective {
  const texName = mat?.textureNames?.[0];
  const tex = texName ? textureByName.get(texName) : undefined;
  if (tex?.filepath) return { key, copyFrom: tex.filepath };
  // A flat-colour material: synthesise a 16×16 solid so the face renders.
  const base = mat?.principled.baseColor ?? [0.8, 0.8, 0.8];
  return { key, png: solidTexture(base) };
}

/** A 16×16 solid PNG from a LINEAR base colour, sRGB-encoded (Minecraft
 *  textures are sRGB), fully opaque. Deterministic bytes via encodePng. */
function solidTexture(linear: [number, number, number]): Uint8Array {
  const r = srgb8(linear[0]);
  const g = srgb8(linear[1]);
  const b = srgb8(linear[2]);
  const data = new Uint8Array(PX * PX * 4);
  for (let i = 0; i < PX * PX; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return encodePng({ width: PX, height: PX, data });
}

/** Linear [0,1] → sRGB byte [0,255]. */
function srgb8(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** MC resource names are `[a-z0-9/._-]`; fold anything else to `_`. */
function sanitizeKey(name: string): string {
  const k = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return k.length >= 1 ? k : "tex";
}

/** A sane default item-display block so the model shows in inventory and hand
 *  the moment it is dropped in — the vanilla generated-item baseline. */
const DEFAULT_DISPLAY: Record<string, unknown> = {
  gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] },
  fixed: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
  thirdperson_righthand: { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
};
