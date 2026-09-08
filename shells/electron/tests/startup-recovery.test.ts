import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256Hex } from "@open-design/standalone";
import type { ElectronRecoveryTarget } from "@open-design/electron-kit";
import { recoverElectronProductStartup, type ElectronStartupRecoveryRequest } from "@/adapters/standalone/startup-recovery.js";

const state = vi.hoisted(() => ({
  guard: false, events: [] as string[], survivors: [] as { pid: number }[],
  platform: vi.fn(), recover: vi.fn(), metadata: vi.fn(), inspect: vi.fn(), seed: vi.fn(),
  readState: vi.fn(), armCapsule: vi.fn(), readCapsules: vi.fn(), verifyCapsule: vi.fn(),
  blob: vi.fn(), candidate: vi.fn(), fetchCapsule: vi.fn(), prepareCapsule: vi.fn(),
  manifest: { channel: "betahyx", namespace: "test-shell", shell: { version: "0.2.0", type: "electron" } },
}));
vi.mock("@open-design/electron-kit/installation/inspection", () => ({ readElectronInstalledManifest: async () => ({ manifest: state.manifest }) }));
vi.mock("@open-design/electron-kit/contracts", async original => ({ ...await original<typeof import("@open-design/electron-kit/contracts")>(),
  resolveElectronCompositeShellIdentity: () => ({}) }));
vi.mock("@open-design/standalone/packages", () => ({ bindNodePlatform: state.platform }));
vi.mock("@open-design/electron-kit/capsule-loader", () => ({ inspectElectronCapsule: state.inspect }));
vi.mock("@/adapters/standalone/release-feed.js", () => ({ ElectronReleaseExactFeed: class {
  readCapsule = state.fetchCapsule;
  prepareCapsule = state.prepareCapsule;
} }));
vi.mock("@/adapters/standalone/shell-updater-candidate.js", () => ({ ElectronStandaloneShellCandidateLedger: class { read = state.candidate; } }));
vi.mock("@/adapters/standalone/installation.js", () => ({ loadElectronInstalledCapsuleSeed: state.seed,
  loadElectronStandaloneInstallation: async () => ({ envelope: { metadata: { installed: true } }, candidates: {},
    declaration: { releaseVersion: "0.2.0-betahyx.1", update: { channelHeadUrl: "https://invalid.test/betahyx/head.json" } } }),
  resolveElectronStandaloneTarget: () => "darwin-arm64" }));
vi.mock("@open-design/standalone", async original => ({
  ...await original<typeof import("@open-design/standalone")>(),
  verifyDocument: state.verifyCapsule,
  ensureStandaloneBlob: state.blob,
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
  session: { baseUserDataRoot: "/test-data", channel: "betahyx", namespace: "test-shell", presentation: "headless" } };
const envelope = { document: { archive: { sha256: "a".repeat(64), size: 12, treeSha256: "b".repeat(64) }, entrypoint: "capsule.cjs" } };
const selected = { capsuleManifestSha256: sha256Hex(canonicalJson(envelope)), closureGenerationId: "c".repeat(64) };

describe("stopped Electron exact recovery composition", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.events = []; state.survivors = []; state.guard = false;
    state.platform.mockResolvedValue({});
    state.blob.mockResolvedValue({ path: "/cached-capsule.zip" });
    state.readCapsules.mockResolvedValue({ revision: 2, current: null, pending: null });
    state.seed.mockResolvedValue({ envelope, trustedKeys: {}, archivePath: "/installed/Resources/capsule.zip" });
    state.readState.mockResolvedValue({ revision: 7, active: "d".repeat(64), activationIntent: { generationId: selected.closureGenerationId } });
    state.metadata.mockResolvedValue({ metadata: {} });
    state.inspect.mockResolvedValue({ shell: { type: "electron", version: "0.3.0" } });
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
    expect(state.events).toEqual(["blockade", "materialize", "rearm", "capsule-rearm", "unblock"]);
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
    state.blob.mockRejectedValueOnce(new Error("local archive missing"));
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
});
