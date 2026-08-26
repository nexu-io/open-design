import type { ElectronWindowsInstallIdentity, ElectronWindowsRegistryPort } from "../contracts.js";

export type ElectronWindowsDisplayVersionReconciliation = Readonly<{
  previousVersion: string | null;
  status: "ignored-platform" | "missing-owner" | "missing-version" | "unchanged" | "updated";
  version: string | null;
}>;

export async function reconcileElectronWindowsDisplayVersion(input: Readonly<{
  identity: ElectronWindowsInstallIdentity;
  platform?: NodeJS.Platform;
  registry: ElectronWindowsRegistryPort;
  version: string | null;
}>): Promise<ElectronWindowsDisplayVersionReconciliation> {
  if ((input.platform ?? process.platform) !== "win32") {
    return Object.freeze({ previousVersion: null, status: "ignored-platform", version: null });
  }
  const version = input.version?.trim() ?? "";
  if (version.length === 0) return Object.freeze({ previousVersion: null, status: "missing-version", version: null });
  if (!await input.registry.keyExists(input.identity.hive, input.identity.uninstallKey)) {
    return Object.freeze({ previousVersion: null, status: "missing-owner", version });
  }
  const previousVersion = await input.registry.readString(input.identity.hive, input.identity.uninstallKey, "DisplayVersion");
  if (previousVersion === version) return Object.freeze({ previousVersion, status: "unchanged", version });
  await input.registry.writeString(input.identity.hive, input.identity.uninstallKey, "DisplayVersion", version);
  return Object.freeze({ previousVersion, status: "updated", version });
}
