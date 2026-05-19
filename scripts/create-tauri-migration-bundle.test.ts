import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const bundleScript = join(scriptsRoot, "create-tauri-migration-bundle.ts");

test("create-tauri-migration-bundle creates and verifies a branch bundle", async (t) => {
  const repo = await createFixtureRepo(t, "open-design-tauri-bundle-pass-");
  const bundlePath = join(repo, "handoff.bundle");

  const result = await runBundleScript(repo, "--branch", "codex/electron-to-tauri-migration", "--base", "main", "--output", bundlePath);

  assert.match(result.stdout, /Created Tauri migration bundle:/);
  assert.match(result.stdout, /codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /Bundle bytes: \d+/);
  assert.match(result.stdout, /SHA-256: [0-9a-f]{64}/);
  await access(bundlePath);
  const heads = await git(repo, "bundle", "list-heads", bundlePath);
  assert.match(heads.stdout, /refs\/heads\/codex\/electron-to-tauri-migration/);
});

test("create-tauri-migration-bundle rejects tracked dirty worktrees", async (t) => {
  const repo = await createFixtureRepo(t, "open-design-tauri-bundle-dirty-");
  await writeFile(join(repo, "feature.txt"), "dirty\n", "utf8");

  await assert.rejects(
    runBundleScript(repo, "--branch", "codex/electron-to-tauri-migration", "--base", "main", "--output", join(repo, "handoff.bundle")),
    /tracked worktree changes are present/,
  );
});

async function createFixtureRepo(t: test.TestContext, prefix: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => void rm(repo, { force: true, recursive: true }));

  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "codex@example.test");
  await git(repo, "config", "user.name", "Codex Test");
  await writeFile(join(repo, "base.txt"), "base\n", "utf8");
  await git(repo, "add", "base.txt");
  await git(repo, "commit", "-m", "base");
  await git(repo, "checkout", "-b", "codex/electron-to-tauri-migration");
  await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
  await git(repo, "add", "feature.txt");
  await git(repo, "commit", "-m", "feature");

  return repo;
}

async function runBundleScript(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", bundleScript, "--cwd", cwd, ...args], {
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
