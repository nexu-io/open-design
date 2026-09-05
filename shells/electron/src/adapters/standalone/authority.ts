import { join, resolve } from "node:path";

import {
  convergeSidecarLaunch,
  getSidecarStatus,
} from "@open-design/sidecar";
import {
  canonicalJson,
  createStandaloneGenerationBinding,
  sha256Hex,
  StandaloneFeedbackEmitter,
  StandaloneStore,
  StandaloneUpdater,
  VersionedLauncher,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecyclePort,
  type LifecycleStatus,
  type StandaloneGenerationBinding,
  type StandaloneLifecycleTransitionResult,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeStatus,
  type StandaloneShellUpdaterPort,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
  type UpdateActivationPolicy,
} from "@open-design/standalone";
import type {
  ElectronShellManifest,
  ElectronStandaloneAuthorityFactory,
} from "@open-design/electron-kit/runtime";

import { ElectronStandaloneControlClient, createElectronStandaloneControlTransport } from "./control-client.js";
import { ElectronStandaloneControlUpdater } from "./control-updater.js";
import { ELECTRON_STANDALONE_HOST_CONFIG_ENV } from "./host.js";
import {
  loadElectronStandaloneInstallation,
  resolveElectronStandaloneTarget,
} from "./installation.js";
import {
  bindElectronPhysicalResourceSet,
  validateElectronPhysicalResourceSet,
  type ElectronPhysicalResourceSetDeclaration,
} from "./physical-resources.js";
import { withElectronPhysicalResourceSetGuard } from "./guarded-lifecycle.js";
import { ElectronStandaloneHostLifecycle } from "./host-lifecycle.js";
import { ElectronStandaloneLifecycleLedger } from "./lifecycle-ledger.js";
import {
  electronInstallerHandoffDigest,
  ElectronStandaloneInstallerClaimLedger,
  validateElectronInstallerReceiptForRequest,
} from "./installer-claim.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";

type HostStatus = Readonly<{
  control: "ready";
  generationPid: number;
  hostPid: number;
  hostSha256: string;
  layout: Readonly<{ dataRoot: string; logsRoot: string; resourceStoreRoot: string; runtimeRoot: string; sidecarSupervisorPath: string }>;
  supervisorSha256: string;
  dataRoot: string;
  runtimeRoot: string;
  resourceRoot: string;
  shell: ElectronShellManifest["shell"];
}>;

export function isElectronStandaloneScope(manifest: ElectronShellManifest, scope: Readonly<{ channel: string; namespace: string }>): boolean {
  return scope.channel === manifest.channel
    && (scope.namespace === manifest.namespace || scope.namespace === `${manifest.namespace}-headless`);
}

function projectRuntimeStatus(status: Awaited<ReturnType<ElectronStandaloneControlClient["status"]>>, bindingDigest: string, generationId: string): StandaloneRuntimeStatus {
  return Object.freeze({
    bindingDigest,
    generationId,
    instanceId: status.instanceId ?? `stopped-${status.fence}`,
    references: status.references,
    state: status.state,
  });
}

function exactHostStatus(value: unknown, expected: Omit<HostStatus, "control" | "generationPid" | "hostPid">): value is HostStatus {
  if (value == null || typeof value !== "object") return false;
  const status = value as Partial<HostStatus>;
  return status.control === "ready"
    && Number.isSafeInteger(status.generationPid)
    && Number.isSafeInteger(status.hostPid)
    && status.hostSha256 === expected.hostSha256
    && canonicalJson(status.layout) === canonicalJson(expected.layout)
    && status.supervisorSha256 === expected.supervisorSha256
    && status.dataRoot === expected.dataRoot
    && status.runtimeRoot === expected.runtimeRoot
    && status.resourceRoot === expected.resourceRoot
    && canonicalJson(status.shell) === canonicalJson(expected.shell);
}

export function createElectronStandaloneAuthorityFactory(
  manifest: ElectronShellManifest,
  resourcesInput: ElectronPhysicalResourceSetDeclaration,
): ElectronStandaloneAuthorityFactory {
  const resources = validateElectronPhysicalResourceSet(resourcesInput);
  const runtimeResource = resources.resources.find(({ id }) => id === "standalone-runtime");
  if (runtimeResource == null) throw new Error("Electron physical resource set lacks standalone-runtime");
  return ({ namespaceRoot, officialNodeExecutablePath, observeFeedback, resourceRoot, runtimeRoot }) => ({
    async prepare(request) {
      if (!isElectronStandaloneScope(manifest, request.scope)) throw new Error("Electron Standalone authority request escaped its Shell scope");
      if (canonicalJson(request.shell) !== canonicalJson(manifest.shell)) throw new Error("Electron Standalone authority request escaped its Shell identity");
      const installation = await loadElectronStandaloneInstallation({ resourceRoot, channel: request.scope.channel, target: resolveElectronStandaloneTarget() });
      const storeRoot = join(runtimeRoot, "standalone-store");
      const sidecarRuntimeRoot = join(runtimeRoot, "standalone-sidecar");
      const layout = Object.freeze({
        dataRoot: join(namespaceRoot, "data", "product"),
        logsRoot: join(namespaceRoot, "logs", "product"),
        resourceStoreRoot: storeRoot,
        runtimeRoot: join(namespaceRoot, "runtime", "product"),
        sidecarSupervisorPath: installation.supervisorPath,
      });
      const store = new StandaloneStore(storeRoot, request.scope);
      const feedback = new StandaloneFeedbackEmitter(request.correlationId, request.scope, observeFeedback);
      const installedGenerationId = sha256Hex(canonicalJson(installation.envelope.metadata));
      let state = await store.readState();
      if (state.activationAttempt != null) {
        await store.recoverInterruptedAttempt();
        state = await store.readState();
      }
      if (state.active == null) {
        if (state.prepared == null) {
          await store.prepare(installation.envelope, installation.trustedKeys, { candidates: installation.candidates, feedback: observeFeedback });
          state = await store.readState();
        }
        if (state.prepared !== installedGenerationId) throw new Error("Electron Standalone cold start cannot authorize a generation outside its installed seed");
        if (state.activationIntent?.generationId !== state.prepared) {
          await store.authorizePrepared(state.prepared, "silent", "installed-seed", state.revision);
          state = await store.readState();
        }
        await store.activatePrepared(state.prepared!, request.shell, state.revision);
      }
      const generation = await store.activeGeneration();
      const binding = createStandaloneGenerationBinding(generation, request.scope);
      const hostExpected = Object.freeze({
        hostSha256: installation.declaration.host.sha256,
        layout,
        supervisorSha256: installation.declaration.supervisor.sha256,
        supervisorPath: installation.supervisorPath,
        dataRoot: storeRoot,
        runtimeRoot: sidecarRuntimeRoot,
        resourceRoot: resolve(resourceRoot),
        shell: request.shell,
      });
      const hostConfig = Object.freeze({
        schemaVersion: 1,
        scope: request.scope,
        storeRoot,
        runtimeRoot: sidecarRuntimeRoot,
        resourceRoot: resolve(resourceRoot),
        hostPath: installation.hostPath,
        hostSha256: hostExpected.hostSha256,
        layout,
        supervisorPath: installation.supervisorPath,
        supervisorSha256: hostExpected.supervisorSha256,
        shell: request.shell,
      });
      const launchHost = async (nextBinding: StandaloneGenerationBinding) => {
        const resourceSet = bindElectronPhysicalResourceSet(resources, nextBinding);
        const stamp = resourceSet.resources.find(({ id }) => id === runtimeResource.id)!.stamp;
        const converged = await convergeSidecarLaunch({
          args: [installation.hostPath],
          command: officialNodeExecutablePath,
          cwd: resourceRoot,
          env: { ...process.env, [ELECTRON_STANDALONE_HOST_CONFIG_ENV]: JSON.stringify(hostConfig) },
          resources: { dataRoot: storeRoot, ownerPid: null, port: 0, runtimeRoot: sidecarRuntimeRoot },
          stamp,
        });
        const status = await getSidecarStatus<unknown>(stamp, { generationPid: converged.description.resources.pid });
        if (!exactHostStatus(status, hostExpected)) throw new Error("Electron Standalone Sidecar host escaped its installed launch contract");
        const transport = createElectronStandaloneControlTransport(stamp);
        return Object.freeze({
          binding: nextBinding,
          lifecycle: new ElectronStandaloneControlClient(request.scope, transport),
          resourceSet,
          stamp,
          updater: new ElectronStandaloneControlUpdater(request.shell.type, request.scope, transport),
        });
      };
      const initialResourceSet = bindElectronPhysicalResourceSet(resources, binding);
      const initialStamp = initialResourceSet.resources.find(({ id }) => id === runtimeResource.id)!.stamp;
      let activeHost!: Awaited<ReturnType<typeof launchHost>>;
      await withElectronPhysicalResourceSetGuard(initialResourceSet, async (guard) => {
        const existing = await getSidecarStatus<unknown>(initialStamp, { timeoutMs: 500 }).catch(() => null);
        if (existing != null && !exactHostStatus(existing, hostExpected)) await guard.retire();
        activeHost = await launchHost(binding);
      });
      feedback.emit({ phase: "generation-prepared", state: "complete", generationId: generation.id });
      let activeGeneration = generation;
      let activeAttachment: LifecycleAttachment | null = null;
      let sealedRuntimeStatus: StandaloneRuntimeStatus | null = null;
      const updater: StandaloneShellUpdaterPort = Object.freeze({
        shellType: request.shell.type,
        readSnapshot: () => activeHost.updater.readSnapshot(),
        waitForChange: (afterRevision: number, timeoutMs: number) => activeHost.updater.waitForChange(afterRevision, timeoutMs),
        invoke: (action: StandaloneShellUpdaterAction["id"]) => activeHost.updater.invoke(action),
        confirmInstalled: (proof: StandaloneShellIdentity) => activeHost.updater.confirmInstalled(proof),
      });
      const content = new StandaloneUpdater(
        request.scope.channel,
        "content",
        request.shell,
        installation.trustedKeys,
        store,
        new ElectronReleaseExactFeed({
          cacheRoot: storeRoot,
          channel: request.scope.channel,
          channelHeadUrl: installation.declaration.update.channelHeadUrl,
          currentReleaseVersion: installation.declaration.releaseVersion,
          shell: request.shell,
          target: installation.declaration.target,
          trustedKeys: installation.trustedKeys,
        }),
        observeFeedback,
      );
      const updaterLedger = new ElectronStandaloneShellUpdaterLedger(storeRoot, request.scope, request.shell.type);
      const lifecycleLedger = new ElectronStandaloneLifecycleLedger(storeRoot, request.scope);
      const installerClaimLedger = new ElectronStandaloneInstallerClaimLedger(storeRoot, request.scope);
      return Object.freeze({
        binding,
        generation,
        updater,
        async armShellInstallation({ install, request: installationRequest }) {
          const handoffDigest = electronInstallerHandoffDigest(installationRequest);
          const snapshot = await updaterLedger.read();
          if ((snapshot.state !== "applying" && snapshot.state !== "handed-off")
            || snapshot.installAttemptId !== installationRequest.installAttemptId
            || canonicalJson(snapshot.handoff) !== canonicalJson(installationRequest.handoff)) {
            throw new Error("Electron installer handoff differs from the durable updater transition");
          }
          return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
            const guardedSnapshot = await updaterLedger.read();
            if ((guardedSnapshot.state !== "applying" && guardedSnapshot.state !== "handed-off")
              || guardedSnapshot.installAttemptId !== installationRequest.installAttemptId
              || canonicalJson(guardedSnapshot.handoff) !== canonicalJson(installationRequest.handoff)) {
              throw new Error("Electron installer handoff changed before its guarded continuation");
            }
            const existing = await installerClaimLedger.read();
            if (existing != null && (existing.bindingDigest !== activeHost.binding.digest
              || existing.generationId !== activeGeneration.id
              || existing.installAttemptId !== installationRequest.installAttemptId
              || existing.handoffDigest !== handoffDigest
              || existing.runtimeRoot !== resolve(installationRequest.runtimeRoot))) {
              throw new Error("Electron installer claim differs from the guarded continuation");
            }
            if (existing?.state === "armed") {
              if (guardedSnapshot.state === "applying") await updaterLedger.update({ expectedRevision: guardedSnapshot.revision, state: "handed-off" });
              return existing.receipt!;
            }

            const retirement = await guard.retire();
            const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
            const transition = await continuation.beginTransition("shell-install", {
              attemptId: installationRequest.installAttemptId,
              ownerShellType: request.shell.type,
              force: true,
            });
            if (transition.state !== "acquired") throw new Error("Electron installer lifecycle transition is unavailable after physical retirement");
            const sealed = await continuation.forceStopTransition(transition.transition.token, transition.transition.fence);
            if (sealed.phase !== "stopped-sealed" || sealed.attemptId !== installationRequest.installAttemptId) throw new Error("Electron installer lifecycle transition was not sealed");
            sealedRuntimeStatus = Object.freeze({
              bindingDigest: activeHost.binding.digest,
              generationId: activeGeneration.id,
              instanceId: `stopped-${sealed.fence}`,
              references: 0,
              state: "stopped" as const,
            });
            activeAttachment = null;
            const sealedClaim = existing ?? Object.freeze({
              schemaVersion: 1 as const,
              state: "sealed" as const,
              bindingDigest: activeHost.binding.digest,
              generationId: activeGeneration.id,
              installAttemptId: installationRequest.installAttemptId,
              handoffDigest,
              runtimeRoot: resolve(installationRequest.runtimeRoot),
              retirement,
            });
            if (existing == null) await installerClaimLedger.write(sealedClaim);
            const receipt = validateElectronInstallerReceiptForRequest(await install(installationRequest), installationRequest);
            await installerClaimLedger.write(Object.freeze({ ...sealedClaim, state: "armed" as const, receipt }));
            const current = await updaterLedger.read();
            if (current.state === "applying") await updaterLedger.update({ expectedRevision: current.revision, state: "handed-off" });
            else if (current.state !== "handed-off") throw new Error("Electron updater escaped its installer handoff transition");
            return receipt;
          });
        },
        contentUpdater: Object.freeze({
          prepareLatest: (activationPolicy: UpdateActivationPolicy) => content.prepareLatest(activationPolicy),
          async applyNow(options = {}) {
            const attachment = activeAttachment;
            if (attachment == null) throw new Error("Electron content update requires an active runtime attachment");
            return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
              const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
              let nextHost = activeHost;
              let attemptedResourceSet: ReturnType<typeof bindElectronPhysicalResourceSet> | null = null;
              let retired = false;
              const lifecycle: LifecyclePort = {
                start: async () => { throw new Error("Electron guarded content restart cannot perform an unbound start"); },
                awaitReady: async (scope, readiness) => await nextHost.lifecycle.awaitReady(scope, readiness),
                heartbeat: async (scope, owner) => await nextHost.lifecycle.heartbeat(scope, owner),
                release: async (scope, attachmentId) => await nextHost.lifecycle.release(scope, attachmentId),
                status: async () => await continuation.status(),
                stop: async (_scope, fence) => await continuation.stop(fence),
                beginTransition: async (_scope, kind, transitionOptions): Promise<StandaloneLifecycleTransitionResult> => {
                  const acquired = await continuation.beginTransition(kind, transitionOptions);
                  if (acquired.state === "blocked") return acquired;
                  let descriptor = acquired.transition;
                  return Object.freeze({
                    state: "acquired" as const,
                    transition: Object.freeze({
                      attemptId: descriptor.attemptId,
                      get fence() { return descriptor.fence; },
                      get expiresAt() { return descriptor.expiresAt; },
                      heartbeatIntervalMs: descriptor.heartbeatIntervalMs,
                      occupants: descriptor.occupants,
                      get phase() { return descriptor.phase; },
                      async renew() { descriptor = await continuation.renewTransition(descriptor.token, descriptor.fence); },
                      async release() { await continuation.releaseTransition(descriptor.token, descriptor.fence); },
                      async forceStop() {
                        await guard.retire();
                        retired = true;
                        descriptor = await continuation.forceStopTransition(descriptor.token, descriptor.fence);
                      },
                      async completeBoundStart(nextGeneration: GenerationRecord, owner: LifecycleAttachment, nextBinding: StandaloneGenerationBinding) {
                        attemptedResourceSet = bindElectronPhysicalResourceSet(resources, nextBinding);
                        nextHost = await launchHost(nextBinding);
                        const started = await nextHost.lifecycle.completeTransitionStart(descriptor.token, descriptor.fence, nextGeneration, owner, nextBinding);
                        activeHost = nextHost;
                        activeGeneration = nextGeneration;
                        return started;
                      },
                    }),
                  });
                },
              };
              const launcher = new VersionedLauncher(store, lifecycle, request.shell, attachment.id, observeFeedback);
              let applied: Awaited<ReturnType<StandaloneUpdater["applyNow"]>>;
              try {
                applied = await content.applyNow(launcher, options);
              } catch (error) {
                if (!retired) throw error;
                try {
                  if (attemptedResourceSet != null) await guard.retireReplacement(attemptedResourceSet);
                  const fallbackGeneration = await store.activeGeneration();
                  const fallbackBinding = createStandaloneGenerationBinding(fallbackGeneration, request.scope);
                  const stateAfterFailure = await lifecycleLedger.read();
                  const recovery = await continuation.beginTransition("content-restart", {
                    ...(stateAfterFailure?.transition == null ? {} : { attemptId: stateAfterFailure.transition.token }),
                    ownerAttachmentId: attachment.id,
                    ownerShellType: attachment.shell.type,
                    force: true,
                  });
                  if (recovery.state !== "acquired") throw new Error("Electron content rollback could not reacquire its lifecycle transition");
                  let recoveryTransition = recovery.transition;
                  if (recoveryTransition.phase !== "stopped-sealed") {
                    recoveryTransition = await continuation.forceStopTransition(recoveryTransition.token, recoveryTransition.fence);
                  }
                  const fallbackHost = await launchHost(fallbackBinding);
                  const restarted = await fallbackHost.lifecycle.completeTransitionStart(
                    recoveryTransition.token,
                    recoveryTransition.fence,
                    fallbackGeneration,
                    attachment,
                    fallbackBinding,
                  );
                  if (restarted.instanceId == null) throw new Error("Electron content rollback did not return a runtime instance");
                  await fallbackHost.lifecycle.awaitReady(request.scope, {
                    generationId: fallbackGeneration.id,
                    bindingDigest: fallbackBinding.digest,
                    instanceId: restarted.instanceId,
                    attachmentId: attachment.id,
                  });
                  activeHost = fallbackHost;
                  activeGeneration = fallbackGeneration;
                } catch (recoveryError) {
                  throw new AggregateError([error, recoveryError], "Electron content update and guarded rollback failed");
                }
                throw error;
              }
              if (applied.status === "blocked") return applied;
              return Object.freeze({ status: "applied" as const, lifecycle: applied.lifecycle, binding: activeHost.binding, generation: activeGeneration });
            });
          },
        }),
        async start({ attachment }): Promise<StandaloneRuntimeHandle> {
          if (activeAttachment != null) throw new Error("Electron Standalone prepared runtime already owns an attachment");
          const launcher = new VersionedLauncher(store, activeHost.lifecycle, request.shell, attachment.id, observeFeedback);
          const started = await launcher.start();
          activeAttachment = attachment;
          sealedRuntimeStatus = null;
          let closed: StandaloneRuntimeStatus | null = null;
          let heartbeatTask = Promise.resolve();
          const heartbeat = setInterval(() => {
            heartbeatTask = heartbeatTask.then(async () => { await activeHost.lifecycle.heartbeat(request.scope, attachment); }).catch(() => undefined);
          }, started.lease?.heartbeatIntervalMs ?? 5_000);
          heartbeat.unref();
          return Object.freeze({
            async readStatus() { return closed ?? sealedRuntimeStatus ?? projectRuntimeStatus(await activeHost.lifecycle.status(request.scope), activeHost.binding.digest, activeGeneration.id); },
            async invoke(command: StandaloneRuntimeCommand) {
              if (sealedRuntimeStatus != null) throw new Error("Electron Standalone runtime is sealed for replacement");
              return await activeHost.lifecycle.invoke(command);
            },
            async close() {
              if (closed != null) return closed;
              clearInterval(heartbeat);
              await heartbeatTask;
              if (sealedRuntimeStatus != null) {
                closed = sealedRuntimeStatus;
                return closed;
              }
              const status = await activeHost.lifecycle.release(request.scope, attachment.id);
              closed = Object.freeze({ ...projectRuntimeStatus(status, activeHost.binding.digest, activeGeneration.id), state: "stopped" as const });
              activeAttachment = null;
              return closed;
            },
            async waitForTerminal() {
              if (closed != null) return closed;
              if (sealedRuntimeStatus != null) return sealedRuntimeStatus;
              for (;;) {
                const status = projectRuntimeStatus(await activeHost.lifecycle.status(request.scope), activeHost.binding.digest, activeGeneration.id);
                if (status.state !== "running") return status;
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
              }
            },
          });
        },
      });
    },
  });
}
