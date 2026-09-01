import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherVersionPaths,
  type LauncherDesktopHandoffDescriptor,
} from "@open-design/launcher-proto";
import { describe, expect, it } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import {
  confirmPackagedLauncherRuntime,
  type PackagedLauncherRuntime,
  resolvePackagedLauncherRuntime,
} from "../src/launcher-runtime.js";
import { resolvePackagedNamespacePaths } from "../src/paths.js";

function fakeConfig(root: string, appVersion = "1.2.3-beta.4"): PackagedConfig {
  return {
    amrProfile: null,
    appVersion,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace: "release-beta",
    namespaceBaseRoot: join(root, "namespaces"),
    nodeCommand: null,
    posthogHost: null,
    posthogKey: null,
    resourceRoot: join(root, "installed", "resources", "open-design"),
    telemetryRelayUrl: null,
    updateMetadataUrl: null,
    velaWebUrl: null,
    webOutputMode: "server",
    webSidecarEntry: null,
    webStandaloneRoot: null,
  };
}

async function writeActiveMacPayloadFixture(
  root: string,
  config: PackagedConfig,
  telemetryRelayUrl?: string,
): Promise<void> {
  const version = "1.2.3-beta.5";
  const versionPaths = resolveLauncherVersionPaths({
    channel: "beta",
    namespace: config.namespace,
    root,
    version,
  });
  const appRoot = join(versionPaths.payloadRoot, "Open Design Beta.app");
  const resourcesPath = join(appRoot, "Contents", "Resources");
  await mkdir(join(appRoot, "Contents", "MacOS"), { recursive: true });
  await mkdir(resourcesPath, { recursive: true });
  await writeFile(join(appRoot, "Contents", "MacOS", "Open Design Beta"), "");
  await writeFile(
    join(resourcesPath, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: version,
      ...(telemetryRelayUrl == null ? {} : { telemetryRelayUrl }),
      webOutputMode: "server",
    })}\n`,
  );
  await writeFile(
    versionPaths.manifestPath,
    `${JSON.stringify({
      channel: "beta",
      entry: {
        cwd: "payload/Open Design Beta.app",
        executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      },
      namespace: config.namespace,
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version,
    })}\n`,
  );
  const namespaceRoot = join(
    root,
    "launcher",
    "channels",
    "beta",
    "namespaces",
    config.namespace,
  );
  await mkdir(namespaceRoot, { recursive: true });
  await writeFile(
    join(namespaceRoot, "runtime.json"),
    `${JSON.stringify({
      active: { generation: 1, version },
      channel: "beta",
      lastSuccessful: { generation: 0, version: config.appVersion },
      namespace: config.namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    })}\n`,
  );
}

describe("resolvePackagedLauncherRuntime", () => {
  it.each([
    {
      expected: "https://relay.payload.example/v1",
      name: "uses a payload relay when the historical outer has none",
      outer: null,
      payload: "https://relay.payload.example/v1",
    },
    {
      expected: "https://relay.payload.example/v2",
      name: "lets a payload relay replace the historical outer relay",
      outer: "https://relay.outer.example/v1",
      payload: "https://relay.payload.example/v2",
    },
    {
      expected: "https://relay.outer.example/v1",
      name: "inherits the historical outer relay when the payload omits it",
      outer: "https://relay.outer.example/v1",
      payload: undefined,
    },
    {
      expected: "https://relay.outer.example/v1",
      name: "inherits the historical outer relay when the payload relay is blank",
      outer: "https://relay.outer.example/v1",
      payload: "   ",
    },
  ] as const)("$name", async ({ expected, outer, payload }) => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-relay-"));
    try {
      const config = { ...fakeConfig(root), telemetryRelayUrl: outer };
      const paths = resolvePackagedNamespacePaths(config);
      await writeActiveMacPayloadFixture(root, config, payload);

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("payload");
      expect(runtime.config.telemetryRelayUrl).toBe(expected);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("initializes launcher runtime state without replacing the current installed package", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-runtime-"));
    try {
      const config = fakeConfig(root);
      const paths = resolvePackagedNamespacePaths(config);

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("current-package");
      expect(runtime.config).toBe(config);
      expect(runtime.electronNodeCommand).toBeNull();
      expect(runtime.installedLaunchPath).toEqual(expect.any(String));
      expect(runtime.launcherPaths.runtimePath).toBe(
        join(root, "launcher", "channels", "beta", "namespaces", "release-beta", "runtime.json"),
      );
      expect(JSON.parse(await readFile(runtime.launcherPaths.installPath, "utf8"))).toMatchObject({
        channel: "beta",
        launchPath: runtime.installedLaunchPath,
        namespace: "release-beta",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      });
      expect(JSON.parse(await readFile(runtime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.2.3-beta.4" },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
        namespace: "release-beta",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses the active launcher payload when runtime state and payload manifest are valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-payload-"));
    try {
      const config = fakeConfig(root, "1.2.3-beta.4");
      const paths = resolvePackagedNamespacePaths(config);
      const versionPaths = resolveLauncherVersionPaths({
        channel: "beta",
        namespace: config.namespace,
        root,
        version: "1.2.3-beta.5",
      });
      const resourcesPath = join(versionPaths.payloadRoot, "Open Design Beta.app", "Contents", "Resources");
      const payloadExecutablePath = join(
        versionPaths.payloadRoot,
        "Open Design Beta.app",
        "Contents",
        "MacOS",
        "Open Design Beta",
      );
      await mkdir(join(resourcesPath, "open-design", "bin"), { recursive: true });
      await mkdir(join(versionPaths.payloadRoot, "Open Design Beta.app", "Contents", "MacOS"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "daemon"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "web"), { recursive: true });
      await writeFile(join(resourcesPath, "open-design", "bin", "node"), "");
      await writeFile(payloadExecutablePath, "");
      await writeFile(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
      await writeFile(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"), "");
      await writeFile(
        join(resourcesPath, "open-design-config.json"),
        `${JSON.stringify({
          appVersion: "1.2.3-beta.5",
          daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
          nodeCommandRelative: "open-design/bin/node",
          webOutputMode: "standalone",
          webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
        })}\n`,
      );
      await writeFile(
        versionPaths.manifestPath,
        `${JSON.stringify({
          channel: "beta",
          entry: {
            cwd: "payload/Open Design Beta.app",
            executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
          },
          namespace: config.namespace,
          payloadRoot: "payload",
          platform: "darwin",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.5",
        })}\n`,
      );
      await mkdir(join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace), { recursive: true });
      await writeFile(
        join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace, "runtime.json"),
        `${JSON.stringify({
          active: { generation: 1, version: "1.2.3-beta.5" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      await writeFile(
        join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace, "install.json"),
        `${JSON.stringify({
          channel: "beta",
          launchPath: "/Applications/Open Design Beta.app",
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );

      const runtime = await resolvePackagedLauncherRuntime(config, paths, {
        // The launcher process runs from the stable installed app bundle, so
        // its stable launch path matches the persisted install descriptor and
        // the payload branch keeps the persisted entry untouched.
        currentExecutablePath: "/Applications/Open Design Beta.app",
      });

      expect(runtime.source).toBe("payload");
      expect(runtime.desktopExecutablePath).toBe(payloadExecutablePath);
      expect(runtime.electronNodeCommand).toBeNull();
      expect(runtime.installedLaunchPath).toBe("/Applications/Open Design Beta.app");
      expect(runtime.targetVersion).toBe("1.2.3-beta.5");
      expect(runtime.config.appVersion).toBe("1.2.3-beta.5");
      expect(runtime.config.resourceRoot).toBe(join(resourcesPath, "open-design"));
      expect(runtime.config.daemonSidecarEntry).toBe(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"));
      expect(runtime.config.webSidecarEntry).toBe(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"));
      expect(runtime.config.webStandaloneRoot).toBe(join(resourcesPath, "open-design-web-standalone"));
      expect(runtime.paths.resourceRoot).toBe(join(resourcesPath, "open-design"));
      await expect(readFile(runtime.launcherPaths.attemptsPath, "utf8")).rejects.toThrow();

      const payloadRuntime = await resolvePackagedLauncherRuntime(config, paths, {
        currentExecutablePath: payloadExecutablePath,
      });
      expect(payloadRuntime.selection.reason).toBe("active");
      expect(JSON.parse(await readFile(payloadRuntime.launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: config.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version: "1.2.3-beta.5",
      });

      const handoff: LauncherDesktopHandoffDescriptor = {
        channel: "beta",
        createdAt: "2026-07-15T01:00:00.000Z",
        handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
        namespace: config.namespace,
        outer: {
          executablePath: process.execPath,
          pid: process.pid,
        },
        payloadExecutablePath,
        previous: { generation: 0, version: "1.2.3-beta.4" },
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        source: { generation: 1, version: "1.2.3-beta.5" },
        state: "armed",
        target: { generation: 1, version: "1.2.3-beta.5" },
        updatedAt: "2026-07-15T01:00:00.000Z",
      };
      await writeFile(payloadRuntime.launcherPaths.handoffPath, `${JSON.stringify(handoff)}\n`);

      const resumedRuntime = await resolvePackagedLauncherRuntime(config, paths, {
        currentExecutablePath: payloadExecutablePath,
        resume: { handoffId: handoff.handoffId },
      });
      expect(resumedRuntime.selection.reason).toBe("active-resume");

      await confirmPackagedLauncherRuntime(resumedRuntime);
      await expect(readFile(resumedRuntime.launcherPaths.attemptsPath, "utf8")).rejects.toThrow();
      expect(JSON.parse(await readFile(resumedRuntime.launcherPaths.handoffPath, "utf8"))).toMatchObject({
        previous: { generation: 0, version: "1.2.3-beta.4" },
        source: { generation: 1, version: "1.2.3-beta.5" },
        state: "confirmed",
        target: { generation: 1, version: "1.2.3-beta.5" },
      });
      expect(JSON.parse(await readFile(resumedRuntime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 1, version: "1.2.3-beta.5" },
        lastSuccessful: { generation: 1, version: "1.2.3-beta.5" },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("refreshes install.json launchPath to the current launcher executable when the persisted path is stale", async () => {
    // Issue #6494: the payload branch only READ the persisted install.json
    // launchPath (written by the cold-start current-package branch) and never
    // refreshed it, so after an update that moved the launcher executable
    // (0.17.0 Local\Programs\... → 0.18.0 launcher payload), the stale path
    // kept flowing into OD_MCP_BOOTSTRAP_COMMAND and /api/mcp/install-info.
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-install-refresh-"));
    try {
      const config = fakeConfig(root, "1.2.3-beta.4");
      const paths = resolvePackagedNamespacePaths(config);
      const versionPaths = resolveLauncherVersionPaths({
        channel: "beta",
        namespace: config.namespace,
        root,
        version: "1.2.3-beta.5",
      });
      const resourcesPath = join(versionPaths.payloadRoot, "Open Design Beta.app", "Contents", "Resources");
      const payloadExecutablePath = join(
        versionPaths.payloadRoot,
        "Open Design Beta.app",
        "Contents",
        "MacOS",
        "Open Design Beta",
      );
      await mkdir(join(resourcesPath, "open-design", "bin"), { recursive: true });
      await mkdir(join(versionPaths.payloadRoot, "Open Design Beta.app", "Contents", "MacOS"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "daemon"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "web"), { recursive: true });
      await writeFile(join(resourcesPath, "open-design", "bin", "node"), "");
      await writeFile(payloadExecutablePath, "");
      await writeFile(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
      await writeFile(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"), "");
      await writeFile(
        join(resourcesPath, "open-design-config.json"),
        `${JSON.stringify({
          appVersion: "1.2.3-beta.5",
          daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
          nodeCommandRelative: "open-design/bin/node",
          webOutputMode: "standalone",
          webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
        })}\n`,
      );
      await writeFile(
        versionPaths.manifestPath,
        `${JSON.stringify({
          channel: "beta",
          entry: {
            cwd: "payload/Open Design Beta.app",
            executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
          },
          namespace: config.namespace,
          payloadRoot: "payload",
          platform: "darwin",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.5",
        })}\n`,
      );
      await mkdir(join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace), { recursive: true });
      await writeFile(
        join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace, "runtime.json"),
        `${JSON.stringify({
          active: { generation: 1, version: "1.2.3-beta.5" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      // The persisted descriptor points at the previous install location
      // (e.g. the 0.17.0 Local\Programs\... exe), which no longer matches
      // the launcher executable that resolved this payload.
      const installPath = join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace, "install.json");
      await writeFile(
        installPath,
        `${JSON.stringify({
          channel: "beta",
          launchPath: "/Applications/Open Design Legacy.app",
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );

      const runtime = await resolvePackagedLauncherRuntime(config, paths, {
        currentExecutablePath: "/Applications/Open Design Beta.app",
      });

      expect(runtime.source).toBe("payload");
      expect(runtime.payloadDesktopProcess).toBe(false);
      expect(runtime.installedLaunchPath).toBe("/Applications/Open Design Beta.app");
      expect(JSON.parse(await readFile(installPath, "utf8"))).toMatchObject({
        channel: "beta",
        launchPath: "/Applications/Open Design Beta.app",
        namespace: config.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("refreshes a confirmed handoff with the current last-successful payload before advancing", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-handoff-refresh-"));
    try {
      const config = fakeConfig(root);
      const paths = resolvePackagedNamespacePaths(config);
      const currentPackageRuntime = await resolvePackagedLauncherRuntime(config, paths);
      const firstPayload = { generation: 1, version: "1.2.3-beta.5" };
      const secondPayload = { generation: 2, version: "1.2.3-beta.6" };
      const secondPayloadExecutablePath = join(
        root,
        "launcher",
        "channels",
        "beta",
        "namespaces",
        config.namespace,
        "versions",
        secondPayload.version,
        "payload",
        "Open Design Beta.app",
        "Contents",
        "MacOS",
        "Open Design Beta",
      );
      await mkdir(currentPackageRuntime.launcherPaths.stateRoot, { recursive: true });
      await writeFile(
        currentPackageRuntime.launcherPaths.handoffPath,
        `${JSON.stringify({
          channel: "beta",
          createdAt: "2026-07-15T01:00:00.000Z",
          handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
          namespace: config.namespace,
          outer: {
            executablePath: process.execPath,
            pid: process.pid,
          },
          payloadExecutablePath: join(root, "payload-v1"),
          previous: { generation: 0, version: "1.2.3-beta.4" },
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          source: firstPayload,
          state: "confirmed",
          target: firstPayload,
          updatedAt: "2026-07-15T02:00:00.000Z",
        } satisfies LauncherDesktopHandoffDescriptor)}\n`,
      );
      const secondPayloadRuntime = {
        ...currentPackageRuntime,
        desktopExecutablePath: secondPayloadExecutablePath,
        descriptor: {
          ...currentPackageRuntime.descriptor,
          active: secondPayload,
          lastSuccessful: firstPayload,
        },
        payloadDesktopProcess: true,
        selection: {
          pointer: secondPayload,
          reason: "active",
          selected: true,
        },
        source: "payload",
        targetVersion: secondPayload.version,
      } satisfies PackagedLauncherRuntime;

      await confirmPackagedLauncherRuntime(secondPayloadRuntime);

      expect(JSON.parse(
        await readFile(secondPayloadRuntime.launcherPaths.handoffPath, "utf8"),
      )).toMatchObject({
        previous: firstPayload,
        source: secondPayload,
        state: "confirmed",
        target: secondPayload,
      });

      await confirmPackagedLauncherRuntime({
        ...secondPayloadRuntime,
        descriptor: {
          ...secondPayloadRuntime.descriptor,
          lastSuccessful: secondPayload,
        },
      });
      expect(JSON.parse(
        await readFile(secondPayloadRuntime.launcherPaths.handoffPath, "utf8"),
      )).toMatchObject({
        previous: firstPayload,
        source: secondPayload,
        state: "confirmed",
        target: secondPayload,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses the Windows payload executable as the Electron-as-Node command when payload Node is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-win-payload-"));
    try {
      const config = fakeConfig(root, "1.2.3-beta.4");
      const paths = resolvePackagedNamespacePaths(config);
      const versionPaths = resolveLauncherVersionPaths({
        channel: "beta",
        namespace: config.namespace,
        root,
        version: "1.2.3-beta.5",
      });
      const resourcesPath = join(versionPaths.versionRoot, "payload", "resources");
      const payloadExePath = join(versionPaths.versionRoot, "payload", "Open Design.exe");
      const webStandaloneRoot = join(resourcesPath, "open-design-web-standalone");
      await mkdir(join(resourcesPath, "prebundled", "daemon"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "web"), { recursive: true });
      await mkdir(webStandaloneRoot, { recursive: true });
      await mkdir(join(versionPaths.versionRoot, "payload"), { recursive: true });
      await writeFile(payloadExePath, "");
      await writeFile(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"), "");
      await writeFile(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"), "");
      await writeFile(
        join(resourcesPath, "open-design-config.json"),
        `${JSON.stringify({
          appVersion: "1.2.3-beta.5",
          daemonSidecarEntryRelative: "prebundled/daemon/daemon-sidecar.mjs",
          webOutputMode: "standalone",
          webSidecarEntryRelative: "prebundled/web/web-sidecar.mjs",
        })}\n`,
      );
      await writeFile(
        versionPaths.manifestPath,
        `${JSON.stringify({
          channel: "beta",
          entry: {
            cwd: "payload",
            executable: "payload/Open Design.exe",
          },
          namespace: config.namespace,
          payloadRoot: "payload",
          platform: "win32",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.5",
        })}\n`,
      );
      await mkdir(join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace), { recursive: true });
      await writeFile(
        join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace, "runtime.json"),
        `${JSON.stringify({
          active: { generation: 1, version: "1.2.3-beta.5" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("payload");
      expect(runtime.config.nodeCommand).toBeNull();
      if (process.platform === "win32") {
        expect(runtime.electronNodeCommand).not.toBe(payloadExePath);
        expect(runtime.electronNodeCommand).toContain(`${sep}en${sep}`);
        await expect(readFile(runtime.electronNodeCommand ?? "", "utf8")).resolves.toBe("");
        expect(runtime.config.webStandaloneRoot).not.toBe(webStandaloneRoot);
        expect(runtime.config.webStandaloneRoot).toContain(`${sep}ws${sep}`);
      } else {
        expect(runtime.electronNodeCommand).toBe(payloadExePath);
        expect(runtime.config.webStandaloneRoot).toBe(webStandaloneRoot);
      }
      expect(runtime.config.daemonSidecarEntry).toBe(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"));
      expect(runtime.config.webSidecarEntry).toBe(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("falls back to lastSuccessful when the active payload attempt was not confirmed", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-fallback-"));
    try {
      const config = fakeConfig(root, "1.2.3-beta.4");
      const paths = resolvePackagedNamespacePaths(config);
      const namespaceRoot = join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace);
      await mkdir(join(namespaceRoot, "state"), { recursive: true });
      await writeFile(
        join(namespaceRoot, "runtime.json"),
        `${JSON.stringify({
          active: { generation: 1, version: "1.2.3-beta.5" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      await writeFile(
        join(namespaceRoot, "state", "attempt.json"),
        `${JSON.stringify({
          channel: "beta",
          generation: 1,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.5",
        })}\n`,
      );

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.selection).toMatchObject({
        pointer: { generation: 0, version: "1.2.3-beta.4" },
        reason: "last-successful",
        selected: true,
      });
      expect(runtime.source).toBe("current-package");
      expect(runtime.config.appVersion).toBe("1.2.3-beta.4");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("lets a newer installed package supersede stale persisted payload runtime state before target selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-installed-newer-"));
    try {
      const config = fakeConfig(root, "1.2.3-beta.6");
      const paths = resolvePackagedNamespacePaths(config);
      const namespaceRoot = join(paths.installationRoot, "launcher", "channels", "beta", "namespaces", config.namespace);
      await mkdir(join(namespaceRoot, "state"), { recursive: true });
      await writeFile(
        join(namespaceRoot, "runtime.json"),
        `${JSON.stringify({
          active: { generation: 1, version: "1.2.3-beta.5" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
        })}\n`,
      );
      await writeFile(
        join(namespaceRoot, "state", "attempt.json"),
        `${JSON.stringify({
          channel: "beta",
          generation: 1,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "1.2.3-beta.5",
        })}\n`,
      );

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("current-package");
      expect(runtime.config.appVersion).toBe("1.2.3-beta.6");
      expect(JSON.parse(await readFile(runtime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "1.2.3-beta.6" },
        lastSuccessful: { generation: 0, version: "1.2.3-beta.6" },
      });
      await expect(readFile(runtime.launcherPaths.attemptsPath, "utf8")).rejects.toThrow();
      expect(JSON.parse(await readFile(runtime.launcherPaths.cleanupPath, "utf8"))).toMatchObject({
        currentVersion: "1.2.3-beta.6",
        versions: expect.arrayContaining([
          expect.objectContaining({ reason: "older-than-bound-package", state: "deprecated", version: "1.2.3-beta.5" }),
          expect.objectContaining({ reason: "older-than-bound-package", state: "deprecated", version: "1.2.3-beta.4" }),
          expect.objectContaining({ reason: "current-bound-package", state: "retained", version: "1.2.3-beta.6" }),
        ]),
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
