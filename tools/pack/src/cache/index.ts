import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { withDirectoryLock } from "./lock.js";

export const CACHE_SCHEMA_VERSION = 1;

export type CacheInvalidation = {
  reason: string;
};

export type CacheManifest<TMetadata> = {
  createdAt: string;
  key: string;
  nodeId: string;
  outputs: string[];
  payloadMetadata: TMetadata;
  schemaVersion: number;
};

export type CacheAcquireResult<TMetadata> = CacheManifest<TMetadata> & {
  entryPath: string;
};

export type CacheAcquireReport = {
  durationMs: number;
  entryPath: string;
  key: string;
  keyHash: string;
  materialized: Array<{ durationMs: number; from: string; skipped?: boolean; to: string }>;
  nodeId: string;
  outputs: string[];
  reason: string | null;
  status: "hit" | "miss" | "stale";
};

export type CacheReport = {
  entries: CacheAcquireReport[];
  root: string;
};

export type CacheBuildContext = {
  entryRoot: string;
};

export type CacheNode<TMetadata> = {
  build: (context: CacheBuildContext) => Promise<TMetadata>;
  id: string;
  invalidate: (context: { entryRoot: string; manifest: CacheManifest<TMetadata> }) => Promise<CacheInvalidation | null>;
  key: string;
  outputs: string[];
};

export type CacheMaterializeTarget = {
  from: string;
  reuse?: boolean;
  reuseRequiredPaths?: string[][];
  to: string;
};

export type CacheSeedSource = {
  aliasKey: string;
  materialize: CacheMaterializeTarget[];
};

type CacheMaterializationMarker = {
  from: string;
  keyHash: string;
  nodeId: string;
  schemaVersion: number;
  to: string;
};

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

function safePathToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function assertOutputsExist(entryRoot: string, outputs: string[]): Promise<CacheInvalidation | null> {
  for (const output of outputs) {
    if (!(await pathExists(join(entryRoot, output)))) {
      return { reason: `missing output: ${output}` };
    }
  }
  return null;
}

async function readManifest<TMetadata>(manifestPath: string): Promise<CacheManifest<TMetadata> | null> {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as CacheManifest<TMetadata>;
  } catch {
    return null;
  }
}

async function writeManifest<TMetadata>(
  manifestPath: string,
  manifest: CacheManifest<TMetadata>,
): Promise<void> {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

type CacheAlias = {
  createdAt: string;
  entryPath: string;
  key: string;
  keyHash: string;
  nodeId: string;
  schemaVersion: number;
};

async function readAlias(aliasPath: string): Promise<CacheAlias | null> {
  try {
    return JSON.parse(await readFile(aliasPath, "utf8")) as CacheAlias;
  } catch {
    return null;
  }
}

async function readMaterializationMarker(markerPath: string): Promise<CacheMaterializationMarker | null> {
  try {
    return JSON.parse(await readFile(markerPath, "utf8")) as CacheMaterializationMarker;
  } catch {
    return null;
  }
}

async function materializedTargetIsReusable(target: CacheMaterializeTarget): Promise<boolean> {
  if (!(await pathExists(target.to))) return false;
  for (const candidates of target.reuseRequiredPaths ?? []) {
    const hasCandidate = await Promise.any(
      candidates.map(async (candidate) => {
        if (!(await pathExists(join(target.to, candidate)))) throw new Error(candidate);
        return true;
      }),
    ).catch(() => false);
    if (!hasCandidate) return false;
  }
  return true;
}

export class ToolPackCache {
  readonly #entries: CacheAcquireReport[] = [];

  constructor(readonly root: string) {}

  report(): CacheReport {
    return {
      entries: [...this.#entries],
      root: this.root,
    };
  }

  async acquire<TMetadata>({
    aliases = [],
    materialize,
    node,
    seedFrom = [],
  }: {
    aliases?: string[];
    materialize: CacheMaterializeTarget[];
    node: CacheNode<TMetadata>;
    seedFrom?: CacheSeedSource[];
  }): Promise<CacheAcquireResult<TMetadata>> {
    const startedAt = Date.now();
    const keyHash = hashText(`${node.id}\n${node.key}`);
    const entryPath = join(this.root, "entries", safePathToken(node.id), keyHash);
    const manifestPath = join(entryPath, "manifest.json");
    const outputs = node.outputs.map(normalizeRelativePath);
    let status: CacheAcquireReport["status"] = "hit";
    let reason: string | null = null;

    const materialized: CacheAcquireReport["materialized"] = [];
    const copyFromEntry = async (
      sourceEntryPath: string,
      target: CacheMaterializeTarget,
      options: { markerKeyHash?: string },
    ): Promise<void> => {
      const normalizedFrom = normalizeRelativePath(target.from);
      const sourcePath = join(sourceEntryPath, target.from);
      await rm(target.to, { force: true, recursive: true });
      await mkdir(dirname(target.to), { recursive: true });
      await cp(sourcePath, target.to, { recursive: true });
      if (options.markerKeyHash != null) {
        const markerPath = join(this.root, "materialized", hashText(target.to), "marker.json");
        await mkdir(dirname(markerPath), { recursive: true });
        await writeFile(markerPath, `${JSON.stringify({
          from: normalizedFrom,
          keyHash: options.markerKeyHash,
          nodeId: node.id,
          schemaVersion: 1,
          to: target.to,
        } satisfies CacheMaterializationMarker, null, 2)}\n`, "utf8");
      }
    };
    const materializeTarget = async (target: CacheMaterializeTarget): Promise<void> => {
      const materializeStartedAt = Date.now();
      const normalizedFrom = normalizeRelativePath(target.from);
      if (target.reuse === true && await materializedTargetIsReusable(target)) {
        const markerPath = join(this.root, "materialized", hashText(target.to), "marker.json");
        const marker = await readMaterializationMarker(markerPath);
        if (
          marker?.schemaVersion === 1 &&
          marker.nodeId === node.id &&
          marker.keyHash === keyHash &&
          marker.from === normalizedFrom &&
          marker.to === target.to
        ) {
          materialized.push({
            durationMs: Date.now() - materializeStartedAt,
            from: normalizedFrom,
            skipped: true,
            to: target.to,
          });
          return;
        }
      }

      await copyFromEntry(entryPath, target, { markerKeyHash: keyHash });
      materialized.push({
        durationMs: Date.now() - materializeStartedAt,
        from: normalizedFrom,
        to: target.to,
      });
    };
    const aliasPathForKey = (aliasKey: string): string =>
      join(this.root, "aliases", safePathToken(node.id), hashText(`${node.id}\n${aliasKey}`).slice(0, 32), "alias.json");

    const seedFromAlias = async (source: CacheSeedSource): Promise<boolean> => {
      const alias = await readAlias(aliasPathForKey(source.aliasKey));
      if (alias == null || alias.schemaVersion !== CACHE_SCHEMA_VERSION || alias.nodeId !== node.id) return false;
      const manifest = await readManifest<TMetadata>(join(alias.entryPath, "manifest.json"));
      if (manifest == null) return false;
      if (manifest.schemaVersion !== CACHE_SCHEMA_VERSION || manifest.nodeId !== node.id || manifest.key !== alias.key) return false;
      const seedOutputs = manifest.outputs.map(normalizeRelativePath);
      if ((await assertOutputsExist(alias.entryPath, seedOutputs)) != null) return false;
      for (const target of source.materialize) {
        if ((await assertOutputsExist(alias.entryPath, [normalizeRelativePath(target.from)])) != null) return false;
      }
      if ((await node.invalidate({ entryRoot: alias.entryPath, manifest })) != null) return false;

      for (const target of source.materialize) {
        await copyFromEntry(alias.entryPath, target, {});
      }
      return true;
    };
    const manifest = await withDirectoryLock(join(this.root, "locks"), "global", async () => {
      await mkdir(dirname(entryPath), { recursive: true });
      const existingManifest = await readManifest<TMetadata>(manifestPath);
      const manifestMissing = existingManifest == null;
      const schemaInvalid = !manifestMissing && existingManifest.schemaVersion !== CACHE_SCHEMA_VERSION;
      const idInvalid = !manifestMissing && existingManifest.nodeId !== node.id;
      const keyInvalid = !manifestMissing && existingManifest.key !== node.key;
      const outputInvalid = existingManifest == null ? { reason: "missing manifest" } : await assertOutputsExist(entryPath, outputs);
      const customInvalid = existingManifest == null || schemaInvalid || idInvalid || keyInvalid || outputInvalid != null
        ? null
        : await node.invalidate({ entryRoot: entryPath, manifest: existingManifest });
      const invalidation = manifestMissing
        ? { reason: "missing manifest" }
        : schemaInvalid
          ? { reason: "schema mismatch" }
          : idInvalid
            ? { reason: "node id mismatch" }
            : keyInvalid
              ? { reason: "key mismatch" }
              : outputInvalid ?? customInvalid;

      const manifest = existingManifest != null && invalidation == null
        ? existingManifest
        : null;

      const nextManifest = manifest ?? await (async () => {
        status = existingManifest == null ? "miss" : "stale";
        reason = invalidation?.reason ?? "missing manifest";
        for (const seed of seedFrom) {
          if (await seedFromAlias(seed)) {
            reason = `${reason}; seeded from alias`;
            break;
          }
        }
        const stagingPath = join(dirname(entryPath), `${basename(entryPath).slice(0, 12)}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`);
        await rm(stagingPath, { force: true, recursive: true });
        await mkdir(stagingPath, { recursive: true });
        try {
          const payloadMetadata = await node.build({ entryRoot: stagingPath });
          const missingOutput = await assertOutputsExist(stagingPath, outputs);
          if (missingOutput != null) throw new Error(`cache node ${node.id} build did not produce ${missingOutput.reason}`);
          const builtManifest: CacheManifest<TMetadata> = {
            createdAt: new Date().toISOString(),
            key: node.key,
            nodeId: node.id,
            outputs,
            payloadMetadata,
            schemaVersion: CACHE_SCHEMA_VERSION,
          };
          await writeManifest(join(stagingPath, "manifest.json"), builtManifest);
          await rm(entryPath, { force: true, recursive: true });
          await rename(stagingPath, entryPath);
          for (const aliasKey of aliases) {
            const aliasPath = aliasPathForKey(aliasKey);
            await mkdir(dirname(aliasPath), { recursive: true });
            await writeFile(aliasPath, `${JSON.stringify({
              createdAt: new Date().toISOString(),
              entryPath,
              key: node.key,
              keyHash,
              nodeId: node.id,
              schemaVersion: CACHE_SCHEMA_VERSION,
            } satisfies CacheAlias, null, 2)}\n`, "utf8");
          }
          return builtManifest;
        } catch (error) {
          await rm(stagingPath, { force: true, recursive: true });
          throw error;
        }
      })();

      for (const target of materialize) {
        await materializeTarget(target);
      }

      return nextManifest;
    });

    this.#entries.push({
      durationMs: Date.now() - startedAt,
      entryPath,
      key: node.key,
      keyHash,
      materialized,
      nodeId: node.id,
      outputs,
      reason,
      status,
    });
    return { ...manifest, entryPath };
  }

  async readHit<TMetadata>({
    materialize,
    node,
  }: {
    materialize: CacheMaterializeTarget[];
    node: CacheNode<TMetadata>;
  }): Promise<CacheAcquireResult<TMetadata> | null> {
    const startedAt = Date.now();
    const keyHash = hashText(`${node.id}\n${node.key}`);
    const entryPath = join(this.root, "entries", safePathToken(node.id), keyHash);
    const manifestPath = join(entryPath, "manifest.json");
    const outputs = node.outputs.map(normalizeRelativePath);
    const materialized: CacheAcquireReport["materialized"] = [];
    const materializeTarget = async (target: CacheMaterializeTarget): Promise<void> => {
      const materializeStartedAt = Date.now();
      const normalizedFrom = normalizeRelativePath(target.from);
      const markerPath = join(this.root, "materialized", hashText(target.to), "marker.json");
      if (target.reuse === true && await materializedTargetIsReusable(target)) {
        const marker = await readMaterializationMarker(markerPath);
        if (
          marker?.schemaVersion === 1 &&
          marker.nodeId === node.id &&
          marker.keyHash === keyHash &&
          marker.from === normalizedFrom &&
          marker.to === target.to
        ) {
          materialized.push({
            durationMs: Date.now() - materializeStartedAt,
            from: normalizedFrom,
            skipped: true,
            to: target.to,
          });
          return;
        }
      }

      const sourcePath = join(entryPath, target.from);
      await rm(target.to, { force: true, recursive: true });
      await mkdir(dirname(target.to), { recursive: true });
      await cp(sourcePath, target.to, { recursive: true });
      await mkdir(dirname(markerPath), { recursive: true });
      await writeFile(markerPath, `${JSON.stringify({
        from: normalizedFrom,
        keyHash,
        nodeId: node.id,
        schemaVersion: 1,
        to: target.to,
      } satisfies CacheMaterializationMarker, null, 2)}\n`, "utf8");
      materialized.push({
        durationMs: Date.now() - materializeStartedAt,
        from: normalizedFrom,
        to: target.to,
      });
    };

    const manifest = await withDirectoryLock(join(this.root, "locks"), "global", async () => {
      const existingManifest = await readManifest<TMetadata>(manifestPath);
      if (existingManifest == null) return null;
      if (existingManifest.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
      if (existingManifest.nodeId !== node.id) return null;
      if (existingManifest.key !== node.key) return null;
      if ((await assertOutputsExist(entryPath, outputs)) != null) return null;
      if ((await node.invalidate({ entryRoot: entryPath, manifest: existingManifest })) != null) return null;

      for (const target of materialize) {
        await materializeTarget(target);
      }

      return existingManifest;
    });

    if (manifest == null) return null;
    this.#entries.push({
      durationMs: Date.now() - startedAt,
      entryPath,
      key: node.key,
      keyHash,
      materialized,
      nodeId: node.id,
      outputs,
      reason: null,
      status: "hit",
    });
    return { ...manifest, entryPath };
  }
}

export async function hashPath(
  path: string,
  options: { ignoreDirectoryNames?: readonly string[] } = {},
): Promise<string> {
  const hash = createHash("sha256");
  const ignoredDirectoryNames = new Set(options.ignoreDirectoryNames ?? ["node_modules"]);

  async function visit(current: string, root: string): Promise<void> {
    const metadata = await lstat(current);
    const relativePath = normalizeRelativePath(relative(root, current));
    hash.update(relativePath);
    if (metadata.isSymbolicLink()) {
      hash.update("symlink");
      hash.update(await readlink(current));
      return;
    }
    if (!metadata.isDirectory()) {
      hash.update("file");
      hash.update(await readFile(current));
      return;
    }
    hash.update("dir");
    const entries = (await readdir(current)).sort();
    for (const entry of entries) {
      if (ignoredDirectoryNames.has(entry)) continue;
      await visit(join(current, entry), root);
    }
  }

  await visit(path, dirname(path));
  return hash.digest("hex");
}

export function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}
