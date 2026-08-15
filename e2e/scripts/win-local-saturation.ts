import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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

if (process.platform !== "win32") throw new Error("Windows local saturation must run on Windows");

const slug = runId();
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? `wl-${slug.slice(-6)}`;
if (!/^[a-z0-9][a-z0-9._-]{0,15}$/u.test(namespace)) {
  throw new Error(`Windows local saturation namespace must be a lowercase filesystem-safe segment of at most 16 characters: ${namespace}`);
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
const buildOutput = await capture([
  "exec", "tools-pack", "win", "build",
  "--dir", toolsPackDir,
  "--cache-dir", cacheDir,
  "--namespace", namespace,
  "--debug-channel", "local",
  "--sign-mode", "unsigned",
  "--to", "nsis",
  "--json",
], buildEnv);
await writeFile(buildJsonPath, buildOutput, "utf8");

const build = JSON.parse(buildOutput) as { releaseVersion?: unknown; shell?: { version?: unknown } };
if (typeof build.releaseVersion !== "string" || typeof build.shell?.version !== "string") {
  throw new Error(`tools-pack build did not report releaseVersion and shell.version: ${buildJsonPath}`);
}

await run(["--dir", "e2e", "exec", "tsx", "scripts/release-smoke.ts", "win", "specs/win.spec.ts"], {
  ...process.env,
  OD_PACKAGED_E2E_BUILD_JSON_PATH: buildJsonPath,
  OD_PACKAGED_E2E_HEADLESS: "1",
  OD_PACKAGED_E2E_NAMESPACE: namespace,
  OD_PACKAGED_E2E_RELEASE_CHANNEL: "local",
  OD_PACKAGED_E2E_RELEASE_VERSION: build.releaseVersion,
  OD_PACKAGED_E2E_REPORT_DIR: reportDir,
  OD_PACKAGED_E2E_SHELL_VERSION: build.shell.version,
  OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED: "1",
  OD_PACKAGED_E2E_TOOLS_PACK_DIR: toolsPackDir,
  OD_PACKAGED_E2E_WIN: "1",
  OD_PACKAGED_E2E_WIN_SMOKE_PROFILE: "core",
});

console.info(`Windows local saturation report: ${reportDir}`);
