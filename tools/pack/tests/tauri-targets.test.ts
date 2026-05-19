import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { packLinux } from "../src/linux.js";
import { packWin } from "../src/win/build.js";

function makeConfig(platform: "win" | "linux", to: ToolPackConfig["to"]): ToolPackConfig {
  const root = join(process.cwd(), ".tmp", "tools-pack-tauri-targets-test");
  const namespace = `${platform}-tauri-dir`;
  return {
    containerized: false,
    desktopRuntime: "tauri",
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform,
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, "out", platform, "namespaces", namespace, "builder"),
        namespaceRoot: join(root, "out", platform, "namespaces", namespace),
        platformRoot: join(root, "out", platform),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", platform, "namespaces"),
        namespaceRoot: join(root, "runtime", platform, "namespaces", namespace),
      },
      cacheRoot: join(root, "cache"),
      toolPackRoot: root,
    },
    silent: true,
    signed: false,
    tauriCliPath: "/x/tauri/main.js",
    tauriConfigPath: join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"),
    to,
    webOutputMode: "server",
    workspaceRoot: root,
  };
}

describe("Tauri bundle target policy", () => {
  it("keeps the Windows unpacked directory target Electron-only", async () => {
    await expect(packWin(makeConfig("win", "dir"))).rejects.toThrow(
      /--desktop-runtime tauri --to dir is not supported by Tauri.*--to nsis.*--desktop-runtime electron/,
    );
  });

  it("keeps the Linux unpacked directory target Electron-only", async () => {
    await expect(packLinux(makeConfig("linux", "dir"))).rejects.toThrow(
      /--desktop-runtime tauri --to dir is not supported by Tauri.*--to appimage.*--desktop-runtime electron/,
    );
  });
});
