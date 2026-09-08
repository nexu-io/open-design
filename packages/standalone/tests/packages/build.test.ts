import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildNodePlatform } from "@/packages/build.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe("physical platform dependency boundary", () => {
  it.each([
    { dependencies: { example: "1.0.0" }, locked: { example: "2.0.0" } },
    { dependencies: { example: "^1.0.0" }, locked: { example: "^1.0.0" } },
    { dependencies: {}, locked: {} },
  ])("rejects unlocked or inconsistent declarations before touching output: %j", async ({ dependencies, locked }) => {
    const root = await mkdtemp(join(tmpdir(), "electron-platform-")); roots.push(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true, dependencies }));
    await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: locked } } }));
    const outputRoot = join(root, "output");
    await expect(buildNodePlatform({ dependenciesRoot: root, outputRoot, target: "darwin-arm64",
      archivePath: join(root, "unused.tar.gz"), lockPath: join(root, "unused.json"),
      verificationEntryPath: join(root, "verify.ts"), preparationEntryPath: join(root, "prepare.ts") })).rejects.toThrow(/matching private package/u);
    await expect(readdir(outputRoot)).rejects.toThrow(/ENOENT/u);
  });
});
