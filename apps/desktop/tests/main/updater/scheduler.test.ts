import { describe, expect, it, vi } from "vitest";

import { DESKTOP_UPDATE_CHANNELS, DESKTOP_UPDATE_STATES } from "@open-design/sidecar-proto";

import { createDesktopUpdaterScheduler } from "../../../src/main/updater/scheduler.js";

describe("desktop updater scheduler", () => {
  it("silently applies a ready launcher payload during the startup poll when enabled", async () => {
    vi.useFakeTimers();
    const requestQuit = vi.fn();
    const readSilentPreference = vi.fn(async () => true);
    const payloadStatus = {
      arch: "arm64",
      artifact: {
        name: "open-design-1.0.1-mac-arm64-payload.zip",
        platformKey: "mac",
        size: 1024,
        type: "payload",
        url: "https://example.invalid/payload.zip",
      },
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      channel: DESKTOP_UPDATE_CHANNELS.BETA,
      currentVersion: "1.0.0",
      downloadPath: "/tmp/open-design-updates/payload.zip",
      enabled: true,
      mode: "package-launcher" as const,
      platform: "darwin",
      state: DESKTOP_UPDATE_STATES.DOWNLOADED,
      supported: true,
    };
    const installedStatus = {
      ...payloadStatus,
      installResult: {
        activeVersion: "1.0.1",
        dryRun: false,
        openedAt: "2026-05-19T00:00:00.000Z",
        path: "/tmp/open-design-updates/payload.zip",
      },
    };
    const updater = {
      checkForUpdates: vi.fn(async () => payloadStatus),
      config: {},
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(async () => installedStatus),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({ ...payloadStatus, installResult: undefined })),
      status: vi.fn(async () => payloadStatus),
      subscribe: vi.fn(() => () => undefined),
    };
    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
        startupSilentPayloadUpdate: {
          isEnabled: readSilentPreference,
          requestQuit,
        },
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);

      expect(readSilentPreference).toHaveBeenCalledTimes(1);
      expect(updater.installUpdate).toHaveBeenCalledTimes(1);
      expect(requestQuit).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not silently apply a payload first downloaded by the startup poll", async () => {
    vi.useFakeTimers();
    const requestQuit = vi.fn();
    const readSilentPreference = vi.fn(async () => true);
    const idleStatus = {
      arch: "arm64",
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      channel: DESKTOP_UPDATE_CHANNELS.BETA,
      currentVersion: "1.0.0",
      enabled: true,
      mode: "package-launcher" as const,
      platform: "darwin",
      state: DESKTOP_UPDATE_STATES.IDLE,
      supported: true,
    };
    const payloadStatus = {
      ...idleStatus,
      artifact: {
        name: "open-design-1.0.1-mac-arm64-payload.zip",
        platformKey: "mac",
        size: 1024,
        type: "payload",
        url: "https://example.invalid/payload.zip",
      },
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      downloadPath: "/tmp/open-design-updates/payload.zip",
      state: DESKTOP_UPDATE_STATES.DOWNLOADED,
    };
    const updater = {
      checkForUpdates: vi.fn(async () => payloadStatus),
      config: {},
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({ ...idleStatus, installResult: undefined })),
      status: vi.fn(async () => idleStatus),
      subscribe: vi.fn(() => () => undefined),
    };
    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
        startupSilentPayloadUpdate: {
          isEnabled: readSilentPreference,
          requestQuit,
        },
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);

      expect(updater.status).toHaveBeenCalledTimes(1);
      expect(readSilentPreference).not.toHaveBeenCalled();
      expect(updater.installUpdate).not.toHaveBeenCalled();
      expect(requestQuit).not.toHaveBeenCalled();
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not silently apply payload updates from periodic polls after startup", async () => {
    vi.useFakeTimers();
    const requestQuit = vi.fn();
    const readSilentPreference = vi.fn(async () => true);
    const baseStatus = {
      arch: "arm64",
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      channel: DESKTOP_UPDATE_CHANNELS.BETA,
      currentVersion: "1.0.0",
      enabled: true,
      mode: "package-launcher" as const,
      platform: "darwin",
      state: DESKTOP_UPDATE_STATES.NOT_AVAILABLE,
      supported: true,
    };
    const payloadStatus = {
      ...baseStatus,
      artifact: {
        name: "open-design-1.0.1-mac-arm64-payload.zip",
        platformKey: "mac",
        size: 1024,
        type: "payload",
        url: "https://example.invalid/payload.zip",
      },
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      downloadPath: "/tmp/open-design-updates/payload.zip",
      state: DESKTOP_UPDATE_STATES.DOWNLOADED,
    };
    const updater = {
      checkForUpdates: vi.fn()
        .mockResolvedValueOnce(baseStatus)
        .mockResolvedValue(payloadStatus),
      config: {},
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({ ...baseStatus, installResult: undefined })),
      status: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 100,
        backoffMaxMs: 1000,
        initialDelayMs: 10,
        intervalMs: 100,
        startupSilentPayloadUpdate: {
          isEnabled: readSilentPreference,
          requestQuit,
        },
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(100);

      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      expect(readSilentPreference).not.toHaveBeenCalled();
      expect(updater.installUpdate).not.toHaveBeenCalled();
      expect(requestQuit).not.toHaveBeenCalled();
      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
    }
  });

  it("floors non-positive scheduled delays instead of spinning a zero-ms loop", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        arch: "arm64",
        capabilities: {
          canApplyInPlace: false,
          canDownload: true,
          canOpenInstaller: true,
          requiresManualInstall: true,
        },
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        currentVersion: "1.0.0",
        enabled: true,
        mode: "package-launcher" as const,
        platform: "darwin",
        state: DESKTOP_UPDATE_STATES.NOT_AVAILABLE,
        supported: true,
      })),
      config: {
        arch: "arm64",
        autoCheck: true,
        autoDownload: true,
        autoOpen: false,
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        checkBackoffInitialMs: 60_000,
        checkBackoffMaxMs: 300_000,
        checkInitialDelayMs: 5_000,
        checkIntervalMs: 15 * 60 * 1000,
        currentVersion: "1.0.0",
        downloadRoot: "/tmp/open-design-updates",
        enabled: true,
        metadataUrl: "https://example.invalid/metadata.json",
        mode: "package-launcher" as const,
        platform: "darwin",
      },
      downloadUpdate: vi.fn(),
      handle: vi.fn(),
      installUpdate: vi.fn(),
      shouldAutoCheck: vi.fn(() => true),
      snapshot: vi.fn(() => ({
        arch: "arm64",
        capabilities: {
          canApplyInPlace: false,
          canDownload: true,
          canOpenInstaller: true,
          requiresManualInstall: true,
        },
        channel: DESKTOP_UPDATE_CHANNELS.BETA,
        currentVersion: "1.0.0",
        enabled: true,
        mode: "package-launcher" as const,
        platform: "darwin",
        state: DESKTOP_UPDATE_STATES.IDLE,
        supported: true,
      })),
      status: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };

    try {
      const scheduler = createDesktopUpdaterScheduler(updater as any, {
        backoffInitialMs: 0,
        backoffMaxMs: 1000,
        initialDelayMs: 0,
        intervalMs: 0,
        logger: { warn } as any,
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(999);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);

      scheduler.stop("test");
    } finally {
      vi.useRealTimers();
    }
  });
});
