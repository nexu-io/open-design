import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const LAUNCHER_SCHEMA_VERSION = 1;
const PACKAGED_SOURCE = "packaged";
const UPDATE_DOWNLOADED = "downloaded";

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
  telemetryRelayUrl: null;
  webOutputMode: "server";
  webSidecarEntry: null;
  webStandaloneRoot: null;
};

type DesktopUpdaterModule = {
  createDesktopUpdater: (config: Record<string, unknown>, deps?: Record<string, unknown>) => {
    checkForUpdates: () => Promise<{
      artifact?: { type?: string };
      availableVersion?: string;
      state: string;
    }>;
    installUpdate: () => Promise<{
      installResult?: { dryRun?: boolean };
      state: string;
    }>;
  };
  DESKTOP_UPDATE_ENV: Record<"CURRENT_VERSION" | "METADATA_URL" | "PLATFORM", string>;
};

type PackagedPaths = {
  installationRoot: string;
  updateRoot: string;
};

type PackagedPathsModule = {
  resolvePackagedNamespacePaths: (config: PackagedConfigLike) => PackagedPaths;
};

type PackagedLauncherRuntime = {
  config: {
    appVersion: string | null;
    resourceRoot: string;
  };
  installedLaunchPath: string | null;
  launcherPaths: {
    attemptsPath: string;
    installPath: string;
    runtimePath: string;
    stateRoot: string;
  };
  selection: {
    pointer?: { generation: number; version: string };
    reason: string;
    selected: boolean;
  };
  source: string;
  targetVersion: string | null;
};

type PackagedLauncherRuntimeModule = {
  confirmPackagedLauncherRuntime: (runtime: PackagedLauncherRuntime) => Promise<void>;
  resolvePackagedLauncherRuntime: (config: PackagedConfigLike, paths: PackagedPaths) => Promise<PackagedLauncherRuntime>;
};

type FixtureServer = {
  close: () => Promise<void>;
  metadataUrl: string;
};

type PlatformCase = {
  arch: "arm64" | "x64";
  currentVersion: string;
  expectedResourceRoot: (root: string, namespace: string) => string;
  fixturePlatformKey: "mac" | "win";
  namespace: "release-beta" | "release-beta-win";
  payloadArchiveName: string;
  payloadPath: string;
  platform: "darwin" | "win32";
  promotedVersion: string;
  writePayload: (destinationRoot: string, namespace: string) => Promise<void>;
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

function fakePackagedConfig(root: string, namespace: PlatformCase["namespace"]): PackagedConfigLike {
  return {
    amrProfile: null,
    appVersion: "1.2.3-beta.4",
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace,
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
        channel: "beta",
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

async function writeExtractedWindowsPayload(destinationRoot: string, namespace: string): Promise<void> {
  await mkdir(join(destinationRoot, "payload", "resources", "open-design", "bin"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", "resources", "prebundled", "daemon"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", "resources", "prebundled", "web"), { recursive: true });
  await writeFile(join(destinationRoot, "payload", "Open Design.exe"), "");
  await writeFile(join(destinationRoot, "payload", "resources", "open-design", "bin", "node.exe"), "");
  await writeFile(join(destinationRoot, "payload", "resources", "prebundled", "daemon", "daemon-sidecar.mjs"), "");
  await writeFile(join(destinationRoot, "payload", "resources", "prebundled", "web", "web-sidecar.mjs"), "");
  await writeFile(
    join(destinationRoot, "payload", "resources", "open-design-config.json"),
    `${JSON.stringify({
      appVersion: "1.2.3-beta.5",
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node.exe",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: "beta",
      entry: { cwd: "payload", executable: "payload/Open Design.exe" },
      namespace,
      payloadRoot: "payload",
      platform: "win32",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "1.2.3-beta.5",
    })}\n`,
  );
}

async function writeExtractedMacPayload(destinationRoot: string, namespace: string): Promise<void> {
  const resourcesRoot = join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "Resources");
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "prebundled", "web"), { recursive: true });
  await mkdir(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "MacOS"), { recursive: true });
  await writeFile(join(destinationRoot, "payload", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta"), "");
  await writeFile(join(resourcesRoot, "open-design", "bin", "node"), "");
  await writeFile(join(resourcesRoot, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
  await writeFile(join(resourcesRoot, "prebundled", "web", "web-sidecar.mjs"), "");
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: "1.2.3-beta.5",
      daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
    })}\n`,
  );
  await writeFile(
    join(destinationRoot, "manifest.json"),
    `${JSON.stringify({
      channel: "beta",
      entry: {
        cwd: "payload/Open Design Beta.app",
        executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      },
      namespace,
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "1.2.3-beta.5",
    })}\n`,
  );
}

const platformCases: PlatformCase[] = [
  {
    arch: "x64",
    currentVersion: "1.2.3-beta.4",
    expectedResourceRoot: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "resources", "open-design"),
    fixturePlatformKey: "win",
    namespace: "release-beta-win",
    payloadArchiveName: "open-design-1.2.3-beta.5-win-x64-payload.7z",
    payloadPath: "/payload.7z",
    platform: "win32",
    promotedVersion: "1.2.3-beta.5",
    writePayload: writeExtractedWindowsPayload,
  },
  {
    arch: "arm64",
    currentVersion: "1.2.3-beta.4",
    expectedResourceRoot: (root, namespace) =>
      join(root, "launcher", "channels", "beta", "namespaces", namespace, "versions", "1.2.3-beta.5", "payload", "Open Design Beta.app", "Contents", "Resources", "open-design"),
    fixturePlatformKey: "mac",
    namespace: "release-beta",
    payloadArchiveName: "open-design-1.2.3-beta.5-mac-arm64-payload.zip",
    payloadPath: "/payload.zip",
    platform: "darwin",
    promotedVersion: "1.2.3-beta.5",
    writePayload: writeExtractedMacPayload,
  },
];

describe("packaged launcher payload update loop", () => {
  it.each(platformCases)(
    "[P2] bridges a full-package beta install into $platform payload updates, bootstrap selection, confirmation, and fallback",
    async (testCase) => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-loop-"));
    const fixture = await createPayloadMetadataFixture(testCase);

    try {
      const { createDesktopUpdater, DESKTOP_UPDATE_ENV } = await loadDesktopUpdaterModule();
      const { resolvePackagedNamespacePaths } = await loadPackagedPathsModule();
      const { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } = await loadPackagedLauncherRuntimeModule();
      const config = fakePackagedConfig(root, testCase.namespace);
      const paths = resolvePackagedNamespacePaths(config);
      const initialRuntime = await resolvePackagedLauncherRuntime(config, paths);
      const launchRequests: Array<{ appPid: number; launchPath: string; root: string }> = [];

      expect(initialRuntime.source).toBe("current-package");
      expect(initialRuntime.targetVersion).toBeNull();
      expect(initialRuntime.installedLaunchPath).toEqual(expect.any(String));
      expect(JSON.parse(await readFile(initialRuntime.launcherPaths.installPath, "utf8"))).toMatchObject({
        channel: "beta",
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
        extractLauncherPayloadArchive: async (input: { destinationRoot: string }) => testCase.writePayload(input.destinationRoot, config.namespace),
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
          launchPath: initialRuntime.installedLaunchPath,
          root: await realpath(paths.updateRoot),
        },
      ]);

      const runtimeAfterApply = JSON.parse(await readFile(initialRuntime.launcherPaths.runtimePath, "utf8")) as {
        active?: { generation: number; version: string };
        lastSuccessful?: { generation: number; version: string };
      };
      expect(runtimeAfterApply.active).toEqual({ generation: 1, version: testCase.promotedVersion });
      expect(runtimeAfterApply.lastSuccessful).toEqual({ generation: 0, version: testCase.currentVersion });

      const promoted = await resolvePackagedLauncherRuntime(config, paths);
      expect(promoted.source).toBe("payload");
      expect(promoted.targetVersion).toBe(testCase.promotedVersion);
      expect(promoted.config.appVersion).toBe(testCase.promotedVersion);
      expect(promoted.config.resourceRoot).toBe(testCase.expectedResourceRoot(paths.installationRoot, config.namespace));
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
          active: { generation: 2, version: "1.2.3-beta.6" },
          channel: "beta",
          lastSuccessful: { generation: 1, version: testCase.promotedVersion },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      await writeFile(
        promoted.launcherPaths.attemptsPath,
        `${JSON.stringify({
          channel: "beta",
          generation: 2,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.6",
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
