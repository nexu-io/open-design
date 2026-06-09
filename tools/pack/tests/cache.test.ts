import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ToolPackCache } from "../src/cache.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("ToolPackCache", () => {
  it("builds once, materializes copies, and reports cache hits", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-"));
    const cacheRoot = join(root, "cache");
    const firstOut = join(root, "first", "payload");
    const secondOut = join(root, "second", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const node = {
      id: "test.node",
      key: "key-1",
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), `build-${builds}\n`, "utf8");
        return { builds };
      },
    };

    try {
      const firstManifest = await cache.acquire({ materialize: [{ from: "payload", to: firstOut }], node });
      await writeFile(join(firstOut, "value.txt"), "mutated\n", "utf8");
      await cache.acquire({ materialize: [{ from: "payload", to: secondOut }], node });

      expect(builds).toBe(1);
      expect(firstManifest.entryPath).toContain("test.node");
      expect(await readFile(join(secondOut, "value.txt"), "utf8")).toBe("build-1\n");
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rebuilds stale entries when declared outputs are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-stale-"));
    const cacheRoot = join(root, "cache");
    const out = join(root, "out", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const node = {
      id: "test.stale",
      key: "key-1",
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        if (builds === 1) {
          await mkdir(join(entryRoot, "payload"), { recursive: true });
          await writeFile(join(entryRoot, "payload", "value.txt"), "first\n", "utf8");
          return { builds };
        }
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), "second\n", "utf8");
        return { builds };
      },
    };

    try {
      await cache.acquire({ materialize: [{ from: "payload", to: out }], node });
      const entryPath = cache.report().entries[0]?.entryPath;
      expect(entryPath).toBeDefined();
      await rm(join(entryPath!, "payload"), { force: true, recursive: true });
      await cache.acquire({ materialize: [{ from: "payload", to: out }], node });

      expect(builds).toBe(2);
      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("second\n");
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "stale"]);
      expect(await pathExists(join(cacheRoot, "locks", "global.lock"))).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reads existing hits without building", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-read-hit-"));
    const cacheRoot = join(root, "cache");
    const out = join(root, "out", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const node = {
      id: "test.read-hit",
      key: "key-1",
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), `build-${builds}\n`, "utf8");
        return { builds };
      },
    };

    try {
      expect(await cache.readHit({ materialize: [{ from: "payload", to: out }], node })).toBeNull();
      await cache.acquire({ materialize: [], node });
      const hit = await cache.readHit({ materialize: [{ from: "payload", to: out }], node });

      expect(hit?.payloadMetadata.builds).toBe(1);
      expect(builds).toBe(1);
      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("build-1\n");
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "hit"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reuses stamped materialized targets until the cache key changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-reuse-"));
    const cacheRoot = join(root, "cache");
    const out = join(root, "out", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const createNode = (key: string) => ({
      id: "test.reuse",
      key,
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), `build-${builds}\n`, "utf8");
        return { builds };
      },
    });

    try {
      await cache.acquire({ materialize: [{ from: "payload", reuse: true, to: out }], node: createNode("key-1") });
      await writeFile(join(out, "value.txt"), "mutated\n", "utf8");
      await cache.acquire({ materialize: [{ from: "payload", reuse: true, to: out }], node: createNode("key-1") });

      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("mutated\n");
      expect(cache.report().entries.at(-1)?.materialized[0]?.skipped).toBe(true);

      await cache.acquire({ materialize: [{ from: "payload", reuse: true, to: out }], node: createNode("key-2") });

      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("build-2\n");
      expect(cache.report().entries.at(-1)?.materialized[0]?.skipped).toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("seeds a miss from an alias but still builds the exact entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-seed-"));
    const cacheRoot = join(root, "cache");
    const out = join(root, "out", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const createNode = (key: string) => ({
      id: "test.seed",
      key,
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        const seed = await readFile(join(out, "value.txt"), "utf8").catch(() => "<none>\n");
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), `build-${builds};seed=${seed.trim()}\n`, "utf8");
        return { builds };
      },
    });

    try {
      await cache.acquire({
        aliases: ["family"],
        materialize: [{ from: "payload", reuse: true, to: out }],
        node: createNode("key-1"),
      });
      await rm(out, { force: true, recursive: true });
      await cache.acquire({
        aliases: ["family"],
        materialize: [{ from: "payload", reuse: true, to: out }],
        node: createNode("key-2"),
        seedFrom: [{ aliasKey: "family", materialize: [{ from: "payload", to: out }] }],
      });

      expect(builds).toBe(2);
      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("build-2;seed=build-1;seed=<none>\n");
      expect(cache.report().entries.map((entry) => entry.status)).toEqual(["miss", "miss"]);
      expect(cache.report().entries.at(-1)?.reason).toContain("seeded from alias");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("skips alias seeds that cannot materialize the requested source", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-cache-missing-seed-source-"));
    const cacheRoot = join(root, "cache");
    const out = join(root, "out", "payload");
    let builds = 0;
    const cache = new ToolPackCache(cacheRoot);
    const createNode = (key: string) => ({
      id: "test.missing-seed-source",
      key,
      outputs: ["payload"],
      invalidate: async () => null,
      build: async ({ entryRoot }: { entryRoot: string }) => {
        builds += 1;
        const seed = await readFile(join(out, "value.txt"), "utf8").catch(() => "<none>\n");
        await mkdir(join(entryRoot, "payload"), { recursive: true });
        await writeFile(join(entryRoot, "payload", "value.txt"), `build-${builds};seed=${seed.trim()}\n`, "utf8");
        return { builds };
      },
    });

    try {
      await cache.acquire({
        aliases: ["family"],
        materialize: [{ from: "payload", to: out }],
        node: createNode("key-1"),
      });
      await rm(out, { force: true, recursive: true });
      await cache.acquire({
        aliases: ["family"],
        materialize: [{ from: "payload", to: out }],
        node: createNode("key-2"),
        seedFrom: [{ aliasKey: "family", materialize: [{ from: "missing", to: out }] }],
      });

      expect(builds).toBe(2);
      expect(await readFile(join(out, "value.txt"), "utf8")).toBe("build-2;seed=<none>\n");
      expect(cache.report().entries.at(-1)?.reason).not.toContain("seeded from alias");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
