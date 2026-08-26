import type { ElectronShellManifest } from "../../contracts/index.js";
import {
  ELECTRON_WINDOWS_LIFECYCLE_SCHEMA_VERSION,
  type ElectronWindowsInstallIdentity,
  type ElectronWindowsLifecyclePolicy,
} from "./contracts.js";

const publisher = /^\S(?:.{0,126}\S)?$/u;
const windowsFileSegment = /^(?!.*[. ]$)[^<>:"/\\|?*\u0000-\u001f]+$/u;

export function validateElectronWindowsLifecyclePolicy(
  value: ElectronWindowsLifecyclePolicy,
): ElectronWindowsLifecyclePolicy {
  if (value.schemaVersion !== ELECTRON_WINDOWS_LIFECYCLE_SCHEMA_VERSION) {
    throw new Error("unsupported Electron Windows lifecycle policy schema");
  }
  if (value.install.scope !== "current-user" && value.install.scope !== "per-machine") {
    throw new Error("invalid Electron Windows install scope");
  }
  if (!publisher.test(value.install.publisher)) throw new Error("invalid Electron Windows publisher");
  if (value.uninstall.productData !== "retain" && value.uninstall.productData !== "remove") {
    throw new Error("invalid Electron Windows product-data policy");
  }
  return structuredClone(value);
}

export function resolveElectronWindowsInstallIdentity(input: Readonly<{
  manifest: ElectronShellManifest;
  policy: ElectronWindowsLifecyclePolicy;
}>): ElectronWindowsInstallIdentity {
  const policy = validateElectronWindowsLifecyclePolicy(input.policy);
  if (!windowsFileSegment.test(input.manifest.productName)) {
    throw new Error("Electron product name is not a safe Windows file segment");
  }
  const executableName = `${input.manifest.executableName}.exe` as const;
  const hive = policy.install.scope === "current-user" ? "HKCU" : "HKLM";
  return Object.freeze({
    appId: input.manifest.appId,
    appPathsKey: `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executableName}`,
    displayName: input.manifest.productName,
    executableName,
    hive,
    protocolKey: `Software\\Classes\\${input.manifest.protocol}`,
    publisher: policy.install.publisher,
    shortcutName: `${input.manifest.productName}.lnk`,
    uninstallKey: `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${input.manifest.appId}`,
    uninstallerName: `Uninstall ${input.manifest.productName}.exe`,
  });
}
