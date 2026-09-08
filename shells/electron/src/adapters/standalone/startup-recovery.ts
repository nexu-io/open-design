import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { recoverElectronStartup, resolveElectronNamespacePaths, resolveElectronSessionNamespace,
  type ElectronRecoveryTarget } from "@open-design/electron-kit";
import { inspectElectronCapsule } from "@open-design/electron-kit/capsule-loader";
import { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { bindNodePlatform } from "@open-design/standalone/packages";
import { canonicalJson, materializeStandaloneBlob, sha256Hex, StandaloneStore } from "@open-design/standalone";
import declaration from "../../../config/standalone.json" with { type: "json" };
import { loadElectronInstalledCapsuleSeed, loadElectronStandaloneInstallation, resolveElectronStandaloneTarget } from "./installation.js";
import { validateElectronPhysicalResourceSet } from "./physical-resources.js";
import { withElectronStoppedResourceSet } from "./guarded-lifecycle.js";
import { resolveElectronStandaloneStoreRoot } from "./store-root.js";

export type ElectronStartupRecoveryRequest = Readonly<{
  schemaVersion: 1;
  resourceRoot: string;
  installation: "development" | "installed";
  session: Readonly<{ baseUserDataRoot: string; channel: string; namespace: string; presentation: "headless" | "interactive" }>;
  target?: ElectronRecoveryTarget;
  allowNetwork?: boolean;
}>;

/** Explicit stopped-session recovery. This entry imports neither Capsule code
 * nor Web/daemon, never launches a host, and cannot stop another consumer. */
export async function recoverElectronProductStartup(input: ElectronStartupRecoveryRequest) {
  const request = structuredClone(input);
  if (request.schemaVersion !== 1 || !["development", "installed"].includes(request.installation)
    || !["headless", "interactive"].includes(request.session.presentation)
    || (request.allowNetwork != null && typeof request.allowNetwork !== "boolean")) throw new Error("invalid Electron recovery request");
  for (const path of [request.resourceRoot, request.session.baseUserDataRoot]) {
    if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Electron recovery paths must be absolute and normalized");
  }
  let manifest: ElectronShellManifest;
  if (request.installation === "installed") manifest = (await readElectronInstalledManifest(request.resourceRoot)).manifest;
  else {
    const path = join(request.resourceRoot, "shell.json"), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("development Shell manifest must be a regular file");
    manifest = validateElectronShellManifest(JSON.parse(await readFile(path, "utf8")) as ElectronShellManifest);
  }
  if (manifest.channel !== request.session.channel || manifest.namespace !== request.session.namespace) throw new Error("Electron recovery escaped its physical installation scope");
  // Damaged physical packages require installation repair, never hot recovery.
  await bindNodePlatform(join(request.resourceRoot, "platform"));
  const scope = { channel: manifest.channel, namespace: resolveElectronSessionNamespace(manifest.namespace, request.session.presentation) };
  const paths = resolveElectronNamespacePaths(request.session.baseUserDataRoot, scope);
  const store = new StandaloneStore(resolveElectronStandaloneStoreRoot(paths.runtimeRoot), scope);
  const platformTarget = resolveElectronStandaloneTarget();
  const seed = await loadElectronInstalledCapsuleSeed({ resourceRoot: request.resourceRoot,
    channel: scope.channel, target: platformTarget, carrierVersion: manifest.shell.version });
  const capsuleManifestSha256 = sha256Hex(canonicalJson(seed.envelope));
  const installation = await loadElectronStandaloneInstallation({ resourceRoot: request.resourceRoot, channel: scope.channel, target: platformTarget });
  const installedGenerationId = sha256Hex(canonicalJson(installation.envelope.metadata));
  return withElectronStoppedResourceSet(validateElectronPhysicalResourceSet(declaration), scope, async () => {
    return recoverElectronStartup({ runtimeRoot: paths.runtimeRoot, target: request.target,
      async selectTarget() {
        const state = await store.readState();
        const closureGenerationId = state.activationIntent?.generationId ?? state.active
          ?? (state.revision === 0 ? installedGenerationId : null);
        if (closureGenerationId == null) throw new Error("Electron recovery has no selected Closure; supply an explicit exact target");
        return { capsuleManifestSha256, closureGenerationId };
      },
      async repair(target) {
        // Until online Capsule selection is installed, only the actual signed
        // installation baseline is selectable; never silently substitute it.
        if (target.capsuleManifestSha256 !== capsuleManifestSha256) throw new Error("selected Capsule is not available in this installation");
        const envelope = target.closureGenerationId === installedGenerationId ? installation.envelope
          : await store.readGenerationMetadata(target.closureGenerationId, seed.trustedKeys);
        const capsule = seed.envelope.document;
        const materialized = await materializeStandaloneBlob(join(paths.runtimeRoot, "capsule"),
          { ...capsule.archive, mediaType: "application/zip", sources: [] }, seed.archivePath,
          { type: "zip", entrypoint: capsule.entrypoint, treeSha256: capsule.archive.treeSha256 });
        const verified = await inspectElectronCapsule({ envelope: seed.envelope, trustedKeys: seed.trustedKeys,
          root: materialized.path, carrier: { target: platformTarget, shell: manifest.shell } });
        const state = await store.readState();
        await store.recoverGeneration({ envelope, trustedKeys: seed.trustedKeys, shell: verified.shell,
          expectedGenerationId: target.closureGenerationId, expectedRevision: state.revision }, {
          candidates: installation.candidates,
          ...(request.allowNetwork === true ? {} : {
            fetch: async () => { throw new Error("exact recovery resource is missing locally; online reacquisition was not authorized"); },
          }),
        });
      },
    });
  });
}
