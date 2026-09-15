import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Remove the on-disk run directories owned by a project that is being deleted.
 *
 * Each run keeps `<runsDir>/<runId>/{events.jsonl,state.json}`. Those live
 * outside `PROJECTS_DIR` and are keyed by run id rather than nested under the
 * project, so `removeProjectDir` never reaches them — deleting a project used
 * to leave every run it ever produced behind, permanently and unreachable
 * (there is no project row left to list them from).
 *
 * Ownership is read from each run's own `state.json`, NOT from the run
 * service: `runs.list()` is backed by an in-memory Map that evicts a run as
 * soon as it reaches a terminal status, so by the time a user deletes a
 * project its finished runs are long gone from that view. `state.json`
 * records `projectId` and survives, which makes it the only durable
 * attribution for a historical run.
 *
 * Deliberately conservative: a directory is removed only when its
 * `state.json` parses AND names this project. An unreadable, malformed, or
 * absent state file leaves the directory alone — orphaning a few KB is
 * strictly better than deleting a run that belongs to a project the user is
 * keeping. Per-entry failures are swallowed so a permissions problem on one
 * run can never block the delete the user actually asked for.
 *
 * Returns the number of directories removed, for logging and tests.
 */
export async function removeRunDirsOwnedByProject(
  runsDir: string,
  projectId: string,
): Promise<number> {
  if (!runsDir || !projectId) return 0;
  let entries;
  try {
    entries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    // No runs directory yet (fresh install, or a daemon configured without
    // run logging) — nothing to reclaim.
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    let owner: unknown;
    try {
      const raw = await readFile(path.join(runDir, 'state.json'), 'utf8');
      owner = (JSON.parse(raw) as { projectId?: unknown }).projectId;
    } catch {
      continue; // unattributable — leave it alone
    }
    if (owner !== projectId) continue;
    try {
      await rm(runDir, { recursive: true, force: true });
      removed += 1;
    } catch {
      // Keep going; one undeletable run must not strand the rest.
    }
  }
  return removed;
}
