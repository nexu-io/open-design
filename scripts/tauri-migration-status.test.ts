import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  m4EvidenceLogMarker,
  m4PlatformGateLabels,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m6ElectronDepsLabel,
  m6ElectronGuidanceLabel,
  m6ElectronResourcesLabel,
  m6ElectronRuntimeLabel,
  m6ElectronTestsLabel,
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const statusScript = join(scriptsRoot, "tauri-migration-status.ts");

test("tauri-migration-status reports the current M4 blocker state", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as {
    defaults: { releaseBeta: string; toolsDev: string; toolsPack: string };
    groups: Array<{ checked: number; name: string; total: number }>;
    nextActions: string[];
    phase: string;
  };

  assert.equal(parsed.phase, "M4");
  assert.deepEqual(parsed.defaults, { releaseBeta: "electron", toolsDev: "electron", toolsPack: "electron" });
  assert.deepEqual(
    parsed.groups.map(({ checked, name, total }) => ({ checked, name, total })),
    [
      { checked: 0, name: "M4", total: 3 },
      { checked: 0, name: "M5", total: 5 },
      { checked: 0, name: "M6", total: 5 },
    ],
  );
  assert.match(parsed.nextActions.join("\n"), /verify-tauri-migration-handoff/);
  assert.match(parsed.nextActions.join("\n"), /packaged handoff archive/);
  assert.match(parsed.nextActions.join("\n"), /push-tauri-migration-handoff/);
  assert.match(parsed.nextActions.join("\n"), /advance-tauri-migration-m4-m5/);
});

test("tauri-migration-status advances to M5 after verified M4 checkboxes", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [...m4PlatformGateLabels],
    defaults: "electron",
    extraDocLines: [m4EvidenceLogMarker],
  });

  const result = await runStatus(fixture);
  const parsed = JSON.parse(result.stdout) as { phase: string; nextActions: string[] };

  assert.equal(parsed.phase, "M5");
  assert.match(parsed.nextActions.join("\n"), /apply-tauri-migration-m5/);
});

test("tauri-migration-status reports current handoff artifacts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  const bundleSha256 = await writeHandoffFixture(handoffDir, { branchHead: head });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as {
    handoff: {
      branchHead: string;
      bundleSha256: string;
      current: boolean;
      present: boolean;
      problems: string[];
    };
    nextActions: string[];
  };

  assert.equal(parsed.handoff.present, true);
  assert.equal(parsed.handoff.current, true);
  assert.equal(parsed.handoff.branchHead, head);
  assert.equal(parsed.handoff.bundleSha256, bundleSha256);
  assert.deepEqual(parsed.handoff.problems, []);
  assert.match(parsed.nextActions.join("\n"), /Package the current verified handoff directory/);
});

test("tauri-migration-status reports stale handoff artifacts", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const staleHead = "0".repeat(40);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: staleHead });

  const result = await runStatus(fixture, "--handoff-dir", handoffDir);
  const parsed = JSON.parse(result.stdout) as { handoff: { current: boolean; problems: string[] } };

  assert.equal(parsed.handoff.current, false);
  assert.match(parsed.handoff.problems.join("\n"), new RegExp(`manifest branchHead is stale: expected ${head}, got ${staleHead}`));
});

test("tauri-migration-status reports a remote branch matching the handoff", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const remotePath = await createRemoteFixture(fixture, head);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    remote: {
      current: boolean;
      expectedHead: string;
      head: string;
      present: boolean;
      problems: string[];
    };
  };

  assert.equal(parsed.remote.present, true);
  assert.equal(parsed.remote.current, true);
  assert.equal(parsed.remote.head, head);
  assert.equal(parsed.remote.expectedHead, head);
  assert.deepEqual(parsed.remote.problems, []);
  assert.match(parsed.nextActions.join("\n"), /already matches/);
});

test("tauri-migration-status reports a missing remote branch", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const head = await initGitFixture(fixture);
  const handoffDir = join(fixture, "handoff");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  const remotePath = join(fixture, "empty.git");
  await git(fixture, "init", "--bare", remotePath);

  const result = await runStatus(fixture, "--handoff-dir", handoffDir, "--remote", remotePath);
  const parsed = JSON.parse(result.stdout) as { remote: { current: boolean; present: boolean; problems: string[] } };

  assert.equal(parsed.remote.present, false);
  assert.equal(parsed.remote.current, false);
  assert.match(parsed.remote.problems.join("\n"), /remote branch not found/);
});

test("tauri-migration-status reports verified platform reports", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const winReport = join(fixture, "win-report");
  const linuxReport = join(fixture, "linux-report");
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);

  const result = await runStatus(fixture, "--win-report", winReport, "--linux-report", linuxReport);
  const parsed = JSON.parse(result.stdout) as {
    nextActions: string[];
    platformReports: {
      current: boolean;
      linuxReport: string;
      problems: string[];
      winReport: string;
    };
  };

  assert.equal(parsed.platformReports.current, true);
  assert.equal(parsed.platformReports.winReport, winReport);
  assert.equal(parsed.platformReports.linuxReport, linuxReport);
  assert.deepEqual(parsed.platformReports.problems, []);
  assert.match(parsed.nextActions.join("\n"), /using the verified report paths shown above/);
});

test("tauri-migration-status reports incomplete platform report inputs", async (t) => {
  const fixture = await createFixtureRoot(t, {
    checked: [],
    defaults: "electron",
  });
  const winReport = join(fixture, "win-report");
  await writeWindowsReport(winReport);

  const result = await runStatus(fixture, "--win-report", winReport);
  const parsed = JSON.parse(result.stdout) as { platformReports: { current: boolean; problems: string[] } };

  assert.equal(parsed.platformReports.current, false);
  assert.deepEqual(parsed.platformReports.problems, ["Linux report not provided"]);
});

async function createFixtureRoot(
  t: test.TestContext,
  options: { checked: readonly string[]; defaults: "electron" | "tauri"; extraDocLines?: readonly string[] },
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-status-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  await writeFixtureFile(root, "docs/electron-to-tauri-migration.md", migrationDoc(options.checked, options.extraDocLines ?? []));
  await writeFixtureFile(root, "tools/dev/src/config.ts", toolsConfig(options.defaults));
  await writeFixtureFile(root, "tools/pack/src/config.ts", toolsConfig(options.defaults));
  await writeFixtureFile(root, ".github/workflows/release-beta.yml", releaseBetaWorkflow(options.defaults));
  return root;
}

async function initGitFixture(root: string): Promise<string> {
  await git(root, "init", "--initial-branch=main");
  await git(root, "config", "user.email", "codex@example.test");
  await git(root, "config", "user.name", "Codex Test");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "fixture");
  await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return (await git(root, "rev-parse", "HEAD")).stdout.trim();
}

async function writeHandoffFixture(handoffDir: string, options: { branchHead: string }): Promise<string> {
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const bundle = Buffer.from("bundle\n", "utf8");
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  await mkdir(handoffDir, { recursive: true });
  await writeFile(bundlePath, bundle);
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: "codex/electron-to-tauri-migration",
        branchHead: options.branchHead,
        bundlePath: "open-design-tauri-migration.bundle",
        bundleSha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return bundleSha256;
}

async function createRemoteFixture(root: string, branchHead: string): Promise<string> {
  const remotePath = join(root, "remote.git");
  await git(root, "init", "--bare", remotePath);
  await git(root, "push", remotePath, `${branchHead}:refs/heads/codex/electron-to-tauri-migration`);
  return remotePath;
}

async function writeWindowsReport(reportRoot: string): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-win-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "win",
    screenshot: "screenshots/open-design-win-smoke.png",
    spec: "specs/win-tauri.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "win",
    spec: "specs/win-tauri.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      installerPath: "C:/tmp/OpenDesign.exe",
      to: "nsis",
    },
    health: healthyEval(1234),
    install: {
      installDir: "C:/tmp/install",
      uninstallerPath: "C:/tmp/install/Uninstall.exe",
    },
    screenshot: "screenshots/open-design-win-smoke.png",
    start: {
      executablePath: "C:/tmp/install/Open Design.exe",
      pid: 123,
      source: "installed",
      status: runningStatus(1234),
    },
    stop: {
      remainingPids: [],
    },
    uninstall: {
      residueObservation: {
        installedExeExists: false,
        managedProcessPids: [],
        productNamespaceRootExists: false,
        registryResidues: [],
        uninstallerExists: false,
      },
    },
  });
}

async function writeLinuxReport(reportRoot: string): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-linux-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "linux",
    screenshot: "screenshots/open-design-linux-smoke.png",
    spec: "specs/linux.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "linux",
    spec: "specs/linux.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      appImagePath: "/tmp/OpenDesign.AppImage",
      to: "appimage",
    },
    headless: {
      install: {
        launcherPath: "/tmp/open-design-headless",
      },
      start: {
        pid: 345,
        status: {
          url: "http://127.0.0.1:3456/",
        },
      },
      stop: {
        remainingPids: [],
      },
    },
    health: healthyEval(2345),
    install: {
      appImagePath: "/tmp/OpenDesign.AppImage",
    },
    screenshot: "screenshots/open-design-linux-smoke.png",
    start: {
      executablePath: "/tmp/OpenDesign.AppImage",
      pid: 234,
      source: "installed",
      status: runningStatus(2345),
    },
    stop: {
      remainingPids: [],
    },
    uninstall: {
      removed: {
        appImage: "removed",
        desktop: "removed",
        icon: "removed",
      },
    },
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runningStatus(port: number): { state: string; url: string } {
  return {
    state: "running",
    url: `http://127.0.0.1:${port}/`,
  };
}

function healthyEval(port: number): { health: { ok: boolean; version: string }; href: string; status: number } {
  return {
    health: {
      ok: true,
      version: "0.7.0",
    },
    href: `http://127.0.0.1:${port}/`,
    status: 200,
  };
}

function migrationDoc(checkedLabels: readonly string[], extraLines: readonly string[]): string {
  const checked = new Set(checkedLabels);
  return [
    "# Electron to Tauri Migration",
    "",
    ...[
      ...m4PlatformGateLabels,
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ].map((label) => `- [${checked.has(label) ? "x" : " "}] ${label}`),
    "",
    ...extraLines,
  ].join("\n");
}

function toolsConfig(defaultRuntime: "electron" | "tauri"): string {
  return `export const DEFAULT_DESKTOP_RUNTIME = "${defaultRuntime}";\n`;
}

function releaseBetaWorkflow(defaultRuntime: "electron" | "tauri"): string {
  return [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      desktop_runtime:",
    "        type: choice",
    "        options:",
    "          - electron",
    "          - tauri",
    `        default: ${defaultRuntime}`,
    "",
  ].join("\n");
}

async function writeFixtureFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

async function runStatus(root: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", statusScript, "--root", root, ...args, "--json"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function git(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}
