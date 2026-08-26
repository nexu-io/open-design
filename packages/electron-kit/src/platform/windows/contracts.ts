import type { ElectronShellManifest } from "../../contracts/index.js";

export const ELECTRON_WINDOWS_LIFECYCLE_SCHEMA_VERSION = 1 as const;

export type ElectronWindowsLifecyclePolicy = Readonly<{
  schemaVersion: typeof ELECTRON_WINDOWS_LIFECYCLE_SCHEMA_VERSION;
  install: Readonly<{
    scope: "current-user" | "per-machine";
  }>;
  uninstall: Readonly<{
    productData: "retain" | "remove";
  }>;
}>;

export type ElectronWindowsRegistryHive = "HKCU" | "HKLM";

export type ElectronWindowsInstallIdentity = Readonly<{
  appId: ElectronShellManifest["appId"];
  appPathsKey: string;
  displayName: string;
  executableName: `${string}.exe`;
  hive: ElectronWindowsRegistryHive;
  installLocatorKey: string;
  protocolKey: string;
  publisher: string;
  shortcutName: `${string}.lnk`;
  uninstallKey: string;
  uninstallerName: `${string}.exe`;
}>;

export type ElectronWindowsRegistryValue = Readonly<{
  hive: ElectronWindowsRegistryHive;
  key: string;
  name: string;
  value: string;
}>;

export type ElectronWindowsRegistryProjection = Readonly<{
  identity: ElectronWindowsInstallIdentity;
  values: readonly ElectronWindowsRegistryValue[];
}>;

export type ElectronWindowsRegistryPort = Readonly<{
  keyExists(hive: ElectronWindowsRegistryHive, key: string): Promise<boolean>;
  readString(hive: ElectronWindowsRegistryHive, key: string, name: string): Promise<string | null>;
  writeString(hive: ElectronWindowsRegistryHive, key: string, name: string, value: string): Promise<void>;
}>;
