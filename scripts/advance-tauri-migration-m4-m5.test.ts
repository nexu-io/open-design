import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  m4EvidenceLogMarker,
  m4PlatformGateLabels,
  m4RemoteEvidenceLogMarker,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const advanceScript = join(scriptsRoot, "advance-tauri-migration-m4-m5.ts");

test("advance-tauri-migration-m4-m5 verifies platform reports and applies M5", async (t) => {
  const { linuxReport, root, winReport } = await createFixture(t, "open-design-tauri-advance-pass-");
  const head = await initGitFixture(root);
  const remotePath = await createRemoteFixture(root, head);

  const result = await runAdvance(root, winReport, linuxReport, "--expected-head", head, "--remote", remotePath);

  assert.match(result.stdout, /Advanced Tauri migration from verified M4 platform evidence through M5 default flip/);
  assert.match(result.stdout, /Verified Tauri migration remote branch/);
  assert.match(result.stdout, /Tauri platform gate reports passed verification/);
  assert.match(result.stdout, /Applied Tauri migration M5 default flip/);

  const migrationDoc = await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8");
  for (const label of [...m4PlatformGateLabels, ...m5Labels]) {
    assert.match(migrationDoc, new RegExp(`- \\[x\\] ${escapeRegExp(label)}`));
  }
  assert.match(migrationDoc, new RegExp(escapeRegExp(m4EvidenceLogMarker)));
  assert.match(migrationDoc, new RegExp(escapeRegExp(m4RemoteEvidenceLogMarker)));
  assert.match(migrationDoc, new RegExp(`Remote \`${escapeRegExp(remotePath)}/codex/electron-to-tauri-migration\` matched \`${head}\``));
  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "tauri"/);
  assert.match(await readFile(join(root, "tools", "pack", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "tauri"/);
  assert.match(await readFile(join(root, ".github", "workflows", "release-beta.yml"), "utf8"), /default: tauri/);
});

test("advance-tauri-migration-m4-m5 refuses to run with tracked worktree changes", async (t) => {
  const { linuxReport, root, winReport } = await createFixture(t, "open-design-tauri-advance-dirty-");
  const head = await initGitFixture(root);
  const remotePath = await createRemoteFixture(root, head);
  await writeFile(join(root, "README.md"), `${readmeFixture()}\ntracked change\n`, "utf8");

  await assert.rejects(
    runAdvance(root, winReport, linuxReport, "--expected-head", head, "--remote", remotePath),
    /tracked worktree changes are present/,
  );

  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "electron"/);
  assert.match(await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"), new RegExp(`- \\[ \\] ${escapeRegExp(m5ToolsDevDefaultLabel)}`));
});

test("advance-tauri-migration-m4-m5 requires an expected pushed branch head", async (t) => {
  const { linuxReport, root, winReport } = await createFixture(t, "open-design-tauri-advance-head-required-");

  await assert.rejects(runAdvance(root, winReport, linuxReport), /--expected-head is required/);

  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "electron"/);
  assert.match(await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"), new RegExp(`- \\[ \\] ${escapeRegExp(m5ToolsDevDefaultLabel)}`));
});

test("advance-tauri-migration-m4-m5 refuses stale remote branch heads before editing", async (t) => {
  const { linuxReport, root, winReport } = await createFixture(t, "open-design-tauri-advance-remote-stale-");
  const head = await initGitFixture(root);
  const remotePath = await createRemoteFixture(root, head);

  await assert.rejects(
    runAdvance(root, winReport, linuxReport, "--expected-head", "0".repeat(40), "--remote", remotePath),
    /remote branch head mismatch/,
  );

  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "electron"/);
  assert.match(await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"), new RegExp(`- \\[ \\] ${escapeRegExp(m5ToolsDevDefaultLabel)}`));
});

test("advance-tauri-migration-m4-m5 does not apply M5 when platform verification fails", async (t) => {
  const { linuxReport, root, winReport } = await createFixture(t, "open-design-tauri-advance-fail-", {
    winRemainingPids: [123],
  });
  const head = await initGitFixture(root);
  const remotePath = await createRemoteFixture(root, head);

  await assert.rejects(
    runAdvance(root, winReport, linuxReport, "--expected-head", head, "--remote", remotePath),
    /win stop\.remainingPids must be an empty array/,
  );

  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "electron"/);
  assert.match(await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"), new RegExp(`- \\[ \\] ${escapeRegExp(m5ToolsDevDefaultLabel)}`));
});

const m5Labels = [
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m5ReleaseBetaDefaultLabel,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
] as const;

async function createFixture(
  t: test.TestContext,
  prefix: string,
  options: { winRemainingPids?: number[] } = {},
): Promise<{ linuxReport: string; root: string; winReport: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const winReport = join(root, "reports", "win");
  const linuxReport = join(root, "reports", "linux");

  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "tools", "dev", "src"), { recursive: true });
  await mkdir(join(root, "tools", "pack", "src"), { recursive: true });

  await writeWindowsReport(
    winReport,
    options.winRemainingPids == null ? {} : { remainingPids: options.winRemainingPids },
  );
  await writeLinuxReport(linuxReport);
  await writeFile(join(root, "docs", "electron-to-tauri-migration.md"), migrationDoc(), "utf8");
  await writeFile(
    join(root, "tools", "dev", "src", "config.ts"),
    [
      'export const DESKTOP_RUNTIME_KINDS = ["electron", "tauri"] as const;',
      'export const DEFAULT_DESKTOP_RUNTIME = "electron" satisfies DesktopRuntimeKind;',
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "tools", "pack", "src", "config.ts"),
    [
      'export const DESKTOP_RUNTIME_KINDS = ["electron", "tauri"] as const;',
      'export const DEFAULT_DESKTOP_RUNTIME = "electron" satisfies ToolPackDesktopRuntimeKind;',
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, ".github", "workflows", "release-beta.yml"),
    [
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      desktop_runtime:",
      '        description: "Desktop runtime to package. Keep electron for public beta; use tauri for migration smoke."',
      "        required: true",
      "        type: choice",
      "        default: electron",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "README.md"), readmeFixture(), "utf8");
  await writeFile(
    join(root, "apps", "AGENTS.md"),
    "- `apps/desktop`: Desktop host runtime. Electron remains the default during the Tauri migration, and `src-tauri/` is the opt-in Tauri runtime. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.\n",
    "utf8",
  );
  await writeFile(
    join(root, "docs", "architecture.md"),
    "  Packaged Electron and packaged headless modes are unaffected\n",
    "utf8",
  );

  return { linuxReport, root, winReport };
}

async function initGitFixture(root: string): Promise<string> {
  await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.email", "codex@example.test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.name", "Codex Test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["add", "."], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, maxBuffer: 1024 * 1024 });
  return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, maxBuffer: 1024 * 1024 })).stdout.trim();
}

async function createRemoteFixture(root: string, branchHead: string): Promise<string> {
  const remotePath = join(root, "origin.git");
  await execFileAsync("git", ["init", "--bare", remotePath], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["push", remotePath, `${branchHead}:refs/heads/codex/electron-to-tauri-migration`], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  return remotePath;
}

function migrationDoc(): string {
  return [
    "Last updated: 2026-05-20",
    "",
    "### M4 Platform package smoke",
    "",
    ...m4PlatformGateLabels.map((label) => `- [ ] ${label}`),
    "",
    "### M5 Default flip",
    "",
    ...m5Labels.map((label) => `- [ ] ${label}`),
    "",
    "## Execution Log",
    "",
    "- 2026-05-20: Existing entry.",
    "",
    "### Platform Gate Runners",
    "",
  ].join("\n");
}

function readmeFixture(): string {
  return [
    "| **Desktop** | Optional desktop shell with sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN). Electron is the current default; Tauri is available behind explicit migration flags. |",
    "| **Deployable to** | Local (`pnpm tools-dev`) · Vercel web layer · packaged desktop app. Public downloads are still Electron artifacts while Tauri packaging parity is being gated. |",
    "| Desktop (optional) | Desktop shell — discovers the web URL through sidecar IPC, no port guessing; Electron is the default and Tauri is the explicit migration runtime. The same `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` channel powers `tools-dev inspect desktop …` for E2E |",
    "Open Design can run as a web app in your browser or as a desktop shell. Electron remains the default desktop runtime while the Tauri path is validated behind explicit flags; both modes share the same local daemon + web architecture.",
    "The desktop app discovers the web URL automatically via sidecar IPC — no port guessing required. During the Electron-to-Tauri migration, `--desktop-runtime tauri` selects the opt-in Tauri path where supported.",
    "- [x] Packaged desktop build out of `apps/packaged/` — public macOS (Apple Silicon) and Windows (x64) downloads remain Electron while the Tauri package path is validated.",
  ].join("\n");
}

async function writeWindowsReport(reportRoot: string, options: { remainingPids?: number[] } = {}): Promise<void> {
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
      remainingPids: options.remainingPids ?? [],
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

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runAdvance(
  root: string,
  winReport: string,
  linuxReport: string,
  ...args: string[]
): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(
    process.execPath,
    ["--import", "tsx", advanceScript, "--root", root, "--win-report", winReport, "--linux-report", linuxReport, ...args],
    {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 4,
    },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
