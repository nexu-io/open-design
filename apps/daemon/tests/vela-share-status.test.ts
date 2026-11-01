import { expect, it, vi } from 'vitest';
import { SHARE_STATUSES } from '@open-design/contracts';
import { velaWorkspaceCommandOptions } from '../src/integrations/vela-command.js';
import { readVelaShareStatus } from '../src/collab/vela-share-status.js';
const input = { workspaceId: 'workspace', projectId: 'business-project', slug: 'stable-alias' };
it.each(SHARE_STATUSES)('retains %s and witnesses an existing binding', async status => {
  const run = vi.fn(async () => JSON.stringify({ projectId: input.projectId, slug: input.slug, status }));
  expect(await readVelaShareStatus(input, run)).toEqual({ known: true, projectId: input.projectId,
    slug: input.slug, status, bindingExists: true, shareStopped: status === 'stopped' });
  expect(run).toHaveBeenCalledExactlyOnceWith(['share', 'status', input.slug, '--project-id', input.projectId, '--json'],
    { ...velaWorkspaceCommandOptions(input.workspaceId), timeoutMs: 30_000 });
});
it.each(['', 'not-json', 'null', '[]', '{}',
  JSON.stringify({ projectId: 'other', slug: input.slug, status: 'active' }),
  JSON.stringify({ projectId: input.projectId, slug: 'other', status: 'stopped' }),
  JSON.stringify({ projectId: input.projectId, slug: input.slug, status: 'unknown' }),
  JSON.stringify({ error: 'not found', errorCode: 'share_not_found', status: 404 }),
])('keeps invalid projection %s unknown', async stdout => {
  expect(await readVelaShareStatus(input, async () => stdout)).toEqual({ known: false });
});
it.each([401, 404, 503, 'network'])('keeps failure %s unknown', async status => {
  expect(await readVelaShareStatus(input, async () => { throw new Error(`sensitive transport detail: ${status}`); }))
    .toEqual({ known: false });
});
it.each(['workspaceId', 'projectId', 'slug'] as const)('rejects empty %s before calling CLI', async field => {
  const run = vi.fn(async () => '{}');
  expect(await readVelaShareStatus({ ...input, [field]: ' ' }, run)).toEqual({ known: false });
  expect(run).not.toHaveBeenCalled();
});
