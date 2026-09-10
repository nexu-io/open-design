import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Crop known multi-target dependency layouts in the producer-owned stage only.
 * Preserve the selected runtime and refuse an unexpected package layout. */
export async function pruneClosureNativeDependencies(stage: string, platform = process.platform, arch = process.arch): Promise<void> {
  const root = join(stage, "node_modules", "onnxruntime-node", "bin", "napi-v3");
  const exists = await lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (exists == null) return;
  if (!exists.isDirectory() || !(await lstat(join(root, platform, arch))).isDirectory()) {
    throw new Error(`ONNX distribution lacks a native runtime for ${platform}-${arch}`);
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !["darwin", "linux", "win32"].includes(entry.name)) {
      throw new Error(`Unexpected ONNX platform entry: ${entry.name}`);
    }
    if (entry.name !== platform) await rm(join(root, entry.name), { recursive: true });
    else for (const target of await readdir(join(root, platform), { withFileTypes: true })) {
      if (!target.isDirectory() || !["arm64", "x64"].includes(target.name)) {
        throw new Error(`Unexpected ONNX architecture entry: ${target.name}`);
      }
      if (target.name !== arch) await rm(join(root, platform, target.name), { recursive: true });
    }
  }
}
