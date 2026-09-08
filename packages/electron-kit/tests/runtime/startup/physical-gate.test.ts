import { afterEach, expect, it, vi } from "vitest";
import type { ElectronShellManifest } from "@/contracts/index.js";
import { runElectronCarrier } from "@/runtime/index.js";

const mock = vi.hoisted(() => ({ bind: vi.fn(), exit: vi.fn(), log: vi.fn(), fail: vi.fn() }));
vi.mock("electron", () => ({
  app: { on: vi.fn(), removeListener: vi.fn(), isPackaged: false, getAppPath: () => "/physical", exit: mock.exit },
  BrowserWindow: { getAllWindows: () => [] }, protocol: {}, dialog: {}, ipcMain: {}, nativeImage: {},
}));
vi.mock("@open-design/standalone/packages", () => ({ bindNodePlatform: mock.bind }));
vi.mock("@/runtime/startup/identity.js", () => ({
  prepareElectronCarrierIdentity: async () => ({ paths: { runtimeRoot: "/runtime" }, preflight: {} }),
  loadElectronCarrierCapsule: async (_app: unknown, load: () => Promise<unknown>) => load(),
}));
vi.mock("@/runtime/session/logging.js", () => ({ ElectronRuntimeLog: class { write = mock.log; async flush() {} } }));
vi.mock("@/runtime/session/process-errors.js", () => ({ attachElectronProcessErrorHandlers: () => ({ dispose() {} }) }));
vi.mock("@/runtime/session/activation.js", () => ({ ElectronActivationAttempt: {
  begin: async () => ({ attemptId: "test-attempt", fail: mock.fail }),
} }));

afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

const manifest: ElectronShellManifest = {
  schemaVersion: 2, appId: "io.example.physical", productName: "Physical test", publisher: "Example", executableName: "physical-test",
  version: "0.1.0", channel: "dev", namespace: "test", protocol: "physical-test",
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};

it("does not load Capsule or reach its upgrade authority when physical preflight fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mock.bind.mockRejectedValue(new Error("physical Electron platform is unavailable; install the latest physical Shell"));
  const loadCapsule = vi.fn();
  await runElectronCarrier({ manifest, headless: true, preflight: { schemaVersion: 1, atoms: [] }, loadCapsule });
  expect(mock.bind).toHaveBeenCalledWith("/physical/platform");
  expect(loadCapsule).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.log).toHaveBeenCalledWith("startup.failed", expect.objectContaining({ error: expect.any(Error) }));
});

it("rejects invalid Capsule appearance before opening windows or reaching upgrade authority", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mock.bind.mockResolvedValue({ command: "/physical/platform/bin/node", env: {} });
  const preflight = { schemaVersion: 1 as const, atoms: [] }, authority = vi.fn();
  const loadCapsule = vi.fn().mockResolvedValue({
    createElectronCapsuleDefinition: () => ({ manifest, preflight, appearance: { schemaVersion: 1 }, createStandaloneAuthority: authority }),
    runElectronCapsule: vi.fn(),
  });
  await runElectronCarrier({ manifest, headless: true, preflight, loadCapsule });
  expect(loadCapsule).toHaveBeenCalledOnce();
  expect(authority).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.log).toHaveBeenCalledWith("startup.failed", expect.objectContaining({ error: expect.objectContaining({ message: "invalid Electron Capsule appearance schema" }) }));
});
