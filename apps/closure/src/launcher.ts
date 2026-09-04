import {
  createStandaloneGenerationBootloader,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeStatus,
} from "@open-design/standalone";

function createFixtureRuntime(request: StandaloneHandoffRequest): StandaloneRuntimeHandle {
  let state: StandaloneRuntimeStatus["state"] = "running";
  let resolveTerminal!: (status: StandaloneRuntimeStatus) => void;
  const terminal = new Promise<StandaloneRuntimeStatus>((resolve) => { resolveTerminal = resolve; });
  const status = (): StandaloneRuntimeStatus => Object.freeze({
    bindingDigest: request.binding.digest,
    generationId: request.binding.generationId,
    instanceId: `closure-fixture-${request.binding.digest.slice(0, 16)}`,
    references: state === "running" ? 1 : 0,
    state,
  });
  return Object.freeze({
    readStatus: async () => status(),
    async invoke(command: StandaloneRuntimeCommand) {
      return Object.freeze({
        requestId: command.requestId,
        attachmentId: command.attachmentId,
        bindingDigest: request.binding.digest,
        outcome: "unsupported" as const,
        error: Object.freeze({ code: "closure-fixture-command-unavailable" }),
      });
    },
    async close() {
      if (state === "running") {
        state = "stopped";
        resolveTerminal(status());
      }
      return status();
    },
    waitForTerminal: async () => terminal,
  });
}

/**
 * Generation-owned launcher used by the Web/daemon-independent cold-start
 * fixture. The production body replaces only this start function; Shells
 * always import the same exact handoff export.
 */
export const standaloneGenerationHandoff = createStandaloneGenerationBootloader(async (request) => createFixtureRuntime(request));
