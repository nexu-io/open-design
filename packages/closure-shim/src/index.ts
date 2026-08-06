import { createPublicKey, verify as verifySignature } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CLOSURE_SHIM_SCHEMA_VERSION,
  createClosureHandoffEnvelope,
  serializeClosureCandidateManifestForSigning,
  validateClosureCandidateManifest,
  validateClosureCandidateSignature,
  validateClosureHandoffEnvelope,
  validateClosureShimRequest,
  type ClosureCandidateSignature,
  type ClosureHandoffEnvelope,
  type ClosureShimInstallerReinstallResult,
  type ClosureShimReadyResult,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import {
  armClosureRuntimeAttempt,
  confirmClosureRuntime,
  readClosureRuntimeDescriptor,
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
import type { HeadlessClosurePaths } from "@open-design/headless-runtime";

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

export type ClosureBodyStatus = {
  handoff: ClosureHandoffEnvelope;
  pid: number;
  state: "running";
};

export interface ClosureBodyHandle {
  close(): Promise<void>;
  readStatus(): Promise<ClosureBodyStatus>;
}

export type ClosureBodyHandoffInput = {
  handoff: ClosureHandoffEnvelope;
  paths: Readonly<HeadlessClosurePaths>;
};

export type ClosureBodyModule = {
  handoffOpenDesignClosure?: (
    input: ClosureBodyHandoffInput,
  ) => Promise<ClosureBodyHandle>;
};

export type ClosureShimReady = {
  close(): Promise<void>;
  handle: ClosureBodyHandle;
  result: ClosureShimReadyResult;
};

export type ClosureShimInstallerReinstall = {
  handle: null;
  result: ClosureShimInstallerReinstallResult;
};

export type ClosureShimOutcome = ClosureShimReady | ClosureShimInstallerReinstall;

export type EnsureAndHandoffClosureOptions = {
  candidate?: SignedClosureReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  importBody?: (entryUrl: string) => Promise<ClosureBodyModule>;
  onTrace?: (event: ClosureShimTraceEvent) => void;
  paths: HeadlessClosurePaths;
  request: ClosureShimRequest;
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

async function defaultImportBody(entryUrl: string): Promise<ClosureBodyModule> {
  return await import(entryUrl) as ClosureBodyModule;
}

async function loadBody(
  verification: StoredClosureVerification,
  importBody: NonNullable<EnsureAndHandoffClosureOptions["importBody"]>,
): Promise<NonNullable<ClosureBodyModule["handoffOpenDesignClosure"]>> {
  const entryUrl = pathToFileURL(join(
    verification.paths.payloadRoot,
    verification.manifest.artifact.entryPath,
  )).href;
  const body = await importBody(entryUrl);
  if (typeof body.handoffOpenDesignClosure !== "function") {
    throw new ClosureShimError(
      "handoff-failed",
      "Closure body does not export handoffOpenDesignClosure",
    );
  }
  return body.handoffOpenDesignClosure;
}

async function selectedPointer(paths: ClosureStorePaths): Promise<ClosureRuntimePointer> {
  const recovered = await recoverClosureRuntime(paths);
  if (!recovered.selection.selected) {
    throw new ClosureShimError(
      "body-unavailable",
      "No compatible Closure body is available",
    );
  }
  return recovered.selection.pointer;
}

async function startPointer(input: {
  importBody: NonNullable<EnsureAndHandoffClosureOptions["importBody"]>;
  onTrace: EnsureAndHandoffClosureOptions["onTrace"];
  paths: Readonly<HeadlessClosurePaths>;
  pointer: ClosureRuntimePointer;
  storePaths: ClosureStorePaths;
}): Promise<{ handle: ClosureBodyHandle; handoff: ClosureHandoffEnvelope }> {
  const handoff = createClosureHandoffEnvelope(input.pointer);
  await armClosureRuntimeAttempt(input.storePaths, input.pointer);
  trace(input.onTrace, "handoff:armed");

  let handle: ClosureBodyHandle | null = null;
  try {
    const verification = await verifyStoredClosureCandidate(input.storePaths, input.pointer);
    const startBody = await loadBody(verification, input.importBody);
    handle = await startBody({ handoff, paths: input.paths });
    const status = await handle.readStatus();
    if (status.state !== "running") {
      throw new ClosureShimError(
        "handoff-failed",
        `Closure body reported unexpected state: ${String(status.state)}`,
      );
    }
    if (!Number.isSafeInteger(status.pid) || status.pid <= 0) {
      throw new ClosureShimError(
        "handoff-failed",
        `Closure body reported an invalid pid: ${String(status.pid)}`,
      );
    }
    validateClosureHandoffEnvelope(status.handoff, {
      channel: input.pointer.channel,
      generation: input.pointer.generation,
      namespace: input.pointer.namespace,
      platform: input.pointer.platform,
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

  const importBody = options.importBody ?? defaultImportBody;
  try {
    const started = await startPointer({
      importBody,
      onTrace: options.onTrace,
      paths: options.paths,
      pointer,
      storePaths,
    });
    return {
      close: async () => await started.handle.close(),
      handle: started.handle,
      result: {
        handoff: started.handoff,
        outcome: "ready",
        reused: !candidateActivated,
        rolledBack: false,
        schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
      },
    };
  } catch (activeError) {
    const failedPointer = pointer;
    const recovery = await recoverClosureRuntime(storePaths);
    if (
      !recovery.selection.selected
      || recovery.selection.pointer.generation === failedPointer.generation
    ) {
      throw new ClosureShimError(
        "handoff-failed",
        "Closure body failed and no last-successful body is available",
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
        importBody,
        onTrace: options.onTrace,
        paths: options.paths,
        pointer,
        storePaths,
      });
      return {
        close: async () => await started.handle.close(),
        handle: started.handle,
        result: {
          handoff: started.handoff,
          outcome: "ready",
          reused: true,
          rolledBack: true,
          schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
        },
      };
    } catch (rollbackError) {
      await recoverClosureRuntime(storePaths).catch(() => undefined);
      throw new AggregateError(
        [activeError, rollbackError],
        "Active and last-successful Closure bodies both failed",
      );
    }
  }
}
