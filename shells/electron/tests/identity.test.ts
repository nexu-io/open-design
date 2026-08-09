import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import { resolveAppIpcPath } from "@open-design/sidecar";
import { describe, expect, it } from "vitest";

import {
  createElectronStandaloneRuntimeIdentity,
  writePackagedDesktopIdentity,
} from "../src/identity.js";
import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
} from "@open-design/standalone-proto";
import type { PackagedNamespacePaths } from "../src/paths.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function fakePaths(root: string): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    desktopIdentityPath: join(root, "runtime", "desktop-root.json"),
    desktopLogPath: join(root, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(root, "logs", "desktop"),
    electronSessionDataRoot: join(root, "user-data", "session"),
    electronUserDataRoot: join(root, "user-data"),
    standaloneIdentityPath: join(root, "runtime", "standalone-root.json"),
    installationRoot: join(root, ".."),
    installerObservationRoot: join(root, "data", "observations", "installer"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

describe("packaged identity markers", () => {
  it("can write and close the desktop identity shape at the standalone marker path", async () => {
    const root = join(tmpdir(), `od-packaged-identity-${process.pid}-${Date.now()}`);
    const paths = fakePaths(root);
    const stamp = {
      app: APP_KEYS.DESKTOP,
      ipc: resolveAppIpcPath({
        app: APP_KEYS.DESKTOP,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        namespace: "default",
      }),
      mode: SIDECAR_MODES.RUNTIME,
      namespace: "default",
      source: SIDECAR_SOURCES.PACKAGED,
    };

    try {
      const handle = await writePackagedDesktopIdentity({
        identityPath: paths.standaloneIdentityPath,
        paths,
        stamp,
      });

      expect(await pathExists(paths.standaloneIdentityPath)).toBe(true);
      expect(await pathExists(paths.desktopIdentityPath)).toBe(false);

      const handoff = createStandaloneHandoffEnvelope({
        descriptor: {
          release: { version: "0.18.0-beta.4" },
          standalone: {
            digest: `sha256:${"b".repeat(64)}`,
            protocolVersion: STANDALONE_PROTOCOL_VERSION,
            version: "0.18.0-beta.4",
          },
        },
        scope: { channel: "beta", generation: 2, namespace: "release-beta" },
      });
      await handle.updateRuntimeIdentity(createElectronStandaloneRuntimeIdentity(handoff, {
        daemonUrl: "http://127.0.0.1:4100",
        handoff,
        pid: 42,
        schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        state: "running",
        webUrl: "http://127.0.0.1:4200",
      }));
      expect(JSON.parse(await readFile(paths.standaloneIdentityPath, "utf8"))).toMatchObject({
        runtime: {
          descriptor: {
            release: { version: "0.18.0-beta.4" },
            standalone: { version: "0.18.0-beta.4" },
          },
          endpoints: {
            daemonUrl: "http://127.0.0.1:4100",
            webUrl: "http://127.0.0.1:4200",
          },
          generation: 2,
          standalonePid: 42,
        },
      });

      await handle.close();
      expect(await pathExists(paths.standaloneIdentityPath)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
