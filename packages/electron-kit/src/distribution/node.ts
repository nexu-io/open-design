import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import { currentOfficialNodeTarget, readOfficialNodeLock } from "../runtime/startup/carrier/lock.js";
import type { OfficialNodeTarget } from "../runtime/startup/carrier/contracts.js";

const execute = promisify(execFile);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type StageElectronNodeInput = Readonly<{
  lockPath: string;
  archivePath: string;
  outputRoot: string;
  target: OfficialNodeTarget;
}>;

/** Build-only, fresh output. Acquisition and persistent reuse belong to the caller. */
export async function stageElectronNode(input: StageElectronNodeInput) {
  if (![input.lockPath, input.archivePath, input.outputRoot].every(isAbsolute)) throw new Error("Node staging paths must be absolute");
  if (input.target !== currentOfficialNodeTarget()) throw new Error("Node staging requires the matching native build host");
  const lock = await readOfficialNodeLock(input.lockPath);
  const source = lock.targets[input.target];
  if (source == null) throw new Error("official Node lock lacks requested target");
  const bytes = await readFile(input.archivePath);
  if (sha256(bytes) !== source.sha256) throw new Error("official Node archive digest mismatch");

  // Never overwrite a previous output, and extract exactly the bytes just verified.
  await mkdir(input.outputRoot);
  const stage = await mkdtemp(join(input.outputRoot, ".node-stage-"));
  try {
    const archivePath = join(stage, source.archive);
    await writeFile(archivePath, bytes, { flag: "wx" });
    if (input.target === "win32-x64") {
      await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1]", archivePath, stage], { timeout: 60_000 });
    } else {
      await execute("tar", ["-xzf", archivePath, "-C", stage], { timeout: 60_000 });
    }
    const archiveRoot = join(stage, source.archive.replace(/\.(?:tar\.gz|zip)$/u, ""));
    const executableRelativePath = input.target === "win32-x64" ? "node.exe" : "bin/node";
    const sourceExecutable = join(archiveRoot, executableRelativePath);
    const sourceLicense = join(archiveRoot, "LICENSE");
    for (const path of [sourceExecutable, sourceLicense]) {
      if (!(await lstat(path)).isFile()) throw new Error("official Node executable and license must be regular files");
    }
    const env = { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", ELECTRON_RUN_AS_NODE: "" };
    const { stdout } = await execute(sourceExecutable, ["-e", "process.stdout.write(JSON.stringify({version:process.versions.node,abi:process.versions.modules,target:process.platform+'-'+process.arch,electron:process.versions.electron??null}))"],
      { env, timeout: 5_000, encoding: "utf8" });
    const identity = JSON.parse(stdout) as { version?: unknown; abi?: unknown; target?: unknown; electron?: unknown };
    if (identity.version !== lock.version || identity.target !== input.target || identity.electron !== null
      || typeof identity.abi !== "string" || !/^\d+$/u.test(identity.abi)) throw new Error("official Node executable identity mismatch");
    const executablePath = join(input.outputRoot, executableRelativePath);
    if (input.target !== "win32-x64") await mkdir(join(input.outputRoot, "bin"));
    await copyFile(sourceExecutable, executablePath);
    await chmod(executablePath, 0o755);
    const licensePath = join(input.outputRoot, "NODE-LICENSE");
    await copyFile(sourceLicense, licensePath);
    const receipt = Object.freeze({
      schemaVersion: 1 as const,
      target: input.target,
      version: lock.version,
      abi: identity.abi,
      archiveSha256: source.sha256,
      executable: Object.freeze({ path: executableRelativePath, sha256: sha256(await readFile(executablePath)) }),
      license: Object.freeze({ path: "NODE-LICENSE", sha256: sha256(await readFile(licensePath)) }),
    });
    await writeFile(join(input.outputRoot, "node.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    return Object.freeze({ root: input.outputRoot, executablePath, licensePath, receipt });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
