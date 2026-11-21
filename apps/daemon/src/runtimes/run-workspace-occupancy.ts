/**
 * Workspace-occupancy guard for chat Runs.
 *
 * A folder-backed project (`metadata.baseDir` set) points a Run at a real
 * directory on the user's disk. Two live Runs whose agents write that same
 * directory race on identical files: two automation-driven Runs on one
 * folder-backed project, admitted 34 ms apart, both burned tokens against the
 * same workspace while corrupting each other's edits.
 *
 * Scope, deliberately narrow:
 * - Only EXTERNAL workspaces are gated (folder-backed `baseDir`, including
 *   orchestrator scratch workspaces, which also carry a baseDir). Od-owned
 *   projects resolve to null and stay ungated: their runs write OD-managed
 *   per-project storage, the web composer already queues same-conversation
 *   turns, and ordinary concurrent turns on one od-owned project are
 *   documented, tested behavior (see `run-enrichment-dedupe.test.ts`).
 * - Two project rows importing the SAME directory share one identity, because
 *   the collision is on the directory, not on the project row.
 * - A blocking run with `cancelRequested` does not block: the composer's
 *   "send now" interrupt cancels the old run and immediately posts the new
 *   turn while the old child is still draining. Overlapping a dying child is
 *   the pre-existing behavior; refusing it would break the interrupt.
 * - A run is "live" exactly while it is non-terminal (`TERMINAL_RUN_STATUSES`),
 *   which covers queued, starting and running children in one predicate. The
 *   daemon already records `processGroupId` and observes `childExited` per
 *   run; terminality is the OD-side signal those feed into.
 */
import { getProject } from '../db.js';
import type { ChatRun } from './chat-run-records.js';

/** Minimal sqlite handle `getProject` needs; keeps call sites decoupled. */
type ProjectLookupDb = Parameters<typeof getProject>[0];

interface WorkspaceRunRef {
  projectId?: string | null | undefined;
  /**
   * The project metadata captured when the run was admitted. For an ACTIVE
   * run this — not the current project row — is where its workspace identity
   * comes from: the working-dir route can rebind a row's `baseDir` while the
   * run keeps writing the directory resolved at its start, so re-reading the
   * row would let a second writer onto the abandoned (still-occupied) folder.
   * Only the incoming run (no captured metadata yet) resolves from the row.
   */
  projectMetadata?: unknown;
}

/**
 * Resolve the EXTERNAL workspace identity a run would write, or null when the
 * run has no external workspace (no project, od-owned storage, or an unreadable
 * project row) and must not be gated.
 *
 * A captured `projectMetadata` wins over the current project row; without one,
 * the row is read (that is the incoming-run path — its workspace is whatever
 * the row points at when it is admitted).
 *
 * Identity is `folder:<normalized baseDir>`; the normalization strips trailing
 * slashes only — baseDir values are persisted from `realpath()` at folder
 * import, so they are already canonical absolute paths.
 */
export function runWorkspaceIdentity(db: ProjectLookupDb, ref: WorkspaceRunRef): string | null {
  const projectId = typeof ref.projectId === 'string' && ref.projectId ? ref.projectId : null;
  if (!projectId) return null;
  let metadata: unknown = undefined;
  if (ref.projectMetadata !== undefined) {
    metadata = ref.projectMetadata;
  } else {
    let project: { metadata?: unknown } | null = null;
    try {
      project = getProject(db, projectId);
    } catch {
      return null;
    }
    metadata = project?.metadata;
  }
  const baseDir =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).baseDir
      : undefined;
  if (typeof baseDir === 'string' && baseDir.trim()) {
    const normalized = baseDir.replace(/\/+$/, '') || '/';
    return `folder:${normalized}`;
  }
  return null;
}

export interface ActiveRunBlockingWorkspaceInput {
  /** The EXTERNAL workspace of the incoming request (null = never blocks). */
  workspace: string | null;
  /** The optimistically created run for this request; it never blocks itself. */
  excludeRunId?: string | null | undefined;
  /**
   * A blocking run with `cancelRequested` is being deliberately superseded
   * (the composer's "send now" interrupt). Refusing that would break the
   * interrupt; overlapping a dying child is the pre-existing behavior.
   */
  treatCancelRequestedAsSuperseding?: boolean | undefined;
}

export interface ActiveRunBlockingWorkspaceHit {
  run: ChatRun;
  workspace: string;
}

/**
 * Return the live run that already occupies `workspace`, or null when the
 * request may proceed. Queued/starting runs block exactly like running ones:
 * their agent will write the same directory the moment the child spawns.
 * Each active run's identity comes from its captured `projectMetadata`
 * (memoized per run, since a rebound row can leave two runs of one project
 * on different directories).
 */
export function activeRunBlockingWorkspace(
  runs: { list(filters: { status?: 'active' }): ChatRun[] },
  db: ProjectLookupDb,
  input: ActiveRunBlockingWorkspaceInput,
): ActiveRunBlockingWorkspaceHit | null {
  if (!input.workspace) return null;
  const identityByRun = new Map<string, string | null>();
  const identityOf = (run: ChatRun): string | null => {
    if (!identityByRun.has(run.id)) {
      identityByRun.set(
        run.id,
        runWorkspaceIdentity(db, {
          projectId: run.projectId,
          projectMetadata: run.projectMetadata,
        }),
      );
    }
    return identityByRun.get(run.id) ?? null;
  };
  const active = runs.list({ status: 'active' });
  for (const run of active) {
    if (input.excludeRunId && run.id === input.excludeRunId) continue;
    if (input.treatCancelRequestedAsSuperseding && run.cancelRequested) continue;
    if (identityOf(run) === input.workspace) {
      return { run, workspace: input.workspace };
    }
  }
  return null;
}

/**
 * Convenience wrapper for one-shot call sites: resolves the incoming
 * request's workspace from its project row and scans the live runs. Returns
 * null when the workspace cannot be identified (nothing is refused).
 */
export function activeRunBlockingWorkspaceForProject(
  runs: Parameters<typeof activeRunBlockingWorkspace>[0],
  db: ProjectLookupDb,
  input: {
    projectId?: string | null | undefined;
    excludeRunId?: string | null | undefined;
    treatCancelRequestedAsSuperseding?: boolean | undefined;
  },
): ActiveRunBlockingWorkspaceHit | null {
  const workspace = runWorkspaceIdentity(db, { projectId: input.projectId });
  return activeRunBlockingWorkspace(runs, db, {
    workspace,
    excludeRunId: input.excludeRunId,
    treatCancelRequestedAsSuperseding: input.treatCancelRequestedAsSuperseding,
  });
}
