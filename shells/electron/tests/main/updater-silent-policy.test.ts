import { describe, expect, it, vi } from "vitest";

import { ensureSilentUpdatePreference } from "../../src/main/updater/silent-policy.js";

describe("silent updater policy ensure", () => {
  it("persists true only when updater behavior first observes an undefined preference", async () => {
    const write = vi.fn(async (value: { allowSilentUpdates: true; theme: string }) => value);

    await expect(ensureSilentUpdatePreference(
      async (): Promise<{ allowSilentUpdates?: boolean; theme: string }> => ({ theme: "system" }),
      write,
    )).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith({ allowSilentUpdates: true, theme: "system" });
  });

  it("preserves either explicit user choice without writing", async () => {
    const write = vi.fn();
    await expect(ensureSilentUpdatePreference(
      async () => ({ allowSilentUpdates: false }),
      write,
    )).resolves.toBe(false);
    await expect(ensureSilentUpdatePreference(
      async () => ({ allowSilentUpdates: true }),
      write,
    )).resolves.toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
});
