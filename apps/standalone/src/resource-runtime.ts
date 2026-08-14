import {
  acquireClosureChannelLock,
  planClosureDistributionGeneration,
  releaseClosureChannelLock,
  type ClosureStorePaths,
} from "@open-design/closure/store";
import {
  ensureClosureResource,
  type ClosureResourceEnsureProgress,
  type ClosureResourceRepositoryConfig,
} from "@open-design/closure/update";
import type { ClosureDistributionManifest } from "@open-design/closure/protocol";

import { VELA_RUNTIME_RESOURCE_ID } from "./tool-env.js";
import { discardUnreferencedClosureResources } from "./resource-garbage.js";
export { prepareStandaloneVelaRuntime } from "./resource-handoff.js";

export async function ensureStandaloneVelaResource(input: Readonly<{
  fetch?: typeof globalThis.fetch;
  manifest: ClosureDistributionManifest;
  onProgress?: (progress: ClosureResourceEnsureProgress) => void;
  paths: ClosureStorePaths;
  repository: ClosureResourceRepositoryConfig;
  target: string;
}>): Promise<Readonly<{ id: string; path: string; reused: boolean; title: string }> | null> {
  if (process.env.VELA_BIN?.trim() && process.env.VELA_OPENCODE_BIN?.trim()) return null;
  const plan = planClosureDistributionGeneration(input.paths, 0, input.manifest, input.target);
  if (!plan.resources.some((entry) => entry.id === VELA_RUNTIME_RESOURCE_ID)) return null;
  const lock = await acquireClosureChannelLock(input.paths, { waitMs: 30_000 });
  if (lock == null) throw new Error("Closure channel resources are busy");
  try {
    const resource = await ensureClosureResource({
      id: VELA_RUNTIME_RESOURCE_ID,
      manifest: input.manifest,
      ...(input.fetch == null ? {} : { fetch: input.fetch }),
      ...(input.onProgress == null ? {} : { onProgress: input.onProgress }),
      paths: input.paths,
      repository: input.repository,
      target: input.target,
    });
    await discardUnreferencedClosureResources(input.paths).catch(() => undefined);
    return resource;
  } finally {
    await releaseClosureChannelLock(lock);
  }
}
