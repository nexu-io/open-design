import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { gltfExtensionsUsed, lostShadingCapability } from "../src/read/gltf-capability.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The parity fingerprint COUNTS meshes, materials, armatures and bound clips.
 * Counting catches a material that vanished and is blind to one that survived
 * as a shell — which is the normal outcome of the master round trip, because
 * UsdPreviewSurface cannot express most of the modern PBR extension surface.
 *
 * Calibration against the Khronos corpus found the loss on three assets at
 * once, with every stage reporting success:
 *
 *   IridescenceLamp   [ior, iridescence, transmission, volume] -> []
 *   ToyCar            [clearcoat, sheen, transmission, ...]    -> [clearcoat]
 *   TransmissionTest  [transmission, xmp]                      -> []
 */
describe("glTF shading capability", () => {
  const dir = path.join(__dirname, ".work", "gltf-capability");
  const write = (name: string, doc: unknown): string => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(doc), "utf8");
    return file;
  };
  /** A real GLB container: 12-byte header + a JSON chunk. */
  const writeGlb = (name: string, doc: unknown): string => {
    fs.mkdirSync(dir, { recursive: true });
    const json = Buffer.from(JSON.stringify(doc), "utf8");
    const pad = (4 - (json.length % 4)) % 4;
    const chunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
    const header = Buffer.alloc(12);
    header.write("glTF", 0, "ascii");
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + chunk.length, 8);
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.writeUInt32LE(chunk.length, 0);
    chunkHeader.write("JSON", 4, "ascii");
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.concat([header, chunkHeader, chunk]));
    return file;
  };

  it("reads extensionsUsed from both container spellings", () => {
    rmForSetup(dir);
    const used = ["KHR_materials_transmission", "KHR_materials_ior"];
    expect(gltfExtensionsUsed(write("a.gltf", { extensionsUsed: used }))).toEqual(used);
    expect(gltfExtensionsUsed(writeGlb("a.glb", { extensionsUsed: used }))).toEqual(used);
  });

  it("names the shading capability a deliverable dropped", () => {
    rmForSetup(dir);
    const source = writeGlb("src.glb", {
      extensionsUsed: [
        "KHR_materials_iridescence",
        "KHR_materials_transmission",
        "KHR_materials_clearcoat",
        "KHR_draco_mesh_compression", // not shading — irrelevant either way
        "KHR_xmp", // metadata, not shading
      ],
    });
    const shipped = writeGlb("out.glb", { extensionsUsed: ["KHR_materials_clearcoat"] });
    // Sorted, shading only: the codec and the metadata are not a render change.
    expect(lostShadingCapability(source, shipped)).toEqual([
      "KHR_materials_iridescence",
      "KHR_materials_transmission",
    ]);
  });

  it("reports nothing when the deliverable kept everything", () => {
    rmForSetup(dir);
    const used = ["KHR_materials_sheen"];
    expect(
      lostShadingCapability(writeGlb("s.glb", { extensionsUsed: used }), writeGlb("o.glb", { extensionsUsed: used })),
    ).toEqual([]);
  });

  it("reports nothing rather than a phantom loss when a file cannot be read", () => {
    // "Unreadable" and "lost everything" must not look alike: inventing a loss
    // from a file we failed to parse would be the same manufactured verdict
    // this compiler exists to avoid.
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    const junk = path.join(dir, "junk.glb");
    fs.writeFileSync(junk, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    const real = writeGlb("real.glb", { extensionsUsed: ["KHR_materials_sheen"] });
    expect(lostShadingCapability(real, junk)).toEqual([]);
    expect(lostShadingCapability(junk, real)).toEqual([]);
    expect(gltfExtensionsUsed(path.join(dir, "absent.glb"))).toBeNull();
  });

  it("treats a container with no extensions as nothing to lose", () => {
    rmForSetup(dir);
    expect(gltfExtensionsUsed(writeGlb("plain.glb", { asset: { version: "2.0" } }))).toEqual([]);
    expect(
      lostShadingCapability(writeGlb("p1.glb", {}), writeGlb("p2.glb", {})),
    ).toEqual([]);
  });
});
