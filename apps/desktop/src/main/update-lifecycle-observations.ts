import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseUpdateLifecycleObservation, type UpdateLifecycleObservation } from "@open-design/contracts/analytics";
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
