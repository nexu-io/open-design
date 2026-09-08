import { app } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runElectronCarrier } from "@/runtime/index.js";
import type { ElectronCapsuleModule } from "@/runtime/startup/capsule.js";
import type { ElectronShellManifest } from "@/contracts/index.js";

const mock = vi.hoisted(() => ({
  bind: vi.fn(), begin: vi.fn(), fail: vi.fn(), exit: vi.fn(), quit: vi.fn(), dispose: vi.fn(), log: vi.fn(),
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    app: Object.assign(new EventEmitter(), { isPackaged: false, getAppPath: () => "/physical",
      whenReady: async () => undefined, exit: mock.exit, quit: mock.quit }),
    BrowserWindow: { getAllWindows: () => [] }, protocol: {}, nativeImage: {}, ipcMain: {}, dialog: {},
  };
});
vi.mock("@open-design/standalone/packages", () => ({ bindNodePlatform: mock.bind }));
vi.mock("@/runtime/startup/identity.js", () => ({
  prepareElectronCarrierIdentity: async () => ({ paths: { runtimeRoot: "/runtime", namespaceRoot: "/namespace" }, preflight: {} }),
  loadElectronCarrierCapsule: async (_app: unknown, load: () => Promise<unknown>) => load(),
}));
vi.mock("@/runtime/session/activation.js", () => ({ ElectronActivationAttempt: { begin: mock.begin } }));
vi.mock("@/runtime/session/logging.js", () => ({ ElectronRuntimeLog: class { write = mock.log; async flush() {} } }));
vi.mock("@/runtime/session/process-errors.js", () => ({ attachElectronProcessErrorHandlers: () => ({ dispose: mock.dispose }) }));
vi.mock("@/platform/macos/index.js", () => ({ applyElectronMacRuntimePolicy: async () => undefined }));

const manifest: ElectronShellManifest = {
  schemaVersion: 2, appId: "io.example.physical", productName: "Physical test", publisher: "Example", executableName: "physical-test",
  version: "0.1.0", channel: "dev", namespace: "test", protocol: "physical-test",
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};
const preflight = { schemaVersion: 1 as const, atoms: [] };
function capsule() {
  return {
    createElectronCapsuleDefinition: vi.fn(() => ({ manifest, preflight,
      appearance: { schemaVersion: 1, window: { width: 1040, height: 700, title: "Test" },
        splash: { width: 1280, height: 900, minimumVisibleMs: 0, backgroundColor: "#000000", foregroundColor: "#ffffff",
          mutedColor: "#888888", initialLabel: "Starting", readyLabel: "Ready" } },
    })) as unknown as ElectronCapsuleModule["createElectronCapsuleDefinition"],
    runElectronCapsule: vi.fn<ElectronCapsuleModule["runElectronCapsule"]>(async (_definition, session) => {
      session.startupQuit.commit();
    }),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.bind.mockResolvedValue({ command: "/physical/platform/bin/node", env: {} });
  mock.begin.mockResolvedValue({ attemptId: "test-attempt", fail: mock.fail });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { app.removeAllListeners(); vi.restoreAllMocks(); });

it("establishes physical integrity and activation before loading one Capsule in-process", async () => {
  const module = capsule();
  const loadCapsule = vi.fn(async () => module);
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule });
  expect(mock.bind.mock.invocationCallOrder[0]).toBeLessThan(mock.begin.mock.invocationCallOrder[0]!);
  expect(mock.begin.mock.invocationCallOrder[0]).toBeLessThan(loadCapsule.mock.invocationCallOrder[0]!);
  expect(module.runElectronCapsule).toHaveBeenCalledExactlyOnceWith(expect.any(Object), expect.objectContaining({
    manifest, presentation: "headless", namespace: "test-headless", nodeRuntime: { command: "/physical/platform/bin/node", env: {} },
  }));
  expect(mock.exit).not.toHaveBeenCalled();
});

it("cancels a pending Capsule load without invoking a late factory or startup", async () => {
  const pending = Promise.withResolvers<ElectronCapsuleModule>();
  const entered = Promise.withResolvers<void>();
  const module = capsule();
  const running = runElectronCarrier({ manifest, preflight, headless: true,
    loadCapsule: () => { entered.resolve(); return pending.promise; },
  });
  await entered.promise;
  const event = { preventDefault: vi.fn() };
  app.emit("before-quit", event);
  await running;
  pending.resolve(module);
  await pending.promise;
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(module.createElectronCapsuleDefinition).not.toHaveBeenCalled();
  expect(module.runElectronCapsule).not.toHaveBeenCalled();
  expect(mock.fail).toHaveBeenCalledOnce();
  expect(mock.quit).toHaveBeenCalledOnce();
  expect(mock.exit).not.toHaveBeenCalled();
  expect(mock.dispose).toHaveBeenCalled();
  expect(app.eventNames()).toEqual([]);
});

it.each(["channel", "shell"])("does not let Capsule mutate established %s through its factory argument", async field => {
  const module = capsule();
  const original = module.createElectronCapsuleDefinition;
  module.createElectronCapsuleDefinition = installed => {
    const definition = original(installed);
    if (field === "channel") Object.assign(installed, { channel: "foreign" });
    else Object.assign(installed.shell, { version: "99.0.0" });
    return { ...definition, manifest: installed };
  };
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  expect(module.runElectronCapsule).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.fail).toHaveBeenCalledOnce();
});

it("cleans every registered Capsule owner before final cancellation even if one cleanup fails", async () => {
  const module = capsule(), entered = Promise.withResolvers<void>(), pending = Promise.withResolvers<void>();
  const events: string[] = [];
  mock.fail.mockImplementation(async () => { events.push("activation"); });
  module.runElectronCapsule.mockImplementation(async (_definition, session) => {
    session.registerCleanup({
      disposeWarmup() { events.push("warmup"); throw new Error("cleanup failed"); },
      settleRendererMount() { events.push("mount"); },
      releaseRendererIntegration() { events.push("renderer"); },
      releaseStandaloneAttachment() { events.push("runtime"); },
    });
    entered.resolve();
    await pending.promise;
  });
  const running = runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  await entered.promise;
  app.emit("before-quit", { preventDefault() {} });
  await running;
  pending.resolve();
  expect(events).toEqual(["warmup", "mount", "renderer", "runtime", "activation"]);
  expect(mock.quit).toHaveBeenCalledOnce();
  expect(mock.exit).not.toHaveBeenCalled();
  expect(mock.log).toHaveBeenCalledWith("startup.cancellation.failed", expect.any(Object));
});
