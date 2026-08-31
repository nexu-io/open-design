import { createServer, type ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import {
  PACKAGED_OD_NEXT_FILE,
  PACKAGED_OD_NEXT_OUTPUT,
  readPackagedOdNextViaHttp,
  startPackagedOdNextViaHttp,
} from '@/vitest/packaged-od-next-smoke';

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

describe('packaged OD Next smoke contract', () => {
  it('[P0] drives the active automatic task and reads its terminal packaged artifact evidence', async () => {
    const writes: Array<{ method: string; path: string; value: unknown }> = [];
    const taskExecutionId = 'odnext-packaged-smoke';
    const server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? '/', 'http://packaged.test');
        const method = request.method ?? 'GET';
        let value: unknown = null;
        if (method !== 'GET') {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          writes.push({ method, path: url.pathname, value });
        }

        if (method === 'GET' && url.pathname === '/api/app-config') {
          json(response, 200, { config: { onboardingCompleted: true, agentId: 'codex' } });
        } else if (method === 'PUT' && url.pathname === '/api/app-config') {
          json(response, 200, { config: value });
        } else if (method === 'GET' && url.pathname === '/api/strategies/od-next/rollout') {
          json(response, 200, { status: { effectiveMode: 'active', requestedMode: 'active' } });
        } else if (method === 'POST' && url.pathname === '/api/projects') {
          json(response, 200, {
            appliedPluginSnapshotId: 'automatic-snapshot',
            conversationId: 'packaged-conversation',
            project: { metadata: { strategyBinding: { taskProfile: 'prototype' } } },
          });
        } else if (method === 'POST' && url.pathname === '/api/runs') {
          json(response, 200, {
            runId: 'planning-run',
            taskExecutionId,
            strategyTask: { inputStage: 'request', terminal: false },
          });
        } else if (method === 'GET' && url.pathname === '/api/runs/planning-run') {
          json(response, 200, {
            status: 'succeeded',
            strategyTask: {
              activeRunId: 'production-run',
              outcome: 'completed',
              taskExecutionId,
              terminal: true,
            },
          });
        } else if (method === 'GET' && url.pathname === '/api/runs') {
          json(response, 200, {
            runs: [
              { strategyTask: { taskExecutionId } },
              { strategyTask: { taskExecutionId } },
            ],
          });
        } else if (
          method === 'GET'
          && url.pathname.endsWith(`/files/${PACKAGED_OD_NEXT_FILE}`)
        ) {
          response.writeHead(200, { 'content-type': 'text/html' });
          response.end('<h1>OD Next Active Canary</h1>');
        } else if (method === 'GET' && url.pathname.endsWith('/messages')) {
          json(response, 200, { messages: [{ role: 'assistant', content: PACKAGED_OD_NEXT_OUTPUT }] });
        } else {
          json(response, 404, { error: 'not found' });
        }
      })().catch((error: unknown) => {
        json(response, 500, { error: error instanceof Error ? error.message : String(error) });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (address == null || typeof address === 'string') throw new Error('mock server has no TCP address');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const start = await startPackagedOdNextViaHttp(baseUrl);
      expect(start).toMatchObject({
        appliedPluginSnapshotId: 'automatic-snapshot',
        configStatus: 200,
        conversationId: 'packaged-conversation',
        effectiveMode: 'active',
        initialInputStage: 'request',
        initialTerminal: false,
        projectStatus: 200,
        requestedMode: 'active',
        runId: 'planning-run',
        runStatus: 200,
        strategyTaskProfile: 'prototype',
        taskExecutionId,
      });
      expect(writes.find((write) => write.path === '/api/app-config')?.value).toMatchObject({
        agentId: 'codex',
        odNextStrategyMode: 'active',
        onboardingCompleted: true,
      });
      expect(writes.find((write) => write.path === '/api/projects')?.value).toMatchObject({
        automaticStrategyTaskProfile: 'prototype',
        conversationMode: 'design',
        metadata: { kind: 'prototype' },
        skipDiscoveryBrief: true,
      });
      expect(writes.find((write) => write.path === '/api/projects')?.value).not.toHaveProperty('pluginId');

      await expect(readPackagedOdNextViaHttp(baseUrl, start)).resolves.toEqual({
        activeRunId: 'production-run',
        assistantContainsExpectedOutput: true,
        fileContainsExpectedHeading: true,
        fileStatus: 200,
        outcome: 'completed',
        physicalRunCount: 2,
        status: 'succeeded',
        taskExecutionId,
        terminal: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error == null ? resolve() : reject(error));
      });
    }
  });
});
