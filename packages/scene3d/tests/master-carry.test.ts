import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * What survives the USD master round trip, measured on the SHIPPED bytes.
 *
 * Every assertion here failed before the carry existed, and none of them could
 * have been made by a test that stops at `lint`. That is the point: the Fox
 * fixture was already pinned — triangle count, census clip names, frame range —
 * by a test running `stages: ["parse","build","lint"]`, and the compiler was
 * shipping one of its three animations. The census knew all three. The check
 * that would have caught it was the one nobody ran, because running it costs an
 * export and the cheaper assertion looked equivalent.
 *
 * So these read the container. `census.animation.actionNames` says what Blender
 * held; `scene.glb` says what the user receives, and only the second one is the
 * product.
 */

const hasBlender = (await probeBlender({})) !== null;
const LONG = 400_000;

/** The JSON chunk of a .glb, which is where the material and animation
 *  declarations live. Parsed here rather than through a glTF library so the
 *  test depends on the bytes and not on a reader's interpretation of them. */
function glbJson(file: string): {
  animations?: Array<{ name?: string }>;
  materials?: Array<Record<string, unknown>>;
  images?: unknown[];
} {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 4).toString("ascii"), `${file} is not a GLB`).toBe("glTF");
  let at = 12;
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(at + 8, at + 8 + length).toString("utf8"));
    at += 8 + length;
  }
  throw new Error(`${file} has no JSON chunk`);
}

describe.skipIf(!hasBlender)("what the master round trip must not lose", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", name);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  it("ships every animation clip the source declared, not just the bound one", async () => {
    const dir = workDir("carry-fox");
    fs.cpSync(fixture("real/fox/Fox.glb"), path.join(dir, "Fox.glb"));
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });

    // Blender's glTF importer binds ONE action and files the rest as NLA
    // strips. The parity fingerprint compared bound actions on both sides, so
    // it agreed with itself while two clips were dropped between them.
    expect([...(result.census!.animation.actionNames ?? [])].sort()).toEqual([
      "Run",
      "Survey",
      "Walk",
    ]);

    const glb = glbJson(path.join(dir, "out", "scene.glb"));
    const shipped = (glb.animations ?? []).map((a) => a.name).sort();
    expect(shipped, "the delivered GLB must carry all three clips").toEqual([
      "Run",
      "Survey",
      "Walk",
    ]);
    // No phantom fourth: restoring a clip whose name the master's baked
    // timeline already occupied used to append it as `Survey.001`, and the
    // exporter wrote both.
    expect(shipped.length).toBe(new Set(shipped).size);
    expect(result.summary.errors).toBe(0);
  }, LONG);

  it("keeps a material single-sided through the round trip", async () => {
    const dir = workDir("carry-sided");
    fs.cpSync(fixture("real/fox/Fox.glb"), path.join(dir, "Fox.glb"));
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
    expect(result.summary.errors).toBe(0);

    // glTF's default for doubleSided is false, so "absent" is single-sided and
    // `true` is the regression: backface culling is a plain material flag the
    // round trip reset, which turned every closed mesh in every shipped asset
    // two-sided and doubled its overdraw.
    for (const mat of glbJson(path.join(dir, "out", "scene.glb")).materials ?? []) {
      expect(mat.doubleSided ?? false, `material ${String(mat.name)} came back two-sided`).toBe(
        false,
      );
    }
  }, LONG);

  it("makes a declared emission actually emit, at the strength authored", async () => {
    // Two independent bugs stacked here, and either alone yields a dark
    // surface: `emit-bpy` emitted `emission_strength` only alongside an
    // emission COLOUR (so a material lit by a baked map — which declares a
    // strength and takes its colour from the texture — lost the value before
    // the build script saw it), and the runner wired the atlas into Emission
    // Color while leaving Blender's default strength of 0. Every component
    // downstream then behaved correctly given an inert binding: no glow in the
    // proof, no emissiveColor in the master, no emissive texture in the glTF.
    // Nothing compared "a map was deliberately wired" against "this emits".
    const dir = workDir("carry-emission");
    fs.writeFileSync(
      path.join(dir, "glow.glsl"),
      "vec4 kernel(vec2 uv){ return vec4(uv.x, 0.2, 1.0 - uv.x, 1.0); }\n" +
        "vec4 kernel_emission(vec2 uv){ return vec4(1.0, 0.4 * uv.y, 0.0, 1.0); }\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        shaders: { shd_glow: { kernel: "glow.glsl", size: 64, outputs: ["baseColor", "emission"] } },
        // Strength declared WITHOUT an emission colour: the case that was lost.
        materials: { mtl_glow: { shader: "shd_glow", emissionStrength: 4 } },
        parts: [{ id: "prp_rock", size: [1, 1, 1], material: "mtl_glow" }],
        relations: [{ type: "at", part: "prp_rock", center: [0, 0, 0.5] }],
      }),
      "utf8",
    );
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
    expect(result.summary.errors).toBe(0);

    const glb = glbJson(path.join(dir, "out", "scene.glb"));
    const glow = (glb.materials ?? []).find((m) => String(m.name).includes("glow"))!;
    expect(glow, "the shader material must reach the GLB").toBeTruthy();
    expect("emissiveTexture" in glow, "the baked emission map must be bound").toBe(true);
    // The authored strength, not a flattened 1. UsdPreviewSurface has no
    // emissive-strength concept, so it survives only because it is carried.
    const ext = glow.extensions as Record<string, { emissiveStrength?: number }> | undefined;
    expect(ext?.KHR_materials_emissive_strength?.emissiveStrength).toBe(4);
  }, LONG);

  it("keeps an occlusion map bound, which lives outside the Principled graph", async () => {
    const dir = workDir("carry-occlusion");
    fs.cpSync(fixture("real/helmet/DamagedHelmet.glb"), path.join(dir, "DamagedHelmet.glb"));
    fs.cpSync(fixture("real/helmet/scene3d.json"), path.join(dir, "scene3d.json"));
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
    expect(result.summary.errors).toBe(0);

    // The importer routes occlusion into a `glTF Material Output` group node,
    // which the USD writer does not traverse — so the binding AND the image
    // vanished. W-903 could not see it either: it diffs `extensionsUsed`, and
    // occlusionTexture is core glTF 2.0, not an extension.
    const glb = glbJson(path.join(dir, "out", "scene.glb"));
    const withOcclusion = (glb.materials ?? []).filter((m) => "occlusionTexture" in m);
    expect(withOcclusion.length, "the helmet's AO map must reach the delivered GLB").toBeGreaterThan(
      0,
    );
  }, LONG);
});
