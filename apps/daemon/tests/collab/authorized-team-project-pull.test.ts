import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isAuthorizedTeamProjectPullReceiptExpired,
  isAuthorizedTeamProjectPullUnavailable,
  stageAuthorizedTeamProjectPull,
  validateAuthorizedTeamProjectPullReceipt,
  type AuthorizedTeamProjectPullReceipt,
} from '../../src/collab/authorized-team-project-pull.js';
import { projectResourceIdFor } from '../../src/integrations/vela-team-projects.js';

const roots: string[] = [];
const NOW = Date.parse('2026-07-26T10:00:00.500Z');
const SCOPE = {
  workspaceId: 'workspace-1',
  resourceTeamId: 'workspace-1',
  viewerMemberId: 'viewer-1',
  ownerMemberId: 'owner-1',
} as const;
const RESOURCE_ID = projectResourceIdFor('project-1', {
  teamId: SCOPE.resourceTeamId,
  memberId: SCOPE.ownerMemberId,
  role: 'member',
  lifecycleState: 'active',
  workspaceType: 'team',
});

function receipt(
  overrides: Partial<AuthorizedTeamProjectPullReceipt> = {},
): AuthorizedTeamProjectPullReceipt {
  return {
    schemaVersion: 1,
    workspaceId: SCOPE.workspaceId,
    resourceTeamId: SCOPE.resourceTeamId,
    viewerMemberId: SCOPE.viewerMemberId,
    ownerMemberId: SCOPE.ownerMemberId,
    projectId: 'project-1',
    resourceId: RESOURCE_ID,
    ref: 'published',
    version: 7,
    versionId: 'version-7',
    manifestDigest: `sha256:${'a'.repeat(64)}`,
    lifecycleState: 'active',
    authorizedAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T10:00:02.000Z',
    ...overrides,
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-authorized-pull-'));
  roots.push(root);
  const liveDir = path.join(root, 'project-1');
  await mkdir(liveDir);
  await writeFile(path.join(liveDir, 'index.html'), 'old');
  return { root, liveDir };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      const { rm } = await import('node:fs/promises');
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe('authorized staged team-project pull', () => {
  it('runs the exact-version Vela command into a random empty same-parent stage', async () => {
    const { root, liveDir } = await fixture();
    const calls: Array<{ args: string[]; workspaceId: string | undefined }> = [];

    const staged = await stageAuthorizedTeamProjectPull({
      projectId: 'project-1',
      liveDir,
      scope: SCOPE,
      expectedVersion: 7,
      now: () => NOW,
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        const stageDir = args[2]!;
        expect(path.dirname(stageDir)).toBe(root);
        expect(path.basename(stageDir)).toMatch(/^\.project-1\.od-pull-stage-/u);
        expect(await readdir(stageDir)).toEqual([]);
        await writeFile(path.join(stageDir, 'index.html'), 'new');
        return JSON.stringify(receipt());
      },
    });

    expect(calls).toEqual([{
      args: [
        'pull',
        'project-1',
        staged.stageDir,
        '--live-dir',
        liveDir,
        '--ref',
        'published',
        '--expected-version',
        '7',
        '--json',
      ],
      workspaceId: 'workspace-1',
    }]);
    expect(staged.receipt).toEqual(receipt());
    expect(await readFile(path.join(staged.stageDir, 'index.html'), 'utf8')).toBe('new');
    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8')).toBe('old');
    await staged.cleanup();
    expect((await readdir(root)).filter((name) => name.includes('.od-pull-stage-'))).toEqual([]);
  });

  it.each([
    ['workspaceId', { workspaceId: 'workspace-2' }],
    ['resourceTeamId', { resourceTeamId: 'team-2' }],
    ['viewerMemberId', { viewerMemberId: 'viewer-2' }],
    ['ownerMemberId', { ownerMemberId: 'owner-2' }],
    ['projectId', { projectId: 'project-2' }],
    ['resourceId empty', { resourceId: '' }],
    ['resourceId non-canonical', { resourceId: 'resource-1' }],
    ['ref', { ref: 'draft' as 'published' }],
    ['version', { version: 8 }],
    ['versionId', { versionId: '' }],
    ['manifestDigest', { manifestDigest: 'sha256:not-a-digest' }],
    ['lifecycleState', { lifecycleState: 'inactive' as 'active' }],
    ['schemaVersion', { schemaVersion: 2 as 1 }],
  ])('rejects a receipt whose %s binding is invalid', (_field, overrides) => {
    expect(() =>
      validateAuthorizedTeamProjectPullReceipt(receipt(overrides), {
        projectId: 'project-1',
        scope: SCOPE,
        expectedVersion: 7,
        nowMs: NOW,
      }),
    ).toThrow();
  });

  it.each([
    ['expired', { authorizedAt: '2026-07-26T09:59:57.000Z', expiresAt: '2026-07-26T09:59:59.000Z' }],
    ['overlong', { authorizedAt: '2026-07-26T10:00:00.000Z', expiresAt: '2026-07-26T10:00:02.001Z' }],
    ['reverse', { authorizedAt: '2026-07-26T10:00:01.000Z', expiresAt: '2026-07-26T10:00:01.000Z' }],
    ['malformed', { authorizedAt: 'not-a-date' }],
  ])('rejects a %s receipt outside the two-second freshness envelope', (_case, overrides) => {
    expect(() =>
      validateAuthorizedTeamProjectPullReceipt(receipt(overrides), {
        projectId: 'project-1',
        scope: SCOPE,
        expectedVersion: 7,
        nowMs: NOW,
      }),
    ).toThrow();
  });

  it.each([
    ['at expiry', '2026-07-26T10:00:00.500Z'],
    ['past expiry', '2026-07-26T10:00:00.499Z'],
  ])('classifies only an actually expired receipt as retryable: %s', (_case, expiresAt) => {
    let thrown: unknown;
    try {
      validateAuthorizedTeamProjectPullReceipt(receipt({
        authorizedAt: '2026-07-26T09:59:58.500Z',
        expiresAt,
      }), {
        projectId: 'project-1',
        scope: SCOPE,
        expectedVersion: 7,
        nowMs: NOW,
      });
    } catch (error) {
      thrown = error;
    }
    expect(isAuthorizedTeamProjectPullReceiptExpired(thrown)).toBe(true);
  });

  it('does not classify an overlong receipt envelope as retryable expiry', () => {
    let thrown: unknown;
    try {
      validateAuthorizedTeamProjectPullReceipt(receipt({
        authorizedAt: '2026-07-26T10:00:00.000Z',
        expiresAt: '2026-07-26T10:00:02.001Z',
      }), {
        projectId: 'project-1',
        scope: SCOPE,
        expectedVersion: 7,
        nowMs: NOW,
      });
    } catch (error) {
      thrown = error;
    }
    expect(isAuthorizedTeamProjectPullReceiptExpired(thrown)).toBe(false);
  });

  it('accepts a fresh receipt whose authorization clock is slightly ahead locally', () => {
    expect(() =>
      validateAuthorizedTeamProjectPullReceipt(receipt({
        authorizedAt: '2026-07-26T10:00:01.000Z',
        expiresAt: '2026-07-26T10:00:03.000Z',
      }), {
        projectId: 'project-1',
        scope: SCOPE,
        expectedVersion: 7,
        nowMs: NOW,
      }),
    ).not.toThrow();
  });

  it('cleans the stage and leaves live untouched when stdout is malformed', async () => {
    const { root, liveDir } = await fixture();
    await expect(stageAuthorizedTeamProjectPull({
      projectId: 'project-1',
      liveDir,
      scope: SCOPE,
      expectedVersion: 7,
      now: () => NOW,
      run: async (args) => {
        await writeFile(path.join(args[2]!, 'index.html'), 'untrusted');
        return '{bad json';
      },
    })).rejects.toThrow();

    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8')).toBe('old');
    expect((await readdir(root)).filter((name) => name.includes('.od-pull-stage-'))).toEqual([]);
  });

  it('cleans the owned stage and leaves live untouched when aborted', async () => {
    const { root, liveDir } = await fixture();
    const controller = new AbortController();
    let started!: () => void;
    const runStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const staged = stageAuthorizedTeamProjectPull({
      projectId: 'project-1',
      liveDir,
      scope: SCOPE,
      expectedVersion: 7,
      signal: controller.signal,
      now: () => NOW,
      run: async (args, _workspaceId, options) => {
        await writeFile(path.join(args[2]!, 'partial'), 'untrusted');
        started();
        await new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
        return JSON.stringify(receipt());
      },
    });
    await runStarted;

    controller.abort();

    await expect(staged).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8')).toBe('old');
    expect((await readdir(root)).filter((name) => name.includes('.od-pull-stage-'))).toEqual([]);
  });

  it('adopts the materialized inode when Vela replaces the initially-empty stage', async () => {
    const { root, liveDir } = await fixture();
    const staged = await stageAuthorizedTeamProjectPull({
      projectId: 'project-1',
      liveDir,
      scope: SCOPE,
      expectedVersion: 7,
      now: () => NOW,
      run: async (args) => {
        const stageDir = args[2]!;
        const replacement = `${stageDir}.vela-materialized`;
        await mkdir(replacement);
        await writeFile(path.join(replacement, 'index.html'), 'new');
        await rm(stageDir, { recursive: true });
        await rename(replacement, stageDir);
        return JSON.stringify(receipt());
      },
    });

    await staged.cleanup();

    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8')).toBe('old');
    expect((await readdir(root)).filter((name) => name.includes('.od-pull-stage-'))).toEqual([]);
  });

  it('restores and preserves a swapped caller directory raced into cleanup', async () => {
    const { root, liveDir } = await fixture();
    let raced = false;
    const staged = await stageAuthorizedTeamProjectPull({
      projectId: 'project-1',
      liveDir,
      scope: SCOPE,
      expectedVersion: 7,
      now: () => NOW,
      cleanupHooks: {
        beforeQuarantineRename: async (stageDir) => {
          if (raced) return;
          raced = true;
          const owned = `${stageDir}.owned`;
          await rename(stageDir, owned);
          await mkdir(stageDir);
          await writeFile(path.join(stageDir, 'caller.txt'), 'preserve me');
        },
      },
      run: async (args) => {
        await writeFile(path.join(args[2]!, 'index.html'), 'new');
        return JSON.stringify(receipt());
      },
    });

    await expect(staged.cleanup()).rejects.toThrow(/identity changed/u);

    expect(await readFile(path.join(staged.stageDir, 'caller.txt'), 'utf8')).toBe('preserve me');
    expect((await readdir(root)).some((name) => name.endsWith('.owned'))).toBe(true);
  });

  it.each([
    'unknown command "pull" for "vela team-projects"',
    'unknown command "team-projects" for "vela"',
    'unknown flag: --expected-version',
    'unknown flag: --live-dir',
  ])('classifies only a missing local CLI capability as fallback-safe: %s', (message) => {
    expect(isAuthorizedTeamProjectPullUnavailable(new Error(message))).toBe(true);
  });

  it.each([
    'API request failed with status 401: unauthenticated',
    'API request failed with status 403: team_project_pull_owner',
    'API request failed with status 404: team_project_pull_unavailable',
    'API request failed with status 409: team_project_pull_drift',
    'API request failed with status 500: internal_error',
    'fetch failed: ECONNRESET',
    'vela command timed out after 30000ms',
  ])('fails closed instead of falling back for transport/authority failure: %s', (message) => {
    expect(isAuthorizedTeamProjectPullUnavailable(new Error(message))).toBe(false);
  });
});
