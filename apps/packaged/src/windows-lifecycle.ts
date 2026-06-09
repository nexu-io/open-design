import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveWindowsUninstallRegistryKey } from "@open-design/sidecar-proto";

const execFileAsync = promisify(execFile);

export type WindowsRegistryExec = (
  command: string,
  args: string[],
  options: { windowsHide: true },
) => Promise<unknown>;

export type SyncWindowsUninstallDisplayVersionInput = {
  exec?: WindowsRegistryExec;
  namespace: string;
  platform?: NodeJS.Platform;
  version: string | null;
};

export function windowsUninstallRegistryQueryArgs(input: {
  namespace: string;
}): string[] {
  return [
    "query",
    `HKCU\\${resolveWindowsUninstallRegistryKey(input.namespace)}`,
  ];
}

export function windowsUninstallDisplayVersionRegistryArgs(input: {
  namespace: string;
  version: string;
}): string[] {
  return [
    "add",
    `HKCU\\${resolveWindowsUninstallRegistryKey(input.namespace)}`,
    "/v",
    "DisplayVersion",
    "/t",
    "REG_SZ",
    "/d",
    input.version,
    "/f",
  ];
}

export async function syncWindowsUninstallDisplayVersion(
  input: SyncWindowsUninstallDisplayVersionInput,
): Promise<boolean> {
  if ((input.platform ?? process.platform) !== "win32") return false;
  const version = input.version?.trim();
  if (version == null || version.length === 0) return false;
  const run = input.exec ?? execFileAsync;
  try {
    await run("reg.exe", windowsUninstallRegistryQueryArgs({
      namespace: input.namespace,
    }), { windowsHide: true });
  } catch {
    return false;
  }
  await run("reg.exe", windowsUninstallDisplayVersionRegistryArgs({
    namespace: input.namespace,
    version,
  }), { windowsHide: true });
  return true;
}
