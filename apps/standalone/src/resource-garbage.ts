import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  CLOSURE_STORE_EPOCH,
  discardClosureStoreEntry,
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  readStoredClosureDistributionManifest,
  resolveClosureStorePaths,
  type ClosureStorePaths,
} from "@open-design/closure/store";

export type ClosureResourceDiscardResult = Readonly<{
  discardedBlobs: number;
  discardedResources: number;
}>;

const CONTENT_ADDRESS = /^[0-9a-f]{64}$/u;

async function liveChannelReferences(paths: ClosureStorePaths): Promise<Readonly<{
  blobs: ReadonlySet<string>;
  resources: ReadonlySet<string>;
}>> {
  const blobs = new Set<string>();
  const resources = new Set<string>();
  const namespacesRoot = join(
    paths.channelRoot,
    "epochs",
    String(CLOSURE_STORE_EPOCH),
    "namespaces",
  );
  const namespaces = await readdir(namespacesRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of namespaces) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const namespacePaths = resolveClosureStorePaths({
      channel: paths.channel,
      namespace: entry.name,
      root: paths.root,
    });
    const descriptor = await readClosureBindingDescriptor(namespacePaths);
    const references = [
      descriptor.active,
      descriptor.attempt,
      descriptor.lastSuccessful,
      descriptor.prepared,
    ].filter((binding) => binding != null);
    const seen = new Set<string>();
    for (const binding of references) {
      const pointer = binding.standalone;
      const key = `${pointer.generation}:${pointer.digest}:${pointer.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const manifest = await readStoredClosureDistributionManifest(namespacePaths, pointer);
      const plan = planClosureDistributionGeneration(
        namespacePaths,
        pointer.generation,
        manifest,
        pointer.target,
      );
      for (const blobPath of plan.requiredBlobPaths) blobs.add(basename(blobPath));
      for (const resource of plan.resources) {
        blobs.add(basename(resource.blobPath));
        resources.add(basename(resource.resourceRoot));
      }
    }
  }
  return Object.freeze({ blobs, resources });
}

async function discardUnreferencedRoot(input: Readonly<{
  entriesAreDirectories: boolean;
  live: ReadonlySet<string>;
  paths: ClosureStorePaths;
  root: string;
}>): Promise<number> {
  const entries = await readdir(input.root, { withFileTypes: true }).catch(() => []);
  let discarded = 0;
  for (const entry of entries) {
    const expectedKind = input.entriesAreDirectories ? entry.isDirectory() : entry.isFile();
    if (
      !expectedKind
      || entry.isSymbolicLink()
      || !CONTENT_ADDRESS.test(entry.name)
      || input.live.has(entry.name)
    ) continue;
    const result = await discardClosureStoreEntry({
      paths: input.paths,
      sourcePath: join(input.root, entry.name),
    });
    if (result.state === "discarded") discarded += 1;
  }
  return discarded;
}

/**
 * Caller-owned conservative sweep. This runs under the channel maintenance
 * lock; any unreadable retained graph aborts before the first discard.
 */
export async function discardUnreferencedClosureResources(
  paths: ClosureStorePaths,
): Promise<ClosureResourceDiscardResult> {
  const live = await liveChannelReferences(paths);
  const discardedResources = await discardUnreferencedRoot({
    entriesAreDirectories: true,
    live: live.resources,
    paths,
    root: paths.resourcesRoot,
  });
  const discardedBlobs = await discardUnreferencedRoot({
    entriesAreDirectories: false,
    live: live.blobs,
    paths,
    root: paths.blobsRoot,
  });
  return Object.freeze({ discardedBlobs, discardedResources });
}
