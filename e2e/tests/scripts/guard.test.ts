import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { checkRootPackageManagerLockfiles, isScriptTestFile } from "../../../scripts/guard.ts";

const temporaryDirectories: string[] = [];

async function temporaryRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "open-design-guard-"));
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
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

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
