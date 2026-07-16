import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  LAUNCHER_AFTER_QUIT_FLAG,
  LAUNCHER_AFTER_QUIT_TARGET_PID_ARG,
  LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG,
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
} from "@open-design/launcher-proto";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_STATES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import type { ReleaseChannel } from "@open-design/release";

import {
  compareVersions,
  createDesktopUpdater,
  createDesktopUpdaterScheduler,
  DESKTOP_UPDATE_ENV,
  resolveDesktopUpdaterConfig,
} from "../../src/main/updater.js";
import { installerObservationSummaryPath } from "../../src/main/installer-observations.js";

type FixtureServer = {
  artifactRanges: () => string[];
  artifactRequests: () => number;
  close: () => Promise<void>;
  metadataRequests: () => number;
  metadataUrl: string;
};

type FixturePlatform = "mac" | "win";
type FixtureChannel = ReleaseChannel;

function prereleaseCounterParts(version: string): { baseVersion: string; number: number } | null {
  const prerelease = /^(\d+\.\d+\.\d+)-.+\.(\d+)$/.exec(version);
  if (prerelease?.[1] != null && prerelease[2] != null) {
    return { baseVersion: prerelease[1], number: Number(prerelease[2]) };
  }
  return null;
}

function channelMetadata(channel: FixtureChannel, version: string): Record<string, unknown> {
  if (channel === "stable") {
    return {
      baseVersion: version,
      releaseVersion: version,
      stableVersion: version,
    };
  }

  const countedVersion = prereleaseCounterParts(version);
  if (countedVersion == null) throw new Error(`fixture ${channel} version must be counted: ${version}`);
  if (channel === "beta") {
    return {
      baseVersion: countedVersion.baseVersion,
      betaNumber: countedVersion.number,
      betaVersion: version,
    };
  }
  if (channel === "prerelease") {
    return {
      baseVersion: countedVersion.baseVersion,
      prereleaseNumber: countedVersion.number,
      prereleaseVersion: version,
      releaseVersion: version,
      stableVersion: countedVersion.baseVersion,
    };
  }
  return {
    baseVersion: countedVersion.baseVersion,
    previewNumber: countedVersion.number,
    previewVersion: version,
    releaseVersion: version,
  };
}

async function createUpdaterFixture(options: {
  artifactBody?: string;
  channel?: FixtureChannel;
  controlLauncherVersionMin?: string;
  failArtifactAttempts?: number;
  failFirstArtifactWithTerminated?: boolean;
  includePayload?: boolean;
  launcherSchema?: number;
  platform?: FixturePlatform;
  payloadBody?: string;
  version?: string;
} = {}): Promise<FixtureServer> {
  const version = options.version ?? "1.0.1";
  const channel = options.channel ?? "stable";
  const platform = options.platform ?? "mac";
  const platformKey = platform === "win" ? "win" : "mac";
  const artifactKey = platform === "win" ? "installer" : "dmg";
  const artifactExt = platform === "win" ? "exe" : "dmg";
  const arch = platform === "win" ? "x64" : "arm64";
  const artifactName = platform === "win"
    ? `open-design-${version}-win-x64-setup.exe`
    : `open-design-${version}-mac-arm64.dmg`;
  const artifactPath = `/artifact.${artifactExt}`;
  const artifactBody = Buffer.from(options.artifactBody ?? "open design updater fixture");
  const digest = createHash("sha256").update(artifactBody).digest("hex");
  const payloadName = platform === "win"
    ? `open-design-${version}-win-x64-payload.7z`
    : `open-design-${version}-mac-arm64-payload.zip`;
  const payloadPath = platform === "win" ? "/payload.7z" : "/payload.zip";
  const payloadBody = Buffer.from(options.payloadBody ?? "open design updater payload fixture");
  const payloadDigest = createHash("sha256").update(payloadBody).digest("hex");
  const artifactRanges: string[] = [];
  let artifactRequests = 0;
  let metadataRequests = 0;
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/metadata.json") {
      metadataRequests += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        channel,
        ...channelMetadata(channel, version),
        ...(options.launcherSchema != null ? { launcher: { schema: options.launcherSchema } } : {}),
        ...(options.controlLauncherVersionMin != null
          ? { control: { launcher: { version: { min: options.controlLauncherVersionMin } } } }
          : {}),
        platforms: {
          [platformKey]: {
            arch,
            enabled: true,
            artifacts: {
              [artifactKey]: {
                name: artifactName,
                sha256Url: `http://${serverAddress(server)}${artifactPath}.sha256`,
                size: artifactBody.byteLength,
                url: `http://${serverAddress(server)}${artifactPath}`,
              },
              ...(options.includePayload === true
                ? {
                    payload: {
                      name: payloadName,
                      sha256Url: `http://${serverAddress(server)}${payloadPath}.sha256`,
                      size: payloadBody.byteLength,
                      url: `http://${serverAddress(server)}${payloadPath}`,
                    },
                  }
                : {}),
            },
          },
        },
        version: 1,
      }));
      return;
    }
    if (url === artifactPath) {
      artifactRequests += 1;
      const failArtifactAttempts = options.failArtifactAttempts ?? (options.failFirstArtifactWithTerminated === true ? 1 : 0);
      const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
      if (range != null) artifactRanges.push(range);
      const match = range == null ? null : /^bytes=(\d+)-$/.exec(range);
      const start = match?.[1] == null ? 0 : Number(match[1]);
      const ranged = range != null && Number.isInteger(start) && start >= 0 && start < artifactBody.byteLength;
      const body = ranged ? artifactBody.subarray(start) : artifactBody;
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("content-length", String(body.byteLength));
      if (ranged) {
        response.statusCode = 206;
        response.setHeader("content-range", `bytes ${start}-${artifactBody.byteLength - 1}/${artifactBody.byteLength}`);
      }
      if (artifactRequests <= failArtifactAttempts) {
        const failedChunkLength = Math.max(1, Math.floor(body.byteLength / 2));
        response.write(body.subarray(0, failedChunkLength));
        setTimeout(() => response.destroy(new Error("terminated")), 5);
        return;
      }
      response.end(body);
      return;
    }
    if (options.includePayload === true && url === payloadPath) {
      artifactRequests += 1;
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("content-length", String(payloadBody.byteLength));
      response.end(payloadBody);
      return;
    }
    if (url === `${artifactPath}.sha256`) {
      response.end(`${digest}  ${artifactName}\n`);
      return;
    }
    if (options.includePayload === true && url === `${payloadPath}.sha256`) {
      response.end(`${payloadDigest}  ${payloadName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = serverAddress(server);
  return {
    artifactRanges: () => artifactRanges,
    artifactRequests: () => artifactRequests,
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      });
    },
    metadataRequests: () => metadataRequests,
    metadataUrl: `http://${address}/metadata.json`,
  };
}

function serverAddress(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("fixture server is not listening on TCP");
  return `127.0.0.1:${address.port}`;
}

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "od-updater-test-"));
}

function updaterEnv(metadataUrl: string, platform = "darwin"): NodeJS.ProcessEnv {
  return {
    [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "1",
    [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0",
    [DESKTOP_UPDATE_ENV.ENABLED]: "1",
    [DESKTOP_UPDATE_ENV.METADATA_URL]: metadataUrl,
    [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "1",
    [DESKTOP_UPDATE_ENV.PLATFORM]: platform,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForRequestCount(requests: readonly unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (requests.length >= count) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
  }
  throw new Error(`expected ${count} update requests, saw ${requests.length}`);
}

function metadataResponse(version: string): Response {
  return new Response(JSON.stringify({
    baseVersion: version,
    channel: "stable",
    platforms: {
      mac: {
        arch: "arm64",
        enabled: true,
        artifacts: {
          dmg: {
            name: `open-design-${version}-mac-arm64.dmg`,
            sha256: "0".repeat(64),
            size: 1,
            url: `https://example.invalid/open-design-${version}-mac-arm64.dmg`,
          },
        },
      },
    },
    releaseVersion: version,
    stableVersion: version,
    version: 1,
  }));
}

async function writeReleaseFixture(root: string, key: string, channel: FixtureChannel, version: string): Promise<string> {
  const releaseDir = join(root, "releases", key);
  await mkdir(releaseDir, { recursive: true });
  await writeFile(join(releaseDir, "metadata.json"), `${JSON.stringify({
    channel,
    ...channelMetadata(channel, version),
    version: 1,
  }, null, 2)}\n`, "utf8");
  await writeFile(join(releaseDir, "artifact.bin"), version, "utf8");
  return releaseDir;
}

describe("desktop updater", () => {
  it("derives installer observation summary paths from safe flow ids only", () => {
    const root = makeRoot();
    try {
      expect(installerObservationSummaryPath(root, "flow-1")).toBe(join(root, "flow-1", "summary.json"));
      expect(() => installerObservationSummaryPath(root, "../escape")).toThrow(/flow_id/);
      expect(() => installerObservationSummaryPath(root, "..")).toThrow(/flow_id/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("adds session and source context to lifecycle logs", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: updaterEnv(fixture.metadataUrl),
          namespace: "release-beta",
          source: SIDECAR_SOURCES.PACKAGED,
        },
        {
          logger,
          now: () => new Date("2026-06-09T07:50:51.000Z"),
          processPid: 12345,
        },
      );

      await updater.checkForUpdates({ autoDownload: false });

      expect(logger.info).toHaveBeenCalledWith("[open-design updater] lifecycle", expect.objectContaining({
        enabled: true,
        event: "session-start",
        metadataUrl: fixture.metadataUrl,
        namespace: "release-beta",
        sessionId: "2026-06-09T07:50:51.000Z-12345",
        source: SIDECAR_SOURCES.PACKAGED,
      }));
      expect(logger.info).toHaveBeenCalledWith("[open-design updater] lifecycle", expect.objectContaining({
        event: "check-start",
        metadataUrl: fixture.metadataUrl,
        namespace: "release-beta",
        sessionId: "2026-06-09T07:50:51.000Z-12345",
        source: SIDECAR_SOURCES.PACKAGED,
      }));
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("downloads, verifies, persists, and dry-runs opening a mac package", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.STABLE);
      expect(checked.availableVersion).toBe("1.0.1");
      expect(checked.checksum?.algorithm).toBe("sha256");
      expect(checked.downloadPath).toEqual(expect.any(String));
      expect(checked.paths?.manifestPath).toBe(join(root, "metadata.json"));
      expect(checked.active?.path).toBe(checked.downloadPath);
      expect(relative(await realpath(root), checked.downloadPath ?? "")).not.toMatch(/^\.\./);
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design updater fixture");

      const restored = await updater.status();
      expect(restored.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(restored.downloadPath).toBe(checked.downloadPath);

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.installResult?.dryRun).toBe(true);
      expect(installed.installResult?.path).toBe(checked.downloadPath);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("downloads, verifies, persists, and dry-runs opening a Windows installer", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ platform: "win" });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl, "win32"),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.platform).toBe("win32");
      expect(checked.supported).toBe(true);
      expect(checked.capabilities.canOpenInstaller).toBe(true);
      expect(checked.artifact?.platformKey).toBe("win");
      expect(checked.artifact?.type).toBe("installer");
      expect(checked.downloadPath).toEqual(expect.stringMatching(/\.exe$/));
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design updater fixture");

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.installResult?.dryRun).toBe(true);
      expect(installed.installResult?.path).toBe(checked.downloadPath);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps using the Windows installer when payload metadata exists but launcher context is absent", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
    });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl, "win32"),
        source: SIDECAR_SOURCES.PACKAGED,
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("installer");
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design updater fixture");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("falls back to the installer when launcher context is valid but metadata has no payload artifact", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      platform: "win",
      version: "1.0.0-beta.3",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.2"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "0.9.0-beta.1"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.2" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.2" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.2",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot: root,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("installer");
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design windows installer fixture");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("downloads and applies launcher payload only when launcher runtime context validates", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.2",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const versionRoot = join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    const launches: Array<{ appPid: number; launchPath: string; root: string }> = [];
    let extractCount = 0;
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(versionRoot, "1.0.0-beta.1"), { recursive: true });
      await mkdir(join(versionRoot, "0.9.0-beta.1"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.1" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.1",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          extractCount += 1;
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.2",
            })}\n`,
          );
          await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
        },
        launchAppAfterQuit: async (input) => {
          launches.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return { helperLogPath: join(root, "updates", "helpers", "open-app-after-quit-test.log") };
        },
        processExecPath: "C:\\Program Files\\Open Design Beta\\Open Design Beta.exe",
        processPid: 4242,
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");
      expect(checked.artifact?.name).toBe("open-design-1.0.0-beta.2-win-x64-payload.7z");
      expect(checked.capabilities.canApplyInPlace).toBe(true);
      expect(checked.capabilities.canOpenInstaller).toBe(false);
      expect(checked.capabilities.requiresManualInstall).toBe(false);
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design windows payload fixture");
      expect(extractCount).toBe(1);
      expect(await readFile(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.2", "manifest.json"), "utf8")).toContain("1.0.0-beta.2");
      expect(JSON.parse(await readFile(launcherRuntimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.0.0-beta.1" },
        lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
      });

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(installed.installResult?.artifactPath).toBe(checked.downloadPath);
      expect(installed.installResult?.activeVersion).toBe("1.0.0-beta.2");
      expect(installed.installResult?.launchPath).toBe(launcherLaunchPath);
      expect(installed.installResult?.launcherRuntimePath).toBe(launcherRuntimePath);
      expect(installed.installResult?.helperLogPath).toEqual(expect.stringContaining("open-app-after-quit-test.log"));
      expect(installed.installResult?.dryRun).toBe(false);
      expect(extractCount).toBe(1);
      expect(launches).toEqual([
        {
          appPid: 4242,
          launchPath: launcherLaunchPath,
          root: await realpath(join(root, "updates")),
        },
      ]);
      const runtime = JSON.parse(await readFile(launcherRuntimePath, "utf8")) as {
        active?: { generation?: number; version?: string };
        lastSuccessful?: { generation?: number; version?: string };
      };
      expect(runtime.active).toEqual({ generation: 1, version: "1.0.0-beta.2" });
      expect(runtime.lastSuccessful).toEqual({ generation: 0, version: "1.0.0-beta.1" });
      expect(existsSync(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.1"))).toBe(true);
      expect(existsSync(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "0.9.0-beta.1"))).toBe(false);
      expect(existsSync(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "updates", "staging"))).toBe(false);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  // Stone 1 — installed-base escape hatch: a feed that declares a launcher-contract
  // schema this build cannot interpret, or a minimum launcher/build version newer
  // than this build, must route to the full installer instead of an in-place
  // payload update — even when a payload artifact exists and the launcher payload
  // context validates (which would otherwise apply in place).
  async function runLauncherReseedCheck(
    fixtureOptions: Parameters<typeof createUpdaterFixture>[0],
    currentVersion = "1.0.0-beta.1",
  ): Promise<{ close: () => Promise<void>; snapshot: Awaited<ReturnType<ReturnType<typeof createDesktopUpdater>["checkForUpdates"]>> }> {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      channel: "beta",
      includePayload: true,
      platform: "win",
      version: "1.0.0-beta.2",
      ...fixtureOptions,
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    await mkdir(join(root, "installed"), { recursive: true });
    await writeFile(launcherLaunchPath, "");
    await mkdir(join(root, "launcher"), { recursive: true });
    await writeFile(
      launcherRuntimePath,
      `${JSON.stringify({
        active: { generation: 0, version: "1.0.0-beta.1" },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
        namespace: "release-beta-win",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`,
    );
    const updater = createDesktopUpdater({
      arch: "x64",
      currentVersion,
      downloadRoot: join(root, "updates"),
      env: {
        ...updaterEnv(fixture.metadataUrl, "win32"),
        [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: currentVersion,
        [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
      },
      launcherRoot: root,
      launcherLaunchPath,
      launcherRuntimePath,
      namespace: "release-beta-win",
      source: SIDECAR_SOURCES.PACKAGED,
    }, {
      extractLauncherPayloadArchive: async ({ destinationRoot }) => {
        await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
        await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
        await writeFile(
          join(destinationRoot, "manifest.json"),
          `${JSON.stringify({
            channel: "beta",
            entry: { cwd: "payload", executable: "payload/Open Design.exe" },
            namespace: "release-beta-win",
            payloadRoot: "payload",
            platform: "win32",
            schemaVersion: LAUNCHER_SCHEMA_VERSION,
            version: "1.0.0-beta.2",
          })}\n`,
        );
        await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
      },
      launchAppAfterQuit: async () => ({ helperLogPath: join(root, "updates", "helpers", "test.log") }),
      processExecPath: "C:\\Program Files\\Open Design Beta\\Open Design Beta.exe",
      processPid: 4242,
    });
    const snapshot = await updater.checkForUpdates();
    return {
      snapshot,
      close: async () => {
        await fixture.close();
        rmSync(root, { force: true, recursive: true });
      },
    };
  }

  it("routes to the installer when the feed launcher.schema exceeds this build", async () => {
    const { snapshot, close } = await runLauncherReseedCheck({ launcherSchema: LAUNCHER_SCHEMA_VERSION + 1 });
    try {
      expect(snapshot.artifact?.type).toBe("installer");
      expect(snapshot.capabilities.canApplyInPlace).toBe(false);
      expect(snapshot.capabilities.requiresManualInstall).toBe(true);
    } finally {
      await close();
    }
  });

  it("routes to the installer when control.launcher.version.min exceeds this build", async () => {
    const { snapshot, close } = await runLauncherReseedCheck({ controlLauncherVersionMin: "9.9.9" });
    try {
      expect(snapshot.artifact?.type).toBe("installer");
      expect(snapshot.capabilities.canApplyInPlace).toBe(false);
      expect(snapshot.capabilities.requiresManualInstall).toBe(true);
    } finally {
      await close();
    }
  });

  it("still applies the payload in place when schema is supported and min-version is met", async () => {
    const { snapshot, close } = await runLauncherReseedCheck({
      launcherSchema: LAUNCHER_SCHEMA_VERSION,
      controlLauncherVersionMin: "0.9.0-beta.1",
    });
    try {
      expect(snapshot.artifact?.type).toBe("payload");
      expect(snapshot.capabilities.canApplyInPlace).toBe(true);
      expect(snapshot.capabilities.requiresManualInstall).toBe(false);
    } finally {
      await close();
    }
  });

  it("rejects launcher payloads that change before activation", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.2",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const versionRoot = join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    const launches: Array<{ appPid: number; launchPath: string; root: string }> = [];
    let extractCount = 0;
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(versionRoot, "1.0.0-beta.1"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.1" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.1",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          extractCount += 1;
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.2",
            })}\n`,
          );
          await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
        },
        launchAppAfterQuit: async (input) => {
          launches.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return { helperLogPath: join(root, "updates", "helpers", "open-app-after-quit-test.log") };
        },
        processExecPath: "C:\\Program Files\\Open Design Beta\\Open Design Beta.exe",
        processPid: 4242,
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");
      expect(extractCount).toBe(1);
      await writeFile(checked.downloadPath ?? "", "tampered payload bytes", "utf8");

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(installed.error?.code).toBe("checksum-mismatch");
      expect(installed.installResult).toBeUndefined();
      expect(launches).toEqual([]);
      expect(JSON.parse(await readFile(launcherRuntimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.0.0-beta.1" },
        lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
      });
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects launcher payloads that cannot resolve packaged config before activating them", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      channel: "beta",
      includePayload: true,
      payloadBody: "open design payload without packaged config",
      platform: "win",
      version: "1.0.0-beta.2",
    });
    const namespaceRoot = join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win");
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(namespaceRoot, "versions", "1.0.0-beta.1"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.1" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.1",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
        },
        launcherRoot: root,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload", "resources"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.2",
            })}\n`,
          );
        },
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("launcher-payload-prepare-failed");
      expect(checked.error?.message).toContain("open-design-config.json");
      expect(existsSync(join(namespaceRoot, "versions", "1.0.0-beta.2"))).toBe(false);
      expect(JSON.parse(await readFile(launcherRuntimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.0.0-beta.1" },
        lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
      });
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps using the installer when launcher context has a missing installed launch path", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.2",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherLaunchPath = join(root, "missing", "Open Design Beta.exe");
    try {
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.1"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.1" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.1",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
        },
        launcherLaunchPath,
        launcherRoot: root,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        processExecPath: "C:\\Users\\runneradmin\\AppData\\Roaming\\Open Design Beta\\launcher\\channels\\beta\\namespaces\\release-beta-win\\versions\\1.0.0-beta.1\\payload\\Open Design.exe",
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.artifact?.type).toBe("installer");
      expect(await readFile(checked.downloadPath ?? "", "utf8")).toBe("open design windows installer fixture");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("relaunches mac launcher payloads through the installed app bundle from a payload-backed process", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design mac dmg fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design mac payload fixture",
      platform: "mac",
      version: "1.0.0-beta.3",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.app");
    const launches: Array<{ appPid: number; launchPath: string; root: string }> = [];
    try {
      await mkdir(launcherLaunchPath, { recursive: true });
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta", "versions", "1.0.0-beta.2"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.2" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.2" },
          namespace: "release-beta",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "arm64",
        currentVersion: "1.0.0-beta.2",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "darwin"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "MacOS"), { recursive: true });
          await mkdir(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "Resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta"), "");
          await writeFile(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "Resources", "open-design-config.json"), "{}\n");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload/Open Design Beta.app",
                executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
              },
              namespace: "release-beta",
              payloadRoot: "payload",
              platform: "darwin",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.3",
            })}\n`,
          );
        },
        launchAppAfterQuit: async (input) => {
          launches.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return {};
        },
        processExecPath: join(root, "launcher", "channels", "beta", "namespaces", "release-beta", "versions", "1.0.0-beta.2", "payload", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta"),
        processPid: 4243,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.artifact?.type).toBe("payload");
      expect(checked.capabilities.canApplyInPlace).toBe(true);
      expect(checked.capabilities.canOpenInstaller).toBe(false);
      expect(checked.capabilities.requiresManualInstall).toBe(false);

      const installed = await updater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(installed.installResult?.dryRun).toBe(false);
      expect(launches).toEqual([
        {
          appPid: 4243,
          launchPath: launcherLaunchPath,
          root: await realpath(join(root, "updates")),
        },
      ]);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("relaunches Windows launcher payloads through the installed executable from a payload-backed process", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.3",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const launcherLaunchPath = join(root, "installed", "Open Design.exe");
    const launches: Array<{ appPid: number; launchPath: string; root: string }> = [];
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.2"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.2" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.2" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.2",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.3",
            })}\n`,
          );
        },
        launchAppAfterQuit: async (input) => {
          launches.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return {};
        },
        processExecPath: "C:\\Users\\runneradmin\\AppData\\Roaming\\Open Design Beta\\launcher\\channels\\beta\\namespaces\\release-beta-win\\versions\\1.0.0-beta.2\\payload\\Open Design.exe",
        processPid: 4244,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.artifact?.type).toBe("payload");
      expect(checked.capabilities.canApplyInPlace).toBe(true);
      expect(checked.capabilities.canOpenInstaller).toBe(false);
      expect(checked.capabilities.requiresManualInstall).toBe(false);

      const installed = await updater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(installed.installResult?.dryRun).toBe(false);
      expect(launches).toEqual([
        {
          appPid: 4244,
          launchPath: launcherLaunchPath,
          root: await realpath(join(root, "updates")),
        },
      ]);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails launcher payload relaunch when the stable launcher entry is unavailable", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.3",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const launcherLaunchPath = join(root, "installed", "Open Design.exe");
    const launches: Array<{ appPid: number; launchPath: string; root: string }> = [];
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.2"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.2" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.2" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.2",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.3",
            })}\n`,
          );
        },
        launchAppAfterQuit: async (input) => {
          launches.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return {};
        },
        processPid: 4246,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.artifact?.type).toBe("payload");
      await rm(launcherLaunchPath, { force: true });

      const installed = await updater.installUpdate();

      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(installed.error?.code).toBe("payload-relaunch-failed");
      expect(installed.error?.message).toContain("Open Design.exe");
      expect(launches).toEqual([]);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("starts the stable Windows launcher in after-quit mode for payload installs", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design windows installer fixture",
      channel: "beta",
      includePayload: true,
      payloadBody: "open design windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.3",
    });
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const launcherRoot = root;
    const launcherLaunchPath = join(root, "installed", "Open Design.exe");
    const spawned: Array<{ args: string[]; command: string; options: unknown }> = [];
    const unref = vi.fn();
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win", "versions", "1.0.0-beta.2"), { recursive: true });
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.2" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.2" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.2",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
          [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
        },
        launcherRoot,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload", "resources", "open-design"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(join(destinationRoot, "payload", "resources", "open-design-config.json"), "{}\n");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: {
                cwd: "payload",
                executable: "payload/Open Design.exe",
              },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.3",
            })}\n`,
          );
        },
        processPid: 4245,
        spawnDetached: (command, args, options) => {
          spawned.push({ args, command, options });
          return { unref };
        },
      });

      const checked = await updater.checkForUpdates();
      const installed = await updater.installUpdate();

      expect(installed.error).toBeUndefined();
      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(installed.installResult?.launchPath).toBe(launcherLaunchPath);
      expect(installed.installResult?.helperLogPath).toBeUndefined();
      expect(spawned).toHaveLength(1);
      expect(unref).toHaveBeenCalledTimes(1);
      expect(spawned[0]?.command).toBe(launcherLaunchPath);
      expect(spawned[0]?.options).toEqual({ detached: true, stdio: "ignore", windowsHide: true });
      const args = spawned[0]?.args ?? [];
      expect(args).toEqual(expect.arrayContaining([
        LAUNCHER_AFTER_QUIT_FLAG,
        LAUNCHER_AFTER_QUIT_TARGET_PID_ARG,
        "4245",
        LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG,
        "600000",
      ]));
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("cleans failed launcher payload staging without deleting an existing version root", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      channel: "beta",
      includePayload: true,
      payloadBody: "open design bad windows payload fixture",
      platform: "win",
      version: "1.0.0-beta.2",
    });
    const namespaceRoot = join(root, "launcher", "channels", "beta", "namespaces", "release-beta-win");
    const launcherRuntimePath = join(root, "launcher", "runtime.json");
    const existingVersionRoot = join(namespaceRoot, "versions", "1.0.0-beta.2");
    const launcherLaunchPath = join(root, "installed", "Open Design Beta.exe");
    try {
      await mkdir(join(root, "installed"), { recursive: true });
      await writeFile(launcherLaunchPath, "");
      await mkdir(join(root, "launcher"), { recursive: true });
      await mkdir(existingVersionRoot, { recursive: true });
      await writeFile(join(existingVersionRoot, "keep.txt"), "existing");
      await writeFile(
        launcherRuntimePath,
        `${JSON.stringify({
          active: { generation: 0, version: "1.0.0-beta.1" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
          namespace: "release-beta-win",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      const updater = createDesktopUpdater({
        arch: "x64",
        currentVersion: "1.0.0-beta.1",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.1",
        },
        launcherRoot: root,
        launcherLaunchPath,
        launcherRuntimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        extractLauncherPayloadArchive: async ({ destinationRoot }) => {
          await mkdir(join(destinationRoot, "payload"), { recursive: true });
          await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
          await writeFile(
            join(destinationRoot, "manifest.json"),
            `${JSON.stringify({
              channel: "beta",
              entry: { cwd: "payload", executable: "payload/Open Design.exe" },
              namespace: "release-beta-win",
              payloadRoot: "payload",
              platform: "win32",
              schemaVersion: LAUNCHER_SCHEMA_VERSION,
              version: "1.0.0-beta.999",
            })}\n`,
          );
        },
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("launcher-payload-prepare-failed");
      expect(await readFile(join(existingVersionRoot, "keep.txt"), "utf8")).toBe("existing");
      const stagingEntries = await readdir(join(namespaceRoot, "updates", "staging")).catch(() => []);
      expect(stagingEntries).toEqual([]);
      expect(JSON.parse(await readFile(launcherRuntimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.0.0-beta.1" },
        lastSuccessful: { generation: 0, version: "1.0.0-beta.1" },
      });
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("resumes an interrupted artifact download before surfacing an error", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design updater fixture with retry",
      failFirstArtifactWithTerminated: true,
      platform: "win",
    });
    const logger = { error: vi.fn(), warn: vi.fn() };
    try {
      const updater = createDesktopUpdater(
        {
          arch: "x64",
          downloadRoot: root,
          env: updaterEnv(fixture.metadataUrl, "win32"),
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { logger },
      );

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.error).toBeUndefined();
      expect(fixture.artifactRequests()).toBe(2);
      expect(fixture.artifactRanges()).toEqual([expect.stringMatching(/^bytes=\d+-$/)]);
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not expose raw terminated transport errors when update download retries are exhausted", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({
      artifactBody: "open design updater fixture that keeps failing",
      failArtifactAttempts: 3,
      platform: "win",
    });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl, "win32"),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("download-failed");
      expect(checked.error?.message).toBe("The network connection ended while downloading the update. Please try again.");
      expect(checked.error?.message).not.toMatch(/terminated/i);
      expect(fixture.artifactRequests()).toBe(3);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("writes a pending installer observation before arming a mac deferred installer launch", async () => {
    const root = makeRoot();
    const observationRoot = join(root, "observations", "installer");
    const fixture = await createUpdaterFixture();
    const launches: Array<{ appPid: number; installerPath: string; root: string; timeoutMs: number }> = [];
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: join(root, "updates"),
          env: {
            ...updaterEnv(fixture.metadataUrl),
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          installerObservationRoot: observationRoot,
          namespace: "release",
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { launchInstallerAfterQuit: async (input) => {
          launches.push(input);
          return "";
        } },
      );

      const checked = await updater.checkForUpdates();
      const installed = await updater.installUpdate();
      const flowIds = await readdir(observationRoot);
      const summary = JSON.parse(await readFile(join(observationRoot, flowIds[0] ?? "", "summary.json"), "utf8")) as Record<string, unknown>;
      const updateRoot = await realpath(join(root, "updates"));

      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(launches).toEqual([{
        appPid: process.pid,
        installerPath: checked.downloadPath,
        root: updateRoot,
        timeoutMs: 10 * 60 * 1000,
      }]);
      expect(flowIds).toHaveLength(1);
      expect(summary).toMatchObject({
        arch: "arm64",
        artifactType: "dmg",
        channel: "stable",
        fromVersion: "1.0.0",
        kind: "installer_apply_observation",
        namespace: "release",
        platform: "darwin",
        reason: "installer_open_requested",
        result: "pending",
        schemaVersion: 1,
        toVersion: "1.0.1",
      });
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reuses the same install result for repeated installer open requests", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    const launches: Array<{ appPid: number; installerPath: string; root: string; timeoutMs: number }> = [];
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: {
            ...updaterEnv(fixture.metadataUrl),
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { launchInstallerAfterQuit: async (input) => {
          launches.push(input);
          return "";
        } },
      );

      const checked = await updater.checkForUpdates();
      const first = await updater.installUpdate();
      const second = await updater.installUpdate();

      expect(first.installResult?.path).toBe(checked.downloadPath);
      expect(second.installResult).toEqual(first.installResult);
      expect(launches).toHaveLength(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("writes and detaches the mac helper script that opens the installer after quit", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    const spawned: Array<{ args: string[]; command: string }> = [];
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: {
            ...updaterEnv(fixture.metadataUrl),
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        {
          processPid: 4242,
          spawnDetached: (command, args) => {
            spawned.push({ args, command });
            return { unref: vi.fn() };
          },
        },
      );

      const checked = await updater.checkForUpdates();
      const installed = await updater.installUpdate();

      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(spawned).toHaveLength(1);
      expect(spawned[0]?.command).toBe("/bin/sh");
      const [scriptPath, pidArg, installerArg, timeoutArg] = spawned[0]?.args ?? [];
      expect(scriptPath).toEqual(expect.stringContaining(join(root, "helpers", "open-installer-after-quit-")));
      expect(pidArg).toBe("4242");
      expect(installerArg).toBe(checked.downloadPath);
      expect(timeoutArg).toBe("600");
      const script = await readFile(scriptPath ?? "", "utf8");
      expect(script).toContain('while kill -0 "$target_pid"');
      expect(script).toContain('open "$installer_path"');
      expect(script).toContain('rm -f "$0"');
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("writes and starts the Windows helper script that opens the installer after quit", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ platform: "win" });
    const openPath = vi.fn(async () => "openPath should not run for Windows deferred installer launch");
    const unref = vi.fn();
    const spawned: Array<{ args: string[]; command: string; options: unknown }> = [];
    try {
      const updater = createDesktopUpdater(
        {
          arch: "x64",
          downloadRoot: root,
          env: {
            ...updaterEnv(fixture.metadataUrl, "win32"),
            [DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        {
          openPath,
          processPid: 4242,
          spawnDetached: (command, args, options) => {
            spawned.push({ args, command, options });
            return { unref };
          },
        },
      );

      const checked = await updater.checkForUpdates();
      const installed = await updater.installUpdate();

      expect(installed.installResult?.path).toBe(checked.downloadPath);
      expect(openPath).not.toHaveBeenCalled();
      expect(spawned).toHaveLength(1);
      expect(unref).toHaveBeenCalledTimes(1);
      expect(spawned[0]?.command).toEqual(expect.stringContaining(join("System32", "WindowsPowerShell", "v1.0", "powershell.exe")));
      expect(spawned[0]?.options).toEqual({ detached: true, stdio: "ignore", windowsHide: true });
      const args = spawned[0]?.args ?? [];
      const launcherPath = args.at(args.indexOf("-File") + 1);
      const scriptPath = args.at(args.indexOf("-HelperPath") + 1);
      const logPath = args.at(args.indexOf("-LogPath") + 1);
      expect(args).toEqual(expect.arrayContaining([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-PowerShellPath",
        spawned[0]?.command,
        "-HelperPath",
        "-TargetPid",
        "4242",
        "-InstallerPath",
        checked.downloadPath,
        "-TimeoutMs",
        "600000",
      ]));
      expect(launcherPath).toEqual(expect.stringMatching(/open-installer-after-quit-.+\.launcher\.ps1$/));
      expect(launcherPath).toEqual(expect.stringContaining(join(root, "helpers", "open-installer-after-quit-")));
      expect(scriptPath).toEqual(expect.stringMatching(/open-installer-after-quit-.+\.ps1$/));
      expect(scriptPath).toEqual(expect.stringContaining(join(root, "helpers", "open-installer-after-quit-")));
      expect(logPath).toEqual(expect.stringMatching(/open-installer-after-quit-.+\.log$/));
      const launcher = await readFile(launcherPath ?? "", "utf8");
      expect(launcher).toContain("Start-Process -FilePath $PowerShellPath -WindowStyle Hidden");
      expect(launcher).toContain("Quote-WindowsPowerShellArgument $InstallerPath");
      expect(launcher).toContain("Remove-Item -LiteralPath $PSCommandPath");
      const script = await readFile(scriptPath ?? "", "utf8");
      expect(script).toContain("Get-Process -Id $TargetPid");
      expect(script).toContain("Start-Sleep -Milliseconds 1500");
      expect(script).toContain("Start-Process -FilePath $InstallerPath");
      expect(script).toContain("Remove-Item -LiteralPath $PSCommandPath");

      const restarted = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl, "win32"),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const restored = await restarted.status();
      expect(restored.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(restored.error).toBeUndefined();
      expect(restored.installResult?.path).toBe(checked.downloadPath);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reuses an already verified matching download during auto-check", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const first = await updater.checkForUpdates();
      expect(first.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(first.downloadPath).toEqual(expect.any(String));
      expect(fixture.artifactRequests()).toBe(1);

      const second = await updater.checkForUpdates();
      expect(second.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(second.downloadPath).toBe(first.downloadPath);
      expect(second.availableVersion).toBe(first.availableVersion);
      expect(fixture.artifactRequests()).toBe(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("adopts a verified release directory when active metadata is missing", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const first = await updater.checkForUpdates();
      expect(first.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(first.downloadPath).toEqual(expect.any(String));
      expect(fixture.artifactRequests()).toBe(1);

      await writeFile(join(root, "metadata.json"), JSON.stringify({
        lastCheckedAt: first.lastCheckedAt,
        version: 1,
      }), "utf8");

      const restarted = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const restored = await restarted.checkForUpdates();
      const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as Record<string, unknown>;

      expect(restored.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(restored.downloadPath).toBe(first.downloadPath);
      expect(restored.active?.path).toBe(first.downloadPath);
      expect(metadata.active).toEqual(expect.any(Object));
      expect(fixture.artifactRequests()).toBe(1);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports old flat updater stores as protocol errors without repairing them", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      await writeFile(join(root, ".open-design-updater-root.json"), JSON.stringify({
        owner: "open-design-updater",
        version: 1,
      }));
      await writeFile(join(root, "state.json"), "{}");
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.status();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("update-store-invalid-shape");
      expect(existsSync(join(root, "state.json"))).toBe(true);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports not-available when metadata is not newer than the current app", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ version: "1.0.0" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.NOT_AVAILABLE);
      expect(checked.downloadPath).toBeUndefined();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("accepts beta metadata that exposes betaVersion instead of releaseVersion", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", version: "1.0.1-beta.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-beta.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(checked.availableVersion).toBe("1.0.1-beta.2");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects beta metadata when the configured updater channel is stable", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", version: "1.0.1-beta.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.STABLE);
      expect(checked.error?.code).toBe("metadata-channel-mismatch");
      expect(checked.downloadPath).toBeUndefined();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects stable metadata when the configured updater channel is beta", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "stable", version: "1.0.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-beta.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(checked.error?.code).toBe("metadata-channel-mismatch");
      expect(checked.downloadPath).toBeUndefined();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("treats a larger counted beta internal prerelease as an update", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", version: "1.0.1-beta-internal.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-beta-internal.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(checked.availableVersion).toBe("1.0.1-beta-internal.2");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("accepts prerelease metadata that exposes prereleaseVersion", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "prerelease", version: "1.0.1-prerelease.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-prerelease.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.PRERELEASE);
      expect(checked.availableVersion).toBe("1.0.1-prerelease.2");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("accepts preview metadata that exposes previewVersion", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "preview", version: "1.0.1-preview.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-preview.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.PREVIEW);
      expect(checked.availableVersion).toBe("1.0.1-preview.2");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("re-verifies a downloaded package before opening it", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      await writeFile(checked.downloadPath ?? "", "tampered", "utf8");

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(installed.error?.code).toBe("checksum-mismatch");
      expect(installed.installResult).toBeUndefined();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("serializes more than one queued update operation", async () => {
    const root = makeRoot();
    const requests: Array<{ resolve: (response: Response) => void }> = [];
    const fetchImpl: typeof globalThis.fetch = async () => {
      const request = deferred<Response>();
      requests.push(request);
      return await request.promise;
    };
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: {
            ...updaterEnv("https://example.invalid/metadata.json"),
            [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { fetch: fetchImpl },
      );

      const first = updater.checkForUpdates({ autoDownload: false });
      const second = updater.checkForUpdates({ autoDownload: false });
      const third = updater.checkForUpdates({ autoDownload: false });

      await waitForRequestCount(requests, 1);
      expect(requests).toHaveLength(1);

      requests[0]?.resolve(metadataResponse("1.0.1"));
      await expect(first).resolves.toMatchObject({
        availableVersion: "1.0.1",
        state: DESKTOP_UPDATE_STATES.AVAILABLE,
      });
      await waitForRequestCount(requests, 2);
      await new Promise<void>((resolveWait) => setImmediate(resolveWait));
      expect(requests).toHaveLength(2);

      requests[1]?.resolve(metadataResponse("1.0.2"));
      await expect(second).resolves.toMatchObject({
        availableVersion: "1.0.2",
        state: DESKTOP_UPDATE_STATES.AVAILABLE,
      });
      await waitForRequestCount(requests, 3);

      requests[2]?.resolve(metadataResponse("1.0.3"));
      await expect(third).resolves.toMatchObject({
        availableVersion: "1.0.3",
        state: DESKTOP_UPDATE_STATES.AVAILABLE,
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("starts and stops scheduled polling idempotently", async () => {
    const root = makeRoot();
    const fetchImpl = vi.fn(async () => metadataResponse("1.0.1"));
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: {
            ...updaterEnv("https://example.invalid/metadata.json"),
            [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { fetch: fetchImpl },
      );
      await updater.checkForUpdates({ autoDownload: false });
      fetchImpl.mockClear();
      vi.useFakeTimers();
      const scheduler = createDesktopUpdaterScheduler(updater, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
      });

      scheduler.start();
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      scheduler.stop("test");
      scheduler.stop("test");
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(false);
    } finally {
      vi.useRealTimers();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("silently applies a ready launcher payload during the startup poll when enabled", async () => {
    vi.useFakeTimers();
    const requestQuit = vi.fn();
    const readSilentPreference = vi.fn(async () => true);
    const payloadStatus = {
      arch: "arm64",
      artifact: {
        name: "open-design-1.0.1-mac-arm64-payload.zip",
        platformKey: "mac",
        size: 1024,
        type: "payload",
        url: "https://example.invalid/payload.zip",
      },
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      channel: DESKTOP_UPDATE_CHANNELS.BETA,
      currentVersion: "1.0.0",
      downloadPath: "/tmp/open-design-updates/payload.zip",
      enabled: true,
      mode: "package-launcher" as const,
      platform: "darwin",
      state: DESKTOP_UPDATE_STATES.DOWNLOADED,
      supported: true,
    };
    const installedStatus = {
      ...payloadStatus,
      installResult: {
        activeVersion: "1.0.1",
        dryRun: false,
        openedAt: "2026-05-19T00:00:00.000Z",
        path: "/tmp/open-design-updates/payload.zip",
      },
    };
    const updater = {
      checkForUpdates: vi.fn(async () => payloadStatus),
      config: {},
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(async () => installedStatus),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({ ...payloadStatus, installResult: undefined })),
      status: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
        startupSilentPayloadUpdate: {
          isEnabled: readSilentPreference,
          requestQuit,
        },
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);

      expect(readSilentPreference).toHaveBeenCalledTimes(1);
      expect(updater.installUpdate).toHaveBeenCalledTimes(1);
      expect(requestQuit).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not silently apply payload updates from periodic polls after startup", async () => {
    vi.useFakeTimers();
    const requestQuit = vi.fn();
    const readSilentPreference = vi.fn(async () => true);
    const baseStatus = {
      arch: "arm64",
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      channel: DESKTOP_UPDATE_CHANNELS.BETA,
      currentVersion: "1.0.0",
      enabled: true,
      mode: "package-launcher" as const,
      platform: "darwin",
      state: DESKTOP_UPDATE_STATES.NOT_AVAILABLE,
      supported: true,
    };
    const payloadStatus = {
      ...baseStatus,
      artifact: {
        name: "open-design-1.0.1-mac-arm64-payload.zip",
        platformKey: "mac",
        size: 1024,
        type: "payload",
        url: "https://example.invalid/payload.zip",
      },
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      downloadPath: "/tmp/open-design-updates/payload.zip",
      state: DESKTOP_UPDATE_STATES.DOWNLOADED,
    };
    const updater = {
      checkForUpdates: vi.fn()
        .mockResolvedValueOnce(baseStatus)
        .mockResolvedValue(payloadStatus),
      config: {},
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({ ...baseStatus, installResult: undefined })),
      status: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
        startupSilentPayloadUpdate: {
          isEnabled: readSilentPreference,
          requestQuit,
        },
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(100);

      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      expect(readSilentPreference).not.toHaveBeenCalled();
      expect(updater.installUpdate).not.toHaveBeenCalled();
      expect(requestQuit).not.toHaveBeenCalled();
      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-enter polling while a scheduled check is still running", async () => {
    const root = makeRoot();
    const requests: Array<{ resolve: (response: Response) => void }> = [];
    let blockScheduledFetch = false;
    const fetchImpl: typeof globalThis.fetch = async () => {
      if (!blockScheduledFetch) return metadataResponse("1.0.1");
      const request = deferred<Response>();
      requests.push(request);
      return await request.promise;
    };
    try {
      const updater = createDesktopUpdater(
        {
          arch: "arm64",
          downloadRoot: root,
          env: {
            ...updaterEnv("https://example.invalid/metadata.json"),
            [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "0",
          },
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        { fetch: fetchImpl },
      );
      await updater.checkForUpdates({ autoDownload: false });
      blockScheduledFetch = true;
      vi.useFakeTimers();
      const scheduler = createDesktopUpdaterScheduler(updater, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(requests).toHaveLength(1);
      requests[0]?.resolve(metadataResponse("1.0.1"));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("floors non-positive scheduled delays instead of spinning a zero-ms loop", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        arch: "arm64",
        capabilities: {
          canApplyInPlace: false,
          canDownload: true,
          canOpenInstaller: true,
          requiresManualInstall: true,
        },
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        currentVersion: "1.0.0",
        enabled: true,
        mode: "package-launcher" as const,
        platform: "darwin",
        state: DESKTOP_UPDATE_STATES.NOT_AVAILABLE,
        supported: true,
      })),
      config: {
        arch: "arm64",
        autoCheck: true,
        autoDownload: true,
        autoOpen: false,
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        checkBackoffInitialMs: 60_000,
        checkBackoffMaxMs: 300_000,
        checkInitialDelayMs: 5_000,
        checkIntervalMs: 15 * 60 * 1000,
        currentVersion: "1.0.0",
        downloadRoot: "/tmp/open-design-updates",
        enabled: true,
        metadataUrl: "https://example.invalid/metadata.json",
        mode: "package-launcher" as const,
        platform: "darwin",
      },
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({
        arch: "arm64",
        capabilities: {
          canApplyInPlace: false,
          canDownload: true,
          canOpenInstaller: true,
          requiresManualInstall: true,
        },
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        currentVersion: "1.0.0",
        enabled: true,
        mode: "package-launcher" as const,
        platform: "darwin",
        state: DESKTOP_UPDATE_STATES.IDLE,
        supported: true,
      })),
      status: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };

    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 0,
        backoffMaxMs: 1000,
        initialDelayMs: 0,
        intervalMs: 0,
        logger: { warn } as any,
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(999);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);

      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops scheduled polling after the installer has been opened", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const scheduler = createDesktopUpdaterScheduler(updater, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
      });

      await updater.checkForUpdates();
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      await updater.installUpdate();
      expect(scheduler.isRunning()).toBe(false);
      const requestsBeforeFrozenCheck = fixture.artifactRequests();
      await updater.checkForUpdates();
      expect(fixture.artifactRequests()).toBe(requestsBeforeFrozenCheck);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("restores installer-open freeze before polling on cold start", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const downloaded = await updater.checkForUpdates();
      const installed = await updater.installUpdate();
      expect(installed.installResult?.path).toBe(downloaded.downloadPath);
      const metadataRequestsBeforeRestart = fixture.metadataRequests();

      const restarted = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const checked = await restarted.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.installResult?.path).toBe(downloaded.downloadPath);
      expect(fixture.metadataRequests()).toBe(metadataRequestsBeforeRestart);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("clears installer-open freeze once the restarted app matches the downloaded update", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const downloaded = await updater.checkForUpdates();
      const installed = await updater.installUpdate();
      expect(installed.installResult?.path).toBe(downloaded.downloadPath);

      const restarted = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const restored = await restarted.status();

      expect(restored.state).toBe(DESKTOP_UPDATE_STATES.IDLE);
      expect(restored.installResult).toBeUndefined();
      expect(restored.downloadPath).toBeUndefined();

      const store = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as Record<string, unknown>;
      expect(store.active).toBeUndefined();
      expect(store.installFrozen).toBeUndefined();
      expect(store.installResult).toBeUndefined();

      const checked = await restarted.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.NOT_AVAILABLE);
      expect(checked.installResult).toBeUndefined();
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("clears interrupted incoming downloads on cold start instead of surfacing a store error", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ platform: "win" });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "0",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      const cycleId = "interrupted-cycle";
      const stagingDir = join(root, "staging", cycleId);
      await mkdir(stagingDir, { recursive: true });
      await writeFile(join(stagingDir, "partial.exe"), "partial", "utf8");
      await writeFile(join(root, "metadata.json"), JSON.stringify({
        incoming: {
          arch: "x64",
          artifact: {
            name: "open-design-1.0.1-win-x64-setup.exe",
            platformKey: "win",
            type: "installer",
            url: "https://fixture.test/open-design-1.0.1-win-x64-setup.exe",
          },
          channel: "stable",
          cycleId,
          metadata: {},
          platformKey: "win",
          startedAt: "2026-05-21T00:00:00.000Z",
          version: "1.0.1",
        },
        version: 1,
      }), "utf8");

      const restarted = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]: "0",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const status = await restarted.status();
      const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as Record<string, unknown>;

      expect(status.state).toBe(DESKTOP_UPDATE_STATES.IDLE);
      expect(status.error).toBeUndefined();
      expect(metadata.incoming).toBeUndefined();
      expect(existsSync(stagingDir)).toBe(false);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("marks releases older than the current version deprecated when the next version is ready", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", platform: "win", version: "1.0.0-beta.3" });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      await writeReleaseFixture(root, "1.0.0-beta.0-win-x64-old0", "beta", "1.0.0-beta.0");
      await writeReleaseFixture(root, "1.0.0-beta.1-win-x64-old1", "beta", "1.0.0-beta.1");
      await writeReleaseFixture(root, "1.0.0-beta.2-win-x64-current", "beta", "1.0.0-beta.2");

      const checked = await updater.checkForUpdates();
      const cleanup = JSON.parse(await readFile(join(root, "state", "cleanup.json"), "utf8")) as {
        releases: Array<{ deprecatedAt?: string; key: string; state: string; version?: string }>;
      };

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.cache?.lifecycle?.lastTrigger).toBe("next-version-ready");
      expect(checked.cache?.lifecycle?.releases.cleanupRemoved).toBe(2);
      expect(checked.cache?.lifecycle?.releases.retained).toBe(2);
      expect(cleanup.releases.filter((entry) => entry.state === "cleanup-removed").map((entry) => entry.version).sort()).toEqual([
        "1.0.0-beta.0",
        "1.0.0-beta.1",
      ]);
      expect(cleanup.releases.filter((entry) => entry.state === "retained").map((entry) => entry.version).sort()).toEqual([
        "1.0.0-beta.2",
        "1.0.0-beta.3",
      ]);
      expect(existsSync(join(root, "releases", "1.0.0-beta.0-win-x64-old0"))).toBe(false);
      expect(existsSync(join(root, "releases", "1.0.0-beta.1-win-x64-old1"))).toBe(false);
      expect(existsSync(join(root, "releases", "1.0.0-beta.2-win-x64-current"))).toBe(true);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("records missing release metadata as unknown without blocking next-version-ready", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", platform: "win", version: "1.0.0-beta.3" });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      await mkdir(join(root, "releases", "missing-metadata-release"), { recursive: true });

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.cache?.lifecycle?.releases.unknown).toBe(1);
      expect(checked.cache?.lifecycle?.releases.errors).toBe(1);
      expect(existsSync(join(root, "releases", "missing-metadata-release"))).toBe(true);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("cleans deprecated release directories on cold start from the lifecycle descriptor", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", platform: "win", version: "1.0.0-beta.3" });
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      await writeReleaseFixture(root, "1.0.0-beta.0-win-x64-old0", "beta", "1.0.0-beta.0");
      await mkdir(join(root, "state"), { recursive: true });
      await writeFile(join(root, "state", "cleanup.json"), `${JSON.stringify({
        currentVersion: "1.0.0-beta.2",
        platform: "win32",
        releases: [
          {
            currentVersion: "1.0.0-beta.2",
            deprecatedAt: "2026-06-08T00:00:00.000Z",
            key: "1.0.0-beta.0-win-x64-old0",
            metadataPath: "releases/1.0.0-beta.0-win-x64-old0/metadata.json",
            path: "releases/1.0.0-beta.0-win-x64-old0",
            reason: "older-than-current-version",
            state: "deprecated",
            updatedAt: "2026-06-08T00:00:00.000Z",
            version: "1.0.0-beta.0",
          },
        ],
        trigger: "next-version-ready",
        updatedAt: "2026-06-08T00:00:00.000Z",
        version: 1,
      }, null, 2)}\n`, "utf8");

      const restarted = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      const status = await restarted.status();
      const cleanup = JSON.parse(await readFile(join(root, "state", "cleanup.json"), "utf8")) as {
        releases: Array<{ deprecatedAt?: string; state: string }>;
      };

      expect(status.cache?.lifecycle?.lastTrigger).toBe("cold-start");
      expect(status.cache?.lifecycle?.releases.cleanupRemoved).toBe(1);
      expect(cleanup.releases[0]?.state).toBe("cleanup-removed");
      expect(cleanup.releases[0]?.deprecatedAt).toBe("2026-06-08T00:00:00.000Z");
      expect(existsSync(join(root, "releases", "1.0.0-beta.0-win-x64-old0"))).toBe(false);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("cleans deprecated launcher payload versions on cold start from the launcher cleanup descriptor", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", platform: "win", version: "1.0.0-beta.3" });
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    try {
      const launcherPaths = resolveLauncherPaths({
        channel: "beta",
        namespace: "release-beta-win",
        root,
      });
      await mkdir(join(launcherPaths.versionsRoot, "1.0.0-beta.2"), { recursive: true });
      await writeFile(join(launcherPaths.versionsRoot, "1.0.0-beta.2", "manifest.json"), "{}\n", "utf8");
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 0, version: "1.0.0-beta.3" },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.0.0-beta.3" },
        namespace: "release-beta-win",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      }, null, 2)}\n`, "utf8");
      await writeFile(launcherPaths.cleanupPath, `${JSON.stringify({
        channel: "beta",
        currentVersion: "1.0.0-beta.3",
        namespace: "release-beta-win",
        updatedAt: "2026-06-08T00:00:00.000Z",
        version: 1,
        versions: [
          {
            generation: 1,
            reason: "older-than-bound-package",
            state: "deprecated",
            updatedAt: "2026-06-08T00:00:00.000Z",
            version: "1.0.0-beta.2",
          },
          {
            generation: 0,
            reason: "current-bound-package",
            state: "retained",
            updatedAt: "2026-06-08T00:00:00.000Z",
            version: "1.0.0-beta.3",
          },
        ],
      }, null, 2)}\n`, "utf8");

      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: join(root, "updates"),
        env: {
          ...updaterEnv(fixture.metadataUrl, "win32"),
          [DESKTOP_UPDATE_ENV.CHANNEL]: DESKTOP_UPDATE_CHANNELS.BETA,
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.3",
        },
        launcherRoot: root,
        launcherRuntimePath: launcherPaths.runtimePath,
        namespace: "release-beta-win",
        source: SIDECAR_SOURCES.PACKAGED,
      }, {
        logger,
        now: () => new Date("2026-06-09T07:50:51.000Z"),
      });

      await updater.status();
      const cleanup = JSON.parse(await readFile(launcherPaths.cleanupPath, "utf8")) as {
        versions: Array<{ removedAt?: string; state: string; version: string }>;
      };

      expect(existsSync(join(launcherPaths.versionsRoot, "1.0.0-beta.2"))).toBe(false);
      expect(cleanup.versions.find((entry) => entry.version === "1.0.0-beta.2")).toMatchObject({
        removedAt: "2026-06-09T07:50:51.000Z",
        state: "cleanup-removed",
      });
      expect(logger.info).toHaveBeenCalledWith("[open-design updater] lifecycle", expect.objectContaining({
        event: "launcher-lifecycle",
        removed: 1,
        retained: 1,
        total: 2,
        trigger: "cold-start",
      }));
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("uses the same release lifecycle summary shape on mac", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", platform: "mac", version: "1.0.0-beta.3" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl, "darwin"),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.0-beta.2",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      await writeReleaseFixture(root, "1.0.0-beta.1-mac-arm64-old1", "beta", "1.0.0-beta.1");

      const checked = await updater.checkForUpdates();

      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.cache?.lifecycle).toMatchObject({
        lastTrigger: "next-version-ready",
        platform: "darwin",
        releases: expect.objectContaining({
          cleanupRemoved: 1,
          retained: 1,
        }),
      });
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults counted beta internal builds to the beta update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-beta-internal.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(config.metadataUrl).toContain("/beta/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects a zero recurring update interval", () => {
    const root = makeRoot();
    try {
      expect(() =>
        resolveDesktopUpdaterConfig({
          currentVersion: "1.2.3-beta.4",
          downloadRoot: root,
          env: {
            [DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS]: "0",
            [DESKTOP_UPDATE_ENV.ENABLED]: "1",
          },
          source: SIDECAR_SOURCES.PACKAGED,
        }),
      ).toThrow(`${DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS} must be greater than 0 milliseconds`);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults prerelease builds to the prerelease update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-prerelease.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe(DESKTOP_UPDATE_CHANNELS.PRERELEASE);
      expect(config.metadataUrl).toContain("/prerelease/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("defaults preview builds to the preview update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-preview.4",
        downloadRoot: root,
        env: {
          [DESKTOP_UPDATE_ENV.ENABLED]: "1",
        },
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(config.channel).toBe(DESKTOP_UPDATE_CHANNELS.PREVIEW);
      expect(config.metadataUrl).toContain("/preview/latest/metadata.json");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not offer an arm64-only mac package to x64 clients", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    try {
      const updater = createDesktopUpdater({
        arch: "x64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("no-compatible-artifact");
      expect(checked.error?.message).toContain("macIntel");
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("refuses aggressive cleanup in a non-owned update root", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture();
    const alienFile = join(root, "do-not-delete.txt");
    try {
      await writeFile(alienFile, "user file", "utf8");
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("update-root-not-owned");
      expect(existsSync(alienFile)).toBe(true);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
    }
  });

  const symlinkIt = process.platform === "win32" ? it.skip : it;
  symlinkIt("refuses to use a symlinked updater root", async () => {
    const realRoot = makeRoot();
    const linkParent = makeRoot();
    const linkRoot = join(linkParent, "updates");
    const fixture = await createUpdaterFixture();
    try {
      symlinkSync(realRoot, linkRoot, "dir");
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: linkRoot,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("update-root-not-owned");
      expect(existsSync(join(realRoot, ".open-design-updater-root.json"))).toBe(false);
    } finally {
      await fixture.close();
      rmSync(linkParent, { force: true, recursive: true });
      rmSync(realRoot, { force: true, recursive: true });
    }
  });

  symlinkIt("refuses to use symlinked updater subdirectories", async () => {
    const root = makeRoot();
    const outside = makeRoot();
    const fixture = await createUpdaterFixture();
    const outsideMarker = join(outside, "outside.txt");
    try {
      await writeFile(outsideMarker, "outside", "utf8");
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: updaterEnv(fixture.metadataUrl),
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });
      await updater.status();
      symlinkSync(outside, join(root, "staging"), "dir");

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.ERROR);
      expect(checked.error?.code).toBe("update-store-invalid-shape");
      expect(existsSync(outsideMarker)).toBe(true);
    } finally {
      await fixture.close();
      rmSync(root, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it("compares stable and prerelease versions", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBe(1);
    expect(compareVersions("1.0.0-beta-internal.2", "1.0.0-beta-internal.1")).toBe(1);
    expect(compareVersions("1.0.0-prerelease.10", "1.0.0-prerelease.2")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
  });
});
