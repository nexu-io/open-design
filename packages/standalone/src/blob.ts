import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { managedDownload } from "@open-design/download";
import JSZip from "jszip";

import { canonicalJson, type StandaloneBlob, type StandaloneMaterialization } from "./protocol.js";
import type { StandaloneFeedbackEmitter } from "./feedback.js";

export type StandaloneBlobCandidate = Readonly<{
  path: string;
  source: "shell" | "seed";
}>;

export type StandaloneBlobOptions = Readonly<{
  candidates?: readonly StandaloneBlobCandidate[];
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  feedback?: StandaloneFeedbackEmitter;
  resourceId?: string;
}>;

export type StandaloneBlobResult = Readonly<{
  path: string;
  reused: boolean;
  source: "cas" | "shell" | "seed" | "remote";
}>;

type TreeEntry = Readonly<{ path: string; sha256: string; size: number }>;

function under(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !value.startsWith(sep));
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveStream, rejectStream) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectStream);
    stream.on("end", resolveStream);
  });
  return hash.digest("hex");
}

async function validBlob(path: string, blob: StandaloneBlob): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size === blob.size && await fileSha256(path) === blob.sha256;
  } catch {
    return false;
  }
}

export async function discardStandaloneStoreEntry(root: string, sourcePath: string): Promise<string | null> {
  const normalizedRoot = resolve(root);
  const source = resolve(sourcePath);
  const trashRoot = join(normalizedRoot, "trash");
  if (!under(normalizedRoot, source) || source === normalizedRoot || under(trashRoot, source)) {
    throw new Error(`Standalone discard path is outside the live Store: ${source}`);
  }
  await mkdir(trashRoot, { recursive: true });
  const target = join(trashRoot, randomUUID());
  try {
    await rename(source, target);
    return target;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function promoteCandidate(root: string, candidate: string, destination: string, blob: StandaloneBlob): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const stageRoot = join(root, "staging");
  await mkdir(stageRoot, { recursive: true });
  const stage = join(stageRoot, `${blob.sha256}.${randomUUID()}.blob`);
  try {
    await copyFile(candidate, stage);
    if (!await validBlob(stage, blob)) throw new Error(`blob candidate failed verification: ${blob.sha256}`);
    try {
      await rename(stage, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    await rm(stage, { force: true }).catch(() => undefined);
  }
  if (!await validBlob(destination, blob)) throw new Error(`promoted blob failed verification: ${blob.sha256}`);
}

export async function ensureStandaloneBlob(root: string, blob: StandaloneBlob, options: StandaloneBlobOptions = {}): Promise<StandaloneBlobResult> {
  const destination = join(root, "blobs", "sha256", blob.sha256);
  const event = (state: "begin" | "progress" | "reused" | "complete" | "failed", extra: Record<string, unknown> = {}) => {
    options.feedback?.emit({ phase: "blob-resolution", state, resourceId: options.resourceId, blobSha256: blob.sha256, totalBytes: blob.size, ...extra });
  };
  event("begin");
  if (await validBlob(destination, blob)) {
    event("reused", { source: "cas" });
    return { path: destination, reused: true, source: "cas" };
  }
  if (await stat(destination).catch(() => null) != null) await discardStandaloneStoreEntry(root, destination);

  for (const candidate of options.candidates ?? []) {
    if (!await validBlob(candidate.path, blob)) continue;
    await promoteCandidate(root, candidate.path, destination, blob);
    event("complete", { source: candidate.source });
    return { path: destination, reused: false, source: candidate.source };
  }

  let lastError: unknown;
  for (const source of blob.sources) {
    try {
      const downloaded = await managedDownload({
        basePath: join(root, "downloads"),
        bucket: "sha256",
        fileName: blob.sha256,
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
        ...(options.signal == null ? {} : { signal: options.signal }),
        payload: { checksum: { algorithm: "sha256", value: blob.sha256 }, url: source.url },
        onProgress: (progress) => options.feedback?.emit({
          phase: "blob-download",
          state: "progress",
          resourceId: options.resourceId,
          blobSha256: blob.sha256,
          source: "remote",
          receivedBytes: progress.receivedBytes,
          totalBytes: progress.totalBytes ?? blob.size,
        }),
      });
      await promoteCandidate(root, downloaded.path, destination, blob);
      event("complete", { source: "remote" });
      return { path: destination, reused: false, source: "remote" };
    } catch (error) {
      lastError = error;
    }
  }
  event("failed", { error: { code: "resource-unavailable", message: lastError instanceof Error ? lastError.message : "blob has no usable source" } });
  throw lastError instanceof Error ? lastError : new Error(`blob is unavailable: ${blob.sha256}`);
}

export function standaloneTreeSha256(entries: readonly TreeEntry[]): string {
  return createHash("sha256").update(canonicalJson([...entries].sort((left, right) => left.path.localeCompare(right.path)))).digest("hex");
}

async function inventory(root: string, current = root): Promise<TreeEntry[]> {
  const result: TreeEntry[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("materialized resource contains a symbolic link");
    if (entry.isDirectory()) result.push(...await inventory(root, path));
    else if (entry.isFile()) {
      const info = await stat(path);
      result.push({ path: relative(root, path).split(sep).join("/"), sha256: await fileSha256(path), size: info.size });
    } else throw new Error("materialized resource contains an unsupported entry");
  }
  return result;
}

export async function materializeStandaloneBlob(
  root: string,
  blob: StandaloneBlob,
  blobPath: string,
  materialization: StandaloneMaterialization,
  options: Pick<StandaloneBlobOptions, "feedback" | "resourceId"> = {},
): Promise<Readonly<{ path: string; entrypoint: string; reused: boolean }>> {
  if (materialization.type === "file") return { path: blobPath, entrypoint: blobPath, reused: true };
  const key = createHash("sha256").update(canonicalJson({ blob: blob.sha256, materialization })).digest("hex");
  const destination = join(root, "materialized", key);
  const resolvedEntrypoint = join(destination, materialization.entrypoint);
  const verifyTree = async () => {
    try {
      return standaloneTreeSha256(await inventory(destination)) === materialization.treeSha256
        && (await stat(resolvedEntrypoint)).isFile();
    } catch {
      return false;
    }
  };
  options.feedback?.emit({ phase: "blob-materialization", state: "begin", resourceId: options.resourceId, blobSha256: blob.sha256 });
  if (await verifyTree()) {
    options.feedback?.emit({ phase: "blob-materialization", state: "reused", resourceId: options.resourceId, blobSha256: blob.sha256 });
    return { path: destination, entrypoint: resolvedEntrypoint, reused: true };
  }
  if (await stat(destination).catch(() => null) != null) await discardStandaloneStoreEntry(root, destination);
  const stage = join(root, "staging", `${key}.${randomUUID()}.tree`);
  await mkdir(stage, { recursive: true });
  try {
    const archive = await JSZip.loadAsync(await readFile(blobPath));
    for (const [name, entry] of Object.entries(archive.files).sort(([left], [right]) => left.localeCompare(right))) {
      if (name.startsWith("/") || name.startsWith("\\") || name.split(/[\\/]/).includes("..")) throw new Error(`unsafe zip entry: ${name}`);
      const permissions = typeof entry.unixPermissions === "string" ? Number.parseInt(entry.unixPermissions, 8) : entry.unixPermissions;
      if (permissions != null && (permissions & 0o170000) === 0o120000) throw new Error(`zip symbolic link is unsupported: ${name}`);
      const target = join(stage, name);
      if (!under(stage, target)) throw new Error(`zip entry escaped materialization root: ${name}`);
      if (entry.dir) await mkdir(target, { recursive: true });
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, await entry.async("uint8array"), { flag: "wx" });
      }
    }
    if (standaloneTreeSha256(await inventory(stage)) !== materialization.treeSha256) throw new Error(`materialized tree failed verification: ${options.resourceId ?? blob.sha256}`);
    await mkdir(dirname(destination), { recursive: true });
    await rename(stage, destination);
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
  if (!await verifyTree()) throw new Error(`installed materialized tree failed verification: ${options.resourceId ?? blob.sha256}`);
  options.feedback?.emit({ phase: "blob-materialization", state: "complete", resourceId: options.resourceId, blobSha256: blob.sha256 });
  return { path: destination, entrypoint: resolvedEntrypoint, reused: false };
}

export async function cleanupStandaloneTrash(root: string, options: Readonly<{ maxDurationMs?: number; maxEntries?: number }> = {}): Promise<Readonly<{ attempted: number; removed: number; remaining: number }>> {
  const trashRoot = join(root, "trash");
  const started = Date.now();
  const maxDurationMs = options.maxDurationMs ?? 250;
  const maxEntries = options.maxEntries ?? 16;
  const entries = await readdir(trashRoot).catch(() => []);
  let attempted = 0;
  let removed = 0;
  for (const entry of entries) {
    if (attempted >= maxEntries || Date.now() - started >= maxDurationMs) break;
    attempted += 1;
    try {
      await rm(join(trashRoot, entry), { recursive: true, force: true });
      removed += 1;
    } catch {
      // A later bounded pass retries failures.
    }
  }
  return { attempted, removed, remaining: (await readdir(trashRoot).catch(() => [])).length };
}
