import { beforeEach, expect, it, vi } from "vitest";

const sidecar = vi.hoisted(() => ({ stop: vi.fn(), find: vi.fn(), status: vi.fn() }));
vi.mock("@open-design/sidecar", () => ({ stopSidecar: sidecar.stop, findSidecarProcesses: sidecar.find, getSidecarStatus: sidecar.status }));
import { executeElectronRuntimeLifecycle } from "@/adapters/tools/runtime-tool.js";
import { executeElectronDevLifecycle } from "@/adapters/tools/dev-tool.js";
import { electronGracefulStopOptions } from "@/adapters/standalone/observation.js";
import { standaloneHostControlRequestTimeoutMs } from "@open-design/standalone";

beforeEach(() => {
  vi.clearAllMocks();
  sidecar.stop.mockResolvedValue({ remainingPids: [], stoppedPids: [42] });
});

it.each([{ survivors: [] }, { survivors: [{ pid: 99 }] }])("reports physical survivors without refcount-based force retirement: $survivors", async ({ survivors }) => {
  sidecar.find.mockResolvedValue(survivors);
  const receipt = await executeElectronRuntimeLifecycle({ schemaVersion: 1, operation: "electron.runtime.stop", channel: "betahyx", namespace: "stop-test", controlRuntimeRoot: "/control" });
  expect(receipt).toMatchObject({ remainingPids: survivors.map(({ pid }) => pid) });
  expect(receipt).not.toHaveProperty("retainedStandaloneReferences");
  expect(sidecar.status).not.toHaveBeenCalled();
  expect(sidecar.stop).toHaveBeenCalledExactlyOnceWith({ app: "electron", channel: "betahyx", mode: "runtime", namespace: "stop-test", source: "tools-pack" }, electronGracefulStopOptions);
  expect(electronGracefulStopOptions.termGraceMs).toBeGreaterThan(standaloneHostControlRequestTimeoutMs({ operation: "lifecycle.release" }));
  expect(sidecar.find).toHaveBeenCalledTimes(4);
  for (const app of ["standalone", "daemon", "web", "electron-updater"]) {
    expect(sidecar.find).toHaveBeenCalledWith({ app, channel: "betahyx", mode: "runtime", namespace: "stop-test", source: "standalone" });
  }
});

it("reports an orphaned Closure resource even when the host has already stopped", async () => {
  sidecar.find.mockImplementation(async ({ app }) => app === "web" ? [{ pid: 73 }] : []);
  const receipt = await executeElectronRuntimeLifecycle({ schemaVersion: 1, operation: "electron.runtime.stop", channel: "betahyx", namespace: "stop-test", controlRuntimeRoot: "/control" });
  expect(receipt).toMatchObject({ remainingPids: [73] });
  expect(sidecar.stop).toHaveBeenCalledOnce();
});

it("keeps dev stop partial when an orphan survives Electron shutdown", async () => {
  sidecar.find.mockImplementation(async ({ app }) => app === "electron-updater" ? [{ pid: 73 }] : []);
  const receipt = await executeElectronDevLifecycle({ schemaVersion: 2, operation: "electron.dev.stop", channel: "dev", namespace: "stop-test", controlRuntimeRoot: "/control" }, { logFd: 2 });
  expect(receipt).toMatchObject({ stopped: { remainingPids: [73] } });
  expect(sidecar.stop).toHaveBeenCalledExactlyOnceWith({ app: "electron", channel: "dev", mode: "dev", namespace: "stop-test", source: "tools-dev" }, electronGracefulStopOptions);
  expect(sidecar.find).toHaveBeenCalledTimes(4);
});
