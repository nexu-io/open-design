// Bounded LRU snapshot of resolved project-card cover decisions.
//
// Resolving one card's cover costs a `/files` read plus a HEAD probe (or a
// deck document fetch). Returning to a home surface used to re-run that scan
// for every card in the grid even though nothing changed
// (evidence/electron-project-waterfall-20260727). This cache remembers the
// last successful decision per (workspace identity, project, version) so a remount
// renders covers immediately and only re-probes what actually changed.
//
// Scope and staleness rules (handoff §4.2):
// - The key carries the complete workspace authority identity, project id and the project's
//   `updatedAt` version; a content update that bumps the project version
//   misses the cache naturally, and covers never leak across workspaces.
// - The stored value carries the preview file identity (name + mtime) inside
//   `ProjectCoverOverride`.
// - `team-project-content-ready` (owner pushed new content) explicitly
//   invalidates the project's entries before the forced re-probe.
// - The map is capped: least-recently-used entries fall out, so this never
//   becomes an unbounded process-global cache.

import type { ProjectCoverOverride } from '../components/project-cover';

const MAX_COVER_SNAPSHOT_ENTRIES = 300;

interface ProjectCoverSnapshot {
  /** `null` is an authoritative "this project has no cover" decision. */
  cover: ProjectCoverOverride | null;
}

const snapshots = new Map<string, ProjectCoverSnapshot>();

export function projectCoverSnapshotKey(
  workspaceIdentity: string | null | undefined,
  projectId: string,
  version: number,
): string {
  return `${workspaceIdentity ?? 'local'}|${projectId}|${version}`;
}

/** `undefined` means "no snapshot"; a snapshot may hold a `null` cover. */
export function getProjectCoverSnapshot(key: string): ProjectCoverSnapshot | undefined {
  const entry = snapshots.get(key);
  if (entry === undefined) return undefined;
  // LRU touch: re-insert so iteration order tracks recency.
  snapshots.delete(key);
  snapshots.set(key, entry);
  return entry;
}

export function setProjectCoverSnapshot(
  key: string,
  cover: ProjectCoverOverride | null,
): void {
  snapshots.delete(key);
  snapshots.set(key, { cover });
  while (snapshots.size > MAX_COVER_SNAPSHOT_ENTRIES) {
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) break;
    snapshots.delete(oldest);
  }
}

/**
 * Drop every stored version of one project's cover (all workspaces). Used
 * when authoritative content-changed events arrive so the next request
 * re-probes instead of serving the stale decision.
 */
export function invalidateProjectCoverSnapshots(projectId: string): void {
  for (const key of [...snapshots.keys()]) {
    const parts = key.split('|');
    if (parts[1] === projectId) snapshots.delete(key);
  }
}

/** Test-only: reset the cache between cases. */
export function resetProjectCoverSnapshots(): void {
  snapshots.clear();
}
