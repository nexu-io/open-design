import type { Configuration } from "electron-builder";

import type { ElectronShellManifest } from "../boundary/index.js";

export const ELECTRON_DISTRIBUTION_POLICY_SCHEMA_VERSION = 1 as const;

export type ElectronDistributionPolicy = Readonly<{
  schemaVersion: typeof ELECTRON_DISTRIBUTION_POLICY_SCHEMA_VERSION;
  mac: Readonly<{
    arch: "current";
    category: string;
    targets: readonly ["dir", "dmg"];
    dmg: Readonly<{ sign: boolean }>;
  }>;
  windows: Readonly<{
    arch: "x64";
    targets: readonly ["dir", "nsis"];
    nsis: Readonly<{
      allowElevation: boolean;
      allowToChangeInstallationDirectory: boolean;
      createDesktopShortcut: boolean;
      createStartMenuShortcut: boolean;
      deleteAppDataOnUninstall: boolean;
      displayLanguageSelector: boolean;
      installerLanguages: readonly string[];
      language: string;
      multiLanguageInstaller: boolean;
      oneClick: boolean;
      perMachine: boolean;
      warningsAsErrors: boolean;
    }>;
  }>;
}>;

const macCategory = /^public\.app-category\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u;
const installerLanguage = /^[a-z]{2}_[A-Z]{2}$/u;

function exactTargets(value: readonly string[], expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((target, index) => target === expected[index]);
}

export function validateElectronDistributionPolicy(value: ElectronDistributionPolicy): ElectronDistributionPolicy {
  if (value.schemaVersion !== ELECTRON_DISTRIBUTION_POLICY_SCHEMA_VERSION) throw new Error("unsupported Electron distribution policy schema");
  if (value.mac.arch !== "current" || !macCategory.test(value.mac.category) || !exactTargets(value.mac.targets, ["dir", "dmg"])) {
    throw new Error("invalid Electron macOS distribution policy");
  }
  if (typeof value.mac.dmg.sign !== "boolean") throw new Error("invalid Electron DMG signing policy");
  if (value.windows.arch !== "x64" || !exactTargets(value.windows.targets, ["dir", "nsis"])) {
    throw new Error("invalid Electron Windows distribution policy");
  }
  const nsis = value.windows.nsis;
  for (const [name, candidate] of Object.entries({
    allowElevation: nsis.allowElevation,
    allowToChangeInstallationDirectory: nsis.allowToChangeInstallationDirectory,
    createDesktopShortcut: nsis.createDesktopShortcut,
    createStartMenuShortcut: nsis.createStartMenuShortcut,
    deleteAppDataOnUninstall: nsis.deleteAppDataOnUninstall,
    displayLanguageSelector: nsis.displayLanguageSelector,
    multiLanguageInstaller: nsis.multiLanguageInstaller,
    oneClick: nsis.oneClick,
    perMachine: nsis.perMachine,
    warningsAsErrors: nsis.warningsAsErrors,
  })) {
    if (typeof candidate !== "boolean") throw new Error(`invalid Electron NSIS ${name} policy`);
  }
  if (!/^\d{4}$/u.test(nsis.language) || !Array.isArray(nsis.installerLanguages) || nsis.installerLanguages.length === 0
    || nsis.installerLanguages.length > 16 || new Set(nsis.installerLanguages).size !== nsis.installerLanguages.length
    || nsis.installerLanguages.some((language: unknown) => typeof language !== "string" || !installerLanguage.test(language))) {
    throw new Error("invalid Electron NSIS language policy");
  }
  return structuredClone(value);
}

export function resolveElectronDistributionPlatform(platform: NodeJS.Platform): "mac" | "win" {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  throw new Error(`unsupported Electron distribution platform: ${platform}`);
}

export function resolveElectronDistributionConfiguration(input: Readonly<{
  manifest: ElectronShellManifest;
  policy: ElectronDistributionPolicy;
  electronVersion: string;
  outputRoot: string;
}>): Configuration {
  const policy = validateElectronDistributionPolicy(input.policy);
  return {
    appId: input.manifest.appId,
    productName: input.manifest.productName,
    executableName: input.manifest.executableName,
    electronVersion: input.electronVersion,
    asar: true,
    compression: "maximum",
    directories: { output: input.outputRoot },
    files: ["main.cjs", "electron-shell.json", "preflight.json", "warmup.json", "node-lock.json", "package.json", "scene-receipt.json"],
    npmRebuild: false,
    nodeGypRebuild: false,
    mac: { category: policy.mac.category, target: [...policy.mac.targets] },
    dmg: { sign: policy.mac.dmg.sign },
    win: { target: [...policy.windows.targets] },
    nsis: {
      ...policy.windows.nsis,
      installerLanguages: [...policy.windows.nsis.installerLanguages],
      shortcutName: input.manifest.productName,
    },
  };
}
