import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atomicCopyFile } from "../src/index.js";

describe("atomic copy publication", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "platform-atomic-copy-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("preserves a destination created while the temporary copy is being written", async () => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    await fs.writeFile(source, "downloaded bytes");
    const originalCopyFile = fs.copyFile;
    vi.spyOn(fs, "copyFile").mockImplementation(async (...args) => {
      await originalCopyFile(...args);
      await fs.writeFile(destination, "user changes");
    });
    syncBuiltinESMExports();

    await expect(atomicCopyFile(source, destination)).rejects.toMatchObject({ code: "EEXIST" });

    expect(await fs.readFile(destination, "utf8")).toBe("user changes");
    expect((await fs.readdir(root)).sort()).toEqual(["destination.bin", "source.bin"]);
  });

  it("allows exactly one concurrent no-overwrite copy to publish", async () => {
    const sources = [join(root, "first.bin"), join(root, "second.bin")];
    const destination = join(root, "destination.bin");
    await Promise.all(sources.map((source, index) => fs.writeFile(source, `payload ${index}`)));
    const originalCopyFile = fs.copyFile;
    const ready = Promise.withResolvers<void>();
    let copiesReady = 0;
    vi.spyOn(fs, "copyFile").mockImplementation(async (...args) => {
      await originalCopyFile(...args);
      if (++copiesReady === 2) ready.resolve();
      await ready.promise;
    });
    syncBuiltinESMExports();

    const results = await Promise.allSettled(sources.map((source) => atomicCopyFile(source, destination)));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "EEXIST" } });
    const winner = results.findIndex((result) => result.status === "fulfilled");
    expect(await fs.readFile(destination, "utf8")).toBe(`payload ${winner}`);
    expect((await fs.readdir(root)).sort()).toEqual(["destination.bin", "first.bin", "second.bin"]);
  });

  it.skipIf(process.platform === "win32")("preserves a dangling destination symlink", async () => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    const target = join(root, "missing.bin");
    await fs.writeFile(source, "downloaded bytes");
    await fs.symlink(target, destination);

    await expect(atomicCopyFile(source, destination)).rejects.toMatchObject({ code: "EEXIST" });

    expect(await fs.readlink(destination)).toBe(target);
  });

  it("preserves the previous destination when replacement fails", async () => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    await fs.writeFile(source, "new bytes");
    await fs.writeFile(destination, "old bytes");
    const failure = Object.assign(new Error("injected rename error"), { code: "EIO" });
    vi.spyOn(fs, "rename").mockRejectedValue(failure);
    syncBuiltinESMExports();

    await expect(atomicCopyFile(source, destination, { overwrite: true })).rejects.toBe(failure);

    expect(await fs.readFile(destination, "utf8")).toBe("old bytes");
    expect((await fs.readdir(root)).sort()).toEqual(["destination.bin", "source.bin"]);
  });

  it("keeps the old destination readable until a replacement publishes", async () => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    await fs.writeFile(source, "new bytes");
    await fs.writeFile(destination, "old bytes");
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const originalRename = fs.rename;
    vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
      reached.resolve();
      await release.promise;
      await originalRename(...args);
    });
    syncBuiltinESMExports();

    const pending = atomicCopyFile(source, destination, { overwrite: true });
    await reached.promise;
    try {
      expect(await fs.readFile(destination, "utf8")).toBe("old bytes");
    } finally {
      release.resolve();
      await pending;
    }

    expect(await fs.readFile(destination, "utf8")).toBe("new bytes");
  });

  it.each([false, true])("fails safely when hard links are unsupported (concurrent output: %s)", async (createOutput) => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    await fs.writeFile(source, "downloaded bytes");
    if (createOutput) {
      const originalCopyFile = fs.copyFile;
      vi.spyOn(fs, "copyFile").mockImplementation(async (...args) => {
        await originalCopyFile(...args);
        await fs.writeFile(destination, "user changes");
      });
    }
    const failure = Object.assign(new Error("hard links unsupported"), { code: "ENOTSUP" });
    vi.spyOn(fs, "link").mockRejectedValue(failure);
    syncBuiltinESMExports();

    await expect(atomicCopyFile(source, destination)).rejects.toBe(failure);

    if (createOutput) {
      expect(await fs.readFile(destination, "utf8")).toBe("user changes");
      expect((await fs.readdir(root)).sort()).toEqual(["destination.bin", "source.bin"]);
    } else {
      await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await fs.readdir(root)).toEqual(["source.bin"]);
    }
  });

  it("cleans a failed temporary copy while retaining the old destination", async () => {
    const source = join(root, "source.bin");
    const destination = join(root, "destination.bin");
    await fs.writeFile(source, "new bytes");
    await fs.writeFile(destination, "old bytes");
    const failure = Object.assign(new Error("injected copy error"), { code: "ENOSPC" });
    vi.spyOn(fs, "copyFile").mockImplementation(async (_source, temporary) => {
      await fs.writeFile(temporary, "partial");
      throw failure;
    });
    syncBuiltinESMExports();

    await expect(atomicCopyFile(source, destination, { overwrite: true })).rejects.toBe(failure);

    expect(await fs.readFile(destination, "utf8")).toBe("old bytes");
    expect((await fs.readdir(root)).sort()).toEqual(["destination.bin", "source.bin"]);
  });
});
