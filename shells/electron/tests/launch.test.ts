import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {},
}));

import { PackagedPathAccessError } from "../src/errors.js";
import { inspectExistingDesktopForLauncher } from "../src/launcher-after-quit.js";
import {
  claimPackagedSingleInstanceLock,
  createPackagedSecondInstanceHandoff,
  stabilizePackagedWorkingDirectory,
  verifyPackagedDataRootWritable,
} from "../src/launch.js";
import type { PackagedNamespacePaths } from "../src/paths.js";
import { findPackagedDeeplinkArg } from "../src/payload-desktop-launch.js";

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
    installationRoot: root,
    installerObservationRoot: join(root, "data", "observations", "installer"),
    logsRoot: join(root, "logs"),
    namespaceRoot: root,
    resourceRoot: join(root, "resources", "open-design"),
    runtimeRoot: join(root, "runtime"),
    updateRoot: join(root, "updates"),
    webIdentityPath: join(root, "runtime", "web-root.json"),
  };
}

describe("stabilizePackagedWorkingDirectory", () => {
  it("switches to the namespace runtime root without reading the inherited cwd", () => {
    const runtimeRoot = join(tmpdir(), "od-packaged-runtime");
    const chdir = vi.fn();
    const cwd = vi.spyOn(process, "cwd").mockImplementation(() => {
      throw new Error("uv_cwd");
    });

    try {
      stabilizePackagedWorkingDirectory({ runtimeRoot }, chdir);

      expect(chdir).toHaveBeenCalledWith(runtimeRoot);
      expect(cwd).not.toHaveBeenCalled();
    } finally {
      cwd.mockRestore();
    }
  });
});

describe("packaged startup ordering", () => {
  it("projects the sidecar namespace before entering Standalone Closure", () => {
    const source = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8");
    const projectEnvironment = source.indexOf("applyLaunchEnv(paths.runtimeRoot, stamp);");
    const enterStandalone = source.indexOf("withStandaloneBootstrapEnvironment({");

    expect(projectEnvironment).toBeGreaterThanOrEqual(0);
    expect(enterStandalone).toBeGreaterThan(projectEnvironment);
    expect(source.match(/applyLaunchEnv\(paths\.runtimeRoot, stamp\);/gu)).toHaveLength(1);
  });
});

describe("verifyPackagedDataRootWritable", () => {
  it("accepts a writable dataRoot", async () => {
    const root = mkdtempSync(join(tmpdir(), "od-packaged-launch-"));
    try {
      const dataRoot = join(root, "namespaces", "release-beta", "data");
      await expect(verifyPackagedDataRootWritable({ dataRoot })).resolves.toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("wraps low-level mkdir/access failures with a user-actionable error", async () => {
    const root = mkdtempSync(join(tmpdir(), "od-packaged-launch-"));
    try {
      const blocker = join(root, "namespaces", "release-beta");
      mkdirSync(blocker, { recursive: true });
      writeFileSync(join(blocker, "data"), "not a directory");

      let captured: unknown;
      try {
        await verifyPackagedDataRootWritable({ dataRoot: join(blocker, "data") });
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeInstanceOf(PackagedPathAccessError);
      expect((captured as Error).message).toContain("Open Design could not create or write to:");
      expect((captured as Error).message).toContain(join(blocker, "data"));
      expect((captured as Error).message).toContain("Current user:");
      expect((captured as Error).message).toContain("Try in Terminal:");
      expect((captured as Error).message).toContain("sudo chown -R");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("claimPackagedSingleInstanceLock", () => {
  it("registers a second-instance focus callback when the lock is acquired", () => {
    const listeners = new Map<string, (event: unknown, argv: string[]) => void>();
    const app = {
      on: vi.fn((event: string, listener: (event: unknown, argv: string[]) => void) => {
        listeners.set(event, listener);
        return app;
      }),
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
    };
    const focusExisting = vi.fn();

    expect(claimPackagedSingleInstanceLock(app, focusExisting)).toBe(true);
    listeners.get("second-instance")?.({}, ["Open Design.exe", "--from-protocol"]);

    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(app.on).toHaveBeenCalledWith("second-instance", expect.any(Function));
    expect(app.quit).not.toHaveBeenCalled();
    expect(focusExisting).toHaveBeenCalledExactlyOnceWith([
      "Open Design.exe",
      "--from-protocol",
    ]);
  });

  it("queues a deeplink from the lock fallback while desktop IPC is unavailable", async () => {
    const root = mkdtempSync(join(tmpdir(), "od-packaged-lock-deeplink-"));
    const listeners = new Map<string, (event: unknown, argv: string[]) => void>();
    const deeplinkUrl = "opendesign://workspace/invite/continue?nonce=cold-race";
    const handoff = createPackagedSecondInstanceHandoff();
    const app = {
      on: vi.fn((event: string, listener: (event: unknown, argv: string[]) => void) => {
        listeners.set(event, listener);
        return app;
      }),
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
    };
    const dispatchDeeplink = vi.fn();
    const show = vi.fn();

    try {
      await expect(inspectExistingDesktopForLauncher("release-beta-win", {
        deeplinkUrl,
        paths: fakePaths(root),
        requestIpc: vi.fn(async () => {
          throw new Error("desktop IPC is not ready");
        }),
      })).resolves.toEqual({ action: "continue", reason: "inspect-failed" });

      expect(claimPackagedSingleInstanceLock(app, (argv) => {
        handoff.handle(findPackagedDeeplinkArg(argv));
      })).toBe(true);
      listeners.get("second-instance")?.({}, ["Open Design.exe", deeplinkUrl]);

      expect(show).not.toHaveBeenCalled();
      expect(dispatchDeeplink).not.toHaveBeenCalled();

      handoff.attach({ dispatchDeeplink, show });

      expect(show).toHaveBeenCalledTimes(1);
      expect(dispatchDeeplink).toHaveBeenCalledExactlyOnceWith(deeplinkUrl);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("quits the duplicate process before packaged sidecars start when the lock is held", () => {
    const app = {
      on: vi.fn(),
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => false),
    };

    expect(claimPackagedSingleInstanceLock(app, vi.fn())).toBe(false);

    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.on).not.toHaveBeenCalled();
  });
});
