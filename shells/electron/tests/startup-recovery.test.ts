import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256Hex } from "@open-design/standalone";
import type { ElectronRecoveryTarget } from "@open-design/electron-kit";
import { recoverElectronProductStartup, type ElectronStartupRecoveryRequest } from "@/adapters/standalone/startup-recovery.js";

const state = vi.hoisted(() => ({
  guard: false, events: [] as string[], survivors: [] as { pid: number }[],
  platform: vi.fn(), recover: vi.fn(), metadata: vi.fn(), inspect: vi.fn(), seed: vi.fn(),
  readState: vi.fn(), armCapsule: vi.fn(), readCapsules: vi.fn(), verifyCapsule: vi.fn(),
  blob: vi.fn(), candidate: vi.fn(), fetchCapsule: vi.fn(), prepareCapsule: vi.fn(),
  lifecycle: vi.fn(), seal: vi.fn(), abandon: vi.fn(), updater: vi.fn(), updateLedger: vi.fn(),
  manifest: { productName: "Fixture", channel: "betahyx", namespace: "test-shell", shell: { version: "0.2.0", type: "electron" } },
}));
vi.mock("@open-design/electron-kit/installation/inspection", () => ({ readElectronInstalledManifest: async () => ({ manifest: state.manifest }) }));
vi.mock("@open-design/electron-kit/contracts", async original => ({ ...await original<typeof import("@open-design/electron-kit/contracts")>(),
  resolveElectronCompositeShellIdentity: () => ({}) }));
vi.mock("@open-design/standalone/packages/resource", () => ({ prepareNodePlatformResource: state.platform }));
vi.mock("@open-design/electron-kit/capsule-loader", () => ({ inspectElectronCapsule: state.inspect }));
vi.mock("@/adapters/standalone/release-feed.js", () => ({ ElectronReleaseExactFeed: class {
  readCapsule = state.fetchCapsule;
  prepareCapsule = state.prepareCapsule;
} }));
vi.mock("@/adapters/standalone/shell-updater-candidate.js", () => ({ ElectronStandaloneShellCandidateLedger: class { read = state.candidate; } }));
vi.mock("@/adapters/standalone/shell-updater-ledger.js", () => ({ ElectronStandaloneShellUpdaterLedger: class { read = state.updater; update = state.updateLedger; } }));
vi.mock("@/adapters/standalone/installation.js", () => ({ loadElectronInstalledCapsuleSeed: state.seed,
  loadElectronStandaloneInstallation: async () => ({ envelope: { metadata: { installed: true } }, trustedKeys: {},
    declaration: { releaseVersion: "0.2.0-betahyx.1", update: { channelHeadUrl: "https://invalid.test/betahyx/head.json" } } }),
  resolveElectronStandaloneTarget: () => "darwin-arm64" }));
vi.mock("@open-design/standalone", async original => ({
  ...await original<typeof import("@open-design/standalone")>(),
  verifyDocument: state.verifyCapsule,
  ensureStandaloneBlob: state.blob,
  StandaloneHostLifecycleLedger: class { read = state.lifecycle; },
  StandaloneHostLifecycle: class { forceStopTransition = state.seal; abandonStoppedTransition = state.abandon; },
  StandaloneStore: class {
    root = "/store";
    readState = state.readState;
    readGenerationMetadata = state.metadata;
    recoverGeneration = state.recover;
  },
  materializeStandaloneBlob: async () => { state.events.push("materialize"); return { path: "/verified-capsule" }; },
}));
vi.mock("@open-design/electron-kit", async original => ({
  ...await original<typeof import("@open-design/electron-kit")>(),
  readElectronCapsuleSelection: state.readCapsules,
  armElectronCapsuleSelection: state.armCapsule,
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
  session: { channel: "betahyx", namespace: "test-shell", presentation: "headless" } };
const envelope = { document: { archive: { sha256: "a".repeat(64), size: 12, treeSha256: "b".repeat(64) }, entrypoint: "capsule.cjs" } };
const selected = { capsuleManifestSha256: sha256Hex(canonicalJson(envelope)), closureGenerationId: "c".repeat(64) };

describe("stopped Electron exact recovery composition", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.events = []; state.survivors = []; state.guard = false;
    state.platform.mockImplementation(async () => { expect(state.guard).toBe(true); return {}; });
    state.blob.mockResolvedValue({ path: "/cached-capsule.zip" });
    state.lifecycle.mockResolvedValue(null);
    state.updater.mockResolvedValue({ state: "idle", revision: 0 });
    state.seal.mockResolvedValue({ fence: 8 });
    state.abandon.mockImplementation(async () => { state.events.push("restart-abandoned"); });
    state.updateLedger.mockImplementation(async () => { state.events.push("updater-failed"); });
    state.readCapsules.mockResolvedValue({ revision: 2, current: null, pending: null });
    state.seed.mockResolvedValue({ envelope, trustedKeys: {}, archivePath: "/installed/Resources/capsule.zip" });
    state.readState.mockResolvedValue({ revision: 7, active: "d".repeat(64), activationIntent: { generationId: selected.closureGenerationId } });
    state.metadata.mockResolvedValue({ metadata: {} });
    state.inspect.mockResolvedValue({ shell: { type: "electron", version: "0.3.0" }, manifest: { platform: { exact: true } } });
    state.recover.mockImplementation(async () => { expect(state.guard).toBe(true); state.events.push("rearm"); });
    state.armCapsule.mockImplementation(async () => { expect(state.guard).toBe(true); state.events.push("capsule-rearm"); });
  });
  it("prefers the authorized pending Closure and unblocks only after verified rearm under the shared guard", async () => {
    expect(await recoverElectronProductStartup(request)).toMatchObject({ target: selected });
    expect(state.metadata).toHaveBeenCalledWith(selected.closureGenerationId, {});
    expect(state.recover).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7, expectedGenerationId: selected.closureGenerationId,
      shell: { type: "electron", version: "0.3.0" } }), expect.objectContaining({ fetch: expect.any(Function) }));
    expect(state.armCapsule).toHaveBeenCalledWith(expect.objectContaining({ recovery: true, expectedRevision: 2,
      closureGenerationId: selected.closureGenerationId }));
    expect(state.platform).toHaveBeenCalledWith({ root: "/store/platform", resource: { exact: true }, recovery: true }, { fetch: expect.any(Function) });
    await expect(state.platform.mock.calls[0]![1].fetch()).rejects.toThrow("not authorized");
    expect(state.events).toEqual(["blockade", "materialize", "rearm", "capsule-rearm", "unblock"]);
  });
  it("does not start or retire another consumer to make repair succeed", async () => {
    state.survivors = [{ pid: 42 }];
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("shared resource set to be stopped");
    expect(state.events).toEqual([]); expect(state.recover).not.toHaveBeenCalled();
  });
  it("keeps recovery blocked when exact external platform preparation fails", async () => {
    state.platform.mockRejectedValueOnce(new Error("platform unavailable"));
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("platform unavailable");
    expect(state.events).toEqual(["blockade", "materialize"]);
    expect(state.recover).not.toHaveBeenCalled();
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
    expect(state.platform.mock.calls[0]![1]).not.toHaveProperty("fetch");
  });

  it("keeps a pending independent Capsule paired with its exact prepared Closure", async () => {
    const pendingEnvelope = { ...envelope, document: { ...envelope.document, version: "next-capsule" } };
    state.readCapsules.mockResolvedValue({ revision: 3, current: null,
      pending: { envelope: pendingEnvelope, root: "/verified-pending", closureGenerationId: selected.closureGenerationId } });
    const result = await recoverElectronProductStartup(request);
    expect(result.target).toEqual({ capsuleManifestSha256: sha256Hex(canonicalJson(pendingEnvelope)), closureGenerationId: selected.closureGenerationId });
    expect(state.armCapsule).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 3,
      capsule: expect.objectContaining({ envelope: pendingEnvelope, root: "/verified-pending" }) }));
    expect(state.events).toEqual(["blockade", "rearm", "capsule-rearm", "unblock"]);
  });

  it("requires an explicit choice when pending Capsule and authorized Closure disagree", async () => {
    state.readCapsules.mockResolvedValue({ revision: 3, current: null,
      pending: { envelope, root: "/pending", closureGenerationId: "f".repeat(64) } });
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("selections disagree");
    expect(state.events).toEqual([]);
  });

  it.each(["current", "pending"] as const)("recovers retained %s without reading the historical installation archive", async selection => {
    state.readCapsules.mockResolvedValue({ revision: 3, current: null, pending: null,
      [selection]: { envelope, root: "/retained-exact", closureGenerationId: selected.closureGenerationId } });
    state.seed.mockRejectedValueOnce(new Error("historical seed missing"));
    await expect(recoverElectronProductStartup(request)).resolves.toMatchObject({ target: selected });
    expect(state.seed).not.toHaveBeenCalled();
    expect(state.armCapsule).toHaveBeenCalledWith(expect.objectContaining({ capsule: expect.objectContaining({ root: "/retained-exact" }) }));
  });

  it("repairs a retained initial Capsule from its bound seed only after both exact caches are unavailable", async () => {
    state.readCapsules.mockResolvedValue({ revision: 3, current: { envelope, root: "/missing-initial" }, pending: null });
    state.inspect.mockRejectedValueOnce(new Error("initial tree missing"));
    state.blob.mockRejectedValueOnce(new Error("promoted cache missing")).mockRejectedValueOnce(new Error("initial cache missing"));
    await expect(recoverElectronProductStartup(request)).resolves.toMatchObject({ target: selected });
    expect(state.blob).toHaveBeenCalledTimes(2);
    expect(state.seed).toHaveBeenCalledTimes(1);
    expect(state.candidate).not.toHaveBeenCalled();
    expect(state.events).toEqual(["blockade", "materialize", "rearm", "capsule-rearm", "unblock"]);
  });

  it("reuses the original local Capsule cache without requiring its old installed archive", async () => {
    state.readCapsules.mockResolvedValue({ revision: 3, current: { envelope, root: "/missing-initial" }, pending: null });
    state.inspect.mockRejectedValueOnce(new Error("initial tree missing"));
    state.blob.mockRejectedValueOnce(new Error("promoted cache missing"));
    state.seed.mockRejectedValueOnce(new Error("historical seed missing"));
    await expect(recoverElectronProductStartup(request)).resolves.toMatchObject({ target: selected });
    expect(state.blob).toHaveBeenCalledTimes(2);
    expect(state.seed).not.toHaveBeenCalled();
    expect(state.candidate).not.toHaveBeenCalled();
  });

  it("does not fall back to the seed when retained selection state cannot be read", async () => {
    state.readCapsules.mockRejectedValueOnce(new Error("selection corrupt"));
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("selection corrupt");
    expect(state.seed).not.toHaveBeenCalled();
    expect(state.events).toEqual([]);
  });

  it("authenticates the retained Capsule before repairing any archive or Closure state", async () => {
    state.verifyCapsule.mockImplementationOnce(() => { throw new Error("untrusted selected Capsule"); });
    await expect(recoverElectronProductStartup(request)).rejects.toThrow("untrusted selected Capsule");
    expect(state.events).toEqual(["blockade"]);
    expect(state.recover).not.toHaveBeenCalled();
  });

  it.each(["offline", "exact", "different", "missing"] as const)("repairs missing Capsule bytes only from an explicitly allowed exact retained source (%s)", async mode => {
    const pendingEnvelope = { ...envelope, document: { ...envelope.document, version: "next-capsule" } };
    state.readCapsules.mockResolvedValue({ revision: 3, current: null,
      pending: { envelope: pendingEnvelope, root: "/missing-pending", closureGenerationId: selected.closureGenerationId } });
    state.inspect.mockRejectedValueOnce(new Error("selected tree missing"));
    state.blob.mockRejectedValueOnce(new Error("local archive missing")).mockRejectedValueOnce(new Error("initial archive missing"));
    state.candidate.mockResolvedValue(mode === "missing" ? null : { candidateId: "exact-release" });
    state.fetchCapsule.mockResolvedValue(mode === "different" ? envelope : pendingEnvelope);
    state.prepareCapsule.mockResolvedValue({ root: "/reacquired-exact" });
    const repair = recoverElectronProductStartup({ ...request, allowNetwork: mode !== "offline" });
    if (mode === "exact") {
      await expect(repair).resolves.toMatchObject({ target: { capsuleManifestSha256: sha256Hex(canonicalJson(pendingEnvelope)) } });
      expect(state.armCapsule).toHaveBeenCalledWith(expect.objectContaining({ capsule: expect.objectContaining({ root: "/reacquired-exact" }) }));
    } else {
      await expect(repair).rejects.toThrow(mode === "offline" ? "not authorized" : mode === "different" ? "differs from" : "no retained signed");
      expect(state.prepareCapsule).not.toHaveBeenCalled();
      expect(state.recover).not.toHaveBeenCalled();
      expect(state.events).not.toContain("unblock");
    }
    if (mode === "offline") expect(state.candidate).not.toHaveBeenCalled();
  });

  it.each(["reserved", "stopped-sealed"] as const)("abandons only its own interrupted restart after exact rearm (%s)", async phase => {
    state.updater.mockResolvedValue({ state: "handed-off", revision: 12, installAttemptId: "restart-1", handoff: { interaction: "restart-and-activate" } });
    state.lifecycle.mockResolvedValue({ transition: { token: "restart-1", kind: "content-restart", fence: 7, phase } });
    await recoverElectronProductStartup(request);
    expect(state.abandon).toHaveBeenCalledWith("restart-1", phase === "reserved" ? 8 : 7);
    expect(state.events).toEqual(["blockade", "materialize", "rearm", "capsule-rearm", "restart-abandoned", "updater-failed", "unblock"]);
    expect(state.updateLedger).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 12, state: "failed" }));
  });

  it("never abandons an unrelated or physical installer transition", async () => {
    state.updater.mockResolvedValue({ state: "handed-off", revision: 12, installAttemptId: "restart-1", handoff: { interaction: "restart-and-activate" } });
    for (const transition of [{ token: "other", kind: "content-restart" }, { token: "restart-1", kind: "shell-install" }]) {
      state.lifecycle.mockResolvedValue({ transition });
      await expect(recoverElectronProductStartup(request)).rejects.toThrow("another lifecycle transition");
    }
    expect(state.recover).not.toHaveBeenCalled();
    expect(state.abandon).not.toHaveBeenCalled();
    expect(state.events).not.toContain("unblock");
  });
});
