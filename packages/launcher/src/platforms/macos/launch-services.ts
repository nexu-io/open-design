// Derived from nexu-io/open-design PR #8574 (@Inference1).
import { execFile } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LSREGISTER_PATH = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

type MacRegistrationExec = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; windowsHide: true },
) => Promise<unknown>;

export type MacApplicationRegistrationResult =
  | { status: "registered"; appBundlePath: string }
  | { status: "skipped" }
  | { status: "failed"; error: unknown };

/**
 * Refresh the confirmed application's claims. Once a canonical copy is
 * running, remove registration claims from its namespace's cached copies.
 */
export async function refreshMacApplicationRegistration(input: {
  executablePath: string;
  versionsRoot?: string;
  appBundleName?: string;
  platform?: NodeJS.Platform;
  exec?: MacRegistrationExec;
}): Promise<MacApplicationRegistrationResult> {
  if ((input.platform ?? process.platform) !== "darwin") return { status: "skipped" };
  if (!isAbsolute(input.executablePath)) return { status: "skipped" };
  const executableRoot = dirname(input.executablePath);
  const contentsRoot = dirname(executableRoot);
  const appBundleRoot = dirname(contentsRoot);
  if (
    basename(executableRoot) !== "MacOS" ||
    basename(contentsRoot) !== "Contents" ||
    !basename(appBundleRoot).endsWith(".app")
  ) return { status: "skipped" };

  try {
    const appBundlePath = await realpath(appBundleRoot);
    const exec = input.exec ?? execFileAsync;
    const options = {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    } as const;
    const bundleName = input.appBundleName ?? basename(appBundleRoot);
    if (basename(bundleName) !== bundleName || !bundleName.endsWith(".app")) return { status: "skipped" };
    if (input.versionsRoot != null && isAbsolute(input.versionsRoot)) {
      const versions = await readdir(input.versionsRoot, { withFileTypes: true }).catch(() => []);
      const realVersionsRoot = await realpath(input.versionsRoot).catch(() => null);
      for (const version of versions) {
        if (!version.isDirectory() || version.isSymbolicLink()) continue;
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version.name)) continue;
        const cached = join(input.versionsRoot, version.name, "payload", bundleName);
        const realCached = await realpath(cached).catch(() => null);
        if (realVersionsRoot == null || realCached !== resolve(realVersionsRoot, version.name, "payload", bundleName)) continue;
        // Never unregister the running application, including an alias that
        // resolves to it when canonical promotion was unavailable.
        if (realCached === appBundlePath) continue;
        await exec(LSREGISTER_PATH, ["-u", cached], options).catch(() => undefined);
      }
    }
    await exec(LSREGISTER_PATH, ["-f", appBundlePath], options);
    return { status: "registered", appBundlePath };
  } catch (error: unknown) {
    return { status: "failed", error };
  }
}
