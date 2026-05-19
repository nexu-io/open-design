import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const createBundleScript = join(scriptsRoot, "create-tauri-migration-bundle.ts");
const importBundleScript = join(scriptsRoot, "import-tauri-migration-bundle.ts");
const migrationBranch = "codex/electron-to-tauri-migration";

test("import-tauri-migration-bundle verifies and fetches the migration branch", async (t) => {
  const { bundlePath, sourceRepo, targetRepo } = await createBundleFixture(t, "open-design-tauri-import-pass-");
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();
  const sha256 = await sha256File(bundlePath);

  const result = await runImportScript(targetRepo, "--bundle", bundlePath, "--expected-sha256", sha256);

  assert.match(result.stdout, /Imported Tauri migration bundle:/);
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
  assert.match(result.stdout, new RegExp(`SHA-256: ${sha256}`));
  const targetHead = (await git(targetRepo, "rev-parse", migrationBranch)).stdout.trim();
  assert.equal(targetHead, sourceHead);
});

test("import-tauri-migration-bundle can import from the handoff manifest", async (t) => {
  const { bundlePath, sourceRepo, targetRepo } = await createBundleFixture(t, "open-design-tauri-import-manifest-");
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();
  const sha256 = await sha256File(bundlePath);
  const manifestPath = join(dirname(bundlePath), "handoff.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: sourceHead,
        bundlePath,
        bundleSha256: sha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const result = await runImportScript(targetRepo, "--manifest", manifestPath);

  assert.match(result.stdout, /Imported Tauri migration bundle:/);
  assert.match(result.stdout, new RegExp(`Manifest: ${escapeRegExp(manifestPath)}`));
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
  assert.match(result.stdout, new RegExp(`SHA-256: ${sha256}`));
  const targetHead = (await git(targetRepo, "rev-parse", migrationBranch)).stdout.trim();
  assert.equal(targetHead, sourceHead);
});

test("import-tauri-migration-bundle resolves manifest bundle paths relative to the manifest", async (t) => {
  const { bundlePath, sourceRepo, targetRepo } = await createBundleFixture(t, "open-design-tauri-import-relative-");
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();
  const sha256 = await sha256File(bundlePath);
  const manifestPath = join(dirname(bundlePath), "handoff.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: sourceHead,
        bundlePath: "handoff.bundle",
        bundleSha256: sha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const result = await runImportScript(targetRepo, "--manifest", manifestPath);

  assert.match(result.stdout, new RegExp(`Imported Tauri migration bundle: ${escapeRegExp(bundlePath)}`));
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
  const targetHead = (await git(targetRepo, "rev-parse", migrationBranch)).stdout.trim();
  assert.equal(targetHead, sourceHead);
});

test("import-tauri-migration-bundle rejects checksum mismatches before fetch", async (t) => {
  const { bundlePath, targetRepo } = await createBundleFixture(t, "open-design-tauri-import-sha-");

  await assert.rejects(
    runImportScript(targetRepo, "--bundle", bundlePath, "--expected-sha256", "0".repeat(64)),
    /bundle SHA-256 mismatch/,
  );
  await assert.rejects(git(targetRepo, "rev-parse", migrationBranch));
});

async function createBundleFixture(
  t: test.TestContext,
  prefix: string,
): Promise<{ bundlePath: string; sourceRepo: string; targetRepo: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const sourceRepo = join(root, "source");
  const targetRepo = join(root, "target");
  const bundlePath = join(root, "handoff.bundle");

  await git(root, "init", "--initial-branch=main", sourceRepo);
  await git(sourceRepo, "config", "user.email", "codex@example.test");
  await git(sourceRepo, "config", "user.name", "Codex Test");
  await writeFile(join(sourceRepo, "base.txt"), "base\n", "utf8");
  await git(sourceRepo, "add", "base.txt");
  await git(sourceRepo, "commit", "-m", "base");
  await git(sourceRepo, "checkout", "-b", migrationBranch);
  await writeFile(join(sourceRepo, "feature.txt"), "feature\n", "utf8");
  await git(sourceRepo, "add", "feature.txt");
  await git(sourceRepo, "commit", "-m", "feature");
  await git(sourceRepo, "checkout", "main");

  await git(root, "clone", "--branch", "main", "--single-branch", sourceRepo, targetRepo);
  await runCreateBundleScript(sourceRepo, "--branch", migrationBranch, "--base", "main", "--output", bundlePath);

  return { bundlePath, sourceRepo, targetRepo };
}

async function runCreateBundleScript(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", createBundleScript, "--cwd", cwd, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function runImportScript(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", importBundleScript, "--cwd", cwd, ...args], {
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

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
