import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  createClosureComponentTreeDigest,
  type ClosureComponentTreeFile,
  type ClosureDigest,
  type ClosureShellCompatibility,
} from "@open-design/closure-proto";
import type { ReleaseChannel } from "@open-design/release";

import {
  createClosureDistributionSharedContribution,
  createClosureDistributionTargetContribution,
  type ClosureDistributionSharedContribution,
  type ClosureDistributionTargetContribution,
} from "./closure-distribution.js";
import {
  resolveClosureArchiveInvocation,
  type ClosureArchiveInvocation,
  type ClosurePlatformTarget,
} from "./closure-platform.js";

export const CLOSURE_COMPONENT_MEDIA_TYPE = "application/zip" as const;

export type ClosureComponentArchiveRunner = (
  invocation: ClosureArchiveInvocation,
  cwd: string,
) => Promise<void>;

export type ClosureComponentArchive = Readonly<{
  fileCount: number;
  mediaType: typeof CLOSURE_COMPONENT_MEDIA_TYPE;
  path: string;
  treeDigest: ClosureDigest;
}>;

export type ClosureComponentEntrypointArchive = ClosureComponentArchive & Readonly<{
  entryPath: string;
}>;

export type ClosureSharedResourceRoot = Readonly<{
  id: string;
  root: string;
  title: string;
}>;

function runArchive(invocation: ClosureArchiveInvocation, cwd: string): Promise<void> {
  return new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(invocation.command, [...invocation.args], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveRun();
        return;
      }
      rejectRun(new Error(
        `${invocation.command} failed with ${signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`}${
          stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`
        }`,
      ));
    });
  });
}

function safeEntrySegments(value: string): string[] {
  const segments = value.split("/");
  if (
    value.length === 0
    || value.startsWith("/")
    || value.includes("\\")
    || value.includes("\0")
    || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Closure component entry must be a safe relative POSIX path: ${value}`);
  }
  return segments;
}

function assertOutputOutsideSource(sourceRoot: string, outputPath: string): void {
  const relation = relative(sourceRoot, outputPath);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) {
    throw new Error("Closure component archive output must be outside its source root");
  }
}

async function digestFile(path: string): Promise<ClosureDigest> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return `sha256:${hash.digest("hex")}`;
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

async function inspectComponentTree(
  root: string,
  current = root,
): Promise<ClosureComponentTreeFile[]> {
  const metadata = await lstat(current).catch(() => null);
  if (metadata == null || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`Closure component source must be a regular directory: ${root}`);
  }
  const files: ClosureComponentTreeFile[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const entryPath = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Closure component source must not contain symlinks: ${relative(root, entryPath)}`);
    }
    if (entry.isDirectory()) {
      files.push(...await inspectComponentTree(root, entryPath));
    } else if (entry.isFile()) {
      const file = await stat(entryPath);
      files.push({
        digest: await digestFile(entryPath),
        path: toPosixPath(relative(root, entryPath)),
        size: file.size,
      });
    } else {
      throw new Error(`Closure component source contains an unsupported entry: ${relative(root, entryPath)}`);
    }
  }
  return files;
}

/** Archive one already-prepared component root without interpreting its body. */
export async function archiveClosureComponent(options: Readonly<{
  entryPath?: string;
  outputPath: string;
  run?: ClosureComponentArchiveRunner;
  sourceRoot: string;
  target: ClosurePlatformTarget;
}>): Promise<ClosureComponentArchive | ClosureComponentEntrypointArchive> {
  const sourceRoot = resolve(options.sourceRoot);
  const outputPath = resolve(options.outputPath);
  assertOutputOutsideSource(sourceRoot, outputPath);
  const files = (await inspectComponentTree(sourceRoot)).sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ));
  const fileCount = files.length;
  if (fileCount === 0) throw new Error(`Closure component source is empty: ${sourceRoot}`);
  if (options.entryPath != null) {
    const entryPath = join(sourceRoot, ...safeEntrySegments(options.entryPath));
    const entry = await lstat(entryPath).catch(() => null);
    if (entry == null || entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Closure component entry is missing: ${options.entryPath}`);
    }
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  const invocation = resolveClosureArchiveInvocation({ artifactPath: outputPath, target: options.target });
  await (options.run ?? runArchive)(invocation, sourceRoot);
  const archive = await stat(outputPath).catch(() => null);
  if (archive == null || !archive.isFile() || archive.size <= 0) {
    throw new Error(`Closure component archive was not produced: ${outputPath}`);
  }
  const result = {
    fileCount,
    mediaType: CLOSURE_COMPONENT_MEDIA_TYPE,
    path: outputPath,
    treeDigest: createClosureComponentTreeDigest(files, (canonical) => (
      `sha256:${createHash("sha256").update(canonical).digest("hex")}`
    )),
  } as const;
  return options.entryPath == null ? result : { ...result, entryPath: options.entryPath };
}

function normalizeResourceId(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)) {
    throw new Error(`Closure resource id must be a lowercase protocol token: ${value}`);
  }
  return value;
}

/** Build shared archives once and immediately seal their reusable contribution. */
export async function buildClosureDistributionSharedContribution(options: Readonly<{
  archiveTarget: ClosurePlatformTarget;
  blobOrigin: string;
  bodyRoot: string;
  channel: ReleaseChannel;
  launcherRoot: string;
  outputRoot: string;
  resources: readonly ClosureSharedResourceRoot[];
  run?: ClosureComponentArchiveRunner;
  shellCompatibility: ClosureShellCompatibility;
  version: string;
}>): Promise<ClosureDistributionSharedContribution> {
  const outputRoot = resolve(options.outputRoot);
  const body = await archiveClosureComponent({
    entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
    outputPath: join(outputRoot, "shared", "body.zip"),
    run: options.run,
    sourceRoot: options.bodyRoot,
    target: options.archiveTarget,
  }) as ClosureComponentEntrypointArchive;
  const launcher = await archiveClosureComponent({
    entryPath: CLOSURE_LAUNCHER_ENTRY_PATH,
    outputPath: join(outputRoot, "shared", "launcher.zip"),
    run: options.run,
    sourceRoot: options.launcherRoot,
    target: options.archiveTarget,
  }) as ClosureComponentEntrypointArchive;
  const resources = [];
  const resourceIds = new Set<string>();
  for (const resource of options.resources) {
    const id = normalizeResourceId(resource.id);
    if (resourceIds.has(id)) throw new Error(`duplicate Closure resource id: ${id}`);
    resourceIds.add(id);
    const archive = await archiveClosureComponent({
      outputPath: join(outputRoot, "shared", "resources", `${id}.zip`),
      run: options.run,
      sourceRoot: resource.root,
      target: options.archiveTarget,
    });
    resources.push({ ...archive, id, title: resource.title });
  }
  return await createClosureDistributionSharedContribution({
    blobOrigin: options.blobOrigin,
    body,
    channel: options.channel,
    launcher,
    resources,
    shellCompatibility: options.shellCompatibility,
    version: options.version,
  });
}

/** Build only one platform's runtime/native archives and seal its contribution. */
export async function buildClosureDistributionTargetContribution(options: Readonly<{
  blobOrigin: string;
  channel: ReleaseChannel;
  nativeRoot: string;
  outputRoot: string;
  run?: ClosureComponentArchiveRunner;
  runtimeEntryPath: string;
  runtimeRoot: string;
  target: ClosurePlatformTarget;
  version: string;
}>): Promise<ClosureDistributionTargetContribution> {
  const outputRoot = resolve(options.outputRoot);
  const runtime = await archiveClosureComponent({
    entryPath: options.runtimeEntryPath,
    outputPath: join(outputRoot, "targets", options.target, "runtime.zip"),
    run: options.run,
    sourceRoot: options.runtimeRoot,
    target: options.target,
  }) as ClosureComponentEntrypointArchive;
  const native = await archiveClosureComponent({
    outputPath: join(outputRoot, "targets", options.target, "native.zip"),
    run: options.run,
    sourceRoot: options.nativeRoot,
    target: options.target,
  });
  return await createClosureDistributionTargetContribution({
    blobOrigin: options.blobOrigin,
    channel: options.channel,
    native,
    runtime,
    target: options.target,
    version: options.version,
  });
}
