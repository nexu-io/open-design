import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerChatRoutes } from '../src/routes/chat.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  const toClose = server;
  server = null;
  await new Promise<void>((resolve) => toClose.close(() => resolve()));
});

async function startChatServer(options: {
  authorizeProjectRequest: any;
  run?: {
    id: string;
    projectId: string | null;
    conversationId: string | null;
    assistantMessageId: string | null;
  } | null;
  reportFeedback?: any;
  onArtifact?: any;
  onInterrupt?: any;
}) {
  const app = express();
  app.use(express.json());
  const reportFeedback =
    options.reportFeedback ??
    vi.fn(async () => ({ status: 'accepted' as const }));
  const onArtifact = options.onArtifact ?? vi.fn();
  const onInterrupt = options.onInterrupt ?? vi.fn();
  registerChatRoutes(app, {
    db: {},
    design: {
      runs: {
        get: () => options.run ?? null,
      },
    },
    http: {
      createSseResponse: () => ({
        send: () => true,
        end: () => undefined,
      }),
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
        details?: Record<string, unknown>,
      ) => res.status(status).json({ error: code, message, ...details }),
    },
    paths: {},
    chat: {},
    agents: {},
    critique: {
      critiqueArtifactsRoot: '/tmp/unused',
      critiqueResponseCapBytes: 1024,
      critiqueRunRegistry: {},
      handleCritiqueArtifact: () => (_req: express.Request, res: express.Response) => {
        onArtifact();
        res.status(200).send('artifact');
      },
      handleCritiqueInterrupt: () => (_req: express.Request, res: express.Response) => {
        onInterrupt();
        res.status(202).json({ accepted: true });
      },
    },
    appConfig: { readAppConfig: async () => ({}) },
    validation: {},
    lifecycle: { isDaemonShuttingDown: () => false },
    telemetry: { reportFeedback },
    authorizeProjectRequest: options.authorizeProjectRequest,
  } as any);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    reportFeedback,
    onArtifact,
    onInterrupt,
  };
}

describe('chat-owned project route authority', () => {
  it.each([
    {
      label: 'SenseAudio while Workspace authority is unavailable',
      path: '/api/proxy/senseaudio/stream',
    },
    {
      label: 'AIHubMix while the signed-in AMR identity is unavailable',
      path: '/api/proxy/aihubmix/stream',
    },
  ])('keeps the local BYOK tool loop available for $label', async ({
    path,
  }) => {
    const authorizeProjectRequest = vi.fn(
      async (_req, res: express.Response) => {
        res.status(503).json({ error: 'WORKSPACE_AUTHORITY_UNAVAILABLE' });
        return false;
      },
    );
    const api = await startChatServer({ authorizeProjectRequest });

    const response = await fetch(`${api.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: 'test-key',
        model: 'test-model',
        projectId: 'project-a',
        // Once the BYOK route has deliberately bypassed cloud Workspace
        // authority, ordinary provider URL validation is the next boundary.
        baseUrl: 'not-a-url',
        messages: [],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'BAD_REQUEST',
    });
    expect(authorizeProjectRequest).not.toHaveBeenCalled();
  });

  it('keeps an unbound legacy BYOK project request compatible', async () => {
    const authorizeProjectRequest = vi.fn(async () => true);
    const api = await startChatServer({ authorizeProjectRequest });

    const response = await fetch(
      `${api.baseUrl}/api/proxy/senseaudio/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'test-key',
          model: 'test-model',
          projectId: 'legacy-project',
          baseUrl: 'not-a-url',
          messages: [],
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'BAD_REQUEST' });
    expect(authorizeProjectRequest).not.toHaveBeenCalled();
  });

  it('authorizes artifact navigation through the unified project read gate', async () => {
    const authorizeProjectRequest = vi.fn(
      async (_req, res: express.Response) => {
        res.status(403).json({ error: 'WORKSPACE_PROJECT_PERMISSION_DENIED' });
        return false;
      },
    );
    const api = await startChatServer({ authorizeProjectRequest });

    const response = await fetch(
      `${api.baseUrl}/api/projects/project-a/critique/run-a/artifact`
      + '?workspaceId=workspace-a&workspaceMemberId=member-a',
    );

    expect(response.status).toBe(403);
    expect(api.onArtifact).not.toHaveBeenCalled();
    expect(authorizeProjectRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'project-a',
      { mode: 'read', allowNavigationQuery: true },
    );
  });

  it('authorizes interrupts through the unified project write gate before mutation', async () => {
    const authorizeProjectRequest = vi.fn(
      async (_req, res: express.Response) => {
        res.status(403).json({ error: 'WORKSPACE_PROJECT_PERMISSION_DENIED' });
        return false;
      },
    );
    const api = await startChatServer({ authorizeProjectRequest });

    const response = await fetch(
      `${api.baseUrl}/api/projects/project-a/critique/run-a/interrupt`,
      {
        method: 'POST',
        headers: {
          'x-od-workspace-id': 'workspace-a',
          'x-od-workspace-member-id': 'member-a',
        },
      },
    );

    expect(response.status).toBe(403);
    expect(api.onInterrupt).not.toHaveBeenCalled();
    expect(authorizeProjectRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'project-a',
      { mode: 'write', capability: 'writeFiles' },
    );
  });

  it('authorizes feedback against the run authoritative project before telemetry', async () => {
    const authorizeProjectRequest = vi.fn(
      async (_req, res: express.Response) => {
        res.status(403).json({ error: 'WORKSPACE_PROJECT_PERMISSION_DENIED' });
        return false;
      },
    );
    const api = await startChatServer({
      authorizeProjectRequest,
      run: {
        id: 'run-a',
        projectId: 'project-a',
        conversationId: 'conversation-a',
        assistantMessageId: 'message-a',
      },
    });

    const response = await fetch(`${api.baseUrl}/api/runs/run-a/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-workspace-id': 'workspace-a',
        'x-od-workspace-member-id': 'member-a',
      },
      body: JSON.stringify({
        rating: 'positive',
        reasonCodes: ['matched_request'],
        hasCustomReason: false,
        customReason: '',
      }),
    });

    expect(response.status).toBe(403);
    expect(api.reportFeedback).not.toHaveBeenCalled();
    expect(authorizeProjectRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'project-a',
      { mode: 'write', capability: 'writeFiles' },
    );
  });

  it('rejects caller-owned feedback identity fields instead of accepting spoofed metadata', async () => {
    const authorizeProjectRequest = vi.fn(async () => true);
    const api = await startChatServer({
      authorizeProjectRequest,
      run: {
        id: 'run-a',
        projectId: 'project-a',
        conversationId: 'conversation-a',
        assistantMessageId: 'message-a',
      },
    });

    const response = await fetch(`${api.baseUrl}/api/runs/run-a/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-b',
        conversationId: 'conversation-b',
        assistantMessageId: 'message-b',
        rating: 'negative',
        reasonCodes: ['missed_request'],
        hasCustomReason: false,
        customReason: '',
      }),
    });

    expect(response.status).toBe(400);
    expect(api.reportFeedback).not.toHaveBeenCalled();
  });

  it('derives feedback metadata from the run after exact authorization', async () => {
    const authorizeProjectRequest = vi.fn(async () => true);
    const api = await startChatServer({
      authorizeProjectRequest,
      run: {
        id: 'run-a',
        projectId: 'project-a',
        conversationId: 'conversation-a',
        assistantMessageId: 'message-a',
      },
    });

    const response = await fetch(`${api.baseUrl}/api/runs/run-a/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-workspace-id': 'workspace-a',
        'x-od-workspace-member-id': 'member-a',
      },
      body: JSON.stringify({
        rating: 'positive',
        reasonCodes: ['matched_request'],
        hasCustomReason: true,
        customReason: 'clear result',
      }),
    });

    expect(response.status).toBe(202);
    expect(api.reportFeedback).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-a',
      scoreMetadata: {
        projectId: 'project-a',
        conversationId: 'conversation-a',
        assistantMessageId: 'message-a',
        hasCustomReason: true,
        customReason: 'clear result',
      },
    }));
  });
});
