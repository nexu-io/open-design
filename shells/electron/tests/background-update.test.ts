import { beforeEach, expect, it, vi } from "vitest";
import type { ElectronBackgroundUpdatePolicy } from "@open-design/electron-kit/contracts";
import { initialShellUpdaterSnapshot, type StandaloneShellUpdaterSnapshot } from "@open-design/standalone";
import { createElectronBackgroundUpdateCheck, prepareElectronBackgroundUpdate } from "@/adapters/updater/background.js";
import { readElectronSilentUpdatePreference } from "@/adapters/updater/silent-preference.js";

vi.mock("@/adapters/standalone/product-runtime.js", () => ({ readElectronProductRuntime: vi.fn(async () => ({ daemon: { url: "http://localhost:1234" } })) }));
vi.mock("@/adapters/updater/silent-preference.js", () => ({ readElectronSilentUpdatePreference: vi.fn(async () => true) }));
beforeEach(() => { vi.mocked(readElectronSilentUpdatePreference).mockReset().mockResolvedValue(true); });

function fixture() {
  const idle = initialShellUpdaterSnapshot("electron");
  const invoke = vi.fn(async (_action: string) => ({ outcome: "accepted" as const, snapshot: idle }));
  const prepareLatest = vi.fn(async () => ({ status: "current" as const, generationId: "current" }));
  const controller = new AbortController();
  const input = { signal: controller.signal, startupShellRevision: idle.revision, startupContentGenerationId: null, runtime: { attachment: {}, binding: {} }, shellUpdater: { readSnapshot: vi.fn(async () => idle), invoke },
    contentUpdater: { prepareLatest } } as unknown as Parameters<ElectronBackgroundUpdatePolicy["check"]>[0];
  return { input, invoke, prepareLatest, controller, idle };
}

it("checks Shell and prepares Closure without granting silent activation", async () => {
  const { input, invoke, prepareLatest } = fixture();
  await prepareElectronBackgroundUpdate(input);
  expect(invoke.mock.calls).toEqual([["check"]]);
  expect(prepareLatest).toHaveBeenCalledExactlyOnceWith("observe");
});

it.each([true, false, "unavailable"] as const)("only authorizes a retained Capsule when persisted preference permits (%s)", async preference => {
  const { input, invoke, idle } = fixture();
  const ready: StandaloneShellUpdaterSnapshot = { ...idle, state: "ready", actions: [{ id: "restart", emphasis: "primary" }] };
  vi.mocked(input.shellUpdater.readSnapshot).mockResolvedValue(ready);
  if (preference === "unavailable") vi.mocked(readElectronSilentUpdatePreference).mockRejectedValue(new Error("unavailable"));
  else vi.mocked(readElectronSilentUpdatePreference).mockResolvedValue(preference);
  const check = createElectronBackgroundUpdateCheck();
  await check(input);
  expect(invoke.mock.calls).toEqual(preference === true ? [["restart"]] : []);
  await check(input);
  expect(invoke.mock.calls).toEqual(preference === true ? [["restart"]] : []);
  expect(readElectronSilentUpdatePreference).toHaveBeenCalledTimes(1);
});

it("does not activate a candidate prepared after startup or an installer", async () => {
  for (const variant of ["new-candidate", "installer"] as const) {
    const { input, invoke, idle } = fixture();
    vi.mocked(input.shellUpdater.readSnapshot).mockResolvedValue({ ...idle, state: "ready",
      revision: idle.revision + (variant === "new-candidate" ? 1 : 0),
      actions: [{ id: variant === "installer" ? "install" : "restart", emphasis: "primary" }] });
    await createElectronBackgroundUpdateCheck()(input);
    expect(invoke).not.toHaveBeenCalled();
  }
  expect(readElectronSilentUpdatePreference).not.toHaveBeenCalled();
});

it.each(["retained", "replaced"] as const)("only applies the exact retained startup Closure (%s)", async variant => {
  const { input, invoke } = fixture();
  const generationId = "a".repeat(64);
  const readPrepared = vi.fn().mockResolvedValue({ status: "prepared", generation: { id: variant === "retained" ? generationId : "b".repeat(64) }, authorized: false });
  const applyNow = vi.fn().mockResolvedValue({ status: "blocked", reason: "occupied", occupants: [] });
  const check = createElectronBackgroundUpdateCheck();
  const context = { ...input, startupContentGenerationId: generationId,
    contentUpdater: { ...input.contentUpdater, readPrepared, applyNow } };
  await check(context);
  expect(applyNow.mock.calls).toEqual(variant === "retained" ? [[{ expectedGenerationId: generationId, activationPolicy: "authorize-silent" }]] : []);
  expect(invoke.mock.calls).toEqual(variant === "retained" ? [] : [["check"]]);
  await check(context);
  expect(applyNow).toHaveBeenCalledTimes(variant === "retained" ? 1 : 0);
});

it("downloads a Shell candidate without restart, install or replacing its bound Closure", async () => {
  const { input, invoke, prepareLatest, idle } = fixture();
  const available: StandaloneShellUpdaterSnapshot = { ...idle, state: "available", actions: [{ id: "download", emphasis: "primary" }] };
  invoke.mockResolvedValueOnce({ outcome: "accepted", snapshot: available })
    .mockResolvedValueOnce({ outcome: "accepted", snapshot: { ...idle, state: "ready", actions: [] } });
  await prepareElectronBackgroundUpdate(input);
  expect(invoke.mock.calls).toEqual([["check"], ["download"]]);
  expect(prepareLatest).not.toHaveBeenCalled();
});

it("stops between operations when the session closes", async () => {
  const { input, invoke, prepareLatest, controller, idle } = fixture();
  invoke.mockImplementation(async () => { controller.abort(); return { outcome: "accepted", snapshot: idle }; });
  await expect(prepareElectronBackgroundUpdate(input)).rejects.toThrow();
  expect(invoke.mock.calls).toEqual([["check"]]);
  expect(prepareLatest).not.toHaveBeenCalled();
});

it("propagates failed action outcomes to scheduler backoff", async () => {
  const { input, invoke, prepareLatest, idle } = fixture();
  invoke.mockResolvedValueOnce({ outcome: "failed", snapshot: { ...idle, state: "failed", error: { code: "offline", message: "offline" } } } as never);
  await expect(prepareElectronBackgroundUpdate(input)).rejects.toThrow("offline");
  expect(prepareLatest).not.toHaveBeenCalled();
});
