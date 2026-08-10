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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { rebuild, type RebuildOptions } from "@electron/rebuild";
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
} from "@open-design/closure-proto";
import { createPackageManagerInvocation } from "@open-design/platform";
import { isReleaseChannel, parseReleaseVersion, type ReleaseChannel } from "@open-design/release";

import { hashJson, hashPath, ToolPackCache, type CacheInvalidation } from "./cache.js";
import { resolveElectronVersion, WORKSPACE_ROOT } from "./config.js";
import { hashPackageSourcePath } from "./package-source-hash.js";
import { copyBundledResourceTrees, winResources } from "./resources.js";

export const CLOSURE_PLATFORM_TARGETS = Object.freeze({
  DARWIN_ARM64: "darwin-arm64",
  WIN32_X64: "win32-x64",
} as const);

export type ClosurePlatformTarget =
  (typeof CLOSURE_PLATFORM_TARGETS)[keyof typeof CLOSURE_PLATFORM_TARGETS];

export const CLOSURE_INTERNAL_PACKAGES = [
  { directory: "packages/release", name: "@open-design/release" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/standalone-proto", name: "@open-design/standalone-proto" },
  { directory: "packages/standalone-runtime", name: "@open-design/standalone-runtime" },
  { directory: "apps/standalone", name: "@open-design/standalone" },
] as const;

export const CLOSURE_DAEMON_EXTERNALS = ["better-sqlite3", "blake3-wasm", "node-pty"] as const;
export const CLOSURE_ELECTRON_NATIVE_MODULES = ["better-sqlite3"] as const;
const CLOSURE_FORBIDDEN_BUNDLE_INPUTS = [
  "/shells/electron/",
  "/payload-desktop-handoff.",
] as const;
const CLOSURE_ESBUILD_BANNER =
  'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);';

export type ClosureArchiveInvocation = {
  args: readonly string[];
  command: string;
};

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
  "apps/daemon",
  "apps/standalone",
  "apps/web",
  "packages/agui-adapter",
  "packages/components",
  "packages/contracts",
  "packages/diagnostics",
  "packages/standalone-proto",
  "packages/standalone-runtime",
  "packages/host",
  "packages/launcher-proto",
  "packages/platform",
  "packages/plugin-runtime",
  "packages/registry-protocol",
  "packages/release",
  "packages/sidecar",
  "packages/sidecar-proto",
  "tools/pack/package.json",
  "tools/pack/resources",
  "tools/pack/src/closure.ts",
  "tools/pack/src/resources.ts",
  "assets/community-pets",
  "assets/frames",
  "craft",
  "data/plugin-previews",
  "design-systems",
  "design-templates",
  "plugins/_official",
  "plugins/registry",
  "prompt-templates",
  "skills",
] as const;

export type ClosureBuildProvenanceV1 = {
  artifact: {
    digest: string;
    inventoryDigest: string;
    size: number;
  };
  build: {
    electronVersion: string;
    nativeModules: readonly string[];
    nodeVersion: string;
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

export async function createClosureBuildCacheKey(options: {
  artifactUrl: string;
  channel: ReleaseChannel;
  electronVersion: string;
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
  return hashJson({
    artifactUrl: options.artifactUrl,
    channel: options.channel,
    electronVersion: options.electronVersion,
    minShellVersion: options.minShellVersion,
    nodeVersion: process.version,
    packageManager: rootPackage.packageManager,
    platform: options.platform,
    pnpmLock: await hashPath(join(options.workspaceRoot, "pnpm-lock.yaml")),
    schemaVersion: 1,
    sourceHashes,
    version: options.version,
  });
}

function hostTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ClosurePlatformTarget | null {
  if (platform === "darwin" && arch === "arm64") return CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64;
  if (platform === "win32" && arch === "x64") return CLOSURE_PLATFORM_TARGETS.WIN32_X64;
  return null;
}

export function normalizeClosurePlatformTarget(value: string | undefined): ClosurePlatformTarget {
  const candidate = value ?? hostTarget();
  if (candidate === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64) return candidate;
  if (candidate === CLOSURE_PLATFORM_TARGETS.WIN32_X64) return candidate;
  throw new Error(`unsupported Closure platform target: ${String(candidate)}`);
}

export function resolveClosureArchiveInvocation(options: {
  artifactPath: string;
  target: ClosurePlatformTarget;
}): ClosureArchiveInvocation {
  if (options.target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64) {
    return {
      args: ["-c", "-k", "--sequesterRsrc", "--rsrc", ".", options.artifactPath],
      command: "ditto",
    };
  }
  return {
    args: ["a", "-tzip", "-mx=5", options.artifactPath, ".\\*"],
    command: winResources.sevenZipExe,
  };
}

export function createClosureElectronRebuildOptions(options: {
  appRoot: string;
  electronVersion: string;
  target: ClosurePlatformTarget;
}): RebuildOptions {
  const target = normalizeClosurePlatformTarget(options.target);
  return {
    arch: target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64 ? "arm64" : "x64",
    buildFromSource: false,
    buildPath: options.appRoot,
    electronVersion: options.electronVersion,
    force: true,
    mode: "sequential",
    onlyModules: [...CLOSURE_ELECTRON_NATIVE_MODULES],
    platform: target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64 ? "darwin" : "win32",
    projectRootPath: options.appRoot,
  };
}

function closureNativeRebuildOutputPath(appRoot: string): string {
  return join(appRoot, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
}

export async function runClosureElectronRebuild(options: {
  appRoot: string;
  electronVersion: string;
  target: ClosurePlatformTarget;
}): Promise<void> {
  const foundModules = new Set<string>();
  const rebuildResult = rebuild(createClosureElectronRebuildOptions(options));
  rebuildResult.lifecycle.on("modules-found", (modules: string[]) => {
    for (const moduleName of modules) foundModules.add(moduleName);
    process.stderr.write(
      `[tools-pack closure] rebuilding Electron ABI modules: ${modules.join(", ") || "none"}\n`,
    );
  });
  await rebuildResult;
  const missingModules = CLOSURE_ELECTRON_NATIVE_MODULES.filter(
    (moduleName) => !foundModules.has(moduleName),
  );
  if (missingModules.length > 0) {
    throw new Error(
      `Closure Electron ABI rebuild did not discover required native module(s): ${missingModules.join(", ")}`,
    );
  }
  const nativePath = closureNativeRebuildOutputPath(options.appRoot);
  const metadata = await stat(nativePath).catch(() => null);
  if (metadata == null || !metadata.isFile() || metadata.size < 100_000) {
    throw new Error(`Closure Electron ABI rebuild output is missing or invalid: ${nativePath}`);
  }
}

function assertNativeBuildHost(target: ClosurePlatformTarget): void {
  const current = hostTarget();
  if (current !== target) {
    throw new Error(
      `Closure ${target} artifacts must be built on a ${target} host; current host is ${process.platform}-${process.arch}`,
    );
  }
}

function run(command: string, args: readonly string[], options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  capture?: boolean;
  windowsVerbatimArguments?: boolean;
}): Promise<string> {
  return new Promise<string>((resolveRun, rejectRun) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      // Keep the Closure CLI stdout machine-readable: internal build output is
      // diagnostic and belongs on stderr, while the command's final --json
      // report is written by the CLI entrypoint itself.
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (options.capture === true) stdout += chunk;
      else process.stderr.write(chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      if (options.capture === true) stderr += chunk;
      else process.stderr.write(chunk);
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveRun(stdout.trim());
        return;
      }
      rejectRun(new Error(
        `${command} failed with ${signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`}${
          stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`
        }`,
      ));
    });
  });
}

async function runPnpm(
  workspaceRoot: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const invocation = createPackageManagerInvocation([...args], env);
  await run(invocation.command, invocation.args, {
    cwd: workspaceRoot,
    env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function buildWorkspace(workspaceRoot: string): Promise<void> {
  await runPnpm(workspaceRoot, ["--filter", "@open-design/daemon...", "build"]);
  await runPnpm(workspaceRoot, ["--filter", "@open-design/standalone", "build"]);
  await runPnpm(
    workspaceRoot,
    ["--filter", "@open-design/web...", "build"],
    { ...process.env, NODE_ENV: "production", OD_WEB_OUTPUT_MODE: "standalone" },
  );
  await runPnpm(workspaceRoot, ["--filter", "@open-design/web", "build:sidecar"]);
}

async function resolveNodeNpmCliPath(nodeExecutable = process.execPath): Promise<string> {
  const executableRoot = dirname(nodeExecutable);
  const candidates = process.platform === "win32"
    ? [join(executableRoot, "node_modules", "npm", "bin", "npm-cli.js")]
    : [
        join(dirname(executableRoot), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
        join(executableRoot, "node_modules", "npm", "bin", "npm-cli.js"),
      ];
  for (const candidate of candidates) {
    const metadata = await stat(candidate).catch(() => null);
    if (metadata?.isFile()) return candidate;
  }
  throw new Error(`Closure build could not resolve npm-cli.js beside ${nodeExecutable}`);
}

async function packWorkspaceTarballs(
  workspaceRoot: string,
  tarballsRoot: string,
): Promise<Record<string, string>> {
  await rm(tarballsRoot, { force: true, recursive: true });
  await mkdir(tarballsRoot, { recursive: true });
  const packed: Record<string, string> = {};
  for (const packageInfo of CLOSURE_INTERNAL_PACKAGES) {
    const before = new Set(await readdir(tarballsRoot));
    await runPnpm(workspaceRoot, [
      "-C",
      packageInfo.directory,
      "pack",
      "--pack-destination",
      tarballsRoot,
    ]);
    const created = (await readdir(tarballsRoot)).filter((entry) => !before.has(entry));
    if (created.length !== 1 || created[0] == null) {
      throw new Error(`expected one Closure tarball for ${packageInfo.name}; got ${created.length}`);
    }
    packed[packageInfo.name] = join(tarballsRoot, created[0]);
  }
  return packed;
}

export async function resolveClosureRuntimeDependencies(
  workspaceRoot: string,
): Promise<Record<(typeof CLOSURE_DAEMON_EXTERNALS)[number], string>> {
  const daemonPackagePath = join(workspaceRoot, "apps", "daemon", "package.json");
  const daemonPackage = JSON.parse(await readFile(daemonPackagePath, "utf8")) as {
    dependencies?: Record<string, unknown>;
  };
  return Object.fromEntries(CLOSURE_DAEMON_EXTERNALS.map((name) => {
    const version = daemonPackage.dependencies?.[name];
    if (typeof version !== "string" || version.trim().length === 0) {
      throw new Error(`Closure external ${name} is missing from ${daemonPackagePath}`);
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error(`Closure external ${name} must use an exact version; got ${version}`);
    }
    return [name, version];
  })) as Record<(typeof CLOSURE_DAEMON_EXTERNALS)[number], string>;
}

async function pruneForeignNodePtyPrebuilds(
  appRoot: string,
  target: ClosurePlatformTarget,
): Promise<void> {
  const prebuildsRoot = join(appRoot, "node_modules", "node-pty", "prebuilds");
  const entries = await readdir(prebuildsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === target) continue;
    await rm(join(prebuildsRoot, entry.name), { force: true, recursive: true });
  }
  const nativeEntry = join(prebuildsRoot, target, "pty.node");
  if (!(await stat(nativeEntry).catch(() => null))?.isFile()) {
    throw new Error(`Closure node-pty prebuild is missing for ${target}: ${nativeEntry}`);
  }
}

export function standaloneBootloaderSource(options: { minShellVersion: string }): string {
  return `import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createStandaloneBootloader } from "@open-design/standalone";
import { startStandaloneBody } from "./standalone/body.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const innerPath = join(root, "standalone", "bootloader.mjs");
let registeredBootloader = null;
if (existsSync(innerPath)) {
  const inner = await import(pathToFileURL(innerPath).href);
  if (typeof inner.handoff !== "function") {
    throw new Error("registered Standalone bootloader must export handoff()");
  }
  registeredBootloader = inner.handoff;
}

export const handoff = createStandaloneBootloader({
  shellCompatibility: {
    electron: { version: { min: ${JSON.stringify(options.minShellVersion)} } },
  },
  resolveRegisteredBootloader: () => registeredBootloader,
  start: startStandaloneBody,
});

export default handoff;
`;
}

export function standaloneBodySource(): string {
  return `import { existsSync } from "node:fs";
import { mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startSidecarStandalone } from "@open-design/standalone";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function sameWindowsPath(left, right) {
  const normalize = (value) => value.replaceAll("/", "\\\\").replace(/[\\\\]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

/**
 * Node's Windows chdir still rejects paths beyond MAX_PATH even when file I/O
 * and the Electron manifest are long-path aware. Enter the verified Closure
 * through a generation-bound junction under the namespace runtime root so the
 * Next standalone server and native module resolution stay below that limit.
 */
export async function resolveOpenDesignClosureRuntimeRoot(request) {
  if (process.platform !== "win32") return root;
  const scope = request.handoff.scope;
  const digest = request.handoff.descriptor.standalone.digest.slice("sha256:".length, "sha256:".length + 16);
  const aliasParent = join(request.paths.runtimeRoot, "closure-aliases");
  const aliasRoot = join(aliasParent, [scope.channel, "g" + String(scope.generation), digest].join("-"));
  await mkdir(aliasParent, { recursive: true });
  const expectedRoot = await realpath(root);
  const currentRoot = await realpath(aliasRoot).catch(() => null);
  if (currentRoot != null && sameWindowsPath(currentRoot, expectedRoot)) return aliasRoot;
  if (currentRoot != null) await unlink(aliasRoot);
  await symlink(expectedRoot, aliasRoot, "junction").catch(async (error) => {
    const racedRoot = await realpath(aliasRoot).catch(() => null);
    if (racedRoot != null && sameWindowsPath(racedRoot, expectedRoot)) return;
    throw error;
  });
  const linkedRoot = await realpath(aliasRoot);
  if (!sameWindowsPath(linkedRoot, expectedRoot)) {
    throw new Error("Closure runtime alias does not resolve to the selected generation");
  }
  return aliasRoot;
}

export function resolveOpenDesignClosureLayout(runtimeRoot = root) {
  const standaloneRoot = join(runtimeRoot, "web", "standalone");
  const serverCandidates = [
    join(standaloneRoot, "apps", "web", "server.js"),
    join(standaloneRoot, "server.js"),
  ];
  const webServerEntry = serverCandidates.find((candidate) => existsSync(candidate));
  if (webServerEntry == null) throw new Error("Closure Web standalone entry is missing");
  return Object.freeze({
    daemonCliEntry: join(runtimeRoot, "daemon", "daemon-cli.mjs"),
    daemonSidecarEntry: join(runtimeRoot, "daemon", "daemon-sidecar.mjs"),
    daemonStandaloneSidecarEntry: join(runtimeRoot, "daemon", "daemon-standalone-sidecar.mjs"),
    resourceRoot: join(runtimeRoot, "resources", "open-design"),
    webServerEntry,
    webSidecarEntry: join(runtimeRoot, "web", "web-sidecar.mjs"),
    webStandaloneSidecarEntry: join(runtimeRoot, "web", "web-standalone-sidecar.mjs"),
    webStandaloneRoot: standaloneRoot,
  });
}

export async function startStandaloneBody(request) {
  const layout = resolveOpenDesignClosureLayout(await resolveOpenDesignClosureRuntimeRoot(request));
  // Windows can spend more than the control plane's generic five-second
  // default loading a freshly materialized Electron-as-Node sidecar while
  // Defender scans its Closure tree. Keep readiness event-driven, but give the
  // child a bounded platform allowance before declaring it unavailable.
  const sidecarReadyTimeoutMs = process.platform === "win32" ? 120_000 : undefined;
  const childEnv = {
    ...process.env,
    OD_DAEMON_CLI_PATH: layout.daemonCliEntry,
    OD_NODE_BIN: process.execPath,
    OD_RESOURCE_TRUST_ROOT: request.paths.installationRoot,
    OD_STANDALONE_ATTACHMENT_ID: request.attachment.id,
  };
  return await startSidecarStandalone(request, {
    daemon: {
      args: [layout.daemonStandaloneSidecarEntry],
      env: childEnv,
      executable: process.execPath,
      output: "inherit",
      readyTimeoutMs: sidecarReadyTimeoutMs,
    },
    web: {
      args: [layout.webStandaloneSidecarEntry],
      env: {
        ...childEnv,
        OD_WEB_OUTPUT_MODE: "standalone",
        OD_WEB_STANDALONE_ROOT: layout.webStandaloneRoot,
      },
      executable: process.execPath,
      output: "inherit",
      readyTimeoutMs: sidecarReadyTimeoutMs,
    },
  });
}
`;
}

export function standaloneInnerBootloaderSource(options: { minShellVersion: string }): string {
  return `import { createStandaloneBootloader } from "@open-design/standalone";
import { startStandaloneBody } from "./body.mjs";

export const handoff = createStandaloneBootloader({
  shellCompatibility: {
    electron: { version: { min: ${JSON.stringify(options.minShellVersion)} } },
  },
  start: startStandaloneBody,
});

export default handoff;
`;
}

async function runEsbuild(workspaceRoot: string, args: readonly string[]): Promise<void> {
  await runPnpm(workspaceRoot, ["--filter", "@open-design/tools-pack", "exec", "esbuild", ...args]);
}

async function assertClosureBundleMetafile(path: string): Promise<void> {
  const metafile = JSON.parse(await readFile(path, "utf8")) as { inputs?: Record<string, unknown> };
  const forbidden = Object.keys(metafile.inputs ?? {})
    .map((input) => input.replaceAll("\\", "/"))
    .filter((input) => CLOSURE_FORBIDDEN_BUNDLE_INPUTS.some((fragment) => input.includes(fragment)));
  if (forbidden.length > 0) {
    throw new Error(`Closure prebundle included shell compatibility inputs: ${forbidden.join(", ")}`);
  }
}

async function buildClosurePrebundles(
  workspaceRoot: string,
  stageRoot: string,
  appRoot: string,
  target: ClosurePlatformTarget,
): Promise<void> {
  const entryRoot = join(stageRoot, "entries");
  const metadataRoot = join(stageRoot, "metadata");
  const daemonEntry = join(entryRoot, "daemon-cli.mjs");
  const daemonSidecarEntry = join(
    workspaceRoot,
    "apps",
    "daemon",
    "src",
    "sidecar",
    "daemon-sidecar.ts",
  );
  const daemonStandaloneSidecarEntry = join(
    workspaceRoot,
    "apps",
    "daemon",
    "src",
    "sidecar",
    "daemon-standalone-sidecar.ts",
  );
  const daemonOutputRoot = join(appRoot, "daemon");
  const daemonMetafile = join(metadataRoot, "daemon.json");
  const webOutput = join(appRoot, "web", "web-sidecar.mjs");
  const webStandaloneOutput = join(appRoot, "web", "web-standalone-sidecar.mjs");
  const webMetafile = join(metadataRoot, "web.json");
  const webStandaloneMetafile = join(metadataRoot, "web-standalone.json");
  await mkdir(entryRoot, { recursive: true });
  await mkdir(metadataRoot, { recursive: true });
  await writeFile(
    daemonEntry,
    [
      'import { fileURLToPath } from "node:url";',
      "const selfPath = fileURLToPath(import.meta.url);",
      "process.env.OD_BIN ??= selfPath;",
      "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
      `await import(${JSON.stringify(join(workspaceRoot, "apps", "daemon", "dist", "cli.js"))});`,
      "",
    ].join("\n"),
    "utf8",
  );
  await runEsbuild(workspaceRoot, [
    daemonEntry,
    daemonSidecarEntry,
    daemonStandaloneSidecarEntry,
    "--bundle",
    "--splitting",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--banner:js=${CLOSURE_ESBUILD_BANNER}`,
    ...[
      ...CLOSURE_DAEMON_EXTERNALS,
      ...(target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64 ? ["fsevents"] : []),
    ].map((dependency) => `--external:${dependency}`),
    `--outdir=${daemonOutputRoot}`,
    "--entry-names=[name]",
    "--chunk-names=chunks/[name]-[hash]",
    "--out-extension:.js=.mjs",
    `--metafile=${daemonMetafile}`,
  ]);
  await runEsbuild(workspaceRoot, [
    join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--outfile=${webOutput}`,
    `--metafile=${webMetafile}`,
  ]);
  await runEsbuild(workspaceRoot, [
    join(workspaceRoot, "apps", "web", "sidecar", "web-standalone-sidecar.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--outfile=${webStandaloneOutput}`,
    `--metafile=${webStandaloneMetafile}`,
  ]);
  await assertClosureBundleMetafile(daemonMetafile);
  await assertClosureBundleMetafile(webMetafile);
  await assertClosureBundleMetafile(webStandaloneMetafile);
}

async function copyWebRuntime(workspaceRoot: string, appRoot: string): Promise<void> {
  const standaloneSource = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const standaloneTarget = join(appRoot, "web", "standalone");
  if (!(await stat(standaloneSource)).isDirectory()) {
    throw new Error(`Closure Web standalone output is missing: ${standaloneSource}`);
  }
  await cp(standaloneSource, standaloneTarget, { dereference: true, recursive: true });
  await materializeClosureWebPublicHoist(standaloneTarget);

  const appRelativeRoot = await stat(join(standaloneTarget, "apps", "web", "server.js"))
    .then(() => join(standaloneTarget, "apps", "web"))
    .catch(() => standaloneTarget);
  await mkdir(join(appRelativeRoot, ".next"), { recursive: true });
  await cp(
    join(workspaceRoot, "apps", "web", ".next", "static"),
    join(appRelativeRoot, ".next", "static"),
    { dereference: true, recursive: true },
  );
  const publicRoot = join(workspaceRoot, "apps", "web", "public");
  if ((await stat(publicRoot).catch(() => null))?.isDirectory()) {
    await cp(publicRoot, join(appRelativeRoot, "public"), { dereference: true, recursive: true });
  }
}

/**
 * Next's pnpm standalone output resolves transitive packages through
 * `node_modules/.pnpm/node_modules`, with public entries represented as
 * symlinks. Closure archives intentionally contain no symlinks, and the broad
 * dereferenced copy above does not reliably recreate those public entries on
 * every host. Materialize each hoisted package explicitly so the archived
 * server has the same Node resolution surface as the Desktop after-pack copy.
 */
export async function materializeClosureWebPublicHoist(standaloneRoot: string): Promise<string[]> {
  const nodeModulesRoot = join(standaloneRoot, "node_modules");
  const hoistRoot = join(nodeModulesRoot, ".pnpm", "node_modules");
  const entries = await readdir(hoistRoot, { withFileTypes: true }).catch(() => []);
  const materialized: string[] = [];

  const materialize = async (sourcePath: string, destinationPath: string): Promise<void> => {
    await rm(destinationPath, { force: true, recursive: true });
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { dereference: true, recursive: true });
    materialized.push(toPosixPath(relative(standaloneRoot, destinationPath)));
  };

  for (const entry of entries) {
    const sourcePath = join(hoistRoot, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scopedEntry of await readdir(sourcePath)) {
        await materialize(
          join(sourcePath, scopedEntry),
          join(nodeModulesRoot, entry.name, scopedEntry),
        );
      }
      continue;
    }
    await materialize(sourcePath, join(nodeModulesRoot, entry.name));
  }
  return materialized.sort();
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
  const sourceRevision = await run("git", ["rev-parse", "HEAD"], {
    capture: true,
    cwd: workspaceRoot,
  }).catch(() => null);
  const status = await run("git", ["status", "--porcelain"], {
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

  if (options.skipWorkspaceBuild !== true) await buildWorkspace(workspaceRoot);
  await rm(stageRoot, { force: true, recursive: true });
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(appRoot, { recursive: true });
  const packed = await packWorkspaceTarballs(workspaceRoot, tarballsRoot);
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
  await run(process.execPath, [
    await resolveNodeNpmCliPath(),
    "install",
    "--omit=dev",
    "--no-package-lock",
  ], { cwd: appRoot });
  const electronVersion = resolveElectronVersion(workspaceRoot);
  await runClosureElectronRebuild({ appRoot, electronVersion, target });
  await pruneForeignNodePtyPrebuilds(appRoot, target);
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

  await copyWebRuntime(workspaceRoot, appRoot);
  await buildClosurePrebundles(workspaceRoot, stageRoot, appRoot, target);
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
  await run(archiveInvocation.command, archiveInvocation.args, { cwd: appRoot });
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
      electronVersion,
      nativeModules: [...CLOSURE_ELECTRON_NATIVE_MODULES],
      nodeVersion: process.version,
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
  const electronVersion = resolveElectronVersion(resolved.workspaceRoot);
  const key = await createClosureBuildCacheKey({
    artifactUrl: options.artifactUrl,
    channel: resolved.channel,
    electronVersion,
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
