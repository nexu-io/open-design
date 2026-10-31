import { randomUUID } from "node:crypto";
import { access, link, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { updateStageMetricSchema, type UpdateStageMetric, parseUpdateLifecycleObservation, type UpdateLifecycleObservation } from "@open-design/contracts/analytics";
import { isSafeInstallerObservationFlowId, type InstallerObservationHandle } from "./installer-observations.js";

export type { UpdateLifecycleObservation } from "@open-design/contracts/analytics";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Local best-effort telemetry must never hold an updater transition indefinitely. */
async function boundedObservation(work: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work).catch(() => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 100); }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/** One immutable file per stage. Old/new processes never rewrite each other's summary. */
export async function recordUpdateLifecycle(
  handle: InstallerObservationHandle | null,
  observation: UpdateLifecycleObservation,
): Promise<void> {
  if (handle == null) return;
  await boundedObservation(async () => {
    const event = parseUpdateLifecycleObservation(observation);
    if (event == null || !isSafeInstallerObservationFlowId(handle.flowId)) return;
    const root = join(dirname(handle.summaryPath), "lifecycle");
    await mkdir(root, { recursive: true });
    const destination = join(root, `${event.stage}.json`);
    const temporary = join(root, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ ...event, flow_id: handle.flowId, occurred_at: new Date().toISOString(), observation_version: 1 }));
      await link(temporary, destination); // First observation wins, even across processes.
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  });
}

/** Older clients already persist these summaries; absent stages remain unknown. */
export async function findIncomingUpdateObservation(input: {
  root: string | null | undefined; namespace: string; channel: string; version: string | null;
}): Promise<InstallerObservationHandle | null> {
  if (input.root == null || input.version == null) return null;
  try {
    const candidates: Array<InstallerObservationHandle & { at: number }> = [];
    for (const entry of await readdir(input.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isSafeInstallerObservationFlowId(entry.name)) continue;
      const summaryPath = join(input.root, entry.name, "summary.json");
      try {
        const summary = JSON.parse(await readFile(summaryPath, "utf8"));
        const at = Date.parse(summary.attemptedAt);
        if (summary.schemaVersion === 1 && summary.kind === "installer_apply_observation" &&
            summary.flowId === entry.name && summary.namespace === input.namespace && summary.channel === input.channel &&
            summary.toVersion === input.version && summary.reason !== "installer_open_failed" &&
            Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at < TTL_MS) {
          candidates.push({ flowId: entry.name, summaryPath, at });
        }
      } catch { /* An incomplete legacy observation is not an updater failure. */ }
    }
    candidates.sort((a, b) => b.at - a.at || a.flowId.localeCompare(b.flowId));
    return candidates[0] ?? null;
  } catch { return null; }
}

export async function recordIncomingUpdateLifecycle(
  input: Parameters<typeof findIncomingUpdateObservation>[0], observation: UpdateLifecycleObservation,
): Promise<void> {
  await boundedObservation(async () => recordUpdateLifecycle(await findIncomingUpdateObservation(input), observation));
}


/** Immutable records, ordered by the updater's bounded journal queue. No network IO. */
export async function recordUpdateStage(
  handle: InstallerObservationHandle,
  event: UpdateStageMetric,
  context: { namespace: string; appVersion?: string | null; sessionId: string | null; osVersion: string | null; channel: string; platform: string; arch: string; occurredAt: string },
): Promise<void> {
  const parsed = updateStageMetricSchema.safeParse(event);
  if (!parsed.success || !isSafeInstallerObservationFlowId(handle.flowId)) return;
  const root = join(dirname(handle.summaryPath), 'stages');
  const temporary = join(root, `.${randomUUID()}.tmp`);
  await mkdir(root, { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify({ ...parsed.data, namespace: context.namespace,
      app_session_id: context.sessionId, channel: context.channel, platform: context.platform,
      arch: context.arch, os_version: context.osVersion, app_version: context.appVersion === undefined ? event.from_version : context.appVersion, occurred_at: context.occurredAt,
      metric_schema_version: 1, telemetry_capability: 'supported',
    }));
    await link(temporary, join(root, `${event.stage}-${event.result === 'started' ? 'started' : 'result'}.json`));
  } finally { await unlink(temporary).catch(() => undefined); }
}


/** Every update check opens a flow; drop stage-only flows once replay can no
 * longer use them. Installer flows (with summary.json) are left untouched. */
async function pruneExpiredStageOnlyFlow(flowRoot: string, now: Date): Promise<boolean> {
  try {
    if (await access(join(flowRoot, "summary.json")).then(() => true, () => false)) return false;
    const age = now.getTime() - (await stat(join(flowRoot, "stages"))).mtimeMs;
    if (!(age > TTL_MS + 24 * 60 * 60 * 1000)) return false;
    await rm(flowRoot, { recursive: true, force: true });
    return true;
  } catch { return false; }
}

/** Only a different desktop session can close a restart attempt. Daemon-only
 * restarts and repeated window-ready callbacks cannot infer application restart. */
export async function recordIncomingUpdateStageResults(input: {
  root: string | null | undefined; namespace: string; channel: string; version: string | null;
  sessionId: string | null; osVersion: string | null; platform: string; arch: string;
  now?: () => Date;
}): Promise<void> {
  if (input.root == null) return;
  try {
    const now = input.now?.() ?? new Date();
    let recorded = 0;
    let pruned = 0;
    for (const entry of await readdir(input.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isSafeInstallerObservationFlowId(entry.name)) continue;
      if (pruned < 256 && await pruneExpiredStageOnlyFlow(join(input.root, entry.name), now)) { pruned += 1; continue; }
      try {
        const raw = JSON.parse(await readFile(join(input.root, entry.name, 'stages/restart-started.json'), 'utf8'));
        const parsed = updateStageMetricSchema.safeParse(raw);
        const age = now.getTime() - Date.parse(raw.occurred_at);
        if (!parsed.success || parsed.data.stage !== 'restart' || parsed.data.result !== 'started' ||
            parsed.data.flow_id !== entry.name || raw.namespace !== input.namespace || raw.channel !== input.channel ||
            raw.metric_schema_version !== 1 || !Number.isFinite(age) || age < 0 || age > TTL_MS ||
            (input.sessionId != null && raw.app_session_id === input.sessionId)) continue;
        const { from_version: from, to_version: to } = parsed.data;
        const unprovenSession = input.sessionId == null || typeof raw.app_session_id !== 'string';
        const result: UpdateStageMetric['result'] = unprovenSession || input.version == null || from === to ? 'unknown'
          : input.version === to ? 'success' : input.version === from ? 'not_applied' : 'unknown';
        const reason: UpdateStageMetric['reason_code'] = unprovenSession ? 'legacy_observation'
          : from === to ? 'same_version_reinstall' : result === 'success' ? 'version_matches'
          : result === 'not_applied' ? 'version_unchanged' : 'identity_mismatch';
        await recordUpdateStage({ flowId: entry.name, summaryPath: join(input.root, entry.name, 'summary.json') },
          { ...parsed.data, result, reason_code: reason, duration_ms: null }, {
            namespace: input.namespace, channel: input.channel, sessionId: input.sessionId,
            platform: input.platform, arch: input.arch, osVersion: input.osVersion,
            appVersion: input.version, occurredAt: now.toISOString(),
          });
        if (++recorded >= 64) break;
      } catch { /* Absent, legacy, already recorded or damaged observations stay unknown. */ }
    }
  } catch { /* Storage failures cannot affect desktop startup. */ }
}
