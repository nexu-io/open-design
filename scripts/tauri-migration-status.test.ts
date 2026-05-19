import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
  assert.match(parsed.nextActions.join("\n"), /verify-tauri-platform-gates/);
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
  assert.match(parsed.nextActions.join("\n"), /Flip tools-dev, tools-pack, and release-beta defaults/);
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

async function runStatus(root: string): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", statusScript, "--root", root, "--json"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}
