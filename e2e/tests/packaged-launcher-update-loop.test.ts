import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const LAUNCHER_SCHEMA_VERSION = 1;
const PACKAGED_SOURCE = "packaged";
const UPDATE_DOWNLOADED = "downloaded";
const HISTORICAL_OUTER_RELAY_URL = "https://relay.outer.example/v1";
const PAYLOAD_RELAY_URL = "https://relay.payload.example/v2";

type PackagedConfigLike = {
  amrProfile: null;
  appVersion: string;
  daemonCliEntry: null;
  daemonSidecarEntry: null;
  namespace: string;
  namespaceBaseRoot: string;
  nodeCommand: null;
  posthogHost: null;
  posthogKey: null;
  resourceRoot: string;
  telemetryRelayUrl: string | null;
  webOutputMode: "server";
  webSidecarEntry: null;
  webStandaloneRoot: null;
};

type DesktopUpdaterModule = {
  createDesktopUpdater: (config: Record<string, unknown>, deps?: Record<string, unknown>) => {
    checkForUpdates: () => Promise<{
      artifact?: { type?: string };
      availableVersion?: string;
      reinstall?: {
        installedVersion?: string;
        minVersion?: string;
        reason?: string;
        url?: string;
      };
      state: string;
    }>;
    installUpdate: () => Promise<{
      installResult?: { dryRun?: boolean };
      state: string;
    }>;
  };
  DESKTOP_UPDATE_ENV: Record<"CURRENT_VERSION" | "INSTALLED_VERSION" | "METADATA_URL" | "PLATFORM", string>;
};

type PackagedPaths = {
  cacheRoot: string;
  dataRoot: string;
  desktopLogsRoot: string;
  electronSessionDataRoot: string;
  electronUserDataRoot: string;
  installationRoot: string;
  logsRoot: string;
  namespaceRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
  updateRoot: string;
};

type PackagedPathsModule = {
  resolvePackagedNamespacePaths: (config: PackagedConfigLike) => PackagedPaths;
};

type PackagedLauncherRuntime = {
  config: {
    amrProfile: string | null;
    appVersion: string | null;
    daemonCliEntry: string | null;
    daemonSidecarEntry: string | null;
    nodeCommand: string | null;
    posthogHost: string | null;
    posthogKey: string | null;
    resourceRoot: string;
    telemetryRelayUrl: string | null;
    velaWebUrl: string | null;
    velaWebUrls?: Record<string, string>;
    webOutputMode: "server" | "standalone";
    webSidecarEntry: string | null;
    webStandaloneRoot: string | null;
  };
  installedLaunchPath: string | null;
  launcherPaths: {
    attemptsPath: string;
    installPath: string;
    runtimePath: string;
    stateRoot: string;
  };
  paths: PackagedPaths;
  selection: {
    pointer?: { generation: number; version: string };
    reason: string;
    selected: boolean;
  };
  source: string;
  targetVersion: string | null;
};

type PackagedSidecarsModule = {
  startPackagedSidecars: (
    runtime: {
      app: "desktop";
      base: string;
      ipc: string;
      mode: "runtime";
      namespace: string;
      source: "packaged";
    },
    paths: PackagedPaths,
    options: {
      appVersion: string | null;
      amrProfile: string | null;
      daemonCliEntry: string | null;
      daemonSidecarEntry: string | null;
      electronNodeCommand: string | null;
      mcpBootstrapArgs: readonly string[];
      mcpBootstrapCommand: string | null;
      nodeCommand: string | null;
      posthogHost: string | null;
      posthogKey: string | null;
      requireDesktopAuth: boolean;
      telemetryRelayUrl: string | null;
      velaWebUrl: string | null;
      velaWebUrls?: Record<string, string>;
      webOutputMode: "server" | "standalone";
      webSidecarEntry: string | null;
      webStandaloneRoot: string | null;
    },
  ) => Promise<{ close(): Promise<void> }>;
};

type PackagedLauncherRuntimeModule = {
  confirmPackagedLauncherRuntime: (runtime: PackagedLauncherRuntime) => Promise<void>;
  resolvePackagedLauncherRuntime: (
    config: PackagedConfigLike,
    paths: PackagedPaths,
    options?: {
      currentExecutablePath?: string;
      delegated?: { generation: number; version: string };
    },
  ) => Promise<PackagedLauncherRuntime>;
};

type FixtureServer = {
  close: () => Promise<void>;
  metadataUrl: string;
};

type PlatformCase = {
  arch: "arm64" | "x64";
  channel: "beta" | "prerelease";
  currentVersion: string;
  expectedPayloadExecutablePath: (root: string, namespace: string) => string;
  expectedResourceRoot: (root: string, namespace: string) => string;
  fixturePlatformKey: "mac" | "win";
  productName: "Open Design" | "Open Design Beta" | "Open Design Prerelease";
  namespace: "release-beta" | "release-beta-win" | "release-prerelease";
  payloadArchiveName: string;
  payloadPath: string;
  platform: "darwin" | "win32";
  promotedVersion: string;
  writePayload: (destinationRoot: string, testCase: PlatformCase) => Promise<void>;
};

async function loadDesktopUpdaterModule(): Promise<DesktopUpdaterModule> {
  return await import(new URL("../../apps/desktop/src/main/updater.ts", import.meta.url).href) as DesktopUpdaterModule;
}

async function loadPackagedPathsModule(): Promise<PackagedPathsModule> {
  return await import(new URL("../../apps/packaged/src/paths.ts", import.meta.url).href) as PackagedPathsModule;
}

async function loadPackagedLauncherRuntimeModule(): Promise<PackagedLauncherRuntimeModule> {
  return await import(new URL("../../apps/packaged/src/launcher-runtime.ts", import.meta.url).href) as PackagedLauncherRuntimeModule;
}

async function loadPackagedSidecarsModule(): Promise<PackagedSidecarsModule> {
  return await import(new URL("../../apps/packaged/src/sidecars.ts", import.meta.url).href) as PackagedSidecarsModule;
}

const FAKE_SIDECAR_SOURCE = String.raw`
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

const appArgument = process.argv.find((argument) => argument.startsWith("--od-stamp-app="));
const app = appArgument == null ? null : appArgument.slice("--od-stamp-app=".length);
const socketPath = process.env.OD_SIDECAR_IPC_PATH;
if (app == null || socketPath == null) throw new Error("missing sidecar identity");
if (app === "daemon") {
  const dataRoot = process.env.OD_DATA_DIR;
  if (dataRoot == null) throw new Error("missing daemon data root");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(
    join(dataRoot, "captured-daemon-env.json"),
    JSON.stringify({ telemetryRelayUrl: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL ?? null }),
  );
}
if (!socketPath.startsWith("\\\\.\\pipe\\")) {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true });
}
const server = createServer((socket) => {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    const request = JSON.parse(buffer.slice(0, newline));
    const shutdown = request.type === "shutdown";
    const result = request.type === "status"
      ? {
          pid: process.pid,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: app === "daemon" ? "http://127.0.0.1:43101" : "http://127.0.0.1:43102",
        }
      : { accepted: true };
    socket.end(JSON.stringify({ ok: true, result }) + "\n", () => {
      if (shutdown) server.close(() => process.exit(0));
    });
  });
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(socketPath, resolve);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
`;

function fakePackagedConfig(root: string, testCase: PlatformCase): PackagedConfigLike {
  return {
    amrProfile: null,
    appVersion: testCase.currentVersion,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace: testCase.namespace,
    namespaceBaseRoot: join(root, "namespaces"),
    nodeCommand: null,
    posthogHost: null,
    posthogKey: null,
    resourceRoot: join(root, "installed", "resources", "open-design"),
    telemetryRelayUrl: HISTORICAL_OUTER_RELAY_URL,
    webOutputMode: "server",
    webSidecarEntry: null,
    webStandaloneRoot: null,
  };
}

function serverAddress(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("fixture server did not bind to a TCP port");
  return `127.0.0.1:${address.port}`;
}

async function createPayloadMetadataFixture(options: PlatformCase): Promise<FixtureServer> {
  const payloadBody = Buffer.from("open design launcher payload update loop fixture");
  const payloadDigest = createHash("sha256").update(payloadBody).digest("hex");
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/metadata.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        betaNumber: Number(options.promotedVersion.split(".").at(-1)),
        betaVersion: options.promotedVersion,
        channel: options.channel,
        releaseNumber: Number(options.promotedVersion.split(".").at(-1)),
        releaseVersion: options.promotedVersion,
        platforms: {
          [options.fixturePlatformKey]: {
            arch: options.arch,
            enabled: true,
            artifacts: {
              [options.platform === "win32" ? "installer" : "dmg"]: {
                name: options.platform === "win32"
                  ? `open-design-${options.promotedVersion}-win-x64-setup.exe`
                  : `open-design-${options.promotedVersion}-mac-arm64.dmg`,
                sha256: "unused-full-package-checksum",
                url: `http://${serverAddress(server)}/${options.platform === "win32" ? "installer.exe" : "app.dmg"}`,
              },
              payload: {
                name: options.payloadArchiveName,
                sha256Url: `http://${serverAddress(server)}${options.payloadPath}.sha256`,
                size: payloadBody.byteLength,
                url: `http://${serverAddress(server)}${options.payloadPath}`,
              },
            },
          },
        },
        version: 1,
      }));
      return;
    }
    if (url === options.payloadPath) {
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("content-length", String(payloadBody.byteLength));
      response.end(payloadBody);
      return;
    }
    if (url === `${options.payloadPath}.sha256`) {
      response.end(`${payloadDigest}  ${options.payloadArchiveName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      }),
    metadataUrl: `http://${serverAddress(server)}/metadata.json`,
  };
}

async function writeExtractedWindowsPayload(destinationRoot: string, testCase: PlatformCase): Promise<void> {
  const executableName = `${testCase.productName}.exe`;
  await mkdir(join(destinationRoot, "payload", "resources", "open-design", "bin"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", "resources", "prebundled", "daemon"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", "resources", "prebundled", "web"), { recursive: true });
  await writeFile(join(destinationRoot, "payload", executableName), "");
  await writeFile(join(destinationRoot, "payload", "resources", "open-design", "bin", "node.exe"), "");
  await writeFile(join(destinationRoot, "payload", "resources", "prebundled", "daemon", "daemon-sidecar.mjs"), FAKE_SIDECAR_SOURCE);
  await writeFile(join(destinationRoot, "payload", "resources", "prebundled", "web", "web-sidecar.mjs"), FAKE_SIDECAR_SOURCE);
  await writeFile(
    join(destinationRoot, "payload", "resources", "open-design-config.json"),
    `${JSON.stringify({
      appVersion: testCase.promotedVersion,
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node.exe",
      telemetryRelayUrl: PAYLOAD_RELAY_URL,
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: testCase.channel,
      entry: { cwd: "payload", executable: `payload/${executableName}` },
      namespace: testCase.namespace,
      payloadRoot: "payload",
      platform: "win32",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: testCase.promotedVersion,
    })}\n`,
  );
}

async function writeExtractedMacPayload(destinationRoot: string, testCase: PlatformCase): Promise<void> {
  const appBundleName = `${testCase.productName}.app`;
  const resourcesRoot = join(destinationRoot, "payload", appBundleName, "Contents", "Resources");
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "web"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", appBundleName, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(destinationRoot, "payload", appBundleName, "Contents", "MacOS", testCase.productName), "");
  await writeFile(join(resourcesRoot, "open-design", "bin", "node"), "");
  await writeFile(join(resourcesRoot, "prebundled", "daemon", "daemon-sidecar.mjs"), FAKE_SIDECAR_SOURCE);
  await writeFile(join(resourcesRoot, "prebundled", "web", "web-sidecar.mjs"), FAKE_SIDECAR_SOURCE);
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: testCase.promotedVersion,
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node",
      telemetryRelayUrl: PAYLOAD_RELAY_URL,
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: testCase.channel,
      entry: {
        cwd: `payload/${appBundleName}`,
        executable: `payload/${appBundleName}/Contents/MacOS/${testCase.productName}`,
      },
      namespace: testCase.namespace,
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: testCase.promotedVersion,
    })}\n`,
  );
}

function nextFailedVersion(testCase: PlatformCase): string {
  return testCase.channel === "prerelease" ? "1.2.3-prerelease.6" : "1.2.3-beta.6";
}

const platformCases: PlatformCase[] = [
  {
    arch: "x64",
    channel: "beta",
    currentVersion: "1.2.3-beta.4",
    expectedPayloadExecutablePath: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "Open Design.exe"),
    expectedResourceRoot: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "resources", "open-design"),
    fixturePlatformKey: "win",
    namespace: "release-beta-win",
    productName: "Open Design",
    payloadArchiveName: "open-design-1.2.3-beta.5-win-x64-payload.7z",
    payloadPath: "/payload.7z",
    platform: "win32",
    promotedVersion: "1.2.3-beta.5",
    writePayload: writeExtractedWindowsPayload,
  },
  {
    arch: "arm64",
    channel: "beta",
    currentVersion: "1.2.3-beta.4",
    expectedPayloadExecutablePath: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta"),
    expectedResourceRoot: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "Open Design Beta.app", "Contents", "Resources", "open-design"),
    fixturePlatformKey: "mac",
    namespace: "release-beta",
    productName: "Open Design Beta",
    payloadArchiveName: "open-design-1.2.3-beta.5-mac-arm64-payload.zip",
    payloadPath: "/payload.zip",
    platform: "darwin",
    promotedVersion: "1.2.3-beta.5",
    writePayload: writeExtractedMacPayload,
  },
  {
    arch: "arm64",
    channel: "prerelease",
    currentVersion: "1.2.3-prerelease.4",
    expectedPayloadExecutablePath: (root, namespace) =>
      join(root, "launcher", "channels", "prerelease", "namespaces", namespace, "versions", "1.2.3-prerelease.5", "payload", "Open Design Prerelease.app", "Contents", "MacOS", "Open Design Prerelease"),
    expectedResourceRoot: (root, namespace) =>
      join(root, "launcher", "channels", "prerelease", "namespaces", namespace, "versions", "1.2.3-prerelease.5", "payload", "Open Design Prerelease.app", "Contents", "Resources", "open-design"),
    fixturePlatformKey: "mac",
    namespace: "release-prerelease",
    productName: "Open Design Prerelease",
    payloadArchiveName: "open-design-1.2.3-prerelease.5-mac-arm64-payload.zip",
    payloadPath: "/prerelease-payload.zip",
    platform: "darwin",
    promotedVersion: "1.2.3-prerelease.5",
    writePayload: writeExtractedMacPayload,
  },
];

describe("packaged launcher payload update loop", () => {
  it.each(platformCases)(
    "[P2] bridges a full-package $channel install into $platform payload updates, bootstrap selection, confirmation, and fallback",
    async (testCase) => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-loop-"));
    const fixture = await createPayloadMetadataFixture(testCase);

    try {
      const { createDesktopUpdater, DESKTOP_UPDATE_ENV } = await loadDesktopUpdaterModule();
      const { resolvePackagedNamespacePaths } = await loadPackagedPathsModule();
      const { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } = await loadPackagedLauncherRuntimeModule();
      const { startPackagedSidecars } = await loadPackagedSidecarsModule();
      const config = fakePackagedConfig(root, testCase);
      const paths = resolvePackagedNamespacePaths(config);
      const initialRuntime = await resolvePackagedLauncherRuntime(config, paths);
      const launchRequests: Array<{ appPid: number; launchPath: string; root: string }> = [];

      expect(initialRuntime.source).toBe("current-package");
      expect(initialRuntime.targetVersion).toBeNull();
      expect(initialRuntime.installedLaunchPath).toEqual(expect.any(String));
      expect(JSON.parse(await readFile(initialRuntime.launcherPaths.installPath, "utf8"))).toMatchObject({
        channel: testCase.channel,
        launchPath: initialRuntime.installedLaunchPath,
        namespace: config.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      });
      expect(JSON.parse(await readFile(initialRuntime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: testCase.currentVersion },
        lastSuccessful: { generation: 0, version: testCase.currentVersion },
      });

      const updater = createDesktopUpdater({
        arch: testCase.arch,
        currentVersion: testCase.currentVersion,
        downloadRoot: paths.updateRoot,
        env: {
          [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: testCase.currentVersion,
          [DESKTOP_UPDATE_ENV.METADATA_URL]: fixture.metadataUrl,
          [DESKTOP_UPDATE_ENV.PLATFORM]: testCase.platform,
        },
        launcherRoot: paths.installationRoot,
        launcherLaunchPath: initialRuntime.installedLaunchPath,
        launcherRuntimePath: initialRuntime.launcherPaths.runtimePath,
        namespace: config.namespace,
        platform: testCase.platform,
        source: PACKAGED_SOURCE,
      }, {
        extractLauncherPayloadArchive: async (input: { destinationRoot: string }) => testCase.writePayload(input.destinationRoot, testCase),
        launchAppAfterQuit: async (input: { appPid: number; launchPath: string; root: string }) => {
          launchRequests.push({
            appPid: input.appPid,
            launchPath: input.launchPath,
            root: input.root,
          });
          return {};
        },
        now: () => new Date("2026-06-06T00:00:00.000Z"),
      });

      const checked = await updater.checkForUpdates();
      expect(checked.state).toBe(UPDATE_DOWNLOADED);
      expect(checked.artifact?.type).toBe("payload");
      expect(checked.availableVersion).toBe(testCase.promotedVersion);

      const installed = await updater.installUpdate();
      expect(installed.state).toBe(UPDATE_DOWNLOADED);
      expect(installed.installResult?.dryRun).toBe(false);
      expect(launchRequests).toEqual([
        {
          appPid: process.pid,
          launchPath: testCase.expectedPayloadExecutablePath(paths.installationRoot, config.namespace),
          root: await realpath(paths.updateRoot),
        },
      ]);

      const runtimeAfterApply = JSON.parse(await readFile(initialRuntime.launcherPaths.runtimePath, "utf8")) as {
        active?: { generation: number; version: string };
        lastSuccessful?: { generation: number; version: string };
      };
      expect(runtimeAfterApply.active).toEqual({ generation: 1, version: testCase.promotedVersion });
      expect(runtimeAfterApply.lastSuccessful).toEqual({ generation: 0, version: testCase.currentVersion });

      const promoted = await resolvePackagedLauncherRuntime(config, paths, {
        currentExecutablePath: testCase.expectedPayloadExecutablePath(paths.installationRoot, config.namespace),
        delegated: { generation: 1, version: testCase.promotedVersion },
      });
      expect(promoted.source).toBe("payload");
      expect(promoted.targetVersion).toBe(testCase.promotedVersion);
      expect(promoted.config.appVersion).toBe(testCase.promotedVersion);
      expect(promoted.config.resourceRoot).toBe(testCase.expectedResourceRoot(paths.installationRoot, config.namespace));
      expect(promoted.config.telemetryRelayUrl).toBe(PAYLOAD_RELAY_URL);
      const sidecarNamespace = `payload-relay-${process.pid}-${Date.now()}`;
      const sidecars = await startPackagedSidecars({
        app: "desktop",
        base: promoted.paths.runtimeRoot,
        ipc: join(promoted.paths.runtimeRoot, "desktop.sock"),
        mode: "runtime",
        namespace: sidecarNamespace,
        source: "packaged",
      }, promoted.paths, {
        appVersion: promoted.config.appVersion,
        amrProfile: promoted.config.amrProfile,
        daemonCliEntry: promoted.config.daemonCliEntry,
        daemonSidecarEntry: promoted.config.daemonSidecarEntry,
        electronNodeCommand: null,
        mcpBootstrapArgs: [],
        mcpBootstrapCommand: null,
        // The synthetic payload contains fixture files, not a platform Node
        // binary. Use the test process's Node while preserving the real
        // startPackagedSidecars -> spawnSidecarChild environment path.
        nodeCommand: process.execPath,
        posthogHost: promoted.config.posthogHost,
        posthogKey: promoted.config.posthogKey,
        requireDesktopAuth: true,
        telemetryRelayUrl: promoted.config.telemetryRelayUrl,
        velaWebUrl: promoted.config.velaWebUrl,
        ...(promoted.config.velaWebUrls == null ? {} : { velaWebUrls: promoted.config.velaWebUrls }),
        webOutputMode: promoted.config.webOutputMode,
        webSidecarEntry: promoted.config.webSidecarEntry,
        webStandaloneRoot: promoted.config.webStandaloneRoot,
      });
      try {
        const daemonEnv = JSON.parse(
          await readFile(join(promoted.paths.dataRoot, "captured-daemon-env.json"), "utf8"),
        ) as { telemetryRelayUrl: string | null };
        expect(daemonEnv.telemetryRelayUrl).toBe(PAYLOAD_RELAY_URL);
      } finally {
        await sidecars.close();
      }
      expect(JSON.parse(await readFile(promoted.launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        generation: 1,
        version: testCase.promotedVersion,
      });

      await confirmPackagedLauncherRuntime(promoted);
      expect(JSON.parse(await readFile(promoted.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 1, version: testCase.promotedVersion },
        lastSuccessful: { generation: 1, version: testCase.promotedVersion },
      });

      await mkdir(promoted.launcherPaths.stateRoot, { recursive: true });
      await writeFile(
        promoted.launcherPaths.runtimePath,
        `${JSON.stringify({
          active: { generation: 2, version: nextFailedVersion(testCase) },
          channel: testCase.channel,
          lastSuccessful: { generation: 1, version: testCase.promotedVersion },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      await writeFile(
        promoted.launcherPaths.attemptsPath,
        `${JSON.stringify({
          channel: testCase.channel,
          generation: 2,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: nextFailedVersion(testCase),
        })}\n`,
      );

      const fallback = await resolvePackagedLauncherRuntime(config, paths);
      expect(fallback.selection).toMatchObject({
        pointer: { generation: 1, version: testCase.promotedVersion },
        reason: "last-successful",
        selected: true,
      });
      expect(fallback.source).toBe("payload");
      expect(fallback.targetVersion).toBe(testCase.promotedVersion);
    } finally {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});

/**
 * The installer-reinstall floor, observed across the release and client
 * boundaries at once.
 *
 * Payload updates never replace the Electron outer shell: `tools/pack`
 * publishes a payload archive that an installed outer adopts in place, and the
 * outer bundle on disk keeps its install-time version forever. So a release
 * whose SHELL changed cannot reach an old install as a payload update — the
 * only mechanism that can is `control.launcher.version.{min,url}`, the floor an
 * operator configures with the `RELEASE_LAUNCHER_VERSION_MIN_<CHANNEL>` /
 * `RELEASE_LAUNCHER_VERSION_MIN_URL_<CHANNEL>` repo-vars pair.
 *
 * The two version axes these specs drive are deliberately distinct, and the
 * distinction IS the mechanism (see `resolveInstalledOuterVersion` in
 * `apps/desktop/src/main/updater/feed.ts`):
 *
 *  - the RUNNING version (`config.currentVersion`) advances with every payload
 *    update, so after one payload update it no longer describes the shell;
 *  - the INSTALLED OUTER version is read from the outer bundle's own
 *    `open-design-config.json` and is what an installer reinstall replaces.
 *
 * A shell too old to run the new payload therefore looks CURRENT on the running
 * axis. Every scenario below keeps the two apart so a regression that compares
 * the floor against the running version cannot pass.
 *
 * That floor crosses three owners — `tools/release` resolves and validates the
 * channel policy, the release feed carries it, and `apps/desktop`'s updater
 * enforces it. Each side has unit coverage; nothing joined them. These specs
 * drive the REAL release-side resolver into a REAL feed and then into a REAL
 * packaged update check, so a break anywhere in that chain is observable here
 * instead of at publish time.
 *
 * See `tools/pack/AGENTS.md` section "Packaged auto-update architecture and
 * harness" for the mechanism's contract.
 */
/** The channel whose repo-vars pair the scenarios configure. */
const CHANNEL = "stable";
/** An outer package released before the shell change. */
const BELOW_FLOOR_OUTER_VERSION = "0.15.1";
/**
 * What that old outer is RUNNING: a payload it already adopted in place. It is
 * newer than the outer and older than the release, which is exactly the state
 * that makes the running axis useless for gating.
 */
const RUNNING_PAYLOAD_VERSION = "0.16.1";
/** The release that requires the newer outer, and the floor it publishes. */
const RELEASE_VERSION = "0.17.0";
/** Operator-supplied recovery link. Never an internal hostname in source. */
const FLOOR_URL = "https://example.test/open-design/download";

const CONFIGURED_FLOOR: NodeJS.ProcessEnv = {
  RELEASE_LAUNCHER_VERSION_MIN_STABLE: RELEASE_VERSION,
  RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: FLOOR_URL,
};




type LauncherVersionFloor = { min: string; url?: string };

type LauncherVersionFloorModule = {
  assertLauncherVersionFloorSatisfiable: (floor: LauncherVersionFloor, releaseVersion: string) => void;
  resolveLauncherVersionFloor: (channel: string, env: NodeJS.ProcessEnv) => LauncherVersionFloor | null;
};






async function loadLauncherVersionFloorModule(): Promise<LauncherVersionFloorModule> {
  return await import(
    new URL("../../tools/release/src/storage/launcher-version-floor.ts", import.meta.url).href
  ) as LauncherVersionFloorModule;
}



/**
 * Resolve the floor exactly as publication does — through the shared channel
 * resolver, then through the satisfiability assert that publish/verify apply.
 * Hand-writing the metadata block instead would let these specs pass against a
 * policy the release pipeline would refuse.
 */
async function publishableFloor(
  env: NodeJS.ProcessEnv,
  releaseVersion: string,
): Promise<LauncherVersionFloor | null> {
  const { assertLauncherVersionFloorSatisfiable, resolveLauncherVersionFloor } =
    await loadLauncherVersionFloorModule();
  const floor = resolveLauncherVersionFloor(CHANNEL, env);
  if (floor != null) assertLauncherVersionFloorSatisfiable(floor, releaseVersion);
  return floor;
}



/**
 * A release feed offering BOTH a payload and the platform's full installer for
 * the same version, which is the only shape where the floor's effect is
 * observable: the updater prefers the payload, so selecting the installer can
 * only be the floor's doing.
 *
 * The installer artifact key differs per platform — `dmg` on macOS, `installer`
 * on Windows — so a feed that only ever describes one of them cannot catch a
 * regression in the other's selection branch.
 */
async function createFloorMetadataFixture(options: {
  floor: LauncherVersionFloor | null;
  launcherSchema?: number;
  target: FloorPlatformTarget;
}): Promise<FixtureServer> {
  const { target } = options;
  const payloadBody = Buffer.from("open design reinstall floor fixture payload");
  const payloadDigest = createHash("sha256").update(payloadBody).digest("hex");
  const payloadArchiveName = `open-design-${RELEASE_VERSION}-${target.fixturePlatformKey}-${target.arch}-payload${target.payloadArchiveExtension}`;
  // The installer artifact needs real bytes and a real digest here: every
  // reinstall scenario selects it, and the updater verifies it before it will
  // expose an install action.
  const installerBody = Buffer.from("open design reinstall floor fixture installer");
  const installerDigest = createHash("sha256").update(installerBody).digest("hex");
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/metadata.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        channel: CHANNEL,
        ...(options.floor == null ? {} : { control: { launcher: { version: options.floor } } }),
        ...(options.launcherSchema == null ? {} : { launcher: { schema: options.launcherSchema } }),
        platforms: {
          [target.fixturePlatformKey]: {
            arch: target.arch,
            enabled: true,
            artifacts: {
              [target.installerArtifactKey]: {
                name: `open-design-${RELEASE_VERSION}-${target.fixturePlatformKey}-${target.arch}${target.installerExtension}`,
                sha256: installerDigest,
                size: installerBody.byteLength,
                url: `http://${serverAddress(server)}/installer${target.installerExtension}`,
              },
              payload: {
                name: payloadArchiveName,
                sha256Url: `http://${serverAddress(server)}/payload${target.payloadArchiveExtension}.sha256`,
                size: payloadBody.byteLength,
                url: `http://${serverAddress(server)}/payload${target.payloadArchiveExtension}`,
              },
            },
          },
        },
        releaseVersion: RELEASE_VERSION,
        version: 1,
      }));
      return;
    }
    if (url === `/installer${target.installerExtension}`) {
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("content-length", String(installerBody.byteLength));
      response.end(installerBody);
      return;
    }
    if (url === `/payload${target.payloadArchiveExtension}`) {
      response.setHeader("accept-ranges", "bytes");
      response.setHeader("content-length", String(payloadBody.byteLength));
      response.end(payloadBody);
      return;
    }
    if (url === `/payload${target.payloadArchiveExtension}.sha256`) {
      response.end(`${payloadDigest}  ${payloadArchiveName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      }),
    metadataUrl: `http://${serverAddress(server)}/metadata.json`,
  };
}

/**
 * The per-platform facts the floor scenarios vary. Everything a reinstall
 * decision touches differs between macOS and Windows — the installer artifact
 * key, and above all WHERE the physically installed outer package records its
 * own version — so the scenarios below run against this table rather than
 * hard-coding one platform's shape.
 */
type FloorPlatformTarget = {
  arch: "arm64" | "x64";
  /** Where `resolveInstalledOuterVersion` looks, relative to the launch path. */
  installedOuterConfigPath: (launchPath: string) => string;
  /**
   * The launch path an outer install presents. macOS points at the `.app`
   * bundle directory; Windows points at the executable file, and the config is
   * read from a sibling `resources/` directory instead of inside the target.
   */
  installedLaunchPath: (installedRoot: string) => string;
  /** Whether the launch path itself is a directory (mac bundle) or a file. */
  installedLaunchPathIsDirectory: boolean;
  installerArtifactKey: "dmg" | "installer";
  installerExtension: ".dmg" | ".exe";
  fixturePlatformKey: "mac" | "win";
  payloadArchiveExtension: ".7z" | ".zip";
  platform: "darwin" | "win32";
  writeExtractedPayload: (destinationRoot: string) => Promise<void>;
};

/**
 * Stand in for the platform extractor (`ditto -x -k` / 7-Zip) on the fixture's
 * synthetic archive: write the minimum extracted mac payload the launcher will
 * accept, so the payload path can reach a real DOWNLOADED state and the floor's
 * effect stays the only difference between scenarios.
 */
async function writeExtractedFloorMacPayload(destinationRoot: string): Promise<void> {
  const appBundleName = "Open Design.app";
  const bundleRoot = join(destinationRoot, "payload", appBundleName);
  const resourcesRoot = join(bundleRoot, "Contents", "Resources");
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "web"), { recursive: true });
  await mkdir(join(bundleRoot, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(bundleRoot, "Contents", "MacOS", "Open Design"), "");
  await writeFile(join(resourcesRoot, "open-design", "bin", "node"), "");
  await writeFile(join(resourcesRoot, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
  await writeFile(join(resourcesRoot, "prebundled", "web", "web-sidecar.mjs"), "");
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: RELEASE_VERSION,
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: CHANNEL,
      entry: {
        cwd: `payload/${appBundleName}`,
        executable: `payload/${appBundleName}/Contents/MacOS/Open Design`,
      },
      namespace: "default",
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: RELEASE_VERSION,
    })}\n`,
  );
}

/** The Windows counterpart: a flat payload rooted at the executable. */
async function writeExtractedFloorWindowsPayload(destinationRoot: string): Promise<void> {
  const executableName = "Open Design.exe";
  const payloadRoot = join(destinationRoot, "payload");
  const resourcesRoot = join(payloadRoot, "resources");
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "web"), { recursive: true });
  await writeFile(join(payloadRoot, executableName), "");
  await writeFile(join(resourcesRoot, "open-design", "bin", "node.exe"), "");
  await writeFile(join(resourcesRoot, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
  await writeFile(join(resourcesRoot, "prebundled", "web", "web-sidecar.mjs"), "");
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: RELEASE_VERSION,
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node.exe",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: CHANNEL,
      entry: { cwd: "payload", executable: `payload/${executableName}` },
      namespace: "default",
      payloadRoot: "payload",
      platform: "win32",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: RELEASE_VERSION,
    })}\n`,
  );
}

const floorPlatformTargets = {
  mac: {
    arch: "arm64",
    // Inside the bundle: <launchPath>/Contents/Resources/open-design-config.json
    installedOuterConfigPath: (launchPath) => join(launchPath, "Contents", "Resources", "open-design-config.json"),
    installedLaunchPath: (installedRoot) => join(installedRoot, "Open Design.app"),
    installedLaunchPathIsDirectory: true,
    installerArtifactKey: "dmg",
    installerExtension: ".dmg",
    fixturePlatformKey: "mac",
    payloadArchiveExtension: ".zip",
    platform: "darwin",
    writeExtractedPayload: writeExtractedFloorMacPayload,
  },
  win: {
    arch: "x64",
    // Beside the executable: dirname(<launchPath>)/resources/open-design-config.json
    installedOuterConfigPath: (launchPath) => join(dirname(launchPath), "resources", "open-design-config.json"),
    installedLaunchPath: (installedRoot) => join(installedRoot, "Open Design.exe"),
    installedLaunchPathIsDirectory: false,
    installerArtifactKey: "installer",
    installerExtension: ".exe",
    fixturePlatformKey: "win",
    payloadArchiveExtension: ".7z",
    platform: "win32",
    writeExtractedPayload: writeExtractedFloorWindowsPayload,
  },
} as const satisfies Record<string, FloorPlatformTarget>;

/**
 * Materialize the physically installed outer package the update check will read
 * its version from — the real file at the real per-platform location, never the
 * `OD_UPDATE_INSTALLED_VERSION` override, because that override short-circuits
 * `resolveInstalledOuterVersion` before the platform branch it is meant to
 * exercise. Pass a null version to leave the package present but unidentifiable.
 */
async function writeInstalledOuterPackage(
  installedRoot: string,
  target: FloorPlatformTarget,
  appVersion: string | null,
): Promise<string> {
  const launchPath = target.installedLaunchPath(installedRoot);
  if (target.installedLaunchPathIsDirectory) {
    await mkdir(launchPath, { recursive: true });
  } else {
    await mkdir(dirname(launchPath), { recursive: true });
    await writeFile(launchPath, "");
  }
  if (appVersion != null) {
    const configPath = target.installedOuterConfigPath(launchPath);
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ appVersion })}\n`);
  }
  return launchPath;
}

type FloorScenario = {
  /**
   * What the physically installed outer package reports, or `null` to leave it
   * present but unidentifiable — the state a client lands in when the outer's
   * own `open-design-config.json` cannot be read.
   */
  installedOuterVersion: string | null;
  /** Remote launcher-contract schema, when the ABI axis is under test. */
  launcherSchema?: number;
  /** Repo vars the operator configured for the channel. */
  releaseEnv: NodeJS.ProcessEnv;
  /** The payload version this install is currently running. */
  runningVersion?: string;
  /** Which platform's install shape to drive. */
  target: FloorPlatformTarget;
};

/**
 * Drive one real packaged update check against a real feed, returning the
 * updater snapshot plus the launcher runtime pointer so a caller can prove no
 * payload was adopted.
 */
async function checkPackagedUpdate(scenario: FloorScenario): Promise<{
  runtimeActive: { generation: number; version: string } | undefined;
  snapshot: Awaited<ReturnType<ReturnType<DesktopUpdaterModule["createDesktopUpdater"]>["checkForUpdates"]>>;
}> {
  const { createDesktopUpdater, DESKTOP_UPDATE_ENV } = await loadDesktopUpdaterModule();
  const { resolvePackagedNamespacePaths } = await loadPackagedPathsModule();
  const { resolvePackagedLauncherRuntime } = await loadPackagedLauncherRuntimeModule();

  const runningVersion = scenario.runningVersion ?? RUNNING_PAYLOAD_VERSION;
  const target = scenario.target;
  const floor = await publishableFloor(scenario.releaseEnv, RELEASE_VERSION);
  const fixture = await createFloorMetadataFixture({
    floor,
    target,
    ...(scenario.launcherSchema == null ? {} : { launcherSchema: scenario.launcherSchema }),
  });
  const root = await mkdtemp(join(tmpdir(), "od-reinstall-floor-"));
  try {
    const config: PackagedConfigLike = {
      amrProfile: null,
      appVersion: runningVersion,
      daemonCliEntry: null,
      daemonSidecarEntry: null,
      namespace: "default",
      namespaceBaseRoot: join(root, "namespaces"),
      nodeCommand: null,
      posthogHost: null,
      posthogKey: null,
      resourceRoot: join(root, "installed", "resources", "open-design"),
      telemetryRelayUrl: null,
      webOutputMode: "server",
      webSidecarEntry: null,
      webStandaloneRoot: null,
    };
    const paths = resolvePackagedNamespacePaths(config);
    const runtime = await resolvePackagedLauncherRuntime(config, paths);
    // The install the floor is judged against. Deliberately NOT the launch path
    // resolvePackagedLauncherRuntime derived from this test process — that would
    // put the outer config next to the node binary instead of at the
    // platform-specific location under test.
    const installedLaunchPath = await writeInstalledOuterPackage(
      join(root, "installed"),
      target,
      scenario.installedOuterVersion,
    );

    const updater = createDesktopUpdater({
      arch: target.arch,
      currentVersion: runningVersion,
      downloadRoot: paths.updateRoot,
      env: {
        [DESKTOP_UPDATE_ENV.CURRENT_VERSION]: runningVersion,
        [DESKTOP_UPDATE_ENV.METADATA_URL]: fixture.metadataUrl,
        [DESKTOP_UPDATE_ENV.PLATFORM]: target.platform,
      },
      launcherRoot: paths.installationRoot,
      launcherLaunchPath: installedLaunchPath,
      launcherRuntimePath: runtime.launcherPaths.runtimePath,
      namespace: config.namespace,
      platform: target.platform,
      source: PACKAGED_SOURCE,
    }, {
      extractLauncherPayloadArchive: async (input: { destinationRoot: string }) =>
        target.writeExtractedPayload(input.destinationRoot),
      now: () => new Date("2026-07-28T00:00:00.000Z"),
    });

    const snapshot = await updater.checkForUpdates();
    const runtimeJson = JSON.parse(
      await readFile(runtime.launcherPaths.runtimePath, "utf8"),
    ) as { active?: { generation: number; version: string } };
    return { runtimeActive: runtimeJson.active, snapshot };
  } finally {
    await fixture.close();
    await rm(root, { force: true, recursive: true });
  }
}

describe.each([
  ["mac", floorPlatformTargets.mac],
  ["win", floorPlatformTargets.win],
] as const)("packaged installer-reinstall floor (%s)", (_label, target) => {
  it("[P1] routes an outer below the floor to the installer instead of the payload", async () => {
    const { runtimeActive, snapshot } = await checkPackagedUpdate({
      installedOuterVersion: BELOW_FLOOR_OUTER_VERSION,
      releaseEnv: CONFIGURED_FLOOR,
      target,
    });

    // The floor turned an in-place payload update into a full reinstall, and
    // the artifact is this platform's own installer shape...
    expect(snapshot.artifact?.type).toBe(target.installerArtifactKey);
    // ...and told the user why, with the operator's recovery link intact.
    expect(snapshot.reinstall).toMatchObject({
      installedVersion: BELOW_FLOOR_OUTER_VERSION,
      minVersion: RELEASE_VERSION,
      reason: "outer-below-min",
      url: FLOOR_URL,
    });
    // The old outer must still be the live pointer: nothing was adopted.
    expect(runtimeActive).toEqual({ generation: 0, version: RUNNING_PAYLOAD_VERSION });
  });

  it("[P1] judges the floor by the installed outer, not the payload it is running", async () => {
    // The regression this whole mechanism exists for. Both installs run the
    // same already-updated payload; only the shell underneath differs, and only
    // the stale shell may be sent to the installer. The installed version is
    // read from this platform's real on-disk location, so a regression in that
    // lookup surfaces here rather than being masked by a test override.
    const stale = await checkPackagedUpdate({
      installedOuterVersion: BELOW_FLOOR_OUTER_VERSION,
      releaseEnv: CONFIGURED_FLOOR,
      runningVersion: RUNNING_PAYLOAD_VERSION,
      target,
    });
    const current = await checkPackagedUpdate({
      installedOuterVersion: RELEASE_VERSION,
      releaseEnv: CONFIGURED_FLOOR,
      runningVersion: RUNNING_PAYLOAD_VERSION,
      target,
    });

    expect(stale.snapshot.artifact?.type).toBe(target.installerArtifactKey);
    expect(stale.snapshot.reinstall?.reason).toBe("outer-below-min");
    expect(stale.snapshot.reinstall?.installedVersion).toBe(BELOW_FLOOR_OUTER_VERSION);
    expect(current.snapshot.artifact?.type).toBe("payload");
    expect(current.snapshot.reinstall).toBeUndefined();
    expect(current.snapshot.state).toBe(UPDATE_DOWNLOADED);
  });

  it("[P1] treats an unreadable installed outer as a reinstall signal", async () => {
    // Fail closed: local state that cannot be identified cannot be certified as
    // above the floor. The user still gets the installer route and a reason,
    // but no installedVersion to show — so the copy must not depend on one.
    const { snapshot } = await checkPackagedUpdate({
      installedOuterVersion: null,
      releaseEnv: CONFIGURED_FLOOR,
      target,
    });

    expect(snapshot.artifact?.type).toBe(target.installerArtifactKey);
    expect(snapshot.reinstall).toMatchObject({
      minVersion: RELEASE_VERSION,
      reason: "outer-version-unreadable",
      url: FLOOR_URL,
    });
    expect(snapshot.reinstall?.installedVersion).toBeUndefined();
  });

  it("[P1] routes a release whose launcher schema is beyond this client to the installer", async () => {
    // The ABI axis, independent of any version floor: a feed declaring a
    // launcher contract this build cannot interpret must not be adopted in
    // place even when the installed outer is perfectly current.
    const { snapshot } = await checkPackagedUpdate({
      installedOuterVersion: RELEASE_VERSION,
      launcherSchema: LAUNCHER_SCHEMA_VERSION + 1,
      releaseEnv: {},
      target,
    });

    expect(snapshot.artifact?.type).toBe(target.installerArtifactKey);
    expect(snapshot.reinstall?.reason).toBe("launcher-schema");
  });

  it("[P1] adopts the payload on a below-floor outer when no floor is configured", async () => {
    // The default, and the reason a shell-changing release needs the repo-vars
    // pair set deliberately: with no floor published, an outer too old to run
    // the new shell still swallows the new payload, silently.
    const { snapshot } = await checkPackagedUpdate({
      installedOuterVersion: BELOW_FLOOR_OUTER_VERSION,
      releaseEnv: {},
      target,
    });

    expect(snapshot.reinstall).toBeUndefined();
    expect(snapshot.artifact?.type).toBe("payload");
  });
});

describe("packaged installer-reinstall floor publication policy", () => {
  it("[P1] refuses a floor the release cannot satisfy", async () => {
    // publish-metadata/verify-metadata hard-fail here; a floor above the
    // release version would nag every client to reinstall forever.
    await expect(publishableFloor(
      {
        RELEASE_LAUNCHER_VERSION_MIN_STABLE: "0.18.0",
        RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: FLOOR_URL,
      },
      RELEASE_VERSION,
    )).rejects.toThrow(/exceeds release version/);
  });
});
