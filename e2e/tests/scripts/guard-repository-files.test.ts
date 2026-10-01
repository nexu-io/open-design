import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { collectIgnoredRepositoryDirectories, collectRepositoryFiles } from "../../../scripts/guard.ts";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fixtureParent = path.join(repoRoot, ".tmp");

const createdFixtures: string[] = [];

async function createFixture(): Promise<string> {
  await mkdir(fixtureParent, { recursive: true });
  const root = await mkdtemp(path.join(fixtureParent, "guard-repository-files-"));
  createdFixtures.push(root);

  await mkdir(path.join(root, "kept"), { recursive: true });
  await mkdir(path.join(root, "named-skip"), { recursive: true });
  await mkdir(path.join(root, "worktrees", "copy"), { recursive: true });
  await writeFile(path.join(root, "kept", "kept.ts"), "export const kept = true;\n");
  await writeFile(path.join(root, "named-skip", "named-skip.ts"), "export const skipped = true;\n");
  await writeFile(path.join(root, "worktrees", "copy", "ignored.ts"), "export const ignored = true;\n");

  return root;
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

afterEach(async () => {
  await Promise.all(createdFixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("guard repository file collection", () => {
  it("[P1] skips directories git ignores", async () => {
    const root = await createFixture();
    const ignored = new Set([toRepositoryPath(path.join(root, "worktrees"))]);

    const files = await collectRepositoryFiles(root, new Set(), ignored);

    // A local agent worktree or package store is not repository content, and
    // `.gitignore` already says so. Walking it costs a full second copy of the
    // tree per worktree.
    expect(files.some((file) => file.endsWith("/kept/kept.ts"))).toBe(true);
    expect(files.some((file) => file.includes("/worktrees/"))).toBe(false);
  });

  it("[P1] still honours caller-supplied directory names", async () => {
    const root = await createFixture();

    const files = await collectRepositoryFiles(root, new Set(["named-skip"]), new Set());

    expect(files.some((file) => file.endsWith("/kept/kept.ts"))).toBe(true);
    expect(files.some((file) => file.includes("/named-skip/"))).toBe(false);
    expect(files.some((file) => file.endsWith("/worktrees/copy/ignored.ts"))).toBe(true);
  });

  it("[P1] returns a stable order", async () => {
    const root = await createFixture();

    const files = await collectRepositoryFiles(root, new Set(), new Set());

    expect(files).toEqual([...files].sort());
  });

  it("[P1] reads ignored directories from git", async () => {
    const root = await createFixture();
    await writeFile(path.join(root, ".gitignore"), "worktrees/\n");
    await execFileAsync("git", ["init", "-q"], { cwd: root });

    const ignored = await collectIgnoredRepositoryDirectories(root);

    expect(ignored.has("worktrees")).toBe(true);
    expect(ignored.has("kept")).toBe(false);
  });

  it("[P1] treats a directory outside any git checkout as having nothing ignored", async () => {
    // Falling back to an empty set keeps the walk working where git cannot
    // answer — a source tarball, or git missing from PATH. That is the
    // pre-existing behaviour, only slower.
    const outside = await mkdtemp(path.join(tmpdir(), "guard-no-git-"));
    try {
      const ignored = await collectIgnoredRepositoryDirectories(outside);

      expect(ignored.size).toBe(0);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
