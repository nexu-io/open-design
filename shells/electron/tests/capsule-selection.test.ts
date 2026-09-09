import { beforeEach, expect, it, vi } from "vitest";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { loadInstalledElectronCapsule } from "@/adapters/standalone/capsule.js";

const state = vi.hoisted(() => ({ read: vi.fn(), seed: vi.fn(), trust: vi.fn(), load: vi.fn(), materialize: vi.fn() }));
vi.mock("@open-design/electron-kit", () => ({ readElectronCapsuleSelection: state.read }));
vi.mock("@open-design/electron-kit/capsule-loader", () => ({ createElectronCapsuleLoader: () => state.load }));
vi.mock("@/adapters/standalone/installation.js", () => ({
  loadElectronInstalledCapsuleSeed: state.seed, loadElectronInstalledTrust: state.trust,
  resolveElectronStandaloneTarget: () => "darwin-arm64",
}));
vi.mock("@open-design/standalone", async original => ({
  ...await original<typeof import("@open-design/standalone")>(), materializeStandaloneBlob: state.materialize,
}));
const manifest = { channel: "betahyx", shell: { type: "electron", version: "0.1.0" } } as ElectronShellManifest;
const installation = { resourceRoot: "/installed", runtimeRoot: "/runtime" };
const envelope = { document: { archive: { sha256: "a".repeat(64), size: 123, treeSha256: "b".repeat(64) }, entrypoint: "capsule.cjs" } };
beforeEach(() => {
  vi.resetAllMocks();
  state.trust.mockResolvedValue({ trustedKeys: { trusted: true } });
  state.seed.mockResolvedValue({ envelope, trustedKeys: { trusted: true }, archivePath: "/installed/capsule.zip" });
  state.materialize.mockResolvedValue({ path: "/materialized" });
});

it.each(["current", "pending"])("loads %s without consulting the bundled first-install seed", async selection => {
  state.read.mockResolvedValue({ revision: 3, current: { root: "/current", envelope },
    pending: selection === "pending" ? { root: "/pending", envelope } : null });
  await loadInstalledElectronCapsule(manifest, installation);
  expect(state.seed).not.toHaveBeenCalled(); expect(state.materialize).not.toHaveBeenCalled();
  expect(state.load).toHaveBeenCalledWith(expect.objectContaining({ root: `/${selection}`, trustedKeys: { trusted: true }, selectionRevision: 3 }));
});

it("materializes the local exact seed only for an empty lineage", async () => {
  state.read.mockResolvedValue({ revision: 0, current: null, pending: null });
  await loadInstalledElectronCapsule(manifest, installation);
  expect(state.seed).toHaveBeenCalledWith(expect.objectContaining({ carrierVersion: "0.1.0" }));
  expect(state.materialize).toHaveBeenCalledWith("/runtime/capsule", expect.objectContaining({ sources: [] }),
    "/installed/capsule.zip", expect.objectContaining({ type: "zip" }));
  expect(state.load).toHaveBeenCalledWith(expect.objectContaining({ root: "/materialized", envelope }));
});

it.each(["selection", "trust", "payload"])("does not fall back to bundled bytes on %s failure", async failure => {
  state.read.mockResolvedValue({ revision: 3, current: { root: "/current", envelope }, pending: null });
  ({ selection: state.read, trust: state.trust, payload: state.load })[failure]!
    .mockRejectedValueOnce(new Error("explicit recovery required"));
  await expect(loadInstalledElectronCapsule(manifest, installation)).rejects.toThrow("explicit recovery required");
  expect(state.seed).not.toHaveBeenCalled(); expect(state.materialize).not.toHaveBeenCalled();
});
