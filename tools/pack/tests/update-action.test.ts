import {
  APP_KEYS,
  DESKTOP_UPDATE_ACTIONS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJsonIpc = vi.hoisted(() => vi.fn());

vi.mock("@open-design/sidecar", () => ({ requestJsonIpc }));

const { requestDesktopUpdateAction } = await import("../src/update-action.js");

const stamp = {
  app: APP_KEYS.DESKTOP,
  ipc: "/tmp/open-design/desktop.sock",
  mode: SIDECAR_MODES.RUNTIME,
  namespace: "release-beta",
  source: SIDECAR_SOURCES.TOOLS_PACK,
} satisfies SidecarStamp;

describe("requestDesktopUpdateAction", () => {
  beforeEach(() => {
    requestJsonIpc.mockReset();
  });

  it("requests graceful Shell shutdown after a real install prepares deferred handoff", async () => {
    const installed = {
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      currentVersion: "0.19.0-beta.1",
      enabled: true,
      installResult: {
        activeVersion: "0.19.0-beta.2",
        dryRun: false,
        openedAt: new Date(0).toISOString(),
        path: "/tmp/payload.zip",
      },
      mode: "package-launcher",
      state: "downloaded",
      supported: true,
    };
    requestJsonIpc
      .mockResolvedValueOnce(installed)
      .mockResolvedValueOnce(undefined);

    await expect(requestDesktopUpdateAction(stamp, DESKTOP_UPDATE_ACTIONS.INSTALL)).resolves.toBe(installed);
    expect(requestJsonIpc).toHaveBeenNthCalledWith(
      1,
      stamp.ipc,
      { input: { action: DESKTOP_UPDATE_ACTIONS.INSTALL }, type: SIDECAR_MESSAGES.UPDATE },
      { timeoutMs: 10 * 60 * 1000 },
    );
    expect(requestJsonIpc).toHaveBeenNthCalledWith(
      2,
      stamp.ipc,
      { type: SIDECAR_MESSAGES.SHUTDOWN },
      { timeoutMs: 2000 },
    );
  });

  it("keeps dry-run installs alive for inspection", async () => {
    const installed = {
      installResult: {
        dryRun: true,
        openedAt: new Date(0).toISOString(),
        path: "/tmp/payload.zip",
      },
    };
    requestJsonIpc.mockResolvedValueOnce(installed);

    await expect(requestDesktopUpdateAction(stamp, DESKTOP_UPDATE_ACTIONS.INSTALL)).resolves.toBe(installed);
    expect(requestJsonIpc).toHaveBeenCalledTimes(1);
  });
});
