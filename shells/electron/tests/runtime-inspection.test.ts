import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { StandaloneStore } from "@open-design/standalone";
import { resolveElectronNamespacePaths, resolveElectronRuntimeLogPath } from "@open-design/electron-kit";
import { describeElectronRuntimeDiagnostics, updateElectronClosureThroughCdp } from "@/adapters/tools/lifecycle/inspection.js";
import { resolveElectronStandaloneStoreRoot } from "@/adapters/standalone/store-root.js";
const mock = vi.hoisted(() => ({ invoke: vi.fn(async () => ({ discoveryUrl: "http://127.0.0.1:1234", results: [] })) }));
vi.mock("@open-design/electron-kit/cdp", () => ({ executeElectronCdpContractControl: mock.invoke }));
const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("projects the same producer locations without starting Electron or touching the filesystem", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-inspection-")); roots.push(root);
  const scope = { channel: "betahyx", namespace: "inspection-headless" };
  const paths = resolveElectronNamespacePaths(root, scope), store = new StandaloneStore(resolveElectronStandaloneStoreRoot(paths.runtimeRoot), scope);
  const result = describeElectronRuntimeDiagnostics({ baseUserDataRoot: root, channel: scope.channel, namespace: "inspection", presentation: "headless" });
  expect(result).toEqual({ runtimeLog: resolveElectronRuntimeLogPath(paths.runtimeRoot), standaloneState: store.diagnosticPaths.stateFile, standaloneGenerationsRoot: store.diagnosticPaths.generationsRoot });
  expect(await readdir(root)).toEqual([]);
  expect(() => describeElectronRuntimeDiagnostics({ baseUserDataRoot: root, channel: "../bad", namespace: "inspection", presentation: "headless" })).toThrow();
});

it("uses the declared Closure updater contract over native CDP with no request file", async () => {
  const session = { baseUserDataRoot: join(tmpdir(), "electron-inspection"), channel: "betahyx", namespace: "inspection", presentation: "headless" as const };
  expect(await updateElectronClosureThroughCdp(session)).toMatchObject({ schemaVersion: 1, operation: "electron.cdp.contract.invoked" });
  expect(mock.invoke).toHaveBeenCalledWith({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session, close: true, timeoutMs: 120_000,
    invocations: [{ path: ["updater", "status"], args: [] }, { path: ["updater", "check"], args: ["closure"] },
      { path: ["updater", "apply"], args: ["closure", { force: true }], settleOnContextDestroyed: true }, { path: ["updater", "status"], args: [] }] });
});
