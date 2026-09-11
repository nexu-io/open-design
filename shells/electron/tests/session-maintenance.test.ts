import { expect, it, vi, afterEach } from "vitest";
import { withStoppedElectronSession } from "@/adapters/tools/lifecycle/session-maintenance.ts";
const state = vi.hoisted(() => ({ guard: vi.fn(), lease: vi.fn(), release: vi.fn(), mkdir: vi.fn(), realpath: vi.fn() }));
vi.mock("node:fs/promises", () => ({ lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }), mkdir: state.mkdir, realpath: state.realpath }));
vi.mock("@open-design/electron-kit", () => ({ resolveElectronSessionPaths: () => ({ namespaceRoot: "/owned", runtimeRoot: "/owned/runtime" }),
  resolveElectronSessionNamespace: () => "accept-test-headless", acquireElectronSessionLease: state.lease }));
vi.mock("@/adapters/standalone/guarded-lifecycle.ts", () => ({ withElectronStoppedResourceSet: state.guard }));
afterEach(() => vi.resetAllMocks());
const scope = { productName: "Fixture", channel: "betahyx", namespace: "accept-test", presentation: "headless" as const };
it("holds both guards through mutation and releases the lease on failure", async () => {
  state.realpath.mockResolvedValue("/owned");
  state.guard.mockImplementation(async (_declaration, bound, operation) => {
    expect(bound).toEqual({ channel: "betahyx", namespace: "accept-test-headless" });
    return operation();
  });
  state.lease.mockResolvedValue({ release: state.release });
  await expect(withStoppedElectronSession(scope, async paths => {
    expect(paths.namespaceRoot).toBe("/owned");
    expect(state.release).not.toHaveBeenCalled();
    throw new Error("mutation failed");
  })).rejects.toThrow("mutation failed");
  expect(state.release).toHaveBeenCalledOnce();
});
it("refuses redirected roots and live shared consumers before taking a lease", async () => {
  state.realpath.mockResolvedValue("/other");
  const operation = vi.fn();
  await expect(withStoppedElectronSession(scope, operation)).rejects.toThrow("canonical");
  state.realpath.mockResolvedValue("/owned");
  state.guard.mockRejectedValueOnce(new Error("live consumer"));
  await expect(withStoppedElectronSession(scope, operation)).rejects.toThrow("live consumer");
  expect(state.lease).not.toHaveBeenCalled(); expect(operation).not.toHaveBeenCalled();
});
