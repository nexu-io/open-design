import type { TeamProject, WorkspaceCollabContext } from '@open-design/contracts';
import type { Project } from '../types';
import { asTeamProjectRows } from './team-projects-catalog';

/** Answers "is this project shared to the workspace?" for one project id. */
export type SharedProjectPredicate = (projectId: string) => boolean;

/**
 * The ONE answer to "is this project shared?".
 *
 * The invariant: **a project is shared if the team hub already lists it, its
 * authoritative row in the current workspace says `team`, OR we shared it in
 * this session; and it is not shared if we unshared it in this session.** The
 * local visibility witness covers ordinary projects synchronized through a
 * non-project hub, while the session layer makes the state flip immediately
 * instead of waiting for the next workspace list or team-projects poll.
 *
 * Every reader of that answer must call this predicate — the card's 共享 badge
 * AND the 全部项目 / 草稿 partition below. They used to compute it separately:
 * the badge unioned the hub with the session layer, the partition read the hub
 * alone. That is why a just-shared project instantly grew its badge but stayed
 * sitting in 草稿 until a tab switch forced a refetch. Do not re-derive this
 * union at a call site; pass the predicate down instead.
 */
export function createSharedProjectPredicate(input: {
  /** Rows the team hub lists as shared. Persistent, survives a reload. */
  teamProjects: readonly TeamProject[];
  /** Local card rows carrying the daemon-authoritative workspace visibility. */
  localProjects?: readonly Project[];
  /** Exact workspace whose local visibility may be used as evidence. */
  workspaceContext?: WorkspaceCollabContext | null;
  /** Ids shared in this session, before the hub poll caught up. */
  sharedThisSession?: ReadonlySet<string>;
  /** Ids unshared in this session, before the hub poll caught up. */
  unsharedThisSession?: ReadonlySet<string>;
}): SharedProjectPredicate {
  const { sharedThisSession, unsharedThisSession } = input;
  // This runs inside a render-phase `useMemo` in the entry shell, so a throw
  // here unmounts the whole app rather than degrading one grid. A catalog that
  // is not a row array means "we know of nothing shared" — never a white
  // screen. See team-projects-catalog.ts for how a non-array used to get here.
  const hubShared = new Set(
    asTeamProjectRows(input.teamProjects).map((teamProject) => teamProject.projectId),
  );
  const workspaceContext = input.workspaceContext ?? null;
  const locallyTeamVisible = new Set(
    (workspaceContext ? input.localProjects ?? [] : [])
      .filter(
        (project) =>
          project.workspaceVisibility === 'team' &&
          project.workspaceId === workspaceContext?.workspaceId,
      )
      .map((project) => project.id),
  );
  return (projectId: string) => {
    if (unsharedThisSession?.has(projectId) === true) return false;
    return (
      hubShared.has(projectId) ||
      locallyTeamVisible.has(projectId) ||
      sharedThisSession?.has(projectId) === true
    );
  };
}

/**
 * Answers "does this project belong to the workspace we are looking at?".
 *
 * The invariant: **a project belongs to exactly one workspace, and a grid may
 * only show the projects belonging to the workspace the user is in.** That is
 * the 2026-07-21 product ruling — 「草稿和分享的方案都是和 workspace 绑定的」 —
 * so switching workspaces has to change which drafts you see.
 *
 * Evidence-gated, deliberately. A project is excluded ONLY on positive evidence
 * that it belongs somewhere else: `workspaceId` present AND different. Absent
 * means the daemon has not bound it yet (a pre-workspace project awaiting
 * adoption) or the row came from a reader that does not carry the binding — in
 * both cases hiding it would be worse than showing it, because a project the
 * user can see in no workspace at all is indistinguishable from a lost one.
 *
 * A null `workspaceContext` (signed out, or a purely local client) has no
 * workspace to compare against, so nothing is excluded.
 */
export function belongsToWorkspace(
  project: Project,
  workspaceContext: WorkspaceCollabContext | null,
): boolean {
  if (!workspaceContext) return true;
  const projectWorkspaceId = project.workspaceId;
  if (typeof projectWorkspaceId !== 'string' || projectWorkspaceId.length === 0) return true;
  return projectWorkspaceId === workspaceContext.workspaceId;
}

export function reconcileSharedProjectCatalogFields(input: {
  projects: Project[];
  teamProjects: TeamProject[];
  workspaceContext: WorkspaceCollabContext | null;
}): Project[] {
  const selfMemberId = input.workspaceContext?.workspaceMemberId;
  if (!selfMemberId) return input.projects;

  const catalogOverrides = new Map(
    asTeamProjectRows(input.teamProjects)
      .filter((teamProject) => teamProject.ownerMemberId !== selfMemberId)
      .map((teamProject) => [
        teamProject.projectId,
        {
          name: teamProject.name?.trim() || '',
          createdAt: teamProject.createdAt,
          updatedAt: teamProject.updatedAt,
        },
      ]),
  );

  return input.projects.map((project) => {
    const catalog = catalogOverrides.get(project.id);
    if (!catalog) return project;
    return {
      ...project,
      ...(catalog.name ? { name: catalog.name } : {}),
      ...(typeof catalog.createdAt === 'number' ? { createdAt: catalog.createdAt } : {}),
      ...(typeof catalog.updatedAt === 'number' ? { updatedAt: catalog.updatedAt } : {}),
    };
  });
}

/**
 * The card list behind the 全部项目 grid.
 *
 * The invariant: **only SHARED projects appear here.** A project becomes shared
 * when the user takes the share action; until then it lives in 草稿 and nowhere
 * else. That is a product decision, recorded on the acceptance doc
 * (2026-07-20): "项目要用户点击共享动作才会共享，不然默认是会到草稿里". A previous
 * change read the grid's name literally and let every local project in — do not
 * redo that without checking with product first.
 *
 * So the list is: the member's own local projects that count as shared, plus the
 * shared projects they have not pulled yet, deduped by id.
 *
 * Workspace type does NOT change this rule. A personal workspace is still a
 * workspace — it can be invited into and shared from — so its projects split
 * across the two grids exactly like a team workspace's do. An earlier
 * `workspaceType === 'personal'` bail returned every local project here AND in
 * 草稿, which collapsed the partition into two identical grids.
 *
 * A shared project the member has not pulled yet has no local record, so it is
 * synthesized into a normal card: placeholder name until the pull registers it
 * under its real name, timestamps from when it was shared.
 *
 * Names and timestamps follow the hub catalog for rows owned by SOMEONE ELSE.
 * A pulled copy's local name freezes at pull time, while its transport
 * placeholder is stamped with `now`; allowing either to win would hide an
 * owner's rename and make merely opening a shared project look like a content
 * update. The member's own rows keep the local fields — their fresh changes may
 * not have round-tripped to the catalog yet.
 */
export function buildAllProjectsList(input: {
  projects: Project[];
  teamProjects: TeamProject[];
  workspaceContext: WorkspaceCollabContext | null;
  /** Display name for a shared project that has no catalog name yet. */
  sharedFallbackName: string;
  now?: () => number;
  /**
   * The shared-state answer, so this grid and the card badge cannot disagree.
   * Defaults to the hub catalog alone; callers that own an optimistic session
   * layer pass {@link createSharedProjectPredicate}'s result instead.
   */
  isShared?: SharedProjectPredicate;
}): Project[] {
  const { projects, workspaceContext, sharedFallbackName } = input;
  const teamProjects = asTeamProjectRows(input.teamProjects);
  const now = input.now ?? Date.now;

  // No workspace context at all (signed out, or a purely local client): there is
  // no sharing concept to partition by, so fall back to the local list rather
  // than render an empty grid. This state is not reachable from the UI — the
  // entry shell routes away from 全部项目 / 草稿 while the context is absent — it
  // only guards a context that resolves to null under a mounted grid.
  if (!workspaceContext) return projects;

  const isShared = input.isShared ?? createSharedProjectPredicate({
    teamProjects,
    localProjects: projects,
    workspaceContext,
  });
  // Only this workspace's projects, so the grid cannot render another
  // workspace's local rows while a switch is still in flight.
  const scopedProjects = projects.filter((project) => belongsToWorkspace(project, workspaceContext));
  const localProjectIds = new Set(scopedProjects.map((project) => project.id));
  const localCards = reconcileSharedProjectCatalogFields({
    projects: scopedProjects.filter((project) => isShared(project.id)),
    teamProjects,
    workspaceContext,
  });

  const sharedCards: Project[] = teamProjects
    .filter(
      (teamProject) =>
        !localProjectIds.has(teamProject.projectId) && isShared(teamProject.projectId),
    )
    .map((teamProject) => {
      const sharedAtMs = Date.parse(teamProject.sharedAt);
      const fallbackTimestamp = Number.isFinite(sharedAtMs) ? sharedAtMs : now();
      return {
        id: teamProject.projectId,
        name: teamProject.name?.trim() || sharedFallbackName,
        skillId: teamProject.skillId ?? null,
        designSystemId: teamProject.designSystemId ?? null,
        createdAt: typeof teamProject.createdAt === 'number' ? teamProject.createdAt : fallbackTimestamp,
        updatedAt: typeof teamProject.updatedAt === 'number' ? teamProject.updatedAt : fallbackTimestamp,
        ...(teamProject.metadata ? { metadata: teamProject.metadata } : {}),
      } satisfies Project;
    });

  return [...localCards, ...sharedCards];
}


/**
 * The card list behind the 草稿 grid: the member's own projects that are NOT
 * shared yet.
 *
 * 草稿 and 全部项目 are complements, not overlapping views — sharing is the
 * explicit action that moves a project from one to the other. A shared project
 * lingering in 草稿 reads as "it did not move".
 *
 * Both halves must therefore read the SAME shared-state answer as the card's
 * 共享 badge; see {@link createSharedProjectPredicate}. And, like 全部项目, the
 * split applies to a personal workspace too — its projects can be shared.
 *
 * The two grids partition **the local projects belonging to the current
 * workspace** — see {@link belongsToWorkspace}. They never partitioned the whole
 * local list in a meaningful sense: before the workspace filter, a draft created
 * in workspace A sat in workspace B's 草稿 too, which is the bug the 2026-07-21
 * ruling ended. A project bound elsewhere now belongs to neither grid here, and
 * appears in exactly one grid in the workspace that owns it.
 */
export function buildDraftsList(input: {
  projects: Project[];
  teamProjects: TeamProject[];
  workspaceContext: WorkspaceCollabContext | null;
  /** See {@link buildAllProjectsList}'s `isShared`; pass the same predicate. */
  isShared?: SharedProjectPredicate;
}): Project[] {
  const { projects, workspaceContext } = input;
  const teamProjects = asTeamProjectRows(input.teamProjects);
  // No workspace context: nothing can be shared, so every project is a draft.
  // Stated as an early return to mirror 全部项目's fallback — the general path
  // below computes the same list once `teamProjects` is empty.
  if (!workspaceContext) return projects;
  const isShared = input.isShared ?? createSharedProjectPredicate({
    teamProjects,
    localProjects: projects,
    workspaceContext,
  });
  return projects.filter(
    (project) => belongsToWorkspace(project, workspaceContext) && !isShared(project.id),
  );
}
