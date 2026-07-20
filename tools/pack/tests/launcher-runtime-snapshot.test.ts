import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
} from "@open-design/launcher-proto";
import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { readToolPackLauncherRuntimeSnapshot } from "../src/launcher-runtime-snapshot.js";

describe("launcher runtime snapshot", () => {
  it("reports the validated desktop handoff journal with the launcher pointers", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-launcher-snapshot-"));
    try {
      const namespace = "release-beta-win";
      const namespaceBaseRoot = join(root, "runtime", "win", "namespaces");
      const launcherRoot = join(root, "runtime", "win");
      const launcherPaths = resolveLauncherPaths({
        channel: "beta",
        namespace,
        root: launcherRoot,
      });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 2, version: "1.2.3-beta.5" },
        channel: "beta",
        lastSuccessful: { generation: 2, version: "1.2.3-beta.5" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await writeFile(launcherPaths.handoffPath, `${JSON.stringify({
        channel: "beta",
        createdAt: "2026-07-15T01:00:00.000Z",
        handoffId: "4c5ca585-c7a1-4b9a-b725-495d72a5f97b",
        namespace,
        outer: {
          executablePath: join(root, "installed", "Open Design Beta.exe"),
          pid: 4321,
        },
        payloadExecutablePath: join(
          launcherPaths.versionsRoot,
          "1.2.3-beta.5",
          "payload",
          "Open Design Beta.exe",
        ),
        previous: { generation: 0, version: "1.2.3-beta.4" },
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        source: { generation: 2, version: "1.2.3-beta.5" },
        state: "confirmed",
        target: { generation: 2, version: "1.2.3-beta.5" },
        updatedAt: "2026-07-15T01:00:05.000Z",
      })}\n`);

      const snapshot = await readToolPackLauncherRuntimeSnapshot({
        appVersion: "1.2.3-beta.5",
        namespace,
        roots: {
          runtime: {
            namespaceBaseRoot,
          },
        } as ToolPackConfig["roots"],
      });

      expect(snapshot.active).toEqual({ generation: 2, version: "1.2.3-beta.5" });
      expect(snapshot.lastSuccessful).toEqual({ generation: 2, version: "1.2.3-beta.5" });
      expect(snapshot.handoffPath).toBe(launcherPaths.handoffPath);
      expect(snapshot.handoff).toMatchObject({
        previous: { generation: 0, version: "1.2.3-beta.4" },
        state: "confirmed",
        target: { generation: 2, version: "1.2.3-beta.5" },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
