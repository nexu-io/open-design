import { resolveElectronSessionPaths, readElectronCapsuleSelection } from "@open-design/electron-kit";
import { inspectElectronCapsule } from "@open-design/electron-kit/capsule-loader";
import { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { loadElectronInstalledTrust, resolveElectronStandaloneTarget } from "../../standalone/installation.ts";
import type { ElectronDiagnosticSession } from "./inspection.ts";

/** Inspect authenticated selected bytes without loading code or changing state.
 * Trust always comes from the sealed installation, never the downloaded tree. */
export async function inspectElectronSelectedCapsule(session: ElectronDiagnosticSession, installedRoot: string) {
  if (session.presentation !== "headless" && session.presentation !== "interactive") throw new Error("invalid Electron diagnostic presentation");
  const paths = resolveElectronSessionPaths(session);
  const selected = await readElectronCapsuleSelection(paths.runtimeRoot);
  if (selected.current == null || selected.pending != null) throw new Error("Electron Capsule selection is not committed");
  const physical = await readElectronInstalledManifest(installedRoot), target = resolveElectronStandaloneTarget();
  if (physical.manifest.channel !== session.channel || physical.manifest.productName !== session.productName) throw new Error("Capsule inspection installation identity mismatch");
  const { trustedKeys } = await loadElectronInstalledTrust({ resourceRoot: installedRoot, channel: session.channel, target });
  const capsule = await inspectElectronCapsule({ envelope: selected.current.envelope, root: selected.current.root, trustedKeys,
    carrier: { target, shell: physical.manifest.shell } });
  return Object.freeze({ envelope: selected.current.envelope, shell: capsule.shell, entrypoint: capsule.entrypoint,
    closureGenerationId: selected.current.closureGenerationId, revision: selected.revision });
}
