import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writePendingInstallerObservation } from "../../src/main/installer-observations.js";
import { findIncomingUpdateObservation, recordIncomingUpdateLifecycle, recordUpdateLifecycle } from "../../src/main/update-lifecycle-observations.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-update-stages-")); roots.push(root);
  const handle = await writePendingInstallerObservation({ root, flowId: "flow", platform: "darwin", arch: "arm64", artifactType: "payload", channel: "prerelease", namespace: "test", fromVersion: "0.22.2-prerelease.2", toVersion: "0.22.2-prerelease.3", attemptedAt: new Date(Date.now() - 1000).toISOString() });
  return { root, handle };
}
it("keeps concurrent old and new stages without modifying the legacy summary", async () => {
  const { handle } = await fixture();
  const before = await readFile(handle.summaryPath, "utf8");
  await Promise.all([
    recordUpdateLifecycle(handle, { stage: "shutdown_completed", outcome: "completed", repeated_quit_count: 2, duration_ms: 32000 }),
    recordUpdateLifecycle(handle, { stage: "desktop_ready", outcome: "completed" }),
  ]);
  expect(await readFile(handle.summaryPath, "utf8")).toBe(before);
  const path = join(handle.summaryPath, "..", "lifecycle", "desktop_ready.json");
  const first = await readFile(path, "utf8");
  await recordUpdateLifecycle(handle, { stage: "desktop_ready", outcome: "failed" });
  expect(await readFile(path, "utf8")).toBe(first);
});
it("correlates legacy observations only to the same target version and identity", async () => {
  const { root, handle } = await fixture();
  const identity = { root, namespace: "test", channel: "prerelease", version: "0.22.2-prerelease.3" };
  expect(await findIncomingUpdateObservation(identity)).toMatchObject(handle);
  expect(await findIncomingUpdateObservation({ ...identity, version: "0.22.2-prerelease.2" })).toBeNull();
  expect(await findIncomingUpdateObservation({ ...identity, channel: "stable" })).toBeNull();
  expect(await findIncomingUpdateObservation({ ...identity, namespace: "other" })).toBeNull();
  await recordIncomingUpdateLifecycle(identity, { stage: "desktop_ready", outcome: "completed" });
  const event = JSON.parse(await readFile(join(root, "flow/lifecycle/desktop_ready.json"), "utf8"));
  expect(event.flow_id).toBe("flow");
  expect(event.observation_version).toBe(1);
});
it("never makes update transitions fail when the journal is unavailable", async () => {
  const { handle } = await fixture();
  await expect(recordUpdateLifecycle({ ...handle, summaryPath: join(handle.summaryPath, "unavailable", "summary.json") }, { stage: "shutdown_completed", outcome: "completed" })).resolves.toBeUndefined();
});
