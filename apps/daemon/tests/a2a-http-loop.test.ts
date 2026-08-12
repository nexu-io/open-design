import express from 'express';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerA2ARoutes } from '../src/routes/a2a.js';

let server: http.Server;
let baseUrl: string;
const userMessages: string[] = [];
let runCount = 0;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/projects', (_req, res) => {
    res.json({ project: { id: 'project-1' }, conversationId: 'conversation-1' });
  });
  app.put('/api/projects/:projectId/conversations/:conversationId/messages/:messageId', (req, res) => {
    userMessages.push(String(req.body?.content ?? ''));
    res.json({ message: req.body });
  });
  app.post('/api/runs', (_req, res) => {
    runCount += 1;
    res.json({ runId: `run-${runCount}` });
  });
  app.get('/api/runs/:runId', (req, res) => {
    res.json({
      id: req.params.runId,
      status: 'succeeded',
      ...(req.params.runId === 'run-1' ? {
        questionForm: {
          schemaVersion: 1,
          form: {
            id: 'discovery',
            title: 'Design direction',
            questions: [{
              id: 'tone',
              label: 'Visual tone',
              type: 'radio',
              required: true,
              allowCustom: false,
              options: [{ label: 'Bold', value: 'bold' }],
            }],
          },
        },
        questionFormDiagnostic: { source: 'tool-result', repaired: false },
      } : {}),
      ...(req.params.runId === 'run-2' ? {
        outputPolicy: {
          mode: 'single-html',
          validation: 'passed',
          repaired: true,
          warnings: [],
          entryFile: 'index.html',
        },
      } : {}),
    });
  });
  app.get('/api/runs/:runId/events', (req, res) => {
    const text = req.params.runId === 'run-1'
      ? `I need one answer.
<question-form id="discovery" title="Design direction">
{"questions":[{"id":"tone","label":"Visual tone","type":"radio","required":true,"allowCustom":false,"options":[{"label":"Bold","value":"bold"}]}]}
</question-form>`
      : 'The design is ready.';
    res.type('text/event-stream').send(
      `event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: text })}\n\n`,
    );
  });
  app.get('/api/projects/:projectId', (req, res) => {
    res.json({
      project: {
        id: req.params.projectId,
        metadata: { entryFile: 'index.html' },
      },
    });
  });
  app.get('/api/projects/:projectId/files', (_req, res) => {
    res.json({ files: [{ name: 'index.html', mime: 'text/html', size: 100 }] });
  });
  app.get('/api/mcp/install-info', (_req, res) => {
    res.json({ webBaseUrl: baseUrl });
  });

  const daemonUrlRef: { current: string | null } = { current: null };
  registerA2ARoutes(app, {
    daemonUrlRef,
    appVersion: 'test',
    pollIntervalMs: 0,
    publicBaseUrl: (req) => `${req.protocol}://${req.get('host')}`,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server has no TCP port');
      baseUrl = `http://127.0.0.1:${address.port}`;
      daemonUrlRef.current = baseUrl;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Open Design A2A HTTP multi-turn loop', () => {
  it('completes Question Form clarification over the v1 JSON-RPC wire', async () => {
    const started = await rpc('SendMessage', {
      message: {
        messageId: 'message-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Create a bold landing page.', mediaType: 'text/plain' }],
      },
      configuration: { returnImmediately: true, historyLength: 100 },
      metadata: { openDesign: { projectName: 'HTTP loop' } },
    });
    const startedTask = requireRecord(started.task, 'started task');
    const taskId = requireString(startedTask.id, 'task id');
    const contextId = requireString(startedTask.contextId, 'context id');

    const waiting = await waitForWireState(taskId, 'TASK_STATE_INPUT_REQUIRED');
    const formPart = wireParts(waiting.status).find((part) =>
      part.mediaType === 'application/vnd.open-design.question-form+json');
    expect(formPart?.data).toMatchObject({
      schemaVersion: 1,
      form: { id: 'discovery' },
    });

    const resumed = await rpc('SendMessage', {
      message: {
        messageId: 'message-2',
        taskId,
        contextId,
        role: 'ROLE_USER',
        parts: [{
          data: {
            schemaVersion: 1,
            formId: 'discovery',
            answers: { tone: 'bold' },
          },
          mediaType: 'application/vnd.open-design.question-form-answer+json',
        }],
      },
      configuration: { returnImmediately: true, historyLength: 100 },
    });
    const resumedTask = requireRecord(resumed.task, 'resumed task');
    expect(resumedTask.id).toBe(taskId);
    expect(resumedTask.contextId).toBe(contextId);

    const completed = await waitForWireState(taskId, 'TASK_STATE_COMPLETED');
    expect(completed.id).toBe(taskId);
    expect(completed.contextId).toBe(contextId);
    expect(completed.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactId: `${taskId}-result`,
        parts: expect.arrayContaining([
          expect.objectContaining({
            mediaType: 'application/vnd.open-design.artifact+json',
            data: expect.objectContaining({
              projectId: 'project-1',
              conversationId: 'conversation-1',
              runId: 'run-2',
              outputPolicy: expect.objectContaining({
                mode: 'single-html',
                validation: 'passed',
              }),
            }),
          }),
        ]),
      }),
    ]));
    expect(userMessages).toEqual([
      'Create a bold landing page.',
      '[form answers — discovery]\n- Visual tone: Bold [value: bold]',
    ]);
  });
});

async function waitForWireState(taskId: string, state: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = await rpc('GetTask', { id: taskId, historyLength: 100 });
    if (wireState(task.status) === state) return task;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`task ${taskId} did not reach ${state}`);
}

async function rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/a2a`, {
    method: 'POST',
    headers: { 'A2A-Version': '1.0', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}`, method, params }),
  });
  expect(response.status).toBe(200);
  const payload = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? 'A2A JSON-RPC error');
  if (!isRecord(payload.result)) throw new Error('A2A JSON-RPC result is not an object');
  return payload.result;
}

function wireState(status: unknown): string | undefined {
  return isRecord(status) && typeof status.state === 'string' ? status.state : undefined;
}

function wireParts(status: unknown): Array<Record<string, unknown>> {
  if (!isRecord(status) || !isRecord(status.message) || !Array.isArray(status.message.parts)) return [];
  return status.message.parts.filter(isRecord);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`missing ${label}`);
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`missing ${label}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
