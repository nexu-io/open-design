import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { describeElectronRuntimeDiagnostics, inspectElectronStartupThroughCdp, waitForElectronShutdown } from "@/adapters/tools/lifecycle/inspection.ts";
const cdp = vi.hoisted(() => vi.fn());
vi.mock("@open-design/electron-kit/cdp", () => ({ executeElectronCdpContractControl: cdp }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "startup-inspection-")); roots.push(root);
  const session = { baseUserDataRoot: root, channel: "betahyx", namespace: "fixture", presentation: "headless" as const };
  const log = describeElectronRuntimeDiagnostics(session).runtimeLog;
  await mkdir(dirname(log), { recursive: true });
  return { session, log };
}
const events = (timestamp: string, attemptId: string) => ["capsule.startup.ready", "startup.committed"]
  .map(event => JSON.stringify({ event, timestamp, attemptId }) + "\n").join("");
it("does not reuse old startup evidence when closing a restarted process", async () => {
  const f = await fixture(), now = Date.now();
  await writeFile(f.log, events(new Date(now - 1_000).toISOString(), "old"));
  const pending = inspectElectronStartupThroughCdp(f.session, now);
  expect(cdp).not.toHaveBeenCalled();
  await appendFile(f.log, events(new Date(now).toISOString(), "new"));
  expect(await pending).toMatchObject({ attemptId: "new" });
  expect(cdp).toHaveBeenCalledWith(expect.objectContaining({ close: true, session: f.session, timeoutMs: 120_000,
    invocations: [{ path: ["updater", "status"], args: [] }] }));
});
it("reports failed startup without treating an open CDP port as readiness", async () => {
  const f = await fixture(), now = Date.now();
  await writeFile(f.log, JSON.stringify({ event: "startup.failed", timestamp: new Date(now).toISOString(), attemptId: "failed" }) + "\n");
  await expect(inspectElectronStartupThroughCdp(f.session, now, 1_000)).rejects.toThrow("startup failed");
  expect(cdp).not.toHaveBeenCalled();
});
it("does not count the outgoing process shutdown as the relaunched process exit", async () => {
  const f = await fixture(), now = Date.now(), timestamp = new Date(now).toISOString();
  await writeFile(f.log, JSON.stringify({ event: "shutdown.complete", timestamp, attemptId: "old" }) + "\n" + events(timestamp, "new"));
  await expect(waitForElectronShutdown(f.session, now, 1)).rejects.toThrow("shutdown did not complete");
  await appendFile(f.log, JSON.stringify({ event: "shutdown.complete", timestamp, attemptId: "new" }) + "\n");
  await expect(waitForElectronShutdown(f.session, now, 1)).resolves.toBeUndefined();
});
