import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  checkRootPackageManagerLockfiles,
  checkToolsLayout,
  collectTrackedRepositoryFiles,
  getTrackedRepositoryFiles,
  isScriptTestFile,
} from "../../../scripts/guard.ts";

const execFileAsync = promisify(execFile);

const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "open-design-guard-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function cleanUpTemporaryRepositories(): Promise<void> {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
}

/** A `tools/` tree holding every entry the allowlist requires. */
async function temporaryToolsRepository(): Promise<string> {
  const repository = await temporaryRepository();
  const toolsRoot = path.join(repository, "tools");
  await mkdir(toolsRoot);
  await writeFile(path.join(toolsRoot, "AGENTS.md"), "");
  await Promise.all(
    ["dev", "pack", "release", "serve"].map((directory) => mkdir(path.join(toolsRoot, directory))),
  );
  return repository;
}

const trackedToolsFiles = new Set(["tools/AGENTS.md"]);

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * The walk reports paths relative to the repository root, so a fixture for it
 * has to live inside the repository. `.tmp/` is git-ignored and already
 * skipped by every check that walks from the root.
 */
async function temporaryWalkFixture(): Promise<string> {
  const parent = path.join(repoRoot, ".tmp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "open-design-guard-walk-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("scripts test-free boundary", () => {
  test.each(["scripts/example.test.ts", "scripts/example.test.mts"])("recognizes %s as a test file", (file) => {
    expect(isScriptTestFile(file)).toBe(true);
  });

  test("does not classify a non-test filename as a test file", () => {
    expect(isScriptTestFile("scripts/example.ts")).toBe(false);
  });
});

describe("root package-manager lockfile boundary", () => {
  afterEach(cleanUpTemporaryRepositories);

  test("accepts a repository without a Bun lockfile", async () => {
    const repository = await temporaryRepository();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(checkRootPackageManagerLockfiles(repository)).resolves.toBe(true);
  });

  test("rejects a root bun.lock", async () => {
    const repository = await temporaryRepository();
    await writeFile(path.join(repository, "bun.lock"), "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(checkRootPackageManagerLockfiles(repository)).resolves.toBe(false);
  });
});

describe("tracked repository files", () => {
  afterEach(cleanUpTemporaryRepositories);

  test("reads the tracked paths from the git index", async () => {
    const repository = await temporaryRepository();
    await writeFile(path.join(repository, "tracked.ts"), "");
    await writeFile(path.join(repository, ".gitignore"), ".DS_Store\n");
    await writeFile(path.join(repository, ".DS_Store"), "");
    await execFileAsync("git", ["init", "-q"], { cwd: repository });
    await execFileAsync("git", ["add", "tracked.ts", ".gitignore"], { cwd: repository });

    await expect(getTrackedRepositoryFiles(repository)).resolves.toStrictEqual(
      new Set([".gitignore", "tracked.ts"]),
    );
  });

  test("reports nothing known outside a git checkout", async () => {
    // Callers then accept every walked file, which is the pre-existing
    // behaviour: a source tarball, or git missing from PATH.
    const repository = await temporaryRepository();

    await expect(getTrackedRepositoryFiles(repository)).resolves.toBeNull();
  });
});

describe("tools layout boundary", () => {
  afterEach(cleanUpTemporaryRepositories);

  test("accepts a tools/ tree that matches the allowlist", async () => {
    const repository = await temporaryToolsRepository();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(checkToolsLayout(repository, trackedToolsFiles)).resolves.toBe(true);
  });

  test("ignores an untracked stray such as a .DS_Store", async () => {
    const repository = await temporaryToolsRepository();
    await writeFile(path.join(repository, "tools", ".DS_Store"), "");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(checkToolsLayout(repository, trackedToolsFiles)).resolves.toBe(true);
  });

  test("still rejects a tracked entry that is not on the allowlist", async () => {
    const repository = await temporaryToolsRepository();
    await writeFile(path.join(repository, "tools", "launcher.ts"), "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      checkToolsLayout(repository, new Set([...trackedToolsFiles, "tools/launcher.ts"])),
    ).resolves.toBe(false);
  });

  test("still rejects a directory that is not on the allowlist", async () => {
    const repository = await temporaryToolsRepository();
    await mkdir(path.join(repository, "tools", "launcher"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(checkToolsLayout(repository, trackedToolsFiles)).resolves.toBe(false);
  });

  test("still rejects a missing required boundary", async () => {
    const repository = await temporaryToolsRepository();
    await rm(path.join(repository, "tools", "AGENTS.md"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(checkToolsLayout(repository, trackedToolsFiles)).resolves.toBe(false);
  });

  test("flags every entry when git cannot say what is tracked", async () => {
    const repository = await temporaryToolsRepository();
    await writeFile(path.join(repository, "tools", ".DS_Store"), "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(checkToolsLayout(repository, null)).resolves.toBe(false);
  });
});

describe("tracked repository file collection", () => {
  afterEach(cleanUpTemporaryRepositories);

  test("drops a walked file that git does not track", async () => {
    const fixture = await temporaryWalkFixture();
    await writeFile(path.join(fixture, "helper.ts"), "");
    await writeFile(path.join(fixture, ".DS_Store"), "");
    const helper = path.relative(repoRoot, path.join(fixture, "helper.ts")).split(path.sep).join("/");

    await expect(collectTrackedRepositoryFiles(fixture, new Set(), new Set([helper]))).resolves.toStrictEqual([
      helper,
    ]);
  });

  test("keeps every walked file when git cannot say what is tracked", async () => {
    const fixture = await temporaryWalkFixture();
    await writeFile(path.join(fixture, "helper.ts"), "");

    await expect(collectTrackedRepositoryFiles(fixture, new Set(), null)).resolves.toHaveLength(1);
  });

  test("still honours the caller's skipped directory names", async () => {
    const fixture = await temporaryWalkFixture();
    await mkdir(path.join(fixture, "reports"));
    await writeFile(path.join(fixture, "reports", "tracked.ts"), "");
    const tracked = path
      .relative(repoRoot, path.join(fixture, "reports", "tracked.ts"))
      .split(path.sep)
      .join("/");

    await expect(
      collectTrackedRepositoryFiles(fixture, new Set(["reports"]), new Set([tracked])),
    ).resolves.toStrictEqual([]);
  });
});
