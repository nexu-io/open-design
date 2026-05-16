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
  materialized: Array<{ from: string; to: string }>;
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
    materialize,
    node,
  }: {
    materialize: CacheMaterializeTarget[];
    node: CacheNode<TMetadata>;
  }): Promise<CacheAcquireResult<TMetadata>> {
    const startedAt = Date.now();
    const keyHash = hashText(`${node.id}\n${node.key}`);
    const entryPath = join(this.root, "entries", safePathToken(node.id), keyHash);
    const manifestPath = join(entryPath, "manifest.json");
    const outputs = node.outputs.map(normalizeRelativePath);
    let status: CacheAcquireReport["status"] = "hit";
    let reason: string | null = null;

    const materialized: CacheAcquireReport["materialized"] = [];
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
          return builtManifest;
        } catch (error) {
          await rm(stagingPath, { force: true, recursive: true });
          throw error;
        }
      })();

      for (const target of materialize) {
        const sourcePath = join(entryPath, target.from);
        await rm(target.to, { force: true, recursive: true });
        await mkdir(dirname(target.to), { recursive: true });
        await cp(sourcePath, target.to, { recursive: true });
        materialized.push({ from: normalizeRelativePath(target.from), to: target.to });
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

    const manifest = await withDirectoryLock(join(this.root, "locks"), "global", async () => {
      const existingManifest = await readManifest<TMetadata>(manifestPath);
      if (existingManifest == null) return null;
      if (existingManifest.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
      if (existingManifest.nodeId !== node.id) return null;
      if (existingManifest.key !== node.key) return null;
      if ((await assertOutputsExist(entryPath, outputs)) != null) return null;
      if ((await node.invalidate({ entryRoot: entryPath, manifest: existingManifest })) != null) return null;

      for (const target of materialize) {
        const sourcePath = join(entryPath, target.from);
        await rm(target.to, { force: true, recursive: true });
        await mkdir(dirname(target.to), { recursive: true });
        await cp(sourcePath, target.to, { recursive: true });
        materialized.push({ from: normalizeRelativePath(target.from), to: target.to });
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
