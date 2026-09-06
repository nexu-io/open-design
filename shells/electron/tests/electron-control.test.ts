import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SidecarLifecycle } from "@open-design/sidecar/authority";

const control = vi.hoisted(() => ({
  lifecycle: null as SidecarLifecycle<{ startedAt: string }> | null,
  runtime: null as { startedAt: string } | null,
  register: vi.fn(),
}));
const app = new EventEmitter() as EventEmitter & { getPath: () => string; quit: ReturnType<typeof vi.fn> };
app.getPath = () => "/namespace/electron";
app.quit = vi.fn(() => { app.emit("will-quit"); });

vi.mock("electron", () => ({ app, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("@open-design/electron-kit/runtime", () => ({ inspectElectronCdp: () => ({ discovery: { state: "ready" } }) }));
vi.mock("@open-design/sidecar/authority", () => ({
  readOptionalCurrentSidecarStamp: () => ({ app: "electron" }),
  isCurrentSidecarLauncher: () => false,
  registerSidecarProcess: control.register,
  SidecarFactory: {
    create: ({ lifecycle }: { lifecycle: NonNullable<typeof control.lifecycle> }) => {
      control.lifecycle = lifecycle;
      return {
        async start() { control.runtime = await lifecycle.start({ dataRoot: null, ownerPid: null, pid: process.pid, port: 0, runtimeRoot: "/control" }); },
        async waitUntilStopped() {},
      };
    },
  },
}));

describe("Electron control during product startup", () => {
  beforeEach(() => {
    vi.stubEnv("OD_ELECTRON_CONTROL_RESOURCES", JSON.stringify({ dataRoot: null, ownerPid: null, port: 0, runtimeRoot: "/control" }));
    control.lifecycle = null;
    control.runtime = null;
    vi.clearAllMocks();
  });
  afterEach(() => { vi.unstubAllEnvs(); app.removeAllListeners(); });

  it("publishes starting with CDP/logs before product readiness", async () => {
    const { runControlledElectronShell } = await import("@/adapters/standalone/electron-control.js");
    const ready = Promise.withResolvers<void>();
    const run = vi.fn(() => { expect(control.register).toHaveBeenCalledOnce(); return ready.promise; });
    const pending = runControlledElectronShell(run);
    expect(run).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(await control.lifecycle!.status(control.runtime!)).toMatchObject({
      state: "starting", cdp: { discovery: { state: "ready" } },
      logRoots: [{ scope: "shell" }, { scope: "product" }],
    });
    ready.resolve();
    await pending;
    expect(await control.lifecycle!.status(control.runtime!)).toMatchObject({ state: "running" });
  });

  it("can stop during startup even when quit emits synchronously", async () => {
    const { runControlledElectronShell } = await import("@/adapters/standalone/electron-control.js");
    const ready = Promise.withResolvers<void>();
    const pending = runControlledElectronShell(() => ready.promise);
    await Promise.resolve();
    await control.lifecycle!.stop(control.runtime!);
    expect(app.quit).toHaveBeenCalledOnce();
    ready.resolve();
    await pending;
    expect(await control.lifecycle!.status(control.runtime!)).toMatchObject({ state: "stopping" });
  });

  it("does not turn a rejected startup into running", async () => {
    const { runControlledElectronShell } = await import("@/adapters/standalone/electron-control.js");
    const failure = new Error("carrier failed");
    await expect(runControlledElectronShell(() => Promise.reject(failure))).rejects.toBe(failure);
    expect(await control.lifecycle!.status(control.runtime!)).toMatchObject({ state: "failed" });
  });
});
