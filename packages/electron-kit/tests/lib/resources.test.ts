import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readPackageResource, readPackageResourceText, resolvePackageResourcePath } from "@/lib/resources.js";

describe("package resource lookup", () => {
  it("walks package.json parents and ignores a differently named nested package", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-kit-resource-"));
    const nested = join(root, "nested", "src");
    try {
      await mkdir(join(root, "resources"), { recursive: true });
      await mkdir(nested, { recursive: true });
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "@example/target" }), "utf8");
      await writeFile(join(root, "nested", "package.json"), JSON.stringify({ name: "@example/other" }), "utf8");
      await writeFile(join(root, "resources", "fixture.txt"), "fixture\n", "utf8");
      const request = {
        packageName: "@example/target",
        resourcePath: "resources/fixture.txt",
        startDirectory: nested,
      } as const;
      await expect(resolvePackageResourcePath(request)).resolves.toBe(join(root, "resources", "fixture.txt"));
      await expect(readPackageResourceText(request)).resolves.toBe("fixture\n");
      await expect(readPackageResource(request)).resolves.toEqual(Buffer.from("fixture\n"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects absolute and parent-traversing resource paths", async () => {
    await expect(resolvePackageResourcePath({ packageName: "x", resourcePath: "../secret", startDirectory: "/tmp" }))
      .rejects.toThrow(/cannot leave/u);
    await expect(resolvePackageResourcePath({ packageName: "x", resourcePath: "/secret", startDirectory: "/tmp" }))
      .rejects.toThrow(/must be relative/u);
  });
});
