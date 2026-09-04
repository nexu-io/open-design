import { join } from "node:path";

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

type HostStatus = Readonly<{
  control: "ready";
  generationPid: number;
  hostPid: number;
  hostSha256: string;
  supervisorSha256: string;
  dataRoot: string;
  runtimeRoot: string;
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
    && status.runtimeRoot === expected.runtimeRoot;
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
      });
      const hostConfig = Object.freeze({
        schemaVersion: 1,
        scope: request.scope,
        storeRoot,
        runtimeRoot: sidecarRuntimeRoot,
        hostPath: installation.hostPath,
        hostSha256: hostExpected.hostSha256,
        supervisorSha256: hostExpected.supervisorSha256,
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
      return Object.freeze({
        binding,
        generation,
        updater,
        async armShellInstallation() {
          throw new Error("Electron Standalone production Shell installation transition is not implemented");
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
