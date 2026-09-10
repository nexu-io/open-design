import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pruneClosureNativeDependencies } from "../src/build/native-dependencies.js";

it("retains only the native ONNX target without changing its bytes", async () => {
  const stage = await mkdtemp(join(tmpdir(), "closure-native-"));
  const root = join(stage, "node_modules/onnxruntime-node/bin/napi-v3");
  try {
    for (const platform of ["darwin", "linux", "win32"]) for (const arch of ["arm64", "x64"]) {
      await mkdir(join(root, platform, arch), { recursive: true });
      await writeFile(join(root, platform, arch, "runtime"), `${platform}-${arch}`);
    }
    await pruneClosureNativeDependencies(stage, "darwin", "arm64");
    expect(await readdir(root)).toEqual(["darwin"]);
    expect(await readdir(join(root, "darwin"))).toEqual(["arm64"]);
    expect(await readFile(join(root, "darwin/arm64/runtime"), "utf8")).toBe("darwin-arm64");
    await expect(pruneClosureNativeDependencies(stage, "win32", "x64")).rejects.toThrow();
    expect(await readdir(root)).toEqual(["darwin"]);
  } finally { await rm(stage, { recursive: true, force: true }); }
});
