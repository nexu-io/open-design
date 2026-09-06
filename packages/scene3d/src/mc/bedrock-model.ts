import { Census } from "../types.js";
import { NormalizedContract } from "../contract.js";
import { encodePng } from "../sheet/png.js";
import { PX, boxToMc, px, rotationToMc, sanitizeKey, solidTile } from "./common.js";

/**
 * Lower a compiled scene to a **Minecraft Bedrock** `geometry.json`.
 *
 * Bedrock is a separate platform: its addons cannot load a Java block model, so
 * a Bedrock author needs this format specifically. The lowering shares the Java
 * exporter's validated frame map (`boxToMc`), so a Bedrock cube sits exactly
 * where the Java element would; only the container and the texture model differ.
 *
 * A Bedrock geometry references ONE texture, so materials are packed into a
 * vertical atlas (each a 16×16 tile) and every cube gets modern per-face UVs
 * (format 1.16+) into its material's row — the same per-face model Java uses,
 * so there is no box-UV-net guesswork.
 *
 * Scope matches the Java exporter: every cuboid is emitted exactly, axis-
 * aligned or rotated about a single axis, from the oriented box the census
 * recovers (centre + un-rotated extent + angle). Bedrock allows free per-cube
 * angles, so unlike Java there is no legal-angle set to honour. A box rotated
 * about MORE than one axis is skipped with a reason rather than emitted wrong.
 * The axis and sign mapping is defined once in `common.ts` and shared with the
 * Java exporter, so the two formats cannot disagree about which way a rotation
 * goes.
 */

export interface BedrockBuild {
  model: BedrockGeometryFile;
  /** The composed atlas texture (one file for the whole geometry). */
  texture: { key: string; png: Uint8Array };
  skipped: Array<{ object: string; reason: string }>;
}

interface BedrockGeometryFile {
  format_version: string;
  "minecraft:geometry": Array<{
    description: {
      identifier: string;
      texture_width: number;
      texture_height: number;
      visible_bounds_width?: number;
      visible_bounds_height?: number;
    };
    bones: Array<{ name: string; pivot: [number, number, number]; cubes: BedrockCube[] }>;
  }>;
}
interface BedrockCube {
  origin: [number, number, number];
  size: [number, number, number];
  /** Free per-cube rotation (deg) about `pivot` — Bedrock's advantage over
   *  Java. Present only for an oriented cube. */
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
}

const FACES = ["north", "south", "east", "west", "up", "down"] as const;

/**
 * A Bedrock cube for an ORIENTED box, from its Blender-frame centre + un-rotated
 * size + recovered single-axis rotation.
 *
 * The geometry is exact: origin = centre − size/2 (un-rotated), pivot = centre,
 * both mapped by the frame map (x,y,z)→(x,z,−y). The rotation mapping is ALSO
 * exact, not a guess: that frame map is a proper rotation, and conjugating a
 * rotation by a rotation preserves the angle and maps the axis, giving
 * Blender X → MC X (+θ), Blender Z → MC Y (+θ), Blender Y → MC Z (−θ). Applying
 * the emitted rotation to the emitted box about the pivot reproduces the world
 * geometry — the round-trip a unit test pins.
 */
function rotatedCube(
  center: [number, number, number],
  localSize: [number, number, number],
  axis: "x" | "y" | "z",
  deg: number,
): { origin: [number, number, number]; size: [number, number, number]; pivot: [number, number, number]; rotation: [number, number, number] } {
  // Work in METRES; px() does the metres→pixel (×16) conversion once. Rotation
  // is DEGREES, not pixels — it never goes through px().
  const cx = center[0];
  const cy = center[2]; // MC y from Blender z
  const cz = -center[1]; // MC z from −Blender y
  const sx = localSize[0];
  const sy = localSize[2];
  const sz = localSize[1];
  // The axis/sign mapping is defined once in common.ts and shared with the
  // Java exporter, so the two cannot disagree about which way a rotation goes.
  const mapped = rotationToMc(axis, deg);
  const rotation: [number, number, number] =
    mapped.axis === "x" ? [mapped.angle, 0, 0] : mapped.axis === "y" ? [0, mapped.angle, 0] : [0, 0, mapped.angle];
  return {
    origin: [px(cx - sx / 2), px(cy - sy / 2), px(cz - sz / 2)],
    size: [px(sx), px(sy), px(sz)],
    pivot: [px(cx), px(cy), px(cz)],
    rotation,
  };
}

export function buildBedrockModel(census: Census, _contract: NormalizedContract): BedrockBuild {
  const worldByName = new Map(census.objects.map((o) => [o.name, o]));

  // Assign every material used by an exportable cube a row in the atlas.
  const rowOfMaterial = new Map<string, number>();
  const rowColour: Array<[number, number, number]> = [];
  const materialByName = new Map(census.materials.map((m) => [m.name, m]));
  const rowFor = (matName: string | undefined): number => {
    const key = matName ?? "\0undyed";
    const existing = rowOfMaterial.get(key);
    if (existing !== undefined) return existing;
    const row = rowColour.length;
    rowOfMaterial.set(key, row);
    const mat = matName ? materialByName.get(matName) : undefined;
    // Detect-and-name, never a silent flatten: the atlas is composed of
    // solid tiles, so a TEXTURED material ships as its base colour and the
    // authored detail is gone from the Bedrock deliverable. The loss is a
    // fact of this exporter's texture model; the entry makes it a stated
    // one instead of something discovered in-game.
    if (mat?.principled.hasTexture) {
      skipped.push({
        object: mat.name,
        reason:
          "textured material flattened to a solid colour tile — the Bedrock atlas is solid tiles; authored texture detail does not ship",
      });
    }
    rowColour.push(mat?.principled.baseColor ?? [0.8, 0.8, 0.8]);
    return row;
  };

  const cubes: BedrockCube[] = [];
  const skipped: Array<{ object: string; reason: string }> = [];

  for (const mesh of census.meshes) {
    const v = mesh.voxel;
    if (!v || !v.isBox) {
      skipped.push({ object: mesh.object, reason: v ? "not a single cuboid" : "no voxel facts" });
      continue;
    }
    // A cube maps to ONE atlas row; extra material slots cannot ride along.
    // The export still proceeds on the first slot, but the degradation is
    // named — a silent [0] read painted multi-material cuboids wrong with
    // nothing in the report to say so.
    if ((mesh.materials?.length ?? 0) > 1) {
      skipped.push({
        object: mesh.object,
        reason: `wears ${mesh.materials!.length} materials — a Bedrock cube carries one texture tile, exported with '${mesh.materials![0]}'`,
      });
    }
    const row = rowFor(mesh.materials?.[0]);
    const uv: BedrockCube["uv"] = {};
    for (const face of FACES) {
      uv[face] = { uv: [0, row * PX], uv_size: [PX, PX] };
    }

    // Oriented cube: Bedrock permits free per-cube rotation, so emit it rather
    // than skip. Needs the box's OWN extent (census localSize) + centre, not the
    // rotated world AABB. Multi-axis (no single recovered axis) is still skipped.
    if (!v.axisAligned) {
      /* `== null` catches undefined too, and the angle must be a real
         number: `=== null` alone let an ABSENT rotationDeg through to
         `deg.toFixed()`, which threw a raw TypeError and took the whole
         Minecraft deliverable with it. Java's equivalent guard already
         defended; this is the same predicate on the Bedrock side. */
      if (
        v.rotationAxis == null ||
        !Number.isFinite(v.rotationDeg as number) ||
        !v.center ||
        !v.localSize
      ) {
        skipped.push({ object: mesh.object, reason: "rotated about multiple axes" });
        continue;
      }
      cubes.push({ ...rotatedCube(v.center, v.localSize, v.rotationAxis, v.rotationDeg as number), uv });
      continue;
    }

    const world = worldByName.get(mesh.object);
    if (!world?.worldMin || !world?.worldMax) {
      skipped.push({ object: mesh.object, reason: "no world bounds" });
      continue;
    }
    const [from, to] = boxToMc(world.worldMin, world.worldMax);
    cubes.push({ origin: from, size: [to[0] - from[0], to[1] - from[1], to[2] - from[2]], uv });
  }

  // Compose the vertical atlas: one 16×16 tile per material, top to bottom.
  const rows = Math.max(1, rowColour.length);
  const atlas = new Uint8Array(PX * (PX * rows) * 4);
  rowColour.forEach((colour, r) => {
    const tile = solidTile(colour);
    // Row r occupies pixel rows [r*16, (r+1)*16); the atlas is 16 px wide.
    atlas.set(tile, r * PX * PX * 4);
  });

  const model: BedrockGeometryFile = {
    format_version: "1.16.0",
    "minecraft:geometry": [
      {
        description: {
          identifier: `geometry.${sanitizeKey(census.sceneName || "model")}`,
          texture_width: PX,
          texture_height: PX * rows,
        },
        bones: [{ name: "root", pivot: [0, 0, 0], cubes }],
      },
    ],
  };

  return {
    model,
    texture: { key: "texture", png: encodePng({ width: PX, height: PX * rows, data: atlas }) },
    skipped,
  };
}
