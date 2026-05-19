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
  assert.match(calls, /run download 777/);
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

async function writeFakeGh(root: string): Promise<string> {
  const fakeGh = join(root, "gh");
  await writeFile(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const { mkdirSync, writeFileSync, appendFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `const root = ${JSON.stringify(root)};`,
      "const args = process.argv.slice(2);",
      "appendFileSync(join(root, 'gh-calls.log'), args.join(' ') + '\\n');",
      "if (args[0] === 'run' && args[1] === 'list') {",
      "  process.stdout.write(JSON.stringify([{ databaseId: 12345, status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40), createdAt: '2026-05-20T00:00:00Z' }]));",
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
