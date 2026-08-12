import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const appPath = vi.hoisted(() => ({ current: "" }));
const userDataPath = vi.hoisted(() => ({ current: "" }));

vi.mock("electron", () => ({
  app: {
    getAppPath: () => appPath.current,
    getPath: (name: string) => {
      if (name !== "userData") throw new Error(`unexpected Electron path: ${name}`);
      return userDataPath.current;
    },
  },
}));

import { PACKAGED_CONFIG_PATH_ENV, readPackagedConfig } from "../src/config.js";

const roots: string[] = [];
const originalExplicitConfig = process.env[PACKAGED_CONFIG_PATH_ENV];
const originalResourcesPath = process.resourcesPath;

afterEach(async () => {
  if (originalExplicitConfig == null) delete process.env[PACKAGED_CONFIG_PATH_ENV];
  else process.env[PACKAGED_CONFIG_PATH_ENV] = originalExplicitConfig;
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: originalResourcesPath,
  });
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("packaged config cold-launch routing", () => {
  it("reuses the caller projection when a later OS launch has no environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-config-cold-launch-"));
    roots.push(root);
    appPath.current = join(root, "app");
    userDataPath.current = join(root, "electron-user-data");
    const resourcesRoot = join(root, "resources");
    const namespaceBaseRoot = join(root, "tools-pack-runtime", "namespaces");
    const explicitPath = join(root, "external-config.json");
    const embedded = {
      namespace: "embedded-default",
      shellVersion: "0.19.0-beta.23",
      webOutputMode: "standalone",
    };
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: resourcesRoot,
    });
    await writeFile(explicitPath, JSON.stringify({
      ...embedded,
      namespace: "release-beta-x64",
      namespaceBaseRoot,
      releaseVersion: "0.19.0-beta.23",
    }), "utf8");
    await mkdir(resourcesRoot, { recursive: true });
    await writeFile(join(resourcesRoot, "open-design-config.json"), JSON.stringify(embedded), "utf8");

    process.env[PACKAGED_CONFIG_PATH_ENV] = explicitPath;
    const attached = await readPackagedConfig();
    expect(attached.namespace).toBe("release-beta-x64");
    expect(attached.namespaceBaseRoot).toBe(namespaceBaseRoot);

    delete process.env[PACKAGED_CONFIG_PATH_ENV];
    const cold = await readPackagedConfig();
    expect(cold.namespace).toBe("release-beta-x64");
    expect(cold.namespaceBaseRoot).toBe(namespaceBaseRoot);
    expect(cold.shellVersion).toBe("0.19.0-beta.23");
    expect(cold.webOutputMode).toBe("standalone");
  });
});
