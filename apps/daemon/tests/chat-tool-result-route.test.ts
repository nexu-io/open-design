import express from 'express';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { registerChatRoutes } from '../src/chat-routes.js';

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

function baseDeps(calls: unknown[][] = []) {
  return {
    agents: {
      getAgentDef: () => undefined,
      isKnownModel: () => false,
      listProviderModels: () => [],
      sanitizeCustomModel: (model: unknown) => model,
      testAgentConnection: async () => ({ ok: true }),
      testProviderConnection: async () => ({ ok: true }),
    },
    chat: {
      submitToolResultToRun: (...args: unknown[]) => {
        calls.push(args);
        return { ok: true };
      },
    },
    critique: {
      critiqueArtifactsRoot: '',
      critiqueResponseCapBytes: 0,
      critiqueRunRegistry: new Map(),
      handleCritiqueArtifact: () => (_req: express.Request, res: express.Response) =>
        res.status(501).end(),
      handleCritiqueInterrupt: () => (_req: express.Request, res: express.Response) =>
        res.status(501).end(),
    },
    db: {},
    design: {
      runs: {
        cancel: () => undefined,
        get: () => null,
        list: () => [],
        statusBody: (run: unknown) => run,
        stream: () => undefined,
      },
    },
    http: {
      createSseResponse: () => undefined,
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
        extras: Record<string, unknown> = {},
      ) => res.status(status).json({ error: { code, message, ...extras } }),
    },
    lifecycle: {},
    paths: {},
    telemetry: {},
    validation: {},
  };
}

async function startChatRouteServer(calls: unknown[][] = []): Promise<string> {
  const app = express();
  app.use(express.json());
  registerChatRoutes(app, baseDeps(calls) as any);
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected listen address');
  return `http://127.0.0.1:${address.port}`;
}

describe('chat tool-result route', () => {
  it('rejects a body runId that disagrees with the path run id before submission', async () => {
    const calls: unknown[][] = [];
    const baseUrl = await startChatRouteServer(calls);

    const response = await fetch(`${baseUrl}/api/runs/run-a/tool-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'answer',
        runId: 'run-b',
        toolUseId: 'tool-1',
      }),
    });
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'runId must match the path run id',
    });
    expect(calls).toEqual([]);
  });

  it('uses the path run id as the authoritative run id', async () => {
    const calls: unknown[][] = [];
    const baseUrl = await startChatRouteServer(calls);

    const response = await fetch(`${baseUrl}/api/runs/run-a/tool-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'answer',
        runId: 'run-a',
        toolUseId: 'tool-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([['run-a', 'tool-1', 'answer', false]]);
  });
});
