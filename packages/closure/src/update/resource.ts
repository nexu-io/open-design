import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createClosureComponentTreeDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
} from "../protocol/index.js";
import {
  discardClosureStoreEntry,
  planClosureDistributionGeneration,
  verifyClosureDistributionBlob,
  type ClosureStorePaths,
} from "../store/index.js";
import { downloadCopyAndClear } from "@open-design/download";
import extractZip from "extract-zip";

import type { ClosureResourceRepositoryConfig } from "./index.js";
import { ClosureUpdateError } from "./errors.js";

export type ClosureBlobEnsureProgress =
  | Readonly<{ phase: "checking" | "verifying" | "ready" }>
  | Readonly<{ completedBytes: number; phase: "copying" | "downloading"; totalBytes: number }>;

export type ClosureResourceEnsureProgress =
  | Readonly<{ phase: "checking" | "materializing" | "verifying" | "ready" }>
  | Readonly<{
      completedBytes: number;
      phase: "copying" | "downloading";
      totalBytes: number;
    }>;

function report<T>(observer: ((progress: T) => void) | undefined, progress: T): void {
  try {
    observer?.(Object.freeze(progress));
  } catch {
    // Resource progress is presentation-only and cannot change Store policy.
  }
}

function errorCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

async function cloneOrCopy(source: string, destination: string): Promise<void> {
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
  } catch {
    await rm(destination, { force: true });
    await copyFile(source, destination);
  }
}

export async function ensureDistributionBlob(input: Readonly<{
  artifact: ClosureDistributionBlob;
  fetchImpl: typeof globalThis.fetch;
  onProgress?: (progress: ClosureBlobEnsureProgress) => void;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}>): Promise<string> {
  if (input.artifact.mediaType !== "application/zip") {
    throw new ClosureUpdateError(
      `unsupported Closure distribution blob media type: ${input.artifact.mediaType}`,
    );
  }
  report(input.onProgress, { phase: "checking" });
  try {
    const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
    report(input.onProgress, { phase: "ready" });
    return verified;
  } catch {
    const digest = input.artifact.digest.slice("sha256:".length);
    const outputPath = join(input.paths.blobsRoot, digest);
    const accept = async (candidatePath: string): Promise<string> => {
      report(input.onProgress, { phase: "verifying" });
      const metadata = await stat(candidatePath);
      if (metadata.size !== input.artifact.size) {
        throw new ClosureUpdateError("Closure blob candidate size mismatch");
      }
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(candidatePath)) hash.update(chunk as Buffer);
      if (`sha256:${hash.digest("hex")}` !== input.artifact.digest) {
        throw new ClosureUpdateError("Closure blob candidate digest mismatch");
      }
      await mkdir(input.paths.blobsRoot, { recursive: true });
      try {
        await rename(candidatePath, outputPath);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode(error) ?? "")) throw error;
        try {
          const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
          report(input.onProgress, { phase: "ready" });
          return verified;
        } catch {
          await rm(outputPath, { force: true });
          await rename(candidatePath, outputPath);
        }
      }
      const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
      report(input.onProgress, { phase: "ready" });
      return verified;
    };
    const candidatePath = () => join(
      input.paths.stagingRoot,
      "blob-downloads",
      `${digest}-${randomUUID()}.zip`,
    );

    for (const seed of input.repository?.localSeeds ?? []) {
      const temporaryPath = candidatePath();
      try {
        await mkdir(dirname(temporaryPath), { recursive: true });
        const sourcePath = join(seed.root, input.paths.channel, "blobs", digest);
        const sourceMetadata = await stat(sourcePath);
        if (!sourceMetadata.isFile() || sourceMetadata.size !== input.artifact.size) {
          throw new ClosureUpdateError("Closure local seed blob size mismatch");
        }
        report(input.onProgress, {
          completedBytes: 0,
          phase: "copying",
          totalBytes: input.artifact.size,
        });
        await cloneOrCopy(sourcePath, temporaryPath);
        report(input.onProgress, {
          completedBytes: input.artifact.size,
          phase: "copying",
          totalBytes: input.artifact.size,
        });
        return await accept(temporaryPath);
      } catch {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }

    const artifactPath = new URL(input.artifact.url).pathname.replace(/^\/+/, "");
    const configuredUrls = (input.repository?.remoteOrigins ?? []).map((origin) => {
      const base = new URL(origin);
      if (!base.pathname.endsWith("/")) base.pathname += "/";
      return new URL(artifactPath, base).toString();
    });
    const urls = [...new Set([...configuredUrls, input.artifact.url])];
    let lastError: unknown = null;
    for (const url of urls) {
      const temporaryPath = candidatePath();
      try {
        report(input.onProgress, {
          completedBytes: 0,
          phase: "downloading",
          totalBytes: input.artifact.size,
        });
        await downloadCopyAndClear({
          basePath: join(input.paths.stagingRoot, "downloads"),
          bucket: "closure-blobs",
          fetch: input.fetchImpl,
          fileName: `${digest}.zip`,
          outputPath: temporaryPath,
          onProgress(progress) {
            report(input.onProgress, {
              completedBytes: Math.min(progress.receivedBytes, input.artifact.size),
              phase: "downloading",
              totalBytes: input.artifact.size,
            });
          },
          payload: {
            checksum: { algorithm: "sha256", value: digest },
            url,
          },
        });
        return await accept(temporaryPath);
      } catch (error) {
        lastError = error;
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
    throw new ClosureUpdateError(`Closure blob is unavailable from every configured source${detail}`, {
      cause: lastError,
    });
  }
}

export async function ensureClosureDistributionBlob(input: Readonly<{
  artifact: ClosureDistributionBlob;
  fetch?: typeof globalThis.fetch;
  onProgress?: (progress: ClosureBlobEnsureProgress) => void;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}>): Promise<string> {
  return await ensureDistributionBlob({
    artifact: input.artifact,
    fetchImpl: input.fetch ?? globalThis.fetch,
    ...(input.onProgress == null ? {} : { onProgress: input.onProgress }),
    paths: input.paths,
    ...(input.repository == null ? {} : { repository: input.repository }),
  });
}

async function inspectResourceFiles(root: string, current = root): Promise<Array<{
  digest: `sha256:${string}`;
  path: string;
  size: number;
}>> {
  const files: Array<{ digest: `sha256:${string}`; path: string; size: number }> = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new ClosureUpdateError("Closure resource must not contain symlinks");
    if (entry.isDirectory()) files.push(...await inspectResourceFiles(root, path));
    else if (entry.isFile()) {
      const metadata = await stat(path);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
      files.push({
        digest: `sha256:${hash.digest("hex")}`,
        path: path.slice(root.length + 1).split("\\").join("/"),
        size: metadata.size,
      });
    } else throw new ClosureUpdateError("Closure resource contains an unsupported entry");
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function verifyResourceRoot(root: string, expected: `sha256:${string}`): Promise<void> {
  const files = await inspectResourceFiles(root);
  if (files.length === 0) throw new ClosureUpdateError("Closure resource is empty");
  const actual = createClosureComponentTreeDigest(files, (canonical) => (
    `sha256:${createHash("sha256").update(canonical).digest("hex")}`
  ));
  if (actual !== expected) throw new ClosureUpdateError("Closure resource tree does not match its manifest");
}

export async function ensureClosureResource(input: Readonly<{
  fetch?: typeof globalThis.fetch;
  id: string;
  manifest: ClosureDistributionManifest;
  onProgress?: (progress: ClosureResourceEnsureProgress) => void;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
  target: string;
}>): Promise<Readonly<{ id: string; path: string; reused: boolean; title: string }>> {
  const plan = planClosureDistributionGeneration(input.paths, 0, input.manifest, input.target);
  const resource = plan.resources.find((entry) => entry.id === input.id);
  if (resource == null) throw new ClosureUpdateError(`Closure resource is not locked by this version: ${input.id}`);
  report(input.onProgress, { phase: "checking" });
  try {
    await verifyResourceRoot(resource.resourceRoot, resource.treeDigest);
    report(input.onProgress, { phase: "ready" });
    return Object.freeze({ id: resource.id, path: resource.resourceRoot, reused: true, title: resource.title });
  } catch {
    // Continue through the same repository resolver as required components.
  }
  const blobPath = await ensureClosureDistributionBlob({
    artifact: resource.artifact,
    ...(input.fetch == null ? {} : { fetch: input.fetch }),
    ...(input.onProgress == null ? {} : {
      onProgress(progress) {
        if (progress.phase === "copying" || progress.phase === "downloading") {
          report(input.onProgress, progress);
        } else if (progress.phase === "verifying") {
          report(input.onProgress, { phase: "verifying" });
        }
      },
    }),
    paths: input.paths,
    ...(input.repository == null ? {} : { repository: input.repository }),
  });
  const stageRoot = join(input.paths.stagingRoot, `resource-${resource.id}-${randomUUID()}`);
  try {
    report(input.onProgress, { phase: "materializing" });
    await mkdir(stageRoot, { recursive: true });
    await extractZip(blobPath, { dir: stageRoot });
    report(input.onProgress, { phase: "verifying" });
    await verifyResourceRoot(stageRoot, resource.treeDigest);
    await mkdir(dirname(resource.resourceRoot), { recursive: true });
    try {
      await verifyResourceRoot(resource.resourceRoot, resource.treeDigest);
      report(input.onProgress, { phase: "ready" });
      return Object.freeze({ id: resource.id, path: resource.resourceRoot, reused: true, title: resource.title });
    } catch {
      // The existing root is still absent or damaged; replace it transactionally.
    }
    await discardClosureStoreEntry({
      paths: input.paths,
      sourcePath: resource.resourceRoot,
    });
    try {
      await rename(stageRoot, resource.resourceRoot);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode(error) ?? "")) throw error;
      await verifyResourceRoot(resource.resourceRoot, resource.treeDigest);
    }
    report(input.onProgress, { phase: "ready" });
    return Object.freeze({ id: resource.id, path: resource.resourceRoot, reused: false, title: resource.title });
  } finally {
    await rm(stageRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}
