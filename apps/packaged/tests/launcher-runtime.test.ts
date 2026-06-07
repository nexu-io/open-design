import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LAUNCHER_SCHEMA_VERSION, resolveLauncherVersionPaths } from "@open-design/launcher-proto";
import { describe, expect, it } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "../src/launcher-runtime.js";
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
    webOutputMode: "server",
    webSidecarEntry: null,
    webStandaloneRoot: null,
  };
}

describe("resolvePackagedLauncherRuntime", () => {
  it("initializes launcher runtime state without replacing the current installed package", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-packaged-launcher-runtime-"));
    try {
      const config = fakeConfig(root);
      const paths = resolvePackagedNamespacePaths(config);

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("current-package");
      expect(runtime.config).toBe(config);
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
      await mkdir(join(resourcesPath, "open-design", "bin"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "daemon"), { recursive: true });
      await mkdir(join(resourcesPath, "prebundled", "web"), { recursive: true });
      await writeFile(join(resourcesPath, "open-design", "bin", "node"), "");
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

      const runtime = await resolvePackagedLauncherRuntime(config, paths);

      expect(runtime.source).toBe("payload");
      expect(runtime.installedLaunchPath).toBe("/Applications/Open Design Beta.app");
      expect(runtime.targetVersion).toBe("1.2.3-beta.5");
      expect(runtime.config.appVersion).toBe("1.2.3-beta.5");
      expect(runtime.config.resourceRoot).toBe(join(resourcesPath, "open-design"));
      expect(runtime.config.daemonSidecarEntry).toBe(join(resourcesPath, "prebundled", "daemon", "daemon-sidecar.mjs"));
      expect(runtime.config.webSidecarEntry).toBe(join(resourcesPath, "prebundled", "web", "web-sidecar.mjs"));
      expect(runtime.config.webStandaloneRoot).toBe(join(resourcesPath, "open-design-web-standalone"));
      expect(runtime.paths.resourceRoot).toBe(join(resourcesPath, "open-design"));
      expect(JSON.parse(await readFile(runtime.launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        channel: "beta",
        generation: 1,
        namespace: config.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version: "1.2.3-beta.5",
      });

      await confirmPackagedLauncherRuntime(runtime);
      await expect(readFile(runtime.launcherPaths.attemptsPath, "utf8")).rejects.toThrow();
      expect(JSON.parse(await readFile(runtime.launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 1, version: "1.2.3-beta.5" },
        lastSuccessful: { generation: 1, version: "1.2.3-beta.5" },
      });
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
});
