import { Census } from "../types.js";
import { NormalizedContract } from "../contract.js";
import {
  JAVA_ANGLE_TOLERANCE,
  JAVA_LEGAL_ANGLES,
  PX,
  TextureDirective,
  boxToMc,
  elementBounds,
  nearestLegalAngle,
  pointToMc,
  rotationToMc,
  sanitizeKey,
  textureDirective,
} from "./common.js";

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
 * It is faithful, not exhaustive: it emits every cuboid exactly — axis-aligned
 * or rotated to one of the five legal angles, from the oriented box the census
 * recovers — and REPORTS every part it cannot represent as a single vanilla
 * element (a sphere, an imported non-cuboid, a multi-axis or illegal rotation)
 * rather than emitting wrong geometry. The linter (W-971/972) has already warned about the
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
/** A block-model element rotation: one axis, one of the five legal angles,
 *  about a point in element space. */
export interface JavaRotation {
  origin: [number, number, number];
  axis: "x" | "y" | "z";
  angle: number;
}
export interface JavaElement {
  from: [number, number, number];
  to: [number, number, number];
  faces: Record<string, JavaFace>;
  rotation?: JavaRotation;
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
  /* `particle` is Minecraft's own reserved key (break and landing particles),
     written below as an alias to the first real texture. Reserving it here is
     what keeps it from ALSO being handed to a material actually named
     "particle": the alias would then overwrite that material's own entry, and
     the cube wearing it would render with a different material's texture — or,
     for a lone material of that name, with the self-referential
     {"particle": "#particle"} that shows as the missing-texture checker. */
  const used = new Set<string>(["particle"]);
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
    // A rotated element is authored as an UN-ROTATED from/to plus a rotation
    // about an origin — exactly the oriented box the census recovers. This
    // used to skip every rotated box on the grounds that the un-rotated extent
    // was unrecoverable, while `voxel.center`/`localSize` sat in the census
    // unread and the Bedrock exporter next door used them.
    let rotation: JavaRotation | undefined;
    if (!v.axisAligned) {
      if (v.rotationAxis === null || v.rotationAxis === undefined || v.rotationDeg === null || v.rotationDeg === undefined) {
        skipped.push({ object: mesh.object, reason: "rotated about multiple axes" });
        continue;
      }
      const legal = nearestLegalAngle(v.rotationDeg);
      if (Math.abs(v.rotationDeg - legal) > JAVA_ANGLE_TOLERANCE) {
        // W-972 already said this; the exporter must not silently round the
        // author's 30° to 22.5° and ship a shape they never modelled.
        skipped.push({
          object: mesh.object,
          reason: `rotated ${v.rotationDeg}° about ${v.rotationAxis} — Java allows only ${JAVA_LEGAL_ANGLES.join(", ")}`,
        });
        continue;
      }
      // A rotated element MUST have its own local box: the rotation is applied
      // on top of the box below, so the box has to be the shape's UN-rotated
      // extent. The world AABB fallback is the box a NON-rotated element's
      // world extent already is — combining it with a rotation double-applies
      // the turn and ships a cuboid of the wrong size and place. Bedrock
      // refuses this exact case; Java must too, rather than emit corrupt
      // geometry from a legacy census that lacks centre/size.
      if (!v.center || !v.localSize) {
        skipped.push({
          object: mesh.object,
          reason: "rotated element has no measured local box (centre/size) to place the rotation on",
        });
        continue;
      }
      const mapped = rotationToMc(v.rotationAxis, legal);
      rotation = { origin: pointToMc(v.center), axis: mapped.axis, angle: mapped.angle };
    }

    // Prefer the recovered element box; fall back to the world AABB only for an
    // AXIS-ALIGNED box the census measured before centre/size existed (a rotated
    // one was already refused above, so the AABB here is the true extent).
    const world = worldByName.get(mesh.object);
    let min: [number, number, number];
    let max: [number, number, number];
    if (v.center && v.localSize) {
      [min, max] = elementBounds(v.center, v.localSize);
    } else if (world?.worldMin && world?.worldMax) {
      [min, max] = [world.worldMin as [number, number, number], world.worldMax as [number, number, number]];
    } else {
      skipped.push({ object: mesh.object, reason: "no world bounds" });
      continue;
    }
    const [from, to] = boxToMc(min, max);
    // Same one-tile-per-cube constraint as the Bedrock exporter: extra
    // material slots are named, never silently dropped.
    if ((mesh.materials?.length ?? 0) > 1) {
      skipped.push({
        object: mesh.object,
        reason: `wears ${mesh.materials!.length} materials — a Java element carries one texture key, exported with '${mesh.materials![0]}'`,
      });
    }
    const key = ensureTextureKey(mesh.materials?.[0]);
    const faces: Record<string, JavaFace> = {};
    for (const dir of FACE_DIRS) {
      faces[dir] = { uv: [0, 0, PX, PX], texture: `#${key}` };
    }
    elements.push({ from, to, faces, ...(rotation ? { rotation } : {}) });
  }

  // `particle` (break/landing particles) points at the first real texture.
  // The key is reserved above, so this can never collide with a material's
  // own entry and can never alias itself.
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
