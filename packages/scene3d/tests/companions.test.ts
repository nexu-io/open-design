import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { companionFiles } from "../src/parse/companions.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * A scene's inputs are not its declared file list. Everything a source
 * REFERENCES is an input too, and a cache key that omits a real input does not
 * make builds fast — it makes them wrong.
 */
describe("companionFiles", () => {
  const dir = path.join(__dirname, ".work", "companions");
  const write = (files: Record<string, string>): string[] => {
    rmForSetup(dir);
    fs.mkdirSync(path.join(dir, "textures"), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), body, "utf8");
    }
    return Object.keys(files).map((f) => path.join(dir, f));
  };
  const rel = (files: string[]) => files.map((f) => path.relative(dir, f).replace(/\\/g, "/")).sort();

  it("follows a glTF to its external buffer and images", () => {
    // The audit's case: glTF 2.0 legally splits a model across a .gltf and an
    // external .bin. Editing the .bin and recompiling reported "cached" and
    // shipped the old geometry.
    const [gltf] = write({
      "model.gltf": JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "model.bin", byteLength: 4 }, { uri: "data:application/octet-stream;base64,AAAA" }],
        images: [{ uri: "textures/albedo%20map.png" }],
      }),
      "model.bin": "\0\0\0\0",
    });
    // The percent-encoded name is decoded, and the embedded data: buffer is
    // not a file to look for.
    expect(rel(companionFiles([gltf!]))).toEqual(["model.bin", "textures/albedo map.png"]);
  });

  it("follows an OBJ through its MTL to the texture files", () => {
    const [obj] = write({
      "box.obj": "mtllib box.mtl\no prp_box\nv 0 0 0\n",
      "box.mtl": "newmtl wood\nKd 0.5 0.3 0.1\nmap_Kd textures/wood.png\nbump -bm 0.2 textures/wood_n.png\n",
    });
    expect(rel(companionFiles([obj!]))).toEqual(["box.mtl", "textures/wood.png", "textures/wood_n.png"]);
  });

  it("records a reference whose file is missing, rather than dropping it", () => {
    // hashFiles domain-separates present from missing, so a companion that
    // APPEARS later still busts the cache. Dropping the path would make its
    // arrival invisible.
    const [obj] = write({ "box.obj": "mtllib gone.mtl\n" });
    expect(rel(companionFiles([obj!]))).toEqual(["gone.mtl"]);
  });

  it("does not loop on a reference cycle", () => {
    const [a] = write({ "a.mtl": "map_Kd b.mtl\n", "b.mtl": "map_Kd a.mtl\n" });
    expect(rel(companionFiles([a!]))).toEqual(["b.mtl"]);
  });

  it("ignores containers whose references are not text", () => {
    // A .glb/.fbx is self-contained in every shape this compiler handles;
    // guessing at binary formats would be a second parser to keep in sync
    // with Blender's. The boundary is stated, not silently assumed.
    const [glb] = write({ "model.glb": "glTF\0\0\0\0" });
    expect(companionFiles([glb!])).toEqual([]);
  });
});
