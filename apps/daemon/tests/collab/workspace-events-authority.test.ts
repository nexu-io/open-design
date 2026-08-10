import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  emitWorkspaceEventToScope,
  registerCollabContextRoutes,
  type WorkspaceEventSinksByWorkspace,
} from '../../src/routes/collab-context.js';
import { createDevWorkspaceContextProvider } from '../../src/collab/workspace-context.js';

function directory() {
  return {
    ok: true as const,
    items: [
      {
        workspaceId: 'workspace-a',
        workspaceName: 'Workspace A',
        workspaceType: 'team' as const,
        workspaceMemberId: 'member-a',
        role: 'member' as const,
        memberStatus: 'active' as const,
        lifecycleState: 'active' as const,
      },
      {
        workspaceId: 'workspace-b',
        workspaceName: 'Workspace B',
        workspaceType: 'team' as const,
        workspaceMemberId: 'member-b',
        role: 'member' as const,
        memberStatus: 'active' as const,
        lifecycleState: 'active' as const,
      },
    ],
  };
}

function captureWorkspaceEventsHandler(
  sinks: WorkspaceEventSinksByWorkspace,
  sends: Array<ReturnType<typeof vi.fn>>,
) {
  let handler: ((req: any, res: any) => Promise<void>) | undefined;
  const app = {
    get(path: string, candidate: (req: any, res: any) => Promise<void>) {
      if (path === '/api/workspace/events') handler = candidate;
    },
    post() {},
    put() {},
    delete() {},
  };
  registerCollabContextRoutes(app as unknown as express.Express, {
    workspaceContext: createDevWorkspaceContextProvider(),
    fetchWorkspaceDirectory: async () => directory(),
    createSseResponse: () => {
      const send = vi.fn(() => true);
      sends.push(send);
      return { send };
    },
    workspaceEventSinks: sinks,
  });
  if (!handler) throw new Error('workspace events route not registered');
  return handler;
}

function responseDouble() {
  return {
    statusCode: 200,
    body: null as unknown,
    listeners: new Map<string, () => void>(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    on(name: string, listener: () => void) {
      this.listeners.set(name, listener);
      return this;
    },
  };
}

describe('GET /api/workspace/events exact authority', () => {
  it('freshly verifies the exact navigation pair before registering a sink', async () => {
    const sinks: WorkspaceEventSinksByWorkspace = new Map();
    const sends: Array<ReturnType<typeof vi.fn>> = [];
    const handler = captureWorkspaceEventsHandler(sinks, sends);
    const res = responseDouble();

    await handler({
      query: {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-other',
      },
      get: () => undefined,
    }, res);

    expect(res.statusCode).toBe(403);
    expect(sinks.size).toBe(0);
    expect(sends).toHaveLength(0);
  });

  it('partitions delivery by verified workspace instead of broadcasting globally', async () => {
    const sinks: WorkspaceEventSinksByWorkspace = new Map();
    const sends: Array<ReturnType<typeof vi.fn>> = [];
    const handler = captureWorkspaceEventsHandler(sinks, sends);

    for (const [workspaceId, workspaceMemberId] of [
      ['workspace-a', 'member-a'],
      ['workspace-b', 'member-b'],
    ]) {
      await handler({
        query: { workspaceId, workspaceMemberId },
        get: () => undefined,
      }, responseDouble());
    }

    expect(sinks.size).toBe(2);
    expect(emitWorkspaceEventToScope(
      sinks,
      'workspace-a',
      { type: 'members-changed', at: 1 },
    )).toBe(true);
    expect(sends[0]).toHaveBeenCalledWith(
      'members-changed',
      { type: 'members-changed', at: 1 },
    );
    expect(sends[1]).not.toHaveBeenCalledWith(
      'members-changed',
      { type: 'members-changed', at: 1 },
    );
  });
});
