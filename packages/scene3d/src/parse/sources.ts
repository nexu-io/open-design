import * as fs from "node:fs";
import * as path from "node:path";
import { SceneSource } from "../types.js";

/**
 * Discover the scene source for a project directory.
 *
 * Precedence: a declarative `scene.json` spec wins, then an authored
 * `build.py` (the bpy escape hatch), then USD layers
 * (`.usda`/`.usdc`/`.usdz`), then a `.blend` file. A project holding BOTH
 * `scene.json` and `build.py` is ambiguous — two authorities over the same
 * geometry — and the pipeline reports it rather than picking one silently.
 */
export function discoverSources(projectDir: string): SceneSource {
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const files = (exts: string[]) =>
    entries
      .filter((e) => e.isFile() && exts.includes(path.extname(e.name).toLowerCase()))
      .map((e) => e.name)
      .sort();

  const spec = files([".json"]).filter((f) => f === "scene.json");
  const buildPy = files([".py"]).filter((f) => f === "build.py");
  const usda = files([".usda", ".usdc", ".usdz"]);
  const blend = files([".blend"]);

  if (spec.length > 0) {
    return { kind: "spec", files: spec };
  }
  if (buildPy.length > 0) {
    const siblings = usda.length > 0 ? usda : [];
    return { kind: "bpy", files: [...buildPy, ...siblings] };
  }
  if (usda.length > 0) {
    const main = usda.includes("scene.usda") ? "scene.usda" : usda[0]!;
    const layers = [main, ...usda.filter((f) => f !== main)];
    return { kind: "usda", files: layers };
  }
  if (blend.length > 0) {
    return { kind: "blend", files: blend };
  }
  // Real assets dropped straight into a scene directory: a GLB from the
  // internet, an OBJ export from another tool. All of them import into one
  // Blender scene and face the same census, lint, proof, and export as an
  // authored scene — the compiler as an inspection and repackaging tool.
  const mesh = files([".glb", ".gltf", ".obj", ".fbx"]);
  if (mesh.length > 0) {
    return { kind: "mesh", files: mesh };
  }
  return { kind: "usda", files: [] };
}

/** Absolute path of every source file that exists on disk. */
export function existingSourceFiles(projectDir: string, source: SceneSource): string[] {
  return source.files
    .map((f) => path.join(projectDir, f))
    .filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}