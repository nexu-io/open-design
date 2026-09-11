import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { updateAcceptanceSameCarrier } from "@/exact/acceptance.ts";

const calls = vi.hoisted(() => ({ bound: vi.fn(), inspect: vi.fn(), prepare: vi.fn(), apply: vi.fn(), startup: vi.fn(), shutdown: vi.fn(), close: vi.fn(), closure: vi.fn() }));
vi.mock("@open-design/shell-electron/lifecycle/inspection", () => ({ inspectElectronBoundCapsule: calls.bound, inspectElectronSelectedCapsule: calls.inspect,
  prepareElectronShellThroughCdp: calls.prepare, applyElectronShellThroughCdp: calls.apply, inspectElectronStartupThroughCdp: calls.startup,
  waitForElectronShutdown: calls.shutdown, closeElectronDiagnosticSession: calls.close, updateElectronClosureThroughCdp: calls.closure,
  describeElectronRuntimeDiagnostics: vi.fn() }));
vi.mock("@/exact/control-release.ts", () => ({ acceptInstalledRelease: vi.fn() }));
vi.mock("@/exact/installed-acceptance.ts", () => ({ readPublishedAcceptance: async () => ({
  required: { installIdentity: { namespace: "fixture" } }, policy: { channel: "betahyx" } }) }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "capsule-acceptance-")); roots.push(root);
  const firstInstallRoot = join(root, "first");
  const expected = { document: { version: "candidate" }, signatures: [] };
  const before = { envelope: { document: { version: "baseline" }, signatures: [] }, shell: { version: "1.0.0", buildHash: "old" }, revision: 1, closureGenerationId: "a".repeat(64) };
  const after = { envelope: expected, shell: { version: "1.0.0", buildHash: "new" }, revision: 2, closureGenerationId: "b".repeat(64) };
  calls.bound.mockResolvedValue(after);
  calls.inspect.mockResolvedValueOnce(before).mockResolvedValue(after);
  calls.prepare.mockResolvedValue({ results: [{ lines: { shell: { state: "ready" } } }] });
  calls.apply.mockResolvedValue({ results: [{ outcome: "context-destroyed" }] });
  calls.startup.mockResolvedValue({ attemptId: "upgraded", results: [{ lines: { shell: { state: "current" } } }] });
  calls.shutdown.mockResolvedValue(undefined); calls.close.mockResolvedValue(undefined);
  return { before, after, input: { publication: "publication.json", policy: "policy.json", shell: "electron", target: "darwin-arm64",
    namespace: "hot-acceptance", installedRoot: join(root, "old"), candidateRoot: firstInstallRoot, receipt: join(root, "proof.json") } };
}
it("uses the isolated Closure updater when the authenticated Capsule is unchanged", async () => {
  const f = await fixture(); calls.inspect.mockReset().mockResolvedValue({ ...f.before, shell: f.after.shell }); calls.closure.mockResolvedValue({ operation: "closure-proof" });
  await updateAcceptanceSameCarrier(f.input);
  expect(calls.closure).toHaveBeenCalledOnce(); expect(calls.prepare).not.toHaveBeenCalled();
});
it("proves Capsule and Closure replacement through prepare, apply, committed restart and shutdown", async () => {
  const f = await fixture(); await updateAcceptanceSameCarrier(f.input);
  const proof = JSON.parse(await readFile(f.input.receipt, "utf8"));
  expect(proof).toMatchObject({ operation: "electron.capsule.upgrade", before: f.before, after: f.after, restarted: { attemptId: "upgraded" } });
  expect(calls.closure).not.toHaveBeenCalled();
  expect(calls.apply.mock.invocationCallOrder[0]).toBeGreaterThan(calls.prepare.mock.invocationCallOrder[0]!);
  expect(calls.inspect.mock.invocationCallOrder[1]).toBeGreaterThan(calls.shutdown.mock.invocationCallOrder[0]!);
});
it("does not authorize apply when Shell preparation is blocked", async () => {
  const f = await fixture(); calls.prepare.mockResolvedValue({ results: [{ lines: { shell: { state: "blocked" } } }] });
  await expect(updateAcceptanceSameCarrier(f.input)).rejects.toThrow("did not prepare"); expect(calls.apply).not.toHaveBeenCalled();
});
it("rejects a no-op apply before waiting for a restart and retains its response", async () => {
  const f = await fixture();
  calls.apply.mockResolvedValue({ results: [{ lines: { shell: { state: "ready" } } }] });
  await expect(updateAcceptanceSameCarrier(f.input)).rejects.toThrow("did not start");
  expect(calls.startup).not.toHaveBeenCalled();
  const stages = JSON.parse(await readFile(f.input.receipt + ".stages.json", "utf8"));
  expect(stages.applied.results[0].lines.shell.state).toBe("ready");
  await expect(readFile(f.input.receipt)).rejects.toThrow();
});
it.each(["startup", "shutdown", "wrong-capsule", "unchanged-generation"])("fails %s and closes the caller-owned relaunch without writing success", async fault => {
  const f = await fixture();
  if (fault === "startup") calls.startup.mockRejectedValue(new Error("startup failed"));
  if (fault === "shutdown") calls.shutdown.mockRejectedValue(new Error("shutdown failed"));
  if (fault === "wrong-capsule") calls.inspect.mockReset().mockResolvedValue(f.before);
  if (fault === "unchanged-generation") calls.inspect.mockReset().mockResolvedValueOnce(f.before).mockResolvedValue({ ...f.after, closureGenerationId: f.before.closureGenerationId });
  await expect(updateAcceptanceSameCarrier(f.input)).rejects.toThrow(); expect(calls.close).toHaveBeenCalledOnce();
  await expect(readFile(f.input.receipt)).rejects.toThrow();
});
