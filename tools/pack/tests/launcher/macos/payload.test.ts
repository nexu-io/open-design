import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { LAUNCHER_SCHEMA_VERSION } from "@open-design/launcher-proto";
import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";
import { resolveMacInstallIdentity } from "@/mac/identity.js";
import {
  buildMacLauncherPayloadManifest,
  createMacLauncherPayloadArchive,
} from "@/mac/payload.js";
import { resolveMacPaths } from "@/mac/paths.js";

const execFileAsync = promisify(execFile);

function makeMacConfig(root: string, namespace: string, appVersion: string): ToolPackConfig {
  return {
    appVersion,
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "mac",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", namespace),
      },
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

async function expectPathExists(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeUndefined();
}

async function writeFakeMacApp(config: ToolPackConfig): Promise<ReturnType<typeof resolveMacPaths>> {
  const paths = resolveMacPaths(config);
  const identity = resolveMacInstallIdentity(config);
  const resourcesRoot = join(paths.appPath, "Contents", "Resources");
  const executablePath = join(paths.appPath, "Contents", "MacOS", identity.executableName);
  await mkdir(join(paths.appPath, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "bin"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "prebundled", "daemon"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design", "prebundled", "web"), { recursive: true });
  await mkdir(join(resourcesRoot, "open-design-web-standalone"), { recursive: true });
  await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executablePath, 0o755);
  await writeFile(join(resourcesRoot, "open-design", "bin", "node"), "#!/bin/sh\nexit 0\n", "utf8");
  await writeFile(join(resourcesRoot, "open-design", "prebundled", "daemon", "daemon-sidecar.mjs"), "export {};\n", "utf8");
  await writeFile(join(resourcesRoot, "open-design", "prebundled", "web", "web-sidecar.mjs"), "export {};\n", "utf8");
  await writeFile(
    join(resourcesRoot, "open-design-config.json"),
    `${JSON.stringify({
      appVersion: config.appVersion,
      daemonSidecarEntryRelative: "open-design/prebundled/daemon/daemon-sidecar.mjs",
      namespace: config.namespace,
      nodeCommandRelative: "open-design/bin/node",
      webOutputMode: "standalone",
      webSidecarEntryRelative: "open-design/prebundled/web/web-sidecar.mjs",
    }, null, 2)}\n`,
    "utf8",
  );
  return paths;
}

describe("tools-pack mac launcher payload archives", () => {
  it("builds a channel- and namespace-scoped payload manifest", () => {
    const identity = resolveMacInstallIdentity({ appVersion: "0.9.0-beta.2", namespace: "release-beta" });

    expect(buildMacLauncherPayloadManifest({
      channel: "beta",
      executableName: identity.executableName,
      namespace: "release-beta",
      publicAppBundleName: identity.publicAppBundleName,
      version: "0.9.0-beta.2",
    })).toEqual({
      appBundleName: "Open Design Beta.app",
      channel: "beta",
      entry: {
        cwd: "payload/Open Design Beta.app",
        executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      },
      namespace: "release-beta",
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "0.9.0-beta.2",
    });
  });

  it.skipIf(process.platform !== "darwin")("creates a payload zip with bootstrap-readable contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-pack-mac-payload-"));
    try {
      const config = makeMacConfig(root, "release-beta", "0.9.0-beta.2");
      const paths = await writeFakeMacApp(config);
      const archivePath = await createMacLauncherPayloadArchive(config, paths);
      const extractRoot = join(root, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await execFileAsync("ditto", ["-x", "-k", archivePath, extractRoot]);

      const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as {
        appBundleName: string;
        entry: { executable: string };
        version: string;
      };
      expect(manifest.appBundleName).toBe("Open Design Beta.app");
      expect(manifest.entry.executable).toBe("payload/Open Design Beta.app/Contents/MacOS/Open Design Beta");
      expect(manifest.version).toBe("0.9.0-beta.2");
      await expectPathExists(join(extractRoot, manifest.entry.executable));
      await expectPathExists(join(
        extractRoot,
        "payload",
        "Open Design Beta.app",
        "Contents",
        "Resources",
        "open-design-config.json",
      ));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
