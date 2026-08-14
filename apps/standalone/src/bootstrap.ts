import { join } from "node:path";

import {
  activatePreparedClosureBinding,
  authorizePreparedClosureActivation,
  beginActiveClosureBindingAttempt,
  readClosureBindingDescriptor,
  readStoredClosureDistributionManifest,
  recoverInterruptedClosureBinding,
  resolveClosureStorePaths,
  sameShellBinding,
  verifyStoredClosureDistributionGeneration,
} from "@open-design/closure/store";
import {
  applyClosureDistributionUpdate,
  ClosureInstallerRequiredError,
  discoverClosureDistributionVersionCandidate,
  readClosureResourceRepositoryConfig,
  repairActiveClosureDistribution,
  resolveClosureShellMinimumVersion,
  type ClosureDistributionReleaseCandidate,
  type ClosureDistributionUpdateProgress,
  type ClosureResourceRepositoryConfig,
} from "@open-design/closure/update";
import {
  STANDALONE_PROTOCOL_VERSION,
  STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION,
  compareStandaloneVersions,
  createStandaloneHandoffEnvelope,
  validateStandaloneBootstrapDescriptor,
  type StandaloneBootstrapDescriptor,
  type StandaloneBootstrapErrorCode,
  type StandaloneBootstrapProgress,
  type StandaloneBootstrapResolution,
} from "./protocol/index.js";
import {
  bootstrapSidecarLifecycle,
  type SidecarTransitionCredential,
} from "@open-design/sidecar/lifecycle";
import { ensureStandaloneBootResources } from "./resource-runtime.js";
import { VELA_RUNTIME_RESOURCE_ID } from "./tool-env.js";

export class StandaloneBootstrapError extends Error {
  readonly code: StandaloneBootstrapErrorCode;

  constructor(code: StandaloneBootstrapErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StandaloneBootstrapError";
    this.code = code;
  }
}

/**
 * Resolve an unresolved Shell attachment into one attempted or last-successful
 * generation. Cold start may activate prepared bytes, but never discovers a
 * newer release than the Shell's explicit first-install binding.
 */
export async function resolveStandaloneBootstrap(
  requestInput: StandaloneBootstrapDescriptor,
  options: Readonly<{
    fetch?: typeof globalThis.fetch;
    onProgress?: (progress: StandaloneBootstrapProgress) => void;
  }> = {},
): Promise<StandaloneBootstrapResolution> {
  const request = validateStandaloneBootstrapDescriptor(requestInput);
  const paths = resolveClosureStorePaths({
    channel: request.scope.channel,
    namespace: request.scope.namespace,
    root: request.paths.installationRoot,
  });
  const repository = await readClosureResourceRepositoryConfig({
    OD_CLOSURE_RESOURCE_REPOSITORY_V1: request.repositoryConfigPath,
  });
  const lifecycle = bootstrapSidecarLifecycle({
    controlRoot: request.paths.dataRoot,
    scope: { channel: request.scope.channel, namespace: request.scope.namespace },
  });
  let descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.attempt != null) {
    const snapshot = await lifecycle.snapshot();
    if (snapshot.transition != null) {
      throw new StandaloneBootstrapError(
        "standalone-occupied",
        `Standalone activation is already active: ${snapshot.transition.kind}`,
      );
    }
    await recoverInterruptedClosureBinding(paths);
    descriptor = await readClosureBindingDescriptor(paths);
  }
  const initialLoad = descriptor.active == null;
  const standaloneSubject = Object.freeze({
    id: "standalone",
    kind: "standalone" as const,
    title: "Standalone",
  });
  const emitProgress = (
    stage: StandaloneBootstrapProgress["stage"],
    progress?: StandaloneBootstrapProgress["progress"],
    subject: StandaloneBootstrapProgress["subject"] = standaloneSubject,
  ): void => {
    try {
      options.onProgress?.(Object.freeze({
        initialLoad,
        ...(progress == null ? {} : { progress: Object.freeze(progress) }),
        schemaVersion: STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION,
        stage,
        subject,
      }));
    } catch {
      // Presentation telemetry cannot change bootstrap policy or authority.
    }
  };
  const forwardDistributionProgress = (progress: ClosureDistributionUpdateProgress): void => {
    if (progress.phase === "download") {
      emitProgress("downloading", {
        completed: progress.completedBytes,
        total: progress.totalBytes,
        unit: "bytes",
      });
      return;
    }
    emitProgress("materializing", {
      completed: progress.completedComponents,
      total: progress.totalComponents,
      unit: "components",
    });
  };
  emitProgress("checking");
  let transition: SidecarTransitionCredential | null = null;
  let transitionRenewal: ReturnType<typeof setInterval> | null = null;
  let transitionRenewalError: Error | null = null;

  const stopTransitionRenewal = (): void => {
    if (transitionRenewal != null) clearInterval(transitionRenewal);
    transitionRenewal = null;
  };

  const withTransition = async <TResult>(
    kind: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> => {
    if (transition == null) {
      const acquired = await lifecycle.beginTransition({
        kind,
        leaseMs: 60_000,
        owner: {
          generation: descriptor.active?.standalone.generation ?? descriptor.nextGeneration,
          incarnation: request.attachment.id,
          key: `${request.attachment.shell.type}:${request.attachment.id}`,
          projection: {
            shellDigest: request.attachment.shell.digest,
            shellVersion: request.attachment.shell.version,
          },
        },
      });
      if (acquired.state === "blocked") {
        const occupants = acquired.occupants?.map((entry) => entry.owner.key).join(", ");
        throw new StandaloneBootstrapError(
          "standalone-occupied",
          acquired.reason === "occupied"
            ? `Standalone update is blocked by active Shell attachments: ${occupants || "unknown"}`
            : `Standalone update is already active: ${acquired.transition?.kind ?? acquired.reason}`,
        );
      }
      transition = acquired.credential;
      transitionRenewal = setInterval(() => {
        const credential = transition;
        if (credential == null) return;
        void lifecycle.renewTransition({ credential, leaseMs: 60_000 }).then((result) => {
          if (result.state === "rejected") {
            transitionRenewalError = new Error("Standalone lifecycle transition expired or was fenced");
          }
        }).catch((error: unknown) => {
          transitionRenewalError = error instanceof Error ? error : new Error(String(error));
        });
      }, 20_000);
      transitionRenewal.unref();
    }
    if (transitionRenewalError != null) throw transitionRenewalError;
    const result = await operation();
    if (transitionRenewalError != null) throw transitionRenewalError;
    return result;
  };

  const discoverExact = async (version: string): Promise<ClosureDistributionReleaseCandidate> => {
    emitProgress("discovering");
    let candidate: ClosureDistributionReleaseCandidate | null;
    try {
      candidate = await discoverClosureDistributionVersionCandidate({
        channel: request.scope.channel,
        consumer: {
          shellType: request.attachment.shell.type,
          shellVersion: request.attachment.shell.version,
        },
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
        metadataUrl: request.discovery.metadataUrl,
        repository,
        target: request.discovery.target,
        version,
      });
    } catch (error) {
      if (error instanceof ClosureInstallerRequiredError) {
        throw new StandaloneBootstrapError("installer-required", error.message, { cause: error });
      }
      throw error;
    }
    if (candidate == null) {
      throw new StandaloneBootstrapError(
        "no-standalone",
        `Standalone ${version} is unavailable from Shell resources and the immutable release feed`,
      );
    }
    return candidate;
  };

  const assertCandidateSupportsShell = (candidate: ClosureDistributionReleaseCandidate): void => {
    const minimum = resolveClosureShellMinimumVersion(
      candidate.manifest,
      request.attachment.shell.type,
    );
    if (minimum == null || compareStandaloneVersions(request.attachment.shell.version, minimum) < 0) {
      throw new StandaloneBootstrapError(
        "installer-required",
        minimum == null
          ? `Standalone does not support Shell ${request.attachment.shell.type}`
          : `Standalone requires ${request.attachment.shell.type} Shell ${minimum} or newer`,
      );
    }
  };

  const prepareExact = async (version: string): Promise<void> => {
    const candidate = await discoverExact(version);
    assertCandidateSupportsShell(candidate);
    const result = await applyClosureDistributionUpdate({
      candidate,
      ...(options.fetch == null ? {} : { fetch: options.fetch }),
      onProgress: forwardDistributionProgress,
      paths,
      repository,
      shellType: request.attachment.shell.type,
      shellVersion: request.attachment.shell.version,
    });
    if (result.state === "retained" && result.reason === "shell-incompatible") {
      throw new StandaloneBootstrapError("installer-required", "Standalone requires a newer Shell");
    }
    if (result.state !== "prepared" && result.reason !== "already-prepared") {
      throw new StandaloneBootstrapError("standalone-invalid", `Standalone bootstrap could not prepare: ${result.reason}`);
    }
    descriptor = await readClosureBindingDescriptor(paths);
  };

  type DistributionVerification = Awaited<ReturnType<typeof verifyStoredClosureDistributionGeneration>>;
  let bootResourcesReady = false;
  const ensureBootResources = async (verification: DistributionVerification): Promise<void> => {
    try {
      await ensureStandaloneBootResources({
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
        manifest: verification.plan.manifest,
        onProgress(resource, progress) {
          const subject = Object.freeze({
            id: resource.id,
            kind: "resource" as const,
            title: resource.id === VELA_RUNTIME_RESOURCE_ID ? "Local engine" : resource.title,
          });
          if (progress.phase === "copying" || progress.phase === "downloading") {
            emitProgress(progress.phase, {
              completed: progress.completedBytes,
              total: progress.totalBytes,
              unit: "bytes",
            }, subject);
            return;
          }
          emitProgress(progress.phase, undefined, subject);
        },
        paths,
        repository,
        target: verification.plan.target,
      });
      bootResourcesReady = true;
    } catch (error) {
      throw new StandaloneBootstrapError(
        "resource-unavailable",
        `Standalone startup resources could not be prepared: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };

  const activatePrepared = async (): Promise<DistributionVerification> => {
    const prepared = descriptor.prepared;
    if (prepared == null) throw new StandaloneBootstrapError("no-standalone", "Standalone prepared binding is missing");
    let verification: DistributionVerification;
    try {
      emitProgress("verifying");
      verification = await verifyStoredClosureDistributionGeneration(paths, prepared.standalone);
    } catch (error) {
      throw new StandaloneBootstrapError("standalone-invalid", "Prepared Standalone failed verification", { cause: error });
    }
    assertCandidateSupportsShell({
      manifest: verification.plan.manifest,
      releaseVersion: prepared.releaseVersion,
      target: prepared.standalone.target,
    });
    await ensureBootResources(verification);
    await withTransition("activate-standalone", async () => {
      await activatePreparedClosureBinding(paths, prepared, request.attachment.shell);
    });
    descriptor = await readClosureBindingDescriptor(paths);
    return verification;
  };

  try {
    let verification: DistributionVerification | null = null;
    if (descriptor.prepared != null && descriptor.activationAuthorized) {
      verification = await activatePrepared();
    } else if (descriptor.active == null) {
      await withTransition("prepare-initial-standalone", async () => {
        await prepareExact(request.releaseVersion);
        if (descriptor.prepared == null) {
          throw new StandaloneBootstrapError("no-standalone", "Initial Standalone preparation is missing");
        }
        await authorizePreparedClosureActivation(paths, descriptor.prepared);
        descriptor = await readClosureBindingDescriptor(paths);
      });
      verification = await activatePrepared();
    }

    let active = descriptor.active;
    if (active == null) throw new StandaloneBootstrapError("no-standalone", "Standalone binding remained empty");
    if (active.standalone.target !== request.discovery.target) {
      throw new StandaloneBootstrapError(
        "standalone-invalid",
        `Active Standalone target ${active.standalone.target} does not match ${request.discovery.target}`,
      );
    }
    if (verification == null) try {
      emitProgress("verifying");
      verification = await verifyStoredClosureDistributionGeneration(paths, active.standalone);
    } catch (error) {
      let candidate: ClosureDistributionReleaseCandidate;
      try {
        candidate = {
          manifest: await readStoredClosureDistributionManifest(paths, active.standalone),
          releaseVersion: active.releaseVersion,
          target: active.standalone.target,
        };
      } catch (localError) {
        candidate = await discoverExact(active.standalone.version).catch((discoveryError) => {
          throw new StandaloneBootstrapError(
            "standalone-invalid",
            "Active Standalone failed verification and its exact repair candidate is unavailable",
            { cause: new AggregateError([error, localError, discoveryError]) },
          );
        });
      }
      assertCandidateSupportsShell(candidate);
      const repair = await withTransition("repair-standalone", async () => {
        return await repairActiveClosureDistribution({
          candidate,
          ...(options.fetch == null ? {} : { fetch: options.fetch }),
          onProgress: forwardDistributionProgress,
          paths,
          repository,
          shellType: request.attachment.shell.type,
          shellVersion: request.attachment.shell.version,
        });
      });
      if (repair.state === "busy") {
        throw new StandaloneBootstrapError(
          "standalone-invalid",
          "Active Standalone repair is already active",
        );
      }
      if (repair.state !== "prepared") {
        throw new StandaloneBootstrapError(
          repair.reason === "shell-incompatible" ? "installer-required" : "standalone-invalid",
          `Active Standalone repair could not prepare: ${repair.reason}`,
        );
      }
      descriptor = await readClosureBindingDescriptor(paths);
      if (descriptor.prepared == null) {
        throw new StandaloneBootstrapError("standalone-invalid", "Standalone repair preparation is missing");
      }
      await authorizePreparedClosureActivation(paths, descriptor.prepared);
      descriptor = await readClosureBindingDescriptor(paths);
      verification = await activatePrepared();
      active = descriptor.active;
      if (active == null) throw new StandaloneBootstrapError("standalone-invalid", "Standalone repair did not activate");
    }
    if (verification == null) throw new StandaloneBootstrapError("standalone-invalid", "Standalone verification is unavailable");
    const minimum = verification.plan.manifest.compatibility.shell[request.attachment.shell.type]?.version.min;
    if (minimum == null || compareStandaloneVersions(request.attachment.shell.version, minimum) < 0) {
      throw new StandaloneBootstrapError(
        "installer-required",
        minimum == null
          ? `Standalone does not support Shell ${request.attachment.shell.type}`
          : `Standalone requires ${request.attachment.shell.type} Shell ${minimum} or newer`,
      );
    }
    if (descriptor.attempt == null && !sameShellBinding(active.shell, request.attachment.shell)) {
      const currentActive = active;
      await withTransition("activate-shell-combination", async () => {
        await beginActiveClosureBindingAttempt(paths, currentActive, request.attachment.shell);
      });
      descriptor = await readClosureBindingDescriptor(paths);
      active = descriptor.active;
      if (active == null) {
        throw new StandaloneBootstrapError("standalone-invalid", "Shell combination activation did not start");
      }
    }
    if (!bootResourcesReady) await ensureBootResources(verification);
    const handoff = Object.freeze({
      attachment: request.attachment,
      closure: Object.freeze({
        repositoryConfigPath: request.repositoryConfigPath,
        storeRoot: paths.root,
        target: verification.plan.target,
      }),
      handoff: createStandaloneHandoffEnvelope({
        descriptor: {
          release: { version: active.releaseVersion },
          standalone: {
            digest: active.standalone.digest,
            protocolVersion: STANDALONE_PROTOCOL_VERSION,
            version: active.standalone.version,
          },
        },
        scope: {
          channel: paths.channel,
          generation: active.standalone.generation,
          namespace: paths.namespace,
        },
      }),
      paths: Object.freeze({
        cacheRoot: request.paths.cacheRoot,
        dataRoot: request.paths.dataRoot,
        installationRoot: verification.plan.installationRoot,
        logsRoot: request.paths.logsRoot,
        resourceRoot: paths.resourcesRoot,
        runtimeRoot: request.paths.runtimeRoot,
      }),
      transition,
    });
    emitProgress("ready");
    stopTransitionRenewal();
    return Object.freeze({
      bootloaderPath: verification.plan.required.launcher.resolvedHandoffPath,
      handoff,
    });
  } catch (error) {
    stopTransitionRenewal();
    if (transition != null) await lifecycle.abortTransition(transition).catch(() => undefined);
    throw error;
  }
}
