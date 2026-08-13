import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  validateClosureCandidateManifest,
  validateClosureFileInventory,
  type ClosureCandidateManifest,
  type ClosureFileInventory,
} from "@open-design/closure/protocol";
import { isReleaseChannel, parseReleaseVersion, type ReleaseChannel } from "@open-design/release";

import { hashJson, hashPath, ToolPackCache, type CacheInvalidation } from "./cache.js";
import { WORKSPACE_ROOT } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";
import { resolveShellDepsDigestFromWorkspace } from "./workspace-build.js";
import { copyBundledResourceTrees } from "./resources.js";
import {
  BUNDLED_RESOURCE_GROUPS,
  copyBundledResourceGroup,
} from "./resources.js";
import {
  buildClosureDistributionSharedContribution,
  buildClosureDistributionTargetContribution,
  prepareClosureLauncherComponent,
  probeClosureNativeModules,
  type ClosureSharedResourceRoot,
} from "./closure-components.js";
import type {
  ClosureDistributionSharedContribution,
  ClosureDistributionTargetContribution,
} from "./closure-distribution.js";
import {
  CLOSURE_PLATFORM_TARGETS,
  normalizeClosurePlatformTarget,
  resolveClosureArchiveInvocation,
  type ClosurePlatformTarget,
} from "./closure-platform.js";
import {
  CLOSURE_DAEMON_EXTERNALS,
  CLOSURE_INTERNAL_PACKAGES,
  CLOSURE_NODE_NATIVE_MODULES,
  assertNativeBuildHost,
  buildClosureDistributionWorkspace,
  buildClosureWorkspace,
  packClosureWorkspaceTarballs,
  pruneClosureNativeRuntime,
  resolveClosureRuntimeDependencies,
  resolveNodeNpmCliPath,
  runClosureBuildCommand,
  runClosurePnpm,
} from "./closure-build-runtime.js";
import {
  buildClosurePrebundles,
  copyClosureWebRuntime,
} from "./closure-prebundle.js";
import {
  standaloneBodySource,
  standaloneBootloaderSource,
  standaloneInnerBootloaderSource,
} from "./closure-runtime-source.js";

export {
  CLOSURE_PLATFORM_TARGETS,
  normalizeClosurePlatformTarget,
  resolveClosureArchiveInvocation,
  type ClosureArchiveInvocation,
  type ClosurePlatformTarget,
} from "./closure-platform.js";
export { materializeClosureWebPublicHoist } from "./closure-prebundle.js";
export {
  standaloneBodySource,
  standaloneBootloaderSource,
  standaloneInnerBootloaderSource,
} from "./closure-runtime-source.js";
export {
  CLOSURE_DAEMON_EXTERNALS,
  CLOSURE_INTERNAL_PACKAGES,
  CLOSURE_NODE_NATIVE_MODULES,
  pruneClosureNativeRuntime,
  resolveClosureRuntimeDependencies,
} from "./closure-build-runtime.js";
export type ClosureBuildOptions = {
  artifactUrl: string;
  cacheDir?: string;
  channel: string;
  dir?: string;
  minShellVersion: string;
  platform?: string;
  skipWorkspaceBuild?: boolean;
  version: string;
  workspaceRoot?: string;
};

export const CLOSURE_BUILD_SOURCE_PATHS = [
  "apps/daemon", "apps/standalone", "apps/web",
  "packages/agui-adapter", "packages/components", "packages/contracts", "packages/diagnostics",
  "packages/host", "packages/platform", "packages/plugin-runtime", "packages/registry-protocol",
  "packages/release", "packages/sidecar",
  "tools/pack/package.json", "tools/pack/resources",
  "tools/pack/src/closure-build-runtime.ts", "tools/pack/src/closure-prebundle.ts",
  "tools/pack/src/closure-runtime-source.ts", "tools/pack/src/closure.ts", "tools/pack/src/resources.ts",
  "assets/community-pets", "assets/frames", "craft", "data/plugin-previews",
  "design-systems", "design-templates", "plugins/_official", "plugins/registry",
  "prompt-templates", "skills",
] as const;

export type ClosureBuildProvenanceV1 = {
  artifact: {
    digest: string;
    inventoryDigest: string;
    size: number;
  };
  build: {
    nativeModules: readonly string[];
    nodeVersion: string;
    shellDepsDigest: `sha256:${string}`;
    sourceRevision: string | null;
    workspaceDirty: boolean | null;
  };
  channel: ReleaseChannel;
  content: {
    fileCount: number;
    inventoryDigest: string;
    inventoryPath: "inventory.json";
  };
  generatedAt: string;
  platform: ClosurePlatformTarget;
  schemaVersion: 1;
  version: string;
};

export type ClosureBuildReport = {
  archivePath: string;
  inventoryPath: string;
  manifest: ClosureCandidateManifest;
  manifestPath: string;
  outputRoot: string;
  provenance: ClosureBuildProvenanceV1;
  provenancePath: string;
};

export type ClosureDistributionSharedBuildOptions = {
  blobOrigin: string;
  channel: string;
  dir?: string;
  minShellVersion: string;
  skipWorkspaceBuild?: boolean;
  version: string;
  workspaceRoot?: string;
};

export type ClosureDistributionSharedBuildReport = {
  blobRoot: string;
  contribution: ClosureDistributionSharedContribution;
  contributionPath: string;
  outputRoot: string;
};

export type ClosureDistributionTargetBuildOptions = {
  blobOrigin: string;
  channel: string;
  dir?: string;
  platform?: string;
  skipWorkspaceBuild?: boolean;
  version: string;
  workspaceRoot?: string;
};

export type ClosureDistributionTargetBuildReport = {
  blobRoot: string;
  contribution: ClosureDistributionTargetContribution;
  contributionPath: string;
  outputRoot: string;
};

export async function createClosureBuildCacheKey(options: {
  artifactUrl: string;
  channel: ReleaseChannel;
  minShellVersion: string;
  platform: ClosurePlatformTarget;
  version: string;
  workspaceRoot: string;
}): Promise<string> {
  const sourceHashes: Record<string, string> = {};
  for (const sourcePath of CLOSURE_BUILD_SOURCE_PATHS) {
    sourceHashes[sourcePath] = await hashPackageSourcePath(join(options.workspaceRoot, sourcePath));
  }
  const rootPackage = JSON.parse(
    await readFile(join(options.workspaceRoot, "package.json"), "utf8"),
  ) as { packageManager?: unknown };
  const shellDepsDigest = await resolveShellDepsDigestFromWorkspace({
    workspaceRoot: options.workspaceRoot,
  });
  return hashJson({
    artifactUrl: options.artifactUrl,
    channel: options.channel,
    minShellVersion: options.minShellVersion,
    nodeVersion: process.version,
    packageManager: rootPackage.packageManager,
    platform: options.platform,
    pnpmLock: await hashPath(join(options.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 2,
    shellDepsDigest,
    sourceHashes,
    version: options.version,
  });
}

export async function probeClosureNodeNativeModules(options: {
  appRoot: string;
  executable?: string;
  modules?: readonly string[];
}): Promise<readonly string[]> {
  const modules = [...new Set(options.modules ?? CLOSURE_NODE_NATIVE_MODULES)].sort();
  const script = [
    'const {createRequire}=require("node:module");',
    'const {join}=require("node:path");',
    'const root=process.argv[1];',
    'const names=JSON.parse(process.argv[2]);',
    'const load=createRequire(join(root,"probe.cjs"));',
    'for(const name of names)load(name);',
    'process.stdout.write(JSON.stringify(names));',
  ].join("");
  const executable = options.executable ?? process.execPath;
  const output = await new Promise<string>((resolveProbe, rejectProbe) => {
    const child = spawn(executable, ["--eval", script, options.appRoot, JSON.stringify(modules)], {
      env: { ...process.env, NODE_PATH: join(options.appRoot, "node_modules") },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value: string) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value: string) => { stderr += value; });
    child.once("error", rejectProbe);
    child.once("close", (code, signal) => {
      if (code === 0) resolveProbe(stdout);
      else rejectProbe(new Error(
        `Closure native load probe failed with ${signal ?? `exit code ${code ?? "unknown"}`}${stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`}`,
      ));
    });
  });
  const loaded = JSON.parse(output) as unknown;
  if (!Array.isArray(loaded) || JSON.stringify(loaded) !== JSON.stringify(modules)) {
    throw new Error("Closure native load probe returned an invalid module set");
  }
  return Object.freeze(modules);
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

async function collectFileInventory(root: string, current = root): Promise<ClosureFileInventory["files"]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: ClosureFileInventory["files"] = [];
  for (const entry of entries.sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    const absolutePath = join(current, entry.name);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Closure archive must not contain symlinks: ${toPosixPath(relative(root, absolutePath))}`);
    }
    if (metadata.isDirectory()) {
      files.push(...await collectFileInventory(root, absolutePath));
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`Closure archive contains unsupported entry: ${toPosixPath(relative(root, absolutePath))}`);
    }
    const bytes = await readFile(absolutePath);
    files.push({
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      path: toPosixPath(relative(root, absolutePath)),
      size: bytes.byteLength,
    });
  }
  return files;
}

function digestInventory(files: ClosureFileInventory["files"]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(files)).digest("hex")}`;
}

async function resolveGitProvenance(workspaceRoot: string): Promise<{
  sourceRevision: string | null;
  workspaceDirty: boolean | null;
}> {
  const sourceRevision = await runClosureBuildCommand("git", ["rev-parse", "HEAD"], {
    capture: true,
    cwd: workspaceRoot,
  }).catch(() => null);
  const status = await runClosureBuildCommand("git", ["status", "--porcelain"], {
    capture: true,
    cwd: workspaceRoot,
  }).catch(() => null);
  return {
    sourceRevision,
    workspaceDirty: status == null ? null : status.length > 0,
  };
}

function resolveChannel(channel: string, version: string): ReleaseChannel {
  if (!isReleaseChannel(channel)) throw new Error(`unsupported Closure channel: ${channel}`);
  parseReleaseVersion(version, channel);
  return channel;
}

function resolveOutputRoot(root: string, channel: ReleaseChannel, target: ClosurePlatformTarget, version: string): string {
  const outputRoot = resolve(root, "out", "closure", channel, target, "versions", version);
  const relation = relative(resolve(root), outputRoot);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`Closure output escapes tools-pack root: ${outputRoot}`);
  }
  return outputRoot;
}

function resolveDistributionOutputRoot(
  root: string,
  channel: ReleaseChannel,
  owner: "shared" | ClosurePlatformTarget,
  version: string,
): string {
  const outputRoot = resolve(root, "out", "closure-distribution", channel, owner, "versions", version);
  const relation = relative(resolve(root), outputRoot);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`Closure distribution output escapes tools-pack root: ${outputRoot}`);
  }
  return outputRoot;
}

async function materializeContributionBlob(
  sourcePath: string,
  digest: `sha256:${string}`,
  blobRoot: string,
): Promise<string> {
  const destination = join(blobRoot, digest.slice("sha256:".length));
  await mkdir(blobRoot, { recursive: true });
  await cp(sourcePath, destination);
  return destination;
}

/** Build the target-neutral product body, fossil launcher and isolated resources exactly once. */
export async function buildClosureDistributionShared(
  options: ClosureDistributionSharedBuildOptions,
): Promise<ClosureDistributionSharedBuildReport> {
  const workspaceRoot = resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  // Shared bytes have no product target. The target-shaped value is confined to
  // selecting the host archive implementation and never enters the protocol.
  const archiveTarget: ClosurePlatformTarget = process.platform === "win32" ? "win32-x64" : "darwin-arm64";
  const channel = resolveChannel(options.channel, options.version);
  parseReleaseVersion(options.minShellVersion, channel);
  const toolRoot = resolve(workspaceRoot, options.dir ?? ".tmp/tools-pack");
  const outputRoot = resolveDistributionOutputRoot(toolRoot, channel, "shared", options.version);
  const stageRoot = join(toolRoot, "stage", "closure-distribution", `${channel}-shared-${options.version}`);
  const bodyRoot = join(stageRoot, "body");
  const launcherRoot = join(stageRoot, "launcher");
  const resourcesRoot = join(stageRoot, "resources");
  const blobRoot = join(outputRoot, "blobs");
  const contributionPath = join(outputRoot, "shared-contribution.json");

  if (options.skipWorkspaceBuild !== true) await buildClosureDistributionWorkspace(workspaceRoot);
  await rm(stageRoot, { force: true, recursive: true });
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(bodyRoot, { recursive: true });
  await buildClosurePrebundles({
    appRoot: bodyRoot,
    daemonExternals: CLOSURE_DAEMON_EXTERNALS,
    minShellVersion: options.minShellVersion,
    runPnpm: runClosurePnpm,
    stageRoot: join(stageRoot, "build"),
    workspaceRoot,
  });
  const staticSource = join(workspaceRoot, "apps", "web", "out");
  if (!(await stat(staticSource).catch(() => null))?.isDirectory()) {
    throw new Error(`Closure static Web output is missing: ${staticSource}`);
  }
  await cp(staticSource, join(bodyRoot, "web", "static"), { dereference: true, recursive: true });
  await prepareClosureLauncherComponent({
    outputRoot: launcherRoot,
    standaloneDistRoot: join(workspaceRoot, "apps", "standalone", "dist"),
  });
  const resources: ClosureSharedResourceRoot[] = [];
  for (const group of BUNDLED_RESOURCE_GROUPS) {
    const resourceRoot = join(resourcesRoot, group.id);
    await mkdir(resourceRoot, { recursive: true });
    await copyBundledResourceGroup({ id: group.id, resourceRoot, workspaceRoot });
    resources.push({ id: group.id, root: resourceRoot, title: group.title });
  }
  const contribution = await buildClosureDistributionSharedContribution({
    archiveTarget,
    blobOrigin: options.blobOrigin,
    bodyRoot,
    channel,
    launcherRoot,
    outputRoot,
    resources,
    shellCompatibility: { electron: { version: { min: options.minShellVersion } } },
    version: options.version,
  });
  await Promise.all([
    materializeContributionBlob(
      join(outputRoot, "shared", "body.zip"),
      contribution.body.artifact.digest,
      blobRoot,
    ),
    materializeContributionBlob(
      join(outputRoot, "shared", "launcher.zip"),
      contribution.launcher.artifact.digest,
      blobRoot,
    ),
    ...contribution.resources.map(async (resource) => await materializeContributionBlob(
      join(outputRoot, "shared", "resources", `${resource.id}.zip`),
      resource.artifact.digest,
      blobRoot,
    )),
  ]);
  await writeFile(contributionPath, `${JSON.stringify(contribution, null, 2)}\n`, "utf8");
  await rm(stageRoot, { force: true, recursive: true });
  return { blobRoot, contribution, contributionPath, outputRoot };
}

/** Build one host-owned native pack; shared product bytes cannot enter this job. */
export async function buildClosureDistributionTarget(
  options: ClosureDistributionTargetBuildOptions,
): Promise<ClosureDistributionTargetBuildReport> {
  const workspaceRoot = resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  const target = normalizeClosurePlatformTarget(options.platform);
  assertNativeBuildHost(target);
  const channel = resolveChannel(options.channel, options.version);
  const toolRoot = resolve(workspaceRoot, options.dir ?? ".tmp/tools-pack");
  const outputRoot = resolveDistributionOutputRoot(toolRoot, channel, target, options.version);
  const stageRoot = join(toolRoot, "stage", "closure-distribution", `${channel}-${target}-${options.version}`);
  const nativeRoot = join(stageRoot, "native");
  const blobRoot = join(outputRoot, "blobs");
  const contributionPath = join(outputRoot, "target-contribution.json");

  await rm(stageRoot, { force: true, recursive: true });
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(nativeRoot, { recursive: true });
  const dependencies = await resolveClosureRuntimeDependencies(workspaceRoot);
  await writeFile(join(nativeRoot, "package.json"), `${JSON.stringify({
    dependencies,
    name: `open-design-standalone-native-${target}`,
    private: true,
    version: options.version,
    ...(target.startsWith("darwin-") ? { optionalDependencies: { fsevents: "2.3.3" } } : {}),
  }, null, 2)}\n`, "utf8");
  await runClosureBuildCommand(process.execPath, [
    await resolveNodeNpmCliPath(),
    "install",
    "--omit=dev",
    "--no-package-lock",
  ], { cwd: nativeRoot });
  await pruneClosureNativeRuntime(nativeRoot, target);
  await rm(join(nativeRoot, "node_modules", ".bin"), { force: true, recursive: true });
  await rm(join(nativeRoot, "node_modules", ".package-lock.json"), { force: true });
  await rm(join(nativeRoot, "package.json"), { force: true });
  await probeClosureNativeModules({
    executable: process.execPath,
    modules: CLOSURE_NODE_NATIVE_MODULES,
    nativeRoot,
  });
  const contribution = await buildClosureDistributionTargetContribution({
    blobOrigin: options.blobOrigin,
    channel,
    nativeRoot,
    outputRoot,
    target,
    version: options.version,
  });
  await materializeContributionBlob(
    join(outputRoot, "targets", target, "native.zip"),
    contribution.native.artifact.digest,
    blobRoot,
  );
  await writeFile(contributionPath, `${JSON.stringify(contribution, null, 2)}\n`, "utf8");
  await rm(stageRoot, { force: true, recursive: true });
  return { blobRoot, contribution, contributionPath, outputRoot };
}

async function buildClosureArchiveUncached(options: ClosureBuildOptions): Promise<ClosureBuildReport> {
  const workspaceRoot = resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  const target = normalizeClosurePlatformTarget(options.platform);
  assertNativeBuildHost(target);
  const channel = resolveChannel(options.channel, options.version);
  const toolRoot = resolve(workspaceRoot, options.dir ?? ".tmp/tools-pack");
  const outputRoot = resolveOutputRoot(toolRoot, channel, target, options.version);
  const stageRoot = join(toolRoot, "stage", "closure", `${channel}-${target}-${options.version}`);
  const appRoot = join(stageRoot, "app");
  const tarballsRoot = join(stageRoot, "tarballs");
  const archivePath = join(outputRoot, "closure.zip");
  const manifestPath = join(outputRoot, "manifest.json");
  const inventoryPath = join(outputRoot, "inventory.json");
  const provenancePath = join(outputRoot, "provenance.json");

  if (options.skipWorkspaceBuild !== true) await buildClosureWorkspace(workspaceRoot);
  await rm(stageRoot, { force: true, recursive: true });
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(appRoot, { recursive: true });
  const packed = await packClosureWorkspaceTarballs(workspaceRoot, tarballsRoot);
  const runtimeDependencies = await resolveClosureRuntimeDependencies(workspaceRoot);
  const dependencies = Object.fromEntries(
    Object.entries(packed).map(([name, path]) => [name, `file:${relative(appRoot, path)}`]),
  );
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({
      dependencies: { ...dependencies, ...runtimeDependencies },
      description: "Open Design Standalone Closure runtime",
      name: "open-design-standalone-closure",
      private: true,
      type: "module",
      version: options.version,
      ...(target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64
        ? { optionalDependencies: { fsevents: "2.3.3" } }
        : {}),
    }, null, 2)}\n`,
    "utf8",
  );
  await runClosureBuildCommand(process.execPath, [
    await resolveNodeNpmCliPath(),
    "install",
    "--omit=dev",
    "--no-package-lock",
  ], { cwd: appRoot });
  await pruneClosureNativeRuntime(appRoot, target);
  const loadedNativeModules = await probeClosureNodeNativeModules({ appRoot });
  const shellDepsDigest = await resolveShellDepsDigestFromWorkspace({
    workspaceRoot,
  });
  await rm(join(appRoot, "node_modules", ".bin"), { force: true, recursive: true });
  await rm(join(appRoot, "node_modules", ".package-lock.json"), { force: true });
  // The file: tarball coordinates above are build-stage inputs, not runtime
  // identity. Remove them from the shipped root manifest so the immutable
  // archive never embeds a staging path or implies it can reinstall itself.
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({
      description: "Open Design Standalone Closure runtime",
      name: "open-design-standalone-closure",
      private: true,
      type: "module",
      version: options.version,
    }, null, 2)}\n`,
    "utf8",
  );

  await copyClosureWebRuntime(workspaceRoot, appRoot);
  await buildClosurePrebundles({
    appRoot,
    daemonExternals: CLOSURE_DAEMON_EXTERNALS,
    minShellVersion: options.minShellVersion,
    runPnpm: runClosurePnpm,
    stageRoot,
    workspaceRoot,
  });
  await copyBundledResourceTrees({
    resourceRoot: join(appRoot, "resources", "open-design"),
    workspaceRoot,
  });
  const internalRoot = join(appRoot, "standalone");
  await mkdir(internalRoot, { recursive: true });
  await writeFile(
    join(internalRoot, "body.mjs"),
    standaloneBodySource(),
    { encoding: "utf8", mode: 0o700 },
  );
  await writeFile(
    join(internalRoot, CLOSURE_ARCHIVE_ENTRY_PATH),
    standaloneInnerBootloaderSource({ minShellVersion: options.minShellVersion }),
    { encoding: "utf8", mode: 0o700 },
  );
  const entryPath = join(appRoot, CLOSURE_ARCHIVE_ENTRY_PATH);
  await writeFile(entryPath, standaloneBootloaderSource({
    minShellVersion: options.minShellVersion,
  }), { encoding: "utf8", mode: 0o700 });
  await chmod(entryPath, 0o700);

  const files = (await collectFileInventory(appRoot)).sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ));
  if (!files.some((file) => file.path === CLOSURE_ARCHIVE_ENTRY_PATH)) {
    throw new Error(`Closure archive entry is missing: ${CLOSURE_ARCHIVE_ENTRY_PATH}`);
  }
  await mkdir(outputRoot, { recursive: true });
  const inventory = validateClosureFileInventory({
    files,
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  });
  const inventoryDigest = digestInventory(files);
  const archiveInvocation = resolveClosureArchiveInvocation({ artifactPath: archivePath, target });
  await runClosureBuildCommand(archiveInvocation.command, archiveInvocation.args, { cwd: appRoot });
  const archiveBytes = await readFile(archivePath);
  const digest = `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}` as const;
  const manifest = validateClosureCandidateManifest({
    artifact: {
      digest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest,
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archiveBytes.byteLength,
      url: options.artifactUrl,
    },
    compatibility: {
      shell: {
        electron: { version: { min: options.minShellVersion } },
      },
    },
    identity: {
      channel,
      digest,
      platform: target,
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version: options.version,
    },
    schemaVersion: CLOSURE_SCHEMA_VERSION,
  });
  const git = await resolveGitProvenance(workspaceRoot);
  const provenance: ClosureBuildProvenanceV1 = {
    artifact: {
      digest,
      inventoryDigest,
      size: archiveBytes.byteLength,
    },
    build: {
      nativeModules: loadedNativeModules,
      nodeVersion: process.version,
      shellDepsDigest,
      sourceRevision: git.sourceRevision,
      workspaceDirty: git.workspaceDirty,
    },
    channel,
    content: {
      fileCount: files.length,
      inventoryDigest,
      inventoryPath: "inventory.json",
    },
    generatedAt: new Date().toISOString(),
    platform: target,
    schemaVersion: 1,
    version: options.version,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  await rm(stageRoot, { force: true, recursive: true });
  return { archivePath, inventoryPath, manifest, manifestPath, outputRoot, provenance, provenancePath };
}

function closureOutputRoot(options: ClosureBuildOptions): {
  channel: ReleaseChannel;
  outputRoot: string;
  platform: ClosurePlatformTarget;
  workspaceRoot: string;
} {
  const workspaceRoot = resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  const platform = normalizeClosurePlatformTarget(options.platform);
  const channel = resolveChannel(options.channel, options.version);
  const toolRoot = resolve(workspaceRoot, options.dir ?? ".tmp/tools-pack");
  return {
    channel,
    outputRoot: resolveOutputRoot(toolRoot, channel, platform, options.version),
    platform,
    workspaceRoot,
  };
}

async function readClosureBuildReport(
  outputRoot: string,
  expected: {
    artifactUrl: string;
    channel: ReleaseChannel;
    minShellVersion: string;
    platform: ClosurePlatformTarget;
    version: string;
  },
): Promise<ClosureBuildReport> {
  const archivePath = join(outputRoot, "closure.zip");
  const inventoryPath = join(outputRoot, "inventory.json");
  const manifestPath = join(outputRoot, "manifest.json");
  const provenancePath = join(outputRoot, "provenance.json");
  const [archiveBytes, inventoryValue, manifestValue, provenanceValue] = await Promise.all([
    readFile(archivePath),
    readFile(inventoryPath, "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(manifestPath, "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(provenancePath, "utf8").then((value) => JSON.parse(value) as ClosureBuildProvenanceV1),
  ]);
  const inventory = validateClosureFileInventory(inventoryValue);
  const manifest = validateClosureCandidateManifest(manifestValue);
  const provenance = provenanceValue;
  const archiveDigest = `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}`;
  const inventoryDigest = digestInventory(inventory.files);
  if (
    manifest.identity.channel !== expected.channel
    || manifest.identity.platform !== expected.platform
    || manifest.identity.version !== expected.version
    || manifest.artifact.url !== new URL(expected.artifactUrl).toString()
    || manifest.compatibility.shell.electron?.version.min !== expected.minShellVersion
    || manifest.artifact.digest !== archiveDigest
    || manifest.identity.digest !== archiveDigest
    || manifest.artifact.size !== archiveBytes.byteLength
    || manifest.artifact.inventoryDigest !== inventoryDigest
  ) {
    throw new Error("cached Closure output does not match its build identity");
  }
  if (
    provenance.schemaVersion !== 1
    || provenance.channel !== expected.channel
    || provenance.platform !== expected.platform
    || provenance.version !== expected.version
    || provenance.artifact.digest !== archiveDigest
    || provenance.artifact.inventoryDigest !== inventoryDigest
    || provenance.artifact.size !== archiveBytes.byteLength
  ) {
    throw new Error("cached Closure provenance does not match its build identity");
  }
  return {
    archivePath,
    inventoryPath,
    manifest,
    manifestPath,
    outputRoot,
    provenance,
    provenancePath,
  };
}

export async function buildClosureArchive(options: ClosureBuildOptions): Promise<ClosureBuildReport> {
  const resolved = closureOutputRoot(options);
  if (options.cacheDir == null) return await buildClosureArchiveUncached(options);
  const key = await createClosureBuildCacheKey({
    artifactUrl: options.artifactUrl,
    channel: resolved.channel,
    minShellVersion: options.minShellVersion,
    platform: resolved.platform,
    version: options.version,
    workspaceRoot: resolved.workspaceRoot,
  });
  const cache = new ToolPackCache(resolve(resolved.workspaceRoot, options.cacheDir));
  const expected = {
    artifactUrl: options.artifactUrl,
    channel: resolved.channel,
    minShellVersion: options.minShellVersion,
    platform: resolved.platform,
    version: options.version,
  };
  await cache.acquire<{
    manifest: ClosureCandidateManifest;
    provenance: ClosureBuildProvenanceV1;
  }>({
    materialize: [{ from: "output", to: resolved.outputRoot }],
    node: {
      id: `${resolved.platform}.closure-build`,
      key,
      outputs: [
        "output/closure.zip",
        "output/inventory.json",
        "output/manifest.json",
        "output/provenance.json",
      ],
      invalidate: async ({ entryRoot }): Promise<CacheInvalidation | null> => {
        try {
          await readClosureBuildReport(join(entryRoot, "output"), expected);
          return null;
        } catch (error) {
          return { reason: error instanceof Error ? error.message : String(error) };
        }
      },
      build: async ({ entryRoot }) => {
        const report = await buildClosureArchiveUncached({ ...options, cacheDir: undefined });
        await cp(report.outputRoot, join(entryRoot, "output"), { recursive: true });
        return { manifest: report.manifest, provenance: report.provenance };
      },
    },
  });
  return await readClosureBuildReport(resolved.outputRoot, expected);
}
