import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ElectronWindowsRegistryHive, ElectronWindowsRegistryPort } from "../contracts.js";

const execFileAsync = promisify(execFile);

export type ElectronWindowsRegistryExec = (
  command: string,
  args: readonly string[],
  options: Readonly<{ windowsHide: true }>,
) => Promise<Readonly<{ stdout?: string }> | unknown>;

function fullRegistryKey(hive: ElectronWindowsRegistryHive, key: string): string {
  return `${hive}\\${key}`;
}

function registryValueSelector(name: string): string[] {
  return name.length === 0 ? ["/ve"] : ["/v", name];
}

function readRegistryString(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/u)) {
    const match = line.match(/\sREG_(?:EXPAND_)?SZ\s+(.*)$/u);
    if (match?.[1] != null) return match[1].trim();
  }
  return null;
}

export function createElectronWindowsRegExePort(
  run: ElectronWindowsRegistryExec = execFileAsync,
): ElectronWindowsRegistryPort {
  return Object.freeze({
    async keyExists(hive, key) {
      try {
        await run("reg.exe", ["query", fullRegistryKey(hive, key)], { windowsHide: true });
        return true;
      } catch {
        return false;
      }
    },
    async readString(hive, key, name) {
      try {
        const result = await run(
          "reg.exe",
          ["query", fullRegistryKey(hive, key), ...registryValueSelector(name)],
          { windowsHide: true },
        ) as Readonly<{ stdout?: string }>;
        return readRegistryString(result.stdout ?? "");
      } catch {
        return null;
      }
    },
    async writeString(hive, key, name, value) {
      await run(
        "reg.exe",
        ["add", fullRegistryKey(hive, key), ...registryValueSelector(name), "/t", "REG_SZ", "/d", value, "/f"],
        { windowsHide: true },
      );
    },
  });
}
