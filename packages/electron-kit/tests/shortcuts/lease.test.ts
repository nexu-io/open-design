import { describe, expect, it, vi } from "vitest";

import {
  openElectronShortcutLease,
  validateElectronShortcutTopology,
  type ElectronShortcutRegistry,
  type ElectronShortcutTopology,
} from "@/shortcuts/index.js";

const topology: ElectronShortcutTopology = {
  schemaVersion: 1,
  shortcuts: [
    {
      id: "show-menu",
      accelerators: { darwin: "Command+Shift+D", win32: "Control+Shift+D" },
      required: true,
    },
    {
      id: "optional-action",
      accelerators: { darwin: "Command+Shift+O", win32: "Control+Shift+O" },
      required: false,
    },
  ],
};

function fakeRegistry(results: readonly boolean[] = [true, true]): Readonly<{
  callbacks: Map<string, () => void>;
  registry: ElectronShortcutRegistry;
  unregister: ReturnType<typeof vi.fn>;
}> {
  const callbacks = new Map<string, () => void>();
  const unregister = vi.fn();
  let index = 0;
  return {
    callbacks,
    unregister,
    registry: {
      register(accelerator, callback) {
        const registered = results[index++] ?? false;
        if (registered) callbacks.set(accelerator, callback);
        return registered;
      },
      unregister,
    },
  };
}

describe("Electron shortcut lease", () => {
  it("selects the platform accelerator and unregisters only successful registrations", async () => {
    const fake = fakeRegistry([true, false]);
    const lease = openElectronShortcutLease({
      topology,
      bindings: { "show-menu": vi.fn(), "optional-action": vi.fn() },
      registry: fake.registry,
      platform: "darwin",
      isAppReady: () => true,
    });

    expect(lease.registrations).toEqual([
      { id: "show-menu", accelerator: "Command+Shift+D", registered: true },
      { id: "optional-action", accelerator: "Command+Shift+O", registered: false },
    ]);
    await Promise.all([lease.dispose(), lease.dispose()]);
    expect(fake.unregister).toHaveBeenCalledTimes(1);
    expect(fake.unregister).toHaveBeenCalledWith("Command+Shift+D");
  });

  it("rolls back earlier registrations when a required shortcut is unavailable", () => {
    const fake = fakeRegistry([true, false]);
    const requiredTopology: ElectronShortcutTopology = {
      ...topology,
      shortcuts: topology.shortcuts.map((shortcut) => ({ ...shortcut, required: true })),
    };
    expect(() => openElectronShortcutLease({
      topology: requiredTopology,
      bindings: { "show-menu": vi.fn(), "optional-action": vi.fn() },
      registry: fake.registry,
      platform: "win32",
      isAppReady: () => true,
    })).toThrow(/required Electron shortcut is unavailable/u);
    expect(fake.unregister).toHaveBeenCalledWith("Control+Shift+D");
  });

  it("waits for active async bindings and observes invocation failures", async () => {
    const fake = fakeRegistry();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const events: string[] = [];
    const lease = openElectronShortcutLease({
      topology,
      bindings: {
        "show-menu": () => pending,
        "optional-action": () => { throw new Error("action failed"); },
      },
      registry: fake.registry,
      platform: "darwin",
      isAppReady: () => true,
      observe(event) { events.push(event.state); },
    });
    fake.callbacks.get("Command+Shift+D")!();
    fake.callbacks.get("Command+Shift+O")!();
    await vi.waitFor(() => expect(events).toContain("invocation-failed"));
    let disposed = false;
    const disposal = lease.dispose().then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    release();
    await disposal;
    expect(disposed).toBe(true);
  });

  it("requires app readiness, exact bindings and unique accelerators", () => {
    const fake = fakeRegistry();
    expect(() => openElectronShortcutLease({
      topology,
      bindings: { "show-menu": vi.fn(), "optional-action": vi.fn() },
      registry: fake.registry,
      platform: "darwin",
      isAppReady: () => false,
    })).toThrow(/require app readiness/u);
    expect(() => openElectronShortcutLease({
      topology,
      bindings: { "show-menu": vi.fn() },
      registry: fake.registry,
      platform: "darwin",
      isAppReady: () => true,
    })).toThrow(/exactly match/u);
    expect(() => validateElectronShortcutTopology({
      ...topology,
      shortcuts: topology.shortcuts.map((shortcut) => ({
        ...shortcut,
        accelerators: { ...shortcut.accelerators, darwin: "Command+Shift+D" },
      })),
    })).toThrow(/duplicate Electron darwin accelerator/u);
  });
});
