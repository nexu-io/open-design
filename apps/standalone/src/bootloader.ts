import {
  compareStandaloneVersions,
  sameStandaloneHandoffEnvelope,
  validateStandaloneHandoffRequest,
  validateStandaloneRuntimeCommandRequest,
  validateStandaloneRuntimeCommandResult,
  validateStandaloneRuntimeStatus,
  validateStandaloneShellCapabilityRequest,
  validateStandaloneShellCapabilityResult,
  type StandaloneHandle,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeTerminalStatus,
  type StandaloneRuntimeCommandRequest,
  type StandaloneShellCapabilityRequest,
  type StandaloneShellCapabilityPort,
} from "@open-design/standalone-proto";

export type StandaloneBootloaderErrorCode =
  | "body-invalid"
  | "handoff-conflict"
  | "shell-incompatible";

export class StandaloneBootloaderError extends Error {
  readonly code: StandaloneBootloaderErrorCode;

  constructor(code: StandaloneBootloaderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StandaloneBootloaderError";
    this.code = code;
  }
}

export type CreateStandaloneBootloaderOptions = Readonly<{
  minShellVersion: string;
  start: StandaloneHandoff;
  resolveRegisteredBootloader?: () => StandaloneHandoff | null;
}>;

function requestKey(request: StandaloneHandoffRequest): string {
  return JSON.stringify({
    descriptorDigest: request.handoff.descriptorDigest,
    paths: request.paths,
    scope: request.handoff.scope,
  });
}

function bindCapabilities(
  port: StandaloneShellCapabilityPort,
  request: StandaloneHandoffRequest,
): StandaloneShellCapabilityPort {
  return Object.freeze({
    async invoke(value: StandaloneShellCapabilityRequest) {
      const capabilityRequest = validateStandaloneShellCapabilityRequest(value, {
        handoff: request.handoff,
      });
      const result = await port.invoke(capabilityRequest);
      return validateStandaloneShellCapabilityResult(result, {
        capability: capabilityRequest.capability,
        handoff: request.handoff,
        requestId: capabilityRequest.requestId,
      });
    },
  });
}

function bindHandle(
  handle: StandaloneHandle,
  request: StandaloneHandoffRequest,
): StandaloneHandle {
  const terminal = async (value: unknown): Promise<StandaloneRuntimeTerminalStatus> => {
    const status = validateStandaloneRuntimeStatus(value, { handoff: request.handoff });
    if (status.state === "running") {
      throw new StandaloneBootloaderError(
        "body-invalid",
        "Standalone returned running status where a terminal status was required",
      );
    }
    return status;
  };
  return Object.freeze({
    async close() {
      return await terminal(await handle.close());
    },
    async invoke(value: StandaloneRuntimeCommandRequest) {
      const command = validateStandaloneRuntimeCommandRequest(value, {
        handoff: request.handoff,
      });
      return validateStandaloneRuntimeCommandResult(await handle.invoke(command), {
        handoff: request.handoff,
        requestId: command.requestId,
      });
    },
    async readStatus() {
      return validateStandaloneRuntimeStatus(await handle.readStatus(), {
        handoff: request.handoff,
      });
    },
    async waitForTerminal() {
      return await terminal(await handle.waitForTerminal());
    },
  });
}

/**
 * Create the fossil-compatible `bootloader.mjs` handoff. The first accepted
 * request owns this module instance forever: repeats reuse the same promise,
 * while any different identity/path/shell request fails closed. Candidate
 * selection, download, history and rollback deliberately remain outside.
 */
export function createStandaloneBootloader(
  options: CreateStandaloneBootloaderOptions,
): StandaloneHandoff {
  // Validate the floor at construction so a malformed artifact cannot become
  // a latent cold-start failure after the Shell has committed it.
  compareStandaloneVersions(options.minShellVersion, options.minShellVersion);
  let entered: Readonly<{
    key: string;
    request: StandaloneHandoffRequest;
    task: Promise<StandaloneHandle>;
  }> | null = null;

  return async (value) => {
    const request = validateStandaloneHandoffRequest(value);
    if (
      compareStandaloneVersions(
        request.handoff.descriptor.shell.version,
        options.minShellVersion,
      ) < 0
    ) {
      throw new StandaloneBootloaderError(
        "shell-incompatible",
        `Standalone requires Shell ${options.minShellVersion} or newer`,
      );
    }
    const key = requestKey(request);
    if (entered != null) {
      if (
        entered.key !== key
        || !sameStandaloneHandoffEnvelope(entered.request.handoff, request.handoff)
      ) {
        throw new StandaloneBootloaderError(
          "handoff-conflict",
          "bootloader.mjs already entered a different Standalone generation",
        );
      }
      return await entered.task;
    }

    const boundRequest = Object.freeze({
      ...request,
      capabilities: bindCapabilities(request.capabilities, request),
    });
    const task = (async (): Promise<StandaloneHandle> => {
      // Resolve at most one registered inner bootloader. Once selected, an
      // inner failure is terminal: the fossil entry never falls back into a
      // second body and never performs a recursive handoff.
      const registered = options.resolveRegisteredBootloader?.() ?? null;
      const rawHandle = await (registered ?? options.start)(boundRequest);
      const handle = bindHandle(rawHandle, request);
      try {
        await handle.readStatus().then((status) => validateStandaloneRuntimeStatus(status, {
          handoff: request.handoff,
          state: "running",
        }));
      } catch (error) {
        await rawHandle.close().catch(() => undefined);
        throw new StandaloneBootloaderError(
          "body-invalid",
          "Standalone did not report generation-bound running readiness",
          { cause: error },
        );
      }
      return handle;
    })();
    entered = Object.freeze({ key, request, task });
    return await task;
  };
}
