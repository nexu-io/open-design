import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const handoffScript = join(scriptsRoot, "verify-tauri-migration-handoff.ts");
const migrationBranch = "codex/electron-to-tauri-migration";

test("verify-tauri-migration-handoff round-trips a bundle through a receiving checkout", async (t) => {
  const sourceRepo = await createFixtureRepo(t, "open-design-tauri-handoff-pass-");
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();
  const bundlePath = join(sourceRepo, "handoff.bundle");
  const manifestPath = join(sourceRepo, "handoff.json");
  const notePath = join(sourceRepo, "handoff.md");

  const result = await runHandoffScript(
    "--cwd",
    sourceRepo,
    "--branch",
    migrationBranch,
    "--base",
    "main",
    "--output",
    bundlePath,
    "--manifest",
    manifestPath,
    "--note",
    notePath,
  );

  assert.match(result.stdout, /Verified Tauri migration bundle handoff round-trip/);
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
  assert.match(result.stdout, /SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(`Manifest: ${escapeRegExp(manifestPath)}`));
  assert.match(result.stdout, new RegExp(`Note: ${escapeRegExp(notePath)}`));
  assert.match(result.stdout, /Receiving import command \(replace --manifest or --bundle if copied elsewhere\):/);
  assert.match(result.stdout, /pnpm exec tsx scripts\/import-tauri-migration-bundle\.ts \\/);
  assert.match(result.stdout, new RegExp(`--manifest '${escapeRegExp(manifestPath)}' \\\\`));
  assert.match(result.stdout, new RegExp(`Import:[\\s\\S]*Manifest: ${escapeRegExp(manifestPath)}`));
  assert.match(result.stdout, /Relocated import:/);
  assert.match(result.stdout, /relocated-handoff/);
  assert.match(result.stdout, /Temp retained: false/);
  await access(bundlePath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    branch: string;
    branchHead: string;
    bundlePath: string;
    bundleSha256: string;
    importCommand: string;
    schemaVersion: number;
  };
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.branch, migrationBranch);
  assert.equal(manifest.branchHead, sourceHead);
  assert.equal(manifest.bundlePath, "handoff.bundle");
  assert.match(manifest.bundleSha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.importCommand, /import-tauri-migration-bundle/);
  assert.match(manifest.importCommand, new RegExp(`--manifest '${escapeRegExp(manifestPath)}'`));
  const note = await readFile(notePath, "utf8");
  assert.match(note, /# Tauri Migration Handoff/);
  assert.match(note, new RegExp(`Branch: \`${migrationBranch.replaceAll("/", "\\/")}\` @ \`${sourceHead}\``));
  assert.match(note, /package-tauri-migration-handoff/);
  assert.match(note, new RegExp(`--handoff-dir '${escapeRegExp(dirname(manifestPath))}'`));
  assert.match(note, /Preferred path when you copied the tarball plus its `.sha256`, `.commands.sh`, and `.commands.sh.sha256` sidecars/);
  assert.match(note, new RegExp(escapeRegExp(`${dirname(manifestPath)}.tar.gz.commands.sh`)));
  assert.match(note, /verifies its own checksum sidecar and the archive checksum/);
  assert.match(note, /Use an explicit archive argument if the sidecars were copied to another location without renaming the files/);
  assert.doesNotMatch(note, /renamed or copied/);
  assert.match(note, /TAURI_NATIVE_CI_TRIGGER=0/);
  assert.match(note, /TAURI_NATIVE_CI_WAIT=1/);
  assert.match(note, /GH_BIN=<path-to-gh>/);
  assert.match(note, /TAURI_PR_BODY_PATH=<path>/);
  assert.match(note, new RegExp(`--archive '${escapeRegExp(`${dirname(manifestPath)}.tar.gz`)}' \\\\`));
  assert.match(note, /gh pr create --draft/);
  assert.match(note, /--body-file \.tmp\/tauri-migration-pr-body\.md/);
  assert.match(note, new RegExp(`--manifest '${escapeRegExp(manifestPath)}' \\\\`));
  assert.match(note, /push-tauri-migration-handoff/);
  assert.match(note, /including checksum target filenames/);
  assert.match(note, /manifest records the bundle path relative to itself/);
  assert.match(note, /--bundle \/path\/to\/open-design-tauri-migration\.bundle/);
  assert.match(note, /verify-tauri-migration-remote/);
  assert.match(note, /download-tauri-m4-reports/);
  assert.match(note, new RegExp(`--branch '${migrationBranch.replaceAll("/", "\\/")}' \\\\`));
  assert.match(note, new RegExp(`--expected-head ${sourceHead} \\\\`));
  assert.match(note, /--remote origin \\/);
  assert.match(note, /GITHUB_RUN_ID=<github-run-id>/);
  assert.match(note, /--advance/);
  assert.match(note, /advance-tauri-migration-m4-m5/);
  assert.match(note, new RegExp(`advance-tauri-migration-m4-m5[\\s\\S]*--branch '${migrationBranch.replaceAll("/", "\\/")}' \\\\`));
  assert.match(note, new RegExp(`advance-tauri-migration-m4-m5[\\s\\S]*--expected-head ${sourceHead} \\\\`));
  assert.match(note, /\/tmp\/open-design-tauri-m4-reports\/open-design-ci-win-tauri-e2e-report/);
});

test("verify-tauri-migration-handoff can derive standard artifact paths from output-dir", async (t) => {
  const sourceRepo = await createFixtureRepo(t, "open-design-tauri-handoff-dir-");
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();
  const outputDir = join(sourceRepo, "handoff");

  const result = await runHandoffScript(
    "--cwd",
    sourceRepo,
    "--branch",
    migrationBranch,
    "--base",
    "main",
    "--output-dir",
    outputDir,
  );

  const bundlePath = join(outputDir, "open-design-tauri-migration.bundle");
  const manifestPath = join(outputDir, "open-design-tauri-migration-handoff.json");
  const notePath = join(outputDir, "open-design-tauri-migration-handoff.md");
  assert.match(result.stdout, new RegExp(`Bundle: ${escapeRegExp(bundlePath)}`));
  assert.match(result.stdout, new RegExp(`Manifest: ${escapeRegExp(manifestPath)}`));
  assert.match(result.stdout, new RegExp(`Note: ${escapeRegExp(notePath)}`));
  assert.match(result.stdout, /Relocated import:/);
  await access(bundlePath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    branchHead: string;
    bundlePath: string;
  };
  assert.equal(manifest.branchHead, sourceHead);
  assert.equal(manifest.bundlePath, "open-design-tauri-migration.bundle");
  assert.match(await readFile(notePath, "utf8"), new RegExp(`Bundle: \`${escapeRegExp(bundlePath)}\``));
});

test("verify-tauri-migration-handoff rejects dirty source worktrees", async (t) => {
  const sourceRepo = await createFixtureRepo(t, "open-design-tauri-handoff-dirty-");
  await writeFile(join(sourceRepo, "feature.txt"), "dirty\n", "utf8");

  await assert.rejects(
    runHandoffScript("--cwd", sourceRepo, "--branch", migrationBranch, "--base", "main"),
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
  await git(repo, "checkout", "-b", migrationBranch);
  await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
  await git(repo, "add", "feature.txt");
  await git(repo, "commit", "-m", "feature");

  return repo;
}

async function runHandoffScript(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", handoffScript, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function git(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
