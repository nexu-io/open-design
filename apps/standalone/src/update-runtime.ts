import {
  authorizePreparedClosureActivation,
  readClosureBindingDescriptor,
  revokePreparedClosureActivation,
  resolveClosureStorePaths,
} from "@open-design/closure/store";
import {
  applyClosureDistributionUpdate,
  compareClosureShellVersions,
  readClosureResourceRepositoryConfig,
  resolveClosureShellMinimumVersion,
  selectClosureDistributionReleaseCandidate,
} from "@open-design/closure/update";
import type {
  StandaloneUpdateActivationPolicy,
  StandaloneUpdatePreparation,
} from "./protocol/index.js";

import { discardUnreferencedClosureResources } from "./resource-garbage.js";
import { ensureStandaloneBootResources } from "./resource-runtime.js";

/**
 * The sole legacy discriminator is absence of the modern Closure envelope.
 * Standalone never reads legacy control fields; Shell remains their owner.
 */
export function hasModernClosureUpdateMetadata(metadata: unknown): metadata is Record<string, unknown> {
  return metadata != null
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && Object.hasOwn(metadata, "closure");
}

export async function prepareStandaloneUpdate(input: Readonly<{
  activationPolicy: StandaloneUpdateActivationPolicy;
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadata: unknown;
  namespace: string;
  repositoryConfigPath: string;
  shellType: string;
  shellVersion: string;
  storeRoot: string;
  target: string;
}>): Promise<StandaloneUpdatePreparation> {
  if (!hasModernClosureUpdateMetadata(input.metadata)) return { architecture: "legacy" };
  const candidate = selectClosureDistributionReleaseCandidate(input.metadata, {
    channel: input.channel,
    target: input.target,
  });
  if (candidate == null) throw new Error("Modern Closure update metadata is invalid");
  const minimumShellVersion = resolveClosureShellMinimumVersion(candidate.manifest, input.shellType);
  if (
    minimumShellVersion == null
    || compareClosureShellVersions(input.shellVersion, minimumShellVersion) < 0
  ) {
    return { architecture: "standalone", minimumShellVersion, route: "shell" };
  }
  const paths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.storeRoot,
  });
  const repository = await readClosureResourceRepositoryConfig({
    OD_CLOSURE_RESOURCE_REPOSITORY_V1: input.repositoryConfigPath,
  });
  const result = await applyClosureDistributionUpdate({
    candidate,
    ...(input.fetch == null ? {} : { fetch: input.fetch }),
    paths,
    repository,
    shellType: input.shellType,
    shellVersion: input.shellVersion,
  });
  if (result.state === "busy") throw new Error("Standalone update preparation is already active");
  if (result.state === "retained") {
    if (result.reason === "shell-incompatible") {
      return { architecture: "standalone", minimumShellVersion, route: "shell" };
    }
    let descriptor = await readClosureBindingDescriptor(paths);
    if (
      input.activationPolicy !== "revoke-silent"
      && result.reason === "already-prepared"
      && descriptor.prepared != null
    ) {
      await authorizePreparedClosureActivation(
        paths,
        descriptor.prepared,
        input.activationPolicy === "authorize-user" ? "user-restart" : "silent-policy",
      );
      descriptor = await readClosureBindingDescriptor(paths);
    } else if (result.reason === "already-prepared") {
      descriptor = await revokePreparedClosureActivation(paths, "silent-policy");
    }
    return {
      architecture: "standalone",
      activationSource: descriptor.activationIntent?.source === "silent-policy"
        || descriptor.activationIntent?.source === "user-restart"
        ? descriptor.activationIntent.source
        : null,
      releaseVersion: candidate.releaseVersion,
      route: "closure",
      state: result.reason === "already-prepared" ? "prepared" : "current",
    };
  }
  await ensureStandaloneBootResources({
    ...(input.fetch == null ? {} : { fetch: input.fetch }),
    manifest: candidate.manifest,
    paths,
    repository,
    target: candidate.target,
  });
  const descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.prepared?.standalone.generation !== result.pointer.generation) {
    throw new Error("Standalone prepared binding changed before resource completion");
  }
  if (input.activationPolicy !== "revoke-silent") {
    await authorizePreparedClosureActivation(
      paths,
      descriptor.prepared,
      input.activationPolicy === "authorize-user" ? "user-restart" : "silent-policy",
    );
  }
  const preparedDescriptor = await readClosureBindingDescriptor(paths);
  await discardUnreferencedClosureResources(paths).catch(() => undefined);
  return {
    architecture: "standalone",
    activationSource: preparedDescriptor.activationIntent?.source === "silent-policy"
      || preparedDescriptor.activationIntent?.source === "user-restart"
      ? preparedDescriptor.activationIntent.source
      : null,
    releaseVersion: candidate.releaseVersion,
    route: "closure",
    state: "prepared",
  };
}
