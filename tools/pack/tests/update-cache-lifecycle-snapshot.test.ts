import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { readToolPackUpdateCacheLifecycleSnapshot } from "../src/update-cache-lifecycle-snapshot.js";

function makeConfig(root: string): Pick<ToolPackConfig, "platform" | "roots"> {
  return {
    platform: "win",
    roots: {
      cacheRoot: join(root, "cache"),
      output: {
        appBuilderRoot: join(root, "out", "win", "namespaces", "release-beta-win", "builder"),
        namespaceRoot: join(root, "out", "win", "namespaces", "release-beta-win"),
        platformRoot: join(root, "out", "win"),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", "win", "namespaces"),
        namespaceRoot: join(root, "runtime", "win", "namespaces", "release-beta-win"),
      },
      toolPackRoot: root,
    },
  };
}

describe("tools-pack updater cache lifecycle snapshot", () => {
  it("reads the updater cleanup descriptor offline", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-update-cache-"));
    try {
      const config = makeConfig(root);
      const updateRoot = join(config.roots.runtime.namespaceRoot, "updates");
      const releaseRoot = join(updateRoot, "releases", "1.0.0-beta.1-win-x64-old");
      await mkdir(releaseRoot, { recursive: true });
      await writeFile(join(releaseRoot, "artifact.exe"), "installer", "utf8");
      await mkdir(join(updateRoot, "state"), { recursive: true });
      await writeFile(join(updateRoot, "state", "cleanup.json"), `${JSON.stringify({
        currentVersion: "1.0.0-beta.2",
        platform: "win32",
        releases: [
          {
            currentVersion: "1.0.0-beta.2",
            deprecatedAt: "2026-06-08T00:00:00.000Z",
            key: "1.0.0-beta.1-win-x64-old",
            metadataPath: "releases/1.0.0-beta.1-win-x64-old/metadata.json",
            path: "releases/1.0.0-beta.1-win-x64-old",
            reason: "older-than-current-version",
            state: "deprecated",
            updatedAt: "2026-06-08T00:00:00.000Z",
            version: "1.0.0-beta.1",
          },
        ],
        trigger: "next-version-ready",
        updatedAt: "2026-06-08T00:00:00.000Z",
        version: 1,
      }, null, 2)}\n`, "utf8");

      const snapshot = await readToolPackUpdateCacheLifecycleSnapshot(config);

      expect(snapshot.descriptorExists).toBe(true);
      expect(snapshot.releaseCount).toBe(1);
      expect(snapshot.releaseBytes).toBeGreaterThan(0);
      expect(snapshot.summary).toMatchObject({
        lastTrigger: "next-version-ready",
        platform: "win32",
        releases: {
          cleanupDeferred: 0,
          cleanupRemoved: 0,
          deprecated: 1,
          errors: 0,
          retained: 0,
          total: 1,
          unknown: 0,
        },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
