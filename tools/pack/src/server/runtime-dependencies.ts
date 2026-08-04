import { spawn } from "node:child_process";
import {
  access,
  chmod,
  constants,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import { createCommandInvocation } from "@open-design/platform";

import {
  assertNativeServerTarget,
  type ServerTarget,
} from "./config.js";

export const SERVER_RUNTIME_DEPENDENCIES = {
  "better-sqlite3": "12.10.0",
  "blake3-wasm": "2.1.5",
  "node-pty": "1.1.0",
} as const;

export const SERVER_DARWIN_RUNTIME_DEPENDENCIES = {
  fsevents: "2.3.3",
} as const;

const RUNTIME_PACKAGE_MANIFEST = "runtime-package.json";
const RUNTIME_PACKAGE_LOCK = "runtime-package-lock.json";

export type ServerRuntimeCommand = {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
};

export type ServerRuntimeCommandRunner = (
  command: ServerRuntimeCommand,
) => Promise<void>;

export type MaterializeServerRuntimeDependenciesOptions = {
  releaseRoot: string;
  runCommand?: ServerRuntimeCommandRunner;
  target: ServerTarget;
  workspaceRoot: string;
  workRoot: string;
};

function expectedRuntimeDependencies(
  target: ServerTarget,
): Record<string, string> {
  return {
    ...SERVER_RUNTIME_DEPENDENCIES,
    ...(target.platform === "darwin"
      ? SERVER_DARWIN_RUNTIME_DEPENDENCIES
      : {}),
  };
}

function cleanNativeInstallEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const name of [
    "npm_config_arch",
    "npm_config_build_from_source",
    "npm_config_disturl",
    "npm_config_platform",
    "npm_config_runtime",
    "npm_config_target",
    "npm_config_target_arch",
    "npm_config_verify_deps_before_run",
  ]) {
    delete next[name];
    delete next[name.toUpperCase()];
  }
  return next;
}

async function defaultRunCommand(
  command: ServerRuntimeCommand,
): Promise<void> {
  const invocation = createCommandInvocation({
    args: command.args,
    command: command.command,
    env: command.env,
  });
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveCommand();
        return;
      }
      rejectCommand(
        new Error(
          `server runtime dependency install failed with ${
            signal == null ? `exit code ${String(code)}` : `signal ${signal}`
          }`,
        ),
      );
    });
  });
}

async function assertNonEmptyFile(path: string, label: string): Promise<void> {
  const metadata = await stat(path).catch(() => null);
  if (metadata == null || !metadata.isFile() || metadata.size === 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
}

async function readInstalledVersion(
  nodeModulesRoot: string,
  packageName: string,
  expectedVersion: string,
): Promise<string> {
  const manifestPath = join(nodeModulesRoot, packageName, "package.json");
  let manifest: { version?: unknown };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      version?: unknown;
    };
  } catch (error) {
    throw new Error(
      `server runtime dependency manifest is unreadable: ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `server runtime dependency ${packageName} expected ${expectedVersion}, ` +
        `found ${String(manifest.version)}`,
    );
  }
  return expectedVersion;
}

async function findNodePtyNativeRoot(
  nodePtyRoot: string,
  target: ServerTarget,
): Promise<string> {
  const candidates = [
    join(nodePtyRoot, "build", "Release"),
    join(nodePtyRoot, "prebuilds", `${target.platform}-${target.arch}`),
  ];
  for (const candidate of candidates) {
    const metadata = await stat(join(candidate, "pty.node")).catch(() => null);
    if (metadata?.isFile() && metadata.size > 0) return candidate;
  }
  throw new Error(
    `node-pty has no native assets for ${target.platform}-${target.arch}: ` +
      candidates.join(", "),
  );
}

async function validateNodePty(
  nodeModulesRoot: string,
  target: ServerTarget,
): Promise<void> {
  const nodePtyRoot = join(nodeModulesRoot, "node-pty");
  const nativeRoot = await findNodePtyNativeRoot(nodePtyRoot, target);
  await assertNonEmptyFile(
    join(nativeRoot, "pty.node"),
    "node-pty native binding",
  );

  if (target.platform === "win32") {
    for (const file of [
      "conpty.node",
      "conpty_console_list.node",
      "winpty-agent.exe",
      "winpty.dll",
    ]) {
      await assertNonEmptyFile(
        join(nativeRoot, file),
        `node-pty Windows asset ${file}`,
      );
    }
    return;
  }

  // node-pty only builds spawn-helper for macOS (binding.gyp OS=="mac").
  // Linux ships pty.node alone after node-gyp rebuild; darwin prebuilds
  // include both pty.node and spawn-helper.
  if (target.platform === "darwin") {
    const helperPath = join(nativeRoot, "spawn-helper");
    await assertNonEmptyFile(helperPath, "node-pty spawn-helper");
    await chmod(helperPath, 0o755);
    await access(helperPath, constants.X_OK);
  }
}

async function validateRuntimeDependencies(
  nodeModulesRoot: string,
  target: ServerTarget,
): Promise<Record<string, string>> {
  const expected = expectedRuntimeDependencies(target);
  const versions: Record<string, string> = {};
  for (const [packageName, expectedVersion] of Object.entries(expected)) {
    versions[packageName] = await readInstalledVersion(
      nodeModulesRoot,
      packageName,
      expectedVersion,
    );
  }

  await assertNonEmptyFile(
    join(
      nodeModulesRoot,
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
    "better-sqlite3 native binding",
  );
  await assertNonEmptyFile(
    join(
      nodeModulesRoot,
      "blake3-wasm",
      "dist",
      "wasm",
      "nodejs",
      "blake3_js_bg.wasm",
    ),
    "blake3-wasm Node asset",
  );
  await validateNodePty(nodeModulesRoot, target);
  if (target.platform === "darwin") {
    await assertNonEmptyFile(
      join(nodeModulesRoot, "fsevents", "fsevents.node"),
      "fsevents native binding",
    );
  }
  return versions;
}

async function removeBinDirectories(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".bin") {
        await rm(entryPath, { force: true, recursive: true });
      } else {
        await removeBinDirectories(entryPath);
      }
    }
  }
}

async function pruneNodePtyNativeAssets(
  nodeModulesRoot: string,
  target: ServerTarget,
): Promise<void> {
  const nodePtyRoot = join(nodeModulesRoot, "node-pty");
  const prebuildsRoot = join(nodePtyRoot, "prebuilds");
  const targetPrebuild = `${target.platform}-${target.arch}`;
  const prebuilds = await readdir(prebuildsRoot, {
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of prebuilds) {
    if (entry.name !== targetPrebuild) {
      await rm(join(prebuildsRoot, entry.name), {
        force: true,
        recursive: true,
      });
    }
  }

  for (const nativeRoot of [
    join(nodePtyRoot, "build", "Release"),
    join(prebuildsRoot, targetPrebuild),
  ]) {
    const entries = await readdir(nativeRoot, {
      withFileTypes: true,
    }).catch(() => []);
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && entry.name.toLowerCase().endsWith(".pdb"),
        )
        .map((entry) => rm(join(nativeRoot, entry.name), { force: true })),
    );
  }
}

async function assertNoSymlinks(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `server runtime dependency tree must not contain symlinks: ${entryPath}`,
      );
    }
    if (metadata.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

export async function materializeServerRuntimeDependencies({
  releaseRoot,
  runCommand = defaultRunCommand,
  target,
  workspaceRoot,
  workRoot,
}: MaterializeServerRuntimeDependenciesOptions): Promise<
  Record<string, string>
> {
  assertNativeServerTarget(target);
  if (process.versions.node.split(".", 1)[0] !== "24") {
    throw new Error(
      `server runtime dependencies require Node 24, found ${process.version}`,
    );
  }

  const resolvedReleaseRoot = resolve(releaseRoot);
  const resolvedWorkRoot = resolve(workRoot);
  const resourceRoot = join(
    resolve(workspaceRoot),
    "tools",
    "pack",
    "resources",
    "server",
  );
  await mkdir(resolvedReleaseRoot, { recursive: true });
  await mkdir(resolvedWorkRoot, { recursive: true });
  const installRoot = await mkdtemp(
    join(resolvedWorkRoot, "runtime-dependencies-"),
  );
  const releaseStage = join(
    resolvedReleaseRoot,
    `.node_modules-${process.pid}`,
  );

  try {
    await copyFile(
      join(resourceRoot, RUNTIME_PACKAGE_MANIFEST),
      join(installRoot, "package.json"),
    );
    await copyFile(
      join(resourceRoot, RUNTIME_PACKAGE_LOCK),
      join(installRoot, "package-lock.json"),
    );
    await runCommand({
      args: ["ci", "--omit=dev", "--no-audit", "--no-fund"],
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      cwd: installRoot,
      env: cleanNativeInstallEnv(process.env),
    });

    const installedNodeModules = join(installRoot, "node_modules");
    await pruneNodePtyNativeAssets(installedNodeModules, target);
    const versions = await validateRuntimeDependencies(
      installedNodeModules,
      target,
    );
    await removeBinDirectories(installedNodeModules);
    await assertNoSymlinks(installedNodeModules);

    await rm(releaseStage, { force: true, recursive: true });
    await cp(installedNodeModules, releaseStage, {
      dereference: true,
      recursive: true,
    });
    const destination = join(resolvedReleaseRoot, "node_modules");
    await rm(destination, { force: true, recursive: true });
    await rename(releaseStage, destination);
    return versions;
  } finally {
    await rm(releaseStage, { force: true, recursive: true }).catch(
      () => undefined,
    );
    await rm(installRoot, { force: true, recursive: true }).catch(
      () => undefined,
    );
  }
}
