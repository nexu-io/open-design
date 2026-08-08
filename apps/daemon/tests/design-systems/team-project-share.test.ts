import { describe, expect, it, vi } from 'vitest';
import {
  createDesignSystemBackingProjectPreparer,
  createLinkedProjectTeamResourceShareService,
} from '../../src/design-systems/team-project-share.js';
import {
  TeamResourceAuthorityUnavailableError,
  TeamResourceShareForbiddenError,
  type TeamResourceRequestScope,
  type TeamResourceShareService,
} from '../../src/collab/team-resource-share.js';

const scope = (workspaceId = 'ws-a'): TeamResourceRequestScope => ({
  principal: {
    teamId: workspaceId,
    memberId: 'member-owner',
    role: 'owner',
    lifecycleState: 'active',
  },
  canShare: true,
});

function fixture(options: { projectInitiallyExists?: boolean } = {}) {
  const calls: string[] = [];
  const shared = new Set<string>();
  const projectVisibility = new Map<string, 'personal' | 'team'>(
    options.projectInitiallyExists === false
      ? []
      : [['project-brand', 'personal']],
  );
  let failResourceShare = false;
  let failResourceUnshare = false;
  let resourceUnshareFailuresRemaining = 0;
  let failNextProjectShare = false;
  let projectUnshareFailuresRemaining = 0;
  let failNextProjectPersist = false;
  let authoritativeShared: Set<string> | null = null;
  let authoritativeReadError: Error | null = null;
  let authoritativeCanUnshare = true;
  let hubOwnerMemberId: string | undefined = 'member-owner';
  let projectBinding: {
    workspaceId: string;
    createdByWorkspaceMemberId: string;
  } | undefined = options.projectInitiallyExists === false
    ? undefined
    : {
        workspaceId: 'ws-a',
        createdByWorkspaceMemberId: 'member-owner',
      };

  const resource: TeamResourceShareService = {
    configured: true,
    async share(resourceId) {
      calls.push(`resource:share:${resourceId}`);
      if (failResourceShare) throw new Error('design-system publish failed');
      shared.add(resourceId);
      return { version: 1 };
    },
    async unshare(resourceId) {
      calls.push(`resource:unshare:${resourceId}`);
      if (failResourceUnshare || resourceUnshareFailuresRemaining > 0) {
        if (resourceUnshareFailuresRemaining > 0) resourceUnshareFailuresRemaining -= 1;
        throw new Error('design-system unpublish failed');
      }
      shared.delete(resourceId);
      return true;
    },
    async sharedIds() {
      return [...shared];
    },
    async sharedResources(_scope, readOptions) {
      if (readOptions?.authoritative) {
        if (authoritativeReadError) throw authoritativeReadError;
        return [...(authoritativeShared ?? shared)]
          .map((id) => ({
            id,
            ...(hubOwnerMemberId ? { ownerMemberId: hubOwnerMemberId } : {}),
            canUnshare: authoritativeCanUnshare,
          }));
      }
      return [...shared].map((id) => ({
        id,
        ...(hubOwnerMemberId ? { ownerMemberId: hubOwnerMemberId } : {}),
        canUnshare: true,
      }));
    },
    isShared(resourceId) {
      return shared.has(resourceId);
    },
  };
  const ensureProjectId = vi.fn(async (
    resourceId: string,
    requestScope: TeamResourceRequestScope,
  ) => {
    expect(resourceId).toBe('user:brand');
    expect(requestScope.principal).toMatchObject({
      teamId: 'ws-a',
      memberId: 'member-owner',
    });
    calls.push('project:ensure:project-brand');
    projectVisibility.set('project-brand', 'personal');
    projectBinding = {
      workspaceId: requestScope.principal.teamId,
      createdByWorkspaceMemberId: requestScope.principal.memberId,
    };
    return 'project-brand';
  });
  const prepare = vi.fn(createDesignSystemBackingProjectPreparer({
    resolveProjectId: (resourceId) => {
      expect(resourceId).toBe('user:brand');
      return projectVisibility.has('project-brand') ? 'project-brand' : null;
    },
    ensureProjectId,
    projectExists: (projectId) => projectVisibility.has(projectId),
    getProjectBinding: () => projectBinding,
    async publishProject(projectId) {
      calls.push(`project:team:${projectId}`);
      if (failNextProjectShare) {
        failNextProjectShare = false;
        throw new Error('project publish failed');
      }
      return { version: 1 };
    },
    async unpublishProject(projectId) {
      calls.push(`project:personal:${projectId}`);
      if (projectUnshareFailuresRemaining > 0) {
        projectUnshareFailuresRemaining -= 1;
        throw new Error('project unpublish failed');
      }
    },
    persistVisibility: ({ projectId, visibility }) => {
      if (failNextProjectPersist) {
        failNextProjectPersist = false;
        throw new Error('project visibility persist failed');
      }
      projectVisibility.set(projectId, visibility);
    },
  }));
  const service = createLinkedProjectTeamResourceShareService({ resource, prepare });

  return {
    calls,
    shared,
    projectVisibility,
    prepare,
    ensureProjectId,
    service,
    failResourceShare: () => { failResourceShare = true; },
    failResourceUnshare: () => { failResourceUnshare = true; },
    failNextResourceUnshare: () => { resourceUnshareFailuresRemaining = 1; },
    failNextProjectShare: () => { failNextProjectShare = true; },
    failNextProjectUnshare: () => { projectUnshareFailuresRemaining = 1; },
    failNextProjectPersist: () => { failNextProjectPersist = true; },
    setAuthoritativeShared: (ids: string[]) => {
      authoritativeShared = new Set(ids);
    },
    failAuthoritativeRead: () => {
      authoritativeReadError = new Error('authoritative hub unavailable');
    },
    denyAuthoritativeUnshare: () => {
      authoritativeCanUnshare = false;
    },
    clearHubOwner: () => {
      hubOwnerMemberId = undefined;
    },
  };
}

describe('design-system team share linked backing project', () => {
  it('does not resolve until Personal lost the project and Team owns exactly one projection', async () => {
    const f = fixture();

    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });
    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.projectVisibility.keys()]).toEqual(['project-brand']);
    expect([...f.shared]).toEqual(['user:brand']);
    expect(f.calls).toEqual([
      'resource:share:user:brand',
      'project:team:project-brand',
      'resource:share:user:brand',
      'project:team:project-brand',
    ]);
  });

  it('ensures and binds a missing backing project in the exact Workspace before direct share', async () => {
    const f = fixture({ projectInitiallyExists: false });

    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });

    expect(f.ensureProjectId).toHaveBeenCalledOnce();
    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.shared]).toEqual(['user:brand']);
    expect(f.calls).toEqual([
      'project:ensure:project-brand',
      'resource:share:user:brand',
      'project:team:project-brand',
    ]);
  });

  it('compensates a failed direct share without leaving the ensured project in Team', async () => {
    const f = fixture({ projectInitiallyExists: false });
    f.failNextProjectShare();

    await expect(f.service.share('user:brand', scope()))
      .rejects.toThrow('project publish failed');

    expect(f.ensureProjectId).toHaveBeenCalledOnce();
    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'project:ensure:project-brand',
      'resource:share:user:brand',
      'project:team:project-brand',
      'resource:unshare:user:brand',
    ]);
  });

  it('keeps an ensured backing project Personal when design-system publication fails', async () => {
    const f = fixture({ projectInitiallyExists: false });
    f.failResourceShare();

    await expect(f.service.share('user:brand', scope()))
      .rejects.toThrow('design-system publish failed');

    expect(f.ensureProjectId).toHaveBeenCalledOnce();
    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'project:ensure:project-brand',
      'resource:share:user:brand',
    ]);
  });

  it('leaves the project Personal when the design-system publish fails', async () => {
    const f = fixture();
    f.failResourceShare();

    await expect(f.service.share('user:brand', scope())).rejects.toThrow('design-system publish failed');

    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual(['resource:share:user:brand']);
  });

  it('compensates a published design system when project publish fails, then retries idempotently', async () => {
    const f = fixture();
    f.failNextProjectShare();

    await expect(f.service.share('user:brand', scope())).rejects.toThrow('project publish failed');
    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'resource:share:user:brand',
      'project:team:project-brand',
      'resource:unshare:user:brand',
    ]);

    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });
    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.shared]).toEqual(['user:brand']);
  });

  it('compensates both hubs when the local project projection cannot commit', async () => {
    const f = fixture();
    f.failNextProjectPersist();

    await expect(f.service.share('user:brand', scope()))
      .rejects.toThrow('project visibility persist failed');

    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'resource:share:user:brand',
      'project:team:project-brand',
      'project:personal:project-brand',
      'resource:unshare:user:brand',
    ]);
  });

  it('converges forward to Team when inverse resource compensation also fails once', async () => {
    const f = fixture();
    f.failNextProjectShare();
    f.failNextResourceUnshare();

    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.shared]).toEqual(['user:brand']);
    expect(f.calls).toEqual([
      'resource:share:user:brand',
      'project:team:project-brand',
      'resource:unshare:user:brand',
      'project:team:project-brand',
    ]);
  });

  it('converges the local Team projection when its inverse project unpublish fails once', async () => {
    const f = fixture();
    f.failNextProjectPersist();
    f.failNextProjectUnshare();

    await expect(f.service.share('user:brand', scope())).resolves.toEqual({ version: 1 });

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.shared]).toEqual(['user:brand']);
    expect(f.calls).toEqual([
      'resource:share:user:brand',
      'project:team:project-brand',
      'project:personal:project-brand',
    ]);
  });

  it('restores Team project visibility when design-system unshare fails', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.failResourceUnshare();

    await expect(f.service.unshare('user:brand', scope())).rejects.toThrow('design-system unpublish failed');

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect([...f.shared]).toEqual(['user:brand']);
    expect(f.calls).toEqual([
      'project:personal:project-brand',
      'resource:unshare:user:brand',
      'project:team:project-brand',
    ]);
  });

  it('converges forward to Personal when inverse project compensation also fails once', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.failNextResourceUnshare();
    f.failNextProjectShare();

    await expect(f.service.unshare('user:brand', scope())).resolves.toBe(true);

    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'project:personal:project-brand',
      'resource:unshare:user:brand',
      'project:team:project-brand',
      'resource:unshare:user:brand',
    ]);
  });

  it('converges the local Personal projection when inverse project publish fails once', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.failNextProjectPersist();
    f.failNextProjectShare();

    await expect(f.service.unshare('user:brand', scope())).resolves.toBe(true);

    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
    expect(f.calls).toEqual([
      'project:personal:project-brand',
      'project:team:project-brand',
      'resource:unshare:user:brand',
    ]);
  });

  it('does not touch the linked project when resource unshare permission is denied', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.denyAuthoritativeUnshare();

    await expect(f.service.unshare('user:brand', scope()))
      .rejects.toBeInstanceOf(TeamResourceShareForbiddenError);

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect(f.calls).toEqual([]);
  });

  it('treats an authoritative empty list as an idempotent unshare without touching the project', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.setAuthoritativeShared([]);

    await expect(f.service.unshare('user:brand', scope())).resolves.toBe(false);

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect(f.calls).toEqual([]);
  });

  it('does not undo an independent project share on a repeated design-system DELETE', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    await expect(f.service.unshare('user:brand', scope())).resolves.toBe(true);

    // The design system is already absent from the authoritative Team index,
    // while the backing project has since been shared independently.
    f.projectVisibility.set('project-brand', 'team');
    f.calls.length = 0;

    await expect(f.service.unshare('user:brand', scope())).resolves.toBe(false);

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect(f.calls).toEqual([]);
  });

  it('fails before touching the project when the authoritative Team index is unavailable', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.calls.length = 0;
    f.failAuthoritativeRead();

    await expect(f.service.unshare('user:brand', scope()))
      .rejects.toBeInstanceOf(TeamResourceAuthorityUnavailableError);

    expect(f.projectVisibility.get('project-brand')).toBe('team');
    expect(f.calls).toEqual([]);
  });

  it('downgrades hub owner/admin permission when the linked project creator gate denies mutation', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    const adminScope: TeamResourceRequestScope = {
      principal: {
        ...scope().principal,
        memberId: 'member-admin',
        role: 'admin',
      },
      canShare: true,
    };

    await expect(f.service.sharedResources(adminScope)).resolves.toEqual([
      { id: 'user:brand', ownerMemberId: 'member-owner', canUnshare: false },
    ]);
  });

  it('fails closed when the hub omits exact linked-project creator evidence', async () => {
    const f = fixture();
    await f.service.share('user:brand', scope());
    f.clearHubOwner();

    await expect(f.service.sharedResources(scope())).resolves.toEqual([
      { id: 'user:brand', canUnshare: false },
    ]);
  });

  it('derives list capability without running full project preparation per resource', async () => {
    const f = fixture();
    f.shared.add('user:brand');
    f.shared.add('user:brand-two');
    f.shared.add('user:brand-three');
    f.prepare.mockClear();

    await expect(f.service.sharedResources(scope())).resolves.toEqual([
      { id: 'user:brand', ownerMemberId: 'member-owner', canUnshare: true },
      { id: 'user:brand-two', ownerMemberId: 'member-owner', canUnshare: true },
      { id: 'user:brand-three', ownerMemberId: 'member-owner', canUnshare: true },
    ]);

    expect(f.prepare).not.toHaveBeenCalled();
  });

  it('fails closed across Workspace A→B before either hub mutation runs', async () => {
    const f = fixture();

    await expect(f.service.share('user:brand', scope('ws-b')))
      .rejects.toThrow('design system backing project belongs to another workspace');

    expect(f.calls).toEqual([]);
    expect(f.projectVisibility.get('project-brand')).toBe('personal');
    expect(f.shared.size).toBe(0);
  });
});
