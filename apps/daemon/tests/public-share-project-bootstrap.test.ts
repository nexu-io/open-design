import { expect, it, vi } from 'vitest';
import { ensurePublicShareProject } from '../src/collab/public-share-project-bootstrap.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';
import { projectResourceIdFor } from '../src/integrations/vela-team-projects.js';
const principal: ResourceHubPrincipal = { teamId: 'workspace', memberId: 'author', role: 'owner', lifecycleState: 'active', workspaceType: 'personal' };
it('registers independent root before positive catalog verification, without a file publish', async () => {
  const run = vi.fn(async (args: string[]) => JSON.stringify(args[0] === 'resource'
    ? { id: 'root-version', version: 1 }
    : { projectId: 'p', ownerMemberId: 'author', createdAt: new Date(1).toISOString(), publishedVersionId: 'root-version' }));
  const result = await ensurePublicShareProject({ projectId: 'p', principal, run, resolveProjectDir: () => '/local-project', describeProject: () => ({ name: 'Local project', metadata: {} }) });
  expect(result).toMatchObject({ projectId: 'p', ownerMemberId: 'author' });
  expect(run.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([['resource', 'push'], ['team-projects', 'upsert'], ['team-projects', 'get']]);
  const rootId = projectResourceIdFor('p', principal);
  expect(run.mock.calls[0]![0].slice(0, 5)).toEqual(['resource', 'push', 'project', rootId, '/local-project']);
  expect(run.mock.calls[1]![0]).toEqual(expect.arrayContaining(['--resource-id', rootId, '--last-synced-version-id', 'root-version']));
});
it.each([null, { metadata: { sharedProjectPlaceholderAt: 1 } }])('rejects absent/placeholder content before any cloud mutation: %j', async metadata => {
  const run = vi.fn(async () => '{}');
  await expect(ensurePublicShareProject({ projectId: 'p', principal, run, resolveProjectDir: () => '/local-project', describeProject: () => metadata })).rejects.toThrow('PUBLIC_SHARE_PROJECT_CONTENT_UNAVAILABLE');
  expect(run).not.toHaveBeenCalled();
});
it('does not register a catalog when the root upload fails', async () => {
  const run = vi.fn(async () => { throw new Error('upload unavailable'); });
  await expect(ensurePublicShareProject({ projectId: 'p', principal, run, resolveProjectDir: () => '/local-project', describeProject: () => ({ metadata: {} }) })).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});
it('requires a readable positive catalog after upload/upsert', async () => {
  const run = vi.fn(async (args: string[]) => JSON.stringify(args[0] === 'resource' ? { id: 'root-version', version: 1 } : {}));
  await expect(ensurePublicShareProject({ projectId: 'p', principal, run, resolveProjectDir: () => '/local-project', describeProject: () => ({ metadata: {} }) })).rejects.toThrow('PUBLIC_SHARE_PROJECT_CATALOG_UNAVAILABLE');
});
