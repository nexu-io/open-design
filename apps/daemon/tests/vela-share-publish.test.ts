import { expect, it, vi } from 'vitest';
import { publishVelaShareVersion } from '../src/collab/vela-share-publish.js';
import { velaWorkspaceCommandOptions, type runVelaCommand } from '../src/integrations/vela-command.js';
const input = { filePath: 'pages/local.html', workspaceId: 'workspace', projectId: 'project', resourceId: 'resource', slug: 'stable', sourceKey: 'index.html', entryPath: 'index.html', name: 'Design', versionId: 'immutable-upload' };
const confirmed = { filePath: input.filePath, slug: 'stable', version: 2, publishedAt: 1234, entryPath: 'index.html', versionId: input.versionId };
const receipt = { status: 'published', receipt: confirmed, slug: 'stable', version: 2, publishedAt: 1234, entryPath: 'index.html', snapshot: { slug: 'snapshot-not-alias', versionId: 'immutable-upload' } };
it('publishes a pinned version and registers its binding through the Go share command', async () => {
  const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(receipt));
  expect(await publishVelaShareVersion(input, run)).toEqual({ status: 'published', receipt: confirmed });
  expect(run).toHaveBeenCalledExactlyOnceWith(['share', 'publish', 'resource', '--project-id', 'project', '--source-file-path', 'pages/local.html', '--slug', 'stable', '--source-key', 'index.html', '--entry-path', 'index.html', '--name', 'Design', '--version-id', 'immutable-upload', '--json'], { ...velaWorkspaceCommandOptions('workspace'), timeoutMs: 30_000 });
});
it.each(['{', 'null', '[]', JSON.stringify({ ...receipt, slug: 'wrong' }), JSON.stringify({ ...receipt, snapshot: { versionId: 'wrong' } }), JSON.stringify({ ...receipt, entryPath: 'wrong' }), JSON.stringify({ ...receipt, version: 0 }), JSON.stringify({ ...receipt, publishedAt: -1 })])('rejects malformed or mismatched receipts without fallback: %s', async (wire) => {
  const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(wire);
  await expect(publishVelaShareVersion(input, run)).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
  expect(run).toHaveBeenCalledTimes(1);
});
it.each(['filePath', 'workspaceId', 'projectId', 'resourceId', 'slug', 'sourceKey', 'entryPath', 'name', 'versionId'] as const)('rejects blank %s before invoking the CLI', async (field) => {
  const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(receipt));
  await expect(publishVelaShareVersion({ ...input, [field]: '  ' }, run)).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
  expect(run).not.toHaveBeenCalled();
});
it('pins receipt validation and return values to the invocation snapshot', async () => {
  const request = { ...input };
  const run = vi.fn<typeof runVelaCommand>().mockImplementation(async () => {
    for (const field of Object.keys(request) as Array<keyof typeof request>) request[field] = 'changed';
    return JSON.stringify(receipt);
  });
  expect(await publishVelaShareVersion(request, run)).toEqual({ status: 'published', receipt: confirmed });
  expect(run).toHaveBeenCalledTimes(1);
});

it('rejects a legacy binary partial-success receipt instead of claiming atomic publication', async () => {
  const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify({ ...receipt, status: 'binding_pending', binding: { code: 'FORBIDDEN', retrying: true, message: 'private' } }));
  await expect(publishVelaShareVersion(input, run)).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
  expect(run).toHaveBeenCalledTimes(1);
});
it.each([{ ...receipt, status: undefined }, { ...receipt, status: 'other' }, { ...receipt, receipt: { ...confirmed, versionId: 'wrong' } }])('rejects unconfirmed result shape', async wire => {
  await expect(publishVelaShareVersion(input, vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(wire)))).rejects.toThrow('PUBLIC_SHARE_PUBLISH_FAILED');
});

it('does not expose child stderr or retry after CLI failure', async () => {
  const run = vi.fn<typeof runVelaCommand>().mockRejectedValue(new Error('sensitive upstream details'));
  await expect(publishVelaShareVersion(input, run)).rejects.toThrow(/^PUBLIC_SHARE_PUBLISH_FAILED$/);
  expect(run).toHaveBeenCalledTimes(1);
});
