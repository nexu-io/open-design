import {
  acquireClosureChannelLock,
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  readStoredClosureDistributionManifest,
  releaseClosureChannelLock,
  resolveClosureStorePaths,
  type ClosureStorePaths,
} from "@open-design/closure/store";
import {
  ensureClosureResource,
  readClosureResourceRepositoryConfig,
  type ClosureResourceEnsureProgress,
  type ClosureResourceRepositoryConfig,
} from "@open-design/closure/update";
import type { ClosureDistributionManifest } from "@open-design/closure/protocol";

import {
  validateStandaloneHandoffDescriptor,
  type StandaloneHandoffDescriptor,
} from "./protocol/index.js";
import { VELA_RUNTIME_RESOURCE_ID } from "./tool-env.js";
import { discardUnreferencedClosureResources } from "./resource-garbage.js";
export {
  prepareStandaloneResourceEnv,
  prepareStandaloneVelaRuntime,
} from "./resource-handoff.js";

export type StandalonePreparedResource = Readonly<{
  id: string;
  path: string;
  reused: boolean;
  title: string;
}>;

/** Materialize one manifest-declared resource without joining the boot critical path. */
export async function ensureStandaloneResource(input: Readonly<{
  descriptor: StandaloneHandoffDescriptor;
  fetch?: typeof globalThis.fetch;
  id: string;
}>): Promise<StandalonePreparedResource> {
  const descriptor = validateStandaloneHandoffDescriptor(input.descriptor);
  const id = input.id.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`Invalid Closure resource id: ${input.id}`);
  }
  if (descriptor.closure == null) {
    throw new Error("Standalone handoff has no Closure resource context");
  }
  const paths = resolveClosureStorePaths({
    channel: descriptor.handoff.scope.channel,
    namespace: descriptor.handoff.scope.namespace,
    root: descriptor.closure.storeRoot,
  });
  const binding = await readClosureBindingDescriptor(paths);
  const active = binding.active;
  if (
    active == null
    || active.standalone.digest !== descriptor.handoff.descriptor.standalone.digest
    || active.standalone.generation !== descriptor.handoff.scope.generation
    || active.standalone.target !== descriptor.closure.target
  ) {
    throw new Error("Standalone resource context does not match the active Closure generation");
  }
  const [manifest, repository] = await Promise.all([
    readStoredClosureDistributionManifest(paths, active.standalone),
    readClosureResourceRepositoryConfig({
      OD_CLOSURE_RESOURCE_REPOSITORY_V1: descriptor.closure.repositoryConfigPath,
    }),
  ]);
  const lock = await acquireClosureChannelLock(paths, { waitMs: 30_000 });
  if (lock == null) throw new Error("Closure channel resources are busy");
  try {
    return await ensureClosureResource({
      id,
      manifest,
      ...(input.fetch == null ? {} : { fetch: input.fetch }),
      paths,
      repository,
      target: descriptor.closure.target,
    });
  } finally {
    await releaseClosureChannelLock(lock);
  }
}

export async function ensureStandaloneBootResources(input: Readonly<{
  fetch?: typeof globalThis.fetch;
  manifest: ClosureDistributionManifest;
  onProgress?: (resource: Readonly<{ id: string; title: string }>, progress: ClosureResourceEnsureProgress) => void;
  paths: ClosureStorePaths;
  repository: ClosureResourceRepositoryConfig;
  target: string;
}>): Promise<readonly StandalonePreparedResource[]> {
  const plan = planClosureDistributionGeneration(input.paths, 0, input.manifest, input.target);
  const required = plan.resources.filter((entry) => (
    entry.startup === "blocking"
    && (
      entry.id !== VELA_RUNTIME_RESOURCE_ID
      || !(process.env.VELA_BIN?.trim() && process.env.VELA_OPENCODE_BIN?.trim())
    )
  ));
  if (required.length === 0) return [];
  const lock = await acquireClosureChannelLock(input.paths, { waitMs: 30_000 });
  if (lock == null) throw new Error("Closure channel resources are busy");
  try {
    const prepared: StandalonePreparedResource[] = [];
    for (const planned of required) {
      prepared.push(await ensureClosureResource({
        id: planned.id,
        manifest: input.manifest,
        ...(input.fetch == null ? {} : { fetch: input.fetch }),
        ...(input.onProgress == null
          ? {}
          : { onProgress: (progress) => input.onProgress?.(planned, progress) }),
        paths: input.paths,
        repository: input.repository,
        target: input.target,
      }));
    }
    await discardUnreferencedClosureResources(input.paths).catch(() => undefined);
    return Object.freeze(prepared);
  } finally {
    await releaseClosureChannelLock(lock);
  }
}
