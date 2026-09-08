import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readOfficialNodeLock, currentOfficialNodeTarget } from "@open-design/standalone/packages";
import { buildNodePlatform } from "@open-design/standalone/packages/build";
import type { ElectronExactTarget } from "../adapters/tools/exact-contract.ts";

const root = dirname(fileURLToPath(import.meta.resolve("@open-design/shell-electron/package.json")));
const lockPath = join(root, "config/carriers/node-lock.json");

export async function readElectronNodeArchive(target: ElectronExactTarget = currentOfficialNodeTarget()) {
  const lock = await readOfficialNodeLock(lockPath), source = lock.targets[target];
  if (source == null) throw new Error("Electron platform target is not declared");
  return Object.freeze({ target, version: lock.version, ...source });
}

/** Build fresh; persistent download/cache ownership stays with the calling tool. */
export async function withElectronPhysicalPlatform<T>(input: Readonly<{ archivePath: string; target: ElectronExactTarget }>, consume: (platformRoot: string) => Promise<T>): Promise<T> {
  const scratch = await mkdtemp(join(tmpdir(), "electron-physical-platform-"));
  try {
    const platform = await buildNodePlatform({ lockPath, archivePath: input.archivePath, target: input.target, outputRoot: join(scratch, "platform"),
      dependenciesRoot: join(root, "resources/platform"), verificationEntryPath: join(root, "src/platform/verify.ts"), preparationEntryPath: join(root, "src/platform/prepare.ts") });
    return await consume(platform.root);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
