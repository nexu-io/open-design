import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { acquireBuildArchive } from "@/build-api.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("reuses checksum-verified immutable build inputs through the shared download cache", async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "pack-build-cache-")); roots.push(cacheRoot);
  await writeFile(join(cacheRoot, "other-build-cache"), "owned by another build concern");
  const bytes = "locked archive", fetch = vi.fn(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  const input = { cacheRoot, fileName: "archive.tar.gz", url: "https://build.example/archive.tar.gz", sha256: createHash("sha256").update(bytes).digest("hex") };
  const first = await acquireBuildArchive(input), second = await acquireBuildArchive(input);
  expect(second.path).toBe(first.path);
  expect(await readFile(first.path, "utf8")).toBe(bytes);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await readFile(join(cacheRoot, "other-build-cache"), "utf8")).toBe("owned by another build concern");
});

it("rejects unsafe build inputs before acquiring anything", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const input = { cacheRoot: tmpdir(), fileName: "archive.tar.gz", url: "https://build.example/archive.tar.gz", sha256: "a".repeat(64) };
  for (const change of [{ cacheRoot: "relative" }, { fileName: "../escape" }, { url: "http://build.example/archive" }, { url: "https://user:pass@build.example/archive" }, { sha256: "bad" }]) {
    await expect(acquireBuildArchive({ ...input, ...change })).rejects.toThrow("invalid immutable build archive input");
  }
  expect(fetch).not.toHaveBeenCalled();
});
