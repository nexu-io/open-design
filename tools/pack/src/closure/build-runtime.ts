import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";

import {
  resolveHostClosurePlatformTarget,
  type ClosurePlatformTarget,
} from "./platform.js";

export const CLOSURE_INTERNAL_PACKAGES = [
  { directory: "packages/release", name: "@open-design/release" },
  { directory: "packages/closure", name: "@open-design/closure" },
  { directory: "packages/download", name: "@open-design/download" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "apps/standalone", name: "@open-design/standalone" },
] as const;

export const CLOSURE_DAEMON_EXTERNALS = ["better-sqlite3", "blake3-wasm", "node-pty"] as const;
export const CLOSURE_NODE_NATIVE_MODULES = [...CLOSURE_DAEMON_EXTERNALS] as const;

export function assertNativeBuildHost(target: ClosurePlatformTarget): void {
  const current = resolveHostClosurePlatformTarget();
  if (current !== target) {
    throw new Error(
      `Closure ${target} artifacts must be built on a ${target} host; current host is ${process.platform}-${process.arch}`,
    );
  }
}

export function runClosureBuildCommand(command: string, args: readonly string[], options: {
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

export async function runClosurePnpm(
  workspaceRoot: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const invocation = createPackageManagerInvocation([...args], env);
  await runClosureBuildCommand(invocation.command, invocation.args, {
    cwd: workspaceRoot,
    env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

export async function buildClosureWorkspace(workspaceRoot: string): Promise<void> {
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/daemon...", "build"]);
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/standalone", "build"]);
  await runClosurePnpm(
    workspaceRoot,
    ["--filter", "@open-design/web...", "build"],
    { ...process.env, NODE_ENV: "production", OD_WEB_OUTPUT_MODE: "standalone" },
  );
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/web", "build:sidecar"]);
}

export async function buildClosureDistributionWorkspace(workspaceRoot: string): Promise<void> {
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/daemon...", "build"]);
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/standalone", "build"]);
  await runClosurePnpm(
    workspaceRoot,
    ["--filter", "@open-design/web...", "build"],
    { ...process.env, NODE_ENV: "production", OD_WEB_OUTPUT_MODE: "" },
  );
  await runClosurePnpm(workspaceRoot, ["--filter", "@open-design/web", "build:sidecar"]);
}

export async function resolveNodeNpmCliPath(nodeExecutable = process.execPath): Promise<string> {
  const executableRoot = dirname(nodeExecutable);
  const candidates = process.platform === "win32"
    ? [join(executableRoot, "node_modules", "npm", "bin", "npm-cli.js")]
    : [
        join(dirname(executableRoot), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
        join(executableRoot, "node_modules", "npm", "bin", "npm-cli.js"),
      ];
  for (const candidate of candidates) {
    if ((await stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  throw new Error(`Closure build could not resolve npm-cli.js beside ${nodeExecutable}`);
}

export async function packClosureWorkspaceTarballs(
  workspaceRoot: string,
  tarballsRoot: string,
): Promise<Record<string, string>> {
  await rm(tarballsRoot, { force: true, recursive: true });
  await mkdir(tarballsRoot, { recursive: true });
  const packed: Record<string, string> = {};
  for (const packageInfo of CLOSURE_INTERNAL_PACKAGES) {
    const before = new Set(await readdir(tarballsRoot));
    await runClosurePnpm(workspaceRoot, [
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

export async function pruneClosureNativeRuntime(
  appRoot: string,
  target: ClosurePlatformTarget,
): Promise<void> {
  const nodePtyRoot = join(appRoot, "node_modules", "node-pty");
  const prebuildsRoot = join(nodePtyRoot, "prebuilds");
  for (const entry of await readdir(prebuildsRoot, { withFileTypes: true })) {
    if (entry.name !== target) await rm(join(prebuildsRoot, entry.name), { force: true, recursive: true });
  }
  const targetRoot = join(prebuildsRoot, target);
  for (const entry of await readdir(targetRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdb")) {
      await rm(join(targetRoot, entry.name), { force: true });
    }
  }
  await Promise.all([
    "deps",
    "scripts",
    "src",
    "third_party",
    "typings",
  ].map(async (entry) => await rm(join(nodePtyRoot, entry), { force: true, recursive: true })));
  const nativeEntry = join(prebuildsRoot, target, "pty.node");
  if (!(await stat(nativeEntry).catch(() => null))?.isFile()) {
    throw new Error(`Closure node-pty prebuild is missing for ${target}: ${nativeEntry}`);
  }

  const betterSqliteRoot = join(appRoot, "node_modules", "better-sqlite3");
  await Promise.all([
    "binding.gyp",
    "deps",
    "src",
  ].map(async (entry) => await rm(join(betterSqliteRoot, entry), { force: true, recursive: true })));
}
