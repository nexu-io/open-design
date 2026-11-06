import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVelaCliTeamProjectCatalog, registerVelaTeamProjectResource } from '../src/collab/vela-cli-team-projects.js';
import { parseProjectShareState } from '../src/collab/vela-project-share-state.js';
import { runPinnedVelaCommand } from '../src/collab/vela-pinned-command.js';

// Explicit release binary, loopback API and synthetic credentials only. This
// checks the actual CLI serializer, not a shell shim or a developer's login.
it.skipIf(!process.env.OD_TEST_VELA_BIN)('preserves private policy, explicit visibility, resource ACK and immutable share identity through the real CLI', async () => {
  const binary = process.env.OD_TEST_VELA_BIN!;
  const root = await mkdtemp(path.join(tmpdir(), 'od-policy-cli-'));
  const principal = { teamId: 'workspace', memberId: 'owner', role: 'owner' as const, lifecycleState: 'active' as const };
  const registration = { projectId: 'project', workspaceId: principal.teamId, ownerMemberId: principal.memberId,
    resourceId: 'retained-root', visibility: 'private', createdAt: '2026-10-15T00:00:00Z' };
  const sourceFileId = '11111111-1111-4111-8111-111111111111';
  const slug = '22222222-2222-4222-8222-222222222222';
  const history = { projectId: 'project', bindingExists: true, publications: [{ sourceFileId,
    sourceFilePath: 'pages/a.html', slug, status: 'active', url: `https://test-share.open-design.app/artifact/project/${slug}` }] };
  const requests: Array<{ method: string; url: string; workspace: string | string[] | undefined; bearer: string | undefined; body: unknown }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const body: unknown = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method ?? '', url: req.url ?? '', workspace: req.headers['x-vela-workspace-id'], bearer: req.headers.authorization, body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/team-projects/project/ensure-private') res.end(JSON.stringify(registration));
    else if (req.url === '/api/v1/team-projects/project/visibility') res.end(JSON.stringify({ ...registration, visibility: 'team' }));
    else if (req.url === '/api/v1/team-projects/project/resources') res.end('{"ok":true}');
    else if (req.url === '/api/v1/collab/projects/project/share-status') res.end(JSON.stringify(history));
    else { res.statusCode = 404; res.end('{}'); }
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing loopback listener');
    const session = { profile: 'test' as const, apiUrl: `http://127.0.0.1:${address.port}`, controlKey: 'synthetic-policy-key', user: null, configMtimeMs: null };
    const run = (args: string[]) => runPinnedVelaCommand({ args, session, dataRoot: root,
      workspaceId: principal.teamId, configuredEnv: { VELA_BIN: binary } });
    const catalog = createVelaCliTeamProjectCatalog({ run: args => run(['team-projects', ...args]) });
    await expect(catalog.ensurePrivate('project', principal)).resolves.toMatchObject(registration);
    await expect(registerVelaTeamProjectResource('project', 'selected-file-resource', run)).resolves.toBeUndefined();
    await expect(catalog.setVisibility('project', 'team', principal)).resolves.toBeUndefined();
    const decoded = parseProjectShareState(await run(['share', 'project-status', 'project', '--json']), 'project');
    expect(decoded.publications).toEqual([expect.objectContaining({ sourceFileId, sourceFilePath: 'pages/a.html', slug, status: 'active' })]);
    expect(requests.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      { method: 'POST', url: '/api/v1/team-projects/project/ensure-private', body: null },
      { method: 'POST', url: '/api/v1/team-projects/project/resources', body: { resourceId: 'selected-file-resource' } },
      { method: 'PATCH', url: '/api/v1/team-projects/project/visibility', body: { visibility: 'team' } },
      { method: 'GET', url: '/api/v1/collab/projects/project/share-status', body: null },
    ]);
    expect(requests.every(request => request.workspace === principal.teamId && request.bearer === 'Bearer synthetic-policy-key')).toBe(true);
    expect(await readdir(root)).toEqual([]);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
