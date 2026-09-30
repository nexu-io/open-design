import { expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject } from '../src/db.js';
import { createCommentSyncStateService } from '../src/collab/comment-sync-state.js';
import { registerCommentSyncStateRoutes } from '../src/routes/project/comments.js';
import { createVelaProjectShareState } from '../src/collab/vela-project-share-state.js';

const slug = '93a3c7e6-198d-4b72-9f70-0bbfdf9f9c55';
const scope = { projectId: 'p', workspaceId: 'w', workspaceMemberId: 'owner', filePath: 'pages/a.html' };
const remote = (status: 'active' | 'stopped') => ({ projectId: 'p', bindingExists: true, hasEverShared: true,
  publications: [{ sourceFilePath: scope.filePath, slug, status }] });

it('reads K3 from authenticated per-file cloud history after stop, never from missing local rows', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-k3-state-'));
  const db = openDatabase(root);
  const app = express();
  const server = createServer(app);
  let answer = remote('active');
  let cloudUnavailable = false;
  let session: boolean | null = true;
  let credential = { apiUrl: 'https://example.test', controlKey: 'account-a' };
  let rotateDuringAvailability = false;
  let rotateDuringRemoteRead = false;
  const reader = vi.fn(async (input: { projectId: string; resourceTeamId: string; ownerMemberId: string }) => {
    expect(input).toEqual({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'owner' });
    if (cloudUnavailable) throw new Error('secret-token-must-not-leak');
    if (rotateDuringRemoteRead) credential = { ...credential, controlKey: 'account-b' };
    return answer;
  });
  try {
    insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
    const service = createCommentSyncStateService(db, async () => {
      if (rotateDuringAvailability) credential = { ...credential, controlKey: 'account-b' };
      return session;
    }, { readProjectShareState: reader, readCredential: () => credential });
    registerCommentSyncStateRoutes(app, { db, service, authorize: async req => req.get('x-test-deny')
      ? { ok: false, status: 403, code: 'DENIED', message: 'denied' }
      : { ok: true, context: { workspaceId: 'w', workspaceMemberId: 'owner' } as WorkspaceCollabContext } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener unavailable');
    const base = `http://127.0.0.1:${address.port}/api/projects/p/comment-sync-state`;
    const get = async (filePath = scope.filePath) => {
      const response = await fetch(`${base}?filePath=${encodeURIComponent(filePath)}`);
      expect(response.status).toBe(200);
      return response.json() as Promise<{ shareStopped: boolean | null }>;
    };
    expect((await get()).shareStopped).toBe(false);
    answer = remote('stopped');
    expect((await get()).shareStopped).toBe(true);
    expect((await get('pages/other.html')).shareStopped).toBeNull();
    expect(((await (await fetch(base)).json()) as { shareStopped: boolean | null }).shareStopped).toBeNull();
    expect((await fetch(`${base}?filePath=${encodeURIComponent(scope.filePath)}`, { headers: { 'x-test-deny': '1' } })).status).toBe(403);
    expect(reader).toHaveBeenCalledTimes(3);
    cloudUnavailable = true;
    expect((await get()).shareStopped).toBeNull();
    cloudUnavailable = false;
    session = false;
    expect((await get()).shareStopped).toBeNull();
    session = null;
    expect(await (await fetch(`${base}?filePath=${encodeURIComponent(scope.filePath)}`)).json()).toBeNull();
    expect(reader).toHaveBeenCalledTimes(4);
    answer = remote('active'); session = true;
    expect((await get()).shareStopped).toBe(false);
    rotateDuringRemoteRead = true;
    expect((await get()).shareStopped).toBeNull();
    rotateDuringRemoteRead = false;
    credential = { ...credential, controlKey: 'account-a' };
    rotateDuringAvailability = true;
    expect((await get()).shareStopped).toBeNull();
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    closeDatabase(); rmSync(root, { recursive: true, force: true });
  }
});

it('cloud history for comment sync is read-only even for a personal project with proven local ownership', async () => {
  const session = { profile: 'test' as const, apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null };
  const runCommand = vi.fn(async () => JSON.stringify({ projectId: 'p', bindingExists: false, publications: [] }));
  const read = createVelaProjectShareState({ dataRoot: tmpdir(), configuredEnv: {}, readSession: () => session,
    resolveLocalProjectOwner: () => 'owner', registerPersonalProject: false,
    fetchDirectory: async () => ({ ok: true, items: [{ workspaceId: 'w', workspaceName: 'W', workspaceType: 'personal', workspaceMemberId: 'owner', role: 'owner', memberStatus: 'active', lifecycleState: 'active' }] }),
    runCommand });
  expect((await read({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'owner' })).bindingExists).toBe(false);
  expect(runCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ args: ['share', 'project-status', 'p', '--json'] }));
});
