import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";
import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startDaemonRuntime = vi.fn(async (_options?: unknown) => ({
  stop: vi.fn(async () => undefined),
  url: "http://127.0.0.1:48123",
}));

vi.mock("../../src/daemon-startup.js", () => ({
  startDaemonRuntime,
}));

import {
  allowedBrowserPorts,
  isAllowedBrowserOrigin,
} from "../../src/origin-validation.js";
import { prepareLegacyPayloadDesktopHandoff } from "../../src/sidecar/payload-desktop-handoff.js";

/**
 * Regression for issue #6074: a fresh Windows install logged
 * `[packaged desktop handoff] skipped { reason: 'invalid-payload' }` and the
 * daemon never trusted the web origin, so every `/api` call from the web UI
 * was rejected and the SPA answered with HTML.
 *
 * The desktop handoff's classification is only a log line — the trusted web
 * port is delivered by the packaged web supervisor's `REGISTER_WEB_URL`
 * message. These tests therefore cover both halves: the launcher-state
 * classification stays fail-closed, and the packaged startup still delivers
 * the web port to the daemon on the fresh-install state from #6074.
 */
async function freshWindowsInstall() {
  const root = await mkdtemp(join(tmpdir(), "od-6074-fresh-win-"));
  const namespace = "release-stable-win";
  const version = "0.16.1";
  const runtimeRoot = join(root, "namespaces", namespace, "runtime");
  const launcherPaths = resolveLauncherPaths({ channel: "stable", namespace, root });
  const outerExecutablePath = join(root, "installed", "Open Design.exe");
  await mkdir(join(root, "installed"), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(launcherPaths.stateRoot, { recursive: true });
  await writeFile(outerExecutablePath, "");
  await writeFile(launcherPaths.installPath, `${JSON.stringify({
    channel: "stable",
    launchPath: outerExecutablePath,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  })}\n`);
  // Generation 0 with active == lastSuccessful: the freshly installed
  // launcher that has never promoted a payload version.
  await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
    active: { generation: 0, version },
    channel: "stable",
    lastSuccessful: { generation: 0, version },
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  })}\n`);
  // No `versions/<version>/manifest.json` and no payload tree at all, which
  // is the field state reported in #6074.
  return { launcherPaths, namespace, outerExecutablePath, root, runtimeRoot, version };
}

async function eligibleInstallWithMismatchedManifest() {
  const root = await mkdtemp(join(tmpdir(), "od-6074-mismatched-manifest-"));
  const namespace = "release-beta";
  const version = "1.2.3-beta.5";
  const runtimeRoot = join(root, "namespaces", namespace, "runtime");
  const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
  const versionPaths = resolveLauncherVersionPaths({ channel: "beta", namespace, root, version });
  const outerBundlePath = join(root, "installed", "Open Design Beta.local.app");
  const outerExecutablePath = join(outerBundlePath, "Contents", "MacOS", "Open Design Beta");
  // The canonical executable a filename probe would have accepted.
  const canonicalPayloadExecutable = join(
    versionPaths.payloadRoot,
    "Open Design Beta.app",
    "Contents",
    "MacOS",
    "Open Design Beta",
  );
  await mkdir(join(outerExecutablePath, ".."), { recursive: true });
  await mkdir(join(canonicalPayloadExecutable, ".."), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(launcherPaths.stateRoot, { recursive: true });
  await writeFile(outerExecutablePath, "");
  await writeFile(canonicalPayloadExecutable, "");
  // The version root was never prepared for 1.2.3-beta.5: the manifest still
  // names the previous release, so the surviving executable proves nothing.
  await writeFile(versionPaths.manifestPath, `${JSON.stringify({
    channel: "beta",
    entry: { executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta" },
    namespace,
    platform: "darwin",
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version: "1.2.3-beta.4",
  })}\n`);
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
  await writeFile(launcherPaths.installPath, `${JSON.stringify({
    channel: "beta",
    launchPath: outerBundlePath,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  })}\n`);
  return { launcherPaths, namespace, outerExecutablePath, root, runtimeRoot, version };
}

describe("6074 fresh-install desktop handoff regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OD_WEB_PORT;
  });

  afterEach(() => {
    delete process.env.OD_WEB_PORT;
  });

  it("registers the packaged web origin for a fresh Windows install with no prepared payload", async () => {
    const state = await freshWindowsInstall();
    const daemonRoot = await mkdtemp(join(tmpdir(), "od-6074-daemon-"));
    try {
      // The handoff still classifies the fresh state as not eligible rather
      // than as a payload error, preserving #6074's diagnostic intent.
      await expect(prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(state.root, "data"),
        env: { OD_APP_VERSION: state.version, OD_INSTALLATION_DIR: state.root },
        namespace: state.namespace,
        outerPid: 4321,
        platform: "win32",
        requestDesktopStatus: async () => ({
          executablePath: state.outerExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: state.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toEqual({ kind: "none", reason: "launcher-state-not-eligible" });

      const { startDaemonSidecar } = await import("../../src/sidecar/server.js");
      const handle = await startDaemonSidecar({
        app: APP_KEYS.DAEMON,
        base: state.runtimeRoot,
        ipc: join(daemonRoot, "daemon.sock"),
        mode: SIDECAR_MODES.RUNTIME,
        namespace: state.namespace,
        source: SIDECAR_SOURCES.PACKAGED,
      });

      try {
        const daemonPort = 48123;
        const webUrl = "http://127.0.0.1:64248";
        // The daemon's browser-origin middleware for /api, evaluated exactly
        // as apps/daemon/src/server.ts does: the ports it trusts, the Host the
        // web app sends, and the Origin its fetch() carries.
        const apiOriginAllowed = () => isAllowedBrowserOrigin(
          webUrl,
          `127.0.0.1:${daemonPort}`,
          allowedBrowserPorts(daemonPort),
          "127.0.0.1",
          [],
        );

        expect((await handle.status()).trustedWebOriginPort).toBeNull();
        // Until the web port is registered every /api call from the web origin
        // is refused, which is the user-visible half of #6074.
        expect(apiOriginAllowed()).toBe(false);

        // `registerPackagedWebUrl` in apps/packaged/src/sidecars.ts issues
        // exactly this message once the web sidecar reports its dynamic port.
        await handle.invoke(SIDECAR_MESSAGES.REGISTER_WEB_URL, { url: webUrl });

        expect(process.env.OD_WEB_PORT).toBe("64248");
        expect((await handle.status()).trustedWebOriginPort).toBe(64248);
        // The /api middleware now admits the request from the web origin.
        expect(apiOriginAllowed()).toBe(true);
      } finally {
        await handle.stop();
        await handle.waitUntilStopped();
      }
    } finally {
      await rm(daemonRoot, { recursive: true, force: true });
      await rm(state.root, { recursive: true, force: true });
    }
  });

  it("fails closed when an eligible state has a canonical executable but a mismatched manifest", async () => {
    const state = await eligibleInstallWithMismatchedManifest();
    try {
      await expect(prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(state.root, "data"),
        env: { OD_APP_VERSION: state.version, OD_INSTALLATION_DIR: state.root },
        namespace: state.namespace,
        outerPid: 4321,
        platform: "darwin",
        requestDesktopStatus: async () => ({
          executablePath: state.outerExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: state.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toEqual({ kind: "none", reason: "invalid-payload" });
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });
});
