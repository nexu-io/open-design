import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression for OPEND-2352: a source/dev run used to claim the `opendesign://`
// scheme for whatever Electron binary happened to host it. On macOS that binds
// the scheme to `com.github.electron` in LaunchServices, so the cloud
// authorization page's `opendesign://workspace/open` hand-off later launched a
// bare Electron welcome window from a throwaway checkout instead of focusing
// the installed app. Only the packaged app — which owns a channel-distinct
// bundle id and declares the scheme in its Info.plist — may register it.
const electron = vi.hoisted(() => ({
  isPackaged: true,
  on: vi.fn(),
  setAsDefaultProtocolClient: vi.fn(),
  whenReady: vi.fn(async () => undefined),
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return electron.isPackaged;
    },
    on: electron.on,
    setAsDefaultProtocolClient: electron.setAsDefaultProtocolClient,
    whenReady: electron.whenReady,
  },
}));

const realPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
}

async function registerOn(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  protocolClientPath?: string,
): Promise<void> {
  setPlatform(platform);
  electron.isPackaged = isPackaged;
  vi.resetModules();
  const { registerInviteDeeplink } = await import("../../src/main/invite-deeplink.js");
  registerInviteDeeplink({
    resolveDaemonBaseUrl: async () => "http://127.0.0.1:17456",
    protocolClientPath,
  });
}

beforeEach(() => {
  electron.on.mockClear();
  electron.setAsDefaultProtocolClient.mockClear();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: realPlatform });
});

describe("registerInviteDeeplink protocol-client registration", () => {
  it("does not claim the scheme from a macOS source/dev run", async () => {
    await registerOn("darwin", false);
    expect(electron.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("does not claim the scheme from a Windows source/dev run", async () => {
    await registerOn("win32", false, "C:\\Users\\qa\\AppData\\Local\\OpenDesign\\OpenDesign.exe");
    expect(electron.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("does not claim the scheme from a Linux source/dev run", async () => {
    await registerOn("linux", false);
    expect(electron.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("claims the scheme for a packaged macOS app", async () => {
    await registerOn("darwin", true);
    expect(electron.setAsDefaultProtocolClient).toHaveBeenCalledWith("opendesign");
  });

  it("claims the scheme for a packaged Windows app via the stable launcher path", async () => {
    const launcher = "C:\\Users\\qa\\AppData\\Local\\OpenDesign\\OpenDesign.exe";
    await registerOn("win32", true, launcher);
    expect(electron.setAsDefaultProtocolClient).toHaveBeenCalledWith("opendesign", launcher);
  });

  it("still wires the deeplink dispatcher on a source/dev run", async () => {
    await registerOn("darwin", false);
    expect(electron.on).toHaveBeenCalledWith("second-instance", expect.any(Function));
  });
});
