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
  VersionedLauncher,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeStatus,
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

type HostStatus = Readonly<{
  control: "ready";
  generationPid: number;
  hostPid: number;
  hostSha256: string;
  supervisorSha256: string;
  dataRoot: string;
  runtimeRoot: string;
  resourceRoot: string;
  shell: ElectronShellManifest["shell"];
}>;

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
  return ({ officialNodeExecutablePath, observeFeedback, resourceRoot, runtimeRoot }) => ({
    async prepare(request) {
      if (request.scope.channel !== manifest.channel || request.scope.namespace !== manifest.namespace) throw new Error("Electron Standalone authority request escaped its Shell scope");
      if (request.releaseVersion !== manifest.version || canonicalJson(request.shell) !== canonicalJson(manifest.shell)) throw new Error("Electron Standalone authority request escaped its Shell identity");
      const installation = await loadElectronStandaloneInstallation({ resourceRoot, channel: request.scope.channel, target: resolveElectronStandaloneTarget() });
      const storeRoot = join(runtimeRoot, "standalone-store");
      const sidecarRuntimeRoot = join(runtimeRoot, "standalone-sidecar");
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
      const resourceSet = bindElectronPhysicalResourceSet(resources, binding);
      const stamp = resourceSet.resources.find(({ id }) => id === runtimeResource.id)!.stamp;
      const hostExpected = Object.freeze({
        hostSha256: installation.declaration.host.sha256,
        supervisorSha256: installation.declaration.supervisor.sha256,
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
        supervisorSha256: hostExpected.supervisorSha256,
        shell: request.shell,
      });
      await withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
        const existing = await getSidecarStatus<unknown>(stamp, { timeoutMs: 500 }).catch(() => null);
        if (existing != null && !exactHostStatus(existing, hostExpected)) await guard.retire();
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
      });
      feedback.emit({ phase: "generation-prepared", state: "complete", generationId: generation.id });
      const transport = createElectronStandaloneControlTransport(stamp);
      const lifecycle = new ElectronStandaloneControlClient(request.scope, transport);
      const updater = new ElectronStandaloneControlUpdater(request.shell.type, request.scope, transport);
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
          return await withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
            const guardedSnapshot = await updaterLedger.read();
            if ((guardedSnapshot.state !== "applying" && guardedSnapshot.state !== "handed-off")
              || guardedSnapshot.installAttemptId !== installationRequest.installAttemptId
              || canonicalJson(guardedSnapshot.handoff) !== canonicalJson(installationRequest.handoff)) {
              throw new Error("Electron installer handoff changed before its guarded continuation");
            }
            const existing = await installerClaimLedger.read();
            if (existing != null && (existing.bindingDigest !== binding.digest
              || existing.generationId !== generation.id
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
            const sealedClaim = existing ?? Object.freeze({
              schemaVersion: 1 as const,
              state: "sealed" as const,
              bindingDigest: binding.digest,
              generationId: generation.id,
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
        async start({ attachment }): Promise<StandaloneRuntimeHandle> {
          const launcher = new VersionedLauncher(store, lifecycle, request.shell, attachment.id, observeFeedback);
          const started = await launcher.start();
          let closed: StandaloneRuntimeStatus | null = null;
          let heartbeatTask = Promise.resolve();
          const heartbeat = setInterval(() => {
            heartbeatTask = heartbeatTask.then(async () => { await lifecycle.heartbeat(request.scope, attachment); }).catch(() => undefined);
          }, started.lease?.heartbeatIntervalMs ?? 5_000);
          heartbeat.unref();
          return Object.freeze({
            async readStatus() { return closed ?? projectRuntimeStatus(await lifecycle.status(request.scope), binding.digest, generation.id); },
            invoke: (command: StandaloneRuntimeCommand) => lifecycle.invoke(command),
            async close() {
              if (closed != null) return closed;
              clearInterval(heartbeat);
              await heartbeatTask;
              const status = await lifecycle.release(request.scope, attachment.id);
              closed = Object.freeze({ ...projectRuntimeStatus(status, binding.digest, generation.id), state: "stopped" as const });
              return closed;
            },
            async waitForTerminal() {
              if (closed != null) return closed;
              for (;;) {
                const status = projectRuntimeStatus(await lifecycle.status(request.scope), binding.digest, generation.id);
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
