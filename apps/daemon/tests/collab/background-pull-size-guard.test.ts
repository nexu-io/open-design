import { describe, expect, it, vi } from 'vitest';
import {
  backgroundPullMaxEntriesFromEnv,
  createBackgroundPullSizeGuard,
  DEFAULT_BACKGROUND_PULL_MAX_ENTRIES,
} from '../../src/collab/background-pull-size-guard.js';
import {
  inspectAuthorizedTeamProjectPull,
  type AuthorizedTeamProjectPullInspection,
  type RunAuthorizedTeamProjectPull,
} from '../../src/collab/authorized-team-project-pull.js';
import {
  createProactiveContentPull,
  type ProactiveContentPullDeps,
} from '../../src/collab/proactive-content-pull.js';

// The background pull size guard (issue #6518, incident #6512) decides —
// BEFORE any blob download — whether a background-lane content pull for a
// shared project version is worth materializing on every member's disk. It
// reads the version's manifest entry count through an authorize-only Vela
// probe and defers versions above the threshold to the foreground lane.
//
// Fail-closed here means PULL AS BEFORE: an unknown count, an old CLI without
// the probe, or a probe failure must all degrade to the pre-guard behavior
// (materialize normally). A deferred version must never be re-probed on every
// sweep round — one authorize per scope+version, remembered like the module's
// other in-memory cursors.

const scope = {
  projectId: 'proj-1',
  workspaceId: 'ws-1',
  resourceTeamId: 'team-1',
  viewerMemberId: 'wm-member',
  ownerMemberId: 'wm-owner',
};

function countedInspect(
  entryCount: number,
): AuthorizedTeamProjectPullInspection {
  return { kind: 'counted', entryCount };
}

describe('createBackgroundPullSizeGuard', () => {
  it('defers a version whose entry count exceeds the threshold', async () => {
    const onDeferred = vi.fn();
    const inspect = vi.fn(async () => countedInspect(7442));
    const guard = createBackgroundPullSizeGuard({
      maxEntries: 2000,
      inspect,
      onDeferred,
    });

    await expect(guard.assess(scope, 12)).resolves.toBe('defer');
    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining(scope),
      12,
    );
    expect(onDeferred).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 12,
      entryCount: 7442,
      maxEntries: 2000,
    }));
  });

  it('pulls a version at or below the threshold', async () => {
    const guard = createBackgroundPullSizeGuard({
      maxEntries: 2000,
      inspect: async () => countedInspect(2000),
    });
    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
  });

  it('never re-probes a deferred scope+version on later rounds', async () => {
    const inspect = vi.fn(async () => countedInspect(5000));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    await expect(guard.assess(scope, 12)).resolves.toBe('defer');
    await expect(guard.assess(scope, 12)).resolves.toBe('defer');
    await expect(guard.assess(scope, 11)).resolves.toBe('defer');

    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('re-probes when a newer version supersedes a deferred one', async () => {
    const inspect = vi.fn(async (_scope: unknown, version: number) =>
      countedInspect(version === 12 ? 5000 : 10));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    await expect(guard.assess(scope, 12)).resolves.toBe('defer');
    await expect(guard.assess(scope, 13)).resolves.toBe('pull');
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('caches an allowed decision per version so retry loops do not re-probe', async () => {
    const inspect = vi.fn(async () => countedInspect(10));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent assessments of the same scope+version onto one probe', async () => {
    let resolveInspect: (value: AuthorizedTeamProjectPullInspection) => void;
    const inspect = vi.fn(
      () =>
        new Promise<AuthorizedTeamProjectPullInspection>((resolve) => {
          resolveInspect = resolve;
        }),
    );
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    const first = guard.assess(scope, 12);
    const second = guard.assess(scope, 12);
    resolveInspect!(countedInspect(5000));

    await expect(first).resolves.toBe('defer');
    await expect(second).resolves.toBe('defer');
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('fails open when the CLI cannot count entries (old CLI output shape)', async () => {
    const inspect = vi.fn(async () => ({ kind: 'uncounted' } as const));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });
    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
  });

  it('fails open and stops probing once the CLI lacks the probe capability', async () => {
    const inspect = vi.fn(async () => ({ kind: 'unavailable' } as const));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    await expect(guard.assess(scope, 4)).resolves.toBe('pull');
    await expect(
      guard.assess({ ...scope, projectId: 'proj-2' }, 9),
    ).resolves.toBe('pull');
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('fails open when the probe throws, without caching the failure', async () => {
    const onError = vi.fn();
    const inspect = vi.fn(async () => {
      throw new Error('authorize transport down');
    });
    const guard = createBackgroundPullSizeGuard({
      maxEntries: 2000,
      inspect,
      onError,
    });

    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('is disabled entirely when maxEntries is 0', async () => {
    const inspect = vi.fn(async () => countedInspect(999_999));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 0, inspect });
    await expect(guard.assess(scope, 3)).resolves.toBe('pull');
    expect(inspect).not.toHaveBeenCalled();
  });

  it('scopes deferral to the exact pull scope, not just the project id', async () => {
    const inspect = vi.fn(async () => countedInspect(5000));
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });

    await expect(guard.assess(scope, 12)).resolves.toBe('defer');
    await expect(
      guard.assess({ ...scope, workspaceId: 'ws-2' }, 12),
    ).resolves.toBe('defer');
    expect(inspect).toHaveBeenCalledTimes(2);
  });
});

describe('backgroundPullMaxEntriesFromEnv', () => {
  it('defaults to 2000', () => {
    expect(DEFAULT_BACKGROUND_PULL_MAX_ENTRIES).toBe(2000);
    expect(backgroundPullMaxEntriesFromEnv({})).toBe(2000);
  });

  it('honors a positive integer override', () => {
    expect(backgroundPullMaxEntriesFromEnv({
      OD_COLLAB_BACKGROUND_PULL_MAX_ENTRIES: '500',
    })).toBe(500);
  });

  it('treats 0 as guard-disabled', () => {
    expect(backgroundPullMaxEntriesFromEnv({
      OD_COLLAB_BACKGROUND_PULL_MAX_ENTRIES: '0',
    })).toBe(0);
  });

  it('falls back to the default for invalid values', () => {
    for (const value of ['', 'many', '-5', '2.5', 'NaN']) {
      expect(backgroundPullMaxEntriesFromEnv({
        OD_COLLAB_BACKGROUND_PULL_MAX_ENTRIES: value,
      })).toBe(2000);
    }
  });
});

describe('inspectAuthorizedTeamProjectPull (authorize-only Vela probe)', () => {
  // One clock read for both stamps: the validator rejects a window wider than
  // RECEIPT_MAX_AGE_MS, and two independent Date.now() calls straddling a
  // millisecond boundary would widen it by 1ms at random.
  const receiptJson = (overrides: Record<string, unknown> = {}) => {
    const authorizedAtMs = Date.now();
    return JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-member',
      ownerMemberId: 'wm-owner',
      projectId: 'proj-1',
      // Derived, not arbitrary: projectResourceIdFor(projectId, {teamId,
      // memberId}) — the receipt validator recomputes this, so a hand-written
      // id would (correctly) read as a foreign receipt.
      resourceId: `project-${Buffer.from(
        JSON.stringify(['team-1', 'wm-owner', 'proj-1']),
        'utf8',
      ).toString('base64url')}`,
      ref: 'published',
      version: 12,
      versionId: 'version-12',
      manifestDigest: `sha256:${'a'.repeat(64)}`,
      lifecycleState: 'active',
      authorizedAt: new Date(authorizedAtMs).toISOString(),
      expiresAt: new Date(authorizedAtMs + 1_500).toISOString(),
      manifestEntryCount: 7442,
      ...overrides,
    });
  };

  it('runs an authorize-only pull and returns the manifest entry count', async () => {
    const run = vi.fn<RunAuthorizedTeamProjectPull>(async () => receiptJson());
    const inspection = await inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    });

    expect(inspection).toEqual({ kind: 'counted', entryCount: 7442 });
    const [args, workspaceId] = run.mock.calls[0]!;
    expect(args).toEqual([
      'pull',
      'proj-1',
      '--authorize-only',
      '--ref',
      'published',
      '--expected-version',
      '12',
      '--json',
    ]);
    expect(workspaceId).toBe('ws-1');
  });

  it('reports uncounted when the output has no manifestEntryCount', async () => {
    const run = vi.fn(async () =>
      receiptJson({ manifestEntryCount: undefined }));
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'uncounted' });
  });

  it('reports uncounted for malformed output instead of blocking the pull', async () => {
    const run = vi.fn(async () => 'Staged proj-1 version 12\n');
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'uncounted' });
  });

  // The probe's answer is only usable if the receipt is bound to THIS pull.
  // projectId + version + workspaceId are not the whole binding: the same
  // workspace carries many principals, so a receipt for another owner or
  // viewer could otherwise be accepted as 'counted' — and an oversized count
  // there gets cached as a deferral, suppressing background materialization
  // for a scope that was never actually inspected. That is the opposite of
  // the fail-open promise, so every scope-binding field must match.
  it.each([
    ['resourceTeamId', { resourceTeamId: 'team-other' }],
    ['viewerMemberId', { viewerMemberId: 'wm-other-viewer' }],
    ['ownerMemberId', { ownerMemberId: 'wm-other-owner' }],
    ['resourceId', { resourceId: 'project-not-derived' }],
    ['ref', { ref: 'draft' }],
    ['schemaVersion', { schemaVersion: 2 }],
  ])('reports uncounted when the receipt %s does not match this scope', async (_field, override) => {
    const run = vi.fn<RunAuthorizedTeamProjectPull>(async () => receiptJson(override));
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'uncounted' });
  });

  it('reports uncounted when the output binding does not match the request', async () => {
    const run = vi.fn(async () => receiptJson({ projectId: 'proj-other' }));
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'uncounted' });
  });

  it('reports unavailable when the CLI lacks --authorize-only', async () => {
    const run = vi.fn(async () => {
      throw new Error('vela: unknown flag: --authorize-only');
    });
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reports unavailable when the CLI lacks team-projects pull entirely', async () => {
    const run = vi.fn(async () => {
      throw new Error('Error: unknown command "team-projects" for "vela"');
    });
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('rethrows transport failures so the caller can fail open without caching', async () => {
    const run = vi.fn(async () => {
      throw new Error('vela command timed out after 30000ms');
    });
    await expect(inspectAuthorizedTeamProjectPull({
      projectId: 'proj-1',
      scope,
      expectedVersion: 12,
      run,
    })).rejects.toThrow('timed out');
  });
});

describe('background size guard composed with the proactive pull lanes', () => {
  function makeComposedDeps(
    guardInspect: (
      target: unknown,
      version: number,
    ) => Promise<AuthorizedTeamProjectPullInspection>,
  ) {
    const inspect = vi.fn(guardInspect);
    const guard = createBackgroundPullSizeGuard({ maxEntries: 2000, inspect });
    const pullCalls: Array<{ projectId: string; version: number | undefined }> = [];
    let persisted: string | null = null;
    const deps: ProactiveContentPullDeps & {
      pullCalls: typeof pullCalls;
      setPersisted: (value: string | null) => void;
    } = {
      pullCalls,
      setPersisted: (value) => {
        persisted = value;
      },
      getLocalBinding: () => ({ workspaceId: 'ws-1', visibility: 'team' }),
      getWorkspaceIdentity: async () => ({
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        workspaceMemberId: 'wm-member',
      }),
      resolveSharedProjectOwner: async () => 'wm-owner',
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 12,
      materializedVersion: () => persisted,
      assessBackgroundContentPull: (target, version) =>
        guard.assess(target, version),
      pullSharedProject: async (target, expectedVersion) => {
        pullCalls.push({ projectId: target.projectId, version: expectedVersion });
        return { status: 'pulled', version: expectedVersion ?? null };
      },
    };
    return { deps, inspect };
  }

  it('background lanes probe once, defer, and stay quiet across sweep rounds', async () => {
    const { deps, inspect } = makeComposedDeps(async () =>
      countedInspect(7442));
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 12,
    });
    await pull.catchUpPublishedHeads('ws-1');
    await pull.catchUpPublishedHeads('ws-1');
    await pull.materializeMissingProjects('ws-1');

    expect(deps.pullCalls).toEqual([]);
    // One authorize-only probe total: the deferred marker answers every
    // later background round without going back to the cloud.
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('the foreground lane bypasses the guard and its success retires the deferral', async () => {
    const { deps, inspect } = makeComposedDeps(async () =>
      countedInspect(7442));
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 12,
    });
    expect(deps.pullCalls).toEqual([]);

    // User opens the project: the foreground lane (POST /collab/pull in
    // routes/collab-sync.ts) runs the shared pull directly — it has no
    // assessBackgroundContentPull hook at all — then server.ts reports the
    // durable landing through observeMaterialized.
    const foregroundOutcome = await deps.pullSharedProject(
      {
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
      },
      12,
    );
    expect(foregroundOutcome).toEqual({ status: 'pulled', version: 12 });
    deps.setPersisted('12');
    await pull.observeMaterialized(
      {
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
      },
      12,
    );

    await pull.catchUpPublishedHeads('ws-1');
    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 12,
    });

    // No background re-probe and no background re-pull: the cursor advanced
    // by the foreground pull satisfies every later background round.
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual([
      { projectId: 'proj-1', version: 12 },
    ]);
  });

  it('a later smaller version pulls in the background again', async () => {
    const { deps, inspect } = makeComposedDeps(async (_target, version) =>
      countedInspect(version === 12 ? 7442 : 40));
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 12,
    });
    expect(deps.pullCalls).toEqual([]);

    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 13,
    });
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(deps.pullCalls).toEqual([
      { projectId: 'proj-1', version: 13 },
    ]);
  });
});
