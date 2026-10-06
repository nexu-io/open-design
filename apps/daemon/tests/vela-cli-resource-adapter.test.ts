import { describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock('../src/integrations/vela-command.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/vela-command.js')>()),
  runVelaCommand: runVelaCommandMock,
}));

import {
  contextHasTeamIdentity,
  createVelaCliResourceAdapter,
  runVelaResourceCommand,
  shouldUseVelaCliResourceTransport,
} from '../src/collab/vela-cli-resource-adapter.js';
import { createCollabRuntime } from '../src/collab/runtime.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

// Spelled out literally — NOT imported from the source module — so that an
// accidental deletion of any entry from the source lists turns this file red.
// Order: the secret-bearing member-mirror entries first, then the
// generated/installed trees the project UI already hides from the owner.
const EXPECTED_PUSH_EXCLUDED_ENTRIES = [
  // Secret-bearing entries that must never reach a member mirror.
  '.file-versions',
  '.live-artifacts',
  '.od-skills',
  '.od-frames',
  '.git',
  'node_modules',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.aws',
  '.ssh',
  '.azure',
  '.docker',
  '.gnupg',
  '.kube',
  '.pulumi',
  '.terraform',
  '.git-credentials',
  '.netrc',
  '.pypirc',
  'terraform.tfstate',
  'terraform.tfstate.backup',
  // Generated/installed trees (IGNORED_PROJECT_DIR_NAMES, minus the
  // duplicates above). Trailing slash = directory-only: the owner hides these
  // as directories, so a bare name would also swallow a regular file of the
  // same name (a project file literally called `target` or `out`).
  'vendor/',
  '.od/',
  'debug/',
  'dist/',
  'build/',
  '.build/',
  'deriveddata/',
  'target/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.cache/',
  '.output/',
  'out/',
  'coverage/',
  '.gradle/',
  '.swiftpm/',
  '.tmp/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.mypy_cache/',
  '.pytest_cache/',
  '.tox/',
  '.ruff_cache/',
];
const EXPECTED_PUSH_EXCLUDE_ARGS = EXPECTED_PUSH_EXCLUDED_ENTRIES
  .flatMap((name) => ['--exclude', name]);

/** The names passed via `--exclude` in one recorded spawn's argument list. */
function excludedNamesIn(args: readonly string[]): string[] {
  return args.flatMap((arg, index) => (arg === '--exclude' ? [args[index + 1]!] : []));
}

function recordingRun(outputs: Record<string, string>) {
  const calls: string[][] = [];
  const workspaces: Array<string | undefined> = [];
  const run = async (args: string[], workspaceId?: string): Promise<string> => {
    calls.push(args);
    workspaces.push(workspaceId);
    return outputs[args[0] ?? ''] ?? '';
  };
  return { run, calls, workspaces };
}

function scriptedRun(steps: Array<{ match: string[]; output?: string; error?: Error }>) {
  const calls: string[][] = [];
  const run = async (args: string[]): Promise<string> => {
    calls.push(args);
    const step = steps.shift();
    if (!step) throw new Error(`unexpected call: ${args.join(' ')}`);
    expect(args).toEqual(step.match);
    if (step.error) throw step.error;
    return step.output ?? '';
  };
  return { run, calls };
}

const OPTS = {
  resolveProjectDir: (id: string) => `/projects/${id}`,
  resolvePullDir: (id: string) => `/copies/${id}`,
  resourceIdFor: (id: string) => `project-${id}`,
  kind: 'design_system',
  hasTeamIdentity: () => true,
};

describe('createVelaCliResourceAdapter', () => {
  it('publishes by spawning `push … --ref published --json` and parses the version', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 7, id: 'v7' }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    const result = await adapter.publish({ projectId: 'p1', reason: 'edit' });
    expect(result).toEqual({ version: 7, versionId: 'v7' });
    expect(calls[0]).toEqual([
      'push',
      'design_system',
      'project-p1',
      '/projects/p1',
      '--ref',
      'published',
      '--json',
      ...EXPECTED_PUSH_EXCLUDE_ARGS,
      '--exclude-prefix',
      '.env',
      '--exclude-prefix',
      'deriveddata-/',
    ]);
  });

  it('excludes the generated trees the owner UI already hides, alongside every secret-bearing entry', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.publish({ projectId: 'p1', reason: 'edit' });

    const excluded = excludedNamesIn(calls[0]!);
    // Build/venv/cache output the project list and watcher never show the
    // owner must not fan out to member mirrors either.
    for (const name of ['dist/', 'build/', '.next/', '.venv/', 'coverage/', '.tmp/', '__pycache__/', 'node_modules']) {
      expect(excluded).toContain(name);
    }
    // The pre-existing secret exclusions must survive the merge untouched.
    for (const name of ['.git', '.ssh', '.aws', '.netrc', '.git-credentials', 'terraform.tfstate']) {
      expect(excluded).toContain(name);
    }
    const prefixAt = calls[0]!.indexOf('--exclude-prefix');
    expect(prefixAt).toBeGreaterThan(-1);
    expect(calls[0]![prefixAt + 1]).toBe('.env');
  });

  it('carries the owner-side deriveddata- prefix rule, directory-scoped', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.publish({ projectId: 'p1', reason: 'edit' });

    const prefixes = calls[0]!.flatMap((arg, i) =>
      arg === '--exclude-prefix' ? [calls[0]![i + 1]!] : []);
    // The owner hides any `deriveddata-*` DIRECTORY; a regular file starting
    // with that prefix is ordinary content and must still reach members.
    expect(prefixes).toContain('deriveddata-/');
    expect(prefixes).not.toContain('deriveddata-');
    // `.env` stays bare: a secret is unwelcome as a file or a directory.
    expect(prefixes).toContain('.env');
  });

  it('scopes generated-tree exclusions to directories so same-named files still sync', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.publish({ projectId: 'p1', reason: 'edit' });

    const excluded = excludedNamesIn(calls[0]!);
    // `--exclude target` matches by entry name regardless of type, so the bare
    // form would also drop a regular project file named `target` — content the
    // owner still sees, silently missing from every member mirror. The owner
    // side hides these as directories only, and the slash form says so.
    for (const bare of ['target', 'out', 'dist', 'build', 'debug', 'coverage', 'vendor']) {
      expect(excluded).not.toContain(bare);
      expect(excluded).toContain(`${bare}/`);
    }
    // Secret-bearing entries keep the bare form on purpose: those must never
    // leave the machine as a file OR a directory.
    for (const bare of ['.git', '.ssh', '.aws', 'node_modules', 'terraform.tfstate']) {
      expect(excluded).toContain(bare);
      expect(excluded).not.toContain(`${bare}/`);
    }
  });

  it('passes project metadata to the resource index when available', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 7, id: 'v7' }) });
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      describeProject: () => ({ name: 'Launch Deck', metadata: { kind: 'deck' } }),
      run,
    });
    await adapter.publish({ projectId: 'p1', reason: 'edit' });
    expect(calls[0]).toEqual([
      'push',
      'design_system',
      'project-p1',
      '/projects/p1',
      '--ref',
      'published',
      '--json',
      ...EXPECTED_PUSH_EXCLUDE_ARGS,
      '--exclude-prefix',
      '.env',
      '--exclude-prefix',
      'deriveddata-/',
      '--metadata-json',
      JSON.stringify({ name: 'Launch Deck', metadata: { kind: 'deck' } }),
    ]);
  });

  it('stores the project id in project resource metadata for legacy catalog fallback', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 7 }) });
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      kind: 'project',
      describeProject: () => ({ name: 'Launch Deck' }),
      run,
    });

    await adapter.publish({ projectId: 'p1', reason: 'share' });

    expect(calls[0]?.slice(-2)).toEqual([
      '--metadata-json',
      JSON.stringify({ projectId: 'p1', name: 'Launch Deck' }),
    ]);
  });

  it('reports the head version via `head` without pulling', async () => {
    const { run, calls } = recordingRun({ head: JSON.stringify({ version: 3 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toEqual({ version: 3 });
    expect(calls[0]).toEqual(['head', 'project-p1', '--ref', 'published', '--json']);
  });

  it('passes the selected team workspace to every scoped Vela invocation', async () => {
    const principal = {
      teamId: 'team-selected',
      memberId: 'member-1',
      role: 'member',
      lifecycleState: 'active',
      workspaceType: 'team',
    } as const;
    const { run, workspaces } = recordingRun({
      push: JSON.stringify({ version: 7 }),
      head: JSON.stringify({ version: 7 }),
      pull: JSON.stringify({ version: 7, versionId: 'v7' }),
      remove: '{}',
    });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });

    await adapter.publish({ projectId: 'p1', principal, reason: 'edit' });
    await adapter.syncLatest!({ projectId: 'p1', principal });
    await adapter.pull!({ projectId: 'p1', principal });
    await adapter.unpublish!({ projectId: 'p1', principal });

    expect(workspaces).toEqual([
      'team-selected',
      'team-selected',
      'team-selected',
      'team-selected',
    ]);
  });

  it('treats a null head version (nothing published) as no result', async () => {
    const { run } = recordingRun({ head: JSON.stringify({ resourceId: 'project-p1', ref: 'published', version: null }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toBeNull();
  });

  it('falls back to the legacy unscoped resource id when a scoped head is empty', async () => {
    const principal = { teamId: 't1', memberId: 'm1', role: 'member', lifecycleState: 'active' } as const;
    const { run, calls } = scriptedRun([
      {
        match: ['head', 'project-t1-m1-p1', '--ref', 'published', '--json'],
        output: JSON.stringify({ resourceId: 'project-t1-m1-p1', ref: 'published', version: null }),
      },
      {
        match: ['head', 'project-p1', '--ref', 'published', '--json'],
        output: JSON.stringify({ version: 9 }),
      },
    ]);
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      resourceIdFor: (id, inputPrincipal) =>
        inputPrincipal ? `project-${inputPrincipal.teamId}-${inputPrincipal.memberId}-${id}` : `project-${id}`,
      run,
    });
    expect(await adapter.syncLatest!({ projectId: 'p1', principal })).toEqual({ version: 9 });
    expect(calls).toHaveLength(2);
  });

  it('returns the exact version materialized by `pull --json`', async () => {
    const { run, calls } = recordingRun({
      pull: JSON.stringify({
        version: 1,
        versionId: 'v1',
        manifestDigest: 'd1',
      }),
    });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    const result = await adapter.pull!({ projectId: 'p1' });
    expect(result).toEqual({ version: 1, versionId: 'v1' });
    expect(calls[0]).toEqual(['pull', 'design_system', 'project-p1', '/copies/p1', '--ref', 'published', '--json']);
  });

  it('falls back to the legacy unscoped resource id when a scoped pull is missing', async () => {
    const principal = { teamId: 't1', memberId: 'm1', role: 'member', lifecycleState: 'active' } as const;
    const { run, calls } = scriptedRun([
      {
        match: ['pull', 'design_system', 'project-t1-m1-p1', '/copies/p1', '--ref', 'published', '--json'],
        error: new Error('resource_not_found'),
      },
      {
        match: ['pull', 'design_system', 'project-p1', '/copies/p1', '--ref', 'published', '--json'],
        output: JSON.stringify({ version: 9, versionId: 'v9' }),
      },
    ]);
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      resourceIdFor: (id, inputPrincipal) =>
        inputPrincipal ? `project-${inputPrincipal.teamId}-${inputPrincipal.memberId}-${id}` : `project-${id}`,
      run,
    });
    await adapter.pull!({ projectId: 'p1', principal });
    expect(calls).toHaveLength(2);
  });

  it('fails closed when a successful pull response omits the materialized version', async () => {
    const { run } = recordingRun({
      pull: JSON.stringify({
        resourceId: 'project-p1',
        ref: 'published',
        dir: '/copies/p1',
      }),
    });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });

    await expect(adapter.pull!({ projectId: 'p1' })).rejects.toThrow(
      'missing the materialized version',
    );
  });

  it('does not hide authentication failures behind a legacy pull fallback', async () => {
    const principal = { teamId: 't1', memberId: 'm1', role: 'member', lifecycleState: 'active' } as const;
    const { run, calls } = scriptedRun([
      {
        match: ['pull', 'design_system', 'project-t1-m1-p1', '/copies/p1', '--ref', 'published', '--json'],
        error: new Error('API request failed with status 403: missing_principal'),
      },
    ]);
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      resourceIdFor: (id, inputPrincipal) =>
        inputPrincipal ? `project-${inputPrincipal.teamId}-${inputPrincipal.memberId}-${id}` : `project-${id}`,
      run,
    });

    await expect(adapter.pull!({ projectId: 'p1', principal })).rejects.toThrow(
      'missing_principal',
    );
    expect(calls).toHaveLength(1);
  });

  it('removes a project from the team resource index', async () => {
    const { run, calls } = recordingRun({ remove: JSON.stringify({ ok: true }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.unpublish!({ projectId: 'p1' });
    expect(calls[0]).toEqual(['remove', 'project-p1', '--json']);
  });

  it('no-ops (never spawns) when there is no team identity', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, hasTeamIdentity: () => false, run });
    expect(await adapter.publish({ projectId: 'p1', reason: 'edit' })).toBeNull();
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toBeNull();
    await adapter.pull!({ projectId: 'p1' });
    await adapter.unpublish!({ projectId: 'p1' });
    expect(calls.length).toBe(0);
  });

  it('stops spawning `vela resource push` on the very next attempt once the live context reports the member removed', async () => {
    // Reproduces the collab-publish-watcher gap: an already-attached file
    // watcher never re-checks `shouldPublish`, so the ONLY thing standing
    // between a removed owner's local edits and `vela resource push` is this
    // adapter re-deriving `hasTeamIdentity` fresh on every publish attempt.
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    let memberStatus: 'active' | 'removed' = 'active';
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      hasTeamIdentity: () =>
        contextHasTeamIdentity({
          workspaceType: 'team',
          workspaceId: 't1',
          workspaceMemberId: 'm1',
          memberStatus,
        } as never),
      run,
    });

    // While still an active member, an edit publishes normally.
    expect(await adapter.publish({ projectId: 'p1', reason: 'edit' })).toEqual({ version: 1 });
    expect(calls).toHaveLength(1);

    // The team removes this member out-of-band (B-side); the daemon keeps
    // running with the file watcher still attached.
    memberStatus = 'removed';

    // The next debounced publish for the SAME already-watched project must not
    // reach the vela CLI at all.
    expect(await adapter.publish({ projectId: 'p1', reason: 'edit' })).toBeNull();
    expect(calls).toHaveLength(1);

    // Read/unpublish operations on the same live session are refused too —
    // a removed member's daemon should not keep talking to the team hub at
    // all through this session.
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toBeNull();
    await adapter.pull!({ projectId: 'p1' });
    await adapter.unpublish!({ projectId: 'p1' });
    expect(calls).toHaveLength(1);
  });
});

describe('transport selection', () => {
  it('opts into the CLI transport for explicit or Vela-backed team modes', () => {
    expect(shouldUseVelaCliResourceTransport({ OD_RESOURCE_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({ OD_RESOURCE_TRANSPORT: 'sdk' })).toBe(false);
    expect(shouldUseVelaCliResourceTransport({ OD_WORKSPACE_CONTEXT_SOURCE: 'vela' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OD_RESOURCE_TRANSPORT: 'sdk',
    })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({ OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({ OD_COLLAB_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({})).toBe(false);
  });

  it('gates team identity on a live team workspace context', () => {
    expect(
      contextHasTeamIdentity({
        workspaceType: 'team',
        workspaceId: 't1',
        workspaceMemberId: 'm1',
        memberStatus: 'active',
      } as never),
    ).toBe(true);
    expect(contextHasTeamIdentity({
      workspaceType: 'personal',
      workspaceId: 'personal-1',
      workspaceMemberId: 'm1',
      memberStatus: 'active',
    } as never)).toBe(false);
    expect(contextHasTeamIdentity(null)).toBe(false);
  });

  it('refuses a member the team has removed, even though their identity fields still resolve', () => {
    // A removed member's workspaceType/workspaceId/workspaceMemberId keep
    // resolving — only memberStatus flips — so the identity fields alone are
    // not enough to prove this session may still address the resource hub.
    expect(
      contextHasTeamIdentity({
        workspaceType: 'team',
        workspaceId: 't1',
        workspaceMemberId: 'm1',
        memberStatus: 'removed',
      } as never),
    ).toBe(false);
  });
});

// Red spec for the "unshare retry-trap / fresh-install ghost" family: an
// unshare is two hub writes (resource remove → team-projects catalog remove).
// When the first landed but the second did not (crash or network between
// them), the hub is left dangling: the team_project_catalog row still lists
// the project while its backing resource row is tombstoned. Reproduced live
// on the feature-test hub (2026-07-27, workspace res-wipe-0727): every
// subsequent unshare attempt died re-removing the already-tombstoned resource
// (`vela resource remove` → 404 `resource_not_found`, surfaced as HTTP 400
// and a local-row rollback), so the catalog row could NEVER be removed — and
// after a reinstall (fresh data root, local `cloudTombstonedAt` gone) the
// retracted project came back as a normal-looking team card for everyone.
//
// The invariant under test: `unpublish` is a retraction toward one end state
// — "the hub no longer serves this resource". A hub answer that the resource
// is already absent IS that end state, so retraction must treat it as
// success and let the caller finish the rest of the unshare (the catalog
// removal), instead of failing the whole operation forever.
describe('unpublish retraction idempotency (dangling team-catalog heal)', () => {
  const retractedError = () =>
    new Error(
      'Command failed: vela resource remove project-p1 --json\n' +
        'Error: remove resource: API request failed with status 404: resource_not_found\n',
    );

  it('treats an already-retracted hub resource as unpublish success, not failure', async () => {
    const { run, calls } = scriptedRun([
      { match: ['remove', 'project-p1', '--json'], error: retractedError() },
    ]);
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await expect(adapter.unpublish!({ projectId: 'p1' })).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('still surfaces unpublish failures that do not prove the resource is gone', async () => {
    const { run } = scriptedRun([
      {
        match: ['remove', 'project-p1', '--json'],
        error: new Error('Command failed: vela resource remove project-p1 --json\nError: network unreachable\n'),
      },
    ]);
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await expect(adapter.unpublish!({ projectId: 'p1' })).rejects.toThrow('network unreachable');
  });

  it('an unshare retry against an already-retracted resource completes the catalog removal', async () => {
    // The exact retry a stuck sharer fires from the UI: the resource row is
    // already tombstoned (first attempt half-landed), the catalog row is the
    // one thing left to remove. Before the fix the retry rejected at the
    // resource step and never reached the catalog.
    const principal: ResourceHubPrincipal = {
      teamId: 't1',
      memberId: 'owner-1',
      role: 'owner',
      lifecycleState: 'active',
    };
    const { run } = scriptedRun([
      { match: ['remove', 'project-p1', '--json'], error: retractedError() },
    ]);
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    const catalogRemove = vi.fn(async () => ({}));
    const runtime = createCollabRuntime({
      adapter,
      teamProjectCatalog: { upsert: async () => ({}), remove: catalogRemove },
    });
    try {
      await expect(runtime.requestTeamUnshare('p1', principal)).resolves.toBeUndefined();
      expect(catalogRemove).toHaveBeenCalledWith('p1', principal);
    } finally {
      runtime.dispose();
    }
  });
});

// Red spec for the resource-transport spawn budgets. Before these existed,
// only `pull` carried a timeout: a wedged `vela resource push` (hung network,
// stalled auth refresh) held the scheduler's in-flight publish forever — no
// error ever reached the failure path, so the project sat "publishing" until
// daemon restart. head/shared/remove are pure metadata round-trips and get a
// tight budget; push uploads whole project snapshots over arbitrary uplinks
// and gets a deliberately huge one that only reaps truly-stuck children.
describe('vela resource transport budgets', () => {
  it('bounds every publish/metadata subcommand and keeps the pull budget', async () => {
    runVelaCommandMock.mockReset();
    runVelaCommandMock.mockResolvedValue('{}');

    await runVelaResourceCommand(['push', 'project', 'r1', '/projects/p1', '--ref', 'published', '--json'], 'w1');
    await runVelaResourceCommand(['head', 'r1', '--ref', 'published', '--json'], 'w1');
    await runVelaResourceCommand(['shared', '--json'], 'w1');
    await runVelaResourceCommand(['remove', 'r1', '--json'], 'w1');
    await runVelaResourceCommand(['pull', 'project', 'r1', '/copies/p1', '--ref', 'published', '--json'], 'w1');

    expect(runVelaCommandMock).toHaveBeenCalledTimes(5);
    for (const [args] of runVelaCommandMock.mock.calls) {
      expect(args[0]).toBe('resource');
    }
    const timeoutBySubcommand = Object.fromEntries(
      runVelaCommandMock.mock.calls.map(([args, options]) => [args[1], options?.timeoutMs]),
    );
    expect(timeoutBySubcommand).toEqual({
      push: 600_000,
      head: 60_000,
      shared: 60_000,
      remove: 60_000,
      pull: 30_000,
    });
  });
});
