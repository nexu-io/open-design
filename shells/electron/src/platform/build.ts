import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readOfficialNodeLock, currentOfficialNodeTarget } from "@open-design/standalone/packages";
import { archiveNodePlatformResource, buildNodePlatform } from "@open-design/standalone/packages/build";
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

/** Product-owned executable grants; never inherit npm's incidental mode bits. */
export async function buildElectronPlatformResource(input: Readonly<{
  archivePath: string; target: ElectronExactTarget; outputArchivePath: string;
}>) {
  return withElectronPhysicalPlatform(input, async platformRoot => {
    const executables = [input.target === "win32-x64" ? "node.exe" : "bin/node"];
    if (input.target.startsWith("darwin-")) {
      for (const path of [`node_modules/node-pty/prebuilds/${input.target}/spawn-helper`, "node_modules/node-pty/build/Release/spawn-helper"]) {
        const info = await lstat(join(platformRoot, path)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null; throw error;
        });
        if (info != null) executables.push(path);
      }
      if (executables.length === 1) throw new Error("Electron platform requires its PTY spawn helper");
    }
    return archiveNodePlatformResource({ root: platformRoot, target: input.target, archivePath: input.outputArchivePath, executables });
  });
}
