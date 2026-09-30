import type { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createZcodeProtocolClient } from '../../src/runtimes/zcode-protocol.js';

type FakeChild = ChildProcess & {
  stderr: PassThrough;
  stdin: PassThrough;
  stdout: PassThrough;
};

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  return child;
}

describe('createZcodeProtocolClient', () => {
  const clients: Array<{ dispose(): void }> = [];

  afterEach(() => {
    for (const client of clients) client.dispose();
    clients.length = 0;
  });

  it('writes a jsonl request and resolves the matching response id', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    let stdinPayload = '';
    child.stdin?.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });

    const pending = client.request({
      id: 'req-1',
      method: 'session/list',
      params: {},
    });

    child.stdout?.write('not json\n');
    child.stdout?.write(`${JSON.stringify({ id: 'other', result: { sessions: [] } })}\n`);
    child.stdout?.write(`${JSON.stringify({ id: 'req-1', result: { sessions: [] } })}\n`);

    await expect(pending).resolves.toMatchObject({
      id: 'req-1',
      result: { sessions: [] },
    });
    expect(stdinPayload).toBe(
      `${JSON.stringify({ id: 'req-1', method: 'session/list', params: {} })}\n`,
    );
  });

  it('rejects when zcode responds with a protocol error', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const pending = client.request({
      id: 'req-2',
      method: 'session/list',
      params: {},
    });

    child.stdout?.write(
      `${JSON.stringify({ id: 'req-2', error: { message: 'not logged in' } })}\n`,
    );

    await expect(pending).rejects.toThrow(
      'zcode app-server returned error: not logged in',
    );
  });

  it('rejects pending requests when the child closes before responding', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const pending = client.request({
      id: 'req-3',
      method: 'session/list',
      params: {},
    });

    child.stderr?.write('boom');
    child.emit('close', 1, null);

    await expect(pending).rejects.toThrow(
      'zcode app-server exited before responding. stderr: boom',
    );
  });

  it('rejects pending requests on asynchronous stdin write failures', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const pending = client.request({
      id: 'req-stdin-error',
      method: 'session/list',
      params: {},
    });

    child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));

    await expect(pending).rejects.toThrow('zcode app-server stdin failed: write EPIPE');
  });

  it('dispatches async notification frames (no pending id) to registered listeners', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const received = new Promise<Record<string, unknown>>((resolve) =>
      client.onNotification(resolve),
    );

    child.stdout?.write(
      `${JSON.stringify({
        method: 'session/event',
        params: { seq: 1, payload: { kind: 'text_delta', delta: 'hi' } },
      })}\n`,
    );

    await expect(received).resolves.toMatchObject({
      method: 'session/event',
      params: { payload: { kind: 'text_delta', delta: 'hi' } },
    });
  });

  it('delivers server→client request frames (method + non-pending id) to listeners', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const received = new Promise<Record<string, unknown>>((resolve) =>
      client.onNotification(resolve),
    );

    child.stdout?.write(
      `${JSON.stringify({
        id: 'srv-1',
        method: 'interaction/requestProviderRuntimeHeaders',
        params: { requestId: 'r1' },
      })}\n`,
    );

    await expect(received).resolves.toMatchObject({
      id: 'srv-1',
      method: 'interaction/requestProviderRuntimeHeaders',
    });
  });

  it('routes id-matched responses to requests, never to notification listeners', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const notifications: Array<Record<string, unknown>> = [];
    client.onNotification((frame) => notifications.push(frame));

    const pending = client.request({
      id: 'req-x',
      method: 'session/list',
      params: {},
    });

    child.stdout?.write(
      `${JSON.stringify({ method: 'state.updated', params: { reason: 'prompt_started' } })}\n`,
    );
    child.stdout?.write(`${JSON.stringify({ id: 'req-x', result: { sessions: [] } })}\n`);

    await expect(pending).resolves.toMatchObject({ id: 'req-x' });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ method: 'state.updated' });
  });

  it('stops delivering notifications after unsubscribe and after dispose', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const afterUnsub: Array<Record<string, unknown>> = [];
    const unsubscribe = client.onNotification((frame) => afterUnsub.push(frame));
    unsubscribe();

    child.stdout?.write(`${JSON.stringify({ method: 'session/event', params: { seq: 1 } })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(afterUnsub).toHaveLength(0);

    const afterDispose: Array<Record<string, unknown>> = [];
    client.onNotification((frame) => afterDispose.push(frame));
    client.dispose();

    child.stdout?.write(`${JSON.stringify({ method: 'session/event', params: { seq: 2 } })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(afterDispose).toHaveLength(0);
  });

  it('respond writes an { id, result } answer frame to stdin', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    let stdinPayload = '';
    child.stdin?.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });

    client.respond('srv-1', { headersApplied: true });

    expect(stdinPayload).toBe(
      `${JSON.stringify({ id: 'srv-1', result: { headersApplied: true } })}\n`,
    );
  });

  it('answers a server→client request received via onNotification', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    let stdinPayload = '';
    child.stdin?.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });

    client.onNotification((frame) => {
      if (frame.method === 'interaction/requestProviderRuntimeHeaders') {
        client.respond(String(frame.id), { headersApplied: true });
      }
    });

    child.stdout?.write(
      `${JSON.stringify({
        id: 'srv-9',
        method: 'interaction/requestProviderRuntimeHeaders',
        params: { requestId: 'r9' },
      })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stdinPayload).toBe(
      `${JSON.stringify({ id: 'srv-9', result: { headersApplied: true } })}\n`,
    );
  });

  it('handles asynchronous stdin errors after server→client response writes', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const pending = client.request({
      id: 'req-during-respond',
      method: 'session/list',
      params: {},
    });

    expect(() => client.respond('srv-epipe', { headersApplied: true })).not.toThrow();
    expect(() =>
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })),
    ).not.toThrow();

    await expect(pending).rejects.toThrow('zcode app-server stdin failed: write EPIPE');
  });

  it('respond throws after dispose', () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    client.dispose();

    expect(() => client.respond('srv-1', { headersApplied: true })).toThrow(
      'zcode protocol client already disposed',
    );
  });

  it('aborts an in-flight request when the signal fires', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const controller = new AbortController();
    const pending = client.request(
      { id: 'req-abort', method: 'session/send', params: {} },
      10_000,
      controller.signal,
    );

    controller.abort(new Error('run cancelled'));
    await expect(pending).rejects.toThrow('run cancelled');

    // A late response for the now-aborted id must be safely ignored.
    expect(() =>
      child.stdout?.write(`${JSON.stringify({ id: 'req-abort', result: { ok: true } })}\n`),
    ).not.toThrow();
  });

  it('rejects immediately for an already-aborted signal without writing to stdin', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    let stdinPayload = '';
    child.stdin?.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });

    const controller = new AbortController();
    controller.abort(new Error('already gone'));

    await expect(
      client.request(
        { id: 'req-pre', method: 'session/list', params: {} },
        10_000,
        controller.signal,
      ),
    ).rejects.toThrow('already gone');
    expect(stdinPayload).toBe('');
  });

  it('detaches the abort listener once a response settles the request', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    const controller = new AbortController();
    const pending = client.request(
      { id: 'req-settle', method: 'session/list', params: {} },
      10_000,
      controller.signal,
    );

    child.stdout?.write(`${JSON.stringify({ id: 'req-settle', result: { sessions: [] } })}\n`);
    await expect(pending).resolves.toMatchObject({
      id: 'req-settle',
      result: { sessions: [] },
    });

    // Aborting after the request already resolved must be a harmless no-op.
    expect(() => controller.abort(new Error('too late'))).not.toThrow();
  });

  it('rejects with a timeout error when no response arrives', async () => {
    const child = createFakeChild();
    const client = createZcodeProtocolClient(child);
    clients.push(client);

    await expect(
      client.request({ id: 'req-timeout', method: 'session/list', params: {} }, 5),
    ).rejects.toThrow('Timed out waiting for zcode app-server response');
  });
});
