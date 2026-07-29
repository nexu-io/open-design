import { createHash, type Hash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export type ToolBuildMetadataPolicy = {
  buildCommand: string;
  distEntries: string[];
  inputs: string[];
  packageName: string;
  toolName: string;
};

export type ToolBuildMetadataResult = {
  hash: string;
  metadataPath: string;
};

type ToolBuildMetadataFile = {
  build?: {
    hash?: unknown;
  };
};

const toolBuildMetadataPolicySchema = z.object({
  buildCommand: z.string().min(1),
  distEntries: z.array(z.string().min(1)).min(1),
  inputs: z.array(z.string().min(1)).min(1),
  packageName: z.string().min(1),
  toolName: z.string().min(1),
}).strict();

function resolveMetadataPath(toolRoot: string): string {
  return join(toolRoot, "dist", "metadata.json");
}

export async function readToolMeta(toolRoot: string): Promise<ToolBuildMetadataPolicy> {
  const metaPath = join(toolRoot, "meta.json");
  return toolBuildMetadataPolicySchema.parse(JSON.parse(await readFile(metaPath, "utf8")));
}

export async function writeToolBuildMetadataFromMeta(toolRoot: string): Promise<ToolBuildMetadataResult> {
  return writeToolBuildMetadata(await readToolMeta(toolRoot), toolRoot);
}

export async function assertFreshToolBuildFromMeta(toolRoot: string): Promise<ToolBuildMetadataResult> {
  return assertFreshToolBuild(await readToolMeta(toolRoot), toolRoot);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function hashPath(hash: Hash, root: string, relativePath: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  const metadata = await lstat(absolutePath);
  const normalizedPath = relativePath.split("\\").join("/");
  if (metadata.isDirectory()) {
    hash.update(`dir:${normalizedPath}\n`);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await hashPath(hash, root, join(relativePath, entry.name));
    }
    return;
  }
  if (metadata.isSymbolicLink()) {
    hash.update(`symlink:${normalizedPath}\n`);
    return;
  }
  hash.update(`file:${normalizedPath}\n`);
  hash.update(await readFile(absolutePath));
}

export async function computeToolSourceHash(
  policy: ToolBuildMetadataPolicy,
  toolRoot: string,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`tool:${policy.toolName}\n`);
  hash.update(`package:${policy.packageName}\n`);
  for (const relativePath of policy.inputs) {
    if (!(await pathExists(join(toolRoot, relativePath)))) {
      throw new Error(`[${policy.toolName}] required build input missing: ${join(toolRoot, relativePath)}`);
    }
    await hashPath(hash, toolRoot, relativePath);
  }
  return hash.digest("hex");
}

export async function writeToolBuildMetadata(
  policy: ToolBuildMetadataPolicy,
  toolRoot: string,
): Promise<ToolBuildMetadataResult> {
  const hash = await computeToolSourceHash(policy, toolRoot);
  const metadataPath = resolveMetadataPath(toolRoot);
  await mkdir(resolve(toolRoot, "dist"), { recursive: true });
  await writeFile(
    metadataPath,
    `${JSON.stringify({ build: { hash } }, null, 2)}\n`,
    "utf8",
  );
  return { hash, metadataPath };
}

async function readToolBuildMetadata(toolRoot: string): Promise<{
  metadata: ToolBuildMetadataFile | null;
  metadataPath: string;
}> {
  const metadataPath = resolveMetadataPath(toolRoot);
  try {
    return {
      metadata: JSON.parse(await readFile(metadataPath, "utf8")) as ToolBuildMetadataFile,
      metadataPath,
    };
  } catch {
    return { metadata: null, metadataPath };
  }
}

function createBuildRequiredError(policy: ToolBuildMetadataPolicy, toolRoot: string, reason: string): Error {
  return new Error(
    `[${policy.toolName}] ${reason} Run "${policy.buildCommand}" first.\n` +
    `tool root: ${toolRoot}\n` +
    `metadata: ${resolveMetadataPath(toolRoot)}`,
  );
}

export async function assertFreshToolBuild(
  policy: ToolBuildMetadataPolicy,
  toolRoot: string,
): Promise<ToolBuildMetadataResult> {
  const missingDistEntries: string[] = [];
  for (const distEntry of policy.distEntries) {
    const absolutePath = join(toolRoot, distEntry);
    if (!(await pathExists(absolutePath))) {
      missingDistEntries.push(absolutePath);
    }
  }
  if (missingDistEntries.length > 0) {
    throw createBuildRequiredError(
      policy,
      toolRoot,
      `dist entries not found: ${missingDistEntries.join(", ")}.`,
    );
  }

  const { metadata, metadataPath } = await readToolBuildMetadata(toolRoot);
  if (typeof metadata?.build?.hash !== "string" || metadata.build.hash.length === 0) {
    throw createBuildRequiredError(
      policy,
      toolRoot,
      `build metadata missing or invalid at ${metadataPath}.`,
    );
  }

  const sourceHash = await computeToolSourceHash(policy, toolRoot);
  if (metadata.build.hash !== sourceHash) {
    throw createBuildRequiredError(
      policy,
      toolRoot,
      `dist build metadata hash mismatch.\nexpected: ${metadata.build.hash}\ncurrent: ${sourceHash}`,
    );
  }

  return {
    hash: sourceHash,
    metadataPath,
  };
}
