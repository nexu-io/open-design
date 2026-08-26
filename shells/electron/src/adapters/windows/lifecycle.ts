import type { ElectronShellActions, ElectronShellManifest } from "@open-design/electron-kit/runtime";
import {
  createElectronWindowsRegExePort,
  reconcileElectronWindowsDisplayVersion,
  resolveElectronWindowsInstallIdentity,
  type ElectronWindowsLifecyclePolicy,
} from "@open-design/electron-kit/windows";

export function createWindowsCommittedObserver(
  manifest: ElectronShellManifest,
  policy: ElectronWindowsLifecyclePolicy,
): NonNullable<ElectronShellActions["observeCommitted"]> {
  const identity = resolveElectronWindowsInstallIdentity({ manifest, policy });
  return async () => {
    const receipt = await reconcileElectronWindowsDisplayVersion({
      identity,
      registry: createElectronWindowsRegExePort(),
      version: manifest.version,
    });
    if (receipt.status !== "ignored-platform" && receipt.status !== "unchanged") {
      console.info("[shell/electron] Windows DisplayVersion reconciliation", receipt);
    }
  };
}
