import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withDirectoryLock } from "../src/lock.js";

describe("withDirectoryLock", () => {
  it("reclaims a stale lock when the owner process is gone", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-lock-"));
    const lockRoot = join(root, "locks");
    const lockPath = join(lockRoot, "global.lock");

    try {
      await mkdir(lockPath, { recursive: true });
      await writeFile(
        join(lockPath, "owner.json"),
        `${JSON.stringify({ pid: 424242, startedAt: "2026-06-01T00:00:00.000Z" }, null, 2)}\n`,
        "utf8",
      );

      const result = await withDirectoryLock(
        lockRoot,
        "global",
        async () => readFile(join(lockPath, "owner.json"), "utf8"),
        {
          processExists: () => false,
          timeoutMs: 500,
        },
      );

      expect(result).toContain(`"pid": ${process.pid}`);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reclaims an orphaned lock without owner metadata after the grace period", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-lock-orphan-"));
    const lockRoot = join(root, "locks");
    const lockPath = join(lockRoot, "global.lock");

    try {
      await mkdir(lockPath, { recursive: true });

      const result = await withDirectoryLock(
        lockRoot,
        "global",
        async () => readFile(join(lockPath, "owner.json"), "utf8"),
        {
          ownerGraceMs: 0,
          timeoutMs: 500,
        },
      );

      expect(result).toContain(`"pid": ${process.pid}`);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
