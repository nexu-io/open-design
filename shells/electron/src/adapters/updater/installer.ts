import {
  scheduleElectronInstallerHandoff,
  type ElectronShellActions,
} from "@open-design/electron-kit/runtime";

export function createInstallerHandoffAdapter(): NonNullable<ElectronShellActions["installUpdate"]> {
  return (request) => scheduleElectronInstallerHandoff({
    ...request,
    mode: process.env.ELECTRON_KIT_FIXTURE_INSTALLER_VERIFY_ONLY === "1" ? "verify-only" : "execute",
  });
}
