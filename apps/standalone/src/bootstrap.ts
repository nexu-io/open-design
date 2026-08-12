import { join } from "node:path";

import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureDistributionGeneration,
} from "@open-design/closure-store";
import {
  applyClosureDistributionUpdate,
  discoverClosureDistributionBootstrapCandidate,
  readClosureResourceRepositoryConfig,
} from "@open-design/closure-update";
import {
  STANDALONE_PROTOCOL_VERSION,
  compareStandaloneVersions,
  createStandaloneHandoffEnvelope,
  validateStandaloneBootstrapDescriptor,
  type StandaloneBootstrapDescriptor,
  type StandaloneBootstrapErrorCode,
  type StandaloneBootstrapResolution,
} from "@open-design/standalone-proto";

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
 * generation. This is Standalone policy: callers provide identity, roots and
 * repository capability, but never choose a product version or component.
 */
export async function resolveStandaloneBootstrap(
  requestInput: StandaloneBootstrapDescriptor,
  options: Readonly<{ fetch?: typeof globalThis.fetch }> = {},
): Promise<StandaloneBootstrapResolution> {
  const request = validateStandaloneBootstrapDescriptor(requestInput);
  const paths = resolveClosureStorePaths({
    channel: request.scope.channel,
    namespace: request.scope.namespace,
    root: request.paths.installationRoot,
  });
  let descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.committed == null) {
    const repository = await readClosureResourceRepositoryConfig({
      OD_CLOSURE_RESOURCE_REPOSITORY_V1: request.repositoryConfigPath,
    });
    const candidate = await discoverClosureDistributionBootstrapCandidate({
      channel: request.scope.channel,
      ...(options.fetch == null ? {} : { fetch: options.fetch }),
      metadataUrl: request.discovery.metadataUrl,
      repository,
      target: request.discovery.target,
    });
    if (candidate == null) {
      throw new StandaloneBootstrapError("no-standalone", "Standalone has no committed generation or baseline candidate");
    }
    const result = await applyClosureDistributionUpdate({
      candidate,
      ...(options.fetch == null ? {} : { fetch: options.fetch }),
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
  }
  const committed = descriptor.committed;
  if (committed == null) throw new StandaloneBootstrapError("no-standalone", "Standalone binding remained empty");
  if (committed.standalone.target !== request.discovery.target) {
    throw new StandaloneBootstrapError(
      "standalone-invalid",
      `Committed Standalone target ${committed.standalone.target} does not match ${request.discovery.target}`,
    );
  }
  let verification: Awaited<ReturnType<typeof verifyStoredClosureDistributionGeneration>>;
  try {
    verification = await verifyStoredClosureDistributionGeneration(paths, committed.standalone);
  } catch (error) {
    throw new StandaloneBootstrapError(
      "standalone-invalid",
      "Committed Standalone failed immutable Store verification",
      { cause: error },
    );
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
  });
  return Object.freeze({
    bootloaderPath: verification.plan.required.launcher.resolvedHandoffPath,
    handoff,
  });
}
