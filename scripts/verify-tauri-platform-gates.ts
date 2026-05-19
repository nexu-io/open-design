import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

type Platform = "linux" | "win";

type SuiteResult = {
  exitCode?: unknown;
  platform?: unknown;
  spec?: unknown;
  status?: unknown;
};

type Manifest = {
  platform?: unknown;
  screenshot?: unknown;
  spec?: unknown;
};

type VerificationContext = {
  platform: Platform;
  reportRoot: string;
  summary: Record<string, unknown>;
};

const workspaceRoot = resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const checks: Array<Promise<void>> = [];
  if (args.winReport != null) checks.push(verifyReport("win", args.winReport));
  if (args.linuxReport != null) checks.push(verifyReport("linux", args.linuxReport));
  if (checks.length === 0) {
    throw new Error("usage: tsx scripts/verify-tauri-platform-gates.ts --win-report <dir> --linux-report <dir>");
  }
  await Promise.all(checks);
  console.log("Tauri platform gate reports passed verification.");
}

function parseArgs(args: string[]): { linuxReport?: string; winReport?: string } {
  const parsed: { linuxReport?: string; winReport?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if ((arg === "--linux-report" || arg === "--win-report") && value == null) {
      throw new Error(`${arg} requires a directory`);
    }
    if (arg === "--linux-report") {
      parsed.linuxReport = resolveFromWorkspace(value!);
      index += 1;
      continue;
    }
    if (arg === "--win-report") {
      parsed.winReport = resolveFromWorkspace(value!);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return parsed;
}

async function verifyReport(platform: Platform, reportRoot: string): Promise<void> {
  const manifest = await readJson<Manifest>(join(reportRoot, "manifest.json"));
  const suite = await readJson<SuiteResult>(join(reportRoot, "suite-result.json"));
  const summary = await readJson<Record<string, unknown>>(join(reportRoot, "summary.json"));

  expectEqual(`${platform} manifest platform`, manifest.platform, platform);
  expectEqual(`${platform} suite platform`, suite.platform, platform);
  expectEqual(`${platform} suite status`, suite.status, "success");
  expectEqual(`${platform} suite exitCode`, suite.exitCode, 0);

  const expectedSpec = platform === "win" ? "specs/win-tauri.spec.ts" : "specs/linux.spec.ts";
  expectEqual(`${platform} manifest spec`, manifest.spec, expectedSpec);
  expectEqual(`${platform} suite spec`, suite.spec, expectedSpec);

  const context: VerificationContext = { platform, reportRoot, summary };
  await verifyScreenshot(context, manifest);
  if (platform === "win") {
    verifyWindowsSummary(context);
  } else {
    verifyLinuxSummary(context);
  }
}

function verifyWindowsSummary({ summary }: VerificationContext): void {
  const build = expectRecord(summary.build, "win summary.build");
  expectEqual("win build.to", build.to, "nsis");
  expectNonEmptyString(build.installerPath, "win build.installerPath");

  const install = expectRecord(summary.install, "win summary.install");
  expectNonEmptyString(install.installDir, "win install.installDir");
  expectNonEmptyString(install.uninstallerPath, "win install.uninstallerPath");

  const start = expectRecord(summary.start, "win summary.start");
  expectEqual("win start.source", start.source, "installed");
  expectPositiveNumber(start.pid, "win start.pid");
  expectRunningStatus(start.status, "win start.status");

  verifyHealth(summary.health, "win health");

  const stop = expectRecord(summary.stop, "win summary.stop");
  expectEmptyArray(stop.remainingPids, "win stop.remainingPids");

  const uninstall = expectRecord(summary.uninstall, "win summary.uninstall");
  const residue = expectRecord(uninstall.residueObservation, "win uninstall.residueObservation");
  expectEmptyArray(residue.managedProcessPids, "win residue.managedProcessPids");
  expectEqual("win residue.productNamespaceRootExists", residue.productNamespaceRootExists, false);
  expectEmptyArray(residue.registryResidues, "win residue.registryResidues");
  expectEqual("win residue.installedExeExists", residue.installedExeExists, false);
  expectEqual("win residue.uninstallerExists", residue.uninstallerExists, false);
}

function verifyLinuxSummary({ summary }: VerificationContext): void {
  const build = expectRecord(summary.build, "linux summary.build");
  expectEqual("linux build.to", build.to, "appimage");
  expectNonEmptyString(build.appImagePath, "linux build.appImagePath");

  const install = expectRecord(summary.install, "linux summary.install");
  expectNonEmptyString(install.appImagePath, "linux install.appImagePath");

  const start = expectRecord(summary.start, "linux summary.start");
  expectEqual("linux start.source", start.source, "installed");
  expectPositiveNumber(start.pid, "linux start.pid");
  expectRunningStatus(start.status, "linux start.status");

  verifyHealth(summary.health, "linux health");

  const stop = expectRecord(summary.stop, "linux summary.stop");
  expectEmptyArray(stop.remainingPids, "linux stop.remainingPids");

  const headless = expectRecord(summary.headless, "linux summary.headless");
  const headlessInstall = expectRecord(headless.install, "linux headless.install");
  expectNonEmptyString(headlessInstall.launcherPath, "linux headless.install.launcherPath");
  const headlessStart = expectRecord(headless.start, "linux headless.start");
  expectPositiveNumber(headlessStart.pid, "linux headless.start.pid");
  const headlessStatus = expectRecord(headlessStart.status, "linux headless.start.status");
  expectHttpLocalhost(headlessStatus.url, "linux headless.start.status.url");
  const headlessStop = expectRecord(headless.stop, "linux headless.stop");
  expectEmptyArray(headlessStop.remainingPids, "linux headless.stop.remainingPids");

  const uninstall = expectRecord(summary.uninstall, "linux summary.uninstall");
  const removed = expectRecord(uninstall.removed, "linux uninstall.removed");
  expectNotEqual("linux uninstall.removed.appImage", removed.appImage, "skipped-process-running");
  expectNotEqual("linux uninstall.removed.desktop", removed.desktop, "skipped-process-running");
  expectNotEqual("linux uninstall.removed.icon", removed.icon, "skipped-process-running");
}

async function verifyScreenshot({ platform, reportRoot, summary }: VerificationContext, manifest: Manifest): Promise<void> {
  const screenshot = expectNonEmptyString(summary.screenshot ?? manifest.screenshot, `${platform} screenshot relpath`);
  const screenshotPath = resolve(reportRoot, screenshot);
  await access(screenshotPath);
  const stats = await stat(screenshotPath);
  if (stats.size <= 0) {
    throw new Error(`${platform} screenshot is empty: ${screenshotPath}`);
  }
}

function verifyHealth(value: unknown, label: string): void {
  const healthEval = expectRecord(value, label);
  expectHttpLocalhost(healthEval.href, `${label}.href`);
  expectEqual(`${label}.status`, healthEval.status, 200);
  const health = expectRecord(healthEval.health, `${label}.health`);
  expectEqual(`${label}.health.ok`, health.ok, true);
  expectNonEmptyString(health.version, `${label}.health.version`);
}

function expectRunningStatus(value: unknown, label: string): void {
  const status = expectRecord(value, label);
  expectEqual(`${label}.state`, status.state, "running");
  expectHttpLocalhost(status.url, `${label}.url`);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function expectPositiveNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function expectEmptyArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 0) {
    throw new Error(`${label} must be an empty array`);
  }
}

function expectHttpLocalhost(value: unknown, label: string): void {
  const text = expectNonEmptyString(value, label);
  if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(text)) {
    throw new Error(`${label} must be a loopback HTTP URL, got ${text}`);
  }
}

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectNotEqual(label: string, actual: unknown, forbidden: unknown): void {
  if (actual === forbidden) {
    throw new Error(`${label} must not be ${JSON.stringify(forbidden)}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`required report file is missing: ${path}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`invalid JSON in ${path}: ${error.message}`);
    }
    throw error;
  }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value != null && "code" in value;
}

function resolveFromWorkspace(path: string): string {
  return isAbsolute(path) ? path : resolve(workspaceRoot, path);
}

await main();
