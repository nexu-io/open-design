import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bindVelaShareVersion, resumeVelaShareVersion } from '../src/collab/vela-share-binding.js';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';
import { type runVelaCommand, velaWorkspaceCommandOptions } from '../src/integrations/vela-command.js';
const input = { sourceFilePath: 'pages/local.html', workspaceId: 'w', projectId: 'p', resourceId: 'r', slug: 'stable', version: 2, versionId: 'immutable' };
const receipt = { status: 'active', projectId: 'p', slug: 'stable', verifiedVersion: 2, verifiedVersionId: 'immutable' };
it('binds only the frozen original publication and bounded workspace', async () => {
  const mutable = { ...input };
  const run = vi.fn<typeof runVelaCommand>().mockImplementation(async () => { mutable.slug = 'changed'; return JSON.stringify(receipt); });
  await bindVelaShareVersion(mutable, run);
  expect(run).toHaveBeenCalledExactlyOnceWith(['share','bind','stable','--project-id','p','--source-file-path','pages/local.html','--resource-id','r','--version','2','--version-id','immutable','--json'], { ...velaWorkspaceCommandOptions('w'), timeoutMs: 30_000 });
});
it.each(['sourceFilePath', 'workspaceId', 'projectId', 'resourceId', 'slug', 'versionId'] as const)('rejects blank %s before spawning', async key => {
  const run = vi.fn<typeof runVelaCommand>();
  await expect(bindVelaShareVersion({ ...input, [key]: '' }, run)).rejects.toThrow(/^PUBLIC_SHARE_BINDING_FAILED$/);
  expect(run).not.toHaveBeenCalled();
});
it.each([{}, { ...receipt, status: 'stopped' }, { ...receipt, verifiedVersion: 1 }, { ...receipt, verifiedVersionId: 'other' }, { ...receipt, projectId: 'other' }, { ...receipt, slug: 'other' }])('rejects unverified responses without fallback', async value => {
  const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify(value));
  await expect(bindVelaShareVersion(input, run)).rejects.toThrow(/^PUBLIC_SHARE_BINDING_FAILED$/); expect(run).toHaveBeenCalledTimes(1);
  run.mockClear();
  await expect(resumeVelaShareVersion(input, run)).rejects.toThrow(/^PUBLIC_SHARE_BINDING_FAILED$/); expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0]![0].slice(0, 2)).toEqual(['share', 'resume']);
});
for (const operation of ['bind', 'resume'] as const) {
it.skipIf(!process.env.OD_TEST_VELA_BIN).each(['success', 'missing-proof', 'conflict', 'old-server', 'stopped'] as const)(`real Go ${operation} %s uses exactly one dedicated endpoint`, async mode => {
  const binary = process.env.OD_TEST_VELA_BIN!; const root = await mkdtemp(path.join(tmpdir(), 'od-bind-cli-'));
  const calls: unknown[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    calls.push({ url: req.url, method: req.method, workspace: req.headers['x-vela-workspace-id'], body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.setHeader('content-type', 'application/json');
    res.statusCode = mode === 'conflict' ? 409 : mode === 'old-server' ? 404 : 200;
    res.end(JSON.stringify(mode === 'missing-proof' ? { status: 'active', projectId: 'p', slug: 'stable' } : { ...receipt, ...(mode === 'stopped' ? { status: 'stopped' } : {}) }));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic', user: null, configMtimeMs: null };
    const complete = operation === 'resume' ? resumeVelaShareVersion : bindVelaShareVersion;
    const result = complete(input, args => runPinnedVelaCommand({ args, session, dataRoot: root, workspaceId: 'w', configuredEnv: { VELA_BIN: binary } }));
    if (mode === 'success') await expect(result).resolves.toBeUndefined(); else await expect(result).rejects.toThrow(/^PUBLIC_SHARE_BINDING_FAILED$/);
    expect(calls).toEqual([{ url: operation === 'resume' ? '/api/v1/collab/shares/stable/resume' : '/api/v1/collab/shares/complete', method: 'POST', workspace: 'w', body: { projectId: 'p', slug: 'stable', sourceFilePath: 'pages/local.html', expectedResourceId: 'r', expectedVersion: 2, expectedVersionId: 'immutable' } }]);
    expect(await readdir(root)).toEqual([]);
  } finally {
    server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
}
