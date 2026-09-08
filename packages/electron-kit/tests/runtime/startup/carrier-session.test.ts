import { app } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runElectronCarrier } from "@/runtime/index.js";
import type { ElectronCapsuleModule, LoadedElectronCapsule } from "@/runtime/startup/capsule.js";
import type { ElectronShellManifest } from "@/contracts/index.js";

const mock = vi.hoisted(() => ({
  bind: vi.fn(), begin: vi.fn(), commit: vi.fn(), capsuleCommit: vi.fn(), fail: vi.fn(), exit: vi.fn(), quit: vi.fn(), dispose: vi.fn(), log: vi.fn(), lease: vi.fn(),
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
vi.mock("@open-design/standalone", async original => ({ ...await original<typeof import("@open-design/standalone")>(),
  withStandaloneMaintenanceLock: async (_root: string, operation: () => Promise<unknown>) => operation() }));
vi.mock("@/runtime/session/capsule-selection.js", () => ({ commitElectronCapsuleSelection: mock.capsuleCommit }));
vi.mock("@/runtime/startup/identity.js", () => ({
  prepareElectronCarrierIdentity: async () => ({ paths: { runtimeRoot: "/runtime", namespaceRoot: "/namespace" }, preflight: {} }),
  loadElectronCarrierCapsule: async (_app: unknown, load: () => Promise<unknown>) => load(),
}));
vi.mock("@/runtime/session/activation.js", () => ({ ElectronActivationAttempt: { begin: mock.begin } }));
vi.mock("@/runtime/session/lease.js", () => ({ acquireElectronSessionLease: mock.lease }));
vi.mock("@/runtime/session/logging.js", () => ({ ElectronRuntimeLog: class { write = mock.log; async flush() {} } }));
vi.mock("@/runtime/session/process-errors.js", () => ({ attachElectronProcessErrorHandlers: () => ({ dispose: mock.dispose }) }));
vi.mock("@/platform/macos/index.js", () => ({ applyElectronMacRuntimePolicy: async () => undefined }));

const manifest: ElectronShellManifest = {
  schemaVersion: 2, appId: "io.example.physical", productName: "Physical test", publisher: "Example", executableName: "physical-test",
  version: "0.1.0", channel: "dev", namespace: "test", protocol: "physical-test",
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};
const preflight = { schemaVersion: 1 as const, atoms: [] };
const shell = { type: "electron", version: "0.2.0", buildHash: "c".repeat(64), digest: "d".repeat(64) };
function capsule() {
  return {
    shell,
    selection: {} as LoadedElectronCapsule["selection"],
    createElectronCapsuleDefinition: vi.fn(() => ({ manifest,
      appearance: { schemaVersion: 1, window: { width: 1040, height: 700, title: "Test" },
        splash: { width: 1280, height: 900, minimumVisibleMs: 0, backgroundColor: "#000000", foregroundColor: "#ffffff",
          mutedColor: "#888888", initialLabel: "Starting", readyLabel: "Ready" } },
    })) as unknown as ElectronCapsuleModule["createElectronCapsuleDefinition"],
    runElectronCapsule: vi.fn<ElectronCapsuleModule["runElectronCapsule"]>(async (_definition, session) => {
      const signal = session.startup.bind("e".repeat(64));
      session.startup.advance(signal, "runtime-ready");
      session.startup.advance(signal, "renderer-mounted");
      return { signal, generationId: "f".repeat(64) };
    }),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.lease.mockResolvedValue({ release: vi.fn() });
  mock.bind.mockResolvedValue({ command: "/physical/platform/bin/node", env: {} });
  mock.commit.mockResolvedValue(undefined);
  mock.begin.mockResolvedValue({ attemptId: "test-attempt", fail: mock.fail, commit: mock.commit });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { app.removeAllListeners(); vi.restoreAllMocks(); });

it("establishes physical integrity and activation before loading one Capsule in-process", async () => {
  const module = capsule();
  const loadCapsule = vi.fn(async () => module);
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule });
  expect(mock.lease).toHaveBeenCalledWith("/runtime");
  expect(mock.lease.mock.invocationCallOrder[0]).toBeLessThan(mock.bind.mock.invocationCallOrder[0]!);
  expect(mock.bind.mock.invocationCallOrder[0]).toBeLessThan(mock.begin.mock.invocationCallOrder[0]!);
  expect(mock.begin.mock.invocationCallOrder[0]).toBeLessThan(loadCapsule.mock.invocationCallOrder[0]!);
  expect(module.runElectronCapsule).toHaveBeenCalledExactlyOnceWith(expect.any(Object), expect.objectContaining({
    manifest, shell, presentation: "headless", namespace: "test-headless", nodeRuntime: { command: "/physical/platform/bin/node", env: {} },
  }));
  expect(module.createElectronCapsuleDefinition).toHaveBeenCalledWith(manifest, shell);
  expect(manifest.shell.version).toBe("0.1.0");
  expect(mock.log).toHaveBeenCalledWith("capsule.definition.loaded", { pid: process.pid, carrier: manifest.shell, shell });
  expect(mock.exit).not.toHaveBeenCalled();
  expect(mock.commit).toHaveBeenCalledOnce();
  expect(mock.capsuleCommit).toHaveBeenCalledExactlyOnceWith("/runtime", module.selection, "f".repeat(64));
  expect(mock.capsuleCommit.mock.invocationCallOrder[0]).toBeLessThan(mock.commit.mock.invocationCallOrder[0]!);
  expect(mock.log).toHaveBeenCalledWith("capsule.startup.ready", {
    activationAttemptId: "test-attempt", generationId: "f".repeat(64), bindingDigest: "e".repeat(64),
  });
  expect(mock.log).toHaveBeenCalledWith("startup.committed", { generationId: "f".repeat(64), presentation: "headless" });
});

it("refuses a recovery-owned session before platform, activation or Capsule work", async () => {
  mock.lease.mockRejectedValue(new Error("Electron session is owned"));
  const loadCapsule = vi.fn(async () => capsule());
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule });
  expect(mock.bind).not.toHaveBeenCalled();
  expect(mock.begin).not.toHaveBeenCalled();
  expect(loadCapsule).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
});

it("does not commit a partial Capsule startup or expose commit authority to it", async () => {
  const module = capsule(), entered = Promise.withResolvers<void>(), complete = Promise.withResolvers<void>();
  const original = module.runElectronCapsule.getMockImplementation()!;
  module.runElectronCapsule.mockImplementation(async (definition, session) => {
    expect(session.activation).not.toHaveProperty("commit");
    expect(session.startupQuit).not.toHaveProperty("commit");
    const ready = await original(definition, session);
    entered.resolve();
    await complete.promise;
    return ready;
  });
  const running = runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  await Promise.race([entered.promise, running]);
  expect(mock.exit).not.toHaveBeenCalled();
  expect(mock.commit).not.toHaveBeenCalled();
  complete.resolve();
  await running;
  expect(mock.commit).toHaveBeenCalledOnce();
  expect(mock.exit).not.toHaveBeenCalled();
});

it.each(["missing", "binding", "generation"])("refuses a %s Capsule completion proof", async invalid => {
  const module = capsule(), original = module.runElectronCapsule.getMockImplementation()!;
  module.runElectronCapsule.mockImplementation(async (definition, session) => {
    const ready = await original(definition, session);
    return invalid === "missing" ? undefined as never : invalid === "generation" ? { ...ready, generationId: "invalid" }
      : { ...ready, signal: { ...ready.signal, bindingDigest: "0".repeat(64) } };
  });
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  expect(mock.commit).not.toHaveBeenCalled();
  expect(mock.fail).toHaveBeenCalledOnce();
  expect(mock.exit).toHaveBeenCalledWith(1);
});

it("keeps a failure after renderer readiness inside the uncommitted startup window", async () => {
  const module = capsule(), original = module.runElectronCapsule.getMockImplementation()!;
  module.runElectronCapsule.mockImplementation(async (definition, session) => {
    await original(definition, session);
    throw new Error("late Capsule initialization failed");
  });
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  expect(mock.commit).not.toHaveBeenCalled();
  expect(mock.fail).toHaveBeenCalledOnce();
  expect(mock.exit).toHaveBeenCalledWith(1);
});

it("joins a pending durable commit before recording startup cancellation", async () => {
  const entered = Promise.withResolvers<void>(), persisted = Promise.withResolvers<void>();
  mock.commit.mockImplementation(() => { entered.resolve(); return persisted.promise; });
  const running = runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => capsule() });
  await entered.promise;
  app.emit("before-quit", { preventDefault() {} });
  expect(mock.fail).not.toHaveBeenCalled();
  persisted.resolve();
  await running;
  expect(mock.fail).toHaveBeenCalledOnce();
  expect(mock.log.mock.calls.some(([event]) => event === "startup.committed")).toBe(false);
  expect(mock.quit).toHaveBeenCalledOnce();
});

it.each(["capsule", "outer"])("keeps the startup blockade when the %s commit fails", async phase => {
  const failure = new Error(`${phase} commit interrupted`);
  (phase === "capsule" ? mock.capsuleCommit : mock.commit).mockRejectedValueOnce(failure);
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => capsule() });
  expect(mock.capsuleCommit).toHaveBeenCalledOnce();
  if (phase === "capsule") expect(mock.commit).not.toHaveBeenCalled();
  else expect(mock.commit).toHaveBeenCalledOnce();
  expect(mock.fail).toHaveBeenCalledExactlyOnceWith(failure);
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.log.mock.calls.some(([event]) => event === "startup.committed")).toBe(false);
});

it("rejects a Capsule trying to advance the carrier's final commit phase", async () => {
  const module = capsule(), original = module.runElectronCapsule.getMockImplementation()!;
  module.runElectronCapsule.mockImplementation(async (definition, session) => {
    const ready = await original(definition, session);
    session.startup.advance(ready.signal, "committed" as never);
    return ready;
  });
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  expect(mock.commit).not.toHaveBeenCalled();
  expect(mock.fail).toHaveBeenCalledOnce();
});

it("cancels a pending Capsule load without invoking a late factory or startup", async () => {
  const pending = Promise.withResolvers<LoadedElectronCapsule>();
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

it.each(["channel", "shell", "capability"])("does not let Capsule mutate established %s through its factory argument", async field => {
  const module = capsule();
  const original = module.createElectronCapsuleDefinition;
  module.createElectronCapsuleDefinition = (installed, capability) => {
    const definition = original(installed, capability);
    if (field === "channel") Object.assign(installed, { channel: "foreign" });
    else if (field === "shell") Object.assign(installed.shell, { version: "99.0.0" });
    else Object.assign(capability, { version: "99.0.0" });
    return { ...definition, manifest: installed };
  };
  await runElectronCarrier({ manifest, preflight, headless: true, loadCapsule: async () => module });
  expect(module.runElectronCapsule).not.toHaveBeenCalled();
  expect(mock.exit).toHaveBeenCalledWith(1);
  expect(mock.fail).toHaveBeenCalledOnce();
});

it("rejects Capsule attempts to redeclare fixed preflight", async () => {
  const module = capsule(), original = module.createElectronCapsuleDefinition;
  module.createElectronCapsuleDefinition = (installed, capability) => ({ ...original(installed, capability), preflight });
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
    throw new Error("cancelled startup must not finish");
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
