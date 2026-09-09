import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { recoverElectronStartup, resolveElectronNamespacePaths, resolveElectronSessionNamespace,
  armElectronCapsuleSelection, readElectronCapsuleSelection,
  type ElectronRecoveryTarget } from "@open-design/electron-kit";
import { inspectElectronCapsule } from "@open-design/electron-kit/capsule-loader";
import { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { validateElectronShellManifest, resolveElectronCompositeShellIdentity, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { prepareNodePlatformResource } from "@open-design/standalone/packages/resource";
import { canonicalJson, ensureStandaloneBlob, materializeStandaloneBlob, sha256Hex, StandaloneHostLifecycle, StandaloneHostLifecycleLedger, StandaloneStore, verifyDocument } from "@open-design/standalone";
import declaration from "../../../config/standalone.json" with { type: "json" };
import { loadElectronInstalledCapsuleSeed, loadElectronStandaloneInstallation, resolveElectronStandaloneTarget } from "./installation.js";
import { validateElectronPhysicalResourceSet } from "./physical-resources.js";
import { withElectronStoppedResourceSet } from "./guarded-lifecycle.js";
import { resolveElectronStandaloneStoreRoot } from "./store-root.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";
import { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";

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
  const scope = { channel: manifest.channel, namespace: resolveElectronSessionNamespace(manifest.namespace, request.session.presentation) };
  const paths = resolveElectronNamespacePaths(request.session.baseUserDataRoot, scope);
  const store = new StandaloneStore(resolveElectronStandaloneStoreRoot(paths.runtimeRoot), scope);
  const platformTarget = resolveElectronStandaloneTarget();
  let seedAcquisition: ReturnType<typeof loadElectronInstalledCapsuleSeed> | undefined;
  const installedSeed = () => seedAcquisition ??= loadElectronInstalledCapsuleSeed({ resourceRoot: request.resourceRoot,
    channel: scope.channel, target: platformTarget, carrierVersion: manifest.shell.version });
  const installation = await loadElectronStandaloneInstallation({ resourceRoot: request.resourceRoot, channel: scope.channel, target: platformTarget });
  const { trustedKeys } = installation;
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
        return { capsuleManifestSha256: sha256Hex(canonicalJson(selected?.envelope ?? (await installedSeed()).envelope)), closureGenerationId };
      },
      async repair(target) {
        const updaterLedger = new ElectronStandaloneShellUpdaterLedger(store.root, scope, "electron");
        const updater = await updaterLedger.read();
        const lifecycleLedger = new StandaloneHostLifecycleLedger(store.root, scope);
        const lifecycle = await lifecycleLedger.read();
        const transition = lifecycle?.transition;
        const restart = updater.handoff?.interaction === "restart-and-activate"
          && (updater.state === "applying" || updater.state === "handed-off");
        if (transition != null && (!restart || transition.kind !== "content-restart" || transition.token !== updater.installAttemptId)) {
          throw new Error("startup recovery cannot clear another lifecycle transition");
        }
        const capsuleState = await readElectronCapsuleSelection(paths.runtimeRoot);
        const selected = [capsuleState.pending, capsuleState.current].find(value => value != null
          && sha256Hex(canonicalJson(value.envelope)) === target.capsuleManifestSha256);
        // Retained current/pending selections are authoritative. A historical
        // first-install archive is not a prerequisite for their exact recovery.
        const seed = selected == null ? await installedSeed() : null;
        if (seed != null && target.capsuleManifestSha256 !== sha256Hex(canonicalJson(seed.envelope))) throw new Error("selected Capsule is not available in this installation");
        const capsuleEnvelope = selected?.envelope ?? seed!.envelope;
        verifyDocument(capsuleEnvelope, trustedKeys);
        resolveElectronCompositeShellIdentity(capsuleEnvelope.document, { target: platformTarget, shell: manifest.shell });
        const envelope = target.closureGenerationId === installedGenerationId ? installation.envelope
          : await store.readGenerationMetadata(target.closureGenerationId, trustedKeys);
        const capsule = capsuleEnvelope.document;
        const descriptor = { ...capsule.archive, mediaType: "application/zip", sources: [] };
        const recipe = { type: "zip" as const, entrypoint: capsule.entrypoint, treeSha256: capsule.archive.treeSha256 };
        let capsuleRoot: string;
        if (seed != null) {
          capsuleRoot = (await materializeStandaloneBlob(join(paths.runtimeRoot, "capsule"), descriptor, seed.archivePath, recipe)).path;
        } else {
          capsuleRoot = selected!.root;
          try { await inspectElectronCapsule({ envelope: capsuleEnvelope, trustedKeys,
            root: capsuleRoot, carrier: { target: platformTarget, shell: manifest.shell } }); }
          catch {
            // Recover the selected archive from its existing content-addressed
            // owner, never replace a missing selection with installed/latest.
            try {
              const localArchive = async () => {
                // These are the two existing owners: promoted selections and
                // initial local materialization. Never scan arbitrary caches.
                for (const cacheRoot of [join(store.root, "capsule"), join(paths.runtimeRoot, "capsule")]) {
                  try { return { cacheRoot, path: (await ensureStandaloneBlob(cacheRoot, descriptor)).path }; }
                  catch { /* Try the other exact local owner, then the bound seed. */ }
                }
                const baseline = await installedSeed();
                if (sha256Hex(canonicalJson(baseline.envelope)) !== target.capsuleManifestSha256) {
                  throw new Error("installed Capsule differs from the exact recovery target");
                }
                return { cacheRoot: join(paths.runtimeRoot, "capsule"), path: baseline.archivePath };
              };
              const archive = await localArchive();
              capsuleRoot = (await materializeStandaloneBlob(archive.cacheRoot, descriptor, archive.path, recipe)).path;
            } catch (cause) {
              if (request.allowNetwork !== true) throw new Error("exact Capsule recovery bytes are missing locally; online reacquisition was not authorized", { cause });
              const feed = new ElectronReleaseExactFeed({ cacheRoot: store.root, channel: scope.channel,
                channelHeadUrl: installation.declaration.update.channelHeadUrl,
                currentReleaseVersion: installation.declaration.releaseVersion, shell: manifest.shell,
                target: platformTarget, trustedKeys });
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
        const verified = await inspectElectronCapsule({ envelope: capsuleEnvelope, trustedKeys,
          root: capsuleRoot, carrier: { target: platformTarget, shell: manifest.shell } });
        await prepareNodePlatformResource({ root: join(store.root, "platform"), resource: verified.manifest.platform, recovery: true },
          request.allowNetwork === true ? {} : {
            fetch: async () => { throw new Error("exact platform recovery bytes are missing locally; online reacquisition was not authorized"); },
          });
        const state = await store.readState();
        await store.recoverGeneration({ envelope, trustedKeys, shell: verified.shell,
          expectedGenerationId: target.closureGenerationId, expectedRevision: state.revision }, {
          ...(request.allowNetwork === true ? {} : {
            fetch: async () => { throw new Error("exact recovery resource is missing locally; online reacquisition was not authorized"); },
          }),
        });
        await armElectronCapsuleSelection({ runtimeRoot: paths.runtimeRoot, expectedRevision: capsuleState.revision,
          closureGenerationId: target.closureGenerationId, recovery: true,
          capsule: { envelope: capsuleEnvelope, trustedKeys, root: capsuleRoot,
            carrier: { target: platformTarget, shell: manifest.shell } } });
        if (restart) {
          // Physical absence is already proved by the enclosing resource-set
          // guard. Explicit recovery may abandon only this updater's transition,
          // never an installer claim or an unrelated successor operation.
          if (transition != null) {
            const continuation = new StandaloneHostLifecycle(scope, { statePort: lifecycleLedger });
            const sealed = transition.phase === "stopped-sealed" ? transition
              : await continuation.forceStopTransition(transition.token, transition.fence);
            await continuation.abandonStoppedTransition(transition.token, sealed.fence);
          }
          await updaterLedger.update({ expectedRevision: updater.revision, state: "failed",
            error: { code: "electron-restart-recovered", message: "Explicit exact recovery replaced the interrupted restart attempt" } });
        }
      },
    });
  });
}
