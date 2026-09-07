import { chmod, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";

/** Build-only product preparation; this module never enters the physical carrier. */
async function prepare(): Promise<void> {
  const root = process.argv[2];
  if (root == null || !isAbsolute(root)) throw new Error("platform preparation requires an absolute output root");
  const load = createRequire(join(root, "package.json"));
  const ptyRoot = dirname(load.resolve("node-pty/package.json"));
  const prebuilds = join(ptyRoot, "prebuilds");
  for (const target of await readdir(prebuilds)) {
    if (target !== `${process.platform}-${process.arch}`) await rm(join(prebuilds, target), { recursive: true, force: true });
  }
  if (process.platform === "darwin") {
    for (const helper of [join(prebuilds, `darwin-${process.arch}`, "spawn-helper"), join(ptyRoot, "build/Release/spawn-helper")]) {
      await chmod(helper, 0o755).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }
}
void prepare().catch(error => { console.error(error); process.exitCode = 1; });
