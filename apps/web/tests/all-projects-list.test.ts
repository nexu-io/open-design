import { describe, expect, it } from 'vitest';
import type { TeamProject, WorkspaceCollabContext } from '@open-design/contracts';

import {
  buildAllProjectsList,
  buildDraftsList,
  createSharedProjectPredicate,
  reconcileSharedProjectCatalogFields,
} from '../src/collab/all-projects-list';
import type { Project } from '../src/types';

const SELF = 'member-self';

function teamContext(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: SELF,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    permissions: {},
    ...overrides,
  } as WorkspaceCollabContext;
}

function localProject(
  id: string,
  name: string,
  workspaceId?: string | null,
  workspaceVisibility?: Project['workspaceVisibility'],
): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(workspaceVisibility === undefined ? {} : { workspaceVisibility }),
  } as Project;
}

function sharedProject(overrides: Partial<TeamProject> & { projectId: string }): TeamProject {
  return {
    ownerMemberId: 'member-other',
    sharedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as TeamProject;
}

const build = (input: {
  projects: Project[];
  teamProjects: TeamProject[];
  workspaceContext?: WorkspaceCollabContext | null;
}) =>
  buildAllProjectsList({
    projects: input.projects,
    teamProjects: input.teamProjects,
    // `in` rather than `??` so an explicit `null` context reaches the builder.
    workspaceContext: 'workspaceContext' in input ? input.workspaceContext ?? null : teamContext(),
    sharedFallbackName: '共享项目',
    now: () => 1_700_000_000_000,
  });

describe('buildAllProjectsList', () => {
  // Acceptance #29 was raised as "my new empty project never showed up in
  // 全部项目", and product ruled it working as designed on the acceptance doc
  // (2026-07-20): sharing is an explicit user action, and until it happens the
  // project belongs to 草稿 only. This test exists so the grid's name does not
  // tempt someone into "fixing" it again.
  it('leaves an unshared local project out', () => {
    const list = build({
      projects: [localProject('p-fresh', 'Fresh empty project')],
      teamProjects: [],
    });

    expect(list).toEqual([]);
  });

  it('lists the member’s own project once it is shared', () => {
    const list = build({
      projects: [localProject('p-mine', 'Mine')],
      teamProjects: [sharedProject({ projectId: 'p-mine', ownerMemberId: SELF, name: 'Mine' })],
    });

    expect(list.map((project) => project.id)).toEqual(['p-mine']);
  });

  it('uses the current workspace team visibility when a normal project has no project-hub row', () => {
    const designSystemProject = {
      ...localProject('p-design-system', 'Shopify Design System', 'ws-1', 'team'),
      metadata: {
        kind: 'other',
        importedFrom: 'design-system',
      },
    } satisfies Project;

    const list = build({
      projects: [designSystemProject],
      teamProjects: [],
    });

    expect(list.map((project) => project.id)).toEqual(['p-design-system']);
  });

  it('does not use another workspace team visibility as sharing evidence', () => {
    const list = build({
      projects: [localProject('p-elsewhere', 'Elsewhere', 'ws-2', 'team')],
      teamProjects: [],
    });

    expect(list).toEqual([]);
  });

  it('lists shared projects the member has not pulled alongside their shared own', () => {
    const list = build({
      projects: [localProject('p-mine', 'Mine'), localProject('p-draft', 'Draft')],
      teamProjects: [
        sharedProject({ projectId: 'p-mine', ownerMemberId: SELF, name: 'Mine' }),
        sharedProject({ projectId: 'p-theirs', name: 'Theirs' }),
      ],
    });

    expect(list.map((project) => project.id).sort()).toEqual(['p-mine', 'p-theirs']);
  });

  it('does not duplicate a shared project the member already pulled', () => {
    const list = build({
      projects: [localProject('p-shared', 'Pulled copy')],
      teamProjects: [sharedProject({ projectId: 'p-shared', name: 'Pulled copy' })],
    });

    expect(list).toHaveLength(1);
  });

  it("follows the catalog name for another member's project, not the frozen local one", () => {
    const list = build({
      projects: [localProject('p-shared', 'Old name at pull time')],
      teamProjects: [sharedProject({ projectId: 'p-shared', name: 'Renamed by owner' })],
    });

    expect(list[0]?.name).toBe('Renamed by owner');
  });

  it("keeps another member's catalog update time after the shared project is pulled locally", () => {
    const catalogCreatedAt = 1_700_000_000_000;
    const catalogUpdatedAt = 1_700_000_060_000;
    const pulledPlaceholder = {
      ...localProject('p-shared', 'Pulled copy'),
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    };
    const list = build({
      projects: [pulledPlaceholder],
      teamProjects: [
        sharedProject({
          projectId: 'p-shared',
          name: 'Catalog name',
          createdAt: catalogCreatedAt,
          updatedAt: catalogUpdatedAt,
        }),
      ],
    });

    expect(list[0]).toMatchObject({
      name: 'Catalog name',
      createdAt: catalogCreatedAt,
      updatedAt: catalogUpdatedAt,
    });
  });

  it('keeps the local name for the member’s OWN project so a fresh rename holds', () => {
    const list = build({
      projects: [localProject('p-mine', 'Just renamed')],
      teamProjects: [
        sharedProject({ projectId: 'p-mine', ownerMemberId: SELF, name: 'Stale catalog name' }),
      ],
    });

    expect(list[0]?.name).toBe('Just renamed');
  });

  it('falls back to a placeholder name for a shared project with no catalog name', () => {
    const list = build({
      projects: [],
      teamProjects: [sharedProject({ projectId: 'p-unnamed' })],
    });

    expect(list[0]?.name).toBe('共享项目');
  });

  // A personal workspace is still a workspace: it can be shared into and it can
  // invite members, so 全部项目 must hold the SAME "shared only" rule there.
  // Regression: an early `workspaceType === 'personal'` bail made this grid list
  // every local project, unshared ones included — the reporter's screenshots
  // showed 全部项目 cards still offering 「转入团队空间」 in "My Workspace2".
  it('still lists shared-only in a personal workspace', () => {
    const list = build({
      projects: [localProject('p-shared', 'Shared'), localProject('p-draft', 'Draft')],
      teamProjects: [sharedProject({ projectId: 'p-shared', ownerMemberId: SELF })],
      workspaceContext: teamContext({ workspaceType: 'personal' }),
    });

    expect(list.map((project) => project.id)).toEqual(['p-shared']);
  });

  // With no workspace context at all there is no sharing concept to partition
  // by, so the grid falls back to the local list instead of rendering empty.
  it('falls back to the local list when there is no workspace context', () => {
    const projects = [localProject('p-a', 'A'), localProject('p-b', 'B')];
    const list = build({ projects, teamProjects: [], workspaceContext: null });

    expect(list).toBe(projects);
  });
});

describe('reconcileSharedProjectCatalogFields', () => {
  it("uses another member's catalog timestamp instead of a pulled placeholder's current time", () => {
    const catalogUpdatedAt = 1_700_000_060_000;
    const projects = [
      {
        ...localProject('p-shared', '共享项目'),
        updatedAt: 1_800_000_000_000,
      },
    ];

    const reconciled = reconcileSharedProjectCatalogFields({
      projects,
      teamProjects: [
        sharedProject({
          projectId: 'p-shared',
          name: 'Catalog name',
          updatedAt: catalogUpdatedAt,
        }),
      ],
      workspaceContext: teamContext(),
    });

    expect(reconciled[0]).toMatchObject({
      name: 'Catalog name',
      updatedAt: catalogUpdatedAt,
    });
  });
});

// Acceptance #78: a project that had been shared kept showing in 草稿, so the
// share read as "it did not move". 草稿 and 全部项目 are complements.
describe('buildDraftsList', () => {
  const drafts = (
    projects: Project[],
    teamProjects: TeamProject[],
    ctx: WorkspaceCollabContext | null = teamContext(),
  ) => buildDraftsList({ projects, teamProjects, workspaceContext: ctx });

  it('drops a project once it is shared', () => {
    const list = drafts(
      [localProject('p-shared', 'Shared'), localProject('p-draft', 'Draft')],
      [sharedProject({ projectId: 'p-shared', ownerMemberId: SELF })],
    );
    expect(list.map((p) => p.id)).toEqual(['p-draft']);
  });

  it('keeps everything while nothing is shared', () => {
    const list = drafts([localProject('p-a', 'A'), localProject('p-b', 'B')], []);
    expect(list.map((p) => p.id)).toEqual(['p-a', 'p-b']);
  });

  it('keeps an authoritative personal project in drafts', () => {
    const list = drafts(
      [localProject('p-personal', 'Personal authoring project', 'ws-1', 'personal')],
      [],
    );

    expect(list.map((project) => project.id)).toEqual(['p-personal']);
  });

  it('drops an authoritative team project from drafts without a project-hub row', () => {
    const list = drafts(
      [localProject('p-team', 'Team backing project', 'ws-1', 'team')],
      [],
    );

    expect(list).toEqual([]);
  });

  // The two grids must partition the local list, never double-count.
  it('complements 全部项目 — no project appears in both', () => {
    const projects = [localProject('p-shared', 'Shared'), localProject('p-draft', 'Draft')];
    const teamProjects = [sharedProject({ projectId: 'p-shared', ownerMemberId: SELF })];
    const inDrafts = new Set(drafts(projects, teamProjects).map((p) => p.id));
    const inAll = new Set(
      buildAllProjectsList({
        projects,
        teamProjects,
        workspaceContext: teamContext(),
        sharedFallbackName: '共享项目',
        now: () => 1_700_000_000_000,
      }).map((p) => p.id),
    );
    for (const id of inDrafts) expect(inAll.has(id)).toBe(false);
    expect([...inDrafts, ...inAll].sort()).toEqual(['p-draft', 'p-shared']);
  });

  // THE BUG (product ruling 2026-07-21): 「草稿和分享的方案都是和 workspace 绑定
  // 的」. A draft created in workspace A must not show up in workspace B's 草稿.
  // Before the fix this list was "every local project minus the shared ones",
  // with no workspace filter at all, so every workspace rendered the same 草稿.
  it('leaves a draft that belongs to another workspace out', () => {
    const list = drafts(
      [
        localProject('p-here', 'Mine here', 'ws-1'),
        localProject('p-elsewhere', 'Someone else’s workspace', 'ws-2'),
      ],
      [],
    );

    expect(list.map((p) => p.id)).toEqual(['p-here']);
  });

  // Evidence-gated: a project the daemon has not bound yet (pre-workspace, still
  // awaiting adoption) carries no workspace. Hiding it would make it unreachable
  // in every grid, which is indistinguishable from losing it.
  it('keeps a project whose workspace is not known yet', () => {
    const list = drafts([localProject('p-unbound', 'Legacy', null), localProject('p-legacy', 'Older')], []);

    expect(list.map((p) => p.id)).toEqual(['p-unbound', 'p-legacy']);
  });

  it('drops another workspace’s project from 全部项目 too, so it lands in neither grid', () => {
    const projects = [
      localProject('p-here', 'Mine here', 'ws-1'),
      localProject('p-elsewhere', 'Elsewhere', 'ws-2'),
    ];
    // The other workspace's project is shared THERE, but this workspace's hub
    // does not list it, so nothing here should surface it.
    const list = buildAllProjectsList({
      projects,
      teamProjects: [sharedProject({ projectId: 'p-here', ownerMemberId: SELF })],
      workspaceContext: teamContext(),
      sharedFallbackName: '共享项目',
      now: () => 1_700_000_000_000,
    });

    expect(list.map((p) => p.id)).toEqual(['p-here']);
  });

  // The partition still holds, now over the workspace's projects rather than
  // over every local row: each of this workspace's projects lands in exactly one
  // grid, and a project bound elsewhere lands in neither.
  it('partitions this workspace’s projects and excludes other workspaces’ entirely', () => {
    const projects = [
      localProject('p-shared', 'Shared', 'ws-1'),
      localProject('p-draft', 'Draft', 'ws-1'),
      localProject('p-elsewhere', 'Elsewhere', 'ws-2'),
    ];
    const teamProjects = [sharedProject({ projectId: 'p-shared', ownerMemberId: SELF })];
    const inDrafts = new Set(drafts(projects, teamProjects).map((p) => p.id));
    const inAll = new Set(
      buildAllProjectsList({
        projects,
        teamProjects,
        workspaceContext: teamContext(),
        sharedFallbackName: '共享项目',
        now: () => 1_700_000_000_000,
      }).map((p) => p.id),
    );

    for (const id of inDrafts) expect(inAll.has(id)).toBe(false);
    expect([...inDrafts, ...inAll].sort()).toEqual(['p-draft', 'p-shared']);
    expect(inDrafts.has('p-elsewhere')).toBe(false);
    expect(inAll.has('p-elsewhere')).toBe(false);
  });

  // Same regression as 全部项目's personal-workspace case, seen from the other
  // side: the reporter's 草稿 grid in "My Workspace2" still listed an already
  // shared project, green 共享 badge and all.
  it('drops a shared project in a personal workspace too', () => {
    const projects = [localProject('p-shared', 'Shared'), localProject('p-draft', 'Draft')];
    const list = drafts(
      projects,
      [sharedProject({ projectId: 'p-shared', ownerMemberId: SELF })],
      teamContext({ workspaceType: 'personal' }),
    );
    expect(list.map((p) => p.id)).toEqual(['p-draft']);
  });

  it('keeps everything when there is no workspace context — nothing can be shared', () => {
    const projects = [localProject('p-a', 'A')];
    const list = drafts(projects, [], null);
    expect(list.map((p) => p.id)).toEqual(['p-a']);
  });
});

// Acceptance: 「草稿里的项目, 转入团队空间, 怎么还显示在草稿里…切到全部项目再切回
// 草稿它才消失」. The 共享 badge unioned the hub catalog with an optimistic
// in-session set, while the two grids read the hub alone — so the badge flipped
// on click and the grids waited for the poll. Both now read one predicate.
describe('createSharedProjectPredicate', () => {
  const drafts = (projects: Project[], isShared: (id: string) => boolean) =>
    buildDraftsList({ projects, teamProjects: [], workspaceContext: teamContext(), isShared });
  const all = (projects: Project[], teamProjects: TeamProject[], isShared: (id: string) => boolean) =>
    buildAllProjectsList({
      projects,
      teamProjects,
      workspaceContext: teamContext(),
      sharedFallbackName: '共享项目',
      now: () => 1_700_000_000_000,
      isShared,
    });

  it('counts a project the hub lists as shared', () => {
    const isShared = createSharedProjectPredicate({
      teamProjects: [sharedProject({ projectId: 'p-hub' })],
    });
    expect(isShared('p-hub')).toBe(true);
    expect(isShared('p-other')).toBe(false);
  });

  it('counts a project shared this session, before the hub poll catches up', () => {
    const isShared = createSharedProjectPredicate({
      teamProjects: [],
      sharedThisSession: new Set(['p-fresh']),
    });
    expect(isShared('p-fresh')).toBe(true);
  });

  it('drops a project unshared this session even while the hub still lists it', () => {
    const isShared = createSharedProjectPredicate({
      teamProjects: [sharedProject({ projectId: 'p-stale' })],
      unsharedThisSession: new Set(['p-stale']),
    });
    expect(isShared('p-stale')).toBe(false);
  });

  it('lets an optimistic unshare override current-workspace team visibility', () => {
    const isShared = createSharedProjectPredicate({
      teamProjects: [],
      localProjects: [localProject('p-local-team', 'Local Team project', 'ws-1', 'team')],
      workspaceContext: teamContext(),
      unsharedThisSession: new Set(['p-local-team']),
    });

    expect(isShared('p-local-team')).toBe(false);
  });

  // The reported symptom, at the grid level: sharing must move the card between
  // the two grids on the spot, with no team-projects refetch in between.
  it('moves a just-shared project out of 草稿 and into 全部项目 with no refetch', () => {
    const projects = [localProject('p-mine', 'Mine'), localProject('p-draft', 'Draft')];
    // The hub has NOT caught up yet — this is the window the user sees.
    const teamProjects: TeamProject[] = [];
    const isShared = createSharedProjectPredicate({
      teamProjects,
      sharedThisSession: new Set(['p-mine']),
    });

    expect(drafts(projects, isShared).map((p) => p.id)).toEqual(['p-draft']);
    expect(all(projects, teamProjects, isShared).map((p) => p.id)).toEqual(['p-mine']);
  });

  it('moves a just-unshared project back into 草稿 with no refetch', () => {
    const projects = [localProject('p-mine', 'Mine')];
    // The hub still lists it; only the session layer knows it was unshared.
    const teamProjects = [sharedProject({ projectId: 'p-mine', ownerMemberId: SELF })];
    const isShared = createSharedProjectPredicate({
      teamProjects,
      unsharedThisSession: new Set(['p-mine']),
    });

    expect(
      buildDraftsList({ projects, teamProjects, workspaceContext: teamContext(), isShared }).map(
        (p) => p.id,
      ),
    ).toEqual(['p-mine']);
    expect(all(projects, teamProjects, isShared)).toEqual([]);
  });
});
