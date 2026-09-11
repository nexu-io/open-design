import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  run: vi.fn(),
  exit: vi.fn(),
  carrier: vi.fn(),
  namespace: vi.fn(),
}));

vi.mock("node:fs", async original => ({
  ...await original<typeof import("node:fs")>(),
  readFileSync: entry.readFileSync,
}));
vi.mock("electron", () => ({ app: { exit: entry.exit } }));
vi.mock("@open-design/electron-kit/runtime", () => ({
  runElectronCarrier: entry.carrier,
  resolveElectronLaunchNamespace: entry.namespace,
  validateElectronCarrierConfig: (value: unknown) => value,
}));
vi.mock("@/adapters/standalone/electron-control.js", async original => ({
  ...await original<typeof import("@/adapters/standalone/electron-control.js")>(), runControlledElectronShell: entry.run,
}));
vi.mock("@/adapters/standalone/capsule.js", () => ({ loadInstalledElectronCapsule: vi.fn() }));

describe("Electron process entry failure boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal("__dirname", "/installed");
    entry.readFileSync.mockReturnValue(JSON.stringify({ preflight: {}, startupTimeoutMs: 1000, channel: "betahyx", namespace: "installed" }));
    entry.namespace.mockReturnValue("selected-session");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("exits with failure when a supervised generation refuses startup", async () => {
    const failure = new Error("generation retired before startup");
    entry.run.mockRejectedValue(failure);
    await import("@/main.js");
    expect(console.error).toHaveBeenCalledWith("Electron Shell startup failed", failure);
    expect(entry.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("also closes the process when installed configuration cannot be read", async () => {
    const failure = new Error("invalid installation");
    entry.readFileSync.mockImplementation(() => { throw failure; });
    await import("@/main.js");
    expect(console.error).toHaveBeenCalledWith("Electron Shell startup failed", failure);
    expect(entry.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("does not force an exit after successful lifecycle completion", async () => {
    entry.run.mockResolvedValue(undefined);
    await import("@/main.js");
    expect(entry.run).toHaveBeenCalledOnce();
    expect(entry.run).toHaveBeenCalledWith(expect.any(Function), 1000, { channel: "betahyx", namespace: "selected-session" });
    expect(entry.exit).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rejects invalid launch scope before registering a controlled generation", async () => {
    const failure = new Error("forbidden path override");
    entry.namespace.mockImplementation(() => { throw failure; });
    await import("@/main.js");
    expect(entry.run).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Electron Shell startup failed", failure);
    expect(entry.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
