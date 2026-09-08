import { join } from "node:path";
import { canonicalJson, materializeStandaloneBlob, verifyDocument,
  type GenerationState, type StandaloneShellIdentity, type StandaloneTrustedKeyRing } from "@open-design/standalone";
import { createElectronCapsuleLoader } from "@open-design/electron-kit/capsule-loader";
import { readElectronCapsuleSelection, type ElectronCapsuleSelection } from "@open-design/electron-kit";
import { resolveElectronCompositeShellIdentity, type ElectronShellManifest, type ElectronCapsuleTarget } from "@open-design/electron-kit/contracts";
import { loadElectronInstalledCapsuleSeed, resolveElectronStandaloneTarget } from "./installation.js";

const load = createElectronCapsuleLoader();

/** Read-only startup precondition. Physical retirement and activation still
 * belong to the authority's existing guarded continuation. */
export function assertElectronPendingCapsule(input: Readonly<{
  pending: ElectronCapsuleSelection;
  state: GenerationState;
  carrier: Readonly<{ target: ElectronCapsuleTarget; shell: StandaloneShellIdentity }>;
  shell: StandaloneShellIdentity;
  trustedKeys: StandaloneTrustedKeyRing;
}>): void {
  verifyDocument(input.pending.envelope, input.trustedKeys);
  const selectedShell = resolveElectronCompositeShellIdentity(input.pending.envelope.document, input.carrier);
  if (canonicalJson(selectedShell) !== canonicalJson(input.shell)) throw new Error("pending Capsule differs from the running verified Shell capability");
  if (input.state.active !== input.pending.closureGenerationId
    && (input.state.prepared !== input.pending.closureGenerationId || input.state.activationIntent?.generationId !== input.pending.closureGenerationId)) {
    throw new Error("pending Capsule lacks its exact authorized Closure; explicit recovery required");
  }
}

/** Execute only the pinned pending/current selection, or the installed seed on
 * first start. Neither lookup nor recovery discovers a Capsule latest. */
export async function loadInstalledElectronCapsule(manifest: ElectronShellManifest, installation: Readonly<{
  resourceRoot: string;
  runtimeRoot: string;
}>) {
  const target = resolveElectronStandaloneTarget();
  const seed = await loadElectronInstalledCapsuleSeed({ resourceRoot: installation.resourceRoot,
    channel: manifest.channel, target, carrierVersion: manifest.shell.version });
  const state = await readElectronCapsuleSelection(installation.runtimeRoot);
  const selected = state.pending ?? state.current;
  if (selected != null) {
    return await load({ envelope: selected.envelope, trustedKeys: seed.trustedKeys, root: selected.root,
      carrier: { target, shell: manifest.shell }, selectionRevision: state.revision });
  }
  const capsule = seed.envelope.document;
  const materialized = await materializeStandaloneBlob(join(installation.runtimeRoot, "capsule"),
    { ...capsule.archive, mediaType: "application/zip", sources: [] }, seed.archivePath,
    { type: "zip", entrypoint: capsule.entrypoint, treeSha256: capsule.archive.treeSha256 });
  return await load({ envelope: seed.envelope, trustedKeys: seed.trustedKeys, root: materialized.path,
    carrier: { target, shell: manifest.shell }, selectionRevision: state.revision });
}
