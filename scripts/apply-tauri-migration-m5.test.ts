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
const m5Script = join(scriptsRoot, "apply-tauri-migration-m5.ts");

test("apply-tauri-migration-m5 refuses to run before verified M4 evidence", async (t) => {
  const root = await createFixtureRoot(t, { verifiedM4: false });

  await assert.rejects(runM5Script(root), /M5 default flip requires verified M4 platform gate/);
});

test("apply-tauri-migration-m5 refuses to run before pushed remote head evidence", async (t) => {
  const root = await createFixtureRoot(t, { verifiedM4: true, verifiedRemote: false });

  await assert.rejects(runM5Script(root), /pushed remote branch-head evidence log marker/);
});

test("apply-tauri-migration-m5 refuses to run with tracked worktree changes", async (t) => {
  const root = await createFixtureRoot(t, { verifiedM4: true });
  await initGitFixture(root);
  await writeFile(join(root, "README.md"), `${readmeFixture()}\ntracked change\n`, "utf8");

  await assert.rejects(runM5Script(root), /tracked worktree changes are present/);
});

test("apply-tauri-migration-m5 flips defaults, docs, and checklist after verified M4", async (t) => {
  const root = await createFixtureRoot(t, { verifiedM4: true });

  const result = await runM5Script(root);

  assert.match(result.stdout, /Applied Tauri migration M5 default flip/);
  assert.match(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "tauri"/);
  assert.match(await readFile(join(root, "tools", "pack", "src", "config.ts"), "utf8"), /DEFAULT_DESKTOP_RUNTIME = "tauri"/);
  const releaseBeta = await readFile(join(root, ".github", "workflows", "release-beta.yml"), "utf8");
  assert.match(releaseBeta, /default: tauri/);
  assert.match(releaseBeta, /Tauri is the default release path/);

  const migrationDoc = await readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8");
  for (const label of [
    m5ToolsDevDefaultLabel,
    m5ToolsPackDefaultLabel,
    m5ReleaseBetaDefaultLabel,
    m5ElectronFallbackLabel,
    m5PrimaryDocsLabel,
  ]) {
    assert.match(migrationDoc, new RegExp(`- \\[x\\] ${escapeRegExp(label)}`));
  }
  assert.doesNotMatch(await readFile(join(root, "README.md"), "utf8"), /Electron is the current default|Public downloads are still Electron artifacts|Electron remains the default desktop runtime/);
  assert.doesNotMatch(await readFile(join(root, "apps", "AGENTS.md"), "utf8"), /Electron remains the default/);
});

async function createFixtureRoot(
  t: test.TestContext,
  options: { verifiedM4: boolean; verifiedRemote?: boolean },
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-m5-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "tools", "dev", "src"), { recursive: true });
  await mkdir(join(root, "tools", "pack", "src"), { recursive: true });

  await writeFile(join(root, "docs", "electron-to-tauri-migration.md"), migrationDoc(options), "utf8");
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

  return root;
}

async function initGitFixture(root: string): Promise<void> {
  await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.email", "codex@example.test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["config", "user.name", "Codex Test"], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["add", "."], { cwd: root, maxBuffer: 1024 * 1024 });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, maxBuffer: 1024 * 1024 });
}

function migrationDoc(options: { verifiedM4: boolean; verifiedRemote?: boolean }): string {
  const checked = new Set<string>(options.verifiedM4 ? m4PlatformGateLabels : []);
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
    ].map((label) => `- [${checked.has(label) ? "x" : " "}] ${label}`),
    "",
    ...(options.verifiedM4 ? [m4EvidenceLogMarker] : []),
    ...(options.verifiedM4 && options.verifiedRemote !== false ? [m4RemoteEvidenceLogMarker] : []),
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

async function runM5Script(root: string): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", m5Script, "--root", root], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
