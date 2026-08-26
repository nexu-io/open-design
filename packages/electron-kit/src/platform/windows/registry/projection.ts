import { win32 } from "node:path";

import type {
  ElectronWindowsInstallIdentity,
  ElectronWindowsRegistryProjection,
  ElectronWindowsRegistryValue,
} from "../contracts.js";

function quoteWindowsCommand(executablePath: string, ...args: string[]): string {
  return [`"${executablePath}"`, ...args.map((argument) => `"${argument}"`)].join(" ");
}

export function createElectronWindowsRegistryProjection(input: Readonly<{
  identity: ElectronWindowsInstallIdentity;
  installDirectory: string;
  version: string;
}>): ElectronWindowsRegistryProjection {
  if (!win32.isAbsolute(input.installDirectory)) throw new Error("Electron Windows install directory must be absolute");
  if (input.version.trim().length === 0) throw new Error("Electron Windows display version is required");
  const executablePath = win32.join(input.installDirectory, input.identity.executableName);
  const uninstallerPath = win32.join(input.installDirectory, input.identity.uninstallerName);
  const uninstallScopeArgument = input.identity.hive === "HKCU" ? "/currentuser" : "/allusers";
  const protocolCommandKey = `${input.identity.protocolKey}\\shell\\open\\command`;
  const values: ElectronWindowsRegistryValue[] = [
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "DisplayName", value: input.identity.displayName },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "DisplayVersion", value: input.version },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "Publisher", value: input.identity.publisher },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "InstallLocation", value: input.installDirectory },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "DisplayIcon", value: `${executablePath},0` },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "UninstallString", value: quoteWindowsCommand(uninstallerPath, uninstallScopeArgument) },
    { hive: input.identity.hive, key: input.identity.uninstallKey, name: "QuietUninstallString", value: quoteWindowsCommand(uninstallerPath, uninstallScopeArgument, "/S") },
    { hive: input.identity.hive, key: input.identity.installLocatorKey, name: "InstallLocation", value: input.installDirectory },
    { hive: input.identity.hive, key: input.identity.appPathsKey, name: "", value: executablePath },
    { hive: input.identity.hive, key: input.identity.protocolKey, name: "", value: `URL:${input.identity.displayName} Protocol` },
    { hive: input.identity.hive, key: input.identity.protocolKey, name: "URL Protocol", value: "" },
    { hive: input.identity.hive, key: `${input.identity.protocolKey}\\DefaultIcon`, name: "", value: `${executablePath},0` },
    { hive: input.identity.hive, key: protocolCommandKey, name: "", value: quoteWindowsCommand(executablePath, "%1") },
  ];
  return Object.freeze({ identity: input.identity, values: Object.freeze(values) });
}
