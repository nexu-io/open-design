import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { standaloneTreeSha256 } from "@open-design/standalone/tree";
import { build } from "esbuild";
import { pack } from "@open-design/archive/build";
import { closureNodeExternals } from "./node-externals.js";
import { closureRuntimeDependencies as runtimeDependencies } from "./runtime-dependencies.js";
import { pruneClosureNativeDependencies } from "./native-dependencies.js";

type TreeEntry = Readonly<{ path: string; sha256: string; size: number }>;

async function runPnpm(workspaceRoot: string, args: readonly string[], environment: NodeJS.ProcessEnv = {}): Promise<void> {
  const pnpmScript = process.env.npm_execpath;
  const command = pnpmScript == null ? "pnpm" : process.execPath;
  const commandArgs = pnpmScript == null ? [...args] : [pnpmScript, ...args];
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, { cwd: workspaceRoot, env: { ...process.env, ...environment }, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => code === 0 && signal == null
      ? resolveRun()
      : rejectRun(new Error(`pnpm ${args.join(" ")} failed with ${signal ?? code}`)));
  });
}

async function runNpm(directory: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn("npm", [...args], { cwd: directory, env: process.env, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => code === 0 && signal == null
      ? resolveRun()
      : rejectRun(new Error(`npm ${args.join(" ")} failed with ${signal ?? code}`)));
  });
}

async function inventory(root: string, current = root): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    // Distribution resources are executable closure inputs, not debugging
    // archives. Source maps stay in CI/build outputs and never enter the exact
    // resource tree or its identity.
    // This root is the producer-owned staging tree, never a workspace source.
    // Remove excluded maps before native packing so bytes and inventory agree.
    if (entry.isFile() && entry.name.endsWith(".map")) { await rm(path); continue; }
    if (entry.isSymbolicLink()) throw new Error(`Closure resource contains a symbolic link after normalization: ${path}`);
    if (entry.isDirectory()) entries.push(...await inventory(root, path));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      entries.push(Object.freeze({
        path: relative(root, path).split(sep).join("/"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
      }));
    }
  }
  return entries;
}

async function copyTreeDereferenced(source: string, destination: string): Promise<void> {
  const sourcePath = await realpath(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (sourcePath == null) return;
  const details = await stat(sourcePath);
  if (details.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(sourcePath)) await copyTreeDereferenced(join(sourcePath, entry), join(destination, entry));
    return;
  }
  if (details.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await cp(sourcePath, destination);
  }
}

async function archive(root: string, outputPath: string): Promise<{ sha256: string; size: number; treeSha256: string }> {
  const entries = await inventory(root);
  const packed = await pack(root, outputPath, { reproducible: true, permissions: "portable" });
  return Object.freeze({
    sha256: packed.sha256,
    size: packed.size,
    treeSha256: standaloneTreeSha256(entries),
  });
}

export async function buildClosureRuntimeResources(input: Readonly<{ outputDirectory: string; workspaceRoot: string }>) {
  const outputDirectory = resolve(input.outputDirectory);
  const workspaceRoot = resolve(input.workspaceRoot);
  const stage = join(outputDirectory, "stage");
  await mkdir(dirname(outputDirectory), { recursive: true });
  await mkdir(outputDirectory);
  await mkdir(stage, { recursive: true });
  await runPnpm(workspaceRoot, ["--filter", "@open-design/daemon", "build"]);
  await runPnpm(workspaceRoot, ["--filter", "@open-design/web", "build:sidecar"]);
  await runPnpm(workspaceRoot, ["--filter", "@open-design/web", "build"], { OD_WEB_OUTPUT_MODE: "standalone" });

  const daemonRoot = join(stage, "daemon");
  const webRoot = join(stage, "web");
  await Promise.all([mkdir(daemonRoot, { recursive: true }), mkdir(webRoot, { recursive: true })]);
  await writeFile(join(daemonRoot, "package.json"), `${JSON.stringify({ private: true, type: "module", dependencies: runtimeDependencies }, null, 2)}\n`, "utf8");
  await runNpm(daemonRoot, ["install", "--omit=dev", "--no-package-lock"]);
  await pruneClosureNativeDependencies(daemonRoot);
  await rm(join(daemonRoot, "node_modules", ".bin"), { force: true, recursive: true });
  const daemonBundle = (entrypoint: string, outfile: string) => build({
    entryPoints: [entrypoint],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    banner: { js: 'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);' },
    plugins: [closureNodeExternals()],
    external: [...Object.keys(runtimeDependencies), "fsevents"],
  });
  await Promise.all([
    daemonBundle(join(workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js"), join(daemonRoot, "sidecar.mjs")),
    daemonBundle(join(workspaceRoot, "apps", "daemon", "dist", "cli.js"), join(daemonRoot, "daemon-cli.mjs")),
  ]);
  await copyTreeDereferenced(join(workspaceRoot, "apps", "web", ".next", "standalone"), join(webRoot, "standalone"));
  const standaloneApp = join(webRoot, "standalone", "apps", "web");
  // Next's pnpm standalone output links transitive packages through the root
  // virtual store. Distribution resources cannot retain symlinks, so hoist
  // that resolved dependency view beside the dereferenced `next` package.
  await copyTreeDereferenced(
    join(workspaceRoot, "apps", "web", ".next", "standalone", "node_modules", ".pnpm", "node_modules"),
    join(standaloneApp, "node_modules"),
  );
  await cp(join(workspaceRoot, "apps", "web", ".next", "static"), join(standaloneApp, ".next", "static"), { recursive: true, dereference: true });
  await cp(join(workspaceRoot, "apps", "web", "public"), join(standaloneApp, "public"), { recursive: true, dereference: true });
  await build({
    entryPoints: [join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js")],
    outfile: join(webRoot, "sidecar.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
  });

  const artifactsRoot = join(outputDirectory, "artifacts");
  const daemonPath = join(artifactsRoot, "open-design-daemon.zip");
  const webPath = join(artifactsRoot, "open-design-web.zip");
  const [daemon, web] = await Promise.all([archive(daemonRoot, daemonPath), archive(webRoot, webPath)]);
  const resources = Object.freeze([
    Object.freeze({ id: "open-design-daemon", file: "open-design-daemon.zip", path: daemonPath, entrypoint: "sidecar.mjs", ...daemon }),
    Object.freeze({ id: "open-design-web", file: "open-design-web.zip", path: webPath, entrypoint: "sidecar.mjs", ...web }),
  ]);
  const receipt = Object.freeze({ schemaVersion: 1 as const, operation: "closure.runtime-resources.build" as const, resources });
  await rm(stage, { force: true, recursive: true });
  return receipt;
}
