import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
} from "@open-design/shell/update";
import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveToolPackInspectRuntimeSnapshots } from "../src/inspect-runtime-snapshots.js";
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
        releaseVersion: "1.2.3-beta.5",
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

  it("reads an updater-disabled local runtime only when the Shell reports its exact path", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-local-inspect-"));
    try {
      const namespace = "wl-123456";
      const namespaceBaseRoot = join(root, "runtime", "win", "namespaces");
      const launcherPaths = resolveLauncherPaths({
        channel: "local",
        namespace,
        root: join(root, "runtime", "win"),
      });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 0, version: "0.19.4" },
        channel: "local",
        lastSuccessful: { generation: 0, version: "0.19.4" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      const config = {
        debugChannel: "local",
        namespace,
        releaseVersion: "0.19.4-local.123456",
        roots: { runtime: { namespaceBaseRoot } },
      } as ToolPackConfig;
      const statusFor = (launcherRuntimePath: string) => ({
        state: "running",
        update: {
          channel: "stable",
          paths: { launcherRoot: null, launcherRuntimePath },
          platform: "win32",
        },
      }) as unknown as NonNullable<Parameters<typeof resolveToolPackInspectRuntimeSnapshots>[1]>;
      const status = statusFor(launcherPaths.runtimePath);

      const matching = await resolveToolPackInspectRuntimeSnapshots(config, status);
      expect(matching.launcher).toMatchObject({
        active: { generation: 0, version: "0.19.4" },
        channel: "local",
        exists: true,
        runtimePath: launcherPaths.runtimePath,
      });
      expect(matching.launcherSource.kind).toBe("tools-pack-runtime");

      const mismatched = await resolveToolPackInspectRuntimeSnapshots(
        config,
        statusFor(join(root, "unexpected", "runtime.json")),
      );
      expect(mismatched.launcher).toBeNull();
      expect(mismatched.launcherSource.kind).toBe("installed-runtime");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
