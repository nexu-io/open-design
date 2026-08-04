import { describe, expect, it } from "vitest";

import {
  SERVER_DAEMON_CHUNK_NAMES,
  SERVER_DAEMON_EXTERNALS,
  assertServerDaemonMetafile,
  renderServerDaemonEntrypoint,
  renderServerDeployHashProbe,
} from "../src/server/bundle.js";
import {
  renderPosixServerLauncher,
  renderWindowsServerLauncher,
} from "../src/server/build.js";
import { resolveServerPackConfig } from "../src/server/config.js";

describe("server daemon bundle", () => {
  it("keeps native and WASM dependencies external with flat split chunks", () => {
    expect(SERVER_DAEMON_EXTERNALS).toEqual([
      "better-sqlite3",
      "blake3-wasm",
      "fsevents",
      "node-pty",
    ]);
    expect(SERVER_DAEMON_CHUNK_NAMES).toBe("[name]-[hash]");
  });

  it("sets stable daemon entrypoint environment before loading the CLI", () => {
    const source = renderServerDaemonEntrypoint("../compiled/cli.js");

    expect(source).toContain("OD_BIN");
    expect(source).toContain("OD_DAEMON_CLI_PATH");
    expect(source).toContain('await import("../compiled/cli.js")');
  });

  it("renders an archive-local probe through the product deploy hash path", () => {
    const source = renderServerDeployHashProbe("../compiled/deploy.js");

    expect(source).toContain("cloudflarePagesAssetHash");
    expect(source).toContain('file: "index.html"');
    expect(source).toContain("/^[0-9a-f]{32}$/");
  });

  it("rejects a metafile that bundled node-pty", () => {
    expect(() =>
      assertServerDaemonMetafile({
        inputs: {
          "/repo/node_modules/node-pty/lib/index.js": {
            bytes: 1,
            imports: [],
          },
        },
        outputs: {},
      }),
    ).toThrow(/server daemon bundle included forbidden inputs/);
  });

  it("renders a Windows launcher that accepts system Node 24 before falling back", () => {
    const config = resolveServerPackConfig({
      appVersion: "1.2.3",
      arch: "x64",
      dir: "C:\\pack",
      platform: "win32",
      releaseId: "release-1",
      workspaceRoot: process.cwd(),
    });
    const launcher = renderWindowsServerLauncher(config);

    expect(launcher).toContain(
      "node -p \"process.versions.node.split('.')[0] + ' ' + process.platform + '-' + process.arch\"",
    );
    expect(launcher).toContain('"%%V"=="24 win32-x64"');
    expect(launcher).toContain("if defined OD_SELECTED_NODE goto node_ready");
    expect(launcher).toContain(
      "node-v24.14.1-win32-x64\\node.exe",
    );
    expect(launcher).toContain(
      'set "OD_INSTALLATION_DIR=%OD_INSTALL_ROOT%"',
    );
  });

  it("requires a platform and architecture match before using system Node", () => {
    const config = resolveServerPackConfig({
      appVersion: "1.2.3",
      arch: "arm64",
      dir: "/tmp/pack",
      platform: "darwin",
      releaseId: "release-1",
      workspaceRoot: process.cwd(),
    });
    const launcher = renderPosixServerLauncher(config);

    expect(launcher).toContain("process.platform");
    expect(launcher).toContain("process.arch");
    expect(launcher).toContain('"24 darwin-arm64"');
  });
});
