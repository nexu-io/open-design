import { beforeEach, expect, it, vi } from "vitest";

const sidecar = vi.hoisted(() => ({ stop: vi.fn(), find: vi.fn(), status: vi.fn() }));
vi.mock("@open-design/sidecar", () => ({ stopSidecar: sidecar.stop, findSidecarProcesses: sidecar.find, getSidecarStatus: sidecar.status }));
import { executeElectronRuntimeLifecycle } from "../scripts/runtime-lifecycle.ts";

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
  expect(sidecar.stop).toHaveBeenCalledExactlyOnceWith({ app: "electron", channel: "betahyx", mode: "runtime", namespace: "stop-test", source: "tools-pack" });
  expect(sidecar.find).toHaveBeenCalledExactlyOnceWith({ app: "standalone", channel: "betahyx", mode: "runtime", namespace: "stop-test", source: "standalone" });
});
