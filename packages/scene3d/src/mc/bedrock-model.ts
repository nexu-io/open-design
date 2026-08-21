import { Census } from "../types.js";
import { NormalizedContract } from "../contract.js";
import { encodePng } from "../sheet/png.js";
import { PX, boxToMc, sanitizeKey, solidTile } from "./common.js";

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
 * v1 scope matches the Java exporter: axis-aligned cubes are emitted exactly;
 * a rotated box is SKIPPED with a reason rather than emitted wrong. Bedrock
 * DOES allow free per-cube rotation (the census even recovers the angle), but
 * the rotation/pivot mapping cannot be verified in-engine from here, so it is a
 * deliberate follow-up rather than an unvalidated guess shipped as correct.
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
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
}

const FACES = ["north", "south", "east", "west", "up", "down"] as const;

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
    if (!v.axisAligned) {
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
    const row = rowFor(mesh.materials?.[0]);
    const uv: BedrockCube["uv"] = {};
    for (const face of FACES) {
      uv[face] = { uv: [0, row * PX], uv_size: [PX, PX] };
    }
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
