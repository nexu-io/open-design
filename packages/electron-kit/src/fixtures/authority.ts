import { isAbsolute, join, normalize } from "node:path";

import {
  createStandaloneGenerationBinding,
  StandaloneFeedbackEmitter,
  type LifecycleStatus,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeStatus,
} from "@open-design/standalone";

import type {
  ElectronShellManifest,
  ElectronStandaloneAuthorityFactory,
  ElectronStandalonePreparedRuntime,
} from "../contracts/index.js";
import { ElectronFixtureLifecyclePort } from "./lifecycle/port.js";
import { ElectronFixtureShellUpdater } from "./updater/provider.js";
import {
  ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
  validateElectronBootstrapResult,
} from "../runtime/startup/bootstrap/contracts.js";
import { ElectronFixtureBootstrapPort } from "../runtime/startup/bootstrap/fixture-port.js";

function projectRuntimeStatus(
  status: LifecycleStatus,
  bindingDigest: string,
  generationId: string,
): StandaloneRuntimeStatus {
  return Object.freeze({
    bindingDigest,
    generationId,
    instanceId: status.instanceId ?? `stopped-${status.fence}`,
    references: status.references,
    state: status.state,
  });
}

/**
 * Phase-one bridge used only until the packaged fossil/Sidecar host replaces
 * the fixture. Legacy lifecycle operations stay behind the runtime handle.
 */
export function createElectronFixtureStandaloneAuthorityFactory(
  manifest: ElectronShellManifest,
  options: Readonly<{ sidecarRelativePath?: string }> = {},
): ElectronStandaloneAuthorityFactory {
  const sidecarRelativePath = normalize(options.sidecarRelativePath ?? "fixture-sidecar.cjs");
  if (isAbsolute(sidecarRelativePath) || sidecarRelativePath === ".." || sidecarRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("fixture Sidecar path must stay below the authority resource root");
  }
  return ({ runtimeRoot, resourceRoot, officialNodeExecutablePath, observeFeedback }) => {
    const lifecycle = new ElectronFixtureLifecyclePort(join(resourceRoot, sidecarRelativePath), officialNodeExecutablePath);
    const bootstrap = new ElectronFixtureBootstrapPort();
    return {
      async prepare(request): Promise<ElectronStandalonePreparedRuntime> {
        const updater = new ElectronFixtureShellUpdater({
          metadataUrl: process.env.OD_UPDATE_METADATA_URL ?? null,
          shell: manifest.shell,
          cacheRoot: runtimeRoot,
          lifecycle,
          scope: request.scope,
        });
        lifecycle.exposeShellUpdater(updater);
        const bootstrapRequest = {
          schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
          correlationId: request.correlationId,
          scope: request.scope,
          shell: request.shell,
          releaseVersion: request.releaseVersion,
        } as const;
        const result = validateElectronBootstrapResult(bootstrapRequest, await bootstrap.resolve(bootstrapRequest));
        const generation = result.generation;
        const binding = createStandaloneGenerationBinding(generation, request.scope);
        const feedback = new StandaloneFeedbackEmitter(request.correlationId, request.scope, observeFeedback);
        feedback.emit({
          phase: "generation-prepared",
          state: "complete",
          generationId: generation.id,
        });
        return {
          binding,
          generation,
          updater,
          async armShellInstallation({ install, request }) {
            return await install(request);
          },
          async start({ attachment }): Promise<StandaloneRuntimeHandle> {
            const started = await lifecycle.start(request.scope, generation, attachment, binding);
            if (started.instanceId == null) throw new Error("fixture lifecycle did not return an instance id");
            await lifecycle.awaitReady(request.scope, {
              generationId: generation.id,
              bindingDigest: binding.digest,
              instanceId: started.instanceId,
              attachmentId: attachment.id,
            });
            let closed: StandaloneRuntimeStatus | null = null;
            let heartbeatInFlight = Promise.resolve();
            const heartbeat = setInterval(() => {
              heartbeatInFlight = heartbeatInFlight
                .then(async () => { await lifecycle.heartbeat(request.scope, attachment); })
                .catch(() => undefined);
            }, started.lease?.heartbeatIntervalMs ?? 1_000);
            heartbeat.unref();
            return Object.freeze({
              async readStatus() {
                if (closed != null) return closed;
                return projectRuntimeStatus(await lifecycle.status(request.scope), binding.digest, generation.id);
              },
              async invoke(command: StandaloneRuntimeCommand) {
                return Object.freeze({
                  requestId: command.requestId,
                  attachmentId: command.attachmentId,
                  bindingDigest: binding.digest,
                  outcome: "unsupported" as const,
                  error: Object.freeze({ code: "fixture-command-unavailable" }),
                });
              },
              async close() {
                if (closed != null) return closed;
                clearInterval(heartbeat);
                await heartbeatInFlight;
                const current = await lifecycle.status(request.scope);
                const ownsAttachment = current.occupants.some(({ attachmentId }) => attachmentId === attachment.id);
                const released = ownsAttachment ? await lifecycle.release(request.scope, attachment.id) : current;
                const stopped = released.references === 0 && released.state === "running"
                  ? await lifecycle.stop(request.scope, released.fence)
                  : released;
                closed = Object.freeze({
                  ...projectRuntimeStatus(stopped, binding.digest, generation.id),
                  state: "stopped" as const,
                });
                return closed;
              },
              async waitForTerminal() {
                if (closed != null) return closed;
                for (;;) {
                  const status = projectRuntimeStatus(await lifecycle.status(request.scope), binding.digest, generation.id);
                  if (status.state !== "running") return status;
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              },
            });
          },
        };
      },
    };
  };
}
