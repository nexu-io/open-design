import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parse, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPackageManagerInvocation } from "@open-design/platform";

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);

function runId(): string {
  return (process.env.OD_WIN_LOCAL_RUN_ID ?? new Date().toISOString().replace(/[-:.TZ]/gu, ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "")
    .slice(-10);
}

function run(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = createPackageManagerInvocation(args, env);
    const child = spawn(invocation.command, invocation.args, {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm failed with ${signal == null ? `exit code ${code}` : `signal ${signal}`}`));
    });
  });
}

function capture(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = createPackageManagerInvocation(args, env);
    const child = spawn(invocation.command, invocation.args, {
      cwd: workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`pnpm failed with ${signal == null ? `exit code ${code}` : `signal ${signal}`}`));
    });
  });
}

async function bestEffortRun(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await run(args, env);
  } catch (error) {
    console.error(`Windows local saturation cleanup failed: ${String(error)}`);
  }
}

async function captureJson(args: string[], outputPath: string, env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const output = await capture(args, env);
  await writeFile(outputPath, output, "utf8");
  return JSON.parse(output) as Record<string, unknown>;
}

function stringField(value: unknown, name: string, source: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} did not report ${name}`);
  }
  return value;
}

if (process.platform !== "win32") throw new Error("Windows local saturation must run on Windows");

const slug = runId();
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? `wl-${slug.slice(-6)}`;
if (!/^[a-z0-9][a-z0-9._-]{0,15}$/u.test(namespace)) {
  throw new Error(`Windows local saturation namespace must be a lowercase filesystem-safe segment of at most 16 characters: ${namespace}`);
}

const smokeProfile = process.env.OD_WIN_LOCAL_SMOKE_PROFILE ?? "full";
if (smokeProfile !== "core" && smokeProfile !== "full") {
  throw new Error(`Windows local saturation profile must be core or full: ${smokeProfile}`);
}

// Keep the default below a short drive-root path. Electron Builder and NSIS
// both create deeply nested intermediates, and a workspace-relative root can
// exceed legacy Windows path limits before the product is launched.
const defaultRunRoot = join(parse(workspaceRoot).root, "odwl", slug);
const runRoot = process.env.OD_WIN_LOCAL_RUN_ROOT ?? defaultRunRoot;
const toolsPackDir = join(runRoot, "tools-pack");
const buildJsonPath = join(runRoot, "tools-pack.json");
const reportDir = join(runRoot, "report");
const cacheDir = process.env.OD_WIN_LOCAL_CACHE_DIR ?? join(parse(workspaceRoot).root, "odpc");
const buildEnv = {
  ...process.env,
  OD_PACKAGED_E2E_HEADLESS: "1",
  OPEN_DESIGN_AMR_PROFILE: "test",
};

await mkdir(runRoot, { recursive: true });
await run(["--filter", "@open-design/tools-pack", "build:workspace"], buildEnv);
await run(["--filter", "@open-design/tools-release", "build"], buildEnv);
await run(["--filter", "@open-design/tools-serve", "build"], buildEnv);

const rootPackage = JSON.parse(await readFile(join(workspaceRoot, "package.json"), "utf8")) as { version?: unknown };
const baseVersion = stringField(rootPackage.version, "version", "workspace package.json");
const exactName = process.env.OD_WIN_LOCAL_EXACT_NAME
  ?? `e2e${createHash("sha256").update(slug).digest("hex").slice(0, 8)}`;
if (!/^[a-z0-9]{1,12}$/u.test(exactName) || exactName === "local") {
  throw new Error(`Windows full saturation exact name must be 1-12 lowercase letters or digits: ${exactName}`);
}
const releaseChannel = smokeProfile === "full" ? exactName : "local";
const releaseVersion = smokeProfile === "full" ? `${baseVersion}-${exactName}.1` : undefined;
const updateVersion = smokeProfile === "full" ? `${baseVersion}-${exactName}.2` : undefined;
const debugChannel = smokeProfile === "full" ? `exact:${exactName}` : "local";
const versionArgs = releaseVersion == null
  ? []
  : ["--release-version", releaseVersion, "--shell-version", releaseVersion];

// A release-shaped desktop owns this transaction file for its full lifetime.
// Fail closed instead of disturbing an installed beta or another local proof.
const appDataRoot = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
const launchContextPath = join(appDataRoot, "Open Design", "open-design-launch-context.json");
if (smokeProfile === "full" && await access(launchContextPath).then(() => true, () => false)) {
  throw new Error(`Windows full saturation requires no active packaged launch transaction: ${launchContextPath}`);
}

await run([
  "exec", "tools-pack", "win", "cleanup",
  "--dir", toolsPackDir,
  "--namespace", namespace,
  "--json",
], buildEnv);

const build = await captureJson([
  "exec", "tools-pack", "win", "build",
  "--dir", toolsPackDir,
  "--cache-dir", cacheDir,
  "--namespace", namespace,
  "--debug-channel", debugChannel,
  ...(smokeProfile === "full" ? ["--portable"] : []),
  ...versionArgs,
  "--sign-mode", "unsigned",
  "--to", smokeProfile === "full" ? "all" : "nsis",
  "--json",
], buildJsonPath, buildEnv);

const builtReleaseVersion = stringField(build.releaseVersion, "releaseVersion", buildJsonPath);
const shell = build.shell as { version?: unknown } | undefined;
const shellVersion = stringField(shell?.version, "shell.version", buildJsonPath);
const smokeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  OD_PACKAGED_E2E_BUILD_JSON_PATH: buildJsonPath,
  OD_PACKAGED_E2E_HEADLESS: "1",
  OD_PACKAGED_E2E_NAMESPACE: namespace,
  OD_PACKAGED_E2E_RELEASE_CHANNEL: releaseChannel,
  OD_PACKAGED_E2E_RELEASE_VERSION: builtReleaseVersion,
  OD_PACKAGED_E2E_REPORT_DIR: reportDir,
  OD_PACKAGED_E2E_SHELL_VERSION: shellVersion,
  OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED: smokeProfile === "full" ? "0" : "1",
  OD_PACKAGED_E2E_TOOLS_PACK_DIR: toolsPackDir,
  OD_PACKAGED_E2E_WIN: "1",
  OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: smokeProfile,
};

if (smokeProfile === "full") {
  const closureDir = join(runRoot, "closure");
  const closureToolsPackDir = join(closureDir, "tools-pack");
  const sharedBuildJsonPath = join(closureDir, "shared.json");
  const targetBuildJsonPath = join(closureDir, "target.json");
  const closureManifestPath = join(closureDir, "distribution.json");
  const updateBuildJsonPath = join(runRoot, "windows-tools-pack-update-build.json");
  await mkdir(closureDir, { recursive: true });

  const sharedBuild = await captureJson([
    "exec", "tools-pack", "closure", "build-distribution-shared",
    "--blob-origin", "https://local.invalid",
    "--channel", releaseChannel,
    "--dir", closureToolsPackDir,
    "--min-shell-version", builtReleaseVersion,
    "--skip-workspace-build",
    "--version", builtReleaseVersion,
    "--json",
  ], sharedBuildJsonPath, buildEnv);
  const targetBuild = await captureJson([
    "exec", "tools-pack", "closure", "build-distribution-target",
    "--blob-origin", "https://local.invalid",
    "--channel", releaseChannel,
    "--dir", closureToolsPackDir,
    "--platform", "win32-x64",
    "--skip-workspace-build",
    "--version", builtReleaseVersion,
    "--json",
  ], targetBuildJsonPath, buildEnv);
  const sharedContribution = stringField(sharedBuild.contributionPath, "contributionPath", sharedBuildJsonPath);
  const targetContribution = stringField(targetBuild.contributionPath, "contributionPath", targetBuildJsonPath);
  const sharedBlobRoot = stringField(sharedBuild.blobRoot, "blobRoot", sharedBuildJsonPath);
  const targetBlobRoot = stringField(targetBuild.blobRoot, "blobRoot", targetBuildJsonPath);
  await run([
    "exec", "tools-release", "merge-closure-distribution",
    sharedContribution,
    targetContribution,
    "--output", closureManifestPath,
  ], buildEnv);

  await captureJson([
    "exec", "tools-pack", "win", "build",
    "--dir", join(runRoot, "tools-pack-update"),
    "--cache-dir", cacheDir,
    "--namespace", namespace,
    "--debug-channel", debugChannel,
    "--portable",
    "--release-version", builtReleaseVersion,
    "--shell-version", stringField(updateVersion, "updateVersion", "full saturation"),
    "--launcher-version", stringField(updateVersion, "updateVersion", "full saturation"),
    "--sign-mode", "unsigned",
    "--to", "nsis",
    "--json",
  ], updateBuildJsonPath, { ...buildEnv, OD_TOOLS_PACK_WIN_NSIS_TEST_HOOKS: "faults" });

  smokeEnv.OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON = JSON.stringify([sharedBlobRoot, targetBlobRoot]);
  smokeEnv.OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH = closureManifestPath;
  // The historical migration lane is beta-only and consumes the pinned public
  // beta installer. Running it under a local exact identity would either be
  // invalid evidence or collide with an installed beta, so local saturation
  // owns the complete Shell + Standalone lifecycle and leaves migration to the
  // release-beta job.
  smokeEnv.OD_PACKAGED_E2E_WIN_SMOKE_LANES = "shell,standalone";
  smokeEnv.OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH = updateBuildJsonPath;
  smokeEnv.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = "tools-serve";
}

try {
  await run(["--dir", "e2e", "exec", "tsx", "scripts/release-smoke.ts", "win", "specs/win.spec.ts"], smokeEnv);
} finally {
  await bestEffortRun(["exec", "tools-pack", "win", "stop", "--dir", toolsPackDir, "--namespace", namespace, "--json"], buildEnv);
  await bestEffortRun(["exec", "tools-pack", "win", "uninstall", "--dir", toolsPackDir, "--namespace", namespace, "--json"], buildEnv);
}

console.info(`Windows local saturation report: ${reportDir}`);
console.info(`Windows local saturation namespace: ${namespace}`);
