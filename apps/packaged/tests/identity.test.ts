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

import { writePackagedDesktopIdentity } from "../src/identity.js";
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
    headlessIdentityPath: join(root, "runtime", "headless-root.json"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources"),
    runtimeRoot: join(root, "runtime"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

describe("packaged identity markers", () => {
  it("can write and close the desktop identity shape at the headless marker path", async () => {
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
        identityPath: paths.headlessIdentityPath,
        paths,
        stamp,
      });

      expect(await pathExists(paths.headlessIdentityPath)).toBe(true);
      expect(await pathExists(paths.desktopIdentityPath)).toBe(false);

      await handle.close();
      expect(await pathExists(paths.headlessIdentityPath)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
