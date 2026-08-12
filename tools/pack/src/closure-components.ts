import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  chmod,
  mkdir,
  copyFile,
  readdir,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_LAUNCHER_HANDOFF_PATH,
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

export type ClosurePreparedTree = Readonly<{
  fileCount: number;
  files: readonly ClosureComponentTreeFile[];
  root: string;
}>;

export type ClosureNodeRuntimeIdentity = Readonly<{
  arch: string;
  electron: null;
  modules: string;
  node: string;
  platform: string;
  release: "node";
}>;

export type ClosureNodeRuntimeProbe = (
  executable: string,
  expected: Readonly<{ arch: string; platform: string; version: string }>,
) => Promise<ClosureNodeRuntimeIdentity>;

export type ClosurePreparedNodeRuntime = ClosurePreparedTree & Readonly<{
  entryPath: "bin/node" | "node.exe";
  identity: ClosureNodeRuntimeIdentity;
}>;

/** Materialize the two fossil entries that every launcher archive must carry. */
export async function prepareClosureLauncherComponent(options: Readonly<{
  outputRoot: string;
  standaloneDistRoot: string;
}>): Promise<string> {
  const outputRoot = resolve(options.outputRoot);
  const sourceRoot = resolve(options.standaloneDistRoot);
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    copyFile(
      join(sourceRoot, "generation-bootloader.mjs"),
      join(outputRoot, CLOSURE_LAUNCHER_HANDOFF_PATH),
    ),
    copyFile(
      join(sourceRoot, CLOSURE_LAUNCHER_ENTRY_PATH),
      join(outputRoot, CLOSURE_LAUNCHER_ENTRY_PATH),
    ),
    copyFile(
      join(sourceRoot, "native-loader.mjs"),
      join(outputRoot, "native-loader.mjs"),
    ),
  ]).catch((error: unknown) => {
    throw new Error("Standalone launcher build outputs are incomplete", { cause: error });
  });
  return outputRoot;
}

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

async function inspectPreparedTree(rootInput: string): Promise<ClosurePreparedTree> {
  const root = resolve(rootInput);
  const files = (await inspectComponentTree(root)).sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ));
  if (files.length === 0) throw new Error(`Closure prepared tree is empty: ${root}`);
  return Object.freeze({ fileCount: files.length, files: Object.freeze(files), root });
}

const CLOSURE_ARCHIVE_MTIME = new Date("2000-01-01T00:00:00.000Z");

async function normalizeArchiveMetadata(root: string, current = root): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await normalizeArchiveMetadata(root, path);
      await chmod(path, 0o755);
      await utimes(path, CLOSURE_ARCHIVE_MTIME, CLOSURE_ARCHIVE_MTIME);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Closure component source contains an unsupported entry: ${relative(root, path)}`);
    }
    await chmod(path, 0o644);
    await utimes(path, CLOSURE_ARCHIVE_MTIME, CLOSURE_ARCHIVE_MTIME);
  }
  await chmod(current, 0o755);
  await utimes(current, CLOSURE_ARCHIVE_MTIME, CLOSURE_ARCHIVE_MTIME);
}

/** Refuse platform/native bytes in the target-neutral body before archiving. */
export async function validateClosureBodyComponent(root: string): Promise<ClosurePreparedTree> {
  const tree = await inspectPreparedTree(root);
  if (!tree.files.some((file) => file.path === CLOSURE_ARCHIVE_ENTRY_PATH)) {
    throw new Error(`Closure body entry is missing: ${CLOSURE_ARCHIVE_ENTRY_PATH}`);
  }
  const forbidden = tree.files.filter((file) => (
    /(?:^|\/)node_modules\/(?:\.pnpm\/)?(?:electron|electron-[^/]+)(?:\/|$)/u.test(file.path)
    || /\.(?:dll|dylib|exe|node|so)$/iu.test(file.path)
    || file.path.startsWith("resources/")
  ));
  if (forbidden.length > 0) {
    throw new Error(
      `Closure body must remain platform-neutral; found ${forbidden.map((file) => file.path).join(", ")}`,
    );
  }
  return tree;
}

/** Require native addons to live in their own Node resolution pack. */
export async function validateClosureNativeComponent(root: string): Promise<ClosurePreparedTree> {
  const tree = await inspectPreparedTree(root);
  const outsideNodeModules = tree.files.filter((file) => !file.path.startsWith("node_modules/"));
  if (outsideNodeModules.length > 0) {
    throw new Error(
      `Closure native pack may only contain node_modules; found ${outsideNodeModules[0]?.path ?? "unknown"}`,
    );
  }
  if (!tree.files.some((file) => file.path.endsWith(".node"))) {
    throw new Error("Closure native pack must contain at least one Node addon");
  }
  return tree;
}

/** Validate an official-Node probe without coupling the protocol to its downloader. */
export function validateClosureNodeRuntimeIdentity(
  value: unknown,
  expected: Readonly<{ arch: string; platform: string; version: string }>,
): ClosureNodeRuntimeIdentity {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Closure Node runtime probe must be an object");
  }
  const probe = value as Record<string, unknown>;
  const extras = Object.keys(probe).filter((key) => (
    !["arch", "electron", "modules", "node", "platform", "release"].includes(key)
  ));
  if (extras.length > 0) throw new Error(`Closure Node runtime probe has unsupported fields: ${extras.join(", ")}`);
  if (
    probe.release !== "node"
    || probe.electron != null
    || probe.node !== expected.version
    || probe.platform !== expected.platform
    || probe.arch !== expected.arch
    || typeof probe.modules !== "string"
    || !/^\d+$/u.test(probe.modules)
  ) {
    throw new Error("Closure runtime is not the expected standalone Node target");
  }
  return Object.freeze({
    arch: expected.arch,
    electron: null,
    modules: probe.modules,
    node: expected.version,
    platform: expected.platform,
    release: "node",
  });
}

/** Execute one prepared runtime to prove its Node/ABI target before archiving. */
export async function probeClosureNodeRuntime(
  executable: string,
  expected: Readonly<{ arch: string; platform: string; version: string }>,
): Promise<ClosureNodeRuntimeIdentity> {
  const script = [
    "JSON.stringify({",
    "arch:process.arch,",
    "electron:process.versions.electron??null,",
    "modules:process.versions.modules,",
    "node:process.versions.node,",
    "platform:process.platform,",
    "release:process.release.name",
    "})",
  ].join("");
  const value = await new Promise<unknown>((resolveProbe, rejectProbe) => {
    const child = spawn(executable, ["--print", script], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", rejectProbe);
    child.once("close", (code, signal) => {
      if (code !== 0 || signal != null) {
        rejectProbe(new Error(
          `Closure Node runtime probe failed with ${signal ?? `exit code ${code ?? "unknown"}`}${
            stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`
          }`,
        ));
        return;
      }
      try {
        resolveProbe(JSON.parse(stdout.trim()) as unknown);
      } catch (error) {
        rejectProbe(new Error("Closure Node runtime probe returned invalid JSON", { cause: error }));
      }
    });
  });
  return validateClosureNodeRuntimeIdentity(value, expected);
}

function closureNodeTarget(target: ClosurePlatformTarget): Readonly<{
  arch: "arm64" | "x64";
  entryPath: "bin/node" | "node.exe";
  platform: "darwin" | "win32";
}> {
  if (target === "darwin-arm64") {
    return { arch: "arm64", entryPath: "bin/node", platform: "darwin" };
  }
  if (target === "darwin-x64") {
    return { arch: "x64", entryPath: "bin/node", platform: "darwin" };
  }
  return { arch: "x64", entryPath: "node.exe", platform: "win32" };
}

/** Validate one already-extracted official Node tree before contribution sealing. */
export async function validateClosureNodeRuntimeComponent(input: Readonly<{
  nodeVersion: string;
  probe?: ClosureNodeRuntimeProbe;
  root: string;
  target: ClosurePlatformTarget;
}>): Promise<ClosurePreparedNodeRuntime> {
  if (!/^\d+\.\d+\.\d+$/u.test(input.nodeVersion)) {
    throw new Error(`Closure Node version must be exact: ${input.nodeVersion}`);
  }
  const target = closureNodeTarget(input.target);
  const tree = await inspectPreparedTree(input.root);
  const entry = tree.files.find((file) => file.path === target.entryPath);
  if (entry == null || entry.size <= 0) {
    throw new Error(`Closure Node runtime entry is missing: ${target.entryPath}`);
  }
  const identity = await (input.probe ?? probeClosureNodeRuntime)(
    join(tree.root, ...target.entryPath.split("/")),
    { arch: target.arch, platform: target.platform, version: input.nodeVersion },
  );
  return Object.freeze({ ...tree, entryPath: target.entryPath, identity });
}

/** Prove that the prepared native pack is loadable by the selected Node ABI. */
export async function probeClosureNativeModules(input: Readonly<{
  executable: string;
  modules: readonly string[];
  nativeRoot: string;
}>): Promise<readonly string[]> {
  if (input.modules.length === 0) throw new Error("Closure native probe requires at least one module");
  const modules = [...new Set(input.modules)].sort();
  for (const moduleName of modules) normalizeResourceId(moduleName);
  const nativeRoot = resolve(input.nativeRoot);
  await validateClosureNativeComponent(nativeRoot);
  const script = [
    'const {createRequire}=require("node:module");',
    'const {join}=require("node:path");',
    'const root=process.argv[1];',
    'const modules=JSON.parse(process.argv[2]);',
    'const load=createRequire(join(root,"probe.cjs"));',
    'for(const name of modules)load(name);',
    'process.stdout.write(JSON.stringify(modules));',
  ].join("");
  const output = await new Promise<string>((resolveProbe, rejectProbe) => {
    const child = spawn(input.executable, ["--eval", script, nativeRoot, JSON.stringify(modules)], {
      env: { ...process.env, NODE_PATH: join(nativeRoot, "node_modules") },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", rejectProbe);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) resolveProbe(stdout);
      else rejectProbe(new Error(
        `Closure native module probe failed with ${signal ?? `exit code ${code ?? "unknown"}`}${
          stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`
        }`,
      ));
    });
  });
  let loaded: unknown;
  try {
    loaded = JSON.parse(output) as unknown;
  } catch (error) {
    throw new Error("Closure native module probe returned invalid JSON", { cause: error });
  }
  if (!Array.isArray(loaded) || JSON.stringify(loaded) !== JSON.stringify(modules)) {
    throw new Error("Closure native module probe returned an unexpected module set");
  }
  return Object.freeze(modules);
}

/** Archive one already-prepared component root without interpreting its body. */
export async function archiveClosureComponent(options: Readonly<{
  entryPath?: string;
  outputPath: string;
  requiredPaths?: readonly string[];
  run?: ClosureComponentArchiveRunner;
  sourceRoot: string;
  target: ClosurePlatformTarget;
}>): Promise<ClosureComponentArchive | ClosureComponentEntrypointArchive> {
  const sourceRoot = resolve(options.sourceRoot);
  const outputPath = resolve(options.outputPath);
  assertOutputOutsideSource(sourceRoot, outputPath);
  const files = [...(await inspectPreparedTree(sourceRoot)).files];
  const fileCount = files.length;
  if (fileCount === 0) throw new Error(`Closure component source is empty: ${sourceRoot}`);
  const requiredPaths = new Set([
    ...(options.entryPath == null ? [] : [options.entryPath]),
    ...(options.requiredPaths ?? []),
  ]);
  for (const requiredPath of requiredPaths) {
    const entryPath = join(sourceRoot, ...safeEntrySegments(requiredPath));
    const entry = await lstat(entryPath).catch(() => null);
    if (entry == null || entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Closure component entry is missing: ${requiredPath}`);
    }
  }
  // Content-addressed blobs must survive repeated builds byte-for-byte. Build
  // staging mtimes and install-script modes are not product identity.
  await normalizeArchiveMetadata(sourceRoot);
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
  await validateClosureBodyComponent(options.bodyRoot);
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
    requiredPaths: [CLOSURE_LAUNCHER_HANDOFF_PATH, "native-loader.mjs"],
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

/** Build only one platform's native archive and seal its contribution. */
export async function buildClosureDistributionTargetContribution(options: Readonly<{
  blobOrigin: string;
  channel: ReleaseChannel;
  nativeRoot: string;
  outputRoot: string;
  run?: ClosureComponentArchiveRunner;
  target: ClosurePlatformTarget;
  version: string;
}>): Promise<ClosureDistributionTargetContribution> {
  const outputRoot = resolve(options.outputRoot);
  await validateClosureNativeComponent(options.nativeRoot);
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
    target: options.target,
    version: options.version,
  });
}
