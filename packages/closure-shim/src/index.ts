import { createPublicKey, verify as verifySignature } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CLOSURE_SHIM_SCHEMA_VERSION,
  createClosureHandoffEnvelope,
  serializeClosureCandidateManifestForSigning,
  validateClosureCandidateManifest,
  validateClosureCandidateSignature,
  validateClosureRuntimeStatus,
  validateClosureShellCapabilityRequest,
  validateClosureShellCapabilityResult,
  validateClosureShimRequest,
  type ClosureCandidateSignature,
  type ClosureHandoffEnvelope,
  type ClosureRuntimeStatus,
  type ClosureRuntimeTerminalStatus,
  type ClosureShellCapabilityPort,
  type ClosureShimInstallerReinstallResult,
  type ClosureShimReadyResult,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import {
  armClosureRuntimeAttempt,
  confirmClosureRuntime,
  recoverClosureRuntime,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type StoredClosureVerification,
} from "@open-design/closure-store";
import {
  applyClosureUpdate,
  compareClosureShellVersions,
  type ClosureReleaseCandidate,
} from "@open-design/closure-update";
import type { StandalonePaths } from "@open-design/standalone-runtime";

export type ClosureShimTraceEvent =
  | "request:validated"
  | "candidate:trusted"
  | "candidate:activated"
  | "candidate:reused"
  | "installer:reinstall"
  | "handoff:armed"
  | "body:ready"
  | "body:failed"
  | "runtime:confirmed"
  | "runtime:rolled-back";

export type ClosureShimErrorCode =
  | "request-invalid"
  | "trust-rejected"
  | "candidate-rejected"
  | "body-unavailable"
  | "handoff-failed";

export type SignedClosureReleaseCandidate = {
  candidate: ClosureReleaseCandidate;
  signature: ClosureCandidateSignature;
};

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
  candidate?: SignedClosureReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  importStandalone?: (entryUrl: string) => Promise<StandaloneModule>;
  onTrace?: (event: ClosureShimTraceEvent) => void;
  paths: StandalonePaths;
  request: ClosureShimRequest;
  shellCapabilities: ClosureShellCapabilityPort;
  trustedKeys: Readonly<Record<string, string>>;
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
    // Observability cannot own product startup or rollback.
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

export function verifySignedClosureCandidate(
  signed: SignedClosureReleaseCandidate,
  trustedKeys: Readonly<Record<string, string>>,
): ClosureReleaseCandidate {
  let manifest: ReturnType<typeof validateClosureCandidateManifest>;
  try {
    manifest = validateClosureCandidateManifest(signed.candidate.manifest);
  } catch (error) {
    throw new ClosureShimError(
      "candidate-rejected",
      "Closure candidate manifest is invalid",
      { cause: error },
    );
  }
  let signature: ReturnType<typeof validateClosureCandidateSignature>;
  try {
    signature = validateClosureCandidateSignature(signed.signature);
  } catch (error) {
    throw new ClosureShimError(
      "trust-rejected",
      "Closure candidate signature descriptor is invalid",
      { cause: error },
    );
  }
  const publicKey = trustedKeys[signature.keyId];
  if (publicKey == null) {
    throw new ClosureShimError(
      "trust-rejected",
      `Closure signature key is not trusted: ${signature.keyId}`,
    );
  }
  let key;
  try {
    key = createPublicKey(publicKey);
  } catch (error) {
    throw new ClosureShimError(
      "trust-rejected",
      `Closure trust root is invalid: ${signature.keyId}`,
      { cause: error },
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new ClosureShimError(
      "trust-rejected",
      `Closure trust root is not an Ed25519 key: ${signature.keyId}`,
    );
  }
  const signatureBytes = Buffer.from(signature.value, "base64url");
  if (signatureBytes.byteLength !== 64) {
    throw new ClosureShimError(
      "trust-rejected",
      "Closure Ed25519 signature must contain 64 bytes",
    );
  }
  let valid: boolean;
  try {
    valid = verifySignature(
      null,
      Buffer.from(serializeClosureCandidateManifestForSigning(manifest), "utf8"),
      key,
      signatureBytes,
    );
  } catch (error) {
    throw new ClosureShimError(
      "trust-rejected",
      "Closure candidate signature could not be verified",
      { cause: error },
    );
  }
  if (!valid) {
    throw new ClosureShimError(
      "trust-rejected",
      "Closure candidate signature verification failed",
    );
  }
  return { ...signed.candidate, manifest };
}

function assertCandidateCoordinates(
  candidate: ClosureReleaseCandidate,
  request: ClosureShimRequest,
): void {
  const identity = candidate.manifest.identity;
  if (identity.channel !== request.channel) {
    throw new ClosureShimError(
      "candidate-rejected",
      `Closure candidate channel ${identity.channel} does not match shim channel ${request.channel}`,
    );
  }
  if (identity.platform !== request.platform) {
    throw new ClosureShimError(
      "candidate-rejected",
      `Closure candidate platform ${identity.platform} does not match shim platform ${request.platform}`,
    );
  }
}

function requiresInstallerReinstall(
  shellVersion: string,
  minShellVersion: string,
): boolean {
  return compareClosureShellVersions(shellVersion, minShellVersion) < 0;
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

async function selectedPointer(paths: ClosureStorePaths): Promise<ClosureRuntimePointer> {
  const recovered = await recoverClosureRuntime(paths);
  if (!recovered.selection.selected) {
    throw new ClosureShimError(
      "body-unavailable",
      "No compatible Standalone is available",
    );
  }
  return recovered.selection.pointer;
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
  result: ClosureShimReadyResult;
}): ClosureShimReady {
  const waitForTerminal = async (): Promise<ClosureRuntimeTerminalStatus> => {
    return validateTerminalStatus(await input.handle.waitForTerminal(), input.result.handoff);
  };
  return {
    close: async () => {
      await input.handle.close();
      return await waitForTerminal();
    },
    handle: input.handle,
    result: input.result,
    waitForTerminal,
  };
}

async function startPointer(input: {
  importStandalone: NonNullable<EnsureAndHandoffClosureOptions["importStandalone"]>;
  onTrace: EnsureAndHandoffClosureOptions["onTrace"];
  paths: Readonly<StandalonePaths>;
  pointer: ClosureRuntimePointer;
  shellCapabilities: ClosureShellCapabilityPort;
  storePaths: ClosureStorePaths;
}): Promise<{ handle: StandaloneHandle; handoff: ClosureHandoffEnvelope }> {
  const handoff = createClosureHandoffEnvelope(input.pointer);
  await armClosureRuntimeAttempt(input.storePaths, input.pointer);
  trace(input.onTrace, "handoff:armed");

  let handle: StandaloneHandle | null = null;
  try {
    const verification = await verifyStoredClosureCandidate(input.storePaths, input.pointer);
    const startStandalone = await loadStandalone(verification, input.importStandalone);
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
    await confirmClosureRuntime(input.storePaths, input.pointer);
    trace(input.onTrace, "runtime:confirmed");
    return { handle, handoff };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    trace(input.onTrace, "body:failed");
    throw error;
  }
}

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

  let candidateActivated = false;
  if (options.candidate != null) {
    const candidate = verifySignedClosureCandidate(options.candidate, options.trustedKeys);
    trace(options.onTrace, "candidate:trusted");
    assertCandidateCoordinates(candidate, request);
    const minShellVersion = candidate.manifest.compatibility.shell.minVersion;
    if (requiresInstallerReinstall(request.shell.version, minShellVersion)) {
      trace(options.onTrace, "installer:reinstall");
      return installerReinstall(minShellVersion);
    }
    let update;
    try {
      update = await applyClosureUpdate({
        candidate,
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
        paths: storePaths,
        shellVersion: request.shell.version,
      });
    } catch (error) {
      throw new ClosureShimError(
        "candidate-rejected",
        "Closure candidate failed integrity or materialization checks",
        { cause: error },
      );
    }
    candidateActivated = update.state === "activated";
    trace(options.onTrace, candidateActivated ? "candidate:activated" : "candidate:reused");
  } else {
    trace(options.onTrace, "candidate:reused");
  }

  let pointer = await selectedPointer(storePaths);
  let verification = await verifyStoredClosureCandidate(storePaths, pointer);
  const minShellVersion = verification.manifest.compatibility.shell.minVersion;
  if (requiresInstallerReinstall(request.shell.version, minShellVersion)) {
    trace(options.onTrace, "installer:reinstall");
    return installerReinstall(minShellVersion);
  }

  const importStandalone = options.importStandalone ?? defaultImportStandalone;
  try {
    const started = await startPointer({
      importStandalone,
      onTrace: options.onTrace,
      paths: options.paths,
      pointer,
      shellCapabilities: options.shellCapabilities,
      storePaths,
    });
    return readyOutcome({
      handle: started.handle,
      result: {
        handoff: started.handoff,
        outcome: "ready",
        reused: !candidateActivated,
        rolledBack: false,
        schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
      },
    });
  } catch (activeError) {
    const failedPointer = pointer;
    const recovery = await recoverClosureRuntime(storePaths);
    if (
      !recovery.selection.selected
      || recovery.selection.pointer.generation === failedPointer.generation
    ) {
      throw new ClosureShimError(
        "handoff-failed",
        "Standalone failed and no last-successful Standalone is available",
        { cause: activeError },
      );
    }
    trace(options.onTrace, "runtime:rolled-back");
    pointer = recovery.selection.pointer;
    verification = await verifyStoredClosureCandidate(storePaths, pointer);
    if (requiresInstallerReinstall(
      request.shell.version,
      verification.manifest.compatibility.shell.minVersion,
    )) {
      trace(options.onTrace, "installer:reinstall");
      return installerReinstall(verification.manifest.compatibility.shell.minVersion);
    }
    try {
      const started = await startPointer({
        importStandalone,
        onTrace: options.onTrace,
        paths: options.paths,
        pointer,
        shellCapabilities: options.shellCapabilities,
        storePaths,
      });
      return readyOutcome({
        handle: started.handle,
        result: {
          handoff: started.handoff,
          outcome: "ready",
          reused: true,
          rolledBack: true,
          schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
        },
      });
    } catch (rollbackError) {
      await recoverClosureRuntime(storePaths).catch(() => undefined);
      throw new AggregateError(
        [activeError, rollbackError],
        "Active and last-successful Closure bodies both failed",
      );
    }
  }
}
