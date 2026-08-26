import { describe, expect, it } from "vitest";

import {
  createElectronWindowsRegistryProjection,
  createElectronWindowsRegExePort,
  readWindowsCommandExecutable,
  reconcileElectronWindowsDisplayVersion,
  resolveElectronWindowsOwnedRegistryCleanup,
  type ElectronWindowsInstallIdentity,
  type ElectronWindowsRegistryPort,
} from "@/platform/windows/index.js";

const identity: ElectronWindowsInstallIdentity = {
  appId: "io.example.desktop",
  appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\example.exe",
  displayName: "Example Desktop",
  executableName: "example.exe",
  hive: "HKCU",
  protocolKey: "Software\\Classes\\example",
  publisher: "Example Company",
  shortcutName: "Example Desktop.lnk",
  uninstallKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\io.example.desktop",
  uninstallerName: "Uninstall Example Desktop.exe",
};

describe("Electron Windows registry lifecycle", () => {
  it("enumerates the complete registry projection without performing I/O", () => {
    const projection = createElectronWindowsRegistryProjection({
      identity,
      installDirectory: "C:\\Users\\Ada\\App Data\\Example Desktop",
      version: "1.2.3",
    });
    expect(projection.values).toHaveLength(12);
    expect(projection.values).toContainEqual({
      hive: "HKCU",
      key: identity.uninstallKey,
      name: "InstallLocation",
      value: "C:\\Users\\Ada\\App Data\\Example Desktop",
    });
    expect(projection.values).toContainEqual({
      hive: "HKCU",
      key: `${identity.protocolKey}\\shell\\open\\command`,
      name: "",
      value: '"C:\\Users\\Ada\\App Data\\Example Desktop\\example.exe" "%1"',
    });
  });

  it("extracts a quoted executable and refuses prefix or malformed ownership matches", () => {
    expect(readWindowsCommandExecutable('"C:\\Program Files\\Example\\example.exe" "%1"')).toBe(
      "C:\\Program Files\\Example\\example.exe",
    );
    expect(readWindowsCommandExecutable('"unterminated')).toBeNull();
    expect(resolveElectronWindowsOwnedRegistryCleanup({
      appPathValue: "C:/Program Files/Example/example.exe",
      executablePath: "C:\\Program Files\\Example\\example.exe",
      installLocation: "C:\\Program Files\\Example2",
      protocolCommand: '"C:\\Program Files\\Example2\\example.exe" "%1"',
      targetInstallDirectory: "C:\\Program Files\\Example",
    })).toEqual({ appPaths: true, protocol: false, uninstall: false });
  });

  it("updates DisplayVersion only through an existing deterministic owner key", async () => {
    const writes: string[][] = [];
    let exists = false;
    const registry: ElectronWindowsRegistryPort = {
      keyExists: async () => exists,
      readString: async () => "1.2.2",
      writeString: async (...args) => { writes.push(args); },
    };
    await expect(reconcileElectronWindowsDisplayVersion({ identity, platform: "win32", registry, version: "1.2.3" }))
      .resolves.toMatchObject({ status: "missing-owner" });
    expect(writes).toEqual([]);
    exists = true;
    await expect(reconcileElectronWindowsDisplayVersion({ identity, platform: "win32", registry, version: "1.2.3" }))
      .resolves.toEqual({ previousVersion: "1.2.2", status: "updated", version: "1.2.3" });
    expect(writes).toEqual([[identity.hive, identity.uninstallKey, "DisplayVersion", "1.2.3"]]);
  });

  it("adapts the atomic registry port to finite reg.exe commands", async () => {
    const calls: Array<{ args: readonly string[]; command: string }> = [];
    const registry = createElectronWindowsRegExePort(async (command, args) => {
      calls.push({ args, command });
      return { stdout: "    DisplayVersion    REG_SZ    1.2.3\r\n" };
    });
    await expect(registry.keyExists("HKCU", identity.uninstallKey)).resolves.toBe(true);
    await expect(registry.readString("HKCU", identity.uninstallKey, "DisplayVersion")).resolves.toBe("1.2.3");
    await registry.writeString("HKCU", identity.uninstallKey, "DisplayVersion", "1.2.4");
    expect(calls).toEqual([
      { command: "reg.exe", args: ["query", `HKCU\\${identity.uninstallKey}`] },
      { command: "reg.exe", args: ["query", `HKCU\\${identity.uninstallKey}`, "/v", "DisplayVersion"] },
      {
        command: "reg.exe",
        args: ["add", `HKCU\\${identity.uninstallKey}`, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", "1.2.4", "/f"],
      },
    ]);
  });
});
