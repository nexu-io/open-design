import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LAUNCHER_SCHEMA_VERSION, resolveLauncherPaths } from "@open-design/launcher-proto";
import { SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { describe, expect, it } from "vitest";

import { prepareLegacyPayloadDesktopHandoff } from "../../src/sidecar/payload-desktop-handoff.js";

/**
 * Regression for issue #6074:
 * On Windows packaged first install, the daemon logged
 * `[packaged desktop handoff] skipped { reason: 'invalid-payload' }`
 * because `versions/0.16.1/manifest.json` and `payload/Open Design.exe`
 * were absent (no versions/ tree). The trustedWebOriginPort therefore
 * stayed null and /api fell back to HTML.
 *
 * A missing payload on a fresh install where the launcher state is
 * `active == lastSuccessful` (generation 0) should be reported as
 * `launcher-state-not-eligible` rather than `invalid-payload`, so the
 * handoff is not masked as a payload error and the daemon's web-port
 * registration path can still succeed. The web proxy already answers
 * /api with 502 when OD_PORT is unset (PR #7399); this test pins the
 * desktop handoff classification.
 */
describe("6074 desktop handoff invalid-payload regression", () => {
  it("fresh install with missing versions/manifest reports launcher-state-not-eligible, not invalid-payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-6074-regression-"));
    try {
      const namespace = "release-stable-win";
      const version = "0.16.1";
      const runtimeRoot = join(root, "namespaces", namespace, "runtime");
      const launcherPaths = resolveLauncherPaths({ channel: "stable", namespace, root });

      // Outer executable exists at the installed location (NSIS install dir)
      const outerExecutablePath = join(root, "installed", "Open Design.exe");
      await mkdir(join(root, "installed"), { recursive: true });
      await mkdir(runtimeRoot, { recursive: true });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(outerExecutablePath, "");

      // No versions/ directory at all — the field failure mode from #6074
      // install.json points at the outer location
      await writeFile(launcherPaths.installPath, `${JSON.stringify({
        channel: "stable",
        launchPath: outerExecutablePath,
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);

      // runtime.json with generation 0 active == lastSuccessful (fresh install)
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 0, version },
        channel: "stable",
        lastSuccessful: { generation: 0, version },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);

      // No attempt.json, no handoff.json, no versions/0.16.1/manifest.json

      const result = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: version,
          OD_INSTALLATION_DIR: root,
        },
        namespace,
        parentPid: 12345,
        platform: "win32",
        runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });

      // Before fix: { kind: "none", reason: "invalid-payload" }
      // After fix:  { kind: "none", reason: "launcher-state-not-eligible" }
      expect(result).toEqual({ kind: "none", reason: "launcher-state-not-eligible" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("still reports invalid-payload when launcher state is eligible but payload missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-6074-regression-eligible-"));
    try {
      const namespace = "release-beta";
      const version = "1.2.3-beta.5";
      const runtimeRoot = join(root, "namespaces", namespace, "runtime");
      const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
      const outerExecutablePath = join(root, "installed", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta");
      await mkdir(join(outerExecutablePath, ".."), { recursive: true });
      await mkdir(runtimeRoot, { recursive: true });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(outerExecutablePath, "");

      // Do NOT create payload/manifest, so payloadExecutablePath will be null
      await writeFile(launcherPaths.installPath, `${JSON.stringify({
        channel: "beta",
        launchPath: join(root, "installed", "Open Design Beta.app"),
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);

      // Make launcher state eligible: active gen 1, lastSuccessful gen 0, attempt matches active
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 1, version },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await writeFile(launcherPaths.attemptsPath, `${JSON.stringify({
        channel: "beta",
        generation: 1,
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version,
      })}\n`);

      const result = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: version,
          OD_INSTALLATION_DIR: root,
        },
        namespace,
        parentPid: 4321,
        platform: "darwin",
        runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(result).toEqual({ kind: "none", reason: "invalid-payload" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
