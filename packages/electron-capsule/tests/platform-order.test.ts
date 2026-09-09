import { expect, it, vi } from "vitest";
import type { ElectronShellDefinition } from "@open-design/electron-kit/contracts";
import type { ElectronCapsuleSession } from "@open-design/electron-kit/runtime";
import { runElectronCapsule } from "@/session.js";

const platform: ElectronCapsuleSession["platform"] = { schemaVersion: 1, target: "darwin-arm64", treeSha256: "f".repeat(64),
  blob: { sha256: "e".repeat(64), size: 123, mediaType: "application/zip", sources: [{ kind: "remote", url: "https://fixture.invalid/platform.zip" }] },
  executables: ["bin/node"] };

vi.mock("electron", () => ({ BrowserWindow: class {}, app: {}, dialog: {}, ipcMain: {}, protocol: {}, nativeImage: {} }));
vi.mock("@open-design/electron-kit/contracts", async original => ({
  ...await original<typeof import("@open-design/electron-kit/contracts")>(),
  validateElectronShellAppearance: (value: unknown) => value,
}));
vi.mock("@open-design/electron-kit/runtime", async original => ({
  ...await original<typeof import("@open-design/electron-kit/runtime")>(),
  validateElectronRuntimeWarmupTopology: () => ({ nodes: [] }),
}));

it.each(["interactive", "headless"] as const)("prepares Node after presentation permission and mount (%s)", async presentation => {
  const events: string[] = [];
  let mounted!: () => void, started!: () => void;
  const mounting = new Promise<void>(resolve => { mounted = resolve; });
  const beginning = new Promise<void>(resolve => { started = resolve; });
  const createStartupPresentation = vi.fn(async () => {
    events.push("presentation.begin"); started(); await mounting;
    events.push("presentation.mounted");
    return { window: {}, setStage: () => events.push("presentation.stage") };
  });
  const prepareNodeRuntime = vi.fn(async () => { events.push("platform.prepare"); throw new Error("platform unavailable"); });
  const authority = vi.fn();
  const definition = { appearance: { splash: { initialLabel: "Starting" } }, createStartupPresentation,
    prepareNodeRuntime, createStandaloneAuthority: authority } as unknown as ElectronShellDefinition;
  const session = { manifest: { channel: "test" }, shell: {}, platform, presentation, namespace: "test",
    paths: { runtimeRoot: "/runtime" }, resourceRoot: "/installed", ingress: { bindReceiver() {} },
    startupQuit: { guard: <T>(promise: Promise<T>) => promise }, registerCleanup() { events.push("cleanup.registered"); },
  } as unknown as ElectronCapsuleSession;
  const running = runElectronCapsule(definition, session);
  // Attach failure observation immediately, before yielding to the mount barrier.
  const failed = expect(running).rejects.toThrow("platform unavailable");
  if (presentation === "interactive") {
    await beginning;
    expect(prepareNodeRuntime).not.toHaveBeenCalled();
    mounted();
  }
  await failed;
  expect(events).toEqual(presentation === "interactive"
    ? ["cleanup.registered", "presentation.begin", "presentation.mounted", "presentation.stage", "platform.prepare"]
    : ["cleanup.registered", "platform.prepare"]);
  expect(authority).not.toHaveBeenCalled();
  expect(prepareNodeRuntime).toHaveBeenCalledWith({ runtimeRoot: "/runtime", platform, signal: expect.any(AbortSignal) });
  if (presentation === "headless") expect(createStartupPresentation).not.toHaveBeenCalled();
});

it("aborts and settles an in-flight platform preparation during startup cleanup", async () => {
  let cleanup!: Parameters<ElectronCapsuleSession["registerCleanup"]>[0];
  let started!: () => void;
  const beginning = new Promise<void>(resolve => { started = resolve; });
  const prepareNodeRuntime = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true }); started();
  }));
  const definition = { appearance: { splash: {} }, prepareNodeRuntime } as unknown as ElectronShellDefinition;
  const session = { manifest: { channel: "test" }, shell: {}, presentation: "headless", namespace: "test",
    paths: { runtimeRoot: "/runtime" }, resourceRoot: "/installed", ingress: { bindReceiver() {} },
    startupQuit: { guard: <T>(promise: Promise<T>) => promise },
    registerCleanup(value: typeof cleanup) { cleanup = value; },
  } as unknown as ElectronCapsuleSession;
  const failed = expect(runElectronCapsule(definition, session)).rejects.toThrow("startup cancelled");
  await beginning;
  await cleanup.disposeWarmup();
  await cleanup.settleRendererMount();
  await failed;
  expect(prepareNodeRuntime.mock.calls[0]![0].signal.aborted).toBe(true);
});
