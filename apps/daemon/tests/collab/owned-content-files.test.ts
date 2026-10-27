import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyOwnedProjectContent, ownedContentFingerprint } from '../../src/collab/owned-content-files.js';
import type { OwnedContentScope } from '../../src/collab/owned-content-store.js';
import { createVelaCliTeamProjectCatalog } from '../../src/collab/vela-cli-team-projects.js';

const scope: OwnedContentScope = { projectId: 'owner-files', workspaceId: 'w1', resourceTeamId: 'w1', viewerMemberId: 'owner', ownerMemberId: 'owner' };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-owner-files-'));
  const live = path.join(root, scope.projectId);
  await mkdir(live);
  await writeFile(path.join(live, 'index.html'), '<h1>local</h1>');
  const authorize = vi.fn(async () => {});
  const commit = vi.fn(async () => {});
  const options = {
    projectsRoot: root, scope, expectedVersion: 2, authorize, isBusy: () => false, commit,
    run: async (args: string[]) => {
      await writeFile(path.join(args[3]!, 'index.html'), '<h1>remote</h1>');
      return JSON.stringify({ version: 2 });
    },
  };
  return { root, live, options, authorize, commit, close: () => rm(root, { recursive: true, force: true }) };
}

describe('owner content materialization', () => {
  it.each(['arbitrary-server-root', 'project-owner-files'])('second creator installation applies authoritative catalog root %s only', async resourceId => {
    const f = await fixture();
    const catalog = createVelaCliTeamProjectCatalog({ supportsTeamProjects: () => true,
      run: async () => JSON.stringify({ projectId: scope.projectId, workspaceId: scope.workspaceId,
        ownerMemberId: scope.ownerMemberId, visibility: 'team', resourceId,
        createdAt: '2026-01-01T00:00:00Z' }),
    });
    const registration = await catalog.getRegistration(scope.projectId, { teamId: scope.workspaceId,
      memberId: scope.ownerMemberId, role: 'member', lifecycleState: 'active' });
    expect(registration?.resourceId).toBe(resourceId);
    const exactScope = { ...scope, resourceId: registration!.resourceId! };
    const run = vi.fn(async (args: string[]) => {
      // No aliases exist on this install: only the catalog's retained identity.
      if (args[2] !== resourceId) throw new Error('resource_not_found');
      return f.options.run(args);
    });
    try {
      const result = await applyOwnedProjectContent({ ...f.options, scope: exactScope, run });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]?.[0][2]).toBe(resourceId);
      expect(result.version).toBe(2);
      expect(await readFile(path.join(f.live, 'index.html'), 'utf8')).toBe('<h1>remote</h1>');
      expect(f.commit).toHaveBeenCalledWith(2);
    } finally { await f.close(); }
  });
  it('keeps local private entries, strips remote private entries, and records both HTML versions', async () => {
    const f = await fixture();
    try {
      await mkdir(path.join(f.live, 'nested', '.git'), { recursive: true });
      await writeFile(path.join(f.live, 'nested', '.git', 'config'), 'local identity');
      const result = await applyOwnedProjectContent({ ...f.options, run: async args => {
        await f.options.run(args);
        await mkdir(path.join(args[3]!, '.git'));
        await writeFile(path.join(args[3]!, '.git', 'config'), 'remote identity');
        return JSON.stringify({ version: 2 });
      } });
      expect(await readFile(path.join(f.live, 'index.html'), 'utf8')).toBe('<h1>remote</h1>');
      expect(await readFile(path.join(f.live, 'nested', '.git', 'config'), 'utf8')).toBe('local identity');
      await expect(readFile(path.join(f.live, '.git', 'config'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(result.fingerprint).toBe(await ownedContentFingerprint(f.live));
      expect(f.authorize).toHaveBeenCalledTimes(2);
      expect(f.commit).toHaveBeenCalledWith(2);
    } finally { await f.close(); }
  });

  it('does not try any generated alias when an exact bound root is missing', async () => {
    const f = await fixture();
    const run = vi.fn(async () => { throw new Error('resource_not_found'); });
    try {
      await expect(applyOwnedProjectContent({ ...f.options,
        scope: { ...scope, resourceId: 'server-root' }, run,
      })).rejects.toThrow('resource_not_found');
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(expect.arrayContaining(['server-root']), scope.workspaceId);
      expect(f.commit).not.toHaveBeenCalled();
      expect(await readFile(path.join(f.live, 'index.html'), 'utf8')).toBe('<h1>local</h1>');
    } finally { await f.close(); }
  });
  it('falls back to the legacy unscoped resource id when the scoped resource is missing', async () => {
    const f = await fixture();
    const resourceIds: string[] = [];
    try {
      const result = await applyOwnedProjectContent({ ...f.options, run: async args => {
        resourceIds.push(args[2]!);
        if (resourceIds.length === 1) throw new Error('resource_not_found');
        return f.options.run(args);
      } });
      expect(resourceIds).toHaveLength(2);
      expect(resourceIds[0]).not.toBe(`project-${scope.projectId}`);
      expect(resourceIds[1]).toBe(`project-${scope.projectId}`);
      expect(result.version).toBe(2);
      expect(await readFile(path.join(f.live, 'index.html'), 'utf8')).toBe('<h1>remote</h1>');
    } finally { await f.close(); }
  });

  it.each(['stale', 'revoked', 'busy', 'commit', 'history', 'symlink', 'private-conflict'])('fails %s without replacing local content', async failure => {
    const f = await fixture();
    try {
      if (failure === 'revoked') f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoked'));
      if (failure === 'commit') f.commit.mockRejectedValueOnce(new Error('registration failed'));
      if (failure === 'history') await symlink(f.root, path.join(f.live, '.file-versions'));
      if (failure === 'private-conflict') {
        await mkdir(path.join(f.live, 'nested', '.git'), { recursive: true });
        await writeFile(path.join(f.live, 'nested', '.git', 'config'), 'preserve me');
      }
      await expect(applyOwnedProjectContent({ ...f.options,
        isBusy: () => failure === 'busy',
        run: async args => {
          await f.options.run(args);
          if (failure === 'symlink') await symlink(f.root, path.join(args[3]!, 'public-link'));
          if (failure === 'private-conflict') await writeFile(path.join(args[3]!, 'nested'), 'remote file');
          return JSON.stringify({ version: failure === 'stale' ? 3 : 2 });
        },
      })).rejects.toThrow();
      expect(await readFile(path.join(f.live, 'index.html'), 'utf8')).toBe('<h1>local</h1>');
      if (failure !== 'commit') expect(f.commit).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
});
