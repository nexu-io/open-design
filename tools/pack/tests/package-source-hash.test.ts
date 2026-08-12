import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hashPackageSourcePath } from "../src/package-source-hash.js";

describe("hashPackageSourcePath", () => {
  it("ignores release-only package versions but includes source changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-package-source-hash-"));
    const packageRoot = join(root, "apps", "packaged");
    try {
      await mkdir(join(packageRoot, "src"), { recursive: true });
      await writeFile(join(packageRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
      await writeFile(join(packageRoot, "package.json"), `${JSON.stringify({ name: "@open-design/shell-electron", version: "1.0.0" }, null, 2)}\n`, "utf8");
      const firstHash = await hashPackageSourcePath(packageRoot);

      await writeFile(join(packageRoot, "package.json"), `${JSON.stringify({ name: "@open-design/shell-electron", version: "1.0.1" }, null, 2)}\n`, "utf8");
      const secondHash = await hashPackageSourcePath(packageRoot);

      expect(secondHash).toBe(firstHash);

      await mkdir(join(packageRoot, "tests"), { recursive: true });
      await writeFile(join(packageRoot, "tests", "index.test.ts"), "throw new Error('test only');\n", "utf8");
      await expect(hashPackageSourcePath(packageRoot)).resolves.toBe(firstHash);

      await writeFile(join(packageRoot, "src", "index.ts"), "export const value = 2;\n", "utf8");
      await expect(hashPackageSourcePath(packageRoot)).resolves.not.toBe(firstHash);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("can exclude explicit relative platform-owned subtrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-package-source-scope-"));
    try {
      await mkdir(join(root, "src", "mac"), { recursive: true });
      await mkdir(join(root, "src", "win"), { recursive: true });
      await writeFile(join(root, "src", "common.ts"), "export const common = 1;\n", "utf8");
      await writeFile(join(root, "src", "mac", "index.ts"), "export const mac = 1;\n", "utf8");
      await writeFile(join(root, "src", "win", "index.ts"), "export const win = 1;\n", "utf8");
      const before = await hashPackageSourcePath(root, { ignoredRelativePaths: ["src/win"] });
      await writeFile(join(root, "src", "win", "index.ts"), "export const win = 2;\n", "utf8");
      expect(await hashPackageSourcePath(root, { ignoredRelativePaths: ["src/win"] })).toBe(before);
      await writeFile(join(root, "src", "mac", "index.ts"), "export const mac = 2;\n", "utf8");
      expect(await hashPackageSourcePath(root, { ignoredRelativePaths: ["src/win"] })).not.toBe(before);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
