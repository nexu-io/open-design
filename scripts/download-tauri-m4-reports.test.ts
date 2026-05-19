import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  m4PlatformGateLabels,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const downloadScript = join(scriptsRoot, "download-tauri-m4-reports.ts");
const linuxArtifactName = "open-design-ci-linux-tauri-e2e-report";
const winArtifactName = "open-design-ci-win-tauri-e2e-report";
const m5Labels = [
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m5ReleaseBetaDefaultLabel,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
] as const;

test("download-tauri-m4-reports downloads latest completed artifacts and verifies them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-reports-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);
  const outputDir = join(root, "reports");

  const result = await runDownload(fakeGh, "--output-dir", outputDir, "--repo", "example/open-design", "--branch", "feature");

  assert.match(result.stdout, /Downloaded and verified Tauri M4 platform reports/);
  assert.match(result.stdout, /Run: 12345/);
  assert.match(result.stdout, /Tauri platform gate reports passed verification/);
  assert.match(result.stdout, /advance-tauri-migration-m4-m5/);
  assert.equal((await readJson(join(outputDir, winArtifactName, "manifest.json"))).platform, "win");
  assert.equal((await readJson(join(outputDir, linuxArtifactName, "manifest.json"))).platform, "linux");
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.match(calls, /run list --repo example\/open-design --branch feature/);
  assert.match(calls, /run view 12345/);
  assert.match(calls, new RegExp(`run download 12345[\\s\\S]*--name ${winArtifactName}`));
  assert.match(calls, new RegExp(`run download 12345[\\s\\S]*--name ${linuxArtifactName}`));
});

test("download-tauri-m4-reports can use an explicit run id without listing runs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-run-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);

  const result = await runDownload(fakeGh, "--run-id", "777", "--output-dir", join(root, "reports"));

  assert.match(result.stdout, /Run: 777/);
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.doesNotMatch(calls, /run list/);
  assert.match(calls, /run view 777/);
  assert.match(calls, /run download 777/);
});

test("download-tauri-m4-reports verifies explicit run ids against the expected head", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-run-head-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const expectedHead = "a".repeat(40);
  const fakeGh = await writeFakeGh(root);

  const result = await runDownload(
    fakeGh,
    "--run-id",
    "777",
    "--expected-head",
    expectedHead,
    "--output-dir",
    join(root, "reports"),
  );

  assert.match(result.stdout, /Expected head: a{40}/);
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.doesNotMatch(calls, /run list/);
  assert.match(calls, /run view 777/);
  assert.match(calls, /run download 777/);
});

test("download-tauri-m4-reports rejects runs without passing native Tauri jobs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-run-jobs-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root, {
    viewJobs: [{ name: "Packaged windows Tauri smoke", status: "completed", conclusion: "failure" }],
  });

  await assert.rejects(
    runDownload(fakeGh, "--run-id", "777", "--output-dir", join(root, "reports")),
    /required native M4 job did not pass: Packaged windows Tauri smoke is completed\/failure/,
  );
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.match(calls, /run view 777/);
  assert.doesNotMatch(calls, /run download 777/);
});

test("download-tauri-m4-reports rejects explicit run ids from stale heads", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-run-stale-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);

  await assert.rejects(
    runDownload(fakeGh, "--run-id", "777", "--expected-head", "b".repeat(40), "--output-dir", join(root, "reports")),
    /head mismatch: expected b{40}, got a{40}/,
  );
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.match(calls, /run view 777/);
  assert.doesNotMatch(calls, /run download 777/);
});

test("download-tauri-m4-reports rejects explicit run ids from another branch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-run-branch-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root, { viewHeadBranch: "not-the-migration-branch" });

  await assert.rejects(
    runDownload(
      fakeGh,
      "--run-id",
      "777",
      "--branch",
      "codex/electron-to-tauri-migration",
      "--expected-head",
      "a".repeat(40),
      "--output-dir",
      join(root, "reports"),
    ),
    /branch mismatch: expected codex\/electron-to-tauri-migration, got not-the-migration-branch/,
  );
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.match(calls, /run view 777/);
  assert.doesNotMatch(calls, /run download 777/);
});

test("download-tauri-m4-reports requires expected head when advancing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-advance-head-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);

  await assert.rejects(
    runDownload(fakeGh, "--run-id", "777", "--output-dir", join(root, "reports"), "--advance"),
    /--advance requires --expected-head/,
  );
});

test("download-tauri-m4-reports refuses to advance with tracked worktree changes before gh calls", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-advance-dirty-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);
  const fixtureRoot = await writeM5Fixture(root);
  await initGitFixture(fixtureRoot);
  await writeFile(join(fixtureRoot, "README.md"), `${readmeFixture()}\ntracked change\n`, "utf8");

  await assert.rejects(
    runDownload(
      fakeGh,
      "--run-id",
      "777",
      "--expected-head",
      "a".repeat(40),
      "--output-dir",
      join(root, "reports"),
      "--advance",
      "--root",
      fixtureRoot,
    ),
    /tracked worktree changes are present/,
  );
  await assert.rejects(readFile(join(root, "gh-calls.log"), "utf8"), /ENOENT/);
});

test("download-tauri-m4-reports explains missing gh", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-missing-gh-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const missingGh = join(root, "missing-gh");

  await assert.rejects(runDownload(missingGh, "--run-id", "777", "--output-dir", join(root, "reports")), (error) => {
    const detail = error as Error & { stderr?: string };
    const stderr = detail.stderr ?? "";
    assert.match(stderr, /GitHub CLI command failed/);
    assert.match(stderr, /GitHub CLI was not found/);
    assert.match(stderr, /--gh <path-to-gh>/);
    assert.match(stderr, /advance-tauri-migration-m4-m5/);
    return true;
  });
});

test("download-tauri-m4-reports waits for a completed run at the expected head", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-wait-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const expectedHead = "b".repeat(40);
  const fakeGh = await writeFakeGh(root, {
    listResponses: [
      [
        { databaseId: 111, status: "completed", conclusion: "success", headSha: "a".repeat(40), createdAt: "2026-05-20T00:00:00Z" },
      ],
      [
        { databaseId: 222, status: "in_progress", conclusion: null, headSha: expectedHead, createdAt: "2026-05-20T00:01:00Z" },
        { databaseId: 111, status: "completed", conclusion: "success", headSha: "a".repeat(40), createdAt: "2026-05-20T00:00:00Z" },
      ],
      [
        { databaseId: 222, status: "completed", conclusion: "success", headSha: expectedHead, createdAt: "2026-05-20T00:01:00Z" },
      ],
    ],
  });
  const outputDir = join(root, "reports");

  const result = await runDownload(
    fakeGh,
    "--output-dir",
    outputDir,
    "--repo",
    "example/open-design",
    "--branch",
    "feature",
    "--expected-head",
    expectedHead,
    "--wait",
    "--poll-ms",
    "1",
    "--timeout-ms",
    "1000",
  );

  assert.match(result.stdout, /Expected head: b{40}/);
  assert.match(result.stdout, /Run: 222/);
  const calls = await readFile(join(root, "gh-calls.log"), "utf8");
  assert.equal([...calls.matchAll(/run list/g)].length, 3);
  assert.match(calls, new RegExp(`run download 222[\\s\\S]*--name ${winArtifactName}`));
});

test("download-tauri-m4-reports can advance M4 and M5 after verified downloads", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-download-advance-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const fakeGh = await writeFakeGh(root);
  const fixtureRoot = await writeM5Fixture(root);

  const result = await runDownload(
    fakeGh,
    "--run-id",
    "777",
    "--expected-head",
    "a".repeat(40),
    "--output-dir",
    join(root, "reports"),
    "--advance",
    "--root",
    fixtureRoot,
  );

  assert.match(result.stdout, /M4\/M5 advancement/);
  assert.match(result.stdout, /Advanced Tauri migration from verified M4 platform evidence through M5 default flip/);
  const migrationDoc = await readFile(join(fixtureRoot, "docs", "electron-to-tauri-migration.md"), "utf8");
  for (const label of [...m4PlatformGateLabels, ...m5Labels]) {
    assert.match(migrationDoc, new RegExp(`- \\[x\\] ${escapeRegExp(label)}`));
  }
  assert.match(
    await readFile(join(fixtureRoot, "tools", "dev", "src", "config.ts"), "utf8"),
    /DEFAULT_DESKTOP_RUNTIME = "tauri"/,
  );
  assert.match(
    await readFile(join(fixtureRoot, "tools", "pack", "src", "config.ts"), "utf8"),
    /DEFAULT_DESKTOP_RUNTIME = "tauri"/,
  );
  assert.match(await readFile(join(fixtureRoot, ".github", "workflows", "release-beta.yml"), "utf8"), /default: tauri/);
});

async function writeFakeGh(
  root: string,
  options: {
    listResponses?: Array<Array<Record<string, unknown>>>;
    viewJobs?: Array<Record<string, unknown>>;
    viewHeadBranch?: string;
  } = {},
): Promise<string> {
  const fakeGh = join(root, "gh");
  const viewJobs = options.viewJobs ?? [
    { name: "Packaged windows Tauri smoke", status: "completed", conclusion: "success" },
    { name: "Packaged linux Tauri smoke", status: "completed", conclusion: "success" },
  ];
  const viewHeadBranch = options.viewHeadBranch ?? "codex/electron-to-tauri-migration";
  const listResponses = options.listResponses ?? [
    [
      {
        databaseId: 12345,
        status: "completed",
        conclusion: "success",
        headBranch: "feature",
        headSha: "a".repeat(40),
        createdAt: "2026-05-20T00:00:00Z",
      },
    ],
  ];
  await writeFile(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `const root = ${JSON.stringify(root)};`,
      `const listResponses = ${JSON.stringify(listResponses)};`,
      "const args = process.argv.slice(2);",
      "appendFileSync(join(root, 'gh-calls.log'), args.join(' ') + '\\n');",
      "if (args[0] === 'run' && args[1] === 'list') {",
      "  const countPath = join(root, 'gh-list-count.txt');",
      "  const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0;",
      "  writeFileSync(countPath, String(count + 1));",
      "  process.stdout.write(JSON.stringify(listResponses[Math.min(count, listResponses.length - 1)]));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'run' && args[1] === 'view') {",
      `  const viewJobs = ${JSON.stringify(viewJobs)};`,
      `  const viewHeadBranch = ${JSON.stringify(viewHeadBranch)};`,
      "  process.stdout.write(JSON.stringify({ databaseId: Number(args[2]), status: 'completed', conclusion: 'success', headBranch: viewHeadBranch, headSha: 'a'.repeat(40), createdAt: '2026-05-20T00:00:00Z', jobs: viewJobs }));",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'run' && args[1] === 'download') {",
      "  const name = args[args.indexOf('--name') + 1];",
      "  const dir = args[args.indexOf('--dir') + 1];",
      "  if (!name || !dir) throw new Error('missing --name or --dir');",
      "  name.includes('win') ? writeWindowsReport(dir) : writeLinuxReport(dir);",
      "  process.exit(0);",
      "}",
      "throw new Error('unsupported gh call: ' + args.join(' '));",
      "function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\\n'); }",
      "function runningStatus(port) { return { state: 'running', url: `http://127.0.0.1:${port}/` }; }",
      "function healthyEval(port) { return { health: { ok: true, version: '0.7.0' }, href: `http://127.0.0.1:${port}/`, status: 200 }; }",
      "function baseReport(dir, platform, spec, screenshot) { mkdirSync(join(dir, 'screenshots'), { recursive: true }); writeFileSync(join(dir, 'screenshots', screenshot), 'png'); writeJson(join(dir, 'manifest.json'), { platform, screenshot: `screenshots/${screenshot}`, spec }); writeJson(join(dir, 'suite-result.json'), { exitCode: 0, platform, spec, status: 'success' }); }",
      "function writeWindowsReport(dir) { baseReport(dir, 'win', 'specs/win-tauri.spec.ts', 'open-design-win-smoke.png'); writeJson(join(dir, 'summary.json'), { build: { installerPath: 'C:/tmp/OpenDesign.exe', to: 'nsis' }, health: healthyEval(1234), install: { installDir: 'C:/tmp/install', uninstallerPath: 'C:/tmp/install/Uninstall.exe' }, screenshot: 'screenshots/open-design-win-smoke.png', start: { executablePath: 'C:/tmp/install/Open Design.exe', pid: 123, source: 'installed', status: runningStatus(1234) }, stop: { remainingPids: [] }, uninstall: { residueObservation: { installedExeExists: false, managedProcessPids: [], productNamespaceRootExists: false, registryResidues: [], uninstallerExists: false } } }); }",
      "function writeLinuxReport(dir) { baseReport(dir, 'linux', 'specs/linux.spec.ts', 'open-design-linux-smoke.png'); writeJson(join(dir, 'summary.json'), { build: { appImagePath: '/tmp/OpenDesign.AppImage', to: 'appimage' }, health: healthyEval(2345), headless: { install: { launcherPath: '/tmp/open-design-headless' }, start: { pid: 345, status: { url: 'http://127.0.0.1:3456/' } }, stop: { remainingPids: [] } }, install: { appImagePath: '/tmp/install/OpenDesign.AppImage' }, screenshot: 'screenshots/open-design-linux-smoke.png', start: { executablePath: '/tmp/install/OpenDesign.AppImage', pid: 123, source: 'installed', status: runningStatus(2345) }, stop: { remainingPids: [] }, uninstall: { removed: { appImage: 'removed', desktop: 'removed', icon: 'removed' } } }); }",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(fakeGh, 0o755);
  return fakeGh;
}

async function writeM5Fixture(root: string): Promise<string> {
  const fixtureRoot = join(root, "repo");
  await mkdir(join(fixtureRoot, ".github", "workflows"), { recursive: true });
  await mkdir(join(fixtureRoot, "apps"), { recursive: true });
  await mkdir(join(fixtureRoot, "docs"), { recursive: true });
  await mkdir(join(fixtureRoot, "tools", "dev", "src"), { recursive: true });
  await mkdir(join(fixtureRoot, "tools", "pack", "src"), { recursive: true });
  await writeFile(join(fixtureRoot, "docs", "electron-to-tauri-migration.md"), migrationDocFixture(), "utf8");
  await writeFile(
    join(fixtureRoot, "tools", "dev", "src", "config.ts"),
    [
      'export const DESKTOP_RUNTIME_KINDS = ["electron", "tauri"] as const;',
      'export const DEFAULT_DESKTOP_RUNTIME = "electron" satisfies DesktopRuntimeKind;',
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "tools", "pack", "src", "config.ts"),
    [
      'export const DESKTOP_RUNTIME_KINDS = ["electron", "tauri"] as const;',
      'export const DEFAULT_DESKTOP_RUNTIME = "electron" satisfies ToolPackDesktopRuntimeKind;',
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".github", "workflows", "release-beta.yml"),
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
  await writeFile(join(fixtureRoot, "README.md"), readmeFixture(), "utf8");
  await writeFile(
    join(fixtureRoot, "apps", "AGENTS.md"),
    "- `apps/desktop`: Desktop host runtime. Electron remains the default during the Tauri migration, and `src-tauri/` is the opt-in Tauri runtime. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.\n",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "docs", "architecture.md"),
    "  Packaged Electron and packaged headless modes are unaffected\n",
    "utf8",
  );
  return fixtureRoot;
}

async function initGitFixture(root: string): Promise<void> {
  await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.email", "codex@example.test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.name", "Codex Test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["add", "."], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, maxBuffer: 1024 * 1024 });
}

function migrationDocFixture(): string {
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
    "| **Deployable to** | Local (`pnpm tools-dev`) \u00b7 Vercel web layer \u00b7 packaged desktop app. Public downloads are still Electron artifacts while Tauri packaging parity is being gated. |",
    "| Desktop (optional) | Desktop shell \u2014 discovers the web URL through sidecar IPC, no port guessing; Electron is the default and Tauri is the explicit migration runtime. The same `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` channel powers `tools-dev inspect desktop \u2026` for E2E |",
    "Open Design can run as a web app in your browser or as a desktop shell. Electron remains the default desktop runtime while the Tauri path is validated behind explicit flags; both modes share the same local daemon + web architecture.",
    "The desktop app discovers the web URL automatically via sidecar IPC \u2014 no port guessing required. During the Electron-to-Tauri migration, `--desktop-runtime tauri` selects the opt-in Tauri path where supported.",
    "- [x] Packaged desktop build out of `apps/packaged/` \u2014 public macOS (Apple Silicon) and Windows (x64) downloads remain Electron while the Tauri package path is validated.",
  ].join("\n");
}

async function runDownload(gh: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", downloadScript, "--gh", gh, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function readJson(path: string): Promise<{ platform: string }> {
  return JSON.parse(await readFile(path, "utf8")) as { platform: string };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
