import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { ElectronExactSceneRequest } from "@open-design/shell-electron/build";
import { readObject, writeObject } from "./control-common.ts";

type Target = ElectronExactSceneRequest["target"];
export type BuildInput = Readonly<{ root: string; shell: string; target: string; output: string; receipt: string }>;
export async function electronBuilder(root: string): Promise<typeof import("@open-design/shell-electron/build")> {
  // A relocated CI controller resolves native build dependencies from the explicitly
  // selected workspace, never from its temporary artifact directory.
  const resolver = createRequire(join(resolve(root), "tools/release/package.json"));
  return import(pathToFileURL(resolver.resolve("@open-design/shell-electron/build")).href);
}
export async function packageBuilder(root: string): Promise<typeof import("@open-design/standalone/packages/build")> {
  const resolver = createRequire(join(resolve(root), "tools/release/package.json"));
  return import(pathToFileURL(resolver.resolve("@open-design/standalone/packages/build")).href);
}
export function target(input: BuildInput): Target {
  if (input.shell !== "electron" && input.shell !== "terminal") throw new Error("build shell must be electron or terminal");
  if (input.target !== "darwin-arm64" && input.target !== "darwin-x64" && input.target !== "win32-x64") throw new Error("unsupported build target");
  if (input.shell === "terminal" && (!input.target.startsWith("darwin-") || process.platform !== "darwin")) throw new Error("Terminal native build requires Darwin");
  return input.target;
}

/** Terminal's existing native process boundary requires a file-backed contract. */
export async function terminalBuild(input: BuildInput, operation: "scene" | "distribution", request: unknown) {
  const scratch = await mkdtemp(join(tmpdir(), "release-terminal-build-"));
  try {
    const requestFile = join(scratch, "request.json");
    await writeObject(requestFile, request);
    await promisify(execFile)("/bin/sh", [join(resolve(input.root), `shells/terminal/sh/${operation}.sh`), "--request", requestFile, "--receipt", resolve(input.receipt)],
      { cwd: resolve(input.root), timeout: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    return await readObject(input.receipt);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
