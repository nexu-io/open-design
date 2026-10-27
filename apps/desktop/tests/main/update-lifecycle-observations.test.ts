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

import { recordIncomingUpdateStageResults, recordUpdateStage } from '../../src/main/update-lifecycle-observations.js';
it.each(['installer', 'payload'] as const)('closes %s restart only after a different desktop session becomes ready', async artifact => {
  for (const trigger of ['manual', 'silent'] as const) for (const outcome of ['success', 'not_applied', 'unknown', 'same_version'] as const) {
    const { root, handle } = await fixture();
    const started = new Date(Date.now() - 500);
    const toVersion = outcome === 'same_version' ? '1.0.0' : '1.0.1';
    await recordUpdateStage(handle, { flow_id: handle.flowId, stage: 'restart', result: 'started', reason_code: null,
      from_version: '1.0.0', to_version: toVersion, update_path: artifact === 'payload' ? 'payload' : 'installer',
      artifact_type: artifact, trigger, duration_ms: null,
    }, { namespace: 'test', sessionId: 'previous-desktop', osVersion: null, channel: 'prerelease', platform: 'darwin', arch: 'arm64', occurredAt: started.toISOString() });
    const input = { root, namespace: 'test', channel: 'prerelease', version: outcome === 'success' ? toVersion : outcome === 'unknown' ? '2.0.0' : '1.0.0',
      sessionId: 'previous-desktop', osVersion: null, platform: 'darwin', arch: 'arm64' };
    await recordIncomingUpdateStageResults(input);
    const resultPath = join(root, handle.flowId, 'stages/restart-result.json');
    await expect(readFile(resultPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await recordIncomingUpdateStageResults({ ...input, sessionId: 'new-desktop' });
    const first = await readFile(resultPath, 'utf8');
    expect(JSON.parse(first)).toMatchObject({ flow_id: handle.flowId, stage: 'restart', trigger,
      result: outcome === 'same_version' ? 'unknown' : outcome, app_version: input.version, app_session_id: 'new-desktop',
      reason_code: outcome === 'success' ? 'version_matches' : outcome === 'not_applied' ? 'version_unchanged'
        : outcome === 'same_version' ? 'same_version_reinstall' : 'identity_mismatch' });
    await recordIncomingUpdateStageResults({ ...input, sessionId: 'another-desktop', version: '3.0.0' });
    expect(await readFile(resultPath, 'utf8')).toBe(first);
  }
});
it('does not fail startup when no incoming restart journal exists', async () => {
  const { root } = await fixture();
  await expect(recordIncomingUpdateStageResults({ root, namespace: 'test', channel: 'prerelease', version: '1.0.1',
    sessionId: 'new-desktop', osVersion: null, platform: 'darwin', arch: 'arm64',
  })).resolves.toBeUndefined();
});
it('prunes expired stage-only check flows but keeps installer flows', async () => {
  const { root, handle } = await fixture();
  const { mkdir, utimes, writeFile, access } = await import('node:fs/promises');
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const checkOnly = join(root, 'check-only-flow');
  await mkdir(join(checkOnly, 'stages'), { recursive: true });
  await writeFile(join(checkOnly, 'stages', 'check-result.json'), '{}');
  await utimes(join(checkOnly, 'stages'), old, old);
  await mkdir(join(root, 'flow', 'stages'), { recursive: true });
  await utimes(join(root, 'flow', 'stages'), old, old);
  await recordIncomingUpdateStageResults({ root, namespace: 'test', channel: 'prerelease', version: '1.0.1',
    sessionId: 'new-desktop', osVersion: null, platform: 'darwin', arch: 'arm64' });
  await expect(access(checkOnly)).rejects.toThrow();
  await expect(access(handle.summaryPath)).resolves.toBeUndefined();
});
