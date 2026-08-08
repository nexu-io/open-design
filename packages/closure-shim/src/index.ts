import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CLOSURE_SHIM_SCHEMA_VERSION,
  createClosureHandoffEnvelope,
  validateClosureRuntimeStatus,
  validateClosureShellCapabilityRequest,
  validateClosureShellCapabilityResult,
  validateClosureShimRequest,
  type ClosureHandoffEnvelope,
  type ClosureRuntimeStatus,
  type ClosureRuntimeTerminalStatus,
  type ClosureShellCapabilityPort,
  type ClosureShimInstallerReinstallResult,
  type ClosureShimReadyResult,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type StoredClosureVerification,
} from "@open-design/closure-store";
import { compareStandaloneVersions } from "@open-design/standalone-proto";
import type { StandalonePaths } from "@open-design/standalone-runtime";

export type ClosureShimTraceEvent =
  | "request:validated"
  | "binding:resolved"
  | "installer:reinstall"
  | "handoff:entered"
  | "body:ready"
  | "body:failed";

export type ClosureShimErrorCode =
  | "request-invalid"
  | "body-unavailable"
  | "handoff-failed";

export type StandaloneStatus = ClosureRuntimeStatus;

export interface StandaloneHandle {
  close(): Promise<void>;
  readStatus(): Promise<StandaloneStatus>;
  waitForTerminal(): Promise<ClosureRuntimeTerminalStatus>;
}

export type StandaloneHandoffInput = {
  handoff: ClosureHandoffEnvelope;
  paths: Readonly<StandalonePaths>;
  shell: ClosureShellCapabilityPort;
};

export type StandaloneModule = {
  handoffOpenDesignStandalone?: (
    input: StandaloneHandoffInput,
  ) => Promise<StandaloneHandle>;
};

export type ClosureShimReady = {
  close(): Promise<ClosureRuntimeTerminalStatus>;
  handle: StandaloneHandle;
  result: ClosureShimReadyResult;
  waitForTerminal(): Promise<ClosureRuntimeTerminalStatus>;
};

export type ClosureShimInstallerReinstall = {
  handle: null;
  result: ClosureShimInstallerReinstallResult;
};

export type ClosureShimOutcome = ClosureShimReady | ClosureShimInstallerReinstall;

export type EnsureAndHandoffClosureOptions = {
  importStandalone?: (entryUrl: string) => Promise<StandaloneModule>;
  onTrace?: (event: ClosureShimTraceEvent) => void;
  paths: StandalonePaths;
  request: ClosureShimRequest;
  shellCapabilities: ClosureShellCapabilityPort;
};

export class ClosureShimError extends Error {
  readonly code: ClosureShimErrorCode;

  constructor(code: ClosureShimErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClosureShimError";
    this.code = code;
  }
}

function trace(
  listener: EnsureAndHandoffClosureOptions["onTrace"],
  event: ClosureShimTraceEvent,
): void {
  try {
    listener?.(event);
  } catch {
    // Observability cannot own product startup.
  }
}

function installerReinstall(minShellVersion: string): ClosureShimInstallerReinstall {
  return {
    handle: null,
    result: {
      minShellVersion,
      outcome: "installer-reinstall",
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    },
  };
}

async function defaultImportStandalone(entryUrl: string): Promise<StandaloneModule> {
  return await import(entryUrl) as StandaloneModule;
}

async function loadStandalone(
  verification: StoredClosureVerification,
  importStandalone: NonNullable<EnsureAndHandoffClosureOptions["importStandalone"]>,
): Promise<NonNullable<StandaloneModule["handoffOpenDesignStandalone"]>> {
  const entryUrl = pathToFileURL(join(
    verification.paths.payloadRoot,
    verification.manifest.artifact.entryPath,
  )).href;
  const standalone = await importStandalone(entryUrl);
  if (typeof standalone.handoffOpenDesignStandalone !== "function") {
    throw new ClosureShimError(
      "handoff-failed",
      "Standalone does not export handoffOpenDesignStandalone",
    );
  }
  return standalone.handoffOpenDesignStandalone;
}

async function resolveCommittedPointer(
  paths: ClosureStorePaths,
): Promise<ClosureRuntimePointer> {
  const descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.committed == null) {
    throw new ClosureShimError(
      "body-unavailable",
      `No committed Standalone exists for ${paths.channel}/${paths.namespace}`,
    );
  }
  return descriptor.committed.standalone;
}

function bindShellCapabilities(
  port: ClosureShellCapabilityPort,
  handoff: ClosureHandoffEnvelope,
): ClosureShellCapabilityPort {
  return {
    invoke: async (value) => {
      const request = validateClosureShellCapabilityRequest(value, { handoff });
      const result = await port.invoke(request);
      return validateClosureShellCapabilityResult(result, {
        handoff,
        requestId: request.requestId,
      });
    },
  };
}

function validateTerminalStatus(
  value: unknown,
  handoff: ClosureHandoffEnvelope,
): ClosureRuntimeTerminalStatus {
  const status = validateClosureRuntimeStatus(value, { handoff });
  if (status.state === "running") {
    throw new ClosureShimError(
      "handoff-failed",
      "Standalone reported running while a terminal status was required",
    );
  }
  return status;
}

function readyOutcome(input: {
  handle: StandaloneHandle;
  handoff: ClosureHandoffEnvelope;
}): ClosureShimReady {
  const waitForTerminal = async (): Promise<ClosureRuntimeTerminalStatus> => {
    return validateTerminalStatus(await input.handle.waitForTerminal(), input.handoff);
  };
  return {
    close: async () => {
      await input.handle.close();
      return await waitForTerminal();
    },
    handle: input.handle,
    result: {
      handoff: input.handoff,
      outcome: "ready",
      reused: true,
      rolledBack: false,
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    },
    waitForTerminal,
  };
}

async function startCommitted(input: {
  importStandalone: NonNullable<EnsureAndHandoffClosureOptions["importStandalone"]>;
  onTrace: EnsureAndHandoffClosureOptions["onTrace"];
  paths: Readonly<StandalonePaths>;
  pointer: ClosureRuntimePointer;
  shellCapabilities: ClosureShellCapabilityPort;
  storePaths: ClosureStorePaths;
}): Promise<ClosureShimReady> {
  const handoff = createClosureHandoffEnvelope(input.pointer);
  let handle: StandaloneHandle | null = null;
  try {
    const verification = await verifyStoredClosureCandidate(input.storePaths, input.pointer);
    const startStandalone = await loadStandalone(verification, input.importStandalone);
    trace(input.onTrace, "handoff:entered");
    handle = await startStandalone({
      handoff,
      paths: input.paths,
      shell: bindShellCapabilities(input.shellCapabilities, handoff),
    });
    validateClosureRuntimeStatus(await handle.readStatus(), {
      handoff,
      state: "running",
    });
    trace(input.onTrace, "body:ready");
    return readyOutcome({ handle, handoff });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    trace(input.onTrace, "body:failed");
    if (error instanceof ClosureShimError) throw error;
    throw new ClosureShimError(
      "handoff-failed",
      "Committed Standalone failed immutable verification or handoff",
      { cause: error },
    );
  }
}

/**
 * Enter exactly one already-committed Standalone binding. Candidate discovery,
 * materialization, update history and rollback belong to the launcher/update
 * boundary and are deliberately unavailable to this fossil-compatible shim.
 */
export async function ensureAndHandoffClosure(
  options: EnsureAndHandoffClosureOptions,
): Promise<ClosureShimOutcome> {
  let request: ClosureShimRequest;
  try {
    request = validateClosureShimRequest(options.request);
  } catch (error) {
    throw new ClosureShimError("request-invalid", "Closure shim request is invalid", { cause: error });
  }
  trace(options.onTrace, "request:validated");
  const storePaths = resolveClosureStorePaths({
    channel: request.channel,
    namespace: request.namespace,
    root: options.paths.installationRoot,
  });
  const pointer = await resolveCommittedPointer(storePaths);
  trace(options.onTrace, "binding:resolved");
  if (pointer.platform !== request.platform) {
    throw new ClosureShimError(
      "body-unavailable",
      `Committed Standalone platform ${pointer.platform} does not match ${request.platform}`,
    );
  }
  const verification = await verifyStoredClosureCandidate(storePaths, pointer).catch((error) => {
    throw new ClosureShimError(
      "body-unavailable",
      "Committed Standalone failed immutable Store verification",
      { cause: error },
    );
  });
  const minShellVersion = verification.manifest.compatibility.shell.minVersion;
  if (compareStandaloneVersions(request.shell.version, minShellVersion) < 0) {
    trace(options.onTrace, "installer:reinstall");
    return installerReinstall(minShellVersion);
  }
  return await startCommitted({
    importStandalone: options.importStandalone ?? defaultImportStandalone,
    onTrace: options.onTrace,
    paths: options.paths,
    pointer,
    shellCapabilities: options.shellCapabilities,
    storePaths,
  });
}
