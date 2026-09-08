import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256Hex } from "@open-design/standalone";
import type { ElectronRecoveryTarget } from "@open-design/electron-kit";
import { recoverElectronProductStartup, type ElectronStartupRecoveryRequest } from "@/adapters/standalone/startup-recovery.js";

const state = vi.hoisted(() => ({
  guard: false, events: [] as string[], survivors: [] as { pid: number }[],
  platform: vi.fn(), recover: vi.fn(), metadata: vi.fn(), inspect: vi.fn(), seed: vi.fn(),
  readState: vi.fn(),
  manifest: { channel: "betahyx", namespace: "test-shell", shell: { version: "0.2.0", type: "electron" } },
}));
vi.mock("@open-design/electron-kit/installation/inspection", () => ({ readElectronInstalledManifest: async () => ({ manifest: state.manifest }) }));
vi.mock("@open-design/standalone/packages", () => ({ bindNodePlatform: state.platform }));
vi.mock("@open-design/electron-kit/capsule-loader", () => ({ inspectElectronCapsule: state.inspect }));
vi.mock("@/adapters/standalone/installation.js", () => ({ loadElectronInstalledCapsuleSeed: state.seed,
  loadElectronStandaloneInstallation: async () => ({ envelope: { metadata: { installed: true } }, candidates: {} }),
  resolveElectronStandaloneTarget: () => "darwin-arm64" }));
vi.mock("@open-design/standalone", async original => ({
  ...await original<typeof import("@open-design/standalone")>(),
  StandaloneStore: class {
    readState = state.readState;
    readGenerationMetadata = state.metadata;
    recoverGeneration = state.recover;
  },
  materializeStandaloneBlob: async () => { state.events.push("materialize"); return { path: "/verified-capsule" }; },
}));
vi.mock("@open-design/electron-kit", async original => ({
  ...await original<typeof import("@open-design/electron-kit")>(),
  recoverElectronStartup: async (input: { target?: ElectronRecoveryTarget; selectTarget(): Promise<ElectronRecoveryTarget>; repair(target: ElectronRecoveryTarget): Promise<void> }) => {
    expect(state.guard).toBe(true);
    const target = input.target ?? await input.selectTarget();
    state.events.push("blockade");
    await input.repair(target);
    expect(state.guard).toBe(true);
    state.events.push("unblock");
    return { schemaVersion: 1, target };
  },
}));
vi.mock("@open-design/sidecar/authority", async original => ({
  ...await original<typeof import("@open-design/sidecar/authority")>(),
  findSidecarProcesses: async () => state.survivors,
  withSidecarLifecycleLock: async (_stamps: unknown, run: () => Promise<unknown>) => {
    state.guard = true;
    try { return await run(); } finally { state.guard = false; }
  },
}));

const request: ElectronStartupRecoveryRequest = { schemaVersion: 1, resourceRoot: "/installed/Resources", installation: "installed",
  session: { baseUserDataRoot: "/test-data", channel: "betahyx", namespace: "test-shell", presentation: "headless" } };
const envelope = { document: { archive: { sha256: "a".repeat(64), size: 12, treeSha256: "b".repeat(64) }, entrypoint: "capsule.cjs" } };
const selected = { capsuleManifestSha256: sha256Hex(canonicalJson(envelope)), closureGenerationId: "c".repeat(64) };

describe("stopped Electron exact recovery composition", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.events = []; state.survivors = []; state.guard = false;
    state.platform.mockResolvedValue({});
    state.seed.mockResolvedValue({ envelope, trustedKeys: {}, archivePath: "/installed/Resources/capsule.zip" });
    state.readState.mockResolvedValue({ revision: 7, active: "d".repeat(64), activationIntent: { generationId: selected.closureGenerationId } });
    state.metadata.mockResolvedValue({ metadata: {} });
    state.inspect.mockResolvedValue({ shell: { type: "electron", version: "0.3.0" } });
    state.recover.mockImplementation(async () => { expect(state.guard).toBe(true); state.events.push("rearm"); });
  });
  it("prefers the authorized pending Closure and unblocks only after verified rearm under the shared guard", async () => {
    expect(await recoverElectronProductStartup(request)).toMatchObject({ target: selected });
    expect(state.metadata).toHaveBeenCalledWith(selected.closureGenerationId, {});
    expect(state.recover).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7, expectedGenerationId: selected.closureGenerationId,
      shell: { type: "electron", version: "0.3.0" } }), expect.objectContaining({ fetch: expect.any(Function) }));
    expect(state.events).toEqual(["blockade", "materialize", "rearm", "unblock"]);
  });
  it("does not start or retire another consumer to make repair succeed", async () => {
    state.survivors = [{ pid: 42 }];
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("shared resource set to be stopped");
    expect(state.events).toEqual([]); expect(state.recover).not.toHaveBeenCalled();
  });
  it("refuses physical damage before changing startup state", async () => {
    state.platform.mockRejectedValueOnce(new Error("physical package damaged"));
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("physical package damaged");
    expect(state.seed).not.toHaveBeenCalled(); expect(state.events).toEqual([]);
  });
  it("never substitutes installed Capsule bytes for a different exact target", async () => {
    await expect(recoverElectronProductStartup({ ...request, target: { ...selected, capsuleManifestSha256: "e".repeat(64) } })).rejects.toThrow("selected Capsule is not available");
    expect(state.events).toEqual(["blockade"]); expect(state.recover).not.toHaveBeenCalled();
  });
  it("uses the explicit installation baseline if the first startup failed before any Closure selection", async () => {
    state.readState.mockResolvedValue({ revision: 0, active: null, activationIntent: null });
    const result = await recoverElectronProductStartup(request);
    expect(result.target.closureGenerationId).toBe(sha256Hex(canonicalJson({ installed: true })));
    expect(state.metadata).not.toHaveBeenCalled();
    expect(state.recover).toHaveBeenCalledWith(expect.objectContaining({ envelope: { metadata: { installed: true } } }), expect.anything());
  });
  it("enables only exact signed resource reacquisition when online recovery is explicit", async () => {
    await recoverElectronProductStartup({ ...request, allowNetwork: true });
    expect(state.recover.mock.calls[0]![1]).not.toHaveProperty("fetch");
  });
});
