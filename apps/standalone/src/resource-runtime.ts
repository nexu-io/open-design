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
