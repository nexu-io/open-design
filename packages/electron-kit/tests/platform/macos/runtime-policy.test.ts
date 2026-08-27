import { describe, expect, it, vi } from "vitest";

import {
  applyElectronMacRuntimePolicy,
  validateElectronMacRuntimePolicy,
  type ElectronMacRuntimePolicy,
} from "@/platform/macos/index.js";

const policy: ElectronMacRuntimePolicy = {
  schemaVersion: 1,
  activationPolicy: "regular",
  dock: { headless: "hidden", interactive: "visible", pinning: "system-owned" },
};

describe("Electron macOS runtime policy", () => {
  it("makes an interactive app regular and visible without modeling Dock pin state", async () => {
    const setActivationPolicy = vi.fn();
    const hide = vi.fn();
    const show = vi.fn(async () => undefined);
    await expect(applyElectronMacRuntimePolicy({
      app: { setActivationPolicy, dock: { hide, show } },
      platform: "darwin",
      policy,
      presentation: "interactive",
    })).resolves.toEqual({
      applied: true,
      activationPolicy: "regular",
      dockVisibility: "visible",
      pinning: "system-owned",
    });
    expect(setActivationPolicy).toHaveBeenCalledExactlyOnceWith("regular");
    expect(show).toHaveBeenCalledOnce();
    expect(hide).not.toHaveBeenCalled();
  });

  it("hides only the process-local icon for headless runs", async () => {
    const setActivationPolicy = vi.fn();
    const hide = vi.fn();
    const show = vi.fn(async () => undefined);
    const receipt = await applyElectronMacRuntimePolicy({
      app: { setActivationPolicy, dock: { hide, show } },
      platform: "darwin",
      policy,
      presentation: "headless",
    });
    expect(receipt.dockVisibility).toBe("hidden");
    expect(hide).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled();
  });

  it("is inert off macOS and rejects attempts to make pinning application-owned", async () => {
    const setActivationPolicy = vi.fn();
    await expect(applyElectronMacRuntimePolicy({
      app: { setActivationPolicy },
      platform: "win32",
      policy,
      presentation: "interactive",
    })).resolves.toMatchObject({ applied: false, dockVisibility: "not-applicable" });
    expect(setActivationPolicy).not.toHaveBeenCalled();
    expect(() => validateElectronMacRuntimePolicy({
      ...policy,
      dock: { ...policy.dock, pinning: "application-owned" as never },
    })).toThrow(/macOS runtime policy/u);
  });
});
