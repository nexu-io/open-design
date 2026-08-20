// THE INVARIANT: a project belongs to exactly ONE workspace.
//
// Product ruling (2026-07-21): 「草稿和分享的方案都是和 workspace 绑定的」 — both
// drafts and shared projects belong to a workspace. A project is created in a
// workspace and lives there. Sharing flips `visibility` WITHIN that workspace;
// it does not project the project into a second one. Switching workspaces must
// therefore change which drafts you see, and signing out must hide them.
//
// The live data disagrees, and the data is wrong. On the dogfood database 23 of
// 31 projects held rows in 2-4 workspaces. That is not history to preserve — it
// is the wreckage of `seedPersonalWorkspaceProjects`, which back-filled a row
// for EVERY local project on EVERY personal-workspace read. The proof is in the
// timestamps: a project with four rows has one identical `created_at` across
// all four — a single batch write, not four user actions. Drafts were not
// unbound; they were bound to everywhere, which reads the same as nowhere.
//
// A permissive schema is not evidence of intent either. `workspace_projects`
// keyed on `(workspace_id, project_id)` merely made the forbidden state
// REPRESENTABLE; the migration that widened it renamed the old table to
// `workspace_projects_legacy_single_project`, so `project_id` was the primary
// key first. `db.ts` narrows it back, which turns this invariant into something
// SQLite refuses rather than something a comment asks for.
//
// This module is the ONE place that decides which workspace a project belongs
// to when the rows disagree. It is pure so the rule is testable without a
// daemon. Two consumers:
//   - the migration (db.ts) collapses the rows older builds already wrote;
//   - the read path (routes/project/index.ts) binds projects that have no row.

/** A `workspace_projects` row, as far as this invariant is concerned. */
export interface WorkspaceProjectHomeRow {
  projectId: string;
  workspaceId: string;
  visibility?: string | null;
  createdByWorkspaceMemberId?: string | null;
  createdAt?: number | null;
}

/**
 * True for a row that records no act — `visibility: 'personal'` with no creator.
 *
 * This is exactly the shape the old `ensureWorkspaceProjection(project, ctx,
 * 'personal')` back-fill wrote, and nothing else writes it: project creation
 * stamps the creating member (`routes/project/index.ts`), a share stamps the
 * sharer, and a pull stamps the owner (`server.ts
 * persistWorkspaceProjectVisibility`). So the predicate cannot mistake a real
 * binding for a guess, which is what makes it safe to delete on.
 */
export function isBackfilledWorkspaceProjectRow(row: WorkspaceProjectHomeRow): boolean {
  return row.visibility === 'personal' && row.createdByWorkspaceMemberId == null;
}

/**
 * Workspaces that provably host a team plane, inferred from the rows alone.
 *
 * A `visibility: 'team'` row can only exist in a team workspace — the share path
 * refuses one anywhere else (collab/team-share-scope.ts) and startup heals the
 * rows older builds wrote in violation. That makes "has ever hosted a share" a
 * table-local proxy for "is a team workspace", which is what lets the collapse
 * below run as a migration instead of waiting on the signed-in workspace
 * directory. Workspaces it has no evidence about are simply absent, and every
 * caller treats absence as "no opinion".
 */
export function teamWorkspaceIdsFromRows(
  rows: readonly WorkspaceProjectHomeRow[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.visibility === 'team') ids.add(row.workspaceId);
  }
  return ids;
}

/** What one project collapses to. */
export interface WorkspaceProjectHomeDecision {
  projectId: string;
  /**
   * The workspace the project ends up in. Null means every candidate row was an
   * ownerless guess inside a team workspace, where no view would render it —
   * the project is left unbound on purpose and the next personal-workspace read
   * binds it. See {@link collapseWorkspaceProjectHomes}.
   */
  keptWorkspaceId: string | null;
  /** Rows to delete. */
  drop: WorkspaceProjectHomeRow[];
}

/**
 * How strongly a row asserts that the project lives in its workspace.
 * Higher wins. The order is evidence, not preference:
 *
 *   2 — a team share. It binds a hub resource (`resource_hub_resource_id`), so
 *       dropping it would strand that resource and silently unshare the project
 *       for every teammate. Nothing outranks it.
 *   1 — a row naming who created or pulled the project there. A recorded act.
 *   0 — an ownerless personal row. A back-fill guess.
 */
function rowEvidence(row: WorkspaceProjectHomeRow): number {
  if (row.visibility === 'team') return 2;
  return isBackfilledWorkspaceProjectRow(row) ? 0 : 1;
}

/**
 * Rank workspaces by how many recorded acts they hold across ALL projects.
 *
 * The tie-break of last resort needs a real signal, and this is the only one the
 * table carries: the workspace where the user demonstrably creates and shares
 * things is the workspace they actually work in. Without it, two guesses with
 * the back-fill's identical `created_at` would fall straight through to an
 * alphabetical comparison of opaque ids.
 */
function recordedActsPerWorkspace(
  rows: readonly WorkspaceProjectHomeRow[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (rowEvidence(row) === 0) continue;
    counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Collapse every project's rows down to the one workspace it belongs to.
 *
 * The winner is the row with the strongest evidence ({@link rowEvidence}). Ties
 * break on, in order: whether the workspace is provably a TEAM workspace (an
 * ownerless personal row is suppressed there by
 * `workspaceProjectRowBelongsToCurrentWorkspace`, so promoting one would hide
 * the project in every view at once); how much real activity that workspace
 * holds; the oldest row, so the workspace the user reached first wins; and
 * finally the workspace id. That last step is genuinely arbitrary — the
 * back-fill copied one `project.createdAt` onto every row it wrote, so two
 * guesses in two personal workspaces really do carry identical evidence — but
 * it is deterministic, which is what stops two daemons from disagreeing.
 *
 * NO PROJECT CAN BE LOST HERE. This function only ever names rows to delete
 * from `workspace_projects`; it never touches `projects`, and the schema's
 * cascade runs the other way (deleting a project deletes its rows, never the
 * reverse). Every project that had a row keeps exactly one, with a single
 * deliberate exception: when EVERY candidate is an ownerless guess sitting in a
 * team workspace, all of them go and `keptWorkspaceId` is null. Keeping one
 * would be worse than keeping none — a suppressed row renders nowhere, while an
 * unbound project is still listed by `/api/projects`, still opens by id, and is
 * bound to the user's personal workspace by the next read. The migration cannot
 * make that binding itself: which workspace ids are personal is a signed-in
 * fact it cannot see, and the read path can.
 */
export function collapseWorkspaceProjectHomes(
  rows: readonly WorkspaceProjectHomeRow[],
): WorkspaceProjectHomeDecision[] {
  const teamWorkspaceIds = teamWorkspaceIdsFromRows(rows);
  const activity = recordedActsPerWorkspace(rows);
  const byProject = new Map<string, WorkspaceProjectHomeRow[]>();
  for (const row of rows) {
    const bucket = byProject.get(row.projectId);
    if (bucket) bucket.push(row);
    else byProject.set(row.projectId, [row]);
  }

  const decisions: WorkspaceProjectHomeDecision[] = [];
  for (const [projectId, projectRows] of byProject) {
    const winner = [...projectRows].sort((a, b) => {
      const byEvidence = rowEvidence(b) - rowEvidence(a);
      if (byEvidence !== 0) return byEvidence;
      const aSuppressed = rowEvidence(a) === 0 && teamWorkspaceIds.has(a.workspaceId);
      const bSuppressed = rowEvidence(b) === 0 && teamWorkspaceIds.has(b.workspaceId);
      if (aSuppressed !== bSuppressed) return aSuppressed ? 1 : -1;
      const byActivity = (activity.get(b.workspaceId) ?? 0) - (activity.get(a.workspaceId) ?? 0);
      if (byActivity !== 0) return byActivity;
      const byCreatedAt = (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (byCreatedAt !== 0) return byCreatedAt;
      return a.workspaceId < b.workspaceId ? -1 : a.workspaceId > b.workspaceId ? 1 : 0;
    })[0];
    if (!winner) continue;

    // The one case where keeping the winner is worse than keeping nothing.
    const winnerRendersNowhere =
      rowEvidence(winner) === 0 && teamWorkspaceIds.has(winner.workspaceId);
    if (winnerRendersNowhere) {
      decisions.push({ projectId, keptWorkspaceId: null, drop: projectRows });
      continue;
    }
    const drop = projectRows.filter((row) => row !== winner);
    if (drop.length === 0) continue;
    decisions.push({ projectId, keptWorkspaceId: winner.workspaceId, drop });
  }
  return decisions;
}
