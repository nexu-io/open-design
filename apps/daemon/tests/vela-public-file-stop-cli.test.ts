import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVelaPublicFileStop } from '../src/collab/vela-public-file-stop.js';

// Opt-in external executable: build the matching Vela revision first. Never
// borrow the user's installed CLI or credentials as an implicit fallback.
it.skipIf(!process.env.OD_TEST_VELA_BIN).each([200, 403])('runs production stop through real Go CLI, HTTP=%s', async (status) => {
  const binary = process.env.OD_TEST_VELA_BIN;
  if (!binary) throw new Error('explicit test CLI required');
  const root = await mkdtemp(path.join(tmpdir(), 'od-go-stop-'));
  const requests: Array<{ url: string | undefined; method: string | undefined; bearer: string | undefined; workspace: string | string[] | undefined; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ url: req.url, method: req.method, bearer: req.headers.authorization, workspace: req.headers['x-vela-workspace-id'], body: Buffer.concat(chunks).toString('utf8') });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/workspaces') {
      res.end(JSON.stringify({ items: [{ workspaceId: 'workspace', workspaceName: 'W', workspaceType: 'personal', workspaceMemberId: 'owner', role: 'member', memberStatus: 'active', lifecycleState: 'active' }] }));
    } else {
      res.statusCode = status;
      res.end(JSON.stringify(status === 200 ? { status: 'stopped' } : { error: 'forbidden', message: 'synthetic private diagnostic' }));
    }
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-original-key', user: null, configMtimeMs: null };
    const prepare = createVelaPublicFileStop({ dataRoot: root, readSession: () => session, configuredEnv: { VELA_BIN: binary } });
    const operation = await prepare({ resourceTeamId: 'workspace', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html', slug: 'a/b' });
    expect(operation).not.toBeNull(); expect(requests).toHaveLength(1);
    session.controlKey = 'switched-key'; session.apiUrl = 'https://wrong.invalid';
    if (status === 200) await expect(operation!.stop()).resolves.toBeUndefined();
    else await expect(operation!.stop()).rejects.toThrow(/^PUBLIC_FILE_STOP_FAILED$/);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ url: '/api/v1/workspaces', method: 'GET', bearer: 'Bearer synthetic-original-key' });
    expect(requests[1]).toMatchObject({ url: '/api/v1/collab/shares/a%2Fb/stop', method: 'POST', bearer: 'Bearer synthetic-original-key', workspace: 'workspace' });
    expect(JSON.parse(requests[1]!.body)).toEqual({ projectId: 'project' });
    expect(await readdir(root)).toEqual([]);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
