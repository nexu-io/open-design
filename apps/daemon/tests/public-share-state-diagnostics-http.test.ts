import express from 'express';
import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { createInMemoryPublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';

it.each([
  { reader: false, local: false },
  { reader: true, local: false },
  { reader: true, local: true },
])('logs failed lifecycle reads, including successful stale fallback: %j', async scenario => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const store = createInMemoryPublicFilePublicationStore();
  if (scenario.local) store.set({ resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'index.html' },
    { slug: 'private-alias', fileName: 'index.html', url: 'https://private.invalid/signed' });
  const app = express();
  registerCollabSyncRoutes(app, { collab: runtime, publicFilePublicationStore: store,
    verifyWorkspaceRequest: async () => context,
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    ...(scenario.reader ? { readProjectShareState: async () => { throw new Error('secret-token https://private.invalid/signed'); } } : {}),
  });
  const server = createServer(app);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`,
      { headers: { 'x-od-request-id': 'state-read-test' } });
    expect(response.status).toBe(scenario.local ? 200 : 503);
    expect(await response.json()).toMatchObject(scenario.local
      ? { status: 'active', stale: true } : { error: 'SHARE_STATE_UNAVAILABLE' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe('[od] public share diagnostic');
    expect(JSON.parse(String(warn.mock.calls[0]?.[1]))).toMatchObject({
      operation: 'state_read', stage: 'remote_state', requestId: 'state-read-test',
      status: response.status, errorCode: 'SHARE_STATE_UNAVAILABLE',
      ...(scenario.reader ? { staleFallback: scenario.local } : {}),
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|private.invalid|private-alias|index.html|owner/);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); warn.mockRestore();
  }
});
