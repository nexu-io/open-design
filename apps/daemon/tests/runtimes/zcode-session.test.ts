import { describe, expect, it } from 'vitest';

import type {
  ZcodeProtocolRequest,
  ZcodeProtocolResponse,
} from '../../src/runtimes/zcode-protocol.js';
import {
  startZcodeProtocolTurn,
  type ZcodeProtocolClientLike,
  ZcodeResumeSessionMissingError,
} from '../../src/runtimes/zcode-session.js';
import type { ZcodeSavedProviderSelection } from '../../src/runtimes/zcode-config.js';

type Frame = Record<string, unknown>;

class FakeZcodeClient implements ZcodeProtocolClientLike {
  notifications = new Set<(frame: Frame) => void>();
  requests: ZcodeProtocolRequest[] = [];
  responses: Array<{ id: string; result: Record<string, unknown> }> = [];

  async request(request: ZcodeProtocolRequest): Promise<ZcodeProtocolResponse> {
    this.requests.push(request);
    if (request.method === 'session/create') {
      return { id: request.id, result: { session: { sessionId: 'sess_123' } } };
    }
    if (request.method === 'session/resume') {
      return {
        id: request.id,
        result: { session: { sessionId: String(request.params.sessionId ?? '') } },
      };
    }
    return { id: request.id, result: { ok: true } };
  }

  onNotification(listener: (frame: Frame) => void): () => void {
    this.notifications.add(listener);
    return () => {
      this.notifications.delete(listener);
    };
  }

  respond(id: string, result: Record<string, unknown>): void {
    this.responses.push({ id, result });
  }

  emit(frame: Frame): void {
    for (const listener of this.notifications) listener(frame);
  }
}

function requestAt(client: FakeZcodeClient, index: number): ZcodeProtocolRequest {
  const request = client.requests[index];
  if (!request) throw new Error(`missing request at index ${index}`);
  return request;
}

const providerSelection: ZcodeSavedProviderSelection = {
  model: {
    providerId: 'builtin:bigmodel',
    modelId: 'GLM-5.2',
  },
  provider: {
    providerId: 'builtin:bigmodel',
    kind: 'anthropic',
    source: 'custom',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    apiKey: { source: 'inline', value: 'saved-key' },
    models: [{ modelId: 'GLM-5.2' }],
  },
};

describe('startZcodeProtocolTurn', () => {
  it('runs the app-server handshake, subscribes, and sends the prompt', async () => {
    const client = new FakeZcodeClient();
    const events: Frame[] = [];

    const started = await startZcodeProtocolTurn({
      client,
      cwd: '/tmp/open-design-project',
      mode: 'yolo',
      onEvent: (event) => events.push(event),
      prompt: 'hello',
      providerSelection,
    });

    expect(started.sessionId).toBe('sess_123');
    expect(client.requests.map((request) => request.method)).toEqual([
      'workspace/upsertModelProvider',
      'workspace/setDefaultModel',
      'session/create',
      'session/setMode',
      'session/subscribe',
      'session/send',
    ]);
    expect(requestAt(client, 0).params).toMatchObject({
      workspace: {
        workspacePath: '/tmp/open-design-project',
        workspaceKey: 'od-open-design-project',
      },
      provider: providerSelection.provider,
    });
    expect(requestAt(client, 1).params).toMatchObject({
      model: providerSelection.model,
    });
    expect(requestAt(client, 3).params).toEqual({ sessionId: 'sess_123', mode: 'yolo' });
    expect(requestAt(client, 4).params).toEqual({
      sessionId: 'sess_123',
      deliveryKind: 'desktop-continuous',
    });
    expect(requestAt(client, 5).params).toEqual({ sessionId: 'sess_123', content: 'hello' });

    client.emit({
      method: 'session/event',
      params: { payload: { kind: 'text_delta', delta: 'hi' } },
    });
    expect(events).toEqual([{ type: 'text_delta', delta: 'hi' }]);
  });

  it('answers provider runtime header requests while continuing to stream events', async () => {
    const client = new FakeZcodeClient();
    const events: Frame[] = [];

    await startZcodeProtocolTurn({
      client,
      cwd: '/tmp/project',
      onEvent: (event) => events.push(event),
      prompt: 'hello',
      providerSelection,
      workspaceKey: 'workspace-key',
    });

    client.emit({
      id: 'srv-1',
      method: 'interaction/requestProviderRuntimeHeaders',
      params: { reason: 'model_request' },
    });
    client.emit({ method: 'state.updated', params: { reason: 'prompt_started' } });

    expect(client.responses).toEqual([
      { id: 'srv-1', result: { headersApplied: true } },
    ]);
    expect(events).toEqual([{ type: 'status', label: 'running' }]);
  });

  it('answers runtime preference requests with the compatible defaults', async () => {
    const client = new FakeZcodeClient();

    await startZcodeProtocolTurn({
      client,
      cwd: '/tmp/project',
      onEvent: () => undefined,
      prompt: 'hello',
      providerSelection,
    });

    client.emit({
      id: 'srv-runtime-preferences',
      method: 'session/requestRuntimePreferences',
      params: {
        sessionId: 'sess_123',
        scope: 'runtime-materialization',
      },
    });

    expect(client.responses).toEqual([
      {
        id: 'srv-runtime-preferences',
        result: {
          nativeSearchEnhancementsEnabled: true,
          memoryEnabled: false,
          askUserQuestionAutoResolutionEnabled: true,
          modelContextBudgetStrategy: 'preflight-v1',
        },
      },
    ]);
  });

  it('resumes an existing session id without creating a fresh session', async () => {
    const client = new FakeZcodeClient();

    const started = await startZcodeProtocolTurn({
      client,
      cwd: '/tmp/open-design-project',
      mode: 'yolo',
      onEvent: () => undefined,
      prompt: 'follow-up',
      providerSelection,
      resumeSessionId: 'sess_existing',
    });

    expect(started.sessionId).toBe('sess_existing');
    expect(client.requests.map((request) => request.method)).toEqual([
      'workspace/upsertModelProvider',
      'workspace/setDefaultModel',
      'session/resume',
      'session/setMode',
      'session/subscribe',
      'session/send',
    ]);
    expect(requestAt(client, 2).params).toEqual({
      sessionId: 'sess_existing',
      workspace: {
        workspacePath: '/tmp/open-design-project',
        workspaceKey: 'od-open-design-project',
      },
    });
    expect(requestAt(client, 3).params).toEqual({ sessionId: 'sess_existing', mode: 'yolo' });
    expect(requestAt(client, 4).params).toEqual({
      sessionId: 'sess_existing',
      deliveryKind: 'desktop-continuous',
    });
    expect(requestAt(client, 5).params).toEqual({ sessionId: 'sess_existing', content: 'follow-up' });
  });

  it('throws a typed resume-missing error when session/resume is gone', async () => {
    const client = new FakeZcodeClient();
    client.request = async (request: ZcodeProtocolRequest) => {
      client.requests.push(request);
      if (request.method === 'session/resume') {
        throw new Error('zcode app-server returned error: session not found');
      }
      return { id: request.id, result: { ok: true } };
    };

    await expect(
      startZcodeProtocolTurn({
        client,
        cwd: '/tmp/open-design-project',
        mode: 'yolo',
        onEvent: () => undefined,
        prompt: 'follow-up',
        providerSelection,
        resumeSessionId: 'sess_missing',
      }),
    ).rejects.toMatchObject({
      name: 'ZcodeResumeSessionMissingError',
      sessionId: 'sess_missing',
    } satisfies Partial<ZcodeResumeSessionMissingError>);
    expect(client.notifications.size).toBe(0);
  });

  it('unsubscribes notifications when setup fails', async () => {
    const client = new FakeZcodeClient();
    client.request = async (request: ZcodeProtocolRequest) => {
      client.requests.push(request);
      if (request.method === 'workspace/setDefaultModel') {
        throw new Error('default failed');
      }
      return { id: request.id, result: { ok: true } };
    };

    await expect(
      startZcodeProtocolTurn({
        client,
        cwd: '/tmp/project',
        onEvent: () => undefined,
        prompt: 'hello',
        providerSelection,
      }),
    ).rejects.toThrow('default failed');
    expect(client.notifications.size).toBe(0);
  });
});
