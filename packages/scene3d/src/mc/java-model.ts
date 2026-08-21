import { Census } from "../types.js";
import { NormalizedContract } from "../contract.js";
import { PX, TextureDirective, boxToMc, sanitizeKey, textureDirective } from "./common.js";

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
export interface JavaModelBuild {
  model: JavaModel;
  textures: TextureDirective[];
  skipped: Array<{ object: string; reason: string }>;
}

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



/** A sane default item-display block so the model shows in inventory and hand
 *  the moment it is dropped in — the vanilla generated-item baseline. */
const DEFAULT_DISPLAY: Record<string, unknown> = {
  gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] },
  fixed: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
  thirdperson_righthand: { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
};
