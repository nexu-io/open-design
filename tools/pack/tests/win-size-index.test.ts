import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PathSizeIndex } from "../src/win/fs.js";

describe("PathSizeIndex", () => {
  it("indexes directory sizes and filtered file totals in a single tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-size-index-"));

    try {
      await mkdir(join(root, "app", "node_modules", "@next", "swc-win32-x64"), { recursive: true });
      await mkdir(join(root, "app", "node_modules", "@next", "swc-linux-x64"), { recursive: true });
      await writeFile(join(root, "app", "main.js"), "main\n", "utf8");
      await writeFile(join(root, "app", "main.js.map"), "map-data\n", "utf8");
      await writeFile(join(root, "app", "node_modules", "@next", "swc-win32-x64", "next-swc.node"), "win-swc\n", "utf8");
      await writeFile(join(root, "app", "node_modules", "@next", "swc-linux-x64", "next-swc.node"), "linux-swc\n", "utf8");

      const index = await PathSizeIndex.create(root);

      expect(index.sizePathBytes(join(root, "missing"))).toBe(0);
      expect(index.sizePathBytes(join(root, "app", "main.js"))).toBe(Buffer.byteLength("main\n"));
      expect(index.sizePathBytes(join(root, "app"), { includeFile: (path) => path.endsWith(".map") })).toBe(
        Buffer.byteLength("map-data\n"),
      );
      expect(index.sumChildDirectorySizes(join(root, "app", "node_modules", "@next"), (name) => name.startsWith("swc-win32-"))).toBe(
        Buffer.byteLength("win-swc\n"),
      );
      expect(index.sizePathBytes(root)).toBe(
        Buffer.byteLength("main\n") +
          Buffer.byteLength("map-data\n") +
          Buffer.byteLength("win-swc\n") +
          Buffer.byteLength("linux-swc\n"),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
