import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_STATES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";

import {
  compareVersions,
  createDesktopUpdater,
  createDesktopUpdaterScheduler,
  DESKTOP_UPDATE_ENV,
  resolveDesktopUpdaterConfig,
} from "../../src/main/updater.js";

type FixtureServer = {
  artifactRequests: () => number;
  close: () => Promise<void>;
  metadataRequests: () => number;
  metadataUrl: string;
};

type FixturePlatform = "mac" | "win";

function prereleaseCounterParts(version: string): { baseVersion: string; number: number } | null {
  const prerelease = /^(\d+\.\d+\.\d+)-.+\.(\d+)$/.exec(version);
  if (prerelease?.[1] != null && prerelease[2] != null) {
    return { baseVersion: prerelease[1], number: Number(prerelease[2]) };
  }
  const nightly = /^(\d+\.\d+\.\d+)\.nightly\.(\d+)$/i.exec(version);
  if (nightly?.[1] != null && nightly[2] != null) {
    return { baseVersion: nightly[1], number: Number(nightly[2]) };
  }
  return null;
}

async function createUpdaterFixture(options: {
  artifactBody?: string;
  channel?: "stable" | "beta";
  platform?: FixturePlatform;
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
  const artifactBody = options.artifactBody ?? "open design updater fixture";
  const digest = createHash("sha256").update(artifactBody).digest("hex");
  let artifactRequests = 0;
  let metadataRequests = 0;
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/metadata.json") {
      metadataRequests += 1;
      response.setHeader("content-type", "application/json");
      const betaVersion = prereleaseCounterParts(version);
      response.end(JSON.stringify({
        channel,
        ...(channel === "beta"
          ? {
              baseVersion: betaVersion?.baseVersion,
              betaNumber: betaVersion?.number,
              betaVersion: version,
            }
          : {
              baseVersion: version,
              releaseVersion: version,
              stableVersion: version,
            }),
        platforms: {
          [platformKey]: {
            arch,
            enabled: true,
            artifacts: {
              [artifactKey]: {
                name: artifactName,
                sha256Url: `http://${serverAddress(server)}${artifactPath}.sha256`,
                size: Buffer.byteLength(artifactBody),
                url: `http://${serverAddress(server)}${artifactPath}`,
              },
            },
          },
        },
        version: 1,
      }));
      return;
    }
    if (url === artifactPath) {
      artifactRequests += 1;
      response.setHeader("content-length", String(Buffer.byteLength(artifactBody)));
      response.end(artifactBody);
      return;
    }
    if (url === `${artifactPath}.sha256`) {
      response.end(`${digest}  ${artifactName}\n`);
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

describe("desktop updater", () => {
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

  it("treats a larger counted beta nightly prerelease as an update", async () => {
    const root = makeRoot();
    const fixture = await createUpdaterFixture({ channel: "beta", version: "1.0.1-beta-nightly.2" });
    try {
      const updater = createDesktopUpdater({
        arch: "arm64",
        downloadRoot: root,
        env: {
          ...updaterEnv(fixture.metadataUrl),
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: "1.0.1-beta-nightly.1",
        },
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(DESKTOP_UPDATE_STATES.DOWNLOADED);
      expect(checked.channel).toBe(DESKTOP_UPDATE_CHANNELS.BETA);
      expect(checked.availableVersion).toBe("1.0.1-beta-nightly.2");
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

  it("defaults counted beta nightly builds to the beta update channel", () => {
    const root = makeRoot();
    try {
      const config = resolveDesktopUpdaterConfig({
        currentVersion: "1.2.3-beta-nightly.4",
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
    expect(compareVersions("1.0.0-beta-nightly.2", "1.0.0-beta-nightly.1")).toBe(1);
    expect(compareVersions("1.0.0-nightly.10", "1.0.0-nightly.2")).toBe(1);
    expect(compareVersions("1.0.0.nightly.2", "1.0.0.nightly.1")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
  });
});
