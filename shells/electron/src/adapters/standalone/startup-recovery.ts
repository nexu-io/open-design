import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { recoverElectronStartup, resolveElectronNamespacePaths, resolveElectronSessionNamespace,
  armElectronCapsuleSelection, readElectronCapsuleSelection,
  type ElectronRecoveryTarget } from "@open-design/electron-kit";
import { inspectElectronCapsule } from "@open-design/electron-kit/capsule-loader";
import { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { validateElectronShellManifest, resolveElectronCompositeShellIdentity, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { bindNodePlatform } from "@open-design/standalone/packages";
import { canonicalJson, ensureStandaloneBlob, materializeStandaloneBlob, sha256Hex, StandaloneStore, verifyDocument } from "@open-design/standalone";
import declaration from "../../../config/standalone.json" with { type: "json" };
import { loadElectronInstalledCapsuleSeed, loadElectronStandaloneInstallation, resolveElectronStandaloneTarget } from "./installation.js";
import { validateElectronPhysicalResourceSet } from "./physical-resources.js";
import { withElectronStoppedResourceSet } from "./guarded-lifecycle.js";
import { resolveElectronStandaloneStoreRoot } from "./store-root.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";
import { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";

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
        const capsules = await readElectronCapsuleSelection(paths.runtimeRoot);
        if (capsules.pending != null && state.activationIntent != null
          && capsules.pending.closureGenerationId !== state.activationIntent.generationId) throw new Error("pending Capsule and Closure selections disagree; supply an explicit exact target");
        const closureGenerationId = capsules.pending?.closureGenerationId ?? state.activationIntent?.generationId ?? state.active
          ?? (state.revision === 0 ? installedGenerationId : null);
        if (closureGenerationId == null) throw new Error("Electron recovery has no selected Closure; supply an explicit exact target");
        const selected = capsules.pending ?? capsules.current;
        return { capsuleManifestSha256: selected == null ? capsuleManifestSha256 : sha256Hex(canonicalJson(selected.envelope)), closureGenerationId };
      },
      async repair(target) {
        const capsuleState = await readElectronCapsuleSelection(paths.runtimeRoot);
        const selected = [capsuleState.pending, capsuleState.current].find(value => value != null
          && sha256Hex(canonicalJson(value.envelope)) === target.capsuleManifestSha256);
        if (target.capsuleManifestSha256 !== capsuleManifestSha256 && selected == null) throw new Error("selected Capsule is not available in this installation");
        const capsuleEnvelope = target.capsuleManifestSha256 === capsuleManifestSha256 ? seed.envelope : selected!.envelope;
        verifyDocument(capsuleEnvelope, seed.trustedKeys);
        resolveElectronCompositeShellIdentity(capsuleEnvelope.document, { target: platformTarget, shell: manifest.shell });
        const envelope = target.closureGenerationId === installedGenerationId ? installation.envelope
          : await store.readGenerationMetadata(target.closureGenerationId, seed.trustedKeys);
        const capsule = capsuleEnvelope.document;
        const descriptor = { ...capsule.archive, mediaType: "application/zip", sources: [] };
        const recipe = { type: "zip" as const, entrypoint: capsule.entrypoint, treeSha256: capsule.archive.treeSha256 };
        let capsuleRoot: string;
        if (target.capsuleManifestSha256 === capsuleManifestSha256) {
          capsuleRoot = (await materializeStandaloneBlob(join(paths.runtimeRoot, "capsule"), descriptor, seed.archivePath, recipe)).path;
        } else {
          capsuleRoot = selected!.root;
          try { await inspectElectronCapsule({ envelope: capsuleEnvelope, trustedKeys: seed.trustedKeys,
            root: capsuleRoot, carrier: { target: platformTarget, shell: manifest.shell } }); }
          catch {
            // Recover the selected archive from its existing content-addressed
            // owner, never replace a missing selection with installed/latest.
            const cacheRoot = join(store.root, "capsule");
            try {
              const archive = await ensureStandaloneBlob(cacheRoot, descriptor);
              capsuleRoot = (await materializeStandaloneBlob(cacheRoot, descriptor, archive.path, recipe)).path;
            } catch (cause) {
              if (request.allowNetwork !== true) throw new Error("exact Capsule recovery bytes are missing locally; online reacquisition was not authorized", { cause });
              const feed = new ElectronReleaseExactFeed({ cacheRoot: store.root, channel: scope.channel,
                channelHeadUrl: installation.declaration.update.channelHeadUrl,
                currentReleaseVersion: installation.declaration.releaseVersion, shell: manifest.shell,
                target: platformTarget, trustedKeys: seed.trustedKeys });
              const candidate = await new ElectronStandaloneShellCandidateLedger(store.root, scope, feed).read();
              if (candidate == null) throw new Error("exact Capsule recovery has no retained signed release source", { cause });
              // Authenticate the retained lane before acquiring code. A newer
              // candidate cannot silently replace the pinned recovery target.
              const exactEnvelope = await feed.readCapsule(candidate);
              if (sha256Hex(canonicalJson(exactEnvelope)) !== target.capsuleManifestSha256) {
                throw new Error("retained release source differs from the exact Capsule recovery target");
              }
              capsuleRoot = (await feed.prepareCapsule(candidate)).root;
            }
          }
        }
        const verified = await inspectElectronCapsule({ envelope: capsuleEnvelope, trustedKeys: seed.trustedKeys,
          root: capsuleRoot, carrier: { target: platformTarget, shell: manifest.shell } });
        const state = await store.readState();
        await store.recoverGeneration({ envelope, trustedKeys: seed.trustedKeys, shell: verified.shell,
          expectedGenerationId: target.closureGenerationId, expectedRevision: state.revision }, {
          candidates: installation.candidates,
          ...(request.allowNetwork === true ? {} : {
            fetch: async () => { throw new Error("exact recovery resource is missing locally; online reacquisition was not authorized"); },
          }),
        });
        await armElectronCapsuleSelection({ runtimeRoot: paths.runtimeRoot, expectedRevision: capsuleState.revision,
          closureGenerationId: target.closureGenerationId, recovery: true,
          capsule: { envelope: capsuleEnvelope, trustedKeys: seed.trustedKeys, root: capsuleRoot,
            carrier: { target: platformTarget, shell: manifest.shell } } });
      },
    });
  });
}
