import { join } from "node:path";

import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureDistributionGeneration,
} from "@open-design/closure-store";
import {
  applyClosureDistributionUpdate,
  discoverClosureDistributionVersionCandidate,
  readClosureResourceRepositoryConfig,
  repairCommittedClosureDistribution,
  resolveClosureShellMinimumVersion,
  type ClosureDistributionReleaseCandidate,
  type ClosureDistributionUpdateProgress,
  type ClosureResourceRepositoryConfig,
} from "@open-design/closure-update";
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
} from "@open-design/standalone-proto";
import {
  bootstrapSidecarLifecycle,
  type SidecarTransitionCredential,
} from "@open-design/sidecar/lifecycle";

export class StandaloneBootstrapError extends Error {
  readonly code: StandaloneBootstrapErrorCode;

  constructor(code: StandaloneBootstrapErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StandaloneBootstrapError";
    this.code = code;
  }
}

/**
 * Resolve an unresolved Shell attachment into exactly one committed
 * generation. The launcher supplies the release binding while Standalone owns
 * discovery, component selection, compatibility, commit, and repair policy.
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
  let descriptor = await readClosureBindingDescriptor(paths);
  const initialLoad = descriptor.committed == null;
  const emitProgress = (
    stage: StandaloneBootstrapProgress["stage"],
    progress?: StandaloneBootstrapProgress["progress"],
  ): void => {
    try {
      options.onProgress?.(Object.freeze({
        initialLoad,
        ...(progress == null ? {} : { progress: Object.freeze(progress) }),
        schemaVersion: STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION,
        stage,
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
  const lifecycle = bootstrapSidecarLifecycle({
    controlRoot: request.paths.dataRoot,
    scope: { channel: request.scope.channel, namespace: request.scope.namespace },
  });
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
          generation: descriptor.committed?.standalone.generation ?? descriptor.nextGeneration,
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
    const candidate = await discoverClosureDistributionVersionCandidate({
      channel: request.scope.channel,
      ...(options.fetch == null ? {} : { fetch: options.fetch }),
      metadataUrl: request.discovery.metadataUrl,
      repository,
      target: request.discovery.target,
      version,
    });
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

  const commitExact = async (version: string): Promise<void> => {
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
    if (result.state !== "committed" && result.reason !== "already-committed") {
      throw new StandaloneBootstrapError("standalone-invalid", `Standalone bootstrap could not commit: ${result.reason}`);
    }
    descriptor = await readClosureBindingDescriptor(paths);
  };

  try {
    const committedBeforeAlignment = descriptor.committed;
    if (committedBeforeAlignment == null) {
      await withTransition("install-standalone", async () => await commitExact(request.releaseVersion));
    } else if (
      compareStandaloneVersions(
        committedBeforeAlignment.standalone.version,
        request.releaseVersion,
      ) < 0
    ) {
      await withTransition("align-standalone-to-release", async () => await commitExact(request.releaseVersion));
    }

    let committed = descriptor.committed;
    if (committed == null) throw new StandaloneBootstrapError("no-standalone", "Standalone binding remained empty");
    if (committed.standalone.target !== request.discovery.target) {
      throw new StandaloneBootstrapError(
        "standalone-invalid",
        `Committed Standalone target ${committed.standalone.target} does not match ${request.discovery.target}`,
      );
    }
    let verification: Awaited<ReturnType<typeof verifyStoredClosureDistributionGeneration>>;
    try {
      emitProgress("verifying");
      verification = await verifyStoredClosureDistributionGeneration(paths, committed.standalone);
    } catch (error) {
      const candidate = await discoverExact(committed.standalone.version).catch((discoveryError) => {
        throw new StandaloneBootstrapError(
          "standalone-invalid",
          "Committed Standalone failed verification and its exact repair candidate is unavailable",
          { cause: new AggregateError([error, discoveryError]) },
        );
      });
      assertCandidateSupportsShell(candidate);
      const repair = await withTransition("repair-standalone", async () => {
        return await repairCommittedClosureDistribution({
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
          "Committed Standalone repair is already active",
        );
      }
      if (repair.state !== "committed") {
        throw new StandaloneBootstrapError(
          repair.reason === "shell-incompatible" ? "installer-required" : "standalone-invalid",
          `Committed Standalone repair could not commit: ${repair.reason}`,
        );
      }
      descriptor = await readClosureBindingDescriptor(paths);
      committed = descriptor.committed;
      if (committed == null) {
        throw new StandaloneBootstrapError("standalone-invalid", "Standalone repair did not publish a binding");
      }
      try {
        emitProgress("verifying");
        verification = await verifyStoredClosureDistributionGeneration(paths, committed.standalone);
      } catch (repairError) {
        throw new StandaloneBootstrapError(
          "standalone-invalid",
          "Repaired Standalone failed immutable Store verification",
          { cause: repairError },
        );
      }
    }
    const minimum = verification.plan.manifest.compatibility.shell[request.attachment.shell.type]?.version.min;
    if (minimum == null || compareStandaloneVersions(request.attachment.shell.version, minimum) < 0) {
      throw new StandaloneBootstrapError(
        "installer-required",
        minimum == null
          ? `Standalone does not support Shell ${request.attachment.shell.type}`
          : `Standalone requires ${request.attachment.shell.type} Shell ${minimum} or newer`,
      );
    }
    const handoff = Object.freeze({
      attachment: request.attachment,
      handoff: createStandaloneHandoffEnvelope({
        descriptor: {
          release: { version: committed.releaseVersion },
          standalone: {
            digest: committed.standalone.digest,
            protocolVersion: STANDALONE_PROTOCOL_VERSION,
            version: committed.standalone.version,
          },
        },
        scope: {
          channel: paths.channel,
          generation: committed.standalone.generation,
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
