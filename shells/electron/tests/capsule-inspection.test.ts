import { expect, it, vi, afterEach } from "vitest";
import { inspectElectronSelectedCapsule } from "@/adapters/tools/lifecycle/capsule-inspection.ts";
const mocks = vi.hoisted(() => ({ selection: vi.fn(), physical: vi.fn(), trust: vi.fn(), inspect: vi.fn() }));
vi.mock("@open-design/electron-kit", () => ({ resolveElectronSessionPaths: () => ({ runtimeRoot: "/owned/runtime" }),
  resolveElectronSessionNamespace: () => "fixture-headless", readElectronCapsuleSelection: mocks.selection }));
vi.mock("@open-design/electron-kit/capsule-loader", () => ({ inspectElectronCapsule: mocks.inspect }));
vi.mock("@open-design/electron-kit/installation/inspection", () => ({ readElectronInstalledManifest: mocks.physical }));
vi.mock("@/adapters/standalone/installation.ts", () => ({ loadElectronInstalledTrust: mocks.trust, resolveElectronStandaloneTarget: () => "darwin-arm64" }));
afterEach(() => vi.resetAllMocks());
const session = { productName: "Fixture", channel: "betahyx", namespace: "fixture", presentation: "headless" as const };
it("authenticates selected Capsule bytes with sealed installation trust, without loading code", async () => {
  const current = { envelope: { document: {} }, root: "/cached/capsule", closureGenerationId: "a".repeat(64) };
  mocks.selection.mockResolvedValue({ current, pending: null, revision: 3 });
  mocks.physical.mockResolvedValue({ manifest: { channel: "betahyx", productName: "Fixture", shell: { buildHash: "carrier" } } });
  mocks.trust.mockResolvedValue({ trustedKeys: { sealed: "key" } });
  mocks.inspect.mockResolvedValue({ shell: { buildHash: "logical" }, entrypoint: { sha256: "verified" } });
  expect(await inspectElectronSelectedCapsule(session, "/installed/Resources")).toMatchObject({ revision: 3,
    envelope: current.envelope, closureGenerationId: current.closureGenerationId, entrypoint: { sha256: "verified" } });
  expect(mocks.trust).toHaveBeenCalledWith({ resourceRoot: "/installed/Resources", channel: "betahyx", target: "darwin-arm64" });
  expect(mocks.inspect).toHaveBeenCalledWith({ envelope: current.envelope, root: current.root, trustedKeys: { sealed: "key" },
    carrier: { target: "darwin-arm64", shell: { buildHash: "carrier" } } });
  mocks.inspect.mockRejectedValueOnce(new Error("materialization digest mismatch"));
  await expect(inspectElectronSelectedCapsule(session, "/installed/Resources")).rejects.toThrow("digest mismatch");
});
it("refuses incomplete selections before consulting installation or downloaded bytes", async () => {
  for (const state of [{ current: null, pending: null }, { current: {}, pending: {} }]) {
    mocks.selection.mockResolvedValue(state);
    await expect(inspectElectronSelectedCapsule(session, "/installed/Resources")).rejects.toThrow("not committed");
  }
  expect(mocks.trust).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
