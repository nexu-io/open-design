import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPackageResourceTemplate } from "../../../lib/templates.js";
import type { ElectronWindowsInstallIdentity } from "../contracts.js";

const ELECTRON_KIT_PACKAGE_NAME = "@open-design/electron-kit";
const NSIS_TEMPLATE_RESOURCE = "resources/windows/installer.nsh.tmpl";

function escapeNsisString(value: string): string {
  if (/\r|\n/u.test(value)) throw new Error("NSIS values cannot contain line breaks");
  return value.replaceAll("$", () => "$$").replaceAll('"', () => '$\\"');
}

/**
 * Extend electron-builder's install-tree lifecycle with the registry projections
 * it does not own. customInstall runs after application files and standard
 * uninstall identity are committed; customUnInstall runs before tree removal.
 */
export async function createElectronWindowsNsisInclude(identity: ElectronWindowsInstallIdentity): Promise<string> {
  return await renderPackageResourceTemplate({
    packageName: ELECTRON_KIT_PACKAGE_NAME,
    resourcePath: NSIS_TEMPLATE_RESOURCE,
    startDirectory: dirname(fileURLToPath(import.meta.url)),
    values: {
      APP_PATHS_KEY: escapeNsisString(identity.appPathsKey),
      PROTOCOL_KEY: escapeNsisString(identity.protocolKey),
      PROTOCOL_LABEL: escapeNsisString(identity.displayName),
      PUBLISHER: escapeNsisString(identity.publisher),
      UNINSTALL_KEY: escapeNsisString(identity.uninstallKey),
    },
  });
}

export async function writeElectronWindowsNsisInclude(input: Readonly<{
  identity: ElectronWindowsInstallIdentity;
  path: string;
}>): Promise<void> {
  await writeFile(input.path, await createElectronWindowsNsisInclude(input.identity), "utf8");
}
