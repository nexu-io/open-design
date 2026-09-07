import { afterEach, expect, it, vi } from "vitest";
import type { ElectronShellManifest } from "@/contracts/index.js";
import { runElectronCarrier } from "@/runtime/index.js";

const mock = vi.hoisted(() => ({ bind: vi.fn(), exit: vi.fn(), log: vi.fn() }));
vi.mock("electron", () => ({
  app: { on: vi.fn(), isPackaged: false, getAppPath: () => "/physical", exit: mock.exit },
  BrowserWindow: { getAllWindows: () => [] }, protocol: {}, dialog: {}, ipcMain: {}, nativeImage: {},
}));
vi.mock("@/runtime/startup/platform.js", () => ({ bindElectronPlatform: mock.bind }));
vi.mock("@/runtime/startup/identity.js", () => ({
  prepareElectronCarrierIdentity: async () => ({ paths: { runtimeRoot: "/runtime" }, preflight: {} }),
  loadElectronCarrierCapsule: async (_app: unknown, load: () => Promise<unknown>) => load(),
}));
vi.mock("@/runtime/session/logging.js", () => ({ ElectronRuntimeLog: class { write = mock.log; async flush() {} } }));
vi.mock("@/runtime/session/process-errors.js", () => ({ attachElectronProcessErrorHandlers: () => ({ dispose() {} }) }));

afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

it("does not load Capsule or reach its upgrade authority when physical preflight fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mock.bind.mockRejectedValue(new Error("physical Electron platform is unavailable; install the latest physical Shell"));
  const loadCapsule = vi.fn();
  const manifest: ElectronShellManifest = {
    schemaVersion: 1, appId: "io.example.physical", productName: "Physical test", publisher: "Example", executableName: "physical-test",
    version: "0.1.0", channel: "dev", namespace: "test", protocol: "physical-test", window: { width: 800, height: 600, title: "Test" },
    splash: { width: 400, height: 200, minimumVisibleMs: 0, backgroundColor: "#000000", foregroundColor: "#ffffff", mutedColor: "#aaaaaa", initialLabel: "Start", readyLabel: "Ready" },
    shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
  };
  await runElectronCarrier({ manifest, headless: true, preflight: { schemaVersion: 1, atoms: [] }, loadCapsule });
  expect(mock.bind).toHaveBeenCalledWith("/physical/platform");
  expect(loadCapsule).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.log).toHaveBeenCalledWith("startup.failed", expect.objectContaining({ error: expect.any(Error) }));
});
