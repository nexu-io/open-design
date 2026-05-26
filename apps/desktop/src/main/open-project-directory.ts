import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

import { shell } from "electron";

const execFileAsync = promisify(execFile) as (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>;

export function isWslLinux(
  release = os.release(),
  platform = process.platform,
): boolean {
  return platform === "linux" && release.toLowerCase().includes("microsoft");
}

export type OpenProjectDirectoryDeps = {
  execFile?: typeof execFileAsync;
  isWsl?: () => boolean;
  openPath?: (path: string) => Promise<string>;
};

/**
 * Open a validated project directory in the host file manager. On WSL Linux,
 * `shell.openPath` often delegates to Chrome via xdg-open; route through the
 * Windows host Explorer instead (issue #1581).
 */
export async function openProjectDirectoryInFileManager(
  resolvedDir: string,
  deps: OpenProjectDirectoryDeps = {},
): Promise<string> {
  const exec = deps.execFile ?? execFileAsync;
  const openPath = deps.openPath ?? ((path: string) => shell.openPath(path));
  const isWsl = deps.isWsl ?? (() => isWslLinux());

  if (!isWsl()) {
    return openPath(resolvedDir);
  }

  try {
    const { stdout } = await exec("wslpath", ["-w", resolvedDir], { timeout: 5000 });
    const winPath = stdout.trim();
    if (!winPath) {
      return "wslpath returned an empty Windows path";
    }
    await exec("explorer.exe", [winPath], { timeout: 5000 });
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
