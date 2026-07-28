// Tests for the updateInstallMode pref's effect on candidate selection — #4467 (PR1).
//
// Spec: checkForUpdates uses:
//   preferPayload = pref === 'manual' ? false : await hasValidLauncherPayloadContext(config)
//
// pref='manual'      => installer/DMG candidate even when payload + valid launcher context present
// pref='automatic'   => payload candidate selected when payload + valid launcher context present
// pref unset         => same as 'automatic'
//
// These tests are RED until the implementation lands.

import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LAUNCHER_SCHEMA_VERSION } from "@open-design/launcher-proto";
import { DESKTOP_UPDATE_CHANNELS, DESKTOP_UPDATE_STATES, SIDECAR_SOURCES } from "@open-design/sidecar-proto";

import {
  createDesktopUpdater,
  DESKTOP_UPDATE_ENV,
} from "../../src/main/updater.js";

// ---------------------------------------------------------------------------
// Minimal fixture helpers (mirrors the pattern in updater.test.ts)
// ---------------------------------------------------------------------------

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "od-install-mode-test-"));
}

function serverAddress(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("not TCP");
  return `127.0.0.1:${address.port}`;
}

function updaterEnv(metadataUrl: string, platform = "win32"): NodeJS.ProcessEnv {
  return {
    [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "1",
    [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
    [DESKTOP_UPDATE_ENV.ENABLED]: "1",
    [DESKTOP_UPDATE_ENV.METADATA_URL]: metadataUrl,
    [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
    [DESKTOP_UPDATE_ENV.PLATFORM]: platform,
  };
}

type FixtureServer = {
  close: () => Promise<void>;
  metadataUrl: string;
};

async function createPayloadFixtureServer(options: {
  version: string;
  installerBody?: string;
  payloadBody?: string;
}): Promise<FixtureServer> {
  const version = options.version;
  const installerBody = Buffer.from(options.installerBody ?? "installer fixture bytes");
  const payloadBody = Buffer.from(options.payloadBody ?? "payload fixture bytes");
  const installerDigest = createHash("sha256").update(installerBody).digest("hex");
  const payloadDigest = createHash("sha256").update(payloadBody).digest("hex");

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/metadata.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        baseVersion: version.replace(/-.*/, ""),
        betaNumber: Number(version.match(/\.(\d+)$/)?.[1] ?? 0),
        betaVersion: version,
        channel: "beta",
        platforms: {
          win: {
            arch: "x64",
            enabled: true,
            artifacts: {
              installer: {
                name: `open-design-${version}-win-x64-setup.exe`,
                sha256Url: `http://${serverAddress(server)}/installer.exe.sha256`,
                size: installerBody.byteLength,
                url: `http://${serverAddress(server)}/installer.exe`,
              },
              payload: {
                name: `open-design-${version}-win-x64-payload.7z`,
                sha256Url: `http://${serverAddress(server)}/payload.7z.sha256`,
                size: payloadBody.byteLength,
                url: `http://${serverAddress(server)}/payload.7z`,
              },
            },
          },
        },
        version: 1,
      }));
      return;
    }
    if (url === "/installer.exe") {
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-length", String(installerBody.byteLength));
      res.end(installerBody);
      return;
    }
    if (url === "/payload.7z") {
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-length", String(payloadBody.byteLength));
      res.end(payloadBody);
      return;
    }
    if (url === "/installer.exe.sha256") {
      res.end(`${installerDigest}  open-design-${version}-win-x64-setup.exe\n`);
      return;
    }
    if (url === "/payload.7z.sha256") {
      res.end(`${payloadDigest}  open-design-${version}-win-x64-payload.7z\n`);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err == null ? resolve() : reject(err)));
      }),
    metadataUrl: `http://${serverAddress(server)}/metadata.json`,
  };
}

// Writes a valid launcher context (runtime.json + installed launch path) so
// hasValidLauncherPayloadContext returns true.
async function writeValidLauncherContext(root: string, version: string) {
  const launcherRoot = root;
  const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
  const launcherRuntimePath = join(root, "launcher", "runtime.json");
  const namespace = "release-beta-win";

  await mkdir(join(root, "installed"), { recursive: true });
  await writeFile(launcherLaunchPath, "");
  await mkdir(join(root, "launcher"), { recursive: true });
  await mkdir(
    join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", version),
    { recursive: true },
  );
  await writeFile(
    launcherRuntimePath,
    `${JSON.stringify({
      active: { generation: 0, version },
      channel: "beta",
      lastSuccessful: { generation: 0, version },
      namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    })}\n`,
  );

  return { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("desktop updater install-mode candidate selection", () => {
  it("selects the installer when pref='manual' even when payload + valid launcher context is present", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          // The implementation will read this at check time; pref='manual' forces installer.
          readUpdateInstallMode: async () => "manual" as const,
        },
      );

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("installer");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("selects the payload when pref='automatic' and valid launcher context is present", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    let extractCount = 0;
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          readUpdateInstallMode: async () => "automatic" as const,
          extractLauncherPayloadArchive: async ({ destinationRoot }) => {
            extractCount += 1;
            await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
            await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
            await writeFile(
              join(destinationRoot, "manifest.json"),
              `${JSON.stringify({
                channel: "beta",
                entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
                namespace,
                payloadRoot: "payload",
                platform: "win32",
                schemaVersion: LAUNCHER_SCHEMA_VERSION,
                version: "1.0.0-beta.2",
              })}\n`,
            );
            await writeFile(
              join(destinationRoot, "payload", "resources", "open-design-config.json"),
              "{}\n",
            );
          },
        },
      );

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reselects the installer when pref changes to manual after a payload is downloaded", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    let mode: "automatic" | "manual" = "automatic";
    let extractCount = 0;
    const installerLaunches: Array<{ installerPath: string; root: string }> = [];
    const payloadLaunches: Array<{ launchPath: string; root: string }> = [];
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          readUpdateInstallMode: async () => mode,
          extractLauncherPayloadArchive: async ({ destinationRoot }) => {
            extractCount += 1;
            await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
            await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
            await writeFile(
              join(destinationRoot, "manifest.json"),
              `${JSON.stringify({
                channel: "beta",
                entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
                namespace,
                payloadRoot: "payload",
                platform: "win32",
                schemaVersion: LAUNCHER_SCHEMA_VERSION,
                version: "1.0.0-beta.2",
              })}\n`,
            );
            await writeFile(
              join(destinationRoot, "payload", "resources", "open-design-config.json"),
              "{}\n",
            );
          },
          launchAppAfterQuit: async (input) => {
            payloadLaunches.push({ launchPath: input.launchPath, root: input.root });
            return {};
          },
          launchInstallerAfterQuit: async (input) => {
            installerLaunches.push({ installerPath: input.installerPath, root: input.root });
            return "";
          },
          processPid: 4242,
        },
      );

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");

      mode = "manual";
      const installed = await updater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.artifact?.type).toBe("installer");
      expect(installed.capabilities.requiresManualInstall).toBe(true);
      expect(installed.capabilities.canOpenInstaller).toBe(true);
      expect(installed.capabilities.canApplyInPlace).toBe(false);
      expect(installed.installResult?.path).not.toBe(checked.downloadPath);
      expect(installerLaunches).toHaveLength(1);
      expect(installed.installResult?.path).toBe(installerLaunches[0]?.installerPath);
      expect(payloadLaunches).toEqual([]);
      expect(extractCount).toBe(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps the downloaded payload if manual reselect cannot fetch metadata", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    let mode: "automatic" | "manual" = "automatic";
    let fixtureClosed = false;
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          readUpdateInstallMode: async () => mode,
          extractLauncherPayloadArchive: async ({ destinationRoot }) => {
            await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
            await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
            await writeFile(
              join(destinationRoot, "manifest.json"),
              `${JSON.stringify({
                channel: "beta",
                entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
                namespace,
                payloadRoot: "payload",
                platform: "win32",
                schemaVersion: LAUNCHER_SCHEMA_VERSION,
                version: "1.0.0-beta.2",
              })}\n`,
            );
            await writeFile(
              join(destinationRoot, "payload", "resources", "open-design-config.json"),
              "{}\n",
            );
          },
        },
      );

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");

      await fixture.close();
      fixtureClosed = true;
      mode = "manual";
      const failed = await updater.installUpdate();

      expect(failed.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(failed.error?.code).toBe("metadata-unreachable");
      expect(failed.artifact?.type).toBe("payload");
      expect(failed.downloadPath).toBe(checked.downloadPath);
    } finally {
      if (!fixtureClosed) await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not double-open the installer when manual reselect auto-opens it", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    let extractCount = 0;
    const installerLaunches: Array<{ installerPath: string; root: string }> = [];
    const payloadLaunches: Array<{ launchPath: string; root: string }> = [];
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const commonConfig = {
        arch: "x64" as const,
        currentVersion,
        downloadRoot: join(root, "updates"),
        launcherLaunchPath,
        launcherRoot,
        launcherRuntimePath,
        namespace,
        source: SIDECAR_SOURCES.PACKAGED,
      };
      const commonDeps = {
        extractLauncherPayloadArchive: async ({ destinationRoot }: { destinationRoot: string }) => {
          extractCount += 1;
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
              namespace,
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.2",
            })}\n`,
          );
          await writeFile(
            join(destinationRoot, "payload", "resources", "open-design-config.json"),
            "{}\n",
          );
        },
        launchAppAfterQuit: async (input: { launchPath: string; root: string }) => {
          payloadLaunches.push({ launchPath: input.launchPath, root: input.root });
          return {};
        },
        launchInstallerAfterQuit: async (input: { installerPath: string; root: string }) => {
          installerLaunches.push({ installerPath: input.installerPath, root: input.root });
          return "";
        },
        processPid: 4242,
      };

      const initialUpdater = createDesktopUpdater(
        {
          ...commonConfig,
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
        },
        {
          ...commonDeps,
          readUpdateInstallMode: async () => "automatic" as const,
        },
      );

      const checked = await initialUpdater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");

      const manualUpdater = createDesktopUpdater(
        {
          ...commonConfig,
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.AUTO_OPEN]: "1",
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
        },
        {
          ...commonDeps,
          readUpdateInstallMode: async () => "manual" as const,
        },
      );

      const installed = await manualUpdater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.artifact?.type).toBe("installer");
      expect(installed.installResult?.path).not.toBe(checked.downloadPath);
      expect(installerLaunches).toHaveLength(1);
      expect(installed.installResult?.path).toBe(installerLaunches[0]?.installerPath);
      expect(payloadLaunches).toEqual([]);
      expect(extractCount).toBe(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("selects the payload when pref is unset and valid launcher context is present (default = automatic)", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          // No readUpdateInstallMode provided — pref defaults to undefined → treated as 'automatic'.
          extractLauncherPayloadArchive: async ({ destinationRoot }) => {
            await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
            await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
            await writeFile(
              join(destinationRoot, "manifest.json"),
              `${JSON.stringify({
                channel: "beta",
                entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
                namespace,
                payloadRoot: "payload",
                platform: "win32",
                schemaVersion: LAUNCHER_SCHEMA_VERSION,
                version: "1.0.0-beta.2",
              })}\n`,
            );
            await writeFile(
              join(destinationRoot, "payload", "resources", "open-design-config.json"),
              "{}\n",
            );
          },
        },
      );

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reselects the payload when pref changes to automatic after an installer is downloaded", async () => {
    const root = makeRoot();
    const fixture = await createPayloadFixtureServer({ version: "1.0.0-beta.2" });
    const currentVersion = "1.0.0-beta.1";
    let mode: "automatic" | "manual" = "manual";
    let extractCount = 0;
    const installerLaunches: Array<{ installerPath: string; root: string }> = [];
    const payloadLaunches: Array<{ launchPath: string; root: string }> = [];
    try {
      const { launcherLaunchPath, launcherRoot, launcherRuntimePath, namespace } =
        await writeValidLauncherContext(root, currentVersion);

      const updater = createDesktopUpdater(
        {
          arch: "x64",
          currentVersion,
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          launcherLaunchPath,
          launcherRoot,
          launcherRuntimePath,
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          readUpdateInstallMode: async () => mode,
          extractLauncherPayloadArchive: async ({ destinationRoot }) => {
            extractCount += 1;
            await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
            await writeFile(join(destinationRoot, "payload", "Open Design Beta.exe"), "");
            await writeFile(
              join(destinationRoot, "manifest.json"),
              `${JSON.stringify({
                channel: "beta",
                entry: { cwd: "payload", executable: "payload/Open Design Beta.exe" },
                namespace,
                payloadRoot: "payload",
                platform: "win32",
                schemaVersion: LAUNCHER_SCHEMA_VERSION,
                version: "1.0.0-beta.2",
              })}\n`,
            );
            await writeFile(
              join(destinationRoot, "payload", "resources", "open-design-config.json"),
              "{}\n",
            );
          },
          launchAppAfterQuit: async (input) => {
            payloadLaunches.push({ launchPath: input.launchPath, root: input.root });
            return {};
          },
          launchInstallerAfterQuit: async (input) => {
            installerLaunches.push({ installerPath: input.installerPath, root: input.root });
            return "";
          },
          processPid: 4242,
        },
      );

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("installer");

      mode = "automatic";
      const installed = await updater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.artifact?.type).toBe("payload");
      expect(installed.capabilities.canApplyInPlace).toBe(true);
      expect(installed.capabilities.requiresManualInstall).toBe(false);
      expect(installed.installResult?.path).toBeDefined();
      expect(payloadLaunches).toHaveLength(1);
      expect(installerLaunches).toEqual([]);
      expect(extractCount).toBe(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });
});
