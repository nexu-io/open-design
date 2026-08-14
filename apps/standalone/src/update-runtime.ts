import {
  authorizePreparedClosureActivation,
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure/store";
import {
  applyClosureDistributionUpdate,
  compareClosureShellVersions,
  readClosureResourceRepositoryConfig,
  resolveClosureShellMinimumVersion,
  selectClosureDistributionReleaseCandidate,
} from "@open-design/closure/update";

import { discardUnreferencedClosureResources } from "./resource-garbage.js";
import { ensureStandaloneBootResources } from "./resource-runtime.js";

export type StandaloneUpdatePreparation = Readonly<
  | { architecture: "legacy" }
  | { architecture: "standalone"; minimumShellVersion: string | null; route: "shell" }
  | {
      architecture: "standalone";
      releaseVersion: string;
      route: "closure";
      state: "current" | "prepared";
    }
>;

export async function prepareStandaloneUpdate(input: Readonly<{
  activateOnRestart: boolean;
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
  const candidate = selectClosureDistributionReleaseCandidate(input.metadata, {
    channel: input.channel,
    target: input.target,
  });
  if (candidate == null) return { architecture: "legacy" };
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
    const descriptor = await readClosureBindingDescriptor(paths);
    if (
      input.activateOnRestart
      && result.reason === "already-prepared"
      && descriptor.prepared != null
    ) {
      await authorizePreparedClosureActivation(paths, descriptor.prepared);
    }
    return {
      architecture: "standalone",
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
  if (input.activateOnRestart) {
    await authorizePreparedClosureActivation(paths, descriptor.prepared);
  }
  await discardUnreferencedClosureResources(paths).catch(() => undefined);
  return {
    architecture: "standalone",
    releaseVersion: candidate.releaseVersion,
    route: "closure",
    state: "prepared",
  };
}
