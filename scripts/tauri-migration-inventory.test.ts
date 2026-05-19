import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const inventoryScript = join(scriptsRoot, "tauri-migration-inventory.ts");

test("tauri-migration-inventory reports Electron blockers by cleanup category", async (t) => {
  const root = await createInventoryFixture(t);

  const result = await runInventory(root);

  assert.match(result.stdout, /Tauri migration Electron inventory/);
  assert.match(result.stdout, /apps\/desktop\/package\.json: electron/);
  assert.match(result.stdout, /tools\/pack\/package\.json: @electron\/rebuild, electron-builder/);
  assert.match(result.stdout, /apps\/desktop\/src\/main\/runtime\.ts/);
  assert.match(result.stdout, /tools\/pack\/resources\/web-standalone-after-pack\.cjs/);
  assert.match(result.stdout, /apps\/desktop\/tests\/runtime\.test\.ts/);
  assert.match(result.stdout, /tools\/pack\/AGENTS\.md/);
});

test("tauri-migration-inventory emits machine-readable blocker counts", async (t) => {
  const root = await createInventoryFixture(t);

  const result = await runInventory(root, "--json");
  const inventory = JSON.parse(result.stdout) as {
    blockers: {
      electronDependencyManifests: number;
      electronGuidanceReferences: number;
      electronLockfileImporters: number;
      electronResourceFiles: number;
      electronRuntimeFiles: number;
      electronTestReferences: number;
    };
    runtimeFiles: string[];
  };

  assert.deepEqual(inventory.blockers, {
    electronDependencyManifests: 3,
    electronGuidanceReferences: 2,
    electronLockfileImporters: 3,
    electronResourceFiles: 1,
    electronRuntimeFiles: 2,
    electronTestReferences: 1,
  });
  assert.deepEqual(inventory.runtimeFiles, [
    "apps/desktop/src/main/preload.cts",
    "apps/desktop/src/main/runtime.ts",
  ]);
});

test("tauri-migration-inventory emits an M6 cleanup plan", async (t) => {
  const root = await createInventoryFixture(t);

  const result = await runInventory(root, "--plan");

  assert.match(result.stdout, /Tauri migration M6 cleanup plan/);
  assert.match(result.stdout, /Preconditions:/);
  assert.match(result.stdout, /pnpm --filter @open-design\/desktop remove electron/);
  assert.match(result.stdout, /pnpm --filter @open-design\/packaged remove electron/);
  assert.match(result.stdout, /pnpm --filter @open-design\/tools-pack remove @electron\/rebuild electron-builder/);
  assert.match(result.stdout, /apps\/desktop\/src\/main\/runtime\.ts/);
  assert.match(result.stdout, /tools\/pack\/resources\/web-standalone-after-pack\.cjs/);
  assert.match(result.stdout, /Remove electron from DESKTOP_RUNTIME_KINDS/);
  assert.match(result.stdout, /cargo clippy --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml -- -D warnings/);
});

async function createInventoryFixture(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-inventory-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  await mkdir(join(root, ".github"), { recursive: true });
  await mkdir(join(root, "apps", "desktop", "src", "main"), { recursive: true });
  await mkdir(join(root, "apps", "desktop", "tests"), { recursive: true });
  await mkdir(join(root, "apps", "packaged"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "tools", "pack", "resources"), { recursive: true });
  await mkdir(join(root, "tools", "pack", "tests"), { recursive: true });

  await writeJson(join(root, "apps", "desktop", "package.json"), {
    name: "@open-design/desktop",
    devDependencies: {
      electron: "41.3.0",
    },
  });
  await writeJson(join(root, "apps", "packaged", "package.json"), {
    name: "@open-design/packaged",
    devDependencies: {
      electron: "41.3.0",
    },
  });
  await writeJson(join(root, "tools", "pack", "package.json"), {
    name: "@open-design/tools-pack",
    dependencies: {
      "@electron/rebuild": "4.0.4",
      "electron-builder": "26.8.1",
    },
  });
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "  apps/desktop:",
      "    devDependencies:",
      "      electron:",
      "        specifier: 41.3.0",
      "  apps/packaged:",
      "    devDependencies:",
      "      electron:",
      "        specifier: 41.3.0",
      "  tools/pack:",
      "    dependencies:",
      "      '@electron/rebuild':",
      "        specifier: 4.0.4",
      "      electron-builder:",
      "        specifier: 26.8.1",
    ].join("\n"),
    "utf8",
  );

  await writeFile(join(root, "apps", "desktop", "src", "main", "runtime.ts"), "import { BrowserWindow } from 'electron';\n");
  await writeFile(join(root, "apps", "desktop", "src", "main", "preload.cts"), "require('electron');\n");
  await writeFile(join(root, "tools", "pack", "resources", "web-standalone-after-pack.cjs"), "electron-builder hook\n");
  await writeFile(join(root, "apps", "desktop", "tests", "runtime.test.ts"), "vi.mock('electron', () => ({}));\n");
  await writeFile(join(root, "tools", "pack", "tests", "tauri.test.ts"), "Tauri test only\n");

  await writeFile(join(root, "AGENTS.md"), "Root guidance without desktop runtime mentions.\n");
  await writeFile(join(root, "apps", "AGENTS.md"), "Tauri is the default desktop runtime.\n");
  await writeFile(join(root, "tools", "AGENTS.md"), "No desktop host guidance here.\n");
  await writeFile(join(root, "tools", "pack", "AGENTS.md"), "Pack resources used by electron-builder stay here until M6.\n");
  await writeFile(join(root, "docs", "code-review-guidelines.md"), "Electron is the current default in this fixture.\n");
  await writeFile(join(root, ".github", "pull_request_template.md"), "No desktop host review checkbox.\n");

  return root;
}

async function runInventory(root: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", inventoryScript, "--root", root, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
