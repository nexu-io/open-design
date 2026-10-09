import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import type { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
import { createVelaPublicFileStop } from '../src/collab/vela-public-file-stop.js';
import type { VelaControlApiContext } from '../src/integrations/vela.js';
import type { fetchVelaWorkspaceDirectory } from '../src/collab/vela-workspace-context.js';
it.each([true, false])('uses real HTTP for directory verification and pinned CLI for stop, original member matches=%s', async (matches) => {
  const requests: Array<{ url: string | undefined; method: string | undefined; authorization: string | undefined; workspace: string | string[] | undefined; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ url: req.url, method: req.method, authorization: req.headers.authorization, workspace: req.headers['x-vela-workspace-id'], body: Buffer.concat(chunks).toString('utf8') });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/workspaces') res.end(JSON.stringify({ items: [{ ...member, workspaceMemberId: matches ? member.workspaceMemberId : 'other' }] }));
    else res.end(JSON.stringify({ status: 'stopped' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing HTTP listener');
    const captured = { ...session(), apiUrl: `http://127.0.0.1:${address.port}` };
    const runCommand = vi.fn<typeof runPinnedVelaCommand>().mockResolvedValue(JSON.stringify(deletedReceipt));
    const prepare = createVelaPublicFileStop({ readSession: () => captured, dataRoot: tmpdir(), runCommand });
    const operation = await prepare(key);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: '/api/v1/workspaces', method: 'GET', authorization: 'Bearer fixture-key' });
    captured.controlKey = 'switched-account';
    if (matches) {
      expect(operation).not.toBeNull(); await operation!.stop();
      expect(requests).toHaveLength(1);
      expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ session: expect.objectContaining({ controlKey: 'fixture-key' }), workspaceId: 'workspace', args: ['resource', 'remove', resourceId, '--json'] }));
    } else {
      expect(operation).toBeNull(); expect(requests).toHaveLength(1); expect(runCommand).not.toHaveBeenCalled();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

const key = { resourceTeamId: 'workspace', ownerMemberId: 'member', projectId: 'project', filePath: 'index.html', slug: 'a/b' };
const resourceId = 'project-file-' + Buffer.from(JSON.stringify(['workspace', 'member', 'project', 'index.html'])).toString('base64url');
const deletedReceipt = { ok: true, resource: { id: resourceId, teamId: 'workspace', ownerMemberId: 'member', deletedAt: '2026-09-23T00:00:00Z' } };
const member: WorkspaceDirectoryItem = { workspaceId: 'workspace', workspaceName: 'W', workspaceType: 'personal', workspaceMemberId: 'member', role: 'member', memberStatus: 'active', lifecycleState: 'active' };
const session = (): VelaControlApiContext => ({ profile: 'test', apiUrl: 'https://api.example.test', controlKey: 'fixture-key', user: null, configMtimeMs: null });
function fixture(items = [member]) {
  const captured = session();
  const readSession = vi.fn(() => captured);
  const fetchDirectory = vi.fn<typeof fetchVelaWorkspaceDirectory>(async () => ({ ok: true, items }));
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: 'stopped' })));
  const runCommand = vi.fn<typeof runPinnedVelaCommand>().mockResolvedValue(JSON.stringify(deletedReceipt));
  return { captured, readSession, fetchDirectory, fetchImpl, runCommand, prepare: createVelaPublicFileStop({ readSession, fetchDirectory, fetch: fetchImpl, runCommand, dataRoot: tmpdir() }) };
}
it('prepares without stopping and uses the exact captured credentials after account mutation', async () => {
  const f = fixture();
  const operation = await f.prepare(key);
  expect(operation).not.toBeNull();
  expect(f.fetchImpl).not.toHaveBeenCalled();
  expect(f.runCommand).not.toHaveBeenCalled();
  const directoryOptions = f.fetchDirectory.mock.calls[0]![0]!;
  f.captured.controlKey = 'different-account'; f.captured.apiUrl = 'https://wrong.example.test';
  expect(directoryOptions.readSession?.()?.controlKey).toBe('fixture-key');
  await operation!.stop();
  expect(f.readSession).toHaveBeenCalledTimes(1);
  expect(f.fetchImpl).not.toHaveBeenCalled();
  expect(f.runCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dataRoot: tmpdir(), session: expect.objectContaining({ controlKey: 'fixture-key', apiUrl: 'https://api.example.test' }), workspaceId: 'workspace', args: ['resource', 'remove', resourceId, '--json'] }));
});
it.each([
  { ...member, workspaceMemberId: 'different' },
  { ...member, workspaceId: 'different' },
  { ...member, memberStatus: 'removed' as const },
  { ...member, lifecycleState: 'deleted' as const },
])('refuses an ineligible original principal: %j', async (item) => {
  const f = fixture([item]); expect(await f.prepare(key)).toBeNull(); expect(f.fetchImpl).not.toHaveBeenCalled();
});
it('defers without a session or a verified directory', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  expect(await createVelaPublicFileStop({ dataRoot: tmpdir(), readSession: () => null, fetch: fetchImpl })(key)).toBeNull();
  const f = fixture(); f.fetchDirectory.mockResolvedValue({ ok: false, items: [], reason: 'network' });
  expect(await f.prepare(key)).toBeNull(); expect(fetchImpl).not.toHaveBeenCalled();
});
it('defers without a composition-root data directory before reading credentials', async () => {
  const readSession = vi.fn(session);
  expect(await createVelaPublicFileStop({ readSession })(key)).toBeNull();
  expect(readSession).not.toHaveBeenCalled();
});
it('sanitizes rejected CLI stops without retry or direct HTTP fallback', async () => {
  const f = fixture(); f.runCommand.mockRejectedValue(new Error('403 upstream secret detail'));
  const operation = await f.prepare(key);
  await expect(operation!.stop()).rejects.toThrow(/^PUBLIC_FILE_STOP_FAILED$/);
  expect(f.runCommand).toHaveBeenCalledTimes(1); expect(f.fetchImpl).not.toHaveBeenCalled();
});

it.each([
  '{}', '{', JSON.stringify({ status: 'stopped', slug: key.slug, projectId: key.projectId }),
  ...[
    { ...deletedReceipt, ok: false },
    { ...deletedReceipt, resource: { ...deletedReceipt.resource, id: 'other-resource' } },
    { ...deletedReceipt, resource: { ...deletedReceipt.resource, teamId: 'other-workspace' } },
    { ...deletedReceipt, resource: { ...deletedReceipt.resource, ownerMemberId: 'other-owner' } },
    { ...deletedReceipt, resource: { ...deletedReceipt.resource, deletedAt: null } },
    { ...deletedReceipt, resource: { ...deletedReceipt.resource, deletedAt: '' } },
  ].map(value => JSON.stringify(value)),
])('rejects unconfirmed or mismatched source deletion receipts', async (response) => {
  const f = fixture(); f.runCommand.mockResolvedValue(response);
  const operation = await f.prepare(key); expect(operation).not.toBeNull();
  await expect(operation!.stop()).rejects.toThrow('PUBLIC_FILE_STOP_FAILED');
});
