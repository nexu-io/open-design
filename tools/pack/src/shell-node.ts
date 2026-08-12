import { execFile } from "node:child_process";
import { chmod, cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function copyShellNodeRuntime(options: {
  source?: string;
  target: string;
}): Promise<void> {
  const source = options.source ?? process.execPath;
  if (options.source == null && (process.release.name !== "node" || process.versions.electron != null)) {
    throw new Error("tools-pack must run under an official Node runtime before it can seed a Shell");
  }

  await mkdir(dirname(options.target), { recursive: true });
  await cp(source, options.target);
  if (process.platform !== "win32") await chmod(options.target, 0o755);

  const { stdout } = await execFileAsync(options.target, ["--version"], {
    windowsHide: true,
  });
  const actualVersion = stdout.trim();
  const expectedVersion = process.version;
  if (options.source == null && actualVersion !== expectedVersion) {
    throw new Error(`seeded Shell Node version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
  }
}
