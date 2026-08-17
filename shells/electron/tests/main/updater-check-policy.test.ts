import { describe, expect, it, vi } from "vitest";

import type { DesktopUpdater } from "../../src/main/updater.js";
import { checkDesktopUpdatesWithPolicy } from "../../src/main/updater/check-policy.js";

describe("desktop updater check policy", () => {
  it.each([
    { expected: "authorize-silent", preference: true },
    { expected: "revoke-silent", preference: false },
  ] as const)("maps preference=$preference to $expected", async ({ expected, preference }) => {
    const snapshot = { state: "not-available" };
    const checkForUpdates = vi.fn(async () => snapshot);

    await expect(checkDesktopUpdatesWithPolicy({
      autoDownload: false,
      resolveSilentActivation: async () => preference,
      trigger: "manual",
      updater: { checkForUpdates } as unknown as DesktopUpdater,
    })).resolves.toBe(snapshot);

    expect(checkForUpdates).toHaveBeenCalledWith({
      activationPolicy: expected,
      autoDownload: false,
      trigger: "manual",
    });
  });

  it("fails closed when the preference cannot be resolved", async () => {
    const checkForUpdates = vi.fn(async () => ({ state: "not-available" }));
    const onPreferenceError = vi.fn();

    await checkDesktopUpdatesWithPolicy({
      onPreferenceError,
      resolveSilentActivation: async () => {
        throw new Error("app config unavailable");
      },
      trigger: "sidecar",
      updater: { checkForUpdates } as unknown as DesktopUpdater,
    });

    expect(checkForUpdates).toHaveBeenCalledWith({
      activationPolicy: "revoke-silent",
      trigger: "sidecar",
    });
    expect(onPreferenceError).toHaveBeenCalledWith(expect.objectContaining({
      message: "app config unavailable",
    }));
  });
});
