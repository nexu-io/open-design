import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { discardStandaloneStoreEntry } from "./blob.js";
import type { GenerationRecord, GenerationState } from "./store.js";
import { withStandaloneMaintenanceLock } from "./maintenance.js";

export type StandaloneGarbageSweepResult = Readonly<{
  discardedBlobs: number;
  discardedMaterializations: number;
}>;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function liveStoreReferences(root: string): Promise<Readonly<{ blobs: Set<string>; materializations: Set<string> }>> {
  const blobs = new Set<string>();
  const materializations = new Set<string>();
  const channelsRoot = join(root, "channels");
  for (const channel of await readdir(channelsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!channel.isDirectory() || channel.isSymbolicLink()) continue;
    const channelRoot = join(channelsRoot, channel.name);
    const namespacesRoot = join(channelRoot, "namespaces");
    for (const namespace of await readdir(namespacesRoot, { withFileTypes: true }).catch(() => [])) {
      if (!namespace.isDirectory() || namespace.isSymbolicLink()) continue;
      const statePath = join(namespacesRoot, namespace.name, "state.json");
      const state = await readJson<GenerationState>(statePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (state == null) continue;
      if (state.schemaVersion !== 4) throw new Error(`unsupported generation state while sweeping: ${channel.name}/${namespace.name}`);
      const ids = new Set([
        state.prepared,
        state.activationAttempt?.generationId,
        state.active,
        state.lastHealthy,
      ].filter((value): value is string => value != null));
      for (const id of ids) {
        const generation = await readJson<GenerationRecord>(join(channelRoot, "generations", `${id}.json`));
        if (generation.schemaVersion !== 4 || generation.id !== id || generation.channel !== channel.name) {
          throw new Error(`invalid retained generation while sweeping: ${channel.name}/${id}`);
        }
        for (const resource of Object.values(generation.resources)) {
          blobs.add(resource.blobSha256);
          if (resource.materialization.type === "zip") materializations.add(basename(resource.path));
        }
      }
    }
  }
  return { blobs, materializations };
}

async function discardUnreferenced(root: string, directory: string, live: ReadonlySet<string>, kind: "file" | "directory"): Promise<number> {
  let discarded = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const expected = kind === "file" ? entry.isFile() : entry.isDirectory();
    if (!expected || entry.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(entry.name) || live.has(entry.name)) continue;
    if (await discardStandaloneStoreEntry(root, join(directory, entry.name)) != null) discarded += 1;
  }
  return discarded;
}

/** Conservative global mark/quarantine sweep across every channel and namespace. */
export async function sweepStandaloneStore(root: string): Promise<StandaloneGarbageSweepResult> {
  return withStandaloneMaintenanceLock(root, async () => {
    const live = await liveStoreReferences(root);
    const discardedMaterializations = await discardUnreferenced(root, join(root, "materialized"), live.materializations, "directory");
    const discardedBlobs = await discardUnreferenced(root, join(root, "blobs", "sha256"), live.blobs, "file");
    return { discardedBlobs, discardedMaterializations };
  });
}
